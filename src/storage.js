/**
 * Fencefall persistence. Profile and run are stored separately from UI/session state.
 *
 * Keys (app-specific): PROFILE_KEY, RUN_KEY.
 * Export wrapper: {format: SAVE_FORMAT, version, profile, run|null}.
 *
 * Boot:
 *   const profile = loadProfile() ?? createProfile(language);
 *   const run = loadRun(); // null when there is nothing safe to resume
 * loadProfile/loadRun return null for a missing, corrupt, oversized, or unreadable
 * save. They never throw and never write. A missing profile is not defaulted to
 * English here — the caller picks the locale.
 *
 * saveRun/loadRun/export/import persist a paused snapshot: paused true, hiddenPaused
 * false, events [], accumulator 0. The live object is not mutated. Slot rectangles
 * are rewritten from slotGeometry(index); the unit in that slot is kept. RNG, seed,
 * nextId, statuses, director, settlement, and plain JSON domain fields (including
 * state.systems) are kept. nextId is raised only when a living entity id would
 * otherwise collide with a future uid().
 *
 * Settlement order so a reload cannot pay twice:
 *   1. Set state.settlement once and do not change it afterward.
 *   2. If profile.settledRuns lacks state.runId, append it and add currency.
 *   3. saveProfile(profile) first, then saveRun(state).
 * A crash after 3 reloads the paid profile with the previous run. settleRun must
 * no-op when settledRuns already contains runId OR state.settlement is already set.
 * This module never grants currency and never drops a settlement or settled run id.
 * importSave validates the whole file, then writes profile and run together and
 * restores both previous values if either write fails. An invalid import does not
 * replace a valid save. A null run in an otherwise valid file clears the run key.
 *
 * Phase invariants: draft has three options and no pending unit; placing has both;
 * playing, victory, and defeat have neither. Exactly one hero (type hero, rank 1).
 * Storage sanity ceilings are higher than gameplay caps: permanent levels <= 1000,
 * currency <= 1e9, import text <= 1_500_000 characters.
 */
import {CONTRACT_VERSION, BASE_TYPES, DIFFICULTIES, ARENA, slotGeometry} from './shared.js';

export const PROFILE_KEY = 'fencefall.v1.profile';
export const RUN_KEY = 'fencefall.v1.run';
export const SAVE_FORMAT = 'fencefall-save';

const MAX_IMPORT_CHARS = 1_500_000;
const MAX_DEPTH = 10;
const MAX_OBJECT_KEYS = 200;
const MAX_ARRAY = 4000;
const MAX_STRING = 4000;
const MAX_ABS_NUMBER = 1e12;
const MAX_ENEMIES = 800;
const MAX_PROJECTILES = 1000;
const MAX_CLOUDS = 400;
const MAX_QUEUE = 4000;
const MAX_STATUSES = 16;
const MAX_TAGS = 16;
const MAX_VISITED = 64;
const MAX_UPGRADES = 32;
const MAX_SETTLED = 2000;
const MAX_EQUIPMENT = 128;
const MAX_PERMANENT = 1000;
const MAX_CURRENCY = 1e9;
const MAX_TIME = 1e7;
const MAX_TICK = 1e9;
const MAX_NEXT_ID = 1e9;
const MAX_WAVE = 100000;
const MAX_FENCE = 1e6;
const MAX_STAT = 1e12;
const MAX_HP = 1e9;
const MAX_UNIT_KILLS = 1e7;
const UINT32 = 4294967295;

const BASE_TYPE_SET = new Set(BASE_TYPES);
const ENEMY_KINDS = new Set(['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss']);
const STATUS_TYPES = new Set(['burn', 'poison', 'slow', 'stun', 'brittle']);
const PHASES = new Set(['playing', 'draft', 'placing', 'victory', 'defeat']);
const RESULTS = new Set(['victory', 'defeat', 'abandon']);
const EQUIPPED_SLOTS = ['weapon', 'charm', 'armor'];
const PERMANENT_KEYS = ['damage', 'haste', 'vitality'];
const ID_RE = /^[A-Za-z0-9._:-]+$/;
const UID_RE = /^[A-Za-z]{1,8}(\d+)$/;

