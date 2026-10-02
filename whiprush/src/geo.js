import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from './config.js?v=muqzour7';

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
  return chainCompile(mat, (shader) => {
    shader.uniforms.uGradLow = { value: new THREE.Vector3(...low) }; shader.uniforms.uGradHigh = { value: new THREE.Vector3(...high) };
    shader.uniforms.uGradY = { value: new THREE.Vector2(yMin, yMax) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwp4 = instanceMatrix * wp4;\n#endif\nwp4 = modelMatrix * wp4; vWorldY = wp4.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWorldY; uniform vec3 uGradLow; uniform vec3 uGradHigh; uniform vec2 uGradY;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gy = smoothstep(uGradY.x, uGradY.y, vWorldY); diffuseColor.rgb *= mix(uGradLow, uGradHigh, gy);');
  });
}

// ---- compile-chain helper so several shader patches can stack on one material ----
let _chainId = 0;
export function chainCompile(mat, fn) { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (shader, renderer) => { if (prev) prev(shader, renderer); fn(shader, renderer); }; mat.userData.cacheKey = (mat.userData.cacheKey || '') + '|' + (++_chainId); const key = mat.userData.cacheKey; mat.customProgramCacheKey = () => key; return mat; }

// World-space triplanar albedo (no UV seams on jittered rocks). mat.map must be set.
export function triplanar(mat, { scale = 0.1, strength = 0.6, brightness = 1.2 } = {}) {
  return chainCompile(mat, (shader) => {
    shader.uniforms.uTriScale = { value: scale }; shader.uniforms.uTriStrength = { value: strength }; shader.uniforms.uTriBright = { value: brightness };
    if (!shader.vertexShader.includes('vTriPos')) {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 twp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ntwp = instanceMatrix * twp;\n#endif\ntwp = modelMatrix * twp; vTriPos = twp.xyz; }');
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos; uniform float uTriScale; uniform float uTriStrength; uniform float uTriBright;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
      { vec3 tn = normalize(cross(dFdx(vTriPos), dFdy(vTriPos))); vec3 tw = pow(abs(tn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec4 cx = texture2D(map, vTriPos.zy * uTriScale); vec4 cy = texture2D(map, vTriPos.xz * uTriScale); vec4 cz = texture2D(map, vTriPos.xy * uTriScale);
        vec3 tc = (cx * tw.x + cy * tw.y + cz * tw.z).rgb * uTriBright;
        diffuseColor.rgb *= mix(vec3(1.0), tc, uTriStrength); }
      #endif`);
  });
}

// Per-face color variation baked into vertex colors (returns a non-indexed clone).
export function perFaceColors(geo, { h = 0.72, s = 0.5, l = 0.62, hVar = 0.025, sVar = 0.1, lVar = 0.14 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count; const col = new Float32Array(n * 3); const c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    c.setHSL(h + rand(-hVar, hVar), Math.min(1, Math.max(0, s + rand(-sVar, sVar))), Math.min(1, Math.max(0, l + rand(-lVar, lVar))));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}

// Tangent-space normal map generated from a loaded texture's luminance (Sobel).
export function normalMapFromTexture(tex, strength = 2.0, size = 512) {
  const img = tex.image; const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size); const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size); const d = out.data; const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  const at = (x, y) => lum[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}

// Two crossed quads, pivot at the bottom center, for painted billboard trees.
export function crossBillboardGeometry(w = 1, h = 1) {
  const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  return BGU.mergeGeometries([a, b]);
}
