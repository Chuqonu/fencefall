import {DIFFICULTIES, clamp} from '../shared.js';

export const PROGRESSION_RULES = Object.freeze({
  secondsPerPoint: 25,
  killsPerPoint: 8,
  pointsPerWave: 1,
  victoryBonus: 28,
  abandonDivisor: 2,
  timeCap: 1200,
  killCap: 640,
  waveCap: 40,
  freshTime: 30,
  freshKills: 3,
  settledRunLimit: 64,
  maxCurrency: 999999,
  rewardFractionCap: 0.25
});

const EQUIP_SLOTS = ['weapon', 'charm', 'armor'];
// Profile saves reject settledRuns longer than 2000. Stay under that ceiling.
const PAID_RUN_LIMIT = 2000;
const PERMANENT_KEYS = ['damage', 'haste', 'vitality','economy'];
// After a loss, suggest the fence first when two buys cost the same.
const NEXT_BUY_RANK = Object.freeze({
  vitality: 0,
  fence_nails: 1,
  vanguard_kit: 2,
  surge_capacitor: 3,
  damage: 4,
  splinter_bow: 5,
  kinetic_core: 6,
  prism_lens: 7,
  haste: 8,
  runner_charm: 9,
  sun_spindle: 10,
  bounty_seal: 11,
});
const BONUS_LABELS = {
  damage:['team damage','全队伤害','%'],haste:['team attack speed','全队攻速','%'],critChance:['team crit chance','全队暴击率','%'],
  reward:['reward','结算奖励','%'], hybridDamage:['hybrid damage','混合塔伤害','%'],fieldHp:['field HP','工事生命','%'],
  fieldDiscount:['field discount','工事折扣','%'],rerollDiscount:['reroll discount','重随折扣','%'],
  harvest:['harvest yield','辉穗收益','%'],surgePower:['surge power','冲击波威力','%'],
  critKnockback:['critical knockback','暴击击退','px'],fence:['starting fence HP','开局栅栏生命',''],
  thorns:['thorn damage','反伤',''],energy:['starting energy','初始辉光',''],energyRate:['energy per second','每秒辉光',''],
  freeRerolls:['free rerolls','免费重随',''],surgeCharges:['surge charges','冲击波充能','']
};
const FRACTION_KEYS=Object.keys(BONUS_LABELS).filter(k=>BONUS_LABELS[k][2]==='%');
const ABSOLUTE_KEYS=Object.keys(BONUS_LABELS).filter(k=>BONUS_LABELS[k][2]!=='%');
function formatPercent(n) {return String(Math.round(n*1000)/10);}
function equipmentDescription(en,zh,bonuses) {
  const parts=Object.entries(bonuses).map(([k,v])=>{
    const [a,b,unit]=BONUS_LABELS[k], magnitude='+'+(unit==='%'?formatPercent(v):v)+unit;
    return [magnitude+' '+a,b+magnitude];
  });
  return {en:parts.map(p=>p[0]).join(', '),zh:parts.map(p=>p[1]).join('，')};
}
function permanentDescription(en,zh,bonuses,cap) {
  const effect=equipmentDescription(en,zh,bonuses);
  return {en:effect.en+' per rank (max '+cap+').',zh:'每级'+effect.zh+'，最高 '+cap+' 级。'};
}

function gear(id, slot, cost, bonuses, flavorEn, flavorZh) {
  return {
    id,
    slot,
    cost,
    bonuses,
    name: null,
    description: equipmentDescription(flavorEn, flavorZh, bonuses)
  };
}

