/**
 * Fencefall defender sprites (logical pixels, bottom-center anchor).
 *
 * drawDefender(ctx, unit, x, y) plants the sprite's feet — including the
 * contact-shadow row — on (x, y). The cached image is 40×40, inside the
 * 24–40px art range, and slots are 64×72.
 *
 * Hybrid silhouettes follow a sorted parent pair (`bolt+fire`, …). Each
 * hybrid joins that pair's two parent shapes — bow, flame bowl, crystal,
 * spark coil, flask, banner — so it reads as a combination, not a recolor.
 * Parents come from RECIPES (id + parents), then unit.parents / ingredients /
 * components / sourceTypes, then the type id (`frost+support`, `firefrost`,
 * or a known flavor alias). Unknown ids still draw a ranked reliquary.
 * Nothing here reads or writes gameplay RNG or run state.
 */
import {BASE_TYPES, clamp} from '../shared.js';
import {RECIPES} from '../data/recipes.js';

const W = 40;
const H = 40;
const FRAMES = 4;

const PALETTE = {
  K: '#140e0c',
  k: '#2a221c',
  R: '#4a2c18',
  r: '#8a552c',
  Y: '#e0a05a',
  N: '#3a4450',
  n: '#8494a4',
  M: '#e2eaf0',
  B: '#7a4e18',
  b: '#f0c14a',
  X: '#322e2a',
  x: '#6a635c',
  w: '#c4bbb0',
  d: '#3c1018',
  C: '#6e2430',
  e: '#8e3844',
  c: '#c44a56',
  H: '#e6c15a',
  h: '#fff0c0',
  s: '#c49068',
  S: '#f0c4a0',
  y: '#f6d8b4',
  P: '#5c3818',
  p: '#a06a38',
  F: '#5c140c',
  f: '#e04018',
  A: '#ffb030',
  a: '#fff4c8',
  I: '#102e3c',
  i: '#2a7c9c',
  L: '#8ae4f8',
  l: '#f6feff',
  V: '#1c1438',
  v: '#6840d0',
  Z: '#ffe050',
  z: '#fffce8',
  U: '#7a4018',
  u: '#e08840',
  G: '#142010',
  g: '#3c882c',
  Q: '#b0e848',
  q: '#f0ffd0',
  o: '#7aa090',
  O: '#d8f0e4',
  T: '#145850',
  t: '#38a898',
  D: '#e0fff6',
  E: '#f6f2e6',
  W: '#ffffff',
  J: '#1c1612',
  j: '#4a3c2c',
  m: '#d8c4a4'
};

const ROLE = {bolt: 'n', fire: 'f', frost: 'L', lightning: 'Z', poison: 'Q', support: 't'};
const RANK_COLOR = [null, 'E', 'Q', 'L', 'H'];
const BASE_SET = new Set(BASE_TYPES);

const ALIASES = {
  hero: 'hero',
  warden: 'hero',
  champion: 'hero',
  keeper: 'hero',
  sentinel: 'hero',
  bolt: 'bolt',
  arrow: 'bolt',
  arrows: 'bolt',
  projectile: 'bolt',
  ballista: 'bolt',
  crossbow: 'bolt',
  quarrel: 'bolt',
  archer: 'bolt',
  fire: 'fire',
  flame: 'fire',
  burn: 'fire',
  ember: 'fire',
  frost: 'frost',
  ice: 'frost',
  cold: 'frost',
  slow: 'frost',
  lightning: 'lightning',
  lightening: 'lightning',
  lighning: 'lightning',
  shock: 'lightning',
  thunder: 'lightning',
  electric: 'lightning',
  spark: 'lightning',
  poison: 'poison',
  posion: 'poison',
  toxin: 'poison',
  venom: 'poison',
  plague: 'poison',
  support: 'support',
  aura: 'support',
  banner: 'support',
  buff: 'support',
  buffer: 'support',
  healer: 'support'
};

/** Flavor ids used when a recipe id does not embed its parent names. RECIPES parents win. */
const FLAVOR_PAIRS = {
  cinderbolt: ['bolt', 'fire'],
  cinderquarrel: ['bolt', 'fire'],
  emberbolt: ['bolt', 'fire'],
  hailspike: ['bolt', 'frost'],
  glacierbolt: ['bolt', 'frost'],
  stormlance: ['bolt', 'lightning'],
  thunderbolt: ['bolt', 'lightning'],
  venomspine: ['bolt', 'poison'],
  poisonbolt: ['bolt', 'poison'],
  signalshot: ['bolt', 'support'],
  signaler: ['bolt', 'support'],
  steamvent: ['fire', 'frost'],
  emberglass: ['fire', 'frost'],
  plasmabrazier: ['fire', 'lightning'],
  stormkiln: ['fire', 'lightning'],
  blightkiln: ['fire', 'poison'],
  plaguefire: ['fire', 'poison'],
  warbeacon: ['fire', 'support'],
  warhorn: ['fire', 'support'],
  prismcoil: ['frost', 'lightning'],
  crystalstorm: ['frost', 'lightning'],
  rimeurn: ['frost', 'poison'],
  blightice: ['frost', 'poison'],
  wardglass: ['frost', 'support'],
  wardbell: ['frost', 'support'],
  acidarc: ['lightning', 'poison'],
  venomcoil: ['lightning', 'poison'],
  relaystandard: ['lightning', 'support'],
  sparkbanner: ['lightning', 'support'],
  plaguealtar: ['poison', 'support'],
  plaguecenser: ['poison', 'support'],
  censeralter: ['poison', 'support']
};

