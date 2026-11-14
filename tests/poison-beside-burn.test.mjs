// A poison tick on a burning enemy keeps its own green number.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEffects} from '../src/render/effects.js';

function paint(events) {
  const effects = createEffects();
  effects.ingest(events);
  const marks = [];
  const ctx = {
    fillStyle: '#000',
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect(x, y, w, h) {
      marks.push({x, y, w, h, color: ctx.fillStyle});
    },
  };
  effects.draw(ctx, {});
  return marks;
}

test('a poison tick stays green beside a burn tick on the same enemy', () => {
  const marks = paint([
    {type: 'hit', damage: 2, x: 120, y: 200, towerType: 'burn'},
    {type: 'hit', damage: 1.5, x: 120, y: 200, towerType: 'poison'},
  ]);
  const burn = marks.filter(mark => mark.color === '#ff9a3c');
  const poison = marks.filter(mark => mark.color === '#b6e84a');
  assert.ok(burn.length > 0, 'burn number is drawn');
  assert.ok(poison.length > 0, 'poison number is drawn');
  const burnX = Math.min(...burn.map(mark => mark.x));
  const poisonX = Math.min(...poison.map(mark => mark.x));
  assert.ok(poisonX > burnX, 'the poison number sits to the right of the burn number');
});
