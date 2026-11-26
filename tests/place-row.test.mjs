// Placement keeps the five-column slot row above the scrolling unit description.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createProfile, createRun} from '../src/state.js';
import {createUnit} from '../src/shared.js';
import {renderBuildPanel} from '../src/ui/build-panel.js';

const source = readFileSync(fileURLToPath(new URL('../src/ui/build-panel.js', import.meta.url)), 'utf8');

test('placement is performed on the canvas without a duplicate grid', () => {
  assert.doesNotMatch(source,/class:\s*'grid ff-slots ff-place-row'/);
});

function createFakeDocument() {
  function descendants(node) {
    const list = [];
    const walk = (current) => {
      for (const child of current.childNodes || []) {
        if (child.nodeType !== 1) continue;
        list.push(child);
        walk(child);
      }
    };
    walk(node);
    return list;
  }

  function matchSimple(node, simple) {
    if (!node || node.nodeType !== 1) return false;
    let rest = simple.trim();
    if (!rest || rest === '*') return true;
    const tag = rest.match(/^[a-zA-Z][\w-]*/);
    if (tag) {
      if (node.tagName !== tag[0].toUpperCase()) return false;
      rest = rest.slice(tag[0].length);
    }
    while (rest) {
      if (rest[0] === '.') {
        const matched = rest.match(/^\.([\w-]+)/);
        if (!matched) return false;
        const classes = String(node.className || '').split(/\s+/);
        if (!classes.includes(matched[1])) return false;
        rest = rest.slice(matched[0].length);
      } else if (rest[0] === '[') {
        const matched = rest.match(/^\[([\w-]+)(?:([~|^$*]?=)"([^"]*)")?\]/);
        if (!matched) return false;
        const value = node.getAttribute(matched[1]);
        if (value == null) return false;
        if (matched[2] && (matched[2] !== '=' || value !== matched[3])) return false;
        rest = rest.slice(matched[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function queryAll(root, selector) {
    const steps = selector.trim().split(/\s+/).filter(Boolean);
    let current = [root];
    for (const step of steps) {
      const next = [];
      for (const node of current) {
        for (const candidate of descendants(node)) {
          if (matchSimple(candidate, step)) next.push(candidate);
        }
      }
      current = next;
    }
    return current;
  }

  const doc = {
    nodeType: 9,
    documentElement: null,
    head: null,
    body: null,
    createElement(tag) {
      return createElement(tag);
    },
    createTextNode(text) {
      return {
        nodeType: 3,
        textContent: String(text),
        parentNode: null,
        remove() {
          const parent = this.parentNode;
          if (!parent) return;
          parent.childNodes = parent.childNodes.filter((item) => item !== this);
          this.parentNode = null;
        },
      };
    },
    getElementById(id) {
      if (doc.documentElement?.id === id) return doc.documentElement;
      return descendants(doc.documentElement).find((node) => node.id === id) || null;
    },
    querySelector(selector) {
      return queryAll(doc.documentElement, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return queryAll(doc.documentElement, selector);
    },
  };

  function createElement(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      className: '',
      textContent: '',
      id: '',
      childNodes: [],
      parentNode: null,
      ownerDocument: doc,
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'id') this.id = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      appendChild(child) {
        if (child == null) return child;
        if (child.parentNode) child.remove();
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
      },
      append(...children) {
        for (const child of children) {
          if (child == null || child === false) continue;
          this.appendChild(child);
        }
      },
      remove() {
        const parent = this.parentNode;
        if (!parent) return;
        parent.childNodes = parent.childNodes.filter((item) => item !== this);
        this.parentNode = null;
      },
      addEventListener() {},
      querySelector(selector) {
        return queryAll(this, selector)[0] || null;
      },
      querySelectorAll(selector) {
        return queryAll(this, selector);
      },
      contains(target) {
        if (target === this) return true;
        return (this.childNodes || []).some((child) => child === target || child.contains?.(target));
      },
      focus() {},
    };
    return node;
  }

  doc.documentElement = createElement('html');
  doc.head = createElement('head');
  doc.body = createElement('body');
  doc.documentElement.append(doc.head, doc.body);
  return doc;
}

function orderIndex(root, node) {
  const list = [];
  const walk = (current) => {
    list.push(current);
    for (const child of current.childNodes || []) walk(child);
  };
  walk(root);
  return list.indexOf(node);
}

test('a placing render keeps the place grid above the description', () => {
  const doc = createFakeDocument();
  const container = doc.createElement('div');
  container.setAttribute('data-ui', 'overlay');
  doc.body.append(container);
  const state = createRun({seed: 5, difficulty: 'normal', runId: 'place-row'});
  state.phase = 'placing';
  state.pendingUnit = {unit: createUnit(state, 'bolt', 1), replace: false};
  renderBuildPanel(container, state, {
    getUI() {
      return {screen: 'battle', selectedSlot: -1};
    },
  });
  const root = container.querySelector('[data-testid="build-panel"]');
  assert.ok(root, 'build panel rendered');
  assert.match(root.className, /\bis-placing\b/);
  const grid = container.querySelector('[data-testid="place-grid"]');
  assert.equal(grid,null);
  assert.ok(container.querySelector('[data-testid="cancel-placement"]'));
  assert.equal(container.querySelector('[data-testid="placing-name"]').textContent,'Rivet');
  assert.match(container.querySelector('.ff-place-signature').textContent,/Pierce/);
  assert.equal(container.querySelector('[data-testid="place-slot-0"]'),null);
});

test('Chinese placement names the front and rear rows', () => {
  const doc = createFakeDocument();
  const container = doc.createElement('div');
  container.setAttribute('data-ui', 'overlay');
  const state = createRun({
    seed: 5,
    difficulty: 'normal',
    runId: 'place-zh',
    profile: createProfile('zh'),
  });
  state.phase = 'placing';
  state.pendingUnit = {unit: createUnit(state, 'bolt', 1), replace: false};
  renderBuildPanel(container, state, {getUI() { return {screen: 'battle'}; }});
  const words = (id) => (container.querySelector(`[data-testid="${id}"]`)?.childNodes || []).map((child) => child.textContent).join(' ');
  assert.ok(container.querySelector('[data-testid="cancel-placement"]'));
  assert.equal(container.querySelector('[data-testid="place-grid"]'),null);
  assert.equal(container.querySelector('[data-testid="placing-name"]')?.textContent, '穿钉');
  assert.match(container.querySelector('.ff-place-signature')?.textContent || '', /穿透/);
  assert.equal(words('place-slot-0').includes('空位'), false);
});
