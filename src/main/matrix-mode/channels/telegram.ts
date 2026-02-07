/**
 * Matrix Mode Telegram Channel
 * Telegram Bot API integration
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator,
  MediaAttachment
} from '../gateway/types';

// Telegram API types
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: any;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  voice?: any;
  reply_to_message?: TelegramMessage;
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  title?: string;
}

interface TelegramVideo {
  file_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export class TelegramChannel extends BaseChannel {
  private botToken: string = '';
  private apiUrl: string = 'https://api.telegram.org';
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastUpdateId: number = 0;
  private pollingActive: boolean = false;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'telegram' });
    this.botToken = this.getCredential('botToken') || '';
  }

  async doConnect(): Promise<void> {
    if (!this.botToken) {
      throw new Error('Telegram bot token required');
    }

    // Verify bot token
    const me = await this.apiCall('getMe');
    if (!me.ok) {
      throw new Error('Invalid bot token');
    }

    console.log(`[Telegram] Bot connected: @${me.result.username}`);

    // Start polling for updates
    this.startPolling();
  }

  async doDisconnect(): Promise<void> {
    this.stopPolling();
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    const chatId = message.targetId;

    try {
      let result: any;

      // Handle different message types
      if (message.type === 'text' && message.text) {
        result = await this.apiCall('sendMessage', {
          chat_id: chatId,
          text: message.text,
          parse_mode: message.markdown ? 'Markdown' : undefined,
          reply_to_message_id: message.replyTo
        });
      } else if (message.media && message.media.length > 0) {
        result = await this.sendMedia(chatId, message.media[0], message.text);
      } else if (message.type === 'reaction' && message.reaction) {
        result = await this.apiCall('setMessageReaction', {
          chat_id: chatId,
          message_id: message.reaction.messageId,
          reaction: [{ type: 'emoji', emoji: message.reaction.emoji }]
        });
      }

      if (result?.ok) {
        return {
          success: true,
          messageId: result.result?.message_id?.toString(),
          timestamp: Date.now()
        };
      }

      return {
        success: false,
        error: result?.description || 'Unknown error'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async doSetTyping(indicator: TypingIndicator): Promise<void> {
    if (indicator.typing) {
      await this.apiCall('sendChatAction', {
        chat_id: indicator.targetId,
        action: 'typing'
      });
    }
  }

  /**
   * Start long polling for updates
   */
  private startPolling(): void {
    if (this.pollingActive) return;
    this.pollingActive = true;

    const poll = async () => {
      if (!this.pollingActive) return;

      try {
        const updates = await this.apiCall('getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: 30,
          allowed_updates: ['message', 'edited_message']
        });

        if (updates.ok && updates.result.length > 0) {
          for (const update of updates.result) {
            this.lastUpdateId = update.update_id;
            await this.handleUpdate(update);
          }
        }
      } catch (error) {
        console.error('[Telegram] Polling error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Continue polling
      if (this.pollingActive) {
        setImmediate(poll);
      }
    };

    poll();
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    this.pollingActive = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Handle incoming update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const telegramMessage = update.message || update.edited_message;
    if (!telegramMessage) return;

    const message = this.convertMessage(telegramMessage, !!update.edited_message);
    this.emitMessage(message);
  }

  /**
   * Convert Telegram message to internal format
   */
  private convertMessage(msg: TelegramMessage, edited: boolean = false): Message {
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    const message: Message = {
      id: msg.message_id.toString(),
      channelId: this.id,
      channelType: 'telegram',
      senderId: msg.from?.id.toString() || 'unknown',
      senderName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || undefined,
      type: 'text',
      text: msg.text,
      timestamp: msg.date * 1000,
      edited,
      metadata: {
        chatId: msg.chat.id,
        chatType: msg.chat.type
      }
    };

    if (isGroup) {
      message.groupId = msg.chat.id.toString();
      message.groupName = msg.chat.title;
    }

    if (msg.reply_to_message) {
      message.replyTo = msg.reply_to_message.message_id.toString();
    }

    // Handle media
    if (msg.photo) {
      message.type = 'image';
      const largest = msg.photo[msg.photo.length - 1];
      message.media = [{
        type: 'image',
        mimeType: 'image/jpeg',
        width: largest.width,
        height: largest.height,
        size: largest.file_size,
        metadata: { fileId: largest.file_id }
      } as any];
    } else if (msg.document) {
      message.type = 'document';
      message.media = [{
        type: 'document',
        mimeType: msg.document.mime_type || 'application/octet-stream',
        filename: msg.document.file_name,
        size: msg.document.file_size,
        metadata: { fileId: msg.document.file_id }
      } as any];
    } else if (msg.audio) {
      message.type = 'audio';
      message.media = [{
        type: 'audio',
        mimeType: msg.audio.mime_type || 'audio/mpeg',
        duration: msg.audio.duration,
        size: msg.audio.file_size,
        metadata: { fileId: msg.audio.file_id }
      } as any];
    } else if (msg.video) {
      message.type = 'video';
      message.media = [{
        type: 'video',
        mimeType: msg.video.mime_type || 'video/mp4',
        width: msg.video.width,
        height: msg.video.height,
        duration: msg.video.duration,
        size: msg.video.file_size,
        metadata: { fileId: msg.video.file_id }
      } as any];
    }

    return message;
  }

  /**
   * Send media attachment
   */
  private async sendMedia(chatId: string, media: MediaAttachment, caption?: string): Promise<any> {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    
    if (caption) {
      formData.append('caption', caption);
    }

    let method: string;
    let fileField: string;

    switch (media.type) {
      case 'image':
        method = 'sendPhoto';
        fileField = 'photo';
        break;
      case 'audio':
        method = 'sendAudio';
        fileField = 'audio';
        break;
      case 'video':
        method = 'sendVideo';
        fileField = 'video';
        break;
      case 'document':
      default:
        method = 'sendDocument';
        fileField = 'document';
    }

    if (media.url) {
      formData.append(fileField, media.url);
    } else if (media.data) {
      const blob = new Blob([media.data], { type: media.mimeType });
      formData.append(fileField, blob, media.filename || 'file');
    }

    const response = await fetch(`${this.apiUrl}/bot${this.botToken}/${method}`, {
      method: 'POST',
      body: formData
    });

    return response.json();
  }

  /**
   * Make API call to Telegram
   */
  private async apiCall(method: string, params?: Record<string, any>): Promise<any> {
    const url = `${this.apiUrl}/bot${this.botToken}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: params ? JSON.stringify(params) : undefined
    });

    return response.json();
  }

  /**
   * Get file URL from file_id
   */
  async getFileUrl(fileId: string): Promise<string | null> {
    const file = await this.apiCall('getFile', { file_id: fileId });
    if (file.ok && file.result.file_path) {
      return `${this.apiUrl}/file/bot${this.botToken}/${file.result.file_path}`;
    }
    return null;
  }
}

export default TelegramChannel;
