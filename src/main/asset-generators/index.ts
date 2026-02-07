/**
 * Asset Generation System for AgentPrime
 * 
 * Enables generation of game assets:
 * - 3D models (procedural or AI-generated)
 * - Textures (AI-generated)
 * - Sprites (AI-generated)
 * - Audio (placeholder or AI-generated)
 * 
 * Also provides access to free asset libraries.
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Asset library sources (free, CC0 licensed)
export const ASSET_LIBRARIES = {
  models: {
    polyPizza: 'https://poly.pizza',
    kenney: 'https://kenney.nl/assets',
    sketchfab: 'https://sketchfab.com/features/free-3d-models'
  },
  textures: {
    polyhaven: 'https://polyhaven.com/textures',
    ambientcg: 'https://ambientcg.com',
  },
  sprites: {
    openGameArt: 'https://opengameart.org',
    kenney: 'https://kenney.nl/assets',
    itchIo: 'https://itch.io/game-assets/free'
  },
  audio: {
    freesound: 'https://freesound.org',
    kenney: 'https://kenney.nl/assets'
  }
};

// Diablo 2 style asset definitions
export const DIABLO2_ASSETS = {
  characters: {
    barbarian: {
      colors: ['#8b4513', '#cd853f', '#d2691e'],
      description: 'Muscular warrior with heavy armor'
    },
    sorceress: {
      colors: ['#4169e1', '#6a5acd', '#9370db'],
      description: 'Robed mage with glowing staff'
    },
    paladin: {
      colors: ['#ffd700', '#daa520', '#b8860b'],
      description: 'Armored holy knight with shield'
    },
    necromancer: {
      colors: ['#2f4f4f', '#556b2f', '#8b0000'],
      description: 'Dark robed summoner'
    },
    amazon: {
      colors: ['#228b22', '#32cd32', '#8b4513'],
      description: 'Agile warrior with spear/bow'
    }
  },
  enemies: {
    zombie: {
      colors: ['#556b2f', '#6b8e23', '#8fbc8f'],
      description: 'Slow undead creature'
    },
    skeleton: {
      colors: ['#f5f5dc', '#d3d3d3', '#a9a9a9'],
      description: 'Animated bones with weapon'
    },
    fallen: {
      colors: ['#8b0000', '#b22222', '#cd5c5c'],
      description: 'Small demon creature'
    },
    goatman: {
      colors: ['#8b4513', '#a0522d', '#d2691e'],
      description: 'Tall demonic beast'
    }
  },
  environment: {
    grass: '#3d5c3d',
    dirt: '#8b7355',
    stone: '#696969',
    blood: '#8b0000',
    gold: '#ffd700'
  }
};

/**
 * Generate procedural 3D model code for Three.js
 */
