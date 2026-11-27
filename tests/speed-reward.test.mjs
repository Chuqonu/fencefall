// Speed changes how many fixed steps fit in a wall second. It does not
// multiply the purse. Currency is awarded only by settleRun, from fight time,
// kills, and wave. Pause and draft wall time are not fight time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {advance, createProfile, createRun, setSpeed} from '../src/engine.js';
import {settleRun} from '../src/systems/progression.js';
import {chooseDraft, updateDrafts} from '../src/systems/drafts.js';

const FRAME = 1 / 60;
const SEEDS = [11, 42, 16016, 123456];
const PLAYING_SIM = 12;
const DRAFT_BUDGET = 30;
const HELD_WALL = 45;

function begin(seed, runId, speed) {
  const profile = createProfile();
  const state = createRun({seed, runId, difficulty: 'normal', profile});
  setSpeed(state, speed);
  return {profile, state};
}

function advanceSim(state, simSeconds) {
  const speed = state.speed === 1.5 || state.speed === 3 || state.speed === 10 ? state.speed : 1;
  const frames = Math.round(simSeconds / speed / FRAME);
  for (let index = 0; index < frames; index += 1) advance(state, FRAME);
}

function advanceWall(state, seconds) {
  let left = seconds;
  while (left > 1e-9) {
    const slice = Math.min(0.25, left);
    advance(state, slice);
    left -= slice;
  }
}

function assertNotHigher(fast, slow, label) {
  assert.ok(slow.state.xp > 0, `${label} xp`);
  assert.ok(slow.state.kills > 0, `${label} kills`);
  assert.equal(fast.state.tick, slow.state.tick, `${label} tick`);
  assert.equal(fast.state.time, slow.state.time, `${label} time`);
  assert.ok(fast.state.xp <= slow.state.xp, `${label} xp rose with speed`);
  assert.ok(fast.state.kills <= slow.state.kills, `${label} kills rose with speed`);
  assert.equal(fast.profile.currency, 0, `${label} paid before settlement`);
  assert.equal(slow.profile.currency, 0, `${label} paid before settlement`);
  const fastPay = settleRun(fast.profile, fast.state);
  const slowPay = settleRun(slow.profile, slow.state);
  assert.equal(fastPay.result, 'abandon', label);
  assert.equal(slowPay.result, 'abandon', label);
  assert.ok(slowPay.currency > 0, `${label} settlement`);
  assert.ok(fastPay.currency <= slowPay.currency, `${label} settlement rose with speed`);
  assert.ok(fast.profile.currency <= slow.profile.currency, `${label} wallet rose with speed`);
  assert.ok(fastPay.kills <= slowPay.kills, `${label} settled kills`);
  assert.ok(fastPay.time <= slowPay.time, `${label} settled time`);
}

test('the same simulation time at 3x does not pay more currency, xp, or kills than 1x', () => {
  for (const seed of SEEDS) {
    const one = begin(seed, `equal-${seed}-1`, 1);
    const triple = begin(seed, `equal-${seed}-3`, 3);
    const ten = begin(seed, `equal-${seed}-10`, 10);
    advanceSim(one.state, PLAYING_SIM);
    advanceSim(triple.state, PLAYING_SIM);
    advanceSim(ten.state, PLAYING_SIM);
    assert.equal(one.state.phase, 'playing', seed);
    assert.equal(triple.state.phase, 'playing', seed);
    assert.equal(ten.state.phase, 'playing', seed);
    assert.equal(one.state.speed, 1);
    assert.equal(triple.state.speed, 3);
    assert.equal(ten.state.speed, 10);
    assert.ok(Math.abs(one.state.time - PLAYING_SIM) < 1e-6, seed);
    assert.equal(ten.state.tick, one.state.tick, `seed ${seed} 10x tick`);
    assert.equal(ten.state.time, one.state.time, `seed ${seed} 10x time`);
    assert.ok(ten.state.xp <= one.state.xp, `seed ${seed} 10x xp`);
    assert.ok(ten.state.kills <= one.state.kills, `seed ${seed} 10x kills`);
    assert.equal(ten.profile.currency, 0, `seed ${seed} 10x paid before settlement`);
    assertNotHigher(triple, one, `seed ${seed}`);
    const tenPay = settleRun(ten.profile, ten.state);
    assert.equal(tenPay.result, 'abandon', `seed ${seed} 10x`);
    assert.ok(tenPay.currency <= one.profile.currency, `seed ${seed} 10x settlement rose with speed`);
    assert.equal(tenPay.time, one.state.settlement.time, `seed ${seed} 10x settled time`);
    assert.ok(tenPay.kills <= one.state.settlement.kills, `seed ${seed} 10x settled kills`);
  }

  const one = begin(16016, 'draft-budget-1', 1);
  const triple = begin(16016, 'draft-budget-3', 3);
  const ten = begin(16016, 'draft-budget-10', 10);
  advanceSim(one.state, DRAFT_BUDGET);
  advanceSim(triple.state, DRAFT_BUDGET);
  advanceSim(ten.state, DRAFT_BUDGET);
  assert.equal(one.state.phase, 'draft');
  assert.equal(triple.state.phase, 'draft');
  assert.equal(ten.state.phase, 'draft');
  assert.ok(one.state.time < DRAFT_BUDGET, 'draft budget was counted as fight time');
  assert.equal(triple.state.time, one.state.time);
  assert.equal(triple.state.tick, one.state.tick);
  assert.equal(ten.state.time, one.state.time);
  assert.equal(ten.state.tick, one.state.tick);
  assert.ok(triple.state.kills <= one.state.kills);
  assert.ok(triple.state.xp <= one.state.xp);
  assert.ok(ten.state.kills <= one.state.kills);
  assert.ok(ten.state.xp <= one.state.xp);
  assert.equal(one.profile.currency, 0);
  assert.equal(triple.profile.currency, 0);
  assert.equal(ten.profile.currency, 0);
  const onePay = settleRun(one.profile, one.state);
  const triplePay = settleRun(triple.profile, triple.state);
  const tenPay = settleRun(ten.profile, ten.state);
  assert.ok(onePay.currency > 0);
  assert.ok(triplePay.currency <= onePay.currency, 'draft-budget settlement rose with speed');
  assert.ok(tenPay.currency <= onePay.currency, 'draft-budget settlement rose at 10x');
  assert.equal(triplePay.time, onePay.time);
  assert.equal(tenPay.time, onePay.time);
  assert.ok(triplePay.kills <= onePay.kills);
  assert.ok(tenPay.kills <= onePay.kills);
  assert.ok(triple.profile.currency <= one.profile.currency);
  assert.ok(ten.profile.currency <= one.profile.currency);
});

