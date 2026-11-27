// Thermobaric plus Armor Core: one shot burns the first enemy and the
// pierced enemy at one stack. A second shot refreshes that burn and does not
// raise stacks, burn dps, or the pierce count. The board keeps one hero.
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

function burnRows(enemy) {
  return (enemy.statuses || []).filter(status => status && status.type === 'burn');
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

function assertBurn(enemy, dps, sourceId, label) {
  const rows = burnRows(enemy);
  assert.equal(rows.length, 1, `${label} burn rows`);
  const status = rows[0];
  assert.equal(status.power, dps, `${label} burn dps`);
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
  assert.equal(projectile.effects.burn.dps, dps, 'burn dps on the shot');
  assert.equal(projectile.effects.burn.duration, 2.6, 'burn cap on the shot');
  holdFire(state);
  fly(state);
  const hits = state.events.filter(event => event.type === 'hit');
  assert.deepEqual(hits.map(event => event.attack), ['projectile', 'pierce']);
  return hits;
}

test('Flame Rounds and Armor Pierce burn the first enemy and the pierced enemy at one stack', () => {
  assert.equal(HERO_UPGRADES.shrapnel.name.en, 'Flame Rounds');
  assert.equal(HERO_UPGRADES.pierce.name.en, 'Armor Pierce');
  const shrapnel = HERO_UPGRADES.shrapnel.effect.burn;
  const pierceCount = HERO_UPGRADES.pierce.effect.pierce;
  assert.equal(shrapnel.duration, 2.6);
  assert.equal(pierceCount, 1);
  assert.equal(shrapnel.dps, 5);

  const state = createRun({seed: 41, difficulty: 'normal', runId: 'hero-pierce-burn'});
  const hero = state.slots[2].unit;
  assertOneHero(state, hero, 'start');

  assert.equal(applyHeroUpgrade(state, 'shrapnel').ok, true);
  assert.equal(applyHeroUpgrade(state, 'pierce').ok, true);
  assertOneHero(state, hero, 'after upgrades');
  assert.equal(hero.upgrades.shrapnel, 1);
  assert.equal(hero.upgrades.pierce, 1);

  const stats = getHeroStats(hero, state);
  const catalog = getUnitStats(hero, state);
  assert.equal(stats.burn.dps, shrapnel.dps);
  assert.equal(stats.burn.duration, shrapnel.duration);
  assert.equal(stats.burn.duration, 2.6);
  assert.equal(stats.pierce, pierceCount);
  assert.equal(catalog.burn.dps, shrapnel.dps);
  assert.equal(catalog.burn.duration, 2.6);
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

  const firstHits = shoot(state, hero, first.id, pierceCount, shrapnel.dps);
  assert.deepEqual(firstHits.map(event => event.targetId), [first.id, pierced.id]);
  assertBurn(first, shrapnel.dps, hero.id, 'first shot, first enemy');
  assertBurn(pierced, shrapnel.dps, hero.id, 'first shot, pierced enemy');

  const secondHits = shoot(state, hero, first.id, pierceCount, shrapnel.dps);
  assert.deepEqual(secondHits.map(event => event.targetId), [first.id, pierced.id]);
  assertBurn(first, shrapnel.dps, hero.id, 'second shot, first enemy');
  assertBurn(pierced, shrapnel.dps, hero.id, 'second shot, pierced enemy');

  assertOneHero(state, hero, 'after shots');
  const after = getHeroStats(hero, state);
  const afterCatalog = getUnitStats(hero, state);
  assert.equal(after.burn.dps, shrapnel.dps);
  assert.equal(after.burn.duration, 2.6);
  assert.equal(after.pierce, pierceCount);
  assert.equal(afterCatalog.burn.dps, shrapnel.dps);
  assert.equal(afterCatalog.burn.duration, 2.6);
  assert.equal(afterCatalog.pierce, pierceCount);
  assert.equal(state.enemies.length, 2);
  assert.equal(first.dead, false);
  assert.equal(pierced.dead, false);
});
