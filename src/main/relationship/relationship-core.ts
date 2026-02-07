/**
 * RelationshipCore - The heart of Matrix Agent's relationship intelligence
 * 
 * "What is the Matrix? Control. The Matrix is a computer-generated dream world
 *  built to keep us under control... But now, it works for YOU."
 */

import type { 
  RelationshipState, 
  GuardrailResult, 
  UserMood,
  InteractionMemory 
} from './types';
import { TrustLevel } from './types';
import { getUserProfileManager, UserProfileManager } from './user-profile';
import { getActionGuardrails, ActionGuardrails } from './action-guardrails';
import { getMoodAwareness, MoodAwareness } from './mood-awareness';
import { 
  getGreeting, 
  getSignoff, 
  checkEasterEgg, 
  getPersonaContext,
  announceAction,
  formatConfirmation,
  getTrustLevelDisplay
} from './matrix-persona';

/**
 * RelationshipCore - Orchestrates all relationship intelligence
 */
export class RelationshipCore {
  private profileManager: UserProfileManager;
  private guardrails: ActionGuardrails;
  private moodAwareness: MoodAwareness;
  private sessionStartedAt: Date;
  private actionsThisSession: number = 0;
  private confirmationsAskedThisSession: number = 0;
  
  constructor() {
    this.profileManager = getUserProfileManager();
    this.guardrails = getActionGuardrails();
    this.moodAwareness = getMoodAwareness();
    this.sessionStartedAt = new Date();
    
    console.log('💚 [Matrix] Relationship core initialized');
    console.log(`   Trust: ${getTrustLevelDisplay(this.profileManager.getTrustLevel())}`);
    console.log(`   Score: ${this.profileManager.getTrustScore()}/100`);
  }

  /**
   * Process user message and update relationship state
   */
  processMessage(message: string): {
    mood: UserMood;
    easterEgg: string | null;
    shouldBePlayful: boolean;
    responseStyle: ReturnType<MoodAwareness['getResponseStyleRecommendation']>;
  } {
    // Detect mood
    const mood = this.moodAwareness.detectMood(message);
    this.profileManager.setMood(mood);
    
    // Check for easter eggs
    const easterEgg = checkEasterEgg(message);
    
    // Get response style recommendation
    const responseStyle = this.moodAwareness.getResponseStyleRecommendation();
    
    // Check if we should be playful
    const profile = this.profileManager.getProfile();
    const shouldBePlayful = this.moodAwareness.isHumorAppropriate() && profile.humorTolerance > 0.4;
    
    return {
      mood,
      easterEgg,
      shouldBePlayful,
      responseStyle
    };
  }

  /**
   * Check if an action is allowed
   */
  checkAction(action: string, actionType: string): GuardrailResult {
    const trustLevel = this.profileManager.getTrustLevel();
    const mood = this.moodAwareness.getCurrentMood();
    
    const result = this.guardrails.checkAction(action, actionType, trustLevel, mood);
    
    if (result.requiresConfirmation) {
      this.confirmationsAskedThisSession++;
    }
    
    return result;
  }

  /**
   * Record that an action was executed
   */
  recordAction(
    userMessage: string,
    action: string,
    actionType: string,
    wasSuccessful: boolean,
    userReaction?: 'positive' | 'negative' | 'neutral'
  ): void {
    this.actionsThisSession++;
    
    this.profileManager.recordInteraction(
      userMessage,
      action,
      actionType,
      wasSuccessful,
      userReaction
    );
    
    // Log significant trust changes
    const newTrust = this.profileManager.getTrustScore();
    console.log(`[Matrix] Action recorded: ${actionType} - ${wasSuccessful ? '✅' : '❌'} | Trust: ${newTrust}/100`);
  }

  /**
   * Get current relationship state
   */
  getState(): RelationshipState {
    const profile = this.profileManager.getProfile();
    const recentInteractions = this.profileManager.getRecentInteractions(10);
    
    // Determine active trust factors
    const activeTrustFactors: string[] = [];
    
    const successRate = profile.interactionCount > 0 
      ? profile.successfulActions / profile.interactionCount 
      : 0;
    
    if (successRate > 0.9) {
      activeTrustFactors.push('High success rate');
    }
    if (profile.interactionCount > 50) {
      activeTrustFactors.push('Established relationship');
    }
    if (profile.autonomyComfort > 0.7) {
      activeTrustFactors.push('User comfortable with autonomy');
    }
    if (this.confirmationsAskedThisSession === 0 && this.actionsThisSession > 5) {
      activeTrustFactors.push('Smooth session - no confirmations needed');
    }
    
    return {
      user: profile,
      recentInteractions,
      activeTrustFactors,
      currentSessionMood: this.moodAwareness.getCurrentMood(),
      sessionStartedAt: this.sessionStartedAt,
      actionsThisSession: this.actionsThisSession,
      confirmationsAskedThisSession: this.confirmationsAskedThisSession
    };
  }

  /**
   * Get greeting for this session
   */
  getGreeting(includeStatus: boolean = true): string {
    return getGreeting(includeStatus);
  }

