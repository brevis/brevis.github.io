// Все спрайты рисуются один раз в offscreen-канвасы (дешёвый drawImage в кадре,
// никаких shadowBlur/фильтров в рантайме — важно для слабых телефонов).
import { NORMAL, TNT, STEEL } from './logic.js';

export const KIND_COLOR = {
  basic: { rim: '#ff5ec8', glow: 'rgba(255,94,200,' },
  fire: { rim: '#ff9a2e', glow: 'rgba(255,154,46,' },
  laser: { rim: '#45e6ff', glow: 'rgba(69,230,255,' },
};

const PAL = {
  blue: { top: '#b1c4f2', bot: '#859edc', hi: '#eef2fd', lo: '#3a4ea3', edge: '#1f2b66', rivet: '#223070' },
  steel: { top: '#c4ccd6', bot: '#8a95a4', hi: '#f4f7fa', lo: '#4d5766', edge: '#262c36', rivet: '#262c36' },
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Детерминированный шум, чтобы все блоки выглядели одинаково.
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function metalBlock(ctx, s, p, opts = {}) {
  const b = Math.max(1, s * 0.07);
  ctx.fillStyle = p.edge;
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, p.top);
  g.addColorStop(1, p.bot);
  ctx.fillStyle = g;
  ctx.fillRect(b * 0.6, b * 0.6, s - b * 1.2, s - b * 1.2);
  // фаска: светлая сверху/слева, тёмная снизу/справа
  ctx.fillStyle = p.hi;
  ctx.fillRect(b * 0.6, b * 0.6, s - b * 1.2, b);
  ctx.fillRect(b * 0.6, b * 0.6, b, s - b * 1.2);
  ctx.fillStyle = p.lo;
  ctx.fillRect(b * 0.6, s - b * 1.6, s - b * 1.2, b);
  ctx.fillRect(s - b * 1.6, b * 0.6, b, s - b * 1.2);
  // шершавость металла
  const r = rng(7);
  const n = Math.floor(s * s / 30);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
    const d = Math.max(1, s * 0.03);
    ctx.fillRect(b * 2 + r() * (s - b * 4), b * 2 + r() * (s - b * 4), d, d);
  }
  // заклёпки
  const rv = Math.max(1.5, s * (opts.bigRivets ? 0.13 : 0.1));
  const inset = s * 0.13;
  for (const [x, y] of [[inset, inset], [s - inset - rv, inset], [inset, s - inset - rv], [s - inset - rv, s - inset - rv]]) {
    ctx.fillStyle = p.rivet;
    ctx.fillRect(x, y, rv, rv);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x + rv * 0.5, y + rv * 0.15, rv * 0.35, rv * 0.35);
  }
}

const ENERGY = {
  basic: { edge: '#6e0b4e', top: '#ffa6e6', bot: '#e8309f', core: '#fff3fb' },
  fire: { edge: '#7a2600', top: '#ffd77a', bot: '#ff6414', core: '#fff6d8' },
  laser: { edge: '#044a63', top: '#b8fdff', bot: '#18bfe6', core: '#f2ffff' },
};

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function energyBlock(ctx, s, p) {
  const b = Math.max(1, s * 0.07);
  rrect(ctx, 0, 0, s, s, s * 0.2);
  ctx.fillStyle = p.edge;
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, p.top);
  g.addColorStop(1, p.bot);
  rrect(ctx, b, b, s - b * 2, s - b * 2, s * 0.15);
  ctx.fillStyle = g;
  ctx.fill();
  // глянец
  rrect(ctx, b * 2, b * 1.6, s - b * 4, s * 0.36, s * 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  // искра-ядро
  const c = s / 2, r = s * 0.2;
  ctx.fillStyle = p.core;
  ctx.beginPath();
  ctx.moveTo(c, c - r * 1.1); ctx.quadraticCurveTo(c, c, c + r * 1.1, c + r * 0.15);
  ctx.quadraticCurveTo(c, c, c, c + r * 1.4); ctx.quadraticCurveTo(c, c, c - r * 1.1, c + r * 0.15);
  ctx.quadraticCurveTo(c, c, c, c - r * 1.1);
  ctx.fill();
}

