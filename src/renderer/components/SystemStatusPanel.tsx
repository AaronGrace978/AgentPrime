import React from 'react';
import type { AgentReviewSessionSnapshot } from '../../types/agent-review';
import type { SystemDoctorReport, SystemStatusSummary } from '../../types/system-health';

interface SystemStatusPanelProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatusSummary | null;
  doctorReport: SystemDoctorReport | null;
  doctorLoading: boolean;
  doctorError: string | null;
  latestAppliedReviewSession: AgentReviewSessionSnapshot | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onRevertLastSession: () => void;
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid var(--prime-border)',
  background: 'var(--prime-surface)',
};

const badgeStyle = (accent: string, background: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 9px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  color: accent,
  background,
});

const SystemStatusPanel: React.FC<SystemStatusPanelProps> = ({
  isOpen,
  onClose,
  status,
  doctorReport,
  doctorLoading,
  doctorError,
  latestAppliedReviewSession,
  onRefresh,
  onOpenSettings,
  onRevertLastSession,
}) => {
  if (!isOpen) {
    return null;
  }

  const acceptedChanges = latestAppliedReviewSession?.changes.filter((change) => change.status === 'accepted') || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10020,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(7, 10, 16, 0.72)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(980px, 94vw)',
          maxHeight: '88vh',
          overflow: 'auto',
          padding: '18px',
          borderRadius: '18px',
          border: '1px solid var(--prime-border)',
          background: 'var(--prime-bg)',
          boxShadow: '0 30px 100px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--prime-text)' }}>System Status</div>
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
              Desktop runtime health, startup diagnostics, and the latest trusted agent session state.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onRefresh} className="icon-btn">Refresh</button>
            <button onClick={onClose} className="icon-btn">Close</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>AI Runtime</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={badgeStyle(status?.ai.connected ? '#3fb950' : '#ff7b72', status?.ai.connected ? 'rgba(63, 185, 80, 0.12)' : 'rgba(255, 123, 114, 0.12)')}>
                {status?.ai.connected ? 'Connected' : 'Disconnected'}
              </span>
              {status?.ai.availableModels !== undefined && (
                <span style={badgeStyle('#58a6ff', 'rgba(88, 166, 255, 0.12)')}>
                  {status.ai.availableModels} model{status.ai.availableModels === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
              {status?.ai.provider || 'AI'} / {status?.ai.model || 'loading...'}
            </div>
            <div style={{ fontSize: '12px', color: status?.ai.connected ? 'var(--prime-text-secondary)' : '#ff7b72', lineHeight: 1.5 }}>
              {status?.ai.connectionError
                || status?.ai.reason
                || (status?.ai.connected
                  ? 'Provider connection check completed successfully.'
                  : 'Provider connection details are unavailable.')}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>Python Brain</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={badgeStyle(
                status?.brain.enabled ? (status.brain.connected ? '#3fb950' : '#f59e0b') : '#58a6ff',
                status?.brain.enabled
                  ? (status.brain.connected ? 'rgba(63, 185, 80, 0.12)' : 'rgba(245, 158, 11, 0.12)')
                  : 'rgba(88, 166, 255, 0.12)'
              )}>
                {!status?.brain.enabled ? 'Desktop Only' : status.brain.connected ? 'Enabled' : 'Offline'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
              {!status?.brain.enabled
                ? 'Core IDE mode is active. The optional Python backend is not required.'
                : status.brain.connected
                  ? 'Memory and orchestration features are available.'
                  : 'Brain-backed memory/orchestration is enabled but currently unavailable.'}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>Startup Diagnostics</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={badgeStyle(
                status?.startup.warningCount ? '#f59e0b' : '#3fb950',
                status?.startup.warningCount ? 'rgba(245, 158, 11, 0.12)' : 'rgba(63, 185, 80, 0.12)'
              )}>
                {status?.startup.warningCount || 0} warning{status?.startup.warningCount === 1 ? '' : 's'}
              </span>
              <span style={badgeStyle('#58a6ff', 'rgba(88, 166, 255, 0.12)')}>
                {status?.startup.infoCount || 0} info
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
              {status?.startup.generatedAt
                ? `Generated ${new Date(status.startup.generatedAt).toLocaleString()}`
                : 'Diagnostics unavailable.'}
            </div>
          </div>
        </div>

        {latestAppliedReviewSession && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>Last Agent Session</div>
                <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5, marginTop: '4px' }}>
                  {latestAppliedReviewSession.plan?.summary || 'Latest applied review session is available for restore.'}
                </div>
              </div>
              <button onClick={onRevertLastSession} className="icon-btn">
                Revert Last Session
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={badgeStyle('#3fb950', 'rgba(63, 185, 80, 0.12)')}>
                {acceptedChanges.length} accepted file{acceptedChanges.length === 1 ? '' : 's'}
              </span>
              {latestAppliedReviewSession.appliedAt && (
                <span style={badgeStyle('#58a6ff', 'rgba(88, 166, 255, 0.12)')}>
                  Applied {new Date(latestAppliedReviewSession.appliedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            {latestAppliedReviewSession.plan?.fileReasons?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {latestAppliedReviewSession.plan.fileReasons.slice(0, 5).map((reason) => (
                  <div key={reason.filePath} style={{ fontSize: '11px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                    <code style={{ color: 'var(--prime-text)' }}>{reason.filePath}</code> - {reason.reason}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>Doctor Report</div>
              <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5, marginTop: '4px' }}>
                Targeted environment checks for the desktop runtime, active provider, and optional Brain backend.
              </div>
            </div>
            <button onClick={onOpenSettings} className="icon-btn">Open Settings</button>
          </div>

          {doctorLoading && (
            <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)' }}>Running diagnostics...</div>
          )}

          {doctorError && (
            <div style={{ fontSize: '12px', color: '#ff7b72' }}>{doctorError}</div>
          )}

          {doctorReport && (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={badgeStyle('#3fb950', 'rgba(63, 185, 80, 0.12)')}>{doctorReport.passCount} passed</span>
                <span style={badgeStyle('#f59e0b', 'rgba(245, 158, 11, 0.12)')}>{doctorReport.warnCount} warning{doctorReport.warnCount === 1 ? '' : 's'}</span>
                <span style={badgeStyle('#ff7b72', 'rgba(255, 123, 114, 0.12)')}>{doctorReport.failCount} failed</span>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {doctorReport.checks.map((check) => (
                  <div
                    key={`${check.category}-${check.name}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--prime-border)',
                      background: 'var(--prime-bg)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>{check.name}</div>
                      <span style={badgeStyle(
                        check.status === 'pass' ? '#3fb950' : check.status === 'warn' ? '#f59e0b' : '#ff7b72',
                        check.status === 'pass'
                          ? 'rgba(63, 185, 80, 0.12)'
                          : check.status === 'warn'
                            ? 'rgba(245, 158, 11, 0.12)'
                            : 'rgba(255, 123, 114, 0.12)'
                      )}>
                        {check.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5 }}>
                      {check.message}
                    </div>
                    {check.details && (
                      <div style={{ fontSize: '11px', color: 'var(--prime-text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {check.details}
                      </div>
                    )}
                    {check.action && (
                      <div style={{ fontSize: '11px', color: '#58a6ff', lineHeight: 1.5 }}>
                        {check.action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {status?.startup.issues?.length ? (
          <div style={sectionStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>Startup Findings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {status.startup.issues.map((issue) => (
                <div
                  key={`${issue.code}-${issue.message}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--prime-border)',
                    background: 'var(--prime-bg)',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--prime-text)' }}>{issue.code}</div>
                  <div style={{ fontSize: '12px', color: 'var(--prime-text-secondary)', lineHeight: 1.5, marginTop: '4px' }}>
                    {issue.message}
                  </div>
                  {issue.action && (
                    <div style={{ fontSize: '11px', color: '#58a6ff', lineHeight: 1.5, marginTop: '4px' }}>
                      {issue.action}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SystemStatusPanel;
