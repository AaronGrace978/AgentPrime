/**
 * Matrix Mode Channel Manager
 * Manages channel registration, lifecycle, and message routing
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
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
} from './types';

// Generate unique ID
function generateId(): string {
  return `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export type MessageHandler = (message: Message) => Promise<void>;
export type ChannelFactory = (config: ChannelConfig) => Channel;

export class ChannelManager extends EventEmitter {
  private channels: Map<string, Channel> = new Map();
  private configs: Map<string, ChannelConfig> = new Map();
  private factories: Map<ChannelType, ChannelFactory> = new Map();
  private messageHandlers: MessageHandler[] = [];
  private configPath: string;
  private autoReconnect: boolean = true;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(configPath?: string) {
    super();
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.configPath = configPath || path.join(userDataPath, 'matrix-channels.json');
  }

  /**
   * Initialize the channel manager
   */
  async initialize(): Promise<void> {
    await this.loadConfigs();
    console.log(`[ChannelManager] Initialized with ${this.configs.size} channel configs`);
  }

  /**
   * Register a channel factory
   */
  registerFactory(type: ChannelType, factory: ChannelFactory): void {
    this.factories.set(type, factory);
    console.log(`[ChannelManager] Registered factory for: ${type}`);
  }

  /**
   * Load channel configs from disk
   */
  private async loadConfigs(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const configs: ChannelConfig[] = JSON.parse(data);
        
        for (const config of configs) {
          this.configs.set(config.id, config);
        }
      }
    } catch (error) {
      console.warn('[ChannelManager] Failed to load configs:', error);
    }
  }

  /**
   * Save channel configs to disk
   */
  private async saveConfigs(): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Don't save credentials to disk directly
      const sanitizedConfigs = Array.from(this.configs.values()).map(config => ({
        ...config,
        credentials: undefined // Credentials should be in secure storage
      }));

      fs.writeFileSync(this.configPath, JSON.stringify(sanitizedConfigs, null, 2));
    } catch (error) {
      console.error('[ChannelManager] Failed to save configs:', error);
    }
  }

  /**
   * Add a channel configuration
   */
  addChannel(config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>): ChannelConfig {
    const fullConfig: ChannelConfig = {
      ...config,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.configs.set(fullConfig.id, fullConfig);
    this.saveConfigs();

    console.log(`[ChannelManager] Added channel: ${fullConfig.name} (${fullConfig.type})`);
    return fullConfig;
  }

  /**
   * Update a channel configuration
   */
  updateChannel(channelId: string, updates: Partial<ChannelConfig>): ChannelConfig | null {
    const config = this.configs.get(channelId);
    if (!config) return null;

    const updated: ChannelConfig = {
      ...config,
      ...updates,
      id: channelId,
      updatedAt: Date.now()
    };

    this.configs.set(channelId, updated);
    this.saveConfigs();

    return updated;
  }

  /**
   * Remove a channel
   */
  async removeChannel(channelId: string): Promise<boolean> {
    // Disconnect if connected
    await this.disconnectChannel(channelId);
    
    this.channels.delete(channelId);
    const deleted = this.configs.delete(channelId);
    
    if (deleted) {
      this.saveConfigs();
      console.log(`[ChannelManager] Removed channel: ${channelId}`);
    }
    
    return deleted;
  }

  /**
   * Get channel configuration
   */
  getConfig(channelId: string): ChannelConfig | undefined {
    return this.configs.get(channelId);
  }

  /**
   * Get all channel configurations
   */
  getAllConfigs(): ChannelConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get enabled channel configurations
   */
  getEnabledConfigs(): ChannelConfig[] {
    return this.getAllConfigs().filter(c => c.enabled);
  }

  /**
   * Connect a channel
   */
  async connectChannel(channelId: string): Promise<boolean> {
    const config = this.configs.get(channelId);
    if (!config) {
      console.error(`[ChannelManager] Config not found: ${channelId}`);
      return false;
    }

    if (!config.enabled) {
      console.warn(`[ChannelManager] Channel disabled: ${channelId}`);
      return false;
    }

    // Check if already connected
    const existing = this.channels.get(channelId);
    if (existing && existing.getStatus() === 'connected') {
      return true;
    }

    // Get factory for channel type
    const factory = this.factories.get(config.type);
    if (!factory) {
      console.error(`[ChannelManager] No factory for type: ${config.type}`);
      return false;
    }

    try {
      // Create channel instance
      const channel = factory(config);
      
      // Set up event handlers
      this.setupChannelHandlers(channel, config);
      
      // Connect
      await channel.connect();
      
      // Store channel
      this.channels.set(channelId, channel);
      
      console.log(`[ChannelManager] Connected channel: ${config.name}`);
      this.emit('channelConnected', channelId, config);
      
      return true;
    } catch (error: any) {
      console.error(`[ChannelManager] Failed to connect ${config.name}:`, error);
      this.emit('channelError', channelId, error);
      
      // Schedule reconnect if enabled
      if (this.autoReconnect) {
        this.scheduleReconnect(channelId);
      }
      
      return false;
    }
  }

  /**
   * Disconnect a channel
   */
  async disconnectChannel(channelId: string): Promise<void> {
    // Cancel any pending reconnect
    const timer = this.reconnectTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(channelId);
    }

    const channel = this.channels.get(channelId);
    if (channel) {
      try {
        channel.removeAllListeners();
        await channel.disconnect();
      } catch (error) {
        console.warn(`[ChannelManager] Error disconnecting ${channelId}:`, error);
      }
      
      this.channels.delete(channelId);
      this.emit('channelDisconnected', channelId);
    }
  }

  /**
   * Connect all enabled channels
   */
  async connectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const config of this.getEnabledConfigs()) {
      const success = await this.connectChannel(config.id);
      results.set(config.id, success);
    }
    
    return results;
  }

  /**
   * Disconnect all channels
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.channels.keys()).map(id => 
      this.disconnectChannel(id)
    );
    await Promise.all(promises);
  }

  /**
   * Setup event handlers for a channel
   */
  private setupChannelHandlers(channel: Channel, config: ChannelConfig): void {
    // Message handler
    channel.onMessage(async (message) => {
      // Check allow/block lists
      if (!this.isMessageAllowed(message, config)) {
        return;
      }

      // Emit message event
      this.emit('message', message);

      // Call registered handlers
      for (const handler of this.messageHandlers) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`[ChannelManager] Message handler error:`, error);
        }
      }
    });

    // Status change handler
    channel.onStatusChange((status) => {
      this.emit('statusChange', config.id, status);

      if (status === 'disconnected' || status === 'error') {
        if (this.autoReconnect) {
          this.scheduleReconnect(config.id);
        }
      }
    });

    // Presence handler
    channel.onPresence((update) => {
      this.emit('presence', update);
    });
  }

  /**
   * Check if a message is allowed based on config
   */
  private isMessageAllowed(message: Message, config: ChannelConfig): boolean {
    // Check block list first
    if (config.blockFrom && config.blockFrom.length > 0) {
      if (config.blockFrom.includes(message.senderId)) {
        return false;
      }
    }

    // Check allow list
    if (config.allowFrom && config.allowFrom.length > 0) {
      if (!config.allowFrom.includes(message.senderId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Schedule a reconnect attempt
   */
  private scheduleReconnect(channelId: string, delay: number = 5000): void {
    // Clear any existing timer
    const existing = this.reconnectTimers.get(channelId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(channelId);
      console.log(`[ChannelManager] Attempting reconnect: ${channelId}`);
      await this.connectChannel(channelId);
    }, delay);

    this.reconnectTimers.set(channelId, timer);
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Remove a message handler
   */
  removeMessageHandler(handler: MessageHandler): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index >= 0) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * Send a message through a channel
   */
  async sendMessage(message: OutgoingMessage): Promise<MessageResult> {
    const channel = this.channels.get(message.channelId);
    if (!channel) {
      return {
        success: false,
        error: 'Channel not connected'
      };
    }

    try {
      return await channel.send(message);
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send typing indicator
   */
  async setTyping(indicator: TypingIndicator): Promise<void> {
    const channel = this.channels.get(indicator.channelId);
    if (channel) {
      await channel.setTyping(indicator);
    }
  }

  /**
   * Get channel status
   */
  getChannelStatus(channelId: string): ChannelStatus {
    const channel = this.channels.get(channelId);
    return channel?.getStatus() || 'disconnected';
  }

  /**
   * Get channel state
   */
  getChannelState(channelId: string): ChannelState | null {
    const channel = this.channels.get(channelId);
    const config = this.configs.get(channelId);
    
    if (!config) return null;

    if (channel) {
      return channel.getState();
    }

    return {
      config,
      status: 'disconnected',
      messageCount: 0
    };
  }

  /**
   * Get all channel states
   */
  getAllStates(): ChannelState[] {
    return Array.from(this.configs.values()).map(config => {
      const channel = this.channels.get(config.id);
      if (channel) {
        return channel.getState();
      }
      return {
        config,
        status: 'disconnected' as ChannelStatus,
        messageCount: 0
      };
    });
  }

  /**
   * Get connected channels
   */
  getConnectedChannels(): Channel[] {
    return Array.from(this.channels.values()).filter(
      c => c.getStatus() === 'connected'
    );
  }

  /**
   * Enable/disable auto-reconnect
   */
  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    
    if (!enabled) {
      // Clear all pending reconnects
      for (const timer of this.reconnectTimers.values()) {
        clearTimeout(timer);
      }
      this.reconnectTimers.clear();
    }
  }
}

// Singleton instance
let channelManagerInstance: ChannelManager | null = null;

export function getChannelManager(): ChannelManager {
  if (!channelManagerInstance) {
    channelManagerInstance = new ChannelManager();
  }
  return channelManagerInstance;
}

export default ChannelManager;
