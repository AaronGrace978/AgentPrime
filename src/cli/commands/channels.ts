/**
 * Channels command - Manage messaging channels
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ChannelsOptions {
  action: string;
  channel?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.agentprime');
const CREDENTIALS_DIR = path.join(CONFIG_DIR, 'credentials');

function ensureCredentialsDir() {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
}

interface ChannelInfo {
  name: string;
  configured: boolean;
  connected: boolean;
  details?: string;
}

async function getChannelStatus(): Promise<ChannelInfo[]> {
  const channels: ChannelInfo[] = [];
  
  // WhatsApp
  const whatsappCreds = path.join(CREDENTIALS_DIR, 'whatsapp');
  channels.push({
    name: 'WhatsApp',
    configured: fs.existsSync(whatsappCreds),
    connected: false, // Would need to check gateway
    details: fs.existsSync(whatsappCreds) ? 'Credentials stored' : 'Not linked'
  });
  
  // Telegram
  channels.push({
    name: 'Telegram',
    configured: !!process.env.TELEGRAM_BOT_TOKEN,
    connected: false,
    details: process.env.TELEGRAM_BOT_TOKEN ? 'Bot token set' : 'No bot token'
  });
  
  // Discord
  channels.push({
    name: 'Discord',
    configured: !!process.env.DISCORD_BOT_TOKEN,
    connected: false,
    details: process.env.DISCORD_BOT_TOKEN ? 'Bot token set' : 'No bot token'
  });
  
  // Slack
  channels.push({
    name: 'Slack',
    configured: !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN),
    connected: false,
    details: process.env.SLACK_BOT_TOKEN ? 'Tokens set' : 'No tokens'
  });
  
  // Signal
  const signalConfig = path.join(CREDENTIALS_DIR, 'signal');
  channels.push({
    name: 'Signal',
    configured: fs.existsSync(signalConfig),
    connected: false,
    details: fs.existsSync(signalConfig) ? 'Configured' : 'Not configured'
  });
  
  // iMessage (macOS only)
  if (os.platform() === 'darwin') {
    channels.push({
      name: 'iMessage',
      configured: true, // Uses system Messages
      connected: false,
      details: 'Uses system Messages app'
    });
  }
  
  // Matrix
  const matrixConfig = path.join(CREDENTIALS_DIR, 'matrix');
  channels.push({
    name: 'Matrix',
    configured: fs.existsSync(matrixConfig),
    connected: false,
    details: fs.existsSync(matrixConfig) ? 'Configured' : 'Not configured'
  });
  
  // MS Teams
  channels.push({
    name: 'MS Teams',
    configured: !!(process.env.TEAMS_APP_ID && process.env.TEAMS_APP_PASSWORD),
    connected: false,
    details: process.env.TEAMS_APP_ID ? 'App configured' : 'Not configured'
  });
  
  // WebChat
  channels.push({
    name: 'WebChat',
    configured: true, // Always available
    connected: false,
    details: 'Built-in, always available'
  });
  
  return channels;
}

async function listChannels() {
  console.log(chalk.bold('\n📱 Messaging Channels\n'));
  
  const channels = await getChannelStatus();
  
  console.log('─'.repeat(50));
  
  for (const channel of channels) {
    const configIcon = channel.configured ? chalk.green('✓') : chalk.gray('○');
    const statusColor = channel.configured ? chalk.white : chalk.gray;
    
    console.log(`  ${configIcon} ${statusColor(channel.name.padEnd(12))} ${chalk.gray(channel.details || '')}`);
  }
  
  console.log('─'.repeat(50));
  console.log('');
  console.log(chalk.gray('Use `agentprime channels login --channel <name>` to configure a channel'));
  console.log('');
}

async function loginChannel(channelName: string) {
  ensureCredentialsDir();
  
  const channel = channelName.toLowerCase();
  
  console.log(chalk.cyan(`\n🔐 Logging in to ${channelName}...\n`));
  
  switch (channel) {
    case 'whatsapp':
      console.log(chalk.yellow('WhatsApp login requires QR code scanning.'));
      console.log(chalk.gray('Starting WhatsApp connection...'));
      
      try {
        const { WhatsAppChannel } = await import('../../main/matrix-mode/channels/whatsapp');
        const wa = new WhatsAppChannel({
          credentialsPath: path.join(CREDENTIALS_DIR, 'whatsapp')
        });
        
        console.log(chalk.cyan('\nScan this QR code with WhatsApp on your phone:\n'));
        
        // The WhatsApp client will print QR code
        await wa.connect();
        
        console.log(chalk.green('\n✅ WhatsApp connected successfully!'));
        
      } catch (error: any) {
        console.error(chalk.red(`Failed to connect: ${error.message}`));
      }
      break;
      
    case 'telegram':
      console.log(chalk.cyan('To set up Telegram:'));
      console.log('  1. Message @BotFather on Telegram');
      console.log('  2. Create a new bot with /newbot');
      console.log('  3. Copy the bot token');
      console.log('  4. Set TELEGRAM_BOT_TOKEN environment variable');
      console.log('');
      console.log(chalk.gray('Or run: agentprime config channels.telegram.botToken <token>'));
      break;
      
    case 'discord':
      console.log(chalk.cyan('To set up Discord:'));
      console.log('  1. Go to https://discord.com/developers/applications');
      console.log('  2. Create a new application');
      console.log('  3. Go to Bot tab and create a bot');
      console.log('  4. Copy the bot token');
      console.log('  5. Set DISCORD_BOT_TOKEN environment variable');
      console.log('');
      console.log(chalk.gray('Or run: agentprime config channels.discord.token <token>'));
      break;
      
    case 'slack':
      console.log(chalk.cyan('To set up Slack:'));
      console.log('  1. Go to https://api.slack.com/apps');
      console.log('  2. Create a new app');
      console.log('  3. Enable Socket Mode and get App Token');
      console.log('  4. Install to workspace and get Bot Token');
      console.log('  5. Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN');
      break;
      
    case 'signal':
      console.log(chalk.cyan('To set up Signal:'));
      console.log('  1. Install signal-cli: https://github.com/AsamK/signal-cli');
      console.log('  2. Link your phone: signal-cli link --name "AgentPrime"');
      console.log('  3. Scan QR code with Signal app');
      break;
      
    case 'matrix':
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const homeserver = await new Promise<string>((resolve) => {
        rl.question('Matrix homeserver URL: ', resolve);
      });
      const username = await new Promise<string>((resolve) => {
        rl.question('Username: ', resolve);
      });
      const password = await new Promise<string>((resolve) => {
        rl.question('Password: ', resolve);
      });
      
      rl.close();
      
      // Save Matrix config
      const matrixConfig = { homeserver, username, password };
      fs.writeFileSync(
        path.join(CREDENTIALS_DIR, 'matrix', 'config.json'),
        JSON.stringify(matrixConfig, null, 2)
      );
      
      console.log(chalk.green('\n✅ Matrix credentials saved!'));
      break;
      
    default:
      console.error(chalk.red(`Unknown channel: ${channelName}`));
      console.log(chalk.gray('Available: whatsapp, telegram, discord, slack, signal, matrix'));
  }
  
  console.log('');
}

async function logoutChannel(channelName: string) {
  const channel = channelName.toLowerCase();
  const credPath = path.join(CREDENTIALS_DIR, channel);
  
  if (fs.existsSync(credPath)) {
    fs.rmSync(credPath, { recursive: true });
    console.log(chalk.green(`✅ Logged out of ${channelName}`));
  } else {
    console.log(chalk.yellow(`${channelName} credentials not found`));
  }
}

async function channelStatus(channelName?: string) {
  if (channelName) {
    // Check specific channel via gateway
    console.log(chalk.cyan(`\nChecking ${channelName} status...\n`));
    
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://127.0.0.1:18789');
      
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'channel_status',
            channel: channelName.toLowerCase()
          }));
        });
        
        ws.on('message', (data: Buffer) => {
          const response = JSON.parse(data.toString());
          console.log(chalk.white(`Channel: ${channelName}`));
          console.log(chalk.white(`Status: ${response.connected ? 'Connected' : 'Disconnected'}`));
          if (response.details) {
            console.log(chalk.gray(`Details: ${response.details}`));
          }
          ws.close();
          resolve();
        });
        
        ws.on('error', () => {
          reject(new Error('Gateway not running'));
        });
        
        setTimeout(() => {
          ws.terminate();
          reject(new Error('Timeout'));
        }, 5000);
      });
      
    } catch {
      console.log(chalk.yellow('Gateway not running. Showing stored config only:'));
      await listChannels();
    }
  } else {
    await listChannels();
  }
}

export async function manageChannels(options: ChannelsOptions) {
  switch (options.action.toLowerCase()) {
    case 'list':
      await listChannels();
      break;
      
    case 'login':
      if (!options.channel) {
        console.error(chalk.red('Error: --channel is required for login'));
        process.exit(1);
      }
      await loginChannel(options.channel);
      break;
      
    case 'logout':
      if (!options.channel) {
        console.error(chalk.red('Error: --channel is required for logout'));
        process.exit(1);
      }
      await logoutChannel(options.channel);
      break;
      
    case 'status':
      await channelStatus(options.channel);
      break;
      
    default:
      console.error(chalk.red(`Unknown action: ${options.action}`));
      console.log(chalk.gray('Available actions: list, login, logout, status'));
      process.exit(1);
  }
}
