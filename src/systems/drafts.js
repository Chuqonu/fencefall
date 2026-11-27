/**
 * Three-choice roguelike drafts (Fencefall v4).
 *
 * One tap resolves immediately:
 * - Hero weapon & auto super-weapon evolutions level up directly.
 * - Base bastion turrets auto-deploy to the best open wall slot on 1st pick,
 *   and directly level up (Lv.1 -> Lv.4) on repeat picks — zero merge puzzle,
 *   zero separate placement phase.
 * - Draft rerolls use simple `rerollsLeft` charges (no secondary energy currency).
 */
import {HERO_UPGRADES, availableHeroUpgradeIds, applyHeroUpgrade} from './hero.js';
import {TOWERS, RANK_SCALE} from '../data/towers.js';
import {EXPEDITIONS} from '../data/expeditions.js';
import {AUTO_DEPLOY_ORDER, BASE_TYPES, clone, createUnit, emit, random} from '../shared.js';

const SUPERWEAPON_IDS = new Set(['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam']);

/** XP required to open the next draft after `opened` drafts have already been granted. */
export function draftXpCost(opened) {
  const n = Number.isFinite(opened) ? Math.max(0, Math.floor(opened)) : 0;
  return 6 + 4 * n;
}

export function findTowerOnBoard(state, type) {
  if (!state || !Array.isArray(state.slots)) return null;
  for (const slot of state.slots) {
    if (slot?.unit && slot.unit.kind === 'tower' && slot.unit.type === type) return slot;
  }
  return null;
}

export function findAutoDeploySlot(state) {
  if (!state || !Array.isArray(state.slots)) return -1;
  for (const idx of AUTO_DEPLOY_ORDER) {
    if (state.slots[idx] && !state.slots[idx].unit) return idx;
  }
  for (let i = 0; i < state.slots.length; i++) {
    if (state.slots[i] && !state.slots[i].unit) return i;
  }
  return -1;
}

