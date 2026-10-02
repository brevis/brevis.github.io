import * as THREE from 'three';
import { LANE_W, HOOK_Y, HOOK_AHEAD, GAP_LEN, CHUNK_LEN, BASE_SPEED, MAX_SPEED, LEVEL_DIST, RUSH_COMBO, RUSH_TIME, IS_MOBILE, clamp, lerp, damp } from './config.js';
import { Player } from './player.js';
import { Whip } from './whip.js';
import { World } from './world.js';
import { Particles, Debris, Shake, Floaters } from './fx.js';
import { audio } from './audio.js';

const GRAB_MIN = 1.5, GRAB_MAX = 15, WHIP_RANGE = 9.5;

export class Game {
  constructor({ scene, camera, tex, ui, sun }) {
    this.scene = scene; this.camera = camera; this.ui = ui; this.sun = sun;
    this.player = new Player(scene, tex); this.whip = new Whip(scene); this.world = new World(scene, tex);
    this.particles = new Particles(scene); this.debris = new Debris(scene); this.shake = new Shake(); this.floaters = new Floaters(document.getElementById('floats'), camera);
    this.state = 'menu'; this.time = 0; this.timeScale = 1; this.hitstop = 0; this.slowmo = 0;
    this.best = +(localStorage.getItem('wr_best') || 0); this.firstRun = localStorage.getItem('wr_played') !== '1';
    this._hand = new THREE.Vector3(); this._v = new THREE.Vector3(); this._camPos = new THREE.Vector3(0, 5, 10); this._look = new THREE.Vector3();
    this.resetRun();
    this.camera.position.copy(this._camPos);
  }
  resetRun() {
    this.player.reset(); this.world.reset(); this.whip.release();
    this.distance = 0; this.bonus = 0; this.coins = 0; this.combo = 0; this.comboT = 0; this.level = 1; this.speed = 0; this.boost = 1; this.stumbleMult = 1;
    this.magnetT = 0; this.deadT = 0; this.landedFlag = false; this.whipCD = 0; this.swingsThisRun = 0; this._releaseHintShown = false; this._justSwung = false; this.rushT = 0; this.rushes = 0; this.hintShown = { whip: false, hook: false }; this.hookTarget = null;
    this.ui.setHUD({ score: 0, distance: 0, coins: 0, level: 1, combo: 0 }); this.ui.setPowerups([]);
  }
  get score() { return Math.floor(this.distance) + this.bonus; }
  start() {
    audio.init(); this.resetRun(); this.state = 'playing'; this.ui.showHUD(); audio.startMusic(); this.ui.hideHint();
    if (this.firstRun) this.ui.showHint('SWIPE ← → TO DODGE', 2.2);
  }
  toMenu() { this.state = 'menu'; this.resetRun(); this.ui.showMenu(this.best); audio.stopMusic(); }

