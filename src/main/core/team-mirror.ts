/**
 * AgentPrime - Team Mirror
 * Enables teams to share and aggregate coding patterns
 */

import { getMirrorMemory } from '../mirror/mirror-singleton';
import type { MirrorPattern } from '../../types';

/**
 * Team pattern with sharing metadata
 */
export interface TeamPattern extends MirrorPattern {
  teamId: string;
  userId: string;
  visibility: 'public' | 'team' | 'private';
  sharedAt: number;
  teamUsageCount: number;
  teamSuccessRate: number;
  version: number;
  previousVersions?: TeamPattern[];
}

/**
 * Extended team pattern for internal tracking
 */
interface TeamPatternExtended extends TeamPattern {
  _successCount?: number;
}

/**
 * Team pattern aggregation result
 */
export interface TeamPatternAggregation {
  aggregatedPattern: TeamPattern;
  contributors: string[];
  mergeStrategy: string;
  conflicts: PatternConflict[];
}

/**
 * Pattern conflict
 */
export interface PatternConflict {
  patternId: string;
  conflictType: 'duplicate' | 'contradictory' | 'version';
  description: string;
  resolution: 'merged' | 'kept' | 'rejected';
}

/**
 * Team Mirror - Aggregates patterns from team members
 */
export class TeamMirror {
  private teamPatterns: Map<string, TeamPattern> = new Map();
  private teamId: string | null = null;

  constructor(teamId?: string) {
    this.teamId = teamId || null;
  }

  /**
   * Share patterns with team
   */
  async sharePatterns(
    teamId: string,
    patterns: MirrorPattern[],
    userId: string,
    visibility: 'public' | 'team' | 'private' = 'team'
  ): Promise<{
    shared: number;
    conflicts: PatternConflict[];
  }> {
    console.log(`[TeamMirror] Sharing ${patterns.length} patterns with team ${teamId}`);

    const conflicts: PatternConflict[] = [];
    let shared = 0;

    for (const pattern of patterns) {
      try {
        // Check for duplicates
        const existing = await this.findDuplicatePattern(pattern, teamId);

        if (existing) {
          // Conflict detected
          const conflict: PatternConflict = {
            patternId: pattern.id || '',
            conflictType: 'duplicate',
            description: `Pattern already exists: ${pattern.type || 'unknown'}`,
            resolution: 'merged'
          };

          // Merge patterns
          const merged = await this.mergePatterns(existing, pattern, userId);
          await this.updateTeamPattern(teamId, merged);
          conflicts.push(conflict);
        } else {
          // New pattern - share it
          const teamPattern: TeamPattern = {
            ...pattern,
            teamId,
            userId,
            visibility,
            sharedAt: Date.now(),
            teamUsageCount: 0,
            teamSuccessRate: pattern.successRate || 0,
            version: 1
          };

          await this.storeTeamPattern(teamPattern);
          shared++;
        }
      } catch (error: any) {
        console.warn(`[TeamMirror] Failed to share pattern ${pattern.id}:`, error.message);
      }
    }

    console.log(`[TeamMirror] Shared ${shared} patterns, ${conflicts.length} conflicts resolved`);

    return { shared, conflicts };
  }

  /**
   * Aggregate learning from individual patterns
   */
  async aggregateLearning(
    individualPatterns: TeamPattern[]
  ): Promise<TeamPatterns> {
    console.log(`[TeamMirror] Aggregating ${individualPatterns.length} individual patterns`);

    const aggregated: Map<string, TeamPatternAggregation> = new Map();

    // Group patterns by type/description
    const patternGroups = this.groupPatterns(individualPatterns);

    for (const [groupKey, patterns] of patternGroups.entries()) {
      if (patterns.length === 1) {
        // Single pattern - no aggregation needed
        const pattern = patterns[0];
        aggregated.set(groupKey, {
          aggregatedPattern: pattern,
          contributors: [pattern.userId],
          mergeStrategy: 'single',
          conflicts: []
        });
      } else {
        // Multiple patterns - aggregate them
        const aggregation = await this.aggregatePatternGroup(patterns);
        aggregated.set(groupKey, aggregation);
      }
    }

    const teamPatterns: TeamPatterns = {
      patterns: Array.from(aggregated.values()).map(a => a.aggregatedPattern),
      totalPatterns: aggregated.size,
      contributors: new Set(
        Array.from(aggregated.values())
          .flatMap(a => a.contributors)
      ).size,
      conflicts: Array.from(aggregated.values())
        .flatMap(a => a.conflicts)
    };

    console.log(`[TeamMirror] Aggregated into ${teamPatterns.patterns.length} team patterns`);

    return teamPatterns;
  }

