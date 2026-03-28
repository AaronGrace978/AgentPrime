/**
 * MentionAutocomplete — @-Mentions system for chat input
 * 
 * Triggered by typing "@" in the chat input.
 * Provides quick access to files, symbols, and special contexts.
 * This is what makes Cursor's chat so powerful — now it's ours.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface MentionItem {
  id: string;
  type: 'file' | 'folder' | 'symbol' | 'special';
  label: string;
  detail?: string;
  icon?: string;
  value: string;
}

const SPECIAL_MENTIONS: MentionItem[] = [
  { id: 'codebase', type: 'special', label: 'codebase', detail: 'Search the entire codebase', icon: '🔍', value: '@codebase' },
  { id: 'file', type: 'special', label: 'file', detail: 'Reference a specific file', icon: '📄', value: '@file' },
  { id: 'terminal', type: 'special', label: 'terminal', detail: 'Include terminal output', icon: '>_', value: '@terminal' },
  { id: 'git', type: 'special', label: 'git', detail: 'Include git diff/status', icon: '🌿', value: '@git' },
  { id: 'errors', type: 'special', label: 'errors', detail: 'Include current linter/build errors', icon: '⚠', value: '@errors' },
  { id: 'selection', type: 'special', label: 'selection', detail: 'Include editor selection', icon: '✂', value: '@selection' },
  { id: 'workspace', type: 'special', label: 'workspace', detail: 'Workspace info & file tree', icon: '📁', value: '@workspace' },
];

interface MentionAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  visible: boolean;
}

const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  query,
  position,
  onSelect,
  onClose,
  visible,
}) => {
  const [items, setItems] = useState<MentionItem[]>(SPECIAL_MENTIONS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.detail?.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible || !query) return;

    const loadFiles = async () => {
      try {
        const tree = await (window as any).agentAPI.readTree();
        if (tree?.children) {
          const fileItems: MentionItem[] = flattenTree(tree.children, '').slice(0, 50);
          setItems([...SPECIAL_MENTIONS, ...fileItems]);
        }
      } catch {
        // Keep special mentions only
      }
    };

    const debounce = setTimeout(loadFiles, 150);
    return () => clearTimeout(debounce);
  }, [visible, query]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          onSelect(filteredItems[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [visible, filteredItems, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible || filteredItems.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: position.top,
      left: position.left,
      zIndex: 10000,
      background: 'var(--prime-surface)',
      border: '1px solid var(--prime-border)',
      borderRadius: '8px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      maxHeight: '280px',
      width: '320px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--prime-text-muted)',
        borderBottom: '1px solid var(--prime-border)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        Mentions {query && `— "${query}"`}
      </div>
      <div ref={listRef} style={{ overflow: 'auto', padding: '4px' }}>
        {filteredItems.map((item, i) => (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '7px 10px',
              cursor: 'pointer',
              borderRadius: '6px',
              background: i === selectedIndex ? 'var(--prime-accent-glow)' : 'transparent',
              transition: 'background 0.08s',
            }}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            <span style={{
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              background: 'var(--prime-surface-hover)',
              fontSize: item.type === 'special' ? '11px' : '12px',
              flexShrink: 0,
            }}>
              {item.icon || (item.type === 'file' ? '📄' : item.type === 'folder' ? '📁' : '🔷')}
            </span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: i === selectedIndex ? 'var(--prime-accent)' : 'var(--prime-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                @{item.label}
              </div>
              {item.detail && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--prime-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.detail}
                </div>
              )}
            </div>
            <span style={{
              fontSize: '10px',
              color: 'var(--prime-text-muted)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              {item.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

function flattenTree(children: any[], prefix: string): MentionItem[] {
  const results: MentionItem[] = [];
  for (const child of children) {
    const fullPath = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.type === 'file') {
      results.push({
        id: `file_${fullPath}`,
        type: 'file',
        label: child.name,
        detail: fullPath,
        value: `@${fullPath}`,
      });
    } else if (child.type === 'directory' && child.children) {
      results.push({
        id: `folder_${fullPath}`,
        type: 'folder',
        label: child.name + '/',
        detail: fullPath,
        icon: '📁',
        value: `@${fullPath}/`,
      });
      results.push(...flattenTree(child.children, fullPath));
    }
  }
  return results;
}

export default MentionAutocomplete;
