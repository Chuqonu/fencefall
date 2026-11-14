import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {settleRun} from '../src/systems/progression.js';

// Inside the fresh-abandon gate: time < 30 and kills < 3.
// Wave progress would be worth currency if that gate did not zero the purse.
const EARLY = [
  {time: 29, kills: 2, wave: 6},
  {time: 15, kills: 1, wave: 3},
  {time: 0.5, kills: 0, wave: 1},
];

function earlyAbandon(profile, runId, progress) {
  const state = createRun({
    seed: 1717,
    difficulty: 'normal',
    profile,
    runId,
  });
  state.phase = 'playing';
  state.time = progress.time;
  state.kills = progress.kills;
  state.wave = progress.wave;
  return state;
}

test('an abandon before 30 seconds and 3 kills pays 0, and a second settle does not add currency', () => {
  for (const [index, progress] of EARLY.entries()) {
    const label = JSON.stringify(progress);
    const profile = createProfile();
    profile.currency = 12;
    const state = earlyAbandon(profile, `early-abandon-${index}`, progress);
    const wallet = profile.currency;

    const first = settleRun(profile, state);
    assert.equal(first.result, 'abandon', label);
    assert.equal(first.runId, state.runId, label);
    assert.equal(first.currency, 0, label);
    assert.equal(profile.currency, wallet, label);

    const second = settleRun(profile, state);
    assert.equal(second.result, 'abandon', label);
    assert.equal(second.currency, 0, label);
    assert.equal(profile.currency, wallet, label);
    assert.ok(profile.currency <= wallet, label);
  }
});
