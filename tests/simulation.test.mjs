// Simulation verification for the Fencefall contract.
// Domain modules are imported from their documented paths. The scaffold
// engine.step only advances the clock, so domain checks call the systems in
// the lead integration order at the fixed STEP. Speed must not rescale those
// steps, and equal step counts must match across 1x / 1.5x / 3x / 10x.
import test, {describe} from 'node:test';
import assert from 'node:assert/strict';
import {createRun, advance, setSpeed} from '../src/engine.js';
import {ARENA, DIFFICULTIES, STEP, BASE_TYPES, createUnit, distance, slotGeometry} from '../src/shared.js';
import {sampleSpawnX, spawnEnemy, updateMovement} from '../src/systems/movement.js';
import {updateCombat, damageEnemy, killEnemy} from '../src/systems/combat.js';
import {applyStatus, updateStatuses, getSpeedFactor} from '../src/systems/status.js';
import {ENEMIES} from '../src/data/enemies.js';
import {updateWaves, getWaveInfo, WAVES} from '../src/systems/waves.js';
import {HERO_UPGRADES, getHeroStats, applyHeroUpgrade} from '../src/systems/hero.js';
import {TOWERS, getUnitStats} from '../src/data/towers.js';

const KINDS = ['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss'];
const SLOT_X = Array.from({length: ARENA.cols}, (_, col) => slotGeometry(col).x);
const STATUS_TYPES = ['burn', 'poison', 'slow', 'stun', 'brittle'];

