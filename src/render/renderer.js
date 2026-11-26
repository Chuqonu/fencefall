/**
 * Fencefall battlefield renderer.
 *
 * Draws in ARENA logical pixels (360×640) into an offscreen buffer, then
 * nearest-neighbor blits that buffer into the canvas backing store. Hit
 * testing inverts the same rectangle, so touch and mouse match the picture.
 *
 * Simulation state and gameplay RNG are read-only. Presentation events come
 * from ingestEvents; this module never reads or drains state.events.
 * Changing runId clears leftover VFX, then replays events ingested since the
 * previous draw so a restart frame does not drop its own feedback.
 * A live stun, burn, poison, or slow tints that sprite. Stun wins, then burn, then poison, then slow.
 * A plate walker keeps two steel shoulders, still visible when a tint covers the body.
 * A bilingual director or wave hint is drawn in the top margin.
 * The selected defender shows its rank just above the sprite.
 * A phased enemy sprite is drawn at 42% opacity, then alpha is restored.
 * While leapTimer is above zero, an amber bar sits just above that sprite. A pale bar marks a warded ally.
 * A pale line joins an ash warden to the ally it is shielding.
 * An amber dash points from a hurried enemy back toward its banner.
 * A green line joins an ash mender to the most wounded ally in reach.
 * A gold corner marks a tower that has a legal merge.
 * While an ash hush is biting, each defender shows a short teal bar.
 * While chargeTimer is above zero, a shrinking red bar shows the fuse.
 * Inside chargeGap, and before the fuse lights, a short amber bar marks the approach.
 */

import {drawWorld,drawFrontline} from './world.js';
import {drawDefender, defenderSize} from './defenders.js';
import {drawEnemy, enemySize} from './enemies.js';
import {createEffects} from './effects.js';
import {getUnitStats} from '../data/towers.js';
import {mergeableSlotIndexes} from '../systems/merges.js';
import {ARENA, clamp, hitSlot as hitSlotAt, slotGeometry} from '../shared.js';

const LETTERBOX = '#0e171c';
const FIELD = '#122128';
const MAX_CUES = 48;
const MAX_BATCH = 200;
const MAX_PROJECTILES = 300;
const MAX_ENEMIES = 400;
const MAX_CLOUDS = 32;
const CUE_MS = 240;
const MERGE_CUE_MS = 900;
const FLASH_MS = 150;
const RANGE_LIMIT = 900;
const HP_FILL = 3;
const SPRITE_GAP = 3;
const STATUS_CELL = 7;
const STATUS_GAP = 2;

const PALETTE = {
  bolt: {main: '#f2d56a', core: '#fff6cf', edge: '#6e5424'},
  fire: {main: '#e25a2a', core: '#ffd36a', edge: '#5c220f'},
  frost: {main: '#9ed8ea', core: '#f4fdff', edge: '#24566c'},
  lightning: {main: '#ffe14a', core: '#fffceb', edge: '#7a6220'},
  poison: {main: '#6aaa3a', core: '#d8f0a0', edge: '#243814'},
  support: {main: '#f0d78a', core: '#fff8de', edge: '#6a5830'},
  hero: {main: '#c44a56', core: '#fff0c0', edge: '#3c1018'},
};

const ELEMENT_ALIAS = {
  bolt: 'bolt', physical: 'bolt', arrow: 'bolt', kinetic: 'bolt',
  fire: 'fire', burn: 'fire', flame: 'fire',
  frost: 'frost', ice: 'frost', cold: 'frost', slow: 'frost',
  lightning: 'lightning', shock: 'lightning', spark: 'lightning', chain: 'lightning',
  poison: 'poison', toxin: 'poison',
  support: 'support', heal: 'support', aura: 'support',
  hero: 'hero',
};

const STATUS_RANK = {stun: 0, burn: 1, poison: 2, slow: 3, brittle: 4};
const STATUS_TINT = {stun: '#f0d35a', burn: '#e25a2a', poison: '#6aaa3a', slow: '#9ed8ea'};
const TINT_ALPHA = 0.55;
const HINT_BAND = 42;
const HINT_MAX_LINES = 3;
const HINT_CHAR_LIMIT = 220;
// 3×5 rank digits, painted at 2× in the band above the selected sprite.
const RANK_DIGIT = [
  null,
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
];
let tintSurface = null;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nowMs() {
  const perf = globalThis.performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

function currentDpr() {
  const dpr = globalThis.devicePixelRatio || 1;
  return Math.max(1, Math.min(dpr, 4));
}

function hashInt(n) {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function sharpen(ctx) {
  ctx.imageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
}

function isolate(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function plot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function context2d(target, opaque) {
  if (opaque) {
    try {
      const ctx = target.getContext('2d', {alpha: false});
      if (ctx) return ctx;
    } catch {
      /* The options bag is optional. */
    }
  }
  return target.getContext('2d');
}

function createScene() {
  const make = (scene) => {
    const ctx = scene ? context2d(scene, true) : null;
    return ctx ? {scene, ctx} : null;
  };
  try {
    if (typeof OffscreenCanvas === 'function') {
      const created = make(new OffscreenCanvas(ARENA.width, ARENA.height));
      if (created) return created;
    }
  } catch {
    /* OffscreenCanvas can exist but refuse a 2d context. */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = ARENA.width;
      canvas.height = ARENA.height;
      const created = make(canvas);
      if (created) return created;
    }
  } catch {
    /* Headless hosts draw directly to the display canvas. */
  }
  return {scene: null, ctx: null};
}

function normalizeSlot(value) {
  return Number.isInteger(value) && value >= 0 && value < 10 ? value : -1;
}

function normalizeBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const slice = events.length > MAX_BATCH ? events.slice(events.length - MAX_BATCH) : events.slice();
  return slice.filter((event) => event && typeof event === 'object');
}

function pushCapped(list, item) {
  list.push(item);
  if (list.length > MAX_CUES) list.splice(0, list.length - MAX_CUES);
}

function cueStrength(at, now, duration) {
  if (!Number.isFinite(at)) return 0;
  const age = now - at;
  if (age < 0 || age > duration) return 0;
  return 1 - age / duration;
}

function pruneList(list, now) {
  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const duration = list[i].duration || CUE_MS;
    if (now - list[i].at <= duration) list[write++] = list[i];
  }
  list.length = write;
}

