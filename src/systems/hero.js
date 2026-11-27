import {clamp} from '../shared.js';
import {getProfileBonuses} from './progression.js';

export const HERO_BASE = Object.freeze({
  damage: 18,
  interval: 0.5,
  range: 390,
  critChance: 0.1,
  critMultiplier: 1.75,
  projectileSpeed: 580,
  splash: 0,
  chain: 0,
  chainRange: 75,
  pierce: 0,
  mechanics: Object.freeze([]),
});

export const AUTO_SKILL_IDS = Object.freeze([
  'split_shot',
  'ricochet',
  'napalm',
  'armored_car',
  'cryo_barrage',
  'orbital_beam',
]);

const AUTO_SKILL_SET = new Set(AUTO_SKILL_IDS);

export function isAutoSkill(id) {
  return typeof id === 'string' && AUTO_SKILL_SET.has(id);
}

const BONUS_LIMITS = Object.freeze({
  damage: [-0.5, 2.5],
  haste: [-0.4, 1.25],
  range: [-40, 160],
  critChance: [-0.2, 0.5],
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function upgrade(id, cap, category, en, zh, info, detail, effect) {
  return deepFreeze({
    id,
    cap,
    category,
    name: {en, zh},
    description: {en: info, zh: detail},
    effect,
  });
}

export const HERO_UPGRADES = deepFreeze({
  // --- 枪械强化 (Gun Mods) ---
  volley: upgrade(
    'volley', 3, 'gun',
    'Multi-Volley', '齐射弹道',
    'Fire at +1 additional zombie every shot.',
    '每次开火额外多打 1 个目标，弹幕铺满全屏。',
    {multishot: 1}
  ),
  strike: upgrade(
    'strike', 5, 'gun',
    'Heavy Rounds', '重膛高爆弹',
    'Gun damage +6. Crits knock back non-boss zombies.',
    '子弹伤害 +6，暴击时将普通僵尸震退 18 像素。',
    {damageAdd: 6}
  ),
  cadence: upgrade(
    'cadence', 5, 'gun',
    'Rapid Fire', '极速连射',
    'Fire rate +16% for faster bullet streams.',
    '枪械攻速 +16%，弹幕倾泻更密集。',
    {haste: 0.16}
  ),
  pierce: upgrade(
    'pierce', 4, 'gun',
    'Armor Pierce', '穿甲弹芯',
    'Bullets pierce +1 zombie and ignore 25% armor.',
    '子弹穿透 +1 名僵尸，并无视 25% 护甲。',
    {pierce: 1}
  ),
  shrapnel: upgrade(
    'shrapnel', 4, 'gun',
    'Flame Rounds', '烈焰爆裂弹',
    'Explosive hits burn zombies for 2.6s. Lv.2+ leaves burning patches.',
    '子弹命中爆炸溅射并灼烧 2.6 秒，2 级起留下地面火坑。',
    {splash: 30, burn: {dps: 5, duration: 2.6}}
  ),
  frostbite: upgrade(
    'frostbite', 4, 'gun',
    'Frost Rounds', '急冻减速弹',
    'Slows zombies and boosts damage taken. Lv.2+ shatters on kill.',
    '减速僵尸并附加易伤，2 级起击杀触发范围冰爆。',
    {brittle: {power: 0.1, duration: 2.6}}
  ),
  focus: upgrade(
    'focus', 4, 'gun',
    'Deadeye Crit', '致命暴击',
    'Crit chance +10% & crit damage +30%. Lv.2+ executes low-HP foes.',
    '暴击率 +10%、暴击伤害 +30%，2 级起解锁残血斩杀。',
    {critChance: 0.1, critMultiplier: 0.3}
  ),
  bastion: upgrade(
    'bastion', 3, 'gun',
    'Fortified Wall', '钢铁城墙',
    'Wall HP +120, shockwave +40%, and +1 wall shield block.',
    '城墙血量 +120，危急冲击波 +40%，城墙免伤护盾 +1 次。',
    {fence: 120}
  ),

  // --- 自动技能 (Auto Skills) ---
  split_shot: upgrade(
    'split_shot', 4, 'skill',
    'Split Shrapnel', '子母分裂弹',
    'Damage +3. Hits auto-burst into 2/3/4/5 piercing shrapnel shots.',
    '子弹伤害 +3，命中后自动向四周分裂出 2/3/4/5 发贯穿弹片。',
    {damageAdd: 3}
  ),
  ricochet: upgrade(
    'ricochet', 4, 'skill',
    'EM Chain Strike', '电磁连锁雷',
    'Bullets arc to 2/3/4/5 zombies and auto-call stunning sky lightning.',
    '子弹电弧弹射 2/3/4/5 名僵尸，并定时自动降下麻痹天雷。',
    {damageAdd: 2}
  ),
  napalm: upgrade(
    'napalm', 4, 'skill',
    'Napalm Fire Sea', '燃油弹火海',
    'Blast radius +24. Periodically auto-drops Napalm creating a burning sea.',
    '溅射范围 +24，定时自动空投燃油弹形成大范围持续火海。',
    {splash: 24}
  ),
  armored_car: upgrade(
    'armored_car', 4, 'skill',
    'Armored Sweeper', '重装装甲车',
    'Wall HP +80. Periodically auto-sends an armored truck crushing a lane.',
    '城墙血量 +80，定时自动派出装甲车碾压并击退整列尸潮。',
    {fence: 80}
  ),
  cryo_barrage: upgrade(
    'cryo_barrage', 4, 'skill',
    'Glacial Barrage', '干冰齐射柱',
    'Adds brittle. Periodically auto-fires a fan of 5/7/9/11 piercing ice spears.',
    '附加易伤，定时自动齐射 5/7/9/11 道贯穿冰柱横扫减速尸潮。',
    {brittle: {power: 0.1, duration: 2.6}}
  ),
  orbital_beam: upgrade(
    'orbital_beam', 4, 'skill',
    'Orbital Laser', '高能激光柱',
    'Crit damage +25%. Periodically auto-fires a vertical beam melting elites & bosses.',
    '暴击伤害 +25%，定时自动发射纵贯战场的激光柱重创精英与首领。',
    {critMultiplier: 0.25}
  ),

  // --- Repeatable Late-Game Fallback ---
  overclock: upgrade(
    'overclock', 20, 'gun',
    'Firepower Overclock', '火力超频',
    'Gun and auto-skill damage +12% per rank.',
    '枪械与所有自动技能伤害额外 +12%，持续叠加火力。',
    {damage: 0.12}
  ),
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
  const raw = state.systems?.integration?.bonuses || getProfileBonuses(profile) || empty;
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
  const {
    strike, cadence, pierce, volley, shrapnel, frostbite, focus,
    split_shot, ricochet, napalm, armored_car, cryo_barrage, orbital_beam, overclock
  } = levels;
  const bonus = readBonuses(state);
  const rawBonus = state?.systems?.integration?.bonuses || getProfileBonuses(state?.profileSnapshot) || {};
  const extraPierce = Math.max(0, Math.floor(finiteOr(rawBonus.heroPierce, 0)));
  const stats = {
    ...HERO_BASE,
    mechanics: [],
    damage: round4((HERO_BASE.damage + 6 * strike + 3 * split_shot + 2 * ricochet) * (1 + bonus.damage + 0.12 * overclock)),
    interval: round4(HERO_BASE.interval / (1 + 0.16 * cadence + bonus.haste)),
    range: HERO_BASE.range + bonus.range,
    critChance: round4(HERO_BASE.critChance + 0.1 * focus + bonus.critChance),
    critMultiplier: round4(HERO_BASE.critMultiplier + 0.3 * focus + 0.25 * orbital_beam),
    fence: levels.bastion * 120 + armored_car * 80,
    pierce: pierce + extraPierce,
    armorPen: Math.min(0.95, pierce * 0.25),
    critKnockback: (strike ? 18 : 0) + finiteOr(rawBonus.critKnockback, 0),
    multishot: volley,
    chain: ricochet ? 1 + ricochet : 0,
    chainRange: ricochet ? 112 : HERO_BASE.chainRange,
    split: split_shot ? 1 + split_shot : 0,
    shrapnelRank: shrapnel,
    frostbiteRank: frostbite,
    shredPercent: Math.max(0, finiteOr(rawBonus.shredPercent, 0)),
    statusDamage: Math.max(0, finiteOr(rawBonus.statusDamage, 0)),
  };
  if (volley) stats.mechanics.push('multishot');
  if (focus >= 2) stats.mechanics.push('execute');
  if (split_shot) stats.mechanics.push('split_shot');
  if (ricochet) stats.mechanics.push('chain');
  if (shrapnel || napalm) {
    stats.splash = (shrapnel ? 20 + 10 * shrapnel : 0) + 24 * napalm;
  }
  if (shrapnel) {
    stats.burn = {dps: 5 * shrapnel, duration: 2.6};
  }
  if (frostbite) {
    stats.slow = {factor: round4(Math.max(0.5, 0.82 - 0.06 * frostbite)), duration: 2.2};
  }
  if (frostbite || cryo_barrage) {
    stats.brittle = {power: round4(0.1 * frostbite + 0.1 * cryo_barrage), duration: 2.6};
  }
  return stats;
}

/**
 * Raise one hero upgrade by 1. Returns {ok:true} or {ok:false, reason}.
 * Reasons: unknown_upgrade, invalid_state, no_hero, upgrade_capped.
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
    if (id === 'bastion' && state.fence) {
      state.fence.maxHp += 120;
      state.fence.hp += 120;
      state.wallImmunity = Math.max(0, Math.floor(state.wallImmunity || 0)) + 1;
    }
    if (id === 'armored_car' && state.fence) {
      state.fence.maxHp += 80;
      state.fence.hp += 80;
    }
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}