function nearly(actual, expected, tol, label) {
  assert.ok(Number.isFinite(actual), `${label}: ${actual} is not finite`);
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, expected ${expected} ± ${tol}`);
}

function heroCount(state) {
  return state.slots.filter(slot => slot.unit?.kind === 'hero').length;
}

function emptyBoard(state) {
  for (const slot of state.slots) slot.unit = null;
}

function fresh(seed, extra = {}) {
  return createRun({seed, runId: extra.runId || `sim-${seed}-${extra.difficulty || 'normal'}`, ...extra});
}

function spawnStat(difficulty, kind, overrides = {}) {
  const state = fresh(440, {difficulty, runId: `${difficulty}:${kind}:${overrides.healthScale || ''}:${overrides.hp || ''}`});
  const enemy = spawnEnemy(state, kind, {x: 200, y: ARENA.spawnY, ...overrides});
  return {state, enemy};
}

function assertRatio(actual, base, multiplier, label) {
  assert.ok(base > 0 && Number.isFinite(actual), `${label}: base ${base} actual ${actual}`);
  const ratio = actual / base;
  const tol = Math.max(0.045, 1 / base);
  assert.ok(Math.abs(ratio - multiplier) <= tol, `${label}: ratio ${ratio} vs ${multiplier} (${actual} / ${base})`);
}

function domainStep(state, dt = STEP) {
  state.time += dt;
  state.tick += 1;
  updateWaves(state, dt);
  updateMovement(state, dt);
  updateStatuses(state, dt, damageEnemy);
  updateCombat(state, dt);
}

function advanceLike(state, realDt) {
  if (!Number.isFinite(realDt) || realDt < 0) return;
  if (state.phase !== 'playing' || state.paused || state.hiddenPaused) {
    state.accumulator = 0;
    return;
  }
  state.accumulator += Math.min(realDt, 0.25) * state.speed;
  let count = 0;
  while (state.accumulator + 1e-10 >= STEP && count++ < 150) {
    domainStep(state, STEP);
    state.accumulator -= STEP;
    if (state.phase !== 'playing') {
      state.accumulator = 0;
      break;
    }
  }
}

function pump(fn, state, seconds) {
  let left = seconds;
  while (left > 1e-9) {
    const chunk = Math.min(0.25, left);
    fn(state, chunk);
    left -= chunk;
  }
}

function repeat(n, fn) {
  for (let i = 0; i < n; i++) fn(i);
}

function moveFor(state, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    state.time += STEP;
    updateMovement(state, STEP);
  }
}

function tickStatuses(state, seconds, cb = damageEnemy) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) updateStatuses(state, STEP, cb);
}

function digest(state) {
  return JSON.stringify({
    tick: state.tick,
    time: state.time,
    kills: state.kills,
    xp: state.xp,
    fence: state.fence.hp,
    phase: state.phase,
    wave: state.wave,
    done: state.director?.done,
    stats: state.stats,
    enemies: state.enemies.map(enemy => ({
      id: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      dead: enemy.dead
    })),
    projectiles: state.projectiles.map(projectile => ({
      id: projectile.id,
      x: projectile.x,
      y: projectile.y,
      targetId: projectile.targetId,
      damage: projectile.damage
    })),
    slots: state.slots.map(slot => slot.unit ? [slot.unit.id, slot.unit.kind, slot.unit.type, slot.unit.rank, slot.unit.cooldown, slot.unit.kills] : null)
  });
}

function summarizeX(xs) {
  const n = xs.length;
  const lo = ARENA.enemyMinX;
  const hi = ARENA.enemyMaxX;
  const span = hi - lo;
  const leftEnd = lo + span / 3;
  const rightStart = hi - span / 3;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  let left = 0;
  let mid = 0;
  let right = 0;
  let edge = 0;
  for (const x of xs) {
    sum += x;
    sumSq += x * x;
    if (x < min) min = x;
    if (x > max) max = x;
    if (x < leftEnd) left += 1;
    else if (x >= rightStart) right += 1;
    else mid += 1;
    if (x <= lo + 0.25 || x >= hi - 0.25) edge += 1;
  }
  const mean = sum / n;
  return {n, mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), min, max, left, mid, right, edge};
}

function finiteNumber(value, label) {
  assert.equal(typeof value, 'number', label);
  assert.ok(Number.isFinite(value), label);
}

function assertEnemyShape(enemy) {
  assert.equal(typeof enemy.id, 'string');
  assert.equal(enemy.dead, false);
  assert.equal(enemy.attacking, false);
  assert.ok(Array.isArray(enemy.statuses));
  for (const key of ['x', 'y', 'hp', 'maxHp', 'speed', 'radius', 'damage', 'attackInterval', 'attackCooldown', 'xp', 'armor', 'driftPhase']) {
    finiteNumber(enemy[key], key);
  }
  const drift = enemy.driftVelocity;
  if (typeof drift === 'number') finiteNumber(drift, 'driftVelocity');
  else {
    assert.ok(drift && typeof drift === 'object' && !Array.isArray(drift), 'driftVelocity');
    const nums = Object.values(drift).filter(value => typeof value === 'number');
    assert.ok(nums.length > 0, 'driftVelocity has a numeric component');
    for (const value of nums) assert.ok(Number.isFinite(value), 'driftVelocity component');
  }
  assert.ok(enemy.hp > 0 && enemy.maxHp >= enemy.hp);
  assert.ok(enemy.speed > 0 && enemy.radius > 0 && enemy.damage > 0);
  assert.ok(enemy.attackInterval > 0 && enemy.xp > 0);
  assert.ok(enemy.armor >= 0 && enemy.armor <= 0.8);
  assert.ok(enemy.x >= ARENA.enemyMinX && enemy.x <= ARENA.enemyMaxX);
}

function rearReach() {
  const probe = spawnEnemy(fresh(8, {runId: 'radius-probe'}), 'shambler', {x: 180, y: 0});
  return ARENA.backY - (ARENA.fenceY - probe.radius);
}

function placeTower(state, slotIndex, type) {
  const unit = createUnit(state, type, 1, 'tower');
  unit.cooldown = 0;
  state.slots[slotIndex].unit = unit;
  return unit;
}

function combatWatch(state, steps) {
  const targeted = new Set();
  const projectileIds = new Set();
  let shots = 0;
  for (let i = 0; i < steps; i++) {
    updateCombat(state, STEP);
    for (const event of state.events) {
      if (event.type === 'shot') shots += 1;
      if (event.targetId) targeted.add(event.targetId);
    }
    for (const projectile of state.projectiles) {
      if (!projectileIds.has(projectile.id)) projectileIds.add(projectile.id);
      if (projectile.targetId) targeted.add(projectile.targetId);
    }
    state.events.length = 0;
  }
  return {shots, targeted, projectiles: projectileIds.size};
}

function engaged(enemy, hp0, watch) {
  return enemy.dead || enemy.hp < hp0 - 0.01 || watch.targeted.has(enemy.id);
}

describe('simulation', {concurrency: 1}, () => {
  test('spawn X is bounded, center-weighted, and not piled on the edges', () => {
    const state = fresh(20261114, {runId: 'gauss'});
    const nextId = state.nextId;
    const xs = [];
    for (let i = 0; i < 2000; i++) xs.push(sampleSpawnX(state));
    const stats = summarizeX(xs);
    assert.ok(stats.min >= ARENA.enemyMinX && stats.max <= ARENA.enemyMaxX, `bounds ${stats.min}..${stats.max}`);
    assert.ok(xs.every(Number.isFinite));
    nearly(stats.mean, 180, 8, 'spawn mean');
    assert.ok(stats.std > 45 && stats.std < 78, `spawn std ${stats.std}`);
    assert.ok(stats.mid > stats.n * 0.48, `center band ${stats.mid}/${stats.n}`);
    assert.ok(stats.mid > stats.left && stats.mid > stats.right, `thirds L${stats.left} M${stats.mid} R${stats.right}`);
    assert.ok(stats.edge < 6, `edge pileup ${stats.edge}/${stats.n}`);
    assert.equal(state.enemies.length, 0);
    assert.equal(state.nextId, nextId);
    assert.notEqual(state.rng, 20261114 >>> 0);
    assert.equal(heroCount(state), 1);
  });

  test('tight rejection sampling does not clamp a shifted Gaussian onto x=14', () => {
    const state = fresh(99, {runId: 'reject'});
    const xs = Array.from({length: 800}, () => sampleSpawnX(state, 0, 18));
    const stats = summarizeX(xs);
    const piled = xs.filter(x => x < ARENA.enemyMinX + 0.5).length;
    assert.ok(stats.min >= ARENA.enemyMinX && stats.max <= ARENA.enemyMaxX);
    assert.ok(stats.mean > 22 && stats.mean < 50, `truncated mean ${stats.mean}`);
    assert.ok(piled / xs.length < 0.2, `left clamp fraction ${piled / xs.length}`);
  });

  test('spawn X is reproducible from the seed and is not a single point', () => {
    const a = fresh(77, {runId: 'gx-a'});
    const b = fresh(77, {runId: 'gx-b'});
    const c = fresh(78, {runId: 'gx-c'});
    const left = [];
    const right = [];
    const other = [];
    for (let i = 0; i < 40; i++) {
      left.push(sampleSpawnX(a));
      right.push(sampleSpawnX(b));
      other.push(sampleSpawnX(c));
    }
    assert.deepEqual(left, right);
    assert.notDeepEqual(left, other);
    assert.ok(new Set(left.map(x => Math.round(x * 10) / 10)).size > 8);
  });

  test('spawned enemies use a bounded center-weighted spread rather than columns', () => {
    const state = fresh(1234, {runId: 'spawn-spread'});
    const xs = [];
    for (let i = 0; i < 600; i++) xs.push(spawnEnemy(state, 'shambler').x);
    const stats = summarizeX(xs);
    const buckets = new Set(xs.map(x => Math.round(x)));
    assert.ok(stats.min >= ARENA.enemyMinX && stats.max <= ARENA.enemyMaxX);
    nearly(stats.mean, 180, 12, 'spawned mean');
    assert.ok(stats.mid > xs.length * 0.45, `spawned center ${stats.mid}/${xs.length}`);
    assert.ok(stats.edge < 4, `spawned edge pileup ${stats.edge}`);
    assert.ok(buckets.size > 12, `distinct x ${buckets.size}`);
    assert.equal(state.enemies.length, 600);
    assert.equal(state.kills, 0);
    assert.equal(state.xp, 0);
    assert.equal(state.fence.hp, state.fence.maxHp);
  });

  test('enemy catalog spawns seven distinct roles with finite contract fields', () => {
    for (const kind of KINDS) {
      assert.ok(ENEMIES[kind], kind);
      for (const text of [ENEMIES[kind].name?.en, ENEMIES[kind].name?.zh, ENEMIES[kind].description?.en, ENEMIES[kind].description?.zh]) {
        assert.equal(typeof text, 'string');
        assert.ok(text.length > 0, kind);
      }
      const {state, enemy} = spawnStat('normal', kind);
      assert.equal(enemy, state.enemies.at(-1));
      assert.equal(enemy.kind, kind);
      assertEnemyShape(enemy);
      assert.ok(Math.abs(enemy.y - ARENA.spawnY) <= 0.01, `${kind} y ${enemy.y}`);
      JSON.parse(JSON.stringify(enemy));
    }
    const names = KINDS.map(kind => ENEMIES[kind].name.en);
    assert.equal(new Set(names).size, KINDS.length);
    const spawned = Object.fromEntries(KINDS.map(kind => [kind, spawnStat('normal', kind).enemy]));
    assert.ok(spawned.runner.speed > spawned.shambler.speed, 'runner should be faster than a shambler');
    assert.ok(spawned.brute.hp > spawned.shambler.hp, 'brute should be tougher than a shambler');
    assert.ok(spawned.armored.armor > spawned.shambler.armor, 'armored should have more armor');
    assert.ok(spawned.swarm.hp < spawned.brute.hp, 'swarm should be frailer than a brute');
    assert.ok(KINDS.every(kind => spawned.boss.radius > spawned[kind].radius || kind === 'boss'));
    const speeds = new Set(KINDS.map(kind => spawned[kind].speed));
    const healths = new Set(KINDS.map(kind => spawned[kind].hp));
    assert.ok(speeds.size >= 3 && healths.size >= 3);
  });

  test('difficulty health, speed, and damage are applied once at spawn', () => {
    const normal = spawnStat('normal', 'brute').enemy;
    const easy = spawnStat('easy', 'brute').enemy;
    const hard = spawnStat('hard', 'brute').enemy;
    const nightmare = spawnStat('nightmare', 'brute').enemy;
    assertRatio(easy.hp, normal.hp, DIFFICULTIES.easy.health, 'easy hp');
    assertRatio(easy.maxHp, normal.maxHp, DIFFICULTIES.easy.health, 'easy maxHp');
    assertRatio(easy.speed, normal.speed, DIFFICULTIES.easy.speed, 'easy speed');
    assertRatio(easy.damage, normal.damage, DIFFICULTIES.easy.damage, 'easy damage');
    assertRatio(hard.hp, normal.hp, DIFFICULTIES.hard.health, 'hard hp');
    assertRatio(hard.speed, normal.speed, DIFFICULTIES.hard.speed, 'hard speed');
    assertRatio(hard.damage, normal.damage, DIFFICULTIES.hard.damage, 'hard damage');
    assertRatio(nightmare.hp, normal.hp, DIFFICULTIES.nightmare.health, 'nightmare hp');
    assertRatio(nightmare.speed, normal.speed, DIFFICULTIES.nightmare.speed, 'nightmare speed');
    assertRatio(nightmare.damage, normal.damage, DIFFICULTIES.nightmare.damage, 'nightmare damage');

    const base = spawnStat('normal', 'shambler').enemy;
    const scaled = spawnStat('normal', 'shambler', {healthScale: 2}).enemy;
    assertRatio(scaled.hp, base.hp, 2, 'healthScale hp');
    assertRatio(scaled.maxHp, base.maxHp, 2, 'healthScale maxHp');

    const {state, enemy} = spawnStat('nightmare', 'boss', {hp: 37, maxHp: 41, x: 150, y: 12});
    assert.equal(enemy.hp, 37);
    assert.equal(enemy.maxHp, 41);
    assert.equal(enemy.x, 150);
    assert.equal(enemy.y, 12);
    assert.equal(state.kills, 0);
    assert.equal(state.stats.damage, 0);
  });

  test('a run starts with one front-center hero and keeps that hero through contact', () => {
    const state = fresh(5, {runId: 'one-hero'});
    assert.equal(state.slots.length, 10);
    assert.equal(state.slots.filter(slot => slot.unit).length, 1);
    assert.equal(heroCount(state), 1);
    const hero = state.slots[2].unit;
    assert.equal(hero.kind, 'hero');
    assert.equal(hero.type, 'hero');
    assert.equal(hero.rank, 1);
    assert.deepEqual(hero.upgrades, {});
    assert.equal(hero.cooldown, 0);
    assert.equal(state.slots[2].row, 0);
    assert.equal(state.slots[2].col, 2);
    assert.equal(state.slots[2].x, 180);
    assert.equal(state.slots[2].y, ARENA.frontY);
    assert.equal(state.fence.maxHp, DIFFICULTIES.normal.fence);
    hero.hp = 500;
    const heroId = hero.id;
    spawnEnemy(state, 'shambler', {x: 180, y: ARENA.fenceY - 20, hp: 5000, maxHp: 5000});
    repeat(90, () => {
      updateMovement(state, STEP);
      updateStatuses(state, STEP, damageEnemy);
      updateCombat(state, STEP);
    });
    assert.equal(heroCount(state), 1);
    assert.equal(state.slots[2].unit.id, heroId);
    assert.equal(state.slots[2].unit.kind, 'hero');
    assert.equal(state.slots[2].unit.type, 'hero');
    assert.equal(state.slots[2].unit.hp ?? 500, 500);
    assert.equal(state.slots.filter(slot => slot.unit && slot.unit.kind !== 'hero').length, 0);
  });

  test('hero upgrades stay on the single hero and invalid upgrades do nothing', () => {
    const state = fresh(6, {runId: 'hero-up'});
    const heroId = state.slots[2].unit.id;
    const ids = Object.keys(HERO_UPGRADES);
    assert.ok(ids.length >= 6, `upgrade count ${ids.length}`);
    let applied = null;
    for (const id of ids) {
      const result = applyHeroUpgrade(state, id);
      assert.equal(typeof result?.ok, 'boolean');
      if (result.ok) {
        applied = id;
        break;
      }
    }
    assert.ok(applied, 'at least one documented hero upgrade should apply');
    assert.equal(heroCount(state), 1);
    assert.equal(state.slots[2].unit.id, heroId);
    assert.equal(state.slots[2].unit.kind, 'hero');
    assert.equal(state.xp, 0);
    assert.equal(state.nextDraftXp, 6);
    assert.equal(state.slots.filter(slot => slot.unit).length, 1);
    const bad = applyHeroUpgrade(state, 'not-a-real-upgrade');
    assert.equal(bad.ok, false);
    assert.equal(state.slots[2].unit.id, heroId);
    assert.equal(heroCount(state), 1);
    assert.equal(state.xp, 0);
  });

  test('hero and tower ranges reach from the rear row and stats stay finite', () => {
    const state = fresh(7, {runId: 'ranges'});
    const hero = state.slots[2].unit;
    const rng = state.rng;
    const heroStats = getHeroStats(hero, state);
    const viaCatalog = getUnitStats(hero, state);
    const need = rearReach();
    for (const stats of [heroStats, viaCatalog]) {
      finiteNumber(stats.damage, 'hero damage');
      finiteNumber(stats.interval, 'hero interval');
      finiteNumber(stats.range, 'hero range');
      assert.ok(stats.interval > 0);
      assert.ok(stats.range + 0.01 >= need, `hero range ${stats.range} < rear fence reach ${need}`);
    }
    nearly(viaCatalog.range, heroStats.range, 0.01, 'hero range delegation');
    nearly(viaCatalog.damage, heroStats.damage, 0.01, 'hero damage delegation');
    assert.equal(state.rng, rng);

    for (const type of BASE_TYPES) {
      assert.ok(TOWERS[type], type);
      assert.ok(TOWERS[type].name?.en && TOWERS[type].name?.zh && TOWERS[type].description?.en && TOWERS[type].description?.zh, type);
      const unit = createUnit(state, type, 1, 'tower');
      const beforeUnit = JSON.stringify(unit);
      const beforeCatalog = JSON.stringify(TOWERS[type]);
      const stats = getUnitStats(unit, state);
      finiteNumber(stats.range, type + ' range');
      finiteNumber(stats.interval, type + ' interval');
      finiteNumber(stats.damage, type + ' damage');
      assert.ok(stats.range + 0.01 >= need, `${type} range ${stats.range} < rear fence reach ${need}`);
      assert.ok(stats.interval > 0 && stats.interval < 10, type);
      assert.equal(JSON.stringify(unit), beforeUnit);
      assert.equal(JSON.stringify(TOWERS[type]), beforeCatalog);
      assert.equal(state.rng, rng);
    }

    const rank1 = createUnit(state, 'bolt', 1, 'tower');
    const rank2 = createUnit(state, 'bolt', 2, 'tower');
    const low = getUnitStats(rank1, state);
    const high = getUnitStats(rank2, state);
    assert.ok(high.damage > low.damage + 1e-6 || high.interval < low.interval - 1e-6, 'rank 2 bolt should be stronger');
    assert.ok(high.damage <= low.damage * 4 + 0.01, `rank scaling unbounded ${high.damage} vs ${low.damage}`);
    assert.ok(high.range + 1 >= low.range * 0.85, 'rank must keep rear range usable');
    const again = getUnitStats(rank1, state);
    assert.equal(again.damage, low.damage);
    assert.equal(again.range, low.range);
    assert.equal(again.interval, low.interval);
  });

  test('lateral drift is continuous, bounded, and not snapped into columns', () => {
    const state = fresh(21, {runId: 'drift'});
    emptyBoard(state);
    const startX = [28, 60, 95, 140, 180, 210, 250, 300, 340];
    const enemies = startX.map(x => spawnEnemy(state, 'shambler', {x, y: 180}));
    const prev = enemies.map(enemy => ({x: enemy.x, y: enemy.y}));
    const travel = enemies.map(() => 0);
    let maxStepX = 0;
    let maxStepY = 0;
    const samples = 4 * 60;
    for (let i = 0; i < samples; i++) {
      state.time += STEP;
      updateMovement(state, STEP);
      enemies.forEach((enemy, index) => {
        const dx = enemy.x - prev[index].x;
        const dy = enemy.y - prev[index].y;
        maxStepX = Math.max(maxStepX, Math.abs(dx));
        maxStepY = Math.max(maxStepY, Math.abs(dy));
        travel[index] = Math.max(travel[index], Math.abs(enemy.x - startX[index]));
        assert.ok(enemy.x >= ARENA.enemyMinX - 1e-6 && enemy.x <= ARENA.enemyMaxX + 1e-6, `x ${enemy.x}`);
        assert.ok(enemy.y <= ARENA.fenceY - enemy.radius + 0.75, `y ${enemy.y} passed the fence`);
        assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
        prev[index] = {x: enemy.x, y: enemy.y};
      });
    }
    assert.ok(maxStepX < 8, `lateral step ${maxStepX}px is a column snap or teleport`);
    assert.ok(maxStepY < 24, `forward step ${maxStepY}px teleports`);
    const moved = travel.filter(distanceX => distanceX > 2).length;
    assert.ok(moved >= 3, `only ${moved} enemies drifted more than 2px (${travel.map(v => v.toFixed(2)).join(', ')})`);
    const uniq = new Set(enemies.map(enemy => Math.round(enemy.x)));
    assert.ok(uniq.size >= 6, `drift collapsed to columns ${[...uniq].join(',')}`);
    assert.ok(enemies.some(enemy => enemy.y > 180 + 10), 'enemies should advance toward the fence');
  });

  test('enemies stop at the fence and dead or stunned enemies do not move', () => {
    const state = fresh(22, {runId: 'stop'});
    emptyBoard(state);
    const enemy = spawnEnemy(state, 'runner', {x: 180, y: 260});
    enemy.speed = 90;
    const stopY = ARENA.fenceY - enemy.radius;
    enemy.y = Math.min(enemy.y, stopY - 40);
    let peak = enemy.y;
    repeat(180, () => {
      updateMovement(state, STEP);
      peak = Math.max(peak, enemy.y);
      assert.ok(enemy.y <= stopY + 0.75, `crossed fence stop ${enemy.y} > ${stopY}`);
      assert.ok(enemy.x >= ARENA.enemyMinX && enemy.x <= ARENA.enemyMaxX);
    });
    assert.ok(enemy.y >= stopY - enemy.speed * STEP - 1, `stopped early at ${enemy.y}, stop ${stopY}`);
    const parked = enemy.y;
    repeat(60, () => updateMovement(state, STEP));
    assert.ok(Math.abs(enemy.y - parked) <= 2, `fence y drifted ${enemy.y} from ${parked}`);
    assert.ok(peak <= stopY + 0.75);

    const dead = spawnEnemy(state, 'shambler', {x: 40, y: 80});
    dead.dead = true;
    const deadAt = {x: dead.x, y: dead.y};
    moveFor(state, 0.5);
    assert.equal(dead.x, deadAt.x);
    assert.equal(dead.y, deadAt.y);

    const stunned = spawnEnemy(state, 'shambler', {x: 300, y: 90});
    applyStatus(stunned, {type: 'stun', power: 1, remaining: 100, sourceId: 'stun'});
    const stunAt = {x: stunned.x, y: stunned.y};
    moveFor(state, 0.5);
    assert.equal(stunned.x, stunAt.x);
    assert.equal(stunned.y, stunAt.y);
    assert.equal(stunned.speed > 0, true);
  });

  test('slow uses the remaining speed factor without rewriting base speed', () => {
    function march(seed, slowed) {
      const state = fresh(seed, {runId: slowed ? 'slow' : 'fast'});
      emptyBoard(state);
      const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 120});
      enemy.speed = 60;
      enemy.statuses = [];
      if (slowed) applyStatus(enemy, {type: 'slow', power: 0.5, remaining: 100, sourceId: 'slow'});
      const factor = getSpeedFactor(enemy);
      const y0 = enemy.y;
      moveFor(state, 0.5);
      return {dy: enemy.y - y0, speed: enemy.speed, factor};
    }
    const fast = march(30, false);
    const slow = march(30, true);
    nearly(fast.factor, 1, 0.001, 'unslowed factor');
    nearly(slow.factor, 0.5, 0.05, 'slow factor');
    assert.equal(fast.speed, 60);
    assert.equal(slow.speed, 60);
    assert.ok(fast.dy > 24 && fast.dy < 36, `unslowed dy ${fast.dy}`);
    nearly(slow.dy / fast.dy, 0.5, 0.18, 'slow movement ratio');

    const stacked = fresh(31, {runId: 'stack-slow'});
    const enemy = spawnEnemy(stacked, 'shambler', {x: 180, y: 20});
    for (let i = 0; i < 10; i++) applyStatus(enemy, {type: 'slow', power: 0.65, remaining: 5, sourceId: 's'});
    const factor = getSpeedFactor(enemy);
    assert.ok(factor <= 0.7 && factor >= 0.5, `stacked slow collapsed to ${factor}`);
    tickStatuses(stacked, 0.2);
    const mid = enemy.hp;
    tickStatuses(stacked, 1);
    assert.equal(enemy.hp, mid);
    assert.equal(stacked.kills, 0);
  });

  test('movement uses the spawned speed once and ignores the speed control', () => {
    const easy = spawnStat('easy', 'runner').enemy;
    const hard = spawnStat('hard', 'runner').enemy;
    assertRatio(hard.speed, easy.speed, DIFFICULTIES.hard.speed / DIFFICULTIES.easy.speed, 'spawn speed ratio');

    function advanceY(difficulty, speedControl) {
      const state = fresh(32, {difficulty, runId: `mv-${difficulty}-${speedControl}`});
      emptyBoard(state);
      state.speed = speedControl;
      const enemy = spawnEnemy(state, 'runner', {x: 180, y: 40});
      const speed = enemy.speed;
      const y0 = enemy.y;
      repeat(30, () => updateMovement(state, STEP));
      return {dy: enemy.y - y0, speed, expected: speed * 30 * STEP};
    }
    const normal = advanceY('hard', 1);
    const triple = advanceY('hard', 3);
    nearly(normal.dy, normal.expected, Math.max(3, normal.expected * 0.2), 'hard movement dy');
    nearly(triple.dy, normal.dy, Math.max(2, normal.dy * 0.15), 'speed control leaked into movement');
    assert.equal(triple.speed, normal.speed);
  });

  test('armor reduces damage inside [0, 0.8] and a kill is credited once', () => {
    function loss(armor, amount) {
      const state = fresh(40, {runId: `arm-${armor}`});
      const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 30, hp: 5000, maxHp: 5000});
      enemy.hp = 5000;
      enemy.armor = armor;
      enemy.dead = false;
      damageEnemy(state, enemy, amount, {sourceId: 'src', type: 'bolt', crit: false});
      return {loss: 5000 - enemy.hp, recorded: state.stats.damage, kills: state.kills, enemy};
    }
    for (const [armor, fraction] of [[0, 1], [0.5, 0.5], [0.8, 0.2], [0.95, 0.2], [-0.4, 1]]) {
      const hit = loss(armor, 100);
      nearly(hit.loss, 100 * fraction, 1.01, `armor ${armor}`);
      nearly(hit.recorded, hit.loss, 1.01, `stats.damage armor ${armor}`);
      assert.equal(hit.kills, 0);
      assert.equal(hit.enemy.dead, false);
    }

    const state = fresh(41, {runId: 'kill-once'});
    const hero = state.slots[2].unit;
    const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 30});
    enemy.hp = 40;
    enemy.armor = 0;
    enemy.dead = false;
    const xp = enemy.xp;
    assert.ok(xp > 0);
    damageEnemy(state, enemy, 40, {sourceId: hero.id, type: 'bolt', crit: false});
    assert.equal(enemy.dead, true);
    assert.equal(state.kills, 1);
    assert.equal(state.xp, xp);
    assert.equal(hero.kills, 1);
    const damage = state.stats.damage;
    damageEnemy(state, enemy, 40, {sourceId: hero.id, type: 'bolt', crit: true});
    assert.equal(state.kills, 1);
    assert.equal(state.xp, xp);
    assert.equal(hero.kills, 1);
    assert.equal(state.stats.damage, damage);

    const other = spawnEnemy(state, 'runner', {x: 120, y: 30});
    other.hp = 25;
    killEnemy(state, other, hero.id);
    assert.equal(other.dead, true);
    assert.equal(state.kills, 2);
    assert.equal(state.xp, xp + other.xp);
    killEnemy(state, other, hero.id);
    assert.equal(state.kills, 2);
    assert.equal(state.xp, xp + other.xp);
    assert.equal(heroCount(state), 1);
  });

  test('critical hits are recorded only when the hit says so', () => {
    const state = fresh(42, {runId: 'crit'});
    const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 30, hp: 1000, maxHp: 1000});
    enemy.armor = 0;
    damageEnemy(state, enemy, 10, {sourceId: 'src', type: 'bolt', crit: false});
    assert.equal(state.stats.crits, 0);
    damageEnemy(state, enemy, 10, {sourceId: 'src', type: 'bolt', crit: true});
    assert.equal(state.stats.crits, 1);
    assert.ok(enemy.hp < 1000);
    assert.equal(enemy.dead, false);
  });

  test('statuses expire on simulation time and stop dealing damage', () => {
    const state = fresh(50, {runId: 'status-expire'});
    emptyBoard(state);
    const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 40, hp: 100000, maxHp: 100000});
    enemy.armor = 0;
    for (const type of STATUS_TYPES) {
      applyStatus(enemy, {type, power: type === 'slow' ? 0.65 : 4, remaining: 3, sourceId: 'src'});
    }
    JSON.parse(JSON.stringify(enemy.statuses));
    assert.ok(STATUS_TYPES.every(type => enemy.statuses.some(status => status.type === type)));
    updateStatuses(state, 0.5, damageEnemy);
    const stun = enemy.statuses.find(status => status.type === 'stun');
    assert.ok(stun, 'stun missing after a partial step');
    assert.ok(stun.remaining < 2.7 && stun.remaining > 2.2, `stun remaining ${stun.remaining}`);

    const burning = spawnEnemy(state, 'shambler', {x: 150, y: 40, hp: 100000, maxHp: 100000});
    burning.armor = 0;
    burning.statuses = [];
    applyStatus(burning, {type: 'burn', power: 10, remaining: 2, sourceId: 'src'});
    tickStatuses(state, 2);
    const burned = 100000 - burning.hp;
    assert.ok(burned >= 10 && burned <= 40, `burn dealt ${burned}, power is damage per second`);
    assert.ok(!burning.statuses.some(status => status.type === 'burn' && status.remaining > 0.02));
    const after = burning.hp;
    tickStatuses(state, 2);
    assert.equal(burning.hp, after);
    assert.equal(burning.dead, false);

    const poisoned = spawnEnemy(state, 'shambler', {x: 220, y: 40, hp: 100000, maxHp: 100000});
    poisoned.armor = 0;
    poisoned.statuses = [];
    applyStatus(poisoned, {type: 'poison', power: 8, remaining: 1.5, sourceId: 'src'});
    tickStatuses(state, 1.5);
    assert.ok(100000 - poisoned.hp > 4, 'poison should deal damage');
    const poisonHp = poisoned.hp;
    tickStatuses(state, 2);
    assert.equal(poisoned.hp, poisonHp);

    const slowed = spawnEnemy(state, 'shambler', {x: 250, y: 40});
    slowed.statuses = [];
    applyStatus(slowed, {type: 'slow', power: 0.65, remaining: 0.4, sourceId: 'src'});
    nearly(getSpeedFactor(slowed), 0.65, 0.05, 'single slow');
    tickStatuses(state, 0.5);
    nearly(getSpeedFactor(slowed), 1, 0.001, 'slow expiry');
    assert.equal(state.speed, 1);
  });

  test('a large status step stays finite and a lethal DOT kills once', () => {
    const stepped = fresh(51, {runId: 'dot-steps'});
    const lumped = fresh(51, {runId: 'dot-lump'});
    for (const state of [stepped, lumped]) emptyBoard(state);
    const a = spawnEnemy(stepped, 'shambler', {x: 180, y: 10, hp: 100000, maxHp: 100000});
    const b = spawnEnemy(lumped, 'shambler', {x: 180, y: 10, hp: 100000, maxHp: 100000});
    a.armor = 0;
    b.armor = 0;
    a.statuses = [];
    b.statuses = [];
    applyStatus(a, {type: 'burn', power: 12, remaining: 1, sourceId: 'src'});
    applyStatus(b, {type: 'burn', power: 12, remaining: 1, sourceId: 'src'});
    tickStatuses(stepped, 1);
    updateStatuses(lumped, 1, damageEnemy);
    const lossA = 100000 - a.hp;
    const lossB = 100000 - b.hp;
    assert.ok(lossA > 0 && lossB > 0);
    nearly(lossB, lossA, Math.max(6, lossA * 0.5), 'large DOT step');
    assert.ok(Number.isFinite(b.hp));
    updateStatuses(lumped, 10, damageEnemy);
    assert.ok(!b.statuses.some(status => status.type === 'burn' && status.remaining > 0.02));
    assert.ok(Number.isFinite(b.hp));

    const state = fresh(52, {runId: 'dot-kill'});
    const hero = state.slots[2].unit;
    hero.cooldown = 100;
    const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 15, hp: 8, maxHp: 8});
    enemy.hp = 8;
    enemy.armor = 0;
    enemy.statuses = [];
    const xp = enemy.xp;
    applyStatus(enemy, {type: 'burn', power: 40, remaining: 3, sourceId: hero.id});
    updateStatuses(state, 1, damageEnemy);
    assert.equal(enemy.dead, true);
    assert.equal(state.kills, 1);
    assert.equal(state.xp, xp);
    assert.equal(hero.kills, 1);
    assert.ok(Number.isFinite(enemy.hp));
    const damage = state.stats.damage;
    updateStatuses(state, 3, damageEnemy);
    assert.equal(state.kills, 1);
    assert.equal(state.xp, xp);
    assert.equal(hero.kills, 1);
    nearly(state.stats.damage, damage, 0.01, 'DOT after death');

    const dead = spawnEnemy(state, 'swarm', {x: 90, y: 15, hp: 50, maxHp: 50});
    dead.hp = 50;
    dead.dead = true;
    dead.statuses = [];
    applyStatus(dead, {type: 'poison', power: 30, remaining: 2, sourceId: hero.id});
    updateStatuses(state, 2, damageEnemy);
    assert.equal(dead.hp, 50);
    assert.equal(state.kills, 1);
  });

  test('poison stacks stay bounded and a speed flag does not age statuses faster', () => {
    const state = fresh(53, {runId: 'stacks'});
    const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 10});
    enemy.statuses = [];
    for (let i = 0; i < 40; i++) applyStatus(enemy, {type: 'poison', power: 2, remaining: 4, sourceId: 'p', stacks: 1});
    const stacks = enemy.statuses.filter(status => status.type === 'poison').reduce((total, status) => total + (status.stacks || 1), 0);
    assert.ok(stacks >= 1 && stacks <= 20, `poison stacks ${stacks}`);

    const timed = fresh(54, {runId: 'status-speed'});
    timed.speed = 3;
    const slowed = spawnEnemy(timed, 'shambler', {x: 180, y: 10});
    slowed.statuses = [];
    applyStatus(slowed, {type: 'slow', power: 0.65, remaining: 1, sourceId: 's'});
    updateStatuses(timed, STEP, damageEnemy);
    const remaining = slowed.statuses.find(status => status.type === 'slow')?.remaining;
    assert.ok(remaining >= 1 - 0.04 && remaining <= 1, `slow remaining ${remaining} followed the speed control`);
  });

  test('towers acquire a real geometric target across columns and ignore out-of-range enemies', () => {
    const state = fresh(60, {runId: 'target'});
    emptyBoard(state);
    const slot = state.slots[0];
    const unit = placeTower(state, 0, 'bolt');
    const stats = getUnitStats(unit, state);
    assert.ok((stats.chain || 0) === 0 || stats.chainRange < 200);
    const dx = 96;
    const x = Math.min(ARENA.enemyMaxX, slot.x + dx);
    const dy = Math.min(70, Math.max(24, Math.sqrt(Math.max(0, (stats.range * 0.7) ** 2 - (x - slot.x) ** 2))));
    const y = slot.y - dy;
    const reach = distance({x: slot.x, y: slot.y}, {x, y});
    assert.ok(reach < stats.range - 1, `fixture distance ${reach} range ${stats.range}`);
    assert.ok(Math.abs(x - slot.x) > 70);
    const pitch = state.slots[1].x - state.slots[0].x;
    assert.notEqual(Math.round((x - state.slots[0].x) / pitch), slot.col);
    const inside = spawnEnemy(state, 'brute', {x, y, hp: 1e7, maxHp: 1e7});
    inside.speed = 0;
    inside.armor = 0;
    inside.driftVelocity = 0;
    const farY = slot.y - stats.range - 160;
    const outside = spawnEnemy(state, 'brute', {x: slot.x, y: farY, hp: 1e7, maxHp: 1e7});
    outside.speed = 0;
    outside.armor = 0;
    outside.driftVelocity = 0;
    const far = distance({x: slot.x, y: slot.y}, outside);
    assert.ok(far > stats.range + 30, `outside distance ${far}`);
    const insideHp = inside.hp;
    const outsideHp = outside.hp;
    const watch = combatWatch(state, 180);
    assert.ok(engaged(inside, insideHp, watch), `cross-column enemy was not acquired (range ${stats.range}, distance ${reach})`);
    assert.ok(!engaged(outside, outsideHp, watch), 'same-column enemy outside range was hit');
    assert.equal(outside.hp, outsideHp);
    assert.equal(heroCount(state), 0);
  });

  test('a rear defender can hit a fence-line threat in front of it', () => {
    const state = fresh(61, {runId: 'rear'});
    emptyBoard(state);
    const unit = placeTower(state, 7, 'bolt');
    const stats = getUnitStats(unit, state);
    const slot = state.slots[7];
    const probe = spawnEnemy(state, 'shambler', {x: 20, y: -20, hp: 10, maxHp: 10});
    const y = ARENA.fenceY - probe.radius;
    state.enemies = state.enemies.filter(enemy => enemy !== probe);
    const threat = spawnEnemy(state, 'brute', {x: slot.x, y, hp: 1e7, maxHp: 1e7});
    threat.speed = 0;
    threat.armor = 0;
    threat.driftVelocity = 0;
    const reach = distance(slot, threat);
    assert.ok(stats.range + 0.01 >= reach, `rear range ${stats.range} cannot reach fence threat at ${reach}`);
    const hp0 = threat.hp;
    const watch = combatWatch(state, 180);
    assert.ok(engaged(threat, hp0, watch), 'rear defender did not engage the fence-line threat');
  });

  test('fire cadence follows the attack interval and is not multiplied by the speed control', () => {
    function shotsAt(speed) {
      const state = fresh(62, {runId: `cadence-${speed}`});
      emptyBoard(state);
      state.speed = speed;
      const unit = placeTower(state, 2, 'bolt');
      const stats = getUnitStats(unit, state);
      const slot = state.slots[2];
      const enemy = spawnEnemy(state, 'brute', {x: slot.x, y: slot.y - Math.min(48, stats.range * 0.4), hp: 1e8, maxHp: 1e8});
      enemy.speed = 0;
      enemy.armor = 0;
      enemy.driftVelocity = 0;
      assert.ok(distance(slot, enemy) < stats.range - 1);
      const simTime = 4;
      const watch = combatWatch(state, Math.round(simTime / STEP));
      const observed = watch.shots > 0 ? watch.shots : watch.projectiles;
      return {observed, hpLoss: 1e8 - enemy.hp, stats};
    }
    const normal = shotsAt(1);
    const triple = shotsAt(3);
    const expected = 4 / normal.stats.interval;
    assert.ok(normal.observed > 0 || normal.hpLoss > 0, 'bolt produced neither shots nor damage');
    if (normal.observed > 0) {
      assert.ok(normal.observed >= Math.max(1, Math.floor(expected) - 1), `shots ${normal.observed} below interval ${normal.stats.interval}`);
      assert.ok(normal.observed <= Math.ceil(expected) + 2, `shots ${normal.observed} above interval ${normal.stats.interval}`);
      assert.equal(triple.observed, normal.observed);
    } else {
      const swing = Math.max(1, (normal.stats.damage || 1) * (normal.stats.critMultiplier || 1.75));
      nearly(triple.hpLoss, normal.hpLoss, swing, 'cadence damage changed with speed control');
    }
  });

  test('enemies damage the shared fence only after contact, including off-column positions', () => {
    function fenceCase(setup) {
      const state = fresh(70, {runId: `fence-${setup}`});
      emptyBoard(state);
      const enemy = spawnEnemy(state, setup === 'spitter' ? 'spitter' : 'shambler', {x: 200, y: 30});
      enemy.damage = 10;
      enemy.attackInterval = 0.5;
      enemy.attackCooldown = 0;
      enemy.speed = 0;
      enemy.driftVelocity = 0;
      if (setup === 'contact' || setup === 'overkill') {
        enemy.y = ARENA.fenceY - enemy.radius;
        enemy.attacking = true;
      } else {
        enemy.y = 24;
        enemy.attacking = false;
      }
      if (setup === 'overkill') { state.surge.charges=0; state.fence.hp=5; }
      const hp0 = state.fence.hp;
      const damage0 = state.stats.fenceDamage;
      repeat(120, () => updateCombat(state, STEP));
      return {loss: hp0 - state.fence.hp, hp: state.fence.hp, fenceDamage: state.stats.fenceDamage - damage0, state};
    }
    assert.ok(SLOT_X.every(x => Math.abs(x - 200) > 15), 'x=200 is not its own column');
    const contact = fenceCase('contact');
    assert.ok(contact.loss >= 20 && contact.loss <= 60, `fence loss ${contact.loss}`);
    assert.ok(contact.fenceDamage > 0);
    assert.equal(contact.state.kills, 0);
    const far = fenceCase('far');
    assert.equal(far.loss, 0);
    assert.equal(far.fenceDamage, 0);
    const spitter = fenceCase('spitter');
    assert.equal(spitter.loss, 0, 'a spitter away from the fence damaged it');
    const overkill = fenceCase('overkill');
    assert.equal(overkill.hp, 0);
    repeat(60, () => updateCombat(overkill.state, STEP));
    assert.equal(overkill.state.fence.hp, 0);

    const state = fresh(71, {runId: 'fence-hero'});
    const hero = state.slots[2].unit;
    hero.hp = 500;
    hero.cooldown = 100;
    const boss = spawnEnemy(state, 'boss', {x: 200, y: 10});
    boss.y = ARENA.fenceY - boss.radius;
    boss.attacking = true;
    boss.attackCooldown = 0;
    boss.speed = 0;
    const before = state.fence.hp;
    repeat(90, () => updateCombat(state, STEP));
    assert.ok(state.fence.hp < before, 'boss at the fence did not attack it');
    assert.equal(state.fence.hp >= 0, true);
    assert.equal(heroCount(state), 1);
    assert.equal(state.slots[2].unit.id, hero.id);
    assert.equal(state.slots[2].unit.kind, 'hero');
    assert.equal(state.slots[2].unit.hp ?? 500, 500);
  });

  test('projectiles move by speed*dt and still collide when the speed control is 3x', () => {
    const state = fresh(80, {runId: 'projectile'});
    emptyBoard(state);
    state.speed = 3;
    const tower = placeTower(state, 0, 'bolt');
    tower.cooldown = 100;
    const enemy = spawnEnemy(state, 'brute', {x: 180, y: -10, hp: 500, maxHp: 500});
    enemy.armor = 0;
    enemy.speed = 0;
    enemy.driftVelocity = 0;
    assert.ok(distance(state.slots[0], enemy) > getUnitStats(tower, state).range + 20);
    const projectile = {
      id: 'p-manual',
      sourceId: tower.id,
      targetId: enemy.id,
      x: enemy.x,
      y: enemy.y + 180,
      speed: 300,
      damage: 30,
      crit: false,
      tags: [],
      splash: 0,
      chain: 0,
      chainRange: 70,
      pierce: 0,
      visited: [],
      life: 3
    };
    state.projectiles.push(projectile);
    const start = {x: projectile.x, y: projectile.y};
    updateCombat(state, STEP);
    const moved = state.projectiles.find(item => item.id === projectile.id);
    assert.ok(moved, 'projectile was dropped before traveling');
    const traveled = Math.hypot(moved.x - start.x, moved.y - start.y);
    const stepDistance = 300 * STEP;
    nearly(traveled, stepDistance, stepDistance * 0.4 + 0.25, 'projectile step');
    assert.ok(traveled < stepDistance * 2, `projectile step ${traveled} was scaled by the 3x control`);
    const guard = 80;
    let guardSteps = 0;
    while (enemy.hp === 500 && guardSteps < guard && state.projectiles.some(item => item.id === projectile.id)) {
      updateCombat(state, STEP);
      guardSteps += 1;
    }
    assert.ok(enemy.hp < 500, 'fixed steps never collided with the target');
    assert.ok(500 - enemy.hp <= 30 * 4, `projectile hit repeatedly for ${500 - enemy.hp}`);
    assert.equal(state.fence.hp, state.fence.maxHp);
  });

  test('pause, hidden pause, and non-playing phases freeze the clock without erasing user pause', () => {
    const state = fresh(90, {runId: 'gates'});
    advance(state, STEP);
    assert.equal(state.tick, 1);
    state.accumulator = STEP * 0.9;
    state.paused = true;
    advance(state, 0.2);
    assert.equal(state.tick, 1);
    assert.equal(state.accumulator, 0);
    assert.equal(state.paused, true);
    state.paused = false;
    state.hiddenPaused = true;
    state.accumulator = STEP * 0.9;
    advance(state, 0.2);
    assert.equal(state.tick, 1);
    assert.equal(state.accumulator, 0);
    state.hiddenPaused = false;
    advance(state, STEP * 0.2);
    assert.equal(state.tick, 1);

    state.paused = true;
    state.hiddenPaused = true;
    advance(state, 0.25);
    state.hiddenPaused = false;
    advance(state, 0.25);
    assert.equal(state.paused, true);
    assert.equal(state.tick, 1);
    state.paused = false;

    for (const phase of ['draft', 'placing', 'victory', 'defeat']) {
      const sample = fresh(91, {runId: phase});
      sample.phase = phase;
      sample.accumulator = 0.02;
      setSpeed(sample, 3);
      advance(sample, 0.25);
      assert.equal(sample.tick, 0, phase);
      assert.equal(sample.time, 0, phase);
      assert.equal(sample.accumulator, 0, phase);
      assert.equal(sample.phase, phase);
    }

    setSpeed(state, 1.5);
    assert.equal(state.speed, 1.5);
    setSpeed(state, 2);
    assert.equal(state.speed, 1.5);
    setSpeed(state, 3);
    assert.equal(state.speed, 3);
    setSpeed(state, 10);
    assert.equal(state.speed, 10);
    setSpeed(state, 2);
    assert.equal(state.speed, 10);
    setSpeed(state, 1);
    assert.equal(state.speed, 1);
    const tick = state.tick;
    advance(state, Number.NaN);
    advance(state, -1);
    advance(state, Number.POSITIVE_INFINITY);
    advance(state, 0);
    assert.equal(state.tick, tick);
  });

  test('1x, 1.5x, 3x, and 10x spend the same fixed steps for the same simulation time', () => {
    function ticksFor(speed, wallSeconds) {
      const state = fresh(92, {runId: `clock-${speed}`});
      setSpeed(state, speed);
      pump(advance, state, wallSeconds);
      return state;
    }
    const one = ticksFor(1, 1);
    const mid = ticksFor(1.5, 1);
    const triple = ticksFor(3, 1);
    const ten = ticksFor(10, 1);
    nearly(one.tick, 60, 1, '1x ticks per wall second');
    nearly(mid.tick, 90, 2, '1.5x ticks per wall second');
    nearly(triple.tick, 180, 2, '3x ticks per wall second');
    nearly(ten.tick, 600, 2, '10x ticks per wall second');
    nearly(one.time, 1, 0.03, '1x sim time');
    nearly(mid.time, 1.5, 0.04, '1.5x sim time');
    nearly(triple.time, 3, 0.05, '3x sim time');
    nearly(ten.time, 10, 0.05, '10x sim time');

    const same = [1, 1.5, 3, 10].map(speed => ticksFor(speed, 3 / speed));
    nearly(same[1].tick, same[0].tick, 1, '1.5x equal-sim ticks');
    nearly(same[2].tick, same[0].tick, 1, '3x equal-sim ticks');
    nearly(same[3].tick, same[0].tick, 1, '10x equal-sim ticks');
    nearly(same[0].time, 3, 0.04, 'equal sim time');
    nearly(same[1].time, same[0].time, STEP, '1.5x time match');
    nearly(same[2].time, same[0].time, STEP, '3x time match');
    nearly(same[3].time, same[0].time, STEP, '10x time match');

    const capped = fresh(93, {runId: 'cap'});
    setSpeed(capped, 3);
    advance(capped, 10);
    assert.ok(capped.tick < 90, `single advance ran ${capped.tick} steps`);
    assert.ok(capped.time > 0.7 && capped.time < 0.85, `wall cap produced ${capped.time}s`);
    const firstBurst = capped.tick;
    advance(capped, 10);
    assert.ok(capped.tick > firstBurst && capped.tick - firstBurst < 90);

    const tripleStep = fresh(94, {runId: 'triple-step'});
    setSpeed(tripleStep, 3);
    advance(tripleStep, STEP);
    assert.equal(tripleStep.tick, 3);

    const tenSlice = fresh(195, {runId: 'ten-slice'});
    setSpeed(tenSlice, 10);
    advance(tenSlice, 10);
    assert.equal(tenSlice.tick, 150);
    assert.ok(Math.abs(tenSlice.time - 2.5) < 1e-8, `10x wall cap produced ${tenSlice.time}s`);
    assert.equal(tenSlice.accumulator, 0);
    const tenFrame = fresh(196, {runId: 'ten-frame'});
    setSpeed(tenFrame, 10);
    advance(tenFrame, STEP);
    assert.equal(tenFrame.tick, 10);
    assert.ok(Math.abs(tenFrame.time - 10 * STEP) < 1e-9);
  });

  test('domain steps match the engine clock and do not rescale with the speed control', () => {
    for (const speed of [1, 1.5, 3, 10]) {
      const clock = fresh(100, {runId: `parity-clock-${speed}`});
      const domain = fresh(100, {runId: `parity-domain-${speed}`});
      setSpeed(clock, speed);
      setSpeed(domain, speed);
      pump(advance, clock, 0.5);
      pump(advanceLike, domain, 0.5);
      assert.equal(domain.phase, 'playing', `phase changed during parity at ${speed}`);
      assert.equal(domain.tick, clock.tick, `tick parity at ${speed}`);
      nearly(domain.time, clock.time, 1e-8, `time parity at ${speed}`);
    }

    const steps = 240;
    const runs = [1, 1.5, 3, 10].map(speed => {
      const state = fresh(101, {runId: `inv-${speed}`});
      state.speed = speed;
      repeat(steps, () => domainStep(state, STEP));
      return state;
    });
    assert.equal(digest(runs[1]), digest(runs[0]));
    assert.equal(digest(runs[2]), digest(runs[0]));
    assert.equal(digest(runs[3]), digest(runs[0]));
    assert.equal(runs[0].tick, steps);
    assert.ok(runs[0].time > 3 && runs[0].time < 5);

    const paused = fresh(102, {runId: 'domain-pause'});
    const enemy = spawnEnemy(paused, 'shambler', {x: 180, y: 140});
    const y0 = enemy.y;
    const rng = paused.rng;
    paused.paused = true;
    pump(advanceLike, paused, 1);
    assert.equal(paused.tick, 0);
    assert.equal(enemy.y, y0);
    assert.equal(paused.rng, rng);
    paused.paused = false;
    paused.phase = 'draft';
    pump(advanceLike, paused, 1);
    assert.equal(paused.tick, 0);
    assert.equal(enemy.y, y0);
    paused.phase = 'playing';
    paused.hiddenPaused = true;
    pump(advanceLike, paused, 1);
    assert.equal(enemy.y, y0);
    paused.hiddenPaused = false;
    pump(advanceLike, paused, 0.5);
    assert.ok(paused.tick > 20);
    assert.ok(enemy.y > y0 || enemy.dead === true);
  });

  test('restart is a new run with cleared timers, entities, and exactly one hero', () => {
    const dirty = fresh(110, {runId: 'dirty', difficulty: 'hard'});
    const enemy = spawnEnemy(dirty, 'shambler', {x: 180, y: 100});
    applyStatus(enemy, {type: 'burn', power: 5, remaining: 4, sourceId: 'src'});
    dirty.projectiles.push({id: 'p', sourceId: 'u', targetId: enemy.id, x: 10, y: 10, speed: 20, damage: 1, crit: false, tags: [], splash: 0, chain: 0, chainRange: 70, pierce: 0, visited: [], life: 1});
    dirty.clouds.push({id: 'cloud'});
    dirty.events.push({type: 'hit', time: 1});
    dirty.phase = 'draft';
    dirty.paused = true;
    dirty.hiddenPaused = true;
    dirty.speed = 3;
    dirty.xp = 40;
    dirty.kills = 3;
    dirty.fence.hp = 12;
    dirty.draft = {options: [{id: 'a'}, {id: 'b'}, {id: 'c'}]};
    dirty.pendingUnit = {unit: {id: 'pending'}, replace: false};
    dirty.accumulator = 0.2;
    dirty.time = 80;
    dirty.tick = 999;
    dirty.wave = 4;
    dirty.waveTime = 6;
    dirty.director = {nextWave: 4, queue: [{kind: 'boss'}], done: false};
    dirty.slots[2].unit.cooldown = 2;
    dirty.stats.damage = 50;
    moveFor(dirty, 0.2);

    const restarted = fresh(110, {runId: 'restarted', difficulty: 'hard'});
    assert.notEqual(restarted.runId, dirty.runId);
    assert.equal(restarted.time, 0);
    assert.equal(restarted.tick, 0);
    assert.equal(restarted.accumulator, 0);
    assert.equal(restarted.phase, 'playing');
    assert.equal(restarted.paused, false);
    assert.equal(restarted.hiddenPaused, false);
    assert.equal(restarted.speed, 1);
    assert.equal(restarted.kills, 0);
    assert.equal(restarted.xp, 0);
    assert.equal(restarted.wave, 0);
    assert.equal(restarted.waveTime, 0);
    assert.deepEqual(restarted.director, {nextWave: 0, queue: [], done: false});
    assert.equal(restarted.enemies.length, 0);
    assert.equal(restarted.projectiles.length, 0);
    assert.equal(restarted.clouds.length, 0);
    assert.equal(restarted.draft, null);
    assert.equal(restarted.pendingUnit, null);
    assert.equal(restarted.settlement, null);
    assert.equal(restarted.fence.hp, restarted.fence.maxHp);
    assert.equal(restarted.fence.maxHp, DIFFICULTIES.hard.fence);
    assert.equal(restarted.stats.damage, 0);
    assert.equal(heroCount(restarted), 1);
    assert.equal(restarted.slots[2].unit.kind, 'hero');
    assert.equal(restarted.slots[2].unit.cooldown, 0);
    assert.equal(restarted.slots.filter(slot => slot.unit).length, 1);
    assert.equal(dirty.kills, 3);
    assert.equal(dirty.enemies.length >= 1, true);
    assert.equal(dirty.paused, true);
    assert.equal(dirty.phase, 'draft');
  });

  test('scheduled pressure starts early, stays inside the arena, and does not end the run', () => {
    const scheduleSize = Array.isArray(WAVES) ? WAVES.length : Object.keys(WAVES || {}).length;
    assert.ok(scheduleSize >= 5, `wave schedule size ${scheduleSize}`);
    const state = fresh(120, {difficulty: 'easy', runId: 'waves'});
    state.initialized = true;
    const hero = state.slots[2].unit;
    hero.hp = 500;
    const seen = new Map();
    const steps = Math.round(24 / STEP);
    for (let i = 0; i < steps; i++) {
      domainStep(state, STEP);
      for (const enemy of state.enemies) {
        if (!seen.has(enemy.id)) seen.set(enemy.id, enemy.x);
        assert.ok(enemy.x >= ARENA.enemyMinX - 0.01 && enemy.x <= ARENA.enemyMaxX + 0.01, `wave x ${enemy.x}`);
        assert.ok(enemy.y <= ARENA.fenceY - enemy.radius + 0.75);
        assert.ok(Number.isFinite(enemy.hp) && Number.isFinite(enemy.y));
      }
    }
    assert.ok(seen.size > 0, 'no enemies spawned in the first 24s');
    assert.equal(state.director.done, false);
    assert.equal(heroCount(state), 1);
    assert.equal(state.slots[2].unit.id, hero.id);
    assert.equal(state.slots[2].unit.hp ?? 500, 500);
    const info = getWaveInfo(state);
    assert.ok(info && typeof info === 'object');
    const xs = [...seen.values()];
    if (xs.length >= 8) {
      const uniq = new Set(xs.map(x => Math.round(x)));
      const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      assert.ok(uniq.size >= 6, `wave spawns snapped to ${uniq.size} x positions`);
      assert.ok(mean > 70 && mean < 290, `wave spawn mean ${mean}`);
    }
    assert.notEqual(state.phase, 'victory');
  });
});
