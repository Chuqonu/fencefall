// A stun stops fence bites. An enemy already on the fence with a living stun
// does not reduce fence HP when updateCombat runs for less than that stun.
// After the stun is gone, updateCombat long enough for one bite reduces fence
// HP by the enemy's catalog damage. Damage and attack interval stay catalog values.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {ARENA, DIFFICULTIES, STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {applyStatus, isStunned, updateStatuses} from '../src/systems/status.js';

const KINDS = Object.keys(ENEMIES).filter(kind => !ENEMIES[kind].attackRange);
const STUN = 3.2;

function fresh(runId) {
  return createRun({seed: 514, difficulty: 'normal', runId});
}

function catalogDamage(state, kind) {
  return ENEMIES[kind].damage * DIFFICULTIES[state.difficulty].damage;
}

function plant(state, kind) {
  const enemy = spawnEnemy(state, kind, {
    x: 180,
    y: ARENA.fenceY,
    hp: 1e7,
    maxHp: 1e7,
    driftAmp: 0,
    driftVelocity: 0,
  });
  enemy.driftAmp = 0;
  enemy.driftVelocity = 0;
  return enemy;
}

function livingStun(enemy) {
  const applied = applyStatus(enemy, {type: 'stun', power: 1, remaining: STUN, sourceId: 'stun-bite'});
  assert.equal(applied.ok, true);
  const status = enemy.statuses.find(item => item && item.type === 'stun');
  assert.ok(status, 'stun was not applied');
  assert.equal(Number.isFinite(status.remaining), true);
  assert.ok(status.remaining > STEP, `stun remaining ${status.remaining} is shorter than one step`);
  assert.ok(status.remaining <= STUN + 1e-9, `stun remaining ${status.remaining} exceeds ${STUN}`);
  assert.equal(isStunned(enemy), true);
  return status;
}

// Time that pays exactly one bite from the current cooldown, and no second bite.
function oneBiteDt(enemy) {
  const interval = enemy.attackInterval;
  const cooldown = Number.isFinite(enemy.attackCooldown) ? Math.max(0, enemy.attackCooldown) : 0;
  const slack = Math.min(STEP, interval * 0.5);
  if (cooldown <= 1e-9) return slack;
  return cooldown + slack;
}

for (const kind of KINDS) {
  test(`a living stun stops a ${kind} on the fence from biting, then one bite uses catalog damage`, () => {
    const state = fresh(`stun-bite-${kind}`);
    const enemy = plant(state, kind);
    const stopY = ARENA.fenceY - enemy.radius;
    assert.ok(Math.abs(enemy.y - stopY) <= 1e-6, `${kind} is not on the fence at ${enemy.y}`);

    const damage = catalogDamage(state, kind);
    const interval = ENEMIES[kind].attackInterval;
    assert.equal(enemy.damage, damage, kind);
    assert.equal(enemy.attackInterval, interval, kind);
    assert.ok(damage > 0, kind);
    assert.ok(interval > STEP, kind);

    const status = livingStun(enemy);
    const stunLeft = status.remaining;
    const ready = oneBiteDt(enemy);
    const combatDt = Math.min(stunLeft - STEP, Math.max(ready, Math.min(interval, stunLeft * 0.5)));
    assert.ok(combatDt > 0, kind);
    assert.ok(combatDt >= ready, `${kind} combat dt ${combatDt} is shorter than one bite`);
    assert.ok(combatDt < stunLeft, `${kind} combat dt ${combatDt} is not shorter than stun ${stunLeft}`);

    const startHp = state.fence.hp;
    const startMax = state.fence.maxHp;
    updateCombat(state, combatDt);

    assert.equal(state.fence.hp, startHp, kind);
    assert.equal(state.fence.maxHp, startMax, kind);
    assert.equal(state.stats.fenceDamage, 0, kind);
    assert.equal(isStunned(enemy), true, kind);
    assert.equal(status.remaining, stunLeft, kind);
    assert.equal(enemy.damage, damage, kind);
    assert.equal(enemy.attackInterval, interval, kind);
    assert.equal(enemy.dead, false, kind);
    assert.equal(state.phase, 'playing', kind);

    const maxFrames = Math.ceil(stunLeft / STEP) + 3;
    let frames = 0;
    for (; frames < maxFrames && isStunned(enemy); frames += 1) updateStatuses(state, STEP);
    assert.equal(isStunned(enemy), false, `${kind} stun still active after ${frames} status ticks`);
    assert.equal(
      enemy.statuses.some(item => item && item.type === 'stun' && item.remaining > 0),
      false,
    );
    assert.equal(enemy.damage, damage, kind);
    assert.equal(enemy.attackInterval, interval, kind);
    assert.equal(state.fence.hp, startHp, kind);
    assert.equal(state.stats.fenceDamage, 0, kind);

    const window = oneBiteDt(enemy);
    const cooldown = Number.isFinite(enemy.attackCooldown) ? Math.max(0, enemy.attackCooldown) : 0;
    assert.ok(window > 0, kind);
    assert.ok(window > cooldown - 1e-9, `${kind} bite window ${window} does not reach cooldown ${cooldown}`);
    assert.ok(window < cooldown + interval, `${kind} bite window ${window} covers a second bite`);
    updateCombat(state, window);

    assert.equal(startHp - state.fence.hp, damage, kind);
    assert.equal(state.stats.fenceDamage, damage, kind);
    assert.equal(state.fence.maxHp, startMax, kind);
    assert.ok(state.fence.hp > 0, kind);
    assert.equal(enemy.damage, damage, kind);
    assert.equal(enemy.attackInterval, interval, kind);
    assert.equal(enemy.dead, false, kind);
    assert.equal(state.phase, 'playing', kind);
  });
}
