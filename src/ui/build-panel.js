/**
 * Fencefall v5 — Pure Solo-Gunner 3-of-1 Draft Modal & Gunner Inspector Bottom Sheet.
 * - Full-screen zero-scroll 3-of-1 Draft modal offering ONLY Gun Mods (枪械强化)
 *   and Auto Skills (自动技能), applied immediately in 1 tap.
 * - Compact mobile-friendly Gunner Bottom Sheet with direct 4-mode targeting pills,
 *   live stats, and active Auto Skills + Gun Mods list.
 */
import {getUnitStats} from '../data/towers.js';
import {HERO_UPGRADES, isAutoSkill} from '../systems/hero.js';
import {TARGET_MODES} from '../shared.js';
import {formatNumber, localize, t as translate} from '../i18n.js';
import {catalogIcon, navIcon} from './icons.js';

const ACCENTS = Object.freeze({
  split_shot: '#ffaa44',
  ricochet: '#ffe14a',
  napalm: '#ff6c30',
  armored_car: '#f0cb72',
  cryo_barrage: '#7ce8ff',
  orbital_beam: '#54f0ff',
  shrapnel: '#ff7a3a',
  frostbite: '#7ee6ff',
  pierce: '#a4e870',
  bastion: '#78e0b8',
  volley: '#ffd65a',
  strike: '#ff8a56',
  cadence: '#f6d268',
  focus: '#ffe26a',
  overclock: '#ff8c3c',
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

function accentOf(option) {
  if (!option) return ACCENTS.hero;
  return ACCENTS[option.upgradeId] || ACCENTS.hero;
}

function iconIdOf(option) {
  if (!option) return 'hero';
  return option.upgradeId || 'hero';
}

function draftCardMeta(option, lang, tr) {
  const id = option.upgradeId;
  const spec = HERO_UPGRADES[id];
  const isSuper = isAutoSkill(id);
  const name = loc(spec?.name, lang) || id;
  const lv = option.nextLevel || 1;
  const cap = option.cap || spec?.cap || 4;
  const tag = id === 'overclock'
    ? `${tr('tagHero')} · Lv.${lv}`
    : `${isSuper ? tr('tagSuperweapon') : tr('tagHero')} · Lv.${lv}/${cap}`;
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
      'data-kind': option.kind || 'hero_upgrade',
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
  const name = tr('gunnerTitle');
  const stats = getUnitStats(unit, state);
  const upgEntries = Object.entries(unit.upgrades || {})
    .filter(([, lv]) => Number(lv) > 0)
    .sort(([a], [b]) => Number(isAutoSkill(b)) - Number(isAutoSkill(a)));
  const totalLevels = upgEntries.reduce((sum, [, lv]) => sum + Number(lv), 0);

  const sheet = el('section', {
    class: 'ff-sheet',
    'data-testid': 'build-details',
    role: 'region',
    'aria-label': name,
  });

  const head = el('div', {class: 'ff-sheet-head'});
  const idBlock = el('div', {class: 'ff-sheet-id'}, [
    el('span', {class: 'ff-sheet-icon'}, [catalogIcon(doc, 'hero')]),
    el('div', {class: 'ff-sheet-titles'}, [
      el('div', {class: 'ff-sheet-name-row'}, [
        el('h3', {'data-testid': 'unit-name', text: name}),
        el('span', {
          class: 'ff-rank-pill is-hero',
          'data-testid': 'unit-rank',
          text: totalLevels > 0
            ? (lang === 'zh' ? `已强化 ${totalLevels} 级` : `${totalLevels} Upgrades`)
            : (lang === 'zh' ? '自动瞄准' : 'AUTO-AIM')
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

  // Active Auto Skills & Gun Mods chips
  if (upgEntries.length) {
    const mods = el('div', {class: 'ff-mod-chips', 'data-testid': 'hero-upgrades'});
    for (const [id, lv] of upgEntries) {
      const u = HERO_UPGRADES[id];
      mods.append(el('span', {
        class: `ff-mod-chip${isAutoSkill(id) ? ' is-super' : ''}`,
        text: `${loc(u?.name, lang) || id} Lv.${lv}`
      }));
    }
    sheet.append(mods);
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
