import { FileTools } from '../agent/tools/fileTools';
import { spawn } from 'child_process';
import * as path from 'path';
import { searchWithRipgrep } from '../core/ripgrep-runner';
import type { IpcMainInvokeEvent } from 'electron';

interface HandlerDeps {
  ipcMain: any;
  getWorkspacePath: () => string | null;
}

let fileTools: FileTools | null = null;

function getFileTools(workspacePath: string | null): FileTools | null {
  if (!workspacePath) return null;

  if (!fileTools || fileTools['workspacePath'] !== workspacePath) {
    fileTools = new FileTools(workspacePath);
  }

  return fileTools;
}

export function register(deps: HandlerDeps): void {
  const { ipcMain, getWorkspacePath } = deps;

  // List files
  ipcMain.handle('agent:list-files', async (_event: IpcMainInvokeEvent, relativePath: string) => {
    try {
      const tools = getFileTools(getWorkspacePath());
      if (!tools) {
        return { success: false, error: 'No workspace loaded' };
      }

      return await tools.listFiles(relativePath);
    } catch (error) {
      console.error('Agent list-files failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files'
      };
    }
  });

  // Read file
  ipcMain.handle('agent:read-file', async (_event: IpcMainInvokeEvent, relativePath: string) => {
    try {
      const tools = getFileTools(getWorkspacePath());
      if (!tools) {
        return { success: false, error: 'No workspace loaded' };
      }

      return await tools.readFile(relativePath);
    } catch (error) {
      console.error('Agent read-file failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file'
      };
    }
  });

  // Write file
  ipcMain.handle('agent:write-file', async (_event: IpcMainInvokeEvent, relativePath: string, content: string) => {
    try {
      const tools = getFileTools(getWorkspacePath());
      if (!tools) {
        return { success: false, error: 'No workspace loaded' };
      }

      return await tools.writeFile(relativePath, content);
    } catch (error) {
      console.error('Agent write-file failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file'
      };
    }
  });

  // Apply diff
  ipcMain.handle('agent:apply-diff', async (_event: IpcMainInvokeEvent, relativePath: string, diff: string) => {
    try {
      const tools = getFileTools(getWorkspacePath());
      if (!tools) {
        return { success: false, error: 'No workspace loaded' };
      }

      return await tools.applyDiff(relativePath, diff);
    } catch (error) {
      console.error('Agent apply-diff failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply diff'
      };
    }
  });

  // Run command - Execute terminal commands
  ipcMain.handle('agent:run-command', async (_event: IpcMainInvokeEvent, command: string, cwd?: string, timeout?: number) => {
    try {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No workspace loaded' };
      }

      const workDir = path.resolve(workspacePath, cwd || '.');
      const timeoutMs = (timeout || 60) * 1000;

      return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/bash';
        const shellArgs = isWindows ? ['/c', command] : ['-c', command];

        const child = spawn(shell, shellArgs, {
          cwd: workDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        const timer = setTimeout(() => {
          child.kill();
          resolve({
            success: false,
            command,
            cwd: cwd || '.',
            stdout,
            stderr,
            error: `Command timed out after ${timeout || 60}s`
          });
        }, timeoutMs);

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            success: code === 0,
            command,
            cwd: cwd || '.',
            exit_code: code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            success: false,
            command,
            error: err.message
          });
        });
      });
    } catch (error) {
      console.error('Agent run-command failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run command'
      };
    }
  });

  // Run command (legacy/simple version) - Used by Words to Code and other UI features
  // This is a simpler version that just takes a command string
  ipcMain.handle('run-command', async (_event: IpcMainInvokeEvent, command: string) => {
    try {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No workspace loaded' };
      }

      const timeoutMs = 60 * 1000; // 60 second default timeout

      return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/bash';
        const shellArgs = isWindows ? ['/c', command] : ['-c', command];

        const child = spawn(shell, shellArgs, {
          cwd: workspacePath,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        const timer = setTimeout(() => {
          child.kill();
          resolve({
            success: false,
            command,
            stdout,
            stderr,
            error: 'Command timed out after 60s'
          });
        }, timeoutMs);

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            success: code === 0,
            command,
            exit_code: code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            success: false,
            command,
            error: err.message
          });
        });
      });
    } catch (error) {
      console.error('run-command failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run command'
      };
    }
  });

  // Search codebase — @vscode/ripgrep (JSON protocol), PATH fallback
  ipcMain.handle(
    'agent:search-codebase',
    async (
      _event: IpcMainInvokeEvent,
      query: string,
      options?: { includePattern?: string; excludePattern?: string; maxResults?: number }
    ) => {
      try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
          return { success: false, error: 'No workspace loaded' };
        }

        const { includePattern, excludePattern, maxResults = 20 } = options || {};

        const rg = await searchWithRipgrep(workspacePath, query, {
          includePattern,
          excludePattern,
          maxResults,
          timeoutMs: 25_000
        });

        if (!rg.success) {
          return {
            success: false,
            query,
            matches: [],
            total: 0,
            error: rg.message || 'Search failed',
            usedBundledRg: rg.usedBundledRg
          };
        }

        const matches = rg.matches.map((m) => ({
          file: m.file,
          line: m.line,
          column: m.column,
          content: m.content
        }));

        return {
          success: true,
          query,
          matches,
          total: matches.length,
          ...(rg.message ? { message: rg.message } : {}),
          usedBundledRg: rg.usedBundledRg
        };
      } catch (error) {
        console.error('Agent search-codebase failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to search codebase'
        };
      }
    }
  );
}
