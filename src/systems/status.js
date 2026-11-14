/**
 * Enemy status effects. One object of each type is stored on enemy.statuses.
 * This module does not import combat. DOT damage is delivered through the
 * damageEnemy-shaped callback so kill credit, armor, and XP stay in combat.
 *
 * Status: {type, power, remaining, sourceId, stacks?, tickTimer?, maxStacks?}
 *   burn     power = damage per second, no stacks. Weaker burns are ignored.
 *   poison   power = damage per second per stack. Stacks grow by 1 up to
 *            maxStacks (default 5, hard cap 8). Highest power and highest
 *            maxStacks are kept. Duration is refreshed, never added.
 *   slow     power = remaining speed factor, e.g. 0.65 keeps 65% speed.
 *            Clamped to [0.2, 1). Stronger means a lower factor. 0 is rejected;
 *            a full stop is stun. getSpeedFactor does not write enemy.speed.
 *   stun     movement factor 0. Remaining is capped at 4s so hits cannot
 *            bank a long lock. isStunned is separate from death.
 *   brittle  power = bonus fraction of damage taken (0.25 = +25%), cap +100%.
 *            Combat should multiply incoming damage by getDamageTakenFactor
 *            once, before armor. DOT amounts passed to the callback are raw.
 *
 * Reapplying never shortens a live effect and never sums durations. The longer
 * remaining time is kept, then clamped (16s, or 4s for stun). Equal or
 * stronger burns/slows/brittles refresh; a weaker one is left untouched.
 * Poison still adds a stack when it does not increase power.
 *
 * DOT uses a 0.25s cadence. tickTimer accumulates unpaid seconds, including
 * across large dt, and a leftover partial is paid when the effect expires.
 * Payment stops once enemy.dead or hp <= 0, so a long step cannot keep
 * damaging a corpse. tickTimer is presentation/cadence state and is part of
 * the serializable status so a saved run keeps its phase.
 *
 * Callback options: {sourceId, type:'burn'|'poison', crit:false, dot:true}.
 * dot:true means combat must not re-apply on-hit statuses.
 *
 * applyStatus has no run state. Apply/refresh markers are flushed on the next
 * updateStatuses call (combat runs after statuses, so the event is one step
 * later). Events use type 'status' and action 'apply' | 'refresh' | 'expire'.
 * Intensity changes emit refresh; a pure duration refresh does not.
 *
 * Optional hooks for bosses: enemy.statusImmune = ['stun'], and
 * enemy.statusResist = {slow: 0.5} shortens that type's incoming duration
 * (1 = immune). Unknown status entries are preserved.
 *
 * updateStatuses does not advance time, tick, or RNG, and does not remove
 * enemies. It no-ops when paused, hiddenPaused, or phase is a non-playing
 * string. A partial state with no phase still updates.
 */
import {clamp, emit} from '../shared.js';

export const STATUS_TYPES = Object.freeze(['burn', 'poison', 'slow', 'stun', 'brittle']);

export const STATUS_LIMITS = Object.freeze({
  maxDuration: 16,
  maxStun: 4,
  minSlow: 0.2,
  maxBrittle: 1,
  maxBurnDps: 400,
  maxPoisonDps: 200,
  defaultPoisonStacks: 5,
  maxPoisonStacks: 8,
  dotTick: 0.25
});

const TYPES = new Set(STATUS_TYPES);
const DOT_TYPES = new Set(['burn', 'poison']);
const EPS = 1e-4;
const pendingNotify = new WeakMap();

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDead(enemy) {
  if (!enemy || enemy.dead === true) return true;
  return finite(enemy.hp) && enemy.hp <= 0;
}

