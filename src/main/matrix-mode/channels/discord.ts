/**
 * Matrix Mode Discord Channel
 * Discord.js bot integration
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator
} from '../gateway/types';

// Note: Actual Discord.js client would be dynamically imported
// This is a stub implementation that can be connected to discord.js

export interface DiscordClientLike {
  login(token: string): Promise<string>;
  destroy(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
  user?: { tag: string };
  channels: {
    cache: Map<string, any>;
    fetch(id: string): Promise<any>;
  };
}

export class DiscordChannel extends BaseChannel {
  private token: string = '';
  private client: DiscordClientLike | null = null;
  private useDiscordJs: boolean = false;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'discord' });
    this.token = this.getCredential('token') || '';
  }

  async doConnect(): Promise<void> {
    if (!this.token) {
      throw new Error('Discord bot token required');
    }

    try {
      // Try to dynamically import discord.js
      const { Client, GatewayIntentBits } = await import('discord.js');
      
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      this.useDiscordJs = true;
      this.setupEventHandlers();

      await this.client.login(this.token);
      console.log(`[Discord] Bot connected: ${this.client.user?.tag}`);
    } catch (importError) {
      // discord.js not available, use webhook-only mode
      console.warn('[Discord] discord.js not available, using webhook-only mode');
      this.useDiscordJs = false;
      
      // Verify token via API
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${this.token}` }
      });
      
      if (!response.ok) {
        throw new Error('Invalid Discord token');
      }

      const user = await response.json();
      console.log(`[Discord] Connected (API mode): ${user.username}#${user.discriminator}`);
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.client && this.useDiscordJs) {
      await this.client.destroy();
      this.client = null;
    }
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    const channelId = message.targetId;

    try {
      if (this.useDiscordJs && this.client) {
        // Use discord.js
        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !('send' in channel)) {
          return { success: false, error: 'Channel not found or not text channel' };
        }

        const options: any = {};

        if (message.text) {
          options.content = message.text;
        }

        if (message.replyTo) {
          options.reply = { messageReference: message.replyTo };
        }

        if (message.media && message.media.length > 0) {
          options.files = message.media.map(m => ({
            attachment: m.url || m.path || m.data,
            name: m.filename
          }));
        }

        const sent = await (channel as any).send(options);
        return {
          success: true,
          messageId: sent.id,
          timestamp: sent.createdTimestamp
        };
      } else {
        // Use REST API
        const body: any = {};
        
        if (message.text) {
          body.content = message.text;
        }

        if (message.replyTo) {
          body.message_reference = { message_id: message.replyTo };
        }

        // Handle embeds if needed
        if (message.metadata?.embeds) {
          body.embeds = message.metadata.embeds;
        }

        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const error = await response.json();
          return { success: false, error: error.message || 'API error' };
        }

        const sent = await response.json();
        return {
          success: true,
          messageId: sent.id,
          timestamp: new Date(sent.timestamp).getTime()
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async doSetTyping(indicator: TypingIndicator): Promise<void> {
    if (!indicator.typing) return;

    if (this.useDiscordJs && this.client) {
      const channel = await this.client.channels.fetch(indicator.targetId);
      if (channel && 'sendTyping' in channel) {
        await (channel as any).sendTyping();
      }
    } else {
      await fetch(`https://discord.com/api/v10/channels/${indicator.targetId}/typing`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.token}` }
      });
    }
  }

  /**
   * Setup event handlers for discord.js client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('messageCreate', (msg: any) => {
      // Ignore bot messages
      if (msg.author.bot) return;

      const message = this.convertMessage(msg);
      this.emitMessage(message);
    });

    this.client.on('messageUpdate', (oldMsg: any, newMsg: any) => {
      if (newMsg.author?.bot) return;

      const message = this.convertMessage(newMsg, true);
      this.emitMessage(message);
    });

    this.client.on('presenceUpdate', (oldPresence: any, newPresence: any) => {
      if (newPresence?.user) {
        this.emitPresence({
          channelId: this.id,
          userId: newPresence.user.id,
          status: newPresence.status || 'offline',
          lastSeen: Date.now()
        });
      }
    });

    this.client.on('error', (error: Error) => {
      console.error('[Discord] Client error:', error);
      this.handleError(error);
    });

    this.client.on('disconnect', () => {
      this.setStatus('disconnected');
    });
  }

  /**
   * Convert Discord message to internal format
   */
  private convertMessage(msg: any, edited: boolean = false): Message {
    const isGuild = !!msg.guild;

    const message: Message = {
      id: msg.id,
      channelId: this.id,
      channelType: 'discord',
      senderId: msg.author.id,
      senderName: msg.author.username,
      senderAvatar: msg.author.displayAvatarURL?.() || msg.author.avatar,
      type: 'text',
      text: msg.content,
      timestamp: msg.createdTimestamp || Date.now(),
      edited,
      metadata: {
        discordChannelId: msg.channel.id,
        guildId: msg.guild?.id
      }
    };

    if (isGuild) {
      message.groupId = msg.channel.id;
      message.groupName = msg.channel.name;
    }

    if (msg.reference?.messageId) {
      message.replyTo = msg.reference.messageId;
    }

    // Handle attachments
    if (msg.attachments?.size > 0) {
      message.media = Array.from(msg.attachments.values()).map((att: any) => {
        let type: 'image' | 'audio' | 'video' | 'document' = 'document';
        if (att.contentType?.startsWith('image/')) type = 'image';
        else if (att.contentType?.startsWith('audio/')) type = 'audio';
        else if (att.contentType?.startsWith('video/')) type = 'video';

        return {
          type,
          url: att.url,
          mimeType: att.contentType || 'application/octet-stream',
          filename: att.name,
          size: att.size,
          width: att.width,
          height: att.height
        };
      });

      if (message.media.length > 0) {
        message.type = message.media[0].type;
      }
    }

    return message;
  }

  /**
   * Create a Discord embed
   */
  static createEmbed(options: {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    thumbnail?: string;
    image?: string;
    footer?: string;
  }) {
    const embed: any = {};
    
    if (options.title) embed.title = options.title;
    if (options.description) embed.description = options.description;
    if (options.color) embed.color = options.color;
    if (options.fields) embed.fields = options.fields;
    if (options.thumbnail) embed.thumbnail = { url: options.thumbnail };
    if (options.image) embed.image = { url: options.image };
    if (options.footer) embed.footer = { text: options.footer };

    return embed;
  }
}

export default DiscordChannel;
