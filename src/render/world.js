/**
 * Battlefield backdrop, logical 360×640.
 * Portrait bands: sky, the top edge enemies cross, open ground, one shared fence,
 * then the ground both defender rows stand on, with exactly two rows of five slots.
 * No lanes and no column paths. drawWorld does not draw units, enemies, projectiles,
 * or gameplay clouds, and it does not mutate run state or advance the gameplay RNG.
 * Animation uses the `time` argument.
 * drawIcon(ctx, id, x, y, size) paints a size×size icon from its top-left corner.
 */
import { ARENA, slotGeometry } from '../shared.js';

const W = ARENA.width;
const H = ARENA.height;
const PICKETS = 30;
const BREAK_SEQUENCE = Object.freeze([
  0, 29, 2, 27, 5, 24, 8, 21, 1, 28, 4, 25, 11, 18, 7, 22,
  10, 19, 3, 26, 6, 23, 9, 20, 12, 17, 13, 16, 14, 15
]);
const BREAK_RANK = (() => {
  const rank = new Array(PICKETS).fill(-1);
  BREAK_SEQUENCE.forEach((index, order) => { rank[index] = order; });
  if (BREAK_SEQUENCE.length !== PICKETS || rank.includes(-1)) {
    throw new Error('Fencefall world: fence damage order is not a permutation');
  }
  return rank;
})();

const TUFTS = Object.freeze([
  [5, 120], [10, 188], [4, 252], [13, 318], [8, 378],
  [354, 142], [348, 214], [353, 286], [344, 348], [350, 396]
]);
const TREES = Object.freeze([
  [8, 22], [28, 14], [50, 18], [96, 9], [154, 7], [214, 8], [270, 10], [318, 15], [340, 22], [354, 12]
]);
const STARS = Object.freeze([
  [16, 6, 0], [42, 11, 0], [74, 5, 1], [108, 12, 0], [146, 7, 0],
  [188, 4, 0], [228, 10, 1], [262, 6, 0], [330, 9, 0], [348, 5, 0], [22, 13, 0]
]);
const POSTS = Object.freeze([0, 86, 174, 262, 348]);
const ENTRY_Y = 46;
const SLEEPER_Y = 466;
const GROUND_Y = 472;
const SCUFFS = Object.freeze([
  [28, 128, 42], [196, 168, 34], [64, 214, 30], [236, 258, 40],
  [36, 304, 28], [176, 346, 32], [88, 392, 24], [214, 418, 22]
]);

const PAL = {
  k: '#12181c',
  n: '#243038',
  w: '#f1eee2',
  g: '#d3b984',
  G: '#7a6240',
  y: '#f0cb72',
  m: '#c5d0d4',
  M: '#4d5c64',
  r: '#e25822',
  R: '#8a3018',
  f: '#ffb060',
  a: '#7ec8d8',
  c: '#2f6f80',
  C: '#e7f7fb',
  b: '#3fba6a',
  B: '#1c5a38',
  p: '#c4504a',
  d: '#e23b4a',
  e: '#c4a06a',
  E: '#6e5432',
  u: '#6d8794'
};

const ALIASES = {
  projectile: 'bolt', arrow: 'bolt', crossbow: 'bolt',
  ice: 'frost', cold: 'frost',
  shock: 'lightning', electric: 'lightning', thunder: 'lightning',
  toxin: 'poison', acid: 'poison', venom: 'poison', poisonstatus: 'poison', statuspoison: 'poison',
  aura: 'support', lantern: 'support', banner: 'support', heal: 'support',
  heroupgrade: 'hero',
  flame: 'fire',
  heart: 'hp', health: 'hp',
  experience: 'xp', star: 'xp',
  sword: 'damage', attack: 'damage',
  attackspeed: 'haste', speed: 'haste',
  coin: 'currency', gold: 'currency',
  shield: 'armor',
  vital: 'vitality',
  cracked: 'brittle', fragile: 'brittle',
  freeze: 'slow', frozen: 'slow', chill: 'slow',
  skull: 'defeat', dead: 'defeat', lose: 'defeat',
  win: 'victory',
  lock: 'locked',
  empty: 'plus', emptyslot: 'plus', place: 'plus',
  critical: 'crit', critchance: 'crit',
  soundoff: 'mute', soundon: 'sound'
};

let backdropReady = false;
let backdrop = null;

function hash2(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  return Math.imul(n, 1274126177) >>> 0;
}

function hashString(text) {
  let h = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function horizonY(x) {
  const wave = Math.sin(x * 0.02) * 6 + Math.sin(x * 0.053 + 1.1) * 3 + Math.sin(x * 0.11) * 2;
  return 40 + Math.round(wave);
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try { return new OffscreenCanvas(width, height); } catch { /* use a DOM canvas if present */ }
  }
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === 'function') {
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function readAlpha(ctx) {
  return Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
}

function breakAt(index) {
  return 0.88 * (1 - BREAK_RANK[index] / 29);
}

function crackAt(index) {
  return Math.min(0.98, breakAt(index) + 0.14);
}

function fenceRatio(state) {
  const fence = state && state.fence;
  const max = fence && fence.maxHp;
  const hp = fence && fence.hp;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(hp)) return 1;
  if (hp <= 0) return 0;
  if (hp >= max) return 1;
  return hp / max;
}

function woodKit(ratio) {
  if (ratio > 0.72) {
    return { light: '#e6d2a4', mid: '#c4a06a', dark: '#8d6840', edge: '#4e3820', iron: '#d5dde0', ironDark: '#6e7c86', strap: '#9aa8ae' };
  }
  if (ratio > 0.4) {
    return { light: '#c4a882', mid: '#8d6a46', dark: '#5c4330', edge: '#2e2218', iron: '#b4bcc0', ironDark: '#556066', strap: '#7a868c' };
  }
  if (ratio > 0.15) {
    return { light: '#8a6850', mid: '#5c4034', dark: '#3a2822', edge: '#1a1210', iron: '#80888c', ironDark: '#3e484c', strap: '#5a6468' };
  }
  return { light: '#6a4038', mid: '#3a2420', dark: '#241614', edge: '#100c0a', iron: '#5c6064', ironDark: '#2a3034', strap: '#3a4044' };
}

