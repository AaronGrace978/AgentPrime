/**
 * MultiFileDiffReview — Changeset review for agent edits
 * 
 * Shows all files the AI agent modified in a single review panel,
 * like Cursor's Composer view. Accept/reject per-file or all at once.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type {
  AgentReviewChange,
  AgentReviewCheckpointSummary,
  AgentReviewFinding,
  AgentReviewPlanSummary,
  AgentReviewVerificationState,
} from '../../types/agent-review';

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
  onRevertSession?: () => void;
  onClose: () => void;
  taskDescription?: string;
  plan?: AgentReviewPlanSummary;
  checkpoint?: AgentReviewCheckpointSummary;
  verification?: AgentReviewVerificationState;
  isStaged?: boolean;
  applied?: boolean;
  canRevertSession?: boolean;
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
  onRevertSession,
  onClose,
  taskDescription,
  plan,
  checkpoint,
  verification,
  isStaged = false,
  applied = false,
  canRevertSession = false,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(changes.slice(0, 3).map(c => c.filePath))
  );
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>('all');
  const [fileQuery, setFileQuery] = useState('');
  const [showPlanSummary, setShowPlanSummary] = useState(true);

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
  const checkpoints = checkpoint?.items || [
    { id: 'plan', label: 'Plan', stage: 'plan', state: plan ? 'complete' : 'current' },
    { id: 'review', label: 'Review', stage: 'review', state: reviewComplete ? 'complete' : 'current' },
    {
      id: 'apply',
      label: 'Apply',
      stage: 'apply',
      state: isStaged ? (applied ? 'complete' : reviewComplete ? 'current' : 'upcoming') : 'complete',
    },
    {
      id: verification?.status === 'failed' ? 'repair' : 'verify',
      label: verification?.status === 'failed' ? 'Repair' : 'Verify',
      stage: verification?.status === 'failed' ? 'repair' : 'verify',
      state:
        verification?.status === 'passed'
          ? 'complete'
          : verification?.status === 'failed'
            ? 'current'
            : showVerificationActions
              ? 'current'
              : 'upcoming',
    },
  ];
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

  const sectionCardStyle: React.CSSProperties = {
    border: '1px solid var(--prime-border)',
    borderRadius: '14px',
    background: 'linear-gradient(180deg, var(--prime-surface-elevated) 0%, var(--prime-surface) 100%)',
    boxShadow: 'var(--prime-shadow-sm)',
  };

  const getButtonStyle = (
    variant: 'primary' | 'secondary' | 'danger' | 'warning' | 'success',
    emphasis: 'solid' | 'soft' = 'soft'
  ): React.CSSProperties => {
    if (variant === 'primary') {
      return {
        padding: '9px 14px',
        borderRadius: '10px',
        border: emphasis === 'solid' ? '1px solid var(--prime-accent)' : '1px solid rgba(59, 130, 246, 0.16)',
        background: emphasis === 'solid' ? 'var(--prime-accent)' : 'var(--prime-accent-light)',
        color: emphasis === 'solid' ? '#fff' : 'var(--prime-accent)',
        fontSize: '11px',
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: emphasis === 'solid' ? '0 10px 24px var(--prime-accent-glow)' : 'none',
      };
    }
    if (variant === 'success') {
      return {
        padding: '9px 14px',
        borderRadius: '10px',
        border: emphasis === 'solid' ? '1px solid var(--prime-success)' : '1px solid rgba(16, 185, 129, 0.20)',
        background: emphasis === 'solid' ? 'var(--prime-success)' : 'rgba(16, 185, 129, 0.10)',
        color: emphasis === 'solid' ? '#fff' : 'var(--prime-success)',
        fontSize: '11px',
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: emphasis === 'solid' ? '0 10px 24px rgba(16, 185, 129, 0.22)' : 'none',
      };
    }
    if (variant === 'warning') {
      return {
        padding: '9px 14px',
        borderRadius: '10px',
        border: emphasis === 'solid' ? '1px solid var(--prime-amber)' : '1px solid rgba(245, 158, 11, 0.20)',
        background: emphasis === 'solid' ? 'var(--prime-amber)' : 'rgba(245, 158, 11, 0.10)',
        color: emphasis === 'solid' ? '#111827' : 'var(--prime-amber)',
        fontSize: '11px',
        fontWeight: 800,
        cursor: 'pointer',
      };
    }
    if (variant === 'danger') {
      return {
        padding: '9px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(239, 68, 68, 0.20)',
        background: emphasis === 'solid' ? 'var(--prime-error)' : 'rgba(239, 68, 68, 0.08)',
        color: emphasis === 'solid' ? '#fff' : 'var(--prime-error)',
        fontSize: '11px',
        fontWeight: 800,
        cursor: 'pointer',
      };
    }
    return {
      padding: '9px 14px',
      borderRadius: '10px',
      border: '1px solid var(--prime-border)',
      background: 'var(--prime-surface-hover)',
      color: 'var(--prime-text-secondary)',
      fontSize: '11px',
      fontWeight: 800,
      cursor: 'pointer',
    };
  };

  const getReviewStatusMeta = (status: FileChange['status']) => {
    if (status === 'accepted') {
      return {
        label: 'Accepted',
        icon: '✓',
        color: '#3fb950',
        background: 'rgba(63, 185, 80, 0.10)',
        border: 'rgba(63, 185, 80, 0.22)',
      };
    }
    if (status === 'rejected') {
      return {
        label: isStaged ? 'Rejected' : 'Reverted',
        icon: '−',
        color: '#ff7b72',
        background: 'rgba(255, 123, 114, 0.08)',
        border: 'rgba(255, 123, 114, 0.20)',
      };
    }
    return {
      label: 'Pending Review',
      icon: '•',
      color: '#58a6ff',
      background: 'rgba(88, 166, 255, 0.08)',
      border: 'rgba(88, 166, 255, 0.18)',
    };
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, var(--prime-surface-elevated) 0%, var(--prime-surface) 100%)',
      border: '1px solid var(--prime-border)',
      borderRadius: '18px',
      overflow: 'hidden',
      maxHeight: '70vh',
      boxShadow: 'var(--prime-shadow-xl), 0 0 0 1px rgba(255,255,255,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '18px 18px 16px',
        background: 'linear-gradient(180deg, var(--prime-bg) 0%, var(--prime-surface) 100%)',
        borderBottom: '1px solid var(--prime-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--prime-text)', letterSpacing: '-0.01em' }}>Review Agent Changes</span>
              <span style={{
                fontSize: '10px',
                color: 'var(--prime-text-secondary)',
                background: 'var(--prime-surface-hover)',
                padding: '5px 9px',
                borderRadius: '999px',
                border: '1px solid var(--prime-border)',
                fontWeight: 700,
              }}>
                {stats.total} file{stats.total !== 1 ? 's' : ''}
              </span>
              {isStaged && !applied && (
                <span style={{
                  fontSize: '10px',
                  color: '#fbbf24',
                  background: 'rgba(251, 191, 36, 0.12)',
                  border: '1px solid rgba(251, 191, 36, 0.30)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}>
                  Checkpoint — not on disk until you apply
                </span>
              )}
              {checkpoint?.reflectionBudget && (
                <span style={{
                  fontSize: '10px',
                  color: '#58a6ff',
                  background: 'rgba(88, 166, 255, 0.10)',
                  border: '1px solid rgba(88, 166, 255, 0.24)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                }}>
                  {checkpoint.reflectionBudget} review budget
                </span>
              )}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--prime-text-secondary)', lineHeight: 1.45 }}>
              {checkpoint?.summary || reviewDecisionCopy}
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
            ...getButtonStyle('secondary'),
            flexShrink: 0,
          }}>
            {isStaged && !applied ? 'Discard Review' : reviewComplete ? 'Done' : 'Hide Review'}
          </button>
        </div>

        <div style={{
          ...sectionCardStyle,
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {renderStatPill('Pending', stats.pending, '#f59e0b', 'rgba(245, 158, 11, 0.10)')}
            {renderStatPill('Accepted', stats.accepted, '#3fb950', 'rgba(63, 185, 80, 0.10)')}
            {renderStatPill(isStaged ? 'Rejected' : 'Reverted', stats.rejected, '#ff7b72', 'rgba(255, 123, 114, 0.10)')}
            {verification?.status === 'verifying' && renderStatPill('Verifying', 1, '#58a6ff', 'rgba(88, 166, 255, 0.10)')}
            {verification?.status === 'passed' && renderStatPill('Verified', 1, '#3fb950', 'rgba(63, 185, 80, 0.10)')}
            {verification?.status === 'failed' && renderStatPill('Repair Needed', (verification.findings?.length || verification.issues.length) || 1, '#ff7b72', 'rgba(255, 123, 114, 0.10)')}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {stats.pending > 0 && (
              <>
                <button onClick={onAcceptAll} style={getButtonStyle('success', 'solid')}>
                  Accept Pending ({stats.pending})
                </button>
                <button onClick={onRejectAll} style={getButtonStyle('danger')}>
                  {isStaged ? 'Reject Pending' : 'Revert Pending'}
                </button>
              </>
            )}
            {showApplyAction && onApplyAccepted && (
              <button onClick={onApplyAccepted} style={getButtonStyle('primary', 'solid')}>
                Apply Accepted Changes
              </button>
            )}
            {showVerificationActions && verification?.status === 'idle' && onVerifyAccepted && (
              <button onClick={onVerifyAccepted} style={getButtonStyle('primary')}>
                Verify Accepted Changes
              </button>
            )}
            {showVerificationActions && verification?.status === 'verifying' && (
              <button disabled style={{
                ...getButtonStyle('primary'),
                cursor: 'wait',
                opacity: 0.82,
              }}>
                Verifying...
              </button>
            )}
            {showVerificationActions && verification?.status === 'passed' && onRunProject && (
              <button onClick={onRunProject} style={getButtonStyle('success', 'solid')}>
                Run Project
              </button>
            )}
            {showVerificationActions && verification?.status === 'failed' && onVerifyAccepted && (
              <button onClick={onVerifyAccepted} style={getButtonStyle('secondary')}>
                Retry Verification
              </button>
            )}
            {showVerificationActions && verification?.status === 'failed' && onRepair && (
              <button onClick={onRepair} style={getButtonStyle('warning', 'solid')}>
                Repair With Agent
              </button>
            )}
            {applied && canRevertSession && onRevertSession && (
              <button onClick={onRevertSession} style={getButtonStyle('danger')}>
                Revert Last Session
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {checkpoints.map((checkpoint) => (
            <span
              key={checkpoint.label}
              style={{
                padding: '5px 9px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 700,
                border: '1px solid var(--prime-border)',
                color:
                  checkpoint.state === 'complete'
                    ? '#3fb950'
                    : checkpoint.state === 'current'
                      ? '#58a6ff'
                      : 'var(--prime-text-muted)',
                background:
                  checkpoint.state === 'complete'
                    ? 'rgba(63, 185, 80, 0.10)'
                    : checkpoint.state === 'current'
                      ? 'rgba(88, 166, 255, 0.10)'
                      : 'transparent',
              }}
            >
              {checkpoint.label}
            </span>
          ))}
        </div>
        {plan && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid var(--prime-border)',
            background: 'rgba(88, 166, 255, 0.05)',
          }}>
            <div
              onClick={() => setShowPlanSummary((prev) => !prev)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--prime-text)' }}>Plan Explanation</span>
                <span style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.45 }}>
                  {plan.summary}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)' }}>{showPlanSummary ? 'Hide' : 'Show'}</span>
            </div>
            {showPlanSummary && (
              <>
                <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                  {plan.rationale}
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {plan.steps.slice(0, 4).map((step) => (
                    <div
                      key={step.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.14)',
                        background: 'rgba(15, 23, 42, 0.18)',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--prime-text)' }}>{step.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.45, marginTop: '3px' }}>
                        {step.summary}
                      </div>
                      {step.files.length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--prime-text-muted)', marginTop: '4px' }}>
                          {step.files.slice(0, 4).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {plan.fileReasons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {plan.fileReasons.slice(0, 5).map((reason) => (
                      <div key={reason.filePath} style={{ fontSize: '10px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                        <code>{reason.filePath}</code> - {reason.reason}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div style={{
          ...sectionCardStyle,
          padding: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
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
              ...getButtonStyle('secondary'),
              padding: '7px 12px',
              fontSize: '11px',
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
          <VerificationPanel verification={verification} repairTargets={repairTargets} />
        )}
      </div>

      {/* File list */}
      <div style={{ overflow: 'auto', flex: 1, padding: '12px', background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.02) 0%, transparent 100%)' }}>
        {visibleChanges.length === 0 ? (
          <div style={{
            padding: '20px',
            fontSize: '12px',
            color: 'var(--prime-text-muted)',
            textAlign: 'center',
            border: '1px solid var(--prime-border)',
            borderRadius: '14px',
            background: 'var(--prime-surface)',
          }}>
            No files match the current filter.
          </div>
        ) : visibleChanges.map((change) => {
          const diffStats = diffStatsByFile.get(change.filePath) || { added: 0, removed: 0 };
          const statusMeta = getReviewStatusMeta(change.status);
          const totalChanges = diffStats.added + diffStats.removed;
          const densityLabel =
            totalChanges >= 30 ? 'Large change' :
            totalChanges >= 10 ? 'Medium change' :
            'Small change';
          return (
            <div key={change.filePath} style={{
              border: '1px solid var(--prime-border)',
              borderRadius: '16px',
              opacity: change.status === 'rejected' ? 0.52 : 1,
              marginBottom: '12px',
              overflow: 'hidden',
              boxShadow: 'var(--prime-shadow-sm)',
              background:
                change.status === 'accepted'
                  ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, var(--prime-surface) 100%)'
                  : change.status === 'rejected'
                    ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.04) 0%, var(--prime-surface) 100%)'
                    : 'linear-gradient(180deg, rgba(88, 166, 255, 0.03) 0%, var(--prime-surface) 100%)',
            }}>
              {/* File header */}
              <div
                onClick={() => toggleFile(change.filePath)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  background:
                    change.status === 'accepted'
                      ? 'rgba(63, 185, 80, 0.06)'
                      : change.status === 'rejected'
                        ? 'rgba(255, 123, 114, 0.04)'
                        : 'rgba(88, 166, 255, 0.02)',
                  transition: 'background 0.18s var(--ease-out-expo)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '8px',
                    background: 'var(--prime-surface-hover)',
                    border: '1px solid var(--prime-border)',
                    color: 'var(--prime-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                    fontSize: '10px',
                  }}>
                    {expandedFiles.has(change.filePath) ? '▼' : '▶'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {getActionBadge(change.action)}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 9px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 800,
                        color: statusMeta.color,
                        background: statusMeta.background,
                        border: `1px solid ${statusMeta.border}`,
                      }}>
                        <span>{statusMeta.icon}</span>
                        {statusMeta.label}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: 'rgba(88, 166, 255, 0.10)',
                        color: '#58a6ff',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}>
                        +{diffStats.added} / -{diffStats.removed}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        color: 'var(--prime-text-muted)',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: '999px',
                        background: 'var(--prime-surface-hover)',
                        border: '1px solid var(--prime-border)',
                      }}>
                        {densityLabel}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '12px',
                      color: 'var(--prime-text)',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}>
                      {change.filePath}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 700 }}>
                    {expandedFiles.has(change.filePath) ? 'Expanded diff preview' : 'Click to inspect full diff'}
                  </div>

                  {change.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => onAcceptFile(change.filePath)} style={{
                        ...getButtonStyle('success'),
                        padding: '6px 11px',
                      }}>
                        Accept
                      </button>
                      <button onClick={() => onRejectFile(change.filePath)} style={{
                        ...getButtonStyle('danger'),
                        padding: '6px 11px',
                      }}>
                        Reject
                      </button>
                    </div>
                  )}

                  {change.status !== 'pending' && (
                    <span style={{
                      padding: '5px 10px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      fontWeight: 800,
                      background: statusMeta.background,
                      color: statusMeta.color,
                      border: `1px solid ${statusMeta.border}`,
                    }}>
                      {statusMeta.label}
                    </span>
                  )}
                </div>
              </div>

              {/* File diff */}
              {expandedFiles.has(change.filePath) && (
                <div style={{
                  background: '#0d1117',
                  borderTop: '1px solid var(--prime-border)',
                  maxHeight: '280px',
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

/* ─── Verification Panel ──────────────────────────────────────────── */

const STAGE_META: Record<string, { icon: string; label: string }> = {
  validation: { icon: '📋', label: 'Validate' },
  install: { icon: '📦', label: 'Install' },
  build: { icon: '🔨', label: 'Build' },
  run: { icon: '▶', label: 'Run' },
  browser: { icon: '🌐', label: 'Browser' },
  unknown: { icon: '❓', label: 'Check' },
};

const SEVERITY_STYLE: Record<string, { accent: string; bg: string; border: string }> = {
  critical: { accent: '#ff7b72', bg: 'rgba(255, 123, 114, 0.08)', border: 'rgba(255, 123, 114, 0.25)' },
  error: { accent: '#ff7b72', bg: 'rgba(255, 123, 114, 0.06)', border: 'rgba(255, 123, 114, 0.18)' },
  warning: { accent: '#f59e0b', bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.18)' },
  info: { accent: '#58a6ff', bg: 'rgba(88, 166, 255, 0.06)', border: 'rgba(88, 166, 255, 0.18)' },
};

function truncateErrorText(text: string, maxLen: number): { truncated: string; wasTruncated: boolean } {
  if (text.length <= maxLen) return { truncated: text, wasTruncated: false };
  const ellipsis = ' …';
  return { truncated: text.slice(0, maxLen - ellipsis.length) + ellipsis, wasTruncated: true };
}

function splitSummaryFromDetails(raw: string): { headline: string; details: string } {
  const firstSentenceEnd = raw.search(/(?<=[.!?])\s/);
  if (firstSentenceEnd > 20 && firstSentenceEnd < 200) {
    return { headline: raw.slice(0, firstSentenceEnd + 1).trim(), details: raw.slice(firstSentenceEnd + 1).trim() };
  }
  const lineBreak = raw.indexOf('\n');
  if (lineBreak > 0 && lineBreak < 200) {
    return { headline: raw.slice(0, lineBreak).trim(), details: raw.slice(lineBreak + 1).trim() };
  }
  const { truncated, wasTruncated } = truncateErrorText(raw, 180);
  return { headline: truncated, details: wasTruncated ? raw : '' };
}

const FindingCard: React.FC<{ finding: AgentReviewFinding; index: number }> = ({ finding, index }) => {
  const [expanded, setExpanded] = useState(false);

  const stage = STAGE_META[finding.stage] || STAGE_META.unknown;
  const severity = SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.error;
  const { headline, details } = splitSummaryFromDetails(finding.summary);
  const hasDetails = details.length > 0 || (finding.output && finding.output.length > 0) || (finding.command && finding.command.length > 0);

  return (
    <div style={{
      borderRadius: '8px',
      border: `1px solid ${severity.border}`,
      background: severity.bg,
      overflow: 'hidden',
    }}>
      <div
        onClick={hasDetails ? () => setExpanded(prev => !prev) : undefined}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '8px 10px',
          cursor: hasDetails ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '13px', lineHeight: '18px', flexShrink: 0 }}>{stage.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: severity.accent,
              background: severity.bg,
              padding: '1px 6px',
              borderRadius: '4px',
              border: `1px solid ${severity.border}`,
              flexShrink: 0,
            }}>
              {stage.label}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--prime-text)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}>
              {headline}
            </span>
          </div>
          {finding.files.length > 0 && (
            <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {finding.files.slice(0, 4).map((filePath) => (
                <span key={filePath} style={{
                  fontSize: '10px',
                  fontFamily: '"JetBrains Mono", monospace',
                  color: 'var(--prime-text-muted)',
                  background: 'rgba(148, 163, 184, 0.08)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {filePath.split('/').pop() || filePath}
                </span>
              ))}
              {finding.files.length > 4 && (
                <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)' }}>
                  +{finding.files.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
        {hasDetails && (
          <span style={{
            fontSize: '10px',
            color: 'var(--prime-text-muted)',
            flexShrink: 0,
            paddingTop: '2px',
            transition: 'transform 0.15s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▼
          </span>
        )}
      </div>

      {expanded && hasDetails && (
        <div style={{
          borderTop: `1px solid ${severity.border}`,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {finding.command && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 600, flexShrink: 0 }}>$</span>
              <code style={{
                fontSize: '10px',
                fontFamily: '"JetBrains Mono", monospace',
                color: 'var(--prime-text-secondary)',
                background: 'rgba(15, 23, 42, 0.35)',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(148, 163, 184, 0.08)',
                wordBreak: 'break-all',
              }}>
                {finding.command}
              </code>
            </div>
          )}
          {details && (
            <div style={{
              fontSize: '11px',
              color: 'var(--prime-text-secondary)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}>
              {details}
            </div>
          )}
          {finding.output && (
            <pre style={{
              margin: 0,
              fontSize: '10px',
              fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--prime-text-secondary)',
              background: 'rgba(15, 23, 42, 0.45)',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid rgba(148, 163, 184, 0.08)',
              maxHeight: '140px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}>
              {finding.output}
            </pre>
          )}
          {finding.files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 600 }}>Affected files</span>
              {finding.files.map((filePath) => (
                <span key={filePath} style={{
                  fontSize: '10px',
                  fontFamily: '"JetBrains Mono", monospace',
                  color: 'var(--prime-text-secondary)',
                  paddingLeft: '8px',
                }}>
                  {filePath}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const VerificationPanel: React.FC<{
  verification: AgentReviewVerificationState;
  repairTargets: string[];
}> = ({ verification, repairTargets }) => {
  const [showRepairScope, setShowRepairScope] = useState(false);

  const statusConfig = verification.status === 'passed'
    ? { icon: '✓', label: `${verification.projectTypeLabel || 'Project'} verified`, accent: '#3fb950', bg: 'rgba(63, 185, 80, 0.06)', border: 'rgba(63, 185, 80, 0.2)' }
    : verification.status === 'failed'
      ? { icon: '✕', label: `${verification.projectTypeLabel || 'Project'} failed verification`, accent: '#ff7b72', bg: 'rgba(255, 123, 114, 0.06)', border: 'rgba(255, 123, 114, 0.2)' }
      : { icon: '⟳', label: 'Verifying accepted changes', accent: '#58a6ff', bg: 'rgba(88, 166, 255, 0.06)', border: 'rgba(88, 166, 255, 0.2)' };

  const hasFindings = verification.findings && verification.findings.length > 0;
  const hasIssues = verification.issues.length > 0;
  const hasCommands = Boolean(verification.startCommand || verification.buildCommand);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      borderRadius: '10px',
      border: `1px solid ${statusConfig.border}`,
      background: statusConfig.bg,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '9px 12px 0',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--prime-text-muted)',
      }}>
        Verification Report
      </div>
      {/* Status banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          fontSize: '12px',
          fontWeight: 700,
          color: '#fff',
          background: statusConfig.accent,
          flexShrink: 0,
        }}>
          {statusConfig.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>
            {statusConfig.label}
          </div>
          {verification.readinessSummary && (
            <div style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.45, marginTop: '2px' }}>
              {verification.readinessSummary}
            </div>
          )}
        </div>
        {hasFindings && (
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: statusConfig.accent,
            background: statusConfig.bg,
            padding: '2px 8px',
            borderRadius: '999px',
            border: `1px solid ${statusConfig.border}`,
            flexShrink: 0,
          }}>
            {verification.findings!.length} issue{verification.findings!.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Commands */}
      {hasCommands && (
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '6px 12px 8px',
          flexWrap: 'wrap',
        }}>
          {verification.buildCommand && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 600 }}>Build</span>
              <code style={{
                fontSize: '10px',
                fontFamily: '"JetBrains Mono", monospace',
                color: 'var(--prime-text-secondary)',
                background: 'rgba(15, 23, 42, 0.3)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}>
                {verification.buildCommand}
              </code>
            </div>
          )}
          {verification.startCommand && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 600 }}>Run</span>
              <code style={{
                fontSize: '10px',
                fontFamily: '"JetBrains Mono", monospace',
                color: 'var(--prime-text-secondary)',
                background: 'rgba(15, 23, 42, 0.3)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}>
                {verification.startCommand}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Findings */}
      {hasFindings && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '4px 10px 10px',
        }}>
          {verification.findings!.slice(0, 6).map((finding, index) => (
            <FindingCard key={`${finding.stage}-${index}`} finding={finding} index={index} />
          ))}
          {verification.findings!.length > 6 && (
            <div style={{
              fontSize: '10px',
              color: 'var(--prime-text-muted)',
              textAlign: 'center',
              padding: '4px 0',
            }}>
              +{verification.findings!.length - 6} more issue{verification.findings!.length - 6 !== 1 ? 's' : ''} not shown
            </div>
          )}
        </div>
      )}

      {/* Legacy issues (plain string list — only if no structured findings) */}
      {hasIssues && !hasFindings && (
        <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {verification.issues.slice(0, 5).map((issue, index) => (
            <div key={`issue-${index}`} style={{
              fontSize: '11px',
              color: 'var(--prime-text-secondary)',
              lineHeight: 1.45,
              display: 'flex',
              gap: '6px',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: '#ff7b72', flexShrink: 0, fontSize: '8px', lineHeight: '18px' }}>●</span>
              <span style={{ wordBreak: 'break-word' }}>{issue}</span>
            </div>
          ))}
          {verification.issues.length > 5 && (
            <div style={{ fontSize: '10px', color: 'var(--prime-text-muted)', paddingLeft: '14px' }}>
              +{verification.issues.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Repair scope */}
      {verification.status === 'failed' && repairTargets.length > 0 && (
        <div style={{
          borderTop: `1px solid ${statusConfig.border}`,
          padding: '6px 12px 8px',
        }}>
          <div
            onClick={() => setShowRepairScope(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: '10px',
              color: 'var(--prime-text-muted)',
              transition: 'transform 0.15s ease',
              transform: showRepairScope ? 'rotate(90deg)' : 'rotate(0deg)',
            }}>
              ▶
            </span>
            <span style={{ fontSize: '10px', color: 'var(--prime-text-muted)', fontWeight: 600 }}>
              Repair scope
            </span>
            <span style={{
              fontSize: '10px',
              color: 'var(--prime-text-muted)',
              background: 'rgba(148, 163, 184, 0.08)',
              padding: '1px 6px',
              borderRadius: '4px',
            }}>
              {repairTargets.length} file{repairTargets.length !== 1 ? 's' : ''}
            </span>
          </div>
          {showRepairScope && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingTop: '4px', paddingLeft: '16px' }}>
              {repairTargets.map((filePath) => (
                <span key={filePath} style={{
                  fontSize: '10px',
                  fontFamily: '"JetBrains Mono", monospace',
                  color: 'var(--prime-text-secondary)',
                  lineHeight: 1.6,
                }}>
                  {filePath}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── File Diff ──────────────────────────────────────────────────── */

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
