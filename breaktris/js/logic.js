// Чистая логика игры: разбор уровней, проверка установки заряда, расчёт взрыва, солвер.
// Без DOM — используется и в браузере, и в Node (tools/check-levels.mjs).

export const EMPTY = 0, NORMAL = 1, TNT = 2, STEEL = 3;

export const KIND_INFO = {
  basic: { name: 'Charge', desc: 'Blasts exactly its own shape.' },
  fire: { name: 'Napalm', desc: 'Blasts its shape and burns every neighboring block.' },
  laser: { name: 'Laser', desc: 'Blasts its shape and burns through its whole rows.' },
};

const KIND_PREFIX = { b: 'basic', f: 'fire', l: 'laser' };

// "##/#." -> { cells: [[0,0],[1,0],[0,1]], w, h }
export function parseCharge(str) {
  let kind = 'basic', s = str;
  const m = /^([a-z]):(.*)$/.exec(str);
  if (m) { kind = KIND_PREFIX[m[1]]; s = m[2]; }
  if (!kind) throw new Error('Unknown charge kind: ' + str);
  const rows = s.split('/');
  const cells = [];
  let w = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') { cells.push([x, y]); w = Math.max(w, x + 1); }
  });
  return { kind, cells, w, h: rows.length, sig: kind + ':' + s };
}

export function parseLevel(def) {
  const rows = def.grid;
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const type = new Uint8Array(w * h);
  const hp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] || '.';
      const i = y * w + x;
      if (c === '#') { type[i] = NORMAL; hp[i] = 1; }
      else if (c === 'T') { type[i] = TNT; hp[i] = 1; }
      else if (c === 'S') { type[i] = STEEL; hp[i] = 2; }
    }
  }
  return {
    board: { w, h, type, hp },
    charges: def.charges.map(parseCharge),
  };
}

export function cloneBoard(b) {
  return { w: b.w, h: b.h, type: b.type, hp: b.hp.slice() };
}

export function blocksLeft(hp) {
  let n = 0;
  for (let i = 0; i < hp.length; i++) if (hp[i]) n++;
  return n;
}

export function canPlace(b, ch, ox, oy) {
  const { w, h, hp } = b;
  for (const [cx, cy] of ch.cells) {
    const x = ox + cx, y = oy + cy;
    if (x < 0 || y < 0 || x >= w || y >= h || !hp[y * w + x]) return false;
  }
  return true;
}

export function placements(b, ch) {
  const out = [];
  for (let oy = 0; oy <= b.h - ch.h; oy++)
    for (let ox = 0; ox <= b.w - ch.w; ox++)
      if (canPlace(b, ch, ox, oy)) out.push([ox, oy]);
  return out;
}

export function anyMove(b, charges, used) {
  for (let k = 0; k < charges.length; k++) {
    if (used[k]) continue;
    const ch = charges[k];
    for (let oy = 0; oy <= b.h - ch.h; oy++)
      for (let ox = 0; ox <= b.w - ch.w; ox++)
        if (canPlace(b, ch, ox, oy)) return true;
  }
  return false;
}

// Расчёт взрыва. Возвращает новый hp и список событий по «волнам» (t):
// t=0 — сам заряд, t=1 — напалм/лазер, дальше — цепочки динамита.
export function resolve(b, ch, ox, oy) {
  const { w, h, type } = b;
  const hp = b.hp.slice();
  const buckets = [[]];
  const push = (i, t) => { (buckets[t] || (buckets[t] = [])).push(i); };
  const inShape = new Set();
  for (const [cx, cy] of ch.cells) { const i = (oy + cy) * w + ox + cx; inShape.add(i); push(i, 0); }

  if (ch.kind === 'fire') {
    const extra = new Set();
    for (const [cx, cy] of ch.cells) {
      const x = ox + cx, y = oy + cy;
      if (x > 0) extra.add(y * w + x - 1);
      if (x < w - 1) extra.add(y * w + x + 1);
      if (y > 0) extra.add((y - 1) * w + x);
      if (y < h - 1) extra.add((y + 1) * w + x);
    }
    for (const i of extra) if (!inShape.has(i)) push(i, 1);
  } else if (ch.kind === 'laser') {
    const rows = new Set(ch.cells.map(([, cy]) => oy + cy));
    for (const y of rows) for (let x = 0; x < w; x++) { const i = y * w + x; if (!inShape.has(i)) push(i, 1); }
  }

  const events = [];
  for (let t = 0; t < buckets.length; t++) {
    const list = buckets[t];
    if (!list) continue;
    for (const i of list) {
      if (!hp[i]) continue;
      hp[i]--;
      const destroyed = hp[i] === 0;
      events.push({ i, t, destroyed, type: type[i] });
      if (destroyed && type[i] === TNT) {
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) push(ny * w + nx, t + 1);
        }
      }
    }
  }
  return { hp, events, waves: buckets.length };
}

