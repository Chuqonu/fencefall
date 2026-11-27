// A rank-1 bolt on a rear slot must acquire an enemy stopped on the fence
// when that center is inside the tower's range, and must ignore an enemy
// whose center is outside it. Slot centers come from slotGeometry.
// Acquisition is the combat step. A tower shoots an enemy inside its range,
// preferring the one closest to the fence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA, STEP, createUnit, distance, slotGeometry} from '../src/shared.js';
import {getUnitStats} from '../src/data/towers.js';
import {HERO_BASE} from '../src/systems/hero.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';

const REAR_SLOTS = [5, 6, 7, 8, 9];
const BASIC = 'bolt';

function fresh(label) {
  const state = createRun({seed: 14, difficulty: 'normal', runId: `rear-range-${label}`});
  for (const slot of state.slots) slot.unit = null;
  state.enemies = [];
  state.projectiles = [];
  state.events = [];
  return state;
}

test('the defender block is a centered 2×5 grid under a lower fence', () => {
  assert.equal(ARENA.rows, 2);
  assert.equal(ARENA.cols, 5);
  assert.equal(ARENA.fenceY, 512);
  assert.equal(ARENA.frontY, 560);
  assert.equal(ARENA.backY, 612);
  assert.equal(ARENA.pitch, 48);
  assert.equal(ARENA.sideMargin, 60);
  assert.equal(ARENA.slotWidth, 48);
  assert.equal(ARENA.slotHeight, 48);
  assert.ok(ARENA.backY - ARENA.frontY < 84);
  assert.ok(ARENA.frontY > ARENA.fenceY);
  assert.equal(HERO_BASE.range, 390);
  const reachY = ARENA.frontY - HERO_BASE.range;
  assert.ok(reachY === 170, `front-row range ends at y=${reachY}`);
  const front = [];
  const back = [];
  for (let index = 0; index < ARENA.rows * ARENA.cols; index += 1) {
    const slot = slotGeometry(index);
    assert.equal(slot.width, ARENA.slotWidth);
    assert.equal(slot.height, ARENA.slotHeight);
    assert.ok(slot.width >= 40 && slot.height >= 40, 'sprite body fits the slot');
    assert.equal(hitIndex(slot.x, slot.y), index);
    (slot.row === 0 ? front : back).push(slot);
  }
  assert.equal(front[2].x, ARENA.width / 2);
  assert.equal(front[0].left, ARENA.sideMargin);
  assert.equal(ARENA.width - (front[4].left + front[4].width), ARENA.sideMargin);
  assert.equal(hitIndex(ARENA.sideMargin - 1, front[0].y), -1);
  assert.equal(hitIndex(front[4].left + front[4].width, front[4].y), -1);
  for (let col = 1; col < ARENA.cols; col += 1) {
    assert.equal(front[col].x - front[col - 1].x, ARENA.pitch);
    assert.ok(front[col].left >= front[col - 1].left + front[col - 1].width);
  }
  for (let col = 0; col < ARENA.cols; col += 1) {
    assert.equal(back[col].x, front[col].x);
    assert.ok(back[col].top >= front[col].top + front[col].height);
    assert.ok(back[col].top + back[col].height <= ARENA.height);
  }
});

function hitIndex(x, y) {
  for (let index = 0; index < ARENA.rows * ARENA.cols; index += 1) {
    const slot = slotGeometry(index);
    if (x >= slot.left && x < slot.left + slot.width && y >= slot.top && y < slot.top + slot.height) return index;
  }
  return -1;
}

function documentedRear(index) {
  const geometry = slotGeometry(index);
  assert.equal(geometry.row, 1, `slot ${index} is not on the rear row`);
  assert.equal(geometry.col, index - 5);
  assert.equal(geometry.y, ARENA.backY);
  assert.equal(geometry.x, ARENA.sideMargin + ARENA.slotWidth / 2 + ARENA.pitch * geometry.col);
  return geometry;
}

function plant(state, index) {
  const geometry = documentedRear(index);
  const slot = state.slots[index];
  assert.equal(slot.index, geometry.index);
  assert.equal(slot.row, geometry.row);
  assert.equal(slot.col, geometry.col);
  assert.equal(slot.x, geometry.x);
  assert.equal(slot.y, geometry.y);
  const unit = createUnit(state, BASIC, 1, 'tower');
  unit.cooldown = 0;
  slot.unit = unit;
  const stats = getUnitStats(unit, state);
  assert.equal(unit.type, BASIC);
  assert.equal(unit.kind, 'tower');
  assert.equal(unit.rank, 1);
  assert.ok(stats.range > 0, `${BASIC} range`);
  return {unit, slot, stats};
}

function hold(enemy) {
  enemy.speed = 0;
  enemy.driftAmp = 0;
  enemy.driftVelocity = 0;
  enemy.armor = 0;
  return enemy;
}

function fenceEnemy(state, slot) {
  const enemy = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: 0,
    hp: 1e6,
    maxHp: 1e6,
    speed: 0,
    armor: 0,
  });
  enemy.y = ARENA.fenceY - enemy.radius;
  enemy.x = slot.x;
  return hold(enemy);
}

function beyondEnemy(state, slot, range) {
  const y = slot.y - range - 32;
  const enemy = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y,
    hp: 1e6,
    maxHp: 1e6,
    speed: 0,
    armor: 0,
  });
  assert.equal(enemy.x, slot.x);
  assert.equal(enemy.y, y);
  return hold(enemy);
}

function acquiredBy(state, unitId) {
  const ids = new Set();
  for (const event of state.events) {
    if (event?.type === 'shot' && event.sourceId === unitId && event.targetId) ids.add(event.targetId);
  }
  for (const projectile of state.projectiles) {
    if (projectile?.sourceId === unitId && projectile.targetId) ids.add(projectile.targetId);
  }
  return ids;
}

test('a rear basic tower acquires an enemy on the fence inside its range', () => {
  for (const index of REAR_SLOTS) {
    const state = fresh(`fence-${index}`);
    const {unit, slot, stats} = plant(state, index);
    const enemy = fenceEnemy(state, slot);
    assert.equal(enemy.y, ARENA.fenceY - enemy.radius);
    const gap = distance(slot, enemy);
    assert.ok(
      stats.range >= gap,
      `rear ${BASIC} on slot ${index} cannot reach the fence: range ${stats.range}, distance ${gap}`,
    );
    updateCombat(state, STEP);
    const ids = acquiredBy(state, unit.id);
    assert.ok(
      ids.has(enemy.id),
      `rear ${BASIC} on slot ${index} did not acquire the fence enemy: range ${stats.range}, distance ${gap}`,
    );
  }
});

test('a rear basic tower does not acquire an enemy beyond its range', () => {
  for (const index of REAR_SLOTS) {
    const state = fresh(`beyond-${index}`);
    const {unit, slot, stats} = plant(state, index);
    const enemy = beyondEnemy(state, slot, stats.range);
    const gap = distance(slot, enemy);
    assert.ok(
      gap > stats.range,
      `enemy on slot ${index} is not beyond range: range ${stats.range}, distance ${gap}`,
    );
    updateCombat(state, STEP);
    const ids = acquiredBy(state, unit.id);
    assert.equal(
      ids.has(enemy.id),
      false,
      `rear ${BASIC} on slot ${index} acquired an enemy beyond range: range ${stats.range}, distance ${gap}`,
    );
    assert.equal(ids.size, 0);
  }
});
