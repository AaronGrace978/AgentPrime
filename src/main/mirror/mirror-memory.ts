/**
 * Opus Mirror Memory System
 * Stores and retrieves learned patterns with temporal awareness
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { MirrorPattern, MirrorMetrics, MirrorStats } from '../../types';
import { normalizeRetrievalTask } from './opus-example-loader';

/** Maximum patterns per category before pruning least-useful ones */
const MAX_PATTERNS_PER_CATEGORY = 500;

/** Maximum total patterns across all categories */
const MAX_TOTAL_PATTERNS = 2000;

/** Maximum stored feedback loops */
const MAX_FEEDBACK_LOOPS = 200;

interface FeedbackLoopEntry {
  loopId: string;
  task: string;
  duration?: number;
  finalImprovement?: number;
  lessonsLearned?: string[];
  iterations?: number;
  timestamp: number;
}

interface AdaptationEntry {
  task: string;
  patternsUsed: string[];
  success: boolean;
  timestamp: number;
}

interface MemoryData {
  version: string;
  lastUpdated: number | null;
  patterns: {
    architectural: MirrorPattern[];
    problemSolving: MirrorPattern[];
    reasoning: MirrorPattern[];
    style: MirrorPattern[];
    [key: string]: MirrorPattern[];
  };
  feedbackLoops: FeedbackLoopEntry[];
  intelligenceMetrics: MirrorMetrics;
  adaptationHistory: AdaptationEntry[];
}

export class MirrorMemory extends EventEmitter {
  private memoryPath: string;
  private memory: MemoryData;

  constructor(memoryPath?: string) {
    super(); // Initialize EventEmitter
    this.memoryPath = memoryPath || path.join(__dirname, 'data', 'mirror-memory.json');
    this.memory = {
      version: '1.1',
      lastUpdated: null,
      patterns: {
        architectural: [],
        problemSolving: [],
        reasoning: [],
        style: [],
        // Smart Mode pattern categories
        userPreferences: [],      // User's coding preferences and style
        smartEnhancements: [],    // Successful enhancements from Smart Mode
        antiPatterns: []          // Patterns to avoid (learned from failures)
      },
      feedbackLoops: [],
      intelligenceMetrics: {
        Q: 0.75,  // Question quality (0-1)
        R: 0.30,  // Resistance (lower is better, 0-1)
        E: 0.60,  // Experience diversity (0-1)
        currentIntelligence: 1.0,
        growthRate: 0.0
      },
      adaptationHistory: []
    };
  }

  /**
   * Load memory from disk
   */
  async load(): Promise<{ success: boolean; memory?: MemoryData; error?: string }> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.memoryPath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing memory
      if (await this.fileExists(this.memoryPath)) {
        const data = await fs.readFile(this.memoryPath, 'utf-8');
        this.memory = { ...this.memory, ...JSON.parse(data) };
      }

