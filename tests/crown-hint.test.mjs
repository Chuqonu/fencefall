import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENEMIES} from '../src/data/enemies.js';
import {WAVES} from '../src/systems/waves.js';

const FALSE_EN = /half health it enrages and calls/i;
const FALSE_ZH = /半血会狂暴并召唤/;

test('crown hints say the boss calls dust gnawers while it lives, and half health only enrages it', () => {
  const crown = WAVES.find(wave => wave.hint?.en?.startsWith('Last foe: Crown Breach'));
  const lesser = WAVES.find(wave => wave.hint?.en?.startsWith('A lesser Crown Breach'));
  assert.ok(crown, 'crown wave');
  assert.ok(lesser, 'lesser crown wave');
  for (const wave of [crown, lesser]) {
    assert.match(wave.hint.en, /calls dust gnawers while alive/);
    assert.match(wave.hint.en, /half health only enrages it/i);
    assert.equal(FALSE_EN.test(wave.hint.en), false, wave.id);
    assert.ok(wave.hint.en.length <= 110, `${wave.id} hint is ${wave.hint.en.length} characters`);
    assert.match(wave.hint.zh, /存活期间都会召唤尘啮/);
    assert.match(wave.hint.zh, /半血只会让它狂暴/);
    assert.equal(FALSE_ZH.test(wave.hint.zh), false, wave.id);
  }
  assert.match(crown.hint.en, /Clear the field to win/);
  assert.match(crown.hint.zh, /清场即可获胜/);
  for (const wave of WAVES) {
    assert.equal(FALSE_EN.test(wave.hint?.en || ''), false, wave.id);
    assert.equal(FALSE_ZH.test(wave.hint?.zh || ''), false, wave.id);
  }
  assert.equal(ENEMIES.boss.enrage.threshold, 0.5);
  assert.equal(ENEMIES.boss.summon.interval, 7.5);
  assert.equal(ENEMIES.boss.summon.count, 2);
});

test('the battle hint can show two lines', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.hud-hint {'), css.indexOf('.hud-hint:empty'));
  assert.match(rule, /-webkit-line-clamp:\s*2/);
  assert.equal(rule.includes('white-space: nowrap'), false);
  assert.equal(rule.includes('max-height: 1.35em'), false);
});
