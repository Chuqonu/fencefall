// A boss_enrage event with finite x and y is boss feedback. describeFeedback
// returns type boss, and collectFeedback keeps that boss item. The catalog
// enrage threshold is only read, never replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {ENEMIES} from '../src/data/enemies.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateWaves} from '../src/systems/waves.js';
import {collectFeedback, describeFeedback} from '../src/render/effects.js';

const threshold = ENEMIES.boss.enrage?.threshold;

function cue(x, y) {
  return {type: 'boss_enrage', id: 'boss-cue', kind: 'boss', x, y, time: 1.25};
}

function bossItems(batch, x, y) {
  return batch.filter(item => item && item.type === 'boss' && item.x === x && item.y === y);
}

test('describeFeedback returns type boss for a boss_enrage event with finite x and y', () => {
  const event = cue(180, 120);
  assert.equal(Number.isFinite(event.x), true);
  assert.equal(Number.isFinite(event.y), true);
  const desc = describeFeedback(event);
  assert.ok(desc, 'describeFeedback returned null for boss_enrage');
  assert.equal(desc.type, 'boss');
  assert.equal(desc.x, 180);
  assert.equal(desc.y, 120);
  assert.equal(Number.isFinite(desc.x), true);
  assert.equal(Number.isFinite(desc.y), true);
  assert.equal(event.type, 'boss_enrage');
});

test('collectFeedback keeps the boss item from a boss_enrage event', () => {
  const event = cue(180, 120);
  const input = [
    {type: 'shot', x: 48, y: 520, damage: 3, time: 1},
    {type: 'hit', x: 90, y: 210, damage: 6, time: 1.1},
    event,
    {type: 'kill', x: 90, y: 210, damage: 6, time: 1.2},
  ];
  const before = JSON.stringify(input);
  const batch = collectFeedback(input);
  assert.equal(JSON.stringify(input), before, 'collectFeedback mutated the event list');
  const bosses = bossItems(batch, 180, 120);
  assert.equal(bosses.length, 1, 'collectFeedback did not keep the boss item');
  assert.equal(Number.isFinite(bosses[0].x), true);
  assert.equal(Number.isFinite(bosses[0].y), true);
  assert.equal(batch.some(item => item.type === 'shot'), true);
  assert.equal(batch.some(item => item.type === 'hit'), true);
  assert.equal(batch.some(item => item.type === 'kill'), true);
});

test('the boss_enrage event emitted at the catalog threshold reaches boss feedback', () => {
  assert.equal(threshold, 0.5, 'catalog enrage threshold moved');
  assert.ok(threshold > 0 && threshold < 1);
  const maxHp = 1000;
  const atHp = maxHp * threshold;
  const aboveHp = Math.min(maxHp, Math.floor(atHp) + 1);
  assert.ok(aboveHp / maxHp > threshold, 'no HP sits above the catalog threshold');
  assert.ok(atHp > 0 && atHp / maxHp <= threshold, 'at-threshold HP is above the catalog threshold');

  const state = createRun({seed: 401, difficulty: 'normal', runId: 'boss-enrage-cue'});
  const enemy = spawnEnemy(state, 'boss', {x: 180, y: 120, hp: aboveHp, maxHp});
  assert.equal(Number.isFinite(enemy.x), true);
  assert.equal(Number.isFinite(enemy.y), true);
  updateWaves(state, STEP);
  assert.equal(
    state.events.some(event => event?.type === 'boss_enrage'),
    false,
    'boss_enrage emitted above the catalog threshold',
  );

  enemy.hp = atHp;
  updateWaves(state, STEP);
  const event = state.events.find(item => item?.type === 'boss_enrage' && item.id === enemy.id);
  assert.ok(event, 'boss_enrage was not emitted at the catalog threshold');
  assert.equal(event.x, enemy.x);
  assert.equal(event.y, enemy.y);
  assert.equal(Number.isFinite(event.x), true);
  assert.equal(Number.isFinite(event.y), true);
  assert.equal(ENEMIES.boss.enrage.threshold, 0.5);

  const desc = describeFeedback(event);
  assert.ok(desc, 'describeFeedback returned null for the emitted boss_enrage');
  assert.equal(desc.type, 'boss');
  assert.equal(desc.x, event.x);
  assert.equal(desc.y, event.y);

  const types = state.events.map(item => item.type);
  const batch = collectFeedback(state.events);
  assert.deepEqual(state.events.map(item => item.type), types);
  assert.equal(bossItems(batch, event.x, event.y).length, 1, 'collectFeedback did not keep the emitted boss item');
});