const PROFILE_KEYS = new Set(['version', 'currency', 'equipmentOwned', 'equipped', 'permanent', 'settledRuns', 'best', 'settings']);
const SETTINGS_KEYS = new Set(['language', 'sound', 'reducedMotion', 'difficulty']);
const RUN_KEYS = new Set([
  'version', 'runId', 'seed', 'rng', 'nextId', 'time', 'tick', 'accumulator', 'phase', 'paused', 'hiddenPaused',
  'speed', 'difficulty', 'wave', 'waveTime', 'director', 'kills', 'xp', 'nextDraftXp', 'draftLevel', 'fence',
  'slots', 'enemies', 'projectiles', 'clouds', 'events', 'draft', 'pendingUnit', 'profileSnapshot', 'settlement',
  'stats', 'initialized', 'endless', 'systems'
]);
const DIRECTOR_KEYS = new Set(['nextWave', 'queue', 'done']);
const FENCE_KEYS = new Set(['hp', 'maxHp']);
const STAT_KEYS = new Set(['damage', 'fenceDamage', 'merges', 'crits']);
const UNIT_KEYS = new Set(['id', 'kind', 'type', 'rank', 'upgrades', 'cooldown', 'kills']);
const ENEMY_KEYS = new Set([
  'id', 'kind', 'x', 'y', 'hp', 'maxHp', 'speed', 'radius', 'damage', 'attackInterval', 'attackCooldown',
  'xp', 'armor', 'driftPhase', 'driftVelocity', 'statuses', 'attacking', 'dead'
]);
const STATUS_KEYS = new Set(['type', 'power', 'remaining', 'sourceId', 'stacks', 'tickTimer']);
const PROJECTILE_KEYS = new Set([
  'id', 'sourceId', 'targetId', 'x', 'y', 'speed', 'damage', 'crit', 'tags', 'splash', 'chain', 'chainRange',
  'pierce', 'visited', 'life'
]);
const OPTION_KEYS = new Set(['id', 'kind', 'type', 'upgradeId', 'replace']);
const DRAFT_KEYS = new Set(['options']);
const PENDING_KEYS = new Set(['unit', 'replace']);
const SETTLEMENT_KEYS = new Set(['runId', 'currency', 'difficulty', 'result', 'time', 'kills', 'wave']);

function fail(reason) {
  return {ok: false, reason};
}

function pass(value) {
  return {ok: true, value};
}

function isPlain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isInt(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNum(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isBool(value) {
  return value === true || value === false;
}

function isId(value, max = 96) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max && ID_RE.test(value);
}

function isSafeKey(key) {
  return typeof key === 'string'
    && key.length >= 1
    && key.length <= 64
    && key !== '__proto__'
    && key !== 'prototype'
    && key !== 'constructor'
    && !key.includes('\0');
}

function isDifficulty(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DIFFICULTIES, value);
}

function canonicalSpeed(value) {
  if (value === 1 || value === 3) return value;
  if (typeof value === 'number' && Math.abs(value - 1.5) < 1e-9) return 1.5;
  return null;
}

function clampDust(value, max) {
  if (value <= max) return value;
  const slack = Math.max(1e-4, Math.abs(max) * 1e-6);
  return value <= max + slack ? max : null;
}

function noteUid(id, mark) {
  if (typeof id !== 'string') return;
  const match = UID_RE.exec(id);
  if (!match) return;
  const n = Number(match[1]);
  if (n > mark.high) mark.high = n;
}

function claimId(id, ids) {
  if (ids.has(id)) return false;
  ids.add(id);
  return true;
}

function sanitizeJson(value, seen = new WeakSet(), depth = 0) {
  if (value === null) return pass(null);
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_NUMBER) return fail('invalid_bounds');
    return pass(value);
  }
  if (type === 'boolean') return pass(value);
  if (type === 'string') {
    if (value.length > MAX_STRING || value.includes('\0')) return fail('invalid_bounds');
    return pass(value);
  }
  if (type !== 'object') return fail('invalid_run');
  if (seen.has(value)) return fail('invalid_run');
  if (depth > MAX_DEPTH) return fail('invalid_bounds');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY) return fail('invalid_bounds');
      const out = [];
      for (const item of value) {
        const next = sanitizeJson(item, seen, depth + 1);
        if (!next.ok) return next;
        out.push(next.value);
      }
      return pass(out);
    }
    if (!isPlain(value)) return fail('invalid_run');
    const keys = Object.keys(value);
    if (keys.length > MAX_OBJECT_KEYS) return fail('invalid_bounds');
    const out = {};
    for (const key of keys) {
      if (!isSafeKey(key)) return fail('invalid_run');
      const next = sanitizeJson(value[key], seen, depth + 1);
      if (!next.ok) return next;
      out[key] = next.value;
    }
    return pass(out);
  } finally {
    seen.delete(value);
  }
}

function copyExtensions(source, target, known) {
  for (const key of Object.keys(source)) {
    if (known.has(key)) continue;
    if (!isSafeKey(key)) return fail('invalid_run');
    const next = sanitizeJson(source[key]);
    if (!next.ok) return next;
    target[key] = next.value;
  }
  return pass(target);
}

