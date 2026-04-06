import type {
  AgentReviewSessionSnapshot,
  AgentReviewVerificationState,
} from '../../types/agent-review';
import { createLogger } from '../core/logger';

const log = createLogger('AgentTxFinalizer');

interface TransactionOperation {
  path: string;
  originalContent: string | null;
  newContent: string;
  existed: boolean;
}

interface ActiveTransactionLike {
  getOperationCount(): number;
  getOperations(): ReadonlyArray<TransactionOperation>;
}

interface TransactionManagerLike {
  getActiveTransaction(): ActiveTransactionLike | null;
  commitTransaction(): void;
  rollbackTransaction(): Promise<void>;
}

interface ReviewSessionManagerLike {
  createSessionFromOperations(
    workspacePath: string,
    operations: ReadonlyArray<TransactionOperation>,
    initialVerification?: AgentReviewVerificationState
  ): AgentReviewSessionSnapshot | null;
}

export interface FinalizeAgentTransactionOptions {
  workspacePath: string;
  finalAnswer: string;
  monolithicApplyImmediately?: boolean;
  reviewRequiredMessage?: string;
  initialVerification?: AgentReviewVerificationState;
}

export interface FinalizeAgentTransactionResult {
  finalAnswer: string;
  pendingReviewSession: AgentReviewSessionSnapshot | null;
  stagedReview: boolean;
}

export async function finalizeAgentTransactionForReview(
  transactionManager: TransactionManagerLike,
  reviewSessionManager: ReviewSessionManagerLike,
  options: FinalizeAgentTransactionOptions
): Promise<FinalizeAgentTransactionResult> {
  const {
    workspacePath,
    finalAnswer,
    monolithicApplyImmediately = false,
    reviewRequiredMessage = '\n\n### Review Required\nApply the staged changes from the review panel to write them into the workspace.',
    initialVerification,
  } = options;

  if (!monolithicApplyImmediately) {
    const activeTx = transactionManager.getActiveTransaction();
    if (activeTx && activeTx.getOperationCount() > 0) {
      const ops = activeTx.getOperations().map((op) => ({
        path: op.path,
        originalContent: op.originalContent,
        newContent: op.newContent,
        existed: op.existed,
      }));

      const stagedReview = reviewSessionManager.createSessionFromOperations(
        workspacePath,
        ops,
        initialVerification
      );

      if (stagedReview) {
        try {
          await transactionManager.rollbackTransaction();
          log.info('Staged file changes for review; workspace rolled back until apply');
          return {
            finalAnswer: `${finalAnswer}${reviewRequiredMessage}`,
            pendingReviewSession: stagedReview,
            stagedReview: true,
          };
        } catch (rollbackError: any) {
          log.error(
            'Failed to roll back workspace for staged review:',
            rollbackError?.message || rollbackError
          );
          try {
            transactionManager.commitTransaction();
            log.info('Transaction committed after staging rollback failure');
          } catch (commitError: any) {
            log.error('Transaction commit failed:', commitError?.message || commitError);
          }
          return {
            finalAnswer,
            pendingReviewSession: null,
            stagedReview: false,
          };
        }
      }
    }
  }

  try {
    transactionManager.commitTransaction();
    log.info('Transaction committed');
  } catch (txError: any) {
    log.error('Transaction commit failed:', txError?.message || txError);
  }

  return {
    finalAnswer,
    pendingReviewSession: null,
    stagedReview: false,
  };
}
