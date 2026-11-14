import {createRun,advance} from './engine.js';
import {ARENA} from './shared.js';
const root=document.getElementById('app');
const state=createRun();
root.innerHTML='<header><h1>Fencefall <small>最后一道防线</small></h1><p>Shared scaffold · development checkpoint</p></header><canvas width="360" height="640" aria-label="Two rows of five defender slots behind a shared fence"></canvas><p id="status"></p>';
const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');let last=performance.now();
function frame(now){advance(state,(now-last)/1000);last=now;ctx.fillStyle='#122128';ctx.fillRect(0,0,360,640);ctx.fillStyle='#213e37';ctx.fillRect(10,10,340,ARENA.fenceY-10);ctx.fillStyle='#9b7951';ctx.fillRect(0,ARENA.fenceY,360,12);for(const s of state.slots){ctx.fillStyle='#223743';ctx.fillRect(s.left,s.top,s.width,s.height);ctx.strokeStyle='#687c80';ctx.strokeRect(s.left,s.top,s.width,s.height);if(s.unit){ctx.fillStyle='#f0cb72';ctx.fillRect(s.x-9,s.y-16,18,25);}}root.querySelector('#status').textContent=`10 slots · 1 independent hero · ${state.time.toFixed(1)}s`;requestAnimationFrame(frame);}requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{state.hiddenPaused=document.hidden;last=performance.now();});