const equipmentNames = {
  splinter_bow:{en:'Splinter Bow',zh:'裂片弓'}, kinetic_core:{en:'Kinetic Core',zh:'动能弹芯'},
  prism_lens:{en:'Prism Lens',zh:'棱镜核心'},runner_charm:{en:'Runner Charm',zh:'奔行护符'},
  sun_spindle:{en:'Sun Spindle',zh:'辉光纺锤'},bounty_seal:{en:'Bounty Seal',zh:'赏金印'},
  fence_nails:{en:'Fence Nails',zh:'栅栏钉'},vanguard_kit:{en:'Vanguard Kit',zh:'先锋工事箱'},
  surge_capacitor:{en:'Surge Capacitor',zh:'脉冲电容'}
};
const rawEquipment = [
  gear('splinter_bow','weapon',60,{damage:0.06}),
  gear('kinetic_core','weapon',150,{damage:0.05,critChance:0.04,critKnockback:8}),
  gear('prism_lens','weapon',300,{damage:0.08,hybridDamage:0.14,freeRerolls:2}),
  gear('runner_charm','charm',55,{haste:0.06}),
  gear('sun_spindle','charm',145,{energy:35,harvest:0.2}),
  gear('bounty_seal','charm',260,{reward:0.15,critChance:0.03,rerollDiscount:0.25}),
  gear('fence_nails','armor',50,{fence:40,fieldHp:0.15}),
  gear('vanguard_kit','armor',140,{fieldDiscount:0.15,fieldHp:0.25,thorns:5}),
  gear('surge_capacitor','armor',280,{surgeCharges:1,surgePower:0.25})
];
const equipmentRecord = {};
for (const entry of rawEquipment) {
  entry.name = equipmentNames[entry.id];
  equipmentRecord[entry.id] = entry;
}

function track(id, cap, costs, bonuses, name, flavorEn, flavorZh) {
  return {
    id,
    cap,
    cost: costs[0],
    costs,
    bonuses,
    name,
    description: permanentDescription(flavorEn, flavorZh, bonuses, cap)
  };
}

const permanentRecord = {
  economy:track('economy',5,[40,70,110,170,240],{energy:10,energyRate:0.25},{en:'Logistics',zh:'后勤补给'},'',''),
  damage: track('damage', 5, [40, 70, 110, 170, 240], {damage: 0.03}, {en: 'Sharpened Instinct', zh: '锐化直觉'}, 'Training that stays between runs.', '跨对局保留的训练。'),
  haste: track('haste', 5, [40, 70, 110, 170, 240], {haste: 0.03}, {en: 'Quick Hands', zh: '迅捷手法'}, 'Repetition that shortens the gap between shots.', '缩短射击间隔的练习。'),
  vitality: track('vitality', 5, [35, 60, 100, 150, 220], {fence:18,fieldHp:0.06}, {en: 'Deep Roots', zh: '深根'}, 'Deeper posts for the starting fence.', '把开局栅栏立得更深。')
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function assertCatalog() {
  const seenSlots = new Set();
  for (const [id, item] of Object.entries(equipmentRecord)) {
    if (item.id !== id) throw new Error(`equipment id mismatch: ${id}`);
    if (!EQUIP_SLOTS.includes(item.slot)) throw new Error(`bad equipment slot: ${id}`);
    if (!Number.isInteger(item.cost) || item.cost <= 0) throw new Error(`bad equipment cost: ${id}`);
    if (!item.name?.en || !item.name?.zh || !item.description?.en || !item.description?.zh) throw new Error(`missing equipment text: ${id}`);
    seenSlots.add(item.slot);
    for (const [key, value] of Object.entries(item.bonuses)) {
      if (!FRACTION_KEYS.includes(key) && !ABSOLUTE_KEYS.includes(key)) throw new Error(`bad bonus ${key} on ${id}`);
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`bad bonus value on ${id}`);
      const label = FRACTION_KEYS.includes(key) ? `${formatPercent(value)}%` : String(value);
      if (!item.description.en.includes(label) || !item.description.zh.includes(label)) {
        throw new Error(`description misses ${label} for ${id}`);
      }
    }
  }
  if (seenSlots.size !== EQUIP_SLOTS.length) throw new Error('equipment must cover weapon, charm, and armor');
  for (const key of PERMANENT_KEYS) {
    const spec = permanentRecord[key];
    if (!spec || spec.id !== key || spec.cap !== spec.costs.length || spec.cost !== spec.costs[0]) {
      throw new Error(`bad permanent track: ${key}`);
    }
    for (let i = 0; i < spec.costs.length; i++) {
      if (!Number.isInteger(spec.costs[i]) || spec.costs[i] <= 0) throw new Error(`bad permanent cost: ${key}`);
      if (i > 0 && spec.costs[i] <= spec.costs[i - 1]) throw new Error(`permanent cost must rise: ${key}`);
    }
    if (!spec.description.en.includes(String(spec.cap)) || !spec.description.zh.includes(String(spec.cap))) {
      throw new Error(`permanent description misses cap: ${key}`);
    }
  }
}

assertCatalog();

export const GEM_SLOTS = 3;
export const GEM_ORDER = Object.freeze([
  'gem_opening_drop',
  'gem_aegis_wall',
  'gem_pierce_core',
  'gem_elemental',
  'gem_shredder',
  'gem_overdrive',
]);

