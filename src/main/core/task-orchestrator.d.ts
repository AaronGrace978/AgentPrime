/**
 * AgentPrime - Task Orchestrator
 * Plans and sequences agent work with intelligent task decomposition
 * and dependency management
 */
import type { Subtask, CoordinationStrategy } from '../../types/agent-coordination';
/**
 * Task plan with decomposed subtasks and execution strategy
 */
export interface TaskPlan {
    id: string;
    originalTask: string;
    subtasks: Subtask[];
    executionStrategy: CoordinationStrategy;
    estimatedDuration: number;
    dependencies: TaskDependency[];
    sharedContext: Record<string, any>;
    createdAt: number;
}
/**
 * Dependency between tasks or subtasks
 */
export interface TaskDependency {
    from: string;
    to: string;
    type: 'hard' | 'soft' | 'data';
    description: string;
}
/**
 * Task Orchestrator - Plans and sequences agent work
 */
export declare class TaskOrchestrator {
    private plans;
    private coordinator;
    /**
     * Break down a complex request into agent-specific tasks
     */
    decomposeTask(task: string, context: {
        workspacePath: string;
        files?: string[];
        language?: string;
        projectType?: string;
        existingCode?: string;
    }): Promise<TaskPlan>;
    /**
     * Sequence tasks based on dependencies
     */
    sequenceTasks(plan: TaskPlan): Subtask[][];
    /**
     * Manage shared context between agents
     */
    buildSharedContext(plan: TaskPlan, completedSubtasks: Map<string, any>): Record<string, any>;
    /**
     * Handle rollback on failures
     */
    rollbackPlan(plan: TaskPlan, failedSubtaskId: string): Promise<void>;
    /**
     * Identify task type (creation, modification, refactoring, etc.)
     */
    private identifyTaskType;
    /**
     * Assess task complexity
     */
    private assessComplexity;
    /**
     * Determine required agents for task
     */
    private determineRequiredAgents;
    /**
     * Create subtasks for agents
     */
    private createSubtasks;
    /**
     * Build agent-specific task description
     */
    private buildAgentSpecificTask;
    /**
     * Identify dependencies between subtasks
     */
    private identifyDependencies;
    /**
     * Determine execution strategy
     */
    private determineExecutionStrategy;
    /**
     * Estimate total duration
     */
    private estimateTotalDuration;
    /**
     * Estimate duration for an agent
     */
    private estimateAgentDuration;
    /**
     * Get semantic context for task
     */
    private getSemanticContext;
    /**
     * Get plan by ID
     */
    getPlan(planId: string): TaskPlan | undefined;
    /**
     * Get statistics
     */
    getStats(): {
        totalPlans: number;
        averageSubtasks: number;
        averageDuration: number;
    };
}
export declare function getTaskOrchestrator(): TaskOrchestrator;
//# sourceMappingURL=task-orchestrator.d.ts.map