function paintSky(ctx) {
  const stops = [[0, '#0c1216'], [14, '#142028'], [28, '#243430'], [48, '#4a5c52']];
  ctx.fillStyle = '#0c1216';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < 56; y += 2) {
    let upper = stops[0];
    let lower = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (y >= stops[i][0] && y <= stops[i + 1][0]) {
        upper = stops[i];
        lower = stops[i + 1];
        break;
      }
    }
    const span = Math.max(1, lower[0] - upper[0]);
    const t = Math.round(((y - upper[0]) / span) * 4) / 4;
    ctx.fillStyle = mixHex(upper[1], lower[1], t);
    ctx.fillRect(0, y, W, 2);
  }
}

function mixHex(a, b, t) {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  const q = Math.max(0, Math.min(1, t));
  const channel = index => Math.round((pa[index] + (pb[index] - pa[index]) * q) / 8) * 8;
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

function hexRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function drawMoon(ctx) {
  const x = 292;
  const y = 3;
  ctx.fillStyle = '#f0e2c0';
  const cells = [
    [3, 0], [4, 0], [5, 0], [6, 0],
    [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
    [1, 3], [2, 3], [3, 3], [4, 3],
    [0, 4], [1, 4], [2, 4], [3, 4],
    [0, 5], [1, 5], [2, 5], [3, 5],
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
    [3, 8], [4, 8], [5, 8], [6, 8]
  ];
  for (const [cx, cy] of cells) ctx.fillRect(x + cx, y + cy, 1, 1);
  ctx.fillStyle = '#d9c89a';
  ctx.fillRect(x + 1, y + 4, 1, 2);
  ctx.fillRect(x + 2, y + 3, 1, 1);
  ctx.fillStyle = '#c4b48a';
  ctx.fillRect(x + 5, y + 6, 1, 1);
}

function drawTree(ctx, x, height) {
  const base = horizonY(x);
  const top = base - height;
  const trunk = height > 16 ? 3 : 2;
  ctx.fillStyle = '#0e1612';
  ctx.fillRect(x, top + 2, trunk, Math.max(2, height - 2));
  ctx.fillStyle = '#1a2820';
  ctx.fillRect(x - 4, top + 4, 4, 2);
  ctx.fillRect(x + trunk, top + 7, 4, 2);
  if (height > 14) ctx.fillRect(x - 2, top + 2, 2, 2);
  ctx.fillStyle = '#243028';
  ctx.fillRect(x - 1, base - 2, trunk + 2, 2);
}

function paintEntryEdge(ctx) {
  const y = ENTRY_Y;
  ctx.fillStyle = '#101816';
  ctx.fillRect(0, y + 10, W, 6);
  ctx.fillStyle = '#6a8074';
  ctx.fillRect(0, y + 3, W, 8);
  ctx.fillStyle = '#314038';
  ctx.fillRect(0, y + 8, W, 4);
  ctx.fillStyle = '#d5e2d6';
  ctx.fillRect(0, y + 1, W, 2);
  let x = 0;
  let stone = 0;
  while (x < W) {
    const n = hash2(stone * 3 + 1, 41);
    const span = 7 + (n % 11);
    const rise = (n >>> 3) & 1;
    ctx.fillStyle = (n & 32) ? '#d5e2d6' : '#b7c8ba';
    ctx.fillRect(x, y + rise, span, 1);
    ctx.fillStyle = (n & 32) ? '#5e7268' : '#4a5c52';
    ctx.fillRect(x, y + 2 + rise, Math.max(1, span - 1), 2);
    ctx.fillStyle = '#1a2420';
    ctx.fillRect(x + span - 1, y + 1, 1, 10);
    if ((n % 4) === 0) {
      ctx.fillStyle = '#101816';
      ctx.fillRect(x + 2, y + 5, 1, 4);
    }
    if ((n % 6) === 0) {
      ctx.fillStyle = '#2a342e';
      ctx.fillRect(x + 1, y - 4, 2, 5);
      ctx.fillStyle = '#d5e2d6';
      ctx.fillRect(x + 1, y - 4, 2, 1);
    }
    x += span;
    stone += 1;
  }
  ctx.fillStyle = '#0e1612';
  ctx.fillRect(0, y + 12, W, 2);
  ctx.fillStyle = '#6a7e72';
  ctx.fillRect(0, y + 14, W, 1);
}

function paintApproach(ctx) {
  ctx.fillStyle = '#161e1c';
  ctx.fillRect(0, 418, W, 48);
  ctx.fillStyle = '#4a5c52';
  ctx.fillRect(0, 418, W, 1);
  ctx.fillStyle = '#101816';
  ctx.fillRect(0, 454, W, 12);
  for (let x = 0; x < W; x += 4) {
    const n = hash2(x, 422);
    if ((n & 3) !== 0) continue;
    const y = 422 + ((n >>> 2) & 7) * 2;
    ctx.fillStyle = (n & 16) ? '#2a3830' : '#101816';
    ctx.fillRect(x, y, 3 + (n & 1), 1);
  }
}

function fillStandingGround(ctx, x, y, width, height) {
  ctx.fillStyle = '#3a2c22';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#a08058';
  ctx.fillRect(x, y, width, 1);
  if (height > 6 && width > 8) {
    ctx.fillStyle = '#5c4634';
    ctx.fillRect(x + 4, y + 4, width - 8, 1);
  }
  if (height > 3) {
    ctx.fillStyle = '#241c16';
    ctx.fillRect(x, y + height - 3, width, 3);
  }
}

function paintField(ctx) {
  for (let x = 0; x < W; x += 2) {
    const near = horizonY(x);
    const far = near - 7 - ((x >> 3) & 1);
    ctx.fillStyle = '#121a18';
    ctx.fillRect(x, far, 2, near - far);
    ctx.fillStyle = '#24302c';
    ctx.fillRect(x, far, 2, 1);
  }
  for (let x = 0; x < W; x += 2) {
    const y0 = horizonY(x);
    const edge = Math.min(x, W - 1 - x);
    const margin = edge < 16 ? 0 : edge < 36 ? 1 : 2;
    const far = margin === 0 ? '#1e2824' : margin === 1 ? '#28322c' : '#343e36';
    const mid = margin === 0 ? '#1a2420' : margin === 1 ? '#222c28' : '#2c3630';
    const near = margin === 0 ? '#161e1c' : margin === 1 ? '#1c2420' : '#242c28';
    const farEnd = 168;
    const midEnd = 320;
    const lip = ENTRY_Y + 16;
    ctx.fillStyle = margin === 0 ? '#121a18' : '#1a2420';
    ctx.fillRect(x, y0, 2, Math.max(0, lip - y0));
    ctx.fillStyle = far;
    ctx.fillRect(x, lip, 2, farEnd - lip);
    ctx.fillStyle = mid;
    ctx.fillRect(x, farEnd, 2, midEnd - farEnd);
    ctx.fillStyle = near;
    ctx.fillRect(x, midEnd, 2, SLEEPER_Y - midEnd);
    ctx.fillStyle = '#8ea094';
    ctx.fillRect(x, y0, 2, 1);
  }
  for (const [x, height] of TREES) drawTree(ctx, x, height);
  for (let y = 64; y < 448; y += 4) {
    for (let x = 8; x < 352; x += 4) {
      const dx = Math.abs(x - 180) / 180;
      const n = hash2(x, y);
      if ((n % 100) > 42 + dx * 52) {
        ctx.fillStyle = (n & 3) === 0 ? '#3e4c44' : '#323e38';
        ctx.fillRect(x, y, 1, 1);
      } else if ((n % 23) === 0) {
        ctx.fillStyle = '#1a2220';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  for (let y = 404; y < 456; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if ((hash2(x + 19, y) & 3) === 0) {
        ctx.fillStyle = '#1e2622';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const patches = [
    [36, 156, 22, 3, '#1e2824'], [248, 188, 26, 3, '#323c36'],
    [110, 236, 16, 2, '#1e2824'], [292, 274, 18, 3, '#2c3630'],
    [58, 328, 24, 3, '#222a26'], [186, 366, 20, 2, '#303a34'],
    [24, 412, 28, 3, '#1c2420'], [250, 404, 22, 3, '#1c2420']
  ];
  for (const [x, y, width, height, color] of patches) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }
  ctx.fillStyle = '#1a2420';
  for (const [x, y, width] of SCUFFS) {
    ctx.fillRect(x, y, width, 1);
    ctx.fillRect(x + 5, y + 2, Math.max(8, width - 12), 1);
  }
  drawEdgeRuins(ctx);
  for (let i = 0; i < 16; i++) {
    const n = hash2(80 + i, 17);
    const x = i % 2 === 0 ? 12 + (n % 22) : 328 + (n % 22);
    const y = 150 + ((n >>> 8) % 250);
    ctx.fillStyle = '#3a463e';
    ctx.fillRect(x, y, 3, 2);
    ctx.fillStyle = '#141c18';
    ctx.fillRect(x, y + 2, 3, 1);
  }
  paintApproach(ctx);
  paintEntryEdge(ctx);
}

function drawEdgeRuins(ctx) {
  const marks = [[16, 214, 16], [340, 248, 20], [22, 336, 12], [334, 372, 14]];
  for (const [x, y, height] of marks) {
    ctx.fillStyle = '#3a342c';
    ctx.fillRect(x, y - height, 3, height);
    ctx.fillStyle = '#2a241c';
    ctx.fillRect(x - 2, y - 3, 7, 3);
    ctx.fillStyle = '#4a4034';
    ctx.fillRect(x, y - height, 1, 2);
  }
}

function paintYard(ctx) {
  fillStandingGround(ctx, 0, GROUND_Y, W, H - GROUND_Y);
  for (let y = 476; y < 632; y += 4) {
    ctx.fillStyle = ((y >> 2) & 1) ? '#34281f' : '#463628';
    ctx.fillRect(0, y, W, 1);
  }
  // Footing under each row, then the open board between the rows and at the heel.
  fillStandingGround(ctx, 0, 524, W, 20);
  fillStandingGround(ctx, 0, 608, W, 20);
  fillStandingGround(ctx, 0, 544, W, 12);
  fillStandingGround(ctx, 0, 628, W, 12);
  for (let x = 5; x < W; x += 13) {
    const n = hash2(x, 548);
    ctx.fillStyle = (n & 1) ? '#c4a06a' : '#6e5432';
    ctx.fillRect(x + (n & 3), 548, 1, 1);
    ctx.fillRect(x + ((n >>> 2) & 3), 632, 1, 1);
  }
  ctx.fillStyle = '#1c1612';
  ctx.fillRect(0, 636, W, 4);
}

function paintBackdrop(ctx) {
  paintSky(ctx);
  drawMoon(ctx);
  paintField(ctx);
  paintYard(ctx);
}

function backdropCanvas() {
  if (backdropReady) return backdrop;
  backdropReady = true;
  const canvas = makeCanvas(W, H);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { context.imageSmoothingEnabled = false; } catch { /* direct pixels still work */ }
  paintBackdrop(context);
  backdrop = canvas;
  return backdrop;
}

function drawStars(ctx, time, reduced) {
  const base = readAlpha(ctx);
  for (let i = 0; i < STARS.length; i++) {
    const [x, y, gold] = STARS[i];
    const twinkle = reduced ? 1 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 1.7 + i * 1.3));
    ctx.globalAlpha = base * twinkle;
    ctx.fillStyle = gold ? '#f0cb72' : (i % 3 === 0 ? '#d5e6ea' : '#8fb0b8');
    const span = i % 5 === 0 ? 2 : 1;
    ctx.fillRect(x, y, span, span);
  }
  ctx.globalAlpha = base;
}

function drawMist(ctx, time, reduced) {
  const base = readAlpha(ctx);
  const shift = reduced ? 6 : Math.floor(time * 7) % 48;
  ctx.globalAlpha = base * 0.16;
  ctx.fillStyle = '#d5e6ea';
  for (let i = 0; i < 7; i++) {
    const x = ((i * 58 + shift) % 420) - 24;
    const y = 14 + (i % 3) * 4;
    ctx.fillRect(x, y, 26, 1);
    ctx.fillRect(x + 6, y + 1, 12, 1);
  }
  ctx.globalAlpha = base;
}

function drawTuft(ctx, x, y, sway) {
  ctx.fillStyle = '#1a2824';
  ctx.fillRect(x, y, 1, 4);
  ctx.fillStyle = '#2a5040';
  ctx.fillRect(x + sway, y - 4, 1, 4);
  ctx.fillRect(x - 2 - sway, y - 2, 1, 3);
  ctx.fillRect(x + 2 + sway, y - 3, 1, 3);
  ctx.fillStyle = '#6a9460';
  ctx.fillRect(x + sway, y - 5, 1, 1);
}

function drawGrass(ctx, time, reduced) {
  for (let i = 0; i < TUFTS.length; i++) {
    const [x, y] = TUFTS[i];
    const sway = reduced ? 0 : Math.round(Math.sin(time * 1.4 + i) );
    drawTuft(ctx, x, y, sway);
  }
}

function drawPicket(ctx, index, ratio, kit) {
  const x = index * 12 + 2;
  const broken = ratio <= breakAt(index);
  const jog = (index % 3) * 2;
  const top = 430 + jog;
  const base = 466;
  if (broken) {
    if (((index * 5 + 3) % 4) === 0 || (ratio <= 0.08 && (index % 2) === 0)) {
      ctx.fillStyle = kit.edge;
      ctx.fillRect(x + 2, 462, 2, 3);
      ctx.fillRect(x + 5, 460, 1, 4);
      return false;
    }
    const stump = (ratio <= 0.08 ? 4 + (index % 3) : 8 + (index % 5) * 3);
    const y = base - stump;
    ctx.fillStyle = kit.edge;
    ctx.fillRect(x, y, 8, stump);
    ctx.fillStyle = kit.dark;
    ctx.fillRect(x + 1, y + 2, 5, Math.max(0, stump - 2));
    ctx.fillStyle = kit.light;
    ctx.fillRect(x + 1, y, 4, 1);
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 2, y + 1, 3, 1);
    return false;
  }
  ctx.fillStyle = kit.light;
  ctx.fillRect(x + 3, top, 2, 2);
  ctx.fillRect(x + 2, top + 2, 4, 2);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(x + 1, top + 4, 6, 2);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(x, top + 6, 8, base - (top + 6));
  ctx.fillStyle = kit.edge;
  ctx.fillRect(x, top + 6, 1, base - (top + 6));
  ctx.fillRect(x + 7, top + 6, 1, base - (top + 6));
  ctx.fillStyle = kit.light;
  ctx.fillRect(x + 2, top + 8, 1, Math.max(0, base - (top + 10)));
  ctx.fillStyle = kit.ironDark;
  ctx.fillRect(x - 2, 446, 12, 5);
  ctx.fillStyle = kit.strap;
  ctx.fillRect(x - 2, 447, 12, 2);
  ctx.fillStyle = kit.iron;
  ctx.fillRect(x + 3, 450, 2, 2);
  if (ratio <= crackAt(index)) {
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 2, top + 12, 1, 7);
    ctx.fillRect(x + 3, top + 18, 1, 6);
  }
  if (ratio < 0.45 && (index % 3) === 0) {
    ctx.fillStyle = '#2a1612';
    ctx.fillRect(x + 1, 456, 6, 4);
  }
  return true;
}

function drawWire(ctx, intact, kit, ratio) {
  ctx.fillStyle = kit.ironDark;
  for (let i = 0; i < PICKETS; i++) {
    const x = i * 12 + 2;
    const top = 430 + (i % 3) * 2;
    if (intact[i]) {
      ctx.fillRect(x + 2, 426, 5, 1);
      ctx.fillRect(x + 3, 426, 1, top - 426);
      ctx.fillRect(x + 2, top - 1, 1, 1);
      ctx.fillRect(x + 4, top - 1, 1, 1);
      if (intact[i + 1]) ctx.fillRect(x + 7, 426, 7, 1);
    } else if (ratio > 0.1) {
      ctx.fillRect(x + 1, 436 + (i % 3) * 2, 6, 1);
    }
  }
}

function postFalls(x, ratio) {
  if (x < 20 || x > 340) return ratio <= 0.42;
  if (x === 174) return ratio <= 0;
  return ratio <= 0.2;
}

function drawPost(ctx, x, ratio, kit) {
  if (postFalls(x, ratio)) {
    ctx.fillStyle = kit.dark;
    ctx.fillRect(x, 462, 12, 4);
    ctx.fillRect(x + 3, 458, 5, 4);
    ctx.fillStyle = kit.edge;
    ctx.fillRect(x + 1, 465, 10, 2);
    return;
  }
  ctx.fillStyle = kit.edge;
  ctx.fillRect(x, 418, 8, 52);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(x + 1, 420, 6, 48);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(x + 2, 422, 3, 44);
  ctx.fillStyle = kit.iron;
  ctx.fillRect(x, 418, 8, 3);
  ctx.fillRect(x, 446, 8, 4);
  ctx.fillStyle = kit.ironDark;
  ctx.fillRect(x + 1, 447, 6, 1);
  if (ratio < 0.35) {
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 3, 430, 1, 12);
  }
}

function drawRubble(ctx, kit, ratio) {
  if (ratio > 0.08) return;
  ctx.fillStyle = kit.mid;
  ctx.fillRect(36, 456, 26, 3);
  ctx.fillRect(48, 453, 4, 3);
  ctx.fillRect(188, 458, 34, 3);
  ctx.fillRect(300, 455, 22, 3);
  ctx.fillStyle = kit.edge;
  ctx.fillRect(36, 459, 26, 1);
  ctx.fillRect(188, 461, 34, 1);
  ctx.fillRect(300, 458, 22, 1);
}

function drawSleeper(ctx, ratio, kit) {
  const y = SLEEPER_Y;
  ctx.fillStyle = kit.edge;
  ctx.fillRect(0, y, W, 6);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(0, y + 1, W, 4);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(0, y + 1, W, 2);
  ctx.fillStyle = kit.light;
  ctx.fillRect(0, y, W, 1);
  if (ratio <= 0.34) {
    for (let i = 0; i < PICKETS; i++) {
      if (ratio > breakAt(i) * 0.45) continue;
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(i * 12 + 4, y + 1, 6, 4);
    }
  }
  for (let x = 8; x < W; x += 12) {
    ctx.fillStyle = kit.iron;
    ctx.fillRect(x, y + 2, 1, 2);
  }
}

function drawFence(ctx, ratio) {
  const kit = woodKit(ratio);
  const intact = new Array(PICKETS);
  for (let i = 0; i < PICKETS; i++) intact[i] = drawPicket(ctx, i, ratio, kit);
  drawWire(ctx, intact, kit, ratio);
  drawSleeper(ctx, ratio, kit);
  for (const x of POSTS) drawPost(ctx, x, ratio, kit);
  drawRubble(ctx, kit, ratio);
}

function drawBanner(ctx, ratio, time, reduced, phase) {
  if (ratio < 0.18 || postFalls(174, ratio)) return;
  const wave = reduced ? 0 : (Math.sin(time * 2.2) > 0 ? 1 : 0);
  const y = 416 + wave;
  ctx.fillStyle = '#6e5432';
  ctx.fillRect(178, 414, 2, 34);
  const torn = ratio < 0.58;
  const clothW = torn ? 11 : 15;
  ctx.fillStyle = ratio < 0.4 ? '#7a3030' : '#9a3a3a';
  ctx.fillRect(180, y, clothW, 9);
  ctx.fillStyle = '#6e2424';
  ctx.fillRect(180, y + 8, clothW, 1);
  ctx.fillStyle = '#d3b984';
  ctx.fillRect(182, y + 3, torn ? 4 : 7, 2);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(184, y + 2, 2, 4);
  if (torn) {
    ctx.fillStyle = '#4e3820';
    ctx.fillRect(180 + clothW, y + 5, 2, 2);
    ctx.fillRect(180 + clothW - 1, y + 7, 3, 2);
  }
  if (phase === 'victory' && ratio > 0.35) {
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(182, y + 1, 1, 1);
    ctx.fillRect(188, y + 1, 1, 1);
  }
}

function drawEmbers(ctx, ratio, time, reduced) {
  if (ratio > 0.62) return;
  const base = readAlpha(ctx);
  for (let i = 0; i < PICKETS; i++) {
    if (ratio > breakAt(i) || (i % 3) !== 0) continue;
    const loop = reduced ? 0.35 : ((time * (7 + (i % 4)) + i * 1.7) % 16) / 16;
    const x = i * 12 + 5;
    const y = Math.round(462 - loop * 14);
    ctx.globalAlpha = base * (1 - loop) * 0.9;
    ctx.fillStyle = (i % 2) === 0 ? '#ffd08a' : '#e25822';
    ctx.fillRect(x, y, 1, 1 + (i & 1));
  }
  ctx.globalAlpha = base;
}

function drawBrackets(ctx, x, y) {
  ctx.fillStyle = '#d3b984';
  ctx.fillRect(x + 2, y + 2, 7, 2);
  ctx.fillRect(x + 2, y + 2, 2, 7);
  ctx.fillRect(x + 55, y + 2, 7, 2);
  ctx.fillRect(x + 60, y + 2, 2, 7);
  ctx.fillRect(x + 2, y + 68, 7, 2);
  ctx.fillRect(x + 2, y + 63, 2, 7);
  ctx.fillRect(x + 55, y + 68, 7, 2);
  ctx.fillRect(x + 60, y + 63, 2, 7);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(x + 2, y + 2, 3, 1);
  ctx.fillRect(x + 59, y + 2, 3, 1);
  ctx.fillStyle = '#7a6240';
  ctx.fillRect(x + 2, y + 69, 7, 1);
  ctx.fillRect(x + 55, y + 69, 7, 1);
}

function drawSlot(ctx, slot, time, reduced, phase) {
  const x = slot.left;
  const y = slot.top;
  const unit = slot.unit;
  const occupied = !!(unit && typeof unit === 'object');
  const hero = occupied && (unit.kind === 'hero' || unit.type === 'hero');
  const front = slot.row === 0;
  ctx.fillStyle = '#070b0e';
  ctx.fillRect(x + 2, y + 2, 64, 72);
  ctx.fillStyle = front ? '#20323c' : '#182830';
  ctx.fillRect(x, y, 64, 72);
  ctx.fillStyle = hero ? '#8a7044' : (occupied ? '#4e6470' : '#9eb4be');
  ctx.fillRect(x, y, 64, 1);
  ctx.fillRect(x, y, 1, 72);
  ctx.fillStyle = '#0c1216';
  ctx.fillRect(x, y + 71, 64, 1);
  ctx.fillRect(x + 63, y, 1, 72);
  ctx.fillStyle = occupied ? (front ? '#1a2c36' : '#14242c') : '#0e161c';
  ctx.fillRect(x + 4, y + 4, 56, 48);
  ctx.fillStyle = '#5c6a72';
  ctx.fillRect(x + 3, y + 3, 2, 2);
  ctx.fillRect(x + 59, y + 3, 2, 2);
  ctx.fillRect(x + 3, y + 48, 2, 2);
  ctx.fillRect(x + 59, y + 48, 2, 2);
  const foot = y + 36;
  ctx.fillStyle = front ? '#314654' : '#283848';
  ctx.fillRect(x + 8, foot - 2, 48, 14);
  ctx.fillStyle = hero ? '#d3b984' : '#6a8490';
  ctx.fillRect(x + 8, foot - 2, 48, 1);
  ctx.fillStyle = '#10181c';
  ctx.fillRect(x + 10, foot + 8, 44, 3);
  ctx.fillStyle = '#243844';
  ctx.fillRect(x + 6, foot, 4, 8);
  ctx.fillRect(x + 54, foot, 4, 8);
  fillStandingGround(ctx, x + 2, y + 52, 60, 18);
  if (!occupied) {
    const pulse = phase === 'placing' && !reduced && Math.sin(time * 3) > 0;
    const cx = x + 31;
    const cy = y + 18;
    ctx.fillStyle = pulse ? '#d7f3f8' : '#6d8794';
    ctx.fillRect(cx, cy - 6, 2, 14);
    ctx.fillRect(cx - 6, cy, 14, 2);
    ctx.fillStyle = '#d5e6ea';
    ctx.fillRect(cx, cy, 2, 2);
  } else {
    ctx.fillStyle = '#8aa0aa';
    ctx.fillRect(x + 12, foot - 1, 2, 2);
    ctx.fillRect(x + 50, foot - 1, 2, 2);
  }
  if (hero) {
    drawBrackets(ctx, x, y);
    ctx.fillStyle = '#7a6240';
    ctx.fillRect(x + 12, foot + 5, 40, 2);
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(x + 12, foot + 5, 40, 1);
  }
}

function drawTies(ctx, top) {
  const y = top + 44;
  ctx.fillStyle = '#8ea0a6';
  ctx.fillRect(0, y, 4, 1);
  ctx.fillRect(356, y, 4, 1);
  for (const gap of [68, 140, 212, 284]) {
    ctx.fillStyle = '#5c6a72';
    ctx.fillRect(gap, y, 8, 2);
    ctx.fillStyle = '#c5d0d4';
    ctx.fillRect(gap, y, 8, 1);
  }
}

function readSlots(state) {
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const geo = slotGeometry(i);
    const unit = state && state.slots && state.slots[i] ? state.slots[i].unit : null;
    slots.push({ ...geo, unit: unit || null });
  }
  return slots;
}

