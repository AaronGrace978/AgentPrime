/**
 * UserProfile - Learning and remembering the user
 * 
 * "I've been watching you, Neo. And I must say, you've grown."
 */

import * as fs from 'fs';
import * as path from 'path';
import type { 
  UserProfile, 
  UserPreference, 
  InteractionMemory, 
  TrustLevel,
  UserMood 
} from './types';
import { TrustLevel as TL } from './types';

const DATA_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'AgentPrime', 'relationship');
const PROFILE_FILE = path.join(DATA_DIR, 'user-profile.json');
const INTERACTIONS_FILE = path.join(DATA_DIR, 'interactions.json');

/**
 * UserProfileManager - Learns and remembers user preferences
 */
export class UserProfileManager {
  private profile: UserProfile;
  private interactions: InteractionMemory[] = [];
  private maxInteractions = 500;  // Keep last 500 interactions
  
  constructor() {
    this.ensureDataDir();
    this.profile = this.loadProfile();
    this.interactions = this.loadInteractions();
    
    console.log(`🧠 [Matrix] User profile loaded: Trust Level ${this.getTrustLevelName(this.profile.trustLevel)} (${this.profile.trustScore}/100)`);
  }

  /**
   * Get trust level name for display
   */
  private getTrustLevelName(level: TrustLevel): string {
    switch (level) {
      case TL.GUARDIAN: return 'Guardian';
      case TL.OPERATOR: return 'Operator';
      case TL.ARCHITECT: return 'Architect';
      case TL.NEO: return 'Neo';
      default: return 'Unknown';
    }
  }

