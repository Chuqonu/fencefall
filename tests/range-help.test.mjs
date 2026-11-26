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

test('bolt and banner descriptions use the same closest-to-the-fence rule', () => {
  for (const id of ['bolt', 'support']) {
    const text = TOWERS[id].description;
    assert.match(text.en, /closest to the fence/);
    assert.match(text.zh, /最靠近栅栏/);
    assert.equal(text.en.includes('any enemy'), false, id);
    assert.equal(text.zh.includes('任意敌人'), false, id);
  }
});
