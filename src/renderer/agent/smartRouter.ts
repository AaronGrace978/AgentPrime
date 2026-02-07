/**
 * Smart Task Router for AgentPrime
 * 
 * This system intelligently routes different types of operations
 * to the most appropriate model:
 * 
 * - Simple reads/listings → Fast model (less tokens, faster response)
 * - Complex planning/architecture → Deep model (more reasoning)
 * - Code generation → Deep model (quality matters)
 * - Error recovery → Deep model (needs understanding)
 */

export interface TaskAnalysis {
  complexity: number;      // 1-10 scale
  category: TaskCategory;
  suggestedModel: 'fast' | 'deep';
  reasoning: string;
  estimatedTokens: number;
}

export type TaskCategory = 
  | 'planning'
  | 'file_read'
  | 'file_write'
  | 'code_generation'
  | 'debugging'
  | 'refactoring'
  | 'simple_response'
  | 'error_recovery'
  | 'architecture';

interface TaskPattern {
  pattern: RegExp | string[];
  category: TaskCategory;
  baseComplexity: number;
  modelPreference: 'fast' | 'deep' | 'either';
}

const TASK_PATTERNS: TaskPattern[] = [
  // Simple operations - use fast model
  {
    pattern: ['list files', 'show files', 'what files', 'ls', 'dir'],
    category: 'file_read',
    baseComplexity: 2,
    modelPreference: 'fast'
  },
  {
    pattern: ['read', 'show me', 'what does', 'open'],
    category: 'file_read',
    baseComplexity: 2,
    modelPreference: 'fast'
  },
  
  // Planning operations - use deep model
  {
    pattern: ['plan', 'how should', 'what\'s the best way', 'architect', 'design'],
    category: 'planning',
    baseComplexity: 7,
    modelPreference: 'deep'
  },
  {
    pattern: ['create', 'build', 'make', 'generate', 'implement'],
    category: 'code_generation',
    baseComplexity: 6,
    modelPreference: 'deep'
  },
  
  // Debugging - use deep model
  {
    pattern: ['fix', 'debug', 'why', 'error', 'bug', 'issue', 'problem', 'not working'],
    category: 'debugging',
    baseComplexity: 7,
    modelPreference: 'deep'
  },
  
  // Refactoring - use deep model
  {
    pattern: ['refactor', 'improve', 'optimize', 'clean up', 'restructure'],
    category: 'refactoring',
    baseComplexity: 7,
    modelPreference: 'deep'
  },
  
  // Architecture - definitely deep model
  {
    pattern: ['architecture', 'structure', 'organize', 'pattern', 'design system'],
    category: 'architecture',
    baseComplexity: 9,
    modelPreference: 'deep'
  },
  
  // Simple responses - fast model
  {
    pattern: ['yes', 'no', 'ok', 'sure', 'thanks', 'got it'],
    category: 'simple_response',
    baseComplexity: 1,
    modelPreference: 'fast'
  }
];

/**
 * Complexity modifiers based on context
 */
interface ComplexityModifier {
  condition: (context: TaskContext) => boolean;
  adjustment: number;
  reason: string;
}

const COMPLEXITY_MODIFIERS: ComplexityModifier[] = [
  {
    condition: (ctx) => ctx.fileCount > 5,
    adjustment: 2,
    reason: 'Multiple files involved'
  },
  {
    condition: (ctx) => ctx.hasErrors,
    adjustment: 2,
    reason: 'Errors present'
  },
  {
    condition: (ctx) => ctx.codeLines > 500,
    adjustment: 1,
    reason: 'Large codebase'
  },
  {
    condition: (ctx) => ctx.isFirstMessage,
    adjustment: 1,
    reason: 'New task requires understanding'
  },
  {
    condition: (ctx) => ctx.consecutiveErrors > 0,
    adjustment: 3,
    reason: 'Error recovery needed'
  },
  {
    condition: (ctx) => ctx.taskLength > 200,
    adjustment: 2,
    reason: 'Complex request'
  },
  {
    condition: (ctx) => ctx.taskLength < 20,
    adjustment: -2,
    reason: 'Simple request'
  }
];

export interface TaskContext {
  fileCount: number;
  hasErrors: boolean;
  codeLines: number;
  isFirstMessage: boolean;
  consecutiveErrors: number;
  taskLength: number;
  previousCategory?: TaskCategory;
}

/**
 * Analyze a task and recommend the best model
 */
