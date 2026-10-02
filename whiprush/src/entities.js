import * as THREE from 'three';
import { rand, randi, pick, HOOK_Y } from './config.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { islandBottom, grassCap, coinGeometry, glowTexture, rockBlob } from './geo.js';
const RB = (w, h, d, r = 0.1, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, flatShading: true, ...extra });
const M = {
  urchin: new THREE.MeshStandardMaterial({ color: 0x4b2d7d, emissive: 0x2a0a40, emissiveIntensity: .35, roughness: .6 }), spike: new THREE.MeshStandardMaterial({ color: 0x7a48c0, roughness: .5 }), eye: std(0xff2a4a, { emissive: 0xff2040, emissiveIntensity: 1.6 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xa39e93, roughness: .9 }), stoneDark: new THREE.MeshStandardMaterial({ color: 0x75705f, roughness: .9 }), moss: std(0x6fbf4a), golemEye: std(0xff2a2a, { emissive: 0xff1a1a, emissiveIntensity: 2.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xb08347, roughness: .8 }), woodDark: new THREE.MeshStandardMaterial({ color: 0x7a5327, roughness: .8 }), crateRed: new THREE.MeshStandardMaterial({ color: 0xc8452f, roughness: .7 }), crateBlue: new THREE.MeshStandardMaterial({ color: 0x3566b8, roughness: .7 }), crateGreen: new THREE.MeshStandardMaterial({ color: 0x55a844, roughness: .7 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd04a, emissive: 0xffa21a, emissiveIntensity: 0.6, roughness: .25, metalness: .85 }),
  ring: new THREE.MeshStandardMaterial({ color: 0xffd04a, emissive: 0xffb020, emissiveIntensity: 1.3, roughness: .25, metalness: .8 }),
  halo: new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }),
  rock: std(0x7a5cc4), grass: std(0x7fcf55), magnet: new THREE.MeshStandardMaterial({ color: 0x5fc1ff, emissive: 0x2a8dff, emissiveIntensity: 1.2, roughness: .2 }),
  shield: new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb300, emissiveIntensity: 1.6, roughness: .2 }),
  pedestal: std(0xb0a898),
  obsidian: std(0x2b2342, { emissive: 0x2a0f4a, emissiveIntensity: .35 }), obsidianDark: std(0x1a1530), obsSpike: std(0x8a2fa0, { emissive: 0x6a1a80, emissiveIntensity: .5 }),
};
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

