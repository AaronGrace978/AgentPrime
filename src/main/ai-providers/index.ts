/**
 * AI Provider Router
 * Manages multiple AI providers and routes requests
 * 
 * Features:
 * - Multi-provider support (Ollama, Anthropic, OpenAI, OpenRouter)
 * - Dual Model System: Fast model + Deep model with intelligent routing
 * - Smart model selection based on task complexity
 * - Fallback provider support
 */

import { OllamaProvider } from './ollama-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAIProvider } from './openai-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
import type { DualModelConfig } from '../../types';
import { injectCreed } from '../core/dino-buddy-creed';

interface ProviderEntry {
  Class: new (config: ProviderConfig) => BaseProvider;
  instance: BaseProvider | null;
  config: ProviderConfig;
}

/**
 * Model selection mode for dual-model routing
 */
type ModelMode = 'fast' | 'deep' | 'auto';

/**
 * Complexity analysis result
 */
interface ComplexityAnalysis {
  score: number;           // 1-10 scale
  reasoning: string;
  suggestedMode: ModelMode;
  triggers: string[];      // Matched trigger keywords
}

class AIProviderRouter {
  private providers: Map<string, ProviderEntry>;
  private activeProvider: string | null;
  private activeModel: string | null;
  private fallbackProvider: string | null;
  
  // Dual Model System
  private dualModelEnabled: boolean = false;
  private dualModelConfig: DualModelConfig | null = null;

  constructor() {
    this.providers = new Map();
    this.activeProvider = null;
    this.activeModel = null;
    this.fallbackProvider = null;
    
    // Initialize default providers
    this.registerProvider('ollama', OllamaProvider);
    this.registerProvider('anthropic', AnthropicProvider);
    this.registerProvider('openai', OpenAIProvider);
    this.registerProvider('openrouter', OpenRouterProvider);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DUAL MODEL SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Configure the dual model system
   */
  configureDualModel(config: DualModelConfig): void {
    this.dualModelConfig = config;
    this.dualModelEnabled = true;
    console.log('[DualModel] Configured:', {
      fastModel: `${config.fastModel.provider}/${config.fastModel.model}`,
      deepModel: `${config.deepModel.provider}/${config.deepModel.model}`,
      autoRoute: config.autoRoute,
      threshold: config.complexityThreshold
    });
  }
  
  /**
   * Disable dual model system
   */
  disableDualModel(): void {
    this.dualModelEnabled = false;
    console.log('[DualModel] Disabled');
  }
  
  /**
   * Check if dual model is enabled
   */
  isDualModelEnabled(): boolean {
    return this.dualModelEnabled && this.dualModelConfig !== null;
  }
  
  /**
   * Get current dual model configuration
   */
  getDualModelConfig(): DualModelConfig | null {
    return this.dualModelConfig;
  }
  
  /**
   * Analyze message complexity for routing
   */
  analyzeComplexity(message: string, context?: any): ComplexityAnalysis {
    const config = this.dualModelConfig;
    if (!config) {
      return { score: 5, reasoning: 'Dual model not configured', suggestedMode: 'auto', triggers: [] };
    }
    
    let score = 5; // Start at medium
    const triggers: string[] = [];
    const reasons: string[] = [];
    
    const lowerMessage = message.toLowerCase();
    
    // Check deep model triggers
    for (const trigger of config.deepModelTriggers) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        score += 2;
        triggers.push(trigger);
        reasons.push(`Matched deep trigger: "${trigger}"`);
      }
    }
    
