'use strict';
// Enemy definitions, AI, damage, drawing.
const EDEF = {
  crawler: { r: 13, hp: 22, speed: 160, dmg: 9, xp: 2, mass: 1, aggroR: 420, emp: 5 },
  spitter: { r: 16, hp: 42, speed: 95, dmg: 11, xp: 4, mass: 1.4, aggroR: 500, emp: 7 },
  bomber: { r: 12, hp: 14, speed: 210, dmg: 26, xp: 2, mass: 0.8, aggroR: 460, emp: 5 },
  turret: { r: 22, hp: 95, speed: 0, dmg: 9, xp: 6, mass: 99, aggroR: 560, emp: 10, static: true },
  nest: { r: 38, hp: 220, speed: 0, dmg: 0, xp: 16, mass: 99, aggroR: 720, emp: 15, static: true },
  brute: { r: 30, hp: 520, speed: 90, dmg: 22, xp: 30, mass: 6, aggroR: 560, emp: 25 },
  boss: { r: 66, hp: 5200, speed: 70, dmg: 22, xp: 0, mass: 999, aggroR: 0, emp: 0 },
};

// vertical offset of the body centre above the feet when painted sprites are used
const HIT_OY = { crawler: -4, spitter: -8, bomber: -6, turret: -12, nest: -20, brute: -14, boss: -72 };

