import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  finishAgentTrace,
  getActiveAgentTracePath,
  recordAgentTrace,
  startAgentTrace,
} from '../../src/main/agent/agent-trace-recorder';

describe('agent trace recorder', () => {
  const traceDir = path.join(os.tmpdir(), `agentprime-traces-${Date.now()}`);
  const previousTraceDir = process.env.AGENTPRIME_TRACE_DIR;

  beforeAll(() => {
    process.env.AGENTPRIME_TRACE_DIR = traceDir;
  });

  afterAll(() => {
    finishAgentTrace();
    if (previousTraceDir === undefined) {
      delete process.env.AGENTPRIME_TRACE_DIR;
    } else {
      process.env.AGENTPRIME_TRACE_DIR = previousTraceDir;
    }
    fs.rmSync(traceDir, { recursive: true, force: true });
  });

  it('writes sanitized JSONL events for a run', () => {
    startAgentTrace({ requestId: 'req_1', apiKey: 'sk-secretsecretsecret' });
    recordAgentTrace('model_call_start', {
      provider: 'ollama',
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
    });
    finishAgentTrace({ success: true });

    const tracePath = getActiveAgentTracePath();
    expect(tracePath).toBeNull();

    const files = fs.readdirSync(traceDir);
    expect(files).toHaveLength(1);

    const lines = fs.readFileSync(path.join(traceDir, files[0]), 'utf-8').trim().split('\n');
    expect(lines.length).toBe(3);
    expect(lines.join('\n')).not.toContain('secretsecretsecret');
    expect(lines.join('\n')).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(JSON.parse(lines[0]).type).toBe('run_start');
    expect(JSON.parse(lines[1]).type).toBe('model_call_start');
    expect(JSON.parse(lines[2]).type).toBe('run_complete');
  });
});
