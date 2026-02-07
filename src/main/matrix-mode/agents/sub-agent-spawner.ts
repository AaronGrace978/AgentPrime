/**
 * Matrix Mode Sub-Agent Spawner
 * Creates sub-agents for parallel task execution
 * 
 * Enhanced with:
 * - Streaming response support
 * - Progress callbacks
 * - Prioritized execution
 * - Resource-aware scheduling
 */

import {
  AgentInstance,
  AgentRequest,
  AgentResponse,
  SubAgentConfig,
  SubAgentResult,
  AgentMessage,
  DEFAULT_AGENT_CONFIG
} from './types';
import { AgentRegistry, getAgentRegistry } from './agent-registry';
import { EventEmitter } from 'events';

// Generate unique ID
function generateId(): string {
  return `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Standard executor that returns full response
 */
export type SubAgentExecutor = (
  config: SubAgentConfig,
  context: AgentMessage[]
) => Promise<string>;

/**
 * Streaming executor that calls back with chunks
 */
export type StreamingSubAgentExecutor = (
  config: SubAgentConfig,
  context: AgentMessage[],
  onChunk: (chunk: string) => void,
  onProgress?: (progress: SubAgentProgress) => void
) => Promise<string>;

/**
 * Progress update from a sub-agent
 */
export interface SubAgentProgress {
  subAgentId: string;
  stage: 'starting' | 'processing' | 'generating' | 'finishing';
  percent?: number;
  message?: string;
  tokensGenerated?: number;
}

/**
 * Streaming result with chunks
 */
export interface StreamingSubAgentResult extends SubAgentResult {
  chunks: string[];
  streamComplete: boolean;
}

interface SpawnedSubAgent {
  id: string;
  config: SubAgentConfig;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
  promise: Promise<SubAgentResult>;
  // Streaming support
  chunks: string[];
  onChunk?: (chunk: string) => void;
  onProgress?: (progress: SubAgentProgress) => void;
  priority: number;
}

export class SubAgentSpawner extends EventEmitter {
  private registry: AgentRegistry;
  private executor: SubAgentExecutor | null = null;
  private streamingExecutor: StreamingSubAgentExecutor | null = null;
  private activeSubAgents: Map<string, SpawnedSubAgent> = new Map();
  private completedSubAgents: SubAgentResult[] = [];
  private maxCompleted: number = 100;
  private defaultTimeout: number = 120000; // 2 minutes
  private maxConcurrent: number = 10;
  private pendingQueue: Array<{ config: SubAgentConfig; context: AgentMessage[]; resolve: (result: SubAgentResult) => void }> = [];

  constructor(registry?: AgentRegistry) {
    super();
    this.registry = registry || getAgentRegistry();
  }

  /**
   * Set the sub-agent executor function
   */
  setExecutor(executor: SubAgentExecutor): void {
    this.executor = executor;
  }

  /**
   * Set a streaming executor for real-time response streaming
   */
  setStreamingExecutor(executor: StreamingSubAgentExecutor): void {
    this.streamingExecutor = executor;
  }

  /**
   * Spawn a sub-agent for a task
   */
  async spawn(config: SubAgentConfig, context: AgentMessage[] = []): Promise<SubAgentResult> {
    if (!this.executor && !this.streamingExecutor) {
      throw new Error('No executor configured');
    }

    // Queue if at capacity
    if (this.activeSubAgents.size >= this.maxConcurrent) {
      console.log(`[SubAgentSpawner] Queue full, adding to pending queue`);
      return new Promise((resolve) => {
        this.pendingQueue.push({ config, context, resolve });
        // Sort by priority (higher first)
        this.pendingQueue.sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0));
      });
    }

    return this.executeSpawn(config, context);
  }

  /**
   * Internal spawn execution
   */
  private async executeSpawn(config: SubAgentConfig, context: AgentMessage[] = []): Promise<SubAgentResult> {
    const subAgentId = generateId();
    const timeout = config.timeout || this.defaultTimeout;
    const startedAt = Date.now();

    // Create promise for execution
    const executionPromise = new Promise<SubAgentResult>(async (resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let completed = false;

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          const result: SubAgentResult = {
            subAgentId,
            parentId: config.parentId,
            task: config.task,
            status: 'timeout',
            error: 'Sub-agent execution timed out',
            duration: Date.now() - startedAt
          };
          this.completeSubAgent(subAgentId, result);
          resolve(result);
        }
      }, timeout);

      try {
        const response = await this.executor!(config, context);
        
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          
          const result: SubAgentResult = {
            subAgentId,
            parentId: config.parentId,
            task: config.task,
            status: 'completed',
            result: response,
            duration: Date.now() - startedAt
          };
          this.completeSubAgent(subAgentId, result);
          resolve(result);
        }
      } catch (error: any) {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          
          const result: SubAgentResult = {
            subAgentId,
            parentId: config.parentId,
            task: config.task,
            status: 'failed',
            error: error.message,
            duration: Date.now() - startedAt
          };
          this.completeSubAgent(subAgentId, result);
          resolve(result);
        }
      }
    });

    // Track the sub-agent
    const spawned: SpawnedSubAgent = {
      id: subAgentId,
      config,
      status: 'running',
      startedAt,
      promise: executionPromise,
      chunks: [],
      priority: config.priority || 0
    };

    this.activeSubAgents.set(subAgentId, spawned);
    console.log(`[SubAgentSpawner] Spawned sub-agent: ${subAgentId} for task: ${config.task.substring(0, 50)}...`);

    return executionPromise;
  }

  /**
   * Spawn a sub-agent with streaming support
   * Returns immediately with a result object that updates as chunks arrive
   */
  async spawnStreaming(
    config: SubAgentConfig,
    context: AgentMessage[] = [],
    onChunk?: (subAgentId: string, chunk: string, fullText: string) => void,
    onProgress?: (progress: SubAgentProgress) => void
  ): Promise<StreamingSubAgentResult> {
    if (!this.streamingExecutor && !this.executor) {
      throw new Error('No executor configured');
    }

    // Queue if at capacity
    if (this.activeSubAgents.size >= this.maxConcurrent) {
      // For streaming, we still wait but notify progress
      onProgress?.({
        subAgentId: 'pending',
        stage: 'starting',
        message: 'Waiting in queue...'
      });
      await this.waitForSlot();
    }

    const subAgentId = generateId();
    const timeout = config.timeout || this.defaultTimeout;
    const startedAt = Date.now();
    const chunks: string[] = [];
    let fullText = '';

    // Emit start event
    this.emit('subagent:start', { subAgentId, config });
    onProgress?.({
      subAgentId,
      stage: 'starting',
      message: 'Sub-agent starting...'
    });

    const result: StreamingSubAgentResult = {
      subAgentId,
      parentId: config.parentId,
      task: config.task,
      status: 'completed',
      chunks: [],
      streamComplete: false,
      duration: 0
    };

    // Track the sub-agent
    const spawned: SpawnedSubAgent = {
      id: subAgentId,
      config,
      status: 'running',
      startedAt,
      chunks: [],
      onChunk: (chunk) => {
        chunks.push(chunk);
        fullText += chunk;
        result.chunks = [...chunks];
        onChunk?.(subAgentId, chunk, fullText);
        this.emit('subagent:chunk', { subAgentId, chunk, fullText });
      },
      onProgress: (progress) => {
        onProgress?.(progress);
        this.emit('subagent:progress', progress);
      },
      promise: Promise.resolve(result),
      priority: config.priority || 0
    };

    this.activeSubAgents.set(subAgentId, spawned);

    try {
      // Use streaming executor if available, otherwise fall back to regular
      if (this.streamingExecutor) {
        fullText = await this.streamingExecutor(
          config,
          context,
          spawned.onChunk!,
          spawned.onProgress
        );
      } else if (this.executor) {
        // Simulate streaming with regular executor
        spawned.onProgress?.({
          subAgentId,
          stage: 'processing',
          message: 'Processing...'
        });
        fullText = await this.executor(config, context);
        // Emit as single chunk
        spawned.onChunk?.(fullText);
      }

      result.result = fullText;
      result.status = 'completed';
      result.streamComplete = true;
      result.duration = Date.now() - startedAt;

      this.emit('subagent:complete', { subAgentId, result: fullText, duration: result.duration });

    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
      result.streamComplete = true;
      result.duration = Date.now() - startedAt;

      this.emit('subagent:error', { subAgentId, error: error.message });
    }

    this.completeSubAgent(subAgentId, result);
    return result;
  }

  /**
   * Wait for a slot to become available
   */
  private async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeSubAgents.size < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Process pending queue after a sub-agent completes
   */
  private processPendingQueue(): void {
    if (this.pendingQueue.length === 0) return;
    if (this.activeSubAgents.size >= this.maxConcurrent) return;

    const pending = this.pendingQueue.shift();
    if (pending) {
      this.executeSpawn(pending.config, pending.context).then(pending.resolve);
    }
  }

  /**
   * Spawn multiple sub-agents in parallel
   */
  async spawnParallel(
    configs: SubAgentConfig[],
    context: AgentMessage[] = []
  ): Promise<SubAgentResult[]> {
    const promises = configs.map(config => this.spawn(config, context));
    return Promise.all(promises);
  }

  /**
   * Spawn sub-agents and wait for first completion
   */
  async spawnRace(
    configs: SubAgentConfig[],
    context: AgentMessage[] = []
  ): Promise<SubAgentResult> {
    const promises = configs.map(config => this.spawn(config, context));
    return Promise.race(promises);
  }

  /**
   * Complete a sub-agent execution
   */
  private completeSubAgent(subAgentId: string, result: SubAgentResult): void {
    const spawned = this.activeSubAgents.get(subAgentId);
    if (spawned) {
      spawned.status = result.status as any;
      spawned.completedAt = Date.now();
      spawned.result = result.result;
      spawned.error = result.error;
      
      this.activeSubAgents.delete(subAgentId);
      this.completedSubAgents.push(result);
      
      // Trim completed list
      if (this.completedSubAgents.length > this.maxCompleted) {
        this.completedSubAgents = this.completedSubAgents.slice(-this.maxCompleted);
      }

      // Process pending queue
      this.processPendingQueue();
    }
  }

  /**
   * Cancel a running sub-agent
   */
  cancel(subAgentId: string): boolean {
    const spawned = this.activeSubAgents.get(subAgentId);
    if (spawned && spawned.status === 'running') {
      const result: SubAgentResult = {
        subAgentId,
        parentId: spawned.config.parentId,
        task: spawned.config.task,
        status: 'failed',
        error: 'Cancelled by user',
        duration: Date.now() - spawned.startedAt
      };
      this.completeSubAgent(subAgentId, result);
      return true;
    }
    return false;
  }

  /**
   * Cancel all sub-agents for a parent
   */
  cancelForParent(parentId: string): number {
    let cancelled = 0;
    for (const [id, spawned] of this.activeSubAgents) {
      if (spawned.config.parentId === parentId) {
        if (this.cancel(id)) {
          cancelled++;
        }
      }
    }
    return cancelled;
  }

  /**
   * Get active sub-agents
   */
  getActive(): SpawnedSubAgent[] {
    return Array.from(this.activeSubAgents.values());
  }

  /**
   * Get active sub-agents for a parent
   */
  getActiveForParent(parentId: string): SpawnedSubAgent[] {
    return this.getActive().filter(s => s.config.parentId === parentId);
  }

  /**
   * Get completed results for a parent
   */
  getCompletedForParent(parentId: string): SubAgentResult[] {
    return this.completedSubAgents.filter(r => r.parentId === parentId);
  }

  /**
   * Get status summary
   */
  getStatus(): {
    active: number;
    completed: number;
    byParent: Map<string, { active: number; completed: number }>;
  } {
    const byParent = new Map<string, { active: number; completed: number }>();
    
    for (const spawned of this.activeSubAgents.values()) {
      const parentId = spawned.config.parentId;
      const stats = byParent.get(parentId) || { active: 0, completed: 0 };
      stats.active++;
      byParent.set(parentId, stats);
    }
    
    for (const result of this.completedSubAgents) {
      const stats = byParent.get(result.parentId) || { active: 0, completed: 0 };
      stats.completed++;
      byParent.set(result.parentId, stats);
    }

    return {
      active: this.activeSubAgents.size,
      completed: this.completedSubAgents.length,
      byParent
    };
  }

  /**
   * Wait for all sub-agents of a parent to complete
   */
  async waitForParent(parentId: string, timeout?: number): Promise<SubAgentResult[]> {
    const activeForParent = this.getActiveForParent(parentId);
    
    if (activeForParent.length === 0) {
      return this.getCompletedForParent(parentId);
    }

    const promises = activeForParent.map(s => s.promise);
    
    if (timeout) {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeout);
      });
      
      await Promise.race([
        Promise.all(promises),
        timeoutPromise
      ]);
    } else {
      await Promise.all(promises);
    }

    return this.getCompletedForParent(parentId);
  }

  /**
   * Clear completed results
   */
  clearCompleted(): void {
    this.completedSubAgents = [];
  }

  /**
   * Set configuration
   */
  setConfig(config: { maxConcurrent?: number; defaultTimeout?: number }): void {
    if (config.maxConcurrent) {
      this.maxConcurrent = config.maxConcurrent;
    }
    if (config.defaultTimeout) {
      this.defaultTimeout = config.defaultTimeout;
    }
  }

  /**
   * Get pending queue size
   */
  getPendingQueueSize(): number {
    return this.pendingQueue.length;
  }

  /**
   * Clear pending queue
   */
  clearPendingQueue(): number {
    const count = this.pendingQueue.length;
    for (const pending of this.pendingQueue) {
      pending.resolve({
        subAgentId: 'cancelled',
        parentId: pending.config.parentId,
        task: pending.config.task,
        status: 'failed',
        error: 'Queue cleared',
        duration: 0
      });
    }
    this.pendingQueue = [];
    return count;
  }

  /**
   * Subscribe to sub-agent events
   */
  onSubAgentEvent(
    event: 'start' | 'chunk' | 'progress' | 'complete' | 'error',
    callback: (data: any) => void
  ): void {
    this.on(`subagent:${event}`, callback);
  }

  /**
   * Get chunks for an active sub-agent
   */
  getChunks(subAgentId: string): string[] {
    const spawned = this.activeSubAgents.get(subAgentId);
    return spawned?.chunks || [];
  }

  /**
   * Get current text for an active streaming sub-agent
   */
  getCurrentText(subAgentId: string): string {
    const spawned = this.activeSubAgents.get(subAgentId);
    return spawned?.chunks.join('') || '';
  }
}

// Singleton instance
let subAgentSpawnerInstance: SubAgentSpawner | null = null;

export function getSubAgentSpawner(): SubAgentSpawner {
  if (!subAgentSpawnerInstance) {
    subAgentSpawnerInstance = new SubAgentSpawner();
  }
  return subAgentSpawnerInstance;
}

export default SubAgentSpawner;
