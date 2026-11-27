import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/boot.js';
import {step} from '../src/engine.js';

function memoryStorage() {
  const values = new Map();
  return {getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,String(value)), removeItem:key => values.delete(key)};
}

test('a saved battle is visible to the menu after reload and resumes paused with its chosen gun upgrade', async () => {
  const storage = memoryStorage();
  const first = await createController({storage});
  assert.equal(first.act('start',{seed:12,runId:'menu-resume-regression'}).ok,true);
  const state = first.getState();
  for(let i=0;i<3600 && state.phase==='playing';i++) step(state);
  assert.equal(state.phase,'draft');
  const choice = state.draft.options.findIndex(option=>option.kind==='hero_upgrade');
  assert.ok(choice>=0);
  const upgradeId = state.draft.options[choice].upgradeId;
  assert.equal(first.act('chooseDraft',{index:choice}).ok,true);
  assert.equal(state.slots[2].unit.upgrades[upgradeId], 1, '1-tap chooseDraft upgraded the center gunner');
  first.act('pause');
  const reloaded = await createController({storage});
  assert.equal(reloaded.getUI().screen,'menu');
  assert.ok(reloaded.getState(),'the menu must see the saved run so Continue is enabled');
  assert.equal(reloaded.getState().slots[2].unit.upgrades[upgradeId], 1);
  assert.equal(reloaded.getState().time,state.time);
  assert.equal(reloaded.getState().paused,true);
  assert.equal(reloaded.act('resume').ok,true);
  assert.equal(reloaded.getUI().screen,'battle');
  assert.equal(reloaded.getState().runId,state.runId);
  assert.equal(reloaded.getState().paused,true);
});
