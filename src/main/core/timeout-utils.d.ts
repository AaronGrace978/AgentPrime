/**
 * Timeout Utilities for AgentPrime
 * Provides timeout wrappers for operations to prevent infinite hangs
 */
export declare class TimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(message: string, timeoutMs: number);
}
/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param errorMsg Custom error message for timeout
 * @returns Promise that rejects with TimeoutError if it doesn't complete in time
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg?: string): Promise<T>;
/**
 * Wrap AI operations with appropriate timeouts
 * @param aiPromise AI operation promise
 * @param operationType Type of operation for timeout selection
 * @returns Promise with appropriate timeout
 */
export declare function withAITimeout<T>(aiPromise: Promise<T>, operationType?: 'chat' | 'completion' | 'analysis' | 'complex'): Promise<T>;
/**
 * Wrap file operations with timeout
 * @param filePromise File operation promise
 * @param operationType Type of file operation
 * @returns Promise with timeout
 */
export declare function withFileTimeout<T>(filePromise: Promise<T>, operationType?: 'read' | 'write' | 'search'): Promise<T>;
/**
 * Create a retry wrapper with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise that retries on timeout
 */
export declare function withRetry<T>(operation: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
/**
 * Combined timeout and retry wrapper for AI operations
 * ENHANCED: Includes model name for adaptive timeouts
 * @param aiOperation AI operation function
 * @param operationType Type of operation
 * @param modelName Model name for adaptive timeout
 * @param maxRetries Maximum retries on timeout
 * @returns Promise with timeout and retry logic
 */
export declare function withAITimeoutAndRetry<T>(aiOperation: () => Promise<T>, operationType?: 'chat' | 'completion' | 'analysis' | 'complex' | 'project', modelName?: string, maxRetries?: number): Promise<T>;
//# sourceMappingURL=timeout-utils.d.ts.map