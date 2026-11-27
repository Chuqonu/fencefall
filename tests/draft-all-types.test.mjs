import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TYPES, createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES} from '../src/systems/hero.js';
import {draftXpCost, generateDraft, updateDrafts, chooseDraft} from '../src/systems/drafts.js';

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
    assert.ok(HERO_UPGRADES[card.upgradeId], card.upgradeId);
  }
  for (const card of towers) {
    assert.equal(card.action, 'upgrade');
    assert.equal(card.nextRank, 2);
    assert.ok(BASE_TYPES.includes(card.type));
  }
  return {heroes, towers};
}

test('full type coverage with empty slots includes hero upgrade and Lv.2 turret upgrades', () => {
  for (let seed = 1; seed <= 48; seed += 1) {
    const {state, options} = offer(seed);
    assert.equal(presentTypes(state).size, BASE_TYPES.length);
    assert.ok(state.slots.some(slot => !slot.unit));
    assertTrio(options, seed);
  }
});

test('the same seed and covered board offer the same three cards', () => {
  const first = offer(11).options;
  const second = offer(11).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.ok(first.some(card => card.kind === 'hero_upgrade'));
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

test('1-tap draft upgrades an existing turret directly to rank 2 without changing XP curve', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(draftXpCost), [6, 10, 14, 18, 22, 26]);
  const state = createRun({seed: 9, difficulty: 'normal', runId: 'curve'});
  cover(state);
  const cost = state.nextDraftXp;
  assert.equal(cost, draftXpCost(0));
  state.xp = cost + 3;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.xp, 3);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assertTrio(state.draft.options, 9);
  const heroIndex = state.draft.options.findIndex(card => card.kind === 'hero_upgrade');
  const upgradeId = state.draft.options[heroIndex].upgradeId;
  assert.equal(chooseDraft(state, heroIndex).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  const hero = state.slots.find(slot => slot.unit && slot.unit.kind === 'hero').unit;
  assert.equal(hero.upgrades[upgradeId], 1);

  const upgraded = createRun({seed: 14, difficulty: 'normal', runId: 'upgrade-covered'});
  cover(upgraded);
  upgraded.xp = upgraded.nextDraftXp;
  assert.equal(updateDrafts(upgraded).ok, true);
  const index = upgraded.draft.options.findIndex(card => card.kind === 'tower');
  assert.ok(index >= 0);
  const type = upgraded.draft.options[index].type;
  assert.equal(chooseDraft(upgraded, index).ok, true);
  assert.equal(upgraded.phase, 'playing');
  const targetSlot = upgraded.slots.find(slot => slot.unit && slot.unit.type === type);
  assert.equal(targetSlot.unit.rank, 2);
});

test('a covered board with no remaining hero upgrade offers three turret upgrades', () => {
  const state = createRun({seed: 6, difficulty: 'normal', runId: 'capped-covered'});
  cover(state);
  const hero = state.slots.find(slot => slot.unit && slot.unit.kind === 'hero').unit;
  hero.upgrades = {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) hero.upgrades[id] = spec.cap;
  const options = generateDraft(state);
  assert.equal(options.length, 3);
  assert.equal(new Set(options.map(card => card.id)).size, 3);
  assert.equal(options.some(card => card.kind === 'hero_upgrade'), false);
  assert.ok(options.every(card => card.kind === 'tower' && card.action === 'upgrade' && card.nextRank === 2));
});

test('one remaining hero upgrade is offered alongside turret upgrades', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const state = createRun({seed, difficulty: 'normal', runId: `reach-${seed}`});
    cover(state);
    const hero = state.slots.find(slot => slot.unit && slot.unit.kind === 'hero').unit;
    hero.upgrades = {};
    for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
      if (id !== 'volley') hero.upgrades[id] = spec.cap;
    }
    const options = generateDraft(state);
    assert.equal(options.length, 3, `seed ${seed}`);
    assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
    const heroes = options.filter(card => card.kind === 'hero_upgrade');
    assert.equal(heroes.length, 1, `seed ${seed}`);
    assert.equal(heroes[0].upgradeId, 'volley');
    assert.equal(options.filter(card => card.kind === 'tower').length, 2);
  }
});
