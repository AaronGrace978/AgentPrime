/**
 * MultiFileDiffReview — Changeset review for agent edits
 * 
 * Shows all files the AI agent modified in a single review panel,
 * like Cursor's Composer view. Accept/reject per-file or all at once.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { AgentReviewChange, AgentReviewVerificationState } from '../../types/agent-review';

export type FileChange = AgentReviewChange;

interface MultiFileDiffReviewProps {
  changes: FileChange[];
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApplyAccepted?: () => void;
  onVerifyAccepted?: () => void;
  onRunProject?: () => void;
  onRepair?: () => void;
  onClose: () => void;
  taskDescription?: string;
  verification?: AgentReviewVerificationState;
  isStaged?: boolean;
  applied?: boolean;
}

type FileStatusFilter = 'all' | 'pending' | 'accepted' | 'rejected';

function computeDiffStats(oldContent: string, newContent: string): { added: number; removed: number } {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  let oi = 0;
  let ni = 0;
  let added = 0;
  let removed = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    const oldLine = oi < oldLines.length ? oldLines[oi] : undefined;
    const newLine = ni < newLines.length ? newLines[ni] : undefined;

    if (oldLine === newLine) {
      oi++;
      ni++;
      continue;
    }

    if (oldLine === undefined) {
      added++;
      ni++;
      continue;
    }

    if (newLine === undefined) {
      removed++;
      oi++;
      continue;
    }

    removed++;
    added++;
    oi++;
    ni++;
  }

  return { added, removed };
}

const MultiFileDiffReview: React.FC<MultiFileDiffReviewProps> = ({
  changes,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  onApplyAccepted,
  onVerifyAccepted,
  onRunProject,
  onRepair,
  onClose,
  taskDescription,
  verification,
  isStaged = false,
  applied = false,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(changes.slice(0, 3).map(c => c.filePath))
  );
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>('all');
  const [fileQuery, setFileQuery] = useState('');

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
  const diffStatsByFile = useMemo(() => {
    const map = new Map<string, { added: number; removed: number }>();
    for (const change of changes) {
      map.set(change.filePath, computeDiffStats(change.oldContent, change.newContent));
    }
    return map;
  }, [changes]);
  const normalizedQuery = fileQuery.trim().toLowerCase();
  const visibleChanges = useMemo(() => {
    return changes.filter((change) => {
      const statusMatches = statusFilter === 'all' || change.status === statusFilter;
      const queryMatches = normalizedQuery.length === 0 || change.filePath.toLowerCase().includes(normalizedQuery);
      return statusMatches && queryMatches;
    });
  }, [changes, normalizedQuery, statusFilter]);
  const acceptedFiles = useMemo(
    () => changes.filter((change) => change.status === 'accepted').map((change) => change.filePath),
    [changes]
  );
  const repairTargets = useMemo(() => {
    const findingFiles = new Set((verification?.findings || []).flatMap((finding) => finding.files));
    return findingFiles.size > 0
      ? acceptedFiles.filter((filePath) => findingFiles.has(filePath))
      : acceptedFiles;
  }, [acceptedFiles, verification]);
  const reviewComplete = stats.pending === 0;
  const acceptedCount = stats.accepted;
  const showVerificationActions = reviewComplete && acceptedCount > 0 && (!isStaged || applied);
  const showApplyAction = isStaged && reviewComplete && acceptedCount > 0 && !applied;
  const reviewDecisionCopy = isStaged
    ? reviewComplete
      ? applied
        ? 'Review complete. Accepted changes are now in the workspace and rejected ones were discarded before apply.'
        : 'Review complete. Apply writes accepted files to disk, and rejected ones stay out of the workspace.'
      : 'Accept marks a staged change for apply. Reject keeps it out of the workspace.'
    : reviewComplete
      ? 'Review complete. Accepted changes stay in the workspace, and rejected ones have already been reverted.'
      : 'Accept keeps a change in the workspace. Reject immediately restores the prior file contents.';
  const toggleExpandVisible = useCallback(() => {
    const allVisibleExpanded = visibleChanges.length > 0 && visibleChanges.every((change) => expandedFiles.has(change.filePath));
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (allVisibleExpanded) {
        for (const change of visibleChanges) {
          next.delete(change.filePath);
        }
      } else {
        for (const change of visibleChanges) {
          next.add(change.filePath);
        }
      }
      return next;
    });
  }, [expandedFiles, visibleChanges]);

  const renderStatPill = (
    label: string,
    value: number,
    accent: string,
    background: string
  ) => (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      background,
      color: accent,
    }}>
      <span>{label}</span>
      <span style={{ color: 'var(--prime-text)' }}>{value}</span>
    </span>
  );

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
      maxHeight: '560px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px 16px',
        background: 'linear-gradient(180deg, var(--prime-bg) 0%, var(--prime-surface) 100%)',
        borderBottom: '1px solid var(--prime-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px' }}>✏</span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--prime-text)' }}>Review Agent Changes</span>
              <span style={{
                fontSize: '11px',
                color: 'var(--prime-text-muted)',
                background: 'var(--prime-surface-hover)',
                padding: '3px 8px',
                borderRadius: '10px',
              }}>
                {stats.total} file{stats.total !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.45 }}>
              {reviewDecisionCopy}
            </div>
            {taskDescription && (
              <div style={{
                fontSize: '11px',
                color: 'var(--prime-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {taskDescription}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: '1px solid var(--prime-border)',
            color: 'var(--prime-text-secondary)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: '8px',
            flexShrink: 0,
          }}>
            {isStaged && !applied ? 'Discard Review' : reviewComplete ? 'Done' : 'Hide Review'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {renderStatPill('Pending', stats.pending, '#f59e0b', 'rgba(245, 158, 11, 0.12)')}
          {renderStatPill('Accepted', stats.accepted, '#3fb950', 'rgba(63, 185, 80, 0.12)')}
          {renderStatPill(isStaged ? 'Rejected' : 'Reverted', stats.rejected, '#ff7b72', 'rgba(255, 123, 114, 0.12)')}
          {verification?.status === 'verifying' && renderStatPill('Verifying', 1, '#58a6ff', 'rgba(88, 166, 255, 0.12)')}
          {verification?.status === 'passed' && renderStatPill('Verified', 1, '#3fb950', 'rgba(63, 185, 80, 0.12)')}
          {verification?.status === 'failed' && renderStatPill('Repair Needed', verification.issues.length || 1, '#ff7b72', 'rgba(255, 123, 114, 0.12)')}
          {stats.pending > 0 && (
            <>
              <button onClick={onAcceptAll} style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#238636',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}>
                Accept Pending ({stats.pending})
              </button>
              <button onClick={onRejectAll} style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid var(--prime-border)',
                background: 'transparent',
                color: '#ff7b72',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}>
                {isStaged ? 'Reject Pending' : 'Revert Pending'}
              </button>
            </>
          )}
          {showApplyAction && onApplyAccepted && (
            <button onClick={onApplyAccepted} style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#238636',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Apply Accepted Changes
            </button>
          )}
          {showVerificationActions && verification?.status === 'idle' && onVerifyAccepted && (
            <button onClick={onVerifyAccepted} style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'rgba(88, 166, 255, 0.12)',
              color: '#58a6ff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Verify Accepted Changes
            </button>
          )}
          {showVerificationActions && verification?.status === 'verifying' && (
            <button disabled style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'rgba(88, 166, 255, 0.12)',
              color: '#58a6ff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'wait',
              opacity: 0.8,
            }}>
              Verifying...
            </button>
          )}
          {showVerificationActions && verification?.status === 'passed' && onRunProject && (
            <button onClick={onRunProject} style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#238636',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Run Project
            </button>
          )}
          {showVerificationActions && verification?.status === 'failed' && onVerifyAccepted && (
            <button onClick={onVerifyAccepted} style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'transparent',
              color: '#58a6ff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Retry Verification
            </button>
          )}
          {showVerificationActions && verification?.status === 'failed' && onRepair && (
            <button onClick={onRepair} style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#f59e0b',
              color: '#111',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Repair With Agent
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
            placeholder="Filter files..."
            style={{
              minWidth: '220px',
              padding: '7px 10px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-surface)',
              color: 'var(--prime-text)',
              fontSize: '12px',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as FileStatusFilter)}
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-surface)',
              color: 'var(--prime-text)',
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending only</option>
            <option value="accepted">Accepted only</option>
            <option value="rejected">Rejected only</option>
          </select>
          <button
            onClick={toggleExpandVisible}
            disabled={visibleChanges.length === 0}
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'transparent',
              color: 'var(--prime-text-secondary)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: visibleChanges.length === 0 ? 'not-allowed' : 'pointer',
              opacity: visibleChanges.length === 0 ? 0.6 : 1,
            }}
          >
            {visibleChanges.length > 0 && visibleChanges.every((change) => expandedFiles.has(change.filePath))
              ? 'Collapse Visible'
              : 'Expand Visible'}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>
            Showing {visibleChanges.length} of {changes.length} files
          </span>
        </div>
        {verification && verification.status !== 'idle' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '10px 12px',
            borderRadius: '8px',
            background:
              verification.status === 'failed'
                ? 'rgba(255, 123, 114, 0.08)'
                : verification.status === 'passed'
                  ? 'rgba(63, 185, 80, 0.08)'
                  : 'rgba(88, 166, 255, 0.08)',
            border: '1px solid var(--prime-border)',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--prime-text)', fontWeight: 600 }}>
              {verification.status === 'verifying'
                ? 'Running verification on accepted changes...'
                : verification.status === 'passed'
                  ? `${verification.projectTypeLabel || 'Project'} verified successfully`
                  : `${verification.projectTypeLabel || 'Project'} failed verification`}
            </div>
            {verification.readinessSummary && (
              <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                {verification.readinessSummary}
              </div>
            )}
            {verification.startCommand && (
              <div style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>
                Run: <code>{verification.startCommand}</code>
              </div>
            )}
            {verification.buildCommand && (
              <div style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>
                Build: <code>{verification.buildCommand}</code>
              </div>
            )}
            {verification.status === 'failed' && repairTargets.length > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                Repair scope: {repairTargets.map((filePath) => `\`${filePath}\``).join(', ')}
              </div>
            )}
            {verification.findings && verification.findings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {verification.findings.slice(0, 6).map((finding, index) => (
                  <div key={`${finding.summary}-${index}`} style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.28)',
                    border: '1px solid rgba(148, 163, 184, 0.12)',
                    fontSize: '11px',
                    color: 'var(--prime-text-secondary)',
                    lineHeight: 1.45,
                  }}>
                    <div style={{ color: 'var(--prime-text)', fontWeight: 600 }}>
                      [{finding.stage}] {finding.summary}
                    </div>
                    {finding.files.length > 0 && (
                      <div>Files: {finding.files.map((filePath) => `\`${filePath}\``).join(', ')}</div>
                    )}
                    {finding.command && (
                      <div>Command: <code>{finding.command}</code></div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {verification.issues.length > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.45 }}>
                {verification.issues.slice(0, 5).map((issue, index) => (
                  <div key={`${issue}-${index}`}>- {issue}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {visibleChanges.length === 0 ? (
          <div style={{
            padding: '20px',
            fontSize: '12px',
            color: 'var(--prime-text-muted)',
            textAlign: 'center',
            borderTop: '1px solid var(--prime-border)',
          }}>
            No files match the current filter.
          </div>
        ) : visibleChanges.map((change) => {
          const diffStats = diffStatsByFile.get(change.filePath) || { added: 0, removed: 0 };
          return (
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
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  background:
                    change.status === 'accepted'
                      ? 'rgba(63, 185, 80, 0.06)'
                      : change.status === 'rejected'
                        ? 'rgba(255, 123, 114, 0.04)'
                        : 'transparent',
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
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  fontWeight: 700,
                  background: 'rgba(88, 166, 255, 0.12)',
                  color: '#58a6ff',
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  +{diffStats.added} / -{diffStats.removed}
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
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: change.status === 'accepted' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(255, 123, 114, 0.15)',
                    color: change.status === 'accepted' ? '#3fb950' : '#ff7b72',
                  }}>
                    {change.status === 'accepted' ? 'Accepted' : 'Reverted'}
                  </span>
                )}
              </div>

              {/* File diff */}
              {expandedFiles.has(change.filePath) && (
                <div style={{
                  background: '#0d1117',
                  borderTop: '1px solid var(--prime-border)',
                  maxHeight: '240px',
                  overflow: 'auto',
                }}>
                  <FileDiff oldContent={change.oldContent} newContent={change.newContent} />
                </div>
              )}
            </div>
          );
        })}
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
