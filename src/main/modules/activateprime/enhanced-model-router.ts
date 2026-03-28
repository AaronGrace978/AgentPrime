/**
 * ActivatePrime Enhanced Model Router - Ported to TypeScript
 * Routes requests to best model based on task complexity and performance tracking
 * Supports local and cloud models with automatic fallback
 */

export interface ModelCapability {
  name: string;
  provider: string;
  strengths: string[];
  speed: 'fast' | 'medium' | 'slow';
  contextWindow: number;
  cost: 'free' | 'low' | 'medium' | 'high';
  supportedTasks: string[];
  performanceMetrics: {
    avgResponseTime: number;
    successRate: number;
    costPerToken: number;
    totalRequests: number;
  };
}

export interface TaskAnalysis {
  taskType: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedTokens: number;
  requiresReasoning: boolean;
  requiresCreativity: boolean;
  timeSensitive: boolean;
  userPreferences?: {
    preferredSpeed?: 'fast' | 'medium' | 'slow';
    maxCost?: 'free' | 'low' | 'medium' | 'high';
    preferredProvider?: string;
  };
}

export interface RoutingDecision {
  provider: string;
  model: string;
  reasoning: string;
  expectedPerformance: {
    estimatedTime: number;
    estimatedCost: number;
    confidence: number;
  };
  fallbackOptions: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
}

export interface PerformanceRecord {
  timestamp: Date;
  provider: string;
  model: string;
  taskType: string;
  responseTime: number;
  success: boolean;
  tokensUsed: number;
  cost: number;
  userFeedback?: number; // 1-5 rating
}

export class EnhancedModelRouter {
  private models: Map<string, ModelCapability> = new Map();
  private performanceHistory: PerformanceRecord[] = [];
  private maxHistorySize = 1000;
  private routingRules: Map<string, any> = new Map();

  constructor() {
    this.initializeDefaultModels();
    this.initializeRoutingRules();
  }

