/**
 * Fencefall v4 Battle Draft & Unit Bottom Sheet.
 * - Full-screen zero-scroll 3-of-1 Draft modal (1 tap applies immediately: Hero mod, Auto Super-Weapon,
 *   New Turret auto-deploy, or Existing Turret Lv.1->Lv.4 upgrade).
 * - Compact mobile-friendly Unit Bottom Sheet with direct 4-mode targeting pills and clean stats.
 */
import {TOWERS, getUnitStats} from '../data/towers.js';
import {HERO_UPGRADES} from '../systems/hero.js';
import {TARGET_MODES} from '../shared.js';
import {formatNumber, localize, t as translate} from '../i18n.js';
import {catalogIcon, navIcon} from './icons.js';

const SUPERWEAPON_IDS = new Set(['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam']);

const ACCENTS = Object.freeze({
  bolt: '#f0d56a',
  fire: '#ff6c30',
  frost: '#7ce8ff',
  lightning: '#ffe14a',
  poison: '#80e06a',
  support: '#78d8c8',
  split_shot: '#ffaa44',
  ricochet: '#ffe14a',
  napalm: '#ff6c30',
  armored_car: '#f0cb72',
  cryo_barrage: '#7ce8ff',
  orbital_beam: '#54f0ff',
  hero: '#f0cb72',
});

let currentDoc = null;

function el(tag, attrs = {}, children = []) {
  const doc = currentDoc || globalThis.document;
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
  return node;
}

function btn(attrs = {}, children = []) {
  const {class: cls, primary, text, ...rest} = attrs;
  const node = el('button', {
    type: 'button',
    class: `btn${primary ? ' btn-primary' : ''}${cls ? ` ${cls}` : ''}`,
    ...rest,
  }, children);
  if (text != null) node.textContent = String(text);
  return node;
}

function langOf(state, api) {
  const raw = api?.getProfile?.()?.settings?.language || state?.profileSnapshot?.settings?.language || 'en';
  return raw === 'zh' ? 'zh' : 'en';
}

function trFn(api, lang) {
  return (key, vars) => {
    try {
      const val = api?.t?.(key, vars);
      if (typeof val === 'string' && val !== key) return val;
    } catch { /* fallback */ }
    return translate(lang, key, vars);
  };
}

function loc(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return localize(value, lang) || value[lang] || value.en || value.zh || '';
}

function fmt(n, lang) {
  return Number.isFinite(n) ? formatNumber(Math.round(n * 10) / 10, lang) : '0';
}

function stars(rank, max = 4) {
  const r = Math.max(1, Math.min(max, Math.round(Number(rank) || 1)));
  return '★'.repeat(r) + '☆'.repeat(Math.max(0, max - r));
}

function accentOf(option) {
  if (!option) return ACCENTS.hero;
  if (option.kind === 'tower') return ACCENTS[option.type] || ACCENTS.hero;
  if (option.kind === 'hero_upgrade') return ACCENTS[option.upgradeId] || ACCENTS.hero;
  return ACCENTS.hero;
}

function iconIdOf(option) {
  if (!option) return 'hero';
  if (option.kind === 'tower') return option.type;
  if (option.kind === 'hero_upgrade') return option.upgradeId;
  return 'hero';
}

function draftCardMeta(option, lang, tr) {
  if (option.kind === 'tower') {
    const spec = TOWERS[option.type];
    const name = loc(spec?.name, lang) || option.type;
    const isUpgrade = option.action === 'upgrade' || (option.rank || 0) >= 1;
    const fromRank = Math.max(1, option.rank || 1);
    const toRank = option.nextRank || (isUpgrade ? fromRank + 1 : 1);
    const tag = isUpgrade
      ? tr('tagUpgradeTurret', {from: fromRank, to: toRank})
      : tr('tagNewTurret');
    const tagKind = isUpgrade ? 'is-upgrade' : 'is-new';
    const desc = isUpgrade
      ? (lang === 'zh'
        ? `火力大幅飙升至 Lv.${toRank}，强化射速、射程与特效。`
        : `Power up to Lv.${toRank} with higher damage, fire rate & range.`)
      : (loc(spec?.description, lang) || '');
    return {name, tag, tagKind, desc, isSuper: false};
  }
  const spec = HERO_UPGRADES[option.upgradeId];
  const isSuper = SUPERWEAPON_IDS.has(option.upgradeId);
  const name = loc(spec?.name, lang) || option.upgradeId;
  const lv = option.nextLevel || 1;
  const cap = option.cap || spec?.cap || 3;
  const tag = `${isSuper ? tr('tagSuperweapon') : tr('tagHero')} · Lv.${lv}/${cap}`;
  const rawDesc = loc(option.description || spec?.description, lang) || '';
  const desc = rawDesc.replace(/^(Hero · |英雄 · )/, '');
  return {name, tag, tagKind: isSuper ? 'is-super' : 'is-hero', desc, isSuper};
}

