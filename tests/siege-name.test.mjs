import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES} from '../src/systems/waves.js';

test('the siege wave is named 围城纵队 and no wave uses 篱', () => {
  const siege = WAVES.find(wave => wave.name?.en === 'Siege train');
  assert.ok(siege);
  assert.equal(siege.name.zh, '围城纵队');
  for (const wave of WAVES) {
    assert.equal(String(wave.name?.zh || '').includes('篱'), false, wave.id || wave.name?.en);
    assert.equal(String(wave.hint?.zh || '').includes('篱'), false, wave.id || wave.name?.en);
  }
});
