/**
 * AgentPrime - Enhanced Model Router
 * Routes requests to best model based on task complexity
 * Ported from ActivatePrime's enhanced_model_router.py
 */

interface ModelTier {
  name: string;
  provider: 'ollama' | 'anthropic' | 'openai' | 'openrouter';
  model: string;
  tier: 'fast' | 'deep' | 'fallback';
  capabilities: string[];
  costPerToken?: number;
  maxTokens: number;
  contextWindow: number;
}

interface TaskComplexity {
  level: 'simple_questions' | 'basic_coding' | 'complex_reasoning' | 'advanced_coding' | 'architectural_design';
  confidence: number;
  indicators: string[];
  estimatedTokens: number;
  requiresCreativity: boolean;
  requiresPrecision: boolean;
  timeSensitive: boolean;
}

interface RoutingDecision {
  model: ModelTier;
  reasoning: string;
  alternatives: ModelTier[];
  costEstimate: number;
  performance: 'fast' | 'balanced' | 'thorough';
  fallbackStrategy: string;
}

interface PerformanceMetrics {
  modelName: string;
  responseTime: number;
  tokenUsage: number;
  successRate: number;
  cost: number;
  timestamp: number;
}

export class EnhancedModelRouter {
  private modelChain: ModelTier[] = [
    // Fast tier - for quick responses
    {
      name: 'Fast Local',
      provider: 'ollama',
      model: 'mistral:7b',
      tier: 'fast',
      capabilities: ['quick_responses', 'basic_coding', 'explanations'],
      maxTokens: 4096,
      contextWindow: 8192
    },
    {
      name: 'Fast Local Advanced',
      provider: 'ollama',
      model: 'llama3.1:8b',
      tier: 'fast',
      capabilities: ['coding', 'analysis', 'debugging'],
      maxTokens: 4096,
      contextWindow: 8192
    },
    // Deep tier - for complex tasks
    {
      name: 'Deep Local',
      provider: 'ollama',
      model: 'llama3.1:70b',
      tier: 'deep',
      capabilities: ['complex_reasoning', 'advanced_coding', 'architecture'],
      maxTokens: 4096,
      contextWindow: 8192
    },
    // Cloud models as fallback
    {
      name: 'Claude Haiku',
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      tier: 'deep',
      capabilities: ['all_tasks', 'fast_responses', 'cost_effective'],
      costPerToken: 0.00025,
      maxTokens: 4096,
      contextWindow: 200000
    },
    {
      name: 'Claude Sonnet',
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      tier: 'deep',
      capabilities: ['all_tasks', 'high_quality', 'complex_reasoning'],
      costPerToken: 0.003,
      maxTokens: 4096,
      contextWindow: 200000
    },
    // Fallback
    {
      name: 'GPT-4',
      provider: 'openai',
      model: 'gpt-4',
      tier: 'fallback',
      capabilities: ['all_tasks', 'high_quality', 'maximum_capability'],
      costPerToken: 0.03,
      maxTokens: 4096,
      contextWindow: 8192
    }
  ];

  private performanceHistory: PerformanceMetrics[] = [];
  private routingRules: { [key: string]: { preferred: string[], avoid: string[] } } = {
    simple_questions: {
      preferred: ['fast'],
      avoid: ['deep', 'fallback']
    },
    basic_coding: {
      preferred: ['fast', 'deep'],
      avoid: ['fallback']
    },
    complex_reasoning: {
      preferred: ['deep'],
      avoid: ['fast']
    },
    advanced_coding: {
      preferred: ['deep', 'claude-3-haiku-20240307'],
      avoid: ['fast']
    },
    architectural_design: {
      preferred: ['deep', 'claude-3-sonnet-20240229'],
      avoid: ['fast']
    }
  };

