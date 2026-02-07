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
    dependencies: string[];
    priority: number;
    estimatedDuration: number;
    context: Record<string, any>;
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
export type CoordinationStrategy = 'sequential' | 'parallel' | 'dependency' | 'priority' | 'hybrid';
/**
 * Agent coordination configuration
 */
export interface CoordinationConfig {
    strategy: CoordinationStrategy;
    maxParallelAgents: number;
    timeout: number;
    retryOnFailure: boolean;
    maxRetries: number;
    enableRollback: boolean;
}
/**
 * Conflict resolution strategy
 */
export type ConflictResolution = 'last-wins' | 'merge' | 'user-choice' | 'priority' | 'fail';
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
//# sourceMappingURL=agent-coordination.d.ts.map