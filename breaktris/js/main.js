// Экраны, HUD, модалки, сохранение прогресса.
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { parseCharge, NORMAL, TNT, STEEL } from './logic.js';
import { buildBlockSprites, buildBubble } from './sprites.js';
import { TitleBg } from './title-bg.js';
import { sfx, unlockAudio, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);

// ---------- Сохранение (для продакшена в Capacitor можно заменить на @capacitor/preferences) ----------
const KEY = 'kaboomino.v1';
const save = Object.assign({ best: {}, hints: 3, sound: true, seen: {} }, (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
})());
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
};

function fitCanvas() {
  cv.style.width = window.innerWidth + 'px';
  cv.style.height = window.innerHeight + 'px';
}
fitCanvas();
const game = new Game(cv, ui);
window.__kb = { game, save, startLevel: i => startLevel(i) }; // для отладки из консоли

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { fitCanvas(); game.resize(); });
});

let current = 0;
let hudStars = 3;

function startLevel(i) {
  current = i;
  const def = LEVELS[i];
  closeModalSilently();
  showScreen(null);
  $('hud-title').textContent = `${i + 1}. ${def.name}`;
  $('hud-sub').textContent = `★★★ — ${def.par} ${def.par === 1 ? 'charge' : 'charges'}`;
  hudStars = 3;
  updateHintBadge();
  game.load(i, def);
  if (def.intro && !save.seen[def.intro]) {
    save.seen[def.intro] = 1; persist();
    showIntro(def.intro, () => afterIntro(def));
  } else afterIntro(def);
}

function afterIntro(def) {
  if (def.intro === 'tutorial') game.showHint(game.hintMove(), true);
}

function closeModalSilently() { modalOnClose = null; $('modal').classList.add('hidden'); }

function onHud(s) {
  const potential = s.used <= s.par ? 3 : s.used <= s.par + 1 ? 2 : 1;
  const stars = $('hud-stars').children;
  for (let i = 0; i < 3; i++) stars[i].classList.toggle('off', i >= potential);
  if (potential < hudStars) toast(potential === 2 ? 'No more ★★★ — you can undo' : 'Only one star left');
  hudStars = potential;
  $('progress-fill').style.transform = `scaleX(${s.progress})`;
  $('btn-undo').disabled = !s.canUndo;
}

function updateHintBadge() { $('hint-count').textContent = save.hints; }

function onWin(res) {
  const prev = starsOf(current);
  let bonus = '';
  if (res.stars === 3 && prev < 3) { save.hints++; bonus = '+1 hint for ★★★'; }
  save.best[LEVELS[current].name] = Math.max(prev, res.stars);
  persist();
  updateHintBadge();
  const last = current >= LEVELS.length - 1;
  const hint = res.stars < 3 ? `<p>Charges used: ${res.used}. It can be done with ${res.par} — go for ★★★?</p>`
    : `<p>Perfect! Charges used: ${res.used} of ${res.total}.</p>`;
  openModal(`
    <div class="kicker">Level ${current + 1}</div>
    <h3>${last ? 'All blasted!' : 'Blasted!'}</h3>
    <div class="big-stars">${starsHtml(res.stars)}</div>
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
  tutorial: { kicker: 'How to play', title: 'Blast the shape', text: 'Drag a charge from its bubble onto the shape. It has to sit fully on blocks — then it blows them up. Destroy every last block!', icon: '##/##' },
  stars: { kicker: 'Stars', title: 'Save your charges', text: "You don't have to use every charge. Clear the shape with fewer to earn ★★★ — leftovers go off as fireworks.", icon: 'stars' },
  tnt: { kicker: 'New block', title: 'TNT', text: 'Goes off from any hit and wipes out everything around it (3×3). TNT next to TNT sets off a chain reaction!', icon: 'tnt' },
  fire: { kicker: 'New charge', title: 'Napalm', text: 'Blasts its shape and sets every neighboring block on fire. It still has to sit fully on blocks.', icon: 'f:#' },
  steel: { kicker: 'New block', title: 'Steel', text: 'Takes two hits: the first blast only cracks it. Cover it twice or finish it off with a blast next to it.', icon: 'steel' },
  laser: { kicker: 'New charge', title: 'Laser', text: 'Burns through every row it touches, edge to edge.', icon: 'l:#' },
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
  if (icon === 'tnt' || icon === 'steel') {
    const img = spr[icon === 'tnt' ? TNT : STEEL];
    ctx.drawImage(img, s * 0.2, s * 0.2, s * 0.6, s * 0.6);
  } else {
    ctx.drawImage(buildBubble(s, parseCharge(icon), spr), 0, 0);
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
$('btn-menu').onclick = () => { sfx.click(); openLevels(); };
$('btn-undo').onclick = () => { if (game.undo()) sfx.click(); };
$('btn-restart').onclick = () => { sfx.click(); hudStars = 3; game.restart(); };
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

titleBg = new TitleBg($('title-bg'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) titleBg.stop();
  else if (!$('screen-title').classList.contains('hidden')) titleBg.start();
});
window.addEventListener('resize', () => titleBg.resize());
showScreen('screen-title');
