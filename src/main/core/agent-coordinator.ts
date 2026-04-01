/**
 * AgentPrime - Agent Coordinator
 * Orchestrates complex multi-agent tasks with dependency resolution,
 * parallel execution, and conflict resolution
 */

import type { AgentRole } from '../agent/specialized-agents';
import { routeToSpecialists, executeWithSpecialists } from '../agent/specialized-agents';
import { transactionManager } from './transaction-manager';
import type {
  Subtask,
  SubtaskResult,
  TaskOutcome,
  CoordinationStrategy,
  CoordinationConfig,
  ConflictResolution,
  AgentConflict
} from '../../types/agent-coordination';
import type { MirrorPattern } from '../../types';
import { getRelevantPatterns, storeTaskLearning } from '../mirror/mirror-singleton';
import * as crypto from 'crypto';

/**
 * Agent Coordinator - Orchestrates complex multi-agent tasks
 */
export class AgentCoordinator {
  private config: CoordinationConfig;
  private activeTasks: Map<string, CoordinatedTask> = new Map();
  private taskHistory: TaskOutcome[] = [];

  constructor(config?: Partial<CoordinationConfig>) {
    this.config = {
      strategy: 'hybrid',
      maxParallelAgents: 3,
      timeout: 300000, // 5 minutes
      retryOnFailure: true,
      maxRetries: 2,
      enableRollback: true,
      ...config
    };
  }

  /**
   * Orchestrate a complex task across multiple agents
   */
  async orchestrateComplexTask(
    task: string,
    context: {
      workspacePath: string;
      files?: string[];
      language?: string;
      projectType?: string;
    }
  ): Promise<{
    success: boolean;
    taskId: string;
    results: Map<AgentRole, SubtaskResult>;
    conflicts: AgentConflict[];
    outcome: TaskOutcome;
    error?: string;
  }> {
    const taskId = this.generateTaskId();
    const startTime = Date.now();

    console.log(`[AgentCoordinator] Starting orchestration for task: ${task.substring(0, 100)}...`);

    // Step 1: Decompose task into subtasks
    const subtasks = await this.decomposeTask(task, context);
    console.log(`[AgentCoordinator] Decomposed into ${subtasks.length} subtasks`);

    // Step 2: Resolve dependencies
    const dependencyGraph = this.buildDependencyGraph(subtasks);
    const executionOrder = this.resolveExecutionOrder(subtasks, dependencyGraph);
    console.log(`[AgentCoordinator] Execution order determined: ${executionOrder.length} phases`);

    // Step 3: Create coordinated task
    const coordinatedTask: CoordinatedTask = {
      id: taskId,
      originalTask: task,
      subtasks,
      dependencyGraph,
      executionOrder,
      results: new Map(),
      conflicts: [],
      startTime,
      context
    };

    this.activeTasks.set(taskId, coordinatedTask);

    try {
      // Step 4: Execute subtasks according to strategy
      const results = await this.executeSubtasks(coordinatedTask);

      // Step 5: Aggregate results
      const aggregatedResults = this.aggregateResults(coordinatedTask, results);

      // Step 6: Resolve conflicts
      const conflicts = await this.detectAndResolveConflicts(coordinatedTask, aggregatedResults);

      // Step 7: Build outcome for learning
      const outcome: TaskOutcome = {
        taskId,
        originalTask: task,
        subtasks: coordinatedTask.subtasks,
        overallSuccess: aggregatedResults.size > 0 && conflicts.every(c => c.resolved),
        duration: Date.now() - startTime,
        patternsUsed: await this.extractPatternsUsed(coordinatedTask),
        mistakes: this.extractMistakes(coordinatedTask),
        timestamp: Date.now()
      };

      // Step 8: Learn from outcome
      await this.learnFromOutcome(outcome);

      // Cleanup
      this.activeTasks.delete(taskId);
      this.taskHistory.push(outcome);

      return {
        success: outcome.overallSuccess,
        taskId,
        results: aggregatedResults,
        conflicts,
        outcome
      };
    } catch (error: any) {
      console.error(`[AgentCoordinator] Task ${taskId} failed:`, error);

      // Rollback if enabled
      if (this.config.enableRollback) {
        await this.rollbackTask(coordinatedTask);
      }

      // Build failure outcome
      const outcome: TaskOutcome = {
        taskId,
        originalTask: task,
        subtasks: coordinatedTask.subtasks,
        overallSuccess: false,
        duration: Date.now() - startTime,
        patternsUsed: [],
        mistakes: [error.message],
        timestamp: Date.now()
      };

      await this.learnFromOutcome(outcome);
      this.activeTasks.delete(taskId);
      this.taskHistory.push(outcome);

      return {
        success: false,
        taskId,
        results: new Map<AgentRole, SubtaskResult>(),
        conflicts: coordinatedTask.conflicts,
        outcome,
        error: error?.message || 'Task orchestration failed'
      };
    }
  }

