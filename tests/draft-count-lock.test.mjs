// generateDraft stays at three different cards on an empty board and a full board.
// A full board includes a tower only when that card says replace true.
// The hero stays one unit on slot 2. Opening a draft does not rewrite the XP curve.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES} from '../src/systems/hero.js';
import {draftXpCost, generateDraft} from '../src/systems/drafts.js';

const SEEDS = [11, 23];

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function heroIndexes(state) {
  const indexes = [];
  for (let index = 0; index < state.slots.length; index += 1) {
    if (isHero(state.slots[index].unit)) indexes.push(index);
  }
  return indexes;
}

function fillBoard(state) {
  for (let index = 0; index < state.slots.length; index += 1) {
    if (isHero(state.slots[index].unit)) continue;
    state.slots[index].unit = createUnit(state, 'bolt', 1, 'tower');
  }
}

function capHero(state) {
  const hero = state.slots[2].unit;
  const upgrades = {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) upgrades[id] = spec.cap;
  hero.upgrades = upgrades;
}

function cardSignature(card) {
  return [card.kind, card.type || '', card.upgradeId || '', card.replace === true].join(':');
}

function assertThreeDifferent(cards, label) {
  assert.ok(Array.isArray(cards), label);
  assert.equal(cards.length, 3, label);
  const ids = cards.map(card => {
    assert.ok(card && typeof card === 'object', label);
    assert.equal(typeof card.id, 'string', label);
    assert.ok(card.id, label);
    return card.id;
  });
  assert.equal(new Set(ids).size, 3, `${label} ids`);
  assert.equal(new Set(cards.map(cardSignature)).size, 3, `${label} offers`);
}

function assertOneHeroOnSlot2(state, hero, label) {
  assert.deepEqual(heroIndexes(state), [2], label);
  assert.equal(state.slots[2].unit, hero, label);
  assert.equal(hero.kind, 'hero', label);
  assert.equal(hero.type, 'hero', label);
  const units = state.slots.map(slot => slot.unit).filter(Boolean);
  assert.equal(units.filter(unit => unit.id === hero.id).length, 1, label);
}

function assertFullBoardCanPlace(cards, label) {
  for (const card of cards) {
    if (card.kind !== 'tower') continue;
    assert.equal(card.replace, true, `${label} ${card.id}`);
  }
}

function assertCurveUntouched(state, label) {
  assert.equal(draftXpCost(0), 6, label);
  assert.equal(state.nextDraftXp, 6, label);
  assert.equal(state.draftLevel, 0, label);
  assert.equal(state.xp, 0, label);
}

test('generateDraft returns three different cards on an empty board and a full board', () => {
  assert.equal(new Set(SEEDS).size, 2);
  assert.deepEqual([0, 1, 2, 3, 4].map(draftXpCost), [6, 10, 14, 18, 22]);

  for (const seed of SEEDS) {
    const empty = createRun({seed, difficulty: 'normal', runId: `draft-count-empty-${seed}`});
    const emptyHero = empty.slots[2].unit;
    assert.equal(empty.slots.filter(slot => slot.unit).length, 1, `empty ${seed}`);
    assertOneHeroOnSlot2(empty, emptyHero, `empty ${seed} before`);
    const emptyCards = generateDraft(empty);
    assertThreeDifferent(emptyCards, `empty ${seed}`);
    assert.equal(empty.slots.filter(slot => slot.unit).length, 1, `empty ${seed} board`);
    assertOneHeroOnSlot2(empty, emptyHero, `empty ${seed} after`);
    assertCurveUntouched(empty, `empty ${seed} curve`);

    const full = createRun({seed, difficulty: 'normal', runId: `draft-count-full-${seed}`});
    fillBoard(full);
    const fullHero = full.slots[2].unit;
    assert.equal(full.slots.filter(slot => slot.unit).length, 10, `full ${seed}`);
    assertOneHeroOnSlot2(full, fullHero, `full ${seed} before`);
    const fullCards = generateDraft(full);
    assertThreeDifferent(fullCards, `full ${seed}`);
    assertFullBoardCanPlace(fullCards, `full ${seed}`);
    assert.equal(full.slots.filter(slot => !slot.unit).length, 0, `full ${seed} board`);
    assertOneHeroOnSlot2(full, fullHero, `full ${seed} after`);
    assertCurveUntouched(full, `full ${seed} curve`);

    const capped = createRun({seed, difficulty: 'normal', runId: `draft-count-capped-${seed}`});
    fillBoard(capped);
    capHero(capped);
    const cappedHero = capped.slots[2].unit;
    assert.equal(capped.slots.filter(slot => !slot.unit).length, 0, `capped ${seed}`);
    assertOneHeroOnSlot2(capped, cappedHero, `capped ${seed} before`);
    const cappedCards = generateDraft(capped);
    assertThreeDifferent(cappedCards, `capped ${seed}`);
    assertFullBoardCanPlace(cappedCards, `capped ${seed}`);
    assert.ok(cappedCards.every(card => card.kind === 'tower' && card.replace === true), `capped ${seed}`);
    assert.equal(capped.slots.filter(slot => !slot.unit).length, 0, `capped ${seed} board`);
    assertOneHeroOnSlot2(capped, cappedHero, `capped ${seed} after`);
    assertCurveUntouched(capped, `capped ${seed} curve`);
  }
});
