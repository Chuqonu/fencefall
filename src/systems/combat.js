// Combat resolution. Caller advances time and only invokes this during an active
// playing step. This module does not read speed, does not advance time/tick,
// and does not decide victory or defeat.
//
// getUnitStats is the pre-aura stat block (rank, hero upgrades, profile bonuses
// already baked in by the catalog). Support auras are applied here and capped.
//
// On-hit status payload (applyStatus):
//   burn     power = dps, remaining = duration, tickTimer = 0
//   poison   power = dps, stacks = 1, maxStacks copied from stats, tickTimer = 0
//   slow     power = remaining speed factor (0.65 means 65% speed), not a slow percent
//   brittle  power = extra damage taken per stack (0.25 = +25%), capped by BRITTLE_CAP
//   stun     power = 1, remaining = duration; stunned enemies do not bite the fence
//
// Optional stats.mechanics strings honored here:
//   execute      ×1.35 damage when target hp/maxHp <= 0.40
//   fence_focus  ×1.25 damage when the enemy is biting or within 36px of contact
//   brittle      apply brittle 0.20 for 3s when stats.brittle is absent
//   stun         apply stun 0.45s when stats.stun is absent
//   multishot    one extra projectile at the second nearest target; the echo does not split
//
// Pierce is the number of extra bodies the shot may hit along its direction.
// Chain is the number of extra jumps to a new enemy within chainRange (default 70).
// A shot with both pierces first, then chains from the last direct hit.
// Crit is rolled when the shot is fired. Pierce keeps that roll. Each chain
// jump that connects rolls again, and only when the projectile's critChance
// is greater than 0. The opening hit does not roll a second time.
// Splash is full pre-armor damage to other enemy centers within the radius.
// Direct hits, pierce hits, and splash targets apply statuses. Armor and brittle apply inside
// damageEnemy, including damage from status ticks. Armor is a fractional
// reduction clamped to [0, 0.8].
//
// Ranged enemies set attackRange (pixels from their center to the fence line).
// Otherwise they bite only in contact (radius). Defender bolts live in
// state.projectiles. An enemy bolt is allowed only when team:'enemy' (or
// friendly:false); it flies in its dir and damages the fence when it crosses
// y = fenceY. It never hits defenders or other enemies.
//
// killEnemy awards kills, source unit.kills, and enemy.xp exactly once. It does
// not remove the body. updateCombat drops dead enemies at the end of the step.
// Engine cleanup may filter `dead` again but must not award kills or XP again.

import {ARENA, clamp, distance, emit, random, uid} from '../shared.js';
import {getUnitStats} from '../data/towers.js';
import {applyStatus} from './status.js';

export const AURA_DAMAGE_CAP = 0.6;
export const AURA_HASTE_CAP = 0.45;
export const BRITTLE_CAP = 1;
export const MIN_ATTACK_INTERVAL = 0.05;
export const ARMOR_CAP = 0.8;

const HIT_SLOP = 2;
const CONTACT_SLOP = 0.75;
const EXECUTE_THRESHOLD = 0.4;
const EXECUTE_MULTIPLIER = 1.35;
const FENCE_FOCUS_MULTIPLIER = 1.25;
const FENCE_FOCUS_PADDING = 36;
const DEFAULT_CHAIN_RANGE = 70;
const DEFAULT_CRIT_MULTIPLIER = 1.75;
const DEFAULT_PROJECTILE_SPEED = 300;
const BRITTLE_FALLBACK = {power: 0.2, duration: 3};
const STUN_FALLBACK = 0.45;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function simulationFrozen(state) {
  if (!state) return true;
  if (state.phase && state.phase !== 'playing') return true;
  if (state.paused || state.hiddenPaused) return true;
  return false;
}

