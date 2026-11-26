/**
 * Fencefall meta screens: menu, armory, codex, settings, howto, and results.
 * Renders catalogs and profile/run data. Every control calls api.act.
 * Never mutates the run or profile.
 *
 * Permanent prices read cost as a finite number, an array (or costs) indexed by
 * the current level, or a function (level, profile). Bonus fractions are
 * damage, haste, critChance, and reward; range and fence are flat amounts.
 */
import {localize, formatNumber, resultLabel, resultStory, defeatAdvice, armoryNextLine} from '../i18n.js';
import {EQUIPMENT, PERMANENT_UPGRADES, getProfileBonuses, nextArmoryBuy} from '../systems/progression.js';
import {TOWERS} from '../data/towers.js';
import {RECIPES} from '../data/recipes.js';
import {HERO_UPGRADES} from '../systems/hero.js';
import {ENEMIES} from '../data/enemies.js';
import {EXPEDITIONS, EXPEDITION_ORDER} from '../data/expeditions.js';
import {catalogIcon} from './icons.js';
import {BASE_TYPES, CONTRACT_VERSION, DIFFICULTIES, clone} from '../shared.js';

const STYLE_ID = 'fencefall-meta-panel-styles';
const SCREENS = new Set(['menu', 'armory', 'codex', 'settings', 'howto', 'results']);
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];
const ENEMY_ORDER = ['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss', 'leaper', 'splitter', 'mender', 'shade', 'banner', 'warden', 'charge', 'hush'];
const PERMANENT_ORDER = ['damage', 'haste', 'vitality'];
const SLOT_ORDER = ['weapon', 'charm', 'armor'];
const FRACTION_KEYS = new Set(['damage', 'haste', 'critChance', 'crit', 'reward']);
const PIXEL_KEYS = new Set(['range']);
const FLAT_KEYS = new Set(['fence', 'vitality']);

const local = {
  difficulty: null,
  expedition: null,
  seed: '',
  confirmAbandon: false,
  confirmStart: false,
  importText: '',
  exportText: '',
  codexTab: 'towers',
  flash: null,
  focus: null,
  screen: null,
  endlessDismissed: null
};

const META_CSS = `
.meta-panel{min-width:0;max-width:100%;min-height:0;overflow:auto;color:#f1eee2;padding:8px 8px calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px;-webkit-overflow-scrolling:touch}
.meta-panel *{box-sizing:border-box}
.meta-panel h1,.meta-panel h2,.meta-panel h3,.meta-panel p{overflow-wrap:anywhere}
.meta-panel h1,.meta-panel h2,.meta-panel h3{margin:0;line-height:1.25;font-weight:700}
.meta-panel h1{font-size:1.85rem;letter-spacing:.04em}
.meta-panel h2{font-size:1.25rem}
.meta-panel h3{font-size:1.02rem}
.meta-panel p{margin:0}
.meta-brand{display:flex;flex-direction:column;gap:2px;padding-bottom:4px;border-bottom:3px solid #9b7951}
.meta-brand-zh,.meta-gold{color:#f0cb72}
.meta-panel .muted{color:#a5b8be}
.meta-panel .badge{display:inline-flex;align-items:center;min-height:28px;padding:2px 8px;border-radius:999px;background:#2a4038;color:#f0cb72;font-size:.82rem;line-height:1.3}
.meta-panel .panel,.meta-panel .card{min-width:0}
.meta-panel .card{background:#162329;border:1px solid #2c454c;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
.meta-panel .grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.meta-panel .grid.meta-sorties{grid-template-columns:1fr 1fr;gap:8px}
.meta-panel .btn{min-height:44px;min-width:44px;padding:10px 12px;border-radius:10px;border:1px solid #3d5a54;background:#1a2c32;color:#f1eee2;font:inherit;line-height:1.25;text-align:center;cursor:pointer;overflow-wrap:anywhere;white-space:normal}
.meta-panel .btn-primary{background:#2a6848;border-color:#8dcaa8;color:#f4fff8;font-weight:700}
.meta-panel .btn[disabled]{opacity:.55;cursor:not-allowed}
.meta-panel .btn[aria-pressed="true"]{border-color:#f0cb72;box-shadow:inset 0 0 0 1px #f0cb72}
.meta-panel .btn:focus-visible,.meta-panel input:focus-visible,.meta-panel textarea:focus-visible{outline:2px solid #f0cb72;outline-offset:2px}
@media (hover:hover){.meta-panel .btn:hover:not(:disabled){border-color:#d3b984}}
.meta-actions,.meta-stack{display:flex;flex-direction:column;gap:8px}
.meta-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.meta-pagehead{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.meta-pagehead .btn{flex:0 0 auto}
.meta-pagehead h2{flex:1 1 140px}
.meta-panel .meta-actions>.btn,.meta-panel .meta-nav .btn,.meta-panel .meta-choice{width:100%}
.meta-panel .meta-nav{grid-template-columns:1fr 1fr}
.meta-choice{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.meta-line{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;min-width:0}
.meta-line>span:last-child{font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.meta-note,.meta-warn{border-radius:10px;padding:10px 12px}
.meta-note{background:#24362a;border:1px solid #3f6b45}
.meta-warn{background:#3a2a22;border:1px solid #8a5a3a}
.meta-panel label{display:flex;flex-direction:column;gap:4px;min-width:0}
.meta-panel input,.meta-panel textarea{width:100%;min-height:44px;padding:8px 10px;border-radius:10px;border:1px solid #3d5a54;background:#0e171c;color:#f1eee2;font:inherit}
.meta-panel textarea{min-height:128px;resize:vertical}
.meta-badges{display:flex;flex-wrap:wrap;gap:6px}
.catalog-head{display:flex;align-items:flex-start;gap:10px;min-width:0;min-height:44px}
.catalog-icon{width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;display:block}
.catalog-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 auto}
.catalog-desc{min-width:0;color:#f1eee2}
.meta-board{display:flex;flex-direction:column;gap:6px}
.meta-beats{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;counter-reset:beat}
.meta-beats li{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;padding:8px 12px;border-radius:10px;background:#24362a;border:1px solid #3f6b45}
.meta-beats li::before{counter-increment:beat;content:counter(beat);flex:0 0 28px;width:28px;height:28px;border-radius:999px;background:#2a4038;color:#f0cb72;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.meta-fence{min-height:28px;border-radius:6px;background:#9b7951;color:#1a120c;font-weight:700;display:flex;align-items:center;justify-content:center}
.meta-slotrow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.meta-slot{min-height:44px;border:1px solid #687c80;background:#223743;border-radius:8px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:.75rem;padding:2px}
.meta-slot-hero{background:#5c4a28;border-color:#f0cb72;color:#f0cb72;font-weight:700}
.meta-mini{font-size:.92rem}
@media (max-width:340px){.meta-panel .meta-nav{grid-template-columns:minmax(0,1fr)}}
@media (min-width:400px){.meta-panel .meta-diffs{grid-template-columns:1fr 1fr}}
@media (min-width:560px){.meta-panel .meta-cards{grid-template-columns:1fr 1fr}}
.meta-reduced,.meta-reduced *{scroll-behavior:auto!important;transition:none!important;animation:none!important}
`;

export function renderMetaPanel(container, screen, state, profile, api) {
  if (!container || typeof container.appendChild !== 'function') return;
  const doc = container.ownerDocument || globalThis.document;
  if (!doc?.createElement) return;
  ensureStyles(doc);
  captureFocus(container);

  const view = screenName(screen);
  const lang = languageOf(profile);
  const ui = readUI(api);
  const run = state && typeof state === 'object' ? state : null;
  const viewed = viewProfile(profile, lang);
  const ctx = {
    doc,
    api,
    lang,
    ui,
    run,
    profile: viewed,
    rawProfile: profile && typeof profile === 'object' ? profile : null,
    screen: view,
    rerender: () => renderMetaPanel(container, screen, state, profile, api)
  };

  if (view === 'battle') {
    local.focus = null;
    container.replaceChildren();
    return;
  }
  if (local.screen !== view) {
    local.confirmAbandon = false;
    local.confirmStart = false;
    local.screen = view;
  }

  const root = h(doc, 'div', {
    className: `meta-panel panel${viewed.settings.reducedMotion ? ' meta-reduced' : ''}`,
    lang: lang === 'zh' ? 'zh' : 'en',
    'data-testid': 'meta-panel',
    'data-screen': view,
    'data-lang': lang
  });
  appendFlash(ctx, root);

  if (view === 'armory') renderArmory(ctx, root);
  else if (view === 'codex') renderCodex(ctx, root);
  else if (view === 'settings') renderSettings(ctx, root);
  else if (view === 'howto') renderHowto(ctx, root);
  else if (view === 'results') renderResults(ctx, root);
  else renderMenu(ctx, root);

  container.replaceChildren(root);
  restoreFocus(root);
}

function renderMenu(ctx, root) {
  const {doc, api, lang, run, profile} = ctx;
  const live = runIsLive(run);
  const finished = runIsFinished(run);
  root.append(brand(ctx, true));
  root.append(h(doc, 'div', {'data-testid': 'meta-menu', className: 'meta-stack'}));
  const body = root.lastChild;

  if (run?.hiddenPaused) body.append(note(ctx, t(api, 'pausedHidden'), 'meta-warn'));
  if (run?.phase === 'draft') body.append(note(ctx, t(api, 'chooseOneOfThree'), 'meta-note'));
  else if (run?.phase === 'placing') body.append(note(ctx, t(api, 'chooseSlot'), 'meta-note'));
  if (live && run.paused) body.append(note(ctx, tx(api, lang, 'paused', 'Paused', '已暂停'), 'meta-note'));



  const actions = h(doc, 'div', {className: 'meta-actions'});
  const continueBtn = button(ctx, {
    action: 'resume',
    testid: 'btn-continue',
    label: t(api, 'continue'),
    primary: live,
    disabled: !live
  });
  if (live) listen(continueBtn, () => goBattle(ctx, 'resume'));
  actions.append(continueBtn);
  if (!live) actions.append(h(doc, 'p', {className: 'muted', text: t(api, 'noSave')}));

  const restartBtn = button(ctx, {
    action: 'restart',
    testid: 'btn-restart',
    label: t(api, 'restart'),
    disabled: !run
  });
  if (run) listen(restartBtn, () => goBattle(ctx, 'restart'));
  actions.append(restartBtn);

  if (live) {
    if (local.confirmAbandon) {
      actions.append(h(doc, 'p', {className: 'meta-warn', text: t(api, 'abandonConfirm'), 'data-testid': 'abandon-warning'}));
      const confirmBtn = button(ctx, {action: 'abandon', testid: 'btn-abandon-confirm', label: t(api, 'confirm')});
      listen(confirmBtn, () => {
        local.confirmAbandon = false;
        act(ctx, 'abandon');
      });
      const cancelBtn = button(ctx, {action: 'cancel', testid: 'btn-abandon-cancel', label: t(api, 'cancel')});
      listen(cancelBtn, () => {
        local.confirmAbandon = false;
        ctx.rerender();
      });
      actions.append(confirmBtn, cancelBtn);
    } else {
      actions.append(h(doc, 'p', {className: 'muted', text: t(api, 'abandonConfirm')}));
      const abandonBtn = button(ctx, {action: 'abandon', testid: 'btn-abandon', label: t(api, 'abandon')});
      listen(abandonBtn, () => {
        local.confirmAbandon = true;
        ctx.rerender();
      });
      actions.append(abandonBtn);
    }
  }
  body.append(actions);
  body.append(newRunForm(ctx, !live));
  if (run) body.append(runCard(ctx));
  if (api.getUI?.().message==='legacyRunReset') body.append(note(ctx,t(api,'legacyRunReset'),'meta-note'));

  const nav = h(doc, 'nav', {className: 'grid meta-nav', 'data-testid': 'meta-nav', 'aria-label': t(api, 'title')});
  nav.append(
    navButton(ctx, 'armory', 'nav-armory'),
    navButton(ctx, 'codex', 'nav-codex'),
    navButton(ctx, 'howto', 'nav-howto'),
    navButton(ctx, 'settings', 'nav-settings')
  );
  if (finished || run?.settlement) nav.append(navButton(ctx, 'results', 'nav-results'));
  body.append(nav);

  body.append(line(ctx, t(api, 'currency'), num(profile.currency, lang), 'menu-currency'));
  const best = bestCard(ctx);
  if (best) body.append(best);
  body.append(h(doc, 'p', {className: 'muted meta-mini', text: `${t(api, 'version')} ${CONTRACT_VERSION}`}));
}

