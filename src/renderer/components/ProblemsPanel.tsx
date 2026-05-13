import React, { useMemo } from 'react';
import type { CodeIssue } from './App/types';

interface ProblemsPanelProps {
  issues: CodeIssue[];
  onOpenIssue: (issue: CodeIssue) => void;
  onFixIssue?: (issue: CodeIssue) => void;
}

function severityWeight(severity: CodeIssue['severity']): number {
  return severity === 'error' ? 0 : 1;
}

const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ issues, onOpenIssue, onFixIssue }) => {
  const groupedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => {
      if (severityWeight(a.severity) !== severityWeight(b.severity)) {
        return severityWeight(a.severity) - severityWeight(b.severity);
      }
      return (a.filePath || '').localeCompare(b.filePath || '') || a.line - b.line || a.column - b.column;
    });

    return sorted.reduce<Record<string, CodeIssue[]>>((groups, issue) => {
      const key = issue.filePath || 'Workspace';
      groups[key] = groups[key] || [];
      groups[key].push(issue);
      return groups;
    }, {});
  }, [issues]);

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <div style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacing-md)'
      }}>
        <strong>Problems</strong>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          {errorCount} errors, {warningCount} warnings
        </span>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        {issues.length === 0 ? (
          <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-muted)' }}>
            No problems detected.
          </div>
        ) : (
          Object.entries(groupedIssues).map(([filePath, fileIssues]) => (
            <div key={filePath}>
              <div style={{
                padding: 'var(--spacing-xs) var(--spacing-md)',
                background: 'var(--color-surface-subtle)',
                borderBottom: '1px solid var(--color-border-subtle)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)'
              }}>
                {filePath}
              </div>
              {fileIssues.map((issue, index) => (
                <div
                  key={issue.id || `${filePath}:${issue.line}:${issue.column}:${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderBottom: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenIssue(issue)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'var(--color-text)',
                      textAlign: 'left',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                    title={`${issue.filePath || 'Workspace'}:${issue.line}:${issue.column}`}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: issue.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                        {issue.severity === 'error' ? 'ERR' : 'WARN'}
                      </span>
                      <span>{issue.message}</span>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>
                      {issue.source || issue.origin || 'agentprime'} / {issue.ruleId} at {issue.line}:{issue.column}
                    </div>
                  </button>
                  {onFixIssue && (
                    <button type="button" className="btn-secondary" onClick={() => onFixIssue(issue)}>
                      Fix
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProblemsPanel;
