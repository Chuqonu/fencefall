// The inset slot block leaves side rooms. A thin sill may continue the fence
// to the edge. Crates, stakes, sandbags, posts, and other props must not sit there.
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
  slots[2] = {unit: {id: 'hero', kind: 'hero', type: 'hero', rank: 1}};
  drawWorld(ctx, {
    phase: 'playing',
    fence: {hp: Math.round(600 * ratio), maxHp: 600},
    slots
  }, {time: 1.2, reducedMotion: false});
  return rects;
}

function inMargin(rect, start, end) {
  return rect.w > 0 && rect.h > 0 && rect.x >= start && rect.x + rect.w <= end;
}

function overlaps(rect, slot) {
  return rect.x < slot.left + slot.width
    && rect.x + rect.w > slot.left
    && rect.y < slot.top + slot.height
    && rect.y + rect.h > slot.top;
}

test('side rooms stay empty and a thin sill meets the fence', () => {
  assert.equal(ARENA.fenceY, 512);
  assert.equal(ARENA.frontY, 560);
  assert.equal(ARENA.backY, 612);
  assert.equal(ARENA.pitch, 48);
  assert.equal(ARENA.sideMargin, 60);
  assert.equal(slotGeometry(2).col, 2);
  assert.equal(slotGeometry(2).row, 0);

  const margin = ARENA.sideMargin;
  const roomTop = slotGeometry(0).top;
  const roomBottom = slotGeometry(ARENA.cols).top + slotGeometry(ARENA.cols).height;
  const slots = Array.from({length: 10}, (_, index) => slotGeometry(index));
  const bands = [[0, margin], [ARENA.width - margin, ARENA.width]];

  for (const ratio of [1, 0.2]) {
    const rects = paint(ratio);
    for (const [start, end] of bands) {
      const side = rects.filter(rect => inMargin(rect, start, end));
      const sill = side.filter(rect => rect.w >= margin - 2 && rect.h <= 4 && rect.y >= ARENA.fenceY && rect.y + rect.h <= roomTop);
      assert.ok(sill.length >= 1, `missing thin sill in ${start}-${end} at ratio ${ratio}`);
      const props = side.filter(rect => rect.y < roomBottom && rect.y + rect.h > roomTop);
      assert.equal(props.length, 0, `side room ${start}-${end} still holds ${props.length} props`);
      for (const rect of side) {
        for (const slot of slots) {
          assert.equal(overlaps(rect, slot), false, `sill ${rect.x},${rect.y} covers slot ${slot.index}`);
        }
      }
    }
  }
});
