/**
 * Smart Controller Panel
 * UI for AI-powered full PC automation
 * 
 * Features:
 * - Screen capture preview
 * - Mouse/keyboard control status
 * - Credential vault access
 * - Task management
 * - Emergency stop button
 */

import React, { useState, useEffect, useCallback } from 'react';

interface ControllerStatus {
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId: string | null;
  taskCount: number;
  vaultUnlocked: boolean;
}

interface ScreenCapture {
  base64?: string;
  width: number;
  height: number;
  timestamp: number;
}

interface VaultCredential {
  id: string;
  name: string;
  username?: string;
  url?: string;
  category?: string;
  lastUsed?: number;
}

interface SmartControllerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SmartControllerPanel: React.FC<SmartControllerPanelProps> = ({ isOpen, onClose }) => {
  // Controller state
  const [status, setStatus] = useState<ControllerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Screen capture state
  const [lastCapture, setLastCapture] = useState<ScreenCapture | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  // Vault state
  const [vaultPassword, setVaultPassword] = useState('');
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [showVaultModal, setShowVaultModal] = useState(false);
  
  // New credential form
  const [newCredential, setNewCredential] = useState({
    name: '',
    username: '',
    password: '',
    url: '',
    category: ''
  });
  
  // Mouse position
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'control' | 'vault' | 'tasks'>('control');

  const api = (window as any).agentAPI;

  // Load status on mount
  useEffect(() => {
    if (!isOpen) return;
    
    const loadStatus = async () => {
      try {
        const result = await api?.smartController?.getStatus();
        if (result?.success) {
          setStatus(result.status);
        }
        
        const vaultResult = await api?.vault?.status();
        if (vaultResult) {
          setStatus(prev => prev ? { ...prev, vaultUnlocked: vaultResult.unlocked } : null);
        }
      } catch (err: any) {
        console.error('Failed to load status:', err);
      }
    };
    
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    
    return () => clearInterval(interval);
  }, [isOpen]);

  // Load credentials when vault is unlocked
  useEffect(() => {
    if (status?.vaultUnlocked) {
      loadCredentials();
    }
  }, [status?.vaultUnlocked]);

  const loadCredentials = async () => {
    try {
      const result = await api?.vault?.listCredentials();
      if (result?.success) {
        setCredentials(result.credentials);
      }
    } catch (err: any) {
      console.error('Failed to load credentials:', err);
    }
  };

