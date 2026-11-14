import {CONTRACT_VERSION,DIFFICULTIES,clone,slotGeometry,createUnit} from './shared.js';
export function createProfile(language='en'){return {version:1,currency:0,equipmentOwned:[],equipped:{weapon:null,charm:null,armor:null},permanent:{damage:0,haste:0,vitality:0},settledRuns:[],best:{},settings:{language:language==='zh'?'zh':'en',sound:false,reducedMotion:false,difficulty:'normal'}};}
export function createRun({seed=123456,difficulty='normal',profile=createProfile(),runId}={}){
 if(!DIFFICULTIES[difficulty])difficulty='normal';
 const id=runId||`run-${Date.now()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
 const hp=DIFFICULTIES[difficulty].fence;
 const state={version:CONTRACT_VERSION,runId:id,seed:seed>>>0,rng:seed>>>0,nextId:1,time:0,tick:0,accumulator:0,phase:'playing',paused:false,hiddenPaused:false,speed:1,difficulty,wave:0,waveTime:0,director:{nextWave:0,queue:[],done:false},kills:0,xp:0,nextDraftXp:8,draftLevel:0,fence:{hp,maxHp:hp},slots:Array.from({length:10},(_,i)=>({...slotGeometry(i),unit:null})),enemies:[],projectiles:[],clouds:[],events:[],draft:null,pendingUnit:null,profileSnapshot:clone(profile),settlement:null,stats:{damage:0,fenceDamage:0,merges:0,crits:0},initialized:false,endless:false,systems:{}};
 state.slots[7].unit=createUnit(state,'hero');
 return state;
}
