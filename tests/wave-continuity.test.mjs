import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, simulate, takeEvents } from '../src/engine.js';
import { chooseDraft } from '../src/systems/drafts.js';
import { getHeroStats, isAutoSkill } from '../src/systems/hero.js';
import { updateWaves, getWaveInfo } from '../src/systems/waves.js';

test('stage_1 waves overlap continuously with dramatic early-to-late escalation over ~49 waves', () => {
  const state = createRun({ expedition: 'stage_1', seed: 101, difficulty: 'normal', runId: 'continuity-s1' });
  let maxEmptyRun = 0;
  let emptyRun = 0;
  let sawOverlapAtWave2 = false;
  let prevWave = 0;
  let earlySnap = null;
  let lateSnap = null;

  const prio = ['volley', 'cadence', 'napalm', 'cryo_barrage', 'split_shot', 'armored_car', 'orbital_beam', 'ricochet', 'strike', 'focus', 'overclock'];
  for (let stepIdx = 0; stepIdx < 5000 && state.phase !== 'victory' && state.phase !== 'defeat'; stepIdx++) {
    if (state.phase === 'draft') {
      const opts = state.draft.options;
      let pick = 0;
      let best = 999;
      opts.forEach((o, idx) => {
        const p = prio.indexOf(o.upgradeId);
        if (p >= 0 && p < best) { best = p; pick = idx; }
      });
      chooseDraft(state, pick);
    }
    simulate(state, 0.1);
    takeEvents(state);
    const living = state.enemies.filter((e) => !e.dead && e.hp > 0);
    if (state.wave === 2 && prevWave === 1 && living.length > 0) {
      sawOverlapAtWave2 = true;
    }
    prevWave = state.wave;
    if (state.time >= 1.0 && state.phase === 'playing' && !state.director.done) {
      if (living.length === 0) {
        emptyRun += 0.1;
        if (emptyRun > maxEmptyRun) maxEmptyRun = emptyRun;
      } else {
        emptyRun = 0;
      }
    }
    if (!earlySnap && state.time >= 3.5 && living.length > 0) {
      const st = getHeroStats(state.slots[2].unit, state);
      earlySnap = {
        avgHp: living.reduce((a, e) => a + e.maxHp, 0) / living.length,
        avgSpeed: living.reduce((a, e) => a + e.speed, 0) / living.length,
        bulletsPerSec: (1 + (st.multishot || 0)) / st.interval,
      };
    }
    if (!lateSnap && state.wave >= 44 && living.length > 0) {
      const hero = state.slots[2].unit;
      const st = getHeroStats(hero, state);
      const skills = Object.entries(hero.upgrades || {}).filter(([k, v]) => isAutoSkill(k) && v > 0).length;
      lateSnap = {
        avgHp: living.reduce((a, e) => a + e.maxHp, 0) / living.length,
        avgSpeed: living.reduce((a, e) => a + e.speed, 0) / living.length,
        bulletsPerSec: (1 + (st.multishot || 0)) / st.interval,
        skills,
      };
    }
  }

  assert.equal(state.phase, 'victory', 'Stage 1 should clear cleanly');
  assert.equal(sawOverlapAtWave2, true, 'Wave 2 must start spawning while Wave 1 zombies are still alive on the field');
  assert.ok(state.wave >= 48, `Expected ~30% expanded wave count (>=48), got ${state.wave}`);
  assert.ok(maxEmptyRun <= 0.6, `Expected near-zero dead gaps between waves, saw ${maxEmptyRun.toFixed(2)}s empty road`);
  assert.ok(earlySnap && lateSnap, 'Both early and late snapshots captured');
  assert.ok(lateSnap.avgHp >= earlySnap.avgHp * 8, `Late zombie HP should scale dramatically (${earlySnap.avgHp.toFixed(1)} -> ${lateSnap.avgHp.toFixed(1)})`);
  assert.ok(lateSnap.avgSpeed > earlySnap.avgSpeed * 1.25, `Late zombie tempo should accelerate (${earlySnap.avgSpeed.toFixed(1)} -> ${lateSnap.avgSpeed.toFixed(1)})`);
  assert.ok(lateSnap.bulletsPerSec >= earlySnap.bulletsPerSec * 5, `Late gunfire should explode vs slow opening (${earlySnap.bulletsPerSec.toFixed(2)} -> ${lateSnap.bulletsPerSec.toFixed(2)}/s)`);
  assert.ok(lateSnap.skills >= 4, `Late build unlocks multiple Auto Skills (${lateSnap.skills})`);
});

test('early wave pull-in immediately spawns the next wave when the player shreds the current wave fast', () => {
  const state = createRun({ expedition: 'stage_1', seed: 202, difficulty: 'normal', runId: 'early-pull' });
  // Advance past Wave 1 start (0.5s) and Wave 2 start (6.0s)
  state.nextDraftXp = 1e9;
  simulate(state, 6.5);
  assert.equal(state.wave, 2);

  // Simulate high-DPS player clearing almost all Wave 2 zombies and draining queue to 1
  const living = state.enemies.filter((e) => !e.dead);
  for (let i = 2; i < living.length; i++) {
    living[i].dead = true;
    living[i].hp = 0;
  }
  state.director.queue = state.director.queue.slice(0, 1);

  // Advance past EARLY_PULL_MIN_AGE (2.2s after wave 2 started at 6.0s -> t = 8.5s, well before scheduled 14.0s!)
  state.time = 8.5;
  updateWaves(state, 0);

  assert.equal(state.wave, 3, 'Wave 3 should be pulled in early at t=8.5s while Wave 2 still has living zombies');
  assert.ok(state.systems.waves.timeShift > 4, `Expected positive timeShift, got ${state.systems.waves.timeShift}`);
  const info = getWaveInfo(state);
  assert.ok(info.living >= 2, 'Previous wave zombies and newly spawned Wave 3 zombies coexist on screen');
  assert.ok(info.nextIn > 0 && info.nextIn <= 8.5, `Subsequent wave cadence stays smooth: nextIn=${info.nextIn}`);
});

test('early wave pull-in keeps a brief boss approach lead before pulling a boss wave', () => {
  const state = createRun({ expedition: 'stage_5', seed: 303, difficulty: 'normal', runId: 'early-boss-lead' });
  state.nextDraftXp = 1e9;
  // Jump to wave right before the vanguard boss at 154s
  state.time = 150.5;
  updateWaves(state, 0);
  const bossWaveBefore = state.wave;
  state.enemies = [];
  state.director.queue = [];
  // Set waveStartedAt to 146 and time to 148.5 -> wait to 154 is 5.5s
  state.systems.waves.waveStartedAt = 146;
  state.time = 148.5;
  updateWaves(state, 0);
  const info = getWaveInfo(state);
  assert.equal(state.wave, bossWaveBefore, 'Boss wave should not insta-spawn without warning lead');
  assert.ok(info.nextIn > 1.0 && info.nextIn <= 1.6, `Boss wave pulled to crisp ~1.5s warning lead, got ${info.nextIn}`);
});
