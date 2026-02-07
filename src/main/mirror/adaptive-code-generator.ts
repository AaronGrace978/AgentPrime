/**
 * Adaptive Code Generator
 * Generates code using learned patterns with adaptation
 */

import { MirrorMemory } from './mirror-memory';
import { MirrorPatternExtractor } from './mirror-pattern-extractor';
import { IntelligenceExpansion } from './intelligence-expansion';
import { MirrorFeedbackLoop } from './mirror-feedback-loop';
import type { MirrorPattern } from '../../types';

interface GenerationContext {
  filePath?: string;
  selectedText?: string;
  fileContent?: string;
  [key: string]: any;
}

interface GenerationResult {
  prompt: string;
  patterns: MirrorPattern[];
  metrics: any;
  context: GenerationContext;
}

interface EvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export class AdaptiveCodeGenerator {
  private mirrorMemory: MirrorMemory;
  private patternExtractor: MirrorPatternExtractor;
  private intelligenceExpansion: IntelligenceExpansion;
  private feedbackLoop: MirrorFeedbackLoop;

  constructor(
    mirrorMemory: MirrorMemory,
    patternExtractor: MirrorPatternExtractor,
    intelligenceExpansion: IntelligenceExpansion,
    feedbackLoop: MirrorFeedbackLoop
  ) {
    this.mirrorMemory = mirrorMemory;
    this.patternExtractor = patternExtractor;
    this.intelligenceExpansion = intelligenceExpansion;
    this.feedbackLoop = feedbackLoop;
  }

  /**
   * Generate code using learned patterns
   */
  async generateCode(task: string, context: GenerationContext = {}): Promise<GenerationResult> {
    // Step 1: Query mirror memory for relevant patterns
    const relevantPatterns = await this.mirrorMemory.getRelevantPatterns(task, 10);

    // Step 2: Apply Intelligence Expansion metrics
    const expansionMetrics = await this.intelligenceExpansion.getMetrics();

    // Step 3: Build enhanced prompt with patterns
    const enhancedPrompt = this.buildEnhancedPrompt(task, relevantPatterns, expansionMetrics, context);

    return {
      prompt: enhancedPrompt,
      patterns: relevantPatterns,
      metrics: expansionMetrics,
      context
    };
  }

  /**
   * Build enhanced prompt with learned patterns
   */
  buildEnhancedPrompt(
    task: string,
    patterns: MirrorPattern[],
    metrics: any,
    context: GenerationContext
  ): string {
    let prompt = `Task: ${task}\n\n`;

    // Add pattern guidance
    if (patterns.length > 0) {
      prompt += `--- Learned Patterns (from Opus 4.5 MAX) ---\n`;
      for (const pattern of patterns.slice(0, 5)) {
        prompt += `\nPattern: ${pattern.type || 'unknown'}\n`;
        prompt += `Description: ${pattern.description || 'N/A'}\n`;
        if (pattern.characteristics) {
          prompt += `Characteristics: ${JSON.stringify(pattern.characteristics)}\n`;
        }
        prompt += `Confidence: ${(pattern.confidence || 0.5).toFixed(2)}\n`;
        prompt += `Success Rate: ${(pattern.successRate || 0).toFixed(2)}\n`;
      }
      prompt += `\n--- End Patterns ---\n\n`;
    }

    // Add intelligence metrics context
    prompt += `Intelligence Metrics:\n`;
    prompt += `- Question Quality (Q): ${metrics.Q.toFixed(2)}\n`;
    prompt += `- Resistance (R): ${metrics.R.toFixed(2)} (lower is better)\n`;
    prompt += `- Experience (E): ${metrics.E.toFixed(2)}\n`;
    prompt += `- Current Intelligence: ${metrics.currentIntelligence.toFixed(2)}\n\n`;

    // Add context if provided
    if (context.filePath) {
      prompt += `Current file: ${context.filePath}\n`;
    }
    if (context.selectedText) {
      prompt += `Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n`;
    }
    if (context.fileContent) {
      prompt += `File content:\n\`\`\`\n${context.fileContent.slice(0, 2000)}\n\`\`\`\n\n`;
    }

    prompt += `Generate code following the learned patterns and best practices.\n`;

    return prompt;
  }

