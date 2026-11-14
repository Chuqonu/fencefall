// A rank-1 banner hastes a neighboring rank-1 bolt and itself.
// Haste shortens the cooldown written after a shot. It leaves the target's speed alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP, createUnit, distance} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {AURA_HASTE_CAP, MIN_ATTACK_INTERVAL, updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';

const PARKED = 600;

function heroes(state) {
  return state.slots.filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'));
}

function parkHero(state) {
  const found = heroes(state);
  assert.equal(found.length, 1);
  const hero = found[0].unit;
  hero.cooldown = PARKED;
  return hero;
}

function place(state, index, type) {
  const unit = createUnit(state, type, 1, 'tower');
  assert.equal(unit.rank, 1);
  unit.cooldown = 0;
  state.slots[index].unit = unit;
  return unit;
}

function scaledInterval(interval, haste) {
  const applied = Math.min(AURA_HASTE_CAP, Math.max(0, haste));
  return Math.max(MIN_ATTACK_INTERVAL, interval / (1 + applied));
}

function cooldownAfterShot(interval, haste) {
  return -STEP + scaledInterval(interval, haste);
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${label}: ${actual} vs ${expected}`);
}

function field(seed, runId, withBanner) {
  const state = createRun({seed, difficulty: 'normal', runId});
  const hero = parkHero(state);
  const bolt = place(state, 0, 'bolt');
  const banner = withBanner ? place(state, 1, 'support') : null;
  const slot = state.slots[0];
  const enemy = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 140,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0,
    attackCooldown: PARKED,
    driftAmp: 0,
    driftFreq: 0,
    driftPhase: 0,
    driftVelocity: 0
  });
  return {state, hero, bolt, banner, enemy};
}

test('a rank-1 banner hastes a neighboring rank-1 bolt and its own shot', () => {
  const plain = field(11, 'aura-haste-plain', false);
  const buffed = field(11, 'aura-haste-banner', true);

  const boltStats = getUnitStats(plain.bolt, plain.state);
  const buffedBoltStats = getUnitStats(buffed.bolt, buffed.state);
  const bannerStats = getUnitStats(buffed.banner, buffed.state);
  const haste = bannerStats.aura && Number(bannerStats.aura.haste);
  assert.equal(buffedBoltStats.interval, boltStats.interval);
  assert.ok(haste > 0, 'banner aura has no haste');
  assert.ok(distance(buffed.state.slots[0], buffed.state.slots[1]) <= bannerStats.aura.range);
  assert.ok(distance(buffed.enemy, buffed.state.slots[0]) <= buffedBoltStats.range);
  assert.ok(distance(buffed.enemy, buffed.state.slots[1]) <= bannerStats.range);
  assert.ok(distance(plain.enemy, plain.state.slots[0]) <= boltStats.range);

  const plainSpeed = plain.enemy.speed;
  const buffedSpeed = buffed.enemy.speed;
  assert.equal(typeof plainSpeed, 'number');
  assert.ok(Number.isFinite(plainSpeed) && plainSpeed > 0);
  assert.equal(typeof buffedSpeed, 'number');
  assert.ok(Number.isFinite(buffedSpeed) && buffedSpeed > 0);

  updateCombat(plain.state, STEP);
  updateCombat(buffed.state, STEP);

  const plainShots = plain.state.events.filter(event => event.type === 'shot');
  const buffedShots = buffed.state.events.filter(event => event.type === 'shot');
  assert.equal(plainShots.length, 1);
  assert.equal(plainShots[0].sourceId, plain.bolt.id);
  assert.equal(plainShots[0].targetId, plain.enemy.id);
  assert.equal(buffedShots.length, 2);
  const boltShot = buffedShots.find(event => event.sourceId === buffed.bolt.id);
  const bannerShot = buffedShots.find(event => event.sourceId === buffed.banner.id);
  assert.ok(boltShot);
  assert.ok(bannerShot);
  assert.equal(boltShot.targetId, buffed.enemy.id);
  assert.equal(bannerShot.targetId, buffed.enemy.id);
  assert.equal(plainShots.some(event => event.sourceId === plain.hero.id), false);
  assert.equal(buffedShots.some(event => event.sourceId === buffed.hero.id), false);

  assert.ok(
    buffed.bolt.cooldown < plain.bolt.cooldown,
    `bolt cooldown ${buffed.bolt.cooldown} is not shorter than ${plain.bolt.cooldown}`
  );
  near(plain.bolt.cooldown, cooldownAfterShot(boltStats.interval, 0), 'plain bolt cooldown');
  near(buffed.bolt.cooldown, cooldownAfterShot(buffedBoltStats.interval, haste), 'hasted bolt cooldown');
  near(buffed.banner.cooldown, cooldownAfterShot(bannerStats.interval, haste), 'banner cooldown');
  assert.ok(
    buffed.banner.cooldown < bannerStats.interval,
    `banner cooldown ${buffed.banner.cooldown} is not shorter than interval ${bannerStats.interval}`
  );

  assert.equal(plain.enemy.speed, plainSpeed);
  assert.equal(buffed.enemy.speed, buffedSpeed);
  assert.equal(heroes(plain.state).length, 1);
  assert.equal(heroes(buffed.state).length, 1);
  assert.equal(plain.state.slots[2].unit, plain.hero);
  assert.equal(buffed.state.slots[2].unit, buffed.hero);
  near(plain.hero.cooldown, PARKED - STEP, 'parked hero');
  near(buffed.hero.cooldown, PARKED - STEP, 'parked hero beside banner');
  assert.equal(buffed.bolt.rank, 1);
  assert.equal(buffed.banner.rank, 1);
  assert.equal(buffed.banner.type, 'support');
});
