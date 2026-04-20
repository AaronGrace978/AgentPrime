/**
 * AIChat - Refactored AI Chat Component
 * 
 * This component has been modularized from 1,632 lines to ~350 lines
 * by extracting types, constants, hooks, and sub-components.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { promptBuilder } from '../../agent';
import type { AIRuntimeSnapshot, ModelInfo } from '../../../types/ai-providers';
import type { Settings } from '../../../types';

// Types and constants
import { Message, MessageMetadata, AIChatProps, ChatMode, AgentFileChange } from './types';
import {
  WELCOME_MESSAGE,
  CHAT_WELCOME_MESSAGE,
  DINO_WELCOME_MESSAGE,
  QUICK_PROMPTS,
  CHAT_QUICK_PROMPTS,
  DINO_QUICK_PROMPTS,
  PROVIDER_OPTIONS,
  getModelOptionsForProvider,
  getProviderLabel,
} from './constants';
import { runtimeBudgetToDualMode } from '../../../types/runtime-budget';
import type { AgentRepairScope } from '../../../types/agent-review';

// Custom hooks
import { useDualModel, usePythonBrain, useWorkspace } from './hooks';

// Sub-components
import {
  ChatHeader,
  BrainSelector,
  MessageList,
  QuickPrompts,
  ChatInput,
  StatusBar as ChatRuntimeStatusBar,
  WorkspaceSelector,
  SpecializedAgentsToggle,
  CreateFolderDialog,
  AIErrorRecovery,
  classifyAIError
} from './components';
import type { AIError } from './components';

// 🦖 DINO BUDDY: Agent Progress Tracker
import AgentProgressTracker from '../AgentProgressTracker';

const AUTONOMY_LABELS: Record<number, string> = {
  1: 'Guided',
  2: 'Cautious',
  3: 'Balanced',
  4: 'Extended',
  5: 'Hands-off'
};

function clampAgentAutonomyLevel(value: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as 1 | 2 | 3 | 4 | 5;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown error';
}

type NonAgentMode = Extract<ChatMode, 'chat' | 'dino'>;
type NonAgentSelection = { provider: string; model: string };
type ProviderModelCatalogNotice = {
  kind: 'error' | 'fallback';
  message: string;
};

const DEFAULT_AGENT_MODEL = 'qwen3-coder:480b-cloud';
const DEFAULT_ASSISTANT_BEHAVIOR_PROFILE: NonNullable<Settings['assistantBehaviorProfile']> = 'default';
const DEFAULT_NON_AGENT_SELECTIONS: Record<NonAgentMode, NonAgentSelection> = {
  chat: { provider: 'openai', model: 'gpt-5.4' },
  dino: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
};

function normalizeMessageMetadata(metadata: unknown): MessageMetadata | undefined {
  if (metadata && typeof metadata === 'object') {
    const raw = metadata as {
      assistantBehaviorProfile?: string;
      providerLabel?: string;
      modelLabel?: string;
      viaFallback?: boolean;
    };

    const normalized: MessageMetadata = {};

    if (raw.assistantBehaviorProfile === 'vibecoder') {
      normalized.assistantBehaviorProfile = 'vibecoder';
    }
    if (typeof raw.providerLabel === 'string' && raw.providerLabel.trim()) {
      normalized.providerLabel = raw.providerLabel;
    }
    if (typeof raw.modelLabel === 'string' && raw.modelLabel.trim()) {
      normalized.modelLabel = raw.modelLabel;
    }
    if (raw.viaFallback === true) {
      normalized.viaFallback = true;
    }

    if (Object.keys(normalized).length > 0) {
      return normalized;
    }
  }

  return undefined;
}

function isNonAgentMode(mode: ChatMode): mode is NonAgentMode {
  return mode === 'chat' || mode === 'dino';
}

function inferProviderForModel(model?: string): string | undefined {
  if (!model) {
    return undefined;
  }

  return PROVIDER_OPTIONS.find((option) =>
    getModelOptionsForProvider(option.value).some((candidate) => candidate.value === model)
  )?.value;
}

function resolveNonAgentSelection(
  mode: NonAgentMode,
  settings: Settings,
  fallback: NonAgentSelection
): NonAgentSelection {
  const defaultSelection = DEFAULT_NON_AGENT_SELECTIONS[mode];
  const savedProvider = mode === 'chat' ? settings.chatProvider : settings.dinoProvider;
  const savedModel = mode === 'chat' ? settings.chatModel : settings.dinoModel;
  const inferredProvider = inferProviderForModel(savedModel);
  const provider =
    PROVIDER_OPTIONS.some((option) => option.value === savedProvider)
      ? savedProvider!
      : inferredProvider || fallback.provider || defaultSelection.provider;
  const providerModels = getModelOptionsForProvider(provider);
  const model =
    savedModel && providerModels.some((option) => option.value === savedModel)
      ? savedModel
      : fallback.model && providerModels.some((option) => option.value === fallback.model)
        ? fallback.model
        : providerModels[0]?.value || defaultSelection.model;

  return { provider, model };
}

function normalizeFetchedModelOptions(models: ModelInfo[] | undefined): Array<{ value: string; label: string }> {
  return (models || [])
    .filter((model) => Boolean(model?.id || model?.name))
    .map((model) => ({
      value: model.id || model.name,
      label: model.name || model.id,
    }));
}

function extractProviderModelCatalogNotice(
  provider: string,
  models: ModelInfo[] | undefined
): ProviderModelCatalogNotice | null {
  const catalogWarning = models?.find((model) => typeof model?.catalogWarning === 'string')?.catalogWarning;
  if (catalogWarning) {
    return {
      kind: 'fallback',
      message: catalogWarning,
    };
  }

  if ((models || []).length === 0) {
    return {
      kind: 'fallback',
      message: `${getProviderLabel(provider)} did not return any live models. Using the built-in model list instead.`,
    };
  }

  return null;
}

const AIChat: React.FC<AIChatProps> = ({
  isVisible = true,
  onClose,
  openFiles = [],
  activeFileIndex = -1,
  getSelectedText,
  getCursorPosition,
  onOpenFolder,
  onOpenTemplates,
  onApplyCode,
  onAgentChangesReady
}) => {
  // Chat mode: agent (default), chat (just talk), dino (Dino Buddy)
  const [chatMode, setChatMode] = useState<ChatMode>('agent');

  const welcomeForMode = (mode: ChatMode): Message =>
    mode === 'dino' ? { ...DINO_WELCOME_MESSAGE, timestamp: new Date() }
    : mode === 'chat' ? { ...CHAT_WELCOME_MESSAGE, timestamp: new Date() }
    : { ...WELCOME_MESSAGE, timestamp: new Date() };

  // Messages state
  const [messages, setMessages] = useState<Message[]>([welcomeForMode('agent')]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSelectedModel, setAgentSelectedModel] = useState(DEFAULT_AGENT_MODEL);
  const [nonAgentSelections, setNonAgentSelections] = useState<Record<NonAgentMode, NonAgentSelection>>(DEFAULT_NON_AGENT_SELECTIONS);
  const [availableProviderModels, setAvailableProviderModels] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [providerModelCatalogNotices, setProviderModelCatalogNotices] = useState<Record<string, ProviderModelCatalogNotice>>({});
  const [useSpecializedAgents, setUseSpecializedAgents] = useState(true);
  const [agentAutonomyLevel, setAgentAutonomyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [assistantBehaviorProfile, setAssistantBehaviorProfile] =
    useState<NonNullable<Settings['assistantBehaviorProfile']>>(DEFAULT_ASSISTANT_BEHAVIOR_PROFILE);
  const [agentPrefsHydrated, setAgentPrefsHydrated] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [lastError, setLastError] = useState<AIError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastFailedInput, setLastFailedInput] = useState('');
  const [runtimeStatus, setRuntimeStatus] = useState<AIRuntimeSnapshot | null>(null);

  // Progress tracking state
  const [currentTask, setCurrentTask] = useState('');
  const agentFileChangesRef = useRef<Map<string, AgentFileChange>>(new Map());
  const pendingRepairScopeRef = useRef<AgentRepairScope | null>(null);
  const hydratedUseSpecializedAgentsRef = useRef<boolean | null>(null);
  const hydratedAutonomyLevelRef = useRef<1 | 2 | 3 | 4 | 5 | null>(null);

  // Prefill chat input when templates route a request here.
  useEffect(() => {
    const handlePrefillMessage = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (typeof customEvent.detail === 'string' && customEvent.detail.trim()) {
        setInput(customEvent.detail);
      }
    };

    window.addEventListener('agentprime:prefill-message', handlePrefillMessage as EventListener);
    return () => {
      window.removeEventListener('agentprime:prefill-message', handlePrefillMessage as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleRepairScope = (event: Event) => {
      const customEvent = event as CustomEvent<AgentRepairScope>;
      if (customEvent.detail) {
        pendingRepairScopeRef.current = customEvent.detail;
      }
    };

    window.addEventListener('agentprime:repair-scope', handleRepairScope as EventListener);
    return () => {
      window.removeEventListener('agentprime:repair-scope', handleRepairScope as EventListener);
    };
  }, []);

  // Custom hooks
  const { dualModel, brainConfig, setMode, saveBrainConfig } = useDualModel();
  const { status: pythonBrainStatus, isConnected: brainConnected, recordOutcome } = usePythonBrain();
  const { workspacePath, openFolder, updateContext } = useWorkspace({
    openFiles,
    activeFileIndex,
    getSelectedText,
    getCursorPosition
  });

  const clearProviderModelCatalogNotice = (provider: string) => {
    setProviderModelCatalogNotices((prev) => {
      if (!(provider in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const persistNonAgentSelection = async (mode: NonAgentMode, selection: NonAgentSelection) => {
    try {
      await window.agentAPI.updateSettings(
        mode === 'chat'
          ? { chatProvider: selection.provider, chatModel: selection.model }
          : { dinoProvider: selection.provider, dinoModel: selection.model }
      );
    } catch (error) {
      console.error(`Failed to save ${mode} model preference:`, error);
    }
  };

  const fetchProviderModels = async (provider: string): Promise<Array<{ value: string; label: string }>> => {
    try {
      const models = await window.agentAPI.getProviderModels(provider);
      const normalized = normalizeFetchedModelOptions(models);
      const notice = extractProviderModelCatalogNotice(provider, models);
      if (notice) {
        setProviderModelCatalogNotices((prev) => ({ ...prev, [provider]: notice }));
      } else {
        clearProviderModelCatalogNotice(provider);
      }
      if (normalized.length > 0) {
        setAvailableProviderModels((prev) => ({ ...prev, [provider]: normalized }));
        return normalized;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setProviderModelCatalogNotices((prev) => ({
        ...prev,
        [provider]: {
          kind: 'error',
          message,
        }
      }));
      console.warn(`Failed to load live models for ${provider}:`, message);
    }

    return getModelOptionsForProvider(provider);
  };

  const getResolvedModelOptions = (provider: string) =>
    availableProviderModels[provider]?.length ? availableProviderModels[provider] : getModelOptionsForProvider(provider);

  const loadHistoryForMode = async (mode: ChatMode) => {
    try {
      const result = await window.agentAPI.getChatHistory(mode);
      if (result.success && Array.isArray(result.history) && result.history.length > 0) {
        const historyMessages: Message[] = result.history.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          metadata: normalizeMessageMetadata(msg.metadata),
        }));
        setMessages(historyMessages);
        return;
      }
    } catch (error) {
      console.error(`Failed to load ${mode} chat history:`, error);
    }

    setMessages([welcomeForMode(mode)]);
  };

  useEffect(() => {
    const loadInitialChatState = async () => {
      try {
        const [settings, status] = await Promise.all([
          window.agentAPI.getSettings(),
          window.agentAPI.aiStatus().catch((error) => ({ success: false as const, error: error?.message }))
        ]);

        const runtime = status && status.success ? status.runtime : null;
        if (runtime) {
          setRuntimeStatus(runtime);
          setAgentSelectedModel(runtime.displayModel || runtime.effectiveModel || DEFAULT_AGENT_MODEL);
        } else {
          setAgentSelectedModel(settings?.activeModel || DEFAULT_AGENT_MODEL);
        }

        const fallbackSelection: NonAgentSelection = DEFAULT_NON_AGENT_SELECTIONS.chat;

        setNonAgentSelections({
          chat: resolveNonAgentSelection('chat', settings, DEFAULT_NON_AGENT_SELECTIONS.chat),
          dino: resolveNonAgentSelection('dino', settings, DEFAULT_NON_AGENT_SELECTIONS.dino),
        });
        setAssistantBehaviorProfile(
          settings?.assistantBehaviorProfile === 'vibecoder' ? 'vibecoder' : DEFAULT_ASSISTANT_BEHAVIOR_PROFILE
        );

        const providersToPrime = new Set<string>([
          settings?.activeProvider || 'ollama',
          resolveNonAgentSelection('chat', settings, DEFAULT_NON_AGENT_SELECTIONS.chat).provider,
          resolveNonAgentSelection('dino', settings, DEFAULT_NON_AGENT_SELECTIONS.dino).provider,
        ]);
        await Promise.all(Array.from(providersToPrime).map((provider) => fetchProviderModels(provider)));

        const nextMode =
          settings?.chatMode && ['agent', 'chat', 'dino'].includes(settings.chatMode)
            ? (settings.chatMode as ChatMode)
            : settings?.dinoBuddyMode
              ? 'dino'
              : 'agent';

        setChatMode(nextMode);
        await loadHistoryForMode(nextMode);
      } catch (error) {
        console.error('Failed to initialize chat state:', error);
      }
    };

    loadInitialChatState();
  }, []);

  useEffect(() => {
    const handleRuntimeInfo = (data: AIRuntimeSnapshot & { requestId?: string }) => {
      if (!data) {
        return;
      }

      setRuntimeStatus(data);
      if (chatMode === 'agent' && (data.displayModel || data.effectiveModel)) {
        setAgentSelectedModel(data.displayModel || data.effectiveModel || DEFAULT_AGENT_MODEL);
      }
    };

    window.agentAPI.onModelSelectionInfo(handleRuntimeInfo);
    return () => {
      window.agentAPI.removeModelSelectionInfo();
    };
  }, [chatMode]);

  /**
   * Resolve the model that Agent mode should request for the current runtime budget.
   * This must come from the Fast/Deep selectors, not the last runtime status snapshot.
   */
  const agentBudgetModel = useMemo(() => {
    if (dualModel.mode === 'instant') {
      return brainConfig.fastModel.model || agentSelectedModel;
    }
    if (dualModel.mode === 'deep') {
      return brainConfig.deepModel.model || agentSelectedModel;
    }
    // Standard mode keeps orchestration flexible while still honoring configured models.
    return brainConfig.deepModel.model || brainConfig.fastModel.model || agentSelectedModel;
  }, [agentSelectedModel, brainConfig.deepModel.model, brainConfig.fastModel.model, dualModel.mode]);

  const currentNonAgentSelection = isNonAgentMode(chatMode) ? nonAgentSelections[chatMode] : null;
  const currentNonAgentModelOptions = useMemo(
    () => getResolvedModelOptions(currentNonAgentSelection?.provider || DEFAULT_NON_AGENT_SELECTIONS.chat.provider),
    [availableProviderModels, currentNonAgentSelection?.provider]
  );
  const currentProviderModelCatalogNotice = currentNonAgentSelection
    ? providerModelCatalogNotices[currentNonAgentSelection.provider] || null
    : null;

  useEffect(() => {
    const providers = new Set<string>([
      nonAgentSelections.chat.provider,
      nonAgentSelections.dino.provider,
    ]);

    void Promise.all(Array.from(providers).map((provider) => fetchProviderModels(provider)));
  }, [nonAgentSelections.chat.provider, nonAgentSelections.dino.provider]);

  useEffect(() => {
    (['chat', 'dino'] as NonAgentMode[]).forEach((mode) => {
      const selection = nonAgentSelections[mode];
      const options = getResolvedModelOptions(selection.provider);
      if (options.length > 0 && !options.some((option) => option.value === selection.model)) {
        const nextSelection = { provider: selection.provider, model: options[0].value };
        setNonAgentSelections((prev) => ({ ...prev, [mode]: nextSelection }));
        void persistNonAgentSelection(mode, nextSelection);
      }
    });
  }, [availableProviderModels]);

  const statusBarModel = useMemo(() => {
    if (chatMode === 'agent') {
      return agentBudgetModel;
    }
    return currentNonAgentSelection?.model || runtimeStatus?.displayModel || dualModel.currentModel || DEFAULT_AGENT_MODEL;
  }, [agentBudgetModel, chatMode, currentNonAgentSelection?.model, dualModel.currentModel, runtimeStatus?.displayModel]);

  // Load specialized agents preference from settings
  useEffect(() => {
    const loadAgentPreferences = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        const nextUseSpecializedAgents =
          settings && typeof settings.useSpecializedAgents === 'boolean'
            ? settings.useSpecializedAgents
            : true;
        const nextAutonomyLevel = clampAgentAutonomyLevel(settings?.agentAutonomyLevel);
        const nextBehaviorProfile =
          settings?.assistantBehaviorProfile === 'vibecoder' ? 'vibecoder' : DEFAULT_ASSISTANT_BEHAVIOR_PROFILE;

        hydratedUseSpecializedAgentsRef.current = nextUseSpecializedAgents;
        hydratedAutonomyLevelRef.current = nextAutonomyLevel;

        setUseSpecializedAgents(nextUseSpecializedAgents);
        setAgentAutonomyLevel(nextAutonomyLevel);
        setAssistantBehaviorProfile(nextBehaviorProfile);
      } catch (error) {
        console.error('Failed to load specialized agents setting:', error);
      } finally {
        setAgentPrefsHydrated(true);
      }
    };
    loadAgentPreferences();
  }, []);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<Settings>;
      const nextProfile =
        customEvent.detail?.assistantBehaviorProfile === 'vibecoder'
          ? 'vibecoder'
          : DEFAULT_ASSISTANT_BEHAVIOR_PROFILE;
      setAssistantBehaviorProfile(nextProfile);
    };

    window.addEventListener('agentprime-settings-changed', handleSettingsChanged as EventListener);
    return () => {
      window.removeEventListener('agentprime-settings-changed', handleSettingsChanged as EventListener);
    };
  }, []);

  // Save specialized agents preference when changed
  useEffect(() => {
    if (!agentPrefsHydrated) {
      return;
    }
    if (hydratedUseSpecializedAgentsRef.current === useSpecializedAgents) {
      return;
    }

    const saveSpecializedAgents = async () => {
      try {
        hydratedUseSpecializedAgentsRef.current = useSpecializedAgents;
        await window.agentAPI.updateSettings({ useSpecializedAgents });
      } catch (error) {
        console.error('Failed to save specialized agents setting:', error);
      }
    };
    saveSpecializedAgents();
  }, [agentPrefsHydrated, useSpecializedAgents]);

  useEffect(() => {
    if (!agentPrefsHydrated) {
      return;
    }
    if (hydratedAutonomyLevelRef.current === agentAutonomyLevel) {
      return;
    }

    const saveAutonomyPreference = async () => {
      try {
        hydratedAutonomyLevelRef.current = agentAutonomyLevel;
        await window.agentAPI.updateSettings({ agentAutonomyLevel });
      } catch (error) {
        console.error('Failed to save agent autonomy level:', error);
      }
    };
    saveAutonomyPreference();
  }, [agentAutonomyLevel, agentPrefsHydrated]);

  // Real-time agent progress streaming
  useEffect(() => {
    const handleTaskStart = (data: { task: string }) => {
      if (!agentRunning) return;
      if (data?.task) {
        setCurrentTask(data.task);
      }
    };

    const handleStepComplete = (data: { type: string; title: string; success: boolean }) => {
      if (!agentRunning) return;
      const statusTag = data.success ? '[ok]' : '[warn]';
      const typeTags: Record<string, string> = {
        'write_file': '[write]', 'read_file': '[read]', 'run_command': '[cmd]',
        'list_dir': '[list]', 'patch_file': '[patch]', 'search': '[search]',
        'search_codebase': '[search]', 'str_replace': '[edit]',
      };
      const stepTag = typeTags[data.type] || statusTag;
      setMessages(prev => {
        // Find the "Working..." message and append progress
        const workingIdx = prev.findIndex(m => m.content.includes('Working on your request'));
        if (workingIdx >= 0) {
          const updated = [...prev];
          const current = updated[workingIdx].content;
          const progressLine = `\n${stepTag} ${data.title}`;
          // Avoid duplicates
          if (!current.includes(data.title)) {
            updated[workingIdx] = {
              ...updated[workingIdx],
              content: current + progressLine
            };
          }
          return updated;
        }
        return prev;
      });
    };

    const handleFileModified = (data: { path: string; action: string; oldContent?: string; newContent?: string }) => {
      if (!agentRunning) return;

      const existing = agentFileChangesRef.current.get(data.path);
      const normalizedAction: AgentFileChange['action'] =
        data.action === 'created' ? 'created' : data.action === 'deleted' ? 'deleted' : 'modified';

      agentFileChangesRef.current.set(data.path, {
        filePath: data.path,
        oldContent: existing ? existing.oldContent : (data.oldContent || ''),
        newContent: data.newContent ?? existing?.newContent ?? '',
        action: existing ? existing.action : normalizedAction,
        status: existing?.status ?? 'pending'
      });

      setMessages(prev => {
        const workingIdx = prev.findIndex(m => m.content.includes('Working on your request'));
        if (workingIdx >= 0) {
          const updated = [...prev];
          const current = updated[workingIdx].content;
          const fileName = data.path.split(/[/\\]/).pop() || data.path;
          const actionTag = normalizedAction === 'created' ? '[new]' : normalizedAction === 'deleted' ? '[deleted]' : '[updated]';
          const progressLine = `\n${actionTag} ${data.action}: \`${fileName}\``;
          if (!current.includes(`${data.action}: \`${fileName}\``)) {
            updated[workingIdx] = {
              ...updated[workingIdx],
              content: current + progressLine
            };
          }
          return updated;
        }
        return prev;
      });
    };

    // Attach listeners
    const removeTaskStart = window.agentAPI?.onAgentTaskStart?.(handleTaskStart);
    const removeStepComplete = window.agentAPI?.onAgentStepComplete?.(handleStepComplete);
    const removeFileModified = window.agentAPI?.onAgentFileModified?.(handleFileModified);

    return () => {
      if (typeof removeTaskStart === 'function') removeTaskStart();
      if (typeof removeStepComplete === 'function') removeStepComplete();
      if (typeof removeFileModified === 'function') removeFileModified();
    };
  }, [agentRunning]);

  // Initialize agent loop
  useEffect(() => {
    const initializeAgent = async () => {
      try {
        const workspaceResult = await window.agentAPI.getWorkspace();
        if (!workspaceResult) return;

        const treeResult = await window.agentAPI.readTree();
        if (workspaceResult && treeResult) {
          const openTabs = openFiles.map(f => ({
            path: f.file.path,
            language: f.file.name.split('.').pop() || 'text',
            isDirty: f.isDirty
          }));

          const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : undefined;
          const activeFileContext = activeFile ? {
            path: activeFile.file.path,
            content: activeFile.content,
            cursorLine: getCursorPosition?.()?.lineNumber || 1,
            cursorColumn: getCursorPosition?.()?.column || 1,
            selectedText: getSelectedText?.()
          } : undefined;

          promptBuilder.setContext({
            workspacePath: workspaceResult,
            openTabs,
            folderTree: treeResult,
            activeFile: activeFileContext
          });
        }
      } catch (error) {
        console.error('Failed to initialize agent:', error);
      }
    };

    initializeAgent();
  }, []);

  // Handle folder selection
  const handleOpenFolder = async () => {
    try {
      let folderPath: string | null = null;

      // Prefer parent App workspace opener so explorer/currentPath stays in sync.
      if (onOpenFolder) {
        await Promise.resolve(onOpenFolder());
        await updateContext();
        const workspaceResult = await window.agentAPI.getWorkspace();
        folderPath = typeof workspaceResult === 'string' && workspaceResult.length > 0
          ? workspaceResult
          : null;
      } else {
        folderPath = await openFolder();
      }

      if (folderPath) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Workspace opened: **${folderPath.split(/[/\\]/).pop()}**\n\nI can now access all files in this project. What would you like me to do?`,
          timestamp: new Date(),
          type: 'system'
        }]);
      }
    } catch (error) {
      console.error('Failed to open workspace folder:', error);
    }
  };

  const handleCreateFolderClick = () => {
    setCreateFolderDialogOpen(true);
  };

  const handleCreateFolder = async (folderName: string): Promise<string | null> => {
    try {
      if (!workspacePath) {
        throw new Error('Please select a workspace folder first');
      }

      // @ts-ignore
      const result = await window.agentAPI.createFolder(folderName);
      if (result.success && result.path) {
        const folderPath = result.path;
        
        // The backend already sets it as workspace, but let's make sure
        // @ts-ignore
        await window.agentAPI.setWorkspace(folderPath);
        
        // Update context with new workspace
        await updateContext();
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `New project folder created: **${folderName}**\n\nLocation: \`${folderPath}\`\n\nThis folder is now your workspace. All files will be created here.`,
          timestamp: new Date(),
          type: 'system'
        }]);
        
        return folderPath;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  };

  // Clear chat
  const handleClearChat = async () => {
    try {
      await window.agentAPI.clearHistory(chatMode);
    } catch (error) {
      console.error(`Failed to clear ${chatMode} chat history:`, error);
    }
    setMessages([welcomeForMode(chatMode)]);
    setLastError(null);
  };

  // Switch chat mode
  const handleModeSwitch = async (mode: ChatMode) => {
    if (mode === chatMode) return;
    setChatMode(mode);
    setLastError(null);
    try {
      await loadHistoryForMode(mode);
      await window.agentAPI.updateSettings({
        chatMode: mode,
        dinoBuddyMode: mode === 'dino'
      });
    } catch (e) {
      console.error('Failed to save chat mode:', e);
    }
  };

  const handleNonAgentProviderChange = async (mode: NonAgentMode, provider: string) => {
    const modelOptions = await fetchProviderModels(provider);
    const currentModel = nonAgentSelections[mode].model;
    const nextSelection = {
      provider,
      model: modelOptions.some((option) => option.value === currentModel)
        ? currentModel
        : modelOptions[0]?.value || DEFAULT_NON_AGENT_SELECTIONS[mode].model,
    };

    setNonAgentSelections((prev) => ({ ...prev, [mode]: nextSelection }));
    await persistNonAgentSelection(mode, nextSelection);
  };

  const handleNonAgentModelChange = async (mode: NonAgentMode, model: string) => {
    const nextSelection = {
      provider: nonAgentSelections[mode].provider,
      model,
    };

    setNonAgentSelections((prev) => ({ ...prev, [mode]: nextSelection }));
    await persistNonAgentSelection(mode, nextSelection);
  };

  // Send message — branches on chatMode
  const sendMessage = async () => {
    if (!input.trim() || isLoading || agentRunning) return;

    const deterministicScaffoldOnly = input.startsWith('__AGENTPRIME_REAL_REVIEW__');
    const currentInput = deterministicScaffoldOnly
      ? input.replace('__AGENTPRIME_REAL_REVIEW__', '').trim()
      : input;
    if (!currentInput.trim()) return;

    const userMessage: Message = { role: 'user', content: currentInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // ── Chat / Dino mode (no workspace needed, streaming) ──
    if (chatMode === 'chat' || chatMode === 'dino') {
      setIsLoading(true);
      const modeSelection = nonAgentSelections[chatMode];
      const providerOptions = getResolvedModelOptions(modeSelection.provider);
      const effectiveModeSelection =
        providerOptions.length > 0 && !providerOptions.some((option) => option.value === modeSelection.model)
          ? { provider: modeSelection.provider, model: providerOptions[0].value }
          : modeSelection;

      if (effectiveModeSelection.model !== modeSelection.model) {
        setNonAgentSelections((prev) => ({ ...prev, [chatMode]: effectiveModeSelection }));
        void persistNonAgentSelection(chatMode, effectiveModeSelection);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: chatMode === 'dino' ? '🦖 *thinking...*' : '*thinking...*',
        timestamp: new Date()
      }]);

      // Listen for streamed chunks
      let streamed = '';
      let streamAborted = false;
      const handleChunk = (data: any) => {
        if (data.chunk) {
          streamed += data.chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: streamed,
              timestamp: new Date()
            };
            return updated;
          });
        }
        // User-initiated cancellation: render as a calm "Stopped" pill,
        // not an error toast. The IPC handler emits aborted: true on the
        // final chunk when the request was cancelled by the user.
        if (data.done && data.aborted) {
          streamAborted = true;
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: streamed,
                aborted: true,
                timestamp: new Date()
              };
            }
            return updated;
          });
          setLastError(null);
          return;
        }
        if (data.done && data.error) {
          const errText = String(data.error);
          setLastError(classifyAIError(errText));
          setLastFailedInput(currentInput);
        }
      };
      window.agentAPI.onChatStream(handleChunk);

      try {
        const result = await window.agentAPI.chat(currentInput, {
          agent_mode: false,
          use_agent_loop: false,
          just_chat_mode: chatMode === 'chat',
          dino_buddy_mode: chatMode === 'dino',
          deterministic_scaffold_only: deterministicScaffoldOnly,
          provider: effectiveModeSelection.provider,
          model: effectiveModeSelection.model,
          dual_mode: runtimeBudgetToDualMode(dualModel.mode),
          runtime_budget: dualModel.mode
        });

        if (result.runtime) {
          setRuntimeStatus(result.runtime);
        }

        // User-initiated abort travels back as { success: true, aborted: true }.
        // Skip error classification entirely and let the streamed content + the
        // "Stopped" pill carry the UX.
        const wasAborted = streamAborted || (result as any)?.aborted === true;
        if (wasAborted) {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: streamed || last.content || '',
                aborted: true,
                timestamp: new Date()
              };
            }
            return updated;
          });
          setLastError(null);
        } else {
          // Streaming may have filled it; fall back to full response if nothing streamed
          if (!streamed && result.success) {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: result.response || '',
                timestamp: new Date()
              };
              return updated;
            });
          }

          if (!result.success && result.error) {
            const classified = classifyAIError(result.error);
            setLastError(classified);
            setLastFailedInput(currentInput);
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: classified.message,
                timestamp: new Date()
              };
              return updated;
            });
          } else {
            setLastError(null);
          }
        }
      } catch (error: any) {
        // Treat user-initiated cancellation as a clean stop, not an error.
        const raw = error?.message || 'Unknown error';
        const looksAborted = streamAborted || /aborted|cancell?ed/i.test(raw);
        if (looksAborted) {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: streamed || last.content || '',
                aborted: true,
                timestamp: new Date()
              };
            }
            return updated;
          });
          setLastError(null);
        } else {
          const classified = classifyAIError(raw);
          setLastError(classified);
          setLastFailedInput(currentInput);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: classified.message,
              timestamp: new Date()
            };
            return updated;
          });
        }
      } finally {
        window.agentAPI.removeChatStream();
        setIsLoading(false);
      }
      return;
    }

    // ── Agent mode (existing behaviour) ──
    if (!workspacePath) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Workspace required**\n\nAgent mode needs a workspace to operate. Click **Select Folder** above to choose your project directory.`,
        timestamp: new Date(),
        type: 'system'
      }]);
      return;
    }

    setAgentRunning(true);
    setIsLoading(true);
    setCurrentTask(currentInput);
    agentFileChangesRef.current.clear();

    // Agent file generation must honor Runtime Budget model selectors.
    // Pull directly from Fast/Deep model config, not last runtime snapshot.
    const agentModel = agentBudgetModel;

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Working on your request using **${agentModel}** with the **${dualModel.mode}** runtime budget, **${AUTONOMY_LABELS[agentAutonomyLevel]}** autonomy${assistantBehaviorProfile === 'vibecoder' ? ', and **VibeCoder** behavior' : ''}...`,
      timestamp: new Date()
    }]);

    try {
      const activeFilePath = activeFileIndex >= 0 ? openFiles[activeFileIndex]?.file.path : undefined;
      let terminalHistory: string[] = [];
      try {
        const terminalSnapshot = await window.agentAPI.terminalGetHistory?.(undefined, 12000);
        if (terminalSnapshot?.success && Array.isArray(terminalSnapshot.entries)) {
          terminalHistory = terminalSnapshot.entries
            .filter((entry: any) => typeof entry?.history === 'string' && entry.history.trim().length > 0)
            .map((entry: any) => `# ${entry.title} (${entry.id})\n${entry.history}`);
        }
      } catch (historyError) {
        console.warn('Failed to gather terminal history for agent context:', historyError);
      }

      // @ts-ignore
      const result = await window.agentAPI.chat(currentInput, {
        agent_mode: true,
        use_agent_loop: true,
        use_specialized_agents: useSpecializedAgents,
        deterministic_scaffold_only: deterministicScaffoldOnly,
        model: agentModel,
        dual_mode: runtimeBudgetToDualMode(dualModel.mode),
        runtime_budget: dualModel.mode,
        agent_autonomy: agentAutonomyLevel,
        repair_scope: pendingRepairScopeRef.current || undefined,
        dino_buddy_mode: false,
        file_path: activeFilePath,
        open_files: openFiles.map(file => file.file.path),
        terminal_history: terminalHistory
      });

      if (result.runtime) {
        setRuntimeStatus(result.runtime);
        setAgentSelectedModel(result.runtime.displayModel || result.runtime.effectiveModel || agentModel);
      }

      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('Working on your request'));
        const failMsg = result.error ? classifyAIError(result.error).message : 'Agent run failed';
        return [...filtered, {
          role: 'assistant',
          content: result.success ? (result.response || '') : failMsg,
          timestamp: new Date(),
          metadata: result.success ? normalizeMessageMetadata(result.responseMetadata) : undefined,
        }];
      });

      if (!result.success && result.error) {
        setLastError(classifyAIError(result.error));
        setLastFailedInput(currentInput);
      } else {
        setLastError(null);
      }

      if (result.success && onAgentChangesReady) {
        const resultChanges = Array.isArray(result.reviewChanges) ? result.reviewChanges : null;
        const rawChanges = resultChanges || Array.from(agentFileChangesRef.current.values());
        const hydratedChanges = await Promise.all(rawChanges.map(async (change) => {
          if (resultChanges || change.action === 'deleted' || (change.newContent && change.newContent.length > 0)) {
            return change;
          }

          try {
            const readResult = await window.agentAPI.readFile(change.filePath);
            if (typeof readResult?.content === 'string') {
              return { ...change, newContent: readResult.content };
            }
          } catch (readError) {
            console.warn(`Failed to hydrate change for ${change.filePath}:`, readError);
          }

          return change;
        }));

        const meaningfulChanges = hydratedChanges.filter((change) =>
          change.action === 'created' ||
          change.action === 'deleted' ||
          change.oldContent !== change.newContent
        );

        if (meaningfulChanges.length > 0) {
          onAgentChangesReady(
            meaningfulChanges,
            currentInput,
            result.reviewSessionId,
            result.reviewVerification,
            result.reviewPlan,
            result.reviewCheckpoint
          );
        }
      }

      if (brainConnected) {
        await recordOutcome(currentInput, result.success, agentModel, (result as any).stepsExecuted || 1);
      }
    } catch (error: any) {
      const raw = error?.message || 'Unknown error';
      const classified = classifyAIError(raw);
      setLastError(classified);
      setLastFailedInput(currentInput);

      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('Working on your request'));
        return [...filtered, {
          role: 'assistant',
          content: classified.message,
          timestamp: new Date(),
        }];
      });

      if (brainConnected) {
        await recordOutcome(currentInput, false, agentModel, 0);
      }
    } finally {
      pendingRepairScopeRef.current = null;
      setAgentRunning(false);
      setIsLoading(false);
    }
  };

  // Retry last failed message
  const handleRetry = async () => {
    if (!lastFailedInput) return;
    setIsRetrying(true);
    setLastError(null);
    setInput(lastFailedInput);
    setIsRetrying(false);
    // Re-trigger send by setting input; user can press Enter or we auto-send
    setTimeout(() => {
      setInput(lastFailedInput);
    }, 50);
  };

  // Stop agent
  const handleStop = async () => {
    try {
      await window.agentAPI.stopAgent?.();
    } catch (error) {
      console.error('Failed to stop agent:', error);
    }
    setAgentRunning(false);
    setIsLoading(false);
    // In chat/dino mode the in-flight assistant bubble will receive the
    // chat-stream { aborted: true } event and render a calm "Stopped" pill,
    // so don't tack on a redundant system message. Reserve that breadcrumb
    // for agent mode where there isn't a single bubble to attach the pill to.
    if (chatMode === 'agent') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Stop requested. Agent is shutting down...',
        timestamp: new Date(),
        type: 'system',
        aborted: true
      }]);
    }
  };

  const busy = agentRunning || isLoading || isRetrying;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: isVisible ? 'flex' : 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'chatOverlayIn 0.15s ease'
    }} onClick={() => {
      if (busy) return;
      onClose();
    }}>
      <div style={{
        background: 'var(--prime-bg)',
        border: '1px solid var(--prime-border)',
        borderRadius: '14px',
        width: '90%',
        maxWidth: '800px',
        height: '80%',
        maxHeight: '700px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        animation: 'chatModalIn 0.2s ease'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'var(--prime-surface)' }}>
          <ChatHeader
            chatMode={chatMode}
            pythonBrainStatus={pythonBrainStatus}
            assistantBehaviorProfile={assistantBehaviorProfile}
            onClose={onClose}
          />

          {/* Toolbar */}
          <div style={{
            padding: '8px 18px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderTop: '1px solid var(--prime-border)',
            borderBottom: '1px solid var(--prime-border)',
            flexWrap: 'wrap',
            background: 'var(--prime-bg)'
          }}>
            {/* ── Mode switcher ── */}
            <div style={{
              display: 'inline-flex',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              overflow: 'hidden',
              flexShrink: 0
            }}>
              {([
                { mode: 'agent' as ChatMode, label: 'Agent' },
                { mode: 'chat'  as ChatMode, label: 'Chat' },
                { mode: 'dino'  as ChatMode, label: '🦖 Dino' },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => handleModeSwitch(mode)}
                  disabled={isLoading || agentRunning}
                  style={{
                    padding: '5px 12px',
                    border: 'none',
                    background: chatMode === mode
                      ? mode === 'dino' ? 'rgba(245, 158, 11, 0.18)' : 'var(--prime-accent)'
                      : 'transparent',
                    color: chatMode === mode
                      ? mode === 'dino' ? 'var(--prime-amber)' : '#fff'
                      : 'var(--prime-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: isLoading || agentRunning ? 'not-allowed' : 'pointer',
                    transition: 'all 0.12s ease',
                    borderRight: mode !== 'dino' ? '1px solid var(--prime-border)' : 'none'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Agent-only controls */}
            {chatMode === 'agent' && (
              <>
                <WorkspaceSelector
                  workspacePath={workspacePath}
                  onOpenFolder={handleOpenFolder}
                  onCreateFolder={handleCreateFolderClick}
                />
                <BrainSelector
                  mode={dualModel.mode}
                  brainConfig={brainConfig}
                  onModeChange={setMode}
                  onConfigChange={saveBrainConfig}
                />
                <SpecializedAgentsToggle
                  enabled={useSpecializedAgents}
                  onChange={setUseSpecializedAgents}
                />
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--prime-border)',
                  background: 'var(--prime-surface)'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>Autonomy</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={agentAutonomyLevel}
                    onChange={(e) => setAgentAutonomyLevel(clampAgentAutonomyLevel(parseInt(e.target.value, 10)))}
                    disabled={isLoading || agentRunning}
                    style={{ width: '90px', accentColor: 'var(--prime-accent)', cursor: isLoading || agentRunning ? 'not-allowed' : 'pointer' }}
                    title={`Agent autonomy level ${agentAutonomyLevel}: ${AUTONOMY_LABELS[agentAutonomyLevel]}`}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--prime-text)', fontWeight: 700, minWidth: '70px', textAlign: 'right' }}>
                    {AUTONOMY_LABELS[agentAutonomyLevel]}
                  </span>
                </div>
              </>
            )}

            {isNonAgentMode(chatMode) && currentNonAgentSelection && (
              <>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--prime-border)',
                  background: 'var(--prime-surface)'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>Provider</span>
                  <select
                    value={currentNonAgentSelection.provider}
                    onChange={(e) => void handleNonAgentProviderChange(chatMode, e.target.value)}
                    disabled={isLoading || agentRunning}
                    style={{
                      background: 'transparent',
                      color: 'var(--prime-text)',
                      border: 'none',
                      outline: 'none',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: isLoading || agentRunning ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {getProviderLabel(option.value)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--prime-border)',
                  background: 'var(--prime-surface)',
                  maxWidth: '280px'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--prime-text-muted)' }}>Model</span>
                  <select
                    value={currentNonAgentSelection.model}
                    onChange={(e) => void handleNonAgentModelChange(chatMode, e.target.value)}
                    disabled={isLoading || agentRunning}
                    style={{
                      background: 'transparent',
                      color: 'var(--prime-text)',
                      border: 'none',
                      outline: 'none',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: isLoading || agentRunning ? 'not-allowed' : 'pointer',
                      minWidth: '160px',
                      maxWidth: '220px'
                    }}
                  >
                    {currentNonAgentModelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {currentProviderModelCatalogNotice && (
                  <div
                    title={currentProviderModelCatalogNotice.message}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: currentProviderModelCatalogNotice.kind === 'error'
                        ? '1px solid rgba(255, 123, 114, 0.4)'
                        : '1px solid rgba(245, 158, 11, 0.4)',
                      background: currentProviderModelCatalogNotice.kind === 'error'
                        ? 'rgba(255, 123, 114, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                      color: currentProviderModelCatalogNotice.kind === 'error' ? '#ff7b72' : '#fbbf24',
                      fontSize: '11px',
                      fontWeight: 600,
                      maxWidth: '320px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {currentProviderModelCatalogNotice.kind === 'error'
                      ? 'Live model lookup failed'
                      : 'Using fallback model list'}
                    : {currentProviderModelCatalogNotice.message}
                  </div>
                )}
              </>
            )}

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={handleClearChat}
                style={{
                  padding: '5px 9px', borderRadius: '6px',
                  border: '1px solid var(--prime-border)',
                  background: 'transparent',
                  color: 'var(--prime-text-muted)',
                  cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                  fontFamily: 'inherit'
                }}
              >
                Clear
              </button>
              {onOpenTemplates && chatMode === 'agent' && (
                <button
                  onClick={onOpenTemplates}
                  style={{
                    padding: '5px 9px', borderRadius: '6px',
                    border: '1px solid var(--prime-border)',
                    background: 'transparent',
                    color: 'var(--prime-text-muted)',
                    cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                    fontFamily: 'inherit'
                  }}
                >
                  Templates
                </button>
              )}
            </div>
          </div>

          <ChatRuntimeStatusBar
            currentModel={statusBarModel}
            chatMode={chatMode}
          />
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          isLoading={isLoading}
          agentRunning={agentRunning}
          onApplyCode={onApplyCode}
        />

        {/* Create Folder Dialog */}
        <CreateFolderDialog
          isOpen={createFolderDialogOpen}
          onClose={() => setCreateFolderDialogOpen(false)}
          onCreate={handleCreateFolder}
        />

        {/* Error Recovery */}
        {lastError && !isLoading && !agentRunning && (
          <div style={{ padding: '0 18px 8px' }}>
            <AIErrorRecovery
              error={lastError}
              onRetry={handleRetry}
              onDismiss={() => setLastError(null)}
              isRetrying={isRetrying}
            />
          </div>
        )}

        {/* Quick Prompts */}
        {!input.trim() && !isLoading && !agentRunning && messages.length <= 2 && (
          <QuickPrompts
            onSelect={setInput}
            prompts={chatMode === 'dino' ? DINO_QUICK_PROMPTS : chatMode === 'chat' ? CHAT_QUICK_PROMPTS : QUICK_PROMPTS}
          />
        )}

        {/* Input */}
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={sendMessage}
          onStop={handleStop}
          isLoading={isLoading}
          agentRunning={agentRunning}
          mode={dualModel.mode}
          chatMode={chatMode}
          workspacePath={workspacePath}
        />
      </div>
      
      {/* Agent Progress Tracker (agent mode only) */}
      {chatMode === 'agent' && (
        <AgentProgressTracker
          isRunning={agentRunning}
          currentTask={currentTask}
          onCancel={handleStop}
        />
      )}
    </div>
  );
};

export default AIChat;

