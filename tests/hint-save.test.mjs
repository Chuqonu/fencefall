import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun, step} from '../src/engine.js';
import {exportSave, importSave} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function assertBilingualHint(hint, label) {
  assert.ok(hint && typeof hint === 'object' && !Array.isArray(hint), label);
  assert.equal(typeof hint.en, 'string', `${label} en`);
  assert.equal(typeof hint.zh, 'string', `${label} zh`);
  assert.ok(hint.en.length > 0, `${label} en`);
  assert.ok(hint.zh.length > 0, `${label} zh`);
}

test('saving a run after the director hint appears does not break the next step', () => {
  const profile = createProfile();
  const state = createRun({seed: 7, difficulty: 'normal', profile, runId: 'hint-save'});
  for (let i = 0; i < 10000 && !state.director?.playerHint; i += 1) step(state);
  assertBilingualHint(state.director.playerHint, 'hint before save');
  const fenceHp = state.fence.hp;

  const text = exportSave(profile, state);
  const imported = importSave(text, memoryStorage());
  assert.equal(imported.ok, true, imported.reason);
  assert.ok(imported.run.fence.hp <= fenceHp, `import fence HP ${imported.run.fence.hp} above ${fenceHp}`);
  assertBilingualHint(imported.run.director.playerHint, 'imported hint');

  // importSave returns a paused snapshot. Resume so this step is a real update.
  imported.run.paused = false;
  step(imported.run);

  assert.ok(imported.run.fence.hp <= fenceHp, `next step fence HP ${imported.run.fence.hp} above ${fenceHp}`);
  assertBilingualHint(imported.run.director.playerHint, 'hint after the next step');
});
