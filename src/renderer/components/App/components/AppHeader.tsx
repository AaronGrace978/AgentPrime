/**
 * AppHeader - Main application header with workspace info and actions
 */

import React from 'react';
import { FileItem } from '../types';
import {
  IconGitBranch,
  IconBrain,
  IconMessage,
  IconSettings,
  IconSave,
  IconPlay,
  IconStop,
  IconBot,
  IconSplit,
  IconColumns,
  IconSparkles
} from '../../Icons';

interface AppHeaderProps {
  workspaceName: string;
  selectedFile: FileItem | null;
  hasChanges: boolean;
  isRunning: boolean;
  useSplitView: boolean;
  gitPanelOpen: boolean;
  mirrorPanelOpen: boolean;
  vibeHubOpen?: boolean;
  agentModeOpen?: boolean;
  onOpenFolder: () => void;
  onOpenComposer: () => void;
  onOpenJustChat: () => void;
  onOpenSettings: () => void;
  onSaveFile: () => void;
  onRunScript: () => void;
  onToggleSplitView: () => void;
  onToggleGitPanel: () => void;
  onToggleMirrorPanel: () => void;
  onToggleVibeHub?: () => void;
  onToggleAgentMode?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  workspaceName,
  selectedFile,
  hasChanges,
  isRunning,
  useSplitView,
  gitPanelOpen,
  mirrorPanelOpen,
  vibeHubOpen,
  agentModeOpen,
  onOpenFolder,
  onOpenComposer,
  onOpenJustChat,
  onOpenSettings,
  onSaveFile,
  onRunScript,
  onToggleSplitView,
  onToggleGitPanel,
  onToggleMirrorPanel,
  onToggleVibeHub,
  onToggleAgentMode
}) => {
  return (
    <div className="header-stunning app-header">
      <div className="header-left">
        <div className="app-logo">
          <span className="logo glow-accent">A</span>
          <span className="app-title logo-stunning">AgentPrime</span>
        </div>
      </div>

      <div className="header-center">
        <div className="workspace-info">
          {workspaceName && workspaceName !== 'AgentPrime' ? (
            <span>Current workspace: {workspaceName}</span>
          ) : (
            <span>AgentPrime</span>
          )}
        </div>
      </div>

      <div className="header-right">
        {!selectedFile ? (
          <>
            {/* Welcome screen has action cards for Open Project and AI Chat, so just show utility buttons here */}
            <button
              onClick={onToggleGitPanel}
              className={`btn secondary ${gitPanelOpen ? 'active' : ''}`}
              title="Source Control"
            >
              <IconGitBranch size="sm" /> Git
            </button>
            {onToggleVibeHub && (
              <button
                onClick={onToggleVibeHub}
                className={`btn secondary vibehub-btn ${vibeHubOpen ? 'active' : ''}`}
                title="VibeHub - Version Control for Humans"
              >
                <IconSparkles size="sm" /> VibeHub
              </button>
            )}
            <button
              onClick={onToggleMirrorPanel}
              className={`btn secondary ${mirrorPanelOpen ? 'active' : ''}`}
              title="Mirror Intelligence - Learn from code"
            >
              <IconBrain size="sm" /> Mirror
            </button>
            <button
              onClick={onOpenJustChat}
              className="btn secondary just-chat-trigger"
              title="Just Chat - No code, just vibes"
            >
              <IconMessage size="sm" /> Chat
            </button>
            {onToggleAgentMode && (
              <button
                onClick={onToggleAgentMode}
                className={`btn secondary agent-mode-btn ${agentModeOpen ? 'active' : ''}`}
                title="Agent Mode - Matrix Computer Control (Ctrl+Shift+A)"
              >
                <IconBot size="sm" /> Agent
              </button>
            )}
            <button
              onClick={onOpenSettings}
              className="btn secondary"
              title="Settings - Configure AI models & dual model system"
            >
              <IconSettings size="sm" /> Settings
            </button>
          </>
        ) : (
          <>
            <button onClick={onSaveFile} disabled={!hasChanges} className="btn-stunning btn-primary-stunning">
              <IconSave size="sm" /> Save
            </button>
            <button onClick={onRunScript} disabled={isRunning} className="btn-stunning btn-primary-stunning">
              {isRunning ? <><IconStop size="sm" /> Stop</> : <><IconPlay size="sm" /> Run</>}
            </button>
            <button onClick={onOpenComposer} className="btn-stunning btn-secondary-stunning glow-pulse">
              <IconBot size="sm" /> Ask AI
            </button>
            <button
              onClick={onToggleSplitView}
              className={`btn secondary ${useSplitView ? 'active' : ''}`}
              title={useSplitView ? 'Single View' : 'Split View'}
            >
              {useSplitView ? <IconColumns size="sm" /> : <IconSplit size="sm" />} Split
            </button>
            <button
              onClick={onToggleGitPanel}
              className={`btn secondary ${gitPanelOpen ? 'active' : ''}`}
              title="Source Control"
            >
              <IconGitBranch size="sm" /> Git
            </button>
            {onToggleVibeHub && (
              <button
                onClick={onToggleVibeHub}
                className={`btn secondary vibehub-btn ${vibeHubOpen ? 'active' : ''}`}
                title="VibeHub - Version Control for Humans"
              >
                <IconSparkles size="sm" /> VibeHub
              </button>
            )}
            <button
              onClick={onToggleMirrorPanel}
              className={`btn secondary ${mirrorPanelOpen ? 'active' : ''}`}
              title="Mirror Intelligence - Learn from code"
            >
              <IconBrain size="sm" /> Mirror
            </button>
            <button
              onClick={onOpenJustChat}
              className="btn secondary just-chat-trigger"
              title="Just Chat - No code, just vibes"
            >
              <IconMessage size="sm" /> Chat
            </button>
            {onToggleAgentMode && (
              <button
                onClick={onToggleAgentMode}
                className={`btn secondary agent-mode-btn ${agentModeOpen ? 'active' : ''}`}
                title="Agent Mode - Matrix Computer Control (Ctrl+Shift+A)"
              >
                <IconBot size="sm" /> Agent
              </button>
            )}
            <button
              onClick={onOpenSettings}
              className="btn secondary"
              title="Settings"
            >
              <IconSettings size="sm" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AppHeader;

