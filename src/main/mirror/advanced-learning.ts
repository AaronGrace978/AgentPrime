/**
 * AgentPrime - Advanced Mirror Learning
 * Deep learning engine with pattern prediction, failure analysis,
 * and success amplification
 */

import { getMirrorMemory } from './mirror-singleton';
import { MirrorPatternExtractor } from './mirror-pattern-extractor';
import type { MirrorPattern } from '../../types';

/** Safely get codebase embeddings (may not be available) */
function tryGetCodebaseEmbeddings(): any {
  try {
    const { getCodebaseEmbeddings } = require('../core/codebase-embeddings');
    return getCodebaseEmbeddings();
  } catch {
    return null;
  }
}

/**
 * Pattern prediction result
 */
export interface PatternPrediction {
  patternId: string;
  pattern: MirrorPattern;
  confidence: number;
  reasoning: string;
  contextMatch: number;
}

/**
 * Failure analysis result
 */
export interface FailureAnalysis {
  failureId: string;
  task: string;
  error: string;
  antiPatterns: MirrorPattern[];
  rootCause: string;
  suggestions: string[];
  similarFailures: string[];
  timestamp: number;
}

/**
 * Success amplification result
 */
export interface SuccessAmplification {
  patternId: string;
  pattern: MirrorPattern;
  successRate: number;
  usageCount: number;
  contexts: string[];
  recommendations: string[];
}

/**
 * Advanced Learning Engine
 */
export class AdvancedLearningEngine {
  private patternExtractor: MirrorPatternExtractor;
  private failureHistory: FailureAnalysis[] = [];
  private successHistory: Map<string, number> = new Map();
  private failurePatterns: Map<string, MirrorPattern[]> = new Map();
  private successContexts: Map<string, string[]> = new Map();

  constructor(opusExamplesPath: string) {
    this.patternExtractor = new MirrorPatternExtractor(opusExamplesPath);
  }

  /**
   * Predict likely patterns before execution
   */
  async predictPatterns(
    task: string,
    context: {
      language?: string;
      projectType?: string;
      files?: string[];
      workspacePath?: string;
    }
  ): Promise<PatternPrediction[]> {
    console.log(`[AdvancedLearning] Predicting patterns for: ${task.substring(0, 100)}...`);

    const predictions: PatternPrediction[] = [];

    try {
      // Get relevant patterns from mirror memory
      const mirrorMemory = getMirrorMemory();
      if (!mirrorMemory) {
        console.warn('[AdvancedLearning] Mirror memory not available');
        return [];
      }
      const allPatterns = await mirrorMemory.retrievePatterns(null, 50, 'confidence');

      // Use codebase embeddings for semantic matching (if available)
      let similarFiles: any[] = [];
      const embeddings = tryGetCodebaseEmbeddings();
      if (embeddings) {
        try {
          similarFiles = await embeddings.findSimilarFiles(task, 5);
        } catch {
          // Embeddings not initialized, proceed without
        }
      }

      // Build context for matching
      const contextText = this.buildContextText(task, context, similarFiles);

      // Score each pattern
      for (const pattern of allPatterns) {
        const contextMatch = this.calculateContextMatch(pattern, contextText, context);
        const successRate = this.getSuccessRate(pattern.id || '');
        const recency = this.calculateRecency(pattern);
        const relevance = this.calculateRelevance(pattern, task);

        // Combined confidence score
        const confidence = (
          contextMatch * 0.3 +
          successRate * 0.3 +
          recency * 0.2 +
          relevance * 0.2
        );

        if (confidence > 0.3) {
          predictions.push({
            patternId: pattern.id || '',
            pattern,
            confidence,
            reasoning: this.buildReasoning(pattern, contextMatch, successRate, relevance),
            contextMatch
          });
        }
      }

      // Sort by confidence
      predictions.sort((a, b) => b.confidence - a.confidence);

      console.log(`[AdvancedLearning] Predicted ${predictions.length} patterns (top: ${predictions[0]?.confidence.toFixed(2)})`);

      return predictions.slice(0, 10); // Return top 10
    } catch (error) {
      console.warn('[AdvancedLearning] Pattern prediction failed:', error);
      return [];
    }
  }

