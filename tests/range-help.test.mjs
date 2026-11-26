import test from 'node:test';
import assert from 'node:assert/strict';
import {t} from '../src/i18n.js';
import {TOWERS} from '../src/data/towers.js';

test('the range help says the shot prefers the enemy closest to the fence', () => {
  assert.match(t('en', 'helpRange'), /closest to the fence/);
  assert.match(t('zh', 'helpRange'), /最靠近栅栏/);
  assert.equal(t('en', 'helpRange').includes('any enemy'), false);
  assert.equal(t('zh', 'helpRange').includes('任意敌人'), false);
});

test('bolt and support cards describe their different roles in both languages', () => {
  assert.match(TOWERS.bolt.description.en,/pierce/i);
  assert.match(TOWERS.bolt.description.zh,/穿/);
  assert.match(TOWERS.support.description.en,/allies|nearby|aura/i);
  assert.match(TOWERS.support.description.zh,/友|周围|光环/);
});
