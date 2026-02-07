/**
 * Relationship Intelligence System
 * Matrix Agent's understanding of the user and trust dynamics
 * 
 * "The Matrix has you... and it remembers everything."
 * 
 * Usage:
 * ```typescript
 * import { 
 *   getRelationshipCore,
 *   checkActionAllowed,
 *   recordMatrixAction,
 *   getMatrixGreeting
 * } from './relationship';
 * 
 * // Get the greeting
 * const greeting = getMatrixGreeting();
 * 
 * // Check if an action is allowed
 * const result = checkActionAllowed('Open Chrome and navigate to youtube.com', 'open_url');
 * if (result.requiresConfirmation) {
 *   // Ask user
 * }
 * 
 * // Record the action result
 * recordMatrixAction(userMessage, action, 'open_url', true, 'positive');
 * ```
 */

// Types
export * from './types';

// Components
export { getUserProfileManager, UserProfileManager } from './user-profile';
export { getActionGuardrails, ActionGuardrails } from './action-guardrails';
export { getMoodAwareness, MoodAwareness } from './mood-awareness';

// Persona
export {
  MATRIX_PERSONA,
  getGreeting,
  getSignoff,
  checkEasterEgg,
  getResponseStyleHint,
  getTrustPersonaDescription,
  formatConfirmation,
  announceAction,
  getPersonaContext,
  getTrustLevelDisplay
} from './matrix-persona';

// Core
export {
  RelationshipCore,
  getRelationshipCore,
  checkActionAllowed,
  recordMatrixAction,
  getMatrixGreeting,
  getMatrixPersonaContext
} from './relationship-core';
