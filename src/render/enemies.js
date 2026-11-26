/**
 * Original enemy sprites. Bottom-center anchor, one logical pixel per cell.
 * enemySize is the opaque grid drawEnemy paints. Walk and attack frames
 * share that box. Hit flash stays a flat wash. No simulation state is touched.
 *
 * Each kind keeps one opaque box on every frame:
 * shambler 22×26, runner 18×24, brute 32×34, armored 26×30,
 * spitter 22×26, swarm 12×14, boss 48×52,
 * leaper 20×28, splitter 24×22, mender 22×28, shade 16×30,
 * banner 26×32, warden 22×30, charge 18×26, hush 20×26.
 * A light rim (palette k) is the outer pixel so the shape reads on #122128.
 * enemy.enraged on a boss repaints the crown and core hotter inside that box.
 */
const PALETTES = {
  shambler: {k: '#efe6d2', '#': '#2a241c', o: '#8c8374', h: '#d9d0c0', e: '#f4e27a', s: '#1a1612'},
  runner: {k: '#ffe0b8', '#': '#4a240e', o: '#e08a3a', h: '#fff0d0', e: '#fff6d8', s: '#2a1408'},
  brute: {k: '#f0c0b4', '#': '#3a1410', o: '#a84838', h: '#f4d0c4', e: '#ffe0a0', s: '#1a0c0a'},
  armored: {k: '#f4f7fb', '#': '#1c2430', o: '#8a96a4', h: '#ffffff', e: '#9fd0ea', s: '#10141a'},
  spitter: {k: '#d8f0b0', '#': '#142818', o: '#3f7a48', h: '#c6ee78', e: '#e8f58a', s: '#0c140c'},
  swarm: {k: '#f4e2b4', '#': '#3a2810', o: '#c4a05a', h: '#fff0c0', e: '#fff6d0', s: '#1a1208'},
  boss: {k: '#f4c8dc', '#': '#1a0c14', o: '#7a3058', h: '#f0d0a0', e: '#ffe08a', r: '#e24a3a', s: '#10080c', f: '#ff2e14', c: '#ffd000', w: '#fff6c4'},
  leaper: {k: '#ffe6b4', '#': '#24180c', o: '#d4842c', h: '#f6c56e', e: '#fff3c4', s: '#140e08'},
  splitter: {k: '#f3e6e0', '#': '#2c1a24', o: '#6d5560', h: '#c4a8a4', e: '#e4d0d4', s: '#160e12'},
  mender: {k: '#fbf8e4', '#': '#1c2816', o: '#7d9a58', h: '#e8d78a', e: '#f7f0bc', s: '#121a0e'},
  shade: {k: '#e7f1f6', '#': '#1a242e', o: '#607888', h: '#b7c9d4', e: '#b7e4ea', s: '#101820'},
  banner: {k: '#fbf1e2', '#': '#3a1218', o: '#8a2c34', h: '#f4e2c4', e: '#fff6ea', s: '#1a080c'},
  warden: {k: '#e4eef6', '#': '#1a222c', o: '#5e7388', h: '#d6a84a', e: '#f4e0a4', s: '#141c24'},
  charge: {k: '#f8e2c8', '#': '#2a120c', o: '#a84828', h: '#f0c56a', e: '#fff0c8', s: '#1a0c08'},
  hush: {k: '#d5e4ea', '#': '#142028', o: '#4a6874', h: '#9fd0c8', e: '#e7f4f2', s: '#10181c'}
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

function fillEllipse(grid, cx, cy, rx, ry, ink) {
  const radiusX = rx | 0;
  const radiusY = ry | 0;
  if (radiusX < 0 || radiusY < 0) return;
  for (let y = cy - radiusY; y <= cy + radiusY; y += 1) {
    for (let x = cx - radiusX; x <= cx + radiusX; x += 1) {
      const dx = radiusX === 0 ? (x === cx ? 0 : 2) : (x - cx) / radiusX;
      const dy = radiusY === 0 ? (y === cy ? 0 : 2) : (y - cy) / radiusY;
      if (dx * dx + dy * dy <= 1) grid.put(x, y, ink);
    }
  }
}

function eraseEllipse(grid, cx, cy, rx, ry) {
  fillEllipse(grid, cx, cy, rx, ry, '.');
}

function glaze(grid, cx, cy, rx, ry, ink) {
  const radiusX = rx | 0;
  const radiusY = ry | 0;
  if (radiusX < 0 || radiusY < 0) return;
  for (let y = cy - radiusY; y <= cy + radiusY; y += 1) {
    for (let x = cx - radiusX; x <= cx + radiusX; x += 1) {
      const ix = x | 0;
      const iy = y | 0;
      if (iy < 0 || ix < 0 || iy >= grid.height || ix >= grid.width) continue;
      const prev = grid.rows[iy][ix];
      if (prev === '.' || prev === 'e' || prev === 'r') continue;
      const dx = radiusX === 0 ? 0 : (ix - cx) / radiusX;
      const dy = radiusY === 0 ? 0 : (iy - cy) / radiusY;
      if (dx * dx + dy * dy <= 1) grid.put(ix, iy, ink);
    }
  }
}

function limb(grid, x0, y0, x1, y1, r0, r1, ink) {
  let x = x0 | 0;
  let y = y0 | 0;
  const xEnd = x1 | 0;
  const yEnd = y1 | 0;
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  const total = Math.max(dx, dy, 1);
  let walked = 0;
  const stamp = () => {
    const t = Math.min(1, walked / total);
    const radius = Math.max(0, Math.round(r0 + (r1 - r0) * t));
    fillEllipse(grid, x, y, radius, radius, ink);
    walked += 1;
  };
  stamp();
  while (x !== xEnd || y !== yEnd) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      stamp();
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
      stamp();
    }
  }
}

