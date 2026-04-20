/**
 * OpenAI Provider - GPT models
 */

import { BaseProvider } from './base-provider';
import type {
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ModelInfo,
  StreamCallback,
  Tool,
  ChatWithToolsResult,
  ContentBlock,
  ToolUseBlock
} from '../../types/ai-providers';
import {
  toOpenAIChatTools,
  toOpenAIResponsesTools,
  toOpenAIChatMessages,
  fromOpenAIToolCalls,
  fromResponsesOutput
} from './tool-format';
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
      const providerMessage =
        e.response?.data?.error?.message ||
        e.response?.data?.message ||
        e.message ||
        'Unknown OpenAI error';
      console.error('OpenAI getModels error:', providerMessage);

      if (e.response?.status === 401 || e.response?.status === 403) {
        throw new Error(`OpenAI authentication failed: ${providerMessage}`);
      }

      throw new Error(`Failed to load OpenAI models: ${providerMessage}`);
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

    const model = (options.model || this.config.model || 'gpt-5.4') as string;

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
          timeout: 300000,
          signal: options.signal
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
          timeout: 300000,
          signal: options.signal
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

    const model = (options.model || this.config.model || 'gpt-5.4') as string;
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
          responseType: 'stream',
          signal: options.signal
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
          responseType: 'stream',
          signal: options.signal
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

        // If caller aborts, drop the connection promptly.
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            try { (response.data as Readable).destroy(); } catch { /* ignore */ }
            finishError('Request aborted');
          }, { once: true });
        }
      });
    } catch (e: any) {
      if (axios.isCancel?.(e) || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') {
        throw new Error('Request aborted');
      }
      throw new Error(e.response?.data?.error?.message || e.message);
    }
  }

  formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  /**
   * Native tool-calling for OpenAI.
   * - GPT-5.x routes through the Responses API (`tools` are flat function specs,
   *   tool calls appear as `function_call` items in `output[]`).
   * - GPT-4.x routes through Chat Completions (`tools` are `{type:'function', function:...}`,
   *   tool calls come back as `message.tool_calls`).
   *
   * Returns the canonical ChatWithToolsResult so the agent loop sees a single
   * shape regardless of which OpenAI surface served the request.
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: ChatOptions = {}
  ): Promise<ChatWithToolsResult> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const model = (options.model || this.config.model || 'gpt-5.4') as string;
    const isGPT5 = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');

    try {
      if (isGPT5) {
        const response = await axios.post(`${this.baseUrl}/responses`, {
          model,
          input: toOpenAIChatMessages(messages),
          tools: toOpenAIResponsesTools(tools),
          max_output_tokens: options.maxTokens || 4096,
          reasoning: { effort: (options as any).reasoningEffort || 'medium' }
        }, {
          headers: this.getHeaders(),
          timeout: 300000,
          signal: options.signal
        });

        const { text, toolCalls } = fromResponsesOutput(response.data?.output);
        const contentBlocks: ContentBlock[] = [];
        if (text) contentBlocks.push({ type: 'text', text });
        for (const tc of toolCalls) contentBlocks.push(tc);

        const stopReason: 'tool_use' | 'end_turn' | 'max_tokens' =
          toolCalls.length > 0 ? 'tool_use'
          : (response.data?.status === 'incomplete' ? 'max_tokens' : 'end_turn');

        return {
          success: true,
          content: text,
          stopReason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          contentBlocks,
          usage: {
            promptTokens: response.data?.usage?.input_tokens,
            completionTokens: response.data?.usage?.output_tokens
          }
        };
      }

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model,
        messages: toOpenAIChatMessages(messages),
        tools: toOpenAIChatTools(tools),
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7
      }, {
        headers: this.getHeaders(),
        timeout: 300000,
        signal: options.signal
      });

      const choice = response.data?.choices?.[0];
      const message = choice?.message || {};
      const text: string = message.content || '';
      const toolCalls: ToolUseBlock[] = fromOpenAIToolCalls(message.tool_calls);

      const contentBlocks: ContentBlock[] = [];
      if (text) contentBlocks.push({ type: 'text', text });
      for (const tc of toolCalls) contentBlocks.push(tc);

      const finishReason: string | undefined = choice?.finish_reason;
      const stopReason: 'tool_use' | 'end_turn' | 'max_tokens' =
        finishReason === 'tool_calls' || toolCalls.length > 0 ? 'tool_use'
        : (finishReason === 'length' ? 'max_tokens' : 'end_turn');

      return {
        success: true,
        content: text,
        stopReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        contentBlocks,
        usage: {
          promptTokens: response.data?.usage?.prompt_tokens,
          completionTokens: response.data?.usage?.completion_tokens
        }
      };
    } catch (e: any) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.error(`[OpenAI/Tools] API Error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}
