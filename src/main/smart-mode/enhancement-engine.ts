/**
 * Enhancement Engine
 * Generates improvements based on intent analysis and intelligence level
 */

import type { MirrorMemory } from '../mirror/mirror-memory';
import type {
  IntentAnalysis,
  Enhancement,
  EnhancementResult,
  IntelligenceLevel,
  ConversationContext
} from './types';

/**
 * Configuration for enhancement generation per intelligence level
 */
const LEVEL_CONFIG = {
  basic: {
    maxEnhancements: 0,
    autoApplyPriorities: [] as string[],
    includeTypes: [] as string[]
  },
  smart: {
    maxEnhancements: 5,
    autoApplyPriorities: ['high'],
    includeTypes: ['error-handling', 'edge-case', 'security', 'accessibility']
  },
  genius: {
    maxEnhancements: 10,
    autoApplyPriorities: ['high', 'medium'],
    includeTypes: ['error-handling', 'edge-case', 'security', 'accessibility', 'quality', 'docs', 'ux', 'performance', 'testing']
  }
};

/**
 * Additional enhancements for Genius mode
 */
const GENIUS_ENHANCEMENTS: Enhancement[] = [
  {
    type: 'quality',
    description: 'Apply clean code principles and best practices',
    priority: 'high',
    autoApply: true
  },
  {
    type: 'docs',
    description: 'Add comprehensive documentation and examples',
    priority: 'medium',
    autoApply: true
  },
  {
    type: 'performance',
    description: 'Optimize for performance and efficiency',
    priority: 'medium',
    autoApply: false
  },
  {
    type: 'testing',
    description: 'Consider test coverage and testability',
    priority: 'medium',
    autoApply: false
  },
  {
    type: 'ux',
    description: 'Enhance user experience with feedback and polish',
    priority: 'medium',
    autoApply: true
  }
];

export class EnhancementEngine {
  private mirror: MirrorMemory | null;

  constructor(mirror?: MirrorMemory) {
    this.mirror = mirror || null;
  }

  /**
   * Generate enhancements based on intent analysis and intelligence level
   */
  async generateEnhancements(
    analysis: IntentAnalysis,
    intelligenceLevel: IntelligenceLevel,
    context?: ConversationContext
  ): Promise<EnhancementResult> {
    const startTime = Date.now();
    const config = LEVEL_CONFIG[intelligenceLevel];

    // If basic mode, return original request with no enhancements
    if (intelligenceLevel === 'basic') {
      return {
        originalRequest: analysis.literalRequest,
        enhancedPrompt: analysis.literalRequest,
        appliedEnhancements: [],
        suggestedEnhancements: [],
        intelligenceLevel,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          enhancementsConsidered: 0,
          enhancementsApplied: 0
        }
      };
    }

    // Collect all candidate enhancements
    let candidates = [...analysis.suggestedEnhancements];

    // Add Genius-level enhancements
    if (intelligenceLevel === 'genius') {
      candidates.push(...GENIUS_ENHANCEMENTS);
    }

    // Add enhancements from Mirror Memory success patterns
    if (this.mirror && context) {
      const patternEnhancements = await this.getPatternEnhancements(analysis, context);
      candidates.push(...patternEnhancements);
    }

    // Filter and prioritize enhancements
    const filteredEnhancements = this.filterEnhancements(candidates, config);

    // Separate auto-apply from suggested
    const appliedEnhancements = filteredEnhancements.filter(e => 
      e.autoApply && config.autoApplyPriorities.includes(e.priority)
    ).slice(0, config.maxEnhancements);

    const suggestedEnhancements = filteredEnhancements.filter(e => 
      !appliedEnhancements.includes(e)
    ).slice(0, 5);

    // Build the enhanced prompt
    const enhancedPrompt = this.buildEnhancedPrompt(
      analysis,
      appliedEnhancements,
      intelligenceLevel,
      context
    );