// ---------- factories ----------
function makeUrchin() {
  const g = new THREE.Group();
  const core = new THREE.Group(); g.add(core); g.userData.core = core;
  core.add(mesh(new THREE.IcosahedronGeometry(0.55, 3), M.urchin));
  const spike = new THREE.ConeGeometry(0.15, 0.6, 8);
  const dirs = []; const n = 14; for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2; const r = Math.sqrt(1 - y * y); const th = i * 2.399963; dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)); }
  for (const d of dirs) { const s = mesh(spike, M.spike); s.position.copy(d).multiplyScalar(0.72); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); core.add(s); }
  const eye = mesh(new THREE.SphereGeometry(0.13, 8, 8), M.eye, 0, 0.05, 0.52); g.add(eye);
  return g;
}
function makeGolem() {
  const g = new THREE.Group();
  g.add(mesh(RB(1.75, 1.65, 1.15, 0.22), M.stone, 0, 1.55, 0));
  g.add(mesh(RB(1.3, 0.5, 1.0, 0.12), M.stoneDark, 0, 0.75, 0));
  const head = mesh(RB(1.0, 0.85, 0.95, 0.2), M.stone, 0, 2.72, 0.05); g.add(head);
  head.add(mesh(RB(0.22, 0.13, 0.1, 0.03, 1), M.golemEye, -0.23, 0.08, 0.46)); head.add(mesh(RB(0.22, 0.13, 0.1, 0.03, 1), M.golemEye, 0.23, 0.08, 0.46));
  head.add(mesh(RB(0.6, 0.12, 0.1, 0.03, 1), M.stoneDark, 0, -0.2, 0.46));
  const armL = mesh(RB(0.62, 1.55, 0.62, 0.18), M.stone, -1.27, 1.5, 0.1); armL.rotation.z = 0.15; g.add(armL);
  const armR = mesh(RB(0.62, 1.55, 0.62, 0.18), M.stone, 1.27, 1.5, 0.1); armR.rotation.z = -0.15; g.add(armR);
  g.add(mesh(RB(0.8, 0.8, 0.8, 0.2), M.stoneDark, -1.32, 0.6, 0.2)); g.add(mesh(RB(0.8, 0.8, 0.8, 0.2), M.stoneDark, 1.32, 0.6, 0.2));
  g.add(mesh(RB(0.62, 0.9, 0.68, 0.15), M.stoneDark, -0.45, 0.45, 0)); g.add(mesh(RB(0.62, 0.9, 0.68, 0.15), M.stoneDark, 0.45, 0.45, 0));
  const mossG = rockBlob(0, 0.25); for (const [x, y, z, s] of [[-0.75, 2.35, 0.1, 0.32], [0.6, 2.4, -0.2, 0.26], [0.2, 2.35, 0.4, 0.2], [-1.3, 2.3, 0.1, 0.22]]) { const m = mesh(mossG, M.moss, x, y, z); m.scale.set(s, s * 0.55, s); g.add(m); }
  g.userData.armL = armL; g.userData.armR = armR; g.userData.head = head;
  return g;
}
function makeCrates() {
  const g = new THREE.Group(); const box = RB(0.9, 0.9, 0.9, 0.08); const inner = RB(0.78, 0.78, 0.94, 0.04, 2); const mats = [M.wood, M.wood, M.crateRed, M.crateBlue, M.crateGreen, M.woodDark];
  g.userData.boxes = [];
  for (let i = 0; i < 5; i++) { const b = mesh(box, M.woodDark, 0, 0.45 + i * 0.9, 0); const f = mesh(inner, mats[i % mats.length], 0, 0, 0); b.add(f); const f2 = mesh(RB(0.94, 0.78, 0.78, 0.04, 2), mats[i % mats.length], 0, 0, 0); b.add(f2); g.add(b); g.userData.boxes.push(b); }
  return g;
}
function makePillar() {
  const g = new THREE.Group();
  const short = new THREE.Group(); short.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.0, 10), M.stone)); short.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10), M.stoneDark, 0, 0.9, 0)); short.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10), M.stoneDark, 0, -0.9, 0));
  short.rotation.z = Math.PI / 2; short.position.y = 0.42; g.add(short);
  const long = new THREE.Group(); long.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 7.2, 10), M.stone)); for (const x of [-3.3, -1.1, 1.1, 3.3]) long.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), M.stoneDark, 0, x, 0));
  long.rotation.z = Math.PI / 2; long.position.y = 0.42; g.add(long);
  g.userData.short = short; g.userData.long = long; return g;
}
function makeHook() {
  const g = new THREE.Group();
  const island = new THREE.Group(); island.position.y = HOOK_Y - 1.5; g.add(island);
  const rock = mesh(islandBottom(7), M.rock, 0, 0, 0); rock.scale.set(1.5, 1.9, 1.5); island.add(rock);
  const cap = mesh(grassCap(7), M.grass, 0, 0, 0); cap.scale.set(1.55, 0.35, 1.55); island.add(cap);
  for (const [x, z, s] of [[0.9, 0.4, 0.3], [-0.8, -0.5, 0.25]]) { const b = mesh(rockBlob(0, 0.25), M.moss, x, 0.4, z); b.scale.set(s, s * 0.6, s); island.add(b); }
  island.add(mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 8), M.pedestal, 0, 0.7, 0));
  const ring = mesh(new THREE.TorusGeometry(0.85, 0.16, 12, 32), M.ring, 0, HOOK_Y, 0); g.add(ring); g.userData.ring = ring;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,0.9)', 'rgba(255,215,120,0.35)', 'rgba(255,190,80,0)'), color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.position.y = HOOK_Y; glow.scale.set(4.5, 4.5, 1); g.add(glow); g.userData.glow = glow;
  const gem = mesh(new THREE.OctahedronGeometry(0.28, 0), M.magnet, 0, HOOK_Y, 0); g.add(gem); g.userData.gem = gem;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 40), M.halo); halo.position.y = HOOK_Y; halo.visible = false; g.add(halo); g.userData.halo = halo;
  return g;
}
function makePowerup() {
  const g = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.45, 0), M.magnet, 0, 1.3, 0); g.add(core); g.userData.core = core;
  const ring = mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 24), M.gold, 0, 1.3, 0); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring;
  return g;
}

