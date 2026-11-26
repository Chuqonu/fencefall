import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {renderMetaPanel} from '../src/ui/meta-panel.js';

function element(doc, tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    id: '',
    disabled: false,
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
    getElementById(id) {
      const walk = node => {
        if (!node || node.nodeType !== 1) return null;
        if (node.id === id) return node;
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(doc.documentElement);
    },
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

function badgeRows(node, rows = []) {
  if (typeof node?.className === 'string' && node.className.split(/\s+/).includes('meta-badges')) {
    rows.push(node.children.filter(child => child.nodeType === 1).map(child => child.textContent));
  }
  for (const child of node?.children || []) badgeRows(child, rows);
  return rows;
}

function codexBadges(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  const profile = createProfile(language);
  renderMetaPanel(container, 'codex', null, profile, {
    t: key => key,
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  return container;
}

test('codex mechanic badges use the active language', () => {
  const english = findByTestId(codexBadges('en'), 'codex-tower-bolt');
  const chinese = findByTestId(codexBadges('zh'), 'codex-tower-bolt');
  assert.ok(english);
  assert.ok(chinese);
  assert.deepEqual(badgeRows(english)[0], ['Projectile', 'Crit', 'Pierce']);
  assert.deepEqual(badgeRows(chinese)[0], ['投射', '暴击', '穿透']);

  const chineseCodex = codexBadges('zh');
  const recipes = findByTestId(chineseCodex, 'codex-tab-recipes');
  assert.ok(recipes);
  for (const fn of recipes.listeners.click) fn({preventDefault() {}, stopPropagation() {}});
  const scald = findByTestId(chineseCodex, 'codex-recipe-scald');
  const rows = badgeRows(scald);
  assert.ok(rows.some(row => row.join(' ') === '溅射 燃烧 减速'), rows);
});

function lineTexts(node, rows = []) {
  if (typeof node?.className === 'string' && node.className.split(/\s+/).includes('meta-line')) {
    rows.push((node.children || []).map(child => child.textContent).join(' '));
  }
  for (const child of node?.children || []) lineTexts(child, rows);
  return rows;
}

test('a bolt codex card shows projectile speed in px/s', () => {
  function boltRows(language) {
    const root = codexBadges(language);
    const tab = findByTestId(root, 'codex-tab-towers');
    for (const fn of tab?.listeners?.click || []) fn({preventDefault() {}, stopPropagation() {}});
    return lineTexts(findByTestId(root, 'codex-tower-bolt'));
  }
  const zh = boltRows('zh');
  const en = boltRows('en');
  assert.ok(zh.includes('弹速 440 px/s'), zh.join(' | '));
  assert.ok(en.includes('Projectile speed 440 px/s'), en.join(' | '));
  assert.equal(zh.some(row => row.includes('11') && row.includes('px/s')), false);
});

test('the Cinder codex burn row marks 4 per second', () => {
  function burnLine(language) {
    const root = codexBadges(language);
    const tab = findByTestId(root, 'codex-tab-towers');
    for (const fn of tab?.listeners?.click || []) fn({preventDefault() {}, stopPropagation() {}});
    return lineTexts(findByTestId(root, 'codex-tower-fire')).find(row => /burn|燃烧/i.test(row)) || '';
  }
  assert.equal(burnLine('en'), 'Burn 4/s · 2.6 s');
  assert.equal(burnLine('zh'), '燃烧 4/秒 · 2.6 s');
});
