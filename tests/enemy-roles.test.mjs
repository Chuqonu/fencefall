// Leaper, shade, splitter, mender, and banner behavior on the shared fence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {spawnEnemy, updateMovement} from '../src/systems/movement.js';
import {damageEnemy, updateCombat, killEnemy} from '../src/systems/combat.js';
import {ARENA, DIFFICULTIES, STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';

function fresh(runId, seed = 7) {
  return createRun({seed, runId, difficulty: 'normal'});
}

function parkHero(state) {
  const hero = state.slots[2] && state.slots[2].unit;
  if (hero) hero.cooldown = 1000;
}

function stopY(enemy) {
  return ARENA.fenceY - enemy.radius;
}

function living(state, kind) {
  return state.enemies.filter(enemy => enemy && enemy.kind === kind && enemy.dead !== true && enemy.hp > 0);
}

test('a leaper dash advances about leapDistance and does not change x', () => {
  const state = fresh('role-leap', 11);
  const enemy = spawnEnemy(state, 'leaper', {x: 180, y: 40, speed: 40});
  assert.equal(enemy.leapDistance, 78);
  assert.ok(enemy.leapClock > 2);

  enemy.leapClock = 0.02;
  enemy.leapTimer = 0;
  const startX = enemy.x;
  const startY = enemy.y;
  let steps = 0;
  while (steps < 24 && enemy.y < startY + enemy.leapDistance - 2) {
    updateMovement(state, 0.05);
    steps += 1;
  }

  assert.ok(Math.abs(enemy.y - (startY + enemy.leapDistance)) <= 2, `y moved to ${enemy.y}`);
  assert.equal(enemy.x, startX);
  assert.ok(enemy.y <= stopY(enemy) + 1e-6);
});

test('a leaper already next to the fence does not jump onto it', () => {
  const state = fresh('role-leap-stop', 12);
  const enemy = spawnEnemy(state, 'leaper', {x: 180, speed: 0});
  const line = stopY(enemy);
  enemy.y = line - 2;
  enemy.leapClock = 0.01;
  enemy.speed = 0;
  const fenceHp = state.fence.hp;
  const steps = Math.round(2 / STEP);
  for (let i = 0; i < steps; i += 1) updateMovement(state, STEP);

  assert.ok(Math.abs(enemy.y - (line - 2)) < 1, `y ${enemy.y} stop ${line}`);
  assert.equal(state.fence.hp, fenceHp);
});

test('a faded shade ignores a shot and takes damage once it is solid', () => {
  const state = fresh('role-shade', 13);
  parkHero(state);
  const enemy = spawnEnemy(state, 'shade', {x: 180, y: 80});
  enemy.phaseClock = 0.02;
  enemy.phased = false;
  updateMovement(state, 0.05);
  assert.equal(enemy.phased, true);

  const fenceHp = state.fence.hp;
  const maxHp = enemy.hp;
  state.projectiles.push({
    id: 'p',
    sourceId: 'hero',
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y - 20,
    dirx: 0,
    diry: 1,
    speed: 400,
    damage: 50,
    crit: false,
    tags: [],
    splash: 0,
    chain: 0,
    chainRange: 70,
    pierce: 0,
    visited: [],
    life: 2,
  });
  updateCombat(state, 0.05);
  assert.equal(enemy.hp, maxHp);
  assert.equal(state.fence.hp, fenceHp);

  enemy.phased = false;
  updateCombat(state, 0.2);
  assert.ok(enemy.hp < maxHp, `hp stayed ${enemy.hp}`);
  assert.equal(state.fence.hp, fenceHp);
});

test('a splitter death releases two living swarms and a second kill adds none', () => {
  const state = fresh('role-split', 14);
  parkHero(state);
  const enemy = spawnEnemy(state, 'splitter', {x: 180, y: 100, hp: 30});
  updateCombat(state, 0.016);
  const xp = enemy.xp;

  killEnemy(state, enemy, null);
  assert.equal(enemy.dead, true);
  assert.equal(living(state, 'swarm').length, 2);
  assert.equal(state.kills, 1);
  assert.equal(state.xp, xp);

  killEnemy(state, enemy, null);
  assert.equal(living(state, 'swarm').length, 2);
  assert.equal(state.kills, 1);
  assert.equal(state.xp, xp);
});

test('a mender heals a wounded neighbor and does not heal itself or the fence', () => {
  const state = fresh('role-mend', 15);
  parkHero(state);
  const mender = spawnEnemy(state, 'mender', {x: 180, y: 100});
  const shambler = spawnEnemy(state, 'shambler', {x: 210, y: 100, hp: 10, maxHp: 80});
  if (!Number.isFinite(mender.mendAmount)) {
    mender.mendAmount = 28;
    mender.mendEvery = 2.8;
    mender.mendRange = 92;
  }
  mender.mendClock = 0.02;
  const menderHp = mender.hp;
  const shamblerHp = shambler.hp;
  const fenceHp = state.fence.hp;

  updateCombat(state, 0.05);

  assert.ok(shambler.hp > shamblerHp, `shambler hp ${shambler.hp}`);
  assert.equal(mender.hp, menderHp);
  assert.equal(state.fence.hp, fenceHp);
});

test('a banner hastens a nearby shambler without rewriting speed', () => {
  const expected = ENEMIES.shambler.speed * DIFFICULTIES.normal.speed;
  const control = fresh('role-banner-control', 16);
  const trial = fresh('role-banner-trial', 16);
  const plain = spawnEnemy(control, 'shambler', {x: 180, y: 40});
  const hurried = spawnEnemy(trial, 'shambler', {x: 180, y: 40});
  const banner = spawnEnemy(trial, 'banner', {x: 180, y: 70});
  if (!(banner.bannerRange > 0)) banner.bannerRange = 110;
  if (!(banner.bannerHaste > 0)) banner.bannerHaste = 0.28;
  const bannerSpeed = banner.speed;

  for (let i = 0; i < 30; i += 1) {
    updateMovement(control, STEP);
    updateMovement(trial, STEP);
  }

  assert.ok(hurried.y > plain.y, `trial ${hurried.y} control ${plain.y}`);
  assert.equal(plain.speed, expected);
  assert.equal(hurried.speed, expected);
  assert.equal(banner.speed, bannerSpeed);
});

test('a warden weakens hits on one nearby ally and not itself', () => {
  const state = fresh('role-ward', 19);
  parkHero(state);
  const ward = spawnEnemy(state, 'warden', {x: 180, y: 80});
  const ally = spawnEnemy(state, 'shambler', {x: 180, y: 120, hp: 200, maxHp: 200, armor: 0});
  assert.equal(ward.wardRange, 92);
  assert.equal(ward.wardReduction, 0.4);
  updateCombat(state, 0.05);
  assert.equal(ally.wardShield, 0.4);
  assert.equal(ward.wardShield, 0);
  assert.equal(damageEnemy(state, ally, 100), 60);
  assert.equal(ally.hp, 140);

  const alone = fresh('role-ward-self', 19);
  parkHero(alone);
  const self = spawnEnemy(alone, 'warden', {x: 180, y: 80, hp: 240, maxHp: 240});
  updateCombat(alone, 0.05);
  assert.equal(self.wardShield, 0);
  assert.equal(damageEnemy(alone, self, 100), 92);

  const far = fresh('role-ward-far', 19);
  parkHero(far);
  spawnEnemy(far, 'warden', {x: 40, y: 40});
  const distant = spawnEnemy(far, 'shambler', {x: 300, y: 200, hp: 200, maxHp: 200, armor: 0});
  updateCombat(far, 0.05);
  assert.equal(distant.wardShield, 0);
  assert.equal(damageEnemy(far, distant, 100), 100);

  const stunned = fresh('role-ward-stun', 19);
  parkHero(stunned);
  const held = spawnEnemy(stunned, 'warden', {x: 180, y: 80});
  held.statuses = [{type: 'stun', power: 1, remaining: 2, sourceId: 't'}];
  const covered = spawnEnemy(stunned, 'shambler', {x: 180, y: 120, hp: 200, maxHp: 200, armor: 0});
  updateCombat(stunned, 0.05);
  assert.equal(covered.wardShield, 0);
  assert.equal(damageEnemy(stunned, covered, 100), 100);
});

test('a warden does not weaken a fence bite', () => {
  const state = fresh('role-ward-fence', 21);
  parkHero(state);
  const ally = spawnEnemy(state, 'shambler', {x: 180, y: ARENA.fenceY - 12, armor: 0});
  spawnEnemy(state, 'warden', {x: 180, y: ARENA.fenceY - 80});
  const before = state.fence.hp;
  updateCombat(state, 0.05);
  assert.ok(ally.wardShield > 0);
  assert.equal(state.fence.hp, before - ally.damage);
});

test('a cinder charge bites once at the fence, then the fuse finishes the fence hit', () => {
  const state = fresh('role-charge', 23);
  parkHero(state);
  const enemy = spawnEnemy(state, 'charge', {x: 180, y: ARENA.fenceY, hp: 500, maxHp: 500});
  assert.equal(enemy.chargeWindup, 1.45);
  assert.equal(enemy.chargeDamage, 36);
  assert.equal(enemy.chargeLit, false);
  const bite = enemy.damage;
  const before = state.fence.hp;
  updateCombat(state, 0.05);
  assert.equal(state.fence.hp, before - bite);
  assert.equal(enemy.chargeLit, true);
  assert.equal(enemy.dead, false);
  const lit = state.fence.hp;
  let guard = 0;
  while (enemy.dead !== true && guard++ < 40) updateCombat(state, 0.05);
  assert.equal(enemy.dead, true);
  assert.equal(state.fence.hp, lit - enemy.chargeDamage);
});

test('a cinder charge short of the fence does not burn the fence', () => {
  const state = fresh('role-charge-short', 23);
  parkHero(state);
  const enemy = spawnEnemy(state, 'charge', {x: 180, y: 40, speed: 0, hp: 500, maxHp: 500});
  const before = state.fence.hp;
  updateCombat(state, 0.5);
  assert.equal(state.fence.hp, before);
  assert.equal(enemy.chargeLit, false);
  assert.equal(enemy.dead, false);
});

test('killing a lit cinder charge skips the blast', () => {
  const state = fresh('role-charge-kill', 23);
  parkHero(state);
  const enemy = spawnEnemy(state, 'charge', {x: 180, y: ARENA.fenceY, hp: 500, maxHp: 500});
  updateCombat(state, 0.05);
  const afterBite = state.fence.hp;
  damageEnemy(state, enemy, enemy.hp);
  assert.equal(enemy.dead, true);
  updateCombat(state, 2);
  assert.equal(state.fence.hp, afterBite);
});

test('an ash hush on the fence slows defender recharge and a stun restores it', () => {
  const quiet = fresh('role-hush-off', 29);
  parkHero(quiet);
  const hero = quiet.slots[2].unit;
  hero.cooldown = 2;
  updateCombat(quiet, 0.5);
  assert.equal(hero.cooldown, 1.5);

  const state = fresh('role-hush-on', 29);
  parkHero(state);
  const slowed = state.slots[2].unit;
  slowed.cooldown = 2;
  const hush = spawnEnemy(state, 'hush', {x: 180, y: ARENA.fenceY, hp: 400, maxHp: 400});
  assert.equal(hush.hushFactor, 0.75);
  updateCombat(state, 0.5);
  assert.ok(Math.abs(slowed.cooldown - (2 - 0.5 * 0.75)) < 1e-9);

  hush.statuses = [{type: 'stun', power: 1, remaining: 2, sourceId: 't'}];
  const held = slowed.cooldown;
  updateCombat(state, 0.5);
  assert.ok(Math.abs(slowed.cooldown - (held - 0.5)) < 1e-9);
});

test('the new role entries keep armor in range and bilingual names', () => {
  for (const kind of ['leaper', 'splitter', 'mender', 'shade', 'banner', 'warden', 'charge', 'hush']) {
    const row = ENEMIES[kind];
    assert.ok(row, kind);
    assert.ok(row.armor >= 0 && row.armor <= 0.8, `${kind} armor ${row.armor}`);
    assert.equal(typeof row.name.en, 'string');
    assert.ok(row.name.en.length > 0, kind);
    assert.equal(typeof row.name.zh, 'string');
    assert.ok(row.name.zh.length > 0, kind);
  }
});
