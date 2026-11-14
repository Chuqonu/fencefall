// Starting fence max HP is the documented absolute value for each difficulty.
// Harder difficulties must not open with more fence HP than easy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DIFFICULTIES} from '../src/shared.js';
import {createProfile, createRun, prepare} from '../src/engine.js';

// Absolute fence HP from docs/CONTRACT_REVIEW.md and DIFFICULTIES.fence.
const DOCUMENTED_FENCE_MAX_HP = Object.freeze({
  easy: 650,
  normal: 600,
  hard: 570,
  nightmare: 540
});

const ORDER = ['easy', 'normal', 'hard', 'nightmare'];

function startRun(difficulty, seed) {
  const state = createRun({
    seed,
    difficulty,
    profile: createProfile(),
    runId: `difficulty-hp-${difficulty}-${seed}`
  });
  assert.equal(state.fence.maxHp, DOCUMENTED_FENCE_MAX_HP[difficulty], `${difficulty} before prepare`);
  assert.equal(state.fence.hp, DOCUMENTED_FENCE_MAX_HP[difficulty], `${difficulty} hp before prepare`);
  prepare(state);
  return state;
}

test('documented difficulties use distinct absolute fence max HP', () => {
  for (const id of ORDER) {
    assert.equal(DIFFICULTIES[id].fence, DOCUMENTED_FENCE_MAX_HP[id], `${id} fence`);
  }
  assert.equal(new Set(ORDER.map(id => DIFFICULTIES[id].fence)).size, ORDER.length);
  for (const id of ['normal', 'hard', 'nightmare']) {
    assert.ok(DIFFICULTIES[id].fence <= DIFFICULTIES.easy.fence, `${id} documents more fence HP than easy`);
  }
});

test('easy, normal, hard, and nightmare start at the documented fence max HP', () => {
  for (const seed of [1, 17, 650]) {
    const started = {};
    for (const id of ORDER) {
      const state = startRun(id, seed);
      started[id] = state;
      assert.equal(state.difficulty, id, `${id} seed ${seed}`);
      assert.equal(state.phase, 'playing', `${id} seed ${seed}`);
      assert.equal(state.fence.maxHp, DOCUMENTED_FENCE_MAX_HP[id], `${id} maxHp seed ${seed}`);
      assert.equal(state.fence.hp, DOCUMENTED_FENCE_MAX_HP[id], `${id} hp seed ${seed}`);
      assert.equal(state.fence.hp, state.fence.maxHp, `${id} starts at full fence`);
    }
    const easyMax = started.easy.fence.maxHp;
    const easyHp = started.easy.fence.hp;
    for (const id of ['normal', 'hard', 'nightmare']) {
      assert.ok(
        started[id].fence.maxHp <= easyMax,
        `${id} fence max HP ${started[id].fence.maxHp} is above easy ${easyMax}`
      );
      assert.ok(
        started[id].fence.hp <= easyHp,
        `${id} starting fence HP ${started[id].fence.hp} is above easy ${easyHp}`
      );
    }
    assert.ok(started.normal.fence.maxHp < started.easy.fence.maxHp);
    assert.ok(started.hard.fence.maxHp < started.normal.fence.maxHp);
    assert.ok(started.nightmare.fence.maxHp < started.hard.fence.maxHp);
  }
});
