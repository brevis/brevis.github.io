'use strict';
// Procedural, seamless ground textures and pre-rendered sprites.
const Tex = {
  gen(size, fn) {
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const img = g.createImageData(size, size), d = img.data;
    const o = [0, 0, 0, 255];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        o[3] = 255;
        fn(x, y, o);
        const i = (y * size + x) * 4;
        d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  },

  init() {
    const S = 256;
    const art = (n) => Art.get('tex_' + n);
    this.grass = art('grass') || this.gen(S, (x, y, o) => {
      const n1 = fbm(x / 64, y / 64, 11, 3, 4);
      const n2 = fbm(x / 16, y / 16, 23, 2, 16);
      const blade = vnoise(x / 2, y / 8, 31, 128, 32);
      const gr = hash2(x, y, 5);
      const L = n1 * 0.55 + n2 * 0.3 + blade * 0.15;
      o[0] = 6 + L * 44 + gr * 10;
      o[1] = 118 + L * 100 + gr * 16;
      o[2] = 6 + L * 26 + gr * 6;
    });

    this.sand = art('sand') || this.gen(S, (x, y, o) => {
      const w = fbm(x / 64, y / 64, 41, 3, 4);
      const w2 = fbm(x / 32, y / 32, 43, 2, 8);
      const rip = Math.sin(TAU * (y / 32 + w * 2.2 + (w2 - 0.5) * 0.9));
      const s = rip > 0 ? rip * 0.55 : rip * 0.22;
      const gr = hash2(x, y, 7);
      const f = 0.9 + s * 0.1 + (gr - 0.5) * 0.07 + (w - 0.5) * 0.12;
      o[0] = clamp(238 * f, 0, 255); o[1] = clamp(192 * f, 0, 255); o[2] = clamp(142 * f, 0, 255);
    });

    this.dirt = art('dirt') || this.gen(S, (x, y, o) => {
      const n = fbm(x / 32, y / 32, 51, 4, 8);
      const gr = hash2(x, y, 9);
      let f = 0.78 + n * 0.42 + (gr - 0.5) * 0.12;
      if (gr > 0.985) f *= 0.7;
      if (gr < 0.01) f *= 1.25;
      o[0] = clamp(150 * f, 0, 255); o[1] = clamp(84 * f, 0, 255); o[2] = clamp(30 * f, 0, 255);
    });

    this.water = art('water') || this.gen(S, (x, y, o) => {
      const n = fbm(x / 64, y / 64, 61, 3, 4);
      const n2 = fbm(x / 16, y / 32, 63, 2, 16, 8);
      const f = 0.78 + n * 0.32 + n2 * 0.08;
      o[0] = 18 * f; o[1] = 70 * f; o[2] = clamp(168 * f, 0, 255);
    });

    this.stone = art('stone') || this.gen(S, (x, y, o) => {
      const ty = Math.floor(y / 64), off = (ty % 2) * 32;
      const tx = Math.floor(wrapi(x + off, S) / 64);
      const lx = wrapi(x + off, 64), ly = y % 64;
      const edge = Math.min(lx, ly, 63 - lx, 63 - ly);
      const tint = hash2(tx, ty, 71);
      const n = fbm(x / 16, y / 16, 73, 2, 16);
      const gr = hash2(x, y, 3);
      let f;
      if (edge < 2) f = 0.42;
      else {
        f = (0.8 + tint * 0.22) * (0.88 + n * 0.22) + (gr - 0.5) * 0.06;
        if (edge === 2) f *= (lx < 32 && ly < 32) ? 1.12 : 0.85;
      }
      o[0] = clamp(146 * f, 0, 255); o[1] = clamp(138 * f, 0, 255); o[2] = clamp(126 * f, 0, 255);
    });

    this.metal = art('metal') || this.gen(S, (x, y, o) => {
      const lx = x % 64, ly = y % 64;
      const edge = Math.min(lx, ly, 63 - lx, 63 - ly);
      const tx = Math.floor(x / 64), ty = Math.floor(y / 64);
      const tint = hash2(tx, ty, 91);
      const tread = ((lx + ly) % 10 < 2 && edge > 6) ? 1.08 : 1;
      const rivet = (Math.hypot(lx - 6, ly - 6) < 2.2 || Math.hypot(lx - 57, ly - 6) < 2.2 || Math.hypot(lx - 6, ly - 57) < 2.2 || Math.hypot(lx - 57, ly - 57) < 2.2);
      const n = fbm(x / 32, y / 32, 93, 2, 8);
      let f = (0.82 + tint * 0.12 + n * 0.12) * tread;
      if (edge < 1.5) f = 0.45; else if (edge < 3) f *= 1.15;
      if (rivet) f = 1.3;
      o[0] = clamp(88 * f, 0, 255); o[1] = clamp(97 * f, 0, 255); o[2] = clamp(106 * f, 0, 255);
    });

    this.rock = art('rock') || this.gen(S, (x, y, o) => {
      const n = fbm(x / 48 * 0.75, y / 48 * 0.75, 101, 4, 4);
      const cr = fbm(x / 32, y / 32, 107, 3, 8);
      const gr = hash2(x, y, 11);
      let f = 0.62 + n * 0.5 + (gr - 0.5) * 0.1;
      if (Math.abs(cr - 0.5) < 0.012) f *= 0.6;
      o[0] = clamp(92 * f, 0, 255); o[1] = clamp(84 * f, 0, 255); o[2] = clamp(88 * f, 0, 255);
    });

    this.caustic = this.gen(S, (x, y, o) => {
      const v = fbm(x / 64, y / 64, 81, 3, 4);
      const v2 = fbm(x / 32 + 3, y / 32, 83, 2, 8);
      const r1 = 1 - Math.abs(2 * v - 1), r2 = 1 - Math.abs(2 * v2 - 1);
      const a = Math.pow(r1, 14) * 0.9 + Math.pow(r2, 18) * 0.6;
      o[0] = 200; o[1] = 235; o[2] = 255; o[3] = clamp(a * 255, 0, 255);
    });

    this.buildSprites();
  },

  // ---------- sprites ----------
  buildSprites() {
    const R = mulberry32(777);
    this.trees = [];
    for (let v = 0; v < 10; v++) this.trees.push(this.makeTree(48, R, v));
    this.pines = [];
    for (let v = 0; v < 4; v++) this.pines.push(this.makeTree(48, R, v, true));
    this.palms = [];
    for (let v = 0; v < 3; v++) this.palms.push(this.makePalm(46, R));
    this.rocks = [];
    for (let v = 0; v < 8; v++) this.rocks.push(this.makeRock(48, R, false));
    this.drocks = [];
    for (let v = 0; v < 8; v++) this.drocks.push(this.makeRock(48, R, true));
    this.cacti = [];
    for (let v = 0; v < 3; v++) this.cacti.push(this.makeCactus(16, R));
    this.pillar = this.makePillar(28, false);
    this.pillarBroken = this.makePillar(28, true);
    this.crate = this.makeCrate(20);
    this.barrel = this.makeBarrel(15);
  },

  makeTree(r, R, v, pine) {
    const pad = 8, S = (r + pad) * 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const hue = pine ? [12, 80, 30] : [18, 110, 24];
    const lobes = pine ? 1 : 6 + Math.floor(R() * 3);
    const drawLobe = (lx, ly, lr, shade) => {
      const gr = g.createRadialGradient(lx - lr * 0.35, ly - lr * 0.4, lr * 0.1, lx, ly, lr);
      gr.addColorStop(0, `rgb(${hue[0] + 70 * shade},${hue[1] + 90 * shade},${hue[2] + 40 * shade})`);
      gr.addColorStop(0.6, `rgb(${hue[0] + 20},${hue[1] + 30},${hue[2] + 8})`);
      gr.addColorStop(1, `rgb(${hue[0] - 6},${hue[1] - 45},${hue[2] - 10})`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(lx, ly, lr, 0, TAU); g.fill();
    };
    if (pine) {
      // star-like conifer from top
      const spikes = 9;
      for (let layer = 0; layer < 3; layer++) {
        const rr = r * (1 - layer * 0.28);
        g.beginPath();
        for (let i = 0; i <= spikes * 2; i++) {
          const a = (i / (spikes * 2)) * TAU + layer * 0.3;
          const k = i % 2 === 0 ? rr : rr * 0.62;
          g.lineTo(Math.cos(a) * k, Math.sin(a) * k);
        }
        g.closePath();
        const sh = 0.2 + layer * 0.25;
        g.fillStyle = `rgb(${14 + 40 * sh},${70 + 70 * sh},${34 + 30 * sh})`;
        g.fill();
        g.strokeStyle = 'rgba(0,30,10,0.5)'; g.lineWidth = 1.5; g.stroke();
      }
    } else {
      g.fillStyle = 'rgba(8,50,10,1)';
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * TAU + R() * 0.5;
        const d = r * (0.42 + R() * 0.12);
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.5 + 2, 0, TAU); g.fill();
      }
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * TAU + R() * 0.5;
        const d = r * (0.4 + R() * 0.12);
        drawLobe(Math.cos(a) * d, Math.sin(a) * d, r * 0.5, 0.2 + R() * 0.2);
      }
      drawLobe(-r * 0.08, -r * 0.1, r * 0.55, 0.45);
      // leaf speckles
      for (let i = 0; i < 90; i++) {
        const a = R() * TAU, d = Math.sqrt(R()) * r * 0.9;
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        const light = (-x - y) / (r * 1.4) + 0.5;
        g.fillStyle = light > 0.55 ? `rgba(150,230,110,${0.25 + R() * 0.25})` : `rgba(0,40,0,${0.2 + R() * 0.25})`;
        g.beginPath(); g.arc(x, y, 1.5 + R() * 2.5, 0, TAU); g.fill();
      }
    }
    return c;
  },

  makePalm(r, R) {
    const pad = 6, S = (r + pad) * 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.3;
      g.save(); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, r, 0);
      gr.addColorStop(0, '#2e7d1f'); gr.addColorStop(1, '#7ccf4a');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(r * 0.5, -r * 0.22, r, 0);
      g.quadraticCurveTo(r * 0.5, r * 0.22, 0, 0);
      g.fill();
      g.strokeStyle = 'rgba(20,70,10,0.8)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(r, 0); g.stroke();
      g.restore();
    }
    g.fillStyle = '#7a5a2a'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
    g.fillStyle = '#5a3e1a'; g.beginPath(); g.arc(-3, 2, 3, 0, TAU); g.arc(3, 2, 3, 0, TAU); g.fill();
    return c;
  },

  makeRock(r, R, desert) {
    const pad = 4, S = (r + pad) * 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const n = 9 + Math.floor(R() * 4);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (R() - 0.5) * 0.4;
      const k = r * (0.78 + R() * 0.22);
      pts.push([Math.cos(a) * k, Math.sin(a) * k]);
    }
    const base = desert ? [176, 132, 92] : [132, 128, 122];
    const gr = g.createLinearGradient(-r, -r, r, r);
    gr.addColorStop(0, `rgb(${base[0] + 50},${base[1] + 50},${base[2] + 46})`);
    gr.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
    gr.addColorStop(1, `rgb(${base[0] - 60},${base[1] - 60},${base[2] - 55})`);
    g.fillStyle = gr;
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
    g.strokeStyle = `rgba(30,24,20,0.7)`; g.lineWidth = 2; g.stroke();
    // facets
    g.save(); g.clip();
    const cx = (R() - 0.5) * r * 0.4, cy = (R() - 0.5) * r * 0.4;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const light = (-mx - my) / (r * 1.5) + 0.5;
      g.fillStyle = light > 0.5 ? `rgba(255,255,255,${(light - 0.5) * 0.35})` : `rgba(0,0,0,${(0.5 - light) * 0.4})`;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < n; i++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)';
      g.fillRect((R() - 0.5) * r * 2, (R() - 0.5) * r * 2, 2, 2);
    }
    if (!desert && R() > 0.4) { // moss
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(60,140,40,${0.3 + R() * 0.3})`;
        g.beginPath(); g.arc(-r * 0.3 + (R() - 0.5) * r * 0.6, -r * 0.3 + (R() - 0.5) * r * 0.6, 2 + R() * 4, 0, TAU); g.fill();
      }
    }
    g.restore();
    return c;
  },

  makeCactus(r, R) {
    const S = (r + 6) * 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    gr.addColorStop(0, '#8fe07a'); gr.addColorStop(0.6, '#3f9a3a'); gr.addColorStop(1, '#1f5a22');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(15,60,20,0.8)'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(200,255,180,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke(); }
    g.fillStyle = '#fff8e0';
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.fillRect(Math.cos(a) * (r + 2) - 0.5, Math.sin(a) * (r + 2) - 0.5, 1.5, 1.5); }
    if (R() > 0.4) { g.fillStyle = '#ff5fa2'; g.beginPath(); g.arc(r * 0.2, -r * 0.2, 3, 0, TAU); g.fill(); }
    return c;
  },

  makePillar(r, broken) {
    const S = (r + 6) * 2;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, 2, 0, 0, r);
    gr.addColorStop(0, '#d8cfbe'); gr.addColorStop(0.7, '#8f8676'); gr.addColorStop(1, '#4e473e');
    g.fillStyle = gr;
    g.beginPath();
    if (broken) {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const k = r * (0.75 + ((i * 37) % 7) / 25); g.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
      g.closePath();
    } else g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(40,34,28,0.8)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 2.5, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(0, 0, r * 0.55, 0, TAU); g.stroke();
    if (broken) { g.strokeStyle = 'rgba(30,20,10,0.6)'; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.1); g.lineTo(0, r * 0.1); g.lineTo(r * 0.3, -r * 0.4); g.stroke(); }
    // glyph glow
    g.fillStyle = 'rgba(199,125,255,0.5)';
    g.fillRect(-2, -r * 0.3, 4, r * 0.6);
    return c;
  },

  makeCrate(r) {
    const S = r * 2 + 8;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    g.fillStyle = '#8a5a2b'; g.fillRect(-r, -r, r * 2, r * 2);
    g.fillStyle = '#a8743c';
    for (let i = 0; i < 4; i++) g.fillRect(-r + 2, -r + 2 + i * (r / 2), r * 2 - 4, r / 2 - 3);
    g.strokeStyle = '#4a2c12'; g.lineWidth = 3; g.strokeRect(-r, -r, r * 2, r * 2);
    g.lineWidth = 4; g.beginPath(); g.moveTo(-r, -r); g.lineTo(r, r); g.moveTo(r, -r); g.lineTo(-r, r); g.stroke();
    g.fillStyle = '#c9c9c9';
    [[-r + 3, -r + 3], [r - 5, -r + 3], [-r + 3, r - 5], [r - 5, r - 5]].forEach(([x, y]) => g.fillRect(x, y, 2, 2));
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-r, -r, r * 2, 3);
    return c;
  },

  makeBarrel(r) {
    const S = r * 2 + 8;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    gr.addColorStop(0, '#ff8a70'); gr.addColorStop(0.6, '#d6281a'); gr.addColorStop(1, '#6e0e08');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = '#3a0804'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.72, 0, TAU); g.stroke();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(0, -r * 0.5); g.lineTo(r * 0.45, r * 0.3); g.lineTo(-r * 0.45, r * 0.3); g.closePath(); g.fill();
    g.fillStyle = '#1a1a1a'; g.fillRect(-1, -r * 0.25, 2, r * 0.3); g.fillRect(-1, r * 0.12, 2, 2);
    return c;
  },
};
