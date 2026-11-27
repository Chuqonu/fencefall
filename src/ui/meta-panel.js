/**
 * Fencefall v4 Mobile-First Meta Screens:
 * - Home Battle Lobby (Resume banner, Starter Pack, Horizontal Sortie Strip, 4-Pill Difficulty, Big Deploy CTA)
 * - Tabbed Armory (Core Gems 3-Socket / Gear / Permanent Upgrades)
 * - Clean 3-Tab Codex (Turrets / Hero & Super-Weapons / Enemies)
 * - Settings + Quick Guide + Save Backup
 * - Punchy Victory/Defeat Results Screen
 */
import {CONTRACT_VERSION, DIFFICULTIES} from '../shared.js';
import {TOWERS} from '../data/towers.js';
import {ENEMIES} from '../data/enemies.js';
import {
  CHAPTERS,
  EXPEDITIONS,
  STAGE_ORDER,
  STAGES,
  TOTAL_STAGES,
  highestClearedStage,
  highestUnlockedStage,
  isStageUnlocked,
  nextStageId,
  stageClearRecord,
  stageIdFor,
  stageNumber,
  totalStarsEarned
} from '../data/expeditions.js';
import {HERO_UPGRADES} from '../systems/hero.js';
import {
  EQUIPMENT,
  GEMS,
  GEM_ORDER,
  GEM_SLOTS,
  PERMANENT_UPGRADES,
  getProfileBonuses,
  nextArmoryBuy
} from '../systems/progression.js';
import {formatDuration, formatNumber, localize, t as translate} from '../i18n.js';
import {catalogIcon, navIcon} from './icons.js';

const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
const SLOT_ORDER = ['weapon', 'charm', 'armor'];
const PERMANENT_ORDER = ['damage', 'haste', 'vitality', 'economy'];
const SUPERWEAPON_IDS = new Set(['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam']);

const local = {
  screen: null,
  armoryTab: 'gems',
  codexTab: 'towers',
  confirmAbandon: false,
  stageNum: null,
  showStageGrid: false,
  importText: '',
  exportText: '',
  flash: null,
};

function h(doc, tag, attrs = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'className' || k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'value') node.value = String(v);
    else if (k === 'disabled' && v === true) node.disabled = true;
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

function btn(ctx, opts, children = []) {
  const {label, primary, disabled, pressed, active, className, testid, action, ...rest} = opts;
  const cls = ['btn', primary ? 'btn-primary' : '', active ? 'is-active' : '', className || ''].filter(Boolean).join(' ');
  const node = h(ctx.doc, 'button', {
    type: 'button',
    className: cls,
    disabled: Boolean(disabled),
    'data-testid': testid,
    'data-action': action,
    'aria-pressed': pressed != null ? (pressed ? 'true' : 'false') : undefined,
    ...rest
  }, children);
  if (label != null && children.length === 0) node.textContent = String(label);
  return node;
}

function tr(api, lang, key, vars) {
  try {
    const val = api?.t?.(key, vars);
    if (typeof val === 'string' && val !== key) return val;
  } catch { /* fallback */ }
  return translate(lang, key, vars);
}

function loc(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return localize(value, lang) || value[lang] || value.en || value.zh || '';
}

