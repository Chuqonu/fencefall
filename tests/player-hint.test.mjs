// After a campaign wave starts, state.director.playerHint is {en, zh} with
// non-empty strings. A fresh run may leave the field off until that wave.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
import {WAVES} from '../src/systems/waves.js';

const FRAME = 1 / 60;

function fresh(runId) {
  return createRun({seed: 402, difficulty: 'normal', runId});
}

function campaignStarted(state) {
  const wave = Number(state?.wave);
  const next = Number(state?.director?.nextWave);
  return (Number.isFinite(wave) && wave >= 1) || (Number.isFinite(next) && next >= 1);
}

function assertPlayerHint(hint, label) {
  assert.ok(
    hint != null && typeof hint === 'object' && !Array.isArray(hint),
    `${label}: state.director.playerHint must be an object`
  );
  assert.equal(typeof hint.en, 'string', `${label}: playerHint.en`);
  assert.equal(typeof hint.zh, 'string', `${label}: playerHint.zh`);
  assert.ok(hint.en.trim().length > 0, `${label}: playerHint.en is empty`);
  assert.ok(hint.zh.trim().length > 0, `${label}: playerHint.zh is empty`);
}

test('a fresh run before the first wave may omit director.playerHint', () => {
  const state = fresh('player-hint-fresh');
  assert.equal(state.phase, 'playing');
  assert.equal(state.endless, false);
  assert.equal(campaignStarted(state), false);
  if (state.director.playerHint !== undefined) assertPlayerHint(state.director.playerHint, 'fresh');

  const opening = Number(WAVES[0]?.start);
  assert.ok(Number.isFinite(opening) && opening > FRAME, 'campaign has a first wave after the opening frame');
  while (!campaignStarted(state) && state.phase === 'playing' && state.time + FRAME < opening) {
    simulate(state, FRAME);
    assert.equal(campaignStarted(state), false);
    if (state.director.playerHint !== undefined) assertPlayerHint(state.director.playerHint, `t=${state.time}`);
  }
  assert.equal(campaignStarted(state), false);
  assert.ok(state.time < opening);
});

test('director.playerHint has non-empty en and zh after a campaign wave starts', () => {
  const state = fresh('player-hint-wave');
  const opening = Number(WAVES[0]?.start);
  assert.ok(Number.isFinite(opening), 'campaign schedule has a first wave');
  const limit = opening + 2;
  while (!campaignStarted(state) && state.phase === 'playing' && state.time < limit) {
    simulate(state, 0.25);
  }
  assert.equal(state.phase, 'playing', `phase ${state.phase} at t=${state.time}`);
  assert.equal(state.endless, false);
  assert.equal(campaignStarted(state), true, `wave ${state.wave} next ${state.director?.nextWave} at t=${state.time}`);
  assert.ok(state.wave >= 1, `wave ${state.wave}`);
  assert.ok(state.director.nextWave >= 1, `nextWave ${state.director.nextWave}`);
  assertPlayerHint(state.director.playerHint, `wave ${state.wave}`);

  const holdUntil = state.time + 2;
  while (state.phase === 'playing' && state.time < holdUntil) {
    simulate(state, 0.25);
    assert.equal(campaignStarted(state), true);
    assertPlayerHint(state.director.playerHint, `wave ${state.wave} t=${state.time.toFixed(2)}`);
  }
});

test('the current wave hint and the next wave hint stay different', () => {
  const state = fresh('hint-split');
  state.nextDraftXp = 1e12;
  let checked = 0;
  for (let i = 0; i < 8000 && state.phase === 'playing' && state.time < 40; i += 1) {
    simulate(state, FRAME);
    const current = state.director?.playerHint;
    const upcoming = state.director?.nextHint;
    if (!current?.en || !upcoming?.en) continue;
    assert.notEqual(current.en.trim(), upcoming.en.trim());
    assert.notEqual(current.zh.trim(), upcoming.zh.trim());
    checked += 1;
  }
  assert.ok(checked > 10, `compared ${checked} current/next pairs`);
});
