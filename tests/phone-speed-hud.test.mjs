// Phone fight HUD: 10× must not push Menu onto a second row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function phoneBlock() {
  const blocks = [...css.matchAll(/@media \(max-width:\s*899px\)\s*\{/g)];
  assert.ok(blocks.length > 0);
  for (const block of blocks) {
    const start = block.index + block[0].length;
    let depth = 1;
    let i = start;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    const body = css.slice(start, i - 1);
    if (body.includes('.hud-controls') && body.includes('.speed-row > .btn')) return body;
  }
  return '';
}

test('phone speed buttons stay 44px and the control row does not wrap', () => {
  const phone = phoneBlock();
  assert.ok(phone, 'phone HUD rules');
  const controls = phone.match(/\.hud-controls\s*\{[^}]+\}/);
  assert.ok(controls);
  assert.match(controls[0], /flex-wrap:\s*nowrap/);
  const speeds = phone.match(/\.hud \.speed-row > \.btn\s*\{[^}]+\}/);
  assert.ok(speeds);
  assert.match(speeds[0], /min-width:\s*44px/);
  assert.match(speeds[0], /min-height:\s*44px/);
  assert.match(speeds[0], /width:\s*44px/);
  assert.match(speeds[0], /padding:\s*0\s*;/);
  const words = phone.match(/\.hud-controls > \.btn\s*\{[^}]+\}/);
  assert.ok(words);
  assert.match(words[0], /min-width:\s*44px/);
  assert.match(words[0], /min-height:\s*44px/);
  assert.match(words[0], /white-space:\s*nowrap/);
});