  /**
   * Analyze failures to extract anti-patterns
   */
  async analyzeFailure(
    task: string,
    error: string,
    code?: string,
    context?: Record<string, any>
  ): Promise<FailureAnalysis> {
    console.log(`[AdvancedLearning] Analyzing failure: ${error.substring(0, 100)}...`);

    const failureId = `failure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Extract patterns from failed code
    let antiPatterns: MirrorPattern[] = [];
    if (code) {
      const patterns = await this.patternExtractor.extractPatterns(code, {
        task,
        error,
        ...context
      });

      // Mark patterns as anti-patterns
      antiPatterns = Object.values(patterns)
        .flat()
        .map(pattern => ({
          ...pattern,
          confidence: (pattern.confidence || 0) * -1, // Negative confidence = anti-pattern
          type: `anti-${pattern.type || 'pattern'}`
        }));
    }

    // Identify root cause
    const rootCause = this.identifyRootCause(error, code, context);

    // Generate suggestions
    const suggestions = this.generateFailureSuggestions(error, rootCause, antiPatterns);

    // Find similar failures
    const similarFailures = this.findSimilarFailures(task, error);

    const analysis: FailureAnalysis = {
      failureId,
      task,
      error,
      antiPatterns,
      rootCause,
      suggestions,
      similarFailures,
      timestamp: Date.now()
    };

    // Store failure analysis
    this.failureHistory.push(analysis);

    // Store anti-patterns
    const taskType = this.categorizeTask(task);
    if (!this.failurePatterns.has(taskType)) {
      this.failurePatterns.set(taskType, []);
    }
    this.failurePatterns.get(taskType)!.push(...antiPatterns);

    // Store in mirror memory as anti-patterns
    const mirrorMemory = getMirrorMemory();
    if (mirrorMemory) {
      for (const antiPattern of antiPatterns) {
        await mirrorMemory.storePattern(antiPattern, 'antiPatterns');
      }
    }

    console.log(`[AdvancedLearning] Analyzed failure: ${rootCause}`);

    return analysis;
  }

  /**
   * Amplify high-success patterns for reuse
   */
  async amplifySuccess(
    patternId: string,
    context: Record<string, any>
  ): Promise<SuccessAmplification> {
    const mirrorMemory = getMirrorMemory();
    if (!mirrorMemory) {
      throw new Error('Mirror memory not available');
    }

    const pattern = mirrorMemory.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Calculate success rate
    const successCount = this.successHistory.get(patternId) || 0;
    const totalUses = pattern.useCount || 1;
    const successRate = totalUses > 0 ? successCount / totalUses : 0;

    // Get contexts where pattern succeeded
    const contexts = this.getSuccessContexts(patternId);

    // Generate recommendations
    const recommendations = this.generateSuccessRecommendations(pattern, successRate, contexts);

    const amplification: SuccessAmplification = {
      patternId,
      pattern,
      successRate,
      usageCount: totalUses,
      contexts,
      recommendations
    };

    // Boost pattern confidence if success rate is high
    if (successRate > 0.8) {
      const boostedConfidence = Math.min(1.0, (pattern.confidence || 0.5) + 0.1);
      await mirrorMemory.updatePattern(patternId, {
        confidence: boostedConfidence,
        successRate
      });
    }

    return amplification;
  }

  /**
   * Learn patterns specific to project types/languages
   */
  async learnContextualPatterns(
    code: string,
    context: {
      language: string;
      projectType?: string;
      framework?: string;
    }
  ): Promise<MirrorPattern[]> {
    const patterns = await this.patternExtractor.extractPatterns(code, context);

    const contextualPatterns: Array<{ pattern: MirrorPattern; category: string }> = [];

    // Add context-specific metadata
    for (const category in patterns) {
      for (const pattern of patterns[category as keyof typeof patterns]) {
        const contextualPattern: MirrorPattern = {
          ...pattern,
          characteristics: {
            ...pattern.characteristics,
            language: context.language,
            projectType: context.projectType,
            framework: context.framework
          },
          metadata: {
            ...pattern.metadata,
            contextSpecific: true,
            learnedAt: Date.now()
          }
        };

        contextualPatterns.push({ pattern: contextualPattern, category });
      }
    }

    // Store contextual patterns
    const mirrorMemory = getMirrorMemory();
    if (mirrorMemory) {
      for (const { pattern, category } of contextualPatterns) {
        await mirrorMemory.storePattern(pattern, category);
      }
    }

    return contextualPatterns.map(cp => cp.pattern);
  }

  /**
   * Record pattern success with optional context
   */
  recordPatternSuccess(patternId: string, context?: string): void {
    const current = this.successHistory.get(patternId) || 0;
    this.successHistory.set(patternId, current + 1);

    // Track context
    if (context) {
      const contexts = this.successContexts.get(patternId) || [];
      if (!contexts.includes(context)) {
        contexts.push(context);
        // Keep only last 20 unique contexts
        if (contexts.length > 20) contexts.shift();
        this.successContexts.set(patternId, contexts);
      }
    }
  }

  /**
   * Record pattern failure
   */
  recordPatternFailure(patternId: string): void {
    // Decrease success count (but don't go negative)
    const current = this.successHistory.get(patternId) || 0;
    if (current > 0) {
      this.successHistory.set(patternId, current - 1);
    }
  }

  /**
   * Calculate context match score
   */
  private calculateContextMatch(
    pattern: MirrorPattern,
    contextText: string,
    context: Record<string, any>
  ): number {
    let match = 0;

    // Language match
    if (pattern.characteristics?.language === context.language) {
      match += 0.3;
    }

    // Project type match
    if (pattern.characteristics?.projectType === context.projectType) {
      match += 0.2;
    }

    // Description similarity
    if (pattern.description) {
      const similarity = this.textSimilarity(pattern.description, contextText);
      match += similarity * 0.3;
    }

    // Example similarity
    if (pattern.examples && pattern.examples.length > 0) {
      const exampleSimilarity = pattern.examples
        .map(ex => this.textSimilarity(ex, contextText))
        .reduce((max, sim) => Math.max(max, sim), 0);
      match += exampleSimilarity * 0.2;
    }

    return Math.min(1.0, match);
  }

  /**
   * Get success rate for a pattern
   */
  private getSuccessRate(patternId: string): number {
    const successCount = this.successHistory.get(patternId) || 0;
    const mirrorMemory = getMirrorMemory();
    const pattern = mirrorMemory?.getPatternSync(patternId);
    const totalUses = pattern?.useCount || 1;

    return totalUses > 0 ? successCount / totalUses : 0;
  }

  /**
   * Calculate recency score
   */
  private calculateRecency(pattern: MirrorPattern): number {
    if (!pattern.lastUsed) return 0.5;

    const daysSinceUse = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSinceUse / 30); // Decay over 30 days
  }

  /**
   * Calculate relevance to task
   */
  private calculateRelevance(pattern: MirrorPattern, task: string): number {
    if (!pattern.description) return 0.5;

    const taskLower = task.toLowerCase();
    const descLower = pattern.description.toLowerCase();

    // Keyword matching
    const taskWords = taskLower.split(/\s+/).filter(w => w.length > 3);
    const descWords = descLower.split(/\s+/).filter(w => w.length > 3);

    const matchingWords = taskWords.filter(word => descWords.includes(word));
    const relevance = matchingWords.length / Math.max(taskWords.length, 1);

    return Math.min(1.0, relevance);
  }

  /**
   * Build context text for matching
   */
  private buildContextText(
    task: string,
    context: Record<string, any>,
    similarFiles: any[]
  ): string {
    const parts: string[] = [task];

    if (context.language) parts.push(`Language: ${context.language}`);
    if (context.projectType) parts.push(`Project type: ${context.projectType}`);

    if (similarFiles.length > 0) {
      parts.push('Similar code:');
      similarFiles.slice(0, 2).forEach(file => {
        parts.push(file.content.substring(0, 200));
      });
    }

    return parts.join('\n');
  }

  /**
   * Build reasoning for prediction
   */
  private buildReasoning(
    pattern: MirrorPattern,
    contextMatch: number,
    successRate: number,
    relevance: number
  ): string {
    const reasons: string[] = [];

    if (contextMatch > 0.7) {
      reasons.push('high context match');
    }
    if (successRate > 0.8) {
      reasons.push('high success rate');
    }
    if (relevance > 0.7) {
      reasons.push('high task relevance');
    }
    if (pattern.confidence && pattern.confidence > 0.8) {
      reasons.push('high confidence pattern');
    }

    return reasons.length > 0
      ? `Predicted because: ${reasons.join(', ')}`
      : 'Moderate match based on multiple factors';
  }

  /**
   * Identify root cause of failure
   */
  private identifyRootCause(
    error: string,
    code?: string,
    context?: Record<string, any>
  ): string {
    const errorLower = error.toLowerCase();

    // Common root causes
    if (errorLower.includes('syntax') || errorLower.includes('parse')) {
      return 'Syntax error - code structure issue';
    }
    if (errorLower.includes('undefined') || errorLower.includes('null')) {
      return 'Null reference - missing initialization or checks';
    }
    if (errorLower.includes('import') || errorLower.includes('require')) {
      return 'Import error - missing dependency or incorrect path';
    }
    if (errorLower.includes('type') || errorLower.includes('typeerror')) {
      return 'Type error - incorrect data type usage';
    }
    if (errorLower.includes('async') || errorLower.includes('await')) {
      return 'Async/await error - incorrect asynchronous handling';
    }
    if (errorLower.includes('permission') || errorLower.includes('access')) {
      return 'Permission error - insufficient access rights';
    }
    if (errorLower.includes('timeout') || errorLower.includes('time')) {
      return 'Timeout error - operation took too long';
    }

    return 'Unknown error - requires deeper analysis';
  }

  /**
   * Generate failure suggestions
   */
  private generateFailureSuggestions(
    error: string,
    rootCause: string,
    antiPatterns: MirrorPattern[]
  ): string[] {
    const suggestions: string[] = [];

    // Root cause specific suggestions
    if (rootCause.includes('Syntax')) {
      suggestions.push('Review code structure and syntax');
      suggestions.push('Check for missing brackets, parentheses, or semicolons');
    }
    if (rootCause.includes('Null')) {
      suggestions.push('Add null checks before accessing properties');
      suggestions.push('Initialize variables before use');
    }
    if (rootCause.includes('Import')) {
      suggestions.push('Verify all dependencies are installed');
      suggestions.push('Check import paths are correct');
    }
    if (rootCause.includes('Type')) {
      suggestions.push('Verify data types match expected types');
      suggestions.push('Add type checking or validation');
    }
    if (rootCause.includes('Async')) {
      suggestions.push('Ensure async functions use await correctly');
      suggestions.push('Check promise handling');
    }

    // Anti-pattern avoidance
    if (antiPatterns.length > 0) {
      suggestions.push(`Avoid these anti-patterns: ${antiPatterns.slice(0, 3).map(p => p.type || 'pattern').join(', ')}`);
    }

    return suggestions.length > 0 ? suggestions : ['Review error message and code context'];
  }

  /**
   * Find similar failures
   */
  private findSimilarFailures(task: string, error: string): string[] {
    const taskLower = task.toLowerCase();
    const errorLower = error.toLowerCase();

    return this.failureHistory
      .filter(failure => {
        const failureTaskLower = failure.task.toLowerCase();
        const failureErrorLower = failure.error.toLowerCase();

        const taskSimilarity = this.textSimilarity(taskLower, failureTaskLower);
        const errorSimilarity = this.textSimilarity(errorLower, failureErrorLower);

        return taskSimilarity > 0.5 || errorSimilarity > 0.6;
      })
      .map(f => f.failureId)
      .slice(0, 5);
  }

  /**
   * Get recorded success contexts for a pattern
   */
  private getSuccessContexts(patternId: string): string[] {
    return this.successContexts.get(patternId) || [];
  }

  /**
   * Generate success recommendations
   */
  private generateSuccessRecommendations(
    pattern: MirrorPattern,
    successRate: number,
    contexts: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (successRate > 0.9) {
      recommendations.push('This pattern has excellent success rate - use frequently');
    }
    if (contexts.length > 0) {
      recommendations.push(`Works well in: ${contexts.join(', ')}`);
    }
    if (pattern.confidence && pattern.confidence > 0.8) {
      recommendations.push('High confidence pattern - reliable choice');
    }

    return recommendations;
  }

  /**
   * Categorize task type
   */
  private categorizeTask(task: string): string {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('create') || taskLower.includes('build')) return 'creation';
    if (taskLower.includes('fix') || taskLower.includes('bug')) return 'fix';
    if (taskLower.includes('refactor')) return 'refactoring';
    if (taskLower.includes('add') || taskLower.includes('feature')) return 'addition';

    return 'general';
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
   * Get failure statistics
   */
  getFailureStats(): {
    totalFailures: number;
    failuresByType: Record<string, number>;
    commonRootCauses: Array<{ cause: string; count: number }>;
  } {
    const failuresByType: Record<string, number> = {};
    const rootCauseCounts: Record<string, number> = {};

    for (const failure of this.failureHistory) {
      const taskType = this.categorizeTask(failure.task);
      failuresByType[taskType] = (failuresByType[taskType] || 0) + 1;

      rootCauseCounts[failure.rootCause] = (rootCauseCounts[failure.rootCause] || 0) + 1;
    }

    const commonRootCauses = Object.entries(rootCauseCounts)
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalFailures: this.failureHistory.length,
      failuresByType,
      commonRootCauses
    };
  }
}

// Singleton instance
let advancedLearningInstance: AdvancedLearningEngine | null = null;

export function getAdvancedLearningEngine(opusExamplesPath?: string): AdvancedLearningEngine {
  if (!advancedLearningInstance && opusExamplesPath) {
    advancedLearningInstance = new AdvancedLearningEngine(opusExamplesPath);
  } else if (!advancedLearningInstance) {
    // Default path
    const path = require('path');
    const defaultPath = path.join(process.cwd(), 'data', 'opus-examples');
    advancedLearningInstance = new AdvancedLearningEngine(defaultPath);
  }
  return advancedLearningInstance;
}

