/**
 * AgentPrime - Preload Script
 * Safely exposes APIs to renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AgentAPI } from '../types/ipc';

const agentAPI: AgentAPI = {
  // Folder operations
  openFolder: () => ipcRenderer.invoke('file:open-folder'),
  getWorkspace: () => ipcRenderer.invoke('file:get-workspace'),
  createFolder: (folderName: string) => ipcRenderer.invoke('file:create-folder', folderName),
  setWorkspace: (path: string) => ipcRenderer.invoke('file:set-workspace', path),
  launchProject: (projectPath: string) => ipcRenderer.invoke('file:launch-project', projectPath),

  // File tree
  readTree: (path?: string) => ipcRenderer.invoke('file:read-tree', path),

  // File operations
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  saveFileDialog: (defaultPath?: string, suggestedExtension?: string) => ipcRenderer.invoke('save-file-dialog', defaultPath, suggestedExtension),
  createItem: (path: string, isDir: boolean) => ipcRenderer.invoke('file:create', path, isDir),
  deleteItem: (path: string) => ipcRenderer.invoke('file:delete', path),
  
  // AI
  chat: (message: string, context: any) => ipcRenderer.invoke('chat', message, context),
  quickAction: (action: string, code: string, language?: string) => ipcRenderer.invoke('quick-action', action, code, language),
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  getChatHistoryForSession: (sessionId: string) => ipcRenderer.invoke('get-chat-history-for-session', sessionId),
  getCurrentAgentSessionId: () => ipcRenderer.invoke('get-current-agent-session-id'),
  requestCompletion: (context: any) => ipcRenderer.invoke('request-completion', context),
  prewarmCompletions: () => ipcRenderer.invoke('prewarm-completions'),
  getCurrentFilePath: () => ipcRenderer.invoke('get-current-file-path'),
  setActiveFilePath: (filePath: string | null) => ipcRenderer.send('file:active-changed', filePath),
  trackEvent: (event: string, data: any) => ipcRenderer.invoke('track-event', event, data),
  
  // Streaming
  onChatStream: (callback: (data: any) => void) => {
    ipcRenderer.on('chat-stream', (event, data) => callback(data));
  },
  removeChatStream: () => {
    ipcRenderer.removeAllListeners('chat-stream');
  },
  onCompletionPartial: (callback: (data: any) => void) => {
    ipcRenderer.on('completion-partial', (event, data) => callback(data));
  },
  removeCompletionPartial: () => {
    ipcRenderer.removeAllListeners('completion-partial');
  },
  onChatActionResult: (callback: (data: any) => void) => {
    ipcRenderer.on('chat-action-result', (event, data) => callback(data));
  },
  removeChatActionResult: () => {
    ipcRenderer.removeAllListeners('chat-action-result');
  },
  onCommandRequiresConfirmation: (callback: (data: any) => void) => {
    ipcRenderer.on('command-requires-confirmation', (event, data) => callback(data));
  },
  removeCommandRequiresConfirmation: () => {
    ipcRenderer.removeAllListeners('command-requires-confirmation');
  },
  onCommandError: (callback: (data: any) => void) => {
    ipcRenderer.on('command-error', (event, data) => callback(data));
  },
  removeCommandError: () => {
    ipcRenderer.removeAllListeners('command-error');
  },

  // Model selection info
  onModelSelectionInfo: (callback: (data: { requestId: string; provider: string; model: string; reasoning: string; autoSelected: boolean }) => void) => {
    ipcRenderer.on('model-selection-info', (event, data) => callback(data));
  },
  removeModelSelectionInfo: () => {
    ipcRenderer.removeAllListeners('model-selection-info');
  },
  
  // 🦖 DINO BUDDY: Agent Progress Events
  onAgentTaskStart: (callback: (data: { task: string }) => void) => {
    ipcRenderer.on('agent:task-start', (event, data) => callback(data));
  },
  onAgentStepComplete: (callback: (data: { type: string; title: string; success: boolean }) => void) => {
    ipcRenderer.on('agent:step-complete', (event, data) => callback(data));
  },
  onAgentFileModified: (callback: (data: { path: string; action: string }) => void) => {
    ipcRenderer.on('agent:file-modified', (event, data) => callback(data));
  },
  onAgentCritiqueComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('agent:critique-complete', (event, data) => callback(data));
  },
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent:task-start');
    ipcRenderer.removeAllListeners('agent:step-complete');
    ipcRenderer.removeAllListeners('agent:file-modified');
    ipcRenderer.removeAllListeners('agent:critique-complete');
  },
  summarizeConversation: () => ipcRenderer.invoke('summarize-conversation'),
  
  // Event listeners (generic)
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
  },
  removeListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Terminal
  runCommand: (command: string) => ipcRenderer.invoke('run-command', command),

  // Search
  globalSearch: (query: string, options?: any) => ipcRenderer.invoke('global-search', query, options),

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

  // VibeHub Integration (Human-friendly version control) - Enhanced Version
  vibeHub: {
    // Initialization & Configuration
    init: (workspacePath: string, config?: any) => ipcRenderer.invoke('vibehub:init', workspacePath, config),
    getConfig: () => ipcRenderer.invoke('vibehub:get-config'),
    updateConfig: (updates: any) => ipcRenderer.invoke('vibehub:update-config', updates),
    
    // Project Status
    getStatus: () => ipcRenderer.invoke('vibehub:get-status'),
    isGitAvailable: () => ipcRenderer.invoke('vibehub:git-available') as Promise<boolean>,
    
    // Checkpoints (Commits)
    getCheckpoints: (limit?: number) => ipcRenderer.invoke('vibehub:get-checkpoints', limit),
    getCheckpoint: (checkpointId: string) => ipcRenderer.invoke('vibehub:get-checkpoint', checkpointId),
    generateMessage: (changedFiles?: string[]) => ipcRenderer.invoke('vibehub:generate-message', changedFiles),
    createCheckpoint: (message: string, stageAll?: boolean) => ipcRenderer.invoke('vibehub:create-checkpoint', message, stageAll),
    revertToCheckpoint: (checkpointId: string, mode?: 'soft' | 'mixed' | 'hard') => 
      ipcRenderer.invoke('vibehub:revert-to-checkpoint', checkpointId, mode) as Promise<{ success: boolean; error?: string }>,
    undoCheckpoint: (keepChanges?: boolean) => 
      ipcRenderer.invoke('vibehub:undo-checkpoint', keepChanges) as Promise<{ success: boolean; error?: string }>,
    amendCheckpoint: (newMessage?: string) => 
      ipcRenderer.invoke('vibehub:amend-checkpoint', newMessage) as Promise<{ success: boolean; error?: string }>,
    getCheckpointDiff: (fromId: string, toId: string) => 
      ipcRenderer.invoke('vibehub:get-checkpoint-diff', fromId, toId) as Promise<string>,
    
    // Versions (Branches)
    getVersions: () => ipcRenderer.invoke('vibehub:get-versions'),
    switchVersion: (name: string) => ipcRenderer.invoke('vibehub:switch-version', name),
    createVersion: (name: string, checkout?: boolean) => ipcRenderer.invoke('vibehub:create-version', name, checkout),
    deleteVersion: (name: string, force?: boolean) => 
      ipcRenderer.invoke('vibehub:delete-version', name, force) as Promise<{ success: boolean; error?: string }>,
    mergeVersion: (name: string) => 
      ipcRenderer.invoke('vibehub:merge-version', name) as Promise<{ success: boolean; error?: string; hasConflicts?: boolean }>,
    
    // File Changes & Diffs
    getChanges: () => ipcRenderer.invoke('vibehub:get-changes'),
    getFileDiff: (filePath: string, staged?: boolean) => 
      ipcRenderer.invoke('vibehub:get-file-diff', filePath, staged) as Promise<{
        file: string;
        status: 'added' | 'modified' | 'deleted' | 'renamed';
        staged: boolean;
        additions: number;
        deletions: number;
        diff: string;
      } | null>,
    getAllDiffs: () => ipcRenderer.invoke('vibehub:get-all-diffs'),
    
    // Staging
    stageFiles: (files: string[]) => ipcRenderer.invoke('vibehub:stage-files', files),
    unstageFiles: (files: string[]) => ipcRenderer.invoke('vibehub:unstage-files', files),
    discardChanges: (files: string[]) => 
      ipcRenderer.invoke('vibehub:discard-changes', files) as Promise<{ success: boolean; error?: string }>,
    
    // Remote Operations
    getRemotes: () => ipcRenderer.invoke('vibehub:get-remotes') as Promise<Array<{ name: string; fetchUrl: string; pushUrl: string }>>,
    addRemote: (name: string, url: string) => 
      ipcRenderer.invoke('vibehub:add-remote', name, url) as Promise<{ success: boolean; error?: string }>,
    removeRemote: (name: string) => 
      ipcRenderer.invoke('vibehub:remove-remote', name) as Promise<{ success: boolean; error?: string }>,
    push: (remote?: string, branch?: string, setUpstream?: boolean) => 
      ipcRenderer.invoke('vibehub:push', remote, branch, setUpstream) as Promise<{ success: boolean; error?: string }>,
    pull: (remote?: string, branch?: string) => 
      ipcRenderer.invoke('vibehub:pull', remote, branch) as Promise<{ success: boolean; error?: string; hasConflicts?: boolean }>,
    fetch: (remote?: string, prune?: boolean) => 
      ipcRenderer.invoke('vibehub:fetch', remote, prune) as Promise<{ success: boolean; error?: string }>,
    
    // Stash
    getStashes: () => ipcRenderer.invoke('vibehub:get-stashes') as Promise<Array<{ id: number; message: string; branch: string; timestamp: number }>>,
    stash: (message?: string, includeUntracked?: boolean) => 
      ipcRenderer.invoke('vibehub:stash', message, includeUntracked) as Promise<{ success: boolean; error?: string }>,
    applyStash: (index?: number, drop?: boolean) => 
      ipcRenderer.invoke('vibehub:apply-stash', index, drop) as Promise<{ success: boolean; error?: string }>,
    dropStash: (index: number) => 
      ipcRenderer.invoke('vibehub:drop-stash', index) as Promise<{ success: boolean; error?: string }>,
    
    // VibeHub App
    launch: () => ipcRenderer.invoke('vibehub:launch') as Promise<{ success: boolean; method?: string; error?: string }>,
    isAvailable: () => ipcRenderer.invoke('vibehub:is-available') as Promise<boolean>,
    
    // Project Initialization
    initProject: (initialCommit?: boolean) => ipcRenderer.invoke('vibehub:init-project', initialCommit),
    
    // Project Running
    detectProject: () => ipcRenderer.invoke('vibehub:detect-project'),
    runProject: () => ipcRenderer.invoke('vibehub:run-project') as Promise<{ 
      success: boolean; 
      message: string; 
      projectType?: string; 
      port?: number; 
      url?: string; 
      pid?: number 
    }>,
    stopProject: () => ipcRenderer.invoke('vibehub:stop-project') as Promise<{ success: boolean; message: string }>,
    isProjectRunning: () => ipcRenderer.invoke('vibehub:is-running') as Promise<boolean>,
    getRunningInfo: () => ipcRenderer.invoke('vibehub:get-running-info') as Promise<{ 
      pid: number; 
      startTime: number; 
      type: string; 
      port?: number; 
      command: string;
      logs: string[];
    } | null>,
    getLogs: () => ipcRenderer.invoke('vibehub:get-logs') as Promise<string[]>,
    clearLogs: () => ipcRenderer.invoke('vibehub:clear-logs'),
    openInBrowser: () => ipcRenderer.invoke('vibehub:open-in-browser') as Promise<{ success: boolean; message: string }>,
    
    // Event Listeners (for real-time updates)
    onFileChanged: (callback: (data: { type: string; file: string }) => void) => {
      ipcRenderer.on('vibehub:file-changed', (event, data) => callback(data));
    },
    onProjectOutput: (callback: (data: { type: 'stdout' | 'stderr'; text: string }) => void) => {
      ipcRenderer.on('vibehub:project-output', (event, data) => callback(data));
    },
    onProjectExit: (callback: (data: { code: number }) => void) => {
      ipcRenderer.on('vibehub:project-exit', (event, data) => callback(data));
    },
    removeVibeHubListeners: () => {
      ipcRenderer.removeAllListeners('vibehub:file-changed');
      ipcRenderer.removeAllListeners('vibehub:project-output');
      ipcRenderer.removeAllListeners('vibehub:project-exit');
    },
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),

  // AI Provider Management
  getProviders: () => ipcRenderer.invoke('get-providers'),
  getProviderModels: (providerName: string) => ipcRenderer.invoke('get-provider-models', providerName),
  testProvider: (providerName: string) => ipcRenderer.invoke('test-provider', providerName),
  setActiveProvider: (providerName: string, model: string) => ipcRenderer.invoke('set-active-provider', providerName, model),
  configureProvider: (providerName: string, config: any) => ipcRenderer.invoke('configure-provider', providerName, config),

  // Linting
  runLint: (filePath: string, content: string) => ipcRenderer.invoke('run-lint', filePath, content),

  // Agent Mode (autonomous) - Enhanced with diff preview
  agentMode: (task: string, autoApprove: boolean = false) => ipcRenderer.invoke('agent-mode', task, autoApprove),
  agentApproveAction: (actionId: string) => ipcRenderer.invoke('agent-approve-action', actionId),
  agentRejectAction: (actionId: string) => ipcRenderer.invoke('agent-reject-action', actionId),
  agentApproveAll: () => ipcRenderer.invoke('agent-approve-all'),
  agentRejectAll: () => ipcRenderer.invoke('agent-reject-all'),
  agentRollback: (actionId: string) => ipcRenderer.invoke('agent-rollback', actionId),
  agentRollbackAll: () => ipcRenderer.invoke('agent-rollback-all'),
  agentGetState: () => ipcRenderer.invoke('agent-get-state'),
  agentGetDiff: (actionId: string) => ipcRenderer.invoke('agent-get-diff', actionId),
  onAgentEvent: (callback: (data: any) => void) => {
    ipcRenderer.on('agent-event', (event, data) => callback(data));
  },
  removeAgentEvent: () => {
    ipcRenderer.removeAllListeners('agent-event');
  },

  // Agent Tools - For renderer agent loop
  listFiles: (path: string) => ipcRenderer.invoke('agent:list-files', path),
  agentReadFile: (path: string) => ipcRenderer.invoke('agent:read-file', path),
  agentWriteFile: (path: string, content: string) => ipcRenderer.invoke('agent:write-file', path, content),
  agentRunCommand: (command: string, cwd?: string, timeout?: number) => 
    ipcRenderer.invoke('agent:run-command', command, cwd, timeout),
  agentSearchCodebase: (query: string, options?: { includePattern?: string; excludePattern?: string; maxResults?: number }) => 
    ipcRenderer.invoke('agent:search-codebase', query, options),
  applyDiff: (path: string, diff: string) => ipcRenderer.invoke('agent:apply-diff', path, diff),
  
  // Workspace creation (legacy)
  createWorkspace: (projectName: string, baseDir: string) => ipcRenderer.invoke('create-workspace', projectName, baseDir),
  
  // Template System - FIXED channel names to match handlers
  getTemplates: () => ipcRenderer.invoke('template:list'),
  getTemplate: (templateId: string) => ipcRenderer.invoke('template:get', templateId),
  createFromTemplate: (templateId: string, targetDir: string, variables: any) => ipcRenderer.invoke('template:create', templateId, targetDir, variables),
  selectDirectory: () => ipcRenderer.invoke('template:select-directory'),
  
  // Codebase Indexer
  indexWorkspace: () => ipcRenderer.invoke('index-workspace'),
  getIndexStats: () => ipcRenderer.invoke('get-index-stats'),
  searchSymbols: (query: string, limit?: number) => ipcRenderer.invoke('search-symbols', query, limit),
  searchFiles: (query: string, limit?: number) => ipcRenderer.invoke('search-files', query, limit),
  getFileSymbols: (filePath: string) => ipcRenderer.invoke('get-file-symbols', filePath),
  getRelatedFiles: (filePath: string, depth?: number) => ipcRenderer.invoke('get-related-files', filePath, depth),
  getAIContext: (filePath: string) => ipcRenderer.invoke('get-ai-context', filePath),
  updateFileIndex: (filePath: string) => ipcRenderer.invoke('update-file-index', filePath),
  getMentionSuggestions: (query: string, type?: 'all' | 'file' | 'symbol') => ipcRenderer.invoke('get-mention-suggestions', query, type),

  // Folder Focus
  setFolderFocus: (folderPath: string | null) => ipcRenderer.invoke('folder:set-focus', folderPath),
  getFolderFocus: () => ipcRenderer.invoke('folder:get-focus'),
  getFolderContext: (folderPath: string) => ipcRenderer.invoke('folder:get-context', folderPath),
  
  // Mirror Intelligence System
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  mirrorGetStatus: () => ipcRenderer.invoke('mirror:get-status'),
  mirrorToggleLearning: (enabled: boolean) => ipcRenderer.invoke('mirror-toggle-learning', enabled),
  mirrorGetMetrics: () => ipcRenderer.invoke('mirror:get-metrics'),
  mirrorGetPatterns: (category?: string | null, limit?: number) => ipcRenderer.invoke('mirror:get-patterns', category, limit),
  mirrorIngestUrl: (url: string, options?: any) => ipcRenderer.invoke('mirror:ingest-url', url, options),
  mirrorIngestContent: (content: string, metadata?: any) => ipcRenderer.invoke('mirror:ingest-content', content, metadata),
  mirrorGetIngestionHistory: (limit?: number) => ipcRenderer.invoke('mirror-get-ingestion-history', limit),
  
  // Opus Training Integration
  mirrorIngestOpus: () => ipcRenderer.invoke('mirror:ingest-opus'),
  mirrorAutoInit: () => ipcRenderer.invoke('mirror:auto-init'),
  mirrorGetOpusCorpus: () => ipcRenderer.invoke('mirror:get-opus-corpus'),
  mirrorGetCriticalPatterns: () => ipcRenderer.invoke('mirror:get-critical-patterns'),
  mirrorLearnFromCode: (code: string, context?: any) => ipcRenderer.invoke('mirror:learn-from-code', code, context),
  mirrorClearAntiPatterns: () => ipcRenderer.invoke('mirror:clear-antipatterns'),
  onMirrorPatternLearned: (callback: (data: { pattern: string; category: string; intelligence: number }) => void) => {
    ipcRenderer.on('mirror:pattern-learned', (event, data) => callback(data));
  },
  removeMirrorPatternLearned: () => {
    ipcRenderer.removeAllListeners('mirror:pattern-learned');
  },

  // Python Brain API (Orchestrator + Memory + Analysis)
  brainAvailable: () => ipcRenderer.invoke('brain:available'),
  brainRoute: (message: string, context?: any) => ipcRenderer.invoke('brain:route', message, context),
  brainRecordOutcome: (message: string, success: boolean, model?: string, steps?: number) => 
    ipcRenderer.invoke('brain:record-outcome', message, success, model, steps),
  brainMemoryStore: (type: string, content: string, metadata?: any) => 
    ipcRenderer.invoke('brain:memory-store', type, content, metadata),
  brainMemorySearch: (query: string, type?: string, limit?: number) => 
    ipcRenderer.invoke('brain:memory-search', query, type, limit || 10),
  brainMemoryByType: (type: string, limit?: number) => 
    ipcRenderer.invoke('brain:memory-by-type', type, limit || 50),
  brainSaveConversation: (sessionId: string, role: string, content: string, model?: string, tokens?: number) =>
    ipcRenderer.invoke('brain:save-conversation', sessionId, role, content, model, tokens),
  brainGetConversation: (sessionId: string, limit?: number) =>
    ipcRenderer.invoke('brain:get-conversation', sessionId, limit || 50),
  brainGetSessions: (limit?: number) => ipcRenderer.invoke('brain:get-sessions', limit || 10),
  brainAnalyze: (workspacePath: string, background?: boolean) =>
    ipcRenderer.invoke('brain:analyze', workspacePath, background !== false),
  brainAnalyzeStatus: () => ipcRenderer.invoke('brain:analyze-status'),
  brainGetPatterns: (language?: string, limit?: number) =>
    ipcRenderer.invoke('brain:get-patterns', language, limit || 20),
  brainGetStyle: () => ipcRenderer.invoke('brain:get-style'),
  brainSetPreference: (key: string, value: any) => ipcRenderer.invoke('brain:set-preference', key, value),
  brainGetPreference: (key: string, defaultValue?: any) => ipcRenderer.invoke('brain:get-preference', key, defaultValue),
  brainGetAllPreferences: () => ipcRenderer.invoke('brain:get-all-preferences'),
  brainStats: () => ipcRenderer.invoke('brain:stats'),

  // Asset Generation (procedural models, dungeons, textures)
  assetsGetLibraries: () => ipcRenderer.invoke('assets:get-libraries'),
  assetsGetDiablo2Styles: () => ipcRenderer.invoke('assets:get-diablo2-styles'),
  assetsGenerateModel: (modelType: string, options?: any) => ipcRenderer.invoke('assets:generate-model', modelType, options),
  assetsGenerateDungeon: (width: number, height: number, options?: any) => ipcRenderer.invoke('assets:generate-dungeon', width, height, options),
  assetsGenerateTexture: (width: number, height: number, color: string, pattern?: string) => ipcRenderer.invoke('assets:generate-texture', width, height, color, pattern || 'solid'),
  assetsDownload: (url: string, targetPath: string, filename: string) => ipcRenderer.invoke('assets:download', url, targetPath, filename),
  assetsGetModelTypes: () => ipcRenderer.invoke('assets:get-model-types'),
  assetsGenerateEnemy: (enemyType: string, options?: any) => ipcRenderer.invoke('assets:generate-enemy', enemyType, options),

  // Script Execution
  runScript: (filePath: string) => ipcRenderer.invoke('script:run', filePath),
  killScript: (pid: number) => ipcRenderer.invoke('script:kill', pid),
  isRunnable: (filePath: string) => ipcRenderer.invoke('script:isRunnable', filePath),
  onScriptOutput: (callback: (data: any) => void) => {
    ipcRenderer.on('script:output', (event, data) => callback(data));
  },
  removeScriptOutput: () => {
    ipcRenderer.removeAllListeners('script:output');
  },
  onScriptExit: (callback: (data: any) => void) => {
    ipcRenderer.on('script:exit', (event, data) => callback(data));
  },
  removeScriptExit: () => {
    ipcRenderer.removeAllListeners('script:exit');
  },
  onScriptError: (callback: (data: any) => void) => {
    ipcRenderer.on('script:error', (event, data) => callback(data));
  },
  removeScriptError: () => {
    ipcRenderer.removeAllListeners('script:error');
  },

  // Command Execution
  executeCommand: (command: string) => ipcRenderer.invoke('command:execute', command),
  executeCommandPlan: (plan: any) => ipcRenderer.invoke('command:execute-plan', plan),
  isFileOperationCommand: (message: string) => ipcRenderer.invoke('command:is-file-operation', message),
  getCommandUndoHistory: () => ipcRenderer.invoke('command:get-undo-history'),
  undoCommand: () => ipcRenderer.invoke('command:undo'),

  // Code Analysis
  analyzeCode: (filePath: string, content: string) => ipcRenderer.invoke('analyze:eslint', filePath, content),
  examineCodebase: (options?: { maxFiles?: number; includeContent?: boolean }) => ipcRenderer.invoke('examine:codebase', options),

  // Voice Control
  processVoiceCommand: (speechText: string) => ipcRenderer.invoke('voice:process-command', speechText),

  // Semantic Search
  embedQuery: (query: string) => ipcRenderer.invoke('search:embed-query', query),
  searchRelevantFiles: (query: string, topK?: number) => ipcRenderer.invoke('search:relevant-files', query, topK),
  getSemanticContext: (query: any) => ipcRenderer.invoke('semantic-context', query),
  refactorCode: (request: any) => ipcRenderer.invoke('refactor-code', request),
  
  // Code Intelligence - Go to Definition & Find References
  findDefinition: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => 
    ipcRenderer.invoke('find-definition', params),
  findReferences: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => 
    ipcRenderer.invoke('find-references', params),
  extractFunction: (filePath: string, selection: any, functionName: string, workspacePath: string) => ipcRenderer.invoke('extract-function', filePath, selection, functionName, workspacePath),
  renameSymbol: (filePath: string, symbolName: string, newName: string, workspacePath: string) => ipcRenderer.invoke('rename-symbol', filePath, symbolName, newName, workspacePath),
  applyRefactoring: (changes: any[]) => ipcRenderer.invoke('apply-refactoring', changes),
  checkRefactoringSafety: (request: any, changes: any[]) => ipcRenderer.invoke('check-refactoring-safety', request, changes),
  getTeamPatterns: (teamId: string, filter?: any) => ipcRenderer.invoke('get-team-patterns', teamId, filter),
  sharePatternWithTeam: (teamId: string, patternId: string, visibility: string) => ipcRenderer.invoke('share-pattern-team', teamId, patternId, visibility),

  // Project Registry (remembers past projects)
  projectGetAll: () => ipcRenderer.invoke('project:get-all'),
  projectGetRecent: (limit?: number) => ipcRenderer.invoke('project:get-recent', limit),
  projectSearch: (query: string) => ipcRenderer.invoke('project:search', query),
  projectGetByPath: (projectPath: string) => ipcRenderer.invoke('project:get-by-path', projectPath),
  
  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onAutoUpdaterStatus: (callback: (data: any) => void) => {
    ipcRenderer.on('auto-updater-status', (event, data) => callback(data));
  },
  removeAutoUpdaterStatus: () => {
    ipcRenderer.removeAllListeners('auto-updater-status');
  },

  // Phase 2 - Collaboration
  collaboration: {
    createSession: (name: string, workspace: string) => ipcRenderer.invoke('collaboration:create-session', name, workspace),
    joinSession: (sessionId: string, username?: string) => ipcRenderer.invoke('collaboration:join-session', sessionId, username),
    leaveSession: (sessionId: string) => ipcRenderer.invoke('collaboration:leave-session', sessionId),
    getActiveSessions: () => ipcRenderer.invoke('collaboration:get-active-sessions'),
    getUserSessions: () => ipcRenderer.invoke('collaboration:get-user-sessions'),
    recordChange: (sessionId: string, change: any) => ipcRenderer.invoke('collaboration:record-change', sessionId, change),
    getPendingChanges: (sessionId: string) => ipcRenderer.invoke('collaboration:get-pending-changes', sessionId),
    applyChanges: (sessionId: string, filePath: string) => ipcRenderer.invoke('collaboration:apply-changes', sessionId, filePath),
    updatePresence: (sessionId: string, presence: any) => ipcRenderer.invoke('collaboration:update-presence', sessionId, presence),
    createWorkspace: (name: string, description?: string) => ipcRenderer.invoke('collaboration:create-workspace', name, description),
    getWorkspace: (workspaceId: string) => ipcRenderer.invoke('collaboration:get-workspace', workspaceId)
  },

  // Phase 2 - Plugins
  plugins: {
    loadPlugin: (pluginPath: string) => ipcRenderer.invoke('plugins:load-plugin', pluginPath),
    activatePlugin: (pluginId: string) => ipcRenderer.invoke('plugins:activate-plugin', pluginId),
    deactivatePlugin: (pluginId: string) => ipcRenderer.invoke('plugins:deactivate-plugin', pluginId),
    reloadPlugin: (pluginId: string) => ipcRenderer.invoke('plugins:reload-plugin', pluginId),
    getInstalledPlugins: () => ipcRenderer.invoke('plugins:get-installed-plugins'),
    getPluginContext: (pluginId: string) => ipcRenderer.invoke('plugins:get-plugin-context', pluginId),
    executeCommand: (pluginId: string, command: string, ...args: any[]) => ipcRenderer.invoke('plugins:execute-command', pluginId, command, ...args)
  },

  // Phase 2 - Marketplace
  marketplace: {
    searchPlugins: (query: any) => ipcRenderer.invoke('marketplace:search-plugins', query),
    getPlugin: (pluginId: string) => ipcRenderer.invoke('marketplace:get-plugin', pluginId),
    installPlugin: (pluginId: string, version?: string) => ipcRenderer.invoke('marketplace:install-plugin', pluginId, version),
    uninstallPlugin: (pluginId: string) => ipcRenderer.invoke('marketplace:uninstall-plugin', pluginId),
    updatePlugin: (pluginId: string) => ipcRenderer.invoke('marketplace:update-plugin', pluginId),
    checkUpdates: () => ipcRenderer.invoke('marketplace:check-updates'),
    getStats: () => ipcRenderer.invoke('marketplace:get-stats'),
    getInstalled: () => ipcRenderer.invoke('marketplace:get-installed')
  },

  // Phase 2 - Edge Deployment
  edge: {
    downloadModel: (modelId: string, source?: string) => ipcRenderer.invoke('edge-deployment:download-model', modelId, source),
    deployModel: (modelId: string, config?: any) => ipcRenderer.invoke('edge-deployment:deploy-model', modelId, config),
    stopDeployment: (deploymentId: string) => ipcRenderer.invoke('edge-deployment:stop-deployment', deploymentId),
    runInference: (modelId: string, request: any) => ipcRenderer.invoke('edge-deployment:run-inference', modelId, request),
    optimizeModel: (modelId: string, optimizationType: string, config?: any) => ipcRenderer.invoke('edge-deployment:optimize-model', modelId, optimizationType, config),
    getDeploymentStatus: () => ipcRenderer.invoke('edge-deployment:get-deployment-status')
  },

  // Phase 2 - Cloud Sync
  cloud: {
    startSync: (targetDeviceId?: string) => ipcRenderer.invoke('cloud-sync:start-sync', targetDeviceId),
    queueItem: (item: any) => ipcRenderer.invoke('cloud-sync:queue-item', item),
    resolveConflict: (conflictId: string, resolution: any) => ipcRenderer.invoke('cloud-sync:resolve-conflict', conflictId, resolution),
    getStatus: () => ipcRenderer.invoke('cloud-sync:get-status')
  },

  // Phase 2 - Distributed System
  distributed: {
    submitTask: (task: any) => ipcRenderer.invoke('distributed:submit-task', task),
    getTaskStatus: (taskId: string) => ipcRenderer.invoke('distributed:get-task-status', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('distributed:cancel-task', taskId),
    getClusterStatus: () => ipcRenderer.invoke('distributed:get-cluster-status'),
    isLeader: () => ipcRenderer.invoke('distributed:is-leader'),
    triggerElection: () => ipcRenderer.invoke('distributed:trigger-election')
  },

  // Phase 2 - Scaling & Memory
  scaling: {
    getMetrics: () => ipcRenderer.invoke('scaling:get-metrics'),
    getCurrentMetrics: () => ipcRenderer.invoke('scaling:get-current-metrics'),
    createInstance: (type: string, config: any) => ipcRenderer.invoke('scaling:create-instance', type, config),
    terminateInstance: (instanceId: string) => ipcRenderer.invoke('scaling:terminate-instance', instanceId),
    forceScaling: (action: string, instances?: number) => ipcRenderer.invoke('scaling:force-scaling', action, instances),
    predictLoad: (timeHorizon?: number) => ipcRenderer.invoke('scaling:predict-load', timeHorizon)
  },

  memory: {
    get: (key: string) => ipcRenderer.invoke('memory:get', key),
    set: (key: string, value: any, options?: any) => ipcRenderer.invoke('memory:set', key, value, options),
    delete: (key: string) => ipcRenderer.invoke('memory:delete', key),
    clear: () => ipcRenderer.invoke('memory:clear'),
    getAnalytics: () => ipcRenderer.invoke('memory:get-analytics'),
    getMetrics: () => ipcRenderer.invoke('memory:get-metrics'),
    predictAccesses: (currentSequence: string[]) => ipcRenderer.invoke('memory:predict-accesses', currentSequence),
    preloadItems: (keys: string[]) => ipcRenderer.invoke('memory:preload-items', keys)
  },

  // Additional APIs for feature parity
  inlineCompletion: (context: any) => ipcRenderer.invoke('inline-completion', context),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sendMessage: (message: any) => ipcRenderer.invoke('send-message', message),

  // Telemetry
  telemetry: {
    getStatus: () => ipcRenderer.invoke('telemetry:get-status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('telemetry:set-enabled', enabled),
    track: (eventType: string, data?: any) => ipcRenderer.invoke('telemetry:track', eventType, data),
    getStats: () => ipcRenderer.invoke('telemetry:get-stats'),
    clearData: () => ipcRenderer.invoke('telemetry:clear-data'),
    flush: () => ipcRenderer.invoke('telemetry:flush'),
  },

  // Matrix Agent Mode - Computer Control with Web Search and Smart Mode
  matrixAgentExecute: (
    message: string, 
    safetyMode: 'confirm-all' | 'smart' | 'speed', 
    webSearchEnabled: boolean = false,
    intelligenceLevel: 'basic' | 'smart' | 'genius' = 'smart'
  ) => 
    ipcRenderer.invoke('matrix-agent:execute', message, safetyMode, webSearchEnabled, intelligenceLevel),
  matrixAgentConfirm: (actionId: string, approved: boolean) => 
    ipcRenderer.invoke('matrix-agent:confirm', actionId, approved),
  matrixAgentCancel: () => ipcRenderer.invoke('matrix-agent:cancel'),
  matrixAgentClearHistory: () => ipcRenderer.invoke('matrix-agent:clear-history'),
  
  // System discovery and Steam configuration
  matrixAgentGetSystemInfo: () => ipcRenderer.invoke('matrix-agent:get-system-info'),
  matrixAgentRescanSystem: () => ipcRenderer.invoke('matrix-agent:rescan-system'),
  matrixAgentAddSteamPath: (path: string) => ipcRenderer.invoke('matrix-agent:add-steam-path', path),
  matrixAgentSetSteamPaths: (paths: string[]) => ipcRenderer.invoke('matrix-agent:set-steam-paths', paths),
  matrixAgentGetSteamPaths: () => ipcRenderer.invoke('matrix-agent:get-steam-paths'),
  
  onMatrixAgentEvent: (callback: (data: any) => void) => {
    ipcRenderer.on('matrix-agent:event', (event, data) => callback(data));
  },
  removeMatrixAgentEvent: () => {
    ipcRenderer.removeAllListeners('matrix-agent:event');
  },

  // ═══════════════════════════════════════════════════════════════
  // SMART CONTROLLER - Full PC Automation with AI Vision
  // ═══════════════════════════════════════════════════════════════
  smartController: {
    // Screen Capture
    captureScreen: (quality?: 'high' | 'medium' | 'low') => ipcRenderer.invoke('smart:capture-screen', quality),
    captureWindow: (quality?: 'high' | 'medium' | 'low') => ipcRenderer.invoke('smart:capture-window', quality),
    captureRegion: (region: { x: number; y: number; width: number; height: number }, quality?: 'high' | 'medium' | 'low') => 
      ipcRenderer.invoke('smart:capture-region', region, quality),
    getWindowInfo: () => ipcRenderer.invoke('smart:get-window-info'),
    
    // Mouse Control
    mouseMove: (x: number, y: number) => ipcRenderer.invoke('smart:mouse-move', x, y),
    mouseClick: (options?: { x?: number; y?: number; button?: 'left' | 'right' | 'middle'; double?: boolean }) => 
      ipcRenderer.invoke('smart:mouse-click', options),
    mousePosition: () => ipcRenderer.invoke('smart:mouse-position'),
    mouseDrag: (fromX: number, fromY: number, toX: number, toY: number, duration?: number) => 
      ipcRenderer.invoke('smart:mouse-drag', fromX, fromY, toX, toY, duration),
    scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) => 
      ipcRenderer.invoke('smart:scroll', direction, amount),
    
    // Keyboard Control
    typeText: (text: string, delay?: number) => ipcRenderer.invoke('smart:type-text', text, delay),
    pressKey: (key: string, modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]) => 
      ipcRenderer.invoke('smart:press-key', key, modifiers),
    hotkey: (...keys: string[]) => ipcRenderer.invoke('smart:hotkey', ...keys),
    
    // Window Control
    focusWindow: (title: string) => ipcRenderer.invoke('smart:focus-window', title),
    getWindows: () => ipcRenderer.invoke('smart:get-windows'),
    
    // Task Automation
    createTask: (name: string, description: string, steps: any[]) => 
      ipcRenderer.invoke('smart:create-task', name, description, steps),
    executeTask: (taskId: string) => ipcRenderer.invoke('smart:execute-task', taskId),
    pauseTask: () => ipcRenderer.invoke('smart:pause-task'),
    resumeTask: () => ipcRenderer.invoke('smart:resume-task'),
    cancelTask: () => ipcRenderer.invoke('smart:cancel-task'),
    getTask: (taskId: string) => ipcRenderer.invoke('smart:get-task', taskId),
    getAllTasks: () => ipcRenderer.invoke('smart:get-all-tasks'),
    getCurrentTask: () => ipcRenderer.invoke('smart:get-current-task'),
    deleteTask: (taskId: string) => ipcRenderer.invoke('smart:delete-task', taskId),
    createTaskFromNL: (instruction: string) => ipcRenderer.invoke('smart:create-task-from-nl', instruction),
    
    // Status & Safety
    getStatus: () => ipcRenderer.invoke('smart:get-status'),
    getConfig: () => ipcRenderer.invoke('smart:get-config'),
    updateConfig: (config: any) => ipcRenderer.invoke('smart:update-config', config),
    emergencyStop: () => ipcRenderer.invoke('smart:emergency-stop'),
    resume: () => ipcRenderer.invoke('smart:resume'),
    getActionLog: () => ipcRenderer.invoke('smart:get-action-log'),
    confirmationResponse: (approved: boolean) => ipcRenderer.invoke('smart:confirmation-response', approved),
    
    // Event Listeners
    onTaskProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('smart:task-progress', (event, data) => callback(data));
    },
    onScreenUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('smart:screen-update', (event, data) => callback(data));
    },
    onConfirmationNeeded: (callback: (data: any) => void) => {
      ipcRenderer.on('smart:confirmation-needed', (event, data) => callback(data));
    },
    removeSmartListeners: () => {
      ipcRenderer.removeAllListeners('smart:task-progress');
      ipcRenderer.removeAllListeners('smart:screen-update');
      ipcRenderer.removeAllListeners('smart:confirmation-needed');
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CREDENTIAL VAULT - Secure Password Storage
  // ═══════════════════════════════════════════════════════════════
  vault: {
    create: (masterPassword: string) => ipcRenderer.invoke('vault:create', masterPassword),
    unlock: (masterPassword: string) => ipcRenderer.invoke('vault:unlock', masterPassword),
    lock: () => ipcRenderer.invoke('vault:lock'),
    status: () => ipcRenderer.invoke('vault:status'),
    saveCredential: (credential: any) => ipcRenderer.invoke('vault:save-credential', credential),
    getCredential: (id: string, purpose?: string) => ipcRenderer.invoke('vault:get-credential', id, purpose),
    deleteCredential: (id: string) => ipcRenderer.invoke('vault:delete-credential', id),
    listCredentials: () => ipcRenderer.invoke('vault:list-credentials'),
    searchCredentials: (query: string) => ipcRenderer.invoke('vault:search-credentials', query),
    autoFill: (url: string) => ipcRenderer.invoke('vault:auto-fill', url),
    export: (exportPassword: string) => ipcRenderer.invoke('vault:export', exportPassword),
    import: (data: string, importPassword: string, merge?: boolean) => 
      ipcRenderer.invoke('vault:import', data, importPassword, merge),
    changePassword: (oldPassword: string, newPassword: string) => 
      ipcRenderer.invoke('vault:change-password', oldPassword, newPassword),
    getAuditLog: (limit?: number) => ipcRenderer.invoke('vault:get-audit-log', limit)
  },

  // ═══════════════════════════════════════════════════════════════
  // MATRIX MODE SYSTEMS - Full Feature Expansion
  // ═══════════════════════════════════════════════════════════════
  
  // Core
  matrixModeInitialize: (config?: any) => ipcRenderer.invoke('matrix-mode:initialize', config),
  matrixModeShutdown: () => ipcRenderer.invoke('matrix-mode:shutdown'),
  matrixModeStatus: () => ipcRenderer.invoke('matrix-mode:status'),

  // Memory System
  matrixModeMemorySearch: (query: string, options?: any) => 
    ipcRenderer.invoke('matrix-mode:memory:search', query, options),
  matrixModeMemoryGetSession: (channelId: string, channelType: string, userId?: string) => 
    ipcRenderer.invoke('matrix-mode:memory:get-session', channelId, channelType, userId),
  matrixModeMemoryAddMessage: (sessionId: string, role: string, content: string) => 
    ipcRenderer.invoke('matrix-mode:memory:add-message', sessionId, role, content),
  matrixModeMemoryGetContext: (sessionId: string, message?: string) => 
    ipcRenderer.invoke('matrix-mode:memory:get-context', sessionId, message),

  // Scheduler
  matrixModeSchedulerCreate: (name: string, cronExpr: string, action: any) => 
    ipcRenderer.invoke('matrix-mode:scheduler:create-task', name, cronExpr, action),
  matrixModeSchedulerList: () => ipcRenderer.invoke('matrix-mode:scheduler:list-tasks'),
  matrixModeSchedulerRun: (taskId: string) => ipcRenderer.invoke('matrix-mode:scheduler:run-task', taskId),
  matrixModeSchedulerDelete: (taskId: string) => ipcRenderer.invoke('matrix-mode:scheduler:delete-task', taskId),
  matrixModeSchedulerGetPresets: () => ipcRenderer.invoke('matrix-mode:scheduler:get-presets'),

  // Messaging Gateway
  matrixModeMessagingAddChannel: (config: any) => ipcRenderer.invoke('matrix-mode:messaging:add-channel', config),
  matrixModeMessagingConnect: (channelId: string) => ipcRenderer.invoke('matrix-mode:messaging:connect-channel', channelId),
  matrixModeMessagingDisconnect: (channelId: string) => ipcRenderer.invoke('matrix-mode:messaging:disconnect-channel', channelId),
  matrixModeMessagingSend: (channelId: string, targetId: string, text: string) => 
    ipcRenderer.invoke('matrix-mode:messaging:send', channelId, targetId, text),
  matrixModeMessagingGetChannels: () => ipcRenderer.invoke('matrix-mode:messaging:get-channels'),

  // Browser Automation
  matrixModeBrowserStart: (profileId?: string) => ipcRenderer.invoke('matrix-mode:browser:start', profileId),
  matrixModeBrowserNavigate: (url: string, profileId?: string) => ipcRenderer.invoke('matrix-mode:browser:navigate', url, profileId),
  matrixModeBrowserSnapshot: (profileId?: string) => ipcRenderer.invoke('matrix-mode:browser:snapshot', profileId),
  matrixModeBrowserAct: (ref: string, action: string, value?: string, profileId?: string) => 
    ipcRenderer.invoke('matrix-mode:browser:act', ref, action, value, profileId),
  matrixModeBrowserScreenshot: (profileId?: string, fullPage?: boolean) => 
    ipcRenderer.invoke('matrix-mode:browser:screenshot', profileId, fullPage),
  matrixModeBrowserStop: (profileId?: string) => ipcRenderer.invoke('matrix-mode:browser:stop', profileId),

  // Voice
  matrixModeVoiceStartListening: () => ipcRenderer.invoke('matrix-mode:voice:start-listening'),
  matrixModeVoiceStopListening: () => ipcRenderer.invoke('matrix-mode:voice:stop-listening'),
  matrixModeVoiceSpeak: (text: string) => ipcRenderer.invoke('matrix-mode:voice:speak', text),
  matrixModeVoiceTriggerWake: () => ipcRenderer.invoke('matrix-mode:voice:trigger-wake'),

  // Canvas
  matrixModeCanvasShow: () => ipcRenderer.invoke('matrix-mode:canvas:show'),
  matrixModeCanvasHide: () => ipcRenderer.invoke('matrix-mode:canvas:hide'),
  matrixModeCanvasRender: (components: any[]) => ipcRenderer.invoke('matrix-mode:canvas:render', components),
  matrixModeCanvasNavigate: (url: string) => ipcRenderer.invoke('matrix-mode:canvas:navigate', url),

  // Integrations
  matrixModeIntegrationsList: () => ipcRenderer.invoke('matrix-mode:integrations:list'),
  matrixModeIntegrationsConnect: (id: string, config: any) => 
    ipcRenderer.invoke('matrix-mode:integrations:connect', id, config),
  matrixModeIntegrationsExecute: (integrationId: string, action: string, params: any) => 
    ipcRenderer.invoke('matrix-mode:integrations:execute', integrationId, action, params),
  matrixModeIntegrationsDisconnect: (integrationId: string) => 
    ipcRenderer.invoke('matrix-mode:integrations:disconnect', integrationId),

  // Workflows
  matrixModeWorkflowCreate: (definition: any) => ipcRenderer.invoke('matrix-mode:workflow:create', definition),
  matrixModeWorkflowList: () => ipcRenderer.invoke('matrix-mode:workflow:list'),
  matrixModeWorkflowExecute: (workflowId: string, context?: any) => 
    ipcRenderer.invoke('matrix-mode:workflow:execute', workflowId, context),
  matrixModeWorkflowGetApprovals: () => ipcRenderer.invoke('matrix-mode:workflow:get-approvals'),
  matrixModeWorkflowRespondApproval: (requestId: string, approved: boolean, response?: string) => 
    ipcRenderer.invoke('matrix-mode:workflow:respond-approval', requestId, approved, response),

  // Remote Nodes
  matrixModeNodesGetPairingCode: () => ipcRenderer.invoke('matrix-mode:nodes:get-pairing-code'),
  matrixModeNodesList: () => ipcRenderer.invoke('matrix-mode:nodes:list'),
  matrixModeNodesSendCommand: (nodeId: string, type: string, params: any) => 
    ipcRenderer.invoke('matrix-mode:nodes:send-command', nodeId, type, params),
  matrixModeNodesCaptureCamera: (nodeId: string) => ipcRenderer.invoke('matrix-mode:nodes:capture-camera', nodeId),
  matrixModeNodesGetLocation: (nodeId: string) => ipcRenderer.invoke('matrix-mode:nodes:get-location', nodeId),
  matrixModeNodesUnpair: (nodeId: string) => ipcRenderer.invoke('matrix-mode:nodes:unpair', nodeId),

  // ═══════════════════════════════════════════════════════════════════════════
  // GENESIS INTEGRATION - Human-Approval Code Forge
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Initialization
  genesisInit: (config?: any) => ipcRenderer.invoke('genesis:init', config),
  genesisAvailable: () => ipcRenderer.invoke('genesis:available'),
  
  // Proposals
  genesisPropose: (goal: string, projectPath?: string, llmSpec?: string) => 
    ipcRenderer.invoke('genesis:propose', goal, projectPath, llmSpec),
  genesisApprove: () => ipcRenderer.invoke('genesis:approve'),
  genesisReject: () => ipcRenderer.invoke('genesis:reject'),
  genesisModify: (feedback: string) => ipcRenderer.invoke('genesis:modify', feedback),
  genesisCancel: () => ipcRenderer.invoke('genesis:cancel'),
  
  // Evolution Log
  genesisStats: () => ipcRenderer.invoke('genesis:stats'),
  genesisRecent: (limit?: number) => ipcRenderer.invoke('genesis:recent', limit),
  genesisFormatForChat: (proposal: any) => ipcRenderer.invoke('genesis:format-for-chat', proposal)
};

contextBridge.exposeInMainWorld('agentAPI', agentAPI);

console.log('✅ AgentPrime API exposed to renderer');