export function drawWorld(ctx, state, options) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const opts = options && typeof options === 'object' ? options : {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const reduced = !!opts.reducedMotion;
  const phase = state && typeof state.phase === 'string' ? state.phase : 'playing';
  const ratio = fenceRatio(state);
  const canStack = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canStack) ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* ignored */ }
    if (typeof ctx.beginPath === 'function' && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    }
    const cached = backdropCanvas();
    if (cached && typeof ctx.drawImage === 'function') ctx.drawImage(cached, 0, 0, W, H);
    else paintBackdrop(ctx);
    drawStars(ctx, time, reduced);
    drawMist(ctx, time, reduced);
    drawGrass(ctx, time, reduced);
    drawFence(ctx, ratio);
    drawBanner(ctx, ratio, time, reduced, phase);
    drawEmbers(ctx, ratio, time, reduced);
    for (const slot of readSlots(state)) drawSlot(ctx, slot, time, reduced, phase);
    drawTies(ctx, ARENA.frontY - 36);
    drawTies(ctx, ARENA.backY - 36);
  } finally {
    if (canStack) ctx.restore();
  }
}

function iconRows(id, rows) {
  if (!Array.isArray(rows) || rows.length !== 16) throw new Error(`Fencefall icon "${id}" must have 16 rows`);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row !== 'string' || row.length !== 16) throw new Error(`Fencefall icon "${id}" row ${i} must be 16 wide`);
    for (const ch of row) {
      if (ch !== '.' && !PAL[ch]) throw new Error(`Fencefall icon "${id}" swatch "${ch}" is unknown`);
    }
  }
  if (!rows.some(row => [...row].some(ch => ch !== '.'))) throw new Error(`Fencefall icon "${id}" is blank`);
  return rows;
}

