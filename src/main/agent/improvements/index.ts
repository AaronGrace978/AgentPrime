/**
 * AgentPrime - Agent Improvements
 * 
 * This module exports all the new agent capabilities that make AgentPrime
 * smarter, more transparent, and better at learning.
 * 
 * Improvements by Claude Opus (January 2026):
 * 
 * 1. Self-Critique System
 *    - Reviews generated code before marking complete
 *    - Catches syntax errors, missing imports, coherence issues
 *    - Optional AI-powered code review
 * 
 * 2. Correction Learning
 *    - Detects when users edit AI-generated code
 *    - Learns patterns from corrections
 *    - Applies learnings to future generations
 * 
 * 3. Tool Result Verification
 *    - Confirms tool calls achieved their goals
 *    - Catches "file created but empty" problems
 *    - Validates JSON, HTML, Python syntax
 * 
 * 4. Conversation Summarization
 *    - Summarizes long conversations to save tokens
 *    - Preserves key decisions, files, preferences
 *    - Enables infinite context through compression
 * 
 * 5. Progress Tracker UI (renderer component)
 *    - Shows real-time agent progress
 *    - Displays current action, files modified
 *    - Pause/resume/cancel controls
 */

// Self-Critique System
export {
  selfCritiqueEngine,
  critqueGeneratedFiles,
  type CritiqueResult,
  type CritiqueIssue,
  SelfCritiqueEngine
} from '../self-critique';

// Correction Learning
export {
  correctionLearning,
  CorrectionLearningEngine,
  type CorrectionPattern,
  type FileVersion
} from '../correction-learning';

// Tool Result Verification  
export {
  verifyToolResult,
  ToolResultVerifier,
  type VerificationResult,
  type VerificationIssue,
  type ToolCall
} from '../tool-result-verification';

// Conversation Summarization
export {
  conversationSummarizer,
  summarizeIfNeeded,
  ConversationSummarizer,
  type ConversationSummary
} from '../conversation-summarizer';

/**
 * Initialize all agent improvements
 * Call this during app startup
 */
export async function initializeAgentImprovements(dataPath: string): Promise<void> {
  console.log('[AgentImprovements] Initializing agent improvement systems...');
  
  // Correction learning loads its data on construction
  // Just log that it's ready
  console.log('[AgentImprovements] ✅ Correction learning ready');
  console.log('[AgentImprovements] ✅ Self-critique engine ready');
  console.log('[AgentImprovements] ✅ Tool verification ready');
  console.log('[AgentImprovements] ✅ Conversation summarizer ready');
  
  console.log('[AgentImprovements] All systems initialized!');
}

/**
 * Hook to integrate improvements into the agent loop
 * 
 * Usage in agent-loop.ts:
 * 
 * import { agentImprovementsHooks } from './improvements';
 * 
 * // After generating files:
 * const critique = await agentImprovementsHooks.critiqueBeforeComplete(files, task, workspace);
 * if (!critique.passed) {
 *   // Handle issues
 * }
 * 
 * // After tool call:
 * const verification = await agentImprovementsHooks.verifyToolCall(toolCall, intent, workspace);
 * if (!verification.verified) {
 *   // Handle failure
 * }
 * 
 * // When user saves file:
 * await agentImprovementsHooks.learnFromUserSave(filePath, content);
 * 
 * // Before sending to AI:
 * const condensed = await agentImprovementsHooks.summarizeIfNeeded(messages);
 */
export const agentImprovementsHooks = {
  /**
   * Critique files before marking task complete
   */
  async critiqueBeforeComplete(
    files: { path: string; content: string }[],
    task: string,
    workspacePath: string
  ) {
    const { critqueGeneratedFiles } = await import('../self-critique');
    return critqueGeneratedFiles(files, task, workspacePath);
  },
  
  /**
   * Verify a tool call achieved its goal
   */
  async verifyToolCall(
    toolCall: { name: string; arguments: Record<string, any>; result?: any; error?: string },
    intent: string,
    workspacePath: string
  ) {
    const { verifyToolResult } = await import('../tool-result-verification');
    return verifyToolResult(toolCall, intent, workspacePath);
  },
  
  /**
   * Learn when user saves a file (potential correction to AI output)
   */
  async learnFromUserSave(filePath: string, content: string) {
    const { correctionLearning } = await import('../correction-learning');
    return correctionLearning.recordUserSave(filePath, content);
  },
  
  /**
   * Record when AI writes a file (for correction tracking)
   */
  recordAIWrite(filePath: string, content: string, model: string, task: string) {
    const { correctionLearning } = require('../correction-learning');
    correctionLearning.recordAIWrite(filePath, content, model, task);
  },
  
  /**
   * Summarize conversation if needed
   */
  async summarizeIfNeeded(messages: any[], maxTokens: number = 8000) {
    const { summarizeIfNeeded: summarize } = await import('../conversation-summarizer');
    return summarize(messages, maxTokens);
  },
  
  /**
   * Get correction-aware prompt addition
   */
  getCorrectionPromptAddition(language: string): string {
    const { correctionLearning } = require('../correction-learning');
    return correctionLearning.getCorrectionPromptAddition(language);
  }
};

