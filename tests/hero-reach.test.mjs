import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {HERO_BASE, HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';

test('a new hero reaches farther, and Long Watch adds its full range', () => {
  assert.ok(HERO_BASE.range >= 420);
  const state = createRun({seed: 3, difficulty: 'normal', runId: 'hero-reach'});
  const hero = state.slots[2].unit;
  const before = getHeroStats(hero, state);
  assert.ok(before.range >= 420);
  assert.equal(applyHeroUpgrade(state, 'reach').ok, true);
  const after = getHeroStats(hero, state);
  assert.equal(after.range, before.range + HERO_UPGRADES.reach.effect.range);
  assert.ok(HERO_UPGRADES.reach.effect.range >= 36);
  assert.ok(HERO_UPGRADES.strike.effect.damageAdd >= 6);
  assert.ok(HERO_UPGRADES.cadence.effect.haste >= 0.12);
});
