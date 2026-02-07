/**
 * ConfirmModal - Action confirmation popup for Agent Mode
 * Matrix-themed confirmation dialog for approving/rejecting actions
 */

import React from 'react';
import { AgentAction } from './types';

interface ConfirmModalProps {
  action: AgentAction;
  onApprove: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  action,
  onApprove,
  onReject,
  isProcessing = false
}) => {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'safe': return '#00ff41';
      case 'moderate': return '#ffcc00';
      case 'risky': return '#ff4444';
      default: return '#00ff41';
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'open_app': return '📱';
      case 'open_url': return '🌐';
      case 'run_command': return '⚡';
      case 'open_file': return '📁';
      case 'shutdown': return '🔴';
      default: return '🤖';
    }
  };

  const formatParams = (params: Record<string, any>) => {
    return Object.entries(params)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  };

  return (
    <div className="agent-confirm-modal-overlay">
      <div className="agent-confirm-modal">
        <div className="confirm-modal-header">
          <span className="confirm-modal-icon">{getActionIcon(action.action)}</span>
          <h3>Action Confirmation</h3>
          <span 
            className="confirm-modal-risk"
            style={{ color: getRiskColor(action.riskLevel) }}
          >
            [{action.riskLevel.toUpperCase()}]
          </span>
        </div>

        <div className="confirm-modal-body">
          <div className="confirm-action-type">
            <span className="label">ACTION:</span>
            <span className="value">{action.action}</span>
          </div>

          <div className="confirm-action-params">
            <span className="label">PARAMETERS:</span>
            <pre className="value">{formatParams(action.params)}</pre>
          </div>

          <div className="confirm-action-explanation">
            <span className="label">EXPLANATION:</span>
            <p className="value">{action.explanation}</p>
          </div>

          {action.riskLevel === 'risky' && (
            <div className="confirm-warning">
              <span className="warning-icon">⚠️</span>
              <span>This action may have significant effects on your system.</span>
            </div>
          )}
        </div>

        <div className="confirm-modal-actions">
          <button
            className="confirm-btn reject"
            onClick={onReject}
            disabled={isProcessing}
          >
            <span className="key-hint">[ESC]</span> REJECT
          </button>
          <button
            className="confirm-btn approve"
            onClick={onApprove}
            disabled={isProcessing}
          >
            <span className="key-hint">[ENTER]</span> APPROVE
          </button>
        </div>

        <div className="confirm-modal-scanline" />
      </div>
    </div>
  );
};

export default ConfirmModal;
