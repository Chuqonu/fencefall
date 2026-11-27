// v5 battlefield backdrop draws sky, road, fortified wall, and central commander
// deck cleanly across full and damaged wall ratios without a 2x5 tower grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENA, slotGeometry} from '../src/shared.js';
import {drawWorld} from '../src/render/world.js';

function paint(ratio) {
  const rects = [];
  let ty = 0;
  const stack = [];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    save() { stack.push(ty); },
    restore() { ty = stack.pop() ?? 0; },
    translate(_x, y) { ty += y; },
    beginPath() {},
    rect() {},
    clip() {},
    fillRect(x, y, w, h) {
      rects.push({x, y: y + ty, w, h});
    }
  };
  const slots = Array.from({length: 10}, () => ({unit: null}));
  slots[2] = {unit: {id: 'hero', kind: 'hero', type: 'hero', rank: 1, upgrades: {}}};
  drawWorld(ctx, {
    phase: 'playing',
    fence: {hp: Math.round(600 * ratio), maxHp: 600},
    slots
  }, {time: 1.2, reducedMotion: false});
  return rects;
}

test('battlefield world draws sky, road, wall, and center bastion deck cleanly with no 2x5 grid', () => {
  assert.equal(ARENA.fenceY, 512);
  assert.equal(ARENA.frontY, 560);
  assert.equal(slotGeometry(2).x, 180);
  assert.equal(slotGeometry(2).y, ARENA.frontY);

  for (const ratio of [1, 0.2]) {
    const rects = paint(ratio);
    assert.ok(rects.length >= 4, `world drew backdrop layers at ratio ${ratio}`);
    // Wall spans the full arena width across ARENA.fenceY
    const wall = rects.filter(r => r.x === 0 && r.w === ARENA.width && r.y <= ARENA.fenceY && r.y + r.h >= ARENA.fenceY);
    assert.ok(wall.length >= 1, `fortified wall covers fenceY at ratio ${ratio}`);
    // Commander deck spans below the wall without 10 individual 48x48 grid tiles
    const gridCells = rects.filter(r => r.w === 48 && r.h === 48);
    assert.equal(gridCells.length, 0, 'no 2x5 tower grid cells drawn');
  }
});