function idOf(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function rememberElement(out, value) {
  if (value == null) return;
  const kind = ELEMENT_ALIAS[String(value).toLowerCase()];
  if (kind && !out.includes(kind)) out.push(kind);
}

function elementsOf(projectile) {
  const out = [];
  const tags = Array.isArray(projectile.tags) ? projectile.tags : [];
  for (const tag of tags) rememberElement(out, tag);
  rememberElement(out, projectile.towerType);
  rememberElement(out, projectile.element);
  rememberElement(out, projectile.kind);
  if (Array.isArray(projectile.effects)) {
    for (const effect of projectile.effects) rememberElement(out, effect?.type);
  }
  if (!out.length) out.push('bolt');
  return out;
}

function projectileInk(projectile) {
  const elements = elementsOf(projectile);
  const kind = elements[0];
  const color = PALETTE[kind] || PALETTE.bolt;
  const accent = PALETTE[elements[1]] || color;
  return {kind, color, accent};
}

export function projectileColors(projectile) {
  const ink = projectileInk(projectile || {});
  return {kind: ink.kind, main: ink.color.main, core: ink.color.core, edge: ink.color.edge};
}

function measureEnemy(enemy) {
  let width = Math.max(16, Math.round((finite(enemy.radius) ?? 12) * 2));
  let height = width;
  const sized = enemySize(enemy);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function measureDefender(unit) {
  let width = 32;
  let height = 36;
  const sized = defenderSize(unit);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function slotBox(slot, index) {
  if (
    slot &&
    Number.isFinite(slot.left) &&
    Number.isFinite(slot.top) &&
    Number.isFinite(slot.width) &&
    Number.isFinite(slot.height)
  ) {
    return slot;
  }
  return slotGeometry(index);
}

function slotCenter(slot, index) {
  if (slot && Number.isFinite(slot.x) && Number.isFinite(slot.y)) return {x: slot.x, y: slot.y};
  const geo = slotGeometry(index);
  return {x: geo.x, y: geo.y};
}

function readStats(unit, state, warned) {
  try {
    const stats = getUnitStats(unit, state);
    return stats && typeof stats === 'object' ? stats : null;
  } catch (error) {
    if (!warned.stats) {
      warned.stats = true;
      console.warn('fencefall renderer: getUnitStats failed', error);
    }
    return null;
  }
}

function auraRecipients(state, slots, warned) {
  const live = [];
  for (let index = 0; index < slots.length; index++) {
    const unit = slots[index]?.unit;
    if (!unit || unit.id == null) continue;
    const stats = readStats(unit, state, warned);
    const origin = slotCenter(slots[index], index);
    live.push({
      id: unit.id,
      x: origin.x,
      y: origin.y,
      range: Number(stats?.aura?.range),
      damage: Number(stats?.aura?.damage) || 0,
      haste: Number(stats?.aura?.haste) || 0,
    });
  }
  const hit = new Set();
  for (let s = 0; s < live.length; s++) {
    const source = live[s];
    if (!(source.range > 0) || (source.damage <= 0 && source.haste <= 0)) continue;
    const reach = source.range * source.range;
    for (let t = 0; t < live.length; t++) {
      const target = live[t];
      const dx = source.x - target.x;
      const dy = source.y - target.y;
      if (dx * dx + dy * dy <= reach) hit.add(target.id);
    }
  }
  return hit;
}

function drawAuraMark(ctx, anchorX, spriteTop) {
  const x = Math.round(anchorX);
  const y = spriteTop - 4;
  ctx.fillStyle = '#c8fff4';
  ctx.fillRect(x, y - 2, 1, 5);
  ctx.fillRect(x - 2, y, 5, 1);
}

function orderedEnemies(state) {
  const source = Array.isArray(state.enemies) ? state.enemies : [];
  const list = [];
  for (let i = 0; i < source.length; i++) {
    const enemy = source[i];
    if (!enemy || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
    list.push(enemy);
  }
  list.sort((a, b) => (a.y - b.y) || ((a.dead ? 0 : 1) - (b.dead ? 0 : 1)));
  if (list.length > MAX_ENEMIES) list.splice(0, list.length - MAX_ENEMIES);
  return list;
}

function plotRing(ctx, cx, cy, x, y) {
  ctx.fillRect(cx + x, cy + y, 1, 1);
  ctx.fillRect(cx + y, cy + x, 1, 1);
  ctx.fillRect(cx - x, cy + y, 1, 1);
  ctx.fillRect(cx - y, cy + x, 1, 1);
  ctx.fillRect(cx + x, cy - y, 1, 1);
  ctx.fillRect(cx + y, cy - x, 1, 1);
  ctx.fillRect(cx - x, cy - y, 1, 1);
  ctx.fillRect(cx - y, cy - x, 1, 1);
}

function drawPixelCircle(ctx, cx, cy, radius, color) {
  const r = Math.round(radius);
  if (r <= 0) return;
  let x = r;
  let y = 0;
  let decision = 1 - r;
  ctx.fillStyle = color;
  while (x >= y) {
    plotRing(ctx, cx, cy, x, y);
    if (r > 2) plotRing(ctx, cx, cy, x - 1, y);
    y += 1;
    if (decision <= 0) decision += 2 * y + 1;
    else {
      x -= 1;
      decision += 2 * (y - x) + 1;
    }
  }
}

function drawHpBar(ctx, x, y, width, hp, maxHp, emphasize) {
  if (!Number.isFinite(hp)) return;
  const max = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : Math.max(hp, 1);
  const ratio = clamp(hp / max, 0, 1);
  const fillW = Math.max(0, Math.min(width, Math.round(width * ratio)));
  const plateY = y - 1;
  const plateH = HP_FILL + 2;
  ctx.fillStyle = '#101418';
  ctx.fillRect(x - 1, plateY, width + 2, plateH);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(x - 1, plateY, width + 2, 1);
  ctx.fillRect(x - 1, plateY + plateH - 1, width + 2, 1);
  ctx.fillRect(x - 1, plateY, 1, plateH);
  ctx.fillRect(x + width, plateY, 1, plateH);
  let fill = ratio > 0.55 ? '#8fbf62' : ratio > 0.28 ? '#f0c15a' : '#e15a42';
  if (emphasize) fill = ratio > 0.55 ? '#d7f5a4' : ratio > 0.28 ? '#ffe3a0' : '#ffc2b4';
  if (fillW > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, fillW, HP_FILL);
    ctx.fillStyle = 'rgba(255, 248, 230, 0.5)';
    ctx.fillRect(x, y, fillW, 1);
  }
}

function drawTargetMark(ctx, x, y, width) {
  const top = y - 1;
  const bottom = y + HP_FILL;
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(x - 4, top, 2, 1);
  ctx.fillRect(x - 4, top, 1, 2);
  ctx.fillRect(x + width + 2, top, 2, 1);
  ctx.fillRect(x + width + 3, top, 1, 2);
  ctx.fillRect(x - 4, bottom, 2, 1);
  ctx.fillRect(x - 4, bottom - 1, 1, 2);
  ctx.fillRect(x + width + 2, bottom, 2, 1);
  ctx.fillRect(x + width + 3, bottom - 1, 1, 2);
}

function drawStatusIcon(ctx, status, x, y) {
  const type = String(status.type || '');
  if (type === 'burn') {
    ctx.fillStyle = '#5c220f';
    ctx.fillRect(x + 1, y, 3, 5);
    ctx.fillStyle = '#e25a2a';
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(x + 2, y + 2, 1, 2);
    return;
  }
  if (type === 'poison') {
    ctx.fillStyle = '#243814';
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = '#6aaa3a';
    ctx.fillRect(x + 1, y + 1, 3, 2);
    ctx.fillStyle = '#d8f0a0';
    ctx.fillRect(x + 2, y + 1, 1, 1);
    const stacks = clamp(Math.round(finite(status.stacks) ?? 1), 1, 4);
    if (stacks > 1) {
      ctx.fillStyle = '#d8f0a0';
      for (let i = 0; i < stacks; i++) ctx.fillRect(x + i, y + 5, 1, 1);
    }
    return;
  }
  if (type === 'slow') {
    ctx.fillStyle = '#24566c';
    ctx.fillRect(x, y + 2, 5, 1);
    ctx.fillRect(x + 2, y, 1, 5);
    ctx.fillStyle = '#f4fdff';
    ctx.fillRect(x + 2, y + 2, 1, 1);
    return;
  }
  if (type === 'stun') {
    ctx.fillStyle = '#f0d35a';
    ctx.fillRect(x + 2, y, 1, 5);
    ctx.fillRect(x, y + 2, 5, 1);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(x + 2, y + 2, 1, 1);
    return;
  }
  if (type === 'brittle') {
    ctx.fillStyle = '#d7c4a4';
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x + 3, y + 1, 2, 1);
    ctx.fillRect(x + 1, y + 2, 2, 1);
    ctx.fillRect(x, y + 4, 2, 1);
    ctx.fillRect(x + 3, y + 3, 2, 1);
    return;
  }
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(x + 2, y + 2, 1, 1);
}

function drawStatuses(ctx, enemy, anchorX, y) {
  const source = Array.isArray(enemy.statuses) ? enemy.statuses : [];
  const shown = [];
  for (let i = 0; i < source.length; i++) {
    const status = source[i];
    if (!status || !status.type) continue;
    if (Number.isFinite(status.remaining) && status.remaining <= 0) continue;
    shown.push(status);
  }
  if (!shown.length) return;
  shown.sort((a, b) => (STATUS_RANK[a.type] ?? 9) - (STATUS_RANK[b.type] ?? 9));
  if (shown.length > 5) shown.length = 5;
  const stride = STATUS_CELL + 1;
  const rowWidth = shown.length * stride - 1;
  let x = Math.round(anchorX - rowWidth / 2);
  const top = Math.round(y);
  for (let i = 0; i < shown.length; i++) {
    ctx.fillStyle = '#101418';
    ctx.fillRect(x, top, STATUS_CELL, STATUS_CELL);
    ctx.fillStyle = '#d5e0d4';
    ctx.fillRect(x, top, STATUS_CELL, 1);
    ctx.fillRect(x, top, 1, STATUS_CELL);
    ctx.fillRect(x + STATUS_CELL - 1, top, 1, STATUS_CELL);
    drawStatusIcon(ctx, shown[i], x + 1, top + 1);
    x += stride;
  }
}

function drawProjectile(ctx, projectile, target, reduced) {
  const x = Math.round(projectile.x);
  const y = Math.round(projectile.y);
  if (projectile.team === 'enemy') {
    // Glowing spitter acid glob with trailing droplets
    ctx.save();
    ctx.fillStyle = 'rgba(134, 224, 68, 0.28)';
    ctx.fillRect(x - 4, y - 6, 9, 12);
    ctx.fillStyle = '#3d7420';
    ctx.fillRect(x - 3, y - 4, 7, 8);
    ctx.fillStyle = '#baee6a';
    ctx.fillRect(x - 2, y - 3, 5, 6);
    ctx.fillStyle = '#f5ffd0';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    if (!reduced) {
      ctx.fillStyle = '#88cc44';
      ctx.fillRect(x - 1, y - 7, 2, 2);
      ctx.fillRect(x + 1, y - 10, 1, 2);
    }
    ctx.restore();
    return;
  }
  const ink = projectileInk(projectile);
  const kind = ink.kind;
  const color = ink.color;
  const accent = ink.accent;
  const tags = Array.isArray(projectile.tags) ? projectile.tags : [];
  const isSplit = tags.includes('split');
  const isCryoBarrage = tags.includes('cryo_barrage');
  let dx = finite(projectile.vx) ?? 0;
  let dy = finite(projectile.vy) ?? 0;
  if (dx === 0 && dy === 0 && finite(projectile.dirx) != null && finite(projectile.diry) != null) {
    dx = projectile.dirx;
    dy = projectile.diry;
  }
  if (dx === 0 && dy === 0 && target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    dx = target.x - projectile.x;
    dy = target.y - projectile.y;
  }
  if (dx === 0 && dy === 0) dy = -1;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag;
  const uy = dy / mag;
  const px = -uy;
  const py = ux;
  const crit = !!projectile.crit || tags.includes('crit');
  const length = reduced ? 4 : isCryoBarrage ? 13 : isSplit ? 8 : kind === 'lightning' ? 11 : kind === 'fire' ? 9 : kind === 'hero' ? 9 : 7;
  const life = finite(projectile.life);
  const faded = life != null && life < 0.35;
  const at = (along, across) => [x + ux * along + px * across, y + uy * along + py * across];
  ctx.save();
  if (faded) ctx.globalAlpha = Math.max(0.3, life / 0.35);

  if (isCryoBarrage) {
    // Piercing Glacial Barrage ice lance (bold 3px crystalline shaft)
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * 0.34;
    ctx.fillStyle = '#5ee0ff';
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.globalAlpha = baseAlpha;
    for (let i = length; i >= 1; i--) {
      const [tx, ty] = at(-i, 0);
      plot(ctx, tx, ty, i <= 5 ? '#f4fdff' : i <= 9 ? '#82e6ff' : '#2a7aa0');
      if (i <= 7) {
        const [s1x, s1y] = at(-i, 1);
        const [s2x, s2y] = at(-i, -1);
        plot(ctx, s1x, s1y, i <= 3 ? '#b8f4ff' : '#4cc6ea');
        plot(ctx, s2x, s2y, i <= 3 ? '#b8f4ff' : '#4cc6ea');
      }
    }
    const [tipX, tipY] = at(3, 0);
    const [midX, midY] = at(1, 0);
    plot(ctx, tipX, tipY, '#ffffff');
    plot(ctx, midX, midY, '#ffffff');
    plot(ctx, x, y, '#ffffff');
    for (const across of [-2, 2]) {
      const [wx, wy] = at(-1, across);
      plot(ctx, wx, wy, '#9beeff');
    }
    ctx.restore();
    return;
  }

  if (isSplit) {
    // Blazing gold-crimson shrapnel sub-bolt
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * 0.3;
    ctx.fillStyle = '#ff9838';
    ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.globalAlpha = baseAlpha;
    for (let i = length; i >= 1; i--) {
      const [tx, ty] = at(-i, 0);
      plot(ctx, tx, ty, i <= 3 ? '#fff5be' : i <= 6 ? '#ffb43a' : '#c84826');
    }
    const [tipX, tipY] = at(2, 0);
    plot(ctx, tipX, tipY, '#ffffff');
    plot(ctx, x, y, '#ffe56a');
    for (const across of [-1, 1]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, '#ff7832');
    }
    ctx.restore();
    return;
  }

  // Subtle luminous elemental halo so projectiles read crisply over dense hordes
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * (crit ? 0.34 : 0.22);
  ctx.fillStyle = crit ? '#ffe56a' : color.main;
  ctx.fillRect(x - 3, y - 3, 7, 7);
  ctx.globalAlpha = baseAlpha;

  // Tapered elemental energy trail
  for (let i = length; i >= 1; i--) {
    let across = 0;
    if (kind === 'lightning' && i % 2 === 1) {
      const side = (hashInt(x * 13 + y * 29 + i * 7 + (reduced ? 0 : Math.round(projectile.x))) & 1) ? 1 : -1;
      across = side;
    }
    const [tx, ty] = at(-i, across);
    const trailInk = i <= 3 ? color.core : i <= 5 ? color.main : color.edge;
    plot(ctx, tx, ty, trailInk);
    if (i <= 3) {
      const [s1x, s1y] = at(-i, 1);
      const [s2x, s2y] = at(-i, -1);
      if (kind === 'fire' || kind === 'hero' || crit) {
        plot(ctx, s1x, s1y, color.main);
        if (i <= 2) plot(ctx, s2x, s2y, color.main);
      } else if (kind === 'frost' && i <= 2) {
        plot(ctx, s1x, s1y, color.main);
      }
    }
  }

  // Distinct high-contrast elemental projectile heads
  if (kind === 'frost') {
    for (const [dxp, dyp] of [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      plot(ctx, x + dxp, y + dyp, Math.abs(dxp) + Math.abs(dyp) > 1 ? color.main : color.core);
    }
    ctx.fillStyle = color.core;
    ctx.fillRect(x - 1, y - 1, 3, 3);
  } else if (kind === 'poison') {
    ctx.fillStyle = color.edge;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = color.main;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    plot(ctx, x, y, color.core);
    plot(ctx, x - 1, y - 1, '#f4ffd8');
    plot(ctx, x + 1, y + 2, accent.core);
  } else if (kind === 'support') {
    plot(ctx, x - 2, y, color.main);
    plot(ctx, x + 2, y, color.main);
    plot(ctx, x, y - 2, color.main);
    plot(ctx, x, y + 2, color.main);
    ctx.fillStyle = color.core;
    ctx.fillRect(x - 1, y - 1, 3, 3);
  } else if (kind === 'lightning') {
    ctx.fillStyle = color.main;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    const [tipX, tipY] = at(2, 0);
    plot(ctx, tipX, tipY, color.core);
    plot(ctx, x, y, '#ffffff');
    for (const across of [-2, 2]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, color.main);
    }
  } else if (kind === 'fire') {
    ctx.fillStyle = color.edge;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = color.main;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    plot(ctx, x, y, color.core);
    const [tipX, tipY] = at(2, 0);
    plot(ctx, tipX, tipY, color.main);
  } else if (kind === 'hero') {
    // Bold crimson-gold hero lance head
    const [tipX, tipY] = at(2, 0);
    const [midX, midY] = at(1, 0);
    plot(ctx, tipX, tipY, color.core);
    plot(ctx, midX, midY, color.core);
    plot(ctx, x, y, '#ffffff');
    for (const across of [-2, -1, 1, 2]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, Math.abs(across) === 2 ? color.edge : color.main);
    }
  } else {
    // Rivet crossbow bolt with gleaming steel head
    const [tipX, tipY] = at(2, 0);
    plot(ctx, tipX, tipY, '#ffffff');
    plot(ctx, x, y, color.core);
    for (const across of [-2, -1, 1, 2]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, Math.abs(across) === 2 ? color.edge : color.main);
    }
  }
  if (crit) {
    plot(ctx, x, y - 4, '#f0d35a');
    plot(ctx, x, y + 4, '#f0d35a');
    plot(ctx, x - 4, y, '#f0d35a');
    plot(ctx, x + 4, y, '#f0d35a');
    plot(ctx, x - 2, y - 2, '#fff6c8');
    plot(ctx, x + 2, y - 2, '#fff6c8');
    plot(ctx, x - 2, y + 2, '#fff6c8');
    plot(ctx, x + 2, y + 2, '#fff6c8');
    plot(ctx, x, y - 3, '#ffffff');
    plot(ctx, x, y + 3, '#ffffff');
    plot(ctx, x - 3, y, '#ffffff');
    plot(ctx, x + 3, y, '#ffffff');
  }
  if (finite(projectile.splash) > 0 && kind !== 'fire') {
    plot(ctx, x - 2, y - 2, accent.core);
    plot(ctx, x + 2, y - 2, accent.core);
    plot(ctx, x - 2, y + 2, accent.core);
    plot(ctx, x + 2, y + 2, accent.core);
  }
  ctx.restore();
}

