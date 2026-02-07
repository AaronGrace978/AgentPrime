import React, { useState } from 'react';
import { useGitStatus } from './GitStatus';
import {
  IconGitBranch,
  IconGitCommit,
  IconRefresh,
  IconPlus,
  IconMinus,
  IconCheck,
  IconClose,
  IconChevronDown,
  IconChevronRight,
  IconError,
  IconSuccess,
  IconSpinner,
  getFileIcon,
  IconFile,
  IconDownload,
  IconUpload,
  IconSave
} from './Icons';

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string | null;
}

interface GitPanelProps {
  onFileSelect?: (file: FileItem) => void;
  onCommitClick?: () => void;
  workspacePath?: string;
}

const GitPanel: React.FC<GitPanelProps> = ({ onFileSelect, onCommitClick, workspacePath }) => {
  const { status, loading, refresh } = useGitStatus();
  const [expandedSections, setExpandedSections] = useState({
    staged: true,
    modified: true,
    untracked: true,
    deleted: false
  });
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; current: boolean; remote: boolean }>>([]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Using getFileIcon from Icons.tsx
  const getGitFileIcon = (filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    return getFileIcon(fileName, false);
  };

  const handleFileClick = (filePath: string) => {
    if (onFileSelect) {
      // Create a basic FileItem for the selected file
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      const fileItem: FileItem = {
        name: fileName,
        path: filePath,
        is_dir: false,
        extension: fileName.split('.').pop() || null
      };
      onFileSelect(fileItem);
    }
  };

  const handleStage = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await window.agentAPI.gitStage(filePath);
      if (result.success) {
        refresh();
      }
    } catch (error: any) {
      console.error('Stage error:', error);
    }
  };

  const handleUnstage = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await window.agentAPI.gitUnstage(filePath);
      if (result.success) {
        refresh();
      }
    } catch (error: any) {
      console.error('Unstage error:', error);
    }
  };

  const handleViewDiff = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoadingDiff(true);
    setShowDiff(filePath);
    try {
      const result = await window.agentAPI.gitDiff(filePath);
      if (result.success) {
        setDiffContent(result.output || 'No changes');
      } else {
        setDiffContent(result.error || 'Error loading diff');
      }
    } catch (error: any) {
      setDiffContent(`Error: ${error.message}`);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handlePush = async () => {
    try {
      const result = await window.agentAPI.gitPush();
      if (result.success) {
        alert('Pushed successfully');
        refresh();
      } else {
        alert(`Push failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Push error: ${error.message}`);
    }
  };

  const handlePull = async () => {
    try {
      const result = await window.agentAPI.gitPull();
      if (result.success) {
        alert('Pulled successfully');
        refresh();
      } else {
        alert(`Pull failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Pull error: ${error.message}`);
    }
  };

  const loadBranches = async () => {
    try {
      const result = await window.agentAPI.gitBranches();
      if (result.success) {
        setBranches(result.branches || []);
        setShowBranches(true);
      }
    } catch (error: any) {
      console.error('Load branches error:', error);
    }
  };

  const handleCheckout = async (branch: string) => {
    try {
      const result = await window.agentAPI.gitCheckout(branch);
      if (result.success) {
        refresh();
        setShowBranches(false);
      } else {
        alert(`Checkout failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Checkout error: ${error.message}`);
    }
  };

  const renderFileList = (files: string[], section: string, indicator: string, canStage: boolean = false, canUnstage: boolean = false) => {
    if (!files || files.length === 0) return null;

    return (
      <div className="git-files-list">
        {files.map((filePath, index) => (
          <div
            key={`${section}-${filePath}-${index}`}
            className="git-file-item"
            title={filePath}
          >
            <div className="git-file-main" onClick={() => handleFileClick(filePath)}>
              <span className="file-icon">{getGitFileIcon(filePath)}</span>
              <span className="file-name">{filePath.split(/[/\\]/).pop()}</span>
              <span className={`git-indicator git-${section.toLowerCase()}`}>
                {indicator}
              </span>
            </div>
            <div className="git-file-actions">
              <button
                className="git-action-btn icon-btn-only"
                onClick={(e) => handleViewDiff(filePath, e)}
                title="View diff"
              >
                <IconFile size="xs" />
              </button>
              {canStage && (
                <button
                  className="git-action-btn icon-btn-only"
                  onClick={(e) => handleStage(filePath, e)}
                  title="Stage"
                >
                  <IconPlus size="xs" />
                </button>
              )}
              {canUnstage && (
                <button
                  className="git-action-btn icon-btn-only"
                  onClick={(e) => handleUnstage(filePath, e)}
                  title="Unstage"
                >
                  <IconMinus size="xs" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSection = (
    title: string,
    files: string[],
    sectionKey: keyof typeof expandedSections,
    indicator: string,
    bgColor: string,
    canStage: boolean = false,
    canUnstage: boolean = false
  ) => {
    if (!files || files.length === 0) return null;

    return (
      <div className="git-section">
        <div
          className="git-section-header"
          onClick={() => toggleSection(sectionKey)}
          style={{ backgroundColor: bgColor }}
        >
          <span className="git-section-toggle">
            {expandedSections[sectionKey] ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
          </span>
          <span className="git-section-title">{title}</span>
          <span className="git-section-count">({files.length})</span>
        </div>

        {expandedSections[sectionKey] && renderFileList(files, sectionKey, indicator, canStage, canUnstage)}
      </div>
    );
  };

  if (!status.success) {
    return (
      <div className="git-panel">
        <div className="git-panel-header">
          <h3><IconGitBranch size="sm" /> Source Control</h3>
          <button onClick={refresh} disabled={loading} title="Refresh" className="icon-btn-only">
            {loading ? <IconSpinner size="sm" /> : <IconRefresh size="sm" />}
          </button>
        </div>
        <div className="git-panel-content">
          {status.error ? (
            <div className="git-error">
              <IconError size="sm" /> Git error: {status.error}
            </div>
          ) : (
            <div className="git-no-repo">
              No Git repository found
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalChanges = (status.staged?.length || 0) +
                      (status.modified?.length || 0) +
                      (status.untracked?.length || 0) +
                      (status.deleted?.length || 0);

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <h3><IconGitBranch size="sm" /> Source Control</h3>
        <div className="git-panel-actions">
          <button onClick={refresh} disabled={loading} title="Refresh" className="icon-btn-only">
            {loading ? <IconSpinner size="sm" /> : <IconRefresh size="sm" />}
          </button>
        </div>
      </div>

      <div className="git-branch-info">
        <div className="branch-header">
          <span className="branch-icon"><IconGitBranch size="sm" /></span>
          <span className="branch-name" onClick={loadBranches} style={{ cursor: 'pointer' }}>
            {status.branch || 'unknown'}
          </span>
          {totalChanges > 0 && (
            <span className="changes-count">• {totalChanges} changes</span>
          )}
        </div>
        <div className="git-remote-actions">
          <button className="git-action-btn-small icon-btn" onClick={handlePull} title="Pull">
            <IconDownload size="xs" /> Pull
          </button>
          <button className="git-action-btn-small icon-btn" onClick={handlePush} title="Push">
            <IconUpload size="xs" /> Push
          </button>
        </div>
        {showBranches && (
          <div className="branches-list">
            <div className="branches-header">
              <span><IconGitBranch size="sm" /> Branches</span>
              <button onClick={() => setShowBranches(false)} className="icon-btn-only">
                <IconClose size="xs" />
              </button>
            </div>
            {branches.map((branch, idx) => (
              <div
                key={idx}
                className={`branch-item ${branch.current ? 'current' : ''}`}
                onClick={() => !branch.current && handleCheckout(branch.name)}
              >
                {branch.current ? <IconCheck size="xs" /> : <IconGitBranch size="xs" />} {branch.name}
                {branch.remote && ' (remote)'}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="git-panel-content">
        {totalChanges === 0 ? (
          <div className="git-clean">
            <IconSuccess size="sm" /> Working tree clean
          </div>
        ) : (
          <>
            <div className="git-sections">
              {renderSection('Staged Changes', status.staged || [], 'staged', 'A', '#1a7f37', false, true)}
              {renderSection('Changes', status.modified || [], 'modified', 'M', '#bb8009', true, false)}
              {renderSection('Untracked Files', status.untracked || [], 'untracked', '?', '#0969da', true, false)}
              {renderSection('Deleted', status.deleted || [], 'deleted', 'D', '#cf222e', false, false)}
            </div>

            {/* Diff Viewer */}
            {showDiff && (
              <div className="git-diff-viewer">
                <div className="diff-header">
                  <span><IconFile size="sm" /> Diff: {showDiff.split(/[/\\]/).pop()}</span>
                  <button onClick={() => setShowDiff(null)} className="icon-btn-only">
                    <IconClose size="xs" />
                  </button>
                </div>
                <div className="diff-content">
                  {isLoadingDiff ? (
                    <div>Loading diff...</div>
                  ) : (
                    <pre>{diffContent}</pre>
                  )}
                </div>
              </div>
            )}

            {/* Commit Button */}
            {(status.staged?.length || status.modified?.length) && (
              <div className="git-commit-section">
                <button
                  className="git-commit-button ap-btn ap-btn-primary ap-btn-md"
                  onClick={onCommitClick}
                  disabled={loading}
                >
                  {loading ? <IconSpinner size="sm" /> : <IconGitCommit size="sm" />} Commit Changes
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GitPanel;
