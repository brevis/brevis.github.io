import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { IS_MOBILE } from './config.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 2 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc4ff);
scene.fog = new THREE.Fog(0xb9cdf5, 45, 185);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 400);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.4; pmrem.dispose();

// lights
const hemi = new THREE.HemisphereLight(0xd6ecff, 0x8a6fd0, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.4); sun.position.set(10, 22, 6); sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -16; sun.shadow.camera.near = 1; sun.shadow.camera.far = 70; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xb9c8ff, 0.7); fill.position.set(-8, 6, -4); scene.add(fill);

// post
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: IS_MOBILE ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
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
  renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); grade.uniforms.uAspect.value = w / h;
}
window.addEventListener('resize', resize);

// textures
const ui = new UI();
const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const tex = {};
tex.stone = loader.load('assets/stone.jpg'); tex.stone.wrapS = tex.stone.wrapT = THREE.RepeatWrapping; tex.stone.colorSpace = THREE.SRGBColorSpace; tex.stone.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
tex.backdrop = loader.load('assets/backdrop.jpg'); tex.backdrop.colorSpace = THREE.SRGBColorSpace;

manager.onLoad = () => {
  const game = new Game({ scene, camera, tex, ui, sun });
  window.__game = game; window.__render = () => { grade.uniforms.uBoost.value = Math.max(0, (game.boost - 1) * 2.2); composer.render(); };
  const input = new Input(document.body);
  input.on('left', () => game.onLeft()).on('right', () => game.onRight()).on('jump', () => game.onJump()).on('whip', () => game.onWhip());
  input.on('any', () => audio.init());
  const startBtn = document.getElementById('btn-start'), retryBtn = document.getElementById('btn-retry'), menuBtn = document.getElementById('btn-menu'), muteBtn = document.getElementById('btn-mute');
  const stop = (e) => { e.stopPropagation(); };
  for (const b of [startBtn, retryBtn, menuBtn, muteBtn]) { b.addEventListener('mousedown', stop); b.addEventListener('touchstart', stop, { passive: true }); b.addEventListener('touchend', stop, { passive: true }); b.addEventListener('mouseup', stop); }
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

  const clock = new THREE.Clock(); let acc = 0;
  function loop() {
    requestAnimationFrame(loop);
    let dt = Math.min(clock.getDelta(), 0.05);
    if (!game.paused) game.update(dt);
    grade.uniforms.uBoost.value = Math.max(0, (game.boost - 1) * 1.8);
    composer.render();
  }
  loop();
};
manager.onError = (url) => console.error('failed to load', url);