function bresenham(x0, y0, x1, y1, plot) {
  let x = x0 | 0;
  let y = y0 | 0;
  const xEnd = x1 | 0;
  const yEnd = y1 | 0;
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  plot(x, y);
  while (x !== xEnd || y !== yEnd) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    plot(x, y);
  }
}

function fillPoly(grid, points, ink) {
  const n = points.length;
  if (n < 3) return;
  let minY = points[0][1];
  let maxY = points[0][1];
  for (let i = 1; i < n; i += 1) {
    if (points[i][1] < minY) minY = points[i][1];
    if (points[i][1] > maxY) maxY = points[i][1];
  }
  for (let y = minY; y <= maxY; y += 1) {
    const nodes = [];
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      const yi = points[i][1];
      const yj = points[j][1];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        const xi = points[i][0];
        const xj = points[j][0];
        nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const x0 = Math.ceil(nodes[i]);
      const x1 = Math.floor(nodes[i + 1]);
      for (let x = x0; x <= x1; x += 1) grid.put(x, y, ink);
    }
  }
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    bresenham(a[0], a[1], b[0], b[1], (x, y) => grid.put(x, y, ink));
  }
}

function applyRim(grid) {
  const {width, height, rows} = grid;
  const src = rows.map((row) => row.slice());
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ink = src[y][x];
      if (ink === '.' || ink === 'e' || ink === 'r') continue;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
        || src[y - 1][x] === '.'
        || src[y + 1][x] === '.'
        || src[y][x - 1] === '.'
        || src[y][x + 1] === '.';
      if (edge) rows[y][x] = 'k';
    }
  }
}

function sprite(width, height, paint) {
  const grid = makeGrid(width, height);
  paint(grid);
  applyRim(grid);
  return grid.rows.map((row) => row.join(''));
}

function eye(grid, x, y) {
  for (let dx = 0; dx < 2; dx += 1) {
    const px = x + dx;
    if (y < 0 || px < 0 || y >= grid.height || px >= grid.width) continue;
    if (grid.rows[y][px] === '.') continue;
    grid.put(px, y, 'e');
  }
}

function over(grid, x, y, ink) {
  if (y < 0 || x < 0 || y >= grid.height || x >= grid.width) return;
  if (grid.rows[y][x] === '.' || grid.rows[y][x] === 'e' || grid.rows[y][x] === 'r') return;
  grid.put(x, y, ink);
}

function seam(grid, x, y, length) {
  if (y < 0 || y >= grid.height) return;
  for (let i = 0; i < length; i += 1) {
    const px = x + i;
    if (px < 0 || px >= grid.width) continue;
    const prev = grid.rows[y][px];
    if (prev === '.' || prev === 'e' || prev === 'r') continue;
    grid.put(px, y, '#');
  }
}

function shambler(step, attack) {
  return sprite(22, 26, (grid) => {
    fillEllipse(grid, 8, 7, 6, 8, 'o');
    fillEllipse(grid, 14, 15, 3, 3, 'o');
    glaze(grid, 7, 4, 3, 2, 'h');
    over(grid, 8, 3, 'h');
    over(grid, 8, 6, '#');
    eye(grid, 12, 15);
    eye(grid, 14, 15);
    seam(grid, 12, 14, 4);
    if (attack) {
      over(grid, 13, 17, '#');
      over(grid, 14, 17, '#');
      over(grid, 15, 17, '#');
    } else {
      seam(grid, 13, 17, 3);
    }
    fillEllipse(grid, 10, 19, 3, 3, 'o');
    const lift = attack ? 12 : 19;
    limb(grid, 4, 12, 2, lift, 1, 1, 'o');
    limb(grid, 13, 14, 19, 19, 1, 1, 'o');
    fillEllipse(grid, 1, lift, 2, 2, 'o');
    fillEllipse(grid, 20, 19, 2, 2, 'o');
    glaze(grid, 1, lift - 1, 1, 0, 'h');
    glaze(grid, 20, 18, 1, 0, 'h');
    const spread = step ? 2 : 0;
    limb(grid, 8, 21, 7 - spread, 24, 1, 1, 'o');
    limb(grid, 13, 21, 14 + spread, 24, 1, 1, 'o');
    fillEllipse(grid, 7 - spread, 24, 2, 1, 'o');
    fillEllipse(grid, 14 + spread, 24, 2, 1, 'o');
    eraseEllipse(grid, 11, 23, 1, 2);
  });
}

