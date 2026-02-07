/**
 * IPC Channel and API type definitions
 */

import type {
  ChatContext,
  ChatResponse,
  ChatStreamChunk,
  FileTreeItem,
  FileInfo,
  SearchResult,
  GitStatus,
  Settings,
  AgentState,
  AgentAction,
  SymbolInfo,
  CodebaseIndexStats,
  Template,
  MirrorPattern,
  MirrorMetrics,
  MirrorStats
} from './index';

/**
 * Telemetry statistics
 */
export interface TelemetryStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  sessionCount: number;
  lastEventTime: number | null;
  oldestEventTime: number | null;
}

/**
 * Genesis Integration Types
 */
export interface GenesisConfig {
  genesisPath: string;
  defaultProjectPath?: string;
  defaultLlm?: string;
  autoApproveLowRisk?: boolean;
  allowedChannels?: string[];
}

export interface GenesisChange {
  file_path: string;
  old_code: string;
  new_code: string;
}

export interface GenesisProposal {
  id: string;
  goal: string;
  reasoning: string;
  changes: GenesisChange[];
  timestamp: string;
  project: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}

export interface GenesisResult {
  success: boolean;
  proposal?: GenesisProposal;
  applied?: boolean;
  commitHash?: string;
  error?: string;
}

export interface GenesisStats {
  total: number;
  approved: number;
  rejected: number;
  rate: number;
}

/**
 * All IPC channel names
 */
export type IpcChannel =
  | 'open-folder'
  | 'get-workspace'
  | 'read-tree'
  | 'read-file'
  | 'write-file'
  | 'save-file-dialog'
  | 'create-item'
  | 'delete-item'
  | 'create-workspace'
  | 'chat'
  | 'quick-action'
  | 'ai-status'
  | 'clear-history'
  | 'inline-completion'
  | 'run-command'
  | 'global-search'
  | 'git-status'
  | 'git-commit'
  | 'git-command'
  | 'agent-mode'
  | 'agent-approve-action'
  | 'agent-reject-action'
  | 'agent-approve-all'
  | 'script:run'
  | 'script:kill'
  | 'script:isRunnable'
  | 'script:output'
  | 'script:exit'
  | 'script:error'
  | 'analyze:eslint'
  | 'agent-reject-all'
  | 'agent-rollback'
  | 'agent-rollback-all'
  | 'agent-get-state'
  | 'agent-get-diff'
  | 'mirror-toggle-learning'
  | 'mirror-get-status'
  | 'mirror-get-metrics'
  | 'mirror-get-patterns'
  | 'mirror-analyze-opus'
  | 'mirror-get-feedback-loops'
  | 'mirror-ingest-url'
  | 'mirror-ingest-urls'
  | 'mirror-ingest-content'
  | 'mirror-get-ingestion-history'
  | 'get-settings'
  | 'update-settings'
  | 'get-providers'
  | 'get-provider-models'
  | 'test-provider'
  | 'set-active-provider'
  | 'configure-provider'
  | 'run-lint'
  | 'get-templates'
  | 'get-template'
  | 'create-from-template'
  | 'select-directory'
  | 'index-workspace'
  | 'get-index-stats'
  | 'search-symbols'
  | 'search-files'
  | 'get-file-symbols'
  | 'get-related-files'
  | 'get-ai-context'
  | 'update-file-index'
  | 'get-mention-suggestions'
  | 'folder:set-focus'
  | 'folder:get-focus'
  | 'folder:get-context'
  | 'search:embed-query'
  | 'search:relevant-files'
  | 'agent:list-files'
  | 'agent:read-file'
  | 'agent:write-file'
  | 'agent:apply-diff'
  | 'agent:run-command'
  | 'agent:search-codebase'

  // Phase 2 - Collaboration
  | 'collaboration:create-session'
  | 'collaboration:join-session'
  | 'collaboration:leave-session'
  | 'collaboration:get-active-sessions'
  | 'collaboration:get-user-sessions'
  | 'collaboration:record-change'
  | 'collaboration:get-pending-changes'
  | 'collaboration:apply-changes'
  | 'collaboration:update-presence'
  | 'collaboration:create-workspace'
  | 'collaboration:get-workspace'

  // Phase 2 - Plugins
  | 'plugins:load-plugin'
  | 'plugins:activate-plugin'
  | 'plugins:deactivate-plugin'
  | 'plugins:reload-plugin'
  | 'plugins:get-installed-plugins'
  | 'plugins:get-plugin-context'
  | 'plugins:execute-command'

  // Phase 2 - Marketplace
  | 'marketplace:search-plugins'
  | 'marketplace:get-plugin'
  | 'marketplace:install-plugin'
  | 'marketplace:uninstall-plugin'
  | 'marketplace:update-plugin'
  | 'marketplace:check-updates'
  | 'marketplace:get-stats'
  | 'marketplace:get-installed'

  // Phase 2 - Edge Deployment
  | 'edge-deployment:download-model'
  | 'edge-deployment:deploy-model'
  | 'edge-deployment:stop-deployment'
  | 'edge-deployment:run-inference'
  | 'edge-deployment:optimize-model'
  | 'edge-deployment:get-deployment-status'

  // Phase 2 - Cloud Sync
  | 'cloud-sync:start-sync'
  | 'cloud-sync:queue-item'
  | 'cloud-sync:resolve-conflict'
  | 'cloud-sync:get-status'

  // Phase 2 - Distributed System
  | 'distributed:submit-task'
  | 'distributed:get-task-status'
  | 'distributed:cancel-task'
  | 'distributed:get-cluster-status'
  | 'distributed:is-leader'
  | 'distributed:trigger-election'

  // Phase 2 - Scaling & Memory
  | 'scaling:get-metrics'
  | 'scaling:get-current-metrics'
  | 'scaling:create-instance'
  | 'scaling:terminate-instance'
  | 'scaling:force-scaling'
  | 'scaling:predict-load'
  | 'memory:get'
  | 'memory:set'
  | 'memory:delete'
  | 'memory:clear'
  | 'memory:get-analytics'
  | 'memory:get-metrics'
  | 'memory:predict-accesses'
  | 'memory:preload-items';

