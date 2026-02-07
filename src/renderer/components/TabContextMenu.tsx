import React, { useEffect, useRef } from 'react';

interface TabContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onDuplicate?: () => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onDuplicate
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 1000,
  };

  return (
    <div ref={menuRef} className="tab-context-menu" style={menuStyle}>
      <div className="context-menu-item" onClick={onCloseTab}>
        <span className="menu-icon">✖️</span>
        <span className="menu-text">Close</span>
        <span className="menu-shortcut">Ctrl+W</span>
      </div>

      <div className="context-menu-item" onClick={onCloseOthers}>
        <span className="menu-icon">📑</span>
        <span className="menu-text">Close Others</span>
      </div>

      <div className="context-menu-item" onClick={onCloseAll}>
        <span className="menu-icon">📚</span>
        <span className="menu-text">Close All</span>
        <span className="menu-shortcut">Ctrl+K W</span>
      </div>

      {onDuplicate && (
        <div className="context-menu-item" onClick={onDuplicate}>
          <span className="menu-icon">📋</span>
          <span className="menu-text">Duplicate</span>
        </div>
      )}
    </div>
  );
};

export default TabContextMenu;