function runner(step, attack) {
  return sprite(18, 24, (grid) => {
    limb(grid, 8, 0, 8, 4, 0, 0, 'h');
    fillEllipse(grid, 8, 6, 2, 2, 'o');
    fillEllipse(grid, 9, 10, 1, 2, 'o');
    fillEllipse(grid, 9, 13, 2, 1, 'o');
    glaze(grid, 8, 5, 1, 1, 'h');
    eye(grid, 7, 6);
    if (attack) {
      over(grid, 7, 8, '#');
      over(grid, 8, 8, '#');
      over(grid, 9, 8, '#');
    } else {
      over(grid, 8, 7, '#');
    }
    const leftY = attack ? 6 : (step ? 5 : 11);
    const rightY = attack ? 13 : (step ? 12 : 6);
    limb(grid, 8, 9, 0, leftY, 0, 0, 'o');
    limb(grid, 10, 9, 17, rightY, 0, 0, 'o');
    fillEllipse(grid, 0, leftY, 1, 1, 'h');
    fillEllipse(grid, 17, rightY, 1, 1, 'h');
    seam(grid, 8, 11, 3);
    // Walk frames open and close the stride. Attack keeps the shorter plant.
    const knee = attack ? -2 : (step ? 2 : -4);
    const plant = attack ? 0 : (step ? -1 : 1);
    limb(grid, 7, 14, 6 + knee, 18, 1, 1, 'o');
    limb(grid, 6 + knee, 18, 6 + plant, 22, 1, 0, 'o');
    limb(grid, 11, 14, 12 - knee, 18, 1, 1, 'o');
    limb(grid, 12 - knee, 18, 12 - plant, 22, 1, 0, 'o');
    fillEllipse(grid, 6 + plant, 22, 1, 1, 'o');
    fillEllipse(grid, 12 - plant, 22, 1, 1, 'o');
    eraseEllipse(grid, 9, 20, 1, 3);
  });
}

function brute(step, attack) {
  return sprite(32, 34, (grid) => {
    fillEllipse(grid, 16, 4, 5, 5, 'o');
    fillEllipse(grid, 16, 15, 9, 6, 'o');
    fillEllipse(grid, 16, 23, 7, 4, 'o');
    glaze(grid, 14, 3, 2, 1, 'h');
    seam(grid, 13, 3, 6);
    eye(grid, 13, 5);
    eye(grid, 17, 5);
    over(grid, 15, 7, '#');
    over(grid, 17, 7, '#');
    if (attack) {
      over(grid, 15, 8, '#');
      over(grid, 16, 8, '#');
      over(grid, 17, 8, '#');
    } else {
      seam(grid, 15, 8, 3);
    }
    const fistY = attack ? 11 : 16;
    limb(grid, 11, 14, 6, fistY, 2, 1, 'o');
    limb(grid, 21, 14, 25, 16, 2, 1, 'o');
    fillEllipse(grid, 3, fistY, 3, 4, 'o');
    fillEllipse(grid, 28, 16, 3, 4, 'o');
    glaze(grid, 3, fistY - 2, 2, 1, 'h');
    glaze(grid, 28, 14, 2, 1, 'h');
    seam(grid, 2, fistY - 1, 3);
    seam(grid, 27, 15, 3);
    const spread = step ? 2 : 0;
    limb(grid, 12, 26, 10 - spread, 32, 2, 2, 'o');
    limb(grid, 20, 26, 22 + spread, 32, 2, 2, 'o');
    fillEllipse(grid, 10 - spread, 32, 3, 1, 'o');
    fillEllipse(grid, 22 + spread, 32, 3, 1, 'o');
    eraseEllipse(grid, 16, 31, 2, 2);
  });
}

function armored(step, attack) {
  return sprite(26, 30, (grid) => {
    fillEllipse(grid, 13, 6, 5, 7, 'o');
    fillEllipse(grid, 3, 12, 3, 3, 'o');
    fillEllipse(grid, 22, 12, 3, 3, 'o');
    limb(grid, 8, 11, 5, 12, 1, 1, 'o');
    limb(grid, 18, 11, 20, 12, 1, 1, 'o');
    fillEllipse(grid, 13, 18, 4, 5, 'o');
    fillEllipse(grid, 13, 22, 5, 2, 'o');
    glaze(grid, 12, 3, 2, 1, 'h');
    glaze(grid, 2, 11, 1, 1, 'h');
    glaze(grid, 23, 11, 1, 1, 'h');
    seam(grid, 10, 16, 6);
    seam(grid, 11, 19, 4);
    over(grid, 12, 17, 'h');
    over(grid, 13, 20, 'h');
    seam(grid, 10, 7, 6);
    const slit = attack ? 'h' : 'e';
    for (let x = 10; x <= 15; x += 1) over(grid, x, 8, slit);
    if (attack) {
      for (let x = 11; x <= 14; x += 1) over(grid, x, 9, 'e');
    }
    seam(grid, 10, 9, 6);
    const punch = attack ? 22 : 18;
    limb(grid, 3, 14, 2, punch, 1, 1, 'o');
    limb(grid, 22, 14, 23, 18, 1, 1, 'o');
    fillEllipse(grid, 2, punch, 2, 2, 'o');
    fillEllipse(grid, 23, 18, 2, 2, 'o');
    glaze(grid, 2, punch - 1, 1, 0, 'h');
    glaze(grid, 23, 17, 1, 0, 'h');
    const spread = step ? 1 : 0;
    limb(grid, 11, 23, 9 - spread, 28, 2, 1, 'o');
    limb(grid, 15, 23, 17 + spread, 28, 2, 1, 'o');
    fillEllipse(grid, 9 - spread, 28, 2, 1, 'o');
    fillEllipse(grid, 17 + spread, 28, 2, 1, 'o');
    eraseEllipse(grid, 13, 27, 1, 2);
  });
}