function validateProfile(profile) {
  if (!isPlain(profile)) return fail('invalid_profile');
  if (profile.version !== CONTRACT_VERSION) return fail('invalid_version');
  if (typeof profile.currency !== 'number' || !Number.isFinite(profile.currency)) return fail('invalid_profile');
  if (!isNum(profile.currency, 0, MAX_CURRENCY)) return fail('invalid_bounds');
  if (!Array.isArray(profile.equipmentOwned) || profile.equipmentOwned.length > MAX_EQUIPMENT) {
    return fail(Array.isArray(profile.equipmentOwned) ? 'invalid_bounds' : 'invalid_profile');
  }
  if (!isPlain(profile.equipped) || !isPlain(profile.permanent) || !isPlain(profile.settings)) return fail('invalid_profile');
  if (!Array.isArray(profile.settledRuns)) return fail('invalid_profile');
  if (profile.settledRuns.length > MAX_SETTLED) return fail('invalid_bounds');
  if (!isPlain(profile.best)) return fail('invalid_profile');

  const owned = [];
  const ownedSet = new Set();
  for (const id of profile.equipmentOwned) {
    if (!isId(id, 64)) return fail('invalid_profile');
    if (ownedSet.has(id)) return fail('invalid_profile');
    ownedSet.add(id);
    owned.push(id);
  }
  for (const slot of EQUIPPED_SLOTS) {
    if (!Object.hasOwn(profile.equipped, slot)) return fail('invalid_profile');
  }
  if (Object.keys(profile.equipped).some(key => !EQUIPPED_SLOTS.includes(key))) return fail('invalid_profile');
  const equipped = {weapon: null, charm: null, armor: null};
  const used = new Set();
  for (const slot of EQUIPPED_SLOTS) {
    const id = profile.equipped[slot];
    if (id === null) continue;
    if (typeof id !== 'string' || !ownedSet.has(id) || used.has(id)) return fail('invalid_profile');
    used.add(id);
    equipped[slot] = id;
  }

  for (const key of PERMANENT_KEYS) {
    if (!Object.hasOwn(profile.permanent, key)) return fail('invalid_profile');
    if (typeof profile.permanent[key] !== 'number' || !Number.isFinite(profile.permanent[key])) return fail('invalid_profile');
    if (!isInt(profile.permanent[key], 0, MAX_PERMANENT)) return fail('invalid_bounds');
  }
  if (Object.keys(profile.permanent).some(key => !PERMANENT_KEYS.includes(key))) return fail('invalid_profile');
  const permanent = {
    damage: profile.permanent.damage,
    haste: profile.permanent.haste,
    vitality: profile.permanent.vitality
  };

  const settledRuns = [];
  for (const id of profile.settledRuns) {
    if (!isId(id, 96)) return fail('invalid_profile');
    settledRuns.push(id);
  }

  const best = sanitizeJson(profile.best);
  if (!best.ok) return fail(best.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');

  const {language, sound, reducedMotion, difficulty} = profile.settings;
  if (language !== 'en' && language !== 'zh') return fail('invalid_enum');
  if (!isBool(sound) || !isBool(reducedMotion)) return fail('invalid_profile');
  if (!isDifficulty(difficulty)) return fail('invalid_enum');
  const settings = {language, sound, reducedMotion, difficulty};
  const settingsExtra = copyExtensions(profile.settings, settings, SETTINGS_KEYS);
  if (!settingsExtra.ok) return fail(settingsExtra.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');

  const value = {
    version: CONTRACT_VERSION,
    currency: profile.currency,
    equipmentOwned: owned,
    equipped,
    permanent,
    settledRuns,
    best: best.value,
    settings
  };
  const extra = copyExtensions(profile, value, PROFILE_KEYS);
  if (!extra.ok) return fail(extra.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');
  return pass(value);
}

function validateUpgrades(upgrades) {
  if (!isPlain(upgrades)) return fail('invalid_run');
  const keys = Object.keys(upgrades);
  if (keys.length > MAX_UPGRADES) return fail('invalid_bounds');
  const out = {};
  for (const key of keys) {
    if (!isSafeKey(key)) return fail('invalid_run');
    const next = sanitizeJson(upgrades[key]);
    if (!next.ok) return next;
    out[key] = next.value;
  }
  return pass(out);
}

function validateUnit(unit, role, ids, mark) {
  if (!isPlain(unit)) return fail('invalid_run');
  if (!isId(unit.id, 64)) return fail('invalid_run');
  if (!claimId(unit.id, ids)) return fail('invalid_run');
  noteUid(unit.id, mark);
  const {kind, type, rank} = unit;
  if (kind === 'hero') {
    if (role === 'defender' || type !== 'hero' || rank !== 1) return fail('invalid_hero');
  } else if (role === 'hero') {
    return fail('invalid_hero');
  } else if (kind === 'tower') {
    if (!BASE_TYPE_SET.has(type)) return fail('invalid_enum');
    if (!isInt(rank, 1, 4)) return fail('invalid_bounds');
  } else if (kind === 'hybrid') {
    if (type === 'hero' || !isId(type, 64)) return fail('invalid_enum');
    if (!isInt(rank, 1, 4)) return fail('invalid_bounds');
  } else {
    return fail('invalid_enum');
  }
  const upgrades = validateUpgrades(unit.upgrades);
  if (!upgrades.ok) return upgrades;
  if (!isNum(unit.cooldown, 0, 600)) return fail(typeof unit.cooldown === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!isInt(unit.kills, 0, MAX_UNIT_KILLS)) return fail(typeof unit.kills === 'number' ? 'invalid_bounds' : 'invalid_run');
  const value = {
    id: unit.id,
    kind,
    type,
    rank,
    upgrades: upgrades.value,
    cooldown: unit.cooldown,
    kills: unit.kills
  };
  const extra = copyExtensions(unit, value, UNIT_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateStatus(status) {
  if (!isPlain(status)) return fail('invalid_run');
  if (!STATUS_TYPES.has(status.type)) return fail('invalid_enum');
  if (typeof status.power !== 'number' || !Number.isFinite(status.power)) return fail('invalid_run');
  if (status.type === 'slow') {
    if (!isNum(status.power, 0, 1)) return fail('invalid_bounds');
  } else if (!isNum(status.power, 0, 1e6)) {
    return fail('invalid_bounds');
  }
  if (!isNum(status.remaining, 0, 3600)) return fail(typeof status.remaining === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!isId(status.sourceId, 64)) return fail('invalid_run');
  const value = {
    type: status.type,
    power: status.power,
    remaining: status.remaining,
    sourceId: status.sourceId
  };
  if (status.stacks !== undefined) {
    if (!isInt(status.stacks, 0, 100)) return fail(typeof status.stacks === 'number' ? 'invalid_bounds' : 'invalid_run');
    value.stacks = status.stacks;
  }
  if (status.tickTimer !== undefined) {
    if (!isNum(status.tickTimer, 0, 3600)) return fail(typeof status.tickTimer === 'number' ? 'invalid_bounds' : 'invalid_run');
    value.tickTimer = status.tickTimer;
  }
  const extra = copyExtensions(status, value, STATUS_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateEnemy(enemy, ids, mark) {
  if (!isPlain(enemy)) return fail('invalid_run');
  if (!isId(enemy.id, 64) || !claimId(enemy.id, ids)) return fail('invalid_run');
  noteUid(enemy.id, mark);
  if (!ENEMY_KINDS.has(enemy.kind)) return fail('invalid_enum');
  if (!isNum(enemy.x, ARENA.enemyMinX - 32, ARENA.enemyMaxX + 32)) return fail('invalid_bounds');
  if (!isNum(enemy.y, ARENA.spawnY - 80, ARENA.fenceY + 80)) return fail('invalid_bounds');
  if (typeof enemy.maxHp !== 'number' || !Number.isFinite(enemy.maxHp)) return fail('invalid_run');
  if (!isNum(enemy.maxHp, 1e-6, MAX_HP)) return fail('invalid_bounds');
  if (typeof enemy.hp !== 'number' || !Number.isFinite(enemy.hp)) return fail('invalid_run');
  const hp = clampDust(enemy.hp, enemy.maxHp);
  if (hp === null || hp < 0) return fail('invalid_bounds');
  if (!isNum(enemy.speed, 1e-6, 2000)) return fail('invalid_bounds');
  if (!isNum(enemy.radius, 1e-6, 180)) return fail('invalid_bounds');
  if (!isNum(enemy.damage, 0, 1e6)) return fail('invalid_bounds');
  if (!isNum(enemy.attackInterval, 1e-6, 600)) return fail('invalid_bounds');
  if (!isNum(enemy.attackCooldown, 0, 600)) return fail('invalid_bounds');
  if (!isNum(enemy.xp, 0, 1e6)) return fail('invalid_bounds');
  if (typeof enemy.armor !== 'number' || !Number.isFinite(enemy.armor)) return fail('invalid_run');
  const armor = clampDust(enemy.armor, 0.8);
  if (armor === null || armor < 0) return fail('invalid_bounds');
  if (!isNum(enemy.driftPhase, -1e9, 1e9)) return fail('invalid_bounds');
  if (!isNum(enemy.driftVelocity, -400, 400)) return fail('invalid_bounds');
  if (!Array.isArray(enemy.statuses) || enemy.statuses.length > MAX_STATUSES) {
    return fail(Array.isArray(enemy.statuses) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!isBool(enemy.attacking) || !isBool(enemy.dead)) return fail('invalid_run');
  const statuses = [];
  for (const status of enemy.statuses) {
    const next = validateStatus(status);
    if (!next.ok) return next;
    statuses.push(next.value);
  }
  const value = {
    id: enemy.id,
    kind: enemy.kind,
    x: enemy.x,
    y: enemy.y,
    hp,
    maxHp: enemy.maxHp,
    speed: enemy.speed,
    radius: enemy.radius,
    damage: enemy.damage,
    attackInterval: enemy.attackInterval,
    attackCooldown: enemy.attackCooldown,
    xp: enemy.xp,
    armor,
    driftPhase: enemy.driftPhase,
    driftVelocity: enemy.driftVelocity,
    statuses,
    attacking: enemy.attacking,
    dead: enemy.dead
  };
  const extra = copyExtensions(enemy, value, ENEMY_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateProjectile(projectile, ids, mark) {
  if (!isPlain(projectile)) return fail('invalid_run');
  if (!isId(projectile.id, 64) || !claimId(projectile.id, ids)) return fail('invalid_run');
  noteUid(projectile.id, mark);
  if (!isId(projectile.sourceId, 64)) return fail('invalid_run');
  if (!(projectile.targetId === null || isId(projectile.targetId, 64))) return fail('invalid_run');
  // Match the live projectile culling bounds in combat, including piercing
  // shots that briefly travel beyond the visible field.
  if (!isNum(projectile.x, -100, ARENA.width + 100)) return fail('invalid_bounds');
  if (!isNum(projectile.y, -120, ARENA.height + 80)) return fail('invalid_bounds');
  if (!isNum(projectile.speed, 1e-6, 20000)) return fail('invalid_bounds');
  if (!isNum(projectile.damage, 0, 1e9)) return fail('invalid_bounds');
  if (!isBool(projectile.crit)) return fail('invalid_run');
  if (!Array.isArray(projectile.tags) || projectile.tags.length > MAX_TAGS) return fail('invalid_run');
  if (!isNum(projectile.splash, 0, 400)) return fail('invalid_bounds');
  if (!isInt(projectile.chain, 0, 30)) return fail('invalid_bounds');
  if (!isNum(projectile.chainRange, 1e-6, 500)) return fail('invalid_bounds');
  if (!isInt(projectile.pierce, 0, 30)) return fail('invalid_bounds');
  if (!Array.isArray(projectile.visited) || projectile.visited.length > MAX_VISITED) return fail('invalid_run');
  if (!isNum(projectile.life, 0, 120)) return fail('invalid_bounds');
  const tags = [];
  for (const tag of projectile.tags) {
    if (typeof tag !== 'string' || tag.length < 1 || tag.length > 32 || !/^[A-Za-z0-9_-]+$/.test(tag)) return fail('invalid_run');
    tags.push(tag);
  }
  const visited = [];
  for (const id of projectile.visited) {
    if (!isId(id, 64)) return fail('invalid_run');
    visited.push(id);
  }
  const value = {
    id: projectile.id,
    sourceId: projectile.sourceId,
    targetId: projectile.targetId,
    x: projectile.x,
    y: projectile.y,
    speed: projectile.speed,
    damage: projectile.damage,
    crit: projectile.crit,
    tags,
    splash: projectile.splash,
    chain: projectile.chain,
    chainRange: projectile.chainRange,
    pierce: projectile.pierce,
    visited,
    life: projectile.life
  };
  const extra = copyExtensions(projectile, value, PROJECTILE_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateCloud(cloud, ids, mark) {
  const next = sanitizeJson(cloud);
  if (!next.ok) return next;
  if (!isPlain(next.value)) return fail('invalid_run');
  const cloudValue = next.value;
  if ('x' in cloudValue && !isNum(cloudValue.x, -80, ARENA.width + 80)) return fail('invalid_bounds');
  if ('y' in cloudValue && !isNum(cloudValue.y, -120, ARENA.height + 40)) return fail('invalid_bounds');
  if ('id' in cloudValue) {
    if (!isId(cloudValue.id, 64) || !claimId(cloudValue.id, ids)) return fail('invalid_run');
    noteUid(cloudValue.id, mark);
  }
  return pass(cloudValue);
}

function optionSignature(option) {
  return `${option.kind}|${option.type || ''}|${option.upgradeId || ''}|${option.replace ? '1' : '0'}`;
}

function validateOption(option) {
  if (!isPlain(option) || !isId(option.id, 64)) return fail('invalid_run');
  const value = {id: option.id, kind: option.kind};
  if (option.kind === 'tower') {
    if (!BASE_TYPE_SET.has(option.type)) return fail('invalid_enum');
    if (option.upgradeId != null) return fail('invalid_run');
    value.type = option.type;
  } else if (option.kind === 'hero_upgrade') {
    if (!isId(option.upgradeId, 64) || option.type != null) return fail('invalid_run');
    value.upgradeId = option.upgradeId;
  } else {
    return fail('invalid_enum');
  }
  if (option.replace !== undefined) {
    if (!isBool(option.replace)) return fail('invalid_run');
    value.replace = option.replace;
  }
  const extra = copyExtensions(option, value, OPTION_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateDraft(draft) {
  if (draft === null) return pass(null);
  if (!isPlain(draft) || !Array.isArray(draft.options) || draft.options.length !== 3) return fail('invalid_run');
  const options = [];
  const ids = new Set();
  const signatures = new Set();
  for (const option of draft.options) {
    const next = validateOption(option);
    if (!next.ok) return next;
    const signature = optionSignature(next.value);
    if (ids.has(next.value.id) || signatures.has(signature)) return fail('invalid_run');
    ids.add(next.value.id);
    signatures.add(signature);
    options.push(next.value);
  }
  const value = {options};
  const extra = copyExtensions(draft, value, DRAFT_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateDirector(director) {
  if (!isPlain(director)) return fail('invalid_run');
  if (!isInt(director.nextWave, 0, MAX_WAVE)) return fail(typeof director.nextWave === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!Array.isArray(director.queue)) return fail('invalid_run');
  if (director.queue.length > MAX_QUEUE) return fail('invalid_bounds');
  if (!isBool(director.done)) return fail('invalid_run');
  const queue = [];
  for (const item of director.queue) {
    const next = sanitizeJson(item);
    if (!next.ok) return next;
    queue.push(next.value);
  }
  const value = {nextWave: director.nextWave, queue, done: director.done};
  const extra = copyExtensions(director, value, DIRECTOR_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateSettlement(settlement, runId, difficulty) {
  if (settlement === null) return pass(null);
  if (!isPlain(settlement)) return fail('invalid_settlement');
  if (settlement.runId !== runId || !isId(settlement.runId, 96)) return fail('invalid_settlement');
  if (!isNum(settlement.currency, 0, MAX_CURRENCY)) return fail('invalid_settlement');
  if (settlement.difficulty !== difficulty || !isDifficulty(settlement.difficulty)) return fail('invalid_settlement');
  if (!RESULTS.has(settlement.result)) return fail('invalid_settlement');
  if (!isNum(settlement.time, 0, MAX_TIME)) return fail('invalid_settlement');
  if (!isInt(settlement.kills, 0, MAX_UNIT_KILLS)) return fail('invalid_settlement');
  if (!isInt(settlement.wave, 0, MAX_WAVE)) return fail('invalid_settlement');
  const value = {
    runId: settlement.runId,
    currency: settlement.currency,
    difficulty: settlement.difficulty,
    result: settlement.result,
    time: settlement.time,
    kills: settlement.kills,
    wave: settlement.wave
  };
  const extra = copyExtensions(settlement, value, SETTLEMENT_KEYS);
  if (!extra.ok) return fail(extra.reason === 'invalid_bounds' ? 'invalid_settlement' : 'invalid_settlement');
  return pass(value);
}

function validatePhaseShape(phase, draft, pendingUnit) {
  if (phase === 'draft') return draft !== null && pendingUnit === null;
  if (phase === 'placing') return draft !== null && pendingUnit !== null;
  return draft === null && pendingUnit === null;
}

function validateRun(state) {
  if (!isPlain(state)) return fail('invalid_run');
  if (state.version !== CONTRACT_VERSION) return fail('invalid_version');
  if (!isId(state.runId, 96)) return fail('invalid_run');
  if (!isInt(state.seed, 0, UINT32) || !isInt(state.rng, 0, UINT32)) return fail('invalid_bounds');
  if (!isInt(state.nextId, 1, MAX_NEXT_ID)) return fail('invalid_bounds');
  if (!isNum(state.time, 0, MAX_TIME) || !isInt(state.tick, 0, MAX_TICK)) return fail('invalid_bounds');
  if (!isNum(state.accumulator, -MAX_ABS_NUMBER, MAX_ABS_NUMBER)) return fail('invalid_bounds');
  if (!PHASES.has(state.phase)) return fail('invalid_enum');
  if (!isBool(state.paused) || !isBool(state.hiddenPaused)) return fail('invalid_run');
  const speed = canonicalSpeed(state.speed);
  if (speed === null) return fail('invalid_enum');
  if (!isDifficulty(state.difficulty)) return fail('invalid_enum');
  if (!isInt(state.wave, 0, MAX_WAVE)) return fail('invalid_bounds');
  if (!isNum(state.waveTime, 0, MAX_TIME)) return fail('invalid_bounds');
  if (!isInt(state.kills, 0, MAX_UNIT_KILLS)) return fail('invalid_bounds');
  if (!isNum(state.xp, 0, MAX_CURRENCY) || !isNum(state.nextDraftXp, 1e-6, MAX_CURRENCY)) return fail('invalid_bounds');
  if (!isInt(state.draftLevel, 0, MAX_WAVE)) return fail('invalid_bounds');
  if (!isBool(state.initialized) || !isBool(state.endless)) return fail('invalid_run');
  if (!Array.isArray(state.events)) return fail('invalid_run');
  if (!isPlain(state.fence)) return fail('invalid_run');
  if (!isNum(state.fence.maxHp, 1e-6, MAX_FENCE)) return fail('invalid_bounds');
  if (typeof state.fence.hp !== 'number' || !Number.isFinite(state.fence.hp)) return fail('invalid_run');
  const fenceHp = clampDust(state.fence.hp, state.fence.maxHp);
  if (fenceHp === null || fenceHp < 0) return fail('invalid_bounds');
  if (!isPlain(state.stats)) return fail('invalid_run');
  if (!isNum(state.stats.damage, 0, MAX_STAT) || !isNum(state.stats.fenceDamage, 0, MAX_STAT)) return fail('invalid_bounds');
  if (!isInt(state.stats.merges, 0, MAX_UNIT_KILLS) || !isInt(state.stats.crits, 0, MAX_UNIT_KILLS)) return fail('invalid_bounds');

  const director = validateDirector(state.director);
  if (!director.ok) return director;
  const draft = validateDraft(state.draft);
  if (!draft.ok) return draft;
  const snapshot = validateProfile(state.profileSnapshot);
  if (!snapshot.ok) return fail(snapshot.reason === 'invalid_version' ? 'invalid_version' : 'invalid_run');
  const settlement = validateSettlement(state.settlement, state.runId, state.difficulty);
  if (!settlement.ok) return settlement;

  if (!Array.isArray(state.slots) || state.slots.length !== 10) return fail('invalid_slots');
  if (!Array.isArray(state.enemies) || state.enemies.length > MAX_ENEMIES) {
    return fail(Array.isArray(state.enemies) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!Array.isArray(state.projectiles) || state.projectiles.length > MAX_PROJECTILES) {
    return fail(Array.isArray(state.projectiles) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!Array.isArray(state.clouds) || state.clouds.length > MAX_CLOUDS) {
    return fail(Array.isArray(state.clouds) ? 'invalid_bounds' : 'invalid_run');
  }

  const ids = new Set();
  const mark = {high: 0};
  const slots = [];
  let heroes = 0;
  for (let index = 0; index < 10; index++) {
    const slot = state.slots[index];
    if (!isPlain(slot) || slot.index !== index) return fail('invalid_slots');
    let unit = null;
    if (slot.unit !== null) {
      const next = validateUnit(slot.unit, 'any', ids, mark);
      if (!next.ok) return next;
      unit = next.value;
      if (unit.kind === 'hero') heroes++;
    }
    slots.push({...slotGeometry(index), unit});
  }
  if (heroes !== 1) return fail('invalid_hero');

  let pendingUnit = null;
  if (state.pendingUnit !== null) {
    if (!isPlain(state.pendingUnit) || !isBool(state.pendingUnit.replace)) return fail('invalid_run');
    const next = validateUnit(state.pendingUnit.unit, 'defender', ids, mark);
    if (!next.ok) return next;
    pendingUnit = {unit: next.value, replace: state.pendingUnit.replace};
    const extra = copyExtensions(state.pendingUnit, pendingUnit, PENDING_KEYS);
    if (!extra.ok) return extra;
  }
  if (!validatePhaseShape(state.phase, draft.value, pendingUnit)) return fail('invalid_run');

  const enemies = [];
  for (const enemy of state.enemies) {
    const next = validateEnemy(enemy, ids, mark);
    if (!next.ok) return next;
    enemies.push(next.value);
  }
  const projectiles = [];
  for (const projectile of state.projectiles) {
    const next = validateProjectile(projectile, ids, mark);
    if (!next.ok) return next;
    projectiles.push(next.value);
  }
  const clouds = [];
  for (const cloud of state.clouds) {
    const next = validateCloud(cloud, ids, mark);
    if (!next.ok) return next;
    clouds.push(next.value);
  }

  let nextId = state.nextId;
  if (nextId <= mark.high) {
    if (mark.high >= MAX_NEXT_ID) return fail('invalid_bounds');
    nextId = mark.high + 1;
  }

  const fence = {hp: fenceHp, maxHp: state.fence.maxHp};
  const fenceExtra = copyExtensions(state.fence, fence, FENCE_KEYS);
  if (!fenceExtra.ok) return fenceExtra;
  const stats = {
    damage: state.stats.damage,
    fenceDamage: state.stats.fenceDamage,
    merges: state.stats.merges,
    crits: state.stats.crits
  };
  const statsExtra = copyExtensions(state.stats, stats, STAT_KEYS);
  if (!statsExtra.ok) return statsExtra;

  const value = {
    version: CONTRACT_VERSION,
    runId: state.runId,
    seed: state.seed,
    rng: state.rng,
    nextId,
    time: state.time,
    tick: state.tick,
    accumulator: 0,
    phase: state.phase,
    paused: true,
    hiddenPaused: false,
    speed,
    difficulty: state.difficulty,
    wave: state.wave,
    waveTime: state.waveTime,
    director: director.value,
    kills: state.kills,
    xp: state.xp,
    nextDraftXp: state.nextDraftXp,
    draftLevel: state.draftLevel,
    fence,
    slots,
    enemies,
    projectiles,
    clouds,
    events: [],
    draft: draft.value,
    pendingUnit,
    profileSnapshot: snapshot.value,
    settlement: settlement.value,
    stats,
    initialized: state.initialized,
    endless: state.endless
  };
  if (state.systems !== undefined) {
    if (!isPlain(state.systems)) return fail('invalid_run');
    const systems = {};
    const systemsExtra = copyExtensions(state.systems, systems, new Set());
    if (!systemsExtra.ok) return systemsExtra;
    value.systems = systems;
  }
  const extra = copyExtensions(state, value, RUN_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function resolveStorage(storage, mode) {
  let store = storage;
  if (store === undefined) {
    try {
      store = globalThis.localStorage;
    } catch {
      return null;
    }
  }
  if (!store || typeof store.getItem !== 'function') return null;
  if ((mode === 'write' || mode === 'remove' || mode === 'import') && typeof store.setItem !== 'function') return null;
  if ((mode === 'remove' || mode === 'import') && typeof store.removeItem !== 'function') return null;
  return store;
}

function readRaw(storage, key) {
  let value;
  try {
    value = storage.getItem(key);
  } catch {
    return fail('storage_unavailable');
  }
  if (value == null) return pass(null);
  if (typeof value !== 'string') return fail('invalid_json');
  if (value.length > MAX_IMPORT_CHARS) return fail('too_large');
  return pass(value);
}

function writeRaw(storage, key, text) {
  try {
    storage.setItem(key, text);
    return pass(true);
  } catch (error) {
    return fail(isQuotaError(error) ? 'quota' : 'storage_unavailable');
  }
}

function removeRaw(storage, key) {
  try {
    storage.removeItem(key);
    return pass(true);
  } catch {
    return fail('storage_unavailable');
  }
}

function isQuotaError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return error.code === 22 || error.code === 1014;
}

function parseStored(raw, validate) {
  if (!raw.ok) return null;
  if (raw.value === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.value);
  } catch {
    return null;
  }
  const validated = validate(parsed);
  return validated.ok ? validated.value : null;
}

function encode(value, reason) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return fail(reason);
  }
  if (typeof text !== 'string' || text.length > MAX_IMPORT_CHARS) return fail('too_large');
  return pass(text);
}

function invalidInput(reason) {
  const error = new Error(reason);
  error.reason = reason;
  return error;
}

function restorePair(storage, hadProfile, prevProfile, hadRun, prevRun) {
  if (hadProfile) storage.setItem(PROFILE_KEY, prevProfile);
  else storage.removeItem(PROFILE_KEY);
  if (hadRun) storage.setItem(RUN_KEY, prevRun);
  else storage.removeItem(RUN_KEY);
}

export function loadProfile(storage) {
  const store = resolveStorage(storage, 'read');
  if (!store) return null;
  return parseStored(readRaw(store, PROFILE_KEY), validateProfile);
}

export function saveProfile(profile, storage) {
  const validated = validateProfile(profile);
  if (!validated.ok) return {ok: false, reason: validated.reason};
  const store = resolveStorage(storage, 'write');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const text = encode(validated.value, 'invalid_profile');
  if (!text.ok) return {ok: false, reason: text.reason};
  const written = writeRaw(store, PROFILE_KEY, text.value);
  return written.ok ? {ok: true} : {ok: false, reason: written.reason};
}

export function loadRun(storage) {
  const store = resolveStorage(storage, 'read');
  if (!store) return null;
  return parseStored(readRaw(store, RUN_KEY), validateRun);
}

export function saveRun(state, storage) {
  const validated = validateRun(state);
  if (!validated.ok) return {ok: false, reason: validated.reason};
  const store = resolveStorage(storage, 'write');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const text = encode(validated.value, 'invalid_run');
  if (!text.ok) return {ok: false, reason: text.reason};
  const written = writeRaw(store, RUN_KEY, text.value);
  return written.ok ? {ok: true} : {ok: false, reason: written.reason};
}

export function clearRun(storage) {
  const store = resolveStorage(storage, 'remove');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const removed = removeRaw(store, RUN_KEY);
  return removed.ok ? {ok: true} : {ok: false, reason: removed.reason};
}

export function exportSave(profile, state) {
  const validatedProfile = validateProfile(profile);
  if (!validatedProfile.ok) throw invalidInput(validatedProfile.reason);
  let run = null;
  if (state != null) {
    const validatedRun = validateRun(state);
    if (!validatedRun.ok) throw invalidInput(validatedRun.reason);
    run = validatedRun.value;
  }
  const text = encode({
    format: SAVE_FORMAT,
    version: CONTRACT_VERSION,
    profile: validatedProfile.value,
    run
  }, 'invalid_run');
  if (!text.ok) throw invalidInput(text.reason);
  return text.value;
}

export function importSave(text, storage) {
  if (typeof text !== 'string') return {ok: false, reason: 'invalid_json'};
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1).trim() : text.trim();
  if (!source) return {ok: false, reason: 'invalid_json'};
  if (source.length > MAX_IMPORT_CHARS) return {ok: false, reason: 'too_large'};
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {ok: false, reason: 'invalid_json'};
  }
  if (!isPlain(parsed)) return {ok: false, reason: 'invalid_format'};
  const keys = Object.keys(parsed);
  if (keys.length !== 4 || keys.some(key => !['format', 'version', 'profile', 'run'].includes(key))) {
    return {ok: false, reason: 'invalid_format'};
  }
  if (parsed.format !== SAVE_FORMAT) return {ok: false, reason: 'invalid_format'};
  if (parsed.version !== CONTRACT_VERSION) return {ok: false, reason: 'invalid_version'};
  const profile = validateProfile(parsed.profile);
  if (!profile.ok) return {ok: false, reason: profile.reason};
  let run = null;
  if (parsed.run !== null) {
    const validatedRun = validateRun(parsed.run);
    if (!validatedRun.ok) return {ok: false, reason: validatedRun.reason};
    run = validatedRun.value;
  }
  const store = resolveStorage(storage, 'import');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const profileText = encode(profile.value, 'invalid_profile');
  const runText = run ? encode(run, 'invalid_run') : null;
  if (!profileText.ok) return {ok: false, reason: profileText.reason};
  if (runText && !runText.ok) return {ok: false, reason: runText.reason};

  let prevProfile;
  let prevRun;
  try {
    prevProfile = store.getItem(PROFILE_KEY);
    prevRun = store.getItem(RUN_KEY);
  } catch {
    return {ok: false, reason: 'storage_unavailable'};
  }
  const hadProfile = typeof prevProfile === 'string';
  const hadRun = typeof prevRun === 'string';
  try {
    store.setItem(PROFILE_KEY, profileText.value);
    if (runText) store.setItem(RUN_KEY, runText.value);
    else store.removeItem(RUN_KEY);
  } catch (error) {
    try {
      restorePair(store, hadProfile, prevProfile, hadRun, prevRun);
    } catch {
      /* The failed write is still reported. A second storage failure cannot finish the rollback. */
    }
    return {ok: false, reason: isQuotaError(error) ? 'quota' : 'storage_unavailable'};
  }
  return {ok: true, profile: profile.value, run};
}
