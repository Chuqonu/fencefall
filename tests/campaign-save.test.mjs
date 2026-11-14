import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun, exportRun} from '../src/engine.js';
import {cancelPlacement, chooseDraft, draftXpCost, placePending, updateDrafts} from '../src/systems/drafts.js';
import {settleRun} from '../src/systems/progression.js';
import {exportSave, importSave, loadProfile, loadRun} from '../src/storage.js';

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

function beginRun(seed, runId) {
  const profile = createProfile();
  const state = createRun({seed, difficulty: 'normal', profile, runId});
  state.time = 96;
  state.tick = 120;
  state.kills = 11;
  state.wave = 3;
  state.xp = state.nextDraftXp + 2.5;
  return {profile, state};
}

function liveStamp(state) {
  return JSON.stringify({
    phase: state.phase,
    paused: state.paused,
    hiddenPaused: state.hiddenPaused,
    accumulator: state.accumulator,
    events: state.events,
    rng: state.rng,
    nextId: state.nextId,
    xp: state.xp,
    draftLevel: state.draftLevel,
    nextDraftXp: state.nextDraftXp,
    draft: state.draft,
    pendingUnit: state.pendingUnit,
    slots: state.slots.map(slot => slot.unit)
  });
}

function jsonView(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function boardView(state) {
  return state.slots.map(slot => ({
    index: slot.index,
    unit: jsonView(slot.unit)
  }));
}

function openDraft(state) {
  assert.equal(state.phase, 'playing');
  assert.equal(state.pendingUnit, null);
  assert.equal(state.draft, null);
  if (!(state.xp >= state.nextDraftXp)) state.xp = state.nextDraftXp;
  const opened = updateDrafts(state);
  assert.equal(opened.ok, true, opened.reason);
  assert.equal(state.phase, 'draft');
  assert.equal(state.pendingUnit, null);
  assert.equal(state.draft.options.length, 3);
  return opened;
}

function placeableTowerIndex(state) {
  return state.draft.options.findIndex(option => option.kind === 'tower' && option.replace !== true);
}

function fillBoard(state) {
  for (let placed = 0; placed < 9; placed += 1) {
    openDraft(state);
    const index = placeableTowerIndex(state);
    assert.ok(index >= 0, 'an empty slot must offer a tower that can be placed');
    const chosen = chooseDraft(state, index);
    assert.equal(chosen.ok, true, chosen.reason);
    assert.equal(state.phase, 'placing');
    const slotIndex = state.slots.findIndex(slot => slot.unit == null);
    assert.ok(slotIndex >= 0);
    const result = placePending(state, slotIndex);
    assert.equal(result.ok, true, result.reason);
    assert.equal(state.phase, 'playing');
    assert.equal(state.pendingUnit, null);
    assert.equal(state.draft, null);
  }
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
}

function assertRoundTrip(loaded, state) {
  assert.equal(loaded.runId, state.runId);
  assert.equal(loaded.seed, state.seed);
  assert.equal(loaded.rng, state.rng);
  assert.equal(loaded.nextId, state.nextId);
  assert.equal(loaded.phase, state.phase);
  assert.equal(loaded.paused, true);
  assert.equal(loaded.hiddenPaused, false);
  assert.equal(loaded.accumulator, 0);
  assert.deepEqual(loaded.events, []);
  assert.equal(loaded.time, state.time);
  assert.equal(loaded.tick, state.tick);
  assert.equal(loaded.kills, state.kills);
  assert.equal(loaded.wave, state.wave);
  assert.equal(loaded.xp, state.xp);
  assert.equal(loaded.draftLevel, state.draftLevel);
  assert.equal(loaded.nextDraftXp, state.nextDraftXp);
  assert.equal(loaded.difficulty, state.difficulty);
  assert.equal(loaded.speed, state.speed);
  assert.equal(loaded.fence.hp, state.fence.hp);
  assert.equal(loaded.fence.maxHp, state.fence.maxHp);
  assert.deepEqual(boardView(loaded), boardView(state));
  assert.deepEqual(jsonView(loaded.draft), jsonView(state.draft));
  assert.deepEqual(jsonView(loaded.pendingUnit), jsonView(state.pendingUnit));
}

function exportText(profile, state) {
  const before = liveStamp(state);
  const snapshot = exportRun(state);
  const text = exportSave(profile, snapshot);
  assert.equal(typeof text, 'string');
  assert.equal(liveStamp(state), before);
  assert.notEqual(snapshot, state);
  assert.equal(snapshot.phase, state.phase);
  assert.equal(snapshot.accumulator, 0);
  assert.deepEqual(snapshot.events, []);
  assert.equal(state.paused, false);
  return text;
}

function importText(text) {
  const storage = memoryStorage();
  const imported = importSave(text, storage);
  assert.equal(imported.ok, true, imported.reason);
  const loaded = loadRun(storage);
  const loadedProfile = loadProfile(storage);
  assert.ok(loaded);
  assert.ok(loadedProfile);
  assert.deepEqual(loaded, imported.run);
  assert.deepEqual(loadedProfile, imported.profile);
  return {storage, loaded, loadedProfile};
}

test('a draft-phase run exports and imports with the same offer', () => {
  const {profile, state} = beginRun(2101, 'campaign-draft');
  assert.equal(state.nextDraftXp, draftXpCost(0));
  openDraft(state);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.equal(state.xp, 2.5);
  assert.ok(state.events.some(event => event.type === 'draft'));
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);

  const {loaded, loadedProfile} = importText(exportText(profile, state));
  assertRoundTrip(loaded, state);
  assert.equal(loaded.phase, 'draft');
  assert.equal(loaded.pendingUnit, null);
  assert.equal(loadedProfile.currency, profile.currency);
  assert.equal(state.phase, 'draft');
  assert.ok(state.events.some(event => event.type === 'draft'));

  const choice = placeableTowerIndex(loaded);
  assert.ok(choice >= 0);
  const card = loaded.draft.options[choice];
  const chosen = chooseDraft(loaded, choice);
  assert.equal(chosen.ok, true, chosen.reason);
  assert.equal(loaded.phase, 'placing');
  assert.equal(loaded.pendingUnit.unit.type, card.type);
  assert.equal(loaded.pendingUnit.unit.kind, 'tower');
  assert.equal(loaded.pendingUnit.unit.rank, 1);
  assert.equal(loaded.pendingUnit.replace, card.replace);
  assert.equal(loaded.slots.filter(slot => slot.unit).length, 1);
});

