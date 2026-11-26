// Equipment, permanent hero upgrades, and one-time run settlement.
//
// getProfileBonuses(profile) fields:
//   damage, haste, critChance, reward — fractions (0.06 = +6%)
//   range — additive logical pixels
//   fence — additive starting fence HP
// Apply damage / haste / range / critChance in getHeroStats only:
//   damage *= (1 + damage); interval /= (1 + haste); range += range; critChance += critChance.
// Add fence to fence.hp and fence.maxHp once when the run is created.
// settleRun already multiplies payout by (1 + reward) from state.profileSnapshot.
// Doing either step twice double-counts.
//
// Reward, before the difficulty multiplier:
//   floor(min(time, timeCap) / secondsPerPoint)
//   + floor(min(kills, killCap) / killsPerPoint)
//   + floor(min(wave, waveCap)) * pointsPerWave
//   + victoryBonus on victory
//   Abandon keeps half of that progress (no victory bonus).
//   Abandon pays 0 when time <= 0, or when time < 30 and kills < 3.
// currency = round(points * DIFFICULTIES[difficulty].reward * (1 + snapshot.reward))
// Caps stop an endless run from minting unbounded currency. A normal 12–16 min
// clear sits under the time cap.
//
// Call settleRun only after phase is victory or defeat, or when the player
// explicitly abandons. Any other phase settles as abandon and then locks.
// Settlement is immutable. A second call returns the same object and does not pay.
//
// Save order: settleRun(profile, state), then saveProfile, then saveRun.
// Profile-first keeps the currency if the run write fails. state.settlement,
// profile.settledRuns, and profile.settlementLedger each stop a second payout.
// settledRuns keeps paid ids (up to 2000, the profile save ceiling). The ledger
// keeps full results for the newest 64 ids only. Dropping an id would let that
// run pay again. A run with no id is locked on the run object. Buying equipment
// does not equip it.
// One owned item can be equipped in its own slot and replaces the previous one.
// Permanent bonuses are per rank; price is costs[currentLevel] until cap.
// Buy / equip / upgrade failures use reason:
// invalidProfile, unknownItem, alreadyOwned, insufficientCurrency, notOwned,
// unknownUpgrade, maxLevel. Success is {ok:true} and does not include reason.
// Settlement result is victory, defeat, or abandon.

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
const PERMANENT_KEYS = ['damage', 'haste', 'vitality'];
// After a loss, suggest the fence first when two buys cost the same.
const NEXT_BUY_RANK = Object.freeze({
  vitality: 0,
  fence_nails: 1,
  ward_planks: 2,
  bastion_mail: 3,
  damage: 4,
  splinter_bow: 5,
  hawk_brace: 6,
  stormglass_edge: 7,
  haste: 8,
  runner_charm: 9,
  survey_bead: 10,
  bounty_seal: 11,
});
const FRACTION_KEYS = ['damage', 'haste', 'critChance', 'reward'];
const ABSOLUTE_KEYS = ['range', 'fence'];
const OUTPUT_CAP_MILLI = Object.freeze({damage: 400, haste: 400, critChance: 200, reward: 250});
const OUTPUT_CAP_ABS = Object.freeze({range: 64, fence: 220});

