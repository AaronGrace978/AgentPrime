/**
 * App - Main Application Component (Refactored)
 * 
 * This component has been modularized from 1,134 lines to a cleaner architecture:
 * - App/types.ts         - Type definitions
 * - App/hooks/           - Custom hooks (useFileOperations, useTabManagement, etc.)
 * - App/components/      - Sub-components (AppHeader, WelcomeScreen, etc.)
 */

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import MonacoEditor, { MonacoEditorRef } from '../MonacoEditor';
import CreateModal from '../CreateModal';
import TemplateModal from '../TemplateModal';
import TaskManager from '../TaskManager';
import VoiceControl from '../VoiceControl';
import TabBar from '../TabBar';
import CommitDialog from '../CommitDialog';
import SearchReplace from '../SearchReplace';
import ErrorBoundary from '../ErrorBoundary';
import SplitViewContainer from '../SplitViewContainer';
import Settings from '../Settings';
import SettingsPanel from '../SettingsPanel';
import PerformanceMonitor from '../PerformanceMonitor';
import TaskRunner from '../TaskRunner';
import StatusBar from '../StatusBar';
import CommandPalette from '../CommandPalette';
import FileTree from '../FileTree';
// DinoBuddy and Onboarding - re-enabled with CSS fixes
const DinoBuddy = React.lazy(() => import('../DinoBuddy'));
// Import triggerDinoReaction for event integration
import('../DinoBuddy').then(module => {
  (window as any).triggerDinoReaction = module.triggerDinoReaction;
});
const Onboarding = React.lazy(() => import('../Onboarding'));
// VibeHub Integration - "GitHub for Vibe Coders" x AgentPrime
const VibeHubPanel = React.lazy(() => import('../VibeHubPanel'));
import KeyboardShortcuts from '../KeyboardShortcuts';
import { ToastContainer, useToast } from '../Toast';
import { getLanguage } from '../../utils';
import {
  IconFolder,
  IconBot,
  IconBrain,
  IconMessage,
  IconSettings,
  IconClose,
  IconChevronLeft,
  IconChevronRight,
  IconSpinner
} from '../Icons';

// Lazy load heavy components for faster startup
const AIChat = React.lazy(() => import('../AIChat'));
const TodoApp = React.lazy(() => import('../TodoApp'));
const GitPanel = React.lazy(() => import('../GitPanel'));
const MirrorIntelligence = React.lazy(() => import('../MirrorIntelligence'));
const JustChat = React.lazy(() => import('../JustChat'));
const WordsToCode = React.lazy(() => import('../WordsToCode'));
const PlanMode = React.lazy(() => import('../PlanMode'));
const RefactoringPanel = React.lazy(() => import('../RefactoringPanel'));
const TeamPatterns = React.lazy(() => import('../TeamPatterns'));
const Debugger = React.lazy(() => import('../Debugger'));
const AgentMode = React.lazy(() => import('../AgentMode'));
const LockScreen = React.lazy(() => import('../LockScreen'));

// Modular imports
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

// Styles
import '../../vibe-styles.css';

