import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA, STEP} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';

test('the hero shoots the enemy closer to the fence when both are in range', () => {
  const state = createRun({seed: 3, difficulty: 'normal', runId: 'foremost'});
  const slot = state.slots[2];
  const hero = slot.unit;
  hero.cooldown = 0;
  const near = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 80,
    hp: 1e6,
    maxHp: 1e6,
    speed: 0,
    damage: 0,
    armor: 0,
    driftAmp: 0,
  });
  const fence = spawnEnemy(state, 'runner', {
    x: slot.x + 140,
    y: ARENA.fenceY - 12,
    hp: 1e6,
    maxHp: 1e6,
    speed: 0,
    damage: 0,
    armor: 0,
    driftAmp: 0,
  });
  assert.ok(fence.y > near.y);
  assert.ok(Math.hypot(slot.x - near.x, slot.y - near.y) < Math.hypot(slot.x - fence.x, slot.y - fence.y));
  updateCombat(state, STEP);
  const shot = state.events.find(event => event.type === 'shot' && event.sourceId === hero.id);
  assert.equal(shot?.targetId, fence.id);
});
