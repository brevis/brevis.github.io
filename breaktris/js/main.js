// Экраны, HUD, модалки, сохранение прогресса.
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { parseCharge, NORMAL, TNT, STEEL, ICE } from './logic.js';
import { buildBlockSprites, buildTrayPiece } from './sprites.js';
import { TitleBg } from './title-bg.js';
import { makeBlitzFigure } from './blitz.js';
import { sfx, unlockAudio, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);

// ---------- Сохранение (для продакшена в Capacitor можно заменить на @capacitor/preferences) ----------
const KEY = 'kaboomino.v1';
const loaded = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
})();
const freshSave = !loaded;
const save = Object.assign({ best: {}, hints: 3, sound: true, seen: {} }, loaded || {});
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
setSound(save.sound);

// Лучший результат хранится по названию уровня (save.best), чтобы новые уровни можно было
// вставлять в середину глав. Старые сохранения — массив звёзд по номерам уровней версии
// с 64 уровнями — переносим по тогдашнему порядку.
const LEGACY_ORDER_64 = [
  'First Blast', 'Kitty', 'Crab', 'Arrow', 'Mushroom', 'Sketch', 'Fish', 'Heart',
  'Dynamite', 'Tower', 'Fuse', 'Bomb', 'Smile', 'Invader', 'Truck', 'Tank',
  'Napalm', 'Rocket', 'Cactus', 'Flower', 'Campfire', 'Volcano', 'Tree', 'Candle',
  'Snowman', 'Dragon', 'Steel', 'Shield', 'Anvil', 'Bulldozer', 'Trophy', 'Safe',
  'Padlock', 'Robot', 'Knight', 'Helmet', 'Castle', 'Turtle', 'Laser', 'Pyramid',
  'Ladder', 'Bookshelf', 'Burger', 'Skyscraper', 'Spaceship', 'Barcode', 'Rainbow', 'Cake',
  'Stairs', 'Skull', 'Ghost', 'Frog', 'Ship', 'Crown', 'Whale', 'Car',
  'Alien', 'Plane', 'Owl', 'Penguin', 'Octopus', 'Castle Siege', 'Dragon King', 'KABOOM',
];
if (Array.isArray(save.stars)) {
  save.stars.forEach((st, i) => {
    const name = LEGACY_ORDER_64[i];
    if (st && name) save.best[name] = Math.max(save.best[name] || 0, st);
  });
  delete save.stars;
  persist();
}

const starsOf = i => save.best[LEVELS[i].name] || 0;
// Открыты все уровни до последнего пройденного включительно и один следующий,
// а «Играть» ведёт на первый непройденный — так новые уровни в середине не теряются.
const maxOpen = () => {
  let m = 0;
  LEVELS.forEach((l, i) => { if (save.best[l.name]) m = i + 1; });
  return Math.min(m, LEVELS.length - 1);
};
const firstUnplayed = () => {
  const i = LEVELS.findIndex(l => !save.best[l.name]);
  return i < 0 ? LEVELS.length - 1 : i;
};
const totalStars = () => LEVELS.reduce((a, l) => a + (save.best[l.name] || 0), 0);

// ---------- Утилиты UI ----------
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

let titleBg = null;
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  $('hud').classList.toggle('hidden', id !== null);
  if (titleBg) id === 'screen-title' && !document.hidden ? titleBg.start() : titleBg.stop();
}

let modalOnClose = null;
function openModal(html, bind, sheet = false) {
  $('modal-card').innerHTML = html;
  $('modal').classList.toggle('sheet', sheet);
  $('modal').classList.remove('hidden');
  bind && bind($('modal-card'));
}
function closeModal() {
  $('modal').classList.add('hidden');
  const f = modalOnClose; modalOnClose = null;
  f && f();
}

function starsHtml(n, cls = '') {
  return [0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''} ${cls}" style="animation-delay:${0.15 + i * 0.3}s">★</i>`).join('');
}

