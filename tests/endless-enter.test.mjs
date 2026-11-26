import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, enterEndless, step} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {FENCE_REGEN_PER_SECOND} from '../src/systems/combat.js';
import {ACTIONS, createController} from '../src/boot.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('a settled victory enters endless, stays playing, and does not win again', () => {
  const state = createRun({seed: 21, difficulty: 'normal', runId: 'endless-enter'});
  state.director.done = true;
  state.director.queue = [];
  state.enemies = [];
  step(state);
  assert.equal(state.phase, 'victory');
  assert.equal(state.events.filter(event => event.type === 'victory').length, 1);

  state.fence.hp = 400;
  state.paused = true;
  state.hiddenPaused = false;
  state.settlement = {currency: 12, result: 'victory'};
  const settlement = state.settlement;
  const slots = state.slots;
  const enemies = state.enemies;
  const kills = state.kills;
  const time = state.time;
  const xp = state.xp;
  const currency = state.profileSnapshot.currency;
  const hiddenPaused = state.hiddenPaused;
  const tick = state.tick;

  assert.deepEqual(enterEndless(state), {ok: true});
  assert.equal(state.endless, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.paused, false);
  assert.equal(state.hiddenPaused, hiddenPaused);
  assert.equal(state.fence.hp, 400);
  assert.equal(state.settlement, settlement);
  assert.equal(state.kills, kills);
  assert.equal(state.time, time);
  assert.equal(state.xp, xp);
  assert.equal(state.slots, slots);
  assert.equal(state.enemies, enemies);
  assert.equal(state.profileSnapshot.currency, currency);
  assert.equal(state.events.filter(event => event.type === 'victory').length, 1);
  assert.equal(state.events.filter(event => event.type === 'defeat').length, 0);

  step(state);
  assert.equal(state.phase, 'playing');
  assert.equal(state.tick, tick + 1);
  assert.ok(Math.abs(state.fence.hp - (400 + FENCE_REGEN_PER_SECOND * STEP)) < 1e-8);
  assert.equal(state.settlement, settlement);
  assert.equal(state.settlement.currency, 12);
  assert.equal(state.settlement.result, 'victory');
  assert.equal(state.kills, kills);
  assert.equal(state.xp, xp);
  assert.equal(state.profileSnapshot.currency, currency);
  assert.equal(state.events.filter(event => event.type === 'victory').length, 1);
  assert.equal(state.events.filter(event => event.type === 'defeat').length, 0);
});

test('defeat and playing runs are rejected, and a second call is already', () => {
  assert.deepEqual(enterEndless(null), {ok: false, reason: 'bad-phase'});
  assert.deepEqual(enterEndless(undefined), {ok: false, reason: 'bad-phase'});

  const defeated = createRun({seed: 2, runId: 'endless-defeat'});
  defeated.phase = 'defeat';
  defeated.fence.hp = 0;
  assert.deepEqual(enterEndless(defeated), {ok: false, reason: 'bad-phase'});
  assert.equal(defeated.phase, 'defeat');
  assert.equal(defeated.endless, false);
  assert.equal(defeated.fence.hp, 0);

  const playing = createRun({seed: 3, runId: 'endless-playing'});
  playing.paused = true;
  assert.deepEqual(enterEndless(playing), {ok: false, reason: 'bad-phase'});
  assert.equal(playing.phase, 'playing');
  assert.equal(playing.endless, false);
  assert.equal(playing.paused, true);

  const won = createRun({seed: 4, runId: 'endless-twice'});
  won.phase = 'victory';
  won.settlement = {currency: 12, result: 'victory'};
  won.fence.hp = 400;
  assert.deepEqual(enterEndless(won), {ok: true});
  assert.equal(won.phase, 'playing');
  assert.equal(won.endless, true);
  const settlement = won.settlement;
  assert.deepEqual(enterEndless(won), {ok: false, reason: 'already'});
  assert.equal(won.phase, 'playing');
  assert.equal(won.endless, true);
  assert.equal(won.paused, false);
  assert.equal(won.fence.hp, 400);
  assert.equal(won.settlement, settlement);

  const stuck = createRun({seed: 5, runId: 'endless-stuck'});
  stuck.phase = 'victory';
  stuck.endless = true;
  assert.deepEqual(enterEndless(stuck), {ok: false, reason: 'already'});
  assert.equal(stuck.phase, 'victory');
});

test('the endless action is listed and follows the current run', async () => {
  assert.equal(ACTIONS.includes('endless'), true);

  const idle = await createController();
  assert.deepEqual(idle.act('endless'), {ok: false, reason: 'no-run'});

  const storage = memoryStorage();
  const api = await createController({storage});
  assert.equal(api.act('start', {seed: 9, difficulty: 'normal', runId: 'endless-act'}).ok, true);
  const during = api.act('endless');
  assert.equal(during.ok, false);
  assert.equal(during.reason, 'bad-phase');
  assert.equal(api.getState().phase, 'playing');
  assert.equal(api.getState().endless, false);

  const state = api.getState();
  const profile = api.getProfile();
  const currency = profile.currency;
  const settledRuns = profile.settledRuns.slice();
  state.phase = 'victory';
  state.paused = true;
  state.fence.hp = 400;
  state.settlement = {currency: 12, result: 'victory'};
  assert.equal(api.act('screen', {name: 'results'}).ok, true);

  const entered = api.act('endless');
  assert.deepEqual(entered, {ok: true});
  assert.equal(api.getUI().screen, 'battle');
  assert.equal(state.endless, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.paused, false);
  assert.equal(state.fence.hp, 400);
  assert.deepEqual(state.settlement, {currency: 12, result: 'victory'});
  assert.equal(profile.currency, currency);
  assert.deepEqual(profile.settledRuns, settledRuns);
  assert.deepEqual(api.act('endless'), {ok: false, reason: 'already'});

  state.phase = 'victory';
  state.endless = false;
  state.fence.hp = 400;
  state.settlement = {
    runId: state.runId,
    currency: 12,
    difficulty: state.difficulty,
    result: 'victory',
    time: state.time,
    kills: state.kills,
    wave: state.wave,
  };
  assert.equal(api.act('endless').ok, true);
  assert.equal(profile.currency, currency);
  assert.deepEqual(profile.settledRuns, settledRuns);

  const reloaded = await createController({storage});
  const saved = reloaded.getState();
  assert.equal(saved.endless, true);
  assert.equal(saved.phase, 'playing');
  assert.equal(saved.fence.hp, 400);
  assert.equal(saved.settlement.currency, 12);
  assert.equal(saved.settlement.result, 'victory');
  assert.equal(reloaded.getProfile().currency, currency);
});