  /**
   * Coordinate multiple agents for a single task
   */
  async coordinateAgents(
    agents: AgentRole[],
    task: string,
    sharedContext: Record<string, any>
  ): Promise<Map<AgentRole, SubtaskResult>> {
    const results = new Map<AgentRole, SubtaskResult>();

    // Create subtasks for each agent
    const subtasks: Subtask[] = agents.map((role, index) => ({
      id: `subtask-${Date.now()}-${index}`,
      description: `${role} task: ${task}`,
      assignedRole: role,
      dependencies: [],
      priority: agents.length - index, // First agent has highest priority
      estimatedDuration: 60000, // 1 minute default
      context: { ...sharedContext, role },
      status: 'pending'
    }));

    // Execute in parallel if strategy allows
    if (this.config.strategy === 'parallel' || this.config.strategy === 'hybrid') {
      const parallelLimit = Math.min(this.config.maxParallelAgents, agents.length);
      const executionGroups = this.chunkArray(agents, parallelLimit);

      for (const group of executionGroups) {
        const groupPromises = group.map(role => {
          const subtask = subtasks.find(s => s.assignedRole === role);
          if (!subtask) return Promise.resolve(null);
          return this.executeSubtask(subtask, sharedContext);
        });

        const groupResults = await Promise.all(groupPromises);
        groupResults.forEach((result, index) => {
          if (result) {
            results.set(group[index], result);
          }
        });
      }
    } else {
      // Sequential execution
      for (const role of agents) {
        const subtask = subtasks.find(s => s.assignedRole === role);
        if (subtask) {
          const result = await this.executeSubtask(subtask, sharedContext);
          if (result) {
            results.set(role, result);
          }
        }
      }
    }

    return results;
  }

  /**
   * Learn from task outcomes to improve future coordination
   */
  async learnFromOutcomes(outcomes: TaskOutcome[]): Promise<void> {
    for (const outcome of outcomes) {
      await this.learnFromOutcome(outcome);
    }
  }

  /**
   * Decompose a complex task into subtasks
   */
  private async decomposeTask(
    task: string,
    context: {
      workspacePath: string;
      files?: string[];
      language?: string;
      projectType?: string;
    }
  ): Promise<Subtask[]> {
    // Get relevant patterns for task decomposition
    const patterns = await getRelevantPatterns(task, 5);

    // Route to appropriate specialists
    const roles = routeToSpecialists(task, {
      files: context.files,
      language: context.language,
      projectType: context.projectType
    });

    // Create subtasks based on roles and patterns
    const subtasks: Subtask[] = [];
    let priority = roles.length;

    for (const role of roles) {
      // Determine dependencies based on role
      const dependencies: string[] = [];
      if (role === 'javascript_specialist' || role === 'python_specialist') {
        // Code specialists depend on tool orchestrator
        const orchestratorSubtask = subtasks.find(s => s.assignedRole === 'tool_orchestrator');
        if (orchestratorSubtask) {
          dependencies.push(orchestratorSubtask.id);
        }
      }
      if (role === 'integration_analyst') {
        // Integration analyst depends on all code specialists
        const codeSpecialists = subtasks.filter(s =>
          s.assignedRole === 'javascript_specialist' || s.assignedRole === 'python_specialist'
        );
        dependencies.push(...codeSpecialists.map(s => s.id));
      }

      const subtask: Subtask = {
        id: `subtask-${Date.now()}-${subtasks.length}`,
        description: this.buildSubtaskDescription(task, role, patterns),
        assignedRole: role,
        dependencies,
        priority: priority--,
        estimatedDuration: this.estimateDuration(role),
        context: {
          ...context,
          role,
          patterns: patterns.filter(p => p.type?.includes(role))
        },
        status: 'pending'
      };

      subtasks.push(subtask);
    }

    return subtasks;
  }

  /**
   * Build dependency graph from subtasks
   */
  private buildDependencyGraph(subtasks: Subtask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const subtask of subtasks) {
      graph.set(subtask.id, [...subtask.dependencies]);
    }