  /**
   * Recommend best practices based on team patterns
   */
  async recommendBestPractices(
    context: {
      language?: string;
      projectType?: string;
      task?: string;
      teamId?: string;
    }
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Get team patterns matching context
    const teamPatterns = await this.getTeamPatterns(context.teamId || this.teamId || '');

    // Filter by context
    const relevantPatterns = teamPatterns.filter(pattern => {
      if (context.language && pattern.characteristics?.language !== context.language) {
        return false;
      }
      if (context.projectType && pattern.characteristics?.projectType !== context.projectType) {
        return false;
      }
      return true;
    });

    // Score patterns by team success rate
    const scoredPatterns = relevantPatterns
      .map(pattern => ({
        pattern,
        score: this.calculateRecommendationScore(pattern)
      }))
      .sort((a, b) => b.score - a.score);

    // Generate recommendations
    for (const { pattern, score } of scoredPatterns.slice(0, 10)) {
      recommendations.push({
        patternId: pattern.id || '',
        pattern,
        score,
        reasoning: this.buildRecommendationReasoning(pattern, score),
        usageCount: pattern.teamUsageCount,
        successRate: pattern.teamSuccessRate
      });
    }

    return recommendations;
  }

  /**
   * Get team patterns
   */
  async getTeamPatterns(teamId: string): Promise<TeamPattern[]> {
    // In production, this would query backend API
    // For now, return cached patterns
    return Array.from(this.teamPatterns.values())
      .filter(p => p.teamId === teamId);
  }

  /**
   * Update team pattern usage
   */
  async recordPatternUsage(
    teamId: string,
    patternId: string,
    success: boolean
  ): Promise<void> {
    const pattern = this.teamPatterns.get(`${teamId}:${patternId}`);
    if (pattern) {
      pattern.teamUsageCount++;
      
      // Update success rate using internal tracking
      const patternExt = pattern as TeamPatternExtended;
      const currentSuccess = patternExt._successCount || 0;
      patternExt._successCount = success ? currentSuccess + 1 : currentSuccess;
      pattern.teamSuccessRate = patternExt._successCount / pattern.teamUsageCount;

      await this.updateTeamPattern(teamId, pattern);
    }
  }

  /**
   * Find duplicate pattern
   */
  private async findDuplicatePattern(
    pattern: MirrorPattern,
    teamId: string
  ): Promise<TeamPattern | null> {
    const teamPatterns = await this.getTeamPatterns(teamId);

    for (const teamPattern of teamPatterns) {
      if (this.patternsSimilar(teamPattern, pattern)) {
        return teamPattern;
      }
    }

    return null;
  }

  /**
   * Check if two patterns are similar
   */
  private patternsSimilar(patternA: MirrorPattern, patternB: MirrorPattern): boolean {
    // Type match
    if (patternA.type && patternB.type && patternA.type === patternB.type) {
      return true;
    }

    // Description similarity
    if (patternA.description && patternB.description) {
      const similarity = this.textSimilarity(patternA.description, patternB.description);
      if (similarity > 0.8) return true;
    }

    // Example similarity
    if (patternA.examples && patternB.examples && patternA.examples.length > 0 && patternB.examples.length > 0) {
      const exampleSimilarity = this.textSimilarity(
        patternA.examples[0],
        patternB.examples[0]
      );
      if (exampleSimilarity > 0.7) return true;
    }

    return false;
  }

