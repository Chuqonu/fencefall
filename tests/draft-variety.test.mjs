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

function offer(seed, types) {
  const state = createRun({seed, difficulty: 'normal', runId: `variety-${seed}`});
  types.forEach((type, index) => place(state, index, type));
  return {state, options: generateDraft(state)};
}

test('two tower cards include a base type missing from the board and 1-tap auto-deploys it', () => {
  const early = ['bolt', 'fire'];
  for (let seed = 1; seed <= 64; seed += 1) {
    const {state, options} = offer(seed, early);
    assert.equal(options.length, 3, `seed ${seed}`);
    assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
    const towers = options.filter(card => card.kind === 'tower');
    const heroes = options.filter(card => card.kind === 'hero_upgrade');
    assert.ok(towers.length >= 1 && heroes.length >= 1, `seed ${seed}`);
    const present = presentTypes(state);
    if (towers.length >= 2) {
      assert.ok(
        towers.some(card => !present.has(card.type)),
        `seed ${seed} offered only owned types ${towers.map(card => card.type).join(',')}`
      );
    }
  }

  const state = createRun({seed: 10, difficulty: 'normal', runId: 'place-missing'});
  place(state, 0, 'bolt');
  place(state, 1, 'fire');
  const cost = state.nextDraftXp;
  state.xp = cost;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.draft.options.length, 3);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  const index = state.draft.options.findIndex(card => card.kind === 'tower');
  assert.ok(index >= 0);
  const pickedCard = state.draft.options[index];
  assert.equal(chooseDraft(state, index).ok, true);
  assert.equal(state.phase, 'playing');
  const unitSlot = state.slots.find(item => item.unit && item.unit.type === pickedCard.type);
  assert.ok(unitSlot);
  assert.equal(unitSlot.unit.rank, pickedCard.nextRank);
});

test('the same seed and the same board offer the same three cards', () => {
  const types = ['bolt', 'fire', 'frost'];
  const first = offer(10, types).options;
  const second = offer(10, types).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.deepEqual(offer(25, ['bolt', 'fire']).options, offer(25, ['bolt', 'fire']).options);
});

test('a full board with maxed towers offers three hero upgrades', () => {
  const state = createRun({seed: 18, difficulty: 'normal', runId: 'full-heroes'});
  for (let index = 0; index < state.slots.length; index += 1) {
    const unit = state.slots[index].unit;
    if (unit && unit.kind === 'hero') continue;
    state.slots[index].unit = createUnit(state, 'bolt', 4, 'tower');
  }
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.draft.options.length, 3);
  assert.ok(state.draft.options.every(card => card.kind === 'hero_upgrade'));
  for (const card of state.draft.options) {
    assert.ok(HERO_UPGRADES[card.upgradeId], card.upgradeId);
  }
});