    return graph;
  }

  /**
   * Resolve execution order based on dependencies
   */
  private resolveExecutionOrder(
    subtasks: Subtask[],
    dependencyGraph: Map<string, string[]>
  ): Subtask[][] {
    const executionPhases: Subtask[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(subtasks.map(s => s.id));

    while (remaining.size > 0) {
      const currentPhase: Subtask[] = [];

      // Find subtasks with no unresolved dependencies
      for (const subtaskId of remaining) {
        const dependencies = dependencyGraph.get(subtaskId) || [];
        const allDependenciesMet = dependencies.every(dep => completed.has(dep));

        if (allDependenciesMet) {
          const subtask = subtasks.find(s => s.id === subtaskId);
          if (subtask) {
            currentPhase.push(subtask);
          }
        }
      }

      if (currentPhase.length === 0) {
        // Circular dependency detected - break it by priority
        const remainingSubtasks = Array.from(remaining)
          .map(id => subtasks.find(s => s.id === id))
          .filter((s): s is Subtask => s !== undefined)
          .sort((a, b) => b.priority - a.priority);

        if (remainingSubtasks.length > 0) {
          currentPhase.push(remainingSubtasks[0]);
          console.warn(`[AgentCoordinator] Breaking circular dependency by executing: ${remainingSubtasks[0].id}`);
        } else {
          break;
        }
      }

      executionPhases.push(currentPhase);
      currentPhase.forEach(s => {
        completed.add(s.id);
        remaining.delete(s.id);
      });
    }

    return executionPhases;
  }

  /**
   * Execute subtasks according to coordination strategy
   */
  private async executeSubtasks(coordinatedTask: CoordinatedTask): Promise<Map<string, SubtaskResult>> {
    const results = new Map<string, SubtaskResult>();

    for (const phase of coordinatedTask.executionOrder) {
      console.log(`[AgentCoordinator] Executing phase with ${phase.length} subtasks`);

      if (this.config.strategy === 'parallel' || this.config.strategy === 'hybrid') {
        // Execute phase in parallel (up to maxParallelAgents)
        const chunks = this.chunkArray(phase, this.config.maxParallelAgents);

        for (const chunk of chunks) {
          const chunkPromises = chunk.map(subtask =>
            this.executeSubtask(subtask, coordinatedTask.context)
          );

          const chunkResults = await Promise.all(chunkPromises);
          chunkResults.forEach((result, index) => {
            if (result) {
              results.set(chunk[index].id, result);
              coordinatedTask.subtasks.find(s => s.id === chunk[index].id)!.result = result;
              coordinatedTask.subtasks.find(s => s.id === chunk[index].id)!.status = 'completed';
            }
          });
        }
      } else {
        // Sequential execution
        for (const subtask of phase) {
          const result = await this.executeSubtask(subtask, coordinatedTask.context);
          if (result) {
            results.set(subtask.id, result);
            subtask.result = result;
            subtask.status = 'completed';
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single subtask
   */
  private async executeSubtask(
    subtask: Subtask,
    context: Record<string, any>
  ): Promise<SubtaskResult | null> {
    subtask.status = 'running';
    subtask.startedAt = Date.now();

    try {
      console.log(`[AgentCoordinator] Executing subtask ${subtask.id} with role ${subtask.assignedRole}`);

      const { results, executedTools } = await executeWithSpecialists(
        subtask.description,
        [subtask.assignedRole],
        {
          workspacePath: context.workspacePath,
          files: context.files,
          ...subtask.context
        }
      );

      const agentResult = results.get(subtask.assignedRole);
      if (!agentResult) {
        throw new Error(`No result from agent ${subtask.assignedRole}`);
      }

      // Extract file operations from executed tools
      const filesCreated: string[] = [];
      const filesModified: string[] = [];
      const toolsExecuted: any[] = [];

      if (executedTools) {
        for (const tool of executedTools) {
          toolsExecuted.push(tool);
          if (tool.toolCall?.function?.name === 'write_file') {
            const filePath = tool.toolCall.function.arguments?.path;
            if (filePath) {
              const exists = context.files?.includes(filePath);
              if (exists) {
                filesModified.push(filePath);
              } else {
                filesCreated.push(filePath);
              }
            }
          }
        }
      }

      const result: SubtaskResult = {
        success: true,
        output: agentResult,
        filesCreated,
        filesModified,
        toolsExecuted,
        metadata: {
          role: subtask.assignedRole,
          duration: Date.now() - (subtask.startedAt || Date.now())
        }
      };

      subtask.completedAt = Date.now();
      subtask.status = 'completed';
      subtask.result = result;

      return result;
    } catch (error: any) {
      console.error(`[AgentCoordinator] Subtask ${subtask.id} failed:`, error);
      subtask.status = 'failed';
      subtask.error = error.message;
      subtask.completedAt = Date.now();

      // Retry if configured
      if (this.config.retryOnFailure && subtask.priority > 0) {
        const retryCount = (subtask.context.retryCount || 0) + 1;
        if (retryCount <= this.config.maxRetries) {
          console.log(`[AgentCoordinator] Retrying subtask ${subtask.id} (attempt ${retryCount})`);
          subtask.context.retryCount = retryCount;
          return this.executeSubtask(subtask, context);
        }
      }

      return null;
    }
  }

  /**
   * Aggregate results from all subtasks
   */
  private aggregateResults(
    coordinatedTask: CoordinatedTask,
    results: Map<string, SubtaskResult>
  ): Map<AgentRole, SubtaskResult> {
    const aggregated = new Map<AgentRole, SubtaskResult>();

    for (const subtask of coordinatedTask.subtasks) {
      const result = results.get(subtask.id);
      if (result) {
        // If multiple subtasks for same role, merge results
        const existing = aggregated.get(subtask.assignedRole);
        if (existing) {
          aggregated.set(subtask.assignedRole, {
            ...result,
            filesCreated: [...existing.filesCreated, ...result.filesCreated],
            filesModified: [...existing.filesModified, ...result.filesModified],
            toolsExecuted: [...existing.toolsExecuted, ...result.toolsExecuted]
          });
        } else {
          aggregated.set(subtask.assignedRole, result);
        }
      }
    }

    return aggregated;
  }

  /**
   * Detect and resolve conflicts between agent outputs
   */
  private async detectAndResolveConflicts(
    coordinatedTask: CoordinatedTask,
    results: Map<AgentRole, SubtaskResult>
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    // Check for file overwrites
    const allFilesCreated = new Map<string, AgentRole[]>();
    for (const [role, result] of results.entries()) {
      for (const file of result.filesCreated) {
        if (!allFilesCreated.has(file)) {
          allFilesCreated.set(file, []);
        }
        allFilesCreated.get(file)!.push(role);
      }
    }

    // Detect conflicts
    for (const [file, roles] of allFilesCreated.entries()) {
      if (roles.length > 1) {
        const conflictingSubtasks = coordinatedTask.subtasks
          .filter(s => roles.includes(s.assignedRole))
          .map(s => s.id);

        const conflict: AgentConflict = {
          subtaskIds: conflictingSubtasks,
          conflictType: 'file-overwrite',
          description: `Multiple agents created file: ${file}`,
          resolved: false
        };

        // Auto-resolve based on priority
        conflict.resolution = 'priority';
        conflict.resolved = true;

        conflicts.push(conflict);
        console.warn(`[AgentCoordinator] Conflict detected: ${conflict.description}`);
      }
    }

    // Check for dependency cycles
    const cycles = this.detectCycles(coordinatedTask.dependencyGraph);
    for (const cycle of cycles) {
      const conflict: AgentConflict = {
        subtaskIds: cycle,
        conflictType: 'dependency-cycle',
        description: `Circular dependency detected: ${cycle.join(' -> ')}`,
        resolved: false
      };

      conflict.resolution = 'priority';
      conflict.resolved = true;
      conflicts.push(conflict);
    }

    return conflicts;
  }

  /**
   * Detect cycles in dependency graph
   */
  private detectCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Cycle detected
          const cycleStart = path.indexOf(dep);
          cycles.push(path.slice(cycleStart));
        }
      }

      recursionStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Rollback a failed task
   */
  private async rollbackTask(coordinatedTask: CoordinatedTask): Promise<void> {
    console.log(`[AgentCoordinator] Rolling back task ${coordinatedTask.id}`);

    // Use transaction manager to rollback file operations
    // This is a simplified version - in production, we'd track transactions per subtask
    for (const subtask of coordinatedTask.subtasks) {
      if (subtask.result && subtask.status === 'completed') {
        // Rollback file operations
        for (const file of subtask.result.filesCreated) {
          try {
            const fs = require('fs');
            const fullPath = require('path').resolve(coordinatedTask.context.workspacePath, file);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              console.log(`[AgentCoordinator] Rolled back created file: ${file}`);
            }
          } catch (error) {
            console.warn(`[AgentCoordinator] Failed to rollback file ${file}:`, error);
          }
        }
      }
    }
  }

  /**
   * Learn from a task outcome
   */
  private async learnFromOutcome(outcome: TaskOutcome): Promise<void> {
    try {
      const normalizedPatterns: MirrorPattern[] = (outcome.patternsUsed || []).map((patternId, index) => ({
        id: `${patternId}-${index}`,
        type: 'task-pattern',
        category: 'problemSolving',
        description: patternId,
        confidence: 0.7
      }));
      await storeTaskLearning(
        outcome.originalTask,
        outcome.overallSuccess,
        normalizedPatterns,
        outcome.mistakes || []
      );
    } catch (error) {
      console.warn('[AgentCoordinator] Failed to store learning:', error);
    }
  }

  /**
   * Extract patterns used in task execution
   */
  private async extractPatternsUsed(coordinatedTask: CoordinatedTask): Promise<string[]> {
    const patterns: string[] = [];

    for (const subtask of coordinatedTask.subtasks) {
      if (subtask.context.patterns) {
        patterns.push(...subtask.context.patterns.map((p: any) => p.id || p.type || 'unknown'));
      }
    }

    return [...new Set(patterns)];
  }

  /**
   * Extract mistakes from failed subtasks
   */
  private extractMistakes(coordinatedTask: CoordinatedTask): string[] {
    return coordinatedTask.subtasks
      .filter(s => s.status === 'failed' && s.error)
      .map(s => s.error!)
      .filter((error): error is string => error !== undefined);
  }

  /**
   * Build subtask description from task and role
   */
  private buildSubtaskDescription(
    task: string,
    role: AgentRole,
    patterns: any[]
  ): string {
    const roleDescriptions: Record<AgentRole, string> = {
      tool_orchestrator: `Orchestrate and plan: ${task}`,
      javascript_specialist: `Write JavaScript/TypeScript code for: ${task}`,
      styling_ux_specialist: `Refine styling and UX for: ${task}`,
      python_specialist: `Write Python code for: ${task}`,
      tauri_specialist: `Write Tauri v2/Rust desktop app code for: ${task}`,
      pipeline_specialist: `Set up build/deploy pipeline for: ${task}`,
      testing_specialist: `Add or improve tests for: ${task}`,
      integration_analyst: `Review and integrate work for: ${task}`,
      repair_specialist: `Diagnose and repair issues for: ${task}`,
    };

    let description = roleDescriptions[role] || task;

    // Add pattern hints
    const relevantPatterns = patterns.filter(p => p.type?.includes(role));
    if (relevantPatterns.length > 0) {
      description += `\n\nRelevant patterns to follow:\n${relevantPatterns
        .map(p => `- ${p.description || p.type}`)
        .join('\n')}`;
    }

    return description;
  }

  /**
   * Estimate duration for a role
   */
  private estimateDuration(role: AgentRole): number {
    const estimates: Record<AgentRole, number> = {
      tool_orchestrator: 30000, // 30 seconds
      javascript_specialist: 120000, // 2 minutes
      styling_ux_specialist: 120000, // 2 minutes
      python_specialist: 120000, // 2 minutes
      tauri_specialist: 120000, // 2 minutes
      pipeline_specialist: 60000, // 1 minute
      testing_specialist: 120000, // 2 minutes
      integration_analyst: 90000, // 1.5 minutes
      repair_specialist: 90000, // 1.5 minutes
    };

    return estimates[role] || 60000;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get coordination statistics
   */
  getStats(): {
    activeTasks: number;
    totalTasks: number;
    successRate: number;
    averageDuration: number;
  } {
    const completedTasks = this.taskHistory.filter(t => t.overallSuccess);
    const successRate = this.taskHistory.length > 0
      ? completedTasks.length / this.taskHistory.length
      : 0;
    const averageDuration = this.taskHistory.length > 0
      ? this.taskHistory.reduce((sum, t) => sum + t.duration, 0) / this.taskHistory.length
      : 0;

    return {
      activeTasks: this.activeTasks.size,
      totalTasks: this.taskHistory.length,
      successRate,
      averageDuration
    };
  }
}

/**
 * Internal representation of a coordinated task
 */
interface CoordinatedTask {
  id: string;
  originalTask: string;
  subtasks: Subtask[];
  dependencyGraph: Map<string, string[]>;
  executionOrder: Subtask[][];
  results: Map<string, SubtaskResult>;
  conflicts: AgentConflict[];
  startTime: number;
  context: Record<string, any>;
}

// Singleton instance
let agentCoordinatorInstance: AgentCoordinator | null = null;

export function getAgentCoordinator(): AgentCoordinator {
  if (!agentCoordinatorInstance) {
    agentCoordinatorInstance = new AgentCoordinator();
  }
  return agentCoordinatorInstance;
}

