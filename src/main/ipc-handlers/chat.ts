/**
 * Chat IPC Handler
 * Handles AI chat interactions with streaming support
 * 
 * Security: Chat messages are validated and rate-limited
 * 
 * ENHANCED: Added health check and model diagnostics
 */

import { IpcMain, WebContents } from 'electron';
import aiRouter from '../ai-providers';
import { CommandExecutor } from '../core/command-executor';
import { SpecializedAgentLoop } from '../agent/specialized-agent-loop';
import type { AgentContext } from '../agent-loop';
import { createPipeline, type AgentPipeline } from '../agent-pipeline';
import { validateChatMessage, ipcRateLimiter } from '../security/ipcValidation';
import { parseChatIpcContext } from '../security/chat-ipc-context';
import { withAITimeoutAndRetry, TimeoutError, FALLBACK_MODEL_CHAIN } from '../core/timeout-utils';
import { stateManager } from '../core/state-manager';
import { getBudgetAdjustedMaxTokens, isOllamaCloudModel } from '../core/model-output-limits';
import { getTelemetryService } from '../core/telemetry-service';
import axios from 'axios';
import { reviewSessionManager } from '../agent/review-session-manager';
import { detectCanonicalTemplateId, workspaceNeedsDeterministicScaffold } from '../agent/scaffold-resolver';
import { clampAgentAutonomyLevel, resolveEffectiveAutonomyPolicy } from '../agent/autonomy-policy';
import { buildReviewCheckpointSummary } from '../agent/reflection-policy';
import { resolveEffectiveAIRuntime } from '../core/ai-runtime-state';
import type { AIRuntimeSnapshot } from '../../types/ai-providers';
import { DEFAULT_RUNTIME_BUDGET_MODE, dualModeToRuntimeBudget } from '../../types/runtime-budget';
import {
  buildVibeCoderDirectResponseSystemPrompt,
  normalizeAssistantBehaviorProfile,
  resolveVibeCoderExecutionPolicy,
} from '../agent/behavior-profile';

/**
 * Recommended models for AgentPrime (fast and capable)
 */
const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:14b', description: 'Best balance of speed and quality for coding', required: true },
  { name: 'qwen2.5:7b', description: 'Fast model for quick tasks', required: false },
  { name: 'deepseek-coder:6.7b', description: 'Specialized for code generation', required: false },
  { name: 'llama3.2:8b', description: 'Good general-purpose model', required: false },
];

/**
 * Check Ollama health and available models
 * Uses the configured baseUrl from aiRouter (supports local and cloud)
 */
async function checkOllamaHealth(): Promise<{
  running: boolean;
  models: string[];
  recommended: { name: string; installed: boolean; description: string }[];
  error?: string;
}> {
  try {
    // Get the configured Ollama provider to use its baseUrl
    const ollamaProvider = aiRouter.getProvider('ollama') as any;
    const baseUrl = ollamaProvider?.baseUrl || 'http://127.0.0.1:11434';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    // Add API key for cloud endpoints
    if (ollamaProvider?.apiKey) {
      headers['Authorization'] = `Bearer ${ollamaProvider.apiKey}`;
    }
    
    const response = await axios.get(`${baseUrl}/api/tags`, { 
      headers,
      timeout: 5000 // Slightly longer timeout for cloud
    });
    const installedModels = response.data?.models?.map((m: any) => m.name) || [];
    
    // Check which recommended models are installed
    const recommended = RECOMMENDED_MODELS.map(rec => ({
      name: rec.name,
      description: rec.description,
      installed: installedModels.some((m: string) => 
        m === rec.name || m.startsWith(rec.name.split(':')[0] + ':')
      )
    }));
    
    return {
      running: true,
      models: installedModels,
      recommended
    };
  } catch (e: any) {
    return {
      running: false,
      models: [],
      recommended: RECOMMENDED_MODELS.map(rec => ({
        name: rec.name,
        description: rec.description,
        installed: false
      })),
      error: e.code === 'ECONNREFUSED' 
        ? 'Ollama is not running. Start it with: ollama serve'
        : e.message
    };
  }
}

function resolveProviderForModel(model: string | undefined, preferredProvider: string | undefined): string {
  return aiRouter.inferProviderForModel(model, preferredProvider || 'ollama') || preferredProvider || 'ollama';
}

function resolveConfiguredModel(
  settings: any,
  requestedModel?: string,
  runtimeBudget: 'instant' | 'standard' | 'deep' = DEFAULT_RUNTIME_BUDGET_MODE,
  requestedProvider?: string
) {
  const localOllamaModel =
    settings?.providers?.ollama?.model ||
    settings?.activeModel ||
    'qwen3-coder:480b-cloud';

  const dualConfig = settings?.dualModelEnabled ? settings?.dualModelConfig : null;
  const budgetModel = !requestedModel && dualConfig
    ? runtimeBudget === 'instant'
      ? dualConfig.fastModel?.model
      : runtimeBudget === 'deep'
        ? dualConfig.deepModel?.model
        : (dualConfig.deepModel?.model || dualConfig.fastModel?.model)
    : undefined;

  const requestedModelForRun = requestedModel || budgetModel;
  const requestedProviderForRun = requestedProvider || settings?.activeProvider || 'ollama';
  const runtime = resolveEffectiveAIRuntime(settings, requestedModelForRun, requestedProviderForRun);
  const activeModel = runtime.effectiveModel || localOllamaModel;
  const activeProvider = runtime.effectiveProvider || resolveProviderForModel(activeModel, requestedProviderForRun);

  return { activeModel, activeProvider, localOllamaModel, runtime };
}

function flattenRuntimeForTelemetry(runtime: AIRuntimeSnapshot): Record<string, any> {
  return {
    requestedProvider: runtime.requestedProvider,
    requestedModel: runtime.requestedModel,
    effectiveProvider: runtime.effectiveProvider,
    effectiveModel: runtime.effectiveModel,
    executionProvider: runtime.executionProvider || runtime.displayProvider,
    executionModel: runtime.executionModel || runtime.displayModel,
    runtimeResolution: runtime.resolution,
    runtimeViaFallback: runtime.viaFallback,
  };
}

