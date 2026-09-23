'use strict';
// Game state, input, main loop, camera, rendering.
const G = {
  state: 'loading', time: 0, rt: 0, dt: 0, lastTs: 0,
  player: null, enemies: [], pBullets: [], eBullets: [], pickups: [], timers: [],
  cam: { x: 1400, y: 2300, zoom: 1, trauma: 0, shx: 0, shy: 0 },
  mouseWorld: { x: 0, y: 0 }, view: { x0: 0, y0: 0, x1: 1, y1: 1 },
  hitStop: 0, slowmo: 0, cinematic: false, camFocus: null, uiBlock: false,
  combo: 0, comboT: 0, xpChain: 0, lastXpT: 0,
  checkpoint: { x: 600, y: 3130 }, checkpointBossHp: 0,
  stats: {}, clouds: [], tint: { d: 0, r: 0 }, deathT: 0, started: false,
  W: 0, H: 0, dpr: 1,

  addShake(a) { this.cam.trauma = Math.min(1, this.cam.trauma + a); },
  after(t, fn) { this.timers.push({ t: this.time + t, fn }); },

  registerKill(e) {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 2.6;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    if (this.combo % 10 === 0) {
      FX.text(this.player.x, this.player.y - 46, `КОМБО ×${this.combo}!`, '#ffd24a', 24, 1.3);
      Pickups.gems(e.x, e.y, 5);
      Snd.play('select');
    }
  },

  onPlayerDeath() {
    this.state = 'dead';
    this.deathT = 0;
  },

  win() {
    this.state = 'win';
    UI.showWin(this.stats);
    Music.intensity = 0;
  },
};

// ---------------- input ----------------
const Input = {
  keys: {}, act: {}, mx: 0, my: 0, mouseDown: false,
  map: { Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyQ: 'emp', KeyE: 'interact', KeyF: 'interact', Escape: 'pause', KeyP: 'pause', KeyM: 'mute', Digit1: 'k1', Digit2: 'k2', Digit3: 'k3', Numpad1: 'k1', Numpad2: 'k2', Numpad3: 'k3', Enter: 'enter' },

  init(canvas) {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      const a = this.map[e.code];
      if (a && !e.repeat) this.act[a] = G.rt;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    canvas.addEventListener('mousedown', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.act.emp = G.rt;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => {
      this.keys = {}; this.mouseDown = false;
      if (G.state === 'play') togglePause(true);
    });
  },
  key(c) { return !!this.keys[c]; },
  pressed(a) {
    const t = this.act[a];
    if (t != null && G.rt - t < 0.2) { delete this.act[a]; return true; }
    return false;
  },
  clear() { this.act = {}; },
};

// ---------------- setup ----------------
function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = innerWidth; G.H = innerHeight;
  G.canvas.width = Math.round(G.W * G.dpr);
  G.canvas.height = Math.round(G.H * G.dpr);
  const v = makeCanvas(G.W, G.H), g = v.getContext('2d');
  const gr = g.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.35, G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, G.W, G.H);
  G.vignette = v;
}

function init() {
  G.canvas = document.getElementById('game');
  G.ctx = G.canvas.getContext('2d');
  resize();
  addEventListener('resize', resize);
  Input.init(G.canvas);
  UI.init();

  UI.el.start.addEventListener('click', startGame);
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    Snd.play('ui');
    if (a === 'resume') togglePause(false);
    else if (a === 'sound') { Snd.setMuted(!Snd.muted); b.textContent = 'ЗВУК: ' + (Snd.muted ? 'ВЫКЛ' : 'ВКЛ'); }
    else if (a === 'restart') restartGame();
  }));

  // load painted art, then build the world
  Art.load(() => setTimeout(() => {
    document.body.classList.toggle('art', Art.ready);
    Tex.init();
    World.build();
    World.minimapBase = World.buildMinimap(220, 165);
    newGame();
    for (let i = 0; i < 9; i++) G.clouds.push({ x: rand(0, World.w), y: rand(0, World.h), r: rand(260, 520), sp: rand(10, 18) });
    G.state = 'title';
    G.cam.x = 1350; G.cam.y = 2350;
    const b = UI.el.start;
    b.disabled = false; b.textContent = 'НАЧАТЬ МИССИЮ'; b.classList.add('pulse');
  }, 30));
  requestAnimationFrame(loop);
}

