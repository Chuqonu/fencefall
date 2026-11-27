import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES, isAutoSkill} from '../src/systems/hero.js';
import {draftXpCost, generateDraft, updateDrafts, chooseDraft} from '../src/systems/drafts.js';

function offer(seed) {
  const state = createRun({seed, difficulty: 'normal', runId: `variety-${seed}`});
  return {state, options: generateDraft(state)};
}

test('every 3-of-1 draft mixes Auto Skills and Gun Mods with zero turrets and applies in 1 tap', () => {
  for (let seed = 1; seed <= 64; seed += 1) {
    const {options} = offer(seed);
    assert.equal(options.length, 3, `seed ${seed}`);
    assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
    assert.equal(options.some(card => card.kind === 'tower'), false, `seed ${seed} no turrets`);
    assert.ok(options.every(card => card.kind === 'hero_upgrade'), `seed ${seed}`);
    assert.ok(options.some(card => isAutoSkill(card.upgradeId)), `seed ${seed} has Auto Skill`);
    assert.ok(options.some(card => !isAutoSkill(card.upgradeId)), `seed ${seed} has Gun Mod`);
  }

  const state = createRun({seed: 10, difficulty: 'normal', runId: 'pick-skill'});
  const cost = state.nextDraftXp;
  state.xp = cost;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.draft.options.length, 3);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  const skillIndex = state.draft.options.findIndex(card => isAutoSkill(card.upgradeId));
  assert.ok(skillIndex >= 0);
  const pickedCard = state.draft.options[skillIndex];
  assert.equal(chooseDraft(state, skillIndex).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[2].unit.upgrades[pickedCard.upgradeId], 1);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
});

test('the same seed offers the exact same three Gun Mod / Auto Skill cards', () => {
  const first = offer(10).options;
  const second = offer(10).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  assert.deepEqual(offer(25).options, offer(25).options);
});

test('every offered card references a valid Gun Mod or Auto Skill below cap', () => {
  const state = createRun({seed: 18, difficulty: 'normal', runId: 'valid-caps'});
  state.slots[2].unit.upgrades.volley = HERO_UPGRADES.volley.cap;
  state.slots[2].unit.upgrades.napalm = HERO_UPGRADES.napalm.cap;
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.draft.options.length, 3);
  for (const card of state.draft.options) {
    assert.equal(card.kind, 'hero_upgrade');
    assert.ok(HERO_UPGRADES[card.upgradeId], card.upgradeId);
    assert.notEqual(card.upgradeId, 'volley');
    assert.notEqual(card.upgradeId, 'napalm');
  }
});
