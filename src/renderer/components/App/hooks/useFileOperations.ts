/**
 * useFileOperations - Hook for file open/save/create operations
 */

import { useState, useCallback } from 'react';
import { OpenFile, FileItem } from '../types';

interface UseFileOperationsProps {
  onToastSuccess?: (title: string, message: string) => void;
  onToastError?: (title: string, message: string) => void;
}

interface UseFileOperationsReturn {
  openFiles: OpenFile[];
  activeFileIndex: number;
  activeFile: OpenFile | null;
  workspacePath: string | null;
  currentPath: string;
  setWorkspacePath: (path: string | null) => void;
  setCurrentPath: (path: string) => void;
  openFile: (file: FileItem) => Promise<void>;
  saveFile: (fileIndex?: number) => Promise<void>;
  openFolder: () => Promise<void>;
  createItem: (type: 'file' | 'folder', name: string) => Promise<void>;
  loadDirectory: (dirPath?: string) => Promise<void>;
  handleContentChange: (newContent: string) => void;
  setOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>;
  setActiveFileIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useFileOperations({
  onToastSuccess,
  onToastError
}: UseFileOperationsProps = {}): UseFileOperationsReturn {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('');

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  // Load directory
  const loadDirectory = useCallback(async (dirPath?: string) => {
    try {
      const result = await window.agentAPI.readTree(dirPath);
      if (result.tree && result.root) {
        setCurrentPath(result.root);
        setWorkspacePath(result.root);
      }
    } catch (err: any) {
      console.error('Error loading directory:', err.message);
    }
  }, []);

  // Open file
  const openFile = useCallback(async (file: FileItem) => {
    if (file.is_dir) return;

    const existingIndex = openFiles.findIndex(f => f.file.path === file.path);
    if (existingIndex >= 0) {
      setActiveFileIndex(existingIndex);
      return;
    }

    try {
      const result = await window.agentAPI.readFile(file.path);
      if (result.content !== undefined) {
        const newOpenFile: OpenFile = {
          file,
          content: result.content,
          originalContent: result.content,
          isDirty: false
        };

        setOpenFiles(prev => [...prev, newOpenFile]);
        setActiveFileIndex(openFiles.length);
      } else if (result.error) {
        console.error(`Failed to open: ${result.error}`);
      }
    } catch (err: any) {
      console.error(`Error opening: ${err.message}`);
    }
  }, [openFiles]);

  // Save file
  const saveFile = useCallback(async (fileIndex?: number) => {
    const index = fileIndex !== undefined ? fileIndex : activeFileIndex;
    if (index < 0 || !openFiles[index]) return;

    try {
      const openFile = openFiles[index];
      const result = await window.agentAPI.writeFile(openFile.file.path, openFile.content);
      if (result.success) {
        setOpenFiles(prev => prev.map((file, i) =>
          i === index
            ? { ...file, originalContent: file.content, isDirty: false }
            : file
        ));
        onToastSuccess?.('File Saved', `${openFile.file.name} saved successfully`);
      } else {
        onToastError?.('Save Failed', result.error || 'Unknown error');
      }
    } catch (err: any) {
      onToastError?.('Save Error', err.message);
    }
  }, [activeFileIndex, openFiles, onToastSuccess, onToastError]);

  // Open folder dialog
  const openFolder = useCallback(async () => {
    try {
      const result = await window.agentAPI.openFolder();
      if (result.success && result.path) {
        await loadDirectory(result.path);
      }
    } catch (err: any) {
      console.error(`Error opening folder: ${err.message}`);
    }
  }, [loadDirectory]);

  // Create file/folder
  const createItem = useCallback(async (type: 'file' | 'folder', name: string) => {
    try {
      const basePath = currentPath || workspacePath || '';
      if (!basePath) {
        throw new Error('No workspace or directory selected');
      }

      const separator = basePath.includes('/') ? '/' : '\\';
      const itemPath = basePath + separator + name;

      const result = await window.agentAPI.createItem(itemPath, type === 'folder');
      if (result.success) {
        await loadDirectory(basePath);
      } else {
        throw new Error(result.error || 'Failed to create item');
      }
    } catch (err: any) {
      console.error(`Error creating ${type}: ${err.message}`);
      throw err;
    }
  }, [currentPath, workspacePath, loadDirectory]);

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    if (activeFileIndex >= 0) {
      setOpenFiles(prev => prev.map((file, i) =>
        i === activeFileIndex
          ? { ...file, content: newContent, isDirty: newContent !== file.originalContent }
          : file
      ));
    }
  }, [activeFileIndex]);

  return {
    openFiles,
    activeFileIndex,
    activeFile,
    workspacePath,
    currentPath,
    setWorkspacePath,
    setCurrentPath,
    openFile,
    saveFile,
    openFolder,
    createItem,
    loadDirectory,
    handleContentChange,
    setOpenFiles,
    setActiveFileIndex
  };
}

export default useFileOperations;

