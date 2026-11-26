import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeFeedback} from '../src/render/effects.js';

test('a fence hit keeps the remaining ratio so a low fence can sound sharper', () => {
  const low = describeFeedback({type: 'fence_hit', damage: 12, ratio: 0.2, x: 40, y: 450});
  assert.equal(low.type, 'fence_hit');
  assert.equal(low.ratio, 0.2);
  const high = describeFeedback({type: 'fence_hit', damage: 12, ratio: 1.4, x: 40, y: 450});
  assert.equal(high.ratio, 1);
  const plain = describeFeedback({type: 'fence_hit', damage: 12, x: 40, y: 450});
  assert.equal(plain.ratio, null);
  const source = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function playFence'), source.indexOf('function playMerge'));
  assert.match(body, /ratio <= 0\.3/);
  assert.match(body, /118/);
});
