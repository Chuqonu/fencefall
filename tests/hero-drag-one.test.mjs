import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
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

function isHero(unit) {
  return Boolean(unit) && (unit.kind === 'hero' || unit.type === 'hero');
}

function heroSlots(state) {
  const slots = [];
  for (const slot of state.slots) {
    if (isHero(slot.unit)) slots.push(slot.index);
  }
  return slots;
}

function assertOneHero(state, hero, slotIndex, label) {
  assert.deepEqual(heroSlots(state), [slotIndex], `${label} hero slots`);
  assert.equal(state.slots[slotIndex].unit, hero, `${label} occupant`);
  assert.equal(hero.kind, 'hero', `${label} kind`);
  assert.equal(hero.type, 'hero', `${label} type`);
  assert.equal(hero.rank, 1, `${label} rank`);
  const units = state.slots.map(slot => slot.unit).filter(Boolean);
  assert.equal(units.filter(unit => unit === hero || unit.id === hero.id).length, 1, `${label} copies`);
}

test('a new run starts with the solo gunner fixed on center slot 2', async () => {
  const created = createRun({seed: 2, difficulty: 'normal', runId: 'hero-drag-one-create'});
  const createdHero = created.slots[2].unit;
  assert.ok(createdHero, 'createRun hero');
  assertOneHero(created, createdHero, 2, 'createRun');
  assert.equal(created.slots.filter(slot => slot.unit).length, 1);

  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 2, difficulty: 'normal', runId: 'hero-drag-one-start'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  assert.ok(hero, 'started hero');
  assertOneHero(state, hero, 2, 'start');
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
});

test('dragDrop and move keep the solo gunner permanently anchored on center slot 2', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 8, difficulty: 'normal', runId: 'hero-fixed-move'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  const nextId = state.nextId;
  state.nextDraftXp = 1e9;

  for (const to of [0, 1, 3, 4, 5, 6, 7, 8, 9]) {
    const dragged = api.act('dragDrop', {from: 2, to});
    assert.equal(dragged.ok, false);
    assert.equal(dragged.reason, 'heroFixed');
    assertOneHero(state, hero, 2, `drag 2->${to}`);

    const moved = api.act('move', {from: 2, to});
    assert.equal(moved.ok, false);
    assert.equal(moved.reason, 'heroFixed');
    assertOneHero(state, hero, 2, `move 2->${to}`);
  }

  simulate(state, 0.25);
  assertOneHero(state, hero, 2, 'after sim');
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
  assert.equal(state.nextId, nextId);
});
