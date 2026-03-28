/**
 * MultiFileDiffReview — Changeset review for agent edits
 * 
 * Shows all files the AI agent modified in a single review panel,
 * like Cursor's Composer view. Accept/reject per-file or all at once.
 */

import React, { useState, useCallback, useMemo } from 'react';
import InlineDiff, { DiffHunk, useInlineDiff } from './InlineDiff';

export interface FileChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  action: 'modified' | 'created' | 'deleted';
  status: 'pending' | 'accepted' | 'rejected';
}

interface MultiFileDiffReviewProps {
  changes: FileChange[];
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
  taskDescription?: string;
}

const MultiFileDiffReview: React.FC<MultiFileDiffReviewProps> = ({
  changes,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  onClose,
  taskDescription,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(changes.slice(0, 3).map(c => c.filePath))
  );

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const pending = changes.filter(c => c.status === 'pending').length;
    const accepted = changes.filter(c => c.status === 'accepted').length;
    const rejected = changes.filter(c => c.status === 'rejected').length;
    return { pending, accepted, rejected, total: changes.length };
  }, [changes]);

  const getActionBadge = (action: string) => {
    const colors: Record<string, { bg: string; color: string; label: string }> = {
      modified: { bg: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff', label: 'M' },
      created: { bg: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', label: 'A' },
      deleted: { bg: 'rgba(255, 123, 114, 0.15)', color: '#ff7b72', label: 'D' },
    };
    const c = colors[action] || colors.modified;
    return (
      <span style={{
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 700,
        background: c.bg,
        color: c.color,
        fontFamily: 'monospace',
      }}>
        {c.label}
      </span>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--prime-surface)',
      border: '1px solid var(--prime-border)',
      borderRadius: '10px',
      overflow: 'hidden',
      maxHeight: '500px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: 'var(--prime-bg)',
        borderBottom: '1px solid var(--prime-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '14px' }}>✏</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Agent Changes</span>
          <span style={{
            fontSize: '11px',
            color: 'var(--prime-text-muted)',
            background: 'var(--prime-surface-hover)',
            padding: '2px 8px',
            borderRadius: '10px',
          }}>
            {stats.total} file{stats.total !== 1 ? 's' : ''}
          </span>
          {taskDescription && (
            <span style={{
              fontSize: '11px',
              color: 'var(--prime-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              — {taskDescription}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {stats.pending > 0 && (
            <>
              <button onClick={onAcceptAll} style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: 'none',
                background: '#238636',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                Accept All ({stats.pending})
              </button>
              <button onClick={onRejectAll} style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid var(--prime-border)',
                background: 'transparent',
                color: '#ff7b72',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                Reject All
              </button>
            </>
          )}
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: 'var(--prime-text-muted)',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px',
          }}>
            x
          </button>
        </div>
      </div>

      {/* File list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {changes.map((change) => (
          <div key={change.filePath} style={{
            borderBottom: '1px solid var(--prime-border)',
            opacity: change.status === 'rejected' ? 0.4 : 1,
          }}>
            {/* File header */}
            <div
              onClick={() => toggleFile(change.filePath)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                cursor: 'pointer',
                fontSize: '12px',
                background: change.status === 'accepted' ? 'rgba(63, 185, 80, 0.05)' : 'transparent',
              }}
            >
              <span style={{ color: 'var(--prime-text-muted)', fontSize: '10px' }}>
                {expandedFiles.has(change.filePath) ? '▼' : '▶'}
              </span>
              {getActionBadge(change.action)}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '12px',
                color: 'var(--prime-text)',
                flex: 1,
              }}>
                {change.filePath}
              </span>

              {change.status === 'pending' && (
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => onAcceptFile(change.filePath)} style={{
                    padding: '2px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'rgba(63, 185, 80, 0.15)',
                    color: '#3fb950',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                    Accept
                  </button>
                  <button onClick={() => onRejectFile(change.filePath)} style={{
                    padding: '2px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'rgba(255, 123, 114, 0.15)',
                    color: '#ff7b72',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                    Reject
                  </button>
                </div>
              )}

              {change.status !== 'pending' && (
                <span style={{
                  padding: '1px 8px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: change.status === 'accepted' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(255, 123, 114, 0.15)',
                  color: change.status === 'accepted' ? '#3fb950' : '#ff7b72',
                }}>
                  {change.status === 'accepted' ? 'Accepted' : 'Rejected'}
                </span>
              )}
            </div>

            {/* File diff */}
            {expandedFiles.has(change.filePath) && (
              <div style={{
                background: '#0d1117',
                borderTop: '1px solid var(--prime-border)',
                maxHeight: '200px',
                overflow: 'auto',
              }}>
                <FileDiff oldContent={change.oldContent} newContent={change.newContent} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const FileDiff: React.FC<{ oldContent: string; newContent: string }> = ({ oldContent, newContent }) => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const lines: Array<{ type: 'same' | 'add' | 'remove'; content: string; lineNo: number }> = [];
  let lineNo = 1;

  let oi = 0;
  let ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    const ol = oi < oldLines.length ? oldLines[oi] : undefined;
    const nl = ni < newLines.length ? newLines[ni] : undefined;

    if (ol === nl) {
      lines.push({ type: 'same', content: ol || '', lineNo: lineNo++ });
      oi++;
      ni++;
    } else if (ol === undefined) {
      lines.push({ type: 'add', content: nl!, lineNo: lineNo++ });
      ni++;
    } else if (nl === undefined) {
      lines.push({ type: 'remove', content: ol, lineNo: lineNo++ });
      oi++;
    } else {
      lines.push({ type: 'remove', content: ol, lineNo: lineNo++ });
      lines.push({ type: 'add', content: nl, lineNo: lineNo++ });
      oi++;
      ni++;
    }
  }

  return (
    <pre style={{
      margin: 0,
      padding: '4px 0',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      lineHeight: '1.5',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          padding: '0 12px',
          background: line.type === 'add' ? 'rgba(63, 185, 80, 0.12)'
            : line.type === 'remove' ? 'rgba(255, 123, 114, 0.12)'
            : 'transparent',
          display: 'flex',
        }}>
          <span style={{
            width: '40px',
            textAlign: 'right',
            paddingRight: '12px',
            color: '#484f58',
            userSelect: 'none',
            flexShrink: 0,
          }}>
            {line.lineNo}
          </span>
          <span style={{
            width: '16px',
            textAlign: 'center',
            color: line.type === 'add' ? '#3fb950' : line.type === 'remove' ? '#ff7b72' : '#484f58',
            fontWeight: line.type !== 'same' ? 700 : 400,
            userSelect: 'none',
            flexShrink: 0,
          }}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span style={{
            flex: 1,
            whiteSpace: 'pre',
            color: '#c9d1d9',
          }}>
            {line.content}
          </span>
        </div>
      ))}
    </pre>
  );
};

export default MultiFileDiffReview;
