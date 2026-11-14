// Execute multiplies the hit that already includes it when the enemy's
// current health fraction is at or below EXECUTE_THRESHOLD. Above that
// fraction the same hit keeps its ordinary damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRun} from '../src/engine.js';
import {STEP, uid} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';

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

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${label}: ${actual} vs ${expected}`);
}

function fresh(name) {
  const state = createRun({
    seed: 41,
    difficulty: 'normal',
    runId: `execute-hit-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  });
  for (const slot of state.slots) {
    if (slot.unit) slot.unit.cooldown = 600;
  }
  return state;
}

function place(state, hp, maxHp = MAX_HP, x = 180, y = 220) {
  const enemy = spawnEnemy(state, 'shambler', {
    x,
    y,
    hp,
    maxHp,
    armor: 0,
    damage: 0,
    speed: 0,
    radius: 13,
    attackCooldown: 30
  });
  assert.equal(enemy.hp, hp);
  assert.equal(enemy.maxHp, maxHp);
  assert.equal(enemy.armor, 0);
  assert.equal(enemy.attacking, false);
  assert.ok(enemy.hp > BASE_DAMAGE * EXECUTE_MULTIPLIER, 'the body can show the full execute hit');
  enemy.statuses = [];
  return enemy;
}

function launch(state, enemy, fields = {}) {
  const projectile = {
    id: uid(state, 'p'),
    sourceId: state.slots[2].unit.id,
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
    mechanics: ['execute'],
    towerType: null,
    ...fields
  };
  state.projectiles = [projectile];
  state.events = [];
  state.stats.damage = 0;
  state.stats.crits = 0;
  return projectile;
}

function strike(name, hp, maxHp = MAX_HP, fields = {}) {
  const state = fresh(name);
  const enemy = place(state, hp, maxHp);
  const fraction = enemy.hp / enemy.maxHp;
  const projectile = launch(state, enemy, fields);
  const before = enemy.hp;
  const fenceHp = state.fence.hp;
  updateCombat(state, STEP);
  const hits = state.events.filter(event => event.type === 'hit' && event.targetId === enemy.id);
  assert.equal(hits.length, 1, name);
  assert.equal(hits[0].attack, 'projectile', name);
  assert.equal(hits[0].crit, !!projectile.crit, name);
  const dealt = before - enemy.hp;
  near(hits[0].damage, dealt, name);
  near(state.stats.damage, dealt, name);
  assert.equal(state.stats.crits, projectile.crit ? 1 : 0, name);
  assert.equal(enemy.dead, false, name);
  assert.equal(state.kills, 0, name);
  assert.equal(state.projectiles.length, 0, name);
  assert.equal(state.fence.hp, fenceHp, name);
  assert.equal((enemy.statuses || []).length, 0, name);
  return {dealt, fraction, projectile};
}

function expectDamage(fraction, fields) {
  let amount = Number.isFinite(fields.damage) ? fields.damage : BASE_DAMAGE;
  if (fields.crit) amount *= Math.max(1, Number.isFinite(fields.critMultiplier) ? fields.critMultiplier : 1);
  const mechanics = fields.mechanics || ['execute'];
  if (mechanics.includes('execute') && fraction <= EXECUTE_THRESHOLD) amount *= EXECUTE_MULTIPLIER;
  return amount;
}

test('execute uses the threshold and multiplier declared in combat', () => {
  assert.equal(EXECUTE_THRESHOLD, 0.4);
  assert.equal(EXECUTE_MULTIPLIER, 1.35);
  assert.ok(EXECUTE_THRESHOLD > 0 && EXECUTE_THRESHOLD < 1);
});