export const GEMS = deepFreeze({
  gem_opening_drop: {
    id: 'gem_opening_drop',
    cost: 25,
    tier: 'epic',
    name: {en: 'Opening Airdrop Gem', zh: '空投先锋宝石'},
    description: {
      en: 'Start every battle with 1 free instant 3-choice airdrop draft to power up right away.',
      zh: '每局开场立即获得 1 次免费三选一空投，开局直接起飞跳过前期刮痧。'
    },
    bonuses: {openingDraft: 1},
  },
  gem_aegis_wall: {
    id: 'gem_aegis_wall',
    cost: 40,
    tier: 'epic',
    name: {en: 'Aegis Bastion Gem', zh: '城墙免疫宝石'},
    description: {
      en: 'Negate the first 5 hits on the wall and knock back attackers with a shock pulse.',
      zh: '城墙每局前 5 次受击完全免疫，并释放震荡波击退贴墙尸群。'
    },
    bonuses: {wallImmunity: 5},
  },
  gem_pierce_core: {
    id: 'gem_pierce_core',
    cost: 45,
    tier: 'epic',
    name: {en: 'Pierce Core Gem', zh: '贯穿核心宝石'},
    description: {
      en: 'Hero shots gain +1 pierce and +8% team damage for effortless horde clearing.',
      zh: '英雄枪械基础穿透 +1，全队伤害 +8%，轻松贯穿整排尸潮。'
    },
    bonuses: {heroPierce: 1, damage: 0.08},
  },
  gem_elemental: {
    id: 'gem_elemental',
    cost: 55,
    tier: 'legend',
    name: {en: 'Elemental Surge Gem', zh: '冰火共鸣宝石'},
    description: {
      en: 'Deal +25% bonus damage to burning, slowed, brittle, or poisoned enemies.',
      zh: '攻击处于燃烧、减速、易伤或中毒状态的敌人时，伤害额外 +25%。'
    },
    bonuses: {statusDamage: 0.25},
  },
  gem_shredder: {
    id: 'gem_shredder',
    cost: 65,
    tier: 'legend',
    name: {en: 'HP Shredder Gem', zh: '百分比斩杀宝石'},
    description: {
      en: 'Critical hits deal +4% target max HP bonus damage (capped at 180 vs bosses).',
      zh: '暴击附带目标 4% 最大生命额外伤害（对首领单次上限 180），专克重甲与首领。'
    },
    bonuses: {shredPercent: 0.04},
  },
  gem_overdrive: {
    id: 'gem_overdrive',
    cost: 75,
    tier: 'legend',
    name: {en: 'Overdrive Arsenal Gem', zh: '超武充能宝石'},
    description: {
      en: 'Auto super-weapons cycle 22% faster, start with 1 random evolution, and +25% Sun Gleaner yield.',
      zh: '全自动超武冷却 -22%，开局额外赠送 1 项随机弹幕/超武进化，辉穗收益 +25%。'
    },
    bonuses: {superweaponHaste: 0.22, starterWeapon: 1, harvest: 0.25},
  },
});

export const EQUIPMENT = deepFreeze(equipmentRecord);
export const PERMANENT_UPGRADES = deepFreeze(permanentRecord);

function fail(reason) {
  return {ok: false, reason};
}

function isProfile(profile) {
  return !!profile && typeof profile === 'object' && !Array.isArray(profile);
}

function currencyOf(profile) {
  const value = profile.currency;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function owns(profile, id) {
  return Array.isArray(profile.equipmentOwned) && profile.equipmentOwned.includes(id);
}

function ownsGem(profile, id) {
  return Array.isArray(profile.gemsOwned) && profile.gemsOwned.includes(id);
}

function addSource(out,bonuses,times) {
  for (const [key,value] of Object.entries(bonuses)) out[key]=Math.round(((out[key] || 0)+times*value)*10000)/10000;
}
function boundedLevel(value, cap) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 0;
  return Math.min(value, cap);
}

