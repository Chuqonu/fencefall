import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, integrationInfo, step} from '../src/engine.js';

test('the hero draft opens after one fence-side enemy falls', () => {
  const state = createRun({seed: 4, runId: 'fight', difficulty: 'normal'});
  state.enemies.push({
    id: 'e1',
    kind: 'shambler',
    x: 180,
    y: 438,
    hp: 40,
    maxHp: 40,
    speed: 0,
    radius: 12,
    damage: 10,
    attackInterval: 0.4,
    attackCooldown: 0,
    xp: 8,
    armor: 0,
    driftPhase: 0,
    driftVelocity: 0,
    statuses: [],
    attacking: true,
    dead: false,
  });
  for (let i = 0; i < 400 && state.phase === 'playing'; i += 1) step(state);
  assert.equal(integrationInfo().present.combat, true);
  assert.equal(integrationInfo().present.drafts, true);
  assert.equal(state.kills >= 1, true);
  assert.ok(state.fence.hp < state.fence.maxHp);
  assert.ok(state.fence.hp > 0);
  if (!integrationInfo().present.waves) {
    assert.equal(state.phase, 'draft');
    assert.equal(state.draft.options.length, 3);
    assert.equal(new Set(state.draft.options.map(option => option.id)).size, 3);
  }
});
