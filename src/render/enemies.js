/**
 * Original enemy sprites. Bottom-center anchor, logical pixels.
 * Job 12 can replace this file; the exports stay drawEnemy and enemySize.
 */
const PALETTES = {
  shambler:{'.':'#6d6458','o':'#8c8374','#':'#3d3832','e':'#d7c36a','s':'#2a2622'},
  runner:{'.':'#c47a3a','o':'#e0a15a','#':'#5a3018','e':'#f2e2b0','s':'#2a1a10'},
  brute:{'.':'#8a4038','o':'#b85a48','#':'#3a1814','e':'#e6c07a','s':'#1c1010'},
  armored:{'.':'#6e7884','o':'#aeb8c4','#':'#2c3440','e':'#d7e2ea','s':'#14181e'},
  spitter:{'.':'#3f6a48','o':'#6aaa62','#':'#1c3020','e':'#d6ef7a','s':'#101810'},
  swarm:{'.':'#8a7048','o':'#c4a46a','#':'#3a2c18','e':'#f0e0a8','s':'#1c140c'},
  boss:{'.':'#5a2744','o':'#8a3a62','#':'#241018','e':'#f0c86a','s':'#10080c','r':'#e24a3a'},
};

const SPRITES = {
  shambler:[
    [
      '....####....',
      '...#oooo#...',
      '..#oeeoo#...',
      '..#oooo#....',
      '...####.....',
      '..#oooo#....',
      '.#o#oo#o#...',
      '.#oooooo#...',
      '..#o##o#....',
      '..#o..o#....',
      '..s....s....',
    ],
    [
      '....####....',
      '...#oooo#...',
      '..#oeeoo#...',
      '..#oooo#....',
      '...####.....',
      '..#oooo#....',
      '.#o#oo#o#...',
      '.#oooooo#...',
      '...#o#o#....',
      '...s..s.....',
      '..s....s....',
    ],
  ],
  runner:[
    [
      '...####.....',
      '..#oooo#....',
      '..#oeeo#....',
      '...#oo#.....',
      '..#oooo#....',
      '.#o#oo#o....',
      '#oooooo#....',
      '..#o.o#.....',
      '..s...s.....',
    ],
    [
      '...####.....',
      '..#oooo#....',
      '..#oeeo#....',
      '...#oo#.....',
      '..#oooo.....',
      '.#o#oo#.....',
      '#oooo#o#....',
      '..s.o#......',
      '.s....s.....',
    ],
  ],
  brute:[
    [
      '..######....',
      '.#oooooo#...',
      '.#oeeeeo#...',
      '.#oooooo#...',
      '#o#oooo#o#..',
      '#oooooooo#..',
      '#o######o#..',
      '.#o#..#o#...',
      '.#o#..#o#...',
      '..s....s....',
      '..s....s....',
    ],
  ],
  armored:[
    [
      '..######..',
      '.#oooooo#.',
      '.#o#ee#o#.',
      '.########.',
      '#o#oooo#o#',
      '#oooooooo#',
      '.########.',
      '..#o..o#..',
      '..s....s..',
    ],
  ],
  spitter:[
    [
      '...####...',
      '..#oooo#..',
      '..#oeeo#..',
      '.#oooooo#.',
      '.#o####o#.',
      '..#oooo#..',
      '...#oo#...',
      '...s..s...',
    ],
  ],
  swarm:[
    [
      '..###...',
      '.#ooo#..',
      '.#oeo#..',
      '..#o#...',
      '.#o#o#..',
      '..s.s...',
    ],
  ],
  boss:[
    [
      '....######....',
      '...#oooooo#...',
      '..#oeeeeeeo#..',
      '..#o#eeee#o#..',
      '.#oooooooooo#.',
      '.#o########o#.',
      '#oo#rrrrrr#oo#',
      '#oooooooooooo#',
      '.#o########o#.',
      '..#o#....#o#..',
      '..#o#....#o#..',
      '...s......s...',
      '...s......s...',
    ],
  ],
};

function rowsFor(enemy, time) {
  const kind = SPRITES[enemy?.kind] ? enemy.kind : 'shambler';
  const frames = SPRITES[kind];
  const attacking = enemy?.attacking === true;
  const frame = attacking ? frames.length - 1 : Math.floor((time || 0) * 6) % frames.length;
  return {kind, rows: frames[frame] || frames[0]};
}

export function enemySize(enemy) {
  const {rows} = rowsFor(enemy, 0);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return {width, height: rows.length};
}

export function drawEnemy(ctx, enemy, x, y, {time = 0, scale = 1, flash = 0} = {}) {
  if (!ctx) return;
  const {kind, rows} = rowsFor(enemy, time);
  const palette = PALETTES[kind] || PALETTES.shambler;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const height = rows.length;
  const pixel = Math.max(1, scale);
  const left = Math.round(x - (width * pixel) / 2);
  const top = Math.round(y - height * pixel);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row];
    for (let col = 0; col < line.length; col += 1) {
      const ink = line[col];
      if (ink === '.' || ink === ' ') continue;
      ctx.fillStyle = flash > 0.4 ? '#fff6d8' : (palette[ink] || palette['.']);
      ctx.fillRect(left + col * pixel, top + row * pixel, pixel, pixel);
    }
  }
  ctx.restore();
}
