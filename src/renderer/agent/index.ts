/**
 * Renderer-side agent utilities (context, memory, routing).
 * Workspace execution runs in the main process via `window.agentAPI.chat`.
 */

// Short-term memory
export {
  shortTermMemory,
  MemoryEntry,
  MemoryStats,
} from './shortTermMemory';

// Self-verification
export {
  verifyFileWrite,
  verifyChanges,
  verifySelectorConsistency,
  VerificationResult,
  VerificationCheck,
} from './selfVerification';

// Context management
export {
  contextManager,
  compressContext,
  buildOptimizedContext,
  ChatMessage,
  ContextConfig,
} from './contextManager';

// Smart routing
export {
  smartRouter,
  SmartRouter,
  analyzeTask,
  TaskAnalysis,
  TaskCategory,
  TaskContext,
} from './smartRouter';

export {
  promptBuilder,
  PromptBuilder,
  PromptContext,
  buildAgentRunContextPayload,
} from './promptBuilder';
export { toolSchemas, validateToolCall, ToolCall, AgentResponse } from './toolSchemas';
export { semanticContextBuilder } from './contextBuilder';
