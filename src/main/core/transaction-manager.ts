/**
 * Transaction Manager for AgentPrime
 * Tracks file operations during agent execution and provides rollback capability
 * 
 * This system ensures that if an agent operation fails, all file modifications
 * can be rolled back to their original state.
 */

import * as fs from 'fs';
import * as path from 'path';

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
 * Represents a checkpoint in the transaction
 * Allows rolling back to a specific point in multi-file operations
 */
interface Checkpoint {
  /** Checkpoint identifier */
  id: string;
  /** File operations up to this checkpoint */
  operations: FileOperation[];
  /** Timestamp when checkpoint was created */
  timestamp: number;
}

/**
 * Transaction state
 */
export class Transaction {
  private operations: FileOperation[] = [];
  private checkpoints: Checkpoint[] = [];
  private committed: boolean = false;
  private rolledBack: boolean = false;
  private readonly workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Record a file write operation
   * Stores the original content before modification
   */
  async recordWrite(filePath: string, newContent: string): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Cannot record operation on committed or rolled back transaction');
    }

    const fullPath = path.resolve(this.workspacePath, filePath);
    const existed = fs.existsSync(fullPath);
    const originalContent = existed ? fs.readFileSync(fullPath, 'utf-8') : null;

    const operation: FileOperation = {
      path: filePath,
      fullPath,
      originalContent,
      newContent,
      existed,
      timestamp: Date.now()
    };

    this.operations.push(operation);
  }

  /**
   * Record a file change using an already-captured snapshot.
   * This is used when the caller already knows the pre-write contents.
   */
  async recordFileChange(
    filePath: string,
    originalContent: string | null,
    newContent: string,
    existed: boolean
  ): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error('Cannot record operation on committed or rolled back transaction');
    }

    const fullPath = path.resolve(this.workspacePath, filePath);
    const operation: FileOperation = {
      path: filePath,
      fullPath,
      originalContent,
      newContent,
      existed,
      timestamp: Date.now()
    };

    this.operations.push(operation);
  }

  /**
   * Create a checkpoint for rollback purposes
   * Returns checkpoint ID for later reference
   */
  createCheckpoint(id?: string): string {
    if (this.committed || this.rolledBack) {
      throw new Error('Cannot create checkpoint on committed or rolled back transaction');
    }

    const checkpointId = id || `checkpoint-${Date.now()}`;
    const checkpoint: Checkpoint = {
      id: checkpointId,
      operations: [...this.operations],
      timestamp: Date.now()
    };

    this.checkpoints.push(checkpoint);
    return checkpointId;
  }

  /**
   * Rollback all operations to restore original state
   */
  async rollback(): Promise<void> {
    if (this.committed) {
      throw new Error('Cannot rollback a committed transaction');
    }

    if (this.rolledBack) {
      console.warn('[Transaction] Transaction already rolled back');
      return;
    }

    console.log(`[Transaction] Rolling back ${this.operations.length} file operation(s)...`);

    // Rollback in reverse order to handle dependencies correctly
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];

      try {
        if (op.existed) {
          // File existed before - restore original content
          if (op.originalContent !== null) {
            fs.writeFileSync(op.fullPath, op.originalContent, 'utf-8');
            console.log(`[Transaction] Restored: ${op.path}`);
          } else {
            // Shouldn't happen, but handle gracefully
            console.warn(`[Transaction] Warning: File ${op.path} existed but no original content stored`);
          }
        } else {
          // File didn't exist - delete it
          if (fs.existsSync(op.fullPath)) {
            fs.unlinkSync(op.fullPath);
            console.log(`[Transaction] Deleted: ${op.path}`);
          }
        }
      } catch (error: any) {
        console.error(`[Transaction] Failed to rollback ${op.path}: ${error.message}`);
        // Continue with other rollbacks even if one fails
      }
    }

    this.rolledBack = true;
    console.log('[Transaction] Rollback complete');
  }

  /**
   * Rollback to a specific checkpoint
   * All operations after the checkpoint will be rolled back
   */
  async rollbackToCheckpoint(checkpointId: string): Promise<void> {
    if (this.committed) {
      throw new Error('Cannot rollback a committed transaction');
    }

    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const checkpointIndex = this.checkpoints.indexOf(checkpoint);
    const operationsToRollback = this.operations.slice(checkpoint.operations.length);

    console.log(`[Transaction] Rolling back to checkpoint ${checkpointId} (${operationsToRollback.length} operations)...`);

    // Rollback operations after the checkpoint
    for (let i = operationsToRollback.length - 1; i >= 0; i--) {
      const op = operationsToRollback[i];

      try {
        if (op.existed) {
          if (op.originalContent !== null) {
            fs.writeFileSync(op.fullPath, op.originalContent, 'utf-8');
            console.log(`[Transaction] Restored: ${op.path}`);
          }
        } else {
          if (fs.existsSync(op.fullPath)) {
            fs.unlinkSync(op.fullPath);
            console.log(`[Transaction] Deleted: ${op.path}`);
          }
        }
      } catch (error: any) {
        console.error(`[Transaction] Failed to rollback ${op.path}: ${error.message}`);
      }
    }

    // Remove operations and checkpoints after this one
    this.operations = [...checkpoint.operations];
    this.checkpoints = this.checkpoints.slice(0, checkpointIndex + 1);
  }

  /**
   * Commit the transaction (mark as complete)
   * After commit, rollback is no longer possible
   */
  commit(): void {
    if (this.rolledBack) {
      throw new Error('Cannot commit a rolled back transaction');
    }

    this.committed = true;
    console.log(`[Transaction] Committed ${this.operations.length} file operation(s)`);
  }

  /**
   * Get all operations in this transaction
   */
  getOperations(): ReadonlyArray<FileOperation> {
    return [...this.operations];
  }

  /**
   * Get the number of operations
   */
  getOperationCount(): number {
    return this.operations.length;
  }

  /**
   * Check if transaction is committed
   */
  isCommitted(): boolean {
    return this.committed;
  }

  /**
   * Check if transaction is rolled back
   */
  isRolledBack(): boolean {
    return this.rolledBack;
  }
}

