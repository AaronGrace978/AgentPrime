/**
 * WelcomeScreen - Clean and professional landing page when no file is open
 */

import React, { useState, useEffect } from 'react';
import { RecentProject } from '../types';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  recentProjects: RecentProject[];
  onOpenFolder: () => void;
  onOpenComposer: () => void;
  onNewFile: () => void;
  onOpenRecentProject: (path: string) => void;
  onNewProject: () => void;
}

// Helpful keyboard tips that rotate
const tips = [
  'Ctrl+L toggles AI Composer',
  'Ctrl+K opens Command Palette',
  'Ctrl+B toggles the file explorer',
  'F5 runs your current file',
  'Ctrl+Tab switches between open tabs',
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  recentProjects,
  onOpenFolder,
  onOpenComposer,
  onNewFile,
  onOpenRecentProject,
  onNewProject
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setCurrentTip((prev) => (prev + 1) % tips.length);
        setTipVisible(true);
      }, 300);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="welcome-pro">
      <div className="welcome-pro-shell">
        <div className="welcome-pro-hero">
          <div className="welcome-pro-logo-mark" aria-hidden="true">A</div>
          <h1 className="welcome-pro-title">AgentPrime</h1>
          <p className="welcome-pro-subtitle">
            Private, local-first coding workspace with integrated AI assistance.
          </p>
        </div>

        <div className="welcome-pro-actions">
          <button type="button" className="welcome-pro-action" data-variant="create" onClick={onNewProject}>
            <span className="welcome-pro-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20" />
              </svg>
            </span>
            <span className="welcome-pro-action-title">New Project</span>
            <span className="welcome-pro-action-description">Start from a template</span>
            <span className="welcome-pro-action-shortcut"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd></span>
          </button>

          <button type="button" className="welcome-pro-action" data-variant="open" onClick={onOpenFolder}>
            <span className="welcome-pro-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="welcome-pro-action-title">Open Project</span>
            <span className="welcome-pro-action-description">Work with an existing codebase</span>
            <span className="welcome-pro-action-shortcut"><kbd>Ctrl</kbd>+<kbd>O</kbd></span>
          </button>

          <button type="button" className="welcome-pro-action" data-variant="chat" onClick={onOpenComposer}>
            <span className="welcome-pro-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h.01M12 10h.01M16 10h.01" />
              </svg>
            </span>
            <span className="welcome-pro-action-title">AI Chat</span>
            <span className="welcome-pro-action-description">Brainstorm ideas with AI</span>
            <span className="welcome-pro-action-shortcut"><kbd>Ctrl</kbd>+<kbd>L</kbd></span>
          </button>

          <button type="button" className="welcome-pro-action" data-variant="file" onClick={onNewFile}>
            <span className="welcome-pro-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </span>
            <span className="welcome-pro-action-title">New File</span>
            <span className="welcome-pro-action-description">Start coding from scratch</span>
            <span className="welcome-pro-action-shortcut"><kbd>Ctrl</kbd>+<kbd>N</kbd></span>
          </button>
        </div>

        <div className={`welcome-pro-tip ${tipVisible ? 'is-visible' : ''}`}>
          <span className="welcome-pro-tip-label">Shortcut</span>
          <span className="welcome-pro-tip-text">{tips[currentTip]}</span>
        </div>

        {recentProjects.length > 0 && (
          <section className="welcome-pro-recent">
            <button type="button" className="welcome-pro-recent-header" onClick={toggleCollapse}>
              <span className="welcome-pro-recent-title">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12,6 12,12 16,14" />
                </svg>
                Recent Projects
              </span>
              <span className={`welcome-pro-collapse-icon ${isCollapsed ? '' : 'is-open'}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </span>
            </button>

            <div className={`welcome-pro-recent-list ${isCollapsed ? 'is-collapsed' : ''}`}>
              {recentProjects.slice(0, 5).map(project => (
                <button
                  key={project.path}
                  type="button"
                  className="welcome-pro-recent-item"
                  onClick={() => onOpenRecentProject(project.path)}
                >
                  <span className="welcome-pro-recent-item-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="welcome-pro-recent-item-main">
                    <span className="welcome-pro-recent-name">{project.name}</span>
                    <span className="welcome-pro-recent-path">{project.path}</span>
                  </span>
                  <span className="welcome-pro-recent-time">{formatRelativeTime(project.lastOpened)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {recentProjects.length === 0 && (
          <div className="welcome-pro-empty">
            No recent projects yet. Open a folder or create a new project to get started.
          </div>
        )}

        <div className="welcome-pro-keyboard-hint">
          Press <kbd>Ctrl</kbd>+<kbd>K</kbd> for Command Palette. Open Settings for full shortcuts.
        </div>
      </div>
    </div>
  );
};

// Helper function for relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default WelcomeScreen;
