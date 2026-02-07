/**
 * AgentPrime - Semantic Embeddings
 * Uses @xenova/transformers for local text embeddings
 */

import { pipeline, Pipeline } from '@xenova/transformers';

export class SemanticEmbeddings {
  private extractor: any = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';

  async initialize(): Promise<void> {
    if (this.extractor) return;

    try {
      const { pipeline } = await import('@xenova/transformers');
      this.extractor = await pipeline('feature-extraction', this.modelName);
    } catch (error) {
      console.error('Failed to initialize embeddings model:', error);
      throw error;
    }
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.extractor) {
      await this.initialize();
    }

    try {
      const result = await this.extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(result.data);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  // Cosine similarity between two vectors
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Singleton instance
export const embeddings = new SemanticEmbeddings();
