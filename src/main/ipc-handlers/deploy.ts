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

    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      window?.webContents.send('deploy:output', { text, type: 'stdout' });

      const urlMatch = text.match(/https?:\/\/[^\s\]]+\.(?:vercel\.app|netlify\.app)[^\s\]]*/);
      if (urlMatch) {
        url = urlMatch[0];
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      window?.webContents.send('deploy:output', { text, type: 'stderr' });

      const urlMatch = text.match(/https?:\/\/[^\s\]]+\.(?:vercel\.app|netlify\.app)[^\s\]]*/);
      if (urlMatch) {
        url = urlMatch[0];
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, url: url || undefined, output });
      } else {
        resolve({ success: false, error: `Deploy exited with code ${code}`, output });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, output });
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
