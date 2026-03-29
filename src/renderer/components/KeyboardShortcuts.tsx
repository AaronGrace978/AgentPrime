/**
 * KeyboardShortcuts - Keyboard shortcuts editor for AgentPrime
 * 
 * Features:
 * - View all available shortcuts
 * - Customize keybindings
 * - Search shortcuts
 * - Conflict detection
 * - Reset to defaults
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  IconKeyboard,
  IconSearch,
  IconRefresh,
  IconEdit,
  IconCheck,
  IconX,
  IconSave
} from './Icons';

// Shortcut category
export type ShortcutCategory =
  | 'general'
  | 'editor'
  | 'navigation'
  | 'git'
  | 'ai'
  | 'view';

// Keyboard shortcut definition
export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  category: ShortcutCategory;
  defaultKeybinding: string;
  currentKeybinding: string;
  when?: string; // Context when shortcut is active
}

// Default shortcuts — kept in sync with App/index.tsx and MonacoEditor.tsx
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // General
  { id: 'command-palette', name: 'Command Palette', description: 'Open command palette', category: 'general', defaultKeybinding: 'Ctrl+K', currentKeybinding: 'Ctrl+K', when: '!editorFocus' },
  { id: 'open-project', name: 'Open Project', description: 'Open a workspace folder', category: 'general', defaultKeybinding: 'Ctrl+O', currentKeybinding: 'Ctrl+O' },
  { id: 'save', name: 'Save', description: 'Save current file', category: 'general', defaultKeybinding: 'Ctrl+S', currentKeybinding: 'Ctrl+S' },
  { id: 'new-project', name: 'New Project From Template', description: 'Open project templates', category: 'general', defaultKeybinding: 'Ctrl+Shift+N', currentKeybinding: 'Ctrl+Shift+N' },
  { id: 'close-tab', name: 'Close Tab', description: 'Close current tab', category: 'general', defaultKeybinding: 'Ctrl+W', currentKeybinding: 'Ctrl+W' },
  { id: 'run-current-file', name: 'Run Current File', description: 'Execute the selected file', category: 'general', defaultKeybinding: 'F5', currentKeybinding: 'F5' },

  // Editor
  { id: 'inline-edit', name: 'Inline AI Edit', description: 'AI-powered edit on selected code', category: 'editor', defaultKeybinding: 'Ctrl+K', currentKeybinding: 'Ctrl+K', when: 'editorFocus' },
  { id: 'find', name: 'Find', description: 'Find in file', category: 'editor', defaultKeybinding: 'Ctrl+F', currentKeybinding: 'Ctrl+F' },
  { id: 'find-in-files', name: 'Search & Replace in Files', description: 'Search across workspace files', category: 'editor', defaultKeybinding: 'Ctrl+Shift+F', currentKeybinding: 'Ctrl+Shift+F' },
  { id: 'go-to-definition', name: 'Go to Definition', description: 'Jump to symbol definition', category: 'editor', defaultKeybinding: 'Ctrl+G', currentKeybinding: 'Ctrl+G', when: 'editorFocus' },
  { id: 'find-references', name: 'Find References', description: 'Find all symbol references', category: 'editor', defaultKeybinding: 'Shift+F12', currentKeybinding: 'Shift+F12', when: 'editorFocus' },
  { id: 'peek-definition', name: 'Peek Definition', description: 'Peek at symbol definition inline', category: 'editor', defaultKeybinding: 'Alt+F12', currentKeybinding: 'Alt+F12', when: 'editorFocus' },
  { id: 'go-to-symbol', name: 'Go to Symbol in File', description: 'Navigate to symbol in current file', category: 'editor', defaultKeybinding: 'Ctrl+Shift+O', currentKeybinding: 'Ctrl+Shift+O', when: 'editorFocus' },

  // Navigation
  { id: 'next-tab', name: 'Next Tab', description: 'Switch to next tab', category: 'navigation', defaultKeybinding: 'Ctrl+Tab', currentKeybinding: 'Ctrl+Tab' },
  { id: 'prev-tab', name: 'Previous Tab', description: 'Switch to previous tab', category: 'navigation', defaultKeybinding: 'Ctrl+Shift+Tab', currentKeybinding: 'Ctrl+Shift+Tab' },

  // Git
  { id: 'toggle-git-panel', name: 'Toggle Source Control', description: 'Show or hide Git panel', category: 'git', defaultKeybinding: 'Ctrl+Shift+G', currentKeybinding: 'Ctrl+Shift+G' },

  // AI
  { id: 'toggle-ai-composer', name: 'Toggle AI Composer', description: 'Show or hide AI composer sidebar', category: 'ai', defaultKeybinding: 'Ctrl+L', currentKeybinding: 'Ctrl+L' },

  // View
  { id: 'toggle-sidebar', name: 'Toggle Sidebar', description: 'Show/hide file explorer', category: 'view', defaultKeybinding: 'Ctrl+B', currentKeybinding: 'Ctrl+B' },
  { id: 'toggle-terminal', name: 'Toggle Terminal', description: 'Show or hide integrated terminal', category: 'view', defaultKeybinding: 'Ctrl+`', currentKeybinding: 'Ctrl+`' },
  { id: 'live-preview', name: 'Live Preview', description: 'Toggle live preview panel', category: 'view', defaultKeybinding: 'Ctrl+Shift+P', currentKeybinding: 'Ctrl+Shift+P' },
  { id: 'deploy', name: 'Deploy Project', description: 'Open deploy panel', category: 'view', defaultKeybinding: 'Ctrl+Shift+D', currentKeybinding: 'Ctrl+Shift+D' },
];

// Category labels
const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  editor: 'Editor',
  navigation: 'Navigation',
  git: 'Git',
  ai: 'AI Assistant',
  view: 'View'
};

interface KeyboardShortcutsProps {
  isOpen?: boolean;
  embedded?: boolean; // When true, renders without modal overlay (for embedding in Settings)
  shortcuts?: KeyboardShortcut[];
  onShortcutsChange?: (shortcuts: KeyboardShortcut[]) => void;
  onClose?: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  isOpen = true,
  embedded = false,
  shortcuts: initialShortcuts,
  onShortcutsChange,
  onClose
}) => {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(
    initialShortcuts || DEFAULT_SHORTCUTS
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ShortcutCategory | 'all'>('all');
  const [hasChanges, setHasChanges] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingId) {
        onClose?.();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, editingId, onClose]);

  // Handle key recording
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (e.metaKey) keys.push('Meta');
    
    // Get the actual key
    const key = e.key;
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      // Normalize key names
      let normalizedKey = key;
      if (key === ' ') normalizedKey = 'Space';
      else if (key === 'ArrowUp') normalizedKey = 'Up';
      else if (key === 'ArrowDown') normalizedKey = 'Down';
      else if (key === 'ArrowLeft') normalizedKey = 'Left';
      else if (key === 'ArrowRight') normalizedKey = 'Right';
      else if (key.length === 1) normalizedKey = key.toUpperCase();
      
      keys.push(normalizedKey);
    }
    
    setRecordingKeys(keys);
  }, [editingId]);

  // Save keybinding
  const saveKeybinding = useCallback(() => {
    if (!editingId || recordingKeys.length === 0) {
      setEditingId(null);
      setRecordingKeys([]);
      return;
    }
    
    const newKeybinding = recordingKeys.join('+');
    
    setShortcuts(prev => prev.map(s => 
      s.id === editingId ? { ...s, currentKeybinding: newKeybinding } : s
    ));
    
    setEditingId(null);
    setRecordingKeys([]);
    setHasChanges(true);
  }, [editingId, recordingKeys]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setRecordingKeys([]);
  }, []);

  // Reset single shortcut
  const resetShortcut = useCallback((id: string) => {
    setShortcuts(prev => prev.map(s => 
      s.id === id ? { ...s, currentKeybinding: s.defaultKeybinding } : s
    ));
    setHasChanges(true);
  }, []);

  // Reset all shortcuts
  const resetAll = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    setHasChanges(true);
  }, []);

  // Save all changes
  const saveChanges = useCallback(() => {
    onShortcutsChange?.(shortcuts);
    setHasChanges(false);
  }, [shortcuts, onShortcutsChange]);

  // Check for conflicts
  const getConflicts = useCallback((keybinding: string, excludeId: string): KeyboardShortcut[] => {
    return shortcuts.filter(s => 
      s.id !== excludeId && s.currentKeybinding === keybinding
    );
  }, [shortcuts]);

  // Filter shortcuts
  const filteredShortcuts = shortcuts.filter(shortcut => {
    const matchesSearch = !searchQuery || 
      shortcut.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shortcut.currentKeybinding.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || shortcut.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    const cat = shortcut.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(shortcut);
    return acc;
  }, {} as Record<ShortcutCategory, KeyboardShortcut[]>);

  // Early return if not open (only applies to modal mode)
  if (!isOpen && !embedded) return null;

  // Content to render (shared between modal and embedded modes)
  const content = (
    <div
      className={`apks ${embedded ? 'apks--embedded' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="apks__head">
        <h3 className="apks__title"><IconKeyboard size="md" /> Keyboard shortcuts</h3>
        <div className="apks__headActions">
          {hasChanges && (
            <button type="button" className="apks__btn apks__btn--primary" onClick={saveChanges}>
              <IconSave size="sm" /> Save
            </button>
          )}
          <button type="button" className="apks__btn apks__btn--ghost" onClick={resetAll} title="Reset all to defaults">
            <IconRefresh size="sm" /> Reset all
          </button>
          {onClose && (
            <button type="button" className="apks__btn apks__btn--ghost" onClick={onClose} title="Close">
              <IconX size="sm" /> Close
            </button>
          )}
        </div>
      </div>

      <div className="apks__toolbar">
        <div className="apks__search">
          <IconSearch size="sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="apks__searchInput"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as ShortcutCategory | 'all')}
          className="apks__select"
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="apks__scroll">
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
          <div key={category} className="apks__group">
            <h4 className="apks__cat">{CATEGORY_LABELS[category as ShortcutCategory]}</h4>
            {categoryShortcuts.map(shortcut => {
              const isEditing = editingId === shortcut.id;
              const isModified = shortcut.currentKeybinding !== shortcut.defaultKeybinding;
              const conflicts = getConflicts(shortcut.currentKeybinding, shortcut.id);
              return (
                <div
                  key={shortcut.id}
                  className={`apks__row${isEditing ? ' apks__row--editing' : ''}${isModified ? ' apks__row--modified' : ''}${conflicts.length > 0 ? ' apks__row--conflict' : ''}`}
                >
                  <div className="apks__meta">
                    <span className="apks__name">{shortcut.name}</span>
                    <span className="apks__desc">{shortcut.description}</span>
                  </div>
                  <div className="apks__keys">
                    {isEditing ? (
                      <div className="apks__keyEdit">
                        <input
                          ref={inputRef}
                          type="text"
                          value={recordingKeys.join('+')}
                          onKeyDown={handleKeyDown}
                          placeholder="Press keys..."
                          readOnly
                          className="apks__keyInput"
                        />
                        <button type="button" className="apks__iconBtn" onClick={saveKeybinding} title="Save">
                          <IconCheck size="xs" />
                        </button>
                        <button type="button" className="apks__iconBtn" onClick={cancelEditing} title="Cancel">
                          <IconX size="xs" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <kbd className="apks__kbdWrap">
                          {shortcut.currentKeybinding.split('+').map((key, i) => (
                            <span key={i} className="apks__kbd">{key}</span>
                          ))}
                        </kbd>
                        <div className="apks__rowActions">
                          <button
                            type="button"
                            className="apks__iconBtn"
                            onClick={() => setEditingId(shortcut.id)}
                            title="Edit"
                          >
                            <IconEdit size="xs" />
                          </button>
                          {isModified && (
                            <button
                              type="button"
                              className="apks__iconBtn"
                              onClick={() => resetShortcut(shortcut.id)}
                              title="Reset"
                            >
                              <IconRefresh size="xs" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {conflicts.length > 0 && !isEditing && (
                    <div className="apks__conflict">
                      Conflict: {conflicts.map(c => c.name).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {filteredShortcuts.length === 0 && (
          <div className="apks__empty">
            <IconSearch size="lg" />
            <p>No shortcuts match your search.</p>
          </div>
        )}
      </div>

      <style>{`
        .apks-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1600;
        }

        .apks {
          width: 90%;
          max-width: 780px;
          height: 80%;
          max-height: 580px;
          display: flex;
          flex-direction: column;
          background: var(--prime-surface);
          border-radius: 14px;
          border: 1px solid var(--prime-border);
          box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .apks--embedded {
          width: 100%;
          max-width: none;
          max-height: none;
          flex: 1;
          min-height: 0;
          border-radius: 10px;
          border: 1px solid var(--prime-border);
          box-shadow: none;
          background: var(--prime-surface);
        }

        .apks__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--prime-border);
          background: var(--prime-surface);
          flex-shrink: 0;
        }

        .apks__title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: var(--prime-text);
          letter-spacing: -0.01em;
        }

        .apks__headActions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
        }

        .apks__btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }

        .apks__btn--primary {
          background: var(--prime-accent);
          color: #fff;
          border-color: var(--prime-accent);
        }

        .apks__btn--primary:hover {
          background: var(--prime-accent-hover);
          border-color: var(--prime-accent-hover);
        }

        .apks__btn--ghost {
          background: transparent;
          color: var(--prime-text-secondary);
          border-color: var(--prime-border);
        }

        .apks__btn--ghost:hover {
          background: var(--prime-surface-hover);
          color: var(--prime-text);
        }

        .apks__toolbar {
          display: flex;
          gap: 10px;
          padding: 12px 18px;
          border-bottom: 1px solid var(--prime-border);
          background: var(--prime-bg);
          flex-shrink: 0;
        }

        .apks__search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--prime-surface);
          border: 1px solid var(--prime-border);
          border-radius: 8px;
          min-width: 0;
        }

        .apks__search:focus-within {
          border-color: var(--prime-accent);
          box-shadow: 0 0 0 2px var(--prime-accent-glow);
        }

        .apks__searchInput {
          flex: 1;
          min-width: 0;
          background: none;
          border: none;
          color: var(--prime-text);
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }

        .apks__searchInput::placeholder {
          color: var(--prime-text-muted);
        }

        .apks__select {
          padding: 8px 12px;
          background: var(--prime-surface);
          border: 1px solid var(--prime-border);
          border-radius: 8px;
          color: var(--prime-text);
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
        }

        .apks__select option {
          background: var(--prime-surface);
          color: var(--prime-text);
        }

        .apks__scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px 18px 18px;
          background: var(--prime-bg);
        }

        .apks__group {
          margin-bottom: 20px;
        }

        .apks__group:last-child {
          margin-bottom: 0;
        }

        .apks__cat {
          margin: 0 0 8px 0;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--prime-border);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--prime-text-muted);
        }

        .apks__row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          padding: 10px 10px;
          border-radius: 8px;
          transition: background 0.1s ease;
          opacity: 1;
        }

        .apks__row:hover {
          background: var(--prime-surface-hover);
        }

        .apks__row--editing {
          background: var(--prime-accent-light);
          outline: 1px solid var(--prime-accent);
          outline-offset: -1px;
        }

        .apks__row--modified .apks__kbdWrap {
          border-color: var(--prime-warning);
        }

        .apks__row--conflict .apks__kbdWrap {
          border-color: var(--prime-error);
        }

        .apks__meta {
          flex: 1;
          min-width: 160px;
        }

        .apks__name {
          display: block;
          font-weight: 600;
          color: var(--prime-text);
          font-size: 13px;
        }

        .apks__desc {
          display: block;
          font-size: 12px;
          color: var(--prime-text-muted);
          margin-top: 2px;
        }

        .apks__keys {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .apks__kbdWrap {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 4px 8px;
          background: var(--prime-surface);
          border: 1px solid var(--prime-border);
          border-radius: 6px;
        }

        .apks__kbd {
          display: inline-block;
          padding: 3px 8px;
          background: var(--prime-surface-hover);
          border: 1px solid var(--prime-border);
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          color: var(--prime-text);
        }

        .apks__rowActions {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.1s;
        }

        .apks__row:hover .apks__rowActions {
          opacity: 1;
        }

        .apks__iconBtn {
          padding: 4px;
          background: none;
          border: none;
          color: var(--prime-text-muted);
          cursor: pointer;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .apks__iconBtn:hover {
          background: var(--prime-surface-hover);
          color: var(--prime-text);
        }

        .apks__keyEdit {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .apks__keyInput {
          width: 150px;
          padding: 6px 10px;
          background: var(--prime-surface);
          border: 2px solid var(--prime-accent);
          border-radius: 6px;
          color: var(--prime-text);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          text-align: center;
          outline: none;
        }

        .apks__conflict {
          width: 100%;
          margin-top: 4px;
          padding: 6px 10px;
          background: rgba(239, 68, 68, 0.08);
          border-radius: 6px;
          font-size: 11px;
          color: var(--prime-error);
        }

        .apks__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px 20px;
          color: var(--prime-text-muted);
          font-size: 13px;
        }
      `}</style>
    </div>
  );

  // If embedded, return content directly without overlay
  if (embedded) {
    return content;
  }

  // Otherwise, wrap in modal overlay
  return (
    <div className="apks-overlay" onClick={onClose}>
      {content}
    </div>
  );
};

export default KeyboardShortcuts;

// Hook to manage keyboard shortcuts
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[] = DEFAULT_SHORTCUTS) {
  const [activeShortcuts, setActiveShortcuts] = useState(shortcuts);
  
  // Load saved shortcuts from storage
  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        const saved = localStorage.getItem('agentprime-shortcuts');
        if (saved) {
          const parsed = JSON.parse(saved);
          setActiveShortcuts(parsed);
        }
      } catch (error) {
        console.error('Failed to load shortcuts:', error);
      }
    };
    loadShortcuts();
  }, []);
  
  // Save shortcuts
  const saveShortcuts = useCallback((newShortcuts: KeyboardShortcut[]) => {
    setActiveShortcuts(newShortcuts);
    localStorage.setItem('agentprime-shortcuts', JSON.stringify(newShortcuts));
  }, []);
  
  // Get shortcut by ID
  const getShortcut = useCallback((id: string) => {
    return activeShortcuts.find(s => s.id === id);
  }, [activeShortcuts]);
  
  // Check if keybinding matches
  const matchesShortcut = useCallback((e: KeyboardEvent, shortcutId: string): boolean => {
    const shortcut = getShortcut(shortcutId);
    if (!shortcut) return false;
    
    const parts = shortcut.currentKeybinding.split('+');
    const expectedCtrl = parts.includes('Ctrl');
    const expectedShift = parts.includes('Shift');
    const expectedAlt = parts.includes('Alt');
    const expectedMeta = parts.includes('Meta');
    const expectedKey = parts.find(p => !['Ctrl', 'Shift', 'Alt', 'Meta'].includes(p));
    
    if (e.ctrlKey !== expectedCtrl) return false;
    if (e.shiftKey !== expectedShift) return false;
    if (e.altKey !== expectedAlt) return false;
    if (e.metaKey !== expectedMeta) return false;
    
    const pressedKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return pressedKey === expectedKey;
  }, [getShortcut]);
  
  return {
    shortcuts: activeShortcuts,
    saveShortcuts,
    getShortcut,
    matchesShortcut
  };
}
