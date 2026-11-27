import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {chooseDraft, updateDrafts} from '../src/systems/drafts.js';
import {createController} from '../src/boot.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function assertSingleHero(state, hero, label) {
  const slots = [];
  for (const slot of state.slots) {
    const unit = slot.unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) slots.push(slot.index);
  }
  assert.equal(slots.length, 1, `${label} hero count`);
  assert.equal(state.slots[slots[0]].unit, hero, `${label} hero identity`);
  assert.equal(hero.kind, 'hero', `${label} kind`);
  assert.equal(hero.type, 'hero', `${label} type`);
  assert.equal(hero.rank, 1, `${label} rank`);
}

test('repeated 1-tap drafts and turret upgrades always preserve exactly one hero', () => {
  const state = createRun({seed: 15, difficulty: 'normal', runId: 'hero-single'});
  const hero = state.slots[2].unit;
  assertSingleHero(state, hero, 'start');

  for (let step = 0; step < 18; step += 1) {
    state.xp = state.nextDraftXp;
    const opened = updateDrafts(state);
    assert.equal(opened.ok, true, opened.reason);
    const towerIdx = state.draft.options.findIndex(c => c.kind === 'tower');
    const pick = towerIdx >= 0 ? towerIdx : 0;
    const chosen = chooseDraft(state, pick);
    assert.equal(chosen.ok, true, chosen.reason);
    assert.equal(state.phase, 'playing');
    assertSingleHero(state, hero, `draft ${step}`);
  }
});

test('controller start and restart keep exactly one hero', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 22, difficulty: 'normal', runId: 'hs-1'}).ok, true);
  assertSingleHero(api.getState(), api.getState().slots[2].unit, 'first start');
  assert.equal(api.act('restart').ok, true);
  assertSingleHero(api.getState(), api.getState().slots[2].unit, 'restart');
});