function renderArmory(ctx, root) {
  const {doc, api, lang, profile, rawProfile} = ctx;
  root.append(pageHead(ctx, 'meta-armory', t(api, 'armory')));
  root.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'armoryIntro',
    'Settled runs pay currency for equipment and permanent hero upgrades. Bonuses stay bounded, and Normal remains playable without them.',
    '已结算的对局提供货币，用于购买装备和永久英雄升级。加成有上限，标准难度不依赖它们也能游玩。')}));
  root.append(line(ctx, t(api, 'currency'), num(profile.currency, lang), 'currency-value'));

  const bonuses = profileBonuses(rawProfile);
  const summary = h(doc, 'section', {className: 'card', 'data-testid': 'profile-bonuses'});
  summary.append(h(doc, 'h3', {text: tx(api, lang, 'bonuses', 'Current bonuses', '当前加成')}));
  const fields = [
    ['damage', 'bonus-damage', bonuses.ok ? signed(percent(bonuses.damage, lang), bonuses.damage) : '—'],
    ['haste', 'bonus-haste', bonuses.ok ? signed(percent(bonuses.haste, lang), bonuses.haste) : '—'],
    ['range', 'bonus-range', bonuses.ok ? signed(num(bonuses.range, lang, 0), bonuses.range) : '—'],
    ['critChance', 'bonus-crit', bonuses.ok ? signed(percent(bonuses.critChance, lang), bonuses.critChance) : '—'],
    ['fence', 'bonus-fence', bonuses.ok ? signed(num(bonuses.fence, lang, 0), bonuses.fence) : '—'],
    ['reward', 'bonus-reward', bonuses.ok ? signed(percent(bonuses.reward, lang), bonuses.reward) : '—']
  ];
  for (const [key, testid, value] of fields) {
    summary.append(line(ctx, profileBonusLabel(ctx, key), value, testid));
  }
  summary.append(h(doc, 'p', {className: 'muted meta-mini', text: tx(api, lang, 'rewardBonusNote',
    'The reward bonus is applied when a run is settled, along with the difficulty multiplier. Results show the currency actually awarded.',
    '奖励加成在对局结算时与难度倍率一起结算。结算画面显示实际获得的货币。')}));
  root.append(summary);

  root.append(h(doc, 'h3', {text: tx(api, lang, 'equipment', 'Equipment', '装备')}));
  root.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'equipReplaces',
    'Choosing another item for the same slot replaces the equipped one.',
    '为同一栏位选择另一件装备时，会替换当前装备。')}));

  const items = catalogEntries(EQUIPMENT);
  if (!items.length) {
    root.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
  }
  for (const slot of slotGroups(items)) {
    const block = h(doc, 'section', {className: 'meta-stack', 'data-testid': `armory-slot-${slot.id}`});
    const equippedId = profile.equipped?.[slot.id] ?? null;
    const equipped = items.find(item => item.id === equippedId);
    block.append(h(doc, 'h3', {text: slotLabel(ctx, slot.id)}));
    block.append(line(ctx, t(api, 'equipped'), equipped ? entryName(equipped, lang, equipped.id) : t(api, 'emptySlot'), `equipped-${cssId(slot.id)}`));
    if (equipped) {
      block.append(line(ctx, tx(api, lang, 'bonus', 'Bonus', '加成'), equippedBonusLine(ctx, equipped), `equipped-bonus-${cssId(slot.id)}`));
    }
    const grid = h(doc, 'div', {className: 'grid meta-cards'});
    for (const item of slot.items) grid.append(equipmentCard(ctx, item));
    block.append(grid);
    root.append(block);
  }

  root.append(h(doc, 'h3', {text: tx(api, lang, 'permanent', 'Permanent upgrades', '永久升级')}));
  const upgrades = orderedBy(catalogEntries(PERMANENT_UPGRADES), PERMANENT_ORDER);
  const grid = h(doc, 'div', {className: 'grid'});
  if (!upgrades.length) grid.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
  for (const upgrade of upgrades) grid.append(permanentCard(ctx, upgrade));
  root.append(grid);
}

function renderCodex(ctx, root) {
  const {doc, api, lang} = ctx;
  root.append(pageHead(ctx, 'meta-codex', t(api, 'codex')));
  const tabs = h(doc, 'div', {className: 'meta-row', role: 'tablist', 'aria-label': t(api, 'codex')});
  for (const tab of [['towers', 'towers'], ['recipes', 'recipes'], ['enemies', 'enemies'], ['hero', 'hero']]) {
    const selected = local.codexTab === tab[0];
    const btn = button(ctx, {
      testid: `codex-tab-${tab[0]}`,
      label: t(api, tab[1]),
      pressed: selected,
      action: 'codexTab',
      value: tab[0]
    });
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    listen(btn, () => {
      local.codexTab = tab[0];
      ctx.rerender();
    });
    tabs.append(btn);
  }
  root.append(tabs);

  if (local.codexTab === 'recipes') root.append(renderRecipes(ctx));
  else if (local.codexTab === 'enemies') root.append(renderEnemies(ctx));
  else if (local.codexTab === 'hero') root.append(renderHeroCodex(ctx));
  else root.append(renderTowers(ctx));

  root.append(h(doc, 'p', {className: 'muted meta-mini', text: tx(api, lang, 'codexRankNote',
    'Listed tower and recipe numbers are the catalog stats. Rank raises a unit from 1 to 4 without changing its identity.',
    '列出的防御塔与配方数值来自图鉴。等级会把单位从 1 级提升到最高 4 级，种类保持不变。')}));
}

function renderSettings(ctx, root) {
  const {doc, api, lang, profile} = ctx;
  root.append(pageHead(ctx, 'meta-settings', t(api, 'settings')));
  root.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'settingsKeepRun',
    'Language, sound, motion, and difficulty choices keep the current run.',
    '语言、声音、动效和难度的更改都会保留当前对局。')}));

  const language = h(doc, 'section', {className: 'card', 'data-testid': 'settings-language'});
  language.append(h(doc, 'h3', {text: t(api, 'language')}));
  const langs = h(doc, 'div', {className: 'meta-row', role: 'group'});
  langs.setAttribute('aria-label', t(api, 'language'));
  langs.append(languageButton(ctx, 'zh', '中', 'lang-zh'), languageButton(ctx, 'en', 'EN', 'lang-en'));
  language.append(langs);
  root.append(language);

  root.append(toggleCard(ctx, {
    testid: 'settings-sound',
    title: t(api, 'sound'),
    buttonId: 'btn-sound',
    action: 'sound',
    pressed: profile.settings.sound,
    state: profile.settings.sound ? t(api, 'soundOn') : t(api, 'soundOff'),
    onClick: () => act(ctx, 'sound')
  }));
  root.append(toggleCard(ctx, {
    testid: 'settings-motion',
    title: t(api, 'reducedMotion'),
    buttonId: 'btn-reduced-motion',
    action: 'reducedMotion',
    pressed: profile.settings.reducedMotion,
    state: onOff(ctx, profile.settings.reducedMotion),
    onClick: () => actQuiet(ctx, 'reducedMotion', {value: !profile.settings.reducedMotion})
  }));

  const difficulty = h(doc, 'section', {className: 'card', 'data-testid': 'settings-difficulty'});
  difficulty.append(h(doc, 'h3', {text: t(api, 'difficulty')}));
  difficulty.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'difficultyNextRun',
    'The highlighted difficulty is used the next time you start a run.',
    '高亮的难度会在下一局开始时使用。')}));
  difficulty.append(difficultyGrid(ctx, 'setting-difficulty'));
  root.append(difficulty);

  root.append(saveCard(ctx));
}

function renderHowto(ctx, root) {
  const {doc, api, lang} = ctx;
  const head = pageHead(ctx, 'meta-howto', t(api, 'howto'));
  head.append(howtoBeats(ctx));
  head.append(h(doc, 'p', {text: tx(api, lang, 'howtoSortie',
    'Sorties are chosen before Play, and the new enemies are explained in the codex.',
    '出击在开始前选定，新敌人的说明在图鉴里。')}));
  root.append(head);
  root.append(roleCard(ctx));
  root.append(h(doc, 'p', {text: tx(api, lang, 'helpRole',
    'You plan, build, and decide. Towers and the hero attack on their own. There are no active combat abilities and no direct hero control.',
    '你负责规划、建造和抉择。防御塔与英雄会自动攻击。没有主动战斗技能，也不能直接操纵英雄作战。')}));
  root.append(boardDiagram(ctx));
  const topics = [
    ['help-fence', 'fence', 'helpFence',
      'Enemies enter from the top and attack only the shared fence. Defenders have no health. The run ends when fence HP reaches zero.',
      '敌人从上方进入，并且只攻击共享的栅栏。防御单位没有生命值。栅栏生命降到零时，本局结束。'],
    ['help-placement', 'place', 'helpPlacement',
      'Defenders fill two rows of five slots. The run starts with one hero in the front center. That hero stays independent and is never merged, replaced, or sold. While the fight is running, drag a defender to an empty slot to move it, or onto a compatible tower to merge. Pause, a draft, and the menu still allow it. An illegal drop snaps back. Moving the hero only changes its slot.',
      '防御单位占据两行，每行五个槽位。开局只有一名英雄，位于前排正中。英雄始终独立，不能被合并、替换或出售。战斗进行中，把防守者拖到空位即可移动，拖到可以合成的防御塔上即可合成。暂停、整备和菜单里也可以。非法放置会弹回。移动英雄只改变它所在的槽位。'],
    ['help-range', 'range', 'helpRange',
      'A defender attacks the enemy closest to the fence inside a circle centered on its slot, across the whole field. There are no lanes. Rear-row ranges reach threats in front of the fence. Select a defender during battle to see its range.',
      '防御者以自己的槽位为圆心，攻击范围内最靠近栅栏的敌人，覆盖整个战场。战场没有分路。后排的射程能够打到栅栏前的威胁。战斗中点选防御者即可看到范围。'],
    ['help-draft', 'chooseOneOfThree', 'helpDraft',
      'Kills fill the draft meter. Each draft pauses the battle and offers exactly three choices: a new tower or a hero upgrade. Placement is a separate tap. Canceling placement keeps those same three choices. A full board still offers hero upgrades or an explicit replacement, and replacement never takes the hero.',
      '击杀会填满选卡进度。每次选卡都暂停战斗，并给出恰好三个选项：新的防御塔或英雄升级。放置需要再点一次槽位。取消放置会保留同一组三个选项。格子满了仍然会提供英雄升级或明确的替换，替换不会动到英雄。'],
    ['help-merge', 'merge', 'helpMerge',
      'While the fight is running, pick two different occupied slots. Matching type and rank become that unit at rank + 1, up to rank 4, including two copies of the same hybrid. Different base types of equal rank become their recipe at that rank. A hybrid does not mix with a different type. The hero is protected. Preview the result, then confirm. Cancel and invalid pairs leave both units in place.',
      '战斗进行中选择两个不同的已占用槽位。种类和等级都相同会升到下一等级，最高 4 级，相同的混合单位也可以这样升级。两种不同的基础塔在等级相同且存在配方时，会变成该等级的混合单位。混合单位不能再与另一种类混合。英雄受保护。先预览结果再确认。取消或无效组合都会保留双方。'],
    ['help-speed', 'speed', 'helpSpeed',
      'Speeds are 1x, 1.5x, 3x, and 10x. The same simulation rules advance with game time at every speed, and speed does not change rewards. Hiding the page pauses the battle; return and resume it yourself.',
      '速度有 1 倍、1.5 倍、3 倍和 10 倍。每种速度都按游戏时间推进同一套模拟，速度不会改变奖励。页面隐藏时战斗会暂停，返回后需要你自己继续。']
  ];
  for (const [testid, titleKey, bodyKey, en, zh] of topics) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': testid});
    card.append(h(doc, 'h3', {text: t(api, titleKey)}), h(doc, 'p', {text: tx(api, lang, bodyKey, en, zh)}));
    root.append(card);
  }
}

