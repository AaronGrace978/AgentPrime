/**
 * Matrix Mode Webhook Handler
 * HTTP server for incoming webhooks and external triggers
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { WebhookConfig, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from './types';
import { TaskQueue, getTaskQueue } from './task-queue';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface WebhookRequest {
  id: string;
  webhookId: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>;
  body: any;
  timestamp: number;
  ip?: string;
}

export interface WebhookResponse {
  status: number;
  body?: any;
  headers?: Record<string, string>;
}

export type WebhookHandler = (request: WebhookRequest) => Promise<WebhookResponse>;

export class WebhookServer {
  private config: SchedulerConfig;
  private server: http.Server | null = null;
  private webhooks: Map<string, WebhookConfig> = new Map();
  private handlers: Map<string, WebhookHandler> = new Map();
  private taskQueue: TaskQueue;
  private requestLog: WebhookRequest[] = [];
  private maxLogSize: number = 100;
  private started: boolean = false;

  constructor(config: Partial<SchedulerConfig> = {}, taskQueue?: TaskQueue) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.taskQueue = taskQueue || getTaskQueue();
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    if (this.started) return;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.warn(`[WebhookServer] Port ${this.config.webhookPort} in use, trying ${this.config.webhookPort + 1}`);
          this.config.webhookPort++;
          this.server?.listen(this.config.webhookPort);
        } else {
          reject(error);
        }
      });

      this.server.listen(this.config.webhookPort, () => {
        this.started = true;
        console.log(`[WebhookServer] Started on port ${this.config.webhookPort}`);
        resolve();
      });
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    if (!this.started || !this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.started = false;
        this.server = null;
        console.log('[WebhookServer] Stopped');
        resolve();
      });
    });
  }

  /**
   * Register a webhook endpoint
   */
  registerWebhook(config: Omit<WebhookConfig, 'createdAt' | 'triggerCount'>): WebhookConfig {
    const webhook: WebhookConfig = {
      ...config,
      createdAt: Date.now(),
      triggerCount: 0
    };

    this.webhooks.set(webhook.id, webhook);
    console.log(`[WebhookServer] Registered webhook: ${webhook.path}`);
    
    return webhook;
  }

  /**
   * Unregister a webhook
   */
  unregisterWebhook(webhookId: string): boolean {
    const deleted = this.webhooks.delete(webhookId);
    this.handlers.delete(webhookId);
    if (deleted) {
      console.log(`[WebhookServer] Unregistered webhook: ${webhookId}`);
    }
    return deleted;
  }

  /**
   * Set a custom handler for a webhook
   */
  setHandler(webhookId: string, handler: WebhookHandler): void {
    this.handlers.set(webhookId, handler);
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get webhook by path
   */
  getWebhookByPath(path: string): WebhookConfig | undefined {
    for (const webhook of this.webhooks.values()) {
      if (this.matchPath(webhook.path, path)) {
        return webhook;
      }
    }
    return undefined;
  }

  /**
   * Get all webhooks
   */
  getAllWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.config.webhookPort}`);
    const path = url.pathname;

    // Check if path starts with webhook base path
    if (!path.startsWith(this.config.webhookPath)) {
      this.sendResponse(res, 404, { error: 'Not found' });
      return;
    }

    // Extract webhook path
    const webhookPath = path.substring(this.config.webhookPath.length) || '/';

    // Find matching webhook
    const webhook = this.getWebhookByPath(webhookPath);
    if (!webhook) {
      this.sendResponse(res, 404, { error: 'Webhook not found' });
      return;
    }

    // Check if enabled
    if (!webhook.enabled) {
      this.sendResponse(res, 503, { error: 'Webhook disabled' });
      return;
    }

    // Check method
    const method = req.method?.toUpperCase() || 'GET';
    if (webhook.method !== 'ANY' && webhook.method !== method) {
      this.sendResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    // Parse body
    let body: any = null;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await this.parseBody(req);
      } catch (error) {
        this.sendResponse(res, 400, { error: 'Invalid body' });
        return;
      }
    }

    // Verify signature if secret is set
    if (webhook.secret) {
      const signature = req.headers['x-signature'] || req.headers['x-hub-signature-256'];
      if (!this.verifySignature(body, signature as string, webhook.secret)) {
        this.sendResponse(res, 401, { error: 'Invalid signature' });
        return;
      }
    }

    // Build request object
    const webhookRequest: WebhookRequest = {
      id: generateId(),
      webhookId: webhook.id,
      method,
      path: webhookPath,
      headers: req.headers as Record<string, string | string[] | undefined>,
      query: Object.fromEntries(url.searchParams),
      body,
      timestamp: Date.now(),
      ip: req.socket.remoteAddress
    };

    // Log request
    this.logRequest(webhookRequest);

    // Update webhook stats
    webhook.lastTriggeredAt = Date.now();
    webhook.triggerCount++;

    try {
      // Check for custom handler
      const handler = this.handlers.get(webhook.id);
      if (handler) {
        const response = await handler(webhookRequest);
        this.sendResponse(res, response.status, response.body, response.headers);
        return;
      }

      // Default behavior: trigger associated task
      if (webhook.taskId) {
        const run = this.taskQueue.enqueue(webhook.taskId, 'webhook');
        this.sendResponse(res, 202, {
          success: true,
          message: 'Task triggered',
          runId: run.id
        });
      } else {
        this.sendResponse(res, 200, {
          success: true,
          message: 'Webhook received',
          requestId: webhookRequest.id
        });
      }
    } catch (error: any) {
      console.error('[WebhookServer] Handler error:', error);
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  /**
   * Parse request body
   */
  private parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
        // Limit body size to 1MB
        if (body.length > 1024 * 1024) {
          reject(new Error('Body too large'));
        }
      });

      req.on('end', () => {
        const contentType = req.headers['content-type'] || '';
        
        try {
          if (contentType.includes('application/json')) {
            resolve(JSON.parse(body));
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            resolve(Object.fromEntries(new URLSearchParams(body)));
          } else {
            resolve(body);
          }
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(body: any, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    
    // Support multiple signature formats
    const algorithms = ['sha256', 'sha1'];
    
    for (const algo of algorithms) {
      const expectedSignature = crypto
        .createHmac(algo, secret)
        .update(payload)
        .digest('hex');

      // Check various signature formats
      const formats = [
        expectedSignature,
        `${algo}=${expectedSignature}`,
        `sha256=${expectedSignature}`
      ];

      if (formats.includes(signature)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match webhook path with support for wildcards
   */
  private matchPath(pattern: string, path: string): boolean {
    if (pattern === path) return true;
    if (pattern === '*' || pattern === '/*') return true;

    // Simple wildcard matching
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length && !pattern.includes('*')) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart === '*') continue;
      if (patternPart === '**') return true;
      if (patternPart.startsWith(':')) continue; // URL parameter
      if (patternPart !== pathPart) return false;
    }

    return true;
  }

  /**
   * Send HTTP response
   */
  private sendResponse(
    res: http.ServerResponse,
    status: number,
    body?: any,
    headers?: Record<string, string>
  ): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
    }

    if (body !== undefined) {
      res.end(JSON.stringify(body));
    } else {
      res.end();
    }
  }

  /**
   * Log request
   */
  private logRequest(request: WebhookRequest): void {
    this.requestLog.push(request);
    
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog.shift();
    }
  }

  /**
   * Get request log
   */
  getRequestLog(limit: number = 50): WebhookRequest[] {
    return this.requestLog.slice(-limit);
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Generate webhook URL
   */
  generateWebhookUrl(webhookPath: string): string {
    return `${this.getServerUrl()}${webhookPath}`;
  }
}

// Singleton instance
let webhookServerInstance: WebhookServer | null = null;

export function getWebhookServer(config?: Partial<SchedulerConfig>): WebhookServer {
  if (!webhookServerInstance) {
    webhookServerInstance = new WebhookServer(config);
  }
  return webhookServerInstance;
}

export default WebhookServer;
