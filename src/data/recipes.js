// Hybrid recipe catalog. Rank-1 UnitStats live on each recipe.
// Towers: for a hybrid, return getHybridStats(unit) and apply profile bonuses
// once. Do not multiply this table by rank again. See MECHANIC_HOOKS.
import { BASE_TYPES, clamp } from '../shared.js';

export const HYBRID_RANK_MIN = 1;
export const HYBRID_RANK_MAX = 4;

const MECHANICS = Object.freeze(['pierce', 'chain', 'splash', 'burn', 'slow', 'poison', 'aura', 'crit']);
const STAT_KEYS = Object.freeze(['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce', 'burn', 'slow', 'poison', 'aura', 'mechanics']);
const EFFECT_KEYS = Object.freeze({
  burn: ['dps', 'duration'],
  slow: ['factor', 'duration'],
  poison: ['dps', 'duration', 'maxStacks'],
  aura: ['range', 'damage', 'haste'],
});

export const MECHANIC_HOOKS = Object.freeze({
  getUnitStats: 'If unit.kind is hybrid or isRecipeId(unit.type), start from getHybridStats(unit) and apply profile bonuses once. getHybridStats already includes rank. Do not scale it again and do not read RECIPES.stats as the displayed combat numbers for rank 2+.',
  profile: 'After getHybridStats, damage *= 1 + bonuses.damage; interval = max(0.28, interval / (1 + bonuses.haste)); range += bonuses.range; critChance = min(0.5, critChance + bonuses.critChance). bonuses.fence and bonuses.reward are not tower stats. getHybridStats itself ignores profile, equipment, and other towers.',
  onHit: 'When stats.burn, stats.slow, or stats.poison is present, combat applies that status to every enemy damaged by the direct hit, each pierce hit, each splash target, and each chain jump. One application per enemy per hit.',
  burn: 'applyStatus(enemy, {type:"burn", power:burn.dps, remaining:burn.duration, sourceId}). Burn does not stack. A later burn replaces power and refreshes remaining. Tick damage is power * dt via the status damage callback.',
  poison: 'applyStatus(enemy, {type:"poison", power:poison.dps, remaining:poison.duration, stacks:1, sourceId}). Each hit adds one stack up to poison.maxStacks and refreshes remaining. Tick damage is power * stacks * dt. Rank multiplies dps and does not raise maxStacks.',
  slow: 'applyStatus(enemy, {type:"slow", power:slow.factor, remaining:slow.duration, sourceId}). power is the remaining speed factor (0.58 means 58% speed), not a percentage reduction. Keep the lower factor and refresh remaining. Movement reads getSpeedFactor and must not rewrite enemy.speed.',
  aura: 'stats.aura adds fractional damage and haste to every defender, including the owner, whose slot center is within aura.range. It never damages enemies. Combat caps the sum of auras on one defender at +0.50 damage and +0.40 haste.',
  pierce: 'Copy stats.pierce onto the projectile as extra enemies after the first. Each of those hits uses the same damage roll rules and on-hit statuses.',
  chain: 'Copy stats.chain and stats.chainRange. Each jump chooses a living enemy inside chainRange that is not already in visited, then applies damage and on-hit statuses.',
  splash: 'stats.splash is the impact radius in logical pixels. Each enemy in that circle takes the hit damage and on-hit statuses. Zero means no splash.',
  crit: 'Roll critChance separately for each enemy hit. A crit multiplies that hit by critMultiplier and passes crit:true. mechanics includes crit only when critChance > 0.',
  rank: 'Same-type merges require equal rank and produce rank+1, including two identical hybrids, and stop at rank 4. Two different base types require equal rank and a recipe; the hybrid keeps that rank and does not gain a free rank. Damage, burn dps, and poison dps scale by 2^(rank-1). Interval is divided by 1+0.12*(rank-1), with a 0.28s floor. Range, projectile speed, crit, splash, chain, and pierce gain small capped steps. Slow factor improves slightly and never drops below 0.35. Aura bonuses are additive and capped; they do not use the damage multiplier. Poison maxStacks and burn stacking do not grow with rank.',
  mechanicsField: 'stats.mechanics contains only pierce, chain, splash, burn, slow, poison, aura, and crit, and it matches the fields on that same object. Combat should act on the fields. The array is the codex label. No recipe needs stun or brittle.',
});

