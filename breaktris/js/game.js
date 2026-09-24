// Игровая сцена: раскладка, ввод (drag & drop), анимации взрывов, отмена, подсказки.
import { parseLevel, cloneBoard, canPlace, resolve, anyMove, blocksLeft, solve, NORMAL, TNT, STEEL, ICE } from './logic.js';
import { buildBlockSprites, buildTrayPiece, buildPuff, makeCanvas, KIND_COLOR } from './sprites.js';
import { FX } from './fx.js';
import { sfx, haptic } from './audio.js';

const WAVE_GAP = 0.11;
const COL_MAX = 520; // ширина игровой колонки на десктопе (должна совпадать с --col в CSS)
// Очки: блок — 10, в волнах цепочки дороже, обвалившийся блок — 15.
// Ходы подряд с большим взрывом (6+ блоков) дают комбо-множитель.
const PTS_BLOCK = 10, PTS_FALL = 15, BIG_MOVE = 6;
const PTS_SPARE = 100, PTS_PERFECT = 250;
const FUSE = 0.09;
const EASE = t => 1 - (1 - t) * (1 - t);
const backOut = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rrectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const SPARK = {
  basic: ['#fff6c8', '#ffd24a', '#ff9f2e', '#ffffff'],
  fire: ['#ffe08a', '#ff8a2a', '#ff4d1a', '#fff'],
  laser: ['#e8fdff', '#7de8ff', '#3fd6ff', '#fff'],
  tnt: ['#fff1a8', '#ffb02e', '#ff5a1f', '#ff2e1f'],
  steel: ['#ffffff', '#dfe6ee', '#aab4c0'],
  ice: ['#ffffff', '#e6fbff', '#9fe6ff', '#6fcbea'],
};

