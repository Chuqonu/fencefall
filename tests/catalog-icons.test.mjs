import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/state.js';
import {renderMetaPanel} from '../src/ui/meta-panel.js';
import {t} from '../src/i18n.js';
import {EQUIPMENT, PERMANENT_UPGRADES} from '../src/systems/progression.js';
import {HERO_UPGRADES} from '../src/systems/hero.js';
import {TOWERS} from '../src/data/towers.js';
import {ENEMIES} from '../src/data/enemies.js';
import {hasCatalogIcon} from '../src/ui/icons.js';

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
    append(...items) {
      for (const item of items) if (item) this.appendChild(item);
    },
    replaceChildren(...items) {
      this.children.length = 0;
      this.append(...items);
    },
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

function walk(node, out = []) {
  if (!node || node.nodeType !== 1) return out;
  out.push(node);
  for (const child of node?.children || []) walk(child, out);
  return out;
}

function panel(language, screen) {
  const doc = documentStub();
  const container = element(doc, 'div');
  const profile = createProfile(language);
  profile.equipmentOwned = ['splinter_bow'];
  renderMetaPanel(container, screen, null, profile, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({}),
  });
  return container;
}

function clickTab(container, testid) {
  const tab = findByTestId(container, testid);
  assert.ok(tab, `tab ${testid}`);
  for (const fn of tab.listeners?.click || []) fn({preventDefault() {}, stopPropagation() {}});
}

function iconBeforeDescription(card, id, description) {
  const nodes = walk(card);
  const icon = nodes.find(node => node.getAttribute?.('data-icon') === id);
  const name = nodes.find(node => node.tagName === 'H3');
  const desc = nodes.find(node => node.tagName === 'P' && node.textContent === description);
  assert.ok(card, `card ${id}`);
  assert.ok(icon, `icon ${id}`);
  assert.equal(String(icon.tagName).toLowerCase(), 'svg');
  assert.equal(hasCatalogIcon(id), true, id);
  assert.ok(name && name.textContent, `name ${id}`);
  assert.ok(desc, `description ${id}`);
  const iconAt = nodes.indexOf(icon);
  const nameAt = nodes.indexOf(name);
  const descAt = nodes.indexOf(desc);
  assert.ok(iconAt < nameAt && nameAt < descAt, `${id}: icon, then name, then description`);
  return {icon, desc, nodes};
}

test('equipment, permanent upgrades, and hero upgrades render an icon before the description', () => {
  const drawn = new Map();
  for (const language of ['en', 'zh']) {
    const armory = panel(language, 'armory');
    clickTab(armory, 'armory-tab-gear');
    for (const item of Object.values(EQUIPMENT)) {
      const card = findByTestId(armory, `equipment-${item.id}`);
      const {icon, desc, nodes} = iconBeforeDescription(card, item.id, item.description[language]);
      const controlId = item.id === 'splinter_bow' ? `equip-${item.id}` : `buy-${item.id}`;
      const control = nodes.find(node => node.getAttribute?.('data-testid') === controlId);
      assert.ok(control, controlId);
      assert.ok(nodes.indexOf(desc) < nodes.indexOf(control), `${controlId} stays after the description`);
      const paths = icon.getAttribute('data-paths');
      assert.ok(paths, `drawing ${item.id}`);
      if (!drawn.has(item.id)) drawn.set(item.id, paths);
      else assert.equal(paths, drawn.get(item.id), `${item.id} keeps one icon in ${language}`);
    }
    clickTab(armory, 'armory-tab-upgrades');
    for (const upgrade of Object.values(PERMANENT_UPGRADES)) {
      const card = findByTestId(armory, `permanent-${upgrade.id}`);
      const {icon, desc, nodes} = iconBeforeDescription(card, upgrade.id, upgrade.description[language]);
      const control = nodes.find(node => node.getAttribute?.('data-testid') === `upgrade-${upgrade.id}`);
      assert.ok(control, `upgrade-${upgrade.id}`);
      assert.ok(nodes.indexOf(desc) < nodes.indexOf(control));
      const paths = icon.getAttribute('data-paths');
      if (!drawn.has(upgrade.id)) drawn.set(upgrade.id, paths);
      else assert.equal(paths, drawn.get(upgrade.id));
    }
    const codex = panel(language, 'codex');
    clickTab(codex, 'codex-tab-hero');
    for (const upgrade of Object.values(HERO_UPGRADES)) {
      const card = findByTestId(codex, `codex-hero-${upgrade.id}`);
      const {icon} = iconBeforeDescription(card, upgrade.id, upgrade.description[language].replace(/^(Hero · |英雄 · )/, ''));
      const paths = icon.getAttribute('data-paths');
      if (!drawn.has(upgrade.id)) drawn.set(upgrade.id, paths);
      else assert.equal(paths, drawn.get(upgrade.id));
    }
  }
  const signatures = new Set(drawn.values());
  assert.equal(signatures.size, drawn.size, 'each id has its own icon');
});

test('codex guns/skills and enemies use the same icon-then-description card (no towers or recipes tabs)', () => {
  for (const language of ['en', 'zh']) {
    const codex = panel(language, 'codex');
    assert.equal(findByTestId(codex, 'codex-tab-recipes'), null, 'recipes tab is removed');
    assert.equal(findByTestId(codex, 'codex-tab-towers'), null, 'towers tab is removed');
    clickTab(codex, 'codex-tab-hero');
    for (const upgrade of Object.values(HERO_UPGRADES)) {
      iconBeforeDescription(findByTestId(codex, `codex-hero-${upgrade.id}`), upgrade.id, upgrade.description[language]);
    }
    clickTab(codex, 'codex-tab-enemies');
    for (const [id, enemy] of Object.entries(ENEMIES)) {
      const card = findByTestId(codex, `codex-enemy-${id}`);
      iconBeforeDescription(card, id, enemy.description[language]);
    }
  }
});
