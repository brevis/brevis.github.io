import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LANE_W, GRAVITY, JUMP_V, damp, clamp, lerp } from './config.js';

const C = {
  skin: 0xe9b58e, hair: 0x3a2314, hat: 0x7a5230, hatBand: 0x9b3328, jacket: 0x6b4126, jacketDark: 0x4e2d18,
  shirt: 0xeadcb8, jeans: 0x3e5fa3, boots: 0x3f2616, belt: 0x2b1a0e, buckle: 0xe3b23c, handle: 0x5c3a1e,
};
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = false; return o; }

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this._build();
    // state
    this.lane = 0; this.x = 0; this.y = 0; this.z = 0; this.vy = 0;
    this.state = 'run'; // run | jump | swing | fall | dead | stumble
    this.phase = 0; this.stateT = 0; this.attackT = 1; this.lean = 0;
    this.swing = null; // { p0, p1, p2, dur, t }
    this.shield = false; this.shieldMesh = null; this.hurtT = 0;
    this._buildShield();
  }
  _build() {
    const b = this.body;
    const RB = (w, h, d, r = 0.1, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
    const smooth = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: 0, ...extra });
    const mJacket = smooth(C.jacket), mJacketDark = smooth(C.jacketDark), mSkin = smooth(C.skin, { roughness: .6 }), mShirt = smooth(C.shirt), mJeans = smooth(C.jeans), mBoots = smooth(C.boots, { roughness: .55 }), mHat = smooth(C.hat), mBand = smooth(C.hatBand), mHair = smooth(C.hair), mBelt = smooth(C.belt), mGold = smooth(C.buckle, { metalness: .7, roughness: .3 });
    // torso
    b.add(mesh(RB(0.68, 0.64, 0.44, 0.15), mJacket, 0, 1.16, 0));
    b.add(mesh(RB(0.3, 0.54, 0.12, 0.05, 2), mShirt, 0, 1.13, -0.2));
    const lapL = mesh(RB(0.17, 0.3, 0.07, 0.03, 2), mJacketDark, -0.17, 1.33, -0.22); lapL.rotation.z = 0.55; b.add(lapL);
    const lapR = lapL.clone(); lapR.position.x = 0.17; lapR.rotation.z = -0.55; b.add(lapR);
    b.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), mJacket, -0.37, 1.4, 0)); b.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), mJacket, 0.37, 1.4, 0));
    b.add(mesh(RB(0.7, 0.11, 0.46, 0.03, 2), mBelt, 0, 0.86, 0));
    b.add(mesh(RB(0.14, 0.11, 0.04, 0.02, 2), mGold, 0, 0.86, -0.23));
    b.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.14, 12), mSkin, 0, 1.5, 0));
    // head
    const head = new THREE.Group(); head.position.y = 1.86; b.add(head); this.head = head;
    head.add(mesh(new THREE.SphereGeometry(0.36, 24, 18), mSkin));
    const hair = mesh(new THREE.SphereGeometry(0.375, 20, 14), mHair, 0, 0.07, 0.05); hair.scale.set(1, 0.78, 1); head.add(hair);
    const side = mesh(new THREE.SphereGeometry(0.12, 10, 8), mHair, 0.3, -0.05, 0.05); side.scale.set(0.5, 1, 0.8); head.add(side); const side2 = side.clone(); side2.position.x = -0.3; head.add(side2);
    const mEye = smooth(0xffffff, { roughness: .3 }), mPupil = smooth(0x1b1b2a, { roughness: .3 });
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.065, 10, 8), mEye, sx * 0.13, 0.02, -0.31));
      head.add(mesh(new THREE.SphereGeometry(0.035, 8, 8), mPupil, sx * 0.13, 0.02, -0.365));
      const brow = mesh(RB(0.13, 0.035, 0.03, 0.01, 1), mHair, sx * 0.13, 0.13, -0.33); brow.rotation.z = -sx * 0.35; head.add(brow);
    }
    head.add(mesh(new THREE.SphereGeometry(0.045, 8, 8), mSkin, 0, -0.05, -0.36));
    const mouth = mesh(RB(0.12, 0.035, 0.03, 0.01, 1), smooth(0x7a2e2e), 0, -0.16, -0.33); head.add(mouth);
    // hat
    const hat = new THREE.Group(); hat.position.y = 0.25; head.add(hat);
    hat.add(mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.3, 20), mHat, 0, 0.15, 0));
    const top = mesh(new THREE.SphereGeometry(0.33, 20, 12), mHat, 0, 0.3, 0); top.scale.set(1, 0.45, 1); hat.add(top);
    const brimPts = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.34, 0), new THREE.Vector2(0.45, 0.005), new THREE.Vector2(0.53, 0.03), new THREE.Vector2(0.58, 0.07), new THREE.Vector2(0.6, 0.1)];
    const brim = mesh(new THREE.LatheGeometry(brimPts, 28), mHat, 0, 0.0, 0); brim.scale.set(1, 1, 1.12); brim.material.side = THREE.DoubleSide; hat.add(brim);
    hat.add(mesh(new THREE.CylinderGeometry(0.345, 0.385, 0.1, 20), mBand, 0, 0.07, 0));
    // arms
    const armGeo = new THREE.CapsuleGeometry(0.115, 0.36, 4, 12);
    const makeArm = (sx) => {
      const g = new THREE.Group(); g.position.set(sx * 0.42, 1.38, 0);
      g.add(mesh(armGeo, mJacket, 0, -0.3, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.1, 12), mJacketDark, 0, -0.5, 0));
      g.add(mesh(new THREE.SphereGeometry(0.115, 12, 10), mSkin, 0, -0.64, 0));
      b.add(g); return g;
    };
    this.armL = makeArm(-1); this.armR = makeArm(1);
    const handle = mesh(new THREE.CylinderGeometry(0.048, 0.06, 0.36, 12), smooth(C.handle, { roughness: .5 }), 0, -0.78, 0); this.armR.add(handle);
    handle.add(mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 12), mGold, 0, 0.12, 0)); handle.add(mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 12), mGold, 0, -0.14, 0));
    this.whipAnchor = new THREE.Object3D(); this.whipAnchor.position.set(0, -0.98, 0); this.armR.add(this.whipAnchor);
    // legs
    const legGeo = new THREE.CapsuleGeometry(0.135, 0.36, 4, 12);
    const makeLeg = (sx) => {
      const g = new THREE.Group(); g.position.set(sx * 0.17, 0.86, 0);
      g.add(mesh(legGeo, mJeans, 0, -0.33, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 12), mBoots, 0, -0.6, 0));
      g.add(mesh(RB(0.28, 0.24, 0.42, 0.07), mBoots, 0, -0.74, -0.05));
      b.add(g); return g;
    };
    this.legL = makeLeg(-1); this.legR = makeLeg(1);
  }
  _buildShield() {
    const m = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, emissive: 0x3fa9ff, emissiveIntensity: .9, transparent: true, opacity: .28, roughness: .2, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), m); this.shieldMesh.position.y = 1.2; this.shieldMesh.visible = false; this.root.add(this.shieldMesh);
  }
  reset() {
    this.lane = 0; this.x = 0; this.y = 0; this.z = 0; this.vy = 0; this.state = 'run'; this.phase = 0; this.stateT = 0; this.attackT = 1; this.swing = null;
    this.shield = false; this.shieldMesh.visible = false; this.hurtT = 0; this.root.rotation.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
  }
  get pos() { return this.root.position; }
  canSteer() { return this.state === 'run' || this.state === 'jump' || this.state === 'stumble'; }
  moveLane(d) { if (!this.canSteer()) return false; const nl = clamp(this.lane + d, -1, 1); if (nl === this.lane) return false; this.lane = nl; return true; }
  jump() { if (this.state !== 'run' && this.state !== 'stumble') return false; this.state = 'jump'; this.vy = JUMP_V; this.stateT = 0; return true; }
  attack() { this.attackT = 0; }
  startSwing(p1, p2, dur) {
    this.swing = { p0: new THREE.Vector3(this.x, this.y, this.z), p1, p2, dur, t: 0 };
    this.state = 'swing'; this.stateT = 0; this.vy = 0;
  }
  releaseSwing() {
    const sw = this.swing; if (!sw) return null; const t = sw.t;
    // velocity = derivative of the quadratic bezier / duration
    const vy = (2 * (1 - t) * (sw.p1.y - sw.p0.y) + 2 * t * (sw.p2.y - sw.p1.y)) / sw.dur;
    this.swing = null; this.state = 'jump'; this.stateT = 0; this.vy = Math.max(vy, 2.5); this.lane = Math.round(this.x / LANE_W);
    return t;
  }
  stumble() { if (this.state === 'run' || this.state === 'jump') { this.state = 'stumble'; this.stateT = 0; } }
  die(kind) { this.state = 'dead'; this.deathKind = kind; this.stateT = 0; this.vy = kind === 'fall' ? 0 : 7; }
  fall() { if (this.state !== 'fall') { this.state = 'fall'; this.stateT = 0; this.vy = Math.min(this.vy, 0); } }
  setShield(on) { this.shield = on; this.shieldMesh.visible = on; }

  update(dt, speed, time) {
    this.stateT += dt; this.attackT += dt;
    const s = this.state;
    // forward motion
    if (s === 'swing') {
      const sw = this.swing; sw.t = Math.min(1, sw.t + dt / sw.dur);
      const t = sw.t, it = 1 - t;
      this.x = it * it * sw.p0.x + 2 * it * t * sw.p1.x + t * t * sw.p2.x;
      this.y = it * it * sw.p0.y + 2 * it * t * sw.p1.y + t * t * sw.p2.y;
      this.z = it * it * sw.p0.z + 2 * it * t * sw.p1.z + t * t * sw.p2.z;
      if (t >= 1) { this.state = 'run'; this.stateT = 0; this.y = 0; this.lane = Math.round(this.x / LANE_W); this.swing = null; this.landed = true; }
    } else if (s === 'dead') {
      if (this.deathKind === 'fall') { this.vy += GRAVITY * dt; this.y += this.vy * dt; this.z -= speed * 0.2 * dt; }
      else { this.vy += GRAVITY * dt; this.y = Math.max(0, this.y + this.vy * dt); this.z += speed * 0.25 * dt * Math.max(0, 1 - this.stateT * 2); }
    } else {
      this.z -= speed * dt;
      if (s === 'fall') { this.vy += GRAVITY * dt; this.y += this.vy * dt; }
      else if (s === 'jump') { this.vy += GRAVITY * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.state = 'run'; this.stateT = 0; this.landed = true; } }
      else if (s === 'stumble') { if (this.stateT > 0.9) { this.state = 'run'; this.stateT = 0; } }
      const tx = this.lane * LANE_W; this.x = damp(this.x, tx, 14, dt);
    }
    this.root.position.set(this.x, this.y, this.z);
    this._animate(dt, speed, time);
  }
  _animate(dt, speed, time) {
    const s = this.state; const b = this.body;
    const runRate = speed * 0.95;
    if (s === 'run' || s === 'stumble') this.phase += dt * runRate;
    const p = this.phase;
    const sin = Math.sin, cos = Math.cos;
    let legL = 0, legR = 0, armL = 0, armR = -2.5, armRz = -0.35, bodyX = -0.12, bodyY = 0, bodyZ = 0, headX = 0, rootX = 0;
    if (s === 'run') { legL = sin(p) * 1.0; legR = sin(p + Math.PI) * 1.0; armL = sin(p + Math.PI) * 0.75; bodyY = Math.abs(sin(p)) * 0.07; armR += sin(p * 2) * 0.08; headX = 0.05 + sin(p * 2) * 0.03; }
    else if (s === 'stumble') { legL = sin(p) * 0.6; legR = sin(p + Math.PI) * 0.6; armL = -0.6; bodyX = -0.55 + Math.min(this.stateT, 0.5) * 0.6; bodyY = -0.1; bodyZ = sin(this.stateT * 20) * 0.08; }
    else if (s === 'jump') { const k = Math.min(1, this.stateT * 6); legL = 0.7 * k; legR = -0.5 * k; armL = -1.2 * k; armR = -2.8; bodyX = -0.2; }
    else if (s === 'swing') { const t = this.swing ? this.swing.t : 0; legL = -0.5 + sin(time * 6) * 0.2; legR = -0.2 + cos(time * 6) * 0.2; armL = -0.8 + sin(time * 4) * 0.2; armR = -3.0; armRz = 0.1; bodyX = -0.35 - sin(t * Math.PI) * 0.3; }
    else if (s === 'fall') { legL = sin(time * 14) * 0.5; legR = cos(time * 14) * 0.5; armL = -2.5; armR = -2.6; bodyX = 0.2; bodyZ = sin(time * 10) * 0.15; }
    else if (s === 'dead') { const k = Math.min(1, this.stateT * 3); if (this.deathKind === 'fall') { rootX = this.stateT * 4; legL = 0.5; legR = -0.5; armL = -2.5; } else { rootX = -1.5 * k; legL = 0.3; legR = -0.3; armL = -1.2; armR = -1.5; bodyX = 0; } }
    // whip attack arm swing
    if (this.attackT < 0.35) { const a = this.attackT / 0.35; const k = a < 0.3 ? a / 0.3 : 1 - (a - 0.3) / 0.7; armR = lerp(armR, -1.1, k); armRz = lerp(armRz, 0.1, k); bodyX -= 0.15 * k; }
    const kA = 1 - Math.exp(-dt * 18);
    this.legL.rotation.x = lerp(this.legL.rotation.x, legL, kA); this.legR.rotation.x = lerp(this.legR.rotation.x, legR, kA);
    this.armL.rotation.x = lerp(this.armL.rotation.x, armL, kA); this.armR.rotation.x = lerp(this.armR.rotation.x, armR, kA); this.armR.rotation.z = lerp(this.armR.rotation.z, armRz, kA);
    b.rotation.x = lerp(b.rotation.x, bodyX, kA); b.rotation.z = lerp(b.rotation.z, bodyZ, kA); b.position.y = lerp(b.position.y, bodyY, kA);
    this.head.rotation.x = headX;
    // lane lean
    const tx = this.lane * LANE_W; const lean = clamp((tx - this.x) * 0.5, -0.4, 0.4);
    b.rotation.z = lerp(b.rotation.z, -lean, kA) ; b.rotation.y = lerp(b.rotation.y, -lean * 0.6, kA);
    this.root.rotation.x = lerp(this.root.rotation.x, rootX, kA);
    if (this.shieldMesh.visible) { this.shieldMesh.rotation.y += dt * 1.5; this.shieldMesh.rotation.x += dt * 0.7; const sc = 1 + Math.sin(time * 5) * 0.04; this.shieldMesh.scale.set(sc, sc, sc); }
    if (this.hurtT > 0) { this.hurtT -= dt; this.root.visible = Math.floor(this.hurtT * 20) % 2 === 0; } else this.root.visible = true;
  }
  handWorld(out) { return this.whipAnchor.getWorldPosition(out); }
}
