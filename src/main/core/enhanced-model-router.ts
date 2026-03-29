/**
 * Canonical enhanced model router wrapper with legacy API compatibility.
 *
 * The modern routing implementation lives in ActivatePrime. This wrapper keeps
 * backward-compatible method names so older call sites and tests continue to
 * work while still routing through the canonical implementation.
 */

import {
  EnhancedModelRouter as ActivatePrimeEnhancedModelRouter,
  type ModelCapability,
  type TaskAnalysis,
  type RoutingDecision,
  type PerformanceRecord
} from '../modules/activateprime/enhanced-model-router';

export type {
  ModelCapability,
  TaskAnalysis,
  RoutingDecision,
  PerformanceRecord
};

type LegacyTier = 'fast' | 'deep';

interface LegacySelection {
  provider: string;
  model: string;
  tier: LegacyTier;
  reasoning: string;
}

interface LegacyPerformanceMetric {
  provider: string;
  model: string;
  responseTime: number;
  success: boolean;
  timestamp: Date;
}

interface LegacySelectOptions {
  preferredModel?: string;
  preferredProvider?: string;
}

export class EnhancedModelRouter extends ActivatePrimeEnhancedModelRouter {
  private legacyPerformance: LegacyPerformanceMetric[] = [];
  private totalCost = 0;

  async selectModel(
    prompt: string,
    taskType: string = 'chat',
    options?: LegacySelectOptions
  ): Promise<LegacySelection> {
    const preferredModel = this.resolvePreferredModel(options?.preferredModel);
    if (preferredModel) {
      return this.toLegacySelection(preferredModel.name, preferredModel.provider, 'Using user preferred model');
    }

    const desiredTier = this.inferDesiredTier(prompt, taskType);
    const routing = this.routeRequest(prompt, {
      preferredProvider: options?.preferredProvider
    });
    return this.pickByTier(routing, desiredTier);
  }

  async selectModelWithFallback(
    prompt: string,
    taskType: string = 'chat',
    options?: LegacySelectOptions
  ): Promise<LegacySelection> {
    try {
      return await this.selectModel(prompt, taskType, options);
    } catch {
      return this.selectCostEffectiveModel(prompt);
    }
  }

  async selectModelWithRetry(
    prompt: string,
    taskType: string = 'chat',
    retries: number = 3,
    options?: LegacySelectOptions
  ): Promise<LegacySelection> {
    let lastError: unknown;
    const attempts = Math.max(1, retries);

    for (let i = 0; i < attempts; i += 1) {
      try {
        return await this.selectModelWithFallback(prompt, taskType, options);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    return this.selectCostEffectiveModel(prompt);
  }

  async selectModelWithTimeout(
    prompt: string,
    taskType: string = 'chat',
    timeoutMs: number = 1000,
    options?: LegacySelectOptions
  ): Promise<LegacySelection> {
    const effectiveTimeout = Math.max(1, timeoutMs);

    return Promise.race<LegacySelection>([
      this.selectModelWithRetry(prompt, taskType, 2, options),
      new Promise<LegacySelection>((resolve) => {
        setTimeout(() => {
          resolve(this.getSafeFallbackSelection(prompt));
        }, effectiveTimeout);
      })
    ]);
  }

  async selectCostEffectiveModel(prompt: string): Promise<LegacySelection> {
    const localCandidate = this.getAvailableModels()
      .filter((model) => model.provider === 'ollama')
      .sort((a, b) => {
        const costDiff = this.costRank(a.cost) - this.costRank(b.cost);
        if (costDiff !== 0) return costDiff;
        return this.speedRank(b.speed) - this.speedRank(a.speed);
      })[0];

    if (localCandidate) {
      return this.toLegacySelection(localCandidate.name, localCandidate.provider, 'Most cost-effective local model');
    }

    const routing = this.routeRequest(prompt);
    return this.toLegacySelection(routing.model, routing.provider, routing.reasoning);
  }

  async matchCapabilities(capabilities: string[]): Promise<{
    provider: string;
    model: string;
    capabilities: string[];
    score: number;
  }> {
    const requested = capabilities.map((cap) => cap.toLowerCase());
    const models = this.getAvailableModels();

    let bestModel: ModelCapability | undefined;
    let bestScore = -1;
    let bestMatches: string[] = [];

    for (const model of models) {
      const matched = requested.filter((cap) =>
        model.supportedTasks.some((task) => task.toLowerCase().includes(cap)) ||
        model.strengths.some((strength) => strength.toLowerCase().includes(cap))
      );

      const score = matched.length / Math.max(1, requested.length);
      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
        bestMatches = matched;
      }
    }

    if (!bestModel) {
      const fallback = this.getSafeFallbackSelection('capability fallback');
      return {
        provider: fallback.provider,
        model: fallback.model,
        capabilities: [],
        score: 0
      };
    }

    return {
      provider: bestModel.provider,
      model: bestModel.name,
      capabilities: bestMatches.length > 0 ? bestMatches : requested,
      score: Math.max(0, bestScore)
    };
  }

  recordPerformance(record: Omit<PerformanceRecord, 'timestamp'>): void;
  recordPerformance(provider: string, model: string, responseTime: number, success: boolean): void;
  recordPerformance(
    recordOrProvider: Omit<PerformanceRecord, 'timestamp'> | string,
    model?: string,
    responseTime?: number,
    success?: boolean
  ): void {
    const record: Omit<PerformanceRecord, 'timestamp'> =
      typeof recordOrProvider === 'string'
        ? {
            provider: recordOrProvider,
            model: model || 'unknown',
            taskType: 'chat',
            responseTime: responseTime || 0,
            success: Boolean(success),
            tokensUsed: 0,
            cost: 0
          }
        : recordOrProvider;

    super.recordPerformance(record);
    this.legacyPerformance.push({
      provider: record.provider,
      model: record.model,
      responseTime: record.responseTime,
      success: record.success,
      timestamp: new Date()
    });
  }

  getPerformanceMetrics(): LegacyPerformanceMetric[] {
    return [...this.legacyPerformance];
  }

  getAverageLatency(provider: string, model: string): number {
    const values = this.legacyPerformance
      .filter((metric) => metric.provider === provider && metric.model === model)
      .map((metric) => metric.responseTime);

    if (values.length === 0) return 0;
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round(sum / values.length);
  }

  getP95Latency(provider: string, model: string): number {
    const values = this.legacyPerformance
      .filter((metric) => metric.provider === provider && metric.model === model)
      .map((metric) => metric.responseTime)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;
    const idx = Math.floor((values.length - 1) * 0.95);
    return values[idx];
  }

  calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const capability = this.getAvailableModels().find((candidate) =>
      candidate.provider === provider && candidate.name === model
    );
    const rate = capability?.performanceMetrics.costPerToken ?? this.defaultCostPerToken(provider);
    return (inputTokens + outputTokens) * rate;
  }