// ---------- Игра ----------
const cv = $('cv');
const probe = $('safe-probe');
const ui = {
  safeBottom: () => parseFloat(getComputedStyle(probe).paddingBottom) || 0,
  hudBottom: () => $('hud').getBoundingClientRect().bottom,
  onFirstTouch: () => unlockAudio(),
  onHud: onHud,
  onWin: onWin,
  onStuck: onStuck,
  onBlitzClear: () => blitzClear(),
  onBlitzEnd: () => blitzEnd(),
  onBlitzTime: t => blitzTime(t),
};

function fitCanvas() {
  cv.style.width = window.innerWidth + 'px';
  cv.style.height = window.innerHeight + 'px';
}
fitCanvas();

// Квадратики на фоне: box-shadow одного крошечного элемента, узор повторён дважды по высоте,
// слой едет вверх на высоту экрана и начинает заново — шва не видно.
function buildStars() {
  const W = window.innerWidth, H = window.innerHeight;
  const layer = (el, count, min, max, a0, a1) => {
    const shadows = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * W), y = Math.round(Math.random() * H);
      const spread = (min + Math.random() * (max - min)).toFixed(1);
      const a = (a0 + Math.random() * (a1 - a0)).toFixed(3);
      for (const dy of [0, H]) shadows.push(`${x}px ${y + dy}px 0 ${spread}px rgba(255,255,255,${a})`);
    }
    el.style.boxShadow = shadows.join(',');
    el.style.setProperty('--h', H + 'px');
  };
  layer(document.querySelector('#game-bg .s1'), Math.round(W * H / 5500), 0.5, 1, 0.04, 0.11);
  layer(document.querySelector('#game-bg .s2'), Math.round(W * H / 11000), 1, 1.8, 0.07, 0.15);
}
buildStars();
const game = new Game(cv, ui);
window.__kb = { game, save, startLevel: i => startLevel(i), startBlitz: () => startBlitz() }; // для отладки из консоли

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { fitCanvas(); buildStars(); game.resize(); });
});

let current = 0;
let hudStars = 3;

function startLevel(i) {
  current = i;
  const def = LEVELS[i];
  closeModalSilently();
  leaveBlitz();
  showScreen(null);
  $('hud-title').textContent = `${i + 1}. ${def.name}`;
  $('hud-sub').textContent = `★★★ — ${def.par} ${def.par === 1 ? 'charge' : 'charges'}`;
  hudStars = 3;
  updateHintBadge();
  game.load(i, def);
  const intro = def.intro && !save.seen[def.intro] ? def.intro : null;
  if (intro) {
    save.seen[intro] = 1; persist();
    showIntro(intro, () => afterIntro(def));
  } else afterIntro(def);
}

function afterIntro(def) {
  if (def.intro === 'tutorial') game.showHint(game.hintMove(), true);
  // обучение обвалу: сами показываем удар по «шейке»
  if (def.intro === 'collapse' && !game.moves.length) {
    game.showHint(game.hintMove(), true);
    toast('Hit the thin neck — the loose piece will crumble!', 3200);
  }
}

function closeModalSilently() { modalOnClose = null; $('modal').classList.add('hidden'); }

function onHud(s) {
  const potential = s.used <= s.par ? 3 : s.used <= s.par + 1 ? 2 : 1;
  const stars = $('hud-stars').children;
  for (let i = 0; i < 3; i++) stars[i].classList.toggle('off', i >= potential);
  if (potential < hudStars && !game.blitz) toast(potential === 2 ? 'No more ★★★ — you can undo' : 'Only one star left');
  hudStars = potential;
  if (!game.blitz) $('progress-fill').style.transform = `scaleX(${s.progress})`;
  $('btn-undo').disabled = !s.canUndo;
  animateScore(s.score);
}

