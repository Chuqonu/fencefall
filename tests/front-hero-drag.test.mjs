import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
import {ARENA} from '../src/shared.js';
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

test('a new run starts with one solo gunner anchored in the middle of the wall', () => {
  const state = createRun({seed: 2, runId: 'front-hero'});
  assert.equal(state.slots[2].unit.kind, 'hero');
  assert.equal(state.slots[2].row, 0);
  assert.equal(state.slots[2].col, 2);
  assert.equal(state.slots[2].x, 180);
  assert.equal(state.slots[2].y, ARENA.frontY);
  assert.equal(state.slots[7].unit, null);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
});

test('a saved hero stays in its slot when loaded from a legacy save', () => {
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

test('v5 locks the solo gunner permanently at center wall and rejects dragDrop / move cleanly', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 4, difficulty: 'normal', runId: 'fixed-center'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  state.nextDraftXp = 1e9;
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');

  const dragged = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(dragged.ok, false);
  assert.equal(dragged.reason, 'heroFixed');
  assert.equal(dragged.snapped, true);
  assert.equal(state.slots[2].unit, hero);
  assert.equal(state.slots[0].unit, null);

  const moved = api.act('move', {from: 2, to: 4});
  assert.equal(moved.ok, false);
  assert.equal(moved.reason, 'heroFixed');
  assert.equal(state.slots[2].unit, hero);
  assert.equal(state.slots[4].unit, null);

  const time = state.time;
  simulate(state, 0.5);
  assert.ok(state.time > time);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'hero').length, 1);
});
