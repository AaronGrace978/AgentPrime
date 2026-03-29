/**
 * AgentPrime - File IPC Handlers
 * Handles file system operations via IPC
 * 
 * Security: All file paths are validated against workspace boundaries
 */

import * as fs from 'fs';
import * as path from 'path';
import { IpcMain, Dialog, BrowserWindow, OpenDialogReturnValue } from 'electron';
import type { FileTreeItem } from '../../types';
import { 
  validateFilePath, 
  validateFileContent, 
  ipcRateLimiter,
  sanitizeFolderName
} from '../security/ipcValidation';
import { completionOptimizer } from '../core/completion-optimizer';
import { scheduleWorkspaceSymbolIndexRebuildForAgents } from '../search/symbol-index';

/**
 * Build directory tree recursively
 */
async function buildTree(workspacePath: string, dirPath: string, depth: number = 0): Promise<FileTreeItem[]> {
  if (depth > 5) return [];
  
  const items: FileTreeItem[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  // Sort: folders first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  
  for (const entry of entries) {
    // Skip hidden and common ignore patterns
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build'].includes(entry.name)) continue;
    
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
    
    const item: FileTreeItem = {
      name: entry.name,
      path: relativePath,
      is_dir: entry.isDirectory(),
      extension: entry.isDirectory() ? null : path.extname(entry.name)
    };
    
    if (entry.isDirectory()) {
      item.children = await buildTree(workspacePath, fullPath, depth + 1);
    }
    
    items.push(item);
  }
  
  return items;
}

/**
 * Get language from file extension
 */
function getLanguageFromExt(ext: string): string {
  const langMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.py': 'python',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'shell',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp'
  };
  return langMap[ext.toLowerCase()] || 'plaintext';
}

interface FileHandlersDeps {
  ipcMain: IpcMain;
  dialog: Dialog;
  mainWindow: () => BrowserWindow | null;
  getWorkspacePath: () => string | null;
  setWorkspacePath: (path: string) => void;
  getFocusedFolder?: () => string | null;
  setFocusedFolder?: (path: string | null) => void;
}

/**
 * Register file-related IPC handlers
 */
