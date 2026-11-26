import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun, simulate} from '../src/engine.js';
import {previewMerge, mergeUnits} from '../src/systems/merges.js';
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

function place(state, index, type, rank, kind = 'tower') {
  const unit = createUnit(state, type, rank, kind);
  unit.kills = 20 + index;
  unit.cooldown = index / 10;
  unit.upgrades = {mark: `${type}-${rank}`};
  state.slots[index].unit = unit;
  return unit;
}

function capture(state) {
  return {
    units: state.slots.map(slot => slot.unit),
    records: state.slots.map(slot => slot.unit ? {
      id: slot.unit.id,
      kind: slot.unit.kind,
      type: slot.unit.type,
      rank: slot.unit.rank,
      kills: slot.unit.kills,
      cooldown: slot.unit.cooldown,
      upgrades: {...slot.unit.upgrades}
    } : null),
    nextId: state.nextId,
    merges: state.stats.merges,
    stats: state.stats,
    events: state.events,
    eventCount: state.events.length,
    rng: state.rng
  };
}

function heroCount(state) {
  return state.slots.filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).length;
}

function assertUntouched(state, snap, hero, label) {
  for (let index = 0; index < snap.units.length; index += 1) {
    const unit = state.slots[index].unit;
    const record = snap.records[index];
    assert.equal(unit, snap.units[index], `${label} slot ${index}`);
    if (!record) {
      assert.equal(unit, null, `${label} empty ${index}`);
      continue;
    }
    assert.equal(unit.id, record.id, `${label} id ${index}`);
    assert.equal(unit.kind, record.kind, `${label} kind ${index}`);
    assert.equal(unit.type, record.type, `${label} type ${index}`);
    assert.equal(unit.rank, record.rank, `${label} rank ${index}`);
    assert.equal(unit.kills, record.kills, `${label} kills ${index}`);
    assert.equal(unit.cooldown, record.cooldown, `${label} cooldown ${index}`);
    assert.deepEqual(unit.upgrades, record.upgrades, `${label} upgrades ${index}`);
  }
  assert.equal(heroCount(state), 1, `${label} hero count`);
  assert.equal(state.slots.filter(slot => slot.unit === hero).length, 1, `${label} hero identity`);
  assert.equal(hero.kind, 'hero', `${label} hero kind`);
  assert.equal(hero.type, 'hero', `${label} hero type`);
  assert.equal(state.nextId, snap.nextId, `${label} nextId`);
  assert.equal(state.stats, snap.stats, `${label} stats`);
  assert.equal(state.stats.merges, snap.merges, `${label} merges`);
  assert.equal(state.events, snap.events, `${label} events`);
  assert.equal(state.events.length, snap.eventCount, `${label} event count`);
  assert.equal(state.rng, snap.rng, `${label} rng`);
}

function rejectMerge(state, snap, hero, from, to, reason) {
  const label = `${from}->${to}`;
  const preview = previewMerge(state, from, to);
  assert.equal(preview.ok, false, `preview ${label}`);
  assert.equal(preview.reason, reason, `preview ${label}`);
  assert.equal(preview.result, undefined, `preview ${label}`);
  assertUntouched(state, snap, hero, `preview ${label}`);
  const merged = mergeUnits(state, from, to);
  assert.equal(merged.ok, false, `merge ${label}`);
  assert.equal(merged.reason, reason, `merge ${label}`);
  assert.equal(merged.unit, undefined, `merge ${label}`);
  assertUntouched(state, snap, hero, `merge ${label}`);
}

test('an invalid merge leaves every unit in place and keeps one hero', () => {
  const state = createRun({seed: 11, difficulty: 'normal', runId: 'illegal-drop'});
  const hero = state.slots[2].unit;
  state.slots[9].unit = hero;
  state.slots[2].unit = null;
  const bolt = place(state, 0, 'bolt', 1);
  const boltHigh = place(state, 1, 'bolt', 2);
  const fire = place(state, 3, 'fire', 1);
  const frostLow = place(state, 4, 'frost', 4);
  const frostHigh = place(state, 5, 'frost', 4);
  const cinder = place(state, 6, 'cinderbolt', 2, 'hybrid');
  const hail = place(state, 7, 'hailspike', 2, 'hybrid');
  const capped = place(state, 8, 'cinderbolt', 4, 'hybrid');

  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  const snap = capture(state);

  rejectMerge(state, snap, hero, 9, 0, 'hero_protected');
  rejectMerge(state, snap, hero, 0, 9, 'hero_protected');
  rejectMerge(state, snap, hero, 4, 5, 'rank_cap');
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');

  state.paused = true;
  const illegal = [
    [9, 0, 'hero_protected'],
    [0, 9, 'hero_protected'],
    [9, 6, 'hero_protected'],
    [7, 9, 'hero_protected'],
    [9, 8, 'hero_protected'],
    [8, 9, 'hero_protected'],
    [9, 9, 'same_slot'],
    [9, 2, 'empty_slot'],
    [2, 9, 'empty_slot'],
    [0, 1, 'rank_mismatch'],
    [1, 0, 'rank_mismatch'],
    [3, 1, 'rank_mismatch'],
    [1, 3, 'rank_mismatch'],
    [4, 3, 'rank_mismatch'],
    [4, 5, 'rank_cap'],
    [5, 4, 'rank_cap'],
    [8, 6, 'rank_mismatch'],
    [6, 7, 'hybrid_locked'],
    [7, 6, 'hybrid_locked'],
    [6, 0, 'hybrid_locked'],
    [0, 6, 'hybrid_locked'],
    [8, 0, 'hybrid_locked'],
    [6, 4, 'hybrid_locked'],
    [0, 0, 'same_slot'],
    [0, 2, 'empty_slot'],
    [2, 0, 'empty_slot'],
    [-1, 0, 'invalid_slot'],
    [0, 10, 'invalid_slot'],
    [0, 1.5, 'invalid_slot']
  ];
  for (const [from, to, reason] of illegal) rejectMerge(state, snap, hero, from, to, reason);

  assert.equal(state.slots[9].unit, hero);
  assert.equal(state.slots[2].unit, null);
  assert.equal(state.slots[0].unit, bolt);
  assert.equal(state.slots[1].unit, boltHigh);
  assert.equal(state.slots[3].unit, fire);
  assert.equal(state.slots[4].unit, frostLow);
  assert.equal(state.slots[5].unit, frostHigh);
  assert.equal(state.slots[6].unit, cinder);
  assert.equal(state.slots[7].unit, hail);
  assert.equal(state.slots[8].unit, capped);
  assert.equal(heroCount(state), 1);
  assert.equal(state.stats.merges, 0);
  assert.equal(state.slots.filter(slot => slot.unit).length, 9);
});

