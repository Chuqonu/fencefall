import test from 'node:test';
import assert from 'node:assert/strict';
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

function effectText(lang, upgradeId, cap) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 9, difficulty: 'normal', runId: `${upgradeId}-${lang}`});
  state.phase = 'draft';
  state.draft = {
    options: [
      {id: `hero_upgrade:${upgradeId}`, kind: 'hero_upgrade', upgradeId, replace: false, cap, nextLevel: 1},
      {id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1},
      {id: 'tower:fire', kind: 'tower', type: 'fire', replace: false, rank: 1},
    ],
  };
  renderBuildPanel(container, state, {
    t: key => t(lang, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle'}),
    getProfile: () => ({settings: {language: lang}}),
  });
  return findByTestId(container, 'draft-choice-0-effect')?.textContent || '';
}

test('Heavy Draw names the hero crit multiplier instead of crit damage', () => {
  const english = effectText('en', 'volley', 2);
  const chinese = effectText('zh', 'volley', 2);
  assert.equal(english, 'Hero · Multishot +1 · Level 1/2');
  assert.equal(chinese, '英雄 · 齐射 +1 · 等级 1/2');
  assert.equal(english.includes('Crit damage'), false);
  assert.equal(chinese.includes('暴击伤害'), false);
});

test('Focus names the hero crit chance', () => {
  const english = effectText('en', 'focus', 4);
  const chinese = effectText('zh', 'focus', 4);
  assert.equal(english, 'Hero crit chance +10% · Level 1/3');
  assert.equal(chinese, '英雄的暴击率 +10% · 等级 1/3');
});

test('Barbed Quills names 毒素 on the Chinese effect line', () => {
  const english = effectText('en', 'shrapnel', 3);
  const chinese = effectText('zh', 'shrapnel', 3);
  assert.equal(english, 'Hero · Burn 4/s · Level 1/3');
  assert.equal(chinese, '英雄 · 燃烧 4/秒 · 等级 1/3');
  assert.equal(chinese.includes('中毒'), false);
});

function boltDraft(lang) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 2, difficulty: 'normal', runId: `bolt-draft-${lang}`});
  state.phase = 'draft';
  state.draft = {
    options: [
      {id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1},
      {id: 'tower:fire', kind: 'tower', type: 'fire', replace: false, rank: 1},
      {id: 'tower:frost', kind: 'tower', type: 'frost', replace: false, rank: 1},
    ],
  };
  renderBuildPanel(container, state, {
    t: key => t(lang, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle'}),
    getProfile: () => ({settings: {language: lang}}),
  });
  return findByTestId(container, 'draft-choice-0-effect')?.textContent || '';
}

test('a bolt draft card marks 13 as one shot without overflowing the line', () => {
  const english = boltDraft('en');
  const chinese = boltDraft('zh');
  assert.match(english, /13\/shot/);
  assert.equal(english.includes('Damage 13'), false);
  assert.ok(english.length <= 36, english);
  assert.match(chinese, /13\/发/);
  assert.equal(chinese.includes('伤害 13'), false);
  assert.ok(chinese.length <= 20, chinese);
});
