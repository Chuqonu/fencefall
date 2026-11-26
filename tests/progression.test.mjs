import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTRACT_VERSION, BASE_TYPES, DIFFICULTIES, clone, createUnit} from '../src/shared.js';
import {createProfile, createRun} from '../src/state.js';
import {simulate} from '../src/engine.js';
import {RECIPES, findRecipe} from '../src/data/recipes.js';
import {previewMerge, mergeUnits} from '../src/systems/merges.js';
import {HERO_BASE, HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';
import {draftXpCost, updateDrafts, chooseDraft, placePending, cancelPlacement} from '../src/systems/drafts.js';
import {
  EQUIPMENT,
  PERMANENT_UPGRADES,
  getProfileBonuses,
  buyEquipment,
  equipItem,
  purchasePermanent,
  settleRun
} from '../src/systems/progression.js';
import {
  PROFILE_KEY,
  RUN_KEY,
  SAVE_FORMAT,
  loadProfile,
  saveProfile,
  loadRun,
  saveRun,
  clearRun,
  exportSave,
  importSave
} from '../src/storage.js';

const STATS = {time: 250, kills: 40, wave: 10};
let paySeq = 0;

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

function board(seed, runId) {
  const state = createRun({seed, difficulty: 'normal', runId});
  state.paused = true;
  return state;
}

function put(state, index, type, rank = 1, kind = 'tower') {
  state.slots[index].unit = createUnit(state, type, rank, kind);
  return state.slots[index].unit;
}

function heroOf(state) {
  return state.slots.find(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).unit;
}

function fill(state, type = 'bolt') {
  for (let index = 0; index < state.slots.length; index += 1) {
    const unit = state.slots[index].unit;
    if (unit && (unit.kind === 'hero' || unit.type === 'hero')) continue;
    put(state, index, type, 1, 'tower');
  }
}

function capHero(state, exceptId) {
  const hero = heroOf(state);
  hero.upgrades = hero.upgrades && typeof hero.upgrades === 'object' ? hero.upgrades : {};
  for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
    if (id === exceptId) delete hero.upgrades[id];
    else hero.upgrades[id] = spec.cap;
  }
  return hero;
}

function slotIds(state) {
  return state.slots.map(slot => slot.unit?.id ?? null);
}

function openDraft(state, extraXp = 0) {
  state.phase = 'playing';
  state.draft = null;
  state.pendingUnit = null;
  state.xp = state.nextDraftXp + extraXp;
  const opened = updateDrafts(state);
  assert.equal(opened.ok, true, opened.reason);
  return opened;
}

function assertOptions(state) {
  const options = state.draft && state.draft.options;
  assert.ok(Array.isArray(options));
  assert.equal(options.length, 3);
  assert.equal(new Set(options.map(card => card.id)).size, 3);
  const empty = state.slots.some(slot => !slot.unit);
  const hero = heroOf(state);
  for (const card of options) {
    if (card.kind === 'hero_upgrade') {
      const spec = HERO_UPGRADES[card.upgradeId];
      assert.ok(spec, card.upgradeId);
      const level = Number(hero.upgrades?.[card.upgradeId] || 0);
      assert.ok(level < spec.cap, card.upgradeId);
      assert.notEqual(card.replace, true);
    } else {
      assert.equal(card.kind, 'tower');
      assert.ok(BASE_TYPES.includes(card.type), card.type);
      assert.equal(card.rank, 1);
      assert.equal(card.replace, !empty);
    }
  }
}

function rejectMerge(state, from, to, reason) {
  const before = JSON.stringify(state);
  const preview = previewMerge(state, from, to);
  const applied = mergeUnits(state, from, to);
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, reason);
  assert.equal(typeof preview.description?.en, 'string');
  assert.equal(typeof preview.description?.zh, 'string');
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, reason);
  assert.equal(JSON.stringify(state), before);
}

function award(difficulty, phase, progress, profile = createProfile()) {
  paySeq += 1;
  const state = createRun({
    seed: 1000 + paySeq,
    difficulty,
    profile,
    runId: `pay-${paySeq}`
  });
  state.phase = phase;
  state.time = progress.time;
  state.kills = progress.kills;
  state.wave = progress.wave;
  return {profile, state, settlement: settleRun(profile, state)};
}

