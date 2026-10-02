// Procedural WebAudio sound engine: no asset files.
class Audio {
  constructor() { this.ctx = null; this.master = null; this.muted = localStorage.getItem('wr_mute') === '1'; this.musicOn = false; this._musicTimer = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.mus = this.ctx.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    const len = this.ctx.sampleRate * 1.5; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
  }
  setMuted(m) { this.muted = m; localStorage.setItem('wr_mute', m ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02); }
  _osc(type, f0, f1, t0, dur, vol, dest = this.sfx) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(t0, dur, vol, type = 'bandpass', f0 = 2000, f1 = 400, q = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  whipCrack() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.05, 0.9, 'highpass', 3000, 6000); this._noise(t + 0.03, 0.18, 0.6, 'bandpass', 2500, 300, 0.7); this._osc('square', 900, 120, t, 0.08, 0.15); }
  whoosh() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.5, 0.35, 'bandpass', 400, 1800, 0.8); }
  coin(combo = 1) { if (!this.ctx) return; const t = this.ctx.currentTime; const base = 880 * Math.pow(1.06, Math.min(combo, 12)); this._osc('sine', base, base, t, 0.08, 0.25); this._osc('sine', base * 1.5, base * 1.5, t + 0.07, 0.12, 0.22); }
  hit() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 160, 40, t, 0.25, 0.8); this._noise(t, 0.22, 0.6, 'lowpass', 1200, 200); }
  smash() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.35, 0.8, 'lowpass', 1800, 150, 0.5); this._osc('triangle', 220, 60, t, 0.3, 0.5); this._osc('square', 90, 40, t, 0.2, 0.3); }
  squish() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sawtooth', 500, 90, t, 0.18, 0.3); this._noise(t, 0.15, 0.4, 'bandpass', 900, 300); }
  clank() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('square', 1400, 500, t, 0.1, 0.18); this._osc('triangle', 2200, 900, t, 0.14, 0.12); this._noise(t, 0.08, 0.5, 'highpass', 4000, 7000); }
  wood() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.25, 0.7, 'bandpass', 1400, 500, 1.5); this._osc('triangle', 300, 120, t, 0.12, 0.3); }
  grab() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 500, 1100, t, 0.18, 0.3); this._noise(t, 0.08, 0.5, 'highpass', 2500, 5000); }
  swing() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.9, 0.45, 'bandpass', 300, 2400, 0.6); this._osc('sine', 300, 700, t, 0.6, 0.12); }
  land() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.12, 0.4, 'lowpass', 900, 200); }
  jump() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 350, 700, t, 0.14, 0.18); }
  power() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.06, 0.25, 0.25)); }
  levelUp() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1046, 1318].forEach((f, i) => this._osc('square', f, f, t + i * 0.07, 0.3, 0.12)); this._osc('sine', 262, 262, t, 0.6, 0.2); }
  stumble() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sawtooth', 200, 80, t, 0.3, 0.25); }
  death() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sawtooth', 400, 60, t, 0.9, 0.4); this._noise(t, 0.6, 0.6, 'lowpass', 2000, 100); }
  fall() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc('sine', 800, 120, t, 1.1, 0.3); }

  // Simple adventure-ish music loop: kick/hat + bass arpeggio + pad, generated per bar.
  startMusic() {
    if (!this.ctx || this.musicOn) return; this.musicOn = true;
    const bpm = 128; const beat = 60 / bpm; let bar = 0; let next = this.ctx.currentTime + 0.05;
    const roots = [0, 0, -4, -2, 0, 0, 3, 5]; // semitone offsets from D
    const base = 73.42; // D2
    const schedule = () => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.6) {
        const root = base * Math.pow(2, roots[bar % roots.length] / 12);
        for (let i = 0; i < 8; i++) {
          const t = next + i * beat / 2;
          if (i % 2 === 0) { this._kick(t); }
          this._hat(t, i % 2 ? 0.08 : 0.14);
          const arp = [0, 7, 12, 7, 3, 7, 12, 15][i];
          this._osc('sawtooth', root * Math.pow(2, arp / 12) * 2, root * Math.pow(2, arp / 12) * 2, t, beat * 0.45, 0.07, this.mus);
          this._osc('square', root * 2, root * 2, t, beat * 0.25, 0.05, this.mus);
        }
        if (bar % 2 === 0) { this._pad(next, root * 4, beat * 8); this._pad(next, root * 4 * Math.pow(2, 7 / 12), beat * 8); }
        next += beat * 4; bar++;
      }
      this._musicTimer = setTimeout(schedule, 200);
    };
    schedule();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this._musicTimer); }
  _kick(t) { const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 0.22); }
  _hat(t, v) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(this.mus); s.start(t); s.stop(t + 0.06); }
  _pad(t, f, dur) { const o = this.ctx.createOscillator(); o.type = 'triangle'; const g = this.ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.4); g.gain.setValueAtTime(0.06, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.05); }
}
export const audio = new Audio();