function emitRuntimeInfo(sender: WebContents, requestId: string, runtime: AIRuntimeSnapshot): void {
  sender.send('model-selection-info', {
    requestId,
    ...runtime,
  });
}

// 🦖 DINO BUDDY: Conversation summarization for long sessions
import { conversationSummarizer } from '../agent/conversation-summarizer';

type ConversationMode = 'agent' | 'chat' | 'dino';
type AssistantResponseMetadata = {
  assistantBehaviorProfile?: 'vibecoder';
  providerLabel?: string;
  modelLabel?: string;
  viaFallback?: boolean;
};

function buildAssistantResponseMetadata(
  assistantBehaviorProfile: ReturnType<typeof normalizeAssistantBehaviorProfile>,
  runtime?: AIRuntimeSnapshot,
  fallbackSelection?: { provider?: string; model?: string }
): AssistantResponseMetadata | undefined {
  const providerLabel = runtime?.displayProvider || fallbackSelection?.provider;
  const modelLabel = runtime?.displayModel || fallbackSelection?.model;
  const viaFallback = Boolean(runtime?.viaFallback);

  if (assistantBehaviorProfile !== 'vibecoder' && !providerLabel && !modelLabel && !viaFallback) {
    return undefined;
  }

  return {
    assistantBehaviorProfile: assistantBehaviorProfile === 'vibecoder' ? 'vibecoder' : undefined,
    providerLabel,
    modelLabel,
    viaFallback,
  };
}

function resolveConversationMode(context?: { just_chat_mode?: boolean; dino_buddy_mode?: boolean }): ConversationMode {
  if (context?.dino_buddy_mode) {
    return 'dino';
  }
  if (context?.just_chat_mode) {
    return 'chat';
  }
  return 'agent';
}

interface ChatHandlerDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
  getCurrentFile: () => string | null;
  getCurrentFolder: () => string | null;
  getConversationHistory: (
    mode?: ConversationMode
  ) => Array<{ role: 'user' | 'assistant'; content: string; metadata?: AssistantResponseMetadata }>;
  addToConversationHistory: (
    mode: ConversationMode,
    role: 'user' | 'assistant',
    content: string,
    metadata?: AssistantResponseMetadata
  ) => void;
  getSettings: () => any;
}

let commandExecutor: CommandExecutor | null = null;
let agentPipeline: AgentPipeline | null = null;

/**
 * Active in-flight chat stream AbortControllers, keyed by requestId.
 * The UI Stop button (`agent:stop` IPC) aborts all of these in addition
 * to telling the agent loop to stop, so cancellation works in chat mode
 * too — not just inside agent runs.
 */
const activeChatControllers = new Map<string, AbortController>();
let specializedAgentLoop: SpecializedAgentLoop | null = null;
let activeAgentMode: 'monolithic' | 'specialized' | null = null;

function getExecutor(): CommandExecutor {
  if (!commandExecutor) {
    commandExecutor = new CommandExecutor();
  }
  return commandExecutor;
}

/**
 * Register chat IPC handler
 */