  /**
   * Merge two patterns
   */
  private async mergePatterns(
    existing: TeamPattern,
    newPattern: MirrorPattern,
    userId: string
  ): Promise<TeamPattern> {
    // Create new version
    const previousVersions = existing.previousVersions || [];
    previousVersions.push({ ...existing });

    // Merge characteristics
    const mergedCharacteristics = {
      ...existing.characteristics,
      ...newPattern.characteristics
    };

    // Merge examples (deduplicate)
    const mergedExamples = [
      ...(existing.examples || []),
      ...(newPattern.examples || [])
    ].filter((ex, index, self) =>
      index === self.findIndex(e => e === ex)
    );

    // Use higher confidence
    const mergedConfidence = Math.max(
      existing.confidence || 0,
      newPattern.confidence || 0
    );

    const merged: TeamPattern = {
      ...existing,
      ...newPattern,
      characteristics: mergedCharacteristics,
      examples: mergedExamples,
      confidence: mergedConfidence,
      version: existing.version + 1,
      previousVersions,
      userId, // New contributor
      sharedAt: Date.now()
    };

    return merged;
  }

  /**
   * Group patterns by similarity
   */
  private groupPatterns(patterns: TeamPattern[]): Map<string, TeamPattern[]> {
    const groups = new Map<string, TeamPattern[]>();

    for (const pattern of patterns) {
      const groupKey = this.getPatternGroupKey(pattern);
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(pattern);
    }

    return groups;
  }

  /**
   * Get group key for a pattern
   */
  private getPatternGroupKey(pattern: TeamPattern): string {
    const type = pattern.type || 'unknown';
    const language = pattern.characteristics?.language || 'any';
    return `${type}:${language}`;
  }

  /**
   * Aggregate a group of similar patterns
   */
  private async aggregatePatternGroup(
    patterns: TeamPattern[]
  ): Promise<TeamPatternAggregation> {
    // Sort by quality score
    const sorted = patterns.sort((a, b) => {
      const scoreA = this.calculatePatternQuality(a);
      const scoreB = this.calculatePatternQuality(b);
      return scoreB - scoreA;
    });

    // Use highest quality pattern as base
    const basePattern = sorted[0];
    let aggregated: TeamPattern = { ...basePattern };
    const aggregatedExt = aggregated as TeamPatternExtended;
    const baseExt = basePattern as TeamPatternExtended;
    aggregatedExt._successCount = baseExt._successCount || 0;

    // Merge characteristics from other patterns
    const allCharacteristics: Record<string, any> = { ...basePattern.characteristics };
    const allExamples: string[] = [...(basePattern.examples || [])];
    const contributors = new Set<string>([basePattern.userId]);

    for (let i = 1; i < sorted.length; i++) {
      const pattern = sorted[i];
      const patternExt = pattern as TeamPatternExtended;
      contributors.add(pattern.userId);

      // Merge characteristics
      Object.assign(allCharacteristics, pattern.characteristics || {});

      // Add unique examples
      for (const example of pattern.examples || []) {
        if (!allExamples.includes(example)) {
          allExamples.push(example);
        }
      }

      // Aggregate usage stats
      aggregated.teamUsageCount += pattern.teamUsageCount || 0;
      aggregatedExt._successCount = (aggregatedExt._successCount || 0) + (patternExt._successCount || 0);
    }

    // Calculate aggregated success rate
    aggregated.teamSuccessRate = aggregated.teamUsageCount > 0
      ? (aggregatedExt._successCount || 0) / aggregated.teamUsageCount
      : 0;

    // Update aggregated pattern
    aggregated.characteristics = allCharacteristics;
    aggregated.examples = allExamples;
    aggregated.confidence = Math.max(...patterns.map(p => p.confidence || 0));

    const conflicts: PatternConflict[] = [];
    
    // Detect conflicts
    if (patterns.length > 1) {
      // Check for contradictory patterns
      const contradictions = this.detectContradictions(patterns);
      conflicts.push(...contradictions);
    }

    return {
      aggregatedPattern: aggregated,
      contributors: Array.from(contributors),
      mergeStrategy: 'quality-weighted',
      conflicts
    };
  }

