import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('the selected-slot ring does not draw splash around the tower', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function drawRange'), source.indexOf('function drawFence'));
  assert.equal(body.includes('stats.splash'), false);
  assert.equal(body.includes('#e25a2a'), false);
  assert.match(body, /stats\.range/);
  assert.match(body, /stats\.aura\?\.range/);
});
