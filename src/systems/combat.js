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
// fence_hit.ratio is remaining fence hp / max hp after that damage, clamped
// to [0, 1]. The applied damage, execute numbers, and stun are unchanged.
//
// killEnemy awards kills, source unit.kills, and enemy.xp exactly once. It does
// not remove the body. updateCombat drops dead enemies at the end of the step.
// Engine cleanup may filter `dead` again but must not award kills or XP again.
//
// Phased enemies (phased === true) are not targetable, so shots, pierce, chain,
// and splash miss them. They still bite the fence for enemy.damage on their
// normal attackInterval. Mend may heal a phased ally.
//
// Split: updateCombat copies ENEMIES[kind].split onto a living enemy that does
// not already have a numeric splitCount (splitKind, splitCount max 4,
// splitHealthScale). The once-only kill then spawns up to 4 children of that
// kind, about 14px apart around the body and clamped to the arena, and stops
// at 90 enemies. healthScale is splitHealthScale when finite and > 0, else
// 0.55. splitSpawned is set before the spawn so it cannot recurse. Children
// do not inherit the parent's split fields. The 'split' event is
// {x, y, count, kind} and is not a fence_hit.
//
// Mend: after shots and before fence bites, a living enemy with mendEvery > 0
// heals the other living ally inside mendRange with the lowest hp/maxHp that
// is missing health. Never itself. One heal per clock even when dt is large.
// Stun holds the clock. Catalog mend.amount is scaled once by difficulty
// health into mendAmount. The 'mend' event is not a fence_hit.
//
// Ward: after splits are attached and dead bodies are removed, and before
// defenders fire, every enemy.wardShield is cleared. Each living unstunned
// enemy with wardRange > 0 and wardReduction > 0 then shields the nearest
// other living enemy inside that range (smaller distance, then smaller id).
// The shield is the greater reduction on that ally, capped at WARD_CAP. A
// warden does not shield itself, and a stun grants nothing that tick.
// damageEnemy multiplies after armor and brittle. Fence bites still use
// enemy.damage. The hit event is unchanged.

import {TARGET_MODES,canPlan,ARENA, DIFFICULTIES, clamp, distance, emit, random, uid} from '../shared.js';
import {ENEMIES} from '../data/enemies.js';
import {getUnitStats} from '../data/towers.js';
import {statusDurationScale, applyStatus} from './status.js';
import {spawnEnemy} from './movement.js';

export const AURA_DAMAGE_CAP = 0.6;
export const AURA_HASTE_CAP = 0.45;
export const BRITTLE_CAP = 1;
export const MIN_ATTACK_INTERVAL = 0.05;
export const ARMOR_CAP = 0.8;
export const WARD_CAP = 0.4;
export const FENCE_REGEN_PER_SECOND = 0;

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
const SPLIT_CHILD_CAP = 4;
const SPLIT_ENEMY_CAP = 90;
const SPLIT_SPREAD = 14;
const DEFAULT_SPLIT_HEALTH_SCALE = 0.55;

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
  return !!(enemy && !enemy.dead && enemy.hp > 0 && (!enemy.phased || enemy.revealed) && !enemy.airTime && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
}

function isLiving(enemy) {
  return !!(enemy && !enemy.dead && enemy.hp > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
}

function difficultyHealth(state) {
  const row = state && DIFFICULTIES[state.difficulty];
  const health = row && row.health;
  return Number.isFinite(health) ? health : 1;
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
    state.stats = {damage: 0, fenceDamage: 0, crits: 0};
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

export function setTargeting(state, index, mode) {
  const unit = state?.slots?.[index]?.unit;
  if (!Number.isInteger(index) || !canPlan(state) || !unit) return {ok: false, reason: 'invalid_slot'};
  mode = mode ?? TARGET_MODES[(TARGET_MODES.indexOf(unit.targeting) + 1) % 4];
  if (!TARGET_MODES.includes(mode)) return {ok: false, reason: 'invalid_mode'};
  unit.targeting = mode;
  emit(state, 'targeting_change', {slot: index, mode});
  return {ok: true};
}
function priorityScore(e,mode) {
  if (mode==='priority') return Number(Boolean(e.priority || ENEMIES[e.kind]?.priority));
  if (mode==='strongest') return e.hp;
  if (mode==='weakest') return -e.hp/e.maxHp;
  return 0;
}
function ignored(ignore, id) {
  if (!ignore) return false;
  for (let i = 0; i < ignore.length; i++) {
    if (ignore[i] === id) return true;
  }
  return false;
}

export function selectTarget(state,origin,range,targeting='foremost',ignore) {
  let best=null, bestScore=-Infinity;
  for (const e of state.enemies) {
    if (!isTargetable(e) || ignored(ignore,e.id)) continue;
    const dx=e.x-origin.x, dy=e.y-origin.y;
    if (dx*dx+dy*dy>range*range) continue;
    const score=priorityScore(e,targeting);
    if (!best || score>bestScore || (score===bestScore && (e.y>best.y || (e.y===best.y && String(e.id)<String(best.id))))) {
      best=e;
      bestScore=score;
    }
  }
  return best;
}
function nearestEnemy(state,origin,range,ignore) {
  return selectTarget(state,origin,range,'foremost',ignore);
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
 * included when options.crit is set). Armor and brittle are applied here,
 * then ward shield. Returns HP actually removed. Usable as the status
 * damage callback.
 */
export function damageEnemy(state, enemy, amount, options = {}) {
  if (!state || !enemy || enemy.dead) return 0;
  const opts = options || {};
  if (!Number.isFinite(enemy.hp)) return 0;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy, opts.sourceId, opts);
    return 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const armor = clamp(finite(enemy.armor, 0), 0, ARMOR_CAP) * (1 - clamp(opts.armorPen || 0, 0, 1));
  const reduced = amount * (1 - armor) * (1 + brittleBonus(enemy));
  const shield = clamp(finite(enemy.wardShield, 0), 0, WARD_CAP);
  const shielded = reduced * (1 - shield);
  if (!Number.isFinite(shielded) || shielded <= 0) return 0;
  const dealt = Math.min(enemy.hp, shielded);
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
    execute: opts.execute === true,
    attack: opts.type || 'hit',
    towerType: opts.towerType || findUnit(state,opts.sourceId)?.type || null,
    armorBlocked:amount*armor, ...(opts.reaction ? {reaction:opts.reaction} : {})
  });
  if (enemy.hp <= 1e-6) {
    enemy.hp = 0;
    killEnemy(state, enemy, opts.sourceId, opts);
  }
  return dealt;
}

