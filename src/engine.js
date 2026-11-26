// Fixed-step integration. Speed changes how many STEP updates run per wall
// second; gameplay systems always receive STEP, never a scaled delta.
import {STEP, clone, emit} from './shared.js';
import {updateMovement} from './systems/movement.js';
import {damageEnemy, killEnemy, regenerateFence, updateCombat} from './systems/combat.js';
import {updateStatuses} from './systems/status.js';
import {updateWaves} from './systems/waves.js';
import {updateDrafts} from './systems/drafts.js';
import {getProfileBonuses} from './systems/progression.js';

export {createRun, createProfile} from './state.js';

const ZERO_BONUSES = Object.freeze({damage:0, haste:0, range:0, critChance:0, fence:0, reward:0});

function requireFn(fn, name) {
  if (typeof fn !== 'function') throw new Error(`Fencefall core system missing: ${name}`);
  return fn;
}

requireFn(updateMovement, 'updateMovement');
requireFn(updateCombat, 'updateCombat');
requireFn(damageEnemy, 'damageEnemy');
requireFn(killEnemy, 'killEnemy');
requireFn(updateStatuses, 'updateStatuses');
requireFn(updateWaves, 'updateWaves');
requireFn(updateDrafts, 'updateDrafts');
requireFn(getProfileBonuses, 'getProfileBonuses');

function sanitizeBonuses(value) {
  const out = {...ZERO_BONUSES};
  if (!value || typeof value !== 'object') return out;
  for (const key of Object.keys(out)) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) out[key] = number;
  }
  if (out.fence < 0 || out.fence > 1000) out.fence = 0;
  return out;
}

export function applyProfileBonuses(state, bonuses) {
  if (!state || state.initialized) return state;
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  const clean = sanitizeBonuses(bonuses);
  state.systems.integration = {bonuses:clean};
  if (clean.fence > 0 && state.fence && Number.isFinite(state.fence.maxHp) && Number.isFinite(state.fence.hp)) {
    state.fence.maxHp += clean.fence;
    state.fence.hp = Math.min(state.fence.maxHp, state.fence.hp + clean.fence);
  }
  state.initialized = true;
  return state;
}

export function prepare(state) {
  if (!state || state.initialized) return state;
  return applyProfileBonuses(state, getProfileBonuses(state.profileSnapshot));
}

export function integrationInfo() {
  return {
    contract:1,
    present:{movement:true, combat:true, status:true, waves:true, drafts:true, progression:true},
    missing:[],
    failed:{},
  };
}

function halted(state) {
  return !state || state.phase !== 'playing' || state.paused === true || state.hiddenPaused === true;
}

function cleanup(state) {
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  for (const enemy of [...state.enemies]) {
    if (!enemy || enemy.dead || !(typeof enemy.hp === 'number') || enemy.hp > 0) continue;
    killEnemy(state, enemy, null);
  }
  state.enemies = state.enemies.filter(enemy => enemy && enemy.dead !== true && typeof enemy.hp === 'number' && enemy.hp > 0);
  state.projectiles = state.projectiles.filter(projectile => projectile && !(typeof projectile.life === 'number' && projectile.life <= 0));
}

function resolveOutcome(state) {
  const hp = state.fence && state.fence.hp;
  if (state.phase === 'playing' && typeof hp === 'number' && hp <= 0) {
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time:state.time, wave:state.wave, kills:state.kills});
    return;
  }
  const alive = Array.isArray(state.enemies) && state.enemies.some(enemy => enemy && enemy.dead !== true && enemy.hp > 0);
  const queue = state.director?.queue;
  const queueEmpty = !Array.isArray(queue) || queue.length === 0;
  if (state.phase === 'playing' && state.endless !== true && state.director?.done === true && queueEmpty && !alive) {
    state.phase = 'victory';
    emit(state, 'victory', {time:state.time, wave:state.wave, kills:state.kills});
  }
}

function stepBody(state) {
  if (!Array.isArray(state.events)) state.events = [];
  if (state.phase === 'playing' && typeof state.fence?.hp === 'number' && state.fence.hp <= 0) {
    state.time += STEP;
    state.tick += 1;
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time:state.time, wave:state.wave, kills:state.kills});
    return;
  }
  state.time += STEP;
  state.tick += 1;
  updateWaves(state, STEP);
  if (halted(state)) return;
  regenerateFence(state, STEP);
  updateMovement(state, STEP);
  if (halted(state)) return;
  updateStatuses(state, STEP, damageEnemy);
  if (halted(state)) return;
  updateCombat(state, STEP);
  cleanup(state);
  resolveOutcome(state);
  if (!halted(state)) updateDrafts(state);
}

export function step(state) {
  if (!state) return state;
  prepare(state);
  if (halted(state)) return state;
  stepBody(state);
  return state;
}

const SPEEDS = Object.freeze([1, 1.5, 3, 10]);

export function advance(state, realDt) {
  if (!state || !Number.isFinite(realDt) || realDt < 0) return state;
  prepare(state);
  if (halted(state)) {
    state.accumulator = 0;
    return state;
  }
  const speed = SPEEDS.includes(state.speed) ? state.speed : 1;
  state.accumulator += Math.min(realDt, 0.25) * speed;
  let count = 0;
  // 0.25s of wall time at 10× is 150 shared steps, so one slice can finish.
  while (state.accumulator + 1e-10 >= STEP && count++ < 150) {
    state.accumulator -= STEP;
    stepBody(state);
    if (halted(state)) {
      state.accumulator = 0;
      break;
    }
  }
  if (state.accumulator < 1e-8) state.accumulator = 0;
  return state;
}

// Headless callers advance simulation time directly. advance() remains wall-capped.
export function simulate(state, seconds) {
  if (!state) return state;
  prepare(state);
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  const steps = Math.min(200000, Math.floor(seconds * 60 + 1e-9));
  for (let index = 0; index < steps; index += 1) {
    if (halted(state)) break;
    stepBody(state);
  }
  return state;
}

export function setSpeed(state, speed) {
  if (state && SPEEDS.includes(speed)) state.speed = speed;
}

export function takeEvents(state) {
  if (!state || !Array.isArray(state.events)) return [];
  return state.events.splice(0);
}

export function exportRun(state) {
  const out = clone(state);
  out.events = [];
  out.accumulator = 0;
  return out;
}

export function enterEndless(state) {
  if (!state || typeof state !== 'object') return {ok: false, reason: 'bad-phase'};
  if (state.endless === true) return {ok: false, reason: 'already'};
  if (state.phase !== 'victory') return {ok: false, reason: 'bad-phase'};
  state.endless = true;
  state.phase = 'playing';
  state.paused = false;
  return {ok: true};
}
