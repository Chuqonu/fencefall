// An execute projectile marks the hit only when impact damage applies the
// existing multiplier. The same shot above the threshold, a shot without
// execute, and a plain damageEnemy call all record execute false.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRun} from '../src/engine.js';
import {STEP, uid} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {damageEnemy, updateCombat} from '../src/systems/combat.js';

const combatSource = readFileSync(
  fileURLToPath(new URL('../src/systems/combat.js', import.meta.url)),
  'utf8'
);

function readConst(name) {
  const matched = combatSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9]*\\.?[0-9]+)\\s*;`, 'g'));
  assert.ok(matched && matched.length === 1, `${name} is declared once in combat.js`);
  const value = Number(matched[0].replace(/.*=\s*/, '').replace(';', ''));
  assert.equal(Number.isFinite(value), true, name);
  return value;
}

const EXECUTE_THRESHOLD = readConst('EXECUTE_THRESHOLD');
const EXECUTE_MULTIPLIER = readConst('EXECUTE_MULTIPLIER');
const MAX_HP = 10000;
const BASE_DAMAGE = 80;
const ARMOR = 0;

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${label}: ${actual} vs ${expected}`);
}

function fresh(name) {
  const state = createRun({
    seed: 41,
    difficulty: 'normal',
    runId: `execute-flag-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  });
  const hero = state.slots[2].unit;
  assert.ok(hero, 'the hero starts on slot 2');
  assert.equal(hero.kind, 'hero');
  assert.equal(hero.type, 'hero');
  assert.equal(state.slots.findIndex(slot => slot.unit?.id === hero.id), 2);
  for (const slot of state.slots) {
    if (slot.unit) slot.unit.cooldown = 600;
  }
  return state;
}

function place(state, hp, maxHp = MAX_HP) {
  const enemy = spawnEnemy(state, 'shambler', {
    x: 180,
    y: 220,
    hp,
    maxHp,
    armor: ARMOR,
    damage: 0,
    speed: 0,
    radius: 13,
    attackCooldown: 30
  });
  assert.equal(enemy.hp, hp);
  assert.equal(enemy.maxHp, maxHp);
  assert.equal(enemy.armor, ARMOR);
  enemy.statuses = [];
  return enemy;
}

function launch(state, enemy, mechanics) {
  const hero = state.slots[2].unit;
  const projectile = {
    id: uid(state, 'p'),
    sourceId: hero.id,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y + 36,
    speed: 2400,
    damage: BASE_DAMAGE,
    crit: false,
    critMultiplier: 1,
    critChance: 0,
    tags: [],
    splash: 0,
    chain: 0,
    chainRange: 70,
    pierce: 0,
    visited: [],
    life: 3,
    dirx: 0,
    diry: -1,
    aimx: enemy.x,
    aimy: enemy.y,
    impactType: null,
    effects: {},
    mechanics,
    towerType: null
  };
  state.projectiles = [projectile];
  state.events = [];
  state.stats.damage = 0;
  return projectile;
}

function strike(name, hp, mechanics) {
  const state = fresh(name);
  const enemy = place(state, hp);
  const hero = state.slots[2].unit;
  const before = enemy.hp;
  const fenceHp = state.fence.hp;
  launch(state, enemy, mechanics);
  updateCombat(state, STEP);
  const hits = state.events.filter(event => event.type === 'hit' && event.targetId === enemy.id);
  assert.equal(hits.length, 1, name);
  assert.equal(hits[0].attack, 'projectile', name);
  assert.equal(hits[0].sourceId, hero.id, name);
  assert.equal(typeof hits[0].execute, 'boolean', name);
  const dealt = before - enemy.hp;
  near(hits[0].damage, dealt, name);
  near(state.stats.damage, dealt, name);
  assert.equal(enemy.dead, false, name);
  assert.equal(state.fence.hp, fenceHp, name);
  assert.equal(state.slots[2].unit.id, hero.id, name);
  return {dealt, hit: hits[0]};
}

test('execute flag uses the current threshold and multiplier', () => {
  assert.equal(EXECUTE_THRESHOLD, 0.4);
  assert.equal(EXECUTE_MULTIPLIER, 1.35);
});

test('an execute projectile at the health threshold records execute true after armor', () => {
  const hp = 4000;
  const shot = strike('at the threshold', hp, ['execute']);
  assert.equal(hp / MAX_HP, EXECUTE_THRESHOLD);
  assert.equal(shot.hit.execute, true);
  near(shot.dealt, BASE_DAMAGE * EXECUTE_MULTIPLIER * (1 - ARMOR), 'execute damage after armor');
  assert.ok(shot.dealt > BASE_DAMAGE);
});

test('the same execute shot above the threshold records execute false', () => {
  const hp = 4001;
  const shot = strike('above the threshold', hp, ['execute']);
  assert.ok(hp / MAX_HP > EXECUTE_THRESHOLD);
  assert.equal(shot.hit.execute, false);
  assert.equal(shot.dealt, BASE_DAMAGE * (1 - ARMOR));
});

test('a non-execute projectile at low hp records execute false', () => {
  const shot = strike('low hp without execute', 4000, []);
  assert.equal(4000 / MAX_HP, EXECUTE_THRESHOLD);
  assert.equal(shot.hit.execute, false);
  assert.equal(shot.dealt, BASE_DAMAGE * (1 - ARMOR));
});

test('a plain damageEnemy call stays execute false', () => {
  const state = fresh('plain damage');
  const enemy = place(state, 4000);
  const hero = state.slots[2].unit;
  const before = enemy.hp;
  state.events = [];
  const dealt = damageEnemy(state, enemy, BASE_DAMAGE, {
    sourceId: hero.id,
    type: 'poison',
    crit: false,
    dot: true
  });
  const hits = state.events.filter(event => event.type === 'hit');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].execute, false);
  assert.equal(hits[0].sourceId, hero.id);
  assert.equal(dealt, BASE_DAMAGE * (1 - ARMOR));
  assert.equal(before - enemy.hp, dealt);
});