function roleCard(ctx) {
  const {doc, api, lang} = ctx;
  const card = h(doc, 'article', {className: 'card', 'data-testid': 'howto-roles'});
  card.append(h(doc, 'h3', {text: tx(api, lang, 'howtoRoles', 'Eight threats', '八种威胁')}));
  const list = h(doc, 'ul', {'data-testid': 'howto-role-list'});
  const lines = [
    ['Ash Leaper: shots land during the crouch, then it jumps.', '灰跃者：蹲下时才会被打中，然后向前跳。'],
    ['Crack Brood: death releases two dust gnawers that finish the walk.', '裂巢：死后放出两只尘啮，由它们走完剩下的路。'],
    ['Ash Mender: heals the most wounded ally, never itself.', '烬补者：治疗伤得最重的同伴，从不治疗自己。'],
    ['Fence Shade: shoot the short solid beat. It still bites while faded.', '栅影：在短暂凝实时射击。淡出时仍会啃栅栏。'],
    ['Standard Wretch: nearby enemies move three times as fast. Kill it first.', '旗孽：附近敌人变为三倍速。先打掉它。'],
    ['Ash Warden: nearby allies take weaker hits. The warden itself is not shielded.', '烬卫：附近同伴受到的伤害变低。烬卫自己没有这层护盾。'],
    ['Cinder Charge: one bite at the fence, then a fuse. Kill it before the blast.', '烬爆：贴上栅栏后啃一口，然后是引线。爆炸前打掉它。'],
    ['Ash Hush: on the fence, the whole board recharges more slowly.', '烬寂：贴在栅栏上时，整个阵列的充能都会变慢。']
  ];
  for (const [en, zh] of lines) list.append(h(doc, 'li', {text: lang === 'zh' ? zh : en}));
  card.append(list);
  return card;
}

function howtoBeats(ctx) {
  const {doc, api, lang} = ctx;
  const list = h(doc, 'ol', {
    className: 'meta-beats',
    'data-testid': 'howto-beats'
  });
  list.setAttribute('aria-label', t(api, 'howto'));
  const beats = [
    ['howto-beat-place', 'howtoBeatPlace', "Place the hero's allies.", '放置英雄的友军。'],
    ['howto-beat-draft', 'howtoBeatDraft', 'Take a three-choice draft.', '进行三选一整备。'],
    ['howto-beat-merge', 'howtoBeatMerge', 'Merge the same type, or a known pair.', '合成同种，或已知的一对。'],
    ['howto-beat-fence', 'howtoBeatFence', 'Protect the one shared fence.', '守住那一道共用栅栏。']
  ];
  for (const [testid, key, en, zh] of beats) {
    list.append(h(doc, 'li', {'data-testid': testid, text: tx(api, lang, key, en, zh)}));
  }
  return list;
}

function renderResults(ctx, root) {
  const {doc, api, lang, run, profile} = ctx;
  root.append(pageHead(ctx, 'meta-results', t(api, 'results')));
  const settlement = run?.settlement && typeof run.settlement === 'object' ? run.settlement : null;
  const outcome = settlement?.result || (run?.phase === 'victory' || run?.phase === 'defeat' ? run.phase : null);
  const card = h(doc, 'section', {className: 'card'});
  card.append(h(doc, 'h3', {text: t(api, 'runComplete')}));
  card.append(line(ctx, t(api, 'results'), outcomeText(ctx, outcome), 'result-outcome'));
  const paid = settlement && Number.isFinite(settlement.currency) ? settlement.currency : null;
  const difficultyId = settlement?.difficulty || run?.difficulty;
  card.append(h(doc, 'p', {
    className: 'result-story',
    'data-testid': 'result-story',
    text: resultStory(lang, outcome, paid)
  }));
  if (outcome === 'defeat') {
    const offer = nextArmoryBuy(profile);
    const named = offer ? armoryNextLine(lang, offer) : '';
    card.append(h(doc, 'p', {
      className: 'result-story',
      'data-testid': 'result-next',
      text: named || defeatAdvice(lang, difficultyId)
    }));
  }

  if (settlement && Number.isFinite(settlement.currency)) {
    card.append(line(ctx, t(api, 'earned'), num(settlement.currency, lang), 'result-currency'));
  } else {
    const row = line(ctx, t(api, 'earned'), tx(api, lang, 'settlementPending',
      'The award appears here after the run is settled.',
      '对局完成结算后，奖励会显示在这里。'), 'result-currency');
    card.append(row);
  }

  const expeditionId = typeof run?.expedition === 'string' ? run.expedition : '';
  const expedition = expeditionId && Object.prototype.hasOwnProperty.call(EXPEDITIONS, expeditionId) ? EXPEDITIONS[expeditionId] : null;
  if (expedition) {
    card.append(line(ctx, tx(api, lang, 'expedition', 'Sortie', '出击'), textOf(expedition.name, lang), 'result-expedition'));
  }

  const difficulty = DIFFICULTIES[difficultyId];
  card.append(line(ctx, t(api, 'difficulty'), difficulty ? textOf(difficulty.name, lang) : (difficultyId ? String(difficultyId) : '—'), 'result-difficulty'));
  card.append(line(ctx, t(api, 'rewardMultiplier'), difficulty ? `×${num(difficulty.reward, lang, 2)}` : '—', 'result-reward-multiplier'));
  card.append(line(ctx, t(api, 'time'), formatClock(pickNumber(settlement, 'time', run, 'time')), 'result-time'));
  card.append(line(ctx, t(api, 'kills'), formatMaybe(pickNumber(settlement, 'kills', run, 'kills'), lang), 'result-kills'));
  card.append(line(ctx, t(api, 'wave'), formatMaybe(pickNumber(settlement, 'wave', run, 'wave'), lang), 'result-wave'));
  card.append(line(ctx, t(api, 'damageDealt'), formatMaybe(run?.stats?.damage, lang), 'result-damage'));
  card.append(line(ctx, tx(api, lang, 'fenceDamage', 'Fence damage', '栅栏承受伤害'), formatMaybe(run?.stats?.fenceDamage, lang), 'result-fence-damage'));
  card.append(line(ctx, t(api, 'mergesMade'), formatMaybe(run?.stats?.merges, lang), 'result-merges'));
  card.append(line(ctx, t(api, 'crit'), formatMaybe(run?.stats?.crits, lang), 'result-crits'));
  const fenceText = run?.fence ? `${num(run.fence.hp, lang, 0)} / ${num(run.fence.maxHp, lang, 0)}` : '—';
  card.append(line(ctx, t(api, 'fence'), fenceText, 'result-fence'));
  if (run && Number.isFinite(run.seed)) card.append(line(ctx, t(api, 'seed'), String(run.seed >>> 0), 'result-seed'));
  card.append(line(ctx, t(api, 'currency'), num(profile.currency, lang), 'result-wallet'));
  appendEndlessOffer(ctx, card);
  root.append(card);

  const actions = h(doc, 'div', {className: 'meta-actions'});
  if (run) {
    const restartBtn = button(ctx, {action: 'restart', testid: 'btn-results-restart', label: t(api, 'restart'), primary: true});
    listen(restartBtn, () => goBattle(ctx, 'restart'));
    actions.append(restartBtn);
  }
  if (local.confirmStart && runIsLive(run)) {
    actions.append(h(doc, 'p', {
      className: 'meta-warn',
      'data-testid': 'start-warning',
      text: tx(api, lang, 'confirmNewRun',
        'Starting a new run leaves the current battle. Choose Play again to confirm.',
        '开始新的一局会离开当前战斗。请再选一次开始以确认。')
    }));
  }
  const playBtn = button(ctx, {
    action: 'start',
    testid: 'btn-results-play',
    label: local.confirmStart && runIsLive(run) ? t(api, 'confirm') : t(api, 'newRun'),
    primary: !run
  });
  listen(playBtn, () => startRun(ctx));
  const menuBtn = button(ctx, {action: 'screen', testid: 'btn-results-menu', label: t(api, 'back'), name: 'menu'});
  listen(menuBtn, () => act(ctx, 'screen', {name: 'menu'}));
  const armoryBtn = button(ctx, {action: 'screen', testid: 'btn-results-armory', label: t(api, 'armory'), name: 'armory'});
  listen(armoryBtn, () => act(ctx, 'screen', {name: 'armory'}));
  actions.append(playBtn, menuBtn, armoryBtn);
  root.append(actions);
}

function newRunForm(ctx, primary) {
  const {doc, api, lang} = ctx;
  const form = h(doc, 'form', {className: 'card', 'data-testid': 'new-run-form'});
  form.append(h(doc, 'h3', {text: t(api, 'newRun')}));
  const play = button(ctx, {
    action: 'start',
    testid: 'btn-play',
    label: local.confirmStart && runIsLive(ctx.run) ? t(api, 'confirm') : t(api, 'play'),
    primary
  });
  play.type = 'submit';
  play.addEventListener('click', event => event.stopPropagation());
  form.append(play);
  const picker=h(doc,'details');
  picker.append(h(doc,'summary',{text:t(api,'selectMission')+' · '+localize(EXPEDITIONS[selectedExpedition(ctx.rawProfile || ctx.profile)].name,lang)}),expeditionPicker(ctx));
  form.append(picker);
  form.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'difficultyRewards',
    'Higher difficulties increase enemy pressure and the reward multiplier.',
    '更高的难度会提高敌人压力和奖励倍率。')}));
  form.append(difficultyGrid(ctx, 'difficulty'));
  const seedLabel = h(doc, 'label');
  seedLabel.append(h(doc, 'span', {text: t(api, 'seed')}));
  const seed = h(doc, 'input', {
    id: 'meta-seed',
    type: 'number',
    min: '0',
    step: '1',
    inputmode: 'numeric',
    autocomplete: 'off',
    'data-testid': 'seed-input'
  });
  seed.value = local.seed;
  seed.addEventListener('input', () => {
    local.seed = seed.value;
  });
  seedLabel.append(seed);
  form.append(seedLabel);
  if (local.confirmStart && runIsLive(ctx.run)) {
    form.append(h(doc, 'p', {
      className: 'meta-warn',
      'data-testid': 'start-warning',
      text: tx(api, lang, 'confirmNewRun',
        'Starting a new run leaves the current battle. Choose Play again to confirm.',
        '开始新的一局会离开当前战斗。请再选一次开始以确认。')
    }));
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    startRun(ctx);
  });
  return form;
}