function attachSplit(enemy) {
  if (!enemy || typeof enemy.splitCount === 'number') return;
  const split = ENEMIES[enemy.kind] && ENEMIES[enemy.kind].split;
  if (!split || typeof split !== 'object') return;
  if (typeof split.kind === 'string') enemy.splitKind = split.kind;
  if (Number.isFinite(split.count)) {
    enemy.splitCount = Math.max(0, Math.min(SPLIT_CHILD_CAP, Math.floor(split.count)));
  }
  if (Number.isFinite(split.healthScale)) enemy.splitHealthScale = split.healthScale;
}

function attachLivingSplits(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy)) continue;
    attachSplit(enemy);
  }
}

function releaseSplit(state, enemy) {
  if (!(enemy.splitCount > 0)) return;
  if (typeof enemy.splitKind !== 'string' || enemy.splitKind.length === 0) return;
  if (enemy.splitSpawned === true) return;
  enemy.splitSpawned = true;
  const healthScale = Number.isFinite(enemy.splitHealthScale) && enemy.splitHealthScale > 0
    ? enemy.splitHealthScale
    : DEFAULT_SPLIT_HEALTH_SCALE;
  const count = Math.min(SPLIT_CHILD_CAP, Math.floor(enemy.splitCount));
  if (!Array.isArray(state.enemies)) state.enemies = [];
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    if (state.enemies.length >= SPLIT_ENEMY_CAP) break;
    const offset = (i - (count - 1) / 2) * SPLIT_SPREAD;
    const x = clamp((Number.isFinite(enemy.x) ? enemy.x : 0) + offset, ARENA.enemyMinX, ARENA.enemyMaxX);
    spawnEnemy(state, enemy.splitKind, {x, y: enemy.y, healthScale});
    spawned += 1;
  }
  emitEvent(state, 'split', {
    x: enemy.x,
    y: enemy.y,
    count: spawned,
    kind: enemy.splitKind
  });
}

