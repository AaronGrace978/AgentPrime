/**
 * Lean IPC contract used by `src/main/preload.ts`.
 * Keep this file in lockstep with the methods exposed on `window.agentAPI`.
 */

import type { Settings } from './index';
import type {
  AgentReviewChange,
  AgentReviewChangeStatus,
  AgentReviewFinding,
  AgentReviewSessionSnapshot,
  AgentReviewVerificationState,
} from './agent-review';
import type { AIStatusSnapshot, AIRuntimeSnapshot } from './ai-providers';

export interface TelemetryStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  sessionCount: number;
  lastEventTime: number | null;
  oldestEventTime: number | null;
}

export interface StartupPreflightIssue {
  code: string;
  severity: 'warn' | 'info';
  message: string;
  action?: string;
}

export interface StartupPreflightReport {
  issues: StartupPreflightIssue[];
  warningCount: number;
  infoCount: number;
  generatedAt: string;
}

export interface ProviderApiKeyStatus {
  provider: string;
  hasStoredKey: boolean;
  hasEnvironmentKey: boolean;
  activeSource: 'secure-storage' | 'environment' | 'none';
  storageBackend: 'keychain' | 'encrypted-file';
  environmentVariable?: string;
}

export interface AgentAPI {
  [key: string]: any;

