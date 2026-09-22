// Экраны, HUD, модалки, сохранение прогресса.
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { parseCharge, NORMAL, TNT, STEEL } from './logic.js';
import { buildBlockSprites, buildBubble } from './sprites.js';
import { sfx, unlockAudio, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);

// ---------- Сохранение (для продакшена в Capacitor можно заменить на @capacitor/preferences) ----------
const KEY = 'breaktris.v1';
const save = Object.assign({ stars: [], hints: 3, sound: true, seen: {} }, (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
})());
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
setSound(save.sound);

const unlockedUpTo = () => { let i = 0; while (i < LEVELS.length && save.stars[i]) i++; return Math.min(i, LEVELS.length - 1); };
const totalStars = () => save.stars.reduce((a, b) => a + (b || 0), 0);

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

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  $('hud').classList.toggle('hidden', id !== null);
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
window.__bt = { game, save, startLevel: i => startLevel(i) }; // для отладки из консоли

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
  $('hud-sub').textContent = `★★★ — ${def.par} ${plural(def.par, 'заряд', 'заряда', 'зарядов')}`;
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

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function onHud(s) {
  const potential = s.used <= s.par ? 3 : s.used <= s.par + 1 ? 2 : 1;
  const stars = $('hud-stars').children;
  for (let i = 0; i < 3; i++) stars[i].classList.toggle('off', i >= potential);
  if (potential < hudStars) toast(potential === 2 ? 'Уже не ★★★ — можно отменить ход' : 'Осталась одна звезда');
  hudStars = potential;
  $('progress-fill').style.transform = `scaleX(${s.progress})`;
  $('btn-undo').disabled = !s.canUndo;
}

function updateHintBadge() { $('hint-count').textContent = save.hints; }

function onWin(res) {
  const prev = save.stars[current] || 0;
  let bonus = '';
  if (res.stars === 3 && prev < 3) { save.hints++; bonus = '+1 подсказка за ★★★'; }
  save.stars[current] = Math.max(prev, res.stars);
  persist();
  updateHintBadge();
  const last = current >= LEVELS.length - 1;
  const hint = res.stars < 3 ? `<p>Зарядов: ${res.used}. Можно справиться за ${res.par} — попробуешь на ★★★?</p>`
    : `<p>Идеально! Зарядов: ${res.used} из ${res.total}.</p>`;
  openModal(`
    <div class="kicker">Уровень ${current + 1}</div>
    <h3>${last ? 'Всё взорвано!' : 'Взорвано!'}</h3>
    <div class="big-stars">${starsHtml(res.stars)}</div>
    ${bonus ? `<div class="note">${bonus}</div>` : ''}
    ${hint}
    ${last ? '<p>Это был последний уровень прототипа.</p>' : ''}
    <div class="btns">
      ${last ? '' : '<button class="btn big" data-a="next">Дальше</button>'}
      <div class="row">
        <button class="btn secondary" data-a="retry">Ещё раз</button>
        <button class="btn secondary" data-a="levels">Уровни</button>
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
    <h3>Тупик!</h3>
    <p>${reason}. Отмени ход и попробуй иначе.</p>
    <div class="row">
      <button class="btn" data-a="undo">↶ Отменить</button>
      <button class="btn secondary" data-a="restart">Заново</button>
    </div>`, card => {
    card.querySelector('[data-a=undo]').onclick = () => { sfx.click(); closeModalSilently(); game.undo(); };
    card.querySelector('[data-a=restart]').onclick = () => { sfx.click(); closeModalSilently(); game.restart(); hudStars = 3; };
  }, true);
}

