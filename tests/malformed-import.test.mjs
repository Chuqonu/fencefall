import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {PROFILE_KEY, RUN_KEY, importSave, saveProfile, saveRun} from '../src/storage.js';

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

test('malformed JSON import fails and leaves the stored profile and run bytes unchanged', () => {
  const storage = memoryStorage();
  const profile = createProfile('zh');
  profile.currency = 47;
  const state = createRun({seed: 16, difficulty: 'hard', profile, runId: 'bad-import-kept'});
  state.slots[0].unit = createUnit(state, 'frost', 2, 'tower');
  state.kills = 9;
  state.time = 33.5;

  assert.equal(saveProfile(profile, storage).ok, true);
  assert.equal(saveRun(state, storage).ok, true);

  const profileBytes = storage.getItem(PROFILE_KEY);
  const runBytes = storage.getItem(RUN_KEY);
  assert.equal(typeof profileBytes, 'string');
  assert.equal(typeof runBytes, 'string');
  assert.ok(profileBytes.length > 2);
  assert.ok(runBytes.length > 2);
  assert.equal(JSON.parse(profileBytes).currency, 47);
  assert.equal(JSON.parse(profileBytes).settings.language, 'zh');
  assert.equal(JSON.parse(runBytes).runId, 'bad-import-kept');
  assert.equal(JSON.parse(runBytes).slots[0].unit.type, 'frost');
  assert.equal(JSON.parse(runBytes).slots[0].unit.rank, 2);

  const malformed = [
    '{',
    'not-json',
    '{"format":"fencefall-save"',
    '{broken',
    '[,]',
    '"unterminated'
  ];

  for (const text of malformed) {
    assert.throws(() => JSON.parse(text));
    const result = importSave(text, storage);
    assert.equal(result.ok, false, text);
    assert.equal(result.reason, 'invalid_json', text);
    assert.equal(storage.getItem(PROFILE_KEY), profileBytes, text);
    assert.equal(storage.getItem(RUN_KEY), runBytes, text);
  }
});
