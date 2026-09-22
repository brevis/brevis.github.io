// Игровая сцена: раскладка, ввод (drag & drop), анимации взрывов, отмена, подсказки.
import { parseLevel, cloneBoard, canPlace, resolve, anyMove, blocksLeft, solve, NORMAL, TNT, STEEL } from './logic.js';
import { buildBlockSprites, buildBubble, buildPuff, buildBackground, makeCanvas, KIND_COLOR } from './sprites.js';
import { FX } from './fx.js';
import { sfx, haptic } from './audio.js';

const WAVE_GAP = 0.11;
const FUSE = 0.09;
const EASE = t => 1 - (1 - t) * (1 - t);
const SPARK = {
  basic: ['#fff6c8', '#ffd24a', '#ff9f2e', '#ffffff'],
  fire: ['#ffe08a', '#ff8a2a', '#ff4d1a', '#fff'],
  laser: ['#e8fdff', '#7de8ff', '#3fd6ff', '#fff'],
  tnt: ['#fff1a8', '#ffb02e', '#ff5a1f', '#ff2e1f'],
  steel: ['#ffffff', '#dfe6ee', '#aab4c0'],
};

export class Game {
  constructor(canvas, ui) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ui = ui;
    this.fx = new FX();
    this.dpr = 1;
    this.time = 0;
    this.timers = [];
    this.running = false;
    this.drag = null;
    this.back = null;
    this.hint = null;
    this.landing = null;
    this.frameTimes = [];
    this.def = null;
    this.tick = this.tick.bind(this);
    this.bindInput();
    this.resize();
  }

  // ---------- Жизненный цикл уровня ----------
  load(levelIndex, def) {
    this.levelIndex = levelIndex;
    this.def = def;
    const { board, charges } = parseLevel(def);
    this.initial = board;
    this.board = cloneBoard(board);
    this.vis = board.hp.slice();
    this.charges = charges;
    this.used = charges.map(() => false);
    this.spent = charges.map(() => false);
    this.history = [];
    this.moves = [];
    this.total = blocksLeft(board.hp);
    this.busy = false;
    this.over = false;
    this.drag = this.back = this.hint = this.landing = null;
    this.timers = [];
    this.fx = Object.assign(new FX(), { quality: this.fx.quality });
    this.layout();
    this.emitHud();
    this.requestFrame();
  }

  restart() { if (this.def) this.load(this.levelIndex, this.def); }

  get usedCount() { return this.used.filter(Boolean).length; }

  undo() {
    if (this.busy || !this.history.length) return false;
    const s = this.history.pop();
    this.board.hp = s.hp;
    this.used = s.used;
    this.moves.length = s.moves;
    this.vis = this.board.hp.slice();
    this.over = false;
    this.hint = null;
    this.renderBoardCache();
    this.emitHud();
    this.requestFrame();
    return true;
  }

  emitHud() {
    const left = blocksLeft(this.board.hp);
    this.ui.onHud({
      used: this.usedCount,
      par: this.def.par,
      total: this.charges.length,
      progress: 1 - left / this.total,
      canUndo: this.history.length > 0 && !this.busy,
    });
  }

  after(delay, fn) { this.timers.push({ t: this.time + delay, fn }); this.requestFrame(); }

  // ---------- Раскладка ----------
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.fx.quality < 0.7 ? 1.5 : 2);
    this.cv.width = Math.round(W * this.dpr);
    this.cv.height = Math.round(H * this.dpr);
    this.bg = buildBackground(this.cv.width, this.cv.height);
    if (this.def) this.layout();
    this.requestFrame();
  }

  layout() {
    const { W, H, dpr } = this;
    const n = this.charges.length;
    const rows = n > 5 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const slot = Math.min(96, (W - 16) / Math.max(perRow, 3));
    const D = Math.round(Math.min(86, slot * 0.92));
    const safeBottom = this.ui.safeBottom();
    const trayH = rows * (D + 6) + 20 + safeBottom;
    const trayTop = H - trayH;
    this.slots = this.charges.map((_, i) => {
      const row = Math.floor(i / perRow);
      const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
      const col = i - row * perRow;
      return { x: W / 2 + (col - (inRow - 1) / 2) * slot, y: trayTop + 10 + row * (D + 6) + D / 2, r: slot / 2 };
    });
    this.D = D;
    this.trayTop = trayTop;

    const top = this.ui.hudBottom() + 14;
    const bottom = trayTop - 22;
    const { w, h } = this.board;
    const cell = Math.floor(Math.min((W - 28) / w, (bottom - top) / h, 64));
    this.cell = cell;
    this.bx = Math.round((W - w * cell) / 2);
    this.by = Math.round(top + (bottom - top - h * cell) / 2);

    this.sprites = buildBlockSprites(Math.round(cell * dpr));
    this.bubbles = this.charges.map(ch => buildBubble(Math.round(D * dpr), ch, this.sprites));
    this.puff = buildPuff(Math.round(48 * dpr), '96,90,150');
    this.glow = buildPuff(Math.round(48 * dpr), '255,200,120');
    this.boardCache = makeCanvas(w * cell * dpr, h * cell * dpr);
    this.renderBoardCache();
  }

  renderBoardCache() {
    const ctx = this.boardCache.getContext('2d');
    const c = this.cell * this.dpr;
    const { w, h } = this.board;
    ctx.clearRect(0, 0, this.boardCache.width, this.boardCache.height);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const hp = this.vis[i];
      if (!hp) {
        if (this.initial.hp[i]) { ctx.fillStyle = 'rgba(140,150,255,0.09)'; ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2); }
        continue;
      }
      ctx.drawImage(this.spriteFor(i, hp), x * c, y * c, c, c);
    }
  }

  spriteFor(i, hp) {
    const t = this.board.type[i];
    if (t === STEEL) return hp >= 2 ? this.sprites[STEEL] : this.sprites.steelCracked;
    return this.sprites[t] || this.sprites[NORMAL];
  }

  // ---------- Ввод ----------
  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e), { passive: true });
    window.addEventListener('pointerup', e => this.onUp(e));
    window.addEventListener('pointercancel', e => this.onUp(e, true));
  }

  onDown(e) {
    if (!this.def || this.busy || this.over || this.drag) return;
    this.ui.onFirstTouch();
    const x = e.clientX, y = e.clientY;
    for (let k = 0; k < this.slots.length; k++) {
      if (this.used[k]) continue;
      const s = this.slots[k];
      if (Math.hypot(x - s.x, y - s.y) <= s.r) {
        this.drag = { k, x, y, t: 0, target: null, preview: null, id: e.pointerId };
        this.back = null;
        this.hint = null;
        try { this.cv.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        sfx.pick();
        haptic('light');
        this.updateTarget();
        this.requestFrame();
        return;
      }
    }
  }

  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY;
    this.updateTarget();
    this.requestFrame();
  }

  onUp(e, cancel = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!cancel && d.target) {
      this.place(d.k, d.target.x, d.target.y);
    } else {
      const p = this.piecePos(d);
      this.back = { k: d.k, x: p.x, y: p.y, t: 0 };
      if (d.y < this.trayTop - 10) sfx.invalid();
    }
    this.requestFrame();
  }

  lift(ch) { return ch.h * this.cell / 2 + Math.max(this.cell * 0.9, 42); }

  // центр фигурки заряда на экране
  piecePos(d) {
    const ch = this.charges[d.k];
    const s = this.slots[d.k];
    const k = EASE(Math.min(1, d.t / 0.1));
    const tx = d.x, ty = d.y - this.lift(ch);
    return { x: s.x + (tx - s.x) * k, y: s.y + (ty - s.y) * k };
  }

  updateTarget() {
    const d = this.drag;
    const ch = this.charges[d.k];
    const c = this.cell;
    const cx = d.x, cy = d.y - this.lift(ch);
    const fx0 = (cx - ch.w * c / 2 - this.bx) / c;
    const fy0 = (cy - ch.h * c / 2 - this.by) / c;
    let best = null, bestD = 0.95;
    for (let gy = Math.floor(fy0) - 1; gy <= Math.ceil(fy0) + 1; gy++) {
      for (let gx = Math.floor(fx0) - 1; gx <= Math.ceil(fx0) + 1; gx++) {
        const dist = Math.hypot(gx - fx0, gy - fy0);
        if (dist < bestD && canPlace(this.board, ch, gx, gy)) { best = { x: gx, y: gy }; bestD = dist; }
      }
    }
    const prev = d.target;
    if (best && (!prev || prev.x !== best.x || prev.y !== best.y)) {
      d.preview = resolve(this.board, ch, best.x, best.y);
      sfx.snap();
      haptic('light');
    }
    if (!best) d.preview = null;
    d.target = best;
  }

  // ---------- Ход ----------
  place(k, x, y) {
    const ch = this.charges[k];
    this.history.push({ hp: this.board.hp.slice(), used: this.used.slice(), moves: this.moves.length });
    const r = resolve(this.board, ch, x, y);
    this.board.hp = r.hp;
    this.used[k] = true;
    this.moves.push({ k, x, y });
    this.busy = true;
    this.hint = null;
    this.landing = { k, x, y, t: 0 };
    sfx.drop();
    haptic('light');
    this.emitHud();

    const waves = [];
    for (const e of r.events) (waves[e.t] || (waves[e.t] = [])).push(e);
    const stats = { destroyed: 0, tnt: 0, waves: waves.length };
    for (const e of r.events) { if (e.destroyed) stats.destroyed++; if (e.destroyed && e.type === TNT) stats.tnt++; }
    waves.forEach((evs, t) => {
      if (evs) this.after(FUSE + t * WAVE_GAP, () => this.applyWave(evs, t, ch, x, y));
    });
    this.after(FUSE + 0.02, () => { this.landing = null; });
    this.after(FUSE + (waves.length - 1) * WAVE_GAP + 0.38, () => this.afterMove(stats));
  }

  applyWave(evs, t, ch, ox, oy) {
    const { cell: c, bx, by, fx } = this;
    const w = this.board.w;
    let cx = 0, cy = 0, n = 0, hasTnt = false;
    for (const e of evs) {
      const x = e.i % w, y = (e.i / w) | 0;
      cx += bx + (x + 0.5) * c; cy += by + (y + 0.5) * c; n++;
    }
    cx /= n; cy /= n;

    if (t === 0 && ch.kind === 'laser') {
      const rows = new Set(ch.cells.map(([, y]) => oy + y));
      for (const y of rows) fx.flash(0, by + y * c + c * 0.2, this.W, c * 0.6, '#9ff0ff', 0.3);
      sfx.laser();
    }
    if (t === 1 && ch.kind === 'fire') sfx.fire();

    let destroyed = 0;
    for (const e of evs) {
      const x = e.i % w, y = (e.i / w) | 0;
      const px = bx + x * c, py = by + y * c;
      const spr = this.spriteFor(e.i, this.vis[e.i]);
      this.vis[e.i] = Math.max(0, this.vis[e.i] - 1);
      if (e.destroyed) {
        destroyed++;
        fx.shatter(spr, px, py, c, cx, cy + c * 0.3, 1);
        fx.flash(px, py, c, c, t === 1 && ch.kind === 'fire' ? '#ffb35c' : '#ffffff');
        const pal = e.type === TNT ? SPARK.tnt : t === 1 && ch.kind !== 'basic' ? SPARK[ch.kind] : SPARK.basic;
        fx.sparks(px + c / 2, py + c / 2, e.type === TNT ? 14 : 4, pal, e.type === TNT ? 1.4 : 1);
        if ((e.i + t) % 2 === 0) fx.smoke(this.puff, px + c / 2, py + c / 2, c * 1.6);
        if (e.type === TNT) {
          hasTnt = true;
          fx.ring(px + c / 2, py + c / 2, c * 2.2, 'rgba(255,190,90,', 0.4, 10);
          fx.smoke(this.glow, px + c / 2, py + c / 2, c * 3);
        }
      } else {
        fx.flash(px, py, c, c, '#dfe6ee');
        fx.sparks(px + c / 2, py + c / 2, 8, SPARK.steel, 0.8);
        sfx.crack();
      }
    }
    if (destroyed) {
      fx.ring(cx, cy, c * (1 + Math.sqrt(destroyed) * 0.8), 'rgba(255,240,200,', 0.35, 6);
      fx.shake(Math.min(16, 3 + destroyed * 0.7 + (hasTnt ? 5 : 0)), 0.25 + Math.min(0.25, destroyed * 0.02));
      sfx.boom(Math.min(1, destroyed / 10 + (hasTnt ? 0.3 : 0)), t);
      haptic(destroyed > 6 || hasTnt ? 'heavy' : 'medium');
    } else {
      fx.shake(3, 0.15);
    }
    this.renderBoardCache();
  }

  afterMove(stats) {
    this.busy = false;
    const left = blocksLeft(this.board.hp);
    const mx = this.bx + this.board.w * this.cell / 2;
    const my = this.by + this.board.h * this.cell / 2;
    if (stats.tnt >= 2) this.fx.text(`CHAIN REACTION ×${stats.tnt}!`, mx, my, { color: '#ffcf4a', size: Math.min(28, this.W / 13) });
    else if (stats.destroyed >= 10) this.fx.text('MASSIVE!', mx, my, { color: '#ffcf4a', size: 32 });
    else if (stats.destroyed >= 6) this.fx.text('BOOM!', mx, my, { color: '#fff', size: 26 });
    this.emitHud();
    if (!left) { this.win(); return; }
    if (!anyMove(this.board, this.charges, this.used)) {
      this.over = true;
      const noCharges = this.used.every(Boolean);
      sfx.fail();
      this.after(0.45, () => this.ui.onStuck(noCharges ? 'Out of charges' : 'No charge fits anywhere'));
      return;
    }
    if (this.def.intro === 'tutorial') this.showHint(this.hintMove(), true);
  }

  win() {
    this.over = true;
    const used = this.usedCount, par = this.def.par;
    const stars = used <= par ? 3 : used <= par + 1 ? 2 : 1;
    const mx = this.bx + this.board.w * this.cell / 2;
    const my = this.by + this.board.h * this.cell / 2;
    this.fx.text('CLEAR!', mx, my - 10, { color: '#7dffb0', size: 44, life: 1.4 });
    sfx.win();
    haptic('heavy');
    // оставшиеся заряды — салютом
    const left = this.charges.map((_, k) => k).filter(k => !this.used[k]);
    left.forEach((k, i) => this.after(0.45 + i * 0.28, () => {
      const s = this.slots[k];
      const col = SPARK[this.charges[k].kind];
      this.spent[k] = true;
      this.fx.sparks(s.x, s.y, 36, col, 1.3);
      this.fx.ring(s.x, s.y, this.D * 0.9, 'rgba(255,255,255,', 0.45, 8);
      this.fx.text('+BONUS', s.x, s.y - this.D * 0.6, { size: 18, color: '#ffe27a', life: 0.9 });
      sfx.firework(i);
      haptic('medium');
    }));
    this.after(0.9 + left.length * 0.28, () => this.ui.onWin({ stars, used, par, total: this.charges.length }));
  }

  // ---------- Подсказки ----------
  // Сначала пробуем «запечённое» решение уровня, если игрок пока ему следует,
  // иначе — короткий поиск от текущей позиции.
  hintMove() {
    const sig = k => this.charges[k].sig;
    const sol = (this.def.sol || '').split(';').filter(Boolean).map(s => { const [k, x, y] = s.split(',').map(Number); return { k, x, y }; });
    const rest = sol.slice();
    let follows = true;
    for (const m of this.moves) {
      const i = rest.findIndex(s => sig(s.k) === sig(m.k) && s.x === m.x && s.y === m.y);
      if (i < 0) { follows = false; break; }
      rest.splice(i, 1);
    }
    if (follows && rest.length) {
      let b = cloneBoard(this.board);
      const used = this.used.slice();
      let first = null, okSeq = true;
      for (const s of rest) {
        const k = this.charges.findIndex((c, j) => !used[j] && c.sig === sig(s.k));
        if (k < 0 || !canPlace(b, this.charges[k], s.x, s.y)) { okSeq = false; break; }
        if (!first) first = { k, x: s.x, y: s.y };
        b.hp = resolve(b, this.charges[k], s.x, s.y).hp;
        used[k] = true;
      }
      if (okSeq && !blocksLeft(b.hp)) return first;
    }
    const usedN = this.usedCount;
    if (this.def.par - usedN > 0) {
      const r = solve(this.board, this.charges, this.used, { maxNodes: 15000, firstOnly: true, limit: this.def.par - usedN });
      if (r.min) return r.path[0];
    }
    const r = solve(this.board, this.charges, this.used, { maxNodes: 25000, firstOnly: true });
    if (r.min) return r.path[0];
    return r.proven ? { dead: true } : null;
  }

  showHint(move, silent = false) {
    if (!move || move.dead) return false;
    this.hint = { ...move, t: 0, silent };
    this.requestFrame();
    return true;
  }

  // ---------- Цикл отрисовки (крутится только когда что-то движется) ----------
  requestFrame() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  needsFrame() {
    return !!(this.drag || this.back || this.hint || this.landing || this.timers.length || this.fx.busy);
  }

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
    this.watchPerf(dt);
    if (this.needsFrame()) requestAnimationFrame(this.tick);
    else { this.running = false; }
  }

  watchPerf(dt) {
    if (!this.fx.parts.length) { this.frameTimes.length = 0; return; }
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 40) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.024 && this.fx.quality > 0.4) this.fx.quality = Math.max(0.35, this.fx.quality - 0.25);
  }

  update(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter(t => t.t <= this.time);
      if (due.length) {
        this.timers = this.timers.filter(t => t.t > this.time);
        for (const t of due) t.fn();
      }
    }
    if (this.drag) this.drag.t += dt;
    if (this.back) { this.back.t += dt; if (this.back.t > 0.16) this.back = null; }
    if (this.hint) this.hint.t += dt;
    if (this.landing) this.landing.t += dt;
    this.fx.update(dt);
  }

  render() {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.bg, 0, 0);
    if (!this.def) return;
    const [sx, sy] = this.fx.shakeOffset();
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    const bw = this.board.w * this.cell, bh = this.board.h * this.cell;
    ctx.drawImage(this.boardCache, this.bx, this.by, bw, bh);

    if (this.drag && this.drag.target) this.drawPreview(this.drag.k, this.drag.target, this.drag.preview, 1);
    else if (this.hint) this.drawPreview(this.hint.k, this.hint, null, 0.5 + 0.5 * Math.sin(this.hint.t * 7));
    if (this.landing) this.drawLanding();

    this.fx.drawBack(ctx);
    this.fx.drawFront(ctx, dpr, sx, sy);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTray();
    if (this.back) this.drawBack();
    if (this.drag) this.drawDrag();
    if (this.hint) this.drawHint();
    this.fx.drawTexts(ctx);
  }

  drawPiece(ch, cx, cy, size, alpha) {
    const ctx = this.ctx;
    const spr = this.sprites.charge[ch.kind];
    const x0 = cx - ch.w * size / 2, y0 = cy - ch.h * size / 2;
    ctx.globalAlpha = alpha;
    const pad = Math.max(2, size * 0.08);
    ctx.fillStyle = KIND_COLOR[ch.kind].glow + '0.45)';
    for (const [x, y] of ch.cells) ctx.fillRect(x0 + x * size - pad, y0 + y * size - pad, size + pad * 2, size + pad * 2);
    for (const [x, y] of ch.cells) ctx.drawImage(spr, x0 + x * size, y0 + y * size, size, size);
    ctx.globalAlpha = 1;
  }

  drawPreview(k, target, preview, pulse) {
    const ctx = this.ctx, c = this.cell, w = this.board.w;
    const ch = this.charges[k];
    if (preview) {
      const alpha = 0.3 + 0.12 * Math.sin(this.time * 12);
      for (const e of preview.events) {
        const x = e.i % w, y = (e.i / w) | 0;
        const px = this.bx + x * c, py = this.by + y * c;
        if (e.destroyed) {
          ctx.fillStyle = e.t === 0 ? `rgba(255,255,255,${alpha + 0.1})` : `rgba(255,110,40,${alpha + 0.12})`;
          ctx.fillRect(px, py, c, c);
        } else {
          ctx.strokeStyle = 'rgba(255,230,90,0.95)';
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 2.5, py + 2.5, c - 5, c - 5);
        }
      }
    }
    ctx.strokeStyle = KIND_COLOR[ch.kind].rim;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.lineWidth = 3;
    for (const [x, y] of ch.cells) ctx.strokeRect(this.bx + (target.x + x) * c + 1.5, this.by + (target.y + y) * c + 1.5, c - 3, c - 3);
    ctx.globalAlpha = 1;
    if (preview) {
      let n = 0;
      for (const e of preview.events) if (e.destroyed) n++;
      const tx = this.bx + (target.x + ch.w / 2) * c, ty = this.by + target.y * c - 14;
      ctx.font = '900 18px system-ui, -apple-system, Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,30,0.8)';
      ctx.strokeText(`💥${n}`, tx, ty);
      ctx.fillStyle = '#fff';
      ctx.fillText(`💥${n}`, tx, ty);
    }
  }

  drawLanding() {
    const L = this.landing, ch = this.charges[L.k], c = this.cell;
    const k = Math.min(1, L.t / FUSE);
    const s = c * (1.12 - 0.12 * k);
    const cx = this.bx + (L.x + ch.w / 2) * c, cy = this.by + (L.y + ch.h / 2) * c;
    this.drawPiece(ch, cx, cy, s, 1);
    this.ctx.globalAlpha = k * 0.8;
    this.ctx.fillStyle = '#fff';
    const x0 = cx - ch.w * s / 2, y0 = cy - ch.h * s / 2;
    for (const [x, y] of ch.cells) this.ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
    this.ctx.globalAlpha = 1;
  }

  drawTray() {
    const ctx = this.ctx, D = this.D;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (this.spent[k] || (this.used[k] && !(this.landing && this.landing.k === k))) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, D * 0.4, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const dragging = (this.drag && this.drag.k === k) || (this.back && this.back.k === k) || (this.landing && this.landing.k === k);
      let scale = 1;
      if (this.hint && this.hint.k === k) scale = 1 + 0.06 * Math.sin(this.hint.t * 8);
      ctx.globalAlpha = dragging ? 0.3 : 1;
      const d = D * scale;
      ctx.drawImage(this.bubbles[k], s.x - d / 2, s.y - d / 2, d, d);
      ctx.globalAlpha = 1;
    }
  }

  drawDrag() {
    const d = this.drag, ch = this.charges[d.k];
    const p = this.piecePos(d);
    const k = EASE(Math.min(1, d.t / 0.1));
    const small = Math.min(this.D * 0.56 / ch.w, this.D * 0.56 / ch.h, this.D * 0.19);
    const size = small + (this.cell - small) * k;
    this.drawPiece(ch, p.x, p.y, size, d.target ? 0.95 : 0.8);
    // над фигурой, но не помещается — подкрасим красным
    const c = this.cell;
    const over = !d.target && p.x > this.bx - c && p.x < this.bx + (this.board.w + 1) * c &&
      p.y > this.by - c && p.y < this.by + (this.board.h + 1) * c;
    if (over) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(255,60,60,0.45)';
      const x0 = p.x - ch.w * size / 2, y0 = p.y - ch.h * size / 2;
      for (const [x, y] of ch.cells) ctx.fillRect(x0 + x * size, y0 + y * size, size, size);
    }
  }

  drawBack() {
    const b = this.back, ch = this.charges[b.k], s = this.slots[b.k];
    const k = EASE(Math.min(1, b.t / 0.16));
    const small = Math.min(this.D * 0.56 / ch.w, this.D * 0.56 / ch.h, this.D * 0.19);
    const size = this.cell + (small - this.cell) * k;
    this.drawPiece(ch, b.x + (s.x - b.x) * k, b.y + (s.y - b.y) * k, size, 0.9);
  }

  drawHint() {
    const h = this.hint, ch = this.charges[h.k], s = this.slots[h.k], c = this.cell;
    const T = 1.9;
    const ph = (h.t % T) / T;
    const ex = this.bx + (h.x + ch.w / 2) * c, ey = this.by + (h.y + ch.h / 2) * c;
    let m, alpha;
    if (ph < 0.15) { m = 0; alpha = ph / 0.15; }
    else if (ph < 0.6) { m = EASE((ph - 0.15) / 0.45); alpha = 1; }
    else if (ph < 0.88) { m = 1; alpha = 1; }
    else { m = 1; alpha = 1 - (ph - 0.88) / 0.12; }
    const small = Math.min(this.D * 0.56 / ch.w, this.D * 0.56 / ch.h, this.D * 0.19);
    const size = small + (c - small) * m;
    const px = s.x + (ex - s.x) * m, py = s.y + (ey - s.y) * m;
    this.drawPiece(ch, px, py, size, 0.65 * alpha);
    // «палец»
    const lift = this.lift(ch) * m;
    const ctx = this.ctx;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py + lift, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py + lift, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
