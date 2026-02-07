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
  | 'debug'
  | 'git'
  | 'ai'
  | 'collaboration'
  | 'plugins'
  | 'system'
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

// Default shortcuts
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // General
  { id: 'command-palette', name: 'Command Palette', description: 'Open command palette', category: 'general', defaultKeybinding: 'Ctrl+Shift+P', currentKeybinding: 'Ctrl+Shift+P' },
  { id: 'quick-open', name: 'Quick Open', description: 'Quickly open files', category: 'general', defaultKeybinding: 'Ctrl+P', currentKeybinding: 'Ctrl+P' },
  { id: 'save', name: 'Save', description: 'Save current file', category: 'general', defaultKeybinding: 'Ctrl+S', currentKeybinding: 'Ctrl+S' },
  { id: 'save-all', name: 'Save All', description: 'Save all open files', category: 'general', defaultKeybinding: 'Ctrl+Shift+S', currentKeybinding: 'Ctrl+Shift+S' },
  { id: 'settings', name: 'Settings', description: 'Open settings', category: 'general', defaultKeybinding: 'Ctrl+,', currentKeybinding: 'Ctrl+,' },
  { id: 'close-tab', name: 'Close Tab', description: 'Close current tab', category: 'general', defaultKeybinding: 'Ctrl+W', currentKeybinding: 'Ctrl+W' },
  { id: 'new-file', name: 'New File', description: 'Create new file', category: 'general', defaultKeybinding: 'Ctrl+N', currentKeybinding: 'Ctrl+N' },
  
  // Editor
  { id: 'undo', name: 'Undo', description: 'Undo last action', category: 'editor', defaultKeybinding: 'Ctrl+Z', currentKeybinding: 'Ctrl+Z' },
  { id: 'redo', name: 'Redo', description: 'Redo last action', category: 'editor', defaultKeybinding: 'Ctrl+Y', currentKeybinding: 'Ctrl+Y' },
  { id: 'find', name: 'Find', description: 'Find in file', category: 'editor', defaultKeybinding: 'Ctrl+F', currentKeybinding: 'Ctrl+F' },
  { id: 'replace', name: 'Replace', description: 'Find and replace', category: 'editor', defaultKeybinding: 'Ctrl+H', currentKeybinding: 'Ctrl+H' },
  { id: 'find-in-files', name: 'Find in Files', description: 'Search across files', category: 'editor', defaultKeybinding: 'Ctrl+Shift+F', currentKeybinding: 'Ctrl+Shift+F' },
  { id: 'comment-line', name: 'Toggle Comment', description: 'Comment/uncomment line', category: 'editor', defaultKeybinding: 'Ctrl+/', currentKeybinding: 'Ctrl+/' },
  { id: 'format-document', name: 'Format Document', description: 'Format entire document', category: 'editor', defaultKeybinding: 'Shift+Alt+F', currentKeybinding: 'Shift+Alt+F' },
  { id: 'duplicate-line', name: 'Duplicate Line', description: 'Duplicate current line', category: 'editor', defaultKeybinding: 'Shift+Alt+Down', currentKeybinding: 'Shift+Alt+Down' },
  { id: 'move-line-up', name: 'Move Line Up', description: 'Move line up', category: 'editor', defaultKeybinding: 'Alt+Up', currentKeybinding: 'Alt+Up' },
  { id: 'move-line-down', name: 'Move Line Down', description: 'Move line down', category: 'editor', defaultKeybinding: 'Alt+Down', currentKeybinding: 'Alt+Down' },
  { id: 'select-all', name: 'Select All', description: 'Select all content', category: 'editor', defaultKeybinding: 'Ctrl+A', currentKeybinding: 'Ctrl+A' },
  { id: 'cut', name: 'Cut', description: 'Cut selection', category: 'editor', defaultKeybinding: 'Ctrl+X', currentKeybinding: 'Ctrl+X' },
  { id: 'copy', name: 'Copy', description: 'Copy selection', category: 'editor', defaultKeybinding: 'Ctrl+C', currentKeybinding: 'Ctrl+C' },
  { id: 'paste', name: 'Paste', description: 'Paste from clipboard', category: 'editor', defaultKeybinding: 'Ctrl+V', currentKeybinding: 'Ctrl+V' },
  
  // Navigation
  { id: 'go-to-definition', name: 'Go to Definition', description: 'Jump to symbol definition', category: 'navigation', defaultKeybinding: 'Ctrl+G', currentKeybinding: 'Ctrl+G' },
  { id: 'find-references', name: 'Find References', description: 'Find all references', category: 'navigation', defaultKeybinding: 'Shift+F12', currentKeybinding: 'Shift+F12' },
  { id: 'peek-definition', name: 'Peek Definition', description: 'Preview definition inline', category: 'navigation', defaultKeybinding: 'Alt+F12', currentKeybinding: 'Alt+F12' },
  { id: 'go-to-symbol', name: 'Go to Symbol', description: 'Navigate to symbol in file', category: 'navigation', defaultKeybinding: 'Ctrl+Shift+O', currentKeybinding: 'Ctrl+Shift+O' },
  { id: 'go-to-line', name: 'Go to Line', description: 'Jump to specific line', category: 'navigation', defaultKeybinding: 'Ctrl+G', currentKeybinding: 'Ctrl+G' },
  { id: 'next-tab', name: 'Next Tab', description: 'Switch to next tab', category: 'navigation', defaultKeybinding: 'Ctrl+Tab', currentKeybinding: 'Ctrl+Tab' },
  { id: 'prev-tab', name: 'Previous Tab', description: 'Switch to previous tab', category: 'navigation', defaultKeybinding: 'Ctrl+Shift+Tab', currentKeybinding: 'Ctrl+Shift+Tab' },
  { id: 'go-back', name: 'Go Back', description: 'Navigate back', category: 'navigation', defaultKeybinding: 'Alt+Left', currentKeybinding: 'Alt+Left' },
  { id: 'go-forward', name: 'Go Forward', description: 'Navigate forward', category: 'navigation', defaultKeybinding: 'Alt+Right', currentKeybinding: 'Alt+Right' },
  
  // Debug
  { id: 'start-debug', name: 'Start Debugging', description: 'Start debug session', category: 'debug', defaultKeybinding: 'F5', currentKeybinding: 'F5' },
  { id: 'stop-debug', name: 'Stop Debugging', description: 'Stop debug session', category: 'debug', defaultKeybinding: 'Shift+F5', currentKeybinding: 'Shift+F5' },
  { id: 'step-over', name: 'Step Over', description: 'Step over current line', category: 'debug', defaultKeybinding: 'F10', currentKeybinding: 'F10' },
  { id: 'step-into', name: 'Step Into', description: 'Step into function', category: 'debug', defaultKeybinding: 'F11', currentKeybinding: 'F11' },
  { id: 'step-out', name: 'Step Out', description: 'Step out of function', category: 'debug', defaultKeybinding: 'Shift+F11', currentKeybinding: 'Shift+F11' },
  { id: 'toggle-breakpoint', name: 'Toggle Breakpoint', description: 'Add/remove breakpoint', category: 'debug', defaultKeybinding: 'F9', currentKeybinding: 'F9' },
  
  // Git
  { id: 'git-commit', name: 'Git Commit', description: 'Open commit dialog', category: 'git', defaultKeybinding: 'Ctrl+Shift+G', currentKeybinding: 'Ctrl+Shift+G' },
  { id: 'git-push', name: 'Git Push', description: 'Push changes', category: 'git', defaultKeybinding: 'Ctrl+Shift+U', currentKeybinding: 'Ctrl+Shift+U' },
  { id: 'git-pull', name: 'Git Pull', description: 'Pull changes', category: 'git', defaultKeybinding: 'Ctrl+Alt+P', currentKeybinding: 'Ctrl+Alt+P' },
  
  // AI
  { id: 'ai-chat', name: 'AI Chat', description: 'Open AI chat', category: 'ai', defaultKeybinding: 'Ctrl+Shift+L', currentKeybinding: 'Ctrl+Shift+L' },
  { id: 'ai-explain', name: 'AI Explain', description: 'Explain selected code', category: 'ai', defaultKeybinding: 'Ctrl+Shift+E', currentKeybinding: 'Ctrl+Shift+E' },
  { id: 'ai-fix', name: 'AI Fix', description: 'Fix selected code', category: 'ai', defaultKeybinding: 'Ctrl+Shift+X', currentKeybinding: 'Ctrl+Shift+X' },
  { id: 'toggle-completions', name: 'Toggle Completions', description: 'Toggle inline completions', category: 'ai', defaultKeybinding: 'Ctrl+Shift+I', currentKeybinding: 'Ctrl+Shift+I' },
  
  // View
  { id: 'toggle-sidebar', name: 'Toggle Sidebar', description: 'Show/hide sidebar', category: 'view', defaultKeybinding: 'Ctrl+B', currentKeybinding: 'Ctrl+B' },
  { id: 'toggle-terminal', name: 'Toggle Terminal', description: 'Show/hide terminal', category: 'view', defaultKeybinding: 'Ctrl+`', currentKeybinding: 'Ctrl+`' },
  { id: 'toggle-dino-buddy', name: 'Toggle Dino Buddy', description: '🦖 Show/hide AI companion mascot', category: 'view', defaultKeybinding: 'Ctrl+Shift+D', currentKeybinding: 'Ctrl+Shift+D' },
  { id: 'lock-screen', name: 'Lock Screen', description: '🔒 Matrix-themed lock screen', category: 'view', defaultKeybinding: 'Ctrl+Shift+L', currentKeybinding: 'Ctrl+Shift+L' },
  { id: 'agent-mode', name: 'Agent Mode', description: '🤖 Matrix computer control', category: 'ai', defaultKeybinding: 'Ctrl+Shift+A', currentKeybinding: 'Ctrl+Shift+A' },

  // Phase 2 - Collaboration
  { id: 'collaboration-session', name: 'New Collaboration Session', description: 'Start a new collaborative editing session', category: 'collaboration', defaultKeybinding: 'Ctrl+Shift+C', currentKeybinding: 'Ctrl+Shift+C' },
  { id: 'collaboration-join', name: 'Join Collaboration Session', description: 'Join an existing collaboration session', category: 'collaboration', defaultKeybinding: 'Ctrl+Shift+J', currentKeybinding: 'Ctrl+Shift+J' },
  { id: 'collaboration-sync', name: 'Sync Changes', description: 'Apply pending collaborative changes', category: 'collaboration', defaultKeybinding: 'Ctrl+Shift+Y', currentKeybinding: 'Ctrl+Shift+Y' },

  // Phase 2 - Plugins
  { id: 'plugins-marketplace', name: 'Plugin Marketplace', description: 'Open plugin marketplace', category: 'plugins', defaultKeybinding: 'Ctrl+Shift+M', currentKeybinding: 'Ctrl+Shift+M' },
  { id: 'plugins-reload', name: 'Reload Plugins', description: 'Reload all active plugins', category: 'plugins', defaultKeybinding: 'Ctrl+Shift+R', currentKeybinding: 'Ctrl+Shift+R' },

  // Phase 2 - System
  { id: 'system-monitor', name: 'System Monitor', description: 'Open system performance monitor', category: 'system', defaultKeybinding: 'Ctrl+Shift+U', currentKeybinding: 'Ctrl+Shift+U' },
  { id: 'edge-deploy', name: 'Deploy Edge Model', description: 'Deploy AI model locally', category: 'system', defaultKeybinding: 'Ctrl+Alt+E', currentKeybinding: 'Ctrl+Alt+E' },
  { id: 'cloud-sync', name: 'Force Cloud Sync', description: 'Trigger immediate cloud synchronization', category: 'system', defaultKeybinding: 'Ctrl+Shift+S', currentKeybinding: 'Ctrl+Shift+S' },
  { id: 'toggle-panel', name: 'Toggle Panel', description: 'Show/hide bottom panel', category: 'view', defaultKeybinding: 'Ctrl+J', currentKeybinding: 'Ctrl+J' },
  { id: 'zoom-in', name: 'Zoom In', description: 'Increase font size', category: 'view', defaultKeybinding: 'Ctrl+=', currentKeybinding: 'Ctrl+=' },
  { id: 'zoom-out', name: 'Zoom Out', description: 'Decrease font size', category: 'view', defaultKeybinding: 'Ctrl+-', currentKeybinding: 'Ctrl+-' },
  { id: 'reset-zoom', name: 'Reset Zoom', description: 'Reset font size', category: 'view', defaultKeybinding: 'Ctrl+0', currentKeybinding: 'Ctrl+0' },
  { id: 'toggle-fullscreen', name: 'Toggle Fullscreen', description: 'Enter/exit fullscreen', category: 'view', defaultKeybinding: 'F11', currentKeybinding: 'F11' },
];

