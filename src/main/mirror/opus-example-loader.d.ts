/**
 * Opus Example Loader - Smart pattern loading with manifest-based matching
 *
 * This replaces the basic filename-matching with rich metadata matching:
 * 1. Uses manifest.json for tags, categories, quality scores
 * 2. Falls back to content scanning for unindexed files
 * 3. Prioritizes high-quality examples
 */
interface OpusExample {
    file: string;
    title?: string;
    tags: string[];
    category: string;
    language: string;
    quality: number;
    description: string;
}
interface OpusManifest {
    version: string;
    examples: OpusExample[];
    tagIndex: Record<string, string[]>;
    categories: Record<string, string[]>;
}
/**
 * Find the opus-examples directory
 */
declare function findOpusPath(): string | null;
/**
 * Load the manifest (with caching)
 */
declare function loadManifest(opusPath: string): OpusManifest | null;
/**
 * Load relevant opus examples for a task
 *
 * This is the main export - use this in specialists and agent loop
 */
export declare function loadOpusExamples(task: string, limit?: number): Promise<string[]>;
/**
 * Get examples by specific category
 */
export declare function getExamplesByCategory(category: string, limit?: number): Promise<string[]>;
/**
 * Get examples by specific tag
 */
export declare function getExamplesByTag(tag: string, limit?: number): Promise<string[]>;
/**
 * List all available tags
 */
export declare function getAvailableTags(): string[];
/**
 * List all available categories
 */
export declare function getAvailableCategories(): string[];
export { findOpusPath, loadManifest };
//# sourceMappingURL=opus-example-loader.d.ts.map