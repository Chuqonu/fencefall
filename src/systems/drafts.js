/**
 * Three-choice drafts (contract worker 08).
 *
 * Combat owns kill XP (`state.xp`). This module only watches the bar.
 * `updateDrafts` runs while `phase === 'playing'` (engine already skips
 * paused / hidden steps). When `xp >= nextDraftXp` it opens `phase: 'draft'`,
 * subtracts that threshold from `xp` once, increments `draftLevel`, and sets
 * `nextDraftXp` to `draftXpCost(draftLevel)`. `draftXpCost(0) === 8`, matching
 * `createRun`. The sequence is 8, 12, 16, 21, 26, … and always increases.
 * Leftover XP stays in the bar, so a large kill can open another draft after
 * the current choice returns to play. Cancellation does not refund XP, roll a
 * new offer, or leave a unit on the board.
 *
 * `generateDraft` advances `state.rng` and must be called once per opening
 * (updateDrafts does that). Rendering and UI read `state.draft.options`.
 *
 * Cards are plain data: `{id, kind, type?, upgradeId?, replace, rank?, cap?, nextLevel?}`.
 * Hero levels live at `hero.upgrades[upgradeId]` (finite number) with `spec.cap`.
 * A card is offered only when a cloned `applyHeroUpgrade` would succeed.
 * Empty board slots produce placeable tower cards. When empty slots remain, a
 * base type is still absent from the board, and two placeable tower cards are
 * offered, one of those cards is a missing base type. That swap does not roll
 * RNG again, so the same seed and board stay stable. A full board offers three
 * uncapped hero upgrades, or those upgrades plus `replace: true` tower cards
 * when fewer than three upgrades remain — never a surprise tower. Replacement
 * never targets the hero and `placePending` requires `{replace: true}` for an
 * occupied slot.
 * Phase `draft` / `placing` freezes simulation. Explicit `paused` and
 * `hiddenPaused` are left unchanged.
 *
 * Reason codes: not_playing, not_ready, busy, no_options, no_draft, bad_index,
 * bad_option, already_placing, no_slot, unknown_tower, not_placing, bad_slot,
 * hero_protected, occupied, replace_not_offered, draft_missing, plus any
 * reason returned by applyHeroUpgrade.
 */
import {HERO_UPGRADES, applyHeroUpgrade} from './hero.js';
import {TOWERS} from '../data/towers.js';
import {BASE_TYPES, clone, createUnit, emit, random} from '../shared.js';

/** XP required to open the next draft after `opened` drafts have already been granted. */
export function draftXpCost(opened) {
  const n = Number.isFinite(opened) ? Math.max(0, Math.floor(opened)) : 0;
  return 8 + 4 * n + Math.floor((n * n) / 8);
}

