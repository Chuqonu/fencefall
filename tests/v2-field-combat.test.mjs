import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {ARENA,STEP,createUnit,fieldSlotGeometry,hitFieldSlot} from '../src/shared.js';
import {updateField,deployFieldUnit,removeFieldUnit} from '../src/systems/field.js';
import {spawnEnemy,updateMovement} from '../src/systems/movement.js';
import {updateCombat,damageEnemy,selectTarget,setTargeting} from '../src/systems/combat.js';
import {updateDrafts,rerollDraft} from '../src/systems/drafts.js';
import {updateStatuses,applyStatus} from '../src/systems/status.js';
import {applyHeroUpgrade} from '../src/systems/hero.js';
import {ACTIONS} from '../src/boot.js';

function board() {
  const s=createRun({seed:17});s.energy=500;s.slots[2].unit.cooldown=500;return s;
}
function ticks(s,n) {
  for(let i=0;i<n;i++) {
    updateField(s,STEP,damageEnemy);updateMovement(s,STEP);
    updateStatuses(s,STEP,damageEnemy);updateCombat(s,STEP);
  }
}
const enemy=(s,kind,x,y,opts={})=>spawnEnemy(s,kind,{x,y,hp:800,maxHp:800,driftAmp:0,...opts});
test('ten pads build with separate costs and cooldowns, block melee, reflect and refund remaining durability',()=>{
  const s=board();
  for(let i=0;i<10;i++) {const p=fieldSlotGeometry(i);assert.equal(hitFieldSlot(p.x,p.y),i);}
  assert.equal(deployFieldUnit(s,'bulwark',7).ok,true);
  assert.equal(deployFieldUnit(s,'bulwark',8).ok,false);
  const pad=s.fieldSlots[7],e=enemy(s,'shambler',pad.x,pad.top-14);
  ticks(s,8);
  assert.equal(e.blockedByFieldId,pad.unit.id);assert.ok(e.hp<800);assert.ok(pad.unit.hp<300);
  const refund=Math.floor(35*0.5*pad.unit.hp/300);
  assert.equal(removeFieldUnit(s,7).refund,refund);assert.equal(e.blockedByFieldId,null);
});
test('a jumping leaper collides with the outer bulwark and is stunned for 1.2 seconds',()=>{
  const s=board();deployFieldUnit(s,'bulwark',7);
  const e=enemy(s,'leaper',180,330);e.leapTimer=STEP/2;ticks(s,1);
  assert.equal(e.hp,775);assert.equal(e.statuses.find(b=>b.type==='stun').remaining,1.2);
  assert.equal(e.blockedByFieldId,s.fieldSlots[7].unit.id);
});
test('spitter stands off, launches acid and a wall intercepts it before fence contact',()=>{
  for(const wall of [false,true]) {
    const s=board();if(wall)deployFieldUnit(s,'bulwark',7);
    const e=enemy(s,'spitter',180,376);const hp=s.fence.hp;
    ticks(s,5);assert.equal(e.y,377);assert.ok(s.projectiles.some(p=>p.team==='enemy'));
    ticks(s,55);
    if(wall){assert.ok(s.fieldSlots[7].unit.hp<300);assert.equal(s.fence.hp,hp);}
    else assert.ok(s.fence.hp<hp);
  }
});
test('a charge detonates on its blocking wall',()=>{
  const s=board();deployFieldUnit(s,'bulwark',7);
  const e=enemy(s,'charge',180,382);const hp=s.fence.hp;ticks(s,130);
  assert.ok(e.dead);assert.ok(s.fieldSlots[7].unit.hp<300);assert.equal(s.fence.hp,hp);
});
test('spikes damage a closed shade, flare reveals and applies brittle and slow',()=>{
  const s=board();deployFieldUnit(s,'spikes',7);
  const e=enemy(s,'shade',180,414);e.phased=true;e.phaseClock=4;
  updateField(s,STEP,damageEnemy);assert.equal(e.hp,800-14*0.6);assert.equal(s.fieldSlots[7].unit.hp,158.5);
  assert.equal(selectTarget(s,{x:180,y:560},320),null);
  deployFieldUnit(s,'flare',2);updateField(s,STEP,damageEnemy);
  assert.equal(selectTarget(s,{x:180,y:560},320).id,e.id);
  assert.ok(e.statuses.some(b=>b.type==='brittle'));assert.ok(e.statuses.some(b=>b.type==='slow'));
});
test('harvest income, exact rear premium and rank 2 repair use simulation time',()=>{
  for(const index of [0,5]) for(const rank of [1,2]) {
    const s=board();deployFieldUnit(s,'bulwark',7);s.fieldSlots[7].unit.hp=50;
    const u=s.slots[index].unit=createUnit(s,'harvest',rank);
    const interval=rank===1?5:4.6;const factor=index===5?1.3:1;
    ticks(s,Math.round(60*interval));
    const crop=s.events.find(e=>e.type==='energy_gain'&&e.source==='harvest');
    assert.equal(crop.amount,(rank===1?12:26)*factor);assert.equal(s.xp,(rank===1?2:5)*factor);
    assert.equal(s.fieldSlots[7].unit.hp,rank===1?50:70);
    assert.ok(!s.events.some(e=>e.type==='shot'&&e.sourceId===u.id));
  }
});
test('four target modes send real shots at their intended target',()=>{
  for (const [mode,which] of [['foremost',0],['priority',1],['strongest',2],['weakest',3]]) {
    const s=board(),hero=s.slots[2].unit;
    const foes=[enemy(s,'shambler',180,480),enemy(s,'banner',170,400),enemy(s,'brute',190,430,{hp:1000,maxHp:1000}),enemy(s,'shambler',160,380,{hp:2})];
    setTargeting(s,2,mode);hero.cooldown=0;updateCombat(s,STEP);
    assert.equal(s.events.find(e=>e.type==='shot').targetId,foes[which].id);
  }
});
test('automatic threshold and lethal surges protect the fence, sweep, stun, knock back and spend a charge',()=>{
  assert.ok(!ACTIONS.includes('fenceSurge'));
  for(const lethal of [false,true]) {
    const s=board();s.fence.hp=lethal?1:301;
    const e=enemy(s,'shambler',180,499,{damage:10});updateCombat(s,STEP);
    assert.equal(s.surge.charges,0);assert.equal(s.surge.shieldTimer,3);
    assert.equal(s.fence.hp,lethal?72:291);assert.ok(e.y<400 && e.statuses.some(b=>b.type==='stun'));
    enemy(s,'runner',180,501,{damage:200});const hp=s.fence.hp;ticks(s,150);assert.equal(s.fence.hp,hp);
  }
});
test('rerolls cost 20, 35, 50 and use deterministic RNG, fourth attempt is atomic',()=>{
  function run(){
    const s=board();s.xp=10;updateDrafts(s);
    const cards=[];
    for(const cost of [20,35,50]) {const before=s.energy;assert.equal(rerollDraft(s).ok,true);assert.equal(before-s.energy,cost);cards.push(s.draft.options);}
    const before=JSON.stringify(s);assert.equal(rerollDraft(s).ok,false);assert.equal(JSON.stringify(s),before);
    return [cards,s.rng];
  }
  assert.deepEqual(run(),run());
});
function fire(type,prep) {
  const s=board(),slot=s.slots[1];slot.unit=createUnit(s,type,1,'hybrid');
  const e=enemy(s,'shambler',slot.x,482,{speed:0});prep?.(s,e,slot);
  updateCombat(s,STEP);slot.unit.cooldown=500;
  for(let i=0;i<24;i++)updateCombat(s,STEP);
  return {s,e,slot};
}
test('steam and catalyst scale damage using the target status before impact',()=>{
  for(const [type,status,reaction,factor] of [['scald','slow','steam',1.45],['catalyst','poison','catalyst',1.18]]) {
    const {s}=fire(type,(_s,e)=>applyStatus(e,{type:status,power:status==='slow'?0.7:1,remaining:2,sourceId:'test'}));
    const hit=s.events.find(e=>e.type==='hit'&&e.reaction===reaction);
    assert.ok(Math.abs(hit.damage-(type==='scald'?18:15)*factor)<1e-8);
  }
});
test('marked death explodes once, cloud ticks through phase, focus buffs near-fence hits, and armor penetration reduces blocked damage',()=>{
  const {s}=fire('blight',(s,e,slot)=>{e.hp=8;enemy(s,'shambler',slot.x+30,480);});
  assert.equal(s.events.filter(e=>e.type==='corpse_explode').length,1);
  const m=fire('miasma');assert.equal(m.s.clouds.length,1);m.e.phased=true;const hp=m.e.hp;
  for(let i=0;i<60;i++)updateCombat(m.s,STEP);
  assert.ok(m.e.hp<hp);assert.ok(m.e.statuses.some(s=>s.type==='poison'));
  const g=fire('glacierward');
  assert.equal(g.s.events.find(e=>e.type==='hit').damage,15*1.1*1.25);
  assert.ok(g.s.events.some(e=>e.type==='knockback'));
  const c=fire('cinderbolt',(_,e)=>{e.armor=0.5;});
  assert.ok(Math.abs(c.s.events.find(e=>e.type==='hit').armorBlocked-22*0.5*0.55)<1e-7);
});
test('hero volley fires three directed shots and focus unlocks execute',()=>{
  const s=board();for(const id of ['volley','volley','focus','focus'])applyHeroUpgrade(s,id);
  const h=s.slots[2].unit;h.cooldown=0;
  for (const x of [135,180,225]) enemy(s,'shambler',x,490,{hp:200,maxHp:1000});
  updateCombat(s,STEP);h.cooldown=500;ticks(s,24);
  const shots=s.events.filter(e=>e.type==='shot');
  assert.equal(new Set(shots.map(e=>e.targetId)).size,3);
  assert.ok(shots.every(e=>Number.isFinite(e.targetX)&&Number.isFinite(e.targetY)));
  assert.ok(s.events.some(e=>e.type==='hit'&&e.execute));
});

