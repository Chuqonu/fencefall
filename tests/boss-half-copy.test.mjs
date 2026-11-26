// Boss catalog copy must say, in both languages, that enrage starts at half of
// maximum health. The data threshold stays 0.5. Hit points, speed, damage, and
// the enrage scales stay on the catalog values this test reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMIES} from '../src/data/enemies.js';

const boss = ENEMIES.boss;

test('boss copy says enrage starts at half of maximum health and the threshold stays 0.5', () => {
  assert.equal(boss.hp, 3000);
  assert.equal(boss.speed, 16);
  assert.equal(boss.damage, 26);
  assert.deepEqual(boss.enrage, {
    threshold: 0.5,
    speedScale: 1.18,
    damageScale: 1.55,
    intervalScale: 0.85,
  });

  const en = boss.description.en;
  const zh = boss.description.zh;
  assert.match(en, /enrage/i);
  assert.match(en, /half \(0\.5\) of its maximum health/);
  assert.match(zh, /狂暴/);
  assert.match(zh, /最大生命的一半（0\.5）/);
});
