/**
 * AgentPrime - Git IPC Handlers
 * Handles Git operations via IPC with validated argv-based execution.
 */

import { spawn } from 'child_process';
import { IpcMain } from 'electron';
import * as path from 'path';
import { createLogger } from '../core/logger';
import { resolveValidatedPath, validateCommand } from '../security/ipcValidation';

const log = createLogger('GitIPC');
const SAFE_GIT_REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/\-]+$/;

interface GitStatusResult {
  success: boolean;
  branch?: string;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  deleted?: string[];
  error?: string;
}

interface GitExecResult {
  success: boolean;
  output?: string;
  stderr?: string;
  error?: string;
}

interface GitHandlersDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
}

function tokenizeGitCommand(command: string): string[] {
  return (command.match(/"[^"]*"|\S+/g) || []).map((token) =>
    token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token
  );
}

function parseSafeGitCommand(command: string): { args?: string[]; error?: string } {
  const validation = validateCommand(command, { allowShellOperators: false });
  if (!validation.valid) {
    return { error: `Invalid git command: ${validation.errors.join('; ')}` };
  }

  const tokens = tokenizeGitCommand(validation.sanitized || command);
  if (tokens[0] === 'git') {
    tokens.shift();
  }
  if (tokens.length === 0) {
    return { error: 'Git command is required' };
  }

  const [subcommand, ...rest] = tokens;
  switch (subcommand) {
    case 'status':
      if (rest.length === 0 || (rest.length === 1 && rest[0] === '--porcelain')) {
        return { args: [subcommand, ...rest] };
      }
      break;
    case 'diff':
      if (rest.length <= 2) {
        return { args: [subcommand, ...rest] };
      }
      break;
    case 'branch':
      if (rest.length === 1 && rest[0] === '-a') {
        return { args: [subcommand, ...rest] };
      }
      break;
    case 'log':
      if (rest.length <= 3) {
        return { args: [subcommand, ...rest] };
      }
      break;
    case 'rev-parse':
      if (rest.length === 1 && rest[0] === '--abbrev-ref') {
        return { args: [subcommand, ...rest, 'HEAD'] };
      }
      if (rest.length === 2 && rest[0] === '--abbrev-ref' && rest[1] === 'HEAD') {
        return { args: [subcommand, ...rest] };
      }
      break;
    default:
      break;
  }

  return { error: `Unsupported git-command subcommand: ${subcommand}` };
}

function validateGitRef(value: string, label: string): string | null {
  if (!value || !SAFE_GIT_REF_PATTERN.test(value)) {
    return `${label} contains unsupported characters`;
  }
  return null;
}

function resolveGitPath(filePath: string, workspacePath: string): { relativePath?: string; error?: string } {
  const validation = resolveValidatedPath(filePath, workspacePath, {
    allowAbsolute: true,
    sanitizeFilename: false,
  });
  if (!validation.valid || !validation.resolvedPath) {
    return { error: `Invalid file path: ${validation.errors.join('; ')}` };
  }

  const relativePath = path.relative(workspacePath, validation.resolvedPath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    return { error: 'File path must stay within the workspace' };
  }

  return { relativePath };
}

async function runGit(workspacePath: string, args: string[]): Promise<GitExecResult> {
  return new Promise((resolve) => {
    log.info(`Running git ${args.join(' ')}`);

    const child = spawn('git', args, {
      cwd: workspacePath,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, stderr });
        return;
      }
      const error = stderr.trim() || stdout.trim() || `git exited with code ${code}`;
      resolve({ success: false, output: stdout, stderr, error });
    });

    child.on('error', (error) => {
      resolve({ success: false, stderr, error: error.message });
    });
  });
}

function parseGitStatus(output: string): { staged: string[]; modified: string[]; untracked: string[]; deleted: string[] } {
  const lines = output.split('\n').filter((line) => line.trim());
  const result = {
    staged: [] as string[],
    modified: [] as string[],
    untracked: [] as string[],
    deleted: [] as string[],
  };

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3).trim();

    if (status.startsWith('A') || status.startsWith('M') || status.startsWith('D')) {
      if (status[0] !== ' ') {
        result.staged.push(file);
      }
    }
    if (status[1] === 'M') {
      result.modified.push(file);
    }
    if (status === '??') {
      result.untracked.push(file);
    }
    if (status[1] === 'D') {
      result.deleted.push(file);
    }
  }

  return result;
}

