#!/usr/bin/env node
/**
 * AgentPrime CLI - Your AI assistant from the command line
 * 
 * Usage:
 *   agentprime gateway [--port 18789]     Start the gateway server
 *   agentprime agent --message "..."      Send a message to the agent
 *   agentprime send --to <target> "..."   Send a message via channel
 *   agentprime doctor                     Run diagnostics
 *   agentprime onboard                    Setup wizard
 *   agentprime status                     Check system status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const VERSION = '1.0.0';
const CONFIG_DIR = path.join(os.homedir(), '.agentprime');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ASCII Art Banner
const BANNER = `
${chalk.green('╔══════════════════════════════════════════════════════════════╗')}
${chalk.green('║')}  ${chalk.cyan('█████╗  ██████╗ ███████╗███╗   ██╗████████╗')}               ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝')}               ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║')}                  ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║')}                  ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║')}                  ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝')}                  ${chalk.green('║')}
${chalk.green('║')}                                                              ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██████╗ ██████╗ ██╗███╗   ███╗███████╗')}                     ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██╔══██╗██╔══██╗██║████╗ ████║██╔════╝')}                     ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██████╔╝██████╔╝██║██╔████╔██║█████╗')}                       ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██╔═══╝ ██╔══██╗██║██║╚██╔╝██║██╔══╝')}                       ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('██║     ██║  ██║██║██║ ╚═╝ ██║███████╗')}                     ${chalk.green('║')}
${chalk.green('║')} ${chalk.cyan('╚═╝     ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝')}                     ${chalk.green('║')}
${chalk.green('║')}                                                              ${chalk.green('║')}
${chalk.green('║')}           ${chalk.yellow('🤖 Your AI Coding Companion 🤖')}                     ${chalk.green('║')}
${chalk.green('╚══════════════════════════════════════════════════════════════╝')}
`;

// Ensure config directory exists
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Load config
function loadConfig(): Record<string, any> {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

// Save config
function saveConfig(config: Record<string, any>) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Create the CLI program
const program = new Command();

program
  .name('agentprime')
  .description('AgentPrime CLI - Your AI assistant from the command line')
  .version(VERSION);

// Gateway command
program
  .command('gateway')
  .description('Start the gateway server')
  .option('-p, --port <port>', 'Gateway port', '18789')
  .option('-v, --verbose', 'Verbose logging')
  .option('--no-channels', 'Disable messaging channels')
  .action(async (options) => {
    console.log(BANNER);
    console.log(chalk.green(`[Gateway] Starting on port ${options.port}...`));
    
    try {
      // Dynamic import to avoid loading everything at startup
      const { startGateway } = await import('./commands/gateway');
      await startGateway({
        port: parseInt(options.port),
        verbose: options.verbose,
        enableChannels: options.channels
      });
    } catch (error: any) {
      console.error(chalk.red(`[Gateway] Failed to start: ${error.message}`));
      process.exit(1);
    }
  });

// Agent command
program
  .command('agent')
  .description('Send a message to the AI agent (with tool execution)')
  .option('-m, --message <message>', 'Message to send')
  .option('-i, --interactive', 'Interactive chat mode')
  .option('-v, --verbose', 'Show verbose output')
  .option('--model <model>', 'Model to use')
  .action(async (options) => {
    try {
      if (options.interactive) {
        const { runInteractiveAgent } = await import('./commands/agent');
        await runInteractiveAgent(options);
      } else if (options.message) {
        const { runAgent } = await import('./commands/agent');
        await runAgent({
          message: options.message,
          thinking: 'medium',
          verbose: options.verbose,
          model: options.model
        });
      } else {
        // Default to interactive if no message
        const { runInteractiveAgent } = await import('./commands/agent');
        await runInteractiveAgent(options);
      }
    } catch (error: any) {
      console.error(chalk.red(`[Agent] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Send command
program
  .command('send')
  .description('Send a message via a channel')
  .requiredOption('--to <target>', 'Target (phone number, username, channel ID)')
  .requiredOption('--channel <channel>', 'Channel: whatsapp|telegram|discord|slack|signal')
  .argument('<message>', 'Message to send')
  .action(async (message, options) => {
    try {
      const { sendMessage } = await import('./commands/send');
      await sendMessage({
        to: options.to,
        channel: options.channel,
        message
      });
    } catch (error: any) {
      console.error(chalk.red(`[Send] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Run diagnostics and check system health')
  .action(async () => {
    console.log(BANNER);
    console.log(chalk.cyan('\n🔍 Running diagnostics...\n'));
    
    try {
      const { runDoctor } = await import('./commands/doctor');
      await runDoctor();
    } catch (error: any) {
      console.error(chalk.red(`[Doctor] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check system status')
  .action(async () => {
    try {
      const { checkStatus } = await import('./commands/status');
      await checkStatus();
    } catch (error: any) {
      console.error(chalk.red(`[Status] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Onboard command
program
  .command('onboard')
  .description('Run the setup wizard')
  .option('--install-daemon', 'Install as background service')
  .action(async (options) => {
    console.log(BANNER);
    console.log(chalk.cyan('\n🚀 Welcome to AgentPrime Setup!\n'));
    
    try {
      const { runOnboard } = await import('./commands/onboard');
      await runOnboard({ installDaemon: options.installDaemon });
    } catch (error: any) {
      console.error(chalk.red(`[Onboard] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Channels command
program
  .command('channels')
  .description('Manage messaging channels')
  .argument('<action>', 'Action: list|login|logout|status')
  .option('--channel <channel>', 'Specific channel')
  .action(async (action, options) => {
    try {
      const { manageChannels } = await import('./commands/channels');
      await manageChannels({ action, channel: options.channel });
    } catch (error: any) {
      console.error(chalk.red(`[Channels] Error: ${error.message}`));
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('View or modify configuration')
  .argument('[key]', 'Config key to get/set')
  .argument('[value]', 'Value to set')
  .action((key, value) => {
    const config = loadConfig();
    
    if (!key) {
      console.log(chalk.cyan('\n📋 Current Configuration:\n'));
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    
    if (value === undefined) {
      // Get value
      const val = key.split('.').reduce((obj, k) => obj?.[k], config);
      console.log(val !== undefined ? val : chalk.yellow('(not set)'));
    } else {
      // Set value
      const keys = key.split('.');
      let obj = config;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = obj[keys[i]] || {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      saveConfig(config);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    }
  });

// Parse and run
program.parse();
