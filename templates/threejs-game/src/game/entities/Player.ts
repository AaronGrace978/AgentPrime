import * as THREE from 'three';

export class Player {
  public velocity: THREE.Vector3;
  public onGround: boolean = false;
  private speed: number = 5;
  private jumpSpeed: number = 8;
  private gravity: number = 20;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.velocity = new THREE.Vector3();
  }

  public update(delta: number): void {
    // Apply gravity
    if (!this.onGround) {
      this.velocity.y -= this.gravity * delta;
    }

    // Update camera position
    this.camera.position.add(
      this.velocity.clone().multiplyScalar(delta)
    );

    // Simple ground collision (y = 0)
    if (this.camera.position.y < 2) {
      this.camera.position.y = 2;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  public move(direction: THREE.Vector3): void {
    // Move relative to camera direction
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    right.normalize();

    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(forward, direction.z);
    moveVector.addScaledVector(right, direction.x);
    moveVector.normalize();
    moveVector.multiplyScalar(this.speed);

    this.velocity.x = moveVector.x;
    this.velocity.z = moveVector.z;
  }

  public jump(): void {
    if (this.onGround) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
    }
  }

  public stop(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
  }
}