function cleanSource(id) {
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

function durationCap(type) {
  return type === 'stun' ? STATUS_LIMITS.maxStun : STATUS_LIMITS.maxDuration;
}

function immune(enemy, type) {
  const list = enemy && (enemy.statusImmune || enemy.immune);
  return Array.isArray(list) && list.includes(type);
}

function resistScale(enemy, type) {
  const table = enemy && enemy.statusResist;
  if (!table || typeof table !== 'object') return 1;
  const resist = table[type];
  if (!finite(resist)) return 1;
  return 1 - clamp(resist, 0, 1);
}

function readPower(type, input) {
  if (finite(input.power)) return input.power;
  if (type === 'slow' && finite(input.factor)) return input.factor;
  if ((type === 'burn' || type === 'poison') && finite(input.dps)) return input.dps;
  if (type === 'brittle' && finite(input.bonus)) return input.bonus;
  if (type === 'stun') return 1;
  return NaN;
}

function readDuration(input) {
  if (finite(input.remaining)) return input.remaining;
  if (finite(input.duration)) return input.duration;
  return NaN;
}

function readMaxStacks(input, previous) {
  const requested = finite(input.maxStacks) ? Math.floor(input.maxStacks) : STATUS_LIMITS.defaultPoisonStacks;
  const prior = finite(previous) ? previous : 0;
  return clamp(Math.max(prior, requested), 1, STATUS_LIMITS.maxPoisonStacks);
}

function normalize(enemy, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, reason: 'invalid'};
  const type = typeof input.type === 'string' ? input.type.toLowerCase() : '';
  if (!TYPES.has(type)) return {ok: false, reason: 'invalid'};
  if (isDead(enemy)) return {ok: false, reason: 'dead'};
  if (immune(enemy, type)) return {ok: false, reason: 'immune'};

  let power = readPower(type, input);
  let remaining = readDuration(input);
  if (!finite(remaining) || remaining <= EPS) return {ok: false, reason: 'invalid'};
  if (type !== 'stun' && !finite(power)) return {ok: false, reason: 'invalid'};

  remaining = clamp(remaining * resistScale(enemy, type), 0, durationCap(type));
  if (remaining <= EPS) return {ok: false, reason: 'immune'};

  if (type === 'burn') power = clamp(power, 0, STATUS_LIMITS.maxBurnDps);
  else if (type === 'poison') power = clamp(power, 0, STATUS_LIMITS.maxPoisonDps);
  else if (type === 'slow') {
    // 0 would freeze without counting as a stun, so it is invalid rather than clamped.
    if (power <= 0) return {ok: false, reason: 'invalid'};
    if (power >= 1) return {ok: false, reason: 'ineffective'};
    power = clamp(power, STATUS_LIMITS.minSlow, 1);
  } else if (type === 'brittle') power = clamp(power, 0, STATUS_LIMITS.maxBrittle);
  else power = 1;

  if ((type === 'burn' || type === 'poison' || type === 'brittle') && power <= 0) return {ok: false, reason: 'ineffective'};

  return {
    ok: true,
    spec: {
      type,
      power,
      remaining,
      sourceId: cleanSource(input.sourceId),
      maxStacks: type === 'poison' ? readMaxStacks(input, 0) : 1
    }
  };
}

function ensureList(enemy) {
  if (!Array.isArray(enemy.statuses)) enemy.statuses = [];
  return enemy.statuses;
}

function sameType(list, type) {
  const found = [];
  for (const status of list) {
    if (status && status.type === type) found.push(status);
  }
  return found;
}

function mergeDuplicate(keep, extra) {
  const type = keep.type;
  if (type === 'slow') keep.power = Math.min(finite(keep.power) ? keep.power : 1, finite(extra.power) ? extra.power : 1);
  else if (type === 'stun') keep.power = 1;
  else keep.power = Math.max(finite(keep.power) ? keep.power : 0, finite(extra.power) ? extra.power : 0);
  keep.remaining = Math.max(finite(keep.remaining) ? keep.remaining : 0, finite(extra.remaining) ? extra.remaining : 0);
  if (type === 'poison') {
    const stacks = (finite(keep.stacks) ? keep.stacks : 1) + (finite(extra.stacks) ? extra.stacks : 1);
    keep.maxStacks = readMaxStacks(keep, finite(extra.maxStacks) ? extra.maxStacks : 0);
    keep.stacks = clamp(Math.round(stacks), 1, keep.maxStacks);
  }
  if (DOT_TYPES.has(type)) {
    const accrued = Math.max(finite(keep.tickTimer) ? keep.tickTimer : 0, finite(extra.tickTimer) ? extra.tickTimer : 0);
    keep.tickTimer = Math.min(accrued, STATUS_LIMITS.maxDuration);
  }
}

