/**
 * OpenRouter Provider - Access to 100+ models through one API
 * https://openrouter.ai
 */

import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
import axios from 'axios';
import { Readable } from 'stream';

const OPENROUTER_FALLBACK_MODELS: Array<{ id: string; name: string }> = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
];

function buildFallbackModels(warning: string): ModelInfo[] {
  return OPENROUTER_FALLBACK_MODELS.map((model) => ({
    ...model,
    provider: 'openrouter',
    catalogSource: 'fallback',
    catalogWarning: warning,
  }));
}

export class OpenRouterProvider extends BaseProvider {
  private siteUrl: string;
  private siteName: string;

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.name = 'openrouter';
    this.displayName = 'OpenRouter (All Models)';
    this.baseUrl = config.baseUrl || (config as any).endpoint || 'https://openrouter.ai/api/v1';
    this.siteUrl = (config.siteUrl as string) || 'https://github.com/agentprime';
    this.siteName = (config.siteName as string) || 'AgentPrime';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      return response.data?.data?.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'openrouter',
        contextLength: m.context_length,
        pricing: m.pricing,
        description: m.description
      })).sort((a: ModelInfo, b: ModelInfo) => (a.name || '').localeCompare(b.name || '')) || [];
    } catch (e: any) {
      const providerMessage =
        e.response?.data?.error?.message ||
        e.response?.data?.message ||
        e.message ||
        'Unknown OpenRouter error';
      console.error('OpenRouter getModels error:', providerMessage);

      if (e.response?.status === 401 || e.response?.status === 403) {
        throw new Error(`OpenRouter authentication failed: ${providerMessage}`);
      }

      return buildFallbackModels(
        `OpenRouter live model lookup is unavailable right now. Showing the built-in model list instead. ${providerMessage}`
      );
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string; models?: number }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return { success: true, models: response.data?.data?.length || 0 };
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        return { success: false, error: 'Invalid API key' };
      }
      return { success: false, error: e.message };
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const model = (options.model || this.config.model || 'anthropic/claude-sonnet-4') as string;

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model,
        messages: this.formatMessages(messages),
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7
      }, {
        headers: this.getHeaders(),
        timeout: 300000
      });

      const content = response.data?.choices?.[0]?.message?.content || '';

      return {
        success: true,
        content,
        usage: {
          promptTokens: response.data?.usage?.prompt_tokens,
          completionTokens: response.data?.usage?.completion_tokens
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message
      };
    }
  }

  async stream(messages: ChatMessage[], onChunk: StreamCallback, options: ChatOptions = {}): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const model = (options.model || this.config.model || 'anthropic/claude-sonnet-4') as string;

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model,
        messages: this.formatMessages(messages),
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: true
      }, {
        headers: this.getHeaders(),
        timeout: 300000,
        responseType: 'stream'
      });

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content || '';
                if (content) {
                  onChunk({
                    content,
                    done: false
                  });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            } else if (line.includes('[DONE]')) {
              onChunk({ content: '', done: true });
            }
          }
        });

        (response.data as Readable).on('end', () => {
          resolve();
        });

        (response.data as Readable).on('error', reject);
      });
    } catch (e: any) {
      throw new Error(e.response?.data?.error?.message || e.message);
    }
  }

  formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }
}
