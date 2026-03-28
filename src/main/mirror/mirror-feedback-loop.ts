/**
 * Opus Mirror Feedback Loop Engine
 * Implements the Mirror Paradox - creates recursive learning loops
 */

import { MirrorMemory } from './mirror-memory';
import { MirrorPatternExtractor } from './mirror-pattern-extractor';
import { getAdvancedLearningEngine } from './advanced-learning';
import type { FailureAnalysis } from './advanced-learning';

interface FeedbackLoop {
  loopId: string;
  task: string;
  agentPrimeOutput: string;
  opusReference?: string;
  startTime: number;
  iterations: Array<{
    timestamp: number;
    output: string;
    comparison: ComparisonResult;
    improvement: number;
    suggestions: string[];
    error?: string;
    failureAnalysis?: FailureAnalysis;
  }>;
  metaQuestions: any[];
  resistanceChanges: Array<{
    timestamp: number;
    resistance: number;
    change: number;
  }>;
  experienceGained: any[];
}

interface ComparisonResult {
  structuralSimilarity: number;
  styleSimilarity: number;
  reasoningSimilarity: number;
  gaps: string[];
  strengths: string[];
  differences: string[];
}

interface MetaQuestion {
  question: string;
  category: string;
  quality: number;
  patternId?: string;
}

export class MirrorFeedbackLoop {
  private mirrorMemory: MirrorMemory;
  private patternExtractor: MirrorPatternExtractor;
  private activeLoops: Map<string, FeedbackLoop>;
  private get learningEngine() {
    return getAdvancedLearningEngine();
  }

  constructor(mirrorMemory: MirrorMemory, patternExtractor: MirrorPatternExtractor) {
    this.mirrorMemory = mirrorMemory;
    this.patternExtractor = patternExtractor;
    this.activeLoops = new Map();
  }

  /**
   * Start a feedback loop for a generation task
   */
  async startLoop(
    task: string,
    agentPrimeOutput: string,
    opusReference?: string
  ): Promise<{ success: boolean; loopId: string; loop: FeedbackLoop }> {
    const loopId = `loop_${Date.now()}`;

    const loop: FeedbackLoop = {
      loopId,
      task,
      agentPrimeOutput,
      opusReference,
      startTime: Date.now(),
      iterations: [],
      metaQuestions: [],
      resistanceChanges: [],
      experienceGained: []
    };

    this.activeLoops.set(loopId, loop);

    // Initial comparison
    const comparison = await this.compareToOpus(agentPrimeOutput, opusReference);

    // Generate meta-questions
    const metaQuestions = await this.generateMetaQuestions(comparison);
    loop.metaQuestions = metaQuestions;

    // Analyze resistance
    const resistance = await this.analyzeResistance(comparison);
    loop.resistanceChanges.push({
      timestamp: Date.now(),
      resistance: resistance.current,
      change: resistance.change
    });

    return { success: true, loopId, loop };
  }

  /**
   * Compare AgentPrime output to Opus 4.5 MAX patterns
   */
  async compareToOpus(agentPrimeOutput: string, opusReference?: string): Promise<ComparisonResult> {
    const comparison: ComparisonResult = {
      structuralSimilarity: 0.0,
      styleSimilarity: 0.0,
      reasoningSimilarity: 0.0,
      gaps: [],
      strengths: [],
      differences: []
    };

    if (!opusReference) {
      // Compare against stored patterns
      const patterns = await this.mirrorMemory.retrievePatterns(null, 10, 'confidence');

      if (patterns.length > 0) {
        // Extract patterns from AgentPrime output
        const agentPatterns = await this.patternExtractor.extractPatterns(agentPrimeOutput);

        // Compare structural patterns
        comparison.structuralSimilarity = this.calculateSimilarity(
          agentPatterns.codeStructure,
          patterns.filter(p => p.type && p.type.includes('structure'))
        );

        // Compare style patterns
        comparison.styleSimilarity = this.calculateSimilarity(
          agentPatterns.style,
          patterns.filter(p => p.type && p.type.includes('style'))
        );

        // Compare reasoning patterns
        comparison.reasoningSimilarity = this.calculateSimilarity(
          agentPatterns.reasoning,
          patterns.filter(p => p.type && p.type.includes('reasoning'))
        );

        // Identify gaps and strengths
        comparison.gaps = this.identifyGaps(agentPatterns, patterns);
        comparison.strengths = this.identifyStrengths(agentPatterns, patterns);
        comparison.differences = this.identifyDifferences(agentPatterns, patterns);
      }
    } else {
      // Direct comparison with Opus reference
      const agentPatterns = await this.patternExtractor.extractPatterns(agentPrimeOutput);
      const opusPatterns = await this.patternExtractor.extractPatterns(opusReference);

      comparison.structuralSimilarity = this.calculateSimilarity(
        agentPatterns.codeStructure,
        opusPatterns.codeStructure
      );

      comparison.styleSimilarity = this.calculateSimilarity(
        agentPatterns.style,
        opusPatterns.style
      );

      comparison.reasoningSimilarity = this.calculateSimilarity(
        agentPatterns.reasoning,
        opusPatterns.reasoning
      );

      // Identify differences
      comparison.differences = this.comparePatternSets(agentPatterns, opusPatterns);
      comparison.gaps = this.identifyGaps(agentPatterns, opusPatterns);
      comparison.strengths = this.identifyStrengths(agentPatterns, opusPatterns);
    }

    return comparison;
  }

