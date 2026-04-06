import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

function flattenVisible(
  items: FileTreeItem[],
  expanded: Set<string>,
  level = 0
): Array<{ item: FileTreeItem; level: number }> {
  const out: Array<{ item: FileTreeItem; level: number }> = [];
  for (const item of items) {
    out.push({ item, level });
    if (item.is_dir && item.children?.length && expanded.has(item.path)) {
      out.push(...flattenVisible(item.children, expanded, level + 1));
    }
  }
  return out;
}

interface FileTreeRowProps {
  item: FileTreeItem;
  level: number;
  selectedPath?: string;
  expanded: boolean;
  onFileSelect: (file: FileTreeItem) => void;
  onFolderSelect?: (folder: FileTreeItem) => void;
  onToggleDir: (path: string) => void;
}

const FileTreeRow = memo(({
  item,
  level,
  selectedPath,
  expanded,
  onFileSelect,
  onFolderSelect,
  onToggleDir
}: FileTreeRowProps) => {
  const gitStatus = useFileGitStatus(item.path);

  const handleClick = useCallback(() => {
    if (item.is_dir) {
      onToggleDir(item.path);
      onFolderSelect?.(item);
    } else {
      onFileSelect(item);
    }
  }, [item, onFileSelect, onFolderSelect, onToggleDir]);

  const getItemIcon = (name: string, isDir: boolean, isOpen: boolean) => {
    if (isDir) {
      return isOpen ? <IconFolderOpen size="sm" /> : <IconFolder size="sm" />;
    }
    return getFileIcon(name, false);
  };

  const getGitIndicator = (status: string) => {
    if (!status) return null;
    const indicators: Record<string, { symbol: string; className: string; title: string }> = {
      A: { symbol: '●', className: 'git-staged', title: 'Staged' },
      M: { symbol: '●', className: 'git-modified', title: 'Modified' },
      D: { symbol: '●', className: 'git-deleted', title: 'Deleted' },
      '?': { symbol: '●', className: 'git-untracked', title: 'Untracked' }
    };
    const indicator = indicators[status];
    if (!indicator) return null;
    return (
      <span className={`git-indicator ${indicator.className}`} title={indicator.title}>
        {indicator.symbol}
      </span>
    );
  };

  return (
    <div
      className={`file-tree-item ${item.path === selectedPath ? 'selected' : ''}`}
      style={{ paddingLeft: `${level * 16 + 8}px` }}
      onClick={handleClick}
    >
      <span className="file-icon">
        {item.is_dir && (item.children?.length || 0) > 0 && (
          <span className="expand-icon">
            {expanded ? <IconChevronDown size="xs" /> : <IconChevronRight size="xs" />}
          </span>
        )}
        {getItemIcon(item.name, item.is_dir, expanded)}
      </span>
      <span className="file-name" title={item.path}>
        {item.name}
        {getGitIndicator(gitStatus)}
      </span>
    </div>
  );
});

const FileTreeComponent: React.FC<FileTreeProps> = ({
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const scrollParentRef = useRef<HTMLDivElement>(null);

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
  }, [workspacePath]);

  useEffect(() => {
    setExpandedPaths(new Set());
  }, [workspacePath]);

  const handleRefresh = () => {
    loadFiles();
    onRefresh();
  };

  const rows = useMemo(() => flattenVisible(files, expandedPaths), [files, expandedPaths]);

  const toggleDir = useCallback((p: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 34,
    overscan: 16
  });

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

      <div className="file-tree-content" ref={scrollParentRef}>
        {error && <div className="file-tree-error">{error}</div>}

        {!workspacePath && !error && (
          <div className="file-tree-empty">
            <p>No workspace opened</p>
            <button onClick={onOpenFolder} className="icon-btn">
              <IconFolderOpen size="sm" /> Open Folder
            </button>
          </div>
        )}

        {workspacePath && loading && <FileTreeSkeleton count={8} />}

        {workspacePath && !loading && files.length === 0 && !error && (
          <div className="file-tree-empty">
            <p>Empty workspace</p>
            <button onClick={onCreateFile} className="icon-btn">
              <IconFilePlus size="sm" /> Create File
            </button>
          </div>
        )}

        {workspacePath && !loading && files.length > 0 && !error && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const { item, level } = rows[v.index];
              const isOpen = item.is_dir && expandedPaths.has(item.path);
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${v.start}px)`
                  }}
                >
                  <FileTreeRow
                    item={item}
                    level={level}
                    selectedPath={selectedPath}
                    expanded={isOpen}
                    onFileSelect={onFileSelect}
                    onFolderSelect={onFolderSelect}
                    onToggleDir={toggleDir}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const FileTree = memo(FileTreeComponent);

export default FileTree;
