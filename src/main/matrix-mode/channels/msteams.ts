/**
 * Matrix Mode Microsoft Teams Channel
 * Teams Bot Framework integration
 * Supports direct messages and team channels
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
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';

interface TeamsActivity {
  type: string;
  id: string;
  timestamp: string;
  localTimestamp?: string;
  serviceUrl: string;
  channelId: string;
  from: {
    id: string;
    name?: string;
    aadObjectId?: string;
  };
  conversation: {
    id: string;
    name?: string;
    conversationType?: string;
    isGroup?: boolean;
    tenantId?: string;
  };
  recipient: {
    id: string;
    name?: string;
  };
  text?: string;
  textFormat?: string;
  attachments?: TeamsAttachment[];
  entities?: any[];
  replyToId?: string;
  value?: any;
  channelData?: {
    teamsChannelId?: string;
    teamsTeamId?: string;
    channel?: { id: string; name?: string };
    team?: { id: string; name?: string };
  };
}

interface TeamsAttachment {
  contentType: string;
  contentUrl?: string;
  content?: any;
  name?: string;
  thumbnailUrl?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class MSTeamsChannel extends BaseChannel {
  private appId: string = '';
  private appPassword: string = '';
  private accessToken: string = '';
  private tokenExpiry: number = 0;
  private server: http.Server | null = null;
  private port: number;
  private serviceUrls: Map<string, string> = new Map();

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'msteams' });
    this.appId = this.getCredential('appId') || '';
    this.appPassword = this.getCredential('appPassword') || '';
    this.port = this.getConfigValue('webhookPort', 3978);
  }

  async doConnect(): Promise<void> {
    if (!this.appId || !this.appPassword) {
      throw new Error('Microsoft Teams App ID and App Password required');
    }

    // Get initial access token
    await this.refreshToken();

    // Start webhook server for receiving messages
    await this.startWebhookServer();

    console.log(`[MSTeams] Bot connected, webhook listening on port ${this.port}`);
  }

  async doDisconnect(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    try {
      await this.ensureToken();

      const serviceUrl = this.serviceUrls.get(message.channelId) || 'https://smba.trafficmanager.net/amer/';
      const conversationId = message.targetId;

      const activity: Partial<TeamsActivity> = {
        type: 'message',
        text: message.text,
        textFormat: message.markdown ? 'markdown' : 'plain'
      };

      // Add attachments
      if (message.media && message.media.length > 0) {
        activity.attachments = message.media.map(m => this.convertAttachment(m));
      }

      // Add reply
      if (message.replyTo) {
        activity.replyToId = message.replyTo;
      }

      const result = await this.sendActivity(serviceUrl, conversationId, activity);

      return {
        success: true,
        messageId: result.id,
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
    if (!indicator.typing) return;

    try {
      await this.ensureToken();

      const serviceUrl = this.serviceUrls.get(indicator.channelId) || 'https://smba.trafficmanager.net/amer/';
      
      await this.sendActivity(serviceUrl, indicator.targetId, {
        type: 'typing'
      });
    } catch (error) {
      // Typing indicator failures are non-critical
      console.debug('[MSTeams] Typing indicator error:', error);
    }
  }

  /**
   * Start webhook server for receiving messages
   */
  private async startWebhookServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/api/messages') {
          await this.handleWebhook(req, res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.server.on('error', reject);

      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  /**
   * Handle incoming webhook
   */
  private async handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Verify authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !await this.verifyToken(authHeader)) {
          res.writeHead(401);
          res.end('Unauthorized');
          return;
        }

        const activity: TeamsActivity = JSON.parse(body);

        // Store service URL for replies
        if (activity.serviceUrl) {
          this.serviceUrls.set(this.id, activity.serviceUrl);
        }

        // Handle the activity
        await this.handleActivity(activity);

        res.writeHead(200);
        res.end();
      } catch (error) {
        console.error('[MSTeams] Webhook error:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
  }

  /**
   * Handle incoming activity
   */
  private async handleActivity(activity: TeamsActivity): Promise<void> {
    switch (activity.type) {
      case 'message':
        const message = this.convertActivity(activity);
        this.emitMessage(message);
        break;

      case 'conversationUpdate':
        // Handle member added/removed
        break;

      case 'messageReaction':
        // Handle reactions
        break;
    }
  }

  /**
   * Convert Teams activity to internal message
   */
  private convertActivity(activity: TeamsActivity): Message {
    const isGroup = activity.conversation.isGroup || 
                    activity.conversation.conversationType === 'channel';

    const message: Message = {
      id: activity.id,
      channelId: this.id,
      channelType: 'msteams',
      senderId: activity.from.id,
      senderName: activity.from.name,
      type: 'text',
      text: this.stripMentions(activity.text || ''),
      timestamp: new Date(activity.timestamp).getTime(),
      metadata: {
        serviceUrl: activity.serviceUrl,
        conversationId: activity.conversation.id,
        tenantId: activity.conversation.tenantId
      }
    };

    if (isGroup) {
      message.groupId = activity.conversation.id;
      message.groupName = activity.conversation.name || 
                          activity.channelData?.channel?.name ||
                          activity.channelData?.team?.name;
    }

    if (activity.replyToId) {
      message.replyTo = activity.replyToId;
    }

    // Handle attachments
    if (activity.attachments && activity.attachments.length > 0) {
      message.media = activity.attachments
        .filter(a => a.contentUrl)
        .map(a => ({
          type: this.getMediaType(a.contentType),
          mimeType: a.contentType,
          url: a.contentUrl,
          filename: a.name
        } as any));

      if (message.media.length > 0) {
        message.type = message.media[0].type as any;
      }
    }

    return message;
  }

  /**
   * Strip @mentions from message text
   */
  private stripMentions(text: string): string {
    // Remove <at>...</at> mentions
    return text.replace(/<at>.*?<\/at>\s*/g, '').trim();
  }

  /**
   * Convert attachment to Teams format
   */
  private convertAttachment(media: MediaAttachment): TeamsAttachment {
    if (media.type === 'image') {
      return {
        contentType: media.mimeType,
        contentUrl: media.url,
        name: media.filename
      };
    }

    // For other types, use file attachment
    return {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            text: `📎 ${media.filename || 'Attachment'}`
          }
        ],
        actions: media.url ? [
          {
            type: 'Action.OpenUrl',
            title: 'Download',
            url: media.url
          }
        ] : []
      }
    };
  }

  /**
   * Get media type from content type
   */
  private getMediaType(contentType: string): 'image' | 'audio' | 'video' | 'document' {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('video/')) return 'video';
    return 'document';
  }

  /**
   * Send activity to Teams
   */
  private async sendActivity(
    serviceUrl: string,
    conversationId: string,
    activity: Partial<TeamsActivity>
  ): Promise<{ id: string }> {
    const url = `${serviceUrl}v3/conversations/${conversationId}/activities`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || '{"id":""}'));
            } catch {
              resolve({ id: '' });
            }
          } else {
            reject(new Error(`Teams API error: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(activity));
      req.end();
    });
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<void> {
    const tokenUrl = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';
    
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.appId,
      client_secret: this.appPassword,
      scope: 'https://api.botframework.com/.default'
    });

    return new Promise((resolve, reject) => {
      const urlObj = new URL(tokenUrl);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const token: TokenResponse = JSON.parse(data);
              this.accessToken = token.access_token;
              this.tokenExpiry = Date.now() + (token.expires_in * 1000) - 60000; // Refresh 1 min early
              resolve();
            } catch (e) {
              reject(new Error('Failed to parse token response'));
            }
          } else {
            reject(new Error(`Token refresh failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(params.toString());
      req.end();
    });
  }

  /**
   * Ensure token is valid
   */
  private async ensureToken(): Promise<void> {
    if (Date.now() >= this.tokenExpiry) {
      await this.refreshToken();
    }
  }

  /**
   * Verify incoming request token
   */
  private async verifyToken(authHeader: string): Promise<boolean> {
    // In production, you should verify the JWT token
    // For simplicity, we just check if it's present
    return authHeader.startsWith('Bearer ');
  }

  /**
   * Send adaptive card
   */
  async sendAdaptiveCard(
    conversationId: string,
    card: any,
    serviceUrl?: string
  ): Promise<MessageResult> {
    try {
      await this.ensureToken();

      const url = serviceUrl || this.serviceUrls.get(this.id) || 'https://smba.trafficmanager.net/amer/';

      const result = await this.sendActivity(url, conversationId, {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card
        }]
      });

      return {
        success: true,
        messageId: result.id,
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get team members
   */
  async getTeamMembers(teamId: string, serviceUrl?: string): Promise<Array<{
    id: string;
    name: string;
    email?: string;
  }>> {
    try {
      await this.ensureToken();

      const url = serviceUrl || this.serviceUrls.get(this.id) || 'https://smba.trafficmanager.net/amer/';
      const membersUrl = `${url}v3/conversations/${teamId}/members`;

      return new Promise((resolve, reject) => {
        const urlObj = new URL(membersUrl);
        const options: https.RequestOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const members = JSON.parse(data);
                resolve(members.map((m: any) => ({
                  id: m.id,
                  name: m.name,
                  email: m.email
                })));
              } catch {
                resolve([]);
              }
            } else {
              reject(new Error(`Failed to get members: ${res.statusCode}`));
            }
          });
        });

        req.on('error', reject);
        req.end();
      });
    } catch {
      return [];
    }
  }
}

export default MSTeamsChannel;
