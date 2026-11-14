import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {applyStatus, updateStatuses} from '../src/systems/status.js';
import {damageEnemy} from '../src/systems/combat.js';
import {describeFeedback} from '../src/render/effects.js';

function tickingEnemy(id) {
  const state = createRun({seed: 11, difficulty: 'normal', runId: id});
  const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 300, hp: 500, maxHp: 500, armor: 0});
  state.events.length = 0;
  return {state, enemy, sourceId: state.slots[2].unit.id};
}

function tick(state, type, power) {
  updateStatuses(state, 0.25, damageEnemy);
  const hits = state.events.filter(event => event.type === 'hit' && event.attack === type);
  assert.equal(hits.length, 1);
  const feedback = describeFeedback(hits[0]);
  assert.equal(feedback?.type, 'hit');
  assert.equal(hits[0].towerType, type);
  assert.equal(feedback.element, type);
  assert.equal(feedback.crit, false);
  assert.equal(feedback.splash || 0, 0);
  assert.equal(feedback.chain || 0, 0);
  assert.equal(feedback.pierce || 0, 0);
  return {hit: hits[0], feedback, power};
}

test('a burn tick names burn so the number uses the fire palette', () => {
  const {state, enemy, sourceId} = tickingEnemy('burn-tick');
  assert.equal(applyStatus(enemy, {type: 'burn', power: 8, remaining: 0.25, sourceId, tickTimer: 0}).ok, true);
  const {hit, feedback} = tick(state, 'burn');
  assert.equal(hit.damage, 2);
  assert.equal(feedback.behavior, 'fire');
  assert.notEqual(feedback.behavior, 'neutral');
  assert.equal(hit.sourceId, sourceId);
});

test('a poison tick names poison so the number uses the poison palette', () => {
  const {state, enemy, sourceId} = tickingEnemy('poison-tick');
  assert.equal(applyStatus(enemy, {
    type: 'poison', power: 6, remaining: 0.25, sourceId, stacks: 1, tickTimer: 0
  }).ok, true);
  const {hit, feedback} = tick(state, 'poison');
  assert.equal(hit.damage, 1.5);
  assert.equal(feedback.behavior, 'poison');
  assert.notEqual(feedback.behavior, 'neutral');
});
