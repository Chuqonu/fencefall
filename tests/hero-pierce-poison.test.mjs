// Barbed Quills plus Piercing Bolt: one shot poisons the first enemy and the
// pierced enemy at one stack. A second shot refreshes that poison and does not
// raise stacks, poison dps, or the pierce count. The board keeps one hero.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';
import {HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';

function heroes(state) {
  return state.slots
    .filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'))
    .map(slot => slot.unit);
}

function poisonRows(enemy) {
  return (enemy.statuses || []).filter(status => status && status.type === 'poison');
}

function assertOneHero(state, hero, label) {
  const units = heroes(state);
  assert.equal(units.length, 1, `${label} hero count`);
  assert.equal(units[0], hero, `${label} hero`);
  assert.equal(state.slots[2].unit, hero, `${label} slot`);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1, `${label} units`);
  assert.equal(hero.kind, 'hero', `${label} kind`);
  assert.equal(hero.type, 'hero', `${label} type`);
}

function assertPoison(enemy, dps, sourceId, label) {
  const rows = poisonRows(enemy);
  assert.equal(rows.length, 1, `${label} poison rows`);
  const status = rows[0];
  assert.equal(status.stacks, 1, `${label} stacks`);
  assert.equal(status.maxStacks, 1, `${label} maxStacks`);
  assert.equal(status.power, dps, `${label} poison dps`);
  assert.equal(status.sourceId, sourceId, `${label} source`);
  assert.ok(status.remaining > 0, `${label} remaining`);
}

function holdFire(state) {
  for (const slot of state.slots) {
    if (slot.unit) slot.unit.cooldown = 10;
  }
}

function fly(state) {
  for (let i = 0; i < 120 && state.projectiles.length > 0; i += 1) updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 0, 'projectile still in flight');
}

function shoot(state, hero, firstId, pierce, dps) {
  state.events = [];
  hero.cooldown = 0;
  updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 1, 'one hero shot');
  const projectile = state.projectiles[0];
  assert.equal(projectile.sourceId, hero.id);
  assert.equal(projectile.targetId, firstId);
  assert.equal(projectile.pierce, pierce, 'pierce count on the shot');
  assert.equal(projectile.effects.poison.dps, dps, 'poison dps on the shot');
  assert.equal(projectile.effects.poison.maxStacks, 1, 'poison cap on the shot');
  holdFire(state);
  fly(state);
  const hits = state.events.filter(event => event.type === 'hit');
  assert.deepEqual(hits.map(event => event.attack), ['projectile', 'pierce']);
  return hits;
}

test('Barbed Quills and Piercing Bolt poison the first enemy and the pierced enemy at one stack', () => {
  assert.equal(HERO_UPGRADES.barbed.name.en, 'Barbed Quills');
  assert.equal(HERO_UPGRADES.pierce.name.en, 'Piercing Bolt');
  const barbed = HERO_UPGRADES.barbed.effect.poison;
  const pierceCount = HERO_UPGRADES.pierce.effect.pierce;
  assert.equal(barbed.maxStacks, 1);
  assert.equal(pierceCount, 1);
  assert.equal(barbed.dps, 6);

  const state = createRun({seed: 41, difficulty: 'normal', runId: 'hero-pierce-poison'});
  const hero = state.slots[2].unit;
  assertOneHero(state, hero, 'start');

  assert.equal(applyHeroUpgrade(state, 'barbed').ok, true);
  assert.equal(applyHeroUpgrade(state, 'pierce').ok, true);
  assertOneHero(state, hero, 'after upgrades');
  assert.equal(hero.upgrades.barbed, 1);
  assert.equal(hero.upgrades.pierce, 1);

  const stats = getHeroStats(hero, state);
  const catalog = getUnitStats(hero, state);
  assert.equal(stats.poison.dps, barbed.dps);
  assert.equal(stats.poison.duration, barbed.duration);
  assert.equal(stats.poison.maxStacks, 1);
  assert.equal(stats.pierce, pierceCount);
  assert.equal(catalog.poison.dps, barbed.dps);
  assert.equal(catalog.poison.maxStacks, 1);
  assert.equal(catalog.pierce, pierceCount);

  const slot = state.slots[2];
  const first = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 160,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0,
    speed: 0,
    driftAmp: 0
  });
  const pierced = spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: first.y - 80,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0,
    speed: 0,
    driftAmp: 0
  });
  const reach = (enemy) => Math.hypot(slot.x - enemy.x, slot.y - enemy.y);
  assert.ok(reach(first) < reach(pierced), 'the hero aims at the nearer enemy');
  assert.ok(reach(first) <= stats.range && reach(pierced) <= stats.range, 'both enemies are in range');
  assert.equal(first.x, pierced.x, 'the pierced enemy stays on the shot line');

  const firstHits = shoot(state, hero, first.id, pierceCount, barbed.dps);
  assert.deepEqual(firstHits.map(event => event.targetId), [first.id, pierced.id]);
  assertPoison(first, barbed.dps, hero.id, 'first shot, first enemy');
  assertPoison(pierced, barbed.dps, hero.id, 'first shot, pierced enemy');

  const secondHits = shoot(state, hero, first.id, pierceCount, barbed.dps);
  assert.deepEqual(secondHits.map(event => event.targetId), [first.id, pierced.id]);
  assertPoison(first, barbed.dps, hero.id, 'second shot, first enemy');
  assertPoison(pierced, barbed.dps, hero.id, 'second shot, pierced enemy');

  assertOneHero(state, hero, 'after shots');
  const after = getHeroStats(hero, state);
  const afterCatalog = getUnitStats(hero, state);
  assert.equal(after.poison.dps, barbed.dps);
  assert.equal(after.poison.maxStacks, 1);
  assert.equal(after.pierce, pierceCount);
  assert.equal(afterCatalog.poison.dps, barbed.dps);
  assert.equal(afterCatalog.poison.maxStacks, 1);
  assert.equal(afterCatalog.pierce, pierceCount);
  assert.equal(state.enemies.length, 2);
  assert.equal(first.dead, false);
  assert.equal(pierced.dead, false);
});