const ICONS = {
  bolt: iconRows('bolt', [
    '................',
    '.......yy.......',
    '......ywwy......',
    '......yw.y......',
    '.......yy.......',
    '.......mm.......',
    '.......mm.......',
    '.......mm.......',
    '......mMMm......',
    '......mmmm......',
    '.......mm.......',
    '......m..m......',
    '.......mm.......',
    '................',
    '................',
    '................'
  ]),
  fire: iconRows('fire', [
    '................',
    '.......r........',
    '......rrr.......',
    '.....rrfrr......',
    '.....rfyfr......',
    '....rrfyyrr.....',
    '....rfyyyfr.....',
    '...rrfyyyyrr....',
    '...rfyyyyyfr....',
    '....rfyyyRr.....',
    '.....rRRRr......',
    '......RRR.......',
    '.......R........',
    '................',
    '................',
    '................'
  ]),
  frost: iconRows('frost', [
    '................',
    '.......C........',
    '......aCa.......',
    '.....aCCCa......',
    '....aCCwwCa.....',
    '...aCCwCCwCa....',
    '....aCwwCCa.....',
    '.....aCCCa......',
    '......aCa.......',
    '.......C........',
    '......a.a.......',
    '.....a...a......',
    '......ccc.......',
    '................',
    '................',
    '................'
  ]),
  lightning: iconRows('lightning', [
    '................',
    '......yy........',
    '.....yyy........',
    '.....fyy........',
    '....yy..........',
    '...yyy..........',
    '..yyyyyy........',
    '......fy........',
    '.....yy.........',
    '....yy..........',
    '...fy...........',
    '..yy............',
    '................',
    '................',
    '................',
    '................'
  ]),
  poison: iconRows('poison', [
    '................',
    '.......b........',
    '......bbb.......',
    '.....bBBBb......',
    '.....bbwbb......',
    '....bbbBbbb.....',
    '....bbBBBbb.....',
    '.....bBBBb......',
    '......bBb.......',
    '.......B........',
    '......b.b.......',
    '.......b........',
    '................',
    '................',
    '................',
    '................'
  ]),
  support: iconRows('support', [
    '................',
    '.......g........',
    '......ggg.......',
    '.......m........',
    '......mym.......',
    '.....myyym......',
    '.....mywym......',
    '.....myyym......',
    '......mym.......',
    '.......m........',
    '......mmm.......',
    '.......m........',
    '......m.m.......',
    '................',
    '................',
    '................'
  ]),
  hero: iconRows('hero', [
    '................',
    '......yyy.......',
    '.....ygggy......',
    '....ygwwwgy.....',
    '....gwkkwkg.....',
    '....gwwwwkg.....',
    '.....gwwgg......',
    '......mmm.......',
    '.....mmmmm......',
    '....mmgggmm.....',
    '....mmmmmmm.....',
    '.....mgggm......',
    '......mmm.......',
    '.......m........',
    '................',
    '................'
  ]),
  hybrid: iconRows('hybrid', [
    '................',
    '....aa..........',
    '...aCCa.........',
    '..aCCCCa....r...',
    '..aCwCCa...rr...',
    '...aCCa...rfr...',
    '..........rfr...',
    '....gg...rr.....',
    '...gGGg.........',
    '..gGGGGg........',
    '..gGwGGg........',
    '...gGGg.........',
    '....gg..........',
    '................',
    '................',
    '................'
  ]),
  tower: iconRows('tower', [
    '................',
    '....m......m....',
    '....mm....mm....',
    '....mymmmym.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '......mmm.......',
    '......mym.......',
    '......mmm.......',
    '.....mmmmm......',
    '....mmmmmmm.....',
    '....MMMMMMM.....',
    '................',
    '................',
    '................',
    '................'
  ]),
  burn: iconRows('burn', [
    '................',
    '........r.......',
    '.......rrr......',
    '......rfyr......',
    '......ryyr......',
    '.......rR.......',
    '....RRRRRRR.....',
    '....kkkkkkk.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  slow: iconRows('slow', [
    '................',
    '......CCCC......',
    '.....C....C.....',
    '.....C.ww.C.....',
    '......C..C......',
    '.......CC.......',
    '......C..C......',
    '.....C....C.....',
    '.....C.ww.C.....',
    '......CCCC......',
    '.......mm.......',
    '......m..m......',
    '................',
    '................',
    '................',
    '................'
  ]),
  stun: iconRows('stun', [
    '................',
    '.......y........',
    '......y.y.......',
    '...y...y...y....',
    '....y.yyy.y.....',
    '.....yyyyy......',
    '...yyyyyyyyy....',
    '.....yyyyy......',
    '....y.yyy.y.....',
    '...y...y...y....',
    '......y.y.......',
    '.......y........',
    '................',
    '................',
    '................',
    '................'
  ]),
  brittle: iconRows('brittle', [
    '................',
    '......mmmm......',
    '.....mwwwwm.....',
    '....mw.w..wm....',
    '....mw..w..m....',
    '....m..w...m....',
    '....m...w.wm....',
    '.....m.w.wm.....',
    '......mmmm......',
    '.......dd.......',
    '......d..d......',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  fence: iconRows('fence', [
    '................',
    '...m.m.m.m.m.m..',
    '...mmmmmmmmmmm..',
    '...me.e.e.e.m...',
    '...me.e.e.e.m...',
    '...me.e.e.e.m...',
    '...mmmmmmmmmmm..',
    '...m........m...',
    '..mmm......mmm..',
    '..m.m......m.m..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  hp: iconRows('hp', [
    '................',
    '................',
    '.....rr..rr.....',
    '....rrrrrrrr....',
    '....rrwwrrrr....',
    '....rrrrrrrr....',
    '.....rrrrrr.....',
    '......rrrr......',
    '.......rr.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  xp: iconRows('xp', [
    '................',
    '.......y........',
    '......yyy.......',
    '.....yyyyy......',
    '....yywywyy.....',
    '...yyyyyyyyy....',
    '..yyyyyyyyyyyy..',
    '......yyy.......',
    '......yyy.......',
    '......yyy.......',
    '.....yyyyy......',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  wave: iconRows('wave', [
    '................',
    '..m....m....m...',
    '.mm...mm...mm...',
    'm.m..m.m..m.m...',
    'mmm..mmm..mmm...',
    '................',
    '...m....m....m..',
    '..mm...mm...mm..',
    '.m.m..m.m..m.m..',
    '.mmm..mmm..mmm..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  crit: iconRows('crit', [
    '................',
    '.......y........',
    '..y...yyy...y...',
    '...y.yyyyy.y....',
    '....yyyyyyy.....',
    '.yyyyywywyyyyy..',
    '....yyyyyyy.....',
    '...y.yyyyy.y....',
    '..y...yyy...y...',
    '.......y........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  damage: iconRows('damage', [
    '................',
    '.............g..',
    '............gg..',
    '...........gwg..',
    '..........g.g...',
    '.........g.g....',
    '........g.g.....',
    '.......g.g......',
    '......g.g.......',
    '.....g.g........',
    '....mmm.........',
    '.....m..........',
    '................',
    '................',
    '................',
    '................'
  ]),
  range: iconRows('range', [
    'gg..........gg..',
    'g............g..',
    'g............g..',
    '................',
    '................',
    '.......aa.......',
    '......a..a......',
    '......a..a......',
    '.......aa.......',
    '................',
    '................',
    'g............g..',
    'g............g..',
    'gg..........gg..',
    '................',
    '................'
  ]),
  haste: iconRows('haste', [
    '................',
    '......ggg.......',
    '.....g...g......',
    '....gg...gg.....',
    '...gg..g..gg....',
    '..gg..ggg..gg...',
    '......ggg.......',
    '.....gg.gg......',
    '....gg...gg.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  rank: iconRows('rank', [
    '................',
    '.......m........',
    '......mmm.......',
    '.....m...m......',
    '................',
    '......yyy.......',
    '.....yyyyy......',
    '....yy...yy.....',
    '................',
    '.....ggggg......',
    '....ggggggg.....',
    '...gg.....gg....',
    '................',
    '................',
    '................',
    '................'
  ]),
  merge: iconRows('merge', [
    '................',
    '...a......gg....',
    '....a....g..g...',
    '.aaaaaaa.g..g...',
    '....a....gggg...',
    '...a......gg....',
    '.........g..g...',
    '.......ggggggg..',
    '.........g..g...',
    '..........gg....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  pause: iconRows('pause', [
    '................',
    '................',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  play: iconRows('play', [
    '................',
    '................',
    '....m...........',
    '....mm..........',
    '....mmm.........',
    '....mmmm........',
    '....mmmmm.......',
    '....mmmm........',
    '....mmm.........',
    '....mm..........',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  victory: iconRows('victory', [
    '................',
    '.......g........',
    '......gyg.......',
    '.....gyyyg......',
    '....gyyyyyyg....',
    '...gyyyyyyyyg...',
    '....gyyyyyyg....',
    '.....gyyyg......',
    '......gyg.......',
    '.......g........',
    '......mmm.......',
    '.....mmmmm......',
    '......mmm.......',
    '................',
    '................',
    '................'
  ]),
  defeat: iconRows('defeat', [
    '................',
    '......kkkk......',
    '.....kwwwk......',
    '....kwywywk.....',
    '....kwkkkwk.....',
    '....kwwwwwk.....',
    '.....kwwkk......',
    '......kkk.......',
    '......k.k.......',
    '.....k...k......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  weapon: iconRows('weapon', [
    '................',
    '.......m........',
    '......mm........',
    '......mm........',
    '.....mwm........',
    '.....mm.........',
    '....mm..........',
    '....mm..........',
    '...mmm..........',
    '..myym..........',
    '...mm...........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  charm: iconRows('charm', [
    '................',
    '.......g........',
    '......g.g.......',
    '......gyg.......',
    '.......g........',
    '......y.y.......',
    '.......g........',
    '......g.g.......',
    '.......g........',
    '......g.g.......',
    '.......g........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  armor: iconRows('armor', [
    '................',
    '.....mmmmm......',
    '....mmmmmmm.....',
    '....mmmwmmm.....',
    '....mmmmmmm.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '......mmm.......',
    '......m.m.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  vitality: iconRows('vitality', [
    '................',
    '.....rr..rr.....',
    '....rrrrrrrr....',
    '....rrryyrrr....',
    '.....rryyrr.....',
    '......rrr.......',
    '.......r........',
    '......mmm.......',
    '......mym.......',
    '......mmm.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  locked: iconRows('locked', [
    '................',
    '......mmm.......',
    '.....m...m......',
    '.....m...m......',
    '....mmmmmmm.....',
    '....mmmywmm.....',
    '....mmmmmmm.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  plus: iconRows('plus', [
    '................',
    '................',
    '.......gg.......',
    '.......gg.......',
    '.......gg.......',
    '....gggggggg....',
    '....gggggggg....',
    '.......gg.......',
    '.......gg.......',
    '.......gg.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  warning: iconRows('warning', [
    '................',
    '.......y........',
    '......yyy.......',
    '.....yy.yy......',
    '....yy.k.yy.....',
    '...yy.yyy.yy....',
    '..yy.yyyyy.yy...',
    '.yy.yy.k.yy.yy..',
    '.yyyyyyyyyyyyy..',
    '....MMMMMMM.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  currency: iconRows('currency', [
    '................',
    '................',
    '......gggg......',
    '.....g....g.....',
    '.....g.yy.g.....',
    '.....g.yy.g.....',
    '.....g....g.....',
    '......gggg......',
    '.......GG.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  move: iconRows('move', [
    '................',
    '.......a........',
    '......aaa.......',
    '.....aa.aa......',
    '....aa...aa.....',
    '.......a........',
    '.......a........',
    '.......a........',
    '....ggggggg.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  sound: iconRows('sound', [
    '................',
    '....m...........',
    '....mm..y.......',
    '.mmmmm..y.y.....',
    '.m.mmm..y...y...',
    '.m.mmm..y.y.....',
    '.mmmmm..y.......',
    '....mm..........',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  mute: iconRows('mute', [
    '................',
    '....m......r....',
    '....mm....r.....',
    '.mmmmm...r......',
    '.m.mmm..r.......',
    '.m.mmm...r......',
    '.mmmmm....r.....',
    '....mm.....r....',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  splash: iconRows('splash', [
    '................',
    '.......r........',
    '..r...rrr...r...',
    '...r.rrfrr.r....',
    '....rrrrrrr.....',
    '.rrrrrryyrrrrr..',
    '....rrrrrrr.....',
    '...r.rrfrr.r....',
    '..r...rrr...r...',
    '.......r........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  chain: iconRows('chain', [
    '................',
    '....mm..........',
    '...m..m.........',
    '...m..m...mm....',
    '....mm...m..m...',
    '........m..m....',
    '....mm...mm.....',
    '...m..m.........',
    '...m..m...mm....',
    '....mm...m..m...',
    '........m..m....',
    '.........mm.....',
    '................',
    '................',
    '................',
    '................'
  ]),
  pierce: iconRows('pierce', [
    '................',
    '.............y..',
    '....MMMM....yy..',
    '....MMMM...y.y..',
    '....MMMM....yy..',
    '....MMMM.....y..',
    '....MMMM........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ])
};

const ACCENTS = ['g', 'y', 'r', 'f', 'a', 'C', 'b', 'p', 'm', 'e'];

function fallbackRows(id) {
  const h = hashString(id || '?');
  const a = ACCENTS[h % ACCENTS.length];
  const b = ACCENTS[(h >>> 5) % ACCENTS.length];
  const diamond = [
    '................',
    '................',
    '......mmmm......',
    '.....m....m.....',
    '....m......m....',
    '...m........m...',
    '...m...12...m...',
    '...m..1221..m...',
    '...m...12...m...',
    '...m........m...',
    '....m......m....',
    '.....m....m.....',
    '......mmmm......',
    '.......MM.......',
    '................',
    '................'
  ];
  return diamond.map(row => row.split('1').join(a).split('2').join(b));
}

function normalizeId(id) {
  return String(id ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rowsFor(id) {
  const key = normalizeId(id);
  if (ICONS[key]) return ICONS[key];
  const alias = ALIASES[key];
  if (alias && ICONS[alias]) return ICONS[alias];
  return fallbackRows(key || '?');
}

export function drawIcon(ctx, id, x, y, size = 16) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const box = Number.isFinite(size) && size > 0 ? size : 16;
  const scale = box / 16;
  const rows = rowsFor(id);
  const canStack = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canStack) ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* ignored */ }
    for (let row = 0; row < 16; row++) {
      const line = rows[row];
      for (let col = 0; col < 16; col++) {
        const color = PAL[line[col]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  } finally {
    if (canStack) ctx.restore();
  }
}
