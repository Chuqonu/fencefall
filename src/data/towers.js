import {getProfileBonuses} from '../systems/progression.js';
import {getHeroStats} from '../systems/hero.js';

export const MIN_USEFUL_RANGE = 210;

/** Caps and formulas for support auras. Combat owns the application. */
export const AURA_RULES = Object.freeze({
  includeSelf: true,
  measuredFrom: 'defender slot center',
  affects: 'defenders',
  excludes: 'enemies',
  stack: 'sum',
  damageCap: 0.6,
  hasteCap: 0.45,
  damageFormula: 'damage * (1 + clampedDamageBonus)',
  hasteFormula: 'interval / (1 + clampedHaste)'
});

/**
 * Rank-1 stats are multiplied by these tables. Index 0 is rank 1.
 * Tuned for direct 1-card = +1 level turret progression (Lv.1 -> Lv.4).
 */
export const RANK_SCALE = Object.freeze({
  maxRank: 4,
  damage: Object.freeze([1, 1.9, 3.1, 4.8]),
  interval: Object.freeze([1, 0.91, 0.83, 0.76]),
  rangeAdd: Object.freeze([0, 16, 32, 48]),
  critAdd: Object.freeze([0, 0.02, 0.04, 0.07]),
  critMultiplierAdd: Object.freeze([0, 0.06, 0.12, 0.2]),
  projectileSpeedAdd: Object.freeze([0, 20, 40, 60]),
  splashAdd: Object.freeze([0, 6, 12, 18]),
  chainAdd: Object.freeze([0, 1, 1, 2]),
  chainRangeAdd: Object.freeze([0, 8, 16, 24]),
  pierceAdd: Object.freeze([0, 0, 1, 2]),
  effect: Object.freeze([1, 1.7, 2.7, 4.1]),
  duration: Object.freeze([1, 1.1, 1.2, 1.32]),
  slowFactorReduce: Object.freeze([0, 0.05, 0.1, 0.14]),
  poisonStacksAdd: Object.freeze([0, 0, 1, 2]),
  auraPower: Object.freeze([1, 1.2, 1.42, 1.65]),
  auraRangeAdd: Object.freeze([0, 10, 20, 30]),
  intervalFloor: 0.4,
  critChanceCap: 0.45,
  critMultiplierCap: 2.5,
  projectileSpeedCap: 680,
  splashCap: 84,
  chainCap: 5,
  chainRangeCap: 140,
  pierceCap: 4,
  durationCap: 8,
  slowFactorFloor: 0.42,
  poisonStacksCap: 6,
  auraRangeCap: 170
});

