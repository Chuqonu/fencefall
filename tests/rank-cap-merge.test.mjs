import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TYPES, createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {previewMerge, mergeUnits} from '../src/systems/merges.js';

const SOURCE = 3;
const TARGET = 8;

function planningRun(runId, {paused = true, phase = 'playing'} = {}) {
  const state = createRun({seed: 19, difficulty: 'normal', runId});
  state.paused = paused;
  state.phase = phase;
  return state;
}

function place(state, index, type) {
  const unit = createUnit(state, type, 4, 'tower');
  unit.kills = index + 1;
  unit.cooldown = index / 10;
  unit.upgrades = {mark: type};
  state.slots[index].unit = unit;
  return unit;
}

function occupied(state) {
  return state.slots.map(slot => slot.unit && {
    id: slot.unit.id,
    kind: slot.unit.kind,
    type: slot.unit.type,
    rank: slot.unit.rank,
    kills: slot.unit.kills,
    cooldown: slot.unit.cooldown,
    upgrades: slot.unit.upgrades
  });
}

function assertRejected(state, from, to, type) {
  const before = JSON.stringify(state);
  const board = occupied(state);
  const source = state.slots[from].unit;
  const target = state.slots[to].unit;
  const merges = state.stats.merges;
  const events = state.events.length;

  const preview = previewMerge(state, from, to);
  assert.equal(preview.ok, false, `${type} preview`);
  assert.equal(preview.reason, 'rank_cap', `${type} preview reason`);
  assert.equal(typeof preview.description?.en, 'string', `${type} preview en`);
  assert.equal(typeof preview.description?.zh, 'string', `${type} preview zh`);
  assert.equal(JSON.stringify(state), before, `${type} preview mutated the run`);

  const merged = mergeUnits(state, from, to);
  assert.equal(merged.ok, false, `${type} merge`);
  assert.equal(merged.reason, 'rank_cap', `${type} merge reason`);
  assert.equal(state.slots[from].unit, source, `${type} source was removed`);
  assert.equal(state.slots[to].unit, target, `${type} target was removed`);
  assert.equal(source.rank, 4, `${type} source rank`);
  assert.equal(target.rank, 4, `${type} target rank`);
  assert.equal(source.type, type);
  assert.equal(target.type, type);
  assert.equal(source.kind, 'tower');
  assert.equal(target.kind, 'tower');
  assert.notEqual(source.id, target.id);
  assert.deepEqual(occupied(state), board, `${type} board changed`);
  assert.equal(state.stats.merges, merges, `${type} merge count`);
  assert.equal(state.events.length, events, `${type} events`);
  assert.equal(JSON.stringify(state), before, `${type} merge mutated the run`);
}

test('two rank-4 towers of the same type fail to merge and both units remain', () => {
  assert.ok(BASE_TYPES.length >= 1);
  for (const type of BASE_TYPES) {
    const state = planningRun(`rank-cap-${type}`);
    const source = place(state, SOURCE, type);
    const target = place(state, TARGET, type);
    const hero = state.slots[2].unit;

    assertRejected(state, SOURCE, TARGET, type);
    assertRejected(state, TARGET, SOURCE, type);

    assert.equal(state.slots[SOURCE].unit, source);
    assert.equal(state.slots[TARGET].unit, target);
    assert.equal(state.slots[2].unit, hero);
    assert.equal(hero.kind, 'hero');
    assert.equal(state.stats.merges, 0);
    assert.equal(state.events.length, 0);
  }
});

test('rank-4 same-type merges stay rejected during a draft', () => {
  const state = planningRun('rank-cap-draft', {paused: false, phase: 'draft'});
  const source = place(state, 0, 'bolt');
  const target = place(state, 1, 'bolt');
  assertRejected(state, 0, 1, 'bolt');
  assert.equal(state.phase, 'draft');
  assert.equal(state.slots[0].unit, source);
  assert.equal(state.slots[1].unit, target);
});
