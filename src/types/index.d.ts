/**
 * Core type definitions for AgentPrime
 */

import type { ProviderConfig } from './ai-providers';

export interface Settings {
  theme: string;
  themeId?: string; // New theme system (light, dark, midnight, ocean, etc.)
  fontSize: number;
  tabSize: number;
  wordWrap: 'on' | 'off' | 'wordWrapColumn';
  minimap: boolean;
  lineNumbers: 'on' | 'off' | 'relative';
  autoSave: boolean;
  inlineCompletions: boolean;
  dinoBuddyMode: boolean;
  activeProvider: string;
  activeModel: string;
  dualOllamaEnabled: boolean;
  useSpecializedAgents?: boolean; // Enable specialized agent architecture
  
  // Telemetry
  telemetryEnabled?: boolean; // Send anonymous usage data to help improve AgentPrime
  developerMode?: boolean; // Show additional debugging information
  
  // Security
  autoLockMinutes?: number; // Auto-lock screen after N minutes of inactivity (0 = disabled)
  
  // Window behavior
  confirmOnClose?: boolean; // Show confirmation dialog before closing (prevents accidental data loss)

  // Phase 2: Advanced Features
  collaboration?: {
    enabled: boolean;
    autoJoin: boolean;
    showPresence: boolean;
    realTimeCursors: boolean;
    realTimeSync?: boolean;
    autoSaveInterval?: number;
    conflictResolution?: 'manual' | 'automatic' | 'last-writer-wins';
  };
  plugins?: {
    enabled: boolean;
    autoUpdate: boolean;
    trustedSources: string[];
    allowPreRelease?: boolean;
    trustedOnly?: boolean;
  };
  system?: {
    distributedMode: boolean;
    scalingEnabled: boolean;
    memoryOptimization: boolean;
    performanceMonitoring: boolean;
    edgeAIEnabled?: boolean;
    autoScaling?: boolean;
    cloudSync?: boolean;
  };
  cloudSync?: {
    enabled: boolean;
    autoSync: boolean;
    conflictResolution: 'manual' | 'auto' | 'last-writer-wins';
  };
  edgeAI?: {
    enabled: boolean;
    localModels: string[];
    autoDeploy: boolean;
  };

  // Dual Model Configuration (like Cursor!)
  dualModelEnabled: boolean;
  dualModelConfig: DualModelConfig;
  
  // Web Search Configuration for Matrix Agent
  webSearch?: {
    tavilyApiKey?: string;  // Tavily API key (recommended for AI agents)
    braveApiKey?: string;   // Brave Search API key (alternative)
    enabled?: boolean;
    cacheResults?: boolean;
    maxResults?: number;
  };
  
  providers: {
    ollama?: ProviderConfig;
    ollamaSecondary?: ProviderConfig;
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    openrouter?: ProviderConfig;
  };
}

/**
 * Dual Model Configuration
 * Enables using two models simultaneously - one for fast responses, one for deep reasoning
 */
export interface DualModelConfig {
  // Fast model for quick responses and simple tasks
  fastModel: {
    provider: string;
    model: string;
    enabled: boolean;
  };
  // Deep model for complex reasoning, analysis, and debugging
  deepModel: {
    provider: string;
    model: string;
    enabled: boolean;
  };
  // Auto-routing: intelligently choose model based on task
  autoRoute: boolean;
  // Complexity threshold for auto-routing (1-10, higher = more uses deep model)
  complexityThreshold: number;
  // Keywords that trigger deep model
  deepModelTriggers: string[];
  // Keywords that trigger fast model
  fastModelTriggers: string[];
}

export interface FileTreeItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
  children?: FileTreeItem[];
}

export interface ChatContext {
  file_path?: string;
  selected_text?: string;
  file_content?: string;
  mentioned_files?: MentionedFile[];
  mentioned_symbols?: MentionedSymbol[];
  dino_buddy_mode?: boolean;
  focused_folder?: string | null;
  agent_mode?: boolean;
  use_agent_loop?: boolean;
  use_specialized_agents?: boolean; // Use specialized agent architecture
  specialized_mode?: boolean; // Alias for use_specialized_agents
  model?: string;
  // Dual Model System
  dual_mode?: 'fast' | 'deep' | 'auto';
  has_errors?: boolean;
  just_chat_mode?: boolean;
}

export interface MentionedFile {
  path: string;
  content: string;
}

export interface MentionedSymbol {
  type: string;
  name: string;
  file: string;
  line: number;
  context: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  requestId?: string;
  actionExecuted?: boolean;
  error?: string;
}

export interface ChatStreamChunk {
  requestId: string;
  chunk: string;
  done: boolean;
}

export interface AgentAction {
  id: string;
  type: string;
  filePath?: string;
  dirPath?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'rolled_back';
  diff?: string;
  content?: string;
  oldContent?: string;
}

export interface AgentState {
  pendingActions: AgentAction[];
  executedActions: AgentAction[];
  status: string;
}

export interface FileInfo {
  path: string;
  content: string;
  language: string;
  size: number;
  lines: number;
  error?: string;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  relativePath: string;
}

export interface GitStatus {
  success: boolean;
  branch?: string;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  deleted?: string[];
  error?: string;
}

export interface SymbolInfo {
  name: string;
  type: string;
  file: string;
  line: number;
  column?: number;
  context?: string;
  score?: number;
}

export interface CodebaseIndexStats {
  filesIndexed: number;
  symbolsFound: number;
  duration: number;
}

export interface MirrorPattern {
  id?: string;
  category?: string;
  pattern?: string;
  examples?: string[];
  confidence?: number;
  extractedFrom?: string;
  characteristics?: Record<string, any>;
  description?: string;
  // Additional properties used by mirror subsystem
  type?: string;
  source?: string;
  successRate?: number;
  useCount?: number;
  lastUsed?: number;
  created?: number;
  stepsCompleted?: number;
  metadata?: Record<string, any>;
  sourceType?: string;
  task?: string;
  evaluationScore?: number;
  timestamp?: number | string;
}

export interface MirrorMetrics {
  Q: number; // Question Quality (0-1)
  R: number; // Resistance (0-1, lower is better)
  E: number; // Experience diversity (0-1)
  /**
   * Current intelligence level (1.0 = baseline, max 10.0).
   * `intelligence` is an alias for backwards compatibility.
   */
  currentIntelligence?: number;
  /** @deprecated Use `currentIntelligence` instead */
  intelligence?: number;
  /** Rate of intelligence growth from last learning cycle */
  growthRate?: number;
}

export interface MirrorStats {
  totalPatterns: number;
  totalFeedbackLoops: number;
  lastUpdated: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  variables?: TemplateVariable[];
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  required?: boolean;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface FolderContext {
  path: string;
  fileCount: number;
  files: Array<{
    path: string;
    name: string;
    size: number;
    language?: string;
  }>;
}
