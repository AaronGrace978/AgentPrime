/**
 * useTabManagement - Hook for managing editor tabs
 */

import { useCallback } from 'react';
import { OpenFile } from '../types';

interface UseTabManagementProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  setOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>;
  setActiveFileIndex: React.Dispatch<React.SetStateAction<number>>;
}

interface UseTabManagementReturn {
  closeTab: (index: number) => Promise<void>;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  switchTab: (index: number) => void;
}

export function useTabManagement({
  openFiles,
  activeFileIndex,
  setOpenFiles,
  setActiveFileIndex
}: UseTabManagementProps): UseTabManagementReturn {
  
  // Close tab
  const closeTab = useCallback(async (index: number) => {
    if (index < 0 || index >= openFiles.length) return;

    const openFile = openFiles[index];
    let shouldClose = true;

    if (openFile.isDirty) {
      shouldClose = confirm(`"${openFile.file.name}" has unsaved changes. Close anyway?`);
    }

    if (shouldClose) {
      setOpenFiles(prev => prev.filter((_, i) => i !== index));

      if (activeFileIndex === index) {
        if (openFiles.length === 1) {
          setActiveFileIndex(-1);
        } else if (index === openFiles.length - 1) {
          setActiveFileIndex(index - 1);
        } else {
          setActiveFileIndex(index);
        }
      } else if (activeFileIndex > index) {
        setActiveFileIndex(activeFileIndex - 1);
      }
    }
  }, [openFiles, activeFileIndex, setOpenFiles, setActiveFileIndex]);

  // Reorder tabs via drag & drop
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= openFiles.length ||
        toIndex < 0 || toIndex >= openFiles.length) return;

    const newOpenFiles = [...openFiles];
    const [movedTab] = newOpenFiles.splice(fromIndex, 1);
    newOpenFiles.splice(toIndex, 0, movedTab);

    let newActiveIndex = activeFileIndex;
    if (fromIndex === activeFileIndex) {
      newActiveIndex = toIndex;
    } else if (fromIndex < activeFileIndex && toIndex >= activeFileIndex) {
      newActiveIndex = activeFileIndex - 1;
    } else if (fromIndex > activeFileIndex && toIndex <= activeFileIndex) {
      newActiveIndex = activeFileIndex + 1;
    }

    setOpenFiles(newOpenFiles);
    setActiveFileIndex(newActiveIndex);

    const tabOrder = newOpenFiles.map(f => f.file.path);
    localStorage.setItem('tabOrder', JSON.stringify(tabOrder));
  }, [openFiles, activeFileIndex, setOpenFiles, setActiveFileIndex]);

  // Switch to tab
  const switchTab = useCallback((index: number) => {
    if (index >= 0 && index < openFiles.length) {
      setActiveFileIndex(index);
    }
  }, [openFiles.length, setActiveFileIndex]);

  return {
    closeTab,
    reorderTabs,
    switchTab
  };
}

export default useTabManagement;

