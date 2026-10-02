import * as THREE from 'three';
import { lerp, clamp } from './config.js';

const N = 40, R = 6;
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,230,150,0.8)'); grd.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Whip {
  constructor(scene) {
    this.mode = 'idle'; this.blend = 1; this.crackT = 1; this.crackDur = 0.34;
    this.target = new THREE.Vector3(); this.hook = new THREE.Vector3();
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.prev = Array.from({ length: N }, () => new THREE.Vector3());
    this.out = Array.from({ length: N }, () => new THREE.Vector3());
    this.ctrl = []; for (let i = 0; i < 24; i++) this.ctrl.push(new THREE.Vector3());
    this.curve = new THREE.CatmullRomCurve3([], false, 'centripetal', 0.5);
    // tube geometry
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(N * R * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    const idx = []; for (let i = 0; i < N - 1; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R; idx.push(a, c, b, b, c, d); }
    g.setIndex(idx); g.computeVertexNormals();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xc9924a, emissive: 0xffc24a, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.1 });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; scene.add(this.mesh);
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tip.scale.set(0.8, 0.8, 1); this.tip.visible = false; scene.add(this.tip);
    this._n = new THREE.Vector3(); this._b = new THREE.Vector3(); this._t = new THREE.Vector3(); this._tmp = new THREE.Vector3();
    this._hand = new THREE.Vector3(); this._lastHand = new THREE.Vector3();
  }
  setMode(mode) { if (mode === this.mode) return; for (let i = 0; i < N; i++) this.prev[i].copy(this.out[i]); this.blend = 0; this.mode = mode; }
  crack(target) { this.target.copy(target); this.crackT = 0; this.setMode('crack'); }
  grab(hookPos) { this.hook.copy(hookPos); this.setMode('swing'); }
  release() { this.setMode('idle'); }

  update(dt, hand, time, speed, playerState) {
    this._hand.copy(hand);
    if (this.mode === 'crack') { this.crackT += dt; if (this.crackT >= this.crackDur) this.setMode(playerState === 'swing' ? 'swing' : 'idle'); }
    this.blend = Math.min(1, this.blend + dt / 0.12);
    const c = this.ctrl; let nc = 0;
    if (this.mode === 'idle' || (this.mode === 'crack' && false)) {
      // lasso twirl above/behind the head
      const spin = time * 7.5; const Rr = 1.35;
      const cx = hand.x + 0.2, cy = hand.y + 0.55, cz = hand.z + 0.35;
      c[nc++].set(hand.x, hand.y, hand.z);
      c[nc++].set(hand.x + 0.15, hand.y + 0.35, hand.z + 0.25);
      for (let k = 0; k <= 10; k++) {
        const a = spin + k / 10 * Math.PI * 2;
        const wob = Math.sin(a * 2 + time * 3) * 0.22;
        c[nc++].set(cx + Math.cos(a) * Rr, cy + Math.sin(a) * 0.55 + wob, cz + Math.sin(a) * Rr * 0.8);
      }
      // trailing tail
      const a2 = spin + Math.PI * 2 + 0.6; c[nc++].set(cx + Math.cos(a2) * Rr * 0.8, cy - 0.3, cz + Math.sin(a2) * Rr * 0.9 + 0.6);
      this.mat.emissiveIntensity = lerp(this.mat.emissiveIntensity, 0.35, dt * 8);
      this.tip.visible = false;
    } else if (this.mode === 'crack') {
      const u = clamp(this.crackT / this.crackDur, 0, 1);
      const ext = u < 0.3 ? Math.pow(u / 0.3, 0.6) : 1 - Math.pow((u - 0.3) / 0.7, 1.6);
      const tip = this._tmp.copy(this.target).sub(hand).multiplyScalar(ext).add(hand);
      const dir = this._t.copy(this.target).sub(hand).normalize();
      const side = this._b.set(-dir.z, 0, dir.x).normalize();
      const K = 12;
      for (let k = 0; k <= K; k++) {
        const t = k / K; const p = c[nc++]; p.lerpVectors(hand, tip, t);
        const amp = (0.35 + (1 - ext) * 1.1) * Math.sin(t * Math.PI);
        const wave = Math.sin(t * Math.PI * 2.2 - u * 16) * amp;
        p.addScaledVector(side, wave * 0.7); p.y += Math.sin(t * Math.PI) * (0.9 * (1 - ext * 0.6)) + wave * 0.45;
      }
      this.mat.emissiveIntensity = u < 0.4 ? 1.0 : lerp(1.0, 0.35, (u - 0.4) / 0.6);
      this.tip.visible = ext > 0.6; this.tip.position.copy(tip); const ts = 0.6 + ext * 0.8; this.tip.scale.set(ts, ts, 1);
    } else if (this.mode === 'swing') {
      const K = 12; const sag = 0.35;
      for (let k = 0; k <= K; k++) {
        const t = k / K; const p = c[nc++]; p.lerpVectors(hand, this.hook, t);
        p.y -= Math.sin(t * Math.PI) * sag; p.x += Math.sin(t * Math.PI * 2 + time * 12) * 0.08 * (1 - t);
      }
      this.mat.emissiveIntensity = lerp(this.mat.emissiveIntensity, 1.4, dt * 8);
      this.tip.visible = true; this.tip.position.copy(this.hook); this.tip.scale.set(1.2, 1.2, 1);
    }
    this.curve.points = c.slice(0, nc);
    const pts = this.curve.getPoints(N - 1);
    for (let i = 0; i < N; i++) { this.pts[i].copy(pts[i] || pts[pts.length - 1]); }
    // blend from previous shape
    for (let i = 0; i < N; i++) {
      if (this.blend < 1) this.out[i].lerpVectors(this.prev[i], this.pts[i], this.blend); else this.out[i].copy(this.pts[i]);
    }
    this._buildTube();
  }
  _buildTube() {
    const P = this.out; const pos = this.posArr;
    let n = this._n, b = this._b, t = this._t;
    // initial frame
    t.subVectors(P[1], P[0]).normalize();
    n.set(0, 1, 0); if (Math.abs(t.dot(n)) > 0.9) n.set(1, 0, 0);
    b.crossVectors(t, n).normalize(); n.crossVectors(b, t).normalize();
    for (let i = 0; i < N; i++) {
      if (i > 0) {
        const nt = this._tmp.subVectors(P[Math.min(N - 1, i + 1)], P[i - 1]).normalize();
        // parallel transport: rotate n by rotation from t to nt
        const axis = new THREE.Vector3().crossVectors(t, nt); const s = axis.length();
        if (s > 1e-4) { axis.normalize(); const ang = Math.asin(clamp(s, -1, 1)); n.applyAxisAngle(axis, ang); }
        t.copy(nt); b.crossVectors(t, n).normalize(); n.crossVectors(b, t).normalize();
      }
      const r = lerp(0.1, 0.028, i / (N - 1));
      for (let j = 0; j < R; j++) {
        const a = j / R * Math.PI * 2; const idx = (i * R + j) * 3;
        pos[idx] = P[i].x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r;
        pos[idx + 1] = P[i].y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r;
        pos[idx + 2] = P[i].z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r;
      }
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals();
  }
}
