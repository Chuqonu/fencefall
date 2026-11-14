// Passive run upgrades for the single hero. Does not spend draft XP, change phase,
// roll RNG, or modify any other unit. Drafts call applyHeroUpgrade, then return to playing.
//
// Front-center slot 2 is (180, 508); the fence is y=450. Baseline range 340 reaches
// enemies stopped on that fence from the front row and still covers the rear row,
// so the opener can fight unaided. New runs start on slot 2. A saved run keeps
// whatever slot the hero already occupies.
//
// getProfileBonuses(profileSnapshot): damage and haste are fractions, range is pixels,
// critChance is an absolute fraction. Fence HP and reward are not applied here.
// Haste adds to attack speed: interval = base / (1 + upgrade haste + profile haste).
// Profile damage multiplies hit damage and poison dps after flat upgrade adds.
// Combat should fire ordinary projectiles from these UnitStats. Poison is one stack
// {dps, duration, maxStacks:1}; later hits refresh it. Pierce is the numeric field.
// mechanics stays empty: those two are first-class stats, not extra hooks.

import {clamp} from '../shared.js';
import {getProfileBonuses} from './progression.js';

export const HERO_BASE = Object.freeze({
  damage: 20,
  interval: 0.6,
  range: 340,
  critChance: 0.08,
  critMultiplier: 1.75,
  projectileSpeed: 540,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  mechanics: Object.freeze([]),
});

const BONUS_LIMITS = Object.freeze({
  damage: [-0.5, 2.5],
  haste: [-0.4, 1.25],
  range: [-40, 160],
  critChance: [-0.2, 0.5],
});

