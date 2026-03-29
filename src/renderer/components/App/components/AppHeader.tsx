/**
 * AppHeader - Main application header with workspace info and actions
 */

import React from 'react';
import { FileItem } from '../types';
import {
  IconGitBranch,
  IconSettings,
  IconSave,
  IconPlay,
  IconStop,
  IconBot,
  IconSplit,
  IconColumns,
  IconFolder
} from '../../Icons';
import './AppHeader.css';

interface AppHeaderProps {
  workspaceName: string;
  selectedFile: FileItem | null;
  hasChanges: boolean;
  isRunning: boolean;
  useSplitView: boolean;
  gitPanelOpen: boolean;
  onOpenFolder: () => void;
  onOpenComposer: () => void;
  onOpenSettings: () => void;
  onSaveFile: () => void;
  onRunScript: () => void;
  onStopScript: () => void;
  onToggleSplitView: () => void;
  onToggleGitPanel: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  workspaceName,
  selectedFile,
  hasChanges,
  isRunning,
  useSplitView,
  gitPanelOpen,
  onOpenFolder,
  onOpenComposer,
  onOpenSettings,
  onSaveFile,
  onRunScript,
  onStopScript,
  onToggleSplitView,
  onToggleGitPanel
}) => {
  return (
    <header className="app-header-pro">
      <div className="app-header-pro-brand">
        <div className="app-header-pro-mark" aria-hidden="true">A</div>
        <div className="app-header-pro-title-wrap">
          <span className="app-header-pro-title">AgentPrime</span>
        </div>
      </div>

      <div className="app-header-pro-center">
        <div className="app-header-pro-workspace">
          <span className="app-header-pro-workspace-label">Workspace</span>
          {workspaceName && workspaceName !== 'AgentPrime' ? (
            <span className="app-header-pro-workspace-name">{workspaceName}</span>
          ) : (
            <span className="app-header-pro-workspace-name">No project open</span>
          )}
        </div>
      </div>

      <div className="app-header-pro-actions">
        {!selectedFile ? (
          <>
            <button
              onClick={onOpenFolder}
              className="app-header-pro-btn"
              title="Open Project"
            >
              <IconFolder size="sm" /> Open
            </button>
            <button
              onClick={onOpenComposer}
              className="app-header-pro-btn app-header-pro-btn-primary"
              title="Open AI Composer"
            >
              <IconBot size="sm" /> Ask AI
            </button>
            <button
              onClick={onToggleGitPanel}
              className={`app-header-pro-btn ${gitPanelOpen ? 'is-active' : ''}`}
              title="Source Control"
            >
              <IconGitBranch size="sm" /> Git
            </button>
            <button
              onClick={onOpenSettings}
              className="app-header-pro-btn"
              title="Settings - Configure AI models and editor behavior"
            >
              <IconSettings size="sm" /> Settings
            </button>
          </>
        ) : (
          <>
            <button onClick={onSaveFile} disabled={!hasChanges} className="app-header-pro-btn app-header-pro-btn-primary">
              <IconSave size="sm" /> Save
            </button>
            <button
              onClick={isRunning ? onStopScript : onRunScript}
              className={`app-header-pro-btn ${isRunning ? 'app-header-pro-btn-danger' : 'app-header-pro-btn-primary'}`}
            >
              {isRunning ? <><IconStop size="sm" /> Stop</> : <><IconPlay size="sm" /> Run</>}
            </button>
            <button onClick={onOpenComposer} className="app-header-pro-btn">
              <IconBot size="sm" /> Ask AI
            </button>
            <button
              onClick={onToggleSplitView}
              className={`app-header-pro-btn ${useSplitView ? 'is-active' : ''}`}
              title={useSplitView ? 'Single View' : 'Split View'}
            >
              {useSplitView ? <IconColumns size="sm" /> : <IconSplit size="sm" />} Split
            </button>
            <button
              onClick={onToggleGitPanel}
              className={`app-header-pro-btn ${gitPanelOpen ? 'is-active' : ''}`}
              title="Source Control"
            >
              <IconGitBranch size="sm" /> Git
            </button>
            <button
              onClick={onOpenSettings}
              className="app-header-pro-btn"
              title="Settings"
            >
              <IconSettings size="sm" /> Settings
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default AppHeader;

