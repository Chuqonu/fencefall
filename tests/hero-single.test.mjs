import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {previewMerge, mergeUnits} from '../src/systems/merges.js';
import {chooseDraft, placePending, updateDrafts} from '../src/systems/drafts.js';
import {createController} from '../src/boot.js';

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

function snap(state) {
  return state.slots.map(slot => {
    if (!slot.unit) return null;
    return {id: slot.unit.id, kind: slot.unit.kind, type: slot.unit.type, rank: slot.unit.rank};
  });
}

function assertSingleHero(state, hero, label) {
  const slots = [];
  for (const slot of state.slots) {
    const unit = slot.unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) slots.push(slot.index);
  }
  assert.deepEqual(slots, [7], `${label} hero slots`);
  assert.equal(state.slots[7].unit, hero, `${label} hero`);
  assert.equal(hero.id.startsWith('u'), true, `${label} hero id`);
  assert.equal(hero.kind, 'hero', `${label} kind`);
  assert.equal(hero.type, 'hero', `${label} type`);
  assert.equal(hero.rank, 1, `${label} rank`);
  const units = state.slots.map(slot => slot.unit).filter(Boolean);
  assert.equal(new Set(units).size, units.length, `${label} shared unit`);
  assert.equal(units.filter(unit => unit.id === hero.id).length, 1, `${label} hero id count`);
  const pending = state.pendingUnit && state.pendingUnit.unit;
  if (pending) {
    assert.notEqual(pending, hero, `${label} pending hero`);
    assert.notEqual(pending.id, hero.id, `${label} pending id`);
    assert.notEqual(pending.kind, 'hero', `${label} pending kind`);
    assert.notEqual(pending.type, 'hero', `${label} pending type`);
  }
}

function rejectHeroMerge(state, from, to, reason) {
  const before = snap(state);
  const nextId = state.nextId;
  const merges = state.stats.merges;
  const preview = previewMerge(state, from, to);
  assert.equal(preview.ok, false, `preview ${from}->${to}`);
  assert.equal(preview.reason, reason, `preview ${from}->${to}`);
  assert.equal(preview.result, undefined, `preview ${from}->${to}`);
  const merged = mergeUnits(state, from, to);
  assert.equal(merged.ok, false, `merge ${from}->${to}`);
  assert.equal(merged.reason, reason, `merge ${from}->${to}`);
  assert.equal(merged.unit, undefined, `merge ${from}->${to}`);
  assert.deepEqual(snap(state), before, `board ${from}->${to}`);
  assert.equal(state.nextId, nextId, `nextId ${from}->${to}`);
  assert.equal(state.stats.merges, merges, `merges ${from}->${to}`);
}

function findPair(state) {
  const groups = new Map();
  for (const slot of state.slots) {
    const unit = slot.unit;
    if (!unit || unit.kind === 'hero' || unit.type === 'hero') continue;
    const key = `${unit.kind}|${unit.type}|${unit.rank}`;
    const list = groups.get(key) || [];
    list.push(slot.index);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length >= 2) return [list[0], list[1]];
  }
  return null;
}

function openTower(state) {
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  state.paused = false;
  state.xp = state.nextDraftXp;
  const opened = updateDrafts(state);
  assert.equal(opened.ok, true, opened.reason || 'draft');
  assert.equal(state.phase, 'draft');
  const index = state.draft.options.findIndex(card => card.kind === 'tower' && card.replace !== true);
  assert.ok(index >= 0, 'placeable tower');
  return {index, type: state.draft.options[index].type, options: state.draft.options.map(card => card.id)};
}

