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
import type {
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ModelInfo,
  StreamCallback,
  Tool,
  ToolUseBlock,
  ChatWithToolsResult,
  ToolStreamCallback,
} from '../../types/ai-providers';
import type { DualModelConfig } from '../../types';
import { injectCreed } from '../core/dino-buddy-creed';
import { recordAIRuntimeExecution } from '../core/ai-runtime-state';
import { isAbortError } from '../core/timeout-utils';
import {
  DEFAULT_RUNTIME_BUDGET_MODE,
  dualModeToRuntimeBudget,
  runtimeBudgetToDualMode,
} from '../../types/runtime-budget';

interface ProviderEntry {
  Class: new (config: ProviderConfig) => BaseProvider;
  instance: BaseProvider | null;
  config: ProviderConfig;
}

/**
 * Model selection mode for dual-model routing
 */
type ModelMode = 'fast' | 'deep' | 'auto';
type RuntimeBudgetMode = 'instant' | 'standard' | 'deep';

/**
 * Complexity analysis result
 */
interface ComplexityAnalysis {
  score: number; // 1-10 scale
  reasoning: string;
  suggestedMode: ModelMode;
  triggers: string[]; // Matched trigger keywords
}

interface LegacyRouterSettings {
  activeProvider?: string;
  fallbackProvider?: string;
  activeModel?: string;
  providers?: Record<string, ProviderConfig & { model?: string }>;
}

interface ProviderCapabilityProfile {
  nativeToolCalling: boolean;
  streaming: boolean;
  /**
   * True when the provider implements native streaming WITH tool calls
   * (live text deltas + incremental tool argument assembly). Providers
   * without it can still serve `streamWithTools` via a non-streaming shim
   * at the router/provider layer.
   */
  streamingTools?: boolean;
  contextWindowHint?: number;
  notes?: string;
}

class AIProviderRouter {
  private providers: Map<string, ProviderEntry>;
  private activeProvider: string | null;
  private activeModel: string | null;
  private fallbackProvider: string | null;

  // Dual Model System
  private dualModelEnabled: boolean = false;
  private dualModelConfig: DualModelConfig | null = null;
  private providerCapabilities: Record<string, ProviderCapabilityProfile> = {
    ollama: {
      nativeToolCalling: true,
      streaming: true,
      streamingTools: false,
      contextWindowHint: 128000,
      notes:
        'Native tool-calling via Ollama /api/chat tools parameter. streamWithTools uses a non-streaming shim (Ollama tool-stream support is build-dependent).',
    },
    anthropic: {
      nativeToolCalling: true,
      streaming: true,
      streamingTools: true,
      contextWindowHint: 200000,
      notes: 'Native tool-calling + native tool-streaming via Anthropic SSE (input_json_delta).',
    },
    openai: {
      nativeToolCalling: true,
      streaming: true,
      streamingTools: true,
      contextWindowHint: 128000,
      notes:
        'Native tool-calling + native tool-streaming via Chat Completions deltas and Responses function_call_arguments.delta.',
    },
    openrouter: {
      nativeToolCalling: true,
      streaming: true,
      streamingTools: true,
      contextWindowHint: 128000,
      notes:
        'Native tool-calling + native tool-streaming via OpenAI-compatible deltas forwarded to underlying model.',
    },
  };

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
      threshold: config.complexityThreshold,
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
      return {
        score: 5,
        reasoning: 'Dual model not configured',
        suggestedMode: 'auto',
        triggers: [],
      };
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
      analyze: 1.5,
      debug: 1.5,
      refactor: 2,
      architect: 2,
      'design pattern': 2,
      optimize: 1.5,
      complex: 1.5,
      explain: 1,
      why: 0.5,
      'how does': 0.5,
      implement: 1,
      'create a complete': 1.5,
      'full application': 2,
      security: 1.5,
      performance: 1.5,
      algorithm: 1.5,
      'data structure': 1.5,
      concurrency: 2,
      async: 1,
      'error handling': 1,
      'edge case': 1.5,
      test: 1,
      review: 1.5,