export function register(deps: GitHandlersDeps): void {
  const { ipcMain, getWorkspacePath } = deps;

  ipcMain.handle('git-status', async (): Promise<GitStatusResult> => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const branchResult = await runGit(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = branchResult.success ? (branchResult.output || '').trim() : 'unknown';

    const statusResult = await runGit(workspacePath, ['status', '--porcelain']);
    if (!statusResult.success) {
      return { success: false, error: statusResult.error };
    }

    return {
      success: true,
      branch,
      ...parseGitStatus(statusResult.output || ''),
    };
  });

  ipcMain.handle('git-commit', async (_event, message: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const validation = validateCommand(message, { allowShellOperators: true });
    if (!validation.valid || !(validation.sanitized || '').trim()) {
      return { success: false, error: 'Commit message required' };
    }

    const addResult = await runGit(workspacePath, ['add', '--all']);
    if (!addResult.success) {
      return addResult;
    }

    return runGit(workspacePath, ['commit', '-m', (validation.sanitized || message).trim()]);
  });

  ipcMain.handle('git-command', async (_event, command: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const parsed = parseSafeGitCommand(command);
    if (!parsed.args) {
      return { success: false, error: parsed.error || 'Unsupported git command' };
    }

    return runGit(workspacePath, parsed.args);
  });

  ipcMain.handle('git-diff', async (_event, filePath?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    if (!filePath) {
      return runGit(workspacePath, ['diff']);
    }

    const resolved = resolveGitPath(filePath, workspacePath);
    if (!resolved.relativePath) {
      return { success: false, error: resolved.error };
    }

    return runGit(workspacePath, ['diff', '--', resolved.relativePath]);
  });

  ipcMain.handle('git-stage', async (_event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const resolved = resolveGitPath(filePath, workspacePath);
    if (!resolved.relativePath) {
      return { success: false, error: resolved.error };
    }

    return runGit(workspacePath, ['add', '--', resolved.relativePath]);
  });

  ipcMain.handle('git-unstage', async (_event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const resolved = resolveGitPath(filePath, workspacePath);
    if (!resolved.relativePath) {
      return { success: false, error: resolved.error };
    }

    return runGit(workspacePath, ['reset', 'HEAD', '--', resolved.relativePath]);
  });

  ipcMain.handle('git-push', async (_event, remote?: string, branch?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const remoteName = remote || 'origin';
    const branchName = branch || 'HEAD';
    const remoteError = validateGitRef(remoteName, 'Remote');
    const branchError = branchName === 'HEAD' ? null : validateGitRef(branchName, 'Branch');
    if (remoteError || branchError) {
      return { success: false, error: remoteError || branchError || 'Invalid git ref' };
    }

    return runGit(workspacePath, ['push', remoteName, branchName]);
  });

  ipcMain.handle('git-pull', async (_event, remote?: string, branch?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const remoteName = remote || 'origin';
    const branchName = branch || 'HEAD';
    const remoteError = validateGitRef(remoteName, 'Remote');
    const branchError = branchName === 'HEAD' ? null : validateGitRef(branchName, 'Branch');
    if (remoteError || branchError) {
      return { success: false, error: remoteError || branchError || 'Invalid git ref' };
    }

    return runGit(workspacePath, ['pull', remoteName, branchName]);
  });

  ipcMain.handle('git-branches', async () => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const result = await runGit(workspacePath, ['branch', '-a']);
    if (!result.success) {
      return result;
    }

    const branches = (result.output || '')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const trimmed = line.trim();
        const isCurrent = trimmed.startsWith('*');
        const name = trimmed.replace(/^\*\s*/, '').replace(/^remotes\/[^/]+\//, '');
        return {
          name,
          current: isCurrent,
          remote: trimmed.includes('remotes/'),
        };
      });

    return { success: true, branches };
  });

  ipcMain.handle('git-checkout', async (_event, branch: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const branchError = validateGitRef(branch, 'Branch');
    if (branchError) {
      return { success: false, error: branchError };
    }

    return runGit(workspacePath, ['checkout', branch]);
  });

  ipcMain.handle('git-create-branch', async (_event, branch: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const branchError = validateGitRef(branch, 'Branch');
    if (branchError) {
      return { success: false, error: branchError };
    }

    return runGit(workspacePath, ['checkout', '-b', branch]);
  });
}
