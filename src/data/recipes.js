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
    { en: 'Cut a burning line through a file of enemies. Unlike Rivet, it drops the crit and pierces 2 extra enemies instead of 1, and every pierced enemy burns. Unlike Cinder, it has no splash: the burn travels in a line at 5 damage per second for 2.4s instead of bursting in a circle at 4 damage per second for 2.6s.', zh: '用一条燃烧直线切开一列敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，并且每个被贯穿的敌人都会燃烧。和烬火不同，它没有溅射：燃烧沿直线传递，每秒 5 点、持续 2.4 秒，而不是在圆形范围内以每秒 4 点燃烧 2.6 秒。' },
    { damage: 14, interval: 0.72, range: 260, projectileSpeed: 480, pierce: 2, burn: { dps: 5, duration: 2.4 }, mechanics: ['pierce', 'burn'] }),
  recipe('hailspike', ['bolt', 'frost'],
    { en: 'Hailspike', zh: '雹针' },
    { en: 'Drive a slowing line through the enemies in front. Unlike Rivet, it drops the crit, pierces 2 extra enemies instead of 1, and slows each of them to 58% speed. Unlike Rime, the slow hits every enemy in the line instead of one target, and 58% speed is slower than Rime at 64% for the same 2.2s.', zh: '用一条减速直线钉住前方的敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，并让每个命中的敌人移速变为 58%。和霜结不同，减速打在直线上的每个敌人，而不是单个目标，而且同样持续 2.2 秒时，58% 移速比霜结的 64% 更慢。' },
    { damage: 12, interval: 0.8, range: 255, projectileSpeed: 440, pierce: 2, slow: { factor: 0.58, duration: 2.2 }, mechanics: ['pierce', 'slow'] }),
  recipe('arcbolt', ['bolt', 'lightning'],
    { en: 'Arcbolt', zh: '弧矢' },
    { en: 'Snap a chain that can crit between clustered enemies. Unlike Rivet, it drops pierce and chains to 2 extra enemies, and its crit rises from 15% at 1.85× to 24% at 2×. Unlike Arc, each hit, including each jump, rolls that crit, and jumps reach 88 instead of 80; Arc does not crit.', zh: '让会暴击的连锁在聚拢的敌人之间跳开。和穿钉不同，它去掉贯穿，改为连锁额外 2 名敌人，暴击从 15%、1.85 倍提高到 24%、2 倍。和弧雷不同，每一次命中（包括每一次跳跃）都单独判定这次暴击，跳跃距离是 88 而不是 80；弧雷本身不会暴击。' },
    { damage: 13, interval: 0.86, range: 265, projectileSpeed: 520, chain: 2, chainRange: 88, critChance: 0.24, critMultiplier: 2, mechanics: ['chain', 'crit'] }),
  recipe('venomspine', ['bolt', 'poison'],
    { en: 'Venomspine', zh: '毒脊' },
    { en: 'Thread a poisoning line through a packed file. Unlike Rivet, it drops the crit, pierces 2 extra enemies instead of 1, and each hit adds one poison stack. Unlike the poison tower Blight, the poison is not single-target, but each stack deals 2 damage per second instead of 2.4, still for 4s and up to 3 stacks.', zh: '用一条毒线贯穿挤在一起的一列敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，每次命中叠加一层毒素。和瘴毒不同，毒素不再只打单体，但每层每秒伤害是 2 而不是 2.4，持续时间仍是 4 秒，最多 3 层。' },
    { damage: 9, interval: 0.68, range: 250, projectileSpeed: 460, pierce: 2, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['pierce', 'poison'] }),
  recipe('watchpost', ['bolt', 'support'],
    { en: 'Watchpost', zh: '哨卫' },
    { en: 'Pick off a distant target with a crit while the aura buffs nearby towers. Unlike Rivet, it drops pierce, extends range from 260 to 275, raises crit from 15% at 1.85× to 28% at 2×, and grants nearby defenders an aura. Unlike Banner, that aura reaches 130 instead of 116 but gives only +10% damage and +6% haste, not +12% damage and +8% haste, and the shot can crit.', zh: '用暴击点掉远处的目标，同时以光环抬高附近的塔。和穿钉不同，它去掉贯穿，射程从 260 增至 275，暴击从 15%、1.85 倍提高到 28%、2 倍，并给附近防守单位加上光环。和旌旗不同，这道光环范围是 130 而不是 116，但只提供 10% 伤害和 6% 急速，而不是 12% 伤害和 8% 急速，而且射击可以暴击。' },
    { damage: 11, interval: 0.78, range: 275, projectileSpeed: 470, critChance: 0.28, critMultiplier: 2, aura: { range: 130, damage: 0.1, haste: 0.06 }, mechanics: ['aura', 'crit'] }),
  recipe('scald', ['fire', 'frost'],
    { en: 'Scald', zh: '蒸灼' },
    { en: 'Drop a burning, slowing splash on a packed cluster. Unlike Cinder, the splash grows from 36 to 46 and every enemy in it is also slowed to 50% speed; the burn stays 4 damage per second for 2.6s. Unlike Rime, the slow is no longer one target at 64% speed: the whole splash shares a stronger 50% slow for the same 2.2s and also burns.', zh: '向挤成一团的敌人泼下一片燃烧并减速的溅射。和烬火不同，溅射从 36 扩大到 46，范围内的每个敌人还会被减速到 50% 移速；燃烧仍是每秒 4 点、持续 2.6 秒。和霜结不同，减速不再是 64% 移速的单体：整片溅射共享更强的 50% 减速，持续时间同为 2.2 秒，并同时燃烧。' },
    { damage: 8, interval: 1.2, range: 240, projectileSpeed: 300, splash: 46, burn: { dps: 4, duration: 2.6 }, slow: { factor: 0.5, duration: 2.2 }, mechanics: ['splash', 'burn', 'slow'] }),
  recipe('wildfire', ['fire', 'lightning'],
    { en: 'Wildfire', zh: '野火' },
    { en: 'Burst a burning splash, then let that flame jump to a neighbor. Unlike Cinder, the splash grows from 36 to 40, the burn rises from 4 damage per second for 2.6s to 6 for 2.8s, and the hit also jumps once. Unlike Arc, it chains to only 1 extra enemy within 78 instead of 2 within 80, but both the splash and that jump burn.', zh: '炸开一片燃烧溅射，再让火焰跳到旁边的敌人。和烬火不同，溅射从 36 扩大到 40，燃烧从每秒 4 点、持续 2.6 秒提高到每秒 6 点、持续 2.8 秒，并且命中后再跳跃一次。和弧雷不同，它只连锁 1 名额外敌人、距离 78，而不是 2 名、距离 80，但溅射和这一跳都会燃烧。' },
    { damage: 10, interval: 1.15, range: 245, projectileSpeed: 340, splash: 40, chain: 1, chainRange: 78, burn: { dps: 6, duration: 2.8 }, mechanics: ['splash', 'chain', 'burn'] }),
  recipe('blight', ['fire', 'poison'],
    { en: 'Blight', zh: '疫焚' },
    { en: 'Wash a crowd in a burning splash that also stacks poison. Unlike Cinder, the splash grows from 36 to 50 and also stacks poison, while the burn falls from 4 damage per second for 2.6s to 3 for 3s and the hit drops from 8 to 6. Unlike the poison tower Blight, poison is no longer single-target: everyone in the splash takes 2 damage per second for 4.5s instead of 2.4 for 4s, still up to 3 stacks, and they burn as well.', zh: '用会叠加毒素的燃烧溅射洗过一群敌人。和烬火不同，溅射从 36 扩大到 50，并会叠加毒素；燃烧从每秒 4 点、持续 2.6 秒降为每秒 3 点、持续 3 秒，直接伤害从 8 降到 6。和瘴毒不同，毒素不再是单体：溅射内的每个敌人受到每秒 2 点毒素、持续 4.5 秒，而不是每秒 2.4 点、持续 4 秒，层数仍最多 3 层，并且同时燃烧。' },
    { damage: 6, interval: 1.28, range: 240, projectileSpeed: 280, splash: 50, burn: { dps: 3, duration: 3 }, poison: { dps: 2, duration: 4.5, maxStacks: 3 }, mechanics: ['splash', 'burn', 'poison'] }),
  recipe('pyre', ['fire', 'support'],
    { en: 'Pyre', zh: '烽坛' },
    { en: 'Plant a burning splash that also buffs the defenders around it. Unlike Cinder, the splash grows from 36 to 38 and the burn rises from 4 damage per second for 2.6s to 5 for 3s, and it adds an aura that buffs defenders and does not hurt enemies. Unlike Banner, that aura reaches 140 instead of 116 and gives +15% damage but only +4% haste, not +12% damage and +8% haste, and the attack is a burning splash instead of a single light bolt.', zh: '立下一片燃烧溅射，并让周围的防守者一起变强。和烬火不同，溅射从 36 扩大到 38，燃烧从每秒 4 点、持续 2.6 秒提高到每秒 5 点、持续 3 秒，并加上只强化防守单位、不伤害敌人的光环。和旌旗不同，光环范围是 140 而不是 116，提供 15% 伤害但只有 4% 急速，而不是 12% 伤害和 8% 急速，攻击也从单体轻射变成燃烧溅射。' },
    { damage: 8, interval: 1.25, range: 240, projectileSpeed: 290, splash: 38, burn: { dps: 5, duration: 3 }, aura: { range: 140, damage: 0.15, haste: 0.04 }, mechanics: ['aura', 'splash', 'burn'] }),
  recipe('shatter', ['frost', 'lightning'],
    { en: 'Shatter', zh: '霜裂' },
    { en: 'Crack a slowing chain that can crit across a spread crowd. Unlike Rime, the slow is no longer single-target: it chains to 3 extra enemies, slows each to 60% speed for 1.8s instead of 64% for 2.2s, and can crit at 20% for 2.1×. Unlike Arc, the chain grows from 2 jumps within 80 to 3 within 96, and each jump slows and can crit; Arc does neither.', zh: '劈开一条会减速也会暴击的连锁，打过散开的人群。和霜结不同，减速不再是单体：它连锁额外 3 名敌人，每人移速变为 60%、持续 1.8 秒，而不是 64%、持续 2.2 秒，并有 20% 几率造成 2.1 倍暴击。和弧雷不同，连锁从 80 距离内的 2 跳增至 96 距离内的 3 跳，每一跳都会减速并可能暴击；弧雷两者都没有。' },
    { damage: 11, interval: 1.05, range: 260, projectileSpeed: 500, chain: 3, chainRange: 96, critChance: 0.2, critMultiplier: 2.1, slow: { factor: 0.6, duration: 1.8 }, mechanics: ['chain', 'slow', 'crit'] }),
  recipe('miasma', ['frost', 'poison'],
    { en: 'Miasma', zh: '瘴雾' },
    { en: 'Lay a slowing, poisoning splash over a chokepoint. Unlike Rime, the slow is a splash of 62 rather than one enemy, holding targets at 58% speed for 2.8s instead of 64% for 2.2s, and it also stacks poison. Unlike the poison tower Blight, that poison spreads through the cloud at 2 damage per second instead of 2.4 on one target, for the same 4s and 3 stacks, and everyone inside is slowed.', zh: '在隘口铺下一片减速并中毒的溅射。和霜结不同，减速变成半径 62 的溅射，而不是只打一名敌人，移速变为 58%、持续 2.8 秒，而不是 64%、持续 2.2 秒，并且会叠加毒素。和瘴毒不同，毒素随这片云雾扩散，每秒 2 点而不是单体的每秒 2.4 点，持续时间仍是 4 秒、最多 3 层，云内每个敌人都会被减速。' },
    { damage: 5, interval: 1.32, range: 240, projectileSpeed: 250, splash: 62, slow: { factor: 0.58, duration: 2.8 }, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['splash', 'slow', 'poison'] }),
  recipe('glacierward', ['frost', 'support'],
    { en: 'Glacierward', zh: '霜垣' },
    { en: 'Pin one runner with a hard slow while the aura hastes nearby towers. Unlike Rime, it stays a single-target shot but slows to 48% speed for 2.5s instead of 64% for 2.2s, and it adds an aura for nearby defenders. Unlike Banner, that aura reaches 150 instead of 116 and gives +12% haste but only +8% damage, not +8% haste and +12% damage, and the shot slows instead of firing a plain bolt.', zh: '用强减速钉住一个前冲的敌人，同时以光环加快附近的塔。和霜结不同，它仍是单体射击，但减速变为 48% 移速、持续 2.5 秒，而不是 64%、持续 2.2 秒，并为附近防守单位提供光环。和旌旗不同，光环范围是 150 而不是 116，提供 12% 急速但只有 8% 伤害，而不是 8% 急速和 12% 伤害，射击会减速，而不是普通轻射。' },
    { damage: 7, interval: 1.12, range: 245, projectileSpeed: 320, slow: { factor: 0.48, duration: 2.5 }, aura: { range: 150, damage: 0.08, haste: 0.12 }, mechanics: ['aura', 'slow'] }),
  recipe('catalyst', ['lightning', 'poison'],
    { en: 'Catalyst', zh: '触媒' },
    { en: 'Leap a poisoning chain through enemies that have spread out. Unlike Arc, each of the 2 chain jumps also poisons, and jumps reach 100 instead of 80, while the hit falls from 10 to 8. Unlike the poison tower Blight, poison is not single-target: every jumped enemy gains a stack at 2 damage per second for 3.6s instead of 2.4 for 4s, still up to 3 stacks.', zh: '让中毒的连锁在已经散开的敌人之间跳跃。和弧雷不同，2 次连锁跳跃都会使目标中毒，跳跃距离是 100 而不是 80，直接伤害从 10 降到 8。和瘴毒不同，毒素不再是单体：每个被跳到的敌人获得一层每秒 2 点、持续 3.6 秒的毒素，而不是每秒 2.4 点、持续 4 秒，层数仍最多 3 层。' },
    { damage: 8, interval: 1.02, range: 250, projectileSpeed: 490, chain: 2, chainRange: 100, poison: { dps: 2, duration: 3.6, maxStacks: 3 }, mechanics: ['chain', 'poison'] }),
  recipe('relay', ['lightning', 'support'],
    { en: 'Relay', zh: '继电' },
    { en: 'Arc a chain across the fight while the aura hastes nearby towers. Unlike Arc, it keeps a chain of 2 but each jump reaches 84 instead of 80, and it adds an aura, while its own hit falls from 10 to 9. Unlike Banner, that aura reaches 145 instead of 116 and gives +16% haste but only +5% damage, not +8% haste and +12% damage, and the attack chains instead of a single light bolt.', zh: '让连锁横扫战场，同时以光环加快附近的塔。和弧雷不同，它保留 2 次连锁，但每次跳跃距离是 84 而不是 80，并加上光环；自身直接伤害从 10 降到 9。和旌旗不同，光环范围是 145 而不是 116，提供 16% 急速但只有 5% 伤害，而不是 8% 急速和 12% 伤害，攻击会连锁，而不是单体轻射。' },
    { damage: 9, interval: 0.98, range: 245, projectileSpeed: 470, chain: 2, chainRange: 84, aura: { range: 145, damage: 0.05, haste: 0.16 }, mechanics: ['aura', 'chain'] }),
  recipe('cultivator', ['poison', 'support'],
    { en: 'Cultivator', zh: '培育' },
    { en: 'Stack a deep poison on one tough enemy while the aura lifts neighbors. Unlike the poison tower Blight, each poison stack deals 3 damage per second for 5s and can reach 4 stacks, instead of 2.4 for 4s and 3 stacks, and nearby defenders gain an aura. Unlike Banner, that aura reaches 128 instead of 116, keeps +12% damage, and cuts haste from +8% to +5%, while the shot stacks that deeper poison instead of a plain bolt. It still has no splash and no pierce.', zh: '把深层毒素叠在一个厚血敌人身上，同时以光环抬高邻近的塔。和瘴毒不同，每层毒素每秒造成 3 点伤害、持续 5 秒、最多 4 层，而不是每秒 2.4 点、持续 4 秒、最多 3 层，附近防守单位还会获得光环。和旌旗不同，光环范围是 128 而不是 116，伤害加成仍是 12%，急速则从 8% 降到 5%，射击会叠加这种更深的毒素，而不是普通轻射。它仍然没有溅射，也没有贯穿。' },
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
