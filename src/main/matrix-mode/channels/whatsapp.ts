/**
 * Matrix Mode WhatsApp Channel
 * WhatsApp Web integration via Baileys
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator
} from '../gateway/types';

// Note: Baileys would be dynamically imported when available
// This implementation provides the structure and can work with Baileys

export interface BaileysSocket {
  ev: {
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
  };
  sendMessage(jid: string, content: any, options?: any): Promise<any>;
  sendPresenceUpdate(type: string, jid?: string): Promise<void>;
  logout(): Promise<void>;
  end(error?: Error): void;
  user?: { id: string; name?: string };
}

export interface QRCodeCallback {
  (qr: string): void;
}

export class WhatsAppChannel extends BaseChannel {
  private socket: BaileysSocket | null = null;
  private qrCallback: QRCodeCallback | null = null;
  private authState: any = null;
  private useBaileys: boolean = false;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'whatsapp' });
  }

  /**
   * Set QR code callback for pairing
   */
  setQRCallback(callback: QRCodeCallback): void {
    this.qrCallback = callback;
  }

  async doConnect(): Promise<void> {
    try {
      // Try to import Baileys
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = 
        await import('@whiskeysockets/baileys');
      
      this.useBaileys = true;

      // Load auth state
      const authDir = this.getConfigValue('authDir', './whatsapp-auth');
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      this.authState = { state, saveCreds };

      // Create socket
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: !this.qrCallback,
        browser: ['Matrix Mode', 'Chrome', '1.0.0']
      });

      // Setup event handlers
      this.setupEventHandlers(saveCreds, DisconnectReason);

    } catch (importError) {
      console.warn('[WhatsApp] Baileys not available');
      throw new Error('WhatsApp requires @whiskeysockets/baileys package');
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    if (!this.socket) {
      return { success: false, error: 'Not connected' };
    }

    const jid = this.formatJid(message.targetId);

    try {
      let content: any;

      if (message.type === 'text' && message.text) {
        content = { text: message.text };
        
        // Handle mentions
        if (message.mentions && message.mentions.length > 0) {
          content.mentions = message.mentions.map(m => this.formatJid(m));
        }
      } else if (message.media && message.media.length > 0) {
        const media = message.media[0];
        
        switch (media.type) {
          case 'image':
            content = {
              image: media.url || media.data || { url: media.path },
              caption: message.text,
              mimetype: media.mimeType
            };
            break;
          case 'audio':
            content = {
              audio: media.url || media.data || { url: media.path },
              mimetype: media.mimeType,
              ptt: media.mimeType?.includes('ogg') // Voice note
            };
            break;
          case 'video':
            content = {
              video: media.url || media.data || { url: media.path },
              caption: message.text,
              mimetype: media.mimeType
            };
            break;
          case 'document':
            content = {
              document: media.url || media.data || { url: media.path },
              fileName: media.filename,
              mimetype: media.mimeType
            };
            break;
          case 'sticker':
            content = {
              sticker: media.url || media.data || { url: media.path },
              mimetype: media.mimeType
            };
            break;
        }
      } else if (message.type === 'reaction' && message.reaction) {
        content = {
          react: {
            text: message.reaction.emoji,
            key: { id: message.reaction.messageId, fromMe: false }
          }
        };
      } else if (message.type === 'poll' && message.poll) {
        content = {
          poll: {
            name: message.poll.question,
            values: message.poll.options.map(o => o.text),
            selectableCount: message.poll.multiSelect ? message.poll.options.length : 1
          }
        };
      }

      if (!content) {
        return { success: false, error: 'Invalid message content' };
      }

      const options: any = {};
      
      // Handle reply
      if (message.replyTo) {
        options.quoted = { key: { id: message.replyTo } };
      }

      const sent = await this.socket.sendMessage(jid, content, options);

      return {
        success: true,
        messageId: sent?.key?.id,
        timestamp: Date.now()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async doSetTyping(indicator: TypingIndicator): Promise<void> {
    if (!this.socket) return;

    const jid = this.formatJid(indicator.targetId);
    await this.socket.sendPresenceUpdate(
      indicator.typing ? 'composing' : 'paused',
      jid
    );
  }

  /**
   * Setup Baileys event handlers
   */
  private setupEventHandlers(saveCreds: () => Promise<void>, DisconnectReason: any): void {
    if (!this.socket) return;

    // Credentials update
    this.socket.ev.on('creds.update', saveCreds);

    // Connection update
    this.socket.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.qrCallback) {
        this.qrCallback(qr);
      }

      if (connection === 'close') {
        const shouldReconnect = 
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          this.handleError(new Error('Connection closed'));
        } else {
          this.setStatus('disconnected');
        }
      } else if (connection === 'open') {
        console.log(`[WhatsApp] Connected: ${this.socket?.user?.id}`);
        this.setStatus('connected');
      }
    });

    // Messages
    this.socket.ev.on('messages.upsert', async (update: any) => {
      const { messages, type } = update;
      
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue; // Skip own messages
        
        const message = this.convertMessage(msg);
        if (message) {
          this.emitMessage(message);
        }
      }
    });

    // Presence updates
    this.socket.ev.on('presence.update', (update: any) => {
      const { id, presences } = update;
      
      for (const [jid, presence] of Object.entries(presences || {})) {
        this.emitPresence({
          channelId: this.id,
          userId: this.parseJid(jid),
          status: (presence as any).lastKnownPresence === 'available' ? 'online' : 'offline',
          lastSeen: (presence as any).lastSeen
        });
      }
    });
  }

  /**
   * Convert Baileys message to internal format
   */
  private convertMessage(msg: any): Message | null {
    if (!msg.message) return null;

    const jid = msg.key.remoteJid;
    const isGroup = jid?.endsWith('@g.us');

    const message: Message = {
      id: msg.key.id,
      channelId: this.id,
      channelType: 'whatsapp',
      senderId: this.parseJid(msg.key.participant || jid),
      senderName: msg.pushName,
      type: 'text',
      timestamp: msg.messageTimestamp * 1000,
      metadata: {
        waMessageKey: msg.key
      }
    };

    if (isGroup) {
      message.groupId = this.parseJid(jid);
    }

    // Extract content based on message type
    const content = msg.message;

    if (content.conversation) {
      message.text = content.conversation;
    } else if (content.extendedTextMessage) {
      message.text = content.extendedTextMessage.text;
      if (content.extendedTextMessage.contextInfo?.quotedMessage) {
        message.replyTo = content.extendedTextMessage.contextInfo.stanzaId;
      }
    } else if (content.imageMessage) {
      message.type = 'image';
      message.text = content.imageMessage.caption;
      message.media = [{
        type: 'image',
        mimeType: content.imageMessage.mimetype,
        size: content.imageMessage.fileLength,
        width: content.imageMessage.width,
        height: content.imageMessage.height,
        caption: content.imageMessage.caption
      }];
    } else if (content.audioMessage) {
      message.type = 'audio';
      message.media = [{
        type: 'audio',
        mimeType: content.audioMessage.mimetype,
        size: content.audioMessage.fileLength,
        duration: content.audioMessage.seconds
      }];
    } else if (content.videoMessage) {
      message.type = 'video';
      message.text = content.videoMessage.caption;
      message.media = [{
        type: 'video',
        mimeType: content.videoMessage.mimetype,
        size: content.videoMessage.fileLength,
        duration: content.videoMessage.seconds,
        caption: content.videoMessage.caption
      }];
    } else if (content.documentMessage) {
      message.type = 'document';
      message.media = [{
        type: 'document',
        mimeType: content.documentMessage.mimetype,
        filename: content.documentMessage.fileName,
        size: content.documentMessage.fileLength
      }];
    } else if (content.stickerMessage) {
      message.type = 'image';
      message.media = [{
        type: 'sticker',
        mimeType: content.stickerMessage.mimetype
      }];
    } else if (content.locationMessage) {
      message.type = 'location';
      message.location = {
        latitude: content.locationMessage.degreesLatitude,
        longitude: content.locationMessage.degreesLongitude,
        name: content.locationMessage.name,
        address: content.locationMessage.address
      };
    } else if (content.reactionMessage) {
      // Handle reaction as a special message
      message.type = 'reaction';
      message.reactions = [{
        emoji: content.reactionMessage.text,
        userId: message.senderId,
        timestamp: message.timestamp
      }];
    }

    return message;
  }

  /**
   * Format phone number to JID
   */
  private formatJid(phoneOrJid: string): string {
    if (phoneOrJid.includes('@')) {
      return phoneOrJid;
    }
    // Remove any non-numeric characters
    const cleaned = phoneOrJid.replace(/\D/g, '');
    return `${cleaned}@s.whatsapp.net`;
  }

  /**
   * Parse JID to phone number
   */
  private parseJid(jid: string): string {
    return jid?.split('@')[0] || jid;
  }
}

export default WhatsAppChannel;
