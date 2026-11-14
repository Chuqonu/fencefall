import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/engine.js';
import {RECIPES} from '../src/data/recipes.js';
import {mergeUnits, previewMerge} from '../src/systems/merges.js';
import {MESSAGES, t} from '../src/i18n.js';

function snapshot(state) {
  return JSON.stringify({
    rng: state.rng,
    nextId: state.nextId,
    merges: state.stats.merges,
    slots: state.slots.map(slot => slot.unit && {id: slot.unit.id, type: slot.unit.type, rank: slot.unit.rank, kind: slot.unit.kind}),
  });
}

test('hybrid recipes are distinct and previewing a merge does not change the board', () => {
  assert.ok(RECIPES.length >= 8);
  assert.equal(new Set(RECIPES.map(recipe => recipe.id)).size, RECIPES.length);
  assert.ok(new Set(RECIPES.map(recipe => (recipe.stats.mechanics || []).join('+'))).size >= 8);
  const state = createRun({runId: 'merge', seed: 3});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  const before = snapshot(state);
  const hero = previewMerge(state, 2, 0);
  assert.equal(hero.ok, false);
  assert.equal(hero.reason, 'hero_protected');
  assert.equal(snapshot(state), before);
  state.slots[1].unit = createUnit(state, 'bolt', 2, 'tower');
  assert.equal(previewMerge(state, 0, 1).reason, 'rank_mismatch');
  assert.equal(state.slots[0].unit.rank, 1);
  state.slots[1].unit.rank = 1;
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.ok, true);
  assert.equal(preview.result.rank, 2);
  assert.equal(preview.result.id, 'preview');
  assert.equal(state.slots[0].unit.rank, 1);
  const applied = mergeUnits(state, 0, 1);
  assert.equal(applied.ok, true);
  assert.equal(state.slots[1].unit.rank, 2);
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.stats.merges, 1);
  assert.equal(mergeUnits(state, 0, 1).ok, false);
});

test('interface strings exist in Chinese and English', () => {
  assert.equal(t('zh', 'title'), '最后一道防线');
  assert.equal(t('en', 'play'), 'Play');
  assert.notEqual(t('en', 'missing-key'), undefined);
  assert.equal(t('en', 'missing-key'), 'missing-key');
  for (const key of Object.keys(MESSAGES.en)) assert.equal(typeof MESSAGES.zh[key], 'string');
  for (const key of Object.keys(MESSAGES.zh)) assert.equal(typeof MESSAGES.en[key], 'string');
});
