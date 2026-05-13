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
import { resolveDeterministicScaffoldOnlyFlag } from './scaffold-resolver';
import { clampAgentAutonomyLevel, resolveEffectiveAutonomyPolicy } from './autonomy-policy';
import { resolveEffectiveAIRuntime } from '../core/ai-runtime-state';
import { flattenRuntimeForTelemetry } from '../core/ai-runtime-telemetry';
import type { AIRuntimeSnapshot } from '../../types/ai-providers';
import type { AgentRoutePlan } from '../../types/agent-routing';
import type { AssistantBehaviorProfile, VibeCoderExecutionPolicy, VibeCoderIntent } from './behavior-profile';
import { buildAgentRoutePlan } from './agent-router';
import {
  finishAgentTrace,
  getActiveAgentTracePath,
  recordAgentTrace,
  startAgentTrace,
} from './agent-trace-recorder';
import {
  buildIdeContextSnapshotFromChatIpc,
  resolveCurrentFileForAgent,
  resolveOpenFilesForAgent,
} from './ide-context-bridge';
import { validateRouteModifiedFiles } from './route-verification';
import type { TerminalStructuredError } from './ide-context-format';

type ConversationMode = 'agent' | 'chat' | 'dino';

type AssistantResponseMetadata = {
  assistantBehaviorProfile?: 'vibecoder';
  providerLabel?: string;
  modelLabel?: string;
  viaFallback?: boolean;
};

