// Фон титульного экрана: изредка появляются фигурки и тихо взрываются — едва заметно.
// Канвас почти прозрачный (opacity в CSS), рисуем ~30 fps и только пока экран виден.
import { parseCharge, NORMAL } from './logic.js';
import { buildBlockSprites } from './sprites.js';
import { FX } from './fx.js';

const SHAPES = ['##/##', '####', '###/.#.', '#../###', '..#/###', '.##/##.', '##./.##', '#/#/#/#', '#./##/#.', '###', '##/#.'].map(parseCharge);
const KINDS = ['basic', 'fire', 'laser'];
const SPARKS = ['#fff6c8', '#ffd24a', '#ff9f2e', '#ff5ec8', '#45e6ff'];
const MAX_PIECES = 3;

export class TitleBg {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new FX();
    this.fx.quality = 0.6;
    this.pieces = [];
    this.running = false;
    this.spawnIn = 0.8;
    this.tick = this.tick.bind(this);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth;
    this.H = this.cv.clientHeight;
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.cell = Math.round(Math.min(30, Math.max(18, this.W / 14)));
    this.sprites = buildBlockSprites(Math.round(this.cell * this.dpr));
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.sprites || this.W !== this.cv.clientWidth || this.H !== this.cv.clientHeight) this.resize();
    this.last = this.lastDraw = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() { this.running = false; }

  spawn() {
    const { W, H, cell } = this;
    const ch = SHAPES[(Math.random() * SHAPES.length) | 0];
    const w = ch.w * cell, h = ch.h * cell;
    // не лезем в центр, где логотип и кнопки
    let x = 0, y = 0;
    for (let k = 0; k < 8; k++) {
      x = Math.random() * (W - w);
      y = Math.random() * (H - h);
      const cx = x + w / 2, cy = y + h / 2;
      if (cx < W * 0.18 || cx > W * 0.82 || cy < H * 0.22 || cy > H * 0.78) break;
    }
    const kind = Math.random() < 0.65 ? null : KINDS[(Math.random() * KINDS.length) | 0];
    this.pieces.push({
      ch, x, y, t: 0,
      life: 1.4 + Math.random() * 1.8,
      spr: kind ? this.sprites.charge[kind] : this.sprites[NORMAL],
      drift: (Math.random() - 0.5) * 8,
    });
  }

  explode(p) {
    const c = this.cell;
    const cx = p.x + p.ch.w * c / 2, cy = p.y + p.ch.h * c / 2;
    for (const [x, y] of p.ch.cells) {
      const px = p.x + x * c, py = p.y + y * c;
      this.fx.shatter(p.spr, px, py, c, cx, cy + c * 0.3, 0.45);
      this.fx.sparks(px + c / 2, py + c / 2, 2, SPARKS, 0.5);
    }
    this.fx.ring(cx, cy, c * 2, 'rgba(255,230,180,', 0.4, 3);
  }

  tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    // ~30 fps: фону больше не нужно, батарее приятнее
    if (now - this.lastDraw < 30) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = this.lastDraw = now;

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.pieces.length < MAX_PIECES) {
      this.spawn();
      this.spawnIn = 1.6 + Math.random() * 1.8;
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.t += dt;
      p.y += p.drift * dt;
      if (p.t >= p.life) { this.explode(p); this.pieces.splice(i, 1); }
    }
    this.fx.update(dt);
    this.render();
  }

  render() {
    const { ctx, dpr, cell: c } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of this.pieces) {
      const k = Math.min(1, p.t / 0.35);
      const s = c * (0.6 + 0.4 * (1 - (1 - k) * (1 - k)));
      const ox = p.x + (c - s) * p.ch.w / 2, oy = p.y + (c - s) * p.ch.h / 2;
      ctx.globalAlpha = k;
      for (const [x, y] of p.ch.cells) ctx.drawImage(p.spr, ox + x * s, oy + y * s, s, s);
      // перед взрывом вспыхивает
      const flash = 1 - (p.life - p.t) / 0.18;
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.8;
        ctx.fillStyle = '#fff';
        for (const [x, y] of p.ch.cells) ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
    ctx.globalAlpha = 1;
    this.fx.drawBack(ctx);
    this.fx.drawFront(ctx, dpr, 0, 0);
  }
}
