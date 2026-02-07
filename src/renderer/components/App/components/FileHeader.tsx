/**
 * FileHeader - Current file info bar above editor
 */

import React from 'react';
import { FileItem } from '../types';

interface FileHeaderProps {
  selectedFile: FileItem | null;
  hasChanges: boolean;
}

export const FileHeader: React.FC<FileHeaderProps> = ({
  selectedFile,
  hasChanges
}) => {
  if (!selectedFile) return null;

  const getFileIcon = (name: string) => {
    if (name.endsWith('.js')) return 'JS';
    if (name.endsWith('.ts')) return 'TS';
    if (name.endsWith('.py')) return 'PY';
    if (name.endsWith('.html')) return 'HTML';
    if (name.endsWith('.css')) return 'CSS';
    if (name.endsWith('.md')) return 'MD';
    return 'FILE';
  };

  return (
    <div className="file-header">
      <div className="file-info">
        <span className="file-icon">{getFileIcon(selectedFile.name)}</span>
        <span className="file-name">{selectedFile.name}</span>
        {hasChanges && <span className="unsaved">●</span>}
        <span className="file-path">{selectedFile.path}</span>
      </div>
    </div>
  );
};

export default FileHeader;