test('a hero merge attempt and later tower placement leave exactly one hero', () => {
  const state = createRun({seed: 15, difficulty: 'normal', runId: 'hero-single'});
  const hero = state.slots[7].unit;
  assertSingleHero(state, hero, 'start');

  state.paused = true;
  rejectHeroMerge(state, 7, 0, 'empty_slot');
  rejectHeroMerge(state, 0, 7, 'empty_slot');
  rejectHeroMerge(state, 7, 7, 'same_slot');
  assertSingleHero(state, hero, 'before towers');
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);

  const towers = [];
  for (let placed = 0; placed < 9; placed += 1) {
    const offer = openTower(state);
    if (towers.length > 0) {
      const partner = towers[towers.length - 1];
      rejectHeroMerge(state, 7, partner, 'hero_protected');
      rejectHeroMerge(state, partner, 7, 'hero_protected');
      assert.equal(state.phase, 'draft');
      assert.deepEqual(state.draft.options.map(card => card.id), offer.options);
      assertSingleHero(state, hero, `draft ${placed}`);
    }

    assert.equal(chooseDraft(state, offer.index).ok, true);
    assert.equal(state.phase, 'placing');
    if (towers.length > 0) {
      rejectHeroMerge(state, 7, towers[0], 'not_planning');
      rejectHeroMerge(state, towers[0], 7, 'not_planning');
      assert.equal(state.phase, 'placing');
      assert.equal(state.pendingUnit.unit.type, offer.type);
    }

    assert.equal(placePending(state, 7).reason, 'hero_protected');
    assert.equal(placePending(state, 7, {replace: true}).reason, 'hero_protected');
    assert.equal(state.phase, 'placing');
    assert.equal(state.slots[7].unit, hero);
    const empty = state.slots.findIndex(slot => !slot.unit);
    assert.ok(empty >= 0 && empty !== 7);
    assert.equal(placePending(state, empty).ok, true);
    assert.equal(state.phase, 'playing');
    assert.equal(state.draft, null);
    assert.equal(state.pendingUnit, null);
    const tower = state.slots[empty].unit;
    assert.equal(tower.kind, 'tower');
    assert.equal(tower.type, offer.type);
    assert.equal(tower.rank, 1);
    assert.notEqual(tower.id, hero.id);
    towers.push(empty);
    assertSingleHero(state, hero, `placed ${placed + 1}`);
    assert.equal(state.stats.merges, 0);
  }

  assert.equal(towers.length, 9);
  assert.equal(new Set(towers).size, 9);
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'tower').length, 9);

  state.paused = true;
  for (const slot of towers) {
    rejectHeroMerge(state, 7, slot, 'hero_protected');
    rejectHeroMerge(state, slot, 7, 'hero_protected');
  }
  assertSingleHero(state, hero, 'after hero merges');
  assert.equal(state.stats.merges, 0);
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);

  const pair = findPair(state);
  assert.ok(pair, 'matching towers');
  const [from, to] = pair;
  const merged = mergeUnits(state, from, to);
  assert.equal(merged.ok, true);
  assert.equal(merged.unit.kind, 'tower');
  assert.equal(merged.unit.type, state.slots[to].unit.type);
  assert.notEqual(merged.unit.kind, 'hero');
  assert.notEqual(merged.unit.type, 'hero');
  assert.equal(state.slots[from].unit, null);
  assert.equal(state.slots[to].unit, merged.unit);
  assert.equal(state.slots[7].unit, hero);
  assert.equal(state.stats.merges, 1);
  assertSingleHero(state, hero, 'after tower merge');

  rejectHeroMerge(state, 7, to, 'hero_protected');
  rejectHeroMerge(state, to, 7, 'hero_protected');
  assert.equal(state.slots[to].unit, merged.unit);
  assert.equal(state.stats.merges, 1);

  state.paused = false;
  const refill = openTower(state);
  assert.equal(chooseDraft(state, refill.index).ok, true);
  assert.equal(placePending(state, 7, {replace: true}).reason, 'hero_protected');
  assert.equal(state.slots[7].unit, hero);
  const hole = state.slots.findIndex(slot => !slot.unit);
  assert.equal(hole, from);
  assert.equal(placePending(state, hole).ok, true);
  assert.equal(state.slots[hole].unit.kind, 'tower');
  assert.equal(state.slots[hole].unit.type, refill.type);
  assert.equal(state.slots[hole].unit.rank, 1);
  assert.notEqual(state.slots[hole].unit.id, hero.id);
  assert.equal(state.slots[7].unit, hero);
  assert.equal(state.stats.merges, 1);
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
  assertSingleHero(state, hero, 'refilled');
});

