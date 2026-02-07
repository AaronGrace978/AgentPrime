/**
 * Send command - Send a message via a channel
 */

import chalk from 'chalk';

interface SendOptions {
  to: string;
  channel: string;
  message: string;
}

export async function sendMessage(options: SendOptions) {
  console.log(chalk.cyan(`\n📨 Sending via ${options.channel}...\n`));
  
  const validChannels = ['whatsapp', 'telegram', 'discord', 'slack', 'signal', 'imessage', 'matrix'];
  
  if (!validChannels.includes(options.channel.toLowerCase())) {
    console.error(chalk.red(`Invalid channel: ${options.channel}`));
    console.log(chalk.gray(`Valid channels: ${validChannels.join(', ')}`));
    process.exit(1);
  }
  
  try {
    // Try to connect to running gateway
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:18789');
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Gateway not running. Start with: agentprime gateway'));
      }, 3000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        
        // Send message via gateway
        ws.send(JSON.stringify({
          type: 'send_message',
          channel: options.channel.toLowerCase(),
          target: options.to,
          message: options.message
        }));
        
        console.log(chalk.green('✅ Message sent!'));
        console.log(chalk.gray(`   To: ${options.to}`));
        console.log(chalk.gray(`   Via: ${options.channel}`));
        console.log(chalk.gray(`   Message: ${options.message.substring(0, 50)}${options.message.length > 50 ? '...' : ''}`));
        
        ws.close();
        resolve();
      });
      
      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(`Gateway connection failed: ${error.message}`));
      });
    });
    
  } catch (error: any) {
    // Fallback: try direct channel access
    console.log(chalk.yellow('Gateway not available, trying direct send...'));
    
    try {
      switch (options.channel.toLowerCase()) {
        case 'telegram':
          await sendTelegram(options);
          break;
        case 'discord':
          await sendDiscord(options);
          break;
        case 'slack':
          await sendSlack(options);
          break;
        default:
          console.error(chalk.red(`Direct send not supported for ${options.channel}. Start the gateway first.`));
          process.exit(1);
      }
    } catch (directError: any) {
      console.error(chalk.red(`Failed to send: ${directError.message}`));
      process.exit(1);
    }
  }
  
  console.log('');
}

async function sendTelegram(options: SendOptions) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }
  
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.to,
      text: options.message
    })
  });
  
  if (!response.ok) {
    const error = await response.json() as any;
    throw new Error(error.description || 'Telegram API error');
  }
  
  console.log(chalk.green('✅ Message sent via Telegram!'));
}

async function sendDiscord(options: SendOptions) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN not set');
  }
  
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(`https://discord.com/api/v10/channels/${options.to}/messages`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bot ${token}`
    },
    body: JSON.stringify({
      content: options.message
    })
  });
  
  if (!response.ok) {
    const error = await response.json() as any;
    throw new Error(error.message || 'Discord API error');
  }
  
  console.log(chalk.green('✅ Message sent via Discord!'));
}

async function sendSlack(options: SendOptions) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN not set');
  }
  
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      channel: options.to,
      text: options.message
    })
  });
  
  const result = await response.json() as any;
  if (!result.ok) {
    throw new Error(result.error || 'Slack API error');
  }
  
  console.log(chalk.green('✅ Message sent via Slack!'));
}
