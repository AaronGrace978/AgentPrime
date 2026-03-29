/**
 * AgentPrime - Preload Script
 * Exposes the lean core API surface to renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AgentAPI } from '../types/ipc';

const agentAPI: AgentAPI = {
  // Workspace and files
  openFolder: () => ipcRenderer.invoke('file:open-folder'),
  getWorkspace: () => ipcRenderer.invoke('file:get-workspace'),
  createFolder: (folderName: string) => ipcRenderer.invoke('file:create-folder', folderName),
  setWorkspace: (path: string) => ipcRenderer.invoke('file:set-workspace', path),
  launchProject: (projectPath: string) => ipcRenderer.invoke('file:launch-project', projectPath),
  readTree: (path?: string) => ipcRenderer.invoke('file:read-tree', path),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  saveFileDialog: (defaultPath?: string, suggestedExtension?: string) =>
    ipcRenderer.invoke('save-file-dialog', defaultPath, suggestedExtension),
  createItem: (path: string, isDir: boolean) => ipcRenderer.invoke('file:create', path, isDir),
  deleteItem: (path: string) => ipcRenderer.invoke('file:delete', path),
  setFolderFocus: (folderPath: string | null) => ipcRenderer.invoke('folder:set-focus', folderPath),
  getFolderFocus: () => ipcRenderer.invoke('folder:get-focus'),
  getFolderContext: (folderPath: string) => ipcRenderer.invoke('folder:get-context', folderPath),

  // AI chat and completions
  chat: (message: string, context: any) => ipcRenderer.invoke('chat', message, context),
  quickAction: (action: string, code: string, language?: string) =>
    ipcRenderer.invoke('quick-action', action, code, language),
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  getChatHistoryForSession: (sessionId: string) => ipcRenderer.invoke('get-chat-history-for-session', sessionId),
  getCurrentAgentSessionId: () => ipcRenderer.invoke('get-current-agent-session-id'),
  summarizeConversation: () => ipcRenderer.invoke('summarize-conversation'),

  requestCompletion: (context: any) => ipcRenderer.invoke('request-completion', context),
  prewarmCompletions: () => ipcRenderer.invoke('prewarm-completions'),
  getCurrentFilePath: () => ipcRenderer.invoke('get-current-file-path'),
  setActiveFilePath: (filePath: string | null) => ipcRenderer.send('file:active-changed', filePath),
  getSemanticContext: (query: any) => ipcRenderer.invoke('semantic-context', query),
  searchRelevantFiles: (query: string, topK?: number) => ipcRenderer.invoke('search:relevant-files', query, topK),
  trackEvent: (event: string, data: any) => ipcRenderer.invoke('track-event', event, data),

  // Streaming and command events
  onChatStream: (callback: (data: any) => void) => {
    ipcRenderer.on('chat-stream', (_event, data) => callback(data));
  },
  removeChatStream: () => ipcRenderer.removeAllListeners('chat-stream'),
  onCompletionPartial: (callback: (data: any) => void) => {
    ipcRenderer.on('completion-partial', (_event, data) => callback(data));
  },
  removeCompletionPartial: () => ipcRenderer.removeAllListeners('completion-partial'),
  onChatActionResult: (callback: (data: any) => void) => {
    ipcRenderer.on('chat-action-result', (_event, data) => callback(data));
  },
  removeChatActionResult: () => ipcRenderer.removeAllListeners('chat-action-result'),
  onCommandRequiresConfirmation: (callback: (data: any) => void) => {
    ipcRenderer.on('command-requires-confirmation', (_event, data) => callback(data));
  },
  removeCommandRequiresConfirmation: () => ipcRenderer.removeAllListeners('command-requires-confirmation'),
  onCommandError: (callback: (data: any) => void) => {
    ipcRenderer.on('command-error', (_event, data) => callback(data));
  },
  removeCommandError: () => ipcRenderer.removeAllListeners('command-error'),
  onModelSelectionInfo: (callback: (data: any) => void) => {
    ipcRenderer.on('model-selection-info', (_event, data) => callback(data));
  },
  removeModelSelectionInfo: () => ipcRenderer.removeAllListeners('model-selection-info'),

  // Agent progress events
  onAgentTaskStart: (callback: (data: { task: string }) => void) => {
    const listener = (_event: any, data: { task: string }) => callback(data);
    ipcRenderer.on('agent:task-start', listener);
    return () => ipcRenderer.removeListener('agent:task-start', listener);
  },
  onAgentStepComplete: (callback: (data: { type: string; title: string; success: boolean }) => void) => {
    const listener = (_event: any, data: { type: string; title: string; success: boolean }) => callback(data);
    ipcRenderer.on('agent:step-complete', listener);
    return () => ipcRenderer.removeListener('agent:step-complete', listener);
  },
  onAgentFileModified: (callback: (data: { path: string; action: string; oldContent?: string; newContent?: string }) => void) => {
    const listener = (_event: any, data: { path: string; action: string; oldContent?: string; newContent?: string }) => callback(data);
    ipcRenderer.on('agent:file-modified', listener);
    return () => ipcRenderer.removeListener('agent:file-modified', listener);
  },
  onAgentCritiqueComplete: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:critique-complete', listener);
    return () => ipcRenderer.removeListener('agent:critique-complete', listener);
  },
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent:task-start');
    ipcRenderer.removeAllListeners('agent:step-complete');
    ipcRenderer.removeAllListeners('agent:file-modified');
    ipcRenderer.removeAllListeners('agent:critique-complete');
  },

  // Generic listeners
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
  },
  removeListener: (channel: string) => ipcRenderer.removeAllListeners(channel),

  // Git
  gitStatus: () => ipcRenderer.invoke('git-status'),
  gitCommit: (message: string) => ipcRenderer.invoke('git-commit', message),
  gitCommand: (command: string) => ipcRenderer.invoke('git-command', command),
  gitDiff: (filePath?: string) => ipcRenderer.invoke('git-diff', filePath),
  gitStage: (filePath: string) => ipcRenderer.invoke('git-stage', filePath),
  gitUnstage: (filePath: string) => ipcRenderer.invoke('git-unstage', filePath),
  gitPush: (remote?: string, branch?: string) => ipcRenderer.invoke('git-push', remote, branch),
  gitPull: (remote?: string, branch?: string) => ipcRenderer.invoke('git-pull', remote, branch),
  gitBranches: () => ipcRenderer.invoke('git-branches'),
  gitCheckout: (branch: string) => ipcRenderer.invoke('git-checkout', branch),
  gitCreateBranch: (branch: string) => ipcRenderer.invoke('git-create-branch', branch),

  // Settings and providers
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),
  setTitleBarOverlay: (options: { color: string; symbolColor: string; height?: number }) =>
    ipcRenderer.invoke('set-title-bar-overlay', options),
  getProviders: () => ipcRenderer.invoke('get-providers'),
  getProviderModels: (providerName: string) => ipcRenderer.invoke('get-provider-models', providerName),
  testProvider: (providerName: string) => ipcRenderer.invoke('test-provider', providerName),
  setActiveProvider: (providerName: string, model: string) =>
    ipcRenderer.invoke('set-active-provider', providerName, model),
  configureProvider: (providerName: string, config: any) =>
    ipcRenderer.invoke('configure-provider', providerName, config),

  // Script and command execution
  runScript: (filePath: string) => ipcRenderer.invoke('script:run', filePath),
  killScript: (pid: number) => ipcRenderer.invoke('script:kill', pid),
  isRunnable: (filePath: string) => ipcRenderer.invoke('script:isRunnable', filePath),
  onScriptOutput: (callback: (data: any) => void) => {
    ipcRenderer.on('script:output', (_event, data) => callback(data));
  },
  removeScriptOutput: () => ipcRenderer.removeAllListeners('script:output'),
  onScriptExit: (callback: (data: any) => void) => {
    ipcRenderer.on('script:exit', (_event, data) => callback(data));
  },
  removeScriptExit: () => ipcRenderer.removeAllListeners('script:exit'),
  onScriptError: (callback: (data: any) => void) => {
    ipcRenderer.on('script:error', (_event, data) => callback(data));
  },
  removeScriptError: () => ipcRenderer.removeAllListeners('script:error'),
  runCommand: (command: string) => ipcRenderer.invoke('run-command', command),

  executeCommand: (command: string) => ipcRenderer.invoke('command:execute', command),
  executeCommandPlan: (plan: any) => ipcRenderer.invoke('command:execute-plan', plan),
  isFileOperationCommand: (message: string) => ipcRenderer.invoke('command:is-file-operation', message),
  getCommandUndoHistory: () => ipcRenderer.invoke('command:get-undo-history'),
  undoCommand: () => ipcRenderer.invoke('command:undo'),

  // Agent tooling
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  listFiles: (path: string) => ipcRenderer.invoke('agent:list-files', path),
  agentReadFile: (path: string) => ipcRenderer.invoke('agent:read-file', path),
  agentWriteFile: (path: string, content: string) => ipcRenderer.invoke('agent:write-file', path, content),
  agentRunCommand: (command: string, cwd?: string, timeout?: number) =>
    ipcRenderer.invoke('agent:run-command', command, cwd, timeout),
  agentSearchCodebase: (
    query: string,
    options?: { includePattern?: string; excludePattern?: string; maxResults?: number }
  ) => ipcRenderer.invoke('agent:search-codebase', query, options),
  applyDiff: (path: string, diff: string) => ipcRenderer.invoke('agent:apply-diff', path, diff),

  // Search and symbol navigation
  globalSearch: (query: string, options?: any) => ipcRenderer.invoke('global-search', query, options),
  findDefinition: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) =>
    ipcRenderer.invoke('find-definition', params),
  findReferences: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) =>
    ipcRenderer.invoke('find-references', params),

  // Templates
  getTemplates: () => ipcRenderer.invoke('template:list'),
  getTemplate: (templateId: string) => ipcRenderer.invoke('template:get', templateId),
  createFromTemplate: (templateId: string, targetDir: string, variables: any) =>
    ipcRenderer.invoke('template:create', templateId, targetDir, variables),
  selectDirectory: () => ipcRenderer.invoke('template:select-directory'),

  // Durable Chat Threads
  threadsList: () => ipcRenderer.invoke('threads:list'),
  threadsGet: (threadId: string) => ipcRenderer.invoke('threads:get', threadId),
  threadsCreate: (options?: any) => ipcRenderer.invoke('threads:create', options),
  threadsAddMessage: (threadId: string, message: any) => ipcRenderer.invoke('threads:addMessage', threadId, message),
  threadsDelete: (threadId: string) => ipcRenderer.invoke('threads:delete', threadId),
  threadsRename: (threadId: string, title: string) => ipcRenderer.invoke('threads:rename', threadId, title),

  // Terminal (full PTY)
  terminalCreate: (options?: any) => ipcRenderer.invoke('terminal:create', options),
  terminalInput: (data: { id: string; data: string }) => ipcRenderer.send('terminal:input', data),
  terminalResize: (data: { id: string; cols: number; rows: number }) => ipcRenderer.send('terminal:resize', data),
  terminalKill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
  terminalList: () => ipcRenderer.invoke('terminal:list'),
  terminalGetHistory: (id?: string, maxChars?: number) => ipcRenderer.invoke('terminal:get-history', id, maxChars),

  // Live Preview
  previewOpen: (url: string) => ipcRenderer.invoke('preview:open', url),
  previewClose: () => ipcRenderer.invoke('preview:close'),

  // Deploy
  deploy: (provider: string, options?: any) => ipcRenderer.invoke('deploy:run', provider, options),
  deployStatus: () => ipcRenderer.invoke('deploy:status'),

  // Project Memory
  getProjectMemory: () => ipcRenderer.invoke('project-memory:get'),
  updateProjectMemory: (key: string, value: any) => ipcRenderer.invoke('project-memory:update', key, value),
  recordDecision: (decision: { context: string; choice: string; reason?: string }) =>
    ipcRenderer.invoke('project-memory:record-decision', decision),

  // Misc
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Python brain integration (optional at runtime)
  brainAvailable: () => ipcRenderer.invoke('brain:available'),
  brainRoute: (message: string, context?: any) => ipcRenderer.invoke('brain:route', message, context),
  brainRecordOutcome: (message: string, success: boolean, model?: string, steps?: number) =>
    ipcRenderer.invoke('brain:record-outcome', message, success, model, steps),
  brainStats: () => ipcRenderer.invoke('brain:stats'),

  // Telemetry
  telemetry: {
    getStatus: () => ipcRenderer.invoke('telemetry:get-status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('telemetry:set-enabled', enabled),
    track: (eventType: string, data?: any) => ipcRenderer.invoke('telemetry:track', eventType, data),
    getStats: () => ipcRenderer.invoke('telemetry:get-stats'),
    clearData: () => ipcRenderer.invoke('telemetry:clear-data'),
    flush: () => ipcRenderer.invoke('telemetry:flush')
  }
};

contextBridge.exposeInMainWorld('agentAPI', agentAPI);

console.log('✅ AgentPrime lean API exposed to renderer');
