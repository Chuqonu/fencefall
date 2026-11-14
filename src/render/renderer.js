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
 * A bilingual director or wave hint is drawn in the top margin.
 * The selected defender shows its rank just above the sprite.
 */

import {drawWorld} from './world.js';
import {drawDefender, defenderSize} from './defenders.js';
import {drawEnemy, enemySize} from './enemies.js';
import {createEffects} from './effects.js';
import {getUnitStats} from '../data/towers.js';
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
};

const ELEMENT_ALIAS = {
  bolt: 'bolt', physical: 'bolt', arrow: 'bolt', kinetic: 'bolt',
  fire: 'fire', burn: 'fire', flame: 'fire',
  frost: 'frost', ice: 'frost', cold: 'frost', slow: 'frost',
  lightning: 'lightning', shock: 'lightning', spark: 'lightning', chain: 'lightning',
  poison: 'poison', toxin: 'poison',
  support: 'support', heal: 'support', aura: 'support',
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
  const elements = elementsOf(projectile);
  const kind = elements[0];
  const color = PALETTE[kind] || PALETTE.bolt;
  const accent = PALETTE[elements[1]] || color;
  let dx = finite(projectile.vx) ?? 0;
  let dy = finite(projectile.vy) ?? 0;
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
  const crit = !!projectile.crit || (Array.isArray(projectile.tags) && projectile.tags.includes('crit'));
  const length = reduced ? 3 : kind === 'lightning' ? 8 : kind === 'fire' ? 6 : 5;
  const life = finite(projectile.life);
  const faded = life != null && life < 0.35;
  const at = (along, across) => [x + ux * along + px * across, y + uy * along + py * across];
  if (faded) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.3, life / 0.35);
  }
  for (let i = length; i >= 1; i--) {
    let across = 0;
    if (kind === 'lightning' && i % 2 === 1) {
      const side = (hashInt(x * 13 + y * 29 + i * 7 + (reduced ? 0 : Math.round(projectile.x))) & 1) ? 1 : -1;
      across = side;
    }
    const [tx, ty] = at(-i, across);
    plot(ctx, tx, ty, i < 3 ? color.core : color.edge);
    if (kind === 'fire' && i < 4) {
      const [fx, fy] = at(-i, 1);
      plot(ctx, fx, fy, color.main);
    }
  }
  if (kind === 'frost') {
    plot(ctx, x, y, color.core);
    for (const [dxp, dyp] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      plot(ctx, x + dxp, y + dyp, Math.abs(dxp) + Math.abs(dyp) > 1 ? color.core : color.edge);
    }
  } else if (kind === 'poison') {
    plot(ctx, x, y, color.core);
    plot(ctx, x - 1, y, color.main);
    plot(ctx, x, y - 1, color.main);
    plot(ctx, x + 1, y, color.edge);
    plot(ctx, x, y + 1, color.edge);
    plot(ctx, x + 1, y + 2, accent.core);
  } else if (kind === 'support') {
    plot(ctx, x - 1, y - 1, color.edge);
    plot(ctx, x + 1, y - 1, color.edge);
    plot(ctx, x - 1, y + 1, color.edge);
    plot(ctx, x + 1, y + 1, color.edge);
    plot(ctx, x, y - 1, color.core);
    plot(ctx, x - 1, y, color.core);
    plot(ctx, x + 1, y, color.core);
    plot(ctx, x, y + 1, color.core);
  } else if (kind === 'lightning') {
    const [lx, ly] = at(0, 0);
    plot(ctx, lx, ly, color.core);
    for (const across of [-1, 1]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, color.edge);
    }
    const [tipX, tipY] = at(1, 0);
    plot(ctx, tipX, tipY, color.core);
  } else if (kind === 'fire') {
    plot(ctx, x, y, color.core);
    const [wx, wy] = at(0, 1);
    const [mx, my] = at(0, -1);
    const [tx, ty] = at(1, 0);
    plot(ctx, wx, wy, color.main);
    plot(ctx, mx, my, color.main);
    plot(ctx, tx, ty, color.edge);
  } else {
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
  if (faded) ctx.restore();
}