// Счёт в HUD плавно докручивается до нового значения.
let shownScore = 0, scoreRaf = 0;
function animateScore(target) {
  cancelAnimationFrame(scoreRaf);
  const el = $('hud-score');
  if (target < shownScore) { shownScore = target; el.textContent = fmt(target); return; }
  const from = shownScore, t0 = performance.now();
  const step = now => {
    const k = Math.max(0, Math.min(1, (now - t0) / 450)); // метка кадра rAF бывает чуть раньше t0
    shownScore = Math.round(from + (target - from) * (1 - (1 - k) * (1 - k)));
    el.textContent = fmt(shownScore);
    if (k < 1) scoreRaf = requestAnimationFrame(step);
  };
  scoreRaf = requestAnimationFrame(step);
  if (target > from) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
const fmt = n => n.toLocaleString('en-US').replace(/,/g, '\u2009');

function updateHintBadge() { $('hint-count').textContent = save.hints; }

function onWin(res) {
  const prev = starsOf(current);
  let bonus = '';
  if (res.stars === 3 && prev < 3) { save.hints++; bonus = '+1 hint for ★★★'; }
  save.best[LEVELS[current].name] = Math.max(prev, res.stars);
  save.scores = save.scores || {};
  const prevScore = save.scores[LEVELS[current].name] || 0;
  const newBest = res.score > prevScore;
  if (newBest) save.scores[LEVELS[current].name] = res.score;
  persist();
  updateHintBadge();
  const last = current >= LEVELS.length - 1;
  const hint = res.stars < 3 ? `<p>Charges used: ${res.used}. It can be done with ${res.par} — go for ★★★?</p>`
    : `<p>Perfect! Charges used: ${res.used} of ${res.total}.</p>`;
  openModal(`
    <div class="kicker">Level ${current + 1}</div>
    <h3>${last ? 'All blasted!' : 'Blasted!'}</h3>
    <div class="big-stars">${starsHtml(res.stars)}</div>
    <div class="score-line"><b>${fmt(res.score)}</b><span>${newBest ? (prevScore ? 'New best!' : 'points') : `best ${fmt(prevScore)}`}</span></div>
    ${bonus ? `<div class="note">${bonus}</div>` : ''}
    ${hint}
    ${last ? '<p>That was the last level of the prototype.</p>' : ''}
    <div class="btns">
      ${last ? '' : '<button class="btn big" data-a="next">Next</button>'}
      <div class="row">
        <button class="btn secondary" data-a="retry">Retry</button>
        <button class="btn secondary" data-a="levels">Levels</button>
      </div>
    </div>`, card => {
    card.querySelector('[data-a=retry]').onclick = () => { sfx.click(); startLevel(current); };
    card.querySelector('[data-a=levels]').onclick = () => { sfx.click(); closeModalSilently(); openLevels(); };
    const nx = card.querySelector('[data-a=next]');
    if (nx) nx.onclick = () => { sfx.click(); startLevel(current + 1); };
  });
  for (let i = 0; i < res.stars; i++) setTimeout(() => sfx.star(i), 150 + i * 300);
}

function onStuck(reason) {
  if (game.blitz) { blitzStuck(); return; }
  openModal(`
    <h3>Dead end!</h3>
    <p>${reason}. Undo a move and try another way.</p>
    <div class="row">
      <button class="btn" data-a="undo">↶ Undo</button>
      <button class="btn secondary" data-a="restart">Restart</button>
    </div>`, card => {
    card.querySelector('[data-a=undo]').onclick = () => { sfx.click(); closeModalSilently(); game.undo(); };
    card.querySelector('[data-a=restart]').onclick = () => { sfx.click(); closeModalSilently(); game.restart(); hudStars = 3; };
  }, true);
}

// ---------- Карточки новых механик ----------
const INTRO = {
  tutorial: { kicker: 'How to play', title: 'Blast the shape', text: 'Drag a charge from the tray onto the shape. It has to sit fully on blocks — then it blows them up. Destroy every last block!', icon: '##/##' },
  stars: { kicker: 'Stars', title: 'Save your charges', text: "You don't have to use every charge. Clear the shape with fewer to earn ★★★ — leftovers go off as fireworks.", icon: 'stars' },
  tnt: { kicker: 'New block', title: 'TNT', text: 'Goes off from any hit and wipes out everything around it (3×3). TNT next to TNT sets off a chain reaction!', icon: 'tnt' },
  fire: { kicker: 'New charge', title: 'Napalm', text: 'Blasts its shape and sets every neighboring block on fire. It still has to sit fully on blocks.', icon: 'f:#' },
  steel: { kicker: 'New block', title: 'Steel', text: 'Takes two hits: the first blast only cracks it. Cover it twice or finish it off with a blast next to it.', icon: 'steel' },
  laser: { kicker: 'New charge', title: 'Laser', text: 'Burns through every row it touches, edge to edge.', icon: 'l:#' },
  collapse: { kicker: 'New trick', title: 'Collapse', text: 'Cut a piece off the shape and it crumbles on its own. Find the weak spots — one smart blast can drop half the shape!', icon: 'collapse' },
  blitz: { kicker: 'Blitz', title: '60 seconds', text: 'Blast as many shapes as you can before time runs out. Every clear adds +3 s, getting stuck costs 5 s. Big blasts and combos score more!', icon: 'blitz' },
  ice: { kicker: 'New block', title: 'Ice', text: "Charges slide right off ice — you can't place one on it. Melt it with napalm, burn through it with a laser, or blow it up with TNT.", icon: 'ice' },
};

function showIntro(key, then) {
  const it = INTRO[key];
  openModal(`
    <div class="kicker">${it.kicker}</div>
    <h3>${it.title}</h3>
    ${it.icon === 'stars' ? '<div class="big-stars">' + starsHtml(3) + '</div>' : '<canvas id="intro-icon" width="10" height="10"></canvas>'}
    <p>${it.text}</p>
    <div class="btns"><button class="btn big" data-a="ok">Got it</button></div>`, card => {
    const c = card.querySelector('#intro-icon');
    if (c) drawIcon(c, it.icon, 92);
    card.querySelector('[data-a=ok]').onclick = () => { unlockAudio(); sfx.click(); closeModal(); };
  });
  modalOnClose = then;
}

function drawIcon(canvas, icon, size) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  const spr = buildBlockSprites(Math.round(size * 0.6 * dpr));
  const s = canvas.width;
  if (icon === 'collapse' || icon === 'blitz') {
    // три блока держатся, четвёртый отвалился и падает
    const b = s * 0.26;
    const img = icon === 'blitz' ? spr.charge.basic : spr[NORMAL];
    [[0.12, 0.2], [0.38, 0.2], [0.38, 0.46]].forEach(([x, y]) => ctx.drawImage(img, s * x, s * y, b, b));
    ctx.save(); ctx.translate(s * 0.76, s * 0.7); ctx.rotate(0.5); ctx.globalAlpha = 0.85;
    ctx.drawImage(img, -b / 2, -b / 2, b, b); ctx.restore();
    return;
  }
  if (icon === 'tnt' || icon === 'steel' || icon === 'ice') {
    const img = spr[icon === 'tnt' ? TNT : icon === 'ice' ? ICE : STEEL];
    ctx.drawImage(img, s * 0.2, s * 0.2, s * 0.6, s * 0.6);
  } else {
    const ch = parseCharge(icon);
    const m = Math.min(s * 0.8 / ch.w, s * 0.8 / ch.h, s * 0.3);
    ctx.drawImage(buildTrayPiece(s, s, ch, spr, m), 0, 0);
  }
}

