/**
 * ActivatePrime Context Vector Store - Ported to TypeScript
 * Advanced semantic memory retrieval with vector embeddings
 * Similar to Cursor's automatic codebase awareness
 */

import * as crypto from 'crypto';

export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  name: string;
  type: 'function' | 'class' | 'method' | 'variable' | 'import' | 'comment' | 'other';
  lineStart: number;
  lineEnd: number;
  embedding?: number[];
  metadata: {
    language: string;
    complexity: number;
    dependencies: string[];
    symbols: string[];
    recency: number;
  };
}

export interface ContextQuery {
  query: string;
  sessionId?: string;
  semanticTags?: string[];
  minQuoteConfidence?: number;
  contextDepthRange?: [number, number];
  topK?: number;
  maxTokens?: number;
}

export interface ContextResult {
  chunk: CodeChunk;
  similarity: number;
  score: number;
  relevanceFactors: {
    similarity: number;
    recency: number;
    emotional: number;
    linguistic: number;
  };
  quote?: string;
  confidence?: number;
}

interface LinguisticFeatures {
  formality: number;
  complexity: number;
  emotional: number;
  technical: number;
  keywords: string[];
  entities: string[];
  intent: string;
}

export class EnhancedContextVectorStore {
  private vectorStore: Map<string, CodeChunk> = new Map();
  private sessionMemories: Map<string, CodeChunk[]> = new Map();
  private embeddingModel: any = null;
  private maxChunkSize = 1000;
  private overlapSize = 200;

  constructor() {
    // Initialize simple embedding model (can be replaced with @xenova/transformers)
    this.initializeEmbeddingModel();
  }

  private initializeEmbeddingModel() {
    // Simple TF-IDF based embeddings for now
    // Can be upgraded to proper embeddings later
    this.embeddingModel = {
      generateEmbedding: (text: string): number[] => {
        // Simple hash-based embedding (placeholder)
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        const embedding: number[] = [];
        for (let i = 0; i < 384; i += 8) {
          const chunk = hash.slice(i, i + 8);
          embedding.push(parseInt(chunk, 16) / 0xFFFFFFFF);
        }
        return embedding;
      }
    };
  }

  /**
   * Add code chunk to vector store
   */
  async addChunk(chunk: Omit<CodeChunk, 'id' | 'embedding'>): Promise<void> {
    const id = this.generateChunkId(chunk);
    const embedding = await this.embeddingModel.generateEmbedding(chunk.content);

    const fullChunk: CodeChunk = {
      ...chunk,
      id,
      embedding
    };

    this.vectorStore.set(id, fullChunk);
  }

  /**
   * Semantic search with deep context recovery
   */
  async recallDeepContext(query: ContextQuery): Promise<ContextResult[]> {
    const queryEmbedding = await this.embeddingModel.generateEmbedding(query.query);
    const linguisticFeatures = this.analyzeLinguisticFeatures(query.query);

    const results: ContextResult[] = [];
    const seenChunks = new Set<string>();

    // Search through all chunks
    for (const [chunkId, chunk] of this.vectorStore) {
      if (seenChunks.has(chunkId)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding!);
      if (similarity < 0.1) continue; // Filter low similarity

      const relevanceFactors = this.calculateRelevanceFactors(
        similarity,
        chunk,
        linguisticFeatures,
        query.sessionId
      );

      // Multi-factor scoring
      const finalScore = (
        relevanceFactors.similarity * 0.4 +
        relevanceFactors.recency * 0.2 +
        relevanceFactors.emotional * 0.2 +
        relevanceFactors.linguistic * 0.2
      );

      if (finalScore > 0.2) { // Minimum threshold
        const result: ContextResult = {
          chunk,
          similarity,
          score: finalScore,
          relevanceFactors
        };

        // Add quote if confidence is high enough
        if (similarity > (query.minQuoteConfidence || 0.7)) {
          result.quote = this.extractRelevantQuote(chunk.content, query.query);
          result.confidence = similarity;
        }

        results.push(result);
        seenChunks.add(chunkId);
      }
    }

    // Sort by score and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, query.topK || 10);
  }

