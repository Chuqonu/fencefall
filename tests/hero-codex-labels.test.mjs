import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {t} from '../src/i18n.js';
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

function pairs(node, rows = []) {
  if (typeof node?.className === 'string' && node.className.split(/\s+/).includes('meta-line')) {
    const spans = (node.children || []).filter(child => child.nodeType === 1);
    rows.push(spans.map(child => child.textContent).join(' '));
  }
  for (const child of node?.children || []) pairs(child, rows);
  return rows;
}

function heroCard(language, id) {
  const doc = documentStub();
  const container = element(doc, 'div');
  renderMetaPanel(container, 'codex', null, createProfile(language), {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  const tab = findByTestId(container, 'codex-tab-hero');
  for (const fn of tab?.listeners?.click || []) fn({preventDefault() {}, stopPropagation() {}});
  return findByTestId(container, `codex-hero-${id}`);
}

test('the hero codex names damage and crit multiplier instead of raw keys', () => {
  const strike = pairs(heroCard('zh', 'strike')).join(' | ');
  const lethality = pairs(heroCard('zh', 'lethality')).join(' | ');
  const english = pairs(heroCard('en', 'lethality')).join(' | ');
  assert.match(strike, /伤害 \+7/);
  assert.equal(strike.includes('damageAdd'), false);
  assert.match(lethality, /暴击倍率 \+0\.4/);
  assert.equal(lethality.includes('critMultiplier'), false);
  assert.match(english, /Crit multiplier \+0\.4/);
  assert.equal(english.includes('critMultiplier'), false);
});

test('Barbed Quills lists 6 poison damage per second for 3 seconds', () => {
  const chinese = pairs(heroCard('zh', 'barbed')).join(' | ');
  const english = pairs(heroCard('en', 'barbed')).join(' | ');
  assert.match(chinese, /毒素 6\/秒，3 秒/);
  assert.equal(chinese.includes('中毒'), false);
  assert.match(english, /Poison 6\/s for 3s/);
  assert.match(chinese, /等级上限 3/);
  assert.equal(chinese.includes('已满级'), false);
  assert.match(english, /Max level 3/);
});