function cloudColor(cloud) {
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  if (kind.includes('fire') || kind.includes('burn')) return '#e25a2a';
  if (kind.includes('poison') || kind.includes('toxin')) return '#6aaa3a';
  if (kind.includes('frost') || kind.includes('ice') || kind.includes('slow')) return '#8fd0e0';
  if (kind.includes('light')) return '#ffe14a';
  return '#c5d0c8';
}

function drawCloud(ctx, cloud, index) {
  const x = finite(cloud.x);
  const y = finite(cloud.y);
  const radius = finite(cloud.radius) ?? finite(cloud.range);
  if (x == null || y == null || radius == null || radius <= 0) return;
  const r = clamp(radius, 2, 120);
  const color = cloudColor(cloud);
  const seed = hashInt(index * 97 + Math.round(x) * 13 + Math.round(y) * 29);
  let alpha = 0.55;
  const remaining = finite(cloud.remaining);
  const duration = finite(cloud.duration);
  if (remaining != null && duration != null && duration > 0) alpha *= clamp(remaining / duration, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const step = r > 40 ? 5 : 4;
  for (let py = -r; py <= r; py += step) {
    for (let px = -r; px <= r; px += step) {
      if (px * px + py * py > r * r) continue;
      if ((hashInt(seed + px * 3 + py * 17) & 3) === 0) continue;
      ctx.fillRect(Math.round(x + px), Math.round(y + py), 2, 2);
    }
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

function bilingualHint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const en = typeof value.en === 'string' ? value.en.trim() : '';
  const zh = typeof value.zh === 'string' ? value.zh.trim() : '';
  if (!en || !zh) return null;
  return {en, zh};
}

function fieldHint(state) {
  if (!state || typeof state !== 'object') return null;
  return bilingualHint(state.director?.playerHint) || bilingualHint(state.systems?.waves?.current?.hint);
}

function textWidth(ctx, text) {
  if (ctx && typeof ctx.measureText === 'function') {
    try {
      const width = ctx.measureText(String(text)).width;
      if (Number.isFinite(width) && width > 0) return width;
    } catch {
      /* Estimate when the context cannot measure. */
    }
  }
  let width = 0;
  for (const ch of Array.from(String(text))) width += ch.charCodeAt(0) > 127 ? 11 : 6;
  return width;
}

function shrinkToWidth(ctx, word, maxWidth, lines) {
  let rest = word;
  while (rest && textWidth(ctx, rest) > maxWidth) {
    let fit = '';
    for (const ch of Array.from(rest)) {
      const next = fit + ch;
      if (textWidth(ctx, next) > maxWidth) break;
      fit = next;
    }
    if (!fit) {
      const first = Array.from(rest)[0] || '';
      if (!first) break;
      lines.push(first);
      rest = Array.from(rest).slice(1).join('');
      continue;
    }
    lines.push(fit);
    rest = Array.from(rest).slice(Array.from(fit).length).join('');
  }
  return rest;
}

function wrapHintLines(ctx, text, maxWidth) {
  const lines = [];
  const limited = Array.from(String(text)).slice(0, HINT_CHAR_LIMIT).join('');
  for (const paragraph of limited.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = shrinkToWidth(ctx, words[0], maxWidth, lines);
    for (let i = 1; i < words.length; i++) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (textWidth(ctx, next) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = shrinkToWidth(ctx, words[i], maxWidth, lines);
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function ellipsize(ctx, line, maxWidth) {
  const mark = '…';
  let out = line;
  while (out && textWidth(ctx, `${out}${mark}`) > maxWidth) out = Array.from(out).slice(0, -1).join('');
  return `${out}${mark}`;
}

function drawFieldHint(ctx, state, ui) {
  const hint = fieldHint(state);
  if (!hint || typeof ctx.fillText !== 'function') return;
  const text = hint[activeLanguage(state, ui)];
  if (!text) return;
  const maxWidth = ARENA.width - 16;
  ctx.save();
  try {
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let lines = wrapHintLines(ctx, text, maxWidth);
    if (lines.length > HINT_MAX_LINES) {
      lines = lines.slice(0, HINT_MAX_LINES);
      lines[HINT_MAX_LINES - 1] = ellipsize(ctx, lines[HINT_MAX_LINES - 1], maxWidth);
    }
    if (!lines.length) return;
    const lineHeight = 13;
    const blockWidth = Math.min(maxWidth, Math.max(...lines.map((line) => textWidth(ctx, line))));
    const bandHeight = Math.min(HINT_BAND, lines.length * lineHeight + 6);
    const x = Math.round((ARENA.width - blockWidth) / 2);
    const y = 3;
    if (typeof ctx.beginPath === 'function' && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(0, 0, ARENA.width, HINT_BAND);
      ctx.clip();
    }
    ctx.fillStyle = 'rgba(8, 14, 16, 0.78)';
    ctx.fillRect(x - 4, 1, Math.ceil(blockWidth) + 8, bandHeight - 1);
    for (let i = 0; i < lines.length; i++) {
      const lx = x;
      const ly = y + i * lineHeight;
      ctx.fillStyle = '#0c1216';
      ctx.fillText(lines[i], lx - 1, ly);
      ctx.fillText(lines[i], lx + 1, ly);
      ctx.fillText(lines[i], lx, ly - 1);
      ctx.fillText(lines[i], lx, ly + 1);
      ctx.fillStyle = '#f4efe2';
      ctx.fillText(lines[i], lx, ly);
    }
  } catch {
    /* Hint text is optional. A missing text API must not blank the field. */
  } finally {
    ctx.restore();
  }
}

// Rank 1–4 sits in the open band above the selected sprite, clear of its body.
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
        pushCapped(shots, {
          at,
          x: finite(event.x),
          y: finite(event.y),
          sourceId: idOf(event.sourceId, event.unitId, typeof event.source === 'string' ? event.source : null),
        });
      } else if (type === 'fence_hit') {
        fenceAt = at;
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

  function paint(ctx, state, ui, now, logicalBuffer) {
    const reduced = !!(ui.settings && ui.settings.reducedMotion) || !!ui.reducedMotion;
    const selected = normalizeSlot(ui.selectedSlot);
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

    isolate(ctx, () => drawWorld(ctx, state, {time: visualTime, reducedMotion: reduced}));

    const clouds = Array.isArray(state.clouds) ? state.clouds : [];
    const cloudCount = Math.min(clouds.length, MAX_CLOUDS);
    const cloudStart = clouds.length - cloudCount;
    for (let i = cloudStart; i < clouds.length; i++) {
      if (clouds[i]) drawCloud(ctx, clouds[i], i);
    }

    if (showRange) drawRange(ctx, state, selected, false, warned, rangeCache);

    const slots = Array.isArray(state.slots) ? state.slots : [];
    if (hover >= 0 && hover !== selected) fillSlot(ctx, slotBox(slots[hover], hover), 'rgba(241, 238, 226, 0.08)');
    if (selected >= 0) fillSlot(ctx, slotBox(slots[selected], selected), 'rgba(240, 203, 114, 0.14)');

    const enemies = orderedEnemies(state);
    const anchors = new Array(enemies.length);
    const enemiesById = Object.create(null);
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.id != null) enemiesById[enemy.id] = enemy;
      const anchor = enemyAnchor(enemy);
      anchors[i] = anchor;
      const flash = enemyFlash(enemy, hits, now, flashSpan);
      isolate(ctx, () => drawEnemy(ctx, enemy, anchor.x, anchor.y, {time: visualTime, scale: 1, flash}));
      if (!enemy.dead && flash <= 0.4) {
        const tint = statusTintColor(enemy);
        if (tint) isolate(ctx, () => drawStatusTint(ctx, enemy, anchor, tint, visualTime));
        if (statusLive(enemy, 'stun')) isolate(ctx, () => drawStunFrame(ctx, anchor));
      }
    }

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

    drawFence(ctx, state, visualTime, cueStrength(fenceAt, now, reduced ? 100 : 200), reduced);

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
    void drawFieldHint;
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
