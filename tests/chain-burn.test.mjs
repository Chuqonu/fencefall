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

function heroes(state) {
  return state.slots.filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'));
}

test('a rank-1 wildfire burn reaches its chain jump and the primary, not an enemy outside chain range', () => {
  const state = createRun({
    seed: 21,
    runId: 'chain-burn',
    difficulty: 'normal',
    profile: createProfile()
  });
  const hero = state.slots[2].unit;
  state.slots[7].unit = hero;
  state.slots[2].unit = null;
  hero.cooldown = 600;
  assert.equal(heroes(state).length, 1);

  const slot = state.slots[2];
  const unit = createUnit(state, 'wildfire', 1, 'hybrid');
  assert.equal(unit.rank, 1);
  slot.unit = unit;
  const stats = getUnitStats(unit, state);
  assert.equal(stats.chain, 1);
  assert.ok(stats.chainRange > stats.splash, 'the jump can land beyond the splash');
  assert.ok(stats.burn && stats.burn.dps > 0 && stats.burn.duration > 0, 'wildfire burn payload');

  const reach = 150;
  assert.ok(reach < stats.range, 'the primary starts inside attack range');
  const primary = spawn(state, slot.x, slot.y - reach);
  const jumpGap = (stats.splash + stats.chainRange) / 2;
  const jump = spawn(state, slot.x, primary.y - jumpGap);
  const outside = spawn(state, slot.x, primary.y - (stats.chainRange + stats.splash + 8));

  assert.ok(gap(primary, jump) > stats.splash, 'the jump target starts outside the splash');
  assert.ok(gap(primary, jump) <= stats.chainRange, 'the jump target starts inside chain range');
  assert.ok(gap(primary, outside) > stats.chainRange, 'the third enemy starts outside chain range');
  assert.ok(gap(jump, outside) > stats.splash, 'the third enemy stays outside the jump splash');
  assert.ok(gap(slot, primary) < gap(slot, jump), 'the hybrid aims at the primary');
  assert.ok(gap(slot, primary) < gap(slot, outside));

  updateCombat(state, STEP);
  const shots = state.events.filter(event => event.type === 'shot');
  assert.equal(shots.length, 1);
  assert.equal(shots[0].sourceId, unit.id);
  assert.equal(shots[0].targetId, primary.id);
  assert.equal(state.projectiles.length, 1);
  const projectile = state.projectiles[0];
  assert.equal(projectile.sourceId, unit.id);
  assert.equal(projectile.targetId, primary.id);
  assert.equal(projectile.chain, stats.chain);
  assert.equal(projectile.chainRange, stats.chainRange);
  assert.equal(projectile.splash, stats.splash);
  assert.equal(projectile.effects.burn.dps, stats.burn.dps);
  assert.equal(projectile.effects.burn.duration, stats.burn.duration);

  for (const boardSlot of state.slots) {
    if (boardSlot.unit) boardSlot.unit.cooldown = 10;
  }
  for (let i = 0; i < 90 && state.projectiles.length > 0; i += 1) updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.events.filter(event => event.type === 'shot').length, 1);

  assert.ok(gap(primary, jump) > projectile.splash, 'the jump target stays outside the splash');
  assert.ok(gap(primary, jump) <= projectile.chainRange, 'the jump target stays inside chain range');
  assert.ok(gap(primary, outside) > projectile.chainRange, 'the third enemy stays outside chain range');
  assert.ok(gap(jump, outside) > projectile.splash, 'the third enemy stays clear of the jump splash');

  const chainHits = state.events.filter(event => event.type === 'hit' && event.attack === 'chain');
  assert.equal(chainHits.length, 1);
  assert.equal(chainHits[0].targetId, jump.id);
  assert.equal(chainHits[0].sourceId, unit.id);
  const primaryHits = state.events.filter(event => event.type === 'hit' && event.attack === 'projectile' && event.targetId === primary.id);
  assert.equal(primaryHits.length, 1);

  for (const enemy of [primary, jump]) {
    const applied = burns(enemy);
    assert.equal(applied.length, 1, enemy.id);
    assert.equal(applied[0].power, stats.burn.dps);
    assert.equal(applied[0].remaining, stats.burn.duration);
    assert.equal(applied[0].sourceId, unit.id);
  }

  assert.equal(burns(outside).length, 0);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.events.some(event => event.type === 'hit' && event.targetId === outside.id), false);
  assert.equal(heroes(state).length, 1);
  assert.equal(heroes(state)[0].unit.id, hero.id);
});
