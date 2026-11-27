import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES, isAutoSkill} from '../src/systems/hero.js';
import {draftXpCost, generateDraft, updateDrafts, chooseDraft} from '../src/systems/drafts.js';

function offer(seed, runId = `solo-draft-${seed}`) {
  const state = createRun({seed, difficulty: 'normal', runId});
  return {state, options: generateDraft(state)};
}

function assertSoloTrio(options, seed) {
  assert.equal(options.length, 3, `seed ${seed}`);
  assert.equal(new Set(options.map(card => card.id)).size, 3, `seed ${seed}`);
  assert.equal(options.some(card => card.kind === 'tower'), false, `seed ${seed} must never offer turrets`);
  assert.ok(options.every(card => card.kind === 'hero_upgrade' && HERO_UPGRADES[card.upgradeId]), `seed ${seed}`);
  assert.ok(options.some(card => isAutoSkill(card.upgradeId)), `seed ${seed} includes at least 1 Auto Skill`);
  assert.ok(options.some(card => !isAutoSkill(card.upgradeId)), `seed ${seed} includes at least 1 Gun Mod`);
}

test('solo-gunner drafts always offer 3 unique Gun Mod + Auto Skill cards with zero turrets', () => {
  for (let seed = 1; seed <= 48; seed += 1) {
    const {options} = offer(seed);
    assertSoloTrio(options, seed);
  }
});

test('the same seed offers the same three Gun Mod / Auto Skill cards without mutating economy', () => {
  const first = offer(11).options;
  const second = offer(11).options;
  assert.deepEqual(second, first);
  assert.equal(first.length, 3);
  const economy = createRun({seed: 11, difficulty: 'normal', runId: 'economy'});
  const xp = economy.xp;
  const next = economy.nextDraftXp;
  const level = economy.draftLevel;
  generateDraft(economy);
  assert.equal(economy.xp, xp);
  assert.equal(economy.nextDraftXp, next);
  assert.equal(economy.draftLevel, level);
});

test('1-tap draft upgrades the center gunner directly without changing XP curve', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(draftXpCost), [6, 10, 14, 18, 22, 26]);
  const state = createRun({seed: 9, difficulty: 'normal', runId: 'curve'});
  const cost = state.nextDraftXp;
  assert.equal(cost, draftXpCost(0));
  state.xp = cost + 3;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.xp, 3);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assertSoloTrio(state.draft.options, 9);
  const upgradeId = state.draft.options[0].upgradeId;
  assert.equal(chooseDraft(state, 0).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  const hero = state.slots[2].unit;
  assert.equal(hero.upgrades[upgradeId], 1);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
});

test('when main upgrades are maxed out, drafts fall back cleanly to repeatable Firepower Overclock', () => {
  const state = createRun({seed: 6, difficulty: 'normal', runId: 'capped-main'});
  const hero = state.slots[2].unit;
  hero.upgrades = {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
    if (id !== 'overclock') hero.upgrades[id] = spec.cap;
  }
  const options = generateDraft(state);
  assert.equal(options.length, 1);
  assert.equal(options[0].kind, 'hero_upgrade');
  assert.equal(options[0].upgradeId, 'overclock');

  // With 1 main upgrade left + overclock, both are offered with zero turrets
  delete hero.upgrades.volley;
  const pair = generateDraft(state);
  assert.equal(pair.length, 2);
  assert.ok(pair.some(c => c.upgradeId === 'volley'));
  assert.ok(pair.some(c => c.upgradeId === 'overclock'));
  assert.equal(pair.some(c => c.kind === 'tower'), false);
});
