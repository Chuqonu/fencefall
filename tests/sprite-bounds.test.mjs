import test from 'node:test';
import assert from 'node:assert/strict';
import {drawEnemy, enemySize} from '../src/render/enemies.js';

const KINDS = ['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss'];

test('every enemy sprite stays inside its size box', () => {
  for (const kind of KINDS) {
    for (const attacking of [false, true]) {
      const enragedValues = kind === 'boss' ? [false, true] : [false];
      for (const enraged of enragedValues) {
        const marks = [];
        const ctx = {
          save() {},
          restore() {},
          fillRect(x, y) { marks.push([x, y]); },
        };
        const enemy = {kind, attacking, enraged};
        const size = enemySize(enemy);
        drawEnemy(ctx, enemy, 200, 200, {scale: 1, flash: 0, time: attacking ? 0 : 0.5});
        assert.ok(marks.length > 0, `${kind} drew nothing`);
        const xs = marks.map(mark => mark[0]);
        const ys = marks.map(mark => mark[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const left = 200 - size.width / 2;
        const top = 200 - size.height;
        const label = `${kind} attacking=${attacking} enraged=${enraged}`;
        assert.ok(minX >= left - 0.01, `${label} left ${minX} < ${left}`);
        assert.ok(maxX <= left + size.width - 1 + 0.01, `${label} right ${maxX}`);
        assert.ok(minY >= top - 0.01, `${label} top ${minY} < ${top}`);
        assert.ok(maxY <= 200 + 0.01, `${label} bottom ${maxY}`);
      }
    }
  }
});