  // Workspace and files
  openFolder: () => Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }>;
  getWorkspace: () => Promise<string | null>;
  createFolder: (folderName: string) => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
  setWorkspace: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  launchProject: (projectPath: string) => Promise<{ success: boolean; message?: string; url?: string; error?: string }>;
  verifyProject: (projectPath: string) => Promise<{
    success: boolean;
    projectKind: string;
    projectTypeLabel: string;
    startCommand?: string;
    buildCommand?: string;
    installCommand?: string;
    readinessSummary?: string;
    url?: string;
    issues?: string[];
    findings?: AgentReviewFinding[];
    installResult?: { success: boolean; output: string };
    buildResult?: { success: boolean; output: string };
    runResult?: { success: boolean; output: string; port?: number; url?: string };
  }>;
  updateAgentReviewStatus: (
    sessionId: string,
    filePath: string,
    status: AgentReviewChangeStatus
  ) => Promise<{ success: boolean; session?: AgentReviewSessionSnapshot; error?: string }>;
  updatePendingAgentReviewStatuses: (
    sessionId: string,
    status: 'accepted' | 'rejected'
  ) => Promise<{ success: boolean; session?: AgentReviewSessionSnapshot; error?: string }>;
  applyAgentReview: (sessionId: string) => Promise<{ success: boolean; session?: AgentReviewSessionSnapshot; error?: string }>;
  discardAgentReview: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  readTree: (path?: string) => Promise<any>;
  readFile: (path: string) => Promise<{
    success?: boolean;
    path?: string;
    content?: string;
    language?: string;
    size?: number;
    lines?: number;
    error?: string;
    [key: string]: any;
  }>;
  writeFile: (path: string, content: string) => Promise<any>;
  saveFileDialog: (defaultPath?: string, suggestedExtension?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  createItem: (path: string, isDir: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteItem: (path: string) => Promise<{ success: boolean; error?: string }>;
  setFolderFocus: (folderPath: string | null) => Promise<any>;
  getFolderFocus: () => Promise<any>;
  getFolderContext: (folderPath: string) => Promise<any>;

  // AI chat and completions
  chat: (message: string, context: any) => Promise<{
    success: boolean;
    response?: string;
    error?: string;
    requestId?: string;
    reviewSessionId?: string;
    reviewChanges?: AgentReviewChange[];
    reviewVerification?: AgentReviewVerificationState;
    runtime?: AIRuntimeSnapshot;
    [key: string]: any;
  }>;
  quickAction: (action: string, code: string, language?: string) => Promise<any>;
  aiStatus: () => Promise<({ success: true } & AIStatusSnapshot) | { success: false; error?: string }>;
  clearHistory: (mode?: 'agent' | 'chat' | 'dino') => Promise<any>;
  getChatHistory: (mode?: 'agent' | 'chat' | 'dino') => Promise<any>;
  getChatHistoryForSession: (sessionId: string) => Promise<any>;
  getCurrentAgentSessionId: () => Promise<any>;
  summarizeConversation: () => Promise<any>;

  requestCompletion: (context: any) => Promise<any>;
  prewarmCompletions: () => Promise<any>;
  getCurrentFilePath: () => Promise<string | null>;
  setActiveFilePath: (filePath: string | null) => void;
  getSemanticContext: (query: any) => Promise<any>;
  searchRelevantFiles: (query: string, topK?: number) => Promise<any>;
  trackEvent: (event: string, data: any) => Promise<any>;

  // Streaming and command events
  onChatStream: (callback: (data: any) => void) => void;
  removeChatStream: () => void;
  onCompletionPartial: (callback: (data: any) => void) => void;
  removeCompletionPartial: () => void;
  onChatActionResult: (callback: (data: any) => void) => void;
  removeChatActionResult: () => void;
  onCommandRequiresConfirmation: (callback: (data: any) => void) => void;
  removeCommandRequiresConfirmation: () => void;
  onCommandError: (callback: (data: any) => void) => void;
  removeCommandError: () => void;
  onModelSelectionInfo: (callback: (data: AIRuntimeSnapshot & { requestId?: string }) => void) => void;
  removeModelSelectionInfo: () => void;

  // Agent progress events
  onAgentTaskStart: (callback: (data: { task: string }) => void) => (() => void) | void;
  onAgentStepComplete: (callback: (data: { type: string; title: string; success: boolean }) => void) => (() => void) | void;
  onAgentFileModified: (callback: (data: { path: string; action: string; oldContent?: string; newContent?: string }) => void) => (() => void) | void;
  onAgentCritiqueComplete: (callback: (data: any) => void) => (() => void) | void;
  removeAgentListeners: () => void;

  // Generic listeners
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  removeListener: (channel: string) => void;

  // Git
  gitStatus: () => Promise<any>;
  gitCommit: (message: string) => Promise<any>;
  gitCommand: (command: string) => Promise<any>;
  gitDiff: (filePath?: string) => Promise<any>;
  gitStage: (filePath: string) => Promise<any>;
  gitUnstage: (filePath: string) => Promise<any>;
  gitPush: (remote?: string, branch?: string) => Promise<any>;
  gitPull: (remote?: string, branch?: string) => Promise<any>;
  gitBranches: () => Promise<any>;
  gitCheckout: (branch: string) => Promise<any>;
  gitCreateBranch: (branch: string) => Promise<any>;

  // Settings and provider management
  getSettings: () => Promise<Settings>;
  getStartupPreflightReport: () => Promise<StartupPreflightReport>;
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
  getProviderApiKeyStatuses: () => Promise<Record<string, ProviderApiKeyStatus>>;
  setProviderApiKey: (providerName: string, apiKey: string) => Promise<ProviderApiKeyStatus>;
  clearProviderApiKey: (providerName: string) => Promise<ProviderApiKeyStatus>;
  setTitleBarOverlay: (options: {
    color: string;
    symbolColor: string;
    height?: number;
  }) => Promise<void>;
  getProviders: () => Promise<any[]>;
  getProviderModels: (providerName: string) => Promise<any>;
  testProvider: (providerName: string) => Promise<any>;
  setActiveProvider: (providerName: string, model: string) => Promise<any>;
  configureProvider: (providerName: string, config: any) => Promise<any>;

  // Script and command execution
  runScript: (filePath: string) => Promise<any>;
  killScript: (pid: number) => Promise<any>;
  isRunnable: (filePath: string) => Promise<any>;
  onScriptOutput: (callback: (data: any) => void) => void;
  removeScriptOutput: () => void;
  onScriptExit: (callback: (data: any) => void) => void;
  removeScriptExit: () => void;
  onScriptError: (callback: (data: any) => void) => void;
  removeScriptError: () => void;
  runCommand: (command: string) => Promise<any>;

  executeCommand: (command: string) => Promise<any>;
  executeCommandPlan: (plan: any) => Promise<any>;
  isFileOperationCommand: (message: string) => Promise<boolean>;
  getCommandUndoHistory: () => Promise<any[]>;
  undoCommand: () => Promise<any>;

  // Agent tooling
  stopAgent: () => Promise<{ success: boolean; error?: string }>;
  listFiles: (path: string) => Promise<any>;
  agentReadFile: (path: string) => Promise<any>;
  agentWriteFile: (path: string, content: string) => Promise<any>;
  agentRunCommand: (command: string, cwd?: string, timeout?: number) => Promise<any>;
  agentSearchCodebase: (
    query: string,
    options?: { includePattern?: string; excludePattern?: string; maxResults?: number }
  ) => Promise<any>;
  applyDiff: (path: string, diff: string) => Promise<any>;
  terminalGetHistory: (
    id?: string,
    maxChars?: number
  ) => Promise<{ success: boolean; entries?: Array<{ id: string; title: string; cwd: string; history: string }>; combined?: string; error?: string }>;

  // Search and symbol navigation
  globalSearch: (query: string, options?: any) => Promise<any>;
  searchSymbols: (query: string, maxResults?: number) => Promise<any>;
  refreshSymbolIndex: () => Promise<{ success: boolean; error?: string }>;
  findDefinition: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => Promise<any>;
  findReferences: (params: { word: string; filePath?: string; workspacePath?: string; language?: string }) => Promise<any>;

  // Templates
  getTemplates: () => Promise<any>;
  getTemplate: (templateId: string) => Promise<any>;
  createFromTemplate: (templateId: string, targetDir: string, variables: any) => Promise<any>;
  selectDirectory: () => Promise<any>;

  // Plugins
  pluginsList: () => Promise<{ success: boolean; plugins?: any[]; error?: string }>;
  pluginsReload: (pluginId: string) => Promise<{ success: boolean; error?: string }>;
  pluginsExecute: (pluginId: string, command: string, payload?: any) => Promise<{ success: boolean; result?: any; error?: string }>;

  // Misc
  openExternal: (url: string) => Promise<any>;
  openUserGuide: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // Python brain integration (optional at runtime)
  brainAvailable: () => Promise<boolean>;
  brainRoute: (message: string, context?: any) => Promise<any>;
  brainRecordOutcome: (message: string, success: boolean, model?: string, steps?: number) => Promise<any>;
  brainStats: () => Promise<any>;

  // Telemetry
  telemetry?: {
    getStatus?: () => Promise<{ success: boolean; enabled?: boolean; sessionId?: string; installId?: string; error?: string }>;
    setEnabled?: (enabled: boolean) => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
    track?: (eventType: string, data?: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
    getStats?: () => Promise<{ success: boolean; stats?: TelemetryStats; error?: string }>;
    clearData?: () => Promise<{ success: boolean; error?: string }>;
    flush?: () => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    agentAPI: AgentAPI;
  }
}

export {};