export function generateDraft(state) {
  if (!state || !Array.isArray(state.slots)) {
    return BASE_TYPES.slice(0, 3).map((type) => towerCard(state, type));
  }
  const heroIds = new Set(availableUpgradeIds(state));
  const cards = allValidCards(state, heroIds);
  let picked = uniqueCards(selectThree(state, cards)).filter((card) => cardValid(state, card, heroIds));
  if (picked.length < 3) {
    const used = new Set(picked.map((card) => card.id));
    for (const card of cards) {
      if (used.has(card.id) || !cardValid(state, card, heroIds)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
  return shuffle(state, picked.slice(0, 3));
}

export function rerollDraft(state) {
  if (state?.phase !== 'draft' || !state.draft || (state.draftRerollsUsed || 0) >= 3) return fail('unavailable');
  const left = Number.isFinite(state.rerollsLeft) ? Math.floor(state.rerollsLeft) : 0;
  if (left <= 0) return fail('unavailable');
  const before = state.draft.options.map((c) => c.id).sort().join('|');
  let cards = state.draft.options;
  for (let i = 0; i < 8; i++) {
    const next = generateDraft(state);
    if (next.length >= 1) cards = next;
    if (next.map((c) => c.id).sort().join('|') !== before) break;
  }
  state.draft.options = cards;
  state.rerollsLeft = left - 1;
  state.draftRerollsUsed = (state.draftRerollsUsed || 0) + 1;
  emit(state, 'draft_reroll', {rerollsLeft: state.rerollsLeft, rerollsUsed: state.draftRerollsUsed});
  return ok();
}

export function updateDrafts(state) {
  if (!state || state.phase !== 'playing' || !Array.isArray(state.slots) || state.slots.length !== 10) {
    return fail('not_playing');
  }
  if (state.settlement || defeatPending(state) || victoryPending(state)) return fail('not_playing');
  if (state.draft) return fail('busy');
  const freeOpening = (state.openingDraftPending || 0) > 0 && state.time >= 0.35;
  const cost = state.nextDraftXp;
  if (!freeOpening && (!Number.isFinite(state.xp) || !Number.isFinite(cost) || cost <= 0 || state.xp < cost)) {
    return fail('not_ready');
  }
  const options = generateDraft(state);
  if (!Array.isArray(options) || options.length === 0) {
    return fail('no_options');
  }
  if (freeOpening) {
    state.openingDraftPending = Math.max(0, Math.floor(state.openingDraftPending) - 1);
  } else {
    state.xp = normalizeXp(state.xp - cost);
    const opened = Number.isFinite(state.draftLevel) ? Math.max(0, Math.floor(state.draftLevel)) : 0;
    state.draftLevel = opened + 1;
    const stagePace = EXPEDITIONS[state.expedition]?.xpPace;
    const pace = Number.isFinite(stagePace) ? stagePace : (state.expedition === 'watch' ? 1 : 0.6);
    state.nextDraftXp = Math.max(4, Math.ceil(draftXpCost(state.draftLevel) * pace));
  }
  state.draftRerollsUsed = 0;
  state.draft = freeOpening ? {options, openingDrop: true} : {options};
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'draft', {level: state.draftLevel, xp: state.xp, nextDraftXp: state.nextDraftXp, openingDrop: freeOpening});
  return ok();
}

export function chooseDraft(state, index) {
  if (!state || state.phase !== 'draft' || !state.draft || !Array.isArray(state.draft.options)) {
    return fail('no_draft');
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.draft.options.length) return fail('bad_index');
  const option = state.draft.options[index];
  if (!option || typeof option !== 'object') return fail('bad_option');

  if (option.kind === 'hero_upgrade') {
    if (typeof option.upgradeId !== 'string' || !option.upgradeId) return fail('bad_option');
    const hero = findHero(state);
    const slots = clone(state.slots);
    const slotsJson = JSON.stringify(state.slots);
    const upgrades = hero ? clone(hero.upgrades || {}) : null;
    const snap = economySnapshot(state);
    const stats = state.stats ? clone(state.stats) : null;
    const statsJson = stats ? JSON.stringify(stats) : null;
    let result;
    try {
      result = applyHeroUpgrade(state, option.upgradeId);
    } catch {
      result = {ok: false, reason: 'upgrade_failed'};
    }
    if (!result || result.ok !== true) {
      if (hero && upgrades && findHero(state) === hero && JSON.stringify(hero.upgrades) !== JSON.stringify(upgrades)) {
        hero.upgrades = upgrades;
      }
      if (JSON.stringify(state.slots) !== slotsJson) state.slots = slots;
      if (stats && JSON.stringify(state.stats) !== statsJson) state.stats = stats;
      restoreEconomy(state, snap);
      return fail(result?.reason || 'upgrade_failed');
    }
    if (stats && JSON.stringify(state.stats) !== statsJson) state.stats = stats;
    state.xp = snap.xp;
    state.nextDraftXp = snap.nextDraftXp;
    state.draftLevel = snap.draftLevel;
    state.paused = snap.paused;
    state.hiddenPaused = snap.hiddenPaused;
    state.kills = snap.kills;
    state.draft = null;
    state.phase = 'playing';
    if (!Array.isArray(state.events)) state.events = [];
    emit(state, 'ui', {action: 'choose_draft', kind: 'hero_upgrade', upgradeId: option.upgradeId});
    return ok();
  }

  if (option.kind === 'tower') {
    if (typeof option.type !== 'string' || !BASE_TYPES.includes(option.type)) return fail('unknown_tower');
    const existing = findTowerOnBoard(state, option.type);
    if (existing?.unit) {
      if (existing.unit.rank >= RANK_SCALE.maxRank) return fail('max_rank');
      existing.unit.rank += 1;
      state.draft = null;
      state.phase = 'playing';
      if (!Array.isArray(state.events)) state.events = [];
      emit(state, 'upgrade_tower', {
        towerType: existing.unit.type,
        rank: existing.unit.rank,
        slot: existing.index,
        x: existing.x,
        y: existing.y,
        id: existing.unit.id
      });
      emit(state, 'ui', {
        action: 'upgrade_tower',
        towerType: existing.unit.type,
        rank: existing.unit.rank,
        slot: existing.index,
        x: existing.x,
        y: existing.y,
        id: existing.unit.id
      });
      return ok();
    }
    const slotIndex = findAutoDeploySlot(state);
    if (slotIndex < 0) return fail('no_slot');
    const slot = state.slots[slotIndex];
    const unit = createUnit(state, option.type, 1, 'tower');
    slot.unit = unit;
    state.draft = null;
    state.phase = 'playing';
    if (!Array.isArray(state.events)) state.events = [];
    emit(state, 'ui', {
      action: 'place',
      towerType: unit.type,
      rank: 1,
      x: slot.x,
      y: slot.y,
      slot: slotIndex,
      id: unit.id
    });
    return ok();
  }

  return fail('bad_option');
}

function ok() { return {ok: true}; }
function fail(reason) { return {ok: false, reason}; }

function normalizeXp(value) {
  if (!Number.isFinite(value) || value <= 0.000001) return 0;
  return Math.round(value * 1000) / 1000;
}

function economySnapshot(state) {
  return {
    xp: state.xp,
    nextDraftXp: state.nextDraftXp,
    draftLevel: state.draftLevel,
    rng: state.rng,
    nextId: state.nextId,
    phase: state.phase,
    paused: state.paused,
    hiddenPaused: state.hiddenPaused,
    kills: state.kills
  };
}

function restoreEconomy(state, snap) {
  state.xp = snap.xp;
  state.nextDraftXp = snap.nextDraftXp;
  state.draftLevel = snap.draftLevel;
  state.rng = snap.rng;
  state.nextId = snap.nextId;
  state.phase = snap.phase;
  state.paused = snap.paused;
  state.hiddenPaused = snap.hiddenPaused;
  state.kills = snap.kills;
}

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function findHero(state) {
  for (const slot of state.slots || []) {
    if (isHero(slot?.unit)) return slot.unit;
  }
  return null;
}

function countEmpty(state) {
  let count = 0;
  for (const slot of state.slots || []) if (slot && !slot.unit) count += 1;
  return count;
}

function defeatPending(state) {
  return !!(state.fence && Number.isFinite(state.fence.hp) && state.fence.hp <= 0);
}

function victoryPending(state) {
  if (state.endless === true) return false;
  if (!state.director || state.director.done !== true) return false;
  for (const enemy of state.enemies || []) {
    if (enemy && enemy.dead !== true && Number.isFinite(enemy.hp) && enemy.hp > 0) return false;
  }
  return true;
}

function catalogTowerTypes() {
  return BASE_TYPES.filter((type) => TOWERS && TOWERS[type]);
}

function upgradeSpec(id) {
  return HERO_UPGRADES?.[id] || null;
}

function readCap(spec) {
  const cap = Number(spec?.cap);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function readLevel(hero, id) {
  if (!hero?.upgrades || typeof hero.upgrades !== 'object') return 0;
  const raw = hero.upgrades[id];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return 0;
}

function availableUpgradeIds(state) {
  const hero = findHero(state);
  return hero ? availableHeroUpgradeIds(hero) : [];
}

function towerCard(state, type) {
  const existing = state ? findTowerOnBoard(state, type)?.unit : null;
  const currentRank = existing ? existing.rank : 0;
  const nextRank = currentRank + 1;
  return {
    id: `tower:${type}`,
    kind: 'tower',
    type,
    action: existing ? 'upgrade' : 'deploy',
    rank: currentRank,
    nextRank,
    cap: RANK_SCALE.maxRank
  };
}

function heroCard(state, id) {
  const spec = upgradeSpec(id);
  const cap = readCap(spec);
  const level = readLevel(findHero(state), id);
  const card = {
    id: `hero_upgrade:${id}`,
    kind: 'hero_upgrade',
    upgradeId: id,
    superweapon: SUPERWEAPON_IDS.has(id)
  };
  if (cap != null) card.cap = cap;
  card.nextLevel = level + 1;
  if (spec?.description?.en && spec?.description?.zh) card.description = spec.description;
  return card;
}

function allValidCards(state, heroIds) {
  const cards = [];
  const hasEmpty = countEmpty(state) > 0;
  for (const type of catalogTowerTypes()) {
    const existing = findTowerOnBoard(state, type)?.unit;
    if (existing) {
      if (existing.rank < RANK_SCALE.maxRank) cards.push(towerCard(state, type));
    } else if (hasEmpty) {
      cards.push(towerCard(state, type));
    }
  }
  for (const id of heroIds) cards.push(heroCard(state, id));
  return uniqueCards(cards);
}

function cardValid(state, card, heroIds) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) return false;
  if (card.kind === 'hero_upgrade') {
    return typeof card.upgradeId === 'string' && heroIds.has(card.upgradeId);
  }
  if (card.kind !== 'tower' || typeof card.type !== 'string' || !BASE_TYPES.includes(card.type)) return false;
  const existing = findTowerOnBoard(state, card.type)?.unit;
  if (existing) return existing.rank < RANK_SCALE.maxRank;
  return countEmpty(state) > 0;
}

function uniqueCards(cards) {
  const out = [];
  const seen = new Set();
  for (const card of cards) {
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

function selectThree(state, cards) {
  const towers = shuffle(state, cards.filter((c) => c.kind === 'tower'));
  const superweapons = shuffle(state, cards.filter((c) => c.kind === 'hero_upgrade' && c.superweapon));
  const coreHero = shuffle(state, cards.filter((c) => c.kind === 'hero_upgrade' && !c.superweapon));
  const picked = [];
  const take = (pool) => {
    while (pool.length) {
      const next = pool.shift();
      if (!picked.some((p) => p.id === next.id)) {
        picked.push(next);
        return true;
      }
    }
    return false;
  };
  // BangBang-first mix: 1 Super-Weapon/Evolution + 1 Core Hero or Super-Weapon + 1 Bastion Turret (deploy/level-up)
  take(superweapons);
  if (!take(coreHero)) take(superweapons);
  take(towers);
  const rest = shuffle(state, [...superweapons, ...coreHero, ...towers]);
  while (picked.length < 3 && rest.length) take(rest);
  return picked.slice(0, 3);
}

function shuffle(state, items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(state) * (i + 1));
    const swap = arr[i];
    arr[i] = arr[j];
    arr[j] = swap;
  }
  return arr;
}
