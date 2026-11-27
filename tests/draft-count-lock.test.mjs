// generateDraft stays at three different Gun Mod / Auto Skill cards, keeps the
// Gunner anchored on slot 2, and leaves the XP curve untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
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

function capMainUpgrades(state) {
  const hero = state.slots[2].unit;
  const upgrades = {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
    if (id !== 'overclock') upgrades[id] = spec.cap;
  }
  hero.upgrades = upgrades;
}

function assertThreeDifferentHeroCards(cards, label) {
  assert.ok(Array.isArray(cards), label);
  assert.equal(cards.length, 3, label);
  const ids = cards.map(card => {
    assert.ok(card && typeof card === 'object', label);
    assert.equal(card.kind, 'hero_upgrade', label);
    assert.equal(typeof card.id, 'string', label);
    assert.ok(HERO_UPGRADES[card.upgradeId], label);
    return card.id;
  });
  assert.equal(new Set(ids).size, 3, `${label} ids`);
}

function assertOneHeroOnSlot2(state, hero, label) {
  assert.deepEqual(heroIndexes(state), [2], label);
  assert.equal(state.slots[2].unit, hero, label);
  assert.equal(hero.kind, 'hero', label);
  assert.equal(hero.type, 'hero', label);
}

function assertCurveUntouched(state, label) {
  assert.equal(draftXpCost(0), 6, label);
  assert.equal(state.nextDraftXp, 6, label);
  assert.equal(state.draftLevel, 0, label);
  assert.equal(state.xp, 0, label);
}

test('generateDraft returns three unique Gun Mod / Auto Skill cards and keeps Gunner on slot 2', () => {
  assert.equal(new Set(SEEDS).size, 2);
  assert.deepEqual([0, 1, 2, 3, 4].map(draftXpCost), [6, 10, 14, 18, 22]);

  for (const seed of SEEDS) {
    const run = createRun({seed, difficulty: 'normal', runId: `draft-count-solo-${seed}`});
    const hero = run.slots[2].unit;
    assert.equal(run.slots.filter(slot => slot.unit).length, 1, `solo ${seed}`);
    assertOneHeroOnSlot2(run, hero, `solo ${seed} before`);
    const cards = generateDraft(run);
    assertThreeDifferentHeroCards(cards, `solo ${seed}`);
    assert.equal(run.slots.filter(slot => slot.unit).length, 1, `solo ${seed} board`);
    assertOneHeroOnSlot2(run, hero, `solo ${seed} after`);
    assertCurveUntouched(run, `solo ${seed} curve`);

    const capped = createRun({seed, difficulty: 'normal', runId: `draft-count-capped-${seed}`});
    capMainUpgrades(capped);
    const cappedHero = capped.slots[2].unit;
    const cappedCards = generateDraft(capped);
    assert.equal(cappedCards.length, 1, `capped ${seed}`);
    assert.equal(cappedCards[0].upgradeId, 'overclock', `capped ${seed}`);
    assertOneHeroOnSlot2(capped, cappedHero, `capped ${seed} after`);
    assertCurveUntouched(capped, `capped ${seed} curve`);
  }
});
