import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, createProfile} from '../src/state.js';
import {exportSave, importSave} from '../src/storage.js';
import {CONTRACT_VERSION} from '../src/shared.js';

function memory() {
  const map = new Map();
  return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)};
}

test('v3 rerollsLeft, surge, cloud tick, and targeting survive round-trip; zero tick is rejected', () => {
  const profile = createProfile();
  const run = createRun({profile});
  run.rerollsLeft = 3;
  run.surge.thresholdsUsed = [0.5];
  run.surge.charges = 0;
  run.surge.shieldTimer = 2;
  run.slots[2].unit.targeting = 'priority';
  run.clouds.push({id: 'c91', kind: 'miasma', sourceId: 'u1', x: 130, y: 360, radius: 62, remaining: 2.1, duration: 4, tick: 0.5, tickTimer: 0.24, dps: 6});
  const save = exportSave(profile, run);
  const restored = importSave(save, memory());
  assert.equal(restored.ok, true, restored.reason);
  assert.equal(restored.profile.version, CONTRACT_VERSION);
  assert.equal(restored.run.version, CONTRACT_VERSION);
  for (const k of ['rerollsLeft', 'clouds', 'surge', 'slots']) assert.deepEqual(restored.run[k], run[k]);
  assert.equal(restored.run.energy, undefined);
  assert.equal(restored.run.fieldSlots, undefined);
  const bad = JSON.parse(save);
  bad.run.clouds[0].tick = 0;
  assert.equal(importSave(JSON.stringify(bad), memory()).ok, false);
});

test('v1 and v2 profiles migrate cleanly to v3 while resetting legacy runs', () => {
  // v1 migration
  const p1 = createProfile('zh');
  p1.version = 1;
  delete p1.permanent.economy;
  p1.currency = 87;
  p1.equipmentOwned = ['hawk_brace'];
  p1.equipped.weapon = 'hawk_brace';
  p1.settledRuns = ['old-paid'];
  const restored1 = importSave(JSON.stringify({format: 'fencefall-save', version: 1, profile: p1, run: {version: 1}}), memory());
  assert.equal(restored1.ok, true, restored1.reason);
  assert.equal(restored1.notice, 'legacyRunReset');
  assert.equal(restored1.run, null);
  assert.equal(restored1.profile.version, CONTRACT_VERSION);
  assert.equal(restored1.profile.equipped.weapon, 'kinetic_core');
  assert.deepEqual(restored1.profile.equipmentOwned, ['kinetic_core']);
  assert.equal(restored1.profile.currency, 87);
  assert.equal(restored1.profile.settings.language, 'zh');
  assert.deepEqual(restored1.profile.settledRuns, ['old-paid']);
  assert.equal(restored1.profile.permanent.economy, 0);

  // v2 migration preserves gems and starterClaimed while resetting legacy v2 run
  const p2 = createProfile('zh');
  p2.version = 2;
  p2.currency = 145;
  p2.starterClaimed = true;
  p2.gemsOwned = ['gem_opening_drop', 'gem_aegis_wall'];
  p2.gemsEquipped = ['gem_opening_drop', 'gem_aegis_wall'];
  const restored2 = importSave(JSON.stringify({format: 'fencefall-save', version: 2, profile: p2, run: {version: 2, energy: 40, fieldSlots: []}}), memory());
  assert.equal(restored2.ok, true, restored2.reason);
  assert.equal(restored2.notice, 'legacyRunReset');
  assert.equal(restored2.run, null);
  assert.equal(restored2.profile.version, CONTRACT_VERSION);
  assert.equal(restored2.profile.currency, 145);
  assert.equal(restored2.profile.starterClaimed, true);
  assert.deepEqual(restored2.profile.gemsEquipped, ['gem_opening_drop', 'gem_aegis_wall']);
});