test('an execute hit is heavier at or below the health fraction and ordinary above it', () => {
  const rows = [
    {name: 'exactly the threshold', hp: 4000, maxHp: 10000, bonus: true},
    {name: 'exactly the threshold on another max health', hp: 200, maxHp: 500, bonus: true},
    {name: 'one health below the threshold', hp: 3999, maxHp: 10000, bonus: true},
    {name: 'well below the threshold', hp: 2000, maxHp: 10000, bonus: true},
    {name: 'one health above the threshold', hp: 4001, maxHp: 10000, bonus: false},
    {name: 'one health above the threshold on another max health', hp: 201, maxHp: 500, bonus: false},
    {name: 'full health', hp: 10000, maxHp: 10000, bonus: false},
    {name: 'exactly the threshold without execute', hp: 4000, maxHp: 10000, bonus: false, mechanics: []},
    {name: 'below the threshold without execute', hp: 200, maxHp: 500, bonus: false, mechanics: []},
    {name: 'execute listed after another mechanic at the threshold', hp: 4000, maxHp: 10000, bonus: true, mechanics: ['fence_focus', 'execute']},
    {name: 'execute listed after another mechanic above the threshold', hp: 10000, maxHp: 10000, bonus: false, mechanics: ['fence_focus', 'execute']}
  ];

  for (const row of rows) {
    const fraction = row.hp / row.maxHp;
    const mechanics = row.mechanics || ['execute'];
    const armed = mechanics.includes('execute') && fraction <= EXECUTE_THRESHOLD;
    assert.equal(armed, row.bonus, row.name);

    const fields = {mechanics};
    const shot = strike(row.name, row.hp, row.maxHp, fields);
    near(shot.fraction, fraction, row.name);
    near(shot.dealt, expectDamage(shot.fraction, fields), row.name);
    if (row.bonus) {
      assert.ok(shot.dealt > BASE_DAMAGE, row.name);
      near(shot.dealt, BASE_DAMAGE * EXECUTE_MULTIPLIER, row.name);
    } else {
      assert.equal(shot.dealt, BASE_DAMAGE, row.name);
    }
  }
});

test('execute still follows the threshold after a crit is included', () => {
  const fields = {crit: true, critMultiplier: 2, mechanics: ['execute']};
  const at = strike('crit at the threshold', 4000, 10000, fields);
  const above = strike('crit above the threshold', 4001, 10000, fields);
  const plain = strike('crit without execute', 4000, 10000, {crit: true, critMultiplier: 2, mechanics: []});

  assert.equal(at.fraction, EXECUTE_THRESHOLD);
  assert.ok(above.fraction > EXECUTE_THRESHOLD);
  assert.equal(plain.dealt, BASE_DAMAGE * 2);
  near(at.dealt, plain.dealt * EXECUTE_MULTIPLIER, 'crit at the threshold');
  assert.equal(above.dealt, plain.dealt, 'crit above the threshold');
  near(at.dealt, expectDamage(at.fraction, fields), 'crit formula at the threshold');
  near(above.dealt, expectDamage(above.fraction, fields), 'crit formula above the threshold');
});

test('one execute shot judges each enemy by its own health fraction', () => {
  const state = fresh('per-enemy');
  const primary = place(state, 10000, 10000, 180, 220);
  const weakened = place(state, 4000, 10000, 210, 220);
  const healthy = place(state, 10000, 10000, 150, 220);
  const splash = 48;
  assert.equal(weakened.hp / weakened.maxHp, EXECUTE_THRESHOLD);
  assert.ok(primary.hp / primary.maxHp > EXECUTE_THRESHOLD);
  assert.ok(healthy.hp / healthy.maxHp > EXECUTE_THRESHOLD);
  assert.ok(Math.hypot(weakened.x - primary.x, weakened.y - primary.y) <= splash);
  assert.ok(Math.hypot(healthy.x - primary.x, healthy.y - primary.y) <= splash);

  const before = new Map(state.enemies.map(enemy => [enemy.id, enemy.hp]));
  launch(state, primary, {splash, mechanics: ['execute']});
  updateCombat(state, STEP);

  const hits = state.events.filter(event => event.type === 'hit');
  assert.deepEqual(hits.map(event => event.targetId), [primary.id, weakened.id, healthy.id]);
  assert.deepEqual(hits.map(event => event.attack), ['projectile', 'splash', 'splash']);
  assert.equal(before.get(primary.id) - primary.hp, BASE_DAMAGE);
  near(before.get(weakened.id) - weakened.hp, BASE_DAMAGE * EXECUTE_MULTIPLIER, 'weakened splash');
  assert.equal(before.get(healthy.id) - healthy.hp, BASE_DAMAGE);
  assert.equal(weakened.dead, false);
  assert.equal(state.kills, 0);
  assert.equal(state.projectiles.length, 0);
});
