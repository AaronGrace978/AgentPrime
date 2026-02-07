import React, { useRef, useCallback } from 'react';
import MonacoEditor, { MonacoEditorRef } from './MonacoEditor';
import TabBar from './TabBar';
import ErrorBoundary from './ErrorBoundary';
import { getLanguage } from '../utils';

// Shared types for split view system
export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string | null;
  content?: string;
}

export interface OpenFile {
  file: FileItem;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

export interface EditorPaneData {
  id: string;
  tabs: OpenFile[];
  activeTabIndex: number;
  scrollPosition: { line: number; column: number };
  syncScrolling: boolean;
}

export interface EditorPaneProps {
  pane: EditorPaneData;
  paneIndex: number;
  totalPanes: number;
  workspacePath: string;
  theme?: 'vs' | 'vs-dark';
  codeIssues: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
    ruleId: string;
  }>;
  onContentChange: (paneId: string, content: string) => void;
  onTabClick: (paneId: string, tabIndex: number) => void;
  onTabClose: (paneId: string, tabIndex: number) => void;
  onTabReorder: (paneId: string, fromIndex: number, toIndex: number) => void;
  onSave: (paneId: string, tabIndex?: number) => void;
  onRun: () => void;
  onClosePane: (paneId: string) => void;
  onSplitPane: (paneId: string, direction: 'horizontal' | 'vertical') => void;
  onScrollChange?: (paneId: string, line: number, column: number) => void;
  canClose: boolean;
}

const EditorPane: React.FC<EditorPaneProps> = ({
  pane,
  paneIndex,
  totalPanes,
  workspacePath,
  theme = 'vs-dark',
  codeIssues,
  onContentChange,
  onTabClick,
  onTabClose,
  onTabReorder,
  onSave,
  onRun,
  onClosePane,
  onSplitPane,
  onScrollChange,
  canClose
}) => {
  const editorRef = useRef<MonacoEditorRef | null>(null);

  const activeFile = pane.activeTabIndex >= 0 && pane.activeTabIndex < pane.tabs.length 
    ? pane.tabs[pane.activeTabIndex] 
    : null;
  const selectedFile = activeFile?.file || null;
  const fileContent = activeFile?.content || '';
  const hasChanges = activeFile?.isDirty || false;

  const handleContentChange = useCallback((newContent: string) => {
    onContentChange(pane.id, newContent);
  }, [pane.id, onContentChange]);

  const handleTabClick = useCallback((index: number) => {
    onTabClick(pane.id, index);
  }, [pane.id, onTabClick]);

  const handleTabClose = useCallback((index: number) => {
    onTabClose(pane.id, index);
  }, [pane.id, onTabClose]);

  const handleTabReorder = useCallback((from: number, to: number) => {
    onTabReorder(pane.id, from, to);
  }, [pane.id, onTabReorder]);

  const handleSave = useCallback(() => {
    onSave(pane.id);
  }, [pane.id, onSave]);

  // Get file type icon
  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': return 'JS';
      case 'jsx': return 'JSX';
      case 'ts': return 'TS';
      case 'tsx': return 'TSX';
      case 'py': return 'PY';
      case 'html': return 'HTML';
      case 'css': return 'CSS';
      case 'scss': return 'SCSS';
      case 'json': return 'JSON';
      case 'md': return 'MD';
      case 'yaml':
      case 'yml': return 'YAML';
      case 'go': return 'GO';
      case 'rs': return 'RS';
      case 'java': return 'JAVA';
      default: return 'FILE';
    }
  };

  return (
    <div className="editor-pane">
      {/* Pane Header with controls */}
      <div className="pane-header">
        <div className="pane-tabs-container">
          <TabBar
            openFiles={pane.tabs}
            activeFileIndex={pane.activeTabIndex}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabMiddleClick={handleTabClose}
            onTabReorder={handleTabReorder}
          />
        </div>
        
        <div className="pane-controls">
          {/* Split buttons */}
          <button 
            className="pane-control-btn" 
            onClick={() => onSplitPane(pane.id, 'vertical')}
            title="Split Right"
          >
            ⫿
          </button>
          <button 
            className="pane-control-btn" 
            onClick={() => onSplitPane(pane.id, 'horizontal')}
            title="Split Down"
          >
            ⊟
          </button>
          
          {/* Close pane button - only show if we can close */}
          {canClose && (
            <button 
              className="pane-control-btn close" 
              onClick={() => onClosePane(pane.id)}
              title="Close Pane"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Editor Content */}
      {selectedFile ? (
        <div className="pane-editor-area">
          {/* File Header */}
          <div className="file-header compact">
            <div className="file-info">
              <span className="file-icon">{getFileIcon(selectedFile.name)}</span>
              <span className="file-name">{selectedFile.name}</span>
              {hasChanges && <span className="unsaved">●</span>}
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="editor-container">
            <ErrorBoundary>
              <MonacoEditor
                ref={editorRef}
                value={fileContent}
                language={getLanguage(selectedFile.name)}
                onChange={handleContentChange}
                onSave={handleSave}
                onRun={onRun}
                theme={theme}
                filePath={selectedFile.path}
                workspacePath={workspacePath}
                issues={codeIssues}
              />
            </ErrorBoundary>
          </div>
        </div>
      ) : (
        <div className="pane-empty">
          <div className="pane-empty-content">
            <span className="pane-empty-icon">📄</span>
            <p>No file open</p>
            <p className="pane-empty-hint">Open a file from the sidebar or drag one here</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPane;