function newGame() {
  if (G.started) {
    World.build();
    World.minimapBase = World.buildMinimap(220, 165);
  }
  G.enemies = []; G.pBullets = []; G.eBullets = []; G.pickups = []; G.timers = [];
  FX.clear();
  Boss.e = null; Boss.corpse = null; Boss.waves = []; Boss.beam = null;
  G.time = 0; G.combo = 0; G.comboT = 0; G.hitStop = 0; G.slowmo = 0; G.cinematic = false; G.camFocus = null; G.uiBlock = false;
  G.stats = { kills: 0, shots: 0, hits: 0, dmgTaken: 0, dmgDealt: 0, maxCombo: 0, deaths: 0, dashes: 0, emps: 0, bossTime: 0 };
  G.player = Player.create(600, 3130);
  G.checkpoint = { x: 600, y: 3130 };
  Enemies.nextId = 1;
  Music.setMode('explore'); Music.intensity = 0;
  Props.init();
  UI.reset();
  Quest.init();
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

function startGame() {
  if (G.state !== 'title') return;
  Snd.init();
  Music.start();
  Snd.play('select');
  G.state = 'boot';
  UI.el.title.classList.add('hidden');
  UI.boot(() => {
    G.state = 'play';
    G.started = true;
    document.body.classList.remove('menu');
    UI.el.hud.classList.remove('hidden');
    UI.fadeIn();
    G.cam.x = G.player.x; G.cam.y = G.player.y - 40;
    G.player.lock = 0.6;
    Input.clear();
  });
}

function restartGame() {
  UI.el.win.classList.add('hidden');
  UI.showPause(false);
  UI.showDead(false);
  UI.el.lu.classList.add('hidden');
  newGame();
  G.state = 'play';
  document.body.classList.remove('menu');
  UI.el.hud.classList.remove('hidden');
  UI.fadeIn();
  Input.clear();
}

function togglePause(force) {
  const on = force != null ? force : G.state === 'play';
  if (on && G.state === 'play') { G.state = 'pause'; UI.showPause(true); Input.mouseDown = false; }
  else if (!on && G.state === 'pause') { G.state = 'play'; UI.showPause(false); Input.clear(); }
}

function openLevelUp() {
  const p = G.player;
  p.pendingLevels--;
  G.state = 'levelup'; G.uiBlock = true;
  Snd.play('levelup');
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15);
  FX.ring(p.x, p.y, 10, 160, '#c77dff', 0.6, 5);
  FX.sparkle(p.x, p.y, '#c77dff', 16);
  const choices = Player.rollUpgrades(p);
  if (!choices.length) { G.state = 'play'; G.uiBlock = false; return; }
  UI.showLevelUp(p, choices, (u) => {
    Player.applyUpgrade(p, u);
    Snd.play('select');
    G.state = 'play'; G.uiBlock = false;
    Input.mouseDown = false; Input.clear();
    FX.text(p.x, p.y - 40, u.name.toUpperCase(), RARITY[u.rar].c, 18, 1.4);
    Quest.onUpgradePicked(u);
  });
}

