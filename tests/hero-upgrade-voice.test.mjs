import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_UPGRADES} from '../src/systems/hero.js';

test('every Gun Mod and Auto Skill uses clean plain copy in both languages without clunky Hero prefixes', () => {
  for (const spec of Object.values(HERO_UPGRADES)) {
    assert.ok(typeof spec.name?.en === 'string' && spec.name.en.trim().length > 0, spec.id);
    assert.ok(typeof spec.name?.zh === 'string' && spec.name.zh.trim().length > 0, spec.id);
    assert.ok(typeof spec.description?.en === 'string' && spec.description.en.trim().length > 0, spec.id);
    assert.ok(typeof spec.description?.zh === 'string' && spec.description.zh.trim().length > 0, spec.id);
    assert.equal(spec.description.en.startsWith('Hero · '), false, `${spec.id} dropped clunky Hero prefix`);
    assert.equal(spec.description.zh.startsWith('英雄 · '), false, `${spec.id} dropped clunky 英雄 prefix`);
  }
});
