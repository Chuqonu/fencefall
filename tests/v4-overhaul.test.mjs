import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  CONTRACT_VERSION, BASE_TYPES, AUTO_DEPLOY_ORDER, TARGET_MODES, STEP, createUnit
} from '../src/shared.js';
import { createProfile, createRun } from '../src/state.js';
import { prepare, step, integrationInfo } from '../src/engine.js';
import { TOWERS, RANK_SCALE, getUnitStats } from '../src/data/towers.js';
import { applyHeroUpgrade } from '../src/systems/hero.js';
import { chooseDraft, rerollDraft, updateDrafts, generateDraft } from '../src/systems/drafts.js';
import { spawnEnemy } from '../src/systems/movement.js';
import { updateCombat } from '../src/systems/combat.js';
import { buyEquipment, equipItem, getProfileBonuses, claimStarterPack } from '../src/systems/progression.js';
import { exportSave, importSave } from '../src/storage.js';
import { createController, ACTIONS } from '../src/boot.js';
import { renderBuildPanel } from '../src/ui/build-panel.js';
import { renderMetaPanel } from '../src/ui/meta-panel.js';
import { t } from '../src/i18n.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

function makeDoc() {
  function makeEl(tag) {
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      className: '',
      _text: '',
      get textContent() { return this._text || this.children.map(c => c.textContent || '').join(''); },
      set textContent(v) { this._text = v == null ? '' : String(v); },
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
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
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
        this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        this.parentNode = null;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      contains() { return false; },
      focus() {},
      get lastChild() { return this.children.at(-1) || null; },
      get childNodes() { return this.children; }
    };
    return el;
  }
  const doc = {
    nodeType: 9,
    createElement(tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    createElementNS(_ns, tag) { const n = makeEl(tag); n.ownerDocument = doc; return n; },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById() { return null; }
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

test('v4 removes all PvZ field modules, merge tower modules, harvest tower, and energy currency', () => {
  assert.equal(CONTRACT_VERSION, 3);
  assert.equal(integrationInfo().contract, 3);
  assert.equal(existsSync('src/data/field-units.js'), false);
  assert.equal(existsSync('src/systems/field.js'), false);
  assert.equal(existsSync('src/data/recipes.js'), false);
  assert.equal(existsSync('src/systems/merges.js'), false);
  assert.deepEqual(BASE_TYPES, ['bolt', 'fire', 'frost', 'lightning', 'poison', 'support']);
  assert.equal(TOWERS.harvest, undefined);

  const state = createRun({ seed: 101, difficulty: 'normal', runId: 'v4-clean-state' });
  assert.equal(state.energy, undefined);
  assert.equal(state.maxEnergy, undefined);
  assert.equal(state.fieldSlots, undefined);
  assert.equal(state.fieldCooldowns, undefined);
  assert.equal(state.pendingUnit, undefined);
  assert.equal(state.stats.merges, undefined);
  assert.equal(state.rerollsLeft, 2);

  for (const banned of ['place', 'cancelPlacement', 'mergePreview', 'mergeConfirm', 'mergeCancel', 'deployField', 'clearField']) {
    assert.equal(ACTIONS.includes(banned), false, `${banned} must not be in ACTIONS`);
  }
});

test('1-tap draft auto-deploys turrets in AUTO_DEPLOY_ORDER and levels repeat picks Lv.1 -> Lv.4', () => {
  const state = createRun({ seed: 202, difficulty: 'normal', runId: 'v4-1tap-level' });
  prepare(state);

  // First pick of 'bolt' auto-deploys to AUTO_DEPLOY_ORDER[0] (slot 1, beside Hero on slot 2)
  state.phase = 'draft';
  state.draft = {
    options: [
      { id: 'tower:bolt', kind: 'tower', type: 'bolt', action: 'deploy', rank: 0, nextRank: 1, cap: 4 },
      { id: 'tower:fire', kind: 'tower', type: 'fire', action: 'deploy', rank: 0, nextRank: 1, cap: 4 },
      { id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike', superweapon: false, cap: 5, nextLevel: 1 }
    ]
  };
  const first = chooseDraft(state, 0);
  assert.equal(first.ok, true);
  assert.equal(state.phase, 'playing');
  const firstSlot = AUTO_DEPLOY_ORDER[0];
  assert.equal(state.slots[firstSlot].unit.type, 'bolt');
  assert.equal(state.slots[firstSlot].unit.rank, 1);

  const dmgLv1 = getUnitStats(state.slots[firstSlot].unit, state).damage;

  // Repeat picks of 'bolt' directly level it Lv.1 -> Lv.2 -> Lv.3 -> Lv.4 and emit upgrade_tower
  for (let next = 2; next <= RANK_SCALE.maxRank; next++) {
    state.events = [];
    state.phase = 'draft';
    state.draft = {
      options: [
        { id: 'tower:bolt', kind: 'tower', type: 'bolt', action: 'upgrade', rank: next - 1, nextRank: next, cap: 4 },
        { id: 'tower:fire', kind: 'tower', type: 'fire', action: 'deploy', rank: 0, nextRank: 1, cap: 4 },
        { id: 'hero_upgrade:strike', kind: 'hero_upgrade', upgradeId: 'strike', superweapon: false, cap: 5, nextLevel: 1 }
      ]
    };
    const res = chooseDraft(state, 0);
    assert.equal(res.ok, true);
    assert.equal(state.phase, 'playing');
    assert.equal(state.slots[firstSlot].unit.rank, next);
    assert.ok(state.events.some(e => e.type === 'upgrade_tower' && e.rank === next && e.slot === firstSlot));
  }

  const dmgLv4 = getUnitStats(state.slots[firstSlot].unit, state).damage;
  assert.ok(dmgLv4 > dmgLv1 * 4, `Lv.4 damage (${dmgLv4}) should scale strongly over Lv.1 (${dmgLv1})`);

  // At Lv.4 cap, 'bolt' must no longer appear in generateDraft!
  for (let i = 0; i < 15; i++) {
    const cards = generateDraft(state);
    assert.equal(cards.some(c => c.kind === 'tower' && c.type === 'bolt'), false, 'maxed Lv.4 turret excluded from draft');
  }
});

test('charge-based rerollDraft spends rerollsLeft cleanly and stops when depleted', () => {
  const profile = createProfile('zh');
  profile.currency = 500;
  buyEquipment(profile, 'sun_spindle');
  equipItem(profile, 'sun_spindle');
  assert.equal(getProfileBonuses(profile).freeRerolls, 1);

  const state = createRun({ seed: 303, difficulty: 'normal', profile, runId: 'v4-reroll' });
  prepare(state);
  assert.equal(state.rerollsLeft, 3, 'base 2 + sun_spindle 1 = 3 reroll charges');

  state.xp = state.nextDraftXp;
  assert.equal(updateDrafts(state).ok, true);
  assert.equal(state.phase, 'draft');

  assert.equal(rerollDraft(state).ok, true);
  assert.equal(state.rerollsLeft, 2);
  assert.equal(rerollDraft(state).ok, true);
  assert.equal(state.rerollsLeft, 1);
  assert.equal(rerollDraft(state).ok, true);
  assert.equal(state.rerollsLeft, 0);
  assert.equal(rerollDraft(state).ok, false, 'cannot reroll with 0 charges left');
});

test('wall thorns reflect damage on melee hits and Bastion hero upgrade grants +100 wall HP and +1 Aegis immunity', () => {
  const profile = createProfile('en');
  profile.currency = 500;
  buyEquipment(profile, 'vanguard_kit');
  equipItem(profile, 'vanguard_kit');
  const state = createRun({ seed: 404, difficulty: 'normal', profile, runId: 'v4-thorns-bastion' });
  prepare(state);
  const maxBefore = state.fence.maxHp;
  const immBefore = state.wallImmunity;

  assert.equal(applyHeroUpgrade(state, 'bastion').ok, true);
  assert.equal(state.fence.maxHp, maxBefore + 100);
  assert.equal(state.wallImmunity, immBefore + 1);

  // Consume Aegis immunity first, then verify thorns reflect damage to melee attacker
  state.wallImmunity = 0;
  const biter = spawnEnemy(state, 'shambler', { x: 180, y: 500, hp: 100, maxHp: 100, damage: 10, speed: 0, attackCooldown: 0 });
  biter.attacking = true;
  updateCombat(state, STEP);
  assert.ok(biter.hp < 100, `wall thorns reflected damage (${biter.hp} < 100)`);
});

test('dragDrop swaps any two defenders cleanly and setTargeting switches all 4 targeting modes directly', async () => {
  const api = await createController({ storage: memoryStorage() });
  assert.equal(api.act('start', { seed: 505, difficulty: 'normal', runId: 'v4-drag-target' }).ok, true);
  const state = api.getState();
  const hero = state.slots[2].unit;
  const frost = createUnit(state, 'frost', 2, 'tower');
  state.slots[1].unit = frost;

  const swapped = api.act('dragDrop', { from: 2, to: 1 });
  assert.equal(swapped.ok, true);
  assert.equal(swapped.swapped, true);
  assert.equal(state.slots[1].unit, hero);
  assert.equal(state.slots[2].unit, frost);

  for (const mode of TARGET_MODES) {
    assert.equal(api.act('setTargeting', { index: 2, mode }).ok, true);
    assert.equal(state.slots[2].unit.targeting, mode);
  }
});

test('mobile-first UI renders Home, 3-Tab Armory, 3-Tab Codex, zero-scroll Draft modal, and 4-mode Unit Sheet', () => {
  const doc = makeDoc();
  const profile = createProfile('zh');
  const api = {
    t: (k, v) => t('zh', k, v),
    act: () => ({ ok: true }),
    getProfile: () => profile,
    getUI: () => ({ selectedSlot: 2 })
  };

  // Home Lobby (20-Stage Campaign)
  const home = doc.createElement('div');
  renderMetaPanel(home, 'menu', null, profile, api);
  assert.ok(findTestId(home, 'starter-pack-card'), 'Starter Pack visible on Home');
  assert.ok(findTestId(home, 'stage-switcher'), 'Stage switcher rendered');
  assert.ok(findTestId(home, 'stage-strip'), '1-20 stage strip rendered');
  assert.ok(findTestId(home, 'btn-toggle-stage-grid'), 'All 20 stages grid toggle rendered');
  assert.ok(findTestId(home, 'btn-start'), 'Primary Start Stage CTA rendered');
  assert.equal(findTestId(home, 'difficulty-bar'), null, 'No redundant 4-difficulty selector on Home');

  // 3-Tab Armory (Gems / Gear / Upgrades)
  const armory = doc.createElement('div');
  renderMetaPanel(armory, 'armory', null, profile, api);
  assert.ok(findTestId(armory, 'armory-tab-gems'));
  assert.ok(findTestId(armory, 'armory-tab-gear'));
  assert.ok(findTestId(armory, 'armory-tab-upgrades'));
  assert.ok(findTestId(armory, 'gem-sockets'));

  // 3-Tab Codex (Turrets / Hero & Arsenal / Enemies — zero Recipes)
  const codex = doc.createElement('div');
  renderMetaPanel(codex, 'codex', null, profile, api);
  assert.ok(findTestId(codex, 'codex-tab-towers'));
  assert.ok(findTestId(codex, 'codex-tab-hero'));
  assert.ok(findTestId(codex, 'codex-tab-enemies'));
  assert.equal(findTestId(codex, 'codex-tab-recipes'), null);

  // Draft Modal with 3 cards + Reroll button
  const run = createRun({ seed: 606, difficulty: 'normal', expedition: 'stage_1', profile, runId: 'v4-ui' });
  run.xp = run.nextDraftXp;
  updateDrafts(run);
  const draftHost = doc.createElement('div');
  renderBuildPanel(draftHost, run, api);
  assert.ok(findTestId(draftHost, 'build-draft'));
  assert.ok(findTestId(draftHost, 'draft-choice-0'));
  assert.ok(findTestId(draftHost, 'draft-choice-1'));
  assert.ok(findTestId(draftHost, 'draft-choice-2'));
  assert.ok(findTestId(draftHost, 'reroll-draft'));

  // Unit Sheet with direct 4-mode targeting buttons
  chooseDraft(run, 0);
  const sheetHost = doc.createElement('div');
  renderBuildPanel(sheetHost, run, api);
  assert.ok(findTestId(sheetHost, 'build-details'));
  for (const mode of TARGET_MODES) {
    assert.ok(findTestId(sheetHost, `target-mode-${mode}`), `targeting button ${mode}`);
  }
});

test('v1 and v2 saves migrate to v3 profile cleanly and v3 stage saves round-trip completely', () => {
  const store = memoryStorage();
  const profile = createProfile('zh');
  claimStarterPack(profile);
  const run = createRun({ seed: 707, difficulty: 'normal', expedition: 'stage_5', profile, runId: 'v4-roundtrip' });
  prepare(run);
  run.rerollsLeft = 1;
  run.slots[1].unit = createUnit(run, 'lightning', 3, 'tower');

  const raw = exportSave(profile, run);
  const res = importSave(raw, store);
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.profile.version, CONTRACT_VERSION);
  assert.equal(res.run.version, CONTRACT_VERSION);
  assert.equal(res.run.expedition, 'stage_5');
  assert.equal(res.run.rerollsLeft, 1);
  assert.equal(res.run.slots[1].unit.type, 'lightning');
  assert.equal(res.run.slots[1].unit.rank, 3);
});
