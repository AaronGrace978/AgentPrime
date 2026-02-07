/**
 * AgentPrime - Advanced Search & Replace Component
 * 
 * Features:
 * - Regex support
 * - Multi-file search
 * - Replace functionality
 * - File filtering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './SearchReplace.css';

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  matchText: string;
}

interface SearchReplaceProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect?: (filePath: string, line: number) => void;
  workspacePath?: string;
}

const SearchReplace: React.FC<SearchReplaceProps> = ({
  isOpen,
  onClose,
  onFileSelect,
  workspacePath
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(-1);
  const [replaceMode, setReplaceMode] = useState(false);
  const [replacedCount, setReplacedCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Ctrl+F to focus search
      if (e.ctrlKey && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Enter to search (when in search box)
      if (e.key === 'Enter' && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        handleSearch();
        return;
      }

      // Arrow keys to navigate matches
      if (e.key === 'ArrowDown' && matches.length > 0) {
        e.preventDefault();
        setSelectedMatchIndex(prev => 
          prev < matches.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === 'ArrowUp' && matches.length > 0) {
        e.preventDefault();
        setSelectedMatchIndex(prev => 
          prev > 0 ? prev - 1 : matches.length - 1
        );
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matches.length, onClose]);

  // Navigate to selected match
  useEffect(() => {
    if (selectedMatchIndex >= 0 && selectedMatchIndex < matches.length && onFileSelect) {
      const match = matches[selectedMatchIndex];
      onFileSelect(match.file, match.line);
    }
  }, [selectedMatchIndex, matches, onFileSelect]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !workspacePath) return;

    setIsSearching(true);
    setMatches([]);
    setSelectedMatchIndex(-1);

    try {
      // Build search pattern
      let pattern = searchQuery;
      if (!useRegex) {
        // Escape special regex characters
        pattern = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }

      // Use ripgrep via agent:search-codebase
      const includePattern = fileFilter ? `**/*${fileFilter}*` : undefined;
      const excludePattern = '**/node_modules/**';
      
      const result = await window.agentAPI.agentSearchCodebase(
        pattern,
        {
          includePattern,
          excludePattern,
          maxResults: 1000
        }
      );

      if (result.success && result.matches) {
        // Process matches
        const processedMatches: SearchMatch[] = result.matches.map((match: any) => {
          // Extract match text from content
          const regex = new RegExp(
            pattern,
            caseSensitive ? 'g' : 'gi'
          );
          const matchResult = regex.exec(match.content);
          const matchText = matchResult ? matchResult[0] : '';

          return {
            file: match.file,
            line: match.line,
            column: match.column || 0,
            content: match.content,
            matchText
          };
        });

        setMatches(processedMatches);
        if (processedMatches.length > 0) {
          setSelectedMatchIndex(0);
        }
      }
    } catch (error: any) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, useRegex, caseSensitive, wholeWord, fileFilter, workspacePath]);

  const handleReplace = useCallback(async () => {
    if (!searchQuery.trim() || !replaceQuery || matches.length === 0 || !workspacePath) {
      return;
    }

    try {
      // Group matches by file
      const matchesByFile = new Map<string, SearchMatch[]>();
      matches.forEach(match => {
        if (!matchesByFile.has(match.file)) {
          matchesByFile.set(match.file, []);
        }
        matchesByFile.get(match.file)!.push(match);
      });

      let totalReplaced = 0;

      // Replace in each file
      for (const [filePath, fileMatches] of matchesByFile.entries()) {
        try {
          // Read file
          const readResult = await window.agentAPI.readFile(filePath);
          if (readResult.error || !readResult.content) continue;

          let content = readResult.content;
          const lines = content.split('\n');

          // Build regex for replacement
          let pattern = searchQuery;
          if (!useRegex) {
            pattern = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }
          if (wholeWord) {
            pattern = `\\b${pattern}\\b`;
          }

          const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

          // Replace in each affected line
          const processedLines = lines.map((line, lineIndex) => {
            const lineNumber = lineIndex + 1;
            const hasMatch = fileMatches.some(m => m.line === lineNumber);
            
            if (hasMatch) {
              const newLine = line.replace(regex, replaceQuery);
              if (newLine !== line) {
                totalReplaced += (line.match(regex) || []).length;
              }
              return newLine;
            }
            return line;
          });

          // Write file if changed
          const newContent = processedLines.join('\n');
          if (newContent !== content) {
            await window.agentAPI.writeFile(filePath, newContent);
          }
        } catch (error: any) {
          console.error(`Error replacing in ${filePath}:`, error);
        }
      }

      setReplacedCount(totalReplaced);
      
      // Refresh search to show updated results
      setTimeout(() => {
        handleSearch();
      }, 500);
    } catch (error: any) {
      console.error('Replace error:', error);
    }
  }, [searchQuery, replaceQuery, matches, useRegex, caseSensitive, wholeWord, workspacePath, handleSearch]);

  const handleReplaceAll = useCallback(async () => {
    if (!window.confirm(`Replace all ${matches.length} matches?`)) {
      return;
    }
    await handleReplace();
  }, [matches.length, handleReplace]);

  if (!isOpen) return null;

  return (
    <div className="search-replace-panel">
      <div className="search-replace-header">
        <h3>🔍 Search & Replace</h3>
        <button className="close-btn" onClick={onClose} title="Close (Esc)">
          ×
        </button>
      </div>

      <div className="search-replace-content">
        {/* Search Input */}
        <div className="search-input-group">
          <div className="input-row">
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
            <button
              className="search-btn"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
            >
              {isSearching ? '⏳' : '🔍'} Search
            </button>
          </div>

          {/* Replace Input */}
          {replaceMode && (
            <div className="input-row">
              <input
                type="text"
                className="search-input"
                placeholder="Replace with..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleReplace();
                  }
                }}
              />
              <button
                className="replace-btn"
                onClick={handleReplace}
                disabled={!searchQuery.trim() || matches.length === 0}
              >
                Replace
              </button>
              <button
                className="replace-all-btn"
                onClick={handleReplaceAll}
                disabled={!searchQuery.trim() || matches.length === 0}
              >
                Replace All
              </button>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="search-options">
          <label>
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
            />
            Regex
          </label>
          <label>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match Case
          </label>
          <label>
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            Whole Word
          </label>
          <label>
            <input
              type="checkbox"
              checked={replaceMode}
              onChange={(e) => setReplaceMode(e.target.checked)}
            />
            Replace Mode
          </label>
        </div>

        {/* File Filter */}
        <div className="file-filter">
          <input
            type="text"
            className="filter-input"
            placeholder="File filter (e.g., *.ts, *.js)"
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="search-results">
          <div className="results-header">
            <span>
              {matches.length > 0
                ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`
                : searchQuery
                ? 'No matches found'
                : 'Enter search query'}
            </span>
            {replacedCount > 0 && (
              <span className="replaced-count">
                {replacedCount} replaced
              </span>
            )}
          </div>

          <div className="matches-list">
            {matches.map((match, index) => (
              <div
                key={`${match.file}-${match.line}-${index}`}
                className={`match-item ${index === selectedMatchIndex ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedMatchIndex(index);
                  if (onFileSelect) {
                    onFileSelect(match.file, match.line);
                  }
                }}
              >
                <div className="match-file">{match.file}</div>
                <div className="match-line">
                  <span className="line-number">{match.line}:{match.column}</span>
                  <span className="line-content">{match.content}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchReplace;

