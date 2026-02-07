/**
 * AgentPrime - Pattern Predictor
 * Predicts likely patterns before execution based on task context
 */

import { getAdvancedLearningEngine } from './advanced-learning';
import { getMirrorMemory } from './mirror-singleton';
import type { PatternPrediction } from './advanced-learning';

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
 * Prediction request
 */
export interface PredictionRequest {
  task: string;
  language?: string;
  projectType?: string;
  files?: string[];
  workspacePath?: string;
  maxPredictions?: number;
}

/**
 * Pattern Predictor - Predicts likely patterns before execution
 */
export class PatternPredictor {
  private learningEngine = getAdvancedLearningEngine();

  /**
   * Predict patterns for a task
   */
  async predictPatterns(request: PredictionRequest): Promise<PatternPrediction[]> {
    const {
      task,
      language,
      projectType,
      files,
      workspacePath,
      maxPredictions = 10
    } = request;

    console.log(`[PatternPredictor] Predicting patterns for task: ${task.substring(0, 100)}...`);

    const predictions = await this.learningEngine.predictPatterns(task, {
      language,
      projectType,
      files,
      workspacePath
    });

    return predictions.slice(0, maxPredictions);
  }

  /**
   * Get recommended patterns for a specific context
   */
  async getRecommendedPatterns(
    context: {
      language: string;
      projectType?: string;
      taskType?: string;
    }
  ): Promise<PatternPrediction[]> {
    const mirrorMemory = getMirrorMemory();
    if (!mirrorMemory) return [];
    const allPatterns = await mirrorMemory.retrievePatterns(null, 100, 'confidence');

    const recommendations: PatternPrediction[] = [];

    for (const pattern of allPatterns) {
      // Filter by context
      if (pattern.characteristics?.language !== context.language) continue;
      if (context.projectType && pattern.characteristics?.projectType !== context.projectType) {
        continue;
      }

      const confidence = pattern.confidence || 0.5;
      const successRate = pattern.successRate || 0.5;

      recommendations.push({
        patternId: pattern.id || '',
        pattern,
        confidence: (confidence + successRate) / 2,
        reasoning: `Recommended for ${context.language} ${context.projectType || 'projects'}`,
        contextMatch: 1.0
      });
    }

    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /**
   * Predict patterns using semantic search
   */
  async predictWithSemanticSearch(
    task: string,
    workspacePath: string
  ): Promise<PatternPrediction[]> {
    try {
      const embeddings = tryGetCodebaseEmbeddings();
      if (!embeddings) {
        console.warn('[PatternPredictor] Codebase embeddings not available');
        return [];
      }
      await embeddings.initializeForWorkspace(workspacePath);

      // Find semantically similar files
      const similarFiles = await embeddings.findSimilarFiles(task, 5);

      // Extract patterns from similar files
      const predictions: PatternPrediction[] = [];

      for (const file of similarFiles) {
        if (file.similarity > 0.6) {
          // This file is relevant - extract patterns
          const mirrorMemory = getMirrorMemory();
          if (!mirrorMemory) continue;
          const relatedPatterns = await mirrorMemory.retrievePatterns(
            file.filePath,
            5,
            'confidence'
          );

          for (const pattern of relatedPatterns) {
            predictions.push({
              patternId: pattern.id || '',
              pattern,
              confidence: file.similarity * (pattern.confidence || 0.5),
              reasoning: `Found in semantically similar file: ${file.filePath}`,
              contextMatch: file.similarity
            });
          }
        }
      }

      // Deduplicate and sort
      const unique = new Map<string, PatternPrediction>();
      for (const pred of predictions) {
        const existing = unique.get(pred.patternId);
        if (!existing || pred.confidence > existing.confidence) {
          unique.set(pred.patternId, pred);
        }
      }

      return Array.from(unique.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);
    } catch (error) {
      console.warn('[PatternPredictor] Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Get prediction confidence score
   */
  calculateConfidence(predictions: PatternPrediction[]): number {
    if (predictions.length === 0) return 0;

    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    const topConfidence = predictions[0]?.confidence || 0;

    // Weighted average: top prediction matters more
    return (topConfidence * 0.6 + avgConfidence * 0.4);
  }
}

// Singleton instance
let patternPredictorInstance: PatternPredictor | null = null;

export function getPatternPredictor(): PatternPredictor {
  if (!patternPredictorInstance) {
    patternPredictorInstance = new PatternPredictor();
  }
  return patternPredictorInstance;
}