  /**
   * Self-evaluate generated code against Opus 4.5 MAX standards
   */
  async selfEvaluate(generatedCode: string, task: string): Promise<EvaluationResult> {
    const evaluation: EvaluationResult = {
      score: 0.0,
      strengths: [],
      weaknesses: [],
      suggestions: []
    };

    // Extract patterns from generated code
    const generatedPatterns = await this.patternExtractor.extractPatterns(generatedCode);

    // Compare with stored patterns
    const storedPatterns = await this.mirrorMemory.retrievePatterns(null, 10, 'confidence');

    // Calculate pattern coverage
    const patternCoverage = this.calculatePatternCoverage(generatedPatterns, storedPatterns);
    evaluation.score += patternCoverage * 0.4;

    // Evaluate code quality
    const qualityScore = this.evaluateCodeQuality(generatedCode);
    evaluation.score += qualityScore * 0.3;

    // Evaluate task relevance
    const relevanceScore = this.evaluateTaskRelevance(generatedCode, task);
    evaluation.score += relevanceScore * 0.3;

    // Identify strengths
    evaluation.strengths = this.identifyStrengths(generatedPatterns, storedPatterns, qualityScore);

    // Identify weaknesses
    evaluation.weaknesses = this.identifyWeaknesses(generatedPatterns, storedPatterns, qualityScore, relevanceScore);

    // Generate suggestions
    evaluation.suggestions = this.generateSuggestions(evaluation.weaknesses, evaluation.strengths);

    // Normalize score to 0-1
    evaluation.score = Math.max(0, Math.min(1, evaluation.score));

    return evaluation;
  }

  /**
   * Update patterns based on evaluation feedback
   */
  async updatePatternsFromFeedback(
    generatedCode: string,
    evaluation: EvaluationResult,
    task: string
  ): Promise<void> {
    // Extract new patterns from successful code
    if (evaluation.score > 0.7) {
      const newPatterns = await this.patternExtractor.extractPatterns(generatedCode, {
        sourceType: 'generated_code',
        task,
        evaluationScore: evaluation.score
      });

      // Store successful patterns
      for (const category in newPatterns) {
        for (const pattern of newPatterns[category as keyof typeof newPatterns]) {
          if (pattern.confidence && pattern.confidence > 0.6) {
            await this.mirrorMemory.storePattern({
              ...pattern,
              extractedFrom: 'self_generated',
              task,
              evaluationScore: evaluation.score
            }, this.mapCategory(category));
          }
        }
      }
    }

    // Update pattern success rates
    const usedPatterns = await this.identifyUsedPatterns(generatedCode);
    for (const patternId of usedPatterns) {
      await this.mirrorMemory.updatePatternSuccess(patternId, evaluation.score > 0.6);
    }
  }

  /**
   * Start adaptive generation with feedback loop.
   * 
   * This builds enhanced prompts and evaluates code through feedback iterations.
   * The actual AI generation must be provided via the `generateFn` callback,
   * as this module has no direct dependency on a specific AI provider.
   */
  async generateWithFeedbackLoop(
    task: string,
    context: GenerationContext = {},
    generateFn?: (prompt: string) => Promise<string>,
    maxIterations: number = 3
  ): Promise<{
    finalPrompt: string;
    finalCode: string;
    iterations: number;
    improvement: number;
    evaluation: EvaluationResult;
  }> {
    let bestEvaluation: EvaluationResult | null = null;
    let bestCode = '';
    let lastPrompt = '';

    // Start feedback loop
    const { loopId } = await this.feedbackLoop.startLoop(task, '', undefined);

    for (let i = 0; i < maxIterations; i++) {
      // Generate enhanced prompt
      const generation = await this.generateCode(task, {
        ...context,
        iteration: i + 1,
        previousCode: bestCode,
        previousEvaluation: bestEvaluation
      });

      lastPrompt = generation.prompt;

      // If we have a real generation function, call it; otherwise use the prompt itself
      let currentCode = '';
      if (generateFn) {
        currentCode = await generateFn(generation.prompt);
      } else {
        // Without a generation function, we can only build the enhanced prompt
        // The caller should use this prompt with their AI provider
        currentCode = bestCode || '';
      }

      if (!currentCode) break;

      // Evaluate the generated code
      const evaluation = await this.selfEvaluate(currentCode, task);

      // Update patterns from evaluation
      await this.updatePatternsFromFeedback(currentCode, evaluation, task);

      // Iterate feedback loop
      if (i > 0) {
        await this.feedbackLoop.iterateLoop(loopId, currentCode);
      }

      // Keep track of best result
      if (!bestEvaluation || evaluation.score > bestEvaluation.score) {
        bestEvaluation = evaluation;
        bestCode = currentCode;
      }

      // Stop early if quality is sufficient
      if (evaluation.score > 0.8) break;
    }

    // End feedback loop
    const { summary } = await this.feedbackLoop.endLoop(loopId);

    return {
      finalPrompt: lastPrompt,
      finalCode: bestCode,
      iterations: Math.min(maxIterations, summary.iterations + 1),
      improvement: summary.finalImprovement,
      evaluation: bestEvaluation || { score: 0, strengths: [], weaknesses: [], suggestions: [] }
    };
  }