function spitter(step, attack) {
  return sprite(22, 26, (grid) => {
    fillEllipse(grid, 11, 4, 3, 4, 'o');
    fillEllipse(grid, 11, 12, 8, 6, 'h');
    fillEllipse(grid, 2, 12, 2, 3, 'h');
    fillEllipse(grid, 19, 12, 2, 3, 'h');
    if (!attack) {
      glaze(grid, 11, 11, 3, 2, 'e');
      seam(grid, 9, 12, 2);
      seam(grid, 13, 14, 2);
    }
    eye(grid, 9, 4);
    eye(grid, 12, 4);
    if (attack) {
      over(grid, 10, 6, '#');
      over(grid, 11, 6, 'e');
      over(grid, 12, 6, 'e');
      over(grid, 13, 6, '#');
    } else {
      seam(grid, 10, 6, 3);
    }
    fillEllipse(grid, 11, 18, 3, 2, 'o');
    const spread = step ? 2 : 0;
    limb(grid, 9, 19, 7 - spread, 24, 1, 0, 'o');
    limb(grid, 13, 19, 15 + spread, 24, 1, 0, 'o');
    fillEllipse(grid, 7 - spread, 24, 1, 1, 'o');
    fillEllipse(grid, 15 + spread, 24, 1, 1, 'o');
    eraseEllipse(grid, 11, 23, 1, 2);
    if (attack) {
      const mark = (x, y, ink) => {
        if (y < 0 || x < 0 || y >= grid.height || x >= grid.width) return;
        if (grid.rows[y][x] === '.') return;
        grid.put(x, y, ink);
      };
      // Open sac: dark cavity in the belly, sap in the throat, drip toward the fence.
      const cavity = [[10, 1], [11, 2], [12, 3], [13, 4], [14, 3], [15, 2], [16, 1]];
      for (const [y, mid] of cavity) {
        for (let dx = -mid; dx <= mid; dx += 1) mark(11 + dx, y, '#');
      }
      for (let y = 12; y <= 14; y += 1) {
        mark(10, y, 'e');
        mark(11, y, 'e');
        mark(12, y, 'e');
      }
      for (let y = 15; y <= 19; y += 1) mark(11, y, 'e');
    }
  });
}

function swarm(step, attack) {
  return sprite(12, 14, (grid) => {
    const lift = attack ? 4 : (step ? 6 : 1);
    fillPoly(grid, [
      [3, 4], [0, lift], [0, lift + 3], [3, 8]
    ], 'h');
    fillPoly(grid, [
      [8, 4], [11, lift], [11, lift + 3], [8, 8]
    ], 'h');
    fillEllipse(grid, 5, 5, 2, 2, 'o');
    fillEllipse(grid, 5, 8, 2, 2, '#');
    limb(grid, 4, 4, 4, 0, 0, 0, 'o');
    limb(grid, 7, 4, 7, 0, 0, 0, 'o');
    eye(grid, 4, 5);
    if (attack) {
      over(grid, 5, 7, '#');
      over(grid, 6, 7, 'e');
    }
    limb(grid, 4, 9, 4, 13, 0, 0, 'o');
    limb(grid, 6, 9, 6, 13, 0, 0, 'o');
    if (step) {
      limb(grid, 4, 12, 3, 13, 0, 0, 'o');
      limb(grid, 6, 12, 8, 13, 0, 0, 'o');
    }
  });
}

function claw(grid, side, y, ink) {
  const x = side < 0 ? 0 : 47;
  const dir = side < 0 ? 1 : -1;
  fillPoly(grid, [
    [x, y],
    [x + dir * 2, y - 6],
    [x + dir * 4, y - 1],
    [x + dir * 6, y - 7],
    [x + dir * 8, y],
    [x + dir * 8, y + 4],
    [x, y + 4]
  ], ink);
}

function boss(step, attack, enraged = false) {
  const horn = enraged ? 'f' : '#';
  const crown = enraged ? 'c' : 'h';
  const coreShell = enraged ? 'f' : '#';
  const coreInk = enraged ? 'w' : 'r';
  const glint = enraged ? 'c' : 'h';
  return sprite(48, 52, (grid) => {
    fillPoly(grid, [
      [18, 20], [12, 28], [14, 34], [11, 42],
      [18, 44], [24, 42], [30, 44], [37, 42],
      [34, 34], [36, 28], [30, 20]
    ], 'o');
    fillEllipse(grid, 24, 18, 8, 8, 'o');
    fillPoly(grid, [
      [16, 20], [12, 14], [9, 8], [7, 3], [8, 0],
      [12, 2], [13, 8], [16, 14], [19, 18]
    ], horn);
    fillPoly(grid, [
      [31, 20], [35, 14], [38, 8], [40, 3], [39, 0],
      [35, 2], [34, 8], [31, 14], [28, 18]
    ], horn);
    fillPoly(grid, [[24, 0], [21, 14], [27, 14]], crown);
    fillPoly(grid, [[18, 4], [16, 14], [22, 13]], crown);
    fillPoly(grid, [[30, 4], [26, 13], [32, 14]], crown);
    seam(grid, 19, 15, 10);
    eye(grid, 19, 17);
    eye(grid, 26, 17);
    if (attack) {
      over(grid, 22, 21, '#');
      over(grid, 23, 21, '#');
      over(grid, 24, 21, '#');
      over(grid, 25, 21, '#');
    } else {
      seam(grid, 22, 21, 4);
    }
    const core = attack ? 6 : 4;
    fillEllipse(grid, 24, 31, core + 2, core + 3, coreShell);
    fillEllipse(grid, 24, 31, core, core + 1, coreInk);
    grid.put(22, 30, glint);
    grid.put(23, 29, glint);
    const clawY = attack ? 24 : 30;
    limb(grid, 14, 28, 8, clawY, 2, 2, 'o');
    limb(grid, 34, 28, 39, 30, 2, 2, 'o');
    claw(grid, -1, clawY, 'o');
    claw(grid, 1, 30, 'o');
    glaze(grid, 4, clawY, 2, 1, 'h');
    glaze(grid, 43, 29, 2, 1, 'h');
    const spread = step ? 2 : 0;
    limb(grid, 18, 42, 15 - spread, 50, 3, 3, 'o');
    limb(grid, 30, 42, 32 + spread, 50, 3, 3, 'o');
    fillEllipse(grid, 15 - spread, 50, 4, 1, 'o');
    fillEllipse(grid, 32 + spread, 50, 4, 1, 'o');
    eraseEllipse(grid, 24, 49, 2, 3);
  });
}

