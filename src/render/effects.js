/**
 * Fencefall combat feedback visuals.
 *
 * createEffects() -> {ingest(events), update(dt), draw(ctx, {reducedMotion}), clear()}
 * Draw in logical arena pixels. The renderer owns the view transform.
 * Call ingest, then update(seconds), then draw. Do not ingest during draw.
 * This module never reads or advances gameplay RNG.
 *
 * Event names: shot, hit, kill, fence_hit, merge, draft, victory, defeat, ui.
 * Optional fields: x, y, targetX, targetY, damage, crit, towerType, rank, splash,
 * chain, pierce, attack, points, stacks, slot/slotIndex/fromIndex/toIndex, time.
 * Missing fields are skipped. emit() copies payload after `type`, so a payload
 * `type` of bolt/fire/frost/lightning/poison/support/hero/burn/slow/stun/brittle
 * is recovered as shot, hit, or status when position or damage is present.
 * Reduced motion skips decorative particle trails and keeps a short impact mark,
 * rings at their start size, crits, and numbers. A critical mark is a longer gold
 * plus; a normal mark is a shorter plus. Traveling debris is dropped.
 * A plain shot is a short arrow. A pierce shot is a thin needle along the aim.
 * A splash burst is a hollow ring. A chain jump is a kinked bolt. Other impacts
 * stay starbursts with a damage number. A critical hit adds one gold diamond
 * flash and a thicker ring; a normal hit does not. A fence hit is a red bite in the rail.
 */
import { ARENA, slotGeometry } from '../shared.js';

const MAX_PARTICLES = 140;
const MAX_FLOATERS = 18;
const MAX_RINGS = 16;
const SCAN_LIMIT = 400;

const LIMITS = Object.freeze({
  shot: 8,
  hit: 12,
  kill: 8,
  fence_hit: 4,
  merge: 3,
  draft: 2,
  victory: 1,
  defeat: 1,
  ui: 4,
  status: 6,
  boss: 1,
});

const PALETTES = Object.freeze({
  bolt: { core: '#fff6d2', hot: '#ffe56a', mid: '#e2a63a', dim: '#7a4e16' },
  fire: { core: '#fff1c9', hot: '#ff9a3c', mid: '#e23b16', dim: '#6a160e' },
  frost: { core: '#f4fdff', hot: '#b9f3ff', mid: '#3ec4e0', dim: '#1c5f8a' },
  lightning: { core: '#ffffff', hot: '#d5e4ff', mid: '#7aa2ff', dim: '#2a3e98' },
  poison: { core: '#f2ffc8', hot: '#b6e84a', mid: '#4f8f1e', dim: '#1e320c' },
  support: { core: '#fff8e6', hot: '#f0cb72', mid: '#5ec8b0', dim: '#1f564c' },
  hero: { core: '#fff8e8', hot: '#f0cb72', mid: '#e09a3a', dim: '#6d3c12' },
  neutral: { core: '#f2f5f4', hot: '#d5ddd8', mid: '#8aa097', dim: '#3d524c' },
  brittle: { core: '#fff8ee', hot: '#f0cb72', mid: '#d7a25a', dim: '#6a4a28' },
  fence: { core: '#fff2dd', hot: '#e7c89a', mid: '#9b7951', dim: '#5c4128' },
  kill: { core: '#fff4ea', hot: '#ffd0a8', mid: '#d07048', dim: '#5a241c' },
  victory: { core: '#fff8dc', hot: '#f0cb72', mid: '#8fd18a', dim: '#2f6a48' },
  defeat: { core: '#ffd0c8', hot: '#e07068', mid: '#a33b3b', dim: '#4a1c22' },
  ui: { core: '#e7eef0', hot: '#c5d4d8', mid: '#7f989e', dim: '#31464c' },
  draft: { core: '#fff6d4', hot: '#f0cb72', mid: '#d7a441', dim: '#6a4a16' },
  boss: { core: '#ffe8ff', hot: '#e2a0ea', mid: '#8d3eae', dim: '#3c1848' },
  heal: { core: '#f3fff8', hot: '#9be7c4', mid: '#3eae86', dim: '#145445' },
});

const HYBRID_PALETTES = Object.freeze([
  { core: '#fff0e0', hot: '#ffb15a', mid: '#e25a3a', dim: '#6a2418' },
  { core: '#f3fbff', hot: '#9fd4ff', mid: '#4a78e0', dim: '#1c2a66' },
  { core: '#f4ffe4', hot: '#c6e86a', mid: '#3e9a8a', dim: '#14322c' },
  { core: '#fff4f8', hot: '#f0a0c8', mid: '#c45a8a', dim: '#5a2040' },
  { core: '#f3f6ff', hot: '#c9d4ff', mid: '#6a7ad0', dim: '#242848' },
  { core: '#fff8e8', hot: '#e6c36a', mid: '#c47a3a', dim: '#4a3014' },
  { core: '#eefcf6', hot: '#8ee0c0', mid: '#2a9a78', dim: '#12382c' },
  { core: '#fff2ea', hot: '#ffc2a0', mid: '#d06040', dim: '#4a2018' },
]);

const ELEMENT_BEHAVIOR = Object.freeze({
  bolt: 'bolt',
  fire: 'fire',
  burn: 'fire',
  frost: 'frost',
  slow: 'frost',
  lightning: 'lightning',
  stun: 'lightning',
  brittle: 'brittle',
  poison: 'poison',
  support: 'support',
  aura: 'support',
  heal: 'support',
  buff: 'support',
  hero: 'hero',
});

const FEEDBACK = new Set([
  'shot', 'hit', 'kill', 'fence_hit', 'merge', 'draft',
  'victory', 'defeat', 'ui', 'status', 'boss',
]);

// Full-motion shapes. Reduced motion does not draw these; a short impact stands in
// when the particle was the hit or shot itself.
const REDUCED_TRAILS = new Set(['spark', 'mote', 'orbit', 'arc', 'streak', 'needle', 'jump', 'burst']);

const ALIAS = Object.freeze({
  fencehit: 'fence_hit',
  fence_damage: 'fence_hit',
  fence_attack: 'fence_hit',
  death: 'kill',
  enemy_killed: 'kill',
  killed: 'kill',
  merged: 'merge',
  merge_units: 'merge',
  draft_open: 'draft',
  win: 'victory',
  lose: 'defeat',
  lost: 'defeat',
  click: 'ui',
  button: 'ui',
  boss_spawn: 'boss',
  boss_enter: 'boss',
  boss_enrage: 'boss',
});

const CRIT_TYPES = new Set(['crit', 'critical', 'critical_hit']);
const SKIP_TAG = new Set(['crit', 'critical', 'splash', 'pierce', 'chain', 'aoe']);

const GLYPHS = Object.freeze({
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  '+': ['000', '010', '111', '010', '000'],
});

