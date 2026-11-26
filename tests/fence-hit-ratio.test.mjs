// A fence bite reports remaining health. fence_hit.ratio is fence hp / max hp
// after the bite, from 0 to 1. At or below 30% of max, ratio is <= 0.3.
// Above 30%, ratio is > 0.3. The enemy is planted on the fence. Catalog
// damage is left alone, and the hero stays on slot 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {ARENA, DIFFICULTIES, STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';

const KINDS = Object.keys(ENEMIES).filter(kind => !ENEMIES[kind].attackRange);
const LOW = 0.3;

function fresh(runId) {
  return createRun({seed: 830, difficulty: 'normal', runId});
}

function catalogDamage(state, kind) {
  return ENEMIES[kind].damage * DIFFICULTIES[state.difficulty].damage;
}

function plant(state, kind) {
  const enemy = spawnEnemy(state, kind, {
    x: 180,
    y: ARENA.fenceY,
    hp: 1e7,
    maxHp: 1e7,
    driftAmp: 0,
    driftVelocity: 0,
  });
  enemy.driftAmp = 0;
  enemy.driftVelocity = 0;
  return enemy;
}

function assertHero(state, heroId, label) {
  const hero = state.slots[2].unit;
  assert.ok(hero, label);
  assert.equal(hero.kind, 'hero', label);
  assert.equal(hero.type, 'hero', label);
  assert.equal(hero.id, heroId, label);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'hero').length, 1, label);
}

function biteOnce(state) {
  state.events = [];
  updateCombat(state, STEP);
  const hits = state.events.filter(event => event && event.type === 'fence_hit');
  assert.equal(hits.length, 1);
  return hits[0];
}

function assertRatio(event, state, label) {
  const ratio = event.ratio;
  const expected = state.fence.hp / state.fence.maxHp;
  assert.equal(typeof ratio, 'number', label);
  assert.equal(Number.isFinite(ratio), true, label);
  assert.ok(ratio >= 0 && ratio <= 1, `${label} ratio ${ratio} is outside 0..1`);
  assert.ok(Math.abs(ratio - expected) <= 1e-12, `${label} ratio ${ratio} vs hp/max ${expected}`);
  return ratio;
}

for (const kind of KINDS) {
  test(`a ${kind} bite above 30% fence health reports ratio > 0.3`, () => {
    const state = fresh(`fence-ratio-high-${kind}`);
    const heroId = state.slots[2].unit.id;
    assertHero(state, heroId, kind);
    const enemy = plant(state, kind);
    const stopY = ARENA.fenceY - enemy.radius;
    assert.ok(Math.abs(enemy.y - stopY) <= 1e-6, `${kind} is not on the fence at ${enemy.y}`);

    const damage = catalogDamage(state, kind);
    const maxHp = state.fence.maxHp;
    const startHp = state.fence.hp;
    assert.equal(enemy.damage, damage, kind);
    assert.ok(damage > 0 && damage < startHp, kind);
    assert.ok((startHp - damage) / maxHp > LOW, kind);

    const event = biteOnce(state);
    assert.equal(state.fence.hp, startHp - damage, kind);
    assert.equal(state.fence.maxHp, maxHp, kind);
    assert.equal(state.stats.fenceDamage, damage, kind);
    assert.equal(event.damage, damage, kind);
    assert.equal(enemy.damage, damage, kind);
    assert.equal(enemy.attackInterval, ENEMIES[kind].attackInterval, kind);
    const ratio = assertRatio(event, state, kind);
    assert.ok(ratio > LOW, `${kind} ratio ${ratio}`);
    assertHero(state, heroId, kind);
    assert.equal(state.phase, 'playing', kind);
  });

  test(`a ${kind} bite at 30% fence health reports ratio <= 0.3`, () => {
    const state = fresh(`fence-ratio-line-${kind}`);
    const heroId = state.slots[2].unit.id;
    assertHero(state, heroId, kind);
    const enemy = plant(state, kind);
    const stopY = ARENA.fenceY - enemy.radius;
    assert.ok(Math.abs(enemy.y - stopY) <= 1e-6, `${kind} is not on the fence at ${enemy.y}`);

    const damage = catalogDamage(state, kind);
    const maxHp = state.fence.maxHp;
    const line = maxHp * LOW;
    const startHp = line + damage;
    assert.equal(enemy.damage, damage, kind);
    assert.ok(startHp <= maxHp, `${kind} start ${startHp} exceeds max ${maxHp}`);
    assert.equal(line / maxHp <= LOW, true, kind);
    state.fence.hp = startHp;

    const event = biteOnce(state);
    assert.equal(state.fence.hp, line, kind);
    assert.equal(state.fence.maxHp, maxHp, kind);
    assert.equal(state.stats.fenceDamage, damage, kind);
    assert.equal(event.damage, damage, kind);
    assert.equal(enemy.damage, damage, kind);
    const ratio = assertRatio(event, state, kind);
    assert.ok(ratio <= LOW, `${kind} ratio ${ratio}`);
    assert.ok(state.fence.hp / maxHp <= LOW, kind);
    assertHero(state, heroId, kind);
  });

  test(`a ${kind} bite below 30% fence health reports ratio <= 0.3`, () => {
    const state = fresh(`fence-ratio-low-${kind}`);
    const heroId = state.slots[2].unit.id;
    assertHero(state, heroId, kind);
    const enemy = plant(state, kind);

    const damage = catalogDamage(state, kind);
    const maxHp = state.fence.maxHp;
    const startHp = maxHp * LOW;
    assert.equal(enemy.damage, damage, kind);
    assert.ok(damage < startHp, kind);
    state.fence.hp = startHp;

    const event = biteOnce(state);
    const expectedHp = startHp - damage;
    assert.equal(state.fence.hp, expectedHp, kind);
    assert.equal(state.fence.maxHp, maxHp, kind);
    assert.ok(expectedHp / maxHp < LOW, kind);
    assert.equal(state.stats.fenceDamage, damage, kind);
    assert.equal(event.damage, damage, kind);
    assert.equal(enemy.damage, damage, kind);
    const ratio = assertRatio(event, state, kind);
    assert.ok(ratio <= LOW, `${kind} ratio ${ratio}`);
    assert.ok(ratio < LOW, `${kind} ratio ${ratio} is not under 30%`);
    assertHero(state, heroId, kind);
  });
}

test('a bite that empties the fence reports ratio 0', () => {
  const kind = 'shambler';
  const state = fresh('fence-ratio-empty');
  const heroId = state.slots[2].unit.id;
  assertHero(state, heroId, kind);
  const enemy = plant(state, kind);
  const damage = catalogDamage(state, kind);
  const maxHp = state.fence.maxHp;
  assert.equal(enemy.damage, damage);
  assert.ok(damage > 1 && damage < maxHp);
  state.surge.charges = 0;
  state.fence.hp = 1;

  const event = biteOnce(state);
  assert.equal(state.fence.hp, 0);
  assert.equal(state.fence.maxHp, maxHp);
  assert.equal(state.stats.fenceDamage, 1);
  assert.equal(event.damage, 1);
  assert.equal(enemy.damage, damage);
  const ratio = assertRatio(event, state, kind);
  assert.equal(ratio, 0);
  assertHero(state, heroId, kind);
});
