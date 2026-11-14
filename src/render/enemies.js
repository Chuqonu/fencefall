/**
 * Original enemy sprites. Bottom-center anchor, one logical pixel per cell.
 * enemySize is the opaque grid drawEnemy paints. Walk and attack frames
 * share that box. Hit flash stays a flat wash. No simulation state is touched.
 */
const PALETTES = {
  shambler: {k: '#efe6d2', '#': '#2a241c', o: '#8c8374', h: '#d9d0c0', e: '#f4e27a', s: '#1a1612'},
  runner: {k: '#ffe0b8', '#': '#4a240e', o: '#e08a3a', h: '#fff0d0', e: '#fff6d8', s: '#2a1408'},
  brute: {k: '#f0c0b4', '#': '#3a1410', o: '#a84838', h: '#f4d0c4', e: '#ffe0a0', s: '#1a0c0a'},
  armored: {k: '#f4f7fb', '#': '#1c2430', o: '#8a96a4', h: '#ffffff', e: '#9fd0ea', s: '#10141a'},
  spitter: {k: '#d8f0b0', '#': '#142818', o: '#3f7a48', h: '#c6ee78', e: '#e8f58a', s: '#0c140c'},
  swarm: {k: '#f4e2b4', '#': '#3a2810', o: '#c4a05a', h: '#fff0c0', e: '#fff6d0', s: '#1a1208'},
  boss: {k: '#f4c8dc', '#': '#1a0c14', o: '#7a3058', h: '#f0d0a0', e: '#ffe08a', r: '#e24a3a', s: '#10080c'}
};

function makeGrid(width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(Array(width).fill('.'));
  return {
    width,
    height,
    rows,
    put(x, y, ink) {
      const ix = x | 0;
      const iy = y | 0;
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
      rows[iy][ix] = ink;
    }
  };
}

function block(grid, x, y, width, height, ink) {
  for (let iy = 0; iy < height; iy += 1) {
    for (let ix = 0; ix < width; ix += 1) grid.put(x + ix, y + iy, ink);
  }
}

function plated(grid, x, y, width, height) {
  block(grid, x, y, width, height, 'k');
  if (width > 2 && height > 2) block(grid, x + 1, y + 1, width - 2, height - 2, '#');
  if (width > 4 && height > 4) block(grid, x + 2, y + 2, width - 4, height - 4, 'o');
}

function eyes(grid, x, y, gap) {
  grid.put(x, y, 'e');
  grid.put(x + 1, y, 'e');
  grid.put(x + gap, y, 'e');
  grid.put(x + gap + 1, y, 'e');
}

function sprite(width, height, paint) {
  const grid = makeGrid(width, height);
  paint(grid);
  return grid.rows.map(row => row.join(''));
}

function shambler(step, attack) {
  return sprite(22, 26, (grid) => {
    plated(grid, 6, 0, 9, 8);
    eyes(grid, 8, 3, 3);
    grid.put(9, 5, '#');
    grid.put(11, 5, '#');
    plated(grid, 5, 7, 11, 10);
    grid.put(10, 10, 'h');
    grid.put(10, 12, '#');
    grid.put(10, 14, '#');
    plated(grid, 0, 10, 4, attack ? 8 : 10);
    plated(grid, 18, attack ? 8 : 11, 4, attack ? 12 : 8);
    plated(grid, 6 - step, 16, 4, 10);
    plated(grid, 12 + step, 16, 4, 10);
    block(grid, 6 - step, 25, 3, 1, 's');
    block(grid, 13 + step, 25, 3, 1, 's');
    if (attack) block(grid, 19, 19, 2, 1, 'e');
  });
}

