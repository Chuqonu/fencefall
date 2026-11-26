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
    attrs: {},
    children: [],
    style: {},
    ownerDocument: doc,
    parentNode: null,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
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
    get lastChild() { return this.children.at(-1) || null; }
  };
  return node;
}

function findByTestId(node, id) {
  if (node?.getAttribute?.('data-testid') === id) return node;
  for (const child of node?.children || []) {
    const found = findByTestId(child, id);
    if (found) return found;
  }
  return null;
}

function textOf(node) {
  const own = node.textContent || '';
  const nested = (node.children || []).map(textOf).join('');
  return own + nested;
}

test('how to play names the new threats in both languages', () => {
  const expect = {
    en: ['crouch', 'dust gnawers', 'never itself', 'solid beat', 'three times as fast', 'Eight threats', 'not shielded', 'before the blast', 'recharges more slowly'],
    zh: ['蹲下', '尘啮', '从不治疗自己', '凝实', '三倍速', '八种威胁', '烬卫自己没有这层护盾', '爆炸前打掉它', '充能都会变慢']
  };
  for (const language of ['en', 'zh']) {
    const doc = {
      nodeType: 9,
      createElement(tag) { return element(doc, tag); },
      createTextNode(text) { return {nodeType: 3, textContent: String(text)}; },
      getElementById() { return null; },
      querySelectorAll() { return []; },
      head: null,
      documentElement: null
    };
    doc.documentElement = element(doc, 'html');
    doc.head = element(doc, 'head');
    const root = element(doc, 'div');
    renderMetaPanel(root, 'howto', null, createProfile(language), {
      t: key => t(language, key),
      act: () => ({ok: true}),
      getUI: () => ({})
    });
    const card = findByTestId(root, 'howto-roles');
    assert.ok(card, language);
    const text = textOf(card);
    for (const phrase of expect[language]) assert.ok(text.includes(phrase), `${language} missing ${phrase}`);
  }
});
