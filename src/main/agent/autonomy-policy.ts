export type AgentAutonomyLevel = 1 | 2 | 3 | 4 | 5;

export interface AgentAutonomyPolicy {
  level: AgentAutonomyLevel;
  label: string;
  description: string;
  maxToolCalls: number;
  maxCommandCalls: number;
  maxWriteFiles: number;
  allowRunCommands: boolean;
}

const DEFAULT_AUTONOMY_LEVEL: AgentAutonomyLevel = 3;

const AUTONOMY_POLICIES: Record<AgentAutonomyLevel, AgentAutonomyPolicy> = {
  1: {
    level: 1,
    label: 'Guided',
    description: 'Small, review-first edits with no shell commands.',
    maxToolCalls: 24,
    maxCommandCalls: 0,
    maxWriteFiles: 12,
    allowRunCommands: false,
  },
  2: {
    level: 2,
    label: 'Cautious',
    description: 'Constrained edits with a small command budget.',
    maxToolCalls: 40,
    maxCommandCalls: 1,
    maxWriteFiles: 20,
    allowRunCommands: true,
  },
  3: {
    level: 3,
    label: 'Balanced',
    description: 'Default mode for normal multi-file feature work.',
    maxToolCalls: 72,
    maxCommandCalls: 4,
    maxWriteFiles: 36,
    allowRunCommands: true,
  },
  4: {
    level: 4,
    label: 'Extended',
    description: 'Broader project work with higher tool and command budgets.',
    maxToolCalls: 140,
    maxCommandCalls: 10,
    maxWriteFiles: 72,
    allowRunCommands: true,
  },
  5: {
    level: 5,
    label: 'Hands-off',
    description: 'Maximum autonomy for large end-to-end implementation loops.',
    maxToolCalls: 240,
    maxCommandCalls: 20,
    maxWriteFiles: 140,
    allowRunCommands: true,
  },
};

export function clampAgentAutonomyLevel(
  value: unknown,
  fallback: AgentAutonomyLevel = DEFAULT_AUTONOMY_LEVEL
): AgentAutonomyLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as AgentAutonomyLevel;
}

export function resolveAgentAutonomyPolicy(
  level: unknown,
  fallback: AgentAutonomyLevel = DEFAULT_AUTONOMY_LEVEL
): AgentAutonomyPolicy {
  const safeLevel = clampAgentAutonomyLevel(level, fallback);
  return AUTONOMY_POLICIES[safeLevel];
}