const STYLE = Object.freeze({
  bolt: { jitter: 3, sparks: 4, speed: 78, gravity: 0, up: false, arc: true },
  fire: { jitter: 7, sparks: 6, speed: 48, gravity: -30, up: true, arc: true },
  frost: { jitter: 2, sparks: 5, speed: 30, gravity: 0, up: false, arc: true },
  lightning: { jitter: 16, sparks: 3, speed: 96, gravity: 0, up: false, arc: true },
  poison: { jitter: 2, sparks: 5, speed: 26, gravity: 110, up: false, arc: false },
  support: { jitter: 0, sparks: 0, speed: 0, gravity: 0, up: false, arc: false, ring: true },
  hero: { jitter: 4, sparks: 4, speed: 64, gravity: 16, up: false, arc: true },
  brittle: { jitter: 2, sparks: 4, speed: 38, gravity: 20, up: false, arc: false },
  neutral: { jitter: 3, sparks: 4, speed: 44, gravity: 0, up: false, arc: true },
  hybrid: { jitter: 6, sparks: 5, speed: 52, gravity: 0, up: false, arc: true },
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(n) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function rand01(seed) {
  return mix(seed) / 4294967296;
}

function saneX(x) {
  return x >= -80 && x <= ARENA.width + 80;
}

function saneY(y) {
  return y >= -120 && y <= ARENA.height + 120;
}

function readTags(event) {
  if (Array.isArray(event.tags)) return event.tags;
  if (typeof event.tags === 'string') return [event.tags];
  return [];
}

function isCrit(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.crit === true || event.critical === true || event.isCrit === true) return true;
  if (event.crit === 1 || event.critical === 1) return true;
  if (typeof event.crit === 'number' && Number.isFinite(event.crit) && event.crit > 1) return true;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const name = normName(tags[i]);
    if (name === 'crit' || name === 'critical') return true;
  }
  return false;
}

function readDamage(event) {
  const direct = finite(event.damage);
  if (direct != null) return direct;
  return finite(event.amount);
}

function readHeal(event, hint) {
  const direct = finite(event.heal);
  if (direct != null && direct > 0) return Math.min(direct, 9999);
  const alt = finite(event.healing);
  if (alt != null && alt > 0) return Math.min(alt, 9999);
  if (hint === 'heal' || hint === 'buff') {
    const amount = finite(event.amount);
    if (amount != null && amount > 0) return Math.min(amount, 9999);
    const damage = finite(event.damage);
    if (damage != null && damage > 0) return Math.min(damage, 9999);
  }
  return null;
}

function readRank(event) {
  const n = finite(event.rank);
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded > 4) return 4;
  if (rounded < 1) return null;
  return rounded;
}

function readSplash(event) {
  if (event.splash === true) return 18;
  const n = finite(event.splash);
  if (n != null && n > 0) return Math.max(8, Math.min(84, n));
  if (n != null) return 0;
  const attack = normName(event.attack || event.impact || '');
  if (attack === 'splash' || attack === 'aoe') return 16;
  return 0;
}

function readCount(value, max) {
  if (value === true) return 1;
  const n = finite(value);
  if (n == null || n <= 0) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function deliveryName(value) {
  const name = normName(value);
  if (name === 'pierce') return 'pierce';
  if (name === 'splash' || name === 'aoe') return 'splash';
  if (name === 'chain') return 'chain';
  return '';
}

// One event draws one shape. Attack wins, then a single mechanic field or tag.
// Bolt, fire, and lightning are the base pierce, splash, and chain towers.
function readDelivery(event, type) {
  const named = deliveryName(event.attack) || deliveryName(event.impact) || deliveryName(event.impactType);
  if (named) return named;
  let pierce = readCount(event.pierce, 8) > 0;
  const splashN = finite(event.splash);
  let splash = event.splash === true || (splashN != null && splashN > 0);
  let chain = readCount(event.chain, 8) > 0;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const flag = deliveryName(tags[i]);
    if (flag === 'pierce') pierce = true;
    else if (flag === 'splash') splash = true;
    else if (flag === 'chain') chain = true;
  }
  if (!pierce && !splash && Array.isArray(event.points) && event.points.length > 0) chain = true;
  const flags = (pierce ? 1 : 0) + (splash ? 1 : 0) + (chain ? 1 : 0);
  if (flags === 1) {
    if (pierce) return 'pierce';
    if (splash) return 'splash';
    return 'chain';
  }
  if (flags > 1) {
    if (type === 'shot' && pierce) return 'pierce';
    if (splash && type !== 'shot') return 'splash';
    if (chain) return 'chain';
    if (splash) return 'splash';
    return 'pierce';
  }
  if (type !== 'shot' && type !== 'hit') return '';
  const element = normName(event.towerType || event.unitType || event.sourceType || event.attackerType || '');
  if (element === 'bolt') return 'pierce';
  if (element === 'fire') return 'splash';
  if (element === 'lightning') return 'chain';
  return '';
}

function readElement(event, hint, feedbackType) {
  const statusName = normName(event.status) || normName(event.statusType);
  if (feedbackType === 'status' && statusName) return statusName;
  const keys = ['towerType', 'unitType', 'sourceType', 'attackerType', 'damageType', 'element'];
  for (let i = 0; i < keys.length; i++) {
    const name = normName(event[keys[i]]);
    if (name) return name;
  }
  if (statusName) return statusName;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const name = normName(tags[i]);
    if (!name || SKIP_TAG.has(name)) continue;
    return name;
  }
  return hint || '';
}

function behaviorFrom(element) {
  const key = normName(element);
  if (ELEMENT_BEHAVIOR[key]) return ELEMENT_BEHAVIOR[key];
  if (!key) return 'neutral';
  return 'hybrid';
}

function paletteFor(element, behavior) {
  if (behavior === 'hybrid') {
    const index = hashString(normName(element) || 'hybrid') % HYBRID_PALETTES.length;
    return HYBRID_PALETTES[index];
  }
  return PALETTES[behavior] || PALETTES.neutral;
}

function readLooseXY(event) {
  let x = finite(event.x);
  let y = finite(event.y);
  if (x == null) x = finite(event.fx);
  if (y == null) y = finite(event.fy);
  if ((x == null || y == null) && event.position && typeof event.position === 'object') {
    if (x == null) x = finite(event.position.x);
    if (y == null) y = finite(event.position.y);
  }
  return {
    x: x != null && saneX(x) ? x : null,
    y: y != null && saneY(y) ? y : null,
  };
}

function readTarget(event) {
  let x = finite(event.targetX);
  let y = finite(event.targetY);
  if (x == null) x = finite(event.tx);
  if (y == null) y = finite(event.ty);
  if (x == null) x = finite(event.toX);
  if (y == null) y = finite(event.toY);
  if (x == null || y == null || !saneX(x) || !saneY(y)) return null;
  return { x, y };
}