const recipeById = new Map();
indexRecipes(RECIPES);

const cache = new Map();

const TOWER_PAINTERS = {
  bolt: paintBolt,
  fire: paintFire,
  frost: paintFrost,
  lightning: paintLightning,
  poison: paintPoison,
  support: paintSupport
};

const HYBRID_PAINTERS = {
  'bolt+fire': paintCinderQuarrel,
  'bolt+frost': paintHailSpike,
  'bolt+lightning': paintStormLance,
  'bolt+poison': paintVenomSpine,
  'bolt+support': paintSignalShot,
  'fire+frost': paintSteamVent,
  'fire+lightning': paintPlasmaBrazier,
  'fire+poison': paintBlightKiln,
  'fire+support': paintWarBeacon,
  'frost+lightning': paintPrismCoil,
  'frost+poison': paintRimeUrn,
  'frost+support': paintWardBell,
  'lightning+poison': paintAcidArc,
  'lightning+support': paintRelayStandard,
  'poison+support': paintPlagueAltar
};

export function defenderSize(unit) {
  void unit;
  return {width: W, height: H};
}

export function drawDefender(ctx, unit, x, y, options = {}) {
  if (!ctx || !unit || typeof unit !== 'object' || typeof ctx.save !== 'function') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const opts = options || {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const flash = Number.isFinite(opts.flash) && opts.flash > 0 ? Math.min(1, opts.flash) : 0;
  const visual = resolveVisual(unit);
  const rank = clamp(Math.round(Number.isFinite(unit.rank) ? unit.rank : 1), 1, 4);
  const stars = visual.family === 'hero' ? starCount(unit) : 0;
  const frame = frameOf(time);
  const sprite = getSprite(visual, rank, stars, frame);
  const dw = Math.max(1, Math.round(W * scale));
  const dh = Math.max(1, Math.round(H * scale));
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh);
  ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* older contexts */ }
    blit(ctx, sprite, dx, dy, dw, dh);
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, sprite, dx, dy, dw, dh);
    }
  } finally {
    ctx.restore();
  }
}

function frameOf(time) {
  if (!Number.isFinite(time) || time <= 0) return 0;
  return Math.floor(time * 6) % FRAMES;
}

function starCount(unit) {
  const upgrades = unit.upgrades;
  if (!upgrades || typeof upgrades !== 'object') return 0;
  let count = 0;
  for (const key of Object.keys(upgrades)) {
    const value = upgrades[key];
    if (typeof value === 'number' && Number.isFinite(value)) count += Math.max(0, Math.min(6, Math.round(value)));
    else if (value) count += 1;
    if (count >= 6) return 6;
  }
  return count;
}

function indexRecipes(catalog) {
  const list = Array.isArray(catalog)
    ? catalog
    : (catalog && typeof catalog === 'object'
      ? Object.entries(catalog).map(([id, value]) => ({id, ...(value && typeof value === 'object' ? value : {})}))
      : []);
  for (const recipe of list) {
    if (!recipe || typeof recipe !== 'object') continue;
    const pair = parentsOfRecipe(recipe);
    const id = String(recipe.id ?? '').trim().toLowerCase();
    if (!id || !pair) continue;
    recipeById.set(id, pair);
    recipeById.set(id.replace(/[^a-z0-9]/g, ''), pair);
  }
}

function parentsOfRecipe(recipe) {
  return pairFromList(recipe.parents)
    || pairFromList(recipe.ingredients)
    || pairFromList(recipe.types)
    || pairFromList(recipe.components)
    || pairFromList(recipe.pair)
    || (recipe.a != null && recipe.b != null ? pairFromList([recipe.a, recipe.b]) : null)
    || (recipe.left != null && recipe.right != null ? pairFromList([recipe.left, recipe.right]) : null);
}

function canonToken(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  return ALIASES[raw] || raw;
}

function canonBase(value) {
  const mapped = canonToken(value);
  return BASE_SET.has(mapped) ? mapped : '';
}

function pairKey(a, b) {
  return BASE_TYPES.indexOf(a) < BASE_TYPES.indexOf(b) ? `${a}+${b}` : `${b}+${a}`;
}

function pairFromList(list) {
  if (typeof list === 'string') return pairFromIdString(list);
  if (!Array.isArray(list) || list.length < 2) return null;
  const bases = [];
  for (const entry of list) {
    const base = canonBase(entry && typeof entry === 'object' ? (entry.type || entry.id || entry.kind) : entry);
    if (base && !bases.includes(base)) bases.push(base);
  }
  if (bases.length < 2) return null;
  return pairKey(bases[0], bases[1]);
}

function pairFromIdString(id) {
  const raw = String(id ?? '').trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[^a-z0-9]/g, '');
  if (recipeById.has(raw)) return recipeById.get(raw);
  if (recipeById.has(compact)) return recipeById.get(compact);
  if (FLAVOR_PAIRS[compact]) return pairFromList(FLAVOR_PAIRS[compact]);
  const found = [];
  const push = (base) => { if (base && !found.includes(base)) found.push(base); };
  for (const part of raw.split(/[^a-z0-9]+/)) push(canonBase(part));
  if (found.length >= 2) return pairKey(found[0], found[1]);
  const tokens = [...BASE_TYPES, ...Object.keys(ALIASES).filter((key) => BASE_SET.has(ALIASES[key]))];
  tokens.sort((a, b) => b.length - a.length);
  const hits = [];
  for (const token of tokens) {
    if (!raw.includes(token)) continue;
    const base = BASE_SET.has(token) ? token : ALIASES[token];
    if (base && !hits.includes(base)) hits.push(base);
  }
  if (hits.length >= 2) return pairKey(hits[0], hits[1]);
  return null;
}