function copyEffect(effect) {
  return effect ? { ...effect } : undefined;
}

function unitStats(fields) {
  const stats = {
    damage: fields.damage,
    interval: fields.interval,
    range: fields.range,
    critChance: fields.critChance ?? 0,
    critMultiplier: fields.critMultiplier ?? 1.75,
    projectileSpeed: fields.projectileSpeed ?? 300,
    splash: fields.splash ?? 0,
    chain: fields.chain ?? 0,
    chainRange: fields.chainRange ?? 70,
    pierce: fields.pierce ?? 0,
    mechanics: [...fields.mechanics],
  };
  if (fields.burn) stats.burn = copyEffect(fields.burn);
  if (fields.slow) stats.slow = copyEffect(fields.slow);
  if (fields.poison) stats.poison = copyEffect(fields.poison);
  if (fields.aura) stats.aura = copyEffect(fields.aura);
  return stats;
}

function recipe(id, parents, name, description, fields) {
  return { id, parents: [...parents], name: { en: name.en, zh: name.zh }, description: { en: description.en, zh: description.zh }, stats: unitStats(fields) };
}

const RAW_RECIPES = [
  recipe('cinderbolt', ['bolt', 'fire'],
    { en: 'Cinderbolt', zh: '烬矢' },
    { en: 'A fast bolt that pierces and burns each enemy it hits. Burn does not stack; a new hit refreshes it.', zh: '快速箭矢会穿透并灼烧每个命中的敌人。燃烧不叠加，再次命中只刷新它。' },
    { damage: 14, interval: 0.72, range: 260, projectileSpeed: 480, pierce: 2, burn: { dps: 5, duration: 2.4 }, mechanics: ['pierce', 'burn'] }),
  recipe('hailspike', ['bolt', 'frost'],
    { en: 'Hailspike', zh: '雹针' },
    { en: 'A piercing shard that slows every enemy it hits. Targets keep moving at the listed speed factor.', zh: '穿透冰片会减速每个命中的敌人。目标仍会移动，速度变为所列的剩余速度。' },
    { damage: 12, interval: 0.8, range: 255, projectileSpeed: 440, pierce: 2, slow: { factor: 0.58, duration: 2.2 }, mechanics: ['pierce', 'slow'] }),
  recipe('arcbolt', ['bolt', 'lightning'],
    { en: 'Arcbolt', zh: '弧矢' },
    { en: 'A high-crit bolt that chains to nearby enemies. Each jump rolls its own crit.', zh: '高暴击电矢会弹向附近敌人。每一次跳跃单独计算暴击。' },
    { damage: 13, interval: 0.86, range: 265, projectileSpeed: 520, chain: 2, chainRange: 88, critChance: 0.24, critMultiplier: 2, mechanics: ['chain', 'crit'] }),
  recipe('venomspine', ['bolt', 'poison'],
    { en: 'Venomspine', zh: '毒脊' },
    { en: 'Piercing darts add one poison stack per hit, up to the maximum, and refresh the duration.', zh: '穿透毒刺每次命中叠加一层毒素，达到上限后不再加层，并刷新持续时间。' },
    { damage: 9, interval: 0.68, range: 250, projectileSpeed: 460, pierce: 2, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['pierce', 'poison'] }),
  recipe('watchpost', ['bolt', 'support'],
    { en: 'Watchpost', zh: '哨卫' },
    { en: 'A long-range crit shooter that also grants nearby defenders bonus damage and a little haste.', zh: '远距暴击射手，同时为附近防守单位提供伤害加成和少量攻速。' },
    { damage: 11, interval: 0.78, range: 275, projectileSpeed: 470, critChance: 0.28, critMultiplier: 2, aura: { range: 130, damage: 0.1, haste: 0.06 }, mechanics: ['aura', 'crit'] }),
  recipe('scald', ['fire', 'frost'],
    { en: 'Scald', zh: '蒸灼' },
    { en: 'A splash that burns and strongly slows at once. Direct damage is modest; the pair of statuses is the payoff.', zh: '溅射同时燃烧并强力减速。直接伤害不高，价值在于两种状态一起生效。' },
    { damage: 8, interval: 1.2, range: 240, projectileSpeed: 300, splash: 46, burn: { dps: 4, duration: 2.6 }, slow: { factor: 0.5, duration: 2.2 }, mechanics: ['splash', 'burn', 'slow'] }),
  recipe('wildfire', ['fire', 'lightning'],
    { en: 'Wildfire', zh: '野火' },
    { en: 'A burning splash that also jumps once to a nearby enemy. The splash and the jump both burn.', zh: '燃烧溅射，并再跳向一名附近敌人。溅射和跳跃都会灼烧。' },
    { damage: 10, interval: 1.15, range: 245, projectileSpeed: 340, splash: 40, chain: 1, chainRange: 78, burn: { dps: 6, duration: 2.8 }, mechanics: ['splash', 'chain', 'burn'] }),
  recipe('blight', ['fire', 'poison'],
    { en: 'Blight', zh: '疫焚' },
    { en: 'A wide splash that burns and stacks poison. The hit is weak; the two lingering effects do the work.', zh: '大范围溅射同时燃烧并叠加毒素。命中偏低，输出靠两种持续伤害。' },
    { damage: 6, interval: 1.28, range: 240, projectileSpeed: 280, splash: 50, burn: { dps: 3, duration: 3 }, poison: { dps: 2, duration: 4.5, maxStacks: 3 }, mechanics: ['splash', 'burn', 'poison'] }),
  recipe('pyre', ['fire', 'support'],
    { en: 'Pyre', zh: '烽坛' },
    { en: 'Grants nearby defenders a damage aura and throws a burning splash. The aura does not hurt enemies.', zh: '为附近防守单位提供伤害光环，并投出燃烧溅射。光环不会伤害敌人。' },
    { damage: 8, interval: 1.25, range: 240, projectileSpeed: 290, splash: 38, burn: { dps: 5, duration: 3 }, aura: { range: 140, damage: 0.15, haste: 0.04 }, mechanics: ['aura', 'splash', 'burn'] }),
  recipe('shatter', ['frost', 'lightning'],
    { en: 'Shatter', zh: '霜裂' },
    { en: 'A long chain that slows and crits harder. It controls a pack; it does not spread poison.', zh: '长连锁会减速，并且更容易打出更高暴击。它用来控制一群敌人，不传播毒素。' },
    { damage: 11, interval: 1.05, range: 260, projectileSpeed: 500, chain: 3, chainRange: 96, critChance: 0.2, critMultiplier: 2.1, slow: { factor: 0.6, duration: 1.8 }, mechanics: ['chain', 'slow', 'crit'] }),
  recipe('miasma', ['frost', 'poison'],
    { en: 'Miasma', zh: '瘴雾' },
    { en: 'A wide cloud that slows and stacks a short poison on everyone inside. It holds a crowd.', zh: '宽云雾会减速，并给云内每个敌人叠加上限不高的毒素，用来拖住人群。' },
    { damage: 5, interval: 1.32, range: 240, projectileSpeed: 250, splash: 62, slow: { factor: 0.58, duration: 2.8 }, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['splash', 'slow', 'poison'] }),
  recipe('glacierward', ['frost', 'support'],
    { en: 'Glacierward', zh: '霜垣' },
    { en: 'The strongest dedicated slow shot, plus a haste aura for nearby defenders.', zh: '最强的专精减速射击，并为附近防守单位提供攻速光环。' },
    { damage: 7, interval: 1.12, range: 245, projectileSpeed: 320, slow: { factor: 0.48, duration: 2.5 }, aura: { range: 150, damage: 0.08, haste: 0.12 }, mechanics: ['aura', 'slow'] }),
  recipe('catalyst', ['lightning', 'poison'],
    { en: 'Catalyst', zh: '触媒' },
    { en: 'A chain that poisons every jumped target, spreading stacks through a pack.', zh: '连锁会使每个跳到的目标中毒，把毒素层数扩散到一整群敌人。' },
    { damage: 8, interval: 1.02, range: 250, projectileSpeed: 490, chain: 2, chainRange: 100, poison: { dps: 2, duration: 3.6, maxStacks: 3 }, mechanics: ['chain', 'poison'] }),
  recipe('relay', ['lightning', 'support'],
    { en: 'Relay', zh: '继电' },
    { en: 'The strongest haste aura, plus a short chain bolt. It speeds the defense more than it hits.', zh: '最强攻速光环，并附带短程连锁电击。它更擅长加快防守，而不是自己输出。' },
    { damage: 9, interval: 0.98, range: 245, projectileSpeed: 470, chain: 2, chainRange: 84, aura: { range: 145, damage: 0.05, haste: 0.16 }, mechanics: ['aura', 'chain'] }),
  recipe('cultivator', ['poison', 'support'],
    { en: 'Cultivator', zh: '培育' },
    { en: 'The deepest single-target poison, plus a modest damage aura. It has no splash and no pierce.', zh: '最深的单体毒素，并带有适度伤害光环。没有溅射，也没有穿透。' },
    { damage: 5, interval: 1.08, range: 240, projectileSpeed: 310, poison: { dps: 3, duration: 5, maxStacks: 4 }, aura: { range: 128, damage: 0.12, haste: 0.05 }, mechanics: ['aura', 'poison'] }),
];

