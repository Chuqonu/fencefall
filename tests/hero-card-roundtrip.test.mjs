import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {generateDraft} from '../src/systems/drafts.js';
import {exportSave, importSave} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test('a hero upgrade card keeps its bilingual description through a save', () => {
  const profile = createProfile();
  const state = createRun({seed: 4, difficulty: 'normal', profile, runId: 'desc-round'});
  for (const slot of state.slots) {
    if (slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')) continue;
    slot.unit = createUnit(state, 'bolt', 1, 'tower');
  }
  const cards = generateDraft(state);
  const hero = cards.find(card => card.kind === 'hero_upgrade');
  assert.ok(hero, 'a full board still offers a hero upgrade');
  assert.equal(typeof hero.description?.en, 'string');
  assert.equal(typeof hero.description?.zh, 'string');
  assert.ok(hero.description.en.length > 0);
  assert.ok(hero.description.zh.length > 0);
  state.phase = 'draft';
  state.paused = true;
  state.draft = {options: cards};
  const before = state.fence.hp;
  const imported = importSave(exportSave(profile, state), memoryStorage());
  assert.equal(imported.ok, true);
  const again = imported.run.draft.options.find(card => card.kind === 'hero_upgrade');
  assert.equal(again.description.en, hero.description.en);
  assert.equal(again.description.zh, hero.description.zh);
  assert.equal(imported.run.fence.hp, before);
});