      // Low complexity indicators (-)
      quick: -1,
      simple: -1.5,
      basic: -1,
      just: -0.5,
      small: -1,
      'fix typo': -2,
      rename: -1.5,
      format: -1.5,
      'what is': -0.5,
      hello: -2,
      hi: -2,
      thanks: -2,
      yes: -2,
      no: -2,
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
      triggers,
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
        model: this.activeModel || 'claude-sonnet-4-6',
        mode: 'auto',
      };
    }

    // Manual mode selection
    if (mode === 'fast' && config.fastModel.enabled) {
      return {
        provider: config.fastModel.provider,
        model: config.fastModel.model,
        mode: 'fast',
      };
    }

    if (mode === 'deep' && config.deepModel.enabled) {
      return {
        provider: config.deepModel.provider,
        model: config.deepModel.model,
        mode: 'deep',
      };
    }

    // Auto-routing
    if (mode === 'auto' && config.autoRoute) {
      const analysis = this.analyzeComplexity(message, context);

      if (analysis.suggestedMode === 'deep' && config.deepModel.enabled) {
        console.log(
          `[DualModel] Auto-routed to DEEP model (score: ${analysis.score}): ${analysis.reasoning}`
        );
        return {
          provider: config.deepModel.provider,
          model: config.deepModel.model,
          mode: 'deep',
          analysis,
        };
      } else if (config.fastModel.enabled) {
        console.log(
          `[DualModel] Auto-routed to FAST model (score: ${analysis.score}): ${analysis.reasoning}`
        );
        return {
          provider: config.fastModel.provider,
          model: config.fastModel.model,
          mode: 'fast',
          analysis,
        };
      }
    }

    // Default to fast model if available, otherwise deep
    if (config.fastModel.enabled) {
      return {
        provider: config.fastModel.provider,
        model: config.fastModel.model,
        mode: 'fast',
      };
    }

    return {
      provider: config.deepModel.provider,
      model: config.deepModel.model,
      mode: 'deep',
    };
  }

  routeRuntimeBudget(
    message: string,
    runtimeBudget: RuntimeBudgetMode = DEFAULT_RUNTIME_BUDGET_MODE,
    context?: any
  ): {
    provider: string;
    model: string;
    mode: ModelMode;
    runtimeBudget: RuntimeBudgetMode;
    analysis?: ComplexityAnalysis;
  } {
    const routing = this.routeDualModel(message, runtimeBudgetToDualMode(runtimeBudget), context);
    return {
      ...routing,
      runtimeBudget,
    };
  }

  /**
   * Chat with dual-model routing
   */
  async dualChat(
    messages: ChatMessage[],
    options: ChatOptions & {
      dualMode?: ModelMode;
      runtimeBudget?: RuntimeBudgetMode;
      context?: any;
    } = {}
  ): Promise<ChatResult & { dualModelInfo?: { mode: ModelMode; analysis?: ComplexityAnalysis } }> {
    if (!this.isDualModelEnabled()) {
      return this.chat(messages, options);
    }

    // Get the last user message for analysis
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const messageContent = lastUserMessage?.content || '';

    const runtimeBudget =
      options.runtimeBudget || dualModeToRuntimeBudget(options.dualMode || 'auto');
    const routing = this.routeRuntimeBudget(messageContent, runtimeBudget, options.context);

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
          runtimeBudget: routing.runtimeBudget,
          analysis: routing.analysis,
        },
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
      runtimeBudget?: RuntimeBudgetMode;
      context?: any;
      onRouting?: (info: {
        mode: ModelMode;
        provider: string;
        model: string;
        analysis?: ComplexityAnalysis;
      }) => void;
    } = {}
  ): Promise<void> {
    if (!this.isDualModelEnabled()) {
      return this.stream(messages, onChunk, options);
    }

    // Get the last user message for analysis
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const messageContent = lastUserMessage?.content || '';

    const runtimeBudget =
      options.runtimeBudget || dualModeToRuntimeBudget(options.dualMode || 'auto');
    const routing = this.routeRuntimeBudget(messageContent, runtimeBudget, options.context);

    // Notify about routing decision
    if (options.onRouting) {
      options.onRouting({
        mode: routing.mode,
        provider: routing.provider,
        model: routing.model,
        analysis: routing.analysis,
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
  registerProvider(
    name: string,
    ProviderClass: new (config: ProviderConfig) => BaseProvider
  ): void {
    this.providers.set(name, {
      Class: ProviderClass,
      instance: null,
      config: {},
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
    const inferredProvider = this.inferProviderForModel(model, providerName);
    this.activeProvider = inferredProvider;
    this.activeModel = model;
  }

  /**
   * Infer the most likely provider for a model identifier.
   * This prevents stale UI settings from claiming "openai" while the model is clearly an Ollama cloud model.
   */
  inferProviderForModel(
    model: string | null | undefined,
    preferredProvider: string | null = null
  ): string | null {
    if (!model) {
      return preferredProvider;
    }

    const normalized = model.trim().toLowerCase();
    if (!normalized) {
      return preferredProvider;
    }

    if (
      normalized.startsWith('openai/') ||
      normalized.startsWith('gpt-') ||
      normalized.startsWith('o1') ||
      normalized.startsWith('o3')
    ) {
      return 'openai';
    }

    if (normalized.startsWith('anthropic/') || normalized.startsWith('claude-')) {
      return 'anthropic';
    }

    if (normalized.startsWith('openrouter/')) {
      return 'openrouter';
    }

    if (
      normalized.startsWith('ollama/') ||
      normalized.includes(':cloud') ||
      normalized.includes('-cloud') ||
      normalized.startsWith('qwen') ||
      normalized.startsWith('deepseek') ||
      normalized.startsWith('minimax') ||
      normalized.startsWith('glm-') ||
      normalized.startsWith('devstral') ||
      normalized.startsWith('ministral') ||
      normalized.startsWith('nemotron') ||
      normalized.startsWith('kimi-') ||
      normalized.startsWith('gemma4') ||
      normalized.startsWith('gemini-3') ||
      normalized.startsWith('qwen2.5-coder')
    ) {
      return 'ollama';
    }

    return preferredProvider;
  }

  /**
   * Set fallback provider (null to disable fallback)
   */
  setFallbackProvider(providerName: string | null): void {
    this.fallbackProvider = providerName;
  }

  /**
   * Backward-compatible settings setter used by legacy tests/callers.
   */
  setSettings(settings: LegacyRouterSettings): void {
    if (!settings) return;

    if (settings.providers) {
      for (const [providerName, providerConfig] of Object.entries(settings.providers)) {
        this.configureProvider(providerName, providerConfig);
      }
    }

    if (settings.activeProvider || settings.activeModel) {
      const activeProvider = settings.activeProvider ?? this.activeProvider;
      const activeModel =
        settings.activeModel ??
        settings.providers?.[activeProvider || '']?.model ??
        this.activeModel;
      this.setActiveProvider(activeProvider || null, activeModel || null);
    }

    if (settings.fallbackProvider !== undefined) {
      this.setFallbackProvider(settings.fallbackProvider || null);
    }
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
        ...instance.getInfo(),
      });
    }
    return info;
  }

  /**
   * Capability matrix for provider-specific features.
   */
  getProviderCapabilities(
    providerName?: string
  ): ProviderCapabilityProfile | Record<string, ProviderCapabilityProfile> {
    if (!providerName) {
      return { ...this.providerCapabilities };
    }
    return (
      this.providerCapabilities[providerName] || {
        nativeToolCalling: false,
        streaming: true,
        notes: 'Unknown provider; assuming generic fallback support.',
      }
    );
  }

  private extractToolCallsFromText(content: string, tools: Tool[]): ToolUseBlock[] {
    const toolNames = new Set((tools || []).map((tool) => tool.name));
    if (!content || toolNames.size === 0) {
      return [];
    }

    const results: ToolUseBlock[] = [];
    const maybeCandidates: string[] = [];
    const trimmed = content.trim();

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      maybeCandidates.push(trimmed);
    }

    const fencedJsonMatches = content.match(/```json[\s\S]*?```/gi) || [];
    for (const fenced of fencedJsonMatches) {
      maybeCandidates.push(
        fenced
          .replace(/```json/i, '')
          .replace(/```$/, '')
          .trim()
      );
    }

    const tryCollect = (parsed: any) => {
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const name = item?.name || item?.function?.name;
        const args = item?.arguments || item?.function?.arguments || item?.input;
        if (!name || !toolNames.has(name)) continue;
        const input =
          typeof args === 'string'
            ? (() => {
                try {
                  return JSON.parse(args);
                } catch {
                  return {};
                }
              })()
            : args || {};

        results.push({
          type: 'tool_use',
          id: item?.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          input,
        });
      }
    };

    for (const candidate of maybeCandidates) {
      try {
        const parsed = JSON.parse(candidate);
        tryCollect(parsed);
      } catch {
        // ignore malformed candidates
      }
    }

    return results;
  }

  /**
   * Provider-agnostic tool-calling adapter.
   * Uses native provider tool-calling when available, then falls back to
   * structured JSON-in-text parsing for providers without native support.
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: ChatOptions = {}
  ): Promise<ChatWithToolsResult & { adapter: 'native' | 'fallback'; provider: string }> {
    const providerName = this.activeProvider || 'ollama';
    const provider = this.getActiveProvider() as any;
    const model = (options.model || this.activeModel) as string | undefined;
    const profile = this.getProviderCapabilities(providerName) as ProviderCapabilityProfile;

    if (profile.nativeToolCalling && typeof provider.chatWithTools === 'function') {
      const nativeResult: ChatWithToolsResult = await provider.chatWithTools(messages, tools, {
        ...options,
        model,
      });
      return {
        ...nativeResult,
        adapter: 'native',
        provider: providerName,
      };
    }

    const fallbackResult = await this.chat(messages, {
      ...options,
      model,
      tools,
    });
    const content = fallbackResult.content || '';
    const toolCalls = this.extractToolCallsFromText(content, tools);

    return {
      ...fallbackResult,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      toolCalls,
      contentBlocks: content ? [{ type: 'text', text: content }] : [],
      adapter: 'fallback',
      provider: providerName,
    };
  }

  /**
   * Provider-agnostic streaming tool-calling adapter.
   *
   * Resolves the active provider, dispatches to its native `streamWithTools`
   * when available (Anthropic / OpenAI / OpenRouter), and falls back to a
   * non-streaming shim that replays `chatWithTools` as canonical
   * `ToolStreamChunk` events for providers that don't implement it.
   *
   * Either way the caller sees:
   *   - live `text` chunks (when supported)
   *   - one `tool_use` chunk per assembled tool call
   *   - terminal `done` (or `error`) with the full ChatWithToolsResult
   *
   * The promise resolves with the same `ChatWithToolsResult` shape
   * `chatWithTools` returns, decorated with the chosen adapter so callers
   * can log/observe whether the stream was native or shimmed.
   */
  async streamWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    onChunk: ToolStreamCallback,
    options: ChatOptions = {}
  ): Promise<ChatWithToolsResult & { adapter: 'native' | 'shim' | 'fallback'; provider: string }> {
    const providerName = this.activeProvider || 'ollama';
    const provider = this.getActiveProvider() as any;
    const model = (options.model || this.activeModel) as string | undefined;
    const profile = this.getProviderCapabilities(providerName) as ProviderCapabilityProfile;

    if (typeof provider?.streamWithTools === 'function') {
      const result: ChatWithToolsResult = await provider.streamWithTools(messages, tools, onChunk, {
        ...options,
        model,
      });
      return {
        ...result,
        adapter: profile.streamingTools ? 'native' : 'shim',
        provider: providerName,
      };
    }

    // No streamWithTools on the provider at all — synthesize one from
    // `chatWithTools` so every router caller can rely on the surface.
    const result = await this.chatWithTools(messages, tools, options);
    if (!result.success) {
      try {
        onChunk({ type: 'error', error: result.error || 'chatWithTools failed', result });
      } catch {
        /* ignore */
      }
      return { ...result, adapter: 'fallback', provider: providerName };
    }
    if (result.content) {
      try {
        onChunk({ type: 'text', text: result.content });
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(result.toolCalls)) {
      for (const tc of result.toolCalls) {
        try {
          onChunk({ type: 'tool_use', toolCall: tc });
        } catch {
          /* ignore */
        }
      }
    }
    try {
      onChunk({ type: 'done', result });
    } catch {
      /* ignore */
    }
    return { ...result, adapter: 'fallback', provider: providerName };
  }

  /**
   * Provider-agnostic tool loop adapter.
   */
  async runToolLoop(
    messages: ChatMessage[],
    tools: Tool[],
    executeTool: (toolName: string, args: Record<string, any>) => Promise<any>,
    options: ChatOptions = {},
    maxRounds = 8
  ): Promise<
    ChatResult & { toolCallsExecuted: number; adapter: 'native' | 'fallback'; provider: string }
  > {
    let workingMessages = [...messages];
    let totalToolCalls = 0;
    let lastAdapter: 'native' | 'fallback' = 'fallback';
    let lastProvider = this.activeProvider || 'ollama';

    for (let round = 0; round < maxRounds; round++) {
      const result = await this.chatWithTools(workingMessages, tools, options);
      lastAdapter = result.adapter;
      lastProvider = result.provider;

      if (!result.success) {
        return {
          ...result,
          toolCallsExecuted: totalToolCalls,
          adapter: lastAdapter,
          provider: lastProvider,
        };
      }

      const toolCalls = result.toolCalls || [];
      if (toolCalls.length === 0) {
        return {
          ...result,
          toolCallsExecuted: totalToolCalls,
          adapter: lastAdapter,
          provider: lastProvider,
        };
      }

      totalToolCalls += toolCalls.length;
      const toolResults: string[] = [];

      for (const call of toolCalls) {
        try {
          const output = await executeTool(call.name, call.input || {});
          toolResults.push(`Tool ${call.name} succeeded:\n${JSON.stringify(output)}`);
        } catch (error: any) {
          toolResults.push(`Tool ${call.name} failed:\n${error?.message || String(error)}`);
        }
      }

      if (result.content) {
        workingMessages.push({ role: 'assistant', content: result.content });
      }
      workingMessages.push({
        role: 'user',
        content: `Tool results:\n${toolResults.join('\n\n')}`,
      });
    }

    return {
      success: false,
      error: `Tool loop exceeded max rounds (${maxRounds})`,
      toolCallsExecuted: totalToolCalls,
      adapter: lastAdapter,
      provider: lastProvider,
    };
  }

  /**
   * Check if an error is a rate limit error (429)
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || error.error || String(error)).toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate_limit') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      error.status === 429 ||
      error.response?.status === 429
    );
  }

  private isTransientProviderError(error: any): boolean {
    if (!error) return false;

    const msg = (error.message || error.error || String(error)).toLowerCase();
    const status = error.status || error.response?.status;

    if (typeof status === 'number' && (status === 408 || status >= 500)) {
      return true;
    }

    return (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('econnreset') ||
      msg.includes('eai_again') ||
      msg.includes('enotfound') ||
      msg.includes('enetunreach') ||
      msg.includes('ehostunreach') ||
      msg.includes('network unreachable') ||
      msg.includes('connection reset') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('service unavailable') ||
      msg.includes('bad gateway') ||
      msg.includes('gateway timeout')
    );
  }

  private shouldFallbackFromResult(result: ChatResult): boolean {
    return (
      !result.success && (this.isRateLimitError(result) || this.isTransientProviderError(result))
    );
  }

  private shouldFallbackFromError(error: any): boolean {
    // Never fall back on a user-initiated abort. Stop means stop —
    // not "try every other model in the chain".
    if (isAbortError(error)) return false;
    return this.isRateLimitError(error) || this.isTransientProviderError(error);
  }

  /**
   * Check whether a model id is likely compatible with a provider.
   * Uses lightweight heuristics to avoid sending provider-specific models
   * (e.g. claude-* to Ollama fallback).
   */
  private isModelCompatibleWithProvider(providerName: string, model: string): boolean {
    const normalizedProvider = providerName.toLowerCase();
    const normalizedModel = model.toLowerCase().trim();

    if (!normalizedModel) return false;

    switch (normalizedProvider) {
      case 'anthropic':
        return normalizedModel.startsWith('claude-');
      case 'openai':
        return (
          normalizedModel.startsWith('gpt-') ||
          normalizedModel.startsWith('o1') ||
          normalizedModel.startsWith('o3') ||
          normalizedModel.startsWith('o4') ||
          normalizedModel.startsWith('text-')
        );
      case 'openrouter':
        return normalizedModel.includes('/');
      case 'ollama':
        // Ollama model ids are typically local names (llama3.2, qwen2.5-coder:7b, *:cloud),
        // and should not look like hosted-provider ids.
        return (
          !normalizedModel.startsWith('claude-') &&
          !normalizedModel.startsWith('gpt-') &&
          !normalizedModel.startsWith('openai/') &&
          !normalizedModel.startsWith('anthropic/') &&
          !normalizedModel.includes('/')
        );
      default:
        return true;
    }
  }

  /**
   * Build safe chat options for fallback calls.
   * Keeps model override only if it is compatible with fallback provider.
   */
  private buildFallbackOptions(fallbackProviderName: string, options: ChatOptions): ChatOptions {
    const requestedModel = (options.model || this.activeModel || undefined) as string | undefined;

    if (
      requestedModel &&
      this.isModelCompatibleWithProvider(fallbackProviderName, requestedModel)
    ) {
      return options;
    }

    const fallbackConfigModel = this.providers.get(fallbackProviderName)?.config?.model as
      | string
      | undefined;
    if (
      fallbackConfigModel &&
      this.isModelCompatibleWithProvider(fallbackProviderName, fallbackConfigModel)
    ) {
      if (requestedModel && requestedModel !== fallbackConfigModel) {
        console.log(
          `[AI Router] Fallback provider ${fallbackProviderName} replacing incompatible model ` +
            `'${requestedModel}' with '${fallbackConfigModel}'`
        );
      }
      return { ...options, model: fallbackConfigModel };
    }

    if (requestedModel) {
      console.log(
        `[AI Router] Fallback provider ${fallbackProviderName} ignoring incompatible model '${requestedModel}'`
      );
    }

    const { model: _ignoredModel, ...safeOptions } = options;
    return safeOptions;
  }

  private annotateChatResult(
    result: ChatResult,
    actualProvider: string,
    requestedProvider: string,
    requestedModel?: string,
    viaFallback: boolean = false
  ): ChatResult {
    const actualModel = result.servedBy?.model || result.modelSelection?.model || requestedModel;

    recordAIRuntimeExecution({
      requestedProvider,
      requestedModel,
      effectiveProvider: requestedProvider,
      effectiveModel: requestedModel || actualModel,
      executionProvider: actualProvider,
      executionModel: actualModel,
      viaFallback,
    });

    return {
      ...result,
      servedBy: {
        provider: actualProvider,
        model: actualModel,
        requestedProvider,
        requestedModel,
        viaFallback,
      },
    };
  }

  private publishRuntimeInfo(
    actualProvider: string,
    requestedProvider: string,
    requestedModel?: string,
    viaFallback: boolean = false,
    options: ChatOptions = {}
  ): void {
    const actualModel =
      requestedModel ||
      (this.providers.get(actualProvider)?.config?.model as string | undefined) ||
      this.activeModel ||
      undefined;
    const runtime = recordAIRuntimeExecution({
      requestedProvider,
      requestedModel,
      effectiveProvider: requestedProvider,
      effectiveModel: requestedModel || actualModel,
      executionProvider: actualProvider,
      executionModel: actualModel,
      viaFallback,
    });
    const onRuntimeInfo = (options as any)?.onRuntimeInfo;
    if (typeof onRuntimeInfo === 'function') {
      onRuntimeInfo(runtime);
    }
  }

  /**
   * Chat with the active provider (with fallback)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const provider = this.getActiveProvider();
    const model = (options.model || this.activeModel) as string | undefined;
    const requestedProvider = this.activeProvider || provider.name || 'ollama';
    const routerFallbackEnabled = !options.disableRouterFallback;

    // Creed injection must be explicit to prevent Dino persona bleeding into
    // coding and validation workflows.
    const messagesWithCreed = options.includeCreed === true ? injectCreed(messages) : messages;

    try {
      const result = this.annotateChatResult(
        await provider.chat(messagesWithCreed, { ...options, model }),
        requestedProvider,
        requestedProvider,
        model,
        false
      );

      const shouldFallback = this.shouldFallbackFromResult(result);

      if (
        routerFallbackEnabled &&
        shouldFallback &&
        this.fallbackProvider &&
        this.fallbackProvider !== this.activeProvider
      ) {
        if (this.isRateLimitError(result)) {
          console.log(
            `[AI Router] ⚠️ Rate limit detected, switching to fallback: ${this.fallbackProvider}`
          );
        } else {
          console.log(
            `[AI Router] Primary provider hit a transient error, trying fallback: ${this.fallbackProvider}`
          );
        }

        // Check if fallback is Ollama and verify it's available
        if (this.fallbackProvider === 'ollama') {
          const ollamaProvider = this.getProvider('ollama') as any;
          if (ollamaProvider && typeof ollamaProvider.isHealthy === 'function') {
            const isHealthy = await ollamaProvider.isHealthy().catch(() => false);
            if (!isHealthy) {
              return {
                success: false,
                error:
                  `❌ Primary provider failed and Ollama fallback is not available.\n\n` +
                  `Primary error: ${result.error || 'Unknown error'}\n\n` +
                  `Ollama is not running. To use Ollama fallback:\n` +
                  `1. Install Ollama: https://ollama.ai\n` +
                  `2. Start Ollama: ollama serve\n` +
                  `3. Pull a model: ollama pull deepseek-coder:6.7b\n\n` +
                  `Or configure a different provider in Settings.`,
              };
            }
          }
        }

        const fallback = this.getProvider(this.fallbackProvider);
        const fallbackOptions = this.buildFallbackOptions(this.fallbackProvider, options);
        return this.annotateChatResult(
          await fallback.chat(messagesWithCreed, fallbackOptions),
          this.fallbackProvider,
          requestedProvider,
          (fallbackOptions.model || model) as string | undefined,
          true
        );
      }

      return result;
    } catch (e: any) {
      const shouldFallback = this.shouldFallbackFromError(e);
      if (
        routerFallbackEnabled &&
        shouldFallback &&
        this.fallbackProvider &&
        this.fallbackProvider !== this.activeProvider
      ) {
        if (this.isRateLimitError(e)) {
          console.log(
            `[AI Router] ⚠️ Rate limit detected, switching to fallback: ${this.fallbackProvider}`
          );
        } else {
          console.log(
            `[AI Router] Primary provider hit a transient error, trying fallback: ${this.fallbackProvider}`
          );
        }

        // Check if fallback is Ollama and verify it's available
        if (this.fallbackProvider === 'ollama') {
          const ollamaProvider = this.getProvider('ollama') as any;
          if (ollamaProvider && typeof ollamaProvider.isHealthy === 'function') {
            const isHealthy = await ollamaProvider.isHealthy().catch(() => false);
            if (!isHealthy) {
              return {
                success: false,
                error:
                  `❌ Primary provider failed and Ollama fallback is not available.\n\n` +
                  `Primary error: ${e.message}\n\n` +
                  `Ollama is not running. To use Ollama fallback:\n` +
                  `1. Install Ollama: https://ollama.ai\n` +
                  `2. Start Ollama: ollama serve\n` +
                  `3. Pull a model: ollama pull deepseek-coder:6.7b\n\n` +
                  `Or configure a different provider in Settings.`,
              };
            }
          }
        }

        const fallback = this.getProvider(this.fallbackProvider);
        const fallbackOptions = this.buildFallbackOptions(this.fallbackProvider, options);
        return this.annotateChatResult(
          await fallback.chat(messagesWithCreed, fallbackOptions),
          this.fallbackProvider,
          requestedProvider,
          (fallbackOptions.model || model) as string | undefined,
          true
        );
      }
      throw e;
    }
  }

  /**
   * Stream with the active provider (with fallback)
   */
  async stream(
    messages: ChatMessage[],
    onChunk: StreamCallback,
    options: ChatOptions = {}
  ): Promise<void> {
    const provider = this.getActiveProvider();
    const model = (options.model || this.activeModel) as string | undefined;
    const requestedProvider = this.activeProvider || provider.name || 'ollama';

    // Creed injection must be explicit to prevent Dino persona bleeding into
    // coding and validation workflows.
    const messagesWithCreed = options.includeCreed === true ? injectCreed(messages) : messages;

    try {
      this.publishRuntimeInfo(requestedProvider, requestedProvider, model, false, options);
      return await provider.stream(messagesWithCreed, onChunk, { ...options, model });
    } catch (e: any) {
      const isRateLimit = this.isRateLimitError(e);
      const shouldFallback = this.shouldFallbackFromError(e);
      if (
        shouldFallback &&
        this.fallbackProvider &&
        this.fallbackProvider !== this.activeProvider
      ) {
        if (isRateLimit) {
          console.log(
            `[AI Router] ⚠️ Rate limit detected, switching to fallback: ${this.fallbackProvider}`
          );
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
        const fallbackOptions = this.buildFallbackOptions(this.fallbackProvider, options);
        this.publishRuntimeInfo(
          this.fallbackProvider,
          requestedProvider,
          (fallbackOptions.model || model) as string | undefined,
          true,
          options
        );
        return fallback.stream(messagesWithCreed, onChunk, fallbackOptions);
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
    const requestedProvider = this.activeProvider || provider.name || 'ollama';
    return this.annotateChatResult(
      await provider.complete(prompt, { ...options, model }),
      requestedProvider,
      requestedProvider,
      model,
      false
    );
  }

  /**
   * Test connection to a specific provider
   */
  async testProvider(
    providerName: string
  ): Promise<{ success: boolean; error?: string; models?: number }> {
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
      ollama: {
        'qwen3-coder:480b-cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex'],
          speed: 'medium',
          context: 128000,
          cost: 'low',
        },
        'qwen3-coder-next:cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex', 'agentic'],
          speed: 'fast',
          context: 256000,
          cost: 'low',
        },
        'kimi-k2.6:cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex', 'agentic'],
          speed: 'fast',
          context: 256000,
          cost: 'low',
        },
        'deepseek-v4-flash:cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex', 'agentic', 'long_context'],
          speed: 'fast',
          context: 1000000,
          cost: 'low',
        },
        'glm-5.1:cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex', 'agentic'],
          speed: 'fast',
          context: 198000,
          cost: 'low',
        },
        'gemma4:31b-cloud': {
          strengths: ['code', 'analysis', 'debug', 'complex'],
          speed: 'medium',
          context: 256000,
          cost: 'low',
        },
        'deepseek-v3.1:671b-cloud': {
          strengths: ['analysis', 'creative', 'complex', 'chat'],
          speed: 'medium',
          context: 128000,
          cost: 'low',
        },
        'glm-4.6:cloud': {
          strengths: ['code', 'analysis', 'chat', 'creative', 'complex'],
          speed: 'fast',
          context: 128000,
          cost: 'low',
        },
        'qwen2.5-coder:32b': {
          strengths: ['code', 'debug', 'analysis'],
          speed: 'fast',
          context: 32000,
          cost: 'free',
        },
        'qwen2.5-coder:7b': {
          strengths: ['code', 'chat', 'simple'],
          speed: 'fast',
          context: 32000,
          cost: 'free',
        },
      },
      // Anthropic models (excellent reasoning, expensive)
      anthropic: {
        'claude-opus-4-7': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 1000000,
          cost: 'premium',
        },
        'claude-opus-4-6': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 1000000,
          cost: 'premium',
        },
        'claude-sonnet-4-6': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 1000000,
          cost: 'high',
        },
        'claude-opus-4-5-20251101': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code', 'agentic'],
          speed: 'medium',
          context: 200000,
          cost: 'premium',
        },
        'claude-opus-4-20250514': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'premium',
        },
        'claude-sonnet-4-20250514': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'high',
        },
        'claude-3-5-sonnet-20241022': {
          strengths: ['analysis', 'creative', 'complex', 'debug', 'code'],
          speed: 'medium',
          context: 200000,
          cost: 'high',
        },
        'claude-3-haiku-20240307': {
          strengths: ['chat', 'simple', 'analysis'],
          speed: 'fast',
          context: 200000,
          cost: 'medium',
        },
      },
      // OpenAI models (balanced, reliable)
      openai: {
        'gpt-5.5': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning', 'agentic'],
          speed: 'medium',
          context: 1000000,
          cost: 'premium',
        },
        'gpt-5.5-mini': {
          strengths: ['code', 'debug', 'analysis', 'chat', 'complex'],
          speed: 'fast',
          context: 1000000,
          cost: 'medium',
        },
        'gpt-5.5-nano': {
          strengths: ['chat', 'simple', 'code', 'analysis'],
          speed: 'fast',
          context: 1000000,
          cost: 'low',
        },
        'gpt-5.4': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
          speed: 'medium',
          context: 270000,
          cost: 'high',
        },
        'gpt-5.4-mini': {
          strengths: ['code', 'debug', 'analysis', 'chat'],
          speed: 'fast',
          context: 270000,
          cost: 'medium',
        },
        'gpt-5.4-nano': {
          strengths: ['chat', 'simple', 'code'],
          speed: 'fast',
          context: 270000,
          cost: 'low',
        },
        'gpt-5.2-2025-12-11': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
          speed: 'medium',
          context: 128000,
          cost: 'high',
        },
        'gpt-5.2': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug', 'reasoning'],
          speed: 'medium',
          context: 128000,
          cost: 'high',
        },
        'gpt-4o': {
          strengths: ['analysis', 'creative', 'complex', 'code', 'debug'],
          speed: 'medium',
          context: 128000,
          cost: 'high',
        },
        'gpt-4o-mini': {
          strengths: ['chat', 'simple', 'analysis', 'code'],
          speed: 'fast',
          context: 128000,
          cost: 'low',
        },
      },
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
      bestModel = this.activeModel || 'claude-sonnet-4-6';
      reasoning = 'Using default model (no optimal match found)';
    }

    return {
      provider: bestProvider,
      model: bestModel,
      reasoning,
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
            autoSelected: true,
          },
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
