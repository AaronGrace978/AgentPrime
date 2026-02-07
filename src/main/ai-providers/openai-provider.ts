/**
 * OpenAI Provider - GPT models
 */

import { BaseProvider } from './base-provider';
import type { ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback } from '../../types/ai-providers';
import axios from 'axios';
import { Readable } from 'stream';

export class OpenAIProvider extends BaseProvider {
  constructor(config: ProviderConfig = {}) {
    super(config);
    this.name = 'openai';
    this.displayName = 'OpenAI (GPT)';
    const rawBaseUrl = config.baseUrl || (config as any).endpoint || 'https://api.openai.com/v1';
    this.baseUrl = this.normalizeBaseUrl(rawBaseUrl);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  /**
   * Normalize OpenAI base URL.
   * - Accepts either `https://api.openai.com` or `https://api.openai.com/v1`
   * - Ensures `/v1` is present because we append endpoints like `/models`, `/responses`, etc.
   */
  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) return 'https://api.openai.com/v1';

    // If caller provided a full OpenAI-compatible root without /v1, add it.
    // Keep non-OpenAI URLs intact unless they clearly end with /v1 already.
    if (/\/v1$/i.test(trimmed)) return trimmed;
    return `${trimmed}/v1`;
  }

  /**
   * Convert chat history to Responses API `input` format.
   * https://platform.openai.com/docs/api-reference/responses
   */
  private toResponsesInput(messages: ChatMessage[]): Array<{
    type: 'message';
    role: 'user' | 'assistant' | 'system';
    content: Array<{ type: 'input_text'; text: string }>;
  }> {
    return messages
      .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
      .map(m => ({
        type: 'message' as const,
        role: m.role,
        content: [{ type: 'input_text' as const, text: m.content }]
      }));
  }

  private extractOutputText(responseData: any): string {
    // Convenience field present on many responses
    if (typeof responseData?.output_text === 'string') return responseData.output_text;

    const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];
    let text = '';
    for (const item of outputItems) {
      // Typical: { type: "message", content: [{ type: "output_text", text: "..." }, ...] }
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          text += part.text;
        }
      }
    }
    return text;
  }

  async getModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return [];

    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      // Filter to relevant chat models
      const chatModels = response.data?.data?.filter((m: any) => 
        m.id.includes('gpt') && !m.id.includes('instruct')
      ) || [];

      return chatModels.map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: 'openai',
        owned_by: m.owned_by
      })).sort((a: ModelInfo, b: ModelInfo) => b.id.localeCompare(a.id));
    } catch (e: any) {
      console.error('OpenAI getModels error:', e.message);
      // Return default models
      return [
        { id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2 (Latest - Ultra Advanced)', provider: 'openai' },
        { id: 'gpt-5.2', name: 'GPT-5.2 (Flagship)', provider: 'openai' },
        { id: 'gpt-4o', name: 'GPT-4o (Recommended)', provider: 'openai' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)', provider: 'openai' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' }
      ];
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
      if (e.response?.status === 401) {
        return { success: false, error: 'Invalid API key' };
      }
      return { success: false, error: e.message };
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const model = (options.model || this.config.model || 'gpt-4o') as string;

    // Check if this is GPT-5.x which uses the new /responses API
    const isGPT5 = model.startsWith('gpt-5');

    try {
      let response;

      if (isGPT5) {
        // GPT-5.x uses the new /responses API
        // Note: GPT-5.x is a reasoning model and does NOT support temperature parameter
        response = await axios.post(`${this.baseUrl}/responses`, {
          model,
          input: this.toResponsesInput(messages),
          max_output_tokens: options.maxTokens || 4096,
          reasoning: { effort: options.reasoningEffort || 'medium' }
          // temperature is NOT supported for reasoning models like GPT-5.x
        }, {
          headers: this.getHeaders(),
          timeout: 300000
        });

        const content = this.extractOutputText(response.data);

        return {
          success: true,
          content,
          usage: {
            promptTokens: response.data?.usage?.input_tokens,
            completionTokens: response.data?.usage?.output_tokens
          }
        };
      } else {
        // GPT-4.x and older use /chat/completions API
        response = await axios.post(`${this.baseUrl}/chat/completions`, {
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
      }
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

    const model = (options.model || this.config.model || 'gpt-4o') as string;
    const isGPT5 = model.startsWith('gpt-5');

    try {
      let response;

      if (isGPT5) {
        // GPT-5.x uses responses API
        // Note: GPT-5.x is a reasoning model and does NOT support temperature parameter
        response = await axios.post(`${this.baseUrl}/responses`, {
          model,
          input: this.toResponsesInput(messages),
          max_output_tokens: options.maxTokens || 4096,
          reasoning: { effort: options.reasoningEffort || 'medium' },
          // temperature is NOT supported for reasoning models like GPT-5.x
          stream: true
        }, {
          headers: this.getHeaders(),
          timeout: 300000,
          responseType: 'stream'
        });
      } else {
        // GPT-4.x and older use chat completions API
        response = await axios.post(`${this.baseUrl}/chat/completions`, {
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
      }

      return new Promise((resolve, reject) => {
        let buffer = '';
        let settled = false;

        const finishSuccess = () => {
          if (settled) return;
          settled = true;
          onChunk({ content: '', done: true });
          resolve();
        };

        const finishError = (error: string) => {
          if (settled) return;
          settled = true;
          onChunk({ content: '', done: true, error });
          reject(new Error(error));
        };

        const handleDataLine = (dataLine: string) => {
          const trimmed = dataLine.trim();
          if (!trimmed) return;

          // Some providers use a sentinel
          if (trimmed === '[DONE]') {
            finishSuccess();
            return;
          }

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            return;
          }

          if (!isGPT5) {
            // GPT-4 chat completions format
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) onChunk({ content, done: false });
            return;
          }

          // GPT-5 Responses streaming format
          // https://platform.openai.com/docs/api-reference/responses-streaming
          if (data.type === 'response.output_text.delta') {
            const delta = data.delta || '';
            if (delta) onChunk({ content: delta, done: false });
            return;
          }

          if (data.type === 'response.completed') {
            finishSuccess();
            return;
          }

          if (data.type === 'error') {
            const message = data.error?.message || 'OpenAI streaming error';
            finishError(message);
            return;
          }
        };

        (response.data as Readable).on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          // SSE events are separated by a blank line
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const eventBlock of parts) {
            const lines = eventBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('data:')) {
                handleDataLine(line.slice(5));
              } else if (line.startsWith('data: ')) {
                handleDataLine(line.slice(6));
              }
            }
          }
        });

        (response.data as Readable).on('end', () => {
          if (!settled) {
            // If the server closed without an explicit completion event, still end cleanly.
            finishSuccess();
          }
        });

        (response.data as Readable).on('error', (err: any) => {
          if (!settled) {
            finishError(err?.message || 'Stream error');
            return;
          }
          reject(err);
        });
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