function findPair(unit, typeName) {
  return pairFromList(unit.parents)
    || pairFromList(unit.ingredients)
    || pairFromList(unit.components)
    || pairFromList(unit.sourceTypes)
    || pairFromIdString(typeName);
}

function accentFor(name) {
  const accents = ['f', 'L', 'Z', 'Q', 't', 'b', 'c', 'v'];
  let hash = 2166136261;
  const text = String(name || 'unknown');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return accents[(hash >>> 0) % accents.length];
}

function resolveVisual(unit) {
  const typeName = canonToken(unit.type);
  const kind = typeof unit.kind === 'string' ? unit.kind.toLowerCase() : '';
  if (kind === 'hero' || typeName === 'hero') return {family: 'hero', key: 'hero'};
  const base = BASE_SET.has(typeName) ? typeName : '';
  if (base && kind !== 'hybrid') return {family: 'tower', key: base};
  const pair = findPair(unit, typeName);
  if (pair) return {family: 'hybrid', key: pair};
  const accent = accentFor(typeName || kind || 'hybrid');
  return {family: 'unknown', key: `unknown:${accent}`, accent};
}

function createPainter(frame) {
  const cells = Array.from({length: H}, () => Array(W).fill('.'));
  return {
    frame,
    cells,
    px(x, y, color) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H || !color || color === '.' || !PALETTE[color]) return;
      cells[iy][ix] = color;
    },
    fill(x, y, w, h, color) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) this.px(x + i, y + j, color);
      }
    },
    hline(x, y, w, color) { this.fill(x, y, w, 1, color); },
    vline(x, y, h, color) { this.fill(x, y, 1, h, color); }
  };
}

function mx(x) {
  return W - 1 - x;
}

function speckle(p, x, y, w, h, base, dark, light) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const n = (i * 17 + j * 11) & 15;
      p.px(x + i, y + j, n === 0 ? light : n < 3 ? dark : base);
    }
  }
}

function oval(p, cx, cy, rx, ry, color, test) {
  if (!(rx > 0) || !(ry > 0)) return;
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1 && (!test || test(x, y))) p.px(x, y, color);
    }
  }
}

function drawFlame(p, cx, top, height, style) {
  const cols = {
    fire: ['a', 'A', 'f', 'F'],
    green: ['q', 'Q', 'g', 'G'],
    steam: ['l', 'L', 'E', 'i'],
    plasma: ['z', 'Z', 'a', 'f']
  }[style] || ['a', 'A', 'f', 'F'];
  const sway = [0, 1, 0, -1][p.frame] || 0;
  const tall = Math.max(3, height - (p.frame === 2 ? 1 : 0));
  for (let i = 0; i < tall; i++) {
    const t = tall <= 1 ? 0 : i / (tall - 1);
    const wobble = (i + p.frame * 2) % 4 === 0 ? 1 : 0;
    const half = Math.max(0, Math.round((1 - t) * 3.4 + wobble * (1 - t)));
    const y = top + i;
    const x = cx + (t > 0.4 ? sway : 0);
    const col = cols[t < 0.2 ? 0 : t < 0.48 ? 1 : t < 0.75 ? 2 : 3];
    p.hline(x - half, y, half * 2 + 1, col);
    if (half > 0 && (i + p.frame) % 3 === 0) p.px(x, y, cols[0]);
  }
}

function drawCrystal(p, cx, top, height, wide) {
  const mid = top + Math.max(1, Math.floor(height * 0.42));
  const bot = top + height - 1;
  for (let y = top; y <= bot; y++) {
    const span = y <= mid ? (y - top) / Math.max(1, mid - top) : (bot - y) / Math.max(1, bot - mid);
    const half = Math.max(0, Math.round(span * wide));
    for (let x = cx - half; x <= cx + half; x++) {
      let color = 'L';
      if (x === cx - half || x === cx + half) color = 'I';
      else if (x < cx - 1) color = 'i';
      else if ((y + p.frame * 3) % 7 === 0 && x === cx) color = 'W';
      else if (x === cx) color = 'l';
      p.px(x, y, color);
    }
  }
  p.px(cx, top, 'W');
}

function drawCoils(p, cx, top, count, gap) {
  for (let i = 0; i < count; i++) {
    const y = top + i * gap;
    p.hline(cx - 5, y, 11, 'U');
    p.hline(cx - 4, y + 1, 9, 'u');
    p.px(cx - 5, y + 1, 'B');
    p.px(cx + 5, y + 1, 'B');
    p.hline(cx - 2, y + 2, 5, 'V');
    p.px(cx, y + 1, (i + p.frame) % 2 === 0 ? 'Z' : 'z');
  }
  p.vline(cx, top - 1, count * gap + 1, 'n');
  p.vline(cx + 1, top - 1, count * gap, 'N');
}

function drawSparks(p, points) {
  const cols = ['z', 'Z', 'h', 'v'];
  for (let i = 0; i < points.length; i++) {
    const shift = (i + p.frame) % 2;
    p.px(points[i][0] + (i % 2 === 0 ? shift : -shift), points[i][1] - (p.frame === 3 && i === 0 ? 1 : 0), cols[(i + p.frame) % cols.length]);
  }
}

function drawZig(p, points, color, hot) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      p.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), (s + p.frame) % 3 === 0 ? hot : color);
    }
  }
}

