/**
 * Base AI Provider - Abstract class for all AI providers
 */

import type {
  IBaseProvider,
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ProviderInfo,
  ModelInfo,
  StreamChunk,
  StreamCallback
} from '../../types/ai-providers';

export abstract class BaseProvider implements IBaseProvider {
  public name: string = 'base';
  public displayName: string = 'Base Provider';
  public config: ProviderConfig;
  public apiKey: string | null;
  public baseUrl: string | null;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
    this.apiKey = config.apiKey || null;
    this.baseUrl = config.baseUrl || null;
  }

  /**
   * Get available models for this provider
   */
  abstract getModels(): Promise<ModelInfo[]>;

  /**
   * Test connection to the provider
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

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
  async complete(prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
    // Default implementation uses chat
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    return this.chat(messages, options);
  }

  /**
   * Format messages for the provider's expected format
   * Can be overridden by subclasses to return different types
   */
  formatMessages(messages: ChatMessage[]): ChatMessage[] | any {
    return messages;
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.name,
      displayName: this.displayName,
      configured: this.isConfigured(),
      baseUrl: this.baseUrl
    };
  }
}
