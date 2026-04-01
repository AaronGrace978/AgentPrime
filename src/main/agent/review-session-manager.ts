import * as fs from 'fs';
import * as path from 'path';
import { scheduleWorkspaceSymbolIndexRebuildForAgents } from '../search/symbol-index';
import type {
  AgentReviewAction,
  AgentReviewChange,
  AgentReviewChangeStatus,
  AgentReviewSessionSnapshot,
  AgentReviewVerificationState,
} from '../../types/agent-review';

interface ReviewOperation {
  path: string;
  originalContent: string | null;
  newContent: string;
  existed: boolean;
}

interface ReviewSessionRecord extends AgentReviewSessionSnapshot {}

function cloneChange(change: AgentReviewChange): AgentReviewChange {
  return { ...change };
}

function cloneSession(session: ReviewSessionRecord): AgentReviewSessionSnapshot {
  return {
    ...session,
    changes: session.changes.map(cloneChange),
    initialVerification: session.initialVerification
      ? {
          ...session.initialVerification,
          issues: [...session.initialVerification.issues],
          findings: session.initialVerification.findings?.map((finding) => ({
            ...finding,
            files: [...finding.files],
          })),
        }
      : undefined,
  };
}

export class ReviewSessionManager {
  private readonly sessions = new Map<string, ReviewSessionRecord>();

  createSessionFromOperations(
    workspacePath: string,
    operations: ReadonlyArray<ReviewOperation>,
    initialVerification?: AgentReviewVerificationState
  ): AgentReviewSessionSnapshot | null {
    const aggregated = new Map<string, AgentReviewChange>();

    for (const operation of operations) {
      const existing = aggregated.get(operation.path);
      const oldContent = operation.originalContent ?? '';
      const nextAction: AgentReviewAction = operation.existed ? 'modified' : 'created';

      if (!existing) {
        aggregated.set(operation.path, {
          filePath: operation.path,
          oldContent,
          newContent: operation.newContent,
          action: nextAction,
          status: 'pending',
        });
        continue;
      }

      existing.newContent = operation.newContent;
      if (existing.action !== 'created') {
        existing.action = nextAction;
      }
    }

    const changes = [...aggregated.values()].filter((change) => {
      if (change.action === 'created' || change.action === 'deleted') {
        return true;
      }
      return change.oldContent !== change.newContent;
    });

    if (changes.length === 0) {
      return null;
    }

    const sessionId = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: ReviewSessionRecord = {
      sessionId,
      workspacePath,
      createdAt: Date.now(),
      changes,
      initialVerification,
    };

    this.sessions.set(sessionId, snapshot);
    return cloneSession(snapshot);
  }

  getSession(sessionId: string): AgentReviewSessionSnapshot | null {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  updateChangeStatus(
    sessionId: string,
    filePath: string,
    status: AgentReviewChangeStatus
  ): AgentReviewSessionSnapshot {
    const session = this.requireMutableSession(sessionId, { allowApplied: false });
    const target = session.changes.find((change) => change.filePath === filePath);
    if (!target) {
      throw new Error(`No staged review change found for ${filePath}`);
    }

    target.status = status;
    return cloneSession(session);
  }

  bulkUpdatePendingStatuses(
    sessionId: string,
    status: Extract<AgentReviewChangeStatus, 'accepted' | 'rejected'>
  ): AgentReviewSessionSnapshot {
    const session = this.requireMutableSession(sessionId, { allowApplied: false });
    for (const change of session.changes) {
      if (change.status === 'pending') {
        change.status = status;
      }
    }
    return cloneSession(session);
  }

  applyAcceptedChanges(sessionId: string): AgentReviewSessionSnapshot {
    const session = this.requireMutableSession(sessionId, { allowApplied: false });
    const accepted = session.changes.filter((change) => change.status === 'accepted');

    for (const change of accepted) {
      const fullPath = path.resolve(session.workspacePath, change.filePath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (change.action === 'deleted') {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        continue;
      }

      fs.writeFileSync(fullPath, change.newContent, 'utf-8');
    }

    if (accepted.length > 0) {
      scheduleWorkspaceSymbolIndexRebuildForAgents();
    }

    session.appliedAt = Date.now();
    return cloneSession(session);
  }

  discardSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.discardedAt = Date.now();
    this.sessions.delete(sessionId);
  }

  private requireMutableSession(sessionId: string, options: { allowApplied?: boolean } = {}): ReviewSessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('The staged review session no longer exists.');
    }
    if (session.discardedAt) {
      throw new Error('The staged review session has already been discarded.');
    }
    if (session.appliedAt && !options.allowApplied) {
      throw new Error('The staged review session has already been applied.');
    }
    return session;
  }
}

export const reviewSessionManager = new ReviewSessionManager();
