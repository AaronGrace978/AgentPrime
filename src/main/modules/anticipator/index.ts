/**
 * Anticipator - Pattern Learning & Predictive Actions
 * 
 * Learns from user behavior to anticipate what they'll want next.
 * 
 * Features:
 * - Action sequence learning ("open Chrome" often followed by "check email")
 * - Time-based patterns ("every morning, check calendar")
 * - Context awareness (different patterns at work vs home)
 * - Proactive suggestions
 * - Pattern persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  ActionPattern,
  PatternTrigger,
  PatternContext,
  Prediction,
  PredictionSet,
  ActionHistory,
  AnticipatorConfig,
  DEFAULT_ANTICIPATOR_CONFIG,
  getTimeOfDay,
  getDayOfWeek
} from './types';

// Re-export types
export * from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// ANTICIPATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class Anticipator {
  private config: AnticipatorConfig;
  private patterns: Map<string, ActionPattern> = new Map();
  private history: ActionHistory[] = [];
  private lastPredictions: PredictionSet | null = null;
  private initialized: boolean = false;
  
  constructor(config: Partial<AnticipatorConfig> = {}) {
    this.config = { ...DEFAULT_ANTICIPATOR_CONFIG, ...config };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (this.config.persistPatterns) {
      await this.loadPatterns();
    }
    
    this.initialized = true;
    console.log(`[Anticipator] Initialized with ${this.patterns.size} patterns`);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LEARNING
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Record an action - this is how the Anticipator learns
   */
  recordAction(action: string, params: Record<string, any> = {}, success: boolean = true): void {
    const now = Date.now();
    
    // Add to history
    this.history.push({
      action,
      params,
      timestamp: now,
      success
    });
    
    // Trim history if too long
    if (this.history.length > this.config.historySize) {
      this.history = this.history.slice(-this.config.historySize);
    }
    
    // Learn from history
    this.learnPatterns();
    
    // Decay old patterns
    this.decayPatterns();
    
    // Persist if enabled
    if (this.config.persistPatterns) {
      this.savePatterns();
    }
  }
  
  /**
   * Learn patterns from recent history
   */
  private learnPatterns(): void {
    if (this.history.length < 2) return;
    
    const recentHistory = this.history.slice(-20);  // Last 20 actions
    
    // Learn sequential patterns (A -> B)
    for (let i = 0; i < recentHistory.length - 1; i++) {
      const current = recentHistory[i];
      const next = recentHistory[i + 1];
      
      // Only learn from successful actions close in time (within 5 minutes)
      if (!current.success || !next.success) continue;
      if (next.timestamp - current.timestamp > 5 * 60 * 1000) continue;
      
      this.updateOrCreatePattern({
        triggerType: 'action',
        triggerValue: current.action,
        followAction: next.action,
        params: next.params,
        context: {
          timeOfDay: getTimeOfDay(),
          dayOfWeek: [getDayOfWeek()]
        }
      });
    }
    
    // Learn time-based patterns
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    const lastAction = recentHistory[recentHistory.length - 1];
    
    if (lastAction.success) {
      const timePatternId = `time_${timeOfDay}_${lastAction.action}`;
      
      if (this.patterns.has(timePatternId)) {
        const pattern = this.patterns.get(timePatternId)!;
        pattern.occurrences++;
        pattern.confidence = Math.min(1, pattern.confidence + this.config.learningRate);
        pattern.lastSeen = Date.now();
        
        // Update day of week context
        if (pattern.context?.dayOfWeek && !pattern.context.dayOfWeek.includes(dayOfWeek)) {
          pattern.context.dayOfWeek.push(dayOfWeek);
        }
      } else {
        const pattern: ActionPattern = {
          id: timePatternId,
          trigger: { type: 'time', value: timeOfDay },
          actions: [lastAction.action],
          params: lastAction.params,
          confidence: 0.3,
          occurrences: 1,
          lastSeen: Date.now(),
          context: { timeOfDay, dayOfWeek: [dayOfWeek] }
        };
        this.patterns.set(timePatternId, pattern);
      }
    }
  }
  
  /**
   * Update or create a sequential pattern
   */
  private updateOrCreatePattern(info: {
    triggerType: 'action' | 'time';
    triggerValue: string;
    followAction: string;
    params?: Record<string, any>;
    context?: PatternContext;
  }): void {
    const patternId = `${info.triggerType}_${info.triggerValue}_${info.followAction}`;
    
    if (this.patterns.has(patternId)) {
      const pattern = this.patterns.get(patternId)!;
      pattern.occurrences++;
      pattern.confidence = Math.min(1, pattern.confidence + this.config.learningRate);
      pattern.lastSeen = Date.now();
      
      // Merge context
      if (info.context && pattern.context) {
        if (info.context.dayOfWeek) {
          const days = new Set([...(pattern.context.dayOfWeek || []), ...info.context.dayOfWeek]);
          pattern.context.dayOfWeek = Array.from(days);
        }
      }
    } else {
      const pattern: ActionPattern = {
        id: patternId,
        trigger: { type: info.triggerType, value: info.triggerValue },
        actions: [info.followAction],
        params: info.params,
        confidence: 0.3,
        occurrences: 1,
        lastSeen: Date.now(),
        context: info.context
      };
      this.patterns.set(patternId, pattern);
    }
  }
  
  /**
   * Decay patterns that haven't been seen recently
   */
  private decayPatterns(): void {
    const now = Date.now();
    const weekInMs = 7 * 24 * 60 * 60 * 1000;
    
    for (const [id, pattern] of this.patterns) {
      const age = now - pattern.lastSeen;
      
      // Decay confidence based on age
      if (age > weekInMs) {
        pattern.confidence *= (1 - this.config.decayRate);
        
        // Remove patterns that have decayed too much
        if (pattern.confidence < 0.1 || pattern.occurrences < this.config.minOccurrences) {
          this.patterns.delete(id);
        }
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PREDICTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get predictions for what the user might want next
   */
  predict(context?: { lastAction?: string; activeApp?: string }): PredictionSet {
    const predictions: Prediction[] = [];
    const now = Date.now();
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    
    // Check cached predictions
    if (this.lastPredictions && now - this.lastPredictions.timestamp < 30000) {
      return this.lastPredictions;
    }
    
    // Get last action from history if not provided
    const lastAction = context?.lastAction || this.history[this.history.length - 1]?.action;
    
    // Find matching patterns
    for (const pattern of this.patterns.values()) {
      if (pattern.confidence < this.config.minConfidence) continue;
      if (pattern.occurrences < this.config.minOccurrences) continue;
      
      let matchScore = 0;
      let reasoning = '';
      
      // Check trigger match
      if (pattern.trigger.type === 'action' && pattern.trigger.value === lastAction) {
        matchScore += 0.5;
        reasoning = `Often follows "${lastAction}"`;
      }
      
      if (pattern.trigger.type === 'time' && pattern.trigger.value === timeOfDay) {
        matchScore += 0.3;
        reasoning = `Typical for ${timeOfDay}`;
      }
      
      // Check context match
      if (pattern.context) {
        if (pattern.context.timeOfDay === timeOfDay) {
          matchScore += 0.1;
        }
        if (pattern.context.dayOfWeek?.includes(dayOfWeek)) {
          matchScore += 0.1;
        }
      }
      
      // Add prediction if match is good enough
      if (matchScore > 0) {
        for (const action of pattern.actions) {
          const existingPred = predictions.find(p => p.action === action);
          const finalConfidence = pattern.confidence * matchScore;
          
          if (existingPred) {
            // Boost existing prediction
            existingPred.confidence = Math.max(existingPred.confidence, finalConfidence);
          } else {
            predictions.push({
              action,
              params: pattern.params,
              confidence: finalConfidence,
              reasoning,
              pattern,
              expiresAt: now + this.config.predictionTTL
            });
          }
        }
      }
    }
    
    // Sort by confidence and limit
    predictions.sort((a, b) => b.confidence - a.confidence);
    const topPredictions = predictions.slice(0, this.config.maxPredictions);
    
    const result: PredictionSet = {
      predictions: topPredictions,
      timestamp: now,
      context: {
        timeOfDay,
        lastAction,
        activeApp: context?.activeApp
      }
    };
    
    this.lastPredictions = result;
    return result;
  }
  
  /**
   * Get the top prediction (if confident enough)
   */
  getTopPrediction(): Prediction | null {
    const predictions = this.predict();
    const top = predictions.predictions[0];
    
    if (top && top.confidence >= this.config.minConfidence) {
      return top;
    }
    
    return null;
  }
  
  /**
   * Check if a specific action is predicted
   */
  isPredicted(action: string): boolean {
    const predictions = this.predict();
    return predictions.predictions.some(p => p.action === action);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PROACTIVE SUGGESTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get proactive suggestions based on time and context
   */
  getSuggestions(): Array<{ action: string; reason: string; confidence: number }> {
    const suggestions: Array<{ action: string; reason: string; confidence: number }> = [];
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    
    // Find time-based patterns with high confidence
    for (const pattern of this.patterns.values()) {
      if (pattern.trigger.type !== 'time') continue;
      if (pattern.confidence < this.config.minConfidence) continue;
      if (pattern.occurrences < this.config.minOccurrences) continue;
      
      // Check if this time pattern applies now
      if (pattern.context?.timeOfDay === timeOfDay) {
        if (!pattern.context.dayOfWeek || pattern.context.dayOfWeek.includes(dayOfWeek)) {
          for (const action of pattern.actions) {
            suggestions.push({
              action,
              reason: `You usually do this in the ${timeOfDay}`,
              confidence: pattern.confidence
            });
          }
        }
      }
    }
    
    // Sort and dedupe
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const seen = new Set<string>();
    return suggestions.filter(s => {
      if (seen.has(s.action)) return false;
      seen.add(s.action);
      return true;
    }).slice(0, 5);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────────
  
  private getDataPath(): string {
    // Handle both Electron and test environments
    let userDataPath: string;
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      // Fallback for test environments
      userDataPath = path.join(process.cwd(), 'data');
      // Ensure directory exists
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
    }
    return path.join(userDataPath, this.config.patternsFile);
  }
  
  private async loadPatterns(): Promise<void> {
    try {
      const filePath = this.getDataPath();
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (parsed.patterns) {
          this.patterns = new Map(Object.entries(parsed.patterns));
          console.log(`[Anticipator] Loaded ${this.patterns.size} patterns from disk`);
        }
        
        if (parsed.history) {
          this.history = parsed.history;
        }
      }
    } catch (error) {
      console.error('[Anticipator] Failed to load patterns:', error);
    }
  }
  
  private async savePatterns(): Promise<void> {
    try {
      const filePath = this.getDataPath();
      
      const data = {
        patterns: Object.fromEntries(this.patterns),
        history: this.history.slice(-100),  // Only persist last 100
        savedAt: Date.now()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Anticipator] Failed to save patterns:', error);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS & DEBUG
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get Anticipator status
   */
  getStatus(): {
    enabled: boolean;
    patternsCount: number;
    historySize: number;
    topPatterns: Array<{ action: string; confidence: number; occurrences: number }>;
  } {
    const patterns = Array.from(this.patterns.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(p => ({
        action: p.actions[0],
        confidence: p.confidence,
        occurrences: p.occurrences
      }));
    
    return {
      enabled: this.config.enabled,
      patternsCount: this.patterns.size,
      historySize: this.history.length,
      topPatterns: patterns
    };
  }
  
  /**
   * Clear all learned patterns
   */
  clearPatterns(): void {
    this.patterns.clear();
    this.history = [];
    this.lastPredictions = null;
    
    if (this.config.persistPatterns) {
      try {
        const filePath = this.getDataPath();
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        // Ignore
      }
    }
    
    console.log('[Anticipator] Patterns cleared');
  }
  
  /**
   * Enable/disable the Anticipator
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[Anticipator] ${enabled ? 'Enabled' : 'Disabled'}`);
  }
  
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let anticipatorInstance: Anticipator | null = null;

/**
 * Get or create Anticipator instance
 */
export function getAnticipator(config?: Partial<AnticipatorConfig>): Anticipator {
  if (!anticipatorInstance) {
    anticipatorInstance = new Anticipator(config);
  }
  return anticipatorInstance;
}

/**
 * Initialize Anticipator (loads patterns from disk)
 */
export async function initializeAnticipator(config?: Partial<AnticipatorConfig>): Promise<Anticipator> {
  const anticipator = getAnticipator(config);
  await anticipator.initialize();
  return anticipator;
}

export default Anticipator;
