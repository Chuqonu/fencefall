import {clamp} from '../shared.js';
import {getProfileBonuses} from './progression.js';

export const HERO_BASE = Object.freeze({
  damage: 14,
  interval: 0.65,
  range: 320,
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
  range: [280, 640],
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

function upgrade(id, cap, en, zh, info, detail, effect) {
  return deepFreeze({id,cap,name:{en,zh},description:{en:info,zh:detail},effect});
}
export const HERO_UPGRADES = deepFreeze({
  volley:upgrade('volley',2,'Split Volley','齐射扩容','Fire at one additional target per rank.','每级多射击一个目标。',{multishot:1}),
  strike:upgrade('strike',4,'Heavy Bore','重膛装药','Gain 5 damage. Critical hits push enemies back 18 px.','伤害 +5，暴击击退非首领 18 像素。',{damageAdd:5}),
  cadence:upgrade('cadence',4,'Rapid Loader','速射机匣','Gain 14% attack speed.','攻速 +14%。',{haste:0.14}),
  pierce:upgrade('pierce',2,'Armor Core','穿甲弹芯','Pierce one additional target and ignore 25% armor per rank.','每级多贯穿一名敌人，并忽略 25% 护甲。',{pierce:1}),
  shrapnel:upgrade('shrapnel',3,'Thermobaric','温压破片','Explosive rounds burn enemies for 2.6 seconds.','爆炸弹溅射并灼烧敌群 2.6 秒。',{}),
  frostbite:upgrade('frostbite',3,'Cryo Rounds','急冻弹头','Slow targets and increase damage they take.','减速目标并使其受到更多伤害。',{}),
  focus:upgrade('focus',3,'Kill Switch','弱点锁定','Stronger critical hits. Rank 2 unlocks execution.','提高暴击率与倍率，2 级解锁残血斩杀。',{critChance:0.1,critMultiplier:0.3}),
  bastion:upgrade('bastion',2,'Bastion Ward','堡垒工程','Gain 80 fence HP, 35% surge power and 20% field HP.','栅栏生命 +80，冲击波威力 +35%，工事生命 +20%。',{})
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
  const {strike,cadence,pierce,volley,shrapnel,frostbite,focus} = levels;
  const bonus = readBonuses(state);
  const stats = {...HERO_BASE, mechanics:[],
    damage:round4((HERO_BASE.damage+5*strike)*(1+bonus.damage)),
    interval:round4(HERO_BASE.interval/(1+0.14*cadence+bonus.haste)),
    range:HERO_BASE.range+bonus.range,
    critChance:round4(HERO_BASE.critChance+0.1*focus+bonus.critChance),
    critMultiplier:round4(HERO_BASE.critMultiplier+0.3*focus),
    pierce, armorPen:pierce*0.25, critKnockback:strike ? 18 : 0, multishot:volley};
  if (volley) stats.mechanics.push('multishot');
  if (focus >= 2) stats.mechanics.push('execute');
  if (shrapnel) {
    stats.splash = 20+10*shrapnel;
    stats.burn = {dps:4*shrapnel,duration:2.6};
  }
  if (frostbite) {
    stats.slow = {factor:round4(0.82-0.06*frostbite),duration:2.2};
    stats.brittle = {power:round4(0.1*frostbite),duration:2.6};
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
    if (id === 'bastion' && state.fence) {
      state.fence.maxHp += 80;
      state.fence.hp += 80;
      for (const {unit} of state.fieldSlots || []) {
        if (!unit) continue;
        const gain = unit.maxHp * 0.2 / (1 + current*0.2);
        unit.maxHp += gain;
        unit.hp += gain;
      }
    }
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}
