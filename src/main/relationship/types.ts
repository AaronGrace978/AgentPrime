/**
 * Relationship Intelligence Types
 * Matrix Agent's understanding of the user and trust dynamics
 * 
 * "The Matrix has you... and it remembers."
 */

/**
 * Trust levels that Matrix earns over time
 */
export enum TrustLevel {
  GUARDIAN = 1,    // Always ask before any action - new relationship
  OPERATOR = 2,    // Auto-execute safe actions, ask for risky ones
  ARCHITECT = 3,   // Full autonomy for known patterns, ask for new
  NEO = 4          // "Do what you think is best" - earned through trust
}

/**
 * User mood/state detection
 */
export type UserMood = 
  | 'focused'      // Working hard, be efficient
  | 'playful'      // Having fun, can joke around
  | 'frustrated'   // Something's wrong, be helpful
  | 'exploratory'  // Learning, be educational
  | 'rushed'       // In a hurry, be fast
  | 'relaxed'      // No pressure, can be conversational
  | 'unknown';     // Can't tell

/**
 * Action risk classification
 */
export type ActionRisk = 
  | 'safe'         // Read-only, can always do
  | 'low'          // Minor changes, usually ok
  | 'medium'       // Significant actions, ask at low trust
  | 'high'         // Dangerous actions, always confirm at low trust
  | 'critical';    // Never auto-execute (delete files, credentials, etc)

/**
 * User preference tracking
 */
export interface UserPreference {
  key: string;
  value: any;
  confidence: number;     // 0-1, how sure we are
  learnedFrom: string;    // What interaction taught us this
  learnedAt: Date;
  usageCount: number;     // How many times we've applied this
}

/**
 * Interaction memory - what happened in past sessions
 */
export interface InteractionMemory {
  id: string;
  timestamp: Date;
  userMessage: string;
  matrixAction: string;
  actionType: string;
  wasSuccessful: boolean;
  userReaction?: 'positive' | 'negative' | 'neutral';
  trustDelta: number;     // How much trust changed (-1 to +1)
  mood?: UserMood;
}

/**
 * Action guardrail result
 */
export interface GuardrailResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
  riskLevel: ActionRisk;
  suggestedPrompt?: string;  // What to ask the user
}

/**
 * Complete user profile
 */
export interface UserProfile {
  id: string;
  name?: string;
  trustLevel: TrustLevel;
  trustScore: number;        // 0-100, more granular than level
  currentMood: UserMood;
  preferences: UserPreference[];
  interactionCount: number;
  successfulActions: number;
  failedActions: number;
  lastInteraction: Date;
  createdAt: Date;
  
  // Matrix-specific personality tuning
  humorTolerance: number;    // 0-1, how much they enjoy Matrix jokes
  verbosityPreference: number; // 0-1, how detailed they want responses
  autonomyComfort: number;   // 0-1, how comfortable with agent acting alone
}

/**
 * Relationship state - the full picture
 */
export interface RelationshipState {
  user: UserProfile;
  recentInteractions: InteractionMemory[];
  activeTrustFactors: string[];   // Current reasons for trust level
  currentSessionMood: UserMood;
  sessionStartedAt: Date;
  actionsThisSession: number;
  confirmationsAskedThisSession: number;
}

/**
 * Matrix persona configuration
 */
export interface MatrixPersona {
  // Core identity
  name: string;
  greeting: string;
  signoff: string;
  
  // Response style by mood
  responseStyle: {
    focused: string;
    playful: string;
    frustrated: string;
    exploratory: string;
    rushed: string;
    relaxed: string;
    unknown: string;
  };
  
  // Trust level personas
  trustPersona: {
    [TrustLevel.GUARDIAN]: string;
    [TrustLevel.OPERATOR]: string;
    [TrustLevel.ARCHITECT]: string;
    [TrustLevel.NEO]: string;
  };
  
  // Easter eggs and fun responses
  easterEggs: Map<string, string>;
}