function renderDraft(state, lang, tr) {
  const doc = currentDoc;
  const isOpening = state.draft?.openingDrop === true;
  const rerollsLeft = Number.isFinite(state.rerollsLeft) ? Math.max(0, Math.floor(state.rerollsLeft)) : 0;
  const rerollsUsed = Number(state.draftRerollsUsed) || 0;
  const canReroll = rerollsLeft > 0 && rerollsUsed < 3;

  const modal = el('section', {
    class: `ff-draft-modal${isOpening ? ' is-opening' : ''}`,
    'data-testid': 'build-draft',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': isOpening ? tr('openingDropTitle') : tr('chooseOneOfThree'),
  });

  const head = el('div', {class: 'ff-draft-head'});
  const titleWrap = el('div', {class: 'ff-draft-title-wrap'});
  titleWrap.append(
    el('span', {class: 'ff-draft-eyebrow', text: isOpening ? (lang === 'zh' ? '开局空投福利' : 'FREE OPENING DROP') : `Lv.${(state.draftLevel || 0) + 1}`}),
    el('h2', {class: 'ff-draft-title', 'data-testid': 'draft-title', text: isOpening ? tr('openingDropTitle') : tr('chooseOneOfThree')})
  );
  head.append(titleWrap);

  const rerollBtn = btn({
    class: 'ff-reroll-btn',
    'data-action': 'rerollDraft',
    'data-testid': 'reroll-draft',
    disabled: !canReroll,
  }, [
    navIcon(doc, 'reroll', 16),
    el('span', {text: `${tr('reroll')} ×${rerollsLeft}`})
  ]);
  head.append(rerollBtn);
  modal.append(head);

  const options = Array.isArray(state.draft?.options) ? state.draft.options : [];
  const list = el('ol', {class: 'ff-draft-list', 'data-testid': 'draft-list', 'data-count': String(options.length)});

  options.forEach((option, index) => {
    const meta = draftCardMeta(option, lang, tr);
    const accent = accentOf(option);
    const card = btn({
      class: `ff-choice${meta.isSuper ? ' is-super' : ''}`,
      style: `--choice-accent:${accent}`,
      'data-action': 'chooseDraft',
      'data-index': String(index),
      'data-kind': option.kind || '',
      'data-type': option.type || '',
      'data-upgrade-id': option.upgradeId || '',
      'data-option-id': option.id || '',
      'data-testid': `draft-choice-${index}`,
      'aria-label': `${meta.name}. ${meta.tag}. ${meta.desc}`,
    });

    const iconWrap = el('span', {class: 'ff-choice-icon', 'aria-hidden': 'true'}, [
      catalogIcon(doc, iconIdOf(option))
    ]);

    const body = el('span', {class: 'ff-choice-body'});
    const top = el('span', {class: 'ff-choice-top'}, [
      el('strong', {class: 'ff-choice-name', 'data-testid': `draft-choice-${index}-name`, text: meta.name}),
      el('span', {class: `ff-choice-tag ${meta.tagKind}`, 'data-testid': `draft-choice-${index}-tag`, text: meta.tag}),
    ]);
    body.append(
      top,
      el('span', {class: 'ff-choice-desc', 'data-testid': `draft-choice-${index}-effect`, text: meta.desc})
    );

    const arrow = el('span', {class: 'ff-choice-go', 'aria-hidden': 'true', text: '›'});
    card.append(iconWrap, body, arrow);
    list.append(el('li', {'data-testid': `draft-card-${index}`}, card));
  });

  modal.append(list);
  modal.append(el('p', {class: 'ff-draft-foot', text: tr('draftWaiting')}));
  return modal;
}

