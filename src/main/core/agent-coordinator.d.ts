/**
 * AgentPrime - Agent Coordinator
 * Orchestrates complex multi-agent tasks with dependency resolution,
 * parallel execution, and conflict resolution
 */
import type { AgentRole } from '../agent/specialized-agents';
import type { SubtaskResult, TaskOutcome, CoordinationConfig, AgentConflict } from '../../types/agent-coordination';
/**
 * Agent Coordinator - Orchestrates complex multi-agent tasks
 */
export declare class AgentCoordinator {
    private config;
    private activeTasks;
    private taskHistory;
    constructor(config?: Partial<CoordinationConfig>);
    /**
     * Orchestrate a complex task across multiple agents
     */
    orchestrateComplexTask(task: string, context: {
        workspacePath: string;
        files?: string[];
        language?: string;
        projectType?: string;
    }): Promise<{
        success: boolean;
        results: Map<AgentRole, SubtaskResult>;
        conflicts: AgentConflict[];
        outcome: TaskOutcome;
    }>;
    /**
     * Coordinate multiple agents for a single task
     */
    coordinateAgents(agents: AgentRole[], task: string, sharedContext: Record<string, any>): Promise<Map<AgentRole, SubtaskResult>>;
    /**
     * Learn from task outcomes to improve future coordination
     */
    learnFromOutcomes(outcomes: TaskOutcome[]): Promise<void>;
    /**
     * Decompose a complex task into subtasks
     */
    private decomposeTask;
    /**
     * Build dependency graph from subtasks
     */
    private buildDependencyGraph;
    /**
     * Resolve execution order based on dependencies
     */
    private resolveExecutionOrder;
    /**
     * Execute subtasks according to coordination strategy
     */
    private executeSubtasks;
    /**
     * Execute a single subtask
     */
    private executeSubtask;
    /**
     * Aggregate results from all subtasks
     */
    private aggregateResults;
    /**
     * Detect and resolve conflicts between agent outputs
     */
    private detectAndResolveConflicts;
    /**
     * Detect cycles in dependency graph
     */
    private detectCycles;
    /**
     * Rollback a failed task
     */
    private rollbackTask;
    /**
     * Learn from a task outcome
     */
    private learnFromOutcome;
    /**
     * Extract patterns used in task execution
     */
    private extractPatternsUsed;
    /**
     * Extract mistakes from failed subtasks
     */
    private extractMistakes;
    /**
     * Build subtask description from task and role
     */
    private buildSubtaskDescription;
    /**
     * Estimate duration for a role
     */
    private estimateDuration;
    /**
     * Generate unique task ID
     */
    private generateTaskId;
    /**
     * Chunk array into smaller arrays
     */
    private chunkArray;
    /**
     * Get coordination statistics
     */
    getStats(): {
        activeTasks: number;
        totalTasks: number;
        successRate: number;
        averageDuration: number;
    };
}
export declare function getAgentCoordinator(): AgentCoordinator;
//# sourceMappingURL=agent-coordinator.d.ts.map