// ---------- Экран уровней ----------
function openLevels() {
  showScreen('screen-levels');
  $('total-stars').textContent = `★ ${totalStars()} / ${LEVELS.length * 3}`;
  const grid = $('level-grid');
  const open = maxOpen();
  const next = firstUnplayed();
  grid.innerHTML = LEVELS.map((d, i) => {
    const st = starsOf(i);
    const locked = i > open;
    const stars = [0, 1, 2].map(k => `<span class="${k < st ? '' : 'off'}">★</span>`).join('');
    const head = d.chapter ? `<div class="chapter"><span>${d.chapter}</span></div>` : '';
    return `${head}<button class="lv ${locked ? 'locked' : ''} ${i === next && !st ? 'next' : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
      ${i + 1}<small>${locked ? '' : stars}</small></button>`;
  }).join('');
  // прокрутим к текущему уровню
  const cur = grid.querySelector(`[data-i="${next}"]`);
  if (cur) grid.scrollTop = Math.max(0, cur.offsetTop - grid.offsetTop - grid.clientHeight / 2 + cur.offsetHeight / 2);
  grid.onclick = e => {
    const b = e.target.closest('.lv');
    if (!b || b.disabled) return;
    unlockAudio(); sfx.click();
    startLevel(+b.dataset.i);
  };
}