export function getProfileBonuses(profile) {
  const bonuses = {damage:0,haste:0,range:0,critChance:0,reward:0,fence:0};
  if (!isProfile(profile)) return bonuses;
  const equipped = profile.equipped && typeof profile.equipped === 'object' ? profile.equipped : null;
  const seenItems = new Set();
  if (equipped) {
    for (const slot of EQUIP_SLOTS) {
      const id = equipped[slot];
      // One owned item, one slot. A repeated id must not stack its bonuses.
      if (typeof id !== 'string' || seenItems.has(id) || !owns(profile, id)) continue;
      const item = EQUIPMENT[id];
      if (!item || item.slot !== slot) continue;
      seenItems.add(id);
      addSource(bonuses, item.bonuses, 1);
    }
  }
  const permanent = profile.permanent && typeof profile.permanent === 'object' ? profile.permanent : null;
  if (permanent) {
    for (const id of PERMANENT_KEYS) {
      const spec = PERMANENT_UPGRADES[id];
      // Level is how many times this rank bonus has been bought. Count it once per rank.
      const level = boundedLevel(permanent[id], spec.cap);
      if (level > 0) addSource(bonuses, spec.bonuses, level);
    }
  }
  const gemsEquipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped : null;
  if (gemsEquipped && gemsEquipped.length) {
    const seenGems = new Set();
    let count = 0;
    for (const id of gemsEquipped) {
      if (count >= GEM_SLOTS) break;
      if (typeof id !== 'string' || seenGems.has(id) || !ownsGem(profile, id)) continue;
      const gem = GEMS[id];
      if (!gem) continue;
      seenGems.add(id);
      count += 1;
      addSource(bonuses, gem.bonuses, 1);
    }
  }
  return bonuses;
}

export function buyGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const gem = typeof id === 'string' ? GEMS[id] : null;
  if (!gem) return fail('unknownItem');
  if (ownsGem(profile, id)) return fail('alreadyOwned');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  if (currency < gem.cost) return fail('insufficientCurrency');
  profile.currency = currency - gem.cost;
  profile.gemsOwned = (Array.isArray(profile.gemsOwned) ? profile.gemsOwned : []).concat(id);
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.slice() : [];
  if (equipped.length < GEM_SLOTS && !equipped.includes(id)) {
    equipped.push(id);
    profile.gemsEquipped = equipped;
  }
  return {ok: true};
}

export function equipGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const gem = typeof id === 'string' ? GEMS[id] : null;
  if (!gem) return fail('unknownItem');
  if (!ownsGem(profile, id)) return fail('notOwned');
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.filter(g => ownsGem(profile, g) && GEMS[g]) : [];
  if (equipped.includes(id)) return {ok: true};
  if (equipped.length >= GEM_SLOTS) equipped.shift();
  equipped.push(id);
  profile.gemsEquipped = equipped;
  return {ok: true};
}

export function unequipGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  if (!Array.isArray(profile.gemsEquipped)) return {ok: true};
  profile.gemsEquipped = profile.gemsEquipped.filter(g => g !== id);
  return {ok: true};
}

export function claimStarterPack(profile) {
  if (!isProfile(profile)) return fail('invalidProfile');
  if (profile.starterClaimed === true) return fail('alreadyOwned');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  profile.starterClaimed = true;
  profile.currency = Math.min(PROGRESSION_RULES.maxCurrency, currency + 180);
  const owned = Array.isArray(profile.gemsOwned) ? profile.gemsOwned.slice() : [];
  if (!owned.includes('gem_opening_drop')) owned.push('gem_opening_drop');
  profile.gemsOwned = owned;
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.slice() : [];
  if (!equipped.includes('gem_opening_drop') && equipped.length < GEM_SLOTS) equipped.push('gem_opening_drop');
  profile.gemsEquipped = equipped;
  return {ok: true, bonus: 180, gem: 'gem_opening_drop'};
}

export function buyEquipment(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const item = typeof id === 'string' ? EQUIPMENT[id] : null;
  if (!item) return fail('unknownItem');
  if (owns(profile, id)) return fail('alreadyOwned');
  if (profile.equipmentOwned != null && !Array.isArray(profile.equipmentOwned)) return fail('invalidProfile');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  if (currency < item.cost) return fail('insufficientCurrency');
  profile.currency = currency - item.cost;
  profile.equipmentOwned = (profile.equipmentOwned || []).concat(id);
  return {ok: true};
}

