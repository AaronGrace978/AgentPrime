import * as THREE from 'three';
import type { ControlState } from '../utils/Controls';
import type { PlatformSurface } from '../world/World';

const PLAYER_HALF_EXTENTS = new THREE.Vector3(0.45, 0.9, 0.45);

export class Player {
  private readonly spawnPoint = new THREE.Vector3();
  private readonly group: THREE.Group;
  private readonly velocity = new THREE.Vector3();
  private readonly nextPosition = new THREE.Vector3();
  private grounded = false;

  constructor(scene: THREE.Scene, spawnPoint: THREE.Vector3) {
    this.spawnPoint.copy(spawnPoint);
    this.group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.2, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55 })
    );
    body.position.y = 0.1;
    body.castShadow = true;
    body.receiveShadow = true;

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.45 })
    );
    cap.position.set(0, 0.85, 0);
    cap.castShadow = true;

    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.5 })
    );
    pack.position.set(-0.45, 0.2, 0);
    pack.castShadow = true;

    this.group.add(body, cap, pack);
    scene.add(this.group);
    this.reset(spawnPoint);
  }

  public update(
    delta: number,
    input: ControlState,
    platforms: readonly PlatformSurface[]
  ): void {
    const targetXVelocity = input.moveX * 8.2;
    const targetZVelocity = input.moveZ * 3.4;

    this.velocity.x = THREE.MathUtils.damp(
      this.velocity.x,
      targetXVelocity,
      this.grounded ? 18 : 8,
      delta
    );
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetZVelocity, 14, delta);

    if (input.jumpPressed && this.grounded) {
      this.velocity.y = 11.5;
      this.grounded = false;
    }

    this.velocity.y -= 28 * delta;
    this.nextPosition.copy(this.group.position).addScaledVector(this.velocity, delta);
    this.nextPosition.z = THREE.MathUtils.clamp(this.nextPosition.z, -3.5, 3.5);

    const currentBottom = this.group.position.y - PLAYER_HALF_EXTENTS.y;
    const nextBottom = this.nextPosition.y - PLAYER_HALF_EXTENTS.y;
    let landingHeight: number | null = null;

    for (const platform of platforms) {
      if (!this.overlapsPlatform(platform.bounds, this.nextPosition)) {
        continue;
      }

      const top = platform.bounds.max.y;
      const standingNow = Math.abs(currentBottom - top) < 0.12 && this.velocity.y <= 0;
      const crossingTop =
        currentBottom >= top - 0.04 &&
        nextBottom <= top + 0.08 &&
        this.velocity.y <= 0;

      if (standingNow || crossingTop) {
        landingHeight = landingHeight === null ? top : Math.max(landingHeight, top);
      }
    }

    if (landingHeight !== null) {
      this.nextPosition.y = landingHeight + PLAYER_HALF_EXTENTS.y;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.group.position.copy(this.nextPosition);
    this.group.rotation.z = THREE.MathUtils.degToRad(-this.velocity.x * 1.4);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position;
  }

  public hasFallen(): boolean {
    return this.group.position.y < -14;
  }

  public reset(spawnPoint: THREE.Vector3 = this.spawnPoint): void {
    this.spawnPoint.copy(spawnPoint);
    this.group.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
  }

  private overlapsPlatform(bounds: THREE.Box3, center: THREE.Vector3): boolean {
    return (
      center.x + PLAYER_HALF_EXTENTS.x >= bounds.min.x &&
      center.x - PLAYER_HALF_EXTENTS.x <= bounds.max.x &&
      center.z + PLAYER_HALF_EXTENTS.z >= bounds.min.z &&
      center.z - PLAYER_HALF_EXTENTS.z <= bounds.max.z
    );
  }
}