  /**
   * Analyze task complexity to determine routing requirements
   */
  analyzeTaskComplexity(prompt: string): TaskComplexity {
    const promptLower = prompt.toLowerCase();
    const indicators: string[] = [];
    let complexityScore = 0;
    let estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimate

    // Simple questions
    const simplePatterns = [
      'what is', 'how do', 'explain', 'tell me about', 'what does',
      'can you', 'please explain', 'how to', 'what\'s the difference'
    ];
    for (const pattern of simplePatterns) {
      if (promptLower.includes(pattern)) {
        indicators.push(pattern);
        complexityScore += 0.1;
      }
    }

    // Basic coding
    const basicCodingPatterns = [
      'write a function', 'create a class', 'simple script', 'basic implementation',
      'hello world', 'print statement', 'variable assignment'
    ];
    for (const pattern of basicCodingPatterns) {
      if (promptLower.includes(pattern)) {
        indicators.push(pattern);
        complexityScore += 0.3;
      }
    }

    // Complex reasoning
    const complexReasoningPatterns = [
      'analyze', 'design', 'architecture', 'system', 'optimize', 'refactor',
      'complex', 'advanced', 'enterprise', 'scalability', 'performance'
    ];
    for (const pattern of complexReasoningPatterns) {
      if (promptLower.includes(pattern)) {
        indicators.push(pattern);
        complexityScore += 0.6;
      }
    }

    // Advanced coding
    const advancedCodingPatterns = [
      'implement algorithm', 'data structure', 'async programming', 'api integration',
      'database design', 'authentication', 'security', 'testing framework'
    ];
    for (const pattern of advancedCodingPatterns) {
      if (promptLower.includes(pattern)) {
        indicators.push(pattern);
        complexityScore += 0.8;
      }
    }

    // Architectural design
    const architecturalPatterns = [
      'microservices', 'distributed system', 'cloud architecture', 'design patterns',
      'system design', 'scalability', 'high availability', 'load balancing'
    ];
    for (const pattern of architecturalPatterns) {
      if (promptLower.includes(pattern)) {
        indicators.push(pattern);
        complexityScore += 1.0;
      }
    }

    // Length-based complexity
    if (prompt.length > 1000) {
      complexityScore += 0.3;
      estimatedTokens += 200;
    }

    // Code indicators
    const codeIndicators = ['function', 'class', 'import', 'export', 'const', 'let', 'var'];
    const codeMatches = codeIndicators.filter(indicator => promptLower.includes(indicator)).length;
    if (codeMatches > 3) {
      complexityScore += 0.4;
    }

    // Determine task level
    let level: TaskComplexity['level'];
    if (complexityScore >= 1.5) level = 'architectural_design';
    else if (complexityScore >= 1.0) level = 'advanced_coding';
    else if (complexityScore >= 0.6) level = 'complex_reasoning';
    else if (complexityScore >= 0.3) level = 'basic_coding';
    else level = 'simple_questions';

    // Additional analysis
    const requiresCreativity = promptLower.includes('creative') || promptLower.includes('design') || promptLower.includes('innovative');
    const requiresPrecision = promptLower.includes('accurate') || promptLower.includes('precise') || promptLower.includes('exact');
    const timeSensitive = promptLower.includes('urgent') || promptLower.includes('asap') || promptLower.includes('deadline');

    return {
      level,
      confidence: Math.min(1.0, complexityScore / 2.0),
      indicators,
      estimatedTokens,
      requiresCreativity,
      requiresPrecision,
      timeSensitive
    };
  }

