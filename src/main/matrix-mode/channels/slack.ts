/**
 * Matrix Mode Slack Channel
 * Slack Bolt SDK integration
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator
} from '../gateway/types';

// Slack message event structure
interface SlackMessageEvent {
  type: string;
  subtype?: string;
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  files?: SlackFile[];
  edited?: { user: string; ts: string };
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private: string;
  url_private_download?: string;
  thumb_360?: string;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    image_48?: string;
    display_name?: string;
  };
}

export class SlackChannel extends BaseChannel {
  private botToken: string = '';
  private appToken: string = '';
  private signingSecret: string = '';
  private apiUrl: string = 'https://slack.com/api';
  private socketMode: boolean = false;
  private ws: WebSocket | null = null;
  private userCache: Map<string, SlackUser> = new Map();

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'slack' });
    this.botToken = this.getCredential('botToken') || '';
    this.appToken = this.getCredential('appToken') || '';
    this.signingSecret = this.getCredential('signingSecret') || '';
    this.socketMode = this.getConfigValue('socketMode', true);
  }

  async doConnect(): Promise<void> {
    if (!this.botToken) {
      throw new Error('Slack bot token required');
    }

    // Verify token
    const auth = await this.apiCall('auth.test');
    if (!auth.ok) {
      throw new Error(auth.error || 'Invalid token');
    }

    console.log(`[Slack] Bot connected: ${auth.user}`);

    // Connect via Socket Mode if app token provided
    if (this.appToken && this.socketMode) {
      await this.connectSocketMode();
    } else {
      console.warn('[Slack] Running without Socket Mode - use webhooks for events');
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    const channelId = message.targetId;

    try {
      const payload: any = {
        channel: channelId,
        text: message.text || ''
      };

      // Handle threading
      if (message.threadId) {
        payload.thread_ts = message.threadId;
      }

      // Handle reply
      if (message.replyTo) {
        payload.thread_ts = message.replyTo;
      }

      // Handle blocks/rich formatting
      if (message.metadata?.blocks) {
        payload.blocks = message.metadata.blocks;
      }

      // Handle attachments/files
      if (message.media && message.media.length > 0) {
        // Upload files first
        for (const media of message.media) {
          if (media.data || media.path) {
            await this.uploadFile(channelId, media);
          }
        }
      }

      // Send message
      const result = await this.apiCall('chat.postMessage', payload);

      if (result.ok) {
        return {
          success: true,
          messageId: result.ts,
          timestamp: parseFloat(result.ts) * 1000
        };
      }

      return {
        success: false,
        error: result.error || 'Unknown error'
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async doSetTyping(indicator: TypingIndicator): Promise<void> {
    // Slack doesn't have a direct typing indicator API
    // But we can use the RTM API if connected
  }

  /**
   * Connect via Socket Mode
   */
  private async connectSocketMode(): Promise<void> {
    // Get WebSocket URL
    const connection = await fetch(`${this.apiUrl}/apps.connections.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.appToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(r => r.json());

    if (!connection.ok) {
      throw new Error(connection.error || 'Failed to open connection');
    }

    // Connect WebSocket
    this.ws = new WebSocket(connection.url);

    this.ws.onopen = () => {
      console.log('[Slack] Socket Mode connected');
    };

    this.ws.onmessage = (event) => {
      this.handleSocketMessage(JSON.parse(event.data));
    };

    this.ws.onerror = (error) => {
      console.error('[Slack] Socket error:', error);
    };

    this.ws.onclose = () => {
      console.log('[Slack] Socket closed');
      // Reconnect after delay
      setTimeout(() => this.connectSocketMode(), 5000);
    };
  }

  /**
   * Handle Socket Mode message
   */
  private async handleSocketMessage(data: any): Promise<void> {
    // Acknowledge the message
    if (data.envelope_id) {
      this.ws?.send(JSON.stringify({ envelope_id: data.envelope_id }));
    }

    if (data.type === 'events_api') {
      const event = data.payload?.event;
      if (event?.type === 'message' && !event.subtype) {
        await this.handleMessage(event);
      }
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(event: SlackMessageEvent): Promise<void> {
    // Get user info
    const user = await this.getUser(event.user);
    
    const message = this.convertMessage(event, user);
    this.emitMessage(message);
  }

  /**
   * Convert Slack message to internal format
   */
  private convertMessage(event: SlackMessageEvent, user?: SlackUser): Message {
    const message: Message = {
      id: event.ts,
      channelId: this.id,
      channelType: 'slack',
      senderId: event.user,
      senderName: user?.real_name || user?.name || event.user,
      senderAvatar: user?.profile?.image_48,
      type: 'text',
      text: event.text,
      timestamp: parseFloat(event.ts) * 1000,
      edited: !!event.edited,
      metadata: {
        slackChannel: event.channel
      }
    };

    // Determine if DM or channel
    if (event.channel.startsWith('D')) {
      // Direct message
    } else {
      // Channel or group
      message.groupId = event.channel;
    }

    // Handle threads
    if (event.thread_ts && event.thread_ts !== event.ts) {
      message.threadId = event.thread_ts;
      message.replyTo = event.thread_ts;
    }

    // Handle files
    if (event.files && event.files.length > 0) {
      message.media = event.files.map(file => {
        let type: 'image' | 'audio' | 'video' | 'document' = 'document';
        if (file.mimetype?.startsWith('image/')) type = 'image';
        else if (file.mimetype?.startsWith('audio/')) type = 'audio';
        else if (file.mimetype?.startsWith('video/')) type = 'video';

        return {
          type,
          url: file.url_private,
          mimeType: file.mimetype,
          filename: file.name,
          size: file.size
        };
      });

      if (message.media.length > 0) {
        message.type = message.media[0].type;
      }
    }

    return message;
  }

  /**
   * Get user info with caching
   */
  private async getUser(userId: string): Promise<SlackUser | undefined> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }

    const result = await this.apiCall('users.info', { user: userId });
    if (result.ok && result.user) {
      this.userCache.set(userId, result.user);
      return result.user;
    }

    return undefined;
  }

  /**
   * Upload a file
   */
  private async uploadFile(channelId: string, media: any): Promise<any> {
    const formData = new FormData();
    formData.append('channels', channelId);
    
    if (media.filename) {
      formData.append('filename', media.filename);
    }

    if (media.data) {
      const blob = new Blob([media.data], { type: media.mimeType });
      formData.append('file', blob, media.filename || 'file');
    }

    const response = await fetch(`${this.apiUrl}/files.upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`
      },
      body: formData
    });

    return response.json();
  }

  /**
   * Make Slack API call
   */
  private async apiCall(method: string, params?: Record<string, any>): Promise<any> {
    const url = `${this.apiUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: params ? JSON.stringify(params) : undefined
    });

    return response.json();
  }

  /**
   * Create Block Kit blocks
   */
  static createBlocks(sections: Array<{
    type: 'section' | 'divider' | 'header' | 'context' | 'actions';
    text?: string;
    accessory?: any;
    elements?: any[];
  }>) {
    return sections.map(section => {
      if (section.type === 'divider') {
        return { type: 'divider' };
      }
      
      if (section.type === 'header') {
        return {
          type: 'header',
          text: { type: 'plain_text', text: section.text || '' }
        };
      }

      if (section.type === 'section') {
        const block: any = {
          type: 'section',
          text: { type: 'mrkdwn', text: section.text || '' }
        };
        if (section.accessory) {
          block.accessory = section.accessory;
        }
        return block;
      }

      if (section.type === 'context') {
        return {
          type: 'context',
          elements: section.elements || [
            { type: 'mrkdwn', text: section.text || '' }
          ]
        };
      }

      if (section.type === 'actions') {
        return {
          type: 'actions',
          elements: section.elements || []
        };
      }

      return section;
    });
  }
}

export default SlackChannel;
