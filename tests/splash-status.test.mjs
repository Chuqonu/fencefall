import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP, createUnit} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';

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

function burns(enemy) {
  return (enemy.statuses || []).filter(status => status && status.type === 'burn');
}

function gap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test('a burning splash applies burn inside the radius and not outside it', () => {
  const state = createRun({
    seed: 13,
    runId: 'splash-status',
    difficulty: 'normal',
    profile: createProfile()
  });
  state.slots[7].unit.cooldown = 600;
  const slot = state.slots[2];
  const unit = createUnit(state, 'fire', 1, 'tower');
  slot.unit = unit;
  const stats = getUnitStats(unit, state);
  assert.ok(stats.splash > 0, 'fire splash radius');
  assert.ok(stats.burn && stats.burn.dps > 0 && stats.burn.duration > 0, 'fire burn payload');

  const primary = spawn(state, slot.x, slot.y - 150);
  const inside = spawn(state, slot.x + stats.splash * 0.5, primary.y);
  const outside = spawn(state, slot.x, primary.y - (stats.splash + 24));
  assert.ok(gap(primary, inside) <= stats.splash, 'second enemy starts inside the splash');
  assert.ok(gap(primary, outside) > stats.splash, 'third enemy starts outside the splash');
  assert.ok(gap(slot, primary) < gap(slot, inside), 'the tower aims at the primary');

  updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 1);
  const projectile = state.projectiles[0];
  assert.equal(projectile.targetId, primary.id);
  assert.equal(projectile.splash, stats.splash);
  assert.equal(projectile.effects.burn.dps, stats.burn.dps);
  assert.equal(projectile.effects.burn.duration, stats.burn.duration);
  for (const boardSlot of state.slots) {
    if (boardSlot.unit) boardSlot.unit.cooldown = 10;
  }
  for (let i = 0; i < 90 && state.projectiles.length > 0; i += 1) updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 0);

  assert.ok(gap(primary, inside) <= projectile.splash, 'second enemy stays inside the radius');
  assert.ok(gap(primary, outside) > projectile.splash, 'outside enemy stays beyond the radius');

  const applied = burns(inside);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].power, projectile.effects.burn.dps);
  assert.equal(applied[0].remaining, projectile.effects.burn.duration);
  assert.equal(applied[0].sourceId, unit.id);

  assert.equal(burns(outside).length, 0);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.events.some(event => event.type === 'hit' && event.targetId === outside.id), false);

  const splashHits = state.events.filter(event => event.type === 'hit' && event.attack === 'splash');
  assert.equal(splashHits.length, 1);
  assert.equal(splashHits[0].targetId, inside.id);
});