test('controller place and merge actions keep the single hero', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {difficulty: 'normal', seed: 21, runId: 'hero-single-play'}).ok, true);
  const state = api.getState();
  const hero = state.slots[7].unit;
  assertSingleHero(state, hero, 'play start');
  assert.equal(api.act('pause').paused, true);

  const towers = [];
  for (let placed = 0; placed < 2; placed += 1) {
    state.xp = state.nextDraftXp;
    assert.equal(updateDrafts(state).ok, true);
    const index = state.draft.options.findIndex(card => card.kind === 'tower' && card.replace !== true);
    assert.ok(index >= 0);
    const type = state.draft.options[index].type;
    assert.equal(api.act('chooseDraft', {index}).ok, true);
    assert.equal(state.phase, 'placing');
    const refused = api.act('place', {index: 7, replace: true});
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'heroProtected');
    assert.equal(state.phase, 'placing');
    assert.equal(state.slots[7].unit, hero);
    const empty = state.slots.findIndex(slot => !slot.unit);
    assert.equal(api.act('place', {index: empty}).ok, true);
    assert.equal(state.slots[empty].unit.kind, 'tower');
    assert.equal(state.slots[empty].unit.type, type);
    assert.notEqual(state.slots[empty].unit.id, hero.id);
    towers.push(empty);
    assertSingleHero(state, hero, `play placed ${placed + 1}`);
  }

  assert.equal(state.paused, true);
  for (const slot of towers) {
    for (const [from, to] of [[7, slot], [slot, 7]]) {
      const before = snap(state);
      const preview = api.act('mergePreview', {from, to});
      assert.equal(preview.ok, false);
      assert.equal(preview.reason, 'heroProtected');
      const confirmed = api.act('mergeConfirm', {from, to});
      assert.equal(confirmed.ok, false);
      assert.equal(confirmed.reason, 'heroProtected');
      assert.deepEqual(snap(state), before);
      assert.equal(state.slots[7].unit, hero);
      assert.equal(state.slots[slot].unit.kind, 'tower');
    }
  }

  const [first, second] = towers;
  assert.equal(api.getUI().selectedSlot, second);
  assert.equal(api.act('selectSlot', {index: second}).ok, true);
  assert.equal(api.getUI().selectedSlot, -1);
  assert.equal(api.act('selectSlot', {index: 7}).ok, true);
  assert.equal(api.getUI().selectedSlot, 7);
  const selected = api.act('selectSlot', {index: first});
  assert.equal(selected.ok, false);
  assert.equal(selected.reason, 'heroProtected');
  assert.equal(api.getUI().selectedSlot, 7);
  assert.equal(api.getUI().mergePreview, null);
  assert.equal(api.act('selectSlot', {index: 7}).ok, true);
  assert.equal(api.getUI().selectedSlot, -1);
  assert.equal(api.act('selectSlot', {index: first}).ok, true);
  const reverse = api.act('selectSlot', {index: 7});
  assert.equal(reverse.ok, false);
  assert.equal(reverse.reason, 'heroProtected');
  assert.equal(api.getUI().selectedSlot, first);
  assert.equal(api.getUI().mergePreview, null);
  assert.equal(state.slots[7].unit, hero);
  assert.equal(state.slots[first].unit.kind, 'tower');
  assert.equal(state.slots[second].unit.kind, 'tower');
  assert.equal(state.stats.merges, 0);
  assert.equal(state.slots.filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).length, 1);
  assertSingleHero(state, hero, 'play merge');
});