function runner(step, attack) {
  return sprite(18, 24, (grid) => {
    plated(grid, 6, 0, 6, 6);
    eyes(grid, 7, 2, 2);
    plated(grid, 7, 5, 4, 8);
    grid.put(8, 7, 'h');
    plated(grid, 0, attack ? 4 : 6, 3, attack ? 9 : 6);
    plated(grid, 15, 6, 3, 7);
    plated(grid, 5 - step, 12, 3, 12);
    plated(grid, 10 + step, 12, 3, 12);
    block(grid, 5 - step, 23, 2, 1, 's');
    block(grid, 11 + step, 23, 2, 1, 's');
  });
}

function brute(step, attack) {
  return sprite(32, 34, (grid) => {
    plated(grid, 10, 0, 12, 10);
    eyes(grid, 13, 4, 4);
    grid.put(15, 6, '#');
    grid.put(17, 6, '#');
    plated(grid, 6, 9, 20, 14);
    grid.put(15, 13, 'h');
    grid.put(15, 16, '#');
    plated(grid, 0, attack ? 8 : 12, 6, attack ? 14 : 10);
    plated(grid, 26, 12, 6, 10);
    plated(grid, 8 - step, 22, 6, 12);
    plated(grid, 18 + step, 22, 6, 12);
    block(grid, 9 - step, 33, 4, 1, 's');
    block(grid, 19 + step, 33, 4, 1, 's');
    if (attack) block(grid, 1, 21, 3, 1, 'e');
  });
}

function armored(step, attack) {
  return sprite(26, 30, (grid) => {
    plated(grid, 7, 0, 12, 9);
    block(grid, 9, 4, 8, 2, 'e');
    grid.put(12, 4, '#');
    grid.put(13, 4, '#');
    plated(grid, 0, 8, 7, 6);
    plated(grid, 19, 8, 7, 6);
    block(grid, 2, 10, 3, 1, 'h');
    block(grid, 21, 10, 3, 1, 'h');
    plated(grid, 5, 12, 16, 10);
    block(grid, 12, 14, 2, 6, '#');
    grid.put(12, 16, 'h');
    plated(grid, attack ? 0 : 1, 14, 4, attack ? 8 : 5);
    plated(grid, 21, 14, 4, 5);
    plated(grid, 7 - step, 21, 4, 9);
    plated(grid, 15 + step, 21, 4, 9);
    block(grid, 7 - step, 29, 3, 1, 's');
    block(grid, 16 + step, 29, 3, 1, 's');
  });
}

function spitter(step, attack) {
  return sprite(22, 26, (grid) => {
    plated(grid, 5, 0, 8, 7);
    eyes(grid, 7, 2, 3);
    plated(grid, 4, 6, 8, 9);
    plated(grid, 0, 9, 3, 7);
    const sacY = attack ? 10 : 12;
    const sacH = attack ? 10 : 8;
    plated(grid, 12, sacY, 10, sacH);
    block(grid, 15, sacY + 3, 4, 3, 'h');
    block(grid, 16, sacY + 4, 2, 1, 'e');
    plated(grid, 5 - step, 16, 3, 10);
    plated(grid, 9 + step, 16, 3, 10);
    block(grid, 5 - step, 25, 2, 1, 's');
    block(grid, 10 + step, 25, 2, 1, 's');
  });
}

function swarm(step, attack) {
  return sprite(12, 14, (grid) => {
    grid.put(4, 0, 'k');
    grid.put(7, 0, 'k');
    grid.put(4, 1, '#');
    grid.put(7, 1, '#');
    block(grid, 0, 3, 2, attack ? 5 : 4, 'k');
    block(grid, 10, 3, 2, attack ? 5 : 4, 'k');
    plated(grid, 2, 2, 8, 7);
    grid.put(4, 4, 'e');
    grid.put(7, 4, 'e');
    grid.put(5, 5, 'h');
    plated(grid, 3 - step, 8, 2, 6);
    plated(grid, 7 + step, 8, 2, 6);
    grid.put(3 - step, 13, 's');
    grid.put(8 + step, 13, 's');
  });
}