  recordCost(_provider: string, _model: string, cost: number): void {
    this.totalCost += Math.max(0, cost);
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  clearHistory(): void {
    super.clearHistory();
    this.legacyPerformance = [];
    this.totalCost = 0;
  }

  private resolvePreferredModel(preferredModel?: string): ModelCapability | undefined {
    if (!preferredModel) return undefined;

    const normalized = preferredModel.toLowerCase();
    return this.getAvailableModels().find((model) => {
      const modelName = model.name.toLowerCase();
      return modelName === normalized || modelName.includes(normalized);
    });
  }

  private inferDesiredTier(prompt: string, taskType: string): LegacyTier {
    const lowerPrompt = `${taskType} ${prompt}`.toLowerCase();
    const complexKeywords = [
      'distributed',
      'architecture',
      'system',
      'implement',
      'migration',
      'optimize',
      'scalable',
      'concurrency',
      'security',
      'performance',
      'caching',
      'redis',
      'refactor'
    ];

    if (complexKeywords.some((keyword) => lowerPrompt.includes(keyword))) {
      return 'deep';
    }

    if (prompt.split(/\s+/).length > 12) {
      return 'deep';
    }

    return 'fast';
  }

  private pickByTier(routing: RoutingDecision, desiredTier: LegacyTier): LegacySelection {
    const candidates = [
      { provider: routing.provider, model: routing.model, reason: routing.reasoning },
      ...routing.fallbackOptions.map((option) => ({
        provider: option.provider,
        model: option.model,
        reason: option.reason
      }))
    ];

    const match = candidates.find((candidate) => this.tierForModel(candidate.model) === desiredTier);
    if (match) {
      return this.toLegacySelection(match.model, match.provider, match.reason);
    }

    return this.toLegacySelection(routing.model, routing.provider, routing.reasoning);
  }

  private getSafeFallbackSelection(prompt: string): LegacySelection {
    const ollamaFast = this.getAvailableModels().find(
      (model) => model.provider === 'ollama' && this.tierForSpeed(model.speed) === 'fast'
    );
    if (ollamaFast) {
      return this.toLegacySelection(ollamaFast.name, ollamaFast.provider, 'Timeout fallback to local fast model');
    }

    const routing = this.routeRequest(prompt);
    return this.toLegacySelection(routing.model, routing.provider, routing.reasoning);
  }

  private toLegacySelection(modelName: string, provider: string, reasoning: string): LegacySelection {
    return {
      provider,
      model: modelName,
      tier: this.tierForModel(modelName),
      reasoning
    };
  }

  private tierForModel(modelName: string): LegacyTier {
    const model = this.getAvailableModels().find((candidate) => candidate.name === modelName);
    if (model) {
      return this.tierForSpeed(model.speed);
    }

    const lowerModel = modelName.toLowerCase();
    if (
      lowerModel.includes('mini') ||
      lowerModel.includes('haiku') ||
      lowerModel.includes(':7b') ||
      lowerModel.includes(':8b') ||
      lowerModel.includes('small') ||
      lowerModel.includes('nano')
    ) {
      return 'fast';
    }
    return 'deep';
  }

  private tierForSpeed(speed: ModelCapability['speed']): LegacyTier {
    return speed === 'fast' ? 'fast' : 'deep';
  }

  private speedRank(speed: ModelCapability['speed']): number {
    const ranks: Record<ModelCapability['speed'], number> = {
      fast: 3,
      medium: 2,
      slow: 1
    };
    return ranks[speed];
  }

  private costRank(cost: ModelCapability['cost']): number {
    const ranks: Record<ModelCapability['cost'], number> = {
      free: 0,
      low: 1,
      medium: 2,
      high: 3
    };
    return ranks[cost];
  }

  private defaultCostPerToken(provider: string): number {
    const rates: Record<string, number> = {
      anthropic: 0.0008,
      openai: 0.0007,
      openrouter: 0.0006,
      ollama: 0.0001
    };
    return rates[provider] ?? 0.0005;
  }
}

let enhancedModelRouterInstance: EnhancedModelRouter | null = null;

export function getEnhancedModelRouter(): EnhancedModelRouter {
  if (!enhancedModelRouterInstance) {
    enhancedModelRouterInstance = new EnhancedModelRouter();
  }
  return enhancedModelRouterInstance;
}

export default EnhancedModelRouter;