function leaper(step, attack) {
  return sprite(20, 28, (grid) => {
    fillPoly(grid, [
      [6, 24], [11, 24], [12, 26], [9, 27], [0, 27], [0, 25], [3, 24]
    ], 'o');
    over(grid, 2, 26, '#');
    over(grid, 5, 26, '#');
    over(grid, 8, 26, '#');
    glaze(grid, 5, 25, 3, 0, 'h');

    const coils = attack ? [17, 19, 21] : (step ? [16, 19, 22] : [14, 18, 22]);
    for (let i = 0; i < coils.length; i += 1) {
      const y = coils[i];
      const x0 = i % 2 === 0 ? 3 : 6;
      limb(grid, x0, y, x0 + 5, y, 1, 1, i % 2 ? '#' : 'o');
      if (i + 1 < coils.length) {
        const joint = i % 2 === 0 ? x0 + 5 : x0;
        limb(grid, joint, y, joint, coils[i + 1], 0, 0, 'h');
      }
    }
    limb(grid, 6, 14, 5, coils[0], 1, 0, 'o');
    limb(grid, 8, coils[coils.length - 1], 8, 25, 0, 0, 'o');

    fillPoly(grid, [
      [3, 11], [9, 10], [10, 13], [6, 15], [2, 13]
    ], 'o');
    fillPoly(grid, [
      [7, 9], [13, 10], [12, 14], [6, 14], [4, 11]
    ], 'o');
    glaze(grid, 8, 11, 2, 1, 'h');
    seam(grid, 6, 12, 4);
    over(grid, 7, 13, 's');

    fillEllipse(grid, 11, 6, 3, 3, 'o');
    fillPoly(grid, [
      [12, 4], [19, 6], [19, 8], [13, 9], [12, 7]
    ], 'o');
    fillPoly(grid, [[10, 0], [8, 3], [12, 3]], '#');
    glaze(grid, 10, 4, 2, 1, 'h');
    glaze(grid, 16, 5, 2, 0, 'h');
    over(grid, 9, 5, '#');
    over(grid, 10, 5, '#');
    eye(grid, 10, 6);
    if (attack) {
      eraseEllipse(grid, 16, 7, 2, 0);
      over(grid, 15, 6, '#');
      over(grid, 16, 6, '#');
      over(grid, 17, 6, '#');
      over(grid, 15, 8, '#');
      over(grid, 16, 8, '#');
      over(grid, 17, 8, '#');
      limb(grid, 12, 11, 16, 12, 1, 0, 'o');
      limb(grid, 16, 12, 18, 11, 0, 0, '#');
      fillEllipse(grid, 18, 11, 1, 1, '#');
    } else if (step) {
      over(grid, 16, 7, '#');
      limb(grid, 12, 11, 15, 16, 1, 0, 'o');
      limb(grid, 15, 16, 17, 18, 0, 0, '#');
      fillEllipse(grid, 17, 18, 1, 1, '#');
    } else {
      over(grid, 15, 7, '#');
      limb(grid, 12, 11, 14, 14, 1, 0, 'o');
      limb(grid, 14, 14, 16, 13, 0, 0, '#');
      fillEllipse(grid, 16, 13, 1, 1, '#');
    }

    grid.put(10, 0, '#');
    grid.put(19, 6, 'o');
    grid.put(19, 8, 'o');
    grid.put(0, 27, 'o');
    grid.put(4, 27, 'o');
  });
}

