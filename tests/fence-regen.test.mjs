// Fence HP restores at FENCE_REGEN_PER_SECOND for each second of simulation
// time. The fixed STEP is the only clock, so 1×, 1.5×, 3×, and 10× match
// per simulation second. Pause, a hidden page, draft, victory, and defeat
// do not heal. A full fence stays at max.
import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createRun, prepare, setSpeed, simulate, step} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {FENCE_REGEN_PER_SECOND} from '../src/systems/combat.js';

const SPEEDS = [1, 1.5, 3, 10];

function fresh(runId) {
  const state = createRun({seed: 41, difficulty: 'normal', runId});
  prepare(state);
  state.slots[2].unit.cooldown = 1e9;
  return state;
}

function injure(runId, missing) {
  const state = fresh(runId);
  assert.ok(missing > 0 && missing < state.fence.maxHp);
  state.fence.hp = state.fence.maxHp - missing;
  assert.ok(state.fence.hp > 0);
  assert.ok(state.fence.hp < state.fence.maxHp);
  return state;
}

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, expected ${expected} ± ${tol}`);
}

test('an injured fence heals over simulation time and never passes max', () => {
  assert.equal(FENCE_REGEN_PER_SECOND, 2);
  const state = injure('fence-regen-play', 40);
  const damaged = state.fence.hp;
  const max = state.fence.maxHp;
  simulate(state, 3);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > 2);
  assert.ok(state.fence.hp > damaged);
  assert.ok(state.fence.hp <= max);
  near(state.fence.hp, damaged + FENCE_REGEN_PER_SECOND * state.time, 1e-4, 'three simulation seconds');
  assert.equal(state.fence.maxHp, max);
});

test('pause, hidden pause, draft, victory, and defeat do not heal', () => {
  const paused = injure('fence-regen-pause', 25);
  const pausedHp = paused.fence.hp;
  const pausedTime = paused.time;
  paused.paused = true;
  simulate(paused, 4);
  advance(paused, 1);
  assert.equal(paused.fence.hp, pausedHp);
  assert.equal(paused.time, pausedTime);
  paused.paused = false;
  simulate(paused, 1);
  assert.ok(paused.fence.hp > pausedHp);
  assert.ok(paused.fence.hp <= paused.fence.maxHp);

  const hidden = injure('fence-regen-hidden', 25);
  const hiddenHp = hidden.fence.hp;
  hidden.hiddenPaused = true;
  simulate(hidden, 4);
  advance(hidden, 1);
  assert.equal(hidden.fence.hp, hiddenHp);
  assert.equal(hidden.phase, 'playing');

  for (const phase of ['draft', 'victory', 'defeat']) {
    const state = injure(`fence-regen-${phase}`, 30);
    const hp = state.fence.hp;
    state.phase = phase;
    simulate(state, 5);
    advance(state, 2);
    step(state);
    assert.equal(state.phase, phase);
    assert.equal(state.fence.hp, hp);
  }

  const broken = fresh('fence-regen-broken');
  broken.fence.hp = 0;
  step(broken);
  assert.equal(broken.phase, 'defeat');
  assert.equal(broken.fence.hp, 0);
  simulate(broken, 5);
  assert.equal(broken.fence.hp, 0);
});

test('a full fence stays at max', () => {
  const state = fresh('fence-regen-full');
  const max = state.fence.hp;
  assert.equal(max, state.fence.maxHp);
  simulate(state, 3);
  assert.equal(state.phase, 'playing');
  assert.equal(state.fence.hp, max);
  assert.equal(state.fence.maxHp, max);

  const nearly = injure('fence-regen-cap', 0.5);
  const cap = nearly.fence.maxHp;
  simulate(nearly, 1);
  assert.equal(nearly.fence.hp, cap);
  simulate(nearly, 2);
  assert.equal(nearly.fence.hp, cap);
});

test('1x, 1.5x, 3x, and 10x heal the same HP per simulation second', () => {
  const wall = 0.2;
  const gained = [];
  for (const speed of SPEEDS) {
    const state = injure(`fence-regen-speed-${speed}`, 80);
    setSpeed(state, speed);
    assert.equal(state.speed, speed);
    const damaged = state.fence.hp;
    advance(state, wall);
    assert.equal(state.phase, 'playing');
    assert.ok(state.time > 0, `${speed}x did not advance`);
    assert.ok(state.fence.hp > damaged, `${speed}x did not heal`);
    assert.ok(state.fence.hp <= state.fence.maxHp, `${speed}x passed max`);
    const rate = (state.fence.hp - damaged) / state.time;
    near(rate, FENCE_REGEN_PER_SECOND, 1e-4, `${speed}x per simulation second`);
    gained.push(state.fence.hp - damaged);
    assert.ok(Math.abs(state.time - wall * speed) < STEP, `${speed}x sim time ${state.time}`);
  }
  near(gained[1] / gained[0], 1.5, 1e-3, '1.5x versus 1x over the same wall time');
  near(gained[2] / gained[0], 3, 1e-3, '3x versus 1x over the same wall time');
  near(gained[3] / gained[0], 10, 1e-3, '10x versus 1x over the same wall time');
});
