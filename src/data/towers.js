/**
 * Base tower catalog. Keys match BASE_TYPES in src/shared.js.
 *
 * TOWERS[*].stats and RECIPES[*].stats are rank-1 baselines. getUnitStats copies
 * them and applies RANK_SCALE for ranks 1–4. It does not mutate the catalog,
 * the recipe, the unit, or the run, and it never rolls RNG or spends ids.
 *
 * Hero units delegate to getHeroStats. Equipment and permanent bonuses stay
 * inside that function; applying them here would count them twice.
 *
 * Attack range is logical pixels from the defender slot center to an enemy
 * center. The back row sits just behind the front row, and the fence sits just
 * ahead of the front row. Every base range clears the back-row gap to the fence
 * and still covers at least a neighboring column along the fence. Towers and
 * hybrids never come back below MIN_USEFUL_RANGE. Aura range does not use that floor.
 *
 * chain and pierce count extra targets after the primary, so the default 0
 * means a single target. Splash damages other enemies within that radius of
 * the primary center and does not damage the primary a second time. A burn on
 * that shot is applied to those other enemies too.
 *
 * Combat should turn hits into applyStatus like this: burn power = dps, poison
 * power = dps per stack, slow power = remaining speed factor (0.64 keeps 64%
 * speed). Aura is not an enemy status. Sum aura.damage and aura.haste from
 * every banner whose aura range reaches the defender's slot center, including
 * the banner itself, then clamp to AURA_RULES. Shot damage is multiplied by
 * (1 + clamped damage). Shot interval is divided by (1 + clamped haste).
 * Every base tower fires on its interval, including support.
 * Unknown extra stat fields are copied through and are not rank-scaled.
 */
import {ARENA, BASE_TYPES, slotGeometry} from '../shared.js';
import {RECIPES} from './recipes.js';
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
 * chain/pierce/splash/poison stacks only grow when the baseline already has them.
 */
export const RANK_SCALE = Object.freeze({
  maxRank: 4,
  damage: Object.freeze([1, 2.6, 5.6, 12]),
  interval: Object.freeze([1, 0.9, 0.82, 0.74]),
  rangeAdd: Object.freeze([0, 18, 36, 56]),
  critAdd: Object.freeze([0, 0.015, 0.03, 0.05]),
  critMultiplierAdd: Object.freeze([0, 0.05, 0.1, 0.15]),
  projectileSpeedAdd: Object.freeze([0, 20, 40, 60]),
  splashAdd: Object.freeze([0, 6, 12, 18]),
  chainAdd: Object.freeze([0, 0, 1, 2]),
  chainRangeAdd: Object.freeze([0, 8, 14, 20]),
  pierceAdd: Object.freeze([0, 0, 0, 1]),
  effect: Object.freeze([1, 1.8, 3.2, 5.5]),
  duration: Object.freeze([1, 1.1, 1.2, 1.32]),
  slowFactorReduce: Object.freeze([0, 0.04, 0.08, 0.12]),
  poisonStacksAdd: Object.freeze([0, 0, 0, 1]),
  auraPower: Object.freeze([1, 1.18, 1.36, 1.54]),
  auraRangeAdd: Object.freeze([0, 8, 16, 24]),
  intervalFloor: 0.4,
  critChanceCap: 0.4,
  critMultiplierCap: 2.5,
  projectileSpeedCap: 680,
  splashCap: 84,
  chainCap: 4,
  chainRangeCap: 130,
  pierceCap: 3,
  durationCap: 8,
  slowFactorFloor: 0.42,
  poisonStacksCap: 5,
  auraRangeCap: 160
});

/** How UnitStats effect blocks map onto the shared status object. */
export const STATUS_HOOKS = Object.freeze({
  burn: Object.freeze({type: 'burn', power: 'dps', remaining: 'duration'}),
  poison: Object.freeze({type: 'poison', power: 'dps per stack', remaining: 'duration', stacks: 'start at 1 and cap at maxStacks'}),
  slow: Object.freeze({type: 'slow', power: 'remaining speed factor, not a percentage reduction', remaining: 'duration'})
});