// ---------- Солвер ----------
// Если все заряды обычные и нет динамита — порядок ходов не важен,
// и можно рассматривать только ходы, покрывающие первую живую клетку.

function groupCharges(charges, used) {
  const map = new Map();
  const groups = [];
  charges.forEach((ch, k) => {
    if (used && used[k]) return;
    let g = map.get(ch.sig);
    if (!g) { g = { ch, idxs: [] }; map.set(ch.sig, g); groups.push(g); }
    g.idxs.push(k);
  });
  return groups;
}

// Отсечение: каждая живая клетка должна быть досягаема хоть каким-то оставшимся зарядом
// (установки со временем только исчезают, поэтому проверка корректна).
function coverable(b, groups, allPs) {
  const { w, h, hp, type } = b;
  const hit = new Uint8Array(hp.length);
  for (let i = 0; i < hp.length; i++) {
    if (hp[i] && type[i] === TNT) {
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) hit[ny * w + nx] = 1;
      }
    }
  }
  for (let g = 0; g < groups.length; g++) {
    const ch = groups[g].ch;
    for (const [ox, oy] of allPs[g]) {
      for (const [cx, cy] of ch.cells) {
        const x = ox + cx, y = oy + cy;
        hit[y * w + x] = 1;
        if (ch.kind === 'fire') {
          if (x > 0) hit[y * w + x - 1] = 1;
          if (x < w - 1) hit[y * w + x + 1] = 1;
          if (y > 0) hit[(y - 1) * w + x] = 1;
          if (y < h - 1) hit[(y + 1) * w + x] = 1;
        } else if (ch.kind === 'laser') {
          for (let xx = 0; xx < w; xx++) hit[y * w + xx] = 1;
        }
      }
    }
  }
  for (let i = 0; i < hp.length; i++) if (hp[i] && !hit[i]) return false;
  return true;
}

// Явный тупик: заряды не лезут никуда или какую-то клетку уже нечем достать.
export function hopeless(board, charges, used) {
  if (!blocksLeft(board.hp)) return false;
  const groups = groupCharges(charges, used);
  const allPs = groups.map(g => placements(board, g.ch));
  if (allPs.every(p => !p.length)) return true;
  return !coverable(board, groups, allPs);
}

function hpKey(hp) {
  let s = '';
  for (let i = 0; i < hp.length; i++) s += hp[i];
  return s;
}

export function isOrderFree(board, charges) {
  if (charges.some(c => c.kind !== 'basic')) return false;
  for (let i = 0; i < board.type.length; i++) if (board.hp[i] && board.type[i] === TNT) return false;
  return true;
}

// Максимальный урон заряда (для оценки снизу числа нужных зарядов).
function maxDamage(ch, w) {
  if (ch.kind === 'fire') return ch.cells.length * 5;
  if (ch.kind === 'laser') return new Set(ch.cells.map(c => c[1])).size * w;
  return ch.cells.length;
}

