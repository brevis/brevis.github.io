'use strict';
// Particles, glows, floating numbers.
const FX = {
  list: [], texts: [], glowCache: {}, MAX: 1800,

  glow(color) {
    let c = this.glowCache[color];
    if (c) return c;
    c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(0.25, rgba(color, 0.6));
    gr.addColorStop(0.6, rgba(color, 0.15));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.glowCache[color] = c;
    return c;
  },

  add(p) {
    if (this.list.length >= this.MAX) this.list.shift();
    p.life = p.max = p.life || 0.5;
    p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.drag = p.drag == null ? 3 : p.drag;
    p.size2 = p.size2 == null ? p.size : p.size2;
    this.list.push(p);
    return p;
  },

  clear() { this.list.length = 0; this.texts.length = 0; },

  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'debris') {
        p.vz -= 900 * dt; p.z += p.vz * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.55; p.vy *= 0.55; p.vr *= 0.5; }
        p.rot += p.vr * dt;
      } else if (p.vr) p.rot += p.vr * dt;
      if (p.follow) { p.x = p.follow.x + (p.ox || 0); p.y = p.follow.y + (p.oy || 0); }
      L[w++] = p;
    }
    L.length = w;
    const Tx = this.texts;
    w = 0;
    for (let i = 0; i < Tx.length; i++) {
      const t = Tx[i];
      t.life -= dt;
      if (t.life <= 0) continue;
      t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt);
      Tx[w++] = t;
    }
    Tx.length = w;
  },

  draw(ctx, v, additive) {
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (!!p.add !== additive) continue;
      if (p.x < v.x0 - 200 || p.x > v.x1 + 200 || p.y < v.y0 - 200 || p.y > v.y1 + 200) continue;
      const t = 1 - p.life / p.max; // 0 → 1
      const a = p.fade === false ? 1 : p.life / p.max;
      const s = lerp(p.size, p.size2, t);
      switch (p.kind) {
        case 'glow': {
          const img = this.glow(p.color);
          ctx.globalAlpha = a * (p.alpha || 1);
          ctx.drawImage(img, p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy);
          const len = Math.min(p.len || 30, sp * 0.045) + 1;
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color; ctx.lineWidth = s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / (sp || 1)) * len, p.y - (p.vy / (sp || 1)) * len); ctx.stroke();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = a * (p.alpha || 1);
          ctx.strokeStyle = p.color; ctx.lineWidth = (p.width || 3) * (p.thin ? a : 1);
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, TAU); ctx.stroke();
          break;
        }
        case 'smoke': {
          ctx.globalAlpha = a * (p.alpha || 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
          break;
        }
        case 'dot': {
          ctx.globalAlpha = a * (p.alpha || 1);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.2, s), 0, TAU); ctx.fill();
          break;
        }
        case 'debris': {
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x - s / 2 + 2, p.y - s / 2 + 3, s, s);
          ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 2 * 0.7, s, s * 0.7);
          ctx.restore();
          break;
        }
        case 'bolt': {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color; ctx.lineWidth = s; ctx.lineJoin = 'round';
          ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.35;
          ctx.stroke();
          break;
        }
        case 'ghost': { // player afterimage
          ctx.globalAlpha = a * 0.45;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.ellipse(0, 0, 16, 14, 0, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case 'shard': {
          ctx.globalAlpha = a;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s, 0); ctx.lineTo(0, -s * 0.4); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
    ctx.restore();
  },

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const age = t.max - t.life;
      const pop = age < 0.12 ? lerp(1.7, 1, age / 0.12) : 1;
      const a = clamp(t.life / 0.3, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(t.size * pop)}px 'Russo One', sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  },

  // ---------- helpers ----------
  text(x, y, str, color = '#fff', size = 16, life = 0.7) {
    if (this.texts.length > 120) this.texts.shift();
    this.texts.push({ x: x + rand(-8, 8), y: y - 10, vy: -70, str: String(str), color, size, life, max: life });
  },

  sparks(x, y, ang, spread, n, color, sp0 = 180, sp1 = 480, life = 0.25, size = 2) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(sp0, sp1);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.6, life), size, size2: size * 0.3, color, drag: 5, add: true });
    }
  },

  flash(x, y, r, color, life = 0.12, alpha = 1) {
    this.add({ kind: 'glow', x, y, size: r, size2: r * 1.2, color, life, add: true, drag: 0, alpha });
  },

  ring(x, y, r0, r1, color, life = 0.35, width = 3, add = true) {
    this.add({ kind: 'ring', x, y, size: r0, size2: r1, color, life, width, add, drag: 0 });
  },

  hit(x, y, ang, color = '#aef4ff') {
    this.sparks(x, y, ang + Math.PI, 0.9, 5, color, 150, 420, 0.22, 2);
    this.flash(x, y, 16, color, 0.08);
  },

  muzzle(x, y, ang) {
    this.flash(x, y, 18, '#7fe8ff', 0.06);
    this.sparks(x, y, ang, 0.35, 2, '#dffaff', 250, 500, 0.1, 1.5);
  },

  dust(x, y, color, n = 2, spd = 40) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'smoke', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-spd, spd), vy: rand(-spd, spd), life: rand(0.35, 0.7), size: rand(3, 5), size2: rand(8, 12), color, alpha: 0.35, drag: 3 });
    }
  },

  explosion(x, y, scale = 1, opts = {}) {
    const s = scale;
    this.flash(x, y, 110 * s, '#ffd28a', 0.18);
    this.flash(x, y, 60 * s, '#ffffff', 0.08);
    for (let i = 0; i < 10 * s; i++) {
      const a = rand(0, TAU), sp = rand(60, 260) * s;
      this.add({ kind: 'glow', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), size: rand(14, 26) * s, size2: rand(4, 10) * s, color: pick(['#ff9a3c', '#ffcf5a', '#ff5a2a']), add: true, drag: 4 });
    }
    for (let i = 0; i < 9 * s; i++) {
      const a = rand(0, TAU), sp = rand(20, 120) * s;
      this.add({ kind: 'smoke', x: x + rand(-10, 10) * s, y: y + rand(-10, 10) * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: rand(0.8, 1.5), size: rand(10, 18) * s, size2: rand(26, 44) * s, color: pick(['#2a2622', '#3a3430', '#4a4038']), alpha: 0.55, drag: 2 });
    }
    this.sparks(x, y, 0, Math.PI, Math.round(16 * s), '#ffd68a', 200, 650 * Math.sqrt(s), 0.4, 2.2);
    for (let i = 0; i < 7 * s; i++) {
      const a = rand(0, TAU), sp = rand(80, 320);
      this.add({ kind: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 4, vz: rand(150, 380), rot: rand(0, TAU), vr: rand(-14, 14), life: rand(0.9, 1.6), size: rand(3, 7), color: opts.debris || pick(['#3a3a3a', '#555', '#7a6a58']), drag: 1.2 });
    }
    this.ring(x, y, 10 * s, 130 * s, '#ffe2b0', 0.32, 4 * s);
    if (!opts.noDecal) World.addDecal(x, y, 55 * s, 'scorch');
  },

  goo(x, y, color, scale = 1) {
    for (let i = 0; i < 14 * scale; i++) {
      const a = rand(0, TAU), sp = rand(60, 280) * scale;
      this.add({ kind: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), size: rand(2.5, 5) * scale, size2: 1, color, drag: 6 });
    }
    World.addDecal(x, y, 22 * scale, 'goo', color);
  },

  emerge(x, y, r) {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), sp = rand(60, 200);
      this.add({ kind: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 2, vz: rand(120, 260), rot: rand(0, TAU), vr: rand(-10, 10), life: rand(0.6, 1), size: rand(3, 6), color: pick(['#5a3a1a', '#7a5028', '#3a2410']), drag: 1.5 });
    }
    this.ring(x, y, r * 0.5, r * 2.6, '#c89a60', 0.4, 3, false);
  },

  lightning(x1, y1, x2, y2, color = '#9fe8ff') {
    const pts = [[x1, y1]];
    const n = Math.max(3, Math.floor(dist(x1, y1, x2, y2) / 18));
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n, off = rand(-14, 14);
      pts.push([lerp(x1, x2, t) + (nx / l) * off, lerp(y1, y2, t) + (ny / l) * off]);
    }
    pts.push([x2, y2]);
    this.add({ kind: 'bolt', x: x1, y: y1, pts, life: 0.16, size: 3, size2: 1, color, add: true, drag: 0 });
    this.flash(x2, y2, 22, color, 0.12);
  },

  sparkle(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(40, 140);
      this.add({ kind: 'glow', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), size: rand(5, 9), size2: 1, color, add: true, drag: 3 });
    }
  },
};
