/**
 * Transaction Manager for AgentPrime
 * Tracks file operations during agent execution and provides rollback capability
 *
 * This system ensures that if an agent operation fails, all file modifications
 * can be rolled back to their original state.
 */
/**
 * Represents a single file operation in a transaction
 */
interface FileOperation {
    /** Relative path to the file */
    path: string;
    /** Full absolute path to the file */
    fullPath: string;
    /** Original content before modification (null if file didn't exist) */
    originalContent: string | null;
    /** New content that was written */
    newContent: string;
    /** Whether the file existed before this operation */
    existed: boolean;
    /** Timestamp when the operation was recorded */
    timestamp: number;
}
/**
 * Transaction state
 */
export declare class Transaction {
    private operations;
    private checkpoints;
    private committed;
    private rolledBack;
    private readonly workspacePath;
    constructor(workspacePath: string);
    /**
     * Record a file write operation
     * Stores the original content before modification
     */
    recordWrite(filePath: string, newContent: string): Promise<void>;
    /**
     * Create a checkpoint for rollback purposes
     * Returns checkpoint ID for later reference
     */
    createCheckpoint(id?: string): string;
    /**
     * Rollback all operations to restore original state
     */
    rollback(): Promise<void>;
    /**
     * Rollback to a specific checkpoint
     * All operations after the checkpoint will be rolled back
     */
    rollbackToCheckpoint(checkpointId: string): Promise<void>;
    /**
     * Commit the transaction (mark as complete)
     * After commit, rollback is no longer possible
     */
    commit(): void;
    /**
     * Get all operations in this transaction
     */
    getOperations(): ReadonlyArray<FileOperation>;
    /**
     * Get the number of operations
     */
    getOperationCount(): number;
    /**
     * Check if transaction is committed
     */
    isCommitted(): boolean;
    /**
     * Check if transaction is rolled back
     */
    isRolledBack(): boolean;
}
/**
 * Transaction Manager - Manages active transactions
 */
export declare class TransactionManager {
    private activeTransaction;
    private transactionHistory;
    private readonly maxHistorySize;
    /**
     * Start a new transaction
     */
    startTransaction(workspacePath: string): Transaction;
    /**
     * Get the active transaction
     */
    getActiveTransaction(): Transaction | null;
    /**
     * Record a file write in the active transaction
     */
    recordWrite(filePath: string, newContent: string): Promise<void>;
    /**
     * Create a checkpoint in the active transaction
     */
    createCheckpoint(id?: string): string | null;
    /**
     * Commit the active transaction
     */
    commitTransaction(): void;
    /**
     * Rollback the active transaction
     */
    rollbackTransaction(): Promise<void>;
    /**
     * Rollback to a checkpoint in the active transaction
     */
    rollbackToCheckpoint(checkpointId: string): Promise<void>;
    /**
     * Get transaction history
     */
    getHistory(): ReadonlyArray<Transaction>;
    /**
     * Clear transaction history
     */
    clearHistory(): void;
    /**
     * Get the last checkpoint ID from the active transaction
     * Returns null if no checkpoints exist
     */
    getLastCheckpoint(): string | null;
    /**
     * Get all checkpoint IDs from the active transaction
     */
    getCheckpoints(): string[];
}
export declare const transactionManager: TransactionManager;
export {};
//# sourceMappingURL=transaction-manager.d.ts.map