const CORE_FIELDS = ['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce'];

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
    mechanics: Array.isArray(src.mechanics) ? src.mechanics.filter(item => typeof item === 'string') : []
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

function findRecipe(type) {
  if (typeof type !== 'string' || !Array.isArray(RECIPES)) return null;
  for (const recipe of RECIPES) {
    if (recipe && recipe.id === type && recipe.stats && typeof recipe.stats === 'object') return recipe;
  }
  return null;
}

function finiteTree(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object') return true;
  return Object.values(value).every(item => finiteTree(item));
}

const boltStats = {
  damage: 11,
  interval: 0.7,
  range: 260,
  critChance: 0.15,
  critMultiplier: 1.85,
  projectileSpeed: 440,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 1,
  mechanics: ['projectile', 'crit', 'pierce']
};

const fireStats = {
  damage: 8,
  interval: 1.05,
  range: 240,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 250,
  splash: 36,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  burn: {dps: 4, duration: 2.6},
  mechanics: ['projectile', 'splash', 'burn']
};

const frostStats = {
  damage: 7,
  interval: 0.9,
  range: 255,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 300,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  slow: {factor: 0.64, duration: 2.2},
  mechanics: ['projectile', 'slow']
};

const lightningStats = {
  damage: 10,
  interval: 1.2,
  range: 275,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 560,
  splash: 0,
  chain: 2,
  chainRange: 80,
  pierce: 0,
  mechanics: ['projectile', 'chain']
};

const poisonStats = {
  damage: 4,
  interval: 0.8,
  range: 245,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 290,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  poison: {dps: 2.4, duration: 4, maxStacks: 3},
  mechanics: ['projectile', 'poison']
};

const supportStats = {
  damage: 5,
  interval: 1.1,
  range: 235,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 320,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  aura: {range: 116, damage: 0.12, haste: 0.08},
  mechanics: ['projectile', 'aura']
};

function percent(fraction) {
  return Math.round(fraction * 100);
}

const columnPitch = slotGeometry(1).x - slotGeometry(0).x;
const rowPitch = ARENA.backY - ARENA.frontY;
const twoSlotsAway = columnPitch * 2;
const supportAuraMax = supportStats.aura.range + RANK_SCALE.auraRangeAdd[RANK_SCALE.maxRank - 1];
const supportReach = supportAuraMax < twoSlotsAway
  ? {
      en: 'At every rank the aura covers neighboring slots, diagonals included, and does not reach a slot two places away.',
      zh: '每一阶的光环都能覆盖相邻槽位（含对角），但到不了隔一个槽位。'
    }
  : {
      en: 'The aura is measured between slot centers and stays smaller than the attack range.',
      zh: '光环按槽位中心之间的距离计算，并且始终小于攻击射程。'
    };

const BASE_IDENTITY = Object.freeze({
  bolt: Object.freeze({
    role: Object.freeze({en: 'Projectile', zh: '投射'}),
    name: Object.freeze({en: 'Rivet', zh: '穿钉'})
  }),
  fire: Object.freeze({
    role: Object.freeze({en: 'Fire', zh: '火焰'}),
    name: Object.freeze({en: 'Cinder', zh: '烬火'})
  }),
  frost: Object.freeze({
    role: Object.freeze({en: 'Frost', zh: '冰霜'}),
    name: Object.freeze({en: 'Rime', zh: '霜结'})
  }),
  lightning: Object.freeze({
    role: Object.freeze({en: 'Lightning', zh: '闪电'}),
    name: Object.freeze({en: 'Arc', zh: '弧雷'})
  }),
  poison: Object.freeze({
    role: Object.freeze({en: 'Poison', zh: '毒素'}),
    name: Object.freeze({en: 'Blight', zh: '瘴毒'})
  }),
  support: Object.freeze({
    role: Object.freeze({en: 'Support', zh: '辅助'}),
    name: Object.freeze({en: 'Banner', zh: '旌旗'})
  })
});

