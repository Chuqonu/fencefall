import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {STEP, createUnit} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {getUnitStats} from '../src/data/towers.js';
import {exportSave, importSave, loadRun} from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test('chain crit chance survives a save', () => {
  const profile = createProfile();
  const state = createRun({seed: 20, difficulty: 'normal', profile, runId: 'chain-save'});
  state.slots[7].unit.cooldown = 600;
  const slot = state.slots[2];
  const unit = createUnit(state, 'arcbolt', 1, 'hybrid');
  slot.unit = unit;
  const stats = getUnitStats(unit, state);
  assert.ok(stats.chain >= 1);
  assert.ok(stats.critChance > 0);

  spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 150,
    damage: 0
  });
  updateCombat(state, STEP);

  assert.equal(state.projectiles.length, 1);
  const projectile = state.projectiles[0];
  assert.equal(projectile.critChance, stats.critChance);
  assert.equal(projectile.chain, stats.chain);
  const critChance = projectile.critChance;
  const chain = projectile.chain;
  const fenceHp = state.fence.hp;

  const text = exportSave(profile, state);
  const storage = memoryStorage();
  const imported = importSave(text, storage);
  assert.equal(imported.ok, true, imported.reason);

  for (const saved of [imported.run, loadRun(storage)]) {
    assert.ok(saved);
    assert.equal(saved.projectiles.length, 1);
    assert.equal(saved.projectiles[0].id, projectile.id);
    assert.equal(saved.projectiles[0].critChance, critChance);
    assert.equal(saved.projectiles[0].chain, chain);
    assert.ok(saved.fence.hp <= fenceHp, `fence HP ${saved.fence.hp} rose above ${fenceHp}`);
  }
});