  // ---------- input ----------
  onLeft() { if (this.state !== 'playing') return; if (this.player.moveLane(-1)) audio.whoosh(); }
  onRight() { if (this.state !== 'playing') return; if (this.player.moveLane(1)) audio.whoosh(); }
  onJump() { if (this.state !== 'playing') return; if (this.player.jump()) { audio.jump(); this.particles.burst(this._v.set(this.player.x, 0.1, this.player.z), 8, { color: 0xffffff, speed: 2, up: 1.5, size: 0.35, life: 0.4, grav: -3 }); } }
  onWhip() {
    if (this.state !== 'playing') return;
    const p = this.player; if (p.state === 'dead') return;
    if (p.state === 'swing') {
      const t = p.swing ? p.swing.t : 0;
      if (t < 0.55) return; // too early: the whip holds on
      const perfect = t <= 0.78; const released = p.releaseSwing(); this.whip.release(); this.ui.hideHint();
      this.boost = perfect ? 1.45 : 1.3; this._justSwung = false;
      const pts = perfect ? 250 : 100; this.bonus += pts;
      this.floaters.spawn(this._v.set(p.x, p.y + 2.2, p.z), perfect ? `PERFECT! +${pts}` : `RELEASE +${pts}`, 'gold big');
      audio.whipCrack(); this.ui.flash(perfect ? 0.18 : 0.08, '#ffe27a'); this.shake.add(perfect ? 0.12 : 0.05, 0.2);
      this.particles.burst(this._v.set(p.x, p.y + 1, p.z), perfect ? 24 : 10, { color: 0xffe27a, color2: 0xffffff, speed: 4, up: 2, size: 0.55, life: 0.6, grav: -3 });
      return;
    }
    // 1) hook grab
    const hook = this._hookInWindow();
    if (hook) { this._grab(hook); return; }
    // 2) crack
    if (this.whipCD > 0) return; this.whipCD = 0.3;
    p.attack(); audio.whipCrack();
    let target = null, best = 1e9;
    for (const e of this.world.ents.active) {
      if (!e.alive || e.dying > 0) continue; if (!(e.type === 'urchin' || e.type === 'golem' || e.type === 'crates' || e.type === 'totem')) continue;
      const dz = p.z - e.z; if (dz < -0.5 || dz > WHIP_RANGE) continue; if (Math.abs(e.x - p.x) > 1.4) continue;
      if (dz < best) { best = dz; target = e; }
    }
    // coins in lane ahead get lassoed
    let lassoed = 0;
    for (const c of this.world.ents.coins) { if (!c.alive || c.fly) continue; const dz = p.z - c.z; if (dz < -0.5 || dz > WHIP_RANGE - 1) continue; if (Math.abs(c.x - p.x) > 1.4) continue; c.fly = true; lassoed++; }
    const tp = this._v;
    if (target && target.type === 'totem' && this.rushT <= 0) { tp.set(target.x, 2.0, target.z + 0.6); audio.clank(); this.particles.burst(tp, 16, { color: 0xffffff, color2: 0xff9a3c, speed: 5, up: 2, size: 0.4, life: 0.35, grav: -4 }); this.floaters.spawn(tp, 'IMMUNE!', 'purple'); this.shake.add(0.06, 0.15); }
    else if (target) { tp.set(target.x, target.type === 'golem' ? 2.2 : target.type === 'crates' ? target.height * 0.5 : target.y, target.z); this._destroy(target, true); }
    else { tp.set(p.x, 1.4, p.z - WHIP_RANGE + 1); }
    this.whip.crack(tp);
    if (!target && lassoed === 0) { /* whiff */ this.particles.burst(tp, 6, { color: 0xffe9a0, speed: 1.5, up: 0.5, size: 0.3, life: 0.3, grav: 0 }); }
  }
  _hookInWindow() {
    const p = this.player; if (!(p.state === 'run' || p.state === 'jump' || p.state === 'fall' || p.state === 'stumble')) return null;
    for (const e of this.world.ents.active) { if (e.type !== 'hook' || !e.alive || e.used) continue; const dz = p.z - e.z; if (dz >= GRAB_MIN && dz <= GRAB_MAX) return e; }
    return null;
  }
  _grab(hook) {
    const p = this.player; hook.used = true; hook.mesh.userData.halo.visible = false; this.ui.hideHint(); this.swingsThisRun = (this.swingsThisRun || 0) + 1; this._releaseHintShown = false;
    const p1 = new THREE.Vector3(0, 8.2, hook.z + 0.5), p2 = new THREE.Vector3(0, 0, hook.z - GAP_LEN / 2 - 4.5);
    const len = Math.hypot(p.x, p.y - 4, p.z - p1.z) + Math.hypot(p1.z - p2.z, 4);
    const dur = clamp(len / (this.speed * 1.45), 0.75, 1.6);
    p.startSwing(p1, p2, dur);
    this.whip.grab(this._v.set(hook.x, HOOK_Y, hook.z - HOOK_AHEAD).clone());
    audio.grab(); setTimeout(() => audio.swing(), 80);
    this.particles.burst(this._v.set(hook.x, HOOK_Y, hook.z - HOOK_AHEAD), 18, { color: 0x8ff6ff, color2: 0xffe27a, speed: 4, up: 1, size: 0.5, life: 0.6, grav: -2 });
    this.bonus += 100; this.floaters.spawn(this._v.set(hook.x, HOOK_Y - 2, hook.z - HOOK_AHEAD), 'GRAB! +100', 'gold big'); this.shake.add(0.08, 0.2);
  }
  _destroy(e, byWhip) {
    const pos = this._v.set(e.x, e.y + 1, e.z).clone();
    if (e.type === 'totem') { audio.smash(); this.particles.burst(pos, 20, { color: 0xb36bff, color2: 0xffffff, speed: 5, up: 3, size: 0.6, life: 0.6 }); this.debris.burst(pos, 10, 0x2b2342, { speed: 6, up: 7, scale: 1.1 }); }
    else if (e.type === 'urchin') { audio.squish(); this.particles.burst(pos, 26, { color: 0x9b5cff, color2: 0xff3b6b, speed: 5, up: 3, size: 0.55, life: 0.6 }); this.debris.burst(pos, 6, 0x5a3390, { speed: 5, up: 6, scale: 0.6 }); }
    else if (e.type === 'golem') { audio.smash(); this.particles.burst(pos, 30, { color: 0xd8d2c6, color2: 0xff5a3a, speed: 6, up: 4, size: 0.7, life: 0.8 }); this.debris.burst(pos, 14, 0x9c978d, { speed: 7, up: 8, scale: 1.3 }); this.shake.add(0.22, 0.35); this.hitstop = 0.06; }
    else if (e.type === 'crates') { audio.wood(); this.particles.burst(pos, 20, { color: 0xffd36b, color2: 0xa5773f, speed: 5, up: 4, size: 0.5, life: 0.7 }); this.debris.burst(pos, 10, 0xa5773f, { speed: 6, up: 7, scale: 0.9 }); if (byWhip) { for (let i = 0; i < 6; i++) { const c = this.world.ents.spawnCoin(e.x + (Math.random() - .5) * 2, 1 + Math.random() * 2, e.z + (Math.random() - .5) * 2, e.chunk); if (c) c.fly = true; } } }
    this.world.ents.kill(e);
    if (byWhip) {
      this.combo = Math.min(this.combo + 1, 10); this.comboT = 6;
      if (this.combo >= RUSH_COMBO && this.rushT <= 0) this._startRush();
      const pts = (e.type === 'golem' ? 150 : e.type === 'totem' ? 120 : e.type === 'crates' ? 40 : 60) * Math.max(1, this.combo);
      this.bonus += pts; this.floaters.spawn(pos, `+${pts}`, e.type === 'golem' ? 'gold big' : 'gold');
      if (e.type !== 'crates') { this.hitstop = Math.max(this.hitstop, 0.04); this.shake.add(0.1, 0.2); }
    }
  }
  _startRush() {
    this.rushT = RUSH_TIME; this.rushes++; this.ui.showBanner('WHIP RUSH!'); audio.rush(); this.ui.flash(0.35, '#ffe27a'); this.shake.add(0.15, 0.3);
    this.particles.burst(this._v.set(this.player.x, 1.5, this.player.z), 40, { color: 0xffe27a, color2: 0xff8a3c, speed: 6, up: 3, size: 0.7, life: 0.9, grav: -2 });
    this.player.hurtT = 0;
  }
  _endRush() { this.rushT = 0; this.combo = 0; this.comboT = 0; this.floaters.spawn(this._v.set(this.player.x, 2.5, this.player.z), 'RUSH OVER', ''); }
  _collect(c, lassoed) {
    c.alive = false; this.coins++; this.bonus += 10; audio.coin(this.coins % 8 + 1);
    this.particles.burst(this._v.set(c.x, c.y, c.z), 5, { color: 0xffe066, color2: 0xfff4c2, speed: 2, up: 1.5, size: 0.4, life: 0.35, grav: -2 });
  }
  _hit(e) {
    const p = this.player;
    if (this.rushT > 0) { this._destroy(e, true); this.shake.add(0.12, 0.2); return; }
    if (p.shield) { p.setShield(false); audio.smash(); this.ui.flash(0.35, '#9fd8ff'); this.shake.add(0.2, 0.3); this._destroy(e, false); this.floaters.spawn(this._v.set(p.x, 2.5, p.z), 'SHIELD!', 'purple big'); p.hurtT = 0.8; return; }
    this._die('hit');
  }
  _die(kind) {
    const p = this.player; if (p.state === 'dead') return;
    p.die(kind); this.state = 'dead'; this.deadT = 0; this.whip.release(); this.combo = 0;
    if (kind === 'fall') { audio.fall(); } else { audio.hit(); audio.death(); this.shake.add(0.35, 0.5); this.ui.flash(0.5, '#ff6b6b'); this.slowmo = 0.7; }
    audio.stopMusic();
    localStorage.setItem('wr_played', '1'); this.firstRun = false;
    const sc = this.score; const newBest = sc > this.best; if (newBest) { this.best = sc; localStorage.setItem('wr_best', String(sc)); }
    setTimeout(() => { if (this.state === 'dead') this.ui.showGameOver({ score: sc, distance: Math.floor(this.distance), coins: this.coins, best: this.best, newBest, title: kind === 'fall' ? 'LONG WAY DOWN!' : 'WIPEOUT!' }); }, 1100);
  }

