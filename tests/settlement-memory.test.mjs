import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {settleRun} from '../src/systems/progression.js';

// Normal victory at these stats pays a positive amount (74 in the current rules).
// The assertions use that first payout so a second grant is visible without
// pinning the reward formula.
const STATS = {time: 250, kills: 40, wave: 10};

function victory(profile, runId, seed) {
  const state = createRun({seed, difficulty: 'normal', profile, runId});
  state.phase = 'victory';
  state.time = STATS.time;
  state.kills = STATS.kills;
  state.wave = STATS.wave;
  return state;
}

test('one victory pays once when settled twice', () => {
  const profile = createProfile();
  const state = victory(profile, 'victory-once', 12);
  const first = settleRun(profile, state);

  assert.equal(first.result, 'victory');
  assert.equal(first.runId, state.runId);
  assert.ok(first.currency > 0);
  assert.equal(profile.currency, first.currency);
  assert.equal(profile.best.normal.victories, 1);
  assert.deepEqual(profile.settledRuns, [state.runId]);

  const second = settleRun(profile, state);
  assert.equal(second, first);
  assert.equal(second.currency, first.currency);
  assert.equal(profile.currency, first.currency);
  assert.equal(profile.best.normal.victories, 1);
  assert.deepEqual(profile.settledRuns, [state.runId]);
});

test('the first run does not pay again after more than 64 distinct settlements', () => {
  const profile = createProfile();
  const firstId = 'paid-0';
  const opening = settleRun(profile, victory(profile, firstId, 100));
  assert.equal(opening.result, 'victory');
  assert.ok(opening.currency > 0);
  const payout = opening.currency;

  // 64 further ids make 65 distinct settlements, past the 64-result ledger window.
  const extra = 64;
  for (let index = 1; index <= extra; index += 1) {
    const paid = settleRun(profile, victory(profile, `paid-${index}`, 100 + index));
    assert.equal(paid.result, 'victory');
    assert.equal(paid.currency, payout);
  }

  const distinct = extra + 1;
  assert.ok(distinct > 64);
  assert.equal(profile.settledRuns.length, distinct);
  assert.equal(new Set(profile.settledRuns).size, distinct);
  assert.equal(profile.settledRuns[0], firstId);
  assert.equal(profile.currency, payout * distinct);
  assert.equal(profile.best.normal.victories, distinct);

  // A new run state has no settlement yet, so only paid-id memory can refuse the second grant.
  const replay = victory(profile, firstId, 900);
  assert.equal(replay.settlement, null);
  const before = profile.currency;
  const again = settleRun(profile, replay);

  assert.equal(profile.currency, before);
  assert.equal(profile.currency, payout * distinct);
  assert.equal(profile.best.normal.victories, distinct);
  assert.equal(profile.settledRuns.filter(id => id === firstId).length, 1);
  assert.equal(again.runId, firstId);
});
