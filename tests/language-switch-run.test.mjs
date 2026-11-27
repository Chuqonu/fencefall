// Changing the profile language between en and zh must keep the active run.
// Fence HP, board units (including a unit waiting to be placed), seed, and
// elapsed simulation time stay at the live values. The live fence is marked
// below the last saved snapshot so a reload or a fresh start cannot pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/boot.js';
import {simulate} from '../src/engine.js';
import {createProfile} from '../src/state.js';
import {updateDrafts} from '../src/systems/drafts.js';

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

function unitSnapshot(unit) {
  return unit == null ? null : structuredClone(unit);
}

function marks(state) {
  return {
    runId: state.runId,
    seed: state.seed,
    time: state.time,
    fenceHp: state.fence.hp,
    units: state.slots.map(slot => unitSnapshot(slot?.unit)),
    pending: unitSnapshot(state.pendingUnit?.unit)
  };
}

function assertKept(state, before, label) {
  const after = marks(state);
  assert.equal(after.runId, before.runId, `${label} run`);
  assert.equal(after.seed, before.seed, `${label} seed`);
  assert.equal(after.time, before.time, `${label} time`);
  assert.equal(after.fenceHp, before.fenceHp, `${label} fence hp`);
  assert.deepEqual(after.units, before.units, `${label} units`);
  assert.deepEqual(after.pending, before.pending, `${label} pending unit`);
}

function flip(api, state) {
  const before = marks(state);
  const start = api.getProfile().settings.language === 'zh' ? 'zh' : 'en';
  const next = start === 'zh' ? 'en' : 'zh';
  const switched = api.act('language', {value: next});
  assert.equal(switched.ok, true, switched.reason);
  assert.equal(api.getProfile().settings.language, next);
  assert.equal(api.getState(), state);
  assertKept(state, before, next);
  const back = api.act('language', {value: start});
  assert.equal(back.ok, true, back.reason);
  assert.equal(api.getProfile().settings.language, start);
  assert.equal(api.getState(), state);
  assertKept(state, before, start);
  return before;
}

function elapse(state, seconds) {
  assert.equal(state.phase, 'playing');
  assert.equal(state.paused, false);
  const start = state.time;
  simulate(state, seconds);
  assert.ok(state.time > start, `clock stayed at ${start}`);
  assert.ok(state.fence.hp > 0);
}

function markFence(state, hp) {
  assert.ok(hp > 0 && hp < state.fence.maxHp);
  state.fence.hp = hp;
  assert.equal(state.fence.hp, hp);
}

test('switching language during a run keeps fence HP, units, seed, and time', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.getProfile().settings.language, 'en');
  assert.equal(api.act('start', {seed: 42, difficulty: 'normal', runId: 'language-switch-run'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  assert.equal(hero.kind, 'hero');
  assert.equal(state.seed, 42);
  assert.equal(state.time, 0);
  assert.equal(state.fence.hp, state.fence.maxHp);

  elapse(state, 4);
  markFence(state, 543);
  flip(api, state);
  const beforeReject = marks(state);
  const rejected = api.act('language', {value: 'de'});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'bad-language');
  assert.equal(api.getProfile().settings.language, 'en');
  assert.equal(api.getState(), state);
  assertKept(state, beforeReject, 'rejected language');

  assert.equal(state.phase, 'playing');
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.phase, 'draft');
  flip(api, state);

  const choice = state.draft.options.findIndex(option => option.kind === 'hero_upgrade');
  assert.ok(choice >= 0);
  const picked = state.draft.options[choice];
  assert.equal(api.act('chooseDraft', {index: choice}).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[2].unit, hero);
  assert.equal(hero.upgrades[picked.upgradeId], 1);
  markFence(state, 500);
  flip(api, state);

  const placed = marks(state);
  elapse(state, 1);
  assert.ok(state.time > placed.time);
  markFence(state, 470);
  const kept = flip(api, state);
  assert.equal(kept.fenceHp, 470);
  assert.equal(kept.seed, 42);
  assert.ok(kept.time > 4);
  assert.equal(kept.units.filter(Boolean).length, 1);
  assert.equal(kept.units[2].id, hero.id);
  assert.equal(kept.units[2].upgrades[picked.upgradeId], 1);
});

test('a run started in zh keeps its clock, fence, units, and seed when switched to en', async () => {
  const api = await createController({storage: memoryStorage(), profile: createProfile('zh')});
  assert.equal(api.getProfile().settings.language, 'zh');
  assert.equal(api.act('start', {seed: 7, difficulty: 'hard', runId: 'language-switch-zh'}).ok, true);
  const state = api.getState();
  assert.equal(state.profileSnapshot.settings.language, 'zh');
  elapse(state, 3);
  markFence(state, 400);
  const before = flip(api, state);
  assert.equal(api.getProfile().settings.language, 'zh');
  assert.equal(before.seed, 7);
  assert.equal(before.fenceHp, 400);
  assert.ok(before.time > 0);
  assert.equal(before.time, state.time);
  assert.notEqual(state.phase, 'victory');
  assert.notEqual(state.phase, 'defeat');
  assert.equal(before.units.filter(Boolean).length, 1);
  assert.equal(state.profileSnapshot.settings.language, 'zh');
  assert.equal(state.difficulty, 'hard');
});
