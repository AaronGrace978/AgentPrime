import { detectProjectType, isContentIncompatibleWithTask, validateIndexHtml, validateToolCall } from '../src/main/agent/tool-validation';
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

  it('prefers explicit Three.js tasks over generic game keywords', () => {
    expect(detectProjectType(threeJsTask)).toBe('threejs');
  });

  it('does not block Three.js game files for a Three.js game task', () => {
    expect(isContentIncompatibleWithTask(threeJsTask, threeJsPlayerContent)).toEqual({
      incompatible: false,
      reason: '',
    });
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

describe('index.html validation', () => {
  it('allows Vite projects to manage CSS through module imports', () => {
    const validation = validateIndexHtml(
      '<!DOCTYPE html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      new Map([
        ['index.html', ['index.html']],
        ['vite.config.ts', ['vite.config.ts']],
        ['styles.css', ['src/styles.css']],
        ['main.tsx', ['src/main.tsx']],
      ])
    );

    expect(validation.valid).toBe(true);
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
