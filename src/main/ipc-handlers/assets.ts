/**
 * Asset Generation IPC Handlers
 * 
 * Provides asset generation capabilities:
 * - Procedural 3D models (code generation)
 * - Dungeon/map generation
 * - Placeholder textures
 * - Free asset library references
 */

import { ipcMain } from 'electron';
import assetGenerators, { 
  ASSET_LIBRARIES, 
  DIABLO2_ASSETS,
  generateProceduralModel,
  generateDungeonCode,
  generatePlaceholderTexture,
  downloadAsset
} from '../asset-generators';

export function registerAssetHandlers(): void {
  
  // Get available asset libraries
  ipcMain.handle('assets:get-libraries', async () => {
    return {
      success: true,
      libraries: ASSET_LIBRARIES
    };
  });

  // Get Diablo 2 style asset definitions
  ipcMain.handle('assets:get-diablo2-styles', async () => {
    return {
      success: true,
      assets: DIABLO2_ASSETS
    };
  });

  // Generate procedural model code
  ipcMain.handle('assets:generate-model', async (_event, modelType: string, options: any = {}) => {
    try {
      const code = generateProceduralModel(modelType, options);
      return {
        success: true,
        code,
        modelType
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Generate dungeon/map code
  ipcMain.handle('assets:generate-dungeon', async (_event, width: number, height: number, options: any = {}) => {
    try {
      const code = generateDungeonCode(width, height, options);
      return {
        success: true,
        code,
        dimensions: { width, height }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Generate placeholder texture
  ipcMain.handle('assets:generate-texture', async (_event, width: number, height: number, color: string, pattern: string) => {
    try {
      const dataUrl = generatePlaceholderTexture(width, height, color, pattern as any);
      return {
        success: true,
        dataUrl
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Download asset from URL
  ipcMain.handle('assets:download', async (_event, url: string, targetPath: string, filename: string) => {
    try {
      const result = await downloadAsset(url, targetPath, filename);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get all available procedural model types
  ipcMain.handle('assets:get-model-types', async () => {
    return {
      success: true,
      types: [
        { id: 'humanoid', name: 'Humanoid Character', description: 'Basic human character model' },
        { id: 'zombie', name: 'Zombie', description: 'Undead enemy with hunched posture' },
        { id: 'skeleton', name: 'Skeleton', description: 'Animated skeleton with weapon' },
        { id: 'building', name: 'Building', description: 'Medieval building with roof' },
        { id: 'tree', name: 'Tree', description: 'Forest tree with foliage' }
      ]
    };
  });

  // Generate complete Diablo 2 style enemy
  ipcMain.handle('assets:generate-enemy', async (_event, enemyType: string, options: any = {}) => {
    const enemyTemplates: Record<string, string> = {
      zombie: `
class ZombieEnemy {
  constructor(scene, position) {
    this.scene = scene;
    this.mesh = this.createMesh();
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);
    
    this.health = 75;
    this.maxHealth = 75;
    this.damage = 8;
    this.speed = 0.02;
    this.attackRange = 1.5;
    this.attackCooldown = 0;
    this.isDead = false;
    
    // Create health bar
    this.healthBar = this.createHealthBar();
    this.mesh.add(this.healthBar);
  }
  
  createMesh() {
    const group = new THREE.Group();
    const skinColor = 0x556b2f;
    const clothColor = 0x4a4a4a;
    
    // Hunched torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.0, 0.5),
      new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.9 })
    );
    torso.position.y = 1.2;
    torso.rotation.x = 0.3;
    torso.castShadow = true;
    group.add(torso);
    
    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.95 })
    );
    head.position.set(0, 1.9, 0.2);
    head.castShadow = true;
    group.add(head);
    
    // Arms
    const armGeom = new THREE.CapsuleGeometry(0.08, 0.7, 4, 6);
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9 });
    
    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-0.5, 1.4, 0.3);
    leftArm.rotation.set(-0.8, 0, 0.3);
    group.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(0.5, 1.4, 0.3);
    rightArm.rotation.set(-0.8, 0, -0.3);
    group.add(rightArm);
    
    // Legs
    const legGeom = new THREE.CapsuleGeometry(0.1, 0.6, 4, 6);
    const leftLeg = new THREE.Mesh(legGeom, armMat);
    leftLeg.position.set(-0.2, 0.4, 0);
    group.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeom, armMat);
    rightLeg.position.set(0.2, 0.4, 0);
    group.add(rightLeg);
    
    return group;
  }
  
  createHealthBar() {
    const barGroup = new THREE.Group();
    barGroup.position.y = 2.5;
    
    // Background
    const bgGeom = new THREE.PlaneGeometry(1, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const bg = new THREE.Mesh(bgGeom, bgMat);
    barGroup.add(bg);
    
    // Health fill
    const fillGeom = new THREE.PlaneGeometry(0.98, 0.08);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.healthFill = new THREE.Mesh(fillGeom, fillMat);
    this.healthFill.position.z = 0.01;
    barGroup.add(this.healthFill);
    
    return barGroup;
  }
  
  update(playerPosition, deltaTime) {
    if (this.isDead) return;
    
    // Face player
    const direction = new THREE.Vector3()
      .subVectors(playerPosition, this.mesh.position)
      .normalize();
    this.mesh.lookAt(playerPosition);
    
    // Move toward player
    const distance = this.mesh.position.distanceTo(playerPosition);
    if (distance > this.attackRange) {
      this.mesh.position.add(direction.multiplyScalar(this.speed));
    }
    
    // Update health bar to face camera
    this.healthBar.lookAt(this.scene.camera?.position || new THREE.Vector3(0, 10, 10));
    
    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
  }
  
  takeDamage(amount) {
    this.health -= amount;
    
    // Update health bar
    const healthPercent = Math.max(0, this.health / this.maxHealth);
    this.healthFill.scale.x = healthPercent;
    this.healthFill.position.x = -(1 - healthPercent) * 0.49;
    
    if (this.health <= 0) {
      this.die();
    }
  }
  
  die() {
    this.isDead = true;
    
    // Death animation - fall over
    const tween = { progress: 0 };
    const animate = () => {
      tween.progress += 0.05;
      this.mesh.rotation.x = Math.PI / 2 * tween.progress;
      this.mesh.position.y = 0.5 * (1 - tween.progress);
      
      if (tween.progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Drop loot
        this.dropLoot();
        
        // Remove after delay
        setTimeout(() => {
          this.scene.remove(this.mesh);
        }, 2000);
      }
    };
    animate();
  }
  
  dropLoot() {
    // Override this method to spawn loot
    const goldAmount = 2 + Math.floor(Math.random() * 5);
    console.log('Zombie dropped ' + goldAmount + ' gold');
    // Emit event or call loot system
  }
  
  canAttack() {
    return this.attackCooldown <= 0 && !this.isDead;
  }
  
  attack() {
    this.attackCooldown = 1.5; // 1.5 second cooldown
    return this.damage;
  }
}`,

      skeleton: `
class SkeletonEnemy {
  constructor(scene, position) {
    this.scene = scene;
    this.mesh = this.createMesh();
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);
    
    this.health = 50;
    this.maxHealth = 50;
    this.damage = 12;
    this.speed = 0.035;
    this.attackRange = 2;
    this.attackCooldown = 0;
    this.isDead = false;
    
    this.healthBar = this.createHealthBar();
    this.mesh.add(this.healthBar);
  }
  
  createMesh() {
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
    
    // Eye sockets
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eyeGeom = new THREE.SphereGeometry(0.04, 4, 4);
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.08, 1.95, 0.15);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.08, 1.95, 0.15);
    group.add(rightEye);
    
    // Arms with sword
    const armGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
    const rightArm = new THREE.Mesh(armGeom, boneMat);
    rightArm.position.set(0.4, 1.3, 0);
    rightArm.rotation.z = -0.5;
    group.add(rightArm);
    
    // Sword
    const swordBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.8, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 })
    );
    swordBlade.position.set(0.6, 1.2, 0);
    swordBlade.rotation.z = -0.8;
    group.add(swordBlade);
    
    // Legs
    const legGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    const leftLeg = new THREE.Mesh(legGeom, boneMat);
    leftLeg.position.set(-0.15, 0.35, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, boneMat);
    rightLeg.position.set(0.15, 0.35, 0);
    group.add(rightLeg);
    
    return group;
  }
  
  createHealthBar() {
    const barGroup = new THREE.Group();
    barGroup.position.y = 2.5;
    
    const bgGeom = new THREE.PlaneGeometry(1, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const bg = new THREE.Mesh(bgGeom, bgMat);
    barGroup.add(bg);
    
    const fillGeom = new THREE.PlaneGeometry(0.98, 0.08);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.healthFill = new THREE.Mesh(fillGeom, fillMat);
    this.healthFill.position.z = 0.01;
    barGroup.add(this.healthFill);
    
    return barGroup;
  }
  
  update(playerPosition, deltaTime) {
    if (this.isDead) return;
    
    const direction = new THREE.Vector3()
      .subVectors(playerPosition, this.mesh.position)
      .normalize();
    this.mesh.lookAt(playerPosition);
    
    const distance = this.mesh.position.distanceTo(playerPosition);
    if (distance > this.attackRange) {
      this.mesh.position.add(direction.multiplyScalar(this.speed));
    }
    
    this.healthBar.lookAt(this.scene.camera?.position || new THREE.Vector3(0, 10, 10));
    
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
  }
  
  takeDamage(amount) {
    this.health -= amount;
    const healthPercent = Math.max(0, this.health / this.maxHealth);
    this.healthFill.scale.x = healthPercent;
    this.healthFill.position.x = -(1 - healthPercent) * 0.49;
    
    if (this.health <= 0) this.die();
  }
  
  die() {
    this.isDead = true;
    // Skeleton collapses into pile of bones
    this.mesh.children.forEach((child, i) => {
      setTimeout(() => {
        child.position.y *= 0.2;
        child.rotation.x = Math.random() * Math.PI;
        child.rotation.z = Math.random() * Math.PI;
      }, i * 50);
    });
    
    setTimeout(() => {
      this.dropLoot();
      setTimeout(() => this.scene.remove(this.mesh), 3000);
    }, 500);
  }
  
  dropLoot() {
    const goldAmount = 5 + Math.floor(Math.random() * 8);
    console.log('Skeleton dropped ' + goldAmount + ' gold');
  }
  
  canAttack() { return this.attackCooldown <= 0 && !this.isDead; }
  attack() { this.attackCooldown = 1.2; return this.damage; }
}`
    };

    try {
      const code = enemyTemplates[enemyType] || enemyTemplates.zombie;
      return {
        success: true,
        code,
        enemyType
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('🎨 Asset generation handlers registered');
}
