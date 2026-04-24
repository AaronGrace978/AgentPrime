/**
 * Unified façade for agent-mode execution (specialized vs monolithic).
 * Owns pipeline + specialized loop instances and active-mode tracking for agent:stop.
 */

import type { WebContents } from 'electron';
import { SpecializedAgentLoop } from './specialized-agent-loop';
import type { AgentContext } from '../agent-loop';
import { createPipeline, type AgentPipeline } from '../agent-pipeline';
import type { ChatIpcContext } from '../security/chat-ipc-context';
import { checkOllamaHealth } from '../core/ollama-probe';
import { getTelemetryService } from '../core/telemetry-service';
import { detectCanonicalTemplateId, workspaceNeedsDeterministicScaffold } from './scaffold-resolver';
import { clampAgentAutonomyLevel, resolveEffectiveAutonomyPolicy } from './autonomy-policy';
import { resolveEffectiveAIRuntime } from '../core/ai-runtime-state';
import { flattenRuntimeForTelemetry } from '../core/ai-runtime-telemetry';
import type { AIRuntimeSnapshot } from '../../types/ai-providers';
import type { AssistantBehaviorProfile, VibeCoderExecutionPolicy, VibeCoderIntent } from './behavior-profile';
import {
  buildIdeContextSnapshotFromChatIpc,
  resolveCurrentFileForAgent,
  resolveOpenFilesForAgent,
} from './ide-context-bridge';

type ConversationMode = 'agent' | 'chat' | 'dino';

type AssistantResponseMetadata = {
  assistantBehaviorProfile?: 'vibecoder';
  providerLabel?: string;
  modelLabel?: string;
  viaFallback?: boolean;
};

export interface AgentChatBranchParams {
  event: { sender: WebContents };
  requestId: string;
  message: string;
  workspacePath: string;
  context: ChatIpcContext;
  agentSettings: any;
  selectedModel: string;
  activeProvider: string;
  requestedRuntime: AIRuntimeSnapshot;
  assistantBehaviorProfile: AssistantBehaviorProfile;
  vibeCoderExecutionPolicy: VibeCoderExecutionPolicy | undefined;
  vibeCoderIntent: VibeCoderIntent | undefined;
  autonomyLevel: ReturnType<typeof clampAgentAutonomyLevel>;
  autonomyPolicy: ReturnType<typeof resolveEffectiveAutonomyPolicy>;
  useSpecializedAgents: boolean;
  isOllamaCloud: boolean;
  conversationMode: ConversationMode;
  runtimeBudget: 'instant' | 'standard' | 'deep';
  addToConversationHistory: (
    mode: ConversationMode,
    role: 'user' | 'assistant',
    content: string,
    metadata?: AssistantResponseMetadata
  ) => void;
  getCurrentFile: () => string | null;
  emitRuntimeInfo: (sender: WebContents, requestId: string, runtime: AIRuntimeSnapshot) => void;
  buildAssistantResponseMetadata: (
    profile: AssistantBehaviorProfile,
    runtime?: AIRuntimeSnapshot,
    fallbackSelection?: { provider?: string; model?: string }
  ) => AssistantResponseMetadata | undefined;
}

export type AgentChatBranchResult =
  | {
      success: true;
      response: string;
      responseMetadata?: AssistantResponseMetadata;
      requestId: string;
      agent_mode: true;
      specialized_mode: boolean;
      reviewSessionId?: string;
      reviewChanges?: any;
      reviewVerification?: any;
      reviewPlan?: any;
      reviewCheckpoint?: any;
      runtime?: AIRuntimeSnapshot;
    }
  | {
      success: false;
      error: string;
      requestId: string;
      agent_mode: true;
      specialized_mode: boolean;
      suggestion?: string;
      runtime?: AIRuntimeSnapshot;
    };

export class AgentChatRuntime {
  private agentPipeline: AgentPipeline | null = null;
  private specializedAgentLoop: SpecializedAgentLoop | null = null;
  activeAgentMode: 'monolithic' | 'specialized' | null = null;

