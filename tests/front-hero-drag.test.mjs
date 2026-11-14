import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA, createUnit} from '../src/shared.js';
import {createController} from '../src/boot.js';
import {exportSave, importSave} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function ids(state) {
  return state.slots.map(slot => slot.unit ? `${slot.unit.id}:${slot.unit.kind}:${slot.unit.type}:${slot.unit.rank}` : null);
}

test('a new run starts with one hero in the middle of the front row', () => {
  const state = createRun({seed: 2, runId: 'front-hero'});
  assert.equal(state.slots[2].unit.kind, 'hero');
  assert.equal(state.slots[2].row, 0);
  assert.equal(state.slots[2].col, 2);
  assert.equal(state.slots[2].x, 180);
  assert.equal(state.slots[2].y, ARENA.frontY);
  assert.equal(state.slots[7].unit, null);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'hero').length, 1);
});

test('a saved hero stays in its slot when that slot is not the new start', () => {
  const state = createRun({seed: 3, runId: 'old-hero-slot'});
  const hero = state.slots[2].unit;
  state.slots[7].unit = hero;
  state.slots[2].unit = null;
  const text = exportSave(state.profileSnapshot, state);
  const imported = importSave(text, memoryStorage());
  assert.equal(imported.ok, true, imported.reason);
  assert.equal(imported.run.slots[7].unit.kind, 'hero');
  assert.equal(imported.run.slots[7].unit.id, hero.id);
  assert.equal(imported.run.slots[2].unit, null);
});

test('dragging moves onto an empty slot, merges a legal pair, and snaps illegal drops back', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 4, difficulty: 'normal', runId: 'drag-play'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  const before = ids(state);
  const blocked = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'not-planning');
  assert.deepEqual(ids(state), before);

  assert.equal(api.act('pause').paused, true);
  const moved = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(moved.ok, true);
  assert.equal(state.slots[0].unit, hero);
  assert.equal(state.slots[2].unit, null);

  state.slots[3].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[4].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[5].unit = createUnit(state, 'fire', 2, 'tower');
  const board = ids(state);
  const illegal = api.act('dragDrop', {from: 4, to: 5});
  assert.equal(illegal.ok, false);
  assert.equal(illegal.snapped, true);
  assert.deepEqual(ids(state), board);
  const heroDrop = api.act('dragDrop', {from: 0, to: 3});
  assert.equal(heroDrop.ok, false);
  assert.equal(heroDrop.reason, 'heroProtected');
  assert.equal(state.slots[0].unit, hero);
  assert.equal(state.slots[3].unit.type, 'bolt');

  const merged = api.act('dragDrop', {from: 3, to: 4});
  assert.equal(merged.ok, true, merged.reason);
  assert.equal(state.slots[3].unit, null);
  assert.equal(state.slots[4].unit.kind, 'tower');
  assert.equal(state.slots[4].unit.type, 'bolt');
  assert.equal(state.slots[4].unit.rank, 2);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'hero').length, 1);
  assert.match(api.getUI().message, /rank 2/);
  assert.match(api.getUI().message, /become one/);
});
