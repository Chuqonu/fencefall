import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, simulate} from '../src/engine.js';
import {createUnit} from '../src/shared.js';
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

test('a new run starts with the hero on slot 2', async () => {
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

test('moving the hero onto an empty slot leaves exactly one hero in the destination', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 8, difficulty: 'normal', runId: 'hero-drag-one-move'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  assertOneHero(state, hero, 2, 'before move');

  state.nextDraftXp = 1e9;
  const time = state.time;
  const tick = state.tick;
  const movedLive = api.act('dragDrop', {from: 2, to: 0});
  assert.equal(movedLive.ok, true, movedLive.reason || '');
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assertOneHero(state, hero, 0, 'unpaused drag');
  simulate(state, 0.25);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > time);
  assert.ok(state.tick > tick);

  assert.equal(api.act('pause').paused, true);
  assert.equal(api.act('dragDrop', {from: 0, to: 2}).ok, true);
  assert.equal(state.paused, true);
  assertOneHero(state, hero, 2, 'paused drag');
  assert.equal(api.act('resume').paused, false);

  const nextId = state.nextId;
  let from = 2;
  for (const to of [0, 1, 3, 4, 5, 6, 7, 8, 9, 2]) {
    const label = `${from}->${to}`;
    const moved = api.act('dragDrop', {from, to});
    assert.equal(moved.ok, true, `${label} ${moved.reason || ''}`);
    assert.equal(state.paused, false, `${label} clock`);
    assert.equal(state.slots[from].unit, null, `${label} source`);
    assertOneHero(state, hero, to, label);
    assert.equal(state.slots.filter(slot => slot.unit).length, 1, `${label} board`);
    assert.equal(state.nextId, nextId, `${label} nextId`);
    from = to;
  }

  const moved = api.act('move', {from: 2, to: 7});
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(state.slots[2].unit, null);
  assertOneHero(state, hero, 7, 'move action');
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
  assert.equal(state.nextId, nextId);
});

test('dropping the hero on another unit swaps cleanly and never duplicates or removes the hero', async () => {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('start', {seed: 11, difficulty: 'normal', runId: 'hero-drag-one-drop'}).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  assertOneHero(state, hero, 2, 'before drop');
  assert.equal(api.act('pause').paused, true);

  const tower = createUnit(state, 'bolt', 1, 'tower');
  const fire = createUnit(state, 'fire', 2, 'tower');
  state.slots[4].unit = tower;
  state.slots[8].unit = fire;
  const nextId = state.nextId;

  const ontoTower = api.act('dragDrop', {from: 2, to: 4});
  assert.equal(ontoTower.ok, true);
  assert.equal(ontoTower.swapped, true);
  assert.equal(state.slots[2].unit, tower);
  assertOneHero(state, hero, 4, 'hero onto tower');

  const ontoHero = api.act('dragDrop', {from: 2, to: 4});
  assert.equal(ontoHero.ok, true);
  assert.equal(ontoHero.swapped, true);
  assert.equal(state.slots[4].unit, tower);
  assertOneHero(state, hero, 2, 'tower onto hero');

  const ontoFire = api.act('dragDrop', {from: 2, to: 8});
  assert.equal(ontoFire.ok, true);
  assert.equal(ontoFire.swapped, true);
  assert.equal(state.slots[2].unit, fire);
  assertOneHero(state, hero, 8, 'hero onto fire');

  assert.equal(state.nextId, nextId);
  assert.equal(state.slots.filter(slot => slot.unit).length, 3);
});
