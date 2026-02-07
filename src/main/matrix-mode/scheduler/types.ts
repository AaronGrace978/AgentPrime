/**
 * Matrix Mode Scheduler - Type Definitions
 * Task scheduling, cron jobs, webhooks, and triggers
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TriggerType = 'cron' | 'webhook' | 'email' | 'file' | 'manual' | 'event';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  type: TriggerType;
  
  // Cron configuration
  cronExpression?: string;
  
  // Task payload
  action: TaskAction;
  
  // Metadata
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  
  // Execution settings
  timeout?: number; // ms
  retries?: number;
  retryDelay?: number; // ms
  
  // Results
  runCount: number;
  successCount: number;
  failureCount: number;
  lastResult?: TaskResult;
}

export interface TaskAction {
  type: 'message' | 'command' | 'webhook' | 'integration' | 'workflow';
  
  // For message actions
  channelId?: string;
  message?: string;
  
  // For command actions
  command?: string;
  args?: string[];
  
  // For webhook actions
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  
  // For integration actions
  integration?: string;
  integrationAction?: string;
  integrationParams?: Record<string, any>;
  
  // For workflow actions
  workflowId?: string;
}

export interface TaskResult {
  taskId: string;
  runId: string;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  output?: any;
  error?: string;
  retryCount: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  output?: any;
  error?: string;
  retryCount: number;
  triggeredBy: TriggerType | 'retry';
}

export interface WebhookConfig {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY';
  taskId?: string;
  secret?: string;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  triggerCount: number;
}

export interface TriggerConfig {
  id: string;
  type: TriggerType;
  taskId: string;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: number;
  lastTriggeredAt?: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  webhookPort: number;
  webhookPath: string;
  maxConcurrentTasks: number;
  defaultTimeout: number;
  defaultRetries: number;
  persistTasks: boolean;
  tasksDbPath?: string;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: true,
  webhookPort: 18790,
  webhookPath: '/webhooks',
  maxConcurrentTasks: 5,
  defaultTimeout: 60000,
  defaultRetries: 3,
  persistTasks: true
};

export interface CronJobInfo {
  expression: string;
  nextRun: Date | null;
  previousRun: Date | null;
  isRunning: boolean;
}
