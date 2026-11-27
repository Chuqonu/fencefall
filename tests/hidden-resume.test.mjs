// Coming back to a hidden fight must resume from the short fight-row button.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/boot.js';
import {advance} from '../src/engine.js';
import {mountShell} from '../src/ui/shell.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

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
    _text: '',
    get textContent() {
      if (node._text) return node._text;
      return node.children.map(child => child.textContent || '').join('');
    },
    set textContent(value) {
      node._text = value == null ? '' : String(value);
    },
    hidden: false,
    disabled: false,
    inert: false,
    className: '',
    offsetHeight: 48,
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
    emit(type, event) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
    closest(selector) {
      let current = node;
      while (current) {
        if (selector === '[data-ui]' && current.getAttribute?.('data-ui')) return current;
        if (selector === 'button[data-action]' && current.tagName === 'BUTTON' && current.getAttribute?.('data-action')) return current;
        current = current.parent;
      }
      return null;
    },
    contains(other) {
      let current = other;
      while (current) {
        if (current === node) return true;
        current = current.parent;
      }
      return false;
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
  const keys = [];
  const document = {
    documentElement,
    title: '',
    createElement(tag) { return makeNode(tag); },
    addEventListener(type, fn) {
      if (type === 'keydown') keys.push(fn);
      documentElement.addEventListener(type, fn);
    },
    removeEventListener(type, fn) {
      const index = keys.indexOf(fn);
      if (index >= 0) keys.splice(index, 1);
      documentElement.removeEventListener(type, fn);
    },
    dispatchKey(code) {
      const event = {
        code,
        repeat: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: documentElement,
        preventDefault() { event.defaultPrevented = true; }
      };
      for (const fn of keys) fn(event);
    }
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

async function heldFight(language, flags) {
  const api = await createController({storage: memoryStorage()});
  assert.equal(api.act('language', {value: language}).ok, true);
  assert.equal(api.act('start', {difficulty: 'normal', seed: 9}).ok, true);
  const state = api.getState();
  advance(state, 0.5);
  const tick = state.tick;
  assert.ok(tick > 0);
  state.hiddenPaused = true;
  state.paused = flags.paused === true;
  advance(state, 1);
  assert.equal(state.tick, tick);
  const restore = installDocument();
  const root = makeNode('div');
  const shell = mountShell(root, api);
  return {
    api,
    state,
    tick,
    root,
    shell,
    close() {
      shell.destroy();
      restore();
    }
  };
}

function pressResume(root) {
  const button = findByTestId(root, 'btn-pause');
  const shell = findByTestId(root, 'shell-root');
  shell.emit('click', {target: button});
}

test('a hidden fight shows a short Resume button and one tap starts the clock', async () => {
  const fight = await heldFight('en', {paused: false});
  try {
    const button = findByTestId(fight.root, 'btn-pause');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Resume');
    assert.equal(button.getAttribute('data-action'), 'resume');
    assert.equal(button.textContent.includes('hidden'), false);
    assert.equal(findByTestId(fight.root, 'hud-phase').textContent, 'Paused');
    assert.equal(findByTestId(fight.root, 'btn-speed-1').textContent, '1×');
    assert.equal(findByTestId(fight.root, 'btn-speed-10').textContent, '10×');
    assert.equal(findByTestId(fight.root, 'btn-fight-menu').textContent, 'Menu');

    pressResume(fight.root);
    assert.equal(fight.state.hiddenPaused, false);
    assert.equal(fight.state.paused, false);
    advance(fight.state, 0.5);
    assert.ok(fight.state.tick > fight.tick);
    fight.shell.render();
    assert.equal(findByTestId(fight.root, 'btn-pause').textContent, 'Pause');
    assert.equal(findByTestId(fight.root, 'btn-pause').getAttribute('data-action'), 'pause');
  } finally {
    fight.close();
  }
});

test('a hidden fight in Chinese uses the short resume label', async () => {
  const fight = await heldFight('zh', {paused: false});
  try {
    const button = findByTestId(fight.root, 'btn-pause');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, '继续');
    assert.equal(button.textContent.includes('页面已隐藏'), false);
    assert.equal(findByTestId(fight.root, 'hud-phase').textContent, '已暂停');
    assert.equal(findByTestId(fight.root, 'btn-fight-menu').textContent, '菜单');
  } finally {
    fight.close();
  }
});

test('one Resume tap starts a fight that was paused and then hidden', async () => {
  const fight = await heldFight('en', {paused: true});
  try {
    assert.equal(findByTestId(fight.root, 'btn-pause').textContent, 'Resume');
    pressResume(fight.root);
    assert.equal(fight.state.hiddenPaused, false);
    assert.equal(fight.state.paused, false);
    advance(fight.state, 0.5);
    assert.ok(fight.state.tick > fight.tick);
  } finally {
    fight.close();
  }
});

test('space resumes a hidden fight and a single resume action still keeps a manual pause', async () => {
  const fight = await heldFight('en', {paused: false});
  try {
    globalThis.document.dispatchKey('Space');
    assert.equal(fight.state.hiddenPaused, false);
    assert.equal(fight.state.paused, false);
    advance(fight.state, 0.5);
    assert.ok(fight.state.tick > fight.tick);

    fight.state.paused = true;
    fight.state.hiddenPaused = true;
    const tick = fight.state.tick;
    assert.equal(fight.api.act('resume').ok, true);
    assert.equal(fight.state.hiddenPaused, false);
    assert.equal(fight.state.paused, true);
    advance(fight.state, 0.5);
    assert.equal(fight.state.tick, tick);
  } finally {
    fight.close();
  }
});
