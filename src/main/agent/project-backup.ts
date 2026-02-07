/**
 * Project Backup System
 * 
 * Provides automatic backup/restore functionality for AgentPrime projects.
 * This is the ultimate safety net - if all else fails, we can restore from backup.
 * 
 * Features:
 * - Automatic backup before FIX/ENHANCE/DEBUG operations
 * - Keeps last N backups (configurable)
 * - Quick restore from any backup
 * - Metadata tracking (what was backed up and why)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIGURATION
// ============================================================

const BACKUP_DIR_NAME = '.agentprime-backup';
const MAX_BACKUPS = 3;
const BACKUP_METADATA_FILE = 'backup-metadata.json';

// Files/directories to skip when backing up
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  '__pycache__',
  'venv',
  '.env',
  'dist',
  'build',
  '.next',
  '.cache',
  '.agentprime-backup', // Don't backup backups!
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

// File extensions to backup
const BACKUP_EXTENSIONS = [
  '.js', '.ts', '.tsx', '.jsx',
  '.html', '.css', '.scss', '.sass',
  '.json', '.py', '.md',
  '.vue', '.svelte',
  '.toml', '.yaml', '.yml',
  '.rs', '.go', '.java'
];

// ============================================================
// TYPES
// ============================================================

export interface BackupMetadata {
  id: string;
  timestamp: number;
  reason: string;
  taskMode: string;
  taskDescription: string;
  filesCount: number;
  totalSize: number;
  workspacePath: string;
  files: string[];
}

export interface BackupResult {
  success: boolean;
  backupId?: string;
  backupPath?: string;
  filesBackedUp?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  filesRestored?: number;
  error?: string;
}

// ============================================================
// BACKUP MANAGER CLASS
// ============================================================

export class ProjectBackupManager {
  private workspacePath: string;
  private backupBasePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.backupBasePath = path.join(workspacePath, BACKUP_DIR_NAME);
  }

  /**
   * Create a backup of the project before destructive operations
   */
  async createBackup(reason: string, taskMode: string, taskDescription: string): Promise<BackupResult> {
    try {
      console.log(`[Backup] 💾 Creating backup: ${reason}`);
      
      // Generate backup ID
      const backupId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const backupPath = path.join(this.backupBasePath, backupId);
      
      // Ensure backup directory exists
      fs.mkdirSync(backupPath, { recursive: true });
      
      // Collect files to backup
      const filesToBackup = this.collectFilesToBackup();
      
      if (filesToBackup.length === 0) {
        console.log('[Backup] No files to backup (empty or new project)');
        return { success: true, backupId, backupPath, filesBackedUp: 0 };
      }
      
      // Copy files
      let totalSize = 0;
      for (const relativePath of filesToBackup) {
        const sourcePath = path.join(this.workspacePath, relativePath);
        const destPath = path.join(backupPath, relativePath);
        
        // Ensure destination directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        
        // Copy file
        const content = fs.readFileSync(sourcePath);
        fs.writeFileSync(destPath, content);
        totalSize += content.length;
      }
      
      // Save metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: Date.now(),
        reason,
        taskMode,
        taskDescription: taskDescription.substring(0, 200),
        filesCount: filesToBackup.length,
        totalSize,
        workspacePath: this.workspacePath,
        files: filesToBackup
      };
      
      fs.writeFileSync(
        path.join(backupPath, BACKUP_METADATA_FILE),
        JSON.stringify(metadata, null, 2)
      );
      
      console.log(`[Backup] ✅ Backed up ${filesToBackup.length} files (${(totalSize / 1024).toFixed(1)} KB)`);
      
      // Clean old backups
      await this.cleanOldBackups();
      
      return {
        success: true,
        backupId,
        backupPath,
        filesBackedUp: filesToBackup.length
      };
    } catch (error: any) {
      console.error('[Backup] ❌ Backup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore from a specific backup
   */
  async restoreFromBackup(backupId: string): Promise<RestoreResult> {
    try {
      const backupPath = path.join(this.backupBasePath, backupId);
      
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: `Backup not found: ${backupId}` };
      }
      
      // Read metadata
      const metadataPath = path.join(backupPath, BACKUP_METADATA_FILE);
      if (!fs.existsSync(metadataPath)) {
        return { success: false, error: 'Backup metadata not found' };
      }
      
      const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      
      console.log(`[Backup] 🔄 Restoring from backup: ${backupId}`);
      console.log(`[Backup]    Reason: ${metadata.reason}`);
      console.log(`[Backup]    Files: ${metadata.filesCount}`);
      
      // Restore files
      let filesRestored = 0;
      for (const relativePath of metadata.files) {
        const sourcePath = path.join(backupPath, relativePath);
        const destPath = path.join(this.workspacePath, relativePath);
        
        if (fs.existsSync(sourcePath)) {
          // Ensure destination directory exists
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          
          // Copy file back
          fs.copyFileSync(sourcePath, destPath);
          filesRestored++;
        }
      }
      
      console.log(`[Backup] ✅ Restored ${filesRestored} files`);
      
      return { success: true, filesRestored };
    } catch (error: any) {
      console.error('[Backup] ❌ Restore failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore from the most recent backup
   */
  async restoreLatest(): Promise<RestoreResult> {
    const backups = this.listBackups();
    
    if (backups.length === 0) {
      return { success: false, error: 'No backups available' };
    }
    
    // Sort by timestamp descending
    backups.sort((a, b) => b.timestamp - a.timestamp);
    
    return this.restoreFromBackup(backups[0].id);
  }

  /**
   * List all available backups
   */
  listBackups(): BackupMetadata[] {
    const backups: BackupMetadata[] = [];
    
    if (!fs.existsSync(this.backupBasePath)) {
      return backups;
    }
    
    const entries = fs.readdirSync(this.backupBasePath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('backup_')) {
        const metadataPath = path.join(this.backupBasePath, entry.name, BACKUP_METADATA_FILE);
        
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            backups.push(metadata);
          } catch (e) {
            // Skip invalid metadata
          }
        }
      }
    }
    
    return backups;
  }

  /**
   * Delete a specific backup
   */
  deleteBackup(backupId: string): boolean {
    try {
      const backupPath = path.join(this.backupBasePath, backupId);
      
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
        console.log(`[Backup] 🗑️ Deleted backup: ${backupId}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error('[Backup] Failed to delete backup:', error.message);
      return false;
    }
  }

  /**
   * Clean old backups, keeping only the most recent N
   */
  private async cleanOldBackups(): Promise<void> {
    const backups = this.listBackups();
    
    if (backups.length <= MAX_BACKUPS) {
      return;
    }
    
    // Sort by timestamp ascending (oldest first)
    backups.sort((a, b) => a.timestamp - b.timestamp);
    
    // Delete oldest backups
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
    
    for (const backup of toDelete) {
      this.deleteBackup(backup.id);
    }
    
    console.log(`[Backup] 🧹 Cleaned ${toDelete.length} old backup(s)`);
  }

  /**
   * Collect list of files to backup
   */
  private collectFilesToBackup(): string[] {
    const files: string[] = [];
    
    const scan = (dir: string, relativePath: string = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryRelativePath = relativePath 
            ? `${relativePath}/${entry.name}` 
            : entry.name;
          
          // Skip certain directories/files
          if (this.shouldSkip(entry.name)) {
            continue;
          }
          
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            scan(fullPath, entryRelativePath);
          } else if (entry.isFile()) {
            // Only backup certain file types
            const ext = path.extname(entry.name).toLowerCase();
            if (BACKUP_EXTENSIONS.includes(ext)) {
              files.push(entryRelativePath);
            }
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    };
    
    scan(this.workspacePath);
    return files;
  }

  /**
   * Check if a file/directory should be skipped
   */
  private shouldSkip(name: string): boolean {
    // Skip hidden files (except .env.example)
    if (name.startsWith('.') && name !== '.env.example') {
      return true;
    }
    
    // Skip patterns
    return SKIP_PATTERNS.includes(name);
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Create a backup before a destructive operation
 */
export async function backupBeforeOperation(
  workspacePath: string,
  reason: string,
  taskMode: string,
  taskDescription: string
): Promise<BackupResult> {
  const manager = new ProjectBackupManager(workspacePath);
  return manager.createBackup(reason, taskMode, taskDescription);
}

/**
 * Restore the most recent backup
 */
export async function restoreLatestBackup(workspacePath: string): Promise<RestoreResult> {
  const manager = new ProjectBackupManager(workspacePath);
  return manager.restoreLatest();
}

/**
 * List all available backups for a workspace
 */
export function listBackups(workspacePath: string): BackupMetadata[] {
  const manager = new ProjectBackupManager(workspacePath);
  return manager.listBackups();
}

/**
 * Restore from a specific backup
 */
export async function restoreFromBackup(
  workspacePath: string,
  backupId: string
): Promise<RestoreResult> {
  const manager = new ProjectBackupManager(workspacePath);
  return manager.restoreFromBackup(backupId);
}

export default ProjectBackupManager;
