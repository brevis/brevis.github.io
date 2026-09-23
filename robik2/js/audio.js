'use strict';
// Procedural sound: WebAudio synth SFX + a small adaptive sequencer for music.
const Snd = {
  ctx: null, master: null, sfx: null, mus: null, noiseBuf: null,
  muted: false, last: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
    const mlp = c.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 5200;
    this.mus = c.createGain(); this.mus.gain.value = 0.3; this.mus.connect(mlp); mlp.connect(this.master);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  },

  throttle(name, ms) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < ms) return false;
    this.last[name] = now;
    return true;
  },

  tone(o) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.slide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const v = Math.max(0.0002, o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.004));
    if (o.hold) g.gain.setValueAtTime(v, t + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.8; node.connect(f); node = f; }
    node.connect(g).connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },

  noise(o) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q || 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.dest || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  },

  // distance-attenuated play
  at(name, x, y, opt) {
    const p = G.player; if (!p) return this.play(name, opt);
    const d = dist(x, y, p.x, p.y);
    const k = clamp(1.15 - d / 1100, 0, 1);
    if (k <= 0.02) return;
    this.play(name, Object.assign({ k }, opt));
  },

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const k = opt.k == null ? 1 : opt.k;
    switch (name) {
      case 'shoot':
        if (!this.throttle('shoot', 45)) return;
        this.tone({ type: 'square', f0: 1300 + rand(-80, 80), f1: 260, dur: 0.07, vol: 0.05 * k, lp: 3800 });
        this.noise({ filter: 'highpass', f0: 3000, dur: 0.035, vol: 0.035 * k });
        break;
      case 'eshoot':
        if (!this.throttle('eshoot', 60)) return;
        this.tone({ type: 'sawtooth', f0: 520, f1: 180, dur: 0.1, vol: 0.05 * k, lp: 2200 });
        break;
      case 'spit':
        this.noise({ filter: 'bandpass', f0: 700, f1: 300, q: 3, dur: 0.18, vol: 0.12 * k });
        this.tone({ type: 'sine', f0: 300, f1: 120, dur: 0.15, vol: 0.06 * k });
        break;
      case 'hit':
        if (!this.throttle('hit', 30)) return;
        this.noise({ filter: 'bandpass', f0: 2400 + rand(-400, 400), q: 1.5, dur: 0.05, vol: 0.09 * k });
        this.tone({ type: 'square', f0: 220, f1: 90, dur: 0.05, vol: 0.03 * k });
        break;
      case 'crit':
        this.tone({ type: 'triangle', f0: 1800, f1: 900, dur: 0.09, vol: 0.07 * k });
        break;
      case 'metal':
        if (!this.throttle('metal', 40)) return;
        this.tone({ type: 'triangle', f0: 1900 + rand(-200, 200), f1: 1500, dur: 0.12, vol: 0.05 * k });
        break;
      case 'die':
        this.noise({ filter: 'lowpass', f0: 1400, f1: 180, dur: 0.28, vol: 0.2 * k });
        this.tone({ type: 'sine', f0: 170, f1: 45, dur: 0.25, vol: 0.18 * k });
        this.noise({ filter: 'bandpass', f0: 900, q: 4, dur: 0.12, vol: 0.08 * k, delay: 0.02 });
        break;
      case 'explode': {
        const big = opt.big ? 1.6 : 1;
        this.noise({ filter: 'lowpass', f0: 1800, f1: 90, dur: 0.7 * big, vol: 0.4 * k * Math.min(1.3, big) });
        this.tone({ type: 'sine', f0: 110, f1: 28, dur: 0.6 * big, vol: 0.35 * k });
        this.noise({ filter: 'highpass', f0: 2500, dur: 0.08, vol: 0.12 * k });
        break;
      }
      case 'pickup': {
        const p = opt.pitch || 1;
        if (!this.throttle('pickup', 25)) return;
        this.tone({ type: 'triangle', f0: 880 * p, f1: 1760 * p, dur: 0.08, vol: 0.06 });
        break;
      }
      case 'heal':
        if (!this.throttle('heal', 120)) return;
        this.tone({ type: 'sine', f0: 660, f1: 990, dur: 0.12, vol: 0.05 });
        break;
      case 'item':
        [0, 4, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', f0: 523 * Math.pow(2, s / 12), dur: 0.22, vol: 0.09, delay: i * 0.06 }));
        this.tone({ type: 'sine', f0: 1046, dur: 0.5, vol: 0.05, delay: 0.24 });
        break;
      case 'levelup':
        [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone({ type: 'square', f0: 392 * Math.pow(2, s / 12), dur: 0.16, vol: 0.05, delay: i * 0.055, lp: 3000 }));
        this.tone({ type: 'triangle', f0: 1568, dur: 0.7, vol: 0.07, delay: 0.33 });
        break;
      case 'select':
        this.tone({ type: 'triangle', f0: 660, f1: 1320, dur: 0.12, vol: 0.08 });
        this.tone({ type: 'sine', f0: 1320, dur: 0.3, vol: 0.05, delay: 0.08 });
        break;
      case 'dash':
        this.noise({ filter: 'bandpass', f0: 500, f1: 2600, q: 1.2, dur: 0.18, vol: 0.14 });
        this.tone({ type: 'sine', f0: 300, f1: 700, dur: 0.12, vol: 0.05 });
        break;
      case 'hurt':
        this.tone({ type: 'square', f0: 180, f1: 60, dur: 0.22, vol: 0.12, lp: 1400 });
        this.noise({ filter: 'lowpass', f0: 1200, f1: 300, dur: 0.18, vol: 0.14 });
        break;
      case 'emp':
        this.tone({ type: 'sine', f0: 60, f1: 30, dur: 0.9, vol: 0.4 });
        this.tone({ type: 'sawtooth', f0: 200, f1: 1600, dur: 0.35, vol: 0.08, lp: 3000 });
        this.noise({ filter: 'bandpass', f0: 400, f1: 4000, q: 0.8, dur: 0.6, vol: 0.22 });
        break;
      case 'empready':
        this.tone({ type: 'triangle', f0: 880, dur: 0.1, vol: 0.06 });
        this.tone({ type: 'triangle', f0: 1320, dur: 0.18, vol: 0.06, delay: 0.09 });
        break;
      case 'quest':
        [0, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', f0: 440 * Math.pow(2, s / 12), dur: 0.9, vol: 0.06, delay: i * 0.08, attack: 0.02 }));
        [4, 16].forEach((s, i) => this.tone({ type: 'sine', f0: 440 * Math.pow(2, s / 12), dur: 1.1, vol: 0.05, delay: 0.25 + i * 0.1, attack: 0.03 }));
        break;
      case 'beep':
        this.tone({ type: 'square', f0: opt.f || 1400, dur: 0.05, vol: 0.05 * k, lp: 4000 });
        break;
      case 'type':
        if (!this.throttle('type', 38)) return;
        this.tone({ type: 'square', f0: opt.f || rand(900, 1300), dur: 0.02, vol: 0.012, lp: 3000 });
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone({ type: 'sawtooth', f0: 520, dur: 0.22, vol: 0.06, delay: i * 0.5, lp: 1800 });
          this.tone({ type: 'sawtooth', f0: 390, dur: 0.22, vol: 0.06, delay: i * 0.5 + 0.25, lp: 1800 });
        }
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', f0: 70, f1: 40, dur: 1.6, vol: 0.22, lp: 600, attack: 0.1, detune: 10 });
        this.tone({ type: 'sawtooth', f0: 73, f1: 38, dur: 1.6, vol: 0.18, lp: 500, attack: 0.1, detune: -12 });
        this.noise({ filter: 'lowpass', f0: 600, f1: 100, dur: 1.5, vol: 0.2, attack: 0.1 });
        break;
      case 'charge':
        this.tone({ type: 'sawtooth', f0: 120, f1: 900, dur: opt.dur || 0.8, slide: opt.dur || 0.8, vol: 0.07 * k, lp: 2500, attack: 0.05, hold: (opt.dur || 0.8) * 0.8 });
        break;
      case 'laser':
        if (!this.throttle('laser', 90)) return;
        this.tone({ type: 'sawtooth', f0: 95 + rand(-5, 5), dur: 0.12, vol: 0.07 * k, lp: 1600 });
        this.noise({ filter: 'bandpass', f0: 3000, q: 2, dur: 0.1, vol: 0.03 * k });
        break;
      case 'zap':
        this.noise({ filter: 'highpass', f0: 4000, dur: 0.07, vol: 0.08 * k });
        this.tone({ type: 'sawtooth', f0: 1600, f1: 400, dur: 0.07, vol: 0.04 * k });
        break;
      case 'stomp':
        this.tone({ type: 'sine', f0: 90, f1: 25, dur: 0.7, vol: 0.45 });
        this.noise({ filter: 'lowpass', f0: 500, f1: 60, dur: 0.6, vol: 0.3 });
        break;
      case 'gate':
        this.tone({ type: 'sawtooth', f0: 55, f1: 45, dur: 1.8, vol: 0.12, lp: 300, attack: 0.1 });
        this.noise({ filter: 'lowpass', f0: 400, dur: 1.8, vol: 0.12, attack: 0.2 });
        break;
      case 'powerdown':
        this.tone({ type: 'sawtooth', f0: 600, f1: 40, dur: 1.2, vol: 0.1, lp: 2000 });
        break;
      case 'emerge':
        this.noise({ filter: 'lowpass', f0: 500, f1: 150, dur: 0.35, vol: 0.1 * k });
        break;
      case 'ui':
        this.tone({ type: 'triangle', f0: 1200, dur: 0.05, vol: 0.04 });
        break;
    }
  },
};

