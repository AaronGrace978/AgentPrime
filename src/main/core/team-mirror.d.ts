/**
 * AgentPrime - Team Mirror
 * Enables teams to share and aggregate coding patterns
 */
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
    teamSuccessCount: number;
    teamSuccessRate: number;
    version: number;
    previousVersions?: TeamPattern[];
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
export declare class TeamMirror {
    private teamPatterns;
    private teamId;
    constructor(teamId?: string);
    /**
     * Share patterns with team
     */
    sharePatterns(teamId: string, patterns: MirrorPattern[], userId: string, visibility?: 'public' | 'team' | 'private'): Promise<{
        shared: number;
        conflicts: PatternConflict[];
    }>;
    /**
     * Aggregate learning from individual patterns
     */
    aggregateLearning(individualPatterns: TeamPattern[]): Promise<TeamPatterns>;
    /**
     * Recommend best practices based on team patterns
     */
    recommendBestPractices(context: {
        language?: string;
        projectType?: string;
        task?: string;
    }): Promise<Recommendation[]>;
    /**
     * Get team patterns
     */
    getTeamPatterns(teamId: string): Promise<TeamPattern[]>;
    /**
     * Update team pattern usage
     */
    recordPatternUsage(teamId: string, patternId: string, success: boolean): Promise<void>;
    /**
     * Find duplicate pattern
     */
    private findDuplicatePattern;
    /**
     * Check if two patterns are similar
     */
    private patternsSimilar;
    /**
     * Merge two patterns
     */
    private mergePatterns;
    /**
     * Group patterns by similarity
     */
    private groupPatterns;
    /**
     * Get group key for a pattern
     */
    private getPatternGroupKey;
    /**
     * Aggregate a group of similar patterns
     */
    private aggregatePatternGroup;
    /**
     * Detect contradictory patterns
     */
    private detectContradictions;
    /**
     * Calculate pattern quality score
     */
    private calculatePatternQuality;
    /**
     * Calculate recommendation score
     */
    private calculateRecommendationScore;
    /**
     * Build recommendation reasoning
     */
    private buildRecommendationReasoning;
    /**
     * Store team pattern
     */
    private storeTeamPattern;
    /**
     * Update team pattern
     */
    private updateTeamPattern;
    /**
     * Calculate text similarity
     */
    private textSimilarity;
    /**
     * Get team statistics
     */
    getTeamStats(teamId: string): {
        totalPatterns: number;
        contributors: number;
        averageSuccessRate: number;
        mostUsedPatterns: Array<{
            patternId: string;
            usageCount: number;
        }>;
    };
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
export declare function getTeamMirror(teamId?: string): TeamMirror;
//# sourceMappingURL=team-mirror.d.ts.map