/**
 * AgentPrime - Task Orchestrator
 * Plans and sequences agent work with intelligent task decomposition
 * and dependency management
 */

import { getAgentCoordinator } from './agent-coordinator';
import type { AgentRole } from '../agent/specialized-agents';
import type { Subtask, CoordinationStrategy } from '../../types/agent-coordination';
import { getRelevantPatterns } from '../mirror/mirror-singleton';
import { getCodebaseEmbeddings } from './codebase-embeddings';

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
  from: string; // Subtask ID or task ID
  to: string; // Subtask ID or task ID
  type: 'hard' | 'soft' | 'data'; // Hard = must complete, Soft = preferred, Data = shares data
  description: string;
}

/**
 * Task Orchestrator - Plans and sequences agent work
 */
export class TaskOrchestrator {
  private plans: Map<string, TaskPlan> = new Map();
  private coordinator = getAgentCoordinator();

  /**
   * Break down a complex request into agent-specific tasks
   */
  async decomposeTask(
    task: string,
    context: {
      workspacePath: string;
      files?: string[];
      language?: string;
      projectType?: string;
      existingCode?: string;
    }
  ): Promise<TaskPlan> {
    console.log(`[TaskOrchestrator] Decomposing task: ${task.substring(0, 100)}...`);

    // Get semantic context for better decomposition
    const semanticContext = await this.getSemanticContext(task, context);

    // Identify task complexity and type
    const taskType = this.identifyTaskType(task, context);
    const complexity = this.assessComplexity(task, context);

    // Get relevant patterns for task planning
    const patterns = await getRelevantPatterns(task, 10);

    // Determine required agents based on task
    const requiredAgents = this.determineRequiredAgents(task, context, taskType);

    // Create subtasks for each agent
    const subtasks = await this.createSubtasks(
      task,
      requiredAgents,
      context,
      patterns,
      semanticContext
    );

    // Identify dependencies between subtasks
    const dependencies = this.identifyDependencies(subtasks, taskType);

    // Determine execution strategy
    const executionStrategy = this.determineExecutionStrategy(subtasks, dependencies, complexity);

    // Estimate total duration
    const estimatedDuration = this.estimateTotalDuration(subtasks, executionStrategy);

    const plan: TaskPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      originalTask: task,
      subtasks,
      executionStrategy,
      estimatedDuration,
      dependencies,
      sharedContext: {
        ...context,
        taskType,
        complexity,
        patterns: patterns.map(p => p.id || p.type),
        semanticContext
      },
      createdAt: Date.now()
    };

    this.plans.set(plan.id, plan);
    console.log(`[TaskOrchestrator] Created plan ${plan.id} with ${subtasks.length} subtasks`);

