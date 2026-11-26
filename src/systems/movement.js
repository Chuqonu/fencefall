// Spawn placement and enemy travel.
//
// sampleSpawnX draws a truncated normal with rejection sampling so mass stays
// near the center and is not piled on the arena edges.
// spawnEnemy applies DIFFICULTIES health, speed and damage exactly once.
// healthScale is an extra HP multiplier for the director (wave growth).
// Finite overrides hp, maxHp, speed and damage replace the scaled values
// and are not multiplied again. Pass wave growth as healthScale, not as a
// pre-scaled hp, or difficulty will not be applied.
//
// Domain fields on each enemy (JSON-safe, persist with the run):
//   driftAnchor  oscillation center, logical px
//   driftFreq    rad/s
//   driftAmp     lateral amplitude, logical px (orbit stays inside the arena)
//   driftPhase   current angle, rad
//   driftVelocity  analytic lateral speed, px/s (not a second integrator)
//
// Leap, phase, banner, and ward numbers are copied from the catalog only when
// that mechanic object is present. They are not difficulty-scaled. A finite
// override of the same name replaces the catalog number. Missing mechanics
// add no keys.
//   leapEvery, leapWindup, leapDistance, leapClock, leapTimer
//     Crouch for leapWindup, then jump leapDistance along y only.
//     leapClock waits until the next crouch. leapTimer is the crouch left.
//     No leap when speed <= 0 or the center is within 36px of the stop line.
//   phaseOpen, phaseShut, phaseClock, phased
//     Open and shut alternate even while stunned, and never change x or y.
//   bannerRange, bannerHaste
//     Other living enemies inside the range add haste to forward movement,
//     summed and capped at 0.45. A banner does not buff itself. Haste is not
//     applied while the enemy is planted on the fence. Drift is unchanged.
//   wardRange, wardReduction
//     Reduction is capped at 0.4. A warden does not shield itself; combat
//     assigns the shield.
//   chargeGap, chargeWindup, chargeDamage, chargeTimer, chargeLit
//     chargeDamage is scaled once by difficulty damage. The fuse lights only
//     after fence contact. Combat applies the blast. Gap is the approach tell.
//   hushFactor
//     While this enemy is on the fence and not stunned, defender cooldowns
//     recharge at this rate. 0.75 means 75% of the usual recharge. It does not
//     stack, and it does not change enemy.speed.
//
// updateMovement does not write enemy.speed. Slow is getSpeedFactor.
// Dead enemies and stun (status remaining > 0) do not move.
// Living enemies stop with center y <= fenceY - radius, then set attacking
// and end lateral drift. Drift during the approach stays inside [enemyMinX, enemyMaxX].

import { ARENA, DIFFICULTIES, clamp, emit, random, uid } from '../shared.js';
import { ENEMIES } from '../data/enemies.js';
import { getSpeedFactor } from './status.js';

const TAU = Math.PI * 2;
const SPAWN_ATTEMPTS = 32;
const DRIFT_FREQ_MIN = 0.55;
const DRIFT_FREQ_SPAN = 0.65;
const DRIFT_AMP_MIN = 8;
const DRIFT_AMP_SPAN = 10;
const DRIFT_AMP_CAP = 24;
const LEAP_STOP_GAP = 36;
const BANNER_HASTE_CAP = 2;

