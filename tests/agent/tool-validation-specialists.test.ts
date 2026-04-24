import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  validateToolCall,
  resetFileTracker,
  populateFileTracker,
} from '../../src/main/agent/tool-validation';
import { resolveVibeCoderExecutionPolicy } from '../../src/main/agent/behavior-profile';

describe('specialist-aware tool validation', () => {
  const workspacePath = 'G:/AgentPrime';

  beforeEach(() => {
    resetFileTracker('create');
  });

  it('blocks integration verifier file writes', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/App.tsx',
          content: 'export default function App() { return null; }',
        },
      },
      workspacePath,
      'Verify the project',
      { specialist: 'integration_analyst' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('integration_verifier');
  });

  it('allows javascript specialist to write Vite entry CSS and README when co-wiring the app', () => {
    const css = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/index.css', content: 'body { margin: 0; }' },
      },
      workspacePath,
      'Wire React entry and styles',
      { specialist: 'javascript_specialist' }
    );
    const readme = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'README.md', content: '# App\n' },
      },
      workspacePath,
      'Document npm run dev',
      { specialist: 'javascript_specialist' }
    );

    expect(css.valid).toBe(true);
    expect(readme.valid).toBe(true);
  });

  it('allows javascript specialist to write root CSS for plain static site co-wiring', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'styles.css', content: 'body { margin: 0; }' },
      },
      workspacePath,
      'Build a simple static website',
      { specialist: 'javascript_specialist' }
    );

    expect(result.valid).toBe(true);
  });

  it('allows javascript specialist to read index.html for Vite app wiring', () => {
    const result = validateToolCall(
      {
        name: 'read_file',
        arguments: { path: 'index.html' },
      },
      workspacePath,
      'Wire the Vite entrypoint correctly',
      { specialist: 'javascript_specialist' }
    );

    expect(result.valid).toBe(true);
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

  it('allows styling specialist to edit src/App.tsx (glob ** matches root of src/)', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/App.tsx',
          content: 'export default function App() { return null; }',
        },
      },
      workspacePath,
      'Polish the app shell',
      { specialist: 'styling_ux_specialist' }
    );

    expect(result.valid).toBe(true);
  });

  it('allows pipeline specialist to edit README.md', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'README.md', content: '# Project\n' },
      },
      workspacePath,
      'Document setup',
      { specialist: 'pipeline_specialist' }
    );

    expect(result.valid).toBe(true);
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

  it('blocks pipeline specialist from writing application source (e.g. src/game)', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/game/Game.ts', content: 'export {}' },
      },
      workspacePath,
      'Fix the Vite build',
      { specialist: 'pipeline_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('pipeline_specialist');
    expect(result.error).toContain('outside its writable scope');
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

  it('blocks duplicate game modules when scaffold already has canonical nested path', () => {
    resetFileTracker('create');
    populateFileTracker(['src/game/world/World.ts']);

    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/game/World.ts', content: 'export class World {}' },
      },
      workspacePath,
      'Build a three.js action fantasy game',
      { specialist: 'javascript_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('DUPLICATE GAME MODULE DETECTED');
  });

  it('blocks mixed frontend entrypoints during initial create generation', () => {
    resetFileTracker('create');
    populateFileTracker(['src/main.tsx']);

    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/main.js',
          content: "console.log('stale vanilla entry');",
        },
      },
      workspacePath,
      'Build a React Vite website',
      { specialist: 'javascript_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Frontend stack conflict');
    expect(result.error).toContain('src/main.js');
  });

  it('blocks duplicate Vite config variants during initial create generation', () => {
    resetFileTracker('create');
    populateFileTracker(['vite.config.ts']);

    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'vite.config.js',
          content: 'export default {};',
        },
      },
      workspacePath,
      'Build a Vite website',
      { specialist: 'pipeline_specialist' }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Build config conflict');
    expect(result.error).toContain('vite.config.ts');
  });

  it('blocks specialist writes when VibeCoder plan-only policy is active', () => {
    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/App.tsx',
          content: 'export default function App() { return null; }',
        },
      },
      workspacePath,
      'Analyze the current app shell',
      { specialist: 'javascript_specialist' },
      resolveVibeCoderExecutionPolicy('vibecoder', 'Analyze the current app shell')
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('plan-only');
  });

  it('blocks specialist scaffold calls during VibeCoder repair-only runs', () => {
    const result = validateToolCall(
      {
        name: 'scaffold_project',
        arguments: { project_type: 'threejs_viewer', project_name: 'demo' },
      },
      workspacePath,
      'Fix the broken viewer runtime',
      { specialist: 'tool_orchestrator' },
      resolveVibeCoderExecutionPolicy('vibecoder', 'Fix the broken viewer runtime')
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('repair-only');
  });

  it('enforces framework freeze during repair by blocking JS-to-TSX entrypoint pivots', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-framework-freeze-'));
    try {
      fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, 'src', 'main.js'), 'console.log("legacy entry");\n');

      const result = validateToolCall(
        {
          name: 'write_file',
          arguments: {
            path: 'src/main.tsx',
            content: 'import React from "react"; export default function App(){ return null; }',
          },
        },
        tempWorkspace,
        'CRITICAL FIX PASS REQUIRED: repair the current runtime issues',
        { specialist: 'javascript_specialist' }
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Framework freeze');
    } finally {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  it('blocks repair writes that keep index.html on main.js while React entrypoint exists', () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-index-coherence-'));
    try {
      fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempWorkspace, 'src', 'main.tsx'), 'console.log("react entry");\n');

      const result = validateToolCall(
        {
          name: 'write_file',
          arguments: {
            path: 'index.html',
            content:
              '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>',
          },
        },
        tempWorkspace,
        'Repair-only: fix runtime errors without changing stack',
        { specialist: 'javascript_specialist' }
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Framework freeze');
    } finally {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });
});
