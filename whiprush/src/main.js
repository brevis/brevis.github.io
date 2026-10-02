import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { normalMapFromTexture } from './geo.js?v=muqz8flb';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Game } from './game.js?v=muqz8flb';
import { UI } from './ui.js?v=muqz8flb';
import { Input } from './input.js?v=muqz8flb';
import { audio } from './audio.js?v=muqz8flb';
import { IS_MOBILE } from './config.js?v=muqz8flb';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 2 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc4ff);
scene.fog = new THREE.Fog(0xa9cdf7, 40, 175);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 400);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.4; pmrem.dispose();

// lights
const hemi = new THREE.HemisphereLight(0xd4e9ff, 0x8a6fd0, 1.25); scene.add(hemi);
const rim = new THREE.DirectionalLight(0xfff0d8, 0.9); rim.position.set(-4, 9, -18); scene.add(rim); scene.add(rim.target);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.1); sun.position.set(10, 22, 6); sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -16; sun.shadow.camera.near = 1; sun.shadow.camera.far = 70; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xb9c8ff, 0.7); fill.position.set(-8, 6, -4); scene.add(fill);

// post
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: IS_MOBILE ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (!IS_MOBILE) {
  try {
    gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.7;
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1, thickness: 1, distanceFallOff: 1, scale: 1.1, samples: 12, screenSpaceRadius: false });
    const origHide = gtao.overrideVisibility.bind(gtao);
    gtao.overrideVisibility = function () {
      origHide();
      this.scene.traverse((o) => {
        const m = o.material; if (!o.visible || !m) return;
        const mats = Array.isArray(m) ? m : [m];
        if (o.isSprite || o.userData.noAO || mats.some((x) => x.transparent || x.alphaTest > 0)) o.visible = false;
      });
    };
    composer.addPass(gtao);
  } catch (e) { console.warn('GTAO unavailable', e); gtao = null; }
}
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uBoost: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBoost; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; d.x *= uAspect; float r = length(d);
      vec3 c;
      if (uBoost > 0.002) { vec2 off = (vUv - 0.5) * r * 0.022 * uBoost; c.r = texture2D(tDiffuse, vUv + off).r; c.g = texture2D(tDiffuse, vUv).g; c.b = texture2D(tDiffuse, vUv - off).b; }
      else c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(lum), c, 1.14);
      c = pow(c, vec3(0.98)) * vec3(1.02, 1.0, 0.985);
      float vig = smoothstep(1.05, 0.3, r * (1.0 + 0.3 * uBoost)); c *= mix(0.72, 1.0, vig);
      gl_FragColor = vec4(c, 1.0);
    }`
};
const grade = new ShaderPass(GradeShader); composer.addPass(grade);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); grade.uniforms.uAspect.value = w / h; if (gtao) { const p = renderer.getPixelRatio() * 0.6; gtao.setSize(Math.round(w * p), Math.round(h * p)); }
}
window.addEventListener('resize', resize);

// textures
const ui = new UI();
const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const tex = {};
tex.stone = loader.load('assets/stone.jpg'); tex.stone.wrapS = tex.stone.wrapT = THREE.RepeatWrapping; tex.stone.colorSpace = THREE.SRGBColorSpace; tex.stone.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
tex.backdrop = loader.load('assets/backdrop.jpg'); tex.backdrop.colorSpace = THREE.SRGBColorSpace;
const rep = (url, repeat = 1) => { const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(repeat, repeat); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
const cut = (url) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
tex.models = {}; { const gl = new GLTFLoader(manager); gl.load('assets/models/hero.glb', (g) => { tex.models.hero = g; }); gl.load('assets/models/anim_move.glb', (g) => { tex.models.move = g; }); gl.load('assets/models/anim_general.glb', (g) => { tex.models.general = g; }); }
tex.slabs = rep('assets/slabs.jpg', 0.5); tex.rock = rep('assets/rock.jpg'); tex.grass = rep('assets/grass.jpg'); tex.leather = rep('assets/leather.jpg', 2); tex.denim = rep('assets/denim.jpg', 2);
tex.treePine = cut('assets/tree_pine.png'); tex.treeRound = cut('assets/tree_round.png'); tex.bush = cut('assets/bush.png'); tex.islandA = cut('assets/island_a.png'); tex.islandB = cut('assets/island_b.png');

manager.onLoad = () => {
  try { tex.stoneN = normalMapFromTexture(tex.slabs, 1.6, 512); tex.stoneN.repeat.set(0.5, 0.5); } catch (e) { console.warn('normal map failed', e); }
  const game = new Game({ scene, camera, tex, ui, sun });
  window.__game = game; window.__composer = composer; window.__gtao = gtao; window.__render = () => { grade.uniforms.uBoost.value = Math.max(0, (game.boost - 1) * 1.8) + (game.rushT > 0 ? 0.3 : 0); composer.render(); };
  const input = new Input(document.body);
  input.on('left', () => game.onLeft()).on('right', () => game.onRight()).on('jump', () => game.onJump()).on('whip', (d) => game.onWhip(d)).on('charge', (on) => game.onCharge(on));
  input.on('any', () => audio.init());
  const startBtn = document.getElementById('btn-start'), retryBtn = document.getElementById('btn-retry'), menuBtn = document.getElementById('btn-menu'), muteBtn = document.getElementById('btn-mute');
  const stop = (e) => { e.stopPropagation(); };
  for (const b of [startBtn, retryBtn, menuBtn, muteBtn]) { b.addEventListener('pointerdown', stop); b.addEventListener('pointerup', stop); }
  const begin = () => { audio.init(); game.start(); };
  startBtn.addEventListener('click', begin); retryBtn.addEventListener('click', begin);
  menuBtn.addEventListener('click', () => game.toMenu());
  const syncMute = () => { muteBtn.textContent = audio.muted ? '🔇 Muted' : '🔊 Sound'; };
  muteBtn.addEventListener('click', () => { audio.init(); audio.setMuted(!audio.muted); syncMute(); }); syncMute();
  // keyboard start
  window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && game.state !== 'playing') { if (game.state === 'menu' || (game.state === 'dead' && game.deadT > 1.4)) begin(); } });
  // tap to start from menu overlay background too
  document.getElementById('menu').addEventListener('click', (e) => { if (e.target.id === 'menu') begin(); });
  ui.showMenu(game.best); ui.ready(); resize();

  // ---- adaptive quality: drop AO first, then resolution, when frames take too long ----
  const maxPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 2 : 1.5);
  const pixelBudget = IS_MOBILE ? 2.2e6 : 3.2e6;
  const capPR = () => Math.min(maxPR, Math.sqrt(pixelBudget / (window.innerWidth * window.innerHeight)));
  let pr = capPR(); const applyPR = () => { renderer.setPixelRatio(pr); composer.setPixelRatio ? composer.setPixelRatio(pr) : null; resize(); };
  applyPR(); window.addEventListener('resize', () => { pr = Math.min(pr, capPR()); applyPR(); });
  let ftAvg = 16.7, ftWin = 0, ftN = 0, goodT = 0;
  const quality = (ms) => {
    ftAvg = ftAvg * 0.9 + ms * 0.1; ftWin += ms; ftN++;
    if (ftN < 45) return; const avg = ftWin / ftN; ftWin = 0; ftN = 0;
    if (avg > 19) { goodT = 0; if (gtao && gtao.enabled) gtao.enabled = false; else if (pr > 0.6) { pr = Math.max(0.6, pr - 0.15); applyPR(); } }
    else if (avg < 13.5) { goodT++; if (goodT >= 4) { goodT = 0; if (pr < capPR() - 0.01) { pr = Math.min(capPR(), pr + 0.1); applyPR(); } } }
    window.__quality = { pr: +pr.toFixed(2), gtao: !!(gtao && gtao.enabled), avg: +avg.toFixed(1) };
  };
  const clock = new THREE.Clock(); let acc = 0; let lastNow = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(); quality(now - lastNow); lastNow = now;
    let dt = Math.min(clock.getDelta(), 0.05);
    if (!game.paused) game.update(dt);
    if (window.innerWidth < 2 || window.innerHeight < 2) return; // hidden/zero-size view: skip rendering
    grade.uniforms.uBoost.value = Math.max(0, (game.boost - 1) * 1.8) + (game.rushT > 0 ? 0.3 : 0);
    composer.render();
  }
  loop();
};
manager.onError = (url) => console.error('failed to load', url);