/**
 * AgentAPI interface exposed to renderer via preload
 */
export interface AgentAPI {
  // Folder operations
  openFolder: () => Promise<{ success: boolean; path?: string }>;
  getWorkspace: () => Promise<string | null>;
  createFolder: (folderName: string) => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
  setWorkspace: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  launchProject: (projectPath: string) => Promise<{ success: boolean; message?: string; url?: string; error?: string }>;

  // File tree
  readTree: (path?: string) => Promise<{ tree: FileTreeItem[]; root: string | null; error?: string }>;

  // File operations
  readFile: (path: string) => Promise<FileInfo>;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
  saveFileDialog: (defaultPath?: string, suggestedExtension?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  createItem: (path: string, isDir: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteItem: (path: string) => Promise<{ success: boolean; error?: string }>;

  // AI
  chat: (message: string, context: ChatContext) => Promise<ChatResponse>;
  quickAction: (action: string, code: string, language?: string) => Promise<ChatResponse>;
  aiStatus: () => Promise<{ online: boolean; model: string; modelExists?: boolean; availableModels?: string[]; error?: string }>;
  clearHistory: () => Promise<{ success: boolean }>;
  getChatHistory: () => Promise<{ success: boolean; history: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: Date }>; error?: string }>;
  getChatHistoryForSession: (sessionId: string) => Promise<{ success: boolean; history: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: Date }>; error?: string }>;
  getCurrentAgentSessionId: () => Promise<{ success: boolean; sessionId: string | null }>;
  inlineCompletion: (context: any) => Promise<{ completion: string | null }>;
  requestCompletion: (context: any) => Promise<any>;
  prewarmCompletions: () => Promise<any>;
  getCurrentFilePath: () => Promise<string | null>;
  trackEvent: (event: string, data: any) => Promise<any>;

  // Streaming
  onChatStream: (callback: (data: ChatStreamChunk) => void) => void;
  removeChatStream: () => void;
  onChatActionResult: (callback: (data: any) => void) => void;
  removeChatActionResult: () => void;
  onCommandRequiresConfirmation: (callback: (data: any) => void) => void;
  removeCommandRequiresConfirmation: () => void;
  onCommandError: (callback: (data: any) => void) => void;
  removeCommandError: () => void;
  onModelSelectionInfo: (callback: (data: { requestId: string; provider: string; model: string; reasoning: string; autoSelected: boolean }) => void) => void;
  removeModelSelectionInfo: () => void;
  onCompletionPartial: (callback: (data: any) => void) => void;
  removeCompletionPartial: () => void;