function respawn() {
  const p = G.player, cp = G.checkpoint;
  Quest.onPlayerDeath();
  p.x = cp.x; p.y = cp.y; p.vx = p.vy = 0;
  p.hp = p.maxHp; p.hpLag = p.maxHp; p.alive = true; p.invuln = 2.5; p.dashT = 0; p.lock = 0.3;
  G.eBullets = []; Boss.waves = []; Boss.beam = null;
  for (const e of G.enemies) {
    if (e.static || e.type === 'boss' || e.dead) continue;
    if (dist(e.x, e.y, cp.x, cp.y) < 520) {
      if (dist(e.homeX, e.homeY, cp.x, cp.y) > 600) { e.x = e.homeX; e.y = e.homeY; }
      else if (e.wave) e.dead = true;
      e.aggro = false;
    }
  }
  G.slowmo = 0;
  G.cam.x = p.x; G.cam.y = p.y;
  UI.showDead(false);
  UI.fadeIn();
  G.state = 'play';
  Input.clear();
  FX.ring(p.x, p.y, 10, 120, '#5ce1ff', 0.6, 4);
  Quest.onRespawn();
}

// ---------------- loop ----------------
function loop(ts) {
  const now = ts / 1000;
  const rdt = Math.min(0.05, G.lastTs ? now - G.lastTs : 0.016);
  G.lastTs = now;
  G.rt += rdt;

  switch (G.state) {
    case 'title': case 'boot':
      titleUpdate(rdt); break;
    case 'play':
      update(rdt); break;
    case 'dead':
      G.deathT += rdt;
      worldStep(rdt * 0.35);
      updateCamera(rdt);
      UI.update(rdt);
      if (G.deathT > 1.1 && UI.el.dead.classList.contains('hidden')) UI.showDead(true);
      if (G.deathT > 3) respawn();
      break;
    case 'levelup':
      if (Input.pressed('k1')) UI.pickCard(0);
      else if (Input.pressed('k2')) UI.pickCard(1);
      else if (Input.pressed('k3')) UI.pickCard(2);
      break;
    case 'pause':
      if (Input.pressed('pause')) togglePause(false);
      if (Input.pressed('mute')) Snd.setMuted(!Snd.muted);
      break;
    case 'win':
      FX.update(rdt);
      break;
  }
  if (G.state !== 'loading') render();
  Music.update();
  requestAnimationFrame(loop);
}

function titleUpdate(rdt) {
  const t = G.rt;
  G.cam.zoom = clamp(G.H / 820, 0.7, 1.7);
  G.cam.x = 1450 + Math.sin(t * 0.06) * 520;
  G.cam.y = 2250 + Math.cos(t * 0.045) * 380;
  G.cam.shx = G.cam.shy = 0;
  FX.update(rdt);
  World.prefetch(G.cam.x, G.cam.y, 2);
  World.prefetch(600, 3130, 1);
}

function worldStep(dt) {
  if (dt <= 0) return;
  G.time += dt;
  G.dt = dt;
  for (let i = 0; i < G.timers.length; i++) {
    const tm = G.timers[i];
    if (G.time >= tm.t) { G.timers.splice(i--, 1); tm.fn(); }
  }
  Player.update(G.player, dt);
  Enemies.update(dt);
  Boss.updateWaves(dt);
  Bullets.update(dt);
  Pickups.update(dt);
  Props.update(dt);
  Quest.update(dt);
  FX.update(dt);
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  for (const c of G.clouds) { c.x += c.sp * dt; c.y += c.sp * 0.3 * dt; if (c.x - c.r > World.w) { c.x = -c.r; c.y = rand(0, World.h); } }
}