// ---------- Кнопки ----------
$('btn-play').onclick = () => { unlockAudio(); sfx.click(); startLevel(firstUnplayed()); };
$('btn-levels').onclick = () => { unlockAudio(); sfx.click(); openLevels(); };
$('btn-levels-back').onclick = () => { sfx.click(); titleBg = new TitleBg($('title-bg'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) titleBg.stop();
  else if (!$('screen-title').classList.contains('hidden')) titleBg.start();
});
window.addEventListener('resize', () => titleBg.resize());
showScreen('screen-title'); };
function renderSoundBtn() {
  const b = $('btn-sound');
  b.classList.toggle('muted', !save.sound);
  b.setAttribute('aria-label', save.sound ? 'Sound on' : 'Sound off');
}
$('btn-sound').onclick = () => {
  save.sound = !soundOn(); setSound(save.sound); persist();
  renderSoundBtn();
  const b = $('btn-sound');
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  unlockAudio(); sfx.click();
};
renderSoundBtn();
$('btn-menu').onclick = () => { sfx.click(); if (game.blitz) { leaveBlitz(); showScreen('screen-title'); } else openLevels(); };
$('btn-blitz').onclick = () => { unlockAudio(); sfx.click(); startBlitz(); };
$('btn-undo').onclick = () => { if (game.undo()) sfx.click(); };
$('btn-restart').onclick = () => { sfx.click(); hudStars = 3; if (game.blitz) startBlitz(); else game.restart(); };
$('btn-hint').onclick = () => {
  unlockAudio();
  if (game.busy || game.over) return;
  if (save.hints <= 0) { toast('Out of hints — earn more with ★★★'); return; }
  const m = game.hintMove();
  if (m && m.dead) { toast("Can't be solved from here — undo ↶"); return; }
  if (!m) { toast("Couldn't find a move quickly — try undoing"); return; }
  save.hints--; persist(); updateHintBadge();
  sfx.click();
  game.showHint(m);
};

// Android «назад» в Capacitor
document.addEventListener('backbutton', () => openLevels());

// Декор на титульном экране: фигура из эскиза.
// Эмблема под логотипом: бомба из блоков игры — корпус из обычных блоков, TNT в центре,
// стальная крышка, фитиль из зарядов и мерцающая искра (CSS).
(function drawTitleArt() {
  const c = $('title-art');
  const grid = ['.....f', '....f.', '..SSS..', '.#####.', '###T###', '#######', '.#####.', '..###..'];
  const cell = Math.round(Math.min(21, Math.max(16, (window.innerHeight - 420) / 11)));
  const cols = 7, rows = grid.length;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = cols * cell * dpr; c.height = rows * cell * dpr;
  c.style.width = cols * cell + 'px'; c.style.height = rows * cell + 'px';
  const ctx = c.getContext('2d');
  const spr = buildBlockSprites(Math.round(cell * dpr));
  const pick = { '#': spr[NORMAL], T: spr[TNT], S: spr[STEEL], f: spr.charge.basic };
  const s = cell * dpr;
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (pick[ch]) ctx.drawImage(pick[ch], x * s, y * s, s, s);
  }));
  // искра — над верхним звеном фитиля
  const spark = $('title-spark');
  spark.style.left = 5.75 * cell + 'px';
  spark.style.top = 0.1 * cell + 'px';
})();

// ---------- Ежедневный бонус: +1 подсказка за первый заход в день ----------
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function checkDailyBonus() {
  const day = localDay();
  if (save.lastDaily === day) return;
  const firstLaunch = freshSave && !save.lastDaily;
  save.lastDaily = day;
  // совсем новому игроку в первый день не мешаем: у него и так стартовые подсказки
  if (!firstLaunch) {
    save.hints++;
    updateHintBadge();
    announceDaily();
  }
  persist();
}

