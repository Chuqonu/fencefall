import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, createProfile } from '../src/state.js';
import { createUnit } from '../src/shared.js';
import { deployFieldUnit } from '../src/systems/field.js';
import { drawDefender } from '../src/render/defenders.js';
import { createEffects } from '../src/render/effects.js';
import { createAudio } from '../src/audio.js';
import { draftPower, renderBuildPanel } from '../src/ui/build-panel.js';
import { renderMetaPanel } from '../src/ui/meta-panel.js';
import { catalogIcon } from '../src/ui/icons.js';
import { t as translate } from '../src/i18n.js';

function makeCanvasCtx() {
  const ops = [];
  return {
    ops,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    stroke() { ops.push({ op: 'stroke', color: this.strokeStyle }); },
    fill() { ops.push({ op: 'fill', color: this.fillStyle }); },
    fillRect(x, y, w, h) { ops.push({ op: 'rect', x, y, w, h, color: this.fillStyle }); },
    strokeRect(x, y, w, h) { ops.push({ op: 'strokeRect', x, y, w, h, color: this.strokeStyle }); },
    fillText(text, x, y) { ops.push({ op: 'text', text, x, y }); },
    setLineDash() {},
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
}

function makeDoc() {
  function makeEl(tag) {
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
      ownerDocument: null,
      parentNode: null,
      listeners: {},
      setAttribute(name, value) {
        this.attrs[name] = String(value);
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      append(...items) {
        for (const item of items) {
          if (item == null || item === false) continue;
          if (typeof item === 'object' && item.nodeType) this.appendChild(item);
          else this.appendChild({ nodeType: 3, textContent: String(item) });
        }
      },
      replaceChildren(...items) { this.children.length = 0; this.append(...items); },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
        this.parentNode = null;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      contains() { return false; },
      focus() {},
      get lastChild() { return this.children[this.children.length - 1] || null; },
      get childNodes() { return this.children; },
    };
    return node;
  }
  const doc = {
    nodeType: 9,
    createElement(tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    createElementNS(_ns, tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById() { return null; },
  };
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.documentElement.appendChild(doc.head);
  return doc;
}

function findTestId(node, id) {
  if (node?.getAttribute?.('data-testid') === id) return node;
  for (const child of node?.children || []) {
    const found = findTestId(child, id);
    if (found) return found;
  }
  return null;
}

function allText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent || '';
  return (node.textContent || '') + (node.children || []).map(allText).join(' ');
}

test('Sun Gleaner (harvest) paints unique animated pixel art across ranks 1 to 4', () => {
  const harvestCtx = makeCanvasCtx();
  const boltCtx = makeCanvasCtx();
  for (let rank = 1; rank <= 4; rank += 1) {
    drawDefender(harvestCtx, { type: 'harvest', kind: 'tower', rank }, 100, 560, rank * 0.4, false);
  }
  drawDefender(boltCtx, { type: 'bolt', kind: 'tower', rank: 1 }, 100, 560, 0.4, false);
  assert.ok(harvestCtx.ops.length > 60);
  const harvestColors = new Set(harvestCtx.ops.map((o) => o.color));
  const boltColors = new Set(boltCtx.ops.map((o) => o.color));
  assert.notDeepEqual([...harvestColors].sort(), [...boltColors].sort(), 'harvest uses distinct palette from bolt');
});

test('draftPower reports economy mark and bars for Sun Gleaner', () => {
  const state = createRun({ seed: 7, difficulty: 'normal', runId: 'harvest-draft' });
  const zh = draftPower(state, { kind: 'tower', type: 'harvest', rank: 1 }, 'zh');
  const en = draftPower(state, { kind: 'tower', type: 'harvest', rank: 1 }, 'en');
  assert.equal(zh.glyph, '☀');
  assert.equal(zh.label, '经济');
  assert.equal(en.label, 'Eco');
  assert.deepEqual(zh.bars.map((b) => b.key), ['energy', 'speed']);
});

test('build-panel renders dedicated Field Inspector when inspecting a deployed field defense', () => {
  const state = createRun({ seed: 11, difficulty: 'normal', runId: 'field-inspector-test' });
  state.energy = 100;
  assert.equal(deployFieldUnit(state, 'bulwark', 2).ok, true);
  const doc = makeDoc();
  const panel = doc.createElement('div');
  panel.setAttribute('data-ui', 'panel');
  renderBuildPanel(panel, state, {
    t: (k, v) => translate('zh', k, v),
    getState: () => state,
    getProfile: () => createProfile('zh'),
    getUI: () => ({ screen: 'battle', selectedSlot: -1, selectedField: 2 }),
    act: () => ({ ok: true }),
  });
  assert.ok(findTestId(panel, 'field-inspector'), 'renders field-inspector card');
  assert.ok(findTestId(panel, 'remove-field'), 'renders dismantle button');
  assert.ok(findTestId(panel, 'unit-close'), 'renders close button');
  assert.equal(findTestId(panel, 'empty-selection'), null, 'does not render empty-selection fallback');
});

test('Codex renders Sun Gleaner economy stats and bespoke icons for field defenses', () => {
  const doc = makeDoc();
  const container = doc.createElement('div');
  const profile = createProfile('zh');
  renderMetaPanel(container, 'codex', null, profile, {
    t: (k, v) => translate('zh', k, v),
    act: () => ({ ok: false }),
    getUI: () => ({}),
  });
  const card = findTestId(container, 'codex-tower-harvest');
  assert.ok(card, 'harvest card exists in Codex');
  const text = allText(card);
  assert.ok(text.includes('+12'), 'shows harvest energy yield');
  assert.ok(text.includes('+30%'), 'shows rear-row bonus');
  assert.equal(text.includes('0 / 发'), false, 'does not show 0/shot combat stat');
  for (const id of ['harvest', 'bulwark', 'spikes', 'flare']) {
    const svg = catalogIcon(doc, id);
    assert.ok(svg.children.length >= 2, `${id} icon has custom SVG paths`);
  }
});

test('v2 combat and field events emit visual effects and audio cues without throwing', () => {
  const fx = createEffects();
  const audio = createAudio({ enabled: true });
  const events = [
    { type: 'fence_surge', x: 180, y: 512, time: 1 },
    { type: 'corpse_explode', x: 160, y: 360, radius: 48, time: 1.1 },
    { type: 'cloud_spawn', x: 200, y: 340, radius: 42, time: 1.2 },
    { type: 'knockback', x: 180, y: 400, time: 1.3 },
    { type: 'field_build', kind: 'bulwark', x: 180, y: 468, time: 1.4 },
    { type: 'field_hit', kind: 'bulwark', x: 180, y: 468, time: 1.5 },
    { type: 'field_destroy', kind: 'bulwark', x: 180, y: 468, time: 1.6 },
    { type: 'field_repair', x: 180, y: 512, amount: 20, time: 1.7 },
    { type: 'field_remove', kind: 'spikes', x: 120, y: 414, time: 1.8 },
    { type: 'energy_gain', source: 'harvest', amount: 16, x: 132, y: 612, time: 1.9 },
    { type: 'wave_horde', time: 2.0 },
    { type: 'draft_reroll', time: 2.1 },
    { type: 'targeting_change', time: 2.2 },
    { type: 'hit', x: 180, y: 300, damage: 24, reaction: 'steam', time: 2.3 },
    { type: 'hit', x: 190, y: 310, damage: 30, reaction: 'catalyst', time: 2.4 },
  ];
  fx.ingest(events);
  audio.playEvents(events);
  const ctx = makeCanvasCtx();
  fx.update(0.05);
  fx.draw(ctx);
  assert.ok(ctx.ops.length > 20, 'v2 events produce visible VFX operations');
});
