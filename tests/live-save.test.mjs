import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP, ARENA} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {applyStatus, updateStatuses} from '../src/systems/status.js';
import {damageEnemy, updateCombat} from '../src/systems/combat.js';
import {exportSave, importSave} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}

test('poison and burning remain saveable at every fixed-step cadence boundary', () => {
  const profile = createProfile();
  const state = createRun({seed:12, profile, runId:'live-status-save'});
  const enemy = spawnEnemy(state, 'brute', {x:180, y:300});
  for (const type of ['poison','burn']) {
    applyStatus(enemy, {type,power:3.6,remaining:4,sourceId:state.slots[7].unit.id,stacks:1,tickTimer:0});
  }
  const store = memoryStorage();
  for (let i=0;i<239;i++) {
    updateStatuses(state, STEP, damageEnemy);
    for (const status of enemy.statuses) assert.ok(status.tickTimer>=0, `${status.type} at frame ${i}`);
    const text = exportSave(profile,state);
    assert.equal(importSave(text,store).ok,true,`round trip at frame ${i}`);
  }
});

test('live offscreen piercing shots round-trip until combat removes them', () => {
  const profile = createProfile();
  const state = createRun({seed:17, profile, runId:'live-projectile-save'});
  state.slots[7].unit.upgrades.pierce = 2;
  spawnEnemy(state,'brute',{x:14,y:ARENA.fenceY-14});
  const store = memoryStorage();
  let offscreen = null;
  for (let i=0;i<220;i++) {
    updateCombat(state,STEP);
    state.time += STEP;
    state.tick += 1;
    const text=exportSave(profile,state);
    assert.equal(importSave(text,store).ok,true,`projectile frame ${i}`);
    if (state.projectiles.some(p=>p.x < -80 || p.x > ARENA.width+80)) offscreen=JSON.parse(text);
  }
  assert.ok(offscreen,'a real piercing projectile crossed the old save boundary');
  offscreen.run.projectiles[0].x=-101;
  assert.equal(importSave(JSON.stringify(offscreen),store).ok,false,'out-of-bounds imports still fail');
});
