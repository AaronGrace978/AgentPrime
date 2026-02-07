/**
 * Base AI Provider - Abstract class for all AI providers
 */
import type { IBaseProvider, ProviderConfig, ChatMessage, ChatOptions, ChatResult, ProviderInfo, ModelInfo, StreamCallback } from '../../types/ai-providers';
export declare abstract class BaseProvider implements IBaseProvider {
    name: string;
    displayName: string;
    config: ProviderConfig;
    apiKey: string | null;
    baseUrl: string | null;
    constructor(config?: ProviderConfig);
    /**
     * Get available models for this provider
     */
    abstract getModels(): Promise<ModelInfo[]>;
    /**
     * Test connection to the provider
     */
    abstract testConnection(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Send a chat message and get a response
     */
    abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
    /**
     * Stream a chat response
     */
    abstract stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
    /**
     * Get a completion for code/text
     */
    complete(prompt: string, options?: ChatOptions): Promise<ChatResult>;
    /**
     * Format messages for the provider's expected format
     * Can be overridden by subclasses to return different types
     */
    formatMessages(messages: ChatMessage[]): ChatMessage[] | any;
    /**
     * Check if API key is configured
     */
    isConfigured(): boolean;
    /**
     * Get provider info
     */
    getInfo(): ProviderInfo;
}
//# sourceMappingURL=base-provider.d.ts.map