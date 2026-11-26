// Towers with a legal merge are marked. The hero and a lone tower are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/engine.js';
import {mergeableSlotIndexes} from '../src/systems/merges.js';
import {renderBuildPanel} from '../src/ui/build-panel.js';
import {t} from '../src/i18n.js';

test('two rank-1 bolts are mergeable and the hero is not', () => {
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'merge-marks'});
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[1].unit = createUnit(state, 'bolt', 1, 'tower');
  const marks = mergeableSlotIndexes(state);
  assert.deepEqual(marks, [0, 1]);
  assert.equal(marks.includes(2), false);
});

test('a single tower and a rank mismatch stay unmarked', () => {
  const state = createRun({seed: 5, difficulty: 'normal', runId: 'merge-marks-none'});
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[3].unit = createUnit(state, 'bolt', 2, 'tower');
  assert.deepEqual(mergeableSlotIndexes(state), []);
});

test('a bolt and a fire tower of the same rank are a legal pair', () => {
  const state = createRun({seed: 6, difficulty: 'normal', runId: 'merge-marks-hybrid'});
  state.slots[4].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[7].unit = createUnit(state, 'fire', 1, 'tower');
  assert.deepEqual(mergeableSlotIndexes(state), [4, 7]);
});

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

function flat(node, list = []) {
  if (node?.getAttribute) list.push(node);
  for (const child of node?.children || []) flat(child, list);
  return list;
}

test('the planning panel names the first legal merge', () => {
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
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: 'merge-offer'});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[1].unit = createUnit(state, 'fire', 1, 'tower');
  renderBuildPanel(container, state, {
    t: (key, vars) => t('zh', key, vars),
    act: () => ({ok: true}),
    getUI: () => ({screen: 'battle', selectedSlot: -1}),
    getProfile: () => ({settings: {language: 'zh'}}),
  });
  const offer = flat(container).find((node) => node.getAttribute('data-testid') === 'merge-offer');
  assert.ok(offer, 'merge offer');
  assert.match(offer.textContent, /可合成 · 1\+2/);
});
