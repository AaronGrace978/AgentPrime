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
  console.warn('[Chat] IPC context validation failed, using empty context:', result.error.flatten());
  return {};
}
