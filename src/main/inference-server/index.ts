/**
 * AgentPrime Inference Server
 * 
 * OpenAI-compatible API proxy that routes through AgentPrime's AI providers.
 * Enables VibeHub projects and any OpenAI-compatible client to use AgentPrime's AI.
 * 
 * Features:
 * - OpenAI-compatible /v1/chat/completions endpoint
 * - Streaming support (SSE)
 * - Model listing via /v1/models
 * - Routes to configured providers (Ollama, Anthropic, OpenAI, OpenRouter)
 * - Zero-config for VibeHub projects
 */

import * as http from 'http';
import * as url from 'url';
import aiRouter from '../ai-providers';
import type { ChatMessage, StreamChunk } from '../../types/ai-providers';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PORT = 11411;  // "AI" in leet speak ;)
const ALLOWED_ORIGINS = ['http://localhost', 'http://127.0.0.1', 'file://'];

export interface InferenceServerConfig {
  port?: number;
  allowedOrigins?: string[];
  requireAuth?: boolean;
  apiKey?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | null;
  }>;
}

interface OpenAIModelList {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INFERENCE SERVER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class InferenceServer {
  private server: http.Server | null = null;
  private port: number;
  private config: InferenceServerConfig;
  private requestCount: number = 0;

  constructor(config: InferenceServerConfig = {}) {
    this.config = config;
    this.port = config.port || DEFAULT_PORT;
  }