const FALLBACK = Object.freeze({
  hp: 40,
  speed: 30,
  radius: 12,
  damage: 6,
  attackInterval: 1.2,
  xp: 2,
  armor: 0,
});

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStat(entry, names, fallback) {
  const bags = [];
  if (entry && typeof entry === 'object') {
    bags.push(entry);
    if (entry.stats && typeof entry.stats === 'object') bags.push(entry.stats);
    if (entry.base && typeof entry.base === 'object') bags.push(entry.base);
  }
  for (let b = 0; b < bags.length; b++) {
    const bag = bags[b];
    for (let n = 0; n < names.length; n++) {
      const value = bag[names[n]];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function difficultyOf(state) {
  const row = state && DIFFICULTIES[state.difficulty];
  return row || DIFFICULTIES.normal;
}

function normalZ(state) {
  let u = random(state);
  const v = random(state);
  if (!(u > 1e-12)) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function wrapPhase(phase) {
  let p = phase % TAU;
  if (p < 0) p += TAU;
  return p;
}

function catalogEntry(kind) {
  if (!ENEMIES || typeof ENEMIES !== 'object') return null;
  const entry = ENEMIES[kind];
  return entry && typeof entry === 'object' ? entry : null;
}

function isStunned(enemy) {
  const list = enemy.statuses;
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    const status = list[i];
    if (status && status.type === 'stun' && finite(status.remaining, 0) > 0) return true;
  }
  return false;
}

function movementFactor(enemy) {
  const factor = getSpeedFactor(enemy);
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return 1;
  return clamp(factor, 0, 1);
}

function bodyRadius(enemy) {
  const radius = finite(enemy.radius, FALLBACK.radius);
  if (!(radius > 0)) return FALLBACK.radius;
  return radius;
}

// Orbit is anchor + sin(phase) * amp, and it must contain x and stay in range.
function fitDrift(x, phase, amp, freq) {
  const minX = ARENA.enemyMinX;
  const maxX = ARENA.enemyMaxX;
  const safeFreq = clamp(finite(freq, DRIFT_FREQ_MIN), 0, 8);
  let mag = Math.abs(finite(amp, 0));
  if (mag > DRIFT_AMP_CAP) mag = DRIFT_AMP_CAP;
  const sine = Math.sin(phase);
  const room = Math.max(0, Math.min(x - minX, maxX - x));
  const limit = room / (1 + Math.abs(sine));
  if (mag > limit) mag = limit;
  const signed = amp < 0 ? -mag : mag;
  const anchor = x - sine * signed;
  const low = anchor - mag;
  const high = anchor + mag;
  if (low < minX - 1e-6 || high > maxX + 1e-6) {
    return { driftAnchor: x, driftAmp: 0, driftFreq: safeFreq, driftPhase: phase, driftVelocity: 0 };
  }
  return {
    driftAnchor: anchor,
    driftAmp: signed,
    driftFreq: safeFreq,
    driftPhase: phase,
    driftVelocity: signed * safeFreq * Math.cos(phase),
  };
}

function mechanicBag(entry, name) {
  if (!entry || typeof entry !== 'object') return null;
  const bag = entry[name];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  return bag;
}

function pickFinite(override, catalog) {
  if (Number.isFinite(override)) return override;
  if (Number.isFinite(catalog)) return catalog;
  return null;
}

function attachLeap(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'leap');
  if (!bag) return;
  const every = pickFinite(opts.leapEvery, bag.every);
  const windup = pickFinite(opts.leapWindup, bag.windup);
  const distance = pickFinite(opts.leapDistance, bag.distance);
  if (!(every > 0) || !(distance > 0)) return;
  enemy.leapEvery = every;
  enemy.leapWindup = windup === null ? 0 : windup;
  enemy.leapDistance = distance;
  enemy.leapClock = Number.isFinite(opts.leapClock) ? opts.leapClock : every;
  enemy.leapTimer = Number.isFinite(opts.leapTimer) ? opts.leapTimer : 0;
}

function attachPhase(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'phase');
  if (!bag) return;
  const open = pickFinite(opts.phaseOpen, bag.open);
  const shut = pickFinite(opts.phaseShut, bag.shut);
  if (!(open > 0) || !(shut > 0)) return;
  enemy.phaseOpen = open;
  enemy.phaseShut = shut;
  enemy.phaseClock = Number.isFinite(opts.phaseClock) ? opts.phaseClock : open;
  enemy.phased = opts.phased === true;
}

function attachBanner(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'banner');
  if (!bag) return;
  const range = pickFinite(opts.bannerRange, bag.range);
  const haste = pickFinite(opts.bannerHaste, bag.haste);
  if (!(range > 0) || !(haste > 0)) return;
  enemy.bannerRange = range;
  enemy.bannerHaste = haste;
}

