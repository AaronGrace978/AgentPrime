export type RuntimeBudgetMode = 'instant' | 'standard' | 'deep';

export const DEFAULT_RUNTIME_BUDGET_MODE: RuntimeBudgetMode = 'standard';

export function runtimeBudgetToDualMode(budget: RuntimeBudgetMode): 'fast' | 'auto' | 'deep' {
  switch (budget) {
    case 'instant':
      return 'fast';
    case 'deep':
      return 'deep';
    case 'standard':
    default:
      return 'auto';
  }
}

export function dualModeToRuntimeBudget(mode?: 'fast' | 'auto' | 'deep' | string | null): RuntimeBudgetMode {
  switch (mode) {
    case 'fast':
      return 'instant';
    case 'deep':
      return 'deep';
    case 'auto':
    default:
      return DEFAULT_RUNTIME_BUDGET_MODE;
  }
}