function App() {
  // Toast notifications
  const toast = useToast();

  // Custom hooks
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

  const { currentTheme, themeType, toggleTheme, setTheme } = useTheme();
  const { recentProjects } = useRecentProjects(workspacePath);

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder'>('file');
  const [composerOpen, setComposerOpen] = useState(false); // Start closed for clean UI
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [todoAppOpen, setTodoAppOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string>('');
  const [useSplitView, setUseSplitView] = useState(false);
  const [mirrorPanelOpen, setMirrorPanelOpen] = useState(false);
  const [justChatOpen, setJustChatOpen] = useState(false);
  const [justChatInitialSessionId, setJustChatInitialSessionId] = useState<string | undefined>(undefined);
  const [wordsToCodeOpen, setWordsToCodeOpen] = useState(false);
  const [planModeOpen, setPlanModeOpen] = useState(false);
  const [refactoringPanelOpen, setRefactoringPanelOpen] = useState(false);
  const [teamPatternsOpen, setTeamPatternsOpen] = useState(false);
  const [debuggerOpen, setDebuggerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskRunnerOpen, setTaskRunnerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false); // File explorer collapsed by default for AI-first design
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [codeIssues, setCodeIssues] = useState<any[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    // Show onboarding if user hasn't completed it
    return !localStorage.getItem('agentprime-onboarding-completed');
  });
  const [showDinoBuddy, setShowDinoBuddy] = useState(() => {
    // Check if user previously hid DinoBuddy
    return !localStorage.getItem('agentprime-dino-hidden');
  });
  const [vibeHubOpen, setVibeHubOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [agentModeOpen, setAgentModeOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const [appSettings, setAppSettings] = useState<any>({
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on' as const,
    minimap: true,
    lineNumbers: 'on' as const,
    autoSave: true,
    inlineCompletions: true,
    dinoBuddyMode: false,
    activeProvider: 'openai',  // OpenAI - MIT Hackathon optimized
    activeModel: 'gpt-4o',  // GPT-4o - Best balance of quality and speed
    dualOllamaEnabled: false,
    dualModelEnabled: true,
    dualModelConfig: {
      fastModel: { provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      deepModel: { provider: 'openai', model: 'gpt-4o', enabled: true },
      autoRoute: true,
      complexityThreshold: 5,
      deepModelTriggers: [],
      fastModelTriggers: []
    },
    providers: {}
  });

  // Auto-lock minutes from settings (0 = disabled)
  const autoLockMinutes = appSettings.autoLockMinutes || 0;

  const editorRef = useRef<MonacoEditorRef | null>(null);
  
  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings) {
          setAppSettings(settings);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Handle settings changes
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

  // Computed values
  const selectedFile = activeFile?.file || null;
  const fileContent = activeFile?.content || '';
  const hasChanges = activeFile?.isDirty || false;
  const workspaceName = currentPath ? currentPath.split(/[/\\]/).pop() || 'Workspace' : 'AgentPrime';

  // Initialize workspace and check for onboarding
  useEffect(() => {
    const init = async () => {
      try {
        const workspace = await window.agentAPI.getWorkspace();
        if (workspace) {
          await loadDirectory(workspace);
        }
        
        // Check if user has completed onboarding
        // Onboarding disabled - clutters UI
        // const hasCompletedOnboarding = localStorage.getItem('agentprime-onboarding-completed');
      } catch (err: any) {
        console.error('Failed to initialize:', err.message);
      }
    };
    init();
  }, [loadDirectory]);

  // Auto-lock functionality
  useEffect(() => {
    if (autoLockMinutes <= 0 || isLocked) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkInactivity = () => {
      const inactiveMs = Date.now() - lastActivityRef.current;
      const lockAfterMs = autoLockMinutes * 60 * 1000;
      
      if (inactiveMs >= lockAfterMs) {
        setIsLocked(true);
      }
    };

    // Track user activity
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    // Check for inactivity every 30 seconds
    const interval = setInterval(checkInactivity, 30000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      clearInterval(interval);
    };
  }, [autoLockMinutes, isLocked]);

  // Listen for Mirror Intelligence pattern learned events
  useEffect(() => {
    const agentAPI = (window as any).agentAPI;
    if (!agentAPI || !agentAPI.onMirrorPatternLearned) return;

    const handlePatternLearned = (data: { pattern: string; category: string; intelligence: number }) => {
      toast.info(
        '🧠 Learned Pattern',
        `${data.pattern} (${data.category})`
      );
      // Trigger dino thinking reaction
      const trigger = (window as any).triggerDinoReaction;
      if (trigger) trigger('thinking', 'Learning new patterns! 🧠');
    };

    agentAPI.onMirrorPatternLearned(handlePatternLearned);

    return () => {
      if (agentAPI.removeMirrorPatternLearned) {
        agentAPI.removeMirrorPatternLearned();
      }
    };
  }, [toast]);

  // 🦖 Dino Buddy Event Integration - React to app events
  useEffect(() => {
    const trigger = (window as any).triggerDinoReaction;
    if (!trigger) return;

    // Listen for various app events and trigger dino reactions
    const handleDinoEvents = () => {
      // File save success - trigger happy
      const originalSuccess = toast.success;
      toast.success = (title: string, message?: string) => {
        originalSuccess(title, message);
        if (title.toLowerCase().includes('save') || title.toLowerCase().includes('success')) {
          trigger('success', 'Great job! 🎉');
        } else if (title.toLowerCase().includes('commit')) {
          trigger('excited', 'Code committed! 🚀');
        } else {
          trigger('happy', 'Awesome! ✨');
        }
      };

      // Error events - trigger helpful
      const originalError = toast.error;
      toast.error = (title: string, message?: string) => {
        originalError(title, message);
        trigger('error', "No worries, we'll fix it! 🔧");
      };
    };

    // Small delay to ensure trigger is loaded
    const timeout = setTimeout(handleDinoEvents, 1000);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Keyboard shortcuts - Comprehensive system for power users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      
      // ===== AI & PANELS =====
      // Ctrl+L: Open AI Chat (like Cursor!)
      if (mod && key === 'l') {
        e.preventDefault();
        setComposerOpen(!composerOpen);
        return;
      }
      // Ctrl+Shift+C: Open AI Composer
      if (mod && e.shiftKey && key === 'c') {
        e.preventDefault();
        setComposerOpen(true);
        return;
      }
      // Ctrl+J: Toggle Just Chat
      if (mod && key === 'j') {
        e.preventDefault();
        setJustChatOpen(!justChatOpen);
        return;
      }
      // Ctrl+Shift+M: Mirror Intelligence
      if (mod && e.shiftKey && key === 'm') {
        e.preventDefault();
        setMirrorPanelOpen(!mirrorPanelOpen);
        return;
      }
      // Ctrl+Shift+W: Words to Code
      if (mod && e.shiftKey && key === 'w') {
        e.preventDefault();
        setWordsToCodeOpen(!wordsToCodeOpen);
        return;
      }
      // Ctrl+Shift+T: Task Manager
      if (mod && e.shiftKey && key === 't') {
        e.preventDefault();
        setTaskManagerOpen(!taskManagerOpen);
        return;
      }
      // Ctrl+Shift+N: New Project (from template)
      if (mod && e.shiftKey && key === 'n') {
        e.preventDefault();
        setTemplateModalOpen(true);
        return;
      }
      
      // ===== FILE OPERATIONS =====
      // Ctrl+S: Save current file
      if (mod && key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (activeFile?.isDirty) saveFile();
        return;
      }
      // Ctrl+O: Open folder
      if (mod && key === 'o') {
        e.preventDefault();
        openFolder();
        return;
      }
      // Ctrl+B: Toggle file explorer
      if (mod && key === 'b') {
        e.preventDefault();
        setFileExplorerOpen(!fileExplorerOpen);
        return;
      }
      
      // ===== TERMINAL =====
      // Ctrl+`: Toggle terminal
      if (mod && e.key === '`') {
        e.preventDefault();
        setTerminalVisible(!terminalVisible);
        return;
      }
      // F5: Run current script
      if (e.key === 'F5' && !mod) {
        e.preventDefault();
        if (selectedFile) executeScript(selectedFile);
        return;
      }
      // Ctrl+Shift+`: New terminal (future)
      
      // ===== TAB NAVIGATION =====
      // Ctrl+Tab: Next tab
      if (mod && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (openFiles.length > 1) {
          switchTab((activeFileIndex + 1) % openFiles.length);
        }
        return;
      }
      // Ctrl+Shift+Tab: Previous tab
      if (mod && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        if (openFiles.length > 1) {
          switchTab(activeFileIndex === 0 ? openFiles.length - 1 : activeFileIndex - 1);
        }
        return;
      }
      // Ctrl+W: Close current tab
      if (mod && key === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeFileIndex >= 0) closeTab(activeFileIndex);
        return;
      }
      // Ctrl+1-9: Switch to tab by number
      if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < openFiles.length) {
          switchTab(tabIndex);
        }
        return;
      }
      
      // ===== COMMAND PALETTE & SEARCH =====
      // Ctrl+K: Command palette
      if (mod && key === 'k' && !e.shiftKey) {
        e.preventDefault();
        if (commandPaletteOpen) {
          setKeyboardShortcutsOpen(true);
        } else {
          setCommandPaletteOpen(true);
        }
        return;
      }
      // Ctrl+Shift+K: Keyboard shortcuts help
      if (mod && e.shiftKey && key === 'k') {
        e.preventDefault();
        setKeyboardShortcutsOpen(true);
        return;
      }
      // Ctrl+Shift+F: Search & Replace
      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        setSearchReplaceOpen(!searchReplaceOpen);
        return;
      }
      // Ctrl+Shift+G: Git panel
      if (mod && e.shiftKey && key === 'g') {
        e.preventDefault();
        setGitPanelOpen(!gitPanelOpen);
        return;
      }
      // Ctrl+Shift+D: Toggle Dino Buddy Mode 🦖
      if (mod && e.shiftKey && key === 'd') {
        e.preventDefault();
        const newValue = !showDinoBuddy;
        setShowDinoBuddy(newValue);
        if (newValue) {
          localStorage.removeItem('agentprime-dino-hidden');
          toast.success('🦖 Dino Buddy Activated!', 'Your AI companion is here to help!');
        } else {
          localStorage.setItem('agentprime-dino-hidden', 'true');
          toast.info('🦖 Dino Hidden', 'Press Ctrl+Shift+D to bring me back!');
        }
        return;
      }
      // Ctrl+Shift+V: VibeHub panel
      if (mod && e.shiftKey && key === 'v') {
        e.preventDefault();
        setVibeHubOpen(!vibeHubOpen);
        return;
      }
      
      // ===== ESCAPE =====
      if (e.key === 'Escape') {
        // Close modals in order of priority
        if (keyboardShortcutsOpen) {
          setKeyboardShortcutsOpen(false);
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (searchReplaceOpen) {
          setSearchReplaceOpen(false);
          return;
        }
      }
      
      // ===== F1: Help =====
      if (e.key === 'F1') {
        e.preventDefault();
        setKeyboardShortcutsOpen(true);
        return;
      }

      // Ctrl+Shift+A: Agent Mode (Matrix Computer Control)
      if (mod && e.shiftKey && key === 'a') {
        e.preventDefault();
        setAgentModeOpen(!agentModeOpen);
        return;
      }

      // Ctrl+Shift+L: Lock Screen (Matrix Mode)
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        setIsLocked(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeFileIndex, openFiles, terminalVisible, activeFile, saveFile, 
    switchTab, closeTab, commandPaletteOpen, searchReplaceOpen, 
    keyboardShortcutsOpen, selectedFile, executeScript, openFolder,
    composerOpen, justChatOpen, mirrorPanelOpen, taskManagerOpen,
    fileExplorerOpen, gitPanelOpen, wordsToCodeOpen, showDinoBuddy, toast,
    agentModeOpen, isLocked
  ]);

  // Run script wrapper
  const runScript = useCallback(() => {
    if (selectedFile) {
      executeScript(selectedFile);
    }
  }, [selectedFile, executeScript]);

  // Voice command handler
  const handleVoiceCommand = useCallback(async (command: string, result: any) => {
    console.log('🎤 Voice command processed:', command, result);
    setLastVoiceCommand(command);
  }, []);

  // Split view callbacks
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
      console.error(`Error saving: ${err.message}`);
      return false;
    }
  }, []);

  const handleSplitViewFilesChange = useCallback((allFiles: OpenFile[]) => {
    setOpenFiles(allFiles);
    if (allFiles.length === 0) setActiveFileIndex(-1);
  }, [setOpenFiles, setActiveFileIndex]);

  const handleSplitViewActiveFileChange = useCallback((file: OpenFile | null) => {
    if (file) {
      const index = openFiles.findIndex(f => f.file.path === file.file.path);
      if (index >= 0) setActiveFileIndex(index);
    }
  }, [openFiles, setActiveFileIndex]);

  // Get selected text from editor
  const getSelectedText = useCallback((): string | undefined => {
    return editorRef.current?.getSelectedText?.();
  }, []);

  // Get current file info for status bar
  const getCurrentFileInfo = useCallback(() => {
    if (!activeFile) return null;
    const lines = activeFile.content.split('\n').length;
    return {
      name: activeFile.file.name,
      path: activeFile.file.path,
      language: getLanguage(activeFile.file.name),
      lines
    };
  }, [activeFile]);

  // Command Palette commands
  const commands: Command[] = [
    { id: 'open-folder', title: 'Open Project', description: 'Open a folder as workspace', icon: '📁', category: 'file', shortcut: 'Ctrl+O', action: openFolder },
    { id: 'new-file', title: 'New File', description: 'Create a new file', icon: '📄', category: 'file', action: () => { setModalType('file'); setModalOpen(true); } },
    { id: 'save-file', title: 'Save File', description: 'Save current file', icon: '💾', category: 'file', shortcut: 'Ctrl+S', action: () => saveFile() },
    { id: 'ai-chat', title: 'AI Chat', description: 'Open AI coding assistant', icon: '🤖', category: 'ai', shortcut: 'Ctrl+Shift+C', action: () => setComposerOpen(true) },
    { id: 'just-chat', title: 'Just Chat', description: 'Casual chat without code', icon: '💬', category: 'ai', action: () => setJustChatOpen(true) },
    { id: 'words-to-code', title: 'Words to Code', description: 'Generate files from natural language', icon: '🪄', category: 'ai', shortcut: 'Ctrl+Shift+W', action: () => setWordsToCodeOpen(true) },
    { id: 'mirror', title: 'Mirror Intelligence', description: 'Learn from code patterns', icon: '🧠', category: 'ai', action: () => setMirrorPanelOpen(!mirrorPanelOpen) },
    { id: 'plan-mode', title: 'Plan Mode', description: 'Review AI changes before applying', icon: '📋', category: 'ai', action: () => setPlanModeOpen(!planModeOpen) },
    { id: 'refactoring', title: 'Refactoring Panel', description: 'AI-powered code refactoring', icon: '🔧', category: 'ai', action: () => setRefactoringPanelOpen(!refactoringPanelOpen) },
    { id: 'team-patterns', title: 'Team Patterns', description: 'View and share team code patterns', icon: '👥', category: 'ai', action: () => setTeamPatternsOpen(!teamPatternsOpen) },
    { id: 'debugger', title: 'Debugger', description: 'Debug your code with breakpoints', icon: '🐛', category: 'navigation', shortcut: 'F5', action: () => setDebuggerOpen(!debuggerOpen) },
    { id: 'toggle-split', title: 'Toggle Split View', description: 'Split editor view', icon: '⫿', category: 'view', action: () => setUseSplitView(!useSplitView) },
    { id: 'toggle-terminal', title: 'Toggle Terminal', description: 'Show/hide output panel', icon: '💻', category: 'view', shortcut: 'Ctrl+`', action: () => setTerminalVisible(!terminalVisible) },
    { id: 'git-panel', title: 'Source Control', description: 'Open Git panel', icon: '🌿', category: 'git', action: () => setGitPanelOpen(!gitPanelOpen) },
    { id: 'git-commit', title: 'Commit Changes', description: 'Create a new commit', icon: '✓', category: 'git', action: () => setCommitDialogOpen(true) },
    { id: 'search-replace', title: 'Search & Replace', description: 'Advanced search and replace', icon: '🔍', category: 'file', shortcut: 'Ctrl+F', action: () => setSearchReplaceOpen(true) },
    { id: 'settings', title: 'Settings', description: 'Configure AI models and preferences', icon: '⚙️', category: 'settings', action: () => setSettingsOpen(true) },
    { id: 'toggle-theme', title: 'Toggle Theme', description: 'Switch between light and dark', icon: '🌓', category: 'settings', action: async () => {
      await toggleTheme();
      toast.info('Theme Changed', `Switched to ${themeType === 'dark' ? 'light' : 'dark'} mode`);
    }},
    { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', description: 'View all keyboard shortcuts', icon: '⌨️', category: 'settings', shortcut: 'Ctrl+Shift+K', action: () => setKeyboardShortcutsOpen(true) },
    { id: 'toggle-dino-buddy', title: 'Toggle Dino Buddy Mode', description: 'Activate your AI companion mascot with emotions & sparkles!', icon: '🦖', category: 'view', shortcut: 'Ctrl+Shift+D', action: () => {
      const newValue = !showDinoBuddy;
      setShowDinoBuddy(newValue);
      if (newValue) {
        localStorage.removeItem('agentprime-dino-hidden');
        toast.success('🦖 Dino Buddy Activated!', 'Your AI companion is here to help!');
      } else {
        localStorage.setItem('agentprime-dino-hidden', 'true');
        toast.info('🦖 Dino Hidden', 'Press Ctrl+Shift+D to bring me back!');
      }
    }},
    { id: 'vibehub', title: 'VibeHub', description: 'Version control for humans - checkpoints, versions, timeline', icon: '✨', category: 'git', shortcut: 'Ctrl+Shift+V', action: () => setVibeHubOpen(!vibeHubOpen) },
    { id: 'agent-mode', title: 'Agent Mode', description: 'Matrix computer control - AI controls your system', icon: '🤖', category: 'ai', shortcut: 'Ctrl+Shift+A', action: () => setAgentModeOpen(true) },
    { id: 'lock-screen', title: 'Lock Screen', description: 'Matrix lock screen - secure your session', icon: '🔒', category: 'view', shortcut: 'Ctrl+Shift+L', action: () => setIsLocked(true) },
    { id: 'vibehub-checkpoint', title: 'Quick Checkpoint', description: 'Save a checkpoint with AI-generated message', icon: '✓', category: 'git', action: async () => {
      setVibeHubOpen(true);
      // Auto-generate message when opening
      try {
        const api = (window as any).agentAPI;
        if (api?.vibeHub && currentPath) {
          await api.vibeHub.init(currentPath);
        }
      } catch (e) { console.error(e); }
    }},
    { id: 'task-runner', title: 'Task Runner', description: 'Run npm scripts', icon: '🚀', category: 'navigation', action: () => setTaskRunnerOpen(true) },
    { id: 'tasks', title: 'Task Manager', description: 'Manage project tasks', icon: '📝', category: 'navigation', shortcut: 'Ctrl+Shift+T', action: () => setTaskManagerOpen(true) },
    { id: 'run-code', title: 'Run Code', description: 'Execute current file', icon: '▶️', category: 'navigation', action: runScript },
  ];

  return (
    <ErrorBoundary>
      <div className={`app ${composerOpen ? 'ai-composer-prominent' : ''}`}>
        {/* Header */}
        <AppHeader
          workspaceName={workspaceName}
          selectedFile={selectedFile}
          hasChanges={hasChanges}
          isRunning={isRunning}
          useSplitView={useSplitView}
          gitPanelOpen={gitPanelOpen}
          mirrorPanelOpen={mirrorPanelOpen}
          onOpenFolder={openFolder}
          onOpenComposer={() => setComposerOpen(true)}
          onOpenJustChat={() => setJustChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSaveFile={() => saveFile()}
          onRunScript={runScript}
          onToggleSplitView={() => setUseSplitView(!useSplitView)}
          onToggleGitPanel={() => setGitPanelOpen(!gitPanelOpen)}
          onToggleMirrorPanel={() => setMirrorPanelOpen(!mirrorPanelOpen)}
          vibeHubOpen={vibeHubOpen}
          onToggleVibeHub={() => setVibeHubOpen(!vibeHubOpen)}
          agentModeOpen={agentModeOpen}
          onToggleAgentMode={() => setAgentModeOpen(!agentModeOpen)}
        />

        {/* Main Content */}
        <div className="app-main">
          <div className="app-layout">
            {/* File Explorer Sidebar (Left) */}
            <div className={`file-explorer-sidebar ${fileExplorerOpen ? 'open' : ''}`}>
              <div className="file-explorer-header">
                <h3><IconFolder size="sm" /> Explorer</h3>
                <button
                  className="sidebar-toggle"
                  onClick={() => setFileExplorerOpen(!fileExplorerOpen)}
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
                    onCreateFile={() => { setModalType('file'); setModalOpen(true); }}
                    onCreateFolder={() => { setModalType('folder'); setModalOpen(true); }}
                    onRefresh={() => { /* FileTree handles its own refresh internally */ }}
                    selectedPath={selectedFile?.path}
                    workspacePath={currentPath}
                  />
                </ErrorBoundary>
              )}
            </div>

            {/* Git Sidebar (when open) - Lazy loaded */}
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

            {/* Mirror Intelligence Panel - Lazy loaded */}
            {mirrorPanelOpen && (
              <div className="mirror-sidebar">
                <ErrorBoundary>
                  <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Mirror Intelligence...</div>}>
                    <MirrorIntelligence
                      expanded={true}
                      onToggle={() => setMirrorPanelOpen(false)}
                      onPatternLearned={(data) => {
                        toast.success(
                          `🧠 Learned: ${data.pattern}`,
                          `New ${data.category} pattern added to Mirror Intelligence`
                        );
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}

            {/* Main Editor Area */}
            <div className="app-content">
              {/* Tab Bar */}
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
                              lineNumbers: appSettings.lineNumbers,
                            }}
                            issues={codeIssues}
                          />
                        </ErrorBoundary>
                      </div>
                    </>
                  )}

                  {/* Output Panel */}
                  {(terminalVisible || runOutput.length > 0) && (
                    <OutputPanel
                      runOutput={runOutput}
                      onClose={() => setTerminalVisible(false)}
                    />
                  )}
                </div>
              ) : (
                <WelcomeScreen
                  recentProjects={recentProjects}
                  onOpenFolder={openFolder}
                  onOpenComposer={() => setComposerOpen(true)}
                  onNewFile={() => { setModalType('file'); setModalOpen(true); }}
                  onNewProject={() => setTemplateModalOpen(true)}
                  onOpenTaskManager={() => setTaskManagerOpen(true)}
                  onOpenTodoDemo={() => setTodoAppOpen(true)}
                  onOpenRecentProject={loadDirectory}
                />
              )}
            </div>
          </div>
        </div>

        {/* AI Composer Sidebar (Right) - Persistent */}
        <div className={`ai-composer-sidebar ${composerOpen ? 'open' : ''}`}>
          <div className="composer-sidebar-header">
            <h3><IconBot size="sm" /> AI Composer</h3>
            <button
              className="sidebar-toggle"
              onClick={() => setComposerOpen(!composerOpen)}
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
                  onOpenTemplates={() => { setModalType('file'); setModalOpen(true); }}
                  onApplyCode={async (code, filePath) => {
                    // Apply code to file
                    if (filePath) {
                      // Open the file first if specified
                      await openFile({ path: filePath, name: filePath.split(/[/\\]/).pop() || '', is_dir: false });
                    }
                    
                    // Apply to current active file
                    if (activeFileIndex >= 0 && openFiles[activeFileIndex]) {
                      // Replace entire file content via state update
                      // The MonacoEditor will re-render with new content
                      handleContentChange(code);
                    }
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        {taskManagerOpen && (
          <TaskManager
            isOpen={taskManagerOpen}
            onClose={() => setTaskManagerOpen(false)}
          />
        )}

        {todoAppOpen && (
          <div className="modal-overlay" onClick={() => setTodoAppOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>AI-Created Todo App</h3>
                <button className="modal-close" onClick={() => setTodoAppOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <Suspense fallback={<div className="loading-spinner"><IconSpinner size="md" /> Loading Todo App...</div>}>
                  <TodoApp />
                </Suspense>
              </div>
            </div>
          </div>
        )}

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
            onCreateProject={async (template) => {
              // After project is created, open the folder
              const result = await (window as any).agentAPI.selectDirectory();
              if (result.success) {
                await openFolder();
              }
            }}
            onSwitchToAIComposer={(request) => {
              // Switch to AI Composer with the user's request
              setTemplateModalOpen(false);
              setComposerOpen(true);
              // The AI Composer will receive the request through its existing flow
              setTimeout(() => {
                // Simulate sending the message to AI Composer
                if (window.agentAPI && window.agentAPI.sendMessage) {
                  window.agentAPI.sendMessage(request);
                }
              }, 500);
            }}
          />
        )}

        <CommitDialog
          isOpen={commitDialogOpen}
          onClose={() => setCommitDialogOpen(false)}
          onCommit={async (message) => {
            const result = await window.agentAPI.gitCommit(message);
            if (!result.success) throw new Error(result.error || 'Commit failed');
          }}
        />

        <VoiceControl
          onVoiceCommand={handleVoiceCommand}
          isListening={voiceListening}
          onToggleListening={() => setVoiceListening(!voiceListening)}
        />

        <StatusBar
          currentFile={getCurrentFileInfo()}
          gitBranch={gitBranch}
          theme={themeType}
        />

        <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Just Chat...</div>}>
          <JustChat
            isOpen={justChatOpen}
            onClose={() => setJustChatOpen(false)}
            initialSessionId={justChatInitialSessionId}
          />
        </Suspense>

        
        <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Words to Code...</div>}>
          <WordsToCode
            isOpen={wordsToCodeOpen}
            onClose={() => setWordsToCodeOpen(false)}
          />
        </Suspense>

        {/* Plan Mode - Review AI changes before applying */}
        {planModeOpen && (
          <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Plan Mode...</div>}>
            <PlanMode
              isOpen={planModeOpen}
              onClose={() => setPlanModeOpen(false)}
              plan={{ actions: [], summary: 'No pending changes' }}
              onApprove={(actionId: string) => {
                console.log('Approve:', actionId);
                // TODO: Integrate with agent loop to approve specific actions
              }}
              onReject={(actionId: string) => {
                console.log('Reject:', actionId);
                // TODO: Integrate with agent loop to reject specific actions
              }}
              onApproveAll={() => {
                console.log('Approve all');
                setPlanModeOpen(false);
              }}
              onRejectAll={() => {
                console.log('Reject all');
                setPlanModeOpen(false);
              }}
              onExecute={() => {
                console.log('Execute plan');
                setPlanModeOpen(false);
              }}
            />
          </Suspense>
        )}

        {/* Refactoring Panel - AI-powered code refactoring */}
        {refactoringPanelOpen && (
          <div className="modal-overlay" onClick={() => setRefactoringPanelOpen(false)}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
              <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Refactoring Panel...</div>}>
                <RefactoringPanel
                  filePath={selectedFile?.path || ''}
                  workspacePath={currentPath || ''}
                  onRefactorComplete={(result) => {
                    console.log('Refactoring complete:', result);
                    setRefactoringPanelOpen(false);
                  }}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Team Patterns - View and share team code patterns */}
        {teamPatternsOpen && (
          <div className="modal-overlay" onClick={() => setTeamPatternsOpen(false)}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Team Patterns</h3>
                <button className="modal-close" onClick={() => setTeamPatternsOpen(false)}>×</button>
              </div>
              <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Team Patterns...</div>}>
                <TeamPatterns
                  teamId="default"
                  userId="current-user"
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Debugger Panel */}
        {debuggerOpen && (
          <div className="modal-overlay" onClick={() => setDebuggerOpen(false)}>
            <div className="modal-content modal-fullscreen" onClick={(e) => e.stopPropagation()}>
              <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading Debugger...</div>}>
                <Debugger
                  breakpoints={[]}
                  onBreakpointToggle={(file: string, line: number) => console.log('Toggle breakpoint:', file, line)}
                  onBreakpointRemove={(id: string) => console.log('Remove breakpoint:', id)}
                  onBreakpointCondition={(id: string, condition: string) => console.log('Set condition:', id, condition)}
                  debugState={{
                    status: 'stopped',
                    callStack: [],
                    variables: { local: [], global: [], watch: [] }
                  }}
                  onStart={() => console.log('Start debugging')}
                  onStop={() => console.log('Stop debugging')}
                  onStepOver={() => console.log('Step over')}
                  onStepInto={() => console.log('Step into')}
                  onStepOut={() => console.log('Step out')}
                  onContinue={() => console.log('Continue')}
                  onAddWatch={(expression: string) => console.log('Add watch:', expression)}
                  onRemoveWatch={(expression: string) => console.log('Remove watch:', expression)}
                />
              </Suspense>
            </div>
          </div>
        )}
        
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
          onFileSelect={(filePath, line) => {
            // Open file at specific line
            const fileItem = {
              name: filePath.split(/[/\\]/).pop() || filePath,
              path: filePath,
              is_dir: false,
              extension: filePath.split('.').pop() || null
            };
            openFile(fileItem);
            // TODO: Navigate to line in editor
          }}
          workspacePath={currentPath}
        />
        
        {/* Onboarding removed - cluttered UI */}

        <KeyboardShortcuts
          isOpen={keyboardShortcutsOpen}
          onClose={() => setKeyboardShortcutsOpen(false)}
        />
        
        <ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
        
        {/* Task Runner Panel */}
        {taskRunnerOpen && (
          <div className="modal-overlay" onClick={() => setTaskRunnerOpen(false)}>
            <div 
              className="modal-content" 
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '600px', maxHeight: '70vh', overflow: 'hidden' }}
            >
              <TaskRunner 
                workspacePath={currentPath || undefined}
                onClose={() => setTaskRunnerOpen(false)}
              />
            </div>
          </div>
        )}
        
        {/* 🦖 DINO BUDDY MODE - AI Companion Mascot 🦕
            Features: Emotion-based animations, glow effects, sparkles,
            thought bubbles, energy bar, pet interactions, draggable!
            Toggle with Ctrl+Shift+D or command palette */}
        {showDinoBuddy && (
          <Suspense fallback={null}>
            <DinoBuddy
              isVisible={showDinoBuddy}
              onClick={() => setComposerOpen(true)}
              onHide={() => {
                setShowDinoBuddy(false);
                localStorage.setItem('agentprime-dino-hidden', 'true');
                toast.info('🦖 Dino Hidden', 'Press Ctrl+Shift+D or use command palette to bring me back!');
              }}
            />
          </Suspense>
        )}

        {/* Onboarding - first-time user welcome */}
        {onboardingOpen && (
          <Suspense fallback={<div className="loading-placeholder"><IconSpinner size="md" /> Loading...</div>}>
            <Onboarding
              isOpen={onboardingOpen}
              onClose={() => {
                setOnboardingOpen(false);
                localStorage.setItem('agentprime-onboarding-completed', 'true');
              }}
            />
          </Suspense>
        )}

        {/* VibeHub Panel - Human-Friendly Version Control */}
        {vibeHubOpen && (
          <Suspense fallback={null}>
            <VibeHubPanel
              isOpen={vibeHubOpen}
              onClose={() => setVibeHubOpen(false)}
              workspacePath={currentPath || ''}
            />
          </Suspense>
        )}

        {/* Agent Mode - Matrix Computer Control */}
        {agentModeOpen && (
          <Suspense fallback={null}>
            <AgentMode
              isOpen={agentModeOpen}
              onClose={() => setAgentModeOpen(false)}
            />
          </Suspense>
        )}

        {/* Matrix Lock Screen */}
        {isLocked && (
          <Suspense fallback={null}>
            <LockScreen
              isLocked={isLocked}
              onUnlock={() => {
                setIsLocked(false);
                lastActivityRef.current = Date.now();
              }}
              autoLockMinutes={autoLockMinutes}
            />
          </Suspense>
        )}

        {/* Performance Monitor - floating widget */}
        <PerformanceMonitor position="bottom-right" />
      </div>
    </ErrorBoundary>
  );
}

export default App;

