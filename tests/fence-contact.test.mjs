// Contact lock: fence HP changes only after an enemy reaches the fence.
// The stop line is center y = fenceY - radius. Two pixels short of that line
// is still short of contact, including the combat module's sub-pixel slop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, step} from '../src/engine.js';
import {ARENA, STEP, createUnit} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy, updateMovement} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';

const KINDS = Object.keys(ENEMIES);
const SHORTFALL = 2;
const APPROACH = 24;
const PROBE_HP = 80;
const BITE = 12;
const HEALTH_KEYS = ['hp', 'health', 'maxHp', 'durability', 'shield'];
const POSITIONS = [
  {x: 36, name: 'tower column'},
  {x: 200, name: 'between columns'},
];

function stopY(enemy) {
  return ARENA.fenceY - enemy.radius;
}

function fresh(runId) {
  const state = createRun({seed: 21, runId, difficulty: 'normal'});
  state.slots[0].unit = createUnit(state, 'bolt');
  return state;
}

function defenders(state) {
  return state.slots.map(slot => slot.unit).filter(Boolean);
}

function assertNoDefenderHealth(state, label) {
  const units = defenders(state);
  assert.equal(units.filter(unit => unit.kind === 'hero').length, 1, label);
  assert.ok(units.some(unit => unit.kind === 'tower' && unit.type === 'bolt'), label);
  for (const unit of units) {
    for (const key of HEALTH_KEYS) {
      assert.equal(Object.hasOwn(unit, key), false, `${label}: ${unit.kind} has ${key}`);
    }
  }
}

function stampDefenders(state, hp) {
  for (const unit of defenders(state)) {
    unit.hp = hp;
    unit.maxHp = hp;
  }
}

function assertProbe(state, hp, label) {
  const units = defenders(state);
  assert.ok(units.length >= 2, label);
  for (const unit of units) {
    assert.equal(unit.hp, hp, `${label}: ${unit.kind} hp`);
    assert.equal(unit.maxHp, hp, `${label}: ${unit.kind} maxHp`);
    assert.equal(unit.dead, undefined, label);
  }
  assert.equal(state.slots[7].unit.kind, 'hero', label);
  assert.equal(state.slots[0].unit.kind, 'tower', label);
  assert.equal(state.slots[0].unit.type, 'bolt', label);
}

function summon(state, kind, x) {
  const enemy = spawnEnemy(state, kind, {
    x,
    y: 0,
    hp: 1e7,
    maxHp: 1e7,
    damage: BITE,
    attackInterval: 0.35,
    attackCooldown: 0,
    armor: 0,
    speed: 0,
    driftAmp: 0,
    driftVelocity: 0,
  });
  enemy.attackCooldown = 0;
  enemy.damage = BITE;
  enemy.attacking = true;
  enemy.driftAmp = 0;
  enemy.driftVelocity = 0;
  return enemy;
}

function play(state, steps, mode, enemy) {
  for (let i = 0; i < steps; i += 1) {
    if (mode === 'engine') {
      step(state);
    } else if (mode === 'combat') {
      updateCombat(state, STEP);
    } else {
      updateMovement(state, STEP);
      if (enemy) enemy.attacking = true;
      updateCombat(state, STEP);
    }
  }
}

test('an enemy that has not reached the fence does not reduce fence HP', () => {
  assert.ok(POSITIONS.some(position => position.x === 200));
  assert.ok([36, 108, 180, 252, 324].every(column => Math.abs(column - 200) >= 20));
  for (const mode of ['combat', 'movement', 'engine']) {
    for (const position of POSITIONS) {
      for (const kind of KINDS) {
        const label = `${mode} ${kind} ${position.name}`;
        const state = fresh(`short-${mode}-${kind}-${position.x}`);
        assertNoDefenderHealth(state, label);
        stampDefenders(state, PROBE_HP);
        const enemy = summon(state, kind, position.x);
        enemy.y = stopY(enemy) - SHORTFALL;
        enemy.speed = 0;
        const startHp = state.fence.hp;
        const startMax = state.fence.maxHp;
        const steps = mode === 'combat' ? 120 : Math.round(2 / STEP);
        play(state, steps, mode, enemy);
        assert.equal(state.fence.hp, startHp, label);
        assert.equal(state.fence.maxHp, startMax, label);
        assert.equal(state.stats.fenceDamage, 0, label);
        assert.equal(state.phase, 'playing', label);
        assert.ok(enemy.y <= stopY(enemy) - 1.5, `${label} advanced to ${enemy.y}`);
        assert.ok(enemy.hp > 1e6, `${label} hp ${enemy.hp}`);
        assert.equal(enemy.dead, false, label);
        assertProbe(state, PROBE_HP, label);
      }
    }
  }
});

