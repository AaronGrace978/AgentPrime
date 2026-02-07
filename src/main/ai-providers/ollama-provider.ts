/**
 * Ollama Provider - Local and Cloud Ollama models
 * 
 * ENHANCED: Better timeout handling, health checks, and model detection
 * NEW: Anthropic API compatibility mode for tool calling (Ollama v0.14.0+)
 */

import { BaseProvider } from './base-provider';
import type { 
  ProviderConfig, ChatMessage, ChatOptions, ChatResult, ModelInfo, StreamCallback,
  Tool, ToolUseBlock, ContentBlock, ChatWithToolsResult
} from '../../types/ai-providers';
import axios from 'axios';
import { Readable } from 'stream';

// Cache for available models (refreshed every 30 seconds)
let modelCache: { models: string[]; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds

export class OllamaProvider extends BaseProvider {
  private healthCheckPromise: Promise<boolean> | null = null;
  private useAnthropicCompat: boolean;
  
  constructor(config: ProviderConfig = {}) {
    super(config);
    this.name = 'ollama';
    this.displayName = 'Ollama';
    
    // Detect cloud from model name or baseUrl
    const modelName = (config.model || '') as string;
    const isCloudModel = modelName.includes('-cloud') || modelName.includes(':cloud');
    const hasApiKey = !!config.apiKey;
    const isCloudUrl = config.baseUrl?.includes('ollama.com') || config.baseUrl?.includes('deepseek.com');
    
    // Helper to get cloud URL based on model
    // Official Ollama Cloud: https://ollama.com (API calls go to /api/*)
    const getCloudUrl = (model: string): string => {
      if (model.toLowerCase().includes('deepseek')) {
        return 'https://ollama.deepseek.com';
      }
      return 'https://ollama.com';
    };
    
    // Priority: explicit baseUrl > cloud URL detection > local default
    if (config.baseUrl) {
      // User provided explicit URL - respect it
      this.baseUrl = config.baseUrl;
    } else if (isCloudModel || (hasApiKey && !config.baseUrl?.includes('127.0.0.1'))) {
      // Cloud model detected or API key present - use cloud endpoint
      this.baseUrl = getCloudUrl(modelName);
    } else {
      // Default to local Ollama (use 127.0.0.1 to avoid IPv6 issues)
      this.baseUrl = 'http://127.0.0.1:11434';
    }
    
    this.apiKey = config.apiKey || null; // For Ollama Cloud
    // Anthropic API compatibility mode (requires Ollama v0.14.0+)
    this.useAnthropicCompat = config.useAnthropicCompat || false;
    
    console.log(`[OllamaProvider] Initialized: baseUrl=${this.baseUrl}, model=${modelName}, hasApiKey=${hasApiKey}`);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Quick health check - is Ollama running?
   */
  async isHealthy(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        timeout: 2000  // Fast timeout for health check
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get available models (with caching)
   */
  async getAvailableModels(): Promise<string[]> {
    // Check cache
    if (modelCache && Date.now() - modelCache.timestamp < CACHE_TTL) {
      return modelCache.models;
    }
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      const models = response.data?.models?.map((m: any) => m.name) || [];
      modelCache = { models, timestamp: Date.now() };
      return models;
    } catch {
      return modelCache?.models || [];
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.getAvailableModels();
    const baseName = modelName.split(':')[0];
    return models.some(m => m === modelName || m.startsWith(baseName + ':') || m === baseName);
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      const models = response.data?.models?.map((m: any) => ({
        id: m.name,
        name: m.name,
        provider: 'ollama',
        size: m.size,
        modified: m.modified_at
      })) || [];
      
      // Update cache
      modelCache = { 
        models: models.map((m: ModelInfo) => m.name), 
        timestamp: Date.now() 
      };
      
      return models;
    } catch (e: any) {
      console.error('Ollama getModels error:', e.message);
      return [];
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string; models?: number }> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        timeout: 3000  // Faster timeout
      });
      const modelCount = response.data?.models?.length || 0;
      
      // Update cache
      modelCache = {
        models: response.data?.models?.map((m: any) => m.name) || [],
        timestamp: Date.now()
      };
      
      return {
        success: true,
        models: modelCount
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.code === 'ECONNREFUSED' 
          ? 'Ollama not running. Start with: ollama serve' 
          : e.message
      };
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = (options.model || this.config?.model || 'llama3.2') as string;
    const baseUrl = this.baseUrl || 'http://127.0.0.1:11434';
    const isCloudModel = model.includes('cloud') || baseUrl.includes('api.ollama.com') || baseUrl.includes('ollama.com');
    const isLocal = baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost');
    
    // Adaptive timeout based on model size and token count
    const baseTimeout = 60000; // 60 seconds base
    const maxTokens = options.maxTokens || 4096;
    // Larger token counts need more time
    const tokenMultiplier = Math.max(1, maxTokens / 2048);
    // Cloud models need more time
    const cloudMultiplier = isCloudModel ? 4 : 1;
    // Large models need more time
    const isLargeModel = model.includes('70b') || model.includes('671b') || model.includes('405b');
    const sizeMultiplier = isLargeModel ? 3 : 1;
    
    const timeout = Math.round(baseTimeout * tokenMultiplier * cloudMultiplier * sizeMultiplier);
    
    console.log(`[Ollama] Chat with ${model} (${isCloudModel ? 'CLOUD' : 'local'}), timeout: ${Math.round(timeout/1000)}s, maxTokens: ${maxTokens}`);
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model,
        messages: this.formatMessages(messages),
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: maxTokens
        }
      }, {
        headers: this.getHeaders(),
        timeout: timeout
      });

      return {
        success: true,
        content: response.data?.message?.content || '',
        usage: {
          promptTokens: response.data?.prompt_eval_count,
          completionTokens: response.data?.eval_count
        }
      };
    } catch (e: any) {
      // Better error messages
      if (e.code === 'ECONNREFUSED') {
        if (isCloudModel) {
          return {
            success: false,
            error: '❌ Cannot connect to Ollama Cloud. Check your API key and internet connection.'
          };
        }
        return {
          success: false,
          error: '❌ Ollama not running! Start with: ollama serve'
        };
      }
      if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
        return {
          success: false,
          error: `⏱️ Request timed out after ${Math.round(timeout/1000)}s. Try a faster model.`
        };
      }
      if (e.response?.status === 404) {
        if (isCloudModel) {
          return {
            success: false,
            error: `❌ Cloud model '${model}' not found or unavailable.\n\nPossible issues:\n• Model name might be incorrect (check Ollama Cloud dashboard)\n• API key might be invalid or expired\n• Model might not be available in your region\n\nCheck your Ollama Cloud settings and API key in Settings.`
          };
        }
        if (isLocal) {
          return {
            success: false,
            error: `Model '${model}' not found. Pull it with: ollama pull ${model}`
          };
        }
        return {
          success: false,
          error: `Model '${model}' not found. Check your Ollama configuration.`
        };
      }
      if (e.response?.status === 401 || e.response?.status === 403) {
        return {
          success: false,
          error: '❌ Authentication failed for Ollama Cloud.\n\nYour API key might be invalid or expired. Check your API key in Settings.'
        };
      }
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message
      };
    }
  }

  async stream(messages: ChatMessage[], onChunk: StreamCallback, options: ChatOptions = {}): Promise<void> {
    const model = (options.model || this.config?.model || 'llama3.2') as string;
    const baseUrl = this.baseUrl || 'http://127.0.0.1:11434';
    const isCloudModel = model.includes('cloud') || baseUrl.includes('api.ollama.com') || baseUrl.includes('ollama.com');
    const isLocal = baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost');

    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model,
        messages: this.formatMessages(messages),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens || 4096
        }
      }, {
        headers: this.getHeaders(),
        timeout: 300000,
        responseType: 'stream'
      });

      let fullContent = '';

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk({
                  content: data.message.content,
                  done: data.done || false
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });

        (response.data as Readable).on('end', () => {
          resolve();
        });

        (response.data as Readable).on('error', reject);
      });
    } catch (e: any) {
      // Better error messages matching the chat() method
      if (e.code === 'ECONNREFUSED') {
        if (isCloudModel) {
          throw new Error('❌ Cannot connect to Ollama Cloud. Check your API key and internet connection.');
        }
        throw new Error('❌ Ollama not running! Start with: ollama serve');
      }
      if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
        throw new Error('⏱️ Request timed out. Try a faster model or reduce maxTokens.');
      }
      // Check for 404 in both response status and error message
      if (e.response?.status === 404 || e.message?.includes('404')) {
        if (isCloudModel) {
          throw new Error(
            `❌ Cloud model '${model}' not found or unavailable.\n\n` +
            `Possible issues:\n` +
            `• Model name might be incorrect (check Ollama Cloud dashboard)\n` +
            `• API key might be invalid or expired\n` +
            `• Model might not be available in your region\n\n` +
            `Check your Ollama Cloud settings and API key in Settings.`
          );
        }
        if (isLocal) {
          throw new Error(`Model '${model}' not found. Pull it with: ollama pull ${model}`);
        }
        throw new Error(`Model '${model}' not found. Check your Ollama configuration.`);
      }
      // Check for 401/403 (authentication errors for cloud)
      if (e.response?.status === 401 || e.response?.status === 403) {
        throw new Error(
          `❌ Authentication failed for Ollama Cloud.\n\n` +
          `Your API key might be invalid or expired. Check your API key in Settings.`
        );
      }
      // Extract better error message from response if available
      const errorMsg = e.response?.data?.error?.message || e.message;
      throw new Error(errorMsg);
    }
  }

  async complete(prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
    const model = (options.model || this.config.model || 'llama3.2') as string;
    const maxTokens = options.maxTokens || 100;
    
    // Adaptive timeout for completions (faster than chat)
    const timeout = Math.max(5000, maxTokens * 50); // ~50ms per token, min 5s

    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.1,
          num_predict: maxTokens,
          stop: options.stop || []
        }
      }, {
        headers: this.getHeaders(),
        timeout: timeout
      });

      return {
        success: true,
        content: response.data?.response || ''
      };
    } catch (e: any) {
      if (e.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '❌ Ollama not running!'
        };
      }
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Chat with streaming - better for long responses
   * Returns chunks as they arrive, avoiding timeout issues
   */
  async chatStream(
    messages: ChatMessage[], 
    onChunk: (chunk: string, done: boolean) => void,
    options: ChatOptions = {}
  ): Promise<ChatResult> {
    const model = (options.model || this.config.model || 'llama3.2') as string;
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model,
        messages: this.formatMessages(messages),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens || 4096
        }
      }, {
        headers: this.getHeaders(),
        timeout: 600000, // 10 minutes for streaming (generous)
        responseType: 'stream'
      });

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk(data.message.content, data.done || false);
              }
              if (data.prompt_eval_count) promptTokens = data.prompt_eval_count;
              if (data.eval_count) completionTokens = data.eval_count;
            } catch {
              // Skip invalid JSON
            }
          }
        });

        (response.data as Readable).on('end', () => {
          resolve({
            success: true,
            content: fullContent,
            usage: { promptTokens, completionTokens }
          });
        });

        (response.data as Readable).on('error', (err: Error) => {
          reject(new Error(`Stream error: ${err.message}`));
        });
      });
    } catch (e: any) {
      return {
        success: false,
        error: e.code === 'ECONNREFUSED' 
          ? '❌ Ollama not running!' 
          : e.message
      };
    }
  }

  formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content
    }));
  }

  isConfigured(): boolean {
    // Ollama works locally without API key
    return true;
  }

  // ============================================================
  // ANTHROPIC API COMPATIBILITY MODE (Ollama v0.14.0+)
  // Enables tool calling and unified API with Claude
  // ============================================================

  /**
   * Get headers for Anthropic-compatible API
   */
  private getAnthropicHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey || 'ollama', // Required but ignored for local
      'anthropic-version': '2023-06-01'
    };
  }

  /**
   * Check if Ollama supports Anthropic API compatibility (v0.14.0+)
   */
  async supportsAnthropicCompat(): Promise<boolean> {
    try {
      // Try a minimal request to the Anthropic-compatible endpoint
      const response = await axios.post(`${this.baseUrl}/v1/messages`, {
        model: 'llama3.2', // Use a common model
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }, {
        headers: this.getAnthropicHeaders(),
        timeout: 5000
      });
      return response.status === 200;
    } catch (e: any) {
      // 404 means the endpoint doesn't exist (older Ollama version)
      if (e.response?.status === 404) {
        return false;
      }
      // Other errors might still mean it's supported
      return e.response?.status !== 404;
    }
  }

  /**
   * Chat using Anthropic-compatible API (enables tool calling)
   * Requires Ollama v0.14.0 or later
   */
  async chatAnthropicCompat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = (options.model || this.config.model || 'qwen3-coder') as string;
    const maxTokens = options.maxTokens || 4096;

    // Format messages for Anthropic API
    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    console.log(`[Ollama/Anthropic] Chat with ${model}, maxTokens: ${maxTokens}`);

    try {
      const requestBody: any = {
        model,
        max_tokens: maxTokens,
        messages: userMessages,
        temperature: options.temperature ?? 0.7
      };

      // Add system message if present
      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await axios.post(`${this.baseUrl}/v1/messages`, requestBody, {
        headers: this.getAnthropicHeaders(),
        timeout: 300000
      });

      const content = response.data?.content?.[0]?.text || '';

      return {
        success: true,
        content,
        usage: {
          promptTokens: response.data?.usage?.input_tokens,
          completionTokens: response.data?.usage?.output_tokens
        }
      };
    } catch (e: any) {
      if (e.response?.status === 404) {
        return {
          success: false,
          error: '❌ Anthropic-compatible API not available. Requires Ollama v0.14.0+. Update with: ollama update'
        };
      }
      if (e.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '❌ Ollama not running! Start with: ollama serve'
        };
      }
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message
      };
    }
  }

  /**
   * Chat with tool calling support (Anthropic-compatible API)
   * This enables agentic features with local Ollama models!
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: ChatOptions = {}
  ): Promise<ChatWithToolsResult> {
    const model = (options.model || this.config.model || 'qwen3-coder') as string;
    const maxTokens = options.maxTokens || 4096;

    // Format messages for Anthropic API
    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    console.log(`[Ollama/Tools] Chat with ${model}, ${tools.length} tools available`);

    try {
      const requestBody: any = {
        model,
        max_tokens: maxTokens,
        messages: userMessages,
        tools,
        temperature: options.temperature ?? 0.7
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await axios.post(`${this.baseUrl}/v1/messages`, requestBody, {
        headers: this.getAnthropicHeaders(),
        timeout: 300000
      });

      const data = response.data;
      const contentBlocks: ContentBlock[] = data.content || [];
      const toolCalls: ToolUseBlock[] = contentBlocks.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );
      const textBlocks = contentBlocks.filter(
        (block): block is { type: 'text'; text: string } => block.type === 'text'
      );
      const textContent = textBlocks.map(b => b.text).join('\n');

      return {
        success: true,
        content: textContent,
        stopReason: data.stop_reason || 'end_turn',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        contentBlocks,
        usage: {
          promptTokens: data.usage?.input_tokens,
          completionTokens: data.usage?.output_tokens
        }
      };
    } catch (e: any) {
      if (e.response?.status === 404) {
        return {
          success: false,
          error: '❌ Tool calling requires Ollama v0.14.0+. Update with: ollama update'
        };
      }
      if (e.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '❌ Ollama not running! Start with: ollama serve'
        };
      }
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message
      };
    }
  }

  /**
   * Stream using Anthropic-compatible API
   */
  async streamAnthropicCompat(
    messages: ChatMessage[],
    onChunk: StreamCallback,
    options: ChatOptions = {}
  ): Promise<void> {
    const model = (options.model || this.config.model || 'qwen3-coder') as string;
    const maxTokens = options.maxTokens || 4096;

    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    try {
      const requestBody: any = {
        model,
        max_tokens: maxTokens,
        messages: userMessages,
        stream: true,
        temperature: options.temperature ?? 0.7
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      if (options.tools) {
        requestBody.tools = options.tools;
      }

      const response = await axios.post(`${this.baseUrl}/v1/messages`, requestBody, {
        headers: this.getAnthropicHeaders(),
        timeout: 600000,
        responseType: 'stream'
      });

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta') {
                  const text = data.delta?.text || '';
                  if (text) {
                    onChunk({ content: text, done: false });
                  }
                } else if (data.type === 'message_stop') {
                  onChunk({ content: '', done: true });
                }
              } catch {
                // Skip invalid JSON
              }
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

  /**
   * Format messages for Anthropic API style (separate system message)
   */
  private formatMessagesAnthropicStyle(messages: ChatMessage[]): {
    systemMessage: string;
    userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let systemMessage = '';
    const userMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage += (systemMessage ? '\n' : '') + msg.content;
      } else {
        const content = msg.content?.trim();
        if (!content) continue;
        userMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content
        });
      }
    }

    // Anthropic requires first message to be from user
    if (userMessages.length > 0 && userMessages[0].role !== 'user') {
      userMessages.unshift({ role: 'user', content: 'Continue.' });
    }

    // Merge consecutive messages of same role
    const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of userMessages) {
      if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
        merged[merged.length - 1].content += '\n\n' + msg.content;
      } else {
        merged.push({ ...msg });
      }
    }

    return { systemMessage, userMessages: merged };
  }

  /**
   * Create a tool result message to send back after tool execution
   * Note: Returns Anthropic-style tool result format (content is an array, not string)
   */
  createToolResultMessage(toolUseId: string, result: string): { role: 'user'; content: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> } {
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    };
  }

  /**
   * Helper: Run a full tool-calling loop
   * Continues until the model stops requesting tools or hits maxIterations
   */
  async runToolLoop(
    initialMessages: ChatMessage[],
    tools: Tool[],
    executeToolFn: (toolName: string, input: Record<string, any>) => Promise<string>,
    options: ChatOptions & { maxIterations?: number } = {}
  ): Promise<{ success: boolean; finalContent: string; iterations: number; error?: string }> {
    const maxIterations = options.maxIterations || 10;
    let messages = [...initialMessages];
    let iterations = 0;
    let finalContent = '';

    while (iterations < maxIterations) {
      iterations++;
      
      const result = await this.chatWithTools(messages, tools, options);
      
      if (!result.success) {
        return { success: false, finalContent: '', iterations, error: result.error };
      }

      // Collect any text content
      if (result.content) {
        finalContent += (finalContent ? '\n' : '') + result.content;
      }

      // Check if we're done (no tool calls)
      if (!result.toolCalls || result.toolCalls.length === 0 || result.stopReason !== 'tool_use') {
        return { success: true, finalContent, iterations };
      }

      // Execute tool calls and add results
      const assistantMessage: any = {
        role: 'assistant',
        content: result.contentBlocks
      };
      messages.push(assistantMessage);

      // Process each tool call
      const toolResults: any[] = [];
      for (const toolCall of result.toolCalls) {
        console.log(`[Ollama/Tools] Executing: ${toolCall.name}`, toolCall.input);
        try {
          const toolResult = await executeToolFn(toolCall.name, toolCall.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: toolResult
          });
        } catch (e: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: `Error: ${e.message}`,
            is_error: true
          });
        }
      }

      messages.push({ role: 'user', content: toolResults } as any);
    }

    return { 
      success: true, 
      finalContent, 
      iterations,
      error: `Reached max iterations (${maxIterations})`
    };
  }
}
