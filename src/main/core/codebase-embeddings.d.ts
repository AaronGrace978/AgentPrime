/**
 * AgentPrime - Codebase Embeddings
 * Semantic understanding of entire codebases for intelligent completions
 * Builds on ContextVectorStore for Cursor-level intelligence
 */
interface CodebaseEmbedding {
    filePath: string;
    content: string;
    embedding: number[];
    metadata: {
        language: string;
        size: number;
        lines: number;
        symbols: string[];
        imports: string[];
        exports: string[];
        lastModified: number;
        complexity: number;
    };
}
interface SemanticFileResult {
    filePath: string;
    similarity: number;
    relevanceScore: number;
    content: string;
    metadata: CodebaseEmbedding['metadata'];
}
interface ContextQuery {
    query: string;
    language?: string;
    currentFile?: string;
    maxFiles?: number;
    contextWindow?: number;
}
export declare class CodebaseEmbeddings {
    private vectorStore;
    private embeddings;
    private codebaseEmbeddings;
    private isInitialized;
    private workspacePath;
    constructor();
    /**
     * Initialize codebase embeddings for a workspace
     */
    initializeForWorkspace(workspacePath: string): Promise<void>;
    /**
     * Generate embeddings for multiple files
     */
    generateEmbeddings(files: string[]): Promise<Map<string, number[]>>;
    /**
     * Generate embedding for a single file
     */
    private generateFileEmbedding;
    /**
     * Extract comprehensive metadata from a file
     */
    private extractFileMetadata;
    /**
     * Create rich text representation for embedding
     */
    private createEmbeddingText;
    /**
     * Find similar files based on semantic query
     */
    findSimilarFiles(query: string, limit?: number): Promise<SemanticFileResult[]>;
    /**
     * Build intelligent context from relevant files
     */
    buildIntelligentContext(query: string, files: string[], contextQuery: ContextQuery): Promise<string>;
    /**
     * Prioritize and filter relevant content
     */
    private prioritizeRelevantContent;
    /**
     * Compress context to fit within token limits
     */
    private compressContext;
    /**
     * Extract relevant content from a file (functions, classes, etc.)
     */
    private extractRelevantContent;
    /**
     * Calculate relevance score for a file
     */
    private calculateRelevanceScore;
    /**
     * Store file embedding in vector store for persistence
     */
    private storeFileEmbedding;
    /**
     * Detect programming language from file extension
     */
    private detectLanguage;
    /**
     * Extract symbols (functions, classes, variables) from content
     */
    private extractSymbols;
    /**
     * Extract imports from content
     */
    private extractImports;
    /**
     * Extract exports from content
     */
    private extractExports;
    /**
     * Calculate code complexity score
     */
    private calculateComplexity;
    /**
     * Get statistics about the codebase embeddings
     */
    getStats(): any;
    /**
     * Get language distribution statistics
     */
    private getLanguageStats;
    /**
     * Clear all embeddings
     */
    clear(): void;
}
export declare function getCodebaseEmbeddings(): CodebaseEmbeddings;
export {};
//# sourceMappingURL=codebase-embeddings.d.ts.map