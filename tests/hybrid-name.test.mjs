import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {RECIPES} from '../src/data/recipes.js';
import {TOWERS} from '../src/data/towers.js';
import {previewMerge} from '../src/systems/merges.js';

test('the fire-poison hybrid is Plaguefire and the poison tower stays Blight', () => {
  const hybrid = RECIPES.find(recipe => recipe.id === 'blight');
  assert.ok(hybrid);
  assert.deepEqual(hybrid.parents, ['fire', 'poison']);
  assert.equal(hybrid.name.en, 'Plaguefire');
  assert.equal(hybrid.name.zh, '疫焚');
  assert.match(hybrid.description.en, /poison tower Blight/);
  assert.equal(TOWERS.poison.name.en, 'Blight');
  assert.equal(TOWERS.poison.name.zh, '瘴毒');
  assert.match(TOWERS.fire.description.en, /becomes Plaguefire/);
  assert.match(TOWERS.poison.description.en, /becomes Plaguefire/);
  assert.equal(RECIPES.filter(recipe => recipe.name.en === 'Plaguefire').length, 1);

  const state = createRun({seed: 4, difficulty: 'normal', runId: 'hybrid-name'});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'fire', 1, 'tower');
  state.slots[1].unit = createUnit(state, 'poison', 1, 'tower');
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.ok, true);
  assert.equal(preview.result.type, 'blight');
  assert.match(preview.description.en, /^Plaguefire at rank 1\./);
  assert.match(preview.description.zh, /^疫焚，1 阶。/);
});
