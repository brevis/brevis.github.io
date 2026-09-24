// Синтезированный звук (без файлов) + вибро. На iOS в Capacitor подключи @capacitor/haptics —
// тогда используется он, иначе navigator.vibrate (Android).

let ac = null, master = null, noise = null;
let enabled = true;

export function setSound(on) { enabled = on; }
export function soundOn() { return enabled; }

export function unlockAudio() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.7;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ac.destination);
      const len = ac.sampleRate * 0.6;
      noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { /* без звука */ }
}

function ok() { return enabled && ac && ac.state === 'running'; }

function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function burst(filterType, f0, f1, dur, vol, delay = 0) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
}

export const sfx = {
  pick() { if (!ok()) return; tone('sine', 520, 820, 0.07, 0.18); },
  snap() { if (!ok()) return; tone('square', 1400, 1400, 0.018, 0.04); },
  drop() { if (!ok()) return; tone('triangle', 300, 120, 0.1, 0.25); },
  invalid() { if (!ok()) return; tone('sawtooth', 200, 110, 0.14, 0.08); },
  // power 0..1, step — номер волны в цепочке (тон растёт — «сочнее» комбо)
  boom(power = 0.5, step = 0) {
    if (!ok()) return;
    const p = 1 + step * 0.12;
    burst('lowpass', 2400 * p, 180, 0.28 + power * 0.25, 0.5 + power * 0.4);
    tone('sine', 140 * p, 38, 0.25 + power * 0.2, 0.7 + power * 0.3);
    if (power > 0.6) burst('bandpass', 900, 200, 0.5, 0.35, 0.03);
  },
  crack() { if (!ok()) return; tone('triangle', 2200, 900, 0.06, 0.2); burst('highpass', 3000, 1500, 0.08, 0.2); },
  fire() { if (!ok()) return; burst('bandpass', 700, 2500, 0.35, 0.4); },
  laser() { if (!ok()) return; tone('sawtooth', 1800, 300, 0.3, 0.12); tone('square', 900, 150, 0.3, 0.06); },
  firework(i = 0) {
    if (!ok()) return;
    burst('highpass', 3000, 800, 0.4, 0.35);
    tone('sine', 700 + i * 90, 1400 + i * 120, 0.15, 0.12);
  },
  star(i) { if (!ok()) return; tone('sine', 880 * (1 + i * 0.26), 880 * (1 + i * 0.26), 0.35, 0.22); tone('triangle', 1760 * (1 + i * 0.26), 1760 * (1 + i * 0.26), 0.2, 0.06); },
  win() {
    if (!ok()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.22, 0.2, i * 0.09));
  },
  fail() { if (!ok()) return; [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.25, 0.18, i * 0.13)); },
  click() { if (!ok()) return; tone('sine', 900, 700, 0.04, 0.12); },
  // обвал: низкий гул и осыпающаяся крошка
  collapse(n = 4) {
    if (!ok()) return;
    tone('sine', 90, 40, 0.5, 0.5);
    burst('lowpass', 900, 120, 0.6, 0.45);
    for (let i = 0; i < Math.min(5, 1 + (n >> 2)); i++) burst('bandpass', 1800 - i * 200, 600, 0.12, 0.18, 0.08 + i * 0.07);
  },
  // комбо: звонкий аккорд, с каждым шагом выше
  combo(step = 1) {
    if (!ok()) return;
    const base = 520 * Math.pow(1.12, Math.min(step, 8));
    [1, 1.25, 1.5].forEach((m, i) => tone('triangle', base * m, base * m, 0.18, 0.12, i * 0.04));
  },
  tick() { if (!ok()) return; tone('square', 1800, 1800, 0.02, 0.05); },
  timeUp() { if (!ok()) return; [660, 520, 390].forEach((f, i) => tone('sawtooth', f, f * 0.97, 0.22, 0.1, i * 0.14)); },
};

export function haptic(kind = 'light') {
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H && H.impact) { H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); return; }
    if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 22 : 10);
  } catch (e) { /* ignore */ }
}
