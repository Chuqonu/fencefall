/**
 * Three-choice roguelike drafts (Fencefall v5 — Pure Solo Gunner).
 *
 * One tap resolves immediately:
 * - Every 3-of-1 draft offers ONLY Hero Gun Mods (枪械强化) and Auto Skills (自动技能).
 * - Side turrets & 2×5 slot grid are removed; the Gunner holds the center wall position.
 * - Draft rerolls spend `rerollsLeft` charges.
 */
import {HERO_UPGRADES, isAutoSkill, availableHeroUpgradeIds, applyHeroUpgrade} from './hero.js';
import {EXPEDITIONS} from '../data/expeditions.js';
import {clone, emit, random} from '../shared.js';

/** XP required to open the next draft after `opened` drafts have already been granted. */
export function draftXpCost(opened) {
  const n = Number.isFinite(opened) ? Math.max(0, Math.floor(opened)) : 0;
  return 6 + 4 * n;
}

export function generateDraft(state) {
  if (!state || !Array.isArray(state.slots)) {
    return ['volley', 'napalm', 'cadence'].map((id) => heroCard(state, id));
  }
  const heroIds = new Set(availableUpgradeIds(state));
  const cards = allValidCards(state, heroIds);
  let picked = uniqueCards(selectThree(state, cards)).filter((card) => cardValid(card, heroIds));
  if (picked.length < 3) {
    const used = new Set(picked.map((card) => card.id));
    for (const card of cards) {
      if (used.has(card.id) || !cardValid(card, heroIds)) continue;
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
    const pace = Number.isFinite(stagePace) ? stagePace * 0.78 : (state.expedition === 'watch' ? 1 : 0.68);
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

function heroCard(state, id) {
  const spec = upgradeSpec(id);
  const cap = readCap(spec);
  const level = readLevel(findHero(state), id);
  const card = {
    id: `hero_upgrade:${id}`,
    kind: 'hero_upgrade',
    upgradeId: id,
    superweapon: isAutoSkill(id)
  };
  if (cap != null) card.cap = cap;
  card.nextLevel = level + 1;
  if (spec?.description?.en && spec?.description?.zh) card.description = spec.description;
  return card;
}

function allValidCards(state, heroIds) {
  const mainIds = [];
  for (const id of heroIds) {
    if (id !== 'overclock') mainIds.push(id);
  }
  const cards = mainIds.map((id) => heroCard(state, id));
  if (cards.length < 3 && heroIds.has('overclock')) {
    cards.push(heroCard(state, 'overclock'));
  }
  return uniqueCards(cards);
}

function cardValid(card, heroIds) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) return false;
  return card.kind === 'hero_upgrade' && typeof card.upgradeId === 'string' && heroIds.has(card.upgradeId);
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
  const skills = shuffle(state, cards.filter((c) => c.superweapon));
  const gunMods = shuffle(state, cards.filter((c) => !c.superweapon && c.upgradeId !== 'overclock'));
  const fallback = cards.filter((c) => c.upgradeId === 'overclock');
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
  // Always mix Auto Skills (自动技能) and Gun Mods (枪械强化): 1–2 of each whenever available
  take(skills);
  take(gunMods);
  const rest = shuffle(state, [...skills, ...gunMods]);
  while (picked.length < 3 && rest.length) take(rest);
  while (picked.length < 3 && fallback.length) take(fallback);
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