export function analyzeTask(task: string, context: TaskContext): TaskAnalysis {
  const taskLower = task.toLowerCase();
  
  // Find matching pattern
  let matchedPattern: TaskPattern | null = null;
  let maxScore = 0;
  
  for (const pattern of TASK_PATTERNS) {
    let score = 0;
    
    if (Array.isArray(pattern.pattern)) {
      for (const keyword of pattern.pattern) {
        if (taskLower.includes(keyword)) {
          score += 1;
        }
      }
    } else if (pattern.pattern.test(taskLower)) {
      score = 3; // Regex match is strong
    }
    
    if (score > maxScore) {
      maxScore = score;
      matchedPattern = pattern;
    }
  }
  
  // Default to code_generation if no pattern matches
  const category = matchedPattern?.category || 'code_generation';
  let complexity = matchedPattern?.baseComplexity || 5;
  let modelPreference = matchedPattern?.modelPreference || 'either';
  
  // Apply complexity modifiers
  const reasons: string[] = [];
  
  for (const modifier of COMPLEXITY_MODIFIERS) {
    if (modifier.condition(context)) {
      complexity += modifier.adjustment;
      reasons.push(modifier.reason);
    }
  }
  
  // Clamp complexity
  complexity = Math.max(1, Math.min(10, complexity));
  
  // Determine model
  let suggestedModel: 'fast' | 'deep';
  
  if (modelPreference !== 'either') {
    suggestedModel = modelPreference;
  } else {
    // Use threshold-based routing
    suggestedModel = complexity >= 6 ? 'deep' : 'fast';
  }
  
  // Override: if there are consecutive errors, always use deep model
  if (context.consecutiveErrors > 1) {
    suggestedModel = 'deep';
    reasons.push('Multiple errors require deeper reasoning');
  }
  
  // Estimate tokens needed
  const estimatedTokens = estimateTokensForTask(task, category, context);
  
  return {
    complexity,
    category,
    suggestedModel,
    reasoning: reasons.length > 0 
      ? reasons.join('; ') 
      : `${category} task with complexity ${complexity}`,
    estimatedTokens
  };
}

/**
 * Estimate tokens needed for a task
 */
function estimateTokensForTask(
  task: string, 
  category: TaskCategory, 
  context: TaskContext
): number {
  const baseTokens: Record<TaskCategory, number> = {
    'planning': 2000,
    'file_read': 500,
    'file_write': 1500,
    'code_generation': 3000,
    'debugging': 2500,
    'refactoring': 2000,
    'simple_response': 200,
    'error_recovery': 2000,
    'architecture': 4000
  };
  
  let estimate = baseTokens[category] || 1500;
  
  // Adjust for context
  if (context.codeLines > 500) estimate += 500;
  if (context.fileCount > 3) estimate += context.fileCount * 100;
  if (task.length > 200) estimate += 500;
  
  return estimate;
}

/**
 * Smart Router class for managing model selection
 */
export class SmartRouter {
  private fastModel: string = 'devstral-small-2:24b-cloud';
  private deepModel: string = 'qwen3-coder:480b-cloud';
  private threshold: number = 6;
  private enabled: boolean = true;
  
  // Stats
  private routingHistory: Array<{
    timestamp: Date;
    task: string;
    analysis: TaskAnalysis;
    modelUsed: string;
  }> = [];

  configure(config: {
    fastModel?: string;
    deepModel?: string;
    threshold?: number;
    enabled?: boolean;
  }): void {
    if (config.fastModel) this.fastModel = config.fastModel;
    if (config.deepModel) this.deepModel = config.deepModel;
    if (config.threshold !== undefined) this.threshold = config.threshold;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    
    console.log('[SmartRouter] Configured:', {
      fastModel: this.fastModel,
      deepModel: this.deepModel,
      threshold: this.threshold,
      enabled: this.enabled
    });
  }

  /**
   * Route a task to the appropriate model
   */
  route(task: string, context: Partial<TaskContext> = {}): {
    model: string;
    analysis: TaskAnalysis;
  } {
    const fullContext: TaskContext = {
      fileCount: context.fileCount || 0,
      hasErrors: context.hasErrors || false,
      codeLines: context.codeLines || 0,
      isFirstMessage: context.isFirstMessage ?? true,
      consecutiveErrors: context.consecutiveErrors || 0,
      taskLength: task.length,
      previousCategory: context.previousCategory
    };
    
    const analysis = analyzeTask(task, fullContext);
    
    if (!this.enabled) {
      // If disabled, always use deep model
      return { model: this.deepModel, analysis };
    }
    
    const model = analysis.suggestedModel === 'fast' 
      ? this.fastModel 
      : this.deepModel;
    
    // Log routing decision
    this.routingHistory.push({
      timestamp: new Date(),
      task: task.substring(0, 100),
      analysis,
      modelUsed: model
    });
    
    // Keep history limited
    if (this.routingHistory.length > 100) {
      this.routingHistory = this.routingHistory.slice(-50);
    }
    
    console.log(`[SmartRouter] ${analysis.suggestedModel.toUpperCase()} → ${model}`);
    console.log(`  Category: ${analysis.category}, Complexity: ${analysis.complexity}`);
    console.log(`  Reason: ${analysis.reasoning}`);
    
    return { model, analysis };
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalRouted: number;
    fastCount: number;
    deepCount: number;
    fastPercent: number;
    categoryCounts: Record<string, number>;
    avgComplexity: number;
  } {
    const total = this.routingHistory.length;
    const fastCount = this.routingHistory.filter(
      r => r.analysis.suggestedModel === 'fast'
    ).length;
    
    const categoryCounts: Record<string, number> = {};
    let totalComplexity = 0;
    
    for (const entry of this.routingHistory) {
      categoryCounts[entry.analysis.category] = 
        (categoryCounts[entry.analysis.category] || 0) + 1;
      totalComplexity += entry.analysis.complexity;
    }
    
    return {
      totalRouted: total,
      fastCount,
      deepCount: total - fastCount,
      fastPercent: total > 0 ? Math.round((fastCount / total) * 100) : 0,
      categoryCounts,
      avgComplexity: total > 0 ? Math.round((totalComplexity / total) * 10) / 10 : 0
    };
  }

  /**
   * Get recent routing decisions
   */
  getRecentDecisions(count: number = 10): typeof this.routingHistory {
    return this.routingHistory.slice(-count);
  }

  /**
   * Check if smart routing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const smartRouter = new SmartRouter();