  /**
   * Start the inference server
   */
  async start(): Promise<number> {
    if (this.server) {
      console.log(`[InferenceServer] Already running on port ${this.port}`);
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`[InferenceServer] Port ${this.port} in use, trying ${this.port + 1}...`);
          this.port++;
          this.server?.close();
          this.server = null;
          this.start().then(resolve).catch(reject);
        } else {
          console.error('[InferenceServer] Error:', error);
          reject(error);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[InferenceServer] ✅ Running on http://127.0.0.1:${this.port}`);
        console.log(`[InferenceServer] OpenAI-compatible API: http://127.0.0.1:${this.port}/v1`);
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the inference server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[InferenceServer] Stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the current port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get server stats
   */
  getStats(): { port: number; running: boolean; requestCount: number } {
    return {
      port: this.port,
      running: this.isRunning(),
      requestCount: this.requestCount
    };
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';

    this.requestCount++;
    console.log(`[InferenceServer] ${req.method} ${pathname}`);

    try {
      // Route handling
      // OpenAI-compatible endpoints
      if (pathname === '/v1/chat/completions' && req.method === 'POST') {
        await this.handleChatCompletions(req, res);
      } else if (pathname === '/v1/models' && req.method === 'GET') {
        await this.handleModels(req, res);
      } 
      // Ollama-native endpoints (for Ollama SDK compatibility)
      else if (pathname === '/api/chat' && req.method === 'POST') {
        await this.handleOllamaChat(req, res);
      } else if (pathname === '/api/generate' && req.method === 'POST') {
        await this.handleOllamaGenerate(req, res);
      } else if (pathname === '/api/tags' && req.method === 'GET') {
        await this.handleOllamaTags(req, res);
      }
      // Health & info endpoints
      else if (pathname === '/v1/health' || pathname === '/health') {
        this.handleHealth(res);
      } else if (pathname === '/' || pathname === '/v1') {
        this.handleRoot(res);
      } else {
        this.sendError(res, 404, 'Not Found', `Unknown endpoint: ${pathname}`);
      }
    } catch (error: any) {
      console.error('[InferenceServer] Request error:', error);
      this.sendError(res, 500, 'Internal Server Error', error.message);
    }
  }

  /**
   * Handle /v1/chat/completions endpoint
   */
  private async handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody<OpenAIChatRequest>(req);

    if (!body.messages || !Array.isArray(body.messages)) {
      this.sendError(res, 400, 'Bad Request', 'messages array is required');
      return;
    }

    // Convert to AgentPrime message format
    const messages: ChatMessage[] = body.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const requestId = `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const model = body.model || 'agentprime-default';

    if (body.stream) {
      // Streaming response
      await this.handleStreamingChat(res, messages, body, requestId, model);
    } else {
      // Non-streaming response
      await this.handleNonStreamingChat(res, messages, body, requestId, model);
    }
  }

  /**
   * Handle non-streaming chat completion
   */
  private async handleNonStreamingChat(
    res: http.ServerResponse,
    messages: ChatMessage[],
    options: OpenAIChatRequest,
    requestId: string,
    model: string
  ): Promise<void> {
    try {
      const result = await aiRouter.chat(messages, {
        temperature: options.temperature,
        maxTokens: options.max_tokens
      });

      if (!result.success) {
        this.sendError(res, 500, 'AI Error', result.error || 'Unknown AI error');
        return;
      }

      const response: OpenAIChatResponse = {
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: result.content || ''
          },
          finish_reason: 'stop'
        }],
        usage: result.usage ? {
          prompt_tokens: result.usage.promptTokens || 0,
          completion_tokens: result.usage.completionTokens || 0,
          total_tokens: result.usage.totalTokens || ((result.usage.promptTokens || 0) + (result.usage.completionTokens || 0))
        } : undefined
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

    } catch (error: any) {
      this.sendError(res, 500, 'AI Error', error.message);
    }
  }

  /**
   * Handle streaming chat completion (SSE)
   */
  private async handleStreamingChat(
    res: http.ServerResponse,
    messages: ChatMessage[],
    options: OpenAIChatRequest,
    requestId: string,
    model: string
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial chunk with role
    const initialChunk: OpenAIStreamChunk = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null
      }]
    };
    res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

    try {
      await aiRouter.stream(messages, (chunk: StreamChunk) => {
        if (chunk.done) return; // Skip the final "done" chunk, we handle it separately
        const streamChunk: OpenAIStreamChunk = {
          id: requestId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: { content: chunk.content },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
      }, {
        temperature: options.temperature,
        maxTokens: options.max_tokens
      });

      // Send final chunk
      const finalChunk: OpenAIStreamChunk = {
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error: any) {
      // Send error as SSE
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle /v1/models endpoint
   */
  private async handleModels(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const models: OpenAIModelList = {
        object: 'list',
        data: [
          {
            id: 'agentprime-default',
            object: 'model',
            created: Date.now(),
            owned_by: 'agentprime'
          },
          {
            id: 'agentprime-fast',
            object: 'model',
            created: Date.now(),
            owned_by: 'agentprime'
          },
          {
            id: 'agentprime-deep',
            object: 'model',
            created: Date.now(),
            owned_by: 'agentprime'
          }
        ]
      };

      // Try to get actual available models
      try {
        const providersInfo = aiRouter.getProvidersInfo();
        for (const provider of providersInfo) {
          models.data.push({
            id: `${provider.id}`,
            object: 'model',
            created: Date.now(),
            owned_by: provider.id
          });
        }
      } catch {
        // Ignore - use defaults
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(models));

    } catch (error: any) {
      this.sendError(res, 500, 'Error', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OLLAMA-NATIVE API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle /api/chat (Ollama native format)
   */
  private async handleOllamaChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody<{
      model?: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      options?: { temperature?: number; num_predict?: number };
    }>(req);

    if (!body.messages || !Array.isArray(body.messages)) {
      this.sendError(res, 400, 'Bad Request', 'messages array is required');
      return;
    }

    const messages: ChatMessage[] = body.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }));

    const model = body.model || 'agentprime-default';

    if (body.stream !== false) {
      // Streaming response (Ollama default)
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

      try {
        await aiRouter.stream(messages, (chunk: StreamChunk) => {
          if (chunk.done) return;
          const ollamaChunk = {
            model: model,
            created_at: new Date().toISOString(),
            message: { role: 'assistant', content: chunk.content },
            done: false
          };
          res.write(JSON.stringify(ollamaChunk) + '\n');
        }, {
          temperature: body.options?.temperature,
          maxTokens: body.options?.num_predict
        });

        // Final chunk
        const finalChunk = {
          model: model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop'
        };
        res.write(JSON.stringify(finalChunk) + '\n');
        res.end();

      } catch (error: any) {
        res.write(JSON.stringify({ error: error.message }) + '\n');
        res.end();
      }
    } else {
      // Non-streaming
      try {
        const result = await aiRouter.chat(messages, {
          temperature: body.options?.temperature,
          maxTokens: body.options?.num_predict
        });

        if (!result.success) {
          this.sendError(res, 500, 'AI Error', result.error || 'Unknown AI error');
          return;
        }

        const response = {
          model: model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: result.content || '' },
          done: true,
          done_reason: 'stop'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));

      } catch (error: any) {
        this.sendError(res, 500, 'AI Error', error.message);
      }
    }
  }

  /**
   * Handle /api/generate (Ollama native format - legacy completion)
   */
  private async handleOllamaGenerate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody<{
      model?: string;
      prompt: string;
      stream?: boolean;
      options?: { temperature?: number; num_predict?: number };
    }>(req);

    if (!body.prompt) {
      this.sendError(res, 400, 'Bad Request', 'prompt is required');
      return;
    }

    const messages: ChatMessage[] = [{ role: 'user', content: body.prompt }];
    const model = body.model || 'agentprime-default';

    if (body.stream !== false) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

      try {
        await aiRouter.stream(messages, (chunk: StreamChunk) => {
          if (chunk.done) return;
          const ollamaChunk = {
            model: model,
            created_at: new Date().toISOString(),
            response: chunk.content,
            done: false
          };
          res.write(JSON.stringify(ollamaChunk) + '\n');
        }, {
          temperature: body.options?.temperature,
          maxTokens: body.options?.num_predict
        });

        const finalChunk = {
          model: model,
          created_at: new Date().toISOString(),
          response: '',
          done: true,
          done_reason: 'stop'
        };
        res.write(JSON.stringify(finalChunk) + '\n');
        res.end();

      } catch (error: any) {
        res.write(JSON.stringify({ error: error.message }) + '\n');
        res.end();
      }
    } else {
      try {
        const result = await aiRouter.chat(messages, {
          temperature: body.options?.temperature,
          maxTokens: body.options?.num_predict
        });

        if (!result.success) {
          this.sendError(res, 500, 'AI Error', result.error || 'Unknown AI error');
          return;
        }

        const response = {
          model: model,
          created_at: new Date().toISOString(),
          response: result.content || '',
          done: true,
          done_reason: 'stop'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));

      } catch (error: any) {
        this.sendError(res, 500, 'AI Error', error.message);
      }
    }
  }

  /**
   * Handle /api/tags (Ollama model list format)
   */
  private async handleOllamaTags(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const models = {
      models: [
        {
          name: 'agentprime:default',
          model: 'agentprime:default',
          modified_at: new Date().toISOString(),
          size: 0,
          digest: 'agentprime',
          details: {
            parent_model: '',
            format: 'agentprime',
            family: 'agentprime',
            families: ['agentprime'],
            parameter_size: 'varies',
            quantization_level: 'varies'
          }
        },
        {
          name: 'agentprime:fast',
          model: 'agentprime:fast',
          modified_at: new Date().toISOString(),
          size: 0,
          digest: 'agentprime-fast',
          details: {
            parent_model: '',
            format: 'agentprime',
            family: 'agentprime',
            families: ['agentprime'],
            parameter_size: 'varies',
            quantization_level: 'varies'
          }
        },
        {
          name: 'agentprime:deep',
          model: 'agentprime:deep',
          modified_at: new Date().toISOString(),
          size: 0,
          digest: 'agentprime-deep',
          details: {
            parent_model: '',
            format: 'agentprime',
            family: 'agentprime',
            families: ['agentprime'],
            parameter_size: 'varies',
            quantization_level: 'varies'
          }
        }
      ]
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(models));
  }

  /**
   * Handle health check endpoint
   */
  private handleHealth(res: http.ServerResponse): void {
    const health = {
      status: 'healthy',
      service: 'agentprime-inference',
      version: '1.0.0',
      uptime: process.uptime(),
      requests: this.requestCount
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  /**
   * Handle root endpoint
   */
  private handleRoot(res: http.ServerResponse): void {
    const info = {
      name: 'AgentPrime Inference Server',
      version: '1.0.0',
      description: 'OpenAI and Ollama compatible API for AgentPrime AI providers',
      endpoints: {
        'OpenAI Compatible': {
          'POST /v1/chat/completions': 'Chat completions (streaming supported)',
          'GET /v1/models': 'List available models'
        },
        'Ollama Compatible': {
          'POST /api/chat': 'Chat completions (Ollama format)',
          'POST /api/generate': 'Text generation (Ollama format)',
          'GET /api/tags': 'List available models'
        },
        'Utility': {
          'GET /health': 'Health check',
          'GET /': 'This info page'
        }
      },
      usage: {
        'Python (openai)': 'OpenAI(base_url="http://localhost:11411/v1", api_key="not-needed")',
        'Python (ollama)': 'ollama.Client(host="http://localhost:11411")',
        'JavaScript (openai)': 'new OpenAI({ baseURL: "http://localhost:11411/v1" })',
        'JavaScript (ollama)': 'new Ollama({ host: "http://localhost:11411" })',
        'LangChain': 'ChatOpenAI(base_url="http://localhost:11411/v1")',
        'Environment Variables': 'OPENAI_API_BASE=http://localhost:11411/v1 OR OLLAMA_HOST=http://localhost:11411'
      },
      note: 'This server routes requests through AgentPrime\'s configured AI providers (Ollama, Anthropic, OpenAI, etc.)'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info, null, 2));
  }

  /**
   * Parse request body as JSON
   */
  private parseBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {} as T);
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send error response
   */
  private sendError(res: http.ServerResponse, status: number, type: string, message: string): void {
    const error = {
      error: {
        message,
        type,
        code: status
      }
    };
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(error));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

let serverInstance: InferenceServer | null = null;

/**
 * Get or create the inference server instance
 */
export function getInferenceServer(config?: InferenceServerConfig): InferenceServer {
  if (!serverInstance) {
    serverInstance = new InferenceServer(config);
  }
  return serverInstance;
}

/**
 * Start the inference server
 */
export async function startInferenceServer(config?: InferenceServerConfig): Promise<number> {
  const server = getInferenceServer(config);
  return server.start();
}

/**
 * Stop the inference server
 */
export async function stopInferenceServer(): Promise<void> {
  if (serverInstance) {
    await serverInstance.stop();
  }
}

/**
 * Get environment variables for projects to use the inference server
 */
export function getInferenceEnvVars(): Record<string, string> {
  const port = serverInstance?.getPort() || DEFAULT_PORT;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  return {
    // OpenAI SDK compatible
    OPENAI_API_BASE: baseUrl,
    OPENAI_BASE_URL: baseUrl,
    OPENAI_API_KEY: 'agentprime-local',
    
    // Ollama compatible (many SDKs check this)
    OLLAMA_HOST: `http://127.0.0.1:${port}`,
    
    // AgentPrime specific
    AGENTPRIME_INFERENCE_URL: baseUrl,
    AGENTPRIME_INFERENCE_PORT: String(port),
    
    // LangChain/LiteLLM compatible
    LITELLM_BASE_URL: baseUrl,
  };
}

export default InferenceServer;
