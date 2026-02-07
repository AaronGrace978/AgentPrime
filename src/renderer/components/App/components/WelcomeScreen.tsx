/**
 * WelcomeScreen - Beautiful landing page when no file is open
 * Features animated entrance, helpful tips, and keyboard-first design
 */

import React, { useState, useEffect } from 'react';
import { RecentProject } from '../types';

interface WelcomeScreenProps {
  recentProjects: RecentProject[];
  onOpenFolder: () => void;
  onOpenComposer: () => void;
  onNewFile: () => void;
  onOpenTaskManager: () => void;
  onOpenTodoDemo: () => void;
  onOpenRecentProject: (path: string) => void;
  onNewProject: () => void;
}

// Helpful tips that rotate
const tips = [
  { icon: '⌨️', text: 'Press Ctrl+L to open AI Chat anytime' },
  { icon: '🚀', text: 'Use Ctrl+K for the Command Palette' },
  { icon: '📁', text: 'Press Ctrl+B to toggle the file explorer' },
  { icon: '⚡', text: 'Hit F5 to run your current file' },
  { icon: '💬', text: 'Ctrl+J opens casual Just Chat mode' },
  { icon: '🔢', text: 'Ctrl+1-9 switches between open tabs' },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  recentProjects,
  onOpenFolder,
  onOpenComposer,
  onNewFile,
  onOpenTaskManager,
  onOpenTodoDemo,
  onOpenRecentProject,
  onNewProject
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  // Rotate tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setCurrentTip((prev) => (prev + 1) % tips.length);
        setTipVisible(true);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-collapse recent projects after 8 seconds
  useEffect(() => {
    if (recentProjects.length > 0) {
      const timer = setTimeout(() => {
        setIsCollapsed(true);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [recentProjects.length]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="welcome-screen glass-panel">
      <div className="welcome-content">
        {/* Animated Logo */}
        <div className="welcome-logo-section">
          <div className="welcome-logo animate-bounce-in glow-accent">
            <svg viewBox="0 0 48 48" width="64" height="64" className="welcome-logo-svg">
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff6b4a" />
                  <stop offset="50%" stopColor="#ff8a6b" />
                  <stop offset="100%" stopColor="#ffa58b" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="40" height="40" rx="10" fill="url(#logoGradient)" />
              <text x="24" y="32" textAnchor="middle" fill="white" fontSize="24" fontWeight="800">A</text>
            </svg>
          </div>
          <h1 className="welcome-title animate-fade-slide-up stagger-1 gradient-text">
            Agent<span className="accent">Prime</span>
          </h1>
          <p className="welcome-subtitle animate-fade-slide-up stagger-2">
            Your AI coding companion. Private. Powerful. Local-first.
          </p>
        </div>

        {/* Quick Actions Grid */}
        <div className="welcome-actions">
          <div className="card-stunning hover-lift animate-fade-slide-up stagger-1" onClick={onNewProject}>
            <div className="action-icon glow-blue">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20" />
              </svg>
            </div>
            <h3 className="text-gradient">New Project</h3>
            <p>Start from a template</p>
            <span className="action-shortcut"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd></span>
          </div>

          <div className="card-stunning hover-lift animate-fade-slide-up stagger-2" onClick={onOpenFolder}>
            <div className="action-icon glow-purple">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="text-gradient">Open Project</h3>
            <p>Work with an existing codebase</p>
            <span className="action-shortcut"><kbd>Ctrl</kbd>+<kbd>O</kbd></span>
          </div>

          <div className="card-stunning hover-lift animate-fade-slide-up stagger-3" onClick={onOpenComposer}>
            <div className="action-icon glow-accent glow-pulse">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h.01M12 10h.01M16 10h.01" />
              </svg>
            </div>
            <h3 className="gradient-text">AI Chat</h3>
            <p>Brainstorm ideas with AI</p>
            <span className="action-shortcut"><kbd>Ctrl</kbd>+<kbd>L</kbd></span>
          </div>

          <div className="card-stunning hover-lift animate-fade-slide-up stagger-4" onClick={onNewFile}>
            <div className="action-icon glow-green">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h3 className="text-gradient">New File</h3>
            <p>Start coding from scratch</p>
            <span className="action-shortcut"><kbd>Ctrl</kbd>+<kbd>N</kbd></span>
          </div>

          <div className="card-stunning hover-lift animate-fade-slide-up stagger-5" onClick={onOpenTaskManager}>
            <div className="action-icon glow-blue">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <h3 className="text-gradient">Plan Project</h3>
            <p>Organize your ideas</p>
            <span className="action-shortcut"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd></span>
          </div>
        </div>

        {/* Rotating Tip */}
        <div className={`welcome-tip ${tipVisible ? 'visible' : ''}`}>
          <span className="tip-icon">{tips[currentTip].icon}</span>
          <span className="tip-text">{tips[currentTip].text}</span>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className={`recent-projects animate-fade-slide-up stagger-5 ${isCollapsed ? 'collapsed' : ''}`}>
            <h4 
              className="recent-projects-header"
              onClick={toggleCollapse}
            >
              <span className="recent-header-left">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12,6 12,12 16,14" />
                </svg>
                Recent Projects
              </span>
              <span className={`collapse-icon ${isCollapsed ? '' : 'open'}`}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </span>
            </h4>
            <div className={`recent-list ${isCollapsed ? 'collapsed' : ''}`}>
              {recentProjects.slice(0, 5).map((project, index) => (
                <div 
                  key={project.path} 
                  className="recent-item"
                  onClick={() => onOpenRecentProject(project.path)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="recent-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <div className="recent-info">
                    <span className="recent-name">{project.name}</span>
                    <span className="recent-path">{project.path}</span>
                  </div>
                  <span className="recent-time">
                    {formatRelativeTime(project.lastOpened)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State for No Recent Projects */}
        {recentProjects.length === 0 && (
          <div className="welcome-empty-hint animate-fade-slide-up stagger-5">
            <div className="empty-hint-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <p className="empty-hint-text">
              No recent projects yet. Open a folder or start chatting with AI to begin!
            </p>
          </div>
        )}

        {/* Keyboard Shortcut Hint */}
        <div className="keyboard-hint animate-fade-slide-up stagger-5">
          Press <kbd>Ctrl</kbd>+<kbd>K</kbd> for Command Palette &nbsp;•&nbsp; 
          <kbd>F1</kbd> for all shortcuts
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
