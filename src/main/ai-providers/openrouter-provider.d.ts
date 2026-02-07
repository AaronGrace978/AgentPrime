/**
 * OpenRouter Provider - Access to 100+ models through one API
 * https://openrouter.ai
 */
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
export declare class OpenRouterProvider extends BaseProvider {
    private siteUrl;
    private siteName;
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
//# sourceMappingURL=openrouter-provider.d.ts.map