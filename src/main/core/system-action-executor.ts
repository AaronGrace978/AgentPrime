/**
 * System Action Executor
 * Enhanced ActionExecutor with system-level file operations (move, copy, delete, rename, recycle bin)
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PathResolver } from './path-resolver';
import { OperationStep } from './operation-planner';
import { sanitizeFolderName } from '../security/ipcValidation';

const execAsync = promisify(exec);

export interface MoveOptions {
  overwrite?: boolean;
  createDestDir?: boolean;
}

export interface CopyOptions {
  overwrite?: boolean;
  createDestDir?: boolean;
  preserveTimestamps?: boolean;
}

export interface OperationResult {
  success: boolean;
  message?: string;
  error?: string;
  filesProcessed?: number;
  filesSkipped?: number;
  filesFailed?: number;
}

export interface UndoOperation {
  id: string;
  type: 'move' | 'copy' | 'delete' | 'rename';
  originalPath: string;
  newPath?: string;
  timestamp: number;
}

export class SystemActionExecutor {
  private pathResolver: PathResolver;
  private undoHistory: UndoOperation[] = [];
  private maxUndoHistory = 50;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  /**
   * Move file or folder
   */
  async moveFile(
    source: string,
    destination: string,
    options: MoveOptions = {}
  ): Promise<OperationResult> {
    try {
      const sourceResolved = this.pathResolver.resolve(source);
      const destResolved = this.pathResolver.resolve(destination);

      if (!sourceResolved.exists) {
        return {
          success: false,
          error: `Source path does not exist: ${source}`
        };
      }

      // Ensure destination directory exists
      if (options.createDestDir !== false) {
        const destDir = sourceResolved.isDirectory 
          ? destResolved.path 
          : path.dirname(destResolved.path);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
      }

      // Check if destination exists
      if (fs.existsSync(destResolved.path) && !options.overwrite) {
        return {
          success: false,
          error: `Destination already exists: ${destination}. Use overwrite option to replace.`
        };
      }

      // Perform move
      fs.renameSync(sourceResolved.path, destResolved.path);

      // Record for undo
      this.recordUndo({
        id: Date.now().toString(),
        type: 'move',
        originalPath: sourceResolved.path,
        newPath: destResolved.path,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: `✅ Moved ${sourceResolved.isDirectory ? 'folder' : 'file'} to ${destination}`,
        filesProcessed: 1
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during move operation'
      };
    }
  }

  /**
   * Copy file or folder
   */
  async copyFile(
    source: string,
    destination: string,
    options: CopyOptions = {}
  ): Promise<OperationResult> {
    try {
      const sourceResolved = this.pathResolver.resolve(source);
      const destResolved = this.pathResolver.resolve(destination);

      if (!sourceResolved.exists) {
        return {
          success: false,
          error: `Source path does not exist: ${source}`
        };
      }

      // Ensure destination directory exists
      if (options.createDestDir !== false) {
        const destDir = sourceResolved.isDirectory 
          ? destResolved.path 
          : path.dirname(destResolved.path);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
      }

      // Check if destination exists
      if (fs.existsSync(destResolved.path) && !options.overwrite) {
        return {
          success: false,
          error: `Destination already exists: ${destination}. Use overwrite option to replace.`
        };
      }

      // Perform copy
      if (sourceResolved.isDirectory) {
        this.copyDirectoryRecursive(sourceResolved.path, destResolved.path, options);
      } else {
        fs.copyFileSync(sourceResolved.path, destResolved.path);
        if (options.preserveTimestamps) {
          const stats = fs.statSync(sourceResolved.path);
          fs.utimesSync(destResolved.path, stats.atime, stats.mtime);
        }
      }

      return {
        success: true,
        message: `✅ Copied ${sourceResolved.isDirectory ? 'folder' : 'file'} to ${destination}`,
        filesProcessed: 1
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during copy operation'
      };
    }
  }

  /**
   * Delete file or folder (with recycle bin option)
   */
  async deleteFile(
    filePath: string,
    useRecycleBin: boolean = true
  ): Promise<OperationResult> {
    try {
      const resolved = this.pathResolver.resolve(filePath);

      if (!resolved.exists) {
        return {
          success: false,
          error: `Path does not exist: ${filePath}`
        };
      }

      if (useRecycleBin) {
        // Move to recycle bin
        const recycleBinPath = this.pathResolver.getRecycleBinPath();
        const fileName = path.basename(resolved.path);
        const destPath = path.join(recycleBinPath, fileName);

        // Ensure unique name in recycle bin
        let finalDestPath = destPath;
        let counter = 1;
        while (fs.existsSync(finalDestPath)) {
          const ext = path.extname(fileName);
          const base = path.basename(fileName, ext);
          finalDestPath = path.join(recycleBinPath, `${base} (${counter})${ext}`);
          counter++;
        }

        fs.renameSync(resolved.path, finalDestPath);

        // Record for undo
        this.recordUndo({
          id: Date.now().toString(),
          type: 'delete',
          originalPath: resolved.path,
          newPath: finalDestPath,
          timestamp: Date.now()
        });

        return {
          success: true,
          message: `✅ Moved ${resolved.isDirectory ? 'folder' : 'file'} to Recycle Bin`,
          filesProcessed: 1
        };
      } else {
        // Permanent delete
        if (resolved.isDirectory) {
          fs.rmSync(resolved.path, { recursive: true, force: true });
        } else {
          fs.unlinkSync(resolved.path);
        }

        // Record for undo (but can't really undo permanent delete)
        this.recordUndo({
          id: Date.now().toString(),
          type: 'delete',
          originalPath: resolved.path,
          timestamp: Date.now()
        });

        return {
          success: true,
          message: `✅ Deleted ${resolved.isDirectory ? 'folder' : 'file'}`,
          filesProcessed: 1
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during delete operation'
      };
    }
  }

  /**
   * Rename file or folder
   */
  async renameFile(
    filePath: string,
    newName: string
  ): Promise<OperationResult> {
    try {
      const resolved = this.pathResolver.resolve(filePath);

      if (!resolved.exists) {
        return {
          success: false,
          error: `Path does not exist: ${filePath}`
        };
      }

      const dir = path.dirname(resolved.path);
      const newPath = path.join(dir, newName);

      // Check if new name already exists
      if (fs.existsSync(newPath)) {
        return {
          success: false,
          error: `A file or folder with the name "${newName}" already exists`
        };
      }

      // Perform rename
      fs.renameSync(resolved.path, newPath);

      // Record for undo
      this.recordUndo({
        id: Date.now().toString(),
        type: 'rename',
        originalPath: resolved.path,
        newPath: newPath,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: `✅ Renamed to "${newName}"`,
        filesProcessed: 1
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during rename operation'
      };
    }
  }

  /**
   * Create folder
   */
  async createFolder(folderPath: string): Promise<OperationResult> {
    try {
      // Sanitize the folder name (last component of the path)
      const parentDir = path.dirname(folderPath);
      const folderName = path.basename(folderPath);
      const sanitizedName = sanitizeFolderName(folderName);
      
      if (!sanitizedName || sanitizedName === 'untitled') {
        return {
          success: false,
          error: `Invalid folder name: "${folderName}"`
        };
      }
      
      // Rebuild path with sanitized folder name
      const sanitizedPath = parentDir === '.' ? sanitizedName : path.join(parentDir, sanitizedName);
      const resolved = this.pathResolver.resolve(sanitizedPath);

      if (resolved.exists) {
        return {
          success: false,
          error: `Folder already exists: ${sanitizedPath}`
        };
      }

      fs.mkdirSync(resolved.path, { recursive: true });

      return {
        success: true,
        message: `✅ Created folder: ${sanitizedPath}`,
        filesProcessed: 1
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during folder creation'
      };
    }
  }

  /**
   * Open file or folder in system default app
   */
  async openFile(filePath: string): Promise<OperationResult> {
    try {
      const resolved = this.pathResolver.resolve(filePath);

      if (!resolved.exists) {
        return {
          success: false,
          error: `Path does not exist: ${filePath}`
        };
      }

      const platform = process.platform;
      let command: string;

      if (platform === 'win32') {
        command = `start "" "${resolved.path}"`;
      } else if (platform === 'darwin') {
        command = `open "${resolved.path}"`;
      } else {
        command = `xdg-open "${resolved.path}"`;
      }

      await execAsync(command);

      return {
        success: true,
        message: `✅ Opened ${resolved.isDirectory ? 'folder' : 'file'}`,
        filesProcessed: 1
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during open operation'
      };
    }
  }

  /**
   * Execute operation step
   */
  async executeStep(step: OperationStep): Promise<OperationResult> {
    switch (step.type) {
      case 'move':
        if (!step.source) {
          return { success: false, error: 'Source required for move operation' };
        }
        if (!step.destination) {
          return { success: false, error: 'Destination required for move operation' };
        }
        return await this.moveFile(step.source, step.destination, step.options);

      case 'copy':
        if (!step.source) {
          return { success: false, error: 'Source required for copy operation' };
        }
        if (!step.destination) {
          return { success: false, error: 'Destination required for copy operation' };
        }
        return await this.copyFile(step.source, step.destination, step.options);

      case 'delete':
        if (!step.source) {
          return { success: false, error: 'Source required for delete operation' };
        }
        return await this.deleteFile(
          step.source,
          step.options?.useRecycleBin ?? true
        );

      case 'rename':
        if (!step.source) {
          return { success: false, error: 'Source required for rename operation' };
        }
        if (!step.newName) {
          return { success: false, error: 'New name required for rename operation' };
        }
        return await this.renameFile(step.source, step.newName);

      case 'create':
        if (!step.destination) {
          return { success: false, error: 'Destination required for create operation' };
        }
        return await this.createFolder(step.destination);

      case 'open':
        if (!step.source) {
          return { success: false, error: 'Source required for open operation' };
        }
        return await this.openFile(step.source);

      default:
        return {
          success: false,
          error: `Unknown operation type: ${(step as any).type}`
        };
    }
  }

  /**
   * Copy directory recursively
   */
  private copyDirectoryRecursive(
    source: string,
    destination: string,
    options: CopyOptions = {}
  ): void {
    // Create destination directory
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Copy files and subdirectories
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(sourcePath, destPath, options);
      } else {
        if (fs.existsSync(destPath) && !options.overwrite) {
          continue; // Skip if exists and not overwriting
        }
        fs.copyFileSync(sourcePath, destPath);
        if (options.preserveTimestamps) {
          const stats = fs.statSync(sourcePath);
          fs.utimesSync(destPath, stats.atime, stats.mtime);
        }
      }
    }
  }

  /**
   * Record operation for undo
   */
  private recordUndo(operation: UndoOperation): void {
    this.undoHistory.push(operation);
    
    // Limit history size
    if (this.undoHistory.length > this.maxUndoHistory) {
      this.undoHistory.shift();
    }
  }

  /**
   * Get undo history
   */
  getUndoHistory(): UndoOperation[] {
    return [...this.undoHistory];
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(): Promise<OperationResult> {
    if (this.undoHistory.length === 0) {
      return {
        success: false,
        error: 'No operations to undo'
      };
    }

    const operation = this.undoHistory.pop()!;

    try {
      switch (operation.type) {
        case 'move':
          if (operation.newPath) {
            // Move back to original location
            return await this.moveFile(operation.newPath, operation.originalPath, { overwrite: true });
          }
          break;

        case 'delete':
          if (operation.newPath && fs.existsSync(operation.newPath)) {
            // Restore from recycle bin
            return await this.moveFile(operation.newPath, operation.originalPath, { overwrite: true });
          }
          break;

        case 'rename':
          if (operation.newPath) {
            // Rename back
            const originalName = path.basename(operation.originalPath);
            return await this.renameFile(operation.newPath, originalName);
          }
          break;
      }

      return {
        success: false,
        error: 'Cannot undo this operation'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Error undoing operation'
      };
    }
  }

  /**
   * Clear undo history
   */
  clearUndoHistory(): void {
    this.undoHistory = [];
  }
}