function splitter(step, attack) {
  return sprite(24, 22, (grid) => {
    fillPoly(grid, [
      [0, 12], [2, 9], [6, 8], [9, 9], [11, 7], [13, 7],
      [15, 9], [18, 8], [22, 9], [23, 12], [23, 17],
      [20, 19], [16, 18], [12, 20], [8, 18], [4, 19], [0, 17]
    ], 'o');
    glaze(grid, 6, 11, 3, 2, 'h');
    glaze(grid, 17, 11, 3, 2, 'h');
    over(grid, 5, 15, 's');
    over(grid, 7, 16, 's');
    over(grid, 16, 16, 's');
    over(grid, 18, 15, 's');
    over(grid, 5, 13, '#');
    over(grid, 8, 14, '#');
    over(grid, 18, 13, '#');
    over(grid, 16, 12, '#');

    fillPoly(grid, [[12, 0], [10, 6], [14, 6]], '#');
    if (attack) {
      limb(grid, 12, 3, 11, 10, 1, 0, '#');
      limb(grid, 11, 10, 13, 16, 1, 0, '#');
      limb(grid, 13, 16, 12, 19, 0, 0, '#');
      over(grid, 12, 8, 'e');
      over(grid, 12, 11, 'e');
      over(grid, 12, 14, 'e');
      over(grid, 11, 12, 'e');
    } else {
      limb(grid, 12, 2, 11, 8, 0, 0, '#');
      limb(grid, 11, 8, 13, 13, 0, 0, '#');
      limb(grid, 13, 13, 11, 19, 0, 0, '#');
      if (step) {
        over(grid, 10, 11, '#');
        over(grid, 14, 15, '#');
      } else {
        over(grid, 14, 10, '#');
        over(grid, 10, 16, '#');
      }
    }

    const ly = attack ? 5 : (step ? 6 : 7);
    const ry = attack ? 5 : (step ? 8 : 7);
    const lx = attack ? 3 : 4;
    const rx = attack ? 20 : 19;
    fillEllipse(grid, lx, ly, 2, 2, 'o');
    fillEllipse(grid, rx, ry, 2, 2, 'o');
    glaze(grid, lx, ly - 1, 1, 1, 'h');
    glaze(grid, rx, ry - 1, 1, 1, 'h');
    over(grid, lx, ly, '#');
    over(grid, rx, ry, '#');
    limb(grid, lx, ly + 2, lx + 1, 11, 1, 0, 'o');
    limb(grid, rx, ry + 2, rx - 1, 11, 1, 0, 'o');

    eye(grid, 6, 13);
    eye(grid, 16, 13);
    if (attack) {
      over(grid, 7, 14, '#');
      over(grid, 17, 14, '#');
    }

    const shift = attack ? 0 : (step ? 2 : -1);
    limb(grid, 7, 18, 7 + shift, 21, 1, 1, 'o');
    limb(grid, 16, 18, 16 - shift, 21, 1, 1, 'o');

    grid.put(12, 0, '#');
    grid.put(0, 12, 'o');
    grid.put(23, 12, 'o');
    grid.put(8, 21, 'o');
    grid.put(15, 21, 'o');
  });
}

function mender(step, attack) {
  return sprite(22, 28, (grid) => {
    fillPoly(grid, [
      [9, 10], [13, 10], [15, 18], [14, 25], [8, 25], [7, 18]
    ], 'o');
    glaze(grid, 10, 13, 2, 2, 'h');
    for (let y = 12; y <= 23; y += 2) over(grid, 11, y, 'h');
    over(grid, 13, 18, 's');
    over(grid, 13, 20, 's');
    over(grid, 12, 22, 's');
    seam(grid, 8, 24, 6);

    fillEllipse(grid, 11, 8, 3, 3, 'o');
    fillPoly(grid, [[11, 0], [7, 6], [15, 6]], 'o');
    glaze(grid, 10, 2, 1, 1, 'h');
    eye(grid, 9, 8);
    eye(grid, 12, 8);
    if (attack) {
      over(grid, 10, 10, '#');
      over(grid, 11, 10, '#');
      over(grid, 12, 10, '#');
    } else {
      over(grid, 11, 10, '#');
    }

    fillPoly(grid, [[0, 16], [5, 15], [5, 21], [0, 22]], 'h');
    seam(grid, 1, 17, 4);
    over(grid, 2, 19, '#');
    over(grid, 1, 20, 's');
    limb(grid, 5, 15, 10, 11, 0, 0, '#');

    if (attack) {
      limb(grid, 14, 16, 18, 14, 1, 0, '#');
      limb(grid, 18, 14, 21, 12, 1, 0, '#');
      limb(grid, 21, 12, 19, 10, 0, 0, 'h');
      limb(grid, 19, 10, 18, 12, 0, 0, 'h');
      over(grid, 20, 12, 'e');
    } else if (step) {
      limb(grid, 14, 17, 17, 16, 1, 1, '#');
      limb(grid, 17, 16, 21, 15, 1, 0, '#');
      limb(grid, 21, 15, 20, 13, 0, 0, 'h');
      limb(grid, 20, 13, 18, 14, 0, 0, 'h');
    } else {
      limb(grid, 14, 16, 18, 13, 1, 1, '#');
      limb(grid, 18, 13, 21, 11, 1, 0, '#');
      limb(grid, 21, 11, 19, 9, 0, 0, 'h');
      limb(grid, 19, 9, 17, 11, 0, 0, 'h');
    }

    const left = attack ? 8 : (step ? 6 : 8);
    const right = attack ? 14 : (step ? 15 : 13);
    limb(grid, 9, 24, left, 27, 1, 0, 'o');
    limb(grid, 13, 24, right, 27, 1, 0, 'o');
    fillEllipse(grid, left, 27, 1, 0, '#');
    fillEllipse(grid, right, 27, 1, 0, '#');
    eraseEllipse(grid, 11, 26, 0, 1);

    grid.put(11, 0, 'o');
    grid.put(0, 18, 'h');
    grid.put(left, 27, '#');
    grid.put(right, 27, '#');
  });
}