/** Award kill credit, XP from enemy.xp, and a kill event. Repeat calls are no-ops. */
export function killEnemy(state, enemy, sourceId, options = {}) {
  if (!state || !enemy || enemy.dead) return false;
  attachSplit(enemy);
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
  const mark = enemy.corpseExplode;
  if (mark && !options.fromExplode) {
    const damage = Math.min(260,enemy.maxHp * mark.hpRatio);
    emit(state,'corpse_explode',{x:enemy.x,y:enemy.y,radius:mark.radius,damage});
    for (const other of state.enemies) {
      if (!isLiving(other) || distance(other,enemy)>mark.radius) continue;
      applyPayload(other,{sourceId:mark.sourceId,effects:{poison:mark.poison}});
      damageEnemy(state,other,damage,{sourceId:mark.sourceId,type:'corpse_explode',towerType:'blight',fromExplode:true});
    }
  }
  const heroUnit = state.slots?.find(s => s?.unit?.kind === 'hero')?.unit;
  const frostRank = heroUnit?.upgrades?.frostbite || 0;
  if (frostRank >= 2 && !options.fromShatter && (enemy.statuses || []).some(s => (s.type === 'slow' || s.type === 'brittle') && s.remaining > 0)) {
    const radius = 52 + 8 * (frostRank - 2);
    const dmg = 16 * frostRank;
    emit(state, 'cryo_shatter', {x: enemy.x, y: enemy.y, radius, damage: dmg});
    for (const other of state.enemies) {
      if (!isLiving(other) || other.id === enemy.id || distance(other, enemy) > radius) continue;
      applyStatus(other, {type: 'slow', power: 0.68, remaining: 1.8, sourceId: heroUnit.id});
      damageEnemy(state, other, dmg, {sourceId: heroUnit.id, type: 'cryo_shatter', towerType: 'frost', fromShatter: true});
    }
  }
  releaseSplit(state, enemy);
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

function executeApplies(projectile, enemy) {
  const mechanics = projectile?.mechanics || [];
  return mechanics.includes('execute') && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= EXECUTE_THRESHOLD;
}

function impactDamage(projectile, enemy) {
  let amount = finite(projectile.damage, 0);
  if (projectile.crit) amount *= Math.max(1, finite(projectile.critMultiplier, 1));
  const mechanics = projectile.mechanics || [];
  if (executeApplies(projectile, enemy)) {
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

function pushEnemy(state,enemy,requested) {
  if (!isLiving(enemy) || !requested) return;
  const y = enemy.y;
  enemy.y = clamp(y-requested,8,ARENA.fenceY-enemy.radius);
  enemy.attacking = false;
  enemy.blockedByFieldId = null;
  emit(state,'knockback',{targetId:enemy.id,x:enemy.x,y,distance:y-enemy.y});
}

function impact(state,projectile,enemy,type) {
  const {effects,sourceId,towerType} = projectile;
  let amount = impactDamage(projectile,enemy), reaction;
  const active = (enemy.statuses || []).filter(s=>s.remaining>0);
  if (effects?.thermalShock && active.some(s=>s.type==='burn' || s.type==='slow')) {
    amount *= 1 + effects.thermalShock;
    reaction = 'steam';
  }
  const stacks = active.find(s=>s.type==='poison')?.stacks || 0;
  if (effects?.poisonDetonate && stacks) {
    amount *= 1 + effects.poisonDetonate*stacks;
    reaction = 'catalyst';
  }
  const bonuses = state.systems?.integration?.bonuses;
  if ((bonuses?.statusDamage || 0) > 0 && active.some(s => s.type === 'burn' || s.type === 'slow' || s.type === 'brittle' || s.type === 'poison')) {
    amount *= 1 + bonuses.statusDamage;
  }
  const isCrit = type !== 'splash' && !!projectile.crit;
  if (isCrit && (bonuses?.shredPercent || 0) > 0 && Number.isFinite(enemy.maxHp) && enemy.maxHp > 0) {
    amount += Math.min(enemy.kind === 'boss' ? 180 : 120, enemy.maxHp * bonuses.shredPercent);
  }
  if (effects?.corpseExplode) enemy.corpseExplode = {...effects.corpseExplode,sourceId,poison:effects.poison};
  damageEnemy(state,enemy,amount,{sourceId,towerType,type,armorPen:effects?.armorPen,reaction,
    crit:isCrit,execute:executeApplies(projectile,enemy)});
  applyPayload(enemy,projectile);
  if (reaction==='steam' && isLiving(enemy)) applyStatus(enemy,{type:'brittle',power:0.2,remaining:2.6,sourceId});
  const push = (effects?.knockback || 0) + (projectile.crit && enemy.kind!=='boss' ? effects?.critKnockback || 0 : 0);
  pushEnemy(state,enemy,push*(enemy.kind==='boss'?0.2:1));
}

const MAX_CLOUDS = 24;
function addCloud(state, cloud) {
  if (!Array.isArray(state.clouds)) state.clouds = [];
  if (state.clouds.length >= MAX_CLOUDS) state.clouds.shift();
  state.clouds.push(cloud);
  emit(state, 'cloud_spawn', {id: cloud.id, kind: cloud.kind, x: cloud.x, y: cloud.y, radius: cloud.radius, duration: cloud.duration});
}
function spawnCloud(state,projectile,enemy) {
  const spec = projectile.effects?.cloud;
  if (!spec) return;
  addCloud(state, {...spec, id: uid(state, 'c'), kind: projectile.towerType || 'fire', sourceId: projectile.sourceId || 'u1',
    x: clamp(enemy.x, 12, ARENA.width - 12), y: clamp(enemy.y, 12, ARENA.fenceY - 6), remaining: spec.duration, tickTimer: 0});
}
export function updateClouds(state,dt) {
  if (!state.clouds?.length) return;
  for (const cloud of state.clouds) {
    cloud.tickTimer += Math.min(dt,cloud.remaining);
    cloud.remaining -= dt;
    while (cloud.tickTimer + 1e-9 >= cloud.tick) {
      cloud.tickTimer -= cloud.tick;
      for (const enemy of state.enemies) {
        if (!isLiving(enemy) || distance(enemy,cloud)>cloud.radius) continue;
        damageEnemy(state,enemy,cloud.dps*cloud.tick,{sourceId:cloud.sourceId,towerType:cloud.kind,type:'cloud'});
        applyPayload(enemy,{sourceId:cloud.sourceId,effects:cloud});
      }
    }
  }
  state.clouds = state.clouds.filter(cloud=>cloud.remaining>1e-9);
}

function applySplash(state, projectile, primary) {
  const radius = projectile.splash;
  if (!(radius > 0)) return;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || enemy.id === primary.id) continue;
    if (distance(primary, enemy) > radius) continue;
    impact(state,projectile,enemy,'splash');
  }
}

function spawnSplitShrapnel(state, projectile, point, hitEnemyId) {
  const count = Math.min(5, Math.floor(finite(projectile.effects?.split, 0)));
  if (count <= 0 || projectile.isSplitChild) return;
  const subDmg = Math.max(2, finite(projectile.damage, 0) * 0.58);
  const spreadStep = count > 1 ? (Math.PI * 0.62) / (count - 1) : 0;
  const baseAngle = Math.atan2(projectile.diry || -1, projectile.dirx || 0) - (spreadStep * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + spreadStep * i;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    state.projectiles.push({
      id: uid(state, 'p'),
      sourceId: projectile.sourceId,
      targetId: null,
      x: clamp(point.x + dx * 8, -40, ARENA.width + 40),
      y: clamp(point.y + dy * 8, -40, ARENA.fenceY + 20),
      speed: 620,
      damage: subDmg,
      crit: projectile.crit,
      critMultiplier: projectile.critMultiplier,
      critChance: 0,
      tags: ['hero', 'split', 'pierce'],
      splash: 0,
      chain: 0,
      chainRange: 70,
      pierce: 1,
      visited: [hitEnemyId],
      life: 0.72,
      dirx: dx,
      diry: dy,
      aimx: null,
      aimy: null,
      towerType: 'hero',
      rank: projectile.rank || 1,
      effects: {armorPen: projectile.effects?.armorPen || 0},
      mechanics: [],
      impactType: null,
      isSplitChild: true
    });
  }
  emit(state, 'bullet_split', {x: point.x, y: point.y, count});
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
  // Secondary effects originate at the contact point even when it pushes its victim.
  const point = {id:enemy.id,x:enemy.x,y:enemy.y};
  impact(state,projectile,enemy,attack);
  if (projectile.effects?.revealRadius) {
    for (const other of state.enemies) if (distance(other,point)<=projectile.effects.revealRadius) {
      other.revealed = true;
      other.revealTimer = 1.2;
    }
  }
  spawnCloud(state,projectile,point);
  if (!projectile.isSplitChild && projectile.towerType === 'hero' && (projectile.effects?.shrapnelRank || 0) >= 2 && attack === 'projectile') {
    const sr = projectile.effects.shrapnelRank;
    addCloud(state, {
      id: uid(state, 'c'), kind: 'shrapnel', sourceId: projectile.sourceId || 'u1',
      x: clamp(point.x, 12, ARENA.width - 12), y: clamp(point.y, 12, ARENA.fenceY - 8),
      radius: 30 + 6 * sr, duration: 2.0, remaining: 2.0, tick: 0.45, tickTimer: 0,
      dps: 5 * sr, burn: {dps: 4 * sr, duration: 2.0}
    });
  }
  applySplash(state, projectile, point);
  if (!projectile.isSplitChild && attack === 'projectile' && (projectile.effects?.split || 0) > 0) {
    spawnSplitShrapnel(state, projectile, point, enemy.id);
  }

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
  for (const key of ['armorPen','knockback','critKnockback','cloud','corpseExplode','thermalShock','poisonDetonate','revealRadius','split','shrapnelRank','frostbiteRank']) {
    if (stats[key]) effects[key] = stats[key];
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
  const selected = [];
  const mechanics = mechanicList(stats);
  const extras = stats.multishot || (mechanics.includes('multishot') ? 1 : 0);
  for (let i=0; i<=extras; i++) {
    const target = selectTarget(state,origin,range,unit.targeting,selected);
    if (!target) break;
    selected.push(target.id);
    const rolled = rollShot(state,stats,bonus);
    if (!rolled.damage) return false;
    const shot = makeProjectile(state,unit,slot,stats,target,rolled,mechanics);
    if (i) shot.tags.push('echo');
    if (stats.stun?.chance && random(state)>=stats.stun.chance) {
      delete shot.effects.stun;
      shot.mechanics = shot.mechanics.filter(m=>m!=='stun');
    }
    state.projectiles.push(shot);
    emit(state,'shot',{sourceId:unit.id,targetId:target.id,x:slot.x,y:slot.y,targetX:target.x,targetY:target.y,
      damage:rolled.damage*rolled.critMultiplier,crit:rolled.crit,towerType:unit.type,multishot:i>0,
      pierce:shot.pierce,chain:shot.chain,splash:shot.splash});
  }
  if (!selected.length) return false;
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

function defenderRecharge(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return 1;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || !(enemy.hushFactor > 0) || isStunned(enemy)) continue;
    if (!chargeContact(enemy)) continue;
    return Math.max(0.5, Math.min(1, enemy.hushFactor));
  }
  return 1;
}

function updateDefenders(state, dt, roster, aura) {
  const shotCap = Math.max(1, Math.min(30, Math.ceil(dt / MIN_ATTACK_INTERVAL) + 1));
  const recharge = defenderRecharge(state);
  for (const entry of roster) {
    const {unit, slot, stats} = entry;
    unit.cooldown = finite(unit.cooldown, 0) - dt * recharge;
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

function triggerFenceSurge(state) {
  const surge = state.surge;
  surge.charges--;
  surge.shieldTimer = 3;
  surge.cooldown = 10;
  const level = state.slots.find((s) => s.unit?.kind === 'hero')?.unit.upgrades.bastion || 0;
  const power = 1 + level * 0.4 + (state.systems.integration?.bonuses?.surgePower || 0);
  emit(state, 'fence_surge', {y: ARENA.fenceY, reach: 240, chargesLeft: surge.charges, shieldDuration: 3});
  for (const e of state.enemies) {
    if (!isLiving(e) || e.y < ARENA.fenceY - 240) continue;
    const boss = e.kind === 'boss';
    const lethal = !boss && (e.kind === 'swarm' || e.hp / e.maxHp <= 0.18);
    if (lethal) { killEnemy(state, e, null); continue; }
    damageEnemy(state, e, boss ? Math.min(450, e.maxHp * 0.08) : 110 * power, {type: 'surge', armorPen: 1});
    if (!isLiving(e)) continue;
    pushEnemy(state, e, boss ? 45 : 150 * (1 + 0.35 * level));
    const stunScale = statusDurationScale(e, 'stun');
    if (stunScale > 0) applyStatus(e, {type: 'stun', remaining: boss ? 0.5 / stunScale : 1.6, sourceId: 'fence'});
    e.chargeLit = false;
    e.chargeTimer = 0;
  }
}

function biteFence(state, amount, x, sourceId, enemyKind, attacker = null) {
  const fence = state.fence;
  if (!fence || !(fence.hp > 0) || !(amount > 0) || !Number.isFinite(amount)) return 0;
  if (state.surge.shieldTimer > 0) return 0;
  if ((state.wallImmunity || 0) > 0) {
    state.wallImmunity = Math.max(0, Math.floor(state.wallImmunity) - 1);
    emitEvent(state, 'wall_immune', {x: Number.isFinite(x) ? x : ARENA.width / 2, y: ARENA.fenceY, remaining: state.wallImmunity});
    for (const e of state.enemies) {
      if (!isLiving(e) || e.y < ARENA.fenceY - 120) continue;
      pushEnemy(state, e, e.kind === 'boss' ? 18 : 64);
    }
    return 0;
  }
  const previous = fence.hp;
  const applied = Math.min(fence.hp, amount);
  const maxHp = Number.isFinite(fence.maxHp) ? fence.maxHp : fence.hp;
  fence.hp = clamp(fence.hp - amount, 0, Math.max(0, maxHp));
  const stats = ensureStats(state);
  stats.fenceDamage = finite(stats.fenceDamage, 0) + applied;
  const maxAfter = Number.isFinite(fence.maxHp) && fence.maxHp > 0 ? fence.maxHp : Math.max(0, maxHp);
  const ratio = maxAfter > 0 ? clamp(fence.hp / maxAfter, 0, 1) : 0;
  emitEvent(state, 'fence_hit', {
    sourceId: sourceId || null,
    x,
    y: ARENA.fenceY,
    damage: applied,
    enemyKind: enemyKind || null,
    ratio
  });
  const thorns = finite(state.systems?.integration?.bonuses?.thorns, 0);
  if (thorns > 0 && attacker && isLiving(attacker)) {
    damageEnemy(state, attacker, thorns, {type: 'thorns', sourceId: 'fence'});
  }
  const surge = state.surge;
  if (surge.charges > 0 && surge.cooldown <= 0) {
    const threshold = [0.5, 0.2].find((t) => previous > maxHp * t && fence.hp <= maxHp * t && !surge.thresholdsUsed.includes(t));
    if (threshold || fence.hp <= 0) {
      if (threshold) surge.thresholdsUsed.push(threshold);
      if (fence.hp <= 0) fence.hp = Math.max(1, Math.round(maxHp * 0.12));
      triggerFenceSurge(state);
    }
  }
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

function ensureMendFields(state, enemy) {
  if (Number.isFinite(enemy.mendAmount)) return;
  const mend = ENEMIES[enemy.kind] && ENEMIES[enemy.kind].mend;
  if (!mend || typeof mend !== 'object') return;
  if (Number.isFinite(mend.every)) enemy.mendEvery = mend.every;
  if (Number.isFinite(mend.amount)) enemy.mendAmount = mend.amount * difficultyHealth(state);
  if (Number.isFinite(mend.range)) enemy.mendRange = mend.range;
}

function mendTarget(state, source) {
  const range = source.mendRange;
  if (!Number.isFinite(range) || !(range > 0)) return null;
  let best = null;
  let bestRatio = Infinity;
  const enemies = state.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy === source) continue;
    if (enemy.id != null && source.id != null && enemy.id === source.id) continue;
    if (!Number.isFinite(enemy.maxHp) || !(enemy.maxHp > 0)) continue;
    if (!(enemy.hp < enemy.maxHp)) continue;
    if (distance(source, enemy) > range) continue;
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = enemy;
    }
  }
  return best;
}

function updateMenders(state, dt) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy)) continue;
    ensureMendFields(state, enemy);
    if (!(enemy.mendEvery > 0)) continue;
    if (!Number.isFinite(enemy.mendClock)) enemy.mendClock = enemy.mendEvery;
    if (isStunned(enemy)) continue;
    enemy.mendClock -= dt;
    if (enemy.mendClock > 0) continue;
    enemy.mendClock = enemy.mendEvery;
    const target = mendTarget(state, enemy);
    if (!target) continue;
    const missing = target.maxHp - target.hp;
    const amount = Math.min(missing, enemy.mendAmount);
    if (!Number.isFinite(amount) || !(amount > 0)) continue;
    target.hp += amount;
    if (target.hp > target.maxHp) target.hp = target.maxHp;
    emitEvent(state, 'mend', {
      x: target.x,
      y: target.y,
      targetId: target.id,
      amount
    });
  }
}