function update(rdt) {
  if (Input.pressed('pause')) { togglePause(true); return; }
  if (Input.pressed('mute')) Snd.setMuted(!Snd.muted);
  let dt = rdt;
  if (G.slowmo > 0) { G.slowmo -= rdt; dt *= 0.3; }
  if (G.hitStop > 0) { G.hitStop -= rdt; dt = 0; }
  const z = G.cam.zoom;
  G.mouseWorld.x = G.cam.x + (Input.mx - G.W / 2) / z;
  G.mouseWorld.y = G.cam.y + (Input.my - G.H / 2) / z;
  worldStep(dt);
  updateCamera(rdt);
  UI.update(rdt);

  // music intensity
  const p = G.player;
  let intensity = 0;
  if (Quest.stage === 'q2def' || (Quest.stage === 'boss' && Boss.e && !Boss.e.dead && Boss.e.bst !== 'sleep')) intensity = 2;
  else {
    for (const e of G.enemies) if (e.aggro && !e.dead && e.dp < 750) { intensity = 1; break; }
  }
  if (intensity >= Music.intensity) { Music.intensity = intensity; G.calmT = 0; }
  else { G.calmT = (G.calmT || 0) + rdt; if (G.calmT > 4) Music.intensity = intensity; }

  if (G.state === 'play' && p.pendingLevels > 0 && p.alive && !G.cinematic && G.hitStop <= 0) openLevelUp();
  World.prefetch(G.cam.x, G.cam.y, 1);
}

function updateCamera(rdt) {
  const cam = G.cam, p = G.player;
  let baseZ = clamp(G.H / 760, 0.7, 1.7) * (G.zoomMul || 1);
  if (Quest.stage === 'boss') baseZ *= 0.84;
  if (Quest.stage === 'q2def') baseZ *= 0.92;
  cam.zoom = damp(cam.zoom, baseZ, 2.5, rdt);
  let tx, ty;
  if (G.camFocus) { tx = G.camFocus.x; ty = G.camFocus.y; }
  else {
    const mx = Input.mx - G.W / 2, my = Input.my - G.H / 2;
    tx = p.x + clamp((mx * 0.22) / cam.zoom, -170, 170);
    ty = p.y + clamp((my * 0.22) / cam.zoom, -120, 120);
  }
  cam.x = damp(cam.x, tx, G.camFocus ? 2.5 : 7, rdt);
  cam.y = damp(cam.y, ty, G.camFocus ? 2.5 : 7, rdt);
  const hw = G.W / 2 / cam.zoom, hh = G.H / 2 / cam.zoom;
  cam.x = World.w > hw * 2 ? clamp(cam.x, hw, World.w - hw) : World.w / 2;
  cam.y = World.h > hh * 2 ? clamp(cam.y, hh, World.h - hh) : World.h / 2;
  cam.trauma = Math.max(0, cam.trauma - rdt * 1.7);
  const s = cam.trauma * cam.trauma * 22;
  cam.shx = (vnoise(G.rt * 28, 3.3, 1) - 0.5) * 2 * s;
  cam.shy = (vnoise(7.7, G.rt * 28, 2) - 0.5) * 2 * s;
}