function shade(step, attack) {
  return sprite(16, 30, (grid) => {
    const lean = attack ? 0 : (step ? 1 : -1);
    fillPoly(grid, [
      [7, 0], [8, 0], [8, 4],
      [10, 6], [10, 11], [8, 13],
      [8 + lean, 18], [7, 24],
      [8, 29], [7, 29], [6, 24],
      [5 + lean, 18], [5, 13],
      [4, 11], [4, 6], [6, 4]
    ], 'o');
    glaze(grid, 7, 4, 1, 2, 'h');
    over(grid, 7, 16, 's');
    over(grid, 6, 20, 's');
    const vein = 7 + (attack ? 0 : lean);
    for (let y = 15; y <= 22; y += 2) over(grid, vein, y, 'e');

    const eyeY = step && !attack ? 9 : 8;
    over(grid, 6, eyeY - 1, 'e');
    over(grid, 8, eyeY - 1, 'e');
    over(grid, 6, eyeY, 's');
    over(grid, 8, eyeY, 's');
    over(grid, 6, eyeY + 1, 's');
    over(grid, 8, eyeY + 1, 's');
    if (attack) {
      over(grid, 6, 10, '#');
      over(grid, 7, 10, '#');
      over(grid, 8, 10, '#');
    }

    if (attack) {
      limb(grid, 5, 13, 0, 15, 0, 0, 'e');
      limb(grid, 0, 15, 1, 22, 0, 0, 'e');
      limb(grid, 10, 11, 15, 16, 0, 0, 'e');
      limb(grid, 15, 16, 13, 24, 0, 0, 'e');
      limb(grid, 8, 14, 15, 13, 0, 0, 'e');
    } else if (step) {
      limb(grid, 5, 13, 0, 15, 0, 0, 'e');
      limb(grid, 0, 15, 3, 23, 0, 0, 'e');
      limb(grid, 8, 13, 15, 16, 0, 0, 'e');
      limb(grid, 15, 16, 11, 22, 0, 0, 'e');
    } else {
      limb(grid, 5, 13, 0, 15, 0, 0, 'e');
      limb(grid, 0, 15, 2, 21, 0, 0, 'e');
      limb(grid, 10, 11, 15, 16, 0, 0, 'e');
      limb(grid, 15, 16, 12, 23, 0, 0, 'e');
    }

    grid.put(7, 0, 'o');
    grid.put(8, 0, 'o');
    grid.put(0, 15, 'e');
    grid.put(15, 16, 'e');
    grid.put(7, 29, 'o');
    grid.put(8, 29, 'o');
  });
}

function banner(step, attack) {
  return sprite(26, 32, (grid) => {
    limb(grid, 9, 0, 9, 31, 1, 1, '#');
    fillEllipse(grid, 9, 1, 1, 1, 'h');
    over(grid, 9, 11, 'h');
    over(grid, 9, 12, 'h');

    fillPoly(grid, [[11, 3], [18, 3], [18, 8], [11, 8]], 'h');
    const tuck = attack ? 1 : 0;
    fillPoly(grid, [[18, 3], [25, 4], [25, 5], [18, 4 + tuck]], 'h');
    fillPoly(grid, [[18, 7], [25, 8], [25, 9], [18, 8]], 'h');
    if (step && !attack) eraseEllipse(grid, 15, 8, 1, 0);
    const markX = attack ? 14 : (step ? 13 : 12);
    for (let x = markX; x < markX + 3; x += 1) {
      over(grid, x, 5, 'o');
      over(grid, x, 6, 'o');
    }
    grid.put(25, 4, 'h');
    grid.put(25, 5, 'h');
    grid.put(25, 8, 'h');
    grid.put(25, 9, 'h');

    fillPoly(grid, [[0, 17], [4, 15], [5, 22], [0, 24]], 'o');
    over(grid, 1, 19, '#');
    over(grid, 1, 21, '#');
    fillEllipse(grid, 6, 16, 3, 3, 'o');
    glaze(grid, 5, 14, 2, 1, 'h');
    eye(grid, 4, 16);
    eye(grid, 7, 16);
    if (attack) {
      over(grid, 5, 18, '#');
      over(grid, 6, 18, '#');
      over(grid, 7, 18, '#');
    } else {
      over(grid, 6, 18, '#');
    }
    fillPoly(grid, [[4, 19], [10, 19], [11, 26], [3, 26]], 'o');
    over(grid, 5, 20, 'h');
    over(grid, 6, 20, 'h');
    over(grid, 7, 20, 'h');
    over(grid, 9, 23, 's');
    over(grid, 9, 25, 's');
    seam(grid, 4, 23, 5);

    if (attack) limb(grid, 8, 20, 10, 14, 1, 0, 'o');
    else if (step) limb(grid, 8, 21, 10, 17, 1, 0, 'o');
    else limb(grid, 7, 20, 10, 15, 1, 0, 'o');

    const reach = attack ? 16 : (step ? 14 : 11);
    limb(grid, 8, 22, reach, 24, 1, 0, 'o');

    const lift = attack ? 0 : (step ? 2 : 0);
    const other = attack ? 0 : (step ? 0 : 2);
    limb(grid, 5, 26, 4, 31 - lift, 1, 0, 'o');
    limb(grid, 8, 26, 9, 31 - other, 1, 0, 'o');
    fillEllipse(grid, 4, 31 - lift, 1, 0, '#');
    fillEllipse(grid, 9, 31 - other, 1, 0, '#');

    grid.put(0, 20, 'o');
    grid.put(25, 4, 'h');
    grid.put(25, 9, 'h');
    grid.put(9, 0, '#');
    grid.put(9, 31, '#');
  });
}