// Category labels
const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  editor: 'Editor',
  navigation: 'Navigation',
  debug: 'Debug',
  git: 'Git',
  ai: 'AI Assistant',
  collaboration: 'Collaboration',
  plugins: 'Plugins',
  system: 'System',
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
    <div className={`keyboard-shortcuts ${embedded ? 'embedded' : ''}`} onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="shortcuts-header">
        <h3><IconKeyboard size="md" /> Keyboard Shortcuts</h3>
        <div className="shortcuts-actions">
          {hasChanges && (
            <button className="btn btn-primary btn-sm" onClick={saveChanges}>
              <IconSave size="sm" /> Save Changes
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={resetAll} title="Reset all to defaults">
            <IconRefresh size="sm" /> Reset All
          </button>
          {onClose && (
            <button className="btn btn-ghost btn-sm close-btn" onClick={onClose} title="Close (Escape)">
              <IconX size="sm" /> Close
            </button>
          )}
        </div>
      </div>

      {/* Search and filter */}
      <div className="shortcuts-toolbar">
        <div className="search-box">
          <IconSearch size="sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="search-input"
          />
        </div>
        
        <div className="category-filter">
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as ShortcutCategory | 'all')}
            className="category-select"
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Shortcuts list */}
      <div className="shortcuts-list">
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
          <div key={category} className="shortcut-group">
            <h4 className="group-title">{CATEGORY_LABELS[category as ShortcutCategory]}</h4>
            
            {categoryShortcuts.map(shortcut => {
              const isEditing = editingId === shortcut.id;
              const isModified = shortcut.currentKeybinding !== shortcut.defaultKeybinding;
              const conflicts = getConflicts(shortcut.currentKeybinding, shortcut.id);
              
              return (
                <div 
                  key={shortcut.id} 
                  className={`shortcut-item ${isEditing ? 'editing' : ''} ${isModified ? 'modified' : ''} ${conflicts.length > 0 ? 'has-conflict' : ''}`}
                >
                  <div className="shortcut-info">
                    <span className="shortcut-name">{shortcut.name}</span>
                    <span className="shortcut-description">{shortcut.description}</span>
                  </div>
                  
                  <div className="shortcut-keybinding">
                    {isEditing ? (
                      <div className="keybinding-editor">
                        <input
                          ref={inputRef}
                          type="text"
                          value={recordingKeys.join('+')}
                          onKeyDown={handleKeyDown}
                          placeholder="Press keys..."
                          readOnly
                          className="keybinding-input"
                        />
                        <button className="btn-icon" onClick={saveKeybinding} title="Save">
                          <IconCheck size="xs" />
                        </button>
                        <button className="btn-icon" onClick={cancelEditing} title="Cancel">
                          <IconX size="xs" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <kbd className="keybinding-display">
                          {shortcut.currentKeybinding.split('+').map((key, i) => (
                            <span key={i} className="key">{key}</span>
                          ))}
                        </kbd>
                        
                        <div className="shortcut-actions">
                          <button 
                            className="btn-icon" 
                            onClick={() => setEditingId(shortcut.id)}
                            title="Edit keybinding"
                          >
                            <IconEdit size="xs" />
                          </button>
                          {isModified && (
                            <button 
                              className="btn-icon" 
                              onClick={() => resetShortcut(shortcut.id)}
                              title="Reset to default"
                            >
                              <IconRefresh size="xs" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {conflicts.length > 0 && !isEditing && (
                    <div className="conflict-warning">
                      ⚠️ Conflicts with: {conflicts.map(c => c.name).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        
        {filteredShortcuts.length === 0 && (
          <div className="no-results">
            <IconSearch size="lg" />
            <p>No shortcuts match your search</p>
          </div>
        )}
      </div>

      <style>{`
        .keyboard-shortcuts-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .keyboard-shortcuts {
          width: 90%;
          max-width: 800px;
          height: 80%;
          max-height: 600px;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          border-radius: var(--border-radius-lg);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }
        
        .shortcuts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
        }
        
        .shortcuts-header h3 {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin: 0;
          font-size: 1rem;
        }
        
        .shortcuts-actions {
          display: flex;
          gap: var(--spacing-xs);
        }
        
        .shortcuts-toolbar {
          display: flex;
          gap: var(--spacing-md);
          padding: var(--spacing-sm) var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
        }
        
        .search-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
        }
        
        .search-input {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-primary);
          font-size: 0.85rem;
          outline: none;
        }
        
        .category-select {
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
          color: var(--text-primary);
          font-size: 0.85rem;
        }
        
        .shortcuts-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--spacing-md);
        }
        
        .shortcut-group {
          margin-bottom: var(--spacing-lg);
        }
        
        .group-title {
          margin: 0 0 var(--spacing-sm) 0;
          padding-bottom: var(--spacing-xs);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        
        .shortcut-item {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-sm);
          border-radius: var(--border-radius);
          transition: background 0.1s;
        }
        
        .shortcut-item:hover {
          background: var(--bg-hover);
        }
        
        .shortcut-item.editing {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid var(--accent-primary);
        }
        
        .shortcut-item.modified .keybinding-display {
          border-color: var(--warning);
        }
        
        .shortcut-item.has-conflict .keybinding-display {
          border-color: var(--error);
        }
        
        .shortcut-info {
          flex: 1;
          min-width: 200px;
        }
        
        .shortcut-name {
          display: block;
          font-weight: 500;
          color: var(--text-primary);
          font-size: 0.85rem;
        }
        
        .shortcut-description {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .shortcut-keybinding {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }
        
        .keybinding-display {
          display: flex;
          gap: 4px;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius-sm);
        }
        
        .key {
          display: inline-block;
          padding: 2px 6px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: var(--text-primary);
          box-shadow: 0 1px 0 var(--border-color);
        }
        
        .shortcut-actions {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.1s;
        }
        
        .shortcut-item:hover .shortcut-actions {
          opacity: 1;
        }
        
        .btn-icon {
          padding: 4px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: var(--border-radius-sm);
          transition: all 0.1s;
        }
        
        .btn-icon:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        
        .keybinding-editor {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
        }
        
        .keybinding-input {
          width: 150px;
          padding: var(--spacing-xs) var(--spacing-sm);
          background: var(--bg-primary);
          border: 2px solid var(--accent-primary);
          border-radius: var(--border-radius-sm);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          text-align: center;
        }
        
        .conflict-warning {
          width: 100%;
          margin-top: var(--spacing-xs);
          padding: var(--spacing-xs) var(--spacing-sm);
          background: rgba(239, 68, 68, 0.1);
          border-radius: var(--border-radius-sm);
          font-size: 0.7rem;
          color: var(--error);
        }
        
        .no-results {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-md);
          padding: var(--spacing-xl);
          color: var(--text-muted);
        }
        .keyboard-shortcuts.embedded {
          width: 100%;
          max-width: none;
          height: 100%;
          max-height: none;
          border-radius: 0;
          box-shadow: none;
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
    <div className="keyboard-shortcuts-overlay" onClick={onClose}>
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