function joinEnglish(clauses) {
  if (clauses.length <= 1) return clauses.join('');
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

// Follows the role sentence. Hybrid names and the other parent come from RECIPES.
function partnerSentence(type) {
  const rows = [];
  for (const recipe of RECIPES) {
    const parents = recipe?.parents;
    if (!Array.isArray(parents) || parents.length !== 2 || !parents.includes(type)) continue;
    const other = parents[0] === type ? parents[1] : parents[0];
    const partner = BASE_IDENTITY[other];
    if (!partner?.role?.en || !partner?.role?.zh || !partner?.name?.en || !partner?.name?.zh || !recipe.name?.en || !recipe.name?.zh) {
      throw new Error(`missing merge partner text for ${type}+${other}`);
    }
    rows.push({other, partner, hybrid: recipe.name});
  }
  rows.sort((a, b) => BASE_TYPES.indexOf(a.other) - BASE_TYPES.indexOf(b.other));
  if (rows.length !== BASE_TYPES.length - 1) throw new Error(`${type} must name a hybrid with every other base type`);
  const en = `${joinEnglish(rows.map((row, index) => {
    const label = `${row.partner.role.en} (${row.partner.name.en})`;
    const verb = index === 0 ? `Merged with ${label} it becomes` : `with ${label} it becomes`;
    return `${verb} ${row.hybrid.en}`;
  }))}.`;
  const zh = `${rows.map((row, index) => {
    const lead = index === 0 ? '它与' : '与';
    return `${lead}${row.partner.role.zh}（${row.partner.name.zh}）合成为${row.hybrid.zh}`;
  }).join('，')}。`;
  return {en, zh};
}

const boltPartners = partnerSentence('bolt');
const firePartners = partnerSentence('fire');
const frostPartners = partnerSentence('frost');
const lightningPartners = partnerSentence('lightning');
const poisonPartners = partnerSentence('poison');
const supportPartners = partnerSentence('support');

export const TOWERS = Object.freeze({
  bolt: Object.freeze({
    id: 'bolt',
    role: BASE_IDENTITY.bolt.role,
    name: BASE_IDENTITY.bolt.name,
    description: Object.freeze({
      en: `Projectile shots pierce one extra enemy and can crit. ${boltPartners.en} Rank 1 deals ${boltStats.damage} damage every ${boltStats.interval}s. Attack range is ${boltStats.range}. It fires a fast rivet from its slot center at the enemy closest to the fence in that range. There are no lanes. It pierces ${boltStats.pierce} extra enemy and has a ${percent(boltStats.critChance)}% chance to crit for ${boltStats.critMultiplier}× damage. Ranks 2–4 raise damage, attack speed, crit, and range. Rank 4 pierces one more enemy. Rank never exceeds 4.`,
      zh: `投射会贯穿额外一名敌人，并且可以暴击。${boltPartners.zh}1 阶伤害 ${boltStats.damage}，攻击间隔 ${boltStats.interval} 秒，攻击射程 ${boltStats.range}。从槽位中心攻击该射程内最靠近栅栏的敌人，不按列锁定。可额外贯穿 ${boltStats.pierce} 名敌人，并有 ${percent(boltStats.critChance)}% 几率造成 ${boltStats.critMultiplier} 倍暴击。2 至 4 阶提高伤害、攻速、暴击和射程。4 阶再多贯穿 1 名敌人。阶数最高为 4。`
    }),
    stats: Object.freeze(boltStats)
  }),
  fire: Object.freeze({
    id: 'fire',
    role: BASE_IDENTITY.fire.role,
    name: BASE_IDENTITY.fire.name,
    description: Object.freeze({
      en: `Fire shots burn the target and splash that same hit onto nearby enemies. ${firePartners.en} Rank 1 deals ${fireStats.damage} damage every ${fireStats.interval}s. Attack range is ${fireStats.range}. The target burns for ${fireStats.burn.dps} damage per second for ${fireStats.burn.duration}s. Every other enemy within splash radius ${fireStats.splash} of the target takes that same hit and burn. The first target is not damaged twice. Higher ranks strengthen the burst, the burn, and the range, through rank 4.`,
      zh: `火焰会让目标燃烧，并把同样的一击溅射到附近敌人。${firePartners.zh}1 阶伤害 ${fireStats.damage}，攻击间隔 ${fireStats.interval} 秒，攻击射程 ${fireStats.range}。目标以每秒 ${fireStats.burn.dps} 点燃烧 ${fireStats.burn.duration} 秒。距离目标溅射半径 ${fireStats.splash} 以内的其他敌人受到相同的撞击和燃烧，第一个目标不会被结算两次。更高阶会加强爆炸、燃烧和射程，最高 4 阶。`
    }),
    stats: Object.freeze(fireStats)
  }),
  frost: Object.freeze({
    id: 'frost',
    role: BASE_IDENTITY.frost.role,
    name: BASE_IDENTITY.frost.name,
    description: Object.freeze({
      en: `Frost shots slow one enemy. ${frostPartners.en} Rank 1 deals ${frostStats.damage} damage every ${frostStats.interval}s. Attack range is ${frostStats.range}. The shot is single-target and slows that enemy to ${percent(frostStats.slow.factor)}% movement speed for ${frostStats.slow.duration}s. Slow is the speed the enemy keeps, not a percent subtracted. It does not splash or freeze. Higher ranks slow a little more, but remaining speed never drops below ${percent(RANK_SCALE.slowFactorFloor)}%.`,
      zh: `冰霜会减速单个敌人。${frostPartners.zh}1 阶伤害 ${frostStats.damage}，攻击间隔 ${frostStats.interval} 秒，攻击射程 ${frostStats.range}。这是单体射击，并在 ${frostStats.slow.duration} 秒内使该敌人的移速变为 ${percent(frostStats.slow.factor)}%。减速数值是敌人保留的移速，不是被减去的百分比。没有溅射，也不能冻结。更高阶会稍加强减速，但剩余移速不会低于 ${percent(RANK_SCALE.slowFactorFloor)}%。`
    }),
    stats: Object.freeze(frostStats)
  }),
  lightning: Object.freeze({
    id: 'lightning',
    role: BASE_IDENTITY.lightning.role,
    name: BASE_IDENTITY.lightning.name,
    description: Object.freeze({
      en: `Lightning chains to extra enemies and ignores columns. ${lightningPartners.en} Rank 1 deals ${lightningStats.damage} damage every ${lightningStats.interval}s. Attack range is ${lightningStats.range}, the longest of the base towers. It then jumps to ${lightningStats.chain} extra enemies. Each jump reaches at most ${lightningStats.chainRange} from the previous enemy. Ranks 3 and 4 each add one jump, up to ${RANK_SCALE.chainCap} extra targets.`,
      zh: `闪电会连锁到额外敌人，不按列限制。${lightningPartners.zh}1 阶伤害 ${lightningStats.damage}，攻击间隔 ${lightningStats.interval} 秒，攻击射程 ${lightningStats.range}，是基础塔里最长的。然后跳向另外 ${lightningStats.chain} 名敌人。每次跳跃最远离上一名敌人 ${lightningStats.chainRange}。3 阶和 4 阶各增加 1 次跳跃，额外目标最多 ${RANK_SCALE.chainCap} 个。`
    }),
    stats: Object.freeze(lightningStats)
  }),
  poison: Object.freeze({
    id: 'poison',
    role: BASE_IDENTITY.poison.role,
    name: BASE_IDENTITY.poison.name,
    description: Object.freeze({
      en: `Poison stacks on one tough enemy. ${poisonPartners.en} Rank 1 deals ${poisonStats.damage} damage every ${poisonStats.interval}s. Attack range is ${poisonStats.range}. Each hit adds one poison stack. Each stack deals ${poisonStats.poison.dps} damage per second for ${poisonStats.poison.duration}s, up to ${poisonStats.poison.maxStacks} stacks. Status rules refresh the timer and cap the stacks. Rank 4 adds one stack, and stacks never exceed ${RANK_SCALE.poisonStacksCap}.`,
      zh: `毒素会叠在单个厚血敌人身上。${poisonPartners.zh}1 阶直接伤害 ${poisonStats.damage}，攻击间隔 ${poisonStats.interval} 秒，攻击射程 ${poisonStats.range}。命中时叠加 1 层瘴毒。每层每秒造成 ${poisonStats.poison.dps} 点伤害，持续 ${poisonStats.poison.duration} 秒，最多 ${poisonStats.poison.maxStacks} 层。持续时间刷新和层数上限由状态系统处理。4 阶额外增加 1 层，层数绝不超过 ${RANK_SCALE.poisonStacksCap}。`
    }),
    stats: Object.freeze(poisonStats)
  }),
  support: Object.freeze({
    id: 'support',
    role: BASE_IDENTITY.support.role,
    name: BASE_IDENTITY.support.name,
    description: Object.freeze({
      en: `Support buffs nearby defenders, including itself, and this banner still fires. ${supportPartners.en} Rank 1 deals ${supportStats.damage} damage every ${supportStats.interval}s. Attack range is ${supportStats.range}. It shoots a light bolt at the enemy closest to the fence within that range of this slot's center, across columns, by the same rule as the other towers. The aura does not target enemies. Its range is separate (${supportStats.aura.range} at rank 1). Every defender whose slot center is inside that aura, including this banner, gains +${percent(supportStats.aura.damage)}% damage and +${percent(supportStats.aura.haste)}% haste. Bonuses from several banners add together. Combat caps the combined damage bonus at ${percent(AURA_RULES.damageCap)}% and the combined haste at ${percent(AURA_RULES.hasteCap)}%. Haste sets the attack interval to interval ÷ (1 + haste). ${supportReach.en} Rank never exceeds 4.`,
      zh: `辅助会强化附近的防御者（包括自身），同时这面旌旗仍然射击。${supportPartners.zh}1 阶伤害 ${supportStats.damage}，攻击间隔 ${supportStats.interval} 秒，攻击射程 ${supportStats.range}。射击规则与其他塔相同：攻击距离槽位中心该射程以内、最靠近栅栏的敌人，可以跨列。光环不锁定敌人，范围单独计算（1 阶为 ${supportStats.aura.range}）。槽位中心落在光环内的防御者（包括这面旌旗）获得 ${percent(supportStats.aura.damage)}% 伤害和 ${percent(supportStats.aura.haste)}% 急速。多面旌旗的加成相加。战斗把合计伤害加成限制在 ${percent(AURA_RULES.damageCap)}%，合计急速限制在 ${percent(AURA_RULES.hasteCap)}%。急速把攻击间隔改为间隔 ÷ (1 + 急速)。${supportReach.zh}阶数最高为 4。`
    }),
    stats: Object.freeze(supportStats)
  })
});

function heroStats(unit, state) {
  const stats = getHeroStats(unit, state);
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('getHeroStats must return a stats object');
  return withDefaults(stats);
}

/**
 * Fresh UnitStats for a hero, base tower, or hybrid.
 * Hybrid lookup uses RECIPES[].id === unit.type. Same-type towers keep their base id.
 * Unknown tower ids return finite zero damage instead of throwing.
 * @param {{kind?:string,type?:string,rank?:number}|null|undefined} unit
 * @param {object} [state] Passed through to getHeroStats. Unused for towers.
 */
export function getUnitStats(unit, state) {
  if (!unit || typeof unit !== 'object') return inertStats();
  if (unit.kind === 'hero' || unit.type === 'hero') return heroStats(unit, state);
  if (unit.kind === 'hybrid') {
    const recipe = findRecipe(unit.type);
    if (recipe) return scaleStats(recipe.stats, unit.rank);
    if (TOWERS[unit.type]) return scaleStats(TOWERS[unit.type].stats, unit.rank);
    return inertStats();
  }
  if (TOWERS[unit.type]) return scaleStats(TOWERS[unit.type].stats, unit.rank);
  const recipe = findRecipe(unit.type);
  if (recipe) return scaleStats(recipe.stats, unit.rank);
  return inertStats();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

deepFreeze(TOWERS);

function assertCatalog() {
  const ids = ['bolt', 'fire', 'frost', 'lightning', 'poison', 'support'];
  if (Object.keys(TOWERS).join(',') !== ids.join(',')) throw new Error('TOWERS keys must match BASE_TYPES');
  const before = JSON.stringify(TOWERS);
  const rearGap = ARENA.backY - ARENA.fenceY;
  const diagonal = Math.hypot(columnPitch, rowPitch);
  for (const id of ids) {
    const tower = TOWERS[id];
    if (!tower.name?.en || !tower.name?.zh || !tower.description?.en || !tower.description?.zh) throw new Error(`missing bilingual text: ${id}`);
    if (!tower.description.en.startsWith(tower.role.en) || !tower.description.zh.startsWith(tower.role.zh)) {
      throw new Error(`${id} blurb does not lead with its role`);
    }
    const enAfterRole = tower.description.en.slice(tower.description.en.indexOf('.') + 1);
    const zhAfterRole = tower.description.zh.slice(tower.description.zh.indexOf('。') + 1);
    for (const recipe of RECIPES) {
      const parents = recipe?.parents;
      if (!Array.isArray(parents) || !parents.includes(id)) continue;
      const other = parents[0] === id ? parents[1] : parents[0];
      const partner = BASE_IDENTITY[other];
      if (!enAfterRole.includes(recipe.name.en) || !enAfterRole.includes(partner.role.en) || !enAfterRole.includes(partner.name.en)) {
        throw new Error(`${id} blurb does not name hybrid ${recipe.id} in English`);
      }
      if (!zhAfterRole.includes(recipe.name.zh) || !zhAfterRole.includes(partner.role.zh) || !zhAfterRole.includes(partner.name.zh)) {
        throw new Error(`${id} blurb does not name hybrid ${recipe.id} in Chinese`);
      }
    }
    for (const field of ['damage', 'interval', 'range']) {
      const token = String(tower.stats[field]);
      if (!tower.description.en.includes(token) || !tower.description.zh.includes(token)) {
        throw new Error(`${id} blurb does not state ${field} ${token}`);
      }
    }
    if (!(tower.stats.range > rearGap)) throw new Error(`${id} cannot reach across the fence from the back row`);
    const reach = Math.sqrt(tower.stats.range * tower.stats.range - rearGap * rearGap);
    if (!(reach >= columnPitch)) throw new Error(`${id} back-row range misses the neighboring column at the fence`);
    for (let rank = 1; rank <= 4; rank += 1) {
      const stats = scaleStats(tower.stats, rank);
      if (!finiteTree(stats)) throw new Error(`${id} rank ${rank} is not finite`);
      if (stats.range < MIN_USEFUL_RANGE || stats.interval < RANK_SCALE.intervalFloor) throw new Error(`${id} rank ${rank} broke a bound`);
      if (stats.mechanics === tower.stats.mechanics) throw new Error(`${id} leaked the catalog mechanics array`);
    }
    const low = scaleStats(tower.stats, 1);
    const high = scaleStats(tower.stats, 4);
    if (high.damage < low.damage || high.interval > low.interval || high.range < low.range) throw new Error(`${id} rank scaling reversed`);
    for (const field of CORE_FIELDS) {
      if (!Number.isFinite(low[field])) throw new Error(`${id} ${field}`);
    }
  }
  if (!(TOWERS.support.stats.aura.range > diagonal)) throw new Error('support aura misses a diagonal neighbor');
  const stopsShort = supportAuraMax < twoSlotsAway;
  const saysShort = TOWERS.support.description.en.includes('does not reach a slot two places away')
    && TOWERS.support.description.zh.includes('隔一个槽位');
  if (stopsShort !== saysShort) throw new Error('support aura reach sentence does not match the column pitch');
  const unit = {kind: 'tower', type: 'bolt', rank: 2, cooldown: 1, kills: 0, upgrades: {}};
  const unitBefore = JSON.stringify(unit);
  const rolled = {rng: 99, nextId: 4};
  const shot = getUnitStats(unit, rolled);
  shot.damage = 0;
  shot.mechanics.push('mutated');
  if (JSON.stringify(unit) !== unitBefore) throw new Error('getUnitStats mutated the unit');
  if (JSON.stringify(TOWERS) !== before) throw new Error('getUnitStats mutated the catalog');
  if (rolled.rng !== 99 || rolled.nextId !== 4) throw new Error('getUnitStats advanced run counters');
}

assertCatalog();
