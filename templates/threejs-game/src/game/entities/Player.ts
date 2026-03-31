import * as THREE from 'three';

/**
 * Simple space-flight style movement: thrust + damping (no voxel ground).
 */
export class Player {
  public velocity = new THREE.Vector3();
  private thrust = 55;
  private damping = 0.988;

  constructor(private camera: THREE.PerspectiveCamera) {}

  public update(delta: number): void {
    this.camera.position.addScaledVector(this.velocity, delta);
    const d = Math.pow(this.damping, delta * 60);
    this.velocity.multiplyScalar(d);
  }

  public move(direction: THREE.Vector3, delta: number): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }

    const move = new THREE.Vector3();
    move.addScaledVector(forward, -direction.z);
    move.addScaledVector(right, direction.x);

    if (direction.y !== 0) {
      move.addScaledVector(new THREE.Vector3(0, 1, 0), direction.y);
    }

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(this.thrust * delta);
      this.velocity.add(move);
    }
  }

  public stopHorizontal(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
  }

  public brake(delta: number): void {
    this.velocity.multiplyScalar(Math.pow(0.85, delta * 60));
  }
}
