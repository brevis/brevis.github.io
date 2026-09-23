'use strict';
// Player robot, projectiles, pickups, upgrades.

const UPGRADES = [
  { id: 'dmg', name: 'Перегрузка ядра', desc: 'Урон бластера +25%', icon: '✹', rar: 'common', max: 6, apply: (p) => { p.st.dmg *= 1.25; } },
  { id: 'rate', name: 'Быстрый затвор', desc: 'Скорострельность +20%', icon: '»', rar: 'common', max: 6, apply: (p) => { p.st.fireRate *= 1.2; } },
  { id: 'multi', name: 'Сдвоенный ствол', desc: '+1 снаряд в каждом залпе', icon: '⁂', rar: 'epic', max: 3, apply: (p) => { p.st.multi++; } },
  { id: 'pierce', name: 'Бронебойные', desc: 'Снаряды прошивают +1 врага', icon: '➶', rar: 'rare', max: 3, apply: (p) => { p.st.pierce++; } },
  { id: 'speed', name: 'Сервоприводы', desc: 'Скорость хода +12%', icon: '⇶', rar: 'common', max: 4, apply: (p) => { p.st.speed *= 1.12; } },
  { id: 'armor', name: 'Титановый корпус', desc: 'Макс. прочность +30 и ремонт', icon: '✚', rar: 'common', max: 5, apply: (p) => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: 'regen', name: 'Наноботы', desc: 'Самопочинка +1.5 ед./сек', icon: '♻', rar: 'rare', max: 3, apply: (p) => { p.st.regen += 1.5; } },
  { id: 'explosive', name: 'Разрывные заряды', desc: 'Попадания взрываются по области', icon: '✸', rar: 'epic', max: 3, apply: (p) => { p.st.explosive++; } },
  { id: 'chain', name: 'Тесла-катушка', desc: '+20% шанс цепной молнии', icon: 'ϟ', rar: 'rare', max: 3, apply: (p) => { p.st.chain += 0.2; } },
  { id: 'orbit', name: 'Орбитальные лезвия', desc: '+1 плазменное лезвие вокруг', icon: '◎', rar: 'rare', max: 4, apply: (p) => { p.st.orbitals++; } },
  { id: 'dash', name: 'Импульсный рывок', desc: 'Рывок чаще и сносит врагов', icon: '➟', rar: 'common', max: 3, apply: (p) => { p.st.dashCd *= 0.75; p.st.dashDmg += 40; } },
  { id: 'magnet', name: 'Магнитный захват', desc: 'Радиус сбора +60%', icon: '⌖', rar: 'common', max: 2, apply: (p) => { p.st.magnet *= 1.6; } },
  { id: 'crit', name: 'Прицельный модуль', desc: '+15% шанс крита (×2.5 урона)', icon: '✦', rar: 'rare', max: 3, apply: (p) => { p.st.crit += 0.15; } },
  { id: 'ricochet', name: 'Рикошет', desc: 'Снаряд отскакивает к ещё одной цели', icon: '↯', rar: 'rare', max: 2, apply: (p) => { p.st.ricochet++; } },
  { id: 'emp', name: 'Конденсатор ЭМИ', desc: 'ЭМИ копится быстрее, радиус +25%', icon: '◉', rar: 'common', max: 3, apply: (p) => { p.st.empRate *= 1.4; p.st.empRadius *= 1.25; } },
  { id: 'drone', name: 'Протокол «Жужа»', desc: 'Дрон стреляет вдвое чаще', icon: '⟡', rar: 'rare', max: 2, req: (p) => p.hasDrone, apply: (p) => { p.st.droneRate *= 2; } },
];
const RARITY = { common: { c: '#8fd0e8', w: 1, n: 'ОБЫЧНЫЙ' }, rare: { c: '#5ce1ff', w: 0.7, n: 'РЕДКИЙ' }, epic: { c: '#c77dff', w: 0.45, n: 'ЭПИЧЕСКИЙ' } };

