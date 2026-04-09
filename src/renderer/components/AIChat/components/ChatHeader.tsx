/**
 * ChatHeader - Title bar with agent status and close button
 * Uses CSS variables for theme support
 */

import React from 'react';
import { ChatMode, PythonBrainStatus } from '../types';

interface ChatHeaderProps {
  chatMode: ChatMode;
  pythonBrainStatus: PythonBrainStatus;
  onClose: () => void;
}

const MODE_META: Record<ChatMode, { icon: string; title: string; subtitle: string }> = {
  agent: { icon: 'A', title: 'AgentPrime', subtitle: 'Agent Mode' },
  chat:  { icon: '💬', title: 'AgentPrime', subtitle: 'Just Chat' },
  dino:  { icon: '🦖', title: 'Dino Buddy', subtitle: 'Dino Buddy Mode' },
};

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatMode,
  pythonBrainStatus,
  onClose
}) => {
  const meta = MODE_META[chatMode];

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <div className="chat-header-icon" style={chatMode !== 'agent' ? { fontSize: '16px' } : undefined}>
          {meta.icon}
        </div>
        <div className="chat-header-info">
          <h3 className="chat-header-title">{meta.title}</h3>
          <div className="chat-header-badges">
            <span className="chat-header-subtitle">
              {meta.subtitle}
            </span>
            {chatMode === 'dino' && (
              <span className="badge badge-rawr">Calm</span>
            )}
            {!pythonBrainStatus.enabled ? (
              <span
                title="Desktop-only mode is active. Python Brain is optional and currently disabled."
                className="badge badge-brain-offline"
              >
                Brain Optional
              </span>
            ) : pythonBrainStatus.connected ? (
              <span 
                title={`Python Brain: ${pythonBrainStatus.memories} memories, ${pythonBrainStatus.patterns} patterns`}
                className="badge badge-brain"
              >
                Brain
              </span>
            ) : (
              <span
                title="Python Brain is offline — memory and learning are unavailable"
                className="badge badge-brain-offline"
              >
                Brain Offline
              </span>
            )}
          </div>
        </div>
      </div>
      <button onClick={onClose} className="chat-header-close">
        ×
      </button>
    </div>
  );
};

export default ChatHeader;

