// Slow scales the speed already stored on the enemy, once.
// A 0.5 slow moves half of that speed in one second and leaves enemy.speed alone.
// Stun at the same spot does not move. The hero stays on slot 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {spawnEnemy, updateMovement} from '../src/systems/movement.js';
import {applyStatus} from '../src/systems/status.js';

const SPEED = 80;
const SLOW_FACTOR = 0.5;
const STEP_SECONDS = 1;
const X = 180;
const Y = 40;

function heroSlots(state) {
  const slots = [];
  for (let index = 0; index < state.slots.length; index += 1) {
    const unit = state.slots[index].unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) slots.push(index);
  }
  return slots;
}

function placeShambler(state) {
  const enemy = spawnEnemy(state, 'shambler', {
    x: X,
    y: Y,
    armor: 0,
    driftAmp: 0,
    driftFreq: 0,
    driftPhase: 0,
  });
  enemy.speed = SPEED;
  enemy.armor = 0;
  assert.equal(enemy.kind, 'shambler');
  assert.equal(enemy.armor, 0);
  assert.equal(enemy.speed, SPEED);
  assert.equal(enemy.x, X);
  assert.equal(enemy.y, Y);
  assert.equal(enemy.dead, false);
  return enemy;
}

test('a slowed shambler moves at half speed once, and stun does not move or rewrite speed', () => {
  const state = createRun({seed: 614, difficulty: 'normal', runId: 'slow-speed-lock'});
  assert.equal(state.phase, 'playing');
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, false);
  const hero = state.slots[2].unit;
  assert.equal(hero.kind, 'hero');
  assert.deepEqual(heroSlots(state), [2]);

  const slowed = placeShambler(state);
  const stunned = placeShambler(state);
  assert.equal(slowed.x, stunned.x);
  assert.equal(slowed.y, stunned.y);

  const slow = applyStatus(slowed, {
    type: 'slow',
    power: SLOW_FACTOR,
    remaining: 4,
    sourceId: hero.id,
  });
  const stun = applyStatus(stunned, {
    type: 'stun',
    power: 1,
    remaining: 2,
    sourceId: hero.id,
  });
  assert.equal(slow.ok, true, slow.reason);
  assert.equal(stun.ok, true, stun.reason);
  assert.equal(slowed.speed, SPEED);
  assert.equal(stunned.speed, SPEED);

  const startY = slowed.y;
  updateMovement(state, STEP_SECONDS);

  assert.equal(slowed.y - startY, SPEED * SLOW_FACTOR);
  assert.equal(slowed.y, startY + SPEED / 2);
  assert.equal(slowed.speed, SPEED);
  assert.equal(stunned.y, startY);
  assert.equal(stunned.x, X);
  assert.equal(stunned.speed, SPEED);
  assert.equal(state.slots[2].unit, hero);
  assert.equal(state.slots[2].unit.kind, 'hero');
  assert.deepEqual(heroSlots(state), [2]);
});
