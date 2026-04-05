/**
 * AgentPipeline - Clean state-machine abstraction for agent execution
 * 
 * Provides a structured pipeline that wraps the agent loop into discrete,
 * observable stages: Plan -> Execute -> Validate -> Complete
 * 
 * This module is the architectural entry point for new code. The underlying
 * AgentLoop class in agent-loop.ts handles the raw tool-calling loop;
 * this pipeline adds planning, stage tracking, and lifecycle hooks.
 */

import { EventEmitter } from 'events';
import { AgentLoop, createAgent } from './agent-loop';
import type { AgentContext } from './agent-loop';
import { detectTaskMode, TaskMode } from './agent/task-mode';
import type {
  AgentReviewChange,
  AgentReviewVerificationState,
} from '../types/agent-review';

// ── Pipeline Stages ──────────────────────────────────────────────────────────

export enum PipelineStage {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  VALIDATING = 'validating',
  RECOVERING = 'recovering',
  COMPLETE = 'complete',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PipelineStep {
  id: string;
  stage: PipelineStage;
  description: string;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PipelineResult {
  success: boolean;
  response: string;
  stage: PipelineStage;
  steps: PipelineStep[];
  taskMode: TaskMode;
  durationMs: number;
  filesModified: string[];
  error?: string;
  /** Present when the agent loop staged file writes for review/apply instead of committing immediately. */
  reviewSessionId?: string;
  reviewChanges?: AgentReviewChange[];
  reviewVerification?: AgentReviewVerificationState;
}

export interface PipelineOptions {
  model?: string;
  dualMode?: 'fast' | 'deep' | 'auto';
  dinoBuddyMode?: boolean;
  useSpecializedAgents?: boolean;
  maxRetries?: number;
  onStageChange?: (stage: PipelineStage, step: PipelineStep) => void;
  onProgress?: (message: string) => void;
}

// ── Pipeline Implementation ──────────────────────────────────────────────────

export class AgentPipeline extends EventEmitter {
  private context: AgentContext;
  private agent: AgentLoop;
  private currentStage: PipelineStage = PipelineStage.IDLE;
  private steps: PipelineStep[] = [];
  private cancelled = false;

  constructor(context: AgentContext) {
    super();
    this.context = context;
    this.agent = createAgent(context);
  }

  get stage(): PipelineStage {
    return this.currentStage;
  }

  get history(): PipelineStep[] {
    return [...this.steps];
  }

  /**
   * Execute the full pipeline for a user message
   */
  async execute(userMessage: string, options: PipelineOptions = {}): Promise<PipelineResult> {
    const startTime = Date.now();
    this.cancelled = false;
    this.steps = [];

    const taskModeResult = detectTaskMode(userMessage);
    const maxRetries = options.maxRetries ?? 1;

    try {
      // ── Stage 1: Planning ──
      const planStep = this.beginStep('planning', 'Analyzing task and creating execution plan');
      this.transition(PipelineStage.PLANNING, planStep, options);

      const plan = {
        taskMode: taskModeResult.mode,
        confidence: taskModeResult.confidence,
        reason: taskModeResult.reason,
        message: userMessage,
        model: options.model,
      };

      this.completeStep(planStep, true, { plan });
      options.onProgress?.(`Plan: ${taskModeResult.reason} (${taskModeResult.mode} mode)`);

      if (this.cancelled) return this.cancelledResult(startTime, taskModeResult.mode);

      // ── Stage 2: Execution ──
      const execStep = this.beginStep('executing', 'Running agent loop');
      this.transition(PipelineStage.EXECUTING, execStep, options);

      let lastError: string | undefined;
      let result: any;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (this.cancelled) return this.cancelledResult(startTime, taskModeResult.mode);

        try {
          result = await this.agent.run(userMessage);
          lastError = undefined;
          break;
        } catch (err: any) {
          lastError = err.message || String(err);
          if (attempt < maxRetries) {
            const retryStep = this.beginStep('recovering', `Retry ${attempt + 1}/${maxRetries}: ${lastError}`);
            this.transition(PipelineStage.RECOVERING, retryStep, options);
            this.completeStep(retryStep, true);
            options.onProgress?.(`Retrying (${attempt + 1}/${maxRetries})...`);
          }
        }
      }

      if (lastError) {
        this.completeStep(execStep, false, { error: lastError });
        this.transition(PipelineStage.FAILED, execStep, options);

        return {
          success: false,
          response: `Agent failed: ${lastError}`,
          stage: PipelineStage.FAILED,
          steps: this.steps,
          taskMode: taskModeResult.mode,
          durationMs: Date.now() - startTime,
          filesModified: [],
          error: lastError,
        };
      }

      this.completeStep(execStep, true, { result });

      const responseText = this.normalizeAgentRunResult(result);
      const filesModified = this.filesModifiedFromAgent();
      const reviewSession = this.agent.consumePendingReviewSession();

      // ── Stage 3: Validation ──
      const validateStep = this.beginStep('validating', 'Verifying output quality');
      this.transition(PipelineStage.VALIDATING, validateStep, options);
      this.completeStep(validateStep, true);

      // ── Stage 4: Complete ──
      this.transition(PipelineStage.COMPLETE, validateStep, options);

      return {
        success: true,
        response: responseText,
        stage: PipelineStage.COMPLETE,
        steps: this.steps,
        taskMode: taskModeResult.mode,
        durationMs: Date.now() - startTime,
        filesModified,
        reviewSessionId: reviewSession?.sessionId,
        reviewChanges: reviewSession?.changes,
        reviewVerification: reviewSession?.initialVerification,
      };

    } catch (err: any) {
      this.transition(PipelineStage.FAILED, this.steps[this.steps.length - 1], options);

      return {
        success: false,
        response: `Pipeline error: ${err.message}`,
        stage: PipelineStage.FAILED,
        steps: this.steps,
        taskMode: taskModeResult.mode,
        durationMs: Date.now() - startTime,
        filesModified: [],
        error: err.message,
      };
    }
  }

  /**
   * Cancel the current pipeline execution
   */
  cancel(): void {
    this.cancelled = true;
    this.agent.requestStop('Pipeline cancelled');
    this.transition(PipelineStage.CANCELLED, this.steps[this.steps.length - 1]);
  }

  /** Underlying tool-calling loop (for IPC session id, event wiring, stop). */
  getAgent(): AgentLoop {
    return this.agent;
  }

  /**
   * Update agent context (e.g. when workspace changes)
   */
  updateContext(updates: Partial<AgentContext>): void {
    this.context = { ...this.context, ...updates };
    this.agent.updateContext(updates);
  }

  // ── Internal helpers ──

  private normalizeAgentRunResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (typeof r.response === 'string') return r.response;
      if (typeof r.content === 'string') return r.content;
    }
    return 'Task completed';
  }

  private filesModifiedFromAgent(): string[] {
    const set = (this.agent as unknown as { filesModifiedThisTask?: Set<string> }).filesModifiedThisTask;
    return set && typeof set.forEach === 'function' ? Array.from(set) : [];
  }

  private beginStep(stage: string, description: string): PipelineStep {
    const step: PipelineStep = {
      id: `step_${this.steps.length}_${Date.now()}`,
      stage: stage as PipelineStage,
      description,
      startedAt: Date.now(),
    };
    this.steps.push(step);
    return step;
  }

  private completeStep(step: PipelineStep, success: boolean, metadata?: Record<string, any>): void {
    step.completedAt = Date.now();
    step.success = success;
    if (metadata) step.metadata = metadata;
  }

  private transition(stage: PipelineStage, step: PipelineStep, options?: PipelineOptions): void {
    this.currentStage = stage;
    this.emit('stageChange', stage, step);
    options?.onStageChange?.(stage, step);
  }

  private cancelledResult(startTime: number, taskMode: TaskMode): PipelineResult {
    return {
      success: false,
      response: 'Pipeline cancelled by user',
      stage: PipelineStage.CANCELLED,
      steps: this.steps,
      taskMode,
      durationMs: Date.now() - startTime,
      filesModified: [],
    };
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createPipeline(context: AgentContext): AgentPipeline {
  return new AgentPipeline(context);
}
