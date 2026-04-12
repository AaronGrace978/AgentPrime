import React, { useEffect, useState } from 'react';
import type { SystemStatusSummary } from '../../types/system-health';

interface StatusBarProps {
  currentFile?: {
    name: string;
    path: string;
    language: string;
    lines: number;
  } | null;
  gitBranch?: string | null;
  theme: 'light' | 'dark';
  systemStatus?: SystemStatusSummary | null;
  onOpenSystemStatus?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({ currentFile, gitBranch, theme, systemStatus, onOpenSystemStatus }) => {
  const [time, setTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const getLanguageIcon = (lang: string) => {
    const icons: Record<string, string> = {
      typescript: 'TS',
      javascript: 'JS',
      python: 'PY',
      rust: 'RS',
      go: 'GO',
      java: 'JV',
      html: 'HT',
      css: 'CS',
      json: 'JSN',
      markdown: 'MD',
      default: 'TXT'
    };
    return icons[lang.toLowerCase()] || icons.default;
  };

  const formatModel = (model: string) => {
    // Shorten long model names
    if (model.length > 20) {
      return model.split(':')[0].slice(0, 18) + '...';
    }
    return model;
  };

  const ai = systemStatus?.ai;
  const brain = systemStatus?.brain;
  const startup = systemStatus?.startup;
  const aiConnectionDetails = ai?.connectionError || ai?.reason || (ai?.connected ? 'AI Connected' : 'AI Disconnected');
  const modelDetails = [
    `Model: ${ai?.model || 'loading...'}`,
    ai?.availableModels !== undefined ? `Provider reported ${ai.availableModels} model${ai.availableModels === 1 ? '' : 's'}` : null,
    ai?.connectionError || ai?.reason || null,
  ].filter(Boolean).join('\n');
  const doctorLabel = startup
    ? startup.warningCount > 0
      ? `${startup.warningCount} warning${startup.warningCount === 1 ? '' : 's'}`
      : startup.infoCount > 0
        ? `${startup.infoCount} note${startup.infoCount === 1 ? '' : 's'}`
        : 'Healthy'
    : 'Checking';

  return (
    <div className="status-bar" data-theme={theme}>
      {/* Left Section */}
      <div className="status-bar-left">
        {/* Git Branch */}
        {gitBranch && (
          <div className="status-item git-branch" title={`Git branch: ${gitBranch}`}>
            <span className="status-icon">BR</span>
            <span className="status-text">{gitBranch}</span>
          </div>
        )}

        {/* Connection Status */}
        <div 
          className={`status-item connection ${ai?.connected ? 'connected' : 'disconnected'}`}
          title={aiConnectionDetails}
        >
          <span className="status-dot"></span>
          <span className="status-text">{ai?.provider || 'AI'}</span>
        </div>

        {/* Current Model */}
        <div className="status-item model" title={modelDetails}>
          <span className="status-icon">AI</span>
          <span className="status-text">{formatModel(ai?.model || 'loading...')}</span>
        </div>
      </div>

      <div className="status-bar-center">
        <button
          type="button"
          onClick={onOpenSystemStatus}
          className="status-item"
          title={brain?.enabled
            ? `Python Brain is ${brain.connected ? 'connected' : 'offline'}`
            : 'Desktop-only mode active. Python Brain is optional and disabled by default.'}
          style={{
            border: '1px solid var(--prime-border)',
            background: 'transparent',
            color: 'var(--prime-text-secondary)',
            cursor: onOpenSystemStatus ? 'pointer' : 'default',
          }}
        >
          <span className="status-icon">{brain?.enabled ? 'BR' : 'PC'}</span>
          <span className="status-text">
            {brain?.enabled ? (brain.connected ? 'Brain On' : 'Brain Off') : 'Desktop Only'}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSystemStatus}
          className="status-item"
          title={startup ? `${startup.warningCount} warning(s), ${startup.infoCount} info message(s)` : 'Open system status'}
          style={{
            border: '1px solid var(--prime-border)',
            background: 'transparent',
            color: 'var(--prime-text-secondary)',
            cursor: onOpenSystemStatus ? 'pointer' : 'default',
          }}
        >
          <span className="status-icon">DR</span>
          <span className="status-text">{doctorLabel}</span>
        </button>
      </div>

      {/* Right Section */}
      <div className="status-bar-right">
        {/* File Info */}
        {currentFile && (
          <>
            <div className="status-item language" title={`Language: ${currentFile.language}`}>
              <span className="status-icon">{getLanguageIcon(currentFile.language)}</span>
              <span className="status-text">{currentFile.language}</span>
            </div>
            <div className="status-item lines" title="Lines of code">
              <span className="status-icon">LOC</span>
              <span className="status-text">{currentFile.lines} lines</span>
            </div>
          </>
        )}

        {/* Shortcuts hint */}
        <div className="status-item shortcuts" title="Keyboard Shortcuts">
          <span className="status-text kbd">Ctrl+K</span>
        </div>

        {/* Time */}
        <div className="status-item time">
          <span className="status-text">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;

