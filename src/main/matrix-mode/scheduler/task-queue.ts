/**
 * Matrix Mode Task Queue
 * Persistent task queue with retry logic and concurrent execution
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { 
  ScheduledTask, 
  TaskResult, 
  TaskRun, 
  TaskStatus,
  SchedulerConfig,
  DEFAULT_SCHEDULER_CONFIG
} from './types';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface TaskExecutor {
  (task: ScheduledTask, run: TaskRun): Promise<any>;
}

export class TaskQueue {
  private config: SchedulerConfig;
  private tasks: Map<string, ScheduledTask> = new Map();
  private queue: TaskRun[] = [];
  private running: Map<string, TaskRun> = new Map();
  private history: TaskRun[] = [];
  private maxHistorySize: number = 1000;
  private executor: TaskExecutor | null = null;
  private processing: boolean = false;
  private dbPath: string;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.dbPath = this.config.tasksDbPath || path.join(userDataPath, 'matrix-tasks.json');
  }

  /**
   * Initialize the task queue
   */
  async initialize(): Promise<void> {
    if (this.config.persistTasks) {
      await this.loadTasks();
    }
    console.log(`[TaskQueue] Initialized with ${this.tasks.size} tasks`);
  }

  /**
   * Set the task executor
   */
  setExecutor(executor: TaskExecutor): void {
    this.executor = executor;
  }

  /**
   * Load tasks from disk
   */
  private async loadTasks(): Promise<void> {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf-8');
        const saved = JSON.parse(data);
        
        if (saved.tasks) {
          for (const task of saved.tasks) {
            this.tasks.set(task.id, task);
          }
        }
        
        if (saved.queue) {
          this.queue = saved.queue.filter((run: TaskRun) => run.status === 'pending');
        }
        
        if (saved.history) {
          this.history = saved.history.slice(-this.maxHistorySize);
        }
      }
    } catch (error) {
      console.warn('[TaskQueue] Failed to load tasks:', error);
    }
  }

  /**
   * Save tasks to disk
   */
  private async saveTasks(): Promise<void> {
    if (!this.config.persistTasks) return;

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        tasks: Array.from(this.tasks.values()),
        queue: this.queue,
        history: this.history.slice(-this.maxHistorySize)
      };

      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[TaskQueue] Failed to save tasks:', error);
    }
  }

  /**
   * Register a task
   */
  registerTask(task: ScheduledTask): void {
    this.tasks.set(task.id, task);
    this.saveTasks();
    console.log(`[TaskQueue] Registered task: ${task.name}`);
  }

  /**
   * Unregister a task
   */
  unregisterTask(taskId: string): void {
    this.tasks.delete(taskId);
    // Remove any pending runs for this task
    this.queue = this.queue.filter(run => run.taskId !== taskId);
    this.saveTasks();
    console.log(`[TaskQueue] Unregistered task: ${taskId}`);
  }

  /**
   * Get a task
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Update a task
   */
  updateTask(taskId: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updated = { ...task, ...updates, updatedAt: Date.now() };
    this.tasks.set(taskId, updated);
    this.saveTasks();
    
    return updated;
  }

  /**
   * Enqueue a task for execution
   */
  enqueue(taskId: string, triggeredBy: TaskRun['triggeredBy'] = 'manual'): TaskRun {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const run: TaskRun = {
      id: generateId(),
      taskId,
      status: 'pending',
      startedAt: 0,
      retryCount: 0,
      triggeredBy
    };

    this.queue.push(run);
    this.saveTasks();

    // Start processing if not already
    this.processQueue();

    return run;
  }

  /**
   * Cancel a pending run
   */
  cancelRun(runId: string): boolean {
    const index = this.queue.findIndex(run => run.id === runId);
    if (index >= 0) {
      const run = this.queue[index];
      run.status = 'cancelled';
      run.completedAt = Date.now();
      this.queue.splice(index, 1);
      this.history.push(run);
      this.saveTasks();
      return true;
    }
    return false;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    pending: number;
    running: number;
    historySize: number;
  } {
    return {
      pending: this.queue.length,
      running: this.running.size,
      historySize: this.history.length
    };
  }

  /**
   * Get run history for a task
   */
  getTaskHistory(taskId: string, limit: number = 10): TaskRun[] {
    return this.history
      .filter(run => run.taskId === taskId)
      .slice(-limit);
  }

  /**
   * Get recent history
   */
  getRecentHistory(limit: number = 50): TaskRun[] {
    return this.history.slice(-limit);
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.running.size < this.config.maxConcurrentTasks) {
      const run = this.queue.shift();
      if (!run) continue;

      const task = this.tasks.get(run.taskId);
      if (!task || !task.enabled) {
        run.status = 'cancelled';
        run.completedAt = Date.now();
        run.error = task ? 'Task disabled' : 'Task not found';
        this.history.push(run);
        continue;
      }

      // Execute the task
      this.executeRun(task, run);
    }

    this.processing = false;
    this.saveTasks();
  }

  /**
   * Execute a run
   */
  private async executeRun(task: ScheduledTask, run: TaskRun): Promise<void> {
    run.status = 'running';
    run.startedAt = Date.now();
    this.running.set(run.id, run);

    const timeout = task.timeout || this.config.defaultTimeout;
    const maxRetries = task.retries ?? this.config.defaultRetries;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timeout')), timeout);
      });

      // Execute with timeout
      if (this.executor) {
        const result = await Promise.race([
          this.executor(task, run),
          timeoutPromise
        ]);
        
        run.output = result;
        run.status = 'completed';
      } else {
        throw new Error('No executor configured');
      }
    } catch (error: any) {
      run.error = error.message;
      
      // Retry logic
      if (run.retryCount < maxRetries) {
        run.retryCount++;
        run.status = 'pending';
        
        const retryDelay = task.retryDelay || 5000;
        setTimeout(() => {
          this.queue.push(run);
          this.processQueue();
        }, retryDelay * run.retryCount);
        
        console.log(`[TaskQueue] Task ${task.name} failed, retrying (${run.retryCount}/${maxRetries})`);
      } else {
        run.status = 'failed';
        task.failureCount++;
        console.error(`[TaskQueue] Task ${task.name} failed after ${maxRetries} retries:`, error);
      }
    } finally {
      if (run.status === 'completed' || run.status === 'failed') {
        run.completedAt = Date.now();
        this.running.delete(run.id);
        this.history.push(run);
        
        // Update task stats
        if (run.status === 'completed') {
          task.successCount++;
        }
        task.runCount++;
        task.lastRunAt = run.startedAt;
        task.lastResult = this.runToResult(run);
      }
      
      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Convert TaskRun to TaskResult
   */
  private runToResult(run: TaskRun): TaskResult {
    return {
      taskId: run.taskId,
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      duration: run.completedAt ? run.completedAt - run.startedAt : undefined,
      output: run.output,
      error: run.error,
      retryCount: run.retryCount
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
    this.saveTasks();
  }

  /**
   * Clear all tasks
   */
  clearAll(): void {
    this.tasks.clear();
    this.queue = [];
    this.history = [];
    this.saveTasks();
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): TaskRun[] {
    return Array.from(this.running.values());
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(runId: string, timeout: number = 60000): Promise<TaskRun | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check if completed in history
      const completed = this.history.find(run => run.id === runId);
      if (completed) {
        return completed;
      }

      // Check if still running
      if (!this.running.has(runId) && !this.queue.find(r => r.id === runId)) {
        return null;
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }
}

// Singleton instance
let taskQueueInstance: TaskQueue | null = null;

export function getTaskQueue(config?: Partial<SchedulerConfig>): TaskQueue {
  if (!taskQueueInstance) {
    taskQueueInstance = new TaskQueue(config);
  }
  return taskQueueInstance;
}

export default TaskQueue;
