import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  autoFixIndexHtml,
  detectProjectType,
  isContentIncompatibleWithTask,
  resetFileTracker,
  validateIndexHtml,
  validateToolCall,
} from '../src/main/agent/tool-validation';
import { resolveVibeCoderExecutionPolicy } from '../src/main/agent/behavior-profile';
import { extractTaskKeywords } from '../src/main/mirror/opus-example-loader';

describe('tool validation project typing', () => {
  const threeJsTask = `Build a complete playable Three.js space game in the current workspace.

Requirements:
- Use Vite + TypeScript + Three.js
- Create a real playable game, not a demo scene
- The game should have:
  - player spaceship movement
  - shooting
  - enemy ships or asteroids
  - collisions and health
  - score system
  - game over and restart
  - simple HUD
  - animated background / space feel`;

  const threeJsPlayerContent = `import * as THREE from 'three';

export class Player {
  private mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.ConeGeometry(0.4, 1.2, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x44ccff });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);
  }
}`;

  const threeJsPhysicsContent = `import * as THREE from 'three';

export class Player {
  private mesh: THREE.Mesh;
  private velocity = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.ConeGeometry(0.4, 1.2, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x44ccff });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);
  }

  update(deltaTime: number) {
    const thrustResult = this.calculateThrust(deltaTime);
    this.velocity.add(thrustResult);
    this.mesh.position.add(this.velocity);
  }

  private calculateThrust(deltaTime: number): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -5 * deltaTime);
  }
}`;

  const calculatorContent = `const display = document.querySelector('#display');
let currentOperand = '0';
let operator = '+';
let expression = '';

function clearAll() {
  currentOperand = '0';
  expression = '';
}

function equals() {
  return eval(expression);
}`;

  const sideScrollerTask = `Can you build me a three.js side scroller something cool where you use WASD to move,
space to jump, and make it feel like a playful platformer adventure?`;

  it('prefers explicit Three.js tasks over generic game keywords', () => {
    expect(detectProjectType(threeJsTask)).toBe('threejs');
  });

  it('does not block Three.js game files for a Three.js game task', () => {
    expect(isContentIncompatibleWithTask(threeJsTask, threeJsPlayerContent)).toEqual({
      incompatible: false,
      reason: '',
    });
  });

  it('does not misclassify Three.js movement math as calculator content', () => {
    expect(isContentIncompatibleWithTask(threeJsTask, threeJsPhysicsContent)).toEqual({
      incompatible: false,
      reason: '',
    });
  });

  it('does not block side scroller gameplay code for a Three.js platformer prompt', () => {
    expect(isContentIncompatibleWithTask(sideScrollerTask, threeJsPhysicsContent)).toEqual({
      incompatible: false,
      reason: '',
    });
  });

  it('still blocks calculator content for a Three.js task', () => {
    const validation = isContentIncompatibleWithTask(threeJsTask, calculatorContent);
    expect(validation.incompatible).toBe(true);
    expect(validation.reason).toContain('calculator');
  });
});

describe('write_file project type validation', () => {
  const threeJsTask = 'Build a complete playable Three.js space game in the current workspace.';
  const threeJsPhysicsContent = `import * as THREE from 'three';

export class Player {
  private velocity = new THREE.Vector3();

  update(deltaTime: number) {
    const thrustResult = this.calculateThrust(deltaTime);
    this.velocity.add(thrustResult);
  }

  private calculateThrust(deltaTime: number): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -5 * deltaTime);
  }
}`;

  beforeEach(() => {
    resetFileTracker('create');
  });

  it('allows threejs player files that include movement math terms', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-validator-'));

    const result = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/game/entities/Player.ts',
          content: threeJsPhysicsContent,
        },
      },
      workspace,
      threeJsTask
    );

    expect(result.valid).toBe(true);
  });
});

describe('opus keyword extraction', () => {
  it('extracts threejs and ignores negated electron mentions', () => {
    const keywords = extractTaskKeywords(
      'Build a browser game with Three.js and TypeScript. This is not Electron app code.'
    );

    expect(keywords).toContain('threejs');
    expect(keywords).toContain('typescript');
    expect(keywords).not.toContain('electron');
  });

  it('recognizes website tasks without treating AgentPrime as a generic agent request', () => {
    const keywords = extractTaskKeywords('Can you build me the official AgentPrime Website<3');

    expect(keywords).toContain('website');
    expect(keywords).toContain('landing-page');
    expect(keywords).toContain('marketing');
    expect(keywords).not.toContain('ui');
    expect(keywords).not.toContain('agent');
    expect(keywords).not.toContain('tool-calling');
  });

  it('ignores model-visible IDE context when extracting retrieval keywords', () => {
    const keywords = extractTaskKeywords(
      'Build the official AgentPrime website\n\n## IDE_CONTEXT (from UI)\nLogs mention agent tool-calling and circuit breaker retries.'
    );

    expect(keywords).toContain('website');
    expect(keywords).not.toContain('agent');
    expect(keywords).not.toContain('tool-calling');
    expect(keywords).not.toContain('circuit-breaker');
  });
});