function announceDaily() {
  const onTitle = !$('screen-title').classList.contains('hidden');
  if (!onTitle || !$('modal').classList.contains('hidden')) { toast('Daily bonus: +1 hint 💡'); return; }
  openModal(`
    <div class="kicker">Daily bonus</div>
    <div class="daily-icon"><svg viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6V17h6v-.6c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 3Z"/><rect x="9" y="18.5" width="6" height="2.5" rx="1"/></svg></div>
    <h3>+1 hint</h3>
    <p>Thanks for dropping by! You now have ${save.hints} ${save.hints === 1 ? 'hint' : 'hints'}. Come back tomorrow for another one.</p>
    <div class="btns"><button class="btn big" data-a="ok">Nice!</button></div>`, card => {
    card.querySelector('[data-a=ok]').onclick = () => { unlockAudio(); sfx.star(2); closeModal(); };
  });
}

titleBg = new TitleBg($('title-bg'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) titleBg.stop();
  else {
    if (!$('screen-title').classList.contains('hidden')) titleBg.start();
    checkDailyBonus(); // приложение могло пролежать в фоне до следующего дня
  }
});
window.addEventListener('resize', () => titleBg.resize());
showScreen('screen-title');
checkDailyBonus();
if (location.hash === '#blitz') startBlitz();

// ---------- Режим Blitz ----------
const BLITZ_TIME = 60, BLITZ_CLEAR_BONUS = 3, BLITZ_STUCK_PENALTY = 5;

function startBlitz() {
  closeModalSilently();
  showScreen(null);
  $('hud').classList.add('blitz');
  game.blitz = { time: BLITZ_TIME, total: 0, cleared: 0, running: false };
  nextBlitzFigure();
  const go = () => { game.blitz.running = true; game.requestFrame(); };
  if (!save.seen.blitz) { save.seen.blitz = 1; persist(); showIntro('blitz', go); } else go();
}

function nextBlitzFigure() {
  const b = game.blitz;
  const def = makeBlitzFigure(b.cleared);
  $('hud-title').textContent = `Blitz · shape ${b.cleared + 1}`;
  $('hud-sub').textContent = `best ${fmt(save.blitzBest || 0)}`;
  game.load(-1, def);
  blitzTime(b.time);
}

function blitzClear() {
  const b = game.blitz;
  if (!b || !b.running) return;
  b.total += game.score;
  b.cleared++;
  b.time += BLITZ_CLEAR_BONUS;
  toast(`+${BLITZ_CLEAR_BONUS}s`, 800);
  nextBlitzFigure();
}

function blitzStuck() {
  const b = game.blitz;
  b.time = Math.max(0, b.time - BLITZ_STUCK_PENALTY);
  toast(`Stuck! −${BLITZ_STUCK_PENALTY}s`, 900);
  sfx.fail();
  b.total += game.score;
  setTimeout(() => { if (game.blitz && game.blitz.running) nextBlitzFigure(); }, 450);
}

function blitzTime(t) {
  $('progress-fill').style.transform = `scaleX(${Math.min(1, t / BLITZ_TIME)})`;
  $('hud').classList.toggle('hurry', t <= 10);
}

function blitzEnd() {
  const b = game.blitz;
  if (!b) return;
  game.over = true;
  const total = b.total + game.score;
  const prev = save.blitzBest || 0;
  if (total > prev) save.blitzBest = total;
  persist();
  sfx.timeUp();
  setTimeout(() => {
    openModal(`
      <div class="kicker">Blitz</div>
      <h3>Time's up!</h3>
      <div class="score-line big"><b>${fmt(total)}</b><span>${total > prev ? (prev ? 'New best!' : 'points') : `best ${fmt(prev)}`}</span></div>
      <p>Shapes blasted: ${b.cleared}</p>
      <div class="btns">
        <button class="btn big" data-a="again">Play again</button>
        <button class="btn secondary" data-a="menu">Menu</button>
      </div>`, card => {
      card.querySelector('[data-a=again]').onclick = () => { sfx.click(); startBlitz(); };
      card.querySelector('[data-a=menu]').onclick = () => { sfx.click(); closeModalSilently(); leaveBlitz(); showScreen('screen-title'); };
    });
  }, 500);
}

function leaveBlitz() {
  if (!game.blitz) return;
  game.blitz = null;
  $('hud').classList.remove('blitz', 'hurry');
}
