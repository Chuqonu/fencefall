import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, step} from '../src/engine.js';
import {ENEMIES} from '../src/data/enemies.js';

const ENGLISH = 'Ash shamblers are crossing the field. Defeat these four to open the first draft.';
const CHINESE = '灰烬蹒者正在过场。击倒这四只就能拿到第一次整备。';

test('the opening hint says defeating four ash shamblers opens the first draft', () => {
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'first-draft-hint'});
  assert.equal(state.nextDraftXp, 8);
  assert.equal(ENEMIES.shambler.xp * 4, state.nextDraftXp);
  for (let i = 0; i < 400 && state.wave < 1; i += 1) step(state);
  assert.ok(state.wave >= 1);
  assert.equal(state.director.playerHint.en, ENGLISH);
  assert.equal(state.director.playerHint.zh, CHINESE);
});
