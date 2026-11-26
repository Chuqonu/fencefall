import test from 'node:test';
import assert from 'node:assert/strict';
import {DIFFICULTIES} from '../src/shared.js';
import {advance, applyProfileBonuses, createRun, integrationInfo, prepare, setSpeed, simulate, step, takeEvents} from '../src/engine.js';
import {ACTIONS, createController} from '../src/boot.js';

test('profile bonuses apply once and ignore corrupt fence values', () => {
  const state = createRun({runId:'bonus', difficulty:'normal'});
  const before = state.fence.maxHp;
  applyProfileBonuses(state, {fence:40, damage:0.1, haste:-5, range:12, critChance:0.05, reward:0.2});
  assert.equal(state.initialized, true);
  assert.equal(state.fence.maxHp, before + 40);
  assert.equal(state.fence.hp, before + 40);
  assert.equal(state.systems.integration.bonuses.damage, 0.1);
  applyProfileBonuses(state, {fence:40});
  assert.equal(state.fence.maxHp, before + 40);
  const corrupt = createRun({runId:'corrupt'});
  applyProfileBonuses(corrupt, {fence:5000});
  assert.equal(corrupt.fence.maxHp, DIFFICULTIES.normal.fence);
  assert.equal(corrupt.initialized, true);
});

test('fixed steps match across 1x and 3x and pause drops banked time', () => {
  const slow = createRun({seed:11, runId:'slow'});
  const fast = createRun({seed:11, runId:'fast'});
  setSpeed(slow, 1);
  setSpeed(fast, 3);
  for (let frame = 0; frame < 60; frame += 1) advance(slow, 1 / 60);
  for (let frame = 0; frame < 20; frame += 1) advance(fast, 1 / 60);
  assert.equal(slow.tick, fast.tick);
  assert.equal(slow.phase, fast.phase);
  assert.ok(Math.abs(slow.time - fast.time) < 1e-6);
  if (!integrationInfo().present.waves) assert.equal(slow.tick, 60);
  const paused = createRun({runId:'hold'});
  advance(paused, 1 / 60);
  paused.paused = true;
  advance(paused, 0.2);
  assert.equal(paused.tick, 1);
  assert.equal(paused.accumulator, 0);
  paused.paused = false;
  paused.phase = 'draft';
  advance(paused, 0.2);
  assert.equal(paused.tick, 1);
});

test('defeat and victory are terminal and do not invent a result without waves', () => {
  const lost = createRun({runId:'lost'});
  prepare(lost);
  lost.fence.hp = 0;
  step(lost);
  assert.equal(lost.phase, 'defeat');
  assert.equal(lost.fence.hp, 0);
  assert.equal(takeEvents(lost).filter(event => event.type === 'defeat').length, 1);
  const tick = lost.tick;
  step(lost);
  assert.equal(lost.tick, tick);
  assert.equal(takeEvents(lost).length, 0);

  const idle = createRun({runId:'idle'});
  simulate(idle, 2);
  if (!integrationInfo().present.waves) {
    assert.equal(idle.phase, 'playing');
    assert.equal(idle.tick, 120);
    assert.equal(idle.fence.hp, DIFFICULTIES.normal.fence);
  }

  if (!integrationInfo().present.waves) {
    const won = createRun({runId:'won'});
    prepare(won);
    won.director.done = true;
    step(won);
    assert.equal(won.phase, 'victory');
    assert.equal(takeEvents(won).filter(event => event.type === 'victory').length, 1);
  }
});

test('controller actions obey planning rules without pretending missing modules succeeded', async () => {
  const api = await createController();
  const info = api.integration();
  assert.equal(typeof info.engine.present.combat, 'boolean');
  const fresh = api.act('chooseDraft', {index:0});
  assert.equal(fresh.ok, false);
  api.act('start', {difficulty:'easy', seed:5, runId:'controller'});
  const state = api.getState();
  assert.equal(state.slots.filter(slot => slot.unit).length, 1);
  assert.equal(state.slots[2].unit.kind, 'hero');
  assert.equal(state.fence.maxHp, DIFFICULTIES.easy.fence);
  assert.equal(state.initialized, true);
  const currency = state.profileSnapshot.currency;
  api.getProfile().currency = 50;
  assert.equal(state.profileSnapshot.currency, currency);
  assert.equal(state.profileSnapshot.currency, 0);
  const tick = state.tick;
  const rng = state.rng;
  const nextId = state.nextId;
  const heroId = state.slots[2].unit.id;
  state.nextDraftXp = 1e9;
  const moved = api.act('move', {from:2, to:6});
  assert.equal(moved.ok, true, moved.reason || '');
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'playing');
  assert.equal(state.slots[6].unit.id, heroId);
  assert.equal(state.slots[2].unit, null);
  assert.equal(state.rng, rng);
  assert.equal(state.nextId, nextId);
  assert.equal(state.tick, tick);
  advance(state, 1);
  assert.equal(state.paused, false);
  assert.ok(state.tick > tick);
  const running = state.tick;
  api.act('pause');
  assert.equal(state.paused, true);
  assert.equal(api.act('move', {from:6, to:2}).ok, true);
  assert.equal(api.act('move', {from:2, to:6}).ok, true);
  assert.equal(state.paused, true);
  assert.equal(state.tick, running);
  assert.equal(state.slots[6].unit.kind, 'hero');
  assert.equal(state.slots[2].unit, null);
  assert.equal(api.act('mergePreview', {from:6, to:0}).reason, 'heroProtected');
  assert.equal(state.slots[6].unit.kind, 'hero');
  const speed = api.act('speed', {value:2});
  assert.equal(speed.ok, false);
  assert.equal(state.speed, 1);
  assert.equal(api.act('speed', {value:3}).ok, true);
  assert.equal(state.speed, 3);
  assert.equal(api.act('speed', {value:1.5}).ok, true);
  assert.equal(state.speed, 1.5);
  assert.equal(api.act('speed', {value:10}).ok, true);
  assert.equal(state.speed, 10);
  assert.equal(api.act('speed', {value:2}).ok, false);
  assert.equal(state.speed, 10);
  state.hiddenPaused = true;
  state.paused = true;
  assert.equal(api.act('resume').ok, true);
  assert.equal(state.hiddenPaused, false);
  assert.equal(state.paused, true);
  api.act('language', {value:'zh'});
  assert.equal(api.getProfile().settings.language, 'zh');
  assert.equal(state.tick, running);
  assert.equal(state.runId, 'controller');
  advance(state, 1);
  assert.equal(state.tick, running);
  if (!info.engine.present.drafts) assert.equal(api.act('chooseDraft', {index:0}).reason, 'bad-phase');
  if (!info.modules.progression) {
    assert.equal(api.act('buyEquipment', {id:'missing'}).reason, 'unavailable');
    api.act('abandon');
    assert.equal(state.phase, 'defeat');
    assert.equal(state.settlement, null);
    assert.equal(api.getProfile().currency, 50);
    assert.equal(api.getUI().screen, 'results');
  }
  for (const action of ACTIONS) {
    const outcome = api.act(action, {});
    assert.equal(typeof outcome.ok, 'boolean');
    assert.notEqual(outcome.reason, 'unknown-action');
  }
});
