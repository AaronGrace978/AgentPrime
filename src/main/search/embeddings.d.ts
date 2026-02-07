/**
 * AgentPrime - Semantic Embeddings
 * Uses @xenova/transformers for local text embeddings
 */
export declare class SemanticEmbeddings {
    private extractor;
    private readonly modelName;
    initialize(): Promise<void>;
    embedText(text: string): Promise<number[]>;
    cosineSimilarity(a: number[], b: number[]): number;
}
export declare const embeddings: SemanticEmbeddings;
//# sourceMappingURL=embeddings.d.ts.map