  /**
   * Analyze linguistic features of query
   */
  private analyzeLinguisticFeatures(content: string): LinguisticFeatures {
    const words = content.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/);

    // Formality score (ratio of complex to simple words)
    const complexWords = words.filter(w => w.length > 6).length;
    const formality = Math.min(complexWords / Math.max(words.length, 1), 1);

    // Complexity score (sentence length variation)
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    const complexity = Math.min(avgSentenceLength / 20, 1);

    // Emotional score (sentiment words)
    const emotionalWords = ['help', 'problem', 'error', 'fix', 'improve', 'enhance', 'create', 'build'];
    const emotional = words.filter(w => emotionalWords.includes(w)).length / Math.max(words.length, 1);

    // Technical score (programming terms)
    const technicalWords = ['function', 'class', 'method', 'variable', 'api', 'database', 'server', 'client'];
    const technical = words.filter(w => technicalWords.includes(w)).length / Math.max(words.length, 1);

    // Extract keywords
    const keywords = words.filter(w => w.length > 4 && !['that', 'this', 'with', 'from', 'have', 'been'].includes(w));

    // Intent detection
    let intent = 'general';
    if (words.includes('create') || words.includes('add') || words.includes('new')) intent = 'creation';
    else if (words.includes('fix') || words.includes('error') || words.includes('problem')) intent = 'debugging';
    else if (words.includes('improve') || words.includes('optimize') || words.includes('enhance')) intent = 'optimization';
    else if (words.includes('understand') || words.includes('explain') || words.includes('what')) intent = 'analysis';

    return {
      formality,
      complexity,
      emotional,
      technical,
      keywords: keywords.slice(0, 10),
      entities: [], // Could be enhanced with NER
      intent
    };
  }

  /**
   * Calculate relevance factors for a chunk
   */
  private calculateRelevanceFactors(
    similarity: number,
    chunk: CodeChunk,
    linguisticFeatures: LinguisticFeatures,
    sessionId?: string
  ): { similarity: number; recency: number; emotional: number; linguistic: number } {
    // Recency factor (how recently accessed)
    const recencyFactor = Math.max(0, 1 - (Date.now() - chunk.metadata.recency) / (1000 * 60 * 60 * 24 * 7)); // 7 days

    // Emotional relevance (matches emotional context)
    const emotionalRelevance = linguisticFeatures.emotional > 0.3 ? 0.8 : 0.2;

    // Linguistic relevance (matches language patterns)
    const linguisticRelevance = (
      (linguisticFeatures.formality + chunk.metadata.complexity) / 2 +
      (linguisticFeatures.technical > 0.5 ? 0.3 : 0) +
      (linguisticFeatures.intent === 'debugging' && chunk.type === 'function' ? 0.2 : 0)
    );

    return {
      similarity: similarity,
      recency: recencyFactor,
      emotional: emotionalRelevance,
      linguistic: Math.min(linguisticRelevance, 1)
    };
  }

  /**
   * Extract relevant quote from chunk content
   */
  private extractRelevantQuote(content: string, query: string): string {
    const lines = content.split('\n');
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    let bestMatch = '';
    let bestScore = 0;

    // Find best matching lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        if (line.includes(word)) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        // Extract context around the line
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        bestMatch = lines.slice(start, end).join('\n');
      }
    }

    return bestMatch || content.substring(0, 200) + '...';
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(chunk: Omit<CodeChunk, 'id'>): string {
    const hash = crypto.createHash('md5')
      .update(`${chunk.filePath}:${chunk.lineStart}:${chunk.lineEnd}:${chunk.content}`)
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Get store statistics
   */
  getStats(): { chunks: number; sessions: number; avgSimilarity: number } {
    return {
      chunks: this.vectorStore.size,
      sessions: this.sessionMemories.size,
      avgSimilarity: 0.5 // Placeholder
    };
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.vectorStore.clear();
    this.sessionMemories.clear();
  }
}

export default EnhancedContextVectorStore;
