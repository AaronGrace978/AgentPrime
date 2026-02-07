/**
 * MatrixSystemsPanel - Shows status of all Matrix Mode systems
 * Provides quick access to system controls and real-time status
 */

import React, { useState, useEffect } from 'react';

interface SystemStatus {
  initialized: boolean;
  systems: {
    scheduler: boolean;
    agents: boolean;
    gateway: boolean;
    browser: boolean;
    voice: boolean;
    canvas: boolean;
    integrations: boolean;
    automation: boolean;
    nodes: boolean;
  };
}

interface ChannelInfo {
  id: string;
  type: string;
  status: string;
}

interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  nextRun?: string;
}

interface MatrixSystemsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MatrixSystemsPanel: React.FC<MatrixSystemsPanelProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'messaging' | 'scheduler' | 'integrations' | 'nodes'>('overview');
  const [voiceListening, setVoiceListening] = useState(false);

  // Fetch system status
  const fetchStatus = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeStatus) return;

    try {
      const result = await api.matrixModeStatus();
      setStatus(result);
    } catch (err) {
      console.error('Failed to fetch Matrix Mode status:', err);
    }
  };

  // Fetch channels
  const fetchChannels = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeMessagingGetChannels) return;

    try {
      const result = await api.matrixModeMessagingGetChannels();
      if (result.success) {
        setChannels(result.channels || []);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    }
  };

  // Fetch scheduled tasks
  const fetchTasks = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeSchedulerList) return;

    try {
      const result = await api.matrixModeSchedulerList();
      if (result.success) {
        setTasks(result.tasks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      fetchChannels();
      fetchTasks();
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Initialize Matrix Mode
  const handleInitialize = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeInitialize) return;

    setLoading(true);
    try {
      await api.matrixModeInitialize();
      await fetchStatus();
    } catch (err) {
      console.error('Failed to initialize:', err);
    }
    setLoading(false);
  };

  // Toggle voice listening
  const toggleVoice = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeVoiceStartListening || !api?.matrixModeVoiceStopListening) return;

    try {
      if (voiceListening) {
        await api.matrixModeVoiceStopListening();
      } else {
        await api.matrixModeVoiceStartListening();
      }
      setVoiceListening(!voiceListening);
    } catch (err) {
      console.error('Voice toggle failed:', err);
    }
  };

  // Show canvas
  const showCanvas = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeCanvasShow) return;

    try {
      await api.matrixModeCanvasShow();
    } catch (err) {
      console.error('Canvas show failed:', err);
    }
  };

  // Start browser
  const startBrowser = async () => {
    const api = (window as any).agentAPI;
    if (!api?.matrixModeBrowserStart) return;

    try {
      await api.matrixModeBrowserStart();
      await fetchStatus();
    } catch (err) {
      console.error('Browser start failed:', err);
    }
  };

  if (!isOpen) return null;

  const renderSystemIcon = (active: boolean, label: string) => (
    <div className={`system-indicator ${active ? 'active' : 'inactive'}`} title={label}>
      <span className="indicator-dot">{active ? '●' : '○'}</span>
      <span className="indicator-label">{label}</span>
    </div>
  );

  return (
    <div className="matrix-systems-panel">
      <div className="systems-panel-header">
        <h2>SYSTEMS</h2>
        <button className="panel-close-btn" onClick={onClose}>×</button>
      </div>

      {/* Quick status bar */}
      <div className="systems-quick-status">
        {status?.initialized ? (
          <>
            {renderSystemIcon(status.systems.scheduler, 'SCHED')}
            {renderSystemIcon(status.systems.gateway, 'MSG')}
            {renderSystemIcon(status.systems.browser, 'BROWSER')}
            {renderSystemIcon(status.systems.voice, 'VOICE')}
            {renderSystemIcon(status.systems.canvas, 'CANVAS')}
            {renderSystemIcon(status.systems.integrations, 'INTEG')}
            {renderSystemIcon(status.systems.nodes, 'NODES')}
          </>
        ) : (
          <div className="systems-offline">
            <span>SYSTEMS OFFLINE</span>
            <button 
              className="matrix-btn initialize-btn" 
              onClick={handleInitialize}
              disabled={loading}
            >
              {loading ? 'INITIALIZING...' : 'INITIALIZE'}
            </button>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="systems-tabs">
        <button 
          className={`systems-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          OVERVIEW
        </button>
        <button 
          className={`systems-tab ${activeTab === 'messaging' ? 'active' : ''}`}
          onClick={() => setActiveTab('messaging')}
        >
          MESSAGING
        </button>
        <button 
          className={`systems-tab ${activeTab === 'scheduler' ? 'active' : ''}`}
          onClick={() => setActiveTab('scheduler')}
        >
          SCHEDULER
        </button>
        <button 
          className={`systems-tab ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          INTEGRATIONS
        </button>
        <button 
          className={`systems-tab ${activeTab === 'nodes' ? 'active' : ''}`}
          onClick={() => setActiveTab('nodes')}
        >
          NODES
        </button>
      </div>

      {/* Tab content */}
      <div className="systems-content">
        {activeTab === 'overview' && (
          <div className="overview-content">
            <div className="quick-actions">
              <h3>QUICK ACTIONS</h3>
              <div className="action-grid">
                <button className="matrix-action-btn" onClick={startBrowser}>
                  <span className="action-icon">🌐</span>
                  <span className="action-label">Start Browser</span>
                </button>
                <button className="matrix-action-btn" onClick={showCanvas}>
                  <span className="action-icon">🎨</span>
                  <span className="action-label">Show Canvas</span>
                </button>
                <button 
                  className={`matrix-action-btn ${voiceListening ? 'active' : ''}`} 
                  onClick={toggleVoice}
                >
                  <span className="action-icon">{voiceListening ? '🎤' : '🔇'}</span>
                  <span className="action-label">{voiceListening ? 'Listening...' : 'Start Voice'}</span>
                </button>
                <button className="matrix-action-btn" onClick={fetchStatus}>
                  <span className="action-icon">🔄</span>
                  <span className="action-label">Refresh</span>
                </button>
              </div>
            </div>

            <div className="system-capabilities">
              <h3>CAPABILITIES</h3>
              <div className="capabilities-list">
                <div className="capability-item">
                  <span className="cap-icon">📝</span>
                  <span className="cap-name">Memory</span>
                  <span className="cap-desc">Persistent memory with vector search</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">⏰</span>
                  <span className="cap-name">Scheduler</span>
                  <span className="cap-desc">Cron jobs, webhooks, triggers</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">💬</span>
                  <span className="cap-name">Messaging</span>
                  <span className="cap-desc">WhatsApp, Telegram, Discord, Slack</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">🌐</span>
                  <span className="cap-name">Browser</span>
                  <span className="cap-desc">Playwright automation, AI snapshots</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">🎤</span>
                  <span className="cap-name">Voice</span>
                  <span className="cap-desc">Wake word, speech-to-text, text-to-speech</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">🎨</span>
                  <span className="cap-name">Canvas</span>
                  <span className="cap-desc">Visual workspace, A2UI rendering</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">🔗</span>
                  <span className="cap-name">Integrations</span>
                  <span className="cap-desc">Notion, Spotify, Hue, GitHub, and more</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">⚙️</span>
                  <span className="cap-name">Automation</span>
                  <span className="cap-desc">Workflows with approvals</span>
                </div>
                <div className="capability-item">
                  <span className="cap-icon">📱</span>
                  <span className="cap-name">Nodes</span>
                  <span className="cap-desc">Remote mobile/IoT agents</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'messaging' && (
          <div className="messaging-content">
            <h3>CONNECTED CHANNELS</h3>
            {channels.length === 0 ? (
              <div className="empty-state">
                <p>No channels connected</p>
                <p className="hint">Ask me to "connect WhatsApp" or "set up Telegram"</p>
              </div>
            ) : (
              <div className="channels-list">
                {channels.map(ch => (
                  <div key={ch.id} className={`channel-item ${ch.status}`}>
                    <span className="channel-type">{ch.type.toUpperCase()}</span>
                    <span className="channel-status">{ch.status}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="supported-channels">
              <h4>SUPPORTED</h4>
              <div className="channel-badges">
                <span className="channel-badge whatsapp">WhatsApp</span>
                <span className="channel-badge telegram">Telegram</span>
                <span className="channel-badge discord">Discord</span>
                <span className="channel-badge slack">Slack</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scheduler' && (
          <div className="scheduler-content">
            <h3>SCHEDULED TASKS</h3>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <p>No scheduled tasks</p>
                <p className="hint">Say "remind me every day at 9am to check email"</p>
              </div>
            ) : (
              <div className="tasks-list">
                {tasks.map(task => (
                  <div key={task.id} className={`task-item ${task.enabled ? 'enabled' : 'disabled'}`}>
                    <span className="task-name">{task.name}</span>
                    <span className="task-status">{task.enabled ? 'ACTIVE' : 'PAUSED'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="integrations-content">
            <h3>AVAILABLE INTEGRATIONS</h3>
            <div className="integrations-grid">
              <div className="integration-card">
                <span className="int-icon">🎵</span>
                <span className="int-name">Spotify</span>
                <span className="int-status">Ready</span>
              </div>
              <div className="integration-card">
                <span className="int-icon">📝</span>
                <span className="int-name">Notion</span>
                <span className="int-status">Ready</span>
              </div>
              <div className="integration-card">
                <span className="int-icon">💡</span>
                <span className="int-name">Philips Hue</span>
                <span className="int-status">Ready</span>
              </div>
              <div className="integration-card">
                <span className="int-icon">🐙</span>
                <span className="int-name">GitHub</span>
                <span className="int-status">Ready</span>
              </div>
            </div>
            <p className="hint">Ask me to "connect Spotify" to enable</p>
          </div>
        )}

        {activeTab === 'nodes' && (
          <div className="nodes-content">
            <h3>REMOTE NODES</h3>
            <div className="empty-state">
              <p>No nodes connected</p>
              <p className="hint">Ask me to "pair my phone" to connect a mobile device</p>
            </div>
            <div className="node-capabilities">
              <h4>NODE CAPABILITIES</h4>
              <ul>
                <li>📷 Camera capture</li>
                <li>📍 Location access</li>
                <li>🔔 Push notifications</li>
                <li>🖥️ Screen capture</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatrixSystemsPanel;