  // 🦖 DINO BUDDY: Agent Progress Events
  onAgentTaskStart: (callback: (data: { task: string }) => void) => void;
  onAgentStepComplete: (callback: (data: { type: string; title: string; success: boolean }) => void) => void;
  onAgentFileModified: (callback: (data: { path: string; action: string }) => void) => void;
  onAgentCritiqueComplete: (callback: (data: any) => void) => void;
  removeAgentListeners: () => void;
  summarizeConversation: () => Promise<{ success: boolean; needed?: boolean; summary?: any; originalCount?: number; condensedCount?: number; tokensSaved?: number; message?: string; error?: string }>;

  // Event listeners
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  removeListener: (channel: string) => void;

  // Terminal
  runCommand: (command: string) => Promise<{ stdout: string; stderr: string; success: boolean }>;

  // Search
  globalSearch: (query: string, options?: { regex?: boolean; include?: string }) => Promise<{ results: SearchResult[]; total: number; error?: string }>;

  // Git
  gitStatus: () => Promise<GitStatus>;
  gitCommit: (message: string) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
  gitCommand: (command: string) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>;
  gitDiff: (filePath?: string) => Promise<{ success: boolean; output?: string; error?: string }>;
  gitStage: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  gitUnstage: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  gitPush: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
  gitPull: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
  gitBranches: () => Promise<{ success: boolean; branches?: Array<{ name: string; current: boolean; remote: boolean }>; error?: string }>;
  gitCheckout: (branch: string) => Promise<{ success: boolean; error?: string }>;
  gitCreateBranch: (branch: string) => Promise<{ success: boolean; error?: string }>;

  // Settings
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>;

  // AI Provider Management
  getProviders: () => Promise<any[]>;
  getProviderModels: (providerName: string) => Promise<{ success: boolean; models?: string[]; error?: string }>;
  testProvider: (providerName: string) => Promise<{ success: boolean; error?: string }>;
  setActiveProvider: (providerName: string, model: string) => Promise<{ success: boolean; error?: string }>;
  configureProvider: (providerName: string, config: any) => Promise<{ success: boolean; error?: string }>;

  // Linting
  runLint: (filePath: string, content: string) => Promise<{ errors: Array<{ line: number; column: number; severity: string; message: string; rule?: string }> }>;

  // Agent Mode
  agentMode: (task: string, autoApprove?: boolean) => Promise<{ success: boolean; message?: string; pendingActions?: AgentAction[]; executedActions?: AgentAction[]; error?: string }>;
  agentApproveAction: (actionId: string) => Promise<{ success: boolean; error?: string }>;
  agentRejectAction: (actionId: string) => Promise<{ success: boolean; error?: string }>;
  agentApproveAll: () => Promise<{ success: boolean; error?: string }>;
  agentRejectAll: () => Promise<{ success: boolean; error?: string }>;
  agentRollback: (actionId: string) => Promise<{ success: boolean; error?: string }>;
  agentRollbackAll: () => Promise<{ success: boolean; error?: string }>;
  agentGetState: () => Promise<{ success: boolean; state?: AgentState; error?: string }>;
  agentGetDiff: (actionId: string) => Promise<{ success: boolean; diff?: string; content?: string; oldContent?: string; error?: string }>;
  onAgentEvent: (callback: (data: any) => void) => void;
  removeAgentEvent: () => void;

  // Agent Tools - For renderer agent loop
  listFiles: (path: string) => Promise<any>;
  agentRunCommand: (command: string, cwd?: string, timeout?: number) => Promise<{ success: boolean; command: string; cwd?: string; exit_code?: number; stdout?: string; stderr?: string; error?: string }>;
  agentSearchCodebase: (query: string, options?: { includePattern?: string; excludePattern?: string; maxResults?: number }) => Promise<{ success: boolean; query: string; matches: Array<{ file: string; line: number; content: string }>; total: number; message?: string; error?: string }>;
  applyDiff: (path: string, diff: string) => Promise<{ success: boolean; error?: string }>;

  // Workspace creation
  createWorkspace: (projectName: string, baseDir: string) => Promise<{ success: boolean; path?: string; error?: string }>;

  // Template System
  getTemplates: () => Promise<{ success: boolean; templates?: Template[]; categories?: string[]; error?: string }>;
  getTemplate: (templateId: string) => Promise<{ success: boolean; template?: Template; error?: string }>;
  createFromTemplate: (templateId: string, targetDir: string, variables: Record<string, any>) => Promise<any>;
  selectDirectory: () => Promise<{ success: boolean; path?: string }>;