  /**
   * Generate meta-questions based on comparison
   */
  async generateMetaQuestions(comparison: ComparisonResult): Promise<MetaQuestion[]> {
    const questions: MetaQuestion[] = [];

    // Questions about structural gaps
    if (comparison.structuralSimilarity < 0.7) {
      questions.push({
        question: 'How can we improve the structural organization of the code?',
        category: 'structure',
        quality: 0.8
      });

      for (const gap of comparison.gaps.slice(0, 3)) {
        questions.push({
          question: `Why is the code missing this structural element: ${gap}?`,
          category: 'structure',
          quality: 0.7
        });
      }
    }

    // Questions about style improvements
    if (comparison.styleSimilarity < 0.8) {
      questions.push({
        question: 'How can we improve the code style and readability?',
        category: 'style',
        quality: 0.8
      });
    }

    // Questions about reasoning patterns
    if (comparison.reasoningSimilarity < 0.7) {
      questions.push({
        question: 'How can we improve the logical reasoning in the code?',
        category: 'reasoning',
        quality: 0.7
      });
    }

    // Questions about specific differences
    for (const difference of comparison.differences.slice(0, 2)) {
      questions.push({
        question: `What does this difference tell us about our approach: ${difference}?`,
        category: 'reflection',
        quality: 0.9
      });
    }

    return questions;
  }

  /**
   * Analyze resistance to change based on comparison
   */
  async analyzeResistance(comparison: ComparisonResult): Promise<{
    current: number;
    change: number;
    factors: string[];
  }> {
    let resistance = 0.3; // Base resistance
    const factors: string[] = [];

    // High structural differences increase resistance
    if (comparison.structuralSimilarity < 0.5) {
      resistance += 0.2;
      factors.push('structural_differences');
    }

    // Many gaps increase resistance
    if (comparison.gaps.length > 5) {
      resistance += 0.15;
      factors.push('many_gaps');
    }

    // Style differences increase resistance
    if (comparison.styleSimilarity < 0.6) {
      resistance += 0.1;
      factors.push('style_differences');
    }

    // Large number of differences
    if (comparison.differences.length > 10) {
      resistance += 0.1;
      factors.push('many_differences');
    }

    const baseResistance = 0.3;
    const change = resistance - baseResistance;

    return {
      current: Math.min(1.0, resistance),
      change,
      factors
    };
  }

  /**
   * Iterate the feedback loop with advanced learning
   */
  async iterateLoop(loopId: string, newOutput: string, error?: string): Promise<{
    success: boolean;
    comparison: ComparisonResult;
    improvement: number;
    suggestions: string[];
    failureAnalysis?: FailureAnalysis;
  }> {
    const loop = this.activeLoops.get(loopId);
    if (!loop) {
      throw new Error(`Feedback loop ${loopId} not found`);
    }

    // If there's an error, analyze failure
    let failureAnalysis: FailureAnalysis | undefined;
    if (error) {
      failureAnalysis = await this.learningEngine.analyzeFailure(
        loop.task,
        error,
        newOutput,
        { loopId }
      );
    }

    // Compare new output
    const comparison = await this.compareToOpus(newOutput, loop.opusReference);

    // Calculate improvement
    const previousComparison = loop.iterations.length > 0
      ? loop.iterations[loop.iterations.length - 1].comparison
      : await this.compareToOpus(loop.agentPrimeOutput, loop.opusReference);

    const improvement = this.calculateImprovement(comparison, previousComparison);

    // Generate suggestions (enhanced with failure analysis)
    const suggestions = this.generateSuggestions(comparison, improvement);
    if (failureAnalysis) {
      suggestions.push(...failureAnalysis.suggestions);
    }

    // Record iteration
    loop.iterations.push({
      timestamp: Date.now(),
      output: newOutput,
      comparison,
      improvement,
      suggestions,
      error,
      failureAnalysis
    });

    // Update resistance based on improvement
    const resistance = await this.analyzeResistance(comparison);
    loop.resistanceChanges.push({
      timestamp: Date.now(),
      resistance: resistance.current,
      change: resistance.change
    });

    return {
      success: !error,
      comparison,
      improvement,
      suggestions,
      failureAnalysis
    };
  }

