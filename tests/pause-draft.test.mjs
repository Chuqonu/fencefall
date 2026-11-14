// Draft pause does not advance the clock. While phase is draft, simulate()
// must not increase state.time. The step that opens the draft may spend one
// fixed step while still playing; the rest of that call, and later calls,
// leave the clock where it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {updateDrafts} from '../src/systems/drafts.js';

function fresh(runId) {
  return createRun({seed: 614, difficulty: 'normal', runId});
}

function openDraft(state) {
  assert.equal(state.phase, 'playing');
  state.xp = state.nextDraftXp;
  const opened = updateDrafts(state);
  assert.equal(opened.ok, true);
  assert.equal(state.phase, 'draft');
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, false);
  assert.ok(state.draft && Array.isArray(state.draft.options));
  assert.equal(state.draft.options.length, 3);
  return state;
}

test('simulate does not increase time while phase is draft', () => {
  const state = fresh('pause-draft-held');
  simulate(state, 2);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > 1, `expected play to reach the clock, time=${state.time}`);
  openDraft(state);

  const time = state.time;
  const tick = state.tick;
  for (const seconds of [STEP, 0.5, 1, 8, 45]) {
    for (const speed of [1, 1.5, 3]) {
      state.speed = speed;
      state.paused = false;
      state.hiddenPaused = false;
      simulate(state, seconds);
      assert.equal(state.phase, 'draft');
      assert.equal(state.time, time, `time moved at ${speed}x for ${seconds}s`);
      assert.equal(state.tick, tick, `tick moved at ${speed}x for ${seconds}s`);
    }
  }
});

test('a simulate call that opens a draft does not keep advancing time', () => {
  const state = fresh('pause-draft-open');
  simulate(state, 1.5);
  assert.equal(state.phase, 'playing');
  const before = state.time;
  const tick = state.tick;
  state.xp = state.nextDraftXp;
  state.paused = false;
  state.hiddenPaused = false;
  state.speed = 3;
  simulate(state, 20);
  assert.equal(state.phase, 'draft');
  assert.ok(
    state.time <= before + STEP + 1e-9,
    `draft simulate ran the clock from ${before} to ${state.time}`
  );
  assert.ok(state.tick <= tick + 1, `tick moved from ${tick} to ${state.tick}`);
  assert.ok(state.time + 1e-9 >= before, `time went backwards from ${before} to ${state.time}`);

  const frozen = state.time;
  const frozenTick = state.tick;
  simulate(state, 20);
  simulate(state, 1 / 60);
  assert.equal(state.phase, 'draft');
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, false);
  assert.equal(state.time, frozen);
  assert.equal(state.tick, frozenTick);
});