test('economy, field durability, enemy shots and surge use the same timeline at all four speeds',async()=>{
  const {advance,setSpeed}=await import('../src/engine.js');
  function encounter(speed) {
    const s=board();
    s.nextDraftXp=10000;
    s.slots[7].unit=createUnit(s,'harvest',2);
    deployFieldUnit(s,'bulwark',2);
    enemy(s,'spitter',72,377);
    enemy(s,'runner',180,335);
    s.surge.cooldown=8;
    setSpeed(s,speed);
    for(let frame=0;frame<600/speed;frame++) advance(s,STEP);
    assert.equal(s.tick,600);
    return [s.energy,s.xp,s.fence,s.fieldSlots,s.surge,s.enemies,s.projectiles,s.slots,s.rng];
  }
  const baseline=encounter(1);
  for(const speed of [1.5,3,10]) assert.deepEqual(encounter(speed),baseline);
});

test('an acid impact reports the projectile source and remaining fence ratio, and stun prevents launching',()=>{
  const s=board(),spitter=enemy(s,'spitter',75,377);
  applyStatus(spitter,{type:'stun',remaining:0.5,sourceId:'test'});
  const hp=s.fence.hp;
  ticks(s,20);
  assert.equal(s.projectiles.length,0);
  ticks(s,65);
  const hit=s.events.find(e=>e.type==='fence_hit');
  assert.equal(hit.sourceId,spitter.id);
  assert.equal(hit.ratio,s.fence.hp/s.fence.maxHp);
  assert.equal(hp-s.fence.hp,spitter.damage);
});