test('same-type merges raise rank by one and stop at rank 4', () => {
  const state = board(2, 'same-type');
  const source = put(state, 0, 'support', 3);
  const target = put(state, 1, 'support', 3);
  const nextId = state.nextId;
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.ok, true);
  assert.equal(preview.result.id, 'preview');
  assert.equal(preview.result.kind, 'tower');
  assert.equal(preview.result.type, 'support');
  assert.equal(preview.result.rank, 4);
  assert.equal(state.nextId, nextId);
  const merged = mergeUnits(state, 0, 1);
  assert.equal(merged.ok, true);
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.slots[1].unit.rank, 4);
  assert.equal(state.slots[1].unit.kind, 'tower');
  assert.equal(state.slots[1].unit.type, 'support');
  assert.notEqual(merged.unit.id, 'preview');
  assert.notEqual(merged.unit.id, source.id);
  assert.notEqual(merged.unit.id, target.id);
  assert.equal(state.nextId, nextId + 1);
  assert.equal(state.stats.merges, 1);
  assert.equal(state.events.at(-1).type, 'merge');
  assert.equal(state.events.at(-1).rank, 4);
  assert.equal(state.events.at(-1).towerType, 'support');
  put(state, 0, 'support', 4);
  const capped = JSON.stringify(state);
  assert.equal(mergeUnits(state, 0, 1).reason, 'rank_cap');
  assert.equal(previewMerge(state, 0, 1).reason, 'rank_cap');
  assert.equal(JSON.stringify(state), capped);
});

test('mixed base types keep their rank and become the matching recipe', () => {
  assert.ok(RECIPES.length >= 8);
  const signatures = RECIPES.map(recipe => [...recipe.stats.mechanics].sort().join('+'));
  assert.equal(new Set(signatures).size, signatures.length);
  assert.equal(findRecipe('fire', 'bolt').id, 'cinderbolt');
  assert.equal(findRecipe('bolt', 'frost').id, 'hailspike');
  assert.notEqual(
    findRecipe('bolt', 'fire').stats.mechanics.join('+'),
    findRecipe('bolt', 'frost').stats.mechanics.join('+')
  );
  const catalog = JSON.stringify(RECIPES);
  for (const [index, [fromType, toType]] of [['bolt', 'fire'], ['fire', 'bolt']].entries()) {
    const state = board(30 + index, `mix-${index}`);
    put(state, 0, fromType, 2);
    put(state, 1, toType, 2);
    const preview = previewMerge(state, 0, 1);
    assert.equal(preview.ok, true);
    assert.equal(preview.result.type, 'cinderbolt');
    assert.equal(preview.result.kind, 'hybrid');
    assert.equal(preview.result.rank, 2);
    assert.notEqual(preview.description.en, preview.description.zh);
    const merged = mergeUnits(state, 0, 1);
    assert.equal(merged.ok, true);
    assert.equal(merged.unit.type, 'cinderbolt');
    assert.equal(merged.unit.kind, 'hybrid');
    assert.equal(merged.unit.rank, 2);
    assert.equal(state.slots[0].unit, null);
    assert.equal(state.slots[1].unit, merged.unit);
    assert.equal(state.stats.merges, 1);
    assert.deepEqual([...state.events.at(-1).parents].sort(), ['bolt', 'fire']);
  }
  assert.equal(JSON.stringify(RECIPES), catalog);
});

test('previewMerge does not allocate ids or mutate the run', () => {
  const state = board(3, 'preview');
  put(state, 0, 'bolt', 2);
  put(state, 1, 'fire', 2);
  const before = JSON.stringify(state);
  const preview = previewMerge(state, 1, 0);
  assert.equal(preview.ok, true);
  assert.equal(preview.result.id, 'preview');
  assert.equal(preview.result.type, 'cinderbolt');
  assert.equal(preview.result.kind, 'hybrid');
  assert.equal(preview.result.rank, 2);
  assert.notEqual(preview.result, state.slots[0].unit);
  assert.notEqual(preview.result, state.slots[1].unit);
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.slots[0].unit.type, 'bolt');
  assert.equal(state.slots[1].unit.type, 'fire');
  assert.equal(state.stats.merges, 0);
  assert.equal(state.events.length, 0);
});

test('illegal merges protect the hero and reject unequal or impossible pairs', () => {
  const state = board(4, 'illegal');
  put(state, 0, 'bolt', 1);
  put(state, 1, 'bolt', 2);
  put(state, 6, 'fire', 3);
  rejectMerge(state, 0, 1, 'rank_mismatch');
  rejectMerge(state, 0, 6, 'rank_mismatch');
  rejectMerge(state, 0, 2, 'hero_protected');
  rejectMerge(state, 2, 1, 'hero_protected');
  rejectMerge(state, 0, 0, 'same_slot');
  rejectMerge(state, 0, 5, 'empty_slot');
  rejectMerge(state, -1, 0, 'invalid_slot');
  rejectMerge(state, 0, 10, 'invalid_slot');
  assert.equal(state.stats.merges, 0);
  assert.equal(heroOf(state).type, 'hero');
  put(state, 3, 'poison', 4);
  put(state, 4, 'support', 4);
  const merged = mergeUnits(state, 4, 3);
  assert.equal(merged.ok, true);
  assert.equal(merged.unit.type, findRecipe('poison', 'support').id);
  assert.equal(merged.unit.kind, 'hybrid');
  assert.equal(merged.unit.rank, 4);
  assert.equal(state.slots[4].unit, null);
  assert.equal(state.slots[3].unit.rank, 4);
  assert.equal(state.stats.merges, 1);
});

