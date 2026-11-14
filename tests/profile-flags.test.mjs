import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/boot.js';
import {createProfile} from '../src/state.js';
import {PROFILE_KEY, exportSave, importSave, loadProfile, saveProfile} from '../src/storage.js';

const CURRENCY = 240;

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

function flaggedProfile() {
  const profile = createProfile('zh');
  profile.currency = CURRENCY;
  profile.settings.reducedMotion = true;
  profile.settings.sound = false;
  profile.settings.difficulty = 'normal';
  return profile;
}

function assertFlags(profile, label) {
  assert.ok(profile, label);
  assert.equal(profile.settings.language, 'zh', label);
  assert.equal(profile.settings.reducedMotion, true, label);
  assert.equal(profile.currency, CURRENCY, label);
}

test('saving and loading keeps language zh and reduced motion together', async () => {
  const storage = memoryStorage();
  const profile = flaggedProfile();
  assert.equal(profile.settings.language, 'zh');
  assert.equal(profile.settings.reducedMotion, true);
  assert.equal(saveProfile(profile, storage).ok, true);

  const stored = JSON.parse(storage.getItem(PROFILE_KEY));
  assert.equal(stored.settings.language, 'zh');
  assert.equal(stored.settings.reducedMotion, true);
  assert.equal(stored.currency, CURRENCY);
  assertFlags(loadProfile(storage), 'loadProfile');

  const session = await createController({storage});
  assertFlags(session.getProfile(), 'controller reload');
  assert.equal(session.act('language', {value: 'en'}).ok, true);
  assert.equal(session.getProfile().settings.reducedMotion, true);
  assert.equal(session.act('language', {value: 'zh'}).ok, true);
  assert.equal(session.act('reducedMotion', {value: true}).ok, true);
  assertFlags(session.getProfile(), 'after language and motion actions');

  const again = await createController({storage});
  assertFlags(again.getProfile(), 'reload after language and motion actions');

  const text = exportSave(loadProfile(storage), null);
  const importedStorage = memoryStorage();
  const imported = importSave(text, importedStorage);
  assert.equal(imported.ok, true, imported.reason);
  assertFlags(imported.profile, 'import result');
  assertFlags(loadProfile(importedStorage), 'imported profile');

  const fromExport = await createController({storage: importedStorage});
  assertFlags(fromExport.getProfile(), 'controller after import');
});

test('a corrupt language does not turn reduced motion off or wipe currency', async () => {
  const storage = memoryStorage();
  const profile = flaggedProfile();
  assert.equal(saveProfile(profile, storage).ok, true);
  const saved = storage.getItem(PROFILE_KEY);
  const parsed = JSON.parse(saved);
  assert.equal(parsed.settings.language, 'zh');
  assert.equal(parsed.settings.reducedMotion, true);
  assert.equal(parsed.currency, CURRENCY);

  for (const language of ['nope', 'zh-CN', 'ZH', '', null]) {
    const attempt = flaggedProfile();
    attempt.currency = 0;
    attempt.settings.reducedMotion = false;
    attempt.settings.language = language;
    const result = saveProfile(attempt, storage);
    assert.equal(result.ok, false, String(language));
    assert.equal(result.reason, 'invalid_enum', String(language));
    assert.equal(storage.getItem(PROFILE_KEY), saved, String(language));
  }
  assertFlags(loadProfile(storage), 'after rejected saves');

  const packet = JSON.parse(exportSave(profile, null));
  packet.profile.settings.language = 'corrupt';
  packet.profile.settings.reducedMotion = false;
  packet.profile.currency = 0;
  const imported = importSave(JSON.stringify(packet), storage);
  assert.equal(imported.ok, false);
  assert.equal(imported.reason, 'invalid_enum');
  assert.equal(storage.getItem(PROFILE_KEY), saved);
  assertFlags(loadProfile(storage), 'after rejected import');

  const session = await createController({storage});
  assertFlags(session.getProfile(), 'session before a bad language');
  const rejected = session.act('language', {value: 'de'});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'bad-language');
  assertFlags(session.getProfile(), 'session after a bad language');
  assert.equal(storage.getItem(PROFILE_KEY), saved);

  const exported = session.act('exportSave');
  assert.equal(exported.ok, true);
  const corruptFile = JSON.parse(exported.text);
  corruptFile.profile.settings.language = 'nope';
  corruptFile.profile.settings.reducedMotion = false;
  corruptFile.profile.currency = 0;
  const rejectedImport = session.act('importSave', {text: JSON.stringify(corruptFile)});
  assert.equal(rejectedImport.ok, false);
  assert.equal(rejectedImport.reason, 'invalid_enum');
  assertFlags(session.getProfile(), 'session after a corrupt import');
  assert.equal(storage.getItem(PROFILE_KEY), saved);
  assertFlags(loadProfile(storage), 'stored profile after a corrupt import');

  const damaged = JSON.parse(saved);
  damaged.settings.language = 'corrupt';
  storage.setItem(PROFILE_KEY, JSON.stringify(damaged));
  const damagedBytes = storage.getItem(PROFILE_KEY);
  assert.equal(JSON.parse(damagedBytes).settings.reducedMotion, true);
  assert.equal(JSON.parse(damagedBytes).currency, CURRENCY);
  assert.equal(loadProfile(storage), null);
  assert.equal(storage.getItem(PROFILE_KEY), damagedBytes);

  const afterDamage = await createController({storage});
  assert.equal(afterDamage.act('language', {value: 'nope'}).reason, 'bad-language');
  assert.equal(storage.getItem(PROFILE_KEY), damagedBytes);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).settings.reducedMotion, true);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).currency, CURRENCY);
});