describe('scaffold_project validation', () => {
  it('accepts the current scaffold_project schema without requiring project_path', () => {
    const validation = validateToolCall(
      {
        name: 'scaffold_project',
        arguments: {
          project_type: 'threejs_viewer',
          project_name: 'Space Demo',
        },
      },
      'G:/AgentPrime',
      'Build a three.js space game'
    );

    expect(validation).toEqual({ valid: true });
  });
});

describe('VibeCoder execution policy validation', () => {
  const workspacePath = 'G:/AgentPrime';

  it('blocks write_file during plan-only VibeCoder runs', () => {
    const validation = validateToolCall(
      {
        name: 'write_file',
        arguments: { path: 'src/App.tsx', content: 'export default function App() { return null; }' },
      },
      workspacePath,
      'Analyze the app structure',
      undefined,
      resolveVibeCoderExecutionPolicy('vibecoder', 'Analyze the app structure')
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('plan-only');
  });

  it('blocks scaffold_project during repair-only VibeCoder runs', () => {
    const validation = validateToolCall(
      {
        name: 'scaffold_project',
        arguments: { project_type: 'threejs_viewer', project_name: 'Space Demo' },
      },
      workspacePath,
      'Fix the broken three.js build',
      undefined,
      resolveVibeCoderExecutionPolicy('vibecoder', 'Fix the broken three.js build')
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('repair-only');
    expect(validation.error).toContain('scaffold_project');
  });
});

describe('index.html validation', () => {
  it('allows Vite projects to manage CSS through module imports', () => {
    const validation = validateIndexHtml(
      '<!DOCTYPE html><html><head></head><body><div id="root"></div><script type="module" src="./src/main.tsx"></script></body></html>',
      new Map([
        ['index.html', ['index.html']],
        ['vite.config.ts', ['vite.config.ts']],
        ['styles.css', ['src/styles.css']],
        ['main.tsx', ['src/main.tsx']],
      ])
    );

    expect(validation.valid).toBe(true);
  });

  it('warns when Vite index.html uses root-absolute /src/ URLs (build fragility)', () => {
    const validation = validateIndexHtml(
      '<!DOCTYPE html><html><head></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
      new Map([
        ['vite.config.ts', ['vite.config.ts']],
        ['main.tsx', ['src/main.tsx']],
      ])
    );

    expect(validation.valid).toBe(true);
    expect(validation.warning).toMatch(/Prefer \.\/src/i);
  });

  it('suggests nested Vite entrypoints relative to the local index.html file', () => {
    const validation = validateIndexHtml(
      '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
      new Map([
        ['index.html', ['frontend/index.html']],
        ['vite.config.ts', ['frontend/vite.config.ts']],
        ['main.tsx', ['frontend/src/main.tsx']],
      ]),
      'frontend/index.html'
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('./src/main.tsx');
    expect(validation.error).not.toContain('./frontend/src/main.tsx');
  });

  it('still rejects unlinked CSS for non-bundled projects', () => {
    const validation = validateIndexHtml(
      '<!DOCTYPE html><html><head></head><body><script src="/game.js"></script></body></html>',
      new Map([
        ['index.html', ['index.html']],
        ['styles.css', ['styles.css']],
        ['game.js', ['game.js']],
      ])
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(/styles\.css/);
    expect(validation.error).toMatch(/stylesheet/i);
  });
});

describe('index.html auto-fix', () => {
  it('adds nested asset references relative to the local Vite app root', () => {
    const result = autoFixIndexHtml(
      '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
      ['frontend/src/styles.css'],
      ['frontend/src/main.tsx'],
      'frontend/index.html'
    );

    expect(result.fixed).toBe(true);
    expect(result.content).toContain('href="./src/styles.css"');
    expect(result.content).toContain('src="./src/main.tsx"');
    expect(result.content).not.toContain('./frontend/src/');
  });
});
