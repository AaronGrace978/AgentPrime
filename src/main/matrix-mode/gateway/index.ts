/**
 * Matrix Mode Messaging Gateway
 * Multi-channel messaging support for Matrix Mode
 * 
 * Features:
 * - Channel registration and management
 * - WebSocket server for channel bridges
 * - Message routing to agents
 * - Media handling (images, audio, video, documents)
 * - Typing indicators and presence
 */

export * from './types';
export { ChannelManager, getChannelManager, MessageHandler as ChannelMessageHandler, ChannelFactory } from './channel-manager';
export { GatewayServer, getGatewayServer, GatewayClient, GatewayMessage } from './gateway-server';
export { MessageRouter, getMessageRouter, RouteConfig, MessageRouteHandler } from './message-router';
export { MediaHandler, getMediaHandler, MediaFile, MediaUploadResult, MediaDownloadResult } from './media-handler';
export { 
  RateLimiter, 
  MultiTierRateLimiter, 
  getRateLimiter, 
  RateLimitConfig, 
  RateLimitResult,
  CHANNEL_RATE_LIMITS,
  DEFAULT_RATE_LIMIT 
} from './rate-limiter';

import { GatewayConfig, DEFAULT_GATEWAY_CONFIG, Message, OutgoingMessage, ChannelConfig, ChannelState } from './types';
import { ChannelManager, getChannelManager } from './channel-manager';
import { GatewayServer, getGatewayServer } from './gateway-server';
import { MessageRouter, getMessageRouter } from './message-router';
import { MediaHandler, getMediaHandler } from './media-handler';
import { getRateLimiter } from './rate-limiter';

/**
 * Unified Messaging Gateway
 */
