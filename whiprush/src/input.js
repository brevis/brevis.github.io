// Keyboard + pointer (mouse/touch, multi-touch) input.
// Emits: left, right, jump, whip(dir: fwd|left|right|low), charge(true|false), any
const HOLD_MS = 150; // a press held this long without moving counts as a tap right away (no waiting for release)
export class Input {
  constructor(el) {
    this.handlers = {}; this.ptrs = new Map(); this.keyHeld = null;
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if (k === 'ArrowLeft' || k === 'KeyA') this.emit('left');
      else if (k === 'ArrowRight' || k === 'KeyD') this.emit('right');
      else if (k === 'ArrowUp' || k === 'KeyW') this.emit('jump');
      else if (k === 'ArrowDown' || k === 'KeyS') this.emit('whip', 'low');
      else if (k === 'KeyQ' || k === 'KeyZ') this.emit('whip', 'left');
      else if (k === 'KeyE' || k === 'KeyC') this.emit('whip', 'right');
      else if (k === 'Space' || k === 'Enter' || k === 'KeyF') { this.emit('whip', 'fwd'); this.keyHeld = k; this.emit('charge', true); }
      this.emit('any');
    });
    window.addEventListener('keyup', (e) => { if (this.keyHeld && e.code === this.keyHeld) { this.keyHeld = null; this.emit('charge', false); } });
    window.addEventListener('blur', () => { if (this.keyHeld) { this.keyHeld = null; this.emit('charge', false); } });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const st = { x: e.clientX, y: e.clientY, swiped: false, fired: false, timer: 0 };
      st.timer = setTimeout(() => { if (!st.swiped && !st.fired) { st.fired = true; this.emit('whip', this._zone(st.x)); this.emit('charge', true); } }, HOLD_MS);
      this.ptrs.set(e.pointerId, st); this.emit('any');
    });
    window.addEventListener('pointermove', (e) => {
      const st = this.ptrs.get(e.pointerId); if (!st || st.swiped) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      const th = Math.max(14, Math.min(window.innerWidth, window.innerHeight) * 0.03);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
      st.swiped = true; clearTimeout(st.timer); if (st.fired) this.emit('charge', false);
      if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
      else if (dy < 0) this.emit('jump'); else this.emit('whip', 'low');
    });
    const end = (e, cancel = false) => {
      const st = this.ptrs.get(e.pointerId); if (!st) return; this.ptrs.delete(e.pointerId); clearTimeout(st.timer);
      if (st.swiped) return;
      if (st.fired) { this.emit('charge', false); return; }
      if (!cancel) this.emit('whip', this._zone(st.x));
    };
    window.addEventListener('pointerup', (e) => end(e));
    window.addEventListener('pointercancel', (e) => end(e, true));
  }
  // tap on the outer quarter of the screen lashes the neighbouring lane
  _zone(x) { const w = window.innerWidth; return x < w * 0.25 ? 'left' : x > w * 0.75 ? 'right' : 'fwd'; }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, arg) { (this.handlers[name] || []).forEach(fn => fn(arg)); }
}
