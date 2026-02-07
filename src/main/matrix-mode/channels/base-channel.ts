/**
 * Matrix Mode Base Channel
 * Abstract base class for all channel implementations
 */

import { EventEmitter } from 'events';
import {
  Channel,
  ChannelConfig,
  ChannelState,
  ChannelStatus,
  ChannelType,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator,
  PresenceUpdate
} from '../gateway/types';

export abstract class BaseChannel extends EventEmitter implements Channel {
  readonly id: string;
  readonly type: ChannelType;
  protected config: ChannelConfig;
  protected status: ChannelStatus = 'disconnected';
  protected error?: string;
  protected connectedAt?: number;
  protected lastMessageAt?: number;
  protected messageCount: number = 0;
  protected reconnectAttempts: number = 0;
  protected maxReconnectAttempts: number = 10;
  protected reconnectDelay: number = 5000;

  constructor(config: ChannelConfig) {
    super();
    this.id = config.id;
    this.type = config.type;
    this.config = config;
    this.maxReconnectAttempts = config.settings?.maxReconnectAttempts || 10;
    this.reconnectDelay = config.settings?.reconnectDelay || 5000;
  }

  // Abstract methods to implement
  abstract doConnect(): Promise<void>;
  abstract doDisconnect(): Promise<void>;
  abstract doSend(message: OutgoingMessage): Promise<MessageResult>;
  abstract doSetTyping(indicator: TypingIndicator): Promise<void>;

  /**
   * Connect to the channel
   */
  async connect(): Promise<void> {
    if (this.status === 'connected') return;

    this.setStatus('connecting');

    try {
      await this.doConnect();
      this.connectedAt = Date.now();
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      console.log(`[${this.type}] Connected: ${this.config.name}`);
    } catch (error: any) {
      this.error = error.message;
      this.setStatus('error');
      console.error(`[${this.type}] Connection failed:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from the channel
   */
  async disconnect(): Promise<void> {
    if (this.status === 'disconnected') return;

    try {
      await this.doDisconnect();
    } finally {
      this.connectedAt = undefined;
      this.setStatus('disconnected');
      console.log(`[${this.type}] Disconnected: ${this.config.name}`);
    }
  }

  /**
   * Reconnect to the channel
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Get current status
   */
  getStatus(): ChannelStatus {
    return this.status;
  }

  /**
   * Get full state
   */
  getState(): ChannelState {
    return {
      config: this.config,
      status: this.status,
      error: this.error,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      messageCount: this.messageCount
    };
  }

  /**
   * Send a message
   */
  async send(message: OutgoingMessage): Promise<MessageResult> {
    if (this.status !== 'connected') {
      return {
        success: false,
        error: 'Channel not connected'
      };
    }

    try {
      const result = await this.doSend(message);
      if (result.success) {
        this.messageCount++;
        this.lastMessageAt = Date.now();
      }
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set typing indicator
   */
  async setTyping(indicator: TypingIndicator): Promise<void> {
    if (this.status !== 'connected') return;
    await this.doSetTyping(indicator);
  }

  /**
   * Register message handler
   */
  onMessage(handler: (message: Message) => void): void {
    this.on('message', handler);
  }

  /**
   * Register status change handler
   */
  onStatusChange(handler: (status: ChannelStatus) => void): void {
    this.on('statusChange', handler);
  }

  /**
   * Register presence handler
   */
  onPresence(handler: (update: PresenceUpdate) => void): void {
    this.on('presence', handler);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    super.removeAllListeners();
  }

  /**
   * Update status and emit event
   */
  protected setStatus(status: ChannelStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChange', status);
    }
  }

  /**
   * Emit a received message
   */
  protected emitMessage(message: Message): void {
    this.messageCount++;
    this.lastMessageAt = Date.now();
    this.emit('message', message);
  }

  /**
   * Emit presence update
   */
  protected emitPresence(update: PresenceUpdate): void {
    this.emit('presence', update);
  }

  /**
   * Handle connection error with retry
   */
  protected async handleError(error: Error): Promise<void> {
    this.error = error.message;
    this.setStatus('error');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`[${this.type}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        await this.connect();
      } catch {
        // Will be handled by next call
      }
    }
  }

  /**
   * Get config value
   */
  protected getConfigValue<T>(key: string, defaultValue: T): T {
    return this.config.settings?.[key] ?? defaultValue;
  }

  /**
   * Get credential
   */
  protected getCredential(key: string): string | undefined {
    return this.config.credentials?.[key];
  }

  /**
   * Generate message ID
   */
  protected generateMessageId(): string {
    return `${this.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default BaseChannel;
