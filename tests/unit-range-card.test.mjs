// Selecting a unit leads with its name and the effect the range ring is showing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/engine.js';
import {renderBuildPanel} from '../src/ui/build-panel.js';
import {t} from '../src/i18n.js';

function element(doc, tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    id: '',
    attrs: {},
    children: [],
    style: {},
    ownerDocument: doc,
    parentNode: null,
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'id') this.id = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    addEventListener() {},
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...items) { for (const item of items) if (item) this.appendChild(item); },
    replaceChildren(...items) { this.children.length = 0; this.append(...items); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    focus() {},
    remove() {
      const parent = this.parentNode;
      if (!parent) return;
      parent.children = parent.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    get lastChild() { return this.children.at(-1) || null; },
    get childNodes() { return this.children; },
  };
  return node;
}

function documentStub() {
  const doc = {
    nodeType: 9,
    createElement(tag) { return element(doc, tag); },
    createTextNode(text) { return {nodeType: 3, textContent: String(text)}; },
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  doc.documentElement = element(doc, 'html');
  doc.head = element(doc, 'head');
  doc.documentElement.appendChild(doc.head);
  return doc;
}

function flat(node, list = []) {
  if (node?.getAttribute) list.push(node);
  for (const child of node?.children || []) flat(child, list);
  return list;
}

function render(lang, setup) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `range-card-${lang}`});
  state.paused = true;
  const selected = setup(state);
  renderBuildPanel(container, state, {
    t: (key, vars) => t(lang, key, vars),
    act: () => ({ok: true}),
    getUI: () => ({screen: 'battle', selectedSlot: selected}),
    getProfile: () => ({settings: {language: lang}}),
  });
  return flat(container);
}

test('the hero card leads with the name and the range before the long note', () => {
  for (const [lang, name, lead] of [
    ['en', 'Hero', 'Single-target shot · Range 430'],
    ['zh', '英雄', '单体射击 · 射程 430'],
  ]) {
    const nodes = render(lang, () => 2);
    const ids = nodes.map((node) => node.getAttribute('data-testid')).filter(Boolean);
    const closeAt = ids.indexOf('unit-close');
    const nameAt = ids.indexOf('unit-name');
    const leadAt = ids.indexOf('unit-signature');
    const noteAt = ids.indexOf('hero-note');
    assert.ok(closeAt >= 0 && nameAt > closeAt && leadAt > nameAt && noteAt > leadAt, ids.join(','));
    assert.equal(nodes.find((node) => node.getAttribute('data-testid') === 'unit-name').textContent, name);
    assert.equal(nodes.find((node) => node.getAttribute('data-testid') === 'unit-signature').textContent, lead);
    assert.equal(ids.includes('xp-progress'), false);
  }
});

test('a tower card leads with its shot and the same range the ring uses', () => {
  for (const [lang, name, lead] of [
    ['en', 'Cinder', 'Splash and burn 4/s · Range 240'],
    ['zh', '烬火', '溅射燃烧 4/秒 · 射程 240'],
  ]) {
    const nodes = render(lang, (state) => {
      state.slots[0].unit = createUnit(state, 'fire', 1, 'tower');
      return 0;
    });
    assert.equal(nodes.find((node) => node.getAttribute('data-testid') === 'unit-name').textContent, name);
    assert.equal(nodes.find((node) => node.getAttribute('data-testid') === 'unit-signature').textContent, lead);
  }
});
