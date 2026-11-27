import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, simulate, takeEvents } from '../src/engine.js';
import { chooseDraft } from '../src/systems/drafts.js';
import { updateWaves, getWaveInfo } from '../src/systems/waves.js';

test('stage_1 waves overlap continuously with zero dead road intervals during live combat', () => {
  const state = createRun({ expedition: 'stage_1', seed: 101, difficulty: 'normal', runId: 'continuity-s1' });
  let maxEmptyRun = 0;
  let emptyRun = 0;
  let sawOverlapAtWave2 = false;
  let prevWave = 0;

  // Simulate 90 seconds of live combat, picking the first draft card whenever level-up triggers
  for (let stepIdx = 0; stepIdx < 900 && state.phase !== 'victory' && state.phase !== 'defeat'; stepIdx++) {
    if (state.phase === 'draft') {
      chooseDraft(state, 0);
    }
    simulate(state, 0.1);
    takeEvents(state);
    const living = state.enemies.filter((e) => !e.dead && e.hp > 0).length;
    if (state.wave === 2 && prevWave === 1 && living > 0) {
      sawOverlapAtWave2 = true;
    }
    prevWave = state.wave;
    if (state.time >= 1.0 && state.phase === 'playing') {
      if (living === 0) {
        emptyRun += 0.1;
        if (emptyRun > maxEmptyRun) maxEmptyRun = emptyRun;
      } else {
        emptyRun = 0;
      }
    }
  }

  assert.equal(sawOverlapAtWave2, true, 'Wave 2 must start spawning while Wave 1 zombies are still alive on the field');
  assert.ok(maxEmptyRun <= 0.3, `Expected zero dead gaps between waves, saw ${maxEmptyRun.toFixed(2)}s empty road`);
  assert.ok(state.wave >= 8, `Expected steady continuous waves, reached wave ${state.wave}`);
  assert.notEqual(state.phase, 'defeat', 'Stage 1 should remain fair and survivable with continuous overlapping flow');
});

test('early wave pull-in immediately spawns the next wave when the player shreds the current wave fast', () => {
  const state = createRun({ expedition: 'stage_1', seed: 202, difficulty: 'normal', runId: 'early-pull' });
  // Advance past Wave 1 start (0.5s) and Wave 2 start (4.0s)
  state.nextDraftXp = 1e9;
  simulate(state, 4.5);
  assert.equal(state.wave, 2);

  // Simulate high-DPS player clearing almost all Wave 2 zombies and draining queue to 1
  const living = state.enemies.filter((e) => !e.dead);
  for (let i = 2; i < living.length; i++) {
    living[i].dead = true;
    living[i].hp = 0;
  }
  state.director.queue = state.director.queue.slice(0, 1);

  // Advance past EARLY_PULL_MIN_AGE (2.2s after wave 2 started at 4.0s -> t = 6.5s, well before scheduled 12.0s!)
  state.time = 6.5;
  updateWaves(state, 0);

  assert.equal(state.wave, 3, 'Wave 3 should be pulled in early at t=6.5s while Wave 2 still has living zombies');
  assert.ok(state.systems.waves.timeShift > 4, `Expected positive timeShift, got ${state.systems.waves.timeShift}`);
  const info = getWaveInfo(state);
  assert.ok(info.living >= 2, 'Previous wave zombies and newly spawned Wave 3 zombies coexist on screen');
  assert.ok(info.nextIn > 0 && info.nextIn <= 8.5, `Subsequent wave cadence stays smooth: nextIn=${info.nextIn}`);
});

test('early wave pull-in keeps a brief boss approach lead before pulling a boss wave', () => {
  const state = createRun({ expedition: 'stage_5', seed: 303, difficulty: 'normal', runId: 'early-boss-lead' });
  state.nextDraftXp = 1e9;
  // Jump to wave right before the vanguard boss at 152s
  state.time = 148.5;
  updateWaves(state, 0);
  const bossWaveBefore = state.wave;
  // Wipe all living enemies and queue except 1
  state.enemies = [];
  state.director.queue = [];
  // Move to 150.8s (2.3s after wave start) — boss was at 152s, wait is 1.2s (already <= 1.8s)
  // Test earlier when wait > 1.8s: set waveStartedAt to 144 and time to 146.5 -> wait to 152 is 5.5s
  state.systems.waves.waveStartedAt = 144;
  state.time = 146.5;
  updateWaves(state, 0);
  const info = getWaveInfo(state);
  assert.equal(state.wave, bossWaveBefore, 'Boss wave should not insta-spawn without warning lead');
  assert.ok(info.nextIn > 1.0 && info.nextIn <= 1.6, `Boss wave pulled to crisp ~1.5s warning lead, got ${info.nextIn}`);
});
