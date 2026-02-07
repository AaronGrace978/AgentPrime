/**
 * Matrix Mode Channels
 * Multi-platform messaging channel implementations
 * 
 * Supported channels:
 * - WhatsApp (via Baileys)
 * - Telegram (Bot API)
 * - Discord (discord.js)
 * - Slack (Bolt SDK)
 * - Signal (signal-cli)
 * - iMessage (macOS only)
 * - Microsoft Teams (Bot Framework)
 * - Matrix Protocol (Decentralized)
 * - WebChat (Browser-based)
 */

export { BaseChannel } from './base-channel';
export { WhatsAppChannel } from './whatsapp';
export { TelegramChannel } from './telegram';
export { DiscordChannel } from './discord';
export { SlackChannel } from './slack';
export { SignalChannel } from './signal';
export { iMessageChannel } from './imessage';
export { MSTeamsChannel } from './msteams';
export { MatrixProtocolChannel } from './matrix-protocol';
export { WebChatChannel } from './webchat';

import { ChannelConfig, ChannelType, Channel } from '../gateway/types';
import { ChannelManager, getChannelManager, ChannelFactory } from '../gateway/channel-manager';
import { WhatsAppChannel } from './whatsapp';
import { TelegramChannel } from './telegram';
import { DiscordChannel } from './discord';
import { SlackChannel } from './slack';
import { SignalChannel } from './signal';
import { iMessageChannel } from './imessage';
import { MSTeamsChannel } from './msteams';
import { MatrixProtocolChannel } from './matrix-protocol';
import { WebChatChannel } from './webchat';

/**
 * Channel factory map - All 9 channels fully implemented
 */
const channelFactories: Map<ChannelType, ChannelFactory> = new Map([
  ['whatsapp', (config) => new WhatsAppChannel(config)],
  ['telegram', (config) => new TelegramChannel(config)],
  ['discord', (config) => new DiscordChannel(config)],
  ['slack', (config) => new SlackChannel(config)],
  ['signal', (config) => new SignalChannel(config)],
  ['imessage', (config) => new iMessageChannel(config)],
  ['msteams', (config) => new MSTeamsChannel(config)],
  ['matrix', (config) => new MatrixProtocolChannel(config)],
  ['webchat', (config) => new WebChatChannel(config)]
]);

/**
 * Create a channel instance
 */
export function createChannel(config: ChannelConfig): Channel {
  const factory = channelFactories.get(config.type);
  if (!factory) {
    throw new Error(`Unsupported channel type: ${config.type}`);
  }
  return factory(config);
}

/**
 * Register all channel factories with channel manager
 */
export function registerAllChannelFactories(manager?: ChannelManager): void {
  const channelManager = manager || getChannelManager();
  
  for (const [type, factory] of channelFactories) {
    channelManager.registerFactory(type, factory);
  }

  console.log(`[Channels] Registered ${channelFactories.size} channel factories`);
}

/**
 * Register a custom channel factory
 */
export function registerChannelFactory(type: ChannelType, factory: ChannelFactory): void {
  channelFactories.set(type, factory);
  
  // Also register with channel manager if available
  try {
    const manager = getChannelManager();
    manager.registerFactory(type, factory);
  } catch {
    // Manager not initialized yet, that's ok
  }
}

/**
 * Get available channel types
 */
export function getAvailableChannelTypes(): ChannelType[] {
  return Array.from(channelFactories.keys());
}

/**
 * Check if a channel type is supported
 */
export function isChannelTypeSupported(type: ChannelType): boolean {
  return channelFactories.has(type);
}

/**
 * Get channel requirements
 */
export function getChannelRequirements(type: ChannelType): {
  credentials: string[];
  settings: string[];
  packages?: string[];
} {
  switch (type) {
    case 'whatsapp':
      return {
        credentials: [],
        settings: ['authDir'],
        packages: ['@whiskeysockets/baileys']
      };
    case 'telegram':
      return {
        credentials: ['botToken'],
        settings: []
      };
    case 'discord':
      return {
        credentials: ['token'],
        settings: [],
        packages: ['discord.js']
      };
    case 'slack':
      return {
        credentials: ['botToken', 'appToken', 'signingSecret'],
        settings: ['socketMode']
      };
    case 'signal':
      return {
        credentials: [],
        settings: ['signalCliPath'],
        packages: ['signal-cli']
      };
    case 'imessage':
      return {
        credentials: [],
        settings: [],
        packages: [] // macOS only, uses AppleScript
      };
    case 'msteams':
      return {
        credentials: ['appId', 'appPassword'],
        settings: []
      };
    case 'matrix':
      return {
        credentials: ['homeserverUrl', 'accessToken'],
        settings: []
      };
    default:
      return {
        credentials: [],
        settings: []
      };
  }
}

/**
 * Channel configuration templates
 */
export const CHANNEL_TEMPLATES: Record<ChannelType, Partial<ChannelConfig>> = {
  whatsapp: {
    type: 'whatsapp',
    name: 'WhatsApp',
    settings: {
      authDir: './whatsapp-auth'
    }
  },
  telegram: {
    type: 'telegram',
    name: 'Telegram Bot',
    settings: {
      pollingTimeout: 30
    }
  },
  discord: {
    type: 'discord',
    name: 'Discord Bot',
    settings: {}
  },
  slack: {
    type: 'slack',
    name: 'Slack Bot',
    settings: {
      socketMode: true
    }
  },
  signal: {
    type: 'signal',
    name: 'Signal',
    settings: {}
  },
  imessage: {
    type: 'imessage',
    name: 'iMessage',
    settings: {}
  },
  msteams: {
    type: 'msteams',
    name: 'Microsoft Teams',
    settings: {}
  },
  matrix: {
    type: 'matrix',
    name: 'Matrix',
    settings: {}
  },
  webchat: {
    type: 'webchat',
    name: 'Web Chat',
    settings: {}
  },
  custom: {
    type: 'custom',
    name: 'Custom Channel',
    settings: {}
  }
};

export default {
  createChannel,
  registerAllChannelFactories,
  registerChannelFactory,
  getAvailableChannelTypes,
  isChannelTypeSupported,
  getChannelRequirements,
  CHANNEL_TEMPLATES
};
