import * as THREE from 'three';
import { Chunk } from './Chunk';

export class World {
  private chunks: Map<string, Chunk> = new Map();
  private scene: THREE.Scene;
  private chunkSize = 16;
  private renderDistance = 3;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.generateWorld();
  }

  private generateWorld(): void {
    // Generate chunks around origin
    for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
      for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
        this.generateChunk(x, z);
      }
    }
  }

  private generateChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    
    if (this.chunks.has(key)) {
      return;
    }

    const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
    chunk.generate();
    chunk.mesh.position.set(
      chunkX * this.chunkSize,
      0,
      chunkZ * this.chunkSize
    );
    
    this.scene.add(chunk.mesh);
    this.chunks.set(key, chunk);
  }

  public getBlock(x: number, y: number, z: number): number {
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkZ = Math.floor(z / this.chunkSize);
    const key = `${chunkX},${chunkZ}`;
    
    const chunk = this.chunks.get(key);
    if (!chunk) return 0;
    
    const localX = x - chunkX * this.chunkSize;
    const localZ = z - chunkZ * this.chunkSize;
    
    return chunk.getBlock(localX, y, localZ);
  }
}