export function equipItem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const item = typeof id === 'string' ? EQUIPMENT[id] : null;
  if (!item) return fail('unknownItem');
  if (!owns(profile, id)) return fail('notOwned');
  const equipped = profile.equipped;
  if (equipped != null && (typeof equipped !== 'object' || Array.isArray(equipped))) return fail('invalidProfile');
  if (equipped && equipped[item.slot] === id) return {ok: true};
  const next = equipped ? {...equipped} : {weapon: null, charm: null, armor: null};
  for (const slot of EQUIP_SLOTS) {
    if (next[slot] === undefined) next[slot] = null;
    if (slot !== item.slot && next[slot] === id) next[slot] = null;
  }
  next[item.slot] = id;
  profile.equipped = next;
  return {ok: true};
}

function levelForPurchase(profile, id) {
  const permanent = profile.permanent;
  if (permanent == null) return 0;
  if (typeof permanent !== 'object' || Array.isArray(permanent)) return null;
  if (!Object.hasOwn(permanent, id) || permanent[id] == null) return 0;
  const value = permanent[id];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

export function purchasePermanent(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const spec = typeof id === 'string' ? PERMANENT_UPGRADES[id] : null;
  if (!spec) return fail('unknownUpgrade');
  const level = levelForPurchase(profile, id);
  if (level == null) return fail('invalidProfile');
  if (level >= spec.cap) return fail('maxLevel');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  const cost = spec.costs[level];
  if (currency < cost) return fail('insufficientCurrency');
  const permanent = profile.permanent && typeof profile.permanent === 'object' && !Array.isArray(profile.permanent)
    ? {...profile.permanent}
    : {damage: 0, haste: 0, vitality: 0};
  for (const key of PERMANENT_KEYS) {
    if (permanent[key] == null) permanent[key] = 0;
  }
  permanent[id] = level + 1;
  profile.currency = currency - cost;
  profile.permanent = permanent;
  return {ok: true};
}

function buyRank(id) {
  return NEXT_BUY_RANK[id] ?? 50;
}

/**
 * The next Armory action after a loss. An owned item in an empty slot comes first.
 * Otherwise the cheapest remaining purchase, with the fence ahead of a tie.
 * Null when nothing is left to buy or equip.
 */
export function nextArmoryBuy(profile) {
  if (!isProfile(profile)) return null;
  const currency = currencyOf(profile);
  if (currency == null) return null;
  const equipped = profile.equipped && typeof profile.equipped === 'object' && !Array.isArray(profile.equipped)
    ? profile.equipped
    : {};
  const owned = Array.isArray(profile.equipmentOwned) ? profile.equipmentOwned : [];
  const waiting = [];
  for (const id of owned) {
    const item = EQUIPMENT[id];
    if (!item || equipped[item.slot]) continue;
    waiting.push(item);
  }
  if (waiting.length) {
    waiting.sort((a, b) => buyRank(a.id) - buyRank(b.id) || a.id.localeCompare(b.id));
    const item = waiting[0];
    return {kind: 'equip', id: item.id, cost: 0, short: 0, affordable: true, name: item.name};
  }
  const options = [];
  for (const id of PERMANENT_KEYS) {
    const spec = PERMANENT_UPGRADES[id];
    const level = levelForPurchase(profile, id);
    if (level == null || level >= spec.cap) continue;
    options.push({kind: 'permanent', id, cost: spec.costs[level], name: spec.name});
  }
  for (const [id, item] of Object.entries(EQUIPMENT)) {
    if (owns(profile, id)) continue;
    options.push({kind: 'equipment', id, cost: item.cost, name: item.name});
  }
  if (!options.length) return null;
  options.sort((a, b) => a.cost - b.cost || buyRank(a.id) - buyRank(b.id) || a.id.localeCompare(b.id));
  const pick = options[0];
  const short = Math.max(0, pick.cost - currency);
  return {kind: pick.kind, id: pick.id, cost: pick.cost, short, affordable: short === 0, name: pick.name};
}

function cleanNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function isSettlement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.runId === 'string'
    && typeof value.currency === 'number' && Number.isFinite(value.currency)
    && typeof value.result === 'string'
    && typeof value.difficulty === 'string'
    && typeof value.time === 'number' && Number.isFinite(value.time)
    && typeof value.kills === 'number' && Number.isFinite(value.kills)
    && typeof value.wave === 'number' && Number.isFinite(value.wave);
}

function readDifficulty(state) {
  return typeof state.difficulty === 'string' && state.difficulty ? state.difficulty : 'normal';
}

function rewardMultiplier(difficulty) {
  const spec = DIFFICULTIES[difficulty];
  return spec && typeof spec.reward === 'number' && Number.isFinite(spec.reward) ? spec.reward : 1;
}

