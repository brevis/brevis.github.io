import * as THREE from 'three';
import { CHUNK_LEN, BRIDGE_W, GAP_LEN, HOOK_Y, HOOK_AHEAD, LANE_W, LEVEL_DIST, rand, randi, pick } from './config.js';
import { Entities } from './entities.js';
import { rockColumn, rockBlob, islandBottom, grassCap, glowTexture, cloudTexture, withHeightGradient, triplanar, perFaceColors, crossBillboardGeometry } from './geo.js';

const NUM_CHUNKS = 8;
const PER = { near: 12, far: 8, trees: 10, bushes: 8, crystals: 6, rocks: 5, clouds: 6, islands: 2 };
const ROCK_HSL = { h: 0.735, s: 0.56, l: 0.5, hVar: 0.02, sVar: 0.08, lVar: 0.12 };
const GRASS_HSL = { h: 0.26, s: 0.62, l: 0.55, hVar: 0.015, sVar: 0.06, lVar: 0.07 };
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, flatShading: true, ...extra });

function floorGeometry(w, len, h = 1.4) {
  const g = new THREE.BoxGeometry(w, h, len);
  const uv = g.attributes.uv; const k = 2.1;
  for (let i = 0; i < 8; i++) uv.setXY(i, uv.getX(i) * (len / k), uv.getY(i) * (h / k));
  for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * (w / k), uv.getY(i) * (len / k));
  for (let i = 16; i < 24; i++) uv.setXY(i, uv.getX(i) * (w / k), uv.getY(i) * (h / k));
  return g;
}

