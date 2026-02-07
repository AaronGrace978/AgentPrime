import React, { useState, useCallback, useRef, useEffect } from 'react';
import EditorPane, { EditorPaneData, OpenFile, FileItem } from './EditorPane';

export type SplitDirection = 'horizontal' | 'vertical' | 'none';

export interface SplitNode {
  id: string;
  type: 'pane' | 'split';
  // For type === 'pane'
  pane?: EditorPaneData;
  // For type === 'split'
  direction?: SplitDirection;
  children?: SplitNode[];
  sizes?: number[]; // Percentage sizes for each child
}

export interface SplitViewContainerProps {
  initialFiles?: OpenFile[];
  workspacePath: string;
  theme?: 'vs' | 'vs-dark';
  codeIssues: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
    ruleId: string;
  }>;
  onOpenFile: (file: FileItem) => Promise<OpenFile | null>;
  onSaveFile: (file: OpenFile) => Promise<boolean>;
  onRun: () => void;
  onFilesChange?: (allFiles: OpenFile[]) => void;
  onActiveFileChange?: (file: OpenFile | null, paneId: string) => void;
}

// Generate unique IDs
let paneIdCounter = 0;
const generatePaneId = () => `pane-${++paneIdCounter}`;

const SplitViewContainer: React.FC<SplitViewContainerProps> = ({
  initialFiles = [],
  workspacePath,
  theme = 'vs-dark',
  codeIssues,
  onOpenFile,
  onSaveFile,
  onRun,
  onFilesChange,
  onActiveFileChange
}) => {
  // State: array of panes (simplified flat structure for now)
  const [panes, setPanes] = useState<EditorPaneData[]>(() => {
    const initialPane: EditorPaneData = {
      id: generatePaneId(),
      tabs: initialFiles,
      activeTabIndex: initialFiles.length > 0 ? 0 : -1,
      scrollPosition: { line: 1, column: 1 },
      syncScrolling: false
    };
    return [initialPane];
  });

  const [splitDirection, setSplitDirection] = useState<SplitDirection>('none');
  const [splitSizes, setSplitSizes] = useState<number[]>([100]);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeIndex, setResizeIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync files to parent when they change
  useEffect(() => {
    if (onFilesChange) {
      const allFiles = panes.flatMap(p => p.tabs);
      onFilesChange(allFiles);
    }
  }, [panes, onFilesChange]);

  // Update initial files when they change from outside
  useEffect(() => {
    if (initialFiles.length > 0 && panes.length === 1 && panes[0].tabs.length === 0) {
      setPanes(prev => [{
        ...prev[0],
        tabs: initialFiles,
        activeTabIndex: 0
      }]);
    }
  }, [initialFiles]);

  // Handle content change
  const handleContentChange = useCallback((paneId: string, content: string) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id !== paneId) return pane;
      if (pane.activeTabIndex < 0) return pane;
      
      const newTabs = pane.tabs.map((tab, i) => {
        if (i !== pane.activeTabIndex) return tab;
        return {
          ...tab,
          content,
          isDirty: content !== tab.originalContent
        };
      });
      
      return { ...pane, tabs: newTabs };
    }));
  }, []);

  // Handle tab click
  const handleTabClick = useCallback((paneId: string, tabIndex: number) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id !== paneId) return pane;
      const newPane = { ...pane, activeTabIndex: tabIndex };
      
      // Notify parent of active file change
      if (onActiveFileChange && tabIndex >= 0 && tabIndex < pane.tabs.length) {
        onActiveFileChange(pane.tabs[tabIndex], paneId);
      }
      
      return newPane;
    }));
  }, [onActiveFileChange]);

  // Handle tab close
  const handleTabClose = useCallback((paneId: string, tabIndex: number) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id !== paneId) return pane;
      if (tabIndex < 0 || tabIndex >= pane.tabs.length) return pane;

      const tab = pane.tabs[tabIndex];
      
      // Check for unsaved changes
      if (tab.isDirty) {
        const shouldClose = confirm(`"${tab.file.name}" has unsaved changes. Close anyway?`);
        if (!shouldClose) return pane;
      }

      const newTabs = pane.tabs.filter((_, i) => i !== tabIndex);
      let newActiveIndex = pane.activeTabIndex;

      if (pane.activeTabIndex === tabIndex) {
        if (newTabs.length === 0) {
          newActiveIndex = -1;
        } else if (tabIndex >= newTabs.length) {
          newActiveIndex = newTabs.length - 1;
        }
      } else if (pane.activeTabIndex > tabIndex) {
        newActiveIndex = pane.activeTabIndex - 1;
      }

      return { ...pane, tabs: newTabs, activeTabIndex: newActiveIndex };
    }));
  }, []);

  // Handle tab reorder
  const handleTabReorder = useCallback((paneId: string, fromIndex: number, toIndex: number) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id !== paneId) return pane;
      if (fromIndex < 0 || fromIndex >= pane.tabs.length ||
          toIndex < 0 || toIndex >= pane.tabs.length) return pane;

      const newTabs = [...pane.tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);

      let newActiveIndex = pane.activeTabIndex;
      if (fromIndex === pane.activeTabIndex) {
        newActiveIndex = toIndex;
      } else if (fromIndex < pane.activeTabIndex && toIndex >= pane.activeTabIndex) {
        newActiveIndex = pane.activeTabIndex - 1;
      } else if (fromIndex > pane.activeTabIndex && toIndex <= pane.activeTabIndex) {
        newActiveIndex = pane.activeTabIndex + 1;
      }

      return { ...pane, tabs: newTabs, activeTabIndex: newActiveIndex };
    }));
  }, []);

  // Handle save
  const handleSave = useCallback(async (paneId: string, tabIndex?: number) => {
    const pane = panes.find(p => p.id === paneId);
    if (!pane) return;

    const index = tabIndex !== undefined ? tabIndex : pane.activeTabIndex;
    if (index < 0 || index >= pane.tabs.length) return;

    const file = pane.tabs[index];
    const success = await onSaveFile(file);

    if (success) {
      setPanes(prev => prev.map(p => {
        if (p.id !== paneId) return p;
        const newTabs = p.tabs.map((tab, i) => {
          if (i !== index) return tab;
          return { ...tab, originalContent: tab.content, isDirty: false };
        });
        return { ...p, tabs: newTabs };
      }));
    }
  }, [panes, onSaveFile]);

  // Handle split pane
  const handleSplitPane = useCallback((paneId: string, direction: SplitDirection) => {
    if (panes.length >= 4) {
      console.log('Maximum 4 panes allowed');
      return;
    }

    const sourcePaneIndex = panes.findIndex(p => p.id === paneId);
    if (sourcePaneIndex === -1) return;

    const sourcePane = panes[sourcePaneIndex];
    
    // Create new pane with same file (or empty)
    const newPane: EditorPaneData = {
      id: generatePaneId(),
      tabs: sourcePane.activeTabIndex >= 0 
        ? [{ ...sourcePane.tabs[sourcePane.activeTabIndex] }] 
        : [],
      activeTabIndex: sourcePane.activeTabIndex >= 0 ? 0 : -1,
      scrollPosition: { line: 1, column: 1 },
      syncScrolling: false
    };

    // Add new pane
    const newPanes = [...panes];
    newPanes.splice(sourcePaneIndex + 1, 0, newPane);
    setPanes(newPanes);

    // Update split direction and sizes
    if (panes.length === 1) {
      setSplitDirection(direction);
      setSplitSizes([50, 50]);
    } else {
      // Distribute sizes evenly
      const newSizes = newPanes.map(() => 100 / newPanes.length);
      setSplitSizes(newSizes);
    }
  }, [panes]);

  // Handle close pane
  const handleClosePane = useCallback((paneId: string) => {
    if (panes.length <= 1) return; // Can't close last pane

    const paneIndex = panes.findIndex(p => p.id === paneId);
    if (paneIndex === -1) return;

    const pane = panes[paneIndex];
    
    // Check for unsaved changes
    const hasUnsavedChanges = pane.tabs.some(t => t.isDirty);
    if (hasUnsavedChanges) {
      const shouldClose = confirm('This pane has unsaved changes. Close anyway?');
      if (!shouldClose) return;
    }

    const newPanes = panes.filter(p => p.id !== paneId);
    setPanes(newPanes);

    // Update sizes
    if (newPanes.length === 1) {
      setSplitDirection('none');
      setSplitSizes([100]);
    } else {
      const newSizes = newPanes.map(() => 100 / newPanes.length);
      setSplitSizes(newSizes);
    }
  }, [panes]);

  // Handle scroll change (for sync scrolling)
  const handleScrollChange = useCallback((paneId: string, line: number, column: number) => {
    const sourcePane = panes.find(p => p.id === paneId);
    if (!sourcePane?.syncScrolling) return;

    // Update scroll position for all panes with sync enabled
    setPanes(prev => prev.map(pane => {
      if (pane.id === paneId || !pane.syncScrolling) return pane;
      return { ...pane, scrollPosition: { line, column } };
    }));
  }, [panes]);

  // Resize handling
  const handleResizeStart = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeIndex(index);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || resizeIndex < 0 || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    const isHorizontal = splitDirection === 'horizontal';
    const totalSize = isHorizontal ? rect.height : rect.width;
    const position = isHorizontal 
      ? e.clientY - rect.top 
      : e.clientX - rect.left;

    // Calculate cumulative sizes up to resize index
    let cumulativeSize = 0;
    for (let i = 0; i < resizeIndex; i++) {
      cumulativeSize += (splitSizes[i] / 100) * totalSize;
    }

    // Calculate new size for current pane
    const newCurrentSize = ((position - cumulativeSize) / totalSize) * 100;
    const minSize = 10; // Minimum 10%

    if (newCurrentSize < minSize || newCurrentSize > 90) return;

    // Adjust sizes
    const newSizes = [...splitSizes];
    const oldSize = newSizes[resizeIndex];
    const nextOldSize = newSizes[resizeIndex + 1];
    const diff = newCurrentSize - oldSize;

    newSizes[resizeIndex] = newCurrentSize;
    newSizes[resizeIndex + 1] = nextOldSize - diff;

    if (newSizes[resizeIndex + 1] < minSize) return;

    setSplitSizes(newSizes);
  }, [isResizing, resizeIndex, splitDirection, splitSizes]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeIndex(-1);
  }, []);

  // Add/remove resize listeners
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = splitDirection === 'horizontal' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleResizeMove, handleResizeEnd, splitDirection]);

  // Add file to specific pane
  const addFileToPane = useCallback((paneId: string, file: OpenFile) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id !== paneId) return pane;
      
      // Check if already open
      const existingIndex = pane.tabs.findIndex(t => t.file.path === file.file.path);
      if (existingIndex >= 0) {
        return { ...pane, activeTabIndex: existingIndex };
      }
      
      return {
        ...pane,
        tabs: [...pane.tabs, file],
        activeTabIndex: pane.tabs.length
      };
    }));
  }, []);

  // Expose method to open file in first pane
  const openFileInFirstPane = useCallback(async (file: FileItem) => {
    if (panes.length === 0) return;
    
    const openedFile = await onOpenFile(file);
    if (openedFile) {
      addFileToPane(panes[0].id, openedFile);
    }
  }, [panes, onOpenFile, addFileToPane]);

  // Render panes
  const renderPanes = () => {
    if (panes.length === 1) {
      return (
        <EditorPane
          pane={panes[0]}
          paneIndex={0}
          totalPanes={1}
          workspacePath={workspacePath}
          theme={theme}
          codeIssues={codeIssues}
          onContentChange={handleContentChange}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onTabReorder={handleTabReorder}
          onSave={handleSave}
          onRun={onRun}
          onClosePane={handleClosePane}
          onSplitPane={handleSplitPane}
          onScrollChange={handleScrollChange}
          canClose={false}
        />
      );
    }

    // Multiple panes with resize handles
    const elements: React.ReactNode[] = [];
    
    panes.forEach((pane, index) => {
      elements.push(
        <div 
          key={pane.id}
          className="split-pane"
          style={{ 
            [splitDirection === 'horizontal' ? 'height' : 'width']: `${splitSizes[index]}%`,
            [splitDirection === 'horizontal' ? 'width' : 'height']: '100%'
          }}
        >
          <EditorPane
            pane={pane}
            paneIndex={index}
            totalPanes={panes.length}
            workspacePath={workspacePath}
            theme={theme}
            codeIssues={codeIssues}
            onContentChange={handleContentChange}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabReorder={handleTabReorder}
            onSave={handleSave}
            onRun={onRun}
            onClosePane={handleClosePane}
            onSplitPane={handleSplitPane}
            onScrollChange={handleScrollChange}
            canClose={panes.length > 1}
          />
        </div>
      );

      // Add resize handle between panes
      if (index < panes.length - 1) {
        elements.push(
          <div
            key={`resize-${index}`}
            className={`resize-handle ${splitDirection}`}
            onMouseDown={(e) => handleResizeStart(index, e)}
          />
        );
      }
    });

    return elements;
  };

  return (
    <div 
      ref={containerRef}
      className={`split-view-container ${splitDirection !== 'none' ? `split-${splitDirection}` : ''}`}
    >
      {renderPanes()}
    </div>
  );
};

export default SplitViewContainer;

// Export helper to open files from outside
export const useSplitView = () => {
  // Hook for external file opening could go here
  return {};
};