const Enemies = {
  nextId: 1,

  spawn(type, x, y, o = {}) {
    const d = EDEF[type];
    const e = {
      id: this.nextId++, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      r: d.r, hp: d.hp * (o.hpMul || 1), maxHp: d.hp * (o.hpMul || 1), speed: d.speed * (o.spdMul || 1), dmg: d.dmg, xp: d.xp, mass: d.mass,
      aggroR: d.aggroR, static: !!d.static,
      state: o.emerge ? 'emerge' : 'active', stateT: o.emerge ? 0.7 : 0,
      aggro: !!o.aggro, wave: !!o.wave, towerPref: o.towerPref || 0,
      homeX: x, homeY: y, wx: x, wy: y, wanderT: rand(0, 3),
      ang: rand(0, TAU), aim: rand(0, TAU), t: 0, anim: rand(0, 10), flash: 0, stun: 0,
      contactCd: 0, shootT: rand(0.8, 2), charge: 0, burst: 0, burstT: 0, fuse: 0,
      lungeT: 0, lungeCd: rand(0.5, 1.5), strafe: chance(0.5) ? 1 : -1, stuckT: 0, detourT: 0, detourA: 0,
      spawnT: 1.5, parent: o.parent || 0, tag: o.tag, onDeath: o.onDeath, orbitCd: 0,
      bst: 'chase', bT: 0, chargeCd: 1.5, slamCd: 0, chargeAng: 0, noDrops: !!o.noDrops, name: o.name,
      dead: false, dormant: false, dp: 9999, face: 1, hoy: Art.ready ? HIT_OY[type] || 0 : 0,
    };
    G.enemies.push(e);
    if (o.emerge) { FX.emerge(x, y, e.r); Snd.at('emerge', x, y); }
    return e;
  },

  update(dt) {
    const p = G.player;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.dp = dist(e.x, e.y, p.x, p.y);
      if (!e.aggro && !e.wave && e.dp > 1300 && e.type !== 'boss') { e.dormant = true; continue; }
      e.dormant = false;
      this.step(e, dt, p);
    }
    this.separate();
    G.enemies = G.enemies.filter((e) => !e.dead);
  },

  target(e, p) {
    const tw = Props.tower;
    if (e.towerPref && tw && tw.active && (e.dp > 180 || !p.alive)) {
      return { x: tw.x, y: tw.y, r: 46, d: dist(e.x, e.y, tw.x, tw.y), tower: true };
    }
    return { x: p.x, y: p.y, r: p.hitR, d: e.dp, tower: false };
  },

  step(e, dt, p) {
    e.t += dt; e.anim += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    if (!e.static && (Math.abs(e.kx) > 1 || Math.abs(e.ky) > 1)) {
      World.moveBody(e, e.kx * dt, e.ky * dt);
      const k = Math.exp(-9 * dt); e.kx *= k; e.ky *= k;
    }
    if (e.state === 'emerge') { e.stateT -= dt; if (e.stateT <= 0) e.state = 'active'; return; }
    if (e.type === 'boss') { Boss.update(e, dt, p); return; }
    if (e.stun > 0) {
      e.stun -= dt;
      if (Math.random() < dt * 8) FX.add({ kind: 'spark', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-60, 60), vy: rand(-120, -40), life: 0.2, size: 1.5, color: '#ffe066', add: true });
      return;
    }
    if (!e.aggro && p.alive && e.dp < e.aggroR) this.alert(e);
    if (e.aggro && !e.wave && (e.dp > 1500 || !p.alive)) e.aggro = false;
    const tgt = this.target(e, p);
    if (!p.alive && !tgt.tower) { this.wander(e, dt); return; }
    this[e.type](e, dt, tgt, p);
  },

  alert(e) {
    if (e.aggro) return;
    e.aggro = true;
    Quest.onAggro(e);
    for (const o of G.enemies) if (!o.aggro && !o.dead && o.type !== 'boss' && dist2(o.x, o.y, e.x, e.y) < 330 * 330) { o.aggro = true; }
  },

  moveDir(e, a, sp, dt) {
    if (e.detourT > 0) { e.detourT -= dt; a = e.detourA; }
    e.vx = damp(e.vx, Math.cos(a) * sp, 8, dt);
    e.vy = damp(e.vy, Math.sin(a) * sp, 8, dt);
    const ox = e.x, oy = e.y;
    World.moveBody(e, e.vx * dt, e.vy * dt);
    const moved = Math.hypot(e.x - ox, e.y - oy), exp = Math.hypot(e.vx, e.vy) * dt;
    if (sp > 20 && exp > 0.5 && moved < exp * 0.35) {
      e.stuckT += dt;
      if (e.stuckT > 0.3) { e.detourA = a + (chance(0.5) ? 1 : -1) * Math.PI / 2 * rand(0.7, 1.2); e.detourT = rand(0.4, 0.9); e.stuckT = 0; }
    } else e.stuckT = 0;
    if (sp > 5 && exp > 0.1) e.ang = rotateToward(e.ang, Math.atan2(e.vy, e.vx), dt * 10);
  },

  wander(e, dt) {
    if (e.static) return;
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = rand(2, 4.5);
      const a = rand(0, TAU), d = rand(0, 110);
      e.wx = e.homeX + Math.cos(a) * d; e.wy = e.homeY + Math.sin(a) * d;
    }
    if (dist2(e.x, e.y, e.wx, e.wy) > 100) this.moveDir(e, angTo(e.x, e.y, e.wx, e.wy), e.speed * 0.3, dt);
    else { e.vx *= 0.85; e.vy *= 0.85; }
  },

  contact(e, tgt, dmg, kb = 260) {
    if (e.contactCd > 0) return;
    if (tgt.d < e.r + tgt.r + 4) {
      e.contactCd = 0.8;
      if (tgt.tower) Props.damageTower(dmg || e.dmg);
      else Player.hurt(G.player, dmg || e.dmg, e.x, e.y, { kb });
    }
  },

  // ---------------- AI ----------------
  crawler(e, dt, tgt) {
    if (!e.aggro) return this.wander(e, dt);
    const a = angTo(e.x, e.y, tgt.x, tgt.y) + Math.sin(e.t * 5 + e.id) * 0.3;
    let sp = e.speed;
    e.lungeCd -= dt;
    if (e.lungeT > 0) { e.lungeT -= dt; sp *= 2.4; }
    else if (tgt.d < 125 && e.lungeCd <= 0) { e.lungeT = 0.22; e.lungeCd = rand(1.2, 1.9); }
    this.moveDir(e, a, sp, dt);
    this.contact(e, tgt);
  },

  spitter(e, dt, tgt, p) {
    if (!e.aggro) return this.wander(e, dt);
    const a = angTo(e.x, e.y, tgt.x, tgt.y);
    let ma = a, mv;
    if (tgt.d > 380) mv = e.speed;
    else if (tgt.d < 220) { ma = a + Math.PI; mv = e.speed; }
    else { ma = a + e.strafe * Math.PI / 2; mv = e.speed * 0.6; if (Math.random() < dt * 0.5) e.strafe *= -1; }
    if (e.charge > 0) mv *= 0.15;
    this.moveDir(e, ma, mv, dt);
    e.aim = a;
    e.shootT -= dt;
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) {
        const lead = tgt.tower ? 0 : tgt.d / 270 * 0.55;
        const ox = Art.ready ? e.x + (Math.cos(a) >= 0 ? 18 : -18) : e.x, oy = Art.ready ? e.y - 12 : e.y;
        const aa = angTo(ox, oy, tgt.x + (tgt.tower ? 0 : p.vx * lead), tgt.y + (tgt.tower ? 0 : p.vy * lead));
        G.eBullets.push({ x: ox + Math.cos(aa) * 6, y: oy + Math.sin(aa) * 6, vx: Math.cos(aa) * 270, vy: Math.sin(aa) * 270, r: 8, dmg: e.dmg, life: 2.4, color: '#9be15d', towerDmg: true,
          onEnd: (b) => { for (let i = 0; i < 6; i++) FX.add({ kind: 'dot', x: b.x, y: b.y, vx: rand(-120, 120), vy: rand(-120, 120), life: 0.35, size: 3, size2: 1, color: '#9be15d', drag: 5 }); } });
        Snd.at('spit', e.x, e.y);
        e.shootT = rand(1.6, 2.4);
      }
    } else if (e.shootT <= 0 && tgt.d < 620) e.charge = 0.55;
  },

  bomber(e, dt, tgt) {
    if (!e.aggro) return this.wander(e, dt);
    if (e.fuse > 0) {
      e.fuse -= dt;
      this.moveDir(e, e.ang, e.speed * 0.2, dt);
      if (Snd.throttle('bfuse' + e.id, 110)) Snd.at('beep', e.x, e.y, { f: 1800 });
      if (e.fuse <= 0) { e.dead = true; this.blast(e.x, e.y, 95, 30, { playerDmg: 24, tower: 45 }); }
      return;
    }
    this.moveDir(e, angTo(e.x, e.y, tgt.x, tgt.y) + Math.sin(e.t * 3 + e.id) * 0.15, e.speed, dt);
    if (tgt.d < e.r + tgt.r + 34) e.fuse = 0.5;
  },

  turret(e, dt, tgt) {
    if (!e.aggro) { e.aim += dt * 0.6; return; }
    const a = angTo(e.x, e.y, tgt.x, tgt.y);
    e.aim = rotateToward(e.aim, a, dt * 2.4);
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) { e.burst = 3; e.burstT = 0; }
    } else if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        const oy = Art.ready ? e.y - 24 : e.y;
        const aa = (Art.ready ? angTo(e.x, oy, tgt.x, tgt.y) : e.aim) + rand(-0.06, 0.06);
        G.eBullets.push({ x: e.x + Math.cos(aa) * 28, y: oy + Math.sin(aa) * 28, vx: Math.cos(aa) * 420, vy: Math.sin(aa) * 420, r: 6, dmg: e.dmg, life: 1.6, color: '#ff6a3c' });
        FX.flash(e.x + Math.cos(aa) * 28, oy + Math.sin(aa) * 28, 16, '#ff9a5a', 0.08);
        Snd.at('eshoot', e.x, e.y);
        e.burst--; e.burstT = 0.13;
        if (e.burst === 0) e.shootT = rand(1.5, 2.1);
      }
    } else {
      e.shootT -= dt;
      if (e.shootT <= 0 && tgt.d < 600 && Math.abs(angDiff(e.aim, a)) < 0.3) e.charge = 0.45;
    }
  },

  nest(e, dt, tgt) {
    if (!e.aggro) return;
    e.spawnT -= dt;
    if (e.spawnT <= 0 && tgt.d < 820) {
      let kids = 0;
      for (const k of G.enemies) if (k.parent === e.id && !k.dead) kids++;
      if (kids < 5) {
        const a = rand(0, TAU);
        const x = e.x + Math.cos(a) * 58, y = e.y + Math.sin(a) * 58;
        if (!World.blocked(x, y, 13)) this.spawn(chance(0.2) ? 'bomber' : 'crawler', x, y, { emerge: true, aggro: true, parent: e.id });
      }
      e.spawnT = 2.6;
    }
  },

  brute(e, dt, tgt, p) {
    if (!e.aggro) return this.wander(e, dt);
    const a = angTo(e.x, e.y, tgt.x, tgt.y);
    switch (e.bst) {
      case 'wind':
        e.bT -= dt;
        if (e.bT > 0.3) e.chargeAng = rotateToward(e.chargeAng, a, dt * 3);
        e.ang = e.chargeAng;
        if (Math.random() < dt * 20) FX.dust(e.x - Math.cos(e.ang) * 20, e.y - Math.sin(e.ang) * 20, '#b89a78', 1, 60);
        if (e.bT <= 0) { e.bst = 'charge'; e.bT = 0.8; }
        break;
      case 'charge': {
        e.bT -= dt;
        const hit = World.moveBody(e, Math.cos(e.chargeAng) * 660 * dt, Math.sin(e.chargeAng) * 660 * dt);
        if (Math.random() < 0.6) FX.dust(e.x, e.y, '#c8aa84', 1, 50);
        this.contact(e, tgt, 26, 560);
        if (hit) {
          e.bst = 'stunned'; e.bT = 1.7;
          G.addShake(0.5);
          Snd.at('stomp', e.x, e.y);
          FX.sparks(e.x + Math.cos(e.chargeAng) * e.r, e.y + Math.sin(e.chargeAng) * e.r, e.chargeAng + Math.PI, 1, 14, '#ffe2b0', 150, 450);
          FX.text(e.x, e.y - 44, 'ОГЛУШЁН!', '#ffe066', 18, 1.2);
        } else if (e.bT <= 0) { e.bst = 'recover'; e.bT = 0.5; }
        break;
      }
      case 'stunned':
        e.bT -= dt;
        if (Math.random() < dt * 10) FX.add({ kind: 'glow', x: e.x + rand(-20, 20), y: e.y - 30, vy: -40, life: 0.4, size: 5, size2: 1, color: '#ffe066', add: true });
        if (e.bT <= 0) { e.bst = 'chase'; e.chargeCd = rand(2.2, 3.2); }
        break;
      case 'recover':
        e.bT -= dt;
        e.vx *= 0.8; e.vy *= 0.8;
        if (e.bT <= 0) { e.bst = 'chase'; e.chargeCd = rand(2.2, 3.2); }
        break;
      case 'slamWind':
        e.bT -= dt;
        if (e.bT <= 0) {
          G.addShake(0.6);
          Snd.at('stomp', e.x, e.y);
          FX.ring(e.x, e.y, 20, 140, '#ffb070', 0.35, 8);
          FX.dust(e.x, e.y, '#b89a78', 10, 160);
          if (p.alive && e.dp < 140 + p.hitR && !tgt.tower) Player.hurt(p, 20, e.x, e.y, { kb: 520 });
          e.bst = 'recover'; e.bT = 0.6; e.slamCd = 3;
        }
        break;
      default: // chase
        this.moveDir(e, a, e.speed, dt);
        this.contact(e, tgt, e.dmg, 420);
        e.chargeCd -= dt; e.slamCd -= dt;
        if (tgt.d < 115 && e.slamCd <= 0) { e.bst = 'slamWind'; e.bT = 0.55; }
        else if (tgt.d < 500 && tgt.d > 150 && e.chargeCd <= 0) { e.bst = 'wind'; e.bT = 0.8; e.chargeAng = a; Snd.at('charge', e.x, e.y, { dur: 0.8 }); }
    }
  },

  separate() {
    const L = G.enemies, p = G.player;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.dormant || a.state === 'emerge') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || b.dormant || b.state === 'emerge') continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, ny = dy / d;
        const wa = a.static ? 0 : 1 / a.mass, wb = b.static ? 0 : 1 / b.mass, ws = wa + wb;
        if (ws <= 0) continue;
        if (wa) World.moveBody(a, -nx * push * 2 * wa / ws, -ny * push * 2 * wa / ws);
        if (wb) World.moveBody(b, nx * push * 2 * wb / ws, ny * push * 2 * wb / ws);
      }
      if (p.alive && p.dashT <= 0) {
        const dx = p.x - a.x, dy = p.y - a.y, rr = a.r + p.r - 4;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = rr - d, nx = dx / d, ny = dy / d;
          const pw = a.static || a.mass > 3 ? 1 : 0.3;
          World.moveBody(p, nx * push * pw, ny * push * pw);
          if (pw < 1) World.moveBody(a, -nx * push * (1 - pw), -ny * push * (1 - pw));
        }
      }
    }
  },

  // ---------------- damage ----------------
  damage(e, dmg, o = {}) {
    if (e.dead || e.state === 'emerge') return;
    if (e.type === 'boss') { dmg = Boss.modDamage(e, dmg); if (dmg <= 0) { FX.text(e.x, e.y - 60, 'БЛОК', '#aaa', 14, 0.4); return; } }
    if (e.type === 'brute' && e.bst === 'stunned') dmg *= 1.6;
    e.hp -= dmg;
    e.flash = 0.09;
    if (!e.static && o.kb) { const k = o.kb / e.mass; e.kx += Math.cos(o.ang) * k; e.ky += Math.sin(o.ang) * k; }
    if (!e.aggro) this.alert(e);
    G.stats.dmgDealt += dmg;
    const p = G.player;
    p.emp = Math.min(100, p.emp + dmg * (e.type === 'boss' ? 0.022 : 0.01) * p.st.empRate);
    const big = o.crit || dmg >= 40;
    FX.text(e.x, e.y - e.r, Math.round(dmg), o.crit ? '#ffe066' : o.quiet ? '#ffcf9a' : '#ffffff', o.crit ? 22 : o.quiet ? 12 : big ? 18 : 15, o.crit ? 0.8 : 0.6);
    if (o.crit) Snd.play('crit'); else Snd.play('hit');
    if (e.hp <= 0) this.kill(e, o);
  },

  kill(e, o = {}) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const p = G.player;
    if (e.type === 'boss') { Boss.onDeath(e); return; }
    G.stats.kills++;
    G.registerKill(e);
    p.emp = Math.min(100, p.emp + (EDEF[e.type].emp || 5) * p.st.empRate);
    if (!e.noDrops) {
      Pickups.gems(e.x, e.y, e.xp + (G.combo >= 10 ? 1 : 0));
      const hc = e.type === 'crawler' || e.type === 'bomber' ? 0.05 : e.type === 'brute' ? 1 : 0.12;
      if (Math.random() < hc) Pickups.spawn('health', e.x, e.y);
      if (Math.random() < 0.04) Pickups.spawn('emp', e.x, e.y);
    }
    switch (e.type) {
      case 'crawler':
        FX.goo(e.x, e.y, '#4a1a55', 1); FX.flash(e.x, e.y, 30, '#d08aff', 0.1);
        Snd.at('die', e.x, e.y);
        break;
      case 'spitter':
        FX.goo(e.x, e.y, '#3f6a22', 1.4); FX.flash(e.x, e.y, 40, '#b8ff8a', 0.12);
        Snd.at('die', e.x, e.y);
        break;
      case 'bomber':
        this.blast(e.x, e.y, 95, 36, { playerDmg: 0 });
        break;
      case 'turret':
        FX.explosion(e.x, e.y, 1, { debris: '#5a646c' });
        Snd.at('explode', e.x, e.y);
        G.addShake(0.3);
        break;
      case 'nest':
        FX.goo(e.x, e.y, '#4a1a55', 2.5);
        FX.explosion(e.x, e.y, 1.3, { debris: '#5a1a6a', noDecal: true });
        Snd.at('explode', e.x, e.y, { big: true });
        G.addShake(0.6); G.hitStop = 0.08;
        break;
      case 'brute':
        FX.explosion(e.x, e.y, 1.8, { debris: '#6a1a1a' });
        FX.goo(e.x, e.y, '#6a1a1a', 2);
        Snd.at('explode', e.x, e.y, { big: true });
        G.addShake(0.9); G.hitStop = 0.14; G.slowmo = 0.5;
        break;
    }
    if (e.onDeath) e.onDeath(e);
    Quest.onKill(e);
  },

  // generic explosion used by bombers, barrels, mines
  blast(x, y, R, dmg, o = {}) {
    FX.explosion(x, y, R / 95);
    Snd.at('explode', x, y, { big: R > 120 });
    const p = G.player;
    G.addShake(clamp((R / 95) * 0.6 * clamp(1.2 - dist(x, y, p.x, p.y) / 900, 0, 1), 0, 0.9));
    for (const e of G.enemies) {
      if (e.dead || e.state === 'emerge') continue;
      const d = dist(x, y, e.x, e.y);
      if (d < R + e.r) this.damage(e, dmg * (1 - 0.5 * d / (R + e.r)) * (e.type === 'boss' ? 0.5 : 1), { ang: angTo(x, y, e.x, e.y), kb: 420, src: 'blast' });
    }
    if (o.playerDmg && p.alive) {
      const d = dist(x, y, p.x, p.y);
      if (d < R + p.hitR) Player.hurt(p, o.playerDmg * (1 - 0.4 * d / R), x, y, { kb: 460 });
    }
    if (o.tower && Props.tower && Props.tower.active && dist(x, y, Props.tower.x, Props.tower.y) < R + 46) Props.damageTower(o.tower);
    Props.chainBlast(x, y, R);
  },

  // ---------------- drawing ----------------
  draw(ctx, e) {
    const wf = e.flash > 0;
    ctx.save();
    if (e.state === 'emerge') {
      const k = 1 - e.stateT / 0.7;
      ctx.translate(e.x, e.y); ctx.scale(0.3 + k * 0.7, 0.3 + k * 0.7); ctx.translate(-e.x, -e.y);
      ctx.globalAlpha = 0.4 + k * 0.6;
    }
    if (!(Art.ready && this.drawArt(ctx, e, wf))) switch (e.type) {
      case 'crawler': this.drawCrawler(ctx, e, wf); break;
      case 'spitter': this.drawSpitter(ctx, e, wf); break;
      case 'bomber': this.drawBomber(ctx, e, wf); break;
      case 'turret': this.drawTurret(ctx, e, wf); break;
      case 'nest': this.drawNest(ctx, e, wf); break;
      case 'brute': this.drawBrute(ctx, e, wf); break;
      case 'boss': Boss.draw(ctx, e, false, wf); break;
    }
    ctx.restore();
    if (e.type !== 'boss' && e.hp < e.maxHp && e.state !== 'emerge') {
      const w = e.type === 'brute' ? 80 : Math.max(26, e.r * 2), y = Art.ready ? e.y - e.r * 2.6 - 10 : e.y - e.r - (e.type === 'brute' ? 22 : 12);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, e.type === 'brute' ? 7 : 5);
      ctx.fillStyle = e.type === 'brute' ? '#ff5a3c' : '#ff4757';
      ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), e.type === 'brute' ? 5 : 3);
      if (e.name) {
        ctx.font = "11px 'Russo One', sans-serif"; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffb4a8'; ctx.fillText(e.name, e.x, y - 5);
      }
    }
  },

  drawArt(ctx, e, wf) {
    const fl = wf ? 0.85 : 0;
    const moving = Math.hypot(e.vx, e.vy) > 15;
    if (Math.abs(e.vx) > 12) e.face = Math.sign(e.vx);
    const glow = (col, x, y, s, a = 1) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(FX.glow(col), x - s / 2, y - s / 2, s, s); ctx.restore(); };
    switch (e.type) {
      case 'crawler': {
        const b = moving ? Math.abs(Math.sin(e.anim * 16)) * 2.5 : 0;
        const sy = 1 + (moving ? Math.sin(e.anim * 32) * 0.05 : Math.sin(e.anim * 3) * 0.02);
        Art.shadow(ctx, e.x, e.y + 9, 18, 6);
        return Art.draw(ctx, 'crawler', e.x, e.y + 11 - b, 44, { flip: e.face < 0, sx: e.lungeT > 0 ? 1.18 : 1, sy, flash: fl });
      }
      case 'spitter': {
        const f = Math.cos(e.aim) >= 0 ? 1 : -1;
        const swell = e.charge > 0 ? (0.55 - e.charge) * 0.35 : 0;
        const s = 1 + Math.sin(e.anim * 4) * 0.04 + swell;
        Art.shadow(ctx, e.x, e.y + 11, 20, 7);
        Art.draw(ctx, 'spitter', e.x, e.y + 13, 48, { flip: f < 0, sx: s, sy: 1 + (s - 1) * 1.3, flash: fl });
        if (e.charge > 0) glow('#b8ff5a', e.x + f * 18, e.y - 12, 16 + (0.55 - e.charge) * 50);
        return true;
      }
      case 'bomber': {
        if (e.fuse > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,60,40,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.arc(e.x, e.y, 95, 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(255,40,20,${0.12 + (0.5 - e.fuse) * 0.3})`; ctx.fill();
          ctx.restore();
        }
        const blink = e.fuse > 0 && Math.floor(e.fuse * 20) % 2 === 1;
        const sc = e.fuse > 0 ? 1 + (0.5 - e.fuse) * 0.5 : 1;
        Art.shadow(ctx, e.x, e.y + 9, 13, 5);
        Art.draw(ctx, 'bomber', e.x, e.y + 11, 32, { flip: e.face < 0, rot: Math.sin(e.anim * 12) * (moving ? 0.14 : 0.04), sx: sc, sy: sc, flash: blink ? 0.9 : fl, flashColor: blink ? '#ff3020' : '#ffffff' });
        const on = e.fuse > 0 ? Math.floor(e.t * 20) % 2 : Math.floor(e.t * 3) % 2;
        if (on) glow('#ff3a2a', e.x, e.y - 24, 26);
        return true;
      }
      case 'turret': {
        Art.shadow(ctx, e.x, e.y + 12, 26, 9);
        Art.draw(ctx, 'turret_base', e.x, e.y + 16, 54, { flash: fl });
        const right = Math.cos(e.aim) >= 0;
        const tilt = clamp(angDiff(right ? 0 : Math.PI, e.aim), -0.55, 0.55);
        Art.draw(ctx, 'turret_gun', e.x, e.y - 20, 46, { ax: 0.42, ay: 0.72, rot: tilt, flip: !right, flash: fl });
        if (e.charge > 0 || e.burst > 0) glow('#ff6a3c', e.x + Math.cos(e.aim) * 26, e.y - 26 + Math.sin(e.aim) * 26, 30);
        return true;
      }
      case 'nest': {
        const s = 1 + Math.sin(e.anim * 3) * 0.04;
        Art.shadow(ctx, e.x, e.y + 22, 52, 15, 0.32);
        Art.draw(ctx, 'nest', e.x, e.y + 30, 104, { sx: s, sy: 2 - s, flash: fl });
        glow('#e0ff5a', e.x, e.y - 20, 40 + Math.sin(e.anim * 5) * 10, 0.5);
        return true;
      }
      case 'brute': {
        if (e.bst === 'wind') {
          const k = 1 - e.bT / 0.8;
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.chargeAng);
          ctx.fillStyle = `rgba(255,40,30,${0.12 + k * 0.25})`; ctx.fillRect(0, -e.r, 480, e.r * 2);
          ctx.strokeStyle = `rgba(255,80,60,${0.5 + k * 0.4})`; ctx.lineWidth = 2; ctx.strokeRect(0, -e.r, 480, e.r * 2);
          ctx.restore();
        }
        if (e.bst === 'slamWind') {
          ctx.save(); ctx.fillStyle = `rgba(255,60,30,${0.15 + (0.55 - e.bT) * 0.5})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 140, 0, TAU); ctx.fill(); ctx.restore();
        }
        const charging = e.bst === 'wind' || e.bst === 'charge';
        const face = charging ? (Math.cos(e.chargeAng) >= 0 ? 1 : -1) : e.face;
        const sh = e.bst === 'wind' ? rand(-2, 2) : 0;
        const b = moving ? Math.abs(Math.sin(e.anim * 9)) * 3 : 0;
        const rot = e.bst === 'charge' ? face * 0.12 : e.bst === 'stunned' ? Math.sin(e.t * 18) * 0.08 : e.bst === 'slamWind' ? -face * 0.1 : 0;
        Art.shadow(ctx, e.x, e.y + 20, 40, 12, 0.32);
        Art.draw(ctx, 'brute', e.x + sh, e.y + 26 - b, 104, { flip: face < 0, rot, flash: fl });
        if (charging) glow('#ff3b1f', e.x + face * 36, e.y - 26, 36);
        return true;
      }
    }
    return false;
  },

  shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 5, rx, ry, 0, 0, TAU); ctx.fill();
  },

  drawCrawler(ctx, e, wf) {
    this.shadow(ctx, e.x, e.y, 15, 11);
    ctx.translate(e.x, e.y); ctx.rotate(e.ang);
    const sp = Math.hypot(e.vx, e.vy) > 20 ? 1 : 0.2;
    ctx.strokeStyle = wf ? '#fff' : '#2a0f30'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const ph = Math.sin(e.anim * 20 + i * 2.1 + (s > 0 ? Math.PI : 0)) * 4 * sp;
      const bx = -5 + i * 5;
      ctx.beginPath(); ctx.moveTo(bx, s * 5); ctx.lineTo(bx + ph + 1, s * 13); ctx.lineTo(bx + ph + 5, s * 17); ctx.stroke();
    }
    ctx.fillStyle = wf ? '#fff' : '#5a1f68';
    ctx.beginPath(); ctx.ellipse(-5, 0, 11, 9, 0, 0, TAU); ctx.fill();
    if (!wf) {
      ctx.fillStyle = '#8e3aa0'; ctx.beginPath(); ctx.ellipse(-6, -2, 8, 5.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a0f30'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(3, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,255,0.35)'; ctx.beginPath(); ctx.ellipse(-8, -4, 4, 2, -0.3, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = wf ? '#fff' : '#3a1244';
    ctx.beginPath(); ctx.ellipse(7, 0, 6.5, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = wf ? '#fff' : '#1a0620'; ctx.lineWidth = 2;
    const mo = Math.sin(e.anim * 14) * 0.3;
    ctx.beginPath(); ctx.moveTo(11, -3); ctx.quadraticCurveTo(16, -5 - mo * 4, 17, -1); ctx.moveTo(11, 3); ctx.quadraticCurveTo(16, 5 + mo * 4, 17, 1); ctx.stroke();
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.arc(9, -2.5, 1.6, 0, TAU); ctx.arc(9, 2.5, 1.6, 0, TAU); ctx.fill();
  },

  drawSpitter(ctx, e, wf) {
    this.shadow(ctx, e.x, e.y, 18, 13);
    const pulse = 1 + Math.sin(e.anim * 4) * 0.05 + (e.charge > 0 ? (0.55 - e.charge) * 0.4 : 0);
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = wf ? '#fff' : '#2f5a18'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.sin(e.anim * 6 + i) * 0.2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); ctx.stroke();
    }
    ctx.rotate(e.aim);
    ctx.scale(pulse, pulse);
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 17);
    g.addColorStop(0, wf ? '#fff' : '#d4ff9a'); g.addColorStop(0.5, wf ? '#fff' : '#7cc242'); g.addColorStop(1, wf ? '#fff' : '#35701c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1f4010'; ctx.lineWidth = 1.5; ctx.stroke();
    if (!wf) {
      ctx.fillStyle = 'rgba(40,80,20,0.6)';
      [[-6, 5, 3], [-2, -8, 2.5], [-9, -3, 2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
    }
    const open = e.charge > 0 ? 5 + (0.55 - e.charge) * 8 : 3;
    ctx.fillStyle = '#1a2a08'; ctx.beginPath(); ctx.ellipse(12, 0, 4, open, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(4, -6, 2, 0, TAU); ctx.arc(4, 6, 2, 0, TAU); ctx.fill();
    if (e.charge > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const s = 20 + (0.55 - e.charge) * 40;
      ctx.drawImage(FX.glow('#b8ff5a'), 12 - s / 2, -s / 2, s, s);
    }
  },

  drawBomber(ctx, e, wf) {
    this.shadow(ctx, e.x, e.y, 13, 9);
    if (e.fuse > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,40,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 95, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,40,20,${0.12 + (0.5 - e.fuse) * 0.3})`; ctx.fill();
      ctx.restore();
    }
    ctx.translate(e.x, e.y);
    const roll = e.anim * 8;
    ctx.fillStyle = wf || (e.fuse > 0 && Math.floor(e.fuse * 20) % 2) ? '#fff' : '#e8701e';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a2a00'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.clip();
    ctx.fillStyle = '#3a1a00';
    for (let k = -2; k <= 2; k++) { const off = ((roll * 4 + k * 10) % 30) - 15; ctx.fillRect(-14, off, 28, 2.5); }
    ctx.restore();
    ctx.fillStyle = '#cfd4d8';
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + e.ang; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.lineTo(Math.cos(a + 0.3) * 11, Math.sin(a + 0.3) * 11); ctx.fill(); }
    const on = e.fuse > 0 ? Math.floor(e.t * 20) % 2 : Math.floor(e.t * 3) % 2;
    ctx.fillStyle = on ? '#ff2a2a' : '#6a0000';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    if (on) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('#ff3a2a'), -14, -14, 28, 28); }
  },

  drawTurret(ctx, e, wf) {
    this.shadow(ctx, e.x, e.y, 24, 18);
    ctx.translate(e.x, e.y);
    ctx.fillStyle = wf ? '#fff' : '#3e454c';
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1e22'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e6b422';
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; ctx.fillRect(Math.cos(a) * 17 - 2, Math.sin(a) * 17 - 2, 4, 4); }
    ctx.rotate(e.aim);
    ctx.fillStyle = wf ? '#fff' : '#2a2f34';
    ctx.fillRect(6, -8, 24, 5); ctx.fillRect(6, 3, 24, 5);
    const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 14);
    g.addColorStop(0, wf ? '#fff' : '#aab4bc'); g.addColorStop(1, wf ? '#fff' : '#4e5860');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a1e22'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = e.aggro ? '#ff3b3b' : '#5a1010';
    ctx.beginPath(); ctx.arc(6, 0, 3, 0, TAU); ctx.fill();
    if (e.charge > 0 || e.burst > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(FX.glow('#ff6a3c'), 22, -16, 20, 20); ctx.drawImage(FX.glow('#ff6a3c'), 22, -4, 20, 20);
    }
  },

  drawNest(ctx, e, wf) {
    this.shadow(ctx, e.x, e.y, 44, 34);
    ctx.translate(e.x, e.y);
    const pl = 1 + Math.sin(e.anim * 3) * 0.05;
    ctx.scale(pl, pl);
    ctx.strokeStyle = wf ? '#fff' : '#3a1244'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.quadraticCurveTo(Math.cos(a + 0.3) * 50, Math.sin(a + 0.3) * 50, Math.cos(a + 0.1) * 62, Math.sin(a + 0.1) * 62); ctx.stroke();
    }
    const blobs = [[0, 0, 32], [-16, -10, 20], [14, -12, 18], [12, 14, 20], [-14, 14, 17]];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
      g.addColorStop(0, wf ? '#fff' : '#b45ac8'); g.addColorStop(1, wf ? '#fff' : '#4a1656');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#1a0520';
    [[0, 0, 9], [-16, -10, 5], [14, 14, 6], [15, -12, 4]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
    ctx.globalCompositeOperation = 'lighter';
    const gl = 30 + Math.sin(e.anim * 5) * 8;
    ctx.drawImage(FX.glow('#e0ff5a'), -gl / 2, -gl / 2, gl, gl);
  },

  drawBrute(ctx, e, wf) {
    if (e.bst === 'wind') {
      ctx.save();
      const k = 1 - e.bT / 0.8;
      ctx.translate(e.x, e.y); ctx.rotate(e.chargeAng);
      ctx.fillStyle = `rgba(255,40,30,${0.12 + k * 0.25})`;
      ctx.fillRect(0, -e.r, 480, e.r * 2);
      ctx.strokeStyle = `rgba(255,80,60,${0.5 + k * 0.4})`; ctx.lineWidth = 2; ctx.strokeRect(0, -e.r, 480, e.r * 2);
      ctx.restore();
    }
    if (e.bst === 'slamWind') {
      ctx.save(); ctx.fillStyle = `rgba(255,60,30,${0.15 + (0.55 - e.bT) * 0.5})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 140, 0, TAU); ctx.fill(); ctx.restore();
    }
    this.shadow(ctx, e.x, e.y, 36, 26);
    ctx.translate(e.x, e.y); ctx.rotate(e.ang);
    const sh = e.bst === 'wind' ? rand(-1.5, 1.5) : 0;
    ctx.translate(sh, sh);
    const walk = Math.hypot(e.vx, e.vy) > 20 || e.bst === 'charge' ? 1 : 0.2;
    ctx.strokeStyle = wf ? '#fff' : '#2a0a0a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const ph = Math.sin(e.anim * 10 + i * 2 + (s > 0 ? Math.PI : 0)) * 7 * walk;
      const bx = -14 + i * 13;
      ctx.beginPath(); ctx.moveTo(bx, s * 14); ctx.lineTo(bx + ph, s * 30); ctx.lineTo(bx + ph + 6, s * 36); ctx.stroke();
    }
    const g = ctx.createLinearGradient(-30, -26, 30, 26);
    g.addColorStop(0, wf ? '#fff' : '#c0433a'); g.addColorStop(0.6, wf ? '#fff' : '#7a1a16'); g.addColorStop(1, wf ? '#fff' : '#3a0806');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-4, 0, 30, 24, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a0404'; ctx.lineWidth = 2.5; ctx.stroke();
    if (!wf) {
      ctx.strokeStyle = 'rgba(255,170,150,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-4 - i * 8, 0, 20 - i * 5, 18 - i * 4, 0, -1.2, 1.2); ctx.stroke(); }
      ctx.fillStyle = '#4a4f56';
      [[-18, -12], [-18, 12], [-2, -16], [-2, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); });
    }
    ctx.fillStyle = wf ? '#fff' : '#4a0e0c';
    ctx.beginPath(); ctx.ellipse(24, 0, 12, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = wf ? '#fff' : '#e8dcc0';
    ctx.beginPath(); ctx.moveTo(28, -10); ctx.quadraticCurveTo(44, -16, 50, -6); ctx.lineTo(34, -5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(28, 10); ctx.quadraticCurveTo(44, 16, 50, 6); ctx.lineTo(34, 5); ctx.fill();
    const eyeCol = e.bst === 'wind' || e.bst === 'charge' ? '#ff3b1f' : '#ffd24a';
    ctx.fillStyle = eyeCol;
    ctx.beginPath(); ctx.arc(30, -5, 2.5, 0, TAU); ctx.arc(30, 5, 2.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(FX.glow(eyeCol), 18, -14, 26, 28);
  },
};