function isTargetable(enemy) {
  return !!(enemy && !enemy.dead && enemy.hp > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
}

function isStunned(enemy) {
  const list = enemy?.statuses;
  if (!Array.isArray(list)) return false;
  for (const status of list) {
    if (status && status.type === 'stun' && status.remaining > 0) return true;
  }
  return false;
}

function brittleBonus(enemy) {
  const list = enemy?.statuses;
  if (!Array.isArray(list)) return 0;
  let bonus = 0;
  for (const status of list) {
    if (!status || status.type !== 'brittle' || !(status.remaining > 0)) continue;
    const stacks = Number.isFinite(status.stacks) ? status.stacks : 1;
    if (stacks <= 0) continue;
    bonus += Math.max(0, finite(status.power, 0)) * stacks;
  }
  return clamp(bonus, 0, BRITTLE_CAP);
}

function ensureStats(state) {
  if (!state.stats || typeof state.stats !== 'object') {
    state.stats = {damage: 0, fenceDamage: 0, merges: 0, crits: 0};
  }
  return state.stats;
}

function emitEvent(state, type, data) {
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, type, data);
}

function findUnit(state, id) {
  if (!id || !Array.isArray(state.slots)) return null;
  for (const slot of state.slots) {
    if (slot?.unit?.id === id) return slot.unit;
  }
  return null;
}

function preferTarget(candidate, best, candidateDistance, bestDistance) {
  if (!best) return true;
  const diff = candidateDistance - bestDistance;
  if (diff < -1e-4) return true;
  if (diff > 1e-4) return false;
  if ((candidate.y || 0) !== (best.y || 0)) return candidate.y > best.y;
  return String(candidate.id) < String(best.id);
}

function ignored(ignore, id) {
  if (!ignore) return false;
  for (let i = 0; i < ignore.length; i++) {
    if (ignore[i] === id) return true;
  }
  return false;
}

function nearestEnemy(state, origin, range, ignore) {
  if (!(range > 0)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || ignored(ignore, enemy.id)) continue;
    const dist = distance(origin, enemy);
    if (dist <= range && preferTarget(enemy, best, dist, bestDistance)) {
      best = enemy;
      bestDistance = dist;
    }
  }
  return best;
}

function enemyById(state, id) {
  if (!id) return null;
  for (const enemy of state.enemies) {
    if (enemy?.id === id && isTargetable(enemy)) return enemy;
  }
  return null;
}

/**
 * Apply pre-armor damage. `amount` is the final outgoing damage (crit already
 * included when options.crit is set). Armor and brittle are applied here.
 * Returns HP actually removed. Usable as the status damage callback.
 */
export function damageEnemy(state, enemy, amount, options = {}) {
  if (!state || !enemy || enemy.dead) return 0;
  const opts = options || {};
  if (!Number.isFinite(enemy.hp)) return 0;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy, opts.sourceId);
    return 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const armor = clamp(finite(enemy.armor, 0), 0, ARMOR_CAP);
  const reduced = amount * (1 - armor) * (1 + brittleBonus(enemy));
  if (!Number.isFinite(reduced) || reduced <= 0) return 0;
  const dealt = Math.min(enemy.hp, reduced);
  enemy.hp -= dealt;
  const stats = ensureStats(state);
  stats.damage = finite(stats.damage, 0) + dealt;
  if (opts.crit) stats.crits = finite(stats.crits, 0) + 1;
  emitEvent(state, 'hit', {
    sourceId: opts.sourceId || null,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    damage: dealt,
    crit: !!opts.crit,
    attack: opts.type || 'hit',
    towerType: opts.towerType || null
  });
  if (enemy.hp <= 1e-6) {
    enemy.hp = 0;
    killEnemy(state, enemy, opts.sourceId);
  }
  return dealt;
}

