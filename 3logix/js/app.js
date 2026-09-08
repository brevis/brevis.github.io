/* TriX — UI */
(function () {
  'use strict';
  const E = window.Engine;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  // ---------------------------------------------------------------------------
  // i18n
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const langParam = params.get('lang');
  const LANG = (langParam || navigator.language || 'en').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  const STRINGS = {
    en: {
      play: 'Play', howToPlay: 'How to play', easy: 'Easy', normal: 'Normal', hard: 'Hard',
      ai: 'AI', you: 'You',
      home: 'Home', rules: 'Rules', restartDeal: 'Restart this deal', board: 'Board', difficultyLabel: 'Difficulty',
      turnPick: 'Your move — pick a piece', turnPlace: 'Now tap an empty cell', aiThinking: 'AI is thinking…',
      dealing: 'Dealing…',
      win: 'You win!', lose: 'AI wins', draw: 'Draw',
      winText: 'Three {what}. Nicely done!',
      loseText: 'This deal was winnable — want another go?',
      drawText: 'You could have won this deal. Try it again?',
      retryDeal: 'Retry this deal', newDeal: 'New deal', gotIt: 'Got it', rulesTitle: 'How to play',
      wins: 'Wins', losses: 'Losses', draws: 'Draws',
      shapes3: { circle: 'circles', diamond: 'diamonds', square: 'squares' },
      colors3: { blue: 'violet pieces', red: 'red pieces', yellow: 'yellow pieces' },
      shapeNames: { circle: 'circle', diamond: 'diamond', square: 'square' },
      colorNames: { blue: 'violet', red: 'red', yellow: 'yellow' },
      cell: 'Cell {n}', usedSlot: 'Used: {piece}', showResult: 'Show result',
      rules: [
        'Make a line of three: a row, a column or a diagonal.',
        'The three pieces must share a <b>shape</b> (any colors) or share a <b>color</b> (any shapes):',
        'Pieces of <b>both</b> players count. Whoever completes a line wins.',
        'You move first and hold 5 pieces; the AI holds 4. Both hands are open.',
        'Every deal is checked in advance: with the right moves you can always win.',
      ],
    },
    ru: {
      play: 'Играть', howToPlay: 'Как играть', easy: 'Легко', normal: 'Нормально', hard: 'Сложно',
      ai: 'ИИ', you: 'Вы',
      home: 'На главную', rules: 'Правила', restartDeal: 'Начать раздачу заново', board: 'Поле', difficultyLabel: 'Сложность',
      turnPick: 'Ваш ход — выберите фишку', turnPlace: 'Теперь нажмите на пустую клетку', aiThinking: 'ИИ думает…',
      dealing: 'Раздача…',
      win: 'Победа!', lose: 'Выиграл ИИ', draw: 'Ничья',
      winText: 'Три {what}. Отлично!',
      loseText: 'Эту раздачу можно было выиграть. Попробуете ещё раз?',
      drawText: 'Эту раздачу можно было выиграть. Попробуете ещё раз?',
      retryDeal: 'Та же раздача', newDeal: 'Новая раздача', gotIt: 'Понятно', rulesTitle: 'Как играть',
      wins: 'Победы', losses: 'Поражения', draws: 'Ничьи',
      shapes3: { circle: 'круга', diamond: 'ромба', square: 'квадрата' },
      colors3: { blue: 'фиолетовые фишки', red: 'красные фишки', yellow: 'жёлтые фишки' },
      shapeNames: { circle: 'круг', diamond: 'ромб', square: 'квадрат' },
      colorNames: { blue: 'фиолетовый', red: 'красный', yellow: 'жёлтый' },
      cell: 'Клетка {n}', usedSlot: 'Использована фишка: {piece}', showResult: 'Показать результат',
      rules: [
        'Соберите линию из трёх фишек: по горизонтали, вертикали или диагонали.',
        'Все три фишки должны быть одной <b>формы</b> (любых цветов) или одного <b>цвета</b> (любых форм):',
        'Считаются фишки <b>обоих</b> игроков. Побеждает тот, кто завершил линию.',
        'Вы ходите первым и получаете 5 фишек, у ИИ — 4. Фишки обоих игроков открыты.',
        'Каждая раздача проверена заранее: при правильной игре вы всегда можете выиграть.',
      ],
    },
  };
  const T = STRINGS[LANG];
  const t = (k, vars) => String(T[k] == null ? k : T[k]).replace(/\{(\w+)\}/g, (_, v) => (vars && vars[v] != null ? vars[v] : ''));
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  $$('[data-i18n-aria]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n-aria'));
    el.setAttribute('aria-label', v);
    if (el.hasAttribute('title')) el.setAttribute('title', v);
  });

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('trix.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('trix.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  // Difficulty bands: how many of the player's moves keep the forced win at the
  // tightest moment of the game (minWinFrac). Lower = harder.
  // Measured on the double18 pool: easy ≈ 40% of deals, normal ≈ 31%, hard ≈ 28%
  // (hard deals are mostly 7–9-ply forced wins with a single correct move at some point).
  const DIFF = {
    easy:   { minWinFracMin: 0.35, minWinFracMax: 1.0 },
    normal: { minWinFracMin: 0.15, minWinFracMax: 0.35 },
    hard:   { minWinFracMin: 0.0,  minWinFracMax: 0.15 },
  };
  const POOL = 'double18';
  let difficulty = params.get('diff') || store.get('difficulty', 'normal');
  if (!DIFF[difficulty]) difficulty = 'normal';

  // ---------------------------------------------------------------------------
  // Piece rendering
  // ---------------------------------------------------------------------------
  const STROKE = { blue: '#2a1f6b', red: '#6b1a22', yellow: '#6b4a12' };
  function pieceSVG(type) {
    const shape = E.SHAPES[E.shapeOf(type)];
    const color = E.COLORS[E.colorOf(type)];
    let body, gloss;
    if (shape === 'circle') {
      body = '<circle cx="50" cy="50" r="38"/>';
      gloss = '<ellipse cx="42" cy="33" rx="19" ry="11"/>';
    } else if (shape === 'diamond') {
      body = '<path d="M50 9 L91 50 L50 91 L9 50 Z"/>';
      gloss = '<ellipse cx="42" cy="36" rx="13" ry="6" transform="rotate(-45 42 36)"/>';
    } else {
      body = '<rect x="13" y="13" width="74" height="74" rx="15"/>';
      gloss = '<ellipse cx="40" cy="30" rx="20" ry="9"/>';
    }
    return '<svg class="piece piece--' + shape + ' piece--' + color + '" viewBox="0 0 100 100" data-type="' + type + '" role="img" aria-label="' + pieceName(type) + '">' +
      '<g fill="url(#g-' + color + ')" stroke="' + STROKE[color] + '" stroke-width="5" stroke-linejoin="round">' + body + '</g>' +
      '<g fill="url(#g-gloss)">' + gloss + '</g></svg>';
  }
  function pieceName(type) {
    return T.colorNames[E.COLORS[E.colorOf(type)]] + ' ' + T.shapeNames[E.SHAPES[E.shapeOf(type)]];
  }
  function pieceEl(type) {
    const tmp = document.createElement('div');
    tmp.innerHTML = pieceSVG(type);
    return tmp.firstChild;
  }

  // ---------------------------------------------------------------------------
  // Bokeh background
  // ---------------------------------------------------------------------------
  function initBokeh() {
    const host = $('#bokeh');
    const n = Math.min(46, Math.max(24, Math.round(window.innerWidth * window.innerHeight / 14000)));
    let html = '';
    for (let i = 0; i < n; i++) {
      const s = 5 + Math.random() * 30;
      const blur = s > 22 ? 2 + Math.random() * 3 : Math.random() * 1.5;
      const o = 0.25 + Math.random() * 0.6;
      const d = 14 + Math.random() * 22;
      const delay = -Math.random() * d;
      const dx = (Math.random() * 60 - 30).toFixed(0) + 'px';
      const dy = (-20 - Math.random() * 90).toFixed(0) + 'px';
      html += '<span style="--x:' + (Math.random() * 100).toFixed(1) + '%;--y:' + (Math.random() * 100).toFixed(1) + '%;--s:' + s.toFixed(1) + 'px;--b:' + blur.toFixed(1) + 'px;--o:' + o.toFixed(2) + ';--d:' + d.toFixed(1) + 's;--delay:' + delay.toFixed(1) + 's;--dx:' + dx + ';--dy:' + dy + '"></span>';
    }
    host.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const ui = {
    splash: $('#splash'), game: $('#game'), board: $('#board'), handAi: $('#hand-ai'), handPlayer: $('#hand-player'),
    status: $('#status'), overlay: $('#overlay'), rules: $('#rules'), dragLayer: $('#drag-layer'),
    restart: $('#btn-restart'),
  };
  let game = null;        // Engine.Game
  let deal = null;        // { pHand, aHand, ... }
  let selected = null;    // index into playerSlots of the selected slot
  let playerSlots = [];   // [{ type, used, el }]
  let aiSlots = [];
  let busy = false;       // true while AI is moving / animating / game over
  let aiTimer = null;
  let overlayTimer = null;
  let aiAnim = null;      // pending Web Animation of the AI piece flight
  let drag = null;        // active pointer interaction on a player slot: { slot, pointerId, startX, startY, dragging, ghost, hoverCell }
  let nextDeal = null, nextDealDiff = null, prefetchTimer = null; // deal generated ahead of time, off the click path
  let generation = 0;     // bumps on every startGame; guards async deal callbacks
  let lastFocus = null;   // element to return focus to when a dialog closes
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seedParam = seedFromParams();
  let rng = E.mulberry32(seedParam != null ? seedParam : (Math.random() * 4294967296) >>> 0);

  function seedFromParams() {
    const s = params.get('seed');
    if (s == null) return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? hashString(s) : n >>> 0;
  }
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ---------------------------------------------------------------------------
  // New game
  // ---------------------------------------------------------------------------
  function makeDeal() {
    // `rng` is seeded once per page load (from ?seed when given), so New deal always
    // moves on to the next deal while staying reproducible for a given seed.
    const band = DIFF[difficulty];
    let d = E.generateDeal({ pool: POOL, rng, minWinFracMin: band.minWinFracMin, minWinFracMax: band.minWinFracMax, maxTries: 300 });
    if (!d) d = E.generateDeal({ pool: POOL, rng, allowDraw: true, maxTries: 500 });
    return d;
  }

  /** Generate the next deal a moment after a game starts so New deal / Play feel instant. */
  function prefetchDeal() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      if (nextDeal && nextDealDiff === difficulty) return;
      nextDeal = makeDeal();
      nextDealDiff = difficulty;
    }, 80);
  }

  function startGame(existingDeal) {
    clearTimeout(aiTimer); clearTimeout(overlayTimer);
    if (aiAnim) { aiAnim.onfinish = null; aiAnim.cancel(); aiAnim = null; }
    drag = null;
    closeDialogs();
    ui.dragLayer.innerHTML = '';
    const gen = ++generation;
    let d = existingDeal || null;
    if (!d && nextDeal && nextDealDiff === difficulty) { d = nextDeal; nextDeal = null; }
    if (d) { beginGame(d); return; }
    // Nothing prefetched: paint a "dealing" state first so the tap is acknowledged,
    // then run the solver on the next task.
    game = null; deal = null; selected = null; busy = true;
    window.__game = null; window.__deal = null;
    playerSlots = []; aiSlots = [];
    ui.handAi.innerHTML = ''; ui.handPlayer.innerHTML = '';
    renderBoard();
    $('#diff-caption').textContent = t(difficulty);
    syncRestartButton();
    setStatus(t('dealing'), true);
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      if (gen === generation) beginGame(makeDeal());
    };
    requestAnimationFrame(() => setTimeout(go, 0)); // after the "dealing" frame has painted
    setTimeout(go, 250);                             // fallback: rAF never fires in a hidden tab
  }

  function beginGame(d) {
    deal = d;
    game = new E.Game(deal.pHand, deal.aHand);
    window.__game = game; window.__deal = deal;
    selected = null; busy = false;
    $('#diff-caption').textContent = t(difficulty);
    renderBoard();
    renderHands();
    updateTurn();
    syncRestartButton();
    prefetchDeal();
  }

  /** "Restart this deal" only makes sense once at least one piece is on the board. */
  function syncRestartButton() {
    ui.restart.disabled = !(game && game.moves.length > 0);
  }

  function renderBoard() {
    ui.board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.cell = i;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', t('cell', { n: i + 1 }));
      c.tabIndex = 0;
      ui.board.appendChild(c);
    }
  }

  function renderHands() {
    ui.handAi.innerHTML = '';
    ui.handPlayer.innerHTML = '';
    aiSlots = deal.aHand.map((type) => makeSlot(ui.handAi, type, false));
    playerSlots = deal.pHand.map((type) => makeSlot(ui.handPlayer, type, true));
    ui.handAi.classList.add('hand--ai');
    ui.handPlayer.classList.add('hand--player');
  }

  function makeSlot(host, type, interactive) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.appendChild(pieceEl(type));
    el.setAttribute('aria-label', pieceName(type));
    host.appendChild(el);
    const slot = { type, used: false, el };
    if (interactive) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectSlot(playerSlots.indexOf(slot)); }
      });
      attachDrag(slot);
    }
    return slot;
  }

  function cellEl(i) { return ui.board.children[i]; }

  // ---------------------------------------------------------------------------
  // Turn handling
  // ---------------------------------------------------------------------------
  function setStatus(text, thinking) {
    ui.status.innerHTML = (thinking ? '<span class="dot"></span>' : '') + '<span>' + text + '</span>';
  }

  function updateTurn() {
    if (game.result) return;
    const side = game.sideToMove();
    const playerTurn = side === 'P';
    ui.handPlayer.classList.toggle('is-locked', !playerTurn);
    playerSlots.forEach((s) => s.el.classList.toggle('is-selectable', playerTurn && !s.used));
    if (playerTurn) {
      setStatus(selected == null ? t('turnPick') : t('turnPlace'));
      highlightTargets(selected != null);
    } else {
      setStatus(t('aiThinking'), true);
      highlightTargets(false);
      busy = true;
      clearTimeout(aiTimer);
      if (!aiAnim) aiTimer = setTimeout(aiMove, 550 + Math.random() * 350);
    }
  }

  function highlightTargets(on) {
    for (let i = 0; i < 9; i++) cellEl(i).classList.toggle('is-target', on && game.board[i] === E.EMPTY);
  }

  function selectSlot(idx) {
    if (busy || game.result || game.sideToMove() !== 'P') return;
    if (idx != null && playerSlots[idx].used) return;
    selected = (selected === idx) ? null : idx;
    syncSelected();
    updateTurn();
  }

  /** Mirror `selected` into the slots' classes and ARIA state. */
  function syncSelected() {
    playerSlots.forEach((s, i) => {
      const on = i === selected && !s.used;
      s.el.classList.toggle('is-selected', on);
      s.el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function placePiece(side, slot, cell, animateIn) {
    const result = game.play(side, slot.type, cell);
    syncRestartButton();
    slot.used = true;
    slot.el.classList.add('is-empty');
    slot.el.classList.remove('is-selected', 'is-dragging');
    slot.el.innerHTML = '';
    slot.el.tabIndex = -1;
    slot.el.setAttribute('aria-label', t('usedSlot', { piece: pieceName(slot.type) }));
    syncSelected();
    $$('.cell.is-last').forEach((c) => c.classList.remove('is-last'));
    const el = pieceEl(slot.type);
    if (animateIn) el.classList.add('is-placed');
    const c = cellEl(cell);
    c.appendChild(el);
    c.classList.add('is-last');
    c.classList.remove('is-target', 'is-hover');
    c.tabIndex = -1;
    c.setAttribute('aria-label', t('cell', { n: cell + 1 }) + ': ' + pieceName(slot.type));
    return result;
  }

  function playerMove(cell) {
    if (busy || selected == null || game.board[cell] !== E.EMPTY || game.sideToMove() !== 'P') return false;
    const slot = playerSlots[selected];
    selected = null;
    const result = placePiece('P', slot, cell, true);
    highlightTargets(false);
    if (result) endGame(result); else updateTurn();
    return true;
  }

  function aiMove() {
    if (!game || game.result || game.sideToMove() !== 'A' || aiAnim) return;
    const m = game.aiMove(rng);
    const slot = aiSlots.find((s) => !s.used && s.type === m.type);
    // Fly the piece from the AI hand to the target cell.
    const from = slot.el.querySelector('.piece').getBoundingClientRect();
    const cell = cellEl(m.cell);
    const cr = cell.getBoundingClientRect();
    const size = cr.width * 0.82;
    const ghost = pieceEl(m.type);
    ghost.classList.add('drag-ghost');
    ghost.style.width = from.width + 'px'; ghost.style.height = from.height + 'px';
    ghost.style.left = (from.left + from.width / 2) + 'px'; ghost.style.top = (from.top + from.height / 2) + 'px';
    ghost.style.transform = 'translate(-50%,-50%)';
    ui.dragLayer.appendChild(ghost);
    slot.el.innerHTML = ''; slot.el.classList.add('is-empty');
    const dx = (cr.left + cr.width / 2) - (from.left + from.width / 2);
    const dy = (cr.top + cr.height / 2) - (from.top + from.height / 2);
    const scale = size / from.width;
    const thisGame = game;
    const anim = ghost.animate([
      { transform: 'translate(-50%,-50%) scale(1)' },
      { transform: 'translate(-50%,-50%) translate(' + (dx * 0.5) + 'px,' + (dy * 0.5) + 'px) scale(' + ((1 + scale) / 2 * 1.25) + ')', offset: 0.5 },
      { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')' },
    ], { duration: reduceMotion() ? 1 : 520, easing: 'cubic-bezier(.35,.1,.3,1)', fill: 'forwards' });
    aiAnim = anim;
    anim.onfinish = () => {
      ghost.remove();
      aiAnim = null;
      if (game !== thisGame) return; // a new game started mid-flight
      const result = placePiece('A', slot, m.cell, false);
      busy = false;
      if (result) endGame(result); else updateTurn();
    };
  }

  // ---------------------------------------------------------------------------
  // Game end
  // ---------------------------------------------------------------------------
  function endGame(result) {
    busy = true;
    highlightTargets(false);
    ui.handPlayer.classList.add('is-locked');
    selected = null;
    syncSelected();
    playerSlots.forEach((s) => s.el.classList.remove('is-selectable'));
    const cells = new Set();
    result.lines.forEach((l) => l.forEach((c) => cells.add(c)));
    cells.forEach((c) => cellEl(c).classList.add('is-win'));
    const stats = store.get('stats', { wins: 0, losses: 0, draws: 0 });
    let title, text, cls;
    if (result.winner === 'P') {
      stats.wins++; cls = 'win'; title = t('win');
      text = t('winText', { what: describeLine(result.lines[0]) });
    } else if (result.winner === 'A') {
      stats.losses++; cls = 'lose'; title = t('lose'); text = t('loseText');
    } else {
      stats.draws++; cls = 'draw'; title = t('draw'); text = t('drawText');
    }
    store.set('stats', stats);
    setStatus(title);
    $('#result-title').textContent = title;
    $('#result-title').className = 'dialog-title ' + cls;
    $('#result-text').textContent = text;
    $('#result-stats').innerHTML =
      '<div><b>' + stats.wins + '</b>' + t('wins') + '</div>' +
      '<div><b>' + stats.draws + '</b>' + t('draws') + '</div>' +
      '<div><b>' + stats.losses + '</b>' + t('losses') + '</div>';
    overlayTimer = setTimeout(() => { showDialog(ui.overlay, $('#btn-again')); }, result.winner ? 1100 : 700);
  }

  // ---------------------------------------------------------------------------
  // Dialogs (focus management + inert background)
  // ---------------------------------------------------------------------------
  function showDialog(el, primary) {
    if (el.hidden) lastFocus = document.activeElement;
    el.hidden = false; unsettle(el);
    ui.game.inert = true; ui.splash.inert = true;
    if (primary) primary.focus();
  }
  function hideDialog(el) {
    el.hidden = true;
    if (ui.overlay.hidden && ui.rules.hidden) {
      ui.game.inert = false; ui.splash.inert = false;
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
      lastFocus = null;
    }
  }
  function closeDialogs() {
    ui.overlay.hidden = true; ui.rules.hidden = true;
    ui.game.inert = false; ui.splash.inert = false;
    lastFocus = null;
  }
  /** Dismiss the result dialog but keep a visible way to bring it back. */
  function hideResult() {
    hideDialog(ui.overlay);
    if (!game || !game.result) return;
    ui.status.innerHTML = '<span></span><button type="button" class="btn btn-ghost btn-mini" id="btn-show-result"></button>';
    ui.status.firstChild.textContent = $('#result-title').textContent;
    const b = $('#btn-show-result');
    b.textContent = t('showResult');
    b.addEventListener('click', () => showDialog(ui.overlay, $('#btn-again')));
  }

  function describeLine(line) {
    const a = game.board[line[0]], b = game.board[line[1]], c = game.board[line[2]];
    if (E.shapeOf(a) === E.shapeOf(b) && E.shapeOf(b) === E.shapeOf(c)) return T.shapes3[E.SHAPES[E.shapeOf(a)]];
    return T.colors3[E.COLORS[E.colorOf(a)]];
  }

  // ---------------------------------------------------------------------------
  // Input: tap-to-select + drag-and-drop
  // ---------------------------------------------------------------------------
  // One drag at a time; move/up/cancel are handled on window so a lost pointer
  // capture or a second finger can never leave a ghost or a stuck selection behind.
  function attachDrag(slot) {
    slot.el.addEventListener('pointerdown', (ev) => {
      if (drag || busy || slot.used || !game || game.result || game.sideToMove() !== 'P') return;
      if (ev.button != null && ev.button !== 0) return;
      drag = { slot, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, dragging: false, ghost: null, hoverCell: null };
      try { slot.el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    });
  }

  window.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (!drag.dragging) {
      if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 8) return;
      if (busy || drag.slot.used || !game || game.result || game.sideToMove() !== 'P') { drag = null; return; }
      drag.dragging = true;
      selected = playerSlots.indexOf(drag.slot);
      syncSelected();
      drag.slot.el.classList.add('is-dragging');
      drag.ghost = pieceEl(drag.slot.type);
      drag.ghost.classList.add('drag-ghost');
      const cellRect = ui.board.firstChild ? ui.board.firstChild.getBoundingClientRect() : null;
      if (cellRect && cellRect.width) { const sz = Math.round(cellRect.width * 0.82); drag.ghost.style.width = sz + 'px'; drag.ghost.style.height = sz + 'px'; }
      ui.dragLayer.appendChild(drag.ghost);
      highlightTargets(true);
      setStatus(t('turnPlace'));
    }
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = (ev.clientY - 24) + 'px';
    const target = cellAt(ev.clientX, ev.clientY - 24);
    if (drag.hoverCell !== target) {
      if (drag.hoverCell) drag.hoverCell.classList.remove('is-hover');
      drag.hoverCell = target;
      if (target) target.classList.add('is-hover');
    }
  });

  function endDrag(ev, cancelled) {
    if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    if (!d.dragging) {
      if (!cancelled) selectSlot(playerSlots.indexOf(d.slot));
      return;
    }
    if (d.ghost) d.ghost.remove();
    d.slot.el.classList.remove('is-dragging');
    if (d.hoverCell) d.hoverCell.classList.remove('is-hover');
    const canMove = game && !game.result && !busy && game.sideToMove() === 'P';
    const target = cancelled || !ev || !canMove ? null : cellAt(ev.clientX, ev.clientY - 24);
    if (target) playerMove(parseInt(target.dataset.cell, 10));
    else if (canMove) updateTurn(); // dropped outside: keep the piece selected
  }
  window.addEventListener('pointerup', (ev) => endDrag(ev, false));
  window.addEventListener('pointercancel', (ev) => endDrag(ev, true));
  window.addEventListener('blur', () => endDrag(null, true));

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest ? el.closest('.cell') : null;
    if (!cell || !game || game.board[parseInt(cell.dataset.cell, 10)] !== E.EMPTY) return null;
    return cell;
  }

  function onCellActivate(cell) {
    if (!game) return;
    if (game.result) { ui.overlay.hidden = false; return; } // bring the result dialog back
    const idx = parseInt(cell.dataset.cell, 10);
    if (selected == null) {
      // Activating the board with nothing selected: if only one piece is left, auto-select it.
      const left = playerSlots.filter((s) => !s.used);
      if (left.length === 1 && game.sideToMove() === 'P' && !busy && game.board[idx] === E.EMPTY) { selected = playerSlots.indexOf(left[0]); syncSelected(); }
      else return;
    }
    playerMove(idx);
  }
  ui.board.addEventListener('click', (ev) => {
    const cell = ev.target.closest ? ev.target.closest('.cell') : null;
    if (cell) onCellActivate(cell);
  });
  ui.board.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const cell = ev.target.closest ? ev.target.closest('.cell') : null;
    if (cell) { ev.preventDefault(); onCellActivate(cell); }
  });

  // ---------------------------------------------------------------------------
  // Screens, buttons
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Splash demo: replays random winning games on the decorative board
  // ---------------------------------------------------------------------------
  const demo = { timer: null, running: false, rng: E.mulberry32((Math.random() * 4294967296) >>> 0) };
  const demoBoard = $('.board--preview');
  const demoCells = demoBoard ? Array.prototype.slice.call(demoBoard.children) : [];

  /** Generate a random winnable deal and play it out: P takes winning moves, the AI resists. */
  function demoGame() {
    const d = E.generateDeal({ pool: POOL, rng: demo.rng, maxTries: 40 });
    if (!d) return null;
    const g = new E.Game(d.pHand, d.aHand);
    for (let guard = 0; !g.result && guard < 9; guard++) {
      if (g.sideToMove() === 'P') {
        const ms = g.bestPlayerMoves();
        const m = ms[Math.floor(demo.rng() * ms.length)];
        g.play('P', m.type, m.cell);
      } else {
        const m = g.aiMove(demo.rng);
        g.play('A', m.type, m.cell);
      }
    }
    return g.result && g.result.winner === 'P' ? g : null;
  }

  function demoClear() {
    demoBoard.classList.remove('is-fading');
    demoCells.forEach((c) => { c.innerHTML = ''; c.classList.remove('is-win', 'is-last'); });
  }
  function demoStop() {
    demo.running = false;
    clearTimeout(demo.timer); demo.timer = null;
  }
  function demoStart() {
    if (!demoBoard || demo.running) return;
    demo.running = true;
    demo.timer = setTimeout(demoStep, 350);
  }
  function demoStep() {
    if (!demo.running) return;
    const g = demoGame();
    demoClear();
    if (!g) return;
    const fast = reduceMotion();
    const moves = g.moves;
    let i = 0;
    const place = () => {
      if (!demo.running) return;
      if (i < moves.length) {
        const m = moves[i++];
        demoCells.forEach((c) => c.classList.remove('is-last'));
        const el = pieceEl(m.type);
        if (!fast) el.classList.add('is-placed');
        demoCells[m.cell].appendChild(el);
        demoCells[m.cell].classList.add('is-last');
        demo.timer = setTimeout(place, fast ? 0 : 430);
        return;
      }
      const winCells = new Set();
      g.result.lines.forEach((l) => l.forEach((c) => winCells.add(c)));
      winCells.forEach((c) => demoCells[c].classList.add('is-win'));
      if (fast) return; // reduced motion: show one finished game, no cycling
      demo.timer = setTimeout(demoFade, 4200);
    };
    demo.timer = setTimeout(place, fast ? 0 : 300);
  }
  function demoFade() {
    if (!demo.running) return;
    demoCells.forEach((c) => c.classList.remove('is-win', 'is-last'));
    demoBoard.querySelectorAll('.piece').forEach((p) => p.classList.remove('is-placed'));
    demoBoard.classList.add('is-fading');
    demo.timer = setTimeout(demoStep, 480);
  }

  function showSplash() {
    clearTimeout(aiTimer); clearTimeout(overlayTimer);
    if (aiAnim) { aiAnim.onfinish = null; aiAnim.cancel(); aiAnim = null; }
    drag = null;
    ui.dragLayer.innerHTML = '';
    closeDialogs();
    ui.game.hidden = true; ui.splash.hidden = false; unsettle(ui.splash);
    demoStart();
  }
  function showGame() {
    demoStop();
    ui.splash.hidden = true; ui.game.hidden = false; unsettle(ui.game);
  }
  function renderRules() {
    const body = $('#rules-body');
    const ex1 = [E.typeOf(0, 0), E.typeOf(0, 1), E.typeOf(0, 2)].map(pieceSVG).join('');
    const ex2 = [E.typeOf(0, 1), E.typeOf(1, 1), E.typeOf(2, 1)].map(pieceSVG).join('');
    body.innerHTML =
      '<p>' + T.rules[0] + '</p>' +
      '<p>' + T.rules[1] + '</p>' +
      '<div class="rule-row"><span class="mini">' + ex1 + '</span><span class="mini">' + ex2 + '</span></div>' +
      '<p>' + T.rules[2] + '</p>' +
      '<p>' + T.rules[3] + '</p>' +
      '<p>' + T.rules[4] + '</p>';
  }

  function paintDifficulty() {
    $$('#difficulty .seg-btn').forEach((x) => {
      const on = x.dataset.diff === difficulty;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
      x.tabIndex = on ? 0 : -1;
    });
  }
  paintDifficulty();
  $$('#difficulty .seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      difficulty = b.dataset.diff;
      store.set('difficulty', difficulty);
      paintDifficulty();
      prefetchDeal();
    });
  });
  $('#difficulty').addEventListener('keydown', (ev) => {
    const order = ['easy', 'normal', 'hard'];
    let i = order.indexOf(difficulty);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = (i + 1) % order.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = (i + order.length - 1) % order.length;
    else return;
    ev.preventDefault();
    difficulty = order[i]; store.set('difficulty', difficulty); paintDifficulty(); prefetchDeal();
    $('#difficulty .seg-btn[data-diff="' + difficulty + '"]').focus();
  });
  $('#btn-play').addEventListener('click', () => { showGame(); startGame(); });
  $('#btn-home').addEventListener('click', showSplash);
  $('#btn-new').addEventListener('click', () => startGame());
  $('#btn-restart').addEventListener('click', () => { if (deal) startGame({ pHand: deal.pHand, aHand: deal.aHand }); });
  $('#btn-again').addEventListener('click', () => startGame());
  $('#btn-retry').addEventListener('click', () => startGame({ pHand: deal.pHand, aHand: deal.aHand }));
  $('#btn-result-home').addEventListener('click', showSplash);
  ui.overlay.addEventListener('click', (ev) => { if (ev.target === ui.overlay) hideResult(); });
  const openRules = () => { renderRules(); showDialog(ui.rules, $('#btn-rules-close')); };
  $('#btn-rules').addEventListener('click', openRules);
  $('#btn-rules-splash').addEventListener('click', openRules);
  $('#btn-rules-close').addEventListener('click', () => hideDialog(ui.rules));
  ui.rules.addEventListener('click', (ev) => { if (ev.target === ui.rules) hideDialog(ui.rules); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!ui.rules.hidden) hideDialog(ui.rules);
    else if (!ui.overlay.hidden) hideResult();
  });

  // Small debug/testing surface (used by automated checks).
  window.__ui = {
    selectSlot, playerMove, startGame, showGame, showSplash,
    get game() { return game; }, get deal() { return deal; }, get selected() { return selected; }, get busy() { return busy; },
    setDifficulty(d) { if (DIFF[d]) { difficulty = d; store.set('difficulty', d); } },
    get demoRunning() { return demo.running; },
  };

  // After an entrance animation finishes, mark the element settled (see .is-settled in CSS).
  $$('.screen, .overlay').forEach((el) => {
    el.addEventListener('animationend', (ev) => { if (ev.target === el) el.classList.add('is-settled'); });
  });
  const unsettle = (el) => el.classList.remove('is-settled');

  // Offline support for the hosted web version (skipped on localhost so the dev server always serves fresh files;
  // ?sw=1 forces registration for testing). Native shells load files locally and do not need it.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) &&
      (params.get('sw') === '1' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }); });
  }

  initBokeh();
  if (params.get('autostart') === '1') { showGame(); startGame(); }
  else { prefetchDeal(); demoStart(); }
  document.addEventListener('visibilitychange', () => {
    if (ui.splash.hidden) return;
    if (document.hidden) demoStop(); else demoStart();
  });
})();
