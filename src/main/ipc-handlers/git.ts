/**
 * AgentPrime - Git IPC Handlers
 * Handles Git operations via IPC
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { IpcMain } from 'electron';

const execAsync = promisify(exec);

interface GitStatusResult {
  success: boolean;
  branch?: string;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  deleted?: string[];
  error?: string;
}

/**
 * Ensure Git is configured with user identity
 */
async function ensureGitConfig(workspacePath: string): Promise<void> {
  try {
    // Check if user.name is set
    const nameCheck = await execAsync('git config user.name', {
      cwd: workspacePath,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    }).catch(() => ({ stdout: '' }));
    
    if (!nameCheck.stdout || !nameCheck.stdout.trim()) {
      // Set default Git config if not configured
      await execAsync('git config user.name "AgentPrime User"', {
        cwd: workspacePath,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
      }).catch(() => {}); // Ignore errors if config fails
    }

    // Check if user.email is set
    const emailCheck = await execAsync('git config user.email', {
      cwd: workspacePath,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    }).catch(() => ({ stdout: '' }));
    
    if (!emailCheck.stdout || !emailCheck.stdout.trim()) {
      // Set default Git config if not configured
      await execAsync('git config user.email "agentprime@local.dev"', {
        cwd: workspacePath,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
      }).catch(() => {}); // Ignore errors if config fails
    }
  } catch (error) {
    // Silently fail - Git might not be initialized or config might be locked
  }
}

/**
 * Execute git command in workspace
 */
async function execGit(workspacePath: string, command: string): Promise<{ success: boolean; output?: string; stderr?: string; error?: string }> {
  if (!workspacePath) {
    return { success: false, error: 'No workspace' };
  }

  // Ensure Git is configured before running commands
  await ensureGitConfig(workspacePath);

  try {
    const { stdout, stderr } = await execAsync(`git ${command}`, {
      cwd: workspacePath,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
      maxBuffer: 10 * 1024 * 1024
    });
    return { success: true, output: stdout, stderr };
  } catch (error: any) {
    // If error is about missing Git config, try to set it and retry once
    if (error.message && error.message.includes('Author identity unknown')) {
      await ensureGitConfig(workspacePath);
      try {
        const { stdout, stderr } = await execAsync(`git ${command}`, {
          cwd: workspacePath,
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
          maxBuffer: 10 * 1024 * 1024
        });
        return { success: true, output: stdout, stderr };
      } catch (retryError: any) {
        return { success: false, error: retryError.message, stderr: retryError.stderr };
      }
    }
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

/**
 * Parse git status output
 */
function parseGitStatus(output: string): { staged: string[]; modified: string[]; untracked: string[]; deleted: string[] } {
  const lines = output.split('\n').filter(l => l.trim());
  const result = {
    staged: [] as string[],
    modified: [] as string[],
    untracked: [] as string[],
    deleted: [] as string[]
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

interface GitHandlersDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
}

/**
 * Register git-related IPC handlers
 */
export function register(deps: GitHandlersDeps): void {
  const { ipcMain, getWorkspacePath } = deps;

  // Get git status
  ipcMain.handle('git-status', async (): Promise<GitStatusResult> => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }
    
    // Get branch name
    const branchResult = await execGit(workspacePath, 'rev-parse --abbrev-ref HEAD');
    const branch = branchResult.success ? (branchResult.output || '').trim() : 'unknown';

    // Get status
    const statusResult = await execGit(workspacePath, 'status --porcelain');
    if (!statusResult.success) {
      return { success: false, error: statusResult.error };
    }

    const parsed = parseGitStatus(statusResult.output || '');

    return {
      success: true,
      branch,
      ...parsed
    };
  });

  // Git commit
  ipcMain.handle('git-commit', async (event, message: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }
    
    if (!message || !message.trim()) {
      return { success: false, error: 'Commit message required' };
    }

    const result = await execGit(workspacePath, `add . && git commit -m "${message.replace(/"/g, '\\"')}"`);
    return result;
  });

  // Git command (generic)
  ipcMain.handle('git-command', async (event, command: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    return execGit(workspacePath, command);
  });

  // Git diff
  ipcMain.handle('git-diff', async (event, filePath?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const cmd = filePath ? `diff "${filePath}"` : 'diff';
    return execGit(workspacePath, cmd);
  });

  // Git stage file
  ipcMain.handle('git-stage', async (event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    return execGit(workspacePath, `add "${filePath}"`);
  });

  // Git unstage file
  ipcMain.handle('git-unstage', async (event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    return execGit(workspacePath, `reset HEAD "${filePath}"`);
  });

  // Git push
  ipcMain.handle('git-push', async (event, remote?: string, branch?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const remoteName = remote || 'origin';
    const branchName = branch || 'HEAD';
    return execGit(workspacePath, `push ${remoteName} ${branchName}`);
  });

  // Git pull
  ipcMain.handle('git-pull', async (event, remote?: string, branch?: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const remoteName = remote || 'origin';
    const branchName = branch || 'HEAD';
    return execGit(workspacePath, `pull ${remoteName} ${branchName}`);
  });

  // Git branches
  ipcMain.handle('git-branches', async () => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    const result = await execGit(workspacePath, 'branch -a');
    if (!result.success) {
      return result;
    }

    const branches = (result.output || '')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const trimmed = line.trim();
        const isCurrent = trimmed.startsWith('*');
        const name = trimmed.replace(/^\*\s*/, '').replace(/^remotes\/[^/]+\//, '');
        return {
          name,
          current: isCurrent,
          remote: trimmed.includes('remotes/')
        };
      });

    return { success: true, branches };
  });

  // Git checkout branch
  ipcMain.handle('git-checkout', async (event, branch: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    return execGit(workspacePath, `checkout "${branch}"`);
  });

  // Git create branch
  ipcMain.handle('git-create-branch', async (event, branch: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return { success: false, error: 'No workspace' };
    }

    return execGit(workspacePath, `checkout -b "${branch}"`);
  });
}