function drawFlag(p, x, y, w, h) {
  const ox = [0, 1, 1, 0][p.frame];
  speckle(p, x + ox, y, w, h, 't', 'T', 'D');
  p.hline(x + ox, y, w, 'D');
  p.vline(x + ox, y, h, 'T');
  p.vline(x + ox + w - 1, y, h, 'T');
  const cx = x + ox + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  p.px(cx, cy - 1, 'h');
  p.px(cx, cy, p.frame % 2 === 0 ? 'H' : 'b');
  p.px(cx - 1, cy + 1, 'E');
  p.px(cx + 1, cy + 1, 'E');
  p.px(cx, cy + 2, 'T');
  p.px(x + ox + 2, y + 3, 'E');
  p.px(x + ox + w - 3, y + h - 3, 'T');
}

function drawBow(p, limbHi, limb, limbDk, stringC, stock) {
  const pts = [[5, 23], [6, 22], [7, 21], [8, 20], [9, 19], [10, 18], [11, 17], [12, 16], [13, 16], [14, 15], [15, 15]];
  for (const [x, y] of pts) {
    p.px(x, y, limbHi);
    p.px(x, y + 1, limb);
    p.px(x, y + 2, limbDk);
    p.px(mx(x), y, limbHi);
    p.px(mx(x), y + 1, limb);
    p.px(mx(x), y + 2, limbDk);
  }
  p.fill(4, 24, 3, 2, 'N');
  p.fill(mx(6), 24, 3, 2, 'N');
  p.px(5, 24, 'M');
  p.px(mx(5), 24, 'M');
  p.hline(12, 17, 16, stringC);
  speckle(p, 14, 20, 12, 11, stock, 'R', 'Y');
  p.hline(14, 22, 12, 'N');
  p.hline(14, 27, 12, 'n');
  p.fill(18, 17, 4, 4, 'r');
  p.vline(18, 17, 4, 'N');
  p.vline(21, 17, 4, 'N');
  p.px(15, 22, 'b');
  p.px(24, 22, 'b');
}

function drawQuarrel(p, tip, shaft, lift = 0) {
  const y = 4 + lift;
  p.px(19, y, tip);
  p.px(20, y, tip);
  p.px(18, y + 1, tip);
  p.px(21, y + 1, tip);
  p.px(19, y + 1, 'M');
  p.px(20, y + 1, 'W');
  p.vline(19, y + 2, 10, shaft);
  p.vline(20, y + 2, 10, 'n');
  p.px(17, y + 10, 'Y');
  p.px(18, y + 9, 'Y');
  p.px(22, y + 10, 'Y');
  p.px(21, y + 9, 'r');
}

function drawWinch(p, rank) {
  p.fill(16, 23, 5, 5, 'N');
  p.fill(17, 24, 3, 3, 'n');
  p.px(18, 25, p.frame % 2 === 0 ? 'M' : 'b');
  p.px(17, 24, 'K');
  p.px(19, 26, 'K');
  if (rank >= 3) p.px(21, 23, 'H');
  if (rank >= 4) p.px(18, 22, 'h');
}

function drawFlask(p, cx, top, liquid, glassHi) {
  p.fill(cx - 1, top, 4, 2, 'Y');
  p.px(cx, top, 'y');
  p.fill(cx - 2, top + 2, 6, 2, 'r');
  p.vline(cx - 2, top + 2, 2, 'R');
  p.fill(cx - 1, top + 4, 4, 3, 'O');
  p.vline(cx - 1, top + 4, 3, 'o');
  p.vline(cx + 2, top + 4, 3, 'o');
  oval(p, cx + 0.5, top + 14, 8, 8, 'O');
  oval(p, cx + 0.5, top + 16, 6.2, 5.2, liquid, (_x, y) => y >= top + 14);
  p.hline(cx - 5, top + 14, 12, liquid === 'g' ? 'Q' : 'L');
  p.vline(cx - 4, top + 10, 4, glassHi);
  p.px(cx - 3, top + 11, 'W');
  const bubbleY = top + 12 + ((4 - p.frame + 8) % 5);
  p.px(cx - 2, bubbleY, 'q');
  p.px(cx + 2, bubbleY + 1, 'W');
  p.px(cx, top + 17, p.frame % 2 === 0 ? 'q' : 'Q');
}

function drawPlinth(p, rank) {
  speckle(p, 9, 31, 22, 7, 'x', 'X', 'w');
  p.fill(10, 32, 20, 2, 'w');
  p.fill(10, 35, 20, 2, 'X');
  p.fill(6, 33, 4, 5, 'X');
  p.fill(30, 33, 4, 5, 'X');
  p.px(7, 34, 'w');
  p.px(32, 34, 'w');
  p.px(13, 33, 'X');
  p.px(22, 36, 'k');
  p.px(18, 37, 'X');
  p.px(25, 34, 'k');
  if (rank >= 2) {
    p.px(10, 32, 'b');
    p.px(29, 32, 'b');
  }
  if (rank >= 4) {
    p.hline(10, 32, 20, 'b');
    p.px(6, 33, 'H');
    p.px(33, 33, 'H');
    p.px(6, 37, 'h');
    p.px(33, 37, 'h');
  }
}

function drawRankGems(p, rank) {
  const color = RANK_COLOR[rank] || 'E';
  const gem = 3;
  const gap = 2;
  const total = rank * gem + (rank - 1) * gap;
  let x = Math.floor((W - total) / 2);
  for (let i = 0; i < rank; i++) {
    p.fill(x, 34, gem, 3, color);
    p.px(x, 34, 'W');
    p.px(x + 1, 35, rank >= 4 ? 'h' : color);
    x += gem + gap;
  }
}

