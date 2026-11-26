// After several movement updates, enemy x stays inside the spawn interval
// [enemyMinX, enemyMaxX] and does not snap onto the five slot columns.
import test, {describe} from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA, STEP, slotGeometry} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy, updateMovement} from '../src/systems/movement.js';

const COLUMN_X = Array.from({length: ARENA.cols}, (_, col) => slotGeometry(col).x);
const KINDS = Object.keys(ENEMIES);
const SEVERAL = 8;
const MARCH = 180;

function fresh(seed) {
  return createRun({seed, difficulty: 'normal', runId: `drift-bound-${seed}`});
}

function assertInside(x, label) {
  assert.equal(typeof x, 'number', label);
  assert.ok(Number.isFinite(x), `${label} ${x}`);
  assert.ok(
    x >= ARENA.enemyMinX - 1e-6 && x <= ARENA.enemyMaxX + 1e-6,
    `${label} x ${x} left [${ARENA.enemyMinX}, ${ARENA.enemyMaxX}]`,
  );
}

function onColumn(x, slack = 1) {
  return COLUMN_X.some(col => Math.abs(x - col) <= slack);
}

function columnDistance(x) {
  let best = Infinity;
  for (const col of COLUMN_X) best = Math.min(best, Math.abs(x - col));
  return best;
}

function place(state, kind, x, y = 24) {
  const enemy = spawnEnemy(state, kind, {x, y, speed: 22});
  assert.equal(enemy, state.enemies.at(-1));
  assertInside(enemy.x, `spawn ${kind}`);
  return enemy;
}

