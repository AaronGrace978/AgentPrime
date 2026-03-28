/**
 * ChatHeader - Title bar with agent status and close button
 * Uses CSS variables for theme support
 */

import React from 'react';
import { PythonBrainStatus } from '../types';

interface ChatHeaderProps {
  dinoBuddyMode: boolean;
  pythonBrainStatus: PythonBrainStatus;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  dinoBuddyMode,
  pythonBrainStatus,
  onClose
}) => {
  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <div className="chat-header-icon">
          A
        </div>
        <div className="chat-header-info">
          <h3 className="chat-header-title">AgentPrime</h3>
          <div className="chat-header-badges">
            <span className="chat-header-subtitle">
              {dinoBuddyMode ? 'Dino Buddy + Agent Mode' : 'Agent Mode'}
            </span>
            {dinoBuddyMode && (
              <span 
                title="Dino Buddy Mode is enabled"
                className="badge badge-rawr"
              >
                Dino Mode
              </span>
            )}
            {pythonBrainStatus.connected && (
              <span 
                title={`Python Brain: ${pythonBrainStatus.memories} memories, ${pythonBrainStatus.patterns} patterns`}
                className="badge badge-brain"
              >
                Brain
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

