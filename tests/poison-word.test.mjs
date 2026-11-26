import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {createRun} from '../src/engine.js';
import {t} from '../src/i18n.js';
import {renderBuildPanel} from '../src/ui/build-panel.js';
import {renderMetaPanel} from '../src/ui/meta-panel.js';

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
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
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

function findByTestId(node, id) {
  if (node?.getAttribute?.('data-testid') === id) return node;
  for (const child of node?.children || []) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}

function lineLabels(node, labels = []) {
  if (typeof node?.className === 'string' && node.className.split(/\s+/).includes('meta-line')) {
    const label = node.children?.find(child => String(child.className).includes('muted'))?.textContent;
    if (label) labels.push(label);
  }
  for (const child of node?.children || []) lineLabels(child, labels);
  return labels;
}

test('the codex poison row says 毒素 when the translator knows 中毒', () => {
  const doc = documentStub();
  const container = element(doc, 'div');
  renderMetaPanel(container, 'codex', null, createProfile('zh'), {
    t: key => t('zh', key),
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  const card = findByTestId(container, 'codex-tower-poison');
  const labels = lineLabels(card);
  assert.ok(labels.includes('毒素'), labels.join(' | '));
  assert.equal(labels.includes('中毒'), false);
});

test('a poison tower draft card says 毒素', () => {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'poison-word'});
  state.phase = 'draft';
  state.draft = {
    options: [
      {id: 'tower:poison', kind: 'tower', type: 'poison', replace: false, rank: 1},
      {id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1},
      {id: 'tower:fire', kind: 'tower', type: 'fire', replace: false, rank: 1},
    ],
  };
  renderBuildPanel(container, state, {
    t: key => t('zh', key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle'}),
    getProfile: () => ({settings: {language: 'zh'}}),
  });
  const effect = findByTestId(container, 'draft-choice-0-effect')?.textContent || '';
  assert.match(effect, /毒素/);
  assert.equal(effect.includes('中毒'), false);
});
