/**
 * Matrix Mode Signal Channel
 * Signal Messenger integration via signal-cli
 * Provides E2E encrypted messaging
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
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface SignalMessage {
  envelope: {
    source: string;
    sourceNumber: string;
    sourceName?: string;
    sourceDevice: number;
    timestamp: number;
    dataMessage?: {
      message: string;
      timestamp: number;
      groupInfo?: {
        groupId: string;
        type: string;
      };
      attachments?: SignalAttachment[];
      reaction?: {
        emoji: string;
        targetAuthor: string;
        targetSentTimestamp: number;
      };
      quote?: {
        id: number;
        author: string;
        text: string;
      };
    };
    syncMessage?: {
      sentMessage?: {
        destination: string;
        message: string;
        timestamp: number;
      };
    };
    typingMessage?: {
      action: 'STARTED' | 'STOPPED';
      timestamp: number;
      groupId?: string;
    };
  };
}

interface SignalAttachment {
  contentType: string;
  filename?: string;
  size: number;
  width?: number;
  height?: number;
  id: string;
}

export class SignalChannel extends BaseChannel {
  private signalCliPath: string;
  private accountNumber: string = '';
  private configPath: string = '';
  private daemonProcess: ChildProcess | null = null;
  private jsonRpcProcess: ChildProcess | null = null;
  private messageBuffer: string = '';
  private groupCache: Map<string, { name: string; members: string[] }> = new Map();

  constructor(config: ChannelConfig) {
    super({ ...config, type: 'signal' });
    this.signalCliPath = this.getConfigValue('signalCliPath', 'signal-cli');
    this.accountNumber = this.getCredential('phoneNumber') || this.getConfigValue('phoneNumber', '');
    this.configPath = this.getConfigValue('configPath', '');
  }

  async doConnect(): Promise<void> {
    if (!this.accountNumber) {
      throw new Error('Signal phone number required');
    }

    // Verify signal-cli is available
    await this.verifySignalCli();

    // Start JSON-RPC daemon for receiving messages
    await this.startJsonRpcDaemon();

    console.log(`[Signal] Connected: ${this.accountNumber}`);
  }

  async doDisconnect(): Promise<void> {
    this.stopDaemon();
  }

  async doSend(message: OutgoingMessage): Promise<MessageResult> {
    try {
      const args: string[] = ['-a', this.accountNumber];

      if (this.configPath) {
        args.push('--config', this.configPath);
      }

      // Determine if it's a group or direct message
      const isGroup = message.targetId.startsWith('group:');
      
      if (isGroup) {
        args.push('send', '-g', message.targetId.replace('group:', ''));
      } else {
        args.push('send', message.targetId);
      }

      // Add message text
      if (message.text) {
        args.push('-m', message.text);
      }

      // Add attachments
      if (message.media && message.media.length > 0) {
        for (const media of message.media) {
          if (media.path) {
            args.push('-a', media.path);
          }
        }
      }

      // Add quote/reply
      if (message.replyTo) {
        args.push('--quote-timestamp', message.replyTo);
        args.push('--quote-author', message.metadata?.quoteAuthor || message.targetId);
      }

      const result = await this.runSignalCli(args);
      
      return {
        success: true,
        messageId: Date.now().toString(),
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
      const args = ['-a', this.accountNumber];
      
      if (this.configPath) {
        args.push('--config', this.configPath);
      }

      const isGroup = indicator.targetId.startsWith('group:');
      
      if (indicator.typing) {
        args.push('sendTyping');
        if (isGroup) {
          args.push('-g', indicator.targetId.replace('group:', ''));
        } else {
          args.push(indicator.targetId);
        }
      } else {
        args.push('sendTyping', '--stop');
        if (isGroup) {
          args.push('-g', indicator.targetId.replace('group:', ''));
        } else {
          args.push(indicator.targetId);
        }
      }

      await this.runSignalCli(args);
    } catch (error) {
      // Typing indicator failures are non-critical
      console.debug('[Signal] Typing indicator error:', error);
    }
  }

  /**
   * Link as secondary device (for initial setup)
   */
  async linkDevice(deviceName: string = 'AgentPrime'): Promise<string> {
    const args = ['link', '-n', deviceName];
    if (this.configPath) {
      args.push('--config', this.configPath);
    }

    return new Promise((resolve, reject) => {
      const process = spawn(this.signalCliPath, args);
      let output = '';
      let qrCode = '';

      process.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        // Look for tsdevice:// URI
        const match = output.match(/(tsdevice:\/\/[^\s]+)/);
        if (match) {
          qrCode = match[1];
        }
      });

      process.stderr.on('data', (data: Buffer) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 || qrCode) {
          resolve(qrCode || 'Device linked successfully');
        } else {
          reject(new Error(`Link failed: ${output}`));
        }
      });
    });
  }

  /**
   * Register as primary device
   */
  async register(captcha?: string): Promise<void> {
    const args = ['-a', this.accountNumber, 'register'];
    
    if (this.configPath) {
      args.push('--config', this.configPath);
    }

    if (captcha) {
      args.push('--captcha', captcha);
    }

    await this.runSignalCli(args);
  }

  /**
   * Verify registration with SMS code
   */
  async verify(code: string): Promise<void> {
    const args = ['-a', this.accountNumber, 'verify', code];
    
    if (this.configPath) {
      args.push('--config', this.configPath);
    }

    await this.runSignalCli(args);
  }

  /**
   * Get list of groups
   */
  async listGroups(): Promise<Array<{ id: string; name: string; members: string[] }>> {
    const args = ['-a', this.accountNumber, 'listGroups', '-d', '--output=json'];
    
    if (this.configPath) {
      args.push('--config', this.configPath);
    }

    const output = await this.runSignalCli(args);
    
    try {
      const groups = JSON.parse(output);
      return groups.map((g: any) => ({
        id: g.id,
        name: g.name || 'Unknown Group',
        members: g.members || []
      }));
    } catch {
      return [];
    }
  }

  /**
   * Verify signal-cli is available
   */
  private async verifySignalCli(): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.signalCliPath, ['--version']);
      let output = '';

      process.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      process.on('error', (error) => {
        reject(new Error(`signal-cli not found at ${this.signalCliPath}. Install from https://github.com/AsamK/signal-cli`));
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log(`[Signal] Using signal-cli: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error('signal-cli verification failed'));
        }
      });
    });
  }

  /**
   * Start JSON-RPC daemon for receiving messages
   */
  private async startJsonRpcDaemon(): Promise<void> {
    const args = ['-a', this.accountNumber, 'jsonRpc'];
    
    if (this.configPath) {
      args.push('--config', this.configPath);
    }

    this.jsonRpcProcess = spawn(this.signalCliPath, args);

    this.jsonRpcProcess.stdout?.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.processMessageBuffer();
    });

    this.jsonRpcProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      if (!error.includes('INFO') && !error.includes('DEBUG')) {
        console.warn('[Signal] Daemon error:', error);
      }
    });

    this.jsonRpcProcess.on('error', (error) => {
      console.error('[Signal] Daemon process error:', error);
      this.handleError(error);
    });

    this.jsonRpcProcess.on('close', (code) => {
      if (code !== 0 && this.status === 'connected') {
        console.warn(`[Signal] Daemon exited with code ${code}, reconnecting...`);
        this.handleError(new Error(`Daemon exited with code ${code}`));
      }
    });

    // Wait a bit for daemon to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Process message buffer for complete JSON messages
   */
  private processMessageBuffer(): void {
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.method === 'receive' && data.params) {
            this.handleSignalMessage(data.params);
          }
        } catch (error) {
          // Not JSON, ignore
        }
      }
    }
  }

  /**
   * Handle incoming Signal message
   */
  private handleSignalMessage(signalMsg: SignalMessage): void {
    const envelope = signalMsg.envelope;
    
    // Skip sync messages from self
    if (envelope.syncMessage) return;

    const dataMessage = envelope.dataMessage;
    if (!dataMessage) return;

    // Handle reactions
    if (dataMessage.reaction) {
      this.emitMessage({
        id: `${envelope.timestamp}`,
        channelId: this.id,
        channelType: 'signal',
        senderId: envelope.sourceNumber,
        senderName: envelope.sourceName,
        type: 'reaction',
        text: dataMessage.reaction.emoji,
        timestamp: envelope.timestamp,
        metadata: {
          targetTimestamp: dataMessage.reaction.targetSentTimestamp,
          targetAuthor: dataMessage.reaction.targetAuthor
        }
      });
      return;
    }

    // Regular message
    const message: Message = {
      id: `${envelope.timestamp}`,
      channelId: this.id,
      channelType: 'signal',
      senderId: envelope.sourceNumber,
      senderName: envelope.sourceName,
      type: 'text',
      text: dataMessage.message,
      timestamp: envelope.timestamp
    };

    // Handle group messages
    if (dataMessage.groupInfo) {
      message.groupId = `group:${dataMessage.groupInfo.groupId}`;
      const cached = this.groupCache.get(dataMessage.groupInfo.groupId);
      if (cached) {
        message.groupName = cached.name;
      }
    }

    // Handle quotes/replies
    if (dataMessage.quote) {
      message.replyTo = dataMessage.quote.id.toString();
      message.metadata = {
        ...message.metadata,
        quoteAuthor: dataMessage.quote.author,
        quoteText: dataMessage.quote.text
      };
    }

    // Handle attachments
    if (dataMessage.attachments && dataMessage.attachments.length > 0) {
      message.media = dataMessage.attachments.map(att => {
        const type = this.getMediaType(att.contentType);
        return {
          type,
          mimeType: att.contentType,
          filename: att.filename,
          size: att.size,
          width: att.width,
          height: att.height,
          metadata: { attachmentId: att.id }
        } as any;
      });
      message.type = message.media[0].type as any;
    }

    this.emitMessage(message);
  }

  /**
   * Get media type from MIME type
   */
  private getMediaType(mimeType: string): 'image' | 'audio' | 'video' | 'document' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }

  /**
   * Stop daemon processes
   */
  private stopDaemon(): void {
    if (this.jsonRpcProcess) {
      this.jsonRpcProcess.kill();
      this.jsonRpcProcess = null;
    }
    if (this.daemonProcess) {
      this.daemonProcess.kill();
      this.daemonProcess = null;
    }
    this.messageBuffer = '';
  }

  /**
   * Run signal-cli command
   */
  private runSignalCli(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.signalCliPath, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        reject(error);
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Send reaction to a message
   */
  async sendReaction(targetId: string, targetTimestamp: string, emoji: string): Promise<MessageResult> {
    try {
      const args = [
        '-a', this.accountNumber,
        'sendReaction',
        '-e', emoji,
        '-a', targetId,
        '-t', targetTimestamp,
        targetId
      ];

      if (this.configPath) {
        args.push('--config', this.configPath);
      }

      await this.runSignalCli(args);

      return {
        success: true,
        messageId: Date.now().toString(),
        timestamp: Date.now()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default SignalChannel;