  // Codebase Indexer
  indexWorkspace: () => Promise<{ success: boolean; filesIndexed?: number; symbolsFound?: number; duration?: number; error?: string }>;
  getIndexStats: () => Promise<{ success: boolean; stats?: CodebaseIndexStats; error?: string }>;
  searchSymbols: (query: string, limit?: number) => Promise<{ success: boolean; results?: SymbolInfo[]; error?: string }>;
  searchFiles: (query: string, limit?: number) => Promise<{ success: boolean; results?: any[]; error?: string }>;
  getFileSymbols: (filePath: string) => Promise<{ success: boolean; symbols?: SymbolInfo[]; error?: string }>;
  getRelatedFiles: (filePath: string, depth?: number) => Promise<{ success: boolean; files?: string[]; error?: string }>;
  getAIContext: (filePath: string) => Promise<{ success: boolean; context?: any; error?: string }>;
  updateFileIndex: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  getMentionSuggestions: (query: string, type?: 'all' | 'file' | 'symbol') => Promise<{ success: boolean; suggestions?: any[]; error?: string }>;

  // Symbol Navigation (Go to Definition, Find References)
  findDefinition: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => Promise<{ success: boolean; definitions?: Array<{ filePath: string; line: number; column?: number; preview?: string }>; error?: string }>;
  findReferences: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => Promise<{ success: boolean; references?: Array<{ filePath: string; line: number; column?: number; content?: string }>; error?: string }>;

  // Folder Focus
  setFolderFocus: (folderPath: string | null) => Promise<{ success: boolean; path?: string | null; error?: string }>;
  getFolderFocus: () => Promise<{ path: string | null }>;
  getFolderContext: (folderPath: string) => Promise<{ path: string; fileCount: number; files: Array<{ path: string; name: string; size: number; language?: string }>; error?: string }>;

  // Mirror Intelligence System
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  mirrorGetStatus: () => Promise<{ success: boolean; enabled?: boolean; initialized?: boolean; isLearning?: boolean; opusPatternsLoaded?: boolean; patternsCount?: number; error?: string }>;
  mirrorToggleLearning: (enabled: boolean) => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
  mirrorGetMetrics: () => Promise<{ success: boolean; metrics?: MirrorMetrics; stats?: MirrorStats; error?: string }>;
  mirrorGetPatterns: (category?: string | null, limit?: number) => Promise<{ success: boolean; patterns?: MirrorPattern[]; error?: string }>;
  mirrorIngestUrl: (url: string, options?: any) => Promise<any>;
  mirrorIngestContent: (content: string, metadata?: any) => Promise<any>;
  mirrorGetIngestionHistory: (limit?: number) => Promise<{ success: boolean; history?: any[]; error?: string }>;
  
  // Opus Training Integration
  mirrorIngestOpus: () => Promise<{ success: boolean; patternsIngested?: number; error?: string }>;
  mirrorAutoInit: () => Promise<{ success: boolean; alreadyLoaded?: boolean; patternsIngested?: number; message?: string; error?: string }>;
  mirrorGetOpusCorpus: () => Promise<{ success: boolean; corpus?: string; error?: string }>;
  mirrorGetCriticalPatterns: () => Promise<{ success: boolean; patterns?: any[]; error?: string }>;
  mirrorLearnFromCode: (code: string, context?: any) => Promise<{ success: boolean; patternsLearned?: number; error?: string }>;
  mirrorClearAntiPatterns: () => Promise<{ success: boolean; clearedCount?: number; error?: string }>;
  onMirrorPatternLearned: (callback: (data: { pattern: string; category: string; intelligence: number }) => void) => void;
  removeMirrorPatternLearned: () => void;

