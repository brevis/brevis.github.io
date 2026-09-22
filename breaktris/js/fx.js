// Частицы с пулом объектов и адаптивным качеством (на слабых устройствах частиц меньше).

export class FX {
  constructor() {
    this.parts = [];
    this.pool = [];
    this.rings = [];
    this.flashes = [];
    this.texts = [];
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.quality = 1;
    this.max = 420;
  }

  get busy() {
    return this.parts.length || this.rings.length || this.flashes.length || this.texts.length || this.shakeT > 0;
  }

  _get() { return this.pool.pop() || {}; }

  _add(p) {
    if (this.parts.length >= this.max * this.quality) { this.pool.push(p); return; }
    this.parts.push(p);
  }

  // Осколки: четвертинки спрайта блока разлетаются с вращением.
  shatter(sprite, x, y, c, cx, cy, power = 1) {
    const q = this.quality;
    const n = q < 0.6 ? 2 : 4;
    const sw = sprite.width / 2;
    for (let k = 0; k < n; k++) {
      const qx = k % 2, qy = (k / 2) | 0;
      const px = x + (qx + 0.5) * c / 2, py = y + (qy + 0.5) * c / 2;
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const sp = (140 + Math.random() * 260) * power;
      const p = this._get();
      p.t = 0; p.kind = 0; p.img = sprite;
      p.sx = qx * sw; p.sy = qy * sw; p.sw = sw;
      p.x = px; p.y = py; p.size = c / 2;
      p.vx = dx * sp + (Math.random() - 0.5) * 120;
      p.vy = dy * sp - 180 - Math.random() * 220;
      p.rot = 0; p.vr = (Math.random() - 0.5) * 16;
      p.life = 0.7 + Math.random() * 0.4;
      this._add(p);
    }
  }

  sparks(x, y, count, colors, speed = 1) {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 420) * speed;
      const p = this._get();
      p.t = 0; p.kind = 1;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 60;
      p.size = 2 + Math.random() * 3.5;
      p.color = colors[(Math.random() * colors.length) | 0];
      p.life = 0.25 + Math.random() * 0.45;
      this._add(p);
    }
  }

  smoke(puff, x, y, size) {
    if (this.quality < 0.5) return;
    const p = this._get();
    p.t = 0; p.kind = 2; p.img = puff;
    p.x = x + (Math.random() - 0.5) * size * 0.4; p.y = y + (Math.random() - 0.5) * size * 0.4;
    p.vx = (Math.random() - 0.5) * 30; p.vy = -20 - Math.random() * 30;
    p.size = size * (0.8 + Math.random() * 0.5);
    p.life = 0.6 + Math.random() * 0.4;
    this._add(p);
  }

  ring(x, y, r, color = 'rgba(255,240,200,', life = 0.35, width = 6) {
    this.rings.push({ x, y, r, color, life, width, t: 0 });
  }

  flash(x, y, w, h = w, color = '#fff', life = 0.16) {
    this.flashes.push({ x, y, w, h, color, t: 0, life });
  }

  text(str, x, y, opts = {}) {
    this.texts.push({ str, x, y, t: 0, life: opts.life || 1.1, size: opts.size || 26, color: opts.color || '#fff', rise: opts.rise ?? 50 });
  }

  shake(amp, dur = 0.3) {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = Math.max(this.shakeT, dur);
    this.shakeDur = Math.max(this.shakeT, dur);
  }

  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeT / (this.shakeDur || 1);
    const a = this.shakeAmp * k * k;
    return [(Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a];
  }

  update(dt) {
    const g = 900;
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); this.pool.push(p); continue; }
      if (p.kind === 2) { p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      p.vy += g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 0) p.rot += p.vr * dt;
      else { p.vx *= 0.96; }
    }
    for (const list of [this.rings, this.flashes, this.texts]) {
      for (let i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t >= list[i].life) list.splice(i, 1); }
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  drawBack(ctx) {
    // дым и вспышки — под осколками
    for (const p of this.parts) {
      if (p.kind !== 2) continue;
      const k = p.t / p.life;
      const s = p.size * (1 + k * 0.8);
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.drawImage(p.img, p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const f of this.flashes) {
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.globalAlpha = 1;
  }

  drawFront(ctx, dpr, ox, oy) {
    for (const p of this.parts) {
      const k = p.t / p.life;
      if (p.kind === 0) {
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, (p.x + ox) * dpr, (p.y + oy) * dpr);
        const h = p.size / 2;
        ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sw, -h, -h, p.size, p.size);
      } else if (p.kind === 1) {
        ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        const s = p.size * (1 - k * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color + (1 - k) + ')';
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - (k - 0.12) / 0.08 * 0.15 : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const size = Math.round(t.size * pop);
      ctx.font = `900 ${size}px system-ui, -apple-system, Roboto, sans-serif`;
      const y = t.y - t.rise * Math.min(1, k * 1.5);
      ctx.lineWidth = Math.max(3, size * 0.18);
      ctx.strokeStyle = 'rgba(30,10,40,0.85)';
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
