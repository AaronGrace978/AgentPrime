/**
 * AIChat - Refactored AI Chat Component
 * 
 * This component has been modularized from 1,632 lines to ~350 lines
 * by extracting types, constants, hooks, and sub-components.
 */

import React, { useState, useEffect } from 'react';
import { agentLoop, promptBuilder } from '../../agent';

// Types and constants
import { Message, AIChatProps, OpenFile } from './types';
import { WELCOME_MESSAGE } from './constants';

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
  CreateFolderDialog
} from './components';

// 🦖 DINO BUDDY: Agent Progress Tracker
import AgentProgressTracker from '../AgentProgressTracker';

const AIChat: React.FC<AIChatProps> = ({
  onClose,
  openFiles = [],
  activeFileIndex = -1,
  getSelectedText,
  getCursorPosition,
  onOpenFolder,
  onOpenTemplates,
  onApplyCode
}) => {
  // Messages state
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [dinoBuddyMode, setDinoBuddyMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [useSpecializedAgents, setUseSpecializedAgents] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  
  // 🦖 DINO BUDDY: Progress tracking state
  const [currentTask, setCurrentTask] = useState('');

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

  // Load Dino Buddy mode from settings
  useEffect(() => {
    const loadDinoMode = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        if (settings?.dinoBuddyMode) {
          setDinoBuddyMode(true);
        }
      } catch (error) {
        console.error('Failed to load dino mode:', error);
      }
    };
    loadDinoMode();
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
    const handleStepComplete = (data: { type: string; title: string; success: boolean }) => {
      if (!agentRunning) return;
      const statusTag = data.success ? '[ok]' : '[warn]';
      const typeTags: Record<string, string> = {
        'write_file': '[write]', 'read_file': '[read]', 'run_command': '[cmd]',
        'list_dir': '[list]', 'patch_file': '[patch]', 'search': '[search]',
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

    const handleFileModified = (data: { path: string; action: string }) => {
      if (!agentRunning) return;
      setMessages(prev => {
        const workingIdx = prev.findIndex(m => m.content.includes('Working on your request'));
        if (workingIdx >= 0) {
          const updated = [...prev];
          const current = updated[workingIdx].content;
          const fileName = data.path.split(/[/\\]/).pop() || data.path;
          const actionTag = data.action === 'created' ? '[new]' : '[updated]';
          const progressLine = `\n${actionTag} ${data.action}: \`${fileName}\``;
          if (!current.includes(fileName)) {
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
    window.agentAPI?.onAgentStepComplete?.(handleStepComplete);
    window.agentAPI?.onAgentFileModified?.(handleFileModified);

    return () => {
      window.agentAPI?.removeAgentListeners?.();
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

        // Set up agent callbacks
        agentLoop.setCallbacks({
          onError: (error) => {
            if (!error.includes('Iteration')) {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${error}`,
                timestamp: new Date()
              }]);
            }
            setAgentRunning(false);
          },
          onComplete: (message) => {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Done: ${message}`,
              timestamp: new Date()
            }]);
            setAgentRunning(false);
          }
        });
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
    setMessages([{
      role: 'assistant',
      content: 'Chat cleared. Ready for a fresh start.\n\n*What would you like to build?*',
      timestamp: new Date(),
      type: 'system'
    }]);
  };

  // Toggle Dino Buddy mode
  const handleDinoToggle = async () => {
    const newMode = !dinoBuddyMode;
    setDinoBuddyMode(newMode);
    try {
      await window.agentAPI.updateSettings({ dinoBuddyMode: newMode });
      if (newMode) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '**Dino Buddy Mode enabled.**\n\nFriendly conversational tone is now active for this chat.',
          timestamp: new Date(),
          type: 'system'
        }]);
      }
    } catch (e) {
      console.error('Failed to save Dino mode:', e);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || isLoading || agentRunning) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');

    // Check workspace
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
    setCurrentTask(currentInput); // 🦖 Track current task for progress tracker

    // Determine model
    let agentModel = selectedModel;
    if (dualModel.enabled) {
      if (dualModel.mode === 'fast' && brainConfig.fastModel.enabled) {
        agentModel = brainConfig.fastModel.model;
      } else if (dualModel.mode === 'deep' && brainConfig.deepModel.enabled) {
        agentModel = brainConfig.deepModel.model;
      } else if (dualModel.mode === 'auto') {
        // Try Python Brain routing
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

    // Show thinking indicator
    const modeLabel = dualModel.mode === 'fast' ? 'Fast' : dualModel.mode === 'deep' ? 'Deep' : 'Auto';
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Working on your request using **${agentModel}** (${modeLabel} mode)...`,
      timestamp: new Date()
    }]);

    try {
      // @ts-ignore
      const result = await window.agentAPI.chat(currentInput, {
        agent_mode: true,
        use_agent_loop: true,
        use_specialized_agents: useSpecializedAgents,
        model: agentModel,
        dual_mode: dualModel.mode,
        dino_buddy_mode: dinoBuddyMode
      });

      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('Working on your request'));
        return [...filtered, {
          role: 'assistant',
          content: result.success ? result.response : `Agent failed${result.error ? `: ${result.error}` : ''}`,
          timestamp: new Date()
        }];
      });

      // Record outcome
      if (brainConnected) {
        await recordOutcome(currentInput, result.success, agentModel, (result as any).stepsExecuted || 1);
      }
    } catch (error: any) {
      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('Working on your request'));
        return [...filtered, {
          role: 'assistant',
          content: `Agent error: ${error.message}`,
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

  // Stop agent
  const handleStop = () => {
    agentLoop.stopAgent();
    setAgentRunning(false);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Agent stopped',
      timestamp: new Date(),
      type: 'system'
    }]);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'chatOverlayIn 0.15s ease'
    }} onClick={onClose}>
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
            dinoBuddyMode={dinoBuddyMode}
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

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {dinoBuddyMode && (
                <button
                  onClick={handleDinoToggle}
                  title="Disable Dino Buddy Mode"
                  className="chat-toolbar-btn chat-toolbar-btn--active"
                  style={{
                    padding: '5px 9px', borderRadius: '6px',
                    border: '1px solid var(--prime-amber)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: 'var(--prime-amber)',
                    cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                    fontFamily: 'inherit'
                  }}
                >
                  Dino
                </button>
              )}
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
              {onOpenTemplates && (
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

        {/* Quick Prompts */}
        {!input.trim() && !isLoading && !agentRunning && messages.length <= 2 && (
          <QuickPrompts onSelect={setInput} />
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
          workspacePath={workspacePath}
        />
      </div>
      
      {/* 🦖 DINO BUDDY: Agent Progress Tracker */}
      <AgentProgressTracker
        isRunning={agentRunning}
        currentTask={currentTask}
        onCancel={handleStop}
      />
    </div>
  );
};

export default AIChat;