// ---------------- render ----------------
const drawList = [];
function render() {
  const ctx = G.ctx, W = G.W, H = G.H, dpr = G.dpr, cam = G.cam, z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#0a1408';
  ctx.fillRect(0, 0, W, H);
  if (!G.player) return;
  const sx = cam.x + cam.shx, sy = cam.y + cam.shy;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - sx * z), dpr * (H / 2 - sy * z));
  const v = (G.view = { x0: sx - W / 2 / z, y0: sy - H / 2 / z, x1: sx + W / 2 / z, y1: sy + H / 2 / z });
  const vis = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;

  World.drawGround(ctx, v);
  World.drawWaterAnim(ctx, v, G.rt);
  Props.drawGround(ctx, v);
  Pickups.draw(ctx, v);

  // shadows for static obstacles
  ctx.fillStyle = Art.ready ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  for (const o of World.obstacles) {
    if (o.dead || o.noDraw || !vis(o.x, o.y, o.size + 60)) continue;
    const s = Art.ready && Props.spr(o);
    if (s) {
      const rx = s.w * (s.tall ? 0.36 : 0.42), ry = rx * 0.32;
      ctx.moveTo(o.x + 6 + rx, s.foot - 3);
      ctx.ellipse(o.x + 6, s.foot - 3, rx, ry, 0, 0, TAU);
      continue;
    }
    const off = o.canopy ? 11 : 5;
    const k = o.canopy ? 0.95 : 0.85;
    ctx.moveTo(o.x + off + o.size * k, o.y + off * 1.3);
    ctx.ellipse(o.x + off, o.y + off * 1.3, o.size * k, o.size * k * 0.82, 0, 0, TAU);
  }
  ctx.fill();

  Props.drawStructures(ctx, v);

  drawList.length = 0;
  const art = Art.ready;
  for (const o of World.obstacles) {
    if (o.dead || o.noDraw || (o.canopy && !art) || !vis(o.x, o.y, o.size * (o.canopy ? 3 : 1.6) + 20)) continue;
    drawList.push(o);
  }
  Props.sortables(v, drawList);
  for (const e of G.enemies) if (!e.dead && vis(e.x, e.y, e.r + 120)) drawList.push(e);
  if (Boss.corpse) drawList.push(Boss.corpse);
  drawList.push(G.player);
  drawList.sort((a, b) => a.y - b.y);
  for (const o of drawList) {
    if (o.draw) o.draw(ctx);
    else if (o === G.player) Player.draw(ctx, o);
    else if (o.type) {
      if (o === Boss.corpse) { ctx.save(); ctx.translate(rand(-4, 4), rand(-4, 4)); o.flash = Math.random() < 0.3 ? 1 : 0; Boss.draw(ctx, o, o.flash > 0); ctx.restore(); }
      else Enemies.draw(ctx, o);
    } else Props.drawObstacle(ctx, o);
  }

  FX.draw(ctx, v, false);

  // canopies (procedural fallback only; painted trees are y-sorted above)
  const p = G.player;
  if (!art) for (const o of World.obstacles) {
    if (!o.canopy || !vis(o.x, o.y, o.size + 10)) continue;
    let a = 1;
    const d2 = dist2(o.x, o.y, p.x, p.y);
    if (d2 < (o.size + 18) ** 2) a = 0.35;
    else for (const e of G.enemies) if (!e.dead && !e.dormant && e.aggro && dist2(o.x, o.y, e.x, e.y) < (o.size * 0.8) ** 2) { a = 0.55; break; }
    Props.drawCanopy(ctx, o, a);
  }

  // cloud shadows
  ctx.save();
  ctx.globalAlpha = 0.1;
  const cg = FX.glow('#000000');
  for (const c of G.clouds) if (vis(c.x, c.y, c.r)) ctx.drawImage(cg, c.x - c.r, c.y - c.r * 0.7, c.r * 2, c.r * 1.4);
  ctx.restore();

  // zone tint
  const zone = World.zoneAt(cam.x, cam.y);
  G.tint.d = damp(G.tint.d, zone === 'desert' ? 1 : 0, 1.5, 0.016);
  G.tint.r = damp(G.tint.r, zone === 'ruins' ? 1 : 0, 1.5, 0.016);
  if (G.tint.d > 0.01) { ctx.fillStyle = `rgba(255,150,60,${0.07 * G.tint.d})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); }
  if (G.tint.r > 0.01) { ctx.fillStyle = `rgba(22,6,40,${0.32 * G.tint.r})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); }

  Props.drawBeams(ctx, v);
  Boss.drawFx(ctx);
  Bullets.draw(ctx);
  FX.draw(ctx, v, true);
  FX.drawTexts(ctx);
  drawWorldUI(ctx, v);

  // screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.vignette) ctx.drawImage(G.vignette, 0, 0, W, H);
  if (G.state === 'play' || G.state === 'dead') {
    drawOffscreenMarkers(ctx, sx, sy, z);
    if (p.alive && !G.cinematic) drawCrosshair(ctx);
  }
  if (G.cinematic) {
    const bh = H * 0.08;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  }
}

