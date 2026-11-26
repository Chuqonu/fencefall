// Settlement pays from the simulation clock, kills, and wave.
// Speed only changes how many fixed steps fit in one wall second.
// Pause and an open draft hold that clock, so waiting cannot raise the purse.
import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createRun, setSpeed} from '../src/engine.js';
import {createProfile} from '../src/state.js';
import {settleRun} from '../src/systems/progression.js';
import {chooseDraft, placePending} from '../src/systems/drafts.js';
import {STEP} from '../src/shared.js';

const SEEDS = [71414, 16016];
const SIM_SECONDS = 48;
const TARGET_TICK = SIM_SECONDS * 60;
const PAUSE_AT = 10 * 60;
const PAUSE_SECONDS = 40;
const HIDDEN_SECONDS = 40;
const DRAFT_SECONDS = 30;

function hold(state, seconds) {
  const time = state.time;
  const tick = state.tick;
  const kills = state.kills;
  const wave = state.wave;
  const phase = state.phase;
  const xp = state.xp;
  const frames = Math.round(seconds / STEP);
  for (let index = 0; index < frames; index += 1) advance(state, STEP);
  assert.equal(state.time, time);
  assert.equal(state.tick, tick);
  assert.equal(state.kills, kills);
  assert.equal(state.wave, wave);
  assert.equal(state.phase, phase);
  assert.equal(state.xp, xp);
  return frames * STEP;
}

function resolveDecision(state, wait) {
  if (state.phase === 'draft') {
    assert.equal(state.draft.options.length, 3);
    if (wait) wait.draftSeconds += hold(state, DRAFT_SECONDS);
    assert.equal(state.draft.options.length, 3);
    const chosen = chooseDraft(state, 0);
    assert.equal(chosen.ok, true, chosen.reason);
    if (state.phase === 'placing' && wait) wait.draftSeconds += hold(state, DRAFT_SECONDS);
  }
  if (state.phase !== 'placing') return;
  let index = state.slots.findIndex(slot => slot && !slot.unit);
  let replace = false;
  if (index < 0) {
    index = state.slots.findIndex(slot => slot?.unit && slot.unit.kind !== 'hero' && slot.unit.type !== 'hero');
    replace = true;
  }
  assert.ok(index >= 0, 'no slot for the pending tower');
  const placed = placePending(state, index, {replace});
  assert.equal(placed.ok, true, placed.reason);
}

function play(seed, speed, waiting) {
  const profile = createProfile();
  const state = createRun({
    seed,
    difficulty: 'normal',
    profile,
    runId: `reward-speed-${seed}-${speed}-${waiting ? 'wait' : 'plain'}`,
  });
  setSpeed(state, speed);
  const wait = waiting ? {pauseSeconds: 0, draftSeconds: 0, pausedAt: -1} : null;
  let guard = 0;
  while (state.tick < TARGET_TICK && state.phase !== 'victory' && state.phase !== 'defeat') {
    assert.ok(guard++ < TARGET_TICK * 8, `stuck at tick ${state.tick} phase ${state.phase}`);
    if (state.phase === 'draft' || state.phase === 'placing') {
      resolveDecision(state, wait);
      continue;
    }
    if (wait && wait.pausedAt < 0 && state.tick >= PAUSE_AT && state.accumulator === 0) {
      wait.pausedAt = state.tick;
      state.paused = true;
      wait.pauseSeconds += hold(state, PAUSE_SECONDS);
      state.paused = false;
      state.hiddenPaused = true;
      wait.pauseSeconds += hold(state, HIDDEN_SECONDS);
      state.hiddenPaused = false;
    }
    const before = state.tick;
    const steps = Math.min(TARGET_TICK - state.tick, speed);
    advance(state, (STEP * steps) / speed);
    if (state.tick === before && state.phase === 'playing') {
      assert.fail(`clock stuck at tick ${state.tick} speed ${speed}`);
    }
  }
  const settlement = settleRun(profile, state);
  return {seed, speed, state, profile, settlement, wait};
}

