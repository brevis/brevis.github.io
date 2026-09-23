'use strict';
// Interactive world objects: mines, laser gates, heal pads, relay tower, ruins gate, energy barrier, drone NPC.
const Props = {
  mines: [], lgates: [], rlasers: [], heals: [], tower: null, gate: null, barrier: null, droneNPC: null,
  focus: null, smokeT: 0, _q: [],

  init() {
    this.tower = { x: 2100, y: 1000, hp: 800, maxHp: 800, active: false, done: false, sockets: 0, hitT: 0, pulse: 0 };
    const gw = World.wallById('gate');
    this.gate = { x: gw.x, y: gw.y, w: gw.w, h: gw.h, wall: gw, openT: 0, opening: false, closing: false, open: false };
    const bw = World.wallById('barrier');
    const pylons = [];
    for (let y = 1500; y <= 3640; y += 110) pylons.push(y);
    this.barrier = { wall: bw, on: true, off: 0, pylons, x: 2700, touched: false };
    this.heals = [[1980, 1110], [2800, 2380], [4420, 2410], [3650, 1590]].map(([x, y]) => ({ x, y, r: 44, t: 0, used: false }));
    this.lgates = [
      { x: 3478, y0: 2440, y1: 2640, period: 3.2, onDur: 1.6, phase: 0, off: 0, hitCd: 0 },
      { x: 3548, y0: 2440, y1: 2640, period: 3.2, onDur: 1.6, phase: 1.6, off: 0, hitCd: 0 },
    ];
    this.rlasers = [{ x: 3970, y: 1990, len: 240, ang: 0, speed: 1.05, off: 0 }];
    this.droneNPC = { x: 330, y: 520, rescued: false, t: 0 };

    // mine field
    this.mines = [];
    const R = mulberry32(555);
    let tries = 0;
    while (this.mines.length < 28 && tries++ < 3000) {
      const x = 2790 + R() * 620, y = 1650 + R() * 1850;
      const t = World.tAt(x, y);
      if (t === T.ROAD && R() < 0.85) continue;
      if (dist(x, y, 2800, 2380) < 170) continue;
      if (this.mines.some((m) => dist2(m.x, m.y, x, y) < 90 * 90)) continue;
      const near = World.queryObs(x, y, 60, this._q);
      if (near.some((o) => !o.dead && dist(o.x, o.y, x, y) < o.r + 26)) continue;
      this.mines.push({ x, y, state: 'idle', fuse: 0, t: R() * 3, dead: false });
    }
  },

  update(dt) {
    const p = G.player;
    // interaction target
    this.updateInteract(p);

    // heal pads
    for (const h of this.heals) {
      h.t += dt;
      if (p.alive && dist2(p.x, p.y, h.x, h.y) < h.r * h.r) {
        if (!h.used) { h.used = true; Quest.onHealPad(); }
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 42 * dt);
          if (Math.random() < dt * 14) FX.add({ kind: 'glow', x: p.x + rand(-14, 14), y: p.y + rand(-10, 10), vy: -60, life: 0.5, size: 6, size2: 1, color: '#5dff8a', add: true, drag: 0 });
          Snd.play('heal');
        }
      }
    }

    // mines
    for (const m of this.mines) {
      if (m.dead) continue;
      m.t += dt;
      if (m.state === 'idle') {
        if (p.alive && dist2(p.x, p.y, m.x, m.y) < 64 * 64) this.armMine(m);
        else for (const e of G.enemies) {
          if (e.dead || e.static || e.dormant || e.type === 'boss') continue;
          if (dist2(e.x, e.y, m.x, m.y) < (e.r + 24) ** 2) { this.armMine(m); break; }
        }
      } else {
        m.fuse -= dt;
        if (Snd.throttle('mine' + m.x, 100)) Snd.at('beep', m.x, m.y, { f: 2000 });
        if (m.fuse <= 0) this.detonate(m);
      }
    }

    // laser gates
    for (const g of this.lgates) {
      g.state = this.gateState(g);
      if (g.hitCd > 0) g.hitCd -= dt;
      if (g.state !== 'on') continue;
      if (Snd.throttle('lg' + g.x, 400) && dist(p.x, p.y, g.x, (g.y0 + g.y1) / 2) < 500) Snd.at('laser', g.x, (g.y0 + g.y1) / 2);
      if (p.alive && Math.abs(p.x - g.x) < p.hitR + 5 && p.y > g.y0 && p.y < g.y1) {
        if (Player.hurt(p, 18, p.x < g.x ? g.x + 60 : g.x - 60, p.y, { kb: 420 })) FX.sparks(g.x, p.y, 0, Math.PI, 10, '#ff8a8a', 150, 400);
      }
      for (const e of G.enemies) {
        if (e.dead || e.static || e.dormant) continue;
        if (Math.abs(e.x - g.x) < e.r + 4 && e.y > g.y0 && e.y < g.y1 && (e.lgCd || 0) < G.time) { e.lgCd = G.time + 0.4; Enemies.damage(e, 25, { ang: e.x < g.x ? Math.PI : 0, kb: 300, quiet: true }); }
      }
    }

    // rotating lasers
    for (const l of this.rlasers) {
      if (G.time < l.off) continue;
      l.ang += l.speed * dt;
      const ex = l.x + Math.cos(l.ang) * l.len, ey = l.y + Math.sin(l.ang) * l.len;
      if (p.alive && segDist2(p.x, p.y, l.x, l.y, ex, ey) < (p.hitR + 5) ** 2) {
        const dx = Math.cos(l.ang), dy = Math.sin(l.ang);
        const side = Math.sign(dx * (p.y - l.y) - dy * (p.x - l.x)) || 1;
        Player.hurt(p, 16, p.x + dy * side * 50, p.y - dx * side * 50, { kb: 380 });
      }
    }

    // tower
    const tw = this.tower;
    if (tw.hitT > 0) tw.hitT -= dt;
    tw.pulse += dt;
    if (tw.active) { tw.ringT = (tw.ringT || 0) - dt; if (tw.ringT <= 0) { tw.ringT = 0.7; FX.ring(tw.x, tw.y, 50, 260, '#5ce1ff', 0.8, 3); } }

    // gate
    const gt = this.gate;
    if (gt.opening) {
      gt.openT = Math.min(1, gt.openT + dt / 1.6);
      if (Math.random() < 0.5) FX.dust(gt.x + gt.w / 2 + rand(-100, 100), gt.y + gt.h, '#9a8a7a', 1, 50);
      if (gt.openT >= 1) { gt.opening = false; gt.open = true; gt.wall.active = false; }
    }
    if (gt.closing) {
      gt.wall.active = true;
      gt.openT = Math.max(0, gt.openT - dt / 0.6);
      if (gt.openT <= 0) { gt.closing = false; gt.open = false; G.addShake(0.5); Snd.play('stomp'); }
    }

    // barrier
    const b = this.barrier;
    if (!b.on && b.off < 1) b.off = Math.min(1, b.off + dt / 1.8);
    if (b.on && p.alive && p.x > 2672 && p.y > 1490 && !b.touched) { b.touched = true; Quest.onBarrierTouch(); }
    if (b.on && p.alive && p.x > 2672 && p.y > 1490 && Math.random() < 0.3) FX.sparks(2692, p.y, Math.PI, 0.8, 1, '#9ff0ff', 100, 300, 0.2);

    // crash pod smoke
    if (dist2(p.x, p.y, 640, 3060) < 1000 * 1000) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.07;
        FX.add({ kind: 'smoke', x: 650 + rand(-12, 12), y: 3050 + rand(-8, 8), vx: rand(-10, 20), vy: rand(-50, -25), life: rand(1.6, 2.6), size: rand(6, 9), size2: rand(24, 36), color: pick(['#3a3530', '#4a4540', '#2a2622']), alpha: 0.45, drag: 0.3 });
        if (Math.random() < 0.4) FX.add({ kind: 'glow', x: 640 + rand(-10, 10), y: 3060 + rand(-6, 6), vy: rand(-40, -20), life: rand(0.3, 0.6), size: rand(8, 14), size2: 2, color: pick(['#ff9a3c', '#ffcf5a']), add: true, drag: 1 });
      }
    }

    // drone npc sparks
    const dn = this.droneNPC;
    if (!dn.rescued) { dn.t += dt; if (Math.random() < dt * 3) FX.sparks(dn.x + rand(-6, 6), dn.y - 4, -Math.PI / 2, 1.2, 3, '#ffe066', 80, 220, 0.3, 1.5); }
  },

  updateInteract(p) {
    this.focus = null;
    if (!p.alive || G.cinematic) return;
    const c = [];
    const tw = this.tower;
    if (!tw.done && !tw.active && Quest.stage !== 'q2def') {
      const ok = p.cells >= 3;
      c.push({ x: tw.x, y: tw.y, r: 140, label: ok ? 'Установить ячейки' : `Нужны энергоячейки ${p.cells}/3`, ok, act: () => Quest.activateTower() });
    }
    const gt = this.gate;
    if (!gt.open && !gt.opening && Quest.stage !== 'boss' && Quest.stage !== 'end' && Quest.stage !== 'win') {
      c.push({ x: gt.x + gt.w / 2, y: gt.y + gt.h + 40, r: 150, label: p.keycard ? 'Открыть врата' : 'Нужна ключ-карта', ok: p.keycard, act: () => Quest.openGate() });
    }
    const dn = this.droneNPC;
    if (!dn.rescued) c.push({ x: dn.x, y: dn.y, r: 85, label: 'Починить дрон', ok: true, act: () => Quest.rescueDrone() });
    let best = null, bd = Infinity;
    for (const it of c) { const d = dist(p.x, p.y, it.x, it.y); if (d < it.r && d < bd) { bd = d; best = it; } }
    this.focus = best;
    if (best && Input.pressed('interact')) { if (best.ok) best.act(); else { Snd.play('beep', { f: 260 }); } }
  },

  gateState(g) {
    if (G.time < g.off) return 'off';
    const m = (G.time + g.phase) % g.period;
    if (m < g.onDur) return 'on';
    if (m > g.period - 0.5) return 'warn';
    return 'off';
  },

  armMine(m) { m.state = 'armed'; m.fuse = 0.55; Snd.at('beep', m.x, m.y, { f: 2400 }); },

  detonate(m) {
    if (m.dead) return;
    m.dead = true;
    Enemies.blast(m.x, m.y, 105, 55, { playerDmg: 28 });
  },

  damageTower(dmg) {
    const tw = this.tower;
    if (!tw.active) return;
    tw.hp -= dmg; tw.hitT = 0.15;
    FX.sparks(tw.x + rand(-30, 30), tw.y + rand(-30, 30), rand(0, TAU), 1, 4, '#9ff0ff', 100, 300);
    if (Snd.throttle('towerhit', 150)) Snd.at('metal', tw.x, tw.y);
    if (tw.hp <= 0) { tw.hp = 0; Quest.onTowerDestroyed(); }
  },

  damageObstacle(o, dmg) {
    if (o.dead || !o.destructible) return;
    o.hp -= dmg; o.flash = 0.08;
    if (o.hp > 0) return;
    o.dead = true;
    if (o.kind === 'crate') {
      Snd.at('die', o.x, o.y);
      for (let i = 0; i < 10; i++) {
        const a = rand(0, TAU), sp = rand(80, 260);
        FX.add({ kind: 'debris', x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 6, vz: rand(150, 330), rot: rand(0, TAU), vr: rand(-12, 12), life: rand(0.9, 1.5), size: rand(5, 10), color: pick(['#a8743c', '#8a5a2b', '#6a4020']), drag: 1.5 });
      }
      Pickups.gems(o.x, o.y, randi(2, 5));
      const r = Math.random();
      if (r < 0.35) Pickups.spawn('health', o.x, o.y);
      else if (r < 0.5) Pickups.spawn('emp', o.x, o.y);
    } else if (o.kind === 'barrel') {
      FX.flash(o.x, o.y, 40, '#ffffff', 0.08);
      G.after(0.07, () => Enemies.blast(o.x, o.y, 130, 75, { playerDmg: 22 }));
    }
  },

  chainBlast(x, y, R) {
    const list = World.queryObs(x, y, R + 20, []);
    for (const o of list) if (o.destructible && !o.dead && dist(x, y, o.x, o.y) < R + o.r) this.damageObstacle(o, 999);
    for (const m of this.mines) if (!m.dead && m.state === 'idle' && dist2(x, y, m.x, m.y) < (R + 20) ** 2) { m.state = 'armed'; m.fuse = 0.12; }
  },

  shotHitProps(b) {
    for (const m of this.mines) {
      if (m.dead) continue;
      if (dist2(b.x, b.y, m.x, m.y) < (b.r + 11) ** 2) { this.detonate(m); return true; }
    }
    return false;
  },

  onEmp(x, y, R) {
    let fizzled = 0;
    for (const m of this.mines) {
      if (!m.dead && dist2(x, y, m.x, m.y) < R * R) { m.dead = true; fizzled++; FX.sparks(m.x, m.y, -Math.PI / 2, 1.5, 6, '#ffe066', 60, 200); FX.text(m.x, m.y - 10, 'ОБЕЗВРЕЖЕНО', '#ffe066', 11, 0.9); }
    }
    for (const g of this.lgates) if (Math.abs(g.x - x) < R + 150 && y > g.y0 - R - 150 && y < g.y1 + R + 150) g.off = G.time + 4.5;
    for (const l of this.rlasers) if (dist(x, y, l.x, l.y) < R + l.len) l.off = G.time + 4.5;
  },

  disableBarrier() {
    const b = this.barrier;
    b.on = false; b.off = 0; b.wall.active = false;
    Snd.play('powerdown');
    for (const y of b.pylons) G.after(Math.abs(y - 2450) / 1200, () => FX.sparks(b.x, y, 0, Math.PI, 6, '#9ff0ff', 100, 300));
  },

  // ---------------- drawing ----------------
  inView(v, x, y, m = 100) { return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; },

  drawGround(ctx, v) {
    if (Art.ready) return this.drawGroundArt(ctx, v);
    for (const h of this.heals) {
      if (!this.inView(v, h.x, h.y)) continue;
      ctx.save(); ctx.translate(h.x, h.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(3, 4, h.r + 4, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, h.r);
      g.addColorStop(0, '#2c4a3a'); g.addColorStop(1, '#16241c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5a6a62'; ctx.lineWidth = 4; ctx.stroke();
      const pulse = 0.5 + Math.sin(h.t * 3) * 0.3;
      ctx.strokeStyle = `rgba(93,255,138,${pulse})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, h.r - 7, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(93,255,138,${0.5 + pulse * 0.4})`;
      ctx.fillRect(-5, -16, 10, 32); ctx.fillRect(-16, -5, 32, 10);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * pulse;
      ctx.drawImage(FX.glow('#5dff8a'), -h.r, -h.r, h.r * 2, h.r * 2);
      ctx.restore();
    }
    for (const m of this.mines) {
      if (m.dead || !this.inView(v, m.x, m.y)) continue;
      ctx.save(); ctx.translate(m.x, m.y);
      ctx.fillStyle = 'rgba(80,60,40,0.5)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3f44'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6b737a'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; ctx.fillStyle = '#8a9299'; ctx.fillRect(Math.cos(a) * 9 - 1.5, Math.sin(a) * 9 - 1.5, 3, 3); }
      const on = m.state === 'armed' ? Math.floor(m.t * 20) % 2 : (m.t % 1.2) < 0.15;
      ctx.fillStyle = on ? '#ff2a2a' : '#5a0a0a';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      if (on) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('#ff2a2a'), -14, -14, 28, 28); }
      if (m.state === 'armed') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255,50,40,0.6)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 105, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  },

  drawStructures(ctx, v) {
    if (Art.ready) return;
    const tw = this.tower;
    if (this.inView(v, tw.x, tw.y, 150)) this.drawTower(ctx, tw);
    const gt = this.gate;
    if (this.inView(v, gt.x + 100, gt.y, 250)) this.drawGate(ctx, gt);
    const b = this.barrier;
    if (v.x0 < b.x + 60 && v.x1 > b.x - 60) {
      for (const y of b.pylons) {
        if (y < v.y0 - 40 || y > v.y1 + 40) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x + 4, y + 5, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a4148'; ctx.beginPath(); ctx.arc(b.x, y, 11, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8a959e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = b.on ? '#9ff0ff' : '#1a2a30'; ctx.beginPath(); ctx.arc(b.x, y, 5, 0, TAU); ctx.fill();
      }
    }
    for (const g of this.lgates) {
      if (!this.inView(v, g.x, (g.y0 + g.y1) / 2, 200)) continue;
      for (const y of [g.y0, g.y1]) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(g.x - 9, y - 7, 22, 20);
        ctx.fillStyle = '#4a5058'; ctx.fillRect(g.x - 12, y - 10, 24, 20);
        ctx.strokeStyle = '#1a1e22'; ctx.lineWidth = 2; ctx.strokeRect(g.x - 12, y - 10, 24, 20);
        ctx.fillStyle = g.state === 'on' ? '#ff5a5a' : g.state === 'warn' ? '#ffb03a' : '#3a1010';
        ctx.fillRect(g.x - 4, y - 4, 8, 8);
      }
    }
    for (const l of this.rlasers) {
      if (!this.inView(v, l.x, l.y, 300)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(l.x + 4, l.y + 5, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(l.x, l.y, 17, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e6b422'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = G.time < l.off ? '#3a1010' : '#ff4a4a'; ctx.beginPath(); ctx.arc(l.x, l.y, 7, 0, TAU); ctx.fill();
    }
    const dn = this.droneNPC;
    if (!dn.rescued && this.inView(v, dn.x, dn.y)) {
      ctx.save(); ctx.translate(dn.x, dn.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, 14, 8, 0, 0, TAU); ctx.fill();
      ctx.rotate(0.6 + Math.sin(dn.t * 9) * 0.05);
      ctx.fillStyle = '#b8902a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a3400'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-18, -6); ctx.moveTo(9, -2); ctx.lineTo(16, 4); ctx.stroke();
      ctx.fillStyle = '#062a36'; ctx.beginPath(); ctx.arc(2, 0, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = Math.floor(dn.t * 2) % 2 ? '#ff4757' : '#300'; ctx.beginPath(); ctx.arc(3, -1, 1.8, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },

  drawTower(ctx, tw) {
    ctx.save(); ctx.translate(tw.x, tw.y);
    const shake = tw.hitT > 0 ? rand(-2, 2) : 0;
    ctx.translate(shake, shake);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(14, 18, 60, 52, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; ctx.lineTo(Math.cos(a) * 54, Math.sin(a) * 54); } ctx.closePath();
    ctx.fillStyle = tw.hitT > 0 ? '#8a9aa6' : '#3c444c'; ctx.fill();
    ctx.strokeStyle = '#15191d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = '#e6b422'; ctx.lineWidth = 6; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.arc(0, 0, 49, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // sockets
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU;
      const sx = Math.cos(a) * 36, sy = Math.sin(a) * 36;
      ctx.fillStyle = '#15191d'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, TAU); ctx.fill();
      if (i < tw.sockets) {
        ctx.fillStyle = '#b8ff5a'; ctx.fillRect(sx - 4, sy - 6, 8, 12);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('#b8ff5a'), sx - 16, sy - 16, 32, 32); ctx.restore();
      }
    }
    // lattice mast
    ctx.strokeStyle = '#8a959e'; ctx.lineWidth = 3;
    ctx.save(); ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-24, -24, 48, 48); ctx.strokeRect(-15, -15, 30, 30);
    ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(24, 24); ctx.moveTo(24, -24); ctx.lineTo(-24, 24); ctx.stroke();
    ctx.restore();
    // dish
    ctx.save(); ctx.rotate(tw.pulse * (tw.active ? 3 : 0.5));
    ctx.fillStyle = '#c9d2da'; ctx.fillRect(0, -3, 34, 6);
    ctx.beginPath(); ctx.ellipse(34, 0, 7, 14, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4a525a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    const col = tw.done ? '#5dff8a' : tw.active ? '#5ce1ff' : (Math.floor(tw.pulse * 2) % 2 ? '#ff4757' : '#501010');
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    if (tw.active) {
      const s = 110 + Math.sin(tw.pulse * 8) * 20;
      ctx.drawImage(FX.glow('#5ce1ff'), -s / 2, -s / 2, s, s);
    } else ctx.drawImage(FX.glow(col), -18, -18, 36, 36);
    ctx.restore();
  },

  drawGate(ctx, g) {
    const { x, y, w, h } = g;
    const half = w / 2, shift = g.openT * (half - 4);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 6, y + 10, w, h);
    const door = (dx, dw) => {
      if (dw <= 0) return;
      const gr = ctx.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#a89c86'); gr.addColorStop(1, '#5a5244');
      ctx.fillStyle = gr; ctx.fillRect(dx, y, dw, h);
      ctx.fillStyle = '#3a3f46';
      ctx.fillRect(dx, y + 8, dw, 5); ctx.fillRect(dx, y + h - 13, dw, 5);
      ctx.strokeStyle = '#2a241c'; ctx.lineWidth = 2; ctx.strokeRect(dx, y, dw, h);
      ctx.fillStyle = 'rgba(199,125,255,0.55)';
      for (let k = dx + 12; k < dx + dw - 8; k += 22) ctx.fillRect(k, y + h / 2 - 5, 4, 10);
    };
    door(x, half - shift);
    door(x + half + shift, half - shift);
    // side posts
    ctx.fillStyle = '#6a6252'; ctx.fillRect(x - 26, y - 18, 26, h + 36); ctx.fillRect(x + w, y - 18, 26, h + 36);
    ctx.fillStyle = 'rgba(255,240,220,0.2)'; ctx.fillRect(x - 26, y - 18, 26, 6); ctx.fillRect(x + w, y - 18, 26, 6);
    ctx.strokeStyle = '#2a241c'; ctx.lineWidth = 2; ctx.strokeRect(x - 26, y - 18, 26, h + 36); ctx.strokeRect(x + w, y - 18, 26, h + 36);
    if (g.openT < 0.05) {
      const has = G.player && G.player.keycard;
      const col = has ? '#5dff8a' : '#ff4757';
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(x + half, y + h / 2, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + half, y + h / 2, 8, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow(col), x + half - 26, y + h / 2 - 26, 52, 52);
    }
    ctx.restore();
  },

  drawBeams(ctx, v) {
    const LB = Art.ready ? -30 : 0, LG = Art.ready ? -36 : 0, LR = Art.ready ? -10 : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const b = this.barrier;
    if (b.off < 1 && v.x0 < b.x + 40 && v.x1 > b.x - 40) {
      for (let i = 0; i < b.pylons.length - 1; i++) {
        const y0 = b.pylons[i], y1 = b.pylons[i + 1];
        if (y1 < v.y0 - 20 || y0 > v.y1 + 20) continue;
        if (!b.on && Math.abs((y0 + y1) / 2 - 2450) / 1200 < b.off * 1.8) continue;
        const fl = 0.7 + Math.random() * 0.3;
        ctx.strokeStyle = `rgba(92,225,255,${0.22 * fl})`; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(b.x, y0 + 6 + LB); ctx.lineTo(b.x, y1 - 6 + LB); ctx.stroke();
        ctx.strokeStyle = `rgba(200,250,255,${0.85 * fl})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(b.x, y0 + 6 + LB);
        for (let k = 1; k < 6; k++) ctx.lineTo(b.x + rand(-3, 3), lerp(y0, y1, k / 6) + LB);
        ctx.lineTo(b.x, y1 - 6 + LB); ctx.stroke();
      }
    }
    for (const g of this.lgates) {
      if (!this.inView(v, g.x, (g.y0 + g.y1) / 2, 200)) continue;
      if (g.state === 'on') {
        const fl = 0.8 + Math.random() * 0.2;
        ctx.strokeStyle = `rgba(255,50,40,${0.35 * fl})`; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(g.x, g.y0 + 8 + LG); ctx.lineTo(g.x, g.y1 + LG); ctx.stroke();
        ctx.strokeStyle = `rgba(255,140,120,${0.9 * fl})`; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (g.state === 'warn' && Math.floor(G.time * 16) % 2) {
        ctx.strokeStyle = 'rgba(255,160,60,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(g.x, g.y0 + 8 + LG); ctx.lineTo(g.x, g.y1 + LG); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const l of this.rlasers) {
      if (!this.inView(v, l.x, l.y, 300) || G.time < l.off) continue;
      const ex = l.x + Math.cos(l.ang) * l.len, ey = l.y + Math.sin(l.ang) * l.len + LR;
      ctx.strokeStyle = 'rgba(255,50,40,0.35)'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(l.x, l.y + LR); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,150,130,0.9)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.drawImage(FX.glow('#ff5a3c'), ex - 20, ey - 20, 40, 40);
    }
    ctx.restore();
  },

  drawObstacle(ctx, o) {
    if (Art.ready && this.drawObstacleArt(ctx, o)) return;
    let spr, s;
    switch (o.kind) {
      case 'rock': spr = (o.desert ? Tex.drocks : Tex.rocks)[o.spr % 8]; s = o.size / 48; break;
      case 'cactus': spr = Tex.cacti[o.spr % 3]; s = o.size / 16; break;
      case 'pillar': spr = o.broken ? Tex.pillarBroken : Tex.pillar; s = o.size / 28; break;
      case 'crate': spr = Tex.crate; s = o.size / 20; break;
      case 'barrel': spr = Tex.barrel; s = o.size / 15; break;
      case 'pod': this.drawPod(ctx, o); return;
      default: return;
    }
    const w = spr.width * s, hh = spr.height * s;
    ctx.drawImage(spr, o.x - w / 2, o.y - hh / 2, w, hh);
    if (o.flash > 0) {
      o.flash -= G.dt || 0.016;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
      ctx.drawImage(FX.glow('#ffffff'), o.x - o.size, o.y - o.size, o.size * 2, o.size * 2); ctx.restore();
    }
  },

  // ---------------- painted art ----------------
  obSprite(o) {
    switch (o.kind) {
      case 'tree': return o.pine ? { n: 'pine', w: o.size * 1.4, foot: o.y + o.r * 0.8, tall: true }
        : { n: ['tree1', 'tree1', 'tree2', 'tree1', 'tree2', 'tree3', 'tree2', 'tree1', 'tree3', 'tree2'][o.spr % 10], w: o.size * 2.25, foot: o.y + o.r * 0.9, tall: true };
      case 'palm': return { n: 'palm', w: o.size * 2.1, foot: o.y + o.r, tall: true };
      case 'rock': return { n: o.desert ? (o.spr % 2 ? 'drock2' : 'drock1') : ['rock1', 'rock2', 'rock3'][o.spr % 3], w: o.size * 2.1, foot: o.y + o.r * 0.6 };
      case 'cactus': return { n: 'cactus', w: o.size * 2.5, foot: o.y + o.r * 0.7 };
      case 'pillar': return o.broken ? { n: 'pillar_broken', w: o.size * 2.3, foot: o.y + o.r * 0.7 } : { n: 'pillar', w: o.size * 1.55, foot: o.y + o.r * 0.75, tall: true };
      case 'crate': return { n: 'crate', w: o.size * 2.3, foot: o.y + o.r * 0.8 };
      case 'barrel': return { n: 'barrel', w: o.size * 1.9, foot: o.y + o.r * 0.8 };
      case 'pod': return { n: 'pod', w: 104, foot: o.y + 30 };
    }
    return null;
  },

  spr(o) { return o._spr === undefined ? (o._spr = this.obSprite(o)) : o._spr; },

  drawObstacleArt(ctx, o) {
    const s = this.spr(o);
    if (!s || !Art.get(s.n)) return false;
    let alpha = 1;
    if (s.tall) {
      const p = G.player, h = Art.h(s.n, s.w);
      if (p.y < s.foot - 4 && p.y > s.foot - h && Math.abs(p.x - o.x) < s.w * 0.42) alpha = 0.4;
    }
    if (o.flash > 0) o.flash -= G.dt || 0.016;
    Art.draw(ctx, s.n, o.x, s.foot, s.w, { alpha, flip: o.spr % 2 === 1 && o.kind !== 'pod', flash: o.flash > 0 ? 0.8 : 0 });
    return true;
  },

  drawGroundArt(ctx, v) {
    for (const h of this.heals) {
      if (!this.inView(v, h.x, h.y)) continue;
      const pulse = 0.5 + Math.sin(h.t * 3) * 0.3;
      Art.draw(ctx, 'heal_pad', h.x, h.y, 100, { ay: 0.5 });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * pulse;
      ctx.drawImage(FX.glow('#5dff8a'), h.x - 50, h.y - 40, 100, 80); ctx.restore();
    }
    for (const m of this.mines) {
      if (m.dead || !this.inView(v, m.x, m.y)) continue;
      Art.draw(ctx, 'mine', m.x, m.y + 8, 28);
      const on = m.state === 'armed' ? Math.floor(m.t * 20) % 2 : (m.t % 1.2) < 0.15;
      if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('#ff2a2a'), m.x - 16, m.y - 16, 32, 32); ctx.restore(); }
      if (m.state === 'armed') {
        ctx.save(); ctx.strokeStyle = 'rgba(255,50,40,0.6)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, 105, 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
  },

  // y-sorted structures (tower, gate, pylons, broken drone)
  sortables(v, out) {
    if (!Art.ready) return;
    const tw = this.tower;
    if (this.inView(v, tw.x, tw.y, 420)) out.push({ y: tw.y + 30, draw: (ctx) => this.drawTowerArt(ctx, tw) });
    const g = this.gate;
    if (this.inView(v, g.x + g.w / 2, g.y, 320)) out.push({ y: g.y + g.h, draw: (ctx) => this.drawGateArt(ctx, g) });
    const b = this.barrier;
    if (v.x0 < b.x + 60 && v.x1 > b.x - 60) for (const y of b.pylons) {
      if (y < v.y0 - 60 || y > v.y1 + 60) continue;
      out.push({ y: y + 4, draw: (ctx) => Art.draw(ctx, 'bpylon', b.x, y + 8, 22, b.on ? {} : { tint: ['#05080c', 0.5] }) });
    }
    for (const lg of this.lgates) {
      if (!this.inView(v, lg.x, (lg.y0 + lg.y1) / 2, 200)) continue;
      for (const y of [lg.y0, lg.y1]) out.push({ y: y + 6, draw: (ctx) => Art.draw(ctx, 'pylon', lg.x, y + 8, 26, lg.state === 'off' ? { tint: ['#000000', 0.3] } : {}) });
    }
    for (const l of this.rlasers) if (this.inView(v, l.x, l.y, 300)) out.push({ y: l.y, draw: (ctx) => Art.draw(ctx, 'pylon', l.x, l.y + 14, 30, G.time < l.off ? { tint: ['#000000', 0.4] } : {}) });
    const dn = this.droneNPC;
    if (!dn.rescued && this.inView(v, dn.x, dn.y)) out.push({ y: dn.y, draw: (ctx) => {
      Art.shadow(ctx, dn.x + 3, dn.y + 4, 14, 5);
      Art.draw(ctx, 'drone', dn.x, dn.y + 6, 32, { rot: 0.5 + Math.sin(dn.t * 9) * 0.05, tint: ['#1a1a1a', 0.35] });
    } });
  },

  drawTowerArt(ctx, tw) {
    const foot = tw.y + 44, w = 108, h = Art.h('tower', w), p = G.player;
    const alpha = p.y < foot - 12 && p.y > foot - h && Math.abs(p.x - tw.x) < w * 0.45 ? 0.5 : 1;
    const sh = tw.hitT > 0 ? rand(-2, 2) : 0;
    Art.shadow(ctx, tw.x + 12, foot - 8, 62, 20, 0.3);
    Art.draw(ctx, 'tower', tw.x + sh, foot, w, { alpha, flash: tw.hitT > 0 ? 0.5 : 0 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < tw.sockets; i++) ctx.drawImage(FX.glow('#b8ff5a'), tw.x + (i - 1) * 24 - 16, foot - 40, 32, 32);
    const col = tw.done ? '#5dff8a' : tw.active ? '#5ce1ff' : (Math.floor(tw.pulse * 2) % 2 ? '#ff4757' : null);
    if (col) { const s = tw.active ? 90 + Math.sin(tw.pulse * 8) * 20 : 44; ctx.drawImage(FX.glow(col), tw.x - s / 2, foot - h * 0.9 - s / 2, s, s); }
    if (tw.active) { ctx.globalAlpha = 0.45; ctx.drawImage(FX.glow('#5ce1ff'), tw.x - 70, foot - 90, 140, 110); }
    ctx.restore();
  },

  drawGateArt(ctx, g) {
    const im = Art.get('gate');
    const W = 300, H = (W * im.height) / im.width;
    const cx = g.x + g.w / 2, foot = g.y + g.h + 10, x0 = cx - W / 2, y0 = foot - H;
    const L = 0.21, M = 0.5, Rr = 0.79, iw = im.width, ih = im.height;
    const shift = g.openT * (M - L);
    ctx.save();
    Art.shadow(ctx, cx + 8, foot - 4, W * 0.5, 16, 0.3);
    ctx.fillStyle = '#140c1c';
    ctx.fillRect(x0 + W * L, y0 + H * 0.12, W * (Rr - L), H * 0.86);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + W * L, y0, W * (Rr - L), H); ctx.clip();
    ctx.drawImage(im, iw * L, 0, iw * (M - L), ih, x0 + W * (L - shift), y0, W * (M - L), H);
    ctx.drawImage(im, iw * M, 0, iw * (Rr - M), ih, x0 + W * (M + shift), y0, W * (Rr - M), H);
    ctx.restore();
    ctx.drawImage(im, 0, 0, iw * L, ih, x0, y0, W * L, H);
    ctx.drawImage(im, iw * Rr, 0, iw * (1 - Rr), ih, x0 + W * Rr, y0, W * (1 - Rr), H);
    if (g.openT < 0.05) {
      const col = G.player && G.player.keycard ? '#5dff8a' : '#ff4757';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(G.time * 4) * 0.25;
      ctx.drawImage(FX.glow(col), cx - 40, y0 + H * 0.5 - 40, 80, 80);
    }
    ctx.restore();
  },

  drawCanopy(ctx, o, alpha) {
    const spr = o.kind === 'palm' ? Tex.palms[o.spr % 3] : o.pine ? Tex.pines[o.spr % 4] : Tex.trees[o.spr % 10];
    const s = o.size / (o.kind === 'palm' ? 46 : 48);
    const w = spr.width * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, o.x - w / 2, o.y - w / 2, w, w);
    ctx.globalAlpha = 1;
  },

  drawPod(ctx, o) {
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(-0.5);
    const g = ctx.createLinearGradient(0, -24, 0, 24);
    g.addColorStop(0, '#e8eef2'); g.addColorStop(0.5, '#9aa6af'); g.addColorStop(1, '#4b555e');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 24, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b3238'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(20,14,10,0.55)'; ctx.beginPath(); ctx.ellipse(-16, 6, 22, 14, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9d2e'; ctx.fillRect(-4, -24, 8, 48);
    ctx.fillStyle = '#062a36'; ctx.beginPath(); ctx.ellipse(18, 0, 13, 15, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5ce1ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(18, 0, 13, 15, 0, -1, 0.6); ctx.stroke();
    ctx.fillStyle = '#6b7680'; ctx.beginPath(); ctx.moveTo(-40, -8); ctx.lineTo(-54, -16); ctx.lineTo(-50, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  drawCell(ctx, bob) {
    const pulse = Math.sin(G.time * 4);
    ctx.strokeStyle = `rgba(184,255,90,${0.45 + pulse * 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 10, 24 + pulse * 3, 10 + pulse, 0, 0, TAU); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(FX.glow('#b8ff5a'), -16, -160 + bob, 32, 170);
    ctx.globalAlpha = 1;
    ctx.drawImage(FX.glow('#b8ff5a'), -34, -34 + bob, 68, 68);
    ctx.restore();
    ctx.fillStyle = '#12200a'; ctx.beginPath(); ctx.roundRect(-9, -15 + bob, 18, 28, 4); ctx.fill();
    ctx.strokeStyle = '#d8ff9a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(-4, -19 + bob, 8, 4);
    ctx.fillStyle = '#b8ff5a';
    for (let i = 0; i < 3; i++) ctx.fillRect(-5, -10 + i * 8 + bob, 10, 5);
  },
};
