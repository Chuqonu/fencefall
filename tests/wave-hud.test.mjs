// The wave chip stays the wave number. Progress stays off the HUD.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {WAVES, getWaveInfo} from '../src/systems/waves.js';
import {mountShell} from '../src/ui/shell.js';

function makeNode(tag) {
  const names = new Set();
  const listeners = new Map();
  const node = {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    parent: null,
    attributes: new Map(),
    dataset: {},
    style: {
      width: '',
      setProperty(name, value) { this[name] = value; }
    },
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !names.has(name) : Boolean(force);
        if (on) names.add(name);
        else names.delete(name);
        return on;
      },
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      contains(name) { return names.has(name); }
    },
    textContent: '',
    hidden: false,
    disabled: false,
    inert: false,
    className: '',
    offsetHeight: 0,
    width: 0,
    height: 0,
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
        if (item.parent && item.parent !== node) {
          item.parent.children = item.parent.children.filter(child => child !== item);
        }
        item.parent = node;
        node.children.push(item);
      }
    },
    appendChild(item) { node.append(item); return item; },
    replaceChildren(...items) {
      for (const child of node.children) child.parent = null;
      node.children = [];
      node.append(...items);
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter(item => item !== fn));
    },
    setPointerCapture() {},
    remove() {
      if (!node.parent) return;
      node.parent.children = node.parent.children.filter(child => child !== node);
      node.parent = null;
    }
  };
  return node;
}

function installDocument() {
  const previous = globalThis.document;
  const documentElement = makeNode('html');
  const document = {
    documentElement,
    title: '',
    createElement(tag) { return makeNode(tag); },
    addEventListener(type, fn) { documentElement.addEventListener(type, fn); },
    removeEventListener(type, fn) { documentElement.removeEventListener(type, fn); }
  };
  globalThis.document = document;
  return () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
}

function findByTestId(node, id) {
  if (!node) return null;
  if (node.getAttribute?.('data-testid') === id) return node;
  for (const child of node.children || []) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}

function mount(state, language = 'en') {
  const restore = installDocument();
  const root = makeNode('div');
  const holder = {state};
  const view = mountShell(root, {
    act() {},
    getState() { return holder.state; },
    getProfile() { return {settings: {language, sound: false, reducedMotion: false}}; },
    getUI() { return {screen: 'battle'}; }
  });
  return {
    holder,
    text(id) { return findByTestId(root, id)?.textContent ?? ''; },
    render() { view.render(); },
    close() {
      view.destroy();
      restore();
    }
  };
}

function atProgress(wave, fraction) {
  const state = createRun({seed: 5, difficulty: 'normal', runId: 'wave-hud'});
  const current = WAVES[wave - 1];
  const next = WAVES[wave];
  const end = next && Number.isFinite(next.start) ? next.start : current.start + 30;
  state.wave = wave;
  state.director.nextWave = wave;
  state.director.queue = [];
  state.time = current.start + (end - current.start) * fraction;
  return state;
}

test('the wave value stays a dash with no run and a plain number before wave 1', () => {
  const empty = mount(null);
  try {
    assert.equal(empty.text('hud-wave-value'), '—');
  } finally {
    empty.close();
  }

  const state = createRun({seed: 5, difficulty: 'normal', runId: 'wave-hud-early'});
  assert.ok(getWaveInfo(state).wave < 1);
  const early = mount(state);
  try {
    assert.equal(early.text('hud-wave-value'), '0');
    assert.equal(early.text('hud-wave-value').includes('%'), false);
  } finally {
    early.close();
  }
});

test('a started wave keeps the number on the wave value and leaves the percent off the HUD', () => {
  const state = atProgress(3, 0.4);
  const info = getWaveInfo(state);
  assert.equal(info.wave, 3);
  assert.ok(info.progress >= 0 && info.progress <= 1);
  assert.equal(Math.round(info.progress * 100), 40);

  const hud = mount(state);
  try {
    assert.equal(hud.text('hud-wave-value'), '3');
    assert.equal(hud.text('hud-wave-value').includes('%'), false);

    const later = atProgress(3, 1);
    hud.holder.state = later;
    hud.render();
    const full = getWaveInfo(later);
    assert.equal(Math.round(full.progress * 100), 100);
    assert.equal(hud.text('hud-wave-value'), '3');
    assert.equal(hud.text('hud-wave-value').includes('%'), false);
  } finally {
    hud.close();
  }
});
