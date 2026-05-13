import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type AgentTraceEventType =
  | 'run_start'
  | 'route_plan'
  | 'branch_start'
  | 'model_call_start'
  | 'model_call_retry'
  | 'model_call_timeout'
  | 'model_call_error'
  | 'model_call_success'
  | 'tool_call_start'
  | 'tool_call_blocked'
  | 'tool_call_success'
  | 'tool_call_error'
  | 'verification'
  | 'run_complete';

export interface AgentTraceEvent {
  traceId: string;
  type: AgentTraceEventType;
  timestamp: number;
  elapsedMs: number;
  data: Record<string, unknown>;
}

interface ActiveTrace {
  id: string;
  startedAt: number;
  filePath: string;
}

let activeTrace: ActiveTrace | null = null;

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-...[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, 'Bearer ...[redacted]')
      .slice(0, 4000);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitize);
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      if (/api[_-]?key|secret|token|password|authorization/i.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitize(nested);
      }
    }
    return output;
  }

  return value;
}

export function resolveTraceDirectory(): string {
  const base =
    process.env.AGENTPRIME_TRACE_DIR ||
    (process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'agentprime', 'agent-traces')
      : path.join(os.homedir(), '.agentprime', 'agent-traces'));
  fs.mkdirSync(base, { recursive: true });
  return base;
}

export function startAgentTrace(data: Record<string, unknown>): ActiveTrace {
  const id = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(resolveTraceDirectory(), `${id}.jsonl`);
  activeTrace = { id, startedAt: Date.now(), filePath };
  recordAgentTrace('run_start', data);
  return activeTrace;
}

export function getActiveAgentTraceId(): string | null {
  return activeTrace?.id || null;
}

export function getActiveAgentTracePath(): string | null {
  return activeTrace?.filePath || null;
}

export function recordAgentTrace(type: AgentTraceEventType, data: Record<string, unknown> = {}): void {
  if (!activeTrace) return;

  const event: AgentTraceEvent = {
    traceId: activeTrace.id,
    type,
    timestamp: Date.now(),
    elapsedMs: Date.now() - activeTrace.startedAt,
    data: sanitize(data) as Record<string, unknown>,
  };

  try {
    fs.appendFileSync(activeTrace.filePath, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {
    // Tracing must never break an agent run.
  }
}

export function finishAgentTrace(data: Record<string, unknown> = {}): void {
  recordAgentTrace('run_complete', data);
  activeTrace = null;
}
