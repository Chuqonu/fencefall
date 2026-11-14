import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_UPGRADES} from '../src/systems/hero.js';

test('every hero upgrade says it belongs to the hero in both languages', () => {
  for (const spec of Object.values(HERO_UPGRADES)) {
    assert.match(spec.description.en, /hero/i, spec.id);
    assert.match(spec.description.zh, /英雄/, spec.id);
  }
});
