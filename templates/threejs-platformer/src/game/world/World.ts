import * as THREE from 'three';

export interface PlatformSurface {
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
}

interface Collectible {
  mesh: THREE.Mesh;
  basePosition: THREE.Vector3;
  collected: boolean;
  phase: number;
}

export class World {
  private readonly platforms: PlatformSurface[] = [];
  private readonly collectibles: Collectible[] = [];
  private readonly spawnPoint = new THREE.Vector3(-18, 0.9, 0);
  private readonly finishBell: THREE.Group;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 28, 80);

    this.addLights();
    this.addBackdrop();
    this.addCourse();
    this.finishBell = this.addFinishBell(new THREE.Vector3(18, 6.2, 0));
  }

  public getSpawnPoint(): THREE.Vector3 {
    return this.spawnPoint.clone();
  }

  public getPlatforms(): readonly PlatformSurface[] {
    return this.platforms;
  }

  public getCollectedCount(): number {
    return this.collectibles.filter((collectible) => collectible.collected).length;
  }

  public getTotalCollectibles(): number {
    return this.collectibles.length;
  }

  public collectAt(position: THREE.Vector3): number {
    let gained = 0;

    for (const collectible of this.collectibles) {
      if (collectible.collected) {
        continue;
      }

      if (collectible.mesh.position.distanceTo(position) <= 1.15) {
        collectible.collected = true;
        collectible.mesh.visible = false;
        gained += 1;
      }
    }

    return gained;
  }

  public hasReachedGoal(position: THREE.Vector3): boolean {
    return this.finishBell.position.distanceTo(position) <= 1.75;
  }

  public update(elapsedTime: number): void {
    for (const collectible of this.collectibles) {
      if (collectible.collected) {
        continue;
      }

      collectible.mesh.rotation.y += 0.02;
      collectible.mesh.position.y = collectible.basePosition.y + Math.sin(elapsedTime * 2.6 + collectible.phase) * 0.28;
    }

    this.finishBell.rotation.y = Math.sin(elapsedTime * 1.4) * 0.12;
  }

  public resetCollectibles(): void {
    for (const collectible of this.collectibles) {
      collectible.collected = false;
      collectible.mesh.visible = true;
      collectible.mesh.position.copy(collectible.basePosition);
    }
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff7d6, 1.6);
    sun.position.set(-12, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -20;
    this.scene.add(sun);
  }

  private addBackdrop(): void {
    const skyStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 26),
      new THREE.MeshBasicMaterial({ color: 0xbfe3ff })
    );
    skyStripe.position.set(0, 15, -18);
    this.scene.add(skyStripe);

    const mountainColors = [0x7c93b7, 0x5d759b, 0x4a5f82];
    mountainColors.forEach((color, index) => {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(24, 10 + index * 3, 2),
        new THREE.MeshStandardMaterial({ color, roughness: 1 })
      );
      ridge.position.set(-18 + index * 18, 4 + index * 0.9, -14 + index * 2);
      this.scene.add(ridge);
    });
  }

  private addCourse(): void {
    this.addPlatform(new THREE.Vector3(54, 2, 9), new THREE.Vector3(0, -1, 0), 0x3f6212);
    this.addPlatform(new THREE.Vector3(8, 1.2, 6), new THREE.Vector3(-8, 2.2, -1.2), 0x16a34a);
    this.addPlatform(new THREE.Vector3(6, 1.2, 5), new THREE.Vector3(-1, 4.6, 1.8), 0x22c55e);
    this.addPlatform(new THREE.Vector3(7, 1.2, 5), new THREE.Vector3(7, 7.2, -1.5), 0x84cc16);
    this.addPlatform(new THREE.Vector3(8, 1.2, 6), new THREE.Vector3(15, 4.9, 1.1), 0x65a30d);

    this.addCollectible(new THREE.Vector3(-11.5, 3.8, 0));
    this.addCollectible(new THREE.Vector3(-4.2, 6.1, 1.7));
    this.addCollectible(new THREE.Vector3(4.5, 8.7, -1.3));
    this.addCollectible(new THREE.Vector3(15.5, 6.8, 0.8));
  }

  private addPlatform(size: THREE.Vector3, position: THREE.Vector3, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    mesh.position.copy(position);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    const bounds = new THREE.Box3().setFromObject(mesh);
    this.platforms.push({ mesh, bounds });
  }

  private addCollectible(position: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.32, 0.12, 72, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        roughness: 0.45,
        metalness: 0.2,
      })
    );
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.collectibles.push({
      mesh,
      basePosition: position.clone(),
      collected: false,
      phase: position.x * 0.13,
    });
  }

  private addFinishBell(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 3.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 })
    );
    pole.position.y = 1.7;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 })
    );
    arm.position.set(0.7, 3.05, 0);
    arm.castShadow = true;
    group.add(arm);

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.15 })
    );
    bell.position.set(1.28, 2.45, 0);
    bell.castShadow = true;
    group.add(bell);

    this.scene.add(group);
    return group;
  }
}
