import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTRACT_VERSION, BASE_TYPES, DIFFICULTIES, createUnit} from '../src/shared.js';
import {createProfile, createRun} from '../src/state.js';
import {HERO_BASE, HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';
import {draftXpCost, updateDrafts, chooseDraft} from '../src/systems/drafts.js';
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

function heroOf(state) {
  return state.slots.find(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')).unit;
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

function openDraft(state, extraXp = 0) {
  state.phase = 'playing';
  state.draft = null;
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
  const hero = heroOf(state);
  for (const card of options) {
    if (card.kind === 'hero_upgrade') {
      const spec = HERO_UPGRADES[card.upgradeId];
      assert.ok(spec, card.upgradeId);
      const level = Number(hero.upgrades?.[card.upgradeId] || 0);
      assert.ok(level < spec.cap, card.upgradeId);
    } else {
      assert.equal(card.kind, 'tower');
      assert.ok(BASE_TYPES.includes(card.type), card.type);
      assert.ok(card.action === 'deploy' || card.action === 'upgrade');
    }
  }
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

test('opening a draft spends the threshold once and offers exactly three choices', () => {
  const state = createRun({seed: 7, difficulty: 'normal', runId: 'draft-spend'});
  assert.equal(state.nextDraftXp, draftXpCost(0));
  openDraft(state, 2);
  assert.equal(state.phase, 'draft');
  assert.equal(state.xp, 2);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assertOptions(state);
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
  state.draft.options[0] = {id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike'};
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
  assert.equal(EQUIPMENT.splinter_bow.bonuses.damage, 0.08);
  assert.equal(EQUIPMENT.kinetic_core.cost, 150);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.damage, 0.06);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.critChance, 0.05);
  assert.equal(EQUIPMENT.kinetic_core.bonuses.critKnockback, 10);
  assert.equal(EQUIPMENT.fence_nails.cost, 50);
  assert.equal(EQUIPMENT.fence_nails.bonuses.fence, 60);
  assert.equal(EQUIPMENT.bounty_seal.cost, 240);
  assert.equal(EQUIPMENT.bounty_seal.bonuses.reward, 0.2);
  assert.deepEqual(PERMANENT_UPGRADES.damage.costs, [40, 70, 110, 170, 240]);
  assert.equal(PERMANENT_UPGRADES.damage.bonuses.damage, 0.04);

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
  assert.equal(getProfileBonuses(profile).damage, 0.08);
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
    damage: 0.1,
    haste: 0,
    range: 0,
    critChance: 0.05,
    fence: 60,
    critKnockback: 10,
    reward: 0
  });
  const geared = createRun({seed: 70, difficulty: 'normal', profile, runId: 'gear-hero'});
  const stats = getHeroStats(geared.slots[2].unit, geared);
  assert.equal(stats.damage, Number((HERO_BASE.damage * 1.1).toFixed(4)));
  assert.equal(stats.range, HERO_BASE.range);
  assert.equal(stats.critChance, 0.13);
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
  assert.equal(getProfileBonuses(rich).reward, 0.2);
  const boosted = award('normal', 'victory', STATS, rich);
  assert.equal(boosted.settlement.currency, 89);
  assert.equal(rich.currency, 89);
  assert.equal(settleRun(rich, boosted.state), boosted.settlement);
  assert.equal(rich.currency, 89);

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
  assert.equal(getProfileBonuses(lateProfile).reward, 0.2);
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