  /**
   * Route request to best model based on task analysis
   */
  routeRequest(
    prompt: string,
    userPreferences?: { preferredProvider?: string; maxCost?: number; prioritizeSpeed?: boolean }
  ): RoutingDecision {
    const taskComplexity = this.analyzeTaskComplexity(prompt);
    const rules = this.routingRules[taskComplexity.level];

    // Filter available models based on preferences
    let candidateModels = this.modelChain.filter(model => {
      // Check user preferences
      if (userPreferences?.preferredProvider && model.provider !== userPreferences.preferredProvider) {
        return false;
      }
      if (userPreferences?.maxCost && model.costPerToken && model.costPerToken > userPreferences.maxCost) {
        return false;
      }
      return true;
    });

    // Apply routing rules
    let preferredModels = candidateModels.filter(model =>
      rules.preferred.some(pref => model.tier === pref || model.model.includes(pref))
    );

    // If no preferred models available, use all candidates but avoid explicitly bad ones
    if (preferredModels.length === 0) {
      preferredModels = candidateModels.filter(model =>
        !rules.avoid.some(avoid => model.tier === avoid || model.model.includes(avoid))
      );
    }

    // If still no models, use any available
    if (preferredModels.length === 0) {
      preferredModels = candidateModels;
    }

    // Select best model based on performance and cost
    const selectedModel = this.selectOptimalModel(preferredModels, taskComplexity, userPreferences);

    // Generate alternatives (other suitable models)
    const alternatives = preferredModels.filter(model => model !== selectedModel).slice(0, 2);

    // Calculate cost estimate
    const costEstimate = selectedModel.costPerToken
      ? selectedModel.costPerToken * taskComplexity.estimatedTokens
      : 0;

    // Determine performance priority
    let performance: RoutingDecision['performance'];
    if (taskComplexity.timeSensitive || userPreferences?.prioritizeSpeed) {
      performance = 'fast';
    } else if (taskComplexity.level === 'architectural_design' || taskComplexity.requiresCreativity) {
      performance = 'thorough';
    } else {
      performance = 'balanced';
    }

    // Generate reasoning
    const reasoning = this.generateRoutingReasoning(selectedModel, taskComplexity, performance);

    return {
      model: selectedModel,
      reasoning,
      alternatives,
      costEstimate,
      performance,
      fallbackStrategy: this.generateFallbackStrategy(selectedModel)
    };
  }

  /**
   * Select optimal model from candidates
   */
  private selectOptimalModel(
    candidates: ModelTier[],
    taskComplexity: TaskComplexity,
    preferences?: { prioritizeSpeed?: boolean }
  ): ModelTier {
    if (candidates.length === 1) {
      return candidates[0];
    }

    // Score each candidate
    const scoredCandidates = candidates.map(model => {
      let score = 0;

      // Performance history bonus
      const recentPerformance = this.getRecentPerformance(model.model);
      if (recentPerformance) {
        score += recentPerformance.successRate * 0.3;
        // Prefer faster models if speed is prioritized
        if (preferences?.prioritizeSpeed) {
          score += (1 / recentPerformance.responseTime) * 0.2;
        }
      }

      // Capability matching
      const hasRequiredCapabilities = this.hasRequiredCapabilities(model, taskComplexity);
      if (hasRequiredCapabilities) {
        score += 0.4;
      }

      // Cost efficiency (prefer cheaper models for simple tasks)
      if (model.costPerToken) {
        const costEfficiency = taskComplexity.level === 'simple_questions' ? 0.2 : 0.1;
        score += (1 / model.costPerToken) * costEfficiency;
      }

      // Prefer cloud models for better availability and capabilities
      // (Ollama local models still available but not prioritized)
      if (model.provider !== 'ollama') {
        score += 0.15;  // Boost cloud models over local
      }

      return { model, score };
    });

    // Return highest scoring model
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates[0].model;
  }

  /**
   * Check if model has required capabilities for task
   */
  private hasRequiredCapabilities(model: ModelTier, taskComplexity: TaskComplexity): boolean {
    const requiredCapabilities = this.getRequiredCapabilities(taskComplexity);
    return requiredCapabilities.every(cap => model.capabilities.includes(cap));
  }

  /**
   * Get required capabilities for task complexity
   */
  private getRequiredCapabilities(taskComplexity: TaskComplexity): string[] {
    const baseCapabilities = ['basic_responses'];

    switch (taskComplexity.level) {
      case 'simple_questions':
        return [...baseCapabilities, 'quick_responses'];
      case 'basic_coding':
        return [...baseCapabilities, 'coding'];
      case 'complex_reasoning':
        return [...baseCapabilities, 'complex_reasoning'];
      case 'advanced_coding':
        return [...baseCapabilities, 'coding', 'advanced_coding'];
      case 'architectural_design':
        return [...baseCapabilities, 'complex_reasoning', 'architecture'];
      default:
        return baseCapabilities;
    }
  }

