import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRun} from '../src/state.js';
import {mountShell} from '../src/ui/shell.js';
import {t as translate} from '../src/i18n.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('the battlefield fills the viewport and the unit card is a popup', () => {
  assert.doesNotMatch(css, /100dvh - 230px/);
  assert.doesNotMatch(css, /minmax\(260px,\s*380px\)/);
  assert.doesNotMatch(css, /min\(100cqw,\s*340px/);
  assert.match(css, /calc\(100dvh \* 360 \/ 640\)/);
  assert.match(css, /\.field-slot\s*\{[^}]*place-items:\s*start center/);
  assert.match(css, /\.shell\.is-unit-open \.panel-wrap/);
  assert.match(css, /\.shell\.is-menu \.topbar \{\s*display:\s*flex/);
  assert.match(css, /\.shell\.is-menu \.hud \{\s*display:\s*none/);
});

function makeNode(tag) {
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
    getBoundingClientRect() { return {left: 0, top: 0, width: 360, height: 640, right: 360, bottom: 640}; },
  };
  return node;
}

test('selecting a slot opens the unit popup and an empty selection does not', () => {
  const previous = globalThis.document;
  const documentElement = makeNode('html');
  globalThis.document = {
    documentElement,
    title: '',
    createElement(tag) { return makeNode(tag); },
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    const state = createRun({seed: 4, difficulty: 'normal', runId: 'popup'});
    const root = makeNode('div');
    const view = mountShell(root, {
      act() {},
      t(key, vars) { return translate('en', key, vars); },
      getState() { return state; },
      getProfile() { return state.profileSnapshot; },
      getUI() { return {screen: 'battle', selectedSlot: 2}; },
    });
    const shell = root.children[0];
    assert.equal(shell.classList.contains('is-unit-open'), true);
    view.destroy();
    const closed = makeNode('div');
    const again = mountShell(closed, {
      act() {},
      t(key, vars) { return translate('en', key, vars); },
      getState() { return state; },
      getProfile() { return state.profileSnapshot; },
      getUI() { return {screen: 'battle', selectedSlot: -1}; },
    });
    assert.equal(closed.children[0].classList.contains('is-unit-open'), false);
    again.destroy();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
