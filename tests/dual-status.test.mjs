import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {applyStatus, updateStatuses} from '../src/systems/status.js';
import {damageEnemy} from '../src/systems/combat.js';
import {exportSave, importSave} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

test('poison and burn on the same enemy both deal damage and stay saveable', () => {
  const profile = createProfile();
  const state = createRun({seed: 19, profile, runId: 'dual-status'});
  const startHp = 100000;
  const enemy = spawnEnemy(state, 'brute', {
    x: 180,
    y: 300,
    hp: startHp,
    maxHp: startHp,
    armor: 0
  });
  const sourceId = state.slots[7].unit.id;
  const burn = applyStatus(enemy, {type: 'burn', power: 8, remaining: 4, sourceId, tickTimer: 0});
  const poison = applyStatus(enemy, {type: 'poison', power: 6, remaining: 4, sourceId, stacks: 1, tickTimer: 0});
  assert.equal(burn.ok, true);
  assert.equal(poison.ok, true);
  assert.equal(enemy.statuses.filter(status => status.type === 'burn').length, 1);
  assert.equal(enemy.statuses.filter(status => status.type === 'poison').length, 1);

  const dealt = {burn: 0, poison: 0};
  const store = memoryStorage();
  // Four 0.25s cadence boundaries, including frames where tick - dt underflows.
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    updateStatuses(state, STEP, (run, target, amount, options = {}) => {
      if (options.type === 'burn' || options.type === 'poison') dealt[options.type] += amount;
      return damageEnemy(run, target, amount, options);
    });
    for (const status of enemy.statuses) {
      assert.equal(typeof status.tickTimer, 'number', `${status.type} tickTimer at frame ${i}`);
      assert.ok(status.tickTimer >= 0, `${status.type} tickTimer ${status.tickTimer} at frame ${i}`);
    }
    const text = exportSave(profile, state);
    const imported = importSave(text, store);
    assert.equal(imported.ok, true, `round trip at frame ${i}`);
    const saved = imported.run.enemies.find(item => item.id === enemy.id);
    assert.ok(saved, `enemy missing from save at frame ${i}`);
    for (const type of ['burn', 'poison']) {
      const status = saved.statuses.find(item => item.type === type);
      assert.ok(status, `${type} missing from save at frame ${i}`);
      assert.ok(status.tickTimer >= 0, `saved ${type} tickTimer ${status.tickTimer} at frame ${i}`);
    }
  }

  assert.ok(dealt.burn > 0, 'burn dealt no damage');
  assert.ok(dealt.poison > 0, 'poison dealt no damage');
  assert.ok(enemy.hp < startHp);
  assert.equal(enemy.dead, false);
  assert.ok(enemy.statuses.some(status => status.type === 'burn' && status.remaining > 0));
  assert.ok(enemy.statuses.some(status => status.type === 'poison' && status.remaining > 0));
});
