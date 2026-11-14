import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT} from '../src/systems/progression.js';

test('armory Chinese calls the fence 栅栏', () => {
  const nails = EQUIPMENT.fence_nails;
  const bow = EQUIPMENT.splinter_bow;
  const mail = EQUIPMENT.bastion_mail;
  assert.equal(nails.name.en, 'Fence Nails');
  assert.equal(nails.name.zh, '栅栏钉');
  assert.equal(bow.description.en, 'A short bow cut from fallen fence wood. +6% hero damage.');
  assert.match(bow.description.zh, /用倒下的栅栏木削成的短弓/);
  assert.match(mail.description.zh, /守栅栏的人穿的叠片甲/);
  assert.equal(nails.bonuses.fence, 30);
  assert.equal(mail.bonuses.fence, 90);
  for (const item of Object.values(EQUIPMENT)) {
    assert.equal(String(item.name.zh).includes('篱'), false, item.id);
    assert.equal(String(item.description.zh).includes('篱'), false, item.id);
  }
});
