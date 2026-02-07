import React, { useState, useEffect } from 'react';

interface PlanAction {
  id: string;
  type: 'create' | 'modify' | 'delete' | 'move';
  filePath: string;
  description: string;
  diff?: {
    oldContent?: string;
    newContent: string;
    changes: Array<{
      type: 'add' | 'remove' | 'modify';
      line: number;
      content: string;
    }>;
  };
  status: 'pending' | 'approved' | 'rejected';
}

interface PlanModeProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: {
    actions: PlanAction[];
    summary: string;
  };
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onExecute: () => void;
}

const PlanMode: React.FC<PlanModeProps> = ({
  isOpen,
  onClose,
  plan,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onExecute
}) => {
  const [selectedAction, setSelectedAction] = useState<PlanAction | null>(null);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (plan && plan.actions.length > 0) {
      setSelectedAction(plan.actions[0]);
      setExpandedActions(new Set([plan.actions[0].id]));
    }
  }, [plan]);

  if (!isOpen || !plan) return null;

  const toggleAction = (actionId: string) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionId)) {
      newExpanded.delete(actionId);
    } else {
      newExpanded.add(actionId);
    }
    setExpandedActions(newExpanded);
  };

  const approvedCount = plan.actions.filter(a => a.status === 'approved').length;
  const pendingCount = plan.actions.filter(a => a.status === 'pending').length;

  const renderDiff = (diff: PlanAction['diff']) => {
    if (!diff) return <div className="no-diff">No diff available</div>;

    return (
      <div className="diff-viewer">
        <div className="diff-header">
          <span className="diff-label old">Old</span>
          <span className="diff-label new">New</span>
        </div>
        <div className="diff-content">
          {diff.changes.map((change, idx) => (
            <div key={idx} className={`diff-line ${change.type}`}>
              <span className="diff-line-number">{change.line}</span>
              <span className="diff-line-content">
                {change.type === 'remove' && <span className="diff-remove">-</span>}
                {change.type === 'add' && <span className="diff-add">+</span>}
                {change.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getActionIcon = (type: PlanAction['type']) => {
    switch (type) {
      case 'create': return '➕';
      case 'modify': return '✏️';
      case 'delete': return '🗑️';
      case 'move': return '📦';
      default: return '📄';
    }
  };

  const getStatusColor = (status: PlanAction['status']) => {
    switch (status) {
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      default: return '#ffc107';
    }
  };

  return (
    <div className="plan-mode-overlay" onClick={onClose}>
      <div className="plan-mode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plan-mode-header">
          <h2>🤖 Plan Mode - Review Changes</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="plan-mode-summary">
          <p>{plan.summary}</p>
          <div className="plan-stats">
            <span className="stat">Total: {plan.actions.length}</span>
            <span className="stat approved">Approved: {approvedCount}</span>
            <span className="stat pending">Pending: {pendingCount}</span>
          </div>
        </div>

        <div className="plan-mode-actions">
          <div className="plan-actions-list">
            {plan.actions.map((action) => (
              <div
                key={action.id}
                className={`plan-action-item ${action.status} ${expandedActions.has(action.id) ? 'expanded' : ''}`}
              >
                <div
                  className="plan-action-header"
                  onClick={() => {
                    toggleAction(action.id);
                    setSelectedAction(action);
                  }}
                >
                  <span className="action-icon">{getActionIcon(action.type)}</span>
                  <span className="action-type">{action.type.toUpperCase()}</span>
                  <span className="action-path">{action.filePath}</span>
                  <span
                    className="action-status"
                    style={{ color: getStatusColor(action.status) }}
                  >
                    {action.status}
                  </span>
                  <span className="action-toggle">
                    {expandedActions.has(action.id) ? '▼' : '▶'}
                  </span>
                </div>

                {expandedActions.has(action.id) && (
                  <div className="plan-action-details">
                    <div className="action-description">{action.description}</div>
                    
                    {action.diff && (
                      <div className="action-diff">
                        {renderDiff(action.diff)}
                      </div>
                    )}

                    <div className="action-controls">
                      {action.status === 'pending' && (
                        <>
                          <button
                            className="btn-approve"
                            onClick={() => onApprove(action.id)}
                          >
                            ✅ Approve
                          </button>
                          <button
                            className="btn-reject"
                            onClick={() => onReject(action.id)}
                          >
                            ❌ Reject
                          </button>
                        </>
                      )}
                      {action.status === 'approved' && (
                        <button
                          className="btn-reject"
                          onClick={() => onReject(action.id)}
                        >
                          Undo Approval
                        </button>
                      )}
                      {action.status === 'rejected' && (
                        <button
                          className="btn-approve"
                          onClick={() => onApprove(action.id)}
                        >
                          Undo Rejection
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="plan-mode-footer">
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onApproveAll}>
              ✅ Approve All
            </button>
            <button className="btn-secondary" onClick={onRejectAll}>
              ❌ Reject All
            </button>
          </div>
          <button
            className="btn-primary"
            onClick={onExecute}
            disabled={approvedCount === 0}
          >
            🚀 Execute Plan ({approvedCount} actions)
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanMode;

