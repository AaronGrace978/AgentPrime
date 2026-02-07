/**
 * OpenAI Provider - GPT models
 */
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
export declare class OpenAIProvider extends BaseProvider {
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
    formatMessages(messages: ChatMessage[]): ChatMessage[];
}
//# sourceMappingURL=openai-provider.d.ts.map