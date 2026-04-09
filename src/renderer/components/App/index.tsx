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
import type { AgentReviewPlanSummary, AgentReviewSessionSnapshot } from '../../../types/agent-review';
import type { SystemDoctorReport, SystemStatusSummary } from '../../../types/system-health';
import {
  buildFallbackReviewPlanSummary,
  buildRepairPrompt,
  shouldAutoVerifyReviewChanges,
  type ReviewVerificationState,
} from './reviewFlow';

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

const LazyPanelFallback: React.FC<{ lines?: number; padded?: boolean }> = ({
  lines = 6,
  padded = true,
}) => (
  <div style={{ padding: padded ? 'var(--spacing-md)' : 0, height: '100%', overflow: 'hidden' }}>
    <PanelSkeleton lines={lines} padding={padded} />
  </div>
);

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
    runScript: executeScript,
    killScript
  } = useScriptRunner();

  const { currentTheme, themeType, setTheme } = useTheme();
  const { recentProjects } = useRecentProjects(workspacePath);

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
    pythonBrainEnabled: false,
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

  const applyReviewSessionSnapshot = useCallback((snapshot?: AgentReviewSessionSnapshot) => {
    if (!snapshot) return;
    setAgentReviewSessionId(snapshot.sessionId);
    setAgentReviewApplied(Boolean(snapshot.appliedAt));
    setAgentReviewChanges(snapshot.changes);
    setAgentReviewPlan((prev) => snapshot.plan || prev);
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
      toast.error('Verification Failed', message);
    }
  }, [agentReviewApplied, currentPath, loadDirectory, toast]);

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
    const prompt = buildRepairPrompt(agentReviewTask, agentReviewVerification, targetedAcceptedFiles, rejectedFiles);
    setComposerOpen(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agentprime:repair-scope', {
        detail: {
          allowedFiles: targetedAcceptedFiles,
          blockedFiles: [...rejectedFiles, ...blockedAcceptedFiles],
          findings: agentReviewVerification.findings || [],
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
                            issues={codeIssues}
                          />
                        </ErrorBoundary>
                      </div>
                    </>
                  )}

                  {terminalVisible && (
                    <div style={{ height: '280px', flexShrink: 0 }}>
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
                  onAgentChangesReady={(changes, taskDescription, reviewSessionId, reviewVerification, reviewPlan) => {
                    if (agentReviewSessionId) {
                      void window.agentAPI.discardAgentReview(agentReviewSessionId);
                    }
                    setAgentReviewTask(taskDescription);
                    setAgentReviewSessionId(reviewSessionId);
                    setAgentReviewApplied(!reviewSessionId);
                    setAgentReviewPlan(reviewPlan || buildFallbackReviewPlanSummary(taskDescription, changes));
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
              await loadDirectory(projectPath);
              if (createResult?.dependenciesInstalled === false && createResult?.installOutput) {
                toast.error('Project Created With Setup Warnings', createResult.installOutput);
              }
              toast.success('Project Created', projectPath);
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

        {agentReviewChanges.length > 0 && (
          <div style={{
            position: 'fixed',
            top: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(1000px, 92vw)',
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
          gitBranch={null}
          theme={themeType}
          systemStatus={systemStatusSummary}
          onOpenSystemStatus={() => setSystemPanelOpen(true)}
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
            onOpenSettings={() => setSettingsOpen(true)}
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