function formatPercent(fraction) {
  const tenths = Math.round(fraction * 1000) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

function equipmentDescription(flavorEn, flavorZh, bonuses) {
  const en = [];
  const zh = [];
  if (bonuses.damage) {
    en.push(`+${formatPercent(bonuses.damage)}% hero damage`);
    zh.push(`英雄伤害+${formatPercent(bonuses.damage)}%`);
  }
  if (bonuses.critChance) {
    en.push(`+${formatPercent(bonuses.critChance)}% hero crit chance`);
    zh.push(`英雄暴击率+${formatPercent(bonuses.critChance)}%`);
  }
  if (bonuses.haste) {
    en.push(`+${formatPercent(bonuses.haste)}% hero attack speed`);
    zh.push(`英雄攻击速度+${formatPercent(bonuses.haste)}%`);
  }
  if (bonuses.range) {
    en.push(`+${bonuses.range} hero range`);
    zh.push(`英雄射程+${bonuses.range}`);
  }
  if (bonuses.fence) {
    en.push(`+${bonuses.fence} starting fence HP`);
    zh.push(`开局栅栏生命+${bonuses.fence}`);
  }
  if (bonuses.reward) {
    en.push(`+${formatPercent(bonuses.reward)}% run rewards`);
    zh.push(`结算奖励+${formatPercent(bonuses.reward)}%`);
  }
  return {
    en: `${flavorEn} ${en.join(', ')}.`,
    zh: `${flavorZh}${zh.join('，')}。`
  };
}

function permanentDescription(flavorEn, flavorZh, bonuses, cap) {
  const effect = equipmentDescription('', '', bonuses);
  const enEffect = effect.en.replace(/\.$/, '').trim();
  const zhEffect = effect.zh.replace(/。$/, '').trim();
  return {
    en: `${flavorEn} Each rank: ${enEffect}, up to rank ${cap}. Each rank costs more than the last.`,
    zh: `${flavorZh}每一级：${zhEffect}，最高${cap}级。价格逐级上升。`
  };
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
  splinter_bow: {en: 'Splinter Bow', zh: '裂片弓'},
  hawk_brace: {en: 'Hawk Brace', zh: '鹰眼护腕'},
  stormglass_edge: {en: 'Stormglass Edge', zh: '风暴璃刃'},
  runner_charm: {en: 'Runner Charm', zh: '奔行护符'},
  survey_bead: {en: 'Survey Bead', zh: '测距珠'},
  bounty_seal: {en: 'Bounty Seal', zh: '赏金印'},
  fence_nails: {en: 'Fence Nails', zh: '栅栏钉'},
  ward_planks: {en: 'Ward Planks', zh: '护栏板'},
  bastion_mail: {en: 'Bastion Mail', zh: '堡垒甲'}
};

const rawEquipment = [
  gear('splinter_bow', 'weapon', 65, {damage: 0.06}, 'A short bow cut from fallen fence wood.', '用倒下的栅栏木削成的短弓。'),
  gear('hawk_brace', 'weapon', 160, {damage: 0.04, critChance: 0.04, range: 16}, 'A watcher\'s brace that steadies aim.', '稳固瞄准的哨兵护腕。'),
  gear('stormglass_edge', 'weapon', 320, {damage: 0.10, critChance: 0.05, haste: 0.04}, 'A thin glass edge that snaps the arm forward.', '带动挥击的薄璃刃。'),
  gear('runner_charm', 'charm', 55, {haste: 0.06}, 'A light charm worn by runners on the wall.', '墙头奔行者佩的轻护符。'),
  gear('survey_bead', 'charm', 150, {range: 24, damage: 0.03}, 'A bead ground to measure the open field.', '用来丈量空地的测距珠。'),
  gear('bounty_seal', 'charm', 280, {reward: 0.10, critChance: 0.02}, 'Runs that start with this charm equipped pay a larger purse. Difficulty still multiplies the total.', '开局就装备此护符的对局会提高赏金，难度倍率仍会计入。'),
  gear('fence_nails', 'armor', 45, {fence: 30}, 'Extra nails driven into the fence before the fight.', '战前多钉进栅栏的钉子。'),
  gear('ward_planks', 'armor', 130, {fence: 60, damage: 0.02}, 'Spare planks braced behind the weak posts.', '撑在薄弱木桩后的备用板。'),
  gear('bastion_mail', 'armor', 260, {fence: 90, haste: 0.03}, 'Overlapping plates for the fence watch.', '守栅栏的人穿的叠片甲。')
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
  damage: track('damage', 5, [40, 70, 110, 170, 240], {damage: 0.02}, {en: 'Sharpened Instinct', zh: '锐化直觉'}, 'Training that stays between runs.', '跨对局保留的训练。'),
  haste: track('haste', 5, [40, 70, 110, 170, 240], {haste: 0.02}, {en: 'Quick Hands', zh: '迅捷手法'}, 'Repetition that shortens the gap between shots.', '缩短射击间隔的练习。'),
  vitality: track('vitality', 5, [35, 60, 100, 150, 220], {fence: 12}, {en: 'Deep Roots', zh: '深根'}, 'Deeper posts for the starting fence.', '把开局栅栏立得更深。')
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

function zeroBonuses() {
  return {damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0};
}

function addSource(milli, absolute, bonuses, times) {
  if (!bonuses || typeof bonuses !== 'object') return;
  for (const key of FRACTION_KEYS) {
    const value = bonuses[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      milli[key] += Math.round(value * 1000) * times;
    }
  }
  for (const key of ABSOLUTE_KEYS) {
    const value = bonuses[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) absolute[key] += value * times;
  }
}

function boundedLevel(value, cap) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 0;
  return Math.min(value, cap);
}

export function getProfileBonuses(profile) {
  const bonuses = zeroBonuses();
  if (!isProfile(profile)) return bonuses;
  const milli = {damage: 0, haste: 0, critChance: 0, reward: 0};
  const absolute = {range: 0, fence: 0};
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
      addSource(milli, absolute, item.bonuses, 1);
    }
  }
  const permanent = profile.permanent && typeof profile.permanent === 'object' ? profile.permanent : null;
  if (permanent) {
    for (const id of PERMANENT_KEYS) {
      const spec = PERMANENT_UPGRADES[id];
      // Level is how many times this rank bonus has been bought. Count it once per rank.
      const level = boundedLevel(permanent[id], spec.cap);
      if (level > 0) addSource(milli, absolute, spec.bonuses, level);
    }
  }
  bonuses.damage = Math.min(OUTPUT_CAP_MILLI.damage, milli.damage) / 1000;
  bonuses.haste = Math.min(OUTPUT_CAP_MILLI.haste, milli.haste) / 1000;
  bonuses.critChance = Math.min(OUTPUT_CAP_MILLI.critChance, milli.critChance) / 1000;
  bonuses.reward = Math.min(OUTPUT_CAP_MILLI.reward, milli.reward) / 1000;
  bonuses.range = Math.min(OUTPUT_CAP_ABS.range, absolute.range);
  bonuses.fence = Math.min(OUTPUT_CAP_ABS.fence, absolute.fence);
  return bonuses;
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