test('a merge during play does not stop time, and pause or a draft still allow one', () => {
  const state = createRun({seed: 6, difficulty: 'normal', runId: 'planning'});
  put(state, 0, 'bolt', 1);
  put(state, 1, 'bolt', 1);
  state.nextDraftXp = 1e9;
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  state.hiddenPaused = true;
  assert.equal(previewMerge(state, 0, 1).reason, 'not_planning');
  assert.equal(mergeUnits(state, 0, 1).reason, 'not_planning');
  assert.equal(state.slots[0].unit.rank, 1);
  assert.equal(state.slots[1].unit.rank, 1);
  state.hiddenPaused = false;
  const time = state.time;
  const tick = state.tick;
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.ok, true);
  const merged = mergeUnits(state, 0, 1);
  assert.equal(merged.ok, true);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[1].unit.rank, 2);
  assert.equal(state.slots[1].unit.type, 'bolt');
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.stats.merges, 1);
  simulate(state, 0.5);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.ok(state.time > time);
  assert.ok(state.tick > tick);

  state.paused = true;
  state.phase = 'placing';
  put(state, 0, 'bolt', 2);
  assert.equal(mergeUnits(state, 0, 1).reason, 'not_planning');
  assert.equal(state.slots[0].unit.rank, 2);
  assert.equal(state.slots[1].unit.rank, 2);
  state.phase = 'defeat';
  assert.equal(previewMerge(state, 0, 1).reason, 'not_planning');
  state.phase = 'draft';
  state.paused = false;
  const drafted = mergeUnits(state, 0, 1);
  assert.equal(drafted.ok, true);
  assert.equal(state.phase, 'draft');
  assert.equal(state.paused, false);
  assert.equal(state.slots[1].unit.rank, 3);
  assert.equal(state.slots[0].unit, null);
  const frozen = state.time;
  const frozenTick = state.tick;
  simulate(state, 0.5);
  assert.equal(state.phase, 'draft');
  assert.equal(state.time, frozen);
  assert.equal(state.tick, frozenTick);
});

test('identical hybrids rank up and different hybrids stay put', () => {
  const state = board(8, 'hybrids');
  put(state, 0, 'cinderbolt', 2, 'hybrid');
  put(state, 1, 'cinderbolt', 2, 'hybrid');
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.result.kind, 'hybrid');
  assert.equal(preview.result.type, 'cinderbolt');
  assert.equal(preview.result.rank, 3);
  assert.equal(preview.result.id, 'preview');
  const merged = mergeUnits(state, 0, 1);
  assert.equal(merged.ok, true);
  assert.equal(merged.unit.rank, 3);
  assert.equal(merged.unit.kind, 'hybrid');
  assert.equal(state.slots[0].unit, null);
  assert.equal(state.stats.merges, 1);
  put(state, 6, 'hailspike', 3, 'hybrid');
  rejectMerge(state, 6, 1, 'hybrid_locked');
  put(state, 3, 'cinderbolt', 2, 'hybrid');
  rejectMerge(state, 3, 1, 'rank_mismatch');
  put(state, 4, 'cinderbolt', 4, 'hybrid');
  put(state, 5, 'cinderbolt', 4, 'hybrid');
  rejectMerge(state, 4, 5, 'rank_cap');
  assert.equal(state.slots[4].unit.rank, 4);
  assert.equal(state.slots[5].unit.rank, 4);
  assert.equal(state.stats.merges, 1);
});

test('opening a draft spends the threshold once and offers exactly three choices', () => {
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'three-choices'});
  state.paused = false;
  state.hiddenPaused = true;
  assert.equal(updateDrafts(state).reason, 'not_ready');
  const cost = state.nextDraftXp;
  state.xp = cost + 2;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.phase, 'draft');
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, true);
  assert.equal(state.xp, 2);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.ok(state.nextDraftXp > cost);
  assertOptions(state);
  const options = clone(state.draft.options);
  assert.equal(updateDrafts(state).reason, 'not_playing');
  state.phase = 'playing';
  assert.equal(updateDrafts(state).reason, 'busy');
  state.phase = 'draft';
  assert.equal(chooseDraft(state, -1).reason, 'bad_index');
  assert.equal(chooseDraft(state, 3).reason, 'bad_index');
  assert.equal(state.phase, 'draft');
  assert.equal(state.xp, 2);
  assert.deepEqual(state.draft.options, options);
});