describe('drift stays inside the arena', {concurrency: 1}, () => {
  test('enemy x stays inside the spawn bounds after several movement updates', () => {
    assert.equal(COLUMN_X.length, 5);
    assert.deepEqual(COLUMN_X, [84, 132, 180, 228, 276]);
    assert.ok(ARENA.enemyMinX < COLUMN_X[0]);
    assert.ok(ARENA.enemyMaxX > COLUMN_X[4]);

    const state = fresh(20261114);
    const pinned = [
      ARENA.enemyMinX,
      ARENA.enemyMinX + 0.25,
      ARENA.enemyMaxX,
      ARENA.enemyMaxX - 0.25,
      72,
      144,
      200,
      288,
      ...COLUMN_X,
    ];
    const enemies = pinned.map((x, index) => place(state, KINDS[index % KINDS.length], x));
    for (let i = 0; i < 24; i += 1) {
      const enemy = spawnEnemy(state, KINDS[i % KINDS.length], {y: 24, speed: 22});
      assertInside(enemy.x, `natural ${enemy.kind}`);
      enemies.push(enemy);
    }

    const originY = enemies.map(enemy => enemy.y);
    const previous = enemies.map(enemy => enemy.x);
    let maxStep = 0;
    for (let step = 0; step < MARCH; step += 1) {
      updateMovement(state, STEP);
      for (let i = 0; i < enemies.length; i += 1) {
        const enemy = enemies[i];
        assertInside(enemy.x, `${enemy.kind} step ${step}`);
        maxStep = Math.max(maxStep, Math.abs(enemy.x - previous[i]));
        previous[i] = enemy.x;
        assert.equal(enemy.attacking, false, `${enemy.kind} reached the fence during the drift watch`);
        assert.ok(enemy.y < ARENA.fenceY - enemy.radius - 20, `${enemy.kind} y ${enemy.y}`);
      }
    }

    for (let i = 0; i < enemies.length; i += 1) {
      assert.ok(enemies[i].y > originY[i] + 10, `${enemies[i].kind} did not advance`);
    }
    assert.ok(maxStep < 2, `lateral step ${maxStep}px`);

    const stressed = fresh(8);
    const probe = [
      spawnEnemy(stressed, 'shambler', {
        x: ARENA.enemyMinX, y: 40, speed: 20, driftAmp: 500, driftFreq: 2, driftPhase: 1.2,
      }),
      spawnEnemy(stressed, 'brute', {
        x: ARENA.enemyMaxX, y: 40, speed: 20, driftAmp: 500, driftFreq: 2, driftPhase: 0.4,
      }),
      spawnEnemy(stressed, 'runner', {
        x: ARENA.enemyMinX + 6, y: 40, speed: 20, driftAmp: 80, driftFreq: 1.5, driftPhase: 0,
      }),
      spawnEnemy(stressed, 'boss', {
        x: ARENA.enemyMaxX - 6, y: 40, speed: 20, driftAmp: 80, driftFreq: 1.5, driftPhase: Math.PI,
      }),
      spawnEnemy(stressed, 'armored', {
        x: 180, y: 40, speed: 20, driftAmp: 400, driftFreq: 2, driftPhase: 0.2,
      }),
    ];
    for (const enemy of probe) assertInside(enemy.x, `stress spawn ${enemy.kind}`);
    const probeX = probe.map(enemy => enemy.x);
    const dts = [STEP, STEP * 3, 0.05, 0.1];
    for (let n = 0; n < SEVERAL; n += 1) {
      for (const dt of dts) {
        updateMovement(stressed, dt);
        for (const enemy of probe) {
          assertInside(enemy.x, `${enemy.kind} dt ${dt}`);
          assert.ok(enemy.y < ARENA.fenceY - enemy.radius, `${enemy.kind} left the approach`);
        }
      }
    }
    assert.ok(Math.abs(probe[4].x - probeX[4]) > 2, `centered drift froze at ${probe[4].x}`);
    assert.ok(probe.every(enemy => enemy.y > 40), 'stressed enemies did not move');
  });

  test('movement does not snap enemy x onto the five slot columns', () => {
    assert.equal(new Set(COLUMN_X).size, 5);
    const pitch = COLUMN_X[1] - COLUMN_X[0];
    for (let i = 1; i < COLUMN_X.length; i += 1) {
      assert.equal(COLUMN_X[i] - COLUMN_X[i - 1], pitch);
    }

    for (const seed of [99, 20261114]) {
      const state = fresh(seed);
      const gaps = [];
      for (let i = 0; i < COLUMN_X.length - 1; i += 1) gaps.push((COLUMN_X[i] + COLUMN_X[i + 1]) / 2);
      gaps.push(40, 100, 160, 210, 250, 300, 330);
      const gapEnemies = gaps.map((x, index) => place(state, KINDS[index % KINDS.length], x, 30));
      const midGaps = gapEnemies.filter(enemy => columnDistance(enemy.x) + 1e-6 >= pitch / 2);
      const columnEnemies = COLUMN_X.map((x, index) => place(state, KINDS[index % KINDS.length], x, 30));
      const edges = [
        place(state, 'swarm', ARENA.enemyMinX, 30),
        place(state, 'spitter', ARENA.enemyMaxX, 30),
      ];
      const natural = [];
      for (let i = 0; i < 30; i += 1) {
        const enemy = spawnEnemy(state, KINDS[i % KINDS.length], {y: 30, speed: 22});
        assertInside(enemy.x, `natural ${seed}`);
        natural.push(enemy);
      }
      const watched = [...gapEnemies, ...columnEnemies, ...edges, ...natural];
      const previous = new Map(watched.map(enemy => [enemy, enemy.x]));
      const peakOffColumn = columnEnemies.map(() => 0);
      const samples = [];
      let maxStep = 0;

      for (let step = 0; step < MARCH; step += 1) {
        updateMovement(state, STEP);
        for (const enemy of watched) {
          assertInside(enemy.x, `seed ${seed} ${enemy.kind} step ${step}`);
          maxStep = Math.max(maxStep, Math.abs(enemy.x - previous.get(enemy)));
          previous.set(enemy, enemy.x);
          samples.push(enemy.x);
        }
        columnEnemies.forEach((enemy, index) => {
          peakOffColumn[index] = Math.max(peakOffColumn[index], columnDistance(enemy.x));
        });
        if (step + 1 === SEVERAL) {
          assert.ok(midGaps.length >= 4, `seed ${seed} mid-gap count ${midGaps.length}`);
          for (const enemy of midGaps) {
            assert.ok(columnDistance(enemy.x) > pitch / 2 - 8, `seed ${seed} mid-gap snapped to ${enemy.x}`);
          }
          for (const enemy of gapEnemies) {
            assert.equal(onColumn(enemy.x), false, `seed ${seed} gap snapped to ${enemy.x}`);
          }
          for (const enemy of edges) {
            assert.ok(columnDistance(enemy.x) > 8, `seed ${seed} edge snapped to ${enemy.x}`);
          }
        }
      }

      assert.ok(maxStep < 2, `seed ${seed} lateral step ${maxStep}px`);
      assert.ok(samples.length > 1000, `seed ${seed} samples ${samples.length}`);

      const on = samples.filter(x => onColumn(x)).length;
      assert.ok(on / samples.length < 0.25, `seed ${seed} column share ${on}/${samples.length}`);

      const rounded = new Set(samples.map(x => Math.round(x)));
      assert.ok(rounded.size > 12, `seed ${seed} distinct x ${rounded.size}`);

      const finals = new Set(watched.map(enemy => Math.round(enemy.x)));
      assert.ok(finals.size > 5, `seed ${seed} finals collapsed to ${[...finals].join(',')}`);
      assert.ok(
        watched.some(enemy => columnDistance(enemy.x) > 1),
        `seed ${seed} every enemy finished on a slot column`,
      );

      const drifted = peakOffColumn.filter(distance => distance > 2).length;
      assert.equal(drifted, columnEnemies.length, `seed ${seed} only ${drifted} column enemies left their slot`);

      for (const enemy of edges) {
        assert.ok(columnDistance(enemy.x) > 8, `seed ${seed} edge finished on a column at ${enemy.x}`);
        assertInside(enemy.x, `seed ${seed} edge`);
      }
    }
  });
});