function cloudColor(cloud) {
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  if (kind.includes('napalm') || kind.includes('shrapnel') || kind.includes('fire') || kind.includes('burn')) return '#ff5a20';
  if (kind.includes('poison') || kind.includes('toxin') || kind.includes('miasma')) return '#6aaa3a';
  if (kind.includes('frost') || kind.includes('ice') || kind.includes('slow')) return '#8fd0e0';
  if (kind.includes('light')) return '#ffe14a';
  return '#74c47a';
}

function drawCloud(ctx, cloud, index, time = 0, reduced = false) {
  const x = finite(cloud.x);
  const y = finite(cloud.y);
  const radius = finite(cloud.radius) ?? finite(cloud.range);
  if (x == null || y == null || radius == null || radius <= 0) return;
  const r = clamp(radius, 2, 120);
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  const isFireSea = kind.includes('napalm') || kind.includes('shrapnel');
  const color = cloudColor(cloud);
  const seed = hashInt(index * 97 + Math.round(x) * 13 + Math.round(y) * 29);
  let fade = 1;
  const remaining = finite(cloud.remaining);
  const duration = finite(cloud.duration);
  if (remaining != null && duration != null && duration > 0) fade = clamp(remaining / duration, 0, 1);
  ctx.save();
  if (isFireSea) {
    // Roaring Napalm / Thermobaric Fire Sea
    const cx = Math.round(x);
    const cy = Math.round(y);
    const flicker = reduced ? 0.85 : (0.76 + 0.24 * Math.sin(time * 14 + index));
    ctx.globalAlpha = 0.24 * fade * flicker;
    ctx.fillStyle = '#d82e12';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28 * fade * flicker;
    ctx.fillStyle = '#ff7b24';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, r * 0.68), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.56 * fade;
    ctx.strokeStyle = '#ff9d3b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash?.([4, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);
    // Flickering pixel flame tongues + golden hot embers
    const step = r > 44 ? 9 : 7;
    const frame = reduced ? 0 : Math.floor(time * 11);
    for (let py = -r + 4; py <= r - 4; py += step) {
      for (let px = -r + 4; px <= r - 4; px += step) {
        if (px * px + py * py > (r - 4) * (r - 4)) continue;
        const h = hashInt(seed + px * 7 + py * 19);
        if ((h & 3) !== 0) continue;
        const bob = reduced ? 2 : ((frame + (h & 7)) % 5);
        const fx = Math.round(x + px);
        const fy = Math.round(y + py);
        ctx.globalAlpha = 0.72 * fade;
        ctx.fillStyle = '#ff541a';
        ctx.fillRect(fx - 1, fy - 2 - bob, 3, 4 + (bob & 1));
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = (h & 8) ? '#ffe878' : '#ffb842';
        ctx.fillRect(fx, fy - 1 - bob, 1, 2);
      }
    }
    ctx.restore();
    return;
  }
  // Soft translucent ground hazard zone
  ctx.globalAlpha = 0.16 * fade;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.fill();
  // Subtle dashed perimeter ring
  ctx.globalAlpha = 0.38 * fade;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash?.([3, 3]);
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash?.([]);
  // Drifting pixel vapor bubbles inside the cloud
  ctx.globalAlpha = 0.48 * fade;
  ctx.fillStyle = color;
  const drift = reduced ? 0 : Math.floor(time * 8);
  const step = r > 40 ? 7 : 6;
  for (let py = -r; py <= r; py += step) {
    for (let px = -r; px <= r; px += step) {
      if (px * px + py * py > (r - 2) * (r - 2)) continue;
      const h = hashInt(seed + px * 3 + py * 17);
      if ((h & 3) !== 0) continue;
      const rise = reduced ? 0 : ((drift + (h & 7)) % 5);
      ctx.fillRect(Math.round(x + px), Math.round(y + py - rise), 2, 2);
    }
  }
  ctx.restore();
}