function expeditionPicker(ctx) {
  const {doc, api, lang} = ctx;
  const profile = ctx.rawProfile || ctx.profile;
  const selected = selectedExpedition(profile);
  const block = h(doc, 'div', {className: 'meta-stack'});
  block.append(h(doc, 'h3', {text: tx(api, lang, 'expedition', 'Sortie', '出击')}));
  block.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'expeditionHelp',
    'Sorties are shorter fights. The Long Watch is the full campaign.',
    '出击是更短的一局。长夜守望是完整战役。')}));
  const grid = h(doc, 'div', {className: 'grid meta-sorties', 'data-testid': 'expedition-grid'});
  for (const id of EXPEDITION_ORDER) {
    const entry = EXPEDITIONS[id];
    if (!entry) continue;
    const btn = h(doc, 'button', {type: 'button', className: 'btn meta-choice'});
    btn.setAttribute('data-action', 'expedition');
    btn.setAttribute('data-value', id);
    btn.setAttribute('data-testid', `expedition-${id}`);
    btn.setAttribute('aria-pressed', selected === id ? 'true' : 'false');
    const minutes = Number.isFinite(entry.minutes) ? entry.minutes : 0;
    const focus = textOf(entry.focus, lang);
    const length = tx(api, lang, 'expeditionMinutes', `~${minutes} minutes`, `~${minutes} 分钟`);
    btn.append(
      h(doc, 'span', {text: textOf(entry.name, lang) || id}),
      h(doc, 'span', {className: 'muted', text: focus ? `${focus} · ${length}` : length})
    );
    const clears = expeditionClears(profile, id);
    if (clears > 0) {
      btn.append(h(doc, 'span', {className: 'muted', text: tx(api, lang, 'expeditionClears', `Clears ${num(clears, lang)}`, `通关 ${num(clears, lang)}`)}));
    }
    listen(btn, () => {
      local.expedition = id;
      local.confirmStart = false;
      ctx.rerender();
    });
    grid.append(btn);
  }
  block.append(grid);
  const chosen = EXPEDITIONS[selected];
  block.append(h(doc, 'p', {
    'data-testid': 'expedition-summary',
    text: textOf(chosen?.summary, lang)
  }));
  return block;
}

function difficultyGrid(ctx, idPrefix) {
  const {doc, api, lang} = ctx;
  const selected = selectedDifficulty(ctx.profile);
  const grid = h(doc, 'div', {className: 'grid meta-diffs', 'data-testid': `${idPrefix}-grid`});
  for (const id of DIFFICULTY_ORDER) {
    const entry = DIFFICULTIES[id];
    if (!entry) continue;
    const btn = h(doc, 'button', {type: 'button', className: 'btn meta-choice'});
    btn.setAttribute('data-action', 'difficulty');
    btn.setAttribute('data-value', id);
    btn.setAttribute('data-testid', `${idPrefix}-${id}`);
    btn.setAttribute('aria-pressed', selected === id ? 'true' : 'false');
    btn.append(
      h(doc, 'span', {text: textOf(entry.name, lang) || t(api, id)}),
      h(doc, 'span', {className: 'muted', text: `${t(api, 'rewardMultiplier')} ×${num(entry.reward, lang, 2)}`}),
      h(doc, 'span', {className: 'muted', text: `${tx(api, lang, 'fenceBonus', 'Fence HP', '栅栏生命')} ${num(entry.fence, lang, 0)}`}),
      h(doc, 'span', {className: 'muted', text: pressureText(ctx, entry)})
    );
    listen(btn, () => {
      local.difficulty = id;
      local.confirmStart = false;
      actQuiet(ctx, 'difficulty', {value: id});
      ctx.rerender();
    });
    grid.append(btn);
  }
  return grid;
}

function catalogHead(ctx, id, name, description) {
  const head = h(ctx.doc, 'div', {className: 'catalog-head'});
  head.appendChild(catalogIcon(ctx.doc, id));
  const copy = h(ctx.doc, 'div', {className: 'catalog-copy'});
  copy.appendChild(h(ctx.doc, 'h3', {text: name}));
  if (description) copy.appendChild(h(ctx.doc, 'p', {className: 'catalog-desc', text: description}));
  head.appendChild(copy);
  return head;
}

function equipmentCard(ctx, item) {
  const {doc, api, lang, profile} = ctx;
  const owned = profile.equipmentOwned.includes(item.id);
  const slot = item.slot || 'weapon';
  const equipped = profile.equipped?.[slot] === item.id;
  const cost = Number.isFinite(item.cost) ? item.cost : Number.isFinite(item.price) ? item.price : null;
  const afford = cost != null && profile.currency >= cost;
  const card = h(doc, 'article', {className: 'card', 'data-testid': `equip-card-${cssId(item.id)}`});
  card.setAttribute('data-owned', owned ? 'true' : 'false');
  card.setAttribute('data-equipped', equipped ? 'true' : 'false');
  if (cost != null) card.setAttribute('data-cost', String(cost));
  const description = entryDesc(item, lang);
  card.append(catalogHead(ctx, item.id, entryName(item, lang, item.id), description));
  const badges = h(doc, 'div', {className: 'meta-badges'});
  badges.append(badge(ctx, slotLabel(ctx, slot)));
  if (equipped) badges.append(badge(ctx, t(api, 'equipped')));
  else if (owned) badges.append(badge(ctx, t(api, 'owned')));
  card.append(badges);
  card.append(line(ctx, t(api, 'cost'), cost == null ? '—' : num(cost, lang)));
  const effects = bonusEntries(item.bonuses || item.bonus);
  if (effects.length) {
    if (equipped) {
      card.append(line(ctx, tx(api, lang, 'bonus', 'Bonus', '加成'), equippedBonusLine(ctx, item), `equip-bonus-${cssId(item.id)}`));
    } else {
      card.append(h(doc, 'p', {className: 'muted', text: t(api, 'effect')}));
      for (const [key, value] of effects) card.append(line(ctx, profileBonusLabel(ctx, key), formatBonusValue(key, value, lang)));
    }
  }
  if (!owned) {
    const buy = button(ctx, {
      action: 'buyEquipment',
      testid: `buy-${cssId(item.id)}`,
      id: item.id,
      cost,
      label: `${t(api, 'buy')}${cost == null ? '' : ` · ${num(cost, lang)}`}`,
      primary: afford,
      disabled: !afford
    });
    if (afford) listen(buy, () => noteResult(ctx, act(ctx, 'buyEquipment', {id: item.id}), null));
    card.append(buy);
    if (cost == null) card.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
    else if (!afford) card.append(h(doc, 'p', {className: 'muted', text: t(api, 'insufficientCurrency')}));
  } else if (!equipped) {
    const equip = button(ctx, {
      action: 'equip',
      testid: `equip-${cssId(item.id)}`,
      id: item.id,
      label: t(api, 'equip'),
      primary: true
    });
    listen(equip, () => noteResult(ctx, act(ctx, 'equip', {id: item.id}), null));
    card.append(equip);
  }
  return card;
}

function permanentCard(ctx, upgrade) {
  const {doc, api, lang, profile, rawProfile} = ctx;
  const level = permanentLevel(profile, upgrade.id);
  const cap = upgradeCap(upgrade);
  const maxed = cap != null && level >= cap;
  const cost = maxed ? null : upgradeCost(upgrade, level, rawProfile || profile);
  const afford = !maxed && cost != null && profile.currency >= cost;
  const card = h(doc, 'article', {className: 'card', 'data-testid': `perm-${cssId(upgrade.id)}`});
  card.setAttribute('data-level', String(level));
  if (cap != null) card.setAttribute('data-cap', String(cap));
  if (cost != null) card.setAttribute('data-cost', String(cost));
  const description = entryDesc(upgrade, lang);
  card.append(catalogHead(ctx, upgrade.id, entryName(upgrade, lang, bonusLabel(ctx, upgrade.id)), description));
  card.append(line(ctx, t(api, 'level'), cap == null ? num(level, lang) : `${num(level, lang)} / ${num(cap, lang)}`));
  const perLevel = perLevelBonus(upgrade);
  for (const [key, value] of bonusEntries(perLevel)) {
    card.append(line(ctx, `${t(api, 'upgrade')} · ${profileBonusLabel(ctx, key)}`, formatBonusValue(key, value, lang)));
  }
  if (maxed) {
    card.append(badge(ctx, t(api, 'maxLevel')));
    card.append(h(doc, 'p', {className: 'muted', text: t(api, 'maxLevel')}));
    return card;
  }
  card.append(line(ctx, t(api, 'cost'), cost == null ? '—' : num(cost, lang)));
  const btn = button(ctx, {
    action: 'upgradePermanent',
    testid: `upgrade-${cssId(upgrade.id)}`,
    id: upgrade.id,
    cost,
    label: t(api, 'upgrade'),
    primary: afford,
    disabled: !afford
  });
  if (afford) listen(btn, () => noteResult(ctx, act(ctx, 'upgradePermanent', {id: upgrade.id}), null));
  card.append(btn);
  if (cost == null) card.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
  else if (!afford) card.append(h(doc, 'p', {className: 'muted', text: t(api, 'insufficientCurrency')}));
  return card;
}

function renderTowers(ctx) {
  const {doc, api, lang} = ctx;
  const wrap = h(doc, 'div', {className: 'grid', 'data-testid': 'codex-towers'});
  const towers = orderedBy(catalogEntries(TOWERS), BASE_TYPES);
  if (!towers.length) wrap.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
  for (const tower of towers) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': `codex-tower-${cssId(tower.id)}`});
    const description = entryDesc(tower, lang);
    card.append(catalogHead(ctx, tower.id, entryName(tower, lang, tower.id), description));
    card.append(badge(ctx, `${t(api, 'rank')} 1`));
    card.append(statBlock(ctx, unitStatsOf(tower)));
    if (tower.id === 'support' || unitStatsOf(tower)?.aura) {
      card.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'helpAura',
        'A support aura boosts nearby defenders. Its damage and haste bonuses are fractional and combat caps them.',
        '支援光环强化附近的防御单位。其中的伤害和攻速是比例加成，战斗中会限制上限。')}));
    }
    wrap.append(card);
  }
  return wrap;
}

function renderRecipes(ctx) {
  const {doc, api, lang} = ctx;
  const wrap = h(doc, 'div', {className: 'grid', 'data-testid': 'codex-recipes'});
  const rules = h(doc, 'article', {className: 'card', 'data-testid': 'codex-merge-rules'});
  rules.append(h(doc, 'h3', {text: t(api, 'merge')}));
  rules.append(h(doc, 'p', {text: tx(api, lang, 'helpMerge',
    'Same type and rank combine into rank + 1, up to rank 4. Different base types of equal rank follow a recipe and keep that rank. Hybrids do not mix with a different type. The hero is protected. Invalid merges and cancel leave both units in place.',
    '相同种类和等级会合并为下一等级，最高 4 级。不同基础塔在等级相同且有配方时，会保留该等级并成为混合单位。混合单位不能与另一种类再混合。英雄受保护。无效合并和取消都会留下原来的单位。')}));
  rules.append(badge(ctx, t(api, 'heroProtected')));
  wrap.append(rules);
  const recipes = catalogEntries(RECIPES);
  const fieldTypes = boardParentTypes(ctx.run);
  if (!recipes.length) wrap.append(h(doc, 'p', {className: 'muted', text: t(api, 'recipes')}));
  const ordered = recipes
    .map((recipe, index) => {
      const parents = recipeParentList(recipe);
      return {recipe, parents, ready: parentsReady(parents, fieldTypes), index};
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || a.index - b.index);
  for (const {recipe, parents, ready} of ordered) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': `codex-recipe-${cssId(recipe.id)}`});
    const description = entryDesc(recipe, lang);
    card.append(catalogHead(ctx, recipe.id, entryName(recipe, lang, recipe.id), description));
    card.append(line(ctx, t(api, 'ingredients'), parents.map(parent => parentName(parent, lang)).join(' + ') || '—'));
    card.setAttribute('data-codex-ready', ready ? 'true' : 'false');
    const status = ready
      ? tx(api, lang, 'codexReady', 'Both parents are on the field', '两种材料都在场上')
      : tx(api, lang, 'codexWaiting', 'Build both parents first', '先放好两种材料');
    const mark = h(doc, ready ? 'span' : 'p', {
      className: ready ? 'badge' : 'muted',
      text: status,
      'data-testid': `codex-recipe-status-${cssId(recipe.id)}`,
      'data-state': ready ? 'ready' : 'waiting'
    });
    if (ready) {
      const badges = h(doc, 'div', {className: 'meta-badges'});
      badges.append(mark);
      card.append(badges);
    } else {
      card.append(mark);
    }
    card.append(statBlock(ctx, unitStatsOf(recipe)));
    wrap.append(card);
  }
  return wrap;
}