export function generateProceduralModel(type: string, options: any = {}): string {
  const templates: Record<string, string> = {
    humanoid: `
function createHumanoid(options = {}) {
  const group = new THREE.Group();
  const color = options.color || 0x8b4513;
  const material = new THREE.MeshStandardMaterial({ 
    color, 
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Torso
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.4),
    material
  );
  torso.position.y = 1.4;
  torso.castShadow = true;
  group.add(torso);
  
  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.7 })
  );
  head.position.y = 2.2;
  head.castShadow = true;
  group.add(head);
  
  // Arms
  const armGeom = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
  const leftArm = new THREE.Mesh(armGeom, material);
  leftArm.position.set(-0.55, 1.5, 0);
  leftArm.rotation.z = 0.2;
  leftArm.castShadow = true;
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeom, material);
  rightArm.position.set(0.55, 1.5, 0);
  rightArm.rotation.z = -0.2;
  rightArm.castShadow = true;
  group.add(rightArm);
  
  // Legs
  const legGeom = new THREE.CapsuleGeometry(0.12, 0.7, 4, 8);
  const leftLeg = new THREE.Mesh(legGeom, material);
  leftLeg.position.set(-0.2, 0.5, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeom, material);
  rightLeg.position.set(0.2, 0.5, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);
  
  return group;
}`,

    zombie: `
function createZombie() {
  const group = new THREE.Group();
  const skinColor = 0x556b2f; // Greenish dead skin
  const clothColor = 0x4a4a4a; // Tattered clothes
  
  // Hunched torso
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.5),
    new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.9 })
  );
  torso.position.y = 1.2;
  torso.rotation.x = 0.3; // Hunched forward
  torso.castShadow = true;
  group.add(torso);
  
  // Decomposing head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.95 })
  );
  head.position.set(0, 1.9, 0.2);
  head.scale.set(1, 0.9, 1); // Slightly squashed
  head.castShadow = true;
  group.add(head);
  
  // Reaching arms
  const armGeom = new THREE.CapsuleGeometry(0.08, 0.7, 4, 6);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9 });
  
  const leftArm = new THREE.Mesh(armGeom, armMat);
  leftArm.position.set(-0.5, 1.4, 0.3);
  leftArm.rotation.set(-0.8, 0, 0.3);
  leftArm.castShadow = true;
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeom, armMat);
  rightArm.position.set(0.5, 1.4, 0.3);
  rightArm.rotation.set(-0.8, 0, -0.3);
  rightArm.castShadow = true;
  group.add(rightArm);
  
  // Shambling legs
  const legGeom = new THREE.CapsuleGeometry(0.1, 0.6, 4, 6);
  const leftLeg = new THREE.Mesh(legGeom, armMat);
  leftLeg.position.set(-0.2, 0.4, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeom, armMat);
  rightLeg.position.set(0.2, 0.4, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);
  
  return group;
}`,

    skeleton: `
function createSkeleton() {
  const group = new THREE.Group();
  const boneColor = 0xf5f5dc;
  const boneMat = new THREE.MeshStandardMaterial({ 
    color: boneColor, 
    roughness: 0.6,
    metalness: 0.1
  });
  
  // Ribcage
  const ribcage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 0.8, 8),
    boneMat
  );
  ribcage.position.y = 1.3;
  ribcage.castShadow = true;
  group.add(ribcage);
  
  // Skull
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    boneMat
  );
  skull.position.y = 1.9;
  skull.scale.set(1, 1.2, 1);
  skull.castShadow = true;
  group.add(skull);
  
  // Eye sockets (dark)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeGeom = new THREE.SphereGeometry(0.04, 4, 4);
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(-0.08, 1.95, 0.15);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(0.08, 1.95, 0.15);
  group.add(rightEye);
  
  // Spine
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6),
    boneMat
  );
  spine.position.y = 0.8;
  spine.castShadow = true;
  group.add(spine);
  
  // Arms
  const armGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
  const leftArm = new THREE.Mesh(armGeom, boneMat);
  leftArm.position.set(-0.4, 1.3, 0);
  leftArm.rotation.z = 0.5;
  leftArm.castShadow = true;
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeom, boneMat);
  rightArm.position.set(0.4, 1.3, 0);
  rightArm.rotation.z = -0.5;
  rightArm.castShadow = true;
  group.add(rightArm);
  
  // Legs
  const legGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
  const leftLeg = new THREE.Mesh(legGeom, boneMat);
  leftLeg.position.set(-0.15, 0.35, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeom, boneMat);
  rightLeg.position.set(0.15, 0.35, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);
  
  // Weapon (sword)
  const swordBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.8, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 })
  );
  swordBlade.position.set(0.6, 1.2, 0);
  swordBlade.rotation.z = -0.8;
  swordBlade.castShadow = true;
  group.add(swordBlade);
  
  return group;
}`,

    building: `
function createBuilding(width = 5, depth = 5, height = 4, options = {}) {
  const group = new THREE.Group();
  const wallColor = options.wallColor || 0x8b7355;
  const roofColor = options.roofColor || 0x654321;
  
  // Walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 })
  );
  walls.position.y = height / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);
  
  // Roof (pyramid)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.8, height * 0.4, 4),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 })
  );
  roof.position.y = height + (height * 0.2);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  
  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.3, height * 0.5, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 })
  );
  door.position.set(0, height * 0.25, depth / 2 + 0.05);
  group.add(door);
  
  return group;
}`,

    tree: `
function createTree(options = {}) {
  const group = new THREE.Group();
  const trunkHeight = options.trunkHeight || 2;
  const foliageSize = options.foliageSize || 2;
  
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, trunkHeight, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 })
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  group.add(trunk);
  
  // Foliage (multiple spheres for organic look)
  const foliageMat = new THREE.MeshStandardMaterial({ 
    color: 0x228b22, 
    roughness: 0.8 
  });
  
  const mainFoliage = new THREE.Mesh(
    new THREE.SphereGeometry(foliageSize * 0.6, 8, 8),
    foliageMat
  );
  mainFoliage.position.y = trunkHeight + foliageSize * 0.3;
  mainFoliage.castShadow = true;
  group.add(mainFoliage);
  
  // Additional foliage clusters
  for (let i = 0; i < 3; i++) {
    const cluster = new THREE.Mesh(
      new THREE.SphereGeometry(foliageSize * 0.4, 6, 6),
      foliageMat
    );
    const angle = (i / 3) * Math.PI * 2;
    cluster.position.set(
      Math.cos(angle) * foliageSize * 0.4,
      trunkHeight + foliageSize * 0.1,
      Math.sin(angle) * foliageSize * 0.4
    );
    cluster.castShadow = true;
    group.add(cluster);
  }
  
  return group;
}`
  };

  return templates[type] || templates.humanoid;
}

/**
 * Generate dungeon/map layout code
 */
