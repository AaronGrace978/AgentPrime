/**
 * Smart Mode - Matrix Agent Intelligence System
 * 
 * Provides intelligent intent analysis, enhancement generation,
 * and proactive improvements for the Matrix Agent.
 */

// Export types
export * from './types';

// Export components
export { IntentAnalyzer } from './intent-analyzer';
export { EnhancementEngine } from './enhancement-engine';
export {
  getSystemPrompt,
  buildEnhancedUserMessage,
  getIntelligenceLevelDescription,
  parseIntelligenceLevel,
  INTELLIGENCE_LEVEL_LABELS
} from './smart-prompts';

// Import for SmartIntentProcessor
import { IntentAnalyzer } from './intent-analyzer';
import { EnhancementEngine } from './enhancement-engine';
import { getSystemPrompt, buildEnhancedUserMessage } from './smart-prompts';
import type { MirrorMemory } from '../mirror/mirror-memory';
import type {
  IntelligenceLevel,
  ConversationContext,
  SmartModeResult,
  ConversationMessage
} from './types';

/**
 * SmartIntentProcessor - Main orchestrator for Smart Mode
 * Combines intent analysis and enhancement generation
 */
export class SmartIntentProcessor {
  private intentAnalyzer: IntentAnalyzer;
  private enhancementEngine: EnhancementEngine;

  constructor(mirror?: MirrorMemory) {
    this.intentAnalyzer = new IntentAnalyzer(mirror);
    this.enhancementEngine = new EnhancementEngine(mirror);
  }

  /**
   * Process a user message through the Smart Mode pipeline
   */
  async process(
    message: string,
    intelligenceLevel: IntelligenceLevel,
    context: ConversationContext
  ): Promise<SmartModeResult> {
    try {
      // Step 1: Analyze intent
      const intentAnalysis = await this.intentAnalyzer.analyze(message, context);

      // Step 2: Generate enhancements
      const enhancementResult = await this.enhancementEngine.generateEnhancements(
        intentAnalysis,
        intelligenceLevel,
        context
      );

      return {
        intentAnalysis,
        enhancementResult,
        success: true
      };
    } catch (error: any) {
      console.error('[SmartIntentProcessor] Error:', error);
      
      // Return a minimal result on error
      return {
        intentAnalysis: {
          literalRequest: message,
          trueIntent: message,
          implicitRequirements: [],
          suggestedEnhancements: [],
          confidenceScore: 0,
          contextClues: [],
          keywords: [],
          isFollowUp: false
        },
        enhancementResult: {
          originalRequest: message,
          enhancedPrompt: message,
          appliedEnhancements: [],
          suggestedEnhancements: [],
          intelligenceLevel,
          metadata: {
            processingTimeMs: 0,
            enhancementsConsidered: 0,
            enhancementsApplied: 0
          }
        },
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the system prompt for the current intelligence level
   */
  getSystemPrompt(intelligenceLevel: IntelligenceLevel, webSearchEnabled: boolean = false): string {
    return getSystemPrompt(intelligenceLevel, webSearchEnabled);
  }

  /**
   * Build the enhanced user message
   */
  buildEnhancedMessage(
    originalMessage: string,
    result: SmartModeResult
  ): string {
    return buildEnhancedUserMessage(
      originalMessage,
      result.intentAnalysis,
      result.enhancementResult
    );
  }

  /**
   * Build conversation context from history
   */
  static buildContext(
    history: ConversationMessage[],
    workspacePath?: string,
    projectFiles?: string[]
  ): ConversationContext {
    return {
      history,
      workspacePath,
      projectFiles
    };
  }
}

/**
 * Singleton instance of SmartIntentProcessor
 * Initialize with Mirror Memory when available
 */
let smartProcessor: SmartIntentProcessor | null = null;

export function getSmartProcessor(mirror?: MirrorMemory): SmartIntentProcessor {
  if (!smartProcessor || mirror) {
    smartProcessor = new SmartIntentProcessor(mirror);
  }
  return smartProcessor;
}

export function resetSmartProcessor(): void {
  smartProcessor = null;
}