test('a tower waiting to be placed survives export and can still be placed or cancelled', () => {
  const {profile, state} = beginRun(2102, 'campaign-placing');
  openDraft(state);
  const choice = placeableTowerIndex(state);
  assert.ok(choice >= 0);
  const card = state.draft.options[choice];
  assert.equal(chooseDraft(state, choice).ok, true);
  assert.equal(state.phase, 'placing');
  assert.equal(state.pendingUnit.unit.type, card.type);
  assert.equal(state.pendingUnit.unit.kind, 'tower');
  assert.equal(state.pendingUnit.unit.rank, 1);
  assert.equal(state.pendingUnit.replace, card.replace);
  assert.equal(state.draft.options.length, 3);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
  const pendingId = state.pendingUnit.unit.id;
  const offered = jsonView(state.draft.options);

  const text = exportText(profile, state);
  assert.equal(state.phase, 'placing');
  assert.equal(state.pendingUnit.unit.id, pendingId);

  const placed = importText(text);
  const cancelled = importText(text);
  assertRoundTrip(placed.loaded, state);
  assertRoundTrip(cancelled.loaded, state);
  assert.equal(placed.loaded.phase, 'placing');
  assert.equal(placed.loaded.pendingUnit.unit.id, pendingId);
  assert.equal(placed.loaded.slots.some(slot => slot.unit?.id === pendingId), false);

  const slotIndex = placed.loaded.slots.findIndex(slot => slot.unit == null);
  assert.ok(slotIndex >= 0);
  assert.equal(placePending(placed.loaded, slotIndex).ok, true);
  assert.equal(placed.loaded.phase, 'playing');
  assert.equal(placed.loaded.pendingUnit, null);
  assert.equal(placed.loaded.draft, null);
  assert.equal(placed.loaded.slots[slotIndex].unit.id, pendingId);
  assert.equal(placed.loaded.slots[slotIndex].unit.type, card.type);
  assert.equal(placed.loaded.slots.filter(slot => slot.unit).length, 2);

  assert.equal(cancelPlacement(cancelled.loaded).ok, true);
  assert.equal(cancelled.loaded.phase, 'draft');
  assert.equal(cancelled.loaded.pendingUnit, null);
  assert.deepEqual(jsonView(cancelled.loaded.draft.options), offered);
  assert.equal(cancelled.loaded.slots.some(slot => slot.unit?.id === pendingId), false);
  assert.equal(cancelled.loaded.slots.filter(slot => slot.unit).length, 1);
});

