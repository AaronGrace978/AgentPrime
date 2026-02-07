/**
 * Matrix Mode Scheduler System
 * Task scheduling, cron jobs, webhooks, and triggers
 * 
 * Features:
 * - Cron-based task scheduling
 * - Persistent task queue with retry logic
 * - Webhook endpoints for external triggers
 * - File watcher and event-based triggers
 * - Concurrent task execution with limits
 */

export * from './types';
export { CronManager, getNextRunTime, validateCronExpression, CRON_PRESETS } from './cron-manager';
export { TaskQueue, getTaskQueue, TaskExecutor } from './task-queue';
export { WebhookServer, getWebhookServer, WebhookRequest, WebhookResponse, WebhookHandler } from './webhook-handler';
export { TriggerEngine, getTriggerEngine, TriggerEvent, TriggerCallback } from './trigger-engine';

import { ScheduledTask, TaskResult, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from './types';
import { CronManager } from './cron-manager';
import { TaskQueue, getTaskQueue } from './task-queue';
import { WebhookServer, getWebhookServer } from './webhook-handler';
import { TriggerEngine, getTriggerEngine } from './trigger-engine';

/**
 * Unified Scheduler - combines all scheduling components
 */
export class Scheduler {
  private config: SchedulerConfig;
  private taskQueue: TaskQueue;
  private cronManager: CronManager;
  private webhookServer: WebhookServer;
  private triggerEngine: TriggerEngine;
  private taskExecutor: ((task: ScheduledTask) => Promise<any>) | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    
    // Create task executor wrapper
    const executeTask = async (task: ScheduledTask): Promise<TaskResult> => {
      const startedAt = Date.now();
      const runId = `run-${Date.now()}`;
      
      try {
        let output: any;
        
        if (this.taskExecutor) {
          output = await this.taskExecutor(task);
        } else {
          // Default executor - just log
          console.log(`[Scheduler] Executing task: ${task.name}`);
          output = { executed: true };
        }
        
        return {
          taskId: task.id,
          runId,
          status: 'completed',
          startedAt,
          completedAt: Date.now(),
          duration: Date.now() - startedAt,
          output,
          retryCount: 0
        };
      } catch (error: any) {
        return {
          taskId: task.id,
          runId,
          status: 'failed',
          startedAt,
          completedAt: Date.now(),
          duration: Date.now() - startedAt,
          error: error.message,
          retryCount: 0
        };
      }
    };

    this.taskQueue = new TaskQueue(this.config);
    this.cronManager = new CronManager(executeTask);
    this.webhookServer = new WebhookServer(this.config, this.taskQueue);
    this.triggerEngine = new TriggerEngine(this.taskQueue);

    // Set queue executor
    this.taskQueue.setExecutor(async (task, run) => {
      if (this.taskExecutor) {
        return this.taskExecutor(task);
      }
      return { executed: true };
    });
  }

  /**
   * Set the task executor function
   */
  setTaskExecutor(executor: (task: ScheduledTask) => Promise<any>): void {
    this.taskExecutor = executor;
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.taskQueue.initialize();
    
    if (this.config.enabled) {
      this.cronManager.start();
      await this.webhookServer.start();
      this.triggerEngine.startAll();
    }

    this.initialized = true;
    console.log('[Scheduler] Initialized');
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    this.cronManager.stop();
    await this.webhookServer.stop();
    this.triggerEngine.stopAll();
    this.initialized = false;
    console.log('[Scheduler] Shutdown complete');
  }

  // Task management
  
  /**
   * Create a new scheduled task
   */
  createTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'successCount' | 'failureCount'>): ScheduledTask {
    const fullTask: ScheduledTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      successCount: 0,
      failureCount: 0
    };

    this.taskQueue.registerTask(fullTask);

    // Register with cron if it has a cron expression
    if (fullTask.cronExpression && fullTask.type === 'cron') {
      this.cronManager.register(fullTask);
    }

    return fullTask;
  }

  /**
   * Get a task
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.taskQueue.getTask(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ScheduledTask[] {
    return this.taskQueue.getAllTasks();
  }

  /**
   * Update a task
   */
  updateTask(taskId: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
    const task = this.taskQueue.updateTask(taskId, updates);
    
    if (task && task.cronExpression && task.type === 'cron') {
      this.cronManager.update(task);
    }
    
    return task;
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): void {
    this.cronManager.unregister(taskId);
    this.taskQueue.unregisterTask(taskId);
    
    // Remove associated triggers
    const triggers = this.triggerEngine.getTriggersForTask(taskId);
    for (const trigger of triggers) {
      this.triggerEngine.unregisterTrigger(trigger.id);
    }
  }

  /**
   * Run a task immediately
   */
  async runTask(taskId: string): Promise<TaskResult | null> {
    const task = this.taskQueue.getTask(taskId);
    if (!task) return null;

    return this.cronManager.trigger(taskId);
  }

  /**
   * Enqueue a task
   */
  enqueueTask(taskId: string): void {
    this.taskQueue.enqueue(taskId, 'manual');
  }

  // Cron shortcuts

  /**
   * Schedule a task with cron expression
   */
  schedule(
    name: string,
    cronExpression: string,
    action: ScheduledTask['action'],
    options: Partial<ScheduledTask> = {}
  ): ScheduledTask {
    return this.createTask({
      name,
      type: 'cron',
      cronExpression,
      action,
      enabled: true,
      ...options
    });
  }

  // Webhook shortcuts

  /**
   * Create a webhook-triggered task
   */
  createWebhook(
    name: string,
    webhookPath: string,
    action: ScheduledTask['action'],
    options: { secret?: string; method?: 'GET' | 'POST' | 'ANY' } = {}
  ): { task: ScheduledTask; webhookUrl: string } {
    const task = this.createTask({
      name,
      type: 'webhook',
      action,
      enabled: true
    });

    const webhook = this.webhookServer.registerWebhook({
      id: `webhook-${task.id}`,
      path: webhookPath,
      method: options.method || 'POST',
      taskId: task.id,
      secret: options.secret,
      enabled: true
    });

    return {
      task,
      webhookUrl: this.webhookServer.generateWebhookUrl(webhookPath)
    };
  }

  // Trigger shortcuts

  /**
   * Create a file watcher task
   */
  watchFile(
    name: string,
    watchPath: string,
    action: ScheduledTask['action'],
    options: { pattern?: string; recursive?: boolean } = {}
  ): ScheduledTask {
    const task = this.createTask({
      name,
      type: 'file',
      action,
      enabled: true
    });

    this.triggerEngine.createFileWatcher(task.id, watchPath, options);
    return task;
  }

  /**
   * Create an event-triggered task
   */
  onEvent(
    name: string,
    eventName: string,
    action: ScheduledTask['action']
  ): ScheduledTask {
    const task = this.createTask({
      name,
      type: 'event',
      action,
      enabled: true
    });

    this.triggerEngine.createEventTrigger(task.id, eventName);
    return task;
  }

  /**
   * Emit an event
   */
  emit(eventName: string, data?: any): void {
    this.triggerEngine.emit(eventName, data);
  }

  // Status

  /**
   * Get scheduler status
   */
  getStatus(): {
    enabled: boolean;
    initialized: boolean;
    webhookUrl: string;
    queueStatus: { pending: number; running: number; historySize: number };
    cronJobs: number;
    triggers: number;
  } {
    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      webhookUrl: this.webhookServer.getServerUrl(),
      queueStatus: this.taskQueue.getQueueStatus(),
      cronJobs: this.cronManager.getAllJobs().size,
      triggers: this.triggerEngine.getAllTriggers().length
    };
  }
}

// Singleton instance
let schedulerInstance: Scheduler | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler(config);
  }
  return schedulerInstance;
}

/**
 * Initialize the scheduler system
 */
export async function initializeScheduler(config?: Partial<SchedulerConfig>): Promise<Scheduler> {
  const scheduler = getScheduler(config);
  await scheduler.initialize();
  return scheduler;
}

/**
 * Shutdown the scheduler system
 */
export async function shutdownScheduler(): Promise<void> {
  if (schedulerInstance) {
    await schedulerInstance.shutdown();
  }
}

export default Scheduler;
