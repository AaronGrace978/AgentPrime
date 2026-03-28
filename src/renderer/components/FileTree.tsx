import React, { useState, useEffect } from 'react';
import { useFileGitStatus } from './GitStatus';
import { 
  IconFolder, 
  IconFolderOpen, 
  IconRefresh, 
  IconFilePlus, 
  IconFolderPlus,
  IconChevronRight,
  IconChevronDown,
  IconSpinner,
  getFileIcon 
} from './Icons';
import { FileTreeSkeleton } from './Skeleton';

interface FileTreeItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string | null;
  children?: FileTreeItem[];
}

interface FileTreeProps {
  onFileSelect: (file: FileTreeItem) => void;
  onFolderSelect?: (folder: FileTreeItem) => void;
  onOpenFolder: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  selectedPath?: string;
  workspacePath?: string;
}

const FileTreeNode: React.FC<{
  item: FileTreeItem;
  level: number;
  selectedPath?: string;
  onFileSelect: (file: FileTreeItem) => void;
  onFolderSelect?: (folder: FileTreeItem) => void;
}> = ({ item, level, selectedPath, onFileSelect, onFolderSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const gitStatus = useFileGitStatus(item.path);

  const handleClick = () => {
    if (item.is_dir) {
      setIsExpanded(!isExpanded);
      onFolderSelect?.(item);
    } else {
      onFileSelect(item);
    }
  };

  const getItemIcon = (name: string, isDir: boolean, isExpanded: boolean) => {
    if (isDir) {
      return isExpanded ? <IconFolderOpen size="sm" /> : <IconFolder size="sm" />;
    }
    return getFileIcon(name, false);
  };

  const getGitIndicator = (status: string) => {
    if (!status) return null;

    const indicators: Record<string, { symbol: string; className: string; title: string }> = {
      'A': { symbol: '●', className: 'git-staged', title: 'Staged' },
      'M': { symbol: '●', className: 'git-modified', title: 'Modified' },
      'D': { symbol: '●', className: 'git-deleted', title: 'Deleted' },
      '?': { symbol: '●', className: 'git-untracked', title: 'Untracked' }
    };

    const indicator = indicators[status];
    if (!indicator) return null;

    return (
      <span
        className={`git-indicator ${indicator.className}`}
        title={indicator.title}
      >
        {indicator.symbol}
      </span>
    );
  };

  return (
    <div>
      <div
        className={`file-tree-item ${item.path === selectedPath ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="file-icon">
          {item.is_dir && (item.children?.length || 0) > 0 && (
            <span className="expand-icon">
              {isExpanded ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
            </span>
          )}
          {getItemIcon(item.name, item.is_dir, isExpanded)}
        </span>
        <span className="file-name" title={item.path}>
          {item.name}
          {getGitIndicator(gitStatus)}
        </span>
      </div>

      {item.is_dir && isExpanded && item.children && (
        <div>
          {item.children.map((child, index) => (
            <FileTreeNode
              key={`${child.path}-${index}`}
              item={child}
              level={level + 1}
              selectedPath={selectedPath}
              onFileSelect={onFileSelect}
              onFolderSelect={onFolderSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({
  onFileSelect,
  onFolderSelect,
  onOpenFolder,
  onCreateFile,
  onCreateFolder,
  onRefresh,
  selectedPath,
  workspacePath
}) => {
  const [files, setFiles] = useState<FileTreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.agentAPI.readTree();
      if (result.error) {
        setError(result.error);
      } else {
        setFiles(result.tree || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspacePath) {
      loadFiles();
    }
  }, [workspacePath]);  // loadFiles is stable (no deps that change) - safe to omit

  const handleRefresh = () => {
    loadFiles();
    onRefresh();
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <div className="file-tree-actions">
          <button onClick={onOpenFolder} title="Open Folder" className="icon-btn">
            <IconFolderOpen size="sm" /> <span>Open</span>
          </button>
          <button onClick={onCreateFile} title="New File" className="icon-btn">
            <IconFilePlus size="sm" /> <span>File</span>
          </button>
          <button onClick={onCreateFolder} title="New Folder" className="icon-btn">
            <IconFolderPlus size="sm" /> <span>Folder</span>
          </button>
          <button onClick={handleRefresh} title="Refresh" disabled={loading} className="icon-btn">
            {loading ? <IconSpinner size="sm" /> : <IconRefresh size="sm" />}
          </button>
        </div>

        {workspacePath && (
          <div className="workspace-info">
            <span className="workspace-path" title={workspacePath}>
              <IconFolder size="xs" /> {workspacePath.split(/[/\\]/).pop()}
            </span>
          </div>
        )}
      </div>

      <div className="file-tree-content">
        {error && (
          <div className="file-tree-error">
            {error}
          </div>
        )}

        {!workspacePath && !error && (
          <div className="file-tree-empty">
            <p>No workspace opened</p>
            <button onClick={onOpenFolder} className="icon-btn">
              <IconFolderOpen size="sm" /> Open Folder
            </button>
          </div>
        )}

        {workspacePath && loading && (
          <FileTreeSkeleton count={8} />
        )}

        {workspacePath && !loading && files.length === 0 && !error && (
          <div className="file-tree-empty">
            <p>Empty workspace</p>
            <button onClick={onCreateFile} className="icon-btn">
              <IconFilePlus size="sm" /> Create File
            </button>
          </div>
        )}

        {!loading && files.map((file, index) => (
          <FileTreeNode
            key={`${file.path}-${index}`}
            item={file}
            level={0}
            selectedPath={selectedPath}
            onFileSelect={onFileSelect}
            onFolderSelect={onFolderSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