test('an illegal drop, including one onto the hero, keeps both units', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 12, difficulty: 'normal', runId: 'illegal-drop-play'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  const bolt = place(state, 0, 'bolt', 1);
  const boltHigh = place(state, 1, 'bolt', 2);
  const fire = place(state, 3, 'fire', 1);
  const frostLow = place(state, 4, 'frost', 4);
  const frostHigh = place(state, 5, 'frost', 4);
  const cinder = place(state, 6, 'cinderbolt', 2, 'hybrid');
  const hail = place(state, 7, 'hailspike', 2, 'hybrid');
  const snap = capture(state);

  const blocked = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'heroProtected');
  assert.equal(blocked.snapped, true);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assertUntouched(state, snap, hero, 'drop during play');
  const blockedPair = api.act('dragDrop', {from: 0, to: 1});
  assert.equal(blockedPair.ok, false);
  assert.equal(blockedPair.reason, 'rank_mismatch');
  assert.equal(blockedPair.snapped, true);
  assert.equal(state.paused, false);
  assertUntouched(state, snap, hero, 'pair during play');

  const livePreview = api.act('mergePreview', {from: 0, to: 3});
  assert.equal(livePreview.ok, true, livePreview.reason);
  assert.equal(state.paused, false);
  assertUntouched(state, snap, hero, 'live preview');
  assert.equal(api.act('mergeCancel').ok, true);
  assert.equal(api.getUI().mergePreview, null);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assertUntouched(state, snap, hero, 'live cancel');

  assert.equal(api.act('pause').paused, true);
  const drops = [
    [2, 0, 'heroProtected'],
    [0, 2, 'heroProtected'],
    [2, 6, 'heroProtected'],
    [7, 2, 'heroProtected'],
    [0, 1, 'rank_mismatch'],
    [1, 0, 'rank_mismatch'],
    [3, 1, 'rank_mismatch'],
    [4, 5, 'rank_cap'],
    [5, 4, 'rank_cap'],
    [6, 7, 'hybrid_locked'],
    [7, 6, 'hybrid_locked'],
    [6, 0, 'hybrid_locked'],
    [0, 6, 'hybrid_locked']
  ];
  for (const [from, to, reason] of drops) {
    const dropped = api.act('dragDrop', {from, to});
    assert.equal(dropped.ok, false, `drop ${from}->${to}`);
    assert.equal(dropped.reason, reason, `drop ${from}->${to}`);
    assert.equal(dropped.snapped, true, `drop ${from}->${to}`);
    assertUntouched(state, snap, hero, `drop ${from}->${to}`);
  }

  for (const [from, to, reason] of drops) {
    const preview = api.act('mergePreview', {from, to});
    assert.equal(preview.ok, false, `preview ${from}->${to}`);
    assert.equal(preview.reason, reason, `preview ${from}->${to}`);
    assertUntouched(state, snap, hero, `preview ${from}->${to}`);
    const confirmed = api.act('mergeConfirm', {from, to});
    assert.equal(confirmed.ok, false, `confirm ${from}->${to}`);
    assert.equal(confirmed.reason, reason, `confirm ${from}->${to}`);
    assertUntouched(state, snap, hero, `confirm ${from}->${to}`);
  }

  const preview = api.act('mergePreview', {from: 0, to: 3});
  assert.equal(preview.ok, true, preview.reason);
  assert.equal(preview.result.type, 'cinderbolt');
  assertUntouched(state, snap, hero, 'legal preview');
  assert.equal(api.act('mergeCancel').ok, true);
  assertUntouched(state, snap, hero, 'cancel');
  assert.equal(api.getUI().mergePreview, null);

  assert.equal(state.slots[2].unit, hero);
  assert.equal(state.slots[0].unit, bolt);
  assert.equal(state.slots[1].unit, boltHigh);
  assert.equal(state.slots[3].unit, fire);
  assert.equal(state.slots[4].unit, frostLow);
  assert.equal(state.slots[5].unit, frostHigh);
  assert.equal(state.slots[6].unit, cinder);
  assert.equal(state.slots[7].unit, hail);
  assert.equal(heroCount(state), 1);
  assert.equal(state.stats.merges, 0);

  assert.equal(api.act('resume').paused, false);
  state.nextDraftXp = 1e9;
  const time = state.time;
  const tick = state.tick;
  const confirmed = api.act('mergeConfirm', {from: 0, to: 3});
  assert.equal(confirmed.ok, true, confirmed.reason);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.slots[3].unit.type, 'cinderbolt');
  assert.equal(state.slots[2].unit, hero);
  assert.equal(heroCount(state), 1);
  simulate(state, 0.5);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > time);
  assert.ok(state.tick > tick);
  assert.equal(state.slots[3].unit.type, 'cinderbolt');
});