test('acid shots carry the renderer contract even when a bulwark intercepts the impact',()=>{
  const s=board();
  deployFieldUnit(s,'bulwark',7);
  const source=enemy(s,'spitter',180,377);
  ticks(s,60);
  const shot=s.events.find(e=>e.type==='shot' && e.sourceId===source.id);
  assert.equal(shot.towerType,'spitter');
  assert.equal(shot.targetId,'fence');
  assert.equal(shot.targetY,ARENA.fenceY);
  assert.equal(shot.targetX,shot.x);
  assert.equal(shot.damage,source.damage);
  assert.equal(shot.crit,false);
  const hit=s.events.find(e=>e.type==='field_hit');
  assert.deepEqual([hit.index,hit.kind,hit.x,hit.y],[7,'bulwark',s.fieldSlots[7].x,s.fieldSlots[7].y]);
  assert.ok(hit.hp<hit.maxHp && hit.amount>0);
});

test('controller inspects and dismisses a field unit, then dismantles it and closes the card',async()=>{
  const {createController}=await import('../src/boot.js');
  const data=new Map();
  const api=await createController({storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
  api.act('start',{seed:5,difficulty:'normal'});
  assert.ok(api.act('deployField',{kind:'bulwark',index:6}).ok);
  api.act('inspectField',{index:6});
  assert.equal(api.getUI().selectedField,6);
  api.act('selectSlot',{index:-1});
  assert.equal(api.getUI().selectedField,-1);
  api.act('inspectField',{index:6});
  assert.ok(api.act('removeField',{index:6}).ok);
  assert.equal(api.getState().fieldSlots[6].unit,null);
  assert.equal(api.getUI().selectedField,-1);
});