function renderEnemies(ctx) {
  const {doc, api, lang} = ctx;
  const wrap = h(doc, 'div', {className: 'grid', 'data-testid': 'codex-enemies'});
  const enemies = orderedBy(catalogEntries(ENEMIES), ENEMY_ORDER);
  if (!enemies.length) wrap.append(h(doc, 'p', {className: 'muted', text: t(api, 'locked')}));
  for (const enemy of enemies) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': `codex-enemy-${cssId(enemy.id)}`});
    const description = entryDesc(enemy, lang);
    card.append(catalogHead(ctx, enemy.id, entryName(enemy, lang, enemy.id), description));
    if (enemy.id === 'boss' || enemy.boss) card.append(badge(ctx, entryName(enemy, lang, 'boss')));
    const hp = Number.isFinite(enemy.maxHp) ? enemy.maxHp : Number.isFinite(enemy.hp) ? enemy.hp : enemy.health;
    if (Number.isFinite(hp)) card.append(line(ctx, tx(api, lang, 'health', 'Health', '生命'), num(hp, lang)));
    if (Number.isFinite(enemy.speed)) {
      card.append(line(ctx, t(api, 'speed'), `${num(enemy.speed, lang, 1)} px/s`, `enemy-speed-${cssId(enemy.id)}`));
    }
    if (Number.isFinite(enemy.damage)) {
      card.append(line(ctx, t(api, 'damage'), `${num(enemy.damage, lang)} / ${lang === 'zh' ? '口' : 'bite'}`, `enemy-damage-${cssId(enemy.id)}`));
    }
    if (Number.isFinite(enemy.attackInterval)) {
      card.append(line(ctx, tx(api, lang, 'interval', 'Interval', '间隔'), `${num(enemy.attackInterval, lang, 2)} s`, `enemy-interval-${cssId(enemy.id)}`));
    }
    if (Number.isFinite(enemy.armor) && enemy.armor > 0) {
      card.append(line(ctx, tx(api, lang, 'armor', 'Armor', '护甲'), percent(enemy.armor, lang)));
    }
    if (Number.isFinite(enemy.xp)) card.append(line(ctx, t(api, 'xp'), num(enemy.xp, lang)));
    card.append(h(doc, 'p', {className: 'muted meta-mini', text: tx(api, lang, 'enemyFenceOnly',
      'This enemy attacks the fence only.',
      '这种敌人只攻击栅栏。')}));
    wrap.append(card);
  }
  return wrap;
}

function renderHeroCodex(ctx) {
  const {doc, api, lang} = ctx;
  const wrap = h(doc, 'div', {className: 'grid', 'data-testid': 'codex-hero'});
  const intro = h(doc, 'article', {className: 'card', 'data-testid': 'codex-hero-intro'});
  intro.append(h(doc, 'h3', {text: t(api, 'hero')}));
  intro.append(badge(ctx, t(api, 'heroProtected')));
  intro.append(h(doc, 'p', {text: tx(api, lang, 'helpHero',
    'The hero starts in the front center, takes one of the ten slots, and attacks automatically. Drafts can upgrade the hero. Equipment and permanent upgrades from the armory apply a bounded head start on later runs.',
    '英雄从前排正中开始，占据十个槽位中的一个，并自动攻击。选卡可以升级英雄。军械库的装备和永久升级会在之后的对局提供有限的起步优势。')}));
  wrap.append(intro);
  const upgrades = catalogEntries(HERO_UPGRADES);
  if (!upgrades.length) wrap.append(h(doc, 'p', {className: 'muted', text: t(api, 'chooseUpgrade')}));
  for (const upgrade of upgrades) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': `codex-hero-${cssId(upgrade.id)}`});
    const description = entryDesc(upgrade, lang);
    card.append(catalogHead(ctx, upgrade.id, entryName(upgrade, lang, upgrade.id), description));
    const cap = upgradeCap(upgrade);
    if (cap != null) card.append(line(ctx, tx(api, lang, 'levelCap', 'Max level', '等级上限'), num(cap, lang)));
    appendEffect(ctx, card, upgrade);
    wrap.append(card);
  }
  return wrap;
}

function statBlock(ctx, stats) {
  if (!stats) return null;
  const {doc, api, lang} = ctx;
  const box = h(doc, 'div', {className: 'meta-stack'});
  if (Number.isFinite(stats.damage)) {
    const digits = Number.isInteger(stats.damage) ? 0 : 2;
    const amount = num(stats.damage, lang, digits);
    const hit = stats.damage > 0 ? `${amount} / ${lang === 'zh' ? '发' : 'shot'}` : amount;
    box.append(line(ctx, t(api, 'damage'), hit));
  }
  if (Number.isFinite(stats.interval) && stats.interval > 0) {
    box.append(line(ctx, t(api, 'attackSpeed'), `${num(1 / stats.interval, lang, 2)} /s`));
    box.append(line(ctx, tx(api, lang, 'interval', 'Interval', '间隔'), `${num(stats.interval, lang, 2)} s`));
  }
  if (Number.isFinite(stats.range)) box.append(line(ctx, t(api, 'range'), `${num(stats.range, lang, 0)} px`));
  if (Number.isFinite(stats.critChance)) box.append(line(ctx, t(api, 'crit'), percent(stats.critChance, lang)));
  if (Number.isFinite(stats.critMultiplier) && stats.critMultiplier !== 1) {
    box.append(line(ctx, tx(api, lang, 'critMultiplier', 'Crit multiplier', '暴击倍率'), `×${num(stats.critMultiplier, lang, 2)}`));
  }
  if (Number.isFinite(stats.projectileSpeed)) {
    box.append(line(ctx, tx(api, lang, 'projectileSpeed', 'Projectile speed', '弹速'), `${num(stats.projectileSpeed, lang, 0)} px/s`));
  }
  for (const key of ['splash', 'chain', 'chainRange', 'pierce']) {
    if (!(Number.isFinite(stats[key]) && stats[key] !== 0)) continue;
    let value;
    if (key === 'splash') {
      const amount = num(stats[key], lang, 0);
      value = lang === 'zh' ? `被命中的敌人周围 ${amount} px` : `${amount} px around the enemy that was hit`;
    } else if (key === 'chainRange') {
      const amount = num(stats[key], lang, 0);
      value = lang === 'zh' ? `距上一名敌人 ${amount} px` : `${amount} px from the previous enemy`;
    } else if (key === 'pierce') {
      const amount = num(stats[key], lang, 0);
      const one = Math.round(Number(stats[key])) === 1;
      value = lang === 'zh' ? `额外 ${amount} 名敌人` : `${amount} extra ${one ? 'enemy' : 'enemies'}`;
    } else {
      value = num(stats[key], lang, 2);
    }
    box.append(line(ctx, bonusLabel(ctx, key), value));
  }
  for (const [label, value] of statusLines(ctx, stats)) box.append(line(ctx, label, value));
  if (Array.isArray(stats.mechanics)) {
    const badges = h(doc, 'div', {className: 'meta-badges'});
    for (const mechanic of stats.mechanics) {
      const text = mechanicText(mechanic, lang);
      if (text) badges.append(badge(ctx, text));
    }
    if (badges.childNodes.length) {
      box.append(h(doc, 'p', {className: 'muted', text: t(api, 'effect')}));
      box.append(badges);
    }
  }
  return box.childNodes.length ? box : null;
}

function statusLines(ctx, stats) {
  const {api, lang} = ctx;
  const lines = [];
  if (stats.burn && typeof stats.burn === 'object') {
    lines.push([tx(api, lang, 'burn', 'Burn', '燃烧'), dotText(ctx, stats.burn)]);
  }
  if (stats.poison && typeof stats.poison === 'object') {
    const extra = Number.isFinite(stats.poison.maxStacks) ? ` · ${tx(api, lang, 'stacks', 'Stacks', '层数')} ${num(stats.poison.maxStacks, lang, 0)}` : '';
    lines.push([tx(api, lang, '', 'Poison', '毒素'), `${dotText(ctx, stats.poison)}${extra}`]);
  }
  if (stats.slow && typeof stats.slow === 'object') {
    const parts = [];
    if (Number.isFinite(stats.slow.factor)) parts.push(`${t(api, 'speed')} ${percent(stats.slow.factor, lang)}`);
    if (Number.isFinite(stats.slow.duration)) parts.push(`${num(stats.slow.duration, lang, 1)} s`);
    lines.push([tx(api, lang, 'slow', 'Slow', '减速'), parts.join(' · ') || '—']);
  }
  if (stats.stun && typeof stats.stun === 'object' && Number.isFinite(stats.stun.duration)) {
    lines.push([tx(api, lang, 'stun', 'Stun', '眩晕'), `${num(stats.stun.duration, lang, 1)} s`]);
  }
  if (stats.brittle && typeof stats.brittle === 'object') {
    const amount = Number.isFinite(stats.brittle.amount) ? stats.brittle.amount : stats.brittle.factor;
    lines.push([tx(api, lang, 'brittle', 'Brittle', '易伤'), Number.isFinite(amount) ? percent(amount, lang) : '—']);
  }
  if (stats.aura && typeof stats.aura === 'object') {
    const parts = [];
    if (Number.isFinite(stats.aura.range)) parts.push(`${t(api, 'range')} ${num(stats.aura.range, lang, 0)}`);
    if (Number.isFinite(stats.aura.damage)) parts.push(`${t(api, 'damage')} ${signed(percent(stats.aura.damage, lang), stats.aura.damage)}`);
    if (Number.isFinite(stats.aura.haste)) parts.push(`${bonusLabel(ctx, 'haste')} ${signed(percent(stats.aura.haste, lang), stats.aura.haste)}`);
    lines.push([tx(api, lang, 'aura', 'Aura', '光环'), parts.join(' · ') || '—']);
  }
  return lines;
}

