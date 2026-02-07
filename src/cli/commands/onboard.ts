/**
 * Onboard command - Setup wizard
 */

import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  
  console.log(chalk.cyan('This wizard will help you set up AgentPrime.\n'));
  
  const config = loadConfig();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: AI Provider
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('Step 1: AI Provider'));
    console.log(chalk.gray('Configure your AI model provider.\n'));
    
    console.log('  1. Anthropic (Claude) - Recommended');
    console.log('  2. OpenAI (GPT)');
    console.log('  3. Ollama (Local)');
    console.log('  4. Skip');
    
    const providerChoice = await prompt(rl, 'Select provider', '1');
    
    switch (providerChoice) {
      case '1':
        const anthropicKey = await prompt(rl, 'Anthropic API Key');
        if (anthropicKey) {
          config.ai = config.ai || {};
          config.ai.provider = 'anthropic';
          config.ai.apiKey = anthropicKey;
          config.ai.model = 'claude-sonnet-4-20250514';
          console.log(chalk.green('✓ Anthropic configured\n'));
        }
        break;
      case '2':
        const openaiKey = await prompt(rl, 'OpenAI API Key');
        if (openaiKey) {
          config.ai = config.ai || {};
          config.ai.provider = 'openai';
          config.ai.apiKey = openaiKey;
          config.ai.model = 'gpt-4o';
          console.log(chalk.green('✓ OpenAI configured\n'));
        }
        break;
      case '3':
        const ollamaUrl = await prompt(rl, 'Ollama URL', 'http://localhost:11434');
        const ollamaModel = await prompt(rl, 'Ollama Model', 'llama3.3');
        config.ai = config.ai || {};
        config.ai.provider = 'ollama';
        config.ai.baseUrl = ollamaUrl;
        config.ai.model = ollamaModel;
        console.log(chalk.green('✓ Ollama configured\n'));
        break;
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: Messaging Channels
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\nStep 2: Messaging Channels'));
    console.log(chalk.gray('Set up messaging channels (optional).\n'));
    
    if (await confirm(rl, 'Configure Telegram?', false)) {
      const token = await prompt(rl, 'Telegram Bot Token');
      if (token) {
        config.channels = config.channels || {};
        config.channels.telegram = { botToken: token, enabled: true };
        console.log(chalk.green('✓ Telegram configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Discord?', false)) {
      const token = await prompt(rl, 'Discord Bot Token');
      if (token) {
        config.channels = config.channels || {};
        config.channels.discord = { token, enabled: true };
        console.log(chalk.green('✓ Discord configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Slack?', false)) {
      const botToken = await prompt(rl, 'Slack Bot Token');
      const appToken = await prompt(rl, 'Slack App Token');
      if (botToken && appToken) {
        config.channels = config.channels || {};
        config.channels.slack = { botToken, appToken, enabled: true };
        console.log(chalk.green('✓ Slack configured\n'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: Voice
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\nStep 3: Voice (Optional)'));
    console.log(chalk.gray('Set up voice features.\n'));
    
    if (await confirm(rl, 'Configure ElevenLabs TTS?', false)) {
      const key = await prompt(rl, 'ElevenLabs API Key');
      if (key) {
        config.voice = config.voice || {};
        config.voice.tts = { provider: 'elevenlabs', apiKey: key };
        console.log(chalk.green('✓ ElevenLabs configured\n'));
      }
    }
    
    if (await confirm(rl, 'Configure Porcupine Wake Word?', false)) {
      const key = await prompt(rl, 'Porcupine Access Key');
      if (key) {
        config.voice = config.voice || {};
        config.voice.wakeWord = { provider: 'porcupine', accessKey: key };
        console.log(chalk.green('✓ Porcupine configured\n'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: Gateway Settings
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\nStep 4: Gateway'));
    console.log(chalk.gray('Configure the gateway server.\n'));
    
    const port = await prompt(rl, 'Gateway port', '18789');
    config.gateway = config.gateway || {};
    config.gateway.port = parseInt(port);
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: Security
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\nStep 5: Security'));
    console.log(chalk.gray('Configure security settings.\n'));
    
    console.log('DM Policy:');
    console.log('  1. pairing - Require pairing code for new users (recommended)');
    console.log('  2. open - Allow all DMs (less secure)');
    
    const dmPolicy = await prompt(rl, 'Select DM policy', '1');
    config.security = config.security || {};
    config.security.dmPolicy = dmPolicy === '2' ? 'open' : 'pairing';
    
    // ═══════════════════════════════════════════════════════════
    // SAVE CONFIG
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\n📝 Saving configuration...\n'));
    
    saveConfig(config);
    console.log(chalk.green(`✓ Config saved to ${CONFIG_FILE}\n`));
    
    // ═══════════════════════════════════════════════════════════
    // INSTALL DAEMON (optional)
    // ═══════════════════════════════════════════════════════════
    if (options.installDaemon) {
      console.log(chalk.bold('Installing as background service...\n'));
      
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
        console.log(chalk.green(`✓ Created ${plistPath}`));
        console.log(chalk.gray('  Run: launchctl load ~/Library/LaunchAgents/com.agentprime.gateway.plist'));
        
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
        console.log(chalk.green(`✓ Created ${servicePath}`));
        console.log(chalk.gray('  Run: systemctl --user enable agentprime && systemctl --user start agentprime'));
        
      } else if (platform === 'win32') {
        // Windows - suggest using Task Scheduler
        console.log(chalk.yellow('⚠ Windows: Use Task Scheduler to run at startup:'));
        console.log(chalk.gray('  Program: npx'));
        console.log(chalk.gray('  Arguments: agentprime gateway'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════
    console.log(chalk.bold('\n✅ Setup complete!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(`  ${chalk.white('agentprime gateway')}     Start the gateway`);
    console.log(`  ${chalk.white('agentprime doctor')}      Verify setup`);
    console.log(`  ${chalk.white('agentprime agent -m')}    Test the AI`);
    console.log('');
    
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message}`));
  } finally {
    rl.close();
  }
}