    // Check fast model triggers
    for (const trigger of config.fastModelTriggers) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        score -= 2;
        triggers.push(trigger);
        reasons.push(`Matched fast trigger: "${trigger}"`);
      }
    }
    
    // Heuristic complexity analysis
    const complexityIndicators = {
      // High complexity indicators (+)
      'analyze': 1.5,
      'debug': 1.5,
      'refactor': 2,
      'architect': 2,
      'design pattern': 2,
      'optimize': 1.5,
      'complex': 1.5,
      'explain': 1,
      'why': 0.5,
      'how does': 0.5,
      'implement': 1,
      'create a complete': 1.5,
      'full application': 2,
      'security': 1.5,
      'performance': 1.5,
      'algorithm': 1.5,
      'data structure': 1.5,
      'concurrency': 2,
      'async': 1,
      'error handling': 1,
      'edge case': 1.5,
      'test': 1,
      'review': 1.5,
      
      // Low complexity indicators (-)
      'quick': -1,
      'simple': -1.5,
      'basic': -1,
      'just': -0.5,
      'small': -1,
      'fix typo': -2,
      'rename': -1.5,
      'format': -1.5,
      'what is': -0.5,
      'hello': -2,
      'hi': -2,
      'thanks': -2,
      'yes': -2,
      'no': -2,
    };
    
    for (const [indicator, weight] of Object.entries(complexityIndicators)) {
      if (lowerMessage.includes(indicator)) {
        score += weight;
        if (Math.abs(weight) >= 1) {
          reasons.push(`Contains "${indicator}" (${weight > 0 ? '+' : ''}${weight})`);
        }
      }
    }
    
    // Message length factor
    if (message.length > 500) {
      score += 1;
      reasons.push('Long message (+1)');
    } else if (message.length < 50) {
      score -= 1;
      reasons.push('Short message (-1)');
    }
    
    // Code block detection
    const codeBlockCount = (message.match(/```/g) || []).length / 2;
    if (codeBlockCount > 0) {
      score += codeBlockCount * 0.5;
      reasons.push(`Contains ${codeBlockCount} code block(s)`);
    }
    
    // Context-based adjustments
    if (context) {
      if (context.codeLines && context.codeLines > 500) {
        score += 1.5;
        reasons.push('Large code context');
      }
      if (context.hasErrors) {
        score += 1;
        reasons.push('Has errors to debug');
      }
      if (context.fileCount && context.fileCount > 3) {
        score += 1;
        reasons.push('Multi-file context');
      }
    }
    
    // Clamp to 1-10
    score = Math.max(1, Math.min(10, Math.round(score)));
    
    // Determine suggested mode
    let suggestedMode: ModelMode;
    if (score >= config.complexityThreshold) {
      suggestedMode = 'deep';
    } else {
      suggestedMode = 'fast';
    }
    
    return {
      score,
      reasoning: reasons.join('; ') || 'Standard complexity',
      suggestedMode,
      triggers
    };
  }
  
  /**
   * Route to appropriate model based on dual-model config
   */
  routeDualModel(
    message: string, 
    mode: ModelMode = 'auto',
    context?: any
  ): { provider: string; model: string; mode: ModelMode; analysis?: ComplexityAnalysis } {
    const config = this.dualModelConfig;
    
    if (!config || !this.dualModelEnabled) {
      // Fallback to active provider (Anthropic by default)
      return {
        provider: this.activeProvider || 'anthropic',
        model: this.activeModel || 'claude-sonnet-4-20250514',
        mode: 'auto'
      };
    }
    
    // Manual mode selection
    if (mode === 'fast' && config.fastModel.enabled) {
      return {
        provider: config.fastModel.provider,
        model: config.fastModel.model,
        mode: 'fast'
      };
    }
    
    if (mode === 'deep' && config.deepModel.enabled) {
      return {
        provider: config.deepModel.provider,
        model: config.deepModel.model,
        mode: 'deep'
      };
    }
    
    // Auto-routing
    if (mode === 'auto' && config.autoRoute) {
      const analysis = this.analyzeComplexity(message, context);
      
      if (analysis.suggestedMode === 'deep' && config.deepModel.enabled) {
        console.log(`[DualModel] Auto-routed to DEEP model (score: ${analysis.score}): ${analysis.reasoning}`);
        return {
          provider: config.deepModel.provider,
          model: config.deepModel.model,
          mode: 'deep',
          analysis
        };
      } else if (config.fastModel.enabled) {
        console.log(`[DualModel] Auto-routed to FAST model (score: ${analysis.score}): ${analysis.reasoning}`);
        return {
          provider: config.fastModel.provider,
          model: config.fastModel.model,
          mode: 'fast',
          analysis
        };
      }
    }
    
    // Default to fast model if available, otherwise deep
    if (config.fastModel.enabled) {
      return {
        provider: config.fastModel.provider,
        model: config.fastModel.model,
        mode: 'fast'
      };
    }
    
    return {
      provider: config.deepModel.provider,
      model: config.deepModel.model,
      mode: 'deep'
    };
  }
  
  /**
   * Chat with dual-model routing
   */
  async dualChat(
    messages: ChatMessage[],
    options: ChatOptions & { 
      dualMode?: ModelMode;
      context?: any;
    } = {}
  ): Promise<ChatResult & { dualModelInfo?: { mode: ModelMode; analysis?: ComplexityAnalysis } }> {
    if (!this.isDualModelEnabled()) {
      return this.chat(messages, options);
    }
    
    // Get the last user message for analysis
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const messageContent = lastUserMessage?.content || '';
    
    const routing = this.routeDualModel(messageContent, options.dualMode || 'auto', options.context);
    
    // Temporarily switch provider
    const originalProvider = this.activeProvider;
    const originalModel = this.activeModel;
    
    try {
      this.setActiveProvider(routing.provider, routing.model);
      const result = await this.chat(messages, { ...options, model: routing.model });
      
      return {
        ...result,
        dualModelInfo: {
          mode: routing.mode,
          analysis: routing.analysis
        }
      };
    } finally {
      // Restore original provider
      this.setActiveProvider(originalProvider, originalModel);
    }
  }
  
  /**
   * Stream with dual-model routing
   */
  async dualStream(
    messages: ChatMessage[],
    onChunk: StreamCallback,
    options: ChatOptions & { 
      dualMode?: ModelMode;
      context?: any;
      onRouting?: (info: { mode: ModelMode; provider: string; model: string; analysis?: ComplexityAnalysis }) => void;
    } = {}
  ): Promise<void> {
    if (!this.isDualModelEnabled()) {
      return this.stream(messages, onChunk, options);
    }
    
    // Get the last user message for analysis
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const messageContent = lastUserMessage?.content || '';
    
    const routing = this.routeDualModel(messageContent, options.dualMode || 'auto', options.context);
    
    // Notify about routing decision
    if (options.onRouting) {
      options.onRouting({
        mode: routing.mode,
        provider: routing.provider,
        model: routing.model,
        analysis: routing.analysis
      });
    }
    
    // Temporarily switch provider
    const originalProvider = this.activeProvider;
    const originalModel = this.activeModel;
    
    try {
      this.setActiveProvider(routing.provider, routing.model);
      return await this.stream(messages, onChunk, { ...options, model: routing.model });
    } finally {
      // Restore original provider
      this.setActiveProvider(originalProvider, originalModel);
    }
  }

  /**
   * Register a provider class
   */
  registerProvider(name: string, ProviderClass: new (config: ProviderConfig) => BaseProvider): void {
    this.providers.set(name, {
      Class: ProviderClass,
      instance: null,
      config: {}
    });
  }

  /**
   * Configure a provider with API key and settings
   */
  configureProvider(name: string, config: ProviderConfig): BaseProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Unknown provider: ${name}`);
    }

    provider.config = { ...provider.config, ...config };
    provider.instance = new provider.Class(provider.config);
    
    return provider.instance;
  }

  /**
   * Get a provider instance
   */
  getProvider(name: string): BaseProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Unknown provider: ${name}`);
    }

    if (!provider.instance) {
      provider.instance = new provider.Class(provider.config);
    }

    return provider.instance;
  }

  /**
   * Set the active provider and model
   */
  setActiveProvider(providerName: string | null, model: string | null = null): void {
    this.activeProvider = providerName;
    this.activeModel = model;
  }

  /**
   * Set fallback provider (null to disable fallback)
   */
  setFallbackProvider(providerName: string | null): void {
    this.fallbackProvider = providerName;
  }

  /**
   * Get the currently active provider
   */
  getActiveProvider(): BaseProvider {
    if (!this.activeProvider) {
      // Default to Ollama
      this.activeProvider = 'ollama';
    }
    return this.getProvider(this.activeProvider);
  }

  /**
   * Get all provider info
   */
  getProvidersInfo(): Array<{ id: string } & ReturnType<BaseProvider['getInfo']>> {
    const info: Array<{ id: string } & ReturnType<BaseProvider['getInfo']>> = [];
    for (const [name, provider] of this.providers) {
      const instance = provider.instance || new provider.Class(provider.config);
      info.push({
        id: name,
        ...instance.getInfo()
      });
    }
    return info;
  }

  /**
   * Check if an error is a rate limit error (429)
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || error.error || String(error)).toLowerCase();
    return msg.includes('429') || 
           msg.includes('rate_limit') || 
           msg.includes('rate limit') ||
           msg.includes('too many requests') ||
           error.status === 429 ||
           error.response?.status === 429;
  }

  /**
   * Chat with the active provider (with fallback)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const provider = this.getActiveProvider();
    const model = (options.model || this.activeModel) as string | undefined;

    // ═══ DINO BUDDY CREED — Injected at the deepest level ═══
    const messagesWithCreed = injectCreed(messages);

    try {
      const result = await provider.chat(messagesWithCreed, { ...options, model });
      
      // Check for rate limit in result error
      const shouldFallback = !result.success && 
        (this.isRateLimitError(result) || this.isRateLimitError({ message: result.error }));
      
      if ((shouldFallback || !result.success) && this.fallbackProvider && this.fallbackProvider !== this.activeProvider) {
        if (shouldFallback) {
          console.log(`[AI Router] ⚠️ Rate limit detected, switching to fallback: ${this.fallbackProvider}`);
        } else {
          console.log(`Primary provider failed, trying fallback: ${this.fallbackProvider}`);
        }
        
        // Check if fallback is Ollama and verify it's available
        if (this.fallbackProvider === 'ollama') {
          const ollamaProvider = this.getProvider('ollama') as any;
          if (ollamaProvider && typeof ollamaProvider.isHealthy === 'function') {
            const isHealthy = await ollamaProvider.isHealthy().catch(() => false);
            if (!isHealthy) {
              return {
                success: false,
                error: `❌ Primary provider failed and Ollama fallback is not available.\n\n` +
                       `Primary error: ${result.error || 'Unknown error'}\n\n` +
                       `Ollama is not running. To use Ollama fallback:\n` +
                       `1. Install Ollama: https://ollama.ai\n` +
                       `2. Start Ollama: ollama serve\n` +
                       `3. Pull a model: ollama pull deepseek-coder:6.7b\n\n` +
                       `Or configure a different provider in Settings.`
              };
            }
          }
        }
        
        const fallback = this.getProvider(this.fallbackProvider);
        return fallback.chat(messagesWithCreed, options);
      }

      return result;
    } catch (e: any) {
      if (this.fallbackProvider && this.fallbackProvider !== this.activeProvider) {
        console.log(`Primary provider error, trying fallback: ${this.fallbackProvider}`);
        
        // Check if fallback is Ollama and verify it's available
        if (this.fallbackProvider === 'ollama') {
          const ollamaProvider = this.getProvider('ollama') as any;
          if (ollamaProvider && typeof ollamaProvider.isHealthy === 'function') {
            const isHealthy = await ollamaProvider.isHealthy().catch(() => false);
            if (!isHealthy) {
              return {
                success: false,
                error: `❌ Primary provider failed and Ollama fallback is not available.\n\n` +
                       `Primary error: ${e.message}\n\n` +
                       `Ollama is not running. To use Ollama fallback:\n` +
                       `1. Install Ollama: https://ollama.ai\n` +
                       `2. Start Ollama: ollama serve\n` +
                       `3. Pull a model: ollama pull deepseek-coder:6.7b\n\n` +
                       `Or configure a different provider in Settings.`
              };
            }
          }
        }
        
        const fallback = this.getProvider(this.fallbackProvider);
        return fallback.chat(messagesWithCreed, options);
      }
      throw e;
    }
  }

  /**
   * Stream with the active provider (with fallback)
   */
  async stream(messages: ChatMessage[], onChunk: StreamCallback, options: ChatOptions = {}): Promise<void> {
    const provider = this.getActiveProvider();
    const model = (options.model || this.activeModel) as string | undefined;

    // ═══ DINO BUDDY CREED — Injected at the deepest level ═══
    const messagesWithCreed = injectCreed(messages);

    try {
      return await provider.stream(messagesWithCreed, onChunk, { ...options, model });
    } catch (e: any) {
      const isRateLimit = this.isRateLimitError(e);
      if (this.fallbackProvider && this.fallbackProvider !== this.activeProvider) {
        if (isRateLimit) {
          console.log(`[AI Router] ⚠️ Rate limit detected, switching to fallback: ${this.fallbackProvider}`);
        } else {
          console.log(`Primary provider error, trying fallback: ${this.fallbackProvider}`);
        }
        
        // Check if fallback is Ollama and verify it's available
        if (this.fallbackProvider === 'ollama') {
          const ollamaProvider = this.getProvider('ollama') as any;
          if (ollamaProvider && typeof ollamaProvider.isHealthy === 'function') {
            const isHealthy = await ollamaProvider.isHealthy().catch(() => false);
            if (!isHealthy) {
              throw new Error(
                `❌ Primary provider failed and Ollama fallback is not available.\n\n` +
                `Primary error: ${e.message}\n\n` +
                `Ollama is not running. To use Ollama fallback:\n` +
                `1. Install Ollama: https://ollama.ai\n` +
                `2. Start Ollama: ollama serve\n` +
                `3. Pull a model: ollama pull deepseek-coder:6.7b\n\n` +
                `Or configure a different provider in Settings.`
              );
            }
          }
        }
        
        const fallback = this.getProvider(this.fallbackProvider);
        return fallback.stream(messagesWithCreed, onChunk, options);
      }
      throw e;
    }
  }

  /**
   * Complete with the active provider
   */
  async complete(prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
    const provider = this.getActiveProvider();
    const model = (options.model || this.activeModel) as string | undefined;
    return provider.complete(prompt, { ...options, model });
  }

  /**
   * Test connection to a specific provider
   */
  async testProvider(providerName: string): Promise<{ success: boolean; error?: string; models?: number }> {
    const provider = this.getProvider(providerName);
    return provider.testConnection();
  }

  /**
   * Get models from a specific provider
   */
  async getModels(providerName: string): Promise<ModelInfo[]> {
    const provider = this.getProvider(providerName);
    return provider.getModels();
  }

  /**
   * Get models from a specific provider (alias for getModels)
   * Used by IPC handlers for model selection dropdowns
   */
  async getProviderModels(providerName: string): Promise<ModelInfo[]> {
    return this.getModels(providerName);
  }

  /**
   * Get models from the active provider
   */
  async getActiveModels(): Promise<ModelInfo[]> {
    const provider = this.getActiveProvider();
    return provider.getModels();
  }

  /**
   * Smart model selection based on task analysis
   */
  async selectBestModel(
    taskType: 'chat' | 'code' | 'analysis' | 'creative' | 'debug' | 'complex',
    complexity: 'simple' | 'medium' | 'complex' = 'medium',
    context?: {
      codeLines?: number;
      hasErrors?: boolean;
      isCreative?: boolean;
      needsReasoning?: boolean;
    }
  ): Promise<{ provider: string; model: string; reasoning: string }> {
    // Model capabilities and preferences
    const modelCapabilities = {
      // Ollama models (local, fast, good for code)
      'ollama': {
        'qwen3-coder:480b-cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex'],
          speed: 'medium',
          context: 128000,
          cost: 'low'
        },
        'qwen3-coder-next:cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex', 'agentic'],
          speed: 'fast',
          context: 256000,
          cost: 'low'
        },
        'deepseek-v3.1:671b-cloud': {
          strengths: ['analysis', 'creative', 'complex', 'chat'],
          speed: 'medium',
          contextWindow: 128000,
          cost: 'low'
        },
        'glm-4.6:cloud': {
          strengths: ['code', 'analysis', 'chat', 'creative', 'complex'],
          speed: 'fast',
          context: 128000,
          cost: 'low'
        },
        'qwen2.5-coder:32b': {
          strengths: ['code', 'debug', 'analysis'],
          speed: 'fast',
          context: 32000,
          cost: 'free'
        },
        'qwen2.5-coder:7b': {
          strengths: ['code', 'chat', 'simple'],
          speed: 'fast',
          context: 32000,
          cost: 'free'
        }
      },
      // Anthropic models (excellent reasoning, expensive)
      'anthropic': {
        'claude-opus-4-6': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 1000000,
          cost: 'premium'
        },
        'claude-opus-4-5-20251101': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 200000,
          cost: 'premium'
        },
        'claude-opus-4-20250514': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'premium'
        },
        'claude-sonnet-4-20250514': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'high'
        },
        'claude-3-5-sonnet-20241022': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'high'
        },
        'claude-3-haiku-20240307': {
          strengths: ['chat', 'simple', 'analysis'],
          speed: 'fast',
          context: 200000,
          cost: 'medium'
        }
      },
      // OpenAI models (balanced, reliable)
      'openai': {
        'gpt-5.2-2025-12-11': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
          speed: 'medium',
          context: 128000,
          cost: 'high'
        },
        'gpt-5.2': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
          speed: 'medium',
          context: 128000,
          cost: 'high'
        },
        'gpt-4o': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug'],
          speed: 'medium',
          context: 128000,
          cost: 'high'
        },
        'gpt-4o-mini': {
          strengths: ['chat', 'simple', 'analysis', 'code'],
          speed: 'fast',
          context: 128000,
          cost: 'low'
        }
      }
    };

    // Task-specific logic
    let preferredStrengths: string[] = [];
    let preferredSpeed = 'medium';
    let preferredCost = 'medium';

    switch (taskType) {
      case 'code':
        preferredStrengths = ['code', 'debug'];
        preferredSpeed = complexity === 'simple' ? 'fast' : 'medium';
        break;
      case 'analysis':
        preferredStrengths = ['analysis', 'complex'];
        preferredSpeed = 'medium';
        break;
      case 'creative':
        preferredStrengths = ['creative', 'analysis'];
        preferredSpeed = 'medium';
        break;
      case 'debug':
        preferredStrengths = ['debug', 'code', 'analysis'];
        preferredSpeed = 'medium';
        break;
      case 'complex':
        preferredStrengths = ['complex', 'analysis', 'creative'];
        preferredSpeed = 'medium';
        preferredCost = 'high';
        break;
      default: // chat
        preferredStrengths = ['chat', 'analysis'];
        preferredSpeed = 'fast';
    }

    // Adjust based on context
    if (context) {
      if (context.codeLines && context.codeLines > 1000) {
        preferredStrengths.unshift('complex');
        preferredCost = 'high';
      }
      if (context.hasErrors) {
        preferredStrengths.unshift('debug');
      }
      if (context.isCreative) {
        preferredStrengths.unshift('creative');
      }
      if (context.needsReasoning) {
        preferredStrengths.unshift('analysis');
        preferredCost = 'high';
      }
    }

    // Score models based on preferences
    let bestScore = -1;
    let bestProvider = '';
    let bestModel = '';
    let reasoning = '';

    for (const [providerName, models] of Object.entries(modelCapabilities)) {
      // Skip providers that aren't configured
      if (!this.providers.has(providerName)) continue;

      for (const [modelName, capabilities] of Object.entries(models as any)) {
        let score = 0;
        const cap = capabilities as any;

        // Strength match (primary factor)
        for (const strength of preferredStrengths) {
          if (cap.strengths.includes(strength)) {
            score += 10;
          }
        }

        // Speed preference
        if (cap.speed === preferredSpeed) score += 5;
        else if (preferredSpeed === 'fast' && cap.speed === 'medium') score += 2;

        // Cost consideration (prefer cheaper for simple tasks)
        if (complexity === 'simple' && cap.cost === 'low') score += 3;
        else if (complexity === 'complex' && cap.cost === 'high') score += 3;

        // Context window consideration
        if (context?.codeLines && context.codeLines > 5000 && cap.context > 100000) {
          score += 5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestProvider = providerName;
          bestModel = modelName;
          reasoning = `Selected ${modelName} for ${taskType} task (${cap.strengths.join(', ')})`;
        }
      }
    }

    // Fallback to current active if no good match
    if (!bestProvider) {
      bestProvider = this.activeProvider || 'anthropic';
      bestModel = this.activeModel || 'claude-sonnet-4-20250514';
      reasoning = 'Using default model (no optimal match found)';
    }

    return {
      provider: bestProvider,
      model: bestModel,
      reasoning
    };
  }

  /**
   * Enhanced chat with smart model selection
   */
  async smartChat(
    messages: ChatMessage[],
    options: ChatOptions & {
      taskType?: 'chat' | 'code' | 'analysis' | 'creative' | 'debug' | 'complex';
      complexity?: 'simple' | 'medium' | 'complex';
      context?: any;
      autoSelectModel?: boolean;
    } = {}
  ): Promise<ChatResult> {
    let selectedModel = options.model;
    let selectedProvider = this.activeProvider;
    let reasoning = '';

    if (options.autoSelectModel !== false) {
      const selection = await this.selectBestModel(
        options.taskType || 'chat',
        options.complexity || 'medium',
        options.context
      );
      selectedProvider = selection.provider;
      selectedModel = selection.model;
      reasoning = selection.reasoning;

      // Temporarily switch to selected provider
      const originalProvider = this.activeProvider;
      const originalModel = this.activeModel;

      this.setActiveProvider(selectedProvider, selectedModel);

      try {
        const result = await this.chat(messages, { ...options, model: selectedModel });
        return {
          ...result,
          modelSelection: {
            provider: selectedProvider,
            model: selectedModel,
            reasoning,
            autoSelected: true
          }
        };
      } finally {
        // Restore original provider
        this.setActiveProvider(originalProvider, originalModel);
      }
    }

    return this.chat(messages, options);
  }
}

// Export singleton instance
export default new AIProviderRouter();