function attachWard(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'ward');
  if (!bag) return;
  const range = pickFinite(opts.wardRange, bag.range);
  const reduction = pickFinite(opts.wardReduction, bag.reduction);
  if (!(range > 0) || !(reduction > 0)) return;
  enemy.wardRange = range;
  enemy.wardReduction = Math.min(0.4, reduction);
}

function attachCharge(state, enemy, entry, opts) {
  const bag = mechanicBag(entry, 'charge');
  if (!bag) return;
  const gap = pickFinite(opts.chargeGap, bag.gap);
  const windup = pickFinite(opts.chargeWindup, bag.windup);
  const damage = pickFinite(opts.chargeDamage, bag.damage);
  if (!(gap > 0) || !(windup > 0) || !(damage > 0)) return;
  const row = state && DIFFICULTIES[state.difficulty];
  const scale = row && Number.isFinite(row.damage) ? row.damage : 1;
  enemy.chargeGap = gap;
  enemy.chargeWindup = windup;
  enemy.chargeDamage = damage * scale;
  enemy.chargeTimer = Number.isFinite(opts.chargeTimer) ? opts.chargeTimer : 0;
  enemy.chargeLit = opts.chargeLit === true;
}

function attachHush(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'hush');
  if (!bag) return;
  const factor = pickFinite(opts.hushFactor, bag.factor);
  if (!(factor > 0) || factor >= 1) return;
  enemy.hushFactor = Math.max(0.5, Math.min(0.85, factor));
}

function initDrift(state, x, overrides) {
  const phase = Number.isFinite(overrides.driftPhase) ? overrides.driftPhase : random(state) * TAU;
  const freq = Number.isFinite(overrides.driftFreq)
    ? overrides.driftFreq
    : DRIFT_FREQ_MIN + random(state) * DRIFT_FREQ_SPAN;
  const amp = Number.isFinite(overrides.driftAmp)
    ? overrides.driftAmp
    : DRIFT_AMP_MIN + random(state) * DRIFT_AMP_SPAN;
  return fitDrift(x, phase, amp, freq);
}

function applyDrift(enemy, dt, factor) {
  if (!Number.isFinite(enemy.driftAnchor) || !Number.isFinite(enemy.driftAmp)) {
    const repaired = fitDrift(
      finite(enemy.x, 180),
      finite(enemy.driftPhase, 0),
      finite(enemy.driftAmp, 0),
      finite(enemy.driftFreq, 0),
    );
    enemy.driftAnchor = repaired.driftAnchor;
    enemy.driftAmp = repaired.driftAmp;
    enemy.driftFreq = repaired.driftFreq;
    enemy.driftPhase = repaired.driftPhase;
    enemy.driftVelocity = repaired.driftVelocity;
  }
  const freq = finite(enemy.driftFreq, 0);
  const amp = finite(enemy.driftAmp, 0);
  const phase = wrapPhase(finite(enemy.driftPhase, 0) + freq * factor * dt);
  let x = enemy.driftAnchor + Math.sin(phase) * amp;
  if (x < ARENA.enemyMinX || x > ARENA.enemyMaxX) {
    x = clamp(x, ARENA.enemyMinX, ARENA.enemyMaxX);
    enemy.driftAnchor = x;
    enemy.driftAmp = 0;
    enemy.driftVelocity = 0;
    enemy.driftPhase = phase;
    enemy.x = x;
    return;
  }
  enemy.driftPhase = phase;
  enemy.driftVelocity = amp * freq * factor * Math.cos(phase);
  enemy.x = x;
}

export function sampleSpawnX(state, mean = 180, sigma = 60) {
  const mu = finite(mean, 180);
  const sig = Math.abs(finite(sigma, 60));
  const minX = ARENA.enemyMinX;
  const maxX = ARENA.enemyMaxX;
  if (!(sig > 0)) return clamp(mu, minX, maxX);
  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const x = mu + normalZ(state) * sig;
    if (x >= minX && x <= maxX) return x;
  }
  // Exhausted tails still land on the mean, not on a clamped edge.
  return clamp(mu, minX, maxX);
}

