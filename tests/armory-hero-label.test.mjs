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

function rowText(node) {
  const rows = [];
  const walk = (current) => {
    if (current?.className === 'meta-line') {
      rows.push((current.children || []).map(child => child.textContent).join(' '));
    }
    for (const child of current?.children || []) walk(child);
  };
  walk(node);
  return rows.join(' | ');
}

test('an Armory fence bonus says fence HP, not the fence itself', () => {
  for (const language of ['en', 'zh']) {
    const doc = documentStub();
    const container = element(doc, 'div');
    renderMetaPanel(container, 'armory', null, createProfile(language), {
      t: key => t(language, key),
      act: () => ({ok: false}),
      getUI: () => ({}),
    });
    const roots = rowText(findByTestId(container, 'perm-vitality'));
    const nails = rowText(findByTestId(container, 'equip-card-fence_nails'));
    if (language === 'zh') {
      assert.match(roots, /升级 · 栅栏生命 \+12/);
      assert.equal(roots.includes('升级 · 栅栏 +12'), false);
      assert.match(nails, /栅栏生命 \+30/);
    } else {
      assert.match(roots, /Upgrade · Fence HP \+12/);
      assert.equal(roots.includes('Upgrade · Fence +12'), false);
      assert.match(nails, /Fence HP \+30/);
    }
  }
});

test('permanent damage and haste name the hero', () => {
  for (const language of ['en', 'zh']) {
    const doc = documentStub();
    const container = element(doc, 'div');
    renderMetaPanel(container, 'armory', null, createProfile(language), {
      t: key => t(language, key),
      act: () => ({ok: false}),
      getUI: () => ({}),
    });
    const damage = rowText(findByTestId(container, 'perm-damage'));
    const haste = rowText(findByTestId(container, 'perm-haste'));
    if (language === 'zh') {
      assert.match(damage, /升级 · 英雄伤害 \+2/);
      assert.match(haste, /升级 · 英雄攻击速度 \+2/);
      assert.equal(damage.includes('升级 · 伤害'), false);
      assert.equal(haste.includes('升级 · 急速'), false);
    } else {
      assert.match(damage, /Upgrade · Hero damage \+2/);
      assert.match(haste, /Upgrade · Hero attack speed \+2/);
      assert.equal(damage.includes('Upgrade · Damage'), false);
      assert.equal(haste.includes('Upgrade · Haste'), false);
    }
  }
});

test('Armory totals and an equipped fence bonus name the hero and the fence HP', () => {
  for (const language of ['en', 'zh']) {
    const doc = documentStub();
    const container = element(doc, 'div');
    const profile = createProfile(language);
    profile.equipmentOwned = ['fence_nails'];
    profile.equipped.armor = 'fence_nails';
    renderMetaPanel(container, 'armory', null, profile, {
      t: key => t(language, key),
      act: () => ({ok: false}),
      getUI: () => ({}),
    });
    const damage = rowText(findByTestId(container, 'bonus-damage'));
    const haste = rowText(findByTestId(container, 'bonus-haste'));
    const fence = rowText(findByTestId(container, 'bonus-fence'));
    const equipped = texts(findByTestId(container, 'equipped-bonus-armor'));
    if (language === 'zh') {
      assert.match(damage, /英雄伤害/);
      assert.match(haste, /英雄攻击速度/);
      assert.match(fence, /栅栏生命/);
      assert.match(equipped, /栅栏生命 \+30/);
      assert.equal(equipped.includes('栅栏 +30'), false);
    } else {
      assert.match(damage, /Hero damage/);
      assert.match(haste, /Hero attack speed/);
      assert.match(fence, /Fence HP/);
      assert.match(equipped, /Fence HP \+30/);
    }
  }
});

test('a Normal new-run button calls 600 fence HP', () => {
  for (const language of ['en', 'zh']) {
    const doc = documentStub();
    const container = element(doc, 'div');
    renderMetaPanel(container, 'menu', null, createProfile(language), {
      t: key => t(language, key),
      act: () => ({ok: false}),
      getUI: () => ({}),
    });
    const button = findByTestId(container, 'difficulty-normal');
    const line = (button?.children || []).map(child => child.textContent).join(' | ');
    if (language === 'zh') {
      assert.match(line, /栅栏生命 600/);
      assert.equal(line.includes('栅栏 600'), false);
      assert.match(line, /敌人生命 ×1/);
      assert.match(line, /敌人速度 ×1/);
      assert.match(line, /敌人伤害 ×1/);
      assert.match(line, /敌人数量 ×1/);
    } else {
      assert.match(line, /Fence HP 600/);
      assert.equal(line.includes('Fence 600'), false);
      assert.match(line, /Enemy health ×1/);
      assert.match(line, /Enemy speed ×1/);
      assert.match(line, /Enemy damage ×1/);
      assert.match(line, /Enemy count ×1/);
    }
  }
});
