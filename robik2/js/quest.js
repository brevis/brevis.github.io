'use strict';
// Director: quest stages, dialogue, spawns, tower defense event, checkpoints.
const Quest = {
  stage: 'intro', t: 0, flags: {}, markers: [], cells: 0, logs: 0, ev: null,

  LOGS: [
    'Экспедиция «Заря», запись 14: мы нашли руины на северо-востоке. Их охраняет нечто огромное. Оно спит. Пока.',
    'Запись 22: ретрансляторы строили не мы. Они старше нашей цивилизации — и до сих пор ловят сигнал из руин.',
    'Запись 31: ключ-карту забрал страж форпоста. Если ты это читаешь — уходи, пока Колосс не проснулся.',
  ],

  init() {
    this.stage = 'intro'; this.t = 0; this.flags = {}; this.markers = []; this.cells = 0; this.logs = 0; this.ev = null;
    this.populate();
    this.refresh();
  },

  populate() {
    const S = (type, x, y, o) => Enemies.spawn(type, x, y, o);
    // tutorial pack near the first cell
    S('crawler', 985, 2715); S('crawler', 1045, 2835); S('crawler', 930, 2800);
    // west lake / cell 2
    S('spitter', 470, 1380); S('spitter', 740, 1400); S('crawler', 560, 1300); S('crawler', 650, 1290); S('crawler', 400, 1480); S('bomber', 790, 1300);
    // roamers west
    S('crawler', 800, 2250); S('crawler', 840, 2200); S('crawler', 560, 2520);
    S('spitter', 1000, 1950); S('crawler', 960, 1900);
    S('crawler', 860, 1050); S('crawler', 900, 1000); S('spitter', 700, 900);
    // forest drone guards
    S('spitter', 440, 640); S('crawler', 250, 420); S('crawler', 420, 390); S('crawler', 280, 680); S('bomber', 500, 520);
    // nest with cell 3
    this.nest = S('nest', 2200, 2380, { tag: 'nest', onDeath: (e) => { this.cell3 = Pickups.spawn('cell', e.x, e.y, { burst: 0, id: 3 }); this.setMarkers(this.q1Markers()); } });
    S('crawler', 2100, 2290); S('crawler', 2310, 2460); S('crawler', 2160, 2490); S('spitter', 2330, 2250);
    // roamers east
    S('spitter', 1900, 1900); S('crawler', 1870, 1950); S('crawler', 1950, 1965);
    S('bomber', 2400, 3080); S('bomber', 2450, 3120); S('crawler', 2350, 3150);
    S('crawler', 1700, 1350); S('crawler', 1760, 1300); S('crawler', 1650, 1280);
    S('spitter', 2450, 1520); S('crawler', 2400, 1460);
    // desert west (mine field)
    S('turret', 3000, 2150); S('turret', 3250, 2830); S('turret', 3330, 2250);
    S('spitter', 3100, 2650); S('spitter', 2960, 3000); S('crawler', 2950, 2980);
    S('bomber', 3200, 1900); S('bomber', 3240, 1950); S('bomber', 3160, 1960);
    S('crawler', 2900, 2290); S('crawler', 2950, 2330); S('crawler', 2870, 2350);
    // desert east
    S('turret', 3700, 2760); S('turret', 3690, 2320);
    S('turret', 3660, 1730); S('spitter', 4100, 1800); S('spitter', 3950, 1660); S('crawler', 4050, 1700); S('crawler', 4120, 1760);
    S('crawler', 4300, 3080); S('crawler', 4360, 3060); S('bomber', 4200, 3320);
    S('spitter', 3900, 3000); S('crawler', 3850, 3050);
    // outpost
    this.brute = S('brute', 4250, 2600, { name: 'СТРАЖ ФОРПОСТА', tag: 'brute', onDeath: (e) => { this.keycard = Pickups.spawn('keycard', e.x, e.y, { burst: 0 }); this.setMarkers([{ ref: this.keycard, col: '#ff4757', label: 'КЛЮЧ-КАРТА' }]); } });
    S('turret', 4080, 2410); S('turret', 4420, 2740);
    S('crawler', 4200, 2450); S('crawler', 4300, 2700); S('spitter', 4380, 2520);
    Boss.spawn();

    // quest pickups
    this.cell1 = Pickups.spawn('cell', 1090, 2770, { burst: 0, id: 1 });
    this.cell2 = Pickups.spawn('cell', 600, 1440, { burst: 0, id: 2 });
    this.logItems = [[150, 3440], [2560, 280], [4660, 3450]].map(([x, y], i) => Pickups.spawn('log', x, y, { burst: 0, id: i }));
  },

  say(who, text, now) { UI.say(who, text, now); },

  setMarkers(list) { this.markers = list; },

  q1Markers() {
    const m = [];
    if (this.cell1 && !this.cell1.dead) m.push({ ref: this.cell1, col: '#b8ff5a', label: 'ЯЧЕЙКА' });
    if (this.cell2 && !this.cell2.dead) m.push({ ref: this.cell2, col: '#b8ff5a', label: 'ЯЧЕЙКА' });
    if (this.cell3 && !this.cell3.dead) m.push({ ref: this.cell3, col: '#b8ff5a', label: 'ЯЧЕЙКА' });
    else if (this.nest && !this.nest.dead) m.push({ ref: this.nest, col: '#d08aff', label: 'ГНЕЗДО' });
    return m;
  },

  refresh() {
    const items = [];
    let title = '';
    switch (this.stage) {
      case 'intro': title = 'ПРОБУЖДЕНИЕ'; items.push({ t: 'Прийти в себя после крушения' }); break;
      case 'q1': title = 'ПЕРЕЗАГРУЗКА'; items.push({ t: `Найти энергоячейки: ${this.cells}/3` }); break;
      case 'q2go': title = 'СИГНАЛ'; items.push({ t: 'Энергоячейки: 3/3', done: true }, { t: 'Запустить ретранслятор на холме [E]' }); break;
      case 'q2def': title = 'СИГНАЛ'; items.push({ t: 'Защитить ретранслятор, пока идёт зарядка' }); break;
      case 'q3': title = 'ПУСТЫНЯ'; items.push({ t: 'Сигнал отправлен', done: true }, { t: 'Забрать ключ-карту у стража форпоста' }); break;
      case 'q4': title = 'РУИНЫ'; items.push({ t: 'Ключ-карта у нас', done: true }, { t: 'Открыть врата руин [E]' }); break;
      case 'q4open': title = 'РУИНЫ'; items.push({ t: 'Исследовать руины' }); break;
      case 'boss': title = 'ХРАНИТЕЛЬ'; items.push({ t: 'Победить Колосса' }); break;
      case 'end': case 'win': title = 'ФИНАЛ'; items.push({ t: 'Победить Колосса', done: true }, { t: 'Забрать ядро Хранителя', done: this.stage === 'win' }); break;
    }
    if (this.flags.droneSeen) items.push({ t: 'Починить боевого дрона', done: G.player.hasDrone, side: true });
    items.push({ t: `Дата-логи «Зари»: ${this.logs}/3`, done: this.logs >= 3, side: true });
    UI.setQuest(title, items);
  },

  go(stage) { this.stage = stage; this.refresh(); UI.flashQuest(); },

  update(dt) {
    this.t += dt;
    const p = G.player;
    const F = this.flags;
    switch (this.stage) {
      case 'intro':
        if (!F.i1 && this.t > 0.8) {
          F.i1 = true;
          this.say('iskra', 'Робик, ты меня слышишь? Это Искра, твой бортовой ИИ. Мы… немного разбились.');
          this.say('iskra', 'Корпус цел, бластер работает. Двигайся на W A S D, целься мышью.');
        }
        if (F.i1 && (this.t > 11 || dist(p.x, p.y, 600, 3130) > 240)) {
          this.go('q1');
          this.setMarkers(this.q1Markers());
          Snd.play('quest');
          this.say('iskra', 'Сканирую… Рядом три энергоячейки! Их хватит, чтобы запустить ретранслятор и позвать помощь. Я отметила их на сканере.');
        }
        break;
      case 'q2go':
        if (!F.towerSeen && dist(p.x, p.y, 2100, 1000) < 420) {
          F.towerSeen = true;
          G.checkpoint = { x: 1980, y: 1110 };
          this.say('iskra', 'Вот он, ретранслятор. Встань рядом и нажми E — вставим ячейки.');
        }
        break;
      case 'q2def':
        this.updateTowerEvent(dt);
        break;
      case 'q4open':
        if (dist(p.x, p.y, World.arena.x, World.arena.y) < 480) this.startBoss();
        break;
    }
    this.proximity(p);
  },

  proximity(p) {
    const F = this.flags;
    const near = (x, y, r) => dist2(p.x, p.y, x, y) < r * r;
    if (!F.barrel && near(1030, 2690, 330)) { F.barrel = true; this.say('iskra', 'Красные бочки взрываются. Стреляй, когда рядом соберутся жуки.'); }
    if (!F.nest && this.nest && !this.nest.dead && near(2200, 2380, 640)) { F.nest = true; this.say('iskra', 'Фу, гнездо. Сигнал третьей ячейки идёт прямо из него. Выжигай, пока не наплодило новых!'); }
    if (!F.droneSeen && near(330, 520, 380)) {
      F.droneSeen = true;
      this.say('zhuzha', 'Бз-з-з! Помогите! Крылышко заклинило! Бз-з!');
      this.say('iskra', 'Боевой дрон! Разберись с жуками, подойди и нажми E — я его перепрошью.');
      this.refresh();
    }
    if (!F.desert && p.x > 2760 && p.y > 1500) {
      F.desert = true;
      G.checkpoint = { x: 2800, y: 2380 };
      this.say('iskra', 'Пустыня. Осторожно — мины. Мигающие красные огоньки лучше обходить… или подстрелить издалека.');
    }
    if (!F.pass && near(3510, 2540, 470)) { F.pass = true; this.say('iskra', 'Лазерные заслоны работают по циклу. Лови окно — или проскочи рывком. ЭМИ глушит их на несколько секунд.'); }
    if (!F.outpost && near(4250, 2575, 640)) { F.outpost = true; this.say('iskra', 'Крупная сигнатура — страж форпоста. Когда он разгоняется, уходи вбок. Врежется в стену — будет оглушён.'); }
    if (!F.gateHint && !p.keycard && near(3800, 1500, 380)) { F.gateHint = true; this.say('iskra', 'Древние врата. Заперты. Без ключ-карты не пройти — ищи её в форпосте на юго-востоке.'); }
  },

  // ---------- callbacks ----------
  onAggro(e) {
    const F = this.flags;
    if (!F.contact && (this.stage === 'intro' || this.stage === 'q1') && e.dp < 700) {
      F.contact = true;
      this.say('iskra', 'Контакт! Местная фауна не любит гостей. Зажми ЛКМ — огонь!', true);
    }
  },
  onKill(e) {
    const F = this.flags;
    if (!F.firstKill) { F.firstKill = true; this.say('iskra', 'Минус один! Собирай кристаллы — это опыт для новых модулей.'); }
    if (e.tag === 'nest') { Snd.play('quest'); FX.text(e.x, e.y - 60, 'ГНЕЗДО УНИЧТОЖЕНО', '#d08aff', 22, 1.6); }
  },
  onPlayerHurt() {
    if (!this.flags.hurt) { this.flags.hurt = true; this.say('iskra', 'Ай! ПРОБЕЛ — рывок. Пока летишь, ты неуязвим, даже для снарядов.', true); }
  },
  onEmpReady() {
    if (!this.flags.emp) { this.flags.emp = true; this.say('iskra', 'ЭМИ заряжен! Жми Q или правую кнопку мыши — и смотри, как они разлетаются.', true); }
  },
  onUpgradePicked(u) {
    if (!this.flags.firstUp) { this.flags.firstUp = true; this.say('iskra', `«${u.name}» установлен. С каждым уровнем ты сильнее — выбирай с умом.`); }
  },
  onHealPad() {
    if (!this.flags.heal) { this.flags.heal = true; this.say('iskra', 'Ремонтная площадка. Постой на ней — корпус подлатается.'); }
  },
  onBarrierTouch() {
    if (this.stage === 'q3' || this.stage === 'q4') return;
    this.say('iskra', 'Энергобарьер пустыни. Его питает ретранслятор — сначала запусти его.', true);
  },

  onItem(it) {
    const p = G.player;
    Snd.play('item');
    FX.sparkle(it.x, it.y, '#ffffff', 14);
    switch (it.type) {
      case 'cell': {
        this.cells++; p.cells++;
        FX.ring(it.x, it.y, 10, 120, '#b8ff5a', 0.5, 4);
        if (this.cells < 3) {
          UI.banner(`ЯЧЕЙКА ${this.cells}/3`, 'энергия восстановлена', '#b8ff5a');
          const lines = [
            'Первая есть! Следующая — у озера на северо-западе, третья — за рекой на востоке.',
            'Вторая! Осталась одна. Сканер показывает её за рекой, к востоку.',
          ];
          this.say('iskra', this.cells === 1 ? lines[0] : lines[1]);
          this.refresh();
          this.setMarkers(this.q1Markers());
        } else {
          UI.banner('ЯЧЕЙКИ СОБРАНЫ', 'Ретранслятор ждёт', '#b8ff5a');
          this.say('iskra', 'Все три ячейки у нас! Ретранслятор — на холме к северо-востоку. Через реку есть мосты.');
          this.go('q2go');
          this.setMarkers([{ x: 2100, y: 1000, col: '#5ce1ff', label: 'РЕТРАНСЛЯТОР' }]);
          Snd.play('quest');
        }
        break;
      }
      case 'log':
        this.logs++;
        Player.addXp(p, 10);
        FX.text(p.x, p.y - 40, '+10 ОПЫТА', '#c77dff', 18, 1.2);
        UI.banner(`ДАТА-ЛОГ ${this.logs}/3`, 'секрет найден', '#c77dff');
        this.say('log', this.LOGS[it.id]);
        this.refresh();
        break;
      case 'keycard':
        p.keycard = true;
        G.checkpoint = { x: 4420, y: 2410 };
        UI.banner('КЛЮЧ-КАРТА', 'врата руин открыты для тебя', '#ff4757');
        this.say('iskra', 'Ключ-карта! Врата руин — к северу отсюда, по дороге. И там… что-то очень большое.');
        this.go('q4');
        this.setMarkers([{ x: 3800, y: 1500, col: '#ff4757', label: 'ВРАТА' }]);
        Snd.play('quest');
        break;
      case 'core':
        this.go('win');
        this.setMarkers([]);
        UI.banner('ЯДРО ХРАНИТЕЛЯ', 'демо-уровень пройден', '#ffd24a');
        Snd.play('quest');
        this.say('iskra', 'Ядро Хранителя… в нём карта всей планеты. Робик, кажется, мы тут надолго.', true);
        G.after(4.5, () => G.win());
        break;
    }
  },

  rescueDrone() {
    const p = G.player, dn = Props.droneNPC;
    dn.rescued = true;
    p.hasDrone = true;
    p.drone = { x: dn.x, y: dn.y, a: 0, t: 0, fire: 0, aim: 0 };
    Snd.play('item');
    FX.sparkle(dn.x, dn.y, '#ffd24a', 20);
    FX.ring(dn.x, dn.y, 10, 90, '#ffd24a', 0.5, 3);
    UI.banner('НОВЫЙ СОЮЗНИК', 'боевой дрон «Жужа»', '#ffd24a');
    this.say('zhuzha', 'Жужа в строю! Буду жужжать рядом и стрелять во всё, что шевелится! Бз!', true);
    this.refresh();
  },

  // ---------- relay tower defense ----------
  activateTower() {
    const tw = Props.tower;
    if (tw.done || tw.active || G.player.cells < 3) return;
    tw.active = true; tw.hp = tw.maxHp;
    if (tw.sockets < 3) for (let i = 0; i < 3; i++) G.after(i * 0.25, () => { tw.sockets = i + 1; Snd.play('pickup', { pitch: 0.8 + i * 0.2 }); FX.sparkle(tw.x, tw.y, '#b8ff5a', 8); });
    G.checkpoint = { x: 1980, y: 1110 };
    this.ev = { t: -2, dur: 40, wave: 0, lowWarn: false };
    this.go('q2def');
    this.setMarkers([]);
    UI.showEvent(true);
    UI.banner('ЗАЩИТИ РЕТРАНСЛЯТОР', '40 секунд до отправки сигнала', '#5ce1ff');
    Snd.play('alarm');
    this.say('iskra', 'Зарядка пошла! Шум привлечёт всех жуков в округе — держи их подальше от вышки!', true);
  },

  WAVES: [
    { t: 0, list: [['crawler', 5]] },
    { t: 6, list: [['crawler', 4], ['spitter', 2]] },
    { t: 12, list: [['bomber', 4], ['crawler', 3]] },
    { t: 18, list: [['crawler', 6], ['spitter', 2]] },
    { t: 24, list: [['bomber', 3], ['spitter', 3], ['crawler', 3]] },
    { t: 30, list: [['crawler', 8], ['bomber', 3], ['spitter', 2]] },
    { t: 35, list: [['crawler', 5], ['bomber', 2]] },
  ],

  updateTowerEvent(dt) {
    const ev = this.ev, tw = Props.tower;
    ev.t += dt;
    while (ev.wave < this.WAVES.length && ev.t >= this.WAVES[ev.wave].t) this.spawnWave(this.WAVES[ev.wave++]);
    if (ev.t > 12 && !ev.l12) { ev.l12 = true; this.say('iskra', 'Бомберы! Сбивай их издалека — взрываются красиво, но больно.'); }
    if (ev.t > 27 && !ev.l27) { ev.l27 = true; this.say('iskra', 'Ещё немного! Сигнал почти готов!'); }
    if (!ev.lowWarn && tw.hp < tw.maxHp * 0.4) { ev.lowWarn = true; this.say('iskra', 'Вышку ломают! Отгони их!', true); }
    UI.setEvent(clamp(ev.t / ev.dur, 0, 1), Math.max(0, ev.dur - ev.t), tw.hp / tw.maxHp);
    if (ev.t >= ev.dur) this.completeTower();
  },

  spawnWave(w) {
    const tw = Props.tower;
    const base = rand(0, TAU);
    for (const [type, n] of w.list) {
      for (let i = 0; i < n; i++) {
        let x, y, ok = false;
        for (let k = 0; k < 14 && !ok; k++) {
          const a = base + rand(-1.1, 1.1) + (k > 6 ? Math.PI : 0);
          const d = rand(560, 760);
          x = tw.x + Math.cos(a) * d; y = tw.y + Math.sin(a) * d;
          ok = x > 90 && x < 2600 && y > 90 && y < 3500 && !World.blocked(x, y, 16) && World.tAt(x, y) !== T.BRIDGE;
          if (ok) for (const o of World.queryObs(x, y, 30, [])) if (o.solid && !o.dead && dist(x, y, o.x, o.y) < o.r + 18) { ok = false; break; }
        }
        if (!ok) continue;
        const pref = type === 'spitter' ? 0.5 : type === 'bomber' ? 0.8 : 0.7;
        G.after(i * 0.12, () => { if (this.stage === 'q2def') Enemies.spawn(type, x, y, { emerge: true, aggro: true, wave: true, towerPref: Math.random() < pref ? 1 : 0 }); });
      }
    }
  },

  completeTower() {
    const tw = Props.tower;
    tw.active = false; tw.done = true;
    UI.showEvent(false);
    G.addShake(1); G.hitStop = 0.1;
    Snd.play('emp'); Snd.play('quest');
    FX.ring(tw.x, tw.y, 40, 1300, '#5ce1ff', 1, 16);
    FX.ring(tw.x, tw.y, 20, 900, '#ffffff', 0.7, 6);
    FX.flash(tw.x, tw.y, 400, '#5ce1ff', 0.4);
    for (const e of G.enemies) {
      if (e.dead || e.type === 'boss') continue;
      if (e.wave || (e.aggro && dist(e.x, e.y, tw.x, tw.y) < 1200)) G.after(dist(e.x, e.y, tw.x, tw.y) / 1500, () => { if (!e.dead) Enemies.kill(e); });
    }
    Pickups.gems(tw.x, tw.y + 70, 25);
    UI.banner('СИГНАЛ ОТПРАВЛЕН', 'энергобарьер пустыни снят', '#5ce1ff');
    this.say('iskra', 'Сигнал ушёл… и пришёл ответ. Кто-то — или что-то — отвечает с востока. Барьер пустыни снят!', true);
    this.say('iskra', 'Координаты ведут в древние руины. Ворота заперты — ключ-карта у стража пустынного форпоста.');
    G.after(1.4, () => Props.disableBarrier());
    G.checkpoint = { x: 1980, y: 1110 };
    this.go('q3');
    this.setMarkers([{ x: 4250, y: 2575, col: '#ff9a3c', label: 'ФОРПОСТ' }]);
  },

  onTowerDestroyed() {
    this.resetTower(true);
    UI.banner('РЕТРАНСЛЯТОР ПЕРЕГРУЖЕН', 'подойди к вышке и попробуй снова [E]', '#ff4757');
    this.say('iskra', 'Вышка перегрузилась! Ничего, ячейки на месте. Перезапусти — нажми E у ретранслятора.', true);
  },

  resetTower(fx) {
    const tw = Props.tower;
    tw.active = false; tw.hp = tw.maxHp;
    UI.showEvent(false);
    for (const e of G.enemies) if (e.wave && !e.dead) { e.dead = true; if (fx) FX.emerge(e.x, e.y, e.r); }
    this.go('q2go');
    this.setMarkers([{ x: 2100, y: 1000, col: '#5ce1ff', label: 'РЕТРАНСЛЯТОР' }]);
    if (fx) { FX.explosion(tw.x, tw.y, 1.2, { noDecal: true }); Snd.play('powerdown'); }
  },

  // ---------- ruins & boss ----------
  openGate() {
    const gt = Props.gate;
    if (!G.player.keycard || gt.opening || gt.open) return;
    gt.opening = true;
    Snd.play('gate'); G.addShake(0.4);
    G.checkpoint = { x: 3800, y: 1300 };
    this.go('q4open');
    this.setMarkers([{ x: World.arena.x, y: World.arena.y, col: '#c77dff', label: 'РУИНЫ' }]);
    this.say('iskra', 'Врата открыты. Робик… я фиксирую энергию, как у реактора. Будь готов.', true);
  },

  startBoss() {
    this.go('boss');
    this.setMarkers([]);
    const gt = Props.gate;
    gt.closing = true; gt.opening = false;
    G.cinematic = true;
    const b = Boss.e;
    G.camFocus = { x: b.x, y: b.y };
    Boss.wake();
    Music.setMode('boss');
    Snd.play('alarm');
    G.checkpoint = { x: 3800, y: 1300 };
    G.checkpointBossHp = b.maxHp;
    G.after(1.2, () => UI.banner('КОЛОСС', 'Хранитель руин', '#ff5a3c'));
    G.after(0.8, () => this.say('boss', 'ЧУЖАК. ЯДРО ПРИНАДЛЕЖИТ ХРАНИТЕЛЮ. ПРОТОКОЛ УНИЧТОЖЕНИЯ.', true));
    G.after(3.4, () => {
      G.cinematic = false; G.camFocus = null;
      UI.showBoss(true);
      G.bossStartT = G.time;
      this.say('iskra', 'Оно разговаривает?! Уклоняйся от волн рывком, прячься за колоннами и стреляй в ядро!');
    });
  },

  onBossPhase(ph) {
    if (ph === 2) {
      UI.banner('ФАЗА 2', 'броня сорвана', '#ff3b2f');
      this.say('iskra', 'Броня слетела! Осторожно — у него лазер. Колонны его блокируют!', true);
    } else {
      UI.banner('ФАЗА 3', 'перегрузка ядра', '#ff4df0');
      this.say('boss', 'ПЕРЕГРУЗКА… УНИЧТОЖИТЬ… ЛЮБОЙ ЦЕНОЙ.', true);
      this.say('iskra', 'Он перегревается! После тарана он уязвим — жми!');
    }
  },

  onBossDead() {
    UI.showBoss(false);
    Music.setMode('explore');
    this.go('end');
    const core = G.pickups.find((i) => i.type === 'core');
    if (core) this.setMarkers([{ ref: core, col: '#ffd24a', label: 'ЯДРО' }]);
    UI.banner('ХРАНИТЕЛЬ ПОВЕРЖЕН', '', '#ffd24a');
    this.say('iskra', 'Мы… победили?! Робик, ты машина! Ну, в смысле, буквально. Забери ядро!', true);
  },

  // ---------- death handling ----------
  onPlayerDeath() {
    if (this.stage === 'q2def') this.resetTower(false);
    if (this.stage === 'boss') {
      const b = Boss.e;
      if (b && !b.dead) {
        b.hp = Math.max(b.hp, G.checkpointBossHp || b.maxHp);
        b.x = World.arena.x; b.y = World.arena.y - 40;
        b.bst = 'idle'; b.bT = 2.5; Boss.beam = null; Boss.waves = [];
      }
      for (const e of G.enemies) if (e.wave && !e.dead) e.dead = true;
    }
  },

  onRespawn() {
    const lines = ['Перезагрузка завершена. Давай ещё раз — аккуратнее.', 'Системы восстановлены. Пожалуйста, не повторяй это.', 'Уф. Резервная копия сработала. Вперёд!'];
    this.say('iskra', pick(lines), true);
  },
};
