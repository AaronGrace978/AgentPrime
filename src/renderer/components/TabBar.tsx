import React, { useState } from 'react';
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

const TabBar: React.FC<TabBarProps> = ({
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

  const handleTabClick = (index: number, event: React.MouseEvent) => {
    if (event.button === 0) { // Left click
      onTabClick(index);
    }
  };

  const handleTabClose = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    onTabClose(index);
  };

  const handleTabMiddleClick = (index: number, event: React.MouseEvent) => {
    if (event.button === 1 && onTabMiddleClick) { // Middle click
      event.preventDefault();
      onTabMiddleClick(index);
    }
  };

  const handleTabContextMenu = (index: number, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      tabIndex: index
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleCloseTab = () => {
    if (contextMenu.tabIndex >= 0) {
      onTabClose(contextMenu.tabIndex);
    }
    closeContextMenu();
  };

  const handleCloseOthers = () => {
    // Close all tabs except the current one
    for (let i = openFiles.length - 1; i >= 0; i--) {
      if (i !== contextMenu.tabIndex) {
        onTabClose(i);
      }
    }
    closeContextMenu();
  };

  const handleCloseAll = () => {
    // Close all tabs
    for (let i = openFiles.length - 1; i >= 0; i--) {
      onTabClose(i);
    }
    closeContextMenu();
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    // Add visual feedback
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Remove visual feedback
    e.currentTarget.classList.remove('dragging');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the tab area
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));

    if (dragIndex !== dropIndex && dragIndex >= 0 && dropIndex >= 0 && onTabReorder) {
      onTabReorder(dragIndex, dropIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {openFiles.map((openFile, index) => (
          <div
            key={`${openFile.file.path}-${index}`}
            className={`tab ${index === activeFileIndex ? 'active' : ''} ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
            onClick={(e) => handleTabClick(index, e)}
            onMouseDown={(e) => handleTabMiddleClick(index, e)}
            onContextMenu={(e) => handleTabContextMenu(index, e)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
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
              onClick={(e) => handleTabClose(index, e)}
              title="Close tab"
            >
              <IconClose size="xs" />
            </button>
          </div>
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

export default TabBar;
