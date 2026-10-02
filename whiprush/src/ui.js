const $ = (id) => document.getElementById(id);
export class UI {
  constructor() {
    this.hud = $('hud'); this.menu = $('menu'); this.gameover = $('gameover'); this.loading = $('loading');
    this.dist = $('hud-distance'); this.score = $('hud-score'); this.level = $('hud-level'); this.coins = $('hud-coins');
    this.combo = $('hud-combo'); this.comboVal = $('combo-val'); this.power = $('hud-power'); this.hint = $('hint'); this.banner = $('banner');
    this.flashEl = document.createElement('div'); this.flashEl.className = 'flash'; document.body.appendChild(this.flashEl);
    this._lastScore = -1; this._lastDist = -1; this._lastCoins = -1; this._lastLevel = -1; this._lastCombo = -1; this._hintT = 0;
  }
  ready() { this.loading.classList.add('hidden'); }
  showMenu(best) { this.menu.classList.remove('hidden'); this.gameover.classList.add('hidden'); this.hud.classList.add('hidden'); $('menu-best').textContent = best > 0 ? `BEST: ${best}` : ''; }
  showHUD() { this.menu.classList.add('hidden'); this.gameover.classList.add('hidden'); this.hud.classList.remove('hidden'); }
  showGameOver({ score, distance, coins, best, newBest, title }) {
    $('go-title').textContent = title || 'WIPEOUT!'; $('go-score').textContent = score; $('go-dist').textContent = `${distance}m`; $('go-coins').textContent = coins; $('go-best').textContent = best;
    $('go-newbest').classList.toggle('hidden', !newBest); this.gameover.classList.remove('hidden');
  }
  setHUD({ score, distance, coins, level, combo, rush, mult }) {
    if (score !== this._lastScore) { this.score.textContent = score; this._lastScore = score; }
    if (mult !== this._lastMult) { this._lastMult = mult; const el = $('hud-mult'); if (el) { el.textContent = `x${mult}`; el.classList.toggle('hidden', !(mult > 1)); } }
    if (distance !== this._lastDist) { this.dist.textContent = `DISTANCE: ${distance}m`; this._lastDist = distance; }
    if (coins !== this._lastCoins) { this.coins.textContent = coins; this._lastCoins = coins; }
    if (level !== this._lastLevel) { this.level.textContent = `LEVEL ${level}`; this._lastLevel = level; }
    const rushEl = document.getElementById('rush-fill'); if (rushEl) rushEl.style.width = `${Math.min(1, rush || 0) * 100}%`;
    if (combo !== this._lastCombo) {
      this._lastCombo = combo;
      if (combo >= 2) { this.comboVal.textContent = `x${combo}`; this.combo.classList.remove('hidden'); this.combo.style.animation = 'none'; void this.combo.offsetWidth; this.combo.style.animation = ''; }
      else this.combo.classList.add('hidden');
    }
  }
  setPowerups(list) { // [{name, t, max}]
    if (!list.length) { this.power.classList.add('hidden'); this.power.innerHTML = ''; return; }
    this.power.classList.remove('hidden');
    this.power.innerHTML = list.map(p => `<div class="pw">${p.name}${p.max ? `<span class="bar"><i style="width:${Math.max(0, p.t / p.max) * 100}%"></i></span>` : ''}</div>`).join('');
  }
  renderMissions(list, mult, bank) {
    const html = list.map(m => `<div class="mission"><span class="mtext">${m.text}</span><span class="mbar"><i style="width:${Math.round(m.pct * 100)}%"></i></span><span class="mnum">${m.progress}/${m.target}</span></div>`).join('');
    for (const id of ['menu-missions', 'go-missions']) { const el = $(id); if (el) el.innerHTML = html; }
    const b = $('menu-bank'); if (b) b.textContent = bank; const mm = $('menu-mult'); if (mm) mm.textContent = mult;
  }
  showHint(text, dur = 1.2) { this.hint.textContent = text; this.hint.classList.remove('hidden'); this._hintT = dur; }
  hideHint() { this.hint.classList.add('hidden'); this._hintT = 0; }
  showBanner(text) { this.banner.textContent = text; this.banner.classList.remove('hidden'); this.banner.style.animation = 'none'; void this.banner.offsetWidth; this.banner.style.animation = ''; clearTimeout(this._bt); this._bt = setTimeout(() => this.banner.classList.add('hidden'), 1600); }
  flash(a = 0.5, color = '#fff') { this.flashEl.style.background = color; this.flashEl.style.transition = 'none'; this.flashEl.style.opacity = a; requestAnimationFrame(() => { this.flashEl.style.transition = 'opacity .35s'; this.flashEl.style.opacity = 0; }); }
  update(dt) { if (this._hintT > 0) { this._hintT -= dt; if (this._hintT <= 0) this.hideHint(); } }
}
