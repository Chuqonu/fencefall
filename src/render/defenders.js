/**
 * Fencefall defender sprites (logical pixels, bottom-center anchor).
 *
 * drawDefender(ctx, unit, x, y) plants the sprite's feet — including the
 * contact-shadow row — on (x, y). The cached image is 40×40, inside the
 * 24–40px art range, and slots are 64×72.
 *
 * Hybrid silhouettes follow a sorted parent pair (`bolt+fire`, …). Parents
 * come from RECIPES (id + parents), then unit.parents / ingredients /
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

function paintFire(p, rank) {
  drawFlame(p, 20, 2, rank >= 4 ? 15 : 13, 'fire');
  speckle(p, 10, 18, 20, 8, 'X', 'K', 'w');
  p.hline(9, 18, 22, 'n');
  p.hline(11, 17, 18, 'N');
  p.fill(13, 20, 14, 4, 'F');
  p.px(15, 21, 'A');
  p.px(20, 22, p.frame % 2 ? 'a' : 'f');
  p.px(24, 21, 'f');
  p.px(17, 23, 'A');
  p.vline(12, 26, 5, 'N');
  p.vline(27, 26, 5, 'N');
  p.hline(12, 30, 16, 'n');
  if (rank >= 2) {
    p.px(9, 18, 'b');
    p.px(30, 18, 'b');
  }
  if (rank >= 4) p.px(20, 1, 'W');
}

function paintFrost(p, rank) {
  drawCrystal(p, 20, 3, rank >= 4 ? 20 : 18, rank >= 3 ? 7 : 6);
  p.fill(12, 22, 4, 8, 'N');
  p.fill(24, 22, 4, 8, 'N');
  p.px(13, 23, 'M');
  p.px(25, 23, 'M');
  p.hline(14, 24, 12, 'i');
  speckle(p, 14, 26, 12, 5, 'I', 'K', 'i');
  p.px(16, 27, 'l');
  p.px(23, 28, 'L');
  if (rank >= 2) {
    p.px(12, 22, 'b');
    p.px(27, 22, 'b');
  }
}

function paintLightning(p, rank) {
  drawCoils(p, 19, 8, rank >= 4 ? 5 : 4, 4);
  drawSparks(p, [[19, 4], [16, 6], [23, 5], [14, 9], [25, 12]]);
  p.px(20, 3, p.frame % 2 ? 'W' : 'Z');
  speckle(p, 13, 26, 14, 5, 'X', 'V', 'w');
  p.hline(14, 26, 12, 'U');
  p.px(16, 28, 'Z');
  p.px(23, 29, 'v');
  if (rank >= 3) p.px(19, 2, 'h');
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
  drawBow(p, 'A', 'f', 'F', 'b', 'R');
  drawFlame(p, 20, 2, 12, 'fire');
  p.fill(18, 22, 4, 3, 'F');
  p.px(19, 23, p.frame % 2 ? 'a' : 'A');
  p.px(15, 25, 'k');
  p.px(24, 28, 'F');
  drawWinch(p, rank);
}

function paintHailSpike(p, rank) {
  drawBow(p, 'l', 'L', 'I', 'E', 'i');
  drawCrystal(p, 20, 2, 14, 3);
  p.px(15, 21, 'W');
  p.px(25, 24, 'l');
  p.px(17, 28, 'L');
  p.px(22, 26, 'I');
  if (rank >= 2) p.hline(14, 22, 12, 'l');
  drawWinch(p, rank);
}

function paintStormLance(p, rank) {
  drawBow(p, 'u', 'U', 'B', 'Z', 'N');
  const shift = p.frame % 2;
  drawZig(p, [[20, 3], [23, 6], [16, 9], [22, 12 + shift], [18, 16]], 'Z', 'W');
  p.fill(15, 24, 10, 4, 'V');
  p.px(17, 25, 'v');
  p.px(22, 26, p.frame === 2 ? 'z' : 'Z');
  drawSparks(p, [[14, 18], [26, 18], [20, 2]]);
  if (rank >= 4) p.px(20, 1, 'W');
}

function paintVenomSpine(p, rank) {
  drawBow(p, 'Q', 'g', 'G', 'o', 'R');
  drawFlask(p, 18, 1, 'g', 'q');
  p.px(16, 12, 'G');
  p.px(23, 13, 'Q');
  p.px(15, 14, 'g');
  p.px(24, 15, 'q');
  p.px(20, 30, p.frame % 2 ? 'Q' : 'g');
  p.px(21, 29, 'G');
  if (rank >= 3) p.px(14, 20, 'q');
}

function paintSignalShot(p, rank) {
  drawBow(p, 'Y', 'r', 'R', 'b', 'r');
  drawQuarrel(p, 'H', 'n', 0);
  drawFlag(p, 26, 8, 8, 12);
  p.vline(25, 6, 18, 'H');
  p.px(25, 5, 'h');
  p.fill(15, 24, 3, 3, 't');
  p.px(16, 25, 'E');
  if (rank >= 4) p.hline(12, 17, 16, 'H');
}

function paintSteamVent(p, rank) {
  drawCrystal(p, 20, 4, 8, 3);
  oval(p, 20, 22, 12, 6, 'B');
  oval(p, 20, 23, 9, 4, 'U');
  p.fill(16, 20, 8, 4, 'F');
  p.px(18, 21, 'A');
  p.px(22, 22, p.frame % 2 ? 'a' : 'f');
  drawFlame(p, 20, 1, 6, 'steam');
  p.hline(8, 18, 24, 'b');
  p.fill(11, 27, 3, 3, 'N');
  p.fill(26, 27, 3, 3, 'N');
  p.px(14, 24, 'l');
  p.px(26, 23, 'L');
  if (rank >= 3) p.px(20, 16, 'W');
}

function paintPlasmaBrazier(p, rank) {
  speckle(p, 10, 12, 20, 18, 'X', 'V', 'w');
  p.fill(14, 16, 12, 10, 'F');
  p.hline(13, 15, 14, 'U');
  p.hline(13, 26, 14, 'u');
  drawCoils(p, 19, 17, 2, 4);
  drawFlame(p, 20, 4, rank >= 4 ? 12 : 10, 'plasma');
  p.vline(12, 16, 10, 'b');
  p.vline(27, 16, 10, 'b');
  drawSparks(p, [[14, 14], [26, 13], [20, 3]]);
  p.px(16, 20, 'z');
  p.px(23, 22, 'Z');
}

function paintBlightKiln(p, rank) {
  oval(p, 18, 22, 9, 7, 'X');
  oval(p, 18, 23, 6, 4, 'G');
  p.fill(14, 21, 8, 3, 'g');
  drawFlame(p, 16, 6, 12, 'green');
  p.fill(10, 12, 4, 8, 'x');
  p.vline(11, 8, 6, 'o');
  p.hline(24, 20, 6, 'U');
  p.px(29, 19, 'u');
  p.px(30, 18, p.frame % 2 ? 'Q' : 'g');
  p.px(29, 21, 'q');
  p.px(12, 16, 'm');
  p.px(13, 15, 'Y');
  if (rank >= 3) p.px(18, 24, 'q');
  if (rank >= 4) p.px(15, 4, 'W');
}

function paintWarBeacon(p, rank) {
  p.vline(11, 3, 28, 'R');
  p.vline(12, 4, 26, 'r');
  p.fill(10, 2, 4, 3, 'A');
  p.px(11, 1, p.frame % 2 ? 'W' : 'a');
  drawFlag(p, 14, 7, 16, 16);
  drawFlame(p, 22, 2, 8, 'fire');
  p.hline(14, 7, 16, 'f');
  p.px(16, 8, 'A');
  p.px(26, 8, 'a');
  p.fill(14, 24, 5, 3, 'B');
  p.px(16, 25, 'H');
  if (rank >= 4) p.px(12, 1, 'h');
}

function paintPrismCoil(p, rank) {
  drawCrystal(p, 20, 4, 22, rank >= 3 ? 8 : 7);
  p.hline(12, 12, 16, 'U');
  p.hline(13, 13, 14, 'u');
  p.hline(12, 20, 16, 'U');
  p.hline(13, 21, 14, 'b');
  drawSparks(p, [[12, 8], [28, 10], [14, 18], [27, 22], [20, 2]]);
  p.vline(20, 2, 3, 'n');
  p.px(19, 16, 'Z');
  p.px(21, 17, p.frame === 1 ? 'W' : 'z');
}

function paintRimeUrn(p, rank) {
  drawFlask(p, 18, 6, 'g', 'l');
  drawCrystal(p, 12, 4, 10, 3);
  drawCrystal(p, 27, 5, 9, 3);
  p.hline(14, 12, 10, 'l');
  p.px(16, 13, 'W');
  p.px(22, 14, 'L');
  p.px(19, 9, 'I');
  if (rank >= 2) {
    p.px(14, 16, 'q');
    p.px(23, 18, 'L');
  }
  if (rank >= 4) p.px(20, 8, 'W');
}

function paintWardBell(p, rank) {
  p.vline(20, 2, 4, 'n');
  p.fill(18, 2, 4, 2, 'H');
  const bellRows = 16;
  for (let i = 0; i < bellRows; i++) {
    const t = i / (bellRows - 1);
    let half = 2;
    if (t >= 0.2 && t < 0.72) half = 2 + Math.round(((t - 0.2) / 0.52) * 6);
    else if (t >= 0.72) half = 8 + Math.round(((t - 0.72) / 0.28) * 2);
    const y = 6 + i;
    const color = t < 0.16 ? 'l' : t < 0.55 ? 'L' : t < 0.82 ? 'i' : 'I';
    p.hline(20 - half, y, half * 2 + 1, color);
    p.px(20 - Math.max(0, half - 2), y, t > 0.3 && (i + p.frame) % 4 === 0 ? 'W' : 'l');
    if (t > 0.82) {
      p.px(20 - half - 1, y, 'n');
      p.px(20 + half + 1, y, 'n');
    }
  }
  p.hline(10, 21, 21, 'n');
  p.vline(20, 16, 4, 'B');
  p.px(20, 20, 'H');
  drawFlag(p, 26, 8, 8, 10);
  p.hline(8, 20, 6, 'D');
  p.px(8, 19, 't');
  if (rank >= 3) p.px(14, 16, 'h');
  if (rank >= 4) p.hline(12, 19, 16, 'b');
}

function paintAcidArc(p, rank) {
  drawFlask(p, 18, 8, 'g', 'q');
  drawCoils(p, 8, 14, 2, 4);
  drawCoils(p, 30, 14, 2, 4);
  const sag = p.frame % 2;
  drawZig(p, [[10, 12], [16, 8], [20, 6 - sag], [24, 8], [30, 12]], 'Q', 'z');
  p.px(20, 5, p.frame === 0 ? 'W' : 'Z');
  p.fill(16, 26, 6, 2, 'U');
  if (rank >= 3) p.px(14, 20, 'Z');
  if (rank >= 4) p.px(24, 18, 'h');
}

function paintRelayStandard(p, rank) {
  p.vline(14, 4, 27, 'n');
  p.vline(15, 5, 25, 'N');
  for (let i = 0; i < 8; i++) {
    const y = 6 + i * 3;
    const dir = (i + p.frame) % 2 === 0 ? 1 : -1;
    p.px(14 + dir * 2, y, 'u');
    p.px(15 + dir * 2, y, 'U');
    p.px(14, y + 1, 'Z');
  }
  p.fill(12, 2, 5, 3, 'H');
  p.px(14, 1, p.frame % 2 ? 'W' : 'Z');
  drawFlag(p, 18, 8, 12, 12);
  p.fill(12, 24, 6, 5, 'V');
  p.px(14, 26, 'v');
  p.px(16, 25, 'Z');
  drawSparks(p, [[18, 6], [28, 10], [14, 2]]);
  if (rank >= 4) p.px(15, 0, 'h');
}

function paintPlagueAltar(p, rank) {
  p.vline(20, 2, 3, 'n');
  for (let i = 0; i < 4; i++) {
    const y = 5 + i * 3;
    p.px(19, y, 'N');
    p.px(20, y, 'M');
    p.px(21, y, 'N');
    p.px(20, y + 1, 'n');
  }
  oval(p, 20, 22, 7, 5, 'G');
  oval(p, 20, 23, 5, 3, 'g');
  p.hline(15, 19, 10, 'o');
  p.px(17, 21, 'q');
  p.px(22, 22, p.frame % 2 ? 'Q' : 'g');
  drawFlame(p, 20, 8, 7, 'green');
  drawFlag(p, 26, 12, 8, 12);
  p.fill(12, 24, 4, 3, 'B');
  p.px(13, 25, 'H');
  if (rank >= 2) p.px(16, 26, 'm');
  if (rank >= 4) p.px(20, 7, 'W');
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