export function spawnEnemy(state, kind, overrides = {}) {
  const opts = overrides && typeof overrides === 'object' ? overrides : {};
  const key = typeof kind === 'string' && kind ? kind : 'shambler';
  const entry = catalogEntry(key);
  const diff = difficultyOf(state);
  const healthMul = finite(diff.health, 1);
  const speedMul = finite(diff.speed, 1);
  const damageMul = finite(diff.damage, 1);
  let healthScale = finite(opts.healthScale, 1);
  if (!(healthScale >= 0)) healthScale = 1;

  const baseHp = Math.max(0, readStat(entry, ['hp', 'health', 'maxHp'], FALLBACK.hp));
  const baseSpeed = Math.max(0, readStat(entry, ['speed', 'moveSpeed'], FALLBACK.speed));
  const baseDamage = Math.max(0, readStat(entry, ['damage', 'attackDamage'], FALLBACK.damage));
  const baseRadius = readStat(entry, ['radius', 'bodyRadius'], FALLBACK.radius);
  const baseInterval = readStat(entry, ['attackInterval', 'interval'], FALLBACK.attackInterval);
  const baseXp = readStat(entry, ['xp', 'experience'], FALLBACK.xp);
  const baseArmor = readStat(entry, ['armor'], FALLBACK.armor);

  const computedHp = baseHp * healthMul * healthScale;
  const hpGiven = Number.isFinite(opts.hp);
  const maxGiven = Number.isFinite(opts.maxHp);
  let hp;
  let maxHp;
  if (hpGiven && maxGiven) {
    maxHp = Math.max(0, opts.maxHp);
    hp = clamp(opts.hp, 0, maxHp > 0 ? maxHp : 0);
    if (!(maxHp > 0)) maxHp = hp;
  } else if (hpGiven) {
    hp = Math.max(0, opts.hp);
    maxHp = hp;
  } else if (maxGiven) {
    maxHp = Math.max(0, opts.maxHp);
    hp = maxHp;
  } else {
    maxHp = Math.max(0, computedHp);
    hp = maxHp;
  }

  const speed = Math.max(0, Number.isFinite(opts.speed) ? opts.speed : baseSpeed * speedMul);
  const damage = Math.max(0, Number.isFinite(opts.damage) ? opts.damage : baseDamage * damageMul);
  let radius = Number.isFinite(opts.radius) ? opts.radius : baseRadius;
  if (!(radius > 0)) radius = FALLBACK.radius;
  radius = clamp(radius, 1, 96);
  let attackInterval = Number.isFinite(opts.attackInterval) ? opts.attackInterval : baseInterval;
  if (!(attackInterval > 0)) attackInterval = FALLBACK.attackInterval;
  const xp = Math.max(0, Number.isFinite(opts.xp) ? opts.xp : baseXp);
  const armor = clamp(Number.isFinite(opts.armor) ? opts.armor : baseArmor, 0, 0.8);
  const attackCooldown = Math.max(0, finite(opts.attackCooldown, 0));

  const stopY = ARENA.fenceY - radius;
  let x = Number.isFinite(opts.x) ? clamp(opts.x, ARENA.enemyMinX, ARENA.enemyMaxX) : sampleSpawnX(state);
  let y = Number.isFinite(opts.y) ? opts.y : ARENA.spawnY;
  if (y > stopY) y = stopY;

  const drift = initDrift(state, x, opts);
  const enemy = {
    id: uid(state, 'e'),
    kind: key,
    x,
    y,
    hp,
    maxHp,
    speed,
    radius,
    damage,
    attackInterval,
    attackCooldown,
    xp,
    armor,
    driftPhase: drift.driftPhase,
    driftVelocity: drift.driftVelocity,
    driftFreq: drift.driftFreq,
    driftAmp: drift.driftAmp,
    driftAnchor: drift.driftAnchor,
    statuses: [],
    attacking: y >= stopY - 1e-6,
    dead: false,
  };

  attachLeap(enemy, entry, opts);
  attachPhase(enemy, entry, opts);
  attachBanner(enemy, entry, opts);
  attachWard(enemy, entry, opts);
  attachCharge(state, enemy, entry, opts);
  attachHush(enemy, entry, opts);

  if (!Array.isArray(state.enemies)) state.enemies = [];
  state.enemies.push(enemy);
  return enemy;
}

