// Rotating missions with a persistent score multiplier (Subway Surfers style meta loop).
const POOL = [
  { id: 'whip10', text: 'Whip 10 enemies', key: 'kills', target: 10 },
  { id: 'swing3', text: 'Swing on 3 hooks', key: 'swings', target: 3 },
  { id: 'coins80', text: 'Collect 80 coins in one run', key: 'coins', target: 80, run: true },
  { id: 'dj5', text: 'Double jump 5 times', key: 'djumps', target: 5 },
  { id: 'dist600', text: 'Run 600 m in one run', key: 'dist', target: 600, run: true },
  { id: 'slam3', text: 'Ground slam 3 enemies', key: 'slamKills', target: 3 },
  { id: 'rush1', text: 'Trigger WHIP RUSH', key: 'rushes', target: 1 },
  { id: 'hop5', text: 'Hop over 5 threats', key: 'hops', target: 5 },
  { id: 'perfect3', text: '3 PERFECT releases', key: 'perfects', target: 3 },
  { id: 'whip40', text: 'Whip 40 enemies', key: 'kills', target: 40 },
  { id: 'coins200', text: 'Collect 200 coins in one run', key: 'coins', target: 200, run: true },
  { id: 'swing12', text: 'Swing on 12 hooks', key: 'swings', target: 12 },
  { id: 'dist1200', text: 'Run 1200 m in one run', key: 'dist', target: 1200, run: true },
  { id: 'golem5', text: 'Smash 5 golems', key: 'golems', target: 5 },
  { id: 'rush3', text: 'Trigger WHIP RUSH 3 times', key: 'rushes', target: 3 },
  { id: 'ledge5', text: 'Reach 5 upper ledges', key: 'ledges', target: 5 },
  { id: 'dist2000', text: 'Run 2000 m in one run', key: 'dist', target: 2000, run: true },
  { id: 'whip100', text: 'Whip 100 enemies', key: 'kills', target: 100 },
];
export class Missions {
  constructor(onComplete) {
    this.onComplete = onComplete; this.run = {};
    let st = null; try { st = JSON.parse(localStorage.getItem('wr_missions') || 'null'); } catch (e) { st = null; }
    this.state = st && st.active ? st : { idx: 0, active: [], progress: {}, done: 0 };
    while (this.state.active.length < 3 && this.state.idx < POOL.length) this.state.active.push(POOL[this.state.idx++].id);
    this.save();
  }
  save() { try { localStorage.setItem('wr_missions', JSON.stringify(this.state)); } catch (e) { } }
  get mult() { return Math.min(10, 1 + this.state.done); }
  runStart() { this.run = {}; }
  _check(m) {
    const p = this.state.progress[m.id] || 0; if (p < m.target) return;
    this.state.active = this.state.active.filter(id => id !== m.id); this.state.done++;
    if (this.state.idx < POOL.length) this.state.active.push(POOL[this.state.idx++].id);
    this.save(); if (this.onComplete) this.onComplete(m);
  }
  add(key, n = 1) {
    this.run[key] = (this.run[key] || 0) + n;
    for (const id of [...this.state.active]) { const m = POOL.find(x => x.id === id); if (!m || m.key !== key) continue;
      this.state.progress[id] = m.run ? Math.max(this.state.progress[id] || 0, this.run[key]) : (this.state.progress[id] || 0) + n; this._check(m); }
    this._dirty = true;
  }
  set(key, value) {
    this.run[key] = value;
    for (const id of [...this.state.active]) { const m = POOL.find(x => x.id === id); if (!m || m.key !== key || !m.run) continue;
      this.state.progress[id] = Math.max(this.state.progress[id] || 0, value); this._check(m); }
  }
  runEnd() { this.save(); }
  list() { return this.state.active.map(id => { const m = POOL.find(x => x.id === id); const p = Math.min(m.target, this.state.progress[id] || 0); return { text: m.text, progress: p, target: m.target, pct: p / m.target }; }); }
}
