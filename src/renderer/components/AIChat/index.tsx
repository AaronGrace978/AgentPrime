/**
 * AIChat - Refactored AI Chat Component
 * 
 * This component has been modularized from 1,632 lines to ~350 lines
 * by extracting types, constants, hooks, and sub-components.
 */

import React, { useState, useEffect, useRef } from 'react';
import { promptBuilder } from '../../agent';

// Types and constants
import { Message, AIChatProps, ChatMode, AgentFileChange } from './types';
import {
  WELCOME_MESSAGE,
  CHAT_WELCOME_MESSAGE,
  DINO_WELCOME_MESSAGE,
  QUICK_PROMPTS,
  CHAT_QUICK_PROMPTS,
  DINO_QUICK_PROMPTS
} from './constants';

// Custom hooks
import { useDualModel, usePythonBrain, useWorkspace } from './hooks';

// Sub-components
import {
  ChatHeader,
  BrainSelector,
  MessageList,
  QuickPrompts,
  ChatInput,
  WorkspaceSelector,
  SpecializedAgentsToggle,
  CreateFolderDialog,
  AIErrorRecovery,
  classifyAIError
} from './components';
import type { AIError } from './components';

// 🦖 DINO BUDDY: Agent Progress Tracker
import AgentProgressTracker from '../AgentProgressTracker';

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
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [useSpecializedAgents, setUseSpecializedAgents] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [lastError, setLastError] = useState<AIError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastFailedInput, setLastFailedInput] = useState('');

  // Progress tracking state
  const [currentTask, setCurrentTask] = useState('');
  const agentFileChangesRef = useRef<Map<string, AgentFileChange>>(new Map());

  // Load active model from settings
  useEffect(() => {
    const loadActiveModel = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings?.activeModel) {
          setSelectedModel(settings.activeModel);
        }
      } catch (error) {
        console.error('Failed to load active model:', error);
      }
    };
    loadActiveModel();
  }, []);

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

  // Custom hooks
  const { dualModel, brainConfig, setMode, saveBrainConfig } = useDualModel();
  const { status: pythonBrainStatus, isConnected: brainConnected, routeMessage, recordOutcome } = usePythonBrain();
  const { workspacePath, openFolder, updateContext } = useWorkspace({
    openFiles,
    activeFileIndex,
    getSelectedText,
    getCursorPosition
  });

  // Load saved chat mode from settings
  useEffect(() => {
    const loadChatMode = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings?.chatMode && ['agent', 'chat', 'dino'].includes(settings.chatMode)) {
          setChatMode(settings.chatMode as ChatMode);
          setMessages([welcomeForMode(settings.chatMode as ChatMode)]);
        } else if (settings?.dinoBuddyMode) {
          setChatMode('dino');
          setMessages([welcomeForMode('dino')]);
        }
      } catch (error) {
        console.error('Failed to load chat mode:', error);
      }
    };
    loadChatMode();
  }, []);

  // Load specialized agents preference from settings
  useEffect(() => {
    const loadSpecializedAgents = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings?.useSpecializedAgents) {
          setUseSpecializedAgents(true);
        }
      } catch (error) {
        console.error('Failed to load specialized agents setting:', error);
      }
    };
    loadSpecializedAgents();
  }, []);

  // Save specialized agents preference when changed
  useEffect(() => {
    const saveSpecializedAgents = async () => {
      try {
        await window.agentAPI.updateSettings({ useSpecializedAgents });
      } catch (error) {
        console.error('Failed to save specialized agents setting:', error);
      }
    };
    // Only save if we've loaded settings first (avoid saving on initial mount)
    if (useSpecializedAgents !== undefined) {
      saveSpecializedAgents();
    }
  }, [useSpecializedAgents]);

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const result = await window.agentAPI.getChatHistory();
        if (result.success && result.history && result.history.length > 0) {
          const historyMessages: Message[] = result.history.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          setMessages(historyMessages);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };
    loadHistory();
  }, []);

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
        action: existing ? existing.action : normalizedAction
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
    const folderPath = await openFolder();
    if (folderPath) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Workspace opened: **${folderPath.split(/[/\\]/).pop()}**\n\nI can now access all files in this project. What would you like me to do?`,
        timestamp: new Date(),
        type: 'system'
      }]);
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
  const handleClearChat = () => {
    setMessages([welcomeForMode(chatMode)]);
    setLastError(null);
  };

  // Switch chat mode
  const handleModeSwitch = async (mode: ChatMode) => {
    if (mode === chatMode) return;
    setChatMode(mode);
    setMessages([welcomeForMode(mode)]);
    setLastError(null);
    try {
      await window.agentAPI.updateSettings({
        chatMode: mode,
        dinoBuddyMode: mode === 'dino'
      });
    } catch (e) {
      console.error('Failed to save chat mode:', e);
    }
  };

  // Send message — branches on chatMode
  const sendMessage = async () => {
    if (!input.trim() || isLoading || agentRunning) return;

    const userMessage: Message = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');

    // ── Chat / Dino mode (no workspace needed, streaming) ──
    if (chatMode === 'chat' || chatMode === 'dino') {
      setIsLoading(true);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: chatMode === 'dino' ? '🦖 *thinking...*' : '*thinking...*',
        timestamp: new Date()
      }]);

      // Listen for streamed chunks
      let streamed = '';
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
          model: selectedModel,
          dual_mode: dualModel.mode
        });

        // Streaming may have filled it; fall back to full response if nothing streamed
        if (!streamed && result.success) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: result.response,
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
      } catch (error: any) {
        const raw = error?.message || 'Unknown error';
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

    let agentModel = selectedModel;
    if (dualModel.enabled) {
      if (dualModel.mode === 'fast' && brainConfig.fastModel.enabled) {
        agentModel = brainConfig.fastModel.model;
      } else if (dualModel.mode === 'deep' && brainConfig.deepModel.enabled) {
        agentModel = brainConfig.deepModel.model;
      } else if (dualModel.mode === 'auto') {
        if (brainConnected) {
          const routing = await routeMessage(currentInput, {
            workspace: workspacePath,
            hasFile: openFiles.length > 0
          });
          if (routing?.model_tier === 'fast' && brainConfig.fastModel.enabled) {
            agentModel = brainConfig.fastModel.model;
          } else if (routing?.model_tier === 'deep' && brainConfig.deepModel.enabled) {
            agentModel = brainConfig.deepModel.model;
          }
        } else {
          agentModel = brainConfig.deepModel.enabled ? brainConfig.deepModel.model : brainConfig.fastModel.model;
        }
      }
    }

    const modeLabel = dualModel.mode === 'fast' ? 'Fast' : dualModel.mode === 'deep' ? 'Deep' : 'Auto';
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Working on your request using **${agentModel}** (${modeLabel} mode)...`,
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
        model: agentModel,
        dual_mode: dualModel.mode,
        dino_buddy_mode: false,
        file_path: activeFilePath,
        open_files: openFiles.map(file => file.file.path),
        terminal_history: terminalHistory
      });

      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('Working on your request'));
        const failMsg = result.error ? classifyAIError(result.error).message : 'Agent run failed';
        return [...filtered, {
          role: 'assistant',
          content: result.success ? result.response : failMsg,
          timestamp: new Date()
        }];
      });

      if (!result.success && result.error) {
        setLastError(classifyAIError(result.error));
        setLastFailedInput(currentInput);
      } else {
        setLastError(null);
      }

      if (result.success && onAgentChangesReady) {
        const rawChanges = Array.from(agentFileChangesRef.current.values());
        const hydratedChanges = await Promise.all(rawChanges.map(async (change) => {
          if (change.action !== 'deleted' && (!change.newContent || change.newContent.length === 0)) {
            try {
              const readResult = await window.agentAPI.readFile(change.filePath);
              if (typeof readResult?.content === 'string') {
                return { ...change, newContent: readResult.content };
              }
            } catch (readError) {
              console.warn(`Failed to hydrate change for ${change.filePath}:`, readError);
            }
          }
          return change;
        }));

        const meaningfulChanges = hydratedChanges.filter((change) =>
          change.action === 'created' ||
          change.action === 'deleted' ||
          change.oldContent !== change.newContent
        );

        if (meaningfulChanges.length > 0) {
          onAgentChangesReady(meaningfulChanges, currentInput);
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
          timestamp: new Date()
        }];
      });

      if (brainConnected) {
        await recordOutcome(currentInput, false, agentModel, 0);
      }
    } finally {
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
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Stop requested. Agent is shutting down...',
      timestamp: new Date(),
      type: 'system'
    }]);
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

