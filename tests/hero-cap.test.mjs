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
  if (name === 'poison') return poisonValue(stats);
  const value = stats ? stats[name] : undefined;
  return Number.isFinite(value) ? value : 0;
}

function assertSingleHero(state, id, heroId) {
  const heroes = heroUnits(state);
  assert.equal(heroes.length, 1, `${id} hero count`);
  assert.equal(state.slots.filter(slot => slot.unit).length, 1, `${id} unit count`);
  assert.equal(heroes[0].id, heroId, `${id} hero id`);
  assert.equal(heroes[0].kind, 'hero', `${id} kind`);
  assert.equal(heroes[0].type, 'hero', `${id} type`);
  assert.equal(heroes[0].rank, 1, `${id} rank`);
  return heroes[0];
}

for (const id of Object.keys(HERO_UPGRADES)) {
  test(`hero upgrade ${id} at its cap rejects another apply and keeps the stat`, () => {
    const spec = HERO_UPGRADES[id];
    const cap = spec.cap;
    assert.ok(Number.isInteger(cap) && cap >= 1, `${id} cap ${cap}`);
    const named = namedStats(spec);
    assert.ok(named.length > 0, `${id} names no combat stat`);

    const state = createRun({seed: 19, difficulty: 'normal', runId: `hero-cap-${id}`});
    const hero = assertSingleHero(state, id, heroUnits(state)[0].id);
    const heroId = hero.id;
    const openedHero = getHeroStats(hero, state);
    const openedUnit = getUnitStats(hero, state);

    for (let rank = 1; rank <= cap; rank += 1) {
      const applied = applyHeroUpgrade(state, id);
      assert.equal(applied.ok, true, `${id} rank ${rank} ${applied && applied.reason ? applied.reason : 'did not apply'}`);
      assert.equal(hero.upgrades[id], rank, `${id} stored rank`);
      assertSingleHero(state, id, heroId);
    }

    const atCapHero = getHeroStats(hero, state);
    const atCapUnit = getUnitStats(hero, state);
    for (const name of named) {
      const label = STAT_LABEL[name] || name;
      const opened = readStat(openedHero, name);
      const capped = readStat(atCapHero, name);
      if (name === 'interval') {
        assert.ok(capped < opened, `${id} ${label} at cap is ${capped}; opened at ${opened}`);
      } else {
        assert.ok(capped > opened, `${id} ${label} at cap is ${capped}; opened at ${opened}`);
      }
      const openedViaUnit = readStat(openedUnit, name);
      const cappedViaUnit = readStat(atCapUnit, name);
      if (name === 'interval') {
        assert.ok(cappedViaUnit < openedViaUnit, `${id} unit ${label} at cap is ${cappedViaUnit}; opened at ${openedViaUnit}`);
      } else {
        assert.ok(cappedViaUnit > openedViaUnit, `${id} unit ${label} at cap is ${cappedViaUnit}; opened at ${openedViaUnit}`);
      }
    }

    const level = hero.upgrades[id];
    const extra = applyHeroUpgrade(state, id);
    assert.equal(extra.ok, false, `${id} apply past cap succeeded`);
    assert.equal(extra.reason, 'upgrade_capped', `${id} reason`);
    assert.equal(hero.upgrades[id], level, `${id} stored level`);
    assert.equal(hero.upgrades[id], cap, `${id} cap level`);

    const afterHero = getHeroStats(hero, state);
    const afterUnit = getUnitStats(hero, state);
    for (const name of named) {
      const label = STAT_LABEL[name] || name;
      assert.equal(readStat(afterHero, name), readStat(atCapHero, name), `${id} ${label} changed after the capped apply`);
      assert.equal(readStat(afterUnit, name), readStat(atCapUnit, name), `${id} unit ${label} changed after the capped apply`);
    }
    assert.deepEqual(afterHero, atCapHero, `${id} hero stats`);
    assert.deepEqual(afterUnit, atCapUnit, `${id} unit stats`);
    assertSingleHero(state, id, heroId);
  });
}