function drawLineage(p, pair) {
  const [a, b] = pair.split('+');
  // Sit on the plinth highlight, above the rank gems, so the two marks stay separate.
  p.fill(11, 32, 2, 2, ROLE[a] || 'E');
  p.fill(27, 32, 2, 2, ROLE[b] || 'E');
  p.px(11, 32, 'W');
  p.px(27, 32, 'W');
}

function drawHeroSeal(p) {
  p.fill(16, 17, 8, 7, 'H');
  p.fill(17, 18, 6, 5, 'B');
  p.vline(19, 18, 5, 'K');
  p.vline(20, 18, 5, 'K');
  p.px(17, 17, 'h');
  p.px(22, 17, 'W');
  p.px(16, 19, 'b');
  p.px(23, 20, 'b');
}

function drawStars(p, stars) {
  for (let i = 0; i < stars; i++) {
    const x = 3 + i * 3;
    p.px(x, 2, 'h');
    p.px(x - 1, 3, 'b');
    p.px(x, 3, 'H');
    p.px(x + 1, 3, 'b');
  }
}

function drawShadow(p) {
  p.hline(10, 39, 20, 'k');
  p.px(9, 39, 'k');
  p.px(30, 39, 'k');
}

function applyOutline(cells) {
  const marks = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      if (cells[y][x] !== '.') continue;
      const near = (x > 0 && cells[y][x - 1] !== '.')
        || (x + 1 < W && cells[y][x + 1] !== '.')
        || (y > 0 && cells[y - 1][x] !== '.')
        || (y + 1 < H && cells[y + 1][x] !== '.');
      if (near) marks.push(x, y);
    }
  }
  for (let i = 0; i < marks.length; i += 2) cells[marks[i + 1]][marks[i]] = 'K';
}

function paintHero(p) {
  const glow = ['A', 'a', 'h', 'f'][p.frame];
  p.vline(28, 5, 14, 'N');
  p.vline(29, 8, 10, 'n');
  p.px(28, 2, p.frame % 2 === 0 ? 'W' : 'M');
  p.px(27, 3, 'n');
  p.px(28, 3, 'M');
  p.px(29, 3, 'n');
  p.px(27, 4, 'N');
  p.px(28, 4, 'M');
  p.px(29, 4, 'N');
  // Pointed hood, narrow face, sloping shoulders — not a rectangular block.
  p.px(19, 5, 'd');
  p.hline(18, 6, 3, 'C');
  p.hline(17, 7, 5, 'C');
  p.hline(16, 8, 7, 'd');
  p.hline(18, 8, 3, 'H');
  p.px(19, 8, 'h');
  p.fill(15, 9, 9, 3, 'C');
  p.px(14, 10, 'd');
  p.px(24, 10, 'd');
  p.px(14, 11, 'C');
  p.px(24, 11, 'e');
  p.fill(17, 9, 5, 4, 'S');
  p.px(17, 9, 's');
  p.px(21, 9, 's');
  p.px(18, 10, 'K');
  p.px(20, 10, 'K');
  p.px(18, 9, 'W');
  p.px(19, 11, 's');
  p.hline(16, 12, 8, 'C');
  p.hline(14, 13, 12, 'e');
  p.hline(13, 14, 14, 'C');
  speckle(p, 12, 15, 16, 8, 'C', 'd', 'e');
  p.vline(19, 15, 8, 'd');
  p.hline(11, 23, 7, 'c');
  p.hline(22, 23, 7, 'e');
  p.hline(10, 24, 8, 'C');
  p.hline(22, 24, 8, 'd');
  p.px((p.frame === 1 || p.frame === 2) ? 9 : 31, 23, 'C');
  p.fill(24, 14, 4, 5, 'p');
  p.px(27, 15, 'S');
  p.px(27, 16, 'y');
  p.px(8, 15, 'b');
  p.fill(7, 16, 5, 2, 'B');
  p.fill(6, 18, 7, 6, 'O');
  p.fill(8, 19, 3, 4, glow);
  p.px(7, 19, 'W');
  p.vline(7, 20, 3, 'a');
  p.fill(7, 24, 5, 2, 'B');
  p.px(6, 20, 'n');
  p.px(12, 20, 'n');
  p.fill(14, 26, 4, 7, 'P');
  p.fill(22, 26, 4, 7, 'P');
  p.vline(15, 26, 6, 'p');
  p.vline(23, 26, 6, 'p');
  p.fill(13, 32, 5, 4, 'J');
  p.fill(22, 32, 5, 4, 'J');
  p.hline(13, 32, 5, 'j');
  p.hline(22, 32, 5, 'j');
  p.px(14, 33, 'j');
  p.px(23, 34, 'y');
}

function paintBolt(p, rank) {
  drawBow(p, 'Y', 'r', 'R', rank >= 3 ? 'b' : 'M', 'r');
  drawQuarrel(p, 'M', 'N', p.frame === 1 ? -1 : 0);
  drawWinch(p, rank);
  if (rank >= 4) {
    p.px(19, 3, 'h');
    p.px(20, 3, 'W');
  }
}

function drawCoupling(p, rank) {
  p.fill(3, 27, 34, 3, 'X');
  p.hline(3, 27, 34, 'n');
  p.hline(5, 29, 30, 'k');
  p.fill(16, 17, 6, 7, 'N');
  p.hline(16, 17, 6, 'n');
  p.px(18, 19, p.frame % 2 ? 'b' : 'M');
  p.px(19, 21, 'k');
  if (rank >= 3) p.px(17, 18, 'H');
  if (rank >= 4) p.px(20, 18, 'h');
}

