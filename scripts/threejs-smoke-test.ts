import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { validateToolCall } from '../src/main/agent/tool-validation';
import { extractTaskKeywords } from '../src/main/mirror/opus-example-loader';

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
  - animated background / space feel

Important:
- This is a browser game, not Electron app code`;

const playerContent = `import * as THREE from 'three';

export class Player {
  private mesh: THREE.Mesh;
  private speed = 8;
  private fireCooldown = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.ConeGeometry(0.45, 1.2, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x55ccff,
      emissive: 0x113355,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.set(0, -4, 0);
    scene.add(this.mesh);
  }

  update(delta: number, input: { isPressed(key: string): boolean }): boolean {
    const moveX = (input.isPressed('ArrowRight') ? 1 : 0) - (input.isPressed('ArrowLeft') ? 1 : 0);
    const moveY = (input.isPressed('ArrowUp') ? 1 : 0) - (input.isPressed('ArrowDown') ? 1 : 0);

    this.mesh.position.x += moveX * this.speed * delta;
    this.mesh.position.y += moveY * this.speed * delta;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -6, 6);
    this.mesh.position.y = THREE.MathUtils.clamp(this.mesh.position.y, -4.5, 4.5);

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    if (input.isPressed(' ') && this.fireCooldown === 0) {
      this.fireCooldown = 0.2;
      return true;
    }

    return false;
  }
}`;

function main(): void {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-threejs-smoke-'));

  try {
    fs.mkdirSync(path.join(workspacePath, 'src', 'game'), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({ name: 'smoke-app' }, null, 2));
    fs.writeFileSync(path.join(workspacePath, 'index.html'), '<div id="root"></div>');

    const validation = validateToolCall(
      {
        name: 'write_file',
        arguments: {
          path: 'src/game/Player.ts',
          content: playerContent,
        },
      },
      workspacePath,
      threeJsTask
    );

    const keywords = extractTaskKeywords(threeJsTask);

    const smokeReport = {
      workspacePath,
      validation,
      keywords,
      passed:
        validation.valid === true &&
        !validation.error &&
        keywords.includes('threejs') &&
        !keywords.includes('electron'),
    };

    console.log(JSON.stringify(smokeReport, null, 2));

    if (!smokeReport.passed) {
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

main();
