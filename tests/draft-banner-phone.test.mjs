import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the phone draft overlay stays a top banner and the HUD stays one stats row', () => {
  assert.doesNotMatch(css, /max-height:\s*min\(38vh,\s*250px\)/);
  assert.doesNotMatch(css, /\.hud-stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.shell\.is-draft \[data-ui="overlay"\]\s*\{[^}]*bottom:\s*auto/);
  assert.match(css, /\.shell\.is-draft \[data-ui="overlay"\]\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /max-height:\s*min\(48vh,\s*380px\)/);
});
