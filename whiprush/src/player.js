import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LANE_W, GRAVITY, JUMP_V, damp, clamp, lerp } from './config.js';

const C = {
  skin: 0xe9b58e, hair: 0x3a2314, hat: 0x7d5533, hatBand: 0x9b3328, jacket: 0x9a6a42, jacketDark: 0x5a3a20,
  shirt: 0xeadcb8, jeans: 0x5f84cf, boots: 0x3f2616, belt: 0x2b1a0e, buckle: 0xe3b23c, handle: 0x5c3a1e, strap: 0x4a2e16,
};
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = false; return o; }
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

export class Player {
  constructor(scene, tex = {}) {
    this.scene = scene; this.tex = tex;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this._build();
    this.lane = 0; this.x = 0; this.y = 0; this.z = 0; this.vy = 0;
    this.state = 'run'; this.phase = 0; this.stateT = 0; this.attackT = 1; this.swing = null;
    this.shield = false; this.shieldMesh = null; this.hurtT = 0;
    this._buildShield();
  }
  _build() {
    const b = this.body; const T = this.tex;
    const RB = (w, h, d, r = 0.1, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
    const smooth = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: 0, ...extra });
    const texd = (map, color, extra = {}) => map ? new THREE.MeshStandardMaterial({ map, color, roughness: .8, metalness: 0, ...extra }) : smooth(color, extra);
    const mJacket = texd(T.leather, C.jacket), mJacketDark = texd(T.leather, C.jacketDark), mSkin = smooth(C.skin, { roughness: .55 }), mShirt = smooth(C.shirt, { roughness: .9 });
    const mJeans = texd(T.denim, C.jeans), mBoots = texd(T.leather, 0x6b4a2a, { roughness: .6 }), mHat = smooth(0x8f6240, { roughness: .95 }), mBand = smooth(C.hatBand), mHair = smooth(C.hair, { roughness: .85 });
    const mBelt = smooth(C.belt), mGold = smooth(C.buckle, { metalness: .75, roughness: .25 }), mStrap = texd(T.leather, C.strap);
    // torso (lathe profile: waist → chest → shoulders)
    const torso = mesh(new THREE.LatheGeometry(V2([[0, 0], [0.27, 0], [0.3, 0.08], [0.33, 0.3], [0.36, 0.5], [0.35, 0.6], [0.26, 0.66], [0, 0.68]]), 28), mJacket, 0, 0.88, 0); torso.scale.set(1, 1, 0.76); b.add(torso);
    b.add(mesh(RB(0.26, 0.5, 0.12, 0.05, 2), mShirt, 0, 1.17, -0.21));
    const lapL = mesh(RB(0.16, 0.3, 0.06, 0.03, 2), mJacketDark, -0.15, 1.37, -0.24); lapL.rotation.z = 0.5; b.add(lapL);
    const lapR = lapL.clone(); lapR.position.x = 0.15; lapR.rotation.z = -0.5; b.add(lapR);
    const collar = mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), mJacketDark, 0, 1.55, 0); collar.rotation.x = 1.35; b.add(collar);
    b.add(mesh(new THREE.SphereGeometry(0.145, 14, 12), mJacket, -0.35, 1.47, 0)); b.add(mesh(new THREE.SphereGeometry(0.145, 14, 12), mJacket, 0.35, 1.47, 0));
    const belt = mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.1, 24), mBelt, 0, 0.88, 0); belt.scale.z = 0.78; b.add(belt);
    b.add(mesh(RB(0.13, 0.1, 0.04, 0.02, 2), mGold, 0, 0.88, -0.27));
    const strap = mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 32), mStrap, 0, 1.2, 0); strap.rotation.set(0.25, 0, 0.6); strap.scale.set(1, 1, 0.78); b.add(strap);
    b.add(mesh(RB(0.24, 0.2, 0.13, 0.04), mStrap, 0.3, 0.95, 0.24)); b.add(mesh(RB(0.26, 0.08, 0.15, 0.03, 2), mJacketDark, 0.3, 1.04, 0.24));
    b.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 12), mSkin, 0, 1.56, 0));
    // head
    const head = new THREE.Group(); head.position.y = 1.92; b.add(head); this.head = head;
    const skull = mesh(new THREE.SphereGeometry(0.34, 28, 20), mSkin); skull.scale.set(1, 1.06, 0.98); head.add(skull);
    head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mSkin, -0.33, -0.02, 0.02)); head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mSkin, 0.33, -0.02, 0.02));
    const hair = mesh(new THREE.SphereGeometry(0.35, 24, 16), mHair, 0, 0.1, 0.05); hair.scale.set(1.03, 0.78, 1.03); head.add(hair);
    const fringe = mesh(RB(0.3, 0.1, 0.12, 0.04, 2), mHair, 0.08, 0.2, -0.28); fringe.rotation.z = -0.3; head.add(fringe);
    const mEye = smooth(0xffffff, { roughness: .3 }), mPupil = smooth(0x1b1b2a, { roughness: .3 });
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), mEye, sx * 0.13, 0.03, -0.3));
      head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mPupil, sx * 0.13, 0.03, -0.355));
      head.add(mesh(new THREE.SphereGeometry(0.013, 6, 6), mEye, sx * 0.115, 0.05, -0.385));
      const brow = mesh(RB(0.13, 0.035, 0.03, 0.01, 1), mHair, sx * 0.13, 0.14, -0.31); brow.rotation.z = -sx * 0.3; head.add(brow);
    }
    head.add(mesh(new THREE.SphereGeometry(0.045, 8, 8), mSkin, 0, -0.04, -0.345));
    const mouth = mesh(RB(0.12, 0.03, 0.03, 0.01, 1), smooth(0x7a2e2e), 0, -0.15, -0.31); head.add(mouth);
    // hat
    const hat = new THREE.Group(); hat.position.y = 0.27; head.add(hat); this.hat = hat;
    hat.add(mesh(new THREE.LatheGeometry(V2([[0, 0], [0.32, 0], [0.345, 0.06], [0.35, 0.2], [0.32, 0.3], [0.22, 0.36], [0, 0.38]]), 28), mHat));
    const brimGeo = new THREE.LatheGeometry(V2([[0.28, 0], [0.44, 0], [0.52, 0.02], [0.57, 0.05], [0.6, 0.08]]), 36);
    { const p = brimGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + 0.1 * (x * x) / (0.6 * 0.6)); } brimGeo.computeVertexNormals(); }
    const brim = mesh(brimGeo, mHat); brim.scale.set(1, 1, 1.1); brim.material = mHat.clone(); brim.material.side = THREE.DoubleSide; hat.add(brim);
    hat.add(mesh(new THREE.CylinderGeometry(0.355, 0.365, 0.09, 24), mBand, 0, 0.06, 0));
    hat.add(mesh(new THREE.SphereGeometry(0.03, 8, 8), mGold, 0.2, 0.06, -0.3));
    // arms: shoulder → elbow
    const upperGeo = new THREE.CapsuleGeometry(0.115, 0.26, 4, 12), foreGeo = new THREE.CapsuleGeometry(0.1, 0.26, 4, 12);
    const makeArm = (sx) => {
      const g = new THREE.Group(); g.position.set(sx * 0.4, 1.44, 0);
      g.add(mesh(upperGeo, mJacket, 0, -0.18, 0));
      const el = new THREE.Group(); el.position.y = -0.4; g.add(el); g.elbow = el;
      el.add(mesh(foreGeo, mJacket, 0, -0.16, 0));
      el.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.09, 12), mJacketDark, 0, -0.3, 0));
      el.add(mesh(new THREE.SphereGeometry(0.105, 12, 10), mSkin, 0, -0.37, 0));
      b.add(g); return g;
    };
    this.armL = makeArm(-1); this.armR = makeArm(1);
    const handle = mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.34, 12), smooth(C.handle, { roughness: .5 }), 0, -0.52, 0); this.armR.elbow.add(handle);
    handle.add(mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), mGold, 0, 0.12, 0)); handle.add(mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), mGold, 0, -0.13, 0));
    this.whipAnchor = new THREE.Object3D(); this.whipAnchor.position.set(0, -0.72, 0); this.armR.elbow.add(this.whipAnchor);
    // legs: hip → knee
    const thighGeo = new THREE.CapsuleGeometry(0.14, 0.22, 4, 12), shinGeo = new THREE.CapsuleGeometry(0.12, 0.2, 4, 12);
    const makeLeg = (sx) => {
      const g = new THREE.Group(); g.position.set(sx * 0.17, 0.9, 0);
      g.add(mesh(thighGeo, mJeans, 0, -0.2, 0));
      const kn = new THREE.Group(); kn.position.y = -0.4; g.add(kn); g.knee = kn;
      kn.add(mesh(shinGeo, mJeans, 0, -0.17, 0));
      kn.add(mesh(new THREE.CylinderGeometry(0.145, 0.15, 0.14, 12), mBoots, 0, -0.33, 0));
      kn.add(mesh(RB(0.27, 0.2, 0.42, 0.07), mBoots, 0, -0.4, -0.06));
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
  startSwing(p1, p2, dur) { this.swing = { p0: new THREE.Vector3(this.x, this.y, this.z), p1, p2, dur, t: 0 }; this.state = 'swing'; this.stateT = 0; this.vy = 0; }
  releaseSwing() {
    const sw = this.swing; if (!sw) return null; const t = sw.t;
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
    if (s === 'run' || s === 'stumble') this.phase += dt * speed * 0.95;
    const p = this.phase; const sin = Math.sin, cos = Math.cos;
    // pose targets
    let hipL = 0, hipR = 0, kneeL = -0.2, kneeR = -0.2, shL = 0, elL = 0.9, shR = -2.4, elR = 0.5, armRz = -0.3, armLz = 0.15;
    let bodyX = -0.14, bodyY = 0, bodyZ = 0, headX = 0, rootX = 0, hatX = 0;
    if (s === 'run') {
      hipL = sin(p) * 0.95; hipR = sin(p + Math.PI) * 0.95;
      kneeL = -(0.15 + 1.1 * Math.max(0, -sin(p - 0.5))); kneeR = -(0.15 + 1.1 * Math.max(0, -sin(p + Math.PI - 0.5)));
      shL = sin(p + Math.PI) * 0.8 - 0.25; elL = 1.0 + 0.35 * sin(p + Math.PI);
      shR += sin(p * 2) * 0.06; bodyY = Math.abs(sin(p)) * 0.06; headX = 0.06 + sin(p * 2) * 0.03; hatX = sin(p * 2) * 0.04;
    } else if (s === 'stumble') { hipL = sin(p) * 0.6; hipR = sin(p + Math.PI) * 0.6; shL = -0.9; elL = 0.5; bodyX = -0.6 + Math.min(this.stateT, 0.5) * 0.7; bodyY = -0.1; bodyZ = sin(this.stateT * 20) * 0.08; }
    else if (s === 'jump') { const k = Math.min(1, this.stateT * 6); hipL = 0.9 * k; kneeL = -1.3 * k; hipR = -0.5 * k; kneeR = -0.7 * k; shL = -1.1 * k; elL = 0.7; shR = -2.8; bodyX = -0.22; }
    else if (s === 'swing') { const t = this.swing ? this.swing.t : 0; hipL = -0.5 + sin(time * 6) * 0.2; hipR = -0.2 + cos(time * 6) * 0.2; kneeL = -0.6; kneeR = -0.4; shL = -0.9 + sin(time * 4) * 0.2; elL = 0.6; shR = -3.05; elR = 0.1; armRz = 0.05; bodyX = -0.35 - sin(t * Math.PI) * 0.3; }
    else if (s === 'fall') { hipL = sin(time * 14) * 0.5; hipR = cos(time * 14) * 0.5; shL = -2.6; elL = 0.3; shR = -2.6; bodyX = 0.2; bodyZ = sin(time * 10) * 0.15; }
    else if (s === 'dead') { const k = Math.min(1, this.stateT * 3); if (this.deathKind === 'fall') { rootX = this.stateT * 4; hipL = 0.5; hipR = -0.5; shL = -2.5; } else { rootX = -1.5 * k; hipL = 0.3; hipR = -0.3; shL = -1.2; shR = -1.5; elR = 0.2; bodyX = 0; } }
    if (this.attackT < 0.35) { const a = this.attackT / 0.35; const k = a < 0.3 ? a / 0.3 : 1 - (a - 0.3) / 0.7; shR = lerp(shR, -1.0, k); elR = lerp(elR, 0.25, k); armRz = lerp(armRz, 0.1, k); bodyX -= 0.18 * k; }
    const kA = 1 - Math.exp(-dt * 18);
    const L = (o, key, v) => { o[key] = lerp(o[key], v, kA); };
    L(this.legL.rotation, 'x', hipL); L(this.legR.rotation, 'x', hipR); L(this.legL.knee.rotation, 'x', kneeL); L(this.legR.knee.rotation, 'x', kneeR);
    L(this.armL.rotation, 'x', shL); L(this.armL.elbow.rotation, 'x', elL); L(this.armL.rotation, 'z', armLz);
    L(this.armR.rotation, 'x', shR); L(this.armR.elbow.rotation, 'x', elR); L(this.armR.rotation, 'z', armRz);
    L(b.rotation, 'x', bodyX); L(b.position, 'y', bodyY);
    this.head.rotation.x = headX; this.hat.rotation.x = hatX;
    const tx = this.lane * LANE_W; const lean = clamp((tx - this.x) * 0.5, -0.4, 0.4);
    L(b.rotation, 'z', -lean + bodyZ); L(b.rotation, 'y', -lean * 0.6);
    L(this.root.rotation, 'x', rootX);
    if (this.shieldMesh.visible) { this.shieldMesh.rotation.y += dt * 1.5; this.shieldMesh.rotation.x += dt * 0.7; const sc = 1 + Math.sin(time * 5) * 0.04; this.shieldMesh.scale.set(sc, sc, sc); }
    if (this.hurtT > 0) { this.hurtT -= dt; this.root.visible = Math.floor(this.hurtT * 20) % 2 === 0; } else this.root.visible = true;
  }
  handWorld(out) { return this.whipAnchor.getWorldPosition(out); }
}