export class Game {
  constructor(canvas, ui) {
    this.cv = canvas;
    // канвас прозрачный: под ним CSS-фон с медленно плывущими квадратиками (#game-bg)
    this.ctx = canvas.getContext('2d');
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
    this.hitstop = 0;     // короткий стоп-кадр на больших взрывах
    this.slowT = 0;       // замедление на финальном взрыве (реальные секунды)
    this.punch = 0;       // толчок камеры
    this.score = 0;
    this.streak = 0;
    this.blitz = null;    // { time, total, cleared } в режиме Blitz
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
    this.loadTime = this.time;
    this.score = 0;
    this.streak = 0;
    this.hitstop = this.slowT = this.punch = 0;
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
      score: this.blitz ? this.blitz.total + this.score : this.score,
    });
  }

  after(delay, fn) { this.timers.push({ t: this.time + delay, fn }); this.requestFrame(); }

  // ---------- Раскладка ----------
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    // на широких экранах игра живёт в центральной колонке шириной с телефон
    this.colW = Math.min(W, COL_MAX);
    this.colX = Math.round((W - this.colW) / 2);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.fx.quality < 0.7 ? 1.5 : 2);
    this.cv.width = Math.round(W * this.dpr);
    this.cv.height = Math.round(H * this.dpr);
    if (this.def) this.layout();
    this.requestFrame();
  }

  layout() {
    const { W, H, dpr } = this;
    // лоток: тёмная панель внизу, заряды лежат прямо на ней крупными фигурами
    const n = this.charges.length;
    const rows = n > 4 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const pad = 12;
    const slotW = (this.colW - pad * 2) / Math.max(perRow, 3);
    const slotH = Math.round(Math.min(84, slotW * 0.9));
    const safeBottom = this.ui.safeBottom();
    const trayH = rows * slotH + 26 + safeBottom;
    const trayTop = H - trayH;
    this.slots = this.charges.map((_, i) => {
      const row = Math.floor(i / perRow);
      const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
      const col = i - row * perRow;
      return { x: W / 2 + (col - (inRow - 1) / 2) * slotW, y: trayTop + 16 + row * slotH + slotH / 2, w: slotW, h: slotH };
    });
    this.D = slotH * 0.9;
    this.slotW = slotW; this.slotH = slotH;
    this.trayTop = trayTop;

    const top = this.ui.hudBottom() + 14;
    const bottom = trayTop - 22;
    const { w, h } = this.board;
    const cell = Math.floor(Math.min((this.colW - 28) / w, (bottom - top) / h, 64));
    this.cell = cell;
    this.bx = Math.round((W - w * cell) / 2);
    this.by = Math.round(top + (bottom - top - h * cell) / 2);

    this.sprites = buildBlockSprites(Math.round(cell * dpr));
    this.trayCells = this.charges.map(ch => Math.min(this.slotW * 0.8 / ch.w, this.slotH * 0.78 / Math.max(ch.h, 2), cell * 0.66, 26));
    this.trayPieces = this.charges.map((ch, k) => buildTrayPiece(Math.round(this.slotW * dpr), Math.round(this.slotH * dpr), ch, this.sprites, this.trayCells[k] * dpr));
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
      if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(y - s.y) <= s.h / 2) {
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
    this.punch = Math.min(1, this.punch + 0.15);
    sfx.drop();
    haptic('light');
    this.emitHud();

    const waves = [];
    for (const e of r.events) (waves[e.t] || (waves[e.t] = [])).push(e);
    const stats = { destroyed: 0, tnt: 0, fell: 0, waves: waves.length, points: 0 };
    let raw = 0;
    for (const e of r.events) {
      if (!e.destroyed) continue;
      stats.destroyed++;
      if (e.type === TNT && !e.fell) stats.tnt++;
      if (e.fell) { stats.fell++; raw += PTS_FALL; } else raw += PTS_BLOCK * (1 + e.t * 0.5);
    }
    stats.mult = 1 + 0.5 * this.streak;
    stats.points = Math.round(raw * stats.mult);
    stats.cx = this.bx + (x + ch.w / 2) * this.cell;
    stats.cy = this.by + (y + ch.h / 2) * this.cell;
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
      for (const y of rows) fx.flash(this.colX, by + y * c + c * 0.2, this.colW, c * 0.6, '#9ff0ff', 0.3);
      sfx.laser();
    }
    if (t === 1 && ch.kind === 'fire') sfx.fire();

    let destroyed = 0, melted = 0;
    if (evs[0].fell) { this.applyCollapse(evs); return; }
    for (const e of evs) {
      const x = e.i % w, y = (e.i / w) | 0;
      const px = bx + x * c, py = by + y * c;
      const spr = this.spriteFor(e.i, this.vis[e.i]);
      this.vis[e.i] = Math.max(0, this.vis[e.i] - 1);
      if (e.destroyed) {
        destroyed++;
        fx.shatter(spr, px, py, c, cx, cy + c * 0.3, 1);
        fx.flash(px, py, c, c, t === 1 && ch.kind === 'fire' ? '#ffb35c' : '#ffffff');
        const pal = e.type === TNT ? SPARK.tnt : e.type === ICE ? SPARK.ice : t === 1 && ch.kind !== 'basic' ? SPARK[ch.kind] : SPARK.basic;
        fx.sparks(px + c / 2, py + c / 2, e.type === TNT ? 14 : e.type === ICE ? 8 : 4, pal, e.type === TNT ? 1.4 : 1);
        if (e.type === ICE) melted++;
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
    if (melted) sfx.crack();
    if (destroyed) {
      fx.ring(cx, cy, c * (1 + Math.sqrt(destroyed) * 0.8), 'rgba(255,240,200,', 0.35, 6);
      fx.shake(Math.min(16, 3 + destroyed * 0.7 + (hasTnt ? 5 : 0)), 0.25 + Math.min(0.25, destroyed * 0.02));
      sfx.boom(Math.min(1, destroyed / 10 + (hasTnt ? 0.3 : 0)), t + this.streak);
      haptic(destroyed > 6 || hasTnt ? 'heavy' : 'medium');
      // большой взрыв — короткий стоп-кадр и толчок камеры
      if (destroyed >= 6 || hasTnt) this.hitstop = Math.max(this.hitstop, destroyed >= 12 ? 0.09 : 0.06);
      this.punch = Math.min(1, this.punch + 0.25 + destroyed * 0.04);
    } else {
      fx.shake(3, 0.15);
    }
    this.renderBoardCache();
  }

  // Обвал: отрезанные куски срываются и падают (снизу вверх, с небольшой задержкой).
  applyCollapse(evs) {
    const { cell: c, bx, by, fx } = this;
    const w = this.board.w;
    let maxY = 0;
    for (const e of evs) maxY = Math.max(maxY, (e.i / w) | 0);
    for (const e of evs) {
      const x = e.i % w, y = (e.i / w) | 0;
      const spr = this.spriteFor(e.i, this.vis[e.i]);
      this.vis[e.i] = 0;
      fx.fall(spr, bx + x * c, by + y * c, c, (maxY - y) * 0.035 + Math.random() * 0.04);
      if ((e.i + y) % 3 === 0) fx.smoke(this.puff, bx + (x + 0.5) * c, by + (y + 0.9) * c, c * 1.4);
    }
    fx.shake(Math.min(12, 4 + evs.length * 0.4), 0.35);
    sfx.collapse(evs.length);
    haptic('heavy');
    this.renderBoardCache();
  }

  afterMove(stats) {
    this.busy = false;
    const left = blocksLeft(this.board.hp);
    const mx = this.bx + this.board.w * this.cell / 2;
    const my = this.by + this.board.h * this.cell / 2;
    // выкрики нарастают вместе с силой взрыва
    const tilt = (Math.random() - 0.5) * 0.18;
    const big = Math.min(34, this.colW / 11);
    if (stats.fell >= 3) this.fx.text(`COLLAPSE! +${stats.fell}`, mx, my - 30, { color: '#8fe8ff', size: big, tilt });
    else if (stats.tnt >= 2) this.fx.text(`CHAIN ×${stats.tnt}!`, mx, my - 30, { color: '#ffcf4a', size: big, tilt });
    else if (stats.destroyed >= 16) this.fx.text('INSANE!', mx, my - 30, { color: '#ff5ec8', size: big + 6, tilt });
    else if (stats.destroyed >= 10) this.fx.text('MEGA!', mx, my - 30, { color: '#ffcf4a', size: big + 2, tilt });
    else if (stats.destroyed >= BIG_MOVE) this.fx.text('BOOM!', mx, my - 30, { color: '#fff', size: big - 4, tilt });
    // очки хода
    this.score += stats.points;
    this.fx.text(`+${stats.points}`, stats.cx, stats.cy, { color: stats.mult > 1 ? '#ffcf4a' : '#ffffff', size: 22, rise: 70, life: 1 });
    if (stats.mult > 1) { this.fx.text(`COMBO ×${stats.mult}`, stats.cx, stats.cy + 26, { color: '#ff9a2e', size: 18, rise: 60, life: 1 }); sfx.combo(this.streak); }
    this.streak = stats.destroyed >= BIG_MOVE ? this.streak + 1 : 0;
    this.emitHud();
    if (!left) { this.finalBlow(mx, my); return; }
    if (!anyMove(this.board, this.charges, this.used)) {
      this.over = true;
      const noCharges = this.used.every(Boolean);
      sfx.fail();
      this.after(0.45, () => this.ui.onStuck(noCharges ? 'Out of charges' : 'No charge fits anywhere'));
      return;
    }
    if (this.def.intro === 'tutorial') this.showHint(this.hintMove(), true);
  }

  // Последний блок: замедление, конфетти, затем победа.
  finalBlow(mx, my) {
    this.over = true;
    this.slowT = 0.7;
    this.fx.confetti(mx, my, 70);
    this.fx.flash(0, 0, this.W, this.H, 'rgba(255,255,255,0.35)', 0.25);
    this.punch = 1;
    this.after(0.35, () => this.win());
  }

  win() {
    this.over = true;
    const used = this.usedCount, par = this.def.par;
    const stars = used <= par ? 3 : used <= par + 1 ? 2 : 1;
    const mx = this.bx + this.board.w * this.cell / 2;
    const my = this.by + this.board.h * this.cell / 2;
    this.fx.text('CLEAR!', mx, my - 10, { color: '#7dffb0', size: 46, life: 1.4, tilt: -0.08 });
    sfx.win();
    haptic('heavy');
    if (used <= par) { this.score += PTS_PERFECT; this.fx.text(`PERFECT +${PTS_PERFECT}`, mx, my + 34, { color: '#ffcf4a', size: 20, life: 1.4 }); }
    if (this.blitz) {
      // Blitz: без салюта и окна — сразу следующая фигура
      this.emitHud();
      this.after(0.55, () => this.ui.onBlitzClear());
      return;
    }
    // оставшиеся заряды — салютом
    const left = this.charges.map((_, k) => k).filter(k => !this.used[k]);
    left.forEach((k, i) => this.after(0.45 + i * 0.28, () => {
      const s = this.slots[k];
      const col = SPARK[this.charges[k].kind];
      this.spent[k] = true;
      this.fx.sparks(s.x, s.y, 36, col, 1.3);
      this.fx.ring(s.x, s.y, this.D * 0.9, 'rgba(255,255,255,', 0.45, 8);
      this.fx.text(`+${PTS_SPARE}`, s.x, s.y - this.D * 0.6, { size: 20, color: '#ffe27a', life: 0.9 });
      this.score += PTS_SPARE;
      this.emitHud();
      sfx.firework(i);
      haptic('medium');
    }));
    this.after(0.9 + left.length * 0.28, () => this.ui.onWin({ stars, used, par, total: this.charges.length, score: this.score }));
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
    return !!(this.drag || this.back || this.hint || this.landing || this.timers.length || this.fx.busy ||
      this.time - this.loadTime < 0.8 || this.punch > 0.01 || this.slowT > 0 || (this.blitz && this.blitz.running));
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
    // Blitz: таймер идёт в реальном времени
    if (this.blitz && this.blitz.running) {
      const before = Math.ceil(this.blitz.time);
      this.blitz.time -= dt;
      if (this.blitz.time <= 5 && Math.ceil(this.blitz.time) !== before && this.blitz.time > 0) sfx.tick();
      if (this.blitz.time <= 0) { this.blitz.time = 0; this.blitz.running = false; this.ui.onBlitzEnd(); }
      this.ui.onBlitzTime(this.blitz.time);
    }
    this.punch *= Math.pow(0.02, dt);
    // стоп-кадр и замедление финального взрыва
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
    else if (this.slowT > 0) { this.slowT -= dt; dt *= 0.35; }
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
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.def) return;
    let [sx, sy] = this.fx.shakeOffset();
    const bw = this.board.w * this.cell, bh = this.board.h * this.cell;
    // толчок камеры: лёгкий зум к центру поля
    const z = 1 + 0.035 * this.punch;
    const zx = this.bx + bw / 2, zy = this.by + bh / 2;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (sx + zx * (1 - z)) * dpr, (sy + zy * (1 - z)) * dpr);
    ctx.drawImage(this.boardCache, this.bx, this.by, bw, bh);

    if (this.drag && this.drag.target) this.drawPreview(this.drag.k, this.drag.target, this.drag.preview, 1);
    else if (this.hint) this.drawPreview(this.hint.k, this.hint, null, 0.5 + 0.5 * Math.sin(this.hint.t * 7));
    if (this.landing) this.drawLanding();

    this.fx.drawBack(ctx);
    this.fx.drawFront(ctx, dpr, sx, sy);
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
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
      ctx.font = '700 19px Fredoka, system-ui, -apple-system, Roboto, sans-serif';
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
    const ctx = this.ctx;
    // панель лотка, уходит за нижний край экрана
    rrectPath(ctx, this.colX + 6, this.trayTop, this.colW - 12, this.H - this.trayTop + 40, 26);
    const g = ctx.createLinearGradient(0, this.trayTop, 0, this.H);
    g.addColorStop(0, 'rgba(18,14,58,0.78)');
    g.addColorStop(1, 'rgba(10,8,34,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const intro = this.time - this.loadTime;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      const img = this.trayPieces[k];
      if (this.spent[k] || (this.used[k] && !(this.landing && this.landing.k === k))) {
        ctx.globalAlpha = 0.1;
        ctx.drawImage(img, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
        ctx.globalAlpha = 1;
        continue;
      }
      const dragging = (this.drag && this.drag.k === k) || (this.back && this.back.k === k) || (this.landing && this.landing.k === k);
      // при старте уровня фигуры по очереди «впрыгивают»
      const q = Math.max(0, Math.min(1, (intro - 0.05 - k * 0.05) / 0.35));
      let scale = q < 1 ? backOut(q) : 1;
      if (this.hint && this.hint.k === k) scale *= 1 + 0.07 * Math.sin(this.hint.t * 8);
      ctx.globalAlpha = (dragging ? 0.25 : 1) * Math.min(1, q * 2);
      const w = s.w * scale, h = s.h * scale;
      ctx.drawImage(img, s.x - w / 2, s.y - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }

  drawDrag() {
    const d = this.drag, ch = this.charges[d.k];
    const p = this.piecePos(d);
    const k = EASE(Math.min(1, d.t / 0.1));
    const small = this.trayCells[d.k];
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
    const small = this.trayCells[b.k];
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
    const small = this.trayCells[h.k];
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
