import test from 'node:test';
import assert from 'node:assert/strict';
import {drawEnemy} from '../src/render/enemies.js';

const BOX_W = 18;
const BOX_H = 24;
const ANCHOR_X = 200;
const ANCHOR_Y = 200;

function ink(attacking, time) {
  const marks = [];
  const ctx = {
    save() {},
    restore() {},
    fillRect(x, y, w, h) {
      marks.push({x, y, w, h});
    }
  };
  drawEnemy(ctx, {kind: 'runner', attacking}, ANCHOR_X, ANCHOR_Y, {
    scale: 1,
    flash: 0,
    time
  });
  return marks;
}

test('runner attack and both walk frames stay inside the 18 by 24 box', () => {
  const frames = [
    {name: 'attack', attacking: true, time: 0},
    {name: 'walk step', attacking: false, time: 1 / 6},
    {name: 'walk plant', attacking: false, time: 0}
  ];
  const left = ANCHOR_X - BOX_W / 2;
  const top = ANCHOR_Y - BOX_H;
  const seen = new Set();
  for (const frame of frames) {
    const marks = ink(frame.attacking, frame.time);
    assert.ok(marks.length > 0, `${frame.name} drew nothing`);
    seen.add(marks.map((mark) => `${mark.x},${mark.y},${mark.w},${mark.h}`).join(';'));
    for (const mark of marks) {
      const label = `${frame.name} pixel ${mark.x},${mark.y}`;
      assert.ok(mark.x >= left - 0.01, `${label} left of ${left}`);
      assert.ok(mark.y >= top - 0.01, `${label} above ${top}`);
      assert.ok(mark.x + mark.w <= left + BOX_W + 0.01, `${label} right of ${left + BOX_W}`);
      assert.ok(mark.y + mark.h <= ANCHOR_Y + 0.01, `${label} below ${ANCHOR_Y}`);
    }
  }
  assert.equal(seen.size, frames.length, 'attack and both walk frames should each draw');
});
