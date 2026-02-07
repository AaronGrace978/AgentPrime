/**
 * ActionEngine Types
 * Parallel action execution with state tracking
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ActionPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

export type ActionStatus = 
  | 'pending'      // In queue, not started
  | 'running'      // Currently executing
  | 'completed'    // Finished successfully
  | 'failed'       // Finished with error
  | 'cancelled'    // Cancelled before completion
  | 'blocked';     // Waiting on dependency

export interface QueuedAction {
  id: string;
  action: string;
  params: Record<string, any>;
  priority: ActionPriority;
  status: ActionStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
  dependsOn?: string[];       // IDs of actions this depends on
  timeout?: number;           // Max execution time in ms
  retries?: number;           // Remaining retry attempts
  maxRetries?: number;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
}

export interface ActionResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

export interface SystemState {
  // Active processes
  runningActions: Map<string, QueuedAction>;
  
  // Window state
  activeWindow?: string;
  openWindows: string[];
  
  // App state
  runningApps: Set<string>;
  
  // Context
  lastAction?: QueuedAction;
  lastError?: string;
  
  // Metrics
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionEngineConfig {
  maxConcurrent: number;          // Max parallel actions
  defaultTimeout: number;         // Default action timeout in ms
  defaultRetries: number;         // Default retry attempts
  priorityBoost: boolean;         // Boost priority of dependent actions
  enableStateTracking: boolean;   // Track system state
}

export const DEFAULT_ENGINE_CONFIG: ActionEngineConfig = {
  maxConcurrent: 5,
  defaultTimeout: 30000,
  defaultRetries: 1,
  priorityBoost: true,
  enableStateTracking: true
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION PLAN
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutionPlan {
  id: string;
  name: string;
  actions: QueuedAction[];
  parallel: boolean;             // Execute all in parallel or sequential
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export type ActionEvent = 
  | { type: 'queued'; action: QueuedAction }
  | { type: 'started'; action: QueuedAction }
  | { type: 'completed'; action: QueuedAction; result: any }
  | { type: 'failed'; action: QueuedAction; error: string }
  | { type: 'cancelled'; action: QueuedAction }
  | { type: 'state_changed'; state: Partial<SystemState> };

export type ActionEventHandler = (event: ActionEvent) => void;
