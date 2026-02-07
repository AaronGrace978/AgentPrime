/**
 * ActionEngine - Parallel Action Execution with State Tracking
 * 
 * Features:
 * - Parallel action execution (up to maxConcurrent)
 * - Priority queue (critical > high > normal > low > background)
 * - Dependency resolution (action B waits for action A)
 * - State tracking (knows what's running, what's open)
 * - Retry with backoff
 * - Timeout handling
 * - Event system for UI updates
 */

import { EventEmitter } from 'events';
import {
  QueuedAction,
  ActionResult,
  ActionPriority,
  ActionStatus,
  SystemState,
  ActionEngineConfig,
  DEFAULT_ENGINE_CONFIG,
  ExecutionPlan,
  ActionEvent,
  ActionEventHandler
} from './types';

// Re-export types
export * from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY VALUES
// ═══════════════════════════════════════════════════════════════════════════════

const PRIORITY_VALUES: Record<ActionPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  background: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ActionEngine extends EventEmitter {
  private config: ActionEngineConfig;
  private queue: QueuedAction[] = [];
  private running: Map<string, QueuedAction> = new Map();
  private completed: Map<string, QueuedAction> = new Map();
  private state: SystemState;
  private paused: boolean = false;
  private actionIdCounter: number = 0;
  private executor: ((action: string, params: Record<string, any>) => Promise<any>) | null = null;
  
  constructor(config: Partial<ActionEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.state = {
      runningActions: new Map(),
      openWindows: [],
      runningApps: new Set(),
      actionsExecuted: 0,
      actionsSucceeded: 0,
      actionsFailed: 0
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EXECUTOR REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Register the action executor function
   * This should be the systemExecutor.execute or similar
   */
  setExecutor(executor: (action: string, params: Record<string, any>) => Promise<any>): void {
    this.executor = executor;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ACTION QUEUEING
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Queue a single action for execution
   */
  enqueue(
    action: string,
    params: Record<string, any> = {},
    options: Partial<Pick<QueuedAction, 'priority' | 'dependsOn' | 'timeout' | 'maxRetries' | 'onComplete' | 'onError'>> = {}
  ): string {
    const id = this.generateId();
    
    const queuedAction: QueuedAction = {
      id,
      action,
      params,
      priority: options.priority || 'normal',
      status: 'pending',
      createdAt: Date.now(),
      dependsOn: options.dependsOn,
      timeout: options.timeout || this.config.defaultTimeout,
      maxRetries: options.maxRetries ?? this.config.defaultRetries,
      retries: options.maxRetries ?? this.config.defaultRetries,
      onComplete: options.onComplete,
      onError: options.onError
    };
    
    // Check if dependencies are met
    if (this.hasPendingDependencies(queuedAction)) {
      queuedAction.status = 'blocked';
    }
    
    // Insert in priority order
    this.insertByPriority(queuedAction);
    
    this.emitEvent({ type: 'queued', action: queuedAction });
    console.log(`[ActionEngine] Queued: ${action} (id: ${id}, priority: ${queuedAction.priority})`);
    
    // Try to process queue
    this.processQueue();
    
    return id;
  }
  
  /**
   * Queue multiple actions for parallel execution
   */
  queueParallel(
    actions: Array<{ action: string; params?: Record<string, any>; priority?: ActionPriority }>
  ): string[] {
    return actions.map(a => this.enqueue(a.action, a.params || {}, { priority: a.priority }));
  }
  
  /**
   * Queue actions for sequential execution (each depends on previous)
   */
  queueSequential(
    actions: Array<{ action: string; params?: Record<string, any> }>,
    basePriority: ActionPriority = 'normal'
  ): string[] {
    const ids: string[] = [];
    let previousId: string | undefined;
    
    for (const a of actions) {
      const id = this.enqueue(a.action, a.params || {}, {
        priority: basePriority,
        dependsOn: previousId ? [previousId] : undefined
      });
      ids.push(id);
      previousId = id;
    }
    
    return ids;
  }
  
  /**
   * Create an execution plan (named group of actions)
   */
  createPlan(
    name: string,
    actions: Array<{ action: string; params?: Record<string, any> }>,
    parallel: boolean = true
  ): ExecutionPlan {
    const planId = `plan_${this.generateId()}`;
    
    const queuedActions = actions.map((a, index) => ({
      id: this.generateId(),
      action: a.action,
      params: a.params || {},
      priority: 'normal' as ActionPriority,
      status: 'pending' as ActionStatus,
      createdAt: Date.now(),
      dependsOn: parallel ? undefined : (index > 0 ? [actions[index - 1].action] : undefined)
    }));
    
    return {
      id: planId,
      name,
      actions: queuedActions,
      parallel,
      createdAt: Date.now(),
      status: 'pending'
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // QUEUE PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Process the queue - execute pending actions up to maxConcurrent
   */
  private async processQueue(): Promise<void> {
    if (this.paused) return;
    if (!this.executor) {
      console.warn('[ActionEngine] No executor registered');
      return;
    }
    
    // Check how many slots are available
    const available = this.config.maxConcurrent - this.running.size;
    if (available <= 0) return;
    
    // Get ready actions (pending, not blocked)
    const ready = this.queue.filter(a => 
      a.status === 'pending' && !this.hasPendingDependencies(a)
    );
    
    // Execute up to available slots
    const toExecute = ready.slice(0, available);
    
    for (const action of toExecute) {
      this.executeAction(action);
    }
  }
  
  /**
   * Execute a single action
   */
  private async executeAction(action: QueuedAction): Promise<void> {
    if (!this.executor) return;
    
    // Update status
    action.status = 'running';
    action.startedAt = Date.now();
    this.running.set(action.id, action);
    this.state.runningActions.set(action.id, action);
    
    this.emitEvent({ type: 'started', action });
    console.log(`[ActionEngine] Executing: ${action.action} (id: ${action.id})`);
    
    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Action timed out')), action.timeout || this.config.defaultTimeout);
      });
      
      // Execute with timeout
      const result = await Promise.race([
        this.executor(action.action, action.params),
        timeoutPromise
      ]);
      
      // Success
      action.status = 'completed';
      action.completedAt = Date.now();
      action.result = result;
      
      this.state.actionsExecuted++;
      this.state.actionsSucceeded++;
      
      this.emitEvent({ type: 'completed', action, result });
      console.log(`[ActionEngine] Completed: ${action.action} (${action.completedAt - action.startedAt!}ms)`);
      
      // Call completion callback
      if (action.onComplete) {
        try {
          action.onComplete(result);
        } catch (e) {
          console.warn('[ActionEngine] onComplete callback error:', e);
        }
      }
      
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      
      // Check if we should retry
      if (action.retries && action.retries > 0) {
        action.retries--;
        action.status = 'pending';
        console.log(`[ActionEngine] Retrying: ${action.action} (${action.retries} left)`);
        
        // Re-queue with slight delay
        setTimeout(() => {
          if (action.status === 'pending') {
            this.processQueue();
          }
        }, 1000);
        
      } else {
        // Failed
        action.status = 'failed';
        action.completedAt = Date.now();
        action.error = errorMsg;
        
        this.state.actionsExecuted++;
        this.state.actionsFailed++;
        this.state.lastError = errorMsg;
        
        this.emitEvent({ type: 'failed', action, error: errorMsg });
        console.error(`[ActionEngine] Failed: ${action.action} - ${errorMsg}`);
        
        // Call error callback
        if (action.onError) {
          try {
            action.onError(error);
          } catch (e) {
            console.warn('[ActionEngine] onError callback error:', e);
          }
        }
      }
    } finally {
      // Clean up
      this.running.delete(action.id);
      this.state.runningActions.delete(action.id);
      this.removeFromQueue(action.id);
      
      if (action.status === 'completed' || action.status === 'failed') {
        this.completed.set(action.id, action);
        this.state.lastAction = action;
      }
      
      // Unblock dependent actions
      this.unblockDependents(action.id);
      
      // Process more actions
      this.processQueue();
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // DEPENDENCY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  
  private hasPendingDependencies(action: QueuedAction): boolean {
    if (!action.dependsOn || action.dependsOn.length === 0) return false;
    
    return action.dependsOn.some(depId => {
      const completed = this.completed.get(depId);
      return !completed || completed.status !== 'completed';
    });
  }
  
  private unblockDependents(completedId: string): void {
    for (const action of this.queue) {
      if (action.status === 'blocked' && action.dependsOn?.includes(completedId)) {
        if (!this.hasPendingDependencies(action)) {
          action.status = 'pending';
          console.log(`[ActionEngine] Unblocked: ${action.action}`);
        }
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // QUEUE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  
  private insertByPriority(action: QueuedAction): void {
    const priority = PRIORITY_VALUES[action.priority];
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      if (PRIORITY_VALUES[this.queue[i].priority] < priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, action);
  }
  
  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex(a => a.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }
  
  private generateId(): string {
    return `action_${Date.now()}_${++this.actionIdCounter}`;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CONTROL METHODS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Cancel an action by ID
   */
  cancel(id: string): boolean {
    const action = this.queue.find(a => a.id === id) || this.running.get(id);
    
    if (action && action.status !== 'completed' && action.status !== 'failed') {
      action.status = 'cancelled';
      action.completedAt = Date.now();
      this.removeFromQueue(id);
      this.running.delete(id);
      this.emitEvent({ type: 'cancelled', action });
      console.log(`[ActionEngine] Cancelled: ${action.action}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Cancel all pending/running actions
   */
  cancelAll(): number {
    let count = 0;
    
    for (const action of [...this.queue]) {
      if (this.cancel(action.id)) count++;
    }
    
    for (const [id] of this.running) {
      if (this.cancel(id)) count++;
    }
    
    return count;
  }
  
  /**
   * Pause queue processing
   */
  pause(): void {
    this.paused = true;
    console.log('[ActionEngine] Paused');
  }
  
  /**
   * Resume queue processing
   */
  resume(): void {
    this.paused = false;
    console.log('[ActionEngine] Resumed');
    this.processQueue();
  }
  
  /**
   * Clear completed actions history
   */
  clearHistory(): void {
    this.completed.clear();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE & STATUS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current queue status
   */
  getStatus(): {
    queueLength: number;
    running: number;
    paused: boolean;
    stats: { executed: number; succeeded: number; failed: number };
  } {
    return {
      queueLength: this.queue.length,
      running: this.running.size,
      paused: this.paused,
      stats: {
        executed: this.state.actionsExecuted,
        succeeded: this.state.actionsSucceeded,
        failed: this.state.actionsFailed
      }
    };
  }
  
  /**
   * Get action by ID
   */
  getAction(id: string): QueuedAction | undefined {
    return this.queue.find(a => a.id === id) 
      || this.running.get(id) 
      || this.completed.get(id);
  }
  
  /**
   * Get all queued actions
   */
  getQueue(): QueuedAction[] {
    return [...this.queue];
  }
  
  /**
   * Get running actions
   */
  getRunning(): QueuedAction[] {
    return Array.from(this.running.values());
  }
  
  /**
   * Get system state
   */
  getState(): SystemState {
    return { ...this.state };
  }
  
  /**
   * Update system state (for external state tracking)
   */
  updateState(updates: Partial<SystemState>): void {
    Object.assign(this.state, updates);
    this.emitEvent({ type: 'state_changed', state: updates });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────────────────────────────────────────
  
  private emitEvent(event: ActionEvent): void {
    this.emit('action', event);
    this.emit(event.type, event);
  }
  
  /**
   * Subscribe to action events
   */
  onAction(handler: ActionEventHandler): () => void {
    this.on('action', handler);
    return () => this.off('action', handler);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let engineInstance: ActionEngine | null = null;

/**
 * Get or create ActionEngine instance
 */
export function getActionEngine(config?: Partial<ActionEngineConfig>): ActionEngine {
  if (!engineInstance) {
    engineInstance = new ActionEngine(config);
  }
  return engineInstance;
}

/**
 * Initialize ActionEngine with executor
 */
export function initializeActionEngine(
  executor: (action: string, params: Record<string, any>) => Promise<any>,
  config?: Partial<ActionEngineConfig>
): ActionEngine {
  const engine = getActionEngine(config);
  engine.setExecutor(executor);
  return engine;
}

export default ActionEngine;
