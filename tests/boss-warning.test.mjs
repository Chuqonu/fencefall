// The existing status chip says a boss is approaching before that boss enters.
// It does not change the schedule, boss health, or add a second HUD row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {WAVES, bossApproaching} from '../src/systems/waves.js';

const first = WAVES.find(wave => wave.boss === true);
const index = WAVES.indexOf(first);

function parked(time, extra = {}) {
  const state = createRun({seed: 9, difficulty: 'normal', runId: 'boss-warning'});
  state.time = time;
  state.director.nextWave = index;
  state.director.queue = extra.queue || [];
  state.enemies = extra.enemies || [];
  if (extra.paused) state.paused = true;
  if (extra.phase) state.phase = extra.phase;
  return state;
}

test('a boss within 12 seconds lights the warning, and an earlier moment does not', () => {
  assert.ok(first);
  assert.equal(bossApproaching(parked(first.start - 13)), false);
  assert.equal(bossApproaching(parked(first.start - 8)), true);
  assert.equal(bossApproaching(parked(first.start - 0.2)), true);
});

test('a queued boss warns until it is on the field, and pause keeps the pause chip free', () => {
  const queued = parked(first.start + 1, {queue: [{time: first.start + 4, kind: 'boss'}]});
  assert.equal(bossApproaching(queued), true);
  queued.enemies = [{kind: 'boss', hp: 3000, maxHp: 3000, dead: false}];
  assert.equal(bossApproaching(queued), false);
  const paused = parked(first.start - 4, {paused: true, queue: [{time: first.start + 1, kind: 'boss'}]});
  assert.equal(bossApproaching(paused), false);
  assert.equal(bossApproaching(parked(first.start - 4, {phase: 'draft'})), false);
});
