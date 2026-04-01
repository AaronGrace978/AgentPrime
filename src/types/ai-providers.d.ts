/**
 * AI Provider type definitions
 */

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  [key: string]: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type AIRuntimeResolution = 'direct' | 'demoted_to_ollama' | 'fallback_execution';

export interface AIRuntimeSelection {
  provider: string;
  model: string;
}

export interface AIRuntimeSnapshot {
  requestedProvider: string;
  requestedModel: string;
  effectiveProvider: string;
  effectiveModel: string;
  executionProvider?: string;
  executionModel?: string;
  displayProvider: string;
  displayModel: string;
  viaFallback: boolean;
  resolution: AIRuntimeResolution;
  reason?: string;
  lastExecutionAt?: number;
}

export interface AIStatusSnapshot {
  connected: boolean;
  dualModelEnabled: boolean;
  runtime: AIRuntimeSnapshot;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  num_predict?: number;
  stop?: string[];
  model?: string;
  stream?: boolean;
  tools?: Tool[];
  useAnthropicCompat?: boolean;
  disableRouterFallback?: boolean;
  [key: string]: any;
}

/**
 * Tool definition for function calling (Anthropic-compatible format)
 */
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool use block in response
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Text block in response
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * Content block (can be text or tool use)
 */
export type ContentBlock = TextBlock | ToolUseBlock;

/**
 * Tool result to send back to the model
 */
export interface ToolResultMessage {
  role: 'user';
  content: Array<{
    type: 'tool_result';
    tool_use_id: string;
    content: string;
  }>;
}

/**
 * Result from chat with tools
 */
export interface ChatWithToolsResult extends ChatResult {
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
  toolCalls?: ToolUseBlock[];
  contentBlocks?: ContentBlock[];
}

export interface ChatResult {
  success: boolean;
  content?: string;
  error?: string;
  servedBy?: {
    provider: string;
    model?: string;
    requestedProvider?: string;
    requestedModel?: string;
    viaFallback?: boolean;
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  dualModelInfo?: {
    mode: 'fast' | 'deep' | 'auto';
    runtimeBudget?: 'instant' | 'standard' | 'deep';
    analysis?: any;
  };
  modelSelection?: {
    provider: string;
    model: string;
    reasoning?: string;
    autoSelected?: boolean;
  };
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  configured: boolean;
  baseUrl?: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  [key: string]: any;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  error?: string;
}

export type StreamCallback = (chunk: StreamChunk) => void;

/**
 * Base provider interface that all providers must implement
 */
export interface IBaseProvider {
  name: string;
  displayName: string;
  config: ProviderConfig;
  apiKey: string | null;
  baseUrl: string | null;

  getModels(): Promise<ModelInfo[]>;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
  complete(prompt: string, options?: ChatOptions): Promise<ChatResult>;
  formatMessages(messages: ChatMessage[]): ChatMessage[];
  isConfigured(): boolean;
  getInfo(): ProviderInfo;
}