/**
 * Transaction Manager - Manages active transactions
 */
export class TransactionManager {
  private activeTransaction: Transaction | null = null;
  private transactionHistory: Transaction[] = [];
  private readonly maxHistorySize = 10;

  /**
   * Start a new transaction
   */
  startTransaction(workspacePath: string): Transaction {
    if (this.activeTransaction && !this.activeTransaction.isCommitted() && !this.activeTransaction.isRolledBack()) {
      console.warn('[TransactionManager] Starting new transaction while one is active. Committing previous transaction.');
      this.activeTransaction.commit();
      this.transactionHistory.push(this.activeTransaction);
    }

    this.activeTransaction = new Transaction(workspacePath);
    console.log('[TransactionManager] Started new transaction');
    return this.activeTransaction;
  }

  /**
   * Get the active transaction
   */
  getActiveTransaction(): Transaction | null {
    return this.activeTransaction;
  }

  /**
   * Record a file write in the active transaction
   */
  async recordWrite(filePath: string, newContent: string): Promise<void> {
    if (!this.activeTransaction) {
      // No active transaction - this is fine for operations outside agent loop
      return;
    }

    await this.activeTransaction.recordWrite(filePath, newContent);
  }

  /**
   * Record a file change from a known before/after snapshot.
   */
  async recordFileChange(
    filePath: string,
    originalContent: string | null,
    newContent: string,
    existed: boolean
  ): Promise<void> {
    if (!this.activeTransaction) {
      return;
    }

    await this.activeTransaction.recordFileChange(filePath, originalContent, newContent, existed);
  }

  /**
   * Create a checkpoint in the active transaction
   */
  createCheckpoint(id?: string): string | null {
    if (!this.activeTransaction) {
      return null;
    }

    return this.activeTransaction.createCheckpoint(id);
  }

  /**
   * Commit the active transaction
   */
  commitTransaction(): void {
    if (!this.activeTransaction) {
      console.warn('[TransactionManager] No active transaction to commit');
      return;
    }

    this.activeTransaction.commit();
    this.transactionHistory.push(this.activeTransaction);
    
    // Limit history size
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory.shift();
    }

    this.activeTransaction = null;
  }

  /**
   * Rollback the active transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.activeTransaction) {
      console.warn('[TransactionManager] No active transaction to rollback');
      return;
    }

    await this.activeTransaction.rollback();
    this.transactionHistory.push(this.activeTransaction);
    this.activeTransaction = null;
  }

  /**
   * Rollback to a checkpoint in the active transaction
   */
  async rollbackToCheckpoint(checkpointId: string): Promise<void> {
    if (!this.activeTransaction) {
      throw new Error('No active transaction to rollback');
    }

    await this.activeTransaction.rollbackToCheckpoint(checkpointId);
  }

  /**
   * Get transaction history
   */
  getHistory(): ReadonlyArray<Transaction> {
    return [...this.transactionHistory];
  }

  /**
   * Clear transaction history
   */
  clearHistory(): void {
    this.transactionHistory = [];
  }

  /**
   * Get the last checkpoint ID from the active transaction
   * Returns null if no checkpoints exist
   */
  getLastCheckpoint(): string | null {
    if (!this.activeTransaction) {
      return null;
    }

    // Access the checkpoints array (we need to expose this)
    const transaction = this.activeTransaction as any;
    if (transaction.checkpoints && transaction.checkpoints.length > 0) {
      const lastCheckpoint = transaction.checkpoints[transaction.checkpoints.length - 1];
      return lastCheckpoint.id;
    }

    return null;
  }

  /**
   * Get all checkpoint IDs from the active transaction
   */
  getCheckpoints(): string[] {
    if (!this.activeTransaction) {
      return [];
    }

    const transaction = this.activeTransaction as any;
    if (transaction.checkpoints) {
      return transaction.checkpoints.map((cp: any) => cp.id);
    }

    return [];
  }
}

// Singleton instance
export const transactionManager = new TransactionManager();