function chargeContact(enemy) {
  const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
  return enemy.y >= ARENA.fenceY - radius - CONTACT_SLOP;
}

function updateCharges(state, dt) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy.chargeSpent === true) continue;
    if (!(enemy.chargeWindup > 0) || !(enemy.chargeDamage > 0)) continue;
    if (!chargeContact(enemy) || isStunned(enemy)) continue;
    if (enemy.chargeLit !== true) {
      enemy.chargeLit = true;
      enemy.chargeTimer = enemy.chargeWindup;
      continue;
    }
    enemy.chargeTimer = finite(enemy.chargeTimer, enemy.chargeWindup) - dt;
    if (enemy.chargeTimer > 0) continue;
    enemy.chargeTimer = 0;
    enemy.chargeSpent = true;
    biteFence(state, enemy.chargeDamage, enemy.x, enemy.id, enemy.kind || null);
    killEnemy(state, enemy, null);
  }
}

function updateFenceAttacks(state, dt) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.hp)) return;
  for (const enemy of state.enemies) {
    if (!enemy || enemy.dead) continue;
    if (enemy.chargeLit === true) {
      enemy.attacking = true;
      continue;
    }
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
      if (enemy.projectileSpeed && enemy.attackRange) {
        emit(state, 'shot', {
          sourceId: enemy.id, targetId: 'fence', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: ARENA.fenceY,
          damage: enemy.damage, crit: false, towerType: enemy.kind, team: 'enemy'
        });
        state.projectiles.push({
          id: uid(state, 'p'), team: 'enemy', sourceId: enemy.id, targetId: null, enemyKind: enemy.kind,
          x: enemy.x, y: enemy.y, speed: enemy.projectileSpeed, damage: enemy.damage, crit: false, tags: ['acid'],
          dirx: 0, diry: 1, chainRange: 70, life: 3, visited: [], pierce: 0, chain: 0, splash: 0
        });
      } else {
        biteFence(state, enemy.damage, enemy.x, enemy.id, enemy.kind || null, enemy);
      }
      enemy.attackCooldown += interval;
    }
  }
}

