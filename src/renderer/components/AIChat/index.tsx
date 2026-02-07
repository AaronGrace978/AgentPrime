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
  StatusBar,
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
      const icon = data.success ? '✅' : '⚠️';
      const typeIcons: Record<string, string> = {
        'write_file': '📝', 'read_file': '📖', 'run_command': '⚙️',
        'list_dir': '📂', 'patch_file': '🔧', 'search': '🔍',
      };
      const stepIcon = typeIcons[data.type] || icon;
      setMessages(prev => {
        // Find the "Working..." message and append progress
        const workingIdx = prev.findIndex(m => m.content.includes('Working on your request'));
        if (workingIdx >= 0) {
          const updated = [...prev];
          const current = updated[workingIdx].content;
          const progressLine = `\n${stepIcon} ${data.title}`;
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
          const actionIcon = data.action === 'created' ? '🆕' : '📝';
          const progressLine = `\n${actionIcon} ${data.action}: \`${fileName}\``;
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
                content: `❌ ${error}`,
                timestamp: new Date()
              }]);
            }
            setAgentRunning(false);
          },
          onComplete: (message) => {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✅ Done! ${message}`,
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
        content: `📂 Workspace opened: **${folderPath.split(/[/\\]/).pop()}**\n\nI can now access all files in this project. What would you like me to do?`,
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
          content: `📂 **New project folder created: ${folderName}**\n\nLocation: \`${folderPath}\`\n\n✅ This folder is now your workspace. All files will be created here. Ready to build!`,
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
      content: '🧹 Chat cleared! Ready for a fresh start.\n\n*What would you like to build?*',
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
          content: '🦖✨ **RAWR! DINO BUDDY MODE ACTIVATED!** 💖\n\nHey buddy! Your favorite explosive dinosaur companion is HERE! 🦕💫\n\nI\'m ready to vibe, create, and have the BEST time coding together! Let\'s make something AMAZING! 🔥✨',
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
        content: `📂 **Workspace Required**\n\nAgent mode needs a workspace to operate. Click the **📂 Select Folder** button above to choose your project directory.`,
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
    const brainEmoji = dualModel.mode === 'fast' ? '⚡' : dualModel.mode === 'deep' ? '🧠' : '🔀';
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `🤖 ${brainEmoji} Working on your request using **${agentModel}**...`,
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
          content: result.success ? result.response : `❌ Agent failed${result.error ? `: ${result.error}` : ''}`,
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
          content: `❌ Agent error: ${error.message}`,
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
      content: '🛑 Agent stopped',
      timestamp: new Date(),
      type: 'system'
    }]);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: 'var(--prime-surface)',
        border: '1px solid var(--prime-border)',
        borderRadius: '20px',
        width: '90%',
        maxWidth: '850px',
        height: '80%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--prime-shadow-xl)',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          borderBottom: '1px solid var(--prime-border)',
          background: `linear-gradient(180deg, var(--prime-bg) 0%, var(--prime-surface) 100%)`
        }}>
          <ChatHeader
            dinoBuddyMode={dinoBuddyMode}
            pythonBrainStatus={pythonBrainStatus}
            onClose={onClose}
          />

          {/* Command Bar */}
          <div style={{
            padding: '12px 20px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <WorkspaceSelector
              workspacePath={workspacePath}
              onOpenFolder={handleOpenFolder}
              onCreateFolder={handleCreateFolderClick}
            />

            <div style={{ width: '1px', height: '28px', background: 'var(--prime-border)' }} />

            <BrainSelector
              mode={dualModel.mode}
              brainConfig={brainConfig}
              onModeChange={setMode}
              onConfigChange={saveBrainConfig}
            />

            <div style={{ width: '1px', height: '28px', background: 'var(--prime-border)' }} />

            <SpecializedAgentsToggle
              enabled={useSpecializedAgents}
              onChange={setUseSpecializedAgents}
            />

            <div style={{ width: '1px', height: '28px', background: 'var(--prime-border)' }} />

            {/* Agent Mode Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid var(--prime-accent)',
              background: 'var(--prime-accent-light)',
              color: 'var(--prime-accent)',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              🤖 Agent Mode
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--prime-success)',
                border: '1px solid var(--prime-green)'
              }} />
            </div>

            <div style={{ flex: 1 }} />

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleDinoToggle}
                title={dinoBuddyMode ? 'Disable Dino Buddy Mode' : 'Enable Dino Buddy Mode 🦖'}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: dinoBuddyMode ? `2px solid var(--prime-amber)` : '1px solid var(--prime-border)',
                  background: dinoBuddyMode ? 'var(--prime-accent-light)' : 'var(--prime-surface)',
                  color: dinoBuddyMode ? 'var(--prime-amber)' : 'var(--prime-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                🦖 {dinoBuddyMode ? 'Dino ON!' : 'Dino'}
              </button>
              
              <button
                onClick={handleClearChat}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--prime-border)',
                  background: 'var(--prime-surface)',
                  color: 'var(--prime-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                🧹 Clear
              </button>
              
              {onOpenTemplates && (
                <button
                  onClick={onOpenTemplates}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--prime-border)',
                    background: 'var(--prime-surface)',
                    color: 'var(--prime-text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                >
                  📋 Templates
                </button>
              )}
            </div>
          </div>

          <StatusBar
            currentModel={dualModel.currentModel}
            complexity={dualModel.lastComplexity}
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

