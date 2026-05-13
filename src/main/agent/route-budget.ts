import type { AgentToolBudgets } from '../../types/agent-routing';

export interface RouteBudgetUsage {
  toolCalls: number;
  commandCalls: number;
  deleteCalls: number;
  writeTargets: Set<string>;
}

export function createRouteBudgetUsage(): RouteBudgetUsage {
  return {
    toolCalls: 0,
    commandCalls: 0,
    deleteCalls: 0,
    writeTargets: new Set<string>(),
  };
}

function writeTargetForTool(toolName: string, args: Record<string, any>): string | null {
  if (toolName === 'write_file' || toolName === 'patch_file' || toolName === 'str_replace') {
    return typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '<unknown-file>';
  }

  if (toolName === 'scaffold_project') {
    const projectName = typeof args.project_name === 'string' && args.project_name.trim()
      ? args.project_name.trim()
      : '<workspace-scaffold>';
    return `${projectName}/*`;
  }

  return null;
}

export function getRouteBudgetBlockReason(
  toolName: string,
  args: Record<string, any> = {},
  budgets?: AgentToolBudgets,
  usage: RouteBudgetUsage = createRouteBudgetUsage()
): string | null {
  if (!budgets) {
    return null;
  }

  if (usage.toolCalls + 1 > budgets.maxToolCalls) {
    return `route budget maxToolCalls exceeded (${budgets.maxToolCalls})`;
  }

  if (toolName === 'run_command' && usage.commandCalls + 1 > budgets.maxCommandCalls) {
    return `route budget maxCommandCalls exceeded (${budgets.maxCommandCalls})`;
  }

  if (toolName === 'delete_path' && usage.deleteCalls + 1 > budgets.maxDeleteCalls) {
    return `route budget maxDeleteCalls exceeded (${budgets.maxDeleteCalls})`;
  }

  const writeTarget = writeTargetForTool(toolName, args);
  if (writeTarget && !usage.writeTargets.has(writeTarget) && usage.writeTargets.size + 1 > budgets.maxWriteFiles) {
    return `route budget maxWriteFiles exceeded (${budgets.maxWriteFiles})`;
  }

  return null;
}

export function recordRouteBudgetUsage(
  toolName: string,
  args: Record<string, any> = {},
  usage: RouteBudgetUsage
): void {
  usage.toolCalls += 1;

  if (toolName === 'run_command') {
    usage.commandCalls += 1;
  }

  if (toolName === 'delete_path') {
    usage.deleteCalls += 1;
  }

  const writeTarget = writeTargetForTool(toolName, args);
  if (writeTarget) {
    usage.writeTargets.add(writeTarget);
  }
}
