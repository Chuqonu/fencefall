import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {chooseDraft} from '../src/systems/drafts.js';
import {exportSave, importSave, loadRun} from '../src/storage.js';

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

test('a 1-tap Gun Mod & Auto Skill upgrade to Lv.2 survives export and import', () => {
  const profile = createProfile();
  const state = createRun({seed: 8, difficulty: 'normal', profile, runId: 'rank-save'});
  state.paused = true;
  const hero = heroSlots(state);
  assert.equal(hero.length, 1);
  const heroId = hero[0].unit.id;
  const heroIndex = state.slots.findIndex(slot => slot.unit && slot.unit.id === heroId);

  state.slots[heroIndex].unit.upgrades.napalm = 1;
  state.phase = 'draft';
  state.draft = {
    options: [
      {id: 'hero_upgrade:napalm', kind: 'hero_upgrade', upgradeId: 'napalm', superweapon: true, cap: 4, nextLevel: 2},
      {id: 'hero_upgrade:volley', kind: 'hero_upgrade', upgradeId: 'volley', superweapon: false, cap: 3, nextLevel: 1},
      {id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike', superweapon: false, cap: 5, nextLevel: 1}
    ]
  };

  const upgraded = chooseDraft(state, 0);
  assert.equal(upgraded.ok, true, upgraded.reason);
  assert.equal(state.slots[heroIndex].unit.upgrades.napalm, 2);

  const text = exportSave(profile, state);
  const storage = memoryStorage();
  const imported = importSave(text, storage);
  assert.equal(imported.ok, true, imported.reason);

  for (const saved of [imported.run, loadRun(storage)]) {
    assert.ok(saved);
    const savedHeroes = heroSlots(saved);
    assert.equal(savedHeroes.length, 1);
    assert.equal(savedHeroes[0].unit.id, heroId);
    assert.equal(savedHeroes[0].unit.type, 'hero');
    assert.equal(savedHeroes[0].unit.kind, 'hero');
    assert.equal(saved.slots[heroIndex].unit.id, heroId);
    assert.equal(saved.slots[heroIndex].unit.upgrades.napalm, 2);
  }
});
