import * as THREE from 'three';

export class Chunk {
  public mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshLambertMaterial;
  private blocks: number[][][] = [];
  private size: number;
  private height = 32;

  constructor(
    public chunkX: number,
    public chunkZ: number,
    size: number
  ) {
    this.size = size;
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  public generate(): void {
    // Initialize blocks array
    for (let x = 0; x < this.size; x++) {
      this.blocks[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.blocks[x][y] = [];
        for (let z = 0; z < this.size; z++) {
          this.blocks[x][y][z] = 0;
        }
      }
    }

    // Simple terrain generation (height map)
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const worldX = this.chunkX * this.size + x;
        const worldZ = this.chunkZ * this.size + z;
        
        // Simple noise-based height
        const height = Math.floor(
          8 + Math.sin(worldX * 0.1) * 3 + Math.cos(worldZ * 0.1) * 3
        );

        // Fill blocks up to height
        for (let y = 0; y <= height; y++) {
          if (y === height) {
            this.blocks[x][y][z] = 2; // Grass
          } else if (y >= height - 3) {
            this.blocks[x][y][z] = 1; // Dirt
          } else {
            this.blocks[x][y][z] = 3; // Stone
          }
        }
      }
    }

    this.buildMesh();
  }

  private buildMesh(): void {
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const blockColors: { [key: number]: THREE.Color } = {
      0: new THREE.Color(0x000000), // Air
      1: new THREE.Color(0x8B4513), // Dirt
      2: new THREE.Color(0x90EE90), // Grass
      3: new THREE.Color(0x808080), // Stone
    };

    let vertexOffset = 0;

    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = 0; z < this.size; z++) {
          const block = this.blocks[x][y][z];
          if (block === 0) continue;

          const color = blockColors[block] || blockColors[1];
          
          // Check each face - only render visible faces
          // Front face
          if (z === this.size - 1 || this.blocks[x][y][z + 1] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'front', color, vertexOffset);
            vertexOffset += 4;
          }
          
          // Back face
          if (z === 0 || this.blocks[x][y][z - 1] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'back', color, vertexOffset);
            vertexOffset += 4;
          }
          
          // Top face
          if (y === this.height - 1 || this.blocks[x][y + 1][z] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'top', color, vertexOffset);
            vertexOffset += 4;
          }
          
          // Bottom face
          if (y === 0 || this.blocks[x][y - 1][z] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'bottom', color, vertexOffset);
            vertexOffset += 4;
          }
          
          // Right face
          if (x === this.size - 1 || this.blocks[x + 1][y][z] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'right', color, vertexOffset);
            vertexOffset += 4;
          }
          
          // Left face
          if (x === 0 || this.blocks[x - 1][y][z] === 0) {
            this.addFace(vertices, colors, indices, x, y, z, 'left', color, vertexOffset);
            vertexOffset += 4;
          }
        }
      }
    }

    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    this.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
  }

  private addFace(
    vertices: number[],
    colors: number[],
    indices: number[],
    x: number,
    y: number,
    z: number,
    face: string,
    color: THREE.Color,
    offset: number
  ): void {
    const positions: number[][] = [];
    
    switch (face) {
      case 'front':
        positions.push([x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]);
        break;
      case 'back':
        positions.push([x + 1, y, z], [x, y, z], [x, y + 1, z], [x + 1, y + 1, z]);
        break;
      case 'top':
        positions.push([x, y + 1, z], [x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]);
        break;
      case 'bottom':
        positions.push([x, y, z + 1], [x, y, z], [x + 1, y, z], [x + 1, y, z + 1]);
        break;
      case 'right':
        positions.push([x + 1, y, z + 1], [x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1]);
        break;
      case 'left':
        positions.push([x, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z]);
        break;
    }

    positions.forEach(pos => {
      vertices.push(...pos);
      colors.push(color.r, color.g, color.b);
    });

    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3
    );
  }

  public getBlock(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.size || y < 0 || y >= this.height || z < 0 || z >= this.size) {
      return 0;
    }
    return this.blocks[x][y][z];
  }
}