function drawCompactBow(p, ox, oy, rank) {
  const lift = p.frame === 1 ? -1 : 0;
  const cx = ox + 8;
  const y0 = oy + lift;
  p.fill(ox + 4, oy + 16, 9, 13, 'r');
  p.vline(ox + 4, oy + 16, 13, 'R');
  p.vline(ox + 12, oy + 16, 13, 'R');
  p.hline(ox + 4, oy + 16, 9, 'Y');
  p.hline(ox + 4, oy + 22, 9, 'N');
  p.hline(ox + 5, oy + 27, 7, 'n');
  p.fill(ox + 6, oy + 14, 5, 4, 'R');
  p.px(ox + 7, oy + 15, 'Y');
  p.fill(ox + 6, oy + 19, 5, 4, 'N');
  p.fill(ox + 7, oy + 20, 3, 2, 'n');
  p.px(ox + 8, oy + 20, p.frame % 2 ? 'b' : 'M');
  const limb = [[0, 18], [1, 17], [2, 16], [3, 15], [4, 14], [5, 13], [6, 12], [7, 12]];
  for (const [dx, dy] of limb) {
    p.px(ox + dx, oy + dy, 'Y');
    p.px(ox + dx, oy + dy + 1, 'r');
    p.px(ox + dx, oy + dy + 2, 'R');
    const right = ox + 16 - dx;
    p.px(right, oy + dy, 'Y');
    p.px(right, oy + dy + 1, 'r');
    p.px(right, oy + dy + 2, 'R');
  }
  p.fill(ox, oy + 19, 3, 2, 'N');
  p.fill(ox + 14, oy + 19, 3, 2, 'N');
  p.px(ox, oy + 19, 'n');
  p.px(ox + 16, oy + 19, 'n');
  p.hline(ox + 3, oy + 13, 11, 'N');
  p.px(cx, oy + 13, 'n');
  p.px(cx, y0, 'W');
  p.px(cx - 1, y0 + 1, 'n');
  p.px(cx, y0 + 1, 'M');
  p.px(cx + 1, y0 + 1, 'n');
  p.vline(cx, y0 + 2, 8, 'N');
  p.vline(cx + 1, y0 + 2, 8, 'k');
  p.px(cx - 2, y0 + 9, 'Y');
  p.px(cx - 1, y0 + 8, 'r');
  p.px(cx + 2, y0 + 8, 'r');
  p.px(cx + 3, y0 + 9, 'Y');
  if (rank >= 3) p.px(cx, Math.max(0, y0 - 1), 'h');
  if (rank >= 4) p.px(cx + 1, Math.max(0, y0 - 1), 'W');
}

function drawEmberBowl(p, cx, top, flameH, wide) {
  drawFlame(p, cx, top, flameH, 'fire');
  const rim = top + flameH;
  const depth = Math.max(6, 27 - rim);
  for (let i = 0; i < depth; i++) {
    const t = depth <= 1 ? 0 : i / (depth - 1);
    const half = Math.max(3, Math.round(wide * (1 - t * 0.2)));
    const y = rim + i;
    if (y > 29) break;
    let color = 'F';
    if (i === 0) color = 'n';
    else if (i === 2 || i === Math.floor(depth * 0.55)) color = 'X';
    else if (i === depth - 1) color = 'k';
    p.hline(cx - half, y, half * 2 + 1, color);
    if (color === 'F') p.px(cx - half + 1, y, 'u');
    if (i === 1) {
      p.px(cx - 1, y, p.frame % 2 ? 'a' : 'A');
      p.px(cx + 1, y, 'f');
    }
  }
  const baseY = Math.min(30, rim + depth);
  if (baseY <= 30) {
    const bw = Math.max(4, wide * 2 - 3);
    const bx = cx - Math.floor(bw / 2);
    p.fill(bx, baseY, bw, Math.max(1, 31 - baseY), 'N');
    p.hline(bx, baseY, bw, 'n');
  }
}

function drawCrystalMount(p, cx, top, height, wide) {
  const tall = Math.max(14, Math.min(height, 27 - top));
  drawCrystal(p, cx, top, tall, wide);
  const seat = top + tall;
  if (seat <= 30) {
    p.hline(cx - 4, seat, 9, 'N');
    p.px(cx - 4, seat, 'M');
    p.px(cx + 4, seat, 'M');
    if (seat + 1 <= 30) p.fill(cx - 2, seat + 1, 5, 30 - seat, 'I');
  }
}

function drawSparkColumn(p, cx, top, rank) {
  const sag = p.frame % 2;
  const rise = rank >= 4 ? 0 : 1;
  drawZig(p, [
    [cx, top + rise],
    [cx + 4, top + 3],
    [cx - 3, top + 6],
    [cx + 3, top + 9 + sag],
    [cx, top + 12]
  ], 'Z', 'W');
  drawSparks(p, [[cx - 4, top + 4], [cx + 4, top + 7], [cx, top + rise]]);
  drawCoils(p, cx, top + 13, 3, 4);
  p.fill(cx - 4, 26, 9, 4, 'X');
  p.hline(cx - 4, 26, 9, 'U');
  p.px(cx, 27, p.frame % 2 ? 'Z' : 'u');
  if (rank >= 4) p.px(cx + (p.frame % 2 ? 4 : -4), top + 2, 'h');
}