export class World {
  constructor(scene, tex) {
    this.scene = scene; this.tex = tex; this.ents = new Entities(scene);
    this.chunks = []; this.nextZ = 0; this.level = 1; this.spawnCount = 0;
    // materials
    this.stoneTop = new THREE.MeshStandardMaterial({ map: tex.stone, normalMap: tex.stoneN || null, normalScale: new THREE.Vector2(0.75, 0.75), roughness: .95, metalness: 0 });
    this.stoneEdge = std(0x7a7267);
    this.railMat = std(0xaba291); this.colMat = std(0xb8ad9c); this.goldMat = new THREE.MeshStandardMaterial({ color: 0xf2b532, emissive: 0xc77d00, emissiveIntensity: .35, roughness: .3, metalness: .85 });
    const mkRock = (vertexColors, grad, tri) => { const m = new THREE.MeshStandardMaterial({ map: tex.rock, color: 0xffffff, roughness: .92, metalness: 0, flatShading: true, vertexColors }); triplanar(m, tri); withHeightGradient(m, grad); return m; };
    this.rockMat = mkRock(true, { low: [0.48, 0.4, 0.95], high: [1.02, 0.98, 1.0], yMin: -36, yMax: 10 }, { scale: 0.045, strength: 0.45, brightness: 1.15 });
    this.rockFarMat = mkRock(true, { low: [0.62, 0.56, 1.0], high: [1.1, 1.08, 1.02], yMin: -30, yMax: 24 }, { scale: 0.028, strength: 0.3, brightness: 1.25 });
    this.rockPlainMat = mkRock(false, { low: [0.5, 0.42, 0.95], high: [1.12, 1.08, 1.02], yMin: -36, yMax: 10 }, { scale: 0.09, strength: 0.4, brightness: 1.25 });
    this.rockPlainMat.color.setHSL(0.735, 0.5, 0.62);
    const mkGrass = (vertexColors) => { const m = new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xffffff, roughness: .95, metalness: 0, flatShading: true, vertexColors }); triplanar(m, { scale: 0.22, strength: 0.75, brightness: 1.15 }); return m; };
    this.grassMat = mkGrass(true); this.grassPlainMat = mkGrass(false); this.grassPlainMat.color.setHSL(0.26, 0.62, 0.55);
    const bb = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: .95, metalness: 0, color: 0xffffff });
    this.pineMat = bb(tex.treePine); this.roundMat = bb(tex.treeRound); this.bushMat = bb(tex.bush);
    this.crystalMat = new THREE.MeshPhysicalMaterial({ color: 0xe0b3ff, emissive: 0xb86cff, emissiveIntensity: 0.55, roughness: .15, metalness: 0, transparent: true, opacity: .92, flatShading: true });
    this.ents.restyle(this.rockPlainMat, this.grassPlainMat);
    this._buildEnvironment();
    for (let i = 0; i < NUM_CHUNKS; i++) this.chunks.push(this._makeChunk());
    this.reset();
  }
  _inst(geo, mat, count, { shadow = false, receive = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, count); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = receive; m.count = count;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3); for (let i = 0; i < count; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
    this.scene.add(m); return m;
  }
  _buildEnvironment() {
    const N = NUM_CHUNKS;
    this.geoNear = [perFaceColors(rockColumn(7, 4, 0.22), ROCK_HSL), perFaceColors(rockColumn(8, 4, 0.18), ROCK_HSL)];
    this.geoFar = perFaceColors(rockColumn(7, 3, 0.2), { ...ROCK_HSL, l: 0.66, lVar: 0.08 });
    this.cliffA = this._inst(this.geoNear[0], this.rockMat, N * PER.near / 2);
    this.cliffB = this._inst(this.geoNear[1], this.rockMat, N * PER.near / 2);
    this.cliffFar = this._inst(this.geoFar, this.rockFarMat, N * PER.far);
    this.caps = this._inst(perFaceColors(grassCap(7), GRASS_HSL), this.grassMat, N * (PER.near + PER.far));
    const bbGeo = crossBillboardGeometry(1, 1);
    this.pines = this._inst(bbGeo, this.pineMat, N * PER.trees, { shadow: true });
    this.rounds = this._inst(bbGeo, this.roundMat, N * PER.trees, { shadow: true });
    this.bushes = this._inst(bbGeo, this.bushMat, N * PER.bushes);
    const cryGeo = new THREE.OctahedronGeometry(1, 0); cryGeo.scale(0.5, 1.5, 0.5);
    this.crystals = this._inst(cryGeo, this.crystalMat, N * PER.crystals);
    this.rocks = this._inst(perFaceColors(rockBlob(1, 0.3), ROCK_HSL), this.rockMat, N * PER.rocks);
    // painted floating islands far away (sprites)
    this.islandSprites = [];
    for (let i = 0; i < N * PER.islands; i++) { const map = i % 2 ? this.tex.islandB : this.tex.islandA; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.25, depthWrite: true, color: 0xffffff })); this.scene.add(s); this.islandSprites.push(s); }
    // clouds (sprites)
    const cloudTex = cloudTexture(); this.clouds = [];
    for (let i = 0; i < N * PER.clouds; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(.35, .6), depthWrite: false, color: 0xeef2ff })); s.userData.drift = rand(-.4, .4); this.scene.add(s); this.clouds.push(s); }
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0xcdd7f5, transparent: true, opacity: .75 }));
    mist.rotation.x = -Math.PI / 2; mist.position.y = -44; this.scene.add(mist); this.mist = mist;
    // ambient sparkles
    this.sparkN = 180; const sp = new Float32Array(this.sparkN * 3); this.sparkOff = [];
    for (let i = 0; i < this.sparkN; i++) { this.sparkOff.push({ x: rand(-14, 14), y: rand(0.5, 11), z: rand(0, 90), s: rand(.4, 1.2), ph: rand(0, 6) }); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparkles = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,240,200,0.5)', 'rgba(255,220,150,0)'), size: 0.26, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff1c8, sizeAttenuation: true }));
    this.sparkles.frustumCulled = false; this.scene.add(this.sparkles);
    // backdrop painting
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(420, 280), new THREE.MeshBasicMaterial({ map: this.tex.backdrop, fog: false, depthWrite: false }));
    bd.position.set(0, 46, -215); this.scene.add(bd); this.backdrop = bd;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._e = new THREE.Euler(); this._c = new THREE.Color();
    this.islandGeo = { bottom: perFaceColors(islandBottom(7), ROCK_HSL), cap: perFaceColors(grassCap(7), GRASS_HSL) };
  }
  _setInst(mesh, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, color = null) {
    this._p.set(x, y, z); this._e.set(rx, ry, rz); this._q.setFromEuler(this._e); this._s.set(sx, sy, sz); this._m.compose(this._p, this._q, this._s); mesh.setMatrixAt(i, this._m);
    if (color) mesh.setColorAt(i, color);
  }
  _hideInst(mesh, i) { this._setInst(mesh, i, 0, -500, 0, 0.001, 0.001, 0.001); }
  _makeChunk() {
    const g = new THREE.Group(); this.scene.add(g);
    const mats = [this.stoneTop, this.stoneTop, this.stoneTop, this.stoneEdge, this.stoneTop, this.stoneTop];
    const mk = (len) => { const m = new THREE.Mesh(floorGeometry(BRIDGE_W, len), mats); m.receiveShadow = true; m.castShadow = true; g.add(m); return m; };
    const preLen = (CHUNK_LEN - GAP_LEN) / 2;
    const full = mk(CHUNK_LEN), pre = mk(preLen), post = mk(preLen);
    const edgeA = new THREE.Group(), edgeB = new THREE.Group();
    const rockG = rockBlob(0, 0.3);
    for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(rockG, this.stoneEdge); r.position.set(rand(-3.4, 3.4), rand(-0.9, -0.2), rand(-0.6, 0.3)); r.scale.set(rand(.3, .7), rand(.3, .7), rand(.3, .7)); r.rotation.set(rand(0, 6), rand(0, 6), 0); r.castShadow = true; edgeA.add(r); const r2 = r.clone(); r2.position.set(rand(-3.4, 3.4), rand(-0.9, -0.2), rand(-0.3, 0.6)); edgeB.add(r2); }
    g.add(edgeA); g.add(edgeB);
    const railGeoFull = new THREE.BoxGeometry(0.45, 0.55, CHUNK_LEN), railGeoPart = new THREE.BoxGeometry(0.45, 0.55, preLen);
    const rails = [];
    for (const sx of [-1, 1]) { const rf = new THREE.Mesh(railGeoFull, this.railMat); rf.castShadow = true; rf.receiveShadow = true; g.add(rf); const ra = new THREE.Mesh(railGeoPart, this.railMat); ra.castShadow = true; g.add(ra); const rb = new THREE.Mesh(railGeoPart, this.railMat); rb.castShadow = true; g.add(rb); rails.push({ sx, rf, ra, rb }); }
    const cols = [];
    const colGeo = new THREE.BoxGeometry(1.0, 3.2, 1.0), capGeo = new THREE.BoxGeometry(1.35, 0.35, 1.35), hookGeo = new THREE.TorusGeometry(0.45, 0.13, 10, 20, Math.PI * 1.5), knobGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), bandGeo = new THREE.BoxGeometry(1.08, 0.18, 1.08);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group(); const sx = i % 2 ? 1 : -1;
      const col = new THREE.Mesh(colGeo, this.colMat); col.position.y = 1.6; col.castShadow = true; col.receiveShadow = true; c.add(col);
      const cap = new THREE.Mesh(capGeo, this.colMat); cap.position.y = 3.35; cap.castShadow = true; c.add(cap);
      const band = new THREE.Mesh(bandGeo, this.goldMat); band.position.y = 2.6; c.add(band);
      const knob = new THREE.Mesh(knobGeo, this.goldMat); knob.position.set(0, 3.95, 0); knob.castShadow = true; c.add(knob);
      const hook = new THREE.Mesh(hookGeo, this.goldMat); hook.position.set(-sx * 0.35, 4.2, 0); hook.rotation.y = Math.PI / 2; hook.rotation.z = sx > 0 ? -0.4 : Math.PI + 0.4; hook.castShadow = true; c.add(hook);
      g.add(c); cols.push(c);
    }
    const islands = [];
    const bbGeo = crossBillboardGeometry(1, 1);
    for (let i = 0; i < 3; i++) {
      const isl = new THREE.Group();
      const bottom = new THREE.Mesh(this.islandGeo.bottom, this.rockMat); bottom.scale.set(1, 1.1, 1); bottom.castShadow = true; isl.add(bottom);
      const cap = new THREE.Mesh(this.islandGeo.cap, this.grassMat); cap.scale.set(1.04, 0.22, 1.04); cap.receiveShadow = true; isl.add(cap);
      const ruin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), this.colMat); ruin.position.set(0.35, 0.65, 0.1); ruin.castShadow = true; isl.add(ruin);
      const ruin2 = ruin.clone(); ruin2.position.set(-0.3, 0.5, -0.25); ruin2.scale.y = 0.6; isl.add(ruin2);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.26), this.colMat); lintel.position.set(0.02, 1.0, -0.08); lintel.rotation.y = 0.3; isl.add(lintel);
      const tree = new THREE.Mesh(bbGeo, i % 2 ? this.roundMat : this.pineMat); tree.scale.set(0.9, 0.9, 0.9); tree.position.set(-0.45, 0.2, 0.4); tree.castShadow = true; isl.add(tree);
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), this.crystalMat); cry.scale.set(1, 1.6, 1); cry.position.set(0.5, 0.4, -0.45); isl.add(cry);
      isl.userData = { tree, ruin, ruin2, lintel, cry };
      g.add(isl); islands.push(isl);
    }
    return { group: g, full, pre, post, edgeA, edgeB, rails, cols, islands, z0: 0, gap: false, gapStart: 0, gapEnd: 0, index: 0 };
  }
  reset() {
    this.ents.releaseAll(); this.nextZ = 20; this.spawnCount = 0; this.level = 1; this._lastGap = false; this._prevWasGap = false;
    for (let i = 0; i < NUM_CHUNKS; i++) this._placeChunk(this.chunks[i], i);
  }
  setLevel(l) { this.level = l; }
  _placeChunk(ch, i) {
    const z0 = this.nextZ; this.nextZ -= CHUNK_LEN; ch.z0 = z0; ch.index = this.spawnCount++;
    this.ents.releaseChunk(ch);
    const L = this.level; const warm = ch.index < 1; const intro = ch.index < 5;
    const gapAllowed = !intro && (!this._lastGap || (L >= 3 && Math.random() < 0.45));
    ch.gap = intro ? ch.index === 4 : (gapAllowed && Math.random() < (L >= 5 ? 0.42 : L >= 2 ? 0.34 : 0.26));
    this._lastGap = ch.gap;
    const preLen = (CHUNK_LEN - GAP_LEN) / 2; const center = z0 - CHUNK_LEN / 2;
    ch.full.visible = !ch.gap; ch.full.position.set(0, -0.7, center);
    ch.pre.visible = ch.gap; ch.pre.position.set(0, -0.7, z0 - preLen / 2); ch.post.visible = ch.gap; ch.post.position.set(0, -0.7, z0 - CHUNK_LEN + preLen / 2);
    ch.gapStart = z0 - preLen; ch.gapEnd = z0 - preLen - GAP_LEN;
    ch.edgeA.visible = ch.gap; ch.edgeA.position.set(0, 0, ch.gapStart); ch.edgeB.visible = ch.gap; ch.edgeB.position.set(0, 0, ch.gapEnd);
    for (const r of ch.rails) { const x = r.sx * (BRIDGE_W / 2 - 0.22); r.rf.visible = !ch.gap; r.rf.position.set(x, 0.27, center); r.ra.visible = ch.gap; r.ra.position.set(x, 0.27, z0 - preLen / 2); r.rb.visible = ch.gap; r.rb.position.set(x, 0.27, z0 - CHUNK_LEN + preLen / 2); }
    ch.cols.forEach((c, k) => { const sx = k % 2 ? 1 : -1; const zz = k < 2 ? z0 - 1.5 : z0 - CHUNK_LEN + 1.5; c.position.set(sx * (BRIDGE_W / 2 + 0.3), 0, zz); });
    ch.islands.forEach((isl, k) => {
      const sx = k === 2 ? pick([-1, 1]) : (k ? 1 : -1); const vis = Math.random() < 0.75; isl.visible = vis; if (!vis) return;
      const s = rand(2.2, 5); isl.scale.set(s, s, s); isl.position.set(sx * rand(9.5, 17), rand(-7, 6), z0 - rand(3, 27)); isl.rotation.y = rand(0, 6);
      const u = isl.userData; u.tree.visible = Math.random() < 0.75; u.tree.rotation.y = -isl.rotation.y; u.ruin.visible = u.ruin2.visible = u.lintel.visible = Math.random() < 0.5; u.cry.visible = Math.random() < 0.5;
    });
    this._placeEnvironment(ch, i);
    for (let k = 1; k < 60; k++) { const gz = -k * LEVEL_DIST; if (gz <= z0 && gz > z0 - CHUNK_LEN) { if (!ch.gap || gz > ch.gapStart || gz < ch.gapEnd) this.ents.spawn('gate', 0, 0, gz, ch); break; } }
    if (intro) this._intro(ch); else if (!warm) this._populate(ch);
  }
  _placeEnvironment(ch, ci) {
    const z0 = ch.z0; const c = this._c;
    let pi = ci * PER.trees, bi = ci * PER.bushes, capi = ci * (PER.near + PER.far);
    let treesLeft = PER.trees, bushesLeft = PER.bushes;
    const tree = (x, y, z, s) => { const pine = Math.random() < 0.6; c.setHSL(0, 0, rand(.9, 1.05)); this._setInst(pine ? this.pines : this.rounds, pi, x, y, z, s, s * (pine ? 1.15 : 1), s, rand(0, 6), 0, 0, c); this._hideInst(pine ? this.rounds : this.pines, pi); pi++; treesLeft--; };
    const cliffAt = (mesh, idx, far, k, n) => {
      const sx = k < n / 2 ? -1 : 1; const kk = k % (n / 2);
      const zz = z0 - kk * (CHUNK_LEN / (n / 2)) - rand(0, 3);
      const spire = !far && Math.random() < 0.3;
      const x = far ? sx * rand(26, 40) : sx * rand(13, 21);
      const w = far ? rand(8, 14) : (spire ? rand(1.6, 3.2) : rand(3.6, 7.5));
      const h = far ? rand(30, 60) : rand(16, 45);
      const top = far ? rand(5, 18) : (spire ? rand(3, 13) : rand(-3, 7));
      c.setHSL(0, 0, rand(.85, 1.08));
      this._setInst(mesh, idx, x, top, zz, w, h, w * rand(.75, 1.3), rand(0, 6), 0, 0, c);
      const capVis = Math.random() < 0.8; if (capVis) { c.setHSL(0, 0, rand(.9, 1.1)); this._setInst(this.caps, capi, x, top, zz, w * 1.02, 0.28 + w * 0.03, w * rand(.75, 1.3) * 1.02, 0, 0, 0, c); } else this._hideInst(this.caps, capi); capi++;
      if (capVis && !far && !spire) {
        const nT = Math.min(treesLeft, randi(0, 2)); for (let t = 0; t < nT; t++) tree(x + rand(-w * .35, w * .35), top + 0.15, zz + rand(-w * .35, w * .35), rand(2.2, 4.2));
        const nB = Math.min(bushesLeft, randi(0, 2)); for (let b = 0; b < nB; b++) { const s = rand(1.0, 1.8); c.setHSL(0, 0, rand(.9, 1.05)); this._setInst(this.bushes, bi, x + rand(-w * .4, w * .4), top + 0.1, zz + rand(-w * .4, w * .4), s, s, s, rand(0, 6), 0, 0, c); bi++; bushesLeft--; }
      }
      if (far && capVis && treesLeft > 0 && Math.random() < 0.7) tree(x + rand(-w * .3, w * .3), top + 0.2, zz + rand(-w * .3, w * .3), rand(5, 8));
    };
    const half = PER.near / 2;
    for (let k = 0; k < PER.near; k++) { const mesh = k % 2 ? this.cliffB : this.cliffA; const idx = ci * half + Math.floor(k / 2); cliffAt(mesh, idx, false, k, PER.near); }
    for (let k = 0; k < PER.far; k++) cliffAt(this.cliffFar, ci * PER.far + k, true, k, PER.far);
    while (treesLeft-- > 0) { this._hideInst(this.pines, pi); this._hideInst(this.rounds, pi); pi++; }
    while (bushesLeft-- > 0) { this._hideInst(this.bushes, bi); bi++; }
    for (let k = 0; k < PER.crystals; k++) {
      const sx = k % 2 ? 1 : -1; const vis = Math.random() < 0.8; const s = vis ? rand(1, 3.2) : 0.001;
      this._setInst(this.crystals, ci * PER.crystals + k, sx * rand(6.5, 12), rand(-8, 7), z0 - rand(0, CHUNK_LEN), s, s, s, rand(0, 6), rand(-.3, .3), rand(-.3, .3));
    }
    for (let k = 0; k < PER.rocks; k++) {
      const sx = k % 2 ? 1 : -1; const vis = Math.random() < 0.65; const s = vis ? rand(0.8, 2.4) : 0.001;
      c.setHSL(0, 0, rand(.85, 1.05));
      this._setInst(this.rocks, ci * PER.rocks + k, sx * rand(6, 11.5), rand(-14, 2), z0 - rand(0, CHUNK_LEN), s, s * 0.75, s, rand(0, 6), rand(0, 6), 0, c);
    }
    for (let k = 0; k < PER.islands; k++) {
      const s = this.islandSprites[ci * PER.islands + k]; const sx = k ? 1 : -1; const vis = Math.random() < 0.8; s.visible = vis; if (!vis) continue;
      const sc = rand(16, 34); s.position.set(sx * rand(26, 62), rand(10, 36), z0 - rand(0, CHUNK_LEN)); s.scale.set(sc, sc, 1);
    }
    for (let k = 0; k < PER.clouds; k++) {
      const s = this.clouds[ci * PER.clouds + k]; const sc = rand(22, 48);
      s.position.set(rand(-30, 30), rand(-30, -8), z0 - rand(0, CHUNK_LEN)); s.scale.set(sc, sc * 0.5, 1); s.material.opacity = rand(.5, .85);
    }
    for (const m of [this.cliffA, this.cliffB, this.cliffFar, this.caps, this.pines, this.rounds, this.bushes, this.crystals, this.rocks]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  _intro(ch) {
    this._cur = ch; const E = this.ents; const z0 = ch.z0;
    switch (ch.index) {
      case 1: this._coinLine(0, z0 - 8, 7); break;
      case 2: E.spawn('crates', 0, 0, z0 - 14, ch, { n: 4 }); this._coinLine(-1, z0 - 10, 4); this._coinLine(1, z0 - 10, 4); break;
      case 3: E.spawn('urchin', 0, 0.6, z0 - 10, ch); this._coinArc(0, z0 - 10, 5, 6, 2.3); E.spawn('urchin', 1 * LANE_W, 0.6, z0 - 22, ch); this._coinLine(-1, z0 - 18, 4); break;
      case 4: { const hz = z0 - CHUNK_LEN / 2; E.spawn('hook', 0, 0, hz, ch, { zOffset: -HOOK_AHEAD }); for (let i = 0; i < 9; i++) { const t = i / 8; this.ents.spawnCoin(0, 0.9 + Math.sin(t * Math.PI) * 3.4, hz + 10 - t * 20, ch); } for (let i = 0; i < 4; i++) this.ents.spawnCoin(0, 3.2 - i * 0.5, hz - 12 - i * 1.8, ch); this._prevWasGap = true; break; }
    }
  }
  // ---------- spawning ----------
  _coinLine(lane, z, n, step = 1.7, y = 0.9) { for (let i = 0; i < n; i++) this.ents.spawnCoin(lane * LANE_W, y, z - i * step, this._cur); }
  _coinArc(lane, zc, n = 5, span = 5, peak = 2.4) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const y = 0.9 + Math.sin(t * Math.PI) * (peak - 0.9); this.ents.spawnCoin(lane * LANE_W, y, zc + span / 2 - t * span, this._cur); } }
  _lanes() { return [-1, 0, 1]; }
  _populate(ch) {
    this._cur = ch; const L = this.level; const E = this.ents; const z0 = ch.z0;
    if (ch.gap) {
      const hz = z0 - CHUNK_LEN / 2;
      E.spawn('hook', 0, 0, hz, ch, { zOffset: -HOOK_AHEAD });
      for (let i = 0; i < 9; i++) { const t = i / 8; const z = hz + 10 - t * 20; const y = 0.9 + Math.sin(t * Math.PI) * 3.4; this.ents.spawnCoin(0, y, z, ch); }
      if (L >= 4 && Math.random() < 0.5 && !this._prevWasGap) { const lane = pick([-1, 1]); E.spawn('urchin', lane * LANE_W, 0.6, z0 - 4, ch); }
      // perfect-release reward: high coins past the landing, reachable only when released well
      for (let i = 0; i < 4; i++) this.ents.spawnCoin(0, 3.2 - i * 0.5, hz - 12 - i * 1.8, ch);
      this._prevWasGap = true;
      return;
    }
    const afterGap = this._prevWasGap; this._prevWasGap = false;
    const slots = afterGap ? [z0 - 14, z0 - 26] : [z0 - 6, z0 - 16, z0 - 26];
    const density = Math.min(slots.length, L <= 1 ? 1 : L <= 3 ? 2 : 3);
    const picks = slots.map((z, i) => ({ z, i })).sort(() => Math.random() - 0.5).slice(0, density).sort((a, b) => b.z - a.z);
    for (const { z } of picks) {
      const choices = ['coins', 'urchin', 'crates', 'pillar', 'urchin'];
      if (L >= 2) choices.push('urchin2', 'coinsAll', 'urchinFloat', 'crates');
      if (L >= 3) choices.push('golem', 'totem', 'pillarLong', 'golem');
      if (L >= 4) choices.push('golem2', 'mix', 'totemUrchin', 'totem');
      if (L >= 6) choices.push('wall', 'totemPair', 'golem2');
      const kind = pick(choices);
      const lane = pick(this._lanes());
      const other = (l) => pick(this._lanes().filter(x => x !== l));
      switch (kind) {
        case 'coins': this._coinLine(lane, z + 3, 5); break;
        case 'coinsAll': for (const l of this._lanes()) this._coinLine(l, z + 2, 4); break;
        case 'urchin': E.spawn('urchin', lane * LANE_W, 0.6, z, ch); this._coinArc(lane, z, 5, 6, 2.3); this._coinLine(other(lane), z + 2, 3); break;
        case 'urchin2': { const l2 = other(lane); E.spawn('urchin', lane * LANE_W, 0.6, z, ch); E.spawn('urchin', l2 * LANE_W, 0.6, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 5); break; }
        case 'urchinFloat': E.spawn('urchin', lane * LANE_W, 1.9, z, ch, { float: true }); this._coinLine(lane, z + 4, 3, 1.4, 0.9); break;
        case 'crates': E.spawn('crates', lane * LANE_W, 0, z, ch); this._coinLine(other(lane), z + 2, 4); break;
        case 'pillar': E.spawn('pillar', lane * LANE_W, 0, z, ch); this._coinArc(lane, z, 5, 6, 2.2); break;
        case 'pillarLong': E.spawn('pillar', 0, 0, z, ch, { long: true }); this._coinArc(lane, z, 5, 6, 2.3); break;
        case 'golem': E.spawn('golem', lane * LANE_W, 0, z, ch); this._coinLine(other(lane), z + 3, 5); break;
        case 'totem': E.spawn('totem', lane * LANE_W, 0, z, ch); this._coinLine(other(lane), z + 3, 5); break;
        case 'totemUrchin': { const l2 = other(lane); E.spawn('totem', lane * LANE_W, 0, z, ch); E.spawn('urchin', l2 * LANE_W, 0.6, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 4); break; }
        case 'totemPair': { const l2 = other(lane); E.spawn('totem', lane * LANE_W, 0, z, ch); E.spawn('totem', l2 * LANE_W, 0, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 5); break; }
        case 'golem2': { const l2 = other(lane); E.spawn('golem', lane * LANE_W, 0, z, ch); E.spawn('golem', l2 * LANE_W, 0, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 5); break; }
        case 'mix': { const l2 = other(lane); E.spawn('golem', lane * LANE_W, 0, z, ch); E.spawn('urchin', l2 * LANE_W, 0.6, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 4); break; }
        case 'wall': { E.spawn('golem', -LANE_W, 0, z, ch); E.spawn('urchin', 0, 0.6, z, ch); E.spawn('golem', LANE_W, 0, z, ch); this._coinLine(0, z + 4, 3, 1.5); break; }
      }
    }
    if (Math.random() < 0.1) { const lane = pick(this._lanes()); E.spawn('powerup', lane * LANE_W, 0, z0 - 11, ch, { kind: Math.random() < 0.5 ? 'magnet' : 'shield' }); }
  }

  update(dt, time, player) {
    const pz = player.z;
    for (let i = 0; i < this.chunks.length; i++) { const ch = this.chunks[i]; if (ch.z0 - CHUNK_LEN > pz + 25) this._placeChunk(ch, i); }
    this.backdrop.position.set(player.x * 0.3, 46, pz - 215);
    this.mist.position.set(player.x, -44, pz - 150);
    for (const s of this.clouds) { s.position.x += s.userData.drift * dt; }
    // sparkles wrap around the player
    const pos = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < this.sparkN; i++) { const o = this.sparkOff[i]; let z = pz - o.z + ((time * 2.5) % 90); if (z > pz + 5) z -= 90; pos.setXYZ(i, o.x + Math.sin(time * o.s + o.ph) * 0.6, o.y + Math.sin(time * 0.8 * o.s + o.ph) * 0.5, z); }
    pos.needsUpdate = true;
    this.ents.update(dt, time, pz);
  }
  chunkAt(z) { for (const ch of this.chunks) if (z <= ch.z0 && z > ch.z0 - CHUNK_LEN) return ch; return null; }
}
