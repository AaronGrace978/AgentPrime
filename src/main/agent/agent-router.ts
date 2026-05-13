import { DEFAULT_MODEL_IDS } from '../../types/model-defaults';
import type { AIRuntimeSnapshot } from '../../types/ai-providers';
import type { IdeContextSnapshot } from '../../types/agent-ide-context';
import type { RuntimeBudgetMode } from '../../types/runtime-budget';
import type {
  AgentModelPhasePlan,
  AgentRouteBranch,
  AgentRouteIntent,
  AgentRoutePlan,
  AgentRiskAssessment,
  AgentRiskLevel,
  AgentToolBudgets,
  AgentVerificationPlan,
} from '../../types/agent-routing';
import { detectTaskMode, TaskMode } from './task-mode';
import { routeToSpecialists, type AgentRole } from './specialized-agents';
export { scoreToolRisk } from './risk-scoring';

interface AgentRouterInput {
  message: string;
  workspacePath: string;
  ideContext?: IdeContextSnapshot;
  repairScope?: {
    findings?: Array<{ severity: 'info' | 'warning' | 'error' | 'critical'; stage?: string; files?: string[] }>;
  };
  requestedBranch: AgentRouteBranch;
  runtimeBudget: RuntimeBudgetMode;
  selectedProvider: string;
  selectedModel: string;
  requestedRuntime?: AIRuntimeSnapshot;
  autonomyLevel?: 1 | 2 | 3 | 4 | 5;
}

const DELETE_REQUEST_RE = /\b(delete|remove|trash|wipe|rmdir)\b/i;
const DEPLOY_REQUEST_RE = /\b(deploy|publish|release|ship|vercel|netlify)\b/i;
const CREDENTIAL_REQUEST_RE = /\b(api\s*key|secret|token|credential|password|oauth|env)\b/i;

const CORE_TOOLS = [
  'read_file',
  'list_dir',
  'search_codebase',
  'find_symbols',
  'write_file',
  'patch_file',
  'str_replace',
  'create_directory',
  'scaffold_project',
  'run_command',
];

const READ_ONLY_TOOLS = ['read_file', 'list_dir', 'search_codebase', 'find_symbols'];
const FILE_MANAGEMENT_TOOLS = ['list_dir', 'create_directory', 'organize_folder', 'undo_organize_folder', 'delete_path', 'run_command'];
const DESTRUCTIVE_TOOLS = ['delete_path', 'run_command'];