export function register(deps: FileHandlersDeps): void {
  const { ipcMain, dialog, mainWindow, getWorkspacePath, setWorkspacePath } = deps;

  // Open folder dialog
  ipcMain.handle('file:open-folder', async () => {
    const window = mainWindow();
    if (!window) return { success: false };
    
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Project Folder'
    }) as any;
    
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      setWorkspacePath(result.filePaths[0]);
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  });

  // Get current workspace
  ipcMain.handle('file:get-workspace', () => {
    return getWorkspacePath();
  });

  // Create new folder
  ipcMain.handle('file:create-folder', async (event, folderName: string) => {
    if (!folderName || folderName.trim() === '') {
      return { success: false, error: 'Folder name is required' };
    }

    // Sanitize folder name to remove invalid characters and trailing spaces/dots
    folderName = sanitizeFolderName(folderName);
    
    if (!folderName || folderName === 'untitled') {
      return { success: false, error: 'Invalid folder name after sanitization' };
    }

    // Get parent directory (workspace or a parent folder)
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      // If no workspace, use user's home directory or a default projects folder
      const os = require('os');
      const defaultPath = path.join(os.homedir(), 'Projects');
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
      const newFolderPath = path.join(defaultPath, folderName);
      if (fs.existsSync(newFolderPath)) {
        return { success: false, error: 'Folder already exists' };
      }
      fs.mkdirSync(newFolderPath, { recursive: true });
      setWorkspacePath(newFolderPath);
      return { success: true, path: newFolderPath };
    }

    // Create folder in workspace
    const newFolderPath = path.join(workspacePath, folderName);
    if (fs.existsSync(newFolderPath)) {
      return { success: false, error: 'Folder already exists' };
    }
    fs.mkdirSync(newFolderPath, { recursive: true });
    
    // Set the new folder as the workspace so agents build inside it
    setWorkspacePath(newFolderPath);
    
    return { success: true, path: newFolderPath };
  });

  // Set workspace path directly (for switching to newly created folders)
  ipcMain.handle('file:set-workspace', async (event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, error: 'Path does not exist' };
    }
    
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return { success: false, error: 'Path is not a directory' };
    }
    
    setWorkspacePath(folderPath);
    return { success: true, path: folderPath };
  });

  // Launch project (detect type and run)
  ipcMain.handle('file:launch-project', async (event, projectPath: string) => {
    try {
      const { ProjectRunner } = require('../agent/tools/projectRunner');
      const projectInfo = await ProjectRunner.detectProject(projectPath);
      
      if (projectInfo.type === 'unknown') {
        return { success: false, error: 'Could not detect project type' };
      }

      // For HTML projects, open index.html in browser
      if (projectInfo.type === 'html' || projectInfo.hasIndexHtml) {
        const indexHtmlPath = path.join(projectPath, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
          const { shell } = require('electron');
          // Convert Windows path to file:// URL
          const fileUrl = indexHtmlPath.replace(/\\/g, '/');
          shell.openExternal(`file:///${fileUrl}`);
          return { success: true, message: 'Opened index.html in browser' };
        }
      }

      // For Node.js projects, install deps if needed and run
      if (projectInfo.type === 'node' && projectInfo.startCommand) {
        // Check if node_modules exists
        const nodeModulesPath = path.join(projectPath, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
          // Install dependencies first with proper PATH for child processes
          const { exec } = require('child_process');
          const { resolveCommand, getNodeEnv } = require('../core/tool-path-finder');
          const npmCommand = resolveCommand('npm install');
          const env = getNodeEnv();
          
          return new Promise((resolve) => {
            exec(npmCommand, { cwd: projectPath, env, timeout: 180000 }, (error: any) => {
              if (error) {
                resolve({ success: false, error: `Failed to install dependencies: ${error.message}` });
                return;
              }
              
              // Now run the project
              const runResult = ProjectRunner.runProject(projectPath, projectInfo);
              runResult.then((result: any) => {
                if (result.success && result.port) {
                  const url = `http://localhost:${result.port}`;
                  const { shell } = require('electron');
                  setTimeout(() => shell.openExternal(url), 2000);
                  resolve({ success: true, message: `Project started on port ${result.port}`, url });
                } else {
                  resolve({ success: result.success, message: result.output, error: result.output });
                }
              });
            });
          });
        } else {
          // Dependencies already installed, just run
          const result = await ProjectRunner.runProject(projectPath, projectInfo);
          if (result.success && result.port) {
            const url = `http://localhost:${result.port}`;
            const { shell } = require('electron');
            setTimeout(() => shell.openExternal(url), 2000);
            return { success: true, message: `Project started on port ${result.port}`, url };
          }
          return { success: result.success, message: result.output, error: result.output };
        }
      }

      return { success: false, error: 'Project type not supported for auto-launch' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to launch project' };
    }
  });

  // Read directory tree
  ipcMain.handle('file:read-tree', async (event, dirPath?: string) => {
    const workspacePath = getWorkspacePath();
    const targetPath = dirPath || workspacePath;
    if (!targetPath) return { tree: [], root: null };
    
    try {
      const tree = await buildTree(workspacePath || targetPath, targetPath);
      return { tree, root: targetPath };
    } catch (e: any) {
      return { tree: [], root: targetPath, error: e.message };
    }
  });

  // Read file
  ipcMain.handle('file:read', async (event, filePath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { error: 'No workspace' };
    
    // === SECURITY: Validate file path ===
    const pathValidation = validateFilePath(filePath, workspacePath, { allowAbsolute: true });
    if (!pathValidation.valid) {
      console.error('[File Read] Path validation failed:', pathValidation.errors);
      return { error: `Invalid file path: ${pathValidation.errors.join('; ')}` };
    }
    
    // Check if filePath is already absolute
    let fullPath: string;
    if (path.isAbsolute(filePath)) {
      fullPath = path.normalize(filePath);
    } else {
      fullPath = path.join(workspacePath, filePath);
    }
    
    // === SECURITY: Final boundary check ===
    if (!fullPath.startsWith(path.normalize(workspacePath))) {
      console.error('[File Read] Path escapes workspace:', fullPath);
      return { error: 'File path must be within workspace' };
    }
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(filePath);
      
      return {
        path: filePath,
        content,
        language: getLanguageFromExt(ext),
        size: content.length,
        lines: content.split('\n').length
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Write file
  ipcMain.handle('file:write', async (event, filePath: string, content: string) => {
    // === SECURITY: Rate limiting ===
    const rateCheck = ipcRateLimiter.check('file:write', 50); // 50 writes per minute max
    if (!rateCheck.allowed) {
      console.warn('[File Write] Rate limited');
      return { error: 'Rate limit exceeded. Please slow down file operations.' };
    }
    
    const workspacePath = getWorkspacePath();
    console.log('[File Write] Workspace path:', workspacePath);
    console.log('[File Write] Requested path:', filePath);

    if (!workspacePath) {
      console.error('[File Write] No workspace set!');
      return { error: 'No workspace set. Please open a project first.' };
    }

    // === SECURITY: Validate and sanitize file path ===
    // This automatically sanitizes invalid filename characters (*, <, >, :, ", |, ?, etc.)
    const pathValidation = validateFilePath(filePath, workspacePath, { allowAbsolute: true, sanitizeFilename: true });
    if (!pathValidation.valid) {
      console.error('[File Write] Path validation failed:', pathValidation.errors);
      return { error: `Invalid file path: ${pathValidation.errors.join('; ')}` };
    }
    
    // Use the sanitized path from validation
    const sanitizedFilePath = pathValidation.sanitized || filePath;
    if (sanitizedFilePath !== filePath) {
      console.log('[File Write] Path was sanitized:', filePath, '->', sanitizedFilePath);
    }
    
    // === SECURITY: Validate content ===
    const contentValidation = validateFileContent(content);
    if (!contentValidation.valid) {
      console.error('[File Write] Content validation failed:', contentValidation.errors);
      return { error: `Invalid content: ${contentValidation.errors.join('; ')}` };
    }

    // Check if filePath is already absolute
    let fullPath: string;
    if (path.isAbsolute(sanitizedFilePath)) {
      // If absolute, check if it's within workspace
      const relativePath = path.relative(workspacePath, sanitizedFilePath);
      if (relativePath.startsWith('..') && !relativePath.includes(workspacePath)) {
        return { error: 'File path must be within workspace' };
      }
      fullPath = sanitizedFilePath;
    } else {
      // Relative path - join with workspace
      fullPath = path.join(workspacePath, sanitizedFilePath);
    }

    // Normalize the path to handle any issues
    fullPath = path.normalize(fullPath);
    
    // === SECURITY: Final boundary check ===
    if (!fullPath.startsWith(path.normalize(workspacePath))) {
      console.error('[File Write] Path escapes workspace:', fullPath);
      return { error: 'File path must be within workspace' };
    }

    console.log('[File Write] Final path:', fullPath);
    console.log('[File Write] Directory exists:', fs.existsSync(path.dirname(fullPath)));

    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log('[File Write] SUCCESS: File written to', fullPath);

      // Invalidate completion cache for this file (smart invalidation)
      const relativePath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
      completionOptimizer.onFileSaved(relativePath, content);
      scheduleWorkspaceSymbolIndexRebuildForAgents();

      // Verify the file was actually written
      const fileExists = fs.existsSync(fullPath);
      console.log('[File Write] File exists after write:', fileExists);

      return { success: true, path: fullPath, exists: fileExists };
    } catch (e: any) {
      console.error('[File Write] ERROR:', e.message);
      return { error: e.message };
    }
  });

  // Create file/folder
  ipcMain.handle('file:create', async (event, itemPath: string, isDir: boolean) => {
    // === SECURITY: Rate limiting ===
    const rateCheck = ipcRateLimiter.check('file:create', 30); // 30 creates per minute max
    if (!rateCheck.allowed) {
      console.warn('[File Create] Rate limited');
      return { error: 'Rate limit exceeded. Please slow down file operations.' };
    }
    
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { error: 'No workspace' };
    
    // === SECURITY: Validate and sanitize path ===
    const pathValidation = validateFilePath(itemPath, workspacePath, { sanitizeFilename: true });
    if (!pathValidation.valid) {
      console.error('[File Create] Path validation failed:', pathValidation.errors);
      return { error: `Invalid path: ${pathValidation.errors.join('; ')}` };
    }
    
    // Use sanitized path
    const sanitizedPath = pathValidation.sanitized || itemPath;
    const fullPath = path.join(workspacePath, sanitizedPath);
    
    // === SECURITY: Final boundary check ===
    if (!path.normalize(fullPath).startsWith(path.normalize(workspacePath))) {
      console.error('[File Create] Path escapes workspace:', fullPath);
      return { error: 'Path must be within workspace' };
    }
    
    try {
      if (isDir) {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, '', 'utf-8');
      }
      scheduleWorkspaceSymbolIndexRebuildForAgents();
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Delete file/folder
  ipcMain.handle('file:delete', async (event, itemPath: string) => {
    // === SECURITY: Rate limiting (stricter for delete) ===
    const rateCheck = ipcRateLimiter.check('file:delete', 20); // 20 deletes per minute max
    if (!rateCheck.allowed) {
      console.warn('[File Delete] Rate limited');
      return { error: 'Rate limit exceeded for delete operations.' };
    }
    
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { error: 'No workspace' };
    
    // === SECURITY: Validate path ===
    const pathValidation = validateFilePath(itemPath, workspacePath);
    if (!pathValidation.valid) {
      console.error('[File Delete] Path validation failed:', pathValidation.errors);
      return { error: `Invalid path: ${pathValidation.errors.join('; ')}` };
    }
    
    const fullPath = path.join(workspacePath, itemPath);
    
    // === SECURITY: Ensure path is within workspace ===
    const normalizedFull = path.normalize(fullPath);
    const normalizedWorkspace = path.normalize(workspacePath);
    
    if (!normalizedFull.startsWith(normalizedWorkspace)) {
      console.error('[File Delete] BLOCKED: Path escapes workspace:', normalizedFull);
      return { error: 'Cannot delete files outside workspace' };
    }
    
    // === SECURITY: Prevent deleting workspace root ===
    if (normalizedFull === normalizedWorkspace) {
      console.error('[File Delete] BLOCKED: Attempted to delete workspace root');
      return { error: 'Cannot delete workspace root directory' };
    }
    
    // === SECURITY: Block deletion of critical files ===
    const criticalPatterns = ['.git', '.env', 'package-lock.json', 'yarn.lock'];
    const fileName = path.basename(itemPath);
    if (criticalPatterns.includes(fileName)) {
      console.warn(`[File Delete] Blocked deletion of critical file: ${fileName}`);
      return { error: `Cannot delete critical file: ${fileName}` };
    }
    
    try {
      console.log(`[File Delete] Deleting: ${fullPath}`);
      fs.rmSync(fullPath, { recursive: true, force: true });
      scheduleWorkspaceSymbolIndexRebuildForAgents();
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Set focused folder
  ipcMain.handle('folder:set-focus', async (event, folderPath: string | null) => {
    if (deps.setFocusedFolder) {
      deps.setFocusedFolder(folderPath);
      return { success: true, path: folderPath };
    }
    return { success: false, error: 'Folder focus not available' };
  });

  // Get focused folder
  ipcMain.handle('folder:get-focus', () => {
    if (deps.getFocusedFolder) {
      return { path: deps.getFocusedFolder() };
    }
    return { path: null };
  });

  // Get folder context (all files in folder)
  ipcMain.handle('folder:get-context', async (event, folderPath: string) => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { error: 'No workspace' };
    
    const fullPath = path.join(workspacePath, folderPath);
    
    try {
      const stats = fs.statSync(fullPath);
      if (!stats.isDirectory()) {
        return { error: 'Path is not a directory' };
      }

      const files: Array<{ path: string; name: string; size: number; language?: string }> = [];
      let fileCount = 0;

      function scanDirectory(dirPath: string, relativePath: string): void {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          if (['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build'].includes(entry.name)) continue;
          
          const fullEntryPath = path.join(dirPath, entry.name);
          const relativeEntryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          
          if (entry.isDirectory()) {
            scanDirectory(fullEntryPath, relativeEntryPath);
          } else {
            fileCount++;
            const fileStats = fs.statSync(fullEntryPath);
            const ext = path.extname(entry.name);
            files.push({
              path: relativeEntryPath,
              name: entry.name,
              size: fileStats.size,
              language: getLanguageFromExt(ext)
            });
          }
        }
      }

      scanDirectory(fullPath, folderPath);

      return {
        path: folderPath,
        fileCount,
        files: files.slice(0, 1000) // Limit to 1000 files
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });
}
