import * as THREE from 'three';
import { rand } from './config.js?v=muqzour7';

// GPU-light particle system: a single THREE.Points with CPU-updated positions/colors.
export class Particles {
  constructor(scene, max = 600) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.size0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { },
      vertexShader: `#include <common>
attribute float size; varying vec3 vC; void main(){ vC=color; vec4 wp=modelMatrix*vec4(position,1.0); wp.x += wrBend(wp.z, cameraPosition.z); vec4 mv=viewMatrix*wp; gl_PointSize = size * (220.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.1,r); gl_FragColor=vec4(vC*a*1.8, a); }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
  }
  burst(p, count, { color = 0xffffff, color2 = null, speed = 4, spread = 1, up = 2, size = 0.5, life = 0.7, grav = -6 } = {}) {
    const c1 = new THREE.Color(color), c2 = color2 != null ? new THREE.Color(color2) : c1;
    for (let k = 0; k < count; k++) {
      const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      const i3 = i * 3;
      this.pos[i3] = p.x + rand(-spread, spread) * 0.3; this.pos[i3 + 1] = p.y + rand(-spread, spread) * 0.3; this.pos[i3 + 2] = p.z + rand(-spread, spread) * 0.3;
      const th = rand(0, Math.PI * 2), ph = rand(-1, 1); const s = speed * rand(0.4, 1.2);
      this.vel[i3] = Math.cos(th) * s * Math.sqrt(1 - ph * ph); this.vel[i3 + 1] = ph * s + up; this.vel[i3 + 2] = Math.sin(th) * s * Math.sqrt(1 - ph * ph);
      const c = Math.random() < 0.5 ? c1 : c2; this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * rand(0.6, 1.2); this.grav[i] = grav; this.size0[i] = size * rand(0.6, 1.4); this.size[i] = this.size0[i];
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { // swap-remove
        const j = --this.n; if (i === j) break;
        for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
        this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.grav[i] = this.grav[j]; this.size0[i] = this.size0[j]; this.size[i] = this.size[j]; i--; continue;
      }
      const i3 = i * 3; this.life[i] -= dt;
      this.vel[i3 + 1] += this.grav[i] * dt; this.vel[i3] *= 0.98; this.vel[i3 + 2] *= 0.98;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]); this.size[i] = this.size0[i] * (0.3 + 0.7 * t);
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
  }
}

// Mesh debris (rock chunks, wood planks, goo blobs) via InstancedMesh pools.
export class Debris {
  constructor(scene, max = 80) {
    this.max = max; this.items = [];
    const geo = new THREE.DodecahedronGeometry(0.28, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: .9 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  burst(p, count, color, { speed = 6, up = 5, scale = 1 } = {}) {
    for (let k = 0; k < count; k++) {
      if (this.items.length >= this.max) this.items.shift();
      const th = rand(0, Math.PI * 2);
      this.items.push({ p: p.clone().add(new THREE.Vector3(rand(-.5, .5), rand(0, 1), rand(-.5, .5))), v: new THREE.Vector3(Math.cos(th) * speed * rand(.3, 1), up * rand(.4, 1.2), Math.sin(th) * speed * rand(.3, 1)), r: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)), rv: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(.7, 1.2), s: scale * rand(.5, 1.4), c: new THREE.Color(color).offsetHSL(0, 0, rand(-.08, .08)) });
    }
  }
  update(dt) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.life -= dt; if (it.life <= 0) { this.items.splice(i, 1); continue; }
      it.v.y -= 22 * dt; it.p.addScaledVector(it.v, dt); it.r.addScaledVector(it.rv, dt);
      const s = it.s * Math.min(1, it.life * 3);
      this._e.set(it.r.x, it.r.y, it.r.z); this._q.setFromEuler(this._e); this._s.set(s, s, s);
      this._m.compose(it.p, this._q, this._s); this.mesh.setMatrixAt(n, this._m); this.mesh.setColorAt(n, it.c); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Shake {
  constructor() { this.t = 0; this.amp = 0; this.off = new THREE.Vector3(); }
  add(a, dur = 0.3) { this.amp = Math.max(this.amp, a); this.t = Math.max(this.t, dur); }
  update(dt) {
    if (this.t > 0) { this.t -= dt; const k = this.amp * Math.min(1, this.t * 4); this.off.set(rand(-k, k), rand(-k, k), rand(-k, k) * .5); if (this.t <= 0) this.amp = 0; }
    else this.off.set(0, 0, 0);
  }
}

// Floating "+10" style texts projected from 3D.
export class Floaters {
  constructor(container, camera) { this.el = container; this.cam = camera; this._v = new THREE.Vector3(); }
  spawn(pos, text, cls = '') {
    this._v.copy(pos).project(this.cam);
    if (this._v.z > 1) return;
    const x = (this._v.x * .5 + .5) * window.innerWidth, y = (-this._v.y * .5 + .5) * window.innerHeight;
    const d = document.createElement('div'); d.className = 'float ' + cls; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px';
    this.el.appendChild(d); setTimeout(() => d.remove(), 950);
  }
}
