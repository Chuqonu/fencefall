import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, createRun } from '../src/state.js';
import { prepare, step as stepEngine, setSpeed } from '../src/engine.js';
import { STEP } from '../src/shared.js';
import { HERO_UPGRADES, applyHeroUpgrade, getHeroStats } from '../src/systems/hero.js';
import {
  GEMS, GEM_ORDER, GEM_SLOTS,
  buyGem, equipGem, unequipGem, claimStarterPack, getProfileBonuses,
} from '../src/systems/progression.js';
import { spawnEnemy } from '../src/systems/movement.js';
import { updateCombat, superweaponCooldown } from '../src/systems/combat.js';
import { applyStatus } from '../src/systems/status.js';
import { exportSave, importSave } from '../src/storage.js';
import { createEffects } from '../src/render/effects.js';
import { createAudio } from '../src/audio.js';
import { hasCatalogIcon, catalogIcon } from '../src/ui/icons.js';
import { renderMetaPanel } from '../src/ui/meta-panel.js';
import { renderBuildPanel } from '../src/ui/build-panel.js';
import { t as translate } from '../src/i18n.js';

function createEngineRun(options) {
  const state = createRun(options);
  prepare(state);
  return state;
}

function makeDoc() {
  function makeEl(tag) {
    return {
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

function makeCanvasCtx() {
  const ops = [];
  return {
    ops,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    save() {},
    restore() {},
    fillRect(x, y, w, h) { ops.push({ x, y, w, h, color: this.fillStyle }); },
  };
}

test('Starter Supply Pack grants +180 currency, equips Opening Airdrop Gem, and refuses double claim', () => {
  const profile = createProfile('zh');
  assert.equal(profile.currency, 0);
  const first = claimStarterPack(profile);
  assert.equal(first.ok, true);
  assert.equal(profile.currency, 180);
  assert.equal(profile.starterClaimed, true);
  assert.ok(profile.gemsOwned.includes('gem_opening_drop'));
  assert.ok(profile.gemsEquipped.includes('gem_opening_drop'));

  const second = claimStarterPack(profile);
  assert.equal(second.ok, false);
  assert.equal(profile.currency, 180);
});

test('Core Gems support buy, equip up to 3 slots, unequip, and aggregate bonuses cleanly', () => {
  const profile = createProfile('en');
  // Baseline profile with no gems keeps exact baseline bonus keys
  assert.deepEqual(getProfileBonuses(profile), {
    damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0,
  });

  profile.currency = 500;
  for (const id of ['gem_opening_drop', 'gem_aegis_wall', 'gem_pierce_core', 'gem_elemental']) {
    assert.equal(buyGem(profile, id).ok, true, `buy ${id}`);
  }
  // Auto-equips up to GEM_SLOTS = 3
  assert.equal(profile.gemsEquipped.length, GEM_SLOTS);
  assert.deepEqual(profile.gemsEquipped, ['gem_opening_drop', 'gem_aegis_wall', 'gem_pierce_core']);

  // Equipping a 4th replaces the oldest slot
  assert.equal(equipGem(profile, 'gem_elemental').ok, true);
  assert.equal(profile.gemsEquipped.length, GEM_SLOTS);
  assert.ok(profile.gemsEquipped.includes('gem_elemental'));

  const bonuses = getProfileBonuses(profile);
  assert.equal(bonuses.wallImmunity, 5);
  assert.equal(bonuses.heroPierce, 1);
  assert.equal(bonuses.damage, 0.08);
  assert.equal(bonuses.statusDamage, 0.25);

  assert.equal(unequipGem(profile, 'gem_aegis_wall').ok, true);
  assert.equal(profile.gemsEquipped.includes('gem_aegis_wall'), false);
  assert.equal(getProfileBonuses(profile).wallImmunity, undefined);
});

test('Opening Airdrop Gem and Aegis Wall Immunity Gem work in live battle', () => {
  const profile = createProfile('zh');
  profile.currency = 200;
  assert.equal(claimStarterPack(profile).ok, true);
  assert.equal(buyGem(profile, 'gem_aegis_wall').ok, true);
  assert.equal(buyGem(profile, 'gem_overdrive').ok, true);

  const state = createEngineRun({ seed: 17, difficulty: 'normal', expedition: 'frenzy', profile, runId: 'v3-gems-live' });
  assert.equal(state.wallImmunity, 5);
  assert.equal(state.openingDraftPending, 1);
  assert.equal(state.energy, undefined);
  assert.ok(state.rerollsLeft >= 2);
  // Overdrive Gem grants 1 random v3 hero evolution at run start!
  const hero = state.slots[2].unit;
  const v3Ids = ['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam'];
  assert.ok(v3Ids.some((id) => (hero.upgrades?.[id] || 0) >= 1), 'starterWeapon granted a v3 evolution');

  // Advancing 0.4s triggers the free Opening Airdrop Draft
  for (let i = 0; i < 30 && state.phase === 'playing'; i++) stepEngine(state);
  assert.equal(state.phase, 'draft');
  assert.equal(state.draft?.openingDrop, true);
  assert.equal(state.draft?.options?.length, 3);

  // Resume and test Aegis Wall Immunity blocking a zombie bite
  state.phase = 'playing';
  state.draft = null;
  const hpBefore = state.fence.hp;
  const biter = spawnEnemy(state, 'shambler', { x: 180, y: 500, hp: 200, maxHp: 200, damage: 25, speed: 0, attackCooldown: 0 });
  biter.attacking = true;
  state.events = [];
  updateCombat(state, STEP);
  assert.equal(state.fence.hp, hpBefore, 'Aegis blocked fence damage');
  assert.equal(state.wallImmunity, 4, 'wallImmunity decremented from 5 to 4');
  assert.ok(state.events.some((e) => e.type === 'wall_immune'), 'emitted wall_immune event');
  assert.ok(biter.y < 500, 'attacker knocked back by Aegis pulse');
});

test('Elemental Surge Gem and HP Shredder Gem boost combat damage cleanly', () => {
  const baseProfile = createProfile('en');
  const gemProfile = createProfile('en');
  gemProfile.currency = 300;
  buyGem(gemProfile, 'gem_elemental');
  buyGem(gemProfile, 'gem_shredder');

  const sBase = createEngineRun({ seed: 31, difficulty: 'normal', profile: baseProfile, runId: 'gem-dmg-base' });
  const sGem = createEngineRun({ seed: 31, difficulty: 'normal', profile: gemProfile, runId: 'gem-dmg-boost' });
  for (const s of [sBase, sGem]) {
    s.slots[2].unit.cooldown = 0;
    s.slots[2].unit.upgrades.focus = 3;
    const e = spawnEnemy(s, 'brute', { x: 180, y: 320, hp: 1000, maxHp: 1000, armor: 0, speed: 0 });
    applyStatus(e, { type: 'burn', power: 2, remaining: 5, sourceId: 'u1', tickTimer: 5 });
    for (let i = 0; i < 60; i++) updateCombat(s, STEP);
  }
  const dmgBase = 1000 - sBase.enemies[0].hp;
  const dmgGem = 1000 - sGem.enemies[0].hp;
  assert.ok(dmgGem > dmgBase * 1.2, `Gem boosted damage (${dmgGem}) should clearly beat baseline (${dmgBase})`);
});

test('All 6 v3 BangBang Hero evolutions trigger automatically in combat', () => {
  const state = createEngineRun({ seed: 42, difficulty: 'normal', expedition: 'frenzy', runId: 'v3-arsenal' });
  const fenceStart = state.fence.maxHp;
  for (const id of ['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam']) {
    assert.equal(applyHeroUpgrade(state, id).ok, true, `apply ${id}`);
  }
  assert.equal(state.fence.maxHp, fenceStart + 60, 'armored_car added +60 fence HP');

  // Spawn a dense pack of tanky zombies so every auto super-weapon fires & hits
  for (let i = 0; i < 8; i++) {
    spawnEnemy(state, 'brute', {
      x: 110 + (i % 4) * 46,
      y: 220 + Math.floor(i / 4) * 38,
      hp: 4000,
      maxHp: 4000,
      speed: 0,
      damage: 0,
    });
  }

  const seenEvents = new Set();
  let sawSweeper = false;
  let sawBeam = false;
  let sawNapalmCloud = false;
  let sawSplitProj = false;
  let sawCryoProj = false;

  for (let step = 0; step < 360; step++) {
    state.events = [];
    updateCombat(state, STEP);
    for (const ev of state.events) seenEvents.add(ev.type);
    if (state.arsenal.sweepers.length > 0) sawSweeper = true;
    if (state.arsenal.beams.length > 0) sawBeam = true;
    if (state.clouds.some((c) => c.kind === 'napalm')) sawNapalmCloud = true;
    if (state.projectiles.some((p) => p.tags?.includes('split'))) sawSplitProj = true;
    if (state.projectiles.some((p) => p.tags?.includes('cryo_barrage'))) sawCryoProj = true;
  }

  assert.equal(seenEvents.has('bullet_split'), true, 'split_shot fired bullet_split');
  assert.equal(sawSplitProj, true, 'split_shot spawned piercing shrapnel children');
  assert.equal(seenEvents.has('napalm_blast'), true, 'napalm fired napalm_blast');
  assert.equal(sawNapalmCloud, true, 'napalm created persistent napalm fire sea cloud');
  assert.equal(seenEvents.has('armored_car'), true, 'armored_car dispatched truck');
  assert.equal(sawSweeper, true, 'armored_car stepped active sweeper truck');
  assert.equal(seenEvents.has('cryo_barrage'), true, 'cryo_barrage fired cryo_barrage');
  assert.equal(sawCryoProj, true, 'cryo_barrage launched piercing frost shards');
  assert.equal(seenEvents.has('orbital_beam'), true, 'orbital_beam fired orbital_beam');
  assert.equal(sawBeam, true, 'orbital_beam created active laser beam');
  assert.equal(seenEvents.has('em_strike'), true, 'ricochet fired auto EM sky-strike');
});

test('v3 gems, starterClaimed, and arsenal state survive save export/import round-trip', () => {
  const profile = createProfile('zh');
  claimStarterPack(profile);
  buyGem(profile, 'gem_aegis_wall');
  const run = createEngineRun({ seed: 99, difficulty: 'normal', expedition: 'frenzy', profile, runId: 'v3-save' });
  applyHeroUpgrade(run, 'napalm');
  applyHeroUpgrade(run, 'armored_car');

  const store = new Map();
  const storage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
  const raw = exportSave(profile, run);
  const loaded = importSave(raw, storage);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.equal(loaded.profile.starterClaimed, true);
  assert.deepEqual(loaded.profile.gemsEquipped, ['gem_opening_drop', 'gem_aegis_wall']);
  assert.equal(loaded.run.expedition, 'frenzy');
  assert.equal(loaded.run.wallImmunity, 5);
  assert.equal(loaded.run.openingDraftPending, 1);
  assert.ok(loaded.run.arsenal && typeof loaded.run.arsenal.timers === 'object');
});

test('All 12 v3 icons, draft cards, Armory Gem UI, VFX, and audio cues work cleanly', () => {
  const v3Ids = [
    'split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam',
    ...GEM_ORDER,
  ];
  const doc = makeDoc();
  const paths = new Set();
  for (const id of v3Ids) {
    assert.equal(hasCatalogIcon(id), true, `hasCatalogIcon(${id})`);
    const svg = catalogIcon(doc, id);
    const sig = svg.getAttribute('data-paths');
    assert.ok(sig && !paths.has(sig), `unique icon signature for ${id}`);
    paths.add(sig);
  }

  // Draft cards render cleanly in v4 build-panel for v3 super-weapon evolutions
  const state = createRun({ seed: 5, difficulty: 'normal', runId: 'v3-draft-ui' });
  state.phase = 'draft';
  state.draft = {
    options: [
      { id: 'hero_upgrade:napalm', kind: 'hero_upgrade', upgradeId: 'napalm', superweapon: true, cap: 3, nextLevel: 1 },
      { id: 'hero_upgrade:armored_car', kind: 'hero_upgrade', upgradeId: 'armored_car', superweapon: true, cap: 3, nextLevel: 1 },
      { id: 'hero_upgrade:orbital_beam', kind: 'hero_upgrade', upgradeId: 'orbital_beam', superweapon: true, cap: 3, nextLevel: 1 },
    ],
  };
  const draftHost = doc.createElement('div');
  renderBuildPanel(draftHost, state, { t: (k, v) => translate('zh', k, v), act: () => ({ ok: true }), getProfile: () => createProfile('zh'), getUI: () => ({}) });
  assert.ok(findTestId(draftHost, 'draft-card-0'), 'draft-card-0 rendered');
  assert.ok(findTestId(draftHost, 'draft-card-1'), 'draft-card-1 rendered');
  assert.ok(findTestId(draftHost, 'draft-card-2'), 'draft-card-2 rendered');

  // Menu & Armory render Starter Supply Pack and 3-socket Gem UI
  const profile = createProfile('zh');
  const menuBox = doc.createElement('div');
  const armoryBox = doc.createElement('div');
  const api = { t: (k, v) => translate('zh', k, v), act: () => ({ ok: true }), getUI: () => ({}) };
  renderMetaPanel(menuBox, 'menu', null, profile, api);
  assert.ok(findTestId(menuBox, 'starter-pack-card'), 'Menu shows Starter Supply Pack before claim');
  assert.ok(findTestId(menuBox, 'btn-claim-starter'), 'Menu shows claim button');

  renderMetaPanel(armoryBox, 'armory', null, profile, api);
  assert.ok(findTestId(armoryBox, 'armory-gems'), 'Armory renders Tactical Core Gems');
  assert.ok(findTestId(armoryBox, 'gem-sockets'), 'Armory renders 3 gem sockets');
  for (const id of GEM_ORDER) {
    assert.ok(findTestId(armoryBox, `gem-card-${id}`), `Armory renders ${id}`);
  }

  // After claiming, starter pack banner hides
  claimStarterPack(profile);
  renderMetaPanel(menuBox, 'menu', null, profile, api);
  assert.equal(findTestId(menuBox, 'starter-pack-card'), null, 'Starter pack hides once claimed');

  // VFX + Audio handle all 8 v3 events cleanly
  const fx = createEffects();
  const audio = createAudio({ enabled: true });
  const events = [
    { type: 'napalm_blast', x: 180, y: 260, radius: 68, time: 1 },
    { type: 'armored_car', x: 180, y: 500, time: 1.1 },
    { type: 'cryo_barrage', x: 180, y: 500, count: 5, time: 1.2 },
    { type: 'orbital_beam', x: 180, y: 260, width: 38, time: 1.3 },
    { type: 'em_strike', x: 180, y: 220, points: [{ x: 180, y: 220 }, { x: 220, y: 250 }], time: 1.4 },
    { type: 'wall_immune', x: 180, y: 512, remaining: 4, time: 1.5 },
    { type: 'bullet_split', x: 180, y: 300, count: 3, time: 1.6 },
    { type: 'cryo_shatter', x: 160, y: 280, radius: 42, time: 1.7 },
  ];
  fx.ingest(events);
  audio.playEvents(events);
  const ctx = makeCanvasCtx();
  fx.update(0.05);
  fx.draw(ctx);
  assert.ok(ctx.ops.length > 30, 'v3 events render rich visual effects');
  assert.ok(superweaponCooldown('napalm', 3, 0.22) < superweaponCooldown('napalm', 1, 0), 'superweaponCooldown scales with rank and haste');
});
