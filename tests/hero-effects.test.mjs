import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';
import {getUnitStats} from '../src/data/towers.js';

const STAT_LABEL = {
  damage: 'damage',
  interval: 'attack interval',
  range: 'range',
  critChance: 'crit chance',
  critMultiplier: 'crit multiplier',
  pierce: 'pierce',
  poison: 'poison'
};

function heroUnits(state) {
  return state.slots
    .filter(slot => slot.unit && (slot.unit.kind === 'hero' || slot.unit.type === 'hero'))
    .map(slot => slot.unit);
}

function namedStats(upgrade) {
  const effect = upgrade && upgrade.effect && typeof upgrade.effect === 'object' ? upgrade.effect : {};
  const named = [];
  if (Number(effect.damageAdd) > 0 || Number(effect.damage) > 0) named.push('damage');
  if (Number(effect.haste) > 0 || Number(effect.interval) > 0) named.push('interval');
  if (Number(effect.range) > 0) named.push('range');
  if (Number(effect.critChance) > 0) named.push('critChance');
  if (Number(effect.critMultiplier) > 0) named.push('critMultiplier');
  if (Number(effect.pierce) > 0) named.push('pierce');
  if (effect.poison && typeof effect.poison === 'object') named.push('poison');
  for (const stat of ['splash','fence','multishot','brittle']) if (effect[stat]) named.push(stat);
  return named;
}

function poisonValue(stats) {
  const poison = stats && stats.poison;
  if (!poison || typeof poison !== 'object') return 0;
  const dps = Number(poison.dps);
  const duration = Number(poison.duration);
  return (Number.isFinite(dps) ? dps : 0) + (Number.isFinite(duration) ? duration : 0);
}

function readStat(stats, name) {
  if (name === 'brittle') return stats.brittle?.power || 0;
  if (name === 'poison') return poisonValue(stats);
  const value = stats ? stats[name] : undefined;
  return Number.isFinite(value) ? value : 0;
}

function assertChanged(id, name, before, after) {
  const label = STAT_LABEL[name] || name;
  if (name === 'interval') {
    assert.ok(after < before, `${id} ${label} did not change (${before} -> ${after})`);
    return;
  }
  assert.ok(after > before, `${id} ${label} did not change (${before} -> ${after})`);
}

test('the hero upgrade catalog names combat stats', () => {
  const ids = Object.keys(HERO_UPGRADES);
  assert.ok(ids.length > 0, 'no hero upgrades');
  for (const id of ids) {
    const named = namedStats(HERO_UPGRADES[id]);
    assert.ok(
      named.length > 0,
      `${id} does not name damage, attack interval, range, crit chance, crit multiplier, pierce, or poison`
    );
  }
});

for (const id of Object.keys(HERO_UPGRADES)) {
  test(`hero upgrade ${id} changes its named stat and the hero stays one unit`, () => {
    const named = namedStats(HERO_UPGRADES[id]);
    assert.ok(
      named.length > 0,
      `${id} does not name damage, attack interval, range, crit chance, crit multiplier, pierce, or poison`
    );

    const state = createRun({seed: 13, difficulty: 'normal', runId: `hero-effect-${id}`});
    assert.equal(heroUnits(state).length, 1, `${id} starting hero`);
    assert.equal(state.slots.filter(slot => slot.unit).length, 1, `${id} starting unit`);
    const hero = heroUnits(state)[0];
    const heroId = hero.id;
    const beforeHero = getHeroStats(hero, state);
    const beforeUnit = getUnitStats(hero, state);

    const applied = applyHeroUpgrade(state, id);
    assert.equal(applied.ok, true, `${id} ${applied && applied.reason ? applied.reason : 'did not apply'}`);

    const heroes = heroUnits(state);
    assert.equal(heroes.length, 1, `${id} hero count`);
    assert.equal(state.slots.filter(slot => slot.unit).length, 1, `${id} unit count`);
    const still = heroes[0];
    assert.equal(still.id, heroId, `${id} hero id`);
    assert.equal(still.kind, 'hero', `${id} kind`);
    assert.equal(still.type, 'hero', `${id} type`);
    assert.equal(still.rank, 1, `${id} rank`);

    const afterHero = getHeroStats(still, state);
    const afterUnit = getUnitStats(still, state);
    for (const name of named) {
      assertChanged(id, name, readStat(beforeHero, name), readStat(afterHero, name));
      assertChanged(id, name, readStat(beforeUnit, name), readStat(afterUnit, name));
    }
  });
}
