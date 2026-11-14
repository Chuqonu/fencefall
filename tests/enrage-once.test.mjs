// Boss enrage applies once. updateWaves reads ENEMIES.boss.enrage and, when a
// live boss's hp / maxHp falls to that threshold, multiplies speed and damage
// once and emits one boss_enrage event. A later update at the same HP must
// leave those stats and that event count alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateWaves} from '../src/systems/waves.js';

const enrage = ENEMIES.boss.enrage;
const threshold = enrage?.threshold;

function finiteScale(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function enrageEvents(state, id) {
  return (state.events || []).filter(event => event?.type === 'boss_enrage' && event.id === id);
}

test('boss enrage scales speed and damage once and does not emit a second boss_enrage', () => {
  assert.ok(Number.isFinite(threshold), 'boss data enrage threshold is missing');
  assert.ok(threshold > 0 && threshold < 1, `boss data enrage threshold ${threshold} is outside (0, 1)`);

  const speedScale = finiteScale(enrage.speedScale);
  const damageScale = finiteScale(enrage.damageScale);
  assert.ok(speedScale > 1, `boss enrage speedScale ${enrage.speedScale} does not increase speed`);
  assert.ok(damageScale > 1, `boss enrage damageScale ${enrage.damageScale} does not increase damage`);

  const maxHp = 1000;
  const atHp = maxHp * threshold;
  const aboveHp = Math.min(maxHp, Math.floor(atHp) + 1);
  assert.ok(aboveHp / maxHp > threshold, `setup HP ${aboveHp}/${maxHp} is not above threshold ${threshold}`);
  assert.ok(atHp > 0 && atHp / maxHp <= threshold, `threshold HP ${atHp}/${maxHp} is not at or below ${threshold}`);

  const state = createRun({seed: 402, difficulty: 'normal', runId: 'enrage-once'});
  const enemy = spawnEnemy(state, 'boss', {x: 180, y: 120, hp: aboveHp, maxHp});
  assert.equal(enemy.kind, 'boss');
  assert.notEqual(enemy.enraged, true);

  updateWaves(state, STEP);
  assert.notEqual(enemy.enraged, true, `boss enraged while still above threshold ${threshold}`);
  assert.equal(enrageEvents(state, enemy.id).length, 0, 'boss_enrage emitted above the data threshold');

  const speed = enemy.speed;
  const damage = enemy.damage;
  enemy.hp = atHp;
  assert.equal(enemy.hp / enemy.maxHp <= threshold, true, `dropped HP is not at threshold ${threshold}`);
  assert.ok(enemy.hp > 0, 'dropped HP is not live');

  updateWaves(state, STEP);
  const speedOnce = speed * speedScale;
  const damageOnce = damage * damageScale;
  assert.equal(enemy.enraged, true, `boss at threshold ${threshold} did not set enemy.enraged`);
  assert.equal(enemy.speed, speedOnce, `speed after first enrage: expected ${speed} * ${speedScale}`);
  assert.equal(enemy.damage, damageOnce, `damage after first enrage: expected ${damage} * ${damageScale}`);
  assert.ok(enemy.speed > speed, 'speed did not increase on the first enrage');
  assert.ok(enemy.damage > damage, 'damage did not increase on the first enrage');
  assert.equal(enrageEvents(state, enemy.id).length, 1, 'boss_enrage was not emitted once');
  assert.equal(enemy.hp, atHp, 'first enrage update changed HP');

  const speedAfterFirst = enemy.speed;
  const damageAfterFirst = enemy.damage;
  updateWaves(state, STEP);
  assert.equal(enemy.hp, atHp, 'HP left the enrage threshold before the second update');
  assert.equal(
    enemy.speed,
    speedAfterFirst,
    `second update scaled speed again: first ${speedAfterFirst}, second ${enemy.speed}`,
  );
  assert.equal(
    enemy.damage,
    damageAfterFirst,
    `second update scaled damage again: first ${damageAfterFirst}, second ${enemy.damage}`,
  );
  assert.equal(enemy.enraged, true, 'enemy.enraged cleared on the second update');
  assert.equal(
    enrageEvents(state, enemy.id).length,
    1,
    `second update emitted another boss_enrage (count ${enrageEvents(state, enemy.id).length})`,
  );
});
