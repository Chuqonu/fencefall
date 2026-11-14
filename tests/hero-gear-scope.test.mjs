// Runner Charm haste applies to the hero on the profile that starts a run.
// Rank-1 bolt stats stay on the tower catalog. Haste, crit chance, and range
// text names the hero and keeps the catalog amount. Fence and reward lines do not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createProfile, createRun} from '../src/state.js';
import {getUnitStats} from '../src/data/towers.js';
import {getHeroStats} from '../src/systems/hero.js';
import {EQUIPMENT, PERMANENT_UPGRADES, buyEquipment, equipItem, getProfileBonuses} from '../src/systems/progression.js';

const SCOPE_KEYS = ['haste', 'critChance', 'range'];
const BONUS_KEYS = ['damage', 'haste', 'range', 'critChance', 'fence', 'reward'];

function positiveBonus(bonuses, key) {
  const value = bonuses && bonuses[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function scopeKeys(bonuses) {
  return SCOPE_KEYS.filter(key => positiveBonus(bonuses, key));
}

function gearEntries() {
  const equipment = Object.values(EQUIPMENT).map(item => ({
    kind: 'equipment',
    id: item.id,
    bonuses: item.bonuses,
    description: item.description
  }));
  const permanent = Object.values(PERMANENT_UPGRADES).map(item => ({
    kind: 'permanent',
    id: item.id,
    bonuses: item.bonuses,
    description: item.description
  }));
  return equipment.concat(permanent);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function percentToken(fraction) {
  const tenths = Math.round(fraction * 1000) / 10;
  const digits = Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
  return `${digits}%`;
}

function amountToken(key, value) {
  if (key === 'range' || key === 'fence') return String(value);
  return percentToken(value);
}

function hasAmount(text, token) {
  if (typeof text !== 'string' || !token) return false;
  if (token.endsWith('%')) {
    const number = escapeRegExp(token.slice(0, -1));
    return new RegExp(`(?<!\\d)${number}%`).test(text);
  }
  return new RegExp(`(?<!\\d)${escapeRegExp(token)}(?!\\d)`).test(text);
}

function runnerCharm() {
  const matches = Object.values(EQUIPMENT).filter(item => item && item.name && item.name.en === 'Runner Charm');
  assert.equal(matches.length, 1, 'Runner Charm');
  return matches[0];
}

function heroUnit(state) {
  const unit = state.slots.map(slot => slot.unit).find(unit => unit && (unit.kind === 'hero' || unit.type === 'hero'));
  assert.ok(unit, 'run starts with a hero');
  return unit;
}

function equippedProfile(item) {
  const profile = createProfile();
  profile.currency = item.cost;
  const bought = buyEquipment(profile, item.id);
  assert.equal(bought.ok, true, bought && bought.reason);
  const equipped = equipItem(profile, item.id);
  assert.equal(equipped.ok, true, equipped && equipped.reason);
  assert.equal(profile.equipped[item.slot], item.id);
  assert.ok(profile.equipmentOwned.includes(item.id));
  return profile;
}

test('Runner Charm on the starting profile lowers the hero interval and leaves a rank-1 bolt unchanged', () => {
  const charm = runnerCharm();
  assert.equal(charm.slot, 'charm');
  assert.ok(positiveBonus(charm.bonuses, 'haste'), 'Runner Charm haste');
  const haste = charm.bonuses.haste;
  const cost = charm.cost;

  const plainProfile = createProfile();
  const plain = createRun({seed: 21, difficulty: 'normal', profile: plainProfile, runId: 'gear-plain'});
  const gearedProfile = equippedProfile(charm);
  const geared = createRun({seed: 21, difficulty: 'normal', profile: gearedProfile, runId: 'gear-charm'});

  assert.equal(charm.bonuses.haste, haste);
  assert.equal(charm.cost, cost);
  assert.equal(plain.profileSnapshot.equipped.charm, null);
  assert.equal(geared.profileSnapshot.equipped.charm, charm.id);
  assert.ok(geared.profileSnapshot.equipmentOwned.includes(charm.id));

  const plainBonuses = getProfileBonuses(plain.profileSnapshot);
  const gearedBonuses = getProfileBonuses(geared.profileSnapshot);
  assert.equal(plainBonuses.haste, 0);
  assert.equal(gearedBonuses.haste, haste);
  assert.equal(gearedBonuses.damage, 0);
  assert.equal(gearedBonuses.range, 0);
  assert.equal(gearedBonuses.critChance, 0);
  assert.equal(gearedBonuses.fence, 0);
  assert.equal(gearedBonuses.reward, 0);

  const plainHero = getHeroStats(heroUnit(plain), plain);
  const gearedHero = getHeroStats(heroUnit(geared), geared);
  assert.ok(Number.isFinite(plainHero.interval) && plainHero.interval > 0);
  assert.ok(Number.isFinite(gearedHero.interval) && gearedHero.interval > 0);
  assert.ok(
    gearedHero.interval < plainHero.interval,
    `hero interval with Runner Charm ${gearedHero.interval} is not lower than ${plainHero.interval}`
  );

  const plainBolt = createUnit(plain, 'bolt', 1, 'tower');
  const gearedBolt = createUnit(geared, 'bolt', 1, 'tower');
  plain.slots[0].unit = plainBolt;
  geared.slots[0].unit = gearedBolt;
  assert.equal(plainBolt.type, 'bolt');
  assert.equal(gearedBolt.type, 'bolt');
  assert.equal(plainBolt.rank, 1);
  assert.equal(gearedBolt.rank, 1);
  assert.deepEqual(getUnitStats(gearedBolt, geared), getUnitStats(plainBolt, plain));
});

test('haste, crit chance, and range gear is present on equipment and permanent upgrades', () => {
  const scoped = gearEntries().filter(entry => scopeKeys(entry.bonuses).length > 0);
  assert.ok(scoped.some(entry => entry.kind === 'equipment' && positiveBonus(entry.bonuses, 'haste')));
  assert.ok(scoped.some(entry => entry.kind === 'permanent' && positiveBonus(entry.bonuses, 'haste')));
  assert.ok(scoped.some(entry => positiveBonus(entry.bonuses, 'critChance')));
  assert.ok(scoped.some(entry => positiveBonus(entry.bonuses, 'range')));
});

for (const entry of gearEntries()) {
  const keys = scopeKeys(entry.bonuses);
  if (!keys.length) continue;
  test(`${entry.kind} ${entry.id} names the hero and keeps ${keys.join(', ')}`, () => {
    assert.equal(typeof entry.description?.en, 'string', `${entry.id} English description`);
    assert.equal(typeof entry.description?.zh, 'string', `${entry.id} Chinese description`);
    assert.match(entry.description.en, /hero/i, `${entry.kind} ${entry.id} English`);
    assert.ok(entry.description.zh.includes('英雄'), `${entry.kind} ${entry.id} Chinese`);
    for (const key of keys) {
      const token = amountToken(key, entry.bonuses[key]);
      assert.ok(hasAmount(entry.description.en, token), `${entry.id} English keeps ${key} ${token}`);
      assert.ok(hasAmount(entry.description.zh, token), `${entry.id} Chinese keeps ${key} ${token}`);
    }
  });
}

test('fence-only and reward-only text keeps its amount without a hero requirement', () => {
  const exempt = gearEntries().filter(entry => {
    const keys = BONUS_KEYS.filter(key => positiveBonus(entry.bonuses, key));
    return keys.length > 0 && keys.every(key => key === 'fence' || key === 'reward');
  });
  assert.ok(exempt.length > 0, 'fence-only or reward-only gear');
  for (const entry of exempt) {
    assert.equal(scopeKeys(entry.bonuses).length, 0, `${entry.id} is outside hero-scoped bonuses`);
    for (const key of ['fence', 'reward']) {
      if (!positiveBonus(entry.bonuses, key)) continue;
      const token = amountToken(key, entry.bonuses[key]);
      assert.ok(hasAmount(entry.description.en, token), `${entry.id} English keeps ${key} ${token}`);
      assert.ok(hasAmount(entry.description.zh, token), `${entry.id} Chinese keeps ${key} ${token}`);
    }
  }
});
