/**
 * AgentPrime x VibeHub Integration - Enhanced Version
 * Connects AgentPrime IDE with VibeHub version control
 * 
 * Features:
 * - Human-friendly Git vocabulary (Checkpoints, Versions, etc.)
 * - True AI-powered commit messages using AgentPrime's AI providers
 * - Cross-platform support (Windows, macOS, Linux)
 * - Remote repository operations (push, pull, fetch)
 * - File diff preview
 * - Revert/undo functionality
 * - Stash support
 * - Enhanced project detection and running
 * - Real-time file watching
 * - Configurable settings
 * 
 * "GitHub for Vibe Coders" meets "AI Coding Assistant"
 */

import { exec, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { promisify } from 'util';
import { ProjectRunner, ProjectInfo } from '../agent/tools/projectRunner';
import { createLogger } from '../core/logger';
import { EventEmitter } from 'events';

const log = createLogger('VibeHub');
const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VibeHubConfig {
  vibeHubPath: string | null;           // Path to VibeHub app (null = auto-detect)
  enableAIMessages: boolean;             // Use AI for commit messages
  aiMessageStyle: 'conventional' | 'friendly' | 'detailed';
  autoStageOnSave: boolean;              // Auto-stage files on save
  showDiffPreview: boolean;              // Show diff preview in UI
  defaultRemote: string;                 // Default remote name
  pushAfterCheckpoint: boolean;          // Auto-push after creating checkpoint
  watchForChanges: boolean;              // Enable file watching
  projectRunConfig: {
    autoInstallDeps: boolean;
    createVenvForPython: boolean;
    preferredNodePackageManager: 'npm' | 'yarn' | 'pnpm';
  };
}

export interface Checkpoint {
  id: string;
  message: string;
  timestamp: number;
  author: string;
  email?: string;
  aiGenerated: boolean;
  files: string[];
  shortId: string;
  parentId?: string;
}

export interface Version {
  name: string;
  current: boolean;
  isRemote: boolean;
  lastCheckpoint?: Checkpoint;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface VibeHubProject {
  path: string;
  name: string;
  isGitRepo: boolean;
  currentVersion: string;
  checkpointCount: number;
  hasUnstagedChanges: boolean;
  hasReadyToSave: boolean;
  remotes: Remote[];
  syncStatus?: {
    ahead: number;
    behind: number;
    remote: string;
  };
}

export interface FileDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  staged: boolean;
  additions: number;
  deletions: number;
  diff: string;         // Actual diff content
  oldPath?: string;     // For renamed files
}

export interface FileChange {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  staged: boolean;
  additions?: number;
  deletions?: number;
}

export interface StashEntry {
  id: number;
  message: string;
  branch: string;
  timestamp: number;
}

export interface RunningProject {
  pid: number;
  startTime: number;
  type: string;
  port?: number;
  command: string;
  logs: string[];
}

export interface ProjectRunResult {
  success: boolean;
  message: string;
  projectType?: string;
  port?: number;
  url?: string;
  pid?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: VibeHubConfig = {
  vibeHubPath: null,
  enableAIMessages: true,
  aiMessageStyle: 'friendly',
  autoStageOnSave: false,
  showDiffPreview: true,
  defaultRemote: 'origin',
  pushAfterCheckpoint: false,
  watchForChanges: true,
  projectRunConfig: {
    autoInstallDeps: true,
    createVenvForPython: true,
    preferredNodePackageManager: 'npm'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VIBEHUB INTEGRATION CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class VibeHubIntegration extends EventEmitter {
  private workspacePath: string;
  private config: VibeHubConfig;
  private runningProcess: ChildProcess | null = null;
  private runningProjectInfo: RunningProject | null = null;
  private gitAvailable: boolean | null = null;
  private gitPath: string = 'git';
  private fileWatcher: FSWatcher | null = null;
  private aiProvider: any = null;  // Will be set externally
  private projectLogs: string[] = [];
  private maxLogs: number = 500;
  
  constructor(workspacePath: string, config: Partial<VibeHubConfig> = {}) {
    super();
    this.workspacePath = workspacePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current configuration
   */
  getConfig(): VibeHubConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VibeHubConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Re-initialize file watcher if watch setting changed
    if ('watchForChanges' in updates) {
      if (updates.watchForChanges) {
        this.startFileWatcher();
      } else {
        this.stopFileWatcher();
      }
    }
  }

  /**
   * Set AI provider for generating commit messages
   */
  setAIProvider(provider: any): void {
    this.aiProvider = provider;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GIT DETECTION (CROSS-PLATFORM)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find Git executable across platforms
   */
  private findGitExecutable(): string | null {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    
    const paths: string[] = [];
    
    if (isWindows) {
      // Windows paths
      paths.push(
        'C:\\Program Files\\Git\\bin\\git.exe',
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\bin\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'git.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'git.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Git', 'cmd', 'git.exe'),
        path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'git.exe'),
      );
    } else if (isMac) {
      // macOS paths
      paths.push(
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/opt/homebrew/bin/git',
        '/opt/local/bin/git',
        path.join(process.env.HOME || '', '.local', 'bin', 'git'),
      );
    } else {
      // Linux paths
      paths.push(
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/snap/bin/git',
        path.join(process.env.HOME || '', '.local', 'bin', 'git'),
        path.join(process.env.HOME || '', 'bin', 'git'),
      );
    }

    for (const gitPath of paths) {
      if (fs.existsSync(gitPath)) {
        log.info(`[VibeHub] Found Git at: ${gitPath}`);
        return gitPath;
      }
    }
    return null;
  }

  /**
   * Check if Git is available (cached for performance)
   */
  async isGitAvailable(): Promise<boolean> {
    if (this.gitAvailable !== null) {
      return this.gitAvailable;
    }

    // First try git in PATH
    try {
      await execAsync('git --version');
      this.gitAvailable = true;
      this.gitPath = 'git';
      log.info('[VibeHub] Git is available in PATH');
      return true;
    } catch (error) {
      // Git not in PATH, try common locations
    }

    // Try to find Git in common installation locations
    const foundGit = this.findGitExecutable();
    if (foundGit) {
      try {
        await execAsync(`"${foundGit}" --version`);
        this.gitAvailable = true;
        this.gitPath = foundGit;
        log.info(`[VibeHub] Git found at: ${foundGit}`);
        return true;
      } catch (error) {
        // Found but couldn't execute
      }
    }

    this.gitAvailable = false;
    log.warn('[VibeHub] Git is not available. Version control features will be disabled.');
    return false;
  }

  /**
   * Execute a git command
   * Automatically handles Git's safe.directory security check on Windows
   */
  private async execGit(args: string, options?: { cwd?: string; maxBuffer?: number }): Promise<{ stdout: string; stderr: string }> {
    const gitCmd = this.gitPath === 'git' ? 'git' : `"${this.gitPath}"`;
    const targetCwd = options?.cwd || this.workspacePath;
    
    try {
      return await execAsync(`${gitCmd} ${args}`, {
        cwd: targetCwd,
        maxBuffer: options?.maxBuffer || 10 * 1024 * 1024 // 10MB default
      });
    } catch (error: any) {
      // Handle Git's safe.directory security check (CVE-2022-24765)
      // This occurs on Windows when directory ownership doesn't match current user
      if (error?.stderr?.includes('dubious ownership') || error?.message?.includes('dubious ownership')) {
        log.info(`[VibeHub] Adding ${targetCwd} to Git safe.directory list`);
        try {
          // Add this specific directory to the safe list (forward slashes for Git)
          const safePath = targetCwd.replace(/\\/g, '/');
          await execAsync(`${gitCmd} config --global --add safe.directory "${safePath}"`);
          // Retry the original command
          return await execAsync(`${gitCmd} ${args}`, {
            cwd: targetCwd,
            maxBuffer: options?.maxBuffer || 10 * 1024 * 1024
          });
        } catch (retryError) {
          log.error('[VibeHub] Failed to add safe.directory:', retryError);
          throw error; // Throw original error if retry fails
        }
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIBEHUB APP INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the path to the VibeHub executable
   */
  getVibeHubExePath(): string | null {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    
    // If custom path is configured, check it first
    if (this.config.vibeHubPath) {
      const customExe = isWindows 
        ? path.join(this.config.vibeHubPath, 'vibehub.exe')
        : path.join(this.config.vibeHubPath, 'vibehub');
      if (fs.existsSync(customExe)) {
        return customExe;
      }
    }

    const possiblePaths: string[] = [];
    
    if (isWindows) {
      possiblePaths.push(
        // Build script output location (REBUILD_VIBEHUB.bat uses C:\temp)
        path.join('C:', 'temp', 'vibehub-target', 'release', 'vibehub.exe'),
        // Development builds
        path.join('G:', 'VibeHub', 'src-tauri', 'target', 'release', 'vibehub.exe'),
        path.join('G:', 'VibeHub', 'src-tauri', 'target', 'debug', 'vibehub.exe'),
        // Installed locations
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'VibeHub', 'VibeHub.exe'),
        path.join(process.env.PROGRAMFILES || '', 'VibeHub', 'VibeHub.exe'),
        path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'VibeHub', 'VibeHub.exe'),
      );
    } else if (isMac) {
      possiblePaths.push(
        '/Applications/VibeHub.app/Contents/MacOS/vibehub',
        path.join(process.env.HOME || '', 'Applications', 'VibeHub.app', 'Contents', 'MacOS', 'vibehub'),
        '/usr/local/bin/vibehub',
      );
    } else {
      possiblePaths.push(
        '/usr/bin/vibehub',
        '/usr/local/bin/vibehub',
        path.join(process.env.HOME || '', '.local', 'bin', 'vibehub'),
        '/opt/vibehub/vibehub',
      );
    }

    for (const exePath of possiblePaths) {
      if (fs.existsSync(exePath)) {
        return exePath;
      }
    }
    return null;
  }

  /**
   * Check if VibeHub app is available
   */
  isVibeHubAppAvailable(): boolean {
    return this.getVibeHubExePath() !== null;
  }

  /**
   * Check if current workspace is a Git/VibeHub project
   */
  async isVibeHubProject(): Promise<boolean> {
    const gitPath = path.join(this.workspacePath, '.git');
    return fs.existsSync(gitPath);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get project status in VibeHub-friendly terms
   */
  async getProjectStatus(): Promise<VibeHubProject> {
    const isGitRepo = await this.isVibeHubProject();
    const gitAvailable = await this.isGitAvailable();
    
    if (!isGitRepo || !gitAvailable) {
      return {
        path: this.workspacePath,
        name: path.basename(this.workspacePath),
        isGitRepo: isGitRepo && gitAvailable,
        currentVersion: gitAvailable ? 'Not a project yet' : 'Git not installed',
        checkpointCount: 0,
        hasUnstagedChanges: false,
        hasReadyToSave: false,
        remotes: []
      };
    }

    try {
      // Get current branch (version)
      const { stdout: branch } = await this.execGit('rev-parse --abbrev-ref HEAD');

      // Get commit count (checkpoints)
      let checkpointCount = 0;
      try {
        const { stdout: count } = await this.execGit('rev-list --count HEAD');
        checkpointCount = parseInt(count.trim()) || 0;
      } catch {
        // No commits yet
      }

      // Get status
      const { stdout: status } = await this.execGit('status --porcelain');

      const statusLines = status.trim().split('\n').filter(l => l);
      const hasUnstaged = statusLines.some(l => l[1] !== ' ' && l[1] !== '?');
      const hasStaged = statusLines.some(l => l[0] !== ' ' && l[0] !== '?');

      // Get remotes
      const remotes = await this.getRemotes();

      // Get sync status with default remote
      let syncStatus: VibeHubProject['syncStatus'] = undefined;
      if (remotes.length > 0) {
        try {
          const remoteName = this.config.defaultRemote || remotes[0].name;
          const branchName = branch.trim();
          
          const { stdout: ahead } = await this.execGit(`rev-list --count ${remoteName}/${branchName}..HEAD`).catch(() => ({ stdout: '0' }));
          const { stdout: behind } = await this.execGit(`rev-list --count HEAD..${remoteName}/${branchName}`).catch(() => ({ stdout: '0' }));
          
          syncStatus = {
            ahead: parseInt(ahead.trim()) || 0,
            behind: parseInt(behind.trim()) || 0,
            remote: remoteName
          };
        } catch {
          // Remote tracking not set up
        }
      }

      return {
        path: this.workspacePath,
        name: path.basename(this.workspacePath),
        isGitRepo: true,
        currentVersion: branch.trim(),
        checkpointCount,
        hasUnstagedChanges: hasUnstaged || statusLines.some(l => l.startsWith('??')),
        hasReadyToSave: hasStaged,
        remotes,
        syncStatus
      };
    } catch (error) {
      log.error('[VibeHub] Error getting project status:', error);
      return {
        path: this.workspacePath,
        name: path.basename(this.workspacePath),
        isGitRepo: true,
        currentVersion: 'unknown',
        checkpointCount: 0,
        hasUnstagedChanges: false,
        hasReadyToSave: false,
        remotes: []
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINTS (COMMITS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get recent checkpoints (commits) with VibeHub-friendly format
   */
  async getCheckpoints(limit: number = 10): Promise<Checkpoint[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    try {
      const { stdout } = await this.execGit(
        `log -${limit} --pretty=format:"%H|%h|%s|%at|%an|%ae|%P" --name-only`
      );

      const checkpoints: Checkpoint[] = [];
      const entries = stdout.split('\n\n');

      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        if (lines.length === 0 || !lines[0]) continue;

        const [hash, shortHash, message, timestamp, author, email, parents] = lines[0].split('|');
        const files = lines.slice(1).filter(f => f.trim());

        checkpoints.push({
          id: hash,
          shortId: shortHash,
          message: message || 'No message',
          timestamp: parseInt(timestamp) * 1000,
          author: author || 'Unknown',
          email: email,
          aiGenerated: message?.includes('[AI]') || message?.includes('🤖'),
          files,
          parentId: parents?.split(' ')[0]
        });
      }

      return checkpoints;
    } catch (error) {
      log.error('[VibeHub] Error getting checkpoints:', error);
      return [];
    }
  }

  /**
   * Get a specific checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    if (!await this.isGitAvailable()) {
      return null;
    }

    try {
      const { stdout } = await this.execGit(
        `log -1 --pretty=format:"%H|%h|%s|%at|%an|%ae|%P" --name-only ${checkpointId}`
      );

      const lines = stdout.trim().split('\n');
      if (lines.length === 0 || !lines[0]) return null;

      const [hash, shortHash, message, timestamp, author, email, parents] = lines[0].split('|');
      const files = lines.slice(1).filter(f => f.trim());

      return {
        id: hash,
        shortId: shortHash,
        message: message || 'No message',
        timestamp: parseInt(timestamp) * 1000,
        author: author || 'Unknown',
        email: email,
        aiGenerated: message?.includes('[AI]') || message?.includes('🤖'),
        files,
        parentId: parents?.split(' ')[0]
      };
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSIONS (BRANCHES)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all versions (branches) with enhanced info
   */
  async getVersions(): Promise<Version[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    try {
      // Get local branches with tracking info
      const { stdout: branches } = await this.execGit(
        'for-each-ref --format="%(refname:short)|%(HEAD)|%(upstream:short)|%(upstream:track)" refs/heads/'
      );

      const { stdout: current } = await this.execGit('rev-parse --abbrev-ref HEAD');
      const currentBranch = current.trim();

      const versions: Version[] = [];

      for (const line of branches.trim().split('\n').filter(l => l)) {
        const [name, isCurrent, upstream, track] = line.split('|');
        
        let ahead = 0, behind = 0;
        if (track) {
          const aheadMatch = track.match(/ahead (\d+)/);
          const behindMatch = track.match(/behind (\d+)/);
          ahead = aheadMatch ? parseInt(aheadMatch[1]) : 0;
          behind = behindMatch ? parseInt(behindMatch[1]) : 0;
        }

        versions.push({
          name: name.trim(),
          current: name.trim() === currentBranch,
          isRemote: false,
          upstream: upstream || undefined,
          ahead,
          behind
        });
      }

      // Get remote branches
      try {
        const { stdout: remoteBranches } = await this.execGit(
          'for-each-ref --format="%(refname:short)" refs/remotes/'
        );

        for (const line of remoteBranches.trim().split('\n').filter(l => l && !l.endsWith('/HEAD'))) {
          versions.push({
            name: line.trim(),
            current: false,
            isRemote: true
          });
        }
      } catch {
        // No remotes
      }

      return versions;
    } catch (error) {
      log.error('[VibeHub] Error getting versions:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE CHANGES & DIFFS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get changed files with VibeHub-friendly status
   */
  async getChanges(): Promise<FileChange[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    try {
      const { stdout } = await this.execGit('status --porcelain');

      return stdout.trim().split('\n').filter(l => l).map(line => {
        const staged = line[0] !== ' ' && line[0] !== '?';
        const statusChar = staged ? line[0] : line[1];
        const file = line.slice(3);

        let status: FileChange['status'] = 'modified';
        if (statusChar === 'A' || statusChar === '?') status = 'added';
        else if (statusChar === 'D') status = 'deleted';
        else if (statusChar === 'R') status = 'renamed';

        return { file, status, staged };
      });
    } catch (error) {
      log.error('[VibeHub] Error getting changes:', error);
      return [];
    }
  }

  /**
   * Get detailed diff for a file
   */
  async getFileDiff(filePath: string, staged: boolean = false): Promise<FileDiff | null> {
    if (!await this.isGitAvailable()) {
      return null;
    }

    try {
      const stageFlag = staged ? '--cached' : '';
      const { stdout: diffOutput } = await this.execGit(
        `diff ${stageFlag} --no-color -- "${filePath}"`,
        { maxBuffer: 5 * 1024 * 1024 }
      );

      // Get file status
      const { stdout: status } = await this.execGit('status --porcelain');
      const fileLine = status.split('\n').find(l => l.includes(filePath));
      
      let fileStatus: FileDiff['status'] = 'modified';
      let isStaged = false;
      
      if (fileLine) {
        isStaged = fileLine[0] !== ' ' && fileLine[0] !== '?';
        const statusChar = isStaged ? fileLine[0] : fileLine[1];
        if (statusChar === 'A' || statusChar === '?') fileStatus = 'added';
        else if (statusChar === 'D') fileStatus = 'deleted';
        else if (statusChar === 'R') fileStatus = 'renamed';
      }

      // Count additions and deletions
      let additions = 0, deletions = 0;
      for (const line of diffOutput.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }

      return {
        file: filePath,
        status: fileStatus,
        staged: isStaged,
        additions,
        deletions,
        diff: diffOutput
      };
    } catch (error) {
      log.error(`[VibeHub] Error getting diff for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get all diffs summary
   */
  async getAllDiffs(): Promise<FileDiff[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    const changes = await this.getChanges();
    const diffs: FileDiff[] = [];

    for (const change of changes) {
      const diff = await this.getFileDiff(change.file, change.staged);
      if (diff) {
        diffs.push(diff);
      }
    }

    return diffs;
  }

  /**
   * Get diff between two checkpoints
   */
  async getCheckpointDiff(fromId: string, toId: string): Promise<string> {
    if (!await this.isGitAvailable()) {
      return '';
    }

    try {
      const { stdout } = await this.execGit(
        `diff ${fromId}..${toId} --no-color`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout;
    } catch (error) {
      log.error('[VibeHub] Error getting checkpoint diff:', error);
      return '';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI-POWERED COMMIT MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate AI checkpoint message based on changes
   */
  async generateCheckpointMessage(changedFiles?: string[]): Promise<string> {
    if (!await this.isGitAvailable()) {
      return '🤖 Save checkpoint';
    }

    // Get changes if not provided
    if (!changedFiles) {
      const changes = await this.getChanges();
      changedFiles = changes.map(c => c.file);
    }

    if (changedFiles.length === 0) {
      return '🤖 Save checkpoint';
    }

    // If AI is enabled and provider is available, use AI
    if (this.config.enableAIMessages && this.aiProvider) {
      try {
        return await this.generateAIMessage(changedFiles);
      } catch (error) {
        log.error('[VibeHub] AI message generation failed, using heuristics:', error);
      }
    }

    // Fallback to heuristic-based message
    return this.generateHeuristicMessage(changedFiles);
  }

  /**
   * Generate commit message using AI provider
   */
  private async generateAIMessage(changedFiles: string[]): Promise<string> {
    // Get diff summary
    let diffSummary = '';
    try {
      const { stdout: diff } = await this.execGit('diff --stat HEAD', { maxBuffer: 1024 * 1024 });
      diffSummary = diff.slice(0, 2000); // Limit to 2000 chars
    } catch {
      // No commits yet, get staged diff
      try {
        const { stdout: diff } = await this.execGit('diff --staged --stat', { maxBuffer: 1024 * 1024 });
        diffSummary = diff.slice(0, 2000);
      } catch {
        // Ignore
      }
    }

    // Get actual diff content (limited)
    let diffContent = '';
    try {
      const { stdout } = await this.execGit('diff HEAD', { maxBuffer: 512 * 1024 });
      diffContent = stdout.slice(0, 4000); // Limit content
    } catch {
      try {
        const { stdout } = await this.execGit('diff --staged', { maxBuffer: 512 * 1024 });
        diffContent = stdout.slice(0, 4000);
      } catch {
        // Ignore
      }
    }

    // Build style-specific prompt
    let styleInstruction = '';
    switch (this.config.aiMessageStyle) {
      case 'conventional':
        styleInstruction = 'Use conventional commit format (feat:, fix:, docs:, style:, refactor:, test:, chore:). Be concise.';
        break;
      case 'detailed':
        styleInstruction = 'Provide a detailed commit message with a short summary line followed by a blank line and bullet points explaining the changes.';
        break;
      case 'friendly':
      default:
        styleInstruction = 'Write a friendly, human-readable commit message. You can use emojis. Be concise but descriptive.';
    }

    const prompt = `Generate a git commit message for the following changes.

${styleInstruction}

Changed files (${changedFiles.length}):
${changedFiles.slice(0, 20).join('\n')}${changedFiles.length > 20 ? `\n... and ${changedFiles.length - 20} more files` : ''}

Diff summary:
${diffSummary}

${diffContent ? `Diff preview:\n${diffContent}` : ''}

Respond with ONLY the commit message, nothing else.`;

    try {
      const result = await this.aiProvider.chat([
        { role: 'system', content: 'You are a helpful assistant that generates concise, descriptive git commit messages.' },
        { role: 'user', content: prompt }
      ], { 
        temperature: 0.3,
        maxTokens: 200
      });

      if (result.success && result.content) {
        // Clean up the message
        let message = result.content.trim();
        // Remove quotes if wrapped
        if ((message.startsWith('"') && message.endsWith('"')) || 
            (message.startsWith("'") && message.endsWith("'"))) {
          message = message.slice(1, -1);
        }
        // Add AI indicator if not using conventional commits
        if (this.config.aiMessageStyle !== 'conventional' && !message.includes('🤖')) {
          message = '🤖 ' + message;
        }
        return message;
      }
    } catch (error) {
      log.error('[VibeHub] AI message generation error:', error);
    }

    // Fallback
    return this.generateHeuristicMessage(changedFiles);
  }

  /**
   * Generate commit message using heuristics
   */
  private generateHeuristicMessage(changedFiles: string[]): string {
    const fileTypes = new Set(changedFiles.map(f => path.extname(f).slice(1) || 'file'));
    const fileCount = changedFiles.length;
    
    // Simple heuristics for common patterns
    const hasTests = changedFiles.some(f => f.includes('test') || f.includes('spec'));
    const hasStyles = changedFiles.some(f => f.endsWith('.css') || f.endsWith('.scss') || f.endsWith('.less'));
    const hasComponents = changedFiles.some(f => f.includes('component') || f.endsWith('.tsx') || f.endsWith('.jsx'));
    const hasDocs = changedFiles.some(f => f.endsWith('.md') || f.includes('README') || f.includes('docs'));
    const hasConfig = changedFiles.some(f => f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));
    const hasFix = changedFiles.some(f => f.toLowerCase().includes('fix'));

    let message = '🤖 ';
    
    if (hasTests && fileCount <= 3) {
      message += 'Add tests';
    } else if (hasDocs && fileCount <= 2) {
      message += 'Update documentation';
    } else if (hasStyles && !hasComponents) {
      message += 'Style improvements';
    } else if (hasConfig && fileCount <= 2) {
      message += 'Update configuration';
    } else if (hasFix) {
      message += 'Bug fixes';
    } else if (fileCount === 1) {
      const fileName = path.basename(changedFiles[0], path.extname(changedFiles[0]));
      message += `Update ${fileName}`;
    } else if (fileCount <= 3) {
      message += `Update ${Array.from(fileTypes).join(', ')} files`;
    } else {
      message += `Update ${fileCount} files across ${fileTypes.size} types`;
    }

    return message;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a checkpoint (commit)
   */
  async createCheckpoint(message: string, stageAll: boolean = false): Promise<{ success: boolean; error?: string; checkpointId?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed. Install Git to use version control features.' };
    }

    try {
      if (stageAll) {
        await this.execGit('add -A');
      }

      // Check if there's anything to commit
      const { stdout: status } = await this.execGit('status --porcelain');
      const stagedFiles = status.split('\n').filter(l => l && l[0] !== ' ' && l[0] !== '?');
      
      if (stagedFiles.length === 0) {
        return { success: false, error: 'No changes staged for commit. Stage some files first or use "Save All".' };
      }

      // Escape message for shell
      const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      await this.execGit(`commit -m "${escapedMessage}"`);

      // Get the new commit ID
      const { stdout: commitId } = await this.execGit('rev-parse HEAD');

      // Auto-push if enabled
      if (this.config.pushAfterCheckpoint) {
        try {
          await this.push();
        } catch (pushError) {
          log.warn('[VibeHub] Auto-push failed:', pushError);
        }
      }

      return { success: true, checkpointId: commitId.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Revert to a previous checkpoint
   */
  async revertToCheckpoint(checkpointId: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`reset --${mode} ${checkpointId}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Undo the last checkpoint
   */
  async undoLastCheckpoint(keepChanges: boolean = true): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const mode = keepChanges ? '--soft' : '--hard';
      await this.execGit(`reset ${mode} HEAD~1`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Amend the last checkpoint
   */
  async amendCheckpoint(newMessage?: string): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      if (newMessage) {
        const escapedMessage = newMessage.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        await this.execGit(`commit --amend -m "${escapedMessage}"`);
      } else {
        await this.execGit('commit --amend --no-edit');
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Switch to a version (branch)
   */
  async switchVersion(versionName: string): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`checkout "${versionName}"`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new version (branch)
   */
  async createVersion(name: string, checkout: boolean = true): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      if (checkout) {
        await this.execGit(`checkout -b "${name}"`);
      } else {
        await this.execGit(`branch "${name}"`);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a version (branch)
   */
  async deleteVersion(name: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const flag = force ? '-D' : '-d';
      await this.execGit(`branch ${flag} "${name}"`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge a version into current
   */
  async mergeVersion(name: string): Promise<{ success: boolean; error?: string; hasConflicts?: boolean }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`merge "${name}"`);
      return { success: true };
    } catch (error: any) {
      // Check for merge conflicts
      if (error.message.includes('CONFLICT') || error.message.includes('conflict')) {
        return { success: false, error: 'Merge conflicts detected. Resolve them before continuing.', hasConflicts: true };
      }
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGING OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Stage files (make ready to save)
   */
  async stageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      for (const file of files) {
        await this.execGit(`add "${file}"`);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Unstage files
   */
  async unstageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      for (const file of files) {
        await this.execGit(`reset HEAD "${file}"`);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Discard changes in a file
   */
  async discardChanges(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      for (const file of files) {
        await this.execGit(`checkout -- "${file}"`);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get configured remotes
   */
  async getRemotes(): Promise<Remote[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    try {
      const { stdout } = await this.execGit('remote -v');
      const remotes: Map<string, Remote> = new Map();

      for (const line of stdout.trim().split('\n').filter(l => l)) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
        if (match) {
          const [, name, url, type] = match;
          if (!remotes.has(name)) {
            remotes.set(name, { name, fetchUrl: '', pushUrl: '' });
          }
          const remote = remotes.get(name)!;
          if (type === 'fetch') remote.fetchUrl = url;
          if (type === 'push') remote.pushUrl = url;
        }
      }

      return Array.from(remotes.values());
    } catch {
      return [];
    }
  }

  /**
   * Add a remote
   */
  async addRemote(name: string, url: string): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`remote add "${name}" "${url}"`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a remote
   */
  async removeRemote(name: string): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`remote remove "${name}"`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Push to remote
   */
  async push(remote?: string, branch?: string, setUpstream: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const remoteName = remote || this.config.defaultRemote;
      const { stdout: currentBranch } = await this.execGit('rev-parse --abbrev-ref HEAD');
      const branchName = branch || currentBranch.trim();

      let cmd = 'push';
      if (setUpstream) {
        cmd += ' -u';
      }
      cmd += ` "${remoteName}" "${branchName}"`;

      await this.execGit(cmd);
      return { success: true };
    } catch (error: any) {
      // Provide helpful error messages
      if (error.message.includes('no upstream')) {
        return { success: false, error: 'No upstream branch set. Use "Push & Set Upstream" to push and track this branch.' };
      }
      if (error.message.includes('rejected')) {
        return { success: false, error: 'Push rejected. Pull the latest changes first, then try again.' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull from remote
   */
  async pull(remote?: string, branch?: string): Promise<{ success: boolean; error?: string; hasConflicts?: boolean }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const remoteName = remote || this.config.defaultRemote;
      const { stdout: currentBranch } = await this.execGit('rev-parse --abbrev-ref HEAD');
      const branchName = branch || currentBranch.trim();

      await this.execGit(`pull "${remoteName}" "${branchName}"`);
      return { success: true };
    } catch (error: any) {
      if (error.message.includes('CONFLICT') || error.message.includes('conflict')) {
        return { success: false, error: 'Merge conflicts detected. Resolve them before continuing.', hasConflicts: true };
      }
      if (error.message.includes('no tracking')) {
        return { success: false, error: 'No tracking information for this branch. Set an upstream branch first.' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(remote?: string, prune: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const remoteName = remote || '--all';
      let cmd = `fetch ${remoteName}`;
      if (prune) cmd += ' --prune';
      
      await this.execGit(cmd);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STASH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get stash list
   */
  async getStashes(): Promise<StashEntry[]> {
    if (!await this.isGitAvailable()) {
      return [];
    }

    try {
      const { stdout } = await this.execGit('stash list --format="%gd|%s|%at"');
      
      return stdout.trim().split('\n').filter(l => l).map((line, index) => {
        const [id, message, timestamp] = line.split('|');
        return {
          id: index,
          message: message || 'Stashed changes',
          branch: message?.match(/WIP on (\S+):/)?.[1] || 'unknown',
          timestamp: parseInt(timestamp) * 1000
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Create a stash
   */
  async stash(message?: string, includeUntracked: boolean = true): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      let cmd = 'stash push';
      if (includeUntracked) cmd += ' -u';
      if (message) cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
      
      await this.execGit(cmd);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Apply a stash
   */
  async applyStash(index: number = 0, drop: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      const cmd = drop ? 'stash pop' : 'stash apply';
      await this.execGit(`${cmd} stash@{${index}}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Drop a stash
   */
  async dropStash(index: number): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed.' };
    }

    try {
      await this.execGit(`stash drop stash@{${index}}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize a new project (git init)
   */
  async initProject(initialCommit: boolean = true): Promise<{ success: boolean; error?: string }> {
    if (!await this.isGitAvailable()) {
      return { success: false, error: 'Git is not installed. Install Git to use version control features: https://git-scm.com' };
    }

    try {
      await this.execGit('init');
      
      if (initialCommit) {
        // Create .gitignore if it doesn't exist
        const gitignorePath = path.join(this.workspacePath, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
          const defaultIgnore = `# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Build outputs
dist/
build/
*.egg-info/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Environment
.env
.env.local
*.log
`;
          fs.writeFileSync(gitignorePath, defaultIgnore);
        }

        await this.execGit('add -A');
        await this.execGit('commit -m "🎉 Start new project"');
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Launch VibeHub app for this project
   */
  async launchVibeHub(): Promise<{ success: boolean; method?: string; error?: string }> {
    const { shell } = require('electron');
    
    const vibeHubExe = this.getVibeHubExePath();
    
    if (vibeHubExe) {
      try {
        const child = spawn(vibeHubExe, [this.workspacePath], { 
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        log.info(`[VibeHub] Launched from: ${vibeHubExe}`);
        return { success: true, method: 'executable' };
      } catch (error: any) {
        log.error('[VibeHub] Failed to launch executable:', error);
      }
    }

    // Try protocol handler as fallback
    try {
      await shell.openExternal(`vibehub://open?path=${encodeURIComponent(this.workspacePath)}`);
      return { success: true, method: 'protocol' };
    } catch (error: any) {
      log.error('[VibeHub] Protocol handler failed:', error);
    }

    return { 
      success: false, 
      error: 'VibeHub app not found. Install VibeHub or configure the path in settings.'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE WATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start watching for file changes
   */
  startFileWatcher(): void {
    if (this.fileWatcher) {
      this.stopFileWatcher();
    }

    if (!this.config.watchForChanges) {
      return;
    }

    try {
      this.fileWatcher = chokidar.watch(this.workspacePath, {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.next/**',
          '**/target/**',
          '**/release/**'
        ],
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 }
      });

      this.fileWatcher.on('all', (event, filepath) => {
        if (!filepath) return;
        const norm = filepath.replace(/\\/g, '/');
        if (norm.includes('/.git/') || norm.endsWith('/.git')) return;
        this.emit('file-changed', { type: event, file: filepath });
      });

      this.fileWatcher.on('error', (error) => {
        log.error('[VibeHub] File watcher error:', error);
      });

      log.info('[VibeHub] File watcher started (chokidar)');
    } catch (error) {
      log.error('[VibeHub] Failed to start file watcher:', error);
    }
  }

  /**
   * Stop watching for file changes
   */
  stopFileWatcher(): void {
    if (this.fileWatcher) {
      void this.fileWatcher.close().catch(() => {});
      this.fileWatcher = null;
      log.info('[VibeHub] File watcher stopped');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT RUNNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect project type and get run configuration
   */
  async detectProject(): Promise<ProjectInfo> {
    return ProjectRunner.detectProject(this.workspacePath);
  }

  /**
   * Check if a project is currently running
   */
  isProjectRunning(): boolean {
    if (!this.runningProcess) return false;
    
    try {
      if (this.runningProcess.killed || this.runningProcess.exitCode !== null) {
        this.runningProcess = null;
        this.runningProjectInfo = null;
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get info about the running project
   */
  getRunningProjectInfo(): RunningProject | null {
    if (!this.isProjectRunning()) return null;
    return this.runningProjectInfo ? { ...this.runningProjectInfo, logs: this.projectLogs.slice(-100) } : null;
  }

  /**
   * Get project logs
   */
  getProjectLogs(): string[] {
    return [...this.projectLogs];
  }

  /**
   * Clear project logs
   */
  clearProjectLogs(): void {
    this.projectLogs = [];
  }

  /**
   * Run the project (start backend/frontend servers)
   */
  async runProject(): Promise<ProjectRunResult> {
    if (this.isProjectRunning()) {
      return {
        success: false,
        message: 'Project is already running. Stop it first before starting again.',
        pid: this.runningProjectInfo?.pid
      };
    }

    try {
      log.info(`[VibeHub] Detecting and running project in ${this.workspacePath}...`);
      
      const projectInfo = await ProjectRunner.detectProject(this.workspacePath);
      
      if (projectInfo.type === 'unknown') {
        return {
          success: false,
          message: 'Could not detect project type. Make sure the folder contains a valid project (package.json, requirements.txt, or index.html).'
        };
      }

      if (!projectInfo.startCommand) {
        return {
          success: false,
          message: `Detected ${projectInfo.type} project but could not find a start command. Add a "start" or "dev" script to package.json, or create a main.py/app.py file.`,
          projectType: projectInfo.type
        };
      }

      log.info(`[VibeHub] Detected: ${projectInfo.type} project`);
      log.info(`[VibeHub] Start command: ${projectInfo.startCommand}`);

      // Install dependencies if needed
      if (this.config.projectRunConfig.autoInstallDeps) {
        if (projectInfo.type === 'node' && projectInfo.hasPackageJson) {
          const nodeModulesPath = path.join(this.workspacePath, 'node_modules');
          if (!fs.existsSync(nodeModulesPath)) {
            log.info('[VibeHub] Installing dependencies...');
            this.addLog('📦 Installing dependencies...');
            const installResult = await ProjectRunner.installDependencies(this.workspacePath, projectInfo);
            if (!installResult.success) {
              return {
                success: false,
                message: `Failed to install dependencies: ${installResult.output}`,
                projectType: projectInfo.type
              };
            }
            this.addLog('✅ Dependencies installed');
          }
        }

        if (projectInfo.type === 'python' && !projectInfo.hasVirtualEnv && this.config.projectRunConfig.createVenvForPython) {
          log.info('[VibeHub] Creating Python virtual environment...');
          this.addLog('🐍 Creating Python virtual environment...');
          const venvResult = await ProjectRunner.createVirtualEnv(this.workspacePath, projectInfo.pythonPath);
          if (venvResult.success && venvResult.path) {
            projectInfo.hasVirtualEnv = true;
            projectInfo.virtualEnvPath = venvResult.path;
            if (projectInfo.mainFile) {
              const isWindows = process.platform === 'win32';
              const pythonExe = isWindows ? 'python.exe' : 'python';
              const venvPython = path.join(venvResult.path, isWindows ? 'Scripts' : 'bin', pythonExe);
              projectInfo.startCommand = `${venvPython} ${projectInfo.mainFile}`;
            }
          }
          
          if (projectInfo.hasRequirements) {
            const installResult = await ProjectRunner.installDependencies(this.workspacePath, projectInfo);
            if (!installResult.success) {
              this.addLog('⚠️ Failed to install Python dependencies');
            } else {
              this.addLog('✅ Python dependencies installed');
            }
          }
        }
      }

      // Try to detect port
      let port: number | undefined;
      if (projectInfo.type === 'node') {
        const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
        for (const file of serverFiles) {
          if (file) {
            try {
              const filePath = path.join(this.workspacePath, file);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const portMatch = content.match(/\.listen\((\d+)/) || content.match(/port[:\s=]+(\d+)/i);
                if (portMatch) {
                  port = parseInt(portMatch[1]);
                  break;
                }
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }

      // Start the project
      log.info(`[VibeHub] Starting: ${projectInfo.startCommand}`);
      this.addLog(`🚀 Starting: ${projectInfo.startCommand}`);
      
      // Get proper environment
      let env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' };
      try {
        const { getNodeEnv } = require('../core/tool-path-finder');
        env = { ...getNodeEnv(), NODE_ENV: 'development' };
      } catch (e) {
        // Fallback
      }

      // Inject AgentPrime inference environment variables
      // This allows projects to use AgentPrime's AI via standard SDKs
      try {
        const { getInferenceEnvVars } = require('../inference-server');
        const inferenceEnv = getInferenceEnvVars();
        env = { ...env, ...inferenceEnv };
        log.info(`[VibeHub] 🧠 Injected AI inference env vars (port ${inferenceEnv.AGENTPRIME_INFERENCE_PORT})`);
        this.addLog(`🧠 AI inference available at ${inferenceEnv.AGENTPRIME_INFERENCE_URL}`);
      } catch (e) {
        log.info('[VibeHub] Inference server not available, skipping env injection');
      }

      const child = exec(projectInfo.startCommand, {
        cwd: this.workspacePath,
        env: env
      });

      this.runningProcess = child;
      this.runningProjectInfo = {
        pid: child.pid || 0,
        startTime: Date.now(),
        type: projectInfo.type,
        port: port,
        command: projectInfo.startCommand,
        logs: []
      };

      let hasError = false;
      
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        this.addLog(text.trim());
        log.info(`[VibeHub:Project] ${text.trim()}`);
        
        // Detect port from output
        if (!port) {
          const portMatch = text.match(/localhost:(\d+)/i) || 
                           text.match(/port\s*[:=]?\s*(\d+)/i) ||
                           text.match(/listening\s+(?:on\s+)?(?:port\s+)?(\d+)/i);
          if (portMatch) {
            port = parseInt(portMatch[1]);
            if (this.runningProjectInfo) {
              this.runningProjectInfo.port = port;
            }
          }
        }
        
        this.emit('project-output', { type: 'stdout', text });
      });
      
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        this.addLog(`[ERR] ${text.trim()}`);
        log.error(`[VibeHub:Project] ${text.trim()}`);
        
        if (text.includes('EADDRINUSE') || text.includes('address already in use')) {
          hasError = true;
        }
        
        this.emit('project-output', { type: 'stderr', text });
      });

      child.on('exit', (code) => {
        log.info(`[VibeHub] Project exited with code ${code}`);
        this.addLog(`\n🛑 Process exited with code ${code}`);
        this.runningProcess = null;
        this.runningProjectInfo = null;
        this.emit('project-exit', { code });
      });

      // Wait to see if it starts successfully
      await new Promise(resolve => setTimeout(resolve, 3000));

      if (hasError) {
        this.stopProject();
        return {
          success: false,
          message: `Port ${port || 'unknown'} is already in use. Stop the existing process or change the port.`,
          projectType: projectInfo.type,
          port: port
        };
      }

      if (child.killed || child.exitCode !== null) {
        this.runningProcess = null;
        this.runningProjectInfo = null;
        return {
          success: false,
          message: `Project exited immediately. Check the logs for errors.`,
          projectType: projectInfo.type
        };
      }

      const url = port ? `http://localhost:${port}` : undefined;
      
      return {
        success: true,
        message: `🚀 ${projectInfo.name || projectInfo.type} project is running!${url ? ` Open: ${url}` : ''}`,
        projectType: projectInfo.type,
        port: port,
        url: url,
        pid: child.pid
      };

    } catch (error: any) {
      log.error('[VibeHub] Run project error:', error);
      this.addLog(`❌ Error: ${error.message}`);
      return {
        success: false,
        message: `Failed to run project: ${error.message}`
      };
    }
  }

  /**
   * Add a log entry
   */
  private addLog(message: string): void {
    this.projectLogs.push(message);
    if (this.projectLogs.length > this.maxLogs) {
      this.projectLogs = this.projectLogs.slice(-this.maxLogs);
    }
  }

  /**
   * Stop the running project
   */
  stopProject(): { success: boolean; message: string } {
    if (!this.runningProcess) {
      return {
        success: false,
        message: 'No project is currently running.'
      };
    }

    try {
      const pid = this.runningProcess.pid;
      
      if (process.platform === 'win32' && pid) {
        exec(`taskkill /pid ${pid} /T /F`, (error) => {
          if (error) {
            log.warn('[VibeHub] taskkill warning:', error.message);
          }
        });
      } else {
        this.runningProcess.kill('SIGTERM');
        setTimeout(() => {
          if (this.runningProcess && !this.runningProcess.killed) {
            this.runningProcess.kill('SIGKILL');
          }
        }, 2000);
      }

      const projectType = this.runningProjectInfo?.type;
      this.runningProcess = null;
      this.runningProjectInfo = null;

      log.info(`[VibeHub] Stopped ${projectType} project`);
      this.addLog(`\n✅ Project stopped`);
      
      return {
        success: true,
        message: `Stopped ${projectType} project.`
      };
    } catch (error: any) {
      log.error('[VibeHub] Stop project error:', error);
      return {
        success: false,
        message: `Failed to stop project: ${error.message}`
      };
    }
  }

  /**
   * Open the running project in the default browser
   */
  async openInBrowser(): Promise<{ success: boolean; message: string }> {
    if (!this.isProjectRunning() || !this.runningProjectInfo?.port) {
      return {
        success: false,
        message: 'No project with a web server is currently running.'
      };
    }

    try {
      const { shell } = require('electron');
      const url = `http://localhost:${this.runningProjectInfo.port}`;
      await shell.openExternal(url);
      return {
        success: true,
        message: `Opened ${url} in browser.`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to open browser: ${error.message}`
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopFileWatcher();
    if (this.runningProcess) {
      this.stopProject();
    }
    this.removeAllListeners();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

let vibeHubInstance: VibeHubIntegration | null = null;

export function getVibeHubIntegration(workspacePath?: string, config?: Partial<VibeHubConfig>): VibeHubIntegration | null {
  if (workspacePath) {
    if (vibeHubInstance) {
      vibeHubInstance.dispose();
    }
    vibeHubInstance = new VibeHubIntegration(workspacePath, config);
  }
  return vibeHubInstance;
}

export default VibeHubIntegration;
