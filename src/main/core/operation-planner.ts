/**
 * Operation Planner
 * Plans multi-step and batch file operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { ParsedCommand } from './command-parser';
import { PathResolver, ResolvedPath } from './path-resolver';

export type OperationType = 'move' | 'copy' | 'delete' | 'rename' | 'create' | 'open';

export interface OperationStep {
  type: OperationType;
  source?: string;
  destination?: string;
  newName?: string;
  files: string[]; // List of files to operate on
  options?: {
    recursive?: boolean;
    useRecycleBin?: boolean;
    overwrite?: boolean;
  };
}

export interface OperationPlan {
  steps: OperationStep[];
  totalFiles: number;
  estimatedTime: number; // milliseconds
  requiresConfirmation: boolean;
  canUndo: boolean;
}

export class OperationPlanner {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  /**
   * Create an operation plan from a parsed command
   */
  plan(
    command: ParsedCommand,
    workspacePath?: string
  ): OperationPlan | null {
    if (!command.source && command.operation !== 'create') {
      return null; // Need source for most operations
    }

    const steps: OperationStep[] = [];
    let totalFiles = 0;
    let requiresConfirmation = false;
    let canUndo = true;

    switch (command.operation) {
      case 'move':
      case 'copy':
        const moveCopyPlan = this.planMoveCopy(command, workspacePath);
        if (moveCopyPlan) {
          steps.push(...moveCopyPlan.steps);
          totalFiles = moveCopyPlan.totalFiles;
          requiresConfirmation = moveCopyPlan.requiresConfirmation;
        }
        break;

      case 'delete':
        const deletePlan = this.planDelete(command, workspacePath);
        if (deletePlan) {
          steps.push(...deletePlan.steps);
          totalFiles = deletePlan.totalFiles;
          requiresConfirmation = true; // Always require confirmation for delete
        }
        break;

      case 'rename':
        const renamePlan = this.planRename(command, workspacePath);
        if (renamePlan) {
          steps.push(...renamePlan.steps);
          totalFiles = renamePlan.totalFiles;
        }
        break;

      case 'create':
        const createPlan = this.planCreate(command, workspacePath);
        if (createPlan) {
          steps.push(...createPlan.steps);
          canUndo = false; // Creating folders is not easily undoable
        }
        break;

      case 'open':
        const openPlan = this.planOpen(command, workspacePath);
        if (openPlan) {
          steps.push(...openPlan.steps);
          requiresConfirmation = false; // Opening is safe
          canUndo = false; // Opening doesn't modify anything
        }
        break;

      case 'organize':
        const organizePlan = this.planOrganize(command, workspacePath);
        if (organizePlan) {
          steps.push(...organizePlan.steps);
          totalFiles = organizePlan.totalFiles;
          requiresConfirmation = true;
        }
        break;
    }

    if (steps.length === 0) {
      return null;
    }

    // Estimate time (rough: 10ms per file)
    const estimatedTime = totalFiles * 10;

    return {
      steps,
      totalFiles,
      estimatedTime,
      requiresConfirmation,
      canUndo
    };
  }

  /**
   * Plan move or copy operation
   */
  private planMoveCopy(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[]; totalFiles: number; requiresConfirmation: boolean } | null {
    if (!command.source || !command.destination) {
      return null;
    }

    const sourceResolved = this.pathResolver.resolve(command.source, workspacePath);
    const destResolved = this.pathResolver.resolve(command.destination, workspacePath);

    if (!sourceResolved.exists) {
      return null; // Source doesn't exist
    }

    const files = this.collectFiles(
      sourceResolved.path,
      sourceResolved.isDirectory,
      command.options?.recursive || false,
      command.options?.pattern
    );

    if (files.length === 0) {
      return null;
    }

    // Determine if we need confirmation
    const requiresConfirmation = 
      files.length > 10 || // Bulk operation
      !destResolved.exists || // Destination doesn't exist
      (destResolved.exists && !command.options?.overwrite); // Might overwrite

    return {
      steps: [{
        type: command.operation === 'copy' ? 'copy' : 'move',
        source: sourceResolved.path,
        destination: destResolved.path,
        files,
        options: command.options
      }],
      totalFiles: files.length,
      requiresConfirmation
    };
  }

  /**
   * Plan delete operation
   */
  private planDelete(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[]; totalFiles: number } | null {
    if (!command.source) {
      return null;
    }

    const sourceResolved = this.pathResolver.resolve(command.source, workspacePath);
    if (!sourceResolved.exists) {
      return null;
    }

    const files = this.collectFiles(
      sourceResolved.path,
      sourceResolved.isDirectory,
      command.options?.recursive || false,
      command.options?.pattern
    );

    if (files.length === 0) {
      return null;
    }

    return {
      steps: [{
        type: 'delete',
        source: sourceResolved.path,
        files,
        options: {
          useRecycleBin: command.options?.useRecycleBin ?? true,
          recursive: command.options?.recursive
        }
      }],
      totalFiles: files.length
    };
  }

  /**
   * Plan rename operation
   */
  private planRename(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[]; totalFiles: number } | null {
    if (!command.source || !command.newName) {
      return null;
    }

    const sourceResolved = this.pathResolver.resolve(command.source, workspacePath);
    if (!sourceResolved.exists) {
      return null;
    }

    // For rename, we only operate on the single file/folder
    return {
      steps: [{
        type: 'rename',
        source: sourceResolved.path,
        newName: command.newName,
        files: [sourceResolved.path]
      }],
      totalFiles: 1
    };
  }

  /**
   * Plan create operation
   */
  private planCreate(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[] } | null {
    if (!command.destination) {
      return null;
    }

    const destResolved = this.pathResolver.resolve(command.destination, workspacePath);
    
    // If destination already exists, we might need to handle that
    if (destResolved.exists && !command.options?.overwrite) {
      return null; // Can't create what already exists
    }

    return {
      steps: [{
        type: 'create',
        destination: destResolved.path,
        files: []
      }]
    };
  }

  /**
   * Plan open operation
   */
  private planOpen(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[] } | null {
    if (!command.source) {
      return null;
    }

    const sourceResolved = this.pathResolver.resolve(command.source, workspacePath);
    if (!sourceResolved.exists) {
      return null;
    }

    return {
      steps: [{
        type: 'open',
        source: sourceResolved.path,
        files: [sourceResolved.path]
      }]
    };
  }

  /**
   * Plan organize operation by grouping files into category folders.
   */
  private planOrganize(
    command: ParsedCommand,
    workspacePath?: string
  ): { steps: OperationStep[]; totalFiles: number } | null {
    if (!command.source) {
      return null;
    }

    const sourceResolved = this.pathResolver.resolve(command.source, workspacePath);
    if (!sourceResolved.exists || !sourceResolved.isDirectory) {
      return null;
    }

    const organizeBy = command.options?.organizeBy || 'type';
    const recursive = command.options?.recursive || false;
    const files = this.collectOrganizableFiles(sourceResolved.path, recursive);

    if (files.length === 0) {
      return null;
    }

    const steps: OperationStep[] = [];
    for (const filePath of files) {
      const category = this.categorizeFileForOrganize(filePath, organizeBy);
      if (!category) continue;

      const destinationDir = path.join(sourceResolved.path, category);
      if (path.dirname(filePath).toLowerCase() === destinationDir.toLowerCase()) {
        continue; // Skip files already organized into that category.
      }

      const destinationPath = this.generateUniqueName(
        path.join(destinationDir, path.basename(filePath))
      );

      steps.push({
        type: 'move',
        source: filePath,
        destination: destinationPath,
        files: [filePath],
        options: {
          overwrite: false
        }
      });
    }

    if (steps.length === 0) {
      return null;
    }

    return {
      steps,
      totalFiles: steps.length
    };
  }

  /**
   * Collect files for operation (handles directories, patterns, etc.)
   */
  private collectFiles(
    sourcePath: string,
    isDirectory: boolean,
    recursive: boolean,
    pattern?: string
  ): string[] {
    const files: string[] = [];

    if (!isDirectory) {
      // Single file
      files.push(sourcePath);
      return files;
    }

    // Directory - collect files
    try {
      if (pattern) {
        // Pattern-based collection (e.g., "all .jpg files")
        this.collectFilesWithPattern(sourcePath, pattern, recursive, files);
      } else if (recursive || sourcePath.includes('all') || sourcePath.includes('everything')) {
        // Recursive collection
        this.collectFilesRecursive(sourcePath, files);
      } else {
        // Just the directory itself (for move/delete operations)
        files.push(sourcePath);
      }
    } catch (error) {
      // If collection fails, return empty array
      console.error('Error collecting files:', error);
    }

    return files;
  }

  /**
   * Collect files matching a pattern
   */
  private collectFilesWithPattern(
    dirPath: string,
    pattern: string,
    recursive: boolean,
    files: string[]
  ): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          this.collectFilesWithPattern(fullPath, pattern, recursive, files);
        } else if (entry.isFile() && entry.name.endsWith(pattern)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Recursively collect all files in directory
   */
  private collectFilesRecursive(dirPath: string, files: string[]): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          this.collectFilesRecursive(fullPath, files);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Collect all files eligible for organization.
   */
  private collectOrganizableFiles(dirPath: string, recursive: boolean): string[] {
    const files: string[] = [];

    const walk = (currentPath: string): void => {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            if (recursive) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip unreadable folders.
      }
    };

    walk(dirPath);
    return files;
  }

  /**
   * Determine destination category for organized files.
   */
  private categorizeFileForOrganize(filePath: string, organizeBy: 'type' | 'extension'): string | null {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) {
      return null;
    }

    if (organizeBy === 'extension') {
      return ext.replace('.', '').toUpperCase();
    }

    const extensionCategoryMap: Record<string, string> = {
      '.jpg': 'Images',
      '.jpeg': 'Images',
      '.png': 'Images',
      '.gif': 'Images',
      '.bmp': 'Images',
      '.webp': 'Images',
      '.svg': 'Images',
      '.heic': 'Images',
      '.avif': 'Images',
      '.tif': 'Images',
      '.tiff': 'Images',
      '.pdf': 'Documents',
      '.doc': 'Documents',
      '.docx': 'Documents',
      '.txt': 'Documents',
      '.rtf': 'Documents',
      '.md': 'Documents',
      '.csv': 'Documents',
      '.xls': 'Documents',
      '.xlsx': 'Documents',
      '.ppt': 'Documents',
      '.pptx': 'Documents',
      '.zip': 'Archives',
      '.rar': 'Archives',
      '.7z': 'Archives',
      '.tar': 'Archives',
      '.gz': 'Archives',
      '.bz2': 'Archives',
      '.xz': 'Archives',
      '.mp3': 'Audio',
      '.wav': 'Audio',
      '.flac': 'Audio',
      '.aac': 'Audio',
      '.m4a': 'Audio',
      '.ogg': 'Audio',
      '.mp4': 'Videos',
      '.mkv': 'Videos',
      '.mov': 'Videos',
      '.avi': 'Videos',
      '.webm': 'Videos',
      '.m4v': 'Videos',
      '.exe': 'Installers',
      '.msi': 'Installers',
      '.dmg': 'Installers',
      '.pkg': 'Installers',
      '.deb': 'Installers',
      '.rpm': 'Installers',
      '.appimage': 'Installers'
    };

    return extensionCategoryMap[ext] || null;
  }

  /**
   * Resolve conflicts (file already exists at destination)
   */
  resolveConflict(
    sourcePath: string,
    destPath: string,
    overwrite: boolean
  ): 'skip' | 'overwrite' | 'rename' {
    if (!fs.existsSync(destPath)) {
      return 'skip'; // No conflict
    }

    if (overwrite) {
      return 'overwrite';
    }

    // Default to rename (add number suffix)
    return 'rename';
  }

  /**
   * Generate a unique name for destination to avoid conflicts
   */
  generateUniqueName(destPath: string): string {
    if (!fs.existsSync(destPath)) {
      return destPath;
    }

    const dir = path.dirname(destPath);
    const ext = path.extname(destPath);
    const base = path.basename(destPath, ext);

    let counter = 1;
    let newPath: string;

    do {
      newPath = path.join(dir, `${base} (${counter})${ext}`);
      counter++;
    } while (fs.existsSync(newPath) && counter < 1000);

    return newPath;
  }
}

