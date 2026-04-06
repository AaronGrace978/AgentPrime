/**
 * Onboard command - Setup wizard
 */

import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../../main/core/logger';

const log = createLogger('CLIOnboard');

interface OnboardOptions {
  installDaemon: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.agentprime');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function saveConfig(config: Record<string, any>) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadConfig(): Record<string, any> {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

async function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const q = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(q, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function confirm(rl: readline.Interface, question: string, defaultValue: boolean = true): Promise<boolean> {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  const answer = await prompt(rl, `${question} (${hint})`);
  if (!answer) return defaultValue;
  return answer.toLowerCase().startsWith('y');
}

export async function runOnboard(options: OnboardOptions) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  log.info(chalk.cyan('This wizard will help you set up AgentPrime.\n'));
  
  const config = loadConfig();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: AI Provider
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('Step 1: AI Provider'));
    log.info(chalk.gray('Configure your AI model provider.\n'));
    
    log.info('  1. Anthropic (Claude) - Recommended');
    log.info('  2. OpenAI (GPT)');
    log.info('  3. Ollama (Local)');
    log.info('  4. Skip');
    
    const providerChoice = await prompt(rl, 'Select provider', '1');
    
    switch (providerChoice) {
      case '1':
        const anthropicKey = await prompt(rl, 'Anthropic API Key');
        if (anthropicKey) {
          config.ai = config.ai || {};
          config.ai.provider = 'anthropic';
          config.ai.apiKey = anthropicKey;
          config.ai.model = 'claude-sonnet-4-20250514';
          log.info(chalk.green('✓ Anthropic configured\n'));
        }
        break;
      case '2':
        const openaiKey = await prompt(rl, 'OpenAI API Key');
        if (openaiKey) {
          config.ai = config.ai || {};
          config.ai.provider = 'openai';
          config.ai.apiKey = openaiKey;
          config.ai.model = 'gpt-4o';
          log.info(chalk.green('✓ OpenAI configured\n'));
        }
        break;
      case '3':
        const ollamaUrl = await prompt(rl, 'Ollama URL', 'http://localhost:11434');
        const ollamaModel = await prompt(rl, 'Ollama Model', 'llama3.3');
        config.ai = config.ai || {};
        config.ai.provider = 'ollama';
        config.ai.baseUrl = ollamaUrl;
        config.ai.model = ollamaModel;
        log.info(chalk.green('✓ Ollama configured\n'));
        break;
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: Messaging Channels
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\nStep 2: Messaging Channels'));
    log.info(chalk.gray('Set up messaging channels (optional).\n'));
    
    if (await confirm(rl, 'Configure Telegram?', false)) {
      const token = await prompt(rl, 'Telegram Bot Token');
      if (token) {
        config.channels = config.channels || {};
        config.channels.telegram = { botToken: token, enabled: true };
        log.info(chalk.green('✓ Telegram configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Discord?', false)) {
      const token = await prompt(rl, 'Discord Bot Token');
      if (token) {
        config.channels = config.channels || {};
        config.channels.discord = { token, enabled: true };
        log.info(chalk.green('✓ Discord configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Slack?', false)) {
      const botToken = await prompt(rl, 'Slack Bot Token');
      const appToken = await prompt(rl, 'Slack App Token');
      if (botToken && appToken) {
        config.channels = config.channels || {};
        config.channels.slack = { botToken, appToken, enabled: true };
        log.info(chalk.green('✓ Slack configured\n'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: Voice
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\nStep 3: Voice (Optional)'));
    log.info(chalk.gray('Set up voice features.\n'));
    
    if (await confirm(rl, 'Configure ElevenLabs TTS?', false)) {
      const key = await prompt(rl, 'ElevenLabs API Key');
      if (key) {
        config.voice = config.voice || {};
        config.voice.tts = { provider: 'elevenlabs', apiKey: key };
        log.info(chalk.green('✓ ElevenLabs configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Porcupine Wake Word?', false)) {
      const key = await prompt(rl, 'Porcupine Access Key');
      if (key) {
        config.voice = config.voice || {};
        config.voice.wakeWord = { provider: 'porcupine', accessKey: key };
        log.info(chalk.green('✓ Porcupine configured\n'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: Gateway Settings
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\nStep 4: Gateway'));
    log.info(chalk.gray('Configure the gateway server.\n'));
    
    const port = await prompt(rl, 'Gateway port', '18789');
    config.gateway = config.gateway || {};
    config.gateway.port = parseInt(port);
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: Security
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\nStep 5: Security'));
    log.info(chalk.gray('Configure security settings.\n'));
    
    log.info('DM Policy:');
    log.info('  1. pairing - Require pairing code for new users (recommended)');
    log.info('  2. open - Allow all DMs (less secure)');
    
    const dmPolicy = await prompt(rl, 'Select DM policy', '1');
    config.security = config.security || {};
    config.security.dmPolicy = dmPolicy === '2' ? 'open' : 'pairing';
    
    // ═══════════════════════════════════════════════════════════
    // SAVE CONFIG
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\n📝 Saving configuration...\n'));
    
    saveConfig(config);
    log.info(chalk.green(`✓ Config saved to ${CONFIG_FILE}\n`));
    
    // ═══════════════════════════════════════════════════════════
    // INSTALL DAEMON (optional)
    // ═══════════════════════════════════════════════════════════
    if (options.installDaemon) {
      log.info(chalk.bold('Installing as background service...\n'));
      
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // macOS - launchd
        const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.agentprime.gateway.plist');
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentprime.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>npx</string>
    <string>agentprime</string>
    <string>gateway</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`;
        fs.writeFileSync(plistPath, plist);
        log.info(chalk.green(`✓ Created ${plistPath}`));
        log.info(chalk.gray('  Run: launchctl load ~/Library/LaunchAgents/com.agentprime.gateway.plist'));
        
      } else if (platform === 'linux') {
        // Linux - systemd
        const servicePath = path.join(os.homedir(), '.config/systemd/user/agentprime.service');
        const serviceDir = path.dirname(servicePath);
        if (!fs.existsSync(serviceDir)) {
          fs.mkdirSync(serviceDir, { recursive: true });
        }
        const service = `[Unit]
Description=AgentPrime Gateway
After=network.target

[Service]
ExecStart=npx agentprime gateway
Restart=always

[Install]
WantedBy=default.target`;
        fs.writeFileSync(servicePath, service);
        log.info(chalk.green(`✓ Created ${servicePath}`));
        log.info(chalk.gray('  Run: systemctl --user enable agentprime && systemctl --user start agentprime'));
        
      } else if (platform === 'win32') {
        // Windows - suggest using Task Scheduler
        log.info(chalk.yellow('⚠ Windows: Use Task Scheduler to run at startup:'));
        log.info(chalk.gray('  Program: npx'));
        log.info(chalk.gray('  Arguments: agentprime gateway'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════
    log.info(chalk.bold('\n✅ Setup complete!\n'));
    log.info(chalk.cyan('Next steps:'));
    log.info(`  ${chalk.white('agentprime gateway')}     Start the gateway`);
    log.info(`  ${chalk.white('agentprime doctor')}      Verify setup`);
    log.info(`  ${chalk.white('agentprime agent -m')}    Test the AI`);
    log.info('');
    
  } catch (error: any) {
    log.error(chalk.red(`\nError: ${error.message}`));
  } finally {
    rl.close();
  }
}
