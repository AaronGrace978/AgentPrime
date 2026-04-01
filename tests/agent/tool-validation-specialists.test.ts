import { validateToolCall } from '../../src/main/agent/tool-validation';

describe('specialist-aware tool validation', () => {
  const workspacePath = 'G:/AgentPrime';

  it('blocks integration verifier file writes', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
      },
      workspacePath,
      'Verify the project',
      { specialist: 'integration_analyst' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('integration_verifier');
  });

  it('blocks javascript specialist from writing backend python files', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'backend/app.py', content: 'print("hi")' },
      },
      workspacePath,
      'Build a React app with Python backend',
      { specialist: 'javascript_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside its writable scope');
  });

  it('allows styling specialist to edit CSS but not backend files', () => {
    const allowed = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/styles/app.css', content: '.app { color: white; }' },
      },
      workspacePath,
      'Polish the dashboard UI',
      { specialist: 'styling_ux_specialist' }
    );

    const blocked = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'backend/app.py', content: 'print("nope")' },
      },
      workspacePath,
      'Polish the dashboard UI',
      { specialist: 'styling_ux_specialist' }
    );

    expect(allowed.valid).toBe(true);
    expect(blocked.valid).toBe(false);
    expect(blocked.error).toContain('outside its writable scope');
  });

  it('allows pipeline specialist to run bounded build commands', () => {
    const result = validateToolCall(
      {
        name: 'run_command',
        arguments: { command: 'npm run build' },
      },
      workspacePath,
      'Build and verify the project',
      { specialist: 'pipeline_specialist' }
    );

    expect(result.valid).toBe(true);
  });

  it('blocks pipeline specialist from running arbitrary commands', () => {
    const result = validateToolCall(
      {
        name: 'run_command',
        arguments: { command: 'python secret_script.py' },
      },
      workspacePath,
      'Build and verify the project',
      { specialist: 'pipeline_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('allowed command set');
  });

  it('allows testing specialist to run bounded playwright commands', () => {
    const result = validateToolCall(
      {
        name: 'run_command',
        arguments: { command: 'playwright test tests/e2e/app.spec.js' },
      },
      workspacePath,
      'Add a happy path browser test',
      { specialist: 'testing_specialist' }
    );

    expect(result.valid).toBe(true);
  });

  it('keeps the orchestrator inside assigned file claims', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'backend/app.py', content: 'print("out of scope")' },
      },
      workspacePath,
      'Create a frontend-only app',
      { specialist: 'tool_orchestrator', claimedFiles: ['src/**', 'package.json'] }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside assigned file claims');
  });

  it('keeps repair specialist inside repair-plan claims', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/extra-feature.ts', content: 'export const nope = true;' },
      },
      workspacePath,
      'Fix the build errors',
      { specialist: 'repair_specialist', claimedFiles: ['src/App.tsx'] }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside assigned file claims');
  });
});
