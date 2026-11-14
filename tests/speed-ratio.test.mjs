// Same wall duration at 1x, 1.5x, and 3x consumes fixed steps in the ratio
// 2:3:6. Every consumed step lasts the shared STEP. Speed only changes how
// many of those steps run; it does not replace the step size.
import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createRun, setSpeed, step} from '../src/engine.js';
import {STEP} from '../src/shared.js';

const SPEEDS = [1, 1.5, 3];
const SEED = 1516;
const FRAMES = 120;

function fresh(speed) {
  const state = createRun({seed: SEED, runId: `speed-ratio-${speed}`, difficulty: 'normal'});
  setSpeed(state, speed);
  assert.equal(state.speed, speed);
  return state;
}

function play(speed, frames) {
  const state = fresh(speed);
  for (let index = 0; index < frames; index += 1) advance(state, STEP);
  return state;
}

function countsOf(runs) {
  return runs.map(state => state.tick).join(':');
}

test('the same duration consumes fixed steps at 1x, 1.5x, and 3x in the ratio 2:3:6', () => {
  assert.equal(STEP, 1 / 60);

  const runs = SPEEDS.map(speed => play(speed, FRAMES));
  const ticks = runs.map(state => state.tick);
  const [one, mid, triple] = ticks;
  const expected = [FRAMES * 2 / 2, FRAMES * 3 / 2, FRAMES * 6 / 2];

  assert.deepEqual(
    ticks,
    expected,
    `speeds 1, 1.5, 3 consumed ${countsOf(runs)} steps over ${FRAMES} frames; expected ${expected.join(':')} (2:3:6)`,
  );
  assert.equal(one * 3, mid * 2, `1x:1.5x was ${one}:${mid}`);
  assert.equal(one * 6, triple * 2, `1x:3x was ${one}:${triple}`);
  assert.equal(mid * 2, triple, `1.5x:3x was ${mid}:${triple}`);

  for (const state of runs) {
    assert.equal(state.phase, 'playing');
    assert.equal(state.accumulator, 0, `${state.speed}x left accumulator ${state.accumulator}`);
    const stepDuration = state.time / state.tick;
    assert.ok(
      Math.abs(state.time - state.tick * STEP) < 1e-9,
      `${state.speed}x used step ${stepDuration} over ${state.tick} steps (time ${state.time}); shared STEP is ${STEP}`,
    );
    assert.ok(
      Math.abs(stepDuration - STEP) < 1e-12,
      `${state.speed}x replaced STEP ${STEP} with ${stepDuration}`,
    );
  }

  const [slow, between, fast] = runs;
  assert.ok(Math.abs(between.time / slow.time - 1.5) < 1e-9, `1.5x sim time ${between.time} vs 1x ${slow.time}`);
  assert.ok(Math.abs(fast.time / slow.time - 3) < 1e-9, `3x sim time ${fast.time} vs 1x ${slow.time}`);
});

test('1.5x advances by the shared STEP, including a two-frame duration of exactly 2:3:6', () => {
  for (const speed of SPEEDS) {
    const state = fresh(speed);
    const before = state.time;
    step(state);
    assert.equal(state.tick, 1, `${speed}x tick ${state.tick}`);
    assert.ok(
      Math.abs(state.time - before - STEP) < 1e-12,
      `${speed}x step moved time by ${state.time - before}, not ${STEP}`,
    );
  }

  const slice = 12 * STEP;
  const once = SPEEDS.map(speed => {
    const state = fresh(speed);
    advance(state, slice);
    return state;
  });
  const onceTicks = once.map(state => state.tick);
  assert.deepEqual(
    onceTicks,
    [12, 18, 36],
    `one ${slice}s advance consumed ${onceTicks.join(':')}; expected 12:18:36`,
  );
  for (const state of once) {
    assert.equal(state.accumulator, 0, `${state.speed}x accumulator ${state.accumulator}`);
    assert.ok(
      Math.abs(state.time - state.tick * STEP) < 1e-9,
      `${state.speed}x step ${state.time / state.tick} is not ${STEP}`,
    );
  }

  const twoFrames = SPEEDS.map(speed => play(speed, 2).tick);
  assert.deepEqual(twoFrames, [2, 3, 6], `two frames consumed ${twoFrames.join(':')}; expected 2:3:6`);
});
