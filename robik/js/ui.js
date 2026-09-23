'use strict';
// DOM HUD, dialogue, minimap, level-up cards, screens.
const SPEAKERS = {
  iskra: { name: 'ИСКРА', cls: '' },
  zhuzha: { name: 'ЖУЖА', cls: 'zhuzha' },
  system: { name: 'СИСТЕМА', cls: 'system' },
  log: { name: 'ДАТА-ЛОГ', cls: 'log' },
  boss: { name: 'КОЛОСС', cls: 'boss' },
};

const UI = {
  el: {}, dq: [], cur: null, bannerT: 0, fogT: 0, comboT: 0, lastCombo: 0,

  init() {
    const $ = (s) => document.querySelector(s);
    this.el = {
      hud: $('#hud'), quest: $('#quest'), qTitle: $('.q-title'), qList: $('.q-list'),
      status: $('#status'), hpFill: $('.hp-fill'), hpLag: $('.hp-lag'), hpNum: $('.hp-num'),
      dash: $('#ab-dash'), emp: $('#ab-emp'), lvl: $('.lvl-num'), xp: $('.xp-fill'),
      combo: $('#combo'), comboNum: $('.combo-num'),
      dialog: $('#dialog'), dPortrait: $('.d-portrait'), dName: $('.d-name'), dText: $('.d-text'),
      banner: $('#banner'), bnTitle: $('.bn-title'), bnSub: $('.bn-sub'), hurt: $('#hurt'),
      boss: $('#bossbar'), bossFill: $('.bb-fill'), bossLag: $('.bb-lag'),
      ev: $('#eventbar'), evFill: $('.ev-fill'), evTime: $('.ev-time'), evHp: $('.ev-hp'),
      mm: $('#minimap'), mmZone: $('#mm-zone'), fade: $('#fade'),
      title: $('#screen-title'), start: $('#btn-start'), boot: $('#screen-boot'), bootText: $('#boot-text'),
      lu: $('#screen-levelup'), luLevel: $('.lu-level'), cards: $('.cards'),
      pause: $('#screen-pause'), pauseBuild: $('.pause-build'), dead: $('#screen-dead'), win: $('#screen-win'),
    };
    this.mmCtx = this.el.mm.getContext('2d');
    this.fog = makeCanvas(220, 165);
    this.fogCtx = this.fog.getContext('2d');
    this._cache = new Map();
  },

  reset() {
    this.dq = []; this.cur = null;
    this.el.dialog.classList.add('hidden');
    this.el.boss.classList.add('hidden');
    this.el.ev.classList.add('hidden');
    this.el.banner.classList.remove('on');
    this.el.combo.classList.remove('on');
    this.fogCtx.globalCompositeOperation = 'source-over';
    this.fogCtx.clearRect(0, 0, 220, 165);
    this.fogCtx.fillStyle = 'rgba(3,8,14,0.9)';
    this.fogCtx.fillRect(0, 0, 220, 165);
    this.bossLag = 1;
  },

  set(el, key, val, fn) {
    let c = this._cache.get(el);
    if (!c) this._cache.set(el, (c = {}));
    if (c[key] === val) return;
    c[key] = val;
    fn(val);
  },

  update(dt) {
    const p = G.player, E = this.el;
    if (!p) return;
    const hpf = clamp(p.hp / p.maxHp, 0, 1), lagf = clamp(p.hpLag / p.maxHp, 0, 1);
    this.set(E.hpFill, 'w', (hpf * 100).toFixed(1), (v) => (E.hpFill.style.width = v + '%'));
    this.set(E.hpLag, 'w', (lagf * 100).toFixed(1), (v) => (E.hpLag.style.width = v + '%'));
    this.set(E.hpNum, 't', `${Math.ceil(p.hp)}/${p.maxHp}`, (v) => (E.hpNum.textContent = v));
    this.set(E.status, 'low', hpf < 0.3, (v) => E.status.classList.toggle('low', v));
    this.set(E.xp, 'w', ((p.xp / p.xpNext) * 100).toFixed(1), (v) => (E.xp.style.width = v + '%'));
    this.set(E.lvl, 't', p.level, (v) => (E.lvl.textContent = v));
    const dp = p.dashCdT > 0 ? 1 - p.dashCdT / p.st.dashCd : 1;
    this.set(E.dash, 'p', dp.toFixed(2), (v) => E.dash.style.setProperty('--p', v));
    this.set(E.dash, 'r', dp >= 1, (v) => E.dash.classList.toggle('ready', v));
    const ep = p.emp / 100;
    this.set(E.emp, 'p', ep.toFixed(2), (v) => E.emp.style.setProperty('--p', v));
    this.set(E.emp, 'r', ep >= 1, (v) => E.emp.classList.toggle('ready', v));

    // combo
    if (G.comboT > 0 && G.combo >= 3) {
      this.set(E.combo, 'on', true, () => E.combo.classList.add('on'));
      if (this.lastCombo !== G.combo) {
        this.lastCombo = G.combo;
        E.comboNum.textContent = '×' + G.combo;
        E.comboNum.classList.remove('pop'); void E.comboNum.offsetWidth; E.comboNum.classList.add('pop');
      }
    } else this.set(E.combo, 'on', false, () => E.combo.classList.remove('on'));

    // boss
    if (Boss.e && !E.boss.classList.contains('hidden')) {
      const f = clamp(Boss.e.hp / Boss.e.maxHp, 0, 1);
      this.bossLag = this.bossLag > f ? Math.max(f, this.bossLag - dt * 0.25) : f;
      this.set(E.bossFill, 'w', (f * 100).toFixed(2), (v) => (E.bossFill.style.width = v + '%'));
      this.set(E.bossLag, 'w', (this.bossLag * 100).toFixed(2), (v) => (E.bossLag.style.width = v + '%'));
    }

    // banner
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) E.banner.classList.remove('on'); }

    this.updateDialog(dt);

    // zone label
    const z = World.zoneAt(p.x, p.y);
    this.set(E.mmZone, 'z', z, (v) => (E.mmZone.textContent = v === 'desert' ? 'ПУСТЫНЯ' : v === 'ruins' ? 'РУИНЫ' : 'ЛУГ'));

    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.15; this.revealFog(p.x, p.y, 560); }
    this.drawMinimap();
  },

  // ---------- dialogue ----------
  say(who, text, now) {
    if (now) { this.dq = this.dq.filter((d) => d.keep); if (this.cur && this.cur.shown >= this.cur.text.length) this.cur = null; }
    this.dq.push({ who, text, shown: 0, hold: 0 });
  },

  updateDialog(dt) {
    const E = this.el;
    if (!this.cur && this.dq.length) {
      this.cur = this.dq.shift();
      const sp = SPEAKERS[this.cur.who] || SPEAKERS.iskra;
      E.dPortrait.className = 'd-portrait ' + sp.cls;
      E.dName.textContent = sp.name;
      E.dName.style.color = sp.cls === 'zhuzha' ? 'var(--gold)' : sp.cls === 'system' || sp.cls === 'boss' ? '#ff6b5a' : sp.cls === 'log' ? 'var(--violet)' : 'var(--cyan)';
      E.dText.textContent = '';
      E.dialog.classList.remove('hidden');
      E.dialog.style.animation = 'none'; void E.dialog.offsetWidth; E.dialog.style.animation = '';
    }
    const c = this.cur;
    if (!c) return;
    const speed = this.dq.length > 1 ? 110 : 58;
    if (c.shown < c.text.length) {
      const before = Math.floor(c.shown);
      c.shown = Math.min(c.text.length, c.shown + dt * speed);
      const now = Math.floor(c.shown);
      if (now !== before) {
        E.dText.textContent = c.text.slice(0, now);
        if (c.text[now - 1] !== ' ') Snd.play('type', { f: c.who === 'boss' ? 180 : c.who === 'zhuzha' ? 1500 : undefined });
      }
    } else {
      c.hold += dt;
      const need = Math.max(2, c.text.length * 0.04) + (this.dq.length ? 0 : 1.8);
      if (c.hold > need) { this.cur = null; if (!this.dq.length) E.dialog.classList.add('hidden'); }
    }
  },

  banner(title, sub, color = '#ffd24a', dur = 2.6) {
    const E = this.el;
    E.bnTitle.textContent = title; E.bnSub.textContent = sub || '';
    E.bnTitle.style.color = color;
    E.bnTitle.style.textShadow = `0 0 30px ${color}88, 4px 4px 0 rgba(0,0,0,.7)`;
    E.banner.classList.remove('on'); void E.banner.offsetWidth; E.banner.classList.add('on');
    this.bannerT = dur;
  },

  setQuest(title, items) {
    const E = this.el;
    E.qTitle.textContent = title;
    E.qList.innerHTML = '';
    for (const it of items) {
      const li = document.createElement('li');
      li.textContent = it.t;
      if (it.done) li.classList.add('done');
      if (it.side) li.classList.add('side');
      E.qList.appendChild(li);
    }
  },

  flashQuest() {
    const q = this.el.quest;
    q.classList.remove('flash'); void q.offsetWidth; q.classList.add('flash');
  },

  hurtFlash() {
    const h = this.el.hurt;
    h.style.transition = 'none'; h.style.opacity = '1';
    void h.offsetWidth;
    h.style.transition = 'opacity .5s'; h.style.opacity = '0';
  },

  whiteFlash() {
    const f = this.el.fade;
    f.style.background = '#fff'; f.style.transition = 'none'; f.style.opacity = '0.9';
    void f.offsetWidth;
    f.style.transition = 'opacity 1.2s'; f.style.opacity = '0';
    setTimeout(() => { f.style.background = '#000'; }, 1300);
  },

  fadeIn() {
    const f = this.el.fade;
    f.style.transition = 'none'; f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = 'opacity 1.4s'; f.style.opacity = '0';
  },

  showBoss(on) { this.el.boss.classList.toggle('hidden', !on); this.bossLag = 1; },
  showEvent(on) { this.el.ev.classList.toggle('hidden', !on); },
  setEvent(f, left, hpf) {
    const E = this.el;
    this.set(E.evFill, 'w', (f * 100).toFixed(1), (v) => (E.evFill.style.width = v + '%'));
    this.set(E.evTime, 't', `ОСТАЛОСЬ ${Math.ceil(left)} С`, (v) => (E.evTime.textContent = v));
    this.set(E.evHp, 't', `ВЫШКА ${Math.ceil(hpf * 100)}%`, (v) => (E.evHp.textContent = v));
    this.set(E.evHp, 'bad', hpf < 0.4, (v) => E.evHp.classList.toggle('bad', v));
  },

  // ---------- minimap ----------
  revealFog(x, y, r) {
    const g = this.fogCtx, sx = 220 / World.w, sy = 165 / World.h;
    const cx = x * sx, cy = y * sy, rr = r * sx;
    g.globalCompositeOperation = 'destination-out';
    const gr = g.createRadialGradient(cx, cy, rr * 0.5, cx, cy, rr);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  },

  drawMinimap() {
    const g = this.mmCtx, W = 220, H = 165, sx = W / World.w, sy = H / World.h;
    const p = G.player;
    g.clearRect(0, 0, W, H);
    if (World.minimapBase) g.drawImage(World.minimapBase, 0, 0);
    g.drawImage(this.fog, 0, 0);
    // barrier
    if (Props.barrier && Props.barrier.on) {
      g.strokeStyle = 'rgba(120,235,255,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(2700 * sx, 1500 * sy); g.lineTo(2700 * sx, H); g.stroke();
    }
    if (Props.gate && !Props.gate.open) { g.fillStyle = '#ff4757'; g.fillRect(3700 * sx, 1446 * sy, 200 * sx, 2); }
    // enemies (radar)
    for (const e of G.enemies) {
      if (e.dead || e.dormant || e.state === 'sleep') continue;
      if (dist2(e.x, e.y, p.x, p.y) > 1100 * 1100 && e.type !== 'boss') continue;
      g.fillStyle = e.type === 'boss' ? '#ff5a3c' : e.type === 'brute' ? '#ff9a3c' : '#ff4757';
      const s = e.type === 'boss' ? 4 : e.type === 'brute' || e.type === 'nest' ? 2.5 : 1.4;
      g.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
    }
    // markers
    const blink = 0.6 + Math.sin(G.rt * 6) * 0.4;
    for (const m of Quest.markers) {
      const mx = (m.ref ? m.ref.x : m.x) * sx, my = (m.ref ? m.ref.y : m.y) * sy;
      g.globalAlpha = blink;
      g.fillStyle = m.col;
      g.beginPath(); g.moveTo(mx, my - 5); g.lineTo(mx + 4, my); g.lineTo(mx, my + 5); g.lineTo(mx - 4, my); g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    }
    // tower / heal pads
    g.fillStyle = Props.tower && Props.tower.done ? '#5dff8a' : '#5ce1ff';
    g.fillRect(2100 * sx - 2, 1000 * sy - 2, 4, 4);
    // view rect
    const v = G.view;
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.strokeRect(v.x0 * sx, v.y0 * sy, (v.x1 - v.x0) * sx, (v.y1 - v.y0) * sy);
    // player
    g.save(); g.translate(p.x * sx, p.y * sy); g.rotate(p.aim);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.closePath(); g.fill(); g.stroke();
    g.restore();
  },

  // ---------- level-up ----------
  showLevelUp(p, choices, cb) {
    const E = this.el;
    E.luLevel.textContent = p.level;
    E.cards.innerHTML = '';
    this.luChoices = choices; this.luCb = cb;
    choices.forEach((u, i) => {
      const r = RARITY[u.rar];
      const have = p.ups[u.id] || 0;
      const d = document.createElement('div');
      d.className = 'card';
      d.style.setProperty('--rc', r.c);
      let pips = '';
      for (let k = 0; k < u.max; k++) pips += `<i class="${k < have ? 'on' : k === have ? 'new' : ''}"></i>`;
      d.innerHTML = `<div class="c-key">${i + 1}</div><div class="c-rar">${r.n}</div><div class="c-icon">${u.icon}︎</div>
        <div class="c-name">${u.name}</div><div class="c-desc">${u.desc}</div><div class="c-lvl">${pips}</div>`;
      d.addEventListener('mouseenter', () => Snd.play('ui'));
      d.addEventListener('click', () => this.pickCard(i));
      E.cards.appendChild(d);
    });
    E.lu.classList.remove('hidden');
    document.body.classList.add('menu');
  },

  pickCard(i) {
    if (!this.luChoices || !this.luChoices[i]) return;
    const u = this.luChoices[i], cb = this.luCb;
    this.luChoices = null;
    const card = this.el.cards.children[i];
    if (card) card.classList.add('sel');
    setTimeout(() => {
      this.el.lu.classList.add('hidden');
      document.body.classList.remove('menu');
      cb(u);
    }, 160);
  },

  showPause(on) {
    const E = this.el;
    E.pause.classList.toggle('hidden', !on);
    document.body.classList.toggle('menu', on);
    if (on) {
      const p = G.player;
      const parts = UPGRADES.filter((u) => p.ups[u.id]).map((u) => `<span>${u.icon}︎ ${u.name} ×${p.ups[u.id]}</span>`);
      E.pauseBuild.innerHTML = parts.length ? parts.join('') : '<span>Модулей пока нет</span>';
      E.pause.querySelector('[data-act=sound]').textContent = 'ЗВУК: ' + (Snd.muted ? 'ВЫКЛ' : 'ВКЛ');
    }
  },

  showDead(on) { this.el.dead.classList.toggle('hidden', !on); },

  showWin(stats) {
    const E = this.el;
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const secrets = Quest.logs + (G.player.hasDrone ? 1 : 0);
    const t = G.time;
    let rank = 'C';
    if (stats.deaths === 0 && secrets >= 3 && t < 480) rank = 'S';
    else if (stats.deaths <= 1 && t < 600) rank = 'A';
    else if (stats.deaths <= 3) rank = 'B';
    E.win.querySelector('.rank-letter').textContent = rank;
    const rows = [
      ['Время', fmtTime(t)], ['Уровень', G.player.level],
      ['Врагов уничтожено', stats.kills], ['Макс. комбо', '×' + stats.maxCombo],
      ['Точность', acc + '%'], ['Урона получено', Math.round(stats.dmgTaken)],
      ['Перезагрузок', stats.deaths], ['Секреты', `${secrets}/4`],
    ];
    E.win.querySelector('.win-stats').innerHTML = rows.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    E.win.classList.remove('hidden');
    document.body.classList.add('menu');
  },

  boot(done) {
    const E = this.el;
    const lines = [
      ['> ROBIK-7 // АВАРИЙНАЯ ПЕРЕЗАГРУЗКА', 'hi'],
      ['> Целостность корпуса ....... 63%  [ОК]', ''],
      ['> Бластер «Искра-М» ......... [ОК]', ''],
      ['> Сервоприводы .............. [ОК]', ''],
      ['> Модуль памяти ............. [ПОВРЕЖДЁН]', 'err'],
      ['> Связь с кораблём .......... [НЕТ СИГНАЛА]', 'err'],
      ['> Запуск ИИ-ассистента «ИСКРА»…', ''],
      ['> Добро пожаловать на Планету Зеро.', 'hi'],
    ];
    E.bootText.innerHTML = '';
    E.boot.classList.remove('hidden');
    let li = 0, ci = 0, span = null, finished = false, timer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      E.boot.removeEventListener('click', finish);
      E.boot.classList.add('hidden');
      done();
    };
    E.boot.addEventListener('click', finish);
    timer = setInterval(() => {
      if (li >= lines.length) { clearInterval(timer); setTimeout(finish, 700); return; }
      const [txt, cls] = lines[li];
      if (!span) { span = document.createElement('span'); if (cls) span.className = cls; E.bootText.appendChild(span); }
      ci += 2;
      span.textContent = txt.slice(0, ci);
      if (ci % 4 === 0) Snd.play('type', { f: 700 + Math.random() * 400 });
      if (ci >= txt.length) { E.bootText.appendChild(document.createTextNode('\n')); li++; ci = 0; span = null; if (cls === 'err') Snd.play('beep', { f: 300 }); }
    }, 22);
  },
};
