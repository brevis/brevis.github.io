import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from './config.js';

// Deterministic-ish jitter helper: merges vertices so displaced faces stay watertight, then displaces radially (xz) and slightly in y.
export function jitter(geo, radial = 0.18, vertical = 0.05, keepTopFlat = true) {
  const m = BGU.mergeVertices(geo, 1e-4);
  const pos = m.attributes.position; const bb = new THREE.Box3().setFromBufferAttribute(pos); const top = bb.max.y, bottom = bb.min.y;
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z); if (r < 1e-5) continue;
    const key = `${x.toFixed(3)}_${z.toFixed(3)}_${y.toFixed(3)}`;
    let k = cache.get(key); if (k === undefined) { k = 1 + rand(-radial, radial); cache.set(key, k); }
    const yy = (keepTopFlat && Math.abs(y - top) < 1e-3) ? y : y + rand(-vertical, vertical) * (top - bottom);
    pos.setXYZ(i, x * k, yy, z * k);
  }
  m.computeVertexNormals(); return m;
}
export function rockColumn(radial = 7, heightSegs = 4, jit = 0.2) {
  const g = new THREE.CylinderGeometry(0.85, 1.0, 1, radial, heightSegs); g.translate(0, -0.5, 0);
  return jitter(g, jit, 0.04, true);
}
export function rockBlob(detail = 1, jit = 0.22) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return jitter(g, jit, 0.08, false);
}
export function islandBottom(radial = 7) {
  const g = new THREE.ConeGeometry(1, 1, radial, 3); g.rotateX(Math.PI); g.translate(0, -0.5, 0);
  return jitter(g, 0.18, 0.03, true);
}
export function grassCap(radial = 7) {
  const g = new THREE.CylinderGeometry(1.0, 0.92, 1, radial, 1); g.translate(0, 0.5, 0);
  return jitter(g, 0.12, 0.0, true);
}
export function treeGeometry() {
  const c1 = new THREE.ConeGeometry(0.55, 1.1, 6); c1.translate(0, 0.95, 0);
  const c2 = new THREE.ConeGeometry(0.42, 0.9, 6); c2.translate(0, 1.55, 0);
  const c3 = new THREE.ConeGeometry(0.28, 0.7, 6); c3.translate(0, 2.05, 0);
  return BGU.mergeGeometries([c1, c2, c3]);
}
export function trunkGeometry() { const g = new THREE.CylinderGeometry(0.08, 0.11, 0.6, 6); g.translate(0, 0.3, 0); return g; }
export function coinGeometry() {
  const a = new THREE.CylinderGeometry(0.44, 0.44, 0.1, 20);
  const b = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16);
  const c = new THREE.TorusGeometry(0.36, 0.035, 6, 20); c.rotateX(Math.PI / 2);
  const g = BGU.mergeGeometries([a, b, c]); g.rotateX(Math.PI / 2); return g;
}
export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,230,150,0.55)', outer = 'rgba(255,200,80,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, inner); grd.addColorStop(0.35, mid); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) {
    const x = 128 + rand(-70, 70), y = 140 + rand(-40, 40), r = rand(45, 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Vertical gradient tint for instanced rock materials (darker & bluer at the bottom, lighter on top)
export function withHeightGradient(mat, { low = [0.5, 0.45, 0.95], high = [1.18, 1.12, 1.05], yMin = -34, yMax = 10 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGradLow = { value: new THREE.Vector3(...low) }; shader.uniforms.uGradHigh = { value: new THREE.Vector3(...high) };
    shader.uniforms.uGradY = { value: new THREE.Vector2(yMin, yMax) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwp4 = instanceMatrix * wp4;\n#endif\nwp4 = modelMatrix * wp4; vWorldY = wp4.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWorldY; uniform vec3 uGradLow; uniform vec3 uGradHigh; uniform vec2 uGradY;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gy = smoothstep(uGradY.x, uGradY.y, vWorldY); diffuseColor.rgb *= mix(uGradLow, uGradHigh, gy);');
  };
  return mat;
}
