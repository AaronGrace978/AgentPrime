/**
 * AgentPrime - Completion Pattern Recognizer
 * Learns and recognizes completion patterns for intelligent suggestions
 * Integrates with Mirror Intelligence for codebase-specific patterns
 */

import { getMirrorMemory } from '../mirror/mirror-singleton';
import { MirrorPatternExtractor } from '../mirror/mirror-pattern-extractor';
import type { MirrorPattern } from '../../types';

interface CompletionPattern {
  id: string;
  trigger: string; // What triggers this pattern (e.g., "function", "if", "class")
  context: string[]; // Surrounding context keywords
  completions: string[]; // Possible completions
  language: string;
  confidence: number;
  usageCount: number;
  lastUsed: number;
  category: 'function' | 'statement' | 'expression' | 'declaration' | 'control-flow';
}

interface PatternMatch {
  pattern: CompletionPattern;
  confidence: number;
  completion: string;
}

export class CompletionPatternRecognizer {
  private patterns: Map<string, CompletionPattern> = new Map();
  private contextHistory: string[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly MIN_CONFIDENCE = 0.3;

  constructor() {
    this.initializeBasePatterns();
  }

  /**
   * Recognize completion patterns in current context
   */
  async recognizePatterns(
    beforeCursor: string,
    language: string,
    context?: {
      recentEdits?: string[];
      visibleCode?: string;
      imports?: string[];
    }
  ): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const currentLine = this.getCurrentLine(beforeCursor);
    const contextKeywords = this.extractContextKeywords(beforeCursor, context);

    // Check each pattern for matches
    for (const pattern of this.patterns.values()) {
      if (pattern.language !== language && pattern.language !== 'any') continue;

      const matchConfidence = this.calculateMatchConfidence(pattern, currentLine, contextKeywords);
      if (matchConfidence >= this.MIN_CONFIDENCE) {
        // Get best completion for this pattern
        const completion = this.selectBestCompletion(pattern, contextKeywords);
        if (completion) {
          matches.push({
            pattern,
            confidence: matchConfidence,
            completion
          });
        }
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Learn from context
    this.learnFromContext(beforeCursor, language, context);

    return matches.slice(0, 5); // Return top 5 matches
  }

  /**
   * Learn patterns from successful completions
   */
  async learnFromCompletion(
    beforeCursor: string,
    acceptedCompletion: string,
    language: string
  ): Promise<void> {
    const trigger = this.extractTrigger(beforeCursor);
    const context = this.extractContextKeywords(beforeCursor);

    if (!trigger) return;

    const patternId = `${language}:${trigger}`;

    if (this.patterns.has(patternId)) {
      // Update existing pattern
      const pattern = this.patterns.get(patternId)!;
      if (!pattern.completions.includes(acceptedCompletion)) {
        pattern.completions.push(acceptedCompletion);
      }
      pattern.usageCount++;
      pattern.lastUsed = Date.now();
      pattern.confidence = Math.min(1.0, pattern.confidence + 0.1);
    } else {
      // Create new pattern
      const newPattern: CompletionPattern = {
        id: patternId,
        trigger,
        context,
        completions: [acceptedCompletion],
        language,
        confidence: 0.5,
        usageCount: 1,
        lastUsed: Date.now(),
        category: this.categorizePattern(trigger, language)
      };
      this.patterns.set(patternId, newPattern);
    }

    // Store in mirror memory for persistence
    try {
      const mirrorMemory = getMirrorMemory();
      if (!mirrorMemory) return;
      await mirrorMemory.storePattern({
        id: `completion_${patternId}`,
        category: 'completion',
        pattern: trigger,
        examples: [acceptedCompletion],
        confidence: 0.8,
        extractedFrom: 'user_completion',
        characteristics: {
          language,
          context: context.join(','),
          trigger
        },
        description: `Completion pattern for ${trigger} in ${language}`,
        type: 'completion',
        successRate: 1.0,
        useCount: 1,
        lastUsed: Date.now(),
        created: Date.now(),
        metadata: {
          category: this.categorizePattern(trigger, language),
          contextKeywords: context
        },
        sourceType: 'completion_learning',
        task: 'code_completion'
      });
    } catch (error) {
      console.warn('[CompletionPatternRecognizer] Failed to store pattern:', error);
    }
  }

  /**
   * Get enhanced completions using learned patterns
   */
  async getEnhancedCompletions(
    beforeCursor: string,
    language: string,
    baseCompletions: string[],
    context?: any
  ): Promise<string[]> {
    const patternMatches = await this.recognizePatterns(beforeCursor, language, context);

    const enhancedCompletions = [...baseCompletions];

    // Add pattern-based completions
    for (const match of patternMatches) {
      if (!enhancedCompletions.includes(match.completion)) {
        enhancedCompletions.push(match.completion);
      }
    }

    // Re-rank completions based on pattern confidence
    return this.rankCompletions(enhancedCompletions, patternMatches, beforeCursor);
  }

  /**
   * Extract trigger from current context
   */
  private extractTrigger(beforeCursor: string): string {
    const currentLine = this.getCurrentLine(beforeCursor);
    const words = currentLine.trim().split(/\s+/);

    // Look for common triggers
    for (const word of words.reverse()) {
      if (this.isTriggerWord(word)) {
        return word;
      }
    }

    // Look for partial triggers at the end
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length >= 2) {
      return lastWord;
    }

    return '';
  }

  /**
   * Extract context keywords for better matching
   */
  private extractContextKeywords(
    beforeCursor: string,
    context?: { recentEdits?: string[]; visibleCode?: string; imports?: string[] }
  ): string[] {
    const keywords: string[] = [];

    // Current line keywords
    const currentLine = this.getCurrentLine(beforeCursor);
    const lineWords = currentLine.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    keywords.push(...lineWords);

    // Recent context keywords
    const recentContext = beforeCursor.substring(Math.max(0, beforeCursor.length - 200));
    const contextWords = recentContext.toLowerCase().match(/\b\w{3,}\b/g) || [];
    keywords.push(...contextWords.slice(-10)); // Last 10 words

    // Recent edits
    if (context?.recentEdits) {
      for (const edit of context.recentEdits.slice(-3)) {
        const editWords = edit.toLowerCase().match(/\b\w{3,}\b/g) || [];
        keywords.push(...editWords);
      }
    }

    // Imports
    if (context?.imports) {
      for (const imp of context.imports) {
        const importWords = imp.split(/[^\w]/).filter(w => w.length > 2);
        keywords.push(...importWords);
      }
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Calculate how well a pattern matches current context
   */
  private calculateMatchConfidence(
    pattern: CompletionPattern,
    currentLine: string,
    contextKeywords: string[]
  ): number {
    let confidence = 0;

    // Trigger match (high weight)
    if (currentLine.includes(pattern.trigger)) {
      confidence += 0.4;
    }

    // Context keyword matches (medium weight)
    const contextMatches = pattern.context.filter(keyword =>
      contextKeywords.some(ctxKeyword =>
        ctxKeyword.includes(keyword) || keyword.includes(ctxKeyword)
      )
    ).length;
    confidence += (contextMatches / pattern.context.length) * 0.3;

    // Usage-based confidence (low weight)
    confidence += Math.min(pattern.usageCount / 10, 0.2);

    // Recency boost (very low weight)
    const daysSinceLastUse = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 0.1 - daysSinceLastUse * 0.01);
    confidence += recencyBoost;

    return Math.min(confidence, 1.0);
  }

  /**
   * Select best completion for a pattern
   */
  private selectBestCompletion(pattern: CompletionPattern, contextKeywords: string[]): string {
    if (pattern.completions.length === 1) {
      return pattern.completions[0];
    }

    // Score completions based on context relevance
    const scored = pattern.completions.map(completion => {
      let score = 0;

      // Prefer recently used completions
      const usageIndex = pattern.completions.indexOf(completion);
      score += (pattern.completions.length - usageIndex) * 0.1;

      // Context keyword relevance
      const completionWords = completion.toLowerCase().split(/\W+/);
      const contextMatches = completionWords.filter(word =>
        contextKeywords.some(ctxWord => ctxWord.includes(word))
      ).length;
      score += (contextMatches / completionWords.length) * 0.3;

      return { completion, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].completion;
  }

  /**
   * Rank completions combining AI and pattern-based scoring
   */
  private rankCompletions(
    completions: string[],
    patternMatches: PatternMatch[],
    beforeCursor: string
  ): string[] {
    const scored = completions.map(completion => {
      let score = 0.5; // Base score

      // Pattern-based boost
      const patternMatch = patternMatches.find(match => match.completion === completion);
      if (patternMatch) {
        score += patternMatch.confidence * 0.3;
      }

      // Length appropriateness (prefer reasonable lengths)
      const length = completion.length;
      if (length > 5 && length < 100) {
        score += 0.1;
      }

      // Context relevance (contains keywords from beforeCursor)
      const contextWords = beforeCursor.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      const completionWords = completion.toLowerCase().split(/\W+/);
      const relevantWords = completionWords.filter(word =>
        contextWords.some(ctxWord => ctxWord.includes(word))
      ).length;
      score += (relevantWords / completionWords.length) * 0.1;

      return { completion, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .map(item => item.completion);
  }

  /**
   * Learn patterns from coding context
   */
  private async learnFromContext(
    beforeCursor: string,
    language: string,
    context?: any
  ): Promise<void> {
    // Update context history
    this.contextHistory.push(beforeCursor);
    if (this.contextHistory.length > this.MAX_HISTORY) {
      this.contextHistory.shift();
    }

    // Analyze for new patterns every 10 contexts
    if (this.contextHistory.length % 10 === 0) {
      await this.analyzeContextPatterns(language);
    }
  }

  /**
   * Analyze accumulated context for new patterns
   */
  private async analyzeContextPatterns(language: string): Promise<void> {
    try {
      const patternExtractor = new MirrorPatternExtractor(process.cwd());
      const combinedContext = this.contextHistory.join('\n');

      const patterns = await patternExtractor.extractPatterns(combinedContext, {
        language,
        source: 'completion_context'
      });

      // Convert to completion patterns
      for (const stylePattern of patterns.style) {
        if ((stylePattern.confidence ?? 0) > 0.7) {
          const completionPattern = this.convertToCompletionPattern(stylePattern, language);
          if (completionPattern) {
            this.patterns.set(completionPattern.id, completionPattern);
          }
        }
      }
    } catch (error) {
      console.warn('[CompletionPatternRecognizer] Failed to analyze context patterns:', error);
    }
  }

  /**
   * Convert mirror pattern to completion pattern
   */
  private convertToCompletionPattern(mirrorPattern: MirrorPattern, language: string): CompletionPattern | null {
    const trigger = mirrorPattern.pattern?.split(' ')[0] || '';
    if (!trigger) return null;

    return {
      id: `mirror_${mirrorPattern.id}`,
      trigger,
      context: mirrorPattern.examples?.[0]?.split(/\W+/) || [],
      completions: mirrorPattern.examples || [],
      language,
      confidence: mirrorPattern.confidence || 0.5,
      usageCount: mirrorPattern.useCount || 1,
      lastUsed: mirrorPattern.lastUsed || Date.now(),
      category: 'statement'
    };
  }

  /**
   * Initialize base patterns for common programming constructs
   */
  private initializeBasePatterns(): void {
    const basePatterns: CompletionPattern[] = [
      // JavaScript/TypeScript
      {
        id: 'js_function',
        trigger: 'function',
        context: ['function', 'const', 'let', 'var'],
        completions: ['function name(params) {\n  // TODO\n}'],
        language: 'javascript',
        confidence: 0.8,
        usageCount: 100,
        lastUsed: Date.now(),
        category: 'function'
      },
      {
        id: 'js_arrow_function',
        trigger: 'const',
        context: ['const', 'function', '=>'],
        completions: ['const name = (params) => {\n  // TODO\n};'],
        language: 'javascript',
        confidence: 0.7,
        usageCount: 80,
        lastUsed: Date.now(),
        category: 'function'
      },
      {
        id: 'js_if_statement',
        trigger: 'if',
        context: ['if', 'else', 'condition'],
        completions: ['if (condition) {\n  // TODO\n}'],
        language: 'javascript',
        confidence: 0.9,
        usageCount: 150,
        lastUsed: Date.now(),
        category: 'control-flow'
      },
      {
        id: 'js_class',
        trigger: 'class',
        context: ['class', 'extends', 'implements'],
        completions: ['class Name {\n  constructor() {\n    // TODO\n  }\n}'],
        language: 'javascript',
        confidence: 0.8,
        usageCount: 90,
        lastUsed: Date.now(),
        category: 'declaration'
      },

      // Python
      {
        id: 'py_function',
        trigger: 'def',
        context: ['def', 'function'],
        completions: ['def function_name(params):\n    """TODO: docstring"""\n    pass'],
        language: 'python',
        confidence: 0.9,
        usageCount: 120,
        lastUsed: Date.now(),
        category: 'function'
      },
      {
        id: 'py_if_statement',
        trigger: 'if',
        context: ['if', 'elif', 'else'],
        completions: ['if condition:\n    # TODO\n    pass'],
        language: 'python',
        confidence: 0.8,
        usageCount: 100,
        lastUsed: Date.now(),
        category: 'control-flow'
      },
      {
        id: 'py_class',
        trigger: 'class',
        context: ['class', 'def', 'self'],
        completions: ['class ClassName:\n    """TODO: docstring"""\n    \n    def __init__(self):\n        pass'],
        language: 'python',
        confidence: 0.8,
        usageCount: 85,
        lastUsed: Date.now(),
        category: 'declaration'
      }
    ];

    for (const pattern of basePatterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Check if word is a trigger word
   */
  private isTriggerWord(word: string): boolean {
    const triggers = [
      'function', 'const', 'let', 'var', 'class', 'if', 'for', 'while',
      'def', 'class', 'if', 'for', 'import', 'from', 'try', 'catch'
    ];
    return triggers.includes(word.toLowerCase());
  }

  /**
   * Get current line from beforeCursor
   */
  private getCurrentLine(beforeCursor: string): string {
    const lines = beforeCursor.split('\n');
    return lines[lines.length - 1] || '';
  }

  /**
   * Categorize pattern type
   */
  private categorizePattern(trigger: string, language: string): CompletionPattern['category'] {
    const functionTriggers = ['function', 'def', 'const', 'let', 'var'];
    const controlFlowTriggers = ['if', 'for', 'while', 'switch', 'try'];
    const declarationTriggers = ['class', 'interface', 'type', 'enum'];

    if (functionTriggers.includes(trigger.toLowerCase())) return 'function';
    if (controlFlowTriggers.includes(trigger.toLowerCase())) return 'control-flow';
    if (declarationTriggers.includes(trigger.toLowerCase())) return 'declaration';

    return 'statement';
  }

  /**
   * Get statistics about learned patterns
   */
  getStats(): any {
    return {
      totalPatterns: this.patterns.size,
      patternsByLanguage: this.getPatternsByLanguage(),
      patternsByCategory: this.getPatternsByCategory(),
      contextHistorySize: this.contextHistory.length
    };
  }

  private getPatternsByLanguage(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pattern of this.patterns.values()) {
      stats[pattern.language] = (stats[pattern.language] || 0) + 1;
    }
    return stats;
  }

  private getPatternsByCategory(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pattern of this.patterns.values()) {
      stats[pattern.category] = (stats[pattern.category] || 0) + 1;
    }
    return stats;
  }
}

// Singleton instance
let completionPatternRecognizerInstance: CompletionPatternRecognizer | null = null;

export function getCompletionPatternRecognizer(): CompletionPatternRecognizer {
  if (!completionPatternRecognizerInstance) {
    completionPatternRecognizerInstance = new CompletionPatternRecognizer();
  }
  return completionPatternRecognizerInstance;
}
