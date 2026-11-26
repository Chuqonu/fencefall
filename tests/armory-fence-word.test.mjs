import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT} from '../src/systems/progression.js';

test('armory Chinese calls the fence 栅栏', () => {
  const nails = EQUIPMENT.fence_nails;
  const bow = EQUIPMENT.splinter_bow;
  const mail = EQUIPMENT.surge_capacitor;
  assert.equal(nails.name.en, 'Fence Nails');
  assert.equal(nails.name.zh, '栅栏钉');
  assert.equal(bow.description.en, '+6% team damage');
  assert.match(bow.description.zh, /全队伤害/);
  assert.match(mail.description.zh, /冲击波/);
  assert.equal(nails.bonuses.fence, 40);
  assert.equal(mail.bonuses.surgeCharges, 1);
  for (const item of Object.values(EQUIPMENT)) {
    assert.equal(String(item.name.zh).includes('篱'), false, item.id);
    assert.equal(String(item.description.zh).includes('篱'), false, item.id);
  }
});
