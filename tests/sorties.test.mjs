// Sortie selection, the long-watch schedule, and one-time clear records.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/state.js';
import {WAVES, updateWaves} from '../src/systems/waves.js';
import {settleRun} from '../src/systems/progression.js';

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

test('createRun defaults a missing or unknown expedition to watch', () => {
  assert.equal(createRun().expedition, 'watch');
  assert.equal(createRun({expedition: 'nope'}).expedition, 'watch');
});

test('createRun keeps the leap expedition', () => {
  assert.equal(createRun({expedition: 'leap'}).expedition, 'leap');
});

test('the long campaign still opens with four shamblers', () => {
  const opening = WAVES[0];
  assert.ok(opening);
  assert.ok(Array.isArray(opening.groups));
  assert.ok(opening.groups.some(group => group && group.kind === 'shambler' && group.count === 4));
});

test('the long watch at 40s has no leaper or warden', () => {
  const state = schedule('watch', 40, 'watch-sched');
  assert.equal(seesKind(state, 'leaper'), false);
  assert.equal(seesKind(state, 'warden'), false);
  assert.equal(seesKind(state, 'charge'), false);
  assert.equal(seesKind(state, 'hush'), false);
});

test('the long watch teaches each new role after the opening', () => {
  const marks = [
    [210, 'leaper'],
    [270, 'shade'],
    [320, 'banner'],
    [380, 'splitter'],
    [410, 'warden'],
    [440, 'charge'],
    [500, 'hush'],
    [660, 'mender'],
  ];
  for (const [time, kind] of marks) {
    const state = schedule('watch', time, `watch-${kind}`);
    assert.equal(seesKind(state, kind), true, `${kind} by ${time}s`);
  }
  const bosses = schedule('watch', 790, 'watch-boss');
  assert.equal(seesKind(bosses, 'boss'), true);
});

test('leap ash at 50s has a leaper on the field or in the queue', () => {
  const state = schedule('leap', 50, 'leap-sched');
  assert.equal(seesKind(state, 'leaper'), true);
});

test('ash hush keeps the expedition and brings a hush after the opening', () => {
  assert.equal(createRun({expedition: 'hush', runId: 'hush-keep'}).expedition, 'hush');
  const quiet = schedule('hush', 18, 'hush-quiet');
  assert.equal(seesKind(quiet, 'hush'), false);
  assert.equal(seesKind(quiet, 'shambler'), true);
  const state = schedule('hush', 24, 'hush-soon');
  assert.equal(seesKind(state, 'hush'), true);
});

test('cinder line keeps the expedition and brings a charge after the opening', () => {
  assert.equal(createRun({expedition: 'cinder', runId: 'cinder-keep'}).expedition, 'cinder');
  const quiet = schedule('cinder', 18, 'cinder-quiet');
  assert.equal(seesKind(quiet, 'charge'), false);
  assert.equal(seesKind(quiet, 'shambler'), true);
  const state = schedule('cinder', 24, 'cinder-soon');
  assert.equal(seesKind(state, 'charge'), true);
});

test('ash ward keeps the expedition and brings a warden after the opening', () => {
  assert.equal(createRun({expedition: 'ward', runId: 'ward-keep'}).expedition, 'ward');
  const quiet = schedule('ward', 18, 'ward-quiet');
  assert.equal(seesKind(quiet, 'warden'), false);
  assert.equal(seesKind(quiet, 'shambler'), true);
  const state = schedule('ward', 24, 'ward-soon');
  assert.equal(seesKind(state, 'warden'), true);
});

test('leap ash stays on shamblers until the signature wave, then leapers arrive', () => {
  const quiet = schedule('leap', 18, 'leap-quiet');
  assert.equal(seesKind(quiet, 'leaper'), false);
  assert.equal(seesKind(quiet, 'shambler'), true);
  const state = schedule('leap', 24, 'leap-soon');
  assert.equal(seesKind(state, 'leaper'), true);
});

test('the mixed gate includes the ash hush before the crown', () => {
  const state = schedule('gauntlet', 255, 'gauntlet-hush');
  assert.equal(seesKind(state, 'hush'), true);
});

test('the mixed gate at 370s has a boss on the field or in the queue', () => {
  const state = schedule('gauntlet', 370, 'gauntlet-sched');
  assert.equal(seesKind(state, 'boss'), true);
});

test('dust brood at 130s has a splitter on the field or in the queue', () => {
  const state = schedule('dust', 130, 'dust-sched');
  assert.equal(seesKind(state, 'splitter'), true);
});

test('a wires victory records one clear and a second settle does not add another', () => {
  const profile = createProfile();
  const state = createRun({expedition: 'wires', runId: 'sortie-clear-1', seed: 1});
  state.phase = 'victory';
  state.time = 120;
  state.kills = 10;
  state.wave = 4;
  assert.ok(state.fence.hp > 0);

  settleRun(profile, state);
  assert.equal(profile.expeditions.wires.clears, 1);
  assert.equal(Number.isFinite(profile.expeditions.wires.bestTime), true);

  settleRun(profile, state);
  assert.equal(profile.expeditions.wires.clears, 1);
});

test('endless keeps wardens and cinder charges in the rotation', () => {
  const state = createRun({expedition: 'watch', seed: 5, runId: 'endless-roles'});
  state.phase = 'playing';
  state.endless = true;
  state.director.nextWave = WAVES.length;
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
    state.time += 8;
  }
  assert.equal(sawWarden, true);
  assert.equal(sawCharge, true);
  assert.equal(sawHush, true);
});

test('a shade defeat does not record a clear', () => {
  const profile = createProfile();
  const state = createRun({expedition: 'shade', runId: 'sortie-defeat-1', seed: 2});
  state.phase = 'defeat';
  state.time = 80;
  state.kills = 4;
  state.wave = 2;
  state.fence.hp = 0;

  settleRun(profile, state);
  const entry = profile.expeditions && profile.expeditions.shade;
  if (entry != null) {
    const clears = typeof entry.clears === 'number' ? entry.clears : 0;
    assert.ok(!(clears > 0));
  }
});