// ---------- Music ----------
const Music = {
  playing: false, step: 0, next: 0, intensity: 0, mode: 'explore',
  tempo: 108,
  prog: {
    explore: [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]],
    boss: [[45, 57, 60, 64], [46, 58, 62, 65], [45, 57, 60, 64], [44, 56, 59, 64]],
  },

  start() {
    if (!Snd.ctx) return;
    this.playing = true;
    this.next = Snd.ctx.currentTime + 0.1;
    this.step = 0;
  },

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.tempo = m === 'boss' ? 136 : 108;
  },

  update() {
    if (!this.playing || !Snd.ctx || Snd.muted) return;
    const c = Snd.ctx;
    if (this.next < c.currentTime - 0.25) this.next = c.currentTime + 0.05;
    const spb = 60 / this.tempo / 4;
    while (this.next < c.currentTime + 0.15) {
      this.schedule(this.step, this.next, spb);
      this.next += spb;
      this.step++;
    }
  },

  mtof: (m) => 440 * Math.pow(2, (m - 69) / 12),

  schedule(step, t, spb) {
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    const ch = this.prog[this.mode][bar];
    const I = this.intensity;
    const out = Snd.mus;
    const dl = t - Snd.ctx.currentTime;
    const boss = this.mode === 'boss';

    // pad
    if (s === 0) {
      for (let i = 1; i < 4; i++) {
        Snd.tone({ type: 'triangle', f0: this.mtof(ch[i]), dur: spb * 16, attack: spb * 4, vol: 0.045, delay: dl, dest: out, lp: 1400 });
      }
    }
    // bass
    const bassHits = I === 0 ? [0, 8, 11] : boss ? [0, 2, 3, 6, 8, 10, 11, 14] : [0, 3, 6, 8, 10, 14];
    if (bassHits.includes(s)) {
      const oct = (s === 8 && I > 0) ? 12 : 0;
      Snd.tone({ type: 'sawtooth', f0: this.mtof(ch[0] - 12 + oct), dur: spb * 1.8, vol: I === 0 ? 0.09 : 0.12, delay: dl, dest: out, lp: I === 0 ? 420 : 700, q: 4 });
    }
    // arp
    if (I >= 1) {
      const notes = [ch[1], ch[2], ch[3], ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[3], ch[1] + 12];
      const n = notes[s % 8] + (boss ? 0 : 12);
      Snd.tone({ type: 'square', f0: this.mtof(n), dur: spb * 0.8, vol: 0.022, delay: dl, dest: out, lp: 2600 });
    } else if (s % 4 === 2) {
      const n = ch[1 + ((step >> 2) % 3)] + 12;
      Snd.tone({ type: 'sine', f0: this.mtof(n), dur: spb * 3, vol: 0.03, delay: dl, dest: out });
    }
    // drums
    if (I >= 1) {
      if (s % 4 === 0 || (boss && s === 14)) {
        Snd.tone({ type: 'sine', f0: 150, f1: 42, slide: 0.12, dur: 0.22, vol: 0.32, delay: dl, dest: out });
      }
      if (s === 4 || s === 12) {
        Snd.noise({ filter: 'bandpass', f0: 1800, q: 0.7, dur: 0.14, vol: 0.12, delay: dl, dest: out });
        Snd.tone({ type: 'triangle', f0: 200, f1: 120, dur: 0.08, vol: 0.07, delay: dl, dest: out });
      }
      if (s % 2 === 0 || I >= 2) {
        Snd.noise({ filter: 'highpass', f0: 7000, dur: s % 4 === 2 ? 0.07 : 0.03, vol: s % 4 === 2 ? 0.05 : 0.025, delay: dl, dest: out });
      }
    } else if (s === 0 || s === 8) {
      Snd.noise({ filter: 'highpass', f0: 6000, dur: 0.05, vol: 0.015, delay: dl, dest: out });
    }
  },
};