function collapse(list) {
  const out = [];
  const index = new Map();
  for (const status of list) {
    if (!status || typeof status !== 'object') continue;
    if (!TYPES.has(status.type)) {
      out.push(status);
      continue;
    }
    const prior = index.get(status.type);
    if (!prior) {
      index.set(status.type, status);
      out.push(status);
      continue;
    }
    mergeDuplicate(prior, status);
  }
  return out;
}

function markNotify(status, action) {
  // Keep the original apply if this object has not been announced yet.
  if (pendingNotify.get(status) === 'apply') return;
  pendingNotify.set(status, action);
}

function takeNotify(status) {
  const action = pendingNotify.get(status);
  if (!action) return null;
  pendingNotify.delete(status);
  return action;
}

function blankStatus(spec) {
  const status = {
    type: spec.type,
    power: spec.power,
    remaining: spec.remaining,
    sourceId: spec.sourceId
  };
  if (spec.type === 'poison') {
    status.stacks = 1;
    status.maxStacks = spec.maxStacks;
    status.tickTimer = 0;
  } else if (spec.type === 'burn') {
    status.tickTimer = 0;
  }
  return status;
}

function stronger(type, next, prev) {
  if (!finite(prev)) return type !== 'stun';
  if (type === 'slow') return next < prev - 1e-6;
  if (type === 'stun') return false;
  return next > prev + 1e-6;
}

function powerEqual(type, next, prev) {
  if (type === 'stun') return true;
  if (!finite(prev)) return false;
  return Math.abs(next - prev) <= 1e-6;
}

/**
 * Apply or refresh one status on an enemy. Does not allocate ids or touch RNG.
 * Returns {ok, reason, status?, action?}. action is apply, refresh, unchanged, or reject.
 */
export function applyStatus(enemy, status) {
  if (!enemy || typeof enemy !== 'object') return {ok: false, reason: 'invalid', action: 'reject'};
  const normalized = normalize(enemy, status);
  if (!normalized.ok) return {ok: false, reason: normalized.reason, action: 'reject'};
  const spec = normalized.spec;
  const list = collapse(ensureList(enemy));
  enemy.statuses = list;
  const existing = sameType(list, spec.type)[0] || null;

  if (!existing) {
    const created = blankStatus(spec);
    list.push(created);
    markNotify(created, 'apply');
    return {ok: true, reason: 'applied', action: 'apply', status: created};
  }

  const cap = durationCap(spec.type);
  let changed = false;
  if (spec.type === 'poison') {
    const maxStacks = readMaxStacks(spec, existing.maxStacks);
    const currentStacks = clamp(Math.round(finite(existing.stacks) ? existing.stacks : 1), 1, maxStacks);
    const stacks = clamp(currentStacks + 1, 1, maxStacks);
    const currentPower = finite(existing.power) ? existing.power : 0;
    const power = clamp(Math.max(currentPower, spec.power), 0, STATUS_LIMITS.maxPoisonDps);
    const currentRemaining = finite(existing.remaining) ? existing.remaining : 0;
    const remaining = clamp(Math.max(currentRemaining, spec.remaining), 0, cap);
    if (maxStacks !== existing.maxStacks || stacks !== currentStacks || power !== currentPower || remaining - currentRemaining > 1e-6) {
      changed = stacks !== currentStacks || power - currentPower > 1e-6;
      existing.maxStacks = maxStacks;
      existing.stacks = stacks;
      existing.power = power;
      existing.remaining = remaining;
      existing.sourceId = spec.sourceId;
      if (!finite(existing.tickTimer) || existing.tickTimer < 0) existing.tickTimer = 0;
      if (changed) markNotify(existing, 'refresh');
      return {ok: true, reason: 'refreshed', action: 'refresh', status: existing};
    }
    return {ok: true, reason: 'unchanged', action: 'unchanged', status: existing};
  }

  const prevPower = finite(existing.power) ? existing.power : (spec.type === 'slow' ? 1 : 0);
  const prevRemaining = finite(existing.remaining) ? existing.remaining : 0;
  const upgraded = stronger(spec.type, spec.power, prevPower);
  const equal = powerEqual(spec.type, spec.power, prevPower);
  if (!upgraded && !equal) return {ok: false, reason: 'weaker', action: 'reject', status: existing};

  const remaining = clamp(Math.max(prevRemaining, spec.remaining), 0, cap);
  const nextPower = spec.type === 'slow'
    ? Math.min(prevPower, spec.power)
    : spec.type === 'stun' ? 1 : Math.max(prevPower, spec.power);
  if (nextPower !== existing.power || remaining - existing.remaining > 1e-6) {
    const intensified = spec.type !== 'stun' && Math.abs(nextPower - existing.power) > 1e-6;
    existing.power = nextPower;
    existing.remaining = remaining;
    existing.sourceId = spec.sourceId;
    if (intensified) markNotify(existing, 'refresh');
    return {ok: true, reason: 'refreshed', action: 'refresh', status: existing};
  }
  return {ok: true, reason: 'unchanged', action: 'unchanged', status: existing};
}