/** Award kill credit, XP from enemy.xp, and a kill event. Repeat calls are no-ops. */
export function killEnemy(state, enemy, sourceId) {
  if (!state || !enemy || enemy.dead) return false;
  enemy.dead = true;
  enemy.hp = 0;
  enemy.attacking = false;
  state.kills = finite(state.kills, 0) + 1;
  const xpValue = Number(enemy.xp);
  const xp = Number.isFinite(xpValue) ? Math.max(0, xpValue) : 0;
  state.xp = finite(state.xp, 0) + xp;
  const unit = findUnit(state, sourceId);
  if (unit) unit.kills = finite(unit.kills, 0) + 1;
  emitEvent(state, 'kill', {
    sourceId: sourceId || null,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    xp,
    towerType: unit?.type || null
  });
  return true;
}

function pointDirection(projectile, target) {
  const dx = target.x - projectile.x;
  const dy = target.y - projectile.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  projectile.dirx = dx / len;
  projectile.diry = dy / len;
  return true;
}

function segmentCircleT(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  if (a < 1e-10) return c <= 0 ? 0 : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  if (c <= 0) return 0;
  return null;
}

function firstHit(state, projectile, x1, y1, x2, y2) {
  const pierceLeft = Math.floor(finite(projectile.pierce, 0));
  const selective = pierceLeft <= 0 && !!projectile.targetId;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let best = null;
  let bestT = Infinity;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || ignored(projectile.visited, enemy.id)) continue;
    if (selective && enemy.id !== projectile.targetId) continue;
    const radius = Math.max(4, finite(enemy.radius, 12)) + HIT_SLOP;
    const t = segmentCircleT(x1, y1, x2, y2, enemy.x, enemy.y, radius);
    if (t == null) continue;
    if (!best || t < bestT - 1e-6 || (Math.abs(t - bestT) <= 1e-6 && String(enemy.id) < String(best.enemy.id))) {
      bestT = t;
      best = {enemy, t, x: x1 + dx * t, y: y1 + dy * t};
    }
  }
  return best;
}

function impactDamage(projectile, enemy) {
  let amount = finite(projectile.damage, 0);
  if (projectile.crit) amount *= Math.max(1, finite(projectile.critMultiplier, 1));
  const mechanics = projectile.mechanics || [];
  if (mechanics.includes('execute') && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= EXECUTE_THRESHOLD) {
    amount *= EXECUTE_MULTIPLIER;
  }
  if (mechanics.includes('fence_focus')) {
    const nearFence = enemy.attacking || enemy.y >= ARENA.fenceY - finite(enemy.radius, 12) - FENCE_FOCUS_PADDING;
    if (nearFence) amount *= FENCE_FOCUS_MULTIPLIER;
  }
  return amount;
}

function applyPayload(enemy, projectile) {
  if (!enemy || enemy.dead) return;
  if (!Array.isArray(enemy.statuses)) enemy.statuses = [];
  const effects = projectile.effects || {};
  const sourceId = projectile.sourceId;
  if (effects.burn && effects.burn.duration > 0 && effects.burn.dps > 0) {
    applyStatus(enemy, {
      type: 'burn',
      power: effects.burn.dps,
      remaining: effects.burn.duration,
      sourceId,
      tickTimer: 0
    });
  }
  if (effects.slow && effects.slow.duration > 0) {
    applyStatus(enemy, {
      type: 'slow',
      power: effects.slow.factor,
      remaining: effects.slow.duration,
      sourceId
    });
  }
  if (effects.poison && effects.poison.duration > 0 && effects.poison.dps > 0) {
    const poison = {
      type: 'poison',
      power: effects.poison.dps,
      remaining: effects.poison.duration,
      sourceId,
      stacks: 1,
      tickTimer: 0
    };
    if (Number.isFinite(effects.poison.maxStacks)) poison.maxStacks = effects.poison.maxStacks;
    applyStatus(enemy, poison);
  }
  if (effects.brittle && effects.brittle.duration > 0 && effects.brittle.power > 0) {
    applyStatus(enemy, {
      type: 'brittle',
      power: effects.brittle.power,
      remaining: effects.brittle.duration,
      sourceId,
      stacks: 1
    });
  }
  if (effects.stun && effects.stun.duration > 0) {
    applyStatus(enemy, {
      type: 'stun',
      power: 1,
      remaining: effects.stun.duration,
      sourceId
    });
  }
  const mechanics = projectile.mechanics || [];
  if (mechanics.includes('brittle') && !effects.brittle) {
    applyStatus(enemy, {
      type: 'brittle',
      power: BRITTLE_FALLBACK.power,
      remaining: BRITTLE_FALLBACK.duration,
      sourceId,
      stacks: 1
    });
  }
  if (mechanics.includes('stun') && !effects.stun) {
    applyStatus(enemy, {
      type: 'stun',
      power: 1,
      remaining: STUN_FALLBACK,
      sourceId
    });
  }
}

