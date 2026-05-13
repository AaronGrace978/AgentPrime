/**
 * Deploy IPC Handlers — One-Click Deploy to Vercel/Netlify
 * 
 * Detects project type and deploys using the appropriate CLI.
 * This is what Lovable and Bolt charge $25/mo for.
 */

import { IpcMain, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface DeployResult {
  success: boolean;
  url?: string;
  provider?: string;
  error?: string;
  output?: string;
}

type DeployProvider = 'vercel' | 'netlify' | 'auto';
const MAX_DEPLOY_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_DEPLOY_CHUNK_BYTES = 64 * 1024;
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function detectProjectType(workspacePath: string): { type: string; framework?: string } {
  const hasFile = (f: string) => fs.existsSync(path.join(workspacePath, f));

  if (hasFile('next.config.js') || hasFile('next.config.ts') || hasFile('next.config.mjs')) {
    return { type: 'nextjs', framework: 'next' };
  }
  if (hasFile('vite.config.ts') || hasFile('vite.config.js')) {
    return { type: 'vite', framework: 'vite' };
  }
  if (hasFile('nuxt.config.ts') || hasFile('nuxt.config.js')) {
    return { type: 'nuxt', framework: 'nuxt' };
  }
  if (hasFile('index.html') && !hasFile('package.json')) {
    return { type: 'static' };
  }
  if (hasFile('package.json')) {
    return { type: 'node' };
  }
  return { type: 'unknown' };
}

function commandExists(cmd: string): boolean {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

function runDeploy(
  command: string,
  args: string[],
  cwd: string,
  window: BrowserWindow | null
): Promise<DeployResult> {
  return new Promise((resolve) => {
    let output = '';
    let url = '';
    let outputBytes = 0;
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true,
    });

    const finish = (result: DeployResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const appendOutput = (data: Buffer, type: 'stdout' | 'stderr') => {
      if (outputBytes >= MAX_DEPLOY_OUTPUT_BYTES) {
        return;
      }

      const remaining = MAX_DEPLOY_OUTPUT_BYTES - outputBytes;
      const chunk = data.subarray(0, Math.min(data.length, remaining, MAX_DEPLOY_CHUNK_BYTES));
      const text = chunk.toString();
      outputBytes += chunk.length;
      output += text;
      window?.webContents.send('deploy:output', { text, type });

      const urlMatch = text.match(/https?:\/\/[^\s\]]+\.(?:vercel\.app|netlify\.app)[^\s\]]*/);
      if (urlMatch) {
        url = urlMatch[0];
      }

      if (outputBytes >= MAX_DEPLOY_OUTPUT_BYTES) {
        const message = `\n[AgentPrime] Deploy output limit reached (${MAX_DEPLOY_OUTPUT_BYTES} bytes); stopping deploy.\n`;
        output += message;
        window?.webContents.send('deploy:output', { text: message, type: 'stderr' });
        child.kill();
      }
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ success: false, error: 'Deploy timed out', output });
    }, DEPLOY_TIMEOUT_MS);

    child.stdout.on('data', (data: Buffer) => {
      appendOutput(data, 'stdout');
    });

    child.stderr.on('data', (data: Buffer) => {
      appendOutput(data, 'stderr');
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish({ success: true, url: url || undefined, output });
      } else {
        finish({ success: false, error: `Deploy exited with code ${code}`, output });
      }
    });

    child.on('error', (err) => {
      finish({ success: false, error: err.message, output });
    });
  });
}

interface DeployDeps {
  ipcMain: IpcMain;
  mainWindow: () => BrowserWindow | null;
  getWorkspacePath: () => string | null;
}

export function registerDeployHandlers(deps: DeployDeps): void {
  const { ipcMain, mainWindow, getWorkspacePath } = deps;

  ipcMain.handle('deploy:run', async (_event, provider: DeployProvider, _options?: any): Promise<DeployResult> => {
    const wp = getWorkspacePath();
    if (!wp) return { success: false, error: 'No workspace open' };

    const window = mainWindow();
    const projectType = detectProjectType(wp);

    let selectedProvider = provider;
    if (selectedProvider === 'auto') {
      if (commandExists('vercel')) {
        selectedProvider = 'vercel';
      } else if (commandExists('netlify')) {
        selectedProvider = 'netlify';
      } else {
        return {
          success: false,
          error: 'No deploy CLI found. Install one:\n  npm i -g vercel\n  npm i -g netlify-cli'
        };
      }
    }

    window?.webContents.send('deploy:started', { provider: selectedProvider, projectType });

    if (selectedProvider === 'vercel') {
      if (!commandExists('vercel')) {
        return { success: false, error: 'Vercel CLI not installed. Run: npm i -g vercel' };
      }
      console.log(`[Deploy] Deploying to Vercel (${projectType.type})...`);
      const result = await runDeploy('vercel', ['--yes'], wp, window);
      return { ...result, provider: 'vercel' };
    }

    if (selectedProvider === 'netlify') {
      if (!commandExists('netlify')) {
        return { success: false, error: 'Netlify CLI not installed. Run: npm i -g netlify-cli' };
      }

      let deployDir = '.';
      if (projectType.type === 'vite') deployDir = 'dist';
      else if (projectType.type === 'nextjs') deployDir = '.next';
      else if (projectType.type === 'static') deployDir = '.';

      console.log(`[Deploy] Deploying to Netlify (${projectType.type}, dir: ${deployDir})...`);
      const result = await runDeploy('netlify', ['deploy', '--prod', '--dir', deployDir], wp, window);
      return { ...result, provider: 'netlify' };
    }

    return { success: false, error: `Unknown provider: ${selectedProvider}` };
  });

  ipcMain.handle('deploy:status', async () => {
    return {
      vercel: commandExists('vercel'),
      netlify: commandExists('netlify'),
    };
  });

  console.log('[Deploy] One-click deploy handlers registered');
}