function drawVial(p, cx, top, liquid, rank) {
  p.fill(cx - 1, top, 3, 2, 'Y');
  p.px(cx, top, rank >= 4 ? 'h' : 'y');
  p.fill(cx - 1, top + 2, 3, 3, 'r');
  p.px(cx - 1, top + 2, 'R');
  p.px(cx + 1, top + 3, 'Y');
  p.fill(cx - 1, top + 5, 3, 2, 'O');
  p.vline(cx - 1, top + 5, 2, 'o');
  p.vline(cx + 1, top + 5, 2, 'o');
  oval(p, cx, top + 12, 6, 6, 'O');
  oval(p, cx, top + 13, 4.3, 4, liquid, (_x, y) => y >= top + 11);
  p.hline(cx - 3, top + 11, 7, liquid === 'g' ? 'Q' : 'L');
  p.px(cx - 4, top + 10, 'W');
  p.px(cx - 3, top + 12, 'q');
  const bubble = top + 14 + ((p.frame + 4) % 3);
  p.px(cx + 2, bubble, 'W');
  if (rank >= 3) p.px(cx - 1, bubble + 1, 'q');
  const foot = top + 18;
  if (foot <= 30) {
    p.fill(cx - 3, foot, 7, Math.max(1, 30 - foot), 'x');
    p.hline(cx - 3, foot, 7, 'o');
  }
  p.px(cx, Math.min(29, top + 17), p.frame % 2 ? 'Q' : 'g');
}

function drawBanner(p, ox, top, clothW, clothH) {
  const poleTop = top + 3;
  p.vline(ox, poleTop, Math.max(4, 31 - poleTop), 'n');
  p.vline(ox + 1, poleTop + 1, Math.max(3, 30 - poleTop), 'N');
  p.fill(ox - 1, top, 4, 3, 'H');
  p.px(ox, top, p.frame % 2 ? 'W' : 'h');
  p.px(ox + 1, top + 1, 'b');
  drawFlag(p, ox + 2, top + 4, clothW, clothH);
}

function paintFire(p, rank) {
  const flameH = rank >= 4 ? 14 : 12;
  const wide = rank >= 3 ? 8 : 7;
  drawEmberBowl(p, 20, 1, flameH, wide);
  if (rank >= 2) {
    p.px(20 - 4, 1 + flameH, 'b');
    p.px(20 + 4, 1 + flameH, 'b');
  }
  if (rank >= 4) p.px(20, 0, 'W');
}

function paintFrost(p, rank) {
  const wide = rank >= 3 ? 7 : 6;
  const tall = rank >= 4 ? 24 : 22;
  p.fill(12, 24, 16, 6, 'I');
  p.hline(11, 24, 18, 'i');
  p.hline(13, 29, 14, 'N');
  p.px(14, 25, 'l');
  p.px(25, 26, 'L');
  p.px(20, 27, p.frame % 2 ? 'W' : 'l');
  if (rank >= 2) {
    p.px(11, 24, 'b');
    p.px(28, 24, 'b');
  }
  drawCrystal(p, 20, 1, tall, wide);
}

function paintLightning(p, rank) {
  const sag = p.frame === 2 ? 1 : 0;
  drawZig(p, [[20, 1], [31, 5], [11, 9], [29, 13], [15, 17 + sag]], 'Z', 'W');
  drawSparks(p, [[9, 4], [33, 7], [10, 13], [32, 15], [20, 2]]);
  drawCoils(p, 20, 18, 3, 4);
  p.hline(12, 29, 16, 'U');
  p.vline(13, 26, 5, 'V');
  p.vline(26, 26, 5, 'V');
  p.px(15, 27, 'Z');
  p.px(24, 28, 'v');
  if (rank >= 3) p.px(20, 0, 'h');
  if (rank >= 4) {
    p.px(8, 6, 'W');
    p.px(34, 10, 'z');
  }
}

function paintPoison(p, rank) {
  drawFlask(p, 18, 2, 'g', 'E');
  if (rank >= 2) {
    p.px(14, 8, 'Q');
    p.px(24, 8, 'Q');
  }
  if (rank >= 4) {
    p.px(20, 30, 'Q');
    p.px(21, 29, 'g');
  }
  p.hline(14, 30, 12, 'o');
}

function paintSupport(p, rank) {
  p.vline(12, 3, 28, 'n');
  p.vline(13, 4, 26, 'N');
  p.fill(11, 2, 4, 3, 'H');
  p.px(12, 2, p.frame % 2 ? 'W' : 'h');
  drawFlag(p, 15, 6, 16, 15);
  p.fill(15, 22, 4, 3, 'B');
  p.px(16, 23, 'H');
  const pulse = 28 + (p.frame % 2);
  p.px(16, pulse, 'D');
  p.px(20, pulse, 't');
  p.px(24, 28, p.frame === 0 ? 'E' : 'D');
  if (rank >= 3) p.hline(15, 6, 16, 'H');
  if (rank >= 4) p.px(13, 1, 'W');
}

function paintCinderQuarrel(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
}

function paintHailSpike(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawCrystalMount(p, 29, 2, rank >= 4 ? 25 : 23, 6);
}

function paintStormLance(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawSparkColumn(p, 28, 1, rank);
}

function paintVenomSpine(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawVial(p, 29, 4, 'g', rank);
}

