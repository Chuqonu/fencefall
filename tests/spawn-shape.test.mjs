// Spawn X from src/systems/movement.js stays in the arena, repeats from the seed,
// gathers at the center, and does not snap to the five slot columns.
import test, {describe} from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA, slotGeometry} from '../src/shared.js';
import {sampleSpawnX, spawnEnemy} from '../src/systems/movement.js';

const SPAWNS = 1600;
const COLUMN_X = Array.from({length: ARENA.cols}, (_, col) => slotGeometry(col).x);
const CENTER_X = (ARENA.enemyMinX + ARENA.enemyMaxX) / 2;

function fresh(seed) {
  return createRun({seed, runId: `spawn-shape-${seed}`});
}

function spawnXs(seed, count = SPAWNS) {
  const state = fresh(seed);
  const xs = [];
  for (let i = 0; i < count; i++) xs.push(spawnEnemy(state, 'shambler').x);
  return xs;
}

function sampleXs(seed, count = SPAWNS) {
  const state = fresh(seed);
  const xs = [];
  for (let i = 0; i < count; i++) xs.push(sampleSpawnX(state));
  return xs;
}

function layout(xs) {
  const lo = ARENA.enemyMinX;
  const hi = ARENA.enemyMaxX;
  const span = hi - lo;
  const third = span / 3;
  const band = span / 6;
  let leftThird = 0;
  let midThird = 0;
  let rightThird = 0;
  let leftEdge = 0;
  let center = 0;
  let rightEdge = 0;
  let sum = 0;
  for (const x of xs) {
    sum += x;
    if (x < lo + third) leftThird += 1;
    else if (x >= hi - third) rightThird += 1;
    else midThird += 1;
    if (x < lo + band) leftEdge += 1;
    if (x > hi - band) rightEdge += 1;
    if (x >= CENTER_X - band / 2 && x < CENTER_X + band / 2) center += 1;
  }
  return {leftThird, midThird, rightThird, leftEdge, center, rightEdge, mean: sum / xs.length};
}

function columnStats(xs) {
  const bins = new Map();
  let onColumn = 0;
  for (const x of xs) {
    const key = Math.round(x);
    bins.set(key, (bins.get(key) || 0) + 1);
    if (COLUMN_X.some(col => Math.abs(x - col) <= 1)) onColumn += 1;
  }
  const ranked = [...bins.values()].sort((a, b) => b - a);
  const top5 = ranked.slice(0, 5).reduce((sum, count) => sum + count, 0);
  return {distinct: bins.size, onColumn, top5};
}

function assertInside(xs, label) {
  assert.ok(xs.length >= 1000, `${label} count ${xs.length}`);
  for (const x of xs) {
    assert.equal(typeof x, 'number', label);
    assert.ok(Number.isFinite(x), `${label} ${x}`);
    assert.ok(x >= ARENA.enemyMinX && x <= ARENA.enemyMaxX, `${label} x ${x}`);
  }
}

function assertCenterWeighted(xs, label) {
  const bands = layout(xs);
  assert.ok(Math.abs(bands.mean - CENTER_X) <= 15, `${label} mean ${bands.mean}`);
  assert.ok(bands.midThird > bands.leftThird, `${label} center third ${bands.midThird} vs left ${bands.leftThird}`);
  assert.ok(bands.midThird > bands.rightThird, `${label} center third ${bands.midThird} vs right ${bands.rightThird}`);
  assert.ok(bands.midThird > xs.length * 0.45, `${label} center share ${bands.midThird}/${xs.length}`);
  assert.ok(bands.leftThird < xs.length * 0.32, `${label} left share ${bands.leftThird}/${xs.length}`);
  assert.ok(bands.rightThird < xs.length * 0.32, `${label} right share ${bands.rightThird}/${xs.length}`);
  assert.ok(bands.center > bands.leftEdge * 2, `${label} center window ${bands.center} vs left edge ${bands.leftEdge}`);
  assert.ok(bands.center > bands.rightEdge * 2, `${label} center window ${bands.center} vs right edge ${bands.rightEdge}`);
}

function assertNotColumns(xs, label) {
  assert.equal(COLUMN_X.length, 5);
  const stats = columnStats(xs);
  assert.ok(stats.distinct > 12, `${label} distinct x ${stats.distinct}`);
  assert.ok(stats.onColumn / xs.length < 0.15, `${label} column share ${stats.onColumn}/${xs.length}`);
  assert.ok(stats.top5 / xs.length < 0.35, `${label} top five bins ${stats.top5}/${xs.length}`);
  assert.ok(xs.some(x => COLUMN_X.every(col => Math.abs(x - col) > 1)), `${label} has a position off the slot columns`);
}

describe('spawn shape', {concurrency: 1}, () => {
  test('many spawns stay inside the arena', () => {
    const state = fresh(20261114);
    const spawned = [];
    for (let i = 0; i < SPAWNS; i++) {
      const enemy = spawnEnemy(state, 'shambler');
      assert.equal(enemy, state.enemies.at(-1));
      assert.ok(Number.isFinite(enemy.y), `spawn y ${enemy.y}`);
      assert.ok(Math.abs(enemy.y - ARENA.spawnY) <= 1e-6, `spawn y ${enemy.y}`);
      spawned.push(enemy.x);
    }
    assertInside(spawned, 'spawnEnemy');
    assert.equal(state.enemies.length, SPAWNS);
    assertInside(sampleXs(20261114), 'sampleSpawnX');
  });

  test('spawns are reproducible from the seed', () => {
    const spawnedA = spawnXs(77);
    const spawnedB = spawnXs(77);
    const spawnedC = spawnXs(78);
    assert.deepEqual(spawnedA, spawnedB);
    assert.notDeepEqual(spawnedA, spawnedC);

    const sampledA = sampleXs(77);
    const sampledB = sampleXs(77);
    const sampledC = sampleXs(91);
    assert.deepEqual(sampledA, sampledB);
    assert.notDeepEqual(sampledA, sampledC);
    assert.ok(new Set(spawnedA.map(x => Math.round(x * 10) / 10)).size > 8);
  });

  test('spawns are denser near the center than at either edge', () => {
    assertCenterWeighted(spawnXs(1234), 'spawnEnemy');
    assertCenterWeighted(sampleXs(1234), 'sampleSpawnX');
  });

  test('spawns do not form five fixed columns', () => {
    assertNotColumns(spawnXs(99), 'spawnEnemy');
    assertNotColumns(sampleXs(99), 'sampleSpawnX');
  });
});