export class MessagingGateway {
  private channelManager: ChannelManager;
  private gatewayServer: GatewayServer;
  private messageRouter: MessageRouter;
  private mediaHandler: MediaHandler;
  private initialized: boolean = false;
  private messageHandler: ((message: Message) => Promise<OutgoingMessage | null>) | null = null;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.channelManager = getChannelManager();
    this.gatewayServer = getGatewayServer(config);
    this.messageRouter = getMessageRouter();
    this.mediaHandler = getMediaHandler();
  }

  /**
   * Initialize the gateway
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.channelManager.initialize();
    await this.gatewayServer.start();
    this.messageRouter.initialize();

    // Connect gateway server to channel manager
    this.setupGatewayBridge();

    this.initialized = true;
    console.log('[MessagingGateway] Initialized');
  }

  /**
   * Shutdown the gateway
   */
  async shutdown(): Promise<void> {
    await this.channelManager.disconnectAll();
    await this.gatewayServer.stop();
    this.initialized = false;
    console.log('[MessagingGateway] Shutdown complete');
  }

  /**
   * Setup bridge between gateway server and channel manager
   */
  private setupGatewayBridge(): void {
    // Forward messages from gateway to router
    this.gatewayServer.on('message', async (message: Message) => {
      await this.messageRouter.route(message);
    });

    // Forward send requests from gateway
    this.gatewayServer.on('sendRequest', async (message: OutgoingMessage, client, callback) => {
      const result = await this.channelManager.sendMessage(message);
      callback(result);
    });

    // Broadcast channel events to gateway clients
    this.channelManager.on('message', (message: Message) => {
      this.gatewayServer.broadcastToChannel(message.channelId, {
        type: 'message',
        payload: message
      });
    });

    this.channelManager.on('statusChange', (channelId: string, status: string) => {
      this.gatewayServer.broadcastToChannel(channelId, {
        type: 'channelStatus',
        payload: { channelId, status }
      });
    });
  }

  /**
   * Set message handler
   */
  setMessageHandler(handler: (message: Message) => Promise<OutgoingMessage | null>): void {
    this.messageHandler = handler;
    this.messageRouter.setDefaultHandler(handler);
  }

  // Channel management

  addChannel(config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>): ChannelConfig {
    return this.channelManager.addChannel(config);
  }

  updateChannel(channelId: string, updates: Partial<ChannelConfig>): ChannelConfig | null {
    return this.channelManager.updateChannel(channelId, updates);
  }

  async removeChannel(channelId: string): Promise<boolean> {
    return this.channelManager.removeChannel(channelId);
  }

  async connectChannel(channelId: string): Promise<boolean> {
    return this.channelManager.connectChannel(channelId);
  }

  async disconnectChannel(channelId: string): Promise<void> {
    return this.channelManager.disconnectChannel(channelId);
  }

  async connectAllChannels(): Promise<Map<string, boolean>> {
    return this.channelManager.connectAll();
  }

  getChannelState(channelId: string): ChannelState | null {
    return this.channelManager.getChannelState(channelId);
  }

  getAllChannelStates(): ChannelState[] {
    return this.channelManager.getAllStates();
  }

  // Messaging

  async sendMessage(message: OutgoingMessage): Promise<any> {
    return this.channelManager.sendMessage(message);
  }

  async sendText(channelId: string, targetId: string, text: string): Promise<any> {
    return this.messageRouter.send(channelId, targetId, text);
  }

  async reply(originalMessage: Message, text: string): Promise<any> {
    return this.messageRouter.reply(originalMessage, text);
  }

  async react(message: Message, emoji: string): Promise<any> {
    return this.messageRouter.react(message, emoji);
  }

  async setTyping(channelId: string, targetId: string, typing?: boolean): Promise<void> {
    return this.messageRouter.setTyping(channelId, targetId, typing);
  }

  // Media

  async saveMedia(data: Buffer, mimeType: string, filename?: string): Promise<any> {
    return this.mediaHandler.saveFromBuffer(data, mimeType, filename);
  }

  async downloadMedia(url: string): Promise<any> {
    return this.mediaHandler.saveFromUrl(url);
  }

  getMediaFile(id: string) {
    return this.mediaHandler.getFile(id);
  }

  // Routing

  addRoute(config: any): string {
    return this.messageRouter.addRoute(config);
  }

  removeRoute(routeId: string): boolean {
    return this.messageRouter.removeRoute(routeId);
  }

  // Stats

  getStats(): {
    gateway: any;
    channels: any;
    router: any;
    media: any;
  } {
    return {
      gateway: this.gatewayServer.getStats(),
      channels: this.channelManager.getAllStates().length,
      router: this.messageRouter.getStats(),
      media: this.mediaHandler.getStats()
    };
  }

  // Security controls

  /**
   * Enable/disable rate limiting
   */
  setRateLimiting(enabled: boolean): void {
    this.messageRouter.setRateLimiting(enabled);
  }

  /**
   * Enable/disable DM pairing (unknown sender protection)
   */
  setDMPairing(enabled: boolean): void {
    this.messageRouter.setDMPairing(enabled);
  }

  /**
   * Approve a pairing code
   */
  approvePairing(channelType: string, code: string): boolean {
    return this.messageRouter.approvePairing(channelType, code);
  }

  /**
   * Whitelist a sender (bypass rate limits and pairing)
   */
  whitelistSender(senderId: string, channelType?: string): void {
    this.messageRouter.whitelistSender(senderId, channelType);
  }

  /**
   * Block a sender
   */
  blockSender(senderId: string, channelType?: string, durationMs?: number): void {
    this.messageRouter.blockSender(senderId, channelType, durationMs);
  }

  /**
   * Get pending pairing requests
   */
  getPendingPairings(): Array<{ senderId: string; code: string; expires: number }> {
    return this.messageRouter.getPendingPairings();
  }

  /**
   * Get allowed senders
   */
  getAllowedSenders(): string[] {
    return this.messageRouter.getAllowedSenders();
  }

  // Access to underlying components

  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  getGatewayServer(): GatewayServer {
    return this.gatewayServer;
  }

  getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }

  getMediaHandler(): MediaHandler {
    return this.mediaHandler;
  }
}

// Singleton instance
let messagingGatewayInstance: MessagingGateway | null = null;

export function getMessagingGateway(config?: Partial<GatewayConfig>): MessagingGateway {
  if (!messagingGatewayInstance) {
    messagingGatewayInstance = new MessagingGateway(config);
  }
  return messagingGatewayInstance;
}

/**
 * Initialize the messaging gateway
 */
export async function initializeMessagingGateway(config?: Partial<GatewayConfig>): Promise<MessagingGateway> {
  const gateway = getMessagingGateway(config);
  await gateway.initialize();
  return gateway;
}

/**
 * Shutdown the messaging gateway
 */
export async function shutdownMessagingGateway(): Promise<void> {
  if (messagingGatewayInstance) {
    await messagingGatewayInstance.shutdown();
  }
}

export default MessagingGateway;