// ---------- Карточки новых механик ----------
const INTRO = {
  tutorial: { kicker: 'Как играть', title: 'Взорви фигуру', text: 'Перетащи заряд из пузыря на фигуру. Заряд должен целиком лечь на блоки — тогда он их взорвёт. Уничтожь всё до последнего блока!', icon: '##/##' },
  stars: { kicker: 'Звёзды', title: 'Экономь заряды', text: 'Не обязательно тратить все заряды. Справишься меньшим числом — получишь ★★★, а оставшиеся заряды бахнут салютом.', icon: 'stars' },
  tnt: { kicker: 'Новый блок', title: 'Динамит', text: 'Взрывается от любого удара и сносит всё вокруг себя (3×3). Динамит рядом с динамитом — цепная реакция!', icon: 'tnt' },
  fire: { kicker: 'Новый заряд', title: 'Напалм', text: 'Взрывает свою форму и поджигает все соседние блоки. Ставится так же — целиком на блоки.', icon: 'f:#' },
  steel: { kicker: 'Новый блок', title: 'Сталь', text: 'Выдерживает два удара: первый взрыв её только трескает. Накрой сталь дважды или добей взрывом рядом.', icon: 'steel' },
  laser: { kicker: 'Новый заряд', title: 'Лазер', text: 'Прожигает насквозь все ряды, через которые проходит, — от края до края.', icon: 'l:#' },
};

function showIntro(key, then) {
  const it = INTRO[key];
  openModal(`
    <div class="kicker">${it.kicker}</div>
    <h3>${it.title}</h3>
    ${it.icon === 'stars' ? '<div class="big-stars">' + starsHtml(3) + '</div>' : '<canvas id="intro-icon" width="10" height="10"></canvas>'}
    <p>${it.text}</p>
    <div class="btns"><button class="btn big" data-a="ok">Понятно</button></div>`, card => {
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
  const open = unlockedUpTo();
  grid.innerHTML = LEVELS.map((d, i) => {
    const st = save.stars[i] || 0;
    const locked = i > open;
    const stars = [0, 1, 2].map(k => `<span class="${k < st ? '' : 'off'}">★</span>`).join('');
    return `<button class="lv ${locked ? 'locked' : ''} ${i === open && !st ? 'next' : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
      ${locked ? '🔒' : i + 1}<small>${locked ? '' : stars}</small></button>`;
  }).join('');
  grid.onclick = e => {
    const b = e.target.closest('.lv');
    if (!b || b.disabled) return;
    unlockAudio(); sfx.click();
    startLevel(+b.dataset.i);
  };
}

// ---------- Кнопки ----------
$('btn-play').onclick = () => { unlockAudio(); sfx.click(); startLevel(unlockedUpTo()); };
$('btn-levels').onclick = () => { unlockAudio(); sfx.click(); openLevels(); };
$('btn-levels-back').onclick = () => { sfx.click(); showScreen('screen-title'); };
$('btn-sound').onclick = () => {
  save.sound = !soundOn(); setSound(save.sound); persist();
  $('btn-sound').textContent = `Звук: ${save.sound ? 'вкл' : 'выкл'}`;
  unlockAudio(); sfx.click();
};
$('btn-sound').textContent = `Звук: ${save.sound ? 'вкл' : 'выкл'}`;
$('btn-menu').onclick = () => { sfx.click(); openLevels(); };
$('btn-undo').onclick = () => { if (game.undo()) sfx.click(); };
$('btn-restart').onclick = () => { sfx.click(); hudStars = 3; game.restart(); };
$('btn-hint').onclick = () => {
  unlockAudio();
  if (game.busy || game.over) return;
  if (save.hints <= 0) { toast('Подсказки кончились — они даются за ★★★'); return; }
  const m = game.hintMove();
  if (m && m.dead) { toast('Отсюда уже не решить — отмени ход ↶'); return; }
  if (!m) { toast('Не нашёл ход быстро — попробуй отменить ход'); return; }
  save.hints--; persist(); updateHintBadge();
  sfx.click();
  game.showHint(m);
};

// Android «назад» в Capacitor
document.addEventListener('backbutton', () => openLevels());

// Декор на титульном экране: фигура из эскиза.
(function drawTitleArt() {
  const c = $('title-art');
  const cell = 22, grid = ['....#', '.####', '#####', '.#####', '...##'];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = 6 * cell * dpr; c.height = 5 * cell * dpr;
  c.style.width = 6 * cell + 'px'; c.style.height = 5 * cell + 'px';
  const ctx = c.getContext('2d');
  const spr = buildBlockSprites(Math.round(cell * dpr));
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') ctx.drawImage(spr[NORMAL], x * cell * dpr, y * cell * dpr, cell * dpr, cell * dpr);
  }));
})();

showScreen('screen-title');
