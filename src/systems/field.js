import {canPlan, clamp, emit, uid} from '../shared.js';
import {FIELD_UNITS,HARVEST} from '../data/field-units.js';
import {applyStatus} from './status.js';

export function fieldCost(state,kind) {
  return Math.ceil(FIELD_UNITS[kind].cost*(1-(state.systems.integration?.bonuses?.fieldDiscount || 0)));
}
function fieldEvent(state,type,pad,amount) {
  const {index,x,y,unit:{kind,hp,maxHp}} = pad;
  emit(state,type,{index,x,y,kind,hp,maxHp,amount});
}
export function deployFieldUnit(state,kind,index) {
  const spec = Object.hasOwn(FIELD_UNITS,kind) && FIELD_UNITS[kind];
  const pad = state?.fieldSlots?.[index];
  if (!canPlan(state) || !spec || !Number.isInteger(index) || !pad || pad.unit) return {ok:false,reason:'invalid_slot'};
  const cost = fieldCost(state,kind);
  if (state.energy < cost || state.fieldCooldowns[kind]>0) return {ok:false,reason:'unavailable'};
  const level = state.slots.find(s=>s.unit?.kind==='hero')?.unit.upgrades?.bastion || 0;
  const hp = spec.hp*(1+(state.systems.integration?.bonuses?.fieldHp||0))*(1+0.2*level);
  state.energy -= cost;
  pad.unit = {id:uid(state,'f'),kind,hp,maxHp:hp,armor:spec.armor,rank:1,timer:0,kills:0};
  state.fieldCooldowns[kind] = spec.cooldown;
  fieldEvent(state,'field_build',pad,cost);
  return {ok:true};
}
function clearField(state,pad) {
  for (const e of state.enemies) if (e.blockedByFieldId===pad.unit.id) e.blockedByFieldId=null;
  pad.unit=null;
}
export function removeFieldUnit(state,index) {
  const pad=state?.fieldSlots?.[index];
  if (!canPlan(state) || !pad?.unit) return {ok:false,reason:'invalid_slot'};
  const refund=Math.floor(fieldCost(state,pad.unit.kind)*0.5*pad.unit.hp/pad.unit.maxHp);
  state.energy=Math.min(state.maxEnergy,state.energy+refund);
  fieldEvent(state,'field_remove',pad,refund);
  clearField(state,pad);
  return {ok:true,refund};
}
export function hurtField(state,pad,amount) {
  const unit=pad.unit;
  const lost=Math.min(unit.hp,amount*(1-unit.armor));
  unit.hp-=lost;
  fieldEvent(state,'field_hit',pad,lost);
  if (unit.hp<=0) {
    fieldEvent(state,'field_destroy',pad,lost);
    clearField(state,pad);
  }
}
export function blocker(state,enemy,fromY,toY,airborne=false) {
  // Check outer row first when a leap crosses both rows.
  for (let i=9;i>=0;i--) {
    const pad=state.fieldSlots?.[i], kind=pad?.unit?.kind;
    if (!kind || !FIELD_UNITS[kind].blocksMovement || (airborne && kind!=='bulwark')) continue;
    if (Math.abs(enemy.x-pad.x)<=pad.width/2+enemy.radius/2 && fromY<=pad.y && toY+enemy.radius>=pad.top-1e-6) return pad;
  }
  return null;
}
export function gainEnergy(state,amount,source,point) {
  const earned=Math.min(amount,state.maxEnergy-state.energy);
  state.energy+=earned;
  if (earned>0) emit(state,'energy_gain',{amount:earned,source,...(point?{x:point.x,y:point.y}:{})});
}
export function updateField(state,dt,damageEnemy) {
  const bonuses=state.systems.integration?.bonuses || {};
  state.energy=Math.min(state.maxEnergy,state.energy+dt*(2+(bonuses.energyRate||0)));
  for (const kind of Object.keys(state.fieldCooldowns)) state.fieldCooldowns[kind]=Math.max(0,state.fieldCooldowns[kind]-dt);
  for (const pad of state.fieldSlots) {
    const u=pad.unit;
    if (!u || u.kind==='bulwark') continue;
    u.timer-=dt;
    if (u.timer>1e-9) continue;
    u.timer+=u.kind==='flare'?0.5:0.4;
    for (const e of state.enemies) {
      if (!pad.unit || e.dead || e.hp<=0) continue;
      if (u.kind==='flare') {
        if (Math.hypot(e.x-pad.x,e.y-pad.y)>115) continue;
        e.revealed=true;
        e.revealTimer=1.2;
        applyStatus(e,{type:'brittle',power:0.2,remaining:1.2,sourceId:u.id});
        applyStatus(e,{type:'slow',power:0.85,remaining:1,sourceId:u.id});
      } else if (Math.abs(e.x-pad.x)<=pad.width/2+e.radius/2 && Math.abs(e.y-pad.y)<=pad.height/2+e.radius/2 && !e.airTime) {
        damageEnemy(state,e,14*(e.phased && !e.revealed?0.6:1),{type:'spikes',towerType:'spikes',sourceId:u.id,armorPen:0.5});
        applyStatus(e,{type:'slow',power:0.78,remaining:1,sourceId:u.id});
        hurtField(state,pad,e.kind==='boss'||e.kind==='brute'?6:1.5);
      }
    }
  }
  for (const slot of state.slots) {
    const u=slot.unit;
    if (u?.type!=='harvest') continue;
    const crop=HARVEST[u.rank-1];
    u.harvestTimer=(u.harvestTimer||0)+dt;
    if (u.harvestTimer+1e-9<crop.interval) continue;
    u.harvestTimer-=crop.interval;
    const factor=(slot.row ? 1.3 : 1)*(1+(bonuses.harvest||0));
    gainEnergy(state,crop.energy*factor,'harvest',slot);
    state.xp+=crop.xp*factor;
    if (!crop.repair) continue;
    const pad=state.fieldSlots.filter(s=>s.unit && s.unit.hp<s.unit.maxHp)
      .sort((a,b)=>a.unit.hp/a.unit.maxHp-b.unit.hp/b.unit.maxHp || a.index-b.index)[0];
    if (pad) {
      const amount=Math.min(crop.repair,pad.unit.maxHp-pad.unit.hp);
      pad.unit.hp+=amount;
      fieldEvent(state,'field_repair',pad,amount);
    }
  }
}
