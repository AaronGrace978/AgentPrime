/**
 * AgentMode - Matrix Computer Control
 * Full-screen overlay with Matrix aesthetic for AI-powered system control
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MatrixRain from './MatrixRain';
import AgentChat from './AgentChat';
import ConfirmModal from './ConfirmModal';
import ActionLog from './ActionLog';
import SmartControllerPanel from './SmartControllerPanel';
import MatrixSystemsPanel from './MatrixSystemsPanel';
import { 
  AgentMessage, 
  AgentAction, 
  SafetyMode,
  IntelligenceLevel,
  INTELLIGENCE_LEVEL_CONFIG
} from './types';

interface AgentModeProps {
  isOpen: boolean;
  onClose: () => void;
}

const AgentMode: React.FC<AgentModeProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [allActions, setAllActions] = useState<AgentAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [safetyMode, setSafetyMode] = useState<SafetyMode>('speed');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [intelligenceLevel, setIntelligenceLevel] = useState<IntelligenceLevel>('basic');
  const [currentConfirmAction, setCurrentConfirmAction] = useState<AgentAction | null>(null);
  const [smartControllerOpen, setSmartControllerOpen] = useState(false);
  const [systemsPanelOpen, setSystemsPanelOpen] = useState(false);
  const [appliedEnhancements, setAppliedEnhancements] = useState<number>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const agentModeSessionIdRef = useRef<string | null>(null);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [settingsOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (currentConfirmAction) {
          // Reject current action
          handleRejectAction();
        } else {
          onClose();
        }
      }
      if (e.key === 'Enter' && currentConfirmAction) {
        e.preventDefault();
        handleApproveAction();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, currentConfirmAction, onClose]);

  // State for streaming responses
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Listen for agent mode events from main process
  useEffect(() => {
    if (!isOpen) return;

    const api = (window as any).agentAPI;
    if (!api) return;

    // Listen for action requests
    const handleAction = (data: any) => {
      if (data.type === 'action-request') {
        const action: AgentAction = {
          id: data.actionId || `action-${Date.now()}`,
          action: data.action,
          params: data.params,
          explanation: data.explanation,
          status: 'pending',
          riskLevel: data.riskLevel || 'moderate',
          timestamp: Date.now()
        };

        setAllActions(prev => [...prev, action]);

        // Use the needsConfirm value from backend (already calculated based on safetyMode)
        const needsConfirm = data.needsConfirm;

        if (needsConfirm) {
          setPendingActions(prev => [...prev, action]);
          if (!currentConfirmAction) {
            setCurrentConfirmAction(action);
          }
        }
        // If needsConfirm is false, the backend will auto-execute
        // We just update status when we get the result
      } else if (data.type === 'action-result') {
        setAllActions(prev => prev.map(a => 
          a.id === data.actionId 
            ? { ...a, status: data.success ? 'completed' : 'failed', result: data.result, error: data.error }
            : a
        ));
      } else if (data.type === 'intent-detected') {
        // Fast-path intent detected - show immediate feedback
        console.log(`[AgentMode] Intent detected: ${data.action} (${(data.confidence * 100).toFixed(0)}%)`);
      } else if (data.type === 'action-complete') {
        // Intent detection path completed - show result and clear processing state
        const result = data.result;
        if (result?.success) {
          addMessage('assistant', result.message || result.data || `${data.action} completed`);
        } else {
          addMessage('assistant', `${result?.error || `${data.action} failed`}`);
        }
        setIsProcessing(false);
      } else if (data.type === 'direct-action') {
        // Direct JSON action detected - show feedback
        console.log(`[AgentMode] Direct action: ${data.action}`);
      } else if (data.type === 'response') {
        setIsStreaming(false);
        setStreamingContent('');
        addMessage('assistant', data.content, data.actions);
        setIsProcessing(false);
      } else if (data.type === 'agent-stream-start') {
        setIsStreaming(true);
        setStreamingContent('');
      } else if (data.type === 'agent-stream') {
        if (data.fullText != null) {
          setStreamingContent(data.fullText);
        }
      } else if (data.type === 'web-search-stream') {
        // Handle streaming web search response
        setIsStreaming(true);
        setStreamingContent(data.fullText || '');
      } else if (data.type === 'web-search-answer') {
        // Handle web search answer with sources
        setIsStreaming(false);
        setStreamingContent('');
        
        const metaInfo = [];
        if (data.searchTime) metaInfo.push(`⚡ ${data.searchTime}ms`);
        if (data.fromCache) metaInfo.push('📦 cached');
        
        const metaText = metaInfo.length > 0 ? `\n\n_${metaInfo.join(' • ')}_` : '';
        const sourcesText = data.sources?.length > 0 
          ? `\n\n📚 Sources:\n${data.sources.map((s: any) => `• [${s.title}](${s.url})`).join('\n')}`
          : '';
        addMessage('assistant', data.answer + sourcesText + metaText);
        setIsProcessing(false);
      } else if (data.type === 'smart-mode-enhancements') {
        // Handle smart mode enhancement notifications
        setAppliedEnhancements(data.applied?.length || 0);
        if (data.applied?.length > 0) {
          console.log(`[AgentMode] Smart Mode applied ${data.applied.length} enhancements`);
        }
      } else if (data.type === 'error') {
        setIsStreaming(false);
        setStreamingContent('');
        addMessage('system', `Error: ${data.error}`);
        setIsProcessing(false);
      }
    };

    api.onMatrixAgentEvent?.(handleAction);

    return () => {
      api.removeMatrixAgentEvent?.();
    };
  }, [isOpen, safetyMode, currentConfirmAction]);

  const addMessage = useCallback((role: 'user' | 'assistant' | 'system', content: string, actions?: AgentAction[]) => {
    if (!agentModeSessionIdRef.current) {
      agentModeSessionIdRef.current = `agent-mode-${Date.now()}`;
    }
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      actions
    };
    setMessages(prev => [...prev, message]);
  }, []);

  const handleSendMessage = useCallback(async (message: string) => {
    addMessage('user', message);
    setIsProcessing(true);
    setAppliedEnhancements(0); // Reset for new message

    try {
      const api = (window as any).agentAPI;
      if (api?.matrixAgentExecute) {
        await api.matrixAgentExecute(message, safetyMode, webSearchEnabled, intelligenceLevel);
      } else {
        // Fallback - simulate response for demo
        setTimeout(() => {
          addMessage('assistant', `I would execute: "${message}"\n\nNote: Matrix Agent IPC not connected. This is a preview.`);
          setIsProcessing(false);
        }, 1000);
      }
    } catch (error: any) {
      addMessage('system', `Error: ${error.message}`);
      setIsProcessing(false);
    }
  }, [safetyMode, webSearchEnabled, intelligenceLevel, addMessage]);

  const executeAction = useCallback(async (action: AgentAction) => {
    setAllActions(prev => prev.map(a => 
      a.id === action.id ? { ...a, status: 'executing' } : a
    ));

    try {
      const api = (window as any).agentAPI;
      if (api?.matrixAgentConfirm) {
        await api.matrixAgentConfirm(action.id, true);
      }
    } catch (error: any) {
      setAllActions(prev => prev.map(a => 
        a.id === action.id ? { ...a, status: 'failed', error: error.message } : a
      ));
    }
  }, []);

  const handleApproveAction = useCallback(() => {
    if (!currentConfirmAction) return;

    executeAction(currentConfirmAction);
    
    // Move to next pending action
    const remaining = pendingActions.filter(a => a.id !== currentConfirmAction.id);
    setPendingActions(remaining);
    setCurrentConfirmAction(remaining[0] || null);
  }, [currentConfirmAction, pendingActions, executeAction]);

  const handleRejectAction = useCallback(() => {
    if (!currentConfirmAction) return;

    setAllActions(prev => prev.map(a => 
      a.id === currentConfirmAction.id ? { ...a, status: 'rejected' } : a
    ));

    const api = (window as any).agentAPI;
    api?.matrixAgentConfirm?.(currentConfirmAction.id, false);

    // Move to next pending action
    const remaining = pendingActions.filter(a => a.id !== currentConfirmAction.id);
    setPendingActions(remaining);
    setCurrentConfirmAction(remaining[0] || null);
  }, [currentConfirmAction, pendingActions]);

  const handleRetryAction = useCallback((actionId: string) => {
    const action = allActions.find(a => a.id === actionId);
    if (action) {
      executeAction({ ...action, status: 'pending' });
    }
  }, [allActions, executeAction]);

  if (!isOpen) return null;

  return (
    <div className="agent-mode-overlay">
      {/* Matrix rain background */}
      <MatrixRain opacity={0.12} speed={1.2} />
      
      {/* Scanline overlay */}
      <div className="matrix-scanline" />
      
      {/* Header */}
      <div className="agent-mode-header">
        <div className="header-left">
          <span className="matrix-logo">◉</span>
          <h1>MATRIX AGENT</h1>
          <span className="status-indicator online">● ONLINE</span>
          
          {/* Settings cog button */}
          <div className="settings-menu-container" ref={settingsRef}>
            <button
              className={`settings-cog-btn ${settingsOpen ? 'active' : ''}`}
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
            >
              ⚙
            </button>
            
            {settingsOpen && (
              <div className="settings-dropdown">
                <div className="settings-dropdown-header">
                  <span>CONFIGURATION</span>
                  <button className="settings-close" onClick={() => setSettingsOpen(false)}>×</button>
                </div>
                
                <div className="settings-section">
                  <div className="settings-label">INTELLIGENCE</div>
                  <div className="settings-options intelligence-options">
                    {(['basic', 'smart', 'genius'] as IntelligenceLevel[]).map((level) => (
                      <button
                        key={level}
                        className={`settings-option intelligence-option ${intelligenceLevel === level ? 'active' : ''}`}
                        onClick={() => setIntelligenceLevel(level)}
                        title={INTELLIGENCE_LEVEL_CONFIG[level].description}
                        style={{ 
                          borderColor: intelligenceLevel === level ? INTELLIGENCE_LEVEL_CONFIG[level].color : undefined 
                        }}
                      >
                        <span className="intelligence-icon">{INTELLIGENCE_LEVEL_CONFIG[level].icon}</span>
                        <span className="intelligence-name">{INTELLIGENCE_LEVEL_CONFIG[level].name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="settings-hint">
                    {INTELLIGENCE_LEVEL_CONFIG[intelligenceLevel].description}
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-label">SAFETY MODE</div>
                  <div className="settings-options">
                    <button
                      className={`settings-option ${safetyMode === 'confirm-all' ? 'active' : ''}`}
                      onClick={() => setSafetyMode('confirm-all')}
                      title="Confirm every action"
                    >
                      CONFIRM ALL
                    </button>
                    <button
                      className={`settings-option ${safetyMode === 'smart' ? 'active' : ''}`}
                      onClick={() => setSafetyMode('smart')}
                      title="Confirm risky and moderate actions"
                    >
                      SMART
                    </button>
                    <button
                      className={`settings-option ${safetyMode === 'speed' ? 'active' : ''}`}
                      onClick={() => setSafetyMode('speed')}
                      title="⚡ Only confirm dangerous actions - fastest!"
                    >
                      SPEED ⚡
                    </button>
                  </div>
                </div>
                
                <div className="settings-section">
                  <div className="settings-label">FEATURES</div>
                  <div className="settings-toggles">
                    <div className="settings-toggle-row">
                      <span className="toggle-name">WEB SEARCH</span>
                      <button
                        className={`matrix-toggle ${webSearchEnabled ? 'on' : ''}`}
                        onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                      >
                        {webSearchEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="settings-toggle-row">
                      <span className="toggle-name">SMART CTRL</span>
                      <button
                        className={`matrix-toggle ${smartControllerOpen ? 'on' : ''}`}
                        onClick={() => setSmartControllerOpen(!smartControllerOpen)}
                      >
                        {smartControllerOpen ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="header-right">
          <button 
            className={`systems-panel-toggle ${systemsPanelOpen ? 'active' : ''}`}
            onClick={() => setSystemsPanelOpen(!systemsPanelOpen)}
            title="Matrix Systems"
          >
            ◉ SYSTEMS
          </button>
          <button className="close-btn" onClick={onClose} title="Press ESC to close">
            [X] EXIT
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="agent-mode-content">
        {/* Chat interface */}
        <div className="agent-mode-chat-area">
          <AgentChat
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            pendingActions={pendingActions}
            webSearchEnabled={webSearchEnabled}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
          />
        </div>

        {/* Action log sidebar */}
        {allActions.length > 0 && (
          <div className="agent-mode-sidebar">
            <ActionLog 
              actions={allActions}
              onRetry={handleRetryAction}
            />
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {currentConfirmAction && (
        <ConfirmModal
          action={currentConfirmAction}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          isProcessing={isProcessing}
        />
      )}

      {/* Smart Controller Panel */}
      <SmartControllerPanel 
        isOpen={smartControllerOpen}
        onClose={() => setSmartControllerOpen(false)}
      />

      {/* Matrix Systems Panel */}
      <MatrixSystemsPanel
        isOpen={systemsPanelOpen}
        onClose={() => setSystemsPanelOpen(false)}
      />

      {/* Footer hints */}
      <div className="agent-mode-footer">
        <span className="hint">ESC to close</span>
        <span className="hint">ENTER to send</span>
        <span 
          className="hint intelligence-hint" 
          style={{ color: INTELLIGENCE_LEVEL_CONFIG[intelligenceLevel].color }}
        >
          {INTELLIGENCE_LEVEL_CONFIG[intelligenceLevel].icon} {INTELLIGENCE_LEVEL_CONFIG[intelligenceLevel].name}
        </span>
        <span className="hint">Safety: {safetyMode === 'confirm-all' ? 'Confirm All' : safetyMode === 'speed' ? 'Speed ⚡' : 'Smart'}</span>
        {webSearchEnabled && <span className="hint web-enabled">Web Search: ON</span>}
        {smartControllerOpen && <span className="hint smart-enabled">Smart Ctrl: ON</span>}
        {appliedEnhancements > 0 && (
          <span className="hint enhancements-hint">+{appliedEnhancements} enhancements</span>
        )}
      </div>
    </div>
  );
};

export default AgentMode;