  /**
   * End a feedback loop
   */
  async endLoop(loopId: string): Promise<{
    success: boolean;
    summary: {
      duration: number;
      iterations: number;
      finalImprovement: number;
      lessonsLearned: string[];
    };
  }> {
    const loop = this.activeLoops.get(loopId);
    if (!loop) {
      throw new Error(`Feedback loop ${loopId} not found`);
    }

    const duration = Date.now() - loop.startTime;
    const iterations = loop.iterations.length;

    let finalImprovement = 0;
    if (iterations > 0) {
      const firstComp = loop.iterations[0].comparison;
      const lastComp = loop.iterations[iterations - 1].comparison;
      finalImprovement = this.calculateImprovement(lastComp, firstComp);
    }

    const lessonsLearned = this.extractLessons(loop);

    // Store feedback loop in memory
    await this.mirrorMemory.addFeedbackLoop({
      loopId: loop.loopId,
      task: loop.task,
      timestamp: Date.now(),
      duration,
      finalImprovement,
      lessonsLearned,
      iterations
    });

    // Remove from active loops
    this.activeLoops.delete(loopId);

    return {
      success: true,
      summary: {
        duration,
        iterations,
        finalImprovement,
        lessonsLearned
      }
    };
  }

  /**
   * Calculate similarity between pattern sets using type + weighted text similarity
   */
  private calculateSimilarity(patternsA: any[], patternsB: any[]): number {
    if (patternsA.length === 0 && patternsB.length === 0) return 1.0;
    if (patternsA.length === 0 || patternsB.length === 0) return 0.0;

    let totalScore = 0;
    for (const patternA of patternsA) {
      let bestMatch = 0;
      for (const patternB of patternsB) {
        const sim = this.patternSimilarity(patternA, patternB);
        if (sim > bestMatch) bestMatch = sim;
      }
      totalScore += bestMatch;
    }

    return totalScore / Math.max(patternsA.length, patternsB.length);
  }