function applySplash(state, projectile, primary) {
  const radius = projectile.splash;
  if (!(radius > 0)) return;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || enemy.id === primary.id) continue;
    if (distance(primary, enemy) > radius) continue;
    damageEnemy(state, enemy, impactDamage(projectile, enemy), {
      sourceId: projectile.sourceId,
      type: 'splash',
      crit: false,
      towerType: projectile.towerType
    });
    applyPayload(enemy, projectile);
  }
}

function rollChainCrit(state, projectile) {
  const chance = finite(projectile.critChance, 0);
  if (!(chance > 0)) return;
  projectile.crit = random(state) < chance;
}

function resolveHit(state, projectile, enemy) {
  // Chain impacts only. Pierce and the opening hit keep the fired roll, and
  // this call sits before splash so that splash still uses the crit of the
  // hit that caused it.
  if (projectile.impactType === 'chain') rollChainCrit(state, projectile);
  if (!projectile.visited.includes(enemy.id)) projectile.visited.push(enemy.id);
  const attack = projectile.impactType || 'projectile';
  damageEnemy(state, enemy, impactDamage(projectile, enemy), {
    sourceId: projectile.sourceId,
    type: attack,
    crit: !!projectile.crit,
    towerType: projectile.towerType
  });
  applyPayload(enemy, projectile);
  applySplash(state, projectile, enemy);

  if (Math.floor(finite(projectile.pierce, 0)) > 0) {
    projectile.pierce = Math.max(0, Math.floor(projectile.pierce) - 1);
    projectile.impactType = 'pierce';
    projectile.targetId = null;
    projectile.aimx = null;
    projectile.aimy = null;
    const nudge = (finite(enemy.radius, 12)) + HIT_SLOP + 4;
    projectile.x += (projectile.dirx || 0) * nudge;
    projectile.y += (projectile.diry || -1) * nudge;
    return true;
  }

  if (Math.floor(finite(projectile.chain, 0)) > 0) {
    const next = nearestEnemy(state, enemy, finite(projectile.chainRange, DEFAULT_CHAIN_RANGE), projectile.visited);
    if (next) {
      projectile.chain = Math.max(0, Math.floor(projectile.chain) - 1);
      projectile.impactType = 'chain';
      projectile.targetId = next.id;
      projectile.aimx = next.x;
      projectile.aimy = next.y;
      projectile.x = enemy.x;
      projectile.y = enemy.y;
      pointDirection(projectile, next);
      return true;
    }
  }
  return false;
}

function aimProjectile(state, projectile) {
  const target = enemyById(state, projectile.targetId);
  if (target) {
    projectile.aimx = target.x;
    projectile.aimy = target.y;
    if (!pointDirection(projectile, target)) {
      if (!Number.isFinite(projectile.dirx) || !Number.isFinite(projectile.diry)) {
        projectile.dirx = 0;
        projectile.diry = -1;
      }
    }
    return true;
  }
  if (projectile.targetId && (projectile.chain > 0 || projectile.pierce > 0)) {
    const seek = projectile.chain > 0 ? finite(projectile.chainRange, DEFAULT_CHAIN_RANGE) : 160;
    const next = nearestEnemy(state, projectile, seek, projectile.visited);
    if (next) {
      projectile.targetId = next.id;
      projectile.aimx = next.x;
      projectile.aimy = next.y;
      pointDirection(projectile, next);
      return true;
    }
    projectile.targetId = null;
  } else if (projectile.targetId) {
    projectile.targetId = null;
  }
  if (Number.isFinite(projectile.aimx) && Number.isFinite(projectile.aimy)) {
    const dx = projectile.aimx - projectile.x;
    const dy = projectile.aimy - projectile.y;
    const len = Math.hypot(dx, dy);
    if (len <= 4) return false;
    projectile.dirx = dx / len;
    projectile.diry = dy / len;
    return true;
  }
  if (!Number.isFinite(projectile.dirx) || !Number.isFinite(projectile.diry)) return false;
  if (projectile.dirx === 0 && projectile.diry === 0) return false;
  return true;
}

