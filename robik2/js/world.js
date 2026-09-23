'use strict';
// World geometry, terrain grid, collisions, chunked terrain renderer, minimap base.
const T = { GRASS: 0, SAND: 1, DIRT: 2, WATER: 3, STONE: 4, ROCK: 5, BRIDGE: 6, METAL: 7, ROAD: 8 };
const TCOL = {
  0: [38, 150, 30], 1: [226, 182, 132], 2: [140, 80, 30], 3: [22, 72, 160], 4: [140, 132, 120],
  5: [80, 74, 78], 6: [150, 105, 60], 7: [96, 104, 112], 8: [150, 96, 44],
};

const World = {
  w: 4800, h: 3600, cell: 8, gw: 600, gh: 450,
  lakes: [], rivers: [], bridges: [], sands: [], roads: [], floors: [], walls: [], obstacles: [],
  keepouts: [], decals: [],
  grid: null, obGrid: null, obCell: 160, obCols: 0, obRows: 0, qid: 0,
  CH: 512, RS: 1.5, chunks: new Map(), chunkCap: 40,
  waterPath: null, rimBuckets: new Map(),
  arena: { x: 3750, y: 760, r: 560 },

  // ---------------- build ----------------
  build() {
    this.lakes = []; this.rivers = []; this.bridges = []; this.sands = []; this.roads = []; this.floors = [];
    this.walls = []; this.obstacles = []; this.keepouts = []; this.decals = []; this.chunks.clear(); this.rimBuckets.clear();

    // water
    this.addLake(1520, 2280, 330, 250, 3);
    this.addLake(620, 1720, 190, 150, 7);
    this.addLake(2330, 500, 170, 120, 11);
    this.addLake(4330, 3230, 160, 110, 13);
    this.addRiver([[1180, -80], [1230, 300], [1160, 650], [1195, 1000], [1330, 1350], [1360, 1700], [1440, 2050], [1520, 2260]], 66, 5);
    this.addRiver([[1520, 2300], [1600, 2520], [1690, 2800], [1650, 3150], [1720, 3700]], 66, 6);
    this.addBridge(0, 820); this.addBridge(0, 1600); this.addBridge(1, 2960);

    // sand
    this.addSand([[2615, 1560], [2700, 1470], [4880, 1470], [4880, 3680], [2600, 3680], [2640, 3200], [2595, 2800], [2650, 2300], [2610, 1900]], 21);
    this.addSand([[820, 2080], [1060, 2060], [1100, 2110], [1100, 2360], [1020, 2400], [820, 2390]], 22);

    // roads
    this.addRoad([[520, 3170], [760, 3010], [1050, 2950], [1400, 2965], [1668, 2960], [1950, 2890], [2300, 2620], [2560, 2470], [2720, 2450]], 46, 'dirt');
    this.addRoad([[2700, 2450], [3000, 2460], [3300, 2540], [3470, 2540], [3600, 2540], [3850, 2530], [4040, 2570]], 50, 'desert');
    this.addRoad([[1050, 2950], [960, 2640], [880, 2300], [920, 2000], [900, 1750], [870, 1480], [980, 1180], [1100, 950], [1190, 820], [1400, 860], [1700, 930], [1980, 990]], 42, 'dirt');
    this.addRoad([[900, 1640], [1100, 1620], [1350, 1600], [1600, 1560], [1850, 1350], [2020, 1130]], 40, 'dirt');
    this.addRoad([[4250, 2330], [4230, 2100], [4050, 1850], [3850, 1650], [3800, 1470]], 50, 'desert');

    // floors
    this.floors.push({ kind: 'rock', shape: 'rect', x: 2700, y: -60, w: 2200, h: 1540 });
    this.floors.push({ kind: 'stone', shape: 'circle', x: this.arena.x, y: this.arena.y, r: 600 });
    this.floors.push({ kind: 'stone', shape: 'rect', x: 3690, y: 1180, w: 220, h: 330 });
    this.floors.push({ kind: 'stone', shape: 'circle', x: 2100, y: 1000, r: 150 });
    this.floors.push({ kind: 'metal', shape: 'rect', x: 4000, y: 2330, w: 500, h: 490 });
    for (const f of this.floors) {
      const p = new Path2D();
      if (f.shape === 'circle') { p.arc(f.x, f.y, f.r, 0, TAU); f.bb = { x0: f.x - f.r, y0: f.y - f.r, x1: f.x + f.r, y1: f.y + f.r }; }
      else { p.rect(f.x, f.y, f.w, f.h); f.bb = { x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h }; }
      f.path = p;
    }

    // walls
    const W = (x, y, w, h, kind, id) => this.walls.push({ x, y, w, h, kind, id, active: true });
    W(2655, -60, 90, 1545, 'cliff');
    W(2655, 1440, 1045, 60, 'ruin'); W(3900, 1440, 980, 60, 'ruin');
    W(3700, 1446, 200, 48, 'gate', 'gate');
    W(2692, 1500, 16, 2180, 'barrier', 'barrier');
    W(3440, 1500, 140, 940, 'cliff'); W(3440, 2640, 140, 1040, 'cliff');
    W(4000, 2330, 180, 30, 'metal'); W(4320, 2330, 180, 30, 'metal');
    W(4000, 2790, 500, 30, 'metal'); W(4470, 2330, 30, 490, 'metal');
    W(4000, 2330, 30, 170, 'metal'); W(4000, 2640, 30, 180, 'metal');

    this.rasterize();
    this.buildWaterPath();
    this.buildRims();

    // keepouts for random decoration
    const K = (x, y, r) => this.keepouts.push({ x, y, r });
    const KR = (x, y, w, h) => this.keepouts.push({ x, y, w, h, rect: true });
    K(560, 3100, 190); K(1060, 2760, 150); K(600, 1440, 130); K(2200, 2380, 210); K(2100, 1000, 250);
    K(330, 520, 150); K(150, 3440, 55); K(2560, 280, 55); K(4660, 3450, 55);
    K(1980, 1110, 70); K(2800, 2380, 90); K(4420, 2400, 70); K(3610, 1570, 80);
    KR(2540, 1470, 320, 2200); KR(3960, 2290, 580, 570); KR(3380, 2400, 260, 280); KR(3600, 1380, 400, 260);
    for (const b of this.bridges) K(b.x + b.w / 2, b.y + b.h / 2, 120);

    this.obGrid = null;
    this.placeObstacles();
    this.buildObGrid();
  },

  addLake(cx, cy, rx, ry, seed) {
    const water = blobPoly(cx, cy, rx, ry, seed, 90, 0.22, 0.02);
    const shore = blobPoly(cx, cy, rx + 46, ry + 40, seed, 120, 0.22, Art.ready ? 0.018 : 0.07);
    this.lakes.push({ cx, cy, rx, ry, water, shore, wPath: pathFromPts(water), sPath: pathFromPts(shore), bb: polyBBox(shore, 10) });
  },

  addRiver(pts, w, seed) {
    const line = wigglyLine(pts, 26, 14, seed);
    const path = pathFromPts(line, false);
    const L = [], Rr = [];
    for (let i = 0; i < line.length; i++) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      L.push([line[i][0] + nx * w / 2, line[i][1] + ny * w / 2]);
      Rr.push([line[i][0] - nx * w / 2, line[i][1] - ny * w / 2]);
    }
    const poly = L.concat(Rr.reverse());
    this.rivers.push({ line, w, path, poly, polyPath: pathFromPts(poly), bb: polyBBox(line, w / 2 + 30), left: L, right: Rr.reverse() });
  },

  riverXAt(river, y) {
    const l = river.line;
    for (let i = 0; i < l.length - 1; i++) {
      const a = l[i], b = l[i + 1];
      if ((a[1] <= y && b[1] >= y) || (a[1] >= y && b[1] <= y)) {
        const t = (y - a[1]) / ((b[1] - a[1]) || 1);
        return lerp(a[0], b[0], t);
      }
    }
    return l[0][0];
  },

  addBridge(ri, y) {
    const x = this.riverXAt(this.rivers[ri], y);
    this.bridges.push({ x: x - 86, y: y - 30, w: 172, h: 60 });
  },

  addSand(pts, seed) {
    // wiggle edges for an organic outline
    const closed = pts.concat([pts[0]]);
    const poly = wigglyLine(closed, 24, 16, seed);
    poly.pop();
    this.sands.push({ pts: poly, path: pathFromPts(poly), bb: polyBBox(poly, 10) });
  },

  addRoad(pts, w, style) {
    const line = wigglyLine(pts, 30, 8, pts.length * 7 + w);
    this.roads.push({ line, w, style, path: pathFromPts(line, false), bb: polyBBox(line, w) });
  },

  // ---------------- terrain grid ----------------
  rasterize() {
    const { cell, gw, gh } = this;
    const g = (this.grid = new Uint8Array(gw * gh));
    const cellsInBB = (bb, fn) => {
      const i0 = clamp(Math.floor(bb.x0 / cell), 0, gw - 1), i1 = clamp(Math.ceil(bb.x1 / cell), 0, gw - 1);
      const j0 = clamp(Math.floor(bb.y0 / cell), 0, gh - 1), j1 = clamp(Math.ceil(bb.y1 / cell), 0, gh - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, i * cell + cell / 2, j * cell + cell / 2);
    };
    const polyFill = (pts, bb, code) => cellsInBB(bb, (i, j, x, y) => { if (pointInPoly(x, y, pts)) g[j * gw + i] = code; });
    const lineFill = (line, hw, code) => {
      for (let k = 0; k < line.length - 1; k++) {
        const a = line[k], b = line[k + 1];
        const bb = { x0: Math.min(a[0], b[0]) - hw, x1: Math.max(a[0], b[0]) + hw, y0: Math.min(a[1], b[1]) - hw, y1: Math.max(a[1], b[1]) + hw };
        cellsInBB(bb, (i, j, x, y) => { if (segDist2(x, y, a[0], a[1], b[0], b[1]) < hw * hw) g[j * gw + i] = code; });
      }
    };
    for (const f of this.floors) {
      const code = f.kind === 'rock' ? T.ROCK : f.kind === 'metal' ? T.METAL : T.STONE;
      if (f.kind !== 'rock') continue;
      cellsInBB(f.bb, (i, j) => { g[j * gw + i] = code; });
    }
    for (const s of this.sands) polyFill(s.pts, s.bb, T.SAND);
    for (const r of this.roads) lineFill(r.line, r.w / 2, T.ROAD);
    for (const l of this.lakes) polyFill(l.shore, l.bb, T.DIRT);
    for (const r of this.rivers) lineFill(r.line, r.w / 2 + 20, T.DIRT);
    for (const f of this.floors) {
      if (f.kind === 'rock') continue;
      const code = f.kind === 'metal' ? T.METAL : T.STONE;
      cellsInBB(f.bb, (i, j, x, y) => {
        if (f.shape === 'circle' ? dist2(x, y, f.x, f.y) < f.r * f.r : true) g[j * gw + i] = code;
      });
    }
    for (const l of this.lakes) polyFill(l.water, polyBBox(l.water, 4), T.WATER);
    for (const r of this.rivers) lineFill(r.line, r.w / 2, T.WATER);
    for (const b of this.bridges) cellsInBB({ x0: b.x + 4, y0: b.y + 6, x1: b.x + b.w - 4, y1: b.y + b.h - 6 }, (i, j) => { g[j * gw + i] = T.BRIDGE; });
  },

  tAt(x, y) {
    const i = (x / this.cell) | 0, j = (y / this.cell) | 0;
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return T.WATER;
    return this.grid[j * this.gw + i];
  },
  isWater(x, y) { return this.tAt(x, y) === T.WATER; },

  zoneAt(x, y) {
    if (x > 2700 && y < 1480) return 'ruins';
    if (x > 2650 && y >= 1480) return 'desert';
    return 'meadow';
  },

  buildWaterPath() {
    const p = new Path2D();
    for (const l of this.lakes) p.addPath(l.wPath);
    for (const r of this.rivers) p.addPath(r.polyPath);
    this.waterPath = p;
  },

  buildRims() {
    const R = mulberry32(4242);
    const cols = ['#1b4a14', '#24601a', '#2f7420', '#5a3216', '#6e3a18', '#143a10'];
    const add = (x, y) => {
      const key = Math.floor(x / this.CH) + ',' + Math.floor(y / this.CH);
      let b = this.rimBuckets.get(key);
      if (!b) this.rimBuckets.set(key, (b = []));
      b.push(x, y, 1.8 + R() * 3.4, Math.floor(R() * cols.length));
    };
    this.rimCols = cols;
    const insideOtherWater = (x, y, self) => {
      for (const l of this.lakes) if (l !== self && x > l.bb.x0 && x < l.bb.x1 && y > l.bb.y0 && y < l.bb.y1 && pointInPoly(x, y, l.water)) return true;
      for (const r of this.rivers) if (r !== self) {
        for (let k = 0; k < r.line.length - 1; k++) {
          const a = r.line[k], b = r.line[k + 1];
          if (segDist2(x, y, a[0], a[1], b[0], b[1]) < (r.w / 2 - 3) ** 2) return true;
        }
      }
      return false;
    };
    const onBridge = (x, y) => this.bridges.some((b) => x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4);
    const walk = (pts, closed, self) => {
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.round(len / 4.5));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const x = lerp(a[0], b[0], t) + (R() - 0.5) * 4, y = lerp(a[1], b[1], t) + (R() - 0.5) * 4;
          if (insideOtherWater(x, y, self) || onBridge(x, y)) continue;
          add(x, y);
        }
      }
    };
    for (const l of this.lakes) walk(l.water, true, l);
    for (const r of this.rivers) { walk(r.left, false, r); walk(r.right, false, r); }
  },

  // ---------------- obstacles ----------------
  placeObstacles() {
    const R = mulberry32(2024);
    const O = this.obstacles;
    const add = (o) => { o.solid = o.solid !== false; O.push(o); return o; };

    // --- fixed props ---
    add({ kind: 'pod', x: 640, y: 3060, r: 30, size: 34 });
    add({ kind: 'tower', x: 2100, y: 1000, r: 46, size: 50, blocksShots: false, noDraw: true });
    const crates = [[700, 1470], [430, 1330], [1180, 2700], [1450, 3150], [2350, 2200], [1960, 2600], [1800, 1200], [2400, 1050],
      [2300, 3000], [900, 1900], [3050, 2350], [3200, 3100], [4100, 2450], [4380, 2700], [4600, 3400], [3900, 1800], [4450, 1700], [300, 2700], [2560, 800]];
    crates.forEach(([x, y]) => add({ kind: 'crate', x, y, r: 18, size: 20, hp: 30, destructible: true, blocksShots: true }));
    const barrels = [[1030, 2690], [620, 1360], [500, 1520], [2080, 2440], [2320, 2290], [2150, 2250], [1940, 1850], [2380, 3080],
      [3150, 2050], [2950, 2950], [4150, 2700], [4300, 2420], [3960, 1650], [460, 470], [1700, 1300]];
    barrels.forEach(([x, y]) => add({ kind: 'barrel', x, y, r: 14, size: 15, hp: 12, destructible: true, explosive: true, blocksShots: true }));

    // ruins: pillar rings
    const A = this.arena;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const deg = ((a * 180) / Math.PI) % 360;
      if (deg > 66 && deg < 114) continue; // south opening
      add({ kind: 'pillar', x: A.x + Math.cos(a) * 640, y: A.y + Math.sin(a) * 640, r: 26, size: 28, broken: i % 3 === 1, blocksShots: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      add({ kind: 'pillar', x: A.x + Math.cos(a) * 380, y: A.y + Math.sin(a) * 380, r: 24, size: 26, broken: true, blocksShots: true });
    }

    // palms around oasis
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + R() * 0.4;
      add({ kind: 'palm', x: 4330 + Math.cos(a) * 240, y: 3230 + Math.sin(a) * 175, r: 12, size: 40 + R() * 10, spr: Math.floor(R() * 3), canopy: true, blocksShots: false });
    }

    // rocks lining cliffs (decor + collision)
    const lineRocks = (x0, y0, x1, y1, count, sz0, sz1, desert) => {
      for (let i = 0; i < count; i++) {
        const t = (i + R() * 0.6) / count;
        const size = sz0 + R() * (sz1 - sz0);
        add({ kind: 'rock', x: lerp(x0, x1, t) + (R() - 0.5) * 30, y: lerp(y0, y1, t) + (R() - 0.5) * 30, r: size * 0.82, size, spr: Math.floor(R() * 8), desert, blocksShots: true, big: true });
      }
    };
    lineRocks(2665, 0, 2665, 1440, 22, 50, 80, false);
    lineRocks(2735, 0, 2735, 1440, 22, 50, 80, false);
    lineRocks(3450, 1520, 3450, 2420, 14, 48, 74, true);
    lineRocks(3570, 1520, 3570, 2420, 14, 48, 74, true);
    lineRocks(3450, 2660, 3450, 3600, 15, 48, 74, true);
    lineRocks(3570, 2660, 3570, 3600, 15, 48, 74, true);

    // --- random decoration ---
    const tryPlace = (x, y, r, kind, desertOk) => {
      if (x < 20 || y < 20 || x > this.w - 20 || y > this.h - 20) return false;
      for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const t = this.tAt(x + ox, y + oy);
        if (t === T.WATER || t === T.BRIDGE || t === T.ROAD || t === T.DIRT || t === T.STONE || t === T.METAL) return false;
        if (!desertOk && t === T.SAND) return false;
      }
      for (const k of this.keepouts) {
        if (k.rect) { if (x > k.x - r && x < k.x + k.w + r && y > k.y - r && y < k.y + k.h + r) return false; }
        else if (dist2(x, y, k.x, k.y) < (k.r + r) ** 2) return false;
      }
      for (const w of this.walls) if (x > w.x - r - 10 && x < w.x + w.w + r + 10 && y > w.y - r - 10 && y < w.y + w.h + r + 10) return false;
      for (const o of O) { const gap = kind === 'tree' && o.kind === 'tree' ? 0.9 : 1.0; if (dist2(x, y, o.x, o.y) < ((o.size + r) * gap * (kind === 'tree' ? 0.75 : 1)) ** 2) return false; }
      return true;
    };
    const tree = (x, y, size) => {
      const pine = R() < 0.3;
      if (!tryPlace(x, y, size * 0.8, 'tree', false)) return;
      add({ kind: 'tree', x, y, r: size * 0.36, size, spr: Math.floor(R() * (pine ? 4 : 10)), pine, canopy: true, blocksShots: false });
    };
    const zone = (cx, cy, rad, n) => { for (let i = 0; i < n * 3 && n > 0; i++) { const a = R() * TAU, d = Math.sqrt(R()) * rad; const before = O.length; tree(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 32 + R() * 20); if (O.length > before) n--; } };

    // border forest
    for (let x = 30; x < 2620; x += 50 + R() * 20) { tree(x, 30 + R() * 40, 38 + R() * 14); tree(x, this.h - 30 - R() * 40, 38 + R() * 14); }
    for (let y = 60; y < this.h - 60; y += 50 + R() * 20) tree(30 + R() * 40, y, 38 + R() * 14);
    zone(400, 560, 460, 70); zone(850, 200, 260, 22); zone(220, 3330, 260, 22); zone(2450, 190, 240, 16);
    zone(2420, 3350, 240, 16); zone(300, 2300, 200, 10); zone(2520, 1320, 170, 9); zone(1900, 3400, 200, 10);
    for (let i = 0; i < 140; i++) tree(80 + R() * 2520, 80 + R() * 3440, 30 + R() * 18);
    // meadow rocks
    for (let i = 0; i < 70; i++) {
      const x = 80 + R() * 2520, y = 80 + R() * 3440, size = 13 + R() * 16;
      if (tryPlace(x, y, size, 'rock', false)) add({ kind: 'rock', x, y, r: size * 0.85, size, spr: Math.floor(R() * 8), blocksShots: true });
    }
    // desert rocks and cacti
    for (let i = 0; i < 160; i++) {
      const x = 2760 + R() * 2000, y = 1540 + R() * 2020, size = 16 + R() * 30;
      if (tryPlace(x, y, size, 'rock', true)) add({ kind: 'rock', x, y, r: size * 0.85, size, spr: Math.floor(R() * 8), desert: true, blocksShots: true });
    }
    for (let i = 0; i < 110; i++) {
      const x = 2760 + R() * 2000, y = 1540 + R() * 2020;
      if (tryPlace(x, y, 16, 'cactus', true)) add({ kind: 'cactus', x, y, r: 12, size: 16, spr: Math.floor(R() * 3), blocksShots: false });
    }
    // ruins rubble outside the arena
    for (let i = 0; i < 90; i++) {
      const x = 2790 + R() * 1980, y = 40 + R() * 1360, size = 20 + R() * 36;
      if (dist(x, y, A.x, A.y) < 700) continue;
      if (x > 3600 && x < 4000 && y > 1100) continue;
      if (tryPlace(x, y, size, 'rock', true)) add({ kind: R() < 0.25 ? 'pillar' : 'rock', x, y, r: size * 0.8, size, spr: Math.floor(R() * 8), broken: true, blocksShots: true });
    }
    // world edge rocks in desert/ruins
    for (let x = 2780; x < 4800; x += 70 + R() * 40) {
      add({ kind: 'rock', x, y: 10 + R() * 20, r: 40, size: 48 + R() * 20, spr: Math.floor(R() * 8), blocksShots: true });
      add({ kind: 'rock', x, y: this.h - 10 - R() * 20, r: 40, size: 48 + R() * 20, spr: Math.floor(R() * 8), desert: true, blocksShots: true });
    }
    for (let y = 30; y < this.h; y += 70 + R() * 40) add({ kind: 'rock', x: this.w - 10 - R() * 20, y, r: 40, size: 48 + R() * 20, spr: Math.floor(R() * 8), desert: y > 1480, blocksShots: true });
  },

  buildObGrid() {
    const cs = this.obCell;
    this.obCols = Math.ceil(this.w / cs) + 1; this.obRows = Math.ceil(this.h / cs) + 1;
    this.obGrid = Array.from({ length: this.obCols * this.obRows }, () => []);
    for (const o of this.obstacles) this.gridInsert(o);
  },
  gridInsert(o) {
    const cs = this.obCell;
    const i0 = clamp(Math.floor((o.x - o.r) / cs), 0, this.obCols - 1), i1 = clamp(Math.floor((o.x + o.r) / cs), 0, this.obCols - 1);
    const j0 = clamp(Math.floor((o.y - o.r) / cs), 0, this.obRows - 1), j1 = clamp(Math.floor((o.y + o.r) / cs), 0, this.obRows - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.obGrid[j * this.obCols + i].push(o);
  },
  obAt(x, y) {
    const i = Math.floor(x / this.obCell), j = Math.floor(y / this.obCell);
    if (i < 0 || j < 0 || i >= this.obCols || j >= this.obRows) return null;
    return this.obGrid[j * this.obCols + i];
  },
  queryObs(x, y, r, out) {
    out.length = 0;
    const cs = this.obCell, q = ++this.qid;
    const i0 = clamp(Math.floor((x - r) / cs), 0, this.obCols - 1), i1 = clamp(Math.floor((x + r) / cs), 0, this.obCols - 1);
    const j0 = clamp(Math.floor((y - r) / cs), 0, this.obRows - 1), j1 = clamp(Math.floor((y + r) / cs), 0, this.obRows - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const o of this.obGrid[j * this.obCols + i]) { if (o._q !== q) { o._q = q; out.push(o); } }
    }
    return out;
  },

  // ---------------- collision ----------------
  blocked(x, y, r) {
    if (x < r + 8 || y < r + 8 || x > this.w - r - 8 || y > this.h - r - 8) return true;
    const k = r * 0.7;
    return this.isWater(x, y) || this.isWater(x + k, y) || this.isWater(x - k, y) || this.isWater(x, y + k) || this.isWater(x, y - k);
  },

  _tmp: [],
  resolveStatic(e) {
    let hit = null;
    const list = this.queryObs(e.x, e.y, e.r + 4, this._tmp);
    for (const o of list) {
      if (!o.solid || o.dead) continue;
      const dx = e.x - o.x, dy = e.y - o.y, rr = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.01;
        e.x += (dx / d) * (rr - d); e.y += (dy / d) * (rr - d);
        hit = o;
      }
    }
    for (const w of this.walls) {
      if (!w.active) continue;
      if (e.x < w.x - e.r || e.x > w.x + w.w + e.r || e.y < w.y - e.r || e.y > w.y + w.h + e.r) continue;
      const cx = clamp(e.x, w.x, w.x + w.w), cy = clamp(e.y, w.y, w.y + w.h);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < e.r * e.r) {
        if (d2 > 0.0001) { const d = Math.sqrt(d2); e.x += (dx / d) * (e.r - d); e.y += (dy / d) * (e.r - d); }
        else {
          const l = e.x - w.x, r = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y, m = Math.min(l, r, t, b);
          if (m === l) e.x = w.x - e.r; else if (m === r) e.x = w.x + w.w + e.r; else if (m === t) e.y = w.y - e.r; else e.y = w.y + w.h + e.r;
        }
        hit = w;
      }
    }
    return hit;
  },

  // returns true if hit something solid
  moveBody(e, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(4, e.r * 0.5)));
    const sx = dx / n, sy = dy / n;
    let hit = false;
    for (let i = 0; i < n; i++) {
      const px = e.x, py = e.y;
      if (!this.blocked(e.x + sx, e.y, e.r)) e.x += sx; else hit = true;
      if (!this.blocked(e.x, e.y + sy, e.r)) e.y += sy; else hit = true;
      if (this.resolveStatic(e)) hit = true;
      if (this.blocked(e.x, e.y, e.r * 0.6)) { e.x = px; e.y = py; hit = true; }
    }
    return hit;
  },

  // bullet vs static geometry
  shotHit(x, y, r) {
    const cell = this.obAt(x, y);
    if (cell) for (const o of cell) {
      if (o.dead || !o.blocksShots) continue;
      const rr = o.r * 0.9 + r;
      if (dist2(x, y, o.x, o.y) < rr * rr) return o;
    }
    for (const w of this.walls) {
      if (!w.active || w.kind === 'barrier') continue;
      if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) return w;
    }
    return null;
  },

  wallById(id) { return this.walls.find((w) => w.id === id); },

  // ---------------- chunk rendering ----------------
  getChunk(ci, cj) {
    const key = ci * 1000 + cj;
    let c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); return c; }
    c = this.renderChunk(ci, cj);
    this.chunks.set(key, c);
    if (this.chunks.size > this.chunkCap) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  },

  renderChunk(ci, cj) {
    const CH = this.CH, RS = this.RS;
    const c = makeCanvas(CH * RS, CH * RS), g = c.getContext('2d');
    const x0 = ci * CH, y0 = cj * CH, x1 = x0 + CH, y1 = y0 + CH;
    const ov = (bb) => bb.x1 > x0 && bb.x0 < x1 && bb.y1 > y0 && bb.y0 < y1;
    g.setTransform(RS, 0, 0, RS, -x0 * RS, -y0 * RS);
    const pat = (t) => g.createPattern(Tex[t], 'repeat');

    g.fillStyle = pat('grass'); g.fillRect(x0, y0, CH, CH);

    for (const f of this.floors) if (f.kind === 'rock' && ov(f.bb)) { g.fillStyle = pat('rock'); g.fill(f.path); }

    for (const s of this.sands) if (ov(s.bb)) {
      g.save();
      g.shadowColor = 'rgba(120,80,20,0.35)'; g.shadowBlur = 10;
      g.fillStyle = pat('sand'); g.fill(s.path);
      g.restore();
      g.strokeStyle = 'rgba(255,235,190,0.25)'; g.lineWidth = 2; g.stroke(s.path);
    }

    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.roads) if (ov(r.bb)) {
      if (r.style === 'dirt') {
        g.strokeStyle = 'rgba(60,34,8,0.35)'; g.lineWidth = r.w + 10; g.stroke(r.path);
        g.strokeStyle = pat('dirt'); g.lineWidth = r.w; g.stroke(r.path);
        g.strokeStyle = 'rgba(255,220,160,0.08)'; g.lineWidth = r.w * 0.35; g.stroke(r.path);
      } else {
        g.strokeStyle = 'rgba(150,100,50,0.25)'; g.lineWidth = r.w + 12; g.stroke(r.path);
        g.strokeStyle = 'rgba(170,118,66,0.45)'; g.lineWidth = r.w; g.stroke(r.path);
        g.setLineDash([14, 10]); g.strokeStyle = 'rgba(110,70,30,0.3)'; g.lineWidth = 3; g.stroke(r.path); g.setLineDash([]);
      }
    }

    for (const f of this.floors) if (f.kind !== 'rock' && ov(f.bb)) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 14;
      g.fillStyle = pat(f.kind === 'metal' ? 'metal' : 'stone'); g.fill(f.path);
      g.restore();
      g.strokeStyle = f.kind === 'metal' ? 'rgba(20,24,28,0.8)' : 'rgba(40,34,28,0.7)'; g.lineWidth = 4; g.stroke(f.path);
      if (f.kind === 'metal') {
        g.save(); g.clip(f.path);
        g.strokeStyle = '#e6b422'; g.lineWidth = 10; g.setLineDash([16, 16]); g.stroke(f.path); g.setLineDash([]);
        g.restore();
      }
    }
    // arena glyphs
    const A = this.arena;
    if (ov({ x0: A.x - 620, y0: A.y - 620, x1: A.x + 620, y1: A.y + 620 })) {
      g.strokeStyle = 'rgba(40,30,50,0.55)'; g.lineWidth = 6;
      for (const rr of [150, 300, 470]) { g.beginPath(); g.arc(A.x, A.y, rr, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(199,125,255,0.22)'; g.lineWidth = 2;
      for (const rr of [150, 300, 470]) { g.beginPath(); g.arc(A.x, A.y, rr + 5, 0, TAU); g.stroke(); }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.beginPath(); g.moveTo(A.x + Math.cos(a) * 150, A.y + Math.sin(a) * 150); g.lineTo(A.x + Math.cos(a) * 470, A.y + Math.sin(a) * 470);
        g.strokeStyle = 'rgba(40,30,50,0.4)'; g.lineWidth = 4; g.stroke();
        // runes
        const rx = A.x + Math.cos(a + 0.26) * 385, ry = A.y + Math.sin(a + 0.26) * 385;
        g.save(); g.translate(rx, ry); g.rotate(a);
        g.strokeStyle = 'rgba(199,125,255,0.35)'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(-10, -8); g.lineTo(0, 8); g.lineTo(10, -8); g.moveTo(0, -10); g.lineTo(0, 2); g.stroke();
        g.restore();
      }
    }

    // shores + water
    for (const l of this.lakes) if (ov(l.bb)) {
      g.save(); if (Art.ready) { g.shadowColor = 'rgba(40,24,6,0.55)'; g.shadowBlur = 12; }
      g.fillStyle = pat('dirt'); g.fill(l.sPath); g.restore();
      g.strokeStyle = 'rgba(60,30,8,0.3)'; g.lineWidth = 3; g.stroke(l.sPath);
    }
    for (const r of this.rivers) if (ov(r.bb)) { g.strokeStyle = pat('dirt'); g.lineWidth = r.w + 40; g.stroke(r.path); }
    for (const l of this.lakes) if (ov(l.bb)) { g.fillStyle = pat('water'); g.fill(l.wPath); }
    for (const r of this.rivers) if (ov(r.bb)) { g.strokeStyle = pat('water'); g.lineWidth = r.w; g.lineCap = 'butt'; g.stroke(r.path); g.lineCap = 'round'; }
    // depth rim inside water
    g.save(); g.clip(this.waterPath);
    g.strokeStyle = 'rgba(4,22,70,0.45)';
    for (const l of this.lakes) if (ov(l.bb)) { g.lineWidth = 26; g.stroke(l.wPath); }
    for (const r of this.rivers) if (ov(r.bb)) { g.lineWidth = 16; g.stroke(r.polyPath); }
    g.restore();

    // rim foliage
    for (let bj = cj - 1; bj <= cj + 1; bj++) for (let bi = ci - 1; bi <= ci + 1; bi++) {
      const b = this.rimBuckets.get(bi + ',' + bj);
      if (!b) continue;
      for (let k = 0; k < b.length; k += 4) {
        const x = b[k], y = b[k + 1], r = b[k + 2];
        if (x < x0 - 8 || x > x1 + 8 || y < y0 - 8 || y > y1 + 8) continue;
        g.fillStyle = this.rimCols[b[k + 3]];
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }

    // bridges
    for (const b of this.bridges) if (ov({ x0: b.x, y0: b.y - 10, x1: b.x + b.w, y1: b.y + b.h + 10 })) this.drawBridge(g, b);

    // static walls
    for (const w of this.walls) {
      if (w.kind === 'gate' || w.kind === 'barrier') continue;
      if (!ov({ x0: w.x - 20, y0: w.y - 20, x1: w.x + w.w + 20, y1: w.y + w.h + 30 })) continue;
      this.drawWall(g, w, pat);
    }

    this.bakeDecor(g, ci, cj, x0, y0);
    for (const d of this.decals) if (d.x + d.r > x0 && d.x - d.r < x1 && d.y + d.r > y0 && d.y - d.r < y1) this.paintDecal(g, d);
    return c;
  },

  drawBridge(g, b) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    g.fillStyle = '#7a4f24'; g.fillRect(b.x, b.y, b.w, b.h);
    for (let x = b.x + 2; x < b.x + b.w - 2; x += 14) {
      g.fillStyle = (Math.floor(x / 14) % 2) ? '#a26d36' : '#94622f';
      g.fillRect(x, b.y + 4, 12, b.h - 8);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 11, b.y + 4, 1, b.h - 8);
      g.fillStyle = '#3a2410'; g.fillRect(x + 5, b.y + 7, 2, 2); g.fillRect(x + 5, b.y + b.h - 9, 2, 2);
    }
    g.fillStyle = '#4a2e14'; g.fillRect(b.x, b.y, b.w, 5); g.fillRect(b.x, b.y + b.h - 5, b.w, 5);
    for (let x = b.x; x <= b.x + b.w; x += b.w / 4) { g.fillStyle = '#3a220e'; g.fillRect(x - 4, b.y - 3, 8, 10); g.fillRect(x - 4, b.y + b.h - 7, 8, 10); }
    g.restore();
  },

  drawWall(g, w, pat) {
    g.save();
    if (w.kind === 'cliff') {
      const desert = Art.ready && w.y >= 1480;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w.x + 8, w.y + 10, w.w, w.h);
      g.fillStyle = pat(desert ? 'sand' : 'rock'); g.fillRect(w.x, w.y, w.w, w.h);
      if (desert) { g.fillStyle = 'rgba(120,60,20,0.35)'; g.fillRect(w.x, w.y, w.w, w.h); }
      const gr = g.createLinearGradient(w.x, 0, w.x + w.w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.fillRect(w.x, w.y, w.w, w.h);
    } else if (w.kind === 'ruin') {
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(w.x + 6, w.y + 12, w.w, w.h);
      g.fillStyle = pat('stone'); g.fillRect(w.x, w.y, w.w, w.h);
      g.fillStyle = 'rgba(255,240,220,0.18)'; g.fillRect(w.x, w.y, w.w, 6);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(w.x, w.y + w.h - 8, w.w, 8);
      g.strokeStyle = 'rgba(30,24,18,0.9)'; g.lineWidth = 3; g.strokeRect(w.x, w.y, w.w, w.h);
    } else if (w.kind === 'metal') {
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(w.x + 5, w.y + 8, w.w, w.h);
      g.fillStyle = '#5b646c'; g.fillRect(w.x, w.y, w.w, w.h);
      g.fillStyle = '#7c8791'; g.fillRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
      g.save(); g.beginPath(); g.rect(w.x + 3, w.y + 3, w.w - 6, w.h - 6); g.clip();
      g.strokeStyle = '#e6b422'; g.lineWidth = 6;
      for (let k = -w.h; k < w.w + w.h; k += 18) { g.beginPath(); g.moveTo(w.x + k, w.y); g.lineTo(w.x + k + w.h, w.y + w.h); g.stroke(); }
      g.restore();
      g.strokeStyle = '#1e2328'; g.lineWidth = 3; g.strokeRect(w.x, w.y, w.w, w.h);
    }
    g.restore();
  },

  bakeDecor(g, ci, cj, x0, y0) {
    const R = mulberry32(ci * 7919 + cj * 104729 + 17);
    const CH = this.CH;
    if (Art.ready) return this.bakeDecorArt(g, R, x0, y0);
    // crash crater
    if (dist(640, 3060, x0 + CH / 2, y0 + CH / 2) < 900) {
      const gr = g.createRadialGradient(650, 3070, 10, 650, 3070, 150);
      gr.addColorStop(0, 'rgba(20,12,6,0.85)'); gr.addColorStop(0.5, 'rgba(50,30,12,0.5)'); gr.addColorStop(1, 'rgba(60,40,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(650, 3070, 160, 120, -0.4, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(420, 3250); g.quadraticCurveTo(520, 3160, 620, 3080); g.stroke();
    }
    for (let i = 0; i < 150; i++) {
      const x = x0 + R() * CH, y = y0 + R() * CH;
      const t = this.tAt(x, y);
      const r = R();
      if (t === T.GRASS) {
        if (r < 0.45) { // tuft
          g.strokeStyle = R() > 0.5 ? 'rgba(10,70,5,0.55)' : 'rgba(120,220,80,0.35)'; g.lineWidth = 1.3;
          for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 1.2; g.beginPath(); g.moveTo(x + (R() - 0.5) * 6, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
        } else if (r < 0.62) { // flowers
          const col = pick(['#ffffff', '#ffe066', '#ff8fc8', '#9ad0ff', '#ffb347']);
          for (let k = 0; k < 4; k++) { g.fillStyle = col; g.beginPath(); g.arc(x + (R() - 0.5) * 16, y + (R() - 0.5) * 16, 1.6 + R() * 1.2, 0, TAU); g.fill(); }
        } else if (r < 0.72) {
          g.fillStyle = 'rgba(8,60,6,0.5)'; g.beginPath(); g.arc(x, y, 6 + R() * 8, 0, TAU); g.fill();
          g.fillStyle = 'rgba(90,190,60,0.4)'; g.beginPath(); g.arc(x - 2, y - 2, 4 + R() * 4, 0, TAU); g.fill();
        } else if (r < 0.78) {
          g.fillStyle = 'rgba(160,160,150,0.8)'; g.beginPath(); g.arc(x, y, 2 + R() * 2, 0, TAU); g.fill();
        }
      } else if (t === T.SAND) {
        if (r < 0.2) { g.fillStyle = 'rgba(140,100,60,0.5)'; g.beginPath(); g.arc(x, y, 1.5 + R() * 2.5, 0, TAU); g.fill(); }
        else if (r < 0.3) { // dry bush
          g.strokeStyle = 'rgba(120,80,40,0.7)'; g.lineWidth = 1.2;
          for (let k = 0; k < 7; k++) { const a = R() * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (5 + R() * 7), y + Math.sin(a) * (5 + R() * 7)); g.stroke(); }
        } else if (r < 0.33) { // bones
          g.strokeStyle = 'rgba(250,245,230,0.85)'; g.lineWidth = 2.5; g.lineCap = 'round';
          const a = R() * TAU;
          g.beginPath(); g.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke();
          for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + Math.cos(a) * k * 4, y + Math.sin(a) * k * 4); g.lineTo(x + Math.cos(a) * k * 4 + Math.cos(a + 1.57) * 6, y + Math.sin(a) * k * 4 + Math.sin(a + 1.57) * 6); g.stroke(); }
        }
      } else if (t === T.ROCK || t === T.STONE) {
        if (r < 0.25) { g.strokeStyle = 'rgba(20,16,14,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); let px = x, py = y; for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 22; py += (R() - 0.5) * 22; g.lineTo(px, py); } g.stroke(); }
        else if (r < 0.4) { g.fillStyle = 'rgba(160,150,140,0.6)'; g.beginPath(); g.arc(x, y, 2 + R() * 3, 0, TAU); g.fill(); }
        else if (r < 0.46 && t === T.STONE) { g.fillStyle = 'rgba(60,120,40,0.35)'; g.beginPath(); g.arc(x, y, 3 + R() * 6, 0, TAU); g.fill(); }
      } else if (t === T.DIRT || t === T.ROAD) {
        if (r < 0.2) { g.fillStyle = 'rgba(60,34,10,0.5)'; g.beginPath(); g.arc(x, y, 1.5 + R() * 2, 0, TAU); g.fill(); }
      }
    }
  },

  bakeDecorArt(g, R, x0, y0) {
    const CH = this.CH;
    if (dist(640, 3060, x0 + CH / 2, y0 + CH / 2) < 900) {
      const gr = g.createRadialGradient(650, 3070, 10, 650, 3070, 150);
      gr.addColorStop(0, 'rgba(30,18,8,0.8)'); gr.addColorStop(0.55, 'rgba(60,36,14,0.45)'); gr.addColorStop(1, 'rgba(60,40,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(650, 3070, 170, 125, -0.4, 0, TAU); g.fill();
    }
    const SETS = {
      [T.GRASS]: [['d_flowers', 22, 5], ['d_grass', 16, 6], ['d_bush', 26, 2], ['d_pebbles', 15, 2], ['d_mushrooms', 17, 1.2], ['d_sprout', 19, 1], ['d_log', 46, 0.25]],
      [T.SAND]: [['d_dryshrub', 24, 3], ['d_desertrock', 22, 3], ['d_bones', 30, 0.8], ['d_pebbles', 14, 2]],
      [T.ROCK]: [['d_rubble', 30, 2], ['d_crystals', 26, 1], ['d_pebbles', 15, 3]],
      [T.STONE]: [['d_rubble', 26, 1], ['d_pebbles', 13, 2], ['d_grass', 13, 1.5]],
      [T.DIRT]: [['d_pebbles', 13, 1]],
    };
    const n = 34;
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * CH, y = y0 + R() * CH;
      const t = this.tAt(x, y);
      const set = SETS[t];
      if (!set || this.tAt(x, y + 6) !== t) { R(); R(); continue; }
      let tot = 0;
      for (const s of set) tot += s[2];
      let r = R() * tot, pickd = set[0];
      for (const s of set) { r -= s[2]; if (r <= 0) { pickd = s; break; } }
      const w = pickd[1] * (0.8 + R() * 0.4);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath(); g.ellipse(x + 2, y + 1, w * 0.42, w * 0.14, 0, 0, TAU); g.fill();
      Art.draw(g, pickd[0], x, y + 2, w, { flip: R() < 0.5 });
    }
  },

  // ---------------- decals (scorch, goo) ----------------
  addDecal(x, y, r, kind, col) {
    const t = this.tAt(x, y);
    if (t === T.WATER) return;
    const d = { x, y, r, kind, col, seed: (Math.random() * 1e9) | 0 };
    this.decals.push(d);
    if (this.decals.length > 350) this.decals.shift();
    const CH = this.CH;
    for (let cj = Math.floor((y - r) / CH); cj <= Math.floor((y + r) / CH); cj++)
      for (let ci = Math.floor((x - r) / CH); ci <= Math.floor((x + r) / CH); ci++) {
        const c = this.chunks.get(ci * 1000 + cj);
        if (!c) continue;
        const g = c.getContext('2d');
        g.setTransform(this.RS, 0, 0, this.RS, -ci * CH * this.RS, -cj * CH * this.RS);
        this.paintDecal(g, d);
      }
  },

  paintDecal(g, d) {
    const R = mulberry32(d.seed);
    g.save();
    if (d.kind === 'scorch') {
      const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      gr.addColorStop(0, 'rgba(10,6,4,0.55)'); gr.addColorStop(0.6, 'rgba(20,12,6,0.3)'); gr.addColorStop(1, 'rgba(20,12,6,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(10,6,4,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 7; i++) { const a = R() * TAU; g.beginPath(); g.moveTo(d.x + Math.cos(a) * d.r * 0.3, d.y + Math.sin(a) * d.r * 0.3); g.lineTo(d.x + Math.cos(a) * d.r * (0.8 + R() * 0.4), d.y + Math.sin(a) * d.r * (0.8 + R() * 0.4)); g.stroke(); }
    } else if (d.kind === 'goo' || d.kind === 'oil') {
      g.fillStyle = d.col;
      g.globalAlpha = 0.42;
      g.beginPath(); g.arc(d.x, d.y, d.r * 0.5, 0, TAU); g.fill();
      for (let i = 0; i < 9; i++) { const a = R() * TAU, dd = d.r * (0.3 + R() * 0.7); g.beginPath(); g.arc(d.x + Math.cos(a) * dd, d.y + Math.sin(a) * dd, 1.5 + R() * d.r * 0.18, 0, TAU); g.fill(); }
    }
    g.restore();
  },

  // prefetch chunks around a point (spreads generation cost across frames)
  prefetch(x, y, budget) {
    const CH = this.CH;
    const ci = Math.floor(x / CH), cj = Math.floor(y / CH);
    for (let r = 0; r <= 3 && budget > 0; r++) {
      for (let j = cj - r; j <= cj + r && budget > 0; j++) for (let i = ci - r; i <= ci + r && budget > 0; i++) {
        if (i < 0 || j < 0 || i * CH >= this.w || j * CH >= this.h) continue;
        if (!this.chunks.has(i * 1000 + j)) { this.getChunk(i, j); budget--; }
      }
    }
  },

  drawGround(ctx, v) {
    const CH = this.CH;
    const i0 = Math.max(0, Math.floor(v.x0 / CH)), i1 = Math.min(Math.ceil(this.w / CH) - 1, Math.floor(v.x1 / CH));
    const j0 = Math.max(0, Math.floor(v.y0 / CH)), j1 = Math.min(Math.ceil(this.h / CH) - 1, Math.floor(v.y1 / CH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      ctx.drawImage(this.getChunk(i, j), i * CH, j * CH, CH + 0.5, CH + 0.5);
    }
  },

  drawWaterAnim(ctx, v, t) {
    if (!this._caustic) this._caustic = ctx.createPattern(Tex.caustic, 'repeat');
    let any = false;
    for (const l of this.lakes) if (l.bb.x1 > v.x0 && l.bb.x0 < v.x1 && l.bb.y1 > v.y0 && l.bb.y0 < v.y1) any = true;
    for (const r of this.rivers) if (r.bb.x1 > v.x0 && r.bb.x0 < v.x1 && r.bb.y1 > v.y0 && r.bb.y0 < v.y1) any = true;
    if (!any) return;
    ctx.save();
    ctx.clip(this.waterPath);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this._caustic;
    ctx.globalAlpha = 0.16;
    ctx.save(); ctx.translate(t * 14, t * 9); ctx.fillRect(v.x0 - t * 14, v.y0 - t * 9, v.x1 - v.x0, v.y1 - v.y0); ctx.restore();
    ctx.globalAlpha = 0.1;
    ctx.save(); ctx.translate(-t * 11, t * 6); ctx.scale(1.4, 1.4); ctx.fillRect((v.x0 + t * 11) / 1.4, (v.y0 - t * 6) / 1.4, (v.x1 - v.x0) / 1.4, (v.y1 - v.y0) / 1.4); ctx.restore();
    ctx.restore();
  },

  // ---------------- minimap ----------------
  buildMinimap(w, h) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = (x + 0.5) / w * this.w, wy = (y + 0.5) / h * this.h;
      const col = TCOL[this.tAt(wx, wy)] || TCOL[0];
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const sx = w / this.w, sy = h / this.h;
    for (const o of this.obstacles) {
      if (o.kind === 'tree' || o.kind === 'palm') g.fillStyle = 'rgba(8,60,10,0.8)';
      else if (o.kind === 'rock' || o.kind === 'pillar') g.fillStyle = 'rgba(60,54,50,0.8)';
      else continue;
      g.beginPath(); g.arc(o.x * sx, o.y * sy, Math.max(1, o.size * sx * 0.9), 0, TAU); g.fill();
    }
    for (const wl of this.walls) {
      if (wl.kind === 'barrier' || wl.kind === 'gate') continue;
      g.fillStyle = wl.kind === 'metal' ? '#c9d2da' : wl.kind === 'ruin' ? '#b8ad98' : '#3b3438';
      g.fillRect(wl.x * sx, wl.y * sy, Math.max(1, wl.w * sx), Math.max(1, wl.h * sy));
    }
    for (const b of this.bridges) { g.fillStyle = '#a26d36'; g.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); }
    return c;
  },
};
