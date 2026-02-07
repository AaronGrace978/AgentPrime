/**
 * AgentPrime - Script Execution IPC Handlers
 * Handles script execution for multiple languages
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { IpcMain, BrowserWindow } from 'electron';

// Store running processes
const runningProcesses = new Map<number, { process: any; filePath: string }>();

/**
 * Get interpreter for file extension
 */
function getInterpreter(filePath: string): { cmd: string; args: string[] } | null {
  const ext = path.extname(filePath).toLowerCase();
  const interpreters: Record<string, { cmd: string; args: string[] }> = {
    '.js': { cmd: 'node', args: [] },
    '.mjs': { cmd: 'node', args: [] },
    '.ts': { cmd: 'npx', args: ['ts-node'] },
    '.py': { cmd: 'python', args: [] },
    '.rb': { cmd: 'ruby', args: [] },
    '.sh': { cmd: 'bash', args: [] },
    '.bat': { cmd: 'cmd', args: ['/c'] },
    '.ps1': { cmd: 'powershell', args: ['-File'] },
    '.go': { cmd: 'go', args: ['run'] },
  };
  return interpreters[ext] || null;
}

interface ScriptHandlersDeps {
  ipcMain: IpcMain;
  mainWindow: () => BrowserWindow | null;
  getWorkspacePath: () => string | null;
}

/**
 * Register script-related IPC handlers
 */
export function register(deps: ScriptHandlersDeps): void {
  const { ipcMain, mainWindow, getWorkspacePath } = deps;

  // Run script
  ipcMain.handle('script:run', async (event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { success: false, error: 'No workspace' };

    const fullPath = path.join(workspacePath, filePath);
    const window = mainWindow();
    const interpreter = getInterpreter(fullPath);

    if (!interpreter) {
      return { success: false, error: `No interpreter for ${path.extname(fullPath)} files` };
    }

    if (!window) return { success: false, error: 'No window' };

    try {
      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'File does not exist' };
      }

      const workDir = path.dirname(fullPath);
      const child = spawn(interpreter.cmd, [...interpreter.args, fullPath], {
        cwd: workDir,
        shell: true,
      });

      const pid = child.pid!;
      runningProcesses.set(pid, { process: child, filePath });

      window.webContents.send('script:output', {
        pid,
        type: 'system',
        data: `Started: ${path.basename(fullPath)} (PID: ${pid})\n`
      });

      child.stdout.on('data', (data: Buffer) => {
        window.webContents.send('script:output', {
          pid,
          type: 'stdout',
          data: data.toString()
        });
      });

      child.stderr.on('data', (data: Buffer) => {
        window.webContents.send('script:output', {
          pid,
          type: 'stderr',
          data: data.toString()
        });
      });

      child.on('close', (code: number | null) => {
        window.webContents.send('script:exit', { pid, code });
        runningProcesses.delete(pid);
      });

      child.on('error', (err: Error) => {
        window.webContents.send('script:error', { pid, error: err.message });
        runningProcesses.delete(pid);
      });

      return { success: true, pid, fileName: path.basename(fullPath) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Kill script
  ipcMain.handle('script:kill', async (event, pid: number) => {
    const proc = runningProcesses.get(pid);
    if (proc) {
      proc.process.kill();
      runningProcesses.delete(pid);
      return { success: true };
    }
    return { success: false, error: 'Process not found' };
  });

  // Check if file is runnable
  ipcMain.handle('script:isRunnable', (event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { runnable: false };

    const fullPath = path.join(workspacePath, filePath);
    return { runnable: getInterpreter(fullPath) !== null };
  });
}