/** How UnitStats effect blocks map onto the shared status object. */
export const STATUS_HOOKS = Object.freeze({
  burn: Object.freeze({type: 'burn', power: 'dps', remaining: 'duration'}),
  poison: Object.freeze({type: 'poison', power: 'dps per stack', remaining: 'duration', stacks: 'start at 1 and cap at maxStacks'}),
  slow: Object.freeze({type: 'slow', power: 'remaining speed factor, not a percentage reduction', remaining: 'duration'})
});

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function roundTo(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clampRank(rank) {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return 1;
  return clamp(Math.round(rank), 1, RANK_SCALE.maxRank);
}

function plainClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function copyEffect(source) {
  return source && typeof source === 'object' ? plainClone(source) : null;
}

function withDefaults(stats) {
  const src = stats && typeof stats === 'object' && !Array.isArray(stats) ? plainClone(stats) : {};
  const known = new Set(['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce', 'mechanics', 'burn', 'slow', 'poison', 'aura']);
  const out = {
    damage: Math.max(0, num(src.damage, 0)),
    interval: num(src.interval, 1) > 0 ? num(src.interval, 1) : 1,
    range: Math.max(0, num(src.range, MIN_USEFUL_RANGE)),
    critChance: num(src.critChance, 0),
    critMultiplier: num(src.critMultiplier, 1.75) > 0 ? num(src.critMultiplier, 1.75) : 1.75,
    projectileSpeed: num(src.projectileSpeed, 300) > 0 ? num(src.projectileSpeed, 300) : 300,
    splash: Math.max(0, num(src.splash, 0)),
    chain: Math.max(0, num(src.chain, 0)),
    chainRange: num(src.chainRange, 70) > 0 ? num(src.chainRange, 70) : 70,
    pierce: Math.max(0, num(src.pierce, 0)),
    mechanics: Array.isArray(src.mechanics) ? src.mechanics.filter((item) => typeof item === 'string') : []
  };
  for (const key of Object.keys(src)) if (!known.has(key)) out[key] = src[key];
  if (src.burn && typeof src.burn === 'object') {
    out.burn = copyEffect(src.burn);
    out.burn.dps = Math.max(0, num(src.burn.dps, 0));
    out.burn.duration = Math.max(0, num(src.burn.duration, 0));
  }
  if (src.slow && typeof src.slow === 'object') {
    out.slow = copyEffect(src.slow);
    out.slow.factor = num(src.slow.factor, 1);
    out.slow.duration = Math.max(0, num(src.slow.duration, 0));
  }
  if (src.poison && typeof src.poison === 'object') {
    out.poison = copyEffect(src.poison);
    out.poison.dps = Math.max(0, num(src.poison.dps, 0));
    out.poison.duration = Math.max(0, num(src.poison.duration, 0));
    out.poison.maxStacks = Math.max(1, Math.round(num(src.poison.maxStacks, 1)));
  }
  if (src.aura && typeof src.aura === 'object') {
    out.aura = copyEffect(src.aura);
    out.aura.range = Math.max(0, num(src.aura.range, 0));
    out.aura.damage = Math.max(0, num(src.aura.damage, 0));
    out.aura.haste = Math.max(0, num(src.aura.haste, 0));
  }
  return out;
}

function scaleStats(baseStats, rank) {
  const index = clampRank(rank) - 1;
  const out = withDefaults(baseStats);
  out.damage = roundTo(out.damage * RANK_SCALE.damage[index], 2);
  out.interval = roundTo(Math.max(RANK_SCALE.intervalFloor, out.interval * RANK_SCALE.interval[index]), 3);
  out.range = Math.max(MIN_USEFUL_RANGE, Math.round(out.range + RANK_SCALE.rangeAdd[index]));
  out.critChance = roundTo(clamp(out.critChance + RANK_SCALE.critAdd[index], 0, RANK_SCALE.critChanceCap), 4);
  out.critMultiplier = roundTo(clamp(out.critMultiplier + RANK_SCALE.critMultiplierAdd[index], 1, RANK_SCALE.critMultiplierCap), 4);
  out.projectileSpeed = Math.round(clamp(out.projectileSpeed + RANK_SCALE.projectileSpeedAdd[index], 40, RANK_SCALE.projectileSpeedCap));
  if (out.splash > 0) out.splash = roundTo(Math.min(RANK_SCALE.splashCap, out.splash + RANK_SCALE.splashAdd[index]), 2);
  if (out.chain > 0) {
    out.chain = Math.min(RANK_SCALE.chainCap, Math.round(out.chain + RANK_SCALE.chainAdd[index]));
    out.chainRange = Math.min(RANK_SCALE.chainRangeCap, Math.round(out.chainRange + RANK_SCALE.chainRangeAdd[index]));
  }
  if (out.pierce > 0) out.pierce = Math.min(RANK_SCALE.pierceCap, Math.round(out.pierce + RANK_SCALE.pierceAdd[index]));
  if (out.burn) {
    out.burn.dps = roundTo(out.burn.dps * RANK_SCALE.effect[index], 2);
    out.burn.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.burn.duration * RANK_SCALE.duration[index]), 2);
  }
  if (out.slow) {
    out.slow.factor = roundTo(clamp(out.slow.factor - RANK_SCALE.slowFactorReduce[index], RANK_SCALE.slowFactorFloor, 1), 4);
    out.slow.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.slow.duration * RANK_SCALE.duration[index]), 2);
  }
  if (out.poison) {
    out.poison.dps = roundTo(out.poison.dps * RANK_SCALE.effect[index], 2);
    out.poison.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.poison.duration * RANK_SCALE.duration[index]), 2);
    out.poison.maxStacks = Math.min(RANK_SCALE.poisonStacksCap, Math.max(1, Math.round(out.poison.maxStacks + RANK_SCALE.poisonStacksAdd[index])));
  }
  if (out.aura) {
    out.aura.range = Math.min(RANK_SCALE.auraRangeCap, Math.round(out.aura.range + RANK_SCALE.auraRangeAdd[index]));
    out.aura.damage = roundTo(out.aura.damage * RANK_SCALE.auraPower[index], 4);
    out.aura.haste = roundTo(out.aura.haste * RANK_SCALE.auraPower[index], 4);
  }
  return out;
}