test('a full board with open hero upgrades offers three hero cards', () => {
  const state = createRun({seed: 18, difficulty: 'normal', runId: 'full-heroes'});
  fill(state);
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
  const ids = slotIds(state);
  openDraft(state);
  assertOptions(state);
  assert.ok(state.draft.options.every(card => card.kind === 'hero_upgrade'));
  const hero = heroOf(state);
  const before = getHeroStats(hero, state);
  const chosen = state.draft.options[0].upgradeId;
  const xp = state.xp;
  const level = state.draftLevel;
  assert.equal(chooseDraft(state, 0).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  assert.equal(hero.upgrades[chosen], 1);
  assert.equal(Object.keys(hero.upgrades).length, 1);
  assert.equal(state.xp, xp);
  assert.equal(state.draftLevel, level);
  assert.deepEqual(slotIds(state), ids);
  assert.notDeepEqual(getHeroStats(hero, state), before);
  assert.equal(chooseDraft(state, 0).reason, 'no_draft');
  assert.equal(hero.upgrades[chosen], 1);
});

test('a full board with one upgrade left keeps that card and replace cards', () => {
  const state = createRun({seed: 19, difficulty: 'normal', runId: 'one-left'});
  capHero(state, 'volley');
  fill(state);
  const ids = slotIds(state);
  openDraft(state);
  assertOptions(state);
  const heroes = state.draft.options.filter(card => card.kind === 'hero_upgrade');
  const towers = state.draft.options.filter(card => card.kind === 'tower');
  assert.equal(heroes.length, 1);
  assert.equal(heroes[0].upgradeId, 'volley');
  assert.equal(towers.length, 2);
  assert.ok(towers.every(card => card.replace === true));
  const saved = clone(state.draft.options);
  const towerIndex = state.draft.options.findIndex(card => card.kind === 'tower');
  assert.equal(chooseDraft(state, towerIndex).ok, true);
  assert.equal(placePending(state, 2, {replace: true}).reason, 'hero_protected');
  assert.equal(state.phase, 'placing');
  assert.deepEqual(slotIds(state), ids);
  assert.equal(cancelPlacement(state).ok, true);
  assert.equal(state.phase, 'draft');
  assert.equal(state.pendingUnit, null);
  assert.deepEqual(state.draft.options, saved);
  assert.deepEqual(slotIds(state), ids);
  assert.equal(heroOf(state).kind, 'hero');
});

test('a fully capped board falls back to three replace cards', () => {
  const state = createRun({seed: 20, difficulty: 'normal', runId: 'all-capped'});
  capHero(state);
  fill(state);
  const before = slotIds(state);
  openDraft(state);
  assertOptions(state);
  assert.ok(state.draft.options.every(card => card.kind === 'tower' && card.replace === true));
  assert.equal(new Set(state.draft.options.map(card => card.type)).size, 3);
  const card = state.draft.options[0];
  assert.equal(chooseDraft(state, 0).ok, true);
  assert.equal(placePending(state, 2, {replace: true}).reason, 'hero_protected');
  assert.equal(state.slots[2].unit.id, before[2]);
  assert.equal(placePending(state, 0, {replace: false}).reason, 'occupied');
  assert.equal(state.slots[0].unit.id, before[0]);
  assert.equal(placePending(state, 0, {replace: true}).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  assert.equal(state.slots[0].unit.type, card.type);
  assert.equal(state.slots[0].unit.rank, 1);
  assert.notEqual(state.slots[0].unit.id, before[0]);
  assert.equal(state.slots[2].unit.kind, 'hero');
  assert.equal(state.slots.filter(slot => slot.unit).length, 10);
});

test('cancelling placement keeps the offer and does not grant a second tower', () => {
  const state = createRun({seed: 21, difficulty: 'normal', runId: 'cancel-place'});
  const heroId = heroOf(state).id;
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.xp, 0);
  const options = clone(state.draft.options);
  const towerIndex = options.findIndex(card => card.kind === 'tower');
  assert.ok(towerIndex >= 0);
  const xp = state.xp;
  const level = state.draftLevel;
  const rng = state.rng;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal(chooseDraft(state, towerIndex).ok, true);
    assert.equal(state.phase, 'placing');
    assert.deepEqual(state.draft.options, options);
    assert.equal(placePending(state, 2).reason, 'hero_protected');
    assert.equal(state.slots[2].unit.id, heroId);
    assert.equal(state.slots.filter(slot => slot.unit?.kind === 'tower').length, 0);
    assert.equal(chooseDraft(state, (towerIndex + 1) % 3).reason, 'already_placing');
    assert.equal(cancelPlacement(state).ok, true);
    assert.equal(state.phase, 'draft');
    assert.equal(state.pendingUnit, null);
    assert.deepEqual(state.draft.options, options);
    assert.equal(state.xp, xp);
    assert.equal(state.draftLevel, level);
    assert.equal(state.rng, rng);
  }
  assert.equal(chooseDraft(state, towerIndex).ok, true);
  const slot = state.slots.findIndex(item => !item.unit);
  assert.equal(placePending(state, slot).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  assert.equal(state.slots.filter(item => item.unit?.kind === 'tower').length, 1);
  assert.equal(state.slots[slot].unit.type, options[towerIndex].type);
  assert.equal(state.slots[slot].unit.rank, 1);
  assert.equal(state.slots[2].unit.id, heroId);
  assert.equal(state.xp, xp);
  assert.equal(updateDrafts(state).reason, 'not_ready');
  assert.equal(placePending(state, slot).reason, 'not_placing');
  assert.equal(state.slots.filter(item => item.unit?.kind === 'tower').length, 1);
});

test('hero upgrades stop at their caps and a capped card is not applied', () => {
  const state = createRun({seed: 12, difficulty: 'normal', runId: 'hero-caps'});
  const hero = heroOf(state);
  const untouched = JSON.stringify(state);
  assert.equal(applyHeroUpgrade(state, 'nope').reason, 'unknown_upgrade');
  assert.equal(JSON.stringify(state), untouched);
  const base = getHeroStats(hero, state);
  for (let i = 0; i < HERO_UPGRADES.strike.cap; i += 1) assert.equal(applyHeroUpgrade(state, 'strike').ok, true);
  assert.equal(applyHeroUpgrade(state, 'strike').reason, 'upgrade_capped');
  assert.equal(hero.upgrades.strike, HERO_UPGRADES.strike.cap);
  assert.equal(getHeroStats(hero, state).damage, base.damage + HERO_UPGRADES.strike.effect.damageAdd * HERO_UPGRADES.strike.cap);
  assert.deepEqual(getHeroStats(hero, state), getHeroStats(hero, state));
  for (let i = 0; i < HERO_UPGRADES.pierce.cap; i += 1) assert.equal(applyHeroUpgrade(state, 'pierce').ok, true);
  assert.equal(applyHeroUpgrade(state, 'pierce').reason, 'upgrade_capped');
  assert.equal(getHeroStats(hero, state).pierce, HERO_BASE.pierce + HERO_UPGRADES.pierce.cap);
  capHero(state);
  openDraft(state);
  assertOptions(state);
  assert.ok(state.draft.options.every(card => card.kind === 'tower' && card.upgradeId == null));
  const level = hero.upgrades.strike;
  const xp = state.xp;
  const slots = JSON.stringify(state.slots);
  state.draft.options[0] = {id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike', replace: false};
  const rejected = chooseDraft(state, 0);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'upgrade_capped');
  assert.equal(hero.upgrades.strike, level);
  assert.equal(state.xp, xp);
  assert.equal(state.phase, 'draft');
  assert.equal(JSON.stringify(state.slots), slots);
});

test('equipment and permanent purchases charge catalog prices and apply only when equipped', () => {
  assert.deepEqual([...new Set(Object.values(EQUIPMENT).map(item => item.slot))].sort(), ['armor', 'charm', 'weapon']);
  for (const item of Object.values(EQUIPMENT)) {
    assert.equal(typeof item.name.en, 'string');
    assert.equal(typeof item.name.zh, 'string');
    assert.ok(Number.isInteger(item.cost) && item.cost > 0);
  }
  for (const spec of Object.values(PERMANENT_UPGRADES)) {
    assert.equal(spec.cap, spec.costs.length);
    assert.equal(spec.cost, spec.costs[0]);
    for (let i = 1; i < spec.costs.length; i += 1) assert.ok(spec.costs[i] > spec.costs[i - 1]);
  }
  assert.equal(EQUIPMENT.splinter_bow.cost, 60);
  assert.equal(EQUIPMENT.splinter_bow.bonuses.damage, 0.06);
  assert.equal(EQUIPMENT.kinetic_core.cost, 150);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.damage, 0.05);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.critChance, 0.04);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.critKnockback, 8);
  assert.equal(EQUIPMENT.fence_nails.cost, 50);
  assert.equal(EQUIPMENT.fence_nails.bonuses.fence, 40);
  assert.equal(EQUIPMENT.bounty_seal.cost, 260);
  assert.equal(EQUIPMENT.bounty_seal.bonuses.reward, 0.15);
  assert.deepEqual(PERMANENT_UPGRADES.damage.costs, [40, 70, 110, 170, 240]);
  assert.equal(PERMANENT_UPGRADES.damage.bonuses.damage, 0.03);

  const stray = createProfile();
  stray.equipped.weapon = 'splinter_bow';
  assert.equal(getProfileBonuses(stray).damage, 0);

  const profile = createProfile();
  profile.currency = EQUIPMENT.splinter_bow.cost - 1;
  assert.equal(buyEquipment(profile, 'splinter_bow').reason, 'insufficientCurrency');
  assert.equal(profile.currency, 59);
  assert.deepEqual(profile.equipmentOwned, []);
  assert.equal(equipItem(profile, 'splinter_bow').reason, 'notOwned');
  assert.equal(buyEquipment(profile, 'missing-gear').reason, 'unknownItem');
  assert.equal(purchasePermanent(profile, 'missing-track').reason, 'unknownUpgrade');

  const total = EQUIPMENT.splinter_bow.cost + EQUIPMENT.kinetic_core.cost + EQUIPMENT.fence_nails.cost + PERMANENT_UPGRADES.damage.costs[0];
  profile.currency = total;
  assert.equal(buyEquipment(profile, 'splinter_bow').ok, true);
  assert.equal(profile.currency, total - 60);
  assert.equal(profile.equipped.weapon, null);
  assert.deepEqual(getProfileBonuses(profile), {damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0});
  assert.equal(equipItem(profile, 'splinter_bow').ok, true);
  assert.equal(getProfileBonuses(profile).damage, 0.06);
  assert.equal(buyEquipment(profile, 'kinetic_core').ok, true);
  assert.equal(equipItem(profile, 'kinetic_core').ok, true);
  assert.equal(profile.equipped.weapon, 'kinetic_core');
  assert.ok(profile.equipmentOwned.includes('splinter_bow'));
  assert.equal(buyEquipment(profile, 'fence_nails').ok, true);
  assert.equal(equipItem(profile, 'fence_nails').ok, true);
  assert.equal(profile.equipped.armor, 'fence_nails');
  assert.equal(purchasePermanent(profile, 'damage').ok, true);
  assert.equal(profile.permanent.damage, 1);
  assert.equal(profile.currency, 0);
  assert.deepEqual(getProfileBonuses(profile), {
    damage: 0.08,
    haste: 0,
    range: 0,
    critChance: 0.04,
    fence: 40, fieldHp: 0.15, critKnockback: 8,
    reward: 0
  });
  const geared = createRun({seed: 70, difficulty: 'normal', profile, runId: 'gear-hero'});
  const stats = getHeroStats(geared.slots[2].unit, geared);
  assert.equal(stats.damage, Number((HERO_BASE.damage * 1.08).toFixed(4)));
  assert.equal(stats.range, HERO_BASE.range);
  assert.equal(stats.critChance, 0.12);
  assert.equal(buyEquipment(profile, 'splinter_bow').reason, 'alreadyOwned');
  assert.equal(purchasePermanent(profile, 'damage').reason, 'insufficientCurrency');
  assert.equal(profile.permanent.damage, 1);
  profile.currency = 500;
  profile.permanent.damage = PERMANENT_UPGRADES.damage.cap;
  assert.equal(purchasePermanent(profile, 'damage').reason, 'maxLevel');
  assert.equal(profile.currency, 500);
  assert.equal(profile.permanent.damage, 5);
});

