import * as THREE from 'three';
import { Player } from './entities/Player';
import { Controls } from './utils/Controls';
import { World } from './world/World';

export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly world: World;
  private readonly player: Player;
  private readonly controls: Controls;
  private readonly resizeHandler: () => void;
  private animationFrameId: number | null = null;
  private score = 0;
  private finished = false;

  private readonly scoreElement = document.getElementById('score-value');
  private readonly statusElement = document.getElementById('status-value');

  constructor(private readonly container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 160);
    this.camera.position.set(-10, 8, 13);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.resizeRenderer();
    this.container.appendChild(this.renderer.domElement);

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world.getSpawnPoint());
    this.controls = new Controls();
    this.resizeHandler = () => this.resizeRenderer();
    window.addEventListener('resize', this.resizeHandler);

    this.setStatus('Collect every star, then ring the bell.');
    this.updateScore();
  }

  public animate(): void {
    const tick = (): void => {
      this.animationFrameId = window.requestAnimationFrame(tick);
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const input = this.controls.getState();

      if (input.resetPressed) {
        this.restart();
      }

      if (!this.finished) {
        this.player.update(delta, input, this.world.getPlatforms());

        if (this.player.hasFallen()) {
          this.restart('Missed the jump. Back to the start!');
        } else {
          const gained = this.world.collectAt(this.player.getPosition());
          if (gained > 0) {
            this.score += gained;
            this.updateScore();
            const remaining = this.world.getTotalCollectibles() - this.score;
            this.setStatus(remaining > 0 ? `Nice! ${remaining} star${remaining === 1 ? '' : 's'} left.` : 'All stars collected. Head for the bell!');
          }

          if (this.world.hasReachedGoal(this.player.getPosition())) {
            if (this.score === this.world.getTotalCollectibles()) {
              this.finished = true;
              this.setStatus('Course clear! Press R to run it again.');
            } else {
              const remaining = this.world.getTotalCollectibles() - this.score;
              this.setStatus(`The bell is ready, but you still need ${remaining} star${remaining === 1 ? '' : 's'}.`);
            }
          }
        }
      }

      this.world.update(this.clock.elapsedTime);
      this.updateCamera(delta);
      this.renderer.render(this.scene, this.camera);
    };

    tick();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.resizeHandler);
    this.controls.dispose();
    this.player.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private restart(statusMessage = 'Fresh run. Grab every star!'): void {
    this.score = 0;
    this.finished = false;
    this.world.resetCollectibles();
    this.player.reset(this.world.getSpawnPoint());
    this.updateScore();
    this.setStatus(statusMessage);
  }

  private updateCamera(delta: number): void {
    const position = this.player.getPosition();
    const targetPosition = new THREE.Vector3(position.x + 8.5, position.y + 6.4, 12);
    this.camera.position.lerp(targetPosition, 1 - Math.exp(-delta * 5.5));

    const lookAtTarget = new THREE.Vector3(position.x + 2.4, position.y + 0.9, position.z * 0.55);
    this.camera.lookAt(lookAtTarget);
  }

  private resizeRenderer(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private updateScore(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `${this.score} / ${this.world.getTotalCollectibles()}`;
    }
  }

  private setStatus(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
  }
}
