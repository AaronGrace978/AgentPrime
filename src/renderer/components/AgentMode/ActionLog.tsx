/**
 * ActionLog - Real-time action history display
 * Shows what the agent is doing with status indicators
 */

import React from 'react';
import { AgentAction } from './types';

interface ActionLogProps {
  actions: AgentAction[];
  onRetry?: (actionId: string) => void;
}

const ActionLog: React.FC<ActionLogProps> = ({ actions, onRetry }) => {
  if (actions.length === 0) {
    return null;
  }

  const getStatusIcon = (status: AgentAction['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✓';
      case 'rejected': return '✗';
      case 'executing': return '⚡';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '•';
    }
  };

  const getStatusClass = (status: AgentAction['status']) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'approved': return 'status-approved';
      case 'rejected': return 'status-rejected';
      case 'executing': return 'status-executing';
      case 'completed': return 'status-completed';
      case 'failed': return 'status-failed';
      default: return '';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="agent-action-log">
      <div className="action-log-header">
        <span className="log-title">[ ACTION LOG ]</span>
        <span className="log-count">{actions.length} actions</span>
      </div>

      <div className="action-log-list">
        {actions.map((action, index) => (
          <div 
            key={action.id} 
            className={`action-log-item ${getStatusClass(action.status)}`}
          >
            <span className="action-index">[{String(index + 1).padStart(2, '0')}]</span>
            <span className="action-time">{formatTime(action.timestamp)}</span>
            <span className="action-status-icon">{getStatusIcon(action.status)}</span>
            <span className="action-type">{action.action}</span>
            <span className="action-desc">{action.explanation}</span>
            
            {action.status === 'completed' && action.result && (
              <span className="action-result">→ {action.result}</span>
            )}
            
            {action.status === 'failed' && (
              <div className="action-error">
                <span className="error-msg">{action.error || 'Unknown error'}</span>
                {onRetry && (
                  <button 
                    className="retry-btn"
                    onClick={() => onRetry(action.id)}
                  >
                    RETRY
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActionLog;