test('settlement scales with difficulty and pays a run only once', () => {
  assert.equal(DIFFICULTIES.easy.reward, 1);
  assert.equal(DIFFICULTIES.normal.reward, 1.4);
  assert.equal(DIFFICULTIES.hard.reward, 1.9);
  assert.equal(DIFFICULTIES.nightmare.reward, 2.5);

  const easy = award('easy', 'victory', STATS);
  const normal = award('normal', 'victory', STATS);
  const hard = award('hard', 'victory', STATS);
  const nightmare = award('nightmare', 'victory', STATS);
  assert.equal(easy.settlement.result, 'victory');
  assert.equal(easy.settlement.currency, 53);
  assert.equal(normal.settlement.currency, 74);
  assert.equal(hard.settlement.currency, 101);
  assert.equal(nightmare.settlement.currency, 133);
  assert.equal(normal.profile.currency, 74);
  assert.equal(Object.isFrozen(normal.settlement), true);
  assert.equal(settleRun(normal.profile, normal.state), normal.settlement);
  assert.equal(normal.profile.currency, 74);
  assert.deepEqual(normal.profile.settledRuns, [normal.state.runId]);
  assert.equal(normal.profile.best.normal.victories, 1);
  const token = normal.settlement;
  normal.state.settlement = null;
  assert.equal(settleRun(normal.profile, normal.state), token);
  assert.equal(normal.profile.currency, 74);
  assert.equal(normal.profile.best.normal.victories, 1);

  assert.equal(award('normal', 'defeat', STATS).settlement.currency, 35);
  const partial = award('normal', 'playing', STATS);
  assert.equal(partial.settlement.result, 'abandon');
  assert.equal(partial.settlement.currency, 17);
  const fresh = award('nightmare', 'playing', {time: 0, kills: 20, wave: 4});
  assert.equal(fresh.settlement.result, 'abandon');
  assert.equal(fresh.settlement.currency, 0);
  assert.equal(fresh.profile.currency, 0);
  assert.deepEqual(fresh.profile.best, {});
  assert.equal(settleRun(fresh.profile, fresh.state), fresh.settlement);
  assert.equal(fresh.profile.currency, 0);
  assert.equal(award('hard', 'playing', {time: 20, kills: 2, wave: 1}).settlement.currency, 0);

  const owned = createProfile();
  owned.currency = EQUIPMENT.bounty_seal.cost;
  assert.equal(buyEquipment(owned, 'bounty_seal').ok, true);
  assert.equal(award('normal', 'victory', STATS, owned).settlement.currency, 74);
  assert.equal(owned.currency, 74);

  const rich = createProfile();
  rich.currency = EQUIPMENT.bounty_seal.cost;
  assert.equal(buyEquipment(rich, 'bounty_seal').ok, true);
  assert.equal(equipItem(rich, 'bounty_seal').ok, true);
  assert.equal(getProfileBonuses(rich).reward, 0.15);
  const boosted = award('normal', 'victory', STATS, rich);
  assert.equal(boosted.settlement.currency, 85);
  assert.equal(rich.currency, 85);
  assert.equal(settleRun(rich, boosted.state), boosted.settlement);
  assert.equal(rich.currency, 85);

  const lateProfile = createProfile();
  lateProfile.currency = EQUIPMENT.bounty_seal.cost;
  const late = createRun({seed: 77, difficulty: 'normal', profile: lateProfile, runId: 'late-equip'});
  assert.equal(buyEquipment(lateProfile, 'bounty_seal').ok, true);
  assert.equal(equipItem(lateProfile, 'bounty_seal').ok, true);
  late.phase = 'victory';
  late.time = STATS.time;
  late.kills = STATS.kills;
  late.wave = STATS.wave;
  assert.equal(getProfileBonuses(late.profileSnapshot).reward, 0);
  assert.equal(getProfileBonuses(lateProfile).reward, 0.15);
  assert.equal(settleRun(lateProfile, late).currency, 74);
  assert.equal(lateProfile.currency, 74);
});

