import * as THREE from 'three';
import { CHUNK_LEN, BRIDGE_W, GAP_LEN, HOOK_Y, HOOK_AHEAD, SIDE_HOOK_X, SIDE_HOOK_Y, LANE_W, LEVEL_DIST, rand, randi, pick, lerp } from './config.js?v=mur08zc2';
import { Entities } from './entities.js?v=mur08zc2';
import { rockColumn, rockBlob, islandBottom, grassCap, glowTexture, cloudTexture, withHeightGradient, triplanar, perFaceColors, crossBillboardGeometry } from './geo.js?v=mur08zc2';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const NUM_CHUNKS = 10;
const KEEP_BEHIND = 72; // metres of track kept behind the hero so a continue can respawn before the obstacle
const PER = { near: 12, far: 8, trees: 10, bushes: 8, crystals: 6, rocks: 5, clouds: 6, islands: 2 };
const ROCK_HSL = { h: 0.735, s: 0.56, l: 0.5, hVar: 0.02, sVar: 0.08, lVar: 0.12 };
const GRASS_HSL = { h: 0.26, s: 0.62, l: 0.55, hVar: 0.015, sVar: 0.06, lVar: 0.07 };
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, flatShading: true, ...extra });

const smooth = (t) => t * t * (3 - 2 * t);
// Strip of track between x0..x1 along -z, top height from hFn(t), t in [0,1]. Groups: 0 top, 1 sides, 2 bottom+caps.
export function stripGeometry(x0, x1, zStart, len, hFn, thick, { uvScale = 2.1, segs = 30 } = {}) {
  const pos = [], nrm = [], uv = [], idx = []; const groups = [];
  const w = x1 - x0;
  const addStrip = (fn, flipNormal = false) => {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) { const t = i / segs; const [a, b] = fn(t); pos.push(...a, ...b); uv.push(0, t * len / uvScale, 1, t * len / uvScale); }
    for (let i = 0; i < segs; i++) { const o = base + i * 2; if (!flipNormal) idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); else idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  };
  const z = (t) => zStart - t * len;
  let g0 = idx.length;
  addStrip((t) => [[x0, hFn(t), z(t)], [x1, hFn(t), z(t)]]);
  // scale top uv by width
  for (let i = 0; i < (segs + 1) * 2; i++) { uv[i * 2] *= w / uvScale; }
  groups.push([g0, idx.length - g0, 0]); g0 = idx.length;
  addStrip((t) => [[x0, hFn(t) - thick, z(t)], [x0, hFn(t), z(t)]]);
  addStrip((t) => [[x1, hFn(t), z(t)], [x1, hFn(t) - thick, z(t)]]);
  groups.push([g0, idx.length - g0, 1]); g0 = idx.length;
  addStrip((t) => [[x1, hFn(t) - thick, z(t)], [x0, hFn(t) - thick, z(t)]]);
  // caps
  const cap = (t, flip) => { const b = pos.length / 3; const y = hFn(t), zz = z(t); pos.push(x0, y, zz, x1, y, zz, x0, y - thick, zz, x1, y - thick, zz); uv.push(0, 0, 1, 0, 0, 1, 1, 1); if (flip) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); else idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); };
  cap(0, false); cap(1, true);
  groups.push([g0, idx.length - g0, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  for (const [start, count, mi] of groups) g.addGroup(start, count, mi);
  g.computeVertexNormals(); return g;
}
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
    this.stoneTop = new THREE.MeshStandardMaterial({ color: 0xcfc6b6, map: tex.slabs || tex.stone, normalMap: tex.stoneN || null, normalScale: new THREE.Vector2(0.6, 0.6), roughness: .92, metalness: 0 });
    this.grassEdgeMat = new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xb6e07a, roughness: .95, metalness: 0 });
    this.stoneEdge = std(0x7a7267);
    this.railMat = std(0xaba291); this.colMat = std(0xb8ad9c); this.woodMat = std(0x9c6b3a); this.ropeMat = std(0x8b6a3e); this.ledgeMat = std(0xb0a28e); this.goldMat = new THREE.MeshStandardMaterial({ color: 0xf2b532, emissive: 0xc77d00, emissiveIntensity: .35, roughness: .3, metalness: .85 });
    const mkRock = (vertexColors, grad, tri) => { const m = new THREE.MeshStandardMaterial({ map: tex.rock, color: 0xffffff, roughness: .92, metalness: 0, flatShading: true, vertexColors }); triplanar(m, tri); withHeightGradient(m, grad); return m; };
    this.rockMat = mkRock(true, { low: [0.48, 0.4, 0.95], high: [1.02, 0.98, 1.0], yMin: -36, yMax: 10 }, { scale: 0.035, strength: 0.22, brightness: 1.1 });
    this.rockFarMat = mkRock(true, { low: [0.62, 0.56, 1.0], high: [1.1, 1.08, 1.02], yMin: -30, yMax: 24 }, { scale: 0.028, strength: 0.3, brightness: 1.25 });
    this.rockPlainMat = mkRock(false, { low: [0.5, 0.42, 0.95], high: [1.12, 1.08, 1.02], yMin: -36, yMax: 10 }, { scale: 0.09, strength: 0.4, brightness: 1.25 });
    this.rockPlainMat.color.setHSL(0.735, 0.5, 0.62);
    const mkGrass = (vertexColors) => { const m = new THREE.MeshStandardMaterial({ map: tex.grass, color: 0xffffff, roughness: .95, metalness: 0, flatShading: true, vertexColors }); triplanar(m, { scale: 0.22, strength: 0.75, brightness: 1.15 }); return m; };
    this.grassMat = mkGrass(true); this.grassPlainMat = mkGrass(false); this.grassPlainMat.color.setHSL(0.26, 0.62, 0.55);
    const bb = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: .95, metalness: 0, color: 0xffffff });
    this.pineMat = bb(tex.treePine); this.roundMat = bb(tex.treeRound); this.bushMat = bb(tex.bush);
    this.crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x7a4fd0, emissiveIntensity: 0.28, roughness: .32, metalness: 0, flatShading: true });
    this.wallRockMat = this.rockMat;
    this.ents.restyle(this.rockPlainMat, this.grassPlainMat); this.ents.heightAt = (z) => this.heightAt(z);
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
    const cryGeo = (() => {
      const body = new THREE.CylinderGeometry(0.5, 0.56, 2, 6, 1); body.translate(0, 1, 0);
      const tip = new THREE.ConeGeometry(0.5, 0.75, 6, 1); tip.translate(0, 2.375, 0);
      const g = BGU.mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
      const p = g.attributes.position, col = new Float32Array(p.count * 3), lo = new THREE.Color(0x6f55d8), hi = new THREE.Color(0xf6d2ff), c = new THREE.Color();
      for (let i = 0; i < p.count; i += 3) { const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3; c.copy(lo).lerp(hi, Math.min(1, Math.pow(y / 2.75, 0.8))).offsetHSL(rand(-0.01, 0.01), 0, rand(-0.03, 0.04)); for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
    })();
    this.crystals = this._inst(cryGeo, this.crystalMat, N * PER.crystals, { shadow: false });
    this.rocks = this._inst(perFaceColors(rockBlob(1, 0.3), ROCK_HSL), this.rockMat, N * PER.rocks);
    // painted floating islands far away (sprites)
    this.islandSprites = [];
    for (let i = 0; i < N * PER.islands; i++) { const map = i % 2 ? this.tex.islandB : this.tex.islandA; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.25, depthWrite: true, color: 0xffffff })); this.scene.add(s); this.islandSprites.push(s); }
    // clouds (sprites)
    const cloudTex = cloudTexture(); this.clouds = [];
    for (let i = 0; i < N * PER.clouds; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(.35, .6), depthWrite: false, color: 0xeef2ff })); s.userData.drift = rand(-.4, .4); this.scene.add(s); this.clouds.push(s); }
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = 256; glowCanvas.height = 8; { const g2 = glowCanvas.getContext('2d'); const gr = g2.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#3d4fb0'); gr.addColorStop(0.32, '#6fb6ff'); gr.addColorStop(0.5, '#e8fbff'); gr.addColorStop(0.68, '#6fb6ff'); gr.addColorStop(1, '#3d4fb0'); g2.fillStyle = gr; g2.fillRect(0, 0, 256, 8); }
    const glowTex = new THREE.CanvasTexture(glowCanvas); glowTex.colorSpace = THREE.SRGBColorSpace;
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(90, 600), new THREE.MeshBasicMaterial({ map: glowTex, fog: false, transparent: true, opacity: 0.95, depthWrite: false }));
    mist.rotation.x = -Math.PI / 2; mist.position.y = -34; mist.renderOrder = -1; this.scene.add(mist); this.mist = mist;
    const shaftCanvas = document.createElement('canvas'); shaftCanvas.width = 64; shaftCanvas.height = 256; { const g2 = shaftCanvas.getContext('2d'); const gr = g2.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(230,250,255,0.9)'); gr.addColorStop(1, 'rgba(230,250,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 256); const gx = g2.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g2.globalCompositeOperation = 'destination-out'; g2.fillStyle = gx; g2.fillRect(0, 0, 64, 256); }
    const shaftTex = new THREE.CanvasTexture(shaftCanvas); this.shafts = [];
    for (let i = 0; i < N * 2; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 34), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); this.scene.add(m); this.shafts.push(m); }
    // ambient sparkles
    this.sparkN = 180; const sp = new Float32Array(this.sparkN * 3); this.sparkOff = [];
    for (let i = 0; i < this.sparkN; i++) { this.sparkOff.push({ x: rand(-14, 14), y: rand(0.5, 11), z: rand(0, 90), s: rand(.4, 1.2), ph: rand(0, 6) }); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparkles = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,240,200,0.5)', 'rgba(255,220,150,0)'), size: 0.26, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff1c8, sizeAttenuation: true }));
    this.sparkles.frustumCulled = false; this.scene.add(this.sparkles);
    // backdrop painting
    const bdMat = new THREE.MeshBasicMaterial({ map: this.tex.backdrop, fog: false, depthWrite: false }); bdMat.defines = { NO_BEND: '' };
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(520, 280), bdMat);
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
    const preLen = (CHUNK_LEN - GAP_LEN) / 2;
    const edgeA = new THREE.Group(), edgeB = new THREE.Group();
    const rockG = rockBlob(0, 0.3);
    for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(rockG, this.stoneEdge); r.position.set(rand(-3.4, 3.4), rand(-0.9, -0.2), rand(-0.6, 0.3)); r.scale.set(rand(.3, .7), rand(.3, .7), rand(.3, .7)); r.rotation.set(rand(0, 6), rand(0, 6), 0); r.castShadow = true; edgeA.add(r); const r2 = r.clone(); r2.position.set(rand(-3.4, 3.4), rand(-0.9, -0.2), rand(-0.3, 0.6)); edgeB.add(r2); }
    g.add(edgeA); g.add(edgeB);
    const cols = [];
    const colGeo = new THREE.BoxGeometry(1.0, 3.2, 1.0), capGeo = new THREE.BoxGeometry(1.35, 0.35, 1.35), hookGeo = new THREE.TorusGeometry(0.45, 0.13, 10, 20, Math.PI * 1.5), knobGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), bandGeo = new THREE.BoxGeometry(1.08, 0.18, 1.08);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group(); const sx = i % 2 ? 1 : -1;
      const col = new THREE.Mesh(colGeo, this.colMat); col.position.y = 1.6; col.castShadow = true; col.receiveShadow = true; c.add(col);
      const cap = new THREE.Mesh(capGeo, this.colMat); cap.position.y = 3.35; cap.castShadow = true; c.add(cap);
      const band = new THREE.Mesh(bandGeo, this.goldMat); band.position.y = 2.6; c.add(band);
      const knob = new THREE.Mesh(knobGeo, this.goldMat); knob.position.set(0, 3.8, 0); knob.scale.set(1.6, 0.7, 1.6); knob.castShadow = true; c.add(knob);
      const horn = new THREE.Mesh(this._hornGeo || (this._hornGeo = this._makeHorn()), this.goldMat); horn.position.set(sx * 0.1, 4.25, 0); horn.scale.set(sx, 1, 1); horn.castShadow = true; c.add(horn);
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
    return { group: g, edgeA, edgeB, cols, islands, meshes: [], z0: 0, y0: 0, y1: 0, h: 0, profile: 'flat', gap: false, gapStart: 0, gapEnd: 0, index: 0 };
  }
  reset() {
    this.ents.releaseAll(); this.nextZ = 20; this.nextY = 0; this.spawnCount = 0; this.level = 1; this._lastGap = false; this._prevWasGap = false; this._lastProfile = 'flat';
    for (let i = 0; i < NUM_CHUNKS; i++) this._placeChunk(this.chunks[i], i);
  }
  setLevel(l) { this.level = l; }
  _placeChunk(ch, i) {
    const z0 = this.nextZ; this.nextZ -= CHUNK_LEN; ch.z0 = z0; ch.index = this.spawnCount++;
    this.ents.releaseChunk(ch);
    const L = this.level; const warm = ch.index < 1; const intro = ch.index < 5;
    const gapAllowed = !intro && (!this._lastGap || (L >= 3 && Math.random() < 0.45));
    ch.gap = intro ? ch.index === 4 : (gapAllowed && Math.random() < (L >= 5 ? 0.42 : L >= 2 ? 0.34 : 0.26));
    if (this._gauntletNext) ch.gap = false;
    this._lastGap = ch.gap;
    const preLen = (CHUNK_LEN - GAP_LEN) / 2;
    ch.gapStart = z0 - preLen; ch.gapEnd = z0 - preLen - GAP_LEN;
    // ---- vertical profile ----
    ch.y0 = this.nextY; ch.h = 0; ch.skyHook = false; ch.ledge = null;
    let profile = 'flat';
    if (this._gauntletNext) { profile = 'gauntletB'; this._gauntletNext = false; }
    else if (ch.gap) profile = 'gap';
    else if (ch.index === 2) profile = 'hill';
    else if (!intro) {
      const opts = ['flat', 'flat', 'hill', 'hill'];
      if (ch.y0 < 3) opts.push('up', 'up'); if (ch.y0 > -1) opts.push('down', 'down');
      if (L >= 2 && this._lastProfile !== 'launch' && ch.y0 > -2) opts.push('launch', 'launch');
      if (L >= 2 && this._lastProfile !== 'rope') opts.push('rope', 'rope');
      if (this._lastProfile !== 'jumpgap') opts.push('jumpgap', 'jumpgap');
      if (L >= 2 && this._lastProfile !== 'holes') opts.push('holes', 'holes');
      if (L >= 3 && this._lastProfile !== 'hookchain' && this._lastProfile !== 'gap') opts.push('hookchain', 'hookchain');
      if (L >= 2 && !['gap', 'hookchain', 'gauntletB'].includes(this._lastProfile) && this.spawnCount - (this._lastGauntlet || -99) > 6) opts.push('gauntlet', 'gauntlet');
      profile = this.forceProfile || pick(opts); this.forceProfile = null; // forceProfile: QA hook to place a given section next
      if (profile === 'gauntlet') { this._gauntletNext = true; this._lastGauntlet = this.spawnCount; }
    }
    ch.profile = profile; this._lastProfile = profile;
    ch.y1 = profile === 'up' ? ch.y0 + rand(2, 3) : profile === 'down' ? ch.y0 - rand(2, 3) : profile === 'launch' ? ch.y0 - 1.2 : ch.y0;
    if (profile === 'hill') ch.h = rand(1.5, 2.6);
    ch.launchZ = z0 - CHUNK_LEN * 0.6; ch.voidEnd = z0 - CHUNK_LEN * 0.9;
    // voids: [t0, t1, lanes[]] — lanes that are missing over that stretch
    const ALL = [-1, 0, 1], preT = (CHUNK_LEN - GAP_LEN) / 2 / CHUNK_LEN;
    ch.voids = [];
    if (profile === 'gap') ch.voids.push([preT, 1 - preT, ALL]);
    else if (profile === 'launch') ch.voids.push([0.6, 0.9, ALL]);
    else if (profile === 'jumpgap') { const len = (L >= 4 ? rand(6.5, 7.5) : rand(5, 6)) / CHUNK_LEN; ch.voids.push([0.45, 0.45 + len, ALL]); }
    else if (profile === 'hookchain') ch.voids.push([0.12, 0.93, ALL]);
    else if (profile === 'gauntlet') ch.voids.push([0.1, 1.0001, ALL]);
    else if (profile === 'gauntletB') ch.voids.push([0, 0.8, ALL]);
    else if (profile === 'holes') {
      // two broken stretches; the free lanes of both are at most one lane change apart and 6 m apart
      const opts = [[-1], [1], [0], [-1, 0], [0, 1], [-1, 1]]; const free = (h) => ALL.filter(l => !h.includes(l));
      const a = pick(opts); const okB = opts.filter(b => b.join() !== a.join() && free(a).some(la => free(b).some(lb => Math.abs(la - lb) <= 1)));
      ch.voids.push([0.18, 0.42, a], [0.62, 0.86, pick(okB)]);
    }
    this.nextY = ch.y1;
    this._buildTrackMeshes(ch);
    { const fv = ch.voids.find(v => v[2].length === 3); ch.edgeA.visible = ch.edgeB.visible = !!fv;
      if (fv) { ch.edgeA.position.set(0, this.profileHeight(ch, fv[0]), ch.z0 - fv[0] * CHUNK_LEN); ch.edgeB.position.set(0, this.profileHeight(ch, fv[1]), ch.z0 - fv[1] * CHUNK_LEN); } }
    ch.cols.forEach((c, k) => { const sx = k % 2 ? 1 : -1; const zz = k < 2 ? z0 - 1.5 : z0 - CHUNK_LEN + 1.5; c.position.set(sx * (BRIDGE_W / 2 + 0.3), this.heightAt(zz), zz); });
    ch.islands.forEach((isl, k) => {
      const sx = k === 2 ? pick([-1, 1]) : (k ? 1 : -1); const vis = Math.random() < 0.75; isl.visible = vis; if (!vis) return;
      const s = rand(2.2, 5); isl.scale.set(s, s, s); isl.position.set(sx * rand(9.5, 17), ch.y0 + rand(-7, 6), z0 - rand(3, 27)); isl.rotation.y = rand(0, 6);
      const u = isl.userData; u.tree.visible = Math.random() < 0.75; u.tree.rotation.y = -isl.rotation.y; u.ruin.visible = u.ruin2.visible = u.lintel.visible = Math.random() < 0.5; u.cry.visible = Math.random() < 0.5;
    });
    this._placeEnvironment(ch, i);
    for (let k = 1; k < 60; k++) { const gz = -k * LEVEL_DIST; if (gz <= z0 && gz > z0 - CHUNK_LEN) { if (!ch.gap || gz > ch.gapStart || gz < ch.gapEnd) this.ents.spawn('gate', 0, 0, gz, ch); break; } }
    if (intro) this._intro(ch); else if (!warm) this._populate(ch);
  }
  _makeHorn() {
    const pts = []; for (let i = 0; i <= 48; i++) { const u = i / 48; const th = Math.PI * 0.15 + u * Math.PI * 3.3; const r = 0.95 * (1 - u * 0.8); pts.push(new THREE.Vector3(0.15 + Math.cos(th) * r * 1.05, -0.05 + Math.sin(th) * r * 0.85, Math.sin(u * Math.PI) * 0.12)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.16, 10, false);
    const p = g.attributes.position; // taper toward the tip
    const n = 65; for (let i = 0; i < p.count; i++) { const ring = Math.floor(i / 11); const u = ring / (n - 1); const c = pts[Math.min(48, Math.round(u * 48))]; const k = 1.25 - u * 0.75; p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k); }
    g.computeVertexNormals(); return g;
  }
  // continuous faceted canyon walls on both sides, deterministic in world z so chunks join without seams
  _buildWalls(ch) {
    const S = 12, z0 = ch.z0;
    for (const side of [-1, 1]) {
      const wx = (z) => side * (8.2 + 1.3 * Math.sin(z * 0.19 + side) + 0.7 * Math.sin(z * 0.53 + 2.1 * side));
      const top = (z, t) => this.profileHeight(ch, t) + 1.5 + 7.5 * (0.5 + 0.5 * Math.sin(z * 0.042 + side * 1.9)) + 1.4 * Math.sin(z * 0.29 + side);
      const rows = [0, 3.5, 9, 18, 46]; const pos = []; const capPos = [];
      for (let i = 0; i < S; i++) {
        const ta = i / S, tb = (i + 1) / S, za = z0 - ta * CHUNK_LEN, zb = z0 - tb * CHUNK_LEN;
        const ya = top(za, ta), yb = top(zb, tb);
        for (let r = 0; r < rows.length - 1; r++) {
          const off = (z, k) => side * (k === 0 ? 0 : 0.9 * Math.sin(z * 0.47 + k * 2.1) + k * 0.35);
          const a0 = [wx(za) + off(za, r), ya - rows[r], za], b0 = [wx(zb) + off(zb, r), yb - rows[r], zb];
          const a1 = [wx(za) + off(za, r + 1), ya - rows[r + 1], za], b1 = [wx(zb) + off(zb, r + 1), yb - rows[r + 1], zb];
          if (side < 0) pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1); else pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
        }
        const ia = [wx(za), ya, za], ib = [wx(zb), yb, zb], oa = [wx(za) + side * 10, ya + 0.4, za], ob = [wx(zb) + side * 10, yb + 0.4, zb];
        if (side < 0) capPos.push(...ia, ...ib, ...oa, ...oa, ...ib, ...ob); else capPos.push(...ia, ...oa, ...ib, ...ib, ...oa, ...ob);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const wall = new THREE.Mesh(perFaceColors(g, { h: 0.73, s: 0.5, l: 0.44, hVar: 0.015, sVar: 0.06, lVar: 0.08 }), this.wallRockMat); wall.receiveShadow = true;
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
      const cap = new THREE.Mesh(perFaceColors(cg, { h: 0.27, s: 0.6, l: 0.55, hVar: 0.01, sVar: 0.05, lVar: 0.05 }), this.grassMat); cap.receiveShadow = true;
      ch.group.add(wall); ch.group.add(cap); ch.meshes.push(wall, cap);
    }
  }
  // ---------- track profile ----------
  profileHeight(ch, t) {
    switch (ch.profile) {
      case 'up': case 'down': return lerp(ch.y0, ch.y1, smooth(Math.min(1, Math.max(0, t))));
      case 'hill': return ch.y0 + ch.h * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
      case 'launch': if (t < 0.3) return ch.y0; if (t < 0.6) return ch.y0 + 2.6 * smooth((t - 0.3) / 0.3); if (t < 0.9) return ch.y0 + 2.6; return ch.y1;
      default: return ch.y0;
    }
  }
  heightAt(z) { const ch = this.chunkAt(z); if (!ch) { const last = this.chunks.reduce((a, c) => (c.z0 < a.z0 ? c : a), this.chunks[0]); return z < last.z0 - CHUNK_LEN ? last.y1 : this.chunks.reduce((a, c) => (c.z0 > a.z0 ? c : a), this.chunks[0]).y0; } return this.profileHeight(ch, (ch.z0 - z) / CHUNK_LEN); }
  isNarrow(z) { const ch = this.chunkAt(z); if (!ch || ch.profile !== 'rope') return false; const t = (ch.z0 - z) / CHUNK_LEN; return t > 0.25 && t < 0.75; }
  voidAhead(z, x = 0) { const ch = this.chunkAt(z); if (!ch) return false; const t = (ch.z0 - z) / CHUNK_LEN; const lane = x < -1.1 ? -1 : x > 1.1 ? 1 : 0; return (ch.voids || []).some(v => t >= v[0] && t < v[1] && v[2].includes(lane)); }
  isLaunchVoid(z) { const ch = this.chunkAt(z); if (!ch || ch.profile !== 'launch') return false; const t = (ch.z0 - z) / CHUNK_LEN; return t >= 0.6 && t < 0.9; }
  // Highest standable surface at (x,z) not above y+0.5; -Infinity means void.
  groundY(x, z, y = 1e9) {
    const ch = this.chunkAt(z); if (!ch) return -Infinity;
    const t = (ch.z0 - z) / CHUNK_LEN; let g = -Infinity;
    const onBridge = Math.abs(x) < BRIDGE_W / 2;
    if (onBridge) {
      const lane = x < -1.1 ? -1 : x > 1.1 ? 1 : 0;
      let hole = false; for (const v of ch.voids || []) if (t >= v[0] && t < v[1] && v[2].includes(lane)) { hole = true; break; }
      if (hole) g = -Infinity;
      else if (ch.profile === 'rope' && t > 0.25 && t < 0.75 && Math.abs(x) > 1.15) g = -Infinity;
      else g = this.profileHeight(ch, t);
    }
    for (const e of this.ents.active) {
      if (e.type !== 'ledge' || !e.alive) continue;
      if (Math.abs(x - e.x) < 1.25 && z <= e.z && z > e.z - e.len && e.top <= y + 0.5) g = Math.max(g, e.top);
    }
    return g;
  }
  _clearTrackMeshes(ch) { for (const m of ch.meshes) { ch.group.remove(m); m.geometry.dispose(); } ch.meshes = []; }
  _addStrip(ch, x0, x1, t0, t1, hFn, thick, mats, shadow = true) {
    const len = (t1 - t0) * CHUNK_LEN; const zs = ch.z0 - t0 * CHUNK_LEN;
    const geo = stripGeometry(x0, x1, zs, len, (u) => hFn(t0 + u * (t1 - t0)), thick, { segs: Math.max(4, Math.round(len)) });
    const m = new THREE.Mesh(geo, mats); m.receiveShadow = true; m.castShadow = shadow; ch.group.add(m); ch.meshes.push(m); return m;
  }
  _buildTrackMeshes(ch) {
    this._clearTrackMeshes(ch);
    const H = (t) => this.profileHeight(ch, t);
    const floorMats = [this.stoneTop, this.stoneTop, this.stoneEdge]; const railMats = [this.railMat, this.railMat, this.railMat];
    const W = BRIDGE_W / 2, RX = BRIDGE_W / 2 - 0.22;
    const grassMats = [this.grassEdgeMat, this.grassEdgeMat, this.stoneEdge];
    const LX = [[-W, -1.1], [-1.1, 1.1], [1.1, W]];
    const floorLanes = (t0, t1, lanes) => {
      if (lanes.length === 3) this._addStrip(ch, -W, W, t0, t1, H, 1.4, floorMats);
      else for (const l of lanes) this._addStrip(ch, LX[l + 1][0], LX[l + 1][1], t0, t1, H, 1.4, floorMats);
      for (const sx of [-1, 1]) if (lanes.includes(sx)) {
        this._addStrip(ch, sx > 0 ? W - 0.62 : -W, sx > 0 ? W : -W + 0.62, t0, t1, (t) => H(t) + 0.07, 0.2, grassMats, false);
        this._addStrip(ch, sx * RX - 0.24, sx * RX + 0.24, t0, t1, (t) => H(t) + 0.38, 0.4, railMats, false);
      }
    };
    const floor = (t0, t1) => floorLanes(t0, t1, [-1, 0, 1]);
    if (ch.profile !== 'rope') {
      const cuts = new Set([0, 1]); for (const v of ch.voids || []) { cuts.add(v[0]); cuts.add(v[1]); }
      const ts = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < ts.length - 1; i++) {
        const a = ts[i], b = ts[i + 1], mid = (a + b) / 2; if (b - a < 1e-4) continue;
        const missing = new Set(); for (const v of ch.voids || []) if (mid >= v[0] && mid < v[1]) v[2].forEach(l => missing.add(l));
        const lanes = [-1, 0, 1].filter(l => !missing.has(l)); if (lanes.length) floorLanes(a, b, lanes);
      }
    }
    else if (ch.profile === 'rope') {
      floor(0, 0.25); floor(0.75, 1);
      const sag = (t) => -0.35 * Math.sin(Math.PI * (t - 0.25) / 0.5);
      this._addStrip(ch, -1.15, 1.15, 0.25, 0.75, (t) => H(t) + sag(t), 0.18, [this.woodMat, this.woodMat, this.woodMat]);
      for (const sx of [-1, 1]) { this._addStrip(ch, sx * 1.2 - 0.04, sx * 1.2 + 0.04, 0.25, 0.75, (t) => H(t) + 1.0 + sag(t) * 0.6, 0.08, [this.ropeMat, this.ropeMat, this.ropeMat], false); this._addStrip(ch, sx * 1.2 - 0.04, sx * 1.2 + 0.04, 0.25, 0.75, (t) => H(t) + 0.5 + sag(t) * 0.8, 0.06, [this.ropeMat, this.ropeMat, this.ropeMat], false); }
      for (const tt of [0.25, 0.75]) for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8), this.woodMat); p.position.set(sx * 1.2, H(tt) + 0.6, ch.z0 - tt * CHUNK_LEN); p.castShadow = true; ch.group.add(p); ch.meshes.push(p); }
    }
    this._buildWalls(ch);
    ch.group.traverse((o) => { o.frustumCulled = false; });
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
      const sx = k % 2 ? 1 : -1; const vis = Math.random() < 0.75; const w = vis ? rand(0.9, 2.0) : 0.001; const h = vis ? rand(2.5, 6.5) : 0.001;
      this._setInst(this.crystals, ci * PER.crystals + k, sx * rand(5.2, 7.6), ch.y0 - rand(6, 16), z0 - rand(0, CHUNK_LEN), w, h, w, rand(0, 6), rand(-.12, .12), sx * rand(0, .18));
    }
    for (let k = 0; k < 2; k++) { const m = this.shafts[ci * 2 + k]; m.position.set(rand(-5, 5), ch.y0 - 14, z0 - rand(0, CHUNK_LEN)); m.rotation.set(0, rand(-0.6, 0.6), rand(-0.25, 0.25)); m.visible = Math.random() < 0.7; }
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
  // A stretch with no road at all: four hooks overhead and on both canyon walls, crossed hook-to-hook.
  _gauntlet(ch) {
    const E = this.ents, L = this.level;
    if (ch.profile === 'gauntlet') {
      const s = pick([-1, 1]);
      const plans = [[0, s, -s, 0], [s, -s, 0, s], [0, s, -s, -s], [s, 0, -s, 0]];
      this._gPlan = { z0: ch.z0, sides: pick(plans), rings: [-9, -20, -31, -42] };
    }
    const plan = this._gPlan; if (!plan) return;
    plan.rings.forEach((rz, i) => {
      const zRing = plan.z0 + rz; const inThis = zRing <= ch.z0 && zRing > ch.z0 - CHUNK_LEN; if (!inThis) return;
      const side = plan.sides[i], last = i === plan.rings.length - 1;
      const opts = side ? { side } : { zOffset: -HOOK_AHEAD };
      if (last) opts.landDist = side ? 13 : 18; else opts.chain = true;
      E.spawn('hook', 0, 0, side ? zRing : zRing + HOOK_AHEAD, ch, opts);
      // coins along the expected swing path
      if (side) { for (let k = 0; k < 5; k++) { const t = k / 4; E.spawnCoin(lerp(side * 1.1, -side * 2.3, t), lerp(0.9, 3.4, t * t) + Math.sin(t * Math.PI) * 0.6, zRing - 1.5 - t * 8, ch); } }
      else for (let k = 0; k < 5; k++) { const t = k / 4; E.spawnCoin(0, 1.6 + Math.sin(t * Math.PI) * 3.0, zRing + 4 - t * 10, ch); }
      // danger: floating urchins on the far side of each side swing (steer into them and you lose)
      if (side && L >= 3) E.spawn('urchin', side * 2.4, 4.4, zRing - 6, ch, { float: true, air: true });
      if (!side && L >= 4 && Math.random() < 0.6) E.spawn('urchin', pick([-1, 1]) * LANE_W, rand(2.5, 4.5), zRing - 7, ch, { float: true, air: true });
    });
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
    if (ch.profile === 'launch') { // launch ramp: coins along the flight arc, nothing else
      const lz = ch.launchZ, ly = ch.y0 + 2.6; const v = 12, sp = 15;
      for (let i = 0; i < 8; i++) { const t = 0.1 + i * 0.1; this.ents.spawnCoin(0, ly + v * t - 15 * t * t - this.heightAt(lz - sp * t), lz - sp * t, ch); }
      for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.12; this.ents.spawnCoin(0, ly + 3.2 + v * t - 15 * t * t - this.heightAt(lz - sp * t), lz - sp * t, ch); } // high line: double jump
      if (L >= 3) { const lane = pick([-1, 1]); E.spawn('urchin', lane * LANE_W, 0.6, z0 - 5, ch); }
      this._prevWasGap = true; return;
    }
    if (ch.profile === 'jumpgap') { // short chasm: jump it (coins trace the jump)
      const v = ch.voids[0]; const zc = z0 - (v[0] + v[1]) / 2 * CHUNK_LEN; const span = (v[1] - v[0]) * CHUNK_LEN + 5;
      for (const l of L >= 3 ? [pick(this._lanes())] : this._lanes()) this._coinArc(l, zc, 6, span, 2.6);
      if (L >= 3 && Math.random() < 0.5) E.spawn('urchin', pick(this._lanes()) * LANE_W, 0.6, z0 - 4, ch);
      return;
    }
    if (ch.profile === 'holes') { // missing slabs in some lanes: switch lanes or jump
      for (const [a, b, lanes] of ch.voids) { const free = this._lanes().filter(l => !lanes.includes(l)); const l = pick(free); this._coinLine(l, z0 - a * CHUNK_LEN + 1, 4, 1.6); }
      if (L >= 4 && Math.random() < 0.5) { const v = ch.voids[1]; const free = this._lanes().filter(l => !v[2].includes(l)); E.spawn('swooper', pick(free) * LANE_W, 0, z0 - 26, ch); }
      return;
    }
    if (ch.profile === 'gauntlet' || ch.profile === 'gauntletB') { this._gauntlet(ch); this._prevWasGap = true; return; }
    if (ch.profile === 'hookchain') { // long chasm crossed on two hooks: swing, then whip to the next one
      const h1 = z0 - CHUNK_LEN * 0.3, h2 = z0 - CHUNK_LEN * 0.66;
      if (L >= 4 && Math.random() < 0.5) E.spawn('hook', 0, 0, h1 - 1, ch, { side: pick([-1, 1]), chain: true }); else
      E.spawn('hook', 0, 0, h1, ch, { zOffset: -HOOK_AHEAD, chain: true });
      E.spawn('hook', 0, 0, h2, ch, { zOffset: -HOOK_AHEAD, landDist: 10 });
      for (let i = 0; i < 7; i++) { const t = i / 6; this.ents.spawnCoin(0, 1.2 + Math.sin(t * Math.PI) * 3.6, h1 + 7 - t * 13, ch); }
      for (let i = 0; i < 7; i++) { const t = i / 6; this.ents.spawnCoin(0, 1.6 + Math.sin(t * Math.PI) * 3.4, h2 + 6 - t * 14, ch); }
      const nU = L >= 5 ? 4 : L >= 3 ? 2 : 0;
      for (let i = 0; i < nU; i++) { const sx = i % 2 ? 1 : -1; E.spawn('urchin', sx * LANE_W, rand(2.2, 4.8), z0 - CHUNK_LEN * (0.25 + i * 0.16), ch, { float: true, air: true }); this.ents.spawnCoin(sx * LANE_W, rand(2.5, 4), z0 - CHUNK_LEN * (0.33 + i * 0.16), ch); }
      this._prevWasGap = true; return;
    }
    if (ch.profile === 'rope') { // narrow bridge: center lane only; one threat mid-way at higher levels
      this._coinLine(0, z0 - 6, 4); this._coinLine(0, z0 - 17, 5, 1.6, 0.6);
      if (L >= 3 && Math.random() < 0.6) E.spawn('urchin', 0, 0.6, z0 - 15, ch);
      if (L >= 5 && Math.random() < 0.4) E.spawn('urchin', 0, 1.9, z0 - 21, ch, { float: true });
      return;
    }
    const slots = afterGap ? [z0 - 14, z0 - 26] : [z0 - 6, z0 - 16, z0 - 26];
    const density = Math.min(slots.length, L <= 1 ? 1 : L <= 3 ? 2 : 3);
    const picks = slots.map((z, i) => ({ z, i })).sort(() => Math.random() - 0.5).slice(0, density).sort((a, b) => b.z - a.z);
    for (const { z } of picks) {
      const choices = ['coins', 'urchin', 'crates', 'pillar', 'urchin'];
      if (L >= 2) choices.push('urchin2', 'coinsAll', 'urchinFloat', 'crates', 'swooper', 'swooper');
      if (L >= 3) choices.push('golem', 'totem', 'pillarLong', 'golem', 'charger', 'charger');
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
        case 'swooper': E.spawn('swooper', 0, 0, z, ch); this._coinLine(lane, z + 5, 4); break;
        case 'charger': E.spawn('charger', lane * LANE_W, 0, z - 6, ch); this._coinLine(other(lane), z + 2, 5); break;
        case 'totem': E.spawn('totem', lane * LANE_W, 0, z, ch); this._coinLine(other(lane), z + 3, 5); break;
        case 'totemUrchin': { const l2 = other(lane); E.spawn('totem', lane * LANE_W, 0, z, ch); E.spawn('urchin', l2 * LANE_W, 0.6, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 4); break; }
        case 'totemPair': { const l2 = other(lane); E.spawn('totem', lane * LANE_W, 0, z, ch); E.spawn('totem', l2 * LANE_W, 0, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 5); break; }
        case 'golem2': { const l2 = other(lane); E.spawn('golem', lane * LANE_W, 0, z, ch); E.spawn('golem', l2 * LANE_W, 0, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 5); break; }
        case 'mix': { const l2 = other(lane); E.spawn('golem', lane * LANE_W, 0, z, ch); E.spawn('urchin', l2 * LANE_W, 0.6, z, ch); const free = this._lanes().find(x => x !== lane && x !== l2); this._coinLine(free, z + 3, 4); break; }
        case 'wall': { E.spawn('golem', -LANE_W, 0, z, ch); E.spawn('urchin', 0, 0.6, z, ch); E.spawn('golem', LANE_W, 0, z, ch); this._coinLine(0, z + 4, 3, 1.5); break; }
      }
    }
    if (Math.random() < 0.1) { const lane = pick(this._lanes()); E.spawn('powerup', lane * LANE_W, 0, z0 - 11, ch, { kind: Math.random() < 0.5 ? 'magnet' : 'shield' }); }
    // sky hook: optional pro route over a nasty pattern (coins along the arc)
    if (L >= 2 && !afterGap && (ch.profile === 'flat' || ch.profile === 'hill') && Math.random() < 0.22) {
      const hz = z0 - 15; E.spawn('hook', 0, 0, hz, ch, { zOffset: -HOOK_AHEAD, sky: true }); ch.skyHook = true;
      for (let i = 0; i < 7; i++) { const t = i / 6; this.ents.spawnCoin(0, 1.6 + Math.sin(t * Math.PI) * 3.2, hz + 8 - t * 18, ch); }
      this._prevWasGap = true;
    }
    // ledge: safe upper route with coins, reachable by double jump
    else if (L >= 2 && (ch.profile === 'flat' || ch.profile === 'hill' || ch.profile === 'up') && Math.random() < 0.25) {
      const lane = pick([-1, 1]); const len = 18; const lz = z0 - 7;
      const e = E.spawn('ledge', lane * LANE_W, 0, lz, ch, { len }); if (e) {
        for (let i = 0; i < 7; i++) this.ents.spawnCoin(lane * LANE_W, 2.8 + 0.9, lz - 2 - i * 2, ch);
        for (let i = 0; i < 3; i++) this.ents.spawnCoin(lane * LANE_W, 1.4 + i * 0.9, lz + 5 - i * 1.6, ch);
        if (Math.random() < 0.6) E.spawn('urchin', lane * LANE_W, 0.6, lz - 8, ch);
      }
    }
  }

  update(dt, time, player) {
    const pz = player.z;
    for (let i = 0; i < this.chunks.length; i++) { const ch = this.chunks[i]; if (ch.z0 - CHUNK_LEN > pz + KEEP_BEHIND) this._placeChunk(ch, i); }
    this.backdrop.position.set(player.x * 0.2 + (this.headingD || 0) * 40, 46, pz - 215);
    this.mist.position.set(0, (this.heightAt(pz) || 0) - 34, pz - 150);
    for (const s of this.clouds) { s.position.x += s.userData.drift * dt; }
    // sparkles wrap around the player
    const pos = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < this.sparkN; i++) { const o = this.sparkOff[i]; let z = pz - o.z + ((time * 2.5) % 90); if (z > pz + 5) z -= 90; pos.setXYZ(i, o.x + Math.sin(time * o.s + o.ph) * 0.6, o.y + Math.sin(time * 0.8 * o.s + o.ph) * 0.5, z); }
    pos.needsUpdate = true;
    this.ents.update(dt, time, pz);
  }
  chunkAt(z) { for (const ch of this.chunks) if (z <= ch.z0 && z > ch.z0 - CHUNK_LEN) return ch; return null; }
}
