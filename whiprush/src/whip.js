import * as THREE from 'three';
import { lerp, clamp } from './config.js?v=muqz8flb';

const N = 40, R = 6;
// side: lateral bulge (+ = right of the throw direction), up: vertical arc, wave: travelling ripple, glow, tip size
const STYLE = {
  fore: { side: 1.5, up: 0.7, wave: 1.0, glow: 1.0, tip: 1 },
  back: { side: -1.6, up: 0.4, wave: 1.0, glow: 1.0, tip: 1 },
  over: { side: 0.2, up: 3.2, wave: 0.6, glow: 1.6, tip: 1.4 },
  'side-l': { side: 1.8, up: 0.5, wave: 0.8, glow: 1.1, tip: 1.1 },
  'side-r': { side: -1.8, up: 0.5, wave: 0.8, glow: 1.1, tip: 1.1 },
  low: { side: 0.6, up: -0.4, wave: 1.3, glow: 1.1, tip: 1.1 },
  down: { side: 0.5, up: 0.2, wave: 0.8, glow: 1.4, tip: 1.3 },
  slam: { side: 0.3, up: 1.6, wave: 0.6, glow: 1.6, tip: 1.3 },
};
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
  // style: fore | back | over | side-l | side-r | low | spin | down | slam
  crack(target, style = 'fore', spinFrom = 0) {
    this.target.copy(target); this.crackT = 0; this.style = style; this.spinA0 = spinFrom;
    this.crackDur = { fore: 0.28, back: 0.28, over: 0.38, 'side-l': 0.3, 'side-r': 0.3, low: 0.32, spin: 0.46, down: 0.26, slam: 0.3 }[style] || 0.3;
    this.mode = 'idle'; this.setMode('crack');
  }
  setCharge(k) { this.charge = k; }
  grab(hookPos) { this.hook.copy(hookPos); this.setMode('swing'); }
  release() { this.setMode('idle'); }

  update(dt, hand, time, speed, playerState) {
    this._hand.copy(hand);
    if (this.mode === 'crack') { this.crackT += dt; if (this.crackT >= this.crackDur) this.setMode(playerState === 'swing' ? 'swing' : 'idle'); }
    else if (this.mode === 'swing' && playerState !== 'swing') this.setMode('idle'); // landed: let go of the hook
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
      const ch = this.charge || 0;
      this.mat.emissiveIntensity = lerp(this.mat.emissiveIntensity, 0.35 + ch * 2.2 + (ch >= 1 ? Math.sin(time * 30) * 0.6 : 0), dt * 10);
      this.tip.visible = ch > 0.05; if (ch > 0.05) { this.tip.position.copy(c[nc - 1]); const ts = 0.5 + ch * 1.3; this.tip.scale.set(ts, ts, 1); }
    } else if (this.mode === 'crack' && this.style === 'spin') {
      // 360-degree horizontal lash around the hero
      const u = clamp(this.crackT / this.crackDur, 0, 1);
      const ext = u < 0.18 ? u / 0.18 : u > 0.82 ? (1 - u) / 0.18 : 1;
      const a = this.spinA0 + u * Math.PI * 2.15; const R = 5.0 * ext; const K = 12;
      for (let k = 0; k <= K; k++) { const t = k / K; const ang = a - (1 - t) * 1.4; const r = R * t; c[nc++].set(hand.x + Math.cos(ang) * r, hand.y - 0.55 * t + Math.sin(t * Math.PI) * 0.25, hand.z + Math.sin(ang) * r); }
      this.mat.emissiveIntensity = 2.4 * (1 - u * 0.6);
      this.tip.visible = ext > 0.3; this.tip.position.copy(c[nc - 1]); this.tip.scale.set(1.6, 1.6, 1);
    } else if (this.mode === 'crack') {
      const S = STYLE[this.style] || STYLE.fore;
      const u = clamp(this.crackT / this.crackDur, 0, 1);
      const ext = u < 0.3 ? Math.pow(u / 0.3, 0.6) : 1 - Math.pow((u - 0.3) / 0.7, 1.6);
      const tip = this._tmp.copy(this.target).sub(hand).multiplyScalar(ext).add(hand);
      const dir = this._t.copy(this.target).sub(hand).normalize();
      const side = this._b.set(-dir.z, 0, dir.x).normalize();
      const K = 12; const bend = (1 - ext * 0.55);
      for (let k = 0; k <= K; k++) {
        const t = k / K; const p = c[nc++]; p.lerpVectors(hand, tip, t);
        const bulge = Math.sin(t * Math.PI) * bend;
        const amp = (S.wave * 0.35 + (1 - ext) * S.wave) * Math.sin(t * Math.PI);
        const wave = Math.sin(t * Math.PI * 2.2 - u * 16) * amp;
        p.addScaledVector(side, wave * 0.6 + bulge * S.side);
        p.y += bulge * S.up + wave * 0.4;
      }
      this.mat.emissiveIntensity = u < 0.4 ? S.glow : lerp(S.glow, 0.35, (u - 0.4) / 0.6);
      this.tip.visible = ext > 0.6; this.tip.position.copy(tip); const ts = (0.6 + ext * 0.8) * S.tip; this.tip.scale.set(ts, ts, 1);
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
