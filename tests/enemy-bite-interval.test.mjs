import test from 'node:test';
import assert from 'node:assert/strict';
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
    querySelectorAll() { return []; },
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

function rowText(node) {
  return (node?.children || []).map(child => child.textContent).join(' ');
}

function enemies(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  renderMetaPanel(container, 'codex', null, createProfile(language), {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  const tab = findByTestId(container, 'codex-tab-enemies');
  for (const fn of tab.listeners.click) fn({preventDefault() {}, stopPropagation() {}});
  return container;
}

test('codex enemies label the pause between bites as an interval', () => {
  const en = enemies('en');
  const spitter = rowText(findByTestId(en, 'enemy-interval-spitter'));
  const brute = rowText(findByTestId(en, 'enemy-interval-brute'));
  assert.equal(spitter, 'Interval 0.55 s');
  assert.equal(brute, 'Interval 1.65 s');
  assert.doesNotMatch(spitter, /Attack speed|攻速/);

  const zh = enemies('zh');
  assert.equal(rowText(findByTestId(zh, 'enemy-interval-spitter')), '间隔 0.55 s');
  assert.equal(rowText(findByTestId(zh, 'enemy-interval-brute')), '间隔 1.65 s');
});

test('enemy speed keeps its number and shows px/s', () => {
  const zh = enemies('zh');
  const en = enemies('en');
  assert.equal(rowText(findByTestId(zh, 'enemy-speed-runner')), '速度 62 px/s');
  assert.equal(rowText(findByTestId(zh, 'enemy-speed-brute')), '速度 19 px/s');
  assert.equal(rowText(findByTestId(en, 'enemy-speed-runner')), 'Speed 62 px/s');
  assert.equal(rowText(findByTestId(en, 'enemy-speed-brute')), 'Speed 19 px/s');
  assert.equal(rowText(findByTestId(zh, 'enemy-damage-runner')), '伤害 5 / 口');
  assert.equal(rowText(findByTestId(zh, 'enemy-damage-brute')), '伤害 26 / 口');
  assert.equal(rowText(findByTestId(en, 'enemy-damage-runner')), 'Damage 5 / bite');
  assert.equal(rowText(findByTestId(en, 'enemy-damage-brute')), 'Damage 26 / bite');
});

function lines(card) {
  const rows = [];
  const walk = node => {
    if (typeof node?.className === 'string' && node.className.split(/\s+/).includes('meta-line')) {
      rows.push((node.children || []).map(child => child.textContent).join(' '));
    }
    for (const child of node?.children || []) walk(child);
  };
  walk(card);
  return rows;
}

test('an unarmored enemy omits the armor row and a plate walker shows 55%', () => {
  const zh = enemies('zh');
  const shambler = lines(findByTestId(zh, 'codex-enemy-shambler')).join(' | ');
  const plate = lines(findByTestId(zh, 'codex-enemy-armored')).join(' | ');
  assert.equal(shambler.includes('护甲'), false, shambler);
  assert.match(plate, /护甲 55%/);
  const en = enemies('en');
  const englishPlate = lines(findByTestId(en, 'codex-enemy-armored')).join(' | ');
  const englishShambler = lines(findByTestId(en, 'codex-enemy-shambler')).join(' | ');
  assert.match(englishPlate, /Armor 55%/);
  assert.equal(englishShambler.includes('Armor'), false, englishShambler);
});
