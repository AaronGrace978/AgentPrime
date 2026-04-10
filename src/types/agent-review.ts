import type { RuntimeBudgetMode } from './runtime-budget';

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
  suggestedOwner?: string;
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

export type AgentReviewPlanMode = 'talk' | 'create' | 'edit' | 'verify' | 'repair';

export interface AgentReviewPlanStep {
  id: string;
  title: string;
  summary: string;
  owner?: string;
  files: string[];
  acceptanceCriteria: string[];
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';
}

export interface AgentReviewPlanFileReason {
  filePath: string;
  reason: string;
  owner?: string;
}

export type AgentReviewCheckpointStage = 'plan' | 'review' | 'apply' | 'verify' | 'repair';

export type AgentReviewCheckpointState = 'complete' | 'current' | 'upcoming';

export interface AgentReviewCheckpointItem {
  id: string;
  label: string;
  stage: AgentReviewCheckpointStage;
  state: AgentReviewCheckpointState;
  summary?: string;
}

export interface AgentReviewCheckpointSummary {
  strategy: 'staged_patch_set';
  requiresExplicitApply: boolean;
  reflectionBudget: RuntimeBudgetMode;
  attemptCount: number;
  summary: string;
  items: AgentReviewCheckpointItem[];
}

export interface AgentReviewPlanSummary {
  mode: AgentReviewPlanMode;
  summary: string;
  rationale: string;
  reflectionBudget?: RuntimeBudgetMode;
  steps: AgentReviewPlanStep[];
  fileReasons: AgentReviewPlanFileReason[];
}

export interface AgentReviewSessionSnapshot {
  sessionId: string;
  workspacePath: string;
  createdAt: number;
  appliedAt?: number;
  revertedAt?: number;
  discardedAt?: number;
  changes: AgentReviewChange[];
  initialVerification?: AgentReviewVerificationState;
  plan?: AgentReviewPlanSummary;
  checkpoint?: AgentReviewCheckpointSummary;
}