// DFS с ограничением числа зарядов + мемо проигрышных состояний.
// Ходы упорядочены по силе взрыва — решения находятся быстро.
function makeSearcher(board, groups, maxNodes) {
  const { w, h, type } = board;
  const orderFree = isOrderFree(board, groups.map(g => g.ch));
  const dmg = groups.map(g => maxDamage(g.ch, w));
  const fail = new Map();
  const st = { nodes: 0, aborted: false, path: [] };

  function bound(hp, counts, budget) {
    let need = 0, tnt = 0;
    for (let i = 0; i < hp.length; i++) { need += hp[i]; if (hp[i] && type[i] === TNT) tnt++; }
    const top = [];
    counts.forEach((c, g) => { for (let k = 0; k < c; k++) top.push(dmg[g]); });
    top.sort((a, b) => b - a);
    let can = tnt * 8;
    for (let k = 0; k < Math.min(budget, top.length); k++) can += top[k];
    return can >= need;
  }

  function dfs(hp, counts, budget) {
    let alive = false;
    for (let i = 0; i < hp.length; i++) if (hp[i]) { alive = true; break; }
    if (!alive) return true;
    if (budget <= 0) return false;
    const key = hpKey(hp) + '|' + counts.join(',');
    const f = fail.get(key);
    if (f !== undefined && f >= budget) return false;
    if (++st.nodes > maxNodes) { st.aborted = true; return false; }
    if (!bound(hp, counts, budget)) { fail.set(key, budget); return false; }
    const b = { w, h, type, hp };
    const allPs = groups.map((g, gi) => counts[gi] ? placements(b, g.ch) : []);
    if (!coverable(b, groups, allPs)) { fail.set(key, 1e9); return false; }

    let first = -1;
    if (orderFree) for (let i = 0; i < hp.length; i++) if (hp[i]) { first = i; break; }
    const moves = [];
    for (let g = 0; g < groups.length; g++) {
      if (!counts[g]) continue;
      const ch = groups[g].ch;
      for (const [ox, oy] of allPs[g]) {
        if (first >= 0) {
          const fx = first % w, fy = (first / w) | 0;
          if (!ch.cells.some(([cx, cy]) => ox + cx === fx && oy + cy === fy)) continue;
        }
        const r = resolve(b, ch, ox, oy);
        let score = 0;
        for (const e of r.events) if (e.destroyed) score++;
        moves.push({ g, ox, oy, hp: r.hp, score });
      }
    }
    moves.sort((a, b) => b.score - a.score);
    for (const m of moves) {
      counts[m.g]--;
      st.path.push(m);
      const ok = dfs(m.hp, counts, budget - 1);
      counts[m.g]++;
      if (ok) return true;
      st.path.pop();
      if (st.aborted) return false;
    }
    fail.set(key, budget);
    return false;
  }
  return { dfs, st };
}

// Находит решение с минимумом зарядов (или лучшее найденное в рамках бюджета).
// Возвращает { min, path: [{k, x, y}], proven, nodes }.
export function solve(board, charges, used = null, opts = {}) {
  const maxNodes = opts.maxNodes || 3e5;
  const groups = groupCharges(charges, used);
  const counts = groups.map(g => g.idxs.length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!blocksLeft(board.hp)) return { min: 0, path: [], proven: true, nodes: 0 };
  const S = makeSearcher(board, groups, maxNodes);
  const toPath = p => {
    const taken = groups.map(() => 0);
    return p.map(m => ({ k: groups[m.g].idxs[taken[m.g]++], x: m.ox, y: m.oy }));
  };
  let best = null;
  let limit = opts.limit != null ? Math.min(opts.limit, total) : total;
  while (limit > 0) {
    S.st.path = [];
    const ok = S.dfs(board.hp.slice(), counts.slice(), limit);
    if (!ok) break;
    best = toPath(S.st.path);
    if (opts.firstOnly) break;
    limit = best.length - 1;
  }
  return {
    min: best ? best.length : null,
    path: best || [],
    proven: !S.st.aborted,
    nodes: S.st.nodes,
  };
}

// Подсчёт числа различных оптимальных решений (для оценки сложности уровней, только order-free).
export function countTilings(board, charges, limit = 1000) {
  const groups = groupCharges(charges, null);
  const counts = groups.map(g => g.idxs.length);
  const w = board.w;
  let found = 0;
  const hp = board.hp.slice();
  (function rec() {
    if (found >= limit) return;
    let first = -1;
    for (let i = 0; i < hp.length; i++) if (hp[i]) { first = i; break; }
    if (first < 0) { found++; return; }
    const fx = first % w, fy = (first / w) | 0;
    for (let g = 0; g < groups.length; g++) {
      if (!counts[g]) continue;
      const ch = groups[g].ch;
      for (const [cx, cy] of ch.cells) {
        const ox = fx - cx, oy = fy - cy;
        if (!canPlace({ w, h: board.h, hp }, ch, ox, oy)) continue;
        for (const [ax, ay] of ch.cells) hp[(oy + ay) * w + ox + ax]--;
        counts[g]--;
        rec();
        counts[g]++;
        for (const [ax, ay] of ch.cells) hp[(oy + ay) * w + ox + ax]++;
      }
    }
  })();
  return found;
}
