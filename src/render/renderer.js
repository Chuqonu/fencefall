/**
 * Fencefall v5 — PvZ2-Style Native Retina HD Vector Battlefield Renderer.
 *
 * Draws directly onto the high-DPI display canvas (2×/3× Retina) in ARENA logical
 * space (360×640) with full anti-aliasing, smooth fractional scaling, gradients,
 * bold cel-shaded silhouettes, 360° Hero aim tracking & recoil, and ZERO 2×5 grid.
 *
 * Simulation state and gameplay RNG are read-only. Presentation events arrive via
 * ingestEvents; this module never reads or drains state.events.
 */

import {drawWorld} from './world.js';
import {drawDefender, defenderSize} from './defenders.js';
import {drawEnemy, enemySize} from './enemies.js';
import {createEffects} from './effects.js';
import {getUnitStats} from '../data/towers.js';
import {ARENA, clamp, hitSlot as hitSlotAt, slotGeometry} from '../shared.js';

const LETTERBOX = '#0b1218';
const FIELD = '#101d24';
const INK = '#10161c';
const MAX_CUES = 48;
const MAX_BATCH = 200;
const MAX_PROJECTILES = 300;
const MAX_ENEMIES = 400;
const MAX_CLOUDS = 32;
const CUE_MS = 240;
const FLASH_MS = 150;
const RANGE_LIMIT = 900;
const HP_FILL = 4;
const SPRITE_GAP = 4;
const STATUS_CELL = 10;
const STATUS_GAP = 3;

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

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.createLinearGradient === 'function'
    && typeof ctx.createRadialGradient === 'function'
  );
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function enableSmooth(ctx) {
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  if ('lineJoin' in ctx) ctx.lineJoin = 'round';
  if ('lineCap' in ctx) ctx.lineCap = 'round';
}