function removeDead(state) {
  if (state.enemies.some(enemy => enemy?.dead)) {
    state.enemies = state.enemies.filter(enemy => enemy && !enemy.dead);
  }
}

function wardTarget(state, source) {
  const range = source.wardRange;
  if (!(range > 0)) return null;
  const enemies = state.enemies;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy === source) continue;
    if (enemy.id != null && source.id != null && enemy.id === source.id) continue;
    const dist = distance(source, enemy);
    if (!(dist <= range)) continue;
    if (!best || dist < bestDistance - 1e-4 || (Math.abs(dist - bestDistance) <= 1e-4 && String(enemy.id) < String(best.id))) {
      best = enemy;
      bestDistance = dist;
    }
  }
  return best;
}

function updateWards(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy) enemy.wardShield = 0;
  }
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    if (!isLiving(source) || isStunned(source)) continue;
    if (!(source.wardRange > 0) || !(source.wardReduction > 0)) continue;
    const target = wardTarget(state, source);
    if (!target) continue;
    target.wardShield = Math.min(WARD_CAP, Math.max(target.wardShield, Math.min(WARD_CAP, source.wardReduction)));
  }
}

/**
 * Acquire targets by true distance from each defender's slot center, step
 * projectiles without tunneling, let menders heal, then let living enemies
 * bite the shared fence. Phased enemies are not shot, but they still bite.
 * A warden's shield is applied before shots. It never covers the warden.
 * Does not modify state.time, state.tick, or state.speed.
 */