function isBilingual(value) {
  return !!value && typeof value.en === 'string' && value.en.trim() !== '' && typeof value.zh === 'string' && value.zh.trim() !== '' && value.en !== value.zh;
}

function signature(mechanics) {
  return [...mechanics].sort().join('+');
}

function validateRecipes(list) {
  const errors = [];
  const ids = new Set();
  const pairs = new Set();
  const signatures = new Set();
  if (!Array.isArray(list) || list.length < 8) errors.push('at least 8 recipes are required');
  for (const entry of list) {
    const label = entry?.id || '(missing id)';
    if (!/^[a-z][a-z0-9]*$/.test(entry?.id || '') || BASE_TYPES.includes(entry.id) || entry.id === 'hero') errors.push(`${label}: bad id`);
    if (ids.has(entry.id)) errors.push(`${label}: duplicate id`);
    ids.add(entry.id);
    if (!Array.isArray(entry.parents) || entry.parents.length !== 2) errors.push(`${label}: parents must be a pair`);
    else {
      const [a, b] = entry.parents;
      const ia = BASE_TYPES.indexOf(a);
      const ib = BASE_TYPES.indexOf(b);
      if (ia < 0 || ib < 0 || ia === ib) errors.push(`${label}: parents must be two different base types`);
      else if (ia > ib) errors.push(`${label}: parents must be stored in BASE_TYPES order`);
      else {
        const key = `${a}+${b}`;
        if (pairs.has(key)) errors.push(`${label}: duplicate pair ${key}`);
        pairs.add(key);
      }
    }
    if (!isBilingual(entry.name) || !isBilingual(entry.description)) errors.push(`${label}: bilingual name and description are required`);
    const stats = entry.stats || {};
    for (const key of Object.keys(stats)) {
      if (!STAT_KEYS.includes(key)) errors.push(`${label}: unexpected stat ${key}`);
    }
    for (const [effect, keys] of Object.entries(EFFECT_KEYS)) {
      if (!stats[effect]) continue;
      for (const key of Object.keys(stats[effect])) {
        if (!keys.includes(key)) errors.push(`${label}: unexpected ${effect}.${key}`);
      }
    }
    const finite = [
      ['damage', stats.damage, 4, 18],
      ['interval', stats.interval, 0.45, 1.6],
      ['range', stats.range, 230, 300],
      ['critChance', stats.critChance, 0, 0.35],
      ['critMultiplier', stats.critMultiplier, 1.5, 2.5],
      ['projectileSpeed', stats.projectileSpeed, 200, 600],
      ['splash', stats.splash, 0, 70],
      ['chain', stats.chain, 0, 4],
      ['chainRange', stats.chainRange, 70, 120],
      ['pierce', stats.pierce, 0, 3],
    ];
    for (const [name, value, min, max] of finite) {
      if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label}: ${name} out of range`);
    }
    if (stats.burn && (!Number.isFinite(stats.burn.dps) || stats.burn.dps <= 0 || stats.burn.dps > 12 || !Number.isFinite(stats.burn.duration) || stats.burn.duration <= 0 || stats.burn.duration > 6)) errors.push(`${label}: burn invalid`);
    if (stats.slow && (!Number.isFinite(stats.slow.factor) || stats.slow.factor < 0.4 || stats.slow.factor >= 1 || !Number.isFinite(stats.slow.duration) || stats.slow.duration <= 0)) errors.push(`${label}: slow invalid`);
    if (stats.poison && (!Number.isFinite(stats.poison.dps) || stats.poison.dps <= 0 || stats.poison.dps > 8 || !Number.isFinite(stats.poison.duration) || stats.poison.duration <= 0 || stats.poison.duration > 8 || !Number.isInteger(stats.poison.maxStacks) || stats.poison.maxStacks < 2 || stats.poison.maxStacks > 6)) errors.push(`${label}: poison invalid`);
    if (stats.aura && (!Number.isFinite(stats.aura.range) || stats.aura.range < 100 || stats.aura.range > 170 || !Number.isFinite(stats.aura.damage) || !Number.isFinite(stats.aura.haste) || stats.aura.damage < 0 || stats.aura.haste < 0 || (stats.aura.damage <= 0 && stats.aura.haste <= 0))) errors.push(`${label}: aura invalid`);
    if (!Array.isArray(stats.mechanics) || stats.mechanics.length < 2 || new Set(stats.mechanics).size !== stats.mechanics.length) errors.push(`${label}: mechanics must be at least two unique names`);
    for (const name of stats.mechanics || []) {
      if (!MECHANICS.includes(name)) errors.push(`${label}: unimplemented mechanic ${name}`);
    }
    const present = {
      pierce: stats.pierce >= 1,
      chain: stats.chain >= 1,
      splash: stats.splash > 0,
      burn: !!stats.burn,
      slow: !!stats.slow,
      poison: !!stats.poison,
      aura: !!stats.aura,
      crit: stats.critChance > 0,
    };
    for (const name of MECHANICS) {
      const listed = !!stats.mechanics?.includes(name);
      if (present[name] !== listed) errors.push(`${label}: mechanics/${name} does not match fields`);
    }
    const sig = signature(stats.mechanics || []);
    if (signatures.has(sig)) errors.push(`${label}: mechanic signature ${sig} is not unique`);
    signatures.add(sig);
  }
  if (errors.length) throw new Error(`Recipe catalog invalid:\n- ${errors.join('\n- ')}`);
  return list;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const RECIPES = deepFreeze(validateRecipes(RAW_RECIPES));

const BY_ID = new Map(RECIPES.map((entry) => [entry.id, entry]));
const BY_PAIR = new Map(RECIPES.map((entry) => [`${entry.parents[0]}+${entry.parents[1]}`, entry]));

export function getRecipe(id) {
  return BY_ID.get(id) ?? null;
}

export function isRecipeId(type) {
  return typeof type === 'string' && BY_ID.has(type);
}

function canonicalKey(typeA, typeB) {
  const left = BASE_TYPES.indexOf(typeA);
  const right = BASE_TYPES.indexOf(typeB);
  if (left < 0 || right < 0 || left === right) return null;
  return left < right ? `${typeA}+${typeB}` : `${typeB}+${typeA}`;
}

// Order does not matter. Same type and unknown types return null.
export function findRecipe(typeA, typeB) {
  const key = canonicalKey(typeA, typeB);
  return key ? BY_PAIR.get(key) ?? null : null;
}

export function normalizeRank(rank) {
  const value = Number.isFinite(rank) ? Math.round(rank) : HYBRID_RANK_MIN;
  return clamp(value, HYBRID_RANK_MIN, HYBRID_RANK_MAX);
}

export function rankDamageMultiplier(rank) {
  return 2 ** (normalizeRank(rank) - 1);
}

function roundStat(value) {
  return Math.round(value * 10000) / 10000;
}

// Rank-scaled copy. Does not mutate the catalog. Rank 1 reproduces the recipe numbers.
export function scaleHybridStats(stats, rank) {
  const source = stats || {};
  const steps = normalizeRank(rank) - 1;
  const damageMul = 2 ** steps;
  const rate = 1 + 0.12 * steps;
  const scaled = {
    damage: roundStat((Number.isFinite(source.damage) ? source.damage : 0) * damageMul),
    interval: roundStat(Math.max(0.28, (Number.isFinite(source.interval) ? source.interval : 1) / rate)),
    range: roundStat(Math.min(320, (Number.isFinite(source.range) ? source.range : 0) + 8 * steps)),
    critChance: roundStat(Math.min(0.5, (Number.isFinite(source.critChance) ? source.critChance : 0) + 0.02 * steps)),
    critMultiplier: roundStat(Math.min(2.75, (Number.isFinite(source.critMultiplier) ? source.critMultiplier : 1.75) + 0.05 * steps)),
    projectileSpeed: roundStat(Math.min(760, (Number.isFinite(source.projectileSpeed) ? source.projectileSpeed : 300) + 24 * steps)),
    splash: roundStat((Number.isFinite(source.splash) ? source.splash : 0) + (source.splash > 0 ? 6 * steps : 0)),
    chain: Math.min(6, (Number.isFinite(source.chain) ? source.chain : 0) + (source.chain > 0 ? Math.floor(steps / 2) : 0)),
    chainRange: roundStat((Number.isFinite(source.chainRange) ? source.chainRange : 70) + (source.chain > 0 ? 8 * steps : 0)),
    pierce: Math.min(5, (Number.isFinite(source.pierce) ? source.pierce : 0) + (source.pierce > 0 && steps >= 3 ? 1 : 0)),
    mechanics: Array.isArray(source.mechanics) ? [...source.mechanics] : [],
  };
  if (source.burn) scaled.burn = { dps: roundStat(source.burn.dps * damageMul), duration: roundStat(source.burn.duration + 0.4 * steps) };
  if (source.slow) scaled.slow = { factor: roundStat(Math.max(0.35, source.slow.factor - 0.04 * steps)), duration: roundStat(source.slow.duration + 0.4 * steps) };
  if (source.poison) scaled.poison = { dps: roundStat(source.poison.dps * damageMul), duration: roundStat(source.poison.duration + 0.4 * steps), maxStacks: source.poison.maxStacks };
  if (source.aura) {
    scaled.aura = {
      range: roundStat(source.aura.range + 10 * steps),
      damage: roundStat(Math.min(0.4, source.aura.damage + 0.03 * steps)),
      haste: roundStat(Math.min(0.3, source.aura.haste + 0.025 * steps)),
    };
  }
  return scaled;
}

// Null when the type is not a recipe. Profile bonuses stay in getUnitStats.
export function getHybridStats(unit) {
  const entry = getRecipe(unit?.type);
  if (!entry) return null;
  return scaleHybridStats(entry.stats, unit.rank);
}