test('the shared fence loses HP only after an enemy reaches it', () => {
  for (const mode of ['movement', 'engine']) {
    for (const position of POSITIONS) {
      for (const kind of KINDS) {
        const label = `${mode} ${kind} ${position.name}`;
        const state = fresh(`walk-${mode}-${kind}-${position.x}`);
        stampDefenders(state, PROBE_HP);
        const enemy = summon(state, kind, position.x);
        enemy.y = stopY(enemy) - APPROACH;
        enemy.speed = 120;
        const startHp = state.fence.hp;
        let sawGap = false;
        let sawHit = false;
        const limit = Math.round(2 / STEP);
        for (let i = 0; i < limit; i += 1) {
          const before = state.fence.hp;
          if (mode === 'engine') step(state);
          else {
            updateMovement(state, STEP);
            updateCombat(state, STEP);
          }
          assert.ok(enemy.y <= stopY(enemy) + 1e-4, `${label} crossed the fence at ${enemy.y}`);
          assert.ok(enemy.y < ARENA.frontY, label);
          assertProbe(state, PROBE_HP, label);
          if (enemy.y < stopY(enemy) - 1e-6) {
            sawGap = true;
            assert.equal(state.fence.hp, before, label);
            assert.equal(state.fence.hp, startHp, label);
            assert.equal(state.stats.fenceDamage, 0, label);
          } else if (state.fence.hp < startHp) {
            sawHit = true;
            assert.equal(startHp - state.fence.hp, enemy.damage, label);
            assert.equal(state.stats.fenceDamage, enemy.damage, label);
            break;
          }
        }
        assert.equal(sawGap, true, label);
        assert.equal(sawHit, true, label);
        assert.ok(state.fence.hp > 0, label);
        assert.equal(state.fence.maxHp, startHp, label);
        assert.equal(enemy.dead, false, label);
      }
    }
  }
});

test('a contacting enemy bites the shared fence and defenders still have no HP', () => {
  for (const kind of KINDS) {
    const label = `plant ${kind}`;
    const state = fresh(`plant-${kind}`);
    assertNoDefenderHealth(state, label);
    const enemy = summon(state, kind, 200);
    enemy.y = ARENA.fenceY + 30;
    enemy.speed = 40;
    const startHp = state.fence.hp;
    step(state);
    assert.ok(Math.abs(enemy.y - stopY(enemy)) <= 1e-4, `${label} y ${enemy.y}`);
    assert.ok(enemy.y < state.slots[0].y, label);
    assert.equal(startHp - state.fence.hp, enemy.damage, label);
    assert.equal(state.stats.fenceDamage, enemy.damage, label);
    assert.equal(state.fence.maxHp, startHp, label);
    assert.ok(state.fence.hp > 0, label);
    assert.equal(state.phase, 'playing', label);
    assertNoDefenderHealth(state, label);
    assert.equal(state.slots[7].unit.kind, 'hero', label);
    assert.equal(state.slots[0].unit.id.startsWith('u'), true, label);

    stampDefenders(state, PROBE_HP);
    const bitten = state.fence.hp;
    play(state, Math.round(1.5 / STEP), 'engine', enemy);
    assert.ok(state.fence.hp < bitten, label);
    assert.ok(state.fence.hp > 0, label);
    assert.equal(state.stats.fenceDamage, startHp - state.fence.hp, label);
    assertProbe(state, PROBE_HP, label);
    assert.ok(enemy.y <= stopY(enemy) + 1e-4, label);
  }
});

test('an enemy bolt reduces fence HP only after it reaches the fence', () => {
  const state = fresh('enemy-bolt');
  stampDefenders(state, PROBE_HP);
  const gap = 48;
  const speed = 120;
  const damage = 25;
  const startHp = state.fence.hp;
  state.projectiles.push({
    id: 'enemy-bolt',
    team: 'enemy',
    friendly: false,
    sourceId: 'e-bolt',
    enemyKind: 'spitter',
    x: 200,
    y: ARENA.fenceY - gap,
    dirx: 0,
    diry: 1,
    speed,
    damage,
    life: 3,
  });
  const stepDistance = speed * STEP;
  const safeSteps = Math.floor((gap - 8) / stepDistance);
  assert.ok(safeSteps >= 8);
  play(state, safeSteps, 'engine');
  const bolt = state.projectiles.find(projectile => projectile.id === 'enemy-bolt');
  assert.ok(bolt, 'bolt vanished before the fence');
  assert.ok(bolt.y < ARENA.fenceY, `bolt y ${bolt.y}`);
  assert.equal(state.fence.hp, startHp);
  assert.equal(state.stats.fenceDamage, 0);
  assertProbe(state, PROBE_HP, 'bolt approach');

  const arriveSteps = Math.ceil((gap + 4) / stepDistance);
  for (let i = 0; i < arriveSteps && state.fence.hp === startHp; i += 1) step(state);
  assert.equal(state.fence.hp, startHp - damage);
  assert.equal(state.stats.fenceDamage, damage);
  assert.equal(state.projectiles.some(projectile => projectile.id === 'enemy-bolt'), false);
  assertProbe(state, PROBE_HP, 'bolt impact');
  step(state);
  assert.equal(state.fence.hp, startHp - damage);
  assert.equal(state.stats.fenceDamage, damage);
  assertProbe(state, PROBE_HP, 'bolt settled');
  assert.equal(state.phase, 'playing');
});
