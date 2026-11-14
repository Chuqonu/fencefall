import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {PROFILE_KEY, RUN_KEY, exportSave, importSave, loadProfile, loadRun} from '../src/storage.js';

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

function savedVictory() {
  const profile = createProfile();
  profile.currency = 10;
  const state = createRun({
    seed: 12,
    difficulty: 'normal',
    profile,
    runId: 'victory-import-lock'
  });
  state.phase = 'victory';
  state.time = 180;
  state.kills = 24;
  state.wave = 10;
  state.settlement = {
    runId: state.runId,
    currency: 12,
    difficulty: state.difficulty,
    result: 'victory',
    time: state.time,
    kills: state.kills,
    wave: state.wave
  };
  return {profile, state};
}

function assertImportedVictory(store, imported) {
  assert.equal(imported.ok, true, imported.reason);
  const profile = loadProfile(store);
  const run = loadRun(store);
  assert.ok(profile);
  assert.ok(run);
  assert.equal(profile.currency, 10);
  assert.equal(imported.profile.currency, 10);
  assert.equal(run.phase, 'victory');
  assert.equal(run.settlement.result, 'victory');
  assert.equal(run.settlement.currency, 12);
  assert.equal(imported.run.settlement.result, 'victory');
  assert.equal(imported.run.settlement.currency, 12);
  assert.equal(run.settlement.runId, 'victory-import-lock');
  return {profile, run};
}

test('importing a saved victory keeps the settlement and leaves profile currency unchanged', () => {
  const {profile, state} = savedVictory();
  assert.equal(profile.currency, 10);
  assert.equal(state.phase, 'victory');
  assert.equal(state.settlement.currency, 12);
  assert.equal(state.settlement.result, 'victory');

  const text = exportSave(profile, state);
  const store = memoryStorage();
  assert.equal(store.getItem(PROFILE_KEY), null);
  assert.equal(store.getItem(RUN_KEY), null);

  const first = assertImportedVictory(store, importSave(text, store));
  const second = assertImportedVictory(store, importSave(text, store));
  assert.equal(second.profile.currency, first.profile.currency);
  assert.equal(second.profile.currency, 10);
  assert.equal(second.run.settlement.currency, 12);
  assert.equal(second.run.settlement.result, 'victory');
});