// Derived statistics are shared across fixed steps; the serialized state remains authoritative.
const combatStatsCache=new WeakMap();
function combatStats(unit,state) {
  const levels=unit.kind==='hero'?Object.values(unit.upgrades).join(',')+Object.keys(unit.upgrades).join(','):'';
  const bonuses=state.systems?.integration?.bonuses || state.profileSnapshot;
  const cached=combatStatsCache.get(unit);
  if (cached && cached.rank===unit.rank && cached.type===unit.type && cached.levels===levels && cached.bonuses===bonuses) return cached.stats;
  const stats=getUnitStats(unit,state);
  combatStatsCache.set(unit,{rank:unit.rank,type:unit.type,levels,bonuses,stats});
  return stats;
}
const SW_BASE_CD = Object.freeze({
  napalm: [7.0, 5.6, 4.4, 3.5],
  armored_car: [9.0, 7.2, 5.8, 4.6],
  cryo_barrage: [7.4, 6.0, 4.8, 3.8],
  orbital_beam: [8.0, 6.5, 5.2, 4.1],
  ricochet: [7.2, 5.8, 4.6, 3.6],
});

export function superweaponCooldown(id, rank, haste = 0) {
  const table = SW_BASE_CD[id];
  if (!table) return 8;
  const idx = clamp(Math.floor(rank || 1) - 1, 0, table.length - 1);
  return table[idx] / (1 + Math.max(0, finite(haste, 0)));
}

function ensureArsenal(state) {
  if (!state.arsenal || typeof state.arsenal !== 'object') {
    state.arsenal = {
      timers: {napalm: 1.6, armored_car: 2.4, cryo_barrage: 2.0, orbital_beam: 2.6, ricochet: 2.2},
      sweepers: [],
      beams: [],
    };
  }
  if (!state.arsenal.timers || typeof state.arsenal.timers !== 'object') {
    state.arsenal.timers = {napalm: 1.6, armored_car: 2.4, cryo_barrage: 2.0, orbital_beam: 2.6, ricochet: 2.2};
  }
  if (!Array.isArray(state.arsenal.sweepers)) state.arsenal.sweepers = [];
  if (!Array.isArray(state.arsenal.beams)) state.arsenal.beams = [];
  return state.arsenal;
}