function resolveResult(state) {
  if (state.phase === 'victory') return 'victory';
  if (state.phase === 'defeat') return 'defeat';
  return 'abandon';
}

function unpaidAbandon(time, kills) {
  if (time <= 0) return true;
  return time < PROGRESSION_RULES.freshTime && kills < PROGRESSION_RULES.freshKills;
}

function progressPoints(time, kills, wave) {
  const rules = PROGRESSION_RULES;
  const countedTime = clamp(time, 0, rules.timeCap);
  const countedKills = clamp(kills, 0, rules.killCap);
  const countedWave = clamp(wave, 0, rules.waveCap);
  return Math.floor(countedTime / rules.secondsPerPoint)
    + Math.floor(countedKills / rules.killsPerPoint)
    + Math.floor(countedWave) * rules.pointsPerWave;
}

function basePoints(time, kills, wave, result) {
  if (result === 'abandon' && unpaidAbandon(time, kills)) return 0;
  let points = progressPoints(time, kills, wave);
  if (result === 'victory') points += PROGRESSION_RULES.victoryBonus;
  if (result === 'abandon') {
    // A run past the fresh-abandon gate pays at least one point, then half progress.
    points = Math.floor(points / PROGRESSION_RULES.abandonDivisor);
    if (points < 1) points = 1;
  }
  return points;
}

function currencyFor(points, difficulty, rewardFraction) {
  if (points <= 0) return 0;
  const bonus = clamp(rewardFraction, 0, PROGRESSION_RULES.rewardFractionCap);
  return Math.max(0, Math.round(points * rewardMultiplier(difficulty) * (1 + bonus)));
}

function payableAmount(profile, amount) {
  if (amount <= 0) return 0;
  let current = profile.currency;
  if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) current = 0;
  const next = Math.min(PROGRESSION_RULES.maxCurrency, current + amount);
  return next - current;
}

function addCurrency(profile, amount) {
  let current = profile.currency;
  if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) current = 0;
  profile.currency = current + amount;
}

function ensureLedger(profile) {
  if (!Array.isArray(profile.settledRuns)) profile.settledRuns = [];
  const ledger = profile.settlementLedger;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) profile.settlementLedger = {};
}

function hasSettled(profile, runId) {
  return typeof runId === 'string' && runId !== '' && Array.isArray(profile.settledRuns) && profile.settledRuns.includes(runId);
}

function ledgerSettlement(profile, runId) {
  if (typeof runId !== 'string' || runId === '') return null;
  const ledger = profile.settlementLedger;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return null;
  const saved = ledger[runId];
  return isSettlement(saved) ? saved : null;
}

function remember(profile, settlement) {
  const id = settlement.runId;
  if (typeof id !== 'string' || id === '') return;
  ensureLedger(profile);
  if (!profile.settledRuns.includes(id)) {
    profile.settledRuns.push(id);
    while (profile.settledRuns.length > PAID_RUN_LIMIT) {
      const old = profile.settledRuns.shift();
      if (old) delete profile.settlementLedger[old];
    }
  }
  if (!profile.settlementLedger[id]) profile.settlementLedger[id] = settlement;
  const recent = new Set(profile.settledRuns.slice(-PROGRESSION_RULES.settledRunLimit));
  for (const key of Object.keys(profile.settlementLedger)) {
    if (!recent.has(key)) delete profile.settlementLedger[key];
  }
}

function progressionBag(state) {
  const systems = state.systems;
  if (!systems || typeof systems !== 'object' || Array.isArray(systems)) return null;
  const bag = systems.progression;
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  return bag;
}

// A missing run id cannot be stored on the profile. Keep the first payout on the run.
function rememberUnkeyed(state, settlement) {
  if (!settlement || settlement.runId !== '') return;
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  const bag = progressionBag(state);
  const next = bag ? {...bag} : {};
  if (!isSettlement(next.settlement)) next.settlement = settlement;
  state.systems.progression = next;
}

function unkeyedSettlement(state) {
  const bag = progressionBag(state);
  if (!bag) return null;
  return isSettlement(bag.settlement) ? bag.settlement : null;
}