function tickPhase(state, enemy, dt) {
  if (!(enemy.phaseOpen > 0) || !(enemy.phaseShut > 0)) return;
  if (!Number.isFinite(enemy.phaseClock)) return;
  enemy.phaseClock -= dt;
  if (enemy.phaseClock > 0) return;
  enemy.phased = enemy.phased !== true;
  enemy.phaseClock = enemy.phased ? enemy.phaseShut : enemy.phaseOpen;
  emit(state, 'phase', {x: enemy.x, y: enemy.y, phased: enemy.phased === true});
}

function dashLeap(state, enemy, stopY) {
  enemy.leapTimer = 0;
  enemy.y = Math.min(stopY, enemy.y + enemy.leapDistance);
  enemy.attacking = enemy.y >= stopY - 1e-6;
  emit(state, 'leap', {x: enemy.x, y: enemy.y});
}

function updateLeap(state, enemy, dt, stopY) {
  if (!(enemy.leapEvery > 0) || !(enemy.leapDistance > 0)) return false;
  if (!(enemy.speed > 0) || !(enemy.y < stopY - LEAP_STOP_GAP)) return false;

  if (enemy.leapTimer > 0) {
    enemy.leapTimer -= dt;
    if (enemy.leapTimer > 0) return true;
    dashLeap(state, enemy, stopY);
    return true;
  }

  const clock = (Number.isFinite(enemy.leapClock) ? enemy.leapClock : enemy.leapEvery) - dt;
  if (clock > 0) {
    enemy.leapClock = clock;
    return false;
  }

  enemy.leapClock = enemy.leapEvery;
  if (enemy.leapWindup > 0) {
    enemy.leapTimer = enemy.leapWindup;
    return true;
  }
  dashLeap(state, enemy, stopY);
  return true;
}

function allyHaste(enemies, self) {
  let sum = 0;
  for (let i = 0; i < enemies.length; i++) {
    const other = enemies[i];
    if (other === self || !other || typeof other !== 'object') continue;
    if (other.dead || !(other.hp > 0)) continue;
    const range = other.bannerRange;
    const haste = other.bannerHaste;
    if (!(range > 0) || !(haste > 0)) continue;
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    if (dx * dx + dy * dy <= range * range) sum += haste;
  }
  return sum > BANNER_HASTE_CAP ? BANNER_HASTE_CAP : sum;
}

export function updateMovement(state, dt) {
  if (!state || state.phase !== 'playing' || state.paused || state.hiddenPaused) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || typeof enemy !== 'object') continue;
    if (enemy.dead || !(enemy.hp > 0)) {
      enemy.attacking = false;
      continue;
    }
    if (!Array.isArray(enemy.statuses)) enemy.statuses = [];

    const radius = bodyRadius(enemy);
    const stopY = ARENA.fenceY - radius;
    if (!Number.isFinite(enemy.y)) enemy.y = ARENA.spawnY;
    if (!Number.isFinite(enemy.x)) enemy.x = clamp(finite(enemy.driftAnchor, 180), ARENA.enemyMinX, ARENA.enemyMaxX);
    if (enemy.y > stopY) enemy.y = stopY;

    tickPhase(state, enemy, dt);

    if (isStunned(enemy)) {
      enemy.attacking = false;
      continue;
    }

    if (updateLeap(state, enemy, dt, stopY)) continue;

    const factor = movementFactor(enemy);
    const speed = finite(enemy.speed, 0) > 0 ? enemy.speed : 0;
    const haste = enemy.y >= stopY - 1e-6 ? 0 : allyHaste(enemies, enemy);
    const dy = speed * factor * dt * (1 + haste);
    // Plant at the fence: y stops on the contact line and lateral sway stops with it.
    if (enemy.y + dy >= stopY) {
      enemy.y = stopY;
      enemy.attacking = true;
    } else {
      enemy.y += dy;
      enemy.attacking = false;
      applyDrift(enemy, dt, factor);
    }
  }
}