function densestEnemy(state, minY = 30) {
  let best = null;
  let bestScore = -1;
  for (const e of state.enemies) {
    if (!isTargetable(e) || e.y < minY) continue;
    let score = 1;
    for (const o of state.enemies) {
      if (!isTargetable(o) || o.id === e.id) continue;
      if (distance(e, o) <= 74) score += 1;
    }
    score += e.y / 640;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function densestLaneX(state) {
  const lanes = [54, 117, 180, 243, 306];
  let bestX = 180;
  let bestScore = 0;
  for (const lx of lanes) {
    let score = 0;
    for (const e of state.enemies) {
      if (!isLiving(e) || e.y < 16) continue;
      if (Math.abs(e.x - lx) <= 42) score += 1 + (e.y / 520);
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = lx;
    }
  }
  return bestScore > 0 ? bestX : null;
}

function priorityColumnTarget(state) {
  let best = null;
  let bestScore = -1;
  for (const e of state.enemies) {
    if (!isTargetable(e) || e.y < 24) continue;
    const score = (e.kind === 'boss' ? 5000 : 0) + (ENEMIES[e.kind]?.priority ? 800 : 0) + finite(e.hp, 0) + e.y * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function updateSuperweapons(state, dt, heroEntry) {
  const hero = heroEntry?.unit;
  const upgrades = hero?.upgrades || {};
  const napalmRank = Math.floor(finite(upgrades.napalm, 0));
  const carRank = Math.floor(finite(upgrades.armored_car, 0));
  const cryoRank = Math.floor(finite(upgrades.cryo_barrage, 0));
  const beamRank = Math.floor(finite(upgrades.orbital_beam, 0));
  const emRank = Math.floor(finite(upgrades.ricochet, 0));
  const existingSweepers = state.arsenal?.sweepers?.length || 0;
  const existingBeams = state.arsenal?.beams?.length || 0;
  if (!napalmRank && !carRank && !cryoRank && !beamRank && !emRank && !existingSweepers && !existingBeams) return;

  const arsenal = ensureArsenal(state);
  const haste = finite(state.systems?.integration?.bonuses?.superweaponHaste, 0);
  const recharge = defenderRecharge(state);
  const heroDmg = Math.max(12, finite(heroEntry?.stats?.damage, 14));
  const heroId = hero?.id || 'u1';
  const heroSlot = heroEntry?.slot || {x: ARENA.width / 2, y: ARENA.frontY};

  // Step active Armored Sweeper trucks rolling up the field
  const keptSweepers = [];
  for (const sw of arsenal.sweepers) {
    sw.y -= sw.speed * dt;
    if (!Array.isArray(sw.hitIds)) sw.hitIds = [];
    for (const enemy of state.enemies) {
      if (!isLiving(enemy) || sw.hitIds.includes(enemy.id)) continue;
      const rad = finite(enemy.radius, 12);
      if (Math.abs(enemy.x - sw.x) <= sw.halfWidth + rad && Math.abs(enemy.y - sw.y) <= 24 + rad) {
        sw.hitIds.push(enemy.id);
        damageEnemy(state, enemy, sw.damage, {sourceId: heroId, towerType: 'armored_car', type: 'armored_car', crit: true, armorPen: 0.4});
        if (isLiving(enemy)) {
          pushEnemy(state, enemy, enemy.kind === 'boss' ? 24 : sw.knockback);
          if (enemy.kind !== 'boss') applyStatus(enemy, {type: 'stun', power: 1, remaining: 0.75, sourceId: heroId});
        }
      }
    }
    if (sw.y > -32) keptSweepers.push(sw);
  }
  arsenal.sweepers = keptSweepers;

  // Step active Orbital Laser Beam visuals
  for (const beam of arsenal.beams) beam.life -= dt;
  arsenal.beams = arsenal.beams.filter(b => b.life > 1e-6);

  // 1. Napalm Airstrike (Fire Sea)
  if (napalmRank > 0) {
    arsenal.timers.napalm = finite(arsenal.timers.napalm, 1.6) - dt * recharge;
    if (arsenal.timers.napalm <= 1e-9) {
      const target = densestEnemy(state, 40);
      if (target) {
        arsenal.timers.napalm = superweaponCooldown('napalm', napalmRank, haste);
        const cx = clamp(target.x, 26, ARENA.width - 26);
        const cy = clamp(target.y, 44, ARENA.fenceY - 22);
        const blastRadius = 58 + 10 * napalmRank;
        const blastDmg = heroDmg * (2.0 + 0.75 * napalmRank);
        emitEvent(state, 'napalm_blast', {x: cx, y: cy, radius: blastRadius, damage: blastDmg, rank: napalmRank});
        for (const e of state.enemies) {
          if (!isLiving(e) || distance(e, {x: cx, y: cy}) > blastRadius) continue;
          damageEnemy(state, e, blastDmg, {sourceId: heroId, towerType: 'napalm', type: 'napalm_blast', crit: napalmRank >= 2, armorPen: 0.25});
          applyStatus(e, {type: 'burn', power: 6 * napalmRank, remaining: 3.4, sourceId: heroId, tickTimer: 0});
        }
        addCloud(state, {
          id: uid(state, 'c'), kind: 'napalm', sourceId: heroId,
          x: cx, y: cy, radius: 62 + 10 * napalmRank,
          duration: 4.5, remaining: 4.5, tick: 0.4, tickTimer: 0,
          dps: heroDmg * (0.55 + 0.22 * napalmRank),
          burn: {dps: 6 * napalmRank, duration: 2.8}
        });
      } else {
        arsenal.timers.napalm = 0.2;
      }
    }
  }

  // 2. Armored Sweeper Truck
  if (carRank > 0) {
    arsenal.timers.armored_car = finite(arsenal.timers.armored_car, 2.4) - dt * recharge;
    if (arsenal.timers.armored_car <= 1e-9) {
      const laneX = densestLaneX(state);
      if (laneX != null) {
        arsenal.timers.armored_car = superweaponCooldown('armored_car', carRank, haste);
        const sweeper = {
          id: uid(state, 'sw'),
          x: laneX,
          y: ARENA.fenceY - 6,
          speed: 255,
          halfWidth: 34,
          damage: heroDmg * (2.6 + 1.0 * carRank),
          knockback: 68 + 10 * carRank,
          rank: carRank,
          hitIds: [],
        };
        arsenal.sweepers.push(sweeper);
        emitEvent(state, 'armored_car', {x: laneX, y: ARENA.fenceY - 12, rank: carRank});
      } else {
        arsenal.timers.armored_car = 0.25;
      }
    }
  }

  // 3. Glacial Barrage Fan (Cryo Shards)
  if (cryoRank > 0) {
    arsenal.timers.cryo_barrage = finite(arsenal.timers.cryo_barrage, 2.0) - dt * recharge;
    if (arsenal.timers.cryo_barrage <= 1e-9) {
      const anyFoe = state.enemies.some(e => isTargetable(e) && e.y >= 20);
      if (anyFoe) {
        arsenal.timers.cryo_barrage = superweaponCooldown('cryo_barrage', cryoRank, haste);
        const count = 3 + 2 * cryoRank;
        const spread = Math.PI * 0.68;
        const dmg = heroDmg * (1.15 + 0.38 * cryoRank);
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 - spread / 2 + (spread * i) / (count - 1);
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          state.projectiles.push({
            id: uid(state, 'p'),
            sourceId: heroId,
            targetId: null,
            x: heroSlot.x + dx * 12,
            y: ARENA.fenceY - 8,
            speed: 480,
            damage: dmg,
            crit: false,
            critMultiplier: 1,
            critChance: 0,
            tags: ['frost', 'cryo_barrage', 'pierce'],
            splash: 0,
            chain: 0,
            chainRange: 70,
            pierce: 4 + cryoRank,
            visited: [],
            life: 1.4,
            dirx: dx,
            diry: dy,
            aimx: null,
            aimy: null,
            towerType: 'frost',
            rank: cryoRank,
            effects: {
              slow: {factor: 0.46, duration: 2.8},
              brittle: {power: 0.14 * cryoRank, duration: 3.0},
              knockback: 22,
              armorPen: 0.25,
            },
            mechanics: [],
            impactType: null,
            isSplitChild: true,
          });
        }
        emitEvent(state, 'cryo_barrage', {x: heroSlot.x, y: ARENA.fenceY - 12, count, rank: cryoRank});
      } else {
        arsenal.timers.cryo_barrage = 0.2;
      }
    }
  }

  // 4. Orbital Laser Beam
  if (beamRank > 0) {
    arsenal.timers.orbital_beam = finite(arsenal.timers.orbital_beam, 2.6) - dt * recharge;
    if (arsenal.timers.orbital_beam <= 1e-9) {
      const target = priorityColumnTarget(state);
      if (target) {
        arsenal.timers.orbital_beam = superweaponCooldown('orbital_beam', beamRank, haste);
        const bx = clamp(target.x, 22, ARENA.width - 22);
        const width = 30 + 8 * beamRank;
        const dmg = heroDmg * (2.5 + 0.95 * beamRank) * (1 + 0.25 * beamRank);
        arsenal.beams.push({id: uid(state, 'bm'), x: bx, width, life: 0.65, maxLife: 0.65, rank: beamRank});
        emitEvent(state, 'orbital_beam', {x: bx, y: target.y, width, damage: dmg, rank: beamRank});
        for (const e of state.enemies) {
          if (!isTargetable(e) || e.y < -12) continue;
          if (Math.abs(e.x - bx) <= width / 2 + finite(e.radius, 12)) {
            damageEnemy(state, e, dmg, {sourceId: heroId, towerType: 'orbital_beam', type: 'orbital_beam', crit: true, armorPen: 0.65});
            applyStatus(e, {type: 'burn', power: 5 * beamRank, remaining: 2.2, sourceId: heroId, tickTimer: 0});
          }
        }
      } else {
        arsenal.timers.orbital_beam = 0.2;
      }
    }
  }

  // 5. EM Sky-Strike (from EM Ricochet)
  if (emRank > 0) {
    arsenal.timers.ricochet = finite(arsenal.timers.ricochet, 2.2) - dt * recharge;
    if (arsenal.timers.ricochet <= 1e-9) {
      const first = selectTarget(state, {x: ARENA.width / 2, y: ARENA.fenceY}, 520, 'priority');
      if (first) {
        arsenal.timers.ricochet = superweaponCooldown('ricochet', emRank, haste);
        const maxTargets = 3 + emRank;
        const dmg = heroDmg * (1.45 + 0.45 * emRank);
        const hitIds = [];
        const points = [];
        let curr = first;
        for (let step = 0; step < maxTargets && curr; step++) {
          hitIds.push(curr.id);
          points.push({x: curr.x, y: curr.y});
          damageEnemy(state, curr, dmg, {sourceId: heroId, towerType: 'lightning', type: 'em_strike', crit: step === 0, armorPen: 0.35});
          if (isLiving(curr) && curr.kind !== 'boss') {
            applyStatus(curr, {type: 'stun', power: 1, remaining: 0.55, sourceId: heroId});
          }
          curr = nearestEnemy(state, curr, 130, hitIds);
        }
        emitEvent(state, 'em_strike', {x: points[0].x, y: points[0].y, points, rank: emRank});
      } else {
        arsenal.timers.ricochet = 0.2;
      }
    }
  }
}

export function updateCombat(state, dt) {
  if (simulationFrozen(state)) return state;
  if (!Number.isFinite(dt) || dt <= 0) return state;
  if (!Array.isArray(state.slots)) return state;
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  if (!Array.isArray(state.events)) state.events = [];

  state.surge.shieldTimer=Math.max(0,state.surge.shieldTimer-dt);
  state.surge.cooldown=Math.max(0,state.surge.cooldown-dt);
  attachLivingSplits(state);
  removeDead(state);
  updateWards(state);

  const roster = [];
  let heroEntry = null;
  for (const slot of state.slots) {
    if (!slot?.unit) continue;
    const stats = combatStats(slot.unit, state);
    if (!stats || typeof stats !== 'object') continue;
    const entry = {slot, unit: slot.unit, stats};
    roster.push(entry);
    if (slot.unit.kind === 'hero' || slot.unit.type === 'hero') heroEntry = entry;
  }
  const aura = computeAura(roster);
  updateDefenders(state, dt, roster, aura);
  updateProjectiles(state, dt);
  updateClouds(state, dt);
  updateSuperweapons(state, dt, heroEntry);
  updateMenders(state, dt);
  updateFenceAttacks(state, dt);
  updateCharges(state, dt);
  removeDead(state);
  return state;
}
