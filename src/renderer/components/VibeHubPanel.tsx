/**
 * VibeHub Panel - Enhanced Human-Friendly Version Control
 * Integrates VibeHub vocabulary into AgentPrime
 * 
 * Features:
 * - Project Running with live log streaming
 * - File changes with diff preview
 * - Checkpoint timeline with revert
 * - Version management with merge
 * - Remote sync (push/pull/fetch)
 * - Stash management
 * - Real-time file change detection
 * 
 * "GitHub for Vibe Coders" x "AI Coding Assistant"
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Checkpoint {
  id: string;
  shortId: string;
  message: string;
  timestamp: number;
  author: string;
  email?: string;
  aiGenerated: boolean;
  files: string[];
  parentId?: string;
}

interface Version {
  name: string;
  current: boolean;
  isRemote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

interface FileChange {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  staged: boolean;
}

interface FileDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  staged: boolean;
  additions: number;
  deletions: number;
  diff: string;
}

interface StashEntry {
  id: number;
  message: string;
  branch: string;
  timestamp: number;
}

interface ProjectStatus {
  path: string;
  name: string;
  isGitRepo: boolean;
  currentVersion: string;
  checkpointCount: number;
  hasUnstagedChanges: boolean;
  hasReadyToSave: boolean;
  remotes: Remote[];
  syncStatus?: {
    ahead: number;
    behind: number;
    remote: string;
  };
}

interface ProjectInfo {
  type: 'node' | 'python' | 'html' | 'tauri' | 'unknown';
  hasPackageJson: boolean;
  hasRequirements: boolean;
  hasIndexHtml: boolean;
  name?: string;
  mainFile?: string;
  startCommand?: string;
}

interface RunningProjectInfo {
  pid: number;
  startTime: number;
  type: string;
  port?: number;
  command: string;
  logs: string[];
}

interface VibeHubPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string;
}

type TabType = 'run' | 'changes' | 'timeline' | 'versions' | 'sync' | 'stash';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const VibeHubPanel: React.FC<VibeHubPanelProps> = ({ isOpen, onClose, workspacePath }) => {
  // State
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('run');
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [isVibeHubAvailable, setIsVibeHubAvailable] = useState<boolean | null>(null);
  
  // Project running state
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [isProjectRunning, setIsProjectRunning] = useState(false);
  const [runningInfo, setRunningInfo] = useState<RunningProjectInfo | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [projectLogs, setProjectLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Diff viewer state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  
  // Remote operations state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showAddRemote, setShowAddRemote] = useState(false);
  const [newRemoteName, setNewRemoteName] = useState('');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  
  // Stash state
  const [stashMessage, setStashMessage] = useState('');
  
  // Refs
  const logsEndRef = useRef<HTMLDivElement>(null);

  const api = (window as any).agentAPI;

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    if (!workspacePath || !api?.vibeHub) return;
    
    setLoading(true);
    try {
      await api.vibeHub.init(workspacePath);
      
      const [statusData, checkpointsData, versionsData, changesData, available, projInfo, isRunning, runInfo, stashesData, logs] = await Promise.all([
        api.vibeHub.getStatus(),
        api.vibeHub.getCheckpoints(20),
        api.vibeHub.getVersions(),
        api.vibeHub.getChanges(),
        api.vibeHub.isAvailable(),
        api.vibeHub.detectProject(),
        api.vibeHub.isProjectRunning(),
        api.vibeHub.getRunningInfo(),
        api.vibeHub.getStashes(),
        api.vibeHub.getLogs()
      ]);
      
      setStatus(statusData);
      setCheckpoints(checkpointsData || []);
      setVersions(versionsData || []);
      setChanges(changesData || []);
      setIsVibeHubAvailable(available);
      setProjectInfo(projInfo);
      setIsProjectRunning(isRunning);
      setRunningInfo(runInfo);
      setStashes(stashesData || []);
      setProjectLogs(logs || []);
    } catch (error) {
      console.error('[VibeHub] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, api]);

  useEffect(() => {
    if (isOpen && workspacePath) {
      loadData();
    }
  }, [isOpen, workspacePath, loadData]);

  // Set up event listeners
  useEffect(() => {
    if (!isOpen || !api?.vibeHub) return;
    
    // Listen for file changes
    api.vibeHub.onFileChanged?.((data: { type: string; file: string }) => {
      // Refresh changes when files change
      loadData();
    });

    // Listen for project output
    api.vibeHub.onProjectOutput?.((data: { type: string; text: string }) => {
      setProjectLogs(prev => [...prev.slice(-499), data.text]);
    });

    // Listen for project exit
    api.vibeHub.onProjectExit?.((data: { code: number }) => {
      setIsProjectRunning(false);
      setRunningInfo(null);
    });

    return () => {
      api.vibeHub.removeVibeHubListeners?.();
    };
  }, [isOpen, api, loadData]);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [projectLogs, showLogs]);

  // Periodic refresh for running status
  useEffect(() => {
    if (!isOpen || !api?.vibeHub) return;
    
    const checkRunning = async () => {
      try {
        const [isRunning, runInfo] = await Promise.all([
          api.vibeHub.isProjectRunning(),
          api.vibeHub.getRunningInfo()
        ]);
        setIsProjectRunning(isRunning);
        setRunningInfo(runInfo);
      } catch (e) {
        // Ignore
      }
    };

    const interval = setInterval(checkRunning, 5000);
    return () => clearInterval(interval);
  }, [isOpen, api]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const generateMessage = async () => {
    setIsGeneratingMessage(true);
    try {
      const message = await api.vibeHub.generateMessage();
      setCheckpointMessage(message);
    } catch (error) {
      console.error('[VibeHub] Error generating message:', error);
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  const createCheckpoint = async (stageAll: boolean = false) => {
    if (!checkpointMessage.trim()) {
      await generateMessage();
      return;
    }
    
    try {
      const result = await api.vibeHub.createCheckpoint(checkpointMessage, stageAll);
      if (result.success) {
        setCheckpointMessage('');
        await loadData();
      } else {
        alert(`Failed to create checkpoint: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error creating checkpoint:', error);
    }
  };

  const undoCheckpoint = async () => {
    if (!confirm('Undo last checkpoint? Changes will be kept.')) return;
    
    try {
      const result = await api.vibeHub.undoCheckpoint(true);
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to undo: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error undoing checkpoint:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleStage = async (file: string, currentlyStaged: boolean) => {
    try {
      if (currentlyStaged) {
        await api.vibeHub.unstageFiles([file]);
      } else {
        await api.vibeHub.stageFiles([file]);
      }
      await loadData();
    } catch (error) {
      console.error('[VibeHub] Error toggling stage:', error);
    }
  };

  const viewDiff = async (file: string, staged: boolean) => {
    setSelectedFile(file);
    setLoadingDiff(true);
    try {
      const diff = await api.vibeHub.getFileDiff(file, staged);
      setSelectedDiff(diff);
    } catch (error) {
      console.error('[VibeHub] Error loading diff:', error);
    } finally {
      setLoadingDiff(false);
    }
  };

  const discardChanges = async (file: string) => {
    if (!confirm(`Discard all changes to ${file}? This cannot be undone.`)) return;
    
    try {
      const result = await api.vibeHub.discardChanges([file]);
      if (result.success) {
        await loadData();
        setSelectedFile(null);
        setSelectedDiff(null);
      } else {
        alert(`Failed to discard changes: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error discarding changes:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const switchVersion = async (versionName: string) => {
    try {
      const result = await api.vibeHub.switchVersion(versionName);
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to switch version: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error switching version:', error);
    }
  };

  const createVersion = async () => {
    if (!newVersionName.trim()) return;
    
    try {
      const result = await api.vibeHub.createVersion(newVersionName, true);
      if (result.success) {
        setNewVersionName('');
        setShowNewVersion(false);
        await loadData();
      } else {
        alert(`Failed to create version: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error creating version:', error);
    }
  };

  const deleteVersion = async (name: string) => {
    if (!confirm(`Delete version "${name}"? This cannot be undone.`)) return;
    
    try {
      const result = await api.vibeHub.deleteVersion(name);
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to delete version: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error deleting version:', error);
    }
  };

  const mergeVersion = async (name: string) => {
    if (!confirm(`Merge "${name}" into current version?`)) return;
    
    try {
      const result = await api.vibeHub.mergeVersion(name);
      if (result.success) {
        await loadData();
      } else {
        if (result.hasConflicts) {
          alert('Merge conflicts detected. Resolve them in your editor.');
        } else {
          alert(`Failed to merge: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('[VibeHub] Error merging version:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const push = async (setUpstream: boolean = false) => {
    setSyncing(true);
    setSyncMessage('Pushing...');
    try {
      const result = await api.vibeHub.push(undefined, undefined, setUpstream);
      if (result.success) {
        setSyncMessage('✅ Pushed successfully');
        await loadData();
      } else {
        setSyncMessage(`❌ ${result.error}`);
      }
    } catch (error: any) {
      setSyncMessage(`❌ ${error.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const pull = async () => {
    setSyncing(true);
    setSyncMessage('Pulling...');
    try {
      const result = await api.vibeHub.pull();
      if (result.success) {
        setSyncMessage('✅ Pulled successfully');
        await loadData();
      } else {
        if (result.hasConflicts) {
          setSyncMessage('⚠️ Merge conflicts detected');
        } else {
          setSyncMessage(`❌ ${result.error}`);
        }
      }
    } catch (error: any) {
      setSyncMessage(`❌ ${error.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const fetch = async () => {
    setSyncing(true);
    setSyncMessage('Fetching...');
    try {
      const result = await api.vibeHub.fetch(undefined, true);
      if (result.success) {
        setSyncMessage('✅ Fetched successfully');
        await loadData();
      } else {
        setSyncMessage(`❌ ${result.error}`);
      }
    } catch (error: any) {
      setSyncMessage(`❌ ${error.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const addRemote = async () => {
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return;
    
    try {
      const result = await api.vibeHub.addRemote(newRemoteName, newRemoteUrl);
      if (result.success) {
        setNewRemoteName('');
        setNewRemoteUrl('');
        setShowAddRemote(false);
        await loadData();
      } else {
        alert(`Failed to add remote: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error adding remote:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STASH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const createStash = async () => {
    try {
      const result = await api.vibeHub.stash(stashMessage || undefined, true);
      if (result.success) {
        setStashMessage('');
        await loadData();
      } else {
        alert(`Failed to stash: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error creating stash:', error);
    }
  };

  const applyStash = async (index: number, drop: boolean = false) => {
    try {
      const result = await api.vibeHub.applyStash(index, drop);
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to apply stash: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error applying stash:', error);
    }
  };

  const dropStash = async (index: number) => {
    if (!confirm('Delete this stash? This cannot be undone.')) return;
    
    try {
      const result = await api.vibeHub.dropStash(index);
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to drop stash: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error dropping stash:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT RUNNING
  // ═══════════════════════════════════════════════════════════════════════════

  const runProject = async () => {
    setIsStarting(true);
    setRunStatus('Starting project...');
    try {
      const result = await api.vibeHub.runProject();
      if (result.success) {
        setRunStatus(result.message);
        setIsProjectRunning(true);
        const runInfo = await api.vibeHub.getRunningInfo();
        setRunningInfo(runInfo);
        setTimeout(() => setRunStatus(null), 5000);
      } else {
        setRunStatus(`❌ ${result.message}`);
        setTimeout(() => setRunStatus(null), 10000);
      }
    } catch (error: any) {
      setRunStatus(`❌ Error: ${error.message || error}`);
      setTimeout(() => setRunStatus(null), 10000);
    } finally {
      setIsStarting(false);
    }
  };

  const stopProject = async () => {
    try {
      const result = await api.vibeHub.stopProject();
      if (result.success) {
        setRunStatus('✅ ' + result.message);
        setIsProjectRunning(false);
        setRunningInfo(null);
        setTimeout(() => setRunStatus(null), 3000);
      } else {
        setRunStatus('❌ ' + result.message);
      }
    } catch (error: any) {
      setRunStatus(`❌ Error: ${error.message || error}`);
    }
  };

  const openInBrowser = async () => {
    try {
      const result = await api.vibeHub.openInBrowser();
      if (!result.success) {
        setRunStatus(result.message);
        setTimeout(() => setRunStatus(null), 3000);
      }
    } catch (error: any) {
      console.error('[VibeHub] Error opening browser:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT & LAUNCH
  // ═══════════════════════════════════════════════════════════════════════════

  const initProject = async () => {
    try {
      const result = await api.vibeHub.initProject();
      if (result.success) {
        await loadData();
      } else {
        alert(`Failed to start project: ${result.error}`);
      }
    } catch (error) {
      console.error('[VibeHub] Error initializing project:', error);
    }
  };

  const openInVibeHub = async () => {
    setLaunchStatus('Launching...');
    try {
      // Initialize with workspace if available
      if (workspacePath) {
        await api.vibeHub.init(workspacePath);
      }
      const result = await api.vibeHub.launch();
      if (result.success) {
        setLaunchStatus('✓ Launched!');
        setTimeout(() => setLaunchStatus(null), 2000);
      } else {
        setLaunchStatus('✗ Not found');
        setTimeout(() => setLaunchStatus(null), 3000);
        console.error('[VibeHub] Launch failed:', result.error);
      }
    } catch (error: any) {
      setLaunchStatus('✗ Error');
      setTimeout(() => setLaunchStatus(null), 3000);
      console.error('[VibeHub] Error launching VibeHub:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'added': return '✨';
      case 'modified': return '📝';
      case 'deleted': return '🗑️';
      case 'renamed': return '📋';
      default: return '📄';
    }
  };

  const getProjectTypeInfo = (type: string) => {
    switch (type) {
      case 'node': return { icon: '📦', label: 'Node.js', color: '#68a063' };
      case 'python': return { icon: '🐍', label: 'Python', color: '#3776ab' };
      case 'tauri': return { icon: '🦀', label: 'Tauri', color: '#ffc131' };
      case 'html': return { icon: '🌐', label: 'HTML', color: '#e34c26' };
      default: return { icon: '📁', label: 'Unknown', color: '#666' };
    }
  };

  const formatRuntime = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="vibehub-panel">
      <div className="vibehub-header">
        <div className="vibehub-title">
          <span className="vibehub-logo">✨</span>
          <h3>VibeHub</h3>
          <span className="vibehub-tagline">Version Control for Humans</span>
        </div>
        <div className="vibehub-actions">
          {launchStatus ? (
            <span className="vibehub-launch-status">{launchStatus}</span>
          ) : (
            <button 
              className="vibehub-header-launch-btn" 
              onClick={openInVibeHub} 
              title={isVibeHubAvailable === false 
                ? "VibeHub app not found - Install or build VibeHub" 
                : "Launch VibeHub - Full version control app"}
              disabled={isVibeHubAvailable === false}
            >
              <svg className="header-launch-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.8334 2.5C10.8334 2.5 9.58341 4.16667 9.16675 6.66667C8.75008 9.16667 9.16675 11.6667 9.16675 11.6667M9.16675 11.6667C9.16675 11.6667 10.8334 10 13.3334 9.58333C15.8334 9.16667 17.5001 10 17.5001 10M9.16675 11.6667L5.83341 15M17.5001 10C17.5001 10 15.8334 12.0833 15.4167 14.5833C15.0001 17.0833 15.8334 17.5 15.8334 17.5M17.5001 10L14.1667 6.66667M2.50008 17.5L9.16675 11.6667" 
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="13.3333" cy="6.66667" r="1.25" fill="currentColor"/>
              </svg>
              <span className="text">{isVibeHubAvailable === false ? 'Not Found' : 'Launch'}</span>
            </button>
          )}
          <button className="vibehub-close" onClick={onClose}>×</button>
        </div>
      </div>

      {!workspacePath ? (
        <div className="vibehub-empty">
          {/* Folder Icon */}
          <div className="vibehub-empty-icon-wrapper">
            <svg className="vibehub-empty-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7C3 5.89543 3.89543 5 5 5H9.58579C9.851 5 10.1054 5.10536 10.2929 5.29289L12 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" 
                    fill="url(#folderGradient)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"/>
              <defs>
                <linearGradient id="folderGradient" x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FFB347"/>
                  <stop offset="1" stopColor="#FF9500"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <h4>No Project Open</h4>
          <p>Open a folder to start using VibeHub for version control.</p>
          <p className="vibehub-hint">Use Ctrl+O or click "Open Project" to get started!</p>
          
          {/* Launch VibeHub App Button */}
          <div className="vibehub-launch-section">
            <div className="launch-divider">
              <span>or</span>
            </div>
            <button 
              className="vibehub-launch-btn"
              onClick={openInVibeHub}
              disabled={isVibeHubAvailable === false}
              title={isVibeHubAvailable === false 
                ? "VibeHub app not found - Install or build VibeHub" 
                : "Launch the standalone VibeHub application"}
            >
              <svg className="launch-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.0001 3.00001C13.0001 3.00001 11.5001 5.00001 11.0001 8.00001C10.5001 11 11.0001 14 11.0001 14M11.0001 14C11.0001 14 13.0001 12 16.0001 11.5C19.0001 11 21.0001 12 21.0001 12M11.0001 14L7.00008 18M21.0001 12C21.0001 12 19.0001 14.5 18.5001 17.5C18.0001 20.5 19.0001 21 19.0001 21M21.0001 12L17.0001 8M3.00008 21L11.0001 14" 
                      stroke="url(#rocketGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="16" cy="8" r="1.5" fill="url(#rocketGradient)"/>
                <defs>
                  <linearGradient id="rocketGradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#A855F7"/>
                    <stop offset="1" stopColor="#6366F1"/>
                  </linearGradient>
                </defs>
              </svg>
              <span className="launch-text">
                {isVibeHubAvailable === false ? 'VibeHub Not Installed' : 'Launch VibeHub App'}
              </span>
              <span className="launch-hint">Full version control experience</span>
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="vibehub-loading">
          <div className="vibehub-spinner"></div>
          <p>Loading project...</p>
        </div>
      ) : !status?.isGitRepo ? (
        <div className="vibehub-empty">
          <div className="vibehub-empty-icon">📦</div>
          <h4>Not a Project Yet</h4>
          <p>Start tracking your work to save checkpoints and create versions.</p>
          <button className="vibehub-btn primary" onClick={initProject}>
            🎉 Start Project
          </button>
        </div>
      ) : (
        <>
          {/* Project Status Bar */}
          <div className="vibehub-status-bar">
            <div className="vibehub-project-name">
              <span className="project-icon">📁</span>
              {status.name}
            </div>
            <div className="vibehub-version-badge">
              🌿 {status.currentVersion}
            </div>
            <div className="vibehub-checkpoint-count">
              ✓ {status.checkpointCount} checkpoints
            </div>
            {status.syncStatus && (
              <div className="vibehub-sync-status">
                {status.syncStatus.ahead > 0 && <span className="ahead">↑{status.syncStatus.ahead}</span>}
                {status.syncStatus.behind > 0 && <span className="behind">↓{status.syncStatus.behind}</span>}
                {status.syncStatus.ahead === 0 && status.syncStatus.behind === 0 && <span className="synced">✓ Synced</span>}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="vibehub-tabs">
            <button 
              className={`vibehub-tab ${activeTab === 'run' ? 'active' : ''}`}
              onClick={() => setActiveTab('run')}
            >
              🚀 Run {isProjectRunning && <span className="badge running">●</span>}
            </button>
            <button 
              className={`vibehub-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              📝 Changes {changes.length > 0 && <span className="badge">{changes.length}</span>}
            </button>
            <button 
              className={`vibehub-tab ${activeTab === 'timeline' ? 'active' : ''}`}
              onClick={() => setActiveTab('timeline')}
            >
              📜 Timeline
            </button>
            <button 
              className={`vibehub-tab ${activeTab === 'versions' ? 'active' : ''}`}
              onClick={() => setActiveTab('versions')}
            >
              🌿 Versions
            </button>
            <button 
              className={`vibehub-tab ${activeTab === 'sync' ? 'active' : ''}`}
              onClick={() => setActiveTab('sync')}
            >
              ☁️ Sync
            </button>
            <button 
              className={`vibehub-tab ${activeTab === 'stash' ? 'active' : ''}`}
              onClick={() => setActiveTab('stash')}
            >
              📦 Stash {stashes.length > 0 && <span className="badge">{stashes.length}</span>}
            </button>
          </div>

          {/* Tab Content */}
          <div className="vibehub-content">
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* RUN TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'run' && (
              <div className="vibehub-run">
                {/* Project Detection */}
                <div className="vibehub-section">
                  <h4>🔍 Project Detected</h4>
                  {projectInfo ? (
                    <div className="vibehub-project-info">
                      <div className="project-type-badge" style={{ borderColor: getProjectTypeInfo(projectInfo.type).color }}>
                        <span className="type-icon">{getProjectTypeInfo(projectInfo.type).icon}</span>
                        <span className="type-label">{getProjectTypeInfo(projectInfo.type).label}</span>
                      </div>
                      {projectInfo.name && (
                        <div className="project-detail">
                          <span className="label">Name:</span>
                          <span className="value">{projectInfo.name}</span>
                        </div>
                      )}
                      {projectInfo.startCommand && (
                        <div className="project-detail">
                          <span className="label">Command:</span>
                          <code className="value">{projectInfo.startCommand}</code>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="vibehub-no-project">
                      <span>❓</span>
                      <p>No runnable project detected.</p>
                    </div>
                  )}
                </div>

                {/* Run Status */}
                {runStatus && (
                  <div className={`vibehub-run-status ${runStatus.includes('❌') ? 'error' : runStatus.includes('✅') || runStatus.includes('🚀') ? 'success' : ''}`}>
                    {runStatus}
                  </div>
                )}

                {/* Running Project Info */}
                {isProjectRunning && runningInfo && (
                  <div className="vibehub-section running-section">
                    <h4>⚡ Running</h4>
                    <div className="running-info">
                      <div className="running-indicator">
                        <span className="pulse"></span>
                        <span className="status-text">Active</span>
                      </div>
                      <div className="running-details">
                        <div className="detail">
                          <span className="label">Type:</span>
                          <span className="value">{getProjectTypeInfo(runningInfo.type).icon} {getProjectTypeInfo(runningInfo.type).label}</span>
                        </div>
                        {runningInfo.port && (
                          <div className="detail">
                            <span className="label">Port:</span>
                            <span className="value port-value">{runningInfo.port}</span>
                          </div>
                        )}
                        <div className="detail">
                          <span className="label">Uptime:</span>
                          <span className="value">{formatRuntime(runningInfo.startTime)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Logs toggle */}
                    <button 
                      className="vibehub-btn secondary"
                      onClick={() => setShowLogs(!showLogs)}
                    >
                      {showLogs ? '📕 Hide Logs' : '📖 Show Logs'}
                    </button>
                    
                    {/* Logs panel */}
                    {showLogs && (
                      <div className="vibehub-logs">
                        <div className="logs-header">
                          <span>📋 Output</span>
                          <button onClick={() => api.vibeHub.clearLogs?.().then(() => setProjectLogs([]))}>Clear</button>
                        </div>
                        <div className="logs-content">
                          {projectLogs.map((log, i) => (
                            <div key={i} className={`log-line ${log.includes('[ERR]') ? 'error' : ''}`}>
                              {log}
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Run Controls */}
                <div className="vibehub-run-controls">
                  {!isProjectRunning ? (
                    <button 
                      className="vibehub-btn primary run-btn"
                      onClick={runProject}
                      disabled={isStarting || !projectInfo?.startCommand}
                    >
                      {isStarting ? '⏳ Starting...' : '▶️ Run Project'}
                    </button>
                  ) : (
                    <div className="running-controls">
                      <button className="vibehub-btn danger" onClick={stopProject}>
                        ⏹️ Stop
                      </button>
                      {runningInfo?.port && (
                        <button className="vibehub-btn secondary" onClick={openInBrowser}>
                          🌐 Open Browser
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CHANGES TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'changes' && (
              <div className="vibehub-changes">
                {selectedDiff ? (
                  /* Diff Viewer */
                  <div className="vibehub-diff-viewer">
                    <div className="diff-header">
                      <button className="back-btn" onClick={() => { setSelectedFile(null); setSelectedDiff(null); }}>
                        ← Back
                      </button>
                      <div className="diff-file-info">
                        <span className="file-name">{selectedDiff.file}</span>
                        <span className="diff-stats">
                          <span className="additions">+{selectedDiff.additions}</span>
                          <span className="deletions">-{selectedDiff.deletions}</span>
                        </span>
                      </div>
                      <div className="diff-actions">
                        <button 
                          className="vibehub-btn secondary small" 
                          onClick={() => toggleStage(selectedDiff.file, selectedDiff.staged)}
                        >
                          {selectedDiff.staged ? '➖ Unstage' : '➕ Stage'}
                        </button>
                        <button 
                          className="vibehub-btn danger small" 
                          onClick={() => discardChanges(selectedDiff.file)}
                        >
                          🗑️ Discard
                        </button>
                      </div>
                    </div>
                    <div className="diff-content">
                      {selectedDiff.diff ? (
                        <pre>{selectedDiff.diff}</pre>
                      ) : (
                        <div className="diff-empty">
                          {selectedDiff.status === 'added' ? 'New file (binary or empty)' : 'No diff available'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : changes.length === 0 ? (
                  <div className="vibehub-no-changes">
                    <span>✨</span>
                    <p>No changes yet. Start coding!</p>
                  </div>
                ) : (
                  <>
                    {/* Ready to Save (staged) */}
                    {changes.some(c => c.staged) && (
                      <div className="vibehub-section">
                        <h4>✓ Ready to Save</h4>
                        <div className="vibehub-file-list">
                          {changes.filter(c => c.staged).map((change, i) => (
                            <div key={i} className="vibehub-file-item staged">
                              <div className="file-info" onClick={() => viewDiff(change.file, true)}>
                                <span className="file-status">{getStatusIcon(change.status)}</span>
                                <span className="file-name">{change.file}</span>
                              </div>
                              <button className="file-action" onClick={() => toggleStage(change.file, true)} title="Unstage">
                                −
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Not Ready Yet (unstaged) */}
                    {changes.some(c => !c.staged) && (
                      <div className="vibehub-section">
                        <h4>📋 Not Ready Yet</h4>
                        <div className="vibehub-file-list">
                          {changes.filter(c => !c.staged).map((change, i) => (
                            <div key={i} className="vibehub-file-item">
                              <div className="file-info" onClick={() => viewDiff(change.file, false)}>
                                <span className="file-status">{getStatusIcon(change.status)}</span>
                                <span className="file-name">{change.file}</span>
                              </div>
                              <button className="file-action" onClick={() => toggleStage(change.file, false)} title="Stage">
                                +
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Checkpoint Input */}
                    <div className="vibehub-checkpoint-input">
                      <div className="checkpoint-message-row">
                        <input
                          type="text"
                          placeholder="What did you change? (or let AI describe it)"
                          value={checkpointMessage}
                          onChange={(e) => setCheckpointMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && createCheckpoint(false)}
                        />
                        <button 
                          className="vibehub-btn ai-btn"
                          onClick={generateMessage}
                          disabled={isGeneratingMessage}
                          title="Generate message with AI"
                        >
                          {isGeneratingMessage ? '...' : '🤖'}
                        </button>
                      </div>
                      <div className="checkpoint-actions">
                        <button 
                          className="vibehub-btn primary"
                          onClick={() => createCheckpoint(false)}
                          disabled={!changes.some(c => c.staged)}
                        >
                          ✓ Save Checkpoint
                        </button>
                        <button 
                          className="vibehub-btn secondary"
                          onClick={() => createCheckpoint(true)}
                        >
                          ✓ Save All
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TIMELINE TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'timeline' && (
              <div className="vibehub-timeline">
                {checkpoints.length === 0 ? (
                  <div className="vibehub-no-changes">
                    <span>📜</span>
                    <p>No checkpoints yet. Save your first one!</p>
                  </div>
                ) : (
                  <>
                    {checkpoints.length > 0 && (
                      <div className="timeline-actions">
                        <button className="vibehub-btn secondary small" onClick={undoCheckpoint} title="Undo last checkpoint">
                          ↩️ Undo Last
                        </button>
                      </div>
                    )}
                    <div className="vibehub-checkpoint-list">
                      {checkpoints.map((cp, i) => (
                        <div key={cp.id} className="vibehub-checkpoint">
                          <div className="checkpoint-dot"></div>
                          <div className="checkpoint-content">
                            <div className="checkpoint-message">
                              {cp.aiGenerated && <span className="ai-badge">🤖</span>}
                              {cp.message}
                            </div>
                            <div className="checkpoint-meta">
                              <span className="checkpoint-time">{formatTime(cp.timestamp)}</span>
                              <span className="checkpoint-id">{cp.shortId}</span>
                              <span className="checkpoint-author">{cp.author}</span>
                              {cp.files.length > 0 && (
                                <span className="checkpoint-files">{cp.files.length} files</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VERSIONS TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'versions' && (
              <div className="vibehub-versions">
                <div className="vibehub-section">
                  <h4>🌿 Local Versions</h4>
                  <div className="vibehub-version-list">
                    {versions.filter(v => !v.isRemote).map((version, i) => (
                      <div 
                        key={i} 
                        className={`vibehub-version-item ${version.current ? 'current' : ''}`}
                      >
                        <div className="version-info" onClick={() => !version.current && switchVersion(version.name)}>
                          <span className="version-icon">{version.current ? '✓' : '🌿'}</span>
                          <span className="version-name">{version.name}</span>
                          {version.current && <span className="current-badge">current</span>}
                          {(version.ahead || 0) > 0 && <span className="ahead">↑{version.ahead}</span>}
                          {(version.behind || 0) > 0 && <span className="behind">↓{version.behind}</span>}
                        </div>
                        {!version.current && (
                          <div className="version-actions">
                            <button className="action-btn" onClick={() => mergeVersion(version.name)} title="Merge into current">
                              🔀
                            </button>
                            <button className="action-btn delete" onClick={() => deleteVersion(version.name)} title="Delete">
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {versions.some(v => v.isRemote) && (
                  <div className="vibehub-section">
                    <h4>☁️ Remote Versions</h4>
                    <div className="vibehub-version-list remote">
                      {versions.filter(v => v.isRemote).map((version, i) => (
                        <div key={i} className="vibehub-version-item remote">
                          <span className="version-icon">☁️</span>
                          <span className="version-name">{version.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showNewVersion ? (
                  <div className="vibehub-new-version">
                    <input
                      type="text"
                      placeholder="New version name..."
                      value={newVersionName}
                      onChange={(e) => setNewVersionName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createVersion()}
                      autoFocus
                    />
                    <button className="vibehub-btn primary" onClick={createVersion}>Create</button>
                    <button className="vibehub-btn secondary" onClick={() => setShowNewVersion(false)}>Cancel</button>
                  </div>
                ) : (
                  <button 
                    className="vibehub-btn secondary full-width"
                    onClick={() => setShowNewVersion(true)}
                  >
                    + New Version
                  </button>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SYNC TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'sync' && (
              <div className="vibehub-sync">
                {/* Sync Status */}
                {syncMessage && (
                  <div className={`vibehub-sync-message ${syncMessage.includes('❌') ? 'error' : syncMessage.includes('✅') ? 'success' : ''}`}>
                    {syncMessage}
                  </div>
                )}

                {/* Sync Status Card */}
                {status?.syncStatus && (
                  <div className="vibehub-section">
                    <h4>📊 Sync Status</h4>
                    <div className="sync-status-card">
                      <div className="sync-remote">{status.syncStatus.remote}</div>
                      <div className="sync-counts">
                        <div className="sync-count ahead">
                          <span className="arrow">↑</span>
                          <span className="count">{status.syncStatus.ahead}</span>
                          <span className="label">to push</span>
                        </div>
                        <div className="sync-count behind">
                          <span className="arrow">↓</span>
                          <span className="count">{status.syncStatus.behind}</span>
                          <span className="label">to pull</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sync Actions */}
                <div className="vibehub-section">
                  <h4>🔄 Actions</h4>
                  <div className="sync-actions">
                    <button 
                      className="vibehub-btn primary" 
                      onClick={() => push()}
                      disabled={syncing}
                    >
                      ⬆️ Push
                    </button>
                    <button 
                      className="vibehub-btn primary" 
                      onClick={pull}
                      disabled={syncing}
                    >
                      ⬇️ Pull
                    </button>
                    <button 
                      className="vibehub-btn secondary" 
                      onClick={fetch}
                      disabled={syncing}
                    >
                      🔄 Fetch
                    </button>
                    {!status?.syncStatus && (
                      <button 
                        className="vibehub-btn secondary" 
                        onClick={() => push(true)}
                        disabled={syncing}
                        title="Push and set upstream branch"
                      >
                        ⬆️ Push & Track
                      </button>
                    )}
                  </div>
                </div>

                {/* Remotes */}
                <div className="vibehub-section">
                  <h4>🌐 Remotes</h4>
                  {status?.remotes && status.remotes.length > 0 ? (
                    <div className="remotes-list">
                      {status.remotes.map((remote, i) => (
                        <div key={i} className="remote-item">
                          <span className="remote-name">{remote.name}</span>
                          <span className="remote-url" title={remote.fetchUrl}>{remote.fetchUrl}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-remotes">
                      <p>No remotes configured yet.</p>
                    </div>
                  )}

                  {showAddRemote ? (
                    <div className="add-remote-form">
                      <input
                        type="text"
                        placeholder="Remote name (e.g., origin)"
                        value={newRemoteName}
                        onChange={(e) => setNewRemoteName(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Remote URL (e.g., https://github.com/...)"
                        value={newRemoteUrl}
                        onChange={(e) => setNewRemoteUrl(e.target.value)}
                      />
                      <div className="form-actions">
                        <button className="vibehub-btn primary" onClick={addRemote}>Add</button>
                        <button className="vibehub-btn secondary" onClick={() => setShowAddRemote(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      className="vibehub-btn secondary full-width"
                      onClick={() => setShowAddRemote(true)}
                    >
                      + Add Remote
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* STASH TAB */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'stash' && (
              <div className="vibehub-stash">
                {/* Create Stash */}
                <div className="vibehub-section">
                  <h4>📦 Save Work-in-Progress</h4>
                  <div className="stash-create">
                    <input
                      type="text"
                      placeholder="Stash message (optional)"
                      value={stashMessage}
                      onChange={(e) => setStashMessage(e.target.value)}
                    />
                    <button 
                      className="vibehub-btn primary" 
                      onClick={createStash}
                      disabled={!status?.hasUnstagedChanges && !status?.hasReadyToSave}
                    >
                      📦 Stash Changes
                    </button>
                  </div>
                </div>

                {/* Stash List */}
                <div className="vibehub-section">
                  <h4>📚 Saved Stashes</h4>
                  {stashes.length === 0 ? (
                    <div className="no-stashes">
                      <p>No stashes saved. Stash your work to switch branches safely.</p>
                    </div>
                  ) : (
                    <div className="stash-list">
                      {stashes.map((stash) => (
                        <div key={stash.id} className="stash-item">
                          <div className="stash-info">
                            <span className="stash-message">{stash.message}</span>
                            <span className="stash-meta">
                              {stash.branch} • {formatTime(stash.timestamp)}
                            </span>
                          </div>
                          <div className="stash-actions">
                            <button 
                              className="action-btn" 
                              onClick={() => applyStash(stash.id, false)}
                              title="Apply (keep stash)"
                            >
                              📋
                            </button>
                            <button 
                              className="action-btn" 
                              onClick={() => applyStash(stash.id, true)}
                              title="Pop (apply and delete)"
                            >
                              📤
                            </button>
                            <button 
                              className="action-btn delete" 
                              onClick={() => dropStash(stash.id)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VibeHubPanel;
