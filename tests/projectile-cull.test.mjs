// Offscreen shots that combat still keeps must remain in a save.
// The visible field is the 360×640 arena. Storage matches the combat cull
// window: x in [-100, width + 100], y in [-120, height + 80].
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile, createRun} from '../src/engine.js';
import {ARENA, STEP, createUnit} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {updateCombat} from '../src/systems/combat.js';
import {exportSave, importSave, loadRun} from '../src/storage.js';

const STORAGE = {
  minX: -100,
  maxX: ARENA.width + 100,
  minY: -120,
  maxY: ARENA.height + 80
};

// A few pixels past the arena, plus the inclusive storage edges.
const PLACES = [
  {name: 'just left of the field', x: -4, y: 240},
  {name: 'just right of the field', x: ARENA.width + 4, y: 240},
  {name: 'just above the field', x: 180, y: -4},
  {name: 'just below the field', x: 180, y: ARENA.height + 4},
  {name: 'left storage edge', x: STORAGE.minX, y: 240},
  {name: 'right storage edge', x: STORAGE.maxX, y: 240},
  {name: 'top storage edge', x: 180, y: STORAGE.minY},
  {name: 'bottom storage edge', x: 180, y: STORAGE.maxY}
];

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

function onField(x, y) {
  return x >= 0 && y >= 0 && x <= ARENA.width && y <= ARENA.height;
}

function inStorage(x, y) {
  return x >= STORAGE.minX && x <= STORAGE.maxX && y >= STORAGE.minY && y <= STORAGE.maxY;
}

function freshShot(name) {
  const profile = createProfile();
  const state = createRun({
    seed: 20,
    difficulty: 'normal',
    profile,
    runId: `projectile-cull-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  });
  state.slots[7].unit.cooldown = 600;
  const slot = state.slots[0];
  slot.unit = createUnit(state, 'bolt', 1, 'tower');
  slot.unit.cooldown = 0;
  spawnEnemy(state, 'shambler', {
    x: slot.x,
    y: slot.y - 180,
    damage: 0,
    attackCooldown: 10
  });
  updateCombat(state, STEP);
  assert.equal(state.projectiles.length, 1, name);
  state.fence.hp = state.fence.maxHp - 40;
  return {profile, state, projectile: state.projectiles[0]};
}

test('a projectile just outside the field and inside storage bounds exports and imports', () => {
  for (const place of PLACES) {
    assert.equal(onField(place.x, place.y), false, place.name);
    assert.equal(inStorage(place.x, place.y), true, place.name);

    const {profile, state, projectile} = freshShot(place.name);
    projectile.x = place.x;
    projectile.y = place.y;
    const fenceHp = state.fence.hp;
    const fenceMax = state.fence.maxHp;
    assert.ok(fenceHp < fenceMax, place.name);
    assert.ok(fenceHp > 0, place.name);
    const damage = projectile.damage;
    const life = projectile.life;

    const text = exportSave(profile, state);
    const storage = memoryStorage();
    const imported = importSave(text, storage);
    assert.equal(imported.ok, true, `${place.name}: ${imported.reason}`);

    for (const saved of [imported.run, loadRun(storage)]) {
      assert.ok(saved, place.name);
      assert.equal(saved.projectiles.length, 1, place.name);
      const savedShot = saved.projectiles[0];
      assert.equal(savedShot.id, projectile.id, place.name);
      assert.equal(savedShot.x, place.x, place.name);
      assert.equal(savedShot.y, place.y, place.name);
      assert.equal(savedShot.sourceId, projectile.sourceId, place.name);
      assert.equal(savedShot.damage, damage, place.name);
      assert.equal(savedShot.life, life, place.name);
      assert.ok(saved.fence.hp <= fenceHp, `${place.name}: fence HP ${saved.fence.hp} rose above ${fenceHp}`);
      assert.equal(saved.fence.hp, fenceHp, place.name);
      assert.equal(saved.fence.maxHp, fenceMax, place.name);
    }

    imported.run.paused = false;
    updateCombat(imported.run, STEP);
    assert.ok(
      imported.run.fence.hp <= fenceHp,
      `${place.name}: combat raised fence HP from ${fenceHp} to ${imported.run.fence.hp}`
    );
    assert.equal(imported.run.fence.maxHp, fenceMax, place.name);
  }
});
