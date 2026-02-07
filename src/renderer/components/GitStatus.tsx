import React, { useState, useEffect } from 'react';

export interface GitStatus {
  success: boolean;
  branch?: string;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  deleted?: string[];
  error?: string;
}

export const useGitStatus = () => {
  const [status, setStatus] = useState<GitStatus>({ success: false });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      // @ts-ignore - window.agentAPI is injected by preload script
      const result = await window.agentAPI.gitStatus();
      setStatus(result);
    } catch (error: any) {
      setStatus({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const refresh = () => {
    fetchStatus();
  };

  return { status, loading, refresh };
};

export const GitStatusBar: React.FC = () => {
  const { status, loading, refresh } = useGitStatus();

  if (!status.success || status.error) {
    return null; // Don't show if no git repo or error
  }

  const totalChanges = (status.modified?.length || 0) +
                      (status.staged?.length || 0) +
                      (status.untracked?.length || 0) +
                      (status.deleted?.length || 0);

  return (
    <div className="git-status-bar" onClick={refresh} title="Click to refresh Git status">
      <span className="git-branch">
        {loading ? '🔄' : '🌿'} {status.branch || 'unknown'}
      </span>
      {totalChanges > 0 && (
        <span className="git-changes">
          {status.staged && status.staged.length > 0 && (
            <span className="git-staged" title={`${status.staged.length} staged`}>●</span>
          )}
          {status.modified && status.modified.length > 0 && (
            <span className="git-modified" title={`${status.modified.length} modified`}>●</span>
          )}
          {status.untracked && status.untracked.length > 0 && (
            <span className="git-untracked" title={`${status.untracked.length} untracked`}>●</span>
          )}
          {status.deleted && status.deleted.length > 0 && (
            <span className="git-deleted" title={`${status.deleted.length} deleted`}>●</span>
          )}
          <span className="git-count">{totalChanges}</span>
        </span>
      )}
    </div>
  );
};

// Hook to get git status for a specific file
export const useFileGitStatus = (filePath: string): string => {
  const { status } = useGitStatus();

  if (!status.success) return '';

  // Check if file is staged
  if (status.staged?.some(f => f === filePath)) {
    return 'A'; // Added/Staged
  }

  // Check if file is modified
  if (status.modified?.some(f => f === filePath)) {
    return 'M'; // Modified
  }

  // Check if file is deleted
  if (status.deleted?.some(f => f === filePath)) {
    return 'D'; // Deleted
  }

  // Check if file is untracked
  if (status.untracked?.some(f => f === filePath)) {
    return '?'; // Untracked
  }

  return ''; // No git status
};

export default GitStatusBar;