test('a board that already has ten units exports and imports every defender', () => {
  const {profile, state} = beginRun(2103, 'campaign-full-board');
  fillBoard(state);
  const marked = state.slots.find(slot => slot.unit && slot.unit.kind === 'tower');
  assert.ok(marked);
  marked.unit.rank = 3;
  marked.unit.kills = 6;
  marked.unit.cooldown = 0.5;
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  assert.equal(state.slots.filter(slot => slot.unit?.kind === 'hero').length, 1);

  const {loaded, loadedProfile} = importText(exportText(profile, state));
  assertRoundTrip(loaded, state);
  assert.equal(loaded.phase, 'playing');
  assert.equal(loaded.slots.length, 10);
  assert.equal(loaded.slots.filter(slot => slot.unit).length, 10);
  assert.equal(loaded.slots.filter(slot => slot.unit.kind === 'hero').length, 1);
  assert.equal(new Set(loaded.slots.map(slot => slot.unit.id)).size, 10);
  assert.equal(loaded.slots[marked.index].unit.rank, 3);
  assert.equal(loaded.slots[marked.index].unit.kills, 6);
  assert.equal(loaded.slots[marked.index].unit.cooldown, 0.5);
  assert.equal(loadedProfile.currency, 0);

  loaded.xp = loaded.nextDraftXp;
  const reopened = updateDrafts(loaded);
  assert.equal(reopened.ok, true, reopened.reason);
  assert.equal(loaded.phase, 'draft');
  assert.equal(loaded.draft.options.length, 3);
  assert.equal(loaded.slots.filter(slot => slot.unit).length, 10);
});

test('a settled victory pays currency once when settleRun is called twice', () => {
  const profile = createProfile();
  const state = createRun({seed: 2104, difficulty: 'normal', profile, runId: 'campaign-victory'});
  state.phase = 'victory';
  state.time = 250;
  state.kills = 40;
  state.wave = 10;
  const starting = profile.currency;

  const first = settleRun(profile, state);
  assert.equal(first.result, 'victory');
  assert.equal(first.currency, 74);
  assert.equal(profile.currency, starting + first.currency);
  assert.deepEqual(profile.settledRuns, [state.runId]);
  assert.equal(profile.best.normal.victories, 1);
  assert.equal(profile.best.normal.currency, first.currency);

  const second = settleRun(profile, state);
  assert.equal(second, first);
  assert.equal(second.currency, first.currency);
  assert.equal(second.result, 'victory');
  assert.equal(profile.currency, starting + first.currency);
  assert.deepEqual(profile.settledRuns, [state.runId]);
  assert.equal(profile.best.normal.victories, 1);

  const {loaded, loadedProfile} = importText(exportText(profile, state));
  assertRoundTrip(loaded, state);
  assert.equal(loaded.phase, 'victory');
  assert.equal(loaded.settlement.runId, state.runId);
  assert.equal(loaded.settlement.result, 'victory');
  assert.equal(loaded.settlement.currency, first.currency);
  assert.equal(loaded.settlement.time, 250);
  assert.equal(loaded.settlement.kills, 40);
  assert.equal(loaded.settlement.wave, 10);
  assert.equal(loadedProfile.currency, profile.currency);
  assert.deepEqual(loadedProfile.settledRuns, [state.runId]);
  assert.equal(loadedProfile.best.normal.victories, 1);

  const third = settleRun(loadedProfile, loaded);
  assert.equal(third.currency, first.currency);
  assert.equal(third.result, 'victory');
  assert.equal(loadedProfile.currency, profile.currency);
  assert.deepEqual(loadedProfile.settledRuns, [state.runId]);
  assert.equal(loadedProfile.best.normal.victories, 1);
});
