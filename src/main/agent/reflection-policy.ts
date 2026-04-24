import type { AgentReviewCheckpointSummary } from '../../types/agent-review';
import type { RuntimeBudgetMode } from '../../types/runtime-budget';

export interface ReflectionBudgetOptions {
  requestedBudget?: RuntimeBudgetMode;
  userMessage: string;
  isUpdate: boolean;
  retryCount: number;
  hasRepairScope?: boolean;
  verificationFailed?: boolean;
}

export interface ReflectionBudgetPlan {
  budget: RuntimeBudgetMode;
  risky: boolean;
  planningMode: 'skip' | 'compact' | 'full';
  reflectionQuestionLimit: number;
  specialistRecoveryRetries: number;
  maxRepairPasses: number;
  summary: string;
}

const RISKY_TASK_PATTERN =
  /(scaffold|template|full app|full application|tauri|desktop|browser test|e2e|end-to-end|security|performance|migrate|schema|contract|database|auth|payment|deploy|release)/i;

const SIMPLE_STATIC_SITE_PATTERN =
  /\b(static\s+)?(site|website|webpage|web\s+page|landing\s+page|portfolio\s+site|homepage)\b/i;

const COMPLEX_APP_PATTERN =
  /\b(react|vue|svelte|next|vite|fullstack|full-stack|backend|api|database|auth|login|dashboard|three\.js|threejs|game|webgl|tauri|electron)\b/i;

export function looksRiskyTask(userMessage: string, isUpdate: boolean): boolean {
  const normalizedTask = userMessage.toLowerCase();
  return (
    (!isUpdate && RISKY_TASK_PATTERN.test(normalizedTask)) ||
    normalizedTask.length > 800
  );
}

export function looksSimpleStaticWebsiteTask(userMessage: string): boolean {
  return SIMPLE_STATIC_SITE_PATTERN.test(userMessage) && !COMPLEX_APP_PATTERN.test(userMessage);
}

export function shouldApplyAgentChangesImmediately(explicitApplySetting?: boolean): boolean {
  return explicitApplySetting === true;
}

export function resolveReflectionBudget(options: ReflectionBudgetOptions): ReflectionBudgetPlan {
  const requestedBudget = options.requestedBudget || 'standard';
  const risky = looksRiskyTask(options.userMessage, options.isUpdate);
  const simpleStaticWebsite = looksSimpleStaticWebsiteTask(options.userMessage);
  const escalated =
    options.retryCount > 0 ||
    options.hasRepairScope === true ||
    options.verificationFailed === true;

  let budget: RuntimeBudgetMode = requestedBudget;
  if (simpleStaticWebsite) {
    budget = escalated ? 'standard' : 'instant';
  } else if (escalated) {
    budget = 'deep';
  } else if (requestedBudget === 'instant') {
    budget = risky ? 'standard' : 'instant';
  } else if (requestedBudget === 'standard') {
    budget = risky ? 'deep' : 'standard';
  } else {
    budget = 'deep';
  }

  if (budget === 'instant') {
    return {
      budget,
      risky,
      planningMode: 'skip',
      reflectionQuestionLimit: 1,
      specialistRecoveryRetries: 0,
      maxRepairPasses: risky ? 1 : 0,
      summary: 'Instant budget keeps specialists on the smallest viable patch set and skips extra reflection unless work turns risky.',
    };
  }

  if (budget === 'deep') {
    return {
      budget,
      risky,
      planningMode: 'full',
      reflectionQuestionLimit: 3,
      specialistRecoveryRetries: 1,
      maxRepairPasses: 3,
      summary: 'Deep budget enables fuller planning, broader domain reflection, and additional repair passes for risky or failing work.',
    };
  }

  return {
    budget: 'standard',
    risky,
    planningMode: 'compact',
    reflectionQuestionLimit: 2,
    specialistRecoveryRetries: 1,
    maxRepairPasses: 2,
    summary: 'Standard budget balances latency and verification with bounded planning and repair passes.',
  };
}

export function buildReviewCheckpointSummary(options: {
  reflectionBudget: RuntimeBudgetMode;
  attemptCount: number;
  verificationFailed: boolean;
}): AgentReviewCheckpointSummary {
  const { reflectionBudget, attemptCount, verificationFailed } = options;
  return {
    strategy: 'staged_patch_set',
    requiresExplicitApply: true,
    reflectionBudget,
    attemptCount,
    summary:
      `Generated patch set held behind a review/apply checkpoint ` +
      `(${reflectionBudget} reflection budget, ${attemptCount} attempt${attemptCount === 1 ? '' : 's'}).`,
    items: [
      {
        id: 'plan',
        label: 'Plan',
        stage: 'plan',
        state: 'complete',
        summary: 'AgentPrime mapped the task and bounded the patch set before staging writes.',
      },
      {
        id: 'review',
        label: 'Review',
        stage: 'review',
        state: 'current',
        summary: 'Inspect and accept only the files that should be written to the workspace.',
      },
      {
        id: 'apply',
        label: 'Apply',
        stage: 'apply',
        state: 'upcoming',
        summary: 'Accepted files stay staged until you explicitly apply them.',
      },
      {
        id: verificationFailed ? 'repair' : 'verify',
        label: verificationFailed ? 'Repair' : 'Verify',
        stage: verificationFailed ? 'repair' : 'verify',
        state: 'upcoming',
        summary: verificationFailed
          ? 'If verification still fails after apply, run a targeted repair pass against the accepted files.'
          : 'After apply, verify the accepted files before launch.',
      },
    ],
  };
}
