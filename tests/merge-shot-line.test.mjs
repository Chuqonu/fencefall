import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/engine.js';
import {previewMerge} from '../src/systems/merges.js';
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

function resultLine(lang) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 4, difficulty: 'normal', runId: `merge-shot-${lang}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  state.slots[1].unit = createUnit(state, 'bolt', 1, 'tower');
  const preview = previewMerge(state, 0, 1);
  assert.equal(preview.ok, true);
  renderBuildPanel(container, state, {
    t: key => t(lang, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', mergePreview: {...preview, from: 0, to: 1}}),
    getProfile: () => ({settings: {language: lang}}),
  });
  return findByTestId(container, 'merge-result-description')?.textContent || '';
}

test('a rank-2 bolt preview keeps pierce and shows the new damage per shot', () => {
  const english = resultLine('en');
  const chinese = resultLine('zh');
  assert.equal(english, 'Pierce 1 extra enemy · 29.25/shot');
  assert.equal(chinese, '穿透 额外 1 名敌人 · 29.25/发');
});

test('every same-type rank-up preview shows the new hit or an aura, without clipping', () => {
  for (const type of ['bolt', 'fire', 'frost', 'lightning', 'poison', 'support']) {
    for (const lang of ['en', 'zh']) {
      const doc = documentStub();
      const container = element(doc, 'div');
      container.setAttribute('data-ui', 'panel');
      const state = createRun({seed: 4, difficulty: 'normal', runId: `merge-${type}-${lang}`});
      state.paused = true;
      state.slots[0].unit = createUnit(state, type, 1, 'tower');
      state.slots[1].unit = createUnit(state, type, 1, 'tower');
      const preview = previewMerge(state, 0, 1);
      assert.equal(preview.ok, true, type);
      renderBuildPanel(container, state, {
        t: key => t(lang, key),
        act: () => ({ok: false}),
        getUI: () => ({screen: 'battle', mergePreview: {...preview, from: 0, to: 1}}),
        getProfile: () => ({settings: {language: lang}}),
      });
      const line = findByTestId(container, 'merge-result-description')?.textContent || '';
      assert.equal(line.includes('…'), false, `${type} ${lang}: ${line}`);
      if (type === 'support') assert.match(line, /Aura|光环/);
      else assert.match(line, lang === 'zh' ? /\/发/ : /\/shot/, `${type} ${lang}: ${line}`);
    }
  }
});
