/**
 * Matrix Mode Messaging Gateway - Type Definitions
 * Multi-channel messaging support
 */

export type ChannelType = 
  | 'whatsapp' 
  | 'telegram' 
  | 'discord' 
  | 'slack' 
  | 'signal'
  | 'imessage'
  | 'msteams'
  | 'matrix'
  | 'webchat'
  | 'custom';

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'paused';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'reaction' | 'poll';

export interface ChannelConfig {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  
  // Authentication
  credentials?: Record<string, string>;
  
  // Settings
  settings?: Record<string, any>;
  
  // Routing
  defaultAgentId?: string;
  allowFrom?: string[];
  blockFrom?: string[];
  
  // Rate limiting
  rateLimitPerMinute?: number;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}

export interface ChannelState {
  config: ChannelConfig;
  status: ChannelStatus;
  error?: string;
  connectedAt?: number;
  lastMessageAt?: number;
  messageCount: number;
  metadata?: Record<string, any>;
}

export interface Message {
  id: string;
  channelId: string;
  channelType: ChannelType;
  
  // Sender info
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  
  // Target (for group chats)
  groupId?: string;
  groupName?: string;
  
  // Content
  type: MessageType;
  text?: string;
  media?: MediaAttachment[];
  
  // Threading
  replyTo?: string;
  threadId?: string;
  
  // Reactions
  reactions?: Reaction[];
  
  // Poll data
  poll?: PollData;
  
  // Location data
  location?: LocationData;
  
  // Metadata
  timestamp: number;
  edited?: boolean;
  editedAt?: number;
  metadata?: Record<string, any>;
}

export interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  url?: string;
  path?: string;
  data?: Buffer;
  mimeType: string;
  filename?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  userName?: string;
  timestamp: number;
}

export interface PollData {
  question: string;
  options: PollOption[];
  multiSelect?: boolean;
  anonymous?: boolean;
  closed?: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters?: string[];
}

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  accuracy?: number;
}

export interface OutgoingMessage {
  channelId: string;
  targetId: string; // User or group ID
  
  type: MessageType;
  text?: string;
  media?: MediaAttachment[];
  
  replyTo?: string;
  threadId?: string;
  
  // For reactions
  reaction?: {
    messageId: string;
    emoji: string;
  };
  
  // For polls
  poll?: Omit<PollData, 'closed'>;
  
  // Formatting
  markdown?: boolean;
  mentions?: string[];
  
  metadata?: Record<string, any>;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

export interface TypingIndicator {
  channelId: string;
  targetId: string;
  typing: boolean;
}

export interface PresenceUpdate {
  channelId: string;
  userId: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: number;
}

export interface GatewayConfig {
  port: number;
  host: string;
  maxConnections: number;
  heartbeatInterval: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  port: 18791,
  host: '127.0.0.1',
  maxConnections: 100,
  heartbeatInterval: 30000,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10
};

export interface Channel {
  readonly id: string;
  readonly type: ChannelType;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  getStatus(): ChannelStatus;
  getState(): ChannelState;
  
  send(message: OutgoingMessage): Promise<MessageResult>;
  setTyping(indicator: TypingIndicator): Promise<void>;
  
  onMessage(handler: (message: Message) => void): void;
  onStatusChange(handler: (status: ChannelStatus) => void): void;
  onPresence(handler: (update: PresenceUpdate) => void): void;
  
  removeAllListeners(): void;
}
