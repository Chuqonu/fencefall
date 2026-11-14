import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
import {getWaveInfo, WAVES} from '../src/systems/waves.js';

test('wave progress stays inside 0 to 1 and does not move backward', () => {
  const state = createRun({seed: 7, difficulty: 'normal', runId: 'wave-progress'});
  assert.equal(getWaveInfo(state).progress, 0);
  const opening = Number(WAVES[0]?.start);
  assert.ok(opening > 0);
  simulate(state, opening + 0.2);
  const first = getWaveInfo(state);
  assert.ok(first.wave >= 1);
  assert.ok(first.progress >= 0 && first.progress <= 1);
  const seen = first.progress;
  simulate(state, 0.5);
  const later = getWaveInfo(state);
  assert.ok(later.progress >= seen - 1e-9);
  assert.ok(later.progress <= 1);
  assert.ok(later.wave >= first.wave);
});
