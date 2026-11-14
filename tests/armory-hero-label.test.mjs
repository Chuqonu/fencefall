import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {renderMetaPanel} from '../src/ui/meta-panel.js';
import {t} from '../src/i18n.js';

function element(doc, tag) {
  const node = {
    nodeType: 1, tagName: String(tag).toUpperCase(), className: '', textContent: '', id: '',
    disabled: false, attrs: {}, listeners: {}, children: [], style: {}, ownerDocument: doc, parentNode: null,
    setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'id') this.id = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    addEventListener() {},
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    append(...items) {
      for (const item of items) {
        if (item == null || item === false) continue;
        if (typeof item === 'object' && item.nodeType) this.appendChild(item);
        else this.appendChild(this.ownerDocument.createTextNode(String(item)));
      }
    },
    replaceChildren(...items) { this.children.length = 0; this.append(...items); },
    contains() { return false; }, querySelector() { return null; }, focus() {},
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

function texts(node) {
  return (node?.children || []).map(child => child.textContent).join(' ');
}

test('equipped haste gear names the hero in both languages', () => {
  for (const language of ['en', 'zh']) {
    const doc = documentStub();
    const container = element(doc, 'div');
    const profile = createProfile(language);
    profile.equipmentOwned = ['runner_charm'];
    profile.equipped.charm = 'runner_charm';
    renderMetaPanel(container, 'armory', null, profile, {
      t: key => t(language, key),
      act: () => ({ok: false}),
      getUI: () => ({}),
    });
    const line = texts(findByTestId(container, 'equipped-bonus-charm'));
    if (language === 'zh') assert.match(line, /英雄攻击速度/);
    else assert.match(line, /Hero attack speed/);
    assert.doesNotMatch(line, /栅栏/);
  }
});
