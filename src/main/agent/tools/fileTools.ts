import * as fs from 'fs/promises';
import * as path from 'path';
import { createPatch, applyPatch } from 'diff';

export interface FileToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class FileTools {
  constructor(private workspacePath: string) {}

  async listFiles(relativePath: string): Promise<FileToolResult> {
    try {
      const fullPath = this.resolvePath(relativePath);
      const items = await fs.readdir(fullPath, { withFileTypes: true });

      const result = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        path: path.join(relativePath, item.name)
      }));

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files'
      };
    }
  }

  async readFile(relativePath: string): Promise<FileToolResult> {
    try {
      const fullPath = this.resolvePath(relativePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      return { success: true, data: { content, path: relativePath } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file'
      };
    }
  }

  async writeFile(relativePath: string, content: string): Promise<FileToolResult> {
    try {
      const fullPath = this.resolvePath(relativePath);

      // Ensure parent directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, content, 'utf-8');

      return { success: true, data: { path: relativePath, written: true } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file'
      };
    }
  }

  async applyDiff(relativePath: string, diffContent: string): Promise<FileToolResult> {
    try {
      const fullPath = this.resolvePath(relativePath);

      // Read current content
      let currentContent: string;
      try {
        currentContent = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // File doesn't exist, treat as empty
        currentContent = '';
      }

      // Apply the patch
      const patchedContent = applyPatch(currentContent, diffContent);

      if (patchedContent === false) {
        return {
          success: false,
          error: 'Failed to apply diff - patch may be malformed or conflicting'
        };
      }

      // Write back the patched content
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, patchedContent, 'utf-8');

      return {
        success: true,
        data: {
          path: relativePath,
          patched: true,
          originalLength: currentContent.length,
          newLength: patchedContent.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply diff'
      };
    }
  }

  private resolvePath(relativePath: string): string {
    // Resolve relative to workspace root
    const fullPath = path.resolve(this.workspacePath, relativePath);

    // Security check: ensure path is within workspace
    const relative = path.relative(this.workspacePath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Access denied: path outside workspace');
    }

    return fullPath;
  }

  // Utility method to create diff (for future use)
  createDiff(relativePath: string, oldContent: string, newContent: string): string {
    const filename = path.basename(relativePath);
    return createPatch(filename, oldContent, newContent, 'original', 'modified');
  }
}