function sameFight(left, right) {
  assert.equal(left.state.tick, right.state.tick, `tick seed ${left.seed}`);
  assert.equal(left.state.kills, right.state.kills, `kills seed ${left.seed}`);
  assert.equal(left.state.wave, right.state.wave, `wave seed ${left.seed}`);
  assert.equal(left.state.xp, right.state.xp, `xp seed ${left.seed}`);
  assert.equal(left.state.draftLevel, right.state.draftLevel, `drafts seed ${left.seed}`);
  assert.equal(left.state.fence.hp, right.state.fence.hp, `fence seed ${left.seed}`);
  assert.ok(Math.abs(left.state.time - right.state.time) < 1e-9, `time seed ${left.seed}`);
  assert.equal(left.settlement.result, right.settlement.result, `result seed ${left.seed}`);
  assert.equal(left.settlement.difficulty, right.settlement.difficulty, `difficulty seed ${left.seed}`);
  assert.equal(left.settlement.kills, right.settlement.kills, `settlement kills seed ${left.seed}`);
  assert.equal(left.settlement.wave, right.settlement.wave, `settlement wave seed ${left.seed}`);
  assert.ok(Math.abs(left.settlement.time - right.settlement.time) < 1e-9, `settlement time seed ${left.seed}`);
  assert.equal(left.settlement.currency, right.settlement.currency, `currency seed ${left.seed}`);
  assert.equal(left.profile.currency, left.settlement.currency, `profile seed ${left.seed}`);
  assert.equal(right.profile.currency, right.settlement.currency, `profile seed ${right.seed}`);
}

test('speed 1 and speed 3 pay the same currency after the same simulation time', () => {
  for (const seed of SEEDS) {
    const one = play(seed, 1, false);
    const triple = play(seed, 3, false);
    const ten = play(seed, 10, false);
    assert.equal(one.state.speed, 1);
    assert.equal(triple.state.speed, 3);
    assert.equal(ten.state.speed, 10);
    assert.equal(one.state.phase, 'playing');
    assert.equal(triple.state.phase, 'playing');
    assert.equal(one.state.tick, TARGET_TICK);
    assert.equal(one.state.draftLevel > 0, true, `seed ${seed} never opened a draft`);
    assert.ok(one.settlement.currency > 0, `seed ${seed} paid nothing`);
    assert.ok(Math.abs(one.settlement.time - one.state.time) < 1e-9);
    sameFight(one, triple);
    sameFight(one, ten);
  }
});

test('pause time and draft time leave the payout unchanged', () => {
  for (const seed of SEEDS) {
    const plain = play(seed, 1, false);
    const waited = [play(seed, 1, true), play(seed, 3, true), play(seed, 10, true)];
    for (const run of waited) {
      assert.equal(run.wait.pausedAt, PAUSE_AT, `seed ${seed} paused at tick ${run.wait.pausedAt}`);
      assert.ok(run.wait.pauseSeconds >= PAUSE_SECONDS + HIDDEN_SECONDS - 1e-6);
      assert.ok(run.wait.draftSeconds >= DRAFT_SECONDS - 1e-6, `seed ${seed} held no draft`);
      assert.equal(run.state.paused, false);
      assert.equal(run.state.hiddenPaused, false);
      sameFight(plain, run);
      assert.ok(
        run.settlement.currency <= plain.settlement.currency,
        `waiting raised the payout from ${plain.settlement.currency} to ${run.settlement.currency}`
      );

      const held = run.wait.pauseSeconds + run.wait.draftSeconds;
      const ghostProfile = createProfile();
      const ghost = createRun({
        seed,
        difficulty: 'normal',
        profile: ghostProfile,
        runId: `reward-speed-inflated-${seed}-${run.speed}`,
      });
      ghost.phase = run.state.phase;
      ghost.time = run.state.time + held;
      ghost.kills = run.state.kills;
      ghost.wave = run.state.wave;
      ghost.speed = run.speed;
      const inflated = settleRun(ghostProfile, ghost);
      assert.ok(
        inflated.currency > run.settlement.currency,
        `holding ${held}s would not change a ${run.settlement.currency} purse`
      );
    }
  }
});