const MODEL_CAPABILITY_MATRIX: Record<string, AgentModelPhasePlan['capability']> = {
  anthropic: 'deep',
  openai: 'structured-output',
  openrouter: 'deep',
  ollama: 'balanced',
  'ollama:local': 'local-private',
  'ollama:cloud': 'deep',
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function riskLevelFromScore(score: number): AgentRiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function isDeleteIntent(message: string, taskMode: TaskMode): boolean {
  return taskMode === TaskMode.ORGANIZE && DELETE_REQUEST_RE.test(message);
}

function resolveIntent(message: string, taskMode: TaskMode): AgentRouteIntent {
  const lower = message.toLowerCase();
  if (isDeleteIntent(lower, taskMode)) return 'delete';
  if (DEPLOY_REQUEST_RE.test(lower)) return 'deploy';
  if (CREDENTIAL_REQUEST_RE.test(lower)) return 'credential';
  if (taskMode === TaskMode.CREATE) return 'create';
  if (taskMode === TaskMode.FIX) return 'fix';
  if (taskMode === TaskMode.REVIEW) return 'review';
  if (taskMode === TaskMode.ENHANCE) return 'enhance';
  if (taskMode === TaskMode.ORGANIZE) return 'organize';
  return 'unknown';
}

function buildRiskAssessment(input: AgentRouterInput, intent: AgentRouteIntent): AgentRiskAssessment {
  const message = input.message.toLowerCase();
  const reasons: string[] = [];
  let score = 10;

  if (intent === 'delete') {
    score += 55;
    reasons.push('Request includes delete/remove intent');
  }
  if (intent === 'deploy') {
    score += 45;
    reasons.push('Request can publish externally');
  }
  if (intent === 'credential') {
    score += 50;
    reasons.push('Request touches secrets or credentials');
  }
  if (/\b(rm\s+-rf|rmdir|del\s+\/s|format|git\s+reset\s+--hard|force\s+push)\b/i.test(message)) {
    score += 45;
    reasons.push('Request mentions irreversible shell operations');
  }
  if (/\b(install|npm\s+i|pip\s+install|docker|network|curl|wget)\b/i.test(message)) {
    score += 20;
    reasons.push('Request may run dependency or network commands');
  }
  if (/\b(rewrite|gut|replace everything|full app|entire project)\b/i.test(message)) {
    score += 20;
    reasons.push('Large rewrite scope detected');
  }

  const diagnostics = input.ideContext?.diagnostics || [];
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  if (errorCount > 0) {
    score += Math.min(20, errorCount * 4);
    reasons.push(`${errorCount} active diagnostic error(s) in IDE context`);
  }

  const criticalFindings = input.repairScope?.findings?.filter((f) => f.severity === 'critical').length || 0;
  if (criticalFindings > 0) {
    score += 25;
    reasons.push(`${criticalFindings} critical repair finding(s)`);
  }

  if ((input.autonomyLevel || 3) <= 2) {
    score += 10;
    reasons.push('Low autonomy requires tighter confirmation');
  }

  const destructive = intent === 'delete' || /rm\s+-rf|rmdir|del\s+\/s|format/i.test(message);
  const level = riskLevelFromScore(clampScore(score));

  return {
    level,
    score: clampScore(score),
    reasons: reasons.length ? reasons : ['No high-risk keywords or critical context detected'],
    destructive,
    requiresConfirmation: destructive || level === 'critical' || intent === 'deploy' || intent === 'credential',
  };
}

function buildAllowedTools(intent: AgentRouteIntent): { allowed: string[]; blocked: string[] } {
  if (intent === 'review') {
    return {
      allowed: READ_ONLY_TOOLS,
      blocked: ['write_file', 'patch_file', 'str_replace', 'scaffold_project', 'delete_path', 'run_command'],
    };
  }
  if (intent === 'organize' || intent === 'delete') {
    return {
      allowed: FILE_MANAGEMENT_TOOLS,
      blocked: ['write_file', 'patch_file', 'str_replace', 'scaffold_project', 'search_codebase'],
    };
  }
  if (intent === 'credential') {
    return {
      allowed: READ_ONLY_TOOLS,
      blocked: ['write_file', 'patch_file', 'str_replace', 'delete_path', 'run_command', 'scaffold_project'],
    };
  }
  return {
    allowed: CORE_TOOLS,
    blocked: intent === 'deploy' ? ['delete_path'] : [],
  };
}

function buildBudgets(risk: AgentRiskAssessment, runtimeBudget: RuntimeBudgetMode, intent: AgentRouteIntent): AgentToolBudgets {
  const deep = runtimeBudget === 'deep';
  const instant = runtimeBudget === 'instant';
  if (intent === 'review') {
    return { maxToolCalls: instant ? 8 : 16, maxWriteFiles: 0, maxCommandCalls: 0, maxDeleteCalls: 0, maxRepairPasses: 0 };
  }
  if (intent === 'delete') {
    return { maxToolCalls: 6, maxWriteFiles: 0, maxCommandCalls: 1, maxDeleteCalls: 1, maxRepairPasses: 0 };
  }
  if (intent === 'organize') {
    return { maxToolCalls: 12, maxWriteFiles: 0, maxCommandCalls: 2, maxDeleteCalls: 0, maxRepairPasses: 0 };
  }
  if (risk.level === 'critical') {
    return { maxToolCalls: 12, maxWriteFiles: 3, maxCommandCalls: 1, maxDeleteCalls: 0, maxRepairPasses: 1 };
  }
  return {
    maxToolCalls: deep ? 80 : instant ? 20 : 45,
    maxWriteFiles: deep ? 35 : instant ? 8 : 20,
    maxCommandCalls: deep ? 10 : instant ? 2 : 5,
    maxDeleteCalls: 0,
    maxRepairPasses: deep ? 3 : 2,
  };
}

function buildVerificationPlan(intent: AgentRouteIntent): AgentVerificationPlan {
  switch (intent) {
    case 'review':
      return {
        strategy: 'inspect-only',
        gates: [],
        skipProjectVerification: true,
        completionCriteria: ['Findings returned without modifying files'],
      };
    case 'delete':
      return {
        strategy: 'file-operation',
        gates: ['delete_confirmed', 'list_dir'],
        skipProjectVerification: true,
        completionCriteria: ['Target path no longer exists or was already absent'],
      };
    case 'organize':
      return {
        strategy: 'file-operation',
        gates: ['list_dir'],
        skipProjectVerification: true,
        completionCriteria: ['Files are in the requested locations'],
      };
    case 'deploy':
      return {
        strategy: 'deploy',
        gates: ['build', 'deploy_status'],
        skipProjectVerification: false,
        completionCriteria: ['Build succeeds before deploy', 'Deployment reports a successful URL or status'],
      };
    case 'fix':
      return {
        strategy: 'diagnostics',
        gates: ['diagnostics_clean', 'build', 'test'],
        skipProjectVerification: false,
        completionCriteria: ['Touched files have no error diagnostics', 'Relevant build or test command passes when available'],
      };
    case 'create':
    case 'enhance':
    default:
      return {
        strategy: 'project',
        gates: ['diagnostics_clean', 'build', 'run'],
        skipProjectVerification: false,
        completionCriteria: ['Generated project structure is complete', 'Build or run verification passes when available'],
      };
  }
}

function modelCapability(provider: string, model: string): AgentModelPhasePlan['capability'] {
  const id = `${provider}/${model}`.toLowerCase();
  if (provider === 'ollama' && !model.includes(':cloud')) return MODEL_CAPABILITY_MATRIX['ollama:local'];
  if (provider === 'ollama' && model.includes(':cloud')) return MODEL_CAPABILITY_MATRIX['ollama:cloud'];
  if (/mini|flash|small|fast/.test(id)) return 'fast';
  if (/opus|gpt-5|671b|deep|sonnet|kimi|qwen3-coder/.test(id)) return 'deep';
  return MODEL_CAPABILITY_MATRIX[provider] || 'balanced';
}

function buildModelPlan(input: AgentRouterInput, risk: AgentRiskAssessment, intent: AgentRouteIntent): AgentModelPhasePlan[] {
  const effectiveProvider = input.requestedRuntime?.effectiveProvider || input.selectedProvider;
  const effectiveModel = input.requestedRuntime?.effectiveModel || input.selectedModel;
  const executeProvider = input.requestedRuntime?.executionProvider || effectiveProvider;
  const executeModel = input.requestedRuntime?.executionModel || effectiveModel;
  const preferDeep = input.runtimeBudget === 'deep' || risk.level === 'high' || risk.level === 'critical';
  const verifyModel = preferDeep ? DEFAULT_MODEL_IDS.ollamaAnalysis : executeModel;
  const routingProvider = 'ollama';
  const routingModel = DEFAULT_MODEL_IDS.ollamaSpecialist;

  return [
    {
      phase: 'classify',
      provider: routingProvider,
      model: routingModel,
      capability: 'fast',
      reason: 'Use a fast routing model before spending deep execution tokens',
    },
    {
      phase: 'plan',
      provider: preferDeep ? 'ollama' : routingProvider,
      model: preferDeep ? DEFAULT_MODEL_IDS.ollamaLongContext : routingModel,
      capability: preferDeep ? 'deep' : 'fast',
      reason: preferDeep ? 'High-risk or deep-budget task gets stronger planning' : 'Keep normal planning fast and compact',
    },
    {
      phase: 'execute',
      provider: executeProvider,
      model: executeModel,
      capability: modelCapability(executeProvider, executeModel),
      reason: `Execution follows selected ${intent} runtime unless a phase escalates`,
    },
    {
      phase: 'verify',
      provider: preferDeep ? 'ollama' : executeProvider,
      model: verifyModel,
      capability: preferDeep ? 'structured-output' : modelCapability(executeProvider, executeModel),
      reason: 'Verification favors structured, conservative analysis',
    },
  ];
}

function needsSpecialistFanout(message: string): boolean {
  return /\b(security audit|backend and frontend|full stack|database|auth|deploy|ci|docker|tauri|electron|multi[-\s]?service|specialist)\b/i.test(
    message
  );
}

function resolveBranch(
  intent: AgentRouteIntent,
  requestedBranch: AgentRouteBranch,
  runtimeBudget: RuntimeBudgetMode,
  risk: AgentRiskAssessment,
  message: string
): AgentRouteBranch {
  if (intent === 'organize' || intent === 'delete' || intent === 'review' || intent === 'credential') {
    return 'monolithic';
  }
  if (requestedBranch !== 'specialized') {
    return requestedBranch;
  }
  if (runtimeBudget === 'deep' || risk.level === 'high' || risk.level === 'critical') {
    return 'specialized';
  }
  if (intent === 'deploy' || needsSpecialistFanout(message)) {
    return 'specialized';
  }
  return 'monolithic';
}

function buildSpecialistPlan(
  intent: AgentRouteIntent,
  message: string,
  branch: AgentRouteBranch,
  ideContext?: IdeContextSnapshot
): AgentRole[] {
  if (branch !== 'specialized') return [];
  const files = ideContext?.openTabs?.map((tab) => tab.path) || [];
  const language = ideContext?.activeFile?.path?.split('.').pop();
  const roles = routeToSpecialists(message, { files, language });
  if ((intent === 'fix' || intent === 'deploy') && !roles.includes('repair_specialist')) {
    roles.push('repair_specialist');
  }
  return Array.from(new Set(roles));
}

export function buildAgentRoutePlan(input: AgentRouterInput): AgentRoutePlan {
  const mode = detectTaskMode(input.message);
  const intent = resolveIntent(input.message, mode.mode);
  const risk = buildRiskAssessment(input, intent);
  const branch = resolveBranch(intent, input.requestedBranch, input.runtimeBudget, risk, input.message);
  const specialists = buildSpecialistPlan(intent, input.message, branch, input.ideContext);
  const tools = buildAllowedTools(intent);
  const verificationPlan = buildVerificationPlan(intent);
  const budgets = buildBudgets(risk, input.runtimeBudget, intent);
  const modelPlan = buildModelPlan(input, risk, intent);
  const confirmationRequired = risk.requiresConfirmation;
  const confirmationReason = confirmationRequired
    ? risk.reasons.find((reason) => /delete|irreversible|publish|secret|credential/i.test(reason)) || risk.reasons[0]
    : undefined;

  return {
    id: `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    intent,
    confidence: mode.confidence,
    taskMode: mode.mode,
    branch,
    specialists,
    risk,
    modelPlan,
    allowedTools: tools.allowed,
    blockedTools: Array.from(new Set([...tools.blocked, ...(!risk.destructive && intent === 'review' ? DESTRUCTIVE_TOOLS : [])])),
    budgets,
    confirmationRequired,
    confirmationReason,
    verificationPlan,
    runtimeBudget: input.runtimeBudget,
    explanation: {
      summary: `${intent} routed to ${branch} with ${risk.level} risk`,
      reasons: [
        mode.reason,
        ...risk.reasons,
        verificationPlan.skipProjectVerification
          ? 'Project verification skipped for this intent'
          : `Verification strategy: ${verificationPlan.strategy}`,
      ],
      userVisibleLabel: `${intent} | ${risk.level} risk | ${branch}`,
    },
  };
}
