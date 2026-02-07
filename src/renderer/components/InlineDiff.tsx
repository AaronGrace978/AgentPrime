/**
 * InlineDiff - Cursor-style inline diff view for AI changes
 * 
 * Features:
 * - Shows AI-suggested changes inline in the editor
 * - Accept/Reject individual changes
 * - Accept/Reject all changes
 * - Highlights additions and deletions
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronUp
} from './Icons';

export interface DiffHunk {
  id: string;
  startLine: number;
  endLine: number;
  oldContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
  description?: string;
}

interface InlineDiffProps {
  hunks: DiffHunk[];
  onAccept: (hunkId: string) => void;
  onReject: (hunkId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  fileName?: string;
}

const InlineDiff: React.FC<InlineDiffProps> = ({
  hunks,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  fileName
}) => {
  const [expandedHunks, setExpandedHunks] = useState<Set<string>>(new Set(hunks.map(h => h.id)));

  const toggleHunk = useCallback((id: string) => {
    setExpandedHunks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const pendingCount = useMemo(() => hunks.filter(h => h.status === 'pending').length, [hunks]);
  const acceptedCount = useMemo(() => hunks.filter(h => h.status === 'accepted').length, [hunks]);
  const rejectedCount = useMemo(() => hunks.filter(h => h.status === 'rejected').length, [hunks]);

  // Parse diff lines for display
  const parseDiffLines = (oldContent: string, newContent: string): Array<{
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    oldLine?: string;
    newLine?: string;
    lineNumber: { old?: number; new?: number };
  }> => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const result: Array<{
      type: 'unchanged' | 'added' | 'removed' | 'modified';
      oldLine?: string;
      newLine?: string;
      lineNumber: { old?: number; new?: number };
    }> = [];

    // Simple line-by-line diff
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : undefined;
      const newLine = newIdx < newLines.length ? newLines[newIdx] : undefined;

      if (oldLine === newLine) {
        result.push({
          type: 'unchanged',
          oldLine,
          newLine,
          lineNumber: { old: oldIdx + 1, new: newIdx + 1 }
        });
        oldIdx++;
        newIdx++;
      } else if (oldLine === undefined) {
        result.push({
          type: 'added',
          newLine,
          lineNumber: { new: newIdx + 1 }
        });
        newIdx++;
      } else if (newLine === undefined) {
        result.push({
          type: 'removed',
          oldLine,
          lineNumber: { old: oldIdx + 1 }
        });
        oldIdx++;
      } else {
        // Lines are different - show as removed then added
        result.push({
          type: 'removed',
          oldLine,
          lineNumber: { old: oldIdx + 1 }
        });
        result.push({
          type: 'added',
          newLine,
          lineNumber: { new: newIdx + 1 }
        });
        oldIdx++;
        newIdx++;
      }
    }

    return result;
  };

  if (hunks.length === 0) {
    return (
      <div className="inline-diff-empty">
        <p>No changes to review</p>
      </div>
    );
  }

  return (
    <div className="inline-diff">
      {/* Header */}
      <div className="inline-diff-header">
        <div className="inline-diff-title">
          <span className="inline-diff-icon">✨</span>
          <span>AI Suggested Changes</span>
          {fileName && <span className="inline-diff-file">{fileName}</span>}
        </div>
        <div className="inline-diff-stats">
          <span className="stat pending">{pendingCount} pending</span>
          <span className="stat accepted">{acceptedCount} accepted</span>
          <span className="stat rejected">{rejectedCount} rejected</span>
        </div>
        <div className="inline-diff-actions">
          <button 
            className="btn btn-success btn-sm"
            onClick={onAcceptAll}
            disabled={pendingCount === 0}
          >
            <IconCheck size="xs" /> Accept All
          </button>
          <button 
            className="btn btn-danger btn-sm"
            onClick={onRejectAll}
            disabled={pendingCount === 0}
          >
            <IconX size="xs" /> Reject All
          </button>
        </div>
      </div>

      {/* Hunks */}
      <div className="inline-diff-hunks">
        {hunks.map((hunk) => {
          const isExpanded = expandedHunks.has(hunk.id);
          const diffLines = parseDiffLines(hunk.oldContent, hunk.newContent);
          const addedLines = diffLines.filter(l => l.type === 'added').length;
          const removedLines = diffLines.filter(l => l.type === 'removed').length;

          return (
            <div 
              key={hunk.id} 
              className={`inline-diff-hunk ${hunk.status}`}
            >
              {/* Hunk header */}
              <div 
                className="hunk-header"
                onClick={() => toggleHunk(hunk.id)}
              >
                <span className="hunk-toggle">
                  {isExpanded ? <IconChevronDown size="xs" /> : <IconChevronUp size="xs" />}
                </span>
                <span className="hunk-location">
                  Lines {hunk.startLine}-{hunk.endLine}
                </span>
                <span className="hunk-summary">
                  <span className="additions">+{addedLines}</span>
                  <span className="deletions">-{removedLines}</span>
                </span>
                {hunk.description && (
                  <span className="hunk-description">{hunk.description}</span>
                )}
                
                {hunk.status === 'pending' && (
                  <div className="hunk-actions" onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="btn-icon accept"
                      onClick={() => onAccept(hunk.id)}
                      title="Accept this change (Ctrl+Enter)"
                    >
                      <IconCheck size="sm" />
                    </button>
                    <button 
                      className="btn-icon reject"
                      onClick={() => onReject(hunk.id)}
                      title="Reject this change (Escape)"
                    >
                      <IconX size="sm" />
                    </button>
                  </div>
                )}
                
                {hunk.status !== 'pending' && (
                  <span className={`hunk-status-badge ${hunk.status}`}>
                    {hunk.status === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
                  </span>
                )}
              </div>

              {/* Hunk content */}
              {isExpanded && (
                <div className="hunk-content">
                  <pre className="diff-code">
                    {diffLines.map((line, i) => (
                      <div 
                        key={i} 
                        className={`diff-line ${line.type}`}
                      >
                        <span className="line-number old">
                          {line.lineNumber.old || ''}
                        </span>
                        <span className="line-number new">
                          {line.lineNumber.new || ''}
                        </span>
                        <span className="line-prefix">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        <span className="line-content">
                          {line.oldLine || line.newLine || ''}
                        </span>
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .inline-diff {
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
          overflow: hidden;
        }
        
        .inline-diff-empty {
          padding: var(--spacing-lg);
          text-align: center;
          color: var(--text-muted);
        }
        
        .inline-diff-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-sm) var(--spacing-md);
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
        }
        
        .inline-diff-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-weight: 600;
          font-size: 0.9rem;
        }
        
        .inline-diff-icon {
          font-size: 1.1rem;
        }
        
        .inline-diff-file {
          font-weight: normal;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 0.8rem;
        }
        
        .inline-diff-stats {
          display: flex;
          gap: var(--spacing-sm);
          margin-left: auto;
        }
        
        .stat {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.7rem;
          font-weight: 500;
        }
        
        .stat.pending { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .stat.accepted { background: rgba(16, 185, 129, 0.2); color: var(--success); }
        .stat.rejected { background: rgba(239, 68, 68, 0.2); color: var(--error); }
        
        .inline-diff-actions {
          display: flex;
          gap: var(--spacing-xs);
        }
        
        .inline-diff-hunks {
          max-height: 400px;
          overflow-y: auto;
        }
        
        .inline-diff-hunk {
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .inline-diff-hunk:last-child {
          border-bottom: none;
        }
        
        .inline-diff-hunk.accepted {
          opacity: 0.7;
          background: rgba(16, 185, 129, 0.05);
        }
        
        .inline-diff-hunk.rejected {
          opacity: 0.5;
          background: rgba(239, 68, 68, 0.05);
        }
        
        .hunk-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-xs) var(--spacing-md);
          cursor: pointer;
          transition: background 0.1s;
        }
        
        .hunk-header:hover {
          background: var(--bg-hover);
        }
        
        .hunk-toggle {
          color: var(--text-muted);
        }
        
        .hunk-location {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        
        .hunk-summary {
          display: flex;
          gap: var(--spacing-xs);
          font-family: var(--font-mono);
          font-size: 0.7rem;
        }
        
        .additions { color: var(--success); }
        .deletions { color: var(--error); }
        
        .hunk-description {
          flex: 1;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .hunk-actions {
          display: flex;
          gap: 2px;
          margin-left: auto;
        }
        
        .btn-icon {
          padding: 4px 8px;
          border: none;
          border-radius: var(--border-radius-sm);
          cursor: pointer;
          transition: all 0.1s;
        }
        
        .btn-icon.accept {
          background: rgba(16, 185, 129, 0.2);
          color: var(--success);
        }
        
        .btn-icon.accept:hover {
          background: var(--success);
          color: white;
        }
        
        .btn-icon.reject {
          background: rgba(239, 68, 68, 0.2);
          color: var(--error);
        }
        
        .btn-icon.reject:hover {
          background: var(--error);
          color: white;
        }
        
        .hunk-status-badge {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.65rem;
          font-weight: 500;
          margin-left: auto;
        }
        
        .hunk-status-badge.accepted {
          background: rgba(16, 185, 129, 0.2);
          color: var(--success);
        }
        
        .hunk-status-badge.rejected {
          background: rgba(239, 68, 68, 0.2);
          color: var(--error);
        }
        
        .hunk-content {
          background: var(--bg-primary);
          border-top: 1px solid var(--border-subtle);
        }
        
        .diff-code {
          margin: 0;
          padding: 0;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          line-height: 1.5;
        }
        
        .diff-line {
          display: flex;
          padding: 0 var(--spacing-sm);
        }
        
        .diff-line.added {
          background: rgba(16, 185, 129, 0.15);
        }
        
        .diff-line.removed {
          background: rgba(239, 68, 68, 0.15);
        }
        
        .line-number {
          width: 35px;
          text-align: right;
          padding-right: 8px;
          color: var(--text-muted);
          user-select: none;
          opacity: 0.6;
        }
        
        .line-prefix {
          width: 16px;
          text-align: center;
          user-select: none;
        }
        
        .diff-line.added .line-prefix { color: var(--success); font-weight: bold; }
        .diff-line.removed .line-prefix { color: var(--error); font-weight: bold; }
        
        .line-content {
          flex: 1;
          white-space: pre;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: none;
          border-radius: var(--border-radius-sm);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.1s;
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-success {
          background: var(--success);
          color: white;
        }
        
        .btn-success:hover:not(:disabled) {
          filter: brightness(1.1);
        }
        
        .btn-danger {
          background: var(--error);
          color: white;
        }
        
        .btn-danger:hover:not(:disabled) {
          filter: brightness(1.1);
        }
        
        .btn-sm {
          padding: 3px 8px;
          font-size: 0.7rem;
        }
      `}</style>
    </div>
  );
};

export default InlineDiff;

// Hook for managing inline diff state
export function useInlineDiff() {
  const [hunks, setHunks] = useState<DiffHunk[]>([]);

  const addHunk = useCallback((hunk: Omit<DiffHunk, 'id' | 'status'>) => {
    const id = `hunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setHunks(prev => [...prev, { ...hunk, id, status: 'pending' }]);
    return id;
  }, []);

  const acceptHunk = useCallback((id: string) => {
    setHunks(prev => prev.map(h => h.id === id ? { ...h, status: 'accepted' } : h));
  }, []);

  const rejectHunk = useCallback((id: string) => {
    setHunks(prev => prev.map(h => h.id === id ? { ...h, status: 'rejected' } : h));
  }, []);

  const acceptAll = useCallback(() => {
    setHunks(prev => prev.map(h => h.status === 'pending' ? { ...h, status: 'accepted' } : h));
  }, []);

  const rejectAll = useCallback(() => {
    setHunks(prev => prev.map(h => h.status === 'pending' ? { ...h, status: 'rejected' } : h));
  }, []);

  const clearHunks = useCallback(() => {
    setHunks([]);
  }, []);

  const getAcceptedChanges = useCallback(() => {
    return hunks.filter(h => h.status === 'accepted');
  }, [hunks]);

  return {
    hunks,
    addHunk,
    acceptHunk,
    rejectHunk,
    acceptAll,
    rejectAll,
    clearHunks,
    getAcceptedChanges
  };
}

