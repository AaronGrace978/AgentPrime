/**
 * Specialized Agent Loop - ROBUST VERSION
 *
 * Key improvements:
 * 1. Verification loop - checks if project is actually complete
 * 2. Self-correction - retries if files are missing
 * 3. Dependency checking - ensures all referenced files exist
 * 4. Single-pass orchestrator - creates ALL files needed
 * 5. Project documentation - generates PROJECT_LOG.md on completion
 * 6. Project memory - remembers past projects for updates
 */

import {
  routeToSpecialists,
  executeWithSpecialists,
  AgentRole,
  type SpecialistExecutionCallbacks,
} from './specialized-agents';
import { AgentContext, AgentLoop } from '../agent-loop';
import {
  appendIdeContextToUserTask,
  formatTerminalStructuredErrorsForModel,
} from './ide-context-format';
import { TaskMode, detectTaskMode } from './task-mode';
import { getProjectRegistry, ProjectRegistry } from './project-registry';
import { ProjectDocumenter } from './project-documenter';
import { testProjectInBrowser, formatBrowserTestResults } from './tools/projectTester';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { TimeoutError } from '../core/timeout-utils';
import { transactionManager } from '../core/transaction-manager';
import { retryWithRecovery } from '../core/error-recovery';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';
import { getTelemetryService } from '../core/telemetry-service';
import { getTaskMaster, type TaskMasterRetryContext } from './task-master';
import { getProjectRuntimeProfileSync, mapRuntimeKindToRegistryType } from './project-runtime';
import {
  detectCanonicalTemplateId,
  scaffoldProjectFromTemplate,
  workspaceNeedsDeterministicScaffold,
} from './scaffold-resolver';
import {
  LEGACY_SPECIALIST_ROLE_MAP,
  type SpecialistBlackboard,
  type SpecialistId,
  type VerificationFinding,
} from './specialist-contracts';
import { ProjectRunner } from './tools/projectRunner';
import { getPluginManager } from '../core/plugin-singleton';
import { reviewSessionManager } from './review-session-manager';
import { clampAgentAutonomyLevel, resolveEffectiveAutonomyPolicy } from './autonomy-policy';
import {
  buildReviewCheckpointSummary,
  resolveReflectionBudget,
  shouldApplyAgentChangesImmediately,
} from './reflection-policy';
import type {
  AgentReviewFinding,
  AgentReviewPlanSummary,
  AgentReviewSessionSnapshot,
  AgentReviewVerificationState,
} from '../../types/agent-review';

import { PromptSanitizer } from '../security/prompt-sanitizer';
import { createLogger, createOperationId } from '../core/logger';
import type { RuntimeBudgetMode } from '../../types/runtime-budget';

const log = createLogger('SpecializedAgent');

interface ProjectVerification {
  isComplete: boolean;
  missingFiles: string[];
  errors: string[];
  createdFiles: string[];
}

function extractFilesFromVerificationIssue(summary: string): string[] {
  const matches =
    summary.match(/[A-Za-z0-9_./-]+\.(tsx?|jsx?|py|json|html|css|md|yml|yaml|toml|rs|js)/g) || [];
  let anchorFile: string | null = null;
  const normalized = matches.map((match) => {
    const cleaned = match.replace(/\\/g, '/');
    if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
      if (!anchorFile) {
        return cleaned.replace(/^\.\//, '');
      }
      return path.posix.normalize(path.posix.join(path.posix.dirname(anchorFile), cleaned));
    }
    anchorFile = anchorFile || cleaned;
    return cleaned;
  });
  return [...new Set(normalized)];
}

function inferVerificationStage(summary: string): AgentReviewFinding['stage'] {
  const normalized = summary.toLowerCase();
  if (normalized.startsWith('[install]') || normalized.includes('install failed')) {
    return 'install';
  }
  if (normalized.startsWith('[build]') || normalized.includes('build failed')) {
    return 'build';
  }
  if (normalized.startsWith('[run]') || normalized.includes('run failed')) {
    return 'run';
  }
  if (normalized.startsWith('[browser') || normalized.includes('browser fix needed')) {
    return 'browser';
  }
  if (normalized.startsWith('[validate]') || normalized.includes('missing file')) {
    return 'validation';
  }
  return 'unknown';
}

function formatSpecialistTitle(id: SpecialistId): string {
  return id
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferSpecialistOwnerFromPath(filePath: string): SpecialistId {
  const normalized = filePath.replace(/\\/g, '/');
  if (
    /^(tests|__tests__)\//i.test(normalized) ||
    /(playwright|vitest|jest)\.config\./i.test(normalized)
  ) {
    return 'testing_specialist';
  }
  if (/^src-tauri\//i.test(normalized)) {
    return 'tauri_specialist';
  }
  if (/^(backend|scripts)\/.*\.py$/i.test(normalized)) {
    return 'python_specialist';
  }
  if (/(\.css\b|\.scss\b|\.html\b|(^|\/)index\.html$|^public\/)/i.test(normalized)) {
    return 'styling_ux_specialist';
  }
  if (
    /(schema|contract|dto|payload|response|request|validator|zod|openapi|prisma)/i.test(normalized)
  ) {
    return 'data_contract_specialist';
  }
  if (/(auth|security|permission|secret|token|csp|csrf|xss)/i.test(normalized)) {
    return 'security_specialist';
  }
  if (
    /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|vite\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|next\.config\.[^/]+|Dockerfile(\.[^/]+)?|Makefile|requirements[^/]*\.txt|pyproject\.toml|\.github\/workflows\/)/i.test(
      normalized
    )
  ) {
    return 'pipeline_specialist';
  }
  if (/\.(tsx?|jsx?)$/i.test(normalized) || /^(src|app|pages|components|lib)\//i.test(normalized)) {
    return 'javascript_specialist';
  }
  return 'repair_specialist';
}

function inferSpecialistOwnerForFinding(
  stage: AgentReviewFinding['stage'],
  summary: string,
  files: string[]
): SpecialistId {
  if (
    /(security|auth|authorize|authorization|permission|rbac|secret|token|xss|csrf|injection|csp)/i.test(
      summary
    )
  ) {
    return 'security_specialist';
  }
  if (/(performance|latency|slow|timeout|memory|bundle|render|blocking)/i.test(summary)) {
    return 'performance_specialist';
  }
  if (
    /(schema|contract|dto|payload|response shape|request shape|validation|zod|openapi|type mismatch|ts2322)/i.test(
      summary
    )
  ) {
    return 'data_contract_specialist';
  }

  const fileOwnedSpecialists = [
    ...new Set(files.map((filePath) => inferSpecialistOwnerFromPath(filePath))),
  ];
  if (fileOwnedSpecialists.length === 1) {
    return fileOwnedSpecialists[0];
  }
  if (
    fileOwnedSpecialists.includes('pipeline_specialist') &&
    (stage === 'install' || stage === 'build')
  ) {
    return 'pipeline_specialist';
  }
  if (fileOwnedSpecialists.includes('styling_ux_specialist') && stage === 'browser') {
    return 'styling_ux_specialist';
  }
  if (fileOwnedSpecialists.includes('testing_specialist')) {
    return 'testing_specialist';
  }
  if (fileOwnedSpecialists.includes('python_specialist')) {
    return 'python_specialist';
  }
  if (fileOwnedSpecialists.includes('tauri_specialist')) {
    return 'tauri_specialist';
  }

  switch (stage) {
    case 'install':
    case 'build':
      return 'pipeline_specialist';
    case 'browser':
      return /(\.css\b|layout|visual|theme|accessibility|index\.html)/i.test(summary)
        ? 'styling_ux_specialist'
        : 'javascript_specialist';
    case 'run':
      return 'javascript_specialist';
    case 'validation':
      return files[0] ? inferSpecialistOwnerFromPath(files[0]) : 'repair_specialist';
    default:
      return fileOwnedSpecialists[0] || 'repair_specialist';
  }
}

function mapFindingOwnerToAgentRole(owner: SpecialistId): AgentRole {
  switch (owner) {
    case 'styling_ux_specialist':
    case 'testing_specialist':
    case 'security_specialist':
    case 'performance_specialist':
    case 'data_contract_specialist':
    case 'repair_specialist':
    case 'javascript_specialist':
    case 'python_specialist':
    case 'tauri_specialist':
    case 'pipeline_specialist':
      return owner;
    case 'integration_verifier':
      return 'integration_analyst';
    default:
      return 'repair_specialist';
  }
}

export class SpecializedAgentLoop extends EventEmitter {
  private context: AgentContext;
  private registry: ProjectRegistry;
  private stopRequested = false;
  private pendingReviewSession: AgentReviewSessionSnapshot | null = null;

  constructor(context: AgentContext) {
    super();
    this.context = context;
    this.registry = getProjectRegistry();
  }

  requestStop(_reason: string = 'Stopped by user'): void {
    this.stopRequested = true;
  }

  consumePendingReviewSession(): AgentReviewSessionSnapshot | null {
    const snapshot = this.pendingReviewSession;
    this.pendingReviewSession = null;
    return snapshot;
  }

  private resolveMode(isUpdate: boolean, retryCount: number): SpecialistBlackboard['mode'] {
    if (retryCount > 0) {
      return 'repair';
    }
    return isUpdate ? 'edit' : 'create';
  }

