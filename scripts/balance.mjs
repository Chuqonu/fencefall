// Headless players use the same engine, legal planning actions and fixed simulation clock as the UI.
import {getRecipe} from '../src/data/recipes.js';
import {exportSave,importSave} from '../src/storage.js';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {availableParallelism} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRun,createProfile,prepare,step,takeEvents} from '../src/engine.js';
import {chooseDraft,placePending,rerollDraft} from '../src/systems/drafts.js';
import {deployFieldUnit} from '../src/systems/field.js';
import {mergeUnits,previewMerge} from '../src/systems/merges.js';
import {setTargeting} from '../src/systems/combat.js';
import {EXPEDITION_ORDER} from '../src/data/expeditions.js';

const tactics=['aggressive','hybrid_econ','control'];
const byPolicy={
  aggressive:['fire','lightning','bolt','poison','frost','support'],
  hybrid_econ:['fire','poison','lightning','frost','bolt','support'],
  control:['frost','lightning','fire','support','bolt','poison'],
  mono:['fire','lightning','bolt','frost','support','poison'],
  solo:['bolt','fire','lightning','frost','poison','support']
};
function deploy(state,policy) {
  if (['random','solo'].includes(policy)) return;
  const hero=state.slots[2].unit;
  if (state.kills>=30) {
    // A developed gun can thin the front or switch to the elite its allies are struggling with.
    const share=hero.kills/state.kills;
    const mode=share>0.34?'strongest':share<0.25?'weakest':'foremost';
    if (mode!==hero.targeting) setTargeting(state,2,mode);
  }
  const walls=[7,6,8,5,9];
  const order=policy==='control' ? [['flare',2],['spikes',1],['spikes',3]] : [['spikes',2],['flare',1],['spikes',3]];
  for (const [kind,i] of [...walls.map(i=>['bulwark',i]),...order,['spikes',0],['spikes',4]]) {
    if (!state.fieldSlots[i].unit) deployFieldUnit(state,kind,i);
  }
}
function merge(state,policy) {
  if (policy==='solo'||policy==='random') return;
  let best=null;
  for (const to of state.slots) for (const from of state.slots) {
    const a=from.unit,b=to.unit;
    if (!a || !b || a.kind==='hero'||b.kind==='hero'||from===to || a.rank!==b.rank) continue;
    if (policy==='mono' && a.type!==b.type) continue;
    const result=previewMerge(state,from.index,to.index);
    if (!result.ok) continue;
    const priority=3*result.result.rank + (result.result.kind==='hybrid'?2:0) + (to.row===0?1:0);
    if (!best || priority>best.priority) best={from,to,priority};
  }
  if (best) mergeUnits(state,best.from.index,best.to.index);
}
function pick(state,policy,random) {
  const cards=state.draft.options;
  if (policy==='random') return Math.floor(random()*cards.length);
  const units=state.slots.map(s=>s.unit).filter(Boolean),hero=units.find(u=>u.kind==='hero');
  const upgrades=['volley','shrapnel','pierce','strike','cadence','focus','frostbite','bastion'];
  const attack=units.filter(u=>u.kind!=='hero'&&u.type!=='harvest');
  function score(c) {
    if (c.kind==='hero_upgrade') {
      const base=policy==='solo'?100: (attack.length>0 && (hero.kills/Math.max(1,state.kills)<0.20 || (state.draftLevel%3===0 && hero.kills/state.kills<0.27)) ? 17 : 3);
      return base + (8-upgrades.indexOf(c.upgradeId))*0.6;
    }
    if (policy==='solo') return -99;
    if (c.type==='harvest') return policy==='hybrid_econ' && !units.some(u=>u.type==='harvest') && state.draftLevel<=6 ? 35 : -1;
    const matches=attack.filter(u=>u.rank===1 && (u.type===c.type || u.kind==='hybrid' && previewParent(u,c.type)));
    return 13-byPolicy[policy].indexOf(c.type)*0.9+Math.min(matches.length,1)*4;
  }
  return cards.map((c,i)=>({i,s:score(c)})).sort((a,b)=>b.s-a.s)[0].i;
}
function previewParent(u,type) {return getRecipe(u.type)?.parents.includes(type);}
function plan(state,policy,random) {
  let i=pick(state,policy,random);
  if (policy!=='solo' && policy!=='random' && state.energy>=100 && state.draft.options[i].kind==='tower' &&
      !['fire','lightning','frost','harvest'].includes(state.draft.options[i].type) && rerollDraft(state).ok) i=pick(state,policy,random);
  if (policy==='solo' && state.draft.options[i].kind!=='hero_upgrade') {
    // Solo restriction: decline an all-tower offer; no resources or units are granted.
    state.draft=null; state.phase='playing'; return;
  }
  if (!chooseDraft(state,i).ok) throw Error('invalid policy choice');
  if (state.phase==='placing') {
    const type=state.pendingUnit.unit.type;
    const slots=state.slots.filter(s=>!s.unit);
    const order=type==='harvest'?[7,6,8,5,9,1,3,0,4]:[1,3,0,4,7,6,8,5,9];
    const slot=policy==='random'?slots[Math.floor(random()*slots.length)] : order.map(i=>slots.find(s=>s.index===i)).find(Boolean);
    const index=slot?.index ?? state.slots.find(s=>s.unit?.kind!=='hero').index;
    if (!placePending(state,index,{replace:!slot}).ok) throw Error('invalid policy placement');
    if (policy==='control' && type!=='harvest') setTargeting(state,index,'priority');
  }
  merge(state,policy);
}
function median(nums) {
  const a=[...nums].sort((x,y)=>x-y), n=a.length;
  return n ? (a[(n-1)>>1]+a[n>>1])/2 : 0;
}
function play({difficulty,policy,seed,expedition='watch',gear=false,checkSave=false}) {
  const profile=createProfile();
  if (gear) {
    profile.equipped={weapon:'prism_lens',charm:'runner_charm',armor:'surge_capacitor'};
    profile.equipmentOwned=Object.values(profile.equipped);
    profile.permanent={damage:4,haste:4,vitality:4,economy:4};
  }
  const s=createRun({difficulty,seed,expedition,profile,runId:'sim-'+seed});prepare(s);
  let rng=seed,heroKills=0,noPressure=0,stalledTime=0,emptyTime=0,firstDraft=null;
  const random=()=>((rng=(Math.imul(1664525,rng)+1013904223)>>>0)/4294967296);
  const live=[];
  while (s.phase==='playing' || s.phase==='draft') {
    if (s.time>650) throw Error('timed out '+JSON.stringify({difficulty,policy,seed,expedition}));
    if (s.phase==='draft') { firstDraft??=s.time; plan(s,policy,random); }
    if (s.tick%60===0) deploy(s,policy);
    const wasOccupied=s.enemies.some(e=>e.hp>0 && !e.dead);
    const damage=s.stats.damage, fence=s.fence.hp;
    step(s);
    const occupied=wasOccupied || s.enemies.some(e=>e.hp>0 && !e.dead);
    if (!occupied) emptyTime+=1/60;
    if (!occupied || s.stats.damage-damage>1e-9 || fence-s.fence.hp>1e-9) noPressure=0;
    else if ((noPressure+=1/60)>3) stalledTime+=1/60;
    for (const e of takeEvents(s)) if (e.type==='kill') {
      if (e.towerType==='hero') heroKills++;
    }
    if (checkSave && s.tick%3600===0) {
      const data=new Map();
      const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
      const imported=importSave(exportSave(profile,s),store);
      if (!imported.ok) throw Error('Invalid live checkpoint at '+s.time+': '+imported.reason);
    }
    if (s.tick%60===0) {
      const count=s.enemies.filter(e=>e.hp>0 && e.y>=0 && e.y<=512).length;
      live.push(count);
    }
  }
  return {difficulty,policy,seed,expedition,gear,result:s.phase,time:+s.time.toFixed(2),drafts:s.draftLevel,firstDraft,
    median:median(live),peak:Math.max(...live),empty:emptyTime/s.time,stalled:Number(stalledTime>20),stalledTime,
    heroShare:heroKills/Math.max(1,s.kills),kills:s.kills,merges:s.stats.merges,wave:s.wave,hp:s.fence.hp};
}
if (!isMainThread) {
  for (const job of workerData) parentPort.postMessage(play(job));
} else {
  const args={};
  const argv=process.argv.slice(2);
  for (let i=0;i<argv.length;i++) {
    const [key,inline]=argv[i].replace(/^--?/,'').split('=');
    args[key]=inline ?? (argv[i+1] && !argv[i+1].startsWith('-') ? argv[++i] : true);
  }
  args.difficulty??=args.difficulties;
  args.policy??=args.policies;
  if ('help' in args || 'h' in args) {
    console.log('node scripts/balance.mjs [--seed-count=10 | --seeds=11,42,73] [--difficulty=normal] [--policy=control] [--quick=1] [--output=name] [--verify]');
    process.exit(0);
  }
  const verify='verify' in args;
  const seeds=args.seeds ? String(args.seeds).split(',').map(Number) : Array.from({length:Number(args['seed-count']??10)},(_,i)=>11+31*i);
  const count=seeds.length;
  if (seeds.some(s=>!Number.isInteger(s)) || new Set(seeds).size!==count) throw Error('Provide distinct integer seeds.');
  if (!Number.isInteger(count) || count<1 || (verify && (count<5 || args.quick || args.policy || args.difficulty))) throw Error('Verification requires the full matrix and at least five seeds.');
  const jobs=[];
  for (const seed of seeds) {
    for (const difficulty of (args.difficulty?.split(',')||['easy','normal','hard','nightmare'])) {
      const policies=args.policy?.split(',').map(p=>p==='greedy'?'aggressive':p)||(difficulty==='normal'?[...tactics,'random','solo','mono']:tactics);
      for (const policy of policies) {
        jobs.push({difficulty,policy,seed,checkSave:verify && seed===seeds[0] && policy==='control' && difficulty==='normal'});
        if (difficulty==='hard' && !args.quick) jobs.push({difficulty,policy,seed,gear:true});
      }
    }
    if (!args.quick) for (const expedition of EXPEDITION_ORDER.slice(1)) for (const policy of ['aggressive','control']) jobs.push({difficulty:'normal',policy,seed,expedition});
  }
  const rows=[], threads=Math.min(8,availableParallelism(),jobs.length);
  await Promise.all(Array.from({length:threads},(_,i)=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:jobs.filter((_,j)=>j%threads===i)});
    worker.on('message',row=>rows.push(row));worker.on('error',reject);worker.on('exit',code=>code?reject(Error('worker '+code)):resolve());
  })));
  rows.sort((a,b)=>a.expedition.localeCompare(b.expedition)||a.difficulty.localeCompare(b.difficulty)||a.policy.localeCompare(b.policy)||a.seed-b.seed||a.gear-b.gear);
  mkdirSync('artifacts',{recursive:true});
  writeFileSync(args.out || 'artifacts/'+(args.output||'balance')+'.json',JSON.stringify(rows,null,2));
  const groups=new Map();
  for (const row of rows) {
    const key=[row.expedition,row.difficulty,row.policy,row.gear?'geared':'base'].join('/');
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  for (const [key,r] of groups) {
    const wins=r.filter(x=>x.result==='victory');
    console.log(key,wins.length+'/'+r.length,'wins',r.map(x=>[x.seed,x.time,x.drafts,x.median,x.peak,(100*x.heroShare).toFixed(1),x.stalled].join(':')).join(' '));
  }
  if (verify) {
    const main=rows.filter(r=>r.expedition==='watch');
    const normal=main.filter(r=>r.difficulty==='normal' && tactics.includes(r.policy));
    const victories=normal.filter(r=>r.result==='victory');
    const rate=rs=>rs.filter(r=>r.result==='victory').length/rs.length;
    const gates=[];
    const gate=(ok,label)=>{gates.push(Boolean(ok));console.log(ok?'PASS':'FAIL',label);};
    const within=(x,lo,hi)=>x>=lo && x<=hi;
    gate(victories.length>0 && victories.every(r=>within(r.time,390,500) && within(r.drafts,22,32)),'Normal winning duration and drafts');
    gate(normal.every(r=>r.median>=8 && r.peak>=25 && r.empty<0.08),'Normal density and empty fraction');
    gate(rows.every(r=>r.stalled===0),'No combat-stalled alerts');
    gate(victories.every(r=>within(r.heroShare,.20,.42)),'Hero share in every Normal victory');
    for (const policy of tactics) gate(within(rate(normal.filter(r=>r.policy===policy)),.70,.85),policy+' Normal 70–85%');
    for (const [difficulty,lo,hi] of [['easy',.9,1],['normal',.6,.85],['hard',.2,.5],['nightmare',0,.15]]) {
      gate(within(rate(main.filter(r=>r.difficulty===difficulty && !r.gear && tactics.includes(r.policy))),lo,hi),difficulty+' baseline rate');
    }
    gate(rate(main.filter(r=>r.difficulty==='hard' && r.gear))>=.7,'Hard equipped');
    gate(rate(main.filter(r=>r.policy==='solo'))===0,'Solo always loses');
    gate(rate(main.filter(r=>r.policy==='random'))<=.2,'Random win rate');
    gate(rate(normal.filter(r=>r.policy==='hybrid_econ'))>=rate(main.filter(r=>r.policy==='mono')),'Hybrid versus single-type merges');
    for (const id of EXPEDITION_ORDER.slice(1)) gate(rows.some(r=>r.expedition===id && r.result==='victory'),id+' Normal clear');
    if (gates.includes(false)) process.exitCode=1;
  }
}
