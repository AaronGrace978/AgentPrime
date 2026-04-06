import { FileTools } from '../agent/tools/fileTools';
import { spawn } from 'child_process';
import * as path from 'path';
import { searchWithRipgrep } from '../core/ripgrep-runner';
import type { IpcMainInvokeEvent } from 'electron';
import { createLogger, createOperationId } from '../core/logger';
import { ipcRateLimiter, validateCommand, validateFilePath } from '../security/ipcValidation';

interface HandlerDeps {
  ipcMain: any;
  getWorkspacePath: () => string | null;
}

let fileTools: FileTools | null = null;
const log = createLogger('AgentIPC');
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MAX_COMMAND_TIMEOUT_SECONDS = 300;

function resolveWorkspaceCommandDir(workspacePath: string, cwd?: string): string {
  const requestedCwd = typeof cwd === 'string' && cwd.trim().length > 0 ? cwd : '.';
  const validation = validateFilePath(requestedCwd, workspacePath, { sanitizeFilename: false });
  if (!validation.valid) {
    throw new Error(`Invalid working directory: ${validation.errors.join(', ')}`);
  }

  const workDir = path.resolve(workspacePath, validation.sanitized || requestedCwd);
  const relative = path.relative(path.resolve(workspacePath), workDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Working directory resolves outside of workspace');
  }

  return workDir;
}

function getFileTools(workspacePath: string | null): FileTools | null {
  if (!workspacePath) return null;

  if (!fileTools || fileTools['workspacePath'] !== workspacePath) {
    fileTools = new FileTools(workspacePath);
  }

  return fileTools;
}

function clampTimeoutSeconds(timeout?: number): number {
  if (!Number.isFinite(timeout)) {
    return DEFAULT_COMMAND_TIMEOUT_SECONDS;
  }
  return Math.max(1, Math.min(MAX_COMMAND_TIMEOUT_SECONDS, Math.floor(timeout as number)));
}

function buildCommandError(
  requestId: string,
  command: string,
  error: string,
  extras: Record<string, unknown> = {}
) {
  return {
    success: false,
    requestId,
    command,
    error,
    ...extras,
  };
}

async function runShellCommand(
  requestId: string,
  command: string,
  cwd: string,
  timeoutSeconds: number,
  reportedCwd: string
): Promise<Record<string, unknown>> {
  const timeoutMs = timeoutSeconds * 1000;

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/bash';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    log.info(`[${requestId}] Running command`, { cwd: reportedCwd, timeoutSeconds });

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      log.warn(`[${requestId}] Command timed out`, { cwd: reportedCwd, timeoutSeconds });
      resolve(
        buildCommandError(requestId, command, `Command timed out after ${timeoutSeconds}s`, {
          cwd: reportedCwd,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        })
      );
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      log.info(`[${requestId}] Command completed`, { cwd: reportedCwd, exitCode: code });
      resolve({
        success: code === 0,
        requestId,
        command,
        cwd: reportedCwd,
        exit_code: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      log.error(`[${requestId}] Command failed to spawn`, err);
      resolve(buildCommandError(requestId, command, err.message, { cwd: reportedCwd }));
    });
  });
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
    const requestId = createOperationId('agentcmd');
    try {
      const rateCheck = ipcRateLimiter.check('agent:run-command', 30);
      if (!rateCheck.allowed) {
        return buildCommandError(requestId, String(command || ''), 'Rate limit exceeded for agent commands.');
      }

      const commandValidation = validateCommand(command, { allowShellOperators: true });
      if (!commandValidation.valid) {
        return buildCommandError(
          requestId,
          String(command || ''),
          `Invalid command: ${commandValidation.errors.join('; ')}`
        );
      }

      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return buildCommandError(requestId, commandValidation.sanitized || command, 'No workspace loaded');
      }

      const workDir = resolveWorkspaceCommandDir(workspacePath, cwd);
      const timeoutSeconds = clampTimeoutSeconds(timeout);
      return runShellCommand(
        requestId,
        commandValidation.sanitized || command,
        workDir,
        timeoutSeconds,
        cwd || '.'
      );
    } catch (error) {
      log.error(`[${requestId}] agent:run-command failed`, error);
      return buildCommandError(
        requestId,
        String(command || ''),
        error instanceof Error ? error.message : 'Failed to run command'
      );
    }
  });

  // Run command (legacy/simple version) - Used by Words to Code and other UI features
  // This is a simpler version that just takes a command string
  ipcMain.handle('run-command', async (_event: IpcMainInvokeEvent, command: string) => {
    const requestId = createOperationId('uicmd');
    try {
      const rateCheck = ipcRateLimiter.check('run-command', 15);
      if (!rateCheck.allowed) {
        return buildCommandError(requestId, String(command || ''), 'Rate limit exceeded for run-command.');
      }

      const commandValidation = validateCommand(command, { allowShellOperators: false });
      if (!commandValidation.valid) {
        return buildCommandError(
          requestId,
          String(command || ''),
          `Invalid command: ${commandValidation.errors.join('; ')}`
        );
      }

      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return buildCommandError(requestId, commandValidation.sanitized || command, 'No workspace loaded');
      }

      return runShellCommand(
        requestId,
        commandValidation.sanitized || command,
        workspacePath,
        DEFAULT_COMMAND_TIMEOUT_SECONDS,
        '.'
      );
    } catch (error) {
      log.error(`[${requestId}] run-command failed`, error);
      return buildCommandError(
        requestId,
        String(command || ''),
        error instanceof Error ? error.message : 'Failed to run command'
      );
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
