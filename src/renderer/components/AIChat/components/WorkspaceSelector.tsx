/**
 * WorkspaceSelector - Button to select workspace folder and create new folders
 */

import React, { useState } from 'react';

interface WorkspaceSelectorProps {
  workspacePath: string | null;
  onOpenFolder: () => void;
  onCreateFolder?: () => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  workspacePath,
  onOpenFolder,
  onCreateFolder
}) => {
  const handleCreateFolder = () => {
    if (!onCreateFolder) return;
    onCreateFolder();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        onClick={onOpenFolder}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '10px',
          border: workspacePath ? '1px solid var(--prime-success)' : '1px dashed var(--prime-border)',
          background: workspacePath ? 'var(--prime-accent-light)' : 'var(--prime-bg)',
          color: workspacePath ? 'var(--prime-success)' : 'var(--prime-text-secondary)',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          maxWidth: '200px'
        }}
        title={workspacePath || 'Click to select a workspace folder'}
      >
        <span style={{ fontSize: '16px' }}>📂</span>
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          maxWidth: '140px'
        }}>
          {workspacePath ? workspacePath.split(/[/\\]/).pop() : 'Select Folder'}
        </span>
      </button>

      {onCreateFolder && (
        <button
          onClick={handleCreateFolder}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid var(--prime-blue)',
            background: `linear-gradient(135deg, var(--prime-blue) 0%, var(--accent-primary) 100%)`,
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          title="Create and name a new project folder"
        >
          <span style={{ fontSize: '14px' }}>➕</span>
          <span>New Folder...</span>
        </button>
      )}
    </div>
  );
};

export default WorkspaceSelector;

