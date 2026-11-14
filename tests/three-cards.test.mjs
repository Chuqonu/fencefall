import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {chooseDraft, updateDrafts} from '../src/systems/drafts.js';

const SEEDS = [1, 4, 9, 16, 25, 36, 49, 64];
const OPENS_PER_BOARD = 3;

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function emptySlots(state) {
  return state.slots.filter(slot => !slot.unit).length;
}

function fillBoard(state) {
  for (let index = 0; index < state.slots.length; index += 1) {
    if (isHero(state.slots[index].unit)) continue;
    state.slots[index].unit = createUnit(state, 'bolt', 1, 'tower');
  }
}

function openDraft(state, label) {
  state.phase = 'playing';
  state.draft = null;
  state.pendingUnit = null;
  state.paused = false;
  state.hiddenPaused = false;
  state.xp = state.nextDraftXp;
  const opened = updateDrafts(state);
  assert.equal(opened.ok, true, `${label}: ${opened.reason}`);
  assert.equal(state.phase, 'draft', label);
  const options = state.draft && state.draft.options;
  assert.ok(Array.isArray(options), label);
  assert.equal(options.length, 3, `${label} opened ${options && options.length} options`);
  assert.equal(new Set(options.map(card => card && card.id)).size, 3, label);
  return options;
}

function takeHeroUpgrade(state, label) {
  const index = state.draft.options.findIndex(card => card.kind === 'hero_upgrade');
  assert.ok(index >= 0, `${label} had no hero upgrade to keep the board`);
  const chosen = chooseDraft(state, index);
  assert.equal(chosen.ok, true, `${label}: ${chosen.reason}`);
  assert.equal(state.phase, 'playing', label);
  assert.equal(state.draft, null, label);
}

test('every opened draft has exactly three options on an empty board and a full board', () => {
  for (const seed of SEEDS) {
    const empty = createRun({seed, difficulty: 'normal', runId: `three-empty-${seed}`});
    assert.equal(empty.slots.filter(slot => slot.unit).length, 1, `seed ${seed} starts with the hero only`);
    assert.ok(emptySlots(empty) > 0, `seed ${seed}`);
    for (let opened = 1; opened <= OPENS_PER_BOARD; opened += 1) {
      const label = `empty seed ${seed} draft ${opened}`;
      openDraft(empty, label);
      assert.ok(emptySlots(empty) > 0, label);
      takeHeroUpgrade(empty, label);
      assert.equal(empty.slots.filter(slot => slot.unit && !isHero(slot.unit)).length, 0, label);
    }

    const full = createRun({seed, difficulty: 'normal', runId: `three-full-${seed}`});
    fillBoard(full);
    assert.equal(emptySlots(full), 0, `seed ${seed}`);
    assert.equal(full.slots.filter(slot => isHero(slot.unit)).length, 1, `seed ${seed}`);
    for (let opened = 1; opened <= OPENS_PER_BOARD; opened += 1) {
      const label = `full seed ${seed} draft ${opened}`;
      openDraft(full, label);
      assert.equal(emptySlots(full), 0, label);
      takeHeroUpgrade(full, label);
      assert.equal(emptySlots(full), 0, label);
    }
  }
});
