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
import dns from 'dns';
import { lookup } from 'dns/promises';
import { getRecommendedMaxTokens, isOllamaCloudModel } from '../core/model-output-limits';

// Cache for available models (refreshed every 30 seconds)
let modelCache: { models: string[]; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds
const LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_CLOUD_URL = 'https://ollama.com';
const OLLAMA_DEEPSEEK_CLOUD_URL = 'https://ollama.deepseek.com';

function getCloudUrlForModel(model: string): string {
  return model.toLowerCase().includes('deepseek') ? OLLAMA_DEEPSEEK_CLOUD_URL : OLLAMA_CLOUD_URL;
}

function isLocalOllamaUrl(url?: string | null): boolean {
  const normalized = (url || '').toLowerCase();
  return normalized.includes('127.0.0.1') || normalized.includes('localhost');
}

function isCloudOllamaUrl(url?: string | null): boolean {
  const normalized = (url || '').toLowerCase();
  return normalized.includes('ollama.com') || normalized.includes('deepseek.com');
}

function normalizeOllamaBaseUrl(url: string | null | undefined, model: string): string | undefined {
  if (!url) {
    return undefined;
  }

  const normalized = url.trim().replace(/\/+$/, '');
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes('api.ollama.com')) {
    return getCloudUrlForModel(model);
  }

  return normalized;
}

export class OllamaProvider extends BaseProvider {
  private healthCheckPromise: Promise<boolean> | null = null;
  private useAnthropicCompat: boolean;
  private alternateApiKey: string | null = null; // Desktop/secondary API key for key rotation
  private keySwapAttempted: boolean = false; // Prevent infinite retry loops
  
  /**
   * Get axios config with proper timeout and headers
   * For cloud endpoints, we rely on Node.js DNS resolution (which prefers IPv4)
   */
  private getAxiosConfig(timeout: number): any {
    return {
      timeout,
      headers: this.getHeaders(),
      // Force IPv4 family for DNS resolution to avoid IPv6 issues
      // This is especially important when DNS servers return IPv6 first
      family: 4
    };
  }
  