  private async streamAssistantResponse(
    sender: WebContents,
    requestId: string,
    response: string
  ): Promise<void> {
    const chunks = response.match(/\S+\s*|\n+/g) || [];
    for (const chunk of chunks) {
      sender.send('chat-stream', {
        requestId,
        chunk,
        done: false,
        agent_mode: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    sender.send('chat-stream', {
      requestId,
      chunk: '',
      done: true,
      agent_mode: true,
    });
  }

  getPipeline(): AgentPipeline | null {
    return this.agentPipeline;
  }

  getSpecializedLoop(): SpecializedAgentLoop | null {
    return this.specializedAgentLoop;
  }

  private buildAgentContextBase(p: AgentChatBranchParams): AgentContext {
    const { context, workspacePath, selectedModel, runtimeBudget, assistantBehaviorProfile, vibeCoderIntent, vibeCoderExecutionPolicy, autonomyLevel, getCurrentFile } = p;

    const ideContext = buildIdeContextSnapshotFromChatIpc(context);

    return {
      workspacePath,
      currentFile: resolveCurrentFileForAgent(context, getCurrentFile),
      openFiles: resolveOpenFilesForAgent(context),
      terminalHistory: context.terminal_history || [],
      model: selectedModel,
      runtimeBudget,
      assistantBehaviorProfile,
      vibeCoderIntent,
      vibeCoderExecutionPolicy,
      autonomyLevel,
      repairScope: context.repair_scope,
      ideContext,
      monolithicApplyImmediately: p.agentSettings?.agentMonolithicApplyImmediately === true,
    };
  }

  async executeAgentBranch(p: AgentChatBranchParams): Promise<AgentChatBranchResult> {
    const {
      event,
      requestId,
      message,
      workspacePath,
      context,
      agentSettings,
      selectedModel,
      activeProvider,
      requestedRuntime,
      assistantBehaviorProfile,
      vibeCoderExecutionPolicy,
      autonomyLevel,
      autonomyPolicy,
      useSpecializedAgents,
      isOllamaCloud,
      conversationMode,
      addToConversationHistory,
      getCurrentFile,
      emitRuntimeInfo,
      buildAssistantResponseMetadata,
    } = p;

    const useSpecializedAgentsResolved = useSpecializedAgents;

    if (useSpecializedAgentsResolved) {
      console.log(
        `[Chat] Specialized agent mode enabled, provider: ${activeProvider}, model: ${selectedModel}, cloud: ${isOllamaCloud}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
      );
      const deterministicScaffoldOnly =
        vibeCoderExecutionPolicy?.allowScaffold === false
          ? false
          : Boolean(context.deterministic_scaffold_only) ||
            (process.env.NODE_ENV === 'test' &&
              workspaceNeedsDeterministicScaffold(workspacePath) &&
              Boolean(detectCanonicalTemplateId(message)));

      if (!deterministicScaffoldOnly && activeProvider === 'ollama' && !isOllamaCloud) {
        const health = await checkOllamaHealth();
        if (!health.running) {
          return {
            success: false,
            error: `❌ Ollama is not running!\n\nStart Ollama first:\n  ollama serve\n\nThen pull a model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
            requestId,
            agent_mode: true,
            specialized_mode: true,
          };
        }

        if (health.models.length === 0) {
          return {
            success: false,
            error: `⚠️ No models installed!\n\nPull a recommended model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
            requestId,
            agent_mode: true,
            specialized_mode: true,
          };
        }
      }

      const agentContext: AgentContext = {
        ...this.buildAgentContextBase(p),
        deterministicScaffoldOnly,
      };

      this.specializedAgentLoop = new SpecializedAgentLoop(agentContext);
      this.specializedAgentLoop.on('task-start', (data: any) => {
        event.sender.send('agent:task-start', data);
      });
      this.specializedAgentLoop.on('step-start', (data: any) => {
        event.sender.send('agent:step-start', data);
      });
      this.specializedAgentLoop.on('step-complete', (data: any) => {
        event.sender.send('agent:step-complete', data);
      });
      this.specializedAgentLoop.on('file-modified', (data: any) => {
        event.sender.send('agent:file-modified', data);
      });
      this.specializedAgentLoop.on('critique-complete', (data: any) => {
        event.sender.send('agent:critique-complete', data);
      });
      this.specializedAgentLoop.on('command-output', (data: any) => {
        event.sender.send('agent:command-output', data);
      });

      const agentStartedAt = Date.now();
      try {
        this.activeAgentMode = 'specialized';
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
        const response = await this.specializedAgentLoop.run(message);
        const responseRuntime = resolveEffectiveAIRuntime(agentSettings, selectedModel, activeProvider);
        const responseMetadata = buildAssistantResponseMetadata(assistantBehaviorProfile, responseRuntime);
        emitRuntimeInfo(event.sender, requestId, responseRuntime);
        const reviewSession = this.specializedAgentLoop.consumePendingReviewSession();
        await this.streamAssistantResponse(event.sender, requestId, response);

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

        event.sender.send('dino:reaction', {
          expression: 'success',
          message: 'ROAAAAR! We did it!! 🦖💥✨',
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

        event.sender.send('dino:reaction', {
          expression: 'error',
          message: 'Oof! My dino brain tripped — let me try again! 🦕💪',
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
        this.activeAgentMode = null;
      }
    }

    console.log(
      `[Chat] Monolithic agent mode enabled, model: ${selectedModel}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
    );
    emitRuntimeInfo(event.sender, requestId, requestedRuntime);

    const agentContext: AgentContext = {
      ...this.buildAgentContextBase(p),
      deterministicScaffoldOnly:
        vibeCoderExecutionPolicy?.allowScaffold === false
          ? false
          : Boolean(context.deterministic_scaffold_only),
    };

    if (!this.agentPipeline) {
      this.agentPipeline = createPipeline(agentContext);

      const loop = this.agentPipeline.getAgent();
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
      this.agentPipeline.updateContext(agentContext);
    }

    try {
      this.activeAgentMode = 'monolithic';
      const pipelineResult = await this.agentPipeline.execute(message, {
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
          message: 'Oof! Something went sideways — want to try again? 🦕',
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

      await this.streamAssistantResponse(event.sender, requestId, response);

      addToConversationHistory(conversationMode, 'user', message);
      addToConversationHistory(conversationMode, 'assistant', response, responseMetadata);

      event.sender.send('dino:reaction', {
        expression: 'success',
        message: 'BOOM! Nailed it, friend!! 🦖🎉💥',
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
        message: 'Oof! Something went sideways — want to try again? 🦕',
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
      this.activeAgentMode = null;
    }
  }
}

let agentChatRuntimeSingleton: AgentChatRuntime | null = null;

export function getAgentChatRuntime(): AgentChatRuntime {
  if (!agentChatRuntimeSingleton) {
    agentChatRuntimeSingleton = new AgentChatRuntime();
  }
  return agentChatRuntimeSingleton;
}
