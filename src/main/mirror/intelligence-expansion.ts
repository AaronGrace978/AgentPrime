/**
 * Intelligence Expansion Module
 * Implements I(n+1) = I(n) + (Q/R) × E equation
 */

import type { MirrorMetrics } from '../../types';
import { MirrorMemory } from './mirror-memory';

interface MetaQuestion {
  question: string;
  category: string;
  quality: number;
  patternId?: string;
}

interface MetaQuestionsResult {
  questions: MetaQuestion[];
  quality: number;
  count: number;
}

interface ResistanceMeasurement {
  current: number;
  change: number;
  factors: string[];
}

/** Maximum intelligence value (prevents unbounded growth) */
const MAX_INTELLIGENCE = 10.0;

/** Diminishing returns factor: growth slows as intelligence increases */
const DIMINISHING_FACTOR = 0.1;

export class IntelligenceExpansion {
  private mirrorMemory: MirrorMemory;

  constructor(mirrorMemory: MirrorMemory) {
    this.mirrorMemory = mirrorMemory;
  }

  /**
   * Calculate intelligence growth using I(n+1) = I(n) + (Q/R) × E × diminishing(I)
   * 
   * Improvements:
   * - Bounded to MAX_INTELLIGENCE (no runaway values)
   * - Diminishing returns as intelligence increases (harder to grow at higher levels)
   * - All inputs clamped to [0, 1]
   */
  async calculateGrowth(
    questionQuality: number,
    resistance: number,
    experience: number
  ): Promise<{
    currentIntelligence: number;
    newIntelligence: number;
    growth: number;
    Q: number;
    R: number;
    E: number;
  }> {
    const metrics = this.mirrorMemory.getIntelligenceMetrics();
    const currentIntelligence = Math.min(MAX_INTELLIGENCE, metrics.currentIntelligence || 1.0);

    // Clamp inputs to [0, 1]
    const Q = Math.max(0, Math.min(1, questionQuality));
    const R = Math.max(0.05, Math.min(1, resistance)); // Floor at 0.05 to avoid division explosion
    const E = Math.max(0, Math.min(1, experience));

    // Diminishing returns: growth slows as intelligence increases
    const diminishing = DIMINISHING_FACTOR * (1 - currentIntelligence / MAX_INTELLIGENCE);

    // Calculate bounded growth
    const rawGrowth = (Q / R) * E * diminishing;
    const growth = Math.max(0, rawGrowth); // Never decrease from this formula
    const newIntelligence = Math.min(MAX_INTELLIGENCE, currentIntelligence + growth);

    return {
      currentIntelligence,
      newIntelligence,
      growth,
      Q,
      R,
      E
    };
  }

