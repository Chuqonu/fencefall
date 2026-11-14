import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {HERO_UPGRADES} from '../src/systems/hero.js';
import {generateDraft} from '../src/systems/drafts.js';

// Player-facing names for the stat an upgrade actually changes.
// Catalog sentences and the short draft labels both count.
const STAT_TEXT = {
  damage: {en: ['damage'], zh: ['伤害']},
  interval: {en: ['attack speed', 'attack interval', 'haste'], zh: ['攻击速度', '攻速', '攻击间隔']},
  range: {en: ['range'], zh: ['射程']},
  critChance: {en: ['critical hit chance', 'crit chance', 'critical chance', 'crit'], zh: ['暴击率', '暴击']},
  critMultiplier: {en: ['critical multiplier', 'crit multiplier', 'crit damage', 'critical damage'], zh: ['暴击倍率', '暴击伤害', '暴击']},
  pierce: {en: ['pierce'], zh: ['穿透']},
  poison: {en: ['poison'], zh: ['毒素', '中毒', '毒']},
};

function changedStats(upgrade) {
  const effect = upgrade && upgrade.effect && typeof upgrade.effect === 'object' ? upgrade.effect : {};
  const named = [];
  if (Number(effect.damageAdd) > 0 || Number(effect.damage) > 0) named.push('damage');
  if (Number(effect.haste) > 0 || Number(effect.interval) > 0) named.push('interval');
  if (Number(effect.range) > 0) named.push('range');
  if (Number(effect.critChance) > 0) named.push('critChance');
  if (Number(effect.critMultiplier) > 0) named.push('critMultiplier');
  if (Number(effect.pierce) > 0) named.push('pierce');
  if (effect.poison && typeof effect.poison === 'object') named.push('poison');
  return named;
}

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function fillBoard(state) {
  for (let index = 0; index < state.slots.length; index += 1) {
    if (isHero(state.slots[index].unit)) continue;
    state.slots[index].unit = createUnit(state, 'bolt', 1, 'tower');
  }
}

function draftedHeroCards() {
  const cards = [];
  const seen = new Set();
  for (let seed = 1; seed <= 48; seed += 1) {
    const state = createRun({seed, difficulty: 'normal', runId: `hero-card-stat-${seed}`});
    fillBoard(state);
    const options = generateDraft(state);
    for (const card of options || []) {
      if (!card || card.kind !== 'hero_upgrade' || typeof card.upgradeId !== 'string') continue;
      if (seen.has(card.upgradeId)) continue;
      seen.add(card.upgradeId);
      cards.push(card);
    }
  }
  return cards;
}

function catalogCard(id) {
  return {id: `hero_upgrade:${id}`, kind: 'hero_upgrade', upgradeId: id, replace: false};
}

function cardStats(card) {
  const upgrade = card && HERO_UPGRADES[card.upgradeId];
  return changedStats(upgrade);
}

// Prefer a card the draft already produced. An existing catalog id is enough
// when that upgrade simply was not in the sampled three-card offers.
function pickCard(drafted, accept) {
  const offered = drafted.find(card => accept(cardStats(card)));
  if (offered) return offered;
  const id = Object.keys(HERO_UPGRADES).find(key => accept(changedStats(HERO_UPGRADES[key])));
  return id ? catalogCard(id) : null;
}

function readLang(value, lang) {
  if (typeof value === 'string') return lang === 'en' ? value.trim() : '';
  if (value && typeof value === 'object' && typeof value[lang] === 'string') return value[lang].trim();
  return '';
}

function exposedDescription(card) {
  const onCard = card && (card.description ?? card.summary ?? card.effectText ?? card.text ?? card.blurb);
  if (onCard != null && (typeof onCard === 'string' || typeof onCard === 'object')) {
    return onCard;
  }
  const catalog = card && HERO_UPGRADES[card.upgradeId];
  return catalog ? catalog.description : undefined;
}

function includesStat(text, words) {
  const hay = String(text).toLowerCase();
  return words.some(word => hay.includes(String(word).toLowerCase()));
}

function assertNamesStat(card, stat) {
  const id = card && card.upgradeId ? card.upgradeId : 'hero upgrade';
  const description = exposedDescription(card);
  assert.ok(description != null && description !== '', `${id} missing field description`);
  const english = readLang(description, 'en');
  const chinese = readLang(description, 'zh');
  assert.ok(english, `${id} missing field description.en`);
  assert.ok(chinese, `${id} missing field description.zh`);
  const words = STAT_TEXT[stat];
  assert.ok(words, `${id} missing field ${stat}`);
  assert.ok(
    includesStat(english, words.en),
    `${id} description.en does not name ${words.en[0]} (${stat})`
  );
  assert.ok(
    includesStat(chinese, words.zh),
    `${id} description.zh does not name ${words.zh[0]} (${stat})`
  );
}

const drafted = draftedHeroCards();

test('a drafted damage upgrade names damage in English and Chinese', () => {
  assert.ok(drafted.length > 0, 'draft produced no hero upgrade card');
  const card = pickCard(drafted, stats => stats.includes('damage'));
  assert.ok(card, 'missing field description for a damage upgrade');
  assertNamesStat(card, 'damage');
});

test('a drafted non-damage upgrade names its stat in English and Chinese', () => {
  assert.ok(drafted.length > 0, 'draft produced no hero upgrade card');
  const card = pickCard(drafted, stats => stats.length > 0 && !stats.includes('damage'));
  assert.ok(card, 'missing field description for a non-damage upgrade');
  const stat = cardStats(card).find(name => name !== 'damage');
  assert.ok(stat, `${card.upgradeId || 'hero upgrade'} missing field description`);
  assertNamesStat(card, stat);
});
