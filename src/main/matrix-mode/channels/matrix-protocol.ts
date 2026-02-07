/**
 * Matrix Mode Matrix Protocol Channel
 * Matrix.org decentralized communication integration
 * Supports E2EE, rooms, and federation
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
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

interface MatrixEvent {
  type: string;
  event_id: string;
  room_id: string;
  sender: string;
  origin_server_ts: number;
  content: {
    msgtype?: string;
    body?: string;
    format?: string;
    formatted_body?: string;
    url?: string;
    info?: {
      mimetype?: string;
      size?: number;
      w?: number;
      h?: number;
      duration?: number;
    };
    'm.relates_to'?: {
      'm.in_reply_to'?: { event_id: string };
      rel_type?: string;
      event_id?: string;
      key?: string;
    };
    membership?: string;
    displayname?: string;
  };
  unsigned?: {
    age: number;
    transaction_id?: string;
  };
}

interface MatrixRoom {
  room_id: string;
  name?: string;
  canonical_alias?: string;
  num_joined_members: number;
  topic?: string;
  is_direct?: boolean;
}

interface SyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, {
      timeline: {
        events: MatrixEvent[];
        prev_batch: string;
      };
      state: {
        events: MatrixEvent[];
      };
      ephemeral?: {
        events: MatrixEvent[];
      };
    }>;
    invite?: Record<string, any>;
    leave?: Record<string, any>;
  };
}

export class MatrixProtocolChannel extends BaseChannel {
  private homeserverUrl: string = '';
  private accessToken: string = '';
  private userId: string = '';
  private deviceId: string = '';
  private syncToken: string = '';
  private syncActive: boolean = false;
  private roomNames: Map<string, string> = new Map();
  private userDisplayNames: Map<string, string> = new Map();
  private txnId: number = 0;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'matrix' });
    this.homeserverUrl = this.getCredential('homeserverUrl') || this.getConfigValue('homeserverUrl', '');
    this.accessToken = this.getCredential('accessToken') || '';
    this.userId = this.getCredential('userId') || this.getConfigValue('userId', '');
    this.deviceId = this.getConfigValue('deviceId', '');
  }

  async doConnect(): Promise<void> {
    if (!this.homeserverUrl) {
      throw new Error('Matrix homeserver URL required');
    }

    // Normalize homeserver URL
    this.homeserverUrl = this.homeserverUrl.replace(/\/$/, '');

    // If we have username/password but no access token, login
    if (!this.accessToken) {
      const username = this.getCredential('username');
      const password = this.getCredential('password');
      
      if (username && password) {
        await this.login(username, password);
      } else {
        throw new Error('Matrix access token or username/password required');
      }
    }

    // Verify token and get user info
    const whoami = await this.matrixRequest('GET', '/_matrix/client/v3/account/whoami');
    this.userId = whoami.user_id;
    this.deviceId = whoami.device_id || this.deviceId;

    console.log(`[Matrix] Connected as ${this.userId}`);

    // Load initial room list
    await this.loadRooms();

    // Start sync loop
    this.startSync();
  }

  async doDisconnect(): Promise<void> {
    this.syncActive = false;
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    try {
      const roomId = message.targetId;
      const txnId = this.getNextTxnId();

      let content: any = {
        msgtype: 'm.text',
        body: message.text || ''
      };

      // Handle markdown
      if (message.markdown && message.text) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = this.markdownToHtml(message.text);
      }

      // Handle media
      if (message.media && message.media.length > 0) {
        const media = message.media[0];
        const mediaResult = await this.uploadMedia(media);
        
        if (mediaResult.content_uri) {
          content = {
            msgtype: this.getMatrixMsgType(media.type),
            body: media.filename || 'file',
            url: mediaResult.content_uri,
            info: {
              mimetype: media.mimeType,
              size: media.size,
              w: media.width,
              h: media.height,
              duration: media.duration ? media.duration * 1000 : undefined
            }
          };
        }
      }

      // Handle reply
      if (message.replyTo) {
        content['m.relates_to'] = {
          'm.in_reply_to': {
            event_id: message.replyTo
          }
        };
      }

      // Handle reactions
      if (message.type === 'reaction' && message.reaction) {
        content = {
          'm.relates_to': {
            rel_type: 'm.annotation',
            event_id: message.reaction.messageId,
            key: message.reaction.emoji
          }
        };

        const result = await this.matrixRequest(
          'PUT',
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txnId}`,
          content
        );

        return {
          success: true,
          messageId: result.event_id,
          timestamp: Date.now()
        };
      }

      const result = await this.matrixRequest(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        content
      );

      return {
        success: true,
        messageId: result.event_id,
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
    try {
      await this.matrixRequest(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(indicator.targetId)}/typing/${encodeURIComponent(this.userId)}`,
        {
          typing: indicator.typing,
          timeout: indicator.typing ? 30000 : undefined
        }
      );
    } catch (error) {
      // Typing indicator failures are non-critical
      console.debug('[Matrix] Typing indicator error:', error);
    }
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<void> {
    const loginData = {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: username
      },
      password: password,
      initial_device_display_name: 'AgentPrime Matrix Mode'
    };

    const result = await this.matrixRequest('POST', '/_matrix/client/v3/login', loginData);
    
    this.accessToken = result.access_token;
    this.userId = result.user_id;
    this.deviceId = result.device_id;
  }

  /**
   * Start sync loop for receiving events
   */
  private startSync(): void {
    if (this.syncActive) return;
    this.syncActive = true;

    const sync = async () => {
      if (!this.syncActive) return;

      try {
        const params = new URLSearchParams({
          timeout: '30000',
          ...(this.syncToken ? { since: this.syncToken } : { filter: JSON.stringify({ room: { timeline: { limit: 10 } } }) })
        });

        const response: SyncResponse = await this.matrixRequest(
          'GET',
          `/_matrix/client/v3/sync?${params}`
        );

        this.syncToken = response.next_batch;

        // Process room events
        if (response.rooms?.join) {
          for (const [roomId, roomData] of Object.entries(response.rooms.join)) {
            // Process state events (room names, membership)
            for (const event of roomData.state.events) {
              this.handleStateEvent(roomId, event);
            }

            // Process timeline events (messages)
            for (const event of roomData.timeline.events) {
              // Skip our own messages
              if (event.sender === this.userId) continue;
              
              if (event.type === 'm.room.message') {
                const message = this.convertEvent(roomId, event);
                this.emitMessage(message);
              }
            }
          }
        }

        // Handle room invites
        if (response.rooms?.invite) {
          for (const roomId of Object.keys(response.rooms.invite)) {
            // Auto-join rooms if configured
            if (this.getConfigValue('autoJoin', false)) {
              await this.joinRoom(roomId);
            }
          }
        }
      } catch (error) {
        console.error('[Matrix] Sync error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Continue sync loop
      if (this.syncActive) {
        setImmediate(sync);
      }
    };

    sync();
  }

  /**
   * Handle state event
   */
  private handleStateEvent(roomId: string, event: MatrixEvent): void {
    if (event.type === 'm.room.name' && event.content.body) {
      this.roomNames.set(roomId, event.content.body);
    } else if (event.type === 'm.room.canonical_alias' && event.content.body) {
      if (!this.roomNames.has(roomId)) {
        this.roomNames.set(roomId, event.content.body);
      }
    } else if (event.type === 'm.room.member' && event.content.displayname) {
      this.userDisplayNames.set(event.sender, event.content.displayname);
    }
  }

  /**
   * Convert Matrix event to internal message
   */
  private convertEvent(roomId: string, event: MatrixEvent): Message {
    const content = event.content;

    const message: Message = {
      id: event.event_id,
      channelId: this.id,
      channelType: 'matrix',
      senderId: event.sender,
      senderName: this.userDisplayNames.get(event.sender),
      groupId: roomId,
      groupName: this.roomNames.get(roomId) || roomId,
      type: 'text',
      text: content.body,
      timestamp: event.origin_server_ts
    };

    // Handle reply
    const replyTo = content['m.relates_to']?.['m.in_reply_to']?.event_id;
    if (replyTo) {
      message.replyTo = replyTo;
      // Strip reply fallback from body
      if (message.text) {
        message.text = message.text.replace(/^>.*\n\n/s, '');
      }
    }

    // Handle media
    switch (content.msgtype) {
      case 'm.image':
        message.type = 'image';
        message.media = [{
          type: 'image',
          mimeType: content.info?.mimetype || 'image/png',
          url: this.mxcToHttp(content.url || ''),
          width: content.info?.w,
          height: content.info?.h,
          size: content.info?.size
        } as any];
        break;

      case 'm.audio':
        message.type = 'audio';
        message.media = [{
          type: 'audio',
          mimeType: content.info?.mimetype || 'audio/ogg',
          url: this.mxcToHttp(content.url || ''),
          duration: content.info?.duration ? content.info.duration / 1000 : undefined,
          size: content.info?.size
        } as any];
        break;

      case 'm.video':
        message.type = 'video';
        message.media = [{
          type: 'video',
          mimeType: content.info?.mimetype || 'video/mp4',
          url: this.mxcToHttp(content.url || ''),
          width: content.info?.w,
          height: content.info?.h,
          duration: content.info?.duration ? content.info.duration / 1000 : undefined,
          size: content.info?.size
        } as any];
        break;

      case 'm.file':
        message.type = 'document';
        message.media = [{
          type: 'document',
          mimeType: content.info?.mimetype || 'application/octet-stream',
          url: this.mxcToHttp(content.url || ''),
          filename: content.body,
          size: content.info?.size
        } as any];
        break;
    }

    return message;
  }

  /**
   * Load room list
   */
  private async loadRooms(): Promise<void> {
    try {
      const rooms = await this.matrixRequest('GET', '/_matrix/client/v3/joined_rooms');
      
      for (const roomId of rooms.joined_rooms || []) {
        try {
          const state = await this.matrixRequest(
            'GET',
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`
          );
          if (state.name) {
            this.roomNames.set(roomId, state.name);
          }
        } catch {
          // Room might not have a name
        }
      }
    } catch (error) {
      console.warn('[Matrix] Failed to load rooms:', error);
    }
  }

  /**
   * Join a room
   */
  async joinRoom(roomIdOrAlias: string): Promise<string> {
    const result = await this.matrixRequest(
      'POST',
      `/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`,
      {}
    );
    return result.room_id;
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string): Promise<void> {
    await this.matrixRequest(
      'POST',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`,
      {}
    );
  }

  /**
   * Create a direct message room
   */
  async createDM(userId: string): Promise<string> {
    const result = await this.matrixRequest('POST', '/_matrix/client/v3/createRoom', {
      is_direct: true,
      invite: [userId],
      preset: 'trusted_private_chat'
    });
    return result.room_id;
  }

  /**
   * Upload media to Matrix content repository
   */
  private async uploadMedia(media: MediaAttachment): Promise<{ content_uri: string }> {
    const filename = media.filename || 'file';
    
    // For URL-based media, we need to download first
    if (media.url && !media.data) {
      const response = await fetch(media.url);
      const buffer = await response.arrayBuffer();
      media.data = Buffer.from(buffer);
    }

    if (!media.data) {
      throw new Error('No media data to upload');
    }

    const url = `${this.homeserverUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`;
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': media.mimeType,
          'Content-Length': media.data!.length
        }
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Upload failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(media.data);
      req.end();
    });
  }

  /**
   * Make Matrix API request
   */
  private async matrixRequest(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${this.homeserverUrl}${path}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {})
        }
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || '{}'));
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`Matrix API error: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * Convert mxc:// URL to HTTP URL
   */
  private mxcToHttp(mxcUrl: string): string {
    if (!mxcUrl.startsWith('mxc://')) return mxcUrl;
    
    const parts = mxcUrl.slice(6).split('/');
    const serverName = parts[0];
    const mediaId = parts[1];
    
    return `${this.homeserverUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;
  }

  /**
   * Get Matrix message type from media type
   */
  private getMatrixMsgType(type: string): string {
    switch (type) {
      case 'image': return 'm.image';
      case 'audio': return 'm.audio';
      case 'video': return 'm.video';
      default: return 'm.file';
    }
  }

  /**
   * Simple markdown to HTML conversion
   */
  private markdownToHtml(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Get next transaction ID
   */
  private getNextTxnId(): string {
    return `m${Date.now()}.${this.txnId++}`;
  }

  /**
   * Get list of joined rooms
   */
  async getJoinedRooms(): Promise<Array<{ id: string; name: string }>> {
    const rooms = await this.matrixRequest('GET', '/_matrix/client/v3/joined_rooms');
    
    return (rooms.joined_rooms || []).map((roomId: string) => ({
      id: roomId,
      name: this.roomNames.get(roomId) || roomId
    }));
  }
}

export default MatrixProtocolChannel;