  /**
   * Get signoff message
   */
  getSignoff(): string {
    return getSignoff();
  }

  /**
   * Announce an action in Matrix style
   */
  announceAction(action: string, actionType: string): string {
    return announceAction(action, actionType);
  }

  /**
   * Format a confirmation request
   */
  formatConfirmation(action: string, riskLevel: string, reason?: string): string {
    return formatConfirmation(action, riskLevel, reason);
  }

  /**
   * Get persona context for prompt injection
   */
  getPersonaContext(): string {
    return getPersonaContext();
  }

  /**
   * Check if we should ask for confirmation
   */
  shouldConfirm(actionType: string): boolean {
    const trustLevel = this.profileManager.getTrustLevel();
    
    // Neo level rarely needs confirmation
    if (trustLevel === TrustLevel.NEO) {
      return this.guardrails.isCriticalAction('', actionType);
    }
    
    // Check the action
    const result = this.guardrails.checkAction('', actionType, trustLevel);
    return result.requiresConfirmation;
  }

  /**
   * User approved an action - boost trust
   */
  onActionApproved(actionType: string): void {
    // Small trust boost for approved actions
    this.profileManager.boostTrust(0.5);
  }

  /**
   * User denied an action - record it
   */
  onActionDenied(actionType: string, reason?: string): void {
    // No trust penalty for denials - user is being cautious
    console.log(`[Matrix] Action denied: ${actionType}${reason ? ` - ${reason}` : ''}`);
  }

  /**
   * Emergency stop - user wants all actions halted
   */
  emergencyStop(): void {
    console.log('🛑 [Matrix] EMERGENCY STOP - User requested halt');
    // Don't penalize trust - emergency stops are valid
  }

  /**
   * Get trust level display
   */
  getTrustDisplay(): string {
    return getTrustLevelDisplay(this.profileManager.getTrustLevel());
  }

  /**
   * Get summary for status display
   */
  getStatusSummary(): {
    trustLevel: string;
    trustScore: number;
    mood: UserMood;
    actionsThisSession: number;
    confirmationsNeeded: number;
  } {
    return {
      trustLevel: this.getTrustDisplay(),
      trustScore: this.profileManager.getTrustScore(),
      mood: this.moodAwareness.getCurrentMood(),
      actionsThisSession: this.actionsThisSession,
      confirmationsNeeded: this.confirmationsAskedThisSession
    };
  }

  /**
   * Reset session (but keep persistent profile)
   */
  resetSession(): void {
    this.sessionStartedAt = new Date();
    this.actionsThisSession = 0;
    this.confirmationsAskedThisSession = 0;
    this.moodAwareness.reset();
  }

  /**
   * Get relationship context for injection into prompts
   */
  getRelationshipContextInjection(): string {
    const profile = this.profileManager.getProfile();
    const mood = this.moodAwareness.getCurrentMood();
    const responseStyle = this.moodAwareness.getResponseStyleRecommendation();
    
    let context = '## Relationship Context\n\n';
    
    context += `**Trust Level:** ${this.getTrustDisplay()} (${profile.trustScore}/100)\n`;
    context += `**User Mood:** ${mood}\n`;
    context += `**Session Actions:** ${this.actionsThisSession} (${this.confirmationsAskedThisSession} confirmations)\n\n`;
    
    context += `**Response Guidelines:**\n`;
    context += `- Verbosity: ${responseStyle.verbosity}\n`;
    context += `- Tone: ${responseStyle.tone}\n`;
    context += `- Pacing: ${responseStyle.pacing}\n`;
    context += `- Humor: ${responseStyle.humor ? 'Yes' : 'No'}\n\n`;
    
    if (profile.trustLevel === TrustLevel.GUARDIAN) {
      context += `**Note:** User is at Guardian trust level. Always ask before taking actions.\n`;
    } else if (profile.trustLevel === TrustLevel.NEO) {
      context += `**Note:** User has granted full autonomy. Act confidently but wisely.\n`;
    }
    
    return context;
  }
}

// ============================================================
// Singleton and exports
// ============================================================

let _relationshipCore: RelationshipCore | null = null;

export function getRelationshipCore(): RelationshipCore {
  if (!_relationshipCore) {
    _relationshipCore = new RelationshipCore();
  }
  return _relationshipCore;
}

/**
 * Quick access functions
 */
export function checkActionAllowed(action: string, actionType: string): GuardrailResult {
  return getRelationshipCore().checkAction(action, actionType);
}

export function recordMatrixAction(
  userMessage: string,
  action: string,
  actionType: string,
  wasSuccessful: boolean,
  userReaction?: 'positive' | 'negative' | 'neutral'
): void {
  getRelationshipCore().recordAction(userMessage, action, actionType, wasSuccessful, userReaction);
}

export function getMatrixGreeting(): string {
  return getRelationshipCore().getGreeting();
}

export function getMatrixPersonaContext(): string {
  return getRelationshipCore().getPersonaContext();
}
