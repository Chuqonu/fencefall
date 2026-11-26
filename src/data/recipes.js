import {BASE_TYPES, clamp} from '../shared.js';

export const HYBRID_RANK_MIN = 1;
export const HYBRID_RANK_MAX = 4;
function recipe(id, parents, en, zh, summary, detail, damage, interval, range, effects) {
  const mechanics = Object.keys(effects).filter(key=>!['chainRange','critMultiplier','projectileSpeed','revealRadius'].includes(key))
    .map(key=>key === 'critChance' ? 'crit' : key);
  const stats = {damage,interval,range,critChance:0,critMultiplier:1.75,projectileSpeed:420,
    splash:0,chain:0,chainRange:70,pierce:0,...effects,mechanics};
  return {id,parents:parents.split('+'),name:{en,zh},description:{en:summary,zh:detail},stats};
}
const burn = (dps,duration)=>({dps,duration});
const slow = (factor,duration)=>({factor,duration});
const poison = (dps,duration,maxStacks)=>({dps,duration,maxStacks});
const aura = (range,damage,haste)=>({range,damage,haste});
const brittle = (power,duration)=>({power,duration});

const RAW_RECIPES = [
  recipe('cinderbolt','bolt+fire','Cinderbolt','烬矢','Piercing incendiary rounds ignore armor.','穿甲火矢沿直线灼烧敌群。',22,0.66,300,
    {pierce:2,burn:burn(7,2.8),armorPen:0.45}),
  recipe('hailspike','bolt+frost','Hailspike','雹针','Pierce and expose a file of enemies.','冰针贯穿整列，施加减速与易伤。',19,0.72,300,
    {pierce:2,slow:slow(0.56,2.5),brittle:brittle(0.25,3)}),
  recipe('arcbolt','bolt+lightning','Arcbolt','弧矢','Twin arcs chain critical hits.','双发电弧连锁暴击。',18,0.80,315,
    {chain:3,chainRange:96,critChance:0.26,critMultiplier:2,multishot:1}),
  recipe('venomspine','bolt+poison','Venomspine','毒脊','Piercing venom executes weakened targets.','贯穿叠毒并斩杀残血目标。',16,0.65,295,
    {pierce:2,poison:poison(3.8,4.5,5),execute:true}),
  recipe('watchpost','bolt+support','Watchpost','哨卫','Pick off wounded threats at long range.','远程锁定高危目标，暴击斩杀残敌。',24,0.75,380,
    {critChance:0.30,critMultiplier:2.2,execute:true,aura:aura(135,0.14,0.08)}),
  recipe('scald','fire+frost','Scald','蒸灼','Burning or slowed targets erupt in steam.','命中燃烧或减速目标会引发蒸汽爆破。',18,1,285,
    {splash:54,burn:burn(6,2.8),slow:slow(0.5,2.5),thermalShock:0.45}),
  recipe('wildfire','fire+lightning','Wildfire','野火','Flames chain and stun a crowd.','连锁火团溅射并短暂眩晕敌群。',18,0.96,295,
    {splash:46,chain:2,chainRange:88,burn:burn(8,3),stun:{duration:0.35}}),
  recipe('blight','fire+poison','Plaguefire','疫焚','Marked corpses burst and spread poison.','染疫敌人死亡时爆裂并传毒。',14,1.05,285,
    {splash:54,burn:burn(5,3.2),poison:poison(3.2,4.8,4),corpseExplode:{radius:52,hpRatio:0.22}}),
  recipe('pyre','fire+support','Pyre','烽坛','Reveal enemies and scorch fence attackers.','火光显隐，强化近栅栏伤害。',17,1.02,290,
    {splash:44,burn:burn(7,3),fence_focus:true,revealRadius:48,aura:aura(145,0.18,0.06)}),
  recipe('shatter','frost+lightning','Shatter','霜裂','Chain ice and stun high-risk enemies.','以冰雷连锁眩晕高危敌人。',17,0.92,305,
    {chain:3,chainRange:100,critChance:0.22,critMultiplier:2,slow:slow(0.56,2.2),stun:{duration:0.55}}),
  recipe('miasma','frost+poison','Miasma','瘴雾','Toxic frost clouds harm phasing enemies.','持续毒雾可减速、易伤并伤害虚化怪。',11,1.15,285,
    {splash:48,cloud:{radius:62,duration:4,tick:0.5,dps:6,slow:slow(0.56,1),poison:poison(3,4,4),brittle:brittle(0.2,1.5)}}),
  recipe('glacierward','frost+support','Glacierward','霜垣','Push enemies away from the fence.','霜爆击退近墙敌人，并强化友军。',15,0.95,290,
    {splash:38,slow:slow(0.45,2.8),knockback:22,fence_focus:true,aura:aura(150,0.1,0.15)}),
  recipe('catalyst','lightning+poison','Catalyst','触媒','Chain hits gain damage per poison stack.','连锁命中按毒层追加伤害。',15,0.90,305,
    {chain:3,chainRange:108,poison:poison(3.5,4,5),poisonDetonate:0.18}),
  recipe('relay','lightning+support','Relay','继电','Twin chain shots accelerate neighboring towers.','双发连锁，光环加速友塔。',15,0.88,300,
    {chain:2,chainRange:90,multishot:1,aura:aura(152,0.08,0.2)}),
  recipe('cultivator','poison+support','Cultivator','培育','Expose armored targets to stacked venom.','深层叠毒与穿甲易伤瓦解重甲。',13,0.92,290,
    {poison:poison(4.5,5.2,6),brittle:brittle(0.3,3.5),armorPen:0.4,aura:aura(138,0.15,0.08)})
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const RECIPES = deepFreeze(RAW_RECIPES);

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