const Player = {
  create(x, y) {
    return {
      x, y, vx: 0, vy: 0, r: 15, hitR: 10,
      aim: -Math.PI / 2, moveAngle: -Math.PI / 2, walkPhase: 0, moving: false,
      hp: 100, maxHp: 100, hpLag: 100,
      fireT: 0, dashT: 0, dashCdT: 0, dashDir: 0, invuln: 0, hurtT: 0, dashHit: null,
      emp: 0, empReadyAnnounced: false,
      level: 1, xp: 0, xpNext: 14, pendingLevels: 0,
      ups: {},
      st: { dmg: 10, fireRate: 5.5, bulletSpeed: 980, range: 620, multi: 1, pierce: 0, speed: 245, regen: 0, explosive: 0, chain: 0, orbitals: 0, dashCd: 1.0, dashDmg: 0, magnet: 120, crit: 0.05, ricochet: 0, empRate: 1, empRadius: 290, droneRate: 1 },
      orbitA: 0, hasDrone: false, drone: null,
      keycard: false, cells: 0,
      recoil: 0, alive: true, lock: 0, stepT: 0, sinking: 0,
      downT: 0,
    };
  },

  xpFor(level) { return 10 + level * 7; },

  update(p, dt) {
    if (!p.alive) return;
    const I = Input;
    const locked = p.lock > 0 || G.cinematic;
    if (p.lock > 0) p.lock -= dt;

    let ix = 0, iy = 0;
    if (!locked) {
      if (I.key('KeyA') || I.key('ArrowLeft')) ix -= 1;
      if (I.key('KeyD') || I.key('ArrowRight')) ix += 1;
      if (I.key('KeyW') || I.key('ArrowUp')) iy -= 1;
      if (I.key('KeyS') || I.key('ArrowDown')) iy += 1;
    }
    const il = Math.hypot(ix, iy);
    if (il > 0) { ix /= il; iy /= il; }

    const m = G.mouseWorld;
    if (!locked) p.aim = angTo(p.x, p.y, m.x, m.y);

    const terr = World.tAt(p.x, p.y);
    const tMul = terr === T.SAND ? 0.93 : 1;

    // dash
    if (p.dashCdT > 0) p.dashCdT -= dt;
    if (!locked && I.pressed('dash') && p.dashCdT <= 0) {
      p.dashDir = il > 0 ? Math.atan2(iy, ix) : p.aim;
      p.dashT = 0.17; p.dashCdT = p.st.dashCd;
      p.invuln = Math.max(p.invuln, 0.24);
      p.dashHit = new Set();
      Snd.play('dash');
      FX.ring(p.x, p.y, 8, 40, '#7fe8ff', 0.25, 2);
      G.stats.dashes++;
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = p.st.speed * 3.5;
      p.vx = Math.cos(p.dashDir) * sp; p.vy = Math.sin(p.dashDir) * sp;
      FX.add({ kind: 'ghost', x: p.x, y: p.y, rot: p.aim, color: '#7fe8ff', life: 0.22, size: 1, add: true, drag: 0 });
      if (p.st.dashDmg > 0) {
        for (const e of G.enemies) {
          if (e.dead || p.dashHit.has(e)) continue;
          if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r + 10) ** 2) {
            p.dashHit.add(e);
            Enemies.damage(e, p.st.dashDmg, { ang: p.dashDir, kb: 380, src: 'dash' });
            FX.sparks(e.x, e.y, p.dashDir, 0.6, 8, '#bff6ff', 200, 500);
          }
        }
      }
      if (p.dashT <= 0) { p.vx *= 0.35; p.vy *= 0.35; }
    } else {
      const sp = p.st.speed * tMul;
      p.vx = damp(p.vx, ix * sp, 15, dt);
      p.vy = damp(p.vy, iy * sp, 15, dt);
    }

    World.moveBody(p, p.vx * dt, p.vy * dt);

    const spd = Math.hypot(p.vx, p.vy);
    p.moving = spd > 25;
    p.runDist = (p.runDist || 0) + (p.moving ? spd * dt : 0);
    if (p.moving) {
      p.moveAngle = rotateToward(p.moveAngle, Math.atan2(p.vy, p.vx), dt * 14);
      p.walkPhase += spd * dt * 0.055;
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = 0.16;
        if (terr === T.SAND) FX.dust(p.x, p.y + 6, '#d9b48a', 2, 30);
        else if (terr === T.DIRT || terr === T.ROAD) FX.dust(p.x, p.y + 6, '#8a5a2a', 1, 25);
        else if (terr === T.ROCK || terr === T.STONE) FX.dust(p.x, p.y + 6, '#8a8480', 1, 20);
      }
    }

    // fire
    if (p.fireT > 0) p.fireT -= dt;
    if (!locked && I.mouseDown && p.fireT <= 0 && !G.uiBlock) {
      this.fire(p);
      p.fireT += 1 / p.st.fireRate;
      if (p.fireT < 0) p.fireT = 0;
    }
    p.recoil = Math.max(0, p.recoil - dt * 10);

    // EMP
    if (!locked && I.pressed('emp')) {
      if (p.emp >= 100) this.emp(p);
      else if (Snd.throttle('empno', 400)) { Snd.play('beep', { f: 300 }); }
    }
    if (p.emp >= 100 && !p.empReadyAnnounced) { p.empReadyAnnounced = true; Snd.play('empready'); Quest.onEmpReady(); }

    // regen
    if (p.st.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.st.regen * dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    p.hpLag = p.hpLag > p.hp ? Math.max(p.hp, p.hpLag - dt * 40) : p.hp;

    // orbitals
    if (p.st.orbitals > 0) {
      p.orbitA += dt * 3.6;
      const n = p.st.orbitals, R = 62;
      for (let i = 0; i < n; i++) {
        const a = p.orbitA + (i / n) * TAU;
        const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
        for (const e of G.enemies) {
          if (e.dead || e.orbitCd > G.time) continue;
          if (dist2(ox, oy, e.x, e.y) < (e.r + 12) ** 2) {
            e.orbitCd = G.time + 0.35;
            Enemies.damage(e, 12 + p.st.dmg * 0.6, { ang: a + Math.PI / 2, kb: 160, src: 'orbit' });
            FX.sparks(ox, oy, a + Math.PI / 2, 0.5, 4, '#ff9cf0', 150, 350);
          }
        }
        // orbitals destroy enemy bullets
        for (const b of G.eBullets) if (!b.dead && !b.beam && dist2(ox, oy, b.x, b.y) < (b.r + 10) ** 2) { b.dead = true; FX.flash(b.x, b.y, 14, '#ff9cf0', 0.1); }
      }
    }

    if (p.hasDrone) this.updateDrone(p, dt);
  },

  muzzle(p) {
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    if (Art.ready) {
      const hx = p.x + (ca >= 0 ? 6 : -6), hy = p.y - 16;
      return [hx + ca * 25, hy + sa * 25];
    }
    return [p.x + ca * 26 - sa * 9, p.y + sa * 26 + ca * 9];
  },

  fire(p) {
    const n = p.st.multi, step = 0.12;
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    const [mx, my] = this.muzzle(p);
    const m = G.mouseWorld;
    const base = dist2(mx, my, m.x, m.y) > 45 * 45 ? angTo(mx, my, m.x, m.y) : p.aim;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * step + rand(-0.03, 0.03);
      const crit = Math.random() < p.st.crit;
      const sp = p.st.bulletSpeed;
      G.pBullets.push({
        x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: p.st.range / sp,
        dmg: p.st.dmg * (crit ? 2.5 : 1) * rand(0.9, 1.1), crit, pierce: p.st.pierce, bounces: p.st.ricochet, hit: [], r: 5,
      });
    }
    G.stats.shots += n;
    p.recoil = 1;
    FX.muzzle(mx, my, p.aim);
    Snd.play('shoot');
    G.addShake(0.035);
    p.vx -= ca * 18; p.vy -= sa * 18;
  },

  emp(p) {
    p.emp = 0; p.empReadyAnnounced = false;
    const R = p.st.empRadius;
    Snd.play('emp');
    G.addShake(0.6);
    G.hitStop = Math.max(G.hitStop, 0.06);
    FX.ring(p.x, p.y, 20, R, '#ffe066', 0.45, 10);
    FX.ring(p.x, p.y, 10, R * 0.8, '#ffffff', 0.35, 4);
    FX.flash(p.x, p.y, R * 0.9, '#ffd24a', 0.25, 0.8);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      FX.add({ kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * R * 3, vy: Math.sin(a) * R * 3, life: 0.3, size: 3, size2: 1, color: '#ffe89a', add: true, drag: 3, len: 40 });
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < R + e.r) {
        const k = 1 - (d / (R + e.r)) * 0.5;
        Enemies.damage(e, 70 * k * (e.type === 'boss' ? 1 : 1.3), { ang: angTo(p.x, p.y, e.x, e.y), kb: 700 * k, src: 'emp' });
        e.stun = Math.max(e.stun || 0, e.type === 'boss' ? 0.3 : 1.4);
      }
    }
    for (const b of G.eBullets) if (!b.beam && dist2(p.x, p.y, b.x, b.y) < R * R) { b.dead = true; FX.flash(b.x, b.y, 12, '#ffe066', 0.12); }
    Props.onEmp(p.x, p.y, R);
    G.stats.emps++;
  },

  hurt(p, dmg, sx, sy, opts = {}) {
    if (!p.alive || p.invuln > 0 || G.cinematic || G.god) return false;
    p.hp -= dmg;
    p.invuln = opts.iframes || 0.55;
    p.hurtT = 0.3;
    G.stats.dmgTaken += dmg;
    const a = angTo(sx, sy, p.x, p.y);
    p.vx += Math.cos(a) * (opts.kb || 260); p.vy += Math.sin(a) * (opts.kb || 260);
    G.addShake(0.45);
    G.hitStop = Math.max(G.hitStop, 0.04);
    FX.sparks(p.x, p.y, a, 1.2, 10, '#ff8a6a', 150, 420);
    FX.text(p.x, p.y - 20, '-' + Math.round(dmg), '#ff5b6b', 18);
    Snd.play('hurt');
    UI.hurtFlash();
    Quest.onPlayerHurt();
    if (p.hp <= 0) this.die(p);
    return true;
  },

  die(p) {
    p.hp = 0; p.alive = false;
    G.stats.deaths++;
    FX.explosion(p.x, p.y, 1.4, { debris: '#aab4bc' });
    Snd.play('explode', { big: true });
    G.addShake(1);
    G.slowmo = 1.2;
    G.onPlayerDeath();
  },

  addXp(p, v) {
    p.xp += v;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = this.xpFor(p.level);
      p.pendingLevels++;
    }
  },

  // choose 3 upgrade options
  rollUpgrades(p) {
    const pool = UPGRADES.filter((u) => (p.ups[u.id] || 0) < u.max && (!u.req || u.req(p)));
    const out = [];
    while (out.length < 3 && pool.length) {
      let tot = 0;
      for (const u of pool) tot += RARITY[u.rar].w;
      let r = Math.random() * tot, idx = 0;
      for (; idx < pool.length; idx++) { r -= RARITY[pool[idx].rar].w; if (r <= 0) break; }
      out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
    }
    return out;
  },

  applyUpgrade(p, u) {
    p.ups[u.id] = (p.ups[u.id] || 0) + 1;
    u.apply(p);
  },

  // ---------- companion drone ----------
  updateDrone(p, dt) {
    const d = p.drone || (p.drone = { x: p.x, y: p.y, a: 0, t: 0, fire: 0, aim: 0 });
    d.t += dt;
    const tx = p.x + Math.cos(d.t * 1.3) * 46, ty = p.y - 38 + Math.sin(d.t * 2.1) * 12;
    d.x = damp(d.x, tx, 6, dt); d.y = damp(d.y, ty, 6, dt);
    d.fire -= dt;
    let best = null, bd = 420 * 420;
    for (const e of G.enemies) {
      if (e.dead || e.state === 'emerge' || e.state === 'sleep') continue;
      const dd = dist2(d.x, d.y, e.x, e.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (best) {
      d.aim = angTo(d.x, d.y, best.x, best.y);
      if (d.fire <= 0) {
        d.fire = 0.42 / p.st.droneRate;
        const sp = 820;
        G.pBullets.push({ x: d.x, y: d.y, px: d.x, py: d.y, vx: Math.cos(d.aim) * sp, vy: Math.sin(d.aim) * sp, life: 0.6, dmg: 7 + p.st.dmg * 0.35, crit: false, pierce: 0, bounces: 0, hit: [], r: 4, drone: true });
        FX.flash(d.x, d.y, 12, '#ffd24a', 0.06);
      }
    }
  },

  // ---------- draw ----------
  draw(ctx, p) {
    if (!p.alive) return;
    if (Art.ready) { this.drawArt(ctx, p); return; }
    const blink = p.invuln > 0 && p.dashT <= 0 && Math.floor(G.time * 20) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (blink) ctx.globalAlpha = 0.45;

    // legs
    ctx.save();
    ctx.rotate(p.moveAngle);
    const s = Math.sin(p.walkPhase) * (p.moving ? 8 : 0);
    const lift1 = Math.max(0, Math.cos(p.walkPhase)) * (p.moving ? 1.5 : 0), lift2 = Math.max(0, -Math.cos(p.walkPhase)) * (p.moving ? 1.5 : 0);
    this.foot(ctx, s, -8, lift1);
    this.foot(ctx, -s, 8, lift2);
    ctx.restore();

    // torso
    ctx.rotate(p.aim);
    const rc = -p.recoil * 3;
    // backpack
    ctx.fillStyle = '#4b555e';
    ctx.beginPath(); ctx.roundRect(-17, -9, 9, 18, 3); ctx.fill();
    ctx.fillStyle = (Math.floor(G.time * 3) % 2) ? '#ff9d2e' : '#7a3a00';
    ctx.fillRect(-15, -2, 3, 4);
    // left arm
    ctx.fillStyle = '#8e99a2';
    ctx.beginPath(); ctx.roundRect(-2, -18, 14, 7, 3); ctx.fill();
    // gun arm
    ctx.fillStyle = '#6b7680';
    ctx.beginPath(); ctx.roundRect(0 + rc, 5, 27, 8, 2); ctx.fill();
    ctx.fillStyle = '#39424a';
    ctx.fillRect(22 + rc, 6, 7, 6);
    ctx.fillStyle = '#5ce1ff';
    ctx.fillRect(12 + rc, 7, 6, 2);
    // shoulders
    const grd = ctx.createLinearGradient(-10, -14, 10, 14);
    grd.addColorStop(0, '#f4f8fa'); grd.addColorStop(0.5, '#b8c3cb'); grd.addColorStop(1, '#6d7982');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(-1, -12, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-1, 12, 7, 0, TAU); ctx.fill();
    // body
    ctx.beginPath(); ctx.roundRect(-11, -12, 21, 24, 8); ctx.fill();
    ctx.strokeStyle = '#2b3238'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ff9d2e';
    ctx.fillRect(-8, -2, 4, 4);
    // head
    ctx.fillStyle = '#dfe6ea';
    ctx.beginPath(); ctx.arc(3, 0, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b3238'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#062a36';
    ctx.beginPath(); ctx.arc(3, 0, 6, -0.95, 0.95); ctx.lineTo(3, 0); ctx.fill();
    ctx.fillStyle = p.hurtT > 0 ? '#ff5b6b' : '#5ce1ff';
    ctx.beginPath(); ctx.arc(3, 0, 5.2, -0.75, 0.75); ctx.lineTo(5, 0); ctx.fill();
    // antenna
    ctx.strokeStyle = '#39424a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(-8, -9); ctx.stroke();
    ctx.restore();

    if (p.hurtT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = p.hurtT;
      ctx.drawImage(FX.glow('#ff3040'), p.x - 30, p.y - 30, 60, 60); ctx.restore();
    }
    // visor glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    const hx = p.x + Math.cos(p.aim) * 6, hy = p.y + Math.sin(p.aim) * 6;
    ctx.drawImage(FX.glow('#5ce1ff'), hx - 14, hy - 14, 28, 28);
    ctx.restore();

    // orbitals
    if (p.st.orbitals > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const n = p.st.orbitals;
      for (let i = 0; i < n; i++) {
        const a = p.orbitA + (i / n) * TAU;
        const ox = p.x + Math.cos(a) * 62, oy = p.y + Math.sin(a) * 62;
        ctx.drawImage(FX.glow('#ff6ae6'), ox - 16, oy - 16, 32, 32);
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(G.time * 14);
        ctx.fillStyle = '#ffd6f8';
        ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = (k / 3) * TAU; ctx.lineTo(Math.cos(b) * 8, Math.sin(b) * 8); ctx.lineTo(Math.cos(b + 0.5) * 3, Math.sin(b + 0.5) * 3); } ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    if (p.hasDrone && p.drone) this.drawDrone(ctx, p.drone);
  },

  // 8 facing directions from 5 painted views (left side is mirrored)
  facing(a) {
    const o = Math.round(Math.atan2(Math.sin(a), Math.cos(a)) / (Math.PI / 4));
    switch (o) {
      case 2: return ['s', false];
      case 1: return ['se', false];
      case 0: return ['e', false];
      case -1: return ['ne', false];
      case -2: return ['n', false];
      case 3: return ['se', true];
      case -3: return ['ne', true];
      default: return ['e', true];
    }
  },

  drawArt(ctx, p) {
    const blink = p.invuln > 0 && p.dashT <= 0 && Math.floor(G.time * 20) % 2 === 0;
    const right = Math.cos(p.aim) >= 0;
    const dash = p.dashT > 0;
    const [dir, flip] = this.facing(p.aim);
    let frame = 'idle', bob = Math.sin(G.time * 3) * 0.8;
    if (p.moving) {
      let f = Math.floor(p.runDist / 8) % 12;
      if (p.vx * Math.cos(p.aim) + p.vy * Math.sin(p.aim) < -0.3 * Math.hypot(p.vx, p.vy)) f = 11 - f; // backpedal
      frame = f; bob = 0;
    }
    const name = `pl_${dir}_${frame}`;
    const im = Art.get(name) || Art.get(`pl_${dir}_idle`);
    const foot = p.y + 13;
    Art.shadow(ctx, p.x, p.y + 12, 14, 5, 0.26);
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    const hx = p.x + (right ? 7 : -7), hy = p.y - 17 - bob, rc = p.recoil * 4;
    const gun = () => Art.draw(ctx, 'player_gun', hx + Math.cos(p.aim) * (4 - rc), hy + Math.sin(p.aim) * (4 - rc), 30, { ax: 0.28, ay: 0.6, rot: p.aim, flipY: !right });
    const behind = Math.sin(p.aim) < -0.4;
    if (behind) gun();
    const sx = dash ? 1.15 : 1, sy = dash ? 0.9 : 1;
    const hurt = { flash: p.hurtT > 0 ? p.hurtT * 2.5 : 0, flashColor: '#ff3040' };
    if (im) {
      const K = 58 / 170;
      Art.draw(ctx, im === Art.get(name) ? name : `pl_${dir}_idle`, p.x, foot - bob, im.width * K, Object.assign({ flip, sx, sy }, hurt));
    } else {
      Art.draw(ctx, 'player_body', p.x, foot - bob, 36, Object.assign({ flip: !right, sx, sy }, hurt));
    }
    if (!behind) gun();
    ctx.restore();
    if (dir !== 'n' && dir !== 'ne') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2;
      const vx = dir === 'e' ? (flip ? -8 : 8) : dir === 'se' ? (flip ? -4 : 4) : 0;
      ctx.drawImage(FX.glow('#5ce1ff'), p.x + vx - 14, foot - bob - 58, 28, 28);
      ctx.restore();
    }
    if (p.st.orbitals > 0) this.drawOrbitals(ctx, p);
    if (p.hasDrone && p.drone) {
      const d = p.drone;
      Art.shadow(ctx, d.x + 4, p.y + 14, 9, 3.5, 0.2);
      if (!Art.draw(ctx, 'drone', d.x, d.y + 10, 28, { flip: Math.cos(d.aim) < 0, rot: Math.sin(G.time * 3) * 0.08 })) this.drawDrone(ctx, d);
    }
  },

  drawOrbitals(ctx, p) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = p.st.orbitals;
    for (let i = 0; i < n; i++) {
      const a = p.orbitA + (i / n) * TAU;
      const ox = p.x + Math.cos(a) * 62, oy = p.y + Math.sin(a) * 62;
      ctx.drawImage(FX.glow('#ff6ae6'), ox - 16, oy - 16, 32, 32);
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(G.time * 14);
      ctx.fillStyle = '#ffd6f8';
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = (k / 3) * TAU; ctx.lineTo(Math.cos(b) * 8, Math.sin(b) * 8); ctx.lineTo(Math.cos(b + 0.5) * 3, Math.sin(b + 0.5) * 3); } ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },

  foot(ctx, fx, fy, lift) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.roundRect(fx - 7, fy - 4 + 2, 14, 8, 3); ctx.fill();
    ctx.fillStyle = '#56616a';
    ctx.beginPath(); ctx.roundRect(fx - 7 - lift, fy - 4 - lift, 14 + lift * 2, 8 + lift, 3); ctx.fill();
    ctx.fillStyle = '#9aa6af';
    ctx.fillRect(fx - 3 - lift, fy - 2 - lift, 6, 3);
  },

  drawDrone(ctx, d) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(d.x + 6, d.y + 22, 9, 5, 0, 0, TAU); ctx.fill();
    ctx.translate(d.x, d.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 11, -2, 7, 2, G.time * 40 * s, 0, TAU); ctx.stroke(); }
    ctx.rotate(d.aim);
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a4a00'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.fillRect(4, -2, 8, 4);
    ctx.fillStyle = '#062a36'; ctx.beginPath(); ctx.arc(1, 0, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5ce1ff'; ctx.beginPath(); ctx.arc(2, -1, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

// ---------- projectiles ----------
const Bullets = {
  update(dt) {
    const p = G.player;
    for (const b of G.pBullets) {
      if (b.dead) continue;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      const o = World.shotHit(b.x, b.y, b.r);
      if (o) {
        b.dead = true;
        FX.hit(b.x, b.y, Math.atan2(b.vy, b.vx), '#ffe2b0');
        Snd.at('metal', b.x, b.y);
        if (o.destructible) Props.damageObstacle(o, b.dmg);
        if (p.st.explosive) this.explode(b);
        continue;
      }
      if (Props.shotHitProps(b)) { b.dead = true; continue; }
      for (const eb of G.eBullets) {
        if (eb.shootable && !eb.dead && dist2(b.x, b.y, eb.x, eb.y) < (eb.r + b.r + 6) ** 2) {
          eb.dead = true; b.dead = true;
          FX.explosion(eb.x, eb.y, 0.35, { noDecal: true });
          Snd.play('hit');
          break;
        }
      }
      if (b.dead) continue;
      for (const e of G.enemies) {
        if (e.dead || e.state === 'emerge' || b.hit.includes(e.id)) continue;
        const rr = e.r + b.r;
        if (segDist2(e.x, e.y + e.hoy, b.px, b.py, b.x, b.y) < rr * rr) {
          b.hit.push(e.id);
          G.stats.hits++;
          const ang = Math.atan2(b.vy, b.vx);
          Enemies.damage(e, b.dmg, { ang, kb: b.drone ? 30 : 90, crit: b.crit, src: 'bullet' });
          FX.hit(b.x, b.y, ang, b.crit ? '#ffe066' : '#aef4ff');
          if (!b.drone) {
            if (p.st.explosive) this.explode(b);
            if (p.st.chain > 0 && Math.random() < p.st.chain) this.chain(e, b.dmg);
          }
          if (b.pierce > 0) { b.pierce--; }
          else if (b.bounces > 0) {
            b.bounces--;
            let best = null, bd = 340 * 340;
            for (const e2 of G.enemies) {
              if (e2.dead || e2 === e || b.hit.includes(e2.id) || e2.state === 'emerge') continue;
              const dd = dist2(b.x, b.y, e2.x, e2.y);
              if (dd < bd) { bd = dd; best = e2; }
            }
            if (best) {
              const a = angTo(b.x, b.y, best.x, best.y), sp = Math.hypot(b.vx, b.vy);
              b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.life = 0.5;
              FX.flash(b.x, b.y, 14, '#bff6ff', 0.1);
            } else b.dead = true;
          } else b.dead = true;
          if (b.dead) break;
        }
      }
    }
    G.pBullets = G.pBullets.filter((b) => !b.dead);

    // enemy bullets
    for (const b of G.eBullets) {
      if (b.dead) continue;
      b.t = (b.t || 0) + dt;
      if (b.homing && p.alive) {
        const a = Math.atan2(b.vy, b.vx), ta = angTo(b.x, b.y, p.x, p.y);
        const na = rotateToward(a, ta, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        if (Math.random() < 0.5) FX.add({ kind: 'smoke', x: b.x, y: b.y, life: 0.4, size: 3, size2: 8, color: '#555', alpha: 0.4 });
      }
      if (b.accel) { b.vx *= 1 + b.accel * dt; b.vy *= 1 + b.accel * dt; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; if (b.onEnd) b.onEnd(b); continue; }
      if (World.shotHit(b.x, b.y, b.r * 0.6)) {
        b.dead = true; FX.hit(b.x, b.y, Math.atan2(b.vy, b.vx), b.color);
        if (b.onEnd) b.onEnd(b);
        continue;
      }
      if (b.towerDmg && Props.tower && Props.tower.active) {
        const tw = Props.tower;
        if (dist2(b.x, b.y, tw.x, tw.y) < (46 + b.r) ** 2) { b.dead = true; Props.damageTower(b.dmg); FX.hit(b.x, b.y, 0, b.color); continue; }
      }
      if (p.alive && dist2(b.x, b.y, p.x, p.y) < (b.r + p.hitR) ** 2) {
        if (p.invuln > 0) continue;
        b.dead = true;
        Player.hurt(p, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05, { kb: 180 });
        if (b.onEnd) b.onEnd(b);
      }
    }
    G.eBullets = G.eBullets.filter((b) => !b.dead);
  },

  explode(b) {
    const lvl = G.player.st.explosive;
    const R = 38 + lvl * 14, dmg = b.dmg * (0.3 + lvl * 0.15);
    FX.flash(b.x, b.y, R * 0.9, '#ffb04a', 0.12);
    FX.ring(b.x, b.y, 6, R, '#ffcf8a', 0.2, 2);
    FX.sparks(b.x, b.y, 0, Math.PI, 4, '#ffcf8a', 100, 260, 0.2);
    for (const e of G.enemies) {
      if (e.dead || b.hit.includes(e.id)) continue;
      if (dist2(b.x, b.y, e.x, e.y) < (R + e.r) ** 2) Enemies.damage(e, dmg, { ang: angTo(b.x, b.y, e.x, e.y), kb: 60, src: 'splash', quiet: true });
    }
  },

  chain(from, dmg) {
    let cur = from;
    const hit = new Set([from.id]);
    for (let k = 0; k < 3; k++) {
      let best = null, bd = 200 * 200;
      for (const e of G.enemies) {
        if (e.dead || hit.has(e.id) || e.state === 'emerge') continue;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best.id);
      FX.lightning(cur.x, cur.y, best.x, best.y);
      Enemies.damage(best, dmg * 0.6, { ang: angTo(cur.x, cur.y, best.x, best.y), kb: 40, src: 'chain' });
      cur = best;
    }
    Snd.play('zap');
  },

  draw(ctx) {
    ctx.save();
    for (const b of G.pBullets) {
      const a = Math.atan2(b.vy, b.vx);
      const col = b.drone ? '#ffd24a' : b.crit ? '#ffe066' : '#5ce1ff';
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(FX.glow(col), b.x - 16, b.y - 16, 32, 32);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-14, -3, 18, 6, 3); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(-8, -1.5, 11, 3, 1.5); ctx.fill();
      ctx.restore();
    }
    for (const b of G.eBullets) {
      const col = b.color || '#ff8a3c';
      ctx.globalCompositeOperation = 'lighter';
      const gs = b.r * 3.2;
      ctx.drawImage(FX.glow(col), b.x - gs, b.y - gs, gs * 2, gs * 2);
      ctx.globalCompositeOperation = 'source-over';
      if (b.kind === 'missile') {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.roundRect(-10, -4, 18, 8, 3); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(4, -3, 5, 6);
        ctx.restore();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff6e8';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ---------- pickups ----------
const Pickups = {
  ART: { health: ['medkit', 24, '#5dff8a'], emp: ['empcell', 20, '#ffd24a'], cell: ['cell', 22, '#b8ff5a'], keycard: ['keycard', 28, '#ff4757'], log: ['datalog', 26, '#c77dff'], core: ['core', 38, '#ff5a2a'] },

  drawArt(ctx, it, bob) {
    const glow = (col, s, a = 1) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(FX.glow(col), -s / 2, -s / 2 + bob - 6, s, s); ctx.restore(); };
    if (it.type === 'xp') {
      const big = it.value >= 10, mid = it.value >= 5;
      const col = big ? '#ff6ae6' : mid ? '#b18cff' : '#58ffc8';
      const w = big ? 11 : mid ? 9 : 7;
      glow(col, w * 3.4);
      return Art.draw(ctx, 'gem', 0, bob, w, { ay: 0.55, rot: Math.sin(G.time * 3 + it.bob) * 0.3, tint: big || mid ? [col, 0.45] : null });
    }
    const a = this.ART[it.type];
    if (!a || !Art.get(a[0])) return false;
    if (it.type === 'cell') {
      const pulse = Math.sin(G.time * 4);
      ctx.strokeStyle = `rgba(184,255,90,${0.45 + pulse * 0.2})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 10, 24 + pulse * 3, 9 + pulse, 0, 0, TAU); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.drawImage(FX.glow('#b8ff5a'), -16, -160 + bob, 32, 170); ctx.restore();
    }
    Art.shadow(ctx, 0, 9, a[1] * 0.45, a[1] * 0.16, 0.25);
    glow(a[2], a[1] * 2.6, it.type === 'core' ? 1 : 0.8);
    return Art.draw(ctx, a[0], 0, bob - 6, a[1], { ay: 0.5, rot: it.type === 'keycard' ? Math.sin(G.time * 2) * 0.25 : 0 });
  },

  spawn(type, x, y, opt = {}) {
    const a = rand(0, TAU), sp = opt.burst == null ? rand(60, 200) : opt.burst;
    const it = Object.assign({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, value: 1, mag: false, bob: rand(0, TAU) }, opt);
    G.pickups.push(it);
    return it;
  },

  gems(x, y, total) {
    while (total > 0) {
      const v = total >= 10 ? 10 : total >= 5 ? 5 : 1;
      total -= v;
      this.spawn('xp', x, y, { value: v });
    }
  },

  update(dt) {
    const p = G.player;
    for (const it of G.pickups) {
      if (it.dead) continue;
      it.t += dt;
      const k = Math.exp(-5 * dt);
      it.vx *= k; it.vy *= k;
      const quest = it.type === 'cell' || it.type === 'keycard' || it.type === 'log' || it.type === 'core';
      if (p.alive) {
        const d = dist(it.x, it.y, p.x, p.y);
        const magR = quest ? 0 : it.type === 'xp' ? p.st.magnet : p.st.magnet * 0.7;
        if (it.t > 0.35 && (it.mag || d < magR)) {
          it.mag = true;
          const a = angTo(it.x, it.y, p.x, p.y), s = 320 + it.t * 500;
          it.vx = Math.cos(a) * s; it.vy = Math.sin(a) * s;
        }
        if (d < (quest ? 34 : 20) && it.t > 0.2) this.collect(it, p);
      }
      it.x += it.vx * dt; it.y += it.vy * dt;
      if (it.type === 'xp' && it.t > 40) it.dead = true;
    }
    G.pickups = G.pickups.filter((i) => !i.dead);
  },

  collect(it, p) {
    it.dead = true;
    switch (it.type) {
      case 'xp':
        G.xpChain = G.time - G.lastXpT < 0.5 ? Math.min(G.xpChain + 1, 24) : 0;
        G.lastXpT = G.time;
        Snd.play('pickup', { pitch: 1 + G.xpChain * 0.04 });
        Player.addXp(p, it.value);
        FX.sparkle(it.x, it.y, '#7fffd4', 3);
        break;
      case 'health': {
        const h = Math.min(p.maxHp - p.hp, 30);
        p.hp += h;
        FX.text(p.x, p.y - 26, '+' + Math.round(Math.max(h, 0)), '#5dff8a', 18);
        FX.sparkle(p.x, p.y, '#5dff8a', 10);
        Snd.play('heal'); Snd.play('pickup', { pitch: 0.8 });
        break;
      }
      case 'emp':
        p.emp = Math.min(100, p.emp + 35);
        FX.sparkle(p.x, p.y, '#ffd24a', 10);
        Snd.play('pickup', { pitch: 1.3 });
        break;
      default:
        Quest.onItem(it);
    }
  },

  draw(ctx, v) {
    for (const it of G.pickups) {
      if (it.x < v.x0 - 40 || it.x > v.x1 + 40 || it.y < v.y0 - 40 || it.y > v.y1 + 40) continue;
      const bob = Math.sin(G.time * 4 + it.bob) * 3;
      ctx.save();
      ctx.translate(it.x, it.y);
      if (Art.ready && this.drawArt(ctx, it, bob)) { ctx.restore(); continue; }
      switch (it.type) {
        case 'xp': {
          const s = it.value >= 10 ? 8 : it.value >= 5 ? 6.5 : 5;
          const col = it.value >= 10 ? '#ff6ae6' : it.value >= 5 ? '#b18cff' : '#58ffc8';
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow(col), -s * 2.6, -s * 2.6 + bob, s * 5.2, s * 5.2);
          ctx.globalCompositeOperation = 'source-over';
          ctx.rotate(G.time * 2 + it.bob);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(0, -s + bob); ctx.lineTo(s * 0.7, bob); ctx.lineTo(0, s + bob); ctx.lineTo(-s * 0.7, bob); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath(); ctx.moveTo(0, -s + bob); ctx.lineTo(s * 0.3, bob - s * 0.2); ctx.lineTo(0, bob); ctx.closePath(); ctx.fill();
          break;
        }
        case 'health':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow('#5dff8a'), -22, -22 + bob, 44, 44);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#e8fff0'; ctx.beginPath(); ctx.roundRect(-10, -10 + bob, 20, 20, 4); ctx.fill();
          ctx.fillStyle = '#18b84a'; ctx.fillRect(-3, -7 + bob, 6, 14); ctx.fillRect(-7, -3 + bob, 14, 6);
          break;
        case 'emp':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow('#ffd24a'), -22, -22 + bob, 44, 44);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#2a2000'; ctx.beginPath(); ctx.arc(0, bob, 10, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath(); ctx.moveTo(2, -8 + bob); ctx.lineTo(-5, 1 + bob); ctx.lineTo(0, 1 + bob); ctx.lineTo(-2, 8 + bob); ctx.lineTo(5, -1 + bob); ctx.lineTo(0, -1 + bob); ctx.closePath(); ctx.fill();
          break;
        case 'cell': Props.drawCell(ctx, bob); break;
        case 'keycard':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow('#ff4757'), -36, -36 + bob, 72, 72);
          ctx.globalCompositeOperation = 'source-over';
          ctx.rotate(Math.sin(G.time * 2) * 0.3);
          ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.roundRect(-14, -9 + bob, 28, 18, 3); ctx.fill();
          ctx.fillStyle = '#ff4757'; ctx.fillRect(-14, -9 + bob, 28, 6);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(-10, 0 + bob, 7, 5);
          break;
        case 'log':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow('#c77dff'), -30, -30 + bob, 60, 60);
          ctx.globalCompositeOperation = 'source-over';
          ctx.rotate(G.time * 1.5);
          ctx.strokeStyle = '#f1ddff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(199,125,255,0.5)';
          ctx.beginPath(); ctx.rect(-8, -8 + bob, 16, 16); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-8, -8 + bob); ctx.lineTo(8, 8 + bob); ctx.moveTo(8, -8 + bob); ctx.lineTo(-8, 8 + bob); ctx.stroke();
          break;
        case 'core':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FX.glow('#ff5a2a'), -60, -60 + bob, 120, 120);
          ctx.drawImage(FX.glow('#ffffff'), -20, -20 + bob, 40, 40);
          ctx.globalCompositeOperation = 'source-over';
          ctx.rotate(G.time);
          ctx.fillStyle = '#ff9a3c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14 + bob); } ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
      }
      ctx.restore();
    }
  },
};