function advanceProjectile(state, projectile, dt) {
  if (!Number.isFinite(projectile.life)) projectile.life = 3;
  projectile.life -= dt;
  if (projectile.life <= 0) return false;
  if (!Array.isArray(projectile.visited)) projectile.visited = [];
  let budget = Math.max(0, finite(projectile.speed, DEFAULT_PROJECTILE_SPEED)) * dt;
  const hopLimit = 6 + Math.max(0, Math.floor(finite(projectile.pierce, 0))) + Math.max(0, Math.floor(finite(projectile.chain, 0)));
  let hops = 0;
  while (budget > 0.2 && hops++ < hopLimit) {
    if (!aimProjectile(state, projectile)) return false;
    const x1 = projectile.x;
    const y1 = projectile.y;
    const x2 = x1 + projectile.dirx * budget;
    const y2 = y1 + projectile.diry * budget;
    const hit = firstHit(state, projectile, x1, y1, x2, y2);
    if (!hit) {
      projectile.x = x2;
      projectile.y = y2;
      budget = 0;
      break;
    }
    const traveled = Math.max(0, hit.t) * Math.hypot(x2 - x1, y2 - y1);
    projectile.x = hit.x;
    projectile.y = hit.y;
    budget = Math.max(0, budget - traveled);
    const keep = resolveHit(state, projectile, hit.enemy);
    if (!keep) return false;
    if (traveled < 0.01 && projectile.impactType !== 'chain') {
      projectile.x += (projectile.dirx || 0) * 8;
      projectile.y += (projectile.diry || -1) * 8;
      budget = Math.max(0, budget - 8);
    }
  }
  if (projectile.y < -120 || projectile.y > ARENA.height + 80) return false;
  if (projectile.x < -100 || projectile.x > ARENA.width + 100) return false;
  return projectile.life > 0;
}

function updateProjectiles(state, dt) {
  const next = [];
  for (const projectile of state.projectiles) {
    if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) continue;
    const keep = projectile.team === 'enemy' || projectile.friendly === false
      ? advanceEnemyShot(state, projectile, dt)
      : advanceProjectile(state, projectile, dt);
    if (keep) next.push(projectile);
  }
  state.projectiles = next;
}

function buildEffects(stats) {
  const effects = {};
  if (stats.burn && Number.isFinite(stats.burn.dps) && Number.isFinite(stats.burn.duration)) {
    effects.burn = {dps: stats.burn.dps, duration: Math.max(0, stats.burn.duration)};
  }
  if (stats.slow && Number.isFinite(stats.slow.factor) && Number.isFinite(stats.slow.duration)) {
    effects.slow = {factor: clamp(stats.slow.factor, 0.05, 1), duration: Math.max(0, stats.slow.duration)};
  }
  if (stats.poison && Number.isFinite(stats.poison.dps) && Number.isFinite(stats.poison.duration)) {
    effects.poison = {
      dps: stats.poison.dps,
      duration: Math.max(0, stats.poison.duration)
    };
    if (Number.isFinite(stats.poison.maxStacks)) {
      effects.poison.maxStacks = Math.max(1, Math.floor(stats.poison.maxStacks));
    }
  }
  if (stats.brittle && Number.isFinite(stats.brittle.power) && Number.isFinite(stats.brittle.duration)) {
    effects.brittle = {
      power: clamp(stats.brittle.power, 0, BRITTLE_CAP),
      duration: Math.max(0, stats.brittle.duration)
    };
  }
  if (stats.stun && Number.isFinite(stats.stun.duration)) {
    effects.stun = {duration: Math.max(0, stats.stun.duration)};
  }
  return effects;
}

