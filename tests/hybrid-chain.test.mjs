import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP, createUnit, random, uid} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';
import {exportSave, importSave} from '../src/storage.js';

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${label}: ${actual} vs ${expected}`);
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function board(seed, runId) {
  const profile = createProfile();
  const state = createRun({seed, runId, difficulty: 'normal', profile});
  const hero = state.slots[2].unit;
  state.slots[7].unit = hero;
  state.slots[2].unit = null;
  hero.cooldown = 600;
  return {state, profile};
}

function place(state, type, kind) {
  const unit = createUnit(state, type, 1, kind);
  state.slots[2].unit = unit;
  return unit;
}

function spawn(state, x, y, extra = {}) {
  return spawnEnemy(state, 'shambler', {
    x,
    y,
    hp: 1e6,
    maxHp: 1e6,
    armor: 0,
    damage: 0,
    ...extra
  });
}

function column(state, slot, count, reach, gap) {
  const enemies = [];
  for (let i = 0; i < count; i += 1) enemies.push(spawn(state, slot.x, slot.y - reach - gap * i));
  return enemies;
}

function line(state, x, y, count, gap) {
  const enemies = [];
  for (let i = 0; i < count; i += 1) enemies.push(spawn(state, x, y - gap * i));
  return enemies;
}

function hitEvents(state) {
  return state.events.filter(event => event.type === 'hit');
}

function fireOnce(state) {
  updateCombat(state, STEP);
  const shots = state.events.filter(event => event.type === 'shot');
  assert.equal(shots.length, 1);
  assert.equal(hitEvents(state).length, 0);
  assert.equal(state.projectiles.length, 1);
  for (const slot of state.slots) {
    if (slot.unit) slot.unit.cooldown = 10;
  }
  return {shot: shots[0], projectile: state.projectiles[0]};
}

function settle(state) {
  for (let i = 0; i < 90 && state.projectiles.length > 0; i += 1) updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 0);
}

function fenceUntouched(state) {
  assert.equal(state.fence.hp, state.fence.maxHp);
  assert.equal(state.stats.fenceDamage, 0);
  assert.equal(state.kills, 0);
}

function freshField(state) {
  state.enemies = [];
  state.projectiles = [];
  state.events = [];
  state.stats.crits = 0;
  state.stats.damage = 0;
}

function mixedRng(chance, count) {
  for (let seed = 1; seed < 200000; seed += 1) {
    const shadow = {rng: seed >>> 0};
    const rolls = [];
    for (let i = 0; i < count; i += 1) rolls.push(random(shadow) < chance);
    if (rolls.includes(true) && rolls.includes(false)) return seed >>> 0;
  }
  throw new Error(`no mixed crit sequence for ${chance}`);
}

function rollCrits(rng, chance, count) {
  const shadow = {rng};
  const rolls = [];
  for (let i = 0; i < count; i += 1) rolls.push(random(shadow) < chance);
  return {rolls, rng: shadow.rng};
}

function chainGap(chainRange) {
  const gap = Math.min(64, Math.max(40, chainRange * 0.65));
  assert.ok(gap < chainRange, `gap ${gap} is outside chain range ${chainRange}`);
  return gap;
}

function launch(state, origin, target, fields) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const projectile = {
    id: uid(state, 'p'),
    sourceId: state.slots[7].unit.id,
    targetId: target.id,
    x: origin.x,
    y: origin.y,
    speed: 1800,
    damage: 10,
    crit: false,
    critMultiplier: 2,
    critChance: 0,
    tags: [],
    splash: 0,
    chain: 0,
    chainRange: 90,
    pierce: 0,
    visited: [],
    life: 3,
    dirx: dx / len,
    diry: dy / len,
    aimx: target.x,
    aimy: target.y,
    impactType: null,
    effects: {},
    mechanics: [],
    towerType: null,
    ...fields
  };
  state.projectiles.push(projectile);
  state.events = [];
  return projectile;
}

test('arcbolt stores critChance and each chain jump rolls its own crit', () => {
  const {state, profile} = board(11, 'arcbolt-chain');
  const slot = state.slots[2];
  const unit = place(state, 'arcbolt', 'hybrid');
  const stats = getUnitStats(unit, state);
  assert.equal(stats.pierce, 0);
  assert.equal(stats.splash, 0);
  assert.ok(stats.chain >= 2);
  assert.ok(stats.critChance > 0);
  const enemies = column(state, slot, stats.chain + 1, 150, chainGap(stats.chainRange));
  const fired = fireOnce(state);
  const projectile = fired.projectile;
  assert.equal(projectile.critChance, stats.critChance);
  assert.equal(projectile.critMultiplier, stats.critMultiplier);
  assert.equal(projectile.crit, fired.shot.crit);
  assert.equal(projectile.chain, stats.chain);
  assert.equal(projectile.pierce, 0);
  assert.equal(projectile.splash, 0);
  assert.equal(projectile.chainRange, stats.chainRange);

  state.rng = mixedRng(projectile.critChance, stats.chain);
  const loaded = importSave(exportSave(profile, state), memoryStorage());
  assert.equal(loaded.ok, true);
  const run = loaded.run;
  const saved = run.projectiles[0];
  assert.equal(saved.critChance, stats.critChance);
  assert.equal(saved.crit, projectile.crit);
  assert.equal(saved.critMultiplier, stats.critMultiplier);
  assert.equal(saved.chain, stats.chain);
  assert.equal(saved.pierce, 0);
  assert.equal(saved.splash, 0);
  const pausedRng = run.rng;
  updateCombat(run, STEP);
  assert.equal(run.rng, pausedRng);
  assert.equal(run.projectiles.length, 1);
  run.paused = false;
  const predicted = rollCrits(run.rng, saved.critChance, stats.chain);
  settle(run);

  const direct = hitEvents(run).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.attack), ['projectile', ...Array(stats.chain).fill('chain')]);
  assert.deepEqual(direct.map(event => event.targetId), enemies.map(enemy => enemy.id));
  assert.equal(direct[0].crit, projectile.crit);
  assert.deepEqual(direct.slice(1).map(event => event.crit), predicted.rolls);
  assert.ok(predicted.rolls.includes(true) && predicted.rolls.includes(false));
  assert.equal(run.rng, predicted.rng);
  for (const event of direct) near(event.damage, stats.damage * (event.crit ? stats.critMultiplier : 1), 'arcbolt hit');
  assert.equal(run.stats.crits, direct.filter(event => event.crit).length);
  fenceUntouched(run);
});

test('shatter chain jumps roll their own crit and still slow every target', () => {
  const {state} = board(12, 'shatter-chain');
  const slot = state.slots[2];
  const unit = place(state, 'shatter', 'hybrid');
  const stats = getUnitStats(unit, state);
  assert.equal(stats.pierce, 0);
  assert.equal(stats.splash, 0);
  assert.ok(stats.chain >= 3);
  assert.ok(stats.critChance > 0);
  assert.ok(stats.slow && stats.slow.factor > 0);
  const enemies = column(state, slot, stats.chain + 1, 150, chainGap(stats.chainRange));
  const fired = fireOnce(state);
  assert.equal(fired.projectile.critChance, stats.critChance);
  assert.equal(fired.projectile.critMultiplier, stats.critMultiplier);
  assert.equal(fired.projectile.chain, stats.chain);
  assert.equal(fired.projectile.pierce, 0);
  state.rng = mixedRng(fired.projectile.critChance, stats.chain);
  const predicted = rollCrits(state.rng, fired.projectile.critChance, stats.chain);
  const opening = fired.projectile.crit;
  settle(state);

  const direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.attack), ['projectile', ...Array(stats.chain).fill('chain')]);
  assert.deepEqual(direct.map(event => event.targetId), enemies.map(enemy => enemy.id));
  assert.equal(direct[0].crit, opening);
  assert.deepEqual(direct.slice(1).map(event => event.crit), predicted.rolls);
  assert.ok(predicted.rolls.includes(true) && predicted.rolls.includes(false));
  assert.equal(state.rng, predicted.rng);
  for (const event of direct) near(event.damage, stats.damage * (event.crit ? stats.critMultiplier : 1), 'shatter hit');
  for (const enemy of enemies) {
    const slow = enemy.statuses.find(status => status.type === 'slow');
    assert.ok(slow, enemy.id);
    near(slow.power, stats.slow.factor, 'shatter slow');
  }
  assert.equal(state.stats.crits, direct.filter(event => event.crit).length);
  fenceUntouched(state);
});

test('a chain with no crit chance keeps the fired roll and does not draw random numbers', () => {
  const {state} = board(13, 'lightning-chain');
  const slot = state.slots[2];
  const unit = place(state, 'lightning', 'tower');
  const stats = getUnitStats(unit, state);
  assert.equal(stats.critChance, 0);
  assert.equal(stats.pierce, 0);
  assert.ok(stats.chain >= 2);
  const enemies = column(state, slot, stats.chain + 1, 150, chainGap(stats.chainRange));
  const before = state.rng;
  const fired = fireOnce(state);
  assert.equal(state.rng, before);
  assert.equal(fired.projectile.critChance, 0);
  assert.equal(fired.projectile.crit, false);
  assert.equal(fired.projectile.critMultiplier, 1);
  assert.equal(fired.projectile.chain, stats.chain);
  assert.equal(fired.projectile.splash, 0);
  settle(state);
  assert.equal(state.rng, before);
  const direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.attack), ['projectile', ...Array(stats.chain).fill('chain')]);
  assert.deepEqual(direct.map(event => event.targetId), enemies.map(enemy => enemy.id));
  for (const event of direct) {
    assert.equal(event.crit, false);
    near(event.damage, stats.damage, 'lightning hit');
  }
  assert.equal(state.stats.crits, 0);
  fenceUntouched(state);
});

test('pierce keeps the fired crit and does not draw another random number', () => {
  const {state} = board(14, 'bolt-pierce');
  const slot = state.slots[2];
  const unit = place(state, 'bolt', 'tower');
  const stats = getUnitStats(unit, state);
  assert.ok(stats.critChance > 0);
  assert.equal(stats.chain, 0);
  assert.equal(stats.pierce, 1);
  assert.equal(stats.splash, 0);
  const enemies = column(state, slot, stats.pierce + 2, 150, 56);
  const aside = spawn(state, slot.x + 90, enemies[0].y);
  enemies[1].armor = 0.25;
  const before = state.rng;
  const fired = fireOnce(state);
  const shadow = {rng: before};
  random(shadow);
  assert.equal(state.rng, shadow.rng);
  assert.equal(fired.projectile.critChance, stats.critChance);
  assert.equal(fired.projectile.pierce, stats.pierce);
  assert.equal(fired.projectile.chain, 0);
  assert.equal(fired.projectile.splash, 0);
  if (fired.projectile.crit) assert.equal(fired.projectile.critMultiplier, stats.critMultiplier);
  else assert.equal(fired.projectile.critMultiplier, 1);
  settle(state);
  assert.equal(state.rng, shadow.rng);

  const direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.targetId), [enemies[0].id, enemies[1].id]);
  assert.deepEqual(direct.map(event => event.attack), ['projectile', 'pierce']);
  assert.equal(direct[0].crit, fired.shot.crit);
  assert.equal(direct[1].crit, fired.shot.crit);
  near(direct[1].damage, direct[0].damage * 0.75, 'pierce armor');
  assert.equal(enemies[2].hp, enemies[2].maxHp);
  assert.equal(aside.hp, aside.maxHp);
  assert.equal(state.stats.crits, fired.shot.crit ? 2 : 0);
  fenceUntouched(state);
});

test('splash keeps its radius, payload, and non-crit hit flag', () => {
  const {state} = board(15, 'fire-splash');
  const slot = state.slots[2];
  const unit = place(state, 'fire', 'tower');
  const stats = getUnitStats(unit, state);
  assert.equal(stats.critChance, 0);
  assert.equal(stats.chain, 0);
  assert.equal(stats.pierce, 0);
  assert.ok(stats.splash > 0);
  const primary = spawn(state, slot.x, slot.y - 150);
  const inside = spawn(state, slot.x + stats.splash * 0.5, primary.y, {armor: 0.5});
  const outside = spawn(state, slot.x, primary.y - (stats.splash + 24));
  const before = state.rng;
  const fired = fireOnce(state);
  assert.equal(fired.projectile.splash, stats.splash);
  assert.equal(fired.projectile.critChance, 0);
  assert.equal(fired.projectile.chain, 0);
  assert.equal(fired.projectile.pierce, 0);
  settle(state);
  assert.equal(state.rng, before);

  const events = hitEvents(state);
  const direct = events.filter(event => event.attack !== 'splash');
  const splash = events.filter(event => event.attack === 'splash');
  assert.equal(direct.length, 1);
  assert.equal(direct[0].targetId, primary.id);
  assert.equal(direct[0].crit, false);
  near(direct[0].damage, stats.damage, 'fire primary');
  assert.equal(splash.length, 1);
  assert.equal(splash[0].targetId, inside.id);
  assert.equal(splash[0].crit, false);
  near(splash[0].damage, stats.damage * 0.5, 'splash armor');
  assert.ok(primary.statuses.some(status => status.type === 'burn'));
  assert.ok(inside.statuses.some(status => status.type === 'burn'));
  assert.equal(outside.statuses.length, 0);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.stats.crits, 0);
  fenceUntouched(state);
});

test('a chain jump re-rolls only when critChance is greater than zero', () => {
  const {state} = board(16, 'manual-chain');
  freshField(state);
  const kept = line(state, 180, 360, 3, 48);
  const beforeKeep = state.rng;
  launch(state, {x: 180, y: kept[0].y + 24}, kept[0], {
    crit: true,
    critChance: 0,
    critMultiplier: 2,
    chain: 2
  });
  settle(state);
  assert.equal(state.rng, beforeKeep);
  let direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.attack), ['projectile', 'chain', 'chain']);
  assert.deepEqual(direct.map(event => event.targetId), kept.map(enemy => enemy.id));
  for (const event of direct) {
    assert.equal(event.crit, true);
    near(event.damage, 20, 'kept chain crit');
  }
  assert.equal(state.stats.crits, 3);

  freshField(state);
  const rerolled = line(state, 40, 340, 3, 48);
  rerolled[1].armor = 0.5;
  const beforeRoll = state.rng;
  launch(state, {x: 40, y: rerolled[0].y + 24}, rerolled[0], {
    crit: false,
    critChance: 1,
    critMultiplier: 2,
    chain: 2,
    damage: 10
  });
  settle(state);
  const shadow = {rng: beforeRoll};
  random(shadow);
  random(shadow);
  assert.equal(state.rng, shadow.rng);
  direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.targetId), rerolled.map(enemy => enemy.id));
  assert.deepEqual(direct.map(event => event.attack), ['projectile', 'chain', 'chain']);
  assert.equal(direct[0].crit, false);
  near(direct[0].damage, 10, 'opening keeps fired miss');
  assert.equal(direct[1].crit, true);
  near(direct[1].damage, 10, 'armored chain crit');
  assert.equal(direct[2].crit, true);
  near(direct[2].damage, 20, 'chain crit');
  assert.equal(state.stats.crits, 2);
  fenceUntouched(state);
});

test('pierce does not re-roll even when critChance is 1, including before a chain jump', () => {
  const {state} = board(17, 'manual-pierce');
  freshField(state);
  const pierced = line(state, 180, 360, 3, 48);
  const before = state.rng;
  launch(state, {x: 180, y: pierced[0].y + 24}, pierced[0], {
    crit: false,
    critChance: 1,
    critMultiplier: 2,
    pierce: 2
  });
  settle(state);
  assert.equal(state.rng, before);
  let direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.attack), ['projectile', 'pierce', 'pierce']);
  assert.deepEqual(direct.map(event => event.targetId), pierced.map(enemy => enemy.id));
  for (const event of direct) {
    assert.equal(event.crit, false);
    near(event.damage, 10, 'pierce keeps miss');
  }
  assert.equal(state.stats.crits, 0);

  freshField(state);
  const critLine = line(state, 80, 360, 3, 48);
  const beforeCrit = state.rng;
  launch(state, {x: 80, y: critLine[0].y + 24}, critLine[0], {
    crit: true,
    critChance: 1,
    critMultiplier: 2,
    pierce: 2
  });
  settle(state);
  assert.equal(state.rng, beforeCrit);
  direct = hitEvents(state).filter(event => event.attack !== 'splash');
  assert.deepEqual(direct.map(event => event.targetId), critLine.map(enemy => enemy.id));
  for (const event of direct) {
    assert.equal(event.crit, true);
    assert.equal(event.attack === 'projectile' || event.attack === 'pierce', true);
    near(event.damage, 20, 'pierce keeps crit');
  }
  assert.equal(state.stats.crits, 3);

  freshField(state);
  const primary = spawn(state, 220, 360);
  const second = spawn(state, 220, 312);
  const jumped = spawn(state, 275, 312);
  const beyond = spawn(state, 220, 250);
  const beforeJump = state.rng;
  launch(state, {x: 220, y: primary.y + 24}, primary, {
    crit: false,
    critChance: 1,
    critMultiplier: 3,
    damage: 10,
    pierce: 1,
    chain: 1,
    chainRange: 80
  });
  settle(state);
  const once = {rng: beforeJump};
  random(once);
  assert.equal(state.rng, once.rng);
  direct = hitEvents(state);
  assert.deepEqual(direct.map(event => event.targetId), [primary.id, second.id, jumped.id]);
  assert.deepEqual(direct.map(event => event.attack), ['projectile', 'pierce', 'chain']);
  assert.equal(direct[0].crit, false);
  near(direct[0].damage, 10, 'opening');
  assert.equal(direct[1].crit, false);
  near(direct[1].damage, 10, 'pierce');
  assert.equal(direct[2].crit, true);
  near(direct[2].damage, 30, 'chain after pierce');
  assert.equal(beyond.hp, beyond.maxHp);
  assert.equal(state.stats.crits, 1);
  fenceUntouched(state);
});

test('the opening hit keeps its fired crit, and splash of that hit does not use a later chain roll', () => {
  const {state} = board(18, 'manual-splash-chain');
  freshField(state);
  const only = spawn(state, 180, 360);
  const beforeOnly = state.rng;
  launch(state, {x: 180, y: only.y + 24}, only, {crit: false, critChance: 1, critMultiplier: 2});
  settle(state);
  assert.equal(state.rng, beforeOnly);
  let direct = hitEvents(state);
  assert.equal(direct.length, 1);
  assert.equal(direct[0].crit, false);
  near(direct[0].damage, 10, 'opening ignores stored chance');
  assert.equal(state.stats.crits, 0);

  freshField(state);
  const primary = spawn(state, 40, 300);
  const splashTarget = spawn(state, 56, 300);
  const outside = spawn(state, 40, 220);
  const beforeSplash = state.rng;
  launch(state, {x: 40, y: primary.y + 24}, primary, {
    crit: true,
    critChance: 1,
    critMultiplier: 2,
    splash: 30
  });
  settle(state);
  assert.equal(state.rng, beforeSplash);
  const splashEvents = hitEvents(state);
  assert.equal(splashEvents.length, 2);
  assert.equal(splashEvents[0].targetId, primary.id);
  assert.equal(splashEvents[0].crit, true);
  near(splashEvents[0].damage, 20, 'fired crit');
  assert.equal(splashEvents[1].targetId, splashTarget.id);
  assert.equal(splashEvents[1].attack, 'splash');
  assert.equal(splashEvents[1].crit, false);
  near(splashEvents[1].damage, 20, 'splash uses fired crit damage');
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(state.stats.crits, 1);

  freshField(state);
  const chained = spawn(state, 200, 320);
  const splashed = spawn(state, 200, 300);
  const missed = spawn(state, 200, 160);
  const beforeChain = state.rng;
  launch(state, {x: 200, y: chained.y + 24}, chained, {
    crit: false,
    critChance: 1,
    critMultiplier: 2,
    damage: 10,
    splash: 36,
    chain: 1,
    chainRange: 70,
    effects: {burn: {dps: 3, duration: 2}}
  });
  settle(state);
  const chainShadow = {rng: beforeChain};
  random(chainShadow);
  assert.equal(state.rng, chainShadow.rng);
  const events = hitEvents(state);
  assert.deepEqual(events.map(event => [event.targetId, event.attack, event.crit, event.damage]), [
    [chained.id, 'projectile', false, 10],
    [splashed.id, 'splash', false, 10],
    [splashed.id, 'chain', true, 20],
    [chained.id, 'splash', false, 20]
  ]);
  assert.ok(chained.statuses.some(status => status.type === 'burn'));
  assert.ok(splashed.statuses.some(status => status.type === 'burn'));
  assert.equal(missed.statuses.length, 0);
  assert.equal(missed.hp, missed.maxHp);
  assert.equal(state.stats.crits, 1);
  fenceUntouched(state);
});
