/**
 * Mirror Memory Singleton Accessor
 * Provides global access to the mirror memory instance for the agent loop
 */
/**
 * Set the mirror memory instance (called from main.ts during initialization)
 */
export declare function setMirrorMemory(instance: any): void;
/**
 * Get the mirror memory instance
 */
export declare function getMirrorMemory(): any;
/**
 * Get relevant patterns for a task
 */
export declare function getRelevantPatterns(task: string, limit?: number): Promise<any[]>;
/**
 * Store a learning from a task execution
 */
export declare function storeTaskLearning(task: string, success: boolean, patterns: any[], mistakes?: string[]): Promise<void>;
/**
 * Get anti-patterns (things to avoid)
 */
export declare function getAntiPatterns(limit?: number): Promise<any[]>;
//# sourceMappingURL=mirror-singleton.d.ts.map