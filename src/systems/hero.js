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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function upgrade(id, cap, en, zh, info, detail, effect) {
  return deepFreeze({id,cap,name:{en,zh},description:{en:'Hero · '+info,zh:'英雄 · '+detail},effect});
}
export const HERO_UPGRADES = deepFreeze({
  volley:upgrade('volley',2,'Split Volley','齐射扩容','Fire at one additional target per rank.','每级多射击一个目标。',{multishot:1}),
  strike:upgrade('strike',4,'Heavy Bore','重膛装药','Gain 5 damage. Critical hits push enemies back 18 px.','伤害 +5，暴击击退非首领 18 像素。',{damageAdd:5}),
  cadence:upgrade('cadence',4,'Rapid Loader','速射机匣','Gain 14% attack speed.','攻速 +14%。',{haste:0.14}),
  pierce:upgrade('pierce',2,'Armor Core','穿甲弹芯','Pierce one additional target and ignore 25% armor per rank.','每级穿透 +1 名敌人，并忽略 25% 护甲。',{pierce:1}),
  shrapnel:upgrade('shrapnel',3,'Thermobaric','温压破片','Explosive rounds burn enemies for 2.6 seconds. Rank 2+ leaves scorch fire.','爆炸弹溅射并灼烧敌群 2.6 秒，2 级起留下灼烧火坑。',{splash:30,burn:{dps:4,duration:2.6}}),
  frostbite:upgrade('frostbite',3,'Cryo Rounds','急冻弹头','Slow targets and increase damage they take. Rank 2+ shatters on death.','减速目标并使其易伤，2 级起击杀触发冰霜碎裂。',{brittle:{power:0.1,duration:2.6}}),
  focus:upgrade('focus',3,'Kill Switch','弱点锁定','Stronger critical hits. Rank 2 unlocks execution.','提高暴击率与倍率，2 级解锁残血斩杀。',{critChance:0.1,critMultiplier:0.3}),
  bastion:upgrade('bastion',2,'Bastion Ward','堡垒工程','Gain 80 fence HP, 35% surge power and 20% field HP.','栅栏生命 +80，冲击波威力 +35%，工事生命 +20%。',{fence:80}),
  split_shot:upgrade('split_shot',3,'Split Shrapnel','子母分裂弹','Gain 3 damage. Hits burst into 2/3/4 piercing shrapnel bolts.','伤害 +3，命中后向四周分裂出 2/3/4 发贯穿子母弹。',{damageAdd:3}),
  ricochet:upgrade('ricochet',3,'EM Ricochet','电磁穿刺','Gain 2 damage. Shots chain to 2/3/4 foes and call periodic EM sky-strikes.','伤害 +2，子弹电弧弹射 2/3/4 名敌人，并周期降下自动雷击。',{damageAdd:2}),
  napalm:upgrade('napalm',3,'Napalm Barrage','燃油弹火海','Gain 24 px blast radius and auto-lob Napalm canisters leaving a fire sea.','溅射范围 +24 像素，周期自动空投燃油弹形成大范围持续火海。',{splash:24}),
  armored_car:upgrade('armored_car',3,'Armored Sweeper','重装装甲车','Gain 60 fence HP and periodically dispatch an Armored Sweeper truck up the densest lane.','栅栏生命 +60，周期自动从城墙派出重装装甲车碾压整列尸潮。',{fence:60}),
  cryo_barrage:upgrade('cryo_barrage',3,'Glacial Barrage','干冰连发柱','Apply brittle (+10%/rank) and periodically launch a sweeping fan of 5/7/9 piercing ice shards.','附加易伤（+10%/级），周期自动齐射 5/7/9 道贯穿干冰柱击退尸潮。',{brittle:{power:0.1,duration:2.6}}),
  orbital_beam:upgrade('orbital_beam',3,'Orbital Laser','高能射线','Gain +0.25x crit multiplier and periodically fire a vertical piercing laser beam.','暴击倍率 +0.25，周期自动发射纵贯战场的高能激光柱重创整列与首领。',{critMultiplier:0.25})
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
  const {strike, cadence, pierce, volley, shrapnel, frostbite, focus, split_shot, ricochet, napalm, armored_car, cryo_barrage, orbital_beam} = levels;
  const bonus = readBonuses(state);
  const rawBonus = state?.systems?.integration?.bonuses || getProfileBonuses(state?.profileSnapshot) || {};
  const extraPierce = Math.max(0, Math.floor(finiteOr(rawBonus.heroPierce, 0)));
  const stats = {
    ...HERO_BASE,
    mechanics: [],
    damage: round4((HERO_BASE.damage + 5 * strike + 3 * split_shot + 2 * ricochet) * (1 + bonus.damage)),
    interval: round4(HERO_BASE.interval / (1 + 0.14 * cadence + bonus.haste)),
    range: HERO_BASE.range + bonus.range,
    critChance: round4(HERO_BASE.critChance + 0.1 * focus + bonus.critChance),
    critMultiplier: round4(HERO_BASE.critMultiplier + 0.3 * focus + 0.25 * orbital_beam),
    fence: levels.bastion * 80 + armored_car * 60,
    pierce: pierce + extraPierce,
    armorPen: pierce * 0.25,
    critKnockback: (strike ? 18 : 0) + finiteOr(rawBonus.critKnockback, 0),
    multishot: volley,
    chain: ricochet ? 1 + ricochet : 0,
    chainRange: ricochet ? 105 : HERO_BASE.chainRange,
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
    stats.burn = {dps: 4 * shrapnel, duration: 2.6};
  }
  if (frostbite) {
    stats.slow = {factor: round4(0.82 - 0.06 * frostbite), duration: 2.2};
  }
  if (frostbite || cryo_barrage) {
    stats.brittle = {power: round4(0.1 * frostbite + 0.1 * cryo_barrage), duration: 2.6};
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
    if (id === 'armored_car' && state.fence) {
      state.fence.maxHp += 60;
      state.fence.hp += 60;
    }
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}
