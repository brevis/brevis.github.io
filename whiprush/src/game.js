import * as THREE from 'three';
import { LANE_W, HOOK_Y, HOOK_AHEAD, GAP_LEN, CHUNK_LEN, BASE_SPEED, MAX_SPEED, LEVEL_DIST, RUSH_COMBO, RUSH_TIME, IS_MOBILE, clamp, lerp, damp } from './config.js?v=muqz8flb';
const CHARGE_TIME = 0.42;
import { Player } from './player.js?v=muqz8flb';
import { Whip } from './whip.js?v=muqz8flb';
import { World } from './world.js?v=muqz8flb';
import { Particles, Debris, Shake, Floaters } from './fx.js?v=muqz8flb';
import { audio } from './audio.js?v=muqz8flb';
import { Missions } from './missions.js?v=muqz8flb';
import { Boulder } from './boulder.js?v=muqz8flb';

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
    this.magnetT = 0; this.deadT = 0; this.landedFlag = false; this.whipCD = 0; this.swingsThisRun = 0; this._releaseHintShown = false; this._justSwung = false; this.rushT = 0; this.rushes = 0; this._onLedge = false; this.slamCD = 0; this.buf = { jump: 0, whip: 0, whipDir: 'fwd' }; this.chain = 0; this.lastFwdT = -9; this.charging = false; this.chargeT = 0;
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
    if (this.state !== 'playing') return; const p = this.player; const r = p.jump();
    if (!r) { this.buf.jump = 0.16; return; } // input buffer: retried each frame for a short window
    this.buf.jump = 0;
    if (r === 'single') { audio.jump(); this.particles.burst(this._v.set(p.x, p.y + 0.1, p.z), 8, { color: 0xffffff, speed: 2, up: 1.5, size: 0.35, life: 0.4, grav: -3 }); }
    else { // double jump: the whip cracks downward and kicks the hero up
      audio.whipCrack(); p.attack('down'); this.whip.crack(this._v.set(p.x + 0.4, p.y - 1.6, p.z + 0.6).clone(), 'down');
      this.particles.burst(this._v.set(p.x, p.y - 0.2, p.z), 22, { color: 0xffe27a, color2: 0xffffff, speed: 4, up: -1.5, size: 0.5, life: 0.45, grav: 0, spread: 2 });
      this.missions.add('djumps');
    }
  }
  onCharge(on) {
    if (this.state !== 'playing') { this.charging = false; return; }
    if (on) { this.charging = true; this.chargeT = 0; this._chargeReady = false; return; }
    const ready = this.charging && this.chargeT >= CHARGE_TIME && this.player.state !== 'swing' && this.player.state !== 'dead';
    this.charging = false; this.chargeT = 0; this.whip.setCharge(0);
    if (ready) this.onWhip('spin');
  }
  // dir: fwd | left | right | low | spin
  onWhip(dir = 'fwd') {
    if (this.state !== 'playing') return;
    const p = this.player; if (p.state === 'dead') return;
    if (p.state === 'swing') {
      const t = p.swing ? p.swing.t : 0;
      const next = t >= 0.3 ? this._hookInWindow(true) : null; // swing straight onto the next hook
      if (next) { this.whip.release(); this._grab(next); this.bonus += 150; this.floaters.spawn(this._v.set(p.x, p.y + 2.4, p.z), 'CHAIN! +150', 'gold big'); return; }
      if (t < 0.55) return; // too early: the whip holds on
      const perfect = t <= 0.78; p.releaseSwing(); this.whip.release(); this.ui.hideHint();
      this.boost = perfect ? 1.45 : 1.3; this._justSwung = false;
      const pts = perfect ? 250 : 100; this.bonus += pts; if (perfect) this.missions.add('perfects');
      this.floaters.spawn(this._v.set(p.x, p.y + 2.2, p.z), perfect ? `PERFECT! +${pts}` : `RELEASE +${pts}`, 'gold big');
      audio.whipCrack(); this.ui.flash(perfect ? 0.18 : 0.08, '#ffe27a'); this.shake.add(perfect ? 0.12 : 0.05, 0.2);
      this.particles.burst(this._v.set(p.x, p.y + 1, p.z), perfect ? 24 : 10, { color: 0xffe27a, color2: 0xffffff, speed: 4, up: 2, size: 0.55, life: 0.6, grav: -3 });
      return;
    }
    // 1) hook grab (any whip input)
    if (dir !== 'spin') { const hook = this._hookInWindow(); if (hook) { this.charging = false; this._grab(hook); return; } }
    // 2) airborne + low = ground slam
    if (p.state === 'jump' && dir === 'low') {
      if (this.slamCD > 0 || !p.slam()) return; this.slamCD = 0.5;
      p.attack('slam'); audio.whipCrack(); this.whip.crack(this._v.set(p.x, p.trackY + 0.2, p.z - 3.5).clone(), 'slam');
      this.particles.burst(this._v.set(p.x, p.y + 0.5, p.z), 10, { color: 0xffe27a, speed: 2, up: -3, size: 0.4, life: 0.35, grav: 0 });
      return;
    }
    if (this.whipCD > 0) { this.buf.whip = 0.18; this.buf.whipDir = dir; return; }
    this.buf.whip = 0;
    if (dir === 'spin') return this._spin();
    // pick swing style + target lane
    let style, laneX = p.x, range = WHIP_RANGE, maxHits = 1, mult = 1, lowOnly = false;
    if (dir === 'left' || dir === 'right') { const sgn = dir === 'left' ? -1 : 1; style = dir === 'left' ? 'side-l' : 'side-r'; laneX = clamp(p.lane + sgn, -1, 1) === p.lane ? p.x + sgn * LANE_W : (p.lane + sgn) * LANE_W; range = 8.5; this.whipCD = 0.26; }
    else if (dir === 'low') { style = 'low'; range = 8; lowOnly = true; this.whipCD = 0.28; }
    else { // forward taps chain: forehand -> backhand -> overhead finisher
      this.chain = this.time - this.lastFwdT < 0.7 ? (this.chain + 1) % 3 : 0; this.lastFwdT = this.time;
      style = ['fore', 'back', 'over'][this.chain]; this.whipCD = 0.22;
      if (style === 'over') { range = 11.5; maxHits = 2; mult = 1.5; this.whipCD = 0.3; }
    }
    p.attack(style); audio.whipCrack();
    const hits = [];
    for (const e of this.world.ents.active) {
      if (!e.alive || e.dying > 0) continue; if (!(e.type === 'urchin' || e.type === 'golem' || e.type === 'crates' || e.type === 'totem' || e.type === 'charger' || (e.type === 'swooper' && !lowOnly) || (lowOnly && e.type === 'pillar' && !e.opts.long))) continue;
      if (lowOnly && e.type === 'urchin' && e.opts.float) continue;
      if (p.y - (e.gy || 0) > 2.4 && p.state !== 'jump') continue;
      const dz = p.z - e.z; if (dz < -0.5 || dz > range) continue; if (Math.abs(e.x - laneX) > 1.4) continue;
      hits.push({ e, dz });
    }
    hits.sort((a, b) => a.dz - b.dz);
    let lassoed = 0;
    for (const c of this.world.ents.coins) { if (!c.alive || c.fly) continue; const dz = p.z - c.z; if (dz < -0.5 || dz > range - 1) continue; if (Math.abs(c.x - laneX) > 1.4) continue; c.fly = true; lassoed++; }
    const tp = this._v; let hitAny = false;
    for (const { e } of hits.slice(0, maxHits)) {
      if (e.type === 'totem' && this.rushT <= 0) { tp.set(e.x, (e.gy || 0) + 2.0, e.z + 0.6); audio.clank(); this.particles.burst(tp, 16, { color: 0xffffff, color2: 0xff9a3c, speed: 5, up: 2, size: 0.4, life: 0.35, grav: -4 }); this.floaters.spawn(tp, 'HOLD TO SPIN!', 'purple'); this.shake.add(0.06, 0.15); hitAny = true; break; }
      tp.set(e.x, (e.gy || 0) + (e.type === 'golem' ? 2.2 : e.type === 'crates' ? e.height * 0.5 : e.type === 'pillar' ? 0.5 : e.type === 'charger' ? 0.8 : e.y - (e.gy || 0)), e.z);
      this._destroy(e, true, style, mult); hitAny = true;
    }
    if (!hitAny) tp.set(laneX, p.trackY + (style === 'low' ? 0.3 : 1.4), p.z - range + 1);
    this.whip.crack(tp, style);
    if (style === 'over' && hitAny) { this.shake.add(0.14, 0.2); this.hitstop = Math.max(this.hitstop, 0.05); }
    if (!hitAny && lassoed === 0) this.particles.burst(tp, 6, { color: 0xffe9a0, speed: 1.5, up: 0.5, size: 0.3, life: 0.3, grav: 0 });
  }
  _spin() {
    const p = this.player; this.whipCD = 0.45; this.chain = 0;
    p.attack('spin'); audio.whipCrack(); audio.swing(); this.whip.crack(this._v.set(p.x, p.y + 1, p.z).clone(), 'spin', Math.PI * 0.5);
    let n = 0;
    for (const e of [...this.world.ents.active]) {
      if (!e.alive || e.dying > 0) continue; if (!(e.type === 'urchin' || e.type === 'golem' || e.type === 'crates' || e.type === 'totem' || e.type === 'charger' || e.type === 'swooper')) continue;
      const dz = p.z - e.z; if (dz < -2 || dz > 6.5) continue; if (Math.abs(e.x - p.x) > 4.6) continue; if (Math.abs((e.gy || 0) - p.trackY) > 2.5) continue;
      this._destroy(e, true, 'spin', 1.5); n++;
    }
    for (const c of this.world.ents.coins) { if (!c.alive || c.fly) continue; const dz = p.z - c.z; if (dz > -1 && dz < 7 && Math.abs(c.x - p.x) < 5) c.fly = true; }
    this.particles.burst(this._v.set(p.x, p.y + 1, p.z), 36, { color: 0xffe27a, color2: 0xffffff, speed: 8, up: 0.5, size: 0.6, life: 0.5, grav: 0, spread: 2 });
    this.shake.add(n ? 0.2 : 0.08, 0.3); if (n) this.hitstop = Math.max(this.hitstop, 0.06);
    this.floaters.spawn(this._v.set(p.x, p.y + 2.6, p.z), n ? `WHIRLWIND x${n}` : 'WHIRLWIND', 'gold big');
  }
  _hookInWindow(fromSwing = false) {
    const p = this.player; if (!(p.state === 'run' || p.state === 'jump' || p.state === 'fall' || p.state === 'stumble' || (fromSwing && p.state === 'swing'))) return null;
    for (const e of this.world.ents.active) { if (e.type !== 'hook' || !e.alive || e.used) continue; const dz = p.z - e.z; const min = e.opts.landDist ? -3 : GRAB_MIN; if (dz >= min && dz <= GRAB_MAX) return e; }
    return null;
  }
  _grab(hook) {
    const p = this.player; hook.used = true; hook.mesh.userData.halo.visible = false; this.ui.hideHint(); this.swingsThisRun = (this.swingsThisRun || 0) + 1; this._releaseHintShown = false;
    const gy = hook.gy || 0; const chain = !!hook.opts.chain; const lz = hook.z - (chain ? 6 : hook.opts.landDist || GAP_LEN / 2 + 4.5);
    const p1 = new THREE.Vector3(0, gy + 8.2, hook.z + 0.5), p2 = new THREE.Vector3(0, chain ? gy + 3 : this.world.heightAt(lz), lz);
    const len = Math.hypot(p.x, p.y - gy - 4, p.z - p1.z) + Math.hypot(p1.z - p2.z, 4);
    const dur = clamp(len / (this.speed * 1.45), 0.75, 1.6);
    p.startSwing(p1, p2, dur); if (p.swing) p.swing.chain = chain; if (chain && this.firstRun !== false) this._chainHint = true;
    this.whip.grab(this._v.set(hook.x, gy + HOOK_Y, hook.z - HOOK_AHEAD).clone()); this.missions.add('swings');
    audio.grab(); setTimeout(() => audio.swing(), 80);
    this.particles.burst(this._v.set(hook.x, gy + HOOK_Y, hook.z - HOOK_AHEAD), 18, { color: 0x8ff6ff, color2: 0xffe27a, speed: 4, up: 1, size: 0.5, life: 0.6, grav: -2 });
    this.bonus += 100; this.floaters.spawn(this._v.set(hook.x, gy + HOOK_Y - 2, hook.z - HOOK_AHEAD), 'GRAB! +100', 'gold big'); this.shake.add(0.08, 0.2);
  }
  _destroy(e, byWhip, how = 'whip', mult = 1) {
    const pos = this._v.set(e.x, e.y + 1, e.z).clone();
    if (byWhip) { this.missions.add('kills'); if (e.type === 'golem') this.missions.add('golems'); if (how === 'slam') this.missions.add('slamKills'); }
    if (e.type === 'swooper') { audio.squish(); this.particles.burst(pos, 24, { color: 0x9b5cff, color2: 0xff3b6b, speed: 5, up: 2, size: 0.5, life: 0.55 }); this.debris.burst(pos, 4, 0x5b3a9a, { speed: 5, up: 4, scale: 0.5 }); }
    else if (e.type === 'charger') { audio.smash(); this.particles.burst(pos, 22, { color: 0xd8b98a, color2: 0xffe27a, speed: 5, up: 3, size: 0.55, life: 0.6 }); this.debris.burst(pos, 8, 0x8a6a4a, { speed: 6, up: 6, scale: 0.8 }); this.shake.add(0.1, 0.2); }
    else if (e.type === 'pillar') { audio.smash(); this.particles.burst(pos, 22, { color: 0xd8d2c6, color2: 0xffe27a, speed: 5, up: 3, size: 0.6, life: 0.6 }); this.debris.burst(pos, 10, 0xb0a898, { speed: 6, up: 5, scale: 1 }); }
    else if (e.type === 'totem') { audio.smash(); this.particles.burst(pos, 20, { color: 0xb36bff, color2: 0xffffff, speed: 5, up: 3, size: 0.6, life: 0.6 }); this.debris.burst(pos, 10, 0x2b2342, { speed: 6, up: 7, scale: 1.1 }); }
    else if (e.type === 'urchin') { audio.squish(); this.particles.burst(pos, 26, { color: 0x9b5cff, color2: 0xff3b6b, speed: 5, up: 3, size: 0.55, life: 0.6 }); this.debris.burst(pos, 6, 0x5a3390, { speed: 5, up: 6, scale: 0.6 }); }
    else if (e.type === 'golem') { audio.smash(); this.particles.burst(pos, 30, { color: 0xd8d2c6, color2: 0xff5a3a, speed: 6, up: 4, size: 0.7, life: 0.8 }); this.debris.burst(pos, 14, 0x9c978d, { speed: 7, up: 8, scale: 1.3 }); this.shake.add(0.22, 0.35); this.hitstop = 0.06; }
    else if (e.type === 'crates') { audio.wood(); this.particles.burst(pos, 20, { color: 0xffd36b, color2: 0xa5773f, speed: 5, up: 4, size: 0.5, life: 0.7 }); this.debris.burst(pos, 10, 0xa5773f, { speed: 6, up: 7, scale: 0.9 }); if (byWhip) { for (let i = 0; i < 6; i++) { const c = this.world.ents.spawnCoin(e.x + (Math.random() - .5) * 2, 1 + Math.random() * 2, e.z + (Math.random() - .5) * 2, e.chunk); if (c) c.fly = true; } } }
    this.world.ents.kill(e);
    if (byWhip) {
      this.combo = Math.min(this.combo + 1, 10); this.comboT = 6;
      if (this.combo >= RUSH_COMBO && this.rushT <= 0) this._startRush();
      const pts = Math.round((e.type === 'golem' ? 150 : e.type === 'swooper' ? 80 : e.type === 'charger' ? 90 : e.type === 'totem' ? 120 : e.type === 'pillar' ? 50 : e.type === 'crates' ? 40 : 60) * Math.max(1, this.combo) * mult);
      this.bonus += pts; this.floaters.spawn(pos, `+${pts}`, e.type === 'golem' ? 'gold big' : 'gold');
      if (e.type !== 'crates') { this.hitstop = Math.max(this.hitstop, 0.04); this.shake.add(0.1, 0.2); }
    }
  }
  _monsters(dt) {
    const p = this.player, E = this.world.ents;
    for (const e of [...E.active]) {
      if (!e.alive || e.dying > 0) continue; const d = p.z - e.z;
      if (e.type === 'swooper' && d < 45) { e.x = Math.sin(e.t * 2.3 + e.phase) * LANE_W * 1.05; if (!e.screeched && d < 30) { e.screeched = true; audio.whoosh(); } }
      else if (e.type === 'charger' && d < 38 && d > -3) { if (!e.moving) { e.moving = true; audio.stumble(); } e.z += 8 * dt; e.gy = this.world.heightAt(e.z); e.y = e.gy; if (Math.random() < dt * 20) this.particles.burst(this._v.set(e.x + (Math.random() - .5), e.y + 0.1, e.z - 0.8), 2, { color: 0xd8c9a8, speed: 1.5, up: 1.5, size: 0.6, life: 0.5, grav: -1 }); }
      else if (e.type === 'golem' && !e.stomped && this.level >= 4 && d < 16 && d > 5) {
        e.stomped = true; const w = E.spawn('wave', e.x, 0, e.z + 0.8, e.chunk); if (w) { w.r = 1; w.hit = false; }
        audio.smash(); this.shake.add(0.25, 0.35); this.particles.burst(this._v.set(e.x, e.gy + 0.3, e.z + 1), 30, { color: 0xd8d2c6, color2: 0xffb26b, speed: 7, up: 2, size: 0.8, life: 0.6, spread: 2 });
        if (!this._waveHint) { this._waveHint = true; this.ui.showHint(IS_MOBILE ? 'SWIPE UP: JUMP THE WAVE!' : '↑ JUMP THE WAVE!', 1.3); }
      }
      else if (e.type === 'wave') {
        e.r += 10 * dt; if (e.r > 18) { E.release(e); continue; }
        if (Math.random() < dt * 40) { const a = Math.atan2(p.x - e.x, p.z - e.z) + (Math.random() - 0.5) * 0.9; this.particles.burst(this._v.set(e.x + Math.sin(a) * e.r, e.y + 0.2, e.z + Math.cos(a) * e.r), 2, { color: 0xffc27a, color2: 0xd8c9a8, speed: 1.5, up: 2.5, size: 0.8, life: 0.4, grav: -3 }); }
        const dist = Math.hypot(p.x - e.x, p.z - e.z); const side = Math.sign(dist - e.r); const crossed = e.prevSide !== undefined && side !== e.prevSide; e.prevSide = side;
        if (!e.hit && this.rushT <= 0) { const ry = p.y - this.world.heightAt(p.z); if ((crossed || Math.abs(dist - e.r) < 0.4) && ry < 0.45 && p.state !== 'swing') { e.hit = true; if (p.shield) { p.setShield(false); audio.smash(); this.ui.flash(0.35, '#9fd8ff'); p.hurtT = 0.8; } else { this._die('hit'); return; } } else if (dist < e.r - 0.6 && !e.passedP) { e.passedP = true; this.bonus += 40; this.floaters.spawn(this._v.set(p.x, p.y + 2.3, p.z), 'HOP! +40', 'purple'); this.missions.add('hops'); } }
      }
    }
  }
  _slamImpact() {
    const p = this.player; const E = this.world.ents; let n = 0; const pos = this._v.set(p.x, p.y + 0.3, p.z).clone();
    for (const e of [...E.active]) {
      if (!e.alive || e.dying > 0) continue; const dz = p.z - e.z; const dx = Math.abs(e.x - p.x); if (dz < -2.5 || dz > 6) continue;
      if ((e.type === 'urchin' || e.type === 'crates' || e.type === 'charger') && dx < 3.6) { this._destroy(e, true, 'slam'); n++; }
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
    p.aimPoint = this.whip.mode === 'swing' ? this.whip.hook : null;
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
    this.whipCD -= dt; this.slamCD -= dt;
    if (this.buf.jump > 0) { this.buf.jump -= dt; const before = this.buf.jump; this.onJump(); if (this.buf.jump === 0.16) this.buf.jump = Math.max(0, before); }
    if (this.buf.whip > 0) { this.buf.whip -= dt; if (this.whipCD <= 0) { const d = this.buf.whipDir; this.buf.whip = 0; this.onWhip(d); } }
    if (this.charging) { this.chargeT += dt; const k = Math.min(1, this.chargeT / CHARGE_TIME); this.whip.setCharge(k); if (k >= 1 && !this._chargeReady) { this._chargeReady = true; audio.grab(); this.particles.burst(this._v.set(p.x, p.y + 1.6, p.z), 14, { color: 0xffe27a, color2: 0xffffff, speed: 3, up: 1, size: 0.45, life: 0.4, grav: 0 }); } }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
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
    this._monsters(dt);
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
    { const ahead = w.chunkAt(p.z - 16); const prof = ahead && ahead.profile; if (prof && prof !== this._lastSeenProfile) { this._lastSeenProfile = prof; const seen = this._seenProf || (this._seenProf = {}); if (!seen[prof]) { seen[prof] = true; const H = { jumpgap: IS_MOBILE ? 'SWIPE UP: JUMP THE GAP!' : '↑ JUMP THE GAP!', holes: 'BROKEN BRIDGE: SWITCH LANES!', hookchain: 'TAP, THEN TAP AGAIN!' }; if (H[prof]) this.ui.showHint(H[prof], 1.6); } } }
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
      if (dz > 1.2 && dz < 4 && !e.passed && (e.type === 'urchin' || e.type === 'golem' || e.type === 'totem' || e.type === 'pillar' || e.type === 'charger' || e.type === 'swooper')) {
        e.passed = true; const dx = Math.abs(e.x - px); const wide = e.opts && e.opts.long;
        if (!wide && dx < 1.35 && p.state !== 'swing' && py - (e.gy || 0) < 2.4) { this.bonus += 40; this.floaters.spawn(this._v.set(e.x, e.y + 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); this.missions.add('hops'); }
        else if (wide && p.state !== 'swing') { this.bonus += 40; this.floaters.spawn(this._v.set(px, py + 2.2, e.z), 'HOP! +40', 'purple'); audio.coin(6); this.missions.add('hops'); }
        else if (dx < 2.7 && p.state !== 'swing') { this.bonus += 25; this.floaters.spawn(this._v.set(e.x, e.y + 2.0, e.z), 'CLOSE! +25', ''); }
      }
      if (dz > 2.5 || dz < -2.5) continue;
      const laneHit = Math.abs(e.x - px) < 1.35; const ry = py - (e.gy || 0);
      if (e.type === 'ledge' || e.type === 'gate') continue;
      if (ry > 2.4 && e.type !== 'powerup' && !(e.opts && e.opts.air)) continue; // on an upper ledge: ground threats cannot reach
      switch (e.type) {
        case 'powerup': if (Math.abs(dz) < 1.2 && laneHit && ry < 2.5) { E.release(e); audio.power(); this.ui.flash(0.2, e.opts.kind === 'shield' ? '#ffe27a' : '#9fd8ff'); this.particles.burst(this._v.set(e.x, 1.3, e.z), 24, { color: e.opts.kind === 'shield' ? 0xffd23f : 0x5fc1ff, speed: 4, up: 2, size: 0.6, life: 0.6 }); if (e.opts.kind === 'shield') { p.setShield(true); this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'SHIELD!', 'purple big'); } else { this.magnetT = 9; this.floaters.spawn(this._v.set(e.x, 2.5, e.z), 'MAGNET!', 'purple big'); } } break;
        case 'urchin': if (e.opts.air) { if (Math.abs(e.x - px) < 1.1 && Math.abs(dz) < 0.9 && Math.abs(py + 1.0 - e.y) < 1.1) this._hit(e); } else if (!airborne && laneHit && Math.abs(dz) < 0.85 && (e.opts.float ? ry < 2.6 && ry > -0.5 : ry < 1.0)) this._hit(e); break;
        case 'swooper': if (!airborne && Math.abs(e.x - px) < 1.0 && Math.abs(dz) < 0.8 && ry < 2.3) this._hit(e); break;
        case 'charger': if (!airborne && laneHit && Math.abs(dz) < 1.1 && ry < 1.15) this._hit(e); break;
        case 'wave': break;
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
    const back = (portrait ? 6.7 : 5.7) + (swinging ? 1.6 : 0) + (chased ? 4.5 : 0), up = (portrait ? 3.9 : 3.3) + (swinging ? 1.0 : 0) + (chased ? 3.4 : 0);
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