  // ---------- main update ----------
  update(rawDt) {
    const ui = this.ui; ui.update(rawDt);
    let dt = rawDt;
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt = 0; }
    if (this.slowmo > 0) { this.slowmo -= rawDt; dt *= 0.35; }
    this.time += dt;
    const p = this.player, w = this.world;
    if (this.state === 'menu') {
      // idle showcase: slow run
      this.speed = damp(this.speed, 6, 2, dt);
      p.update(dt, this.speed, this.time);
      w.update(dt, this.time, p);
    } else if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'dead') {
      this.deadT += dt; this.speed = damp(this.speed, 0, 2.5, dt);
      p.update(dt, this.speed, this.time); w.update(dt, this.time, p);
    }
    p.handWorld(this._hand); this.whip.update(dt, this._hand, this.time, this.speed, p.state);
    this.particles.update(dt); this.debris.update(dt); this.shake.update(rawDt);
    this._updateCamera(rawDt);
  }
  _updatePlaying(dt) {
    const p = this.player, w = this.world, E = w.ents;
    // speed & level
    const base = Math.min(MAX_SPEED, BASE_SPEED + (this.level - 1) * 0.75);
    this.boost = damp(this.boost, 1, 1.2, dt); if (p.state === 'stumble') this.stumbleMult = damp(this.stumbleMult, 1, 1.6, dt); else this.stumbleMult = damp(this.stumbleMult, 1, 4, dt);
    if (this.rushT > 0) { this.rushT -= dt; if (this.rushT <= 0) this._endRush(); }
    const rushMult = this.rushT > 0 ? 1.28 : 1;
    const target = base * this.boost * this.stumbleMult * rushMult * (p.state === 'fall' ? 0.5 : 1);
    this.speed = damp(this.speed, target, 3.5, dt);
    this.whipCD -= dt; if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.magnetT > 0) this.magnetT -= dt;
    const magnetOn = this.magnetT > 0 || this.rushT > 0; this._magnetOn = magnetOn;
    const prevZ = p.z;
    p.update(dt, this.speed, this.time);
    if (p.state !== 'swing' && p.state !== 'dead') this.distance += (prevZ - p.z); else if (p.state === 'swing') this.distance += (prevZ - p.z);
    const lvl = Math.floor(this.distance / LEVEL_DIST) + 1;
    if (lvl > this.level) { this.level = lvl; w.setLevel(lvl); this.ui.showBanner(`LEVEL ${lvl}`); audio.levelUp(); this.bonus += 50; }
    if (p.landed) { p.landed = false; audio.land(); this.particles.burst(this._v.set(p.x, 0.1, p.z), 10, { color: 0xffffff, speed: 2.5, up: 1, size: 0.4, life: 0.4, grav: -3 }); if (p.swing === null && this.boost < 1.05 && this._justSwung) { this._justSwung = false; this.boost = 1.3; this.bonus += 100; this.floaters.spawn(this._v.set(p.x, 2.5, p.z), 'SWING! +100', 'gold big'); this.ui.flash(0.12, '#ffe27a'); } }
    if (p.state === 'swing') { this._justSwung = true; const t = p.swing ? p.swing.t : 0; if (t > 0.5 && t < 0.78 && this.swingsThisRun <= 2 && !this._releaseHintShown) { this._releaseHintShown = true; this.ui.showHint(IS_MOBILE ? 'TAP TO RELEASE!' : 'SPACE TO RELEASE!', 0.9); } }
    w.update(dt, this.time, p);
    // gap / fall logic
    const ch = w.chunkAt(p.z);
    if (ch && ch.gap && p.z < ch.gapStart && p.z > ch.gapEnd && (p.state === 'run' || p.state === 'stumble' || (p.state === 'jump' && p.y <= 0.01))) { p.fall(); audio.fall(); }
    if (p.state === 'fall' && p.y < -7) { this._die('fall'); return; }
    // hook window highlight
    const hook = this._hookInWindow();
    if (hook !== this.hookTarget) {
      if (this.hookTarget) this.hookTarget.mesh.userData.halo.visible = false;
      this.hookTarget = hook;
      if (hook) { hook.mesh.userData.halo.visible = true; this.ui.showHint(IS_MOBILE ? 'TAP TO GRAB!' : 'SPACE TO GRAB!', 1.3); }
    }
    // tutorial hints on first run
    if (this.firstRun && !this.hintShown.jump) { for (const e of E.active) if (e.alive && e.type === 'pillar' && p.z - e.z < 14 && p.z - e.z > 0) { this.hintShown.jump = true; this.ui.showHint(IS_MOBILE ? 'SWIPE UP TO JUMP!' : '↑ TO JUMP!', 1.4); break; } }
    if (this.firstRun && !this.hintShown.whip) {
      for (const e of E.active) if (e.alive && (e.type === 'urchin' || e.type === 'golem' || e.type === 'crates') && Math.abs(e.x - p.x) < 1.3 && p.z - e.z < 16 && p.z - e.z > 0) { this.hintShown.whip = true; this.ui.showHint(IS_MOBILE ? 'TAP TO WHIP!' : 'SPACE TO WHIP!', 1.6); break; }
    }
    // collisions
    this._collisions(dt);
    // HUD
    this.ui.setHUD({ score: this.score, distance: Math.floor(this.distance), coins: this.coins, level: this.level, combo: this.combo, rush: this.rushT > 0 ? 1 : this.combo / RUSH_COMBO });
    const pw = []; if (this.rushT > 0) pw.push({ name: '🔥 WHIP RUSH', t: this.rushT, max: RUSH_TIME }); if (this.magnetT > 0) pw.push({ name: '🧲 MAGNET', t: this.magnetT, max: 9 }); if (p.shield) pw.push({ name: '🛡️ SHIELD' }); if (this.boost > 1.06) pw.push({ name: '⚡ BOOST' });
    this.ui.setPowerups(pw);
  }
  _collisions(dt = 1 / 60) {
    const p = this.player, E = this.world.ents;
    const px = p.x, py = p.y, pz = p.z; const airborne = p.state === 'swing'; const kFly = 1 - Math.exp(-dt * 16); const moveZ = this.speed * dt;
    // coins
    for (const c of E.coins) {
      if (!c.alive) continue; const dz = c.z - pz; if (dz > 3 || dz < -14) continue;
      const dx = c.x - px, dy = c.y - (py + 1.1);
      if (c.fly || (this._magnetOn && Math.abs(dx) < 6 && dz > -12 && dz < 2)) {
        c.fly = true; c.z -= moveZ; c.x += (px - c.x) * kFly; c.y += ((py + 1.1) - c.y) * kFly; c.z += (pz - 0.4 - c.z) * kFly;
        if (c.z > pz + 0.6) { this._collect(c); continue; }
      }
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < (c.fly ? 2.6 : 1.45)) this._collect(c);
    }
    if (p.state === 'dead') return;
    for (const e of E.active) {
      if (!e.alive || e.dying > 0) continue;
      const dz = e.z - pz;
      if (dz > 1.2 && dz < 4 && !e.passed && (e.type === 'urchin' || e.type === 'golem' || e.type === 'totem' || e.type === 'pillar')) {
        e.passed = true; const dx = Math.abs(e.x - px); const wide = e.opts && e.opts.long;
        if (!wide && dx < 1.35 && p.state !== 'swing') { this.bonus += 40; this.floaters.spawn(this._v.set(e.x, e.y + 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); }
        else if (wide && p.state !== 'swing') { this.bonus += 40; this.floaters.spawn(this._v.set(px, 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); }
        else if (dx < 2.7 && p.state !== 'swing') { this.bonus += 25; this.floaters.spawn(this._v.set(e.x, e.y + 2.0, e.z), 'CLOSE! +25', ''); }
      }
      if (dz > 2.5 || dz < -2.5) continue;
      const laneHit = Math.abs(e.x - px) < 1.35;
      switch (e.type) {
        case 'powerup': if (Math.abs(dz) < 1.2 && laneHit && py < 2.5) { E.release(e); audio.power(); this.ui.flash(0.2, e.opts.kind === 'shield' ? '#ffe27a' : '#9fd8ff'); this.particles.burst(this._v.set(e.x, 1.3, e.z), 24, { color: e.opts.kind === 'shield' ? 0xffd23f : 0x5fc1ff, speed: 4, up: 2, size: 0.6, life: 0.6 }); if (e.opts.kind === 'shield') { p.setShield(true); this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'SHIELD!', 'purple big'); } else { this.magnetT = 9; this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'MAGNET!', 'purple big'); } } break;
        case 'urchin': if (!airborne && laneHit && Math.abs(dz) < 0.85 && (e.opts.float ? py < 2.6 && py > -0.5 : py < 1.0)) this._hit(e); break;
        case 'golem': if (!airborne && laneHit && Math.abs(dz) < 1.1 && py < 3.2) this._hit(e); break;
        case 'totem': if (!airborne && laneHit && Math.abs(dz) < 0.95 && py < 4.0) this._hit(e); break;
        case 'pillar': if (!airborne && Math.abs(dz) < 0.75 && (e.opts.long || laneHit) && py < 0.8) this._hit(e); break;
        case 'crates': if (!airborne && laneHit && Math.abs(dz) < 0.9 && py < e.height - 0.3) { this._destroy(e, false); p.stumble(); this.stumbleMult = 0.45; this.combo = 0; audio.stumble(); this.shake.add(0.15, 0.25); this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'OOF!', ''); } break;
      }
      if (p.state === 'dead') return;
    }
  }
  _updateCamera(dt) {
    const p = this.player; const cam = this.camera;
    const portrait = window.innerHeight > window.innerWidth;
    const swinging = p.state === 'swing';
    const yFollow = p.state === 'dead' && p.deathKind === 'fall' ? Math.max(p.y * 0.3, -3) : Math.max(p.y, -2) * (swinging ? 0.8 : 0.55);
    const back = (portrait ? 7.6 : 6.6) + (swinging ? 1.6 : 0), up = (portrait ? 4.4 : 3.8) + (swinging ? 1.0 : 0);
    const tx = p.x * 0.55, ty = up + yFollow, tz = p.z + back;
    this._camPos.x = damp(this._camPos.x, tx, 6, dt); this._camPos.y = damp(this._camPos.y, ty, 5, dt); this._camPos.z = damp(this._camPos.z - p.z, back, 5, dt) + p.z;
    cam.position.copy(this._camPos).add(this.shake.off);
    this._look.set(p.x * 0.35, 1.7 + yFollow * 0.7 - (swinging ? 0.8 : 0), p.z - 9);
    cam.lookAt(this._look);
    const fovBase = portrait ? 64 : 54; const fov = fovBase + (this.speed - BASE_SPEED) * 0.5 + (this.boost - 1) * 18 + (this.rushT > 0 ? 5 : 0);
    cam.fov = damp(cam.fov, clamp(fov, 45, 85), 4, dt); cam.updateProjectionMatrix();
    // sun follows player for shadows
    if (this.sun) { this.sun.position.set(p.x + 10, 22, p.z + 6); this.sun.target.position.set(p.x, 0, p.z - 10); this.sun.target.updateMatrixWorld(); }
  }
}