function drawSweepers(ctx, state, time, reduced) {
  const list = state.arsenal?.sweepers;
  if (!Array.isArray(list) || !list.length) return;
  const treadTick = reduced ? 0 : (Math.floor(time * 24) & 3);
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const sw = list[i];
    if (!sw || !Number.isFinite(sw.x) || !Number.isFinite(sw.y)) continue;
    const cx = Math.round(sw.x);
    const cy = Math.round(sw.y);
    const hw = Math.min(24, Math.max(18, Math.round((sw.halfWidth || 34) * 0.62)));
    // Twin golden headlight cones sweeping ahead of the plow
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(cx - hw + 2, cy - 36, 7, 16);
    ctx.fillRect(cx + hw - 9, cy - 36, 7, 16);
    ctx.globalAlpha = 0.1;
    ctx.fillRect(cx - hw, cy - 48, 11, 14);
    ctx.fillRect(cx + hw - 11, cy - 48, 11, 14);
    ctx.globalAlpha = 1;
    // Heavy contact drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(cx - hw - 1, cy - 16, hw * 2 + 2, 38);
    // Left & right armored rubber treads with animated cleats
    ctx.fillStyle = '#141a1e';
    ctx.fillRect(cx - hw, cy - 12, 5, 30);
    ctx.fillRect(cx + hw - 5, cy - 12, 5, 30);
    ctx.fillStyle = '#48565e';
    for (let ty = -10 + treadTick; ty < 16; ty += 5) {
      ctx.fillRect(cx - hw + 1, cy + ty, 3, 2);
      ctx.fillRect(cx + hw - 4, cy + ty, 3, 2);
    }
    // Main armored steel truck chassis
    const bw = (hw - 4) * 2;
    ctx.fillStyle = '#1b242a';
    ctx.fillRect(cx - hw + 4, cy - 15, bw, 33);
    ctx.fillStyle = '#3a4c58';
    ctx.fillRect(cx - hw + 5, cy - 14, bw - 2, 31);
    // Steel hood & rear cargo armor deck
    ctx.fillStyle = '#5a707e';
    ctx.fillRect(cx - hw + 6, cy - 13, bw - 4, 10);
    ctx.fillRect(cx - hw + 6, cy + 5, bw - 4, 10);
    // Armored cyan slit windshield
    ctx.fillStyle = '#142028';
    ctx.fillRect(cx - hw + 7, cy - 5, bw - 6, 5);
    ctx.fillStyle = '#7ce6ff';
    ctx.fillRect(cx - hw + 8, cy - 4, bw - 8, 3);
    ctx.fillStyle = '#e8fbff';
    ctx.fillRect(cx - hw + 9, cy - 4, 4, 1);
    // Roof turret hatch & amber beacon
    ctx.fillStyle = '#243038';
    ctx.fillRect(cx - 5, cy + 2, 10, 8);
    ctx.fillStyle = '#8aa0ac';
    ctx.fillRect(cx - 4, cy + 3, 8, 6);
    ctx.fillStyle = (treadTick & 1) ? '#ff5a3c' : '#ffe56a';
    ctx.fillRect(cx - 1, cy + 5, 2, 2);
    // Heavy V-shaped front steel ram-plow with hazard stripes
    ctx.fillStyle = '#222c32';
    ctx.fillRect(cx - hw - 3, cy - 21, hw * 2 + 6, 7);
    ctx.fillStyle = '#cedbe2';
    ctx.fillRect(cx - hw - 2, cy - 20, hw * 2 + 4, 3);
    ctx.fillStyle = '#f0cb72';
    for (let sx = -hw; sx <= hw - 4; sx += 8) {
      ctx.fillRect(cx + sx, cy - 17, 4, 2);
    }
    // Headlights on bumper
    ctx.fillStyle = '#fff9d6';
    ctx.fillRect(cx - hw + 4, cy - 16, 3, 2);
    ctx.fillRect(cx + hw - 7, cy - 16, 3, 2);
    // Exhaust puffs behind rear wheels
    if (!reduced) {
      const puff = (Math.floor(time * 16) + i * 3) % 8;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#a8b8c0';
      ctx.fillRect(cx - hw + 6, cy + 19 + puff, 3, 3);
      ctx.fillRect(cx + hw - 9, cy + 21 + (7 - puff), 3, 3);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawBeams(ctx, state, time, reduced) {
  const list = state.arsenal?.beams;
  if (!Array.isArray(list) || !list.length) return;
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const beam = list[i];
    if (!beam || !Number.isFinite(beam.x) || !(beam.life > 0)) continue;
    const maxLife = beam.maxLife > 0 ? beam.maxLife : 0.65;
    const ratio = clamp(beam.life / maxLife, 0, 1);
    const pulse = reduced ? 1 : (0.85 + 0.15 * Math.sin(time * 42 + i));
    const width = Math.max(12, Math.round((beam.width || 36) * (0.45 + 0.55 * ratio)));
    const cx = Math.round(beam.x);
    const bottom = ARENA.fenceY - 6;
    // Outer electric cyan plasma halo
    ctx.globalAlpha = 0.26 * ratio * pulse;
    ctx.fillStyle = '#38d8ff';
    ctx.fillRect(cx - Math.round(width * 0.72), 0, Math.round(width * 1.44), bottom);
    // Main high-energy laser column
    ctx.globalAlpha = 0.64 * ratio * pulse;
    ctx.fillStyle = '#8ef0ff';
    ctx.fillRect(cx - Math.round(width * 0.42), 0, Math.round(width * 0.84), bottom);
    // Blinding white-hot beam core
    const coreW = Math.max(4, Math.round(width * 0.22));
    ctx.globalAlpha = 0.94 * ratio;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - Math.round(coreW / 2), 0, coreW, bottom);
    // Animated descending energy scan bars
    if (!reduced) {
      const scan = Math.floor((time * 460 + i * 73) % 72);
      ctx.globalAlpha = 0.75 * ratio;
      ctx.fillStyle = '#e0fbff';
      for (let sy = scan; sy < bottom; sy += 72) {
        ctx.fillRect(cx - Math.round(width * 0.55), sy, Math.round(width * 1.1), 3);
      }
    }
    // Ground scorch flare at the base of the beam
    ctx.globalAlpha = 0.78 * ratio;
    ctx.fillStyle = '#c8f8ff';
    ctx.fillRect(cx - Math.round(width * 0.65), bottom - 4, Math.round(width * 1.3), 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - Math.round(width * 0.35), bottom - 3, Math.round(width * 0.7), 3);
  }
  ctx.restore();
}

function ringRadius(value) {
  return Number.isFinite(value) && value > 0 ? clamp(value, 1, RANGE_LIMIT) : 0;
}

function drawRange(ctx, state, slotIndex, strokeOnly, warned, cache) {
  if (slotIndex < 0) return;
  const slots = Array.isArray(state.slots) ? state.slots : [];
  const slot = slots[slotIndex];
  const unit = slot?.unit;
  if (!unit) return;
  let stats;
  if (cache.valid && cache.state === state && cache.slot === slotIndex) stats = cache.stats;
  else {
    stats = readStats(unit, state, warned);
    cache.valid = true;
    cache.state = state;
    cache.slot = slotIndex;
    cache.stats = stats;
  }
  if (!stats) return;
  const attack = ringRadius(stats.range);
  const aura = ringRadius(stats.aura?.range);
  const origin = slotCenter(slot, slotIndex);
  const cx = Math.round(origin.x);
  const cy = Math.round(origin.y);
  const primary = attack || aura;
  if (!primary) return;
  if (!strokeOnly) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, primary, 0, Math.PI * 2);
    ctx.fillStyle = attack ? 'rgba(240, 203, 114, 0.10)' : 'rgba(125, 206, 192, 0.10)';
    ctx.fill();
    ctx.restore();
    return;
  }
  if (attack) drawPixelCircle(ctx, cx, cy, attack, '#f0cb72');
  // Splash is measured around the enemy that was hit, not around this slot.
  if (aura && Math.abs(aura - attack) > 6) drawPixelCircle(ctx, cx, cy, aura, '#7dcec0');
  ctx.fillStyle = attack ? '#f0cb72' : '#7dcec0';
  ctx.fillRect(cx - 2, cy, 5, 1);
  ctx.fillRect(cx, cy - 2, 1, 5);
}

function drawFence(ctx, state, time, flash, reduced) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.maxHp) || fence.maxHp <= 0 || !Number.isFinite(fence.hp)) return;
  const ratio = clamp(fence.hp / fence.maxHp, 0, 1);
  const x = 24;
  const y = ARENA.fenceY - 7;
  const width = ARENA.width - 48;
  const emphasize = !reduced && ratio <= 0.28 && Math.floor(time * 6) % 2 === 0;
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 * flash;
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(0, ARENA.fenceY - 6, ARENA.width, 12);
    ctx.restore();
  }
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(x - 1, y - 1, width + 2, 6);
  ctx.fillStyle = ratio > 0.6 ? '#8eae6a' : ratio > 0.3 ? '#e0b15a' : emphasize ? '#ffb2a6' : '#c4543c';
  const fillW = Math.round(width * ratio);
  if (fillW > 0) ctx.fillRect(x, y, fillW, 4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + Math.round(width * i / 4), y, 1, 4);
}

function fillSlot(ctx, box, color) {
  ctx.fillStyle = color;
  ctx.fillRect(box.left, box.top, box.width, box.height);
}

function strokeSlot(ctx, box, color, thickness) {
  const x = box.left;
  const y = box.top;
  const w = box.width;
  const h = box.height;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
  ctx.fillRect(x, y + h - thickness, w, thickness);
  ctx.fillRect(x, y, thickness, h);
  ctx.fillRect(x + w - thickness, y, thickness, h);
}

function enemyAnchor(enemy) {
  const size = measureEnemy(enemy);
  return {
    size,
    x: Math.round(enemy.x),
    y: Math.round(enemy.y + size.height / 2),
  };
}

// Cues sit in the clear rows above the sprite. The plate never reaches spriteTop.
function enemyCueLayout(anchor) {
  const spriteTop = anchor.y - anchor.size.height;
  const barW = clamp(Math.round(anchor.size.width * 0.85), 12, 48);
  const plateBottom = spriteTop - 1 - SPRITE_GAP;
  const barY = plateBottom - HP_FILL;
  return {
    barX: Math.round(anchor.x - barW / 2),
    barY,
    barW,
    statusY: (barY - 1) - STATUS_GAP - STATUS_CELL,
  };
}

function statusLive(enemy, type) {
  const source = Array.isArray(enemy?.statuses) ? enemy.statuses : [];
  for (let i = 0; i < source.length; i++) {
    const status = source[i];
    if (!status || status.type !== type) continue;
    if (Number.isFinite(status.remaining) && status.remaining <= 0) continue;
    return true;
  }
  return false;
}

