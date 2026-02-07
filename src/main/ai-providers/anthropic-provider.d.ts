/**
 * Anthropic Provider - Claude models
 */
import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
interface AnthropicFormattedMessages {
    systemMessage: string;
    userMessages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
}
export declare class AnthropicProvider extends BaseProvider {
    private apiVersion;
    constructor(config?: ProviderConfig);
    private getHeaders;
    getModels(): Promise<ModelInfo[]>;
    testConnection(): Promise<{
        success: boolean;
        error?: string;
    }>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
    stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
    formatMessages(messages: ChatMessage[]): AnthropicFormattedMessages;
}
export {};
//# sourceMappingURL=anthropic-provider.d.ts.map