  /**
   * Create default profile for new users
   */
  private createDefaultProfile(): UserProfile {
    return {
      id: `user_${Date.now()}`,
      trustLevel: TL.GUARDIAN,  // Start at lowest trust
      trustScore: 10,
      currentMood: 'unknown',
      preferences: [],
      interactionCount: 0,
      successfulActions: 0,
      failedActions: 0,
      lastInteraction: new Date(),
      createdAt: new Date(),
      humorTolerance: 0.5,
      verbosityPreference: 0.5,
      autonomyComfort: 0.3
    };
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Load profile from disk
   */
  private loadProfile(): UserProfile {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
        // Convert dates
        data.lastInteraction = new Date(data.lastInteraction);
        data.createdAt = new Date(data.createdAt);
        data.preferences = (data.preferences || []).map((p: any) => ({
          ...p,
          learnedAt: new Date(p.learnedAt)
        }));
        return data;
      }
    } catch (error) {
      console.warn('[Matrix] Could not load profile, creating new one');
    }
    return this.createDefaultProfile();
  }

  /**
   * Save profile to disk
   */
  private saveProfile(): void {
    try {
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(this.profile, null, 2));
    } catch (error) {
      console.error('[Matrix] Failed to save profile:', error);
    }
  }

  /**
   * Load interactions from disk
   */
  private loadInteractions(): InteractionMemory[] {
    try {
      if (fs.existsSync(INTERACTIONS_FILE)) {
        const data = JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8'));
        return data.map((i: any) => ({
          ...i,
          timestamp: new Date(i.timestamp)
        }));
      }
    } catch (error) {
      console.warn('[Matrix] Could not load interactions');
    }
    return [];
  }

  /**
   * Save interactions to disk
   */
  private saveInteractions(): void {
    try {
      // Keep only recent interactions
      const toSave = this.interactions.slice(-this.maxInteractions);
      fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(toSave, null, 2));
    } catch (error) {
      console.error('[Matrix] Failed to save interactions:', error);
    }
  }

  /**
   * Get current profile
   */
  getProfile(): UserProfile {
    return { ...this.profile };
  }

  /**
   * Get trust level
   */
  getTrustLevel(): TrustLevel {
    return this.profile.trustLevel;
  }

  /**
   * Get trust score (0-100)
   */
  getTrustScore(): number {
    return this.profile.trustScore;
  }

  /**
   * Record an interaction
   */
  recordInteraction(
    userMessage: string,
    matrixAction: string,
    actionType: string,
    wasSuccessful: boolean,
    userReaction?: 'positive' | 'negative' | 'neutral'
  ): void {
    // Calculate trust delta
    let trustDelta = 0;
    if (wasSuccessful) {
      trustDelta = userReaction === 'positive' ? 2 : 1;
    } else {
      trustDelta = userReaction === 'negative' ? -3 : -1;
    }

    const interaction: InteractionMemory = {
      id: `int_${Date.now()}`,
      timestamp: new Date(),
      userMessage,
      matrixAction,
      actionType,
      wasSuccessful,
      userReaction,
      trustDelta,
      mood: this.profile.currentMood
    };

    this.interactions.push(interaction);
    
    // Update profile
    this.profile.interactionCount++;
    this.profile.lastInteraction = new Date();
    
    if (wasSuccessful) {
      this.profile.successfulActions++;
    } else {
      this.profile.failedActions++;
    }

    // Update trust score
    this.updateTrustScore(trustDelta);
    
    // Learn preferences from interaction
    this.learnFromInteraction(userMessage, matrixAction, wasSuccessful, userReaction);

    this.saveProfile();
    this.saveInteractions();
  }

  /**
   * Update trust score and potentially level
   */
  private updateTrustScore(delta: number): void {
    this.profile.trustScore = Math.max(0, Math.min(100, this.profile.trustScore + delta));
    
    // Update trust level based on score
    if (this.profile.trustScore >= 80) {
      this.profile.trustLevel = TL.NEO;
    } else if (this.profile.trustScore >= 50) {
      this.profile.trustLevel = TL.ARCHITECT;
    } else if (this.profile.trustScore >= 25) {
      this.profile.trustLevel = TL.OPERATOR;
    } else {
      this.profile.trustLevel = TL.GUARDIAN;
    }
  }

  /**
   * Learn preferences from interactions
   */
  private learnFromInteraction(
    userMessage: string,
    matrixAction: string,
    wasSuccessful: boolean,
    userReaction?: 'positive' | 'negative' | 'neutral'
  ): void {
    const messageLower = userMessage.toLowerCase();

    // Learn humor tolerance
    if (messageLower.includes('lol') || messageLower.includes('haha') || messageLower.includes(':d') || messageLower.includes('funny')) {
      this.profile.humorTolerance = Math.min(1, this.profile.humorTolerance + 0.05);
    }
    if (messageLower.includes('serious') || messageLower.includes('stop') || messageLower.includes('focus')) {
      this.profile.humorTolerance = Math.max(0, this.profile.humorTolerance - 0.05);
    }

    // Learn verbosity preference
    if (messageLower.includes('explain') || messageLower.includes('detail') || messageLower.includes('why')) {
      this.profile.verbosityPreference = Math.min(1, this.profile.verbosityPreference + 0.03);
    }
    if (messageLower.includes('quick') || messageLower.includes('fast') || messageLower.includes('just do')) {
      this.profile.verbosityPreference = Math.max(0, this.profile.verbosityPreference - 0.03);
    }

    // Learn autonomy comfort
    if (wasSuccessful && userReaction === 'positive') {
      this.profile.autonomyComfort = Math.min(1, this.profile.autonomyComfort + 0.02);
    }
    if (!wasSuccessful || userReaction === 'negative') {
      this.profile.autonomyComfort = Math.max(0, this.profile.autonomyComfort - 0.03);
    }

    // Store specific preferences
    if (messageLower.includes('always') || messageLower.includes('prefer') || messageLower.includes('like when')) {
      this.addPreference('stated_preference', userMessage, 0.9, userMessage);
    }
  }

  /**
   * Add or update a preference
   */
  addPreference(key: string, value: any, confidence: number, source: string): void {
    const existing = this.profile.preferences.find(p => p.key === key && p.value === value);
    
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.usageCount++;
    } else {
      this.profile.preferences.push({
        key,
        value,
        confidence,
        learnedFrom: source,
        learnedAt: new Date(),
        usageCount: 1
      });
    }

    // Keep preferences list manageable
    if (this.profile.preferences.length > 100) {
      // Remove lowest confidence preferences
      this.profile.preferences.sort((a, b) => b.confidence - a.confidence);
      this.profile.preferences = this.profile.preferences.slice(0, 100);
    }

    this.saveProfile();
  }

  /**
   * Get preference by key
   */
  getPreference(key: string): UserPreference | undefined {
    return this.profile.preferences.find(p => p.key === key);
  }

  /**
   * Update user mood
   */
  setMood(mood: UserMood): void {
    this.profile.currentMood = mood;
    this.saveProfile();
  }

  /**
   * Get current mood
   */
  getMood(): UserMood {
    return this.profile.currentMood;
  }

  /**
   * Get recent interactions
   */
  getRecentInteractions(count: number = 20): InteractionMemory[] {
    return this.interactions.slice(-count);
  }

  /**
   * Get interaction patterns for an action type
   */
  getActionHistory(actionType: string): InteractionMemory[] {
    return this.interactions.filter(i => i.actionType === actionType);
  }

  /**
   * Check if user has previously approved this type of action
   */
  hasApprovedActionType(actionType: string): boolean {
    const history = this.getActionHistory(actionType);
    const successfulCount = history.filter(i => i.wasSuccessful && i.userReaction !== 'negative').length;
    return successfulCount >= 3; // Approved at least 3 times before
  }

  /**
   * Get profile summary for prompt injection
   */
  getProfileSummary(): string {
    const level = this.getTrustLevelName(this.profile.trustLevel);
    const successRate = this.profile.interactionCount > 0 
      ? Math.round((this.profile.successfulActions / this.profile.interactionCount) * 100)
      : 0;
    
    let summary = `Trust: ${level} (${this.profile.trustScore}/100), Success rate: ${successRate}%`;
    
    if (this.profile.humorTolerance > 0.7) {
      summary += ', Enjoys humor';
    } else if (this.profile.humorTolerance < 0.3) {
      summary += ', Prefers serious tone';
    }
    
    if (this.profile.verbosityPreference > 0.7) {
      summary += ', Likes detailed explanations';
    } else if (this.profile.verbosityPreference < 0.3) {
      summary += ', Prefers concise responses';
    }
    
    return summary;
  }

  /**
   * Manually boost trust (for testing or admin)
   */
  boostTrust(amount: number): void {
    this.updateTrustScore(amount);
    this.saveProfile();
  }

  /**
   * Reset profile (dangerous!)
   */
  resetProfile(): void {
    this.profile = this.createDefaultProfile();
    this.interactions = [];
    this.saveProfile();
    this.saveInteractions();
  }
}

// Singleton
let _profileManager: UserProfileManager | null = null;

export function getUserProfileManager(): UserProfileManager {
  if (!_profileManager) {
    _profileManager = new UserProfileManager();
  }
  return _profileManager;
}
