/**
 * Budget Manager - Cost-Aware Mode System
 *
 * When user overspends, automatically switch to cost-saving mode:
 * - Use cheaper models
 * - Keep essential features (images, file reading, basic tools)
 * - Reduce expensive operations
 * - Show clear budget warnings
 *
 * Similar to Cursor's "auto mode" when budget is low
 */

export type BudgetMode = 'normal' | 'cost_saving' | 'critical';

export interface BudgetSettings {
  monthlyBudget?: number;
  currentSpend?: number;
  costSavingThreshold?: number; // Percentage (e.g., 0.8 = 80% of budget)
  criticalThreshold?: number; // Percentage (e.g., 0.95 = 95% of budget)
}

export interface ModelCost {
  provider: string;
  model: string;
  costPer1kTokens: number; // Input tokens
  outputCostPer1kTokens: number; // Output tokens
  tier: 'free' | 'low' | 'medium' | 'high' | 'premium';
}

/**
 * Cost estimates per 1k tokens (rough estimates, adjust based on actual pricing)
 */
const MODEL_COSTS: Record<string, ModelCost> = {
  // Free/Local models
  'ollama/qwen2.5-coder:7b': {
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
    costPer1kTokens: 0,
    outputCostPer1kTokens: 0,
    tier: 'free',
  },
  'ollama/qwen2.5-coder:32b': {
    provider: 'ollama',
    model: 'qwen2.5-coder:32b',
    costPer1kTokens: 0,
    outputCostPer1kTokens: 0,
    tier: 'free',
  },

  // Low cost cloud models
  'ollama/qwen3-coder:480b-cloud': {
    provider: 'ollama',
    model: 'qwen3-coder:480b-cloud',
    costPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
    tier: 'low',
  },
  'ollama/qwen3-coder-next:cloud': {
    provider: 'ollama',
    model: 'qwen3-coder-next:cloud',
    costPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
    tier: 'low',
  },
  'ollama/kimi-k2.6:cloud': {
    provider: 'ollama',
    model: 'kimi-k2.6:cloud',
    costPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
    tier: 'low',
  },
  'ollama/deepseek-v3.1:671b-cloud': {
    provider: 'ollama',
    model: 'deepseek-v3.1:671b-cloud',
    costPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.002,
    tier: 'low',
  },
  'openai/gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    costPer1kTokens: 0.15,
    outputCostPer1kTokens: 0.6,
    tier: 'low',
  },

  // Medium cost
  'anthropic/claude-3-5-haiku-20241022': {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    costPer1kTokens: 0.25,
    outputCostPer1kTokens: 1.25,
    tier: 'medium',
  },
  'openai/gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    costPer1kTokens: 2.5,
    outputCostPer1kTokens: 10,
    tier: 'medium',
  },

  // High cost
  'anthropic/claude-sonnet-4-20250514': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    costPer1kTokens: 3,
    outputCostPer1kTokens: 15,
    tier: 'high',
  },
  'anthropic/claude-sonnet-4-6': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    costPer1kTokens: 3,
    outputCostPer1kTokens: 15,
    tier: 'high',
  },
  'openai/gpt-5.2': {
    provider: 'openai',
    model: 'gpt-5.2',
    costPer1kTokens: 4,
    outputCostPer1kTokens: 16,
    tier: 'high',
  },
  'openai/gpt-5.2-2025-12-11': {
    provider: 'openai',
    model: 'gpt-5.2-2025-12-11',
    costPer1kTokens: 4,
    outputCostPer1kTokens: 16,
    tier: 'high',
  },
  'openai/gpt-5.4': {
    provider: 'openai',
    model: 'gpt-5.4',
    costPer1kTokens: 2.5,
    outputCostPer1kTokens: 15,
    tier: 'high',
  },
  'openai/gpt-5.4-mini': {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    costPer1kTokens: 0.75,
    outputCostPer1kTokens: 4.5,
    tier: 'medium',
  },
  'openai/gpt-5.4-nano': {
    provider: 'openai',
    model: 'gpt-5.4-nano',
    costPer1kTokens: 0.25,
    outputCostPer1kTokens: 1.5,
    tier: 'low',
  },
  'openai/gpt-5.5': {
    provider: 'openai',
    model: 'gpt-5.5',
    costPer1kTokens: 5,
    outputCostPer1kTokens: 30,
    tier: 'premium',
  },
  'openai/gpt-5.5-mini': {
    provider: 'openai',
    model: 'gpt-5.5-mini',
    costPer1kTokens: 1.5,
    outputCostPer1kTokens: 9,
    tier: 'medium',
  },
  'openai/gpt-5.5-nano': {
    provider: 'openai',
    model: 'gpt-5.5-nano',
    costPer1kTokens: 0.5,
    outputCostPer1kTokens: 3,
    tier: 'low',
  },

  // Premium (Opus / flagship tier)
  'anthropic/claude-opus-4-7': {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    costPer1kTokens: 5,
    outputCostPer1kTokens: 25,
    tier: 'premium',
  },
  'anthropic/claude-opus-4-6': {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    costPer1kTokens: 5,
    outputCostPer1kTokens: 25,
    tier: 'premium',
  },
  'anthropic/claude-opus-4-5-20251101': {
    provider: 'anthropic',
    model: 'claude-opus-4-5-20251101',
    costPer1kTokens: 5,
    outputCostPer1kTokens: 25,
    tier: 'premium',
  },
  'anthropic/claude-opus-4-20250514': {
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    costPer1kTokens: 15,
    outputCostPer1kTokens: 75,
    tier: 'premium',
  },
};

/**
 * Budget Manager
 * Tracks spending and automatically switches to cost-saving mode
 */