// One hue on the body. Stun wins, then burn, then poison, then slow. Pips still list the rest.
function statusTintColor(enemy) {
  if (statusLive(enemy, 'stun')) return STATUS_TINT.stun;
  if (statusLive(enemy, 'burn')) return STATUS_TINT.burn;
  if (statusLive(enemy, 'poison')) return STATUS_TINT.poison;
  if (statusLive(enemy, 'slow')) return STATUS_TINT.slow;
  return null;
}

// 8×3 amber bar, centered on the sprite and sitting in the gap just above it.
function drawLeapMark(ctx, enemy, anchor) {
  const sized = enemySize(enemy);
  const height = sized && Number.isFinite(sized.height) && sized.height > 0 ? sized.height : 0;
  const markY = height > 0 ? Math.round(anchor.y - height) - 3 : Math.round(anchor.y) - 8;
  ctx.fillStyle = '#e2a23a';
  ctx.fillRect(Math.round(anchor.x) - 4, markY, 8, 3);
}

function drawChargeMark(ctx, enemy, anchor) {
  if (!enemy || enemy.dead) return;
  const fusing = enemy.chargeTimer > 0 && enemy.chargeWindup > 0;
  const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
  const stopY = ARENA.fenceY - radius;
  const approaching = !fusing && enemy.chargeLit !== true && enemy.chargeGap > 0
    && enemy.y >= stopY - enemy.chargeGap && enemy.y < stopY - 0.75;
  if (!fusing && !approaching) return;
  const sized = enemySize(enemy);
  const height = sized && Number.isFinite(sized.height) && sized.height > 0 ? sized.height : 0;
  const markY = height > 0 ? Math.round(anchor.y - height) - 3 : Math.round(anchor.y) - 8;
  if (approaching) {
    ctx.fillStyle = '#f0b429';
    ctx.fillRect(Math.round(anchor.x) - 4, markY - 8, 8, 3);
    return;
  }
  const ratio = Math.max(0, Math.min(1, enemy.chargeTimer / enemy.chargeWindup));
  const width = Math.max(2, Math.round(12 * ratio));
  ctx.fillStyle = '#e24a3a';
  ctx.fillRect(Math.round(anchor.x) - Math.floor(width / 2), markY - 8, width, 2);
}

function boardHushed(enemies) {
  if (!Array.isArray(enemies)) return false;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || enemy.dead || !(enemy.hp > 0) || !(enemy.hushFactor > 0)) continue;
    if (statusLive(enemy, 'stun')) continue;
    const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
    if (enemy.y >= ARENA.fenceY - radius - 0.75) return true;
  }
  return false;
}

function drawMergeCorner(ctx, slot, index, anchorX, spriteTop) {
  const box = slotBox(slot, index);
  const left = Number.isFinite(box.left) ? box.left : box.x;
  const top = Number.isFinite(box.top) ? box.top : box.y;
  ctx.fillStyle = '#f0c56a';
  if (Number.isFinite(left) && Number.isFinite(top)) {
    const x = Math.round(left) + 1;
    const y = Math.round(top) + 1;
    ctx.fillRect(x, y, 8, 2);
    ctx.fillRect(x, y, 2, 8);
  }
  if (Number.isFinite(anchorX) && Number.isFinite(spriteTop)) {
    ctx.fillRect(Math.round(anchorX) - 4, Math.round(spriteTop) - 7, 8, 3);
  }
}

function drawHushBoardMark(ctx, x, top) {
  ctx.fillStyle = '#9fd0c8';
  ctx.fillRect(x - 4, top - 8, 8, 2);
}

function drawWardLinks(ctx, enemies, anchors) {
  ctx.save();
  ctx.strokeStyle = '#d5e4f2';
  ctx.lineWidth = 1;
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    const from = anchors[i];
    if (!source || source.dead || !(source.wardRange > 0) || !from) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const ally = enemies[j];
      if (!ally || ally.dead || !(ally.wardShield > 0)) continue;
      const dist = Math.hypot(ally.x - source.x, ally.y - source.y);
      if (dist <= source.wardRange && dist < bestDist) {
        best = j;
        bestDist = dist;
      }
    }
    const to = best >= 0 ? anchors[best] : null;
    if (!to) continue;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - from.size.height / 2);
    ctx.lineTo(to.x, to.y - to.size.height / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBannerHaste(ctx, enemies, anchors) {
  ctx.save();
  ctx.strokeStyle = '#e2a23a';
  ctx.lineWidth = 1;
  for (let j = 0; j < enemies.length; j++) {
    const ally = enemies[j];
    const to = anchors[j];
    if (!ally || ally.dead || !(ally.hp > 0) || !to || ally.bannerRange > 0) continue;
    const radius = Number.isFinite(ally.radius) && ally.radius > 0 ? ally.radius : 12;
    if (!(ally.y < ARENA.fenceY - radius - 1e-6)) continue;
    let from = null;
    for (let i = 0; i < enemies.length; i++) {
      if (i === j) continue;
      const banner = enemies[i];
      if (!banner || banner.dead || !(banner.hp > 0)) continue;
      if (!(banner.bannerRange > 0) || !(banner.bannerHaste > 0) || !anchors[i]) continue;
      const dx = ally.x - banner.x;
      const dy = ally.y - banner.y;
      if (dx * dx + dy * dy > banner.bannerRange * banner.bannerRange) continue;
      from = anchors[i];
      break;
    }
    if (!from) continue;
    const x1 = to.x;
    const y1 = to.y - to.size.height / 2;
    const bx = from.x;
    const by = from.y - from.size.height / 2;
    const len = Math.hypot(bx - x1, by - y1) || 1;
    const dash = Math.min(10, len);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ((bx - x1) / len) * dash, y1 + ((by - y1) / len) * dash);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMendLinks(ctx, enemies, anchors) {
  ctx.save();
  ctx.strokeStyle = '#9dce6a';
  ctx.lineWidth = 1;
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    const from = anchors[i];
    if (!source || source.dead || !(source.hp > 0) || !(source.mendRange > 0) || !from) continue;
    if (statusLive(source, 'stun')) continue;
    let best = -1;
    let bestRatio = Infinity;
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const ally = enemies[j];
      if (!ally || ally.dead || !(ally.hp > 0) || !anchors[j]) continue;
      if (!Number.isFinite(ally.maxHp) || !(ally.maxHp > 0) || !(ally.hp < ally.maxHp)) continue;
      const dist = Math.hypot(ally.x - source.x, ally.y - source.y);
      if (dist > source.mendRange) continue;
      const ratio = ally.hp / ally.maxHp;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = j;
      }
    }
    if (best < 0) continue;
    const to = anchors[best];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - from.size.height / 2);
    ctx.lineTo(to.x, to.y - to.size.height / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHushMark(ctx, enemy, anchor) {
  if (!enemy || enemy.dead) return;
  const sized = enemySize(enemy);
  const height = sized && Number.isFinite(sized.height) && sized.height > 0 ? sized.height : 0;
  const markY = height > 0 ? Math.round(anchor.y - height) - 3 : Math.round(anchor.y) - 8;
  ctx.fillStyle = '#9fd0c8';
  ctx.fillRect(Math.round(anchor.x) - 4, markY - 8, 8, 2);
}

function drawPriorityMark(ctx, enemy, anchor) {
  if (!enemy || enemy.dead) return;
  if (!(enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0)) return;
  const sized = enemySize(enemy);
  const height = sized && Number.isFinite(sized.height) && sized.height > 0 ? sized.height : 0;
  const markY = height > 0 ? Math.round(anchor.y - height) - 3 : Math.round(anchor.y) - 8;
  const x = Math.round(anchor.x);
  ctx.fillStyle = '#f0c56a';
  ctx.fillRect(x - 1, markY - 7, 3, 3);
}
function drawWardMark(ctx, enemy, anchor) {
  if (enemy.dead) return;
  const sized = enemySize(enemy);
  const height = sized && Number.isFinite(sized.height) && sized.height > 0 ? sized.height : 0;
  const markY = height > 0 ? Math.round(anchor.y - height) - 3 : Math.round(anchor.y) - 8;
  ctx.fillStyle = '#d5e4f2';
  ctx.fillRect(Math.round(anchor.x) - 5, markY - 5, 10, 2);
}

function drawPlateShoulders(ctx, anchor) {
  const width = anchor.size.width;
  const height = anchor.size.height;
  if (!(width > 4) || !(height > 6)) return;
  const left = Math.round(anchor.x - width / 2);
  const top = Math.round(anchor.y - height);
  const y = top + 3;
  ctx.fillStyle = '#e7f1ff';
  ctx.fillRect(left + 1, y, 3, 1);
  ctx.fillRect(left + 1, y, 1, 3);
  ctx.fillRect(left + width - 4, y, 3, 1);
  ctx.fillRect(left + width - 2, y, 1, 3);
}

function drawStunFrame(ctx, anchor) {
  const width = anchor.size.width;
  const height = anchor.size.height;
  if (!(width > 0) || !(height > 0)) return;
  const left = Math.round(anchor.x - width / 2);
  const top = Math.round(anchor.y - height);
  ctx.fillStyle = '#f0d35a';
  ctx.fillRect(left - 1, top - 1, width + 2, 1);
  ctx.fillRect(left - 1, top + height, width + 2, 1);
  ctx.fillRect(left - 1, top, 1, height);
  ctx.fillRect(left + width, top, 1, height);
  ctx.fillStyle = '#fff6c8';
  const cx = Math.round(anchor.x);
  ctx.fillRect(cx - 4, top - 3, 1, 1);
  ctx.fillRect(cx + 3, top - 3, 1, 1);
}

function alphaCanvas(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (ctx) return {canvas, ctx};
    }
  } catch {
    /* OffscreenCanvas can exist but refuse a 2d context. */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) return {canvas, ctx};
    }
  } catch {
    /* Headless hosts fall back to a flat wash. */
  }
  return null;
}

function scratchFor(width, height) {
  if (tintSurface && tintSurface.canvas.width >= width && tintSurface.canvas.height >= height) return tintSurface;
  const next = alphaCanvas(Math.max(64, width), Math.max(80, height));
  if (!next) return null;
  tintSurface = next;
  return tintSurface;
}

function washStatus(ctx, left, top, width, height, color) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}