  /**
   * Detect contradictory patterns
   */
  private detectContradictions(patterns: TeamPattern[]): PatternConflict[] {
    const conflicts: PatternConflict[] = [];

    // Simple contradiction detection based on description keywords
    const negativeKeywords = ['avoid', 'don\'t', 'never', 'anti'];
    const positiveKeywords = ['use', 'always', 'prefer', 'should'];

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const patternA = patterns[i];
        const patternB = patterns[j];

        const descA = (patternA.description || '').toLowerCase();
        const descB = (patternB.description || '').toLowerCase();

        const aHasNegative = negativeKeywords.some(kw => descA.includes(kw));
        const bHasPositive = positiveKeywords.some(kw => descB.includes(kw));

        if (aHasNegative && bHasPositive && this.patternsSimilar(patternA, patternB)) {
          conflicts.push({
            patternId: patternA.id || '',
            conflictType: 'contradictory',
            description: `Pattern ${patternA.id} contradicts ${patternB.id}`,
            resolution: 'kept' // Keep both, let user decide
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Calculate pattern quality score
   */
  private calculatePatternQuality(pattern: TeamPattern): number {
    let score = 0;

    // Confidence
    score += (pattern.confidence || 0) * 0.3;

    // Team success rate
    score += pattern.teamSuccessRate * 0.3;

    // Usage count (normalized)
    score += Math.min(pattern.teamUsageCount / 100, 1.0) * 0.2;

    // Recency
    const daysSinceShare = (Date.now() - pattern.sharedAt) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 1 - daysSinceShare / 30);
    score += recency * 0.2;

    return score;
  }

  /**
   * Calculate recommendation score
   */
  private calculateRecommendationScore(pattern: TeamPattern): number {
    return this.calculatePatternQuality(pattern);
  }

  /**
   * Build recommendation reasoning
   */
  private buildRecommendationReasoning(
    pattern: TeamPattern,
    score: number
  ): string {
    const reasons: string[] = [];

    if (pattern.teamSuccessRate > 0.8) {
      reasons.push(`high team success rate (${(pattern.teamSuccessRate * 100).toFixed(0)}%)`);
    }
    if (pattern.teamUsageCount > 10) {
      reasons.push(`widely used by team (${pattern.teamUsageCount} times)`);
    }
    if (pattern.confidence && pattern.confidence > 0.8) {
      reasons.push('high confidence pattern');
    }

    return reasons.length > 0
      ? `Recommended because: ${reasons.join(', ')}`
      : 'Moderate recommendation based on team patterns';
  }

  /**
   * Store team pattern
   */
  private async storeTeamPattern(pattern: TeamPattern): Promise<void> {
    const key = `${pattern.teamId}:${pattern.id}`;
    this.teamPatterns.set(key, pattern);

    // In production, this would sync to backend
    // For now, also store in mirror memory
    const mirrorMemory = getMirrorMemory();
w    if (mirrorMemory) {
      await mirrorMemory.storePattern(pattern, pattern.type || 'team');
    }
  }

  /**
   * Update team pattern
   */
  private async updateTeamPattern(teamId: string, pattern: TeamPattern): Promise<void> {
    const key = `${teamId}:${pattern.id}`;
    this.teamPatterns.set(key, pattern);

    // Sync to backend in production
  }

  /**
   * Calculate text similarity
   */
  private textSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Get team statistics
   */
  getTeamStats(teamId: string): {
    totalPatterns: number;
    contributors: number;
    averageSuccessRate: number;
    mostUsedPatterns: Array<{ patternId: string; usageCount: number }>;
  } {
    const teamPatterns = Array.from(this.teamPatterns.values())
      .filter(p => p.teamId === teamId);

    const contributors = new Set(teamPatterns.map(p => p.userId)).size;
    const averageSuccessRate = teamPatterns.length > 0
      ? teamPatterns.reduce((sum, p) => sum + p.teamSuccessRate, 0) / teamPatterns.length
      : 0;

    const mostUsedPatterns = teamPatterns
      .map(p => ({ patternId: p.id || '', usageCount: p.teamUsageCount }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return {
      totalPatterns: teamPatterns.length,
      contributors,
      averageSuccessRate,
      mostUsedPatterns
    };
  }
}

/**
 * Team patterns collection
 */
export interface TeamPatterns {
  patterns: TeamPattern[];
  totalPatterns: number;
  contributors: number;
  conflicts: PatternConflict[];
}

/**
 * Recommendation
 */
export interface Recommendation {
  patternId: string;
  pattern: TeamPattern;
  score: number;
  reasoning: string;
  usageCount: number;
  successRate: number;
}

// Singleton instance
let teamMirrorInstance: TeamMirror | null = null;

export function getTeamMirror(teamId?: string): TeamMirror {
  if (!teamMirrorInstance) {
    teamMirrorInstance = new TeamMirror(teamId);
  }
  return teamMirrorInstance;
}

