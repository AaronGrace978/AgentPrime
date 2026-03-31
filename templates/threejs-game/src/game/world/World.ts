import * as THREE from 'three';

/**
 * Neutral starter scene: starfield + lights — not voxel terrain.
 * Agents should replace/extend this to match the user's game idea.
 */
export class World {
  constructor(private scene: THREE.Scene) {
    this.scene.background = new THREE.Color(0x020617);
    this.scene.fog = new THREE.FogExp2(0x050510, 0.00035);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 8000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 6000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.8,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.scene.add(stars);

    const amb = new THREE.AmbientLight(0x6688cc, 0.35);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(120, 80, 60);
    this.scene.add(sun);
    const fill = new THREE.PointLight(0x4488ff, 0.6, 2000);
    fill.position.set(-80, 40, -40);
    this.scene.add(fill);
  }
}