  // Python Brain API (Orchestrator + Memory + Analysis)
  brainAvailable: () => Promise<boolean>;
  brainRoute: (message: string, context?: any) => Promise<any>;
  brainRecordOutcome: (message: string, success: boolean, model?: string, steps?: number) => Promise<any>;
  brainMemoryStore: (type: string, content: string, metadata?: any) => Promise<any>;
  brainMemorySearch: (query: string, type?: string, limit?: number) => Promise<any>;
  brainMemoryByType: (type: string, limit?: number) => Promise<any>;
  brainSaveConversation: (sessionId: string, role: string, content: string, model?: string, tokens?: number) => Promise<any>;
  brainGetConversation: (sessionId: string, limit?: number) => Promise<any>;
  brainGetSessions: (limit?: number) => Promise<any>;
  brainAnalyze: (workspacePath: string, background?: boolean) => Promise<any>;
  brainAnalyzeStatus: () => Promise<any>;
  brainGetPatterns: (language?: string, limit?: number) => Promise<any>;
  brainGetStyle: () => Promise<any>;
  brainSetPreference: (key: string, value: any) => Promise<any>;
  brainGetPreference: (key: string, defaultValue?: any) => Promise<any>;
  brainGetAllPreferences: () => Promise<any>;
  brainStats: () => Promise<any>;