function boardDiagram(ctx) {
  const {doc, api, lang} = ctx;
  const board = h(doc, 'div', {
    className: 'meta-board card',
    'data-testid': 'help-board',
    role: 'img',
    'aria-label': tx(api, lang, 'helpBoard',
      'Enemies move down toward a fence. Behind it are two rows of five slots. The hero begins in the front center.',
      '敌人向下接近栅栏。栅栏后是两行、每行五个槽位。英雄从前排正中开始。')
  });
  board.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'enemyApproach', 'Enemies approach from above.', '敌人从上方接近。')}));
  board.append(h(doc, 'div', {className: 'meta-fence', text: t(api, 'fence')}));
  for (let row = 0; row < 2; row += 1) {
    const rowEl = h(doc, 'div', {className: 'meta-slotrow'});
    for (let col = 0; col < 5; col += 1) {
      const index = row * 5 + col;
      const hero = index === 2;
      rowEl.append(h(doc, 'div', {
        className: hero ? 'meta-slot meta-slot-hero' : 'meta-slot',
        text: hero ? t(api, 'hero') : ''
      }));
    }
    board.append(rowEl);
  }
  board.append(h(doc, 'p', {className: 'muted meta-mini', text: tx(api, lang, 'helpRows',
    'Front row, then rear row. The marked slot is the hero’s starting slot.',
    '上方是前排，下方是后排。标出的槽位是英雄的起始位置。')}));
  return board;
}

function saveCard(ctx) {
  const {doc, api, lang} = ctx;
  const card = h(doc, 'section', {className: 'card', 'data-testid': 'settings-save'});
  card.append(h(doc, 'h3', {text: t(api, 'save')}));
  card.append(h(doc, 'p', {className: 'muted', text: tx(api, lang, 'saveHelp',
    'Export creates a JSON save of the profile and run. Import replaces them only when the file is valid. An invalid file keeps the current save.',
    '导出会生成包含档案和对局的 JSON 存档。只有文件有效时，导入才会替换它们。无效文件会保留当前存档。')}));
  const exportBtn = button(ctx, {action: 'exportSave', testid: 'btn-export', label: t(api, 'exportSave'), primary: true});
  listen(exportBtn, () => {
    const result = act(ctx, 'exportSave');
    const text = exportTextFrom(result);
    if (text) local.exportText = text;
    noteResult(ctx, result, 'exportSave');
  });
  card.append(exportBtn);
  if (local.exportText) {
    const label = h(doc, 'label');
    label.append(h(doc, 'span', {text: t(api, 'exportSave')}));
    const area = h(doc, 'textarea', {
      id: 'meta-export',
      readonly: 'readonly',
      spellcheck: 'false',
      'data-testid': 'export-text'
    });
    area.readOnly = true;
    area.value = local.exportText;
    label.append(area);
    card.append(label);
    const copy = button(ctx, {testid: 'btn-copy-export', label: tx(api, lang, 'copySave', 'Copy save', '复制存档')});
    listen(copy, () => copyText(ctx, local.exportText));
    card.append(copy);
  }
  const importLabel = h(doc, 'label');
  importLabel.append(h(doc, 'span', {text: t(api, 'importSave')}));
  const importer = h(doc, 'textarea', {
    id: 'meta-import',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    'data-testid': 'import-text'
  });
  importer.value = local.importText;
  importer.addEventListener('input', () => {
    local.importText = importer.value;
  });
  importLabel.append(importer);
  card.append(importLabel);
  const importBtn = button(ctx, {action: 'importSave', testid: 'btn-import', label: t(api, 'importSave')});
  listen(importBtn, () => {
    const text = importer.value;
    local.importText = text;
    if (!String(text).trim()) {
      local.flash = 'importError';
      ctx.rerender();
      return;
    }
    const result = act(ctx, 'importSave', {text});
    if (result && result.ok === false) local.flash = result.reason || 'importError';
    else if (result && result.ok === true) {
      local.flash = 'importSuccess';
      local.importText = '';
    } else local.flash = 'importSave';
    ctx.rerender();
  });
  card.append(importBtn);
  return card;
}

function runCard(ctx) {
  const {doc, api, lang, run} = ctx;
  const card = h(doc, 'section', {className: 'card', 'data-testid': 'run-status'});
  card.append(h(doc, 'h3', {text: phaseLabel(ctx)}));
  const difficulty = DIFFICULTIES[run.difficulty];
  if (difficulty) card.append(line(ctx, t(api, 'difficulty'), textOf(difficulty.name, lang)));
  card.append(line(ctx, t(api, 'wave'), formatMaybe(run.wave, lang)));
  card.append(line(ctx, t(api, 'time'), formatClock(run.time)));
  card.append(line(ctx, t(api, 'fence'), Number.isFinite(run.fence?.hp) ? `${num(run.fence.hp, lang, 0)} / ${num(run.fence.maxHp, lang, 0)}` : '—'));
  card.append(line(ctx, t(api, 'kills'), formatMaybe(run.kills, lang)));
  if (Number.isFinite(run.xp) || Number.isFinite(run.nextDraftXp)) {
    const xp = Number.isFinite(run.xp) ? num(run.xp, lang) : '—';
    const next = Number.isFinite(run.nextDraftXp) ? num(run.nextDraftXp, lang) : '—';
    card.append(line(ctx, t(api, 'xp'), `${xp} / ${next}`));
  }
  if (Number.isFinite(run.speed)) card.append(line(ctx, t(api, 'speed'), `${num(run.speed, lang, 1)}×`));
  return card;
}

function bestCard(ctx) {
  const {doc, api, lang, profile} = ctx;
  const best = profile.best;
  if (!best || typeof best !== 'object') return null;
  const rows = [];
  const keys = [...DIFFICULTY_ORDER, ...Object.keys(best).filter(key => !DIFFICULTY_ORDER.includes(key))];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(best, key)) continue;
    const formatted = formatBestValue(best[key], api, lang);
    if (!formatted) continue;
    const label = DIFFICULTIES[key] ? textOf(DIFFICULTIES[key].name, lang) : key;
    rows.push([label, formatted]);
  }
  if (!rows.length) return null;
  const card = h(doc, 'section', {className: 'card', 'data-testid': 'best-runs'});
  card.append(h(doc, 'h3', {text: tx(api, lang, 'best', 'Best runs', '最佳记录')}));
  for (const [label, value] of rows) card.append(line(ctx, label, value));
  return card;
}

function pageHead(ctx, testid, title) {
  const {doc, api} = ctx;
  const wrap = h(doc, 'div', {'data-testid': testid, className: 'meta-stack'});
  wrap.append(brand(ctx, false));
  const head = h(doc, 'div', {className: 'meta-pagehead'});
  const back = button(ctx, {action: 'screen', testid: 'btn-back', label: t(api, 'back'), name: 'menu'});
  listen(back, () => act(ctx, 'screen', {name: 'menu'}));
  head.append(back, h(doc, 'h2', {text: title}));
  wrap.append(head);
  return wrap;
}

function brand(ctx, primary) {
  const {doc, api} = ctx;
  const box = h(doc, 'header', {className: 'meta-brand'});
  if (primary) {
    box.append(h(doc, 'h1', {text: 'Fencefall', 'data-testid': 'brand-title'}));
    box.append(h(doc, 'p', {className: 'meta-brand-zh', text: '最后一道防线', 'data-testid': 'brand-subtitle'}));
  } else {
    box.append(h(doc, 'p', {text: 'Fencefall', 'data-testid': 'brand-title'}));
    box.append(h(doc, 'p', {className: 'meta-brand-zh', text: '最后一道防线', 'data-testid': 'brand-subtitle'}));
  }
  const subtitle = t(api, 'subtitle');
  if (subtitle && subtitle !== 'subtitle' && subtitle !== '最后一道防线') {
    box.append(h(doc, 'p', {className: 'muted', text: subtitle}));
  }
  return box;
}

function navButton(ctx, name, testid) {
  const btn = button(ctx, {action: 'screen', testid, label: t(ctx.api, name), name});
  listen(btn, () => act(ctx, 'screen', {name}));
  return btn;
}

function languageButton(ctx, value, label, testid) {
  const pressed = ctx.lang === value;
  const btn = button(ctx, {action: 'language', testid, label, value, pressed, primary: pressed});
  btn.setAttribute('lang', value === 'zh' ? 'zh' : 'en');
  listen(btn, () => act(ctx, 'language', {value}));
  return btn;
}

function toggleCard(ctx, spec) {
  const {doc} = ctx;
  const card = h(doc, 'section', {className: 'card', 'data-testid': spec.testid});
  card.append(h(doc, 'h3', {text: spec.title}));
  card.append(line(ctx, spec.title, spec.state));
  const btn = button(ctx, {
    action: spec.action,
    testid: spec.buttonId,
    label: spec.title,
    pressed: spec.pressed
  });
  listen(btn, spec.onClick);
  card.append(btn);
  return card;
}

function appendFlash(ctx, root) {
  const {api, lang, ui} = ctx;
  const message = messageText(api, lang, ui);
  if (message) root.append(note(ctx, message, 'meta-note', 'meta-message'));
  if (!local.flash) return;
  const flash = tx(api, lang, local.flash, local.flash, local.flash);
  if (!flash || flash === message) return;
  const box = note(ctx, flash, 'meta-warn', 'meta-flash');
  const dismiss = button(ctx, {testid: 'btn-dismiss-flash', label: t(api, 'close')});
  listen(dismiss, () => {
    local.flash = null;
    ctx.rerender();
  });
  box.append(dismiss);
  root.append(box);
}

function note(ctx, text, className, testid) {
  const node = h(ctx.doc, 'div', {className, role: 'status', text});
  if (testid) node.setAttribute('data-testid', testid);
  return node;
}

function line(ctx, label, value, testid) {
  const row = h(ctx.doc, 'div', {className: 'meta-line'});
  if (testid) row.setAttribute('data-testid', testid);
  row.append(h(ctx.doc, 'span', {className: 'muted', text: label}), h(ctx.doc, 'span', {text: value == null || value === '' ? '—' : String(value)}));
  return row;
}

function badge(ctx, text) {
  return h(ctx.doc, 'span', {className: 'badge', text});
}

function button(ctx, spec) {
  const node = h(ctx.doc, 'button', {type: 'button', className: spec.primary ? 'btn btn-primary' : 'btn', text: spec.label});
  if (spec.action) node.setAttribute('data-action', spec.action);
  if (spec.testid) node.setAttribute('data-testid', spec.testid);
  if (spec.name) node.setAttribute('data-name', spec.name);
  if (spec.value != null) node.setAttribute('data-value', String(spec.value));
  if (spec.id) node.setAttribute('data-id', spec.id);
  if (spec.cost != null && Number.isFinite(spec.cost)) node.setAttribute('data-cost', String(spec.cost));
  if (spec.pressed != null) node.setAttribute('aria-pressed', spec.pressed ? 'true' : 'false');
  if (spec.disabled) node.disabled = true;
  return node;
}

function listen(node, fn) {
  node.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    fn(event);
  });
}

function h(doc, tag, attrs, children) {
  const node = doc.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'className') node.className = String(value);
      else if (key === 'text') node.textContent = String(value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (children != null) append(node, children);
  return node;
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else if (typeof child === 'object' && child.nodeType) node.appendChild(child);
    else node.appendChild(node.ownerDocument.createTextNode(String(child)));
  }
}

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = META_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

function captureFocus(container) {
  const active = container.ownerDocument?.activeElement;
  if (active && active !== container.ownerDocument.body && container.contains(active)) {
    const id = active.getAttribute?.('data-testid');
    if (id) local.focus = id;
  }
}

function restoreFocus(root) {
  const id = local.focus;
  local.focus = null;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return;
  const next = root.querySelector(`[data-testid="${id}"]`);
  if (typeof next?.focus !== 'function') return;
  try {
    next.focus({preventScroll: true});
  } catch {
    next.focus();
  }
  if (typeof next.setSelectionRange === 'function' && typeof next.value === 'string') {
    const end = next.value.length;
    next.setSelectionRange(end, end);
  }
}

function startRun(ctx) {
  if (local.starting) return;
  local.starting = true;
  try {
    startRunBody(ctx);
  } finally {
    local.starting = false;
  }
}

