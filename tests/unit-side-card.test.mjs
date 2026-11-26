// A wide window docks the stats card beside the board. A phone keeps the top card.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRun} from '../src/state.js';
import {mountShell} from '../src/ui/shell.js';
import {t as translate} from '../src/i18n.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/build-panel.js', import.meta.url), 'utf8');

test('the phone stats card stays centered and the wide card uses the side margin', () => {
  assert.match(css, /\.panel-wrap\s*\{[^}]*left:\s*50%/);
  assert.match(css, /max-height:\s*min\(46vh,\s*420px\)/);
  assert.match(css, /\.shell\.is-unit-open:not\(\.has-side-card\) \.panel-wrap:not\(:has\(\[data-ui="panel"\]:empty\)\)\s*\{[^}]*bottom:\s*calc\(100% - \(var\(--board-top\) \+ var\(--board-height\) \* 512 \/ 640\) \+ 8px\)/);
  assert.match(css, /\.shell\.is-unit-open:not\(\.has-side-card\) \.panel-wrap:not\(:has\(\[data-ui="panel"\]:empty\)\)\s*\{[^}]*max-height:\s*160px/);
  assert.match(css, /\.shell\.is-unit-open \.panel-wrap/);
  const side = css.match(/\.shell\.has-side-card\.is-unit-open \.panel-wrap:not\(:has\(\[data-ui="panel"\]:empty\)\)\s*\{[^}]+\}/);
  assert.ok(side, 'side card rule');
  assert.match(side[0], /left:\s*calc\(var\(--board-left\) - var\(--side-card-width\) - 12px\)/);
  assert.match(side[0], /transform:\s*none/);
  assert.match(side[0], /min\(360px,\s*calc\(var\(--board-left\) - 24px\)\)/);
  assert.match(panel, /\.ff-build \.ff-slots:not\(\.ff-place-row\) \.btn\{[^}]*flex-direction:\s*column/);
  assert.match(panel, /\.ff-build\.is-placing \.ff-place-row\{[^}]*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
});

function makeNode(tag, wide) {
  const names = new Set();
  const node = {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    parent: null,
    attributes: new Map(),
    dataset: {},
    style: {setProperty(name, value) { this[name] = value; }},
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !names.has(name) : Boolean(force);
        if (on) names.add(name);
        else names.delete(name);
        return on;
      },
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      contains(name) { return names.has(name); },
    },
    textContent: '',
    hidden: false,
    disabled: false,
    inert: false,
    className: '',
    offsetHeight: 48,
    setAttribute(key, value) {
      node.attributes.set(key, String(value));
      if (key.startsWith('data-')) {
        const prop = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        node.dataset[prop] = String(value);
      }
    },
    getAttribute(key) { return node.attributes.has(key) ? node.attributes.get(key) : null; },
    removeAttribute(key) { node.attributes.delete(key); },
    append(...items) {
      for (const item of items) {
        if (item == null) continue;
        item.parent = node;
        node.children.push(item);
      }
    },
    appendChild(item) { node.append(item); return item; },
    replaceChildren(...items) {
      node.children = [];
      node.append(...items);
    },
    remove() {
      if (!node.parent) return;
      node.parent.children = node.parent.children.filter((child) => child !== node);
      node.parent = null;
    },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    querySelector() { return null; },
    getBoundingClientRect() {
      const name = String(node.className || '');
      if (name.includes('field-frame')) {
        return wide
          ? {left: 415, top: 0, width: 450, height: 800, right: 865, bottom: 800}
          : {left: 0, top: 75, width: 390, height: 693, right: 390, bottom: 768};
      }
      return wide
        ? {left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800}
        : {left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844};
    },
  };
  return node;
}

function mount(wide, screen) {
  const previous = globalThis.document;
  const documentElement = makeNode('html', wide);
  globalThis.document = {
    documentElement,
    title: '',
    createElement(tag) { return makeNode(tag, wide); },
    addEventListener() {},
    removeEventListener() {},
  };
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'side-card'});
  const root = makeNode('div', wide);
  const view = mountShell(root, {
    act() {},
    t(key, vars) { return translate('en', key, vars); },
    getState() { return state; },
    getProfile() { return state.profileSnapshot; },
    getUI() { return {screen, selectedSlot: 2}; },
  });
  const shell = root.children[0];
  const restore = () => {
    view.destroy();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
  return {shell, restore};
}

test('a wide battle docks the card and a full-bleed phone battle does not', () => {
  const wide = mount(true, 'battle');
  try {
    assert.equal(wide.shell.classList.contains('has-side-card'), true);
    assert.equal(wide.shell.classList.contains('is-unit-open'), true);
    assert.equal(wide.shell.style['--board-left'], '415px');
  } finally {
    wide.restore();
  }
  const phone = mount(false, 'battle');
  try {
    assert.equal(phone.shell.classList.contains('has-side-card'), false);
    assert.equal(phone.shell.classList.contains('is-unit-open'), true);
    assert.equal(phone.shell.style['--board-left'], '0px');
    assert.equal(phone.shell.style['--board-top'], '75px');
    assert.equal(phone.shell.style['--board-height'], '693px');
  } finally {
    phone.restore();
  }
  const menu = mount(true, 'menu');
  try {
    assert.equal(menu.shell.classList.contains('has-side-card'), false);
  } finally {
    menu.restore();
  }
});