    return {
      originalRequest: analysis.literalRequest,
      enhancedPrompt,
      appliedEnhancements,
      suggestedEnhancements,
      intelligenceLevel,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        enhancementsConsidered: candidates.length,
        enhancementsApplied: appliedEnhancements.length
      }
    };
  }

  /**
   * Get enhancements from Mirror Memory patterns
   */
  private async getPatternEnhancements(
    analysis: IntentAnalysis,
    context: ConversationContext
  ): Promise<Enhancement[]> {
    const enhancements: Enhancement[] = [];

    if (!this.mirror) return enhancements;

    try {
      // Get relevant patterns
      const patterns = await this.mirror.getRelevantPatterns(analysis.literalRequest, 5);

      for (const pattern of patterns) {
        // Convert successful patterns to enhancements
        if (pattern.successRate && pattern.successRate > 0.7) {
          enhancements.push({
            type: 'quality',
            description: `Apply learned pattern: ${pattern.description?.substring(0, 100)}`,
            priority: pattern.successRate > 0.9 ? 'high' : 'medium',
            autoApply: pattern.successRate > 0.85
          });
        }
      }

      // Check for anti-patterns to avoid
      const antiPatterns = await this.mirror.retrievePatterns('antiPatterns', 3, 'recent');
      for (const antiPattern of antiPatterns) {
        if (this.isRelevantAntiPattern(antiPattern, analysis)) {
          enhancements.push({
            type: 'edge-case',
            description: `Avoid: ${antiPattern.description?.substring(0, 100)}`,
            priority: 'high',
            autoApply: true
          });
        }
      }
    } catch (error) {
      // Mirror not available, continue without pattern enhancements
      console.warn('[EnhancementEngine] Could not get pattern enhancements:', error);
    }

    return enhancements;
  }

  /**
   * Check if an anti-pattern is relevant to the current analysis
   */
  private isRelevantAntiPattern(antiPattern: any, analysis: IntentAnalysis): boolean {
    if (!antiPattern.description) return false;
    
    const antiDesc = antiPattern.description.toLowerCase();
    const keywords = analysis.keywords;
    
    // Check if any keywords match
    return keywords.some(keyword => antiDesc.includes(keyword));
  }

  /**
   * Filter enhancements based on configuration
   */
  private filterEnhancements(
    enhancements: Enhancement[],
    config: typeof LEVEL_CONFIG.smart
  ): Enhancement[] {
    // Filter by allowed types
    let filtered = enhancements.filter(e => 
      config.includeTypes.length === 0 || config.includeTypes.includes(e.type)
    );

    // Remove duplicates based on description
    const seen = new Set<string>();
    filtered = filtered.filter(e => {
      const key = `${e.type}:${e.description.substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return filtered;
  }

  /**
   * Build the enhanced prompt with all context and enhancements
   */
  private buildEnhancedPrompt(
    analysis: IntentAnalysis,
    appliedEnhancements: Enhancement[],
    intelligenceLevel: IntelligenceLevel,
    context?: ConversationContext
  ): string {
    const parts: string[] = [];

    // Original request
    parts.push(analysis.trueIntent);

    // Add implicit requirements
    if (analysis.implicitRequirements.length > 0) {
      parts.push('\n\n**Implicit Requirements:**');
      for (const req of analysis.implicitRequirements) {
        parts.push(`- ${req}`);
      }
    }

    // Add applied enhancements
    if (appliedEnhancements.length > 0) {
      parts.push('\n\n**Enhancements to Apply:**');
      for (const enhancement of appliedEnhancements) {
        parts.push(`- ${enhancement.description}`);
      }
    }

    // Add context clues for Smart/Genius
    if (intelligenceLevel !== 'basic' && analysis.contextClues.length > 0) {
      const relevantClues = analysis.contextClues
        .filter(c => c.confidence > 0.6)
        .slice(0, 3);
      
      if (relevantClues.length > 0) {
        parts.push('\n\n**Context:**');
        for (const clue of relevantClues) {
          parts.push(`- ${clue.content}`);
        }
      }
    }

    // Add user preferences for Genius mode
    if (intelligenceLevel === 'genius' && context?.userPreferences) {
      const relevantPrefs = context.userPreferences
        .filter(p => p.confidence > 0.7)
        .slice(0, 3);
      
      if (relevantPrefs.length > 0) {
        parts.push('\n\n**User Preferences:**');
        for (const pref of relevantPrefs) {
          parts.push(`- ${pref.key}: ${pref.value}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Learn from feedback on enhancements
   */
  async learnFromFeedback(
    enhancement: Enhancement,
    liked: boolean,
    context?: ConversationContext
  ): Promise<void> {
    if (!this.mirror) return;

    try {
      // Store the enhancement as a pattern with success/failure rate
      await this.mirror.storePattern({
        id: `enhancement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: enhancement.type,
        description: enhancement.description,
        confidence: liked ? 0.8 : 0.2,
        successRate: liked ? 1.0 : 0.0,
        metadata: {
          enhancementType: enhancement.type,
          priority: enhancement.priority,
          taskType: context?.activeFile ? 'code' : 'general'
        }
      }, 'smartEnhancements');

      console.log(`[EnhancementEngine] Learned from feedback: ${enhancement.description} (${liked ? 'liked' : 'disliked'})`);
    } catch (error) {
      console.warn('[EnhancementEngine] Could not store enhancement feedback:', error);
    }
  }
}
