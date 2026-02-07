/**
 * Ollama Provider - Local and Cloud Ollama models
 */
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
export declare class OllamaProvider extends BaseProvider {
    constructor(config?: ProviderConfig);
    private getHeaders;
    getModels(): Promise<ModelInfo[]>;
    testConnection(): Promise<{
        success: boolean;
        error?: string;
        models?: number;
    }>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
    stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
    complete(prompt: string, options?: ChatOptions): Promise<ChatResult>;
    formatMessages(messages: ChatMessage[]): ChatMessage[];
    isConfigured(): boolean;
}
//# sourceMappingURL=ollama-provider.d.ts.map