function num(value, lang) {
  return Number.isFinite(value) ? formatNumber(Math.round(value * 10) / 10, lang) : '0';
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function act(ctx, action, payload) {
  try {
    const res = ctx.api?.act?.(action, payload);
    ctx.rerender();
    return res;
  } catch {
    return {ok: false, reason: 'error'};
  }
}

function setFlash(ctx, kind, key, fallbackText) {
  local.flash = {kind, text: fallbackText || tr(ctx.api, ctx.lang, key)};
  ctx.rerender();
}

function bonusLabel(ctx, key) {
  const map = {
    damage: 'teamDamage',
    haste: 'teamHaste',
    critChance: 'teamCrit',
    reward: 'reward',
    superweaponHaste: 'superweaponHaste',
    surgePower: 'surgePower',
    statusDamage: 'statusDamage',
    shredPercent: 'shredPercent',
    critKnockback: 'critKnockback',
    fence: 'fenceBonus',
    thorns: 'thorns',
    freeRerolls: 'freeRerolls',
    surgeCharges: 'surgeCharges',
    wallImmunity: 'wallImmunity',
    openingDraft: 'openingDraft',
    heroPierce: 'heroPierce',
    starterWeapon: 'starterWeapon',
  };
  return tr(ctx.api, ctx.lang, map[key] || key);
}

function formatBonusVal(key, val, lang) {
  const percentKeys = new Set(['damage', 'haste', 'critChance', 'reward', 'superweaponHaste', 'surgePower', 'statusDamage', 'shredPercent']);
  if (percentKeys.has(key)) return `+${Math.round(val * 100)}%`;
  if (key === 'critKnockback') return `+${val}px`;
  return `+${num(val, lang)}`;
}

function starterPackCard(ctx) {
  const {doc, api, lang, profile} = ctx;
  if (profile.starterClaimed) return null;
  const card = h(doc, 'section', {className: 'm-starter', 'data-testid': 'starter-pack-card'});
  const top = h(doc, 'div', {className: 'm-starter-top'}, [
    catalogIcon(doc, 'gem_opening_drop'),
    h(doc, 'div', {className: 'm-starter-copy'}, [
      h(doc, 'h3', {text: tr(api, lang, 'starterPackTitle')}),
      h(doc, 'p', {text: tr(api, lang, 'starterPackDesc')})
    ])
  ]);
  const claimBtn = btn(ctx, {
    action: 'claimStarterPack',
    testid: 'btn-claim-starter',
    label: tr(api, lang, 'claimStarterPack'),
    primary: true,
    className: 'm-full-btn'
  });
  claimBtn.addEventListener('click', () => {
    const res = act(ctx, 'claimStarterPack');
    if (res?.ok) setFlash(ctx, 'ok', 'starterClaimed');
  });
  card.append(top, claimBtn);
  return card;
}

// =========================================================================
// 1. HOME / 20-STAGE CAMPAIGN LOBBY ("向僵尸开炮" Style)
// =========================================================================
function starRow(doc, earned, max = 3, className = 'm-stars') {
  const wrap = h(doc, 'span', {className, 'aria-label': `${earned}/${max}`});
  for (let i = 1; i <= max; i += 1) {
    wrap.append(h(doc, 'span', {className: `m-star${i <= earned ? ' is-lit' : ''}`, text: '★'}));
  }
  return wrap;
}

function chapterFor(stageNum) {
  return CHAPTERS.find((c) => stageNum >= c.range[0] && stageNum <= c.range[1]) || CHAPTERS[0];
}

function renderMenu(ctx, root) {
  const {doc, api, lang, run, profile} = ctx;
  const live = Boolean(run && run.phase !== 'victory' && run.phase !== 'defeat');
  const unlockedMax = highestUnlockedStage(profile);
  const clearedCount = highestClearedStage(profile);
  const starsTotal = totalStarsEarned(profile);

  const savedStage = stageNumber(profile.settings?.expedition);
  const rawStage = local.stageNum != null
    ? local.stageNum
    : (savedStage > 0 && savedStage <= unlockedMax ? savedStage : unlockedMax);
  const stageNum = Math.max(1, Math.min(TOTAL_STAGES, rawStage));
  const stageId = stageIdFor(stageNum);
  const stage = STAGES[stageId];
  const unlocked = isStageUnlocked(profile, stageId);
  const rec = stageClearRecord(profile, stageId);
  const chapter = chapterFor(stageNum);

  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-menu'});

  if (api.getUI?.()?.message === 'legacyRunReset') {
    stack.append(h(doc, 'div', {className: 'm-notice'}, [tr(api, lang, 'legacyRunReset')]));
  }

  // Active paused run resume card
  if (live) {
    const resumeCard = h(doc, 'section', {className: 'm-card m-resume-card', 'data-testid': 'active-run-card'});
    const expName = loc(EXPEDITIONS[run.expedition]?.name, lang) || run.expedition;
    const hpPct = run.fence?.maxHp > 0 ? Math.round((run.fence.hp / run.fence.maxHp) * 100) : 100;
    resumeCard.append(
      h(doc, 'div', {className: 'm-resume-head'}, [
        h(doc, 'div', {}, [
          h(doc, 'span', {className: 'm-eyebrow', text: lang === 'zh' ? '进行中的关卡' : 'ACTIVE STAGE'}),
          h(doc, 'h2', {text: `${expName} · ${tr(api, lang, 'waveNumber', {wave: run.wave || 0})}`})
        ]),
        h(doc, 'span', {className: 'badge', text: `${tr(api, lang, 'fence')} ${hpPct}%`})
      ])
    );

    const continueBtn = btn(ctx, {
      action: 'resume',
      testid: 'btn-continue',
      label: tr(api, lang, 'continue'),
      primary: true,
      className: 'm-cta-btn'
    });
    continueBtn.addEventListener('click', () => act(ctx, 'resume'));
    resumeCard.append(continueBtn);

    const subRow = h(doc, 'div', {className: 'm-row-2'});
    const restartBtn = btn(ctx, {action: 'restart', testid: 'btn-restart', label: tr(api, lang, 'restart')});
    restartBtn.addEventListener('click', () => act(ctx, 'restart'));
    subRow.append(restartBtn);

    if (local.confirmAbandon) {
      const confirmBtn = btn(ctx, {action: 'abandon', testid: 'btn-abandon-confirm', label: tr(api, lang, 'confirm'), className: 'btn-danger'});
      confirmBtn.addEventListener('click', () => { local.confirmAbandon = false; act(ctx, 'abandon'); });
      const cancelBtn = btn(ctx, {action: 'cancel', testid: 'btn-abandon-cancel', label: tr(api, lang, 'cancel')});
      cancelBtn.addEventListener('click', () => { local.confirmAbandon = false; ctx.rerender(); });
      subRow.append(confirmBtn, cancelBtn);
    } else {
      const abandonBtn = btn(ctx, {action: 'abandon', testid: 'btn-abandon', label: tr(api, lang, 'abandon')});
      abandonBtn.addEventListener('click', () => { local.confirmAbandon = true; ctx.rerender(); });
      subRow.append(abandonBtn);
    }
    resumeCard.append(subRow);
    stack.append(resumeCard);
  }

  // Starter Supply Pack Banner (anti-grind jumpstart)
  const starter = starterPackCard(ctx);
  if (starter) stack.append(starter);

  // =========================================================================
  // 20-STAGE CAMPAIGN HERO CARD
  // =========================================================================
  const deployCard = h(doc, 'section', {className: 'm-card m-deploy-card', 'data-testid': 'deploy-card'});

  // Top progress header: Chapter + Cleared/Stars + Toggle All 20 Stages Grid
  const progHead = h(doc, 'div', {className: 'm-stage-prog-head'});
  const chapMeta = h(doc, 'div', {className: 'm-stage-chap-meta'}, [
    h(doc, 'span', {className: 'm-stage-chap', text: loc(chapter.name, lang)}),
    h(doc, 'span', {
      className: 'm-stage-prog-pill',
      'data-testid': 'campaign-progress',
      text: `${tr(api, lang, 'clearedOfTotal', {cleared: clearedCount, total: TOTAL_STAGES})} · ★ ${starsTotal}/${TOTAL_STAGES * 3}`
    })
  ]);
  const gridToggle = btn(ctx, {
    testid: 'btn-toggle-stage-grid',
    className: `m-stage-grid-toggle${local.showStageGrid ? ' is-active' : ''}`,
    label: local.showStageGrid ? tr(api, lang, 'hideStages') : tr(api, lang, 'allStages'),
    pressed: local.showStageGrid
  });
  gridToggle.addEventListener('click', () => {
    local.showStageGrid = !local.showStageGrid;
    ctx.rerender();
  });
  progHead.append(chapMeta, gridToggle);

  // Signature Left / Stage Title / Right Switcher
  const switcher = h(doc, 'div', {className: 'm-stage-switcher', 'data-testid': 'stage-switcher'});
  const prevBtn = btn(ctx, {
    testid: 'btn-stage-prev',
    className: 'm-stage-arrow',
    label: '‹',
    disabled: stageNum <= 1,
    'aria-label': tr(api, lang, 'prevStageAria')
  });
  prevBtn.addEventListener('click', () => {
    if (stageNum > 1) {
      local.stageNum = stageNum - 1;
      ctx.rerender();
    }
  });

  const stageTitleBox = h(doc, 'div', {className: 'm-stage-center'}, [
    h(doc, 'div', {className: 'm-stage-title-row'}, [
      h(doc, 'h2', {'data-testid': 'stage-title', text: loc(stage.name, lang)}),
      stage.boss ? h(doc, 'span', {className: 'badge m-boss-badge', text: tr(api, lang, 'bossBadge')}) : null
    ]),
    h(doc, 'div', {className: 'm-stage-sub-row'}, [
      starRow(doc, rec.stars, 3, 'm-stars'),
      rec.clears > 0
        ? h(doc, 'span', {className: 'badge is-ok', text: tr(api, lang, 'firstClearClaimed')})
        : h(doc, 'span', {className: 'badge m-bonus-badge', 'data-testid': 'first-clear-badge', text: tr(api, lang, 'firstClearBonus', {amount: stage.firstClearBonus})})
    ])
  ]);

  const nextBtn = btn(ctx, {
    testid: 'btn-stage-next',
    className: 'm-stage-arrow',
    label: '›',
    disabled: stageNum >= TOTAL_STAGES,
    'aria-label': tr(api, lang, 'nextStageAria')
  });
  nextBtn.addEventListener('click', () => {
    if (stageNum < TOTAL_STAGES) {
      local.stageNum = stageNum + 1;
      ctx.rerender();
    }
  });
  switcher.append(prevBtn, stageTitleBox, nextBtn);

  // Stage Spotlight Preview (tactical focus + featured enemy icons)
  const preview = h(doc, 'div', {className: `m-spotlight${stage.boss ? ' is-boss' : ''}${!unlocked ? ' is-locked' : ''}`, 'data-testid': 'stage-preview'});
  preview.append(
    h(doc, 'p', {className: 'm-spotlight-focus', text: loc(stage.focus, lang)}),
    h(doc, 'p', {className: 'muted', text: loc(stage.summary, lang)})
  );

  // Featured Zombies Icons Row
  const threatRow = h(doc, 'div', {className: 'm-threat-row', 'data-testid': 'stage-enemies'});
  threatRow.append(h(doc, 'span', {className: 'm-threat-lbl', text: tr(api, lang, 'featuredEnemies')}));
  const threatPills = h(doc, 'div', {className: 'm-threat-pills'});
  for (const kind of stage.enemies) {
    const enemySpec = ENEMIES[kind];
    if (!enemySpec) continue;
    threatPills.append(h(doc, 'span', {className: `m-threat-chip${kind === 'boss' ? ' is-boss' : ''}`}, [
      catalogIcon(doc, kind),
      h(doc, 'span', {text: loc(enemySpec.name, lang)})
    ]));
  }
  threatRow.append(threatPills);
  preview.append(threatRow);

  // Stage Selector: Compact 1-20 Strip OR Expanded 5x4 All-20 Grid
  let stagePicker;
  if (local.showStageGrid) {
    stagePicker = h(doc, 'div', {className: 'm-stage-grid', role: 'listbox', 'aria-label': tr(api, lang, 'allStages'), 'data-testid': 'stage-grid'});
    for (const id of STAGE_ORDER) {
      const s = STAGES[id];
      const sUnlocked = isStageUnlocked(profile, id);
      const sRec = stageClearRecord(profile, id);
      const isSel = s.stage === stageNum;
      const isFrontier = s.stage === unlockedMax && sRec.clears === 0;
      const cell = btn(ctx, {
        testid: `stage-cell-${s.stage}`,
        className: `m-stage-cell${isSel ? ' is-active' : ''}${s.boss ? ' is-boss' : ''}${!sUnlocked ? ' is-locked' : ''}${isFrontier ? ' is-frontier' : ''}`,
        pressed: isSel,
        'data-stage': String(s.stage)
      }, [
        h(doc, 'strong', {className: 'm-stage-num', text: String(s.stage)}),
        h(doc, 'span', {
          className: 'm-stage-cell-meta',
          text: !sUnlocked ? '🔒' : (sRec.stars > 0 ? '★'.repeat(sRec.stars) : (s.boss ? 'BOSS' : 'NEW'))
        })
      ]);
      cell.addEventListener('click', () => {
        local.stageNum = s.stage;
        ctx.rerender();
      });
      stagePicker.append(cell);
    }
  } else {
    stagePicker = h(doc, 'div', {className: 'm-stage-strip', role: 'listbox', 'aria-label': tr(api, lang, 'allStages'), 'data-testid': 'stage-strip'});
    for (const id of STAGE_ORDER) {
      const s = STAGES[id];
      const sUnlocked = isStageUnlocked(profile, id);
      const sRec = stageClearRecord(profile, id);
      const isSel = s.stage === stageNum;
      const isFrontier = s.stage === unlockedMax && sRec.clears === 0;
      const pill = btn(ctx, {
        testid: `stage-pill-${s.stage}`,
        className: `m-stage-pill${isSel ? ' is-active' : ''}${s.boss ? ' is-boss' : ''}${!sUnlocked ? ' is-locked' : ''}${isFrontier ? ' is-frontier' : ''}`,
        pressed: isSel,
        'data-stage': String(s.stage)
      }, [
        h(doc, 'strong', {className: 'm-stage-num', text: String(s.stage)}),
        h(doc, 'span', {
          className: 'm-stage-cell-meta',
          text: !sUnlocked ? '🔒' : (sRec.stars > 0 ? '★'.repeat(sRec.stars) : (s.boss ? '👑' : '●'))
        })
      ]);
      pill.addEventListener('click', () => {
        local.stageNum = s.stage;
        ctx.rerender();
      });
      stagePicker.append(pill);
    }
  }

  // Big Thumb-Zone Primary Deploy CTA
  const startBtn = btn(ctx, {
    action: 'start',
    testid: 'btn-start',
    primary: unlocked,
    disabled: !unlocked,
    className: `m-cta-btn${!unlocked ? ' is-locked' : ''}`,
    label: unlocked
      ? tr(api, lang, 'playStage', {n: stageNum})
      : `🔒 ${tr(api, lang, 'stageLocked', {prev: stageNum - 1})}`
  });
  if (unlocked) {
    startBtn.addEventListener('click', () => {
      act(ctx, 'start', {difficulty: 'normal', expedition: stageId});
    });
  }

  deployCard.append(progHead, switcher, preview, stagePicker, startBtn);
  stack.append(deployCard);

  // Equipped Gems Quick Preview Strip (tap jumps straight to Armory!)
  const equippedGems = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped : [];
  const gemStrip = h(doc, 'button', {type: 'button', className: 'm-loadout-strip', 'data-testid': 'menu-loadout-strip'});
  gemStrip.append(
    h(doc, 'span', {className: 'm-loadout-title', text: `${tr(api, lang, 'gems')} ${equippedGems.length}/${GEM_SLOTS}`}),
    h(doc, 'span', {
      className: 'm-loadout-pills',
      text: equippedGems.length
        ? equippedGems.map((id) => loc(GEMS[id]?.name, lang) || id).join(' · ')
        : (lang === 'zh' ? '前往军械库镶嵌核心宝石 ›' : 'Open Armory to equip Core Gems ›')
    })
  );
  gemStrip.addEventListener('click', () => act(ctx, 'screen', {name: 'armory'}));
  stack.append(gemStrip);

  root.append(stack);
}

// =========================================================================
// 2. TABBED ARMORY (GEMS / GEAR / PERMANENT UPGRADES)
// =========================================================================
function renderArmory(ctx, root) {
  const {doc, api, lang, profile} = ctx;
  const bonuses = getProfileBonuses(profile);
  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-armory'});

  const starter = starterPackCard(ctx);
  if (starter) stack.append(starter);

  // Compact 4-tile Bonus Summary
  const summary = h(doc, 'section', {className: 'm-bonus-bar', 'data-testid': 'profile-bonuses'});
  const metrics = [
    ['bonus-damage', tr(api, lang, 'damage'), `+${Math.round((bonuses.damage || 0) * 100)}%`],
    ['bonus-haste', lang === 'zh' ? '攻速' : 'Speed', `+${Math.round((bonuses.haste || 0) * 100)}%`],
    ['bonus-fence', tr(api, lang, 'fence'), `+${Math.round(bonuses.fence || 0)}`],
    ['bonus-sw', lang === 'zh' ? '超武冷却' : 'Arsenal', bonuses.superweaponHaste > 0 ? `-${Math.round(bonuses.superweaponHaste * 100)}%` : '0%'],
  ];
  for (const [testid, label, val] of metrics) {
    summary.append(h(doc, 'div', {className: 'm-bonus-tile', 'data-testid': testid}, [
      h(doc, 'span', {className: 'm-bonus-k', text: label}),
      h(doc, 'strong', {className: 'm-bonus-v', text: val})
    ]));
  }
  stack.append(summary);

  // 3-Tab Segmented Switcher
  const tabs = h(doc, 'div', {className: 'm-seg-tabs', role: 'tablist', 'data-testid': 'armory-tabs'});
  for (const [id, key] of [['gems', 'armoryTabGems'], ['gear', 'armoryTabGear'], ['upgrades', 'armoryTabUpgrades']]) {
    const active = local.armoryTab === id;
    const tBtn = btn(ctx, {
      testid: `armory-tab-${id}`,
      className: `m-seg-tab${active ? ' is-active' : ''}`,
      label: tr(api, lang, key),
      role: 'tab',
      'aria-selected': active ? 'true' : 'false'
    });
    tBtn.addEventListener('click', () => { local.armoryTab = id; ctx.rerender(); });
    tabs.append(tBtn);
  }
  stack.append(tabs);

  if (local.armoryTab === 'gear') renderArmoryGear(ctx, stack);
  else if (local.armoryTab === 'upgrades') renderArmoryUpgrades(ctx, stack);
  else renderArmoryGems(ctx, stack);

  root.append(stack);
}

function renderArmoryGems(ctx, host) {
  const {doc, api, lang, profile} = ctx;
  const ownedList = Array.isArray(profile.gemsOwned) ? profile.gemsOwned : [];
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped : [];

  const section = h(doc, 'section', {className: 'm-stack', 'data-testid': 'armory-gems'});

  // Interactive 3-Socket Bar
  const sockets = h(doc, 'div', {className: 'm-gem-sockets', 'data-testid': 'gem-sockets'});
  for (let i = 0; i < GEM_SLOTS; i++) {
    const gemId = equipped[i] || null;
    const gem = gemId ? GEMS[gemId] : null;
    const sock = h(doc, 'button', {
      type: 'button',
      className: `m-gem-socket${gem ? ' is-filled' : ''}`,
      'data-testid': `gem-socket-${i}`,
      disabled: !gem
    }, [
      gem ? catalogIcon(doc, gem.id) : h(doc, 'span', {className: 'm-socket-plus', text: `#${i + 1}`}),
      h(doc, 'span', {className: 'm-socket-name', text: gem ? loc(gem.name, lang) : tr(api, lang, 'gemSlotEmpty')})
    ]);
    if (gem) {
      sock.addEventListener('click', () => act(ctx, 'unequipGem', {id: gem.id}));
    }
    sockets.append(sock);
  }
  section.append(sockets);

  const grid = h(doc, 'div', {className: 'm-grid'});
  for (const id of GEM_ORDER) {
    const gem = GEMS[id];
    if (!gem) continue;
    const owned = ownedList.includes(id);
    const isEq = equipped.includes(id);
    const afford = (profile.currency || 0) >= gem.cost;

    const card = h(doc, 'article', {
      className: `m-item-card${isEq ? ' is-equipped' : ''}`,
      'data-testid': `gem-card-${id}`,
      'data-owned': owned ? 'true' : 'false',
      'data-equipped': isEq ? 'true' : 'false',
    });

    card.append(h(doc, 'div', {className: 'm-item-head'}, [
      catalogIcon(doc, id),
      h(doc, 'div', {className: 'm-item-info'}, [
        h(doc, 'div', {className: 'm-item-title-row'}, [
          h(doc, 'h3', {text: loc(gem.name, lang)}),
          h(doc, 'span', {
            className: `badge ${gem.tier === 'legend' ? 'badge-legend' : 'badge-epic'}`,
            text: tr(api, lang, gem.tier === 'legend' ? 'gemTierLegend' : 'gemTierEpic')
          })
        ]),
        h(doc, 'p', {className: 'm-item-desc', text: loc(gem.description, lang)})
      ])
    ]));

    if (!owned) {
      const buyBtn = btn(ctx, {
        testid: `buy-gem-${id}`,
        action: 'buyGem',
        label: `${tr(api, lang, 'buy')} · ${num(gem.cost, lang)}`,
        primary: afford,
        disabled: !afford,
        className: 'm-full-btn'
      });
      buyBtn.addEventListener('click', () => act(ctx, 'buyGem', {id}));
      card.append(buyBtn);
    } else if (isEq) {
      const uneqBtn = btn(ctx, {
        testid: `unequip-gem-${id}`,
        action: 'unequipGem',
        label: `${tr(api, lang, 'equipped')} · ${tr(api, lang, 'unequip')}`,
        className: 'm-full-btn is-active'
      });
      uneqBtn.addEventListener('click', () => act(ctx, 'unequipGem', {id}));
      card.append(uneqBtn);
    } else {
      const eqBtn = btn(ctx, {
        testid: `equip-gem-${id}`,
        action: 'equipGem',
        label: tr(api, lang, 'equip'),
        primary: true,
        className: 'm-full-btn'
      });
      eqBtn.addEventListener('click', () => act(ctx, 'equipGem', {id}));
      card.append(eqBtn);
    }
    grid.append(card);
  }
  section.append(grid);
  host.append(section);
}

function renderArmoryGear(ctx, host) {
  const {doc, api, lang, profile} = ctx;
  const ownedList = Array.isArray(profile.equipmentOwned) ? profile.equipmentOwned : [];
  const equippedMap = profile.equipped || {};

  for (const slotId of SLOT_ORDER) {
    const items = Object.values(EQUIPMENT).filter((item) => item.slot === slotId);
    const block = h(doc, 'section', {className: 'm-stack', 'data-testid': `armory-slot-${slotId}`});
    block.append(h(doc, 'h3', {className: 'm-section-h', text: tr(api, lang, slotId)}));
    const grid = h(doc, 'div', {className: 'm-grid'});
    for (const item of items) {
      const owned = ownedList.includes(item.id);
      const isEq = equippedMap[slotId] === item.id;
      const afford = (profile.currency || 0) >= item.cost;
      const card = h(doc, 'article', {
        className: `m-item-card${isEq ? ' is-equipped' : ''}`,
        'data-testid': `equipment-${item.id}`
      });
      card.append(h(doc, 'div', {className: 'm-item-head'}, [
        catalogIcon(doc, item.id),
        h(doc, 'div', {className: 'm-item-info'}, [
          h(doc, 'h3', {text: loc(item.name, lang)}),
          h(doc, 'p', {className: 'm-item-desc', text: loc(item.description, lang)})
        ])
      ]));
      if (!owned) {
        const buyBtn = btn(ctx, {
          testid: `buy-${item.id}`,
          action: 'buyEquipment',
          label: `${tr(api, lang, 'buy')} · ${num(item.cost, lang)}`,
          primary: afford,
          disabled: !afford,
          className: 'm-full-btn'
        });
        buyBtn.addEventListener('click', () => act(ctx, 'buyEquipment', {id: item.id}));
        card.append(buyBtn);
      } else if (isEq) {
        card.append(btn(ctx, {label: tr(api, lang, 'equipped'), disabled: true, className: 'm-full-btn is-active'}));
      } else {
        const eqBtn = btn(ctx, {
          testid: `equip-${item.id}`,
          action: 'equip',
          label: tr(api, lang, 'equip'),
          primary: true,
          className: 'm-full-btn'
        });
        eqBtn.addEventListener('click', () => act(ctx, 'equip', {id: item.id}));
        card.append(eqBtn);
      }
      grid.append(card);
    }
    block.append(grid);
    host.append(block);
  }
}

function renderArmoryUpgrades(ctx, host) {
  const {doc, api, lang, profile} = ctx;
  const grid = h(doc, 'div', {className: 'm-grid', 'data-testid': 'armory-upgrades'});
  for (const id of PERMANENT_ORDER) {
    const spec = PERMANENT_UPGRADES[id];
    if (!spec) continue;
    const level = Math.max(0, Math.min(spec.cap, Number(profile.permanent?.[id]) || 0));
    const maxed = level >= spec.cap;
    const cost = maxed ? 0 : spec.costs[level];
    const afford = !maxed && (profile.currency || 0) >= cost;

    const card = h(doc, 'article', {className: 'm-item-card', 'data-testid': `permanent-${id}`});
    const pips = h(doc, 'div', {className: 'm-pips', 'aria-label': `${level}/${spec.cap}`});
    for (let i = 0; i < spec.cap; i++) {
      pips.append(h(doc, 'span', {className: `m-pip${i < level ? ' is-lit' : ''}`}));
    }

    card.append(h(doc, 'div', {className: 'm-item-head'}, [
      catalogIcon(doc, id),
      h(doc, 'div', {className: 'm-item-info'}, [
        h(doc, 'div', {className: 'm-item-title-row'}, [
          h(doc, 'h3', {text: loc(spec.name, lang)}),
          h(doc, 'span', {className: 'badge', text: `Lv.${level}/${spec.cap}`})
        ]),
        pips,
        h(doc, 'p', {className: 'm-item-desc', text: loc(spec.description, lang)})
      ])
    ]));

    const upBtn = btn(ctx, {
      testid: `upgrade-${id}`,
      action: 'upgradePermanent',
      label: maxed ? tr(api, lang, 'maxed') : `${tr(api, lang, 'upgrade')} · ${num(cost, lang)}`,
      primary: afford,
      disabled: maxed || !afford,
      className: 'm-full-btn'
    });
    if (!maxed) upBtn.addEventListener('click', () => act(ctx, 'upgradePermanent', {id}));
    card.append(upBtn);
    grid.append(card);
  }
  host.append(grid);
}

// =========================================================================
// 3. CLEAN 3-TAB CODEX (TURRETS / HERO & SUPER-WEAPONS / ENEMIES)
// =========================================================================
function renderCodex(ctx, root) {
  const {doc, api, lang} = ctx;
  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-codex'});

  const tabs = h(doc, 'div', {className: 'm-seg-tabs', role: 'tablist', 'data-testid': 'codex-tabs'});
  for (const [id, label] of [
    ['towers', tr(api, lang, 'towers')],
    ['hero', lang === 'zh' ? '英雄与超武' : 'Hero & Arsenal'],
    ['enemies', tr(api, lang, 'enemies')]
  ]) {
    const active = local.codexTab === id;
    const tBtn = btn(ctx, {
      testid: `codex-tab-${id}`,
      className: `m-seg-tab${active ? ' is-active' : ''}`,
      label,
      role: 'tab',
      'aria-selected': active ? 'true' : 'false'
    });
    tBtn.addEventListener('click', () => { local.codexTab = id; ctx.rerender(); });
    tabs.append(tBtn);
  }
  stack.append(tabs);

  const grid = h(doc, 'div', {className: 'm-grid'});
  if (local.codexTab === 'hero') {
    for (const [id, spec] of Object.entries(HERO_UPGRADES)) {
      const isSuper = SUPERWEAPON_IDS.has(id);
      const card = h(doc, 'article', {className: `m-item-card${isSuper ? ' is-super-card' : ''}`, 'data-testid': `codex-hero-${id}`});
      card.append(h(doc, 'div', {className: 'm-item-head'}, [
        catalogIcon(doc, id),
        h(doc, 'div', {className: 'm-item-info'}, [
          h(doc, 'div', {className: 'm-item-title-row'}, [
            h(doc, 'h3', {text: loc(spec.name, lang)}),
            h(doc, 'span', {
              className: `badge ${isSuper ? 'badge-legend' : ''}`,
              text: `${isSuper ? tr(api, lang, 'tagSuperweapon') : tr(api, lang, 'tagHero')} · Max ${spec.cap}`
            })
          ]),
          h(doc, 'p', {className: 'm-item-desc', text: loc(spec.description, lang).replace(/^(Hero · |英雄 · )/, '')})
        ])
      ]));
      grid.append(card);
    }
  } else if (local.codexTab === 'enemies') {
    for (const [id, spec] of Object.entries(ENEMIES)) {
      const card = h(doc, 'article', {className: 'm-item-card', 'data-testid': `codex-enemy-${id}`});
      card.append(h(doc, 'div', {className: 'm-item-head'}, [
        catalogIcon(doc, id),
        h(doc, 'div', {className: 'm-item-info'}, [
          h(doc, 'div', {className: 'm-item-title-row'}, [
            h(doc, 'h3', {text: loc(spec.name, lang)}),
            h(doc, 'span', {className: 'badge', text: `HP ${num(spec.hp, lang)} · DMG ${num(spec.damage, lang)}`})
          ]),
          h(doc, 'p', {className: 'm-item-desc', text: loc(spec.description, lang)})
        ])
      ]));
      grid.append(card);
    }
  } else {
    for (const [id, spec] of Object.entries(TOWERS)) {
      const rate = spec.stats.interval > 0 ? Math.round((1 / spec.stats.interval) * 10) / 10 : 0;
      const card = h(doc, 'article', {className: 'm-item-card', 'data-testid': `codex-tower-${id}`});
      card.append(h(doc, 'div', {className: 'm-item-head'}, [
        catalogIcon(doc, id),
        h(doc, 'div', {className: 'm-item-info'}, [
          h(doc, 'div', {className: 'm-item-title-row'}, [
            h(doc, 'h3', {text: loc(spec.name, lang)}),
            h(doc, 'span', {className: 'badge', text: loc(spec.role, lang)})
          ]),
          h(doc, 'p', {className: 'm-item-desc', text: loc(spec.description, lang)}),
          h(doc, 'p', {className: 'm-mini-stats', text: `${tr(api, lang, 'damage')} ${spec.stats.damage} · ${rate}/s · ${tr(api, lang, 'range')} ${spec.stats.range}`})
        ])
      ]));
      grid.append(card);
    }
  }
  stack.append(grid);
  stack.append(h(doc, 'p', {className: 'muted m-footnote', text: tr(api, lang, 'codexRankNote')}));
  root.append(stack);
}

// =========================================================================
// 4. SETTINGS + QUICK PLAY GUIDE + SAVE BACKUP
// =========================================================================
function renderSettings(ctx, root) {
  const {doc, api, lang, profile} = ctx;
  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-settings'});

  const prefs = h(doc, 'section', {className: 'm-card m-prefs'});
  prefs.append(h(doc, 'h2', {text: tr(api, lang, 'settings')}));

  // Language row
  const langRow = h(doc, 'div', {className: 'm-pref-row', 'data-testid': 'settings-language'}, [
    h(doc, 'span', {text: tr(api, lang, 'language')}),
    h(doc, 'div', {className: 'm-row-inline'}, [
      (() => {
        const b = btn(ctx, {testid: 'lang-zh', label: '中文', active: lang === 'zh', pressed: lang === 'zh'});
        b.addEventListener('click', () => act(ctx, 'language', {value: 'zh'}));
        return b;
      })(),
      (() => {
        const b = btn(ctx, {testid: 'lang-en', label: 'EN', active: lang === 'en', pressed: lang === 'en'});
        b.addEventListener('click', () => act(ctx, 'language', {value: 'en'}));
        return b;
      })(),
    ])
  ]);

  // Sound row
  const soundOn = profile.settings?.sound === true;
  const soundBtn = btn(ctx, {
    testid: 'settings-btn-sound',
    label: soundOn ? tr(api, lang, 'on') : tr(api, lang, 'off'),
    active: soundOn,
    pressed: soundOn
  });
  soundBtn.addEventListener('click', () => act(ctx, 'sound'));
  const soundRow = h(doc, 'div', {className: 'm-pref-row', 'data-testid': 'settings-sound'}, [
    h(doc, 'span', {text: tr(api, lang, 'sound')}),
    soundBtn
  ]);

  // Motion row
  const reduced = profile.settings?.reducedMotion === true;
  const motionBtn = btn(ctx, {
    testid: 'btn-reduced-motion',
    label: reduced ? tr(api, lang, 'on') : tr(api, lang, 'off'),
    active: reduced,
    pressed: reduced
  });
  motionBtn.addEventListener('click', () => act(ctx, 'reducedMotion', {value: !reduced}));
  const motionRow = h(doc, 'div', {className: 'm-pref-row', 'data-testid': 'settings-motion'}, [
    h(doc, 'span', {text: tr(api, lang, 'reducedMotion')}),
    motionBtn
  ]);

  prefs.append(langRow, soundRow, motionRow);
  stack.append(prefs);

  // Streamlined 4-beat Quick Guide
  const guide = h(doc, 'section', {className: 'm-card m-guide', 'data-testid': 'howto-guide'});
  guide.append(
    h(doc, 'h3', {text: tr(api, lang, 'howto')}),
    h(doc, 'p', {className: 'muted', text: tr(api, lang, 'howtoLead')})
  );
  const steps = h(doc, 'ol', {className: 'm-guide-list'});
  for (const key of ['helpOverview', 'helpDraft', 'helpPlacement', 'helpRange', 'helpFence']) {
    steps.append(h(doc, 'li', {text: tr(api, lang, key)}));
  }
  guide.append(steps);
  stack.append(guide);

  // Save Export / Import
  const save = h(doc, 'section', {className: 'm-card m-save', 'data-testid': 'settings-save'});
  save.append(
    h(doc, 'h3', {text: tr(api, lang, 'saveData')}),
    h(doc, 'p', {className: 'muted', text: tr(api, lang, 'saveHelp')})
  );
  const exportBtn = btn(ctx, {testid: 'btn-export', label: tr(api, lang, 'exportSave')});
  exportBtn.addEventListener('click', () => {
    const res = act(ctx, 'exportSave');
    if (res?.ok && res.text) {
      local.exportText = res.text;
      setFlash(ctx, 'ok', 'saved', tr(api, lang, 'exportHint'));
    }
  });
  const copyBtn = btn(ctx, {testid: 'btn-copy', label: tr(api, lang, 'copySave'), disabled: !local.exportText});
  copyBtn.addEventListener('click', () => {
    if (local.exportText && globalThis.navigator?.clipboard?.writeText) {
      globalThis.navigator.clipboard.writeText(local.exportText).then(
        () => setFlash(ctx, 'ok', 'copied'),
        () => setFlash(ctx, 'warn', 'copyUnavailable')
      );
    } else {
      setFlash(ctx, 'warn', 'copyUnavailable');
    }
  });
  save.append(h(doc, 'div', {className: 'm-row-2'}, [exportBtn, copyBtn]));

  if (local.exportText) {
    save.append(h(doc, 'textarea', {
      'data-testid': 'export-text',
      readonly: 'true',
      rows: '3',
      value: local.exportText
    }));
  }

  const importArea = h(doc, 'textarea', {
    'data-testid': 'import-text',
    rows: '3',
    placeholder: tr(api, lang, 'pasteHere'),
    value: local.importText
  });
  importArea.addEventListener('input', (e) => { local.importText = e.target.value; });
  const importBtn = btn(ctx, {testid: 'btn-import', label: tr(api, lang, 'importSave'), className: 'm-full-btn'});
  importBtn.addEventListener('click', () => {
    const raw = importArea.value.trim();
    if (!raw) { setFlash(ctx, 'warn', 'importEmpty'); return; }
    const res = act(ctx, 'importSave', {text: raw});
    if (res?.ok) {
      local.importText = '';
      setFlash(ctx, 'ok', 'saved', res.notice ? tr(api, lang, res.notice) : tr(api, lang, 'saved'));
    } else {
      setFlash(ctx, 'warn', res?.reason || 'invalidSave');
    }
  });
  save.append(importArea, importBtn);
  stack.append(save);
  stack.append(h(doc, 'p', {className: 'muted m-footnote', text: `Fencefall v4 · Contract ${CONTRACT_VERSION}`}));
  root.append(stack);
}

// =========================================================================
// 5. RESULTS OVERLAY SCREEN (Stars + First-Clear Bonus + 1-Tap Next Stage)
// =========================================================================
function renderResults(ctx, root) {
  const {doc, api, lang, run, profile} = ctx;
  const settlement = run?.settlement || null;
  const outcome = settlement?.result || (run?.phase === 'victory' || run?.phase === 'defeat' ? run.phase : 'defeat');
  const isWin = outcome === 'victory';
  const curStageNum = stageNumber(run?.expedition);
  const nextId = isWin ? nextStageId(run?.expedition) : null;
  const nextNum = nextId ? stageNumber(nextId) : 0;
  const earnedStars = isWin
    ? (Number.isFinite(settlement?.stars) ? settlement.stars : (run?.fence?.hp >= run?.fence?.maxHp * 0.999 ? 3 : run?.fence?.hp >= run?.fence?.maxHp * 0.5 ? 2 : 1))
    : 0;
  const firstBonus = Number.isFinite(settlement?.firstClearBonus) ? settlement.firstClearBonus : 0;

  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-results'});
  const hero = h(doc, 'section', {className: `m-card m-result-hero${isWin ? ' is-victory' : ' is-defeat'}`});
  hero.append(
    h(doc, 'span', {className: 'm-eyebrow', text: loc(EXPEDITIONS[run?.expedition]?.name, lang) || tr(api, lang, 'title')}),
    h(doc, 'h2', {'data-testid': 'result-outcome', text: isWin ? tr(api, lang, 'victory') : tr(api, lang, 'defeat')}),
    isWin ? starRow(doc, earnedStars, 3, 'm-stars m-result-stars') : null,
    isWin && curStageNum === TOTAL_STAGES
      ? h(doc, 'span', {className: 'badge m-bonus-badge', text: tr(api, lang, 'campaignCleared')})
      : null,
    settlement && Number.isFinite(settlement.currency)
      ? h(doc, 'div', {className: 'm-result-payout', 'data-testid': 'result-currency'}, [
          navIcon(doc, 'coin', 20),
          h(doc, 'strong', {text: `+${num(settlement.currency, lang)}`}),
          h(doc, 'span', {text: tr(api, lang, 'currency')}),
          firstBonus > 0
            ? h(doc, 'span', {className: 'badge m-bonus-badge', text: tr(api, lang, 'firstClearBonus', {amount: firstBonus})})
            : null
        ])
      : null
  );

  const tiles = h(doc, 'div', {className: 'm-stat-grid'});
  const rows = [
    [tr(api, lang, 'wave'), num(settlement?.wave ?? run?.wave ?? 0, lang)],
    [tr(api, lang, 'kills'), num(settlement?.kills ?? run?.kills ?? 0, lang)],
    [tr(api, lang, 'time'), formatDuration(settlement?.time ?? run?.time ?? 0, lang)],
    [tr(api, lang, 'damage'), num(Math.round(run?.stats?.damage || 0), lang)],
  ];
  for (const [k, v] of rows) {
    tiles.append(h(doc, 'div', {className: 'm-bonus-tile'}, [
      h(doc, 'span', {className: 'm-bonus-k', text: k}),
      h(doc, 'strong', {className: 'm-bonus-v', text: v})
    ]));
  }
  hero.append(tiles);

  if (!isWin) {
    const next = nextArmoryBuy(profile);
    if (next) {
      const tip = next.affordable
        ? (lang === 'zh' ? `建议升级：前往军械库解锁【${loc(next.name, lang)}】` : `Tip: Unlock ${loc(next.name, lang)} in the Armory!`)
        : (lang === 'zh' ? `再赚 ${next.short} 币即可在军械库解锁【${loc(next.name, lang)}】` : `${next.short} more coins for ${loc(next.name, lang)} in the Armory.`);
      hero.append(h(doc, 'p', {className: 'm-result-tip', 'data-testid': 'result-armory-tip', text: tip}));
    }
  }

  const actions = h(doc, 'div', {className: 'm-stack'});
  if (isWin && nextId) {
    const nextStageBtn = btn(ctx, {
      action: 'start',
      testid: 'btn-next-stage',
      label: tr(api, lang, 'nextStageBtn', {n: nextNum}),
      primary: true,
      className: 'm-cta-btn'
    });
    nextStageBtn.addEventListener('click', () => {
      local.stageNum = nextNum;
      act(ctx, 'start', {difficulty: 'normal', expedition: nextId});
    });
    actions.append(nextStageBtn);

    const replayBtn = btn(ctx, {
      action: 'restart',
      testid: 'btn-replay',
      label: curStageNum > 0 ? tr(api, lang, 'retryStage', {n: curStageNum}) : tr(api, lang, 'restart'),
      className: 'm-full-btn'
    });
    replayBtn.addEventListener('click', () => act(ctx, 'restart'));
    actions.append(replayBtn);
  } else {
    const replayBtn = btn(ctx, {
      action: 'restart',
      testid: 'btn-replay',
      label: curStageNum > 0 ? tr(api, lang, 'retryStage', {n: curStageNum}) : tr(api, lang, 'restart'),
      primary: true,
      className: 'm-cta-btn'
    });
    replayBtn.addEventListener('click', () => act(ctx, 'restart'));
    actions.append(replayBtn);
  }

  if (isWin && run?.phase === 'victory' && !run.endless) {
    const endlessBtn = btn(ctx, {action: 'endless', testid: 'btn-endless', label: tr(api, lang, 'endlessEnter'), className: 'm-full-btn'});
    endlessBtn.addEventListener('click', () => act(ctx, 'endless'));
    actions.append(endlessBtn);
  }

  const row = h(doc, 'div', {className: 'm-row-2'});
  const armoryBtn = btn(ctx, {testid: 'btn-results-armory', label: tr(api, lang, 'armory')});
  armoryBtn.addEventListener('click', () => act(ctx, 'screen', {name: 'armory'}));
  const menuBtn = btn(ctx, {testid: 'btn-results-menu', label: tr(api, lang, 'tabBattle')});
  menuBtn.addEventListener('click', () => {
    if (isWin && nextNum > 0) local.stageNum = nextNum;
    act(ctx, 'screen', {name: 'menu'});
  });
  row.append(armoryBtn, menuBtn);
  actions.append(row);

  hero.append(actions);
  stack.append(hero);
  root.append(stack);
}

// =========================================================================
// ENTRYPOINT
// =========================================================================
export function renderMetaPanel(container, screen, state, profile, api) {
  if (!container || typeof container.appendChild !== 'function') return;
  const doc = container.ownerDocument || globalThis.document;
  if (!doc?.createElement) return;

  const view = SCREENS.includes(screen) ? screen : 'menu';
  if (view === 'battle') {
    container.replaceChildren();
    return;
  }
  if (local.screen !== view) {
    local.confirmAbandon = false;
    local.flash = null;
    local.screen = view;
  }

  const safeProfile = profile && typeof profile === 'object'
    ? profile
    : {currency: 0, equipmentOwned: [], equipped: {}, permanent: {}, gemsOwned: [], gemsEquipped: [], settings: {language: 'en'}};
  const lang = safeProfile.settings?.language === 'zh' ? 'zh' : 'en';
  const ctx = {
    doc,
    api,
    lang,
    run: state && typeof state === 'object' ? state : null,
    profile: safeProfile,
    screen: view,
    rerender: () => renderMetaPanel(container, view, api?.getState?.() ?? state, api?.getProfile?.() ?? safeProfile, api)
  };

  const root = h(doc, 'div', {
    className: `meta-page${safeProfile.settings?.reducedMotion ? ' is-reduced' : ''}`,
    lang: lang === 'zh' ? 'zh-CN' : 'en',
    'data-testid': 'meta-panel',
    'data-screen': view,
    'data-lang': lang
  });

  if (local.flash) {
    root.append(h(doc, 'div', {
      className: `m-flash is-${local.flash.kind || 'ok'}`,
      'data-testid': 'meta-flash',
      text: local.flash.text
    }));
  }

  if (view === 'armory') renderArmory(ctx, root);
  else if (view === 'codex') renderCodex(ctx, root);
  else if (view === 'settings' || view === 'howto') renderSettings(ctx, root);
  else if (view === 'results') renderResults(ctx, root);
  else renderMenu(ctx, root);

  container.replaceChildren(root);
}