  private refineRolesForRetry(
    roles: AgentRole[],
    lastVerification: ProjectVerification | null,
    findings: VerificationFinding[] = []
  ): AgentRole[] {
    if (!lastVerification) {
      return roles;
    }

    let refined = [...roles];
    const retryFiles = new Set<string>([
      ...lastVerification.missingFiles,
      ...lastVerification.errors.flatMap((error) => extractFilesFromVerificationIssue(error)),
    ]);
    const normalizedRetryFiles = [...retryFiles].map((file) => file.replace(/\\/g, '/'));
    const hasConcreteRetryTargets = normalizedRetryFiles.length > 0;
    const hasSourceTargets = normalizedRetryFiles.some((file) =>
      /^(src|app|pages|components|lib|backend|public)\//.test(file)
    );
    const hasConfigTargets = normalizedRetryFiles.some((file) =>
      /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|vite\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|next\.config\.[^/]+|Dockerfile(\.[^/]+)?|Makefile|requirements[^/]*\.txt|pyproject\.toml|\.github\/workflows\/)/i.test(
        file
      )
    );
    const hasTestTargets = normalizedRetryFiles.some(
      (file) =>
        /^(tests|__tests__)\//.test(file) || /(playwright|vitest|jest)\.config\./i.test(file)
    );
    const hasStylingSpecificFailures = lastVerification.errors.some((error) =>
      /(\.css\b|\.scss\b|stylesheet|layout|visual|theme|accessibility|index\.html)/i.test(error)
    );
    const hasSecurityFailures = lastVerification.errors.some((error) =>
      /(security|auth|authorize|authorization|permission|rbac|secret|token|xss|csrf|injection|csp)/i.test(
        error
      )
    );
    const hasPerformanceFailures = lastVerification.errors.some((error) =>
      /(performance|latency|slow|timeout|memory|bundle|render)/i.test(error)
    );
    const hasDataContractFailures = lastVerification.errors.some((error) =>
      /(schema|contract|dto|payload|response shape|request shape|validation|zod|ts2322|type mismatch)/i.test(
        error
      )
    );
    const directRetryRoles = new Set(
      findings.map((finding) => mapFindingOwnerToAgentRole(finding.suggestedOwner))
    );
    if (!hasStylingSpecificFailures && refined.includes('styling_ux_specialist')) {
      refined = refined.filter((role) => role !== 'styling_ux_specialist');
      log.info(
        '[SpecializedAgent] ℹ️ Retry has no styling-specific failures; skipping styling_ux_specialist'
      );
    }
    if (!hasSecurityFailures && refined.includes('security_specialist')) {
      refined = refined.filter((role) => role !== 'security_specialist');
    } else if (hasSecurityFailures && !refined.includes('security_specialist')) {
      refined.push('security_specialist');
    }
    if (!hasPerformanceFailures && refined.includes('performance_specialist')) {
      refined = refined.filter((role) => role !== 'performance_specialist');
    } else if (hasPerformanceFailures && !refined.includes('performance_specialist')) {
      refined.push('performance_specialist');
    }
    if (!hasDataContractFailures && refined.includes('data_contract_specialist')) {
      refined = refined.filter((role) => role !== 'data_contract_specialist');
    } else if (hasDataContractFailures && !refined.includes('data_contract_specialist')) {
      refined.push('data_contract_specialist');
    }

    const isBuildHeavyRetry = lastVerification.errors.some((error) =>
      /\[build\]|\[install\]|typescript|ts\d{4}|npm error|yarn error|pnpm error/i.test(error)
    );
    const isConcreteRepairRetry =
      hasConcreteRetryTargets ||
      lastVerification.missingFiles.length > 0 ||
      lastVerification.errors.some((error) =>
        /imports missing file|cannot find module|missing dependency/i.test(error)
      );

    if (isBuildHeavyRetry && refined.includes('integration_analyst')) {
      refined = refined.filter((role) => role !== 'integration_analyst');
      log.info('[SpecializedAgent] ℹ️ Retry focused on build errors; skipping integration_analyst');
    }
    if (isBuildHeavyRetry && refined.includes('tool_orchestrator')) {
      refined = refined.filter((role) => role !== 'tool_orchestrator');
      log.info('[SpecializedAgent] ℹ️ Retry focused on build errors; skipping tool_orchestrator');
    }
    if (isBuildHeavyRetry && refined.includes('testing_specialist') && !hasTestTargets) {
      refined = refined.filter((role) => role !== 'testing_specialist');
      log.info('[SpecializedAgent] ℹ️ Retry focused on build errors; skipping testing_specialist');
    }
    if (isConcreteRepairRetry && refined.includes('integration_analyst')) {
      refined = refined.filter((role) => role !== 'integration_analyst');
      log.info(
        '[SpecializedAgent] ℹ️ Retry has concrete repair targets; skipping integration_analyst'
      );
    }
    if (isConcreteRepairRetry && refined.includes('tool_orchestrator')) {
      refined = refined.filter((role) => role !== 'tool_orchestrator');
      log.info(
        '[SpecializedAgent] ℹ️ Retry has concrete repair targets; skipping tool_orchestrator'
      );
    }
    if (isConcreteRepairRetry && refined.includes('testing_specialist') && !hasTestTargets) {
      refined = refined.filter((role) => role !== 'testing_specialist');
      log.info(
        '[SpecializedAgent] ℹ️ Retry has no test-specific failures; skipping testing_specialist'
      );
    }
    if (
      hasConcreteRetryTargets &&
      hasSourceTargets &&
      !hasConfigTargets &&
      refined.includes('pipeline_specialist')
    ) {
      refined = refined.filter((role) => role !== 'pipeline_specialist');
      log.info(
        '[SpecializedAgent] ℹ️ Retry only targets application source files; skipping pipeline_specialist'
      );
    }

    for (const directRole of directRetryRoles) {
      if (directRole !== 'integration_analyst' && !refined.includes(directRole)) {
        refined.push(directRole);
      }
    }

