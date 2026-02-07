import React, { useState } from 'react';
import {
  IconSuccess,
  IconError,
  IconWarning,
  IconInfo,
  IconTrash,
  IconStop,
  IconTerminal,
  IconChevronDown,
  IconChevronRight
} from './Icons';

interface OutputMessage {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: Date;
}

interface OutputPanelProps {
  output: OutputMessage[];
  onClear: () => void;
  isRunning?: boolean;
  onStop?: () => void;
}

const OutputPanel: React.FC<OutputPanelProps> = ({
  output,
  onClear,
  isRunning = false,
  onStop
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'success': return <IconSuccess size="sm" className="text-success" />;
      case 'error': return <IconError size="sm" className="text-error" />;
      case 'warning': return <IconWarning size="sm" className="text-warning" />;
      case 'info': return <IconInfo size="sm" className="text-info" />;
      default: return <IconInfo size="sm" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  return (
    <div className={`output-panel ${isExpanded ? 'expanded' : ''}`}>
      <div className="output-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="output-icon"><IconTerminal size="sm" /></span>
        <span className="output-title">
          Output ({output.length})
          {isRunning && <span className="running-indicator"> ● Running</span>}
        </span>
        <span className="output-toggle">
          {isExpanded ? <IconChevronDown size="sm" /> : <IconChevronRight size="sm" />}
        </span>
      </div>

      {isExpanded && (
        <div className="output-panel-content">
          <div className="output-panel-actions">
            <button onClick={onClear} disabled={output.length === 0} className="icon-btn">
              <IconTrash size="sm" /> Clear
            </button>
            {isRunning && onStop && (
              <button onClick={onStop} className="stop-button icon-btn">
                <IconStop size="sm" /> Stop
              </button>
            )}
          </div>

          <div className="output-messages">
            {output.length === 0 ? (
              <div className="output-empty">
                No output messages
              </div>
            ) : (
              output.map((msg, index) => (
                <div key={index} className={`output-message ${msg.type}`}>
                  <span className="message-icon">{getMessageIcon(msg.type)}</span>
                  <span className="message-text">{msg.message}</span>
                  <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutputPanel;
