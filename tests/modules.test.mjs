import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TYPES} from '../src/shared.js';
import {TOWERS} from '../src/data/towers.js';
import {MESSAGES, t} from '../src/i18n.js';

test('six base turrets are defined cleanly with zero harvest/PvZ types', () => {
  assert.equal(BASE_TYPES.length, 6);
  assert.equal(BASE_TYPES.includes('harvest'), false);
  for (const type of BASE_TYPES) {
    assert.ok(TOWERS[type], `TOWERS.${type}`);
    assert.equal(typeof TOWERS[type].name.en, 'string');
    assert.equal(typeof TOWERS[type].name.zh, 'string');
  }
});

test('interface strings exist in Chinese and English', () => {
  assert.equal(t('zh', 'title'), '最后一道防线');
  assert.equal(t('en', 'play'), 'Play');
  assert.notEqual(t('en', 'missing-key'), undefined);
  assert.equal(t('en', 'missing-key'), 'missing-key');
  for (const key of Object.keys(MESSAGES.en)) assert.equal(typeof MESSAGES.zh[key], 'string');
  for (const key of Object.keys(MESSAGES.zh)) assert.equal(typeof MESSAGES.en[key], 'string');
});
