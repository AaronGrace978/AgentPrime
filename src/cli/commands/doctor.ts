/**
 * Doctor command - Run diagnostics and check system health
 */

import chalk from 'chalk';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

const results: DiagnosticResult[] = [];

function check(name: string, fn: () => { status: 'pass' | 'warn' | 'fail'; message: string; details?: string }) {
  try {
    const result = fn();
    results.push({ name, ...result });
  } catch (error: any) {
    results.push({ name, status: 'fail', message: error.message });
  }
}

function commandExists(cmd: string): boolean {
  try {
    if (os.platform() === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd: string, args: string[] = ['--version']): string | null {
  try {
    const result = execSync(`${cmd} ${args.join(' ')}`, { encoding: 'utf-8', timeout: 5000 });
    return result.trim().split('\n')[0];
  } catch {
    return null;
  }
}

export async function runDoctor() {
  console.log(chalk.bold('System Diagnostics\n'));
  
  // ═══════════════════════════════════════════════════════════
  // SYSTEM INFO
  // ═══════════════════════════════════════════════════════════
  console.log(chalk.cyan('📊 System Info'));
  console.log(`   OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`   Node: ${process.version}`);
  console.log(`   Platform: ${os.platform()}`);
  console.log(`   Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`);
  console.log(`   CPUs: ${os.cpus().length}`);
  console.log('');
  
  // ═══════════════════════════════════════════════════════════
  // RUNTIME CHECKS
  // ═══════════════════════════════════════════════════════════
  console.log(chalk.cyan('🔧 Runtime'));
  
  // Node version
  check('Node.js', () => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major >= 22) {
      return { status: 'pass', message: `${version} (required: ≥22)` };
    } else if (major >= 18) {
      return { status: 'warn', message: `${version} (recommended: ≥22)` };
    } else {
      return { status: 'fail', message: `${version} (required: ≥22)` };
    }
  });
  
  // npm
  check('npm', () => {
    const version = getVersion('npm');
    if (version) {
      return { status: 'pass', message: version };
    }
    return { status: 'fail', message: 'Not found' };
  });
  
  // pnpm (optional)
  check('pnpm', () => {
    const version = getVersion('pnpm');
    if (version) {
      return { status: 'pass', message: version };
    }
    return { status: 'warn', message: 'Not installed (optional)' };
  });
  
  // Git
  check('Git', () => {
    const version = getVersion('git');
    if (version) {
      return { status: 'pass', message: version };
    }
    return { status: 'warn', message: 'Not found' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // AI PROVIDERS
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.cyan('🤖 AI Providers'));
  
  // API keys from environment
  const configuredAnthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const configuredOpenAIKey = process.env.OPENAI_API_KEY || '';
  const configuredOllamaKey = process.env.OLLAMA_API_KEY || '';
  
  // Anthropic API Key
  check('Anthropic API', () => {
    if (process.env.ANTHROPIC_API_KEY || configuredAnthropicKey) {
      return { status: 'pass', message: 'API key configured' };
    }
    return { status: 'warn', message: 'No API key (set ANTHROPIC_API_KEY)' };
  });
  
  // OpenAI API Key
  check('OpenAI API', () => {
    if (process.env.OPENAI_API_KEY || configuredOpenAIKey) {
      return { status: 'pass', message: 'API key configured' };
    }
    return { status: 'warn', message: 'No API key (set OPENAI_API_KEY)' };
  });
  
  // Ollama
  check('Ollama', () => {
    const hasOllamaKey = process.env.OLLAMA_API_KEY || configuredOllamaKey;
    if (commandExists('ollama')) {
      const version = getVersion('ollama', ['-v']);
      return { status: 'pass', message: `${version || 'Installed'}${hasOllamaKey ? ' + Cloud API key' : ''}` };
    }
    if (hasOllamaKey) {
      return { status: 'pass', message: 'Cloud API key configured' };
    }
    return { status: 'warn', message: 'Not installed (optional local AI)' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // MESSAGING CHANNELS
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.cyan('💬 Messaging Channels'));
  
  // Telegram
  check('Telegram', () => {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      return { status: 'pass', message: 'Bot token configured' };
    }
    return { status: 'warn', message: 'No bot token' };
  });
  
  // Discord
  check('Discord', () => {
    if (process.env.DISCORD_BOT_TOKEN) {
      return { status: 'pass', message: 'Bot token configured' };
    }
    return { status: 'warn', message: 'No bot token' };
  });
  
  // Slack
  check('Slack', () => {
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
      return { status: 'pass', message: 'Tokens configured' };
    }
    return { status: 'warn', message: 'Missing tokens' };
  });
  
  // Signal CLI
  check('Signal', () => {
    if (commandExists('signal-cli')) {
      return { status: 'pass', message: 'signal-cli installed' };
    }
    return { status: 'warn', message: 'signal-cli not found' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // BROWSER AUTOMATION
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.cyan('🌐 Browser Automation'));
  
  // Playwright
  check('Playwright', () => {
    try {
      require.resolve('playwright');
      return { status: 'pass', message: 'Installed' };
    } catch {
      return { status: 'warn', message: 'Not installed (run: npx playwright install)' };
    }
  });
  
  // Chrome/Chromium
  check('Chrome', () => {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser'
    ];
    
    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        return { status: 'pass', message: 'Found' };
      }
    }
    return { status: 'warn', message: 'Not found (Playwright will use bundled)' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // VOICE
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.cyan('🎤 Voice'));
  
  // ElevenLabs
  check('ElevenLabs TTS', () => {
    if (process.env.ELEVENLABS_API_KEY) {
      return { status: 'pass', message: 'API key configured' };
    }
    return { status: 'warn', message: 'No API key' };
  });
  
  // Porcupine (wake word)
  check('Porcupine Wake Word', () => {
    if (process.env.PORCUPINE_ACCESS_KEY) {
      return { status: 'pass', message: 'Access key configured' };
    }
    return { status: 'warn', message: 'No access key' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // CONFIG FILES
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.cyan('📁 Configuration'));
  
  const configDir = path.join(os.homedir(), '.agentprime');
  check('Config directory', () => {
    if (fs.existsSync(configDir)) {
      return { status: 'pass', message: configDir };
    }
    return { status: 'warn', message: 'Not created yet' };
  });
  
  const configFile = path.join(configDir, 'config.json');
  check('Config file', () => {
    if (fs.existsSync(configFile)) {
      return { status: 'pass', message: 'Found' };
    }
    return { status: 'warn', message: 'Not found (run: agentprime onboard)' };
  });
  
  // ═══════════════════════════════════════════════════════════
  // PRINT RESULTS
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log(chalk.bold('═'.repeat(60)));
  console.log('');
  
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  
  for (const result of results) {
    let icon: string;
    let color: (text: string) => string;
    
    switch (result.status) {
      case 'pass':
        icon = '✅';
        color = chalk.green;
        passCount++;
        break;
      case 'warn':
        icon = '⚠️';
        color = chalk.yellow;
        warnCount++;
        break;
      case 'fail':
        icon = '❌';
        color = chalk.red;
        failCount++;
        break;
    }
    
    console.log(`${icon} ${chalk.bold(result.name)}: ${color(result.message)}`);
    if (result.details) {
      console.log(`   ${chalk.gray(result.details)}`);
    }
  }
  
  console.log('');
  console.log(chalk.bold('═'.repeat(60)));
  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(`   ${chalk.green(`✅ ${passCount} passed`)}`);
  console.log(`   ${chalk.yellow(`⚠️  ${warnCount} warnings`)}`);
  console.log(`   ${chalk.red(`❌ ${failCount} failed`)}`);
  console.log('');
  
  if (failCount > 0) {
    console.log(chalk.red('❌ Some checks failed. Please fix the issues above.'));
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(chalk.yellow('⚠️  System is functional but some features may be limited.'));
    console.log(chalk.gray('   Run `agentprime onboard` to configure missing features.'));
  } else {
    console.log(chalk.green('✅ All checks passed! AgentPrime is ready.'));
  }
}
