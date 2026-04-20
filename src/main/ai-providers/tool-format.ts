/**
 * Tool format conversion helpers.
 *
 * AgentPrime's canonical internal tool format is Anthropic-style:
 *   - `Tool` declarations use `input_schema`
 *   - Model responses surface `ToolUseBlock` with `id`, `name`, `input`
 *   - Tool results are sent back as `tool_result` content with `tool_use_id`
 *
 * Other providers (OpenAI chat completions, OpenAI Responses API, OpenRouter)
 * use a different shape. These helpers translate between formats so every
 * provider can implement `chatWithTools` natively while exposing the same
 * canonical surface to the agent loop.
 */

import type {
  ChatMessage,
  Tool,
  ToolUseBlock,
  ContentBlock
} from '../../types/ai-providers';

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Chat Completions tool format
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface OpenAIChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
}

/**
 * Convert canonical Anthropic-style tools to OpenAI Chat Completions format.
 */
export function toOpenAIChatTools(tools: Tool[]): OpenAIChatTool[] {
  return (tools || []).map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} }
    }
  }));
}

/**
 * Parse OpenAI tool_calls into canonical ToolUseBlock[].
 */
export function fromOpenAIToolCalls(
  toolCalls: OpenAIChatToolCall[] | undefined
): ToolUseBlock[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  return toolCalls.map(call => {
    let input: Record<string, any> = {};
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      // Models occasionally emit non-JSON; fall back to wrapping raw text.
      input = { _raw: call.function?.arguments };
    }
    return {
      type: 'tool_use' as const,
      id: call.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: call.function?.name,
      input
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Responses API tool format (GPT-5.x)
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Convert canonical tools to OpenAI Responses API format (GPT-5.x).
 * Slightly flatter than chat completions — no nested `function` key.
 */
export function toOpenAIResponsesTools(tools: Tool[]): OpenAIResponsesTool[] {
  return (tools || []).map(tool => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description || '',
    parameters: tool.input_schema || { type: 'object', properties: {} }
  }));
}

/**
 * Extract tool calls from a GPT-5 Responses API output array.
 * Output items of type "function_call" contain { name, arguments, call_id }.
 */
export function fromResponsesOutput(
  output: any[] | undefined
): { text: string; toolCalls: ToolUseBlock[] } {
  const items = Array.isArray(output) ? output : [];
  const toolCalls: ToolUseBlock[] = [];
  let text = '';

  for (const item of items) {
    if (!item) continue;

    if (item.type === 'function_call') {
      let input: Record<string, any> = {};
      try {
        input = typeof item.arguments === 'string'
          ? JSON.parse(item.arguments || '{}')
          : (item.arguments || {});
      } catch {
        input = { _raw: item.arguments };
      }
      toolCalls.push({
        type: 'tool_use',
        id: item.call_id || item.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: item.name,
        input
      });
      continue;
    }

    if (item.type === 'message') {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          text += part.text;
        }
      }
    }
  }

  return { text, toolCalls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Message translation: canonical (Anthropic-style) → OpenAI Chat Completions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert canonical messages (which may carry assistant `tool_use` blocks and
 * user `tool_result` blocks) into OpenAI Chat Completions message format.
 *
 * Canonical assistant turn with tool calls:
 *   { role: 'assistant', content: [TextBlock | ToolUseBlock, ...] }
 * becomes:
 *   { role: 'assistant', content: "<text>", tool_calls: [...] }
 *
 * Canonical user tool-result turn:
 *   { role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }
 * becomes one OpenAI message per result:
 *   { role: 'tool', tool_call_id, content }
 */
export function toOpenAIChatMessages(messages: ChatMessage[]): any[] {
  const out: any[] = [];

  for (const msg of messages) {
    const role = msg.role;
    const content = (msg as any).content;

    // Plain string content — pass straight through.
    if (typeof content === 'string') {
      out.push({ role, content });
      continue;
    }

    // Array content: translate based on role.
    if (Array.isArray(content)) {
      if (role === 'assistant') {
        const textParts: string[] = [];
        const toolCalls: OpenAIChatToolCall[] = [];

        for (const block of content as ContentBlock[]) {
          if ((block as any).type === 'text') {
            textParts.push((block as any).text || '');
          } else if ((block as any).type === 'tool_use') {
            const tu = block as ToolUseBlock;
            toolCalls.push({
              id: tu.id,
              type: 'function',
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input || {})
              }
            });
          }
        }

        const message: any = { role: 'assistant', content: textParts.join('') || null };
        if (toolCalls.length > 0) {
          message.tool_calls = toolCalls;
        }
        out.push(message);
        continue;
      }

      if (role === 'user') {
        const toolResults = content.filter((b: any) => b?.type === 'tool_result');
        const otherParts = content.filter((b: any) => b?.type !== 'tool_result');

        for (const r of toolResults) {
          out.push({
            role: 'tool',
            tool_call_id: r.tool_use_id,
            content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
          });
        }

        if (otherParts.length > 0) {
          const text = otherParts
            .map((p: any) => (p?.type === 'text' ? p.text : JSON.stringify(p)))
            .join('\n');
          if (text) out.push({ role: 'user', content: text });
        }
        continue;
      }
    }

    // Anything else: stringify defensively.
    out.push({ role, content: typeof content === 'string' ? content : JSON.stringify(content) });
  }

  return out;
}
