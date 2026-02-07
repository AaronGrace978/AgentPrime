/**
 * AgentPrime - Context Vector Store
 * Advanced semantic memory retrieval with vector embeddings
 * Ported from ActivatePrime's context_vector_store.py
 */

interface VectorEmbedding {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    filePath: string;
    lineNumber?: number;
    symbolType?: string;
    symbolName?: string;
    contextType: 'function' | 'class' | 'variable' | 'import' | 'comment' | 'general';
    timestamp: number;
    sessionId?: string;
  };
}

interface SemanticSearchResult {
  id: string;
  content: string;
  filePath: string;
  similarity: number;
  score: number;
  metadata: VectorEmbedding['metadata'];
}

interface DeepContextQuery {
  query: string;
  sessionId?: string;
  semanticTags?: string[];
  minQuoteConfidence?: number;
  contextDepthRange?: [number, number];
  topK?: number;
  includeEmotional?: boolean;
  includeLinguistic?: boolean;
}

export class ContextVectorStore {
  private embeddings: Map<string, VectorEmbedding> = new Map();
  private sessionContexts: Map<string, VectorEmbedding[]> = new Map();
  private embeddingModel: any = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeEmbeddingModel();
  }

  /**
   * Initialize the embedding model
   */
  private async initializeEmbeddingModel() {
    try {
      // Try to use Xenova/transformers for browser-compatible embeddings
      // This is a fallback - in production you'd want a proper embedding service
      this.embeddingModel = {
        generateEmbedding: this.simpleHashEmbedding.bind(this)
      };
      this.isInitialized = true;
      console.log('[ContextVectorStore] Initialized with simple embedding model');
    } catch (error) {
      console.warn('[ContextVectorStore] Failed to initialize embedding model:', error);
      this.embeddingModel = null;
    }
  }

  /**
   * Store a new embedding in the vector store
   */
  async storeEmbedding(
    id: string,
    content: string,
    metadata: VectorEmbedding['metadata']
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeEmbeddingModel();
    }

    const embedding = await this.generateEmbedding(content);

    const vectorEmbedding: VectorEmbedding = {
      id,
      content,
      embedding,
      metadata
    };

    this.embeddings.set(id, vectorEmbedding);

    // Store in session context if session ID provided
    if (metadata.sessionId) {
      if (!this.sessionContexts.has(metadata.sessionId)) {
        this.sessionContexts.set(metadata.sessionId, []);
      }
      this.sessionContexts.get(metadata.sessionId)!.push(vectorEmbedding);
    }
  }

  /**
   * Deep context retrieval with session-specific analysis
   */
  async recallDeepContext(query: DeepContextQuery): Promise<SemanticSearchResult[]> {
    const {
      query: searchQuery,
      sessionId,
      semanticTags = [],
      minQuoteConfidence = 0.7,
      contextDepthRange = [1, 5],
      topK = 10,
      includeEmotional = true,
      includeLinguistic = true
    } = query;

    if (!this.isInitialized) {
      return [];
    }

    const queryEmbedding = await this.generateEmbedding(searchQuery);
    const results: SemanticSearchResult[] = [];

    // Get relevant embeddings (session-specific or global)
    const relevantEmbeddings = sessionId && this.sessionContexts.has(sessionId)
      ? this.sessionContexts.get(sessionId)!
      : Array.from(this.embeddings.values());

    for (const embedding of relevantEmbeddings) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding.embedding);

      // Apply multi-factor scoring
      let finalScore = similarity * 0.4; // Base similarity

      // Recency factor (newer content gets slight boost)
      const recencyFactor = Math.max(0.8, Math.min(1.0,
        1 - (Date.now() - embedding.metadata.timestamp) / (1000 * 60 * 60 * 24 * 30) // 30 days
      ));
      finalScore += recencyFactor * 0.2;

      // Emotional relevance (if enabled)
      if (includeEmotional) {
        const emotionalRelevance = this.calculateEmotionalRelevance(searchQuery, embedding.content);
        finalScore += emotionalRelevance * 0.2;
      }

      // Linguistic relevance (if enabled)
      if (includeLinguistic) {
        const linguisticFeatures = this.analyzeLinguisticFeatures(embedding.content);
        const linguisticRelevance = this.calculateLinguisticRelevance(searchQuery, linguisticFeatures);
        finalScore += linguisticRelevance * 0.2;
      }

      // Semantic tag matching
      if (semanticTags.length > 0) {
        const tagMatch = semanticTags.some(tag =>
          embedding.content.toLowerCase().includes(tag.toLowerCase()) ||
          embedding.metadata.symbolName?.toLowerCase().includes(tag.toLowerCase())
        );
        if (tagMatch) {
          finalScore += 0.1; // Small boost for tag matches
        }
      }

      // Apply confidence threshold
      if (finalScore >= minQuoteConfidence) {
        results.push({
          id: embedding.id,
          content: embedding.content,
          filePath: embedding.metadata.filePath,
          similarity,
          score: finalScore * 100,
          metadata: embedding.metadata
        });
      }
    }

    // Sort by final score and return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Standard semantic search
   */
  async semanticSearch(query: string, limit: number = 10): Promise<SemanticSearchResult[]> {
    return this.recallDeepContext({
      query,
      topK: limit,
      minQuoteConfidence: 0.1
    });
  }

  /**
   * Analyze linguistic features of content
   */
  private analyzeLinguisticFeatures(content: string): any {
    const lowerContent = content.toLowerCase();

    return {
      formality: this.calculateFormality(lowerContent),
      complexity: this.calculateComplexity(content),
      emotional: this.detectEmotionalLanguage(lowerContent),
      technical: this.detectTechnicalLanguage(lowerContent)
    };
  }

  /**
   * Calculate linguistic relevance between query and content features
   */
  private calculateLinguisticRelevance(query: string, features: any): number {
    const queryLower = query.toLowerCase();

    let relevance = 0;

    // Formality matching
    if (features.formality > 0.7 && queryLower.includes('formal')) relevance += 0.3;
    if (features.formality < 0.3 && queryLower.includes('casual')) relevance += 0.3;

    // Complexity matching
    if (features.complexity > 0.7 && queryLower.includes('complex')) relevance += 0.3;
    if (features.complexity < 0.3 && queryLower.includes('simple')) relevance += 0.3;

    // Technical matching
    if (features.technical > 0.7 && queryLower.includes('technical')) relevance += 0.3;

    return Math.min(1.0, relevance);
  }

  /**
   * Calculate emotional relevance
   */
  private calculateEmotionalRelevance(query: string, content: string): number {
    const emotionalWords = ['important', 'critical', 'urgent', 'error', 'fail', 'success', 'great', 'awesome', 'terrible', 'amazing'];
    const queryEmotional = emotionalWords.some(word => query.toLowerCase().includes(word));
    const contentEmotional = emotionalWords.some(word => content.toLowerCase().includes(word));

    return queryEmotional && contentEmotional ? 0.8 : 0.2;
  }

  /**
   * Calculate formality score
   */
  private calculateFormality(text: string): number {
    const formalWords = ['therefore', 'however', 'consequently', 'furthermore', 'additionally', 'specifically', 'accordingly'];
    const casualWords = ['like', 'kinda', 'sorta', 'basically', 'actually', 'totally', 'literally'];

    const formalCount = formalWords.filter(word => text.includes(word)).length;
    const casualCount = casualWords.filter(word => text.includes(word)).length;

    const totalIndicators = formalCount + casualCount;
    return totalIndicators > 0 ? formalCount / totalIndicators : 0.5;
  }

  /**
   * Calculate complexity score
   */
  private calculateComplexity(text: string): number {
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const longWords = words.filter(word => word.length > 6).length;

    return Math.min(1.0, (avgWordLength / 8) + (longWords / words.length));
  }

  /**
   * Detect emotional language
   */
  private detectEmotionalLanguage(text: string): boolean {
    const emotionalIndicators = ['!', 'amazing', 'terrible', 'awesome', 'horrible', 'fantastic', 'awful', 'brilliant'];
    return emotionalIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Detect technical language
   */
  private detectTechnicalLanguage(text: string): number {
    const technicalPatterns = [
      /\b(function|class|interface|async|await|const|let|var)\b/g,
      /\b(import|export|from|to)\b/g,
      /\b(api|database|server|client|endpoint)\b/g
    ];

    let technicalScore = 0;
    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        technicalScore += matches.length * 0.1;
      }
    }

    return Math.min(1.0, technicalScore);
  }

  /**
   * Generate embedding for text content
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingModel && typeof this.embeddingModel.generateEmbedding === 'function') {
      return this.embeddingModel.generateEmbedding(text);
    }

    // Fallback to simple hash-based embedding
    return this.simpleHashEmbedding(text);
  }

  /**
   * Simple hash-based embedding for fallback
   */
  private simpleHashEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/).slice(0, 50); // Limit to first 50 words
    const embedding: number[] = new Array(128).fill(0);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;

      for (let j = 0; j < word.length; j++) {
        const char = word.charCodeAt(j);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      // Distribute hash across embedding dimensions
      for (let dim = 0; dim < 128; dim++) {
        const noise = Math.sin(hash + dim * 0.1) * Math.cos(hash + dim * 0.2);
        embedding[dim] += noise * (1 / (i + 1)); // Weight by position
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (magnitude || 1));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Get statistics about the vector store
   */
  getStats(): any {
    return {
      totalEmbeddings: this.embeddings.size,
      sessions: this.sessionContexts.size,
      embeddingModelInitialized: this.isInitialized
    };
  }

  /**
   * Clear all embeddings (for testing or reset)
   */
  clear(): void {
    this.embeddings.clear();
    this.sessionContexts.clear();
  }
}

// Singleton instance
let contextVectorStoreInstance: ContextVectorStore | null = null;

export function getContextVectorStore(): ContextVectorStore {
  if (!contextVectorStoreInstance) {
    contextVectorStoreInstance = new ContextVectorStore();
  }
  return contextVectorStoreInstance;
}
