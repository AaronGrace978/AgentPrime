export type AgentReviewChangeStatus = 'pending' | 'accepted' | 'rejected';

export type AgentReviewAction = 'modified' | 'created' | 'deleted';

export interface AgentReviewChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  action: AgentReviewAction;
  status: AgentReviewChangeStatus;
}

export type AgentReviewFindingSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AgentReviewFindingStage = 'validation' | 'install' | 'build' | 'run' | 'browser' | 'unknown';

export interface AgentReviewFinding {
  stage: AgentReviewFindingStage;
  severity: AgentReviewFindingSeverity;
  summary: string;
  files: string[];
  command?: string;
  output?: string;
}

export type AgentReviewVerificationStatus = 'idle' | 'verifying' | 'passed' | 'failed';

export interface AgentReviewVerificationState {
  status: AgentReviewVerificationStatus;
  projectTypeLabel?: string;
  readinessSummary?: string;
  startCommand?: string;
  buildCommand?: string;
  installCommand?: string;
  url?: string;
  issues: string[];
  findings?: AgentReviewFinding[];
}

export interface AgentRepairScope {
  allowedFiles: string[];
  blockedFiles: string[];
  findings: AgentReviewFinding[];
}

export interface AgentReviewSessionSnapshot {
  sessionId: string;
  workspacePath: string;
  createdAt: number;
  appliedAt?: number;
  discardedAt?: number;
  changes: AgentReviewChange[];
  initialVerification?: AgentReviewVerificationState;
}
