import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {getUnitStats} from '../src/data/towers.js';
import {RECIPES} from '../src/data/recipes.js';
import {mergeUnits} from '../src/systems/merges.js';
import {encounterPower} from './encounter-power.mjs';

for (const recipe of RECIPES) test(recipe.id+' outperforms both parents and accepts either parent in both directions',()=>{
  const state = createRun();
  const [a,b] = recipe.parents;
  state.slots[0].unit = createUnit(state,a);
  state.slots[1].unit = createUnit(state,b);
  const parents = state.slots.slice(0,2).reduce((sum,s)=>sum+encounterPower(getUnitStats(s.unit)),0);
  const hybrid = mergeUnits(state,0,1).unit;
  assert.equal(hybrid.type,recipe.id);
  assert.ok(encounterPower(getUnitStats(hybrid)) >= 1.25*parents,recipe.id);
  for (const parent of recipe.parents) for (const source of [0,1]) {
    state.slots[0].unit = createUnit(state,parent);
    state.slots[1].unit = hybrid;
    const result = mergeUnits(state,source,1-source);
    assert.equal(result.unit.type,recipe.id);
    assert.equal(result.unit.rank,2);
    assert.equal(state.slots[source].unit,null);
  }
});
