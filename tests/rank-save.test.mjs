import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {chooseDraft} from '../src/systems/drafts.js';
import {exportSave, importSave, loadRun} from '../src/storage.js';

const TYPE = 'bolt';
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

test('a 1-tap turret upgrade to rank 2 survives export and import', () => {
  const profile = createProfile();
  const state = createRun({seed: 8, difficulty: 'normal', profile, runId: 'rank-save'});
  state.paused = true;
  const hero = heroSlots(state);
  assert.equal(hero.length, 1);
  const heroId = hero[0].unit.id;
  const heroIndex = state.slots.findIndex(slot => slot.unit && slot.unit.id === heroId);

  state.slots[TARGET].unit = createUnit(state, TYPE, 1, 'tower');
  state.phase = 'draft';
  state.draft = {
    options: [
      {id: `tower:${TYPE}`, kind: 'tower', type: TYPE, action: 'upgrade', rank: 1, nextRank: 2, cap: 4},
      {id: 'tower:fire', kind: 'tower', type: 'fire', action: 'deploy', rank: 0, nextRank: 1, cap: 4},
      {id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike', superweapon: false, cap: 5, nextLevel: 1}
    ]
  };

  const upgraded = chooseDraft(state, 0);
  assert.equal(upgraded.ok, true, upgraded.reason);
  assert.equal(state.slots[TARGET].unit.type, TYPE);
  assert.equal(state.slots[TARGET].unit.kind, 'tower');
  assert.equal(state.slots[TARGET].unit.rank, 2);

  const text = exportSave(profile, state);
  const storage = memoryStorage();
  const imported = importSave(text, storage);
  assert.equal(imported.ok, true, imported.reason);

  for (const saved of [imported.run, loadRun(storage)]) {
    assert.ok(saved);
    assert.equal(saved.slots[TARGET].unit.type, TYPE);
    assert.equal(saved.slots[TARGET].unit.kind, 'tower');
    assert.equal(saved.slots[TARGET].unit.rank, 2);
    const savedHeroes = heroSlots(saved);
    assert.equal(savedHeroes.length, 1);
    assert.equal(savedHeroes[0].unit.id, heroId);
    assert.equal(savedHeroes[0].unit.type, 'hero');
    assert.equal(savedHeroes[0].unit.kind, 'hero');
    assert.equal(saved.slots[heroIndex].unit.id, heroId);
  }
});
