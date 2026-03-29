/**
 * App - Lean core IDE shell
 *
 * Core surface only:
 * - Explorer + tabs + editor
 * - AI composer sidebar
 * - Settings, command palette, search/replace
 * - Optional git sidebar
 */

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import MonacoEditor, { MonacoEditorRef } from '../MonacoEditor';
import CreateModal from '../CreateModal';
import TemplateModal from '../TemplateModal';
import TabBar from '../TabBar';
import CommitDialog from '../CommitDialog';
import SearchReplace from '../SearchReplace';
import ErrorBoundary from '../ErrorBoundary';
import SplitViewContainer from '../SplitViewContainer';
import SettingsPanel from '../SettingsPanel';
import StatusBar from '../StatusBar';
import CommandPalette from '../CommandPalette';
import FileTree from '../FileTree';
import { ToastContainer, useToast } from '../Toast';
import { getLanguage } from '../../utils';
import {
  IconBot,
  IconChevronLeft,
  IconChevronRight,
  IconSpinner,
  IconFolder,
  IconFile,
  IconSave,
  IconSplit,
  IconTerminal,
  IconGitBranch,
  IconGitCommit,
  IconSearch,
  IconSettings,
  IconPlay
} from '../Icons';

const AIChat = React.lazy(() => import('../AIChat'));
const GitPanel = React.lazy(() => import('../GitPanel'));
const Terminal = React.lazy(() => import('../Terminal'));
const LivePreview = React.lazy(() => import('../LivePreview'));
const DeployPanel = React.lazy(() => import('../DeployPanel'));
const InlineEditDialog = React.lazy(() => import('../InlineEditDialog'));
const MultiFileDiffReview = React.lazy(() => import('../MultiFileDiffReview'));

import { OpenFile, FileItem, Command } from './types';
import {
  useFileOperations,
  useTabManagement,
  useScriptRunner,
  useTheme,
  useRecentProjects
} from './hooks';
import {
  AppHeader,
  WelcomeScreen,
  OutputPanel,
  FileHeader
} from './components';

import '../../vibe-styles.css';

