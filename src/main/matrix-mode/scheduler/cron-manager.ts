/**
 * Matrix Mode Cron Manager
 * Cron expression parser and job scheduler
 */

import { ScheduledTask, TaskResult, CronJobInfo } from './types';

// Cron field parsers
interface CronField {
  min: number;
  max: number;
  values: Set<number>;
}

function parseCronField(field: string, min: number, max: number): CronField {
  const values = new Set<number>();
  
  if (field === '*') {
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return { min, max, values };
  }

  const parts = field.split(',');
  
  for (const part of parts) {
    if (part.includes('/')) {
      // Step values: */5 or 1-10/2
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      
      let start = min;
      let end = max;
      
      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(n => parseInt(n, 10));
        } else {
          start = parseInt(range, 10);
        }
      }
      
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part.includes('-')) {
      // Range: 1-5
      const [start, end] = part.split('-').map(n => parseInt(n, 10));
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else {
      // Single value
      values.add(parseInt(part, 10));
    }
  }
  
  return { min, max, values };
}

// Parse full cron expression (5 or 6 fields)
function parseCronExpression(expression: string): {
  second: CronField;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
} {
  const parts = expression.trim().split(/\s+/);
  
  // Support both 5-field (minute-based) and 6-field (second-based) cron
  if (parts.length === 5) {
    // minute hour dayOfMonth month dayOfWeek
    return {
      second: { min: 0, max: 59, values: new Set([0]) },
      minute: parseCronField(parts[0], 0, 59),
      hour: parseCronField(parts[1], 0, 23),
      dayOfMonth: parseCronField(parts[2], 1, 31),
      month: parseCronField(parts[3], 1, 12),
      dayOfWeek: parseCronField(parts[4], 0, 6)
    };
  } else if (parts.length === 6) {
    // second minute hour dayOfMonth month dayOfWeek
    return {
      second: parseCronField(parts[0], 0, 59),
      minute: parseCronField(parts[1], 0, 59),
      hour: parseCronField(parts[2], 0, 23),
      dayOfMonth: parseCronField(parts[3], 1, 31),
      month: parseCronField(parts[4], 1, 12),
      dayOfWeek: parseCronField(parts[5], 0, 6)
    };
  }
  
  throw new Error(`Invalid cron expression: ${expression}`);
}