export function generateDraft(state) {
  if (!state || !Array.isArray(state.slots)) {
    return BASE_TYPES.slice(0, 3).map(type => towerCard(type, false));
  }
  const heroIds = new Set(availableUpgradeIds(state));
  const cards = allValidCards(state, heroIds);
  let picked = uniqueCards(selectThree(state, cards)).filter(card => cardValid(state, card, heroIds));
  if (picked.length < 3) {
    const used = new Set(picked.map(card => card.id));
    for (const card of cards) {
      if (used.has(card.id) || !cardValid(state, card, heroIds)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
  if (picked.length < 3) {
    const empty = countEmpty(state) > 0;
    const canReplace = countReplaceable(state) > 0;
    for (const type of catalogTowerTypes()) {
      const card = towerCard(type, !empty && canReplace);
      if (!cardValid(state, card, heroIds)) continue;
      if (picked.some(item => item.id === card.id)) continue;
      picked.push(card);
      if (picked.length === 3) break;
    }
  }
  picked = picked.slice(0, 3);
  if (picked.length !== 3) return picked;
  return shuffle(state, preferMissingType(state, picked));
}

export function updateDrafts(state) {
  if (!state || state.phase !== 'playing' || !Array.isArray(state.slots) || state.slots.length !== 10) {
    return fail('not_playing');
  }
  if (state.settlement || defeatPending(state) || victoryPending(state)) return fail('not_playing');
  if (state.draft || state.pendingUnit) return fail('busy');
  const cost = state.nextDraftXp;
  if (!Number.isFinite(state.xp) || !Number.isFinite(cost) || cost <= 0 || state.xp < cost) {
    return fail('not_ready');
  }
  const options = generateDraft(state);
  if (!Array.isArray(options) || options.length !== 3 || new Set(options.map(card => card.id)).size !== 3) {
    return fail('no_options');
  }
  state.xp = normalizeXp(state.xp - cost);
  const opened = Number.isFinite(state.draftLevel) ? Math.max(0, Math.floor(state.draftLevel)) : 0;
  state.draftLevel = opened + 1;
  state.nextDraftXp = draftXpCost(state.draftLevel);
  state.pendingUnit = null;
  state.draft = {options};
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'draft', {level: state.draftLevel, xp: state.xp, nextDraftXp: state.nextDraftXp});
  return ok();
}

export function chooseDraft(state, index) {
  if (!state || state.phase !== 'draft' || !state.draft || !Array.isArray(state.draft.options)) {
    if (state?.phase === 'placing' || state?.pendingUnit) return fail('already_placing');
    return fail('no_draft');
  }
  if (state.pendingUnit) return fail('already_placing');
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
    state.pendingUnit = null;
    state.draft = null;
    state.phase = 'playing';
    if (!Array.isArray(state.events)) state.events = [];
    emit(state, 'ui', {action: 'choose_draft', kind: 'hero_upgrade', upgradeId: option.upgradeId});
    return ok();
  }

  if (option.kind === 'tower') {
    if (typeof option.type !== 'string' || !BASE_TYPES.includes(option.type)) return fail('unknown_tower');
    const empty = countEmpty(state) > 0;
    const replacing = option.replace === true && countReplaceable(state) > 0;
    if (!empty && !replacing) return fail('no_slot');
    const unit = createUnit(state, option.type, 1, 'tower');
    unit.kind = 'tower';
    unit.type = option.type;
    unit.rank = 1;
    if (!unit.upgrades || typeof unit.upgrades !== 'object' || Array.isArray(unit.upgrades)) unit.upgrades = {};
    state.pendingUnit = {unit, replace: option.replace === true};
    state.phase = 'placing';
    return ok();
  }

  return fail('bad_option');
}

export function placePending(state, slotIndex, options = {}) {
  if (!state || state.phase !== 'placing' || !state.pendingUnit?.unit) return fail('not_placing');
  if (!Number.isInteger(slotIndex) || !Array.isArray(state.slots) || slotIndex < 0 || slotIndex >= state.slots.length) {
    return fail('bad_slot');
  }
  const replace = options?.replace === true;
  const slot = state.slots[slotIndex];
  const unit = state.pendingUnit.unit;
  if (!slot || !unit || typeof unit !== 'object') return fail('bad_slot');
  if (isHero(unit)) return fail('hero_protected');
  if (slot.unit && isHero(slot.unit)) return fail('hero_protected');
  if (slot.unit) {
    if (!replace) return fail('occupied');
    if (state.pendingUnit.replace !== true) return fail('replace_not_offered');
  }
  slot.unit = unit;
  const towerType = unit.type;
  const placedId = unit.id;
  const x = slot.x;
  const y = slot.y;
  state.pendingUnit = null;
  state.draft = null;
  state.phase = 'playing';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'ui', {action: 'place', towerType, x, y, slot: slotIndex, replace, id: placedId});
  return ok();
}

export function cancelPlacement(state) {
  if (!state || state.phase !== 'placing') return fail('not_placing');
  if (!state.pendingUnit) return fail('not_placing');
  if (!state.draft || !Array.isArray(state.draft.options) || state.draft.options.length !== 3) return fail('draft_missing');
  state.pendingUnit = null;
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'ui', {action: 'cancel_placement'});
  return ok();
}

