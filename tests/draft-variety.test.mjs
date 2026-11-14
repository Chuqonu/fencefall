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

function placeableTowers(options) {
  return options.filter(card => card.kind === 'tower' && card.replace !== true);
}

function offer(seed, types) {
  const state = createRun({seed, difficulty: 'normal', runId: `variety-${seed}`});
  types.forEach((type, index) => place(state, index, type));
  return {state, options: generateDraft(state)};
}

test('two tower cards include a base type missing from the board', () => {
  const early = ['bolt', 'fire'];
  let earlyPairs = 0;
  for (let seed = 1; seed <= 64; seed += 1) {
    const {state, options} = offer(seed, early);
    assert.equal(options.length, 3, `seed ${seed}`);
    assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
    const towers = placeableTowers(options);
    const heroes = options.filter(card => card.kind === 'hero_upgrade');
    assert.equal(towers.length, 2, `seed ${seed}`);
    assert.equal(heroes.length, 1, `seed ${seed}`);
    earlyPairs += 1;
    const present = presentTypes(state);
    assert.ok(BASE_TYPES.some(type => !present.has(type)));
    assert.ok(state.slots.some(slot => !slot.unit));
    assert.ok(
      towers.some(card => !present.has(card.type)),
      `seed ${seed} offered only owned types ${towers.map(card => card.type).join(',')}`
    );
    assert.ok(towers.every(card => card.rank === 1 && card.replace === false));
  }
  assert.equal(earlyPairs, 64);

  const crowded = ['bolt', 'fire', 'frost', 'lightning'];
  let crowdedPairs = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const {state, options} = offer(seed, crowded);
    assert.equal(options.length, 3);
    assert.equal(new Set(options.map(card => card.id)).size, 3);
    const towers = placeableTowers(options);
    if (towers.length < 2) continue;
    crowdedPairs += 1;
    const present = presentTypes(state);
    assert.ok(BASE_TYPES.some(type => !present.has(type)));
    assert.ok(state.slots.some(slot => !slot.unit));
    assert.ok(
      towers.some(card => !present.has(card.type)),
      `seed ${seed} offered only owned types ${towers.map(card => card.type).join(',')}`
    );
  }
  assert.ok(crowdedPairs > 0, 'expected some drafts to offer two towers while slots remain');

  const state = createRun({seed: 10, difficulty: 'normal', runId: 'place-missing'});
  place(state, 0, 'bolt');
  place(state, 1, 'fire');
  const cost = state.nextDraftXp;
  state.xp = cost;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.draft.options.length, 3);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.ok(state.nextDraftXp > cost);
  const index = state.draft.options.findIndex(card => card.kind === 'tower' && card.type !== 'bolt' && card.type !== 'fire');
  assert.ok(index >= 0);
  const missingType = state.draft.options[index].type;
  assert.equal(chooseDraft(state, index).ok, true);
  const slot = state.slots.findIndex(item => !item.unit);
  assert.equal(placePending(state, slot).ok, true);
  assert.equal(state.slots[slot].unit.type, missingType);
  assert.equal(state.slots[slot].unit.rank, 1);
});

test('the same seed and the same board offer the same three cards', () => {
  const types = ['bolt', 'fire', 'frost'];
  const first = offer(10, types).options;
  const second = offer(10, types).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.deepEqual(offer(25, ['bolt', 'fire']).options, offer(25, ['bolt', 'fire']).options);
  assert.deepEqual(offer(17, ['bolt', 'fire', 'frost', 'lightning']).options, offer(17, ['bolt', 'fire', 'frost', 'lightning']).options);
});

test('a full board with hero upgrades offers hero cards', () => {
  const state = createRun({seed: 18, difficulty: 'normal', runId: 'full-heroes'});
  for (let index = 0; index < state.slots.length; index += 1) {
    const unit = state.slots[index].unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) continue;
    place(state, index, 'bolt');
  }
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
  const present = presentTypes(state);
  assert.deepEqual([...present], ['bolt']);
  const before = draftXpCost(0);
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(draftXpCost(0), before);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.equal(state.draft.options.length, 3);
  assert.ok(state.draft.options.every(card => card.kind === 'hero_upgrade' && card.replace !== true));
  assert.equal(state.draft.options.some(card => card.kind === 'tower'), false);
  for (const card of state.draft.options) {
    assert.ok(HERO_UPGRADES[card.upgradeId], card.upgradeId);
  }
  const again = createRun({seed: 41, difficulty: 'normal', runId: 'full-again'});
  for (let index = 0; index < again.slots.length; index += 1) {
    const unit = again.slots[index].unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) continue;
    place(again, index, 'fire');
  }
  const heroOffer = generateDraft(again);
  assert.equal(heroOffer.length, 3);
  assert.ok(heroOffer.every(card => card.kind === 'hero_upgrade'));
  assert.equal(heroOffer.some(card => card.kind === 'tower'), false);
});
