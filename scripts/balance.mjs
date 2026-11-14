#!/usr/bin/env node
// Fencefall balance harness (worker 22). Seeded auto-player over engine and domain actions.
// Policy numbers live in POLICY_INFO. Docs: docs/BALANCE_METHOD.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advance, createProfile, createRun, setSpeed, step, takeEvents } from '../src/engine.js';
import * as engineApi from '../src/engine.js';
import { ARENA, BASE_TYPES, CONTRACT_VERSION, DIFFICULTIES, STEP, canPlan, clone, distance } from '../src/shared.js';
import { updateMovement } from '../src/systems/movement.js';
import { damageEnemy, updateCombat } from '../src/systems/combat.js';
import { updateStatuses } from '../src/systems/status.js';
import { WAVES, getWaveInfo, updateWaves } from '../src/systems/waves.js';
import { HERO_UPGRADES } from '../src/systems/hero.js';
import { TOWERS, getUnitStats } from '../src/data/towers.js';
import { RECIPES } from '../src/data/recipes.js';
import { mergeUnits, previewMerge } from '../src/systems/merges.js';
import { cancelPlacement, chooseDraft, placePending } from '../src/systems/drafts.js';
import { getProfileBonuses, settleRun } from '../src/systems/progression.js';

export const HARNESS_VERSION = 1;

const DOMAIN_UPDATERS = ['updateWaves', 'updateMovement', 'updateCombat', 'updateStatuses', 'updateDrafts'];
const KNOWN_PHASES = new Set(['playing', 'draft', 'placing', 'victory', 'defeat']);
const THREAT_X = [180, 150, 210, 110, 250, 70, 290];
const THREAT_SAMPLES = [];
for (const dy of [20, 70, 130]) {
  for (const x of THREAT_X) THREAT_SAMPLES.push({ x, y: ARENA.fenceY - dy });
}

export const POLICY_INFO = Object.freeze({
  greedy: Object.freeze({
    name: 'greedy',
    summary: 'Build one of each base role, place by measured reach, rank up extra copies, and take hero upgrades when the board is full.',
    planInterval: 30,
    maxMergesPerPlan: 3,
    reposition: true,
    preferHybrids: false,
    keepCoverage: true,
    weights: Object.freeze({ bolt: 1.15, fire: 1.1, frost: 1.05, lightning: 1.1, poison: 1, support: 0.95 }),
    thresholds: Object.freeze({ atLeast4Empty: 60, atLeast2Empty: 42, oneEmpty: 24, noneEmpty: 12 }),
  }),
  aggressive: Object.freeze({
    name: 'aggressive',
    summary: 'Prefer bolt, fire, and lightning, merge earlier, and favor hybrids with high listed damage, chain, or splash.',
    planInterval: 20,
    maxMergesPerPlan: 4,
    reposition: true,
    preferHybrids: true,
    keepCoverage: false,
    weights: Object.freeze({ bolt: 1.35, fire: 1.25, frost: 0.7, lightning: 1.4, poison: 0.75, support: 0.45 }),
    thresholds: Object.freeze({ atLeast4Empty: 28, atLeast2Empty: 16, oneEmpty: 8, noneEmpty: 8 }),
  }),
  control: Object.freeze({
    name: 'control',
    summary: 'Prefer frost, poison, and support, keep the last copy of a role, and merge mainly to open a slot or raise rank.',
    planInterval: 40,
    maxMergesPerPlan: 2,
    reposition: true,
    preferHybrids: false,
    keepCoverage: true,
    weights: Object.freeze({ bolt: 0.75, fire: 0.85, frost: 1.4, lightning: 1.05, poison: 1.35, support: 1.25 }),
    thresholds: Object.freeze({ atLeast4Empty: 70, atLeast2Empty: 48, oneEmpty: 36, noneEmpty: 18 }),
  }),
  random: Object.freeze({
    name: 'random',
    summary: 'Choose a legal draft and slot uniformly. Each planning pause has a 35% chance to confirm one random legal merge. No reposition.',
    planInterval: 30,
    maxMergesPerPlan: 1,
    reposition: false,
    preferHybrids: false,
    keepCoverage: false,
    randomMerges: true,
    mergeChance: 0.35,
    weights: Object.freeze({ bolt: 1, fire: 1, frost: 1, lightning: 1, poison: 1, support: 1 }),
    thresholds: Object.freeze({ atLeast4Empty: 0, atLeast2Empty: 0, oneEmpty: 0, noneEmpty: 0 }),
  }),
});

const READING = [
  'Each row is one automated policy on one seeded run at 1x fixed steps.',
  'Victory and defeat come from the simulation rules. Timeout means the active-time cap was reached while the run was still unresolved. Stalemate means the policy had no legal way to finish a draft or placement.',
  'Compare one policy across difficulties for the schedule. Compare policies on the same difficulty for heuristic strength. Neither comparison measures fun.',
  'Dead time is active simulation time with no living enemy. Planning pauses do not add to active time.',
  'Currency is the profile delta from the first settleRun after victory or defeat. Unresolved runs are not settled. A second settleRun is recorded only as an idempotency check.',
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round((value + Number.EPSILON) * p) / p;
}

function note(ctx, message) {
  if (!message || ctx.seenNotes.has(message)) return;
  ctx.seenNotes.add(message);
  if (ctx.notes.length < 60) ctx.notes.push(message);
}

function callSystem(system, fn) {
  try {
    return fn();
  } catch (err) {
    const wrapped = new Error(`${system}: ${err?.message || err}`);
    wrapped.system = system;
    wrapped.cause = err;
    throw wrapped;
  }
}

function functionBody(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = re.exec(src);
  if (!match) return '';
  let depth = 1;
  let i = match.index + match[0].length;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return src.slice(match.index, i);
}

export function inspectEngine() {
  let src = '';
  try {
    src = readFileSync(fileURLToPath(new URL('../src/engine.js', import.meta.url)), 'utf8');
  } catch (err) {
    return {
      mode: 'harness',
      stepHits: [],
      advanceHits: [],
      fileHits: [],
      detection: 'unreadable',
      note: `engine.js could not be read (${err?.message || err}). Domain ticks stay in the harness.`,
    };
  }
  const stepBody = functionBody(src, 'step');
  const advanceBody = functionBody(src, 'advance');
  const stepHits = DOMAIN_UPDATERS.filter(name => stepBody.includes(name));
  const advanceHits = DOMAIN_UPDATERS.filter(name => advanceBody.includes(name));
  const fileHits = DOMAIN_UPDATERS.filter(name => src.includes(name));
  let mode = 'harness';
  let detection = 'function-body';
  let text = null;
  if (stepHits.length >= 3) mode = 'engine-step';
  else if (advanceHits.length >= 3) mode = 'engine-advance';
  else if (fileHits.length >= 3) {
    mode = 'engine-step';
    detection = 'file-names';
    text = 'Domain updater names appear in engine.js outside a recognized step() or advance() body. The harness calls step() only, so ticks are not applied twice. Pass driveSystems "harness" when those names are comments or unused helpers.';
  }
  return { mode, stepHits, advanceHits, fileHits, detection, note: text };
}