function ok() {
  return {ok: true};
}

function fail(reason) {
  return {ok: false, reason};
}

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

function countReplaceable(state) {
  let count = 0;
  for (const slot of state.slots || []) if (slot?.unit && !isHero(slot.unit)) count += 1;
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
  const listed = [];
  for (const type of BASE_TYPES) {
    if (TOWERS && typeof TOWERS === 'object' && TOWERS[type]) listed.push(type);
  }
  if (listed.length >= 3) return listed;
  for (const type of BASE_TYPES) {
    if (!listed.includes(type)) listed.push(type);
  }
  return listed;
}

function upgradeIds() {
  if (!HERO_UPGRADES || typeof HERO_UPGRADES !== 'object') return [];
  const raw = Array.isArray(HERO_UPGRADES)
    ? HERO_UPGRADES.map(item => item?.id || item?.upgradeId)
    : Object.keys(HERO_UPGRADES);
  const ids = [];
  const seen = new Set();
  for (const id of raw) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  ids.sort();
  return ids;
}

function upgradeSpec(id) {
  if (!HERO_UPGRADES || typeof HERO_UPGRADES !== 'object') return null;
  if (Array.isArray(HERO_UPGRADES)) {
    return HERO_UPGRADES.find(item => item && (item.id === id || item.upgradeId === id)) || null;
  }
  return HERO_UPGRADES[id] || null;
}

function readCap(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const raw = spec.cap ?? spec.maxLevel ?? spec.max;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return cap;
}

function readLevel(hero, id) {
  if (!hero?.upgrades || typeof hero.upgrades !== 'object') return 0;
  if (!Object.prototype.hasOwnProperty.call(hero.upgrades, id)) return 0;
  const raw = hero.upgrades[id];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw === true) return 1;
  return null;
}

function trialUpgrade(state, id) {
  if (typeof applyHeroUpgrade !== 'function') return false;
  let copy;
  try {
    copy = clone(state);
  } catch {
    return false;
  }
  copy.phase = 'draft';
  copy.paused = false;
  copy.hiddenPaused = false;
  copy.draft = {
    options: [
      {id: `hero_upgrade:${id}`, kind: 'hero_upgrade', upgradeId: id, replace: false},
      {id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1},
      {id: 'tower:fire', kind: 'tower', type: 'fire', replace: false, rank: 1}
    ]
  };
  try {
    return applyHeroUpgrade(copy, id)?.ok === true;
  } catch {
    return false;
  }
}

function availableUpgradeIds(state) {
  const hero = findHero(state);
  if (!hero) return [];
  const snapshot = {
    rng: state.rng,
    nextId: state.nextId,
    xp: state.xp,
    phase: state.phase,
    draftLevel: state.draftLevel,
    nextDraftXp: state.nextDraftXp,
    upgrades: clone(hero.upgrades || {})
  };
  const ids = [];
  for (const id of upgradeIds()) {
    const cap = readCap(upgradeSpec(id));
    const level = readLevel(hero, id);
    if (level != null && cap != null && level >= cap) continue;
    if (trialUpgrade(state, id)) ids.push(id);
  }
  state.rng = snapshot.rng;
  state.nextId = snapshot.nextId;
  state.xp = snapshot.xp;
  state.phase = snapshot.phase;
  state.draftLevel = snapshot.draftLevel;
  state.nextDraftXp = snapshot.nextDraftXp;
  if (JSON.stringify(hero.upgrades) !== JSON.stringify(snapshot.upgrades)) hero.upgrades = snapshot.upgrades;
  return ids;
}

function towerCard(type, replace) {
  return {
    id: replace ? `tower:${type}:replace` : `tower:${type}`,
    kind: 'tower',
    type,
    replace: !!replace,
    rank: 1
  };
}