const STAT_LIMITS = Object.freeze({
  damage: [1, 250],
  interval: [0.25, 3],
  range: [280, 480],
  critChance: [0, 0.75],
  critMultiplier: [1.25, 3.5],
  projectileSpeed: [240, 720],
  pierce: [0, 4],
  poisonDps: [0, 80],
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function describeEffect(effect) {
  const en = [];
  const zh = [];
  if (effect.damageAdd) {
    en.push(`Each rank adds ${effect.damageAdd} damage to the hero's shots.`);
    zh.push(`每级使英雄的射击伤害 +${effect.damageAdd}。`);
  }
  if (effect.haste) {
    const pct = Math.round(effect.haste * 100);
    en.push(`Each rank increases the hero's attack speed by ${pct}%.`);
    zh.push(`每级使英雄的攻击速度提高 ${pct}%。`);
  }
  if (effect.range) {
    en.push(`Each rank extends the hero's range by ${effect.range}.`);
    zh.push(`每级使英雄的射程 +${effect.range}。`);
  }
  if (effect.critChance) {
    const pct = Math.round(effect.critChance * 100);
    en.push(`Each rank adds ${pct}% to the hero's critical hit chance.`);
    zh.push(`每级使英雄的暴击率 +${pct}%。`);
  }
  if (effect.critMultiplier) {
    en.push(`Each rank adds ${effect.critMultiplier} to the hero's critical multiplier.`);
    zh.push(`每级使英雄的暴击倍率 +${effect.critMultiplier}。`);
  }
  if (effect.pierce) {
    const n = effect.pierce;
    const noun = n === 1 ? 'enemy' : 'enemies';
    en.push(`Each rank lets the hero's shot pierce ${n} extra ${noun}.`);
    zh.push(`每级使英雄的射击额外穿透 ${n} 个敌人。`);
  }
  if (effect.poison) {
    const p = effect.poison;
    en.push(`Each rank adds ${p.dps} poison damage per second to the hero's hits for ${p.duration}s. Hits refresh; they do not stack.`);
    zh.push(`每级使英雄的命中附加每秒 ${p.dps} 点毒素，持续 ${p.duration} 秒；命中刷新，不叠加。`);
  }
  if (!en.length) {
    en.push('Passive improvement to the hero.');
    zh.push('被动强化英雄。');
  }
  return {en: en.join(' '), zh: zh.join('')};
}

function defineUpgrade(id, cap, name, effect) {
  return deepFreeze({
    id,
    cap,
    name: {en: name.en, zh: name.zh},
    description: describeEffect(effect),
    effect,
  });
}

// Numeric effect fields are per rank. poison.dps is per rank; duration and maxStacks are not.
export const HERO_UPGRADES = deepFreeze({
  strike: defineUpgrade('strike', 4, {en: 'Sharpened Quarrels', zh: '锋矢'}, {damageAdd: 4}),
  cadence: defineUpgrade('cadence', 4, {en: 'Repeater Cadence', zh: '连射'}, {haste: 0.08}),
  reach: defineUpgrade('reach', 3, {en: 'Long Watch', zh: '远望'}, {range: 20}),
  focus: defineUpgrade('focus', 4, {en: 'Keen Eye', zh: '锐目'}, {critChance: 0.05}),
  lethality: defineUpgrade('lethality', 3, {en: 'Heavy Draw', zh: '满弦'}, {critMultiplier: 0.25}),
  pierce: defineUpgrade('pierce', 2, {en: 'Piercing Bolt', zh: '贯矢'}, {pierce: 1}),
  barbed: defineUpgrade('barbed', 3, {en: 'Barbed Quills', zh: '倒刺'}, {
    poison: {dps: 3, duration: 3, maxStacks: 1},
  }),
});

function finiteOr(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round4(n) {
  if (!Number.isFinite(n)) return n;
  return Number(n.toFixed(4));
}

function storedLevel(raw, cap) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(cap, Math.floor(n));
}

function findHero(state) {
  if (!state || !Array.isArray(state.slots)) return null;
  let byType = null;
  for (const slot of state.slots) {
    const unit = slot && slot.unit;
    if (!unit || typeof unit !== 'object') continue;
    if (unit.kind === 'hero') return unit;
    if (!byType && unit.type === 'hero') byType = unit;
  }
  return byType;
}

function readBonuses(state) {
  const empty = {damage: 0, haste: 0, range: 0, critChance: 0};
  const profile = state && state.profileSnapshot;
  if (!profile || typeof profile !== 'object') return empty;
  const raw = getProfileBonuses(profile) || empty;
  return {
    damage: clamp(finiteOr(raw.damage), BONUS_LIMITS.damage[0], BONUS_LIMITS.damage[1]),
    haste: clamp(finiteOr(raw.haste), BONUS_LIMITS.haste[0], BONUS_LIMITS.haste[1]),
    range: clamp(finiteOr(raw.range), BONUS_LIMITS.range[0], BONUS_LIMITS.range[1]),
    critChance: clamp(finiteOr(raw.critChance), BONUS_LIMITS.critChance[0], BONUS_LIMITS.critChance[1]),
  };
}

function upgradeLevels(unit) {
  const bag = unit && unit.upgrades && typeof unit.upgrades === 'object' ? unit.upgrades : {};
  const levels = {};
  for (const id of Object.keys(HERO_UPGRADES)) {
    levels[id] = storedLevel(bag[id], HERO_UPGRADES[id].cap);
  }
  return levels;
}

/** Ids still below cap, in catalog order. Empty when every run upgrade is maxed. */
export function availableHeroUpgradeIds(unit) {
  const levels = upgradeLevels(unit);
  const ids = [];
  for (const id of Object.keys(HERO_UPGRADES)) {
    if (levels[id] < HERO_UPGRADES[id].cap) ids.push(id);
  }
  return ids;
}

/**
 * Fresh UnitStats for the hero. Does not mutate the unit, catalog, or run.
 * Profile bonuses come from state.profileSnapshot when present.
 */
export function getHeroStats(unit, state) {
  const levels = upgradeLevels(unit);
  let damageAdd = 0;
  let haste = 0;
  let rangeAdd = 0;
  let critAdd = 0;
  let critMulAdd = 0;
  let pierceAdd = 0;
  let poisonDps = 0;
  let poisonDuration = 0;
  let poisonStacks = 0;

  for (const id of Object.keys(HERO_UPGRADES)) {
    const level = levels[id];
    if (level <= 0) continue;
    const effect = HERO_UPGRADES[id].effect;
    if (effect.damageAdd) damageAdd += effect.damageAdd * level;
    if (effect.haste) haste += effect.haste * level;
    if (effect.range) rangeAdd += effect.range * level;
    if (effect.critChance) critAdd += effect.critChance * level;
    if (effect.critMultiplier) critMulAdd += effect.critMultiplier * level;
    if (effect.pierce) pierceAdd += effect.pierce * level;
    if (effect.poison && effect.poison.dps) {
      poisonDps += effect.poison.dps * level;
      poisonDuration = Math.max(poisonDuration, finiteOr(effect.poison.duration));
      poisonStacks = Math.max(poisonStacks, finiteOr(effect.poison.maxStacks, 1));
    }
  }

  const bonus = readBonuses(state);
  const damageFactor = 1 + bonus.damage;
  const attackSpeed = Math.max(0.25, 1 + haste + bonus.haste);
  const damage = clamp(round4((HERO_BASE.damage + damageAdd) * damageFactor), STAT_LIMITS.damage[0], STAT_LIMITS.damage[1]);
  const interval = clamp(round4(HERO_BASE.interval / attackSpeed), STAT_LIMITS.interval[0], STAT_LIMITS.interval[1]);
  const range = clamp(round4(HERO_BASE.range + rangeAdd + bonus.range), STAT_LIMITS.range[0], STAT_LIMITS.range[1]);
  const critChance = clamp(round4(HERO_BASE.critChance + critAdd + bonus.critChance), STAT_LIMITS.critChance[0], STAT_LIMITS.critChance[1]);
  const critMultiplier = clamp(round4(HERO_BASE.critMultiplier + critMulAdd), STAT_LIMITS.critMultiplier[0], STAT_LIMITS.critMultiplier[1]);
  const projectileSpeed = clamp(round4(HERO_BASE.projectileSpeed), STAT_LIMITS.projectileSpeed[0], STAT_LIMITS.projectileSpeed[1]);
  const pierce = clamp(Math.round(HERO_BASE.pierce + pierceAdd), STAT_LIMITS.pierce[0], STAT_LIMITS.pierce[1]);

  const stats = {
    damage,
    interval,
    range,
    critChance,
    critMultiplier,
    projectileSpeed,
    splash: 0,
    chain: 0,
    chainRange: HERO_BASE.chainRange,
    pierce,
    mechanics: [],
  };

  if (poisonDps > 0 && poisonDuration > 0) {
    stats.poison = {
      dps: clamp(round4(poisonDps * damageFactor), STAT_LIMITS.poisonDps[0], STAT_LIMITS.poisonDps[1]),
      duration: round4(poisonDuration),
      maxStacks: clamp(Math.round(poisonStacks || 1), 1, 3),
    };
  }
  return stats;
}

/**
 * Raise one hero upgrade by 1. Returns {ok:true} or {ok:false, reason}.
 * Reasons: unknown_upgrade, invalid_state, no_hero, upgrade_capped.
 * Only hero.upgrades is written.
 */
export function applyHeroUpgrade(state, id) {
  const def = typeof id === 'string' ? HERO_UPGRADES[id] : undefined;
  if (!def) return {ok: false, reason: 'unknown_upgrade'};
  if (!state || typeof state !== 'object' || !Array.isArray(state.slots)) return {ok: false, reason: 'invalid_state'};
  const hero = findHero(state);
  if (!hero) return {ok: false, reason: 'no_hero'};

  let upgrades = hero.upgrades;
  const usable = upgrades && typeof upgrades === 'object' && !Array.isArray(upgrades) && !Object.isFrozen(upgrades);
  if (!usable) {
    try {
      const next = {};
      if (upgrades && typeof upgrades === 'object' && !Array.isArray(upgrades)) {
        for (const key of Object.keys(upgrades)) next[key] = upgrades[key];
      }
      hero.upgrades = next;
      upgrades = next;
    } catch {
      return {ok: false, reason: 'invalid_state'};
    }
  }

  const current = storedLevel(upgrades[id], def.cap);
  if (current >= def.cap) return {ok: false, reason: 'upgrade_capped'};
  try {
    upgrades[id] = current + 1;
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}