// Get next run time from cron expression
function getNextRunTime(expression: string, after: Date = new Date()): Date | null {
  const cron = parseCronExpression(expression);
  const maxIterations = 366 * 24 * 60; // Max 1 year of minutes
  
  let current = new Date(after);
  current.setMilliseconds(0);
  current.setSeconds(current.getSeconds() + 1); // Start from next second
  
  for (let i = 0; i < maxIterations; i++) {
    // Check month
    if (!cron.month.values.has(current.getMonth() + 1)) {
      current.setMonth(current.getMonth() + 1, 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    // Check day of month and day of week
    const dom = current.getDate();
    const dow = current.getDay();
    
    if (!cron.dayOfMonth.values.has(dom) && !cron.dayOfWeek.values.has(dow)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    
    // Check hour
    if (!cron.hour.values.has(current.getHours())) {
      current.setHours(current.getHours() + 1, 0, 0, 0);
      continue;
    }
    
    // Check minute
    if (!cron.minute.values.has(current.getMinutes())) {
      current.setMinutes(current.getMinutes() + 1, 0, 0);
      continue;
    }
    
    // Check second
    if (!cron.second.values.has(current.getSeconds())) {
      current.setSeconds(current.getSeconds() + 1, 0);
      continue;
    }
    
    // Found a match
    return current;
  }
  
  return null;
}

// Validate cron expression
function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    parseCronExpression(expression);
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

// Common cron expression presets
export const CRON_PRESETS = {
  everyMinute: '* * * * *',
  every5Minutes: '*/5 * * * *',
  every15Minutes: '*/15 * * * *',
  every30Minutes: '*/30 * * * *',
  everyHour: '0 * * * *',
  everyDay: '0 0 * * *',
  everyDayAt9am: '0 9 * * *',
  everyWeek: '0 0 * * 0',
  everyMonth: '0 0 1 * *',
  everyWeekday: '0 9 * * 1-5',
  everyWeekend: '0 10 * * 0,6'
};

interface CronJob {
  task: ScheduledTask;
  nextRun: Date | null;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

export class CronManager {
  private jobs: Map<string, CronJob> = new Map();
  private taskExecutor: (task: ScheduledTask) => Promise<TaskResult>;
  private checkInterval: NodeJS.Timeout | null = null;
  private started: boolean = false;

  constructor(taskExecutor: (task: ScheduledTask) => Promise<TaskResult>) {
    this.taskExecutor = taskExecutor;
  }

  /**
   * Start the cron manager
   */
  start(): void {
    if (this.started) return;
    
    this.started = true;
    
    // Check for jobs to run every second
    this.checkInterval = setInterval(() => {
      this.checkJobs();
    }, 1000);

    console.log('[CronManager] Started');
  }

  /**
   * Stop the cron manager
   */
  stop(): void {
    if (!this.started) return;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all job timers
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearTimeout(job.timer);
      }
    }

    this.started = false;
    console.log('[CronManager] Stopped');
  }

  /**
   * Register a cron task
   */
  register(task: ScheduledTask): void {
    if (!task.cronExpression) {
      throw new Error('Task must have a cron expression');
    }

    const validation = validateCronExpression(task.cronExpression);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    const nextRun = task.enabled ? getNextRunTime(task.cronExpression) : null;

    this.jobs.set(task.id, {
      task,
      nextRun,
      timer: null,
      running: false
    });

    console.log(`[CronManager] Registered task: ${task.name} (${task.cronExpression}), next run: ${nextRun}`);
  }

  /**
   * Unregister a cron task
   */
  unregister(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      if (job.timer) {
        clearTimeout(job.timer);
      }
      this.jobs.delete(taskId);
      console.log(`[CronManager] Unregistered task: ${taskId}`);
    }
  }

  /**
   * Update a cron task
   */
  update(task: ScheduledTask): void {
    this.unregister(task.id);
    this.register(task);
  }

  /**
   * Enable/disable a task
   */
  setEnabled(taskId: string, enabled: boolean): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.task.enabled = enabled;
      job.nextRun = enabled && job.task.cronExpression 
        ? getNextRunTime(job.task.cronExpression) 
        : null;
    }
  }

  /**
   * Get job info
   */
  getJobInfo(taskId: string): CronJobInfo | null {
    const job = this.jobs.get(taskId);
    if (!job) return null;

    return {
      expression: job.task.cronExpression || '',
      nextRun: job.nextRun,
      previousRun: job.task.lastRunAt ? new Date(job.task.lastRunAt) : null,
      isRunning: job.running
    };
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Map<string, CronJobInfo> {
    const result = new Map<string, CronJobInfo>();
    
    for (const [id, job] of this.jobs) {
      result.set(id, {
        expression: job.task.cronExpression || '',
        nextRun: job.nextRun,
        previousRun: job.task.lastRunAt ? new Date(job.task.lastRunAt) : null,
        isRunning: job.running
      });
    }
    
    return result;
  }

  /**
   * Manually trigger a task
   */
  async trigger(taskId: string): Promise<TaskResult | null> {
    const job = this.jobs.get(taskId);
    if (!job) return null;

    return this.executeJob(job);
  }

  /**
   * Check and run due jobs
   */
  private checkJobs(): void {
    const now = new Date();

    for (const job of this.jobs.values()) {
      if (!job.task.enabled || job.running || !job.nextRun) {
        continue;
      }

      if (job.nextRun <= now) {
        this.executeJob(job);
      }
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(job: CronJob): Promise<TaskResult> {
    job.running = true;
    job.task.lastRunAt = Date.now();

    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let result: TaskResult = {
      taskId: job.task.id,
      runId,
      status: 'running',
      startedAt: Date.now(),
      retryCount: 0
    };

    try {
      console.log(`[CronManager] Executing task: ${job.task.name}`);
      result = await this.taskExecutor(job.task);
      job.task.successCount++;
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
      job.task.failureCount++;
      console.error(`[CronManager] Task failed: ${job.task.name}`, error);
    } finally {
      result.completedAt = Date.now();
      result.duration = result.completedAt - result.startedAt;
      job.task.lastResult = result;
      job.task.runCount++;
      job.running = false;

      // Schedule next run
      if (job.task.cronExpression && job.task.enabled) {
        job.nextRun = getNextRunTime(job.task.cronExpression);
        job.task.nextRunAt = job.nextRun?.getTime();
      }
    }

    return result;
  }

  /**
   * Get next run time for an expression
   */
  static getNextRunTime(expression: string, after?: Date): Date | null {
    return getNextRunTime(expression, after);
  }

  /**
   * Validate a cron expression
   */
  static validate(expression: string): { valid: boolean; error?: string } {
    return validateCronExpression(expression);
  }

  /**
   * Get common presets
   */
  static getPresets(): typeof CRON_PRESETS {
    return CRON_PRESETS;
  }
}

export { getNextRunTime, validateCronExpression, parseCronExpression };
export default CronManager;
