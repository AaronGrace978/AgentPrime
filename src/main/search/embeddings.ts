/**
 * AgentPrime - Semantic Embeddings
 * Uses @xenova/transformers for local text embeddings
 */

import { pipeline, Pipeline } from '@xenova/transformers';

export class SemanticEmbeddings {
  private extractor: any = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';
  private initPromise: Promise<boolean> | null = null;
  private unavailableReason: string | null = null;

  async initialize(): Promise<boolean> {
    if (this.extractor) return true;
    if (this.unavailableReason) return false;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const { pipeline } = await import('@xenova/transformers');
          this.extractor = await pipeline('feature-extraction', this.modelName);
          return true;
        } catch (error) {
          this.unavailableReason = error instanceof Error ? error.message : String(error);
          console.warn(`Embeddings unavailable: ${this.unavailableReason}`);
          return false;
        } finally {
          this.initPromise = null;
        }
      })();
    }
    return this.initPromise;
  }

  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.extractor) {
      const ready = await this.initialize();
      if (!ready || !this.extractor) {
        throw new Error(this.unavailableReason || 'Embeddings unavailable');
      }
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