function drawWorldUI(ctx, v) {
  const p = G.player;
  // relay tower HP
  const tw = Props.tower;
  if (tw && tw.active) {
    const w = 130, x = tw.x - w / 2, y = tw.y - 88;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 2, y - 2, w + 4, 10);
    ctx.fillStyle = tw.hp / tw.maxHp < 0.4 ? '#ff4757' : '#5ce1ff'; ctx.fillRect(x, y, w * (tw.hp / tw.maxHp), 6);
  }
  // on-screen quest markers
  if (G.state === 'play') for (const m of Quest.markers) {
    const mx = m.ref ? m.ref.x : m.x, my = m.ref ? m.ref.y : m.y;
    if (mx < v.x0 || mx > v.x1 || my < v.y0 || my > v.y1) continue;
    const bob = Math.sin(G.rt * 5) * 6;
    const y = my - 62 + bob;
    ctx.save();
    ctx.fillStyle = m.col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mx - 10, y - 8); ctx.lineTo(mx, y + 4); ctx.lineTo(mx + 10, y - 8); ctx.lineTo(mx + 10, y - 3); ctx.lineTo(mx, y + 9); ctx.lineTo(mx - 10, y - 3); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.font = "11px 'Russo One', sans-serif"; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeText(m.label, mx, y - 14); ctx.fillText(m.label, mx, y - 14);
    ctx.restore();
  }
  // interaction prompt
  const f = Props.focus;
  if (f && p.alive) {
    const txt = f.ok ? `[E]  ${f.label}` : f.label;
    ctx.save();
    ctx.font = "14px 'Russo One', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 24, x = p.x, y = p.y - 50;
    ctx.fillStyle = f.ok ? 'rgba(6,30,40,0.85)' : 'rgba(40,10,14,0.85)';
    ctx.strokeStyle = f.ok ? '#5ce1ff' : '#ff4757'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 14, w, 28, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = f.ok ? '#dffaff' : '#ffb4bb';
    ctx.fillText(txt, x, y + 1);
    ctx.restore();
  }
}

function drawOffscreenMarkers(ctx, sx, sy, z) {
  const W = G.W, H = G.H, p = G.player;
  const mL = 40, mR = W - 40, mT = 44, mB = H - 70;
  for (const m of Quest.markers) {
    const wx = m.ref ? m.ref.x : m.x, wy = m.ref ? m.ref.y : m.y;
    const x = (wx - sx) * z + W / 2, y = (wy - sy) * z + H / 2;
    if (x > 0 && x < W && y > 0 && y < H) continue;
    const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy;
    const tx = dx > 0 ? (mR - cx) / dx : (mL - cx) / dx;
    const ty = dy > 0 ? (mB - cy) / dy : (mT - cy) / dy;
    const t = Math.min(Math.abs(tx), Math.abs(ty));
    const ex = cx + dx * t, ey = cy + dy * t, a = Math.atan2(dy, dx);
    const d = Math.round(dist(p.x, p.y, wx, wy) / 10);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.globalAlpha = 0.75 + Math.sin(G.rt * 6) * 0.25;
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = m.col; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.font = "11px 'Russo One', sans-serif"; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = '#fff';
    const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26;
    ctx.strokeText(`${m.label} · ${d} м`, lx, ly + 4); ctx.fillText(`${m.label} · ${d} м`, lx, ly + 4);
    ctx.restore();
  }
}

function drawCrosshair(ctx) {
  const x = Input.mx, y = Input.my, p = G.player;
  const gap = 7 + p.recoil * 6;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
  const seg = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
  const draw = () => {
    seg(x - gap - 8, y, x - gap, y); seg(x + gap, y, x + gap + 8, y);
    seg(x, y - gap - 8, x, y - gap); seg(x, y + gap, x, y + gap + 8);
  };
  draw();
  ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 2; draw();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
  // emp ring hint
  if (p.emp >= 100) { ctx.strokeStyle = `rgba(255,210,74,${0.5 + Math.sin(G.rt * 8) * 0.3})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

init();
