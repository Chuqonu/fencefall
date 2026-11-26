// A draft names the threat that is already on the field, and the different wave after it.
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
    remove() {
      const parent = this.parentNode;
      if (!parent) return;
      parent.children = parent.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    get lastChild() { return this.children.at(-1) || null; },
    get childNodes() { return this.children; },
  };
  return node;
}

function flat(node, list = []) {
  if (node?.getAttribute) list.push(node);
  for (const child of node?.children || []) flat(child, list);
  return list;
}

test('a draft names the current threat and a different next wave', () => {
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
  const container = element(doc, 'div');
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'draft-threat'});
  state.phase = 'draft';
  state.paused = true;
  state.draft = {
    options: [{id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1}],
  };
  state.director.playerHint = {
    en: 'A cinder charge bites once at the fence, then the fuse burns. Kill it before the blast.',
    zh: '烬爆贴上栅栏后先啃一口，然后引线燃烧。爆炸前打掉它。',
  };
  state.director.nextHint = {
    en: 'Wire runners reach the fence early. Shoot them before the ash shamblers.',
    zh: '线驰者会更早贴上栅栏。先打它们，再管灰烬蹒者。',
  };
  renderBuildPanel(container, state, {
    t: (key, vars) => t('zh', key, vars),
    act: () => ({ok: true}),
    getUI: () => ({screen: 'battle'}),
    getProfile: () => ({settings: {language: 'zh'}}),
  });
  const nodes = flat(container);
  const threat = nodes.find((node) => node.getAttribute('data-testid') === 'draft-threat');
  const next = nodes.find((node) => node.getAttribute('data-testid') === 'next-wave');
  assert.ok(threat, 'draft threat');
  assert.ok(String(threat.textContent).includes('引线'), threat.textContent);
  assert.ok(next, 'next wave');
  assert.ok(String(next.textContent).includes('线驰者'), next.textContent);
  assert.equal(nodes.filter((node) => node.getAttribute('data-testid') === 'draft-choice-0').length, 1);

  state.director.nextHint = {
    en: state.director.playerHint.en,
    zh: state.director.playerHint.zh,
  };
  renderBuildPanel(container, state, {
    t: (key, vars) => t('zh', key, vars),
    act: () => ({ok: true}),
    getUI: () => ({screen: 'battle'}),
    getProfile: () => ({settings: {language: 'zh'}}),
  });
  const again = flat(container);
  assert.equal(again.filter((node) => node.getAttribute('data-testid') === 'next-wave').length, 0);
  assert.ok(again.some((node) => node.getAttribute('data-testid') === 'draft-threat'));
});
