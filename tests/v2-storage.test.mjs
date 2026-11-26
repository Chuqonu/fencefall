import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,createProfile} from '../src/state.js';
import {deployFieldUnit} from '../src/systems/field.js';
import {exportSave,importSave} from '../src/storage.js';
function memory() {
  const map=new Map();
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
test('v2 field, surge, cloud tick and targeting survive round-trip; zero tick is rejected',()=>{
  const profile=createProfile(),run=createRun({profile});
  deployFieldUnit(run,'bulwark',2);
  run.surge.thresholdsUsed=[0.5]; run.surge.charges=0;run.surge.shieldTimer=2;
  run.slots[2].unit.targeting='priority';
  run.clouds.push({id:'c91',kind:'miasma',sourceId:'u1',x:130,y:360,radius:62,remaining:2.1,duration:4,tick:0.5,tickTimer:0.24,dps:6});
  const save=exportSave(profile,run);
  const restored=importSave(save,memory());
  assert.equal(restored.ok,true);
  for (const k of ['energy','fieldSlots','fieldCooldowns','clouds','surge','slots']) assert.deepEqual(restored.run[k],run[k]);
  const bad=JSON.parse(save); bad.run.clouds[0].tick=0;
  assert.equal(importSave(JSON.stringify(bad),memory()).ok,false);
});
test('v1 owned and equipped items migrate together, preserving wallet, settings and ledger',()=>{
  const p=createProfile('zh'); p.version=1;delete p.permanent.economy;p.currency=87;
  p.equipmentOwned=['hawk_brace'];p.equipped.weapon='hawk_brace';p.settledRuns=['old-paid'];
  const restored=importSave(JSON.stringify({format:'fencefall-save',version:1,profile:p,run:{version:1}}),memory());
  assert.equal(restored.notice,'legacyRunReset'); assert.equal(restored.run,null);
  assert.equal(restored.profile.equipped.weapon,'kinetic_core');assert.deepEqual(restored.profile.equipmentOwned,['kinetic_core']);
  assert.equal(restored.profile.currency,87);assert.equal(restored.profile.settings.language,'zh');
  assert.deepEqual(restored.profile.settledRuns,['old-paid']);assert.equal(restored.profile.permanent.economy,0);
});
