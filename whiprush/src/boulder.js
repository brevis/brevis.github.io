import * as THREE from 'three';
import { rockBlob, perFaceColors } from './geo.js?v=mur08zc2';
import { damp, rand } from './config.js?v=mur08zc2';

// Chaser: a giant boulder that rolls up behind the player after a mistake. A second mistake while it is close = crushed.
export class Boulder {
  constructor(scene, particles) {
    this.particles = particles; this.R = 2.4;
    const geo = perFaceColors(rockBlob(2, 0.28), { h: 0.72, s: 0.22, l: 0.26, hVar: 0.02, sVar: 0.05, lVar: 0.08 });
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd8d0ff, vertexColors: true, roughness: .98, metalness: 0, flatShading: true }));
    this.mesh.scale.setScalar(this.R); this.mesh.castShadow = true; scene.add(this.mesh);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2 }));
    eye.position.set(0, 0.25, -0.95); this.mesh.add(eye);
    this.dist = 50; this.target = 50; this.alertT = 0; this.roll = 0; this.visible = false; this.dustT = 0;
  }
  reset() { this.dist = 50; this.target = 50; this.alertT = 0; }
  alert(sec = 6.5) { this.alertT = sec; this.target = 6.5; }
  get near() { return this.dist < 10; }
  update(dt, p, world, speed, active) {
    if (!active) { this.mesh.visible = false; return; }
    if (this.alertT > 0) { this.alertT -= dt; if (this.alertT <= 0) this.target = 50; }
    this.dist = damp(this.dist, this.target, this.target < this.dist ? 2.2 : 0.8, dt);
    const z = p.z + this.dist; const y = world.heightAt(z) + this.R * 0.9;
    this.mesh.position.set(damp(this.mesh.position.x, p.x * 0.4, 3, dt), y, z);
    this.roll -= speed * dt / this.R; this.mesh.rotation.x = this.roll;
    this.mesh.visible = this.dist < 45;
    if (this.near && this.particles) { this.dustT -= dt; if (this.dustT <= 0) { this.dustT = 0.06; this.particles.burst(new THREE.Vector3(this.mesh.position.x + rand(-1.5, 1.5), y - this.R * 0.8, z + rand(-1, 1)), 3, { color: 0xc9b9e8, color2: 0x8a74b8, speed: 2.5, up: 2.5, size: 1.2, life: 0.7, grav: -2, spread: 2 }); } }
  }
}