function readSlot(event, type) {
  const keys = type === 'shot'
    ? ['fromIndex', 'sourceSlot', 'slot', 'slotIndex']
    : type === 'merge'
      ? ['toIndex', 'targetSlot', 'slot', 'slotIndex', 'fromIndex', 'sourceSlot']
      : ['slot', 'slotIndex', 'toIndex', 'targetSlot'];
  for (let i = 0; i < keys.length; i++) {
    const value = event[keys[i]];
    if (Number.isInteger(value) && value >= 0 && value < 10) return value;
  }
  return null;
}

function readPoints(event) {
  const sources = [event.points, event.hops, event.chainPoints];
  const out = [];
  for (let s = 0; s < sources.length; s++) {
    const list = sources[s];
    if (!Array.isArray(list)) continue;
    const limit = Math.min(list.length, 12);
    for (let i = 0; i < limit && out.length < 6; i++) {
      const point = list[i];
      if (!point || typeof point !== 'object') continue;
      const x = finite(point.x);
      const y = finite(point.y);
      if (x == null || y == null || !saneX(x) || !saneY(y)) continue;
      out.push({ x, y });
    }
    if (out.length) break;
  }
  return out;
}

function resolveKind(event) {
  const raw = normName(event.type);
  const hinted = normName(event.eventType || event.event);
  const candidates = [];
  if (raw) candidates.push(raw);
  if (hinted && hinted !== raw) candidates.push(hinted);
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    if (CRIT_TYPES.has(name)) return { type: 'hit', forceCrit: true, hint: '' };
    const aliased = ALIAS[name] || name;
    if (FEEDBACK.has(aliased)) return { type: aliased, forceCrit: false, hint: '' };
  }
  for (let i = 0; i < candidates.length; i++) {
    if (ELEMENT_BEHAVIOR[candidates[i]]) return { type: '', forceCrit: false, hint: candidates[i] };
  }
  return null;
}

function slotPoint(event, type) {
  const index = readSlot(event, type);
  if (index == null) return null;
  const slot = slotGeometry(index);
  return { x: slot.x, y: slot.y, fromSlot: true };
}

/**
 * Pure description of one feedback event. Returns null when the event is not visual/audio feedback.
 * @param {object} event
 */
export function describeFeedback(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const resolved = resolveKind(event);
  if (!resolved) return null;
  const element = readElement(event, resolved.hint, resolved.type);
  const behavior = behaviorFrom(element);
  let type = resolved.type;
  const target = readTarget(event);
  const damage = readDamage(event);
  if (!type) {
    const hint = resolved.hint;
    if (hint === 'heal' || hint === 'buff' || hint === 'aura') type = 'status';
    else if ((damage != null && damage > 0) || isCrit(event)) type = 'hit';
    else if (target) type = 'shot';
    else type = 'status';
  }
  if (!FEEDBACK.has(type)) return null;
  const loose = readLooseXY(event);
  let position = loose.x != null && loose.y != null ? { x: loose.x, y: loose.y, fromSlot: false } : null;
  if (!position) position = slotPoint(event, type);
  const cueName = normName(event.name || event.tone || event.id || '');
  const cue = type === 'ui' && (cueName === 'error' || cueName === 'invalid' || cueName === 'cancel' || event.ok === false)
    ? 'error'
    : (type === 'ui' ? 'ui' : '');
  return {
    type,
    element,
    behavior,
    crit: resolved.forceCrit || isCrit(event),
    damage,
    heal: readHeal(event, resolved.hint || element),
    position,
    x: loose.x != null ? loose.x : (position ? position.x : null),
    y: loose.y != null ? loose.y : (position ? position.y : null),
    target,
    rank: readRank(event),
    splash: readSplash(event),
    chain: readCount(event.chain, 8),
    pierce: readCount(event.pierce, 8),
    delivery: readDelivery(event, type),
    stacks: readCount(event.stacks, 8),
    points: readPoints(event),
    time: finite(event.time) ?? 0,
    cue,
  };
}

function asList(events) {
  if (Array.isArray(events)) return events;
  if (events && typeof events === 'object' && (typeof events.type === 'string' || typeof events.event === 'string' || typeof events.eventType === 'string')) {
    return [events];
  }
  return [];
}

/**
 * Cap and describe a shared event batch. Does not mutate the input array.
 * When `limits` is provided, only its own keys are kept.
 */
export function collectFeedback(events, limits) {
  const list = asList(events);
  if (!list.length) return [];
  const start = Math.max(0, list.length - SCAN_LIMIT);
  const groups = new Map();
  for (let i = start; i < list.length; i++) {
    const desc = describeFeedback(list[i]);
    if (!desc) continue;
    let bucket = groups.get(desc.type);
    if (!bucket) {
      bucket = [];
      groups.set(desc.type, bucket);
    }
    bucket.push(desc);
  }
  const table = limits || LIMITS;
  const out = [];
  for (const [type, bucket] of groups) {
    if (!Object.prototype.hasOwnProperty.call(table, type)) continue;
    const cap = table[type];
    if (!Number.isFinite(cap) || cap <= 0) continue;
    if (type === 'hit' || type === 'kill') {
      bucket.sort((a, b) => Number(b.crit) - Number(a.crit) || (b.damage || 0) - (a.damage || 0));
    }
    const count = Math.min(bucket.length, Math.floor(cap));
    for (let i = 0; i < count; i++) out.push(bucket[i]);
  }
  return out;
}

function formatDamage(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (!(rounded > 0)) return '';
  const capped = Math.min(rounded, 9999);
  return Number.isInteger(capped) ? String(capped) : capped.toFixed(1);
}

function fade(item) {
  const max = item.maxLife > 0 ? item.maxLife : 1;
  const t = item.life / max;
  if (!(t > 0)) return 0;
  return t > 0.8 ? 1 : t / 0.8;
}

function fallbackPoint(type) {
  if (type === 'fence_hit' || type === 'defeat') return { x: ARENA.width / 2, y: ARENA.fenceY };
  if (type === 'merge') return { x: ARENA.width / 2, y: ARENA.frontY - 24 };
  if (type === 'draft') return { x: ARENA.width / 2, y: 76 };
  if (type === 'victory') return { x: ARENA.width / 2, y: 220 };
  if (type === 'boss') return { x: ARENA.width / 2, y: 84 };
  return null;
}

function visualPoint(desc) {
  if (desc.position) {
    if (desc.position.fromSlot && (desc.type === 'shot' || desc.type === 'merge' || desc.type === 'status')) {
      return { x: desc.position.x, y: desc.position.y - 14 };
    }
    return { x: desc.position.x, y: desc.position.y };
  }
  return fallbackPoint(desc.type);
}

