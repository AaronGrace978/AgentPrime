/**
 * VibeHub IPC Handlers - Enhanced Version
 * Exposes VibeHub integration to renderer process
 * 
 * Features:
 * - Full project status with remote sync info
 * - File diffs with line counts
 * - Remote operations (push, pull, fetch)
 * - Stash management
 * - Checkpoint revert/undo
 * - Configuration management
 * - Project log streaming
 * - Real-time file change events
 */

import { ipcMain, BrowserWindow } from 'electron';
import { 
  getVibeHubIntegration, 
  VibeHubIntegration, 
  VibeHubConfig,
  FileChange,
  FileDiff,
  Checkpoint,
  Version,
  Remote,
  StashEntry
} from '../integrations/vibehub';
import aiProvider from '../ai-providers';

let vibeHub: VibeHubIntegration | null = null;

export function registerVibeHubHandlers(getWorkspacePath?: () => string | null): void {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION & CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Initialize VibeHub for workspace
  ipcMain.handle('vibehub:init', async (_, workspacePath: string, config?: Partial<VibeHubConfig>) => {
    vibeHub = new VibeHubIntegration(workspacePath, config);
    
    // Set AI provider for intelligent commit messages
    vibeHub.setAIProvider(aiProvider);
    
    // Set up event forwarding to renderer
    const windows = BrowserWindow.getAllWindows();
    
    vibeHub.on('file-changed', (data) => {
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('vibehub:file-changed', data);
        }
      });
    });

    vibeHub.on('project-output', (data) => {
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('vibehub:project-output', data);
        }
      });
    });

    vibeHub.on('project-exit', (data) => {
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('vibehub:project-exit', data);
        }
      });
    });

    // Start file watcher if enabled
    vibeHub.startFileWatcher();
    
    return { success: true };
  });

  // Get configuration
  ipcMain.handle('vibehub:get-config', async () => {
    if (!vibeHub) return null;
    return vibeHub.getConfig();
  });

  // Update configuration
  ipcMain.handle('vibehub:update-config', async (_, updates: Partial<VibeHubConfig>) => {
    if (!vibeHub) return { success: false, error: 'Not initialized' };
    vibeHub.updateConfig(updates);
    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get project status
  ipcMain.handle('vibehub:get-status', async () => {
    if (!vibeHub) {
      const wsPath = getWorkspacePath?.();
      if (wsPath) {
        vibeHub = new VibeHubIntegration(wsPath);
        vibeHub.setAIProvider(aiProvider);
      } else {
        return null;
      }
    }
    return vibeHub.getProjectStatus();
  });

  // Check if Git is available
  ipcMain.handle('vibehub:git-available', async () => {
    if (!vibeHub) {
      const wsPath = getWorkspacePath?.();
      if (wsPath) {
        vibeHub = new VibeHubIntegration(wsPath);
      } else {
        return false;
      }
    }
    return vibeHub.isGitAvailable();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINTS (COMMITS)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get checkpoints (commits)
  ipcMain.handle('vibehub:get-checkpoints', async (_, limit?: number) => {
    if (!vibeHub) return [];
    return vibeHub.getCheckpoints(limit || 20);
  });

  // Get a specific checkpoint
  ipcMain.handle('vibehub:get-checkpoint', async (_, checkpointId: string) => {
    if (!vibeHub) return null;
    return vibeHub.getCheckpoint(checkpointId);
  });

  // Generate AI checkpoint message
  ipcMain.handle('vibehub:generate-message', async (_, changedFiles?: string[]) => {
    if (!vibeHub) return '🤖 Save checkpoint';
    return vibeHub.generateCheckpointMessage(changedFiles);
  });

  // Create checkpoint (commit)
  ipcMain.handle('vibehub:create-checkpoint', async (_, message: string, stageAll?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.createCheckpoint(message, stageAll);
  });

  // Revert to a checkpoint
  ipcMain.handle('vibehub:revert-to-checkpoint', async (_, checkpointId: string, mode?: 'soft' | 'mixed' | 'hard') => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.revertToCheckpoint(checkpointId, mode);
  });

  // Undo last checkpoint
  ipcMain.handle('vibehub:undo-checkpoint', async (_, keepChanges?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.undoLastCheckpoint(keepChanges);
  });

  // Amend last checkpoint
  ipcMain.handle('vibehub:amend-checkpoint', async (_, newMessage?: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.amendCheckpoint(newMessage);
  });

  // Get diff between checkpoints
  ipcMain.handle('vibehub:get-checkpoint-diff', async (_, fromId: string, toId: string) => {
    if (!vibeHub) return '';
    return vibeHub.getCheckpointDiff(fromId, toId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSIONS (BRANCHES)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get versions (branches)
  ipcMain.handle('vibehub:get-versions', async () => {
    if (!vibeHub) return [];
    return vibeHub.getVersions();
  });

  // Switch version (branch)
  ipcMain.handle('vibehub:switch-version', async (_, versionName: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.switchVersion(versionName);
  });

  // Create version (branch)
  ipcMain.handle('vibehub:create-version', async (_, name: string, checkout?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.createVersion(name, checkout);
  });

  // Delete version (branch)
  ipcMain.handle('vibehub:delete-version', async (_, name: string, force?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.deleteVersion(name, force);
  });

  // Merge version
  ipcMain.handle('vibehub:merge-version', async (_, name: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.mergeVersion(name);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE CHANGES & DIFFS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get changes
  ipcMain.handle('vibehub:get-changes', async () => {
    if (!vibeHub) return [];
    return vibeHub.getChanges();
  });

  // Get file diff
  ipcMain.handle('vibehub:get-file-diff', async (_, filePath: string, staged?: boolean) => {
    if (!vibeHub) return null;
    return vibeHub.getFileDiff(filePath, staged);
  });

  // Get all diffs
  ipcMain.handle('vibehub:get-all-diffs', async () => {
    if (!vibeHub) return [];
    return vibeHub.getAllDiffs();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGING
  // ═══════════════════════════════════════════════════════════════════════════

  // Stage files
  ipcMain.handle('vibehub:stage-files', async (_, files: string[]) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.stageFiles(files);
  });

  // Unstage files
  ipcMain.handle('vibehub:unstage-files', async (_, files: string[]) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.unstageFiles(files);
  });

  // Discard changes
  ipcMain.handle('vibehub:discard-changes', async (_, files: string[]) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.discardChanges(files);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get remotes
  ipcMain.handle('vibehub:get-remotes', async () => {
    if (!vibeHub) return [];
    return vibeHub.getRemotes();
  });

  // Add remote
  ipcMain.handle('vibehub:add-remote', async (_, name: string, url: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.addRemote(name, url);
  });

  // Remove remote
  ipcMain.handle('vibehub:remove-remote', async (_, name: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.removeRemote(name);
  });

  // Push
  ipcMain.handle('vibehub:push', async (_, remote?: string, branch?: string, setUpstream?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.push(remote, branch, setUpstream);
  });

  // Pull
  ipcMain.handle('vibehub:pull', async (_, remote?: string, branch?: string) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.pull(remote, branch);
  });

  // Fetch
  ipcMain.handle('vibehub:fetch', async (_, remote?: string, prune?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.fetch(remote, prune);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STASH
  // ═══════════════════════════════════════════════════════════════════════════

  // Get stashes
  ipcMain.handle('vibehub:get-stashes', async () => {
    if (!vibeHub) return [];
    return vibeHub.getStashes();
  });

  // Create stash
  ipcMain.handle('vibehub:stash', async (_, message?: string, includeUntracked?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.stash(message, includeUntracked);
  });

  // Apply stash
  ipcMain.handle('vibehub:apply-stash', async (_, index?: number, drop?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.applyStash(index, drop);
  });

  // Drop stash
  ipcMain.handle('vibehub:drop-stash', async (_, index: number) => {
    if (!vibeHub) return { success: false, error: 'No project open' };
    return vibeHub.dropStash(index);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIBEHUB APP
  // ═══════════════════════════════════════════════════════════════════════════

  // Launch VibeHub app - works even without a project open
  ipcMain.handle('vibehub:launch', async () => {
    const { shell, app } = require('electron');
    
    // If we have a vibeHub instance, use it
    if (vibeHub) {
      return vibeHub.launchVibeHub();
    }
    
    // Otherwise, try to launch VibeHub without a project
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const fs = require('fs');
    const path = require('path');
    
    // Check common installation paths
    const possiblePaths: string[] = [];
    
    if (isWindows) {
      possiblePaths.push(
        // Build script output location (REBUILD_VIBEHUB.bat uses C:\temp)
        path.join('C:', 'temp', 'vibehub-target', 'release', 'vibehub.exe'),
        path.join('G:', 'VibeHub', 'src-tauri', 'target', 'release', 'vibehub.exe'),
        path.join('G:', 'VibeHub', 'src-tauri', 'target', 'debug', 'vibehub.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'VibeHub', 'VibeHub.exe'),
        path.join(process.env.PROGRAMFILES || '', 'VibeHub', 'VibeHub.exe'),
      );
    } else if (isMac) {
      possiblePaths.push(
        '/Applications/VibeHub.app/Contents/MacOS/vibehub',
        path.join(process.env.HOME || '', 'Applications', 'VibeHub.app', 'Contents', 'MacOS', 'vibehub'),
      );
    } else {
      possiblePaths.push(
        '/usr/bin/vibehub',
        '/usr/local/bin/vibehub',
        path.join(process.env.HOME || '', '.local', 'bin', 'vibehub'),
      );
    }
    
    // Try to find and launch executable
    for (const exePath of possiblePaths) {
      if (fs.existsSync(exePath)) {
        try {
          const { spawn } = require('child_process');
          const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
          child.unref();
          console.log(`[VibeHub] Launched from: ${exePath}`);
          return { success: true, method: 'executable' };
        } catch (e) {
          console.error('[VibeHub] Failed to launch:', e);
        }
      }
    }
    
    // Try protocol handler as fallback
    try {
      await shell.openExternal('vibehub://');
      return { success: true, method: 'protocol' };
    } catch (e) {
      console.error('[VibeHub] Protocol handler failed:', e);
    }
    
    return { 
      success: false, 
      error: 'VibeHub app not found. Install VibeHub or build it from source.'
    };
  });

  // Check if VibeHub app is available
  ipcMain.handle('vibehub:is-available', async () => {
    if (!vibeHub) {
      const wsPath = getWorkspacePath?.();
      if (wsPath) {
        vibeHub = new VibeHubIntegration(wsPath);
      } else {
        return false;
      }
    }
    return vibeHub.isVibeHubAppAvailable();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Init new project
  ipcMain.handle('vibehub:init-project', async (_, initialCommit?: boolean) => {
    if (!vibeHub) return { success: false, error: 'No workspace open' };
    return vibeHub.initProject(initialCommit);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT RUNNING
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect project type
  ipcMain.handle('vibehub:detect-project', async () => {
    if (!vibeHub) {
      const wsPath = getWorkspacePath?.();
      if (wsPath) {
        vibeHub = new VibeHubIntegration(wsPath);
      } else {
        return null;
      }
    }
    return vibeHub.detectProject();
  });

  // Run the project
  ipcMain.handle('vibehub:run-project', async () => {
    if (!vibeHub) {
      const wsPath = getWorkspacePath?.();
      if (wsPath) {
        vibeHub = new VibeHubIntegration(wsPath);
        vibeHub.setAIProvider(aiProvider);
      } else {
        return { success: false, message: 'No workspace open. Open a folder first.' };
      }
    }
    return vibeHub.runProject();
  });

  // Stop the project
  ipcMain.handle('vibehub:stop-project', async () => {
    if (!vibeHub) return { success: false, message: 'No project is running.' };
    return vibeHub.stopProject();
  });

  // Check if project is running
  ipcMain.handle('vibehub:is-running', async () => {
    if (!vibeHub) return false;
    return vibeHub.isProjectRunning();
  });

  // Get running project info
  ipcMain.handle('vibehub:get-running-info', async () => {
    if (!vibeHub) return null;
    return vibeHub.getRunningProjectInfo();
  });

  // Get project logs
  ipcMain.handle('vibehub:get-logs', async () => {
    if (!vibeHub) return [];
    return vibeHub.getProjectLogs();
  });

  // Clear project logs
  ipcMain.handle('vibehub:clear-logs', async () => {
    if (!vibeHub) return;
    vibeHub.clearProjectLogs();
  });

  // Open running project in browser
  ipcMain.handle('vibehub:open-in-browser', async () => {
    if (!vibeHub) return { success: false, message: 'No project is running.' };
    return vibeHub.openInBrowser();
  });

  console.log('[IPC] VibeHub handlers registered (enhanced version)');
}
