import * as THREE from 'three';
import { Player } from '../entities/Player';

export class Controls {
  private keys: { [key: string]: boolean } = {};
  private mouseX: number = 0;
  private mouseY: number = 0;
  private isPointerLocked: boolean = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private player: Player
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        e.preventDefault();
        this.player.jump();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        const sensitivity = 0.002;
        this.mouseX -= e.movementX * sensitivity;
        this.mouseY -= e.movementY * sensitivity;
        this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY));
      }
    });

    // Pointer lock
    document.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        document.body.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === document.body;
    });
  }

  public update(): void {
    // Update camera rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.mouseX;
    this.camera.rotation.x = this.mouseY;

    // Movement
    const direction = new THREE.Vector3();
    
    if (this.keys['w'] || this.keys['arrowup']) {
      direction.z -= 1;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      direction.z += 1;
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      direction.x -= 1;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      direction.x += 1;
    }

    if (direction.length() > 0) {
      this.player.move(direction);
    } else {
      this.player.stop();
    }
  }
}

