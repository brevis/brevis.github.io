// "Winding road" curved-world effect. Gameplay stays on a straight z axis; every vertex is shifted sideways by
// bend(z) = C(z) - C(zc) - C'(zc) * (z - zc), where zc is the camera z. At the camera the road is straight and
// aligned with the view, further ahead it follows the curve C, so the track visibly turns left and right.
import * as THREE from 'three';

const W = [[16.0, 0.0105, 0.0], [7.0, 0.027, 1.7], [2.5, 0.051, 0.4]]; // amplitude, frequency, phase
let strength = 1;
export const setBendStrength = (s) => { strength = s; };
export function curveC(z) { let s = 0; for (const [a, f, p] of W) s += a * Math.sin(z * f + p); return s * strength; }
export function curveD(z) { let s = 0; for (const [a, f, p] of W) s += a * f * Math.cos(z * f + p); return s * strength; }
export function curveDD(z) { let s = 0; for (const [a, f, p] of W) s -= a * f * f * Math.sin(z * f + p); return s * strength; }
export function bendX(z, zc) { return curveC(z) - curveC(zc) - curveD(zc) * (z - zc); }

const glslC = (fn, deriv) => W.map(([a, f, p]) => deriv ? `${(a * f).toFixed(6)} * cos(z * ${f.toFixed(6)} + ${p.toFixed(4)})` : `${a.toFixed(4)} * sin(z * ${f.toFixed(6)} + ${p.toFixed(4)})`).join(' + ');
export const BEND_GLSL = `
uniform float wrBendK;
float wrBendC(float z) { return ${glslC('C', false)}; }
float wrBendD(float z) { return ${glslC('D', true)}; }
float wrBend(float z, float zc) { return (wrBendC(z) - wrBendC(zc) - wrBendD(zc) * (z - zc)); }
`;

let installed = false;
export function installBend() {
  if (installed) return; installed = true;
  const C = THREE.ShaderChunk;
  // functions available to every built-in shader (vertex and fragment both include <common>; unused in fragment)
  C.common = C.common + BEND_GLSL.replace('uniform float wrBendK;', '');
  C.project_vertex = C.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;',
    '#ifndef NO_BEND\n\tvec4 wrW = modelMatrix * mvPosition; wrW.x += wrBend(wrW.z, cameraPosition.z); mvPosition = viewMatrix * wrW;\n#else\n\tmvPosition = modelViewMatrix * mvPosition;\n#endif');
  C.worldpos_vertex = C.worldpos_vertex.replace('worldPosition = modelMatrix * worldPosition;',
    'worldPosition = modelMatrix * worldPosition;\n\t#ifndef NO_BEND\n\tworldPosition.x += wrBend(worldPosition.z, cameraPosition.z);\n\t#endif');
  const sp = THREE.ShaderLib.sprite;
  sp.vertexShader = sp.vertexShader.replace('vec4 mvPosition = modelViewMatrix[ 3 ];',
    'vec4 mvPosition = modelViewMatrix[ 3 ];\n\t#ifndef NO_BEND\n\t{ vec4 wc = modelMatrix[ 3 ]; mvPosition += viewMatrix * vec4( wrBend( wc.z, cameraPosition.z ), 0.0, 0.0, 0.0 ); }\n\t#endif');
  if (!C.project_vertex.includes('wrBend') || !C.worldpos_vertex.includes('wrBend') || !sp.vertexShader.includes('wrBend')) console.warn('bend: shader patch did not apply');
}