// Recolor sprite pixels only, then blend them back so the drawing stays visible.
function drawStatusTint(ctx, enemy, anchor, color, time) {
  const width = anchor.size.width;
  const height = anchor.size.height;
  if (!(width > 0) || !(height > 0)) return;
  const left = Math.round(anchor.x - width / 2);
  const top = Math.round(anchor.y - height);
  const surface = scratchFor(width, height);
  if (!surface || typeof ctx.drawImage !== 'function') {
    washStatus(ctx, left, top, width, height, color);
    return;
  }
  const scratch = surface.ctx;
  try {
    scratch.setTransform(1, 0, 0, 1, 0, 0);
    scratch.globalAlpha = 1;
    scratch.globalCompositeOperation = 'source-over';
    scratch.clearRect(0, 0, width, height);
    drawEnemy(scratch, enemy, width / 2, height, {time, scale: 1, flash: 0});
    scratch.globalCompositeOperation = 'source-atop';
    scratch.fillStyle = color;
    scratch.fillRect(0, 0, width, height);
    scratch.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = TINT_ALPHA;
    ctx.drawImage(surface.canvas, 0, 0, width, height, left, top, width, height);
    ctx.restore();
  } catch {
    washStatus(ctx, left, top, width, height, color);
  }
}

function languageTag(value) {
  if (typeof value !== 'string' || !value) return null;
  const tag = value.toLowerCase();
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('en')) return 'en';
  return null;
}

function activeLanguage(state, ui) {
  const doc = globalThis.document?.documentElement?.lang;
  return languageTag(ui?.language)
    || languageTag(ui?.settings?.language)
    || languageTag(doc)
    || languageTag(state?.profileSnapshot?.settings?.language)
    || 'en';
}

function drawSelectedRank(ctx, unit, anchorX, anchorY, size) {
  const rank = clamp(Math.round(finite(unit?.rank) ?? 1), 1, 4);
  const glyph = RANK_DIGIT[rank];
  const scale = 2;
  const cols = glyph[0].length;
  const rows = glyph.length;
  const plateW = cols * scale + 2;
  const plateH = rows * scale + 2;
  const spriteTop = Math.round(anchorY - size.height);
  let x = Math.round(anchorX - plateW / 2);
  let y = spriteTop - plateH - 1;
  if (y < 1) y = Math.min(ARENA.height - plateH - 1, spriteTop + 1);
  x = clamp(x, 1, ARENA.width - plateW - 1);
  y = clamp(y, 1, ARENA.height - plateH - 1);
  ctx.fillStyle = '#101418';
  ctx.fillRect(x, y, plateW, plateH);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(x, y, plateW, 1);
  ctx.fillRect(x, y + plateH - 1, plateW, 1);
  ctx.fillRect(x, y, 1, plateH);
  ctx.fillRect(x + plateW - 1, y, 1, plateH);
  ctx.fillStyle = '#fff6c8';
  const ox = x + 1;
  const oy = y + 1;
  for (let row = 0; row < rows; row++) {
    const line = glyph[row];
    for (let col = 0; col < cols; col++) {
      if (line[col] !== '#') continue;
      ctx.fillRect(ox + col * scale, oy + row * scale, scale, scale);
    }
  }
}

function enemyFlash(enemy, hits, now, duration) {
  let best = 0;
  const radius = (finite(enemy.radius) ?? 14) + 8;
  const limit = radius * radius;
  for (let i = hits.length - 1; i >= 0; i--) {
    const cue = hits[i];
    const span = cue.crit || cue.kill ? duration * 1.3 : duration;
    const power = cueStrength(cue.at, now, span);
    if (power <= best) continue;
    if (cue.targetId && cue.targetId === enemy.id) {
      best = power;
      continue;
    }
    if (cue.targetId || cue.x == null || cue.y == null) continue;
    const dx = cue.x - enemy.x;
    const dy = cue.y - enemy.y;
    if (dx * dx + dy * dy <= limit) best = power;
  }
  return best;
}

function unitFlash(unitId, shots, now, duration) {
  if (!unitId) return 0;
  let best = 0;
  for (let i = shots.length - 1; i >= 0; i--) {
    const cue = shots[i];
    if (cue.sourceId !== unitId) continue;
    best = Math.max(best, cueStrength(cue.at, now, duration));
  }
  return best;
}

