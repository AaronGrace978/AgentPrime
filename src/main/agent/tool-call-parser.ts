import { createLogger } from '../core/logger';

const log = createLogger('ToolCallParser');

export interface ParsedToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

function createToolCall(name: string, args: Record<string, unknown>): ParsedToolCall {
  return {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

function extractToolCalls(parsed: any, allowedTools: ReadonlySet<string>): ParsedToolCall[] | null {
  if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
    const calls: ParsedToolCall[] = [];
    for (const call of parsed.tool_calls) {
      if (call?.name && allowedTools.has(call.name)) {
        calls.push(
          createToolCall(call.name, (call.parameters || call.arguments || {}) as Record<string, unknown>)
        );
      }
    }
    if (calls.length > 0) {
      return calls;
    }
  }

  if (parsed.name && allowedTools.has(parsed.name)) {
    return [
      createToolCall(
        parsed.name,
        (parsed.arguments || parsed.parameters || {}) as Record<string, unknown>
      ),
    ];
  }

  if (parsed.done) {
    return [];
  }

  return null;
}

export function parseToolCallsContent(
  content: string,
  allowedToolNames: Iterable<string>
): ParsedToolCall[] {
  const allowedTools = new Set(allowedToolNames);
  let jsonContent = content.trim();

  const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1].trim();
  }

  const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonContent = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonContent);
    const calls = extractToolCalls(parsed, allowedTools);
    if (calls !== null) {
      log.info('Parsed tool calls (direct):', calls.length);
      return calls;
    }
  } catch (error) {
    log.info('Direct JSON parse failed:', (error as Error).message.substring(0, 100));
  }

  try {
    const lightRepaired = jsonContent
      .replace(/:\s*\}/g, ': {}}')
      .replace(/,\s*\}/g, '}')
      .replace(/,\s*\]/g, ']');

    const parsed = JSON.parse(lightRepaired);
    const calls = extractToolCalls(parsed, allowedTools);
    if (calls !== null) {
      if (calls.length > 0) {
        const call = calls[0];
        const args = JSON.parse(call.function.arguments);
        if (call.function.name === 'write_file' && (!args.path || !args.content)) {
          log.info('Tool call has missing required arguments (path/content)');
          return [];
        }
      }
      log.info('Parsed tool calls (light repair):', calls.length);
      return calls;
    }
  } catch {
    log.info('Light repair parse failed');
  }

  try {
    const parsed = JSON.parse(content.trim());
    const calls = extractToolCalls(parsed, allowedTools);
    if (calls !== null) {
      log.info('Parsed tool calls (original):', calls.length);
      return calls;
    }
  } catch {
    // Fall through to pattern-based recovery.
  }

  const writeFileMatch = content.match(
    /"name"\s*:\s*"write_file"[\s\S]*?"path"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"([\s\S]*?)(?:"\s*\}|\"\s*,\s*")/
  );
  if (writeFileMatch && allowedTools.has('write_file')) {
    try {
      const filePath = writeFileMatch[1];
      const fileContent = writeFileMatch[2]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      log.info('Extracted write_file via smart parsing:', filePath);
      return [createToolCall('write_file', { path: filePath, content: fileContent })];
    } catch (error) {
      log.info('Smart write_file extraction failed:', error);
    }
  }

  const runCommandMatch = content.match(
    /"name"\s*:\s*"run_command"[\s\S]*?"command"\s*:\s*"([^"]+)"/
  );
  if (runCommandMatch && allowedTools.has('run_command')) {
    log.info('Extracted run_command via smart parsing:', runCommandMatch[1]);
    return [createToolCall('run_command', { command: runCommandMatch[1] })];
  }

  const simplePathMatch = content.match(
    /"name"\s*:\s*"(read_file|list_dir)"[\s\S]*?"path"\s*:\s*"([^"]+)"/
  );
  if (simplePathMatch && allowedTools.has(simplePathMatch[1])) {
    log.info(`Extracted ${simplePathMatch[1]} via smart parsing:`, simplePathMatch[2]);
    return [createToolCall(simplePathMatch[1], { path: simplePathMatch[2] })];
  }

  if (
    content.toLowerCase().includes('"done"') &&
    (content.toLowerCase().includes('true') || content.toLowerCase().includes('complete'))
  ) {
    log.info('Detected done response via pattern match');
    return [];
  }

  log.info('All parsing attempts failed. Raw response sample:', content.substring(0, 500));
  return [];
}