  // Screen capture
  const captureScreen = async () => {
    setIsCapturing(true);
    try {
      const result = await api?.smartController?.captureScreen('medium');
      if (result?.success) {
        setLastCapture(result.capture);
      }
    } catch (err: any) {
      setError(`Capture failed: ${err.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  // Get mouse position
  const getMousePosition = async () => {
    try {
      const result = await api?.smartController?.mousePosition();
      if (result?.success) {
        setMousePos(result.position);
      }
    } catch (err: any) {
      console.error('Failed to get mouse position:', err);
    }
  };

  // Vault operations
  const unlockVault = async () => {
    if (!vaultPassword) return;
    
    setIsLoading(true);
    try {
      let result;
      const statusResult = await api?.vault?.status();
      
      if (!statusResult?.exists) {
        // Create new vault
        result = await api?.vault?.create(vaultPassword);
      } else {
        // Unlock existing vault
        result = await api?.vault?.unlock(vaultPassword);
      }
      
      if (result?.success) {
        setStatus(prev => prev ? { ...prev, vaultUnlocked: true } : null);
        setVaultPassword('');
        setShowVaultModal(false);
        loadCredentials();
      } else {
        setError(result?.message || 'Failed to unlock vault');
      }
    } catch (err: any) {
      setError(`Vault error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const lockVault = async () => {
    try {
      await api?.vault?.lock();
      setStatus(prev => prev ? { ...prev, vaultUnlocked: false } : null);
      setCredentials([]);
    } catch (err: any) {
      setError(`Failed to lock vault: ${err.message}`);
    }
  };

  const saveCredential = async () => {
    if (!newCredential.name) return;
    
    setIsLoading(true);
    try {
      const result = await api?.vault?.saveCredential(newCredential);
      if (result?.success) {
        setNewCredential({ name: '', username: '', password: '', url: '', category: '' });
        loadCredentials();
      } else {
        setError(result?.message || 'Failed to save credential');
      }
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCredential = async (id: string) => {
    try {
      const result = await api?.vault?.deleteCredential(id);
      if (result?.success) {
        loadCredentials();
      }
    } catch (err: any) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  // Emergency stop
  const emergencyStop = async () => {
    try {
      await api?.smartController?.emergencyStop();
      setStatus(prev => prev ? { ...prev, isRunning: false, isPaused: false } : null);
    } catch (err: any) {
      setError(`Emergency stop failed: ${err.message}`);
    }
  };

  // Quick actions
  const quickClick = async () => {
    try {
      await api?.smartController?.mouseClick();
    } catch (err: any) {
      setError(`Click failed: ${err.message}`);
    }
  };

  const typeText = async () => {
    const text = prompt('Enter text to type:');
    if (text) {
      try {
        await api?.smartController?.typeText(text);
      } catch (err: any) {
        setError(`Type failed: ${err.message}`);
      }
    }
  };

  const pressHotkey = async () => {
    const keys = prompt('Enter hotkey (e.g., "ctrl,c" or "alt,f4"):');
    if (keys) {
      try {
        await api?.smartController?.hotkey(...keys.split(',').map(k => k.trim()));
      } catch (err: any) {
        setError(`Hotkey failed: ${err.message}`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="smart-controller-panel">
      {/* Header */}
      <div className="sc-header">
        <div className="sc-title">
          <span className="sc-icon">[X]</span>
          <h2>SMART CONTROLLER</h2>
          {status?.isRunning && <span className="sc-status running">● RUNNING</span>}
          {status?.isPaused && <span className="sc-status paused">● PAUSED</span>}
        </div>
        
        <div className="sc-header-actions">
          {/* Emergency Stop Button */}
          <button 
            className="sc-emergency-btn" 
            onClick={emergencyStop}
            title="Emergency Stop (Ctrl+Shift+Escape)"
          >
            ○ STOP
          </button>
          <button className="sc-close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="sc-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="sc-tabs">
        <button 
          className={`sc-tab ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          [] Control
        </button>
        <button 
          className={`sc-tab ${activeTab === 'vault' ? 'active' : ''}`}
          onClick={() => setActiveTab('vault')}
        >
          {status?.vaultUnlocked ? '◇' : '◆'} Vault {status?.vaultUnlocked ? '(Unlocked)' : '(Locked)'}
        </button>
        <button 
          className={`sc-tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          [] Tasks {status?.taskCount ? `(${status.taskCount})` : ''}
        </button>
      </div>

      {/* Control Tab */}
      {activeTab === 'control' && (
        <div className="sc-content">
          {/* Screen Preview */}
          <div className="sc-section">
            <h3>◉ Screen Preview</h3>
            <div className="sc-screen-preview">
              {lastCapture?.base64 ? (
                <img 
                  src={`data:image/png;base64,${lastCapture.base64}`} 
                  alt="Screen capture"
                  style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }}
                />
              ) : (
                <div className="sc-no-capture">No capture yet</div>
              )}
            </div>
            <div className="sc-actions">
              <button onClick={captureScreen} disabled={isCapturing}>
                {isCapturing ? '[...] Capturing...' : '[::] Capture Screen'}
              </button>
              <button onClick={getMousePosition}>
                + Get Mouse Position
              </button>
            </div>
            {mousePos && (
              <div className="sc-mouse-pos">
                Mouse: ({mousePos.x}, {mousePos.y})
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="sc-section">
            <h3>/ Quick Actions</h3>
            <div className="sc-quick-actions">
              <button onClick={quickClick}>[] Click</button>
              <button onClick={typeText}>[=] Type Text</button>
              <button onClick={pressHotkey}>[#] Hotkey</button>
              <button onClick={() => api?.smartController?.scroll('down', 3)}>[v] Scroll Down</button>
              <button onClick={() => api?.smartController?.scroll('up', 3)}>[^] Scroll Up</button>
            </div>
          </div>

          {/* Status */}
          <div className="sc-section">
            <h3>[#] Status</h3>
            <div className="sc-status-grid">
              <div className="sc-status-item">
                <span className="label">Running:</span>
                <span className={`value ${status?.isRunning ? 'yes' : 'no'}`}>
                  {status?.isRunning ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="sc-status-item">
                <span className="label">Vault:</span>
                <span className={`value ${status?.vaultUnlocked ? 'yes' : 'no'}`}>
                  {status?.vaultUnlocked ? 'Unlocked' : 'Locked'}
                </span>
              </div>
              <div className="sc-status-item">
                <span className="label">Tasks:</span>
                <span className="value">{status?.taskCount || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vault Tab */}
      {activeTab === 'vault' && (
        <div className="sc-content">
          {!status?.vaultUnlocked ? (
            <div className="sc-vault-unlock">
              <h3>◆ Unlock Credential Vault</h3>
              <p>Enter your master password to access saved credentials.</p>
              <input
                type="password"
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
                placeholder="Master password..."
                onKeyDown={(e) => e.key === 'Enter' && unlockVault()}
              />
              <button onClick={unlockVault} disabled={isLoading || !vaultPassword}>
                {isLoading ? 'Unlocking...' : 'Unlock Vault'}
              </button>
            </div>
          ) : (
            <div className="sc-vault-content">
              <div className="sc-vault-header">
                <h3>◇ Credentials ({credentials.length})</h3>
                <button onClick={lockVault} className="sc-lock-btn">[X] Lock</button>
              </div>

              {/* Credential List */}
              <div className="sc-credential-list">
                {credentials.length === 0 ? (
                  <p className="sc-no-creds">No credentials saved yet.</p>
                ) : (
                  credentials.map(cred => (
                    <div key={cred.id} className="sc-credential-item">
                      <div className="sc-cred-info">
                        <span className="sc-cred-name">{cred.name}</span>
                        {cred.username && <span className="sc-cred-user">@{cred.username}</span>}
                        {cred.url && <span className="sc-cred-url">{cred.url}</span>}
                      </div>
                      <div className="sc-cred-actions">
                        <button 
                          onClick={() => api?.vault?.autoFill(cred.url || '')}
                          disabled={!cred.url}
                          title="Auto-fill in focused window"
                        >
                          [{'>'} ] Fill
                        </button>
                        <button 
                          onClick={() => deleteCredential(cred.id)}
                          className="danger"
                          title="Delete credential"
                        >
                          [x]
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Credential */}
              <div className="sc-add-credential">
                <h4>[+] Add New Credential</h4>
                <div className="sc-cred-form">
                  <input
                    type="text"
                    placeholder="Name (e.g., GitHub)"
                    value={newCredential.name}
                    onChange={(e) => setNewCredential(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="Username/Email"
                    value={newCredential.username}
                    onChange={(e) => setNewCredential(prev => ({ ...prev, username: e.target.value }))}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newCredential.password}
                    onChange={(e) => setNewCredential(prev => ({ ...prev, password: e.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="URL (optional)"
                    value={newCredential.url}
                    onChange={(e) => setNewCredential(prev => ({ ...prev, url: e.target.value }))}
                  />
                  <button 
                    onClick={saveCredential} 
                    disabled={isLoading || !newCredential.name}
                  >
                    {isLoading ? 'Saving...' : '[*] Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="sc-content">
          <div className="sc-section">
            <h3>[] Automation Tasks</h3>
            <p className="sc-tasks-info">
              Create and run automation tasks using natural language or step-by-step definitions.
            </p>
            
            <div className="sc-task-create">
              <textarea
                placeholder="Describe what you want to automate...&#10;e.g., 'Open Chrome, go to GitHub, and search for React tutorials'"
                rows={3}
              />
              <button className="sc-create-task-btn">
                [{'>>'}] Create & Run Task
              </button>
            </div>

            <div className="sc-task-list">
              <p className="sc-no-tasks">No tasks yet. Create one above!</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sc-footer">
        <span className="sc-hint">ESC to close</span>
        <span className="sc-hint">Ctrl+Shift+Escape for emergency stop</span>
      </div>

      {/* Styles */}
      <style>{`
        .smart-controller-panel {
          position: fixed;
          right: 0;
          top: 34px;
          bottom: 0;
          width: 400px;
          background: linear-gradient(135deg, #0a0f0a 0%, #0d140d 100%);
          border-left: 1px solid #00ff0033;
          display: flex;
          flex-direction: column;
          z-index: 1000;
          font-family: 'Fira Code', monospace;
          color: #00ff00;
          box-shadow: -5px 0 20px rgba(0, 255, 0, 0.1);
        }

        .sc-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(0, 255, 0, 0.05);
          border-bottom: 1px solid #00ff0033;
          min-height: 44px;
        }

        .sc-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sc-title h2 {
          margin: 0;
          font-size: 14px;
          letter-spacing: 2px;
        }

        .sc-icon {
          font-size: 18px;
        }

        .sc-status {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .sc-status.running {
          color: #00ff00;
          animation: pulse 1s infinite;
        }

        .sc-status.paused {
          color: #ffff00;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .sc-header-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
        }

        .sc-emergency-btn {
          background: linear-gradient(135deg, #ff0000, #cc0000);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          font-size: 12px;
          animation: emergency-glow 1s infinite;
          height: 32px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        @keyframes emergency-glow {
          0%, 100% { box-shadow: 0 0 5px #ff0000; }
          50% { box-shadow: 0 0 15px #ff0000; }
        }

        .sc-close-btn {
          background: transparent;
          border: 1px solid #00ff0044;
          color: #00ff00;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: bold;
          flex-shrink: 0;
        }

        .sc-close-btn:hover {
          background: rgba(255, 0, 0, 0.2);
          border-color: #ff0000;
          color: #ff0000;
        }

        .sc-error {
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid #ff000066;
          color: #ff6666;
          padding: 8px 12px;
          margin: 8px;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .sc-tabs {
          display: flex;
          border-bottom: 1px solid #00ff0033;
        }

        .sc-tab {
          flex: 1;
          background: transparent;
          border: none;
          color: #00ff0088;
          padding: 10px;
          cursor: pointer;
          font-size: 12px;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .sc-tab:hover {
          color: #00ff00cc;
          background: rgba(0, 255, 0, 0.05);
        }

        .sc-tab.active {
          color: #00ff00;
          border-bottom-color: #00ff00;
          background: rgba(0, 255, 0, 0.1);
        }

        .sc-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .sc-section {
          margin-bottom: 20px;
        }

        .sc-section h3 {
          margin: 0 0 12px 0;
          font-size: 13px;
          color: #00ff00cc;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sc-screen-preview {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #00ff0033;
          border-radius: 4px;
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }

        .sc-no-capture {
          color: #00ff0066;
          font-size: 12px;
        }

        .sc-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .sc-actions button,
        .sc-quick-actions button {
          background: rgba(0, 255, 0, 0.1);
          border: 1px solid #00ff0044;
          color: #00ff00;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
        }

        .sc-actions button:hover,
        .sc-quick-actions button:hover {
          background: rgba(0, 255, 0, 0.2);
          border-color: #00ff00;
        }

        .sc-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sc-mouse-pos {
          margin-top: 8px;
          font-size: 11px;
          color: #00ff0088;
          font-family: monospace;
        }

        .sc-quick-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .sc-status-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .sc-status-item {
          background: rgba(0, 0, 0, 0.3);
          padding: 8px;
          border-radius: 4px;
          text-align: center;
        }

        .sc-status-item .label {
          display: block;
          font-size: 10px;
          color: #00ff0066;
          margin-bottom: 4px;
        }

        .sc-status-item .value {
          font-size: 12px;
          font-weight: bold;
        }

        .sc-status-item .value.yes {
          color: #00ff00;
        }

        .sc-status-item .value.no {
          color: #ff6666;
        }

        /* Vault styles */
        .sc-vault-unlock {
          text-align: center;
          padding: 20px;
        }

        .sc-vault-unlock h3 {
          justify-content: center;
        }

        .sc-vault-unlock p {
          color: #00ff0088;
          font-size: 12px;
          margin-bottom: 16px;
        }

        .sc-vault-unlock input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #00ff0044;
          color: #00ff00;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .sc-vault-unlock button {
          background: linear-gradient(135deg, #00ff0033, #00aa0033);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 10px 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .sc-vault-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .sc-lock-btn {
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid #ff000066;
          color: #ff6666;
          padding: 4px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }

        .sc-credential-list {
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 16px;
        }

        .sc-no-creds {
          color: #00ff0066;
          font-size: 12px;
          text-align: center;
          padding: 20px;
        }

        .sc-credential-item {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #00ff0022;
          border-radius: 4px;
          padding: 10px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sc-cred-info {
          flex: 1;
        }

        .sc-cred-name {
          display: block;
          font-weight: bold;
          font-size: 12px;
        }

        .sc-cred-user {
          display: block;
          font-size: 10px;
          color: #00ff0088;
        }

        .sc-cred-url {
          display: block;
          font-size: 10px;
          color: #00ff0066;
        }

        .sc-cred-actions {
          display: flex;
          gap: 4px;
        }

        .sc-cred-actions button {
          background: transparent;
          border: 1px solid #00ff0044;
          color: #00ff00;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }

        .sc-cred-actions button.danger {
          border-color: #ff000066;
          color: #ff6666;
        }

        .sc-add-credential h4 {
          font-size: 12px;
          color: #00ff00cc;
          margin: 0 0 12px 0;
        }

        .sc-cred-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sc-cred-form input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #00ff0044;
          color: #00ff00;
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .sc-cred-form button {
          background: linear-gradient(135deg, #00ff0033, #00aa0033);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
        }

        /* Tasks styles */
        .sc-tasks-info {
          color: #00ff0088;
          font-size: 12px;
          margin-bottom: 16px;
        }

        .sc-task-create textarea {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #00ff0044;
          color: #00ff00;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 12px;
          resize: none;
          font-family: inherit;
        }

        .sc-create-task-btn {
          width: 100%;
          background: linear-gradient(135deg, #00ff0033, #00aa0033);
          border: 1px solid #00ff00;
          color: #00ff00;
          padding: 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .sc-no-tasks {
          color: #00ff0066;
          font-size: 12px;
          text-align: center;
          padding: 20px;
        }

        .sc-footer {
          padding: 8px 16px;
          border-top: 1px solid #00ff0033;
          display: flex;
          justify-content: space-between;
        }

        .sc-hint {
          font-size: 10px;
          color: #00ff0066;
        }
      `}</style>
    </div>
  );
};

export default SmartControllerPanel;
