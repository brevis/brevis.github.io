import * as THREE from 'three';
import { LANE_W, HOOK_Y, HOOK_AHEAD, GAP_LEN, CHUNK_LEN, BASE_SPEED, MAX_SPEED, LEVEL_DIST, RUSH_COMBO, RUSH_TIME, IS_MOBILE, clamp, lerp, damp } from './config.js';
import { Player } from './player.js';
import { Whip } from './whip.js';
import { World } from './world.js';
import { Particles, Debris, Shake, Floaters } from './fx.js';
import { audio } from './audio.js';
import { Missions } from './missions.js';
import { Boulder } from './boulder.js';

const GRAB_MIN = 1.5, GRAB_MAX = 15, WHIP_RANGE = 9.5;

export class Game {
  constructor({ scene, camera, tex, ui, sun }) {
    this.scene = scene; this.camera = camera; this.ui = ui; this.sun = sun;
    this.player = new Player(scene, tex); this.whip = new Whip(scene); this.world = new World(scene, tex);
    this.particles = new Particles(scene); this.debris = new Debris(scene); this.shake = new Shake(); this.floaters = new Floaters(document.getElementById('floats'), camera);
    this.player.world = this.world; this.boulder = new Boulder(scene, this.particles);
    this.missions = new Missions((m) => { this.ui.showBanner('MISSION COMPLETE!'); audio.levelUp(); this.bonus += 500; this.floaters.spawn(this._v.set(this.player.x, this.player.y + 2.5, this.player.z), m.text + ' ✓', 'gold'); });
    this.bank = +(localStorage.getItem('wr_bank') || 0);
    this.state = 'menu'; this.time = 0; this.timeScale = 1; this.hitstop = 0; this.slowmo = 0;
    this.best = +(localStorage.getItem('wr_best') || 0); this.firstRun = localStorage.getItem('wr_played') !== '1';
    this._hand = new THREE.Vector3(); this._v = new THREE.Vector3(); this._camPos = new THREE.Vector3(0, 5, 10); this._look = new THREE.Vector3();
    this.resetRun();
    this.camera.position.copy(this._camPos);
    this.ui.renderMissions(this.missions.list(), this.missions.mult, this.bank);
  }
  resetRun() {
    this.player.reset(); this.world.reset(); this.whip.release();
    this.distance = 0; this.bonus = 0; this.coins = 0; this.combo = 0; this.comboT = 0; this.level = 1; this.speed = 0; this.boost = 1; this.stumbleMult = 1;
    this.magnetT = 0; this.deadT = 0; this.landedFlag = false; this.whipCD = 0; this.swingsThisRun = 0; this._releaseHintShown = false; this._justSwung = false; this.rushT = 0; this.rushes = 0; this._onLedge = false; this.slamCD = 0;
    if (this.boulder) this.boulder.reset(); if (this.missions) this.missions.runStart(); this.hintShown = { whip: false, hook: false }; this.hookTarget = null;
    this.ui.setHUD({ score: 0, distance: 0, coins: 0, level: 1, combo: 0 }); this.ui.setPowerups([]);
  }
  get score() { return Math.floor(this.distance * (this.missions ? this.missions.mult : 1)) + this.bonus; }
  start() {
    audio.init(); this.resetRun(); this.state = 'playing'; this.ui.showHUD(); audio.startMusic(); this.ui.hideHint();
    if (this.firstRun) this.ui.showHint('SWIPE ← → TO DODGE', 2.2);
  }
  toMenu() { this.state = 'menu'; this.resetRun(); this.ui.showMenu(this.best); this.ui.renderMissions(this.missions.list(), this.missions.mult, this.bank); audio.stopMusic(); }

