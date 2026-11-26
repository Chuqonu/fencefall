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

test('a victory result offers endless in the active language', () => {
  const zh = render('zh', 'victory');
  const button = findByTestId(zh, 'btn-results-endless');
  assert.equal(button?.textContent, '进入无尽');
  assert.equal(findByTestId(zh, 'endless-offer')?.textContent, '进入无尽？胜利报酬已经保存。');
  assert.equal(findByTestId(zh, 'endless-note')?.textContent, '无尽不会再次发放主线报酬。');
  assert.equal(findByTestId(zh, 'btn-endless-stay')?.textContent, '暂不进入');
  assert.equal(findByTestId(render('en', 'victory'), 'btn-results-endless')?.textContent, 'Enter endless');
  assert.equal(findByTestId(render('zh', 'defeat'), 'btn-results-endless'), null);
});

test('a defeat result names the cheapest Armory buy still out of reach', () => {
  const zh = findByTestId(render('zh', 'defeat'), 'result-next')?.textContent || '';
  const en = findByTestId(render('en', 'defeat'), 'result-next')?.textContent || '';
  assert.match(zh, /还差 35 才能购买深根，价格 35/);
  assert.match(en, /You need 35 more for Deep Roots, which costs 35/);
  assert.equal(findByTestId(render('en', 'victory'), 'result-next'), null);
});

test('not now hides endless and leaves the saved reward', () => {
  const doc = documentStub();
  const container = element(doc, 'div');
  const profile = createProfile('en');
  const run = createRun({seed: 3, difficulty: 'normal', runId: 'endless-stay', profile});
  run.phase = 'victory';
  run.settlement = {result: 'victory', currency: 12};
  renderMetaPanel(container, 'results', run, profile, {
    t: key => t('en', key),
    act: () => { throw new Error('stay must not call an action'); },
    getUI: () => ({}),
  });
  const stay = findByTestId(container, 'btn-endless-stay');
  assert.equal(stay?.textContent, 'Not now');
  for (const fn of stay.listeners.click) fn({preventDefault() {}, stopPropagation() {}});
  assert.equal(findByTestId(container, 'btn-results-endless'), null);
  assert.equal(findByTestId(container, 'endless-offer'), null);
  assert.equal(run.settlement.currency, 12);
  assert.equal(profile.currency, 0);
});
