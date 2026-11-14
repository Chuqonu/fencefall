import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP, createUnit} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';

function heroes(state) {
  return state.slots
    .filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'))
    .map(slot => slot.unit);
}

function spawn(state, x, y) {
  return spawnEnemy(state, 'shambler', {
    x,
    y,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0
  });
}

function ofType(enemy, type) {
  return (enemy.statuses || []).filter(status => status && status.type === type);
}

function gap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function assertPair(enemy, projectile, sourceId) {
  const burn = ofType(enemy, 'burn');
  const slow = ofType(enemy, 'slow');
  assert.equal(burn.length, 1);
  assert.equal(slow.length, 1);
  assert.equal(enemy.statuses.length, 2);
  assert.equal(burn[0].power, projectile.effects.burn.dps);
  assert.equal(burn[0].remaining, projectile.effects.burn.duration);
  assert.equal(burn[0].sourceId, sourceId);
  assert.equal(slow[0].power, projectile.effects.slow.factor);
  assert.equal(slow[0].remaining, projectile.effects.slow.duration);
  assert.equal(slow[0].sourceId, sourceId);
}

test('a rank-1 scald splash burns and slows the primary and an enemy inside the radius, and neither outside it', () => {
  const state = createRun({
    seed: 13,
    runId: 'scald-pair',
    difficulty: 'normal',
    profile: createProfile()
  });
  const hero = state.slots[2].unit;
  const heroId = hero.id;
  state.slots[7].unit = hero;
  state.slots[2].unit = null;
  hero.cooldown = 600;
  assert.equal(heroes(state).length, 1);
  assert.equal(heroes(state)[0], hero);

  const slot = state.slots[2];
  const unit = createUnit(state, 'scald', 1, 'hybrid');
  slot.unit = unit;
  assert.equal(unit.type, 'scald');
  assert.equal(unit.kind, 'hybrid');
  assert.equal(unit.rank, 1);
  const stats = getUnitStats(unit, state);
  const splash = stats.splash;
  assert.ok(splash > 0, 'scald splash radius');
  assert.ok(stats.burn && stats.burn.dps > 0 && stats.burn.duration > 0, 'scald burn payload');
  assert.ok(stats.slow && stats.slow.factor > 0 && stats.slow.factor < 1 && stats.slow.duration > 0, 'scald slow payload');

  const primary = spawn(state, slot.x, slot.y - 150);
  const inside = spawn(state, slot.x + splash * 0.5, primary.y);
  const outside = spawn(state, slot.x, primary.y - (splash + 24));
  assert.ok(gap(primary, inside) <= splash, 'second enemy starts inside the splash');
  assert.ok(gap(primary, outside) > splash, 'third enemy starts outside the splash');
  assert.ok(gap(slot, primary) < gap(slot, inside), 'the tower aims at the primary');
  assert.ok(gap(slot, primary) < gap(slot, outside), 'the tower aims at the primary');

  updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 1);
  const projectile = state.projectiles[0];
  assert.equal(projectile.sourceId, unit.id);
  assert.equal(projectile.targetId, primary.id);
  assert.equal(projectile.splash, splash);
  assert.equal(projectile.effects.burn.dps, stats.burn.dps);
  assert.equal(projectile.effects.burn.duration, stats.burn.duration);
  assert.equal(projectile.effects.slow.factor, stats.slow.factor);
  assert.equal(projectile.effects.slow.duration, stats.slow.duration);
  assert.equal(getUnitStats(unit, state).splash, splash);
  for (const boardSlot of state.slots) {
    if (boardSlot.unit) boardSlot.unit.cooldown = 10;
  }
  for (let i = 0; i < 90 && state.projectiles.length > 0; i += 1) updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 0);

  assert.equal(heroes(state).length, 1);
  assert.equal(heroes(state)[0].id, heroId);
  assert.ok(hero.cooldown > 0, 'hero cooldown stays parked');
  const shots = state.events.filter(event => event.type === 'shot');
  assert.equal(shots.length, 1);
  assert.equal(shots[0].sourceId, unit.id);

  assert.ok(gap(primary, inside) <= projectile.splash, 'second enemy stays inside the radius');
  assert.ok(gap(primary, outside) > projectile.splash, 'outside enemy stays beyond the radius');
  assert.equal(projectile.splash, splash);

  assertPair(primary, projectile, unit.id);
  assertPair(inside, projectile, unit.id);
  assert.equal(ofType(outside, 'burn').length, 0);
  assert.equal(ofType(outside, 'slow').length, 0);
  assert.equal((outside.statuses || []).length, 0);
});