function paintSignalShot(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintSteamVent(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
  p.px(18, 7 + (p.frame % 3), 'l');
  p.px(20, 10, 'E');
  p.px(19, 12, p.frame % 2 ? 'L' : 'a');
  p.px(21, 14, 'A');
}

function paintPlasmaBrazier(p, rank) {
  drawCoupling(p, rank);
  drawEmberBowl(p, 10, 1, rank >= 4 ? 11 : 10, 5);
  drawSparkColumn(p, 29, 1, rank);
}

function paintBlightKiln(p, rank) {
  drawCoupling(p, rank);
  drawEmberBowl(p, 10, 1, rank >= 4 ? 11 : 10, 5);
  drawVial(p, 29, 4, 'g', rank);
  p.px(16, 12, 'Q');
  p.px(18, 15, 'g');
  p.px(22, 18, p.frame % 2 ? 'Q' : 'q');
}

function paintWarBeacon(p, rank) {
  drawCoupling(p, rank);
  drawBanner(p, 1, 2, 12, rank >= 4 ? 15 : 13);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
}

function paintPrismCoil(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawSparkColumn(p, 29, 1, rank);
  p.px(16, 10, 'Z');
  p.px(18, 13, p.frame % 2 ? 'W' : 'z');
}

function paintRimeUrn(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 22 : 20, 5);
  drawVial(p, 29, 4, 'g', rank);
  p.px(24, 16, 'L');
  p.px(33, 18, 'l');
}

function paintWardBell(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawBanner(p, 21, 2, 13, 14);
}

function paintAcidArc(p, rank) {
  drawCoupling(p, rank);
  drawSparkColumn(p, 10, 1, rank);
  drawVial(p, 29, 4, 'g', rank);
  const sag = p.frame % 2;
  drawZig(p, [[15, 7], [20, 4 - sag], [25, 7]], 'Z', 'Q');
}

function paintRelayStandard(p, rank) {
  drawCoupling(p, rank);
  drawSparkColumn(p, 10, 1, rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintPlagueAltar(p, rank) {
  drawCoupling(p, rank);
  drawVial(p, 10, 4, 'g', rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintReliquary(p, rank, accent) {
  const gem = PALETTE[accent] ? accent : 'b';
  speckle(p, 11, 16, 18, 14, 'x', 'X', 'w');
  p.fill(12, 12, 16, 5, 'X');
  p.px(14, 11, 'N');
  p.px(25, 11, 'N');
  p.px(16, 10, 'n');
  p.px(23, 10, 'n');
  p.hline(15, 9, 10, 'N');
  p.fill(17, 18, 6, 7, gem);
  p.px(18, 19, 'W');
  p.px(21, 22, 'h');
  p.fill(18, 20, 4, 4, 'K');
  p.vline(19, 21, 3, gem);
  p.fill(13, 24, 5, 5, 'N');
  p.fill(14, 25, 3, 3, 'n');
  p.px(15, 26, p.frame % 2 ? 'M' : 'b');
  p.px(12, 18, 'b');
  p.px(27, 18, 'b');
  if (rank >= 3) {
    p.px(16, 14, 'H');
    p.px(23, 14, 'H');
  }
  if (rank >= 4) p.px(20, 8, 'h');
}

function paintGrid(visual, rank, stars, frame) {
  const p = createPainter(frame);
  if (visual.family === 'hero') paintHero(p);
  else if (visual.family === 'tower') (TOWER_PAINTERS[visual.key] || paintReliquary)(p, rank, visual.accent);
  else if (visual.family === 'hybrid') (HYBRID_PAINTERS[visual.key] || paintReliquary)(p, rank, visual.accent);
  else paintReliquary(p, rank, visual.accent);
  if (visual.family !== 'hero') {
    drawPlinth(p, rank);
    if (rank >= 4) {
      p.px(14, 30, 'H');
      p.px(25, 30, 'H');
      p.px(15, 29, 'h');
      p.px(24, 29, 'h');
    }
  }
  applyOutline(p.cells);
  if (visual.family === 'hero') {
    drawHeroSeal(p);
    drawStars(p, stars);
  } else {
    drawRankGems(p, rank);
    if (visual.key.includes('+')) drawLineage(p, visual.key);
  }
  drawShadow(p);
  return p.cells;
}

function getSprite(visual, rank, stars, frame) {
  const key = `${visual.family}|${visual.key}|${rank}|${stars}|${frame}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const grid = paintGrid(visual, rank, stars, frame);
  const sprite = {grid, canvas: rasterize(grid), width: W, height: H};
  cache.set(key, sprite);
  if (cache.size > 480) cache.delete(cache.keys().next().value);
  return sprite;
}

function createSurface(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try { return new OffscreenCanvas(width, height); } catch { /* fall through */ }
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

function rasterize(grid) {
  const canvas = createSurface(W, H);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { context.imageSmoothingEnabled = false; } catch { /* ignore */ }
  blitGrid(context, grid, 0, 0, W, H);
  return canvas;
}

function blit(ctx, sprite, dx, dy, dw, dh) {
  if (sprite.canvas && typeof ctx.drawImage === 'function') {
    ctx.drawImage(sprite.canvas, dx, dy, dw, dh);
    return;
  }
  blitGrid(ctx, sprite.grid, dx, dy, dw, dh);
}

function blitGrid(ctx, grid, dx, dy, dw, dh) {
  if (typeof ctx.fillRect !== 'function') return;
  for (let y = 0; y < H; y++) {
    const row = grid[y];
    const y0 = Math.round(dy + (y * dh) / H);
    const y1 = Math.round(dy + ((y + 1) * dh) / H);
    const ph = Math.max(1, y1 - y0);
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      const x0 = Math.round(dx + (x * dw) / W);
      const x1 = Math.round(dx + ((x + 1) * dw) / W);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), ph);
    }
  }
}
