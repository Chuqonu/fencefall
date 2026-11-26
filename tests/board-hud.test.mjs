// The fight HUD sits on the board. Side margins stay empty, and the
// pause / speed / menu row stays one line of 44px controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function rules(selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]+\\}`, 'g');
  return css.match(pattern) || [];
}

function block(header) {
  const start = css.indexOf(header);
  assert.ok(start >= 0, header);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  assert.fail(`unclosed ${header}`);
}

test('the fight HUD uses the board box and leaves the side margins', () => {
  const hud = rules('.hud').find((item) => item.includes('--board-left'));
  assert.ok(hud, 'board-aligned hud rule');
  assert.match(hud, /left:\s*var\(--board-left,\s*0px\)/);
  assert.match(hud, /width:\s*var\(--board-width,\s*100%\)/);
  assert.match(hud, /right:\s*auto/);
  assert.doesNotMatch(hud, /right:\s*0/);
  const meter = rules('.hud-meters > .meter')[0];
  assert.ok(meter);
  assert.match(meter, /flex:\s*1\s+1\s+auto/);
});

test('the fight control row stays one nowrap line on the board', () => {
  const controls = rules('.hud-controls').find((item) => item.includes('flex-wrap'));
  assert.ok(controls, 'fight control row');
  assert.match(controls, /flex-wrap:\s*nowrap/);
  assert.match(controls, /flex:\s*1\s+1\s+100%/);
  assert.match(controls, /max-width:\s*100%/);
  const narrow = block('@container (max-width: 640px)');
  assert.match(narrow, /\.hud-controls\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(narrow, /\.hud \.speed-row > \.btn\s*\{[^}]*min-width:\s*44px/);
  assert.match(narrow, /\.hud \.speed-row > \.btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(narrow, /\.hud-controls > \.btn\s*\{[^}]*min-width:\s*44px/);
  assert.match(narrow, /\.hud-controls > \.btn\s*\{[^}]*min-height:\s*44px/);
});
