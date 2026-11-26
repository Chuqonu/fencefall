// Phone menu: every screen button stays fully on screen. The fight speed row stays one line.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function mediaBlocks(query) {
  const blocks = [...css.matchAll(new RegExp(`@media \\(${query}\\)\\s*\\{`, 'g'))];
  return blocks.map((block) => {
    const start = block.index + block[0].length;
    let depth = 1;
    let i = start;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    return css.slice(start, i - 1);
  });
}

test('phone menu navigation wraps and the fight speed row stays one line', () => {
  const phone = mediaBlocks('max-width:\\s*899px');
  const menu = phone.find((body) => body.includes('.nav-scroll') && body.includes('flex-wrap: wrap'));
  assert.ok(menu, 'phone menu nav rules');
  const nav = menu.match(/\.nav-scroll\s*\{[^}]+\}/);
  assert.ok(nav);
  assert.match(nav[0], /flex-wrap:\s*wrap/);
  assert.match(nav[0], /overflow:\s*visible/);
  assert.match(nav[0], /max-width:\s*100%/);
  assert.doesNotMatch(nav[0], /flex-wrap:\s*nowrap/);

  const fight = phone.find((body) => body.includes('.hud-controls') && body.includes('.speed-row > .btn'));
  assert.ok(fight, 'phone fight controls');
  const controls = fight.match(/\.hud-controls\s*\{[^}]+\}/);
  assert.ok(controls);
  assert.match(controls[0], /flex-wrap:\s*nowrap/);
  assert.doesNotMatch(fight, /\.speed-row\s*\{[^}]*flex-wrap:\s*wrap/);
});
