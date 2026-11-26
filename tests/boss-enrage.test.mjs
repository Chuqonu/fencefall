// Boss enrage belongs to updateWaves. It reads ENEMIES[kind].enrage and, once,
// sets enemy.enraged when a live body's hp / maxHp drops to that threshold.
// Speed, damage, and attackInterval then move by that same enrage record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateWaves} from '../src/systems/waves.js';

const enrage = ENEMIES.boss.enrage;
const threshold = enrage?.threshold;

function finiteScale(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function fresh(runId) {
  return createRun({seed: 401, difficulty: 'normal', runId});
}

function placeBoss(state, hp, maxHp) {
  return spawnEnemy(state, 'boss', {x: 180, y: 120, hp, maxHp});
}

function assertThreshold(label) {
  assert.ok(Number.isFinite(threshold), `${label}: waves.js boss enrage threshold is missing`);
  assert.ok(threshold > 0 && threshold < 1, `${label}: waves.js boss enrage threshold ${threshold} is outside (0, 1)`);
}

test('boss copy says enrage is half of max HP and the threshold stays 0.5', () => {
  assert.equal(ENEMIES.boss.hp, 3600);
  assert.equal(threshold, 0.5);
  assert.match(ENEMIES.boss.description.en, /half \(0\.5\)/);
  assert.match(ENEMIES.boss.description.zh, /一半（0\.5）/);
});

test(`boss above the waves.js enrage threshold ${threshold} stays calm`, () => {
  assertThreshold('calm');
  const maxHp = 1000;
  const aboveHp = Math.min(maxHp, Math.floor(maxHp * threshold) + 1);
  assert.ok(aboveHp / maxHp > threshold, `no HP sits above enrage threshold ${threshold}`);
  const state = fresh('boss-enrage-calm');
  const enemy = placeBoss(state, aboveHp, maxHp);
  const speed = enemy.speed;
  const damage = enemy.damage;
  const attackInterval = enemy.attackInterval;
  assert.equal(enemy.kind, 'boss');
  assert.ok(enemy.hp / enemy.maxHp > threshold, `setup ratio is not above enrage threshold ${threshold}`);
  updateWaves(state, STEP);
  updateWaves(state, STEP);
  assert.notEqual(enemy.enraged, true, `boss above enrage threshold ${threshold} set enemy.enraged`);
  assert.equal(enemy.speed, speed, `speed changed above enrage threshold ${threshold}`);
  assert.equal(enemy.damage, damage, `damage changed above enrage threshold ${threshold}`);
  assert.equal(enemy.attackInterval, attackInterval, `attackInterval changed above enrage threshold ${threshold}`);
  assert.equal(
    state.events.some(event => event?.type === 'boss_enrage'),
    false,
    `boss_enrage emitted above enrage threshold ${threshold}`,
  );
});

test(`boss at the waves.js enrage threshold ${threshold} sets enemy.enraged and scales speed and damage`, () => {
  assertThreshold('enrage');
  const maxHp = 1000;
  const atHp = maxHp * threshold;
  const aboveHp = Math.min(maxHp, Math.floor(atHp) + 1);
  assert.ok(atHp > 0 && atHp / maxHp <= threshold, `at-threshold HP is not <= enrage threshold ${threshold}`);
  assert.ok(aboveHp / maxHp > threshold, `no HP sits above enrage threshold ${threshold}`);
  const state = fresh('boss-enrage-drop');
  const enemy = placeBoss(state, aboveHp, maxHp);
  updateWaves(state, STEP);
  assert.notEqual(enemy.enraged, true, `boss above enrage threshold ${threshold} enraged before the drop`);

  const speed = enemy.speed;
  const damage = enemy.damage;
  const attackInterval = enemy.attackInterval;
  enemy.hp = atHp;
  assert.ok(enemy.hp / enemy.maxHp <= threshold, `dropped HP is not at enrage threshold ${threshold}`);
  assert.ok(enemy.hp > 0, `dropped HP is not live at enrage threshold ${threshold}`);

  updateWaves(state, STEP);
  const speedScale = finiteScale(enrage.speedScale);
  const damageScale = finiteScale(enrage.damageScale);
  const intervalScale = finiteScale(enrage.intervalScale);
  const expectedSpeed = speed * speedScale;
  const expectedDamage = damage * damageScale;
  const expectedInterval = Math.max(0.35, attackInterval * intervalScale);
  assert.equal(enemy.enraged, true, `boss at enrage threshold ${threshold} did not set enemy.enraged`);
  assert.equal(enemy.speed, expectedSpeed, `speed at enrage threshold ${threshold}: expected ${speed} * ${speedScale}`);
  assert.equal(enemy.damage, expectedDamage, `damage at enrage threshold ${threshold}: expected ${damage} * ${damageScale}`);
  assert.equal(
    enemy.attackInterval,
    expectedInterval,
    `attackInterval at enrage threshold ${threshold}: expected max(0.35, ${attackInterval} * ${intervalScale})`,
  );
  assert.ok(speedScale > 1 || damageScale > 1, `enrage threshold ${threshold} did not increase speed or damage`);
  if (speedScale > 1) assert.ok(enemy.speed > speed, `speed did not increase at enrage threshold ${threshold}`);
  if (damageScale > 1) assert.ok(enemy.damage > damage, `damage did not increase at enrage threshold ${threshold}`);
  assert.equal(
    state.events.filter(event => event?.type === 'boss_enrage' && event.id === enemy.id).length,
    1,
    `boss_enrage count at enrage threshold ${threshold}`,
  );

  updateWaves(state, STEP);
  assert.equal(enemy.enraged, true, `enemy.enraged cleared after enrage threshold ${threshold}`);
  assert.equal(enemy.speed, expectedSpeed, `speed scaled again after enrage threshold ${threshold}`);
  assert.equal(enemy.damage, expectedDamage, `damage scaled again after enrage threshold ${threshold}`);
  assert.equal(enemy.attackInterval, expectedInterval, `attackInterval scaled again after enrage threshold ${threshold}`);
  assert.equal(
    state.events.filter(event => event?.type === 'boss_enrage' && event.id === enemy.id).length,
    1,
    `boss_enrage repeated after enrage threshold ${threshold}`,
  );
});