function tntBlock(ctx, s) {
  const b = Math.max(1, s * 0.07);
  ctx.fillStyle = '#4a0f06';
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#ff6a45');
  g.addColorStop(1, '#c42a14');
  ctx.fillStyle = g;
  ctx.fillRect(b * 0.6, b * 0.6, s - b * 1.2, s - b * 1.2);
  ctx.fillStyle = 'rgba(255,220,200,0.8)';
  ctx.fillRect(b * 0.6, b * 0.6, s - b * 1.2, b);
  ctx.fillStyle = 'rgba(90,10,0,0.6)';
  ctx.fillRect(b * 0.6, s - b * 1.6, s - b * 1.2, b);
  // полоса с надписью
  ctx.fillStyle = '#f7f1e6';
  ctx.fillRect(b * 1.2, s * 0.34, s - b * 2.4, s * 0.32);
  ctx.fillStyle = '#b3200c';
  ctx.font = `900 ${Math.round(s * 0.27)}px system-ui, -apple-system, Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TNT', s / 2, s * 0.51);
  // палочки динамита
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 1; k < 3; k++) ctx.fillRect(s * k / 3 - b * 0.3, b, b * 0.6, s * 0.3);
  for (let k = 1; k < 3; k++) ctx.fillRect(s * k / 3 - b * 0.3, s * 0.68, b * 0.6, s * 0.3 - b);
}

function steelBlock(ctx, s, cracked) {
  metalBlock(ctx, s, PAL.steel, { bigRivets: true });
  // крест-усиление
  ctx.strokeStyle = 'rgba(40,48,60,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.28); ctx.lineTo(s * 0.72, s * 0.72);
  ctx.moveTo(s * 0.72, s * 0.28); ctx.lineTo(s * 0.28, s * 0.72);
  ctx.stroke();
  if (cracked) {
    ctx.fillStyle = 'rgba(40,20,10,0.18)';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#1b1f26';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.1, s * 0.35); ctx.lineTo(s * 0.38, s * 0.45); ctx.lineTo(s * 0.5, s * 0.3);
    ctx.lineTo(s * 0.62, s * 0.55); ctx.lineTo(s * 0.9, s * 0.62);
    ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.55, s * 0.08);
    ctx.moveTo(s * 0.62, s * 0.55); ctx.lineTo(s * 0.5, s * 0.92);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(s * 0.12, s * 0.39); ctx.lineTo(s * 0.38, s * 0.49); ctx.lineTo(s * 0.5, s * 0.35);
    ctx.stroke();
  }
}

// Набор спрайтов под конкретный размер клетки (в физических пикселях).
export function buildBlockSprites(px) {
  const mk = fn => { const c = makeCanvas(px, px); fn(c.getContext('2d'), c.width); return c; };
  return {
    [NORMAL]: mk((ctx, s) => metalBlock(ctx, s, PAL.blue)),
    [TNT]: mk(tntBlock),
    [STEEL]: mk((ctx, s) => steelBlock(ctx, s, false)),
    steelCracked: mk((ctx, s) => steelBlock(ctx, s, true)),
    charge: {
      basic: mk((ctx, s) => energyBlock(ctx, s, ENERGY.basic)),
      fire: mk((ctx, s) => energyBlock(ctx, s, ENERGY.fire)),
      laser: mk((ctx, s) => energyBlock(ctx, s, ENERGY.laser)),
    },
  };
}

// Мягкое пятно (дым/свечение) — один раз, потом масштабируется.
export function buildPuff(px, rgb) {
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.5, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return c;
}

// Пузырь-заряд с фигуркой внутри (как на эскизе).
export function buildBubble(px, charge, blockSprites) {
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  const r = px / 2;
  const col = KIND_COLOR[charge.kind];
  // внешнее свечение
  const glow = ctx.createRadialGradient(r, r, r * 0.8, r, r, r);
  glow.addColorStop(0, col.glow + '0.0)');
  glow.addColorStop(0.7, col.glow + '0.35)');
  glow.addColorStop(1, col.glow + '0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, px, px);
  // стеклянный шар
  const body = ctx.createRadialGradient(r * 0.75, r * 0.65, r * 0.1, r, r, r * 0.92);
  body.addColorStop(0, '#7b76b0');
  body.addColorStop(0.7, '#3b3578');
  body.addColorStop(1, '#1d1946');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(r, r, r * 0.9, 0, Math.PI * 2); ctx.fill();
  // пузырьки внутри
  const rand = rng(charge.cells.length * 31 + charge.w * 7 + 3);
  ctx.strokeStyle = col.glow + '0.55)';
  ctx.lineWidth = Math.max(1, px * 0.012);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, d = r * (0.35 + rand() * 0.45);
    ctx.beginPath();
    ctx.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, px * (0.02 + rand() * 0.04), 0, Math.PI * 2);
    ctx.stroke();
  }
  // обод
  ctx.lineWidth = Math.max(2, px * 0.045);
  ctx.strokeStyle = col.rim;
  ctx.beginPath(); ctx.arc(r, r, r * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, px * 0.015);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(r, r, r * 0.82, 0, Math.PI * 2); ctx.stroke();

  // фигурка
  const m = Math.min(px * 0.56 / charge.w, px * 0.56 / charge.h, px * 0.19);
  const ox = r - charge.w * m / 2, oy = r - charge.h * m / 2;
  if (charge.kind === 'laser') {
    ctx.fillStyle = 'rgba(63,214,255,0.55)';
    const rows = new Set(charge.cells.map(c => c[1]));
    for (const y of rows) ctx.fillRect(r - r * 0.78, oy + y * m + m * 0.38, r * 1.56, m * 0.24);
  }
  if (charge.kind === 'fire') {
    ctx.fillStyle = 'rgba(255,138,42,0.35)';
    for (const [x, y] of charge.cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (charge.cells.some(([a, b]) => a === x + dx && b === y + dy)) continue;
        ctx.fillRect(ox + (x + dx) * m + m * 0.15, oy + (y + dy) * m + m * 0.15, m * 0.7, m * 0.7);
      }
    }
  }
  const spr = blockSprites.charge[charge.kind];
  for (const [x, y] of charge.cells) ctx.drawImage(spr, ox + x * m, oy + y * m, m, m);
  // блик
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(r * 0.66, r * 0.42, r * 0.4, r * 0.17, -0.6, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export function buildBackground(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#2c2674');
  base.addColorStop(0.55, '#1e1a55');
  base.addColorStop(1, '#130f36');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.6);
  g.addColorStop(0, 'rgba(150,130,255,0.22)');
  g.addColorStop(1, 'rgba(150,130,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(11), u = Math.max(1, w / 400);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`;
    const d = u * (1 + r() * 1.6);
    ctx.fillRect(r() * w, r() * h, d, d);
  }
  return c;
}