function boss(step, attack) {
  return sprite(48, 52, (grid) => {
    for (let i = 0; i < 8; i += 1) {
      block(grid, 8 + i, i, 3, 3, 'k');
      block(grid, 9 + i, i + 1, 1, 1, '#');
      block(grid, 37 - i, i, 3, 3, 'k');
      block(grid, 38 - i, i + 1, 1, 1, '#');
    }
    plated(grid, 16, 0, 16, 4);
    block(grid, 18, 0, 2, 3, 'k');
    block(grid, 23, 0, 2, 4, 'k');
    block(grid, 28, 0, 2, 3, 'k');
    plated(grid, 14, 6, 20, 10);
    eyes(grid, 19, 9, 6);
    block(grid, 21, 12, 6, 2, '#');
    plated(grid, 8, 14, 32, 18);
    block(grid, 18, 20, 12, 8, 'r');
    block(grid, 21, 22, 6, 4, 'h');
    plated(grid, 0, attack ? 14 : 18, 8, attack ? 16 : 12);
    plated(grid, 40, 18, 8, 12);
    plated(grid, 12 - step, 30, 8, 22);
    plated(grid, 28 + step, 30, 8, 22);
    block(grid, 14 - step, 51, 4, 1, 's');
    block(grid, 30 + step, 51, 4, 1, 's');
    if (attack) block(grid, 1, 28, 3, 1, 'e');
  });
}

const SPRITES = {
  shambler: [shambler(0, false), shambler(1, false), shambler(0, true)],
  runner: [runner(0, false), runner(1, false), runner(0, true)],
  brute: [brute(0, false), brute(1, false), brute(0, true)],
  armored: [armored(0, false), armored(1, false), armored(0, true)],
  spitter: [spitter(0, false), spitter(1, false), spitter(0, true)],
  swarm: [swarm(0, false), swarm(1, false), swarm(0, true)],
  boss: [boss(0, false), boss(1, false), boss(0, true)]
};

function rowsFor(enemy, time) {
  const kind = SPRITES[enemy?.kind] ? enemy.kind : 'shambler';
  const frames = SPRITES[kind];
  const last = frames.length - 1;
  const attacking = enemy?.attacking === true;
  const frame = attacking || last === 0
    ? last
    : Math.floor((time || 0) * 6) % last;
  return {kind, rows: frames[frame] || frames[0]};
}

export function enemySize(enemy) {
  const {rows} = rowsFor(enemy, 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < rows.length; y += 1) {
    const line = rows[y];
    for (let x = 0; x < line.length; x += 1) {
      const ink = line[x];
      if (ink === '.' || ink === ' ') continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return {width: 0, height: 0};
  return {width: maxX - minX + 1, height: maxY - minY + 1};
}

export function drawEnemy(ctx, enemy, x, y, {time = 0, scale = 1, flash = 0} = {}) {
  if (!ctx) return;
  const {kind, rows} = rowsFor(enemy, time);
  const palette = PALETTES[kind] || PALETTES.shambler;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row];
    for (let col = 0; col < line.length; col += 1) {
      const ink = line[col];
      if (ink === '.' || ink === ' ') continue;
      if (col < minX) minX = col;
      if (row < minY) minY = row;
      if (col > maxX) maxX = col;
      if (row > maxY) maxY = row;
    }
  }
  if (maxX < 0) return;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const pixel = Math.max(1, Math.round(scale) || 1);
  const left = Math.round(x - (width * pixel) / 2);
  const top = Math.round(y - height * pixel);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let row = minY; row <= maxY; row += 1) {
    const line = rows[row];
    for (let col = minX; col <= maxX; col += 1) {
      const ink = line[col];
      if (ink === '.' || ink === ' ') continue;
      ctx.fillStyle = flash > 0.4 ? '#fff6d8' : (palette[ink] || palette['.']);
      ctx.fillRect(left + (col - minX) * pixel, top + (row - minY) * pixel, pixel, pixel);
    }
  }
  ctx.restore();
}
