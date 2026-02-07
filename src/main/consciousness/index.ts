/**
 * Consciousness System - Matrix Mode Deep Understanding
 * 
 * Ported from ActivatePrime's unified consciousness architecture.
 * Makes Matrix mode understand intent on a deeper level.
 * 
 * Usage:
 * ```typescript
 * import { processWithConsciousness } from './consciousness';
 * 
 * const { state, injection } = await processWithConsciousness(
 *   userMessage,
 *   { projectFiles, conversationHistory }
 * );
 * 
 * // injection.contextString - add to system prompt
 * // injection.requirements - things to include
 * // injection.warnings - things to avoid
 * ```
 */

export * from './types';
export * from './intent-frame';
export * from './requirement-echo';
export { 
  IntentOrchestrator, 
  getIntentOrchestrator, 
  processWithConsciousness 
} from './intent-orchestrator';