export function generateDungeonCode(width: number, height: number, options: any = {}): string {
  return `
function generateDungeon(width = ${width}, height = ${height}) {
  const tiles = [];
  const rooms = [];
  
  // Initialize with walls
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = 1; // 1 = wall
    }
  }
  
  // Generate rooms
  const roomCount = Math.floor((width * height) / 100);
  for (let i = 0; i < roomCount; i++) {
    const roomWidth = 4 + Math.floor(Math.random() * 6);
    const roomHeight = 4 + Math.floor(Math.random() * 6);
    const roomX = 1 + Math.floor(Math.random() * (width - roomWidth - 2));
    const roomY = 1 + Math.floor(Math.random() * (height - roomHeight - 2));
    
    // Check if room overlaps
    let overlaps = false;
    for (const room of rooms) {
      if (roomX < room.x + room.width + 1 && roomX + roomWidth + 1 > room.x &&
          roomY < room.y + room.height + 1 && roomY + roomHeight + 1 > room.y) {
        overlaps = true;
        break;
      }
    }
    
    if (!overlaps) {
      rooms.push({ x: roomX, y: roomY, width: roomWidth, height: roomHeight });
      
      // Carve room
      for (let y = roomY; y < roomY + roomHeight; y++) {
        for (let x = roomX; x < roomX + roomWidth; x++) {
          tiles[y][x] = 0; // 0 = floor
        }
      }
    }
  }
  
  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const prevRoom = rooms[i - 1];
    const currRoom = rooms[i];
    
    const prevCenterX = Math.floor(prevRoom.x + prevRoom.width / 2);
    const prevCenterY = Math.floor(prevRoom.y + prevRoom.height / 2);
    const currCenterX = Math.floor(currRoom.x + currRoom.width / 2);
    const currCenterY = Math.floor(currRoom.y + currRoom.height / 2);
    
    // Horizontal corridor
    for (let x = Math.min(prevCenterX, currCenterX); x <= Math.max(prevCenterX, currCenterX); x++) {
      tiles[prevCenterY][x] = 0;
    }
    
    // Vertical corridor
    for (let y = Math.min(prevCenterY, currCenterY); y <= Math.max(prevCenterY, currCenterY); y++) {
      tiles[y][currCenterX] = 0;
    }
  }
  
  return { tiles, rooms };
}

function renderDungeon(dungeon, scene) {
  const { tiles, rooms } = dungeon;
  const tileSize = 2;
  
  // Floor material
  const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x4a4a4a, 
    roughness: 0.9 
  });
  
  // Wall material
  const wallMat = new THREE.MeshStandardMaterial({ 
    color: 0x2a2a2a, 
    roughness: 0.8 
  });
  
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === 0) {
        // Floor tile
        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize, 0.2, tileSize),
          floorMat
        );
        floor.position.set(x * tileSize, 0, y * tileSize);
        floor.receiveShadow = true;
        scene.add(floor);
      } else {
        // Wall
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize, 3, tileSize),
          wallMat
        );
        wall.position.set(x * tileSize, 1.5, y * tileSize);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
      }
    }
  }
  
  // Add torches in rooms
  for (const room of rooms) {
    // Torch at room center
    const torch = createTorch();
    torch.position.set(
      (room.x + room.width / 2) * tileSize,
      0,
      (room.y + room.height / 2) * tileSize
    );
    scene.add(torch);
  }
}

function createTorch() {
  const group = new THREE.Group();
  
  // Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  pole.position.y = 0.75;
  group.add(pole);
  
  // Flame (emissive)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.4, 8),
    new THREE.MeshStandardMaterial({ 
      color: 0xff6600, 
      emissive: 0xff4400,
      emissiveIntensity: 2
    })
  );
  flame.position.y = 1.7;
  group.add(flame);
  
  // Point light
  const light = new THREE.PointLight(0xff6600, 1, 10);
  light.position.y = 1.7;
  light.castShadow = true;
  group.add(light);
  
  return group;
}`;
}

/**
 * Download asset from URL and save to project folder
 */
export async function downloadAsset(
  url: string, 
  targetPath: string, 
  filename: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const fullPath = path.join(targetPath, filename);
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, Buffer.from(response.data));
    
    return { success: true, path: fullPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate placeholder texture as data URL
 */
export function generatePlaceholderTexture(
  width: number, 
  height: number, 
  color: string,
  pattern: 'solid' | 'checkerboard' | 'noise' = 'solid'
): string {
  // This generates a simple SVG data URL for textures
  if (pattern === 'solid') {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect fill="${color}" width="100%" height="100%"/></svg>`;
  } else if (pattern === 'checkerboard') {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><pattern id="c" width="10" height="10" patternUnits="userSpaceOnUse"><rect fill="${color}" width="5" height="5"/><rect fill="${color}88" x="5" y="5" width="5" height="5"/></pattern><rect fill="url(%23c)" width="100%" height="100%"/></svg>`;
  }
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect fill="${color}" width="100%" height="100%"/></svg>`;
}

export default {
  ASSET_LIBRARIES,
  DIABLO2_ASSETS,
  generateProceduralModel,
  generateDungeonCode,
  downloadAsset,
  generatePlaceholderTexture
};
