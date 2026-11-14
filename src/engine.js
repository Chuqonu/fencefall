// Fixed-step integration. Domain modules are optional live dependencies.
// A missing module is absent, not a passing stub. Speed changes how many
// STEP updates run per wall second; it is never passed into gameplay dt.
import {STEP, clone, emit} from './shared.js';

export {createRun, createProfile} from './state.js';

const SPECS = [
  ['movement', './systems/movement.js'],
  ['combat', './systems/combat.js'],
  ['status', './systems/status.js'],
  ['waves', './systems/waves.js'],
  ['drafts', './systems/drafts.js'],
  ['progression', './systems/progression.js'],
];

const modules = {};
const missing = [];
const failed = new Map();

// Variable import() is transitional so this file can boot before workers land.
// Once every domain module is in the tree, these become static imports. esbuild
// cannot follow a variable href, and a missing core system must then fail the build.
await Promise.all(SPECS.map(async ([key, href]) => {
  try {
    modules[key] = await import(href);
  } catch (error) {
    modules[key] = null;
    missing.push(href);
    const name = error && typeof error === 'object' && 'code' in error ? error.code : 'missing';
    failed.set(key, String(name));
  }
}));

const ZERO_BONUSES = Object.freeze({damage:0, haste:0, range:0, critChance:0, fence:0, reward:0});

function has(key, name) {
  const mod = modules[key];
  return !!mod && typeof mod[name] === 'function' && !failed.has(`${key}:run`);
}

function call(key, fn) {
  if (failed.has(`${key}:run`)) return;
  try {
    fn();
  } catch (error) {
    failed.set(`${key}:run`, error instanceof Error ? error.message : String(error));
    console.error(`[fencefall] ${key} stopped for this session`, error);
  }
}

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
  let bonuses = null;
  if (has('progression', 'getProfileBonuses')) {
    try {
      bonuses = modules.progression.getProfileBonuses(state.profileSnapshot);
    } catch (error) {
      failed.set('progression:run', error instanceof Error ? error.message : String(error));
      console.error('[fencefall] profile bonuses unavailable', error);
    }
  }
  return applyProfileBonuses(state, bonuses);
}

export function integrationInfo() {
  return {
    contract:1,
    present:{
      movement:has('movement', 'updateMovement'),
      combat:has('combat', 'updateCombat') && has('combat', 'damageEnemy'),
      status:has('status', 'updateStatuses'),
      waves:has('waves', 'updateWaves'),
      drafts:has('drafts', 'updateDrafts'),
      progression:has('progression', 'getProfileBonuses'),
    },
    missing:[...missing],
    failed:Object.fromEntries(failed),
  };
}

function halted(state) {
  return !state || state.phase !== 'playing' || state.paused === true || state.hiddenPaused === true;
}

function cleanup(state) {
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  if (has('combat', 'killEnemy')) {
    for (const enemy of [...state.enemies]) {
      if (!enemy || enemy.dead || !(typeof enemy.hp === 'number') || enemy.hp > 0) continue;
      call('combat', () => modules.combat.killEnemy(state, enemy, null));
    }
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
  if (has('waves', 'updateWaves')) call('waves', () => modules.waves.updateWaves(state, STEP));
  if (halted(state)) return;
  if (has('movement', 'updateMovement')) call('movement', () => modules.movement.updateMovement(state, STEP));
  if (halted(state)) return;
  if (has('status', 'updateStatuses') && has('combat', 'damageEnemy')) {
    call('status', () => modules.status.updateStatuses(state, STEP, modules.combat.damageEnemy));
  }
  if (halted(state)) return;
  if (has('combat', 'updateCombat')) call('combat', () => modules.combat.updateCombat(state, STEP));
  cleanup(state);
  resolveOutcome(state);
  if (!halted(state) && has('drafts', 'updateDrafts')) call('drafts', () => modules.drafts.updateDrafts(state));
}

export function step(state) {
  if (!state) return state;
  prepare(state);
  if (halted(state)) return state;
  stepBody(state);
  return state;
}

export function advance(state, realDt) {
  if (!state || !Number.isFinite(realDt) || realDt < 0) return state;
  prepare(state);
  if (halted(state)) {
    state.accumulator = 0;
    return state;
  }
  const speed = state.speed === 1.5 || state.speed === 3 ? state.speed : 1;
  state.accumulator += Math.min(realDt, 0.25) * speed;
  let count = 0;
  while (state.accumulator + 1e-10 >= STEP && count++ < 90) {
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
  if (state && [1, 1.5, 3].includes(speed)) state.speed = speed;
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