function isolate(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function context2d(target, opaque) {
  if (opaque) {
    try {
      const ctx = target.getContext('2d', {alpha: false});
      if (ctx) return ctx;
    } catch {
      /* options bag is optional */
    }
  }
  return target.getContext('2d');
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
  let width = Math.max(18, Math.round((finite(enemy.radius) ?? 12) * 2));
  let height = width;
  const sized = enemySize(enemy);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function measureDefender(unit) {
  let width = 50;
  let height = 54;
  const sized = defenderSize(unit);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
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

// =========================================================================
// HD VECTOR HP BARS, TARGET LOCK & STATUS BADGES
// =========================================================================
function drawHpBar(ctx, x, y, width, hp, maxHp, emphasize, isBoss = false) {
  if (!Number.isFinite(hp)) return;
  const max = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : Math.max(hp, 1);
  const ratio = clamp(hp / max, 0, 1);
  const barH = isBoss ? 6.5 : HP_FILL;
  const fillW = Math.max(0, Math.min(width, width * ratio));

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#101418';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 1), Math.round(width + 2), Math.round(barH + 2));
    ctx.fillStyle = ratio > 0.55 ? '#6cd458' : ratio > 0.28 ? '#f4c046' : '#ef5244';
    if (fillW > 0) ctx.fillRect(Math.round(x), Math.round(y), Math.round(fillW), Math.round(barH));
    return;
  }

  ctx.save();
  rRect(ctx, x - 1.2, y - 1.2, width + 2.4, barH + 2.4, (barH + 2.4) / 2);
  ctx.fillStyle = 'rgba(10, 15, 20, 0.88)';
  ctx.fill();
  ctx.strokeStyle = isBoss ? '#ff8b78' : 'rgba(235, 242, 246, 0.65)';
  ctx.lineWidth = isBoss ? 1.4 : 0.9;
  ctx.stroke();

  if (fillW > 0.5) {
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    if (isBoss) {
      grad.addColorStop(0, emphasize ? '#ffd0c6' : '#ff6b5a');
      grad.addColorStop(1, emphasize ? '#ff7c68' : '#b41e28');
    } else if (ratio > 0.55) {
      grad.addColorStop(0, emphasize ? '#d6ff9e' : '#8ef068');
      grad.addColorStop(1, emphasize ? '#8ed856' : '#409c32');
    } else if (ratio > 0.28) {
      grad.addColorStop(0, emphasize ? '#ffef9c' : '#ffd258');
      grad.addColorStop(1, emphasize ? '#f2b838' : '#c87e1c');
    } else {
      grad.addColorStop(0, emphasize ? '#ffd0c4' : '#ff6852');
      grad.addColorStop(1, emphasize ? '#f0624c' : '#b82420');
    }
    rRect(ctx, x, y, fillW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Specular highlight strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    rRect(ctx, x + 0.6, y + 0.5, Math.max(0, fillW - 1.2), barH * 0.42, barH / 4);
    ctx.fill();
  }
  ctx.restore();
}

function drawTargetMark(ctx, x, y, width, isBoss = false) {
  const h = isBoss ? 6.5 : HP_FILL;
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(Math.round(x - 4), Math.round(y - 1), 2, 2);
    ctx.fillRect(Math.round(x + width + 2), Math.round(y - 1), 2, 2);
    return;
  }
  ctx.save();
  ctx.strokeStyle = '#fff2a6';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  // Left bracket
  ctx.moveTo(x - 2, y - 2.2);
  ctx.lineTo(x - 4.5, y - 2.2);
  ctx.lineTo(x - 4.5, y + h + 2.2);
  ctx.lineTo(x - 2, y + h + 2.2);
  // Right bracket
  ctx.moveTo(x + width + 2, y - 2.2);
  ctx.lineTo(x + width + 4.5, y - 2.2);
  ctx.lineTo(x + width + 4.5, y + h + 2.2);
  ctx.lineTo(x + width + 2, y + h + 2.2);
  ctx.stroke();
  ctx.restore();
}

function drawStatusIcon(ctx, status, cx, cy, r) {
  const type = String(status.type || '');
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = type === 'burn' ? '#ff6a28' : type === 'poison' ? '#70d448' : type === 'slow' ? '#78e6ff' : '#ffe25a';
    ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), 4, 4);
    return;
  }
  ctx.save();
  // Crisp circular badge plate
  ctx.fillStyle = 'rgba(10, 16, 22, 0.88)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(225, 236, 240, 0.72)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  if (type === 'burn') {
    ctx.fillStyle = '#ff6824';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.65);
    ctx.quadraticCurveTo(cx + r * 0.6, cy, cx, cy + r * 0.62);
    ctx.quadraticCurveTo(cx - r * 0.6, cy, cx, cy - r * 0.65);
    ctx.fill();
    ctx.fillStyle = '#fff08a';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.16, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'poison') {
    ctx.fillStyle = '#74d644';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.62);
    ctx.quadraticCurveTo(cx + r * 0.58, cy + r * 0.12, cx, cy + r * 0.58);
    ctx.quadraticCurveTo(cx - r * 0.58, cy + r * 0.12, cx, cy - r * 0.62);
    ctx.fill();
    ctx.fillStyle = '#e8ffc0';
    ctx.beginPath();
    ctx.arc(cx - r * 0.14, cy + r * 0.08, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'slow') {
    ctx.strokeStyle = '#90f0ff';
    ctx.lineWidth = 1.25;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const dx = Math.cos(a) * r * 0.6;
      const dy = Math.sin(a) * r * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'stun') {
    ctx.fillStyle = '#ffe252';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 === 0 ? r * 0.66 : r * 0.28;
      const a = (k * Math.PI) / 4;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'brittle') {
    ctx.strokeStyle = '#e0a8ff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.15, cy - r * 0.05);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.12);
    ctx.lineTo(cx + r * 0.45, cy + r * 0.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  const r = STATUS_CELL * 0.5;
  const stride = STATUS_CELL + 2;
  const totalW = shown.length * stride - 2;
  let cx = anchorX - totalW / 2 + r;
  const cy = y + r;
  for (let i = 0; i < shown.length; i++) {
    drawStatusIcon(ctx, shown[i], cx, cy, r);
    cx += stride;
  }
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

// Smooth cel-shaded status auras around affected zombies (zero blocky pixel tint wash)
function drawStatusAura(ctx, enemy, anchor, time, reduced) {
  if (!isRichCtx(ctx)) return;
  const isStun = statusLive(enemy, 'stun');
  const isBurn = statusLive(enemy, 'burn');
  const isSlow = statusLive(enemy, 'slow');
  const isPoison = statusLive(enemy, 'poison');
  if (!isStun && !isBurn && !isSlow && !isPoison) return;

  const cx = anchor.x;
  const cy = anchor.y - anchor.size.height * 0.45;
  const rx = anchor.size.width * 0.56;
  const ry = anchor.size.height * 0.48;

  ctx.save();
  if (isSlow) {
    // Frost crystalline ring at feet
    ctx.fillStyle = 'rgba(116, 232, 255, 0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, anchor.y - 2, rx * 0.95, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(184, 248, 255, 0.78)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  if (isBurn) {
    // Rising flickering fire motes
    const pulse = reduced ? 0.8 : 0.72 + 0.28 * Math.sin(time * 16 + cx);
    ctx.fillStyle = `rgba(255, 114, 38, ${(0.22 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.82, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 2; k++) {
      const fx = cx + (k === 0 ? -rx * 0.45 : rx * 0.42);
      const rise = reduced ? 3 : ((time * 24 + k * 7 + cx) % 10);
      ctx.fillStyle = '#ff7426';
      ctx.beginPath();
      ctx.arc(fx, cy + 4 - rise, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff08a';
      ctx.beginPath();
      ctx.arc(fx, cy + 4 - rise, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isPoison) {
    // Bubbling green toxin droplets
    for (let k = 0; k < 2; k++) {
      const px = cx + (k === 0 ? -rx * 0.35 : rx * 0.38);
      const rise = reduced ? 2 : ((time * 18 + k * 5 + cy) % 9);
      ctx.fillStyle = '#84e84c';
      ctx.beginPath();
      ctx.arc(px, cy + 3 - rise, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isStun) {
    // Classic PvZ2 cartoon orbiting gold stun stars above the zombie's head!
    const headY = anchor.y - anchor.size.height - 2;
    const orbitRx = Math.max(8, anchor.size.width * 0.36);
    const orbitRy = 3.2;
    ctx.strokeStyle = 'rgba(255, 224, 96, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, headY, orbitRx, orbitRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const ang = (reduced ? 0 : time * 5.2) + (k * Math.PI * 2) / 3;
      const sx = cx + Math.cos(ang) * orbitRx;
      const sy = headY + Math.sin(ang) * orbitRy;
      ctx.fillStyle = '#ffe658';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let p = 0; p < 8; p++) {
        const rr = p % 2 === 0 ? 3.2 : 1.3;
        const a = (p * Math.PI) / 4;
        const vx = sx + Math.cos(a) * rr;
        const vy = sy + Math.sin(a) * rr;
        if (p === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR PROJECTILES
// =========================================================================
function drawProjectile(ctx, projectile, target, reduced) {
  const x = projectile.x;
  const y = projectile.y;
  const rich = isRichCtx(ctx);

  if (projectile.team === 'enemy') {
    if (!rich) {
      ctx.fillStyle = '#8ce84c';
      ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
      return;
    }
    ctx.save();
    // Luminous acid glow
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 9);
    glow.addColorStop(0, 'rgba(170, 255, 86, 0.55)');
    glow.addColorStop(1, 'rgba(130, 224, 52, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    // Acid droplet body
    ctx.fillStyle = '#9cf04e';
    ctx.strokeStyle = '#244a12';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 6.5);
    ctx.quadraticCurveTo(x + 5, y, x, y + 5.2);
    ctx.quadraticCurveTo(x - 5, y, x, y - 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2ffd0';
    ctx.beginPath();
    ctx.arc(x - 1.2, y + 0.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const ink = projectileInk(projectile);
  const kind = ink.kind;
  const color = ink.color;
  const tags = Array.isArray(projectile.tags) ? projectile.tags : [];
  const isSplit = tags.includes('split');
  const isCryoBarrage = tags.includes('cryo_barrage');
  const crit = !!projectile.crit || tags.includes('crit');

  let dx = finite(projectile.vx) ?? 0;
  let dy = finite(projectile.vy) ?? 0;
  if (dx === 0 && dy === 0 && finite(projectile.dirx) != null && finite(projectile.diry) != null) {
    dx = projectile.dirx;
    dy = projectile.diry;
  }
  if (dx === 0 && dy === 0 && target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    dx = target.x - x;
    dy = target.y - y;
  }
  if (dx === 0 && dy === 0) dy = -1;
  const angle = Math.atan2(dy, dx);
  const life = finite(projectile.life);
  const alpha = life != null && life < 0.35 ? Math.max(0.3, life / 0.35) : 1;

  if (!rich) {
    ctx.fillStyle = color.main;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (isCryoBarrage) {
    // Sleek faceted translucent Cryo Ice Lance
    const tailLen = reduced ? 10 : 20;
    const tailGrad = ctx.createLinearGradient(-tailLen, 0, 5, 0);
    tailGrad.addColorStop(0, 'rgba(72, 206, 245, 0)');
    tailGrad.addColorStop(0.5, 'rgba(130, 236, 255, 0.72)');
    tailGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-tailLen, 0);
    ctx.lineTo(-2, -3.6);
    ctx.lineTo(9, 0);
    ctx.lineTo(-2, 3.6);
    ctx.closePath();
    ctx.fill();

    // Faceted crystal spearhead
    ctx.fillStyle = '#92eeff';
    ctx.strokeStyle = '#185470';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(9.5, 0);
    ctx.lineTo(0, -4.2);
    ctx.lineTo(-5.5, 0);
    ctx.lineTo(0, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7.5, 0);
    ctx.lineTo(0, -1.8);
    ctx.lineTo(-2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  if (isSplit) {
    // Blazing gold-crimson shrapnel dart
    const tailLen = reduced ? 7 : 13;
    const tailGrad = ctx.createLinearGradient(-tailLen, 0, 4, 0);
    tailGrad.addColorStop(0, 'rgba(255, 118, 38, 0)');
    tailGrad.addColorStop(1, '#ffe478');
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-tailLen, 0);
    ctx.lineTo(0, -2.5);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 2.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb838';
    ctx.strokeStyle = '#681c0e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-1, -2.8);
    ctx.lineTo(-3.5, 0);
    ctx.lineTo(-1, 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Luminous soft halo so projectiles pop cleanly over hordes
  const haloR = crit ? 10 : 7;
  const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, haloR);
  halo.addColorStop(0, crit ? 'rgba(255, 238, 126, 0.6)' : 'rgba(255, 212, 118, 0.36)');
  halo.addColorStop(1, 'rgba(255, 212, 118, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Smooth tapered energy wake
  const tailLen = reduced ? 7 : kind === 'hero' ? 16 : kind === 'lightning' ? 17 : 13;
  const tailGrad = ctx.createLinearGradient(-tailLen, 0, 3, 0);
  tailGrad.addColorStop(0, 'rgba(255, 240, 190, 0)');
  tailGrad.addColorStop(0.55, color.main);
  tailGrad.addColorStop(1, color.core);
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-tailLen, 0);
  ctx.lineTo(-1, crit ? -3.4 : -2.6);
  ctx.lineTo(4, 0);
  ctx.lineTo(-1, crit ? 3.4 : 2.6);
  ctx.closePath();
  ctx.fill();

  // Sharp PvZ2-style projectile head
  if (kind === 'hero') {
    const grad = ctx.createLinearGradient(-4, -3.5, 7, 3.5);
    grad.addColorStop(0, '#fff4b8');
    grad.addColorStop(0.5, crit ? '#ffd648' : '#ff8c38');
    grad.addColorStop(1, color.main);
    ctx.fillStyle = grad;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.quadraticCurveTo(3, -4.0, -3.8, -2.4);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-3.8, 2.4);
    ctx.quadraticCurveTo(3, 4.0, 8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hot white specular core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(2.2, 0, 3.1, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'fire') {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(1, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'frost') {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(0, -3.6);
    ctx.lineTo(-4.5, 0);
    ctx.lineTo(0, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(0.5, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-3, -2.8);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3, 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(1.2, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp gold 4-point star glint for critical shots
  if (crit) {
    ctx.fillStyle = '#fff5a6';
    ctx.strokeStyle = '#d98a14';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 6.2 : 1.8;
      const a = (i * Math.PI) / 4;
      const px = 1 + Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// =========================================================================
// HD VECTOR GROUND HAZARDS (NAPALM FIRE SEA / FROST / POISON CLOUDS)
// =========================================================================
function cloudColor(cloud) {
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  if (kind.includes('napalm') || kind.includes('shrapnel') || kind.includes('fire') || kind.includes('burn')) return '#ff5a20';
  if (kind.includes('poison') || kind.includes('toxin') || kind.includes('miasma')) return '#6aaa3a';
  if (kind.includes('frost') || kind.includes('ice') || kind.includes('slow')) return '#7ee4ff';
  if (kind.includes('light')) return '#ffe14a';
  return '#74c47a';
}

function drawCloud(ctx, cloud, index, time = 0, reduced = false) {
  const x = finite(cloud.x);
  const y = finite(cloud.y);
  const radius = finite(cloud.radius) ?? finite(cloud.range);
  if (x == null || y == null || radius == null || radius <= 0) return;
  const r = clamp(radius, 4, 120);
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  const isFireSea = kind.includes('napalm') || kind.includes('shrapnel') || kind.includes('fire');
  const color = cloudColor(cloud);
  const seed = hashInt(index * 97 + Math.round(x) * 13 + Math.round(y) * 29);
  let fade = 1;
  const remaining = finite(cloud.remaining);
  const duration = finite(cloud.duration);
  if (remaining != null && duration != null && duration > 0) fade = clamp(remaining / duration, 0, 1);

  if (!isRichCtx(ctx)) {
    ctx.save();
    ctx.globalAlpha = 0.25 * fade;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
    ctx.restore();
    return;
  }

  ctx.save();
  if (isFireSea) {
    const flicker = reduced ? 0.9 : (0.82 + 0.18 * Math.sin(time * 13 + index));
    // Glowing layered magma fire pool
    const pool = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    pool.addColorStop(0, `rgba(255, 224, 96, ${(0.44 * fade * flicker).toFixed(3)})`);
    pool.addColorStop(0.5, `rgba(255, 98, 24, ${(0.34 * fade * flicker).toFixed(3)})`);
    pool.addColorStop(0.86, `rgba(196, 36, 14, ${(0.22 * fade).toFixed(3)})`);
    pool.addColorStop(1, 'rgba(180, 24, 10, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing dashed scorched ring
    ctx.strokeStyle = `rgba(255, 166, 62, ${(0.62 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash?.([6, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.96, r * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);

    // Stylized cel-shaded cartoon flame tongues dancing across the fire sea
    const flames = Math.min(11, Math.max(5, Math.round(r / 6)));
    for (let k = 0; k < flames; k++) {
      const h = hashInt(seed + k * 37);
      const ang = ((h & 255) / 255) * Math.PI * 2;
      const dist = (((h >>> 8) & 255) / 255) * (r * 0.72);
      const fx = x + Math.cos(ang) * dist;
      const fy = y + Math.sin(ang) * dist * 0.78;
      const sway = reduced ? 0 : Math.sin(time * 12 + k * 1.7) * 2.2;
      const fh = (8 + (h % 6)) * (reduced ? 0.9 : 0.8 + 0.28 * Math.sin(time * 15 + k * 2.3));
      const fw = 4.2 + (h % 3);

      ctx.globalAlpha = 0.84 * fade;
      ctx.fillStyle = '#ff5418';
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy);
      ctx.quadraticCurveTo(fx - fw * 0.8, fy - fh * 0.65, fx + sway, fy - fh);
      ctx.quadraticCurveTo(fx + fw * 0.8, fy - fh * 0.65, fx + fw, fy);
      ctx.quadraticCurveTo(fx, fy + 2.5, fx - fw, fy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffe568';
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.45, fy - 0.5);
      ctx.quadraticCurveTo(fx - fw * 0.3, fy - fh * 0.42, fx + sway * 0.6, fy - fh * 0.62);
      ctx.quadraticCurveTo(fx + fw * 0.3, fy - fh * 0.42, fx + fw * 0.45, fy - 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Soft translucent frost / poison hazard pool
  const pool = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  pool.addColorStop(0, color);
  pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = 0.24 * fade;
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.44 * fade;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.setLineDash?.([5, 4]);
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.82, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash?.([]);

  // Drifting bubbles / frost motes
  ctx.globalAlpha = 0.65 * fade;
  ctx.fillStyle = color;
  const count = Math.min(9, Math.max(4, Math.round(r / 7)));
  for (let k = 0; k < count; k++) {
    const h = hashInt(seed + k * 23);
    const ang = ((h & 255) / 255) * Math.PI * 2;
    const dist = (((h >>> 8) & 255) / 255) * (r * 0.72);
    const rise = reduced ? 0 : ((time * 16 + k * 5) % 9);
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.78 - rise;
    ctx.beginPath();
    ctx.arc(px, py, 2.2 + (h % 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR ARMORED SWEEPER WAR-RIG (AUTO SKILL)
// =========================================================================
function drawSweepers(ctx, state, time, reduced) {
  const list = state.arsenal?.sweepers;
  if (!Array.isArray(list) || !list.length) return;
  const rich = isRichCtx(ctx);
  const treadShift = reduced ? 0 : (time * 48) % 6;

  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const sw = list[i];
    if (!sw || !Number.isFinite(sw.x) || !Number.isFinite(sw.y)) continue;
    const cx = sw.x;
    const cy = sw.y;
    const hw = Math.min(26, Math.max(20, (sw.halfWidth || 34) * 0.64));

    if (!rich) {
      ctx.fillStyle = '#4e6472';
      ctx.fillRect(Math.round(cx - hw), Math.round(cy - 20), Math.round(hw * 2), 40);
      continue;
    }

    // 1. Twin sweeping golden headlight cones
    for (const side of [-1, 1]) {
      const lx = cx + side * (hw - 7);
      const cone = ctx.createLinearGradient(lx, cy - 20, lx, cy - 66);
      cone.addColorStop(0, 'rgba(255, 242, 162, 0.36)');
      cone.addColorStop(1, 'rgba(255, 242, 162, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 3, cy - 20);
      ctx.lineTo(lx - 13, cy - 66);
      ctx.lineTo(lx + 13, cy - 66);
      ctx.lineTo(lx + 3, cy - 20);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Soft dark ground contact shadow
    ctx.fillStyle = 'rgba(6, 10, 14, 0.48)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, hw + 4, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Heavy armored treads with animated cleats
    for (const side of [-1, 1]) {
      const tx = side < 0 ? cx - hw : cx + hw - 6.5;
      rRect(ctx, tx, cy - 14, 6.5, 32, 2.6);
      ctx.fillStyle = '#182026';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.7;
      ctx.stroke();

      ctx.fillStyle = '#5a6b75';
      for (let ty = -12 + treadShift; ty < 16; ty += 6) {
        ctx.fillRect(tx + 1.2, cy + ty, 4.1, 2.2);
      }
    }

    // 4. Main beveled cel-shaded steel truck chassis
    const bw = (hw - 4.5) * 2;
    const bx = cx - bw / 2;
    const bodyGrad = ctx.createLinearGradient(bx, cy - 16, bx + bw, cy + 16);
    bodyGrad.addColorStop(0, '#627c8e');
    bodyGrad.addColorStop(0.5, '#3b505e');
    bodyGrad.addColorStop(1, '#22313b');
    rRect(ctx, bx, cy - 16, bw, 35, 6);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();

    // Hood & rear armor deck plates
    ctx.fillStyle = '#7b97a8';
    rRect(ctx, bx + 3, cy - 13.5, bw - 6, 8, 2.5);
    ctx.fill();
    ctx.fillStyle = '#4c6372';
    rRect(ctx, bx + 3, cy + 6, bw - 6, 10, 2.5);
    ctx.fill();

    // 5. Glossy angled cyan armor windshield
    const winGrad = ctx.createLinearGradient(bx + 4, cy - 5, bx + bw - 4, cy + 1);
    winGrad.addColorStop(0, '#a6f8ff');
    winGrad.addColorStop(0.55, '#3cc6ea');
    winGrad.addColorStop(1, '#186684');
    rRect(ctx, bx + 3.5, cy - 5.5, bw - 7, 6.5, 2.4);
    ctx.fillStyle = winGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Windshield specular glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.moveTo(bx + 6, cy - 4.5);
    ctx.lineTo(bx + 12, cy - 4.5);
    ctx.lineTo(bx + 9.5, cy - 0.5);
    ctx.lineTo(bx + 5.5, cy - 0.5);
    ctx.closePath();
    ctx.fill();

    // 6. Roof turret hatch & flashing tactical siren beacon
    ctx.fillStyle = '#2b3944';
    ctx.beginPath();
    ctx.arc(cx, cy + 7.5, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const sirenRed = Math.floor(time * 12) % 2 === 0;
    ctx.fillStyle = sirenRed ? '#ff543c' : '#ffe65e';
    ctx.beginPath();
    ctx.arc(cx, cy + 7.5, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 7. Heavy angled V-shaped steel ram-plow with hazard stripes
    ctx.beginPath();
    ctx.moveTo(cx, cy - 27);
    ctx.lineTo(cx + hw + 4, cy - 19);
    ctx.lineTo(cx + hw + 2, cy - 13);
    ctx.lineTo(cx, cy - 18.5);
    ctx.lineTo(cx - hw - 2, cy - 13);
    ctx.lineTo(cx - hw - 4, cy - 19);
    ctx.closePath();
    const plowGrad = ctx.createLinearGradient(cx, cy - 27, cx, cy - 13);
    plowGrad.addColorStop(0, '#eef5f8');
    plowGrad.addColorStop(0.5, '#a8bcc8');
    plowGrad.addColorStop(1, '#5a6e7a');
    ctx.fillStyle = plowGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Hazard gold accent chevrons on plow
    ctx.fillStyle = '#f8ca46';
    for (const sx of [-12, -4, 4, 12]) {
      ctx.fillRect(cx + sx - 2, cy - 19 + Math.abs(sx) * 0.22, 4, 2.4);
    }

    // Bright bumper headlights
    ctx.fillStyle = '#fff9d6';
    ctx.beginPath();
    ctx.arc(cx - hw + 7, cy - 16, 2.1, 0, Math.PI * 2);
    ctx.arc(cx + hw - 7, cy - 16, 2.1, 0, Math.PI * 2);
    ctx.fill();

    // 8. Curling exhaust puffs trailing behind rear deck
    if (!reduced) {
      for (let p = 0; p < 2; p++) {
        const phase = ((time * 3.4 + i * 0.4 + p * 0.5) % 1);
        const ex = cx + (p === 0 ? -hw + 8 : hw - 8);
        const ey = cy + 20 + phase * 18;
        ctx.fillStyle = `rgba(186, 200, 210, ${(0.48 * (1 - phase)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 3 + phase * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR ORBITAL PLASMA LASER (AUTO SKILL)
// =========================================================================
function drawBeams(ctx, state, time, reduced) {
  const list = state.arsenal?.beams;
  if (!Array.isArray(list) || !list.length) return;
  const rich = isRichCtx(ctx);
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const beam = list[i];
    if (!beam || !Number.isFinite(beam.x) || !(beam.life > 0)) continue;
    const maxLife = beam.maxLife > 0 ? beam.maxLife : 0.65;
    const ratio = clamp(beam.life / maxLife, 0, 1);
    const pulse = reduced ? 1 : (0.86 + 0.14 * Math.sin(time * 42 + i));
    const width = Math.max(14, (beam.width || 36) * (0.45 + 0.55 * ratio));
    const cx = beam.x;
    const bottom = ARENA.fenceY - 6;

    if (!rich) {
      ctx.globalAlpha = 0.7 * ratio;
      ctx.fillStyle = '#6cf0ff';
      ctx.fillRect(Math.round(cx - width / 2), 0, Math.round(width), bottom);
      continue;
    }

    // Smooth horizontal gradient plasma column
    const outerHalf = width * 0.85 * pulse;
    const colGrad = ctx.createLinearGradient(cx - outerHalf, 0, cx + outerHalf, 0);
    colGrad.addColorStop(0, 'rgba(34, 198, 255, 0)');
    colGrad.addColorStop(0.24, `rgba(62, 224, 255, ${(0.42 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.42, `rgba(168, 248, 255, ${(0.82 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.96 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.58, `rgba(168, 248, 255, ${(0.82 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.76, `rgba(62, 224, 255, ${(0.42 * ratio).toFixed(3)})`);
    colGrad.addColorStop(1, 'rgba(34, 198, 255, 0)');
    ctx.fillStyle = colGrad;
    ctx.fillRect(cx - outerHalf, 0, outerHalf * 2, bottom);

    // Animated descending orbital plasma rings
    if (!reduced) {
      const scan = (time * 480 + i * 73) % 76;
      ctx.strokeStyle = `rgba(232, 252, 255, ${(0.78 * ratio).toFixed(3)})`;
      ctx.lineWidth = 2.2;
      for (let sy = scan; sy < bottom; sy += 76) {
        ctx.beginPath();
        ctx.ellipse(cx, sy, width * 0.52, 4.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ground impact plasma flare at base
    const flare = ctx.createRadialGradient(cx, bottom - 2, 2, cx, bottom - 2, width * 0.95);
    flare.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * ratio).toFixed(3)})`);
    flare.addColorStop(0.45, `rgba(126, 244, 255, ${(0.65 * ratio).toFixed(3)})`);
    flare.addColorStop(1, 'rgba(56, 216, 255, 0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.ellipse(cx, bottom - 2, width * 0.95, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function ringRadius(value) {
  return Number.isFinite(value) && value > 0 ? clamp(value, 1, RANGE_LIMIT) : 0;
}

// Keep drawRange immediately before drawFence (tested by tests/range-ring.test.mjs).
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
  const cx = origin.x;
  const cy = origin.y;
  const primary = attack || aura;
  if (!primary) return;

  if (!isRichCtx(ctx)) {
    if (!strokeOnly) {
      ctx.fillStyle = 'rgba(240, 203, 114, 0.12)';
      ctx.fillRect(Math.round(cx - 8), Math.round(cy - 8), 16, 16);
    }
    return;
  }

  ctx.save();
  if (!strokeOnly) {
    // Soft translucent golden range wash + glowing selection ring under Hero's platform
    const wash = ctx.createRadialGradient(cx, cy, 18, cx, cy, primary);
    wash.addColorStop(0, attack ? 'rgba(248, 206, 98, 0.14)' : 'rgba(125, 206, 192, 0.14)');
    wash.addColorStop(0.85, attack ? 'rgba(248, 206, 98, 0.05)' : 'rgba(125, 206, 192, 0.05)');
    wash.addColorStop(1, 'rgba(248, 206, 98, 0.16)');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(cx, cy, primary, 0, Math.PI * 2);
    ctx.fill();

    // Subtle pulsing selection ring framing the Gunnery Platform
    ctx.strokeStyle = 'rgba(255, 232, 134, 0.9)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 48, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (attack) {
    ctx.strokeStyle = 'rgba(248, 208, 102, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash?.([8, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, attack, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);
  }
  if (aura && Math.abs(aura - attack) > 6) {
    ctx.strokeStyle = 'rgba(125, 206, 192, 0.82)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash?.([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, aura, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);
  }
  ctx.restore();
}

function drawFence(ctx, state, time, flash, reduced) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.maxHp) || fence.maxHp <= 0 || !Number.isFinite(fence.hp)) return;
  const ratio = clamp(fence.hp / fence.maxHp, 0, 1);
  const x = 24;
  const y = ARENA.fenceY - 8;
  const width = ARENA.width - 48;
  const barH = 5.5;
  const emphasize = !reduced && ratio <= 0.28 && Math.floor(time * 6) % 2 === 0;

  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.44 * flash;
    ctx.fillStyle = '#ff4c36';
    ctx.fillRect(0, ARENA.fenceY - 12, ARENA.width, 20);
    ctx.restore();
  }

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#141a20';
    ctx.fillRect(x - 1, y - 1, width + 2, 7);
    ctx.fillStyle = ratio > 0.6 ? '#74d658' : ratio > 0.3 ? '#f4c046' : '#e04c3c';
    ctx.fillRect(x, y, Math.round(width * ratio), 5);
    return;
  }

  ctx.save();
  // Recessed metallic wall HP track
  rRect(ctx, x - 1.5, y - 1.5, width + 3, barH + 3, 4);
  ctx.fillStyle = 'rgba(12, 18, 24, 0.9)';
  ctx.fill();
  ctx.strokeStyle = emphasize ? '#ff9688' : 'rgba(196, 216, 228, 0.5)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const fillW = width * ratio;
  if (fillW > 1) {
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    if (ratio > 0.6) {
      grad.addColorStop(0, '#96f26e');
      grad.addColorStop(1, '#3ea636');
    } else if (ratio > 0.3) {
      grad.addColorStop(0, '#ffdc64');
      grad.addColorStop(1, '#cf8418');
    } else if (emphasize) {
      grad.addColorStop(0, '#ffd4c8');
      grad.addColorStop(1, '#ff6a56');
    } else {
      grad.addColorStop(0, '#ff6d54');
      grad.addColorStop(1, '#b8221e');
    }
    rRect(ctx, x, y, fillW, barH, 3);
    ctx.fillStyle = grad;
    ctx.fill();

    // Gloss sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    rRect(ctx, x + 1, y + 0.6, Math.max(0, fillW - 2), barH * 0.4, 2);
    ctx.fill();
  }

  // Subtle quarter-segment ticks
  ctx.fillStyle = 'rgba(10, 16, 20, 0.45)';
  for (let i = 1; i < 4; i++) {
    ctx.fillRect(x + (width * i) / 4 - 0.5, y, 1, barH);
  }
  ctx.restore();
}

// =========================================================================
// ENEMY TELEGRAPH MARKS & SYNERGY TETHERS
// =========================================================================
function enemyAnchor(enemy) {
  const size = measureEnemy(enemy);
  return {
    size,
    x: enemy.x,
    y: enemy.y + size.height / 2,
  };
}

function enemyCueLayout(enemy, anchor) {
  const isBoss = enemy?.kind === 'boss' || enemy?.type === 'boss';
  const spriteTop = anchor.y - anchor.size.height;
  const barW = isBoss ? Math.min(72, Math.max(54, Math.round(anchor.size.width * 1.15))) : clamp(Math.round(anchor.size.width * 0.85), 16, 48);
  const barH = isBoss ? 6.5 : HP_FILL;
  const plateBottom = spriteTop - 2 - SPRITE_GAP;
  const barY = plateBottom - barH;
  return {
    isBoss,
    barX: anchor.x - barW / 2,
    barY,
    barW,
    statusY: (barY - 2) - STATUS_GAP - STATUS_CELL,
  };
}

function drawLeapMark(ctx, enemy, anchor) {
  const topY = anchor.y - anchor.size.height - 5;
  ctx.save();
  ctx.fillStyle = '#f8b83a';
  if (isRichCtx(ctx)) {
    rRect(ctx, anchor.x - 6, topY, 12, 3.5, 1.8);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(Math.round(anchor.x - 5), Math.round(topY), 10, 3);
  }
  ctx.restore();
}

function drawChargeMark(ctx, enemy, anchor) {
  if (!enemy || enemy.dead) return;
  const fusing = enemy.chargeTimer > 0 && enemy.chargeWindup > 0;
  const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
  const stopY = ARENA.fenceY - radius;
  const approaching = !fusing && enemy.chargeLit !== true && enemy.chargeGap > 0
    && enemy.y >= stopY - enemy.chargeGap && enemy.y < stopY - 0.75;
  if (!fusing && !approaching) return;
  const markY = anchor.y - anchor.size.height - 13;
  ctx.save();
  if (approaching) {
    ctx.fillStyle = '#ffbe32';
    if (isRichCtx(ctx)) {
      rRect(ctx, anchor.x - 6, markY, 12, 3.6, 1.8);
      ctx.fill();
    } else {
      ctx.fillRect(Math.round(anchor.x - 5), Math.round(markY), 10, 3);
    }
    ctx.restore();
    return;
  }
  const ratio = clamp(enemy.chargeTimer / enemy.chargeWindup, 0, 1);
  const w = Math.max(3, 18 * ratio);
  ctx.fillStyle = '#ff3e30';
  if (isRichCtx(ctx)) {
    rRect(ctx, anchor.x - w / 2, markY, w, 3.6, 1.8);
    ctx.fill();
  } else {
    ctx.fillRect(Math.round(anchor.x - w / 2), Math.round(markY), Math.round(w), 3);
  }
  ctx.restore();
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

function drawWardLinks(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(182, 232, 255, 0.78)';
  ctx.lineWidth = 2.0;
  ctx.setLineDash?.([4, 3]);
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
    ctx.moveTo(from.x, from.y - from.size.height * 0.5);
    ctx.lineTo(to.x, to.y - to.size.height * 0.5);
    ctx.stroke();
  }
  ctx.setLineDash?.([]);
  ctx.restore();
}

function drawBannerHaste(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 190, 68, 0.72)';
  ctx.lineWidth = 1.6;
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
    const y1 = to.y - to.size.height * 0.5;
    const bx = from.x;
    const by = from.y - from.size.height * 0.5;
    const len = Math.hypot(bx - x1, by - y1) || 1;
    const dash = Math.min(12, len);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ((bx - x1) / len) * dash, y1 + ((by - y1) / len) * dash);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMendLinks(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 236, 126, 0.8)';
  ctx.lineWidth = 2.0;
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
    ctx.moveTo(from.x, from.y - from.size.height * 0.5);
    ctx.lineTo(to.x, to.y - to.size.height * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWardBubble(ctx, enemy, anchor) {
  if (enemy.dead || !isRichCtx(ctx)) return;
  const cx = anchor.x;
  const cy = anchor.y - anchor.size.height * 0.48;
  const rx = anchor.size.width * 0.58;
  const ry = anchor.size.height * 0.56;
  ctx.save();
  ctx.strokeStyle = 'rgba(182, 236, 255, 0.85)';
  ctx.fillStyle = 'rgba(150, 224, 255, 0.14)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPriorityCrown(ctx, enemy, anchor) {
  if (!enemy || enemy.dead || !isRichCtx(ctx)) return;
  if (!(enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0)) return;
  const cx = anchor.x;
  const y = anchor.y - anchor.size.height - 13;
  ctx.save();
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx, y - 3.6);
  ctx.lineTo(cx + 3.2, y);
  ctx.lineTo(cx, y + 3.6);
  ctx.lineTo(cx - 3.2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHushHeroCue(ctx, anchorX, topY) {
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#8ce4d8';
    ctx.fillRect(Math.round(anchorX - 5), Math.round(topY - 6), 10, 3);
    return;
  }
  ctx.save();
  rRect(ctx, anchorX - 8, topY - 8, 16, 4.5, 2.2);
  ctx.fillStyle = '#7ce8da';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
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

function lerpAngle(current, target, factor) {
  let diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(diff) < 0.004) return target;
  return current + diff * factor;
}

// =========================================================================
// MAIN RENDERER INSTANCE
// =========================================================================
export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer requires a canvas');
  }
  const display = context2d(canvas, false);
  if (!display) throw new TypeError('createRenderer could not get a 2d context');

  const effects = createEffects();
  const warned = {stats: false};
  const rangeCache = {valid: false, state: null, slot: -1, stats: null};
  const hits = [];
  const shots = [];
  let fenceAt = null;
  let wallImmuneAt = null;
  let heroShotAt = null;
  let heroAimAngle = -Math.PI / 2;
  let heroAimTarget = -Math.PI / 2;
  let shakeAt = null;
  let shakeAmp = 0;
  let hordeAt = null;
  let pending = [];
  let runId;
  let seenRun = false;
  let lastSim = null;
  let lastFrameMs = null;
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
    fenceAt = null;
    wallImmuneAt = null;
    heroShotAt = null;
    heroAimAngle = -Math.PI / 2;
    heroAimTarget = -Math.PI / 2;
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
          const tx = finite(event.targetX) ?? finite(event.tx);
          const ty = finite(event.targetY) ?? finite(event.ty);
          if (tx != null && ty != null) {
            const ox = sx ?? ARENA.width / 2;
            const oy = sy ?? ARENA.frontY;
            const raw = Math.atan2(ty - oy, tx - ox);
            heroAimTarget = clamp(raw, -Math.PI * 0.94, -Math.PI * 0.06);
          }
        }
      } else if (type === 'fence_hit') {
        fenceAt = at;
        triggerShake(at, 1.8);
      } else if (type === 'wall_immune') {
        wallImmuneAt = at;
        triggerShake(at, 1.8);
      } else if (type === 'fence_surge') {
        triggerShake(at, 4.2);
      } else if (type === 'napalm_blast') {
        triggerShake(at, 3.4);
      } else if (type === 'orbital_beam') {
        triggerShake(at, 3.2);
      } else if (type === 'armored_car') {
        triggerShake(at, 2.4);
      } else if (type === 'em_strike') {
        triggerShake(at, 1.8);
      } else if (type === 'boss_enrage') {
        triggerShake(at, 2.8);
      } else if (type === 'corpse_explode') {
        triggerShake(at, 1.6);
      } else if (type === 'wave_horde') {
        hordeAt = at;
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
    const scale = fit > 0 ? fit : 1;
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

  function drawSurgeOverlay(ctx, state, time, reduced) {
    const timer = state.surge?.shieldTimer || 0;
    if (!(timer > 0)) return;
    const ratio = clamp(timer / 3, 0, 1);
    const elapsed = Math.max(0, 3 - timer);
    const shimmer = reduced ? 0.85 : (0.76 + 0.24 * Math.sin(time * 16));

    if (!isRichCtx(ctx)) {
      ctx.fillStyle = '#78e4ff';
      ctx.fillRect(0, ARENA.fenceY - 10, ARENA.width, 6);
      return;
    }

    ctx.save();
    // Luminous curved energy dome protecting the fortified wall
    const domeGrad = ctx.createLinearGradient(0, ARENA.fenceY - 22, 0, ARENA.fenceY);
    domeGrad.addColorStop(0, 'rgba(104, 232, 255, 0)');
    domeGrad.addColorStop(1, `rgba(104, 232, 255, ${(0.34 * shimmer).toFixed(3)})`);
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.moveTo(0, ARENA.fenceY);
    ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 24, ARENA.width, ARENA.fenceY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(176, 248, 255, ${(0.92 * shimmer).toFixed(3)})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(8, ARENA.fenceY - 6);
    ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 19, ARENA.width - 8, ARENA.fenceY - 6);
    ctx.stroke();

    // Golden shield duration meter
    const bw = (ARENA.width - 52) * ratio;
    if (bw > 1) {
      rRect(ctx, 26, ARENA.fenceY - 15, bw, 3, 1.5);
      ctx.fillStyle = '#ffd862';
      ctx.fill();
    }

    // Sweeping curved shockwave arc during initial 0.58s blast
    if (elapsed < 0.58) {
      const progress = elapsed / 0.58;
      const waveY = ARENA.fenceY - progress * 265;
      const fade = 1 - progress;
      ctx.strokeStyle = `rgba(120, 236, 255, ${(0.45 * fade).toFixed(3)})`;
      ctx.lineWidth = 14 * fade + 4;
      ctx.beginPath();
      ctx.moveTo(0, waveY + 18);
      ctx.quadraticCurveTo(ARENA.width / 2, waveY - 22, ARENA.width, waveY + 18);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 242, 182, ${(0.92 * fade).toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(0, waveY + 14);
      ctx.quadraticCurveTo(ARENA.width / 2, waveY - 24, ARENA.width, waveY + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paint(ctx, state, ui, now, frameDt) {
    const reduced = !!(ui.settings && ui.settings.reducedMotion) || !!ui.reducedMotion;
    const selected = normalizeSlot(ui.selectedSlot);
    const showRange = ui.range !== false;
    const time = finite(state?.time) ?? 0;
    const visualTime = reduced ? Math.round(time * 8) / 8 : time;
    const flashSpan = reduced ? 80 : FLASH_MS;
    rangeCache.valid = false;

    enableSmooth(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    if (!state) {
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
      return;
    }

    // Smooth camera shake on heavy combat impacts
    const shakeStr = !reduced && shakeAt != null ? cueStrength(shakeAt, now, 260) : 0;
    const shakeX = shakeStr > 0 ? Math.sin(now * 0.085) * shakeAmp * shakeStr : 0;
    const shakeY = shakeStr > 0 ? Math.cos(now * 0.11) * shakeAmp * 0.7 * shakeStr : 0;
    if (shakeX || shakeY) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    try {
      // 1. HD Vector Wasteland Highway, Fortified Wall & Central Commander Platform (ZERO 2×5 grid!)
      isolate(ctx, () => drawWorld(ctx, state, {time: visualTime, reducedMotion: reduced}));

      // 2. Ground Hazard Zones (Napalm Fire Sea, Frost, Poison)
      const clouds = Array.isArray(state.clouds) ? state.clouds : [];
      const cloudCount = Math.min(clouds.length, MAX_CLOUDS);
      const cloudStart = clouds.length - cloudCount;
      for (let i = cloudStart; i < clouds.length; i++) {
        if (clouds[i]) drawCloud(ctx, clouds[i], i, visualTime, reduced);
      }

      // 3. Soft Range Wash + Platform Selection Ring when Gunner is tapped
      if (showRange) drawRange(ctx, state, selected, false, warned, rangeCache);

      // 4. Enemies (Sorted back-to-front for crisp 2.5D depth)
      const enemies = orderedEnemies(state);
      const anchors = new Array(enemies.length);
      const enemiesById = Object.create(null);
      let leadEnemy = null;
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.id != null) enemiesById[enemy.id] = enemy;
        if (!enemy.dead && enemy.hp > 0 && (!leadEnemy || enemy.y > leadEnemy.y)) {
          leadEnemy = enemy;
        }
        const anchor = enemyAnchor(enemy);
        anchors[i] = anchor;
        const flash = enemyFlash(enemy, hits, now, flashSpan);
        isolate(ctx, () => {
          if (enemy.phased === true) ctx.globalAlpha = 0.42;
          drawEnemy(ctx, enemy, anchor.x, anchor.y, {time: visualTime, scale: 1, flash});
          if (enemy.phased === true) ctx.globalAlpha = 1;
        });
        if (!enemy.dead) {
          drawStatusAura(ctx, enemy, anchor, visualTime, reduced);
          if (enemy.wardShield > 0) drawWardBubble(ctx, enemy, anchor);
          if (enemy.leapTimer > 0) drawLeapMark(ctx, enemy, anchor);
          if (enemy.chargeGap > 0 || enemy.chargeTimer > 0) drawChargeMark(ctx, enemy, anchor);
          if (enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0) drawPriorityCrown(ctx, enemy, anchor);
        }
      }

      // 5. Zombie Synergy Tethers (Warden / Banner / Mender)
      isolate(ctx, () => {
        drawWardLinks(ctx, enemies, anchors);
        drawBannerHaste(ctx, enemies, anchors);
        drawMendLinks(ctx, enemies, anchors);
      });

      // 6. Armored Sweeper War-Rigs
      drawSweepers(ctx, state, visualTime, reduced);

      // 7. Smooth Hero Aim Tracking (track live lead zombie when idle between shots)
      const slots = Array.isArray(state.slots) ? state.slots : [];
      const recentlyShot = heroShotAt != null && (now - heroShotAt) < 420;
      if (!recentlyShot && leadEnemy) {
        const raw = Math.atan2(leadEnemy.y - ARENA.frontY, leadEnemy.x - ARENA.width / 2);
        heroAimTarget = clamp(raw, -Math.PI * 0.94, -Math.PI * 0.06);
      } else if (!recentlyShot && !leadEnemy) {
        heroAimTarget = -Math.PI / 2;
      }
      const aimFactor = reduced ? 1 : clamp(frameDt * 16, 0.18, 0.55);
      heroAimAngle = lerpAngle(heroAimAngle, heroAimTarget, aimFactor);
      const heroRecoil = heroShotAt != null ? cueStrength(heroShotAt, now, reduced ? 65 : 125) : 0;

      // 8. Wall Gunner (Hero anchored solidly on the Central Commander Platform)
      const hushed = boardHushed(enemies);
      for (let index = 0; index < slots.length; index++) {
        const slot = slots[index];
        const unit = slot?.unit;
        if (!unit) continue;
        const isHero = unit.kind === 'hero' || unit.type === 'hero';
        const size = measureDefender(unit);
        const origin = slotCenter(slot, index);
        const anchorX = origin.x;
        const anchorY = isHero ? origin.y + 18 : origin.y + size.height / 2;
        const flash = unitFlash(unit.id, shots, now, flashSpan);
        isolate(ctx, () => drawDefender(ctx, unit, anchorX, anchorY, {
          time: visualTime,
          scale: 1,
          flash,
          aimAngle: isHero ? heroAimAngle : -Math.PI / 2,
          recoil: isHero ? heroRecoil : 0,
          upgrades: unit.upgrades,
        }));
        if (hushed) drawHushHeroCue(ctx, anchorX, anchorY - size.height);
      }

      // 9. HD Vector Projectiles
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

      // 10. Orbital Plasma Laser Columns
      drawBeams(ctx, state, visualTime, reduced);

      // 11. Dashed Range Ring Stroke Overlay (when Hero is selected)
      if (showRange) drawRange(ctx, state, selected, true, warned, rangeCache);

      // 12. Crisp Enemy HP Bars, Target Reticles & Status Badges
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.dead) continue;
        const anchor = anchors[i];
        const cue = enemyCueLayout(enemy, anchor);
        const fresh = enemyFlash(enemy, hits, now, flashSpan) > 0.4;
        const maxHp = Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 ? enemy.maxHp : null;
        const low = maxHp != null && Number.isFinite(enemy.hp) && enemy.hp / maxHp <= 0.28;
        const emphasize = fresh || (!reduced && low && Math.floor(visualTime * 6) % 2 === 0);
        drawHpBar(ctx, cue.barX, cue.barY, cue.barW, enemy.hp, enemy.maxHp, emphasize, cue.isBoss);
        if (Number.isFinite(enemy.hp) && (fresh || targeted[enemy.id] === true)) {
          drawTargetMark(ctx, cue.barX, cue.barY, cue.barW, cue.isBoss);
        }
        drawStatuses(ctx, enemy, anchor.x, cue.statusY);
      }

      // 13. Wall Surge Shockwave, Aegis Block Flash & Wall HP Bar
      drawSurgeOverlay(ctx, state, visualTime, reduced);
      const aegisFlash = wallImmuneAt != null ? cueStrength(wallImmuneAt, now, reduced ? 120 : 240) : 0;
      if (aegisFlash > 0 && isRichCtx(ctx)) {
        ctx.save();
        ctx.strokeStyle = `rgba(140, 244, 255, ${(0.9 * aegisFlash).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(8, ARENA.fenceY - 6);
        ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 18, ARENA.width - 8, ARENA.fenceY - 6);
        ctx.stroke();
        ctx.restore();
      }
      drawFence(ctx, state, visualTime, cueStrength(fenceAt, now, reduced ? 100 : 200), reduced);

      // 14. Crimson Horizon Pulse on Horde Warning
      const hordeStr = hordeAt != null ? cueStrength(hordeAt, now, reduced ? 500 : 1500) : 0;
      if (hordeStr > 0 && isRichCtx(ctx)) {
        const beat = reduced ? 0.65 : (0.55 + 0.45 * Math.sin(now * 0.018));
        ctx.save();
        const grad = ctx.createLinearGradient(0, 0, 0, 68);
        grad.addColorStop(0, `rgba(236, 56, 48, ${(0.42 * hordeStr * beat).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(236, 56, 48, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, ARENA.width, 68);
        ctx.restore();
      }

      // 15. Combat VFX Particles, Lightning Arcs & Floating Damage Numbers
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
    } finally {
      if (shakeX || shakeY) ctx.restore();
    }
  }

  function draw(state, ui) {
    if (destroyed) return;
    const viewUi = ui && typeof ui === 'object' ? ui : {};
    resize();
    const now = nowMs();
    const frameDt = lastFrameMs == null ? 1 / 60 : clamp((now - lastFrameMs) / 1000, 0.001, 0.1);
    lastFrameMs = now;

    pruneList(hits, now);
    pruneList(shots, now);
    if (fenceAt != null && now - fenceAt > CUE_MS) fenceAt = null;
    if (wallImmuneAt != null && now - wallImmuneAt > 260) wallImmuneAt = null;
    if (heroShotAt != null && now - heroShotAt > 460) heroShotAt = null;
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

    // Direct Native High-DPI Vector Rendering (NO 360×640 offscreen pixel stretch!)
    enableSmooth(display);
    display.setTransform(1, 0, 0, 1, 0, 0);
    display.globalAlpha = 1;
    display.fillStyle = LETTERBOX;
    display.fillRect(0, 0, canvas.width, canvas.height);

    display.setTransform(view.destW / ARENA.width, 0, 0, view.destH / ARENA.height, view.offsetX, view.offsetY);
    enableSmooth(display);
    display.save();
    if (typeof display.beginPath === 'function' && typeof display.rect === 'function' && typeof display.clip === 'function') {
      display.beginPath();
      display.rect(0, 0, ARENA.width, ARENA.height);
      display.clip();
    }
    paint(display, state, viewUi, now, frameDt);
    display.restore();
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
  }

  return {draw, ingestEvents, resize, destroy, pointFromClient, hitSlot};
}
