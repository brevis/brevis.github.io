// Все спрайты рисуются один раз в offscreen-канвасы (дешёвый drawImage в кадре,
// никаких shadowBlur/фильтров в рантайме — важно для слабых телефонов).
import { NORMAL, TNT, STEEL, ICE } from './logic.js';

export const KIND_COLOR = {
  basic: { rim: '#ff5ec8', glow: 'rgba(255,94,200,' },
  fire: { rim: '#ff9a2e', glow: 'rgba(255,154,46,' },
  laser: { rim: '#45e6ff', glow: 'rgba(69,230,255,' },
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Детерминированный rng: пузырьки в шарах одинаковые при каждой отрисовке.
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

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

// Стилизованный «игрушечный» металл: скругления, чистая фаска, глянец, круглые заклёпки.
const TOY = {
  blue: { edge: '#1a2766', rim: '#c7d6ff', top: '#9ab6ff', bot: '#5f80e6', face0: '#a9c3ff', face1: '#7394f0', rivet: '#2a3b8f' },
  steel: { edge: '#1c2029', rim: '#e9eef5', top: '#b9c2cf', bot: '#737f90', face0: '#c9d1dc', face1: '#8893a3', rivet: '#2b313d' },
};

function toyBlock(ctx, s, p, opts = {}) {
  const b = Math.max(1, s * 0.06);
  const r = s * 0.16;
  rrect(ctx, 0, 0, s, s, r);
  ctx.fillStyle = p.edge;
  ctx.fill();
  // фаска: светлая кромка сверху, тёмная снизу
  let g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, p.rim);
  g.addColorStop(0.5, p.top);
  g.addColorStop(1, p.bot);
  rrect(ctx, b, b, s - b * 2, s - b * 2, r * 0.8);
  ctx.fillStyle = g;
  ctx.fill();
  // лицевая пластина
  const inset = s * 0.14;
  g = ctx.createLinearGradient(0, inset, 0, s - inset);
  g.addColorStop(0, p.face0);
  g.addColorStop(1, p.face1);
  rrect(ctx, inset, inset * 0.9, s - inset * 2, s - inset * 2.1, r * 0.5);
  ctx.fillStyle = g;
  ctx.fill();
  // глянцевый блик
  rrect(ctx, inset * 1.25, inset * 1.05, s - inset * 2.5, s * 0.2, s * 0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  // круглые заклёпки
  const rv = s * (opts.bigRivets ? 0.065 : 0.05);
  const d = s * 0.11;
  for (const [x, y] of [[d, d], [s - d, d], [d, s - d], [s - d, s - d]]) {
    ctx.fillStyle = p.rivet;
    ctx.beginPath(); ctx.arc(x, y, rv, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x - rv * 0.3, y - rv * 0.3, rv * 0.38, 0, Math.PI * 2); ctx.fill();
  }
}

function tntBlock(ctx, s) {
  const b = Math.max(1, s * 0.06);
  const r = s * 0.16;
  rrect(ctx, 0, 0, s, s, r);
  ctx.fillStyle = '#5a0d04';
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#ffb09a');
  g.addColorStop(0.35, '#ff5a36');
  g.addColorStop(1, '#c21f0c');
  rrect(ctx, b, b, s - b * 2, s - b * 2, r * 0.8);
  ctx.fillStyle = g;
  ctx.fill();
  // палочки динамита
  ctx.fillStyle = 'rgba(120,10,0,0.35)';
  for (let k = 1; k < 3; k++) ctx.fillRect(s * k / 3 - s * 0.012, b * 2, s * 0.024, s - b * 4);
  // этикетка
  rrect(ctx, s * 0.1, s * 0.33, s * 0.8, s * 0.34, s * 0.07);
  ctx.fillStyle = '#fff4dc';
  ctx.fill();
  ctx.fillStyle = '#c21f0c';
  ctx.font = `900 ${Math.round(s * 0.27)}px system-ui, -apple-system, Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TNT', s / 2, s * 0.51);
  // блик
  rrect(ctx, s * 0.16, b * 2, s * 0.68, s * 0.14, s * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
}

// Лёд: бледный полупрозрачный блок с гранями, изморозью и снежинкой.
function iceBlock(ctx, s) {
  const b = Math.max(1, s * 0.06);
  const r = s * 0.16;
  rrect(ctx, 0, 0, s, s, r);
  ctx.fillStyle = '#2b7fa6';
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#f4fdff');
  g.addColorStop(0.45, '#b9ecfb');
  g.addColorStop(1, '#6fc6e6');
  rrect(ctx, b, b, s - b * 2, s - b * 2, r * 0.8);
  ctx.fillStyle = g;
  ctx.fill();
  // грань-скол
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(b * 2, b * 2); ctx.lineTo(s * 0.62, b * 2); ctx.lineTo(b * 2, s * 0.62);
  ctx.closePath(); ctx.fill();
  // изморозь
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(s * 0.62, s * 0.8); ctx.lineTo(s * 0.82, s * 0.6);
  ctx.moveTo(s * 0.72, s * 0.86); ctx.lineTo(s * 0.86, s * 0.72);
  ctx.stroke();
  // снежинка
  const c = s / 2, R = s * 0.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3 + Math.PI / 2;
    const dx = Math.cos(a) * R, dy = Math.sin(a) * R;
    ctx.moveTo(c - dx, c - dy); ctx.lineTo(c + dx, c + dy);
    for (const sgn of [1, -1]) {
      const ex = c + sgn * dx * 0.6, ey = c + sgn * dy * 0.6;
      const ba = a + (sgn > 0 ? 0 : Math.PI);
      ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(ba + 0.7) * R * 0.35, ey + Math.sin(ba + 0.7) * R * 0.35);
      ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(ba - 0.7) * R * 0.35, ey + Math.sin(ba - 0.7) * R * 0.35);
    }
  }
  ctx.stroke();
}

function steelBlock(ctx, s, cracked) {
  toyBlock(ctx, s, TOY.steel, { bigRivets: true });
  // крест-усиление
  ctx.strokeStyle = 'rgba(40,48,60,0.3)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, s * 0.07);
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
    [NORMAL]: mk((ctx, s) => toyBlock(ctx, s, TOY.blue)),
    [TNT]: mk(tntBlock),
    [STEEL]: mk((ctx, s) => steelBlock(ctx, s, false)),
    [ICE]: mk(iceBlock),
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
