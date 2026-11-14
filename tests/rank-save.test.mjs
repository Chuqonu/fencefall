import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {mergeUnits} from '../src/systems/merges.js';
import {exportSave, importSave, loadRun} from '../src/storage.js';

const TYPE = 'bolt';
const SOURCE = 0;
const TARGET = 1;

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function heroSlots(state) {
  return state.slots.filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'));
}

test('a same-type merge to rank 2 survives export and import', () => {
  const profile = createProfile();
  const state = createRun({seed: 8, difficulty: 'normal', profile, runId: 'rank-save'});
  state.paused = true;
  const hero = heroSlots(state);
  assert.equal(hero.length, 1);
  const heroId = hero[0].unit.id;
  const heroIndex = state.slots.findIndex(slot => slot.unit && slot.unit.id === heroId);

  state.slots[SOURCE].unit = createUnit(state, TYPE, 1, 'tower');
  state.slots[TARGET].unit = createUnit(state, TYPE, 1, 'tower');

  const merged = mergeUnits(state, SOURCE, TARGET);
  assert.equal(merged.ok, true, merged.reason);
  assert.equal(state.slots[TARGET].unit.type, TYPE);
  assert.equal(state.slots[TARGET].unit.kind, 'tower');
  assert.equal(state.slots[TARGET].unit.rank, 2);
  assert.equal(state.slots[SOURCE].unit, null);

  const text = exportSave(profile, state);
  const storage = memoryStorage();
  const imported = importSave(text, storage);
  assert.equal(imported.ok, true, imported.reason);

  for (const saved of [imported.run, loadRun(storage)]) {
    assert.ok(saved);
    assert.equal(saved.slots[TARGET].unit.type, TYPE);
    assert.equal(saved.slots[TARGET].unit.kind, 'tower');
    assert.equal(saved.slots[TARGET].unit.rank, 2);
    assert.equal(saved.slots[SOURCE].unit, null);
    const savedHeroes = heroSlots(saved);
    assert.equal(savedHeroes.length, 1);
    assert.equal(savedHeroes[0].unit.id, heroId);
    assert.equal(savedHeroes[0].unit.type, 'hero');
    assert.equal(savedHeroes[0].unit.kind, 'hero');
    assert.equal(saved.slots[heroIndex].unit.id, heroId);
  }
});
