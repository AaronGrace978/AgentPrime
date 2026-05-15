/**
 * Zod schema for `chat` IPC context — strips unknown keys and caps sizes
 * so malformed or oversized renderer payloads cannot break the main handler.
 */

import { z } from 'zod';

const dualModeSchema = z.enum(['auto', 'fast', 'deep']);
const runtimeBudgetSchema = z.enum(['instant', 'standard', 'deep']);
const repairScopeSchema = z.object({
  allowedFiles: z.array(z.string().max(4096)).max(500),
  blockedFiles: z.array(z.string().max(4096)).max(500),
  retryReason: z.string().max(8000).optional(),
  findings: z.array(z.object({
    stage: z.enum(['validation', 'install', 'build', 'run', 'browser', 'unknown']),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    summary: z.string().max(8000),
    files: z.array(z.string().max(4096)).max(200),
    suggestedOwner: z.string().max(128).optional(),
    command: z.string().max(4096).optional(),
    output: z.string().max(16000).optional(),
  })).max(200)
});

const ideDiagnosticSchema = z.object({
  filePath: z.string().max(16384).optional(),
  line: z.number().int().min(1).max(1_000_000),
  column: z.number().int().min(1).max(1_000_000),
  message: z.string().max(4000),
  severity: z.enum(['error', 'warning']),
  source: z.string().max(128).optional(),
  ruleId: z.string().max(512).optional(),
  origin: z.string().max(128).optional(),
});

const agentRunContextSchema = z
  .object({
    workspace_path_relay: z.string().max(16384).optional(),
    open_tabs: z
      .array(
        z.object({
          path: z.string().max(16384),
          language: z.string().max(64).optional(),
          is_dirty: z.boolean().optional(),
        })
      )
      .max(500)
      .optional(),
    active_file: z
      .object({
        path: z.string().max(16384),
        content: z.string().max(600000).optional(),
        cursor_line: z.number().int().optional(),
        cursor_column: z.number().int().optional(),
        selected_text: z.string().max(100000).optional(),
      })
      .optional(),
    folder_tree: z.any().optional(),
    diagnostics: z.array(ideDiagnosticSchema).max(300).optional(),
    git_status: z.string().max(16000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.folder_tree === undefined) return;
    try {
      const serialized = JSON.stringify(val.folder_tree);
      if (serialized.length > 400_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'folder_tree exceeds maximum serialized size',
          path: ['folder_tree'],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'folder_tree must be JSON-serializable',
        path: ['folder_tree'],
      });
    }
  });

export const chatIpcContextSchema = z
  .object({
    use_agent_loop: z.boolean().optional(),
    agent_mode: z.boolean().optional(),
    use_specialized_agents: z.boolean().optional(),
    specialized_mode: z.boolean().optional(),
    provider: z.string().max(128).optional(),
    model: z.string().max(512).optional(),
    file_path: z.string().max(16384).optional(),
    open_files: z.array(z.string().max(16384)).max(4000).optional(),
    terminal_history: z.array(z.string().max(64000)).max(80).optional(),
    words_to_code_mode: z.boolean().optional(),
    wordsToCode: z.boolean().optional(),
    dino_buddy_mode: z.boolean().optional(),
    just_chat_mode: z.boolean().optional(),
    justChatMode: z.boolean().optional(),
    dual_mode: dualModeSchema.optional(),
    runtime_budget: runtimeBudgetSchema.optional(),
    agent_autonomy: z.number().int().min(1).max(5).optional(),
    deterministic_scaffold_only: z.boolean().optional(),
    repair_scope: repairScopeSchema.optional(),
    file_content: z.string().max(600000).optional(),
    has_errors: z.boolean().optional(),
    mentioned_files: z.array(z.string().max(4096)).max(1000).optional(),
    focused_folder: z.string().max(16384).optional(),
    /** Unified IDE snapshot from renderer (tabs, active buffer, tree). */
    agent_run_context: agentRunContextSchema.optional(),
  });

export type ChatIpcContext = z.infer<typeof chatIpcContextSchema>;

export function parseChatIpcContext(raw: unknown): ChatIpcContext {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result = chatIpcContextSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  const repaired = { ...(raw as Record<string, unknown>) };
  if (repaired.agent_run_context && typeof repaired.agent_run_context === 'object' && !Array.isArray(repaired.agent_run_context)) {
    const agentRunContext = { ...(repaired.agent_run_context as Record<string, unknown>) };
    delete agentRunContext.folder_tree;
    repaired.agent_run_context = agentRunContext;
    const repairedResult = chatIpcContextSchema.safeParse(repaired);
    if (repairedResult.success) {
      console.warn('[Chat] IPC context validation dropped invalid folder_tree and preserved the rest of the context.');
      return repairedResult.data;
    }
  }

  const partialContext: ChatIpcContext = {};
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.use_agent_loop === 'boolean') partialContext.use_agent_loop = candidate.use_agent_loop;
  if (typeof candidate.agent_mode === 'boolean') partialContext.agent_mode = candidate.agent_mode;
  if (typeof candidate.use_specialized_agents === 'boolean') partialContext.use_specialized_agents = candidate.use_specialized_agents;
  if (typeof candidate.specialized_mode === 'boolean') partialContext.specialized_mode = candidate.specialized_mode;
  if (typeof candidate.model === 'string') partialContext.model = candidate.model.slice(0, 512);
  if (typeof candidate.provider === 'string') partialContext.provider = candidate.provider.slice(0, 128);
  if (typeof candidate.file_path === 'string') partialContext.file_path = candidate.file_path.slice(0, 16384);
  if (typeof candidate.focused_folder === 'string') partialContext.focused_folder = candidate.focused_folder.slice(0, 16384);
  if (typeof candidate.has_errors === 'boolean') partialContext.has_errors = candidate.has_errors;
  if (runtimeBudgetSchema.safeParse(candidate.runtime_budget).success) {
    partialContext.runtime_budget = candidate.runtime_budget as ChatIpcContext['runtime_budget'];
  }
  if (dualModeSchema.safeParse(candidate.dual_mode).success) {
    partialContext.dual_mode = candidate.dual_mode as ChatIpcContext['dual_mode'];
  }
  if (typeof candidate.agent_autonomy === 'number') {
    const autonomy = Math.max(1, Math.min(5, Math.round(candidate.agent_autonomy)));
    partialContext.agent_autonomy = autonomy;
  }

  console.warn('[Chat] IPC context validation failed; preserved safe top-level fields:', result.error.flatten());
  return partialContext;
}
