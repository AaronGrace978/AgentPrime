import React, { memo, useCallback, useState } from 'react';
import TabContextMenu from './TabContextMenu';
import { getFileIcon, IconClose } from './Icons';

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string | null;
  content?: string;
}

interface OpenFile {
  file: FileItem;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface TabBarProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onTabClick: (index: number) => void;
  onTabClose: (index: number) => void;
  onTabMiddleClick?: (index: number) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
}

interface TabItemProps {
  openFile: OpenFile;
  index: number;
  isActive: boolean;
  isDragged: boolean;
  isDragOver: boolean;
  onTabClick: (index: number, event: React.MouseEvent) => void;
  onTabClose: (index: number, event: React.MouseEvent) => void;
  onTabMiddleClick: (index: number, event: React.MouseEvent) => void;
  onTabContextMenu: (index: number, event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent, index: number) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent, index: number) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent, dropIndex: number) => void;
}

const TabItem = memo(({
  openFile,
  index,
  isActive,
  isDragged,
  isDragOver,
  onTabClick,
  onTabClose,
  onTabMiddleClick,
  onTabContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop
}: TabItemProps) => (
  <div
    className={`tab ${isActive ? 'active' : ''} ${isDragged ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
    onClick={(e) => onTabClick(index, e)}
    onMouseDown={(e) => onTabMiddleClick(index, e)}
    onContextMenu={(e) => onTabContextMenu(index, e)}
    onDragStart={(e) => onDragStart(e, index)}
    onDragEnd={onDragEnd}
    onDragOver={(e) => onDragOver(e, index)}
    onDragLeave={onDragLeave}
    onDrop={(e) => onDrop(e, index)}
    draggable={true}
    title={openFile.file.path}
  >
    <span className="tab-icon">
      {getFileIcon(openFile.file.name, false)}
    </span>
    <span className="tab-name">
      {openFile.file.name}
    </span>
    {openFile.isDirty && (
      <span className="unsaved-indicator">●</span>
    )}
    <button
      className="tab-close"
      onClick={(e) => onTabClose(index, e)}
      title="Close tab"
    >
      <IconClose size="xs" />
    </button>
  </div>
));

const TabBarComponent: React.FC<TabBarProps> = ({
  openFiles,
  activeFileIndex,
  onTabClick,
  onTabClose,
  onTabMiddleClick,
  onTabReorder
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    tabIndex: number;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    tabIndex: -1
  });
  // Using getFileIcon from Icons.tsx

  const handleTabClick = useCallback((index: number, event: React.MouseEvent) => {
    if (event.button === 0) { // Left click
      onTabClick(index);
    }
  }, [onTabClick]);

  const handleTabClose = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    onTabClose(index);
  }, [onTabClose]);

  const handleTabMiddleClick = useCallback((index: number, event: React.MouseEvent) => {
    if (event.button === 1 && onTabMiddleClick) { // Middle click
      event.preventDefault();
      onTabMiddleClick(index);
    }
  }, [onTabMiddleClick]);

  const handleTabContextMenu = useCallback((index: number, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      tabIndex: index
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleCloseTab = useCallback(() => {
    if (contextMenu.tabIndex >= 0) {
      onTabClose(contextMenu.tabIndex);
    }
    closeContextMenu();
  }, [closeContextMenu, contextMenu.tabIndex, onTabClose]);

  const handleCloseOthers = useCallback(() => {
    // Close all tabs except the current one
    for (let i = openFiles.length - 1; i >= 0; i--) {
      if (i !== contextMenu.tabIndex) {
        onTabClose(i);
      }
    }
    closeContextMenu();
  }, [closeContextMenu, contextMenu.tabIndex, onTabClose, openFiles.length]);

  const handleCloseAll = useCallback(() => {
    // Close all tabs
    for (let i = openFiles.length - 1; i >= 0; i--) {
      onTabClose(i);
    }
    closeContextMenu();
  }, [closeContextMenu, onTabClose, openFiles.length]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    // Add visual feedback
    e.currentTarget.classList.add('dragging');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Remove visual feedback
    e.currentTarget.classList.remove('dragging');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're actually leaving the tab area
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));

    if (dragIndex !== dropIndex && dragIndex >= 0 && dropIndex >= 0 && onTabReorder) {
      onTabReorder(dragIndex, dropIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [onTabReorder]);

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {openFiles.map((openFile, index) => (
          <TabItem
            key={`${openFile.file.path}-${index}`}
            openFile={openFile}
            index={index}
            isActive={index === activeFileIndex}
            isDragged={draggedIndex === index}
            isDragOver={dragOverIndex === index}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabMiddleClick={handleTabMiddleClick}
            onTabContextMenu={handleTabContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ))}
      </div>

      <TabContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        onCloseTab={handleCloseTab}
        onCloseOthers={handleCloseOthers}
        onCloseAll={handleCloseAll}
      />
    </div>
  );
};

const TabBar = memo(TabBarComponent);

export default TabBar;
