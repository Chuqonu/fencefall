// Boss summons belong to updateWaves. A living boss reads ENEMIES[kind].summon
// and adds that kind on the summon interval. Those bodies are not campaign
// spawns: while a scheduled spawn is still waiting, they must not set
// director.done.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {DIFFICULTIES, STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {updateWaves, WAVES} from '../src/systems/waves.js';

const HOLD = Object.freeze({time: 1e9, kind: 'shambler'});
const summon = ENEMIES.boss?.summon;

function batchSize(spec, difficulty) {
  const row = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const multiplier = Number(row?.count);
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const base = Math.max(0, Math.floor(Number(spec?.count) || 0));
  if (!base) return 0;
  const rolled = Math.floor(base * mult + 1e-9);
  const cap = Number.isFinite(Number(spec?.maxLiving)) ? Number(spec.maxLiving) : Infinity;
  return Math.min(rolled, Math.max(0, cap));
}

function holdCampaign(state) {
  state.endless = false;
  state.phase = 'playing';
  state.paused = false;
  state.hiddenPaused = false;
  state.director.nextWave = WAVES.length;
  state.director.queue = [{...HOLD}];
  state.director.done = false;
}

function queueBoss(state, hp, maxHp) {
  state.director.queue.unshift({
    time: 0,
    kind: 'boss',
    overrides: {x: 180, y: 120, hp, maxHp},
  });
}

function living(state, kind) {
  return (state.enemies || []).filter(enemy => enemy && enemy.dead !== true && enemy.hp > 0 && (!kind || enemy.kind === kind));
}

function campaignStillWaiting(state) {
  return (state.director.queue || []).some(item => item && item.kind === HOLD.kind && item.time > state.time);
}

test('a living boss adds the summoned kind from its data without setting director.done', () => {
  assert.ok(summon && typeof summon.kind === 'string', 'boss summon data is missing');
  assert.ok(ENEMIES[summon.kind], `summoned kind ${summon.kind} is not in ENEMIES`);
  const interval = Number(summon.interval);
  assert.ok(Number.isFinite(interval) && interval > 0, 'boss summon interval is missing');
  const expected = batchSize(summon, 'normal');
  assert.ok(expected >= 1, `boss summon count does not add a ${summon.kind}`);

  const state = createRun({seed: 515, difficulty: 'normal', runId: 'boss-summon-live'});
  holdCampaign(state);
  queueBoss(state, 4000, 4000);

  updateWaves(state, STEP);
  const boss = living(state, 'boss')[0];
  assert.ok(boss, 'living boss was not placed');
  assert.equal(living(state, summon.kind).length, 0, `summoned kind ${summon.kind} appeared before the interval`);
  assert.equal(state.director.done, false, 'director was already done before the summon');
  assert.equal(campaignStillWaiting(state), true, 'campaign hold was consumed before the summon');

  const seen = new Set(state.enemies.map(enemy => enemy.id));
  state.time = interval;
  updateWaves(state, STEP);
  updateWaves(state, STEP);

  const added = state.enemies.filter(enemy => !seen.has(enemy.id));
  assert.equal(added.length, expected, `living boss added ${added.length} bodies, summon count is ${expected}`);
  for (const enemy of added) {
    assert.equal(enemy.kind, summon.kind, `summoned body kind ${enemy.kind}`);
    assert.equal(enemy.dead, false, 'summoned body was marked dead');
    assert.ok(enemy.hp > 0, 'summoned body was not living');
  }
  assert.ok(living(state, 'boss').some(enemy => enemy.id === boss.id), 'boss died while calling');
  assert.equal(state.director.done, false, 'boss summons set director.done');
  assert.equal(campaignStillWaiting(state), true, 'boss summons consumed the unfinished campaign spawn');
});

test('a dead boss does not add the summoned kind or set director.done', () => {
  assert.ok(summon && typeof summon.kind === 'string' && ENEMIES[summon.kind], 'boss summon data is missing');
  const interval = Number(summon.interval);
  assert.ok(Number.isFinite(interval) && interval > 0, 'boss summon interval is missing');

  const state = createRun({seed: 516, difficulty: 'normal', runId: 'boss-summon-dead'});
  holdCampaign(state);
  queueBoss(state, 0, 4000);

  updateWaves(state, STEP);
  assert.equal(living(state, 'boss').length, 0, 'dead boss was treated as living');
  state.time = interval;
  updateWaves(state, STEP);
  updateWaves(state, STEP);

  assert.equal(living(state, summon.kind).length, 0, `dead boss added summoned kind ${summon.kind}`);
  assert.equal(state.director.done, false, 'dead boss set director.done');
  assert.equal(campaignStillWaiting(state), true, 'dead boss consumed the unfinished campaign spawn');
});
