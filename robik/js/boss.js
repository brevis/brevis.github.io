'use strict';
// Colossus — the ruins guardian. Three phases, telegraphed attacks.
const Boss = {
  e: null, waves: [], beam: null, pillars: [],

  spawn() {
    const A = World.arena;
    const e = Enemies.spawn('boss', A.x, A.y - 40, {});
    e.bst = 'sleep'; e.phase = 1; e.bT = 0; e.plates = 3; e.aim = Math.PI / 2; e.legPh = 0; e.bodyAng = 0;
    e.lastAtk = ''; e.summonCd = 0; e.shots = 0; e.shotT = 0; e.spin = 0; e.scale = 0.92;
    this.e = e; this.waves = []; this.beam = null;
    this.pillars = World.obstacles.filter((o) => o.kind === 'pillar' && dist(o.x, o.y, A.x, A.y) < 700);
    return e;
  },

  wake() {
    const e = this.e;
    if (!e || e.bst !== 'sleep') return;
    e.bst = 'intro'; e.bT = 3.2;
  },

  color(e) { return e.phase === 1 ? '#ff8a2a' : e.phase === 2 ? '#ff3b2f' : '#ff4df0'; },

  modDamage(e, dmg) {
    if (e.bst === 'sleep' || e.bst === 'intro' || e.bst === 'phase') return 0;
    if (e.bst === 'recover') return dmg * 1.35;
    return dmg;
  },

  update(e, dt, p) {
    const A = World.arena;
    e.legPh += dt * (Math.hypot(e.vx, e.vy) > 10 ? 6 : 1);
    e.bodyAng += dt * 0.2;
    if (e.summonCd > 0) e.summonCd -= dt;
    const aimT = angTo(e.x, e.y, p.x, p.y);
    const fast = e.phase === 3 ? 1.25 : e.phase === 2 ? 1.1 : 1;

    // phase transitions
    if (e.bst !== 'phase' && e.bst !== 'intro' && e.bst !== 'sleep') {
      if (e.phase === 1 && e.hp < e.maxHp * 0.66) return this.enterPhase(e, 2);
      if (e.phase === 2 && e.hp < e.maxHp * 0.33) return this.enterPhase(e, 3);
    }

    switch (e.bst) {
      case 'sleep': return;
      case 'intro':
        e.bT -= dt;
        e.scale = lerp(0.92, 1, clamp(1 - e.bT / 3.2, 0, 1));
        if (e.bT < 2.4 && !e.roared) { e.roared = true; Snd.play('roar'); G.addShake(1); FX.ring(e.x, e.y, 40, 500, '#ff8a2a', 0.8, 12); }
        e.aim = rotateToward(e.aim, aimT, dt * 2);
        if (e.bT <= 0) { e.bst = 'idle'; e.bT = 0.8; }
        return;
      case 'phase':
        e.bT -= dt;
        e.aim += dt * 6;
        if (Math.random() < dt * 30) FX.sparks(e.x + rand(-50, 50), e.y + rand(-50, 50), rand(0, TAU), 0.5, 2, this.color(e), 200, 500);
        if (e.bT <= 0) { e.bst = 'idle'; e.bT = 0.6; }
        return;
      case 'idle': {
        e.bT -= dt;
        e.aim = rotateToward(e.aim, aimT, dt * 3);
        const d = dist(e.x, e.y, p.x, p.y);
        const sp = (e.phase === 1 ? 55 : e.phase === 2 ? 70 : 90);
        const a = d > 260 ? aimT : aimT + Math.PI / 2;
        e.vx = damp(e.vx, Math.cos(a) * sp, 4, dt); e.vy = damp(e.vy, Math.sin(a) * sp, 4, dt);
        this.move(e, e.vx * dt, e.vy * dt);
        Enemies.contact(e, { x: p.x, y: p.y, r: p.hitR, d, tower: false }, 22, 560);
        if (e.bT <= 0) this.pickAttack(e);
        return;
      }
    }

    // attacks
    e.vx *= 0.9; e.vy *= 0.9;
    e.bT -= dt;
    switch (e.bst) {
      case 'ring': {
        e.aim = rotateToward(e.aim, aimT, dt * 2);
        e.shotT -= dt;
        if (e.shotT <= 0 && e.shots > 0) {
          const n = e.phase === 1 ? 16 : e.phase === 2 ? 20 : 24;
          const off = (e.shots % 2) * (Math.PI / n) + e.bodyAng;
          for (let i = 0; i < n; i++) this.shoot(e, off + (i / n) * TAU, 210 * fast, 8, 12, '#ff7a2a');
          FX.ring(e.x, e.y, 30, 90, '#ff9a4a', 0.25, 5);
          Snd.play('eshoot'); G.addShake(0.15);
          e.shots--; e.shotT = 0.42;
        }
        if (e.shots <= 0 && e.shotT <= 0) this.toIdle(e);
        break;
      }
      case 'spread': {
        e.aim = rotateToward(e.aim, aimT, dt * 4);
        e.shotT -= dt;
        if (e.shotT <= 0 && e.shots > 0) {
          const n = e.phase === 3 ? 7 : 5;
          for (let i = 0; i < n; i++) this.shoot(e, e.aim + (i - (n - 1) / 2) * 0.17, 340 * fast, 7, 11, '#ffb03a', 58);
          FX.flash(e.x + Math.cos(e.aim) * 58, e.y + Math.sin(e.aim) * 58, 30, '#ffb03a', 0.08);
          Snd.play('eshoot');
          e.shots--; e.shotT = 0.24;
        }
        if (e.shots <= 0 && e.shotT <= 0) this.toIdle(e);
        break;
      }
      case 'stomp': {
        if (e.sub === 'lift') {
          e.scale = 1 + (1 - e.bT / 0.85) * 0.08;
          if (e.bT <= 0) {
            e.scale = 1;
            this.waves.push({ x: e.x, y: e.y, r: 70, sp: 440 * fast, max: 900, thick: 26, dmg: 20, hit: false, col: this.color(e) });
            G.addShake(0.9); Snd.play('stomp');
            FX.dust(e.x, e.y, '#9a8a7a', 14, 220);
            e.stomps--;
            if (e.stomps > 0) { e.sub = 'lift'; e.bT = 0.6; } else { e.sub = 'done'; e.bT = 0.7; }
          }
        } else if (e.bT <= 0) this.toIdle(e);
        break;
      }
      case 'spiral': {
        e.spin += dt * (e.phase === 3 ? 2.8 : 2.2) * e.spinDir;
        e.aim = e.spin;
        e.shotT -= dt;
        if (e.shotT <= 0) {
          const arms = e.phase === 3 ? 3 : 2;
          for (let k = 0; k < arms; k++) this.shoot(e, e.spin + (k / arms) * TAU, 200, 7, 10, '#ff4df0');
          e.shotT = 0.075;
          if (Snd.throttle('spiral', 150)) Snd.play('eshoot');
        }
        if (e.bT <= 0) this.toIdle(e);
        break;
      }
      case 'laser': {
        const b = this.beam;
        if (b.stage === 'tele') {
          b.t -= dt;
          e.aim = b.a0;
          if (b.t <= 0) { b.stage = 'fire'; b.t = b.dur; Snd.play('charge', { dur: 0.2 }); G.addShake(0.4); }
        } else {
          b.t -= dt;
          const k = 1 - b.t / b.dur;
          b.a = b.a0 + b.sweep * k;
          e.aim = b.a;
          Snd.play('laser');
          G.addShake(0.08);
          const len = this.rayLen(e.x, e.y, b.a, 1100);
          b.len = len;
          const ex = e.x + Math.cos(b.a) * len, ey = e.y + Math.sin(b.a) * len;
          if (Math.random() < 0.8) FX.sparks(ex, ey, b.a + Math.PI, 0.8, 2, '#ffd0c0', 150, 400, 0.2);
          if (p.alive && segDist2(p.x, p.y, e.x, e.y, ex, ey) < (14 + p.hitR) ** 2) Player.hurt(p, 14, ex - Math.cos(b.a) * 300, ey - Math.sin(b.a) * 300, { kb: 200, iframes: 0.45 });
          for (const o of G.enemies) if (o !== e && !o.dead && segDist2(o.x, o.y, e.x, e.y, ex, ey) < (14 + o.r) ** 2 && o.orbitCd < G.time) { o.orbitCd = G.time + 0.3; Enemies.damage(o, 20, { ang: b.a, kb: 200, quiet: true }); }
          if (b.t <= 0) { this.beam = null; this.toIdle(e, 0.4); }
        }
        break;
      }
      case 'summon':
        if (e.bT <= 0) this.toIdle(e);
        break;
      case 'missiles': {
        e.shotT -= dt;
        if (e.shotT <= 0 && e.shots > 0) {
          const a = e.aim + (e.shots % 2 ? 1 : -1) * rand(1, 1.8);
          G.eBullets.push({ x: e.x + Math.cos(a) * 50, y: e.y + Math.sin(a) * 50, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 7, dmg: 14, life: 4.5, color: '#ff5a2a', kind: 'missile', homing: 2.3, shootable: true,
            onEnd: (bb) => FX.explosion(bb.x, bb.y, 0.35, { noDecal: true }) });
          Snd.play('eshoot');
          e.shots--; e.shotT = 0.18;
        }
        e.aim = rotateToward(e.aim, aimT, dt * 3);
        if (e.shots <= 0 && e.shotT <= 0) this.toIdle(e, 0.6);
        break;
      }
      case 'charge': {
        if (e.sub === 'tele') {
          if (e.bT > 0.3) e.chargeAng = rotateToward(e.chargeAng, aimT, dt * 4);
          e.aim = e.chargeAng;
          if (e.bT <= 0) { e.sub = 'go'; e.bT = 1.0; Snd.play('roar'); }
        } else if (e.sub === 'go') {
          const sp = 920;
          e.x += Math.cos(e.chargeAng) * sp * dt; e.y += Math.sin(e.chargeAng) * sp * dt;
          FX.dust(e.x, e.y, '#9a8a7a', 2, 80);
          Enemies.contact(e, { x: p.x, y: p.y, r: p.hitR, d: dist(e.x, e.y, p.x, p.y), tower: false }, 30, 700);
          if (dist(e.x, e.y, A.x, A.y) > 500 || e.bT <= 0) {
            const a = angTo(A.x, A.y, e.x, e.y), dd = Math.min(500, dist(e.x, e.y, A.x, A.y));
            e.x = A.x + Math.cos(a) * dd; e.y = A.y + Math.sin(a) * dd;
            G.addShake(0.8); Snd.play('stomp');
            FX.sparks(e.x, e.y, e.chargeAng + Math.PI, 1, 20, '#ffe2b0', 200, 600);
            this.waves.push({ x: e.x, y: e.y, r: 60, sp: 380, max: 420, thick: 22, dmg: 16, hit: false, col: this.color(e) });
            e.bst = 'recover'; e.bT = 1.1;
            FX.text(e.x, e.y - 80, 'УЯЗВИМ!', '#ffe066', 20, 1);
          }
        }
        break;
      }
      case 'recover':
        if (e.bT <= 0) this.toIdle(e);
        break;
    }
    this.clampArena(e);
  },

  toIdle(e, t) { e.bst = 'idle'; e.bT = t != null ? t : e.phase === 1 ? 0.9 : e.phase === 2 ? 0.65 : 0.45; },

  pickAttack(e) {
    const pools = {
      1: ['ring', 'spread', 'stomp', 'spread'],
      2: ['ring', 'spread', 'stomp', 'spiral', 'laser', 'summon'],
      3: ['spiral', 'laser', 'missiles', 'charge', 'stomp', 'spread', 'summon'],
    };
    let pool = pools[e.phase].filter((a) => a !== e.lastAtk && !(a === 'summon' && e.summonCd > 0));
    const atk = pick(pool);
    e.lastAtk = atk;
    e.bst = atk;
    const p = G.player;
    switch (atk) {
      case 'ring': e.shots = e.phase === 3 ? 4 : 3; e.shotT = 0.35; break;
      case 'spread': e.shots = e.phase === 3 ? 7 : 5; e.shotT = 0.35; break;
      case 'stomp': e.sub = 'lift'; e.bT = 0.85; e.stomps = e.phase === 1 ? 1 : 2; Snd.play('charge', { dur: 0.8 }); break;
      case 'spiral': e.bT = e.phase === 3 ? 3.4 : 2.8; e.spin = e.aim; e.spinDir = chance(0.5) ? 1 : -1; e.shotT = 0.3; break;
      case 'laser': {
        const dir = chance(0.5) ? 1 : -1;
        const a0 = angTo(e.x, e.y, p.x, p.y) - dir * 1.0;
        this.beam = { stage: 'tele', t: 1.1, a0, a: a0, sweep: dir * 2.1, dur: 2.5, len: 1100 };
        e.bT = 99;
        Snd.play('charge', { dur: 1.1 });
        break;
      }
      case 'summon': {
        e.bT = 1.2; e.summonCd = 14;
        Snd.play('roar'); G.addShake(0.5);
        const A = World.arena;
        const list = e.phase === 3 ? ['bomber', 'bomber', 'bomber', 'crawler', 'crawler', 'crawler'] : ['bomber', 'bomber', 'crawler', 'crawler', 'crawler'];
        list.forEach((t, i) => {
          const a = (i / list.length) * TAU + rand(-0.2, 0.2);
          const x = A.x + Math.cos(a) * 420, y = A.y + Math.sin(a) * 420;
          G.after(i * 0.15, () => Enemies.spawn(t, x, y, { emerge: true, aggro: true, wave: true }));
        });
        break;
      }
      case 'missiles': e.shots = 6; e.shotT = 0.3; break;
      case 'charge': e.sub = 'tele'; e.bT = 0.9; e.chargeAng = angTo(e.x, e.y, p.x, p.y); Snd.play('charge', { dur: 0.9 }); break;
    }
  },

  enterPhase(e, ph) {
    e.phase = ph; e.bst = 'phase'; e.bT = 2.4;
    this.beam = null;
    Snd.play('roar'); G.addShake(1); G.hitStop = 0.15;
    FX.explosion(e.x, e.y, 1.6, { noDecal: true, debris: '#6b7280' });
    FX.ring(e.x, e.y, 60, 700, this.color(e), 0.7, 14);
    for (const b of G.eBullets) b.dead = true;
    const p = G.player;
    if (p.alive) { const a = angTo(e.x, e.y, p.x, p.y); p.vx += Math.cos(a) * 700; p.vy += Math.sin(a) * 700; }
    if (ph === 2) {
      e.plates = 0;
      for (let i = 0; i < 3; i++) FX.add({ kind: 'debris', x: e.x, y: e.y, vx: rand(-300, 300), vy: rand(-300, 300), z: 20, vz: 400, rot: 0, vr: rand(-8, 8), life: 2, size: 26, color: '#6b7280', drag: 1 });
    }
    Pickups.spawn('health', e.x + 120, e.y + 80, { burst: 260 });
    Pickups.spawn('health', e.x - 120, e.y + 80, { burst: 260 });
    Pickups.spawn('emp', e.x, e.y + 120, { burst: 260 });
    G.checkpointBossHp = e.hp;
    Quest.onBossPhase(ph);
  },

  move(e, dx, dy) { e.x += dx; e.y += dy; this.clampArena(e); },

  clampArena(e) {
    const A = World.arena;
    const d = dist(e.x, e.y, A.x, A.y);
    if (d > 500) { const a = angTo(A.x, A.y, e.x, e.y); e.x = A.x + Math.cos(a) * 500; e.y = A.y + Math.sin(a) * 500; }
  },

  shoot(e, a, sp, r, dmg, col, off = 46) {
    G.eBullets.push({ x: e.x + Math.cos(a) * off, y: e.y + Math.sin(a) * off, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, dmg, life: 4, color: col });
  },

  rayLen(x, y, a, max) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = max;
    for (const o of this.pillars) {
      if (o.dead) continue;
      const fx = o.x - x, fy = o.y - y;
      const t = fx * dx + fy * dy;
      if (t < 0 || t > best) continue;
      const px = fx - dx * t, py = fy - dy * t;
      const h2 = o.r * o.r - (px * px + py * py);
      if (h2 < 0) continue;
      const tt = t - Math.sqrt(h2);
      if (tt > 0 && tt < best) best = tt;
    }
    return best;
  },

  updateWaves(dt) {
    const p = G.player;
    for (const w of this.waves) {
      w.r += w.sp * dt;
      if (w.r > w.max) { w.dead = true; continue; }
      if (!w.hit && p.alive && p.invuln <= 0) {
        const d = dist(w.x, w.y, p.x, p.y);
        if (Math.abs(d - w.r) < w.thick / 2 + p.hitR) { w.hit = true; Player.hurt(p, w.dmg, w.x, w.y, { kb: 480 }); }
      }
    }
    this.waves = this.waves.filter((w) => !w.dead);
  },

  onDeath(e) {
    G.stats.bossTime = G.time - (G.bossStartT || G.time);
    this.beam = null; this.waves = [];
    for (const b of G.eBullets) b.dead = true;
    for (const o of G.enemies) if (!o.dead && o !== e) { o.noDrops = true; Enemies.kill(o); }
    G.slowmo = 2.8;
    G.cinematic = true;
    this.corpse = e;
    G.camFocus = { x: e.x, y: e.y };
    Music.intensity = 0;
    const x = e.x, y = e.y;
    for (let i = 0; i < 9; i++) {
      G.after(i * 0.22, () => { FX.explosion(x + rand(-60, 60), y + rand(-60, 60), rand(0.8, 1.3), { debris: '#4a505c' }); Snd.play('explode'); G.addShake(0.6); });
    }
    G.after(2.2, () => {
      FX.explosion(x, y, 3, { debris: '#4a505c' });
      FX.ring(x, y, 50, 900, '#ffffff', 0.9, 16);
      FX.flash(x, y, 500, '#ffe2b0', 0.5);
      Snd.play('explode', { big: true }); Snd.play('roar');
      G.addShake(1.2);
      UI.whiteFlash();
      Pickups.spawn('core', x, y, { burst: 0 });
      this.corpse = null;
    });
    G.after(3.4, () => { G.cinematic = false; G.camFocus = null; Quest.onBossDead(); });
  },

  // ---------- drawing ----------
  drawFx(ctx) {
    const e = this.e;
    for (const w of this.waves) {
      const a = clamp(1 - w.r / w.max, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + a * 0.6;
      ctx.strokeStyle = w.col; ctx.lineWidth = w.thick;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (!e || e.dead) return;
    if (e.bst === 'stomp' && e.sub === 'lift') {
      const k = 1 - e.bT / 0.85;
      ctx.save();
      ctx.strokeStyle = `rgba(255,60,40,${0.3 + k * 0.5})`; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 70 + k * 40, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, 160 + k * 60, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (e.bst === 'charge' && e.sub === 'tele') {
      const k = 1 - e.bT / 0.9;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.chargeAng);
      ctx.fillStyle = `rgba(255,40,80,${0.1 + k * 0.3})`; ctx.fillRect(0, -66, 900, 132);
      ctx.strokeStyle = `rgba(255,80,140,${0.5 + k * 0.5})`; ctx.lineWidth = 2; ctx.strokeRect(0, -66, 900, 132);
      ctx.restore();
    }
    const b = this.beam;
    if (b) {
      ctx.save();
      if (b.stage === 'tele') {
        const len = this.rayLen(e.x, e.y, b.a0, 1100);
        ctx.strokeStyle = `rgba(255,60,60,${Math.floor(G.time * 16) % 2 ? 0.9 : 0.4})`; ctx.lineWidth = 2; ctx.setLineDash([16, 10]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(b.a0) * len, e.y + Math.sin(b.a0) * len); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,60,60,0.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, 260, Math.min(b.a0, b.a0 + b.sweep), Math.max(b.a0, b.a0 + b.sweep)); ctx.closePath(); ctx.stroke();
      } else {
        const ex = e.x + Math.cos(b.a) * b.len, ey = e.y + Math.sin(b.a) * b.len;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,50,40,0.35)'; ctx.lineWidth = 46 + Math.sin(G.time * 60) * 6;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,120,90,0.8)'; ctx.lineWidth = 22;
        ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 8;
        ctx.stroke();
        ctx.drawImage(FX.glow('#ff5a3c'), ex - 50, ey - 50, 100, 100);
      }
      ctx.restore();
    }
  },

  draw(ctx, e, wf, hitFlash) {
    const col = e.bst === 'sleep' ? '#555' : this.color(e);
    const sleep = e.bst === 'sleep';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(e.x + 10, e.y + 16, 105, 80, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(e.x, e.y);
    const s = e.scale || 1;
    ctx.scale(s, s);
    // legs
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const st = Math.sin(e.legPh + (i % 2) * Math.PI) * 12;
      const hx = Math.cos(a) * 42, hy = Math.sin(a) * 42;
      const fx = Math.cos(a + st * 0.012) * (108 + st), fy = Math.sin(a + st * 0.012) * (108 + st);
      const kx = (hx + fx) / 2 + Math.cos(a + 0.5) * 22, ky = (hy + fy) / 2 + Math.sin(a + 0.5) * 22;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = wf ? '#fff' : '#1c2026'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = wf ? '#fff' : '#5a606c'; ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = wf ? '#fff' : '#2a2e36';
      ctx.beginPath(); ctx.arc(kx, ky, 7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, TAU); ctx.fill();
      if (!sleep) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill(); }
    }
    // armor plates (phase 1)
    if (e.plates > 0) {
      ctx.save(); ctx.rotate(e.bodyAng * 2);
      for (let i = 0; i < e.plates; i++) {
        ctx.rotate(TAU / 3);
        ctx.strokeStyle = wf ? '#fff' : '#6b7280'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(0, 0, 80, -0.4, 0.4); ctx.stroke();
        ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 87, -0.4, 0.4); ctx.stroke();
      }
      ctx.restore();
    }
    // body
    ctx.save(); ctx.rotate(e.bodyAng);
    const g = ctx.createLinearGradient(-60, -60, 60, 60);
    g.addColorStop(0, wf ? '#fff' : '#6a707c'); g.addColorStop(0.5, wf ? '#fff' : '#3a3f4a'); g.addColorStop(1, wf ? '#fff' : '#1a1d22');
    ctx.fillStyle = g;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * 62, Math.sin(a) * 62); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0e1013'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60); ctx.stroke(); }
    // seams
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = sleep ? 0.4 : 0.9;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); } ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    // core
    const pulse = 1 + Math.sin(G.time * (e.phase === 3 ? 14 : 6)) * 0.12;
    ctx.fillStyle = sleep ? '#333' : col;
    ctx.beginPath(); ctx.arc(0, 0, 20 * pulse, 0, TAU); ctx.fill();
    if (!sleep) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gs = 90 * pulse;
      ctx.drawImage(FX.glow(col), -gs / 2, -gs / 2, gs, gs);
      ctx.drawImage(FX.glow('#ffffff'), -14, -14, 28, 28);
      if (hitFlash) { ctx.globalAlpha = 0.45; ctx.drawImage(FX.glow('#ffffff'), -80, -80, 160, 160); }
      ctx.restore();
    }
    // turret head
    ctx.rotate(e.aim);
    ctx.fillStyle = wf ? '#fff' : '#23272e';
    ctx.fillRect(14, -16, 46, 10); ctx.fillRect(14, 6, 46, 10);
    ctx.fillStyle = sleep ? '#444' : col;
    ctx.fillRect(54, -15, 6, 8); ctx.fillRect(54, 7, 6, 8);
    ctx.fillStyle = wf ? '#fff' : '#4a505c';
    ctx.beginPath(); ctx.arc(0, 0, 26, -1.1, 1.1); ctx.lineTo(0, 0); ctx.fill();
    ctx.strokeStyle = '#0e1013'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = sleep ? '#222' : '#fff';
    ctx.beginPath(); ctx.arc(16, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
    if (sleep) {
      ctx.save();
      ctx.font = "16px 'Russo One', sans-serif"; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(199,125,255,${0.4 + Math.sin(G.time * 2) * 0.3})`;
      ctx.fillText('z  z  z', e.x + 70, e.y - 90 - Math.sin(G.time) * 6);
      ctx.restore();
    }
  },
};
