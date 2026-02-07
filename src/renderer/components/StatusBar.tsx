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

interface Phase2Status {
  collaborationUsers: number;
  pluginsInstalled: number;
  memoryUsage: number;
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  systemHealth: 'healthy' | 'warning' | 'critical';
}

const StatusBar: React.FC<StatusBarProps> = ({ currentFile, gitBranch, theme }) => {
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    provider: 'ollama',
    model: 'loading...',
    connected: false,
    dualModelEnabled: false
  });
  const [phase2Status, setPhase2Status] = useState<Phase2Status>({
    collaborationUsers: 0,
    pluginsInstalled: 0,
    memoryUsage: 0,
    syncStatus: 'offline',
    systemHealth: 'healthy'
  });
  const [time, setTime] = useState(new Date());

  // Load AI and Phase 2 status from settings
  useEffect(() => {
    const loadStatus = async () => {
      try {
        // Load AI status
        const settings = await window.agentAPI.getSettings();
        const providerStatus = await window.agentAPI.testProvider(settings?.activeProvider || 'anthropic');

        setAiStatus({
          provider: settings?.activeProvider || 'anthropic',
          model: settings?.activeModel || 'claude-sonnet-4-20250514',
          connected: providerStatus?.success || false,
          dualModelEnabled: settings?.dualModelEnabled || false
        });

        // Load Phase 2 status (minimal implementation for now)
        // In full implementation, these would call actual backend APIs
        setPhase2Status({
          collaborationUsers: 1, // Current user
          pluginsInstalled: 0, // Would call plugin API
          memoryUsage: Math.floor(Math.random() * 30 + 20), // Mock 20-50%
          syncStatus: Math.random() > 0.8 ? 'syncing' : 'synced', // Mostly synced
          systemHealth: Math.random() > 0.9 ? 'warning' : 'healthy' // Mostly healthy
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
      typescript: '🔷',
      javascript: '🟨',
      python: '🐍',
      rust: '🦀',
      go: '🐹',
      java: '☕',
      html: '🌐',
      css: '🎨',
      json: '📋',
      markdown: '📝',
      default: '📄'
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
            <span className="status-icon">🌿</span>
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
          <span className="status-icon">🤖</span>
          <span className="status-text">{formatModel(aiStatus.model)}</span>
          {aiStatus.dualModelEnabled && (
            <span className="dual-badge" title="Dual Model System Active">⚡🧠</span>
          )}
        </div>

        {/* Phase 2 Status Indicators - Minimal & Subtle */}
        {phase2Status.collaborationUsers > 0 && (
          <div className="status-item collaboration" title={`${phase2Status.collaborationUsers} user(s) online`}>
            <span className="status-icon">👥</span>
            <span className="status-text">{phase2Status.collaborationUsers}</span>
          </div>
        )}

        {phase2Status.pluginsInstalled > 0 && (
          <div className="status-item plugins" title={`${phase2Status.pluginsInstalled} plugins installed`}>
            <span className="status-icon">🔌</span>
            <span className="status-text">{phase2Status.pluginsInstalled}</span>
          </div>
        )}

        <div
          className={`status-item memory ${phase2Status.memoryUsage > 80 ? 'warning' : ''}`}
          title={`Memory: ${phase2Status.memoryUsage}%`}
        >
          <span className="status-icon">🧠</span>
          <span className="status-text">{phase2Status.memoryUsage}%</span>
        </div>

        <div
          className={`status-item sync ${phase2Status.syncStatus}`}
          title={`Sync: ${phase2Status.syncStatus}`}
        >
          <span className={`status-icon ${phase2Status.syncStatus === 'syncing' ? 'spinning' : ''}`}>
            {phase2Status.syncStatus === 'syncing' ? '🔄' :
             phase2Status.syncStatus === 'error' ? '❌' : '✅'}
          </span>
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
              <span className="status-icon">📊</span>
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

