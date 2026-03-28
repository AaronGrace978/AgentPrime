/**
 * AI Provider for CLI usage - FAST version with streaming
 */

import https from 'https';

// API keys from environment
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

interface AIProvider {
  generateResponse(message: string, systemPrompt: string, options?: GenerateOptions): Promise<string>;
  streamResponse?(message: string, systemPrompt: string, onChunk: (text: string) => void, options?: GenerateOptions): Promise<string>;
}

/**
 * Fast HTTPS request helper (no external deps)
 */
function httpsRequest(url: string, options: https.RequestOptions, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Streaming HTTPS request
 */
function httpsStream(
  url: string, 
  options: https.RequestOptions, 
  body: string,
  onData: (chunk: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
        return;
      }
      res.on('data', chunk => onData(chunk.toString()));
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Anthropic provider with streaming
 */
class AnthropicCLIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateResponse(message: string, systemPrompt: string, options: GenerateOptions = {}): Promise<string> {
    const body = JSON.stringify({
      model: options.model || this.model,
      max_tokens: options.maxTokens || 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    const data = await httpsRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    const json = JSON.parse(data);
    return json.content?.[0]?.text || '';
  }

  async streamResponse(message: string, systemPrompt: string, onChunk: (text: string) => void, options: GenerateOptions = {}): Promise<string> {
    const body = JSON.stringify({
      model: options.model || this.model,
      max_tokens: options.maxTokens || 2000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    let fullText = '';
    let buffer = '';

    await httpsStream('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, body, (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.type === 'content_block_delta' && json.delta?.text) {
              fullText += json.delta.text;
              onChunk(json.delta.text);
            }
          } catch {}
        }
      }
    });

    return fullText;
  }
}

/**
 * OpenAI provider with streaming
 */
class OpenAICLIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateResponse(message: string, systemPrompt: string, options: GenerateOptions = {}): Promise<string> {
    const body = JSON.stringify({
      model: options.model || this.model,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    const data = await httpsRequest('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    const json = JSON.parse(data);
    return json.choices?.[0]?.message?.content || '';
  }

  async streamResponse(message: string, systemPrompt: string, onChunk: (text: string) => void, options: GenerateOptions = {}): Promise<string> {
    const body = JSON.stringify({
      model: options.model || this.model,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    let fullText = '';
    let buffer = '';

    await httpsStream('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body, (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch {}
        }
      }
    });

    return fullText;
  }
}

/**
 * Ollama provider with streaming
 */
class OllamaCLIProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, model: string = 'qwen3-coder:480b-cloud', baseUrl: string = 'https://ollama.com') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async generateResponse(message: string, systemPrompt: string, options: GenerateOptions = {}): Promise<string> {
    const url = new URL('/api/chat', this.baseUrl);
    const body = JSON.stringify({
      model: options.model || this.model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    const data = await httpsRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    const json = JSON.parse(data);
    return json.message?.content || '';
  }

  async streamResponse(message: string, systemPrompt: string, onChunk: (text: string) => void, options: GenerateOptions = {}): Promise<string> {
    const url = new URL('/api/chat', this.baseUrl);
    const body = JSON.stringify({
      model: options.model || this.model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    let fullText = '';
    let buffer = '';

    await httpsStream(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body, (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const content = json.message?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {}
      }
    });

    return fullText;
  }
}

// Cached provider
let cachedProvider: AIProvider | null = null;

/**
 * Get provider - instant, no dynamic imports
 */
export function getAIProvider(): AIProvider | null {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.AGENTPRIME_PROVIDER || DEFAULT_PROVIDER;

  switch (provider.toLowerCase()) {
    case 'anthropic':
      cachedProvider = new AnthropicCLIProvider(process.env.ANTHROPIC_API_KEY || ANTHROPIC_API_KEY);
      break;
    case 'openai':
      cachedProvider = new OpenAICLIProvider(process.env.OPENAI_API_KEY || OPENAI_API_KEY);
      break;
    case 'ollama':
      cachedProvider = new OllamaCLIProvider(
        process.env.OLLAMA_API_KEY || OLLAMA_API_KEY,
        process.env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud',
        process.env.OLLAMA_URL || 'https://ollama.com'
      );
      break;
    default:
      cachedProvider = new AnthropicCLIProvider(ANTHROPIC_API_KEY);
  }

  return cachedProvider;
}

export function setAIProvider(provider: AIProvider): void {
  cachedProvider = provider;
}

export { AnthropicCLIProvider, OpenAICLIProvider, OllamaCLIProvider };
export type { AIProvider, GenerateOptions };
