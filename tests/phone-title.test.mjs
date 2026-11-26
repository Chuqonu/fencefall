import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the phone title keeps a minimum width', () => {
  const phone = css.match(/@media \(max-width:\s*899px\)\s*\{[\s\S]*?\.brand\s*\{[^}]+\}/);
  assert.ok(phone);
  assert.match(phone[0], /min-width:\s*6\.5rem/);
  assert.doesNotMatch(phone[0], /flex:\s*1\s+1\s+0/);
});