  // ---------- input ----------
  onLeft() { if (this.state !== 'playing') return; if (this.player.moveLane(-1)) audio.whoosh(); }
  onRight() { if (this.state !== 'playing') return; if (this.player.moveLane(1)) audio.whoosh(); }
  onJump() {
    if (this.state !== 'playing') return; const p = this.player; const r = p.jump(); if (!r) return;
    if (r === 'single') { audio.jump(); this.particles.burst(this._v.set(p.x, p.y + 0.1, p.z), 8, { color: 0xffffff, speed: 2, up: 1.5, size: 0.35, life: 0.4, grav: -3 }); }
    else { audio.whoosh(); audio.jump(); this.particles.burst(this._v.set(p.x, p.y + 0.3, p.z), 18, { color: 0xbfe9ff, color2: 0xffffff, speed: 3.5, up: -1, size: 0.5, life: 0.45, grav: 0, spread: 2 }); this.missions.add('djumps'); this.floaters.spawn(this._v.set(p.x, p.y + 2.4, p.z), 'DOUBLE!', ''); }
  }
  onWhip() {
    if (this.state !== 'playing') return;
    const p = this.player; if (p.state === 'dead') return;
    if (p.state === 'swing') {
      const t = p.swing ? p.swing.t : 0;
      if (t < 0.55) return; // too early: the whip holds on
      const perfect = t <= 0.78; const released = p.releaseSwing(); this.whip.release(); this.ui.hideHint();
      this.boost = perfect ? 1.45 : 1.3; this._justSwung = false;
      const pts = perfect ? 250 : 100; this.bonus += pts; if (perfect) this.missions.add('perfects');
      this.floaters.spawn(this._v.set(p.x, p.y + 2.2, p.z), perfect ? `PERFECT! +${pts}` : `RELEASE +${pts}`, 'gold big');
      audio.whipCrack(); this.ui.flash(perfect ? 0.18 : 0.08, '#ffe27a'); this.shake.add(perfect ? 0.12 : 0.05, 0.2);
      this.particles.burst(this._v.set(p.x, p.y + 1, p.z), perfect ? 24 : 10, { color: 0xffe27a, color2: 0xffffff, speed: 4, up: 2, size: 0.55, life: 0.6, grav: -3 });
      return;
    }
    // 1) hook grab
    const hook = this._hookInWindow();
    if (hook) { this._grab(hook); return; }
    // 2) airborne: ground slam
    if (p.state === 'jump') {
      if (this.slamCD > 0 || !p.slam()) return; this.slamCD = 0.5;
      p.attack(); audio.whipCrack(); this.whip.crack(this._v.set(p.x, p.trackY + 0.2, p.z - 3.5).clone());
      this.particles.burst(this._v.set(p.x, p.y + 0.5, p.z), 10, { color: 0xffe27a, speed: 2, up: -3, size: 0.4, life: 0.35, grav: 0 });
      return;
    }
    // 3) crack
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
    else { tp.set(p.x, p.trackY + 1.4, p.z - WHIP_RANGE + 1); }
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
    const gy = hook.gy || 0; const lz = hook.z - GAP_LEN / 2 - 4.5;
    const p1 = new THREE.Vector3(0, gy + 8.2, hook.z + 0.5), p2 = new THREE.Vector3(0, this.world.heightAt(lz), lz);
    const len = Math.hypot(p.x, p.y - gy - 4, p.z - p1.z) + Math.hypot(p1.z - p2.z, 4);
    const dur = clamp(len / (this.speed * 1.45), 0.75, 1.6);
    p.startSwing(p1, p2, dur);
    this.whip.grab(this._v.set(hook.x, gy + HOOK_Y, hook.z - HOOK_AHEAD).clone()); this.missions.add('swings');
    audio.grab(); setTimeout(() => audio.swing(), 80);
    this.particles.burst(this._v.set(hook.x, gy + HOOK_Y, hook.z - HOOK_AHEAD), 18, { color: 0x8ff6ff, color2: 0xffe27a, speed: 4, up: 1, size: 0.5, life: 0.6, grav: -2 });
    this.bonus += 100; this.floaters.spawn(this._v.set(hook.x, gy + HOOK_Y - 2, hook.z - HOOK_AHEAD), 'GRAB! +100', 'gold big'); this.shake.add(0.08, 0.2);
  }
  _destroy(e, byWhip, how = 'whip') {
    const pos = this._v.set(e.x, e.y + 1, e.z).clone();
    if (byWhip) { this.missions.add('kills'); if (e.type === 'golem') this.missions.add('golems'); if (how === 'slam') this.missions.add('slamKills'); }
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
  _slamImpact() {
    const p = this.player; const E = this.world.ents; let n = 0; const pos = this._v.set(p.x, p.y + 0.3, p.z).clone();
    for (const e of [...E.active]) {
      if (!e.alive || e.dying > 0) continue; const dz = p.z - e.z; const dx = Math.abs(e.x - p.x); if (dz < -2.5 || dz > 6) continue;
      if ((e.type === 'urchin' || e.type === 'crates') && dx < 3.6) { this._destroy(e, true, 'slam'); n++; }
      else if (e.type === 'golem' && dx < 1.5 && dz < 4.5) { this._destroy(e, true, 'slam'); n++; }
    }
    this.particles.burst(pos, 40, { color: 0xffe27a, color2: 0xffffff, speed: 9, up: 1.2, size: 0.7, life: 0.6, grav: -3, spread: 3 });
    this.debris.burst(pos, 8, 0x9c978d, { speed: 7, up: 5, scale: 0.8 });
    this.shake.add(0.3, 0.35); this.hitstop = 0.05; audio.smash(); this.missions.add('slams'); this.bonus += 30;
    this.floaters.spawn(this._v.set(p.x, p.y + 2.4, p.z), n ? `SLAM! x${n}` : 'SLAM!', 'gold big');
  }
  _startRush() {
    this.rushT = RUSH_TIME; this.rushes++; this.missions.add('rushes'); this.ui.showBanner('WHIP RUSH!'); audio.rush(); this.ui.flash(0.35, '#ffe27a'); this.shake.add(0.15, 0.3);
    this.particles.burst(this._v.set(this.player.x, 1.5, this.player.z), 40, { color: 0xffe27a, color2: 0xff8a3c, speed: 6, up: 3, size: 0.7, life: 0.9, grav: -2 });
    this.player.hurtT = 0;
  }
  _endRush() { this.rushT = 0; this.combo = 0; this.comboT = 0; this.floaters.spawn(this._v.set(this.player.x, 2.5, this.player.z), 'RUSH OVER', ''); }
  _collect(c, lassoed) {
    c.alive = false; this.coins++; this.bonus += 10; audio.coin(this.coins % 8 + 1); this.missions.add('coins');
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
    if (kind === 'fall') { audio.fall(); } else { audio.hit(); audio.death(); this.shake.add(kind === 'crushed' ? 0.6 : 0.35, 0.5); this.ui.flash(0.5, '#ff6b6b'); this.slowmo = 0.7; }
    this.bank += this.coins; localStorage.setItem('wr_bank', String(this.bank)); this.missions.set('dist', Math.floor(this.distance)); this.missions.runEnd(); this.ui.renderMissions(this.missions.list(), this.missions.mult, this.bank);
    audio.stopMusic();
    localStorage.setItem('wr_played', '1'); this.firstRun = false;
    const sc = this.score; const newBest = sc > this.best; if (newBest) { this.best = sc; localStorage.setItem('wr_best', String(sc)); }
    setTimeout(() => { if (this.state === 'dead') this.ui.showGameOver({ score: sc, distance: Math.floor(this.distance), coins: this.coins, best: this.best, newBest, title: kind === 'fall' ? 'LONG WAY DOWN!' : kind === 'crushed' ? 'CRUSHED!' : 'WIPEOUT!' }); }, 1100);
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
      w.update(dt, this.time, p); this.boulder.update(dt, p, w, this.speed, false);
    } else if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'dead') {
      this.deadT += dt; this.speed = damp(this.speed, 0, 2.5, dt);
      p.update(dt, this.speed, this.time); w.update(dt, this.time, p); this.boulder.update(dt, p, w, this.speed * 0.3, true);
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
    this.whipCD -= dt; this.slamCD -= dt; if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.magnetT > 0) this.magnetT -= dt;
    const magnetOn = this.magnetT > 0 || this.rushT > 0; this._magnetOn = magnetOn;
    const prevZ = p.z;
    p.update(dt, this.speed, this.time);
    if (p.state !== 'swing' && p.state !== 'dead') this.distance += (prevZ - p.z); else if (p.state === 'swing') this.distance += (prevZ - p.z);
    const lvl = Math.floor(this.distance / LEVEL_DIST) + 1;
    if (lvl > this.level) { this.level = lvl; w.setLevel(lvl); this.ui.showBanner(`LEVEL ${lvl}`); audio.levelUp(); this.bonus += 50; }
    if (p.launched) { p.launched = false; audio.swing(); this.floaters.spawn(this._v.set(p.x, p.y + 2.5, p.z), 'LAUNCH!', 'purple big'); this.particles.burst(this._v.set(p.x, p.y, p.z), 16, { color: 0xffffff, color2: 0xbfe9ff, speed: 3, up: -2, size: 0.5, life: 0.5, grav: 0, spread: 2 }); }
    if (p.landedSlam) { p.landedSlam = false; this._slamImpact(); }
    if (p.landed) { p.landed = false; audio.land(); this.particles.burst(this._v.set(p.x, 0.1, p.z), 10, { color: 0xffffff, speed: 2.5, up: 1, size: 0.4, life: 0.4, grav: -3 }); if (p.swing === null && this.boost < 1.05 && this._justSwung) { this._justSwung = false; this.boost = 1.3; this.bonus += 100; this.floaters.spawn(this._v.set(p.x, 2.5, p.z), 'SWING! +100', 'gold big'); this.ui.flash(0.12, '#ffe27a'); } }
    if (p.state === 'swing') { this._justSwung = true; const t = p.swing ? p.swing.t : 0; if (t > 0.5 && t < 0.78 && this.swingsThisRun <= 2 && !this._releaseHintShown) { this._releaseHintShown = true; this.ui.showHint(IS_MOBILE ? 'TAP TO RELEASE!' : 'SPACE TO RELEASE!', 0.9); } }
    w.update(dt, this.time, p);
    // gap / fall logic
    const ch = w.chunkAt(p.z);
    if (ch && ch.gap && p.z < ch.gapStart && p.z > ch.gapEnd && (p.state === 'run' || p.state === 'stumble' || (p.state === 'jump' && p.y <= 0.01))) { p.fall(); audio.fall(); }
    if (p.state === 'fall' && p.y < p.trackY - 7) { this._die('fall'); return; }
    // upper ledge route
    const elev = p.y - p.trackY; if (p.state === 'run' && elev > 2.0) { if (!this._onLedge) { this._onLedge = true; this.missions.add('ledges'); this.bonus += 50; this.floaters.spawn(this._v.set(p.x, p.y + 2.4, p.z), 'HIGH ROUTE! +50', 'purple'); } } else if (elev < 1) this._onLedge = false;
    // chaser
    this.boulder.update(dt, p, w, this.speed, true); if (this.boulder.near) this.shake.add(0.05, 0.1);
    // narrow bridge warning
    if (!this._narrowWarned && w.isNarrow(p.z - 14) && !w.isNarrow(p.z)) { this._narrowWarned = true; this.ui.showHint('NARROW BRIDGE: STAY CENTER!', 1.4); audio.whoosh(); } else if (this._narrowWarned && !w.isNarrow(p.z - 14) && !w.isNarrow(p.z)) this._narrowWarned = false;
    this.missions.set('dist', Math.floor(this.distance));
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
    this.ui.setHUD({ score: this.score, distance: Math.floor(this.distance), coins: this.coins, level: this.level, combo: this.combo, rush: this.rushT > 0 ? 1 : this.combo / RUSH_COMBO, mult: this.missions.mult });
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
        if (!wide && dx < 1.35 && p.state !== 'swing' && py - (e.gy || 0) < 2.4) { this.bonus += 40; this.floaters.spawn(this._v.set(e.x, e.y + 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); this.missions.add('hops'); }
        else if (wide && p.state !== 'swing') { this.bonus += 40; this.floaters.spawn(this._v.set(px, py + 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); this.missions.add('hops'); }
        else if (dx < 2.7 && p.state !== 'swing') { this.bonus += 25; this.floaters.spawn(this._v.set(e.x, e.y + 2.0, e.z), 'CLOSE! +25', ''); }
      }
      if (dz > 2.5 || dz < -2.5) continue;
      const laneHit = Math.abs(e.x - px) < 1.35; const ry = py - (e.gy || 0);
      if (e.type === 'ledge' || e.type === 'gate') continue;
      if (ry > 2.4 && e.type !== 'powerup') continue; // on an upper ledge: ground threats cannot reach
      switch (e.type) {
        case 'powerup': if (Math.abs(dz) < 1.2 && laneHit && ry < 2.5) { E.release(e); audio.power(); this.ui.flash(0.2, e.opts.kind === 'shield' ? '#ffe27a' : '#9fd8ff'); this.particles.burst(this._v.set(e.x, 1.3, e.z), 24, { color: e.opts.kind === 'shield' ? 0xffd23f : 0x5fc1ff, speed: 4, up: 2, size: 0.6, life: 0.6 }); if (e.opts.kind === 'shield') { p.setShield(true); this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'SHIELD!', 'purple big'); } else { this.magnetT = 9; this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'MAGNET!', 'purple big'); } } break;
        case 'urchin': if (!airborne && laneHit && Math.abs(dz) < 0.85 && (e.opts.float ? ry < 2.6 && ry > -0.5 : ry < 1.0)) this._hit(e); break;
        case 'golem': if (!airborne && laneHit && Math.abs(dz) < 1.1 && ry < 3.2) this._hit(e); break;
        case 'totem': if (!airborne && laneHit && Math.abs(dz) < 0.95 && ry < 4.0) this._hit(e); break;
        case 'pillar': if (!airborne && Math.abs(dz) < 0.75 && (e.opts.long || laneHit) && ry < 0.8) this._hit(e); break;
        case 'crates': if (!airborne && laneHit && Math.abs(dz) < 0.9 && ry < e.height - 0.3) { this._destroy(e, false); if (this.rushT <= 0 && !p.shield) { if (this.boulder.near) { this._die('crushed'); return; } this.boulder.alert(); p.stumble(); this.stumbleMult = 0.45; this.combo = 0; audio.stumble(); this.shake.add(0.15, 0.25); this.floaters.spawn(this._v.set(e.x, e.y + 2.5, e.z), 'OOF!', ''); } } break;
      }
      if (p.state === 'dead') return;
    }
  }
  _updateCamera(dt) {
    const p = this.player; const cam = this.camera;
    const portrait = window.innerHeight > window.innerWidth;
    const swinging = p.state === 'swing'; const base = this.world.heightAt(p.z); const rel = p.y - base;
    const yFollow = base + (p.state === 'dead' && p.deathKind === 'fall' ? Math.max(rel * 0.3, -3) : Math.max(rel, -2) * (swinging ? 0.8 : 0.55));
    const chased = this.boulder && this.boulder.near && this.state !== 'menu';
    const back = (portrait ? 7.6 : 6.6) + (swinging ? 1.6 : 0) + (chased ? 4.5 : 0), up = (portrait ? 4.4 : 3.8) + (swinging ? 1.0 : 0) + (chased ? 3.4 : 0);
    const tx = p.x * 0.55, ty = up + yFollow, tz = p.z + back;
    this._camPos.x = damp(this._camPos.x, tx, 6, dt); this._camPos.y = damp(this._camPos.y, ty, 5, dt); this._camPos.z = damp(this._camPos.z - p.z, back, 5, dt) + p.z;
    cam.position.copy(this._camPos).add(this.shake.off);
    this._look.set(p.x * 0.35, 1.7 + base + (yFollow - base) * 0.7 - (swinging ? 0.8 : 0) + (this.world.heightAt(p.z - 9) - base) * 0.6, p.z - (chased ? 6.5 : 9));
    cam.lookAt(this._look);
    const fovBase = portrait ? 64 : 54; const fov = fovBase + (this.speed - BASE_SPEED) * 0.5 + (this.boost - 1) * 18 + (this.rushT > 0 ? 5 : 0);
    cam.fov = damp(cam.fov, clamp(fov, 45, 85), 4, dt); cam.updateProjectionMatrix();
    // sun follows player for shadows
    if (this.sun) { this.sun.position.set(p.x + 10, base + 22, p.z + 6); this.sun.target.position.set(p.x, base, p.z - 10); this.sun.target.updateMatrixWorld(); }
  }
}