function inertStats() {
  return withDefaults({
    damage: 0,
    interval: 1,
    range: MIN_USEFUL_RANGE,
    critChance: 0,
    critMultiplier: 1.75,
    projectileSpeed: 300,
    splash: 0,
    chain: 0,
    chainRange: 70,
    pierce: 0,
    mechanics: []
  });
}

function tower(id, en, zh, roleEn, roleZh, summary, detail, damage, interval, range, effects) {
  return {
    id,
    name: {en, zh},
    role: {en: roleEn, zh: roleZh},
    description: {en: summary, zh: detail},
    stats: withDefaults({
      damage,
      interval,
      range,
      ...effects,
      mechanics: ['projectile', ...Object.keys(effects)
        .filter((k) => !['chainRange', 'critMultiplier', 'projectileSpeed'].includes(k))
        .map((k) => (k === 'critChance' ? 'crit' : k))]
    })
  };
}

export const TOWERS = {
  bolt: tower('bolt', 'Rivet', '穿钉', 'Projectile', '投射',
    'Pierce a second target with a fast critical bolt.',
    '快速弩矢可暴击并贯穿第二个目标。',
    14, 0.65, 300,
    {pierce: 1, critChance: 0.16, critMultiplier: 1.85, projectileSpeed: 460}),
  fire: tower('fire', 'Cinder', '烬火', 'Fire', '火焰',
    'Burn clustered enemies in a 44 px burst.',
    '火弹在 44 像素范围内溅射并灼烧敌群。',
    12, 0.94, 285,
    {splash: 44, burn: {dps: 5.5, duration: 2.8}, projectileSpeed: 320}),
  frost: tower('frost', 'Rime', '霜结', 'Frost', '冰霜',
    'Frost splashes slow a group to 62% speed.',
    '冰弹溅射，使敌群移速降至 62%。',
    10, 0.84, 295,
    {splash: 28, slow: {factor: 0.62, duration: 2.5}}),
  lightning: tower('lightning', 'Arc', '弧雷', 'Lightning', '闪电',
    'Chain across three targets with a chance to stun.',
    '电弧连锁三个目标，有概率麻痹。',
    13, 1.06, 320,
    {chain: 2, chainRange: 96, stun: {duration: 0.28, chance: 0.22}, projectileSpeed: 560}),
  poison: tower('poison', 'Blight', '瘴毒', 'Poison', '毒素',
    'Stack armor-piercing venom on tough targets.',
    '穿透 40% 护甲，持续叠毒瓦解重甲。',
    7, 0.76, 290,
    {poison: {dps: 4, duration: 4.5, maxStacks: 4}, armorPen: 0.4}),
  support: tower('support', 'Banner', '旌旗', 'Support', '辅助',
    'Buff nearby allies and expose priority targets.',
    '光环强化周边火力与攻速，并令高危目标易伤。',
    7, 1.0, 290,
    {aura: {range: 130, damage: 0.16, haste: 0.12}, brittle: {power: 0.14, duration: 2.4}})
};

function heroStats(unit, state) {
  const stats = getHeroStats(unit, state);
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('getHeroStats must return a stats object');
  return withDefaults(stats);
}

/**
 * Fresh UnitStats for the hero or a bastion turret (Lv.1-Lv.4).
 * Unknown tower ids return finite zero damage instead of throwing.
 * @param {{kind?:string,type?:string,rank?:number}|null|undefined} unit
 * @param {object} [state] Passed through to getHeroStats.
 */
export function getUnitStats(unit, state) {
  if (!unit || typeof unit !== 'object') return inertStats();
  if (unit.kind === 'hero' || unit.type === 'hero') return heroStats(unit, state);
  const base = TOWERS[unit.type];
  if (!base) return inertStats();
  const stats = scaleStats(base.stats, unit.rank);
  const bonus = state?.systems?.integration?.bonuses || getProfileBonuses(state?.profileSnapshot);
  stats.damage *= 1 + (bonus.damage || 0);
  stats.interval /= 1 + (bonus.haste || 0);
  stats.critChance += bonus.critChance || 0;
  if (bonus.critKnockback) stats.critKnockback = bonus.critKnockback;
  return stats;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

deepFreeze(TOWERS);