function buildTags(unit, stats, mechanics) {
  const tags = [];
  if (unit.type) tags.push(unit.type);
  if (unit.kind) tags.push(unit.kind);
  if (effectsPresent(stats.burn)) tags.push('burn');
  if (effectsPresent(stats.slow)) tags.push('slow');
  if (effectsPresent(stats.poison)) tags.push('poison');
  if (finite(stats.splash, 0) > 0) tags.push('splash');
  if (finite(stats.chain, 0) > 0) tags.push('chain');
  if (finite(stats.pierce, 0) > 0) tags.push('pierce');
  for (const mechanic of mechanics) tags.push(mechanic);
  return tags;
}

function effectsPresent(effect) {
  return !!(effect && typeof effect === 'object');
}

function mechanicList(stats) {
  if (!Array.isArray(stats.mechanics)) return [];
  const list = [];
  for (const entry of stats.mechanics) {
    if (typeof entry === 'string' && entry) list.push(entry);
  }
  return list;
}

function scaledInterval(stats, hasteBonus) {
  const haste = clamp(finite(hasteBonus, 0), 0, AURA_HASTE_CAP);
  return Math.max(MIN_ATTACK_INTERVAL, finite(stats.interval, 1) / (1 + haste));
}

function makeProjectile(state, unit, slot, stats, target, rolled, mechanics) {
  const range = finite(stats.range, 0);
  const speed = clamp(finite(stats.projectileSpeed, DEFAULT_PROJECTILE_SPEED), 40, 2400);
  const chain = Math.max(0, Math.floor(finite(stats.chain, 0)));
  const projectile = {
    id: uid(state, 'p'),
    sourceId: unit.id,
    targetId: target.id,
    x: slot.x,
    y: slot.y,
    speed,
    damage: rolled.damage,
    crit: rolled.crit,
    critMultiplier: chain > 0 && rolled.critChance > 0 ? rolled.baseCritMultiplier : rolled.critMultiplier,
    critChance: rolled.critChance,
    tags: buildTags(unit, stats, mechanics),
    splash: Math.max(0, finite(stats.splash, 0)),
    chain,
    chainRange: chain > 0
      ? (Number.isFinite(stats.chainRange) && stats.chainRange > 0 ? stats.chainRange : DEFAULT_CHAIN_RANGE)
      : finite(stats.chainRange, DEFAULT_CHAIN_RANGE),
    pierce: Math.max(0, Math.floor(finite(stats.pierce, 0))),
    visited: [],
    life: Math.max(3, range / speed + 1.25),
    dirx: 0,
    diry: -1,
    aimx: target.x,
    aimy: target.y,
    towerType: unit.type || null,
    rank: finite(unit.rank, 1),
    effects: buildEffects(stats),
    mechanics: mechanics.slice(),
    impactType: null
  };
  if (rolled.crit) projectile.tags.push('crit');
  pointDirection(projectile, target);
  return projectile;
}

function rollShot(state, stats, bonus) {
  const damage = Math.max(0, finite(stats.damage, 0) * (1 + clamp(finite(bonus?.damage, 0), 0, AURA_DAMAGE_CAP)));
  const critChance = clamp(finite(stats.critChance, 0), 0, 1);
  const critMultiplier = Math.max(1, finite(stats.critMultiplier, DEFAULT_CRIT_MULTIPLIER));
  let crit = false;
  if (damage > 0 && critChance > 0) crit = random(state) < critChance;
  return {
    damage,
    crit,
    critChance,
    critMultiplier: crit ? critMultiplier : 1,
    baseCritMultiplier: critMultiplier
  };
}

