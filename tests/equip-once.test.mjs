import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {EQUIPMENT, buyEquipment, equipItem, getProfileBonuses} from '../src/systems/progression.js';

const BONUS_KEYS = ['damage', 'haste', 'range', 'critChance', 'fence', 'reward'];

function oneCopy(item) {
  const bonuses = {damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0};
  for (const key of BONUS_KEYS) {
    const value = item.bonuses?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) bonuses[key] = value;
  }
  return bonuses;
}

test('buying and equipping one item applies its bonus once', () => {
  const item = EQUIPMENT.splinter_bow;
  const expected = oneCopy(item);
  assert.equal(item.slot, 'weapon');
  assert.ok(expected.damage > 0, 'splinter bow damage');
  assert.equal(BONUS_KEYS.filter(key => expected[key] > 0).length, 1);

  const profile = createProfile();
  profile.currency = item.cost;
  const wallet = profile.currency;

  const bought = buyEquipment(profile, item.id);
  assert.equal(bought.ok, true);
  assert.equal(profile.currency, wallet - item.cost);
  assert.deepEqual(profile.equipmentOwned, [item.id]);
  assert.equal(profile.equipped.weapon, null);
  assert.deepEqual(getProfileBonuses(profile), oneCopy({bonuses: {}}));

  const equipped = equipItem(profile, item.id);
  assert.equal(equipped.ok, true);
  assert.equal(profile.equipped.weapon, item.id);
  const once = getProfileBonuses(profile);
  assert.deepEqual(once, expected);
  assert.equal(once.damage, item.bonuses.damage);

  const again = equipItem(profile, item.id);
  assert.equal(again.ok, true);
  assert.equal(profile.equipped.weapon, item.id);
  assert.deepEqual(profile.equipmentOwned, [item.id]);
  assert.equal(profile.currency, wallet - item.cost);

  const twice = getProfileBonuses(profile);
  assert.deepEqual(twice, expected);
  assert.deepEqual(twice, once);
  for (const key of BONUS_KEYS) {
    assert.equal(twice[key], expected[key]);
    if (expected[key] > 0) {
      assert.ok(Math.abs(twice[key] - expected[key] * 2) > 1e-9, `${key} doubled`);
    }
  }
});