/** 0 when dead or stunned, otherwise the strongest slow factor, or 1. */
export function getSpeedFactor(enemy) {
  if (!enemy || typeof enemy !== 'object') return 1;
  if (isDead(enemy)) return 0;
  const list = Array.isArray(enemy.statuses) ? enemy.statuses : null;
  if (!list) return 1;
  let factor = 1;
  for (const status of list) {
    if (!status || !(status.remaining > 0)) continue;
    if (status.type === 'stun') return 0;
    if (status.type === 'slow' && finite(status.power)) {
      factor = Math.min(factor, clamp(status.power, STATUS_LIMITS.minSlow, 1));
    }
  }
  return factor;
}

/** True only for a living enemy with a stun that still has time left. */
export function isStunned(enemy) {
  if (!enemy || typeof enemy !== 'object' || isDead(enemy)) return false;
  const list = enemy.statuses;
  if (!Array.isArray(list)) return false;
  return list.some(status => status && status.type === 'stun' && status.remaining > 0);
}

/**
 * Damage taken multiplier from brittle. 1 means no bonus.
 * Apply once in damageEnemy before the armor reduction.
 */
export function getDamageTakenFactor(enemy) {
  if (!enemy || typeof enemy !== 'object' || isDead(enemy)) return 1;
  const list = enemy.statuses;
  if (!Array.isArray(list)) return 1;
  let bonus = 0;
  for (const status of list) {
    if (!status || status.type !== 'brittle' || !(status.remaining > 0) || !finite(status.power)) continue;
    bonus += Math.max(0, status.power);
  }
  return 1 + Math.min(STATUS_LIMITS.maxBrittle, bonus);
}

function dotDps(status) {
  if (!status || !finite(status.power) || status.power <= 0) return 0;
  if (status.type === 'burn') return clamp(status.power, 0, STATUS_LIMITS.maxBurnDps);
  if (status.type === 'poison') {
    const stacks = clamp(finite(status.stacks) ? status.stacks : 1, 1, STATUS_LIMITS.maxPoisonStacks);
    return clamp(status.power, 0, STATUS_LIMITS.maxPoisonDps) * stacks;
  }
  return 0;
}

function emitStatus(state, enemy, status, action, damage) {
  if (!state || !Array.isArray(state.events)) return;
  const data = {
    action,
    statusType: status.type,
    enemyId: enemy.id ?? null,
    sourceId: status.sourceId ?? null,
    power: status.power,
    stacks: finite(status.stacks) ? status.stacks : 1,
    remaining: Math.max(0, finite(status.remaining) ? status.remaining : 0)
  };
  if (finite(enemy.x)) data.x = enemy.x;
  if (finite(enemy.y)) data.y = enemy.y;
  if (finite(damage) && damage > 0) data.damage = damage;
  emit(state, 'status', data);
}

function flushNotify(state, enemy, status) {
  const action = takeNotify(status);
  if (action) emitStatus(state, enemy, status, action);
}

function drainUnpaid(status) {
  const tick = STATUS_LIMITS.dotTick;
  if (!finite(status.tickTimer) || status.tickTimer < 0) status.tickTimer = 0;
  // Discard whole unpaid ticks. Keeping only the phase stops a later callback
  // from bursting damage for time that was never paid.
  status.tickTimer %= tick;
  if (status.remaining <= EPS) status.tickTimer = 0;
}

function damageOptions(status) {
  const type = status.type;
  const options = {sourceId: status.sourceId ?? null, type, crit: false, dot: true};
  if (type === 'burn' || type === 'poison') options.towerType = type;
  return options;
}

