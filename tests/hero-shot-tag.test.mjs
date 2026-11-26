// A hero shot lists the hero tag before poison, burn, or slow so the field
// can color the body as the hero. A bolt tower shot is not a hero shot.
// The hero starts on slot 2. Damage, execute, and fence damage stay as they are.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP, createUnit} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {applyHeroUpgrade} from '../src/systems/hero.js';

const STATUS_TAGS = ['poison', 'burn', 'slow'];

function heroOnSlot2(state) {
  const hero = state.slots[2].unit;
  assert.ok(hero, 'the hero starts on slot 2');
  assert.equal(hero.kind, 'hero');
  assert.equal(hero.type, 'hero');
  assert.equal(state.slots.findIndex(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero')), 2);
  return hero;
}

function hold(state, exceptId) {
  for (const slot of state.slots) {
    if (!slot.unit) continue;
    slot.unit.cooldown = slot.unit.id === exceptId ? 0 : 600;
  }
}

function spawnInFront(state, slot) {
  return spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 108,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0,
    speed: 0,
    driftAmp: 0,
    attackCooldown: 30
  });
}

function fireOne(state, unit) {
  hold(state, unit.id);
  state.projectiles = [];
  state.events = [];
  updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 1, 'one shot');
  const projectile = state.projectiles[0];
  assert.equal(projectile.sourceId, unit.id);
  assert.ok(Array.isArray(projectile.tags));
  return projectile;
}

function assertHeroBeforeStatus(tags) {
  const heroAt = tags.indexOf('hero');
  assert.ok(heroAt >= 0, 'hero tag');
  assert.equal(tags[0], 'hero', 'hero is the first tag');
  assert.ok(tags.includes('poison'), 'poison tag');
  for (const status of STATUS_TAGS) {
    const at = tags.indexOf(status);
    if (at === -1) continue;
    assert.ok(heroAt < at, `hero before ${status}: ${tags.join(',')}`);
  }
}

test('a poisoned hero shot lists hero before poison', () => {
  const state = createRun({seed: 41, difficulty: 'normal', runId: 'hero-shot-tag'});
  const hero = heroOnSlot2(state);
  assert.equal(applyHeroUpgrade(state, 'barbed').ok, true);
  assert.equal(hero.upgrades.barbed, 1);
  assert.equal(state.slots[2].unit, hero);

  const enemy = spawnInFront(state, state.slots[2]);
  const projectile = fireOne(state, hero);
  assert.equal(projectile.targetId, enemy.id);
  assert.equal(projectile.towerType, 'hero');
  assert.ok(projectile.effects.poison && projectile.effects.poison.dps > 0, 'poison effect on the hero shot');
  assertHeroBeforeStatus(projectile.tags);
  assert.equal(state.slots[2].unit, hero);
});

test('a bolt tower shot is not tagged hero', () => {
  const state = createRun({seed: 42, difficulty: 'normal', runId: 'bolt-shot-tag'});
  const hero = heroOnSlot2(state);
  const slot = state.slots[0];
  assert.equal(slot.unit, null);
  const bolt = createUnit(state, 'bolt', 1, 'tower');
  slot.unit = bolt;
  assert.equal(bolt.type, 'bolt');
  assert.equal(bolt.kind, 'tower');

  const enemy = spawnInFront(state, slot);
  const projectile = fireOne(state, bolt);
  assert.equal(projectile.targetId, enemy.id);
  assert.equal(projectile.towerType, 'bolt');
  assert.equal(projectile.tags.includes('hero'), false);
  assert.equal(projectile.tags[0], 'bolt');
  assert.equal(state.slots[2].unit, hero);
  assert.equal(hero.kind, 'hero');
});