test('a valid profile and run save independently and reload paused', () => {
  const store = memoryStorage();
  const profile = createProfile('en');
  profile.currency = 21;
  const state = createRun({seed: 42, difficulty: 'hard', profile, runId: 'run-live'});
  state.slots[2].unit.upgrades.strike = 2;
  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.slots[2].unit.upgrades.strike, 2);
  state.hiddenPaused = true;
  state.accumulator = 0.25;
  state.events.push({type: 'ui', time: 1});
  state.systems = {progression: {marked: true}};
  state.director.queue.push({kind: 'shambler', delay: 1.25});
  assert.equal(saveProfile(profile, store).ok, true);
  assert.equal(saveRun(state, store).ok, true);
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, true);
  assert.equal(state.accumulator, 0.25);
  assert.ok(state.events.length >= 1);

  const loaded = loadRun(store);
  assert.equal(loaded.runId, 'run-live');
  assert.equal(loaded.seed, 42);
  assert.equal(loaded.rng, state.rng);
  assert.equal(loaded.difficulty, 'hard');
  assert.equal(loaded.phase, 'draft');
  assert.equal(loaded.paused, true);
  assert.equal(loaded.hiddenPaused, false);
  assert.equal(loaded.accumulator, 0);
  assert.deepEqual(loaded.events, []);
  assert.equal(loaded.draft.options.length, 3);
  assert.deepEqual(loaded.draft.options.map(card => card.id), state.draft.options.map(card => card.id));
  assert.equal(loaded.slots[2].unit.upgrades.strike, 2);
  assert.equal(loaded.slots.filter(slot => slot.unit?.kind === 'hero').length, 1);
  assert.equal(loaded.systems.progression.marked, true);
  assert.equal(loaded.director.queue[0].kind, 'shambler');
  assert.equal(loaded.profileSnapshot.currency, 21);
  assert.equal(loaded.profileSnapshot.settings.language, 'en');
  assert.equal(loadProfile(store).currency, 21);
  assert.notEqual(PROFILE_KEY, RUN_KEY);

  profile.settings.language = 'zh';
  profile.currency = 80;
  assert.equal(saveProfile(profile, store).ok, true);
  assert.equal(loadRun(store).runId, 'run-live');
  assert.equal(loadRun(store).profileSnapshot.currency, 21);
  assert.equal(loadRun(store).profileSnapshot.settings.language, 'en');
  assert.equal(loadProfile(store).currency, 80);
  assert.equal(loadProfile(store).settings.language, 'zh');
  assert.equal(clearRun(store).ok, true);
  assert.equal(loadRun(store), null);
  assert.equal(loadProfile(store).currency, 80);

  const exported = exportSave(profile, state);
  const other = memoryStorage();
  other.setItem(PROFILE_KEY, 'old-profile');
  other.setItem(RUN_KEY, 'old-run');
  assert.equal(importSave('not-json', other).ok, false);
  assert.equal(other.getItem(PROFILE_KEY), 'old-profile');
  assert.equal(other.getItem(RUN_KEY), 'old-run');
  const imported = importSave(exported, other);
  assert.equal(imported.ok, true);
  assert.equal(importSave('{', other).ok, false);
  assert.equal(loadProfile(other).currency, 80);
  assert.equal(loadProfile(other).settings.language, 'zh');
  assert.equal(loadRun(other).runId, 'run-live');
  assert.equal(loadRun(other).paused, true);
  assert.equal(loadRun(other).profileSnapshot.currency, 21);
  assert.equal(loadRun(other).profileSnapshot.settings.language, 'en');
});