// Defenders sit below the fence and fire toward the field, so a shot with no
// target aims up. Eight directions keep the arrow on whole pixels.
function shotOctant(desc, point) {
  let dx = 0;
  let dy = point.y >= ARENA.fenceY - 4 ? -1 : 1;
  if (desc.target) {
    const tdx = desc.target.x - point.x;
    const tdy = desc.target.y - point.y;
    if (Math.abs(tdx) + Math.abs(tdy) >= 4) {
      dx = tdx;
      dy = tdy;
    }
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let ux = 0;
  let uy = 0;
  if (adx >= ady * 0.45) ux = dx < 0 ? -1 : 1;
  if (ady >= adx * 0.45) uy = dy < 0 ? -1 : 1;
  if (ux === 0 && uy === 0) uy = dy < 0 ? -1 : 1;
  return { x: ux, y: uy };
}

export function createEffects() {
  const particles = [];
  const floaters = [];
  const rings = [];
  let salt = 1;

  function nextSeed(desc, index) {
    salt = (salt + 0x6d2b79f5) >>> 0;
    const x = Math.round((desc.x ?? desc.position?.x ?? 0) * 4);
    const y = Math.round((desc.y ?? desc.position?.y ?? 0) * 4);
    const t = Math.round((desc.time || 0) * 1000);
    return mix(salt ^ Math.imul(t, 0x9e3779b1) ^ Math.imul(x, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35) ^ (index * 17));
  }

  function pushParticle(particle) {
    if (particle.x != null && !Number.isFinite(particle.x)) return;
    if (particle.y != null && !Number.isFinite(particle.y)) return;
    particles.push(particle);
  }

  function pushRing(x, y, radius, grow, color, life, weight) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(radius > 0)) return;
    rings.push({
      x: Math.round(x),
      y: Math.round(y),
      r: radius,
      r0: radius,
      vr: grow,
      color,
      life,
      maxLife: life,
      weight: weight > 1 ? 2 : 1,
    });
  }

  function pushStreak(x, y, ux, uy, length, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if ((ux | 0) === 0 && (uy | 0) === 0) return;
    pushParticle({
      kind: 'streak',
      x: Math.round(x),
      y: Math.round(y),
      ux: ux | 0,
      uy: uy | 0,
      length: Math.max(6, Math.min(16, length | 0)),
      shaft: palette.hot,
      head: crit ? '#ffe56a' : palette.core,
      edge: palette.dim,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  // Pierce is a 1px shaft with a tip. It runs backward through the origin,
  // so it does not read as the fletched arrow used for a plain shot.
  function pushNeedle(x, y, ux, uy, length, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if ((ux | 0) === 0 && (uy | 0) === 0) return;
    pushParticle({
      kind: 'needle',
      x: Math.round(x),
      y: Math.round(y),
      ux: ux | 0,
      uy: uy | 0,
      length: Math.max(10, Math.min(18, length | 0)),
      shaft: palette.hot,
      head: crit ? '#ffe56a' : palette.core,
      edge: palette.dim,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  // Splash is a hollow ring. The radius stays small so one burst is a few pixels.
  function pushBurst(x, y, radius, palette, life, crit) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'burst',
      x: Math.round(x),
      y: Math.round(y),
      radius: Math.max(5, Math.min(9, radius | 0)),
      color: palette.hot,
      core: palette.core,
      edge: palette.mid,
      shaft: palette.hot,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  function pushJump(points, palette, life, mark) {
    if (!points || points.length < 2) return;
    const clean = [];
    for (let i = 0; i < points.length && clean.length < 4; i++) {
      const point = points[i];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      clean.push({ x: point.x, y: point.y });
    }
    if (clean.length < 2) return;
    const placed = !!(mark && Number.isFinite(mark.x) && Number.isFinite(mark.y));
    pushParticle({
      kind: 'jump',
      x: clean[0].x,
      y: clean[0].y,
      points: clean,
      color: palette.core,
      edge: palette.hot,
      shaft: palette.hot,
      core: palette.core,
      crit: !!(mark && mark.crit),
      trail: true,
      markWhenReduced: placed,
      markX: placed ? mark.x : null,
      markY: placed ? mark.y : null,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  // Two hard kinks, at least 5px off the straight line, so a jump is not a needle.
  function kinkedJump(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (!(dist >= 8)) {
      return [
        { x: x1 - 9, y: y1 + 3 },
        { x: x1 - 3, y: y1 - 4 },
        { x: x1 + 3, y: y1 + 2 },
        { x: x1 + 9, y: y1 - 7 },
      ];
    }
    const px = -dy / dist;
    const py = dx / dist;
    const amp = Math.min(9, Math.max(5, dist * 0.18));
    return [
      { x: x0, y: y0 },
      { x: x0 + dx * 0.33 + px * amp, y: y0 + dy * 0.33 + py * amp },
      { x: x0 + dx * 0.66 - px * amp, y: y0 + dy * 0.66 - py * amp },
      { x: x1, y: y1 },
    ];
  }

  function aimedJump(x, y, ux, uy) {
    const px = -uy;
    const py = ux;
    const len = 12;
    return [
      { x, y },
      { x: x + ux * 4 + px * 4, y: y + uy * 4 + py * 4 },
      { x: x + ux * 8 - px * 4, y: y + uy * 8 - py * 4 },
      { x: x + ux * len, y: y + uy * len },
    ];
  }

  // Crit-only. One particle, so it stays inside the particle cap. The diamond
  // is not the plus, needle, hollow ring, or kinked bolt used by other hits.
  function pushFlash(x, y, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'flash',
      x: Math.round(x),
      y: Math.round(y),
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushImpact(x, y, arm, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'impact',
      x: Math.round(x),
      y: Math.round(y),
      arm: Math.max(3, Math.min(7, arm | 0)),
      color: palette.hot,
      core: palette.core,
      crit: !!crit,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushNotch(x, y, heavy, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'notch',
      x: Math.round(x),
      y: Math.round(y),
      heavy: !!heavy,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushSpark(x, y, angle, speed, color, life, size, gravity) {
    pushParticle({
      kind: 'spark',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color,
      life,
      maxLife: life,
      gravity,
      motionOnly: true,
    });
  }

  function burst(x, y, count, speed, gravity, upward, color, life, seed, size) {
    for (let i = 0; i < count; i++) {
      const roll = rand01(seed + i * 19);
      const angle = upward
        ? -Math.PI / 2 + (roll - 0.5) * Math.PI
        : roll * Math.PI * 2;
      const varied = speed * (0.55 + rand01(seed + i * 31) * 0.7);
      pushSpark(x, y, angle, varied, color, life, size, gravity);
    }
  }

  function pushArc(x0, y0, x1, y1, color, life, jitter, seed) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
    if (Math.hypot(x1 - x0, y1 - y0) < 6) return;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const segs = Math.max(2, Math.min(8, Math.round(dist / 18)));
    const points = [{ x: x0, y: y0 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const jx = (rand01(seed + i * 13) - 0.5) * jitter;
      const jy = (rand01(seed + i * 29) - 0.5) * jitter;
      points.push({ x: x0 + (x1 - x0) * t + jx, y: y0 + (y1 - y0) * t + jy });
    }
    points.push({ x: x1, y: y1 });
    particles.push({ kind: 'arc', points, color, life, maxLife: life, trail: true, motionOnly: false });
  }

  function pushPlus(x, y, arm, color, core, life) {
    pushParticle({ kind: 'plus', x, y, arm, color, core, life, maxLife: life, motionOnly: false });
  }

  function pushBlock(x, y, w, h, color, life) {
    pushParticle({ kind: 'block', x, y, w, h, color, life, maxLife: life, motionOnly: false });
  }

  function pushPips(x, y, count, color, life) {
    if (!(count > 0)) return;
    pushParticle({
      kind: 'pips',
      x, y,
      count: Math.max(1, Math.min(4, count)),
      color,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushFloater(x, y, text, color, scale, crit, channel, life, seed) {
    if (!text) return;
    const anchorX = x;
    const anchorY = y - (channel === 'fence' ? 20 : 12);
    const amount = Number(String(text).replace('+', '')) || 0;
    const recent = findFloater(anchorX, anchorY, channel, crit);
    if (recent) {
      recent.amount = (recent.amount || 0) + amount;
      const merged = formatDamage(recent.amount);
      if (merged) recent.text = channel === 'heal' ? `+${merged}` : merged;
      recent.life = recent.maxLife;
      recent.scale = Math.max(recent.scale, scale);
      return;
    }
    const jitter = (rand01(seed) - 0.5) * 6;
    const originX = Math.round(anchorX + jitter);
    const originY = Math.round(anchorY);
    floaters.push({
      x: originX,
      y: originY,
      originX,
      originY,
      anchorX,
      anchorY,
      text,
      color,
      scale,
      crit,
      channel,
      amount,
      vy: -22,
      life,
      maxLife: life,
    });
  }

  function findFloater(x, y, channel, crit) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const floater = floaters[i];
      if (floater.channel !== channel || floater.crit !== crit) continue;
      if (floater.maxLife - floater.life > 0.12) continue;
      const ax = floater.anchorX ?? floater.originX;
      const ay = floater.anchorY ?? floater.originY;
      if (Math.abs(ax - x) <= 14 && Math.abs(ay - y) <= 14) return floater;
    }
    return null;
  }

  function showNumber(desc, x, y, seed, palette) {
    if (desc.damage != null && desc.damage > 0) {
      const text = formatDamage(desc.damage);
      const lift = desc.crit ? 16 : 4;
      pushFloater(
        x, y - lift, text,
        desc.crit ? '#ffe56a' : palette.hot,
        desc.crit ? 3 : 2,
        desc.crit,
        'hit',
        desc.crit ? 0.62 : 0.5,
        seed,
      );
      return;
    }
    if (desc.heal != null && desc.heal > 0) {
      const text = formatDamage(desc.heal);
      if (text) pushFloater(x, y, `+${text}`, PALETTES.heal.hot, 2, false, 'heal', 0.5, seed);
    }
  }

  function spawnShot(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    const aim = shotOctant(desc, point);
    const life = desc.crit ? 0.2 : 0.16;
    if (desc.delivery === 'pierce') {
      pushNeedle(point.x, point.y, aim.x, aim.y, desc.crit ? 16 : 13, palette, desc.crit, life);
      return;
    }
    if (desc.delivery === 'splash') {
      pushBurst(point.x, point.y, 6, palette, life, desc.crit);
      return;
    }
    if (desc.delivery === 'chain') {
      pushJump(aimedJump(point.x, point.y, aim.x, aim.y), palette, life, { x: point.x, y: point.y, crit: desc.crit });
      return;
    }
    pushStreak(point.x, point.y, aim.x, aim.y, desc.crit ? 14 : 10, palette, desc.crit, life);
  }

  function spawnHit(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    if (desc.delivery === 'pierce') {
      const aim = shotOctant(desc, point);
      pushNeedle(point.x, point.y, aim.x, aim.y, desc.crit ? 16 : 14, palette, desc.crit, 0.22);
    } else if (desc.delivery === 'splash') {
      const radius = desc.splash > 0 ? desc.splash : 12;
      pushRing(point.x, point.y, radius, desc.splash > 0 ? 10 : 16, palette.mid, 0.28, 2);
      pushBurst(point.x, point.y, 7, palette, 0.24, desc.crit);
    } else if (desc.delivery === 'chain') {
      const mark = { x: point.x, y: point.y, crit: desc.crit };
      if (desc.points.length) {
        const hops = Math.min(desc.points.length, desc.chain > 0 ? desc.chain : desc.points.length, 3);
        let prev = point;
        for (let i = 0; i < hops; i++) {
          const hop = desc.points[i];
          pushJump(kinkedJump(prev.x, prev.y, hop.x, hop.y), palette, 0.18, i === 0 ? mark : null);
          prev = hop;
        }
      } else if (desc.target) {
        pushJump(kinkedJump(point.x, point.y, desc.target.x, desc.target.y), palette, 0.18, mark);
      } else {
        pushJump(kinkedJump(point.x, point.y, point.x, point.y), palette, 0.18, mark);
      }
    } else {
      if (desc.splash > 0) pushRing(point.x, point.y, desc.splash, 10, palette.mid, 0.28, 2);
      pushImpact(point.x, point.y, desc.crit ? 6 : 4, palette, desc.crit, desc.crit ? 0.28 : 0.2);
      if (desc.points.length && (desc.behavior === 'lightning' || desc.chain > 0)) {
        const hops = Math.min(desc.points.length, desc.chain > 0 ? desc.chain : 1, 3);
        for (let i = 0; i < hops; i++) {
          const hop = desc.points[i];
          pushArc(point.x, point.y, hop.x, hop.y, palette.core, 0.12, desc.behavior === 'lightning' ? 10 : 4, seed + i * 9);
        }
      }
    }
    if (desc.crit) {
      pushFlash(point.x, point.y, 0.36);
      pushRing(point.x, point.y, 13, 34, '#ffe56a', 0.34, 2);
    }
    showNumber(desc, point.x, point.y, seed, palette);
    if (desc.stacks >= 2) pushPips(point.x + 8, point.y + 8, Math.min(4, desc.stacks), palette.mid, 0.36);
  }

  function spawnKill(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    pushRing(point.x, point.y, 8, 40, PALETTES.kill.hot, 0.32);
    pushPlus(point.x, point.y, 3, PALETTES.kill.core, palette.hot, 0.2);
    burst(point.x, point.y, 8, 58, 40, false, PALETTES.kill.mid, 0.34, seed, 2);
    burst(point.x, point.y, 3, 70, 0, true, palette.hot, 0.24, seed + 5, 2);
  }

  function spawnFence(desc, seed) {
    const x = desc.x != null ? desc.x : (desc.position ? desc.position.x : ARENA.width / 2);
    const y = ARENA.fenceY;
    const damage = desc.damage != null && desc.damage > 0 ? desc.damage : 0;
    pushNotch(x, y, damage >= 12, 0.46);
    const text = formatDamage(damage);
    if (text) pushFloater(x, y, text, '#ffb4a8', 2, false, 'fence', 0.52, seed);
  }

  function spawnMerge(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    pushRing(point.x, point.y, 6, 26, palette.core, 0.42);
    pushRing(point.x, point.y, 12, 18, palette.mid, 0.5);
    pushPlus(point.x, point.y, 4, palette.hot, palette.core, 0.3);
    pushBlock(point.x, point.y, 4, 4, palette.core, 0.12);
    for (let i = 0; i < 8; i++) {
      const angle = rand01(seed + i * 11) * Math.PI * 2;
      pushParticle({
        kind: 'orbit',
        cx: point.x,
        cy: point.y,
        angle,
        radius: 12 + rand01(seed + i * 7) * 10,
        spin: (rand01(seed + i) < 0.5 ? -1 : 1) * (5 + rand01(seed + i * 3) * 3),
        radial: -26,
        x: point.x,
        y: point.y,
        size: 2,
        color: i % 2 ? palette.hot : palette.core,
        life: 0.48,
        maxLife: 0.48,
        motionOnly: true,
      });
    }
    if (desc.rank != null) pushPips(point.x, point.y - 16, desc.rank, palette.hot, 0.62);
  }

  function spawnDraft(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 10, 8, PALETTES.draft.mid, 0.4);
    for (let i = 0; i < 3; i++) {
      pushBlock(point.x + (i - 1) * 8, point.y, 3, 3, i === 1 ? PALETTES.draft.hot : PALETTES.draft.core, 0.46);
    }
  }

  function spawnVictory(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 12, 22, PALETTES.victory.hot, 0.6);
    pushParticle({ kind: 'glowline', y: ARENA.fenceY, color: PALETTES.victory.hot, broken: false, life: 0.7, maxLife: 0.7, motionOnly: false });
    for (let i = 0; i < 8; i++) {
      const x = 28 + rand01(seed + i * 17) * (ARENA.width - 56);
      pushParticle({
        kind: 'mote',
        x,
        y: ARENA.fenceY - rand01(seed + i) * 16,
        vx: (rand01(seed + i * 5) - 0.5) * 14,
        vy: -(18 + rand01(seed + i * 9) * 28),
        size: 2,
        color: i % 2 ? PALETTES.victory.core : PALETTES.victory.hot,
        life: 0.62,
        maxLife: 0.62,
        motionOnly: true,
      });
    }
  }

  function spawnDefeat(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushParticle({ kind: 'glowline', y: ARENA.fenceY, color: PALETTES.defeat.hot, broken: true, life: 0.7, maxLife: 0.7, motionOnly: false });
    pushParticle({ kind: 'crack', x: ARENA.width / 2, y: ARENA.fenceY, length: 48, color: PALETTES.defeat.core, life: 0.6, maxLife: 0.6, motionOnly: false });
    pushRing(point.x, ARENA.fenceY, 10, 16, PALETTES.defeat.mid, 0.45);
    burst(ARENA.width / 2, ARENA.fenceY, 7, 36, 90, true, PALETTES.defeat.hot, 0.4, seed, 2);
  }

  function spawnUi(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = desc.cue === 'error' ? PALETTES.defeat : PALETTES.ui;
    pushPlus(point.x, point.y, 2, palette.hot, palette.core, 0.16);
  }

  function spawnStatus(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = desc.element === 'heal' || desc.heal ? PALETTES.heal : paletteFor(desc.element, desc.behavior);
    const style = STYLE[desc.behavior] || STYLE.neutral;
    pushPlus(point.x, point.y, 2, palette.hot, palette.core, 0.16);
    if (style.ring || desc.behavior === 'support') pushRing(point.x, point.y, 7, 14, palette.mid, 0.24);
    burst(point.x, point.y, 3, 28, style.gravity, desc.behavior === 'fire', palette.mid, 0.2, seed, 2);
    if (!(desc.damage > 0)) showNumber(desc, point.x, point.y, seed, palette);
    if (desc.stacks >= 2) pushPips(point.x + 8, point.y + 6, Math.min(4, desc.stacks), palette.mid, 0.32);
  }

  function spawnBoss(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 12, 18, PALETTES.boss.hot, 0.46);
    pushPlus(point.x, point.y, 4, PALETTES.boss.core, PALETTES.boss.hot, 0.28);
    burst(point.x, point.y, 6, 40, 0, false, PALETTES.boss.mid, 0.3, seed, 2);
  }

  function spawn(desc, index) {
    const seed = nextSeed(desc, index);
    switch (desc.type) {
      case 'shot': spawnShot(desc, seed); break;
      case 'hit': spawnHit(desc, seed); break;
      case 'kill': spawnKill(desc, seed); break;
      case 'fence_hit': spawnFence(desc, seed); break;
      case 'merge': spawnMerge(desc, seed); break;
      case 'draft': spawnDraft(desc); break;
      case 'victory': spawnVictory(desc, seed); break;
      case 'defeat': spawnDefeat(desc, seed); break;
      case 'ui': spawnUi(desc); break;
      case 'status': spawnStatus(desc, seed); break;
      case 'boss': spawnBoss(desc, seed); break;
      default: break;
    }
  }

  function trimAll() {
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    if (floaters.length > MAX_FLOATERS) floaters.splice(0, floaters.length - MAX_FLOATERS);
    if (rings.length > MAX_RINGS) rings.splice(0, rings.length - MAX_RINGS);
  }

  function ingest(events) {
    const batch = collectFeedback(events);
    for (let i = 0; i < batch.length; i++) spawn(batch[i], i);
    trimAll();
  }

  function stepParticle(particle, dt) {
    if (particle.kind === 'spark') {
      particle.vy += (particle.gravity || 0) * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    } else if (particle.kind === 'mote') {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    } else if (particle.kind === 'orbit') {
      particle.angle += particle.spin * dt;
      particle.radius = Math.max(0, particle.radius + particle.radial * dt);
      particle.x = particle.cx + Math.cos(particle.angle) * particle.radius;
      particle.y = particle.cy + Math.sin(particle.angle) * particle.radius * 0.72;
    }
  }

  function driftedOut(particle) {
    if (particle.kind !== 'spark' && particle.kind !== 'mote' && particle.kind !== 'orbit') return false;
    return particle.x < -48 || particle.x > ARENA.width + 48 || particle.y < -96 || particle.y > ARENA.height + 48;
  }

  function step(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      stepParticle(particle, dt);
      if (driftedOut(particle) || (particle.x != null && !Number.isFinite(particle.x)) || (particle.y != null && !Number.isFinite(particle.y))) {
        particles.splice(i, 1);
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const floater = floaters[i];
      floater.life -= dt;
      if (floater.life <= 0 || !Number.isFinite(floater.life)) {
        floaters.splice(i, 1);
        continue;
      }
      floater.y += floater.vy * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ring.r = Math.min(ring.r0 + 52, ring.r + ring.vr * dt);
    }
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (particles.length + floaters.length + rings.length === 0) return;
    // A stalled tab should drop leftover flashes instead of replaying them.
    if (dt >= 1.25) {
      clear();
      return;
    }
    let left = dt;
    const slice = 1 / 30;
    let guard = 0;
    while (left > 1e-8 && guard++ < 45) {
      const h = left > slice ? slice : left;
      step(h);
      left -= h;
    }
  }

  function drawPixelRing(ctx, x, y, radius, color, alpha, weight) {
    if (!(radius > 0) || alpha < 0.02) return;
    const size = weight > 1 ? 2 : 1;
    const steps = Math.max(8, Math.min(48, Math.round(radius * 1.15)));
    const cx = Math.round(x);
    const cy = Math.round(y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), size, size);
    }
  }

  function drawStreak(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const px = -uy;
    const py = ux;
    const len = particle.length | 0;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.edge;
    for (let i = 0; i <= len - 3; i++) {
      const x = ox + ux * i;
      const y = oy + uy * i;
      ctx.fillRect(x + px, y + py, 1, 1);
      ctx.fillRect(x - px, y - py, 1, 1);
    }
    ctx.fillStyle = particle.shaft;
    for (let i = 0; i <= len - 3; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    ctx.fillStyle = particle.head;
    for (let i = Math.max(0, len - 2); i <= len; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    const bx = ox + ux * (len - 2);
    const by = oy + uy * (len - 2);
    ctx.fillRect(bx + px * 2, by + py * 2, 1, 1);
    ctx.fillRect(bx - px * 2, by - py * 2, 1, 1);
  }

  function drawNeedle(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const px = -uy;
    const py = ux;
    const len = particle.length | 0;
    const back = 5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.shaft;
    for (let i = -back; i <= len - 2; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    ctx.fillStyle = particle.head;
    ctx.fillRect(ox + ux * len, oy + uy * len, 1, 1);
    ctx.fillRect(ox + ux * (len - 1) + px, oy + uy * (len - 1) + py, 1, 1);
    ctx.fillRect(ox + ux * (len - 1) - px, oy + uy * (len - 1) - py, 1, 1);
    ctx.fillStyle = particle.edge;
    ctx.fillRect(ox - ux * back + px, oy - uy * back + py, 1, 1);
    ctx.fillRect(ox - ux * back - px, oy - uy * back - py, 1, 1);
  }

  function drawBurst(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    const radius = Math.max(5, particle.radius | 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.edge || particle.color;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), 1, 1);
    }
    ctx.fillStyle = particle.color;
    const inner = Math.max(3, radius - 3);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.4;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * inner), Math.round(cy + Math.sin(angle) * inner), 1, 1);
    }
    ctx.fillStyle = particle.core || particle.color;
    ctx.fillRect(cx, cy - radius - 2, 1, 2);
    ctx.fillRect(cx, cy + radius + 1, 1, 2);
    ctx.fillRect(cx - radius - 2, cy, 2, 1);
    ctx.fillRect(cx + radius + 1, cy, 2, 1);
  }

  function drawJump(ctx, particle, alpha) {
    if (alpha < 0.02 || !particle.points || particle.points.length < 2) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 1; i < particle.points.length; i++) {
      const a = particle.points[i - 1];
      const b = particle.points[i];
      drawSegment(ctx, a.x, a.y, b.x, b.y);
    }
    if (particle.points.length >= 3) {
      const a = particle.points[1];
      const b = particle.points[2];
      ctx.fillStyle = particle.edge || particle.color;
      drawSegment(ctx, a.x + 1, a.y, b.x + 1, b.y - 1);
    }
  }

  function drawDiamond(ctx, cx, cy, radius) {
    const reach = radius | 0;
    for (let dx = -reach; dx <= reach; dx++) {
      const dy = reach - Math.abs(dx);
      ctx.fillRect(cx + dx, cy - dy, 1, 1);
      if (dy) ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }

  function drawFlash(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3a2410';
    drawDiamond(ctx, cx, cy, 8);
    ctx.fillStyle = '#ffe56a';
    drawDiamond(ctx, cx, cy, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, cy, 7, 1);
    ctx.fillRect(cx, cy - 3, 1, 7);
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillRect(cx - 11, cy, 2, 1);
    ctx.fillRect(cx + 10, cy, 2, 1);
    ctx.fillRect(cx, cy - 11, 1, 2);
    ctx.fillRect(cx, cy + 10, 1, 2);
  }

  function drawImpact(ctx, particle, alpha, short) {
    if (alpha < 0.02) return;
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    let arm = Math.max(3, particle.arm | 0);
    if (short) arm = particle.crit ? 4 : 3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#140e0c';
    ctx.fillRect(cx - arm, cy - 1, arm * 2 + 1, 3);
    ctx.fillRect(cx - 1, cy - arm, 3, arm * 2 + 1);
    ctx.fillStyle = short && particle.crit ? '#ffe56a' : particle.color;
    ctx.fillRect(cx - arm, cy, arm * 2 + 1, 1);
    ctx.fillRect(cx, cy - arm, 1, arm * 2 + 1);
    if (!short) {
      for (let i = 2; i < arm; i++) {
        ctx.fillRect(cx + i, cy + i, 1, 1);
        ctx.fillRect(cx - i, cy + i, 1, 1);
        ctx.fillRect(cx + i, cy - i, 1, 1);
        ctx.fillRect(cx - i, cy - i, 1, 1);
      }
    }
    ctx.fillStyle = particle.core || particle.color;
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    if (particle.crit) {
      ctx.fillStyle = '#ffe56a';
      ctx.fillRect(cx - arm, cy, 1, 1);
      ctx.fillRect(cx + arm, cy, 1, 1);
      ctx.fillRect(cx, cy - arm, 1, 1);
      ctx.fillRect(cx, cy + arm, 1, 1);
      if (short) {
        ctx.fillRect(cx - 2, cy - 2, 1, 1);
        ctx.fillRect(cx + 2, cy - 2, 1, 1);
        ctx.fillRect(cx - 2, cy + 2, 1, 1);
        ctx.fillRect(cx + 2, cy + 2, 1, 1);
      }
    }
  }

  function drawNotch(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const cx = Math.round(particle.x);
    const y = Math.round(particle.y);
    const heavy = particle.heavy ? 1 : 0;
    const wing = 4 + heavy;
    const gap = 2 + heavy;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(cx - gap, y - 2, gap * 2, 5);
    ctx.fillStyle = '#fff2dd';
    ctx.fillRect(cx - wing - gap, y - 2, wing, 2);
    ctx.fillRect(cx + gap, y - 2, wing, 2);
    ctx.fillStyle = '#e7c89a';
    ctx.fillRect(cx - wing - gap, y, wing, 1);
    ctx.fillRect(cx + gap, y, wing, 1);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(cx - 1, y - 8, 2, 6);
    ctx.fillStyle = '#fff2dd';
    ctx.fillRect(cx - 1, y - 8, 2, 1);
    ctx.fillStyle = '#c4543c';
    ctx.fillRect(cx - 2 - heavy, y + 3, 1, 2);
    ctx.fillRect(cx + 1 + heavy, y + 3, 1, 2);
    ctx.fillStyle = '#e7c89a';
    ctx.fillRect(cx - 3 - heavy, y + 5, 1, 1);
    ctx.fillRect(cx + 2 + heavy, y + 5, 1, 1);
  }

  function drawPlus(ctx, x, y, arm, color, core, alpha) {
    if (alpha < 0.02) return;
    const cx = Math.round(x);
    const cy = Math.round(y);
    const reach = Math.max(1, arm | 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cx - reach, cy, reach * 2 + 1, 1);
    ctx.fillRect(cx, cy - reach, 1, reach * 2 + 1);
    ctx.fillStyle = core || color;
    ctx.fillRect(cx, cy, 1, 1);
  }

  function drawDot(ctx, particle, alpha) {
    if (alpha < 0.02 || !Number.isFinite(particle.x) || !Number.isFinite(particle.y)) return;
    const size = particle.life < particle.maxLife * 0.35 ? 1 : (particle.size || 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x - size / 2), Math.round(particle.y - size / 2), size, size);
  }

  function drawSegment(ctx, x0, y0, x1, y1) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx - dy;
    const maxSteps = Math.min(720, dx + dy + 1);
    for (let n = 0; n < maxSteps; n++) {
      ctx.fillRect(x, y, 1, 1);
      if (x === xe && y === ye) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function drawArc(ctx, particle, alpha) {
    if (alpha < 0.02 || !particle.points || particle.points.length < 2) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 1; i < particle.points.length; i++) {
      const a = particle.points[i - 1];
      const b = particle.points[i];
      drawSegment(ctx, a.x, a.y, b.x, b.y);
    }
  }

  function drawPips(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const count = particle.count | 0;
    const total = count * 2 + Math.max(0, count - 1);
    let cursor = Math.round(particle.x - total / 2);
    const y = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 0; i < count; i++) {
      ctx.fillRect(cursor, y, 2, 2);
      cursor += 3;
    }
  }

  function drawCrack(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const y = Math.round(particle.y);
    const start = Math.round(particle.x - particle.length / 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 0; i < particle.length; i += 2) {
      const drop = i % 4 === 0 ? 1 : 0;
      ctx.fillRect(start + i, y + drop, 2, 1);
    }
  }

  function drawGlowline(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = particle.color;
    const y = Math.round(particle.y);
    for (let x = 8; x < ARENA.width - 8; x += 3) {
      if (particle.broken && x % 9 === 0) continue;
      const jag = particle.broken && x % 12 < 4 ? 1 : 0;
      ctx.fillRect(x, y + jag, 2, 1);
    }
  }

  function drawText(ctx, text, x, y, color, scale, alpha) {
    if (!text || alpha < 0.02) return;
    const size = Math.max(1, scale | 0);
    const advance = 3 * size + size;
    const origin = Math.round(x - (text.length * advance - size) / 2);
    const top = Math.round(y);
    const blit = (offsetX, offsetY) => {
      let cursor = origin + offsetX;
      const rowTop = top + offsetY;
      for (let c = 0; c < text.length; c++) {
        const glyph = GLYPHS[text[c]];
        if (glyph) {
          for (let row = 0; row < glyph.length; row++) {
            const line = glyph[row];
            for (let col = 0; col < line.length; col++) {
              if (line[col] === '1') ctx.fillRect(cursor + col * size, rowTop + row * size, size, size);
            }
          }
        }
        cursor += advance;
      }
    };
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#140e0c';
    blit(1, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    blit(0, 0);
  }

  function drawFloater(ctx, floater, reduced) {
    const alpha = fade(floater);
    const x = reduced ? floater.originX : floater.x;
    const y = reduced ? floater.originY : floater.y;
    drawText(ctx, floater.text, x, y, floater.color, floater.scale, alpha);
  }

  function drawReducedMark(ctx, particle, alpha) {
    const x = Number.isFinite(particle.markX) ? particle.markX : particle.x;
    const y = Number.isFinite(particle.markY) ? particle.markY : particle.y;
    drawImpact(ctx, {
      x,
      y,
      arm: particle.crit ? 4 : 3,
      color: particle.crit ? '#ffe56a' : (particle.shaft || particle.color || particle.head || '#d5ddd8'),
      core: particle.crit ? '#fff6d2' : (particle.core || particle.head || '#f2f5f4'),
      crit: !!particle.crit,
    }, alpha, true);
  }

  function drawParticle(ctx, particle, reduced) {
    if (reduced && (particle.motionOnly || REDUCED_TRAILS.has(particle.kind))) {
      if (particle.markWhenReduced) drawReducedMark(ctx, particle, fade(particle));
      return;
    }
    const alpha = fade(particle);
    switch (particle.kind) {
      case 'spark':
      case 'mote':
      case 'orbit':
        drawDot(ctx, particle, alpha);
        break;
      case 'plus':
        drawPlus(ctx, particle.x, particle.y, particle.arm, particle.color, particle.core, alpha);
        break;
      case 'block':
        if (alpha < 0.02) break;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.fillRect(Math.round(particle.x - particle.w / 2), Math.round(particle.y - particle.h / 2), particle.w, particle.h);
        break;
      case 'arc':
        drawArc(ctx, particle, alpha);
        break;
      case 'pips':
        drawPips(ctx, particle, alpha);
        break;
      case 'crack':
        drawCrack(ctx, particle, alpha);
        break;
      case 'streak':
        drawStreak(ctx, particle, alpha);
        break;
      case 'needle':
        drawNeedle(ctx, particle, alpha);
        break;
      case 'burst':
        drawBurst(ctx, particle, alpha);
        break;
      case 'jump':
        drawJump(ctx, particle, alpha);
        break;
      case 'impact':
        drawImpact(ctx, particle, alpha, reduced);
        break;
      case 'flash':
        drawFlash(ctx, particle, alpha);
        break;
      case 'notch':
        drawNotch(ctx, particle, alpha);
        break;
      case 'glowline':
        drawGlowline(ctx, particle, alpha);
        break;
      default:
        break;
    }
  }

  function draw(ctx, options) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.fillRect !== 'function') return;
    const reduced = Boolean(options && options.reducedMotion);
    ctx.save();
    try {
      try { ctx.imageSmoothingEnabled = false; } catch { /* partial mock contexts */ }
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        drawPixelRing(ctx, ring.x, ring.y, reduced ? ring.r0 : ring.r, ring.color, fade(ring) * 0.95, ring.weight);
      }
      for (let i = 0; i < particles.length; i++) drawParticle(ctx, particles[i], reduced);
      for (let i = 0; i < floaters.length; i++) drawFloater(ctx, floaters[i], reduced);
    } finally {
      ctx.restore();
    }
  }

  function clear() {
    particles.length = 0;
    floaters.length = 0;
    rings.length = 0;
  }

  return { ingest, update, draw, clear };
}
