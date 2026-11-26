// The status chip already says a boss is approaching. Do not also emit a
// boss_enter flash: that cue is drawn near the top of the field.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {WAVES, updateWaves, bossApproaching} from '../src/systems/waves.js';

const first = WAVES.find(wave => wave.boss === true);

function parked(time) {
  const state = createRun({seed: 9, difficulty: 'normal', runId: 'boss-cue'});
  state.time = time;
  state.director.nextWave = WAVES.indexOf(first);
  return state;
}

test('the boss window uses the status chip and does not emit a field-top enter flash', () => {
  assert.ok(first);
  const early = parked(first.start - 13);
  updateWaves(early, STEP);
  assert.equal(bossApproaching(early), false);
  assert.equal(early.events.filter(event => event.type === 'boss_enter').length, 0);
  assert.equal(early.events.filter(event => event.type === 'boss_approach').length, 0);

  const state = parked(first.start - 8);
  updateWaves(state, STEP);
  updateWaves(state, STEP);
  assert.equal(bossApproaching(state), true);
  assert.equal(state.events.filter(event => event.type === 'boss_enter').length, 0);
  const approach = state.events.filter(event => event.type === 'boss_approach');
  assert.equal(approach.length, 1);
  assert.equal(approach[0].warning, true);

  state.time = first.start;
  updateWaves(state, STEP);
  assert.ok(state.enemies.some(e=>e.kind==='boss'));
  assert.equal(bossApproaching(state), false);
  assert.equal(state.events.filter(event => event.type === 'boss_enter').length, 0);
  assert.equal(state.events.filter(event => event.type === 'boss_approach').length, 1);
});
