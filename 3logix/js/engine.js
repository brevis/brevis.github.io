/*
 * TriX — game engine (pure logic, no DOM).
 * Works as a classic browser script (exposes window.Engine) and as a Node module (module.exports).
 *
 * Rules:
 *  - 3x3 board. Pieces have a shape (circle / diamond / square) and a color (blue / red / yellow).
 *  - Player (P) holds 5 pieces, AI (A) holds 4. Both hands are public.
 *  - P moves first; strict alternation. A move = one piece from your hand onto an empty cell.
 *  - If, after a move, any row / column / diagonal is fully occupied by pieces that all share
 *    a shape OR all share a color, the mover wins immediately. Pieces of BOTH players count.
 *  - Full board with no such line = draw.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SHAPES = ['circle', 'diamond', 'square'];
  const COLORS = ['blue', 'red', 'yellow'];
  const EMPTY = -1;
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const LINES_THROUGH = [];
  for (let c = 0; c < 9; c++) LINES_THROUGH.push(LINES.filter((l) => l.indexOf(c) >= 0));
  // Cell visiting order for the search (center, corners, edges) — helps pruning.
  const CELL_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];

  const shapeOf = (t) => (t / 3) | 0;
  const colorOf = (t) => t % 3;
  const typeOf = (shape, color) => shape * 3 + color;

  function isUniformLine(board, line) {
    const a = board[line[0]], b = board[line[1]], c = board[line[2]];
    if (a < 0 || b < 0 || c < 0) return false;
    const sa = (a / 3) | 0, sb = (b / 3) | 0, sc = (c / 3) | 0;
    if (sa === sb && sb === sc) return true;
    return a % 3 === b % 3 && b % 3 === c % 3;
  }

  /** Lines through `cell` that are complete and uniform. */
  function winningLinesThrough(board, cell) {
    const res = [];
    const ls = LINES_THROUGH[cell];
    for (let i = 0; i < ls.length; i++) if (isUniformLine(board, ls[i])) res.push(ls[i]);
    return res;
  }
  function anyWinThrough(board, cell) {
    const ls = LINES_THROUGH[cell];
    for (let i = 0; i < ls.length; i++) if (isUniformLine(board, ls[i])) return true;
    return false;
  }
  function allWinningLines(board) {
    return LINES.filter((l) => isUniformLine(board, l));
  }

  function countsOf(hand) {
    const c = new Array(9).fill(0);
    for (let i = 0; i < hand.length; i++) c[hand[i]]++;
    return c;
  }
  function handOfCounts(counts) {
    const h = [];
    for (let t = 0; t < 9; t++) for (let k = 0; k < counts[t]; k++) h.push(t);
    return h;
  }

  // ---------------------------------------------------------------------------
  // Solver: negamax + alpha-beta + transposition table.
  // Score is from the side-to-move's perspective: +(100 - plies) for a win at ply `plies`,
  // negative for a loss, 0 for a draw. Larger = faster win / slower loss.
  // TT keys are numeric: canonical board code (min over the 8 board symmetries)
  // combined with indices of the remaining sub-multisets of each hand.
  // ---------------------------------------------------------------------------
  const WIN_BASE = 100;
  const EXACT = 0, LOWER = 1, UPPER = 2;

  // 8 symmetries of the 3x3 board as cell permutations.
  const SYMS = (function () {
    const fns = [
      (r, c) => [r, c], (r, c) => [c, 2 - r], (r, c) => [2 - r, 2 - c], (r, c) => [2 - c, r],
      (r, c) => [r, 2 - c], (r, c) => [2 - r, c], (r, c) => [c, r], (r, c) => [2 - c, 2 - r],
    ];
    return fns.map((f) => {
      const p = new Array(9);
      for (let i = 0; i < 9; i++) { const rc = f((i / 3) | 0, i % 3); p[i] = rc[0] * 3 + rc[1]; }
      return p;
    });
  })();

  function canonicalCode(board) {
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const p = SYMS[k];
      let code = 0;
      for (let i = 0; i < 9; i++) { const v = board[p[i]]; code = code * 10 + (v < 0 ? 9 : v); }
      if (code < best) best = code;
    }
    return best;
  }

  /** Enumerate every sub-multiset of a hand (as count vectors) with removal transitions. */
  function subMultisets(counts) {
    const list = [];
    const index = new Map();
    const code = (c) => { let k = 0; for (let t = 0; t < 9; t++) k = k * 6 + c[t]; return k; };
    (function rec(t, cur) {
      if (t === 9) { index.set(code(cur), list.length); list.push(cur.slice()); return; }
      for (let k = 0; k <= counts[t]; k++) { cur[t] = k; rec(t + 1, cur); }
      cur[t] = 0;
    })(0, new Array(9).fill(0));
    const next = list.map((c) => {
      const row = new Array(9).fill(-1);
      for (let t = 0; t < 9; t++) if (c[t] > 0) { const d = c.slice(); d[t]--; row[t] = index.get(code(d)); }
      return row;
    });
    return { list, next, index, code, full: list.length - 1 };
  }

  function Solver(pHand, aHand) {
    this.pInit = countsOf(pHand);
    this.aInit = countsOf(aHand);
    this.pSub = subMultisets(this.pInit);
    this.aSub = subMultisets(this.aInit);
    this.tt = new Map();
    this.nodes = 0;
  }

  Solver.prototype._handIndex = function (pCounts, aCounts) {
    const pi = this.pSub.index.get(this.pSub.code(pCounts));
    const ai = this.aSub.index.get(this.aSub.code(aCounts));
    if (pi == null || ai == null) throw new Error('hand is not a sub-multiset of the deal');
    return [pi, ai];
  };

  /**
   * Negamax. `filled` = number of pieces on board (= plies played so far).
   * pi / ai = indices of the remaining P / A sub-multisets.
   * Precondition: the position is not already won (wins are detected on placement).
   */
  Solver.prototype._search = function (board, filled, pi, ai, alpha, beta) {
    this.nodes++;
    if (filled === 9) return 0;
    const pToMove = (filled & 1) === 0;
    const key = canonicalCode(board) * 512 + pi * 16 + ai;
    const hit = this.tt.get(key);
    if (hit !== undefined) {
      const s = hit >> 2, flag = hit & 3;
      if (flag === EXACT) return s;
      if (flag === LOWER) { if (s >= beta) return s; if (s > alpha) alpha = s; }
      else { if (s <= alpha) return s; if (s < beta) beta = s; }
    }
    const sub = pToMove ? this.pSub : this.aSub;
    const ownIdx = pToMove ? pi : ai;
    const own = sub.list[ownIdx];
    const nextRow = sub.next[ownIdx];
    const alpha0 = alpha;
    const winScore = WIN_BASE - (filled + 1);
    // Immediate-win scan: any winning placement is the best possible result.
    for (let t = 0; t < 9; t++) {
      if (own[t] === 0) continue;
      for (let i = 0; i < 9; i++) {
        const c = CELL_ORDER[i];
        if (board[c] >= 0) continue;
        board[c] = t;
        const w = anyWinThrough(board, c);
        board[c] = EMPTY;
        if (w) { this.tt.set(key, (winScore << 2) | EXACT); return winScore; }
      }
    }
    let best = -Infinity;
    outer:
    for (let t = 0; t < 9; t++) {
      if (own[t] === 0) continue;
      const nIdx = nextRow[t];
      const npi = pToMove ? nIdx : pi;
      const nai = pToMove ? ai : nIdx;
      for (let i = 0; i < 9; i++) {
        const c = CELL_ORDER[i];
        if (board[c] >= 0) continue;
        board[c] = t;
        const s = -this._search(board, filled + 1, npi, nai, -beta, -alpha);
        board[c] = EMPTY;
        if (s > best) best = s;
        if (s > alpha) alpha = s;
        if (alpha >= beta) break outer;
      }
    }
    let flag = EXACT;
    if (best <= alpha0) flag = UPPER;
    else if (best >= beta) flag = LOWER;
    this.tt.set(key, (best << 2) | flag);
    return best;
  };

  function filledCount(board) {
    let n = 0;
    for (let i = 0; i < 9; i++) if (board[i] >= 0) n++;
    return n;
  }

  /**
   * Exact score of a position for the side to move (full window search).
   * `board` is an array of 9 (EMPTY or type), hands are count arrays.
   */
  Solver.prototype.score = function (board, pCounts, aCounts) {
    const idx = this._handIndex(pCounts, aCounts);
    return this._search(board.slice(), filledCount(board), idx[0], idx[1], -Infinity, Infinity);
  };

  /** Solve the deal from the empty board. Returns value from P's perspective. */
  Solver.prototype.solve = function () {
    const board = new Array(9).fill(EMPTY);
    return scoreToResult(this.score(board, this.pInit, this.aInit));
  };

  /**
   * Evaluate every legal move for the side to move.
   * Returns [{type, cell, score, value, length}] with score from the MOVER's perspective.
   */
  Solver.prototype.evaluateMoves = function (board, pCounts, aCounts) {
    const filled = filledCount(board);
    const pToMove = (filled & 1) === 0;
    const idx = this._handIndex(pCounts, aCounts);
    const sub = pToMove ? this.pSub : this.aSub;
    const ownIdx = pToMove ? idx[0] : idx[1];
    const own = sub.list[ownIdx];
    const b = board.slice();
    const res = [];
    for (let t = 0; t < 9; t++) {
      if (own[t] === 0) continue;
      const nIdx = sub.next[ownIdx][t];
      for (let c = 0; c < 9; c++) {
        if (b[c] >= 0) continue;
        b[c] = t;
        let s;
        if (anyWinThrough(b, c)) s = WIN_BASE - (filled + 1);
        else s = -this._search(b, filled + 1, pToMove ? nIdx : idx[0], pToMove ? idx[1] : nIdx, -Infinity, Infinity);
        b[c] = EMPTY;
        const r = scoreToResult(s);
        res.push({ type: t, cell: c, score: s, value: r.value, length: r.length });
      }
    }
    return res;
  };

  function scoreToResult(s) {
    if (s > 0) return { value: 1, length: WIN_BASE - s };
    if (s < 0) return { value: -1, length: WIN_BASE + s };
    return { value: 0, length: null };
  }

  // ---------------------------------------------------------------------------
  // Difficulty metric ("max-resistance" line, see analysis spec).
  // Only meaningful when P has a forced win from the empty board.
  // ---------------------------------------------------------------------------
  function difficulty(solver) {
    const board = new Array(9).fill(EMPTY);
    const pc = solver.pInit.slice(), ac = solver.aInit.slice();
    const fracs = [];
    let plies = 0;
    for (;;) {
      const filled = plies;
      if (filled === 9) break;
      const pToMove = filled % 2 === 0;
      const moves = solver.evaluateMoves(board, pc, ac);
      if (pToMove) {
        const winning = moves.filter((m) => m.value === 1);
        if (winning.length === 0) break; // should not happen for a forced-win deal
        winning.sort((x, y) => x.length - y.length || x.type - y.type || x.cell - y.cell);
        const m = winning[0];
        // A turn with an immediate win available is trivial and is not counted.
        if (m.length !== filled + 1) fracs.push(winning.length / moves.length);
        board[m.cell] = m.type; pc[m.type]--; plies++;
        if (anyWinThrough(board, m.cell)) break;
      } else {
        // A: choose the move minimizing the fraction of P's winning replies.
        let best = null;
        for (const m of moves) {
          let frac;
          if (m.value === 1) frac = 0;
          else {
            board[m.cell] = m.type; ac[m.type]--;
            frac = replyDanger(solver, board, pc, ac, 1);
            board[m.cell] = EMPTY; ac[m.type]++;
          }
          const cand = { m, frac, len: m.value === -1 ? m.length : 0 };
          if (!best || cand.frac < best.frac || (cand.frac === best.frac && (cand.len > best.len ||
              (cand.len === best.len && (cand.m.type < best.m.type || (cand.m.type === best.m.type && cand.m.cell < best.m.cell)))))) best = cand;
        }
        const m = best.m;
        board[m.cell] = m.type; ac[m.type]--; plies++;
        if (anyWinThrough(board, m.cell)) break;
      }
    }
    return {
      minWinFrac: fracs.length ? Math.min.apply(null, fracs) : 1,
      criticalTurns: fracs.filter((f) => f <= 0.5).length,
      resistanceLength: plies,
      fracs: fracs,
    };
  }

  // ---------------------------------------------------------------------------
  // AI move choice.
  // Picks the best outcome; among equal outcomes prefers moves that leave the
  // opponent the fewest replies that hold the outcome ("traps"), then longer losses /
  // shorter wins.
  // ---------------------------------------------------------------------------
  /**
   * Fraction of P's replies (from the given position, P to move) that hold `target`
   * value for P. If P can win on the spot, that is treated as obvious: returns 1.
   */
  function replyDanger(solver, board, pCounts, aCounts, target) {
    const replies = solver.evaluateMoves(board, pCounts, aCounts);
    if (!replies.length) return 1;
    const filled = filledCount(board);
    let holding = 0;
    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      if (r.value === 1 && r.length === filled + 1) return 1; // immediate win available
      if (r.value === target) holding++;
    }
    return holding / replies.length;
  }

  function chooseAiMove(solver, board, pCounts, aCounts, rng) {
    const moves = solver.evaluateMoves(board, pCounts, aCounts);
    if (moves.length === 0) return null;
    let bestScoreSign = -2;
    for (const m of moves) bestScoreSign = Math.max(bestScoreSign, m.value);
    let cands = moves.filter((m) => m.value === bestScoreSign);
    if (bestScoreSign === 1) {
      // Winning: take the fastest win.
      const minLen = Math.min.apply(null, cands.map((m) => m.length));
      cands = cands.filter((m) => m.length === minLen);
      return pick(cands, rng);
    }
    // Drawing or losing: measure how many of P's replies keep P's best result.
    const scored = cands.map((m) => {
      board[m.cell] = m.type; aCounts[m.type]--;
      const frac = replyDanger(solver, board, pCounts, aCounts, -m.value);
      board[m.cell] = EMPTY; aCounts[m.type]++;
      return { m, frac, len: m.value === -1 ? m.length : 0 };
    });
    let minFrac = Math.min.apply(null, scored.map((s) => s.frac));
    let pool = scored.filter((s) => s.frac === minFrac);
    if (bestScoreSign === -1) {
      const maxLen = Math.max.apply(null, pool.map((s) => s.len));
      pool = pool.filter((s) => s.len === maxLen);
    }
    return pick(pool.map((s) => s.m), rng);
  }

  function pick(arr, rng) {
    const r = rng ? rng() : Math.random();
    return arr[Math.floor(r * arr.length) % arr.length];
  }

  // ---------------------------------------------------------------------------
  // Deal generation.
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawPool(pool, rng) {
    const pieces = [];
    if (pool === 'distinct9') {
      const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      shuffle(all, rng);
      return { pHand: all.slice(0, 5), aHand: all.slice(5) };
    }
    if (pool === 'iid') {
      for (let i = 0; i < 9; i++) pieces.push(Math.floor(rng() * 9));
      return { pHand: pieces.slice(0, 5), aHand: pieces.slice(5) };
    }
    // double18 (default)
    const bag = [];
    for (let t = 0; t < 9; t++) { bag.push(t); bag.push(t); }
    shuffle(bag, rng);
    return { pHand: bag.slice(0, 5), aHand: bag.slice(5, 9) };
  }

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * Generate a deal in which P (moving first) has a forced win.
   * opts: { pool, rng, maxTries, minWinFracMax, minWinFracMin, allowDraw }
   * Returns { pHand, aHand, value, length, difficulty, tries }.
   */
  function generateDeal(opts) {
    opts = opts || {};
    const rng = opts.rng || mulberry32((Math.random() * 2 ** 32) >>> 0);
    const pool = opts.pool || 'double18';
    const maxTries = opts.maxTries || 400;
    const fracMax = opts.minWinFracMax == null ? 1 : opts.minWinFracMax;
    const fracMin = opts.minWinFracMin == null ? 0 : opts.minWinFracMin;
    // A winning deal outside the band is always preferred over a draw deal.
    let bestWin = null, drawFallback = null;
    const mid = (fracMax + fracMin) / 2;
    for (let tries = 1; tries <= maxTries; tries++) {
      const d = drawPool(pool, rng);
      const solver = new Solver(d.pHand, d.aHand);
      const r = solver.solve();
      if (r.value === 1) {
        const diff = difficulty(solver);
        const deal = { pHand: d.pHand, aHand: d.aHand, value: 1, length: r.length, difficulty: diff, tries };
        if (diff.minWinFrac <= fracMax && diff.minWinFrac >= fracMin) return deal;
        if (!bestWin || Math.abs(diff.minWinFrac - mid) < Math.abs(bestWin.difficulty.minWinFrac - mid)) bestWin = deal;
      } else if (r.value === 0 && opts.allowDraw && !drawFallback) {
        drawFallback = { pHand: d.pHand, aHand: d.aHand, value: 0, length: null, difficulty: null, tries };
      }
    }
    return bestWin || drawFallback;
  }

  // ---------------------------------------------------------------------------
  // Game state (used by the UI).
  // ---------------------------------------------------------------------------
  function Game(pHand, aHand) {
    this.pHand = pHand.slice();
    this.aHand = aHand.slice();
    this.pCounts = countsOf(pHand);
    this.aCounts = countsOf(aHand);
    this.board = new Array(9).fill(EMPTY);
    this.moves = [];          // {side:'P'|'A', type, cell}
    this.result = null;       // null | {winner:'P'|'A'|null, lines:[...]} (winner null = draw)
    this.solver = new Solver(pHand, aHand);
  }
  Game.prototype.filled = function () { return this.moves.length; };
  Game.prototype.sideToMove = function () { return this.result ? null : (this.moves.length % 2 === 0 ? 'P' : 'A'); };
  Game.prototype.isLegal = function (side, type, cell) {
    if (this.result || this.sideToMove() !== side) return false;
    if (cell < 0 || cell > 8 || this.board[cell] !== EMPTY) return false;
    const counts = side === 'P' ? this.pCounts : this.aCounts;
    return counts[type] > 0;
  };
  Game.prototype.play = function (side, type, cell) {
    if (!this.isLegal(side, type, cell)) throw new Error('illegal move');
    this.board[cell] = type;
    (side === 'P' ? this.pCounts : this.aCounts)[type]--;
    this.moves.push({ side, type, cell });
    const lines = winningLinesThrough(this.board, cell);
    if (lines.length) this.result = { winner: side, lines };
    else if (this.moves.length === 9) this.result = { winner: null, lines: [] };
    return this.result;
  };
  Game.prototype.aiMove = function (rng) {
    return chooseAiMove(this.solver, this.board, this.pCounts, this.aCounts, rng);
  };
  /** Value of the current position from P's perspective (+1/0/-1). */
  Game.prototype.currentValue = function () {
    if (this.result) return this.result.winner === 'P' ? 1 : this.result.winner === 'A' ? -1 : 0;
    const s = this.solver.score(this.board, this.pCounts, this.aCounts);
    const v = scoreToResult(s).value;
    return this.sideToMove() === 'P' ? v : -v;
  };
  /** P's moves that keep the forced win (or best available result). */
  Game.prototype.bestPlayerMoves = function () {
    if (this.result || this.sideToMove() !== 'P') return [];
    const moves = this.solver.evaluateMoves(this.board, this.pCounts, this.aCounts);
    const best = Math.max.apply(null, moves.map((m) => m.value));
    return moves.filter((m) => m.value === best);
  };

  return {
    SHAPES, COLORS, LINES, EMPTY,
    shapeOf, colorOf, typeOf,
    isUniformLine, winningLinesThrough, allWinningLines,
    countsOf, handOfCounts,
    Solver, difficulty, chooseAiMove,
    mulberry32, drawPool, generateDeal,
    Game,
  };
});
