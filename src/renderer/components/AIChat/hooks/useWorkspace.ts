/**
 * useWorkspace - Hook for managing workspace state and context
 * Enhanced for better folder-focused development (vibe coding)
 */

import { useState, useEffect, useCallback } from 'react';
import { promptBuilder } from '../../../agent';
import { OpenFile } from '../types';

interface UseWorkspaceReturn {
  workspacePath: string | null;
  focusedFolder: string | null;
  openFolder: () => Promise<string | null>;
  updateContext: () => Promise<void>;
  setFocusedFolder: (folder: string | null) => void;
  getProjectSummary: () => Promise<string>;
}

interface UseWorkspaceProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  getSelectedText?: () => string | undefined;
  getCursorPosition?: () => { lineNumber: number; column: number } | undefined;
}

/**
 * Generate a human-readable project summary for context
 */
async function generateProjectSummary(workspacePath: string): Promise<string> {
  try {
    const treeResult = await window.agentAPI.readTree();
    if (!treeResult || !treeResult.tree) {
      return 'Empty or inaccessible workspace';
    }
    
    const files: string[] = [];
    const folders: string[] = [];
    
    function traverse(items: any[], prefix: string = '') {
      for (const item of items || []) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.is_dir) {
          folders.push(fullPath);
          if (item.children) {
            traverse(item.children, fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    }
    traverse(treeResult.tree);
    
    // Detect project type
    const hasPackageJson = files.includes('package.json');
    const hasIndexHtml = files.includes('index.html');
    const hasPython = files.some(f => f.endsWith('.py'));
    const hasReact = files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    
    let projectType = 'Unknown project type';
    if (hasReact) projectType = 'React application';
    else if (hasPackageJson && hasIndexHtml) projectType = 'Node.js web app';
    else if (hasIndexHtml) projectType = 'Static HTML website';
    else if (hasPackageJson) projectType = 'Node.js project';
    else if (hasPython) projectType = 'Python project';
    
    // Get file extensions breakdown
    const extensions: Record<string, number> = {};
    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase() || 'other';
      extensions[ext] = (extensions[ext] || 0) + 1;
    }
    
    const extSummary = Object.entries(extensions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(', ');
    
    return `${projectType}\n${files.length} files, ${folders.length} folders\nMain file types: ${extSummary}`;
  } catch (error) {
    console.error('Failed to generate project summary:', error);
    return 'Unable to analyze project';
  }
}

export function useWorkspace({
  openFiles,
  activeFileIndex,
  getSelectedText,
  getCursorPosition
}: UseWorkspaceProps): UseWorkspaceReturn {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [focusedFolder, setFocusedFolderState] = useState<string | null>(null);

  // Load workspace and focused folder on mount
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const workspace = await window.agentAPI.getWorkspace();
        if (workspace) {
          setWorkspacePath(workspace);
        }
        
        // Try to load any previously focused folder
        const focusResult = await window.agentAPI.getFolderFocus?.();
        if (focusResult && focusResult.path) {
          setFocusedFolderState(focusResult.path);
          promptBuilder.setFocusedFolder(focusResult.path);
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
      }
    };
    loadWorkspace();
  }, []);

  // Update context when open files or active file changes
  useEffect(() => {
    const updateContext = async () => {
      try {
        const workspaceResult = await window.agentAPI.getWorkspace();
        const treeResult = await window.agentAPI.readTree();

        if (workspaceResult && treeResult) {
          if (workspaceResult !== workspacePath) {
            setWorkspacePath(workspaceResult);
          }
          
          const openTabs = openFiles.map(openFile => ({
            path: openFile.file.path,
            language: openFile.file.name.split('.').pop() || 'text',
            isDirty: openFile.isDirty
          }));

          const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : undefined;
          const activeFileContext = activeFile ? {
            path: activeFile.file.path,
            content: activeFile.content,
            cursorLine: getCursorPosition?.()?.lineNumber || 1,
            cursorColumn: getCursorPosition?.()?.column || 1,
            selectedText: getSelectedText?.()
          } : undefined;

          promptBuilder.setContext({
            workspacePath: workspaceResult,
            openTabs,
            folderTree: treeResult,
            activeFile: activeFileContext,
            focusedFolder: focusedFolder || undefined
          });
        }
      } catch (error) {
        console.warn('Failed to update context:', error);
      }
    };

    updateContext();
  }, [openFiles, activeFileIndex, getSelectedText, getCursorPosition, workspacePath, focusedFolder]);

  // Set focused folder (for folder-focused development)
  const setFocusedFolder = useCallback((folder: string | null) => {
    setFocusedFolderState(folder);
    promptBuilder.setFocusedFolder(folder);
    
    // Persist to backend
    window.agentAPI.setFolderFocus?.(folder).catch((e: any) => {
      console.warn('Failed to persist folder focus:', e);
    });
  }, []);

  // Open folder dialog
  const openFolder = useCallback(async (): Promise<string | null> => {
    try {
      const result = await window.agentAPI.openFolder();
      if (result && result.success && result.path) {
        const folderPath = result.path;
        setWorkspacePath(folderPath);
        
        // Clear focused folder when opening a new workspace
        setFocusedFolderState(null);
        promptBuilder.setFocusedFolder(null);
        
        // Reinitialize context
        const treeResult = await window.agentAPI.readTree();
        if (treeResult) {
          promptBuilder.setContext({
            workspacePath: folderPath,
            openTabs: openFiles.map(f => ({ 
              path: f.file.path, 
              language: f.file.name.split('.').pop() || 'text', 
              isDirty: f.isDirty 
            })),
            folderTree: treeResult,
            activeFile: undefined,
            focusedFolder: undefined
          });
        }
        return folderPath;
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
    return null;
  }, [openFiles]);

  // Manual context update
  const updateContext = useCallback(async () => {
    try {
      const workspaceResult = await window.agentAPI.getWorkspace();
      const treeResult = await window.agentAPI.readTree();

      if (workspaceResult) {
        // Update workspace path state
        setWorkspacePath(workspaceResult);
        
        if (treeResult) {
          const openTabs = openFiles.map(openFile => ({
            path: openFile.file.path,
            language: openFile.file.name.split('.').pop() || 'text',
            isDirty: openFile.isDirty
          }));

          const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : undefined;
          const activeFileContext = activeFile ? {
            path: activeFile.file.path,
            content: activeFile.content,
            cursorLine: getCursorPosition?.()?.lineNumber || 1,
            cursorColumn: getCursorPosition?.()?.column || 1,
            selectedText: getSelectedText?.()
          } : undefined;

          promptBuilder.setContext({
            workspacePath: workspaceResult,
            openTabs,
            folderTree: treeResult,
            activeFile: activeFileContext,
            focusedFolder: focusedFolder || undefined
          });
        }
      }
    } catch (error) {
      console.warn('Failed to update context:', error);
    }
  }, [openFiles, activeFileIndex, getSelectedText, getCursorPosition, focusedFolder]);

  // Get project summary for quick context
  const getProjectSummary = useCallback(async (): Promise<string> => {
    if (!workspacePath) {
      return 'No workspace open';
    }
    return generateProjectSummary(workspacePath);
  }, [workspacePath]);

  return {
    workspacePath,
    focusedFolder,
    openFolder,
    updateContext,
    setFocusedFolder,
    getProjectSummary
  };
}

export default useWorkspace;