    return plan;
  }

  /**
   * Sequence tasks based on dependencies
   */
  sequenceTasks(plan: TaskPlan): Subtask[][] {
    const phases: Subtask[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(plan.subtasks.map(s => s.id));

    while (remaining.size > 0) {
      const currentPhase: Subtask[] = [];

      // Find subtasks with all dependencies satisfied
      for (const subtaskId of remaining) {
        const subtask = plan.subtasks.find(s => s.id === subtaskId);
        if (!subtask) continue;

        const dependencies = plan.dependencies
          .filter(d => d.to === subtaskId)
          .map(d => d.from);

        const allDependenciesMet = dependencies.every(dep => completed.has(dep));

        if (allDependenciesMet) {
          currentPhase.push(subtask);
        }
      }

      if (currentPhase.length === 0) {
        // No subtasks ready - break dependency cycle by priority
        const remainingSubtasks = Array.from(remaining)
          .map(id => plan.subtasks.find(s => s.id === id))
          .filter((s): s is Subtask => s !== undefined)
          .sort((a, b) => b.priority - a.priority);

        if (remainingSubtasks.length > 0) {
          currentPhase.push(remainingSubtasks[0]);
          console.warn(`[TaskOrchestrator] Breaking dependency cycle: ${remainingSubtasks[0].id}`);
        } else {
          break;
        }
      }

      phases.push(currentPhase);
      currentPhase.forEach(s => {
        completed.add(s.id);
        remaining.delete(s.id);
      });
    }

    return phases;
  }

  /**
   * Manage shared context between agents
   */
  buildSharedContext(
    plan: TaskPlan,
    completedSubtasks: Map<string, any>
  ): Record<string, any> {
    const sharedContext: Record<string, any> = {
      ...plan.sharedContext,
      completedWork: {},
      availableFiles: [],
      decisions: {}
    };

    // Aggregate results from completed subtasks
    for (const [subtaskId, result] of completedSubtasks.entries()) {
      const subtask = plan.subtasks.find(s => s.id === subtaskId);
      if (subtask) {
        sharedContext.completedWork[subtask.assignedRole] = result;
        if (result.filesCreated) {
          sharedContext.availableFiles.push(...result.filesCreated);
        }
        if (result.metadata?.decisions) {
          Object.assign(sharedContext.decisions, result.metadata.decisions);
        }
      }
    }

    return sharedContext;
  }

  /**
   * Handle rollback on failures
   */
  async rollbackPlan(plan: TaskPlan, failedSubtaskId: string): Promise<void> {
    console.log(`[TaskOrchestrator] Rolling back plan ${plan.id} due to failure: ${failedSubtaskId}`);

    // Find all subtasks that depend on the failed one
    const dependentSubtasks = plan.dependencies
      .filter(d => d.from === failedSubtaskId)
      .map(d => plan.subtasks.find(s => s.id === d.to))
      .filter((s): s is Subtask => s !== undefined);

    // Mark dependent subtasks as skipped
    for (const subtask of dependentSubtasks) {
      subtask.status = 'skipped';
      console.log(`[TaskOrchestrator] Skipped dependent subtask: ${subtask.id}`);
    }

    // Use coordinator to rollback file operations
    // The coordinator handles actual file rollback
  }

  /**
   * Identify task type (creation, modification, refactoring, etc.)
   */
  private identifyTaskType(
    task: string,
    context: {
      files?: string[];
      language?: string;
      projectType?: string;
    }
  ): string {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('create') || taskLower.includes('build') || taskLower.includes('make')) {
      return 'creation';
    }
    if (taskLower.includes('refactor') || taskLower.includes('improve') || taskLower.includes('optimize')) {
      return 'refactoring';
    }
    if (taskLower.includes('fix') || taskLower.includes('bug') || taskLower.includes('error')) {
      return 'fix';
    }
    if (taskLower.includes('add') || taskLower.includes('implement') || taskLower.includes('feature')) {
      return 'addition';
    }
    if (taskLower.includes('update') || taskLower.includes('modify') || taskLower.includes('change')) {
      return 'modification';
    }

    return 'general';
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(
    task: string,
    context: {
      files?: string[];
      language?: string;
      projectType?: string;
    }
  ): 'simple' | 'medium' | 'complex' {
    const taskLower = task.toLowerCase();
    let complexityScore = 0;

    // File count factor
    if (context.files && context.files.length > 5) complexityScore += 2;
    if (context.files && context.files.length > 10) complexityScore += 2;

    // Task keywords
    if (taskLower.includes('full') || taskLower.includes('complete') || taskLower.includes('entire')) {
      complexityScore += 3;
    }
    if (taskLower.includes('multiple') || taskLower.includes('several')) {
      complexityScore += 2;
    }
    if (taskLower.includes('complex') || taskLower.includes('advanced')) {
      complexityScore += 3;
    }

    // Multi-language projects
    if (taskLower.includes('frontend') && taskLower.includes('backend')) {
      complexityScore += 3;
    }

    if (complexityScore >= 6) return 'complex';
    if (complexityScore >= 3) return 'medium';
    return 'simple';
  }

  /**
   * Determine required agents for task
   */
  private determineRequiredAgents(
    task: string,
    context: {
      files?: string[];
      language?: string;
      projectType?: string;
    },
    taskType: string
  ): AgentRole[] {
    const agents: AgentRole[] = ['tool_orchestrator']; // Always needed

    const taskLower = task.toLowerCase();

    // JavaScript/TypeScript work
    if (
      taskLower.includes('javascript') ||
      taskLower.includes('typescript') ||
      taskLower.includes('react') ||
      taskLower.includes('vue') ||
      taskLower.includes('node') ||
      context.language === 'javascript' ||
      context.language === 'typescript' ||
      context.files?.some(f => f.match(/\.(js|ts|jsx|tsx)$/))
    ) {
      agents.push('javascript_specialist');
    }

    // Python work
    if (
      taskLower.includes('python') ||
      taskLower.includes('fastapi') ||
      taskLower.includes('flask') ||
      taskLower.includes('django') ||
      context.language === 'python' ||
      context.files?.some(f => f.endsWith('.py'))
    ) {
      agents.push('python_specialist');
    }

    // Pipeline/build work
    if (
      taskLower.includes('build') ||
      taskLower.includes('deploy') ||
      taskLower.includes('pipeline') ||
      taskLower.includes('ci/cd') ||
      taskLower.includes('docker') ||
      taskType === 'creation'
    ) {
      agents.push('pipeline_specialist');
    }

    // Integration work (needed for multi-file or complex tasks)
    if (
      agents.length > 2 ||
      taskType === 'refactoring' ||
      (context.files && context.files.length > 3)
    ) {
      agents.push('integration_analyst');
    }

    return agents;
  }

  /**
   * Create subtasks for agents
   */
  private async createSubtasks(
    task: string,
    agents: AgentRole[],
    context: Record<string, any>,
    patterns: any[],
    semanticContext: string
  ): Promise<Subtask[]> {
    const subtasks: Subtask[] = [];
    let priority = agents.length;

    for (const agent of agents) {
      const agentPatterns = patterns.filter(p =>
        p.type?.includes(agent) || p.description?.toLowerCase().includes(agent)
      );

      const subtask: Subtask = {
        id: `subtask-${Date.now()}-${subtasks.length}`,
        description: this.buildAgentSpecificTask(task, agent, agentPatterns, semanticContext),
        assignedRole: agent,
        dependencies: [],
        priority: priority--,
        estimatedDuration: this.estimateAgentDuration(agent, context),
        context: {
          ...context,
          agent,
          patterns: agentPatterns,
          semanticContext
        },
        status: 'pending'
      };

      subtasks.push(subtask);
    }

    return subtasks;
  }

  /**
   * Build agent-specific task description
   */
  private buildAgentSpecificTask(
    task: string,
    agent: AgentRole,
    patterns: any[],
    semanticContext: string
  ): string {
    const roleDescriptions: Record<AgentRole, string> = {
      tool_orchestrator: `Plan and orchestrate: ${task}`,
      javascript_specialist: `Implement JavaScript/TypeScript solution: ${task}`,
      styling_ux_specialist: `Implement styling and UX for: ${task}`,
      python_specialist: `Implement Python solution: ${task}`,
      tauri_specialist: `Implement Tauri v2/Rust desktop solution: ${task}`,
      pipeline_specialist: `Set up build and deployment: ${task}`,
      testing_specialist: `Implement or extend tests for: ${task}`,
      security_specialist: `Harden security-sensitive behavior for: ${task}`,
      performance_specialist: `Improve runtime and latency behavior for: ${task}`,
      data_contract_specialist: `Align data schemas and contracts for: ${task}`,
      integration_analyst: `Review and integrate: ${task}`,
      repair_specialist: `Diagnose and repair issues for: ${task}`,
    };

    let description = roleDescriptions[agent] || task;

    // Add semantic context if available
    if (semanticContext) {
      description += `\n\nContext:\n${semanticContext.substring(0, 500)}`;
    }

    // Add pattern guidance
    if (patterns.length > 0) {
      description += `\n\nFollow these patterns:\n${patterns
        .slice(0, 3)
        .map(p => `- ${p.description || p.type}`)
        .join('\n')}`;
    }

    return description;
  }

  /**
   * Identify dependencies between subtasks
   */
  private identifyDependencies(
    subtasks: Subtask[],
    taskType: string
  ): TaskDependency[] {
    const dependencies: TaskDependency[] = [];

    // Tool orchestrator should run first
    const orchestrator = subtasks.find(s => s.assignedRole === 'tool_orchestrator');
    const codeSpecialists = subtasks.filter(s =>
      s.assignedRole === 'javascript_specialist' || s.assignedRole === 'python_specialist'
    );
    const pipelineSpecialist = subtasks.find(s => s.assignedRole === 'pipeline_specialist');
    const integrationAnalyst = subtasks.find(s => s.assignedRole === 'integration_analyst');

    // Code specialists depend on orchestrator
    if (orchestrator) {
      for (const specialist of codeSpecialists) {
        dependencies.push({
          from: orchestrator.id,
          to: specialist.id,
          type: 'hard',
          description: `${specialist.assignedRole} needs orchestrator's plan`
        });
        specialist.dependencies.push(orchestrator.id);
      }
    }

    // Pipeline specialist depends on code specialists
    if (pipelineSpecialist) {
      for (const specialist of codeSpecialists) {
        dependencies.push({
          from: specialist.id,
          to: pipelineSpecialist.id,
          type: 'soft',
          description: 'Pipeline setup needs code structure'
        });
        pipelineSpecialist.dependencies.push(specialist.id);
      }
    }

    // Integration analyst depends on all specialists
    if (integrationAnalyst) {
      const allSpecialists = [...codeSpecialists];
      if (pipelineSpecialist) allSpecialists.push(pipelineSpecialist);

      for (const specialist of allSpecialists) {
        dependencies.push({
          from: specialist.id,
          to: integrationAnalyst.id,
          type: 'hard',
          description: 'Integration needs all specialist work complete'
        });
        integrationAnalyst.dependencies.push(specialist.id);
      }
    }

    return dependencies;
  }

  /**
   * Determine execution strategy
   */
  private determineExecutionStrategy(
    subtasks: Subtask[],
    dependencies: TaskDependency[],
    complexity: 'simple' | 'medium' | 'complex'
  ): CoordinationStrategy {
    // Simple tasks can run in parallel
    if (complexity === 'simple' && dependencies.length === 0) {
      return 'parallel';
    }

    // Complex tasks need dependency-based execution
    if (complexity === 'complex' || dependencies.length > subtasks.length / 2) {
      return 'dependency';
    }

    // Medium complexity: hybrid approach
    return 'hybrid';
  }

  /**
   * Estimate total duration
   */
  private estimateTotalDuration(
    subtasks: Subtask[],
    strategy: CoordinationStrategy
  ): number {
    if (strategy === 'parallel' || strategy === 'hybrid') {
      // Parallel execution: longest subtask + overhead
      const maxDuration = Math.max(...subtasks.map(s => s.estimatedDuration));
      return maxDuration + 10000; // 10s overhead
    } else {
      // Sequential: sum of all durations
      return subtasks.reduce((sum, s) => sum + s.estimatedDuration, 0);
    }
  }

  /**
   * Estimate duration for an agent
   */
  private estimateAgentDuration(
    agent: AgentRole,
    context: Record<string, any>
  ): number {
    const baseDurations: Record<AgentRole, number> = {
      tool_orchestrator: 30000,
      javascript_specialist: 120000,
      styling_ux_specialist: 120000,
      python_specialist: 120000,
      tauri_specialist: 120000,
      pipeline_specialist: 60000,
      testing_specialist: 120000,
      security_specialist: 90000,
      performance_specialist: 90000,
      data_contract_specialist: 90000,
      integration_analyst: 90000,
      repair_specialist: 90000,
    };

    let duration = baseDurations[agent] || 60000;

    // Adjust based on complexity
    if (context.complexity === 'complex') {
      duration *= 2;
    } else if (context.complexity === 'medium') {
      duration *= 1.5;
    }

    // Adjust based on file count
    if (context.files && context.files.length > 5) {
      duration *= 1.2;
    }

    return duration;
  }

  /**
   * Get semantic context for task
   */
  private async getSemanticContext(
    task: string,
    context: {
      workspacePath: string;
      files?: string[];
    }
  ): Promise<string> {
    try {
      const embeddings = getCodebaseEmbeddings();
      
      // Initialize if not already initialized for this workspace
      await embeddings.initializeForWorkspace(context.workspacePath);
      
      const similarFiles = await embeddings.findSimilarFiles(task, 3);

      if (similarFiles.length > 0) {
        return similarFiles
          .map(f => `File: ${f.filePath}\n${f.content.substring(0, 200)}`)
          .join('\n\n');
      }
    } catch (error) {
      console.debug('[TaskOrchestrator] Semantic context unavailable:', error);
    }

    return '';
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): TaskPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPlans: number;
    averageSubtasks: number;
    averageDuration: number;
  } {
    const plans = Array.from(this.plans.values());
    const averageSubtasks = plans.length > 0
      ? plans.reduce((sum, p) => sum + p.subtasks.length, 0) / plans.length
      : 0;
    const averageDuration = plans.length > 0
      ? plans.reduce((sum, p) => sum + p.estimatedDuration, 0) / plans.length
      : 0;

    return {
      totalPlans: plans.length,
      averageSubtasks,
      averageDuration
    };
  }
}

// Singleton instance
let taskOrchestratorInstance: TaskOrchestrator | null = null;

export function getTaskOrchestrator(): TaskOrchestrator {
  if (!taskOrchestratorInstance) {
    taskOrchestratorInstance = new TaskOrchestrator();
  }
  return taskOrchestratorInstance;
}

