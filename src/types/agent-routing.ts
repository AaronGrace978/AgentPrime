import type { RuntimeBudgetMode } from './runtime-budget';

export type AgentRouteIntent =
  | 'create'
  | 'fix'
  | 'review'
  | 'enhance'
  | 'organize'
  | 'delete'
  | 'deploy'
  | 'credential'
  | 'unknown';

export type AgentRouteBranch = 'monolithic' | 'specialized';
export type AgentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AgentRiskAssessment {
  level: AgentRiskLevel;
  score: number;
  reasons: string[];
  destructive: boolean;
  requiresConfirmation: boolean;
}

export interface AgentModelPhasePlan {
  phase: 'classify' | 'plan' | 'execute' | 'verify' | 'repair' | 'summarize';
  provider: string;
  model: string;
  capability: 'fast' | 'balanced' | 'deep' | 'local-private' | 'structured-output';
  reason: string;
}

export interface AgentToolBudgets {
  maxToolCalls: number;
  maxWriteFiles: number;
  maxCommandCalls: number;
  maxDeleteCalls: number;
  maxRepairPasses: number;
}

export interface AgentVerificationPlan {
  strategy: 'none' | 'inspect-only' | 'file-operation' | 'diagnostics' | 'project' | 'deploy';
  gates: Array<'list_dir' | 'file_exists' | 'delete_confirmed' | 'diagnostics_clean' | 'build' | 'test' | 'run' | 'deploy_status'>;
  skipProjectVerification: boolean;
  completionCriteria: string[];
}

export interface AgentRouteExplanation {
  summary: string;
  reasons: string[];
  userVisibleLabel: string;
}

export interface AgentRoutePlan {
  id: string;
  intent: AgentRouteIntent;
  confidence: number;
  taskMode: 'create' | 'fix' | 'review' | 'enhance' | 'organize';
  branch: AgentRouteBranch;
  specialists: string[];
  risk: AgentRiskAssessment;
  modelPlan: AgentModelPhasePlan[];
  allowedTools: string[];
  blockedTools: string[];
  budgets: AgentToolBudgets;
  confirmationRequired: boolean;
  confirmationReason?: string;
  verificationPlan: AgentVerificationPlan;
  runtimeBudget: RuntimeBudgetMode;
  explanation: AgentRouteExplanation;
}

export interface AgentToolRiskInput {
  name: string;
  arguments?: Record<string, unknown>;
}