export class BudgetManager {
  private settings: BudgetSettings;
  private currentMode: BudgetMode = 'normal';

  constructor(settings: BudgetSettings = {}) {
    this.settings = {
      costSavingThreshold: 0.8, // 80% of budget
      criticalThreshold: 0.95, // 95% of budget
      ...settings,
    };
    this.updateMode();
  }

  /**
   * Update budget mode based on current spending
   */
  updateMode(): BudgetMode {
    if (!this.settings.monthlyBudget || !this.settings.currentSpend) {
      return 'normal'; // No budget tracking = normal mode
    }

    const spendRatio = this.settings.currentSpend / this.settings.monthlyBudget;

    if (spendRatio >= (this.settings.criticalThreshold || 0.95)) {
      this.currentMode = 'critical';
    } else if (spendRatio >= (this.settings.costSavingThreshold || 0.8)) {
      this.currentMode = 'cost_saving';
    } else {
      this.currentMode = 'normal';
    }

    return this.currentMode;
  }

  /**
   * Get current budget mode
   */
  getMode(): BudgetMode {
    return this.currentMode;
  }

  /**
   * Check if a model is allowed in current budget mode
   */
  isModelAllowed(provider: string, model: string): boolean {
    const modelKey = `${provider}/${model}`;
    const cost = MODEL_COSTS[modelKey];

    if (!cost) {
      // Unknown model - allow it (might be new)
      return true;
    }

    switch (this.currentMode) {
      case 'normal':
        // All models allowed
        return true;

      case 'cost_saving':
        // Block premium and high-cost models
        return cost.tier !== 'premium' && cost.tier !== 'high';

      case 'critical':
        // Only free and low-cost models
        return cost.tier === 'free' || cost.tier === 'low';
    }
  }

  /**
   * Get recommended model for current budget mode
   */
  getRecommendedModel(taskType: 'chat' | 'code' | 'analysis' | 'creative' | 'debug' | 'complex'): {
    provider: string;
    model: string;
    reason: string;
  } {
    switch (this.currentMode) {
      case 'normal':
        // Use best model for task
        if (taskType === 'code' || taskType === 'debug') {
          return {
            provider: 'ollama',
            model: 'qwen3-coder:480b-cloud',
            reason: 'Best for code tasks',
          };
        }
        return {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          reason: 'Best for complex tasks',
        };

      case 'cost_saving':
        // Use cheaper but still capable models
        if (taskType === 'code' || taskType === 'debug') {
          return {
            provider: 'ollama',
            model: 'qwen3-coder:480b-cloud',
            reason: 'Cost-saving: Good code model',
          };
        }
        return {
          provider: 'openai',
          model: 'gpt-4o-mini',
          reason: 'Cost-saving: Capable but cheaper',
        };

      case 'critical':
        // Use cheapest models
        if (taskType === 'code' || taskType === 'debug') {
          return {
            provider: 'ollama',
            model: 'qwen2.5-coder:32b',
            reason: 'Critical budget: Free local model',
          };
        }
        return {
          provider: 'ollama',
          model: 'qwen3-coder:480b-cloud',
          reason: 'Critical budget: Low-cost cloud model',
        };
    }
  }

  /**
   * Check if feature is available in current mode
   */
  isFeatureAvailable(
    feature: 'images' | 'parallel_agents' | 'deep_analysis' | 'long_context'
  ): boolean {
    switch (this.currentMode) {
      case 'normal':
        return true; // All features available

      case 'cost_saving':
        // Keep essential features, reduce expensive ones
        return feature === 'images' || feature === 'long_context'; // Images are cheap, long context is needed

      case 'critical':
        // Only essential features
        return feature === 'images'; // Images are cheap, everything else costs more
    }
  }

  /**
   * Get budget warning message
   */
  getBudgetWarning(): string | null {
    if (!this.settings.monthlyBudget || !this.settings.currentSpend) {
      return null;
    }

    const spendRatio = this.settings.currentSpend / this.settings.monthlyBudget;
    const remaining = this.settings.monthlyBudget - this.settings.currentSpend;
    const percentUsed = (spendRatio * 100).toFixed(1);

    switch (this.currentMode) {
      case 'cost_saving':
        return `💰 Cost-saving mode active (${percentUsed}% of budget used). Using cheaper models. $${remaining.toFixed(2)} remaining.`;

      case 'critical':
        return `🚨 Critical budget mode (${percentUsed}% used). Only free/low-cost models available. $${remaining.toFixed(2)} remaining.`;

      default:
        return null;
    }
  }

  /**
   * Update spending
   */
  updateSpending(amount: number): void {
    if (this.settings.currentSpend !== undefined) {
      this.settings.currentSpend += amount;
      this.updateMode();
    }
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number = 0
  ): number {
    const modelKey = `${provider}/${model}`;
    const cost = MODEL_COSTS[modelKey];

    if (!cost) {
      // Unknown model - estimate based on provider
      return inputTokens * 0.001; // Conservative estimate
    }

    const inputCost = (inputTokens / 1000) * cost.costPer1kTokens;
    const outputCost = (outputTokens / 1000) * cost.outputCostPer1kTokens;

    return inputCost + outputCost;
  }
}

/**
 * Global budget manager instance
 */
let globalBudgetManager: BudgetManager | null = null;

/**
 * Get or create global budget manager
 */
export function getBudgetManager(settings?: BudgetSettings): BudgetManager {
  if (!globalBudgetManager) {
    globalBudgetManager = new BudgetManager(settings);
  }
  return globalBudgetManager;
}

/**
 * Reset global budget manager (for testing)
 */
export function resetBudgetManager(): void {
  globalBudgetManager = null;
}

export default BudgetManager;