function warden(step, attack) {
  return sprite(22, 30, (grid) => {
    const dy = attack ? -3 : (step ? 1 : 0);
    const spread = attack ? 0 : (step ? 2 : -1);

    // Thin ash tatters own the side edges. The shield stays the front silhouette.
    fillPoly(grid, [
      [8, 14],
      [2, 16],
      [0, 17],
      [0, 19],
      [3, 18],
      [7, 16]
    ], 's');
    fillPoly(grid, [
      [13, 14],
      [19, 16],
      [21, 17],
      [21, 19],
      [18, 18],
      [14, 16]
    ], 's');

    fillPoly(grid, [
      [9, 12],
      [13, 12],
      [13, 19],
      [12, 21],
      [10, 21],
      [9, 19]
    ], 'o');
    fillPoly(grid, [
      [8, 5],
      [14, 5],
      [15, 8],
      [13, 11],
      [9, 11],
      [7, 8]
    ], 'o');
    fillPoly(grid, [
      [10, 0],
      [12, 0],
      [12, 5],
      [10, 5]
    ], '#');
    over(grid, 10, 5, 'h');
    over(grid, 11, 5, 'h');
    over(grid, 12, 5, 'h');
    over(grid, 9, 7, 'e');
    over(grid, 10, 7, 'e');
    over(grid, 12, 7, 'e');
    over(grid, 13, 7, 'e');
    over(grid, 10, 8, '#');
    over(grid, 11, 8, '#');
    over(grid, 12, 8, '#');

    const lx = 8 - spread;
    const rx = 14 + spread;
    limb(grid, 10, 21, lx, 29, 1, 0, 'o');
    limb(grid, 12, 21, rx, 29, 1, 0, 'o');
    fillEllipse(grid, lx, 29, 1, 0, '#');
    fillEllipse(grid, rx, 29, 1, 0, '#');

    // Small heater in front of the torso. Attack lifts it; the box does not grow.
    fillPoly(grid, [
      [5, 12 + dy],
      [16, 12 + dy],
      [16, 16 + dy],
      [11, 23 + dy],
      [10, 23 + dy],
      [5, 16 + dy]
    ], 'h');
    over(grid, 7, 13 + dy, 'e');
    over(grid, 8, 13 + dy, 'e');
    over(grid, 7, 15 + dy, '#');
    over(grid, 14, 15 + dy, '#');
    for (let i = 0; i < 6; i += 1) over(grid, 11, 14 + dy + i, '#');
    over(grid, 10, 16 + dy, 'e');
    over(grid, 11, 16 + dy, 'e');
    over(grid, 10, 17 + dy, 'e');
    over(grid, 11, 17 + dy, 'e');

    grid.put(10, 0, '#');
    grid.put(11, 0, '#');
    grid.put(12, 0, '#');
    grid.put(0, 17, 's');
    grid.put(0, 18, 's');
    grid.put(0, 19, 's');
    grid.put(21, 17, 's');
    grid.put(21, 18, 's');
    grid.put(21, 19, 's');
    grid.put(lx, 29, '#');
    grid.put(rx, 29, '#');
  });
}

function cinder(step, attack) {
  return sprite(18, 26, (grid) => {
    const bob = attack ? -1 : (step ? 1 : 0);
    fillEllipse(grid, 9, 14 + bob, 5, 6, 'o');
    fillEllipse(grid, 9, 8 + bob, 3, 3, 'o');
    eye(grid, 8, 7 + bob);
    limb(grid, 9, 6 + bob, 9, 1, 0, 0, 'h');
    fillEllipse(grid, 9, 1, 1, 1, 'e');
    const left = attack ? 6 : (step ? 5 : 7);
    const right = attack ? 12 : (step ? 13 : 11);
    limb(grid, 7, 19, left, 25, 1, 0, '#');
    limb(grid, 11, 19, right, 25, 1, 0, '#');
    grid.put(0, 14, 'o');
    grid.put(17, 14, 'o');
    grid.put(9, 0, 'e');
    grid.put(9, 25, '#');
  });
}

function hush(step, attack) {
  return sprite(20, 26, (grid) => {
    const bob = attack ? 0 : (step ? 1 : -1);
    fillEllipse(grid, 10, 12 + bob, 5, 6, 'o');
    fillEllipse(grid, 10, 6, 4, 3, 'h');
    over(grid, 8, 6, '#');
    over(grid, 11, 6, '#');
    eye(grid, 8, 11 + bob);
    const left = attack ? 7 : (step ? 6 : 8);
    const right = attack ? 13 : (step ? 14 : 12);
    limb(grid, 8, 18, left, 25, 1, 0, '#');
    limb(grid, 12, 18, right, 25, 1, 0, '#');
    grid.put(0, 12, 'h');
    grid.put(19, 12, 'h');
    grid.put(10, 0, 'h');
    grid.put(10, 25, '#');
  });
}

const SPRITES = {
  shambler: [shambler(0, false), shambler(1, false), shambler(0, true)],
  runner: [runner(0, false), runner(1, false), runner(0, true)],
  brute: [brute(0, false), brute(1, false), brute(0, true)],
  armored: [armored(0, false), armored(1, false), armored(0, true)],
  spitter: [spitter(0, false), spitter(1, false), spitter(0, true)],
  swarm: [swarm(0, false), swarm(1, false), swarm(0, true)],
  boss: [boss(0, false), boss(1, false), boss(0, true)],
  leaper: [leaper(0, false), leaper(1, false), leaper(0, true)],
  splitter: [splitter(0, false), splitter(1, false), splitter(0, true)],
  mender: [mender(0, false), mender(1, false), mender(0, true)],
  shade: [shade(0, false), shade(1, false), shade(0, true)],
  banner: [banner(0, false), banner(1, false), banner(0, true)],
  warden: [warden(0, false), warden(1, false), warden(0, true)],
  charge: [cinder(0, false), cinder(1, false), cinder(0, true)],
  hush: [hush(0, false), hush(1, false), hush(0, true)]
};

const BOSS_ENRAGED = [boss(0, false, true), boss(1, false, true), boss(0, true, true)];

function rowsFor(enemy, time) {
  const kind = SPRITES[enemy?.kind] ? enemy.kind : 'shambler';
  const frames = kind === 'boss' && enemy?.enraged === true ? BOSS_ENRAGED : SPRITES[kind];
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
