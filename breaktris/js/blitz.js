// Режим Blitz: фигуры генерируются на лету. Фигура складывается из случайных
// тетрамино/пентамино (они же — заряды), иногда с динамитом и напалмом.
// Каждую фигуру проверяет солвер (с обвалом), так что нерешаемых не бывает.
import { parseLevel, solve } from './logic.js';

const TETRO = [
  '####', '#/#/#/#', '##/##',
  '###/.#.', '.#./###', '#./##/#.', '.#/##/.#',
  '#./#./##', '###/#..', '##/.#/.#', '..#/###',
  '.#/.#/##', '#../###', '##/#./#.', '###/..#',
  '.##/##.', '#./##/.#', '##./.##', '.#/##/#.',
];
// «дружелюбные» пентамино: P, L, T, U, V, I — без зигзагов, в Blitz некогда разглядывать
const PENTO = [
  '##/##/#.', '##/##/.#', '#./##/##', '.#/##/##', '###/##.', '###/.##', '##./###', '.##/###',
  '#./#./#./##', '.#/.#/.#/##', '##/#./#./#.', '##/.#/.#/.#', '####/#...', '####/...#', '#.../####', '...#/####',
  '###/.#./.#.', '.#./.#./###', '#../###/#..', '..#/###/..#',
  '#.#/###', '###/#.#', '##/#./##', '##/.#/##',
  '#../#../###', '..#/..#/###', '###/#../#..', '###/..#/..#',
  '#####', '#/#/#/#/#',
];

const cellsOf = s => {
  const out = [];
  s.split('/').forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') out.push([x, y]); }));
  return out;
};

export function makeBlitzFigure(n, rand = Math.random) {
  const pieces = 3 + Math.min(2, Math.floor(n / 3));
  const size = 9;
  for (let attempt = 0; attempt < 40; attempt++) {
    const occ = new Map(); // "x,y" → индекс куска
    const shapes = [];
    for (let p = 0; p < pieces; p++) {
      const shape = rand() < 0.55 ? TETRO[(rand() * TETRO.length) | 0] : PENTO[(rand() * PENTO.length) | 0];
      const cells = cellsOf(shape);
      let placed = false;
      for (let t = 0; t < 60 && !placed; t++) {
        const ox = p === 0 ? 3 : (rand() * (size - 2)) | 0;
        const oy = p === 0 ? 3 : (rand() * (size - 2)) | 0;
        const abs = cells.map(([x, y]) => [x + ox, y + oy]);
        if (abs.some(([x, y]) => x >= size || y >= size || occ.has(x + ',' + y))) continue;
        // новый кусок должен касаться фигуры стороной
        if (p > 0 && !abs.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => occ.has((x + dx) + ',' + (y + dy))))) continue;
        abs.forEach(([x, y]) => occ.set(x + ',' + y, p));
        shapes.push(shape);
        placed = true;
      }
      if (!placed) break;
    }
    if (shapes.length < pieces) continue;

    // обрезаем по габаритам; не больше 7×7, чтобы клетки были крупными
    const pts = [...occ.keys()].map(k => k.split(',').map(Number));
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    if (maxX - minX > 6 || maxY - minY > 6) continue;
    const grid = [];
    for (let y = minY; y <= maxY; y++) {
      let row = '';
      for (let x = minX; x <= maxX; x++) row += occ.has(x + ',' + y) ? '#' : '.';
      grid.push(row);
    }
    const charges = shapes.slice();
    // с третьей фигуры иногда динамит внутри, с пятой — иногда напалм в запасе
    if (n >= 2 && rand() < 0.35) {
      const inner = [];
      grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') inner.push([x, y]); }));
      const [tx, ty] = inner[(rand() * inner.length) | 0];
      grid[ty] = grid[ty].slice(0, tx) + 'T' + grid[ty].slice(tx + 1);
    }
    if (n >= 4 && rand() < 0.3) charges.push('f:#');
    for (let i = charges.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [charges[i], charges[j]] = [charges[j], charges[i]]; }

    const def = { name: `Blitz #${n + 1}`, grid, charges };
    const { board, charges: parsed } = parseLevel(def);
    const r = solve(board, parsed, null, { maxNodes: 4000, firstOnly: true });
    if (!r.min) continue;
    def.par = r.min;
    def.sol = r.path.map(m => `${m.k},${m.x},${m.y}`).join(';');
    return def;
  }
  // запасной вариант — простой гарантированный
  return { name: `Blitz #${n + 1}`, grid: ['##..', '####', '..##'], charges: ['##/##', '##', '##'], par: 3, sol: '0,0,0;1,2,1;2,2,2' };
}
