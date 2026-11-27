// 20-stage campaign progression, stage wave rosters, unlocking, stars, and first-clear rewards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {createController} from '../src/boot.js';
import {
  CHAPTERS,
  EXPEDITIONS,
  STAGE_ORDER,
  STAGES,
  TOTAL_STAGES,
  highestClearedStage,
  highestUnlockedStage,
  isStageUnlocked,
  nextStageId,
  stageClearRecord,
  totalStarsEarned
} from '../src/data/expeditions.js';
import {WAVES, updateWaves} from '../src/systems/waves.js';
import {settleRun} from '../src/systems/progression.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

function seesKind(state, kind) {
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const queue = Array.isArray(state.director?.queue) ? state.director.queue : [];
  return enemies.some(enemy => enemy && enemy.kind === kind)
    || queue.some(item => item && item.kind === kind);
}

function schedule(expedition, time, runId) {
  const state = createRun({expedition, seed: 3, runId});
  state.time = time;
  updateWaves(state, 0);
  return state;
}

test('exactly 20 sequential campaign stages exist across 4 chapters with boss milestones on 5/10/15/20', () => {
  assert.equal(TOTAL_STAGES, 20);
  assert.equal(STAGE_ORDER.length, 20);
  assert.equal(CHAPTERS.length, 4);
  for (let n = 1; n <= 20; n += 1) {
    const id = `stage_${n}`;
    const s = STAGES[id];
    assert.ok(s, `stage ${id}`);
    assert.equal(s.stage, n);
    assert.equal(EXPEDITIONS[id], s);
    assert.ok(s.name.en.includes(`Stage ${n}`));
    assert.ok(s.name.zh.includes(`第 ${n} 关`));
    assert.ok(Array.isArray(s.phases) && s.phases.length >= 5);
    assert.ok(s.firstClearBonus >= 40);
    assert.equal(s.boss, n % 5 === 0);
  }
  assert.equal(nextStageId('stage_1'), 'stage_2');
  assert.equal(nextStageId('stage_19'), 'stage_20');
  assert.equal(nextStageId('stage_20'), null);
});

test('createRun preserves stage_1..stage_20 and each milestone stage spawns its signature enemies', () => {
  assert.equal(createRun({expedition: 'stage_1'}).expedition, 'stage_1');
  assert.equal(createRun({expedition: 'stage_20'}).expedition, 'stage_20');
  assert.equal(seesKind(schedule('stage_5', 160, 's5-boss'), 'boss'), true);
  assert.equal(seesKind(schedule('stage_6', 80, 's6-split'), 'splitter'), true);
  assert.equal(seesKind(schedule('stage_7', 40, 's7-leap'), 'leaper'), true);
  assert.equal(seesKind(schedule('stage_11', 80, 's11-banner'), 'banner'), true);
  assert.equal(seesKind(schedule('stage_12', 80, 's12-warden'), 'warden'), true);
  assert.equal(seesKind(schedule('stage_13', 80, 's13-charge'), 'charge'), true);
  assert.equal(seesKind(schedule('stage_14', 80, 's14-hush'), 'hush'), true);
  assert.equal(seesKind(schedule('stage_20', 160, 's20-boss'), 'boss'), true);
});

test('stage unlocking, 1-3 star mastery, and one-time first-clear bonus work sequentially', async () => {
  const profile = createProfile('zh');
  assert.equal(highestClearedStage(profile), 0);
  assert.equal(highestUnlockedStage(profile), 1);
  assert.equal(isStageUnlocked(profile, 'stage_1'), true);
  assert.equal(isStageUnlocked(profile, 'stage_2'), false);

  // Controller blocks locked Stage 2 before Stage 1 is cleared
  const api = await createController({storage: memoryStorage(), profile});
  assert.equal(api.act('start', {expedition: 'stage_2'}).reason, 'stageLocked');
  assert.equal(api.act('start', {expedition: 'stage_1'}).ok, true);

  // Clearing Stage 1 with full wall HP grants 3 stars + firstClearBonus (+40) and unlocks Stage 2
  const run1 = createRun({expedition: 'stage_1', runId: 'clear-s1-first', seed: 1, profile});
  run1.phase = 'victory';
  run1.time = 150;
  run1.kills = 120;
  run1.wave = 10;
  const s1 = settleRun(profile, run1);
  assert.equal(s1.stars, 3);
  assert.equal(s1.firstClearBonus, STAGES.stage_1.firstClearBonus);
  assert.equal(stageClearRecord(profile, 'stage_1').clears, 1);
  assert.equal(stageClearRecord(profile, 'stage_1').stars, 3);
  assert.equal(highestClearedStage(profile), 1);
  assert.equal(highestUnlockedStage(profile), 2);
  assert.equal(isStageUnlocked(profile, 'stage_2'), true);
  assert.equal(isStageUnlocked(profile, 'stage_3'), false);
  assert.equal(totalStarsEarned(profile), 3);

  // Re-clearing Stage 1 with damaged wall keeps best 3 stars and does NOT pay firstClearBonus again
  const run1Again = createRun({expedition: 'stage_1', runId: 'clear-s1-second', seed: 2, profile});
  run1Again.phase = 'victory';
  run1Again.time = 150;
  run1Again.kills = 120;
  run1Again.wave = 10;
  run1Again.fence.hp = run1Again.fence.maxHp * 0.6;
  const s1Again = settleRun(profile, run1Again);
  assert.equal(s1Again.stars, 2);
  assert.equal(s1Again.firstClearBonus, undefined);
  assert.equal(stageClearRecord(profile, 'stage_1').clears, 2);
  assert.equal(stageClearRecord(profile, 'stage_1').stars, 3);
});

test('endless keeps wardens and cinder charges in the rotation', () => {
  const state = createRun({expedition: 'stage_1', seed: 5, runId: 'endless-roles'});
  state.phase = 'playing';
  state.endless = true;
  state.director.nextWave = 100;
  state.director.queue = [];
  state.director.done = true;
  state.time = 20;
  let sawWarden = false;
  let sawCharge = false;
  let sawHush = false;
  for (let i = 0; i < 60 && !(sawWarden && sawCharge && sawHush); i += 1) {
    updateWaves(state, 0);
    sawWarden = sawWarden || seesKind(state, 'warden');
    sawCharge = sawCharge || seesKind(state, 'charge');
    sawHush = sawHush || seesKind(state, 'hush');
    state.time += 12;
  }
  assert.equal(sawWarden, true);
  assert.equal(sawCharge, true);
  assert.equal(sawHush, true);
  assert.ok(WAVES.length > 0);
});
