import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/boot.js';
import {createProfile} from '../src/state.js';
import {PROFILE_KEY, exportSave, importSave, loadProfile, saveProfile} from '../src/storage.js';

const CURRENCY = 128;

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

function savedZhProfile() {
  const profile = createProfile('zh');
  profile.currency = CURRENCY;
  profile.settings.sound = true;
  profile.settings.difficulty = 'hard';
  return profile;
}

function assertZhWallet(profile, label) {
  assert.ok(profile, label);
  assert.equal(profile.settings.language, 'zh', label);
  assert.equal(profile.currency, CURRENCY, label);
  assert.equal(profile.settings.sound, true, label);
  assert.equal(profile.settings.difficulty, 'hard', label);
}

test('a profile saved with language zh loads as zh', async () => {
  const storage = memoryStorage();
  const profile = savedZhProfile();
  assert.equal(profile.settings.language, 'zh');
  assert.equal(saveProfile(profile, storage).ok, true);

  assertZhWallet(loadProfile(storage), 'loadProfile');

  const reloaded = await createController({storage});
  assertZhWallet(reloaded.getProfile(), 'controller reload');

  const text = exportSave(loadProfile(storage), null);
  const importedStorage = memoryStorage();
  const imported = importSave(text, importedStorage);
  assert.equal(imported.ok, true, imported.reason);
  assert.equal(imported.profile.settings.language, 'zh');
  assert.equal(imported.profile.currency, CURRENCY);
  assertZhWallet(loadProfile(importedStorage), 'imported profile');

  const fromExport = await createController({storage: importedStorage});
  assertZhWallet(fromExport.getProfile(), 'controller after import');
});

test('a corrupt language does not wipe currency', async () => {
  const storage = memoryStorage();
  const profile = savedZhProfile();
  assert.equal(saveProfile(profile, storage).ok, true);
  const saved = storage.getItem(PROFILE_KEY);
  assert.equal(JSON.parse(saved).settings.language, 'zh');
  assert.equal(JSON.parse(saved).currency, CURRENCY);

  for (const language of ['nope', 'zh-CN', 'ZH', '', null]) {
    const attempt = savedZhProfile();
    attempt.currency = 0;
    attempt.settings.language = language;
    const result = saveProfile(attempt, storage);
    assert.equal(result.ok, false, String(language));
    assert.equal(result.reason, 'invalid_enum', String(language));
    assert.equal(storage.getItem(PROFILE_KEY), saved, String(language));
  }
  assertZhWallet(loadProfile(storage), 'after rejected saves');

  const packet = JSON.parse(exportSave(profile, null));
  packet.profile.settings.language = 'corrupt';
  packet.profile.currency = 0;
  const imported = importSave(JSON.stringify(packet), storage);
  assert.equal(imported.ok, false);
  assert.equal(imported.reason, 'invalid_enum');
  assert.equal(storage.getItem(PROFILE_KEY), saved);
  assertZhWallet(loadProfile(storage), 'after rejected import');

  const session = await createController({storage});
  assertZhWallet(session.getProfile(), 'session before a bad language');
  const rejected = session.act('language', {value: 'de'});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'bad-language');
  assertZhWallet(session.getProfile(), 'session after a bad language');
  assert.equal(storage.getItem(PROFILE_KEY), saved);

  const exported = session.act('exportSave');
  assert.equal(exported.ok, true);
  const corruptFile = JSON.parse(exported.text);
  corruptFile.profile.settings.language = 'nope';
  corruptFile.profile.currency = 0;
  const rejectedImport = session.act('importSave', {text: JSON.stringify(corruptFile)});
  assert.equal(rejectedImport.ok, false);
  assert.equal(rejectedImport.reason, 'invalid_enum');
  assertZhWallet(session.getProfile(), 'session after a corrupt import');
  assert.equal(storage.getItem(PROFILE_KEY), saved);
  assertZhWallet(loadProfile(storage), 'stored profile after a corrupt import');

  const damaged = JSON.parse(saved);
  damaged.settings.language = 'corrupt';
  storage.setItem(PROFILE_KEY, JSON.stringify(damaged));
  const damagedBytes = storage.getItem(PROFILE_KEY);
  assert.equal(JSON.parse(damagedBytes).currency, CURRENCY);
  assert.equal(loadProfile(storage), null);
  assert.equal(storage.getItem(PROFILE_KEY), damagedBytes);

  const afterDamage = await createController({storage});
  assert.equal(afterDamage.act('language', {value: 'nope'}).reason, 'bad-language');
  assert.equal(storage.getItem(PROFILE_KEY), damagedBytes);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).currency, CURRENCY);
});
