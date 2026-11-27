import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {HERO_BASE, HERO_UPGRADES, applyHeroUpgrade, getHeroStats} from '../src/systems/hero.js';

test('split volley increases targets within the solo gunner range', () => {
  const state=createRun({seed:3}), hero=state.slots[2].unit;
  assert.equal(HERO_BASE.range,390);
  assert.equal(applyHeroUpgrade(state,'volley').ok,true);
  const stats=getHeroStats(hero,state);
  assert.equal(stats.range,390);
  assert.equal(stats.multishot,1);
  assert.equal(HERO_UPGRADES.strike.effect.damageAdd,10);
  assert.equal(HERO_UPGRADES.cadence.effect.haste,0.32);
});
