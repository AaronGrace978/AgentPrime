/**
 * WorkspaceSelector - Button to select workspace folder and create new folders
 */

import React from 'react';

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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        onClick={onOpenFolder}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: '6px',
          border: `1px solid ${workspacePath ? 'var(--prime-success)' : 'var(--prime-border)'}`,
          background: workspacePath ? 'rgba(16, 185, 129, 0.08)' : 'var(--prime-surface)',
          color: workspacePath ? 'var(--prime-success)' : 'var(--prime-text-secondary)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '600',
          fontFamily: 'inherit',
          maxWidth: '180px',
          transition: 'all 0.12s ease'
        }}
        title={workspacePath || 'Select a workspace folder'}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '120px'
        }}>
          {workspacePath ? workspacePath.split(/[/\\]/).pop() : 'Select Folder'}
        </span>
      </button>

      {onCreateFolder && (
        <button
          onClick={onCreateFolder}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '5px 9px',
            borderRadius: '6px',
            border: '1px solid var(--prime-accent)',
            background: 'var(--prime-accent)',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'inherit',
            gap: '4px',
            transition: 'all 0.12s ease'
          }}
          title="Create a new project folder"
        >
          + New
        </button>
      )}
    </div>
  );
};

export default WorkspaceSelector;
