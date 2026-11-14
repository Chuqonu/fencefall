// Extra poison applications stop on the stack cap. tickTimer stays >= 0
// through those applications and through the damage cadence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {applyStatus, updateStatuses, STATUS_LIMITS} from '../src/systems/status.js';
import {damageEnemy} from '../src/systems/combat.js';

function fresh(runId) {
  return createRun({seed: 609, difficulty: 'normal', runId});
}

function place(state) {
  const enemy = spawnEnemy(state, 'brute', {
    x: 180,
    y: 240,
    hp: 100000,
    maxHp: 100000,
    armor: 0
  });
  enemy.armor = 0;
  enemy.statuses = [];
  return enemy;
}

function payload(sourceId, power, remaining, maxStacks, stacks) {
  const status = {
    type: 'poison',
    power,
    remaining,
    sourceId,
    stacks,
    tickTimer: 0
  };
  if (maxStacks !== undefined) status.maxStacks = maxStacks;
  return status;
}

function poisonRows(enemy) {
  return (enemy.statuses || []).filter(status => status && status.type === 'poison');
}

function assertCapped(enemy, cap, label) {
  const rows = poisonRows(enemy);
  const total = rows.reduce((sum, status) => sum + (Number.isFinite(status.stacks) ? status.stacks : 1), 0);
  assert.equal(rows.length, 1, `${label} poison entries`);
  assert.equal(total, cap, `${label} total stacks`);
  const status = rows[0];
  assert.equal(status.stacks, cap, `${label} stacks`);
  assert.equal(status.maxStacks, cap, `${label} maxStacks`);
  assert.equal(Number.isFinite(status.tickTimer), true, `${label} tickTimer`);
  assert.ok(status.tickTimer >= 0, `${label} tickTimer ${status.tickTimer}`);
  return status;
}

function applyTimes(enemy, sourceId, times, fields) {
  for (let i = 0; i < times; i += 1) {
    const applied = applyStatus(
      enemy,
      payload(sourceId, fields.power, fields.remaining, fields.maxStacks, fields.stacks)
    );
    assert.equal(applied.ok, true, `${fields.label} apply ${i + 1}: ${applied.reason}`);
    const rows = poisonRows(enemy);
    assert.equal(rows.length, 1, `${fields.label} entries after apply ${i + 1}`);
    assert.ok(rows[0].stacks >= 1 && rows[0].stacks <= fields.cap, `${fields.label} stacks ${rows[0].stacks} outside 1..${fields.cap}`);
    assert.equal(Number.isFinite(rows[0].tickTimer), true, `${fields.label} tickTimer after apply ${i + 1}`);
    assert.ok(rows[0].tickTimer >= 0, `${fields.label} tickTimer ${rows[0].tickTimer} after apply ${i + 1}`);
  }
}

test('applying more poison stacks than maxStacks leaves the count at the cap', () => {
  assert.equal(STATUS_LIMITS.defaultPoisonStacks, 5);
  assert.equal(STATUS_LIMITS.maxPoisonStacks, 8);
  const cases = [
    {label: 'cap 3', maxStacks: 3, cap: 3, stacks: 9, extra: 9},
    {label: 'cap 4', maxStacks: 4, cap: 4, stacks: 10, extra: 8},
    {label: 'cap 5', maxStacks: 5, cap: 5, stacks: 12, extra: 7},
    {label: 'hard cap', maxStacks: 40, cap: 8, stacks: 40, extra: 22},
    {label: 'default cap', maxStacks: undefined, cap: 5, stacks: 12, extra: 13},
    {label: 'cap 1', maxStacks: 1, cap: 1, stacks: 6, extra: 6}
  ];

  for (const item of cases) {
    const state = fresh(`poison-cap-${item.cap}-${item.label}`);
    const enemy = place(state);
    const sourceId = state.slots[2].unit.id;
    const fields = {
      label: item.label,
      power: 4,
      remaining: 4,
      maxStacks: item.maxStacks,
      stacks: item.stacks,
      cap: item.cap
    };
    applyTimes(enemy, sourceId, item.cap, fields);
    assertCapped(enemy, item.cap, `${item.label} on the last legal stack`);
    applyTimes(enemy, sourceId, item.extra, fields);
    assertCapped(enemy, item.cap, `${item.label} past the cap`);

    const hp = enemy.hp;
    updateStatuses(state, STATUS_LIMITS.dotTick, damageEnemy);
    const dealt = hp - enemy.hp;
    const expected = fields.power * item.cap * STATUS_LIMITS.dotTick;
    assert.ok(Math.abs(dealt - expected) < 1e-6, `${item.label} dealt ${dealt}, capped tick is ${expected}`);
    assertCapped(enemy, item.cap, `${item.label} after a tick`);
    assert.equal(enemy.dead, false);
  }
});

test('tickTimer stays non-negative while further poison applications hold the cap', () => {
  const state = fresh('poison-cap-timer');
  const enemy = place(state);
  const sourceId = state.slots[2].unit.id;
  const maxStacks = 3;
  const cap = 3;
  const fields = {
    label: 'timer',
    power: 4,
    remaining: 8,
    maxStacks,
    stacks: maxStacks + 15,
    cap
  };
  applyTimes(enemy, sourceId, cap + 10, fields);
  assertCapped(enemy, cap, 'before ticks');

  const steps = [];
  for (let i = 0; i < 180; i += 1) steps.push(STEP);
  steps.push(STATUS_LIMITS.dotTick, STATUS_LIMITS.dotTick - 1e-8, STATUS_LIMITS.dotTick - 1e-9, STATUS_LIMITS.dotTick + 1e-8, 1, 0);

  for (let i = 0; i < steps.length; i += 1) {
    updateStatuses(state, steps[i], damageEnemy);
    const applied = applyStatus(enemy, payload(sourceId, fields.power, fields.remaining, maxStacks, fields.stacks));
    assert.equal(applied.ok, true, `reapply ${i}: ${applied.reason}`);
    const status = assertCapped(enemy, cap, `frame ${i}`);
    assert.ok(status.remaining > 0, `poison expired at frame ${i}`);
    assert.equal(enemy.dead, false);
  }
});

test('duplicate poison rows above maxStacks collapse to one capped stack', () => {
  const state = fresh('poison-cap-merge');
  const enemy = place(state);
  const sourceId = state.slots[2].unit.id;
  enemy.statuses = [
    {type: 'poison', power: 4, remaining: 5, sourceId: 'a', stacks: 7, maxStacks: 3, tickTimer: 0.2},
    {type: 'poison', power: 3, remaining: 4, sourceId: 'b', stacks: 7, maxStacks: 3, tickTimer: 0.05}
  ];
  const applied = applyStatus(enemy, payload(sourceId, 4, 5, 3, 9));
  assert.equal(applied.ok, true, applied.reason);
  const status = assertCapped(enemy, 3, 'merged');
  assert.equal(status.power, 4);
  assert.ok(status.tickTimer >= 0, `merged tickTimer ${status.tickTimer}`);

  updateStatuses(state, STEP, damageEnemy);
  assertCapped(enemy, 3, 'merged after a step');
  assert.equal(enemy.dead, false);
});
