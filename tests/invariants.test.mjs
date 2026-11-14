import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createRun, setSpeed, simulate} from '../src/engine.js';

const FRAME = 1 / 60;

// Same seed and the same speed changes, with several seconds of simulate().
function play(seed) {
  const state = createRun({seed, runId: 'invariants', difficulty: 'normal'});
  setSpeed(state, 1);
  simulate(state, 2);
  setSpeed(state, 3);
  simulate(state, 2);
  setSpeed(state, 1.5);
  simulate(state, 2);
  return state;
}

function withoutSpeed(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.runId;
  delete copy.speed;
  return copy;
}

test('two runs with the same seed and the same actions match after several seconds of simulate()', () => {
  const first = play(22);
  const second = play(22);
  assert.equal(first.phase, 'playing');
  assert.equal(first.tick, 360);
  assert.ok(first.time > 5);
  assert.deepEqual(first, second);
  assert.notDeepEqual(withoutSpeed(first), withoutSpeed(play(23)));
});

test('pause does not advance the simulation clock', () => {
  const state = createRun({seed: 22, runId: 'pause', difficulty: 'normal'});
  simulate(state, 3);
  state.accumulator = FRAME * 0.5;
  const time = state.time;
  const tick = state.tick;
  const waveTime = state.waveTime;
  state.paused = true;
  simulate(state, 5);
  advance(state, 2);
  assert.equal(state.paused, true);
  assert.equal(state.time, time);
  assert.equal(state.tick, tick);
  assert.equal(state.waveTime, waveTime);
  assert.equal(state.accumulator, 0);
  state.paused = false;
  simulate(state, 1);
  assert.ok(state.time > time);
  assert.ok(state.tick > tick);
});

test('1x and 3x spend the same number of fixed steps for the same simulation time', () => {
  const simSeconds = 4;
  function run(speed) {
    const state = createRun({seed: 22, runId: `speed-${speed}`, difficulty: 'normal'});
    setSpeed(state, speed);
    const frames = Math.round(simSeconds / speed / FRAME);
    for (let index = 0; index < frames; index += 1) advance(state, FRAME);
    return state;
  }
  const one = run(1);
  const triple = run(3);
  assert.equal(one.speed, 1);
  assert.equal(triple.speed, 3);
  assert.equal(one.phase, 'playing');
  assert.equal(triple.phase, 'playing');
  assert.equal(one.tick, triple.tick);
  assert.equal(one.tick, simSeconds * 60);
  assert.ok(Math.abs(one.time - triple.time) < 1e-9);
  assert.ok(Math.abs(one.time - simSeconds) < 1e-6);
  assert.deepEqual(withoutSpeed(one), withoutSpeed(triple));
});