      return { success: true, memory: this.memory };
    } catch (error: any) {
      console.error('Error loading mirror memory:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save memory to disk
   */
  async save(): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.memoryPath);
      await fs.mkdir(dir, { recursive: true });

      this.memory.lastUpdated = Date.now();
      await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
      return { success: true };
    } catch (error: any) {
      console.error('Error saving mirror memory:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a pattern is a duplicate based on content similarity
   */
  private isDuplicatePattern(pattern: MirrorPattern, category: string): boolean {
    const existingPatterns = this.memory.patterns[category] || [];
    const desc = (pattern.description || '').toLowerCase().trim();
    
    if (!desc || desc.length < 10) return false;
    
    for (const existing of existingPatterns) {
      const existingDesc = (existing.description || '').toLowerCase().trim();
      
      // Check for exact or near-exact match
      if (existingDesc === desc) return true;
      
      // Check for substring containment (one is subset of other)
      if (desc.length > 20 && existingDesc.length > 20) {
        if (existingDesc.includes(desc.substring(0, 50)) || 
            desc.includes(existingDesc.substring(0, 50))) {
          return true;
        }
      }
      
      // Check if same error type and similar description
      if (pattern.metadata?.errorType && 
          pattern.metadata.errorType === existing.metadata?.errorType) {
        // Same error type - check if descriptions share many words
        const descWords = new Set(desc.split(/\s+/).filter(w => w.length > 3));
        const existingWords = new Set(existingDesc.split(/\s+/).filter(w => w.length > 3));
        let matches = 0;
        for (const word of descWords) {
          if (existingWords.has(word)) matches++;
        }
        // If 50%+ words match for same error type, it's a duplicate
        if (matches > 0 && matches / Math.max(descWords.size, 1) > 0.5) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Store a pattern with automatic limits enforcement
   */
  async storePattern(pattern: MirrorPattern, category: string = 'architectural'): Promise<void> {
    if (!this.memory.patterns[category]) {
      this.memory.patterns[category] = [];
    }

    // Skip if this is a duplicate pattern
    if (this.isDuplicatePattern(pattern, category)) {
      return;
    }

    // Check if pattern already exists (by ID)
    const existingIndex = this.memory.patterns[category].findIndex((p: MirrorPattern) => p.id === pattern.id);

    if (existingIndex >= 0) {
      // Update existing pattern with exponential moving average for success rate
      const existing = this.memory.patterns[category][existingIndex];
      const alpha = 0.3; // EMA smoothing factor
      const newSuccessRate = pattern.successRate !== undefined
        ? alpha * pattern.successRate + (1 - alpha) * (existing.successRate || 0.5)
        : existing.successRate;

      this.memory.patterns[category][existingIndex] = {
        ...existing,
        ...pattern,
        lastUsed: Date.now(),
        useCount: (existing.useCount || 0) + 1,
        successRate: newSuccessRate
      };
    } else {
      // Add new pattern
      const newPattern: MirrorPattern = {
        ...pattern,
        id: pattern.id || `pattern_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        created: Date.now(),
        lastUsed: Date.now(),
        useCount: 1,
        successRate: pattern.successRate ?? 0.5
      };
      this.memory.patterns[category].push(newPattern);

      // Enforce per-category limit by pruning lowest-value patterns
      if (this.memory.patterns[category].length > MAX_PATTERNS_PER_CATEGORY) {
        this.pruneCategory(category);
      }

      // Enforce total limit
      this.enforceTotalLimit();
      
      // Emit event for pattern learning notifications
      this.emit('patternLearned', {
        pattern: newPattern,
        category,
        intelligence: this.memory.intelligenceMetrics.currentIntelligence
      });
    }

    await this.save();
  }

  /**
   * Get a single pattern by ID (searches all categories)
   */
  getPattern(patternId: string): MirrorPattern | null {
    for (const category of Object.keys(this.memory.patterns)) {
      const found = this.memory.patterns[category].find(p => p.id === patternId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Synchronous version of getPattern for performance-sensitive paths
   */
  getPatternSync(patternId: string): MirrorPattern | null {
    return this.getPattern(patternId);
  }

  /**
   * Update specific fields of a pattern by ID
   */
  async updatePattern(patternId: string, updates: Partial<MirrorPattern>): Promise<boolean> {
    for (const category of Object.keys(this.memory.patterns)) {
      const index = this.memory.patterns[category].findIndex(p => p.id === patternId);
      if (index >= 0) {
        this.memory.patterns[category][index] = {
          ...this.memory.patterns[category][index],
          ...updates,
          lastUsed: Date.now()
        };
        await this.save();
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all patterns in a specific category
   */
  async clearCategory(category: string): Promise<{ cleared: number }> {
    const count = this.memory.patterns[category]?.length || 0;
    if (count > 0) {
      this.memory.patterns[category] = [];
      await this.save();
    }
    return { cleared: count };
  }

  /**
   * Prune lowest-value patterns from a category to stay under limit
   */
  private pruneCategory(category: string): void {
    const patterns = this.memory.patterns[category];
    if (patterns.length <= MAX_PATTERNS_PER_CATEGORY) return;

    // Score each pattern: higher = more valuable (keep)
    const scored = patterns.map((p, i) => ({
      index: i,
      value: this.calculatePatternValue(p)
    }));

    // Sort by value ascending (least valuable first)
    scored.sort((a, b) => a.value - b.value);

    // Remove lowest-value patterns to get back under limit
    const toRemove = scored.slice(0, patterns.length - MAX_PATTERNS_PER_CATEGORY).map(s => s.index);
    const removeSet = new Set(toRemove);
    this.memory.patterns[category] = patterns.filter((_, i) => !removeSet.has(i));
  }

  /**
   * Enforce total pattern limit across all categories
   */
  private enforceTotalLimit(): void {
    const total = Object.values(this.memory.patterns).flat().length;
    if (total <= MAX_TOTAL_PATTERNS) return;

    // Collect all patterns with category info
    const all: Array<{ pattern: MirrorPattern; category: string; value: number }> = [];
    for (const [category, patterns] of Object.entries(this.memory.patterns)) {
      for (const pattern of patterns) {
        all.push({ pattern, category, value: this.calculatePatternValue(pattern) });
      }
    }

    // Sort by value ascending (least valuable first)
    all.sort((a, b) => a.value - b.value);

    // Build set of IDs to remove
    const removeIds = new Set<string>();
    for (let i = 0; i < all.length - MAX_TOTAL_PATTERNS; i++) {
      const id = all[i]?.pattern.id;
      if (id) removeIds.add(id);
    }

    // Remove from each category
    for (const category of Object.keys(this.memory.patterns)) {
      this.memory.patterns[category] = this.memory.patterns[category].filter(
        p => !p.id || !removeIds.has(p.id)
      );
    }
  }

  /**
   * Calculate a pattern's retention value (higher = more worth keeping)
   */
  private calculatePatternValue(pattern: MirrorPattern): number {
    let value = 0;

    // Success rate is the strongest signal
    value += (pattern.successRate || 0.5) * 3.0;

    // Confidence matters
    value += (pattern.confidence || 0.5) * 2.0;

    // Usage frequency
    value += Math.min((pattern.useCount || 0) / 10, 1.0) * 1.5;

    // Recency boost (decay over 90 days)
    if (pattern.lastUsed) {
      const daysSince = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
      value += Math.max(0, 1 - daysSince / 90) * 1.0;
    }

    // Opus/training patterns get a boost (they're curated)
    if (pattern.type === 'opus-pattern' || pattern.extractedFrom === 'opus-training') {
      value += 2.0;
    }

    return value;
  }

  /**
   * Retrieve patterns from memory
   */
  async retrievePatterns(category?: string | null, limit?: number | null, sortBy?: string): Promise<MirrorPattern[]> {
    let patterns: MirrorPattern[] = [];

    if (category) {
      patterns = this.memory.patterns[category] || [];
    } else {
      // Get from all categories
      patterns = Object.values(this.memory.patterns).flat();
    }

    // Sort patterns
    if (sortBy === 'confidence') {
      patterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    } else if (sortBy === 'recent') {
      patterns.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    } else if (sortBy === 'success') {
      patterns.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
    } else {
      patterns.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    }

    if (limit) {
      patterns = patterns.slice(0, limit);
    }

    return patterns;
  }

  /**
   * Detect task type from task description
   */
  private detectTaskType(task: string): string {
    const lower = task.toLowerCase();
    if (lower.includes('game') || lower.includes('canvas') || lower.includes('animation')) return 'game';
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('rest')) return 'api';
    if (lower.includes('ui') || lower.includes('component') || lower.includes('button') || lower.includes('form')) return 'ui';
    if (lower.includes('test') || lower.includes('spec')) return 'testing';
    if (lower.includes('database') || lower.includes('sql') || lower.includes('mongo')) return 'database';
    if (lower.includes('auth') || lower.includes('login') || lower.includes('password')) return 'auth';
    if (lower.includes('file') || lower.includes('read') || lower.includes('write')) return 'filesystem';
    return 'general';
  }

  /**
   * Get relevant patterns for a task
   */
  async getRelevantPatterns(task: string, limit: number = 10): Promise<MirrorPattern[]> {
    const allPatterns = await this.retrievePatterns(null, null, 'confidence');
    const taskText = normalizeRetrievalTask(task);
    const taskLower = taskText.toLowerCase();
    const stopWords = new Set([
      'build',
      'make',
      'create',
      'official',
      'please',
      'with',
      'from',
      'that',
      'this',
      'into',
      'using',
    ]);
    const taskWords = taskLower
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    const taskType = this.detectTaskType(task);

    const scoredPatterns = allPatterns.map(pattern => {
      let score = 0;
      const descLower = (pattern.description || '').toLowerCase();
      const descWords = descLower.split(/[^a-z0-9]+/).filter(w => w.length > 3);
      let hasTaskEvidence = false;
      const matchedWords: string[] = [];

      // Keyword matching - more granular than before
      let matchingWords = 0;
      for (const word of taskWords) {
        if (descWords.includes(word)) {
          matchingWords++;
          matchedWords.push(word);
        }
      }
      if (matchingWords > 0) {
        hasTaskEvidence = true;
      }
      score += Math.min(matchingWords * 0.15, 0.6); // Cap at 0.6 for keyword matches

      // Task type matching
      if (pattern.metadata?.taskType === taskType) {
        score += 0.4;
      }

      // Pattern type relevance
      if (pattern.type) {
        const typeLower = pattern.type.toLowerCase();
        if (taskLower.includes(typeLower)) {
          hasTaskEvidence = true;
          score += 0.3;
          matchedWords.push(`type:${pattern.type}`);
        }
      }

      // Success/confidence are tie-breakers for task-matched patterns, not relevance by themselves.
      if (hasTaskEvidence) {
        score += (pattern.successRate || 0.5) * 0.25;

        // Recency boost (decays over time)
        if (pattern.lastUsed) {
          const daysSinceLastUse = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
          if (daysSinceLastUse < 1) {
            score += 0.3;
          } else if (daysSinceLastUse < 7) {
            score += 0.2;
          } else if (daysSinceLastUse < 30) {
            score += 0.1;
          }
        }

        // Confidence boost
        score += (pattern.confidence || 0) * 0.2;
      }

      return {
        pattern,
        score,
        hasTaskEvidence,
        reason: matchedWords.length > 0 ? `matched ${Array.from(new Set(matchedWords)).join(', ')}` : '',
      };
    });

    // Sort by relevance score and return top patterns
    scoredPatterns.sort((a, b) => b.score - a.score);
    const relevantPatterns = scoredPatterns.filter(item => item.hasTaskEvidence && item.score >= 0.35);
    return relevantPatterns.slice(0, limit).map(item => ({
      ...item.pattern,
      metadata: {
        ...(item.pattern.metadata || {}),
        retrievalReason: item.reason,
        retrievalScore: Number(item.score.toFixed(2)),
      },
    }));
  }

  /**
   * Update pattern success rate using exponential moving average
   */
  async updatePatternSuccess(patternId: string, success: boolean): Promise<void> {
    const alpha = 0.2; // EMA smoothing factor
    const outcome = success ? 1.0 : 0.0;

    for (const category of Object.keys(this.memory.patterns)) {
      const patternIndex = this.memory.patterns[category].findIndex(p => p.id === patternId);
      if (patternIndex >= 0) {
        const pattern = this.memory.patterns[category][patternIndex];
        const currentRate = pattern.successRate ?? 0.5;
        pattern.successRate = alpha * outcome + (1 - alpha) * currentRate;
        pattern.lastUsed = Date.now();
        pattern.useCount = (pattern.useCount || 0) + 1;
        break;
      }
    }

    await this.save();
  }

  /**
   * Get intelligence metrics
   */
  getIntelligenceMetrics(): MirrorMetrics {
    return this.memory.intelligenceMetrics;
  }

  /**
   * Update intelligence metrics
   */
  async updateIntelligenceMetrics(metrics: Partial<MirrorMetrics>): Promise<void> {
    this.memory.intelligenceMetrics = {
      ...this.memory.intelligenceMetrics,
      ...metrics
    };
    await this.save();
  }

  /**
   * Get statistics
   */
  getStats(): MirrorStats {
    const totalPatterns = Object.values(this.memory.patterns).flat().length;
    const totalFeedbackLoops = this.memory.feedbackLoops.length;

    return {
      totalPatterns,
      totalFeedbackLoops,
      lastUpdated: this.memory.lastUpdated !== null ? String(this.memory.lastUpdated) : ''
    };
  }

  /**
   * Add feedback loop entry
   */
  async addFeedbackLoop(loop: Partial<FeedbackLoopEntry> & { loopId: string }): Promise<void> {
    this.memory.feedbackLoops.push({
      loopId: loop.loopId,
      task: loop.task || '',
      duration: loop.duration,
      finalImprovement: loop.finalImprovement,
      lessonsLearned: loop.lessonsLearned,
      iterations: loop.iterations,
      timestamp: Date.now()
    });

    // Keep only recent feedback loops
    if (this.memory.feedbackLoops.length > MAX_FEEDBACK_LOOPS) {
      this.memory.feedbackLoops = this.memory.feedbackLoops.slice(-MAX_FEEDBACK_LOOPS);
    }

    await this.save();
  }

  /**
   * Get feedback loop entries
   */
  getFeedbackLoops(limit: number = 10): FeedbackLoopEntry[] {
    return this.memory.feedbackLoops
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }

  /**
   * Clean up old patterns
   */
  async cleanupOldPatterns(daysOld: number = 90): Promise<{ removed: number }> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (const category of Object.keys(this.memory.patterns)) {
      const originalLength = this.memory.patterns[category].length;
      this.memory.patterns[category] = this.memory.patterns[category].filter(pattern => {
        return !pattern.lastUsed || pattern.lastUsed > cutoffTime;
      });
      removed += originalLength - this.memory.patterns[category].length;
    }

    if (removed > 0) {
      await this.save();
    }

    return { removed };
  }

  /**
   * Generate a signature for pattern deduplication
   */
  private getPatternSignature(pattern: MirrorPattern): string {
    const desc = (pattern.description || '').toLowerCase().trim().substring(0, 100);
    const type = pattern.type || '';
    const errorType = pattern.metadata?.errorType || '';
    return `${type}:${errorType}:${desc}`;
  }

  /**
   * Deduplicate patterns across all categories
   * Call this on startup to clean existing duplicates
   */
  async deduplicatePatterns(): Promise<{ removed: number }> {
    let removed = 0;
    
    for (const category of Object.keys(this.memory.patterns)) {
      const unique = new Map<string, MirrorPattern>();
      
      for (const pattern of this.memory.patterns[category]) {
        const sig = this.getPatternSignature(pattern);
        
        if (!unique.has(sig)) {
          unique.set(sig, pattern);
        } else {
          // Keep the one with higher success rate or more uses
          const existing = unique.get(sig)!;
          if ((pattern.successRate || 0) > (existing.successRate || 0) ||
              (pattern.useCount || 0) > (existing.useCount || 0)) {
            unique.set(sig, pattern);
          }
          removed++;
        }
      }
      
      this.memory.patterns[category] = Array.from(unique.values());
    }
    
    if (removed > 0) {
      console.log(`[MirrorMemory] Removed ${removed} duplicate patterns`);
      await this.save();
    }
    
    return { removed };
  }

  // ============================================
  // Smart Mode Helper Methods
  // ============================================

  /**
   * Store a user preference pattern
   */
  async storeUserPreference(
    category: 'code-style' | 'framework' | 'naming' | 'structure' | 'tools' | 'general',
    key: string,
    value: string,
    confidence: number = 0.7
  ): Promise<void> {
    const pattern: MirrorPattern = {
      id: `pref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user-preference',
      description: `${category}: ${key} = ${value}`,
      confidence,
      metadata: {
        preferenceCategory: category,
        preferenceKey: key,
        preferenceValue: value
      }
    };

    await this.storePattern(pattern, 'userPreferences');
  }

  /**
   * Get user preferences by category
   */
  async getUserPreferences(category?: string): Promise<MirrorPattern[]> {
    const patterns = await this.retrievePatterns('userPreferences', null, 'confidence');
    
    if (category) {
      return patterns.filter(p => p.metadata?.preferenceCategory === category);
    }
    
    return patterns;
  }

  /**
   * Store a successful enhancement pattern
   */
  async storeSmartEnhancement(
    enhancementType: string,
    description: string,
    success: boolean,
    taskContext?: string
  ): Promise<void> {
    const pattern: MirrorPattern = {
      id: `enh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: enhancementType,
      description,
      confidence: success ? 0.8 : 0.3,
      successRate: success ? 1.0 : 0.0,
      metadata: {
        enhancementType,
        taskContext,
        wasSuccessful: success
      }
    };

    await this.storePattern(pattern, 'smartEnhancements');
  }

  /**
   * Get successful enhancements for a task type
   */
  async getSuccessfulEnhancements(taskType?: string, limit: number = 10): Promise<MirrorPattern[]> {
    const patterns = await this.retrievePatterns('smartEnhancements', limit, 'success');
    
    // Filter to successful ones
    const successful = patterns.filter(p => (p.successRate || 0) > 0.5);
    
    if (taskType) {
      return successful.filter(p => 
        p.metadata?.taskContext?.toLowerCase().includes(taskType.toLowerCase())
      );
    }
    
    return successful;
  }

  /**
   * Store an anti-pattern (something to avoid)
   */
  async storeAntiPattern(
    description: string,
    errorType?: string,
    context?: string
  ): Promise<void> {
    const pattern: MirrorPattern = {
      id: `anti_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'anti-pattern',
      description: `AVOID: ${description}`,
      confidence: 0.9,
      successRate: 0.0, // Anti-patterns have 0 success rate
      metadata: {
        errorType,
        context,
        isAntiPattern: true
      }
    };

    await this.storePattern(pattern, 'antiPatterns');
  }

  /**
   * Get relevant anti-patterns for a task
   */
  async getAntiPatterns(keywords: string[], limit: number = 5): Promise<MirrorPattern[]> {
    const patterns = await this.retrievePatterns('antiPatterns', null, 'recent');
    
    if (keywords.length === 0) {
      return patterns.slice(0, limit);
    }
    
    // Score patterns by keyword relevance
    const scored = patterns.map(p => {
      const desc = (p.description || '').toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (desc.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      return { pattern: p, score };
    });
    
    // Return top matches
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.pattern);
  }
}
