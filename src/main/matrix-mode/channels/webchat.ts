/**
 * Matrix Mode WebChat Channel
 * Browser-based chat interface served via Gateway WebSocket
 * No external dependencies - uses native WebSocket
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator
} from '../gateway/types';
import { EventEmitter } from 'events';

interface WebChatClient {
  id: string;
  ws: any; // WebSocket instance
  userId: string;
  userName: string;
  connectedAt: number;
  lastActivity: number;
  metadata?: Record<string, any>;
}

interface WebChatMessage {
  type: 'message' | 'typing' | 'presence' | 'system' | 'history';
  id?: string;
  userId?: string;
  userName?: string;
  text?: string;
  media?: any[];
  replyTo?: string;
  timestamp?: number;
  typing?: boolean;
  status?: 'online' | 'offline';
}

export class WebChatChannel extends BaseChannel {
  private clients: Map<string, WebChatClient> = new Map();
  private messageHistory: Message[] = [];
  private maxHistorySize: number;
  private allowAnonymous: boolean;
  private requireAuth: boolean;
  private authTokens: Set<string>;
  private gatewayBridge: EventEmitter;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'webchat' });
    this.maxHistorySize = this.getConfigValue('maxHistorySize', 100);
    this.allowAnonymous = this.getConfigValue('allowAnonymous', true);
    this.requireAuth = this.getConfigValue('requireAuth', false);
    this.authTokens = new Set(this.getConfigValue('authTokens', []));
    this.gatewayBridge = new EventEmitter();
  }

  async doConnect(): Promise<void> {
    // WebChat doesn't need to connect to external services
    // It listens for connections from the Gateway WebSocket server
    console.log('[WebChat] Channel ready for connections');
  }

  async doDisconnect(): Promise<void> {
    // Disconnect all clients
    for (const client of this.clients.values()) {
      this.handleClientDisconnect(client.id);
    }
    this.clients.clear();
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    try {
      const targetId = message.targetId;
      
      // If targetId is 'broadcast', send to all clients
      if (targetId === 'broadcast' || targetId === '*') {
        await this.broadcast({
          type: 'message',
          id: this.generateMessageId(),
          userId: 'system',
          userName: 'AgentPrime',
          text: message.text,
          media: message.media,
          replyTo: message.replyTo,
          timestamp: Date.now()
        });
      } else {
        // Send to specific client
        const client = this.clients.get(targetId);
        if (client) {
          await this.sendToClient(client, {
            type: 'message',
            id: this.generateMessageId(),
            userId: 'system',
            userName: 'AgentPrime',
            text: message.text,
            media: message.media,
            replyTo: message.replyTo,
            timestamp: Date.now()
          });
        } else {
          return {
            success: false,
            error: `Client ${targetId} not connected`
          };
        }
      }

      return {
        success: true,
        messageId: this.generateMessageId(),
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async doSetTyping(indicator: TypingIndicator): Promise<void> {
    const client = this.clients.get(indicator.targetId);
    if (client) {
      await this.sendToClient(client, {
        type: 'typing',
        userId: 'system',
        userName: 'AgentPrime',
        typing: indicator.typing
      });
    }
  }

  /**
   * Handle new WebSocket connection from Gateway
   * Called by GatewayServer when a WebChat client connects
   */
  handleConnection(ws: any, connectionInfo: {
    userId?: string;
    userName?: string;
    token?: string;
    metadata?: Record<string, any>;
  }): string | null {
    // Validate auth if required
    if (this.requireAuth) {
      if (!connectionInfo.token || !this.authTokens.has(connectionInfo.token)) {
        ws.close(4001, 'Unauthorized');
        return null;
      }
    }

    // Generate client ID
    const clientId = this.generateClientId();

    // Determine user identity
    let userId: string;
    let userName: string;

    if (connectionInfo.userId) {
      userId = connectionInfo.userId;
      userName = connectionInfo.userName || connectionInfo.userId;
    } else if (this.allowAnonymous) {
      userId = `anon-${clientId.slice(0, 8)}`;
      userName = `Anonymous ${clientId.slice(0, 4).toUpperCase()}`;
    } else {
      ws.close(4002, 'Anonymous connections not allowed');
      return null;
    }

    // Create client
    const client: WebChatClient = {
      id: clientId,
      ws,
      userId,
      userName,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      metadata: connectionInfo.metadata
    };

    this.clients.set(clientId, client);

    // Set up message handler
    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        console.error('[WebChat] Invalid message:', error);
      }
    });

    // Set up close handler
    ws.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    // Set up error handler
    ws.on('error', (error: Error) => {
      console.error(`[WebChat] Client ${clientId} error:`, error);
      this.handleClientDisconnect(clientId);
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'system',
      text: 'Connected to AgentPrime WebChat',
      timestamp: Date.now()
    });

    // Send recent history
    if (this.messageHistory.length > 0) {
      this.sendToClient(client, {
        type: 'history',
        messages: this.messageHistory.slice(-20)
      } as any);
    }

    // Emit presence update
    this.emitPresence({
      channelId: this.id,
      userId,
      status: 'online',
      lastSeen: Date.now()
    });

    // Broadcast join notification
    this.broadcast({
      type: 'presence',
      userId,
      userName,
      status: 'online'
    }, clientId);

    console.log(`[WebChat] Client connected: ${clientId} (${userName})`);

    return clientId;
  }

  /**
   * Handle message from client
   */
  private handleClientMessage(clientId: string, data: WebChatMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();

    switch (data.type) {
      case 'message':
        this.handleIncomingMessage(client, data);
        break;

      case 'typing':
        this.handleTypingIndicator(client, data);
        break;
    }
  }

  /**
   * Handle incoming message from client
   */
  private handleIncomingMessage(client: WebChatClient, data: WebChatMessage): void {
    if (!data.text && (!data.media || data.media.length === 0)) {
      return; // Empty message
    }

    const message: Message = {
      id: data.id || this.generateMessageId(),
      channelId: this.id,
      channelType: 'webchat',
      senderId: client.userId,
      senderName: client.userName,
      type: data.media && data.media.length > 0 ? 'image' : 'text',
      text: data.text,
      media: data.media,
      replyTo: data.replyTo,
      timestamp: Date.now(),
      metadata: {
        clientId: client.id
      }
    };

    // Add to history
    this.addToHistory(message);

    // Emit to message router
    this.emitMessage(message);

    // Echo to other clients
    this.broadcast({
      type: 'message',
      id: message.id,
      userId: client.userId,
      userName: client.userName,
      text: message.text,
      media: message.media,
      replyTo: message.replyTo,
      timestamp: message.timestamp
    }, client.id);
  }

  /**
   * Handle typing indicator from client
   */
  private handleTypingIndicator(client: WebChatClient, data: WebChatMessage): void {
    // Broadcast to other clients
    this.broadcast({
      type: 'typing',
      userId: client.userId,
      userName: client.userName,
      typing: data.typing
    }, client.id);
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);

    // Emit presence update
    this.emitPresence({
      channelId: this.id,
      userId: client.userId,
      status: 'offline',
      lastSeen: Date.now()
    });

    // Broadcast leave notification
    this.broadcast({
      type: 'presence',
      userId: client.userId,
      userName: client.userName,
      status: 'offline'
    });

    console.log(`[WebChat] Client disconnected: ${clientId} (${client.userName})`);
  }

  /**
   * Send message to specific client
   */
  private async sendToClient(client: WebChatClient, message: WebChatMessage): Promise<void> {
    try {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error(`[WebChat] Failed to send to client ${client.id}:`, error);
    }
  }

  /**
   * Broadcast message to all clients except excluded
   */
  private async broadcast(message: WebChatMessage, excludeClientId?: string): Promise<void> {
    for (const client of this.clients.values()) {
      if (client.id !== excludeClientId) {
        await this.sendToClient(client, message);
      }
    }
  }

  /**
   * Add message to history
   */
  private addToHistory(message: Message): void {
    this.messageHistory.push(message);
    
    // Trim history if needed
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `wc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connected clients
   */
  getConnectedClients(): Array<{
    id: string;
    userId: string;
    userName: string;
    connectedAt: number;
    lastActivity: number;
  }> {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      connectedAt: c.connectedAt,
      lastActivity: c.lastActivity
    }));
  }

  /**
   * Get message history
   */
  getMessageHistory(limit: number = 50): Message[] {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Disconnect specific client
   */
  disconnectClient(clientId: string, reason?: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.ws.close(1000, reason || 'Disconnected by server');
      } catch {
        // Already closed
      }
      this.handleClientDisconnect(clientId);
    }
  }

  /**
   * Add auth token
   */
  addAuthToken(token: string): void {
    this.authTokens.add(token);
  }

  /**
   * Remove auth token
   */
  removeAuthToken(token: string): void {
    this.authTokens.delete(token);
  }

  /**
   * Send system message to all clients
   */
  async sendSystemMessage(text: string): Promise<void> {
    await this.broadcast({
      type: 'system',
      text,
      timestamp: Date.now()
    });
  }

  /**
   * Get gateway bridge for integration with GatewayServer
   */
  getGatewayBridge(): EventEmitter {
    return this.gatewayBridge;
  }
}

export default WebChatChannel;
