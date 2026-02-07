/**
 * Matrix Mode iMessage Channel
 * macOS-only iMessage integration via AppleScript/Messages.app
 * Requires Full Disk Access permission
 */

import { BaseChannel } from './base-channel';
import {
  ChannelConfig,
  Message,
  OutgoingMessage,
  MessageResult,
  TypingIndicator
} from '../gateway/types';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface iMessageRow {
  rowid: number;
  guid: string;
  text: string;
  handle_id: number;
  date: number;
  is_from_me: number;
  cache_has_attachments: number;
  chat_identifier: string;
  display_name: string;
  associated_message_guid?: string;
  associated_message_type?: number;
}

export class iMessageChannel extends BaseChannel {
  private pollInterval: NodeJS.Timeout | null = null;
  private lastMessageId: number = 0;
  private dbPath: string;
  private isEnabled: boolean = false;
  private pollIntervalMs: number = 2000;

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'imessage' });
    // macOS iMessage database location
    this.dbPath = path.join(
      process.env.HOME || '',
      'Library/Messages/chat.db'
    );
    this.pollIntervalMs = this.getConfigValue('pollInterval', 2000);
  }

  async doConnect(): Promise<void> {
    // Check if running on macOS
    if (process.platform !== 'darwin') {
      throw new Error('iMessage is only available on macOS');
    }

    // Check if Messages.app database is accessible
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(
        'iMessage database not found. Please ensure Messages.app is set up and grant Full Disk Access to the application.'
      );
    }

    // Get the last message ID to avoid processing old messages
    this.lastMessageId = await this.getLatestMessageId();
    this.isEnabled = true;

    // Start polling for new messages
    this.startPolling();

    console.log('[iMessage] Connected to Messages.app');
  }

  async doDisconnect(): Promise<void> {
    this.isEnabled = false;
    this.stopPolling();
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    try {
      const recipient = message.targetId;
      const text = message.text || '';

      // Handle media attachments
      if (message.media && message.media.length > 0) {
        for (const media of message.media) {
          if (media.path) {
            await this.sendWithAttachment(recipient, text, media.path);
            return {
              success: true,
              messageId: Date.now().toString(),
              timestamp: Date.now()
            };
          }
        }
      }

      // Send text message via AppleScript
      const script = `
        tell application "Messages"
          set targetService to 1st service whose service type = iMessage
          set targetBuddy to buddy "${this.escapeAppleScript(recipient)}" of targetService
          send "${this.escapeAppleScript(text)}" to targetBuddy
        end tell
      `;

      await this.runAppleScript(script);

      return {
        success: true,
        messageId: Date.now().toString(),
        timestamp: Date.now()
      };
    } catch (error: any) {
      // Fallback: try sending via phone number format
      try {
        const script = `
          tell application "Messages"
            send "${this.escapeAppleScript(message.text || '')}" to participant "${this.escapeAppleScript(message.targetId)}" of (1st chat whose participants contains participant "${this.escapeAppleScript(message.targetId)}")
          end tell
        `;
        await this.runAppleScript(script);
        
        return {
          success: true,
          messageId: Date.now().toString(),
          timestamp: Date.now()
        };
      } catch (fallbackError: any) {
        return {
          success: false,
          error: error.message || fallbackError.message
        };
      }
    }
  }

  async doSetTyping(_indicator: TypingIndicator): Promise<void> {
    // iMessage doesn't support programmatic typing indicators
    // The typing indicator is handled automatically by Messages.app
  }

  /**
   * Send message with file attachment
   */
  private async sendWithAttachment(
    recipient: string,
    text: string,
    filePath: string
  ): Promise<void> {
    const script = `
      tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy "${this.escapeAppleScript(recipient)}" of targetService
        set theAttachment to POSIX file "${this.escapeAppleScript(filePath)}"
        send theAttachment to targetBuddy
        ${text ? `send "${this.escapeAppleScript(text)}" to targetBuddy` : ''}
      end tell
    `;

    await this.runAppleScript(script);
  }

  /**
   * Start polling for new messages
   */
  private startPolling(): void {
    if (this.pollInterval) return;

    const poll = async () => {
      if (!this.isEnabled) return;

      try {
        const messages = await this.getNewMessages();
        for (const msg of messages) {
          this.emitMessage(msg);
        }
      } catch (error) {
        console.error('[iMessage] Polling error:', error);
      }
    };

    // Initial poll
    poll();

    // Continue polling
    this.pollInterval = setInterval(poll, this.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get latest message ID
   */
  private async getLatestMessageId(): Promise<number> {
    try {
      const query = `SELECT MAX(ROWID) as max_id FROM message`;
      const result = await this.queryDatabase(query);
      return result[0]?.max_id || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get new messages since last poll
   */
  private async getNewMessages(): Promise<Message[]> {
    const query = `
      SELECT 
        m.ROWID as rowid,
        m.guid,
        m.text,
        m.handle_id,
        m.date,
        m.is_from_me,
        m.cache_has_attachments,
        m.associated_message_guid,
        m.associated_message_type,
        c.chat_identifier,
        c.display_name,
        h.id as sender_id
      FROM message m
      LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      LEFT JOIN chat c ON cmj.chat_id = c.ROWID
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.ROWID > ${this.lastMessageId}
        AND m.is_from_me = 0
      ORDER BY m.ROWID ASC
      LIMIT 100
    `;

    try {
      const rows = await this.queryDatabase(query);
      const messages: Message[] = [];

      for (const row of rows) {
        this.lastMessageId = Math.max(this.lastMessageId, row.rowid);

        // Skip reactions for now (associated_message_type != 0 means it's a reaction/effect)
        if (row.associated_message_type && row.associated_message_type !== 0) {
          continue;
        }

        const isGroup = row.chat_identifier?.includes(';chat');
        
        const message: Message = {
          id: row.guid || row.rowid.toString(),
          channelId: this.id,
          channelType: 'imessage',
          senderId: row.sender_id || 'unknown',
          type: 'text',
          text: row.text,
          timestamp: this.convertAppleTimestamp(row.date)
        };

        if (isGroup) {
          message.groupId = row.chat_identifier;
          message.groupName = row.display_name || row.chat_identifier;
        }

        // Handle attachments
        if (row.cache_has_attachments) {
          const attachments = await this.getAttachments(row.rowid);
          if (attachments.length > 0) {
            message.media = attachments;
            message.type = attachments[0].type as any;
          }
        }

        messages.push(message);
      }

      return messages;
    } catch (error) {
      console.error('[iMessage] Query error:', error);
      return [];
    }
  }

  /**
   * Get attachments for a message
   */
  private async getAttachments(messageRowId: number): Promise<any[]> {
    const query = `
      SELECT 
        a.filename,
        a.mime_type,
        a.transfer_name,
        a.total_bytes
      FROM attachment a
      JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
      WHERE maj.message_id = ${messageRowId}
    `;

    try {
      const rows = await this.queryDatabase(query);
      return rows.map((row: any) => ({
        type: this.getMediaType(row.mime_type || ''),
        mimeType: row.mime_type || 'application/octet-stream',
        filename: row.transfer_name || row.filename,
        path: row.filename?.replace('~', process.env.HOME || ''),
        size: row.total_bytes
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get media type from MIME type
   */
  private getMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }

  /**
   * Query the iMessage database
   */
  private async queryDatabase(query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sqlite = spawn('sqlite3', ['-json', this.dbPath, query]);
      let stdout = '';
      let stderr = '';

      sqlite.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      sqlite.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      sqlite.on('close', (code) => {
        if (code === 0) {
          try {
            const result = stdout.trim() ? JSON.parse(stdout) : [];
            resolve(result);
          } catch {
            resolve([]);
          }
        } else {
          reject(new Error(stderr || `sqlite3 exited with code ${code}`));
        }
      });

      sqlite.on('error', reject);
    });
  }

  /**
   * Run AppleScript
   */
  private async runAppleScript(script: string): Promise<string> {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
    return stdout.trim();
  }

  /**
   * Escape string for AppleScript
   */
  private escapeAppleScript(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Convert Apple's timestamp (nanoseconds since 2001-01-01) to Unix timestamp
   */
  private convertAppleTimestamp(appleTimestamp: number): number {
    // Apple timestamps are nanoseconds since 2001-01-01
    // Convert to milliseconds since 1970-01-01
    const appleEpoch = Date.UTC(2001, 0, 1);
    return appleEpoch + Math.floor(appleTimestamp / 1000000);
  }

  /**
   * Get recent chats
   */
  async getRecentChats(limit: number = 20): Promise<Array<{
    id: string;
    name: string;
    lastMessage: string;
    lastMessageTime: number;
  }>> {
    const query = `
      SELECT 
        c.chat_identifier as id,
        c.display_name as name,
        m.text as last_message,
        m.date as last_date
      FROM chat c
      JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
      JOIN message m ON cmj.message_id = m.ROWID
      WHERE m.ROWID = (
        SELECT MAX(m2.ROWID) 
        FROM message m2 
        JOIN chat_message_join cmj2 ON m2.ROWID = cmj2.message_id 
        WHERE cmj2.chat_id = c.ROWID
      )
      ORDER BY m.date DESC
      LIMIT ${limit}
    `;

    try {
      const rows = await this.queryDatabase(query);
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name || row.id,
        lastMessage: row.last_message || '',
        lastMessageTime: this.convertAppleTimestamp(row.last_date)
      }));
    } catch {
      return [];
    }
  }
}

export default iMessageChannel;
