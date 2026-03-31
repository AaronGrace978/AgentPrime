import * as THREE from 'three';
import { Player } from '../entities/Player';

export class Controls {
  private keys: { [key: string]: boolean } = {};
  private mouseX = 0;
  private mouseY = 0;
  private isPointerLocked = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private player: Player
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        e.preventDefault();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        const sensitivity = 0.002;
        this.mouseX -= e.movementX * sensitivity;
        this.mouseY -= e.movementY * sensitivity;
        this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY));
      }
    });

    document.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        document.body.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === document.body;
    });
  }

  public update(delta: number): void {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.mouseX;
    this.camera.rotation.x = this.mouseY;

    const direction = new THREE.Vector3();

    if (this.keys['w'] || this.keys['arrowup']) direction.z -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) direction.z += 1;
    if (this.keys['a'] || this.keys['arrowleft']) direction.x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) direction.x += 1;
    if (this.keys[' ']) direction.y += 1;
    if (this.keys['shift'] || this.keys['c']) direction.y -= 1;

    if (direction.length() > 0) {
      this.player.move(direction, delta);
    } else {
      this.player.stopHorizontal();
    }

    if (this.keys['x']) {
      this.player.brake(delta);
    }
  }
}