  // Asset Generation
  assetsGetLibraries: () => Promise<{ success: boolean; libraries: any }>;
  assetsGetDiablo2Styles: () => Promise<{ success: boolean; assets: any }>;
  assetsGenerateModel: (modelType: string, options?: any) => Promise<{ success: boolean; code: string; modelType: string; error?: string }>;
  assetsGenerateDungeon: (width: number, height: number, options?: any) => Promise<{ success: boolean; code: string; dimensions: { width: number; height: number }; error?: string }>;
  assetsGenerateTexture: (width: number, height: number, color: string, pattern?: string) => Promise<{ success: boolean; dataUrl: string; error?: string }>;
  assetsDownload: (url: string, targetPath: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  assetsGetModelTypes: () => Promise<{ success: boolean; types: Array<{ id: string; name: string; description: string }> }>;
  assetsGenerateEnemy: (enemyType: string, options?: any) => Promise<{ success: boolean; code: string; enemyType: string; error?: string }>;

  // Script Execution
  runScript: (filePath: string) => Promise<{ success: boolean; pid?: number; fileName?: string; error?: string }>;
  killScript: (pid: number) => Promise<{ success: boolean; error?: string }>;
  isRunnable: (filePath: string) => Promise<{ runnable: boolean }>;
  onScriptOutput: (callback: (data: { pid: number; type: string; data: string }) => void) => void;
  removeScriptOutput: () => void;
  onScriptExit: (callback: (data: { pid: number; code: number | null }) => void) => void;
  removeScriptExit: () => void;
  onScriptError: (callback: (data: { pid: number; error: string }) => void) => void;
  removeScriptError: () => void;

  // Command Execution
  executeCommand: (command: string) => Promise<{ success: boolean; message?: string; error?: string; requiresConfirmation?: boolean; confirmationPrompt?: string; plan?: any; assessment?: any; result?: any }>;
  executeCommandPlan: (plan: any) => Promise<{ success: boolean; message?: string; error?: string; result?: any }>;
  isFileOperationCommand: (message: string) => Promise<boolean>;
  getCommandUndoHistory: () => Promise<any[]>;
  undoCommand: () => Promise<{ success: boolean; message?: string; error?: string }>;

  // Code Analysis
  analyzeCode: (filePath: string, content: string) => Promise<{ success: boolean; issues?: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning'; ruleId: string }>; error?: string }>;
  examineCodebase: (options?: { maxFiles?: number; includeContent?: boolean }) => Promise<{
    success: boolean;
    summary?: {
      root: string;
      totalFiles: number;
      totalSize: number;
      languages: Record<string, { count: number; files: Array<{ path: string; name: string; size: number; language: string; lines: number; content?: string }> }>;
      structure: {
        directories: string[];
        keyFiles: Array<{ path: string; name: string; size: number; language: string; lines: number; content?: string }>;
      };
    };
    error?: string;
  }>;

  // Voice Control
  processVoiceCommand: (speechText: string) => Promise<{
    success: boolean;
    message?: string;
    action?: any;
    originalSpeech?: string;
    error?: string;
  }>;

  // Semantic Search
  embedQuery: (query: string) => Promise<number[]>;
  searchRelevantFiles: (query: string, topK?: number) => Promise<Array<{
    path: string;
    content: string;
    score: number;
  }>>;
  getSemanticContext: (query: { query: string; filePath?: string; maxFiles?: number; contextWindow?: number }) => Promise<string>;
  refactorCode: (request: any) => Promise<any>;
  extractFunction: (filePath: string, selection: any, functionName: string, workspacePath: string) => Promise<any>;
  renameSymbol: (filePath: string, symbolName: string, newName: string, workspacePath: string) => Promise<any>;
  applyRefactoring: (changes: any[]) => Promise<any>;
  checkRefactoringSafety: (request: any, changes: any[]) => Promise<any>;
  getTeamPatterns: (teamId: string, filter?: any) => Promise<any>;
  sharePatternWithTeam: (teamId: string, patternId: string, visibility: string) => Promise<any>;

  // Project Registry (remembers past projects)
  projectGetAll: () => Promise<{
    success: boolean;
    projects?: Array<{
      id: string;
      name: string;
      path: string;
      type: string;
      description: string;
      createdAt: string;
      updatedAt: string;
      files: string[];
      technologies: string[];
    }>;
    error?: string;
  }>;
  projectGetRecent: (limit?: number) => Promise<{
    success: boolean;
    projects?: Array<{
      id: string;
      name: string;
      path: string;
      type: string;
      description: string;
      createdAt: string;
      updatedAt: string;
    }>;
    error?: string;
  }>;
  projectSearch: (query: string) => Promise<{
    success: boolean;
    projects?: Array<{
      id: string;
      name: string;
      path: string;
      type: string;
      description: string;
    }>;
    error?: string;
  }>;
  projectGetByPath: (projectPath: string) => Promise<{
    success: boolean;
    project?: {
      id: string;
      name: string;
      path: string;
      type: string;
      description: string;
      createdAt: string;
      updatedAt: string;
      files: string[];
      technologies: string[];
      buildHistory: Array<{
        timestamp: string;
        action: string;
        description: string;
        filesChanged: string[];
      }>;
    } | null;
    error?: string;
  }>;
  
  // Auto-Updater
  checkForUpdates: () => Promise<{ success: boolean }>;
  downloadUpdate: () => Promise<{ success: boolean }>;
  installUpdate: () => Promise<{ success: boolean }>;
  getAppVersion: () => Promise<string>;
  onAutoUpdaterStatus: (callback: (data: { event: string; data?: any }) => void) => void;
  removeAutoUpdaterStatus: () => void;

  // Phase 2 - Collaboration
  collaboration: {
    createSession: (name: string, workspace: string) => Promise<{ success: boolean; session?: any }>;
    joinSession: (sessionId: string, username?: string) => Promise<{ success: boolean; session?: any }>;
    leaveSession: (sessionId: string) => Promise<{ success: boolean }>;
    getActiveSessions: () => Promise<{ success: boolean; sessions?: any[] }>;
    getUserSessions: () => Promise<{ success: boolean; sessions?: any[] }>;
    recordChange: (sessionId: string, change: any) => Promise<{ success: boolean; change?: any }>;
    getPendingChanges: (sessionId: string) => Promise<{ success: boolean; changes?: any[] }>;
    applyChanges: (sessionId: string, filePath: string) => Promise<{ success: boolean }>;
    updatePresence: (sessionId: string, presence: any) => Promise<{ success: boolean }>;
    createWorkspace: (name: string, description?: string) => Promise<{ success: boolean; workspace?: any }>;
    getWorkspace: (workspaceId: string) => Promise<{ success: boolean; workspace?: any }>;
  };

  // Phase 2 - Plugins
  plugins: {
    loadPlugin: (pluginPath: string) => Promise<{ success: boolean; pluginId?: string }>;
    activatePlugin: (pluginId: string) => Promise<{ success: boolean }>;
    deactivatePlugin: (pluginId: string) => Promise<{ success: boolean }>;
    reloadPlugin: (pluginId: string) => Promise<{ success: boolean }>;
    getInstalledPlugins: () => Promise<{ success: boolean; plugins?: any[] }>;
    getPluginContext: (pluginId: string) => Promise<{ success: boolean; context?: any }>;
    executeCommand: (pluginId: string, command: string, ...args: any[]) => Promise<{ success: boolean; result?: any }>;
  };

  marketplace: {
    searchPlugins: (query: any) => Promise<{ success: boolean; results?: any }>;
    getPlugin: (pluginId: string) => Promise<{ success: boolean; plugin?: any }>;
    installPlugin: (pluginId: string, version?: string) => Promise<{ success: boolean; installation?: any }>;
    uninstallPlugin: (pluginId: string) => Promise<{ success: boolean }>;
    updatePlugin: (pluginId: string) => Promise<{ success: boolean }>;
    checkUpdates: () => Promise<{ success: boolean; updates?: any[] }>;
    getStats: () => Promise<{ success: boolean; stats?: any }>;
    getInstalled: () => Promise<{ success: boolean; plugins?: any[] }>;
  };

  // Phase 2 - Edge Deployment
  edge: {
    downloadModel: (modelId: string, source?: string) => Promise<{ success: boolean; download?: any }>;
    deployModel: (modelId: string, config?: any) => Promise<{ success: boolean; deployment?: any }>;
    stopDeployment: (deploymentId: string) => Promise<{ success: boolean }>;
    runInference: (modelId: string, request: any) => Promise<{ success: boolean; response?: any }>;
    optimizeModel: (modelId: string, optimizationType: string, config?: any) => Promise<{ success: boolean; optimization?: any }>;
    getDeploymentStatus: () => Promise<{ success: boolean; status?: any }>;
  };

  // Phase 2 - Cloud Sync
  cloud: {
    startSync: (targetDeviceId?: string) => Promise<{ success: boolean; session?: any }>;
    queueItem: (item: any) => Promise<{ success: boolean; item?: any }>;
    resolveConflict: (conflictId: string, resolution: any) => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ success: boolean; status?: any }>;
  };

  // Phase 2 - Distributed System
  distributed: {
    submitTask: (task: any) => Promise<{ success: boolean; taskId?: string }>;
    getTaskStatus: (taskId: string) => Promise<{ success: boolean; task?: any }>;
    cancelTask: (taskId: string) => Promise<{ success: boolean; cancelled?: boolean }>;
    getClusterStatus: () => Promise<{ success: boolean; status?: any }>;
    isLeader: () => Promise<{ success: boolean; isLeader?: boolean }>;
    triggerElection: () => Promise<{ success: boolean }>;
  };

  // Phase 2 - Scaling & Memory
  scaling: {
    getMetrics: () => Promise<{ success: boolean; metrics?: any }>;
    getCurrentMetrics: () => Promise<{ success: boolean; metrics?: any }>;
    createInstance: (type: string, config: any) => Promise<{ success: boolean; instance?: any }>;
    terminateInstance: (instanceId: string) => Promise<{ success: boolean; terminated?: boolean }>;
    forceScaling: (action: string, instances?: number) => Promise<{ success: boolean; decision?: any }>;
    predictLoad: (timeHorizon?: number) => Promise<{ success: boolean; prediction?: any }>;
  };

  memory: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, options?: any) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<void>;
    getAnalytics: () => Promise<any>;
    getMetrics: () => Promise<any>;
    predictAccesses: (currentSequence: string[]) => Promise<string[]>;
    preloadItems: (keys: string[]) => Promise<void>;
  };

  // Telemetry
  telemetry: {
    getStatus: () => Promise<{ success: boolean; enabled?: boolean; sessionId?: string; installId?: string; error?: string }>;
    setEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
    track: (eventType: string, data?: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
    getStats: () => Promise<{ success: boolean; stats?: TelemetryStats; error?: string }>;
    clearData: () => Promise<{ success: boolean; error?: string }>;
    flush: () => Promise<{ success: boolean; error?: string }>;
  };

  // Genesis Integration - Human-Approval Code Forge
  genesisInit: (config?: GenesisConfig) => Promise<{ success: boolean; path?: string; error?: string }>;
  genesisAvailable: () => Promise<{ available: boolean; initialized: boolean; path?: string }>;
  genesisPropose: (goal: string, projectPath?: string, llmSpec?: string) => Promise<GenesisResult>;
  genesisApprove: () => Promise<{ success: boolean; error?: string }>;
  genesisReject: () => Promise<{ success: boolean; error?: string }>;
  genesisModify: (feedback: string) => Promise<{ success: boolean; error?: string }>;
  genesisCancel: () => Promise<{ success: boolean; error?: string }>;
  genesisStats: () => Promise<{ success: boolean; stats?: GenesisStats; error?: string }>;
  genesisRecent: (limit?: number) => Promise<{ success: boolean; proposals?: GenesisProposal[]; error?: string }>;
  genesisFormatForChat: (proposal: GenesisProposal) => Promise<{ success: boolean; formatted?: string }>;

  // Utility methods
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (message: any) => Promise<any>;
}

declare global {
  interface Window {
    agentAPI: AgentAPI;
  }
}
