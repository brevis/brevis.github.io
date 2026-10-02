// Keyboard + touch/mouse input. Emits: left, right, jump, whip, any
export class Input {
  constructor(el) {
    this.handlers = {}; this.el = el;
    this._touch = null; this._swiped = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') this.emit('left');
      else if (k === 'ArrowRight' || k === 'KeyD') this.emit('right');
      else if (k === 'ArrowUp' || k === 'KeyW') this.emit('jump');
      else if (k === 'Space' || k === 'Enter' || k === 'KeyF' || k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); this.emit('whip'); }
      this.emit('any');
    });
    const start = (x, y) => { this._touch = { x, y, t: performance.now() }; this._swiped = false; };
    const move = (x, y) => {
      if (!this._touch || this._swiped) return;
      const dx = x - this._touch.x, dy = y - this._touch.y;
      const TH = 28;
      if (Math.abs(dx) > TH && Math.abs(dx) > Math.abs(dy)) { this._swiped = true; this.emit(dx > 0 ? 'right' : 'left'); this.emit('any'); }
      else if (dy < -TH && Math.abs(dy) > Math.abs(dx)) { this._swiped = true; this.emit('jump'); this.emit('any'); }
      else if (dy > TH && Math.abs(dy) > Math.abs(dx)) { this._swiped = true; this.emit('whip'); this.emit('any'); }
    };
    const end = () => {
      if (this._touch && !this._swiped) { this.emit('whip'); this.emit('any'); }
      this._touch = null;
    };
    el.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; start(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; move(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', () => { this._touch = null; }, { passive: true });
    el.addEventListener('mousedown', (e) => { if (e.button === 0) start(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => { if (e.button === 0) end(); });
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name) { (this.handlers[name] || []).forEach(fn => fn()); }
}
