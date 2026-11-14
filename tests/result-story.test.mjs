// The results sentence says what happened and what was paid.
// It never prints a raw outcome or reason code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resultLabel, resultStory} from '../src/i18n.js';

const CODES = ['abandon', 'victory', 'defeat', 'invalid_json', 'heroProtected', 'bad-phase'];

test('victory and defeat name the fence and the amount in both languages', () => {
  const zhWin = resultStory('zh', 'victory', 1280);
  const enWin = resultStory('en', 'victory', 1280);
  const zhLoss = resultStory('zh', 'defeat', 40);
  const enLoss = resultStory('en', 'defeat', 40);
  assert.match(zhWin, /栅栏守住了/);
  assert.match(zhWin, /一次。获得/);
  assert.match(zhWin, /1,280|1280/);
  assert.match(enWin, /fence held/i);
  assert.match(enWin, /Earned/);
  assert.match(enWin, /1,280|1280/);
  assert.match(zhLoss, /栅栏倒下了/);
  assert.match(zhLoss, /一次。获得/);
  assert.match(enLoss, /fence fell/i);
  assert.match(enLoss, /Earned/);
  for (const story of [zhWin, enWin, zhLoss, enLoss]) {
    for (const code of CODES) assert.equal(story.includes(code), false, story);
  }
});

test('an abandon says the player left and what was paid, including a short run', () => {
  const zh = resultStory('zh', 'abandon', 0);
  const en = resultStory('en', 'abandon', 0);
  const paid = resultStory('en', 'abandon', 6);
  assert.match(zh, /离开/);
  assert.match(zh, /没有报酬。获得/);
  assert.match(en, /left this fight/i);
  assert.match(en, /too short/i);
  assert.match(en, /Earned/);
  assert.match(paid, /Earned/);
  assert.equal(paid.includes('too short'), false);
  assert.equal(resultLabel('zh', 'abandon'), '已放弃');
  assert.equal(resultLabel('en', 'abandon'), 'Abandoned');
  for (const story of [zh, en, paid]) assert.equal(story.includes('abandon'), false, story);
});

test('an unknown outcome stays a sentence and does not echo the code', () => {
  const zh = resultStory('zh', 'invalid_json', null);
  const en = resultStory('en', 'not_a_result', 3);
  assert.match(zh, /还没有结算结果|结算后/);
  assert.equal(zh.includes('invalid_json'), false);
  assert.match(en, /no settled outcome|reward appears/i);
  assert.equal(en.includes('not_a_result'), false);
  assert.equal(resultLabel('en', 'heroProtected').includes('heroProtected'), false);
});