function slotPulse(index, slots, now) {
  let best = 0;
  let role = '';
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].index !== index) continue;
    const duration = slots[i].duration || CUE_MS;
    const strength = cueStrength(slots[i].at, now, duration);
    if (strength > best) {
      best = strength;
      role = slots[i].role || '';
    }
  }
  return {strength: best, role};
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer requires a canvas');
  }
  const display = context2d(canvas, false);
  if (!display) throw new TypeError('createRenderer could not get a 2d context');

  const sceneBundle = createScene();
  let scene = sceneBundle.scene;
  let sceneCtx = sceneBundle.ctx;
  const effects = createEffects();
  const warned = {stats: false};
  const rangeCache = {valid: false, state: null, slot: -1, stats: null};
  const hits = [];
  const shots = [];
  const slotCues = [];
  let fenceAt = null;
  let wallImmuneAt = null;
  let heroShotAt = null;
  let heroShotX = ARENA.width / 2;
  let heroShotY = ARENA.frontY - 12;
  let shakeAt = null;
  let shakeAmp = 0;
  let hordeAt = null;
  let pending = [];
  let runId;
  let seenRun = false;
  let lastSim = null;
  let destroyed = false;
  let view = {
    dpr: 1,
    offsetX: 0,
    offsetY: 0,
    destW: ARENA.width,
    destH: ARENA.height,
  };

  function resetCues() {
    hits.length = 0;
    shots.length = 0;
    slotCues.length = 0;
    fenceAt = null;
    wallImmuneAt = null;
    heroShotAt = null;
    shakeAt = null;
    shakeAmp = 0;
    hordeAt = null;
  }

  function triggerShake(at, amp) {
    const active = shakeAt != null ? cueStrength(shakeAt, at, 260) * shakeAmp : 0;
    if (amp >= active) {
      shakeAt = at;
      shakeAmp = amp;
    }
  }

  function remember(batch) {
    const at = nowMs();
    for (let i = 0; i < batch.length; i++) {
      const event = batch[i];
      const type = event.type;
      if (type === 'hit' || type === 'kill') {
        pushCapped(hits, {
          at,
          crit: !!event.crit,
          kill: type === 'kill',
          x: finite(event.x),
          y: finite(event.y),
          targetId: idOf(event.targetId, event.enemyId, typeof event.target === 'string' ? event.target : null),
        });
      } else if (type === 'shot') {
        const sx = finite(event.x);
        const sy = finite(event.y);
        pushCapped(shots, {
          at,
          x: sx,
          y: sy,
          sourceId: idOf(event.sourceId, event.unitId, typeof event.source === 'string' ? event.source : null),
        });
        if (event.towerType === 'hero' || (Array.isArray(event.tags) && event.tags.includes('hero'))) {
          heroShotAt = at;
          if (sx != null && sy != null) {
            heroShotX = sx;
            heroShotY = sy - 14;
          }
        }
      } else if (type === 'fence_hit') {
        fenceAt = at;
        triggerShake(at, 1.5);
      } else if (type === 'wall_immune') {
        wallImmuneAt = at;
        triggerShake(at, 1.6);
      } else if (type === 'fence_surge') {
        triggerShake(at, 4);
      } else if (type === 'napalm_blast') {
        triggerShake(at, 3.2);
      } else if (type === 'orbital_beam') {
        triggerShake(at, 3.0);
      } else if (type === 'armored_car') {
        triggerShake(at, 2.2);
      } else if (type === 'em_strike') {
        triggerShake(at, 1.8);
      } else if (type === 'boss_enrage' || type === 'field_destroy') {
        triggerShake(at, 2.5);
      } else if (type === 'corpse_explode') {
        triggerShake(at, 1.5);
      } else if (type === 'wave_horde') {
        hordeAt = at;
      } else if (type === 'merge') {
        const from = Number.isInteger(event.from) ? event.from : event.fromIndex;
        const to = Number.isInteger(event.to) ? event.to : event.toIndex;
        if (Number.isInteger(from) && from >= 0 && from < 10) {
          pushCapped(slotCues, {at, index: from, role: 'empty', duration: MERGE_CUE_MS});
        }
        if (Number.isInteger(to) && to >= 0 && to < 10) {
          pushCapped(slotCues, {at, index: to, role: 'kept', duration: MERGE_CUE_MS});
        }
      }
    }
  }

  function measureElement() {
    const rect = typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : {left: 0, top: 0, width: canvas.clientWidth || canvas.width || ARENA.width, height: canvas.clientHeight || canvas.height || ARENA.height};
    let borderLeft = 0;
    let borderRight = 0;
    let borderTop = 0;
    let borderBottom = 0;
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;
    if (typeof globalThis.getComputedStyle === 'function') {
      const style = globalThis.getComputedStyle(canvas);
      borderLeft = parseFloat(style.borderLeftWidth) || 0;
      borderRight = parseFloat(style.borderRightWidth) || 0;
      borderTop = parseFloat(style.borderTopWidth) || 0;
      borderBottom = parseFloat(style.borderBottomWidth) || 0;
      padLeft = parseFloat(style.paddingLeft) || 0;
      padRight = parseFloat(style.paddingRight) || 0;
      padTop = parseFloat(style.paddingTop) || 0;
      padBottom = parseFloat(style.paddingBottom) || 0;
    }
    return {
      width: Math.max(0, rect.width - borderLeft - borderRight - padLeft - padRight),
      height: Math.max(0, rect.height - borderTop - borderBottom - padTop - padBottom),
      left: rect.left + borderLeft + padLeft,
      top: rect.top + borderTop + padTop,
    };
  }

  function layout(contentW, contentH, dpr) {
    const deviceW = canvas.width;
    const deviceH = canvas.height;
    const fit = Math.min(deviceW / ARENA.width, deviceH / ARENA.height);
    const integer = Math.floor(fit + 1e-4);
    let scale = fit > 0 ? fit : 1;
    if (integer >= 1 && ((fit - integer) <= 0.02 || integer / fit >= 0.92)) scale = integer;
    const destW = Math.max(1, Math.round(ARENA.width * scale));
    const destH = Math.max(1, Math.round(ARENA.height * scale));
    view = {
      dpr,
      offsetX: Math.round((deviceW - destW) / 2),
      offsetY: Math.round((deviceH - destH) / 2),
      destW,
      destH,
      cssW: contentW,
      cssH: contentH,
    };
  }

  function resize() {
    if (destroyed) return;
    const box = measureElement();
    const dpr = currentDpr();
    if (!(box.width > 2) || !(box.height > 2)) {
      if (!(canvas.width > 0) || !(canvas.height > 0)) {
        canvas.width = ARENA.width;
        canvas.height = ARENA.height;
      }
      layout(canvas.width, canvas.height, dpr);
      return;
    }
    const targetW = Math.max(1, Math.round(box.width * dpr));
    const targetH = Math.max(1, Math.round(box.height * dpr));
    if (Math.abs(canvas.width - targetW) > 2 || Math.abs(canvas.height - targetH) > 2) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    layout(box.width, box.height, dpr);
  }

  function pointFromClient(clientX, clientY) {
    if (destroyed || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return {x: Number.NaN, y: Number.NaN};
    }
    resize();
    const box = measureElement();
    if (!(box.width > 0) || !(box.height > 0) || !(view.destW > 0) || !(view.destH > 0) || !(canvas.width > 0) || !(canvas.height > 0)) {
      return {x: Number.NaN, y: Number.NaN};
    }
    const deviceX = (clientX - box.left) * (canvas.width / box.width);
    const deviceY = (clientY - box.top) * (canvas.height / box.height);
    return {
      x: (deviceX - view.offsetX) / view.destW * ARENA.width,
      y: (deviceY - view.offsetY) / view.destH * ARENA.height,
    };
  }

  function hitSlot(clientX, clientY) {
    const point = pointFromClient(clientX, clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return -1;
    if (point.x < 0 || point.y < 0 || point.x >= ARENA.width || point.y >= ARENA.height) return -1;
    return hitSlotAt(point.x, point.y);
  }

  function presentationDt(state) {
    const time = finite(state?.time);
    if (time == null) return 0;
    if (lastSim == null) {
      lastSim = time;
      return 0;
    }
    const dt = time - lastSim;
    lastSim = time;
    if (!(dt > 0)) return 0;
    return dt > 0.1 ? 0.1 : dt;
  }

  function drawTargetingPip(ctx, box, unit) {
    if (!unit || unit.type === 'harvest') return;
    const mode = unit.targeting;
    if (!mode || mode === 'foremost') return;
    const color = mode === 'priority' ? '#f0cb72' : mode === 'strongest' ? '#e86858' : '#7ad4f0';
    const px = Math.round(box.left + box.width - 7);
    const py = Math.round(box.top + 3);
    ctx.fillStyle = '#0c1216';
    ctx.fillRect(px - 1, py - 1, 6, 6);
    ctx.fillStyle = color;
    ctx.fillRect(px, py, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 1, py + 1, 1, 1);
  }

  function drawSurgeOverlay(ctx, state, time, reduced) {
    const timer = state.surge?.shieldTimer || 0;
    if (!(timer > 0)) return;
    const ratio = clamp(timer / 3, 0, 1);
    const elapsed = Math.max(0, 3 - timer);
    const shimmer = reduced ? 0.8 : (0.72 + 0.28 * Math.sin(time * 16));
    ctx.save();
    // Luminous crystalline aegis barrier shielding the fence
    ctx.fillStyle = `rgba(120, 224, 255, ${(0.22 * shimmer).toFixed(3)})`;
    ctx.fillRect(0, ARENA.fenceY - 14, ARENA.width, 14);
    ctx.fillStyle = `rgba(155, 240, 255, ${(0.88 * shimmer).toFixed(3)})`;
    ctx.fillRect(0, ARENA.fenceY - 9, ARENA.width, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, ARENA.fenceY - 10, ARENA.width, 1);
    // Shield duration bar nestled directly above the fence
    const bw = Math.round((ARENA.width - 48) * ratio);
    if (bw > 0) {
      ctx.fillStyle = '#f0cb72';
      ctx.fillRect(24, ARENA.fenceY - 13, bw, 2);
    }
    // Sweeping upward shockwave wave crest during the initial 0.55s blast
    if (elapsed < 0.55) {
      const progress = elapsed / 0.55;
      const waveY = Math.round(ARENA.fenceY - progress * 250);
      const fade = 1 - progress;
      ctx.fillStyle = `rgba(120, 224, 255, ${(0.24 * fade).toFixed(3)})`;
      ctx.fillRect(0, waveY, ARENA.width, 18);
      ctx.fillStyle = `rgba(240, 203, 114, ${(0.65 * fade).toFixed(3)})`;
      ctx.fillRect(0, waveY, ARENA.width, 4);
      ctx.fillStyle = `rgba(255, 252, 232, ${(0.92 * fade).toFixed(3)})`;
      ctx.fillRect(0, waveY - 1, ARENA.width, 2);
    }
    ctx.restore();
  }

  function paint(ctx, state, ui, now, logicalBuffer) {
    const reduced = !!(ui.settings && ui.settings.reducedMotion) || !!ui.reducedMotion;
    const selected = normalizeSlot(ui.selectedSlot);
    const selectedField = normalizeSlot(ui.selectedField);
    const hover = normalizeSlot(ui.hoverSlot);
    const showRange = ui.range !== false;
    const time = finite(state?.time) ?? 0;
    const visualTime = reduced ? Math.round(time * 6) / 6 : time;
    const flashSpan = reduced ? 80 : FLASH_MS;
    rangeCache.valid = false;

    sharpen(ctx);
    if (logicalBuffer) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    if (!state) {
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
      return;
    }

    // Subtle pixel-snapped screen shake on heavy combat impacts (respects reducedMotion)
    const shakeStr = !reduced && shakeAt != null ? cueStrength(shakeAt, now, 260) : 0;
    const shakeX = shakeStr > 0 ? Math.round(Math.sin(now * 0.085) * shakeAmp * shakeStr) : 0;
    const shakeY = shakeStr > 0 ? Math.round(Math.cos(now * 0.11) * shakeAmp * 0.7 * shakeStr) : 0;
    if (shakeX || shakeY) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    try {
      isolate(ctx, () => drawWorld(ctx, state, {time: visualTime, reducedMotion: reduced}));

      isolate(ctx, () => drawFrontline(ctx, state, ui.fieldKind, visualTime, reduced, selectedField));
      if (state.phase === 'placing') {
        const pulse = reduced ? 0.24 : (0.18 + 0.12 * (0.5 + 0.5 * Math.sin(visualTime * 5)));
        for (const slot of state.slots) {
          if (!slot.unit || (state.pendingUnit?.replace && slot.unit.kind !== 'hero')) {
            const box = slotBox(slot, slot.index);
            fillSlot(ctx, box, `rgba(240, 203, 114, ${pulse.toFixed(3)})`);
            strokeSlot(ctx, box, '#f0cb72', 1);
          }
        }
      }
      const clouds = Array.isArray(state.clouds) ? state.clouds : [];
      const cloudCount = Math.min(clouds.length, MAX_CLOUDS);
      const cloudStart = clouds.length - cloudCount;
      for (let i = cloudStart; i < clouds.length; i++) {
        if (clouds[i]) drawCloud(ctx, clouds[i], i, visualTime, reduced);
      }

      if (showRange) drawRange(ctx, state, selected, false, warned, rangeCache);

      const slots = Array.isArray(state.slots) ? state.slots : [];
      if (hover >= 0 && hover !== selected) fillSlot(ctx, slotBox(slots[hover], hover), 'rgba(241, 238, 226, 0.08)');
      if (selected >= 0) fillSlot(ctx, slotBox(slots[selected], selected), 'rgba(240, 203, 114, 0.14)');

      const buffed = auraRecipients(state, slots, warned);

      const enemies = orderedEnemies(state);
      const anchors = new Array(enemies.length);
      const enemiesById = Object.create(null);
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.id != null) enemiesById[enemy.id] = enemy;
        const anchor = enemyAnchor(enemy);
        anchors[i] = anchor;
        const flash = enemyFlash(enemy, hits, now, flashSpan);
        isolate(ctx, () => {
          if (enemy.phased === true) ctx.globalAlpha = 0.42;
          drawEnemy(ctx, enemy, anchor.x, anchor.y, {time: visualTime, scale: 1, flash});
          if (enemy.phased === true) ctx.globalAlpha = 1;
        });
        if (enemy.leapTimer > 0) drawLeapMark(ctx, enemy, anchor);
        if (enemy.wardShield > 0) drawWardMark(ctx, enemy, anchor);
        if (enemy.chargeGap > 0 || enemy.chargeTimer > 0) drawChargeMark(ctx, enemy, anchor);
        if (enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0) drawPriorityMark(ctx, enemy, anchor);
        if (enemy.hushFactor > 0) drawHushMark(ctx, enemy, anchor);
        if (!enemy.dead && flash <= 0.4) {
          const tint = statusTintColor(enemy);
          if (tint) isolate(ctx, () => drawStatusTint(ctx, enemy, anchor, tint, visualTime));
          if (statusLive(enemy, 'stun')) isolate(ctx, () => drawStunFrame(ctx, anchor));
        }
        if (!enemy.dead && Number(enemy.armor) >= 0.5) isolate(ctx, () => drawPlateShoulders(ctx, anchor));
      }

      isolate(ctx, () => {
        drawWardLinks(ctx, enemies, anchors);
        drawBannerHaste(ctx, enemies, anchors);
        drawMendLinks(ctx, enemies, anchors);
      });

      // Armored Sweeper Trucks barreling through the zombie lines
      drawSweepers(ctx, state, visualTime, reduced);

      const hushed = boardHushed(enemies);
      const mergeable = mergeableSlotIndexes(state);

      for (let index = 0; index < 10; index++) {
        const slot = slots[index];
        const unit = slot?.unit;
        if (!unit) continue;
        const size = measureDefender(unit);
        const origin = slotCenter(slot, index);
        const anchorX = Math.round(origin.x);
        const anchorY = Math.round(origin.y + size.height / 2);
        const flash = unitFlash(unit.id, shots, now, flashSpan);
        isolate(ctx, () => drawDefender(ctx, unit, anchorX, anchorY, {time: visualTime, scale: 1, flash}));
        if (hushed) drawHushBoardMark(ctx, anchorX, anchorY - size.height);
        if (mergeable.includes(index)) drawMergeCorner(ctx, slot, index, anchorX, anchorY - size.height);
        if (buffed.has(unit.id)) isolate(ctx, () => drawAuraMark(ctx, anchorX, anchorY - size.height));
        drawTargetingPip(ctx, slotBox(slot, index), unit);
      }

      // Punchy Hero rifle muzzle flash star on every burst
      const muzzleStr = heroShotAt != null ? cueStrength(heroShotAt, now, reduced ? 55 : 95) : 0;
      if (muzzleStr > 0) {
        const mx = Math.round(heroShotX);
        const my = Math.round(heroShotY);
        ctx.save();
        ctx.globalAlpha = 0.88 * muzzleStr;
        ctx.fillStyle = '#ff9838';
        ctx.fillRect(mx - 6, my - 1, 13, 3);
        ctx.fillRect(mx - 1, my - 6, 3, 13);
        ctx.fillStyle = '#fff5be';
        ctx.fillRect(mx - 4, my, 9, 1);
        ctx.fillRect(mx, my - 4, 1, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 1, my - 1, 3, 3);
        ctx.restore();
      }

      const projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
      const visibleShots = [];
      const shotStart = Math.max(0, projectiles.length - MAX_PROJECTILES);
      for (let i = shotStart; i < projectiles.length; i++) {
        const projectile = projectiles[i];
        if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) continue;
        if (finite(projectile.life) != null && projectile.life <= 0) continue;
        if (projectile.x < -48 || projectile.y < -48 || projectile.x > ARENA.width + 48 || projectile.y > ARENA.height + 48) continue;
        visibleShots.push(projectile);
      }
      const targeted = Object.create(null);
      for (let i = 0; i < visibleShots.length; i++) {
        const projectile = visibleShots[i];
        if (projectile.targetId != null) targeted[projectile.targetId] = true;
        drawProjectile(ctx, projectile, projectile.targetId != null ? enemiesById[projectile.targetId] : null, reduced);
      }

      // Orbital Laser Beams slicing vertically across the horde
      drawBeams(ctx, state, visualTime, reduced);

      if (showRange) drawRange(ctx, state, selected, true, warned, rangeCache);

      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.dead) continue;
        const anchor = anchors[i];
        const cue = enemyCueLayout(anchor);
        const fresh = enemyFlash(enemy, hits, now, flashSpan) > 0.4;
        const maxHp = Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 ? enemy.maxHp : null;
        const low = maxHp != null && Number.isFinite(enemy.hp) && enemy.hp / maxHp <= 0.28;
        const emphasize = fresh || (!reduced && low && Math.floor(visualTime * 6) % 2 === 0);
        drawHpBar(ctx, cue.barX, cue.barY, cue.barW, enemy.hp, enemy.maxHp, emphasize);
        if (Number.isFinite(enemy.hp) && (fresh || targeted[enemy.id] === true)) {
          drawTargetMark(ctx, cue.barX, cue.barY, cue.barW);
        }
        drawStatuses(ctx, enemy, anchor.x, cue.statusY);
      }

      drawSurgeOverlay(ctx, state, visualTime, reduced);
      const aegisFlash = wallImmuneAt != null ? cueStrength(wallImmuneAt, now, reduced ? 120 : 240) : 0;
      if (aegisFlash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.52 * aegisFlash;
        ctx.fillStyle = '#5ee8ff';
        ctx.fillRect(0, ARENA.fenceY - 12, ARENA.width, 12);
        ctx.globalAlpha = 0.92 * aegisFlash;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, ARENA.fenceY - 7, ARENA.width, 2);
        ctx.restore();
      }
      drawFence(ctx, state, visualTime, cueStrength(fenceAt, now, reduced ? 100 : 200), reduced);

      // Brief crimson edge horizon pulse when a horde wave surges in
      const hordeStr = hordeAt != null ? cueStrength(hordeAt, now, reduced ? 500 : 1500) : 0;
      if (hordeStr > 0) {
        const beat = reduced ? 0.65 : (0.55 + 0.45 * Math.sin(now * 0.018));
        ctx.save();
        ctx.globalAlpha = 0.24 * hordeStr * beat;
        ctx.fillStyle = '#e5453c';
        ctx.fillRect(0, 0, ARENA.width, 54);
        ctx.globalAlpha = 0.55 * hordeStr * beat;
        ctx.fillRect(0, 44, ARENA.width, 3);
        ctx.restore();
      }

      for (let index = 0; index < 10; index++) {
        const box = slotBox(slots[index], index);
        const pulse = slotPulse(index, slotCues, now);
        if (pulse.strength <= 0) continue;
        if (pulse.role === 'empty') {
          ctx.fillStyle = `rgba(20, 14, 12, ${0.35 + 0.45 * pulse.strength})`;
          ctx.fillRect(box.left + 3, box.top + 3, box.width - 6, box.height - 6);
          strokeSlot(ctx, box, `rgba(231, 160, 138, ${0.55 + 0.45 * pulse.strength})`, 3);
        } else if (pulse.role === 'kept') {
          ctx.fillStyle = `rgba(240, 203, 114, ${0.18 + 0.28 * pulse.strength})`;
          ctx.fillRect(box.left + 3, box.top + 3, box.width - 6, box.height - 6);
          strokeSlot(ctx, box, '#f0cb72', 3);
        } else if (index !== selected) {
          strokeSlot(ctx, box, `rgba(255, 244, 214, ${0.45 + 0.55 * pulse.strength})`, 2);
        }
      }
      if (hover >= 0 && hover !== selected) {
        const intent = ui.hoverIntent;
        const box = slotBox(slots[hover], hover);
        const dropColor = intent === 'empty'
          ? '#7ecea0'
          : intent === 'merge'
            ? '#f0cb72'
            : intent === 'illegal'
              ? '#e7a08a'
              : 'rgba(198, 214, 210, 0.9)';
        if (intent === 'empty' || intent === 'merge' || intent === 'illegal') {
          ctx.fillStyle = intent === 'empty'
            ? 'rgba(126, 206, 160, 0.34)'
            : intent === 'merge'
              ? 'rgba(240, 203, 114, 0.34)'
              : 'rgba(231, 160, 138, 0.34)';
          ctx.fillRect(box.left, box.top, box.width, box.height);
        }
        strokeSlot(ctx, box, dropColor, intent ? 4 : 1);
      }
      if (selected >= 0) {
        strokeSlot(ctx, slotBox(slots[selected], selected), '#f0cb72', 2);
        const selectedUnit = slots[selected]?.unit;
        if (selectedUnit) {
          const selectedSize = measureDefender(selectedUnit);
          const selectedOrigin = slotCenter(slots[selected], selected);
          isolate(ctx, () => drawSelectedRank(
            ctx,
            selectedUnit,
            Math.round(selectedOrigin.x),
            Math.round(selectedOrigin.y + selectedSize.height / 2),
            selectedSize,
          ));
        }
      }

      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
      // The HUD shows playerHint. Drawing it here covered enemies entering from the top.
    } finally {
      if (shakeX || shakeY) ctx.restore();
    }
  }

  function draw(state, ui) {
    if (destroyed) return;
    const viewUi = ui && typeof ui === 'object' ? ui : {};
    resize();
    const now = nowMs();
    pruneList(hits, now);
    pruneList(shots, now);
    pruneList(slotCues, now);
    if (fenceAt != null && now - fenceAt > CUE_MS) fenceAt = null;
    if (wallImmuneAt != null && now - wallImmuneAt > 260) wallImmuneAt = null;
    if (heroShotAt != null && now - heroShotAt > 110) heroShotAt = null;
    if (shakeAt != null && now - shakeAt > 260) { shakeAt = null; shakeAmp = 0; }
    if (hordeAt != null && now - hordeAt > 1500) hordeAt = null;

    if (state && seenRun && state.runId !== runId) {
      effects.clear();
      resetCues();
      lastSim = finite(state.time);
      if (pending.length) {
        const batch = pending.slice();
        effects.ingest(batch);
        remember(batch);
      }
    }
    if (state) {
      seenRun = true;
      runId = state.runId;
    }
    pending = [];
    effects.update(presentationDt(state));

    if (sceneCtx) {
      paint(sceneCtx, state, viewUi, now, true);
      sharpen(display);
      display.setTransform(1, 0, 0, 1, 0, 0);
      display.globalAlpha = 1;
      display.fillStyle = LETTERBOX;
      display.fillRect(0, 0, canvas.width, canvas.height);
      display.imageSmoothingEnabled = false;
      display.drawImage(scene, view.offsetX, view.offsetY, view.destW, view.destH);
    } else {
      sharpen(display);
      display.setTransform(1, 0, 0, 1, 0, 0);
      display.globalAlpha = 1;
      display.fillStyle = LETTERBOX;
      display.fillRect(0, 0, canvas.width, canvas.height);
      display.setTransform(view.destW / ARENA.width, 0, 0, view.destH / ARENA.height, view.offsetX, view.offsetY);
      sharpen(display);
      display.save();
      display.beginPath();
      display.rect(0, 0, ARENA.width, ARENA.height);
      display.clip();
      paint(display, state, viewUi, now, false);
      display.restore();
    }
  }

  function ingestEvents(events) {
    if (destroyed) return;
    const batch = normalizeBatch(events);
    if (!batch.length) return;
    for (let i = 0; i < batch.length; i++) pending.push(batch[i]);
    if (pending.length > MAX_BATCH) pending.splice(0, pending.length - MAX_BATCH);
    effects.ingest(batch);
    remember(batch);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    effects.clear();
    resetCues();
    pending = [];
    scene = null;
    sceneCtx = null;
  }

  return {draw, ingestEvents, resize, destroy, pointFromClient, hitSlot};
}
