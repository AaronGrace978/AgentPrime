/**
 * Matrix Mode Message Router
 * Routes incoming messages to correct agents/sessions
 * Includes rate limiting and DM pairing protection
 */

import { Message, OutgoingMessage, MessageResult } from './types';
import { ChannelManager, getChannelManager } from './channel-manager';
import { MultiTierRateLimiter, getRateLimiter, RateLimitResult } from './rate-limiter';

// Generate unique ID
function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface RouteConfig {
  channelId?: string;
  channelType?: string;
  senderId?: string;
  groupId?: string;
  pattern?: RegExp | string;
  handler: MessageRouteHandler;
  priority?: number;
}

export type MessageRouteHandler = (message: Message) => Promise<OutgoingMessage | null>;

interface Route {
  id: string;
  config: RouteConfig;
}

export class MessageRouter {
  private channelManager: ChannelManager;
  private routes: Route[] = [];
  private defaultHandler: MessageRouteHandler | null = null;
  private preprocessors: Array<(message: Message) => Promise<Message | null>> = [];
  private postprocessors: Array<(message: Message, response: OutgoingMessage | null) => Promise<void>> = [];
  private messageQueue: Map<string, Message> = new Map();
  private processingQueue: Set<string> = new Set();
  private maxQueueSize: number = 1000;
  private rateLimiter: MultiTierRateLimiter;
  private rateLimitingEnabled: boolean = true;
  private dmPairingEnabled: boolean = true;
  private allowedSenders: Set<string> = new Set();
  private pendingPairings: Map<string, { code: string; expires: number }> = new Map();

  constructor(channelManager?: ChannelManager) {
    this.channelManager = channelManager || getChannelManager();
    this.rateLimiter = getRateLimiter();
  }

  /**
   * Initialize the router
   */
  initialize(): void {
    // Register with channel manager
    this.channelManager.onMessage(async (message) => {
      await this.route(message);
    });

    console.log('[MessageRouter] Initialized');
  }