function makeTotem() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.5, 6), M.obsidianDark, 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.7, 6), M.obsidian, 0, 1.85, 0));
  const head = mesh(new THREE.OctahedronGeometry(0.75, 0), M.obsidian, 0, 3.55, 0); head.scale.y = 1.3; g.add(head); g.userData.head = head;
  g.add(mesh(new THREE.SphereGeometry(0.17, 8, 8), M.golemEye, 0, 2.0, 0.55));
  const spike = new THREE.ConeGeometry(0.16, 0.7, 5);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const s = mesh(spike, M.obsSpike, Math.cos(a) * 0.7, 1.2 + (i % 2) * 0.9, Math.sin(a) * 0.7); s.rotation.z = -Math.cos(a) * 1.3; s.rotation.x = Math.sin(a) * 1.3; g.add(s); }
  return g;
}

function makeGate() {
  const g = new THREE.Group();
  const col = (x) => { const c = mesh(RB(1.1, 6.5, 1.1, 0.12), M.pedestal, x, 3.25, 0); g.add(c); g.add(mesh(RB(1.5, 0.4, 1.5, 0.08), M.pedestal, x, 6.6, 0)); g.add(mesh(RB(1.2, 0.2, 1.2, 0.05), M.gold, x, 4.6, 0)); };
  col(-4.4); col(4.4);
  g.add(mesh(RB(10.4, 0.7, 1.2, 0.12), M.pedestal, 0, 7.1, 0));
  const sun = mesh(new THREE.TorusGeometry(0.9, 0.18, 12, 32), M.ring, 0, 8.3, 0); g.add(sun);
  const gem = mesh(new THREE.OctahedronGeometry(0.4, 0), M.magnet, 0, 8.3, 0); g.add(gem); g.userData.gem = gem; g.userData.sun = sun;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const ray = mesh(new THREE.ConeGeometry(0.12, 0.6, 5), M.gold, Math.cos(a) * 1.35, 8.3 + Math.sin(a) * 1.35, 0); ray.rotation.z = a - Math.PI / 2; g.add(ray); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,0.9)', 'rgba(255,215,120,0.35)', 'rgba(255,190,80,0)'), color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.position.y = 8.3; glow.scale.set(6, 6, 1); g.add(glow);
  return g;
}

const FACTORY = { gate: makeGate, totem: makeTotem, urchin: makeUrchin, golem: makeGolem, crates: makeCrates, pillar: makePillar, hook: makeHook, powerup: makePowerup };
const POOL_SIZE = { gate: 2, totem: 8, urchin: 22, golem: 8, crates: 10, pillar: 8, hook: 4, powerup: 4 };

