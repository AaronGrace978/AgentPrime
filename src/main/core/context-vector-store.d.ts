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
export declare class ContextVectorStore {
    private embeddings;
    private sessionContexts;
    private embeddingModel;
    private isInitialized;
    constructor();
    /**
     * Initialize the embedding model
     */
    private initializeEmbeddingModel;
    /**
     * Store a new embedding in the vector store
     */
    storeEmbedding(id: string, content: string, metadata: VectorEmbedding['metadata']): Promise<void>;
    /**
     * Deep context retrieval with session-specific analysis
     */
    recallDeepContext(query: DeepContextQuery): Promise<SemanticSearchResult[]>;
    /**
     * Standard semantic search
     */
    semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]>;
    /**
     * Analyze linguistic features of content
     */
    private analyzeLinguisticFeatures;
    /**
     * Calculate linguistic relevance between query and content features
     */
    private calculateLinguisticRelevance;
    /**
     * Calculate emotional relevance
     */
    private calculateEmotionalRelevance;
    /**
     * Calculate formality score
     */
    private calculateFormality;
    /**
     * Calculate complexity score
     */
    private calculateComplexity;
    /**
     * Detect emotional language
     */
    private detectEmotionalLanguage;
    /**
     * Detect technical language
     */
    private detectTechnicalLanguage;
    /**
     * Generate embedding for text content
     */
    private generateEmbedding;
    /**
     * Simple hash-based embedding for fallback
     */
    private simpleHashEmbedding;
    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity;
    /**
     * Get statistics about the vector store
     */
    getStats(): any;
    /**
     * Clear all embeddings (for testing or reset)
     */
    clear(): void;
}
export declare function getContextVectorStore(): ContextVectorStore;
export {};
//# sourceMappingURL=context-vector-store.d.ts.map