  /**
   * Get recent performance metrics for a model
   */
  private getRecentPerformance(modelName: string): PerformanceMetrics | null {
    const recentMetrics = this.performanceHistory
      .filter(m => m.modelName === modelName)
      .filter(m => Date.now() - m.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
      .sort((a, b) => b.timestamp - a.timestamp);

    if (recentMetrics.length === 0) {
      return null;
    }

    // Average recent performance
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    const avgSuccessRate = recentMetrics.reduce((sum, m) => sum + m.successRate, 0) / recentMetrics.length;

    return {
      modelName,
      responseTime: avgResponseTime,
      tokenUsage: 0, // Not needed for routing
      successRate: avgSuccessRate,
      cost: 0, // Not needed for routing
      timestamp: Date.now()
    };
  }

  /**
   * Generate routing reasoning explanation
   */
  private generateRoutingReasoning(
    model: ModelTier,
    taskComplexity: TaskComplexity,
    performance: RoutingDecision['performance']
  ): string {
    let reasoning = `Selected ${model.name} for ${taskComplexity.level} task. `;

    if (performance === 'fast') {
      reasoning += 'Prioritizing speed for time-sensitive request. ';
    } else if (performance === 'thorough') {
      reasoning += 'Using comprehensive model for complex requirements. ';
    }

    if (model.provider === 'ollama') {
      reasoning += 'Using local Ollama model for offline capability. ';
    } else {
      reasoning += `Using ${model.provider} cloud model for reliability and advanced capabilities. `;
    }

    if (taskComplexity.requiresCreativity) {
      reasoning += 'Task requires creative thinking. ';
    }
    if (taskComplexity.requiresPrecision) {
      reasoning += 'Task requires high precision. ';
    }

    return reasoning.trim();
  }

  /**
   * Generate fallback strategy
   */
  private generateFallbackStrategy(primaryModel: ModelTier): string {
    const fallbackModels = this.modelChain.filter(m =>
      m.tier === 'fallback' || (m.provider !== primaryModel.provider && m.tier === primaryModel.tier)
    );

    if (fallbackModels.length === 0) {
      return 'Retry with same model after cooldown';
    }

    return `Fallback to: ${fallbackModels.map(m => m.name).join(', ')}`;
  }

  /**
   * Record performance metrics for learning
   */
  recordPerformance(metrics: Omit<PerformanceMetrics, 'timestamp'>): void {
    this.performanceHistory.push({
      ...metrics,
      timestamp: Date.now()
    });

    // Keep only recent history (last 1000 entries)
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  /**
   * Update model chain (for dynamic configuration)
   */
  updateModelChain(newChain: ModelTier[]): void {
    this.modelChain = newChain;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): any {
    const modelUsage = this.performanceHistory.reduce((acc, metric) => {
      if (!acc[metric.modelName]) {
        acc[metric.modelName] = { count: 0, avgResponseTime: 0, avgSuccessRate: 0 };
      }
      acc[metric.modelName].count++;
      acc[metric.modelName].avgResponseTime += metric.responseTime;
      acc[metric.modelName].avgSuccessRate += metric.successRate;
      return acc;
    }, {} as any);

    // Calculate averages
    Object.keys(modelUsage).forEach(modelName => {
      const stats = modelUsage[modelName];
      stats.avgResponseTime /= stats.count;
      stats.avgSuccessRate /= stats.count;
    });

    return {
      totalRequests: this.performanceHistory.length,
      modelUsage,
      routingRules: this.routingRules
    };
  }
}

// Singleton instance
let enhancedModelRouterInstance: EnhancedModelRouter | null = null;

export function getEnhancedModelRouter(): EnhancedModelRouter {
  if (!enhancedModelRouterInstance) {
    enhancedModelRouterInstance = new EnhancedModelRouter();
  }
  return enhancedModelRouterInstance;
}
