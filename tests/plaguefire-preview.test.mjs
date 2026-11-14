import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {TOWERS} from '../src/data/towers.js';
import {getRecipe} from '../src/data/recipes.js';
import {previewMerge} from '../src/systems/merges.js';

function leadSentence(text) {
  const match = String(text).match(/^[^。.!?]*[。.!?]/);
  return match ? match[0] : '';
}

test('fire plus poison previews as Plaguefire while the poison tower stays Blight', () => {
  const state = createRun({seed: 27, difficulty: 'normal', runId: 'plaguefire-preview'});
  assert.equal(state.slots[2].unit?.type, 'hero');
  assert.equal(state.slots[2].unit?.kind, 'hero');
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.slots[1].unit, null);
  state.slots[0].unit = createUnit(state, 'fire', 1, 'tower');
  state.slots[1].unit = createUnit(state, 'poison', 1, 'tower');
  state.paused = true;
  assert.equal(state.paused, true);

  const preview = previewMerge(state, 0, 1);

  assert.equal(preview.ok, true);
  assert.equal(preview.result?.type, 'blight');
  assert.equal(preview.result?.kind, 'hybrid');
  assert.equal(preview.result?.rank, 1);
  assert.equal(leadSentence(preview.description?.en), 'Plaguefire at rank 1.');
  assert.equal(leadSentence(preview.description?.zh), '疫焚，1 阶。');
  assert.equal(TOWERS.poison.name.en, 'Blight');
  assert.equal(getRecipe('blight')?.id, 'blight');
  assert.equal(state.slots[0].unit?.type, 'fire');
  assert.equal(state.slots[1].unit?.type, 'poison');
});
