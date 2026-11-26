import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {nextArmoryBuy} from '../src/systems/progression.js';
import {armoryNextLine} from '../src/i18n.js';

test('an empty purse names Deep Roots and the shortfall', () => {
  const profile = createProfile('en');
  const offer = nextArmoryBuy(profile);
  assert.equal(offer.id, 'vitality');
  assert.equal(offer.cost, 35);
  assert.equal(offer.short, 35);
  assert.equal(profile.currency, 0);
  assert.equal(armoryNextLine('en', offer), 'You need 35 more for Deep Roots, which costs 35.');
  assert.equal(armoryNextLine('zh', offer), '还差 35 才能购买深根，价格 35。');
});

test('enough currency says that rank applies on the next run', () => {
  const profile = createProfile('en');
  profile.currency = 40;
  const offer = nextArmoryBuy(profile);
  assert.equal(offer.affordable, true);
  assert.equal(offer.cost, 35);
  assert.equal(profile.currency, 40);
  assert.equal(armoryNextLine('en', offer), 'You can buy Deep Roots for 35. It applies on the next run.');
  assert.equal(armoryNextLine('zh', offer), '可以购买深根，价格 35。下一局生效。');
});

test('owned fence nails in an empty slot come before a new purchase', () => {
  const profile = createProfile('en');
  profile.equipmentOwned = ['fence_nails', 'runner_charm'];
  const offer = nextArmoryBuy(profile);
  assert.equal(offer.kind, 'equip');
  assert.equal(offer.id, 'fence_nails');
  assert.equal(armoryNextLine('en', offer), 'Equip Fence Nails before the next run.');
  assert.equal(armoryNextLine('zh', offer), '下一局开始前装备栅栏钉。');
});

test('a filled armor slot does not ask for a second armor piece', () => {
  const profile = createProfile('en');
  profile.currency = 100;
  profile.equipmentOwned = ['fence_nails'];
  profile.equipped = {weapon: null, charm: null, armor: 'fence_nails'};
  const offer = nextArmoryBuy(profile);
  assert.equal(offer.kind, 'permanent');
  assert.equal(offer.id, 'vitality');
  assert.equal(offer.affordable, true);
});
