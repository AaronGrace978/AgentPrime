/**
 * AgentPrime - Codebase Indexer
 * Indexes codebase with semantic embeddings for automatic context discovery
 */
interface SearchResult {
    path: string;
    content: string;
    score: number;
}
export declare class CodebaseIndexer {
    private workspacePath;
    private chunks;
    private isIndexing;
    private readonly supportedExtensions;
    private readonly maxChunkSize;
    constructor(workspacePath: string);
    indexCodebase(): Promise<void>;
    private walkDirectory;
    private shouldSkipDirectory;
    private shouldIndexFile;
    private indexFile;
    private chunkContent;
    private estimateTokens;
    searchCodebase(query: string, topK?: number): Promise<SearchResult[]>;
    getChunkCount(): number;
    reindexFile(filePath: string): Promise<void>;
}
export {};
//# sourceMappingURL=indexer.d.ts.map