function heroCard(state, id) {
  const card = {
    id: `hero_upgrade:${id}`,
    kind: 'hero_upgrade',
    upgradeId: id,
    replace: false
  };
  const cap = readCap(upgradeSpec(id));
  const level = readLevel(findHero(state), id);
  if (cap != null) card.cap = cap;
  if (level != null) card.nextLevel = level + 1;
  return card;
}

function allValidCards(state, heroIds) {
  const cards = [];
  const empty = countEmpty(state) > 0;
  const canReplace = countReplaceable(state) > 0;
  if (empty) {
    for (const type of catalogTowerTypes()) cards.push(towerCard(type, false));
  }
  for (const id of heroIds) cards.push(heroCard(state, id));
  if (!empty && canReplace) {
    for (const type of catalogTowerTypes()) cards.push(towerCard(type, true));
  }
  return uniqueCards(cards);
}

function cardValid(state, card, heroIds) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) return false;
  if (card.kind === 'hero_upgrade') {
    return card.replace !== true && typeof card.upgradeId === 'string' && heroIds.has(card.upgradeId);
  }
  if (card.kind !== 'tower' || typeof card.type !== 'string' || !BASE_TYPES.includes(card.type)) return false;
  if (card.replace === true) return countReplaceable(state) > 0;
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

function presentBaseTypes(state) {
  const present = new Set();
  for (const slot of state.slots || []) {
    const type = slot?.unit?.type;
    if (typeof type === 'string' && BASE_TYPES.includes(type)) present.add(type);
  }
  return present;
}

// Swap one owned tower for a missing base type. Reading the shuffled cards
// only — no extra random() call — so later combat rolls stay on the same stream.
function preferMissingType(state, picked) {
  if (countEmpty(state) <= 0) return picked;
  const present = presentBaseTypes(state);
  const missing = catalogTowerTypes().filter(type => !present.has(type));
  if (missing.length === 0) return picked;
  const towerIndexes = [];
  for (let i = 0; i < picked.length; i += 1) {
    const card = picked[i];
    if (card && card.kind === 'tower' && card.replace !== true) towerIndexes.push(i);
  }
  if (towerIndexes.length < 2) return picked;
  if (towerIndexes.some(index => !present.has(picked[index].type))) return picked;
  const used = new Set(picked.map(card => card && card.id));
  const type = missing.find(candidate => !used.has(`tower:${candidate}`));
  if (!type) return picked;
  const next = picked.slice();
  next[towerIndexes[towerIndexes.length - 1]] = towerCard(type, false);
  return next;
}

function selectThree(state, cards) {
  const empty = countEmpty(state) > 0;
  const emptyCount = countEmpty(state);
  const towers = cards.filter(card => card.kind === 'tower' && card.replace !== true);
  const heroes = cards.filter(card => card.kind === 'hero_upgrade');
  const replaces = cards.filter(card => card.kind === 'tower' && card.replace === true);
  let picked = [];
  if (empty && towers.length && heroes.length) {
    const towerOrder = shuffle(state, towers);
    const heroOrder = shuffle(state, heroes);
    if (emptyCount >= 7 && towerOrder.length >= 2) {
      picked = [towerOrder[0], heroOrder[0], towerOrder[1]];
    } else {
      picked = [towerOrder[0], heroOrder[0]];
      const rest = shuffle(state, towerOrder.slice(1).concat(heroOrder.slice(1)));
      if (rest.length) picked.push(rest[0]);
    }
  } else if (!empty && heroes.length >= 3) {
    picked = shuffle(state, heroes).slice(0, 3);
  } else if (!empty) {
    picked = shuffle(state, heroes).concat(shuffle(state, replaces)).slice(0, 3);
  } else {
    picked = shuffle(state, towers.concat(heroes)).slice(0, 3);
  }
  if (picked.length < 3) {
    const used = new Set(picked.map(card => card.id));
    for (const card of shuffle(state, cards)) {
      if (used.has(card.id)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
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
