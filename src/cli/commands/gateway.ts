/**
 * Gateway command - Start the gateway server
 */

import chalk from 'chalk';

interface GatewayOptions {
  port: number;
  verbose: boolean;
  enableChannels: boolean;
}

export async function startGateway(options: GatewayOptions) {
  console.log(chalk.green('─'.repeat(60)));
  console.log(chalk.green(`[Gateway] Starting on port ${options.port}...`));
  console.log(chalk.green('─'.repeat(60)));
  console.log('');
  
  try {
    // Import and start the gateway
    const { GatewayServer } = await import('../../main/matrix-mode/gateway/gateway-server');
    
    const gateway = new GatewayServer({
      port: options.port
    });
    
    await gateway.start();
    
    console.log(chalk.green(`✅ Gateway running on ws://127.0.0.1:${options.port}`));
    console.log('');
    console.log(chalk.cyan('Endpoints:'));
    console.log(`  WebSocket: ${chalk.white(`ws://127.0.0.1:${options.port}`)}`);
    console.log(`  Health:    ${chalk.white(`http://127.0.0.1:${options.port}/health`)}`);
    console.log('');
    
    if (options.enableChannels) {
      console.log(chalk.cyan('Starting messaging channels...'));
      // Start channels if enabled
      try {
        const { ChannelManager } = await import('../../main/matrix-mode/channels/channel-manager');
        const channelManager = new ChannelManager();
        
        // Start configured channels
        console.log(chalk.gray('  Checking for configured channels...'));
        
        // WhatsApp
        if (process.env.WHATSAPP_ENABLED === 'true') {
          console.log(chalk.green('  ✓ WhatsApp enabled'));
        }
        
        // Telegram
        if (process.env.TELEGRAM_BOT_TOKEN) {
          console.log(chalk.green('  ✓ Telegram enabled'));
        }
        
        // Discord
        if (process.env.DISCORD_BOT_TOKEN) {
          console.log(chalk.green('  ✓ Discord enabled'));
        }
        
        // Slack
        if (process.env.SLACK_BOT_TOKEN) {
          console.log(chalk.green('  ✓ Slack enabled'));
        }
        
      } catch (error: any) {
        console.log(chalk.yellow(`  ⚠ Channels not initialized: ${error.message}`));
      }
    }
    
    console.log('');
    console.log(chalk.gray('Press Ctrl+C to stop'));
    console.log('');
    
    // Keep running
    process.on('SIGINT', async () => {
      console.log('');
      console.log(chalk.yellow('[Gateway] Shutting down...'));
      await gateway.stop();
      console.log(chalk.green('[Gateway] Stopped'));
      process.exit(0);
    });
    
    // Log activity if verbose
    if (options.verbose) {
      gateway.on('connection', (client: any) => {
        console.log(chalk.gray(`[Gateway] Client connected: ${client.id}`));
      });
      
      gateway.on('disconnection', (client: any) => {
        console.log(chalk.gray(`[Gateway] Client disconnected: ${client.id}`));
      });
      
      gateway.on('message', (msg: any) => {
        console.log(chalk.gray(`[Gateway] Message: ${JSON.stringify(msg).substring(0, 100)}...`));
      });
    }
    
  } catch (error: any) {
    console.error(chalk.red(`[Gateway] Failed to start: ${error.message}`));
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
