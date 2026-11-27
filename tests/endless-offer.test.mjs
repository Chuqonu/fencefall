import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/engine.js';
import {createProfile} from '../src/state.js';
import {renderMetaPanel} from '../src/ui/meta-panel.js';
import {t} from '../src/i18n.js';

function element(doc, tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    id: '',
    disabled: false,
    attrs: {},
    listeners: {},
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
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...items) {
      for (const item of items) {
        if (item == null || item === false) continue;
        if (typeof item === 'object' && item.nodeType) this.appendChild(item);
        else this.appendChild(this.ownerDocument.createTextNode(String(item)));
      }
    },
    replaceChildren(...items) {
      this.children.length = 0;
      this.append(...items);
    },
    contains() { return false; },
    querySelector() { return null; },
    focus() {},
    get lastChild() { return this.children[this.children.length - 1] || null; },
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

function render(language, phase) {
  const doc = documentStub();
  const container = element(doc, 'div');
  const profile = createProfile(language);
  const run = createRun({seed: 3, difficulty: 'normal', runId: 'endless-offer', profile});
  run.phase = phase;
  run.settlement = {result: phase, currency: 12};
  renderMetaPanel(container, 'results', run, profile, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  return container;
}

test('a victory result offers endless in the active language and hides it on defeat', () => {
  const zh = render('zh', 'victory');
  assert.equal(findByTestId(zh, 'btn-endless')?.textContent, '继续无尽模式');
  const en = render('en', 'victory');
  assert.equal(findByTestId(en, 'btn-endless')?.textContent, 'Enter Endless');
  assert.equal(findByTestId(render('zh', 'defeat'), 'btn-endless'), null);
});

test('a defeat result shows an Armory unlock recommendation in both languages', () => {
  const zh = findByTestId(render('zh', 'defeat'), 'result-armory-tip')?.textContent || '';
  const en = findByTestId(render('en', 'defeat'), 'result-armory-tip')?.textContent || '';
  assert.match(zh, /35/);
  assert.match(en, /35/);
  assert.equal(findByTestId(render('en', 'victory'), 'result-armory-tip'), null);
});
