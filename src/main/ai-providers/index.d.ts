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
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
import type { DualModelConfig } from '../../types';
/**
 * Model selection mode for dual-model routing
 */
type ModelMode = 'fast' | 'deep' | 'auto';
/**
 * Complexity analysis result
 */
interface ComplexityAnalysis {
    score: number;
    reasoning: string;
    suggestedMode: ModelMode;
    triggers: string[];
}
declare class AIProviderRouter {
    private providers;
    private activeProvider;
    private activeModel;
    private fallbackProvider;
    private dualModelEnabled;
    private dualModelConfig;
    constructor();
    /**
     * Configure the dual model system
     */
    configureDualModel(config: DualModelConfig): void;
    /**
     * Disable dual model system
     */
    disableDualModel(): void;
    /**
     * Check if dual model is enabled
     */
    isDualModelEnabled(): boolean;
    /**
     * Get current dual model configuration
     */
    getDualModelConfig(): DualModelConfig | null;
    /**
     * Analyze message complexity for routing
     */
    analyzeComplexity(message: string, context?: any): ComplexityAnalysis;
    /**
     * Route to appropriate model based on dual-model config
     */
    routeDualModel(message: string, mode?: ModelMode, context?: any): {
        provider: string;
        model: string;
        mode: ModelMode;
        analysis?: ComplexityAnalysis;
    };
    /**
     * Chat with dual-model routing
     */
    dualChat(messages: ChatMessage[], options?: ChatOptions & {
        dualMode?: ModelMode;
        context?: any;
    }): Promise<ChatResult & {
        dualModelInfo?: {
            mode: ModelMode;
            analysis?: ComplexityAnalysis;
        };
    }>;
    /**
     * Stream with dual-model routing
     */
    dualStream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions & {
        dualMode?: ModelMode;
        context?: any;
        onRouting?: (info: {
            mode: ModelMode;
            provider: string;
            model: string;
            analysis?: ComplexityAnalysis;
        }) => void;
    }): Promise<void>;
    /**
     * Register a provider class
     */
    registerProvider(name: string, ProviderClass: new (config: ProviderConfig) => BaseProvider): void;
    /**
     * Configure a provider with API key and settings
     */
    configureProvider(name: string, config: ProviderConfig): BaseProvider;
    /**
     * Get a provider instance
     */
    getProvider(name: string): BaseProvider;
    /**
     * Set the active provider and model
     */
    setActiveProvider(providerName: string | null, model?: string | null): void;
    /**
     * Set fallback provider (null to disable fallback)
     */
    setFallbackProvider(providerName: string | null): void;
    /**
     * Get the currently active provider
     */
    getActiveProvider(): BaseProvider;
    /**
     * Get all provider info
     */
    getProvidersInfo(): Array<{
        id: string;
    } & ReturnType<BaseProvider['getInfo']>>;
    /**
     * Chat with the active provider (with fallback)
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
    /**
     * Stream with the active provider (with fallback)
     */
    stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
    /**
     * Complete with the active provider
     */
    complete(prompt: string, options?: ChatOptions): Promise<ChatResult>;
    /**
     * Test connection to a specific provider
     */
    testProvider(providerName: string): Promise<{
        success: boolean;
        error?: string;
        models?: number;
    }>;
    /**
     * Get models from a specific provider
     */
    getModels(providerName: string): Promise<ModelInfo[]>;
    /**
     * Get models from a specific provider (alias for getModels)
     * Used by IPC handlers for model selection dropdowns
     */
    getProviderModels(providerName: string): Promise<ModelInfo[]>;
    /**
     * Get models from the active provider
     */
    getActiveModels(): Promise<ModelInfo[]>;
    /**
     * Smart model selection based on task analysis
     */
    selectBestModel(taskType: 'chat' | 'code' | 'analysis' | 'creative' | 'debug' | 'complex', complexity?: 'simple' | 'medium' | 'complex', context?: {
        codeLines?: number;
        hasErrors?: boolean;
        isCreative?: boolean;
        needsReasoning?: boolean;
    }): Promise<{
        provider: string;
        model: string;
        reasoning: string;
    }>;
    /**
     * Enhanced chat with smart model selection
     */
    smartChat(messages: ChatMessage[], options?: ChatOptions & {
        taskType?: 'chat' | 'code' | 'analysis' | 'creative' | 'debug' | 'complex';
        complexity?: 'simple' | 'medium' | 'complex';
        context?: any;
        autoSelectModel?: boolean;
    }): Promise<ChatResult>;
}
declare const _default: AIProviderRouter;
export default _default;
//# sourceMappingURL=index.d.ts.map