test('invalid imports and rejected writes preserve the bytes already stored', () => {
  const store = memoryStorage();
  const profile = createProfile('en');
  profile.currency = 15;
  const state = createRun({seed: 11, difficulty: 'hard', profile, runId: 'kept-run'});
  state.slots[0].unit = createUnit(state, 'frost', 2, 'tower');
  state.accumulator = 0.5;
  state.events.push({type: 'ui'});
  assert.equal(saveProfile(profile, store).ok, true);
  assert.equal(saveRun(state, store).ok, true);
  assert.equal(state.paused, false);
  assert.equal(state.accumulator, 0.5);
  const rawProfile = store.getItem(PROFILE_KEY);
  const rawRun = store.getItem(RUN_KEY);
  const savedProfile = JSON.parse(rawProfile);
  const savedRun = JSON.parse(rawRun);
  assert.equal(loadProfile(store).currency, 15);
  assert.equal(loadRun(store).runId, 'kept-run');
  assert.equal(loadRun(store).paused, true);
  assert.equal(loadRun(store).accumulator, 0);
  assert.deepEqual(loadRun(store).events, []);
  assert.equal(loadRun(store).slots[0].unit.type, 'frost');
  assert.equal(loadRun(store).slots[0].unit.rank, 2);

  const twoHeroes = JSON.parse(rawRun);
  twoHeroes.slots[0].unit = {...twoHeroes.slots[2].unit, id: 'u9'};
  const samples = [
    null,
    '',
    '{',
    '[]',
    JSON.stringify({format: SAVE_FORMAT, version: 999, profile: savedProfile, run: savedRun}),
    JSON.stringify({format: SAVE_FORMAT, version: CONTRACT_VERSION, profile: savedProfile, run: null, extra: true}),
    JSON.stringify({format: SAVE_FORMAT, version: CONTRACT_VERSION, profile: savedProfile, run: twoHeroes})
  ];
  for (const sample of samples) {
    const result = importSave(sample, store);
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, 'string');
    assert.equal(store.getItem(PROFILE_KEY), rawProfile);
    assert.equal(store.getItem(RUN_KEY), rawRun);
  }
  assert.equal(loadProfile(store).currency, 15);
  assert.equal(loadRun(store).runId, 'kept-run');
  assert.equal(loadRun(store).slots[0].unit.rank, 2);

  const broken = createRun({seed: 1, difficulty: 'normal', runId: 'missing-hero'});
  broken.slots[2].unit = null;
  assert.equal(saveRun(broken, store).ok, false);
  const brokeProfile = createProfile();
  brokeProfile.settings.language = 'nope';
  assert.equal(saveProfile(brokeProfile, store).reason, 'invalid_enum');
  assert.equal(store.getItem(PROFILE_KEY), rawProfile);
  assert.equal(store.getItem(RUN_KEY), rawRun);

  store.setItem(PROFILE_KEY, '{');
  store.setItem(RUN_KEY, '[]');
  assert.equal(loadProfile(store), null);
  assert.equal(loadRun(store), null);
  assert.equal(importSave('[]', store).ok, false);
  assert.equal(store.getItem(PROFILE_KEY), '{');
  assert.equal(store.getItem(RUN_KEY), '[]');
});