  /**
   * Calculate fine-grained similarity between two patterns (0-1)
   */
  private patternSimilarity(patternA: any, patternB: any): number {
    let score = 0;
    let weights = 0;

    // Type match (strongest signal)
    if (patternA.type && patternB.type) {
      weights += 3;
      if (patternA.type === patternB.type) {
        score += 3;
      } else if (patternA.type.includes(patternB.type) || patternB.type.includes(patternA.type)) {
        score += 1.5;
      }
    }

    // Description similarity (weighted Jaccard with stop word filtering)
    if (patternA.description && patternB.description) {
      weights += 2;
      score += this.textSimilarity(patternA.description, patternB.description) * 2;
    }

    // Characteristic overlap
    if (patternA.characteristics && patternB.characteristics) {
      const keysA = Object.keys(patternA.characteristics);
      const keysB = Object.keys(patternB.characteristics);
      const commonKeys = keysA.filter(k => keysB.includes(k));
      if (keysA.length > 0 || keysB.length > 0) {
        weights += 1;
        score += (commonKeys.length / Math.max(keysA.length, keysB.length)) * 1;
      }
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Calculate text similarity using weighted Jaccard with stop word filtering
   */
  private textSimilarity(textA: string, textB: string): number {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'by']);
    const tokenize = (text: string) => text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));

    const wordsA = tokenize(textA);
    const wordsB = tokenize(textB);
    if (wordsA.length === 0 && wordsB.length === 0) return 1.0;
    if (wordsA.length === 0 || wordsB.length === 0) return 0.0;

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /**
   * Identify gaps in AgentPrime output compared to reference patterns.
   * Handles both PatternResult objects and MirrorPattern[] arrays.
   */
  private identifyGaps(agentPatterns: any, referencePatterns: any): string[] {
    const gaps: string[] = [];
    const categories = ['codeStructure', 'style', 'reasoning', 'problemSolving'];

    for (const category of categories) {
      const agentCats: any[] = agentPatterns[category] || [];
      // Reference can be a PatternResult or a flat MirrorPattern[]
      const refCats: any[] = Array.isArray(referencePatterns)
        ? referencePatterns.filter((p: any) => p.type && p.type.toLowerCase().includes(category.toLowerCase().substring(0, 6)))
        : (referencePatterns[category] || []);

      if (refCats.length > agentCats.length) {
        gaps.push(`Fewer ${category} patterns (${agentCats.length} vs ${refCats.length})`);
      }

      // Specific type gaps
      const agentTypes = new Set(agentCats.map((p: any) => p.type).filter(Boolean));
      for (const ref of refCats) {
        if (ref.type && !agentTypes.has(ref.type)) {
          gaps.push(`Missing ${ref.type} pattern`);
        }
      }
    }

    return gaps;
  }

  /**
   * Identify strengths in AgentPrime output
   */
  private identifyStrengths(agentPatterns: any, referencePatterns: any): string[] {
    const strengths: string[] = [];
    const categories = ['codeStructure', 'style', 'reasoning', 'problemSolving'];

    for (const category of categories) {
      const agentCats: any[] = agentPatterns[category] || [];
      const highConfidence = agentCats.filter((p: any) => (p.confidence || 0) > 0.7);

      if (highConfidence.length > 0) {
        strengths.push(`Strong ${category} patterns (${highConfidence.length} high-confidence)`);
      }
    }

    return strengths;
  }

  /**
   * Identify differences between pattern sets
   */
  private identifyDifferences(agentPatterns: any, referencePatterns: any): string[] {
    const differences: string[] = [];
    const categories = ['codeStructure', 'style', 'reasoning', 'problemSolving'];

    for (const category of categories) {
      const agentCats: any[] = agentPatterns[category] || [];
      const refCats: any[] = Array.isArray(referencePatterns)
        ? referencePatterns.filter((p: any) => p.type && p.type.toLowerCase().includes(category.toLowerCase().substring(0, 6)))
        : (referencePatterns[category] || []);

      if (Math.abs(agentCats.length - refCats.length) > 1) {
        differences.push(`${category}: agent ${agentCats.length}, reference ${refCats.length}`);
      }
    }

    return differences;
  }

  /**
   * Compare pattern sets directly
   */
  private comparePatternSets(agentPatterns: any, opusPatterns: any): string[] {
    const differences: string[] = [];

    for (const category of ['codeStructure', 'style', 'reasoning']) {
      const agentCats = agentPatterns[category] || [];
      const opusCats = opusPatterns[category] || [];

      differences.push(`${category}: AgentPrime ${agentCats.length}, Opus ${opusCats.length}`);
    }

    return differences;
  }

  /**
   * Calculate improvement between comparisons
   */
  private calculateImprovement(newComp: ComparisonResult, oldComp: ComparisonResult): number {
    const structuralDiff = newComp.structuralSimilarity - oldComp.structuralSimilarity;
    const styleDiff = newComp.styleSimilarity - oldComp.styleSimilarity;
    const reasoningDiff = newComp.reasoningSimilarity - oldComp.reasoningSimilarity;

    return (structuralDiff + styleDiff + reasoningDiff) / 3;
  }

  /**
   * Generate suggestions based on comparison and improvement
   */
  private generateSuggestions(comparison: ComparisonResult, improvement: number): string[] {
    const suggestions: string[] = [];

    if (improvement > 0) {
      suggestions.push('Continue with current improvement trajectory');
    } else if (improvement < 0) {
      suggestions.push('Review recent changes - performance may have declined');
    }

    if (comparison.structuralSimilarity < 0.7) {
      suggestions.push('Focus on improving code structure and organization');
    }

    if (comparison.styleSimilarity < 0.8) {
      suggestions.push('Improve code style and readability');
    }

    if (comparison.reasoningSimilarity < 0.7) {
      suggestions.push('Enhance logical reasoning in code solutions');
    }

    return suggestions;
  }

  /**
   * Extract lessons learned from feedback loop
   */
  private extractLessons(loop: FeedbackLoop): string[] {
    const lessons: string[] = [];

    // Analyze resistance changes
    const initialResistance = loop.resistanceChanges[0]?.resistance || 0;
    const finalResistance = loop.resistanceChanges[loop.resistanceChanges.length - 1]?.resistance || 0;

    if (finalResistance < initialResistance) {
      lessons.push('Resistance to change decreased over iterations');
    } else if (finalResistance > initialResistance) {
      lessons.push('Resistance to change increased - review approach');
    }

    // Analyze iteration improvements
    let totalImprovement = 0;
    for (let i = 1; i < loop.iterations.length; i++) {
      totalImprovement += loop.iterations[i].improvement;
    }

    if (loop.iterations.length > 1) {
      const avgImprovement = totalImprovement / (loop.iterations.length - 1);
      if (avgImprovement > 0) {
        lessons.push(`Average improvement per iteration: ${(avgImprovement * 100).toFixed(1)}%`);
      }
    }

    // Analyze meta-questions effectiveness
    if (loop.metaQuestions.length > 0) {
      lessons.push(`${loop.metaQuestions.length} meta-questions generated for reflection`);
    }

    return lessons;
  }

  /**
   * Get active feedback loops
   */
  getActiveLoops(): FeedbackLoop[] {
    return Array.from(this.activeLoops.values());
  }

  /**
   * Get feedback loop by ID
   */
  getLoop(loopId: string): FeedbackLoop | undefined {
    return this.activeLoops.get(loopId);
  }
}