test('pause and draft wall time are not fight time and do not raise the settlement', () => {
  const control = begin(16016, 'hold-control', 1);
  advanceSim(control.state, PLAYING_SIM);
  const fightTime = control.state.time;
  const fightTick = control.state.tick;
  const fightKills = control.state.kills;
  const fightXp = control.state.xp;
  assert.equal(control.state.phase, 'playing');
  assert.ok(fightKills > 0);
  assert.ok(fightXp > 0);
  const controlPay = settleRun(control.profile, control.state);
  assert.ok(controlPay.currency > 0);
  assert.equal(controlPay.time, fightTime);

  for (const speed of [1, 3, 10]) {
    const held = begin(16016, `hold-${speed}`, speed);
    advanceSim(held.state, PLAYING_SIM);
    assert.equal(held.state.time, fightTime, speed);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    assert.equal(held.state.xp, fightXp, speed);
    assert.equal(held.profile.currency, 0, speed);

    setSpeed(held.state, speed);
    held.state.paused = true;
    held.state.hiddenPaused = false;
    advanceWall(held.state, HELD_WALL);
    assert.equal(held.state.paused, true, speed);
    assert.equal(held.state.time, fightTime, `pause counted at ${speed}x`);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    assert.equal(held.state.xp, fightXp, speed);
    assert.equal(held.state.accumulator, 0, speed);

    held.state.paused = false;
    held.state.hiddenPaused = true;
    advanceWall(held.state, HELD_WALL);
    assert.equal(held.state.time, fightTime, `hidden pause counted at ${speed}x`);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    assert.equal(held.state.xp, fightXp, speed);
    assert.equal(held.state.accumulator, 0, speed);

    held.state.hiddenPaused = false;
    held.state.paused = false;
    held.state.xp = held.state.nextDraftXp;
    const opened = updateDrafts(held.state);
    assert.equal(opened.ok, true, speed);
    assert.equal(held.state.phase, 'draft', speed);
    assert.equal(held.state.time, fightTime, `opening a draft counted time at ${speed}x`);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    const draftXp = held.state.xp;
    advanceWall(held.state, HELD_WALL);
    assert.equal(held.state.phase, 'draft', speed);
    assert.equal(held.state.paused, false, speed);
    assert.equal(held.state.hiddenPaused, false, speed);
    assert.equal(held.state.time, fightTime, `draft counted at ${speed}x`);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    assert.equal(held.state.xp, draftXp, speed);
    assert.equal(held.state.accumulator, 0, speed);

    const pick = held.state.draft.options.findIndex(card => card.kind === 'hero_upgrade');
    assert.ok(pick >= 0, speed);
    const chosen = chooseDraft(held.state, pick);
    assert.equal(chosen.ok, true, speed);
    assert.equal(held.state.phase, 'playing', speed);
    assert.equal(held.state.time, fightTime, `draft choice counted at ${speed}x`);
    assert.equal(held.state.tick, fightTick, speed);
    assert.equal(held.state.kills, fightKills, speed);
    assert.equal(held.state.xp, draftXp, speed);
    assert.equal(held.profile.currency, 0, `speed ${speed} paid during pause or draft`);

    const pay = settleRun(held.profile, held.state);
    assert.equal(pay.result, 'abandon', speed);
    assert.equal(pay.time, fightTime, speed);
    assert.equal(pay.kills, fightKills, speed);
    assert.ok(pay.currency <= controlPay.currency, `speed ${speed} settlement counted pause or draft`);
    assert.ok(held.profile.currency <= control.profile.currency, speed);
  }
});
