import React, { useState, useEffect } from 'react';

interface StatusBarProps {
  currentFile?: {
    name: string;
    path: string;
    language: string;
    lines: number;
  } | null;
  gitBranch?: string | null;
  theme: 'light' | 'dark';
}

interface AIStatus {
  provider: string;
  model: string;
  connected: boolean;
  dualModelEnabled: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({ currentFile, gitBranch, theme }) => {
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    provider: 'openai',
    model: 'loading...',
    connected: false,
    dualModelEnabled: false
  });
  const [time, setTime] = useState(new Date());

  // Load AI status from settings
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        const activeProvider = settings?.activeProvider || 'openai';
        const providerStatus = await window.agentAPI.testProvider(activeProvider);

        setAiStatus({
          provider: activeProvider,
          model: settings?.activeModel || 'gpt-4o',
          connected: providerStatus?.success || false,
          dualModelEnabled: settings?.dualModelEnabled || false
        });
      } catch (error) {
        console.error('Failed to load status:', error);
        setAiStatus(prev => ({ ...prev, connected: false }));
      }
    };

    loadStatus();

    // Refresh status every 30 seconds
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

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
          className={`status-item connection ${aiStatus.connected ? 'connected' : 'disconnected'}`}
          title={aiStatus.connected ? 'AI Connected' : 'AI Disconnected'}
        >
          <span className="status-dot"></span>
          <span className="status-text">{aiStatus.provider}</span>
        </div>

        {/* Current Model */}
        <div className="status-item model" title={`Model: ${aiStatus.model}`}>
          <span className="status-icon">AI</span>
          <span className="status-text">{formatModel(aiStatus.model)}</span>
          {aiStatus.dualModelEnabled && (
            <span className="dual-badge" title="Dual Model System Active">Dual</span>
          )}
        </div>
      </div>

      {/* Center Section - Notifications would go here */}
      <div className="status-bar-center">
        {/* Reserved for notifications */}
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

