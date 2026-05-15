/**
 * App - Lean core IDE shell
 *
 * Core surface only:
 * - Explorer + tabs + editor
 * - AI composer sidebar
 * - Settings, command palette, search/replace
 * - Optional git sidebar
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
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
import ProblemsPanel from '../ProblemsPanel';
import { PanelSkeleton, PageSkeleton } from '../Skeleton';
import { ToastContainer, useToast } from '../Toast';
import { getLanguage } from '../../utils';
import {
  IconBot,
  IconChevronLeft,
  IconChevronRight,
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
const MatrixRain = React.lazy(() => import('../MatrixRain'));
const SystemStatusPanel = React.lazy(() => import('../SystemStatusPanel'));
import type { FileChange as ReviewFileChange } from '../MultiFileDiffReview';
import type {
  AgentReviewCheckpointSummary,
  AgentReviewPlanSummary,
  AgentReviewSessionSnapshot,
} from '../../../types/agent-review';
import type { SystemDoctorReport, SystemStatusSummary } from '../../../types/system-health';
import {
  buildFallbackReviewPlanSummary,
  buildRepairPrompt,
  shouldAutoVerifyReviewChanges,
  type ReviewVerificationState,
} from './reviewFlow';

import { OpenFile, FileItem, Command, CodeIssue } from './types';
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

const LazyPanelFallback: React.FC<{ lines?: number; padded?: boolean }> = ({
  lines = 6,
  padded = true,
}) => (
  <div style={{ padding: padded ? 'var(--spacing-md)' : 0, height: '100%', overflow: 'hidden' }}>
    <PanelSkeleton lines={lines} padding={padded} />
  </div>
);

type WorkbenchTaskKind = 'install' | 'build' | 'test' | 'run' | 'verify' | 'stop';
type WorkbenchTaskRun = {
  id: string;
  kind: WorkbenchTaskKind;
  status: 'running' | 'passed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  summary: string;
  output?: string;
};
type ProjectRuntimeProfileState = {
  success: boolean;
  projectTypeLabel?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  testCommand?: string;
  canInstall?: boolean;
  canBuild?: boolean;
  canRun?: boolean;
  canTest?: boolean;
  error?: string;
};

function App() {
  const toast = useToast();
  const editorRef = useRef<MonacoEditorRef | null>(null);
  const pendingNavigationRef = useRef<{ filePath: string; line: number; column: number } | null>(null);
  const restoredWorkspaceRef = useRef<string | null>(null);

  const {
    openFiles,
    activeFileIndex,
    activeFile,
    workspacePath,
    currentPath,
    openFile,
    saveFile,
    openFolder,
    openWorkspacePath,
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
    runScript: executeScript,
    killScript
  } = useScriptRunner();

  const { currentTheme, themeType, setTheme } = useTheme();
  const { recentProjects, removeRecentProject } = useRecentProjects(workspacePath);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder'>('file');
  const [composerOpen, setComposerOpen] = useState(false);
  /** Once true, AIChat stays mounted so collapsing the sidebar does not reset an in-flight agent. */
  const [composerMounted, setComposerMounted] = useState(false);
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
  const [agentReviewChanges, setAgentReviewChanges] = useState<ReviewFileChange[]>([]);
  const [agentReviewSessionId, setAgentReviewSessionId] = useState<string | undefined>();
  const [agentReviewApplied, setAgentReviewApplied] = useState(false);
  const [agentReviewTask, setAgentReviewTask] = useState<string>('');
  const [agentReviewPlan, setAgentReviewPlan] = useState<AgentReviewPlanSummary | undefined>();
  const [agentReviewCheckpoint, setAgentReviewCheckpoint] = useState<AgentReviewCheckpointSummary | undefined>();
  const [agentReviewVerification, setAgentReviewVerification] = useState<ReviewVerificationState>({
    status: 'idle',
    issues: [],
  });
  const [latestAppliedReviewSession, setLatestAppliedReviewSession] = useState<AgentReviewSessionSnapshot | null>(null);
  const [systemStatusSummary, setSystemStatusSummary] = useState<SystemStatusSummary | null>(null);
  const [systemDoctorReport, setSystemDoctorReport] = useState<SystemDoctorReport | null>(null);
  const [systemDoctorLoading, setSystemDoctorLoading] = useState(false);
  const [systemDoctorError, setSystemDoctorError] = useState<string | null>(null);
  const [systemPanelOpen, setSystemPanelOpen] = useState(false);
  const [codeIssues, setCodeIssues] = useState<CodeIssue[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [referenceResults, setReferenceResults] = useState<{ word: string; references: any[] } | null>(null);
  const [activeBottomPanel, setActiveBottomPanel] = useState<'terminal' | 'problems' | 'output' | 'tasks'>('terminal');
  const [taskRuns, setTaskRuns] = useState<WorkbenchTaskRun[]>([]);
  const [projectRuntimeProfile, setProjectRuntimeProfile] = useState<ProjectRuntimeProfileState | null>(null);
  const [appSettings, setAppSettings] = useState<any>({
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on',
    minimap: true,
    lineNumbers: 'on',
    autoSave: true,
    inlineCompletions: true,
    pythonBrainEnabled: false,
    providers: {}
  });

  const selectedFile = activeFile?.file || null;
  const fileContent = activeFile?.content || '';
  const hasChanges = activeFile?.isDirty || false;
  const workspaceName = currentPath ? currentPath.split(/[/\\]/).pop() || 'Workspace' : 'AgentPrime';
  const selectedFileIssues = useMemo(() => {
    if (!selectedFile) return [];
    return codeIssues.filter((issue) => issue.filePath === selectedFile.path && issue.origin !== 'language');
  }, [codeIssues, selectedFile]);
  const problemCounts = useMemo(() => ({
    errors: codeIssues.filter((issue) => issue.severity === 'error').length,
    warnings: codeIssues.filter((issue) => issue.severity === 'warning').length,
  }), [codeIssues]);
  const latestTaskStatus = taskRuns[0]?.status || null;
  const workspaceStorageKey = currentPath ? `agentprime:workspace:${currentPath}` : null;

  // Keep backend in sync with the active file for completion context
  useEffect(() => {
    window.agentAPI.setActiveFilePath(selectedFile?.path ?? null);
  }, [selectedFile?.path]);

  useEffect(() => {
    if (composerOpen) setComposerMounted(true);
  }, [composerOpen]);

  const refreshLatestAppliedReviewSession = useCallback(async () => {
    try {
      const result = await window.agentAPI.getLatestAppliedAgentReview();
      if (result?.success) {
        setLatestAppliedReviewSession(result.session || null);
      }
    } catch (error) {
      console.warn('Failed to load latest applied review session:', error);
    }
  }, []);

  const refreshSystemStatusSummary = useCallback(async () => {
    try {
      const result = await window.agentAPI.getSystemStatusSummary();
      if (result?.success && result.status) {
        setSystemStatusSummary(result.status);
      }
    } catch (error) {
      console.warn('Failed to load system status summary:', error);
    }
  }, []);

  const refreshSystemDoctorReport = useCallback(async () => {
    setSystemDoctorLoading(true);
    setSystemDoctorError(null);
    try {
      const result = await window.agentAPI.getSystemDoctorReport();
      if (!result?.success || !result.report) {
        throw new Error(result?.error || 'Failed to load diagnostics.');
      }
      setSystemDoctorReport(result.report);
    } catch (error: any) {
      setSystemDoctorError(error?.message || 'Failed to load diagnostics.');
    } finally {
      setSystemDoctorLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSystemStatusSummary();
    void refreshLatestAppliedReviewSession();
    const interval = setInterval(() => {
      void refreshSystemStatusSummary();
      void refreshLatestAppliedReviewSession();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshLatestAppliedReviewSession, refreshSystemStatusSummary]);

  useEffect(() => {
    if (systemPanelOpen) {
      void refreshSystemDoctorReport();
    }
  }, [refreshSystemDoctorReport, systemPanelOpen]);

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

  const refreshProjectRuntimeProfile = useCallback(async (workspace = currentPath): Promise<ProjectRuntimeProfileState | null> => {
    if (!workspace) {
      setProjectRuntimeProfile(null);
      return null;
    }

    try {
      const profile = await window.agentAPI.getProjectRuntimeProfile(workspace) as ProjectRuntimeProfileState;
      setProjectRuntimeProfile(profile?.success ? profile : { success: false, error: profile?.error || 'Could not inspect project runtime.' });
      return profile;
    } catch (error: any) {
      const failedProfile: ProjectRuntimeProfileState = { success: false, error: error?.message || 'Could not inspect project runtime.' };
      setProjectRuntimeProfile(failedProfile);
      return failedProfile;
    }
  }, [currentPath]);

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

  useEffect(() => {
    void refreshProjectRuntimeProfile(currentPath);
  }, [currentPath, refreshProjectRuntimeProfile]);

  useEffect(() => {
    if (!workspaceStorageKey || restoredWorkspaceRef.current === currentPath) return;
    restoredWorkspaceRef.current = currentPath;

    const restoreWorkspaceState = async () => {
      try {
        const raw = window.localStorage.getItem(workspaceStorageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          openFiles?: string[];
          activeFilePath?: string;
          activeBottomPanel?: typeof activeBottomPanel;
          fileExplorerOpen?: boolean;
          gitPanelOpen?: boolean;
        };

        if (saved.activeBottomPanel) setActiveBottomPanel(saved.activeBottomPanel);
        if (typeof saved.fileExplorerOpen === 'boolean') setFileExplorerOpen(saved.fileExplorerOpen);
        if (typeof saved.gitPanelOpen === 'boolean') setGitPanelOpen(saved.gitPanelOpen);

        const paths = Array.isArray(saved.openFiles) ? saved.openFiles.slice(0, 20) : [];
        if (paths.length === 0 || openFiles.length > 0) return;

        const restoredFiles = await Promise.all(paths.map(async (filePath): Promise<OpenFile | null> => {
          try {
            const result = await window.agentAPI.readFile(filePath);
            if (typeof result?.content !== 'string') return null;
            const restoredFile: OpenFile = {
              file: {
                name: filePath.split(/[/\\]/).pop() || filePath,
                path: filePath,
                is_dir: false,
                extension: filePath.includes('.') ? filePath.split('.').pop() || null : null,
              },
              content: result.content,
              originalContent: result.content,
              isDirty: false,
            };
            return restoredFile;
          } catch {
            return null;
          }
        }));

        const validFiles = restoredFiles.filter((file): file is OpenFile => Boolean(file));
        if (validFiles.length > 0) {
          setOpenFiles(validFiles);
          const activeIndex = validFiles.findIndex((file) => file.file.path === saved.activeFilePath);
          setActiveFileIndex(activeIndex >= 0 ? activeIndex : 0);
        }
      } catch (error) {
        console.warn('Failed to restore workspace state:', error);
      }
    };

    void restoreWorkspaceState();
  }, [activeBottomPanel, currentPath, openFiles.length, setActiveFileIndex, setOpenFiles, workspaceStorageKey]);

  useEffect(() => {
    if (!workspaceStorageKey) return;
    const payload = {
      openFiles: openFiles.map((file) => file.file.path),
      activeFilePath: activeFile?.file.path,
      activeBottomPanel,
      fileExplorerOpen,
      gitPanelOpen,
    };
    try {
      window.localStorage.setItem(workspaceStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist workspace state:', error);
    }
  }, [activeBottomPanel, activeFile?.file.path, fileExplorerOpen, gitPanelOpen, openFiles, workspaceStorageKey]);

  useEffect(() => {
    if (!appSettings.autoSave || !activeFile?.isDirty) return;
    const timeout = window.setTimeout(() => {
      void saveFile();
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [activeFile?.content, activeFile?.isDirty, appSettings.autoSave, saveFile]);

  useEffect(() => {
    const refreshCleanActiveFile = async () => {
      if (!activeFile || activeFile.isDirty) return;
      try {
        const result = await window.agentAPI.readFile(activeFile.file.path);
        const latestContent = result?.content;
        if (typeof latestContent === 'string' && latestContent !== activeFile.originalContent) {
          setOpenFiles((prev) => prev.map((file, index) => (
            index === activeFileIndex
              ? { ...file, content: latestContent, originalContent: latestContent, isDirty: false }
              : file
          )));
          toast.info('File Refreshed', activeFile.file.name);
        }
      } catch {
        // Ignore focus refresh errors; the file may have been removed.
      }
    };

    window.addEventListener('focus', refreshCleanActiveFile);
    return () => window.removeEventListener('focus', refreshCleanActiveFile);
  }, [activeFile, activeFileIndex, setOpenFiles, toast]);

  const handleSettingsChange = useCallback(async (newSettings: any) => {
    try {
      const brainToggleChanged =
        typeof newSettings?.pythonBrainEnabled === 'boolean' &&
        newSettings.pythonBrainEnabled !== appSettings.pythonBrainEnabled;
      const updatedSettings = await window.agentAPI.updateSettings(newSettings);
      setAppSettings(updatedSettings);
      await refreshSystemStatusSummary();
      window.dispatchEvent(new CustomEvent('agentprime-settings-changed', {
        detail: updatedSettings
      }));
      toast.success('Settings Saved', 'Your preferences have been updated');
      if (brainToggleChanged) {
        toast.info(
          'Restart Required',
          `Python Brain will be ${newSettings.pythonBrainEnabled ? 'enabled' : 'disabled'} after you restart AgentPrime.`
        );
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Settings Error', 'Failed to save settings');
    }
  }, [appSettings.pythonBrainEnabled, refreshSystemStatusSummary, toast]);

  const runScript = useCallback(() => {
    if (selectedFile) {
      setActiveBottomPanel('output');
      executeScript(selectedFile);
    }
  }, [selectedFile, executeScript]);

  const openUserGuide = useCallback(async () => {
    try {
      const result = await window.agentAPI.openUserGuide();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to open user guide');
      }
    } catch (error: any) {
      console.error('Failed to open user guide:', error);
      const fallback = 'https://github.com/AaronGrace978/AgentPrime/blob/main/docs/user-guide.html';
      toast.error(
        'Unable to Open User Guide',
        error?.message || `Try opening ${fallback} in your browser.`
      );
    }
  }, [toast]);

  const handleOpenRecentProject = useCallback(async (projectPath: string) => {
    const opened = await openWorkspacePath(projectPath);
    if (!opened) {
      removeRecentProject(projectPath);
    }
  }, [openWorkspacePath, removeRecentProject]);

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

  const handleLanguageDiagnosticsChange = useCallback((filePath: string, diagnostics: CodeIssue[]) => {
    const normalizedDiagnostics = diagnostics.map((diagnostic, index) => ({
      ...diagnostic,
      id: `language:${filePath}:${diagnostic.line}:${diagnostic.column}:${diagnostic.ruleId || index}`,
      filePath,
      origin: 'language' as const,
      source: diagnostic.source || 'language',
    }));

    setCodeIssues((prev) => [
      ...prev.filter((issue) => !(issue.filePath === filePath && issue.origin === 'language')),
      ...normalizedDiagnostics,
    ]);
  }, []);

  const handleTerminalErrorsDetected = useCallback((errors: Array<{ type: string; message: string; line: string }>) => {
    const diagnostics = errors.map((error, index) => ({
      id: `terminal:${Date.now()}:${index}`,
      filePath: selectedFile?.path || currentPath || 'Terminal',
      line: 1,
      column: 1,
      message: error.message || error.line,
      severity: 'error' as const,
      ruleId: error.type || 'terminal-error',
      source: 'terminal',
      origin: 'terminal' as const,
    }));

    setCodeIssues((prev) => [
      ...prev.filter((issue) => issue.origin !== 'terminal').slice(-100),
      ...diagnostics,
    ]);
  }, [currentPath, selectedFile?.path]);

  const handleVerificationDiagnostics = useCallback((verification: ReviewVerificationState, workspace: string) => {
    const findings = verification.findings || [];
    const findingDiagnostics: CodeIssue[] = findings.flatMap((finding, findingIndex) => {
      const files = finding.files?.length ? finding.files : [workspace];
      return files.map((filePath, fileIndex) => ({
        id: `verification:${finding.stage}:${findingIndex}:${fileIndex}`,
        filePath,
        line: 1,
        column: 1,
        message: finding.summary,
        severity: finding.severity === 'info' ? 'warning' : (finding.severity === 'warning' ? 'warning' : 'error'),
        ruleId: finding.command || finding.stage || 'verification',
        source: 'verification',
        origin: 'verification',
      }));
    });

    const issueDiagnostics: CodeIssue[] = (verification.issues || []).map((issue, index) => ({
      id: `verification:issue:${index}`,
      filePath: workspace,
      line: 1,
      column: 1,
      message: issue,
      severity: 'error',
      ruleId: 'project-verification',
      source: 'verification',
      origin: 'verification',
    }));

    setCodeIssues((prev) => [
      ...prev.filter((issue) => issue.origin !== 'verification'),
      ...findingDiagnostics,
      ...issueDiagnostics,
    ]);
  }, []);

  const syncOpenFileFromDisk = useCallback(async (filePath: string) => {
    try {
      const readResult = await window.agentAPI.readFile(filePath);
      setOpenFiles((prev) => {
        const idx = prev.findIndex((file) => file.file.path === filePath);
        if (idx < 0) return prev;

        if (typeof readResult?.content === 'string') {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            content: readResult.content,
            originalContent: readResult.content,
            isDirty: false
          };
          return next;
        }

        // File no longer exists (rejected created file) - close its tab.
        return prev.filter((file) => file.file.path !== filePath);
      });
    } catch (error) {
      console.warn(`Failed to sync open file after review change: ${filePath}`, error);
    }
  }, [setOpenFiles]);

  const openFileAtLocation = useCallback(async (filePath: string, line: number = 1, column: number = 1) => {
    if (!filePath) return;

    pendingNavigationRef.current = { filePath, line, column };
    await openFile({
      name: filePath.split(/[/\\]/).pop() || filePath,
      path: filePath,
      is_dir: false,
      extension: filePath.includes('.') ? filePath.split('.').pop() || null : null
    });

    if (activeFile?.file.path === filePath) {
      window.setTimeout(() => editorRef.current?.revealPosition(line, column), 0);
      pendingNavigationRef.current = null;
    }
  }, [activeFile?.file.path, openFile]);

  const handleOpenProblem = useCallback((issue: CodeIssue) => {
    if (issue.filePath && issue.filePath !== 'Terminal' && issue.filePath !== currentPath) {
      void openFileAtLocation(issue.filePath, issue.line || 1, issue.column || 1);
    }
  }, [currentPath, openFileAtLocation]);

  const handleFixProblem = useCallback((issue: CodeIssue) => {
    setComposerOpen(true);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agentprime:prefill-message', {
        detail: `Fix this problem:\n\nFile: ${issue.filePath || 'Workspace'}\nLocation: ${issue.line}:${issue.column}\nSource: ${issue.source || issue.origin || 'agentprime'}\nRule: ${issue.ruleId}\nSeverity: ${issue.severity}\n\n${issue.message}`
      }));
    }, 200);
  }, []);

  const recordTaskFailure = useCallback((taskId: string, kind: WorkbenchTaskKind, message: string) => {
    const diagnostic: CodeIssue = {
      id: `task:${taskId}`,
      filePath: currentPath || 'Workspace',
      line: 1,
      column: 1,
      message,
      severity: 'error',
      ruleId: `task:${kind}`,
      source: 'task-runner',
      origin: 'task',
    };
    setCodeIssues((prev) => [
      ...prev.filter((issue) => issue.id !== diagnostic.id),
      diagnostic,
    ]);
  }, [currentPath]);

  const runWorkbenchTask = useCallback(async (kind: WorkbenchTaskKind) => {
    const workspace = currentPath || await window.agentAPI.getWorkspace();
    if (!workspace) {
      toast.error('Task Failed', 'Open a workspace before running tasks.');
      return;
    }

    setTerminalVisible(true);
    setActiveBottomPanel('tasks');

    const taskId = `${kind}:${Date.now()}`;
    const runningTask: WorkbenchTaskRun = {
      id: taskId,
      kind,
      status: 'running',
      startedAt: Date.now(),
      summary: `${kind} started`,
    };
    setTaskRuns((prev) => [runningTask, ...prev].slice(0, 20));

    const finishTask = (status: WorkbenchTaskRun['status'], summary: string, output?: string) => {
      setTaskRuns((prev) => prev.map((task) => (
        task.id === taskId
          ? { ...task, status, summary, output, finishedAt: Date.now() }
          : task
      )));
      if (status === 'failed') {
        recordTaskFailure(taskId, kind, summary);
      }
    };

    try {
      if (kind === 'verify') {
        const result = await window.agentAPI.verifyProject(workspace);
        const verification: ReviewVerificationState = {
          status: result.success ? 'passed' : 'failed',
          projectTypeLabel: result.projectTypeLabel,
          readinessSummary: result.readinessSummary,
          startCommand: result.startCommand,
          buildCommand: result.buildCommand,
          installCommand: result.installCommand,
          url: result.url,
          issues: Array.isArray(result.issues) ? result.issues : [],
          findings: Array.isArray(result.findings) ? result.findings : [],
        };
        handleVerificationDiagnostics(verification, workspace);
        finishTask(result.success ? 'passed' : 'failed', result.readinessSummary || (result.success ? 'Verification passed' : 'Verification failed'));
        return;
      }

      if (kind === 'run') {
        const result = await window.agentAPI.launchProject(workspace);
        finishTask(result?.success ? 'passed' : 'failed', result?.message || result?.error || 'Run finished');
        if (result?.url) {
          setLivePreviewUrl(result.url);
          setLivePreviewOpen(true);
        }
        return;
      }

      if (kind === 'stop') {
        const result = await window.agentAPI.stopProjectProcesses(workspace);
        finishTask(result?.success ? 'passed' : 'failed', result?.success ? 'Stopped running project processes' : result?.error || 'Stop failed');
        return;
      }

      const profile = (projectRuntimeProfile?.success && currentPath === workspace)
        ? projectRuntimeProfile
        : await refreshProjectRuntimeProfile(workspace);
      const commands: Record<Exclude<WorkbenchTaskKind, 'run' | 'verify' | 'stop'>, string | undefined> = {
        install: profile?.installCommand,
        build: profile?.buildCommand,
        test: profile?.testCommand,
      };
      const command = commands[kind];
      if (!command) {
        const label = profile?.projectTypeLabel || 'this workspace';
        finishTask('failed', `No ${kind} command detected for ${label}.`);
        return;
      }

      const result = await window.agentAPI.agentRunCommand(command, workspace, 180);
      const output = [result?.stdout, result?.stderr, result?.output, result?.error].filter(Boolean).join('\n');
      finishTask(result?.success ? 'passed' : 'failed', result?.success ? `${command} passed` : result?.error || `${command} failed`, output);
    } catch (error: any) {
      finishTask('failed', error?.message || `${kind} failed`);
    }
  }, [currentPath, handleVerificationDiagnostics, projectRuntimeProfile, recordTaskFailure, refreshProjectRuntimeProfile, toast]);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || activeFile?.file.path !== pending.filePath) return;

    window.setTimeout(() => editorRef.current?.revealPosition(pending.line, pending.column), 0);
    pendingNavigationRef.current = null;
  }, [activeFile?.file.path]);

  useEffect(() => {
    const refreshGitBranch = async () => {
      if (!currentPath) {
        setGitBranch(null);
        return;
      }
      try {
        const status = await window.agentAPI.gitStatus();
        setGitBranch(status?.success ? status.branch || null : null);
      } catch {
        setGitBranch(null);
      }
    };

    void refreshGitBranch();
    const interval = window.setInterval(() => {
      void refreshGitBranch();
    }, 120000);

    return () => window.clearInterval(interval);
  }, [currentPath]);

  const applyReviewSessionSnapshot = useCallback((snapshot?: AgentReviewSessionSnapshot) => {
    if (!snapshot) return;
    setAgentReviewSessionId(snapshot.sessionId);
    setAgentReviewApplied(Boolean(snapshot.appliedAt));
    setAgentReviewChanges(snapshot.changes);
    setAgentReviewPlan((prev) => snapshot.plan || prev);
    setAgentReviewCheckpoint((prev) => snapshot.checkpoint || prev);
  }, []);

  const clearAgentReviewState = useCallback(async (discardSession: boolean = false) => {
    const sessionId = agentReviewSessionId;
    if (discardSession && sessionId) {
      try {
        await window.agentAPI.discardAgentReview(sessionId);
      } catch (error) {
        console.warn('Failed to discard staged review session:', error);
      }
    }

    setAgentReviewSessionId(undefined);
    setAgentReviewApplied(false);
    setAgentReviewChanges([]);
    setAgentReviewTask('');
    setAgentReviewPlan(undefined);
    setAgentReviewCheckpoint(undefined);
    setAgentReviewVerification({ status: 'idle', issues: [] });
  }, [agentReviewSessionId]);

  const applyRejectedChange = useCallback(async (change: ReviewFileChange) => {
    if (change.action === 'created') {
      await window.agentAPI.deleteItem(change.filePath);
    } else {
      await window.agentAPI.writeFile(change.filePath, change.oldContent);
    }
    await syncOpenFileFromDisk(change.filePath);
  }, [syncOpenFileFromDisk]);

  const handleAcceptReviewFile = useCallback(async (filePath: string) => {
    setAgentReviewVerification({ status: 'idle', issues: [] });

    if (!agentReviewSessionId) {
      setAgentReviewChanges((prev) =>
        prev.map((change) =>
          change.filePath === filePath ? { ...change, status: 'accepted' } : change
        )
      );
      return;
    }

    const result = await window.agentAPI.updateAgentReviewStatus(agentReviewSessionId, filePath, 'accepted');
    if (!result?.success || !result.session) {
      toast.error('Review Update Failed', result?.error || filePath);
      return;
    }

    applyReviewSessionSnapshot(result.session);
  }, [agentReviewSessionId, applyReviewSessionSnapshot, toast]);

  const handleRejectReviewFile = useCallback(async (filePath: string) => {
    const target = agentReviewChanges.find((change) => change.filePath === filePath);
    if (!target) return;

    try {
      setAgentReviewVerification({ status: 'idle', issues: [] });

      if (!agentReviewSessionId) {
        await applyRejectedChange(target);
        setAgentReviewChanges((prev) =>
          prev.map((change) =>
            change.filePath === filePath ? { ...change, status: 'rejected' } : change
          )
        );
        if (currentPath) {
          await loadDirectory(currentPath);
        }
        toast.success('Change Reverted', filePath);
        return;
      }

      const result = await window.agentAPI.updateAgentReviewStatus(agentReviewSessionId, filePath, 'rejected');
      if (!result?.success || !result.session) {
        toast.error('Review Update Failed', result?.error || filePath);
        return;
      }

      applyReviewSessionSnapshot(result.session);
      toast.success('Change Rejected', filePath);
    } catch (error: any) {
      toast.error(agentReviewSessionId ? 'Failed to Reject Change' : 'Failed to Revert Change', error?.message || filePath);
    }
  }, [agentReviewChanges, agentReviewSessionId, applyRejectedChange, applyReviewSessionSnapshot, currentPath, loadDirectory, toast]);

  const handleAcceptAllReviewFiles = useCallback(async () => {
    setAgentReviewVerification({ status: 'idle', issues: [] });

    if (!agentReviewSessionId) {
      setAgentReviewChanges((prev) =>
        prev.map((change) => (change.status === 'pending' ? { ...change, status: 'accepted' } : change))
      );
      return;
    }

    const result = await window.agentAPI.updatePendingAgentReviewStatuses(agentReviewSessionId, 'accepted');
    if (!result?.success || !result.session) {
      toast.error('Review Update Failed', result?.error || 'Could not accept pending changes');
      return;
    }

    applyReviewSessionSnapshot(result.session);
  }, [agentReviewSessionId, applyReviewSessionSnapshot, toast]);

  const handleRejectAllReviewFiles = useCallback(async () => {
    const pendingChanges = agentReviewChanges.filter((change) => change.status === 'pending');
    if (pendingChanges.length === 0) return;

    try {
      setAgentReviewVerification({ status: 'idle', issues: [] });

      if (!agentReviewSessionId) {
        for (const change of pendingChanges) {
          await applyRejectedChange(change);
        }
        setAgentReviewChanges((prev) =>
          prev.map((change) => (change.status === 'pending' ? { ...change, status: 'rejected' } : change))
        );
        if (currentPath) {
          await loadDirectory(currentPath);
        }
        toast.success('Changes Reverted', `${pendingChanges.length} file(s) restored`);
        return;
      }

      const result = await window.agentAPI.updatePendingAgentReviewStatuses(agentReviewSessionId, 'rejected');
      if (!result?.success || !result.session) {
        toast.error('Review Update Failed', result?.error || 'Could not reject pending changes');
        return;
      }

      applyReviewSessionSnapshot(result.session);
      toast.success('Changes Rejected', `${pendingChanges.length} file(s) marked rejected`);
    } catch (error: any) {
      toast.error(agentReviewSessionId ? 'Bulk Reject Failed' : 'Bulk Revert Failed', error?.message || 'Could not reject all pending files');
    }
  }, [agentReviewChanges, agentReviewSessionId, applyRejectedChange, applyReviewSessionSnapshot, currentPath, loadDirectory, toast]);

  const handleApplyReviewChanges = useCallback(async () => {
    if (!agentReviewSessionId) {
      return;
    }

    const acceptedChanges = agentReviewChanges.filter((change) => change.status === 'accepted');
    if (acceptedChanges.length === 0) {
      toast.error('Nothing to Apply', 'Accept at least one staged change before applying.');
      return;
    }

    setAgentReviewVerification({ status: 'idle', issues: [] });

    const result = await window.agentAPI.applyAgentReview(agentReviewSessionId);
    if (!result?.success || !result.session) {
      toast.error('Apply Failed', result?.error || 'Could not apply staged changes.');
      return;
    }

    applyReviewSessionSnapshot(result.session);

    for (const change of acceptedChanges) {
      await syncOpenFileFromDisk(change.filePath);
    }

    if (currentPath) {
      await loadDirectory(currentPath);
    }

    await refreshLatestAppliedReviewSession();
    await refreshSystemStatusSummary();
    toast.success('Changes Applied', `${acceptedChanges.length} file(s) written to the workspace`);
  }, [
    agentReviewChanges,
    agentReviewSessionId,
    applyReviewSessionSnapshot,
    currentPath,
    loadDirectory,
    refreshLatestAppliedReviewSession,
    refreshSystemStatusSummary,
    syncOpenFileFromDisk,
    toast,
  ]);

  const handleRevertLastAgentSession = useCallback(async () => {
    const latestSession = latestAppliedReviewSession || (agentReviewSessionId ? {
      sessionId: agentReviewSessionId,
    } : null);
    if (!latestSession) {
      toast.error('Nothing to Revert', 'There is no applied agent session available to revert.');
      return;
    }

    const confirmed = window.confirm('Revert the last applied agent session and restore the previous file contents?');
    if (!confirmed) {
      return;
    }

    const result = await window.agentAPI.revertLatestAppliedAgentReview();
    if (!result?.success || !result.session) {
      toast.error('Revert Failed', result?.error || 'Could not revert the last applied session.');
      return;
    }

    const revertedSession = result.session;
    for (const change of revertedSession.changes.filter((change) => change.status === 'accepted')) {
      await syncOpenFileFromDisk(change.filePath);
    }

    if (currentPath) {
      await loadDirectory(currentPath);
    }

    if (agentReviewSessionId === revertedSession.sessionId) {
      setAgentReviewApplied(false);
      setAgentReviewChanges(revertedSession.changes);
      setAgentReviewVerification({ status: 'idle', issues: [] });
    }

    await refreshLatestAppliedReviewSession();
    await refreshSystemStatusSummary();
    toast.success('Session Reverted', 'The last applied agent session was restored to its previous state.');
  }, [
    agentReviewSessionId,
    currentPath,
    latestAppliedReviewSession,
    loadDirectory,
    refreshLatestAppliedReviewSession,
    refreshSystemStatusSummary,
    syncOpenFileFromDisk,
    toast,
  ]);

  const handleVerifyReviewedProject = useCallback(async () => {
    if (!agentReviewApplied) {
      toast.error('Verification Unavailable', 'Apply accepted changes before verifying the project.');
      return;
    }

    let workspaceToVerify = currentPath;
    if (!workspaceToVerify) {
      try {
        const workspace = await window.agentAPI.getWorkspace();
        if (workspace) {
          workspaceToVerify = workspace;
          await loadDirectory(workspace);
        }
      } catch (workspaceError) {
        console.warn('Failed to resolve workspace before verification:', workspaceError);
      }
    }

    if (!workspaceToVerify) {
      const message = 'Open a workspace before verifying changes.';
      setAgentReviewVerification({
        status: 'failed',
        issues: [message],
      });
      toast.error('Verification Failed', message);
      return;
    }

    setAgentReviewVerification((prev) => ({
      ...prev,
      status: 'verifying',
      issues: [],
    }));

    try {
      const result = await window.agentAPI.verifyProject(workspaceToVerify);
      const nextState: ReviewVerificationState = {
        status: result.success ? 'passed' : 'failed',
        projectTypeLabel: result.projectTypeLabel,
        readinessSummary: result.readinessSummary,
        startCommand: result.startCommand,
        buildCommand: result.buildCommand,
        installCommand: result.installCommand,
        url: result.url,
        issues: Array.isArray(result.issues) ? result.issues : [],
        findings: Array.isArray(result.findings) ? result.findings : [],
      };
      setAgentReviewVerification(nextState);
      handleVerificationDiagnostics(nextState, workspaceToVerify);

      if (result.success) {
        toast.success('Verification Passed', result.projectTypeLabel || 'Accepted changes are runnable.');
      } else {
        toast.error('Verification Failed', (nextState.issues[0] || result.readinessSummary || 'Accepted changes need repair.'));
      }
    } catch (error: any) {
      const message = error?.message || 'Verification failed';
      setAgentReviewVerification({
        status: 'failed',
        issues: [message],
      });
      handleVerificationDiagnostics({ status: 'failed', issues: [message] }, workspaceToVerify);
      toast.error('Verification Failed', message);
    }
  }, [agentReviewApplied, currentPath, handleVerificationDiagnostics, loadDirectory, toast]);

  const handleRunReviewedProject = useCallback(async () => {
    if (!agentReviewApplied) {
      toast.error('Run Unavailable', 'Apply accepted changes before running the project.');
      return;
    }

    let workspaceToRun = currentPath;
    if (!workspaceToRun) {
      try {
        const workspace = await window.agentAPI.getWorkspace();
        if (workspace) {
          workspaceToRun = workspace;
          await loadDirectory(workspace);
        }
      } catch (workspaceError) {
        console.warn('Failed to resolve workspace before run:', workspaceError);
      }
    }

    if (!workspaceToRun) {
      toast.error('Run Failed', 'Open a workspace before running the project.');
      return;
    }

    try {
      const result = await window.agentAPI.launchProject(workspaceToRun);
      if (!result?.success) {
        throw new Error(result?.error || result?.message || 'Run failed');
      }
      if (result.url && /^(https?|file):\/\//.test(result.url)) {
        setLivePreviewUrl(result.url);
        setLivePreviewOpen(true);
      }
      toast.success('Project Running', result.message || 'Project launched successfully.');
    } catch (error: any) {
      toast.error('Run Failed', error?.message || 'Could not launch the project.');
    }
  }, [agentReviewApplied, currentPath, loadDirectory, toast]);

  const handleRepairReviewedProject = useCallback(() => {
    if (!agentReviewApplied) {
      toast.error('Repair Unavailable', 'Apply accepted changes before starting a repair pass.');
      return;
    }

    const acceptedFiles = agentReviewChanges
      .filter((change) => change.status === 'accepted')
      .map((change) => change.filePath);
    const rejectedFiles = agentReviewChanges
      .filter((change) => change.status === 'rejected')
      .map((change) => change.filePath);
    const findingFiles = new Set((agentReviewVerification.findings || []).flatMap((finding) => finding.files));
    const targetedAcceptedFiles = findingFiles.size > 0
      ? acceptedFiles.filter((filePath) => findingFiles.has(filePath))
      : acceptedFiles;
    const blockedAcceptedFiles = acceptedFiles.filter((filePath) => !targetedAcceptedFiles.includes(filePath));
    const retryReason = targetedAcceptedFiles.length > 0
      ? `Verifier findings target ${targetedAcceptedFiles.join(', ')}. AgentPrime will block edits outside that repair scope.`
      : 'Verifier findings did not name files, so repair is limited to accepted review files.';
    const prompt = buildRepairPrompt(
      agentReviewTask,
      agentReviewVerification,
      targetedAcceptedFiles,
      rejectedFiles,
      retryReason
    );
    setComposerOpen(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agentprime:repair-scope', {
        detail: {
          allowedFiles: targetedAcceptedFiles,
          blockedFiles: [...rejectedFiles, ...blockedAcceptedFiles],
          findings: agentReviewVerification.findings || [],
          retryReason,
        }
      }));
      window.dispatchEvent(new CustomEvent('agentprime:prefill-message', {
        detail: prompt
      }));
    }, 200);
  }, [agentReviewApplied, agentReviewChanges, agentReviewTask, agentReviewVerification, toast]);

  useEffect(() => {
    if (shouldAutoVerifyReviewChanges(agentReviewChanges, agentReviewVerification, agentReviewApplied)) {
      void handleVerifyReviewedProject();
    }
  }, [agentReviewApplied, agentReviewChanges, agentReviewVerification, handleVerifyReviewedProject]);

  // Listen for Cmd+K inline edit events from Monaco
  useEffect(() => {
    const handleInlineEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setInlineEditRequest(detail);
    };
    window.addEventListener('agentprime:inlineEdit', handleInlineEdit);
    return () => window.removeEventListener('agentprime:inlineEdit', handleInlineEdit);
  }, []);

  useEffect(() => {
    const handleOpenFileAtLine = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      void openFileAtLocation(detail.filePath, detail.line || 1, detail.column || 1);
    };

    const handleShowReferences = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const references = Array.isArray(detail.references) ? detail.references : [];
      setReferenceResults({ word: detail.word || 'symbol', references });
      if (references.length > 0) {
        toast.info('References Found', `${references.length} reference${references.length === 1 ? '' : 's'} for ${detail.word || 'symbol'}`);
      }
    };

    const handleOpenSymbolSearch = () => {
      setCommandPaletteOpen(true);
      toast.info('Symbol Search', 'Use the command palette search to find workspace commands and symbols.');
    };

    window.addEventListener('agentprime:openFileAtLine', handleOpenFileAtLine);
    window.addEventListener('agentprime:showReferences', handleShowReferences);
    window.addEventListener('agentprime:openSymbolSearch', handleOpenSymbolSearch);

    return () => {
      window.removeEventListener('agentprime:openFileAtLine', handleOpenFileAtLine);
      window.removeEventListener('agentprime:showReferences', handleShowReferences);
      window.removeEventListener('agentprime:openSymbolSearch', handleOpenSymbolSearch);
    };
  }, [openFileAtLocation, toast]);

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
    // Capture phase so shortcuts fire even when Monaco editor has focus
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isMonacoEvent = !!target?.closest?.('.monaco-editor');

      const consume = () => { e.preventDefault(); e.stopPropagation(); };

      if (mod && key === 'l') {
        consume();
        setComposerOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'n') {
        consume();
        setTemplateModalOpen(true);
        return;
      }

      if (mod && key === 's' && !e.shiftKey) {
        consume();
        if (activeFile?.isDirty) {
          saveFile();
        }
        return;
      }

      if (mod && key === 'o') {
        consume();
        openFolder();
        return;
      }

      if (mod && key === 'b') {
        consume();
        setFileExplorerOpen((prev) => !prev);
        return;
      }

      if (mod && e.key === '`') {
        consume();
        setActiveBottomPanel('terminal');
        setTerminalVisible(!terminalVisible);
        return;
      }

      if (e.key === 'F5' && !mod) {
        consume();
        runScript();
        return;
      }

      if (mod && e.key === 'Tab' && !e.shiftKey) {
        consume();
        if (openFiles.length > 1) {
          switchTab((activeFileIndex + 1) % openFiles.length);
        }
        return;
      }

      if (mod && e.shiftKey && e.key === 'Tab') {
        consume();
        if (openFiles.length > 1) {
          switchTab(activeFileIndex === 0 ? openFiles.length - 1 : activeFileIndex - 1);
        }
        return;
      }

      if (mod && key === 'w' && !e.shiftKey) {
        consume();
        if (activeFileIndex >= 0) {
          closeTab(activeFileIndex);
        }
        return;
      }

      // Keep Ctrl/Cmd+K available for Monaco inline edit when the editor owns focus.
      if (mod && key === 'k' && (!isMonacoEvent || e.shiftKey)) {
        consume();
        setCommandPaletteOpen(true);
        return;
      }

      if (mod && key === 'p' && !e.shiftKey && !e.altKey) {
        consume();
        setCommandPaletteOpen(true);
        return;
      }

      if (mod && e.shiftKey && key === 'f') {
        consume();
        setSearchReplaceOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'g') {
        consume();
        setGitPanelOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'p') {
        consume();
        setCommandPaletteOpen(true);
        return;
      }

      if (mod && e.altKey && key === 'p') {
        consume();
        setLivePreviewOpen((prev) => !prev);
        return;
      }

      if (mod && e.shiftKey && key === 'd') {
        consume();
        setDeployPanelOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          consume();
          setCommandPaletteOpen(false);
          return;
        }
        if (searchReplaceOpen) {
          consume();
          setSearchReplaceOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
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

  const workbenchTaskCommand = useCallback((task: WorkbenchTaskKind): string | undefined => {
    if (!projectRuntimeProfile?.success) return undefined;
    if (task === 'install') return projectRuntimeProfile.installCommand;
    if (task === 'build') return projectRuntimeProfile.buildCommand;
    if (task === 'test') return projectRuntimeProfile.testCommand;
    if (task === 'run') return projectRuntimeProfile.startCommand;
    return undefined;
  }, [projectRuntimeProfile]);

  const availableWorkbenchTasks = useMemo<WorkbenchTaskKind[]>(() => {
    const tasks: WorkbenchTaskKind[] = [];
    if (projectRuntimeProfile?.canInstall) tasks.push('install');
    if (projectRuntimeProfile?.canBuild) tasks.push('build');
    if (projectRuntimeProfile?.canTest) tasks.push('test');
    if (!projectRuntimeProfile || projectRuntimeProfile.canRun) tasks.push('run');
    tasks.push('verify', 'stop');
    return tasks;
  }, [projectRuntimeProfile]);

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
      title: 'Toggle Terminal',
      description: 'Show or hide the bottom terminal panel',
      icon: <IconTerminal size="sm" />,
      category: 'view',
      shortcut: 'Ctrl+`',
      action: () => {
        setActiveBottomPanel('terminal');
        setTerminalVisible(!terminalVisible);
      }
    },
    {
      id: 'show-problems',
      title: 'Show Problems',
      description: 'Open workbench diagnostics',
      icon: <IconSearch size="sm" />,
      category: 'view',
      action: () => {
        setActiveBottomPanel('problems');
        setTerminalVisible(true);
      }
    },
    {
      id: 'show-tasks',
      title: 'Show Tasks',
      description: 'Open detected project tasks',
      icon: <IconPlay size="sm" />,
      category: 'view',
      action: () => {
        setActiveBottomPanel('tasks');
        setTerminalVisible(true);
      }
    },
    {
      id: 'verify-project',
      title: 'Verify Project',
      description: 'Run project verification',
      icon: <IconPlay size="sm" />,
      category: 'navigation',
      action: () => { void runWorkbenchTask('verify'); }
    },
    {
      id: 'run-build',
      title: 'Run Build',
      description: projectRuntimeProfile?.buildCommand || 'Run detected build task',
      icon: <IconPlay size="sm" />,
      category: 'navigation',
      action: () => { void runWorkbenchTask('build'); }
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
      shortcut: 'Ctrl+Alt+P',
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
          onStopScript={killScript}
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
                    onRefresh={() => {
                      if (currentPath) {
                        void loadDirectory(currentPath);
                      }
                    }}
                    selectedPath={selectedFile?.path}
                    workspacePath={currentPath}
                  />
                </ErrorBoundary>
              )}
            </div>

            {gitPanelOpen && (
              <div className={`app-sidebar ${gitPanelOpen ? 'open' : ''}`}>
                <ErrorBoundary>
                  <Suspense fallback={<LazyPanelFallback lines={8} />}>
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
                            issues={selectedFileIssues}
                            onDiagnosticsChange={handleLanguageDiagnosticsChange}
                          />
                        </ErrorBoundary>
                      </div>
                    </>
                  )}

                  {terminalVisible && (
                    <div style={{
                      height: '300px',
                      flexShrink: 0,
                      borderTop: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'var(--color-surface)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px var(--spacing-sm)',
                        borderBottom: '1px solid var(--color-border)',
                        background: 'var(--color-surface-subtle)'
                      }}>
                        {(['terminal', 'problems', 'output', 'tasks'] as const).map((panel) => (
                          <button
                            key={panel}
                            type="button"
                            className={activeBottomPanel === panel ? 'btn-primary' : 'btn-secondary'}
                            onClick={() => setActiveBottomPanel(panel)}
                          >
                            {panel === 'problems'
                              ? `Problems (${problemCounts.errors}/${problemCounts.warnings})`
                              : panel.charAt(0).toUpperCase() + panel.slice(1)}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => setTerminalVisible(false)}
                          title="Close panel"
                        >
                          Close
                        </button>
                      </div>

                      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        <div style={{ display: activeBottomPanel === 'terminal' ? 'block' : 'none', height: '100%' }}>
                          <ErrorBoundary>
                            <Suspense fallback={<LazyPanelFallback lines={6} />}>
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
                                onErrorsDetected={handleTerminalErrorsDetected}
                              />
                            </Suspense>
                          </ErrorBoundary>
                        </div>

                        {activeBottomPanel === 'problems' && (
                          <ProblemsPanel
                            issues={codeIssues}
                            onOpenIssue={handleOpenProblem}
                            onFixIssue={handleFixProblem}
                          />
                        )}

                        {activeBottomPanel === 'output' && (
                          <OutputPanel
                            runOutput={runOutput}
                            onClose={() => setTerminalVisible(false)}
                          />
                        )}

                        {activeBottomPanel === 'tasks' && (
                          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                              display: 'flex',
                              gap: 6,
                              padding: 'var(--spacing-sm)',
                              borderBottom: '1px solid var(--color-border)',
                              flexWrap: 'wrap'
                            }}>
                              {availableWorkbenchTasks.map((task) => (
                                <button
                                  key={task}
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => { void runWorkbenchTask(task); }}
                                  title={workbenchTaskCommand(task)}
                                >
                                  {task.charAt(0).toUpperCase() + task.slice(1)}
                                </button>
                              ))}
                            </div>
                            <div style={{ overflow: 'auto', flex: 1 }}>
                              {taskRuns.length === 0 ? (
                                <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-muted)' }}>
                                  Run detected project tasks, verify the workspace, or stop running processes from here.
                                </div>
                              ) : (
                                taskRuns.map((task) => (
                                  <div
                                    key={task.id}
                                    style={{
                                      padding: 'var(--spacing-sm) var(--spacing-md)',
                                      borderBottom: '1px solid var(--color-border-subtle)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                      <strong>{task.kind}</strong>
                                      <span style={{
                                        color: task.status === 'failed'
                                          ? 'var(--color-danger)'
                                          : task.status === 'passed'
                                            ? 'var(--color-success)'
                                            : 'var(--color-text-muted)'
                                      }}>
                                        {task.status}
                                      </span>
                                    </div>
                                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4 }}>
                                      {task.summary}
                                    </div>
                                    {task.output && (
                                      <pre style={{
                                        marginTop: 8,
                                        maxHeight: 120,
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        fontSize: 12,
                                        color: 'var(--color-text-muted)'
                                      }}>
                                        {task.output}
                                      </pre>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
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
                  onOpenRecentProject={handleOpenRecentProject}
                  onOpenUserGuide={openUserGuide}
                />
              )}
              </div>

              {/* Live Preview Panel */}
              {livePreviewOpen && (selectedFile || useSplitView) && (
                <div style={{ width: '50%', minWidth: '300px', flexShrink: 0 }}>
                  <ErrorBoundary>
                    <Suspense fallback={<LazyPanelFallback lines={5} />}>
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
          {composerMounted && (
            <ErrorBoundary>
              <Suspense fallback={<LazyPanelFallback lines={10} />}>
                <AIChat
                  isVisible={composerOpen}
                  onClose={() => setComposerOpen(false)}
                  openFiles={openFiles}
                  activeFileIndex={activeFileIndex}
                  diagnostics={codeIssues}
                  getSelectedText={getSelectedText}
                  getCursorPosition={() => editorRef.current?.getCursorPosition?.()}
                  onOpenFolder={openFolder}
                  onOpenTemplates={() => setTemplateModalOpen(true)}
                  onOpenSettings={() => setSettingsOpen(true)}
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
                  onAgentChangesReady={(changes, taskDescription, reviewSessionId, reviewVerification, reviewPlan, reviewCheckpoint) => {
                    if (agentReviewSessionId) {
                      void window.agentAPI.discardAgentReview(agentReviewSessionId);
                    }
                    setAgentReviewTask(taskDescription);
                    setAgentReviewSessionId(reviewSessionId);
                    setAgentReviewApplied(!reviewSessionId);
                    setAgentReviewPlan(reviewPlan || buildFallbackReviewPlanSummary(taskDescription, changes));
                    setAgentReviewCheckpoint(reviewCheckpoint);
                    setAgentReviewVerification(reviewVerification || { status: 'idle', issues: [] });
                    setAgentReviewChanges(changes.map((change) => ({
                      ...change,
                      status: change.status || 'pending'
                    })));
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
            onCreateProject={async (projectPath, _template, createResult) => {
              await openWorkspacePath(projectPath);
              if (createResult?.dependenciesInstalled === false && createResult?.installOutput) {
                toast.warning('Project Created With Setup Notes', 'Dependencies need attention, but the project files were created.');
              }
              toast.success('Project Created', projectPath);
            }}
            onLaunchProject={async (projectPath) => {
              try {
                const result = await window.agentAPI.launchProject(projectPath);
                if (result?.success) {
                  if (result.url && /^(https?|file):\/\//.test(result.url)) {
                    setLivePreviewUrl(result.url);
                    setLivePreviewOpen(true);
                  }
                  toast.success('Preview Launched', result.message || 'Project launched successfully.');
                  return { success: true, message: result.message, url: result.url };
                }

                const message = result?.error || result?.message || 'Could not launch this project automatically.';
                toast.warning('Preview Needs Attention', message);
                return { success: false, error: message, message: result?.message };
              } catch (error: any) {
                const message = error?.message || 'Could not launch this project automatically.';
                toast.warning('Preview Needs Attention', message);
                return { success: false, error: message };
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
          onFileSelect={(filePath, line, column) => {
            void openFileAtLocation(filePath, line, column || 1);
          }}
          workspacePath={currentPath}
        />

        {referenceResults && (
          <div style={{
            position: 'fixed',
            right: composerOpen ? '420px' : '24px',
            bottom: '44px',
            width: '420px',
            maxHeight: '360px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderBottom: '1px solid var(--color-border)',
              fontWeight: 600
            }}>
              <span>References: {referenceResults.word}</span>
              <button className="icon-button" onClick={() => setReferenceResults(null)} title="Close references">
                ×
              </button>
            </div>
            <div style={{ overflow: 'auto' }}>
              {referenceResults.references.length === 0 ? (
                <div style={{ padding: 'var(--spacing-md)', color: 'var(--color-text-muted)' }}>
                  No references found.
                </div>
              ) : (
                referenceResults.references.slice(0, 100).map((reference, index) => {
                  const referencePath = reference.filePath || reference.file || '';
                  const line = reference.line || 1;
                  const column = reference.column || 1;
                  return (
                    <button
                      key={`${referencePath}:${line}:${column}:${index}`}
                      type="button"
                      className="reference-result"
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        border: 0,
                        borderBottom: '1px solid var(--color-border-subtle)',
                        background: 'transparent',
                        color: 'var(--color-text)',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        void openFileAtLocation(referencePath, line, column);
                      }}
                    >
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {referencePath}:{line}:{column}
                      </div>
                      {reference.context && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', marginTop: 4 }}>
                          {reference.context}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {agentReviewChanges.length > 0 && (
          <div style={{
            position: 'fixed',
            top: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(1280px, 96vw)',
            zIndex: 1001,
          }}>
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <MultiFileDiffReview
                  changes={agentReviewChanges}
                  onAcceptFile={(filePath) => { void handleAcceptReviewFile(filePath); }}
                  onRejectFile={(filePath) => { void handleRejectReviewFile(filePath); }}
                  onAcceptAll={() => { void handleAcceptAllReviewFiles(); }}
                  onRejectAll={() => { void handleRejectAllReviewFiles(); }}
                  onApplyAccepted={() => { void handleApplyReviewChanges(); }}
                  onVerifyAccepted={() => { void handleVerifyReviewedProject(); }}
                  onRunProject={() => { void handleRunReviewedProject(); }}
                  onRepair={handleRepairReviewedProject}
                  onRevertSession={() => { void handleRevertLastAgentSession(); }}
                  verification={agentReviewVerification}
                  plan={agentReviewPlan}
                  checkpoint={agentReviewCheckpoint}
                  isStaged={Boolean(agentReviewSessionId)}
                  applied={agentReviewApplied}
                  canRevertSession={agentReviewApplied && latestAppliedReviewSession?.sessionId === agentReviewSessionId}
                  onClose={() => { void clearAgentReviewState(Boolean(agentReviewSessionId)); }}
                  taskDescription={agentReviewTask}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        <StatusBar
          currentFile={getCurrentFileInfo()}
          gitBranch={gitBranch}
          theme={themeType}
          systemStatus={systemStatusSummary}
          problemCounts={problemCounts}
          taskStatus={latestTaskStatus}
          onOpenSystemStatus={() => setSystemPanelOpen(true)}
          onOpenProblems={() => {
            setActiveBottomPanel('problems');
            setTerminalVisible(true);
          }}
          onOpenTasks={() => {
            setActiveBottomPanel('tasks');
            setTerminalVisible(true);
          }}
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

        <Suspense fallback={null}>
          <SystemStatusPanel
            isOpen={systemPanelOpen}
            onClose={() => setSystemPanelOpen(false)}
            status={systemStatusSummary}
            doctorReport={systemDoctorReport}
            doctorLoading={systemDoctorLoading}
            doctorError={systemDoctorError}
            latestAppliedReviewSession={latestAppliedReviewSession}
            onRefresh={() => {
              void refreshSystemStatusSummary();
              void refreshLatestAppliedReviewSession();
              void refreshSystemDoctorReport();
            }}
            onOpenSettings={() => {
              // SystemStatusPanel sits at z-index 10020; SettingsPanel at 1500.
              // Without closing the system panel first, Settings opens behind it
              // and the user has to dismiss the system panel to reach Settings.
              // Closing it here also matches intent: opening Settings from the
              // status panel implies the user is done inspecting status.
              setSystemPanelOpen(false);
              setSettingsOpen(true);
            }}
            onRevertLastSession={() => { void handleRevertLastAgentSession(); }}
          />
        </Suspense>

        <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />

        {currentTheme === 'matrix' && (
          <Suspense fallback={null}>
            <MatrixRain />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;