function fireUnit(state, unit, slot, stats, bonus) {
  const range = finite(stats.range, 0);
  if (!(range > 0)) return false;
  const origin = {x: slot.x, y: slot.y};
  const target = nearestEnemy(state, origin, range, null);
  if (!target) return false;
  const rolled = rollShot(state, stats, bonus);
  if (!(rolled.damage > 0)) return false;
  const mechanics = mechanicList(stats);
  const projectile = makeProjectile(state, unit, slot, stats, target, rolled, mechanics);
  state.projectiles.push(projectile);
  emitEvent(state, 'shot', {
    sourceId: unit.id,
    targetId: target.id,
    x: projectile.x,
    y: projectile.y,
    damage: rolled.crit ? rolled.damage * rolled.critMultiplier : rolled.damage,
    crit: rolled.crit,
    towerType: unit.type || null
  });
  if (mechanics.includes('multishot')) {
    const second = nearestEnemy(state, origin, range, [target.id]);
    if (second) {
      const echoMechanics = mechanics.filter(name => name !== 'multishot');
      const echo = makeProjectile(state, unit, slot, stats, second, rolled, echoMechanics);
      echo.tags.push('echo');
      state.projectiles.push(echo);
      emitEvent(state, 'shot', {
        sourceId: unit.id,
        targetId: second.id,
        x: echo.x,
        y: echo.y,
        damage: rolled.crit ? rolled.damage * rolled.critMultiplier : rolled.damage,
        crit: rolled.crit,
        towerType: unit.type || null
      });
    }
  }
  unit.cooldown = finite(unit.cooldown, 0) + scaledInterval(stats, bonus?.haste);
  return true;
}

function computeAura(roster) {
  const bonus = {};
  for (const entry of roster) bonus[entry.unit.id] = {damage: 0, haste: 0};
  for (const source of roster) {
    const aura = source.stats.aura;
    if (!aura || !(aura.range > 0)) continue;
    const addDamage = Math.max(0, finite(aura.damage, 0));
    const addHaste = Math.max(0, finite(aura.haste, 0));
    if (addDamage === 0 && addHaste === 0) continue;
    for (const target of roster) {
      if (distance(source.slot, target.slot) <= aura.range) {
        bonus[target.unit.id].damage += addDamage;
        bonus[target.unit.id].haste += addHaste;
      }
    }
  }
  for (const id of Object.keys(bonus)) {
    bonus[id].damage = clamp(bonus[id].damage, 0, AURA_DAMAGE_CAP);
    bonus[id].haste = clamp(bonus[id].haste, 0, AURA_HASTE_CAP);
  }
  return bonus;
}

function updateDefenders(state, dt, roster, aura) {
  const shotCap = Math.max(1, Math.min(30, Math.ceil(dt / MIN_ATTACK_INTERVAL) + 1));
  for (const entry of roster) {
    const {unit, slot, stats} = entry;
    unit.cooldown = finite(unit.cooldown, 0) - dt;
    if (!(finite(stats.damage, 0) > 0) || !(finite(stats.range, 0) > 0)) {
      if (unit.cooldown < 0) unit.cooldown = 0;
      continue;
    }
    let shots = 0;
    while (unit.cooldown <= 1e-9 && shots++ < shotCap) {
      const before = unit.cooldown;
      const fired = fireUnit(state, unit, slot, stats, aura[unit.id]);
      if (!fired) {
        unit.cooldown = 0;
        break;
      }
      if (unit.cooldown <= before) {
        unit.cooldown = MIN_ATTACK_INTERVAL;
        break;
      }
    }
  }
}

function fenceReach(enemy) {
  if (Number.isFinite(enemy.attackRange) && enemy.attackRange > 0) return enemy.attackRange;
  return Math.max(0, finite(enemy.radius, 12));
}

