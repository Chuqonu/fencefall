// Stun freezes the approach. While a stun still has time left, updateMovement
// must not reduce the enemy's distance to the fence. updateStatuses spends that
// time, and once the stun is gone the same enemy can close again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {ARENA, STEP} from '../src/shared.js';
import {spawnEnemy, updateMovement} from '../src/systems/movement.js';
import {applyStatus, getSpeedFactor, isStunned, updateStatuses} from '../src/systems/status.js';

const SPEED = 80;

function fresh(runId) {
  return createRun({seed: 514, difficulty: 'normal', runId});
}

function distanceToFence(enemy) {
  return ARENA.fenceY - enemy.y;
}

function place(state, y) {
  const enemy = spawnEnemy(state, 'runner', {
    x: 180,
    y,
    speed: SPEED,
    hp: 500,
    maxHp: 500,
    driftAmp: 0,
    driftFreq: 0,
    driftPhase: 0,
    driftVelocity: 0,
  });
  enemy.speed = SPEED;
  enemy.driftAmp = 0;
  enemy.driftVelocity = 0;
  enemy.dead = false;
  return enemy;
}

function stun(enemy, remaining) {
  return applyStatus(enemy, {type: 'stun', power: 1, remaining, sourceId: 'stun-freeze'});
}

test('a stunned enemy does not reduce its distance to the fence during a movement update', () => {
  const state = fresh('stun-freeze-step');
  const held = place(state, 120);
  const open = place(state, 120);
  const near = place(state, 120);
  const stopY = ARENA.fenceY - near.radius;
  near.y = stopY - 0.5;
  near.attacking = false;

  const heldStun = stun(held, 2);
  const nearStun = stun(near, 2);
  const slow = applyStatus(held, {type: 'slow', power: 0.65, remaining: 5, sourceId: 'stun-freeze'});
  assert.equal(heldStun.ok, true);
  assert.equal(nearStun.ok, true);
  assert.equal(slow.ok, true);
  assert.equal(isStunned(held), true);
  assert.equal(isStunned(near), true);
  assert.equal(isStunned(open), false);
  assert.equal(getSpeedFactor(held), 0);
  assert.equal(getSpeedFactor(near), 0);

  const heldGap = distanceToFence(held);
  const nearGap = distanceToFence(near);
  const openGap = distanceToFence(open);
  const heldAt = {x: held.x, y: held.y};
  const nearAt = {x: near.x, y: near.y};
  const heldSpeed = held.speed;
  assert.ok(heldGap > SPEED, `held enemy starts too close (${heldGap})`);
  assert.ok(near.y < stopY, 'near enemy is already on the fence');
  assert.ok(open.speed > 0 && held.speed > 0);

  updateMovement(state, 0.5);
  for (let i = 0; i < 30; i += 1) updateMovement(state, STEP);

  assert.ok(
    distanceToFence(held) >= heldGap - 1e-9,
    `stunned gap fell from ${heldGap} to ${distanceToFence(held)}`,
  );
  assert.equal(held.x, heldAt.x);
  assert.equal(held.y, heldAt.y);
  assert.equal(held.speed, heldSpeed);
  assert.equal(held.attacking, false);
  assert.equal(isStunned(held), true);

  assert.ok(
    distanceToFence(near) >= nearGap - 1e-9,
    `stunned enemy short of the fence closed from ${nearGap} to ${distanceToFence(near)}`,
  );
  assert.equal(near.x, nearAt.x);
  assert.equal(near.y, nearAt.y);
  assert.ok(near.y < stopY, `stunned enemy was planted on the fence at ${near.y}`);
  assert.equal(near.attacking, false);

  const openClosed = openGap - distanceToFence(open);
  assert.ok(openClosed > 20, `unstunned gap only changed by ${openClosed}`);
});

test('a stun expires and the enemy can reduce its distance to the fence again', () => {
  const state = fresh('stun-freeze-expire');
  const enemy = place(state, 160);
  const duration = 0.35;
  const applied = stun(enemy, duration);
  assert.equal(applied.ok, true);
  const status = enemy.statuses.find(item => item && item.type === 'stun');
  assert.ok(status, 'stun was not applied');
  assert.equal(Number.isFinite(status.remaining), true);
  assert.ok(status.remaining > STEP, `stun remaining ${status.remaining} is shorter than one step`);
  assert.ok(status.remaining <= duration + 1e-9, `stun remaining ${status.remaining} exceeds ${duration}`);

  const y0 = enemy.y;
  const gap0 = distanceToFence(enemy);
  const speed = enemy.speed;
  updateMovement(state, duration + 0.5);
  assert.equal(enemy.y, y0);
  assert.ok(distanceToFence(enemy) >= gap0 - 1e-9, 'movement spent the stun by closing on the fence');
  assert.equal(isStunned(enemy), true);
  assert.equal(enemy.speed, speed);

  updateStatuses(state, STEP);
  assert.equal(isStunned(enemy), true, 'stun expired on the first status tick');
  assert.ok(status.remaining > 0 && status.remaining < duration, `remaining after one tick is ${status.remaining}`);
  updateMovement(state, STEP);
  assert.equal(enemy.y, y0, 'enemy advanced while the stun was still running');

  const maxFrames = Math.ceil(duration / STEP) + 3;
  let frames = 1;
  for (; frames < maxFrames && isStunned(enemy); frames += 1) updateStatuses(state, STEP);
  assert.equal(isStunned(enemy), false, `stun still active after ${frames} status ticks`);
  assert.equal(
    enemy.statuses.some(item => item && item.type === 'stun' && item.remaining > 0),
    false,
  );
  assert.equal(getSpeedFactor(enemy), 1);
  assert.equal(enemy.y, y0);
  assert.equal(enemy.speed, speed);

  const gap = distanceToFence(enemy);
  updateMovement(state, STEP);
  assert.ok(enemy.y > y0, 'enemy did not advance after the stun expired');
  assert.ok(
    distanceToFence(enemy) < gap,
    `distance stayed ${gap} after the stun expired`,
  );
});
