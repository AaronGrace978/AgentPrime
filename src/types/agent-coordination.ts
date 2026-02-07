/**
 * AgentPrime - Agent Coordination Types
 * Type definitions for multi-agent coordination system
 */

import type { AgentRole } from '../main/agent/specialized-agents';

/**
 * Represents a subtask that can be executed by an agent
 */
export interface Subtask {
  id: string;
  description: string;
  assignedRole: AgentRole;
  dependencies: string[]; // IDs of subtasks that must complete first
  priority: number; // Higher = more important
  estimatedDuration: number; // milliseconds
  context: Record<string, any>; // Additional context for the agent
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: SubtaskResult;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Result from a subtask execution
 */
export interface SubtaskResult {
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  toolsExecuted: any[];
  metadata?: Record<string, any>;
}

/**
 * Task outcome for learning
 */
export interface TaskOutcome {
  taskId: string;
  originalTask: string;
  subtasks: Subtask[];
  overallSuccess: boolean;
  duration: number;
  patternsUsed: string[];
  mistakes: string[];
  timestamp: number;
}

/**
 * Coordination strategy for task execution
 */
export type CoordinationStrategy = 
  | 'sequential' // Execute one at a time
  | 'parallel' // Execute all in parallel
  | 'dependency' // Execute based on dependencies
  | 'priority' // Execute by priority order
  | 'hybrid'; // Mix of strategies

/**
 * Agent coordination configuration
 */
export interface CoordinationConfig {
  strategy: CoordinationStrategy;
  maxParallelAgents: number;
  timeout: number; // milliseconds
  retryOnFailure: boolean;
  maxRetries: number;
  enableRollback: boolean;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolution = 
  | 'last-wins' // Last agent's output wins
  | 'merge' // Attempt to merge outputs
  | 'user-choice' // Ask user to choose
  | 'priority' // Higher priority agent wins
  | 'fail'; // Fail the task

/**
 * Conflict between agent outputs
 */
export interface AgentConflict {
  subtaskIds: string[];
  conflictType: 'file-overwrite' | 'dependency-cycle' | 'resource-contention' | 'output-mismatch';
  description: string;
  resolution?: ConflictResolution;
  resolved: boolean;
}