function startRunBody(ctx) {
  if (runIsLive(ctx.run) && !local.confirmStart) {
    local.confirmStart = true;
    ctx.rerender();
    return;
  }
  local.confirmStart = false;
  const payload = {
    difficulty: selectedDifficulty(ctx.profile),
    expedition: selectedExpedition(ctx.rawProfile || ctx.profile)
  };
  const seed = readSeed(local.seed);
  if (seed !== undefined) payload.seed = seed;
  const result = act(ctx, 'start', payload);
  if (result && result.ok === false) {
    local.flash = result.reason || 'locked';
    ctx.rerender();
    return;
  }
  act(ctx, 'screen', {name: 'battle'});
}

function goBattle(ctx, action) {
  const result = act(ctx, action);
  if (result && result.ok === false) {
    local.flash = result.reason || 'locked';
    ctx.rerender();
    return;
  }
  act(ctx, 'screen', {name: 'battle'});
}

function act(ctx, action, payload) {
  try {
    return ctx.api?.act?.(action, payload);
  } catch (error) {
    local.flash = String(error?.message || error || 'importError');
    return {ok: false, reason: local.flash};
  }
}

function actQuiet(ctx, action, payload) {
  try {
    return ctx.api?.act?.(action, payload);
  } catch {
    return null;
  }
}

function appendEffect(ctx, card, entry) {
  const effect = effectObject(entry);
  if (!effect) return;
  if (effect.interval != null || effect.projectileSpeed != null || effect.mechanics || effect.aura || effect.burn) {
    const stats = statBlock(ctx, effect);
    if (stats) card.append(stats);
    return;
  }
  for (const [key, value] of bonusEntries(effect)) {
    card.append(line(ctx, bonusLabel(ctx, key), formatBonusValue(key, value, ctx.lang)));
  }
  if (effect.poison && typeof effect.poison === 'object') appendPoison(ctx, card, effect.poison);
}

function noteResult(ctx, result, okKey) {
  if (result && typeof result === 'object' && result.ok === false) local.flash = result.reason || 'locked';
  else if (okKey) local.flash = okKey;
  else local.flash = null;
  ctx.rerender();
}

function exportTextFrom(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  if (typeof result.text === 'string') return result.text;
  if (typeof result.json === 'string') return result.json;
  if (typeof result.data === 'string') return result.data;
  return '';
}

function copyText(ctx, text) {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    local.flash = tx(ctx.api, ctx.lang, 'copyUnavailable', 'Select the save text to copy it.', '请选中存档文本进行复制。');
    ctx.rerender();
    return;
  }
  clipboard.writeText(text).then(() => {
    local.flash = tx(ctx.api, ctx.lang, 'copySave', 'Copy save', '复制存档');
    ctx.rerender();
  }).catch(() => {
    local.flash = tx(ctx.api, ctx.lang, 'copyUnavailable', 'Select the save text to copy it.', '请选中存档文本进行复制。');
    ctx.rerender();
  });
}

function screenName(screen) {
  return SCREENS.has(screen) ? screen : screen === 'battle' ? 'battle' : 'menu';
}

function languageOf(profile) {
  return profile?.settings?.language === 'zh' ? 'zh' : 'en';
}

function viewProfile(profile, lang) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const permanent = {...(source.permanent && typeof source.permanent === 'object' ? source.permanent : {})};
  for (const key of PERMANENT_ORDER) if (!Number.isFinite(permanent[key])) permanent[key] = 0;
  return {
    currency: Number.isFinite(source.currency) ? source.currency : 0,
    equipmentOwned: Array.isArray(source.equipmentOwned) ? source.equipmentOwned.filter(id => typeof id === 'string') : [],
    equipped: {weapon: null, charm: null, armor: null, ...(source.equipped && typeof source.equipped === 'object' ? source.equipped : {})},
    permanent,
    best: source.best && typeof source.best === 'object' ? source.best : {},
    settings: {
      language: settings.language === 'zh' ? 'zh' : lang,
      sound: settings.sound === true,
      reducedMotion: settings.reducedMotion === true,
      difficulty: DIFFICULTIES[settings.difficulty] ? settings.difficulty : 'normal'
    }
  };
}

function selectedDifficulty(profile) {
  if (local.difficulty && DIFFICULTIES[local.difficulty]) return local.difficulty;
  if (DIFFICULTIES[profile?.settings?.difficulty]) return profile.settings.difficulty;
  return 'normal';
}

function selectedExpedition(profile) {
  if (local.expedition == null) {
    const saved = profile?.settings?.expedition;
    local.expedition = typeof saved === 'string' && Object.prototype.hasOwnProperty.call(EXPEDITIONS, saved) ? saved : 'watch';
  }
  if (!Object.prototype.hasOwnProperty.call(EXPEDITIONS, local.expedition)) local.expedition = 'watch';
  return local.expedition;
}

function expeditionClears(profile, id) {
  const book = profile?.expeditions;
  const row = book && typeof book === 'object' && !Array.isArray(book) ? book[id] : null;
  const clears = row && typeof row === 'object' ? row.clears : null;
  return typeof clears === 'number' && Number.isFinite(clears) && clears > 0 ? clears : 0;
}

function runIsLive(run) {
  if (!run?.runId) return false;
  return run.phase !== 'victory' && run.phase !== 'defeat';
}

function runIsFinished(run) {
  return run?.phase === 'victory' || run?.phase === 'defeat' || !!run?.settlement;
}

function phaseLabel(ctx) {
  const phase = ctx.run?.phase;
  if (phase === 'victory') return t(ctx.api, 'victory');
  if (phase === 'defeat') return t(ctx.api, 'defeat');
  if (phase === 'draft' || phase === 'placing') return t(ctx.api, 'planning');
  if (ctx.run?.paused) return tx(ctx.api, ctx.lang, 'paused', 'Paused', '已暂停');
  return t(ctx.api, 'resume');
}

function outcomeText(ctx, outcome) {
  return resultLabel(ctx.lang, outcome);
}

function readUI(api) {
  try {
    const ui = api?.getUI?.();
    return ui && typeof ui === 'object' ? ui : {};
  } catch {
    return {};
  }
}

function messageText(api, lang, ui) {
  const message = ui?.message;
  if (message == null || message === '') return '';
  if (typeof message === 'object') return textOf(message, lang);
  return tx(api, lang, String(message));
}

function t(api, key, vars) {
  if (!key) return '';
  try {
    const value = typeof api?.t === 'function' ? api.t(key, vars) : key;
    if (typeof value === 'string' && value) return value;
  } catch {
    /* Fall back to the key. */
  }
  return String(key);
}

function tx(api, lang, key, en, zh) {
  const translated = key ? t(api, key) : '';
  if (translated && translated !== key) return translated;
  if (lang === 'zh' && zh) return zh;
  if (en) return en;
  return translated || key || '';
}

function textOf(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    const localized = localize(value, lang === 'zh' ? 'zh' : 'en');
    if (typeof localized === 'string' && localized) return localized;
  } catch {
    /* Read the bilingual object directly. */
  }
  if (typeof value === 'object') return value[lang] || value.en || value.zh || '';
  return '';
}

function num(value, lang, digits = null) {
  if (!Number.isFinite(value)) return '—';
  const shown = digits == null ? value : round(value, digits);
  try {
    const formatted = formatNumber(shown, lang === 'zh' ? 'zh' : 'en');
    if (typeof formatted === 'string' && formatted) return formatted;
    if (typeof formatted === 'number' && Number.isFinite(formatted)) return String(formatted);
  } catch {
    /* Use a plain decimal below. */
  }
  return String(shown);
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function percent(value, lang) {
  if (!Number.isFinite(value)) return '—';
  return `${num(value * 100, lang, Math.abs(value * 100) >= 10 ? 0 : 1)}%`;
}

function signed(text, value) {
  if (!Number.isFinite(value) || value <= 0) return text;
  return text.startsWith('+') || text.startsWith('-') ? text : `+${text}`;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatMaybe(value, lang) {
  return Number.isFinite(value) ? num(value, lang, Number.isInteger(value) ? 0 : 1) : '—';
}

function pickNumber(primary, primaryKey, fallback, fallbackKey) {
  if (primary && Number.isFinite(primary[primaryKey])) return primary[primaryKey];
  if (fallback && Number.isFinite(fallback[fallbackKey])) return fallback[fallbackKey];
  return null;
}

function readSeed(raw) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value >>> 0;
}

function catalogEntries(source) {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source.map((item, index) => decorateEntry(item, item?.id ?? String(index)));
  }
  if (typeof source !== 'object') return [];
  return Object.entries(source).map(([key, item]) => decorateEntry(item, key));
}

function decorateEntry(item, key) {
  const entry = item && typeof item === 'object' ? {...item} : {};
  entry.id = typeof entry.id === 'string' && entry.id ? entry.id : String(key);
  return entry;
}

function orderedBy(entries, order) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return entries.slice().sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length) || String(a.id).localeCompare(String(b.id)));
}

function slotGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const slot = SLOT_ORDER.includes(item.slot) ? item.slot : (item.slot || 'weapon');
    if (!groups.has(slot)) groups.set(slot, []);
    groups.get(slot).push(item);
  }
  const slots = [...SLOT_ORDER, ...[...groups.keys()].filter(slot => !SLOT_ORDER.includes(slot))];
  return slots.filter(slot => groups.has(slot)).map(slot => ({
    id: slot,
    items: groups.get(slot).slice().sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || String(a.id).localeCompare(String(b.id)))
  }));
}

function entryName(entry, lang, fallback) {
  return textOf(entry?.name ?? entry?.title ?? entry?.label, lang) || String(fallback ?? '');
}

function entryDesc(entry, lang) {
  return textOf(entry?.description ?? entry?.text ?? entry?.summary, lang);
}

function parentName(type, lang) {
  if (type && typeof type === 'object') return entryName(type, lang, type.id || '');
  return entryName(TOWERS?.[type], lang, String(type ?? ''));
}

function parentTypeId(parent) {
  if (typeof parent === 'string') return parent.trim();
  if (parent && typeof parent === 'object') {
    if (typeof parent.type === 'string' && parent.type.trim()) return parent.type.trim();
    if (typeof parent.id === 'string' && parent.id.trim()) return parent.id.trim();
  }
  return '';
}

/** Base tower types currently placed on the battle board. Hybrids and the hero do not count as parents. */
function boardParentTypes(run) {
  const present = new Set();
  const slots = Array.isArray(run?.slots) ? run.slots : [];
  for (const slot of slots) {
    const unit = slot && typeof slot === 'object' ? slot.unit : null;
    if (!unit || typeof unit !== 'object') continue;
    if (unit.kind === 'hero' || unit.kind === 'hybrid' || unit.type === 'hero') continue;
    const type = typeof unit.type === 'string' ? unit.type : '';
    if (BASE_TYPES.includes(type)) present.add(type);
  }
  return present;
}

function recipeParentList(recipe) {
  if (Array.isArray(recipe?.parents)) return recipe.parents;
  if (Array.isArray(recipe?.ingredients)) return recipe.ingredients;
  return [];
}

function parentsReady(parents, present) {
  if (!Array.isArray(parents) || parents.length < 2 || !present) return false;
  const ids = [];
  for (const parent of parents) {
    const id = parentTypeId(parent);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length < 2) return false;
  return ids.every(id => present.has(id));
}

function unitStatsOf(entry) {
  if (entry?.stats && typeof entry.stats === 'object') return entry.stats;
  const keys = ['damage', 'interval', 'range', 'critChance', 'splash', 'chain', 'pierce', 'aura', 'burn', 'slow', 'poison'];
  if (keys.some(key => entry?.[key] != null)) return entry;
  return null;
}