  constructor(config: ProviderConfig = {}) {
    super(config);
    this.name = 'ollama';
    this.displayName = 'Ollama';
    
    // Detect cloud from model name or baseUrl
    const modelName = this.normalizeModelIdentifier((config.model || '') as string);
    const isCloudModel = isOllamaCloudModel(modelName);
    const hasApiKey = !!config.apiKey;
    const normalizedBaseUrl = normalizeOllamaBaseUrl(config.baseUrl, modelName);
    
    // Priority: cloud model override > explicit cloud baseUrl > local default
    // CRITICAL: Cloud models MUST use the cloud endpoint, even if baseUrl points to local Ollama.
    // This prevents sending cloud model names to a local Ollama instance (which returns 404).
    const isLocalUrl = isLocalOllamaUrl(normalizedBaseUrl);
    
    if (isCloudModel && (!normalizedBaseUrl || isLocalUrl)) {
      // Cloud model detected — force cloud endpoint (ignore local baseUrl from settings)
      this.baseUrl = getCloudUrlForModel(modelName);
      if (isLocalUrl) {
        console.log(`[OllamaProvider] ⚠️ Cloud model '${modelName}' detected but baseUrl was local (${config.baseUrl}) — overriding to ${this.baseUrl}`);
      }
    } else if (normalizedBaseUrl) {
      // User provided explicit cloud URL - respect it
      this.baseUrl = normalizedBaseUrl;
    } else if (hasApiKey) {
      // API key present with no explicit URL — assume cloud
      this.baseUrl = getCloudUrlForModel(modelName);
    } else {
      // Default to local Ollama (use 127.0.0.1 to avoid IPv6 issues)
      this.baseUrl = LOCAL_OLLAMA_URL;
    }
    
    this.apiKey = config.apiKey || null; // For Ollama Cloud
    // Store alternate key (desktop key) for automatic key rotation on failure
    this.alternateApiKey = (config as any).alternateApiKey || process.env.OLLAMA_API_KEY_DESKTOP || null;
    // Anthropic API compatibility mode (requires Ollama v0.14.0+)
    this.useAnthropicCompat = config.useAnthropicCompat || false;
    
    const hasAltKey = !!this.alternateApiKey && this.alternateApiKey !== this.apiKey;
    console.log(`[OllamaProvider] Initialized: baseUrl=${this.baseUrl}, model=${modelName}, hasApiKey=${hasApiKey}, hasAlternateKey=${hasAltKey}`);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Try swapping to the alternate API key (desktop/secondary)
   * Returns true if swap happened, false if no alternate available
   */
  private trySwapApiKey(): boolean {
    if (this.keySwapAttempted) {
      return false; // Already tried the alternate key this cycle
    }
    if (this.alternateApiKey && this.alternateApiKey !== this.apiKey) {
      const oldKey = this.apiKey;
      this.apiKey = this.alternateApiKey;
      this.alternateApiKey = oldKey; // Keep the old key as alternate for next swap
      this.keySwapAttempted = true; // Mark as attempted
      console.log(`[OllamaProvider] 🔄 Swapped to alternate API key`);
      // Reset the flag after 60s so future requests can try again
      setTimeout(() => { this.keySwapAttempted = false; }, 60000);
      return true;
    }
    return false;
  }


  /**
   * Resolve model name for API calls.
   * When using direct API access to ollama.com (not local Ollama), cloud models
   * should NOT include the :cloud or -cloud suffix.
   * See: https://docs.ollama.com/cloud
   * 
   * Examples:
   * - Local CLI: 'qwen3-coder-next:cloud' → stays 'qwen3-coder-next:cloud'
   * - Direct API: 'qwen3-coder-next:cloud' → 'qwen3-coder-next'
   */
  private normalizeModelIdentifier(model: string): string {
    return model.trim().replace(/^ollama\//i, '');
  }

  private resolveModelName(model: string, isDirectApi: boolean): string {
    const normalizedModel = this.normalizeModelIdentifier(model);
    if (!isDirectApi) {
      return normalizedModel; // Local Ollama keeps the suffix
    }
    // Direct API to ollama.com - strip cloud suffix
    if (normalizedModel.endsWith(':cloud')) {
      return normalizedModel.slice(0, -6);
    }
    if (normalizedModel.endsWith('-cloud')) {
      return normalizedModel.slice(0, -6);
    }
    return normalizedModel;
  }

  private getDefaultMaxTokens(model: string): number {
    return getRecommendedMaxTokens(model, 'provider_default');
  }

  private getRequestTimeoutMs(model: string, maxTokens: number, streaming: boolean, isCloudModel: boolean): number {
    const tokenMultiplier = Math.max(1, maxTokens / 2048);
    const cloudMultiplier = isCloudModel ? 4 : 1;
    const isLargeModel =
      model.includes('70b') ||
      model.includes('123b') ||
      model.includes('180b') ||
      model.includes('405b') ||
      model.includes('671b');
    const sizeMultiplier = isLargeModel ? 3 : 1;
    const baseTimeout = streaming ? 90000 : 60000;
    const computed = Math.round(baseTimeout * tokenMultiplier * cloudMultiplier * sizeMultiplier);

    if (streaming) {
      return Math.min(computed, isCloudModel ? 1200000 : 600000);
    }

    return Math.min(computed, isCloudModel ? 900000 : 300000);
  }

  private resolveRequestContext(model: string, maxTokens: number, streaming: boolean): {
    baseUrl: string;
    isCloudModel: boolean;
    isLocal: boolean;
    isDirectApi: boolean;
    apiModel: string;
    requestUrl: string;
    timeout: number;
  } {
    const normalizedModel = this.normalizeModelIdentifier(model);
    const isCloudModelByName = isOllamaCloudModel(normalizedModel);
    let baseUrl = normalizeOllamaBaseUrl(this.baseUrl, normalizedModel) || LOCAL_OLLAMA_URL;
    if (isCloudModelByName && isLocalOllamaUrl(baseUrl)) {
      baseUrl = getCloudUrlForModel(normalizedModel);
      console.log(`[Ollama] Runtime URL override: cloud model '${normalizedModel}' → ${baseUrl}`);
    }

    const isCloudModel = isCloudModelByName || isCloudOllamaUrl(baseUrl);
    const isLocal = isLocalOllamaUrl(baseUrl);
    const isDirectApi = isCloudOllamaUrl(baseUrl);
    const apiModel = this.resolveModelName(normalizedModel, isDirectApi);
    const requestUrl = `${baseUrl}/api/chat`;
    const timeout = this.getRequestTimeoutMs(normalizedModel, maxTokens, streaming, isCloudModel);

    return {
      baseUrl,
      isCloudModel,
      isLocal,
      isDirectApi,
      apiModel,
      requestUrl,
      timeout,
    };
  }

  private annotateServedBy(result: ChatResult, model: string): ChatResult {
    return {
      ...result,
      servedBy: {
        provider: 'ollama',
        model,
        requestedProvider: 'ollama',
        requestedModel: model,
        viaFallback: false,
      },
    };
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
    const maxTokens = options.maxTokens || this.getDefaultMaxTokens(model);
    const { baseUrl, isCloudModel, isLocal, apiModel, requestUrl, timeout } = this.resolveRequestContext(
      model,
      maxTokens,
      false
    );
    console.log(`[Ollama] Chat with ${apiModel} (${isCloudModel ? 'CLOUD' : 'local'}${apiModel !== model ? `, resolved from ${model}` : ''})`);
    console.log(`[Ollama] Request URL: ${requestUrl}, timeout: ${Math.round(timeout/1000)}s, maxTokens: ${maxTokens}`);
    console.log(`[Ollama] API Key present: ${!!this.apiKey}, baseUrl: ${baseUrl}`);
    
    try {
      const response = await axios.post(requestUrl, {
        model: apiModel,
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

      return this.annotateServedBy({
        success: true,
        content: response.data?.message?.content || '',
        usage: {
          promptTokens: response.data?.prompt_eval_count,
          completionTokens: response.data?.eval_count
        }
      }, apiModel);
    } catch (e: any) {
      // Log detailed error info for debugging
      console.error(`[Ollama] Request failed:`, {
        url: requestUrl,
        model: apiModel,
        errorCode: e.code,
        status: e.response?.status,
        statusText: e.response?.statusText,
        message: e.message,
        isNetworkError: !e.response // Network errors don't have response
      });
      
      // Better error messages
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
        if (isCloudModel) {
          return {
            success: false,
            error: `❌ Cannot connect to Ollama Cloud (${e.code}).\n\n` +
              `Possible issues:\n` +
              `• Internet connection problem\n` +
              `• DNS resolution failed\n` +
              `• Firewall/proxy blocking connection\n` +
              `• Check your network settings`
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
          error: `⏱️ Request timed out after ${Math.round(timeout/1000)}s.\n\n` +
            `Possible issues:\n` +
            `• Slow internet connection\n` +
            `• Model is overloaded\n` +
            `• Try a faster/smaller model`
        };
      }
      if (e.code === 'ENETUNREACH' || e.code === 'EHOSTUNREACH') {
        return {
          success: false,
          error: `❌ Network unreachable (${e.code}).\n\n` +
            `Check your internet connection and try again.`
        };
      }
      if (e.response?.status === 404) {
        if (isCloudModel) {
          return {
            success: false,
            error: `❌ Cloud model '${this.normalizeModelIdentifier(model)}' not found or unavailable.\n\nPossible issues:\n• Model name might be incorrect (check Ollama Cloud dashboard)\n• Model might not be available in your region\n• Your endpoint may not match the selected model catalog\n\nCheck your Ollama Cloud model name and endpoint in Settings.`
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
        // Try alternate API key before giving up
        if (isCloudModel && this.trySwapApiKey()) {
          console.log(`[Ollama] Auth failed, retrying chat with alternate API key...`);
          return this.chat(messages, options);
        }
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
    const maxTokens = options.maxTokens || this.getDefaultMaxTokens(model);
    const { isCloudModel, isLocal, apiModel, requestUrl, timeout } = this.resolveRequestContext(
      model,
      maxTokens,
      true
    );
    
    console.log(`[Ollama] Stream with ${apiModel} (${isCloudModel ? 'CLOUD' : 'local'}${apiModel !== model ? `, resolved from ${model}` : ''})`);
    console.log(`[Ollama] Request URL: ${requestUrl}, timeout: ${Math.round(timeout/1000)}s, maxTokens: ${maxTokens}, API Key present: ${!!this.apiKey}`);

    try {
      const response = await axios.post(requestUrl, {
        model: apiModel,
        messages: this.formatMessages(messages),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: maxTokens
        }
      }, {
        ...this.getAxiosConfig(timeout),
        responseType: 'stream'
      });

      let fullContent = '';
      let lineBuffer = '';

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          lineBuffer += chunk.toString();
          const parts = lineBuffer.split('\n');
          // Keep the last (possibly incomplete) segment in the buffer
          lineBuffer = parts.pop() || '';
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk({
                  content: data.message.content,
                  done: data.done || false
                });
              } else if (data.done) {
                onChunk({ content: '', done: true });
              }
            } catch (e) {
              // Partial JSON from a split line — will be completed with next chunk
            }
          }
        });

        (response.data as Readable).on('end', () => {
          // Flush any remaining data in the buffer
          if (lineBuffer.trim()) {
            try {
              const data = JSON.parse(lineBuffer.trim());
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk({ content: data.message.content, done: data.done || false });
              }
            } catch { /* ignore trailing fragment */ }
          }
          resolve();
        });

        (response.data as Readable).on('error', reject);
      });
    } catch (e: any) {
      // Log detailed error info for debugging
      console.error(`[Ollama] Stream request failed:`, {
        url: requestUrl,
        model: apiModel,
        errorCode: e.code,
        status: e.response?.status,
        statusText: e.response?.statusText,
        message: e.message,
        isNetworkError: !e.response
      });
      
      // Better error messages matching the chat() method
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
        if (isCloudModel) {
          throw new Error(
            `❌ Cannot connect to Ollama Cloud (${e.code}).\n\n` +
            `Possible issues:\n` +
            `• Internet connection problem\n` +
            `• DNS resolution failed\n` +
            `• Firewall/proxy blocking connection\n` +
            `• Check your network settings`
          );
        }
        throw new Error('❌ Ollama not running! Start with: ollama serve');
      }
      if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
        throw new Error(
          `⏱️ Request timed out.\n\n` +
          `Possible issues:\n` +
          `• Slow internet connection\n` +
          `• Model is overloaded\n` +
          `• Try a faster/smaller model`
        );
      }
      if (e.code === 'ENETUNREACH' || e.code === 'EHOSTUNREACH') {
        throw new Error(
          `❌ Network unreachable (${e.code}).\n\n` +
          `Check your internet connection and try again.`
        );
      }
      // Check for 404 in both response status and error message
      if (e.response?.status === 404 || e.message?.includes('404')) {
        if (isCloudModel) {
          throw new Error(
            `❌ Cloud model '${this.normalizeModelIdentifier(model)}' not found or unavailable.\n\n` +
            `Possible issues:\n` +
            `• Model name might be incorrect (check Ollama Cloud dashboard)\n` +
            `• Model might not be available in your region\n` +
            `• Your endpoint may not match the selected model catalog\n\n` +
            `Check your Ollama Cloud model name and endpoint in Settings.`
          );
        }
        if (isLocal) {
          throw new Error(`Model '${model}' not found. Pull it with: ollama pull ${model}`);
        }
        throw new Error(`Model '${model}' not found. Check your Ollama configuration.`);
      }
      // Check for 401/403 (authentication errors for cloud)
      if (e.response?.status === 401 || e.response?.status === 403) {
        // Try alternate API key before giving up
        if (isCloudModel && this.trySwapApiKey()) {
          console.log(`[Ollama] Auth failed, retrying stream with alternate API key...`);
          return this.stream(messages, onChunk, options);
        }
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
    const { baseUrl, isCloudModel, isLocal, apiModel } = this.resolveRequestContext(model, maxTokens, false);
    const timeout = Math.max(5000, Math.min(this.getRequestTimeoutMs(model, maxTokens, false, isCloudModel), maxTokens * 75));

    try {
      const response = await axios.post(`${baseUrl}/api/generate`, {
        model: apiModel,
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

      return this.annotateServedBy({
        success: true,
        content: response.data?.response || ''
      }, apiModel);
    } catch (e: any) {
      if (e.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '❌ Ollama not running!'
        };
      }
      if (e.response?.status === 404) {
        return {
          success: false,
          error: isLocal
            ? `Model '${model}' not found. Pull it with: ollama pull ${model}`
            : `Model '${model}' not found. Check your Ollama Cloud configuration.`
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
    const maxTokens = options.maxTokens || this.getDefaultMaxTokens(model);
    const { baseUrl, apiModel, timeout } = this.resolveRequestContext(model, maxTokens, true);
    
    try {
      const response = await axios.post(`${baseUrl}/api/chat`, {
        model: apiModel,
        messages: this.formatMessages(messages),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: maxTokens
        }
      }, {
        headers: this.getHeaders(),
        timeout,
        responseType: 'stream'
      });

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let chatStreamBuf = '';

      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          chatStreamBuf += chunk.toString();
          const parts = chatStreamBuf.split('\n');
          chatStreamBuf = parts.pop() || '';
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk(data.message.content, data.done || false);
              }
              if (data.prompt_eval_count) promptTokens = data.prompt_eval_count;
              if (data.eval_count) completionTokens = data.eval_count;
            } catch {
              // Partial JSON — next chunk will complete it
            }
          }
        });

        (response.data as Readable).on('end', () => {
          if (chatStreamBuf.trim()) {
            try {
              const data = JSON.parse(chatStreamBuf.trim());
              if (data.message?.content) {
                fullContent += data.message.content;
                onChunk(data.message.content, data.done || false);
              }
              if (data.prompt_eval_count) promptTokens = data.prompt_eval_count;
              if (data.eval_count) completionTokens = data.eval_count;
            } catch { /* ignore trailing fragment */ }
          }
          resolve(this.annotateServedBy({
            success: true,
            content: fullContent,
            usage: { promptTokens, completionTokens }
          }, apiModel));
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
    const baseUrl = normalizeOllamaBaseUrl(this.baseUrl, model) || LOCAL_OLLAMA_URL;
    const isDirectApi = isCloudOllamaUrl(baseUrl);
    const apiModel = this.resolveModelName(model, isDirectApi);
    const maxTokens = options.maxTokens || 4096;

    // Format messages for Anthropic API
    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    console.log(`[Ollama/Anthropic] Chat with ${apiModel}, maxTokens: ${maxTokens}`);

    try {
      const requestBody: any = {
        model: apiModel,
        max_tokens: maxTokens,
        messages: userMessages,
        temperature: options.temperature ?? 0.7
      };

      // Add system message if present
      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await axios.post(`${baseUrl}/v1/messages`, requestBody, {
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
    const baseUrl = normalizeOllamaBaseUrl(this.baseUrl, model) || LOCAL_OLLAMA_URL;
    const isDirectApi = isCloudOllamaUrl(baseUrl);
    const apiModel = this.resolveModelName(model, isDirectApi);
    const maxTokens = options.maxTokens || 4096;

    // Format messages for Anthropic API
    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    console.log(`[Ollama/Tools] Chat with ${apiModel}, ${tools.length} tools available`);

    try {
      const requestBody: any = {
        model: apiModel,
        max_tokens: maxTokens,
        messages: userMessages,
        tools,
        temperature: options.temperature ?? 0.7
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await axios.post(`${baseUrl}/v1/messages`, requestBody, {
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
    const baseUrl = normalizeOllamaBaseUrl(this.baseUrl, model) || LOCAL_OLLAMA_URL;
    const isDirectApi = isCloudOllamaUrl(baseUrl);
    const apiModel = this.resolveModelName(model, isDirectApi);
    const maxTokens = options.maxTokens || 4096;

    const { systemMessage, userMessages } = this.formatMessagesAnthropicStyle(messages);

    try {
      const requestBody: any = {
        model: apiModel,
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

      const response = await axios.post(`${baseUrl}/v1/messages`, requestBody, {
        headers: this.getAnthropicHeaders(),
        timeout: 600000,
        responseType: 'stream'
      });

      let sseBuf = '';
      return new Promise((resolve, reject) => {
        (response.data as Readable).on('data', (chunk: Buffer) => {
          sseBuf += chunk.toString();
          const parts = sseBuf.split('\n');
          sseBuf = parts.pop() || '';
          for (const line of parts) {
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
                // Partial JSON — next chunk will complete it
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
