import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TYPES, createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES} from '../src/systems/hero.js';
import {draftXpCost, generateDraft, updateDrafts, chooseDraft, placePending} from '../src/systems/drafts.js';

function place(state, index, type) {
  state.slots[index].unit = createUnit(state, type, 1, 'tower');
}

function presentTypes(state) {
  const present = new Set();
  for (const slot of state.slots) {
    if (slot.unit && BASE_TYPES.includes(slot.unit.type)) present.add(slot.unit.type);
  }
  return present;
}

function cover(state, extra = []) {
  const types = BASE_TYPES.concat(extra);
  let index = 0;
  for (const type of types) {
    while (index < state.slots.length && state.slots[index].unit) index += 1;
    assert.ok(index < state.slots.length, 'no empty slot for coverage');
    place(state, index, type);
    index += 1;
  }
}

function offer(seed, extra = [], runId = `covered-${seed}`) {
  const state = createRun({seed, difficulty: 'normal', runId});
  cover(state, extra);
  return {state, options: generateDraft(state)};
}

function assertTrio(options, seed) {
  assert.equal(options.length, 3, `seed ${seed}`);
  assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
  const heroes = options.filter(card => card.kind === 'hero_upgrade');
  const towers = options.filter(card => card.kind === 'tower');
  assert.ok(heroes.length >= 1, `seed ${seed} offered no hero upgrade`);
  assert.equal(heroes.length + towers.length, 3, `seed ${seed}`);
  for (const card of heroes) {
    assert.equal(card.replace, false);
    assert.ok(HERO_UPGRADES[card.upgradeId], card.upgradeId);
  }
  for (const card of towers) {
    assert.equal(card.replace, false);
    assert.equal(card.rank, 1);
    assert.ok(BASE_TYPES.includes(card.type));
  }
  return {heroes, towers};
}

test('full type coverage with empty slots includes a hero upgrade', () => {
  for (let seed = 1; seed <= 48; seed += 1) {
    const {state, options} = offer(seed);
    assert.equal(presentTypes(state).size, BASE_TYPES.length);
    assert.ok(state.slots.some(slot => !slot.unit));
    assertTrio(options, seed);
  }
});

test('one empty slot on a covered board still offers a hero upgrade', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const {state, options} = offer(seed, ['bolt', 'fire'], `one-empty-${seed}`);
    assert.equal(presentTypes(state).size, BASE_TYPES.length);
    assert.equal(state.slots.filter(slot => !slot.unit).length, 1);
    assertTrio(options, seed);
  }
});

test('the same seed and covered board offer the same three cards', () => {
  const first = offer(11).options;
  const second = offer(11).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.ok(first.some(card => card.kind === 'hero_upgrade'));
  assert.deepEqual(offer(27, ['bolt']).options, offer(27, ['bolt']).options);
  const economy = createRun({seed: 11, difficulty: 'normal', runId: 'economy'});
  cover(economy);
  const xp = economy.xp;
  const next = economy.nextDraftXp;
  const level = economy.draftLevel;
  const board = economy.slots.map(slot => slot.unit ? slot.unit.type : null);
  generateDraft(economy);
  assert.equal(economy.xp, xp);
  assert.equal(economy.nextDraftXp, next);
  assert.equal(economy.draftLevel, level);
  assert.deepEqual(economy.slots.map(slot => slot.unit ? slot.unit.type : null), board);
});

test('coverage does not change the XP curve', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(draftXpCost), [8, 12, 16, 21, 26, 31]);
  const state = createRun({seed: 9, difficulty: 'normal', runId: 'curve'});
  cover(state);
  const cost = state.nextDraftXp;
  assert.equal(cost, draftXpCost(0));
  state.xp = cost + 3;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.xp, 3);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.ok(state.nextDraftXp > cost);
  assertTrio(state.draft.options, 9);
  const heroIndex = state.draft.options.findIndex(card => card.kind === 'hero_upgrade');
  const upgradeId = state.draft.options[heroIndex].upgradeId;
  assert.equal(chooseDraft(state, heroIndex).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  const hero = state.slots.find(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).unit;
  assert.equal(hero.upgrades[upgradeId], 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));

  const placed = createRun({seed: 14, difficulty: 'normal', runId: 'place-covered'});
  cover(placed);
  placed.xp = placed.nextDraftXp;
  assert.equal(updateDrafts(placed).ok, true);
  assert.equal(placed.nextDraftXp, draftXpCost(1));
  const index = placed.draft.options.findIndex(card => card.kind === 'tower' && card.replace !== true);
  assert.ok(index >= 0);
  const type = placed.draft.options[index].type;
  assert.equal(chooseDraft(placed, index).ok, true);
  const slot = placed.slots.findIndex(item => !item.unit);
  assert.equal(placePending(placed, slot).ok, true);
  assert.equal(placed.slots[slot].unit.type, type);
  assert.equal(placed.slots[slot].unit.rank, 1);
  assert.equal(placed.phase, 'playing');
});

test('a covered board with no remaining hero upgrade stays three towers', () => {
  const state = createRun({seed: 6, difficulty: 'normal', runId: 'capped-covered'});
  cover(state);
  const hero = state.slots.find(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).unit;
  hero.upgrades = {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) hero.upgrades[id] = spec.cap;
  const before = draftXpCost(0);
  const options = generateDraft(state);
  assert.equal(draftXpCost(0), before);
  assert.equal(options.length, 3);
  assert.equal(new Set(options.map(card => card.id)).size, 3);
  assert.equal(options.some(card => card.kind === 'hero_upgrade'), false);
  assert.ok(options.every(card => card.kind === 'tower' && card.replace !== true && card.rank === 1));
});

test('one remaining hero upgrade is one of the three cards', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const state = createRun({seed, difficulty: 'normal', runId: `reach-${seed}`});
    cover(state);
    const hero = state.slots.find(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).unit;
    hero.upgrades = {};
    for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
      if (id !== 'reach') hero.upgrades[id] = spec.cap;
    }
    assert.ok(state.slots.some(slot => !slot.unit));
    const options = generateDraft(state);
    assert.equal(options.length, 3, `seed ${seed}`);
    assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
    const heroes = options.filter(card => card.kind === 'hero_upgrade');
    assert.equal(heroes.length, 1, `seed ${seed}`);
    assert.equal(heroes[0].upgradeId, 'reach');
    assert.equal(heroes[0].replace, false);
    assert.equal(options.filter(card => card.kind === 'tower' && card.replace !== true).length, 2);
  }
});
