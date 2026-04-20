/**
 * Canonical tool adapter.
 *
 * The agent loop's local `tools` registry uses an OpenAI-style `parameters`
 * shape and carries an `execute` function. The AI provider router speaks the
 * canonical Anthropic-style `Tool` shape (no execute, `input_schema` instead
 * of `parameters`) and returns `ToolUseBlock[]` from native tool calls.
 *
 * These adapters keep both worlds in sync without duplicating tool catalogs.
 */

import type { Tool as CanonicalTool, ToolUseBlock } from '../../types/ai-providers';
import type { ParsedToolCall } from './tool-call-parser';

/**
 * Local tool entry shape used in the agent-loop registry.
 * Kept loose on purpose so we don't import a circular type from agent-loop.ts.
 */
export interface LocalToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Convert the agent loop's tool registry into the canonical Tool[] shape that
 * `aiRouter.chatWithTools` expects. Strips the execute function and renames
 * `parameters` → `input_schema`.
 */
export function toCanonicalTools(
  registry: Record<string, LocalToolDefinition>
): CanonicalTool[] {
  const out: CanonicalTool[] = [];
  for (const def of Object.values(registry)) {
    if (!def?.name) continue;
    out.push({
      name: def.name,
      description: def.description || '',
      input_schema: {
        type: 'object',
        properties: def.parameters?.properties || {},
        required: def.parameters?.required || []
      }
    });
  }
  return out;
}

/**
 * Convert provider-native ToolUseBlock[] into the agent loop's existing
 * ParsedToolCall[] shape. The agent loop downstream code already handles
 * `function.arguments` as a JSON string, so we serialize input → arguments.
 */
export function toolUseBlocksToParsedCalls(
  blocks: ToolUseBlock[] | undefined,
  allowedToolNames?: Iterable<string>
): ParsedToolCall[] {
  if (!blocks || blocks.length === 0) return [];
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  const out: ParsedToolCall[] = [];
  for (const block of blocks) {
    if (!block?.name) continue;
    if (allowed && !allowed.has(block.name)) continue;
    out.push({
      id: block.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input || {})
      }
    });
  }
  return out;
}