function biteFence(state, amount, x, sourceId, enemyKind) {
  const fence = state.fence;
  if (!fence || !(fence.hp > 0) || !(amount > 0) || !Number.isFinite(amount)) return 0;
  const applied = Math.min(fence.hp, amount);
  const maxHp = Number.isFinite(fence.maxHp) ? fence.maxHp : fence.hp;
  fence.hp = clamp(fence.hp - amount, 0, Math.max(0, maxHp));
  const stats = ensureStats(state);
  stats.fenceDamage = finite(stats.fenceDamage, 0) + applied;
  emitEvent(state, 'fence_hit', {
    sourceId: sourceId || null,
    x,
    y: ARENA.fenceY,
    damage: applied,
    enemyKind: enemyKind || null
  });
  return applied;
}

function advanceEnemyShot(state, projectile, dt) {
  if (!Number.isFinite(projectile.life)) projectile.life = 3;
  projectile.life -= dt;
  if (projectile.life <= 0) return false;
  let dirx = finite(projectile.dirx, 0);
  let diry = finite(projectile.diry, 1);
  const len = Math.hypot(dirx, diry) || 1;
  dirx /= len;
  diry /= len;
  const speed = Math.max(0, finite(projectile.speed, 180));
  const y1 = projectile.y;
  projectile.x += dirx * speed * dt;
  projectile.y += diry * speed * dt;
  const reachedFence = y1 >= ARENA.fenceY || (y1 < ARENA.fenceY && projectile.y >= ARENA.fenceY);
  if (reachedFence) {
    biteFence(state, finite(projectile.damage, 0), projectile.x, projectile.sourceId, projectile.enemyKind || null);
    return false;
  }
  if (projectile.y < -120 || projectile.x < -80 || projectile.x > ARENA.width + 80) return false;
  return true;
}

function updateFenceAttacks(state, dt) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.hp)) return;
  for (const enemy of state.enemies) {
    if (!enemy || enemy.dead) continue;
    const inRange = enemy.y >= ARENA.fenceY - fenceReach(enemy) - CONTACT_SLOP;
    if (!inRange || isStunned(enemy)) {
      enemy.attacking = false;
      continue;
    }
    enemy.attacking = true;
    if (!(enemy.damage > 0) || fence.hp <= 0) continue;
    const interval = Math.max(0.05, finite(enemy.attackInterval, 1));
    enemy.attackCooldown = finite(enemy.attackCooldown, 0) - dt;
    const hitCap = Math.max(1, Math.min(40, Math.ceil(dt / interval) + 1));
    let hits = 0;
    while (enemy.attackCooldown <= 1e-9 && fence.hp > 0 && hits++ < hitCap) {
      biteFence(state, enemy.damage, enemy.x, enemy.id, enemy.kind || null);
      enemy.attackCooldown += interval;
    }
  }
}

function removeDead(state) {
  if (state.enemies.some(enemy => enemy?.dead)) {
    state.enemies = state.enemies.filter(enemy => enemy && !enemy.dead);
  }
}

/**
 * Acquire targets by true distance from each defender's slot center, step
 * projectiles without tunneling, then let living enemies bite the shared fence.
 * Does not modify state.time, state.tick, or state.speed.
 */
export function updateCombat(state, dt) {
  if (simulationFrozen(state)) return state;
  if (!Number.isFinite(dt) || dt <= 0) return state;
  if (!Array.isArray(state.slots)) return state;
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  if (!Array.isArray(state.events)) state.events = [];

  removeDead(state);

  const roster = [];
  for (const slot of state.slots) {
    if (!slot?.unit) continue;
    const stats = getUnitStats(slot.unit, state);
    if (!stats || typeof stats !== 'object') continue;
    roster.push({slot, unit: slot.unit, stats});
  }
  const aura = computeAura(roster);
  updateDefenders(state, dt, roster, aura);
  updateProjectiles(state, dt);
  updateFenceAttacks(state, dt);
  removeDead(state);
  return state;
}