function parseTerminalStructuredErrors(terminalHistory: string[]): TerminalStructuredError[] {
  const joined = terminalHistory.join('\n').slice(-64_000);
  if (!joined.trim()) return [];

  const lines = joined.split(/\r?\n/);
  const errors: TerminalStructuredError[] = [];
  const errorPattern = /(error|failed|exception|traceback|syntaxerror|typeerror|referenceerror|cannot find module|module not found)/i;
  const filePattern = /([A-Za-z]:)?[^:\s"']+\.(?:ts|tsx|js|jsx|py|json|css|scss|html|yml|yaml)(?::(\d+))?(?::(\d+))?/i;

  for (const line of lines.slice(-500)) {
    if (!errorPattern.test(line)) continue;

    const fileMatch = line.match(filePattern);
    errors.push({
      stage: /test/i.test(line) ? 'test' : /build|compile/i.test(line) ? 'build' : 'unknown',
      severity: /warning/i.test(line) ? 'warning' : 'error',
      summary: line.trim().slice(0, 500),
      files: fileMatch ? [fileMatch[0].split(':')[0]] : undefined,
      line: fileMatch?.[2] ? Number(fileMatch[2]) : undefined,
      column: fileMatch?.[3] ? Number(fileMatch[3]) : undefined,
      output: line.trim(),
    });

    if (errors.length >= 20) break;
  }

  return errors;
}

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
      routePlan?: AgentRoutePlan;
    }
  | {
      success: false;
      error: string;
      requestId: string;
      agent_mode: true;
      specialized_mode: boolean;
      suggestion?: string;
      reviewSessionId?: string;
      reviewChanges?: any;
      reviewVerification?: any;
      reviewPlan?: any;
      reviewCheckpoint?: any;
      runtime?: AIRuntimeSnapshot;
      routePlan?: AgentRoutePlan;
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

  private buildAgentContextBase(p: AgentChatBranchParams, routePlan?: AgentRoutePlan): AgentContext {
    const { context, workspacePath, selectedModel, activeProvider, runtimeBudget, assistantBehaviorProfile, vibeCoderIntent, vibeCoderExecutionPolicy, autonomyLevel, getCurrentFile } = p;

    const ideContext = buildIdeContextSnapshotFromChatIpc(context);
    const terminalStructuredErrors = parseTerminalStructuredErrors(context.terminal_history || []);

    return {
      workspacePath,
      currentFile: resolveCurrentFileForAgent(context, getCurrentFile),
      openFiles: resolveOpenFilesForAgent(context),
      terminalHistory: context.terminal_history || [],
      terminalStructuredErrors,
      model: selectedModel,
      provider: activeProvider,
      runtimeBudget,
      assistantBehaviorProfile,
      vibeCoderIntent,
      vibeCoderExecutionPolicy,
      autonomyLevel,
      repairScope: context.repair_scope,
      ideContext,
      gitStatus: ideContext?.gitStatus,
      agentRoutePlan: routePlan,
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
      emitRuntimeInfo,
      buildAssistantResponseMetadata,
    } = p;

    const trace = startAgentTrace({
      requestId,
      workspacePath,
      selectedProvider: activeProvider,
      selectedModel,
      runtimeBudget: p.runtimeBudget,
      requestedSpecializedAgents: useSpecializedAgents,
    });

    const routePlan = buildAgentRoutePlan({
      message,
      workspacePath,
      ideContext: buildIdeContextSnapshotFromChatIpc(context),
      repairScope: context.repair_scope,
      requestedBranch: useSpecializedAgents ? 'specialized' : 'monolithic',
      runtimeBudget: p.runtimeBudget,
      selectedProvider: activeProvider,
      selectedModel,
      requestedRuntime,
      autonomyLevel,
    });

    event.sender.send('agent:route-plan', routePlan);
    recordAgentTrace('route_plan', {
      routePlan,
      tracePath: trace.filePath,
    });
    getTelemetryService().track('generation_phase', {
      requestId,
      phase: 'agent_route_plan',
      intent: routePlan.intent,
      taskMode: routePlan.taskMode,
      branch: routePlan.branch,
      riskLevel: routePlan.risk.level,
      riskScore: routePlan.risk.score,
      confirmationRequired: routePlan.confirmationRequired,
      verificationStrategy: routePlan.verificationPlan.strategy,
      runtimeBudget: routePlan.runtimeBudget,
      workspacePath,
    });

    const useSpecializedAgentsResolved = routePlan.branch === 'specialized';

    if (useSpecializedAgentsResolved) {
      recordAgentTrace('branch_start', {
        branch: 'specialized',
        provider: activeProvider,
        model: selectedModel,
      });
      console.log(
        `[Chat] Specialized agent mode enabled, provider: ${activeProvider}, model: ${selectedModel}, cloud: ${isOllamaCloud}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
      );
      const deterministicScaffoldOnly = resolveDeterministicScaffoldOnlyFlag({
        message,
        workspacePath,
        allowScaffold: vibeCoderExecutionPolicy?.allowScaffold !== false,
        explicitFromContext: Boolean(context.deterministic_scaffold_only),
        allowTestCanonicalTemplates: true,
      });

      if (!deterministicScaffoldOnly && activeProvider === 'ollama' && !isOllamaCloud) {
        const health = await checkOllamaHealth();
        if (!health.running) {
          finishAgentTrace({
            success: false,
            branch: 'specialized',
            error: 'Local Ollama is not running',
            tracePath: getActiveAgentTracePath(),
          });
          return {
            success: false,
            error: `❌ Ollama is not running!\n\nStart Ollama first:\n  ollama serve\n\nThen pull a model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
            requestId,
            agent_mode: true,
            specialized_mode: true,
            routePlan,
          };
        }

        if (health.models.length === 0) {
          finishAgentTrace({
            success: false,
            branch: 'specialized',
            error: 'No local Ollama models installed',
            tracePath: getActiveAgentTracePath(),
          });
          return {
            success: false,
            error: `⚠️ No models installed!\n\nPull a recommended model:\n  ollama pull qwen2.5:14b\n\n💡 Or use Ollama Cloud models (ending in :cloud) for cloud AI!`,
            requestId,
            agent_mode: true,
            specialized_mode: true,
            routePlan,
          };
        }
      }

      const agentContext: AgentContext = {
        ...this.buildAgentContextBase(p, routePlan),
        deterministicScaffoldOnly,
      };

      this.specializedAgentLoop = new SpecializedAgentLoop(agentContext);
      const specializedModifiedFiles = new Set<string>();
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
        if (typeof data?.path === 'string') {
          specializedModifiedFiles.add(data.path);
        }
        event.sender.send('agent:file-modified', data);
      });
      this.specializedAgentLoop.on('critique-complete', (data: any) => {
        event.sender.send('agent:critique-complete', data);
      });
      this.specializedAgentLoop.on('command-output', (data: any) => {
        event.sender.send('agent:command-output', data);
      });
      this.specializedAgentLoop.on('runtime-event', (data: any) => {
        event.sender.send('agent:runtime-event', data);
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
        const routeValidation = validateRouteModifiedFiles(
          routePlan,
          agentContext.ideContext,
          Array.from(specializedModifiedFiles)
        );
        if (!routeValidation.success) {
          const validationError = routeValidation.error || 'Specialized agent verification failed';
          recordAgentTrace('run_complete', {
            success: false,
            branch: 'specialized',
            error: validationError,
            reviewSessionId: reviewSession?.sessionId,
          });
          event.sender.send('dino:reaction', {
            expression: 'error',
            message: 'Oof! Verification caught something — let me know if you want a repair pass. 🦕',
          });
          return {
            success: false,
            error: `${response}\n\nValidation failed: ${validationError}`,
            requestId,
            agent_mode: true,
            specialized_mode: true,
            reviewSessionId: reviewSession?.sessionId,
            reviewChanges: reviewSession?.changes,
            reviewVerification: reviewSession?.initialVerification,
            reviewPlan: reviewSession?.plan,
            reviewCheckpoint: reviewSession?.checkpoint,
            runtime: responseRuntime,
            routePlan,
          };
        }
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
        recordAgentTrace('run_complete', {
          success: true,
          branch: 'specialized',
          durationMs: Date.now() - agentStartedAt,
          reviewSessionId: reviewSession?.sessionId,
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
          routePlan,
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
        recordAgentTrace('model_call_error', {
          branch: 'specialized',
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
          routePlan,
        };
      } finally {
        finishAgentTrace({
          branch: 'specialized',
          tracePath: getActiveAgentTracePath(),
        });
        this.activeAgentMode = null;
      }
    }

    recordAgentTrace('branch_start', {
      branch: 'monolithic',
      provider: activeProvider,
      model: selectedModel,
    });
    console.log(
      `[Chat] Monolithic agent mode enabled, model: ${selectedModel}, autonomy: L${autonomyPolicy.level} (${autonomyPolicy.label})`
    );
    emitRuntimeInfo(event.sender, requestId, requestedRuntime);

    const agentContext: AgentContext = {
      ...this.buildAgentContextBase(p, routePlan),
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
      loop.on('runtime-event', (data) => {
        event.sender.send('agent:runtime-event', data);
      });
    } else {
      this.agentPipeline.updateContext(agentContext);
    }

    try {
      this.activeAgentMode = 'monolithic';
      const pipelineResult = await this.agentPipeline.execute(message, {
        model: selectedModel,
        maxRetries: 1,
        onStageChange: (stage, step) => {
          event.sender.send('agent:runtime-event', {
            type: stage === 'failed' ? 'error' : stage === 'complete' ? 'success' : 'progress',
            label: step?.description || stage,
            phase: stage,
            elapsedMs: step?.startedAt ? Date.now() - step.startedAt : 0,
            message: step?.description || stage,
          });
        },
        onProgress: (progressMessage) => {
          event.sender.send('agent:runtime-event', {
            type: 'progress',
            label: 'Agent pipeline',
            phase: 'pipeline',
            elapsedMs: 0,
            message: progressMessage,
          });
        },
      });
      const response = pipelineResult.response;
      const responseRuntime = resolveEffectiveAIRuntime(
        agentSettings,
        pipelineResult.actualModel || selectedModel,
        pipelineResult.actualProvider || activeProvider
      );
      const responseMetadata = buildAssistantResponseMetadata(assistantBehaviorProfile, responseRuntime);
      emitRuntimeInfo(event.sender, requestId, responseRuntime);

      if (!pipelineResult.success) {
        recordAgentTrace('run_complete', {
          success: false,
          branch: 'monolithic',
          error: pipelineResult.error || pipelineResult.response,
        });
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
          routePlan,
        };
      }

      await this.streamAssistantResponse(event.sender, requestId, response);

      addToConversationHistory(conversationMode, 'user', message);
      addToConversationHistory(conversationMode, 'assistant', response, responseMetadata);
      recordAgentTrace('run_complete', {
        success: true,
        branch: 'monolithic',
        reviewSessionId: pipelineResult.reviewSessionId,
      });

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
        routePlan,
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
      recordAgentTrace('model_call_error', {
        branch: 'monolithic',
        error: msg,
      });
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
        routePlan,
      };
    } finally {
      finishAgentTrace({
        branch: 'monolithic',
        tracePath: getActiveAgentTracePath(),
      });
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