  /**
   * Add a route
   */
  addRoute(config: RouteConfig): string {
    const id = generateId();
    this.routes.push({ id, config });
    
    // Sort by priority (higher first)
    this.routes.sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0));
    
    return id;
  }

  /**
   * Remove a route
   */
  removeRoute(routeId: string): boolean {
    const index = this.routes.findIndex(r => r.id === routeId);
    if (index >= 0) {
      this.routes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Set default handler
   */
  setDefaultHandler(handler: MessageRouteHandler): void {
    this.defaultHandler = handler;
  }

  /**
   * Add a preprocessor
   */
  addPreprocessor(preprocessor: (message: Message) => Promise<Message | null>): void {
    this.preprocessors.push(preprocessor);
  }

  /**
   * Add a postprocessor
   */
  addPostprocessor(postprocessor: (message: Message, response: OutgoingMessage | null) => Promise<void>): void {
    this.postprocessors.push(postprocessor);
  }

  /**
   * Enable/disable rate limiting
   */
  setRateLimiting(enabled: boolean): void {
    this.rateLimitingEnabled = enabled;
  }

  /**
   * Enable/disable DM pairing
   */
  setDMPairing(enabled: boolean): void {
    this.dmPairingEnabled = enabled;
  }

  /**
   * Add sender to allowlist (skip pairing)
   */
  allowSender(senderId: string): void {
    this.allowedSenders.add(senderId);
  }

  /**
   * Remove sender from allowlist
   */
  disallowSender(senderId: string): void {
    this.allowedSenders.delete(senderId);
  }

  /**
   * Approve pairing code
   */
  approvePairing(channelType: string, code: string): boolean {
    const key = `${channelType}:${code}`;
    for (const [senderId, pairing] of this.pendingPairings) {
      if (pairing.code === code && Date.now() < pairing.expires) {
        this.allowedSenders.add(senderId);
        this.pendingPairings.delete(senderId);
        console.log(`[MessageRouter] Approved pairing for ${senderId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Check rate limit for a message
   */
  private checkRateLimit(message: Message): RateLimitResult {
    if (!this.rateLimitingEnabled) {
      return { allowed: true, remaining: Infinity, resetAt: 0 };
    }

    return this.rateLimiter.check({
      channelType: message.channelType,
      channelId: message.channelId,
      userId: message.senderId
    });
  }

  /**
   * Check DM pairing requirement
   */
  private checkDMPairing(message: Message): { allowed: boolean; pairingCode?: string } {
    // Skip if pairing is disabled
    if (!this.dmPairingEnabled) {
      return { allowed: true };
    }

    // Skip for group messages
    if (message.groupId) {
      return { allowed: true };
    }

    // Skip for allowed senders
    if (this.allowedSenders.has(message.senderId)) {
      return { allowed: true };
    }

    // Check for existing pairing
    const existing = this.pendingPairings.get(message.senderId);
    if (existing && Date.now() < existing.expires) {
      return { allowed: false, pairingCode: existing.code };
    }

    // Generate new pairing code
    const code = this.generatePairingCode();
    this.pendingPairings.set(message.senderId, {
      code,
      expires: Date.now() + 300000 // 5 minutes
    });

    return { allowed: false, pairingCode: code };
  }

  /**
   * Generate 6-digit pairing code
   */
  private generatePairingCode(): string {
    return Math.random().toString().slice(2, 8).padStart(6, '0');
  }

  /**
   * Route a message
   */
  async route(message: Message): Promise<OutgoingMessage | null> {
    // Check if already processing
    if (this.processingQueue.has(message.id)) {
      console.warn(`[MessageRouter] Message ${message.id} already being processed`);
      return null;
    }

    // Check rate limit
    const rateLimitResult = this.checkRateLimit(message);
    if (!rateLimitResult.allowed) {
      console.warn(`[MessageRouter] Rate limited: ${message.senderId} (retry in ${rateLimitResult.retryAfter}ms)`);
      
      // Optionally send rate limit message
      if (!rateLimitResult.blocked) {
        await this.channelManager.sendMessage({
          channelId: message.channelId,
          targetId: message.groupId || message.senderId,
          type: 'text',
          text: `⏳ Slow down! Please wait ${Math.ceil((rateLimitResult.retryAfter || 60000) / 1000)} seconds.`
        });
      }
      return null;
    }

    // Check DM pairing
    const pairingResult = this.checkDMPairing(message);
    if (!pairingResult.allowed) {
      console.log(`[MessageRouter] DM pairing required for ${message.senderId}`);
      
      // Send pairing code
      await this.channelManager.sendMessage({
        channelId: message.channelId,
        targetId: message.senderId,
        type: 'text',
        text: `🔐 Pairing required. Your code: ${pairingResult.pairingCode}\n\nRun: agentprime pairing approve ${message.channelType} ${pairingResult.pairingCode}`
      });
      return null;
    }

    // Queue management
    if (this.messageQueue.size >= this.maxQueueSize) {
      // Remove oldest message
      const oldest = this.messageQueue.keys().next().value;
      this.messageQueue.delete(oldest);
    }
    
    this.messageQueue.set(message.id, message);
    this.processingQueue.add(message.id);

    try {
      // Run preprocessors
      let processedMessage: Message | null = message;
      for (const preprocessor of this.preprocessors) {
        if (!processedMessage) break;
        processedMessage = await preprocessor(processedMessage);
      }

      if (!processedMessage) {
        return null;
      }

      // Find matching route
      let response: OutgoingMessage | null = null;
      
      for (const route of this.routes) {
        if (this.matchRoute(processedMessage, route.config)) {
          response = await route.config.handler(processedMessage);
          if (response) break; // Stop at first handler that returns a response
        }
      }

      // Fall back to default handler
      if (!response && this.defaultHandler) {
        response = await this.defaultHandler(processedMessage);
      }

      // Run postprocessors
      for (const postprocessor of this.postprocessors) {
        await postprocessor(processedMessage, response);
      }

      // Send response if we have one
      if (response) {
        await this.sendResponse(response);
      }

      return response;
    } catch (error) {
      console.error(`[MessageRouter] Error routing message ${message.id}:`, error);
      return null;
    } finally {
      this.processingQueue.delete(message.id);
    }
  }

  /**
   * Check if a message matches a route
   */
  private matchRoute(message: Message, config: RouteConfig): boolean {
    // Check channel ID
    if (config.channelId && message.channelId !== config.channelId) {
      return false;
    }

    // Check channel type
    if (config.channelType && message.channelType !== config.channelType) {
      return false;
    }

    // Check sender ID
    if (config.senderId && message.senderId !== config.senderId) {
      return false;
    }

    // Check group ID
    if (config.groupId && message.groupId !== config.groupId) {
      return false;
    }

    // Check pattern
    if (config.pattern) {
      const text = message.text || '';
      const pattern = typeof config.pattern === 'string' 
        ? new RegExp(config.pattern, 'i')
        : config.pattern;
      
      if (!pattern.test(text)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send a response
   */
  private async sendResponse(response: OutgoingMessage): Promise<MessageResult> {
    return this.channelManager.sendMessage(response);
  }

  /**
   * Send a message directly
   */
  async send(
    channelId: string,
    targetId: string,
    text: string,
    options?: Partial<OutgoingMessage>
  ): Promise<MessageResult> {
    const message: OutgoingMessage = {
      channelId,
      targetId,
      type: 'text',
      text,
      ...options
    };

    return this.channelManager.sendMessage(message);
  }

  /**
   * Reply to a message
   */
  async reply(
    originalMessage: Message,
    text: string,
    options?: Partial<OutgoingMessage>
  ): Promise<MessageResult> {
    return this.send(
      originalMessage.channelId,
      originalMessage.groupId || originalMessage.senderId,
      text,
      {
        replyTo: originalMessage.id,
        ...options
      }
    );
  }

  /**
   * React to a message
   */
  async react(
    originalMessage: Message,
    emoji: string
  ): Promise<MessageResult> {
    return this.channelManager.sendMessage({
      channelId: originalMessage.channelId,
      targetId: originalMessage.groupId || originalMessage.senderId,
      type: 'reaction',
      reaction: {
        messageId: originalMessage.id,
        emoji
      }
    });
  }

  /**
   * Send typing indicator
   */
  async setTyping(channelId: string, targetId: string, typing: boolean = true): Promise<void> {
    await this.channelManager.setTyping({
      channelId,
      targetId,
      typing
    });
  }

  /**
   * Get message from queue
   */
  getMessage(messageId: string): Message | undefined {
    return this.messageQueue.get(messageId);
  }

  /**
   * Get queue stats
   */
  getStats(): {
    queueSize: number;
    processing: number;
    routes: number;
    rateLimiter: ReturnType<MultiTierRateLimiter['getStats']>;
    allowedSenders: number;
    pendingPairings: number;
  } {
    return {
      queueSize: this.messageQueue.size,
      processing: this.processingQueue.size,
      routes: this.routes.length,
      rateLimiter: this.rateLimiter.getStats(),
      allowedSenders: this.allowedSenders.size,
      pendingPairings: this.pendingPairings.size
    };
  }

  /**
   * Get list of allowed senders
   */
  getAllowedSenders(): string[] {
    return Array.from(this.allowedSenders);
  }

  /**
   * Get pending pairings
   */
  getPendingPairings(): Array<{ senderId: string; code: string; expires: number }> {
    const now = Date.now();
    return Array.from(this.pendingPairings.entries())
      .filter(([_, p]) => p.expires > now)
      .map(([senderId, p]) => ({ senderId, code: p.code, expires: p.expires }));
  }

  /**
   * Block a sender
   */
  blockSender(senderId: string, channelType?: string, durationMs?: number): void {
    this.disallowSender(senderId);
    if (channelType) {
      this.rateLimiter.blockUser(senderId, channelType, durationMs);
    }
  }

  /**
   * Whitelist a sender (bypass rate limits)
   */
  whitelistSender(senderId: string, channelType?: string): void {
    this.allowSender(senderId);
    this.rateLimiter.whitelistUser(senderId, channelType);
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue.clear();
  }
}

// Singleton instance
let messageRouterInstance: MessageRouter | null = null;

export function getMessageRouter(): MessageRouter {
  if (!messageRouterInstance) {
    messageRouterInstance = new MessageRouter();
  }
  return messageRouterInstance;
}

export default MessageRouter;