function renderInspector(state, ui, lang, tr) {
  const idx = ui?.selectedSlot;
  if (!Number.isInteger(idx) || idx < 0 || idx >= 10) return null;
  const slot = state.slots?.[idx];
  const unit = slot?.unit;
  if (!unit) return null;

  const doc = currentDoc;
  const isHeroUnit = unit.kind === 'hero' || unit.type === 'hero';
  const spec = isHeroUnit ? null : TOWERS[unit.type];
  const name = isHeroUnit ? tr('hero') : (loc(spec?.name, lang) || unit.type);
  const stats = getUnitStats(unit, state);

  const sheet = el('section', {
    class: 'ff-sheet',
    'data-testid': 'build-details',
    role: 'region',
    'aria-label': name,
  });

  // Compact header: icon + name + rank stars + kills + close
  const head = el('div', {class: 'ff-sheet-head'});
  const idBlock = el('div', {class: 'ff-sheet-id'}, [
    el('span', {class: 'ff-sheet-icon'}, [catalogIcon(doc, isHeroUnit ? 'hero' : unit.type)]),
    el('div', {class: 'ff-sheet-titles'}, [
      el('div', {class: 'ff-sheet-name-row'}, [
        el('h3', {'data-testid': 'unit-name', text: name}),
        el('span', {
          class: `ff-rank-pill${isHeroUnit ? ' is-hero' : ''}`,
          'data-testid': 'unit-rank',
          text: isHeroUnit ? (lang === 'zh' ? '主炮英雄' : 'HERO') : `Lv.${unit.rank || 1} ${stars(unit.rank || 1)}`
        }),
      ]),
      el('span', {
        class: 'ff-sheet-sub',
        text: `${tr('kills')} ${fmt(unit.kills || 0, lang)} · ${tr('swapHint')}`
      })
    ])
  ]);
  const closeBtn = btn({
    class: 'ff-sheet-close',
    'data-intent': 'dismiss',
    'data-testid': 'unit-close',
    'aria-label': tr('close'),
    text: '✕',
  });
  head.append(idBlock, closeBtn);
  sheet.append(head);

  // Direct 4-button Targeting Priority selector
  const targetRow = el('div', {class: 'ff-target-row', role: 'group', 'aria-label': tr('targeting'), 'data-testid': 'unit-targeting'});
  targetRow.append(el('span', {class: 'ff-target-label', text: tr('targeting')}));
  const modeBtns = el('div', {class: 'ff-target-pills'});
  for (const mode of TARGET_MODES) {
    const active = (unit.targeting || 'foremost') === mode;
    modeBtns.append(btn({
      class: `ff-target-pill${active ? ' is-active' : ''}`,
      'data-action': 'setTargeting',
      'data-index': String(idx),
      'data-mode': mode,
      'data-testid': `target-mode-${mode}`,
      'aria-pressed': active ? 'true' : 'false',
      text: tr(mode),
    }));
  }
  targetRow.append(modeBtns);
  sheet.append(targetRow);

  // Compact 1-row stats strip
  const rate = stats.interval > 0 ? 1 / stats.interval : 0;
  const chips = [
    [tr('damage'), fmt(stats.damage, lang)],
    [lang === 'zh' ? '攻速' : 'ROF', `${fmt(rate, lang)}/s`],
    [tr('range'), `${Math.round(stats.range)}`],
    [tr('crit'), `${Math.round((stats.critChance || 0) * 100)}%`],
  ];
  const statStrip = el('div', {class: 'ff-stat-strip', 'data-testid': 'unit-stats'});
  for (const [k, v] of chips) {
    statStrip.append(el('div', {class: 'ff-stat-chip'}, [
      el('span', {class: 'ff-stat-k', text: k}),
      el('strong', {class: 'ff-stat-v', text: v}),
    ]));
  }
  sheet.append(statStrip);

  // Hero active evolutions strip OR Turret 1-line description
  if (isHeroUnit) {
    const entries = Object.entries(unit.upgrades || {}).filter(([, lv]) => Number(lv) > 0);
    if (entries.length) {
      const mods = el('div', {class: 'ff-mod-chips', 'data-testid': 'hero-upgrades'});
      for (const [id, lv] of entries) {
        const u = HERO_UPGRADES[id];
        mods.append(el('span', {
          class: `ff-mod-chip${SUPERWEAPON_IDS.has(id) ? ' is-super' : ''}`,
          text: `${loc(u?.name, lang) || id} Lv.${lv}`
        }));
      }
      sheet.append(mods);
    }
  } else if (spec?.description) {
    sheet.append(el('p', {class: 'ff-sheet-desc', text: loc(spec.description, lang)}));
  }

  return sheet;
}

function bind(container) {
  if (container.__ffBound) return;
  container.__ffBound = true;
  container.addEventListener('click', (event) => {
    const control = event.target?.closest?.('button[data-action], button[data-intent]');
    if (!control || !container.contains(control) || control.disabled) return;
    const api = container.__ffApi;
    if (!api || typeof api.act !== 'function') return;
    const intent = control.getAttribute('data-intent');
    if (intent === 'dismiss') {
      api.act('selectSlot', {index: -1});
      return;
    }
    const action = control.getAttribute('data-action');
    if (action === 'chooseDraft') {
      const index = Number(control.getAttribute('data-index'));
      if (Number.isInteger(index)) api.act('chooseDraft', {index});
    } else if (action === 'rerollDraft') {
      api.act('rerollDraft');
    } else if (action === 'setTargeting') {
      const index = Number(control.getAttribute('data-index'));
      const mode = control.getAttribute('data-mode') || undefined;
      if (Number.isInteger(index)) api.act('setTargeting', {index, mode});
    }
  });
}

export function renderBuildPanel(container, state, api) {
  if (!container || typeof container.appendChild !== 'function') return;
  const doc = container.ownerDocument || globalThis.document;
  if (!doc?.createElement) return;
  currentDoc = doc;
  bind(container);
  container.__ffApi = api;

  const ui = api?.getUI?.() || {};
  if ((ui.screen && ui.screen !== 'battle') || !state || !Array.isArray(state.slots)) {
    container.replaceChildren();
    return;
  }

  const role = container.getAttribute?.('data-ui') || '';
  const lang = langOf(state, api);
  const tr = trFn(api, lang);

  if (state.phase === 'draft') {
    if (role === 'panel') {
      container.replaceChildren();
      return;
    }
    container.replaceChildren(renderDraft(state, lang, tr));
    return;
  }

  if (role === 'overlay') {
    container.replaceChildren();
    return;
  }

  const sheet = renderInspector(state, ui, lang, tr);
  if (sheet) container.replaceChildren(sheet);
  else container.replaceChildren();
}