export class Entities {
  constructor(scene) {
    this.scene = scene; this.pools = {}; this.active = [];
    for (const type in FACTORY) {
      this.pools[type] = [];
      for (let i = 0; i < POOL_SIZE[type]; i++) { const m = FACTORY[type](); m.visible = false; scene.add(m); this.pools[type].push({ type, mesh: m, alive: false, x: 0, y: 0, z: 0, lane: 0, chunk: null }); }
    }
    // coins as one instanced mesh
    this.coinMax = 220; this.coins = [];
    const cg = coinGeometry();
    this.coinMesh = new THREE.InstancedMesh(cg, M.gold, this.coinMax); this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.castShadow = true; this.coinMesh.frustumCulled = false; this.coinMesh.count = 0; scene.add(this.coinMesh);
    for (let i = 0; i < this.coinMax; i++) this.coins.push({ type: 'coin', alive: false, x: 0, y: 0, z: 0, lane: 0, fly: false, chunk: null, idx: i });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  spawn(type, x, y, z, chunk, opts = {}) {
    const e = this.pools[type].find(e => !e.alive); if (!e) return null;
    e.alive = true; e.x = x; e.y = y; e.z = z; e.lane = Math.round(x / 2.2); e.chunk = chunk; e.opts = opts; e.t = 0; e.used = false; e.dying = 0;
    const m = e.mesh; m.visible = true; m.position.set(x, y, z + (opts.zOffset || 0)); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    if (type === 'urchin') { m.rotation.y = rand(0, 6); }
    if (type === 'crates') { const n = opts.n || randi(3, 5); m.userData.boxes.forEach((b, i) => { b.visible = i < n; b.position.x = rand(-.12, .12); b.position.z = rand(-.12, .12); b.rotation.y = rand(-.25, .25); }); e.height = n * 0.9; }
    if (type === 'pillar') { m.userData.short.visible = !opts.long; m.userData.long.visible = !!opts.long; }
    if (type === 'hook') { m.userData.halo.visible = false; m.userData.ring.scale.set(1, 1, 1); }
    if (type === 'powerup') { m.userData.core.material = opts.kind === 'shield' ? M.shield : M.magnet; }
    this.active.push(e); return e;
  }
  spawnCoin(x, y, z, chunk) { const c = this.coins.find(c => !c.alive); if (!c) return null; c.alive = true; c.x = x; c.y = y; c.z = z; c.lane = Math.round(x / 2.2); c.fly = false; c.chunk = chunk; c.t = 0; return c; }
  release(e) { e.alive = false; if (e.type === 'coin') return; e.mesh.visible = false; const i = this.active.indexOf(e); if (i >= 0) this.active.splice(i, 1); }
  releaseChunk(chunk) { for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i].chunk === chunk) this.release(this.active[i]); for (const c of this.coins) if (c.alive && c.chunk === chunk) c.alive = false; }
  releaseAll() { for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]); for (const c of this.coins) c.alive = false; }
  update(dt, time, playerZ) {
    // coins: write matrices for visible ones
    let n = 0; const rot = time * 3.2;
    for (const c of this.coins) {
      if (!c.alive) continue; if (c.z > playerZ + 1.5 || c.z < playerZ - 130) continue;
      c.t += dt;
      const bob = c.fly ? 0 : Math.sin(time * 4 + c.x + c.z * .3) * 0.08;
      this._p.set(c.x, c.y + bob, c.z); this._e.set(0, rot + c.z * 0.4, 0); this._q.setFromEuler(this._e);
      const s = c.fly ? 1.2 : 1; this._s.set(s, s, s); this._m.compose(this._p, this._q, this._s); this.coinMesh.setMatrixAt(n++, this._m);
    }
    this.coinMesh.count = n; this.coinMesh.instanceMatrix.needsUpdate = true;
    for (const e of this.active) {
      e.t += dt; const m = e.mesh; const ud = m.userData;
      if (e.dying > 0) { e.dying -= dt; const k = Math.max(0, e.dying / 0.25); m.scale.set(k, k, k); if (e.dying <= 0) this.release(e); continue; }
      if (e.z > playerZ + 4.5) { m.visible = false; continue; } else m.visible = true;
      switch (e.type) {
        case 'urchin': ud.core.rotation.y += dt * 1.2; ud.core.rotation.x += dt * 0.5; m.position.y = e.y + (e.opts.float ? Math.sin(time * 3 + e.x) * 0.25 : 0); break;
        case 'golem': { const d = playerZ - e.z; const k = d < 14 ? Math.min(1, (14 - d) / 6) : 0; ud.armL.rotation.x = -k * 1.4 + Math.sin(time * 6) * 0.1 * k; ud.armR.rotation.x = -k * 1.4 + Math.cos(time * 6) * 0.1 * k; m.position.y = e.y + (k > 0 ? Math.abs(Math.sin(time * 8)) * 0.12 * k : 0); break; }
        case 'hook': ud.ring.rotation.z = time * 1.5; ud.gem.rotation.y = time * 3; ud.gem.rotation.x = time * 1.7; m.position.y = e.y + Math.sin(time * 1.6 + e.z) * 0.2;
          { const gs = 4.2 + Math.sin(time * 3 + e.z) * 0.5 + (ud.halo.visible ? 1.5 : 0); ud.glow.scale.set(gs, gs, 1); }
          if (ud.halo.visible) { const s = 1 + Math.sin(time * 10) * 0.12; ud.halo.scale.set(s, s, s); ud.halo.rotation.z = -time * 2; ud.ring.scale.set(1.15, 1.15, 1.15); } break;
        case 'powerup': ud.core.rotation.y = time * 2.5; ud.core.rotation.x = time * 1.3; ud.ring.rotation.z = time * 2; m.position.y = e.y + Math.sin(time * 3) * 0.2; break;
        case 'gate': ud.gem.rotation.y = time * 2; ud.sun.rotation.z = time * 0.6; break;
        case 'totem': ud.head.rotation.y = time * 1.2; ud.head.position.y = 3.55 + Math.sin(time * 2 + e.z) * 0.1; break;
        case 'crates': break;
        case 'pillar': break;
      }
    }
  }
  restyle(rockMat, grassMat) { for (const h of this.pools.hook) h.mesh.traverse(o => { if (o.isMesh) { if (o.material === M.rock) o.material = rockMat; else if (o.material === M.grass) o.material = grassMat; } }); }
  kill(e) { e.dying = 0.25; }
}
export const Materials = M;