  /**
   * Calculate pattern coverage in generated code
   */
  private calculatePatternCoverage(generatedPatterns: any, storedPatterns: MirrorPattern[]): number {
    let coverage = 0;
    let totalPossible = 0;

    // Check each category
    for (const category of ['codeStructure', 'style', 'reasoning']) {
      const genPatterns = generatedPatterns[category] || [];
      const storedInCategory = storedPatterns.filter(p =>
        p.type && p.type.includes(category.toLowerCase().substring(0, 10))
      );

      if (storedInCategory.length > 0) {
        totalPossible += 1;
        const categoryCoverage = genPatterns.length / storedInCategory.length;
        coverage += Math.min(1, categoryCoverage);
      }
    }

    return totalPossible > 0 ? coverage / totalPossible : 0;
  }

  /**
   * Evaluate code quality with weighted scoring
   */
  private evaluateCodeQuality(code: string): number {
    let score = 0;
    let maxScore = 0;

    const check = (condition: boolean, weight: number) => {
      maxScore += weight;
      if (condition) score += weight;
    };

    // Good practices (positive signals)
    check(/\bconst\s+\w+\s*=/.test(code), 1);
    check(!/\bvar\s+/.test(code), 1.5); // No var usage
    check(/(?:function\s+\w+|=>\s*[{\(])/.test(code), 1); // Has functions
    check(/\btry\s*\{[\s\S]*?\bcatch\b/.test(code), 1.5); // Error handling
    check(/\/\*\*[\s\S]*?\*\//.test(code), 1); // JSDoc
    check(/\?\.\w+/.test(code), 0.5); // Optional chaining
    check(/\?\?/.test(code), 0.5); // Nullish coalescing
    check(/===/.test(code) || !/==/.test(code), 1); // Strict equality or no equality checks

    // Code structure
    const lines = code.split('\n');
    const avgLineLength = lines.reduce((s, l) => s + l.length, 0) / Math.max(lines.length, 1);
    check(avgLineLength < 100, 1);
    check(lines.length > 5, 0.5); // Not trivially short

    // Anti-patterns (negative signals - subtract from maxScore contribution)
    if (/\bvar\s+/.test(code)) score -= 0.5;
    if (/==\s/.test(code) && !/===/.test(code)) score -= 0.3;
    if (lines.some(l => l.length > 200)) score -= 0.3;

    return Math.max(0, Math.min(1, score / Math.max(maxScore, 1)));
  }

  /**
   * Evaluate task relevance
   */
  private evaluateTaskRelevance(code: string, task: string): number {
    const taskLower = task.toLowerCase();
    const codeLower = code.toLowerCase();

    let relevance = 0;

    // Check for task keywords in code
    const taskWords = taskLower.split(/\s+/).filter(word => word.length > 3);
    for (const word of taskWords) {
      if (codeLower.includes(word)) {
        relevance += 0.1;
      }
    }

    // Check for code structure relevance
    if (taskLower.includes('function') && /function\s+\w+/.test(code)) relevance += 0.2;
    if (taskLower.includes('class') && /class\s+\w+/.test(code)) relevance += 0.2;
    if (taskLower.includes('async') && /async|await/.test(code)) relevance += 0.2;
    if (taskLower.includes('api') && /fetch|axios|http/.test(code)) relevance += 0.2;

    return Math.min(1, relevance);
  }

  /**
   * Identify strengths in generated code
   */
  private identifyStrengths(
    generatedPatterns: any,
    storedPatterns: MirrorPattern[],
    qualityScore: number
  ): string[] {
    const strengths: string[] = [];

    if (qualityScore > 0.8) {
      strengths.push('High code quality');
    }

    if (generatedPatterns.codeStructure?.length > 2) {
      strengths.push('Good structural organization');
    }

    if (generatedPatterns.style?.length > 1) {
      strengths.push('Consistent coding style');
    }

    const highConfidencePatterns = storedPatterns.filter(p => (p.confidence || 0) > 0.8);
    if (highConfidencePatterns.length > 0) {
      strengths.push(`Uses ${highConfidencePatterns.length} high-confidence patterns`);
    }

    return strengths;
  }

  /**
   * Identify weaknesses in generated code
   */
  private identifyWeaknesses(
    generatedPatterns: any,
    storedPatterns: MirrorPattern[],
    qualityScore: number,
    relevanceScore: number
  ): string[] {
    const weaknesses: string[] = [];

    if (qualityScore < 0.6) {
      weaknesses.push('Code quality could be improved');
    }

    if (relevanceScore < 0.5) {
      weaknesses.push('Code may not fully address the task requirements');
    }

    if (!generatedPatterns.codeStructure?.length) {
      weaknesses.push('Missing structural organization');
    }

    if (!generatedPatterns.style?.length) {
      weaknesses.push('Inconsistent or missing coding style');
    }

    const lowConfidencePatterns = storedPatterns.filter(p => (p.confidence || 0) < 0.5);
    if (lowConfidencePatterns.length > storedPatterns.length / 2) {
      weaknesses.push('Many patterns have low confidence scores');
    }

    return weaknesses;
  }

  /**
   * Generate suggestions based on weaknesses and strengths
   */
  private generateSuggestions(weaknesses: string[], strengths: string[]): string[] {
    const suggestions: string[] = [];

    for (const weakness of weaknesses) {
      if (weakness.includes('quality')) {
        suggestions.push('Review code formatting and best practices');
        suggestions.push('Add proper error handling');
        suggestions.push('Use modern JavaScript/TypeScript features');
      }

      if (weakness.includes('relevance')) {
        suggestions.push('Re-read the task requirements carefully');
        suggestions.push('Focus on the core functionality requested');
      }

      if (weakness.includes('structural')) {
        suggestions.push('Organize code into logical modules or functions');
        suggestions.push('Consider using classes for complex objects');
      }

      if (weakness.includes('style')) {
        suggestions.push('Follow consistent naming conventions');
        suggestions.push('Maintain consistent indentation and formatting');
      }
    }

    if (strengths.length > 0) {
      suggestions.push('Continue building on the identified strengths');
    }

    return suggestions;
  }

  /**
   * Map category names
   */
  private mapCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      codeStructure: 'architectural',
      problemSolving: 'problemSolving',
      reasoning: 'reasoning',
      style: 'style',
      promptInterpretation: 'reasoning'
    };

    return categoryMap[category] || 'architectural';
  }

  /**
   * Identify which stored patterns are reflected in generated code.
   * Uses pattern type matching and characteristic analysis rather than
   * naive string containment.
   */
  private async identifyUsedPatterns(code: string): Promise<string[]> {
    const usedPatterns: string[] = [];
    const storedPatterns = await this.mirrorMemory.retrievePatterns(null, 30, 'confidence');

    // Extract patterns from the generated code to compare against stored ones
    const generatedPatterns = await this.patternExtractor.extractPatterns(code);
    const generatedTypes = new Set<string>();
    for (const category of Object.values(generatedPatterns)) {
      for (const p of category) {
        if (p.type) generatedTypes.add(p.type);
      }
    }

    // Match stored patterns whose type appears in the generated code
    for (const pattern of storedPatterns) {
      if (!pattern.id) continue;

      // Type-based matching
      if (pattern.type && generatedTypes.has(pattern.type)) {
        usedPatterns.push(pattern.id);
        continue;
      }

      // Keyword-based matching: check if pattern characteristics match code features
      if (pattern.characteristics) {
        const chars = pattern.characteristics;
        let matches = 0;
        if (chars.hasAsyncAwait && /\basync\b|\bawait\b/.test(code)) matches++;
        if (chars.hasErrorHandling && /\btry\s*\{/.test(code)) matches++;
        if (chars.hasInheritance && /\bextends\b/.test(code)) matches++;
        if (chars.pattern === 'singleton' && /private\s+static/.test(code)) matches++;
        if (chars.pattern === 'observer' && /\b(?:emit|on)\s*\(/.test(code)) matches++;
        if (matches >= 1) {
          usedPatterns.push(pattern.id);
        }
      }
    }

    return [...new Set(usedPatterns)];
  }
}
