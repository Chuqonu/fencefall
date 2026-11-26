import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/engine.js';
import {renderBuildPanel} from '../src/ui/build-panel.js';
import {applyHeroUpgrade} from '../src/systems/hero.js';
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

test('a Rime slow row leads with the speed the enemy keeps', () => {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: 'slow-kept'});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'frost', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t('en', key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language: 'en'}}),
  });
  const row = findByTestId(container, 'stat-slow');
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  assert.match(value, /^64%/);
  assert.doesNotMatch(value, /^36%/);
  assert.match(value, /s$/);

  const zhDoc = documentStub();
  const zhBox = element(zhDoc, 'div');
  zhBox.setAttribute('data-ui', 'panel');
  const zhState = createRun({seed: 8, difficulty: 'normal', runId: 'slow-kept-zh'});
  zhState.paused = true;
  zhState.slots[0].unit = createUnit(zhState, 'frost', 1, 'tower');
  renderBuildPanel(zhBox, zhState, {
    t: key => t('zh', key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language: 'zh'}}),
  });
  const zhValue = findByTestId(zhBox, 'stat-slow')?.children?.find(child => child.tagName === 'B')?.textContent || '';
  assert.match(zhValue, /^64%/);
  assert.match(zhValue, /秒$/);
});

function attackValue(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `bolt-gap-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-attackSpeed');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected bolt names the interval beside its attack speed', () => {
  assert.equal(attackValue('en'), 'Attack speed 1.47/s · Interval 0.68s');
  assert.equal(attackValue('zh'), '攻速 1.47/秒 · 间隔 0.68 秒');
});

function projectileValue(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `bolt-shot-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-projectile');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected bolt shows projectile speed in px/s', () => {
  assert.equal(projectileValue('en'), 'Projectile speed 440 px/s');
  assert.equal(projectileValue('zh'), '弹速 440 px/s');
});

function splashValue(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `cinder-splash-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'fire', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-splash');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected Cinder shows splash radius in px', () => {
  assert.equal(splashValue('en'), 'Splash 42 px around the enemy that was hit');
  assert.equal(splashValue('zh'), '溅射 被命中的敌人周围 42 px');
});

function damageValue(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `bolt-hit-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-damage');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected bolt shows damage per shot', () => {
  assert.equal(damageValue('en'), 'Damage 13 / shot');
  assert.equal(damageValue('zh'), '伤害 13 / 发');
});

function burnRow(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `cinder-burn-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'fire', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-burn');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected Cinder shows burn as damage per second for a duration', () => {
  assert.equal(burnRow('en'), 'Burn 5/s · 2.8s');
  assert.equal(burnRow('zh'), '燃烧 5/秒 · 2.8 秒');
});

function poisonRow(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `blight-poison-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'poison', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-poison');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected Blight shows poison damage per second', () => {
  assert.equal(poisonRow('en'), 'Poison 3.5/s · Stacks 4 · 4.5s');
  assert.equal(poisonRow('zh'), '毒素 3.5/秒 · 层数 4 · 4.5 秒');
});

function rangeRow(language, rank) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `bolt-range-${language}-${rank}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', rank, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-range');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected rank-2 bolt shows range in px', () => {
  assert.equal(rangeRow('en', 2), 'Range 311 px');
  assert.equal(rangeRow('zh', 2), '射程 311 px');
  assert.equal(rangeRow('en', 1), 'Range 295 px');
});

function chainRow(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `arc-chain-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'lightning', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-chain');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected Arc shows the chain jump in px', () => {
  assert.equal(chainRow('en'), 'Chain 2 · 92 px from the previous enemy');
  assert.equal(chainRow('zh'), '连锁 2 · 距上一名敌人 92 px');
});

function critRow(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `bolt-crit-${language}`});
  state.paused = true;
  state.slots[0].unit = createUnit(state, 'bolt', 1, 'tower');
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 0}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-crit');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a selected bolt separates crit chance from the damage multiplier', () => {
  assert.equal(critRow('en'), 'Crit 16% chance · ×1.85');
  assert.equal(critRow('zh'), '暴击 16% 几率 · ×1.85');
});

function heroPierce(language) {
  const doc = documentStub();
  const container = element(doc, 'div');
  container.setAttribute('data-ui', 'panel');
  const state = createRun({seed: 8, difficulty: 'normal', runId: `hero-pierce-${language}`});
  state.paused = true;
  assert.equal(applyHeroUpgrade(state, 'pierce').ok, true);
  renderBuildPanel(container, state, {
    t: key => t(language, key),
    act: () => ({ok: false}),
    getUI: () => ({screen: 'battle', selectedSlot: 2}),
    getProfile: () => ({settings: {language}}),
  });
  const row = findByTestId(container, 'stat-pierce');
  const label = row?.children?.find(child => child.tagName === 'SPAN')?.textContent || '';
  const value = row?.children?.find(child => child.tagName === 'B')?.textContent || '';
  return `${label} ${value}`;
}

test('a hero with Piercing Bolt shows one extra enemy', () => {
  assert.equal(heroPierce('en'), 'Pierce 1 extra enemy');
  assert.equal(heroPierce('zh'), '穿透 额外 1 名敌人');
});
