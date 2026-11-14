import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createRun, setSpeed} from '../src/engine.js';
import {STEP} from '../src/shared.js';

const FRAME = 1 / 60;
const WALL_CAP = 0.25;
const GAP = 8;
const SEED = 16016;

function fresh(id, speed) {
  const state = createRun({seed: SEED, runId: id, difficulty: 'normal'});
  setSpeed(state, speed);
  return state;
}

// Sim time one huge advance can add: the partial bank, plus one wall-capped slice.
function simAdded(speed) {
  return (STEP * 0.6 + Math.min(GAP, WALL_CAP)) * speed;
}

function withoutSpeed(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.runId;
  delete copy.speed;
  return copy;
}

test('advancing with a large gap, then pausing, does not apply that gap after resume', () => {
  for (const flag of ['paused', 'hiddenPaused']) {
    for (const speed of [1, 3]) {
      const subject = fresh(`${flag}-${speed}`, speed);
      advance(subject, STEP * 0.6);
      assert.equal(subject.phase, 'playing');
      assert.ok(subject.accumulator > 0, `${flag} ${speed}x banked a partial step`);

      advance(subject, GAP);
      const added = simAdded(speed);
      const tickAfterGap = Math.floor(added / STEP + 1e-10);
      assert.equal(subject.tick, tickAfterGap, `${flag} ${speed}x applied only the capped slice`);
      assert.ok(subject.tick < GAP * speed * 60, `${flag} ${speed}x ran the whole gap`);
      assert.ok(subject.accumulator > 0 && subject.accumulator < STEP, `${flag} ${speed}x left a bank`);
      assert.ok(Math.abs(subject.time - tickAfterGap * STEP) < 1e-9);

      const timeAfterGap = subject.time;
      const waveTime = subject.waveTime;
      const kills = subject.kills;
      const xp = subject.xp;
      const rng = subject.rng;
      const fenceHp = subject.fence.hp;
      const enemies = subject.enemies.length;

      subject[flag] = true;
      advance(subject, GAP);
      assert.equal(subject[flag], true);
      assert.equal(subject.tick, tickAfterGap);
      assert.equal(subject.time, timeAfterGap);
      assert.equal(subject.waveTime, waveTime);
      assert.equal(subject.kills, kills);
      assert.equal(subject.xp, xp);
      assert.equal(subject.rng, rng);
      assert.equal(subject.fence.hp, fenceHp);
      assert.equal(subject.enemies.length, enemies);
      assert.equal(subject.accumulator, 0, `${flag} kept the banked gap`);

      subject[flag] = false;
      advance(subject, FRAME);
      assert.equal(subject.tick, tickAfterGap + speed, `${flag} ${speed}x resumed with the old bank`);
      assert.equal(subject.accumulator, 0, `${flag} ${speed}x resumed with a leftover bank`);

      const control = fresh(`${flag}-${speed}-control`, speed);
      advance(control, FRAME);
      for (let index = 0; index < 45; index += 1) {
        advance(subject, FRAME);
        advance(control, FRAME);
      }
      assert.equal(subject.phase, 'playing');
      assert.equal(control.phase, 'playing');
      assert.equal(subject.tick - control.tick, tickAfterGap);
      assert.ok(Math.abs((subject.time - control.time) - timeAfterGap) < 1e-8);
      assert.ok(subject.tick < speed * 60 * 2, `${flag} ${speed}x caught up the ${GAP}s gap after resume`);
    }
  }
});

test('1x and 3x spend the same fixed steps for the same simulation time', () => {
  const simSeconds = 4;
  function run(speed) {
    const state = fresh(`steps-${speed}`, speed);
    const frames = Math.round(simSeconds / speed / FRAME);
    for (let index = 0; index < frames; index += 1) advance(state, FRAME);
    return state;
  }

  const one = run(1);
  const triple = run(3);
  assert.equal(one.speed, 1);
  assert.equal(triple.speed, 3);
  assert.equal(one.phase, 'playing');
  assert.equal(triple.phase, 'playing');
  assert.equal(one.tick, triple.tick);
  assert.equal(one.tick, simSeconds * 60);
  assert.equal(one.accumulator, 0);
  assert.equal(triple.accumulator, 0);
  assert.ok(Math.abs(one.time - triple.time) < 1e-9);
  assert.ok(Math.abs(one.time - simSeconds) < 1e-6);
  assert.deepEqual(withoutSpeed(one), withoutSpeed(triple));
});
