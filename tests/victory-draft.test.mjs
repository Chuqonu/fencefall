// The last kill does not open a draft. One step after a kill that crosses
// nextDraftXp: an open director with an empty queue offers three cards, and a
// finished director with an empty queue ends in victory with draft still null.
// Time stays under the first wave at 1 second, so the schedule does not spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, step} from '../src/engine.js';
import {STEP} from '../src/shared.js';
import {spawnEnemy} from '../src/systems/movement.js';
import {killEnemy} from '../src/systems/combat.js';
import {draftXpCost} from '../src/systems/drafts.js';
import {WAVES} from '../src/systems/waves.js';

const FIRST_WAVE_AT = 0.5;

function heroCount(state) {
  return state.slots.filter(slot => {
    const unit = slot.unit;
    return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
  }).length;
}

function unitCount(state) {
  return state.slots.filter(slot => slot.unit).length;
}

function crossingKill(done) {
  const state = createRun({
    seed: 614,
    difficulty: 'normal',
    runId: done ? 'victory-draft-done' : 'victory-draft-open',
  });
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.director.done, false);
  assert.equal(state.director.queue.length, 0);
  assert.equal(state.nextDraftXp, draftXpCost(0));
  assert.equal(WAVES[0].start, FIRST_WAVE_AT);
  assert.equal(heroCount(state), 1);
  assert.equal(unitCount(state), 1);

  const hero = state.slots[2].unit;
  const enemy = spawnEnemy(state, 'shambler', {x: 180, y: 200});
  const award = enemy.xp;
  assert.ok(award > 0 && award <= state.nextDraftXp);
  const threshold = state.nextDraftXp;
  state.xp = threshold - award;
  assert.ok(state.xp < threshold);

  state.time = 0;
  state.director.done = done;
  state.director.queue = [];
  assert.equal(killEnemy(state, enemy, hero.id), true);
  assert.ok(state.xp >= threshold);
  assert.equal(state.xp, threshold);
  assert.equal(state.phase, 'playing');
  assert.equal(state.draft, null);
  assert.equal(state.tick, 0);

  step(state);

  assert.equal(state.tick, 1);
  assert.equal(state.time, STEP);
  assert.ok(state.time < WAVES[0].start);
  assert.ok(state.time < FIRST_WAVE_AT);
  assert.equal(state.director.queue.length, 0);
  assert.equal(state.wave, 0);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.director.done, done);
  assert.equal(heroCount(state), 1);
  assert.equal(unitCount(state), 1);
  assert.equal(state.slots[2].unit, hero);
  return {state, threshold};
}

test('a kill that crosses nextDraftXp opens three options while the director is not done', () => {
  const {state, threshold} = crossingKill(false);
  assert.equal(state.phase, 'draft');
  assert.ok(state.draft && Array.isArray(state.draft.options));
  assert.equal(state.draft.options.length, 3);
  assert.equal(new Set(state.draft.options.map(card => card && card.id)).size, 3);
  assert.equal(state.draftLevel, 1);
  assert.equal(state.xp, 0);
  assert.equal(state.nextDraftXp, draftXpCost(1));
  assert.ok(state.nextDraftXp > threshold);
  assert.equal(state.events.some(event => event.type === 'draft'), true);
  assert.equal(state.events.some(event => event.type === 'victory'), false);
});

test('the same kill ends in victory and leaves the draft closed when the director is done', () => {
  const {state, threshold} = crossingKill(true);
  assert.equal(state.phase, 'victory');
  assert.equal(state.draft, null);
  assert.equal(state.pendingUnit, null);
  assert.equal(state.draftLevel, 0);
  assert.equal(state.xp, threshold);
  assert.equal(state.nextDraftXp, threshold);
  assert.equal(state.nextDraftXp, draftXpCost(0));
  assert.equal(state.events.some(event => event.type === 'victory'), true);
  assert.equal(state.events.some(event => event.type === 'draft'), false);
});
