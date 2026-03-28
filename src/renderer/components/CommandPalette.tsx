import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconSearch,
  IconFolder,
  IconBot,
  IconEye,
  IconGitBranch,
  IconSettings,
  IconCode,
  IconClock,
  IconPlay,
  IconUndo,
  IconSpinner,
  IconFile
} from './Icons';

interface Command {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: 'file' | 'ai' | 'view' | 'git' | 'settings' | 'navigation';
  action: () => void | Promise<void>;
}

interface CommandHistoryEntry {
  id: string;
  commandId: string;
  title: string;
  timestamp: number;
  executed: boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

interface ScoredCommand extends Command {
  score: number;
  matchType: 'exact' | 'starts-with' | 'contains' | 'fuzzy' | 'category';
}

/**
 * Fuzzy search algorithm for command matching
 */
function fuzzyMatch(query: string, text: string): boolean {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match
  if (textLower === queryLower) return true;
  
  // Starts with
  if (textLower.startsWith(queryLower)) return true;
  
  // Contains
  if (textLower.includes(queryLower)) return true;
  
  // Fuzzy match: check if all query characters appear in order
  let textIndex = 0;
  for (let i = 0; i < queryLower.length; i++) {
    const char = queryLower[i];
    const foundIndex = textLower.indexOf(char, textIndex);
    if (foundIndex === -1) return false;
    textIndex = foundIndex + 1;
  }
  
  return true;
}

/**
 * Score command relevance for sorting
 */
function scoreCommand(cmd: Command, query: string): number {
  const queryLower = query.toLowerCase();
  const titleLower = cmd.title.toLowerCase();
  const descLower = cmd.description?.toLowerCase() || '';
  const categoryLower = cmd.category.toLowerCase();
  
  // Exact match on title (highest priority)
  if (titleLower === queryLower) return 100;
  
  // Title starts with query
  if (titleLower.startsWith(queryLower)) return 90;
  
  // Title contains query
  if (titleLower.includes(queryLower)) return 80;
  
  // Description contains query
  if (descLower.includes(queryLower)) return 70;
  
  // Fuzzy match on title
  if (fuzzyMatch(query, cmd.title)) return 60;
  
  // Fuzzy match on description
  if (cmd.description && fuzzyMatch(query, cmd.description)) return 50;
  
  // Category match
  if (categoryLower.includes(queryLower)) return 40;
  
  // No match
  return 0;
}

/**
 * Get match type for highlighting
 */
function getMatchType(cmd: Command, query: string): ScoredCommand['matchType'] {
  const queryLower = query.toLowerCase();
  const titleLower = cmd.title.toLowerCase();
  
  if (titleLower === queryLower) return 'exact';
  if (titleLower.startsWith(queryLower)) return 'starts-with';
  if (titleLower.includes(queryLower)) return 'contains';
  if (fuzzyMatch(query, cmd.title) || (cmd.description && fuzzyMatch(query, cmd.description))) return 'fuzzy';
  return 'category';
}

const MAX_HISTORY = 50;
const HISTORY_STORAGE_KEY = 'agentprime_command_history';

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingCommandId, setExecutingCommandId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load command history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const history = JSON.parse(stored) as CommandHistoryEntry[];
        setCommandHistory(history);
      }
    } catch (err) {
      console.error('Failed to load command history:', err);
    }
  }, []);

  // Save command history to localStorage
  const saveHistory = useCallback((entry: CommandHistoryEntry) => {
    setCommandHistory(prev => {
      const updated = [entry, ...prev.filter(h => h.commandId !== entry.commandId)].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save command history:', err);
      }
      return updated;
    });
  }, []);

  // Filter and score commands based on search
  const getFilteredCommands = useCallback((): ScoredCommand[] => {
    if (!search.trim()) {
      // Show all commands when no search, but prioritize recent history
      return commands.map(cmd => {
        const historyEntry = commandHistory.find(h => h.commandId === cmd.id);
        return {
          ...cmd,
          score: historyEntry ? 10 : 0,
          matchType: 'category' as const
        };
      }).sort((a, b) => b.score - a.score);
    }

    const scored = commands
      .map(cmd => {
        const score = scoreCommand(cmd, search);
        if (score === 0) return null;
        return {
          ...cmd,
          score,
          matchType: getMatchType(cmd, search)
        } as ScoredCommand;
      })
      .filter((cmd): cmd is ScoredCommand => cmd !== null)
      .sort((a, b) => {
        // Sort by score, then by recency in history
        if (b.score !== a.score) return b.score - a.score;
        const aHistory = commandHistory.find(h => h.commandId === a.id);
        const bHistory = commandHistory.find(h => h.commandId === b.id);
        if (aHistory && !bHistory) return -1;
        if (!aHistory && bHistory) return 1;
        if (aHistory && bHistory) return bHistory.timestamp - aHistory.timestamp;
        return 0;
      });

    return scored;
  }, [search, commands, commandHistory]);

  const filteredCommands = getFilteredCommands();

  // Group by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, ScoredCommand[]>);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setSearch('');
      setSelectedIndex(0);
      setShowHistory(false);
    }
  }, [isOpen]);

  // Execute command with history tracking and visual feedback
  const executeCommand = useCallback(async (cmd: Command) => {
    setIsExecuting(true);
    setExecutingCommandId(cmd.id);

    // Record in history
    const historyEntry: CommandHistoryEntry = {
      id: `${Date.now()}-${Math.random()}`,
      commandId: cmd.id,
      title: cmd.title,
      timestamp: Date.now(),
      executed: true
    };
    saveHistory(historyEntry);

    try {
      // Execute the command
      const result = cmd.action();
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      console.error('Command execution error:', error);
    } finally {
      setIsExecuting(false);
      setExecutingCommandId(null);
      onClose();
    }
  }, [saveHistory, onClose]);

  // Replay command from history
  const replayHistoryCommand = useCallback(async (entry: CommandHistoryEntry) => {
    const cmd = commands.find(c => c.id === entry.commandId);
    if (cmd) {
      await executeCommand(cmd);
    }
  }, [commands, executeCommand]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Show history when search is empty and user presses down
    if (e.key === 'ArrowDown' && !search.trim() && filteredCommands.length === 0) {
      e.preventDefault();
      setShowHistory(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (showHistory && selectedIndex < commandHistory.length - 1) {
          setSelectedIndex(prev => prev + 1);
        } else if (!showHistory) {
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (showHistory && selectedIndex > 0) {
          setSelectedIndex(prev => prev - 1);
        } else if (!showHistory && selectedIndex > 0) {
          setSelectedIndex(prev => prev - 1);
        } else if (!showHistory && selectedIndex === 0 && commandHistory.length > 0) {
          setShowHistory(true);
          setSelectedIndex(commandHistory.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (showHistory && commandHistory[selectedIndex]) {
          replayHistoryCommand(commandHistory[selectedIndex]);
        } else if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (showHistory) {
          setShowHistory(false);
          setSelectedIndex(0);
        } else {
          onClose();
        }
        break;
      case 'Backspace':
        if (showHistory && search === '') {
          setShowHistory(false);
          setSelectedIndex(0);
        }
        break;
    }
  }, [filteredCommands, selectedIndex, commandHistory, showHistory, search, executeCommand, replayHistoryCommand, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector('.command-item.selected, .history-item.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showHistory]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
    setShowHistory(false);
  }, [search]);

  // Undo last command operation
  const handleUndo = useCallback(async () => {
    try {
      const result = await window.agentAPI.undoCommand();
      if (result.success) {
        // Show success feedback
        console.log('Undo successful:', result.message);
      } else {
        console.error('Undo failed:', result.error);
      }
    } catch (error) {
      console.error('Undo error:', error);
    }
  }, []);

  if (!isOpen) return null;

  const categoryIcons: Record<string, React.ReactNode> = {
    file: <IconFolder size="sm" />,
    ai: <IconBot size="sm" />,
    view: <IconEye size="sm" />,
    git: <IconGitBranch size="sm" />,
    settings: <IconSettings size="sm" />,
    navigation: <IconCode size="sm" />
  };

  const categoryLabels: Record<string, string> = {
    file: 'Files',
    ai: 'AI',
    view: 'View',
    git: 'Git',
    settings: 'Settings',
    navigation: 'Navigation'
  };

  let flatIndex = 0;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div className="command-palette-header">
          <span className="command-palette-icon"><IconSearch size="md" /></span>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={showHistory ? "Browse command history..." : "Type a command or search..."}
            className="command-palette-input"
            disabled={isExecuting}
          />
          {isExecuting && (
            <div className="command-palette-progress">
              <IconSpinner size="md" />
            </div>
          )}
          <div className="command-palette-hint">
            {showHistory ? (
              <>
                <kbd>↑↓</kbd> navigate <kbd>↵</kbd> replay <kbd>esc</kbd> back
              </>
            ) : (
              <>
                <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
                {commandHistory.length > 0 && <><kbd>↑</kbd> history</>}
              </>
            )}
          </div>
        </div>

        {/* Commands List */}
        <div className="command-palette-list" ref={listRef}>
          {showHistory ? (
            // Show command history
            commandHistory.length === 0 ? (
              <div className="command-palette-empty">
                <IconClock size="lg" />
                <p>No command history</p>
              </div>
            ) : (
              <>
                <div className="command-category">
                  <div className="command-category-header">
                    <IconClock size="sm" />
                    <span>Recent Commands</span>
                  </div>
                  {commandHistory.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={`history-item ${index === selectedIndex ? 'selected' : ''}`}
                      onClick={() => replayHistoryCommand(entry)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="command-icon"><IconClock size="sm" /></span>
                      <div className="command-content">
                        <span className="command-title">{entry.title}</span>
                        <span className="command-description">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="command-replay-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          replayHistoryCommand(entry);
                        }}
                        title="Replay command"
                      >
                        <IconPlay size="xs" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : Object.keys(groupedCommands).length === 0 ? (
            <div className="command-palette-empty">
              <IconSearch size="lg" />
              <p>No commands found</p>
              {commandHistory.length > 0 && (
                <p className="command-palette-empty-hint">Press ↑ to view history</p>
              )}
            </div>
          ) : (
            <>
              {/* Undo/Redo section */}
              {commandHistory.length > 0 && (
                <div className="command-category">
                  <div className="command-category-header">
                    <IconUndo size="sm" />
                    <span>Actions</span>
                  </div>
                  <div
                    className="command-item action-item"
                    onClick={handleUndo}
                  >
                    <span className="command-icon"><IconUndo size="sm" /></span>
                    <div className="command-content">
                      <span className="command-title">Undo Last Operation</span>
                      <span className="command-description">Revert the last file operation</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Command groups */}
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category} className="command-category">
                  <div className="command-category-header">
                    <span>{categoryIcons[category]}</span>
                    <span>{categoryLabels[category]}</span>
                  </div>
                  {cmds.map(cmd => {
                    const currentIndex = flatIndex++;
                    const isExecutingThis = executingCommandId === cmd.id;
                    return (
                      <div
                        key={cmd.id}
                        className={`command-item ${currentIndex === selectedIndex ? 'selected' : ''} ${isExecutingThis ? 'executing' : ''}`}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                      >
                        <span className="command-icon">{cmd.icon}</span>
                        <div className="command-content">
                          <span className="command-title">{cmd.title}</span>
                          {cmd.description && (
                            <span className="command-description">{cmd.description}</span>
                          )}
                        </div>
                        {isExecutingThis && (
                          <div className="command-progress-indicator">
                            <IconSpinner size="sm" />
                          </div>
                        )}
                        {cmd.shortcut && !isExecutingThis && (
                          <kbd className="command-shortcut">{cmd.shortcut}</kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