  /**
   * Generate meta-questions about code patterns (Q - Question Quality)
   */
  async generateMetaQuestions(code: string, patterns?: any[]): Promise<MetaQuestionsResult> {
    const questions: MetaQuestion[] = [];

    if (!patterns) {
      patterns = await this.mirrorMemory.retrievePatterns(null, 10, 'confidence');
    }

    // Questions about code structure
    if (!/class\s+\w+|function\s+\w+|const\s+\w+\s*=/.test(code)) {
      questions.push({
        question: 'Should this code be organized into functions or classes?',
        category: 'structure',
        quality: 0.8
      });
    }

    // Questions about error handling
    if (!/try\s*\{|catch|error|Error/.test(code)) {
      questions.push({
        question: 'How should error handling be implemented here?',
        category: 'error_handling',
        quality: 0.9
      });
    }

    // Questions about async patterns
    if (/\bawait\b|\bPromise\b/.test(code) && !/\basync\b/.test(code)) {
      questions.push({
        question: 'Should async/await patterns be used consistently?',
        category: 'async_patterns',
        quality: 0.7
      });
    }

    // Questions about patterns
    for (const pattern of patterns.slice(0, 5)) {
      if (pattern.description && !code.includes(pattern.description.substring(0, 20))) {
        questions.push({
          question: `Should we apply the pattern: ${pattern.description}?`,
          category: 'pattern_application',
          quality: pattern.confidence || 0.7,
          patternId: pattern.id
        });
      }
    }

    // Questions about performance
    if (/(?:for|while)\s*\(/.test(code) && /length|\.length/.test(code)) {
      questions.push({
        question: 'Are there opportunities for performance optimization?',
        category: 'performance',
        quality: 0.6
      });
    }

    // Calculate average question quality
    const avgQuality = questions.length > 0
      ? questions.reduce((sum, q) => sum + (q.quality || 0.7), 0) / questions.length
      : 0.5;

    return {
      questions,
      quality: avgQuality,
      count: questions.length
    };
  }

  /**
   * Measure resistance to change (R - Resistance)
   */
  async measureResistance(code: string, suggestedPatterns: any[] = []): Promise<ResistanceMeasurement> {
    const metrics = this.mirrorMemory.getIntelligenceMetrics();
    const baseResistance = metrics.R || 0.30;

    let resistance = baseResistance;
    const factors: string[] = [];

    // Code complexity increases resistance
    const complexity = this.estimateComplexity(code);
    if (complexity === 'complex') {
      resistance += 0.2;
      factors.push('high_complexity');
    } else if (complexity === 'medium') {
      resistance += 0.1;
      factors.push('medium_complexity');
    }

    // Legacy code patterns increase resistance
    if (/(?:var\s|function\s+\w+\s*\(|arguments\[)/.test(code)) {
      resistance += 0.15;
      factors.push('legacy_patterns');
    }

    // Large codebases increase resistance
    const lines = code.split('\n').length;
    if (lines > 200) {
      resistance += 0.1;
      factors.push('large_codebase');
    } else if (lines > 50) {
      resistance += 0.05;
      factors.push('medium_codebase');
    }

    // External dependencies increase resistance
    const importCount = (code.match(/^(?:import|require|from)\s+/gm) || []).length;
    if (importCount > 10) {
      resistance += 0.1;
      factors.push('many_dependencies');
    }

    // Calculate change from baseline
    const change = resistance - baseResistance;

    return {
      current: Math.min(1.0, resistance),
      change,
      factors
    };
  }

  /**
   * Measure experience diversity (E - Experience)
   */
  async measureExperience(code: string, patterns: any[] = []): Promise<{
    diversity: number;
    factors: string[];
    patternsUsed: number;
  }> {
    const metrics = this.mirrorMemory.getIntelligenceMetrics();
    const baseExperience = metrics.E || 0.60;

    let experience = baseExperience;
    const factors: string[] = [];

    // Pattern diversity
    const uniquePatternTypes = new Set(patterns.map(p => p.type));
    const patternDiversity = uniquePatternTypes.size / 10; // Normalize to 0-1
    experience += patternDiversity * 0.2;
    factors.push(`pattern_diversity_${uniquePatternTypes.size}`);

    // Language features used
    const features = [];
    if (/\basync\b|\bawait\b/.test(code)) features.push('async_await');
    if (/\bclass\b|\bextends\b/.test(code)) features.push('classes');
    if (/=>\s*\{/.test(code)) features.push('arrow_functions');
    if (/\bdestructuring\b|\{.*\}/.test(code)) features.push('destructuring');
    if (/import\s+|export\s+/.test(code)) features.push('modules');

    const featureDiversity = features.length / 10;
    experience += featureDiversity * 0.15;
    factors.push(`features_used_${features.length}`);

    // Code patterns used
    const patternsUsed = patterns.length;
    const patternUsage = Math.min(1.0, patternsUsed / 20); // Normalize
    experience += patternUsage * 0.1;
    factors.push(`patterns_used_${patternsUsed}`);

    return {
      diversity: Math.min(1.0, experience),
      factors,
      patternsUsed
    };
  }

  /**
   * Get current intelligence metrics
   */
  async getMetrics(): Promise<MirrorMetrics> {
    return this.mirrorMemory.getIntelligenceMetrics();
  }

  /**
   * Update intelligence metrics after learning (all values clamped)
   */
  async updateMetrics(growth: {
    questionQuality: number;
    resistance: number;
    experience: number;
  }): Promise<MirrorMetrics> {
    const result = await this.calculateGrowth(growth.questionQuality, growth.resistance, growth.experience);

    const newMetrics: MirrorMetrics = {
      Q: Math.max(0, Math.min(1, growth.questionQuality)),
      R: Math.max(0.05, Math.min(1, growth.resistance)),
      E: Math.max(0, Math.min(1, growth.experience)),
      currentIntelligence: Math.min(MAX_INTELLIGENCE, result.newIntelligence),
      growthRate: result.growth
    };

    await this.mirrorMemory.updateIntelligenceMetrics(newMetrics);
    return newMetrics;
  }

  /**
   * Estimate code complexity
   */
  estimateComplexity(code: string): 'simple' | 'medium' | 'complex' {
    const lines = code.split('\n').length;
    const hasClasses = /class\s+\w+/.test(code);
    const hasFunctions = /(?:function|const\s+\w+\s*=.*=>|def\s+\w+)/.test(code);
    const hasAsync = /async|await|Promise/.test(code);
    const hasErrorHandling = /try|catch|throw|Error/.test(code);
    const hasAdvancedFeatures = /generics|decorators|reflection/.test(code);

    if (lines > 200 || (hasClasses && hasAsync && hasErrorHandling && hasAdvancedFeatures)) {
      return 'complex';
    } else if (lines > 50 || hasFunctions || hasAsync || hasClasses) {
      return 'medium';
    } else {
      return 'simple';
    }
  }

  /**
   * Generate learning suggestions based on current intelligence level
   */
  async generateLearningSuggestions(): Promise<{
    suggestions: string[];
    priority: 'low' | 'medium' | 'high';
    focus: string;
  }> {
    const metrics = await this.getMetrics();
    const suggestions: string[] = [];

    if (metrics.Q < 0.7) {
      suggestions.push('Focus on generating higher-quality meta-questions');
      suggestions.push('Study question formulation patterns from expert examples');
    }

    if (metrics.R > 0.5) {
      suggestions.push('Work on reducing resistance to change');
      suggestions.push('Practice refactoring legacy code patterns');
    }

    if (metrics.E < 0.7) {
      suggestions.push('Increase experience diversity by studying varied code patterns');
      suggestions.push('Explore different programming paradigms and languages');
    }

    let priority: 'low' | 'medium' | 'high' = 'low';
    const currentIntel = metrics.currentIntelligence ?? 1.0;
    if (currentIntel < 1.5) {
      priority = 'high';
    } else if (currentIntel < 2.0) {
      priority = 'medium';
    }

    const focus = metrics.Q < metrics.R && metrics.Q < metrics.E ? 'question_quality' :
                 metrics.R > metrics.Q && metrics.R > metrics.E ? 'resistance_reduction' :
                 'experience_expansion';

    return {
      suggestions,
      priority,
      focus
    };
  }
}
