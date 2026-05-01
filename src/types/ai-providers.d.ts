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

export interface ProviderConnectionStatus {
  success: boolean;
  error?: string;
  models?: number;
}

export interface AIStatusSnapshot {
  provider: string;
  model: string;
  connected: boolean;
  reason?: string;
  connectionError?: string;
  availableModels?: number;
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
  /**
   * Optional AbortSignal to cancel the in-flight HTTP request.
   * Wired through to every provider's underlying transport so that calling
   * `controller.abort()` instantly tears down the request instead of waiting
   * for the next iteration boundary.
   */
  signal?: AbortSignal;
  /**
   * Inject Dino Buddy creed into the system prompt stream.
   * Keep this disabled for coding/tooling flows to avoid persona bleed.
   */
  includeCreed?: boolean;
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
 * Streaming chunk shape for tool-aware streaming (`streamWithTools`).
 *
 * Fired in roughly this order during a tool-using turn:
 *   1. Zero or more `{ type: 'text' }` chunks as tokens arrive.
 *   2. Zero or more `{ type: 'tool_use' }` chunks, one per fully assembled
 *      tool call, the moment the model finishes streaming its arguments.
 *   3. Exactly one terminal `{ type: 'done', result }` with the aggregated
 *      ChatWithToolsResult, OR `{ type: 'error', error }` on failure.
 *
 * Consumers can drive a live "thinking" UI off `text`, render tool-call
 * pills as soon as `tool_use` fires, and rely on the `done` event for the
 * canonical final shape (same one `chatWithTools` would have returned).
 */
export interface ToolStreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  toolCall?: ToolUseBlock;
  result?: ChatWithToolsResult;
  error?: string;
}

export type ToolStreamCallback = (chunk: ToolStreamChunk) => void;

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
  testConnection(): Promise<ProviderConnectionStatus>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], onChunk: StreamCallback, options?: ChatOptions): Promise<void>;
  complete(prompt: string, options?: ChatOptions): Promise<ChatResult>;
  formatMessages(messages: ChatMessage[]): ChatMessage[];
  isConfigured(): boolean;
  getInfo(): ProviderInfo;
  /**
   * Optional: stream a tool-using turn with live text deltas and tool-call
   * events. Providers that don't implement this can be wrapped at the router
   * layer to fall back to non-streaming `chatWithTools` + a single batch
   * emission, so callers can always treat the surface as available.
   */
  streamWithTools?(
    messages: ChatMessage[],
    tools: Tool[],
    onChunk: ToolStreamCallback,
    options?: ChatOptions
  ): Promise<ChatWithToolsResult>;
}