function payDot(state, enemy, status, dps, damageCallback) {
  const tick = STATUS_LIMITS.dotTick;
  let guard = 0;
  while (status.tickTimer >= tick - 1e-8 && !isDead(enemy) && guard++ < 160) {
    // The cadence tolerance may pay a tick a fraction before the boundary.
    // Keep the remainder non-negative so every live frame is saveable.
    status.tickTimer = Math.max(0, status.tickTimer - tick);
    damageCallback(state, enemy, dps * tick, damageOptions(status));
  }
  // Leftover below one tick is paid only when the effect ends, so totals match
  // dps * duration without a large-step burst after death.
  if (!isDead(enemy) && status.remaining <= EPS && status.tickTimer > EPS && status.tickTimer < tick + EPS) {
    const partial = status.tickTimer;
    status.tickTimer = 0;
    damageCallback(state, enemy, dps * partial, damageOptions(status));
  }
  if (isDead(enemy) || status.remaining <= EPS) status.tickTimer = 0;
}

function advanceClock(status, dt) {
  const starting = finite(status.remaining) ? Math.max(0, status.remaining) : 0;
  const budget = Math.min(dt, starting);
  let remaining = starting - dt;
  if (!(remaining > EPS)) remaining = 0;
  status.remaining = remaining;
  return budget;
}

function applyDot(state, enemy, status, dt, damageCallback) {
  const budget = advanceClock(status, dt);
  if (!finite(status.tickTimer) || status.tickTimer < 0) status.tickTimer = 0;
  if (status.tickTimer > STATUS_LIMITS.maxDuration) status.tickTimer = STATUS_LIMITS.maxDuration;
  status.tickTimer += budget;
  const dps = dotDps(status);
  const canDamage = dps > 0 && typeof damageCallback === 'function' && !isDead(enemy);
  if (!canDamage) {
    drainUnpaid(status);
    return;
  }
  payDot(state, enemy, status, dps, damageCallback);
}

function expireStatuses(state, enemy, processing) {
  const keep = [];
  const seen = new Set();
  for (const status of enemy.statuses) {
    if (!status || typeof status !== 'object') continue;
    if (!TYPES.has(status.type)) {
      keep.push(status);
      continue;
    }
    if (seen.has(status.type)) continue;
    seen.add(status.type);
    if (finite(status.remaining) && status.remaining > EPS) {
      keep.push(status);
      continue;
    }
    status.remaining = 0;
    if (processing.includes(status)) emitStatus(state, enemy, status, 'expire');
  }
  enemy.statuses = keep;
}

function simulating(state) {
  if (state.paused === true || state.hiddenPaused === true) return false;
  if (typeof state.phase === 'string' && state.phase !== 'playing') return false;
  return true;
}

/**
 * Advance every enemy's statuses by dt simulation seconds.
 * damageCallback(state, enemy, amount, options) matches damageEnemy.
 * Safe to omit the callback when only timers should move.
 */
let statusDepth = 0;

export function updateStatuses(state, dt, damageCallback) {
  if (!state || !Array.isArray(state.enemies)) return;
  if (!simulating(state)) return;
  if (!finite(dt) || dt < 0) return;
  if (statusDepth > 0) return;
  statusDepth += 1;
  try {
    const enemies = state.enemies.slice();
    for (const enemy of enemies) {
      if (!enemy || typeof enemy !== 'object' || !Array.isArray(enemy.statuses)) continue;
      if (enemy.statuses.length === 0) continue;
      enemy.statuses = collapse(enemy.statuses);
      const processing = enemy.statuses.slice();
      for (const status of processing) flushNotify(state, enemy, status);
      if (dt > 0) {
        for (const type of ['burn', 'poison']) {
          const status = processing.find(item => item.type === type);
          if (status) applyDot(state, enemy, status, dt, damageCallback);
        }
        for (const status of processing) {
          if (!TYPES.has(status.type) || DOT_TYPES.has(status.type)) continue;
          if (!finite(status.remaining)) {
            status.remaining = 0;
            continue;
          }
          advanceClock(status, dt);
        }
      }
      expireStatuses(state, enemy, processing);
    }
  } finally {
    statusDepth -= 1;
  }
}