function effectObject(entry) {
  for (const key of ['bonuses', 'bonus', 'stats', 'effect', 'statEffect']) {
    const value = entry?.[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    if (typeof value.stat === 'string' && Number.isFinite(value.amount)) return {[value.stat]: value.amount};
    return value;
  }
  return null;
}

function perLevelBonus(upgrade) {
  for (const key of ['perLevel', 'bonusPerLevel', 'amount', 'step']) {
    if (Number.isFinite(upgrade?.[key])) return {[upgrade.bonusKey || upgrade.stat || upgrade.id]: upgrade[key]};
  }
  return effectObject(upgrade);
}

function bonusEntries(bonuses) {
  if (!bonuses || typeof bonuses !== 'object' || Array.isArray(bonuses)) return [];
  return Object.entries(bonuses).filter(([, value]) => Number.isFinite(value) && value !== 0);
}

const EQUIP_BONUS_ORDER = ['damage', 'haste', 'range', 'critChance', 'crit', 'fence', 'vitality', 'reward'];

function equippedBonusLine(ctx, item) {
  const effects = bonusEntries(item?.bonuses || item?.bonus);
  const rank = new Map(EQUIP_BONUS_ORDER.map((key, index) => [key, index]));
  effects.sort((a, b) => (rank.get(a[0]) ?? EQUIP_BONUS_ORDER.length) - (rank.get(b[0]) ?? EQUIP_BONUS_ORDER.length) || String(a[0]).localeCompare(String(b[0])));
  if (!effects.length) return '—';
  return effects.map(([key, value]) => equippedBonusPhrase(ctx, key, value)).join(' · ');
}

function equippedBonusPhrase(ctx, key, value) {
  const shown = formatBonusValue(key, value, ctx.lang);
  if (key === 'fence' || key === 'vitality') {
    return `${bonusLabel(ctx, 'fence')} ${shown}`;
  }
  const heroLabel = {
    damage: ['Hero damage', '英雄伤害'],
    haste: ['Hero attack speed', '英雄攻击速度'],
    range: ['Hero range', '英雄射程'],
    critChance: ['Hero crit chance', '英雄暴击率'],
  }[key];
  if (heroLabel) return `${ctx.lang === 'zh' ? heroLabel[1] : heroLabel[0]} ${shown}`;
  return `${bonusLabel(ctx, key)} ${shown}`;
}

function upgradeCap(upgrade) {
  for (const key of ['cap', 'max', 'maxLevel']) {
    if (Number.isFinite(upgrade?.[key])) return upgrade[key];
  }
  return null;
}

function upgradeCost(upgrade, level, profile) {
  if (!upgrade) return null;
  const table = Array.isArray(upgrade.costs) ? upgrade.costs : Array.isArray(upgrade.cost) ? upgrade.cost : null;
  if (table) return Number.isFinite(table[level]) ? table[level] : null;
  if (typeof upgrade.cost === 'function') {
    try {
      const value = upgrade.cost(level, profile);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }
  if (upgrade.cost && typeof upgrade.cost === 'object') {
    if (Number.isFinite(upgrade.cost[level])) return upgrade.cost[level];
    if (Number.isFinite(upgrade.cost.base)) {
      const growth = Number.isFinite(upgrade.cost.growth) ? upgrade.cost.growth : 1;
      const value = upgrade.cost.base * (growth ** level);
      return Number.isFinite(value) ? Math.round(value) : null;
    }
  }
  if (Number.isFinite(upgrade.cost)) return upgrade.cost;
  if (Number.isFinite(upgrade.price)) return upgrade.price;
  return null;
}

function permanentLevel(profile, id) {
  const value = profile?.permanent?.[id];
  return Number.isFinite(value) ? value : 0;
}

function profileBonuses(profile) {
  const empty = {damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0, ok: false};
  if (!profile || typeof getProfileBonuses !== 'function') return empty;
  try {
    const got = getProfileBonuses(clone(profile));
    if (!got || typeof got !== 'object') return empty;
    const out = {...empty, ok: true};
    for (const key of ['damage', 'haste', 'range', 'critChance', 'fence', 'reward']) {
      if (Number.isFinite(got[key])) out[key] = got[key];
    }
    return out;
  } catch {
    return empty;
  }
}

function profileBonusLabel(ctx, key) {
  const named = {
    damage: ['Hero damage', '英雄伤害'],
    haste: ['Hero attack speed', '英雄攻击速度'],
    range: ['Hero range', '英雄射程'],
    critChance: ['Hero crit chance', '英雄暴击率'],
  }[key];
  if (named) return ctx.lang === 'zh' ? named[1] : named[0];
  return bonusLabel(ctx, key);
}

function bonusLabel(ctx, key) {
  const labels = {
    damage: ['damage', 'Damage', '伤害'],
    damageAdd: ['damage', 'Damage', '伤害'],
    haste: ['haste', 'Haste', '攻速'],
    range: ['range', 'Range', '射程'],
    critChance: ['crit', 'Crit chance', '暴击率'],
    critMultiplier: ['critMultiplier', 'Crit multiplier', '暴击倍率'],
    crit: ['crit', 'Crit', '暴击'],
    fence: ['fenceBonus', 'Fence HP', '栅栏生命'],
    reward: ['rewardMultiplier', 'Reward', '奖励'],
    vitality: ['fenceBonus', 'Fence HP', '栅栏生命'],
    splash: ['splash', 'Splash', '溅射'],
    chain: ['chain', 'Chain', '连锁'],
    chainRange: ['chainRange', 'Chain range', '连锁范围'],
    pierce: ['pierce', 'Pierce', '穿透'],
    projectileSpeed: ['projectileSpeed', 'Projectile speed', '弹速']
  };
  const entry = labels[key];
  if (!entry) return String(key);
  return tx(ctx.api, ctx.lang, entry[0], entry[1], entry[2]);
}

function slotLabel(ctx, slot) {
  const labels = {
    weapon: ['weapon', 'Weapon', '武器'],
    charm: ['charm', 'Charm', '护符'],
    armor: ['armor', 'Armor', '护甲']
  };
  const entry = labels[slot];
  if (!entry) return String(slot);
  return tx(ctx.api, ctx.lang, entry[0], entry[1], entry[2]);
}

function formatBonusValue(key, value, lang) {
  if (!Number.isFinite(value)) return '—';
  if (PIXEL_KEYS.has(key) || key === 'damageAdd' || key === 'pierce') return signed(num(value, lang, 0), value);
  if (key === 'critMultiplier') return signed(num(value, lang, 1), value);
  if (FLAT_KEYS.has(key)) return signed(num(value, lang, Number.isInteger(value) ? 0 : 1), value);
  if (FRACTION_KEYS.has(key) && Math.abs(value) <= 1.5) return signed(percent(value, lang), value);
  return signed(num(value, lang, 2), value);
}

function appendPoison(ctx, card, poison) {
  const dps = Number(poison.dps);
  const duration = Number(poison.duration);
  if (!Number.isFinite(dps) && !Number.isFinite(duration)) return;
  const lang = ctx.lang === 'zh' ? 'zh' : 'en';
  const amount = num(dps, lang, Number.isInteger(dps) ? 0 : 1);
  const seconds = num(duration, lang, Number.isInteger(duration) ? 0 : 1);
  const value = lang === 'zh' ? `${amount}/秒，${seconds} 秒` : `${amount}/s for ${seconds}s`;
  card.append(line(ctx, lang === 'zh' ? '毒素' : 'Poison', value));
}

function dotText(ctx, effect) {
  const parts = [];
  if (Number.isFinite(effect.dps)) parts.push(`${num(effect.dps, ctx.lang, 2)}${ctx.lang === 'zh' ? '/秒' : '/s'}`);
  if (Number.isFinite(effect.duration)) parts.push(`${num(effect.duration, ctx.lang, 1)} s`);
  return parts.join(' · ') || '—';
}

const MECHANIC_LABELS = {
  projectile: ['Projectile', '投射'],
  crit: ['Crit', '暴击'],
  pierce: ['Pierce', '穿透'],
  splash: ['Splash', '溅射'],
  burn: ['Burn', '燃烧'],
  slow: ['Slow', '减速'],
  chain: ['Chain', '连锁'],
  poison: ['Poison', '毒素'],
  aura: ['Aura', '光环'],
  stun: ['Stun', '眩晕'],
  execute: ['Execute', '处决'],
};

function mechanicText(mechanic, lang) {
  if (typeof mechanic === 'string') {
    const pair = MECHANIC_LABELS[mechanic];
    if (pair) return lang === 'zh' ? pair[1] : pair[0];
    return mechanic;
  }
  if (!mechanic || typeof mechanic !== 'object') return '';
  const name = textOf(mechanic.name ?? mechanic.id, lang);
  const description = textOf(mechanic.description, lang);
  return description || name;
}

function appendEndlessOffer(ctx, card) {
  const {doc, api, lang, run} = ctx;
  const settlement = run?.settlement && typeof run.settlement === 'object' ? run.settlement : null;
  const outcome = settlement?.result || run?.phase;
  if (!run || run.phase !== 'victory' || run.endless === true || outcome !== 'victory') return;
  if (local.endlessDismissed === run.runId) return;
  card.append(h(doc, 'p', {
    'data-testid': 'endless-offer',
    text: tx(api, lang, 'endlessOffer',
      'Enter endless? The victory reward is already saved.',
      '进入无尽？胜利报酬已经保存。')
  }));
  card.append(h(doc, 'p', {
    'data-testid': 'endless-note',
    text: tx(api, lang, 'endlessNote',
      'Endless does not pay the main reward again.',
      '无尽不会再次发放主线报酬。')
  }));
  const enter = button(ctx, {
    action: 'endless',
    testid: 'btn-results-endless',
    label: tx(api, lang, 'endlessEnter', 'Enter endless', '进入无尽'),
    primary: true
  });
  listen(enter, () => act(ctx, 'endless'));
  const stay = button(ctx, {
    action: 'endlessStay',
    testid: 'btn-endless-stay',
    label: tx(api, lang, 'endlessStay', 'Not now', '暂不进入')
  });
  listen(stay, () => {
    local.endlessDismissed = run.runId;
    ctx.rerender();
  });
  const row = h(doc, 'div', {className: 'meta-actions'});
  row.append(enter, stay);
  card.append(row);
}

function pressureText(ctx, entry) {
  const parts = [
    ['enemyHealth', 'Enemy health', '敌人生命', entry.health],
    ['enemySpeed', 'Enemy speed', '敌人速度', entry.speed],
    ['enemyDamage', 'Enemy damage', '敌人伤害', entry.damage],
    ['pressureCount', 'Enemy count', '敌人数量', entry.count],
  ];
  return parts
    .filter(([, , , value]) => Number.isFinite(value))
    .map(([key, en, zh, value]) => `${tx(ctx.api, ctx.lang, key, en, zh)} ×${num(value, ctx.lang, 2)}`)
    .join(' · ');
}

function onOff(ctx, on) {
  return on ? tx(ctx.api, ctx.lang, 'on', 'On', '开启') : tx(ctx.api, ctx.lang, 'off', 'Off', '关闭');
}

function formatBestValue(value, api, lang) {
  if (typeof value === 'number' && Number.isFinite(value)) return num(value, lang);
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const parts = [];
  for (const key of ['wave', 'kills', 'time', 'currency']) {
    if (!Number.isFinite(value[key])) continue;
    parts.push(`${t(api, key)} ${key === 'time' ? formatClock(value[key]) : num(value[key], lang)}`);
  }
  return parts.join(' · ');
}

function cssId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '-');
}