function resolveDrive(requested) {
  const inspected = inspectEngine();
  const choice = requested || 'auto';
  if (choice === 'auto') return { ...inspected, requested: choice, forced: false };
  if (choice === 'engine') {
    const mode = inspected.mode === 'harness' ? 'engine-step' : inspected.mode;
    return { ...inspected, mode, requested: choice, forced: true };
  }
  if (choice === 'harness' || choice === 'engine-step' || choice === 'engine-advance') {
    return { ...inspected, mode: choice, requested: choice, forced: true };
  }
  return { ...inspected, requested: choice, forced: false, note: `Unknown driveSystems "${choice}". Using ${inspected.mode}.` };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, difficulty, name) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  const text = `${difficulty}\0${name}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function recipeList() {
  if (Array.isArray(RECIPES)) return RECIPES;
  if (RECIPES && typeof RECIPES === 'object') return Object.values(RECIPES);
  return [];
}

function scheduleLength() {
  if (Array.isArray(WAVES)) return WAVES.length;
  if (WAVES && typeof WAVES === 'object') return Object.keys(WAVES).length;
  return null;
}

function unitsOf(state) {
  const out = [];
  for (const slot of state?.slots || []) if (slot?.unit) out.push(slot.unit);
  return out;
}

function heroUnit(state) {
  return unitsOf(state).find(unit => unit.kind === 'hero') || null;
}

function emptySlots(state) {
  const out = [];
  for (const slot of state.slots || []) if (slot && !slot.unit) out.push(slot);
  return out;
}

function typeCount(state, type) {
  let count = 0;
  for (const unit of unitsOf(state)) if (unit.type === type) count += 1;
  return count;
}

function countLive(state) {
  const list = state?.enemies;
  if (!Array.isArray(list)) return 0;
  let count = 0;
  for (const enemy of list) {
    if (enemy && enemy.dead !== true && typeof enemy.hp === 'number' && enemy.hp > 0) count += 1;
  }
  return count;
}

function domainStamp(state) {
  return [
    state.phase,
    state.rng,
    state.nextId,
    state.wave,
    state.waveTime,
    state.xp,
    state.kills,
    state.draftLevel,
    state.enemies?.length ?? -1,
    state.projectiles?.length ?? -1,
    state.director?.done,
    state.director?.nextWave,
    state.director?.queue?.length ?? -1,
    state.fence?.hp,
    state.stats?.damage,
    state.stats?.merges,
  ].join('|');
}

function slotSnapshot(state) {
  try {
    return JSON.stringify({
      rng: state.rng,
      nextId: state.nextId,
      phase: state.phase,
      paused: state.paused,
      xp: state.xp,
      kills: state.kills,
      level: state.draftLevel,
      pending: state.pendingUnit?.unit?.id || null,
      merges: state.stats?.merges,
      fence: state.fence?.hp,
      slots: (state.slots || []).map(slot => slot?.unit || null),
    });
  } catch {
    return null;
  }
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const held = list[i];
    list[i] = list[j];
    list[j] = held;
  }
  return list;
}

function reachCount(slot, range) {
  if (!Number.isFinite(range) || range <= 0) return 0;
  let hits = 0;
  for (const point of THREAT_SAMPLES) if (distance(slot, point) <= range) hits += 1;
  return hits;
}

function safeStats(ctx, unit) {
  if (!unit) return { range: 0, damage: 0, interval: 1 };
  try {
    const stats = getUnitStats(unit, ctx.state);
    if (stats && typeof stats === 'object') return stats;
  } catch (err) {
    note(ctx, `getUnitStats ${unit.type}: ${err?.message || err}`);
  }
  const catalog = TOWERS?.[unit.type]?.stats;
  if (catalog && typeof catalog === 'object') return catalog;
  note(ctx, `missing stats for ${unit.type}; planning uses range 180`);
  return { range: 180, damage: 0, interval: 1 };
}

function effectObject(meta) {
  if (!meta || typeof meta !== 'object') return {};
  for (const key of ['effect', 'stat', 'stats', 'bonus']) {
    const value = meta[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
}

function effectHasNumber(effect) {
  return Object.values(effect).some(value => Number.isFinite(Number(value)));
}

function listedPower(stats) {
  const interval = Math.max(num(stats?.interval, 1), 0.05);
  let power = num(stats?.damage) / interval;
  power += num(stats?.splash) * 0.02;
  power += num(stats?.chain) * 2;
  power += num(stats?.pierce);
  if (stats?.burn) power += num(stats.burn.dps);
  if (stats?.poison) power += num(stats.poison.dps);
  if (stats?.slow) power += (1 - Math.min(1, Math.max(0, num(stats.slow.factor, 1)))) * 6;
  if (stats?.aura) power += (num(stats.aura.damage) + num(stats.aura.haste)) * 12;
  return power;
}

function isSupport(unit, stats) {
  return unit?.type === 'support' || !!stats?.aura;
}

function geometryScore(slot, unit, stats) {
  const range = num(stats?.range, 0);
  const hits = reachCount(slot, range);
  let score = hits * 3;
  score += (2 - Math.abs(slot.col - 2)) * 2;
  if (hits === 0) score -= 50;
  if (isSupport(unit, stats)) {
    if (slot.row === 1) score += 4;
  } else if (slot.row === 0) score += 3;
  return score;
}

function keepScore(ctx, slot) {
  const unit = slot.unit;
  const stats = safeStats(ctx, unit);
  let score = num(unit.rank) * 12 + listedPower(stats);
  if (unit.kind === 'hybrid') score += 6;
  if (typeCount(ctx.state, unit.type) >= 3) score -= 8;
  return score;
}

function upgradeMeta(id) {
  if (typeof id !== 'string' || !HERO_UPGRADES || !Object.prototype.hasOwnProperty.call(HERO_UPGRADES, id)) return null;
  return HERO_UPGRADES[id];
}

function scoreHeroOption(option, state) {
  const id = option.upgradeId || option.id;
  const meta = upgradeMeta(id);
  const current = num(heroUnit(state)?.upgrades?.[id]);
  if (meta) {
    const cap = Number.isFinite(Number(meta.cap)) ? Number(meta.cap) : (Number.isFinite(Number(meta.max)) ? Number(meta.max) : 99);
    if (current >= cap) return -1e8;
  }
  const effect = effectObject(meta);
  let score = 16;
  if (meta) {
    const cap = Number.isFinite(Number(meta.cap)) ? Number(meta.cap) : (Number.isFinite(Number(meta.max)) ? Number(meta.max) : 4);
    score += Math.max(0, cap - current) * 0.5;
  }
  score += num(effect.damage) * 48;
  score += num(effect.haste) * 36;
  score += num(effect.range) * 0.15;
  score += num(effect.critChance) * 28;
  score += num(effect.critMultiplier) * 8;
  score += num(effect.fence) * 0.04;
  if (!effectHasNumber(effect)) {
    const blob = String(id || '');
    if (/damage|power|might|atk|strength/i.test(blob)) score += 22;
    else if (/haste|speed|rate|aspd/i.test(blob)) score += 18;
    else if (/range|sight|reach/i.test(blob)) score += 16;
    else if (/crit/i.test(blob)) score += 14;
    else if (/fence|vital|armor|hp|health/i.test(blob)) score += 12;
  }
  const empty = emptySlots(state).length;
  if (empty === 0 && !option.replace) score += 85;
  else if (empty <= 2) score += 18;
  else if (empty >= 5) score -= 12;
  return score;
}

function scoreTowerOption(option, state, policy) {
  const type = option.type;
  if (!type) return -1e8;
  const weight = num(policy.weights?.[type], 0.8);
  const count = typeCount(state, type);
  let score = (30 - count * 12) * weight;
  if (count === 0) score += 24 * weight;
  if (option.replace) {
    if (emptySlots(state).length > 0) score -= 35;
    else score += 12 * weight;
  }
  return score;
}

function isHeroOption(option) {
  return option?.kind === 'hero_upgrade' || option?.kind === 'hero-upgrade';
}

function scoreDraftOption(option, state, policy) {
  if (!option || typeof option !== 'object') return -1e9;
  if (isHeroOption(option)) return scoreHeroOption(option, state);
  if (option.kind === 'tower') return scoreTowerOption(option, state, policy);
  return -1e9;
}

function thresholdFor(policy, empty) {
  const table = policy.thresholds || {};
  if (empty >= 4) return num(table.atLeast4Empty, 60);
  if (empty >= 2) return num(table.atLeast2Empty, 42);
  if (empty >= 1) return num(table.oneEmpty, 24);
  return num(table.noneEmpty, 12);
}

function recipeFor(type) {
  return recipeList().find(recipe => recipe && recipe.id === type) || null;
}

function scoreMerge(ctx, merge, policy) {
  const state = ctx.state;
  const source = state.slots[merge.from]?.unit;
  const target = state.slots[merge.to]?.unit;
  const result = merge.preview?.result;
  if (!source || !target || !result) return -1e9;
  const empty = emptySlots(state).length;
  const sameType = source.type === target.type && source.kind === target.kind;
  let score = 8 + num(result.rank) * 10;
  if (sameType) {
    score += 16;
    if (typeCount(state, source.type) >= 3) score += 18;
    if (typeCount(state, source.type) === 2 && num(result.rank) <= 2 && empty >= 2) score -= 20;
  } else {
    const recipe = recipeFor(result.type);
    const stats = recipe?.stats || {};
    let power = listedPower(stats);
    if (policy.name === 'control') {
      if (stats.slow) power += 12;
      if (stats.poison) power += 12;
      if (stats.aura) power += 8;
    }
    if (policy.name === 'aggressive') {
      power += num(stats.damage) * 0.4;
      if (num(stats.chain) > 0) power += 8;
      if (num(stats.splash) > 0) power += 6;
    }
    score += 10 + power * 0.8;
    if (policy.preferHybrids) score += 18;
    const coveragePenalty = policy.keepCoverage ? 25 : 5;
    if (typeCount(state, source.type) <= 1 && result.type !== source.type) score -= coveragePenalty;
    if (source.type !== target.type && typeCount(state, target.type) <= 1 && result.type !== target.type) score -= coveragePenalty;
  }
  if (empty === 0) score += 22;
  score += geometryScore(state.slots[merge.to], result, safeStats(ctx, result)) * 0.15;
  return score;
}

function buildPolicy(name) {
  const info = POLICY_INFO[name] || POLICY_INFO.greedy;
  return {
    ...info,
    name: info.name,
    pickDraft(ctx) {
      const options = ctx.state.draft?.options || [];
      const legal = [];
      for (let i = 0; i < options.length; i += 1) {
        if (ctx.failed?.has(i)) continue;
        const option = options[i];
        if (!option) continue;
        if (option.kind !== 'tower' && !isHeroOption(option)) {
          note(ctx.harness, `ignored draft kind ${option.kind}`);
          continue;
        }
        if (option?.kind === 'tower' && option.type && !BASE_TYPES.includes(option.type)) {
          note(ctx.harness, `draft offered non-base tower ${option.type}`);
        }
        legal.push(i);
      }
      if (!legal.length) return -1;
      if (this.randomMerges) {
        const rng = ctx.rng || ctx.harness?.rng;
        if (!rng) return legal[0];
        return legal[Math.floor(rng() * legal.length)];
      }
      let best = legal[0];
      let bestScore = -Infinity;
      for (const index of legal) {
        const score = scoreDraftOption(options[index], ctx.state, this);
        if (score > bestScore) {
          bestScore = score;
          best = index;
        }
      }
      return best;
    },
    rankedSlots(ctx, replacing) {
      const unit = ctx.state.pendingUnit?.unit;
      if (!unit) return [];
      const ranked = [];
      for (const slot of ctx.state.slots) {
        if (!slot || slot.unit?.kind === 'hero') continue;
        if (replacing) {
          if (!slot.unit) continue;
        } else if (slot.unit) continue;
        const stats = safeStats(ctx.harness, unit);
        let score = geometryScore(slot, unit, stats);
        if (replacing) score -= keepScore(ctx.harness, slot);
        ranked.push({ index: slot.index, replace: replacing, score });
      }
      if (this.randomMerges) {
        const rng = ctx.harness?.rng || ctx.rng;
        if (rng) shuffle(ranked, rng);
        return ranked;
      }
      ranked.sort((a, b) => b.score - a.score || a.index - b.index);
      return ranked;
    },
  };
}

export function resolvePolicy(policy) {
  if (policy && typeof policy === 'object') {
    const baseName = typeof policy.name === 'string' && POLICY_INFO[policy.name] ? policy.name : 'greedy';
    const base = buildPolicy(baseName);
    return {
      ...base,
      ...policy,
      name: policy.name || base.name,
      weights: policy.weights || base.weights,
      thresholds: policy.thresholds || base.thresholds,
    };
  }
  const name = typeof policy === 'string' && policy ? policy : 'greedy';
  return buildPolicy(POLICY_INFO[name] ? name : 'greedy');
}

function listMerges(ctx) {
  const state = ctx.state;
  const before = slotSnapshot(state);
  const found = [];
  let failures = 0;
  let firstError = '';
  for (let from = 0; from < state.slots.length; from += 1) {
    const source = state.slots[from]?.unit;
    if (!source) continue;
    for (let to = 0; to < state.slots.length; to += 1) {
      if (from === to) continue;
      const target = state.slots[to]?.unit;
      if (!target) continue;
      let preview = null;
      try {
        preview = previewMerge(state, from, to);
      } catch (err) {
        failures += 1;
        if (!firstError) firstError = err?.message || String(err);
        continue;
      }
      if (!preview || preview.ok === false || !preview.result) continue;
      if (source.kind === 'hero' || target.kind === 'hero' || preview.result.kind === 'hero') {
        note(ctx, 'previewMerge allowed a hero pair');
        continue;
      }
      found.push({ from, to, preview });
    }
  }
  const after = slotSnapshot(state);
  if (before != null && after != null && before !== after) {
    throw Object.assign(new Error('previewMerge mutated state'), { system: 'previewMerge' });
  }
  if (failures > 0) note(ctx, `previewMerge threw: ${firstError}`);
  return found;
}

function selectMerge(ctx, merges, banned) {
  const policy = ctx.policy;
  const open = merges.filter(merge => !banned.has(`${merge.from}->${merge.to}`));
  if (!open.length) return null;
  if (policy.randomMerges) {
    if (ctx.rng() >= num(policy.mergeChance, 0.35)) return null;
    const index = Math.min(open.length - 1, Math.floor(ctx.rng() * open.length));
    return open[index];
  }
  const threshold = thresholdFor(policy, emptySlots(ctx.state).length);
  let best = null;
  let bestScore = -Infinity;
  for (const merge of open) {
    const score = scoreMerge(ctx, merge, policy);
    if (score < threshold) continue;
    const better = score > bestScore + 1e-9;
    const tie = Math.abs(score - bestScore) <= 1e-9 && best && (merge.from < best.from || (merge.from === best.from && merge.to < best.to));
    if (!best || better || tie) {
      best = merge;
      bestScore = score;
    }
  }
  return best;
}

function applyMerge(ctx, choice) {
  const state = ctx.state;
  const source = state.slots[choice.from]?.unit;
  const target = state.slots[choice.to]?.unit;
  if (!source || !target || source.kind === 'hero' || target.kind === 'hero') {
    note(ctx, 'refused to execute a hero merge');
    ctx.decisions.failedActions += 1;
    return false;
  }
  const beforeIds = state.slots.map(slot => slot?.unit?.id || '').join(',');
  const beforeNext = state.nextId;
  const beforeMerges = num(state.stats?.merges);
  let result = null;
  try {
    result = mergeUnits(state, choice.from, choice.to);
  } catch (err) {
    note(ctx, `mergeUnits: ${err?.message || err}`);
    ctx.decisions.failedActions += 1;
    return false;
  }
  const afterIds = state.slots.map(slot => slot?.unit?.id || '').join(',');
  const changed = beforeIds !== afterIds;
  if (result?.ok === false || !changed) {
    ctx.decisions.failedActions += 1;
    if (result?.reason) note(ctx, `merge rejected: ${result.reason}`);
    else if (result?.ok === true) note(ctx, 'mergeUnits reported success without changing units');
    else note(ctx, 'merge rejected');
    return false;
  }
  ctx.decisions.merges += 1;
  if (state.nextId === beforeNext) note(ctx, 'mergeUnits did not advance nextId');
  if (num(state.stats?.merges) === beforeMerges) note(ctx, 'mergeUnits did not increment stats.merges');
  return true;
}

function planningMove(ctx, from, to) {
  const state = ctx.state;
  if (!canPlan(state)) return { ok: false, reason: 'not-planning' };
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to > 9 || from > 9) {
    return { ok: false, reason: 'bad-slot' };
  }
  const official = engineApi.moveUnit || engineApi.relocateUnit || engineApi.moveSlot || engineApi.swapUnits;
  if (typeof official === 'function') {
    try {
      return official(state, from, to) || { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message || String(err) };
    }
  }
  const left = state.slots[from];
  const right = state.slots[to];
  if (!left || !right) return { ok: false, reason: 'bad-slot' };
  const rng = state.rng;
  const nextId = state.nextId;
  const held = left.unit;
  left.unit = right.unit;
  right.unit = held;
  if (state.rng !== rng || state.nextId !== nextId) note(ctx, 'planning move changed rng or nextId');
  return { ok: true, local: true };
}

function reposition(ctx) {
  const state = ctx.state;
  if (!canPlan(state)) return;
  const movers = state.slots
    .filter(slot => slot?.unit && slot.unit.kind !== 'hero')
    .map(slot => ({ slot, range: num(safeStats(ctx, slot.unit).range, 0) }))
    .sort((a, b) => a.range - b.range || a.slot.index - b.slot.index);
  let moves = 0;
  for (const mover of movers) {
    if (moves >= 4) break;
    if (!mover.slot.unit || mover.slot.unit.kind === 'hero') continue;
    const current = geometryScore(mover.slot, mover.slot.unit, safeStats(ctx, mover.slot.unit));
    let best = null;
    let bestScore = current + 8;
    for (const slot of state.slots) {
      if (!slot || slot.unit) continue;
      const score = geometryScore(slot, mover.slot.unit, safeStats(ctx, mover.slot.unit));
      if (score > bestScore) {
        best = slot;
        bestScore = score;
      }
    }
    if (!best) continue;
    const moved = planningMove(ctx, mover.slot.index, best.index);
    if (moved?.ok === false) {
      note(ctx, `planning move rejected: ${moved.reason || 'unknown'}`);
      continue;
    }
    moves += 1;
    ctx.decisions.moves += 1;
  }
}

function runPlanning(ctx) {
  if (!canPlan(ctx.state)) {
    note(ctx, 'planning skipped because canPlan is false');
    return;
  }
  const towers = unitsOf(ctx.state).filter(unit => unit.kind !== 'hero');
  if (towers.length >= 2 && ctx.policy.randomMerges) {
    const choice = selectMerge(ctx, listMerges(ctx), new Set());
    if (choice) applyMerge(ctx, choice);
  } else if (towers.length >= 2) {
    const banned = new Set();
    const cap = Math.max(0, num(ctx.policy.maxMergesPerPlan, 3));
    let done = 0;
    let guard = 0;
    while (done < cap && guard < 8) {
      guard += 1;
      const choice = selectMerge(ctx, listMerges(ctx), banned);
      if (!choice) break;
      if (!applyMerge(ctx, choice)) {
        banned.add(`${choice.from}->${choice.to}`);
        continue;
      }
      done += 1;
    }
  }
  if (ctx.policy.reposition !== false && !ctx.policy.randomMerges) reposition(ctx);
}

function withPlanning(ctx, fn) {
  const state = ctx.state;
  const already = canPlan(state);
  const previous = state.paused;
  if (!already) state.paused = true;
  try {
    fn();
  } finally {
    if (!already) state.paused = previous;
  }
}

function draftIdentity(state) {
  const options = state.draft?.options;
  if (!Array.isArray(options)) return '';
  const body = options.map(option => [option?.id, option?.kind, option?.type, option?.upgradeId, option?.replace ? 1 : 0].join(':')).join('|');
  return `${state.draftLevel}>${body}`;
}

function needsDecision(state) {
  return state.phase === 'draft' || state.phase === 'placing' || !!state.pendingUnit;
}

function logChoice(ctx, option, index) {
  if (ctx.decisions.choices.length >= 40) return;
  ctx.decisions.choices.push({
    t: round(ctx.state.time, 3),
    index,
    kind: option?.kind || null,
    type: option?.type || null,
    upgradeId: option?.upgradeId || null,
    replace: !!option?.replace,
  });
}

function logPlacement(ctx, index, replace) {
  if (ctx.decisions.placementLog.length >= 40) return;
  const unit = ctx.state.slots[index]?.unit;
  ctx.decisions.placementLog.push({
    t: round(ctx.state.time, 3),
    slot: index,
    type: unit?.type || ctx.state.pendingUnit?.unit?.type || null,
    rank: unit?.rank ?? null,
    replace: !!replace,
  });
}

function rememberDraft(ctx, memory) {
  const key = draftIdentity(ctx.state);
  if (key !== memory.key) {
    memory.key = key;
    memory.failed = new Set();
    memory.planned = false;
    memory.optionIndex = null;
    memory.replace = false;
  }
}

function resolveDecisions(ctx, memory) {
  const state = ctx.state;
  rememberDraft(ctx, memory);
  if (state.phase === 'draft') {
    const options = state.draft?.options;
    if (!Array.isArray(options) || options.length === 0) {
      note(ctx, 'draft opened without options');
      return 'stuck';
    }
    if (!memory.planned) {
      runPlanning(ctx);
      ctx.decisions.draftPlans += 1;
      memory.planned = true;
    }
    const index = ctx.policy.pickDraft({
      state,
      failed: memory.failed,
      harness: ctx,
      rng: ctx.rng,
    });
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      note(ctx, 'no legal draft option left');
      return 'stuck';
    }
    const before = slotSnapshot(state);
    let result = null;
    try {
      result = chooseDraft(state, index);
    } catch (err) {
      memory.failed.add(index);
      ctx.decisions.failedActions += 1;
      note(ctx, `chooseDraft: ${err?.message || err}`);
      return 'retry';
    }
    const changed = before !== slotSnapshot(state);
    if (result?.ok === false || !changed) {
      memory.failed.add(index);
      ctx.decisions.failedActions += 1;
      note(ctx, `chooseDraft rejected ${index}${result?.reason ? `: ${result.reason}` : ''}`);
      return 'retry';
    }
    memory.optionIndex = index;
    memory.replace = !!options[index]?.replace;
    ctx.decisions.drafts += 1;
    logChoice(ctx, options[index], index);
    if (state.phase === 'playing') ctx.decisions.heroUpgrades += 1;
    if (ctx.firstDraftTime == null) {
      ctx.firstDraftTime = round(state.time, 3);
      ctx.firstDraftWave = num(state.wave);
    }
    return 'continue';
  }

  if (state.phase === 'placing' || state.pendingUnit) {
    if (!state.pendingUnit?.unit) {
      note(ctx, 'placing without a pending unit');
      return cancelBack(ctx, memory);
    }
    const replacing = !!(state.pendingUnit.replace || memory.replace);
    const ranked = ctx.policy.rankedSlots({ state, harness: ctx }, replacing);
    if (!ranked.length) return cancelBack(ctx, memory);
    for (const candidate of ranked) {
      const before = slotSnapshot(state);
      let result = null;
      try {
        result = placePending(state, candidate.index, { replace: !!candidate.replace });
      } catch (err) {
        note(ctx, `placePending: ${err?.message || err}`);
        ctx.decisions.failedActions += 1;
        continue;
      }
      const changed = before !== slotSnapshot(state);
      if (result?.ok === true && (state.phase === 'placing' || state.pendingUnit)) {
        note(ctx, 'placePending reported ok while placement is still open');
        return 'stuck';
      }
      if (result?.ok === false || !changed) {
        ctx.decisions.failedActions += 1;
        if (result?.ok === false && changed) {
          note(ctx, 'placePending failed after mutating the board');
          return 'stuck';
        }
        continue;
      }
      ctx.decisions.placements += 1;
      logPlacement(ctx, candidate.index, candidate.replace);
      return 'continue';
    }
    return cancelBack(ctx, memory);
  }
  return 'idle';
}

function cancelBack(ctx, memory) {
  const beforePhase = ctx.state.phase;
  try {
    cancelPlacement(ctx.state);
  } catch (err) {
    note(ctx, `cancelPlacement: ${err?.message || err}`);
    return 'stuck';
  }
  if (memory.optionIndex != null) memory.failed.add(memory.optionIndex);
  ctx.decisions.cancels += 1;
  if (ctx.state.phase === 'draft') return 'retry';
  if (ctx.state.phase === 'playing' && !ctx.state.pendingUnit) return 'continue';
  if (ctx.state.phase === beforePhase && (ctx.state.phase === 'placing' || ctx.state.pendingUnit)) {
    note(ctx, 'cancelPlacement left the run in placing');
    return 'stuck';
  }
  return 'stuck';
}

function clearDraftPause(ctx) {
  if (ctx.state.phase === 'playing' && ctx.state.paused) {
    ctx.state.paused = false;
    note(ctx, 'cleared paused after a decision so the clock can resume');
  }
}

function cleanupDead(state) {
  if (!Array.isArray(state.enemies) || state.enemies.length === 0) return;
  let write = 0;
  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    if (enemy && enemy.dead === true) continue;
    state.enemies[write] = enemy;
    write += 1;
  }
  state.enemies.length = write;
}

function resolveTerminal(state) {
  if (state.phase !== 'playing' || state.paused || state.hiddenPaused) return;
  if (!state.fence || !Number.isFinite(state.fence.hp)) {
    throw Object.assign(new Error('fence hp is missing or not finite'), { system: 'terminal' });
  }
  if (!(state.fence.hp > 0)) {
    state.fence.hp = 0;
    state.phase = 'defeat';
    return;
  }
  if (state.endless) return;
  const airborne = (Array.isArray(state.projectiles) && state.projectiles.length > 0)
    || (Array.isArray(state.clouds) && state.clouds.length > 0);
  if (state.director?.done === true && countLive(state) === 0 && !airborne) state.phase = 'victory';
}

function tickOnce(ctx) {
  const state = ctx.state;
  const mode = ctx.drive.mode;
  if (mode === 'engine-advance') {
    state.accumulator = 0;
    callSystem('advance', () => advance(state, STEP));
    return;
  }
  if (mode === 'engine-step') {
    callSystem('step', () => step(state, STEP));
    return;
  }
  const before = domainStamp(state);
  callSystem('step', () => step(state, STEP));
  if (domainStamp(state) !== before) {
    throw Object.assign(
      new Error('drive-mode conflict: engine step mutated domain state. Rerun with driveSystems "engine" or "engine-advance".'),
      { system: 'step' },
    );
  }
  if (state.phase !== 'playing' || state.paused || state.hiddenPaused) return;
  callSystem('updateWaves', () => updateWaves(state, STEP));
  callSystem('updateMovement', () => updateMovement(state, STEP));
  callSystem('updateStatuses', () => updateStatuses(state, STEP, damageEnemy));
  callSystem('updateCombat', () => updateCombat(state, STEP));
  cleanupDead(state);
  resolveTerminal(state);
  if (state.phase === 'playing' && !state.paused && !state.hiddenPaused) {
    callSystem('updateDrafts', () => updateDrafts(state));
  }
}

function drain(ctx) {
  if (ctx.drainEvents === false) return;
  let events = [];
  try {
    events = takeEvents(ctx.state) || [];
  } catch (err) {
    note(ctx, `takeEvents: ${err?.message || err}`);
    return;
  }
  for (const event of events) {
    const type = event?.type || 'unknown';
    ctx.eventCounts[type] = (ctx.eventCounts[type] || 0) + 1;
  }
}

function account(ctx, t0, damage0, fence0, liveBefore) {
  const state = ctx.state;
  const dt = num(state.time) - t0;
  if (!(dt > 0)) return;
  const liveAfter = countLive(state);
  const live = liveBefore > 0 || liveAfter > 0;
  if (live) ctx.combatTime += dt;
  else ctx.deadTime += dt;
  const dealt = num(state.stats?.damage) - damage0;
  const fenceLost = fence0 - num(state.fence?.hp);
  if (dealt < -1e-6) note(ctx, 'stats.damage decreased');
  const pressured = dealt > 1e-9 || fenceLost > 1e-9;
  if (!live || pressured) ctx.sincePressure = 0;
  else {
    ctx.sincePressure += dt;
    if (ctx.sincePressure > 3) ctx.stalledCombatTime += dt;
  }
  while (state.time + 1e-9 >= ctx.nextCheckpoint && ctx.checkpoints.length < 40) {
    ctx.checkpoints.push({
      t: round(state.time, 3),
      fenceHp: round(num(state.fence?.hp), 3),
      kills: num(state.kills),
      wave: num(state.wave),
      damage: round(num(state.stats?.damage), 3),
      live: countLive(state),
      draftLevel: num(state.draftLevel),
    });
    ctx.nextCheckpoint += 60;
  }
  if (ctx.firstDraftTime == null && (state.phase === 'draft' || num(state.draftLevel) > 0)) {
    ctx.firstDraftTime = round(state.time, 3);
    ctx.firstDraftWave = num(state.wave);
  }
}

function makeProfile(options) {
  if (options.profile && options.mutateProfile) return options.profile;
  if (options.profile) {
    try { return clone(options.profile); } catch { return createProfile('en'); }
  }
  return createProfile('en');
}

function readBonuses(ctx, profile) {
  try {
    const bonuses = getProfileBonuses(profile);
    return bonuses && typeof bonuses === 'object' ? compactJson(bonuses, 2000) : null;
  } catch (err) {
    note(ctx, `getProfileBonuses: ${err?.message || err}`);
    return null;
  }
}

function compactJson(value, limit) {
  try {
    const text = JSON.stringify(value);
    if (text.length <= limit) return JSON.parse(text);
    return { truncated: true, bytes: text.length };
  } catch {
    return null;
  }
}

function readWaveInfo(ctx) {
  try {
    const info = getWaveInfo(ctx.state);
    if (info == null) return null;
    return compactJson(info, 4000);
  } catch (err) {
    note(ctx, `getWaveInfo: ${err?.message || err}`);
    return null;
  }
}

function settle(ctx) {
  const state = ctx.state;
  if (!state || (state.phase !== 'victory' && state.phase !== 'defeat')) {
    ctx.settled = false;
    return;
  }
  const start = num(ctx.profile?.currency);
  const progress = slotSnapshot(state);
  let first = null;
  try {
    first = settleRun(ctx.profile, state);
  } catch (err) {
    note(ctx, `settleRun: ${err?.message || err}`);
    ctx.settled = false;
    ctx.settleError = err?.message || String(err);
    return;
  }
  const after = num(ctx.profile?.currency);
  if (progress != null && slotSnapshot(state) !== progress) note(ctx, 'settleRun changed run progress fields');
  let secondCurrency = after;
  try {
    settleRun(ctx.profile, state);
    secondCurrency = num(ctx.profile?.currency);
  } catch (err) {
    note(ctx, `settleRun repeat: ${err?.message || err}`);
    ctx.rewardIdempotent = false;
  }
  ctx.settled = true;
  ctx.currency = after - start;
  ctx.currencyAfterRepeat = secondCurrency - start;
  if (ctx.rewardIdempotent !== false) ctx.rewardIdempotent = secondCurrency === after;
  ctx.settleReturn = compactJson(first, 2000);
  ctx.settlement = compactJson(state.settlement, 4000);
}

function blankContext(options = {}) {
  const requested = options.policy ?? 'greedy';
  const policy = resolvePolicy(requested);
  const seedInput = Number(options.seed ?? 1001);
  const seed = Number.isFinite(seedInput) ? (seedInput >>> 0) : 1001;
  const maxTime = Number(options.maxTime ?? 1200);
  const difficultyRequested = typeof options.difficulty === 'string' && options.difficulty ? options.difficulty : 'normal';
  return {
    options,
    policy,
    policyRequested: typeof requested === 'string' ? requested : policy.name,
    seed,
    seedRequested: options.seed ?? 1001,
    difficultyRequested,
    maxTime,
    maxSteps: options.maxSteps == null ? Math.ceil(maxTime / STEP) + 30 : Number(options.maxSteps),
    drainEvents: options.drainEvents !== false,
    notes: [],
    seenNotes: new Set(),
    decisions: {
      drafts: 0,
      placements: 0,
      merges: 0,
      heroUpgrades: 0,
      cancels: 0,
      moves: 0,
      failedActions: 0,
      planningPauses: 0,
      draftPlans: 0,
      choices: [],
      placementLog: [],
    },
    eventCounts: {},
    checkpoints: [],
    combatTime: 0,
    deadTime: 0,
    stalledCombatTime: 0,
    sincePressure: 0,
    steps: 0,
    firstDraftTime: null,
    firstDraftWave: null,
    nextCheckpoint: 60,
    nextPlan: 30,
    currency: 0,
    currencyAfterRepeat: 0,
    rewardIdempotent: null,
    settled: false,
    settlement: null,
    settleReturn: null,
    startingBonuses: null,
    waveInfo: null,
    stopReason: null,
    error: null,
    failedSystem: null,
    state: null,
    profile: null,
    drive: null,
    rng: null,
    initialHeroCount: 0,
  };
}

function execute(ctx) {
  if (!Number.isFinite(ctx.maxTime) || ctx.maxTime < 0) {
    throw Object.assign(new Error('maxTime must be a non-negative finite number'), { system: 'options' });
  }
  if (!Number.isFinite(ctx.maxSteps) || ctx.maxSteps < 0) {
    throw Object.assign(new Error('maxSteps must be a non-negative finite number'), { system: 'options' });
  }
  if (ctx.policyRequested !== ctx.policy.name) note(ctx, `unknown policy ${ctx.policyRequested}; used ${ctx.policy.name}`);
  if (ctx.seedRequested !== ctx.seed && !Number.isFinite(Number(ctx.seedRequested))) note(ctx, 'non-finite seed replaced with 1001');
  ctx.profile = makeProfile(ctx.options);
  ctx.startingBonuses = readBonuses(ctx, ctx.profile);
  ctx.rng = mulberry32(mixSeed(ctx.seed, ctx.difficultyRequested, ctx.policy.name));
  ctx.state = createRun({
    seed: ctx.seed,
    difficulty: ctx.difficultyRequested,
    profile: ctx.profile,
    runId: ctx.options.runId || `balance-${ctx.difficultyRequested}-${ctx.seed}-${ctx.policy.name}`,
  });
  const state = ctx.state;
  setSpeed(state, 1);
  state.accumulator = 0;
  ctx.drive = resolveDrive(ctx.options.driveSystems || 'auto');
  if (ctx.drive.note) note(ctx, ctx.drive.note);
  if (state.difficulty !== ctx.difficultyRequested) note(ctx, `difficulty coerced to ${state.difficulty}`);
  ctx.initialHeroCount = unitsOf(state).filter(unit => unit.kind === 'hero').length;
  if (state.slots?.length !== 10) throw Object.assign(new Error('run does not have 10 slots'), { system: 'createRun' });
  if (ctx.initialHeroCount !== 1) note(ctx, `starting hero count is ${ctx.initialHeroCount}`);
  ctx.nextPlan = Math.max(1, num(ctx.policy.planInterval, 30));
  const memory = { key: '', failed: new Set(), planned: false, optionIndex: null, replace: false };
  let stall = 0;
  let decisionBudget = 0;

  while (ctx.steps < ctx.maxSteps && state.time < ctx.maxTime) {
    if (!Number.isFinite(state.time)) throw Object.assign(new Error('state.time is not finite'), { system: 'clock' });
    if (state.phase === 'victory' || state.phase === 'defeat') break;
    if (!KNOWN_PHASES.has(state.phase)) {
      throw Object.assign(new Error(`unexpected phase ${state.phase}`), { system: 'phase' });
    }
    if (needsDecision(state)) {
      let spins = 0;
      let signal = 'continue';
      while (needsDecision(state)) {
        decisionBudget += 1;
        spins += 1;
        if (spins > 16 || decisionBudget > 800) {
          signal = 'stuck';
          note(ctx, spins > 16 ? 'draft decision did not resolve' : 'decision budget exhausted');
          break;
        }
        signal = resolveDecisions(ctx, memory);
        drain(ctx);
        if (signal === 'stuck') break;
      }
      if (signal === 'stuck') {
        ctx.stopReason = 'stalemate';
        break;
      }
      if (state.phase === 'playing') {
        clearDraftPause(ctx);
        const interval = Math.max(1, num(ctx.policy.planInterval, 30));
        if (state.time + 1e-9 >= ctx.nextPlan) ctx.nextPlan = state.time + interval;
      }
      continue;
    }
    if (state.phase !== 'playing') {
      ctx.stopReason = 'stalemate';
      note(ctx, `unhandled phase ${state.phase}`);
      break;
    }
    if (state.hiddenPaused) {
      throw Object.assign(new Error('hiddenPaused stopped the headless run'), { system: 'clock' });
    }
    if (state.time + 1e-9 >= ctx.nextPlan) {
      withPlanning(ctx, () => runPlanning(ctx));
      ctx.decisions.planningPauses += 1;
      ctx.nextPlan = state.time + Math.max(1, num(ctx.policy.planInterval, 30));
      continue;
    }
    if (state.paused) throw Object.assign(new Error('paused flag set during play'), { system: 'clock' });
    const t0 = state.time;
    const tick0 = state.tick;
    const damage0 = num(state.stats?.damage);
    const fence0 = num(state.fence?.hp);
    const liveBefore = countLive(state);
    tickOnce(ctx);
    drain(ctx);
    if (state.tick === tick0 && state.time <= t0 + 1e-12) {
      stall += 1;
      if (stall >= 3) throw Object.assign(new Error('simulation clock did not advance'), { system: 'clock' });
      continue;
    }
    stall = 0;
    const advanced = state.tick - tick0;
    ctx.steps += Math.max(1, advanced);
    if (advanced > 1) note(ctx, `a driver call advanced ${advanced} ticks`);
    account(ctx, t0, damage0, fence0, liveBefore);
  }

  if (state.phase === 'victory') ctx.stopReason = 'victory';
  else if (state.phase === 'defeat') ctx.stopReason = 'defeat';
  else if (!ctx.stopReason) ctx.stopReason = ctx.steps >= ctx.maxSteps && state.time < ctx.maxTime ? 'steps' : 'time';
  settle(ctx);
  ctx.waveInfo = readWaveInfo(ctx);
  state.accumulator = 0;
}

function rosterOf(ctx) {
  if (!ctx.state?.slots) return [];
  return ctx.state.slots.map(slot => {
    const unit = slot?.unit;
    if (!unit) return null;
    const stats = safeStats(ctx, unit);
    const interval = num(stats.interval);
    return {
      slot: slot.index,
      row: slot.row,
      col: slot.col,
      id: unit.id,
      kind: unit.kind,
      type: unit.type,
      rank: unit.rank,
      kills: num(unit.kills),
      upgrades: compactJson(unit.upgrades || {}, 500),
      listed: {
        damage: round(num(stats.damage), 4),
        interval: round(interval, 4),
        range: round(num(stats.range), 3),
        dps: interval > 0 ? round(num(stats.damage) / interval, 4) : null,
        splash: round(num(stats.splash), 4),
        chain: num(stats.chain),
        pierce: num(stats.pierce),
        burn: !!stats.burn,
        slow: !!stats.slow,
        poison: !!stats.poison,
        aura: !!stats.aura,
      },
    };
  }).filter(Boolean);
}

function towerMixOf(roster) {
  const byType = {};
  const byKind = {};
  const byRank = {};
  for (const unit of roster) {
    byType[unit.type] = (byType[unit.type] || 0) + 1;
    byKind[unit.kind] = (byKind[unit.kind] || 0) + 1;
    const rank = String(unit.rank);
    byRank[rank] = (byRank[rank] || 0) + 1;
  }
  return { byType, byKind, byRank, filled: roster.length };
}

function toResult(ctx) {
  const state = ctx.state;
  const time = round(num(state?.time), 4);
  const fenceHp = state?.fence ? round(num(state.fence.hp), 4) : null;
  const fenceMaxHp = state?.fence ? round(num(state.fence.maxHp), 4) : null;
  const roster = state ? rosterOf(ctx) : [];
  const outcome = ctx.error ? 'error' : (ctx.stopReason === 'victory' ? 'victory' : (ctx.stopReason === 'defeat' ? 'defeat' : (ctx.stopReason === 'stalemate' ? 'stalemate' : (ctx.stopReason === 'clock' ? 'error' : 'timeout'))));
  const liveEnemies = state ? countLive(state) : 0;
  const active = num(state?.time);
  const result = {
    harnessVersion: HARNESS_VERSION,
    seed: ctx.seed,
    seedRequested: Number.isFinite(Number(ctx.seedRequested)) ? Number(ctx.seedRequested) : ctx.seedRequested,
    difficulty: state?.difficulty || null,
    difficultyRequested: ctx.difficultyRequested,
    difficultyParams: DIFFICULTIES[state?.difficulty] ? compactJson(DIFFICULTIES[state.difficulty], 1000) : null,
    policy: ctx.policy?.name || null,
    drive: ctx.drive?.mode || null,
    outcome,
    stopReason: ctx.error ? (ctx.stopReason || 'error') : ctx.stopReason,
    win: outcome === 'victory',
    loss: outcome === 'defeat',
    survived: outcome !== 'error' && fenceHp != null && fenceHp > 0,
    time: time ?? 0,
    activeTime: time ?? 0,
    ticks: num(state?.tick),
    steps: ctx.steps,
    wave: num(state?.wave),
    directorDone: state?.director?.done === true,
    directorNextWave: num(state?.director?.nextWave),
    queueRemaining: Array.isArray(state?.director?.queue) ? state.director.queue.length : null,
    kills: num(state?.kills),
    xp: round(num(state?.xp), 4),
    draftLevel: num(state?.draftLevel),
    firstDraftTime: ctx.firstDraftTime,
    firstDraftWave: ctx.firstDraftWave,
    fenceHp: fenceHp ?? 0,
    fenceMaxHp: fenceMaxHp ?? 0,
    fenceRatio: fenceMaxHp > 0 && fenceHp != null ? round(fenceHp / fenceMaxHp, 4) : null,
    damage: round(num(state?.stats?.damage), 4),
    fenceDamage: round(num(state?.stats?.fenceDamage), 4),
    crits: num(state?.stats?.crits),
    merges: num(state?.stats?.merges),
    deadTime: round(ctx.deadTime, 4),
    combatTime: round(ctx.combatTime, 4),
    deadShare: active > 0 ? round(ctx.deadTime / active, 4) : null,
    combatShare: active > 0 ? round(ctx.combatTime / active, 4) : null,
    stalledCombatTime: round(ctx.stalledCombatTime, 4),
    towerMix: towerMixOf(roster),
    roster,
    currency: round(ctx.currency, 4) ?? 0,
    currencyAfterRepeat: ctx.settled ? round(ctx.currencyAfterRepeat, 4) : null,
    rewardIdempotent: ctx.rewardIdempotent,
    settled: ctx.settled,
    settlement: ctx.settlement,
    settleReturn: ctx.settleReturn,
    startingBonuses: ctx.startingBonuses,
    decisions: ctx.decisions,
    eventCounts: ctx.eventCounts,
    checkpoints: ctx.checkpoints,
    liveEnemies,
    enemyRecords: Array.isArray(state?.enemies) ? state.enemies.length : 0,
    projectiles: Array.isArray(state?.projectiles) ? state.projectiles.length : 0,
    phase: state?.phase || null,
    endless: state?.endless === true,
    speed: num(state?.speed, 1),
    scheduledWaveCount: scheduleLength(),
    waveInfo: ctx.waveInfo,
    initialHeroCount: ctx.initialHeroCount,
    runId: state?.runId || null,
    notes: ctx.notes.slice(),
    error: ctx.error ? (ctx.error.message || String(ctx.error)) : null,
    failedSystem: ctx.failedSystem,
  };
  auditResult(result);
  return result;
}

function auditResult(result) {
  const problems = [];
  if (result.win && result.outcome !== 'victory') problems.push('audit: win flag mismatch');
  if (result.loss && result.outcome !== 'defeat') problems.push('audit: loss flag mismatch');
  if (result.deadTime != null && result.activeTime != null && result.deadTime > result.activeTime + 0.05) problems.push('audit: dead time exceeds active time');
  if (result.combatTime != null && result.activeTime != null && result.combatTime > result.activeTime + 0.05) problems.push('audit: combat time exceeds active time');
  const settleNoted = result.notes.some(item => String(item).startsWith('settleRun'));
  if ((result.outcome === 'victory' || result.outcome === 'defeat') && result.settled === false && !settleNoted) {
    problems.push('audit: finalized run was not settled');
  }
  for (const problem of problems) {
    if (!result.notes.includes(problem)) result.notes.push(problem);
  }
}

export function simulateRun(options = {}) {
  const started = performance.now();
  const ctx = blankContext(options);
  try {
    execute(ctx);
  } catch (err) {
    ctx.error = err;
    ctx.failedSystem = err?.system || ctx.failedSystem || null;
    if (!ctx.stopReason || ctx.stopReason === 'running') ctx.stopReason = 'error';
    if (ctx.state && (ctx.state.phase === 'victory' || ctx.state.phase === 'defeat') && !ctx.settled) {
      try { settle(ctx); } catch { /* settle already guards */ }
    }
  }
  const result = toResult(ctx);
  result.wallMs = round(performance.now() - started, 1);
  return result;
}

function values(runs, read) {
  return runs.map(read).filter(value => Number.isFinite(value));
}

function mean(list) {
  if (!list.length) return null;
  return round(list.reduce((sum, value) => sum + value, 0) / list.length, 4);
}

function extent(list) {
  if (!list.length) return { min: null, max: null };
  return { min: round(Math.min(...list), 4), max: round(Math.max(...list), 4) };
}

function aggregate(runs) {
  const counted = runs.filter(run => run.outcome !== 'error');
  const resolved = counted.filter(run => run.outcome === 'victory' || run.outcome === 'defeat');
  const times = values(counted, run => run.activeTime);
  const span = extent(times);
  const victories = counted.filter(run => run.outcome === 'victory').length;
  const defeats = counted.filter(run => run.outcome === 'defeat').length;
  const timeouts = counted.filter(run => run.outcome === 'timeout').length;
  const stalemates = counted.filter(run => run.outcome === 'stalemate').length;
  const errors = runs.length - counted.length;
  const rate = (count) => (counted.length ? round(count / counted.length, 4) : null);
  return {
    runs: runs.length,
    counted: counted.length,
    errors,
    victories,
    defeats,
    timeouts,
    stalemates,
    winRate: rate(victories),
    defeatRate: rate(defeats),
    timeoutRate: rate(timeouts),
    stalemateRate: rate(stalemates),
    meanActiveTime: mean(times),
    minActiveTime: span.min,
    maxActiveTime: span.max,
    meanResolvedTime: mean(values(resolved, run => run.activeTime)),
    meanFenceRatio: mean(values(counted, run => run.fenceRatio)),
    meanDamage: mean(values(counted, run => run.damage)),
    meanFenceDamage: mean(values(counted, run => run.fenceDamage)),
    meanKills: mean(values(counted, run => run.kills)),
    meanWave: mean(values(counted, run => run.wave)),
    meanDeadShare: mean(values(counted, run => run.deadShare)),
    meanCurrency: mean(values(counted.filter(run => run.settled), run => run.currency)),
    meanMerges: mean(values(counted, run => run.merges)),
    meanDraftLevel: mean(values(counted, run => run.draftLevel)),
    victoriesBefore10Min: counted.filter(run => run.outcome === 'victory' && run.activeTime < 600).length,
    incompleteTimeouts: counted.filter(run => run.outcome === 'timeout' && run.directorDone !== true).length,
  };
}

function group(runs, keyFn) {
  const buckets = new Map();
  for (const run of runs) {
    const key = keyFn(run);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(run);
  }
  const out = {};
  for (const [key, list] of buckets) out[key] = aggregate(list);
  return out;
}

function alertsFor(runs) {
  const alerts = [];
  const counted = runs.filter(run => run.outcome !== 'error');
  if (runs.length && runs.every(run => run.outcome === 'error')) alerts.push({ id: 'all-error', detail: 'Every run threw before a completed result.' });
  if (counted.length && counted.every(run => num(run.damage) === 0 && num(run.kills) === 0 && num(run.wave) === 0)) {
    alerts.push({ id: 'no-combat', detail: 'Counted runs dealt no damage, scored no kills, and started no wave.' });
  }
  const easy = counted.filter(run => run.difficulty === 'easy');
  if (easy.length >= 2 && easy.every(run => run.outcome === 'defeat') && mean(values(easy, run => run.activeTime)) < 120) {
    alerts.push({ id: 'easy-collapsed', detail: 'Every Easy run was a defeat and the mean active time was under 2 minutes.' });
  }
  for (const run of counted) {
    if (run.outcome === 'victory' && run.activeTime < 600) {
      alerts.push({ id: 'early-victory', detail: `${run.policy} ${run.difficulty} seed ${run.seed} won before 10 minutes (${run.activeTime}s).` });
    }
    if (run.outcome === 'timeout' && run.directorDone === true && run.liveEnemies === 0) {
      alerts.push({ id: 'schedule-complete-still-playing', detail: `${run.policy} ${run.difficulty} seed ${run.seed} finished the schedule with no living enemies and stayed unresolved.` });
    }
    if (run.rewardIdempotent === false) {
      alerts.push({ id: 'reward-repeat-paid', detail: `${run.policy} ${run.difficulty} seed ${run.seed} changed currency on a second settleRun.` });
    }
    if (run.notes?.some(item => String(item).includes('previewMerge mutated'))) {
      alerts.push({ id: 'preview-mutated', detail: `${run.policy} ${run.difficulty} seed ${run.seed} previewMerge mutated state.` });
    }
  }
  const byDifficulty = group(counted, run => run.difficulty || 'unknown');
  for (const [difficulty, stats] of Object.entries(byDifficulty)) {
    if (stats.meanDeadShare != null && stats.meanDeadShare > 0.4 && stats.meanActiveTime > 60) {
      alerts.push({ id: 'high-dead-time', detail: `${difficulty} mean empty-field share was ${stats.meanDeadShare}.` });
    }
  }
  for (const run of counted) {
    if (run.stalledCombatTime > 20) {
      alerts.push({ id: 'combat-stalled', detail: `${run.policy} ${run.difficulty} seed ${run.seed} spent ${run.stalledCombatTime}s with living enemies and no damage or fence loss after a 3s grace.` });
    }
  }
  return alerts.slice(0, 40);
}

export function summarizeRuns(runs) {
  const list = Array.isArray(runs) ? runs : [];
  return {
    overall: aggregate(list),
    byDifficulty: group(list, run => run.difficulty || 'unknown'),
    byPolicy: group(list, run => run.policy || 'unknown'),
    byPolicyDifficulty: group(list, run => `${run.policy || 'unknown'}|${run.difficulty || 'unknown'}`),
    alerts: alertsFor(list),
    averages: 'Means use every run except outcome error. meanResolvedTime uses victory and defeat only. meanCurrency uses settled runs only. Timeout rows pull meanActiveTime toward the cap.',
  };
}

function cell(value) {
  if (value == null || value === '') return 'n/a';
  return String(value).replaceAll('|', '/').replaceAll('\n', ' ');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Fencefall balance report');
  lines.push('');
  lines.push(`Generated ${report.generatedAt} by harness v${report.harnessVersion} on ${report.node}.`);
  lines.push('');
  if (report.quick) {
    lines.push('This file is a wiring smoke (`--quick`). Active time is capped far below the 10–20 minute target, so survival here is not a difficulty result.');
    lines.push('');
  }
  lines.push(`Driver requested \`${report.config.driveSystems}\`, resolved mode \`${report.drive?.mode}\`. Detection: ${report.drive?.detection || 'n/a'}.`);
  if (report.drive?.note) lines.push('');
  if (report.drive?.note) lines.push(report.drive.note);
  lines.push('');
  lines.push('## How to read this');
  lines.push('');
  for (const line of READING) lines.push(`- ${line}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| slice | runs | wins | defeats | timeouts | stalemates | errors | mean active s | resolved s | fence | damage | dead share | currency |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const slices = [['overall', report.summary.overall]];
  for (const [key, value] of Object.entries(report.summary.byPolicyDifficulty)) slices.push([key, value]);
  for (const [key, value] of slices) {
    lines.push(`| ${cell(key)} | ${cell(value.runs)} | ${cell(value.victories)} | ${cell(value.defeats)} | ${cell(value.timeouts)} | ${cell(value.stalemates)} | ${cell(value.errors)} | ${cell(value.meanActiveTime)} | ${cell(value.meanResolvedTime)} | ${cell(value.meanFenceRatio)} | ${cell(value.meanDamage)} | ${cell(value.meanDeadShare)} | ${cell(value.meanCurrency)} |`);
  }
  lines.push('');
  lines.push(report.summary.averages);
  lines.push('');
  lines.push('## Alerts');
  lines.push('');
  if (!report.summary.alerts.length) lines.push('No computed alerts.');
  for (const alert of report.summary.alerts) lines.push(`- \`${alert.id}\`: ${alert.detail}`);
  lines.push('');
  lines.push('## Runs');
  lines.push('');
  lines.push('| policy | difficulty | seed | outcome | active s | wave | fence hp | damage | dead share | merges | currency | towers |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const run of report.runs) {
    const mix = Object.entries(run.towerMix?.byType || {}).map(([type, count]) => `${type}:${count}`).join(', ');
    lines.push(`| ${cell(run.policy)} | ${cell(run.difficulty)} | ${cell(run.seed)} | ${cell(run.outcome)} | ${cell(run.activeTime)} | ${cell(run.wave)} | ${cell(run.fenceHp)} | ${cell(run.damage)} | ${cell(run.deadShare)} | ${cell(run.merges)} | ${cell(run.currency)} | ${cell(mix)} |`);
  }
  lines.push('');
  lines.push('Target window for a finished 1x run is about 12–16 minutes of active simulation, inside 10–20 minutes. Timeout at the cap means the schedule or the fight was still open.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function parseArgs(argv) {
  const opts = {
    seeds: [1001, 1002, 1003],
    difficulties: ['easy', 'normal', 'hard'],
    policies: ['greedy', 'random'],
    maxTime: 1200,
    maxSteps: null,
    driveSystems: 'auto',
    out: 'artifacts/balance-report.json',
    markdown: 'artifacts/balance-report.md',
    quick: false,
    help: false,
  };
  const args = argv.slice(2);
  const take = (inline, index) => {
    if (inline.includes('=')) return { value: inline.slice(inline.indexOf('=') + 1), index };
    const value = args[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`Missing value for ${inline}`);
    return { value, index: index + 1 };
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--quick') {
      opts.quick = true;
      opts.maxTime = 90;
      opts.seeds = [1001];
      opts.difficulties = ['easy', 'normal'];
      opts.policies = ['greedy'];
    } else if (arg.startsWith('--seeds')) {
      const next = take(arg, i); i = next.index;
      opts.seeds = next.value.split(',').map(part => Number(part.trim())).filter(part => Number.isFinite(part));
    } else if (arg.startsWith('--difficulties')) {
      const next = take(arg, i); i = next.index;
      opts.difficulties = next.value.split(',').map(part => part.trim()).filter(Boolean);
    } else if (arg.startsWith('--policies') || arg.startsWith('--policy')) {
      const next = take(arg, i); i = next.index;
      opts.policies = next.value.split(',').map(part => part.trim()).filter(Boolean);
    } else if (arg.startsWith('--max-time')) {
      const next = take(arg, i); i = next.index;
      opts.maxTime = Number(next.value);
    } else if (arg.startsWith('--max-steps')) {
      const next = take(arg, i); i = next.index;
      opts.maxSteps = Number(next.value);
    } else if (arg.startsWith('--drive')) {
      const next = take(arg, i); i = next.index;
      opts.driveSystems = next.value;
    } else if (arg.startsWith('--out')) {
      const next = take(arg, i); i = next.index;
      opts.out = next.value;
    } else if (arg.startsWith('--md')) {
      const next = take(arg, i); i = next.index;
      opts.markdown = next.value;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (!opts.seeds.length) throw new Error('Provide at least one finite seed');
  if (!opts.difficulties.length) throw new Error('Provide at least one difficulty');
  if (!opts.policies.length) throw new Error('Provide at least one policy');
  for (const difficulty of opts.difficulties) {
    if (!DIFFICULTIES[difficulty]) throw new Error(`Unknown difficulty ${difficulty}`);
  }
  for (const policy of opts.policies) {
    if (!POLICY_INFO[policy]) throw new Error(`Unknown policy ${policy}. Known: ${Object.keys(POLICY_INFO).join(', ')}`);
  }
  if (!['auto', 'engine', 'harness', 'engine-step', 'engine-advance'].includes(opts.driveSystems)) {
    throw new Error(`Unknown drive mode ${opts.driveSystems}`);
  }
  if (!Number.isFinite(opts.maxTime) || opts.maxTime < 0) throw new Error('max-time must be a non-negative number');
  if (opts.maxSteps != null && (!Number.isFinite(opts.maxSteps) || opts.maxSteps < 0)) throw new Error('max-steps must be a non-negative number');
  return opts;
}

function helpText() {
  return [
    'Fencefall balance harness',
    '',
    'Usage: node scripts/balance.mjs [options]',
    '',
    'Options:',
    '  --seeds 1001,1002,1003       Unsigned seeds',
    '  --difficulties easy,normal,hard',
    '  --policies greedy,random     greedy, aggressive, control, random',
    '  --max-time 1200              Active simulation seconds at 1x',
    '  --max-steps N                Tick backstop. Default is max-time/step + 30',
    '  --drive auto                 auto, harness, engine, engine-step, engine-advance',
    '  --out artifacts/balance-report.json',
    '  --md artifacts/balance-report.md',
    '  --quick                      90s smoke on easy and normal, one seed, greedy',
    '  --help',
    '',
    'Run from the repository root. The default matrix is the balance sample, not a fun rating.',
  ].join('\n');
}

export function main(argv = process.argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(helpText());
    return 0;
  }
  const drive = resolveDrive(opts.driveSystems);
  const runs = [];
  for (const policy of opts.policies) {
    for (const difficulty of opts.difficulties) {
      for (const seed of opts.seeds) {
        const result = simulateRun({
          seed,
          difficulty,
          policy,
          maxTime: opts.maxTime,
          maxSteps: opts.maxSteps,
          driveSystems: opts.driveSystems,
        });
        runs.push(result);
        const fence = result.fenceHp == null ? 'n/a' : result.fenceHp;
        console.log(`${result.policy} ${result.difficulty || difficulty} seed ${result.seed} -> ${result.outcome} t=${result.activeTime}s wave=${result.wave} fence=${fence} kills=${result.kills} dmg=${result.damage}${result.error ? ` error=${result.error}` : ''}`);
      }
    }
  }
  const summary = summarizeRuns(runs);
  const report = {
    harnessVersion: HARNESS_VERSION,
    contractVersion: CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    node: process.version,
    quick: opts.quick,
    step: STEP,
    scheduleLength: scheduleLength(),
    drive,
    policies: POLICY_INFO,
    config: {
      seeds: opts.seeds,
      difficulties: opts.difficulties,
      policies: opts.policies,
      maxTime: opts.maxTime,
      maxSteps: opts.maxSteps,
      driveSystems: opts.driveSystems,
    },
    targets: {
      acceptableActiveSeconds: [600, 1200],
      designActiveSeconds: [720, 960],
      detail: 'The brief asks for about 12–16 minutes of active simulation inside a 10–20 minute 1x run. Planning time stays outside state.time.',
    },
    reading: READING,
    runs,
    summary,
  };
  mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  mkdirSync(path.dirname(path.resolve(opts.markdown)), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(opts.markdown, renderMarkdown(report));
  console.log(`Wrote ${opts.out}`);
  console.log(`Wrote ${opts.markdown}`);
  const overall = summary.overall;
  console.log(`Counted ${overall.counted}/${overall.runs} runs. Wins ${overall.victories}, defeats ${overall.defeats}, timeouts ${overall.timeouts}, stalemates ${overall.stalemates}, errors ${overall.errors}.`);
  if (summary.alerts.length) console.log(`Alerts: ${summary.alerts.map(alert => alert.id).join(', ')}`);
  return overall.errors === overall.runs && overall.runs > 0 ? 1 : 0;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(err?.message || err);
    process.exitCode = 1;
  }
}