function App() {
  const toast = useToast();
  const editorRef = useRef<MonacoEditorRef | null>(null);

  const {
    openFiles,
    activeFileIndex,
    activeFile,
    workspacePath,
    currentPath,
    openFile,
    saveFile,
    openFolder,
    createItem,
    loadDirectory,
    handleContentChange,
    setOpenFiles,
    setActiveFileIndex
  } = useFileOperations({
    onToastSuccess: toast.success,
    onToastError: toast.error
  });

  const { closeTab, reorderTabs, switchTab } = useTabManagement({
    openFiles,
    activeFileIndex,
    setOpenFiles,
    setActiveFileIndex
  });

  const {
    isRunning,
    runOutput,
    terminalVisible,
    setTerminalVisible,
    runScript: executeScript
  } = useScriptRunner();

  const { currentTheme, themeType, setTheme } = useTheme();
  const { recentProjects } = useRecentProjects(workspacePath);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder'>('file');
  const [composerOpen, setComposerOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [useSplitView, setUseSplitView] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(true);
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  const [livePreviewUrl, setLivePreviewUrl] = useState('http://localhost:3000');
  const [deployPanelOpen, setDeployPanelOpen] = useState(false);
  const [inlineEditRequest, setInlineEditRequest] = useState<any>(null);
  const [inlineEditProcessing, setInlineEditProcessing] = useState(false);
  const [codeIssues] = useState<any[]>([]);
  const [appSettings, setAppSettings] = useState<any>({
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on',
    minimap: true,
    lineNumbers: 'on',
    autoSave: true,
    inlineCompletions: true,
    providers: {}
  });

  const selectedFile = activeFile?.file || null;
  const fileContent = activeFile?.content || '';
  const hasChanges = activeFile?.isDirty || false;
  const workspaceName = currentPath ? currentPath.split(/[/\\]/).pop() || 'Workspace' : 'AgentPrime';

  // Keep backend in sync with the active file for completion context
  useEffect(() => {
    window.agentAPI.setActiveFilePath(selectedFile?.path ?? null);
  }, [selectedFile?.path]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings) setAppSettings(settings);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const initWorkspace = async () => {
      try {
        const workspace = await window.agentAPI.getWorkspace();
        if (workspace) {
          await loadDirectory(workspace);
        }
      } catch (error: any) {
        console.error('Failed to initialize workspace:', error.message);
      }
    };
    initWorkspace();
  }, [loadDirectory]);

  const handleSettingsChange = useCallback(async (newSettings: any) => {
    try {
      await window.agentAPI.updateSettings(newSettings);
      setAppSettings((prev: any) => ({ ...prev, ...newSettings }));
      toast.success('Settings Saved', 'Your preferences have been updated');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Settings Error', 'Failed to save settings');
    }
  }, [toast]);

  const runScript = useCallback(() => {
    if (selectedFile) {
      executeScript(selectedFile);
    }
  }, [selectedFile, executeScript]);

  const openUserGuide = useCallback(async () => {
    const userGuideUrl = 'https://github.com/AaronGrace978/AgentPrime/blob/main/docs/USER_GUIDE.md';
    try {
      const result = await window.agentAPI.openExternal(userGuideUrl);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to open user guide');
      }
    } catch (error) {
      console.error('Failed to open user guide:', error);
      toast.error('Unable to Open User Guide', `Open ${userGuideUrl} in your browser.`);
    }
  }, [toast]);

  const handleSplitViewOpenFile = useCallback(async (file: FileItem): Promise<OpenFile | null> => {
    if (file.is_dir) return null;
    try {
      const result = await window.agentAPI.readFile(file.path);
      if (result.content !== undefined) {
        return {
          file,
          content: result.content,
          originalContent: result.content,
          isDirty: false
        };
      }
    } catch (err: any) {
      console.error(`Error opening file: ${err.message}`);
    }
    return null;
  }, []);

  const handleSplitViewSaveFile = useCallback(async (openFile: OpenFile): Promise<boolean> => {
    try {
      const result = await window.agentAPI.writeFile(openFile.file.path, openFile.content);
      return result.success;
    } catch (err: any) {
      console.error(`Error saving file: ${err.message}`);
      return false;
    }
  }, []);

  const handleSplitViewFilesChange = useCallback((allFiles: OpenFile[]) => {
    setOpenFiles(allFiles);
    if (allFiles.length === 0) {
      setActiveFileIndex(-1);
    }
  }, [setOpenFiles, setActiveFileIndex]);

  const handleSplitViewActiveFileChange = useCallback((file: OpenFile | null) => {
    if (!file) return;
    const index = openFiles.findIndex((f) => f.file.path === file.file.path);
    if (index >= 0) {
      setActiveFileIndex(index);
    }
  }, [openFiles, setActiveFileIndex]);

  const getSelectedText = useCallback((): string | undefined => {
    return editorRef.current?.getSelectedText?.();
  }, []);

  const getCurrentFileInfo = useCallback(() => {
    if (!activeFile) return null;
    return {
      name: activeFile.file.name,
      path: activeFile.file.path,
      language: getLanguage(activeFile.file.name),
      lines: activeFile.content.split('\n').length
    };
  }, [activeFile]);

  // Listen for Cmd+K inline edit events from Monaco
  useEffect(() => {
    const handleInlineEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setInlineEditRequest(detail);
    };
    window.addEventListener('agentprime:inlineEdit', handleInlineEdit);
    return () => window.removeEventListener('agentprime:inlineEdit', handleInlineEdit);
  }, []);

  const handleInlineEditSubmit = useCallback(async (instruction: string, request: any) => {
    setInlineEditProcessing(true);
    try {
      const result = await window.agentAPI.quickAction(
        'edit',
        request.selectedText,
        request.language
      );
      if (result?.code) {
        handleContentChange(
          fileContent.split('\n')
            .map((line: string, i: number) => {
              const lineNum = i + 1;
              if (lineNum >= request.startLine && lineNum <= request.endLine) {
                return null;
              }
              return line;
            })
            .filter((l: string | null) => l !== null)
            .join('\n')
            .replace(
              fileContent.split('\n')[request.startLine - 1] || '',
              result.code
            )
        );
        toast.success('Inline Edit Applied', instruction.substring(0, 40));
      }
    } catch (error: any) {
      toast.error('Inline Edit Failed', error.message);
    } finally {
      setInlineEditProcessing(false);
      setInlineEditRequest(null);
    }
  }, [fileContent, handleContentChange, toast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'l') {
        e.preventDefault();
        setComposerOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'n') {
        e.preventDefault();
        setTemplateModalOpen(true);
        return;
      }

      if (mod && key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (activeFile?.isDirty) {
          saveFile();
        }
        return;
      }

      if (mod && key === 'o') {
        e.preventDefault();
        openFolder();
        return;
      }

      if (mod && key === 'b') {
        e.preventDefault();
        setFileExplorerOpen((prev) => !prev);
        return;
      }

      if (mod && e.key === '`') {
        e.preventDefault();
        setTerminalVisible(!terminalVisible);
        return;
      }

      if (e.key === 'F5' && !mod) {
        e.preventDefault();
        runScript();
        return;
      }

      if (mod && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (openFiles.length > 1) {
          switchTab((activeFileIndex + 1) % openFiles.length);
        }
        return;
      }

      if (mod && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        if (openFiles.length > 1) {
          switchTab(activeFileIndex === 0 ? openFiles.length - 1 : activeFileIndex - 1);
        }
        return;
      }

      if (mod && key === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeFileIndex >= 0) {
          closeTab(activeFileIndex);
        }
        return;
      }

      if (mod && e.shiftKey && key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        setSearchReplaceOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'g') {
        e.preventDefault();
        setGitPanelOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'p') {
        e.preventDefault();
        setLivePreviewOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'd') {
        e.preventDefault();
        setDeployPanelOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (searchReplaceOpen) {
          setSearchReplaceOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeFile,
    activeFileIndex,
    closeTab,
    commandPaletteOpen,
    openFiles,
    openFolder,
    runScript,
    saveFile,
    searchReplaceOpen,
    setTerminalVisible,
    switchTab,
    terminalVisible
  ]);

  const commands: Command[] = [
    {
      id: 'open-folder',
      title: 'Open Project',
      description: 'Open a folder as workspace',
      icon: <IconFolder size="sm" />,
      category: 'file',
      shortcut: 'Ctrl+O',
      action: openFolder
    },
    {
      id: 'new-file',
      title: 'New File',
      description: 'Create a new file',
      icon: <IconFile size="sm" />,
      category: 'file',
      action: () => {
        setModalType('file');
        setModalOpen(true);
      }
    },
    {
      id: 'save-file',
      title: 'Save File',
      description: 'Save current file',
      icon: <IconSave size="sm" />,
      category: 'file',
      shortcut: 'Ctrl+S',
      action: () => saveFile()
    },
    {
      id: 'ai-chat',
      title: 'AI Composer',
      description: 'Open AI coding assistant',
      icon: <IconBot size="sm" />,
      category: 'ai',
      shortcut: 'Ctrl+L',
      action: () => setComposerOpen(true)
    },
    {
      id: 'toggle-split',
      title: 'Toggle Split View',
      description: 'Split editor view',
      icon: <IconSplit size="sm" />,
      category: 'view',
      action: () => setUseSplitView((prev) => !prev)
    },
    {
      id: 'toggle-terminal',
      title: 'Toggle Output',
      description: 'Show or hide run output',
      icon: <IconTerminal size="sm" />,
      category: 'view',
      shortcut: 'Ctrl+`',
      action: () => setTerminalVisible(!terminalVisible)
    },
    {
      id: 'git-panel',
      title: 'Source Control',
      description: 'Open Git panel',
      icon: <IconGitBranch size="sm" />,
      category: 'git',
      shortcut: 'Ctrl+Shift+G',
      action: () => setGitPanelOpen((prev) => !prev)
    },
    {
      id: 'git-commit',
      title: 'Commit Changes',
      description: 'Create a new commit',
      icon: <IconGitCommit size="sm" />,
      category: 'git',
      action: () => setCommitDialogOpen(true)
    },
    {
      id: 'search-replace',
      title: 'Search & Replace',
      description: 'Search and replace across files',
      icon: <IconSearch size="sm" />,
      category: 'file',
      shortcut: 'Ctrl+Shift+F',
      action: () => setSearchReplaceOpen(true)
    },
    {
      id: 'settings',
      title: 'Settings',
      description: 'Configure editor and AI',
      icon: <IconSettings size="sm" />,
      category: 'settings',
      action: () => setSettingsOpen(true)
    },
    {
      id: 'run-code',
      title: 'Run Current File',
      description: 'Execute selected file',
      icon: <IconPlay size="sm" />,
      category: 'navigation',
      shortcut: 'F5',
      action: runScript
    },
    {
      id: 'live-preview',
      title: 'Live Preview',
      description: 'Open live preview panel for web projects',
      icon: <IconPlay size="sm" />,
      category: 'view',
      action: () => setLivePreviewOpen(true)
    },
    {
      id: 'deploy',
      title: 'Deploy Project',
      description: 'Deploy to Vercel or Netlify',
      icon: <IconPlay size="sm" />,
      category: 'navigation',
      action: () => setDeployPanelOpen(true)
    }
  ];

  return (
    <ErrorBoundary>
      <div className={`app ${composerOpen ? 'ai-composer-prominent' : ''}`}>
        <AppHeader
          workspaceName={workspaceName}
          selectedFile={selectedFile}
          hasChanges={hasChanges}
          isRunning={isRunning}
          useSplitView={useSplitView}
          gitPanelOpen={gitPanelOpen}
          onOpenFolder={openFolder}
          onOpenComposer={() => setComposerOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSaveFile={() => saveFile()}
          onRunScript={runScript}
          onToggleSplitView={() => setUseSplitView((prev) => !prev)}
          onToggleGitPanel={() => setGitPanelOpen((prev) => !prev)}
        />

        <div className="app-main">
          <div className="app-layout">
            <div className={`file-explorer-sidebar ${fileExplorerOpen ? 'open' : ''}`}>
              <div className="file-explorer-header">
                <h3>Explorer</h3>
                <button
                  className="sidebar-toggle"
                  onClick={() => setFileExplorerOpen((prev) => !prev)}
                  title={fileExplorerOpen ? 'Collapse' : 'Expand'}
                >
                  {fileExplorerOpen ? <IconChevronLeft size="sm" /> : <IconChevronRight size="sm" />}
                </button>
              </div>
              {fileExplorerOpen && (
                <ErrorBoundary>
                  <FileTree
                    onFileSelect={openFile}
                    onOpenFolder={openFolder}
                    onCreateFile={() => {
                      setModalType('file');
                      setModalOpen(true);
                    }}
                    onCreateFolder={() => {
                      setModalType('folder');
                      setModalOpen(true);
                    }}
                    onRefresh={() => undefined}
                    selectedPath={selectedFile?.path}
                    workspacePath={currentPath}
                  />
                </ErrorBoundary>
              )}
            </div>

            {gitPanelOpen && (
              <div className={`app-sidebar ${gitPanelOpen ? 'open' : ''}`}>
                <ErrorBoundary>
                  <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Git Panel...</div>}>
                    <GitPanel
                      onFileSelect={openFile}
                      onCommitClick={() => setCommitDialogOpen(true)}
                      workspacePath={currentPath}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}

            <div className="app-content" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!useSplitView && (
                <TabBar
                  openFiles={openFiles}
                  activeFileIndex={activeFileIndex}
                  onTabClick={switchTab}
                  onTabClose={closeTab}
                  onTabMiddleClick={closeTab}
                  onTabReorder={reorderTabs}
                />
              )}

              {selectedFile || useSplitView ? (
                <div className="editor-layout">
                  {useSplitView ? (
                    <ErrorBoundary>
                      <SplitViewContainer
                        initialFiles={openFiles}
                        workspacePath={currentPath}
                        theme={themeType === 'dark' ? 'vs-dark' : 'vs'}
                        codeIssues={codeIssues}
                        onOpenFile={handleSplitViewOpenFile}
                        onSaveFile={handleSplitViewSaveFile}
                        onRun={runScript}
                        onFilesChange={handleSplitViewFilesChange}
                        onActiveFileChange={handleSplitViewActiveFileChange}
                      />
                    </ErrorBoundary>
                  ) : (
                    <>
                      <FileHeader selectedFile={selectedFile} hasChanges={hasChanges} />
                      <div className="editor-container">
                        <ErrorBoundary>
                          <MonacoEditor
                            ref={editorRef}
                            value={fileContent}
                            language={getLanguage(selectedFile?.name || '')}
                            onChange={handleContentChange}
                            onSave={() => saveFile()}
                            onRun={runScript}
                            theme={themeType === 'dark' ? 'vs-dark' : 'vs'}
                            filePath={selectedFile?.path || ''}
                            workspacePath={currentPath}
                            editorSettings={{
                              fontSize: appSettings.fontSize,
                              tabSize: appSettings.tabSize,
                              wordWrap: appSettings.wordWrap,
                              minimap: appSettings.minimap,
                              lineNumbers: appSettings.lineNumbers
                            }}
                            inlineCompletions={appSettings.inlineCompletions !== false}
                            issues={codeIssues}
                          />
                        </ErrorBoundary>
                      </div>
                    </>
                  )}

                  {terminalVisible && (
                    <div style={{ height: '280px', flexShrink: 0 }}>
                      <ErrorBoundary>
                        <Suspense fallback={<div className="loading-placeholder">Loading Terminal...</div>}>
                          <Terminal
                            onClose={() => setTerminalVisible(false)}
                            onFixError={(error) => {
                              setComposerOpen(true);
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('agentprime:prefill-message', {
                                  detail: `Fix this terminal error:\n\`\`\`\n${error.line}\n\`\`\`\n\nError type: ${error.type}\nMessage: ${error.message}`
                                }));
                              }, 200);
                            }}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  )}
                </div>
              ) : (
                <WelcomeScreen
                  recentProjects={recentProjects}
                  onOpenFolder={openFolder}
                  onOpenComposer={() => setComposerOpen(true)}
                  onNewFile={() => {
                    setModalType('file');
                    setModalOpen(true);
                  }}
                  onNewProject={() => setTemplateModalOpen(true)}
                  onOpenRecentProject={loadDirectory}
                  onOpenUserGuide={openUserGuide}
                />
              )}
              </div>

              {/* Live Preview Panel */}
              {livePreviewOpen && (
                <div style={{ width: '50%', minWidth: '300px', flexShrink: 0 }}>
                  <ErrorBoundary>
                    <Suspense fallback={<div className="loading-placeholder">Loading Preview...</div>}>
                      <LivePreview
                        url={livePreviewUrl}
                        onClose={() => setLivePreviewOpen(false)}
                        onUrlChange={setLivePreviewUrl}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`ai-composer-sidebar ${composerOpen ? 'open' : ''}`}>
          <div className="composer-sidebar-header">
            <h3><IconBot size="sm" /> AI Composer</h3>
            <button
              className="sidebar-toggle"
              onClick={() => setComposerOpen((prev) => !prev)}
              title={composerOpen ? 'Collapse' : 'Expand'}
            >
              {composerOpen ? <IconChevronRight size="sm" /> : <IconChevronLeft size="sm" />}
            </button>
          </div>
          {composerOpen && (
            <ErrorBoundary>
              <Suspense fallback={<div className="loading-spinner"><IconSpinner size="lg" /> Loading AI Composer...</div>}>
                <AIChat
                  onClose={() => setComposerOpen(false)}
                  openFiles={openFiles}
                  activeFileIndex={activeFileIndex}
                  getSelectedText={getSelectedText}
                  getCursorPosition={() => editorRef.current?.getCursorPosition?.()}
                  onOpenFolder={openFolder}
                  onOpenTemplates={() => setTemplateModalOpen(true)}
                  onApplyCode={async (code, filePath) => {
                    if (filePath) {
                      await openFile({
                        path: filePath,
                        name: filePath.split(/[/\\]/).pop() || filePath,
                        is_dir: false
                      });
                    }
                    handleContentChange(code);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        {modalOpen && (
          <CreateModal
            isOpen={modalOpen}
            type={modalType}
            onCreate={createItem}
            onClose={() => setModalOpen(false)}
            currentPath={currentPath}
          />
        )}

        {templateModalOpen && (
          <TemplateModal
            isOpen={templateModalOpen}
            onClose={() => setTemplateModalOpen(false)}
            onCreateProject={async () => {
              const result = await (window as any).agentAPI.selectDirectory();
              if (result.success) {
                await openFolder();
              }
            }}
            onSwitchToAIComposer={(request) => {
              setTemplateModalOpen(false);
              setComposerOpen(true);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('agentprime:prefill-message', {
                  detail: request
                }));
              }, 250);
            }}
          />
        )}

        <CommitDialog
          isOpen={commitDialogOpen}
          onClose={() => setCommitDialogOpen(false)}
          onCommit={async (message) => {
            const result = await window.agentAPI.gitCommit(message);
            if (!result.success) {
              throw new Error(result.error || 'Commit failed');
            }
          }}
        />

        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={appSettings}
          onSettingsChange={handleSettingsChange}
          currentTheme={currentTheme}
          onThemeChange={setTheme}
        />

        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={commands}
        />

        <SearchReplace
          isOpen={searchReplaceOpen}
          onClose={() => setSearchReplaceOpen(false)}
          onFileSelect={(filePath, _line) => {
            openFile({
              name: filePath.split(/[/\\]/).pop() || filePath,
              path: filePath,
              is_dir: false,
              extension: filePath.split('.').pop() || null
            });
          }}
          workspacePath={currentPath}
        />

        <StatusBar
          currentFile={getCurrentFileInfo()}
          gitBranch={null}
          theme={themeType}
        />

        {/* Inline Edit Dialog (Cmd+K) */}
        <Suspense fallback={null}>
          <InlineEditDialog
            request={inlineEditRequest}
            onSubmit={handleInlineEditSubmit}
            onClose={() => setInlineEditRequest(null)}
            isProcessing={inlineEditProcessing}
          />
        </Suspense>

        {/* Deploy Panel */}
        {deployPanelOpen && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(2px)',
          }} onClick={() => setDeployPanelOpen(false)}>
            <div onClick={e => e.stopPropagation()}>
              <Suspense fallback={null}>
                <DeployPanel onClose={() => setDeployPanelOpen(false)} />
              </Suspense>
            </div>
          </div>
        )}

        <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
      </div>
    </ErrorBoundary>
  );
}

export default App;