  /**
   * Initialize default model capabilities
   */
  private initializeDefaultModels(): void {
    const defaultModels: ModelCapability[] = [
      // Ollama models (local, fast)
      {
        name: 'qwen3-coder:480b-cloud',
        provider: 'ollama',
        strengths: ['code', 'analysis', 'debug', 'complex'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'low',
        supportedTasks: ['coding', 'analysis', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1200,
          successRate: 0.95,
          costPerToken: 0.0001,
          totalRequests: 0
        }
      },
      {
        name: 'qwen3-coder-next:cloud',
        provider: 'ollama',
        strengths: ['code', 'analysis', 'debug', 'complex', 'agentic'],
        speed: 'fast',
        contextWindow: 256000,
        cost: 'low',
        supportedTasks: ['coding', 'analysis', 'debugging', 'complex_reasoning', 'agentic'],
        performanceMetrics: {
          avgResponseTime: 800,
          successRate: 0.95,
          costPerToken: 0.0001,
          totalRequests: 0
        }
      },
      {
        name: 'deepseek-v3.1:671b-cloud',
        provider: 'ollama',
        strengths: ['analysis', 'creative', 'complex', 'chat'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'low',
        supportedTasks: ['analysis', 'creative', 'complex_reasoning', 'chat'],
        performanceMetrics: {
          avgResponseTime: 1200,
          successRate: 0.92,
          costPerToken: 0.0001,
          totalRequests: 0
        }
      },
      {
        name: 'glm-4.6:cloud',
        provider: 'ollama',
        strengths: ['code', 'analysis', 'chat', 'creative', 'complex'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'low',
        supportedTasks: ['chat', 'analysis', 'creative', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1100,
          successRate: 0.93,
          costPerToken: 0.0001,
          totalRequests: 0
        }
      },
      {
        name: 'qwen2.5-coder:32b',
        provider: 'ollama',
        strengths: ['code', 'debug', 'analysis'],
        speed: 'fast',
        contextWindow: 32000,
        cost: 'free',
        supportedTasks: ['coding', 'debugging', 'simple_analysis'],
        performanceMetrics: {
          avgResponseTime: 800,
          successRate: 0.88,
          costPerToken: 0,
          totalRequests: 0
        }
      },
      {
        name: 'qwen2.5-coder:7b',
        provider: 'ollama',
        strengths: ['code', 'chat', 'simple'],
        speed: 'fast',
        contextWindow: 32000,
        cost: 'free',
        supportedTasks: ['chat', 'simple_coding', 'simple_questions'],
        performanceMetrics: {
          avgResponseTime: 600,
          successRate: 0.85,
          costPerToken: 0,
          totalRequests: 0
        }
      },

      // Anthropic models (excellent reasoning) - Claude 4 Opus & Sonnet
      {
        name: 'claude-opus-4-6',
        provider: 'anthropic',
        strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
        speed: 'medium',
        contextWindow: 1000000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning', 'agentic'],
        performanceMetrics: {
          avgResponseTime: 1400,
          successRate: 0.98,
          costPerToken: 0.0012,
          totalRequests: 0
        }
      },
      {
        name: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
        speed: 'medium',
        contextWindow: 200000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1450,
          successRate: 0.98,
          costPerToken: 0.0012,
          totalRequests: 0
        }
      },
      {
        name: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
        speed: 'medium',
        contextWindow: 200000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1300,
          successRate: 0.97,
          costPerToken: 0.0008,
          totalRequests: 0
        }
      },
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
        speed: 'medium',
        contextWindow: 200000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1500,
          successRate: 0.98,
          costPerToken: 0.001,
          totalRequests: 0
        }
      },
      {
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        strengths: ['chat', 'simple', 'analysis'],
        speed: 'fast',
        contextWindow: 200000,
        cost: 'medium',
        supportedTasks: ['chat', 'simple_analysis', 'simple_questions'],
        performanceMetrics: {
          avgResponseTime: 900,
          successRate: 0.94,
          costPerToken: 0.0005,
          totalRequests: 0
        }
      },

      // OpenAI models (balanced) - GPT-5.2 + GPT-4
      {
        name: 'gpt-5.2-2025-12-11',
        provider: 'openai',
        strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1200,
          successRate: 0.97,
          costPerToken: 0.001,
          totalRequests: 0
        }
      },
      {
        name: 'gpt-5.2',
        provider: 'openai',
        strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1200,
          successRate: 0.97,
          costPerToken: 0.001,
          totalRequests: 0
        }
      },
      {
        name: 'gpt-4o',
        provider: 'openai',
        strengths: ['analysis', 'creative', 'complex', 'code', 'debug'],
        speed: 'medium',
        contextWindow: 128000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1300,
          successRate: 0.96,
          costPerToken: 0.0008,
          totalRequests: 0
        }
      },
      {
        name: 'gpt-4o-mini',
        provider: 'openai',
        strengths: ['chat', 'simple', 'analysis', 'code'],
        speed: 'fast',
        contextWindow: 128000,
        cost: 'low',
        supportedTasks: ['chat', 'simple_coding', 'simple_analysis', 'simple_questions'],
        performanceMetrics: {
          avgResponseTime: 700,
          successRate: 0.92,
          costPerToken: 0.0002,
          totalRequests: 0
        }
      },

      // OpenRouter models (additional options)
      {
        name: 'anthropic/claude-3.5-sonnet',
        provider: 'openrouter',
        strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
        speed: 'medium',
        contextWindow: 200000,
        cost: 'high',
        supportedTasks: ['coding', 'analysis', 'creative', 'debugging', 'complex_reasoning'],
        performanceMetrics: {
          avgResponseTime: 1600,
          successRate: 0.97,
          costPerToken: 0.0012,
          totalRequests: 0
        }
      }
    ];

    for (const model of defaultModels) {
      this.models.set(model.name, model);
    }
  }

  /**
   * Initialize routing rules
   */
  private initializeRoutingRules(): void {
    this.routingRules.set('coding_tasks', {
      preferred: 'local_first',
      models: ['qwen3-coder:480b-cloud', 'qwen3-coder-next:cloud', 'glm-4.6:cloud', 'qwen2.5-coder:32b', 'claude-sonnet-4-20250514', 'claude-opus-4-6', 'gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-4o'],
      speedPriority: 0.7,
      costPriority: 0.3
    });

    this.routingRules.set('simple_questions', {
      preferred: 'fastest',
      models: ['qwen2.5-coder:7b', 'gpt-4o-mini', 'claude-3-haiku-20240307'],
      speedPriority: 0.9,
      costPriority: 0.1
    });

    this.routingRules.set('complex_reasoning', {
      preferred: 'best_quality',
      models: ['claude-opus-4-6', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-4o', 'qwen3-coder:480b-cloud', 'qwen3-coder-next:cloud'],
      speedPriority: 0.4,
      costPriority: 0.6
    });

    this.routingRules.set('creative_tasks', {
      preferred: 'best_quality',
      models: ['claude-opus-4-6', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'gpt-5.2', 'gpt-4o', 'deepseek-v3.1:671b-cloud'],
      speedPriority: 0.5,
      costPriority: 0.5
    });

    this.routingRules.set('debugging', {
      preferred: 'local_first',
      models: ['qwen3-coder:480b-cloud', 'qwen3-coder-next:cloud', 'qwen2.5-coder:32b', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'gpt-5.2', 'gpt-4o'],
      speedPriority: 0.6,
      costPriority: 0.4
    });
  }

  /**
   * Analyze task complexity and requirements
   */
  analyzeTaskComplexity(prompt: string, context?: {
    codeLines?: number;
    hasErrors?: boolean;
    isCreative?: boolean;
    needsReasoning?: boolean;
    timeSensitive?: boolean;
    userPreferences?: TaskAnalysis['userPreferences'];
  }): TaskAnalysis {
    const lowerPrompt = prompt.toLowerCase();
    const wordCount = prompt.split(/\s+/).length;

    // Determine task type
    let taskType = 'simple_questions';
    if (lowerPrompt.includes('function') || lowerPrompt.includes('class') || lowerPrompt.includes('implement')) {
      taskType = 'coding_tasks';
    } else if (lowerPrompt.includes('analyze') || lowerPrompt.includes('research') || lowerPrompt.includes('explain')) {
      taskType = 'complex_reasoning';
    } else if (lowerPrompt.includes('create') || lowerPrompt.includes('design') || lowerPrompt.includes('generate')) {
      taskType = 'creative_tasks';
    } else if (lowerPrompt.includes('error') || lowerPrompt.includes('bug') || lowerPrompt.includes('fix') || lowerPrompt.includes('debug')) {
      taskType = 'debugging';
    }

    // Determine complexity
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (wordCount > 100 || lowerPrompt.includes('complex') || lowerPrompt.includes('detailed')) {
      complexity = 'complex';
    } else if (wordCount > 50 || lowerPrompt.includes('explain') || lowerPrompt.includes('how')) {
      complexity = 'medium';
    }

    // Estimate tokens (rough approximation)
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // Determine requirements
    const requiresReasoning = complexity === 'complex' ||
      lowerPrompt.includes('why') ||
      lowerPrompt.includes('analyze') ||
      lowerPrompt.includes('reason');

    const requiresCreativity = lowerPrompt.includes('create') ||
      lowerPrompt.includes('design') ||
      lowerPrompt.includes('generate') ||
      lowerPrompt.includes('innovative');

    const timeSensitive = lowerPrompt.includes('urgent') ||
      lowerPrompt.includes('asap') ||
      lowerPrompt.includes('immediately') ||
      (context?.timeSensitive ?? false);

    return {
      taskType,
      complexity,
      estimatedTokens,
      requiresReasoning,
      requiresCreativity,
      timeSensitive,
      userPreferences: context?.userPreferences
    };
  }

  /**
   * Route request to best model based on task analysis
   */
  routeRequest(
    prompt: string,
    userPreferences?: TaskAnalysis['userPreferences']
  ): RoutingDecision {
    const taskAnalysis = this.analyzeTaskComplexity(prompt, { userPreferences });
    const rule = this.routingRules.get(taskAnalysis.taskType) || this.routingRules.get('simple_questions')!;

    // Score models based on task requirements and preferences
    const modelScores = this.scoreModels(taskAnalysis, rule);

    // Sort by score
    const sortedModels = modelScores.sort((a, b) => b.score - a.score);

    if (sortedModels.length === 0) {
      throw new Error('No suitable models available for this task');
    }

    const bestModel = sortedModels[0];
    const model = this.models.get(bestModel.modelName)!;

    // Generate fallback options
    const fallbackOptions = sortedModels.slice(1, 4).map(m => {
      const modelInfo = this.models.get(m.modelName)!;
      return {
        provider: modelInfo.provider,
        model: m.modelName,
        reason: `Fallback option with score ${m.score.toFixed(2)}`
      };
    });

    // Calculate expected performance
    const expectedPerformance = this.calculateExpectedPerformance(model, taskAnalysis);

    return {
      provider: model.provider,
      model: bestModel.modelName,
      reasoning: bestModel.reasoning,
      expectedPerformance,
      fallbackOptions
    };
  }

  /**
   * Score models based on task requirements
   */
  private scoreModels(taskAnalysis: TaskAnalysis, rule: any): Array<{
    modelName: string;
    score: number;
    reasoning: string;
  }> {
    const scores: Array<{
      modelName: string;
      score: number;
      reasoning: string;
    }> = [];

    for (const modelName of rule.models) {
      const model = this.models.get(modelName);
      if (!model) continue;

      let score = 0;
      let reasoningParts: string[] = [];

      // Task compatibility (primary factor - 40%)
      const taskMatch = model.supportedTasks.includes(taskAnalysis.taskType);
      const strengthMatch = model.strengths.some(s =>
        taskAnalysis.taskType.includes(s) ||
        (taskAnalysis.requiresReasoning && s === 'complex') ||
        (taskAnalysis.requiresCreativity && s === 'creative')
      );

      if (taskMatch || strengthMatch) {
        score += 40;
        reasoningParts.push('good task fit');
      } else {
        score += 10;
        reasoningParts.push('basic compatibility');
      }

      // Speed preference (weighted by rule - 20-50%)
      const speedScore = this.calculateSpeedScore(model, rule.speedPriority);
      score += speedScore * rule.speedPriority * 100;
      if (rule.speedPriority > 0.5) {
        reasoningParts.push(`prioritizing speed (${model.speed})`);
      }

      // Cost consideration (weighted by rule - 10-30%)
      const costScore = this.calculateCostScore(model, rule.costPriority);
      score += costScore * rule.costPriority * 100;
      if (rule.costPriority > 0.5) {
        reasoningParts.push(`cost-effective (${model.cost})`);
      }

      // Performance history (10%)
      const performanceScore = this.getPerformanceScore(modelName, taskAnalysis.taskType);
      score += performanceScore * 10;
      if (performanceScore > 0.8) {
        reasoningParts.push('proven performance');
      }

      // Context window check (5%)
      if (taskAnalysis.estimatedTokens > model.contextWindow * 0.8) {
        score -= 5;
        reasoningParts.push('context window may be tight');
      }

      // User preferences (bonus 5%)
      if (taskAnalysis.userPreferences) {
        if (taskAnalysis.userPreferences.preferredProvider === model.provider) {
          score += 5;
          reasoningParts.push('matches preferred provider');
        }
        if (taskAnalysis.userPreferences.preferredSpeed === model.speed) {
          score += 5;
          reasoningParts.push('matches preferred speed');
        }
        if (taskAnalysis.userPreferences.maxCost &&
            this.costToNumber(model.cost) <= this.costToNumber(taskAnalysis.userPreferences.maxCost)) {
          score += 3;
          reasoningParts.push('within cost budget');
        }
      }

      // Time sensitivity boost
      if (taskAnalysis.timeSensitive && model.speed === 'fast') {
        score += 10;
        reasoningParts.push('fast for urgent task');
      }

      scores.push({
        modelName,
        score,
        reasoning: reasoningParts.join(', ')
      });
    }

    return scores;
  }

  /**
   * Calculate speed score (0-1)
   */
  private calculateSpeedScore(model: ModelCapability, priority: number): number {
    const speedScores = { fast: 1, medium: 0.7, slow: 0.4 };
    return speedScores[model.speed] || 0.5;
  }

  /**
   * Calculate cost score (0-1, higher is better/cheaper)
   */
  private calculateCostScore(model: ModelCapability, priority: number): number {
    const costScores = { free: 1, low: 0.8, medium: 0.6, high: 0.3 };
    return costScores[model.cost] || 0.5;
  }

  /**
   * Convert cost string to number for comparison
   */
  private costToNumber(cost: string): number {
    const costMap = { free: 0, low: 1, medium: 2, high: 3 };
    return costMap[cost as keyof typeof costMap] || 2;
  }

  /**
   * Get performance score from history (0-1)
   */
  private getPerformanceScore(modelName: string, taskType: string): number {
    const relevantRecords = this.performanceHistory.filter(
      record => record.model === modelName &&
               record.taskType === taskType &&
               record.success
    );

    if (relevantRecords.length === 0) return 0.5; // Neutral score for no history

    const avgResponseTime = relevantRecords.reduce((sum, r) => sum + r.responseTime, 0) / relevantRecords.length;
    const successRate = relevantRecords.filter(r => r.success).length / relevantRecords.length;
    const avgUserFeedback = relevantRecords
      .filter(r => r.userFeedback)
      .reduce((sum, r) => sum + (r.userFeedback || 0), 0) /
      relevantRecords.filter(r => r.userFeedback).length || 3;

    // Normalize to 0-1 scale
    const timeScore = Math.max(0, 1 - (avgResponseTime / 5000)); // Expect <5s
    const successScore = successRate;
    const feedbackScore = (avgUserFeedback - 1) / 4; // 1-5 scale to 0-1

    return (timeScore * 0.4 + successScore * 0.4 + feedbackScore * 0.2);
  }

  /**
   * Calculate expected performance metrics
   */
  private calculateExpectedPerformance(
    model: ModelCapability,
    taskAnalysis: TaskAnalysis
  ): RoutingDecision['expectedPerformance'] {
    const baseTime = model.performanceMetrics.avgResponseTime;
    const complexityMultiplier = taskAnalysis.complexity === 'complex' ? 1.5 :
                                taskAnalysis.complexity === 'medium' ? 1.2 : 1.0;

    const estimatedTime = baseTime * complexityMultiplier;

    // Estimate cost (rough approximation)
    const estimatedCost = (taskAnalysis.estimatedTokens * model.performanceMetrics.costPerToken) +
                         (taskAnalysis.estimatedTokens * 0.1 * model.performanceMetrics.costPerToken); // Output tokens

    // Confidence based on historical success rate
    const confidence = model.performanceMetrics.successRate;

    return {
      estimatedTime: Math.round(estimatedTime),
      estimatedCost: Math.round(estimatedCost * 10000) / 10000, // Round to 4 decimals
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Record performance for learning
   */
  recordPerformance(record: Omit<PerformanceRecord, 'timestamp'>): void {
    const fullRecord: PerformanceRecord = {
      ...record,
      timestamp: new Date()
    };

    this.performanceHistory.push(fullRecord);

    // Keep history within limits
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize);
    }

    // Update model metrics
    this.updateModelMetrics(record);
  }

  /**
   * Update model performance metrics based on new data
   */
  private updateModelMetrics(record: Omit<PerformanceRecord, 'timestamp'>): void {
    const model = this.models.get(record.model);
    if (!model) return;

    const metrics = model.performanceMetrics;
    const totalRequests = metrics.totalRequests + 1;

    // Update averages
    metrics.avgResponseTime = ((metrics.avgResponseTime * metrics.totalRequests) + record.responseTime) / totalRequests;
    metrics.successRate = ((metrics.successRate * metrics.totalRequests) + (record.success ? 1 : 0)) / totalRequests;
    metrics.totalRequests = totalRequests;
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalRequests: number;
    modelUsage: Record<string, number>;
    taskTypeBreakdown: Record<string, number>;
    avgPerformance: {
      responseTime: number;
      successRate: number;
      costPerToken: number;
    };
  } {
    const modelUsage: Record<string, number> = {};
    const taskTypeBreakdown: Record<string, number> = {};

    for (const record of this.performanceHistory) {
      modelUsage[record.model] = (modelUsage[record.model] || 0) + 1;
      taskTypeBreakdown[record.taskType] = (taskTypeBreakdown[record.taskType] || 0) + 1;
    }

    const totalRequests = this.performanceHistory.length;
    const avgResponseTime = totalRequests > 0 ?
      this.performanceHistory.reduce((sum, r) => sum + r.responseTime, 0) / totalRequests : 0;

    const avgSuccessRate = totalRequests > 0 ?
      this.performanceHistory.filter(r => r.success).length / totalRequests : 0;

    const avgCostPerToken = totalRequests > 0 ?
      this.performanceHistory.reduce((sum, r) => sum + r.cost, 0) /
      this.performanceHistory.reduce((sum, r) => sum + r.tokensUsed, 0) : 0;

    return {
      totalRequests,
      modelUsage,
      taskTypeBreakdown,
      avgPerformance: {
        responseTime: Math.round(avgResponseTime),
        successRate: Math.round(avgSuccessRate * 100) / 100,
        costPerToken: Math.round(avgCostPerToken * 10000) / 10000
      }
    };
  }

  /**
   * Add custom model
   */
  addModel(model: ModelCapability): void {
    this.models.set(model.name, model);
  }

  /**
   * Remove model
   */
  removeModel(modelName: string): void {
    this.models.delete(modelName);
  }

  /**
   * Get available models
   */
  getAvailableModels(): ModelCapability[] {
    return Array.from(this.models.values());
  }

  /**
   * Clear performance history
   */
  clearHistory(): void {
    this.performanceHistory = [];
  }
}

export default EnhancedModelRouter;