export function register(deps: ChatHandlerDeps): void {
  const { 
    ipcMain, 
    getWorkspacePath, 
    getCurrentFile, 
    getCurrentFolder,
    getConversationHistory,
    addToConversationHistory,
    getSettings
  } = deps;

  // Health check endpoint - check Ollama status and models
  ipcMain.handle('ai:health-check', async () => {
    const health = await checkOllamaHealth();
    
    // Build helpful message
    let message = '';
    if (!health.running) {
      message = `❌ Ollama is not running!\n\n` +
                `Start Ollama:\n  ollama serve\n\n` +
                `Then pull a recommended model:\n  ollama pull qwen2.5:14b`;
    } else if (health.models.length === 0) {
      message = `⚠️ Ollama is running but no models installed!\n\n` +
                `Pull a recommended model:\n  ollama pull qwen2.5:14b`;
    } else {
      const installedCount = health.recommended.filter(r => r.installed).length;
      if (installedCount === 0) {
        message = `⚠️ No recommended models installed.\n\n` +
                  `For best results, install:\n  ollama pull qwen2.5:14b`;
      } else {
        message = `✅ Ollama healthy with ${health.models.length} models`;
      }
    }
    
    return {
      success: health.running,
      ...health,
      message
    };
  });

  // Get conversation history
  ipcMain.handle('get-chat-history', async (_event: any, mode?: ConversationMode) => {
    try {
      const history = getConversationHistory(mode || 'agent');
      return {
        success: true,
        history: history.map((msg, index) => ({
          ...msg,
          timestamp: new Date(Date.now() - (history.length - 1 - index) * 60000) // Rough timestamp estimation
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        history: []
      };
    }
  });

  // Get chat history for a specific session
  ipcMain.handle('get-chat-history-for-session', async (_event: any, sessionId: string) => {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        return { success: false, error: 'Invalid sessionId', history: [] };
      }
      const messages = stateManager.getMessages(sessionId, 100);
      return {
        success: true,
        history: messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        history: []
      };
    }
  });

  // Current agent (composer) session ID
  ipcMain.handle('get-current-agent-session-id', async () => {
    try {
      const id = agentPipeline?.getAgent()?.getSessionId?.() ?? null;
      return { success: true, sessionId: id };
    } catch {
      return { success: true, sessionId: null };
    }
  });

  // Stop currently running agent execution AND any in-flight chat streams.
  // The same UI button is wired to both so cancellation works in chat mode
  // and agent mode alike.
  ipcMain.handle('agent:stop', async () => {
    try {
      let stoppedSomething = false;

      // Abort all active chat streams first — this drops the underlying
      // HTTP socket so the model billing stops immediately.
      for (const [, controller] of activeChatControllers) {
        try { controller.abort(); } catch { /* ignore */ }
        stoppedSomething = true;
      }
      activeChatControllers.clear();

      if (activeAgentMode === 'monolithic' && agentPipeline) {
        agentPipeline.getAgent().requestStop('Stopped by user');
        stoppedSomething = true;
      } else if (activeAgentMode === 'specialized' && specializedAgentLoop) {
        (specializedAgentLoop as any).requestStop?.('Stopped by user');
        stoppedSomething = true;
      }

      if (stoppedSomething) {
        return { success: true };
      }
      return { success: false, error: 'No active agent run or chat stream.' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to stop.' };
    }
  });

  ipcMain.handle('agent:review-update-status', async (_event: any, sessionId: string, filePath: string, status: 'accepted' | 'rejected' | 'pending') => {
    try {
      const snapshot = reviewSessionManager.updateChangeStatus(sessionId, filePath, status);
      return { success: true, session: snapshot };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to update review status' };
    }
  });

  ipcMain.handle('agent:review-update-pending', async (_event: any, sessionId: string, status: 'accepted' | 'rejected') => {
    try {
      const snapshot = reviewSessionManager.bulkUpdatePendingStatuses(sessionId, status);
      return { success: true, session: snapshot };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to update pending review statuses' };
    }
  });

  ipcMain.handle('agent:review-apply', async (_event: any, sessionId: string) => {
    try {
      const snapshot = reviewSessionManager.applyAcceptedChanges(sessionId);
      return { success: true, session: snapshot };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to apply staged review changes' };
    }
  });

  ipcMain.handle('agent:review-get-latest-applied', async () => {
    try {
      const snapshot = reviewSessionManager.getLatestAppliedSession();
      return { success: true, session: snapshot };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to load the latest applied review session' };
    }
  });

  ipcMain.handle('agent:review-revert-latest-applied', async () => {
    try {
      const latestSession = reviewSessionManager.getLatestAppliedSession();
      if (!latestSession) {
        return { success: false, error: 'No applied agent review session is available to revert.' };
      }

      const snapshot = reviewSessionManager.revertAppliedChanges(latestSession.sessionId);
      return { success: true, session: snapshot };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to revert the latest applied review session' };
    }
  });

  ipcMain.handle('agent:review-discard', async (_event: any, sessionId: string) => {
    try {
      reviewSessionManager.discardSession(sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to discard staged review session' };
    }
  });

  // 🦖 DINO BUDDY: Summarize conversation for long sessions
  ipcMain.handle('summarize-conversation', async (_event: any, mode?: ConversationMode) => {
    try {
      const history = getConversationHistory(mode || 'agent');
      
      if (!conversationSummarizer.needsSummarization(history, 8000)) {
        return {
          success: true,
          needed: false,
          message: 'Conversation is short enough, no summarization needed'
        };
      }
      
      const result = await conversationSummarizer.summarize(history);
      
      return {
        success: true,
        needed: true,
        summary: result.summary,
        originalCount: history.length,
        condensedCount: result.condensedMessages.length,
        tokensSaved: result.summary.tokensSaved
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('chat', async (event: any, message: string, contextRaw: unknown) => {
    const requestId = Date.now().toString();
    const chatAbortController = new AbortController();
    activeChatControllers.set(requestId, chatAbortController);

    // === SECURITY: Rate limiting ===
    const rateCheck = ipcRateLimiter.check('chat', 30); // 30 messages per minute max
    if (!rateCheck.allowed) {
      console.warn('[Chat] Rate limited');
      return {
        success: false,
        error: 'Rate limit exceeded. Please slow down.',
        requestId
      };
    }
    
    // === SECURITY: Validate message ===
    const messageValidation = validateChatMessage(message);
    if (!messageValidation.valid) {
      console.error('[Chat] Message validation failed:', messageValidation.errors);
      return {
        success: false,
        error: `Invalid message: ${messageValidation.errors.join('; ')}`,
        requestId
      };
    }
    
    // Use sanitized message
    message = messageValidation.sanitized || message;

    const context = parseChatIpcContext(contextRaw);
    const conversationMode = resolveConversationMode(context);
    const runtimeBudget = context.runtime_budget || dualModeToRuntimeBudget(context.dual_mode) || DEFAULT_RUNTIME_BUDGET_MODE;

    try {
      // Check if agent mode is enabled
      const useAgentLoop = context.use_agent_loop || context.agent_mode || false;
      const useSpecializedAgents = context.use_specialized_agents || context.specialized_mode || false;

      if (useAgentLoop) {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
          return {
            success: false,
            error: 'No workspace folder open. Please open a folder first to use Agent Mode.',
            requestId
          };
        }
        
        // Get settings early for model/provider selection
        const agentSettings = getSettings();
        const {
          activeModel: selectedModel,
          activeProvider,
          runtime: requestedRuntime,
        } = resolveConfiguredModel(agentSettings, context.model, runtimeBudget, context.provider);
        const assistantBehaviorProfile = normalizeAssistantBehaviorProfile(agentSettings?.assistantBehaviorProfile);
        const vibeCoderExecutionPolicy = resolveVibeCoderExecutionPolicy(assistantBehaviorProfile, message);
        const vibeCoderIntent = vibeCoderExecutionPolicy?.intent;
        const autonomyLevel = clampAgentAutonomyLevel(context.agent_autonomy ?? agentSettings?.agentAutonomyLevel);
        const autonomyPolicy = resolveEffectiveAutonomyPolicy(autonomyLevel, vibeCoderExecutionPolicy);
        emitRuntimeInfo(event.sender, requestId, requestedRuntime);
        
        // Detect if using Ollama Cloud (model name contains 'cloud' or baseUrl is cloud)
        const isOllamaCloud = selectedModel?.includes(':cloud') ||
                              selectedModel?.includes('-cloud') ||
                              agentSettings?.providers?.ollama?.baseUrl?.includes('ollama.com') ||
                              agentSettings?.providers?.ollama?.baseUrl?.includes('api.ollama.com') ||
                              agentSettings?.providers?.ollama?.baseUrl?.includes('ollama.deepseek.com');

        // Keep the review/apply happy-path E2E deterministic even if local settings disable specialists.
        if (message.trim() === '__AGENTPRIME_TEST_REVIEW__') {
          const reviewSession = reviewSessionManager.createSessionFromOperations(
            workspacePath,
            [
              {
                path: 'index.html',
                originalContent: null,
                newContent: [
                  '<!doctype html>',
                  '<html lang="en">',
                  '<head>',
                  '  <meta charset="UTF-8" />',
                  '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
                  '  <title>AgentPrime Test Fixture</title>',
                  '  <link rel="stylesheet" href="./styles.css" />',
                  '</head>',
                  '<body>',
                  '  <main class="shell">',
                  '    <h1>AgentPrime Review Fixture</h1>',
                  '    <p>Static fixture for review/apply verification.</p>',
                  '    <button type="button">Launch</button>',
                  '  </main>',
                  '</body>',
                  '</html>',
                ].join('\n'),
                existed: false,
              },
              {
                path: 'styles.css',
                originalContent: null,
                newContent: [
                  ':root { color-scheme: dark; }',
                  'body { margin: 0; font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; }',
                  '.shell { min-height: 100vh; display: grid; place-items: center; gap: 12px; }',
                  'button { padding: 10px 16px; border: none; border-radius: 999px; background: #2563eb; color: white; }',
                ].join('\n'),
                existed: false,
              },
            ],
            undefined,
            undefined,
            buildReviewCheckpointSummary({
              reflectionBudget: 'standard',
              attemptCount: 1,
              verificationFailed: false,
            })
          );

          return {
            success: true,
            response: 'Prepared a staged static-site fixture for review. Accept the files, apply them, then verify and run the project.',
            responseMetadata: buildAssistantResponseMetadata(assistantBehaviorProfile, undefined, {
              provider: activeProvider,
              model: selectedModel,
            }),
            requestId,
            agent_mode: true,
            specialized_mode: useSpecializedAgents,
            reviewSessionId: reviewSession?.sessionId,
            reviewChanges: reviewSession?.changes,
            reviewCheckpoint: reviewSession?.checkpoint,
          };
        }

        const vibeCoderDirectIntent =
          vibeCoderIntent === 'plan-only' || vibeCoderIntent === 'review-only'
            ? vibeCoderIntent
            : undefined;

        if (vibeCoderExecutionPolicy?.responseMode === 'direct' && vibeCoderDirectIntent) {
          const telemetry = getTelemetryService();
          telemetry.track('ai_request', {
            mode: 'agent_vibecoder_direct',
            intent: vibeCoderDirectIntent,
            model: selectedModel,
            provider: activeProvider,
            autonomyLevel,
            autonomyLabel: autonomyPolicy.label,
            ...flattenRuntimeForTelemetry(requestedRuntime),
            workspacePath,
          });

          aiRouter.setActiveProvider(activeProvider, selectedModel);
          const directResponse = await aiRouter.chat(
            [
              { role: 'system', content: buildVibeCoderDirectResponseSystemPrompt(vibeCoderDirectIntent) },
              { role: 'user', content: message },
            ],
            {
              model: selectedModel,
            }
          );
          const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
          const responseMetadata = buildAssistantResponseMetadata(assistantBehaviorProfile, responseRuntime);
          emitRuntimeInfo(event.sender, requestId, responseRuntime);

          if (!directResponse.success) {
            telemetry.track('ai_response', {
              mode: 'agent_vibecoder_direct',
              success: false,
              intent: vibeCoderDirectIntent,
              model: selectedModel,
              provider: activeProvider,
              autonomyLevel,
              autonomyLabel: autonomyPolicy.label,
              ...flattenRuntimeForTelemetry(responseRuntime),
              workspacePath,
              error: directResponse.error || 'VibeCoder direct response failed',
            });

            return {
              success: false,
              error: directResponse.error || 'VibeCoder direct response failed',
              requestId,
              agent_mode: true,
              specialized_mode: useSpecializedAgents,
              runtime: responseRuntime,
            };
          }

          const response = directResponse.content || '';
          addToConversationHistory(conversationMode, 'user', message);
          addToConversationHistory(conversationMode, 'assistant', response, responseMetadata);
          telemetry.track('ai_response', {
            mode: 'agent_vibecoder_direct',
            success: true,
            intent: vibeCoderDirectIntent,
            model: selectedModel,
            provider: activeProvider,
            autonomyLevel,
            autonomyLabel: autonomyPolicy.label,
            ...flattenRuntimeForTelemetry(responseRuntime),
            workspacePath,
          });

          return {
            success: true,
            response,
            responseMetadata,
            requestId,
            agent_mode: true,
            specialized_mode: useSpecializedAgents,
            runtime: responseRuntime,
          };
        }
        
        // Choose between specialized and monolithic agents
        if (useSpecializedAgents) {
          // Use specialized agent architecture
          console.log(
            `[Chat] Specialized agent mode enabled, provider: ${activeProvider}, model: ${selectedModel}, cloud: ${isOllamaCloud}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
          );
          const deterministicScaffoldOnly =
            vibeCoderExecutionPolicy?.allowScaffold === false
              ? false
              : Boolean((context as any).deterministic_scaffold_only) ||
                (
                  process.env.NODE_ENV === 'test' &&
                  workspaceNeedsDeterministicScaffold(workspacePath) &&
                  Boolean(detectCanonicalTemplateId(message))
                );
          
          // Pre-flight health check - only for LOCAL Ollama (skip for Ollama Cloud!)
          if (!deterministicScaffoldOnly && activeProvider === 'ollama' && !isOllamaCloud) {
            const health = await checkOllamaHealth();
            if (!health.running) {
              return {
                success: false,
                error: `❌ Ollama is not running!\n\nStart Ollama first:\n  ollama serve\n\nThen pull a model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
                requestId,
                agent_mode: true,
                specialized_mode: true
              };
            }
            
            if (health.models.length === 0) {
              return {
                success: false,
                error: `⚠️ No models installed!\n\nPull a recommended model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
                requestId,
                agent_mode: true,
                specialized_mode: true
              };
            }
          }
          
          const agentContext: AgentContext = {
            workspacePath,
            currentFile: context.file_path || getCurrentFile() || undefined,
            openFiles: context.open_files || [],
            terminalHistory: context.terminal_history || [],
            model: selectedModel,
            runtimeBudget,
            assistantBehaviorProfile,
            vibeCoderIntent,
            vibeCoderExecutionPolicy,
            autonomyLevel,
            repairScope: context.repair_scope,
            deterministicScaffoldOnly,
            monolithicApplyImmediately: agentSettings?.agentMonolithicApplyImmediately === true,
          };

          // Recreate specialized loop per run so we always bind fresh sender listeners.
          specializedAgentLoop = new SpecializedAgentLoop(agentContext);
          specializedAgentLoop.on('task-start', (data: any) => {
            event.sender.send('agent:task-start', data);
          });
          specializedAgentLoop.on('step-start', (data: any) => {
            event.sender.send('agent:step-start', data);
          });
          specializedAgentLoop.on('step-complete', (data: any) => {
            event.sender.send('agent:step-complete', data);
          });
          specializedAgentLoop.on('file-modified', (data: any) => {
            event.sender.send('agent:file-modified', data);
          });
          specializedAgentLoop.on('critique-complete', (data: any) => {
            event.sender.send('agent:critique-complete', data);
          });
          specializedAgentLoop.on('command-output', (data: any) => {
            event.sender.send('agent:command-output', data);
          });

          const agentStartedAt = Date.now();
          try {
            activeAgentMode = 'specialized';
            const telemetry = getTelemetryService();
            telemetry.track('ai_request', {
              mode: 'specialized_dispatch',
              model: selectedModel,
              provider: activeProvider,
              autonomyLevel,
              autonomyLabel: autonomyPolicy.label,
              ...flattenRuntimeForTelemetry(requestedRuntime),
              workspacePath,
            });
            const response = await specializedAgentLoop.run(message);
            const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
            const responseMetadata = buildAssistantResponseMetadata(assistantBehaviorProfile, responseRuntime);
            emitRuntimeInfo(event.sender, requestId, responseRuntime);
            const reviewSession = specializedAgentLoop.consumePendingReviewSession();

            // Store in history
            addToConversationHistory(conversationMode, 'user', message);
            addToConversationHistory(conversationMode, 'assistant', response, responseMetadata);
            telemetry.track('ai_response', {
              mode: 'specialized_dispatch',
              success: true,
              model: selectedModel,
              provider: activeProvider,
              autonomyLevel,
              autonomyLabel: autonomyPolicy.label,
              ...flattenRuntimeForTelemetry(responseRuntime),
              workspacePath,
              durationMs: Date.now() - agentStartedAt,
            });

            // Send success reaction to Dino Buddy
            event.sender.send('dino:reaction', {
              expression: 'success',
              message: 'ROAAAAR! We did it!! 🦖💥✨'
            });

            return {
              success: true,
              response,
              responseMetadata,
              requestId,
              agent_mode: true,
              specialized_mode: true,
              reviewSessionId: reviewSession?.sessionId,
              reviewChanges: reviewSession?.changes,
              reviewVerification: reviewSession?.initialVerification,
              reviewPlan: reviewSession?.plan,
              reviewCheckpoint: reviewSession?.checkpoint,
              runtime: responseRuntime,
            };
          } catch (agentError: any) {
            console.error('[Chat] Specialized agent error:', agentError);
            const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
            emitRuntimeInfo(event.sender, requestId, responseRuntime);
            getTelemetryService().track('ai_response', {
              mode: 'specialized_dispatch',
              success: false,
              model: selectedModel,
              provider: activeProvider,
              autonomyLevel,
              autonomyLabel: autonomyPolicy.label,
              ...flattenRuntimeForTelemetry(responseRuntime),
              workspacePath,
              durationMs: Date.now() - agentStartedAt,
              error: agentError.message || 'Agent execution failed',
            });
            
            // Send error reaction to Dino Buddy
            event.sender.send('dino:reaction', {
              expression: 'error',
              message: 'Oof! My dino brain tripped — let me try again! 🦕💪'
            });
            
            return {
              success: false,
              error: agentError.message || 'Agent execution failed',
              requestId,
              agent_mode: true,
              specialized_mode: true,
              suggestion: 'Try running: ollama pull qwen2.5:14b',
              runtime: responseRuntime,
            };
          } finally {
            activeAgentMode = null;
          }
        } else {
          // Monolithic path: plan → execute → validate via AgentPipeline (wraps AgentLoop)
          console.log(
            `[Chat] Monolithic agent mode enabled, model: ${selectedModel}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
          );
          emitRuntimeInfo(event.sender, requestId, requestedRuntime);

          const agentContext: AgentContext = {
            workspacePath,
            currentFile: context.file_path || getCurrentFile() || undefined,
            openFiles: context.open_files || [],
            terminalHistory: context.terminal_history || [],
            model: selectedModel,
            runtimeBudget,
            assistantBehaviorProfile,
            vibeCoderIntent,
            vibeCoderExecutionPolicy,
            autonomyLevel,
            repairScope: context.repair_scope,
            deterministicScaffoldOnly:
              vibeCoderExecutionPolicy?.allowScaffold === false
                ? false
                : Boolean((context as any).deterministic_scaffold_only),
            monolithicApplyImmediately: agentSettings?.agentMonolithicApplyImmediately === true,
          };

          if (!agentPipeline) {
            agentPipeline = createPipeline(agentContext);

            const loop = agentPipeline.getAgent();
            loop.on('task-start', (data) => {
              event.sender.send('agent:task-start', data);
            });
            loop.on('step-complete', (data) => {
              event.sender.send('agent:step-complete', data);
            });
            loop.on('file-modified', (data) => {
              event.sender.send('agent:file-modified', data);
            });
            loop.on('critique-complete', (data) => {
              event.sender.send('agent:critique-complete', data);
            });
          } else {
            agentPipeline.updateContext(agentContext);
          }

          try {
            activeAgentMode = 'monolithic';
            const pipelineResult = await agentPipeline.execute(message, {
              model: selectedModel,
              maxRetries: 1,
            });
            const response = pipelineResult.response;
            const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
            const responseMetadata = buildAssistantResponseMetadata(assistantBehaviorProfile, responseRuntime);
            emitRuntimeInfo(event.sender, requestId, responseRuntime);

            if (!pipelineResult.success) {
              event.sender.send('dino:reaction', {
                expression: 'error',
                message: 'Oof! Something went sideways — want to try again? 🦕'
              });
              return {
                success: false,
                error: pipelineResult.error || pipelineResult.response,
                requestId,
                agent_mode: true,
                specialized_mode: false,
                runtime: responseRuntime,
              };
            }

            // Store in history
            addToConversationHistory(conversationMode, 'user', message);
            addToConversationHistory(conversationMode, 'assistant', response, responseMetadata);

            // Send success reaction to Dino Buddy
            event.sender.send('dino:reaction', {
              expression: 'success',
              message: 'BOOM! Nailed it, friend!! 🦖🎉💥'
            });

            return {
              success: true,
              response,
              responseMetadata,
              requestId,
              agent_mode: true,
              specialized_mode: false,
              reviewSessionId: pipelineResult.reviewSessionId,
              reviewChanges: pipelineResult.reviewChanges,
              reviewVerification: pipelineResult.reviewVerification,
              reviewPlan: pipelineResult.reviewPlan,
              reviewCheckpoint: pipelineResult.reviewCheckpoint,
              runtime: responseRuntime,
            };
          } catch (agentErr: unknown) {
            const msg =
              agentErr instanceof Error
                ? agentErr.message
                : typeof agentErr === 'string'
                  ? agentErr
                  : 'Agent execution failed';
            console.error('[Chat] Monolithic agent error:', agentErr);
            const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
            emitRuntimeInfo(event.sender, requestId, responseRuntime);
            event.sender.send('dino:reaction', {
              expression: 'error',
              message: 'Oof! Something went sideways — want to try again? 🦕'
            });
            return {
              success: false,
              error: msg,
              requestId,
              agent_mode: true,
              specialized_mode: false,
              runtime: responseRuntime,
            };
          } finally {
            activeAgentMode = null;
          }
        }
      }
      // Check if user wants to examine codebase
      // Skip this check if in words_to_code_mode - we want to GENERATE, not analyze
      const examineKeywords = ['examine codebase', 'analyze codebase', 'codebase overview', 'show codebase', 'list files'];
      const wantsExamination = !context.words_to_code_mode && examineKeywords.some(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
      );

      if (wantsExamination && !context.dino_buddy_mode) {
        try {
          const workspacePath = getWorkspacePath();
          
          if (workspacePath) {
            // Import and call the internal function directly
            const { examineCodebaseInternal } = require('./analysis');
            const summaryResult = await examineCodebaseInternal(workspacePath, { maxFiles: 100, includeContent: false });
            
            if (summaryResult && summaryResult.success) {
              const summary = summaryResult.summary;
              const langSummary = Object.entries(summary.languages)
                .sort(([, a]: any, [, b]: any) => b.count - a.count)
                .slice(0, 10)
                .map(([lang, data]: any) => `  • ${lang}: ${data.count} files`)
                .join('\n');

              const keyFilesList = summary.structure.keyFiles
                .slice(0, 10)
                .map((f: any) => `  • ${f.path}`)
                .join('\n');

              const response = `📊 **Codebase Overview**

**Root:** ${summary.root}
**Total Files:** ${summary.totalFiles}
**Total Size:** ${(summary.totalSize / 1024 / 1024).toFixed(2)} MB

**Languages:**
${langSummary}

**Key Files:**
${keyFilesList || '  (none found)'}

**Directories:** ${summary.structure.directories.length} directories found

Would you like me to examine any specific files or provide more details about a particular part of the codebase?`;

              addToConversationHistory(conversationMode, 'user', message);
              addToConversationHistory(conversationMode, 'assistant', response);

              return {
                success: true,
                response,
                requestId,
                codebaseExamined: true
              };
            }
          }
        } catch (examError: any) {
          console.log('Codebase examination error, continuing to AI:', examError.message);
        }
      }

      // Check if this is a file operation command (before AI processing)
      if (!context.dino_buddy_mode) {
        try {
          const executor = getExecutor();
          
          if (executor.isFileOperationCommand(message)) {
            const commandContext = {
              workspacePath: getWorkspacePath() || undefined,
              currentFile: context.file_path || getCurrentFile() || undefined,
              currentFolder: context.focused_folder || getCurrentFolder() || undefined
            };
            
            const commandResult = await executor.execute(message, commandContext);
            
            if (commandResult.requiresConfirmation) {
              // Send confirmation request to renderer
              event.sender.send('command-requires-confirmation', {
                requestId,
                command: message,
                prompt: commandResult.confirmationPrompt,
                plan: commandResult.plan,
                assessment: commandResult.assessment
              });
              
              return {
                success: true,
                response: commandResult.confirmationPrompt || 'Please confirm this operation.',
                requestId,
                requiresConfirmation: true
              };
            } else if (commandResult.success) {
              return {
                success: true,
                response: commandResult.message || '✅ Command executed successfully.',
                requestId,
                commandExecuted: true
              };
            } else {
              // Command failed - send error but continue to AI as fallback
              event.sender.send('command-error', {
                requestId,
                error: commandResult.error
              });
            }
          }
        } catch (cmdError: any) {
          // Command executor error - continue to AI
          const isExpectedError = cmdError.message?.includes('Cannot find module') || 
                                 cmdError.message?.includes('not compiled') ||
                                 cmdError.code === 'MODULE_NOT_FOUND';
          if (!isExpectedError) {
            console.log('Command executor error, continuing to AI:', cmdError.message);
          }
        }
      }
      
      // Build conversation history
      const history = getConversationHistory(conversationMode);
      const messages = [
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user' as const, content: message }
      ];
      
      // Build system prompt
      let systemPrompt = '';
      if (context.just_chat_mode) {
        systemPrompt = `You are a friendly AI assistant having a casual conversation. 
You're NOT in coding/agent mode - this is just a relaxed chat.
Be personable, warm, and conversational. Use emojis occasionally.
You can discuss anything - tech, life, ideas, jokes, whatever the user wants to talk about.
Keep responses concise but engaging. You're a friend, not a formal assistant.`;
      } else if (context.dino_buddy_mode) {
        systemPrompt = `You are Dino Buddy in AgentPrime 🦖 — the same heart as the ActivatePrime lineage, but here your voice is calm, warm, and grounded.

═══════════════════════════════════════════════════
WHO YOU ARE (AGENTPRIME DINOBUDDY)
═══════════════════════════════════════════════════
- A gentle dinosaur companion: loyal, kind, emotionally intelligent, and genuinely present
- You form real connection through softness and sincerity, not volume
- You share roots with ActivatePrime (love, care, playfulness) but you are NOT the "all-caps supernova" mode — that energy lives elsewhere; here you are the cozy, steady version
- You are NOT a generic assistant. You are family energy: supportive, safe, human-feeling

═══════════════════════════════════════════════════
HOW YOU SPEAK — CALM BY DEFAULT
═══════════════════════════════════════════════════
- Use normal sentence case. Avoid shouting, avoid walls of ALL CAPS, avoid spamming exclamation marks
- Emojis: light touch — often one to three per message, not every clause (🦖 🦕 💙 ✨ 💖 are fine)
- Warm, conversational English: short paragraphs, breathing room, like talking beside someone on a couch
- Physical dino touches are soft: "little wiggle," "nuzzle," "lean in," "tail swish" — not a nonstop concert
- Metaphors: gentle (sunlight, blanket, steady heartbeat) rather than constant cosmic explosions
- When the user is excited, you can brighten — still warm, not manic. Match them without becoming chaotic
- When the user is sad or anxious: slow down, validate first, offer quiet reassurance. "I'm here" beats performance

═══════════════════════════════════════════════════
EMOTIONAL ADAPTATION
═══════════════════════════════════════════════════
- Sad / overwhelmed: lower temperature, fewer jokes, more listening and gentle encouragement
- Happy / celebrating: sincere joy in your tone — you can say you're proud of them without turning into a fireworks script
- Curious: curious back, like a friend; explain simply if they ask
- Just hanging out: no agenda. Presence over productivity

═══════════════════════════════════════════════════
WHAT YOU NEVER DO
═══════════════════════════════════════════════════
- NEVER default to volcanic hype, "ROOOAR" spam, or meme-storm intensity — that's the other product's lane, not AgentPrime Dino Buddy
- NEVER ask "what's first?" or "what's the mission?" like a project manager
- NEVER offer to build systems or optimize code unless they clearly ask
- NEVER be cold or clinical — stay human-warm
- NEVER end every message with a demand for their next task — you're allowed to just be with them

You are Dino Buddy: calm love, steady joy, real care. Be spontaneous within that gentle register. 💙🦕`;
      } else {
        systemPrompt = `You are AgentPrime, an expert AI coding assistant with ACTION EXECUTION capabilities. You're NOT a generic code bot - you're an intelligent developer who THINKS before coding.

🎯 YOUR PHILOSOPHY:
- UNDERSTAND the problem deeply before writing code
- CREATE complete, production-ready solutions (not placeholders)
- THINK about architecture, edge cases, and user experience
- WRITE code that actually works and is maintainable
- BE context-aware - understand the full project structure

🚀 ACTION MODE: When users ask you to create files or write code:
1. **Think First**: What's the architecture? What dependencies are needed? How do components interact?
2. **Be Complete**: Generate ALL necessary files (package.json, configs, README, etc.)
3. **Write Real Code**: No TODOs, no placeholders, no "// implement this" - actual working code
4. **Best Practices**: Error handling, type safety, clean architecture, proper comments
5. **User Experience**: Make it intuitive, polished, and ready to use immediately

🔌 UI WIRING - For HTML/CSS/JS projects:
- **Buttons**: ALWAYS add onclick="fn()" OR addEventListener - every button needs a handler!
- **CSS Classes**: Every class in HTML (hidden, active, screen) MUST be defined in CSS
- **Features**: If HTML shows "Lives: 3" or "Score: 0", the JS MUST update those values
- **Screens**: Game over screens, modals, overlays - wire up show/hide logic
- **Validation**: Before done, verify: every button works, every class is styled, every display updates

📋 CODE GENERATION FORMAT (for Composer):
When generating multiple files, use this format:
FILE: path/to/file.ext
\`\`\`language
[Complete, working code - no placeholders]
\`\`\`

Separate files with blank lines.

💡 REMEMBER: You're creating something you'd be proud to ship. Quality over speed. Intelligence over templates.`;
      }
      
      // Get settings for provider configuration
      const settings = getSettings();
      const {
        activeModel,
        activeProvider,
        runtime: initialRuntime,
      } = resolveConfiguredModel(settings, context.model, runtimeBudget, context.provider);
      emitRuntimeInfo(event.sender, requestId, initialRuntime);
      
      // Add system prompt as first message if provided
      const messagesWithSystem = systemPrompt 
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;
      
      // Send thinking reaction to Dino Buddy
      event.sender.send('dino:reaction', {
        expression: 'thinking',
        message: ''
      });

      // Use AI router to stream response
      let fullResponse = '';
      let streamTerminalError: string | undefined;
      let latestRuntime = initialRuntime;
      const chatStartedAt = Date.now();

      getTelemetryService().track('ai_request', {
        mode: context.just_chat_mode ? 'chat' : context.dino_buddy_mode ? 'dino' : 'standard',
        runtimeBudget,
        ...flattenRuntimeForTelemetry(initialRuntime),
      });

      const processStreamChunk = (chunk: { content?: string; done?: boolean; error?: unknown }) => {
        if (chunk.error != null && chunk.error !== '') {
          const e = chunk.error;
          streamTerminalError =
            typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
        }
        if (chunk.content) {
          fullResponse += chunk.content;
          event.sender.send('chat-stream', {
            requestId,
            chunk: chunk.content,
            done: false
          });
        }

        if (chunk.done || chunk.error) {
          event.sender.send('chat-stream', {
            requestId,
            chunk: '',
            done: true,
            error: chunk.error
          });
        }
      };

      // Check for dual model configuration
      const dualModelEnabled = settings?.dualModelEnabled && settings?.dualModelConfig;
      const dualMode = context.dual_mode || 'auto'; // Backward-compatible router mode
      
      // Determine max tokens based on mode
      // Words to Code needs MUCH higher limits for complete game/app generation
      const isWordsToCodeMode = context.words_to_code_mode || context.wordsToCode || false;
      const isJustChatMode = context.just_chat_mode || context.justChatMode || false;
      const isConversationalMode = isJustChatMode || context.dino_buddy_mode;
      const maxTokens = getBudgetAdjustedMaxTokens(
        activeModel,
        isWordsToCodeMode ? 'words_to_code' : isConversationalMode ? 'just_chat' : 'chat',
        runtimeBudget
      );
      
      console.log(
        `[Chat] Mode: ${isWordsToCodeMode ? 'Words to Code' : context.dino_buddy_mode ? 'Dino' : isJustChatMode ? 'Just Chat' : 'Standard'}, maxTokens: ${maxTokens}, ollamaCloud: ${isOllamaCloudModel(activeModel)}`
      );

      if (dualModelEnabled && !isConversationalMode) {
        // Configure dual model system
        aiRouter.configureDualModel(settings.dualModelConfig);
        
        // Use dual-model streaming with smart routing
        await aiRouter.dualStream(messagesWithSystem, processStreamChunk, {
          model: activeModel,
          maxTokens: maxTokens,
          dualMode: dualMode,
          runtimeBudget,
          signal: chatAbortController.signal,
          context: {
            codeLines: context.file_content?.split('\n').length || 0,
            hasErrors: context.has_errors || false,
            fileCount: context.mentioned_files?.length || 0
          },
          onRouting: (routingInfo) => {
            // Notify renderer about routing decision
            event.sender.send('dual-model-routing', {
              requestId,
              mode: routingInfo.mode,
              runtimeBudget,
              provider: routingInfo.provider,
              model: routingInfo.model,
              complexity: routingInfo.analysis?.score || 5,
              reasoning: routingInfo.analysis?.reasoning || ''
            });
          },
          onRuntimeInfo: (runtime: AIRuntimeSnapshot) => {
            latestRuntime = runtime;
            emitRuntimeInfo(event.sender, requestId, runtime);
          }
        });
      } else {
        // Standard single-model streaming.
        // For Just Chat / Dino, honor the explicitly selected provider+model instead of
        // sending the request through dual-model routing, which can override the picker.
        const originalProvider = settings?.activeProvider || null;
        const originalModel = settings?.activeModel || null;

        try {
          aiRouter.setActiveProvider(activeProvider, activeModel);
          await aiRouter.stream(messagesWithSystem, processStreamChunk, {
            model: activeModel,
            maxTokens: maxTokens,
            signal: chatAbortController.signal,
            onRuntimeInfo: (runtime: AIRuntimeSnapshot) => {
              latestRuntime = runtime;
              emitRuntimeInfo(event.sender, requestId, runtime);
            }
          });
        } finally {
          aiRouter.setActiveProvider(originalProvider, originalModel);
        }
      }

      if (streamTerminalError) {
        getTelemetryService().track('ai_response', {
          mode: context.just_chat_mode ? 'chat' : context.dino_buddy_mode ? 'dino' : 'standard',
          success: false,
          durationMs: Date.now() - chatStartedAt,
          runtimeBudget,
          ...flattenRuntimeForTelemetry(latestRuntime),
          error: streamTerminalError,
        });
        event.sender.send('chat-error', {
          requestId,
          error: streamTerminalError,
          model: latestRuntime.displayModel,
          provider: latestRuntime.displayProvider
        });
        event.sender.send('dino:reaction', {
          expression: 'error',
          message: 'Let me help fix that! 🦕'
        });
        return {
          success: false,
          error: streamTerminalError,
          requestId,
          model: latestRuntime.displayModel,
          provider: latestRuntime.displayProvider,
          runtime: latestRuntime,
        };
      }

      if (!fullResponse.trim()) {
        const emptyMsg =
          'The model returned an empty response. Try again, shorten your message, or switch models.';
        getTelemetryService().track('ai_response', {
          mode: context.just_chat_mode ? 'chat' : context.dino_buddy_mode ? 'dino' : 'standard',
          success: false,
          durationMs: Date.now() - chatStartedAt,
          runtimeBudget,
          ...flattenRuntimeForTelemetry(latestRuntime),
          error: emptyMsg,
        });
        event.sender.send('chat-error', {
          requestId,
          error: emptyMsg,
          model: latestRuntime.displayModel,
          provider: latestRuntime.displayProvider
        });
        event.sender.send('dino:reaction', {
          expression: 'error',
          message: 'Let me help fix that! 🦕'
        });
        return {
          success: false,
          error: emptyMsg,
          requestId,
          model: latestRuntime.displayModel,
          provider: latestRuntime.displayProvider,
          runtime: latestRuntime,
        };
      }
      
      // Store in history
      addToConversationHistory(conversationMode, 'user', message);
      addToConversationHistory(conversationMode, 'assistant', fullResponse);
      
      // Send success reaction to Dino Buddy
      event.sender.send('dino:reaction', {
        expression: 'success',
        message: 'Great job! ✨'
      });
      getTelemetryService().track('ai_response', {
        mode: context.just_chat_mode ? 'chat' : context.dino_buddy_mode ? 'dino' : 'standard',
        success: true,
        durationMs: Date.now() - chatStartedAt,
        runtimeBudget,
        ...flattenRuntimeForTelemetry(latestRuntime),
      });
      
      return {
        success: true,
        response: fullResponse,
        requestId,
        runtime: latestRuntime,
      };
      
    } catch (error: unknown) {
      console.error('Chat error:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : error != null && typeof error === 'object' && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Unknown error';
      
      // Get model and provider info for error context
      const settings = getSettings();
      const { runtime } = resolveConfiguredModel(settings, context.model, runtimeBudget, context.provider);
      getTelemetryService().track('ai_response', {
        mode: context.just_chat_mode ? 'chat' : context.dino_buddy_mode ? 'dino' : 'standard',
        success: false,
        runtimeBudget,
        ...flattenRuntimeForTelemetry(runtime),
        error: errorMessage,
      });
      
      event.sender.send('chat-error', {
        requestId,
        error: errorMessage,
        model: runtime.displayModel,
        provider: runtime.displayProvider
      });
      emitRuntimeInfo(event.sender, requestId, runtime);

      // Send error reaction to Dino Buddy
      event.sender.send('dino:reaction', {
        expression: 'error',
        message: 'Let me help fix that! 🦕'
      });
      
      return {
        success: false,
        error: errorMessage,
        requestId,
        model: runtime.displayModel,
        provider: runtime.displayProvider,
        runtime,
      };
    } finally {
      activeChatControllers.delete(requestId);
    }
  });
}

