'use strict';
// Painted sprite assets (generated art). Every draw call falls back to procedural graphics when an image is missing.
const Art = {
  NAMES: ['barrel', 'bomber', 'boss', 'bpylon', 'brute', 'cactus', 'cell', 'core', 'crate', 'crawler', 'd_bones', 'd_bush', 'd_crystals',
    'd_desertrock', 'd_dryshrub', 'd_flowers', 'd_grass', 'd_log', 'd_mushrooms', 'd_pebbles', 'd_rubble', 'd_sprout', 'datalog', 'drock1',
    'drock2', 'drone', 'empcell', 'gate', 'gem', 'heal_pad', 'keycard', 'medkit', 'mine', 'nest', 'palm', 'pillar', 'pillar_broken', 'pine',
    'player_body', 'player_gun', 'pod', 'pylon', 'rock1', 'rock2', 'rock3', 'spitter', 'tex_dirt', 'tex_grass', 'tex_metal', 'tex_rock',
    'tex_sand', 'tex_stone', 'tex_water', 'tower', 'tree1', 'tree2', 'tree3', 'turret_base', 'turret_gun',
    ...['s', 'se', 'e', 'ne', 'n'].flatMap((d) => ['idle', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((f) => `pl_${d}_${f}`))],
  img: {}, cache: {}, ready: false,

  load(done) {
    let left = this.NAMES.length;
    const fin = () => { if (--left === 0) { this.ready = Object.keys(this.img).length > 0; done(); } };
    for (const n of this.NAMES) {
      const im = new Image();
      im.onload = () => { this.img[n] = im; fin(); };
      im.onerror = fin;
      im.src = 'assets/' + n + '.webp';
    }
  },

  get(n) { return this.img[n] || null; },

  // same-shape solid colour silhouette (hit flash, tints)
  solid(n, color, alpha = 1) {
    const key = n + '|' + color + '|' + alpha;
    let c = this.cache[key];
    if (c) return c;
    const im = this.img[n];
    c = makeCanvas(im.width, im.height);
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.cache[key] = c;
    return c;
  },

  h(n, w) { const im = this.img[n]; return im ? (w * im.height) / im.width : 0; },

  // (x, y) is the anchor, by default bottom-centre (the object's feet)
  draw(ctx, n, x, y, w, o = {}) {
    const im = this.img[n];
    if (!im) return false;
    const h = (w * im.height) / im.width;
    const ax = o.ax == null ? 0.5 : o.ax, ay = o.ay == null ? 1 : o.ay;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((o.flip ? -1 : 1) * (o.sx || 1), (o.flipY ? -1 : 1) * (o.sy || 1));
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(im, -w * ax, -h * ay, w, h);
    if (o.tint) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * o.tint[1];
      ctx.drawImage(this.solid(n, o.tint[0]), -w * ax, -h * ay, w, h);
      ctx.globalAlpha = ga;
    }
    if (o.flash > 0) {
      ctx.globalAlpha *= Math.min(1, o.flash);
      ctx.drawImage(this.solid(n, o.flashColor || '#ffffff'), -w * ax, -h * ay, w, h);
    }
    ctx.restore();
    return true;
  },

  shadow(ctx, x, y, rx, ry, a = 0.28) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  },
};