function updateBest(profile, settlement) {
  if (settlement.result === 'abandon' && settlement.currency <= 0) return;
  if (!profile.best || typeof profile.best !== 'object' || Array.isArray(profile.best)) profile.best = {};
  const prev = profile.best[settlement.difficulty];
  const prevObj = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  let bestVictoryTime = typeof prevObj.bestVictoryTime === 'number' && Number.isFinite(prevObj.bestVictoryTime)
    ? prevObj.bestVictoryTime
    : null;
  if (settlement.result === 'victory') {
    bestVictoryTime = bestVictoryTime == null ? settlement.time : Math.min(bestVictoryTime, settlement.time);
  }
  const victories = (typeof prevObj.victories === 'number' && Number.isFinite(prevObj.victories) ? prevObj.victories : 0)
    + (settlement.result === 'victory' ? 1 : 0);
  profile.best[settlement.difficulty] = {
    wave: Math.max(cleanNumber(prevObj.wave), settlement.wave),
    kills: Math.max(cleanNumber(prevObj.kills), settlement.kills),
    time: Math.max(cleanNumber(prevObj.time), settlement.time),
    currency: Math.max(cleanNumber(prevObj.currency), settlement.currency),
    victories,
    bestVictoryTime
  };
}

// One victorious sortie clear, written only on the first settlement of a run.
function recordExpedition(profile, state, settlement) {
  if (!settlement || settlement.result !== 'victory') return;
  const id = typeof state.expedition === 'string' && state.expedition ? state.expedition : 'watch';
  if (!profile.expeditions || typeof profile.expeditions !== 'object' || Array.isArray(profile.expeditions)) profile.expeditions = {};
  const prev = profile.expeditions[id];
  const prevClears = prev && typeof prev === 'object' && Number.isFinite(prev.clears) ? prev.clears : 0;
  const prevBest = prev && typeof prev === 'object' && Number.isFinite(prev.bestTime) ? prev.bestTime : null;
  const time = Number.isFinite(settlement.time) ? settlement.time : 0;
  profile.expeditions[id] = {
    clears: prevClears + 1,
    bestTime: prevBest == null ? time : Math.min(prevBest, time),
  };
}

function buildSettlement(state, currency, result) {
  return {
    runId: typeof state.runId === 'string' ? state.runId : '',
    currency,
    difficulty: readDifficulty(state),
    result,
    time: cleanNumber(state.time),
    kills: cleanNumber(state.kills),
    wave: cleanNumber(state.wave)
  };
}

function earnedCurrency(state, result) {
  const time = cleanNumber(state.time);
  const kills = cleanNumber(state.kills);
  const wave = cleanNumber(state.wave);
  const points = basePoints(time, kills, wave, result);
  const snapshot = state.profileSnapshot;
  const rewardFraction = isProfile(snapshot) ? getProfileBonuses(snapshot).reward : 0;
  return currencyFor(points, readDifficulty(state), rewardFraction);
}

export function settleRun(profile, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {runId: '', currency: 0, difficulty: 'normal', result: 'abandon', time: 0, kills: 0, wave: 0};
  }
  if (isSettlement(state.settlement)) {
    if (isProfile(profile) && !hasSettled(profile, state.settlement.runId)) remember(profile, state.settlement);
    rememberUnkeyed(state, state.settlement);
    return state.settlement;
  }
  if (!isProfile(profile)) return Object.freeze(buildSettlement(state, earnedCurrency(state, resolveResult(state)), resolveResult(state)));
  const runId = typeof state.runId === 'string' ? state.runId : '';
  if (runId === '') {
    const locked = unkeyedSettlement(state);
    if (locked) {
      state.settlement = locked;
      return locked;
    }
  }
  const saved = ledgerSettlement(profile, runId);
  if (hasSettled(profile, runId) || saved) {
    if (saved) {
      state.settlement = saved;
      if (!hasSettled(profile, runId)) remember(profile, saved);
      return saved;
    }
    // The id was paid, but the full result aged out of the ledger. Do not pay again.
    const restored = Object.freeze(buildSettlement(state, 0, resolveResult(state)));
    state.settlement = restored;
    remember(profile, restored);
    rememberUnkeyed(state, restored);
    return restored;
  }
  const result = resolveResult(state);
  const amount = payableAmount(profile, earnedCurrency(state, result));
  const settlement = Object.freeze(buildSettlement(state, amount, result));
  state.settlement = settlement;
  addCurrency(profile, amount);
  remember(profile, settlement);
  rememberUnkeyed(state, settlement);
  updateBest(profile, settlement);
  recordExpedition(profile, state, settlement);
  return settlement;
}
