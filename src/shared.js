export const CONTRACT_VERSION = 1;
export const STEP = 1 / 60;
export const ARENA = Object.freeze({width:360,height:640,spawnY:-16,enemyMinX:14,enemyMaxX:346,fenceY:450,rows:2,cols:5,slotWidth:64,slotHeight:72,frontY:508,backY:592});
export const DIFFICULTIES = Object.freeze({
 easy:{name:{en:'Easy',zh:'轻松'},health:0.8,speed:0.9,damage:0.75,count:0.9,reward:1,fence:650},
 normal:{name:{en:'Normal',zh:'标准'},health:1,speed:1,damage:1,count:1,reward:1.4,fence:600},
 hard:{name:{en:'Hard',zh:'困难'},health:1.3,speed:1.08,damage:1.25,count:1.1,reward:1.9,fence:570},
 nightmare:{name:{en:'Nightmare',zh:'噩梦'},health:1.65,speed:1.15,damage:1.5,count:1.2,reward:2.5,fence:540}
});
export const BASE_TYPES = Object.freeze(['bolt','fire','frost','lightning','poison','support']);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const clone=value=>JSON.parse(JSON.stringify(value));
export function random(state){state.rng=(state.rng+0x6D2B79F5)>>>0;let t=state.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
export function uid(state,prefix='e'){return `${prefix}${state.nextId++}`;}
export function emit(state,type,data={}){state.events.push({type,time:state.time,...data});if(state.events.length>400)state.events.splice(0,state.events.length-400);}
export function slotGeometry(index){const row=Math.floor(index/5),col=index%5,x=36+72*col,y=row?ARENA.backY:ARENA.frontY;return {index,row,col,x,y,left:x-32,top:y-36,width:64,height:72};}
export function hitSlot(x,y){for(let i=0;i<10;i++){const s=slotGeometry(i);if(x>=s.left&&x<s.left+s.width&&y>=s.top&&y<s.top+s.height)return i;}return -1;}
export function unitPosition(state,id){const slot=state.slots.find(s=>s.unit?.id===id);return slot?{x:slot.x,y:slot.y}:null;}
export function canPlan(state){return state.paused||state.phase==='draft';}
export function createUnit(state,type='bolt',rank=1,kind=type==='hero'?'hero':'tower'){return {id:uid(state,'u'),kind,type,rank,upgrades:{},cooldown:0,kills:0};}
