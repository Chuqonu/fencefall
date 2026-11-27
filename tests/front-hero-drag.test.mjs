import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
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

test('dragging moves onto an empty slot and swaps any two occupied slots cleanly without merge', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 4, difficulty: 'normal', runId: 'drag-play'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  state.nextDraftXp = 1e9;
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  const time = state.time;
  const tick = state.tick;
  const moved = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(moved.ok, true, moved.reason || '');
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[0].unit, hero);
  assert.equal(state.slots[2].unit, null);
  simulate(state, 0.5);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > time);
  assert.ok(state.tick > tick);

  assert.equal(api.act('pause').paused, true);
  assert.equal(api.act('dragDrop', {from: 0, to: 2}).ok, true);
  assert.equal(state.paused, true);
  assert.equal(state.slots[2].unit, hero);
  assert.equal(api.act('resume').paused, false);

  const bolt = createUnit(state, 'bolt', 1, 'tower');
  const fire = createUnit(state, 'fire', 2, 'tower');
  state.slots[3].unit = bolt;
  state.slots[5].unit = fire;

  // Swapping two turrets works without merging them
  const swapped = api.act('dragDrop', {from: 3, to: 5});
  assert.equal(swapped.ok, true);
  assert.equal(swapped.swapped, true);
  assert.equal(state.slots[5].unit, bolt);
  assert.equal(state.slots[3].unit, fire);
  assert.equal(state.slots[5].unit.rank, 1);
  assert.equal(state.slots[3].unit.rank, 2);

  // Swapping the hero with a turret keeps exactly one hero and both units intact
  const heroSwap = api.act('dragDrop', {from: 2, to: 3});
  assert.equal(heroSwap.ok, true);
  assert.equal(heroSwap.swapped, true);
  assert.equal(state.slots[3].unit, hero);
  assert.equal(state.slots[2].unit, fire);
  assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind === 'hero').length, 1);

  // Dropping onto same slot snaps back safely
  const same = api.act('dragDrop', {from: 3, to: 3});
  assert.equal(same.ok, false);
  assert.equal(same.snapped, true);
});