    return refined;
  }

  private refineRolesForRepairScope(
    roles: AgentRole[],
    repairScope: NonNullable<AgentContext['repairScope']>
  ): AgentRole[] {
    let refined = [...roles];
    const targetTexts = [
      ...repairScope.allowedFiles.map((file) => file.replace(/\\/g, '/')),
      ...repairScope.findings.map((finding) => finding.summary),
    ];
    const hasSourceTargets = targetTexts.some((value) =>
      /(^|[\s:])(src|app|pages|components|lib|backend|public)\//i.test(value)
    );
    const hasConfigTargets = targetTexts.some((value) =>
      /(^|[\s:])(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|vite\.config\.[^\s]+|tailwind\.config\.[^\s]+|postcss\.config\.[^\s]+|next\.config\.[^\s]+|Dockerfile(\.[^\s]+)?|Makefile|requirements[^\s]*\.txt|pyproject\.toml|\.github\/workflows\/)/i.test(
        value
      )
    );
    const hasTestTargets = targetTexts.some(
      (value) =>
        /(^|[\s:])(tests|__tests__)\//i.test(value) ||
        /(playwright|vitest|jest)\.config\./i.test(value)
    );
    const hasStylingTargets = targetTexts.some((value) =>
      /(\.css\b|\.scss\b|stylesheet|layout|theme|accessibility|index\.html)/i.test(value)
    );
    const hasSecurityTargets = targetTexts.some((value) =>
      /(security|auth|authorize|authorization|permission|rbac|secret|token|xss|csrf|injection|csp)/i.test(
        value
      )
    );
    const hasPerformanceTargets = targetTexts.some((value) =>
      /(performance|latency|slow|timeout|memory|bundle|render)/i.test(value)
    );
    const hasDataContractTargets = targetTexts.some((value) =>
      /(schema|contract|dto|payload|response shape|request shape|validation|zod)/i.test(value)
    );
    const directRepairRoles = new Set(
      repairScope.findings.map((finding) =>
        mapFindingOwnerToAgentRole(
          ('suggestedOwner' in finding
            ? (finding.suggestedOwner as SpecialistId | undefined)
            : undefined) ||
            inferSpecialistOwnerForFinding(finding.stage, finding.summary, finding.files)
        )
      )
    );

    refined = refined.filter(
      (role) => role !== 'integration_analyst' && role !== 'tool_orchestrator'
    );

    if (!hasTestTargets) {
      refined = refined.filter((role) => role !== 'testing_specialist');
    }
    if (!hasConfigTargets) {
      refined = refined.filter((role) => role !== 'pipeline_specialist');
    }
    if (!hasStylingTargets) {
      refined = refined.filter((role) => role !== 'styling_ux_specialist');
    }
    if (!hasSecurityTargets) {
      refined = refined.filter((role) => role !== 'security_specialist');
    }
    if (!hasPerformanceTargets) {
      refined = refined.filter((role) => role !== 'performance_specialist');
    }
    if (!hasDataContractTargets) {
      refined = refined.filter((role) => role !== 'data_contract_specialist');
    }
    if (hasSourceTargets && !refined.includes('javascript_specialist')) {
      refined.push('javascript_specialist');
    }
    if (hasConfigTargets && !refined.includes('pipeline_specialist')) {
      refined.push('pipeline_specialist');
    }
    if (hasSecurityTargets && !refined.includes('security_specialist')) {
      refined.push('security_specialist');
    }
    if (hasPerformanceTargets && !refined.includes('performance_specialist')) {
      refined.push('performance_specialist');
    }
    if (hasDataContractTargets && !refined.includes('data_contract_specialist')) {
      refined.push('data_contract_specialist');
    }
    for (const directRole of directRepairRoles) {
      if (directRole !== 'integration_analyst' && !refined.includes(directRole)) {
        refined.push(directRole);
      }
    }
    if (!refined.includes('repair_specialist')) {
      refined.push('repair_specialist');
    }

    return [...new Set(refined)];
  }

  private mapLegacyRoleToSpecialist(role: AgentRole): SpecialistId {
    if (
      role === 'styling_ux_specialist' ||
      role === 'testing_specialist' ||
      role === 'repair_specialist' ||
      role === 'security_specialist' ||
      role === 'performance_specialist' ||
      role === 'data_contract_specialist'
    ) {
      return role;
    }
    return LEGACY_SPECIALIST_ROLE_MAP[role as keyof typeof LEGACY_SPECIALIST_ROLE_MAP];
  }

  private buildSpecialistRoster(
    roles: AgentRole[],
    mode: SpecialistBlackboard['mode']
  ): SpecialistId[] {
    const mapped = roles.map((role) => this.mapLegacyRoleToSpecialist(role));
    const roster = new Set<SpecialistId>(['executive_router', 'task_master', ...mapped]);

    if (mode === 'create') {
      roster.add('template_scaffold_specialist');
    }

    if (mode === 'repair') {
      roster.add('repair_specialist');
    }

    return [...roster];
  }

  private buildBlackboard(
    userMessage: string,
    mode: SpecialistBlackboard['mode'],
    roles: AgentRole[],
    retryContext?: TaskMasterRetryContext
  ): SpecialistBlackboard {
    const taskId = `specialized_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const specialists = this.buildSpecialistRoster(roles, mode);
    const plan = getTaskMaster(this.context.workspacePath, userMessage).buildPlan({
      mode,
      specialists,
      retryContext,
    });

    return {
      taskId,
      userGoal: userMessage,
      mode,
      currentOwner: 'task_master',
      status: mode === 'repair' ? 'repairing' : 'planning',
      workspacePath: this.context.workspacePath,
      activeStepId: plan.activeStepId,
      claimedFiles: plan.claimedFiles,
      steps: plan.steps,
      artifacts: [],
      findings: [],
      approvalsRequired: [],
    };
  }

  private buildPlanSummary(
    blackboard: SpecialistBlackboard,
    reflectionBudget?: RuntimeBudgetMode
  ): AgentReviewPlanSummary {
    const fileReasons = new Map<string, { reason: string; owner?: string }>();
    for (const step of blackboard.steps) {
      for (const filePath of step.claimedFiles) {
        if (!fileReasons.has(filePath)) {
          fileReasons.set(filePath, {
            reason: step.goal,
            owner: formatSpecialistTitle(step.specialist),
          });
        }
      }
    }

    const activeFiles = [...fileReasons.keys()];
    const activeSpecialists = new Set(blackboard.steps.map((step) => step.specialist));
    const summary =
      blackboard.mode === 'repair'
        ? `Targeted repair across ${activeFiles.length || 0} file(s) with ${activeSpecialists.size} specialist lane(s).`
        : `Planned ${blackboard.mode} run across ${activeFiles.length || 0} file(s) with ${activeSpecialists.size} specialist lane(s).`;

    const rationale =
      blackboard.mode === 'repair'
        ? 'Verification found concrete issues, so AgentPrime narrowed scope to the files implicated by those failures before asking for approval.'
        : 'AgentPrime assigned bounded specialists to the files they own, staged the resulting patch set, and deferred workspace writes until review approval.';

    return {
      mode: blackboard.mode,
      summary,
      rationale,
      reflectionBudget,
      steps: blackboard.steps.map((step) => ({
        id: step.id,
        title: formatSpecialistTitle(step.specialist),
        summary: step.goal,
        owner: formatSpecialistTitle(step.specialist),
        files: [...step.claimedFiles],
        acceptanceCriteria: [...step.acceptanceCriteria],
        status: step.status,
      })),
      fileReasons: [...fileReasons.entries()].map(([filePath, data]) => ({
        filePath,
        reason: data.reason,
        owner: data.owner,
      })),
    };
  }

  private buildFallbackPlanSummary(
    taskDescription: string,
    files: string[],
    mode: AgentReviewPlanSummary['mode'] = 'create',
    reflectionBudget?: RuntimeBudgetMode
  ): AgentReviewPlanSummary {
    return {
      mode,
      summary: `Prepared ${files.length} staged file(s) for review.`,
      rationale:
        'AgentPrime generated a bounded patch set for the requested task and held the workspace write behind a review checkpoint.',
      reflectionBudget,
      steps: [
        {
          id: `fallback_${Date.now()}`,
          title: 'AgentPrime',
          summary: taskDescription || 'Apply the requested workspace changes.',
          owner: 'AgentPrime',
          files: [...files],
          acceptanceCriteria: ['Review the staged files before applying them to the workspace.'],
          status: 'completed',
        },
      ],
      fileReasons: files.map((filePath) => ({
        filePath,
        reason: taskDescription || 'Included in the staged patch set for this request.',
        owner: 'AgentPrime',
      })),
    };
  }

  /**
   * Run a task using specialized agents WITH VERIFICATION
   */
  async run(rawUserMessage: string): Promise<string> {
    const runId = createOperationId('specialrun');
    const sanitization = PromptSanitizer.sanitize(rawUserMessage);
    const userMessage = sanitization.sanitizedText;

    if (!sanitization.isSafe) {
      log.warn(`[Security] Blocked malicious prompt. Flags: ${sanitization.flags.join(', ')}`);
      this.emit('message', {
        role: 'assistant',
        content: `⚠️ **Security Alert:** Your input contained potentially unsafe instructions (${sanitization.flags.join(', ')}). The request has been neutralized to protect the workspace.`,
      });
    }

    log.info(`[${runId}] Starting specialized agent execution`, {
      workspacePath: this.context.workspacePath,
    });
    if (this.stopRequested) {
      log.info(`[${runId}] Stop requested before run start; aborting specialized execution`);
      this.pendingReviewSession = null;
      return '⏹️ **Agent stopped by user**\n\nCreated so far: 0 file(s).';
    }
    this.stopRequested = false;
    this.pendingReviewSession = null;

    // File organization (sort/move/tidy) must use AgentLoop ORGANIZE mode — not the specialist
    // scaffold pipeline, which is tuned for coding projects and will invent Vite/React scaffolds.
    const earlyTaskMode = detectTaskMode(userMessage);
    if (earlyTaskMode.mode === TaskMode.ORGANIZE) {
      log.info(`[${runId}] 🗂️ ORGANIZE intent — delegating to AgentLoop (not specialist pipeline)`);
      const delegate = new AgentLoop(this.context);
      delegate.on('task-start', (d: unknown) => this.emit('task-start', d as any));
      delegate.on('file-modified', (d: unknown) => this.emit('file-modified', d as any));
      delegate.on('step-complete', (d: unknown) => this.emit('step-complete', d as any));
      delegate.on('critique-complete', (d: unknown) => this.emit('critique-complete', d as any));
      delegate.on('budget-warning', (d: unknown) => this.emit('budget-warning', d as any));
      delegate.on('message', (d: unknown) => this.emit('message', d as any));
      return delegate.run(userMessage);
    }

    this.emit('task-start', { task: userMessage });
    const telemetry = getTelemetryService();
    const taskStartedAt = Date.now();
    const requestedRuntimeBudget = this.context.runtimeBudget || 'standard';
    const autonomyLevel = clampAgentAutonomyLevel(this.context.autonomyLevel);
    const executionPolicy = this.context.vibeCoderExecutionPolicy;
    const autonomyPolicy = resolveEffectiveAutonomyPolicy(autonomyLevel, executionPolicy);
    const applyImmediately = shouldApplyAgentChangesImmediately(
      this.context.monolithicApplyImmediately
    );
    telemetry.track('agent_task_start', {
      mode: 'specialized',
      workspacePath: this.context.workspacePath,
      requestedModel: this.context.model || null,
      runtimeBudget: requestedRuntimeBudget,
      autonomyLevel,
      autonomyLabel: autonomyPolicy.label,
    });

    // Start transaction for this specialized agent task
    const transaction = transactionManager.startTransaction(this.context.workspacePath);

    try {
      if (this.context.deterministicScaffoldOnly && executionPolicy?.allowScaffold !== false) {
        return await this.runDeterministicScaffoldReview(
          userMessage,
          transaction,
          taskStartedAt,
          requestedRuntimeBudget
        );
      }

      // Check if this is an update to an existing project.
      // If registry state exists but workspace is empty, treat this run as CREATE to avoid
      // unnecessary ENHANCE/FIX-style rewrite warnings on fresh scaffolds.
      const existingProject = this.registry.findByPath(this.context.workspacePath);
      const workspaceFileCount = this.getAllFiles(this.context.workspacePath).length;
      const isUpdate = existingProject !== undefined && workspaceFileCount > 0;

      if (existingProject && workspaceFileCount === 0) {
        log.info(
          `[SpecializedAgent] ℹ️ Registry entry "${existingProject.name}" found, but workspace is empty; switching to create mode`
        );
      } else if (isUpdate) {
        log.info(`[SpecializedAgent] 🔄 Updating existing project: ${existingProject.name}`);
      }
      const repairScope = this.context.repairScope;

      let retryCount = 0;
      const allCreatedFiles: string[] = [];
      let lastVerification: ProjectVerification | null = null;
      let lastStructuredFindings: VerificationFinding[] = [];
      let verificationSucceeded = false;
      let rolledBackIncomplete = false;
      let blackboard: SpecialistBlackboard | null = null;
      let lastReflectionBudget: RuntimeBudgetMode = requestedRuntimeBudget;
      let attemptCount = 0;
      let shouldContinue = true;

      // Main execution loop with retries
      while (shouldContinue) {
        if (this.stopRequested) {
          await transactionManager.rollbackTransaction();
          return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
        }

        const reflectionPlan = resolveReflectionBudget({
          requestedBudget: requestedRuntimeBudget,
          userMessage,
          isUpdate,
          retryCount,
          hasRepairScope: Boolean(repairScope),
          verificationFailed: retryCount > 0,
        });
        const maxRepairPasses = reflectionPlan.maxRepairPasses;
        const runtimeBudget = reflectionPlan.budget;
        lastReflectionBudget = runtimeBudget;
        attemptCount = retryCount + 1;

        // Step 1: Route to appropriate specialists
        const routedRoles = routeToSpecialists(userMessage, {
          files: this.getProjectFiles(),
          language: this.detectLanguage(),
          projectType: this.detectProjectType(),
        });
        let roles = [...routedRoles];
        if (retryCount > 0 && !roles.includes('repair_specialist')) {
          roles.push('repair_specialist');
        }
        if (repairScope && !roles.includes('repair_specialist')) {
          roles.push('repair_specialist');
        }
        if (repairScope && retryCount === 0) {
          roles = this.refineRolesForRepairScope(roles, repairScope);
        }
        if (retryCount > 0 && lastVerification) {
          roles = this.refineRolesForRetry(roles, lastVerification, lastStructuredFindings);
        }

        const mode = this.resolveMode(isUpdate, retryCount);
        const retryContext = lastVerification
          ? {
              missingFiles: lastVerification.missingFiles,
              errors: lastVerification.errors,
              findings: lastStructuredFindings,
            }
          : repairScope
            ? {
                missingFiles: repairScope.allowedFiles,
                errors: repairScope.findings.map((finding) => finding.summary),
                findings: repairScope.findings.map((finding) => ({
                  severity: finding.severity,
                  summary: finding.summary,
                  files: finding.files,
                  suggestedOwner: inferSpecialistOwnerForFinding(
                    finding.stage,
                    finding.summary,
                    finding.files
                  ),
                })),
              }
            : undefined;
        blackboard = this.buildBlackboard(userMessage, mode, roles, retryContext);
        this.emit('blackboard-update', blackboard);

        log.info(
          `[SpecializedAgent] Attempt ${attemptCount}/${maxRepairPasses + 1} - Routing to: ${roles.join(', ')} (budget: ${runtimeBudget})`
        );

        // Step 2: Build the task message (include missing files if retrying)
        let taskMessage = userMessage;
        if (retryCount > 0 && lastVerification) {
          const missingFileSection =
            lastVerification.missingFiles.length > 0
              ? `Missing files:\n${lastVerification.missingFiles.map((f) => `- ${f}`).join('\n')}\n\n`
              : '';
          const issueSection =
            lastVerification.errors.length > 0
              ? `Verification/build/runtime issues:\n${lastVerification.errors.map((err) => `- ${err}`).join('\n')}\n\n`
              : '';

          if (missingFileSection || issueSection) {
            taskMessage =
              `CRITICAL FIX PASS REQUIRED.\n\n` +
              `${missingFileSection}` +
              `${issueSection}` +
              `Original task: ${userMessage}\n\n` +
              `Fix the concrete issues above with targeted edits only. Keep the existing scaffold and working files intact.`;
            log.info(`[SpecializedAgent] Retry with targeted verification feedback`);
          }
        } else if (repairScope) {
          const findingLines = repairScope.findings
            .map((finding) => `- [${finding.stage}] ${finding.summary}`)
            .join('\n');
          const allowedLines = repairScope.allowedFiles
            .map((filePath) => `- ${filePath}`)
            .join('\n');
          const blockedLines = repairScope.blockedFiles
            .map((filePath) => `- ${filePath}`)
            .join('\n');
          taskMessage =
            `REPAIR SCOPE IS ENFORCED.\n\n` +
            `Allowed files:\n${allowedLines || '- Use only files named in the findings.'}\n\n` +
            `Blocked files:\n${blockedLines || '- None'}\n\n` +
            `Verifier findings:\n${findingLines || '- No structured findings were provided.'}\n\n` +
            `Original repair request: ${userMessage}\n\n` +
            `Only patch allowed files, make the smallest viable fix, and do not touch blocked files.`;
        }

        // Step 3: Execute with specialists
        const trackerMode = retryCount > 0 ? 'fix' : isUpdate ? 'enhance' : 'create';
        const specialistCallbacks: SpecialistExecutionCallbacks = {
          shouldCancel: () => this.stopRequested,
          onToolStart: (event) => {
            this.emit('step-start', {
              type: event.type,
              title: event.title,
              specialist: event.specialist,
            });
          },
          onToolComplete: (event) => {
            this.emit('step-complete', event);
          },
          onFileChange: (change) => {
            void transactionManager.recordFileChange(
              change.filePath,
              change.oldContent,
              change.newContent,
              change.action !== 'created'
            );
            this.emit('file-modified', {
              path: change.filePath,
              action: change.action,
              oldContent: change.oldContent,
              newContent: change.newContent,
            });
          },
          onCommandOutput: (event) => {
            this.emit('command-output', event);
          },
        };

        let specialistRun: Awaited<ReturnType<typeof executeWithSpecialists>>;
        try {
          const specialistRetryLimit = reflectionPlan.specialistRecoveryRetries;
          let taskMessageForLlm = appendIdeContextToUserTask(taskMessage, this.context.ideContext);
          const terminalBlock = formatTerminalStructuredErrorsForModel(
            this.context.terminalStructuredErrors
          );
          if (terminalBlock.trim()) {
            taskMessageForLlm += `\n\n## TERMINAL_PARSER (structured)\n${terminalBlock}\n`;
          }
          specialistRun = await retryWithRecovery(
            () =>
              executeWithSpecialists(
                taskMessageForLlm,
                roles,
                {
                  workspacePath: this.context.workspacePath,
                  files: this.getProjectFiles(),
                  model: this.context.model,
                  runtimeBudget,
                  reflectionBudget: runtimeBudget,
                  reflectionQuestionLimit: reflectionPlan.reflectionQuestionLimit,
                  planningMode: reflectionPlan.planningMode,
                  reflectionSummary: reflectionPlan.summary,
                  autonomyLevel,
                  deterministicScaffoldOnly:
                    this.context.deterministicScaffoldOnly &&
                    executionPolicy?.allowScaffold !== false,
                  vibeCoderExecutionPolicy: executionPolicy,
                  blackboard,
                },
                trackerMode,
                specialistCallbacks
              ),
            {
              operation: 'specialized_orchestration',
              model: this.context.model,
              maxRetries: specialistRetryLimit,
              userMessage: taskMessageForLlm,
              timestamp: Date.now(),
            },
            specialistRetryLimit
          );
        } catch (error) {
          if (this.stopRequested) {
            await transactionManager.rollbackTransaction();
            return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
          }
          throw error;
        }

        const {
          finalAnalysis,
          executedTools,
          scaffoldApplied,
          scaffoldTemplateId,
          skippedGenerativePass,
        } = specialistRun;
        if (blackboard) {
          blackboard.status = 'verifying';
          this.emit('blackboard-update', blackboard);
        }

        if (finalAnalysis) {
          this.emit('critique-complete', { analysis: finalAnalysis });
        }

        // Step 4: Collect created files from this run
        const newFiles = this.collectCreatedFilesFromExecutedTools(executedTools || []);
        for (const filePath of newFiles) {
          if (!allCreatedFiles.includes(filePath)) {
            allCreatedFiles.push(filePath);
          }
        }

        log.info(`[SpecializedAgent] Created ${newFiles.length} new files: ${newFiles.join(', ')}`);
        if (scaffoldApplied) {
          log.info(
            `[SpecializedAgent] 🧱 Scaffold-first path applied (${scaffoldTemplateId || 'template'})`
          );
        }
        if (skippedGenerativePass) {
          log.info(
            '[SpecializedAgent] 🧪 Skipped long generative pass; proceeding directly to runnable verification'
          );
        }

        // Step 5: VERIFY the project is complete
        lastVerification = await this.verifyProject(allCreatedFiles);
        const verificationSnapshot = lastVerification;
        lastStructuredFindings = this.buildVerificationFindings(verificationSnapshot);
        if (blackboard && lastStructuredFindings.length > 0) {
          blackboard.findings = [...lastStructuredFindings];
          this.emit('blackboard-update', blackboard);
        }

        if (lastVerification.isComplete) {
          log.info(
            '[SpecializedAgent] ✅ Structural verification passed (pre-install/build/runtime checks)'
          );

          if (this.context.deterministicScaffoldOnly && executionPolicy?.allowScaffold !== false) {
            log.info(
              '[SpecializedAgent] 🧪 Deterministic scaffold verification passed; deferring full runtime checks to staged review apply'
            );
            verificationSucceeded = true;
            if (blackboard) {
              blackboard.status = 'completed';
              this.emit('blackboard-update', blackboard);
            }
            shouldContinue = false;
            break;
          }

          const lifecycleResult = await ProjectRunner.autoRun(this.context.workspacePath);
          if (lifecycleResult.validation.issues.length > 0) {
            lastVerification.errors.push(
              ...lifecycleResult.validation.issues.map((issue) => `[Validate] ${issue}`)
            );
          }
          if (lifecycleResult.installResult && !lifecycleResult.installResult.success) {
            lastVerification.errors.push(
              `[Install] ${this.compactProcessOutput(lifecycleResult.installResult.output)}`
            );
          }
          if (lifecycleResult.buildResult && !lifecycleResult.buildResult.success) {
            lastVerification.errors.push(
              `[Build] ${this.compactProcessOutput(lifecycleResult.buildResult.output)}`
            );
          }
          if (lifecycleResult.runResult && !lifecycleResult.runResult.success) {
            lastVerification.errors.push(
              `[Run] ${this.compactProcessOutput(lifecycleResult.runResult.output)}`
            );
          }
          if (!lifecycleResult.success) {
            lastVerification.isComplete = false;
          }

          // Step 6: BROWSER TESTING - Test the project in a real browser
          if (lastVerification.isComplete) {
            try {
              log.info('[SpecializedAgent] 🌐 Running browser tests...');
              const browserTestResult = await testProjectInBrowser(this.context.workspacePath);

              if (browserTestResult.passed) {
                log.info(
                  `[SpecializedAgent] ✅ Browser tests passed (score: ${browserTestResult.score}/100)`
                );
              } else {
                log.info(
                  `[SpecializedAgent] ⚠️ Browser tests found issues (score: ${browserTestResult.score}/100)`
                );
                log.info(formatBrowserTestResults(browserTestResult));

                // Add browser test issues to verification errors
                for (const issue of browserTestResult.issues.filter(
                  (i) => i.severity === 'critical'
                )) {
                  lastVerification.errors.push(`[Browser Test] ${issue.description}`);
                }

                const criticalIssues = browserTestResult.issues.filter(
                  (i) => i.severity === 'critical'
                );

                if (criticalIssues.length > 0 && retryCount < maxRepairPasses) {
                  log.info(
                    `[SpecializedAgent] 🔧 Found ${criticalIssues.length} critical browser/runtime issues - will retry`
                  );
                  lastVerification.isComplete = false;
                  lastVerification.errors.push(
                    ...criticalIssues.map((i) =>
                      `BROWSER FIX NEEDED: ${i.description}. ${i.suggestedFix || ''}`.trim()
                    )
                  );
                }
              }
            } catch (browserTestError: any) {
              log.warn('[SpecializedAgent] Browser testing skipped:', browserTestError.message);
            }
          }

          if (lastVerification.isComplete) {
            await this.finalizeProject(userMessage, allCreatedFiles, isUpdate);
            try {
              const pluginManager = getPluginManager();
              if (pluginManager?.getPlugin('mirror-learning')) {
                await pluginManager.executePluginCommand('mirror-learning', 'recordVerifiedRun', {
                  workspacePath: this.context.workspacePath,
                  task: userMessage,
                });
              }
            } catch (learningErr: unknown) {
              const msg = learningErr instanceof Error ? learningErr.message : String(learningErr);
              log.warn('[SpecializedAgent] Mirror learning plugin failed:', msg);
            }
            verificationSucceeded = true;
            if (blackboard) {
              blackboard.status = 'completed';
              this.emit('blackboard-update', blackboard);
            }
            shouldContinue = false;
            break;
          }
        }

        // Project verification or browser tests failed
        log.info(
          `[SpecializedAgent] ⚠️ Project verification FAILED - Missing: ${lastVerification.missingFiles.join(', ')}`
        );
        if (lastVerification.errors.length > 0) {
          log.info(
            `[SpecializedAgent] ⚠️ Errors: ${lastVerification.errors.slice(0, 3).join('; ')}`
          );
        }
        if (blackboard) {
          blackboard.status = 'repairing';
          this.emit('blackboard-update', blackboard);
        }

        if (retryCount >= maxRepairPasses) {
          log.info('[SpecializedAgent] Max repair passes reached, returning partial result');
          shouldContinue = false;
          break;
        }

        retryCount++;
        log.info(
          `[SpecializedAgent] Escalating to another repair pass (${retryCount}/${maxRepairPasses}) with ${runtimeBudget} reflection budget`
        );
      }

      const fallbackTemplateId =
        !verificationSucceeded && !isUpdate && executionPolicy?.allowScaffold !== false
          ? detectCanonicalTemplateId(userMessage)
          : null;

      if (fallbackTemplateId) {
        await transactionManager.rollbackTransaction();
        if (workspaceNeedsDeterministicScaffold(this.context.workspacePath)) {
          rolledBackIncomplete = true;
          log.info(
            `[SpecializedAgent] ↩️ Falling back to deterministic scaffold review (${fallbackTemplateId}) after verification failed`
          );
          const fallbackTransaction = transactionManager.startTransaction(
            this.context.workspacePath
          );
          return await this.runDeterministicScaffoldReview(
            userMessage,
            fallbackTransaction,
            taskStartedAt,
            requestedRuntimeBudget
          );
        }
      }

      const operationCount = transaction.getOperationCount();
      const stagedReview = applyImmediately
        ? null
        : reviewSessionManager.createSessionFromOperations(
            this.context.workspacePath,
            transaction.getOperations(),
            this.buildInitialReviewVerification(lastVerification),
            blackboard ? this.buildPlanSummary(blackboard, lastReflectionBudget) : undefined,
            buildReviewCheckpointSummary({
              reflectionBudget: lastReflectionBudget,
              attemptCount,
              verificationFailed: Boolean(lastVerification && !lastVerification.isComplete),
            })
          );
      const response = this.buildResponse(allCreatedFiles, lastVerification, {
        rolledBack: rolledBackIncomplete,
        stagedReview: Boolean(stagedReview),
      });

      if (stagedReview) {
        this.pendingReviewSession = stagedReview;
        if (blackboard) {
          blackboard.status = 'awaiting_review';
          blackboard.approvalsRequired = [
            {
              kind: 'apply_changes',
              requestedBy: 'task_master',
              granted: false,
            },
          ];
          this.emit('blackboard-update', blackboard);
        }

        await transactionManager.rollbackTransaction();
        telemetry.track('agent_task_complete', {
          mode: 'specialized',
          success: verificationSucceeded,
          rolledBack: false,
          retryCount,
          fileCount: allCreatedFiles.length,
          durationMs: Date.now() - taskStartedAt,
          stagedReview: true,
          runtimeBudget: lastReflectionBudget,
          autonomyLevel,
          autonomyLabel: autonomyPolicy.label,
        });
        log.info(`[${runId}] Staged ${operationCount} file operation(s) for review`);
        return `${response}\n\n### Review Required\nApply the staged changes from the review panel to write them into the workspace.`;
      }

      if (operationCount > 0) {
        transactionManager.commitTransaction();
        log.info(
          `[SpecializedAgent] ✅ Transaction committed with ${operationCount} file operation(s)`
        );
      } else {
        await transactionManager.rollbackTransaction();
        log.info('[SpecializedAgent] 🔄 Cleared empty transaction');
      }

      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: verificationSucceeded,
        rolledBack: false,
        retryCount,
        fileCount: allCreatedFiles.length,
        durationMs: Date.now() - taskStartedAt,
        stagedReview: false,
        runtimeBudget: lastReflectionBudget,
        autonomyLevel,
        autonomyLabel: autonomyPolicy.label,
      });

      log.info(`[${runId}] Specialized agent run completed`, {
        stagedReview: false,
        success: verificationSucceeded,
        fileCount: allCreatedFiles.length,
      });
      return response;
    } catch (error) {
      // On timeout, try to rollback to last checkpoint instead of full rollback
      if (error instanceof TimeoutError) {
        try {
          const lastCheckpoint = transactionManager.getLastCheckpoint();
          if (lastCheckpoint) {
            log.info(
              `[SpecializedAgent] ⏱️ Timeout detected - rolling back to checkpoint: ${lastCheckpoint}`
            );
            await transactionManager.rollbackToCheckpoint(lastCheckpoint);
            log.info(
              `[SpecializedAgent] 🔄 Rolled back to checkpoint, preserving work up to that point`
            );
          } else {
            // No checkpoint, do full rollback
            await transactionManager.rollbackTransaction();
            log.info(`[SpecializedAgent] 🔄 Transaction rolled back (no checkpoint available)`);
          }
        } catch (rollbackError) {
          log.error(`[${runId}] Transaction rollback failed`, rollbackError);
        }
      } else {
        // For non-timeout errors, do full rollback
        try {
          await transactionManager.rollbackTransaction();
          log.info('[SpecializedAgent] 🔄 Transaction rolled back');
        } catch (rollbackError) {
          log.error(`[${runId}] Transaction rollback failed`, rollbackError);
        }
      }
      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: false,
        rolledBack: true,
        durationMs: Date.now() - taskStartedAt,
        error: error instanceof Error ? error.message : String(error),
        runtimeBudget: requestedRuntimeBudget,
        autonomyLevel,
        autonomyLabel: autonomyPolicy.label,
      });
      log.error(`[${runId}] Specialized agent run failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Re-throw the original error
    }
  }

  /**
   * Finalize project - register in memory and generate documentation
   */
  private async finalizeProject(
    originalPrompt: string,
    createdFiles: string[],
    isUpdate: boolean
  ): Promise<void> {
    const workspacePath = this.context.workspacePath;
    const projectName = path.basename(workspacePath);

    // Detect project type and technologies
    const allFiles = this.getAllFiles(workspacePath);
    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);
    const projectType = mapRuntimeKindToRegistryType(runtimeProfile.kind);
    const technologies = ProjectRegistry.detectTechnologies(allFiles, workspacePath);

    // Generate description from prompt
    const description = this.generateDescription(originalPrompt);

    // Register project in memory
    const project = this.registry.registerProject(workspacePath, {
      name: projectName,
      type: projectType,
      description,
      files: createdFiles,
      technologies,
      prompt: originalPrompt,
      action: isUpdate ? 'update' : 'create',
    });

    log.info(`[SpecializedAgent] 📝 Project registered: ${project.name} (${project.type})`);

    // Update .bat files to include Node.js detection (for existing projects)
    try {
      const { updateProjectBatFiles } = require('../core/update-bat-files');
      const result = updateProjectBatFiles(workspacePath);
      if (result.updated > 0) {
        log.info(
          `[SpecializedAgent] 🔧 Updated ${result.updated} .bat file(s) with Node.js detection`
        );
      }
    } catch (error) {
      // Non-critical, continue
    }

    // Create run.bat for Node.js projects if it doesn't exist
    try {
      const runBatPath = path.join(workspacePath, 'run.bat');
      const packageJsonPath = path.join(workspacePath, 'package.json');

      if (!fs.existsSync(runBatPath) && fs.existsSync(packageJsonPath)) {
        const projectInfo = await ProjectRunner.detectProject(workspacePath);

        if (projectInfo.type === 'node' && projectInfo.startCommand) {
          const batResult = ProjectRunner.createNodeBatchFile(workspacePath, projectInfo);
          if (batResult.success) {
            log.info(`[SpecializedAgent] 🔧 Created run.bat for easy project launching`);
          }
        }
      }
    } catch (error) {
      // Non-critical, continue
    }

    // Generate PROJECT_LOG.md
    try {
      const logPath = ProjectDocumenter.writeProjectLog(workspacePath, {
        projectPath: workspacePath,
        projectName: project.name,
        description: project.description,
        files: allFiles,
        technologies,
        buildHistory: project.buildHistory,
        originalPrompt,
        isUpdate,
      });

      log.info(`[SpecializedAgent] 📄 Generated documentation: ${path.basename(logPath)}`);
    } catch (error) {
      log.warn('[SpecializedAgent] Could not generate project log:', error);
    }
  }

  /**
   * Generate a short description from the user's prompt
   */
  private generateDescription(prompt: string): string {
    // Extract first sentence or first 100 chars
    const firstSentence = prompt.split(/[.!?]/)[0];
    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return prompt.substring(0, 100).trim() + '...';
  }

  /**
   * Verify the project is complete
   * Checks for missing dependencies, empty files, and referenced but non-existent files
   * NOW WITH SMART VALIDATION: Checks if referenced files make sense for the task
   */
  private async verifyProject(createdFiles: string[]): Promise<ProjectVerification> {
    const missingFiles: string[] = [];
    const errors: string[] = [];
    const workspacePath = this.context.workspacePath;
    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);

    // Get all files in workspace
    const existingFiles = this.getAllFiles(workspacePath);

    // Check each HTML file for referenced CSS/JS
    for (const file of existingFiles) {
      if (file.endsWith('.html')) {
        const filePath = path.join(workspacePath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for empty files
          if (content.trim().length === 0) {
            errors.push(`${file} is empty`);
            missingFiles.push(file); // Need to recreate
            continue;
          }

          // Find CSS references
          const cssRefs = content.match(/href=["']([^"']+\.css)["']/g) || [];
          for (const ref of cssRefs) {
            const cssFile = ref.match(/href=["']([^"']+\.css)["']/)?.[1];
            if (cssFile && !cssFile.startsWith('http')) {
              const normalizedPath = this.normalizePath(cssFile);
              if (
                !existingFiles.includes(normalizedPath) &&
                !this.fileExists(workspacePath, cssFile)
              ) {
                // SMART VALIDATION: Check if file name makes sense
                if (this.isValidFileReference(cssFile, workspacePath)) {
                  missingFiles.push(normalizedPath);
                } else {
                  // File reference doesn't make sense - likely a hallucination
                  errors.push(
                    `${file} references invalid CSS file: ${cssFile} (likely hallucinated)`
                  );
                }
              }
            }
          }

          // Find local script/module references, including TS/TSX/JSX entries used by Vite.
          const scriptRefs =
            content.match(/src=["']([^"']+\.(?:js|jsx|ts|tsx|mjs|cjs|tsxx))["']/g) || [];
          for (const ref of scriptRefs) {
            const scriptFile = ref.match(
              /src=["']([^"']+\.(?:js|jsx|ts|tsx|mjs|cjs|tsxx))["']/
            )?.[1];
            if (scriptFile && !scriptFile.startsWith('http')) {
              const normalizedPath = this.normalizePath(scriptFile);
              if (scriptFile.endsWith('.tsxx')) {
                errors.push(
                  `${file} references invalid script entry: ${scriptFile} (.tsxx is not a valid TypeScript React extension)`
                );
                const suggestedPath = normalizedPath.replace(/\.tsxx$/i, '.tsx');
                if (!missingFiles.includes(suggestedPath)) {
                  missingFiles.push(suggestedPath);
                }
                continue;
              }

              if (
                !existingFiles.includes(normalizedPath) &&
                !this.fileExists(workspacePath, scriptFile)
              ) {
                // SMART VALIDATION: Check if file name makes sense for the project
                if (this.isValidFileReference(scriptFile, workspacePath)) {
                  missingFiles.push(normalizedPath);
                } else {
                  // File reference doesn't make sense - likely a hallucination
                  errors.push(
                    `${file} references invalid script file: ${scriptFile} (likely hallucinated - check if it matches the project type)`
                  );
                }
              }
            }
          }
        } catch (err) {
          errors.push(`Could not read ${file}: ${err}`);
        }
      }
    }

    // Check JS/TS module imports so bundler-based projects don't pass with broken local references.
    for (const file of existingFiles) {
      if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file)) {
        continue;
      }

      const filePath = path.join(workspacePath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const importPath of this.extractLocalImports(content)) {
          const resolved = this.resolveLocalImport(file, importPath, workspacePath);
          if (!resolved) {
            const importError = `${file} imports missing file: ${importPath}`;
            errors.push(importError);
            const normalizedImport = this.normalizeImportTarget(file, importPath);
            if (normalizedImport && !missingFiles.includes(normalizedImport)) {
              missingFiles.push(normalizedImport);
            }
          }
        }
      } catch (err) {
        errors.push(`Could not read ${file}: ${err}`);
      }
    }

    // Check for empty files
    for (const file of existingFiles) {
      const filePath = path.join(workspacePath, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size === 0) {
          if (!missingFiles.includes(file)) {
            missingFiles.push(file);
            errors.push(`${file} is empty (0 bytes)`);
          }
        }
      } catch (err) {
        // Skip
      }
    }

    const hasIndexHtml = existingFiles.some(
      (file) => file === 'index.html' || file.endsWith('/index.html')
    );
    const hasFrontendAssets = existingFiles.some(
      (file) =>
        file.endsWith('.css') ||
        file.endsWith('.html') ||
        /^src\/.+\.(js|jsx|ts|tsx)$/.test(file) ||
        /^public\/.+/.test(file)
    );
    const hasServerEntrypoint = existingFiles.some((file) =>
      ['server.js', 'app.js', 'index.js', 'server.ts', 'app.ts', 'index.ts'].includes(file)
    );

    if (
      runtimeProfile.kind === 'static' &&
      hasFrontendAssets &&
      !hasIndexHtml &&
      !hasServerEntrypoint
    ) {
      errors.push('Static website is missing index.html entrypoint');
      missingFiles.push('index.html');
    }

    // Framework structural checks — catch known-fatal omissions before install/build
    this.runFrameworkStructuralChecks(existingFiles, workspacePath, errors, missingFiles);

    // Dedupe missing files
    const uniqueMissing = [...new Set(missingFiles)];

    return {
      isComplete: uniqueMissing.length === 0 && errors.length === 0,
      missingFiles: uniqueMissing,
      errors,
      createdFiles,
    };
  }

  /**
   * Framework-specific structural checks that catch known-fatal omissions
   * before burning a full install/build cycle.
   */
  private runFrameworkStructuralChecks(
    existingFiles: string[],
    workspacePath: string,
    errors: string[],
    missingFiles: string[]
  ): void {
    const hasFile = (name: string) => existingFiles.includes(name);
    const hasAny = (...names: string[]) => names.some(hasFile);
    const hasDir = (prefix: string) => existingFiles.some((f) => f.startsWith(prefix + '/'));

    let packageJson: Record<string, unknown> | null = null;
    try {
      const raw = fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8');
      packageJson = JSON.parse(raw);
    } catch {
      // No package.json or unparseable — skip dep-based checks.
    }

    const deps = {
      ...(packageJson?.dependencies as Record<string, string> | undefined),
      ...(packageJson?.devDependencies as Record<string, string> | undefined),
    };
    const hasDep = (name: string) => name in deps;

    for (const finding of this.findMissingDependencyDeclarations(
      existingFiles,
      workspacePath,
      hasDep
    )) {
      errors.push(finding);
    }

    // ── Next.js App Router (supports both app/ and src/app/) ──────
    const appRouterPrefix = hasDir('src/app') ? 'src/app' : hasDir('app') ? 'app' : null;
    if (appRouterPrefix && hasDep('next')) {
      const layoutCandidates = [
        `${appRouterPrefix}/layout.tsx`,
        `${appRouterPrefix}/layout.jsx`,
        `${appRouterPrefix}/layout.js`,
      ];
      if (!hasAny(...layoutCandidates)) {
        errors.push(
          `Next.js App Router requires ${appRouterPrefix}/layout.tsx (root layout) but none was created`
        );
        missingFiles.push(`${appRouterPrefix}/layout.tsx`);
      }
      const hasAnyPage =
        hasAny(
          `${appRouterPrefix}/page.tsx`,
          `${appRouterPrefix}/page.jsx`,
          `${appRouterPrefix}/page.js`
        ) ||
        existingFiles.some(
          (f) => f.startsWith(appRouterPrefix + '/') && /\/page\.(tsx|jsx|js)$/.test(f)
        );
      if (!hasAnyPage) {
        errors.push(
          `Next.js App Router has no page entrypoint — at minimum ${appRouterPrefix}/page.tsx is expected`
        );
      }
    }

    // ── Next.js Pages Router (supports both pages/ and src/pages/) ─
    const pagesPrefix = hasDir('src/pages') ? 'src/pages' : hasDir('pages') ? 'pages' : null;
    if (pagesPrefix && hasDep('next') && !appRouterPrefix) {
      if (!hasAny(`${pagesPrefix}/_app.tsx`, `${pagesPrefix}/_app.jsx`, `${pagesPrefix}/_app.js`)) {
        errors.push(
          `Next.js Pages Router is missing ${pagesPrefix}/_app.tsx (custom App component)`
        );
        missingFiles.push(`${pagesPrefix}/_app.tsx`);
      }
    }

    // ── Next.js config ─────────────────────────────────────────────
    if (hasDep('next')) {
      const hasNextConfig = existingFiles.some((f) => /^next\.config\.(js|mjs|ts)$/.test(f));
      if (!hasNextConfig) {
        errors.push('Next.js project is missing next.config.js (or .mjs/.ts)');
        missingFiles.push('next.config.js');
      }
    }

    // ── Vite entrypoint ────────────────────────────────────────────
    if (hasDep('vite') && !hasDep('next')) {
      if (!hasFile('index.html')) {
        errors.push('Vite project requires index.html at the project root');
        missingFiles.push('index.html');
      }
    }

    // ── Framework freeze / entrypoint coherence ────────────────────
    const hasMainJs = hasFile('src/main.js');
    const hasMainTsx = hasAny('src/main.tsx', 'src/main.jsx', 'src/main.ts');
    if (hasMainJs && hasMainTsx) {
      errors.push(
        'Mixed frontend entrypoints detected (src/main.js and src/main.tsx/jsx/ts). Keep a single runtime stack per run.'
      );
    }

    if (hasFile('index.html')) {
      try {
        const indexHtmlContent = fs.readFileSync(path.join(workspacePath, 'index.html'), 'utf-8');
        const pointsToMainJs = /src=["'](?:\.\/|\/)?src\/main\.js["']/i.test(indexHtmlContent);
        const pointsToReactEntry = /src=["'](?:\.\/|\/)?src\/main\.(?:tsx|jsx|ts)["']/i.test(
          indexHtmlContent
        );
        const hasRootMount = /id=["']root["']/i.test(indexHtmlContent);
        const hasAppMount = /id=["']app["']/i.test(indexHtmlContent);

        if (hasMainTsx && pointsToMainJs) {
          errors.push(
            'index.html points to src/main.js while React/TypeScript entrypoint files exist. Align to one entrypoint.'
          );
        }
        if (hasMainJs && pointsToReactEntry) {
          errors.push(
            'index.html points to a TS/TSX entrypoint while src/main.js is present. Align to one entrypoint.'
          );
        }
        if (hasMainTsx && hasAppMount && !hasRootMount) {
          errors.push('React entrypoint expects #root mount target, but index.html only defines #app.');
        }
      } catch {
        // Ignore unreadable index.html during structural checks.
      }
    }

    // ── TypeScript config ──────────────────────────────────────────
    const hasTypeScript = existingFiles.some((f) => /\.(ts|tsx)$/.test(f));
    if (hasTypeScript && !existingFiles.some((f) => /^tsconfig.*\.json$/.test(f))) {
      errors.push('TypeScript files exist but tsconfig.json is missing');
      missingFiles.push('tsconfig.json');
    }

    // ── Tailwind config ────────────────────────────────────────────
    if (hasDep('tailwindcss')) {
      const hasTailwindConfig = existingFiles.some((f) =>
        /^tailwind\.config\.(js|ts|mjs|cjs)$/.test(f)
      );
      if (!hasTailwindConfig) {
        errors.push('tailwindcss is a dependency but tailwind.config.js (or .ts) is missing');
        missingFiles.push('tailwind.config.ts');
      }
    }

    // ── PostCSS config (required when using Tailwind with Next.js / Vite) ──
    if (hasDep('tailwindcss') && (hasDep('next') || hasDep('vite'))) {
      const hasPostCSSConfig = existingFiles.some((f) => /^postcss\.config\.(js|mjs|cjs)$/.test(f));
      if (!hasPostCSSConfig) {
        errors.push('Tailwind + bundler project is missing postcss.config.js');
        missingFiles.push('postcss.config.js');
      }
    }

    // ── React entrypoint (non-Next.js) ─────────────────────────────
    if (hasDep('react') && !hasDep('next') && hasDir('src') && !hasDir('src/app')) {
      const hasReactEntry = hasAny(
        'src/main.tsx',
        'src/main.jsx',
        'src/main.ts',
        'src/main.js',
        'src/index.tsx',
        'src/index.jsx',
        'src/index.ts',
        'src/index.js'
      );
      if (!hasReactEntry) {
        errors.push(
          'React project under src/ has no entrypoint (expected src/main.tsx or src/index.tsx)'
        );
      }
    }
  }

  private buildVerificationFindings(
    verification: ProjectVerification | null
  ): VerificationFinding[] {
    if (!verification) {
      return [];
    }

    const findings: VerificationFinding[] = verification.missingFiles.map((missingFile) => ({
      severity: 'error',
      summary: `Missing file: ${missingFile}`,
      files: [missingFile],
      suggestedOwner: inferSpecialistOwnerFromPath(missingFile),
    }));

    for (const error of verification.errors) {
      const stage = inferVerificationStage(error);
      const files = extractFilesFromVerificationIssue(error);
      findings.push({
        severity: 'error',
        summary: error,
        files,
        suggestedOwner: inferSpecialistOwnerForFinding(stage, error, files),
      });
    }

    return findings;
  }

  /**
   * Build the final response with project status
   */
  private buildInitialReviewVerification(
    verification: ProjectVerification | null
  ): AgentReviewVerificationState | undefined {
    if (!verification || verification.isComplete) {
      return undefined;
    }

    const runtimeProfile = getProjectRuntimeProfileSync(this.context.workspacePath);
    const findings: AgentReviewFinding[] = this.buildVerificationFindings(verification).map(
      (finding) => ({
        stage: finding.summary.startsWith('Missing file:')
          ? 'validation'
          : inferVerificationStage(finding.summary),
        severity: finding.severity,
        summary: finding.summary,
        files: finding.files,
        suggestedOwner: finding.suggestedOwner,
      })
    );

    const issues = findings.map((finding) => finding.summary);
    if (issues.length === 0) {
      return undefined;
    }

    return {
      status: 'failed',
      projectTypeLabel: runtimeProfile.displayName,
      readinessSummary: runtimeProfile.readiness.summary,
      startCommand: runtimeProfile.run.command || undefined,
      buildCommand: runtimeProfile.build.command || undefined,
      installCommand: runtimeProfile.install.command || undefined,
      issues,
      findings,
    };
  }

  private async runDeterministicScaffoldReview(
    userMessage: string,
    transaction: any,
    taskStartedAt: number,
    requestedRuntimeBudget: AgentContext['runtimeBudget']
  ): Promise<string> {
    if (
      this.context.vibeCoderExecutionPolicy &&
      !this.context.vibeCoderExecutionPolicy.allowScaffold
    ) {
      log.info(
        `[SpecializedAgent] 🧭 Skipping deterministic scaffold review because VibeCoder ${this.context.vibeCoderExecutionPolicy.intent} blocks scaffold/create actions`
      );
      await transactionManager.rollbackTransaction();
      return `VibeCoder ${this.context.vibeCoderExecutionPolicy.intent} policy blocked deterministic scaffold fallback.`;
    }

    const telemetry = getTelemetryService();
    const reflectionPlan = resolveReflectionBudget({
      requestedBudget: requestedRuntimeBudget || 'standard',
      userMessage,
      isUpdate: false,
      retryCount: 0,
    });
    const applyImmediately = shouldApplyAgentChangesImmediately(
      this.context.monolithicApplyImmediately
    );
    this.emit('step-start', {
      type: 'deterministic_scaffold',
      title: 'deterministic_scaffold',
      specialist: 'template_scaffold_specialist',
    });

    const scaffolded = await scaffoldProjectFromTemplate(this.context.workspacePath, userMessage, {
      runPostCreate: false,
      callbacks: {
        onFileChange: (change) => {
          void transactionManager.recordFileChange(
            change.filePath,
            change.oldContent,
            change.newContent,
            change.action !== 'created'
          );
          this.emit('file-modified', {
            path: change.filePath,
            action: change.action,
            oldContent: change.oldContent,
            newContent: change.newContent,
          });
        },
      },
    });

    this.emit('step-complete', {
      type: 'deterministic_scaffold',
      title: 'deterministic_scaffold',
      specialist: 'template_scaffold_specialist',
      success: scaffolded.success,
      error: scaffolded.error,
    });

    if (!scaffolded.success) {
      await transactionManager.rollbackTransaction();
      throw new Error(scaffolded.error || 'Deterministic scaffold generation failed');
    }

    const verification = await this.verifyProject(scaffolded.createdFiles);
    const stagedReview = applyImmediately
      ? null
      : reviewSessionManager.createSessionFromOperations(
          this.context.workspacePath,
          transaction.getOperations(),
          this.buildInitialReviewVerification(verification),
          this.buildFallbackPlanSummary(
            userMessage,
            scaffolded.createdFiles,
            'create',
            reflectionPlan.budget
          ),
          buildReviewCheckpointSummary({
            reflectionBudget: reflectionPlan.budget,
            attemptCount: 1,
            verificationFailed: !verification.isComplete,
          })
        );

    const response = this.buildResponse(scaffolded.createdFiles, verification, {
      stagedReview: Boolean(stagedReview),
    });

    if (stagedReview) {
      await transactionManager.rollbackTransaction();
      this.pendingReviewSession = stagedReview;
      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: verification.isComplete,
        rolledBack: false,
        retryCount: 0,
        fileCount: scaffolded.createdFiles.length,
        durationMs: Date.now() - taskStartedAt,
        stagedReview: true,
        runtimeBudget: reflectionPlan.budget,
      });
      return `${response}\n\n### Review Required\nApply the staged changes from the review panel to write them into the workspace.`;
    }

    if (transaction.getOperationCount() > 0) {
      transactionManager.commitTransaction();
    } else {
      await transactionManager.rollbackTransaction();
    }

    telemetry.track('agent_task_complete', {
      mode: 'specialized',
      success: verification.isComplete,
      rolledBack: false,
      retryCount: 0,
      fileCount: scaffolded.createdFiles.length,
      durationMs: Date.now() - taskStartedAt,
      stagedReview: false,
      runtimeBudget: reflectionPlan.budget,
    });
    return response;
  }

  private buildResponse(
    createdFiles: string[],
    verification: ProjectVerification | null,
    options: { rolledBack?: boolean; stagedReview?: boolean } = {}
  ): string {
    const runtimeProfile = getProjectRuntimeProfileSync(this.context.workspacePath);
    const runCommand = runtimeProfile.run.command;
    const installCommand = runtimeProfile.install.command;
    const installSatisfied =
      runtimeProfile.install.manager === 'npm'
        ? fs.existsSync(path.join(this.context.workspacePath, 'node_modules'))
        : runtimeProfile.install.manager === 'pip'
          ? !runtimeProfile.install.required
          : true;
    const isReady = Boolean(verification?.isComplete);

    let response = isReady ? `## ✅ Project Created!\n\n` : `## ⚠️ Project Needs Fixes\n\n`;
    response += `**Location:** \`${this.context.workspacePath}\`\n\n`;

    if (createdFiles.length > 0) {
      response += `### Files Created\n`;
      createdFiles.forEach((file) => {
        // Check if file exists and has content
        const fullPath = path.join(this.context.workspacePath, file);
        let status = '✅';
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) status = '⚠️ (empty)';
        } catch {
          status = '❌ (missing)';
        }
        response += `- ${status} \`${file}\`\n`;
      });
      response += `\n`;
    }

    // Show verification results
    if (verification) {
      if (verification.isComplete) {
        response += `### ✅ Verification Passed\n`;
        response += `${runtimeProfile.readiness.summary}\n\n`;
      } else {
        if (options.rolledBack) {
          response += `### ↩️ Changes Reverted\n`;
          response += `AgentPrime rolled back the generated changes because no usable files could be kept.\n\n`;
        } else if (options.stagedReview) {
          response += `### 📝 Staged For Review\n`;
          response += `Files are ready for review and have not been written into the workspace yet.\n\n`;
        } else {
          response += `### ⚠️ Project Created With Issues\n`;
          response += `Files have been kept so you can inspect and fix the remaining issues.\n\n`;
        }
        if (verification.missingFiles.length > 0) {
          response += `### ⚠️ Missing Files\n`;
          verification.missingFiles.forEach((file) => {
            response += `- \`${file}\`\n`;
          });
          response += `\n`;
        }
        if (verification.errors.length > 0) {
          response += `### ⚠️ Issues Found\n`;
          verification.errors.forEach((err) => {
            response += `- ${err}\n`;
          });
          response += `\n`;
        }
      }
    }

    // Add action buttons
    response += `### Actions\n`;
    response += `**📂 Open Folder:** [Click to open](file://${this.context.workspacePath})\n\n`;

    if (runCommand) {
      response += `**▶ Run Project:** \`${runCommand}\`\n\n`;
      if (runtimeProfile.kind === 'vite') {
        response += `**🌐 Open in Browser:** Start the dev server, then open the local URL it prints\n\n`;
      }
    } else if (runtimeProfile.kind === 'static' && runtimeProfile.hasIndexHtml) {
      response += `**🚀 Launch in Browser:** Open \`index.html\` in your browser\n\n`;
    }

    if (runtimeProfile.install.required && installCommand && !installSatisfied) {
      response += `**📦 Install Dependencies:** Run \`${installCommand}\` in the project folder\n\n`;
    } else if (
      !runtimeProfile.install.required &&
      (runtimeProfile.kind === 'static' ||
        runtimeProfile.kind === 'node' ||
        runtimeProfile.kind === 'vite')
    ) {
      response += `**✅ No Dependency Install Needed:** This starter does not declare packages that require an install step.\n\n`;
    }

    // Mention the PROJECT_LOG.md
    const logExists = fs.existsSync(path.join(this.context.workspacePath, 'PROJECT_LOG.md'));
    if (logExists) {
      response += `### 📝 Documentation\n`;
      response += `A \`PROJECT_LOG.md\` file has been generated with:\n`;
      response += `- Build history and changes\n`;
      response += `- How to run the project\n`;
      response += `- Suggested improvements\n\n`;
    }

    response += isReady
      ? `---\n🎉 Your project is ready!`
      : `---\n⚠️ AgentPrime found issues that still need fixing before this project is ready.`;

    return response;
  }

  /**
   * Get all source files in workspace (fast glob, ignores node_modules / .git / build dirs)
   */
  private getAllFiles(dir: string, _baseDir: string = dir): string[] {
    return listWorkspaceSourceFilesSync(dir, 8000);
  }

  /**
   * Check if a file exists (handles relative paths)
   */
  private fileExists(workspacePath: string, filePath: string): boolean {
    const fullPath = path.join(workspacePath, filePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Normalize a path (remove leading ./ etc)
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/');
  }

  private collectCreatedFilesFromExecutedTools(executedTools: any[]): string[] {
    const createdFiles = new Set<string>();

    for (const tool of executedTools) {
      const toolCall = tool?.toolCall;
      const name = toolCall?.name || toolCall?.function?.name;
      const args =
        toolCall?.arguments ||
        toolCall?.function?.arguments ||
        toolCall?.input ||
        toolCall?.function?.input ||
        {};

      if (name === 'write_file' && typeof args.path === 'string') {
        createdFiles.add(this.normalizePath(args.path));
      }

      if (name === 'scaffold_project' && Array.isArray(tool?.result?.files)) {
        for (const file of tool.result.files) {
          if (typeof file === 'string') {
            createdFiles.add(this.normalizePath(file));
          }
        }
      }
    }

    return [...createdFiles];
  }

  private readRootPackageJson(): any | null {
    const packageJsonPath = path.join(this.context.workspacePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private hasDeclaredNodeDependencies(packageJson: any | null): boolean {
    const deps = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {}),
    };

    return Object.keys(deps).length > 0;
  }

  private isBundlerProject(packageJson: any | null): boolean {
    if (
      fs.existsSync(path.join(this.context.workspacePath, 'vite.config.ts')) ||
      fs.existsSync(path.join(this.context.workspacePath, 'vite.config.js'))
    ) {
      return true;
    }

    const deps = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {}),
    };

    return Boolean(
      deps.vite || deps.webpack || deps.parcel || deps.next || deps['@vitejs/plugin-react']
    );
  }

  private getRecommendedRunCommand(packageJson: any | null): string | null {
    const scripts = packageJson?.scripts || {};
    if (typeof scripts.dev === 'string' && scripts.dev.trim()) {
      return 'npm run dev';
    }
    if (typeof scripts.start === 'string' && scripts.start.trim()) {
      return 'npm start';
    }
    return null;
  }

  private extractLocalImports(content: string): string[] {
    const matches = [
      ...content.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g),
      ...content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...content.matchAll(/export\s+[^'"]*from\s+['"]([^'"]+)['"]/g),
    ];

    return matches
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value))
      .filter((value) => value.startsWith('.') || value.startsWith('/'));
  }

  private findMissingDependencyDeclarations(
    existingFiles: string[],
    workspacePath: string,
    hasDep: (name: string) => boolean
  ): string[] {
    const missing = new Map<string, Set<string>>();

    for (const file of existingFiles) {
      if (!this.isApplicationSourceFile(file)) {
        continue;
      }

      const filePath = path.join(workspacePath, file);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      for (const specifier of this.extractBareImports(content)) {
        const packageName = this.normalizePackageImport(specifier);
        if (!packageName || hasDep(packageName)) {
          continue;
        }
        if (!missing.has(packageName)) {
          missing.set(packageName, new Set<string>());
        }
        missing.get(packageName)?.add(file);
      }
    }

    return [...missing.entries()].map(([packageName, files]) => {
      const sources = [...files].slice(0, 2);
      const sourceSummary =
        sources.length === 1 ? sources[0] : `${sources.join(', ')}${files.size > 2 ? ', ...' : ''}`;
      return `package.json is missing dependency "${packageName}" imported by ${sourceSummary}`;
    });
  }

  private isApplicationSourceFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    if (!/\.(ts|tsx|js|jsx)$/.test(normalized)) {
      return false;
    }
    return (
      normalized.startsWith('src/') ||
      normalized.startsWith('app/') ||
      normalized.startsWith('pages/') ||
      normalized.startsWith('components/') ||
      normalized.startsWith('lib/')
    );
  }

  private extractBareImports(content: string): string[] {
    const matches = [
      ...content.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g),
      ...content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...content.matchAll(/export\s+[^'"]*from\s+['"]([^'"]+)['"]/g),
      ...content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
    ];

    return matches
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value))
      .filter((value) => !value.startsWith('.') && !value.startsWith('/'))
      .filter((value) => !value.startsWith('node:'))
      .filter((value) => !value.startsWith('virtual:'))
      .filter((value) => !value.startsWith('#'));
  }

  private normalizePackageImport(specifier: string): string | null {
    const cleanSpecifier = specifier.split('?')[0].split('#')[0];
    if (!cleanSpecifier) {
      return null;
    }

    if (cleanSpecifier.startsWith('@')) {
      const [scope, name] = cleanSpecifier.split('/');
      return scope && name ? `${scope}/${name}` : cleanSpecifier;
    }

    const [name] = cleanSpecifier.split('/');
    return name || null;
  }

  private normalizeImportTarget(sourceFile: string, importPath: string): string | null {
    const sanitizedImport = importPath.split('?')[0].split('#')[0];
    const sourceDir = path.posix.dirname(sourceFile.replace(/\\/g, '/'));
    const normalized = sanitizedImport.startsWith('/')
      ? sanitizedImport.replace(/^\//, '')
      : path.posix.normalize(path.posix.join(sourceDir, sanitizedImport));

    return normalized.replace(/\\/g, '/');
  }

  private resolveLocalImport(
    sourceFile: string,
    importPath: string,
    workspacePath: string
  ): string | null {
    const normalizedImport = this.normalizeImportTarget(sourceFile, importPath);
    if (!normalizedImport) {
      return null;
    }

    const hasExtension = /\.[a-z0-9]+$/i.test(normalizedImport);
    const baseCandidates = hasExtension
      ? [normalizedImport]
      : [
          normalizedImport,
          `${normalizedImport}.js`,
          `${normalizedImport}.jsx`,
          `${normalizedImport}.ts`,
          `${normalizedImport}.tsx`,
          `${normalizedImport}.mjs`,
          `${normalizedImport}.cjs`,
          `${normalizedImport}.css`,
          `${normalizedImport}.scss`,
          `${normalizedImport}.sass`,
          `${normalizedImport}.less`,
          `${normalizedImport}.json`,
          path.posix.join(normalizedImport, 'index.js'),
          path.posix.join(normalizedImport, 'index.jsx'),
          path.posix.join(normalizedImport, 'index.ts'),
          path.posix.join(normalizedImport, 'index.tsx'),
        ];

    for (const candidate of baseCandidates) {
      const fullPath = path.join(workspacePath, candidate);
      if (fs.existsSync(fullPath)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Check if a file reference makes sense for this project
   * Prevents hallucinated file names (e.g., tetris.js in a Minecraft project)
   */
  private isValidFileReference(fileName: string, workspacePath: string): boolean {
    const fileNameLower = fileName.toLowerCase();
    const allFiles = this.getAllFiles(workspacePath);

    // Check existing files to understand project type
    const projectContext = this.inferProjectContext(allFiles);

    // Common mismatches
    // If project is Minecraft/voxel/block related, reject Tetris files
    if (
      projectContext.includes('minecraft') ||
      projectContext.includes('voxel') ||
      projectContext.includes('block')
    ) {
      if (fileNameLower.includes('tetris') || fileNameLower.includes('snake')) {
        log.warn(
          `[Verification] Rejecting invalid file reference: ${fileName} (doesn't match Minecraft/voxel project)`
        );
        return false;
      }
    }

    // If project is Tetris related, reject Minecraft files
    if (projectContext.includes('tetris')) {
      if (
        fileNameLower.includes('minecraft') ||
        fileNameLower.includes('voxel') ||
        fileNameLower.includes('chunk')
      ) {
        log.warn(
          `[Verification] Rejecting invalid file reference: ${fileName} (doesn't match Tetris project)`
        );
        return false;
      }
    }

    // Generic file names are always valid (game.js, app.js, main.js, etc.)
    const genericNames = [
      'game',
      'app',
      'main',
      'index',
      'script',
      'style',
      'styles',
      'utils',
      'config',
    ];
    if (genericNames.some((name) => fileNameLower.includes(name))) {
      return true;
    }

    // If we can't determine, allow it (better to be permissive than reject valid files)
    return true;
  }

  /**
   * Infer project context from existing files
   */
  private inferProjectContext(files: string[]): string {
    const context: string[] = [];
    const allFileNames = files.map((f) => f.toLowerCase()).join(' ');

    if (
      allFileNames.includes('minecraft') ||
      allFileNames.includes('voxel') ||
      allFileNames.includes('chunk') ||
      allFileNames.includes('block')
    ) {
      context.push('minecraft');
      context.push('voxel');
      context.push('block');
    }

    if (allFileNames.includes('tetris')) {
      context.push('tetris');
    }

    return context.join(' ');
  }

  /**
   * Get project files for context (shallow, current directory only)
   */
  private getProjectFiles(): string[] {
    try {
      const files = fs.readdirSync(this.context.workspacePath);
      return files.filter((f) => {
        const filePath = path.join(this.context.workspacePath, f);
        try {
          const stat = fs.statSync(filePath);
          return stat.isFile() && !f.startsWith('.');
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Detect primary language
   */
  private detectLanguage(): string | undefined {
    const files = this.getProjectFiles();
    if (
      files.some(
        (f) => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx')
      )
    ) {
      return 'javascript';
    }
    if (files.some((f) => f.endsWith('.py'))) {
      return 'python';
    }
    return undefined;
  }

  /**
   * Detect project type
   */
  private detectProjectType(): string | undefined {
    const profile = getProjectRuntimeProfileSync(this.context.workspacePath);
    if (profile.kind === 'python') {
      return 'python';
    }
    if (profile.kind === 'node' || profile.kind === 'vite' || profile.kind === 'tauri') {
      return 'node';
    }
    if (profile.kind === 'static') {
      return 'web';
    }
    return undefined;
  }

  private compactProcessOutput(output: string, maxChars: number = 1200): string {
    const normalized = (output || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'Command failed with no output.';
    }

    if (normalized.length <= maxChars) {
      return normalized;
    }

    const half = Math.max(200, Math.floor(maxChars / 2));
    const head = normalized.slice(0, half);
    const tail = normalized.slice(-half);
    return `${head} ... ${tail}`;
  }

  /**
   * Install dependencies automatically if package.json or requirements.txt exists
   */
  private async installDependenciesIfNeeded(): Promise<{ success: boolean; output: string }> {
    const projectInfo = await ProjectRunner.detectProject(this.context.workspacePath);
    if (!projectInfo.requiresInstall) {
      return { success: true, output: 'No dependencies to install' };
    }

    return ProjectRunner.installDependencies(this.context.workspacePath, projectInfo);
  }

  private async buildProjectIfNeeded(): Promise<{ success: boolean; output: string }> {
    const projectInfo = await ProjectRunner.detectProject(this.context.workspacePath);
    return ProjectRunner.runBuild(this.context.workspacePath, projectInfo);
  }
}
