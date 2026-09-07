/* 3LOGIX — UI */
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
      ai: 'AI', you: 'You', turn: 'your turn', aiTurn: 'thinking',
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
      ai: 'ИИ', you: 'Вы', turn: 'ваш ход', aiTurn: 'думает',
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

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('3logix.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('3logix.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
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
    return '<svg class="piece piece--' + shape + ' piece--' + color + '" viewBox="0 0 100 100" data-type="' + type + '" aria-label="' + shape + ' ' + color + '">' +
      '<g fill="url(#g-' + color + ')" stroke="' + STROKE[color] + '" stroke-width="5" stroke-linejoin="round">' + body + '</g>' +
      '<g fill="url(#g-gloss)">' + gloss + '</g></svg>';
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
    aiBadge: $('#ai-badge'), playerBadge: $('#player-badge'),
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
  let rng = E.mulberry32((Math.random() * 4294967296) >>> 0);

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
    const seed = seedFromParams();
    const dealRng = seed != null ? E.mulberry32(seed) : rng;
    const band = DIFF[difficulty];
    let d = E.generateDeal({ pool: POOL, rng: dealRng, minWinFracMin: band.minWinFracMin, minWinFracMax: band.minWinFracMax, maxTries: 300 });
    if (!d) d = E.generateDeal({ pool: POOL, rng: dealRng, allowDraw: true, maxTries: 500 });
    return d;
  }

  function startGame(existingDeal) {
    clearTimeout(aiTimer); clearTimeout(overlayTimer);
    if (aiAnim) { aiAnim.onfinish = null; aiAnim.cancel(); aiAnim = null; }
    ui.overlay.hidden = true;
    ui.dragLayer.innerHTML = '';
    deal = existingDeal || makeDeal();
    game = new E.Game(deal.pHand, deal.aHand);
    window.__game = game; window.__deal = deal;
    selected = null; busy = false;
    $('#diff-caption').textContent = t(difficulty);
    renderBoard();
    renderHands();
    updateTurn();
  }

  function renderBoard() {
    ui.board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.cell = i;
      c.setAttribute('role', 'gridcell');
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
    host.appendChild(el);
    const slot = { type, used: false, el };
    if (interactive) attachDrag(slot);
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
    ui.playerBadge.textContent = t('turn'); ui.playerBadge.classList.toggle('is-on', playerTurn);
    ui.aiBadge.textContent = t('aiTurn'); ui.aiBadge.classList.toggle('is-on', !playerTurn);
    playerSlots.forEach((s) => s.el.classList.toggle('is-selectable', playerTurn && !s.used));
    if (playerTurn) {
      setStatus(selected == null ? t('turnPick') : t('turnPlace'));
      highlightTargets(selected != null);
    } else {
      setStatus(t('aiThinking'), true);
      highlightTargets(false);
      busy = true;
      aiTimer = setTimeout(aiMove, 550 + Math.random() * 350);
    }
  }

  function highlightTargets(on) {
    for (let i = 0; i < 9; i++) cellEl(i).classList.toggle('is-target', on && game.board[i] === E.EMPTY);
  }

  function selectSlot(idx) {
    if (busy || game.result || game.sideToMove() !== 'P') return;
    if (idx != null && playerSlots[idx].used) return;
    selected = (selected === idx) ? null : idx;
    playerSlots.forEach((s, i) => s.el.classList.toggle('is-selected', i === selected));
    updateTurn();
  }

  function placePiece(side, slot, cell, animateIn) {
    const result = game.play(side, slot.type, cell);
    slot.used = true;
    slot.el.classList.add('is-empty');
    slot.el.classList.remove('is-selected', 'is-dragging');
    slot.el.innerHTML = '';
    $$('.cell.is-last').forEach((c) => c.classList.remove('is-last'));
    const el = pieceEl(slot.type);
    if (animateIn) el.classList.add('is-placed');
    const c = cellEl(cell);
    c.appendChild(el);
    c.classList.add('is-last');
    c.classList.remove('is-target', 'is-hover');
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
    if (game.result) return;
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
    ], { duration: 520, easing: 'cubic-bezier(.35,.1,.3,1)', fill: 'forwards' });
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
    ui.playerBadge.classList.remove('is-on'); ui.aiBadge.classList.remove('is-on');
    playerSlots.forEach((s) => s.el.classList.remove('is-selectable', 'is-selected'));
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
    overlayTimer = setTimeout(() => { ui.overlay.hidden = false; }, result.winner ? 1100 : 700);
  }

  function describeLine(line) {
    const a = game.board[line[0]], b = game.board[line[1]], c = game.board[line[2]];
    if (E.shapeOf(a) === E.shapeOf(b) && E.shapeOf(b) === E.shapeOf(c)) return T.shapes3[E.SHAPES[E.shapeOf(a)]];
    return T.colors3[E.COLORS[E.colorOf(a)]];
  }

  // ---------------------------------------------------------------------------
  // Input: tap-to-select + drag-and-drop
  // ---------------------------------------------------------------------------
  function attachDrag(slot) {
    const el = slot.el;
    let startX = 0, startY = 0, dragging = false, ghost = null, hoverCell = null, pointerId = null;

    el.addEventListener('pointerdown', (ev) => {
      if (busy || slot.used || !game || game.sideToMove() !== 'P') return;
      if (ev.button != null && ev.button !== 0) return;
      pointerId = ev.pointerId;
      startX = ev.clientX; startY = ev.clientY; dragging = false;
      try { el.setPointerCapture(pointerId); } catch (e) { /* ignore */ }
    });

    el.addEventListener('pointermove', (ev) => {
      if (pointerId !== ev.pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
        dragging = true;
        selected = playerSlots.indexOf(slot);
        playerSlots.forEach((s, i) => s.el.classList.toggle('is-selected', i === selected));
        el.classList.add('is-dragging');
        ghost = pieceEl(slot.type);
        ghost.classList.add('drag-ghost');
        ui.dragLayer.appendChild(ghost);
        highlightTargets(true);
        setStatus(t('turnPlace'));
      }
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = (ev.clientY - 24) + 'px';
      const target = cellAt(ev.clientX, ev.clientY - 24);
      if (hoverCell !== target) {
        if (hoverCell) hoverCell.classList.remove('is-hover');
        hoverCell = target;
        if (hoverCell) hoverCell.classList.add('is-hover');
      }
    });

    const finish = (ev, cancelled) => {
      if (pointerId !== ev.pointerId) return;
      pointerId = null;
      if (!dragging) {
        if (!cancelled) selectSlot(playerSlots.indexOf(slot));
        return;
      }
      dragging = false;
      if (ghost) ghost.remove(); ghost = null;
      el.classList.remove('is-dragging');
      const target = cancelled ? null : cellAt(ev.clientX, ev.clientY - 24);
      if (hoverCell) hoverCell.classList.remove('is-hover'); hoverCell = null;
      if (target) {
        playerMove(parseInt(target.dataset.cell, 10));
      } else {
        // Dropped outside: keep the piece selected so a tap on a cell still works.
        updateTurn();
      }
    };
    el.addEventListener('pointerup', (ev) => finish(ev, false));
    el.addEventListener('pointercancel', (ev) => finish(ev, true));
  }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = el.closest ? el.closest('.cell') : null;
    if (!cell || !game || game.board[parseInt(cell.dataset.cell, 10)] !== E.EMPTY) return null;
    return cell;
  }

  ui.board.addEventListener('click', (ev) => {
    const cell = ev.target.closest ? ev.target.closest('.cell') : null;
    if (!cell || !game || game.result) return;
    const idx = parseInt(cell.dataset.cell, 10);
    if (selected == null) {
      // Tapping the board with nothing selected: if only one piece is left, auto-select it.
      const left = playerSlots.filter((s) => !s.used);
      if (left.length === 1 && game.sideToMove() === 'P' && !busy) { selected = playerSlots.indexOf(left[0]); }
      else return;
    }
    playerMove(idx);
  });

  // ---------------------------------------------------------------------------
  // Screens, buttons
  // ---------------------------------------------------------------------------
  function showSplash() {
    clearTimeout(aiTimer); clearTimeout(overlayTimer);
    if (aiAnim) { aiAnim.onfinish = null; aiAnim.cancel(); aiAnim = null; }
    ui.dragLayer.innerHTML = '';
    ui.overlay.hidden = true; ui.rules.hidden = true;
    ui.game.hidden = true; ui.splash.hidden = false;
  }
  function showGame() {
    ui.splash.hidden = true; ui.game.hidden = false;
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

  $$('#difficulty .seg-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.diff === difficulty);
    b.addEventListener('click', () => {
      difficulty = b.dataset.diff;
      store.set('difficulty', difficulty);
      $$('#difficulty .seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
    });
  });
  $('#btn-play').addEventListener('click', () => { showGame(); startGame(); });
  $('#btn-home').addEventListener('click', showSplash);
  $('#btn-new').addEventListener('click', () => startGame());
  $('#btn-again').addEventListener('click', () => startGame());
  $('#btn-retry').addEventListener('click', () => startGame({ pHand: deal.pHand, aHand: deal.aHand }));
  ui.overlay.addEventListener('click', (ev) => { if (ev.target === ui.overlay) ui.overlay.hidden = true; });
  const openRules = () => { renderRules(); ui.rules.hidden = false; };
  $('#btn-rules').addEventListener('click', openRules);
  $('#btn-rules-splash').addEventListener('click', openRules);
  $('#btn-rules-close').addEventListener('click', () => { ui.rules.hidden = true; });
  ui.rules.addEventListener('click', (ev) => { if (ev.target === ui.rules) ui.rules.hidden = true; });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ui.rules.hidden = true; if (game && game.result) ui.overlay.hidden = true; }
  });

  // Small debug/testing surface (used by automated checks).
  window.__ui = {
    selectSlot, playerMove, startGame, showGame, showSplash,
    get game() { return game; }, get deal() { return deal; }, get selected() { return selected; }, get busy() { return busy; },
    setDifficulty(d) { if (DIFF[d]) { difficulty = d; store.set('difficulty', d); } },
  };

  initBokeh();
  if (params.get('autostart') === '1') { showGame(); startGame(); }
})();
