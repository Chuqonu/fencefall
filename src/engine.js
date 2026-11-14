// Integration-owned facade. Scaffold advances time only; domain workers add systems.
import {STEP,clone} from './shared.js';
export {createRun,createProfile} from './state.js';
export function step(state,dt=STEP){if(state.phase!=='playing'||state.paused||state.hiddenPaused)return state;state.time+=dt;state.tick++;return state;}
export function advance(state,realDt){if(!Number.isFinite(realDt)||realDt<0)return; if(state.phase!=='playing'||state.paused||state.hiddenPaused){state.accumulator=0;return;}state.accumulator+=Math.min(realDt,0.25)*state.speed;let count=0;while(state.accumulator+1e-10>=STEP&&count++<90){step(state,STEP);state.accumulator-=STEP;if(state.phase!=='playing'){state.accumulator=0;break;}}}
export function setSpeed(state,speed){if([1,1.5,3].includes(speed))state.speed=speed;}
export function takeEvents(state){return state.events.splice(0);}
export function exportRun(state){const out=clone(state);out.events=[];out.accumulator=0;return out;}
