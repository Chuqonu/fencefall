import {ARENA, DIFFICULTIES, canPlan, clone, hitSlot, slotGeometry} from './shared.js';
import {advance, createProfile, createRun, exportRun, integrationInfo, prepare, setSpeed, takeEvents} from './engine.js';

const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
export const ACTIONS = Object.freeze(['start', 'resume', 'restart', 'abandon', 'pause', 'speed', 'language', 'sound', 'reducedMotion', 'screen', 'selectSlot', 'move', 'chooseDraft', 'place', 'cancelPlacement', 'mergePreview', 'mergeConfirm', 'mergeCancel', 'buyEquipment', 'equip', 'upgradePermanent', 'exportSave', 'importSave', 'hover']);

const TEXT = {
  en:{
    title:'Fencefall', subtitle:'最后一道防线', play:'Play', continue:'Continue', restart:'Restart', back:'Back',
    pause:'Pause', resume:'Resume', speed:'Speed', language:'Language', sound:'Sound', soundOn:'Sound on', soundOff:'Sound off',
    reducedMotion:'Reduced motion', difficulty:'Difficulty', fence:'Fence', wave:'Wave', xp:'XP', kills:'Kills', time:'Time',
    currency:'Cores', results:'Results', victory:'Victory', defeat:'Defeat', settings:'Settings', howto:'How to play',
    armory:'Armory', codex:'Codex', menu:'Menu', abandon:'Abandon', newRun:'New run', rewardMultiplier:'Reward',
    chooseOneOfThree:'Choose one of three', chooseSlot:'Choose a slot', mergePreview:'Merge preview', mergeConfirm:'Confirm merge',
    mergeCancel:'Cancel merge', heroProtected:'The hero never merges', notPlanning:'Pause to move or merge', unavailable:'Not integrated yet',
    noSave:'No saved run', settlementPending:'Rewards are not settled until the progression module is present',
    helpFence:'Enemies advance from above and damage only the fence.', helpDraft:'Each draft offers three towers or hero upgrades.',
    helpMerge:'Pause, then combine equal ranks. The hero stays independent.', helpRange:'A selected defender shows the range it can actually reach.',
    systems:'Systems online', missing:'Still waiting', exportSave:'Export', importSave:'Import', close:'Close', replace:'Replace',
    'not-planning':'Pause to move or merge', 'no-run':'Start a run first', 'bad-phase':'Not available right now', 'bad-slot':'Choose a defender slot',
    'bad-speed':'Speed stays at 1, 1.5, or 3', 'emptySlot':'Choose occupied slots', 'replaceConfirm':'Confirm replacement', 'bad-choice':'Choose one of the three cards',
    'unknown-action':'Unknown action', error:'Something went wrong', 'bad-language':'Language is English or Chinese', 'bad-screen':'Unknown screen', 'importError':'Import failed',
  },
  zh:{
    title:'最后一道防线', subtitle:'Fencefall', play:'开始', continue:'继续', restart:'重新开始', back:'返回',
    pause:'暂停', resume:'继续游戏', speed:'速度', language:'语言', sound:'声音', soundOn:'声音开', soundOff:'声音关',
    reducedMotion:'减少动态', difficulty:'难度', fence:'栅栏', wave:'波次', xp:'经验', kills:'击破', time:'时间',
    currency:'核心', results:'结算', victory:'守住了', defeat:'栅栏倒下', settings:'设置', howto:'玩法',
    armory:'武备', codex:'图鉴', menu:'主菜单', abandon:'放弃本局', newRun:'新的一局', rewardMultiplier:'奖励',
    chooseOneOfThree:'三选一', chooseSlot:'选择一个空位', mergePreview:'合成预览', mergeConfirm:'确认合成',
    mergeCancel:'取消合成', heroProtected:'英雄不能合成', notPlanning:'暂停后才能移动或合成', unavailable:'这个模块还没接入',
    noSave:'没有可继续的存档', settlementPending:'进度模块接入前，这一局不会发放奖励',
    helpFence:'敌人从上方进入，只攻击共同的栅栏。', helpDraft:'每次整备给出三个新塔或英雄强化。',
    helpMerge:'先暂停，再把同等级单位合成。英雄始终独立。', helpRange:'选中防守单位后，能看到它真正打得到的范围。',
    systems:'已接入系统', missing:'还在等待', exportSave:'导出', importSave:'导入', close:'关闭', replace:'替换',
    'not-planning':'暂停后才能移动或合成', 'no-run':'先开始一局', 'bad-phase':'现在不能这么做', 'bad-slot':'请选择防守格',
    'bad-speed':'速度只能是 1、1.5 或 3', 'emptySlot':'请选择有单位的格子', 'replaceConfirm':'需要确认替换', 'bad-choice':'请选择三张牌中的一张',
    'unknown-action':'未知操作', error:'出错了', 'bad-language':'语言只能是中文或英文', 'bad-screen':'未知界面', 'importError':'导入失败',
  },
};

const OPTIONAL = [
  ['hero', './systems/hero.js'],
  ['merges', './systems/merges.js'],
  ['drafts', './systems/drafts.js'],
  ['progression', './systems/progression.js'],
  ['storage', './storage.js'],
  ['i18n', './i18n.js'],
  ['towers', './data/towers.js'],
  ['recipes', './data/recipes.js'],
  ['waves', './systems/waves.js'],
  ['shell', './ui/shell.js'],
  ['build', './ui/build-panel.js'],
  ['meta', './ui/meta-panel.js'],
  ['renderer', './render/renderer.js'],
  ['audio', './audio.js'],
];

function detectLanguage() {
  const value = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language || 'en';
  return String(value).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function resultOf(value, reason = 'error') {
  if (value && typeof value === 'object' && typeof value.ok === 'boolean') return value;
  return {ok:false, reason};
}

function integerSlot(index) {
  return Number.isInteger(index) && index >= 0 && index < 10;
}

async function loadOptional() {
  const loaded = {};
  await Promise.all(OPTIONAL.map(async ([key, href]) => {
    try {
      loaded[key] = await import(href);
    } catch {
      loaded[key] = null;
    }
  }));
  return loaded;
}

export async function createController(options = {}) {
  const modules = await loadOptional();
  const injected = options.storage || null;
  let profile = options.profile || null;
  let run = null;
  let storedRun = null;
  let audio = null;
  const settledIds = new Set();
  const ui = {screen:'menu', selectedSlot:-1, hoverSlot:-1, mergeFrom:-1, mergePreview:null, message:'', exportText:''};

  function storageCall(name, args) {
    const fn = modules.storage && modules.storage[name];
    if (typeof fn !== 'function') return undefined;
    return injected ? fn(...args, injected) : fn(...args);
  }

  function loadProfile() {
    try {
      const loaded = storageCall('loadProfile', []);
      if (loaded && typeof loaded === 'object' && loaded.settings) return loaded;
    } catch (error) {
      console.error('[fencefall] profile load failed', error);
    }
    return null;
  }

  function loadStoredRun() {
    try {
      const loaded = storageCall('loadRun', []);
      if (loaded && typeof loaded === 'object' && Array.isArray(loaded.slots)) return loaded;
    } catch (error) {
      console.error('[fencefall] run load failed', error);
    }
    return null;
  }

  if (!profile) profile = loadProfile() || createProfile(detectLanguage());
  storedRun = loadStoredRun();
  if (storedRun && storedRun.phase === 'playing') storedRun.paused = true;

  function saveProfile() {
    try { storageCall('saveProfile', [profile]); } catch (error) { console.error('[fencefall] profile save failed', error); }
  }
  function saveRun() {
    if (!run) return;
    try { storageCall('saveRun', [exportRun(run)]); } catch (error) { console.error('[fencefall] run save failed', error); }
  }

  function translate(key, vars) {
    const language = profile.settings?.language === 'zh' ? 'zh' : 'en';
    const aliases = {
      'not-planning':'notPlanning', 'bad-slot':'invalidSlot', 'no-run':'noSave', 'bad-choice':'invalidChoice',
      replaceConfirm:'replaceRequired', not_planning:'notPlanning', hero_protected:'heroProtected', invalid_slot:'invalidSlot',
      empty_slot:'emptySlot', same_slot:'sameSlot', rank_mismatch:'rankMismatch', rank_cap:'maxRank', no_recipe:'noRecipe',
      hybrid_locked:'hybridMix', invalid_merge:'invalidMerge',
    };
    const lookupKey = aliases[key] || key;
    if (typeof modules.i18n?.t === 'function') {
      try {
        const value = modules.i18n.t(language, lookupKey, vars || {});
        if (typeof value === 'string' && value !== lookupKey && value !== key) return value;
      } catch (error) {
        console.error(error);
      }
    }
    let text = TEXT[language][lookupKey] || TEXT.en[lookupKey] || TEXT[language][key] || TEXT.en[key] || lookupKey;
    if (vars) for (const [name, replacement] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(replacement));
    return text;
  }

  function maybeSettle() {
    if (!run || (run.phase !== 'victory' && run.phase !== 'defeat')) return null;
    if (run.settlement || settledIds.has(run.runId)) return run.settlement || null;
    settledIds.add(run.runId);
    if (typeof modules.progression?.settleRun !== 'function') return null;
    try {
      const settled = modules.progression.settleRun(profile, run);
      saveProfile();
      saveRun();
      return settled;
    } catch (error) {
      console.error('[fencefall] settlement failed', error);
      ui.message = 'error';
      return null;
    }
  }

  function settleTerminal() {
    if (!run) return {ok:false, reason:'no-run'};
    if (run.phase !== 'victory' && run.phase !== 'defeat') return {ok:false, reason:'bad-phase'};
    maybeSettle();
    if (ui.screen === 'battle') ui.screen = 'results';
    return {ok:true, settlement:run.settlement || null};
  }

  function perform(action, payload) {
    if (action === 'start') {
      const requested = payload.difficulty || profile.settings?.difficulty || 'normal';
      const difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTIES, requested) ? requested : 'normal';
      profile.settings.difficulty = difficulty;
      const seed = Number.isFinite(Number(payload.seed)) ? Number(payload.seed) >>> 0 : Math.floor(Math.random() * 0x100000000) >>> 0;
      run = createRun({seed, difficulty, profile, runId:typeof payload.runId === 'string' ? payload.runId : undefined});
      prepare(run);
      ui.screen = 'battle';
      ui.selectedSlot = -1;
      ui.mergeFrom = -1;
      ui.mergePreview = null;
      ui.exportText = '';
      saveProfile();
      saveRun();
      return {ok:true};
    }
    if (action === 'restart') {
      const difficulty = run?.difficulty || profile.settings?.difficulty || 'normal';
      return perform('start', {difficulty, seed:payload.seed});
    }
    if (action === 'resume') {
      if (!run) {
        if (!storedRun) storedRun = loadStoredRun();
        if (!storedRun) return {ok:false, reason:'noSave'};
        run = storedRun;
        storedRun = null;
        if (run.phase === 'playing') run.paused = true;
        prepare(run);
        ui.screen = 'battle';
        return {ok:true, paused:run.paused === true};
      }
      if (run.hiddenPaused) {
        run.hiddenPaused = false;
        ui.screen = 'battle';
        saveRun();
        return {ok:true, paused:run.paused === true};
      }
      run.paused = false;
      ui.screen = 'battle';
      saveRun();
      return {ok:true, paused:false};
    }
    if (action === 'pause') {
      if (!run) return {ok:false, reason:'no-run'};
      if (run.phase === 'victory' || run.phase === 'defeat') return {ok:false, reason:'bad-phase'};
      run.paused = run.paused !== true;
      saveRun();
      return {ok:true, paused:run.paused};
    }
    if (action === 'abandon') {
      if (!run) return {ok:false, reason:'no-run'};
      if (run.phase !== 'victory' && run.phase !== 'defeat') run.phase = 'defeat';
      ui.screen = 'results';
      saveRun();
      return settleTerminal();
    }
    if (action === 'speed') {
      if (!run) return {ok:false, reason:'no-run'};
      const value = Number(payload.value);
      if (![1, 1.5, 3].includes(value)) return {ok:false, reason:'bad-speed'};
      setSpeed(run, value);
      return {ok:true, speed:run.speed};
    }
    if (action === 'language') {
      if (payload.value !== 'en' && payload.value !== 'zh') return {ok:false, reason:'bad-language'};
      profile.settings.language = payload.value;
      if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = payload.value === 'zh' ? 'zh-CN' : 'en';
      saveProfile();
      return {ok:true};
    }
    if (action === 'sound') {
      const value = typeof payload.value === 'boolean' ? payload.value : profile.settings.sound !== true;
      profile.settings.sound = value;
      try { audio?.setEnabled(value); } catch (error) { console.error(error); }
      saveProfile();
      return {ok:true, sound:value};
    }
    if (action === 'reducedMotion') {
      const value = typeof payload.value === 'boolean' ? payload.value : profile.settings.reducedMotion !== true;
      profile.settings.reducedMotion = value;
      saveProfile();
      return {ok:true, reducedMotion:value};
    }
    if (action === 'screen') {
      if (!SCREENS.includes(payload.name)) return {ok:false, reason:'bad-screen'};
      if ((payload.name === 'battle' || payload.name === 'results') && !run) return {ok:false, reason:'no-run'};
      ui.screen = payload.name;
      return {ok:true};
    }
    if (action === 'hover') {
      ui.hoverSlot = integerSlot(payload.index) ? payload.index : -1;
      return {ok:true};
    }
    if (action === 'selectSlot') {
      if (!run) return {ok:false, reason:'no-run'};
      const index = payload.index;
      if (!integerSlot(index)) return {ok:false, reason:'bad-slot'};
      if (run.phase === 'placing') return perform('place', {index, replace:payload.replace === true});
      const previous = ui.selectedSlot;
      if (previous >= 0 && previous !== index && canRearrange(run)) {
        const origin = run.slots[previous]?.unit;
        const target = run.slots[index]?.unit;
        if (origin && target) return perform('mergePreview', {from:previous, to:index});
        if (origin || target) return perform('move', {from:previous, to:index});
      }
      ui.selectedSlot = previous === index ? -1 : index;
      return {ok:true, index:ui.selectedSlot};
    }
    if (action === 'move') return moveUnits(payload.from, payload.to);
    if (action === 'chooseDraft') return chooseDraft(payload.index);
    if (action === 'place') return placePending(payload.index, payload.replace === true);
    if (action === 'cancelPlacement') return cancelPlacement();
    if (action === 'mergePreview') return previewMerge(payload.from, payload.to);
    if (action === 'mergeConfirm') return confirmMerge(payload.from, payload.to);
    if (action === 'mergeCancel') {
      ui.mergePreview = null;
      ui.mergeFrom = -1;
      return {ok:true};
    }
    if (action === 'buyEquipment') return profileAction('buyEquipment', payload.id);
    if (action === 'equip') return profileAction('equipItem', payload.id);
    if (action === 'upgradePermanent') return profileAction('purchasePermanent', payload.id);
    if (action === 'exportSave') return exportCurrent();
    if (action === 'importSave') return importCurrent(payload.text);
    return {ok:false, reason:'unknown-action'};
  }

  function canRearrange(state) {
    return !!state && state.phase !== 'victory' && state.phase !== 'defeat' && (canPlan(state) || state.phase === 'placing');
  }

  function moveUnits(from, to) {
    if (!run) return {ok:false, reason:'no-run'};
    if (!integerSlot(from) || !integerSlot(to) || from === to) return {ok:false, reason:'bad-slot'};
    if (!canRearrange(run)) return {ok:false, reason:'not-planning'};
    const origin = run.slots[from].unit;
    const target = run.slots[to].unit;
    if (!origin && !target) return {ok:false, reason:'emptySlot'};
    run.slots[from].unit = target;
    run.slots[to].unit = origin;
    ui.selectedSlot = to;
    ui.mergePreview = null;
    ui.mergeFrom = -1;
    saveRun();
    return {ok:true};
  }

  function chooseDraft(index) {
    if (!run) return {ok:false, reason:'no-run'};
    if (run.phase !== 'draft' || !run.draft || !Array.isArray(run.draft.options)) return {ok:false, reason:'bad-phase'};
    if (!Number.isInteger(index) || index < 0 || index > 2) return {ok:false, reason:'bad-choice'};
    if (typeof modules.drafts?.chooseDraft !== 'function') return {ok:false, reason:'unavailable'};
    const choice = resultOf(modules.drafts.chooseDraft(run, index));
    if (choice.ok) saveRun();
    return choice;
  }

  function placePending(index, replace) {
    if (!run) return {ok:false, reason:'no-run'};
    if (run.phase !== 'placing' || !run.pendingUnit) return {ok:false, reason:'bad-phase'};
    if (!integerSlot(index)) return {ok:false, reason:'bad-slot'};
    const occupant = run.slots[index].unit;
    if (occupant?.kind === 'hero' || occupant?.type === 'hero') return {ok:false, reason:'heroProtected'};
    if (occupant && !replace) return {ok:false, reason:'replaceConfirm'};
    if (typeof modules.drafts?.placePending !== 'function') return {ok:false, reason:'unavailable'};
    const placed = resultOf(modules.drafts.placePending(run, index, {replace}));
    if (placed.ok) {
      ui.selectedSlot = index;
      saveRun();
    }
    return placed;
  }

  function cancelPlacement() {
    if (!run) return {ok:false, reason:'no-run'};
    if (run.phase !== 'placing') return {ok:false, reason:'bad-phase'};
    if (typeof modules.drafts?.cancelPlacement === 'function') {
      const cancelled = resultOf(modules.drafts.cancelPlacement(run));
      if (cancelled.ok) saveRun();
      return cancelled;
    }
    if (run.draft?.options?.length === 3) {
      run.pendingUnit = null;
      run.phase = 'draft';
      saveRun();
      return {ok:true};
    }
    return {ok:false, reason:'unavailable'};
  }

  function guardMerge(from, to) {
    if (!run) return {ok:false, reason:'no-run'};
    if (!integerSlot(from) || !integerSlot(to) || from === to) return {ok:false, reason:'bad-slot'};
    if (run.phase === 'victory' || run.phase === 'defeat') return {ok:false, reason:'bad-phase'};
    if (!canPlan(run)) return {ok:false, reason:'not-planning'};
    const origin = run.slots[from]?.unit;
    const target = run.slots[to]?.unit;
    if (origin?.kind === 'hero' || target?.kind === 'hero' || origin?.type === 'hero' || target?.type === 'hero') return {ok:false, reason:'heroProtected'};
    if (!origin || !target) return {ok:false, reason:'emptySlot'};
    return null;
  }

  function previewMerge(from, to) {
    const blocked = guardMerge(from, to);
    if (blocked) return blocked;
    if (typeof modules.merges?.previewMerge !== 'function') return {ok:false, reason:'unavailable'};
    const preview = resultOf(modules.merges.previewMerge(run, from, to));
    ui.mergeFrom = from;
    ui.selectedSlot = to;
    ui.mergePreview = preview;
    return preview;
  }

  function confirmMerge(from, to) {
    const source = Number.isInteger(from) ? from : ui.mergeFrom;
    const target = Number.isInteger(to) ? to : ui.selectedSlot;
    const blocked = guardMerge(source, target);
    if (blocked) return blocked;
    if (typeof modules.merges?.mergeUnits !== 'function') return {ok:false, reason:'unavailable'};
    const merged = resultOf(modules.merges.mergeUnits(run, source, target));
    if (merged.ok) {
      ui.mergePreview = null;
      ui.mergeFrom = -1;
      ui.selectedSlot = target;
      saveRun();
    }
    return merged;
  }

  function profileAction(name, id) {
    const fn = modules.progression && modules.progression[name];
    if (typeof fn !== 'function') return {ok:false, reason:'unavailable'};
    const acted = resultOf(fn(profile, id));
    if (acted.ok) saveProfile();
    return acted;
  }

  function exportCurrent() {
    if (typeof modules.storage?.exportSave !== 'function') return {ok:false, reason:'unavailable'};
    try {
      const text = injected ? modules.storage.exportSave(profile, run ? exportRun(run) : null, injected) : modules.storage.exportSave(profile, run ? exportRun(run) : null);
      if (typeof text !== 'string') return {ok:false, reason:'exportSave'};
      ui.exportText = text;
      return {ok:true, text};
    } catch (error) {
      console.error(error);
      return {ok:false, reason:'exportSave'};
    }
  }

  function importCurrent(text) {
    if (typeof text !== 'string' || text.length === 0) return {ok:false, reason:'importError'};
    if (typeof modules.storage?.importSave !== 'function') return {ok:false, reason:'unavailable'};
    let imported;
    try {
      imported = injected ? modules.storage.importSave(text, injected) : modules.storage.importSave(text);
    } catch (error) {
      console.error(error);
      return {ok:false, reason:'importError'};
    }
    const parsed = resultOf(imported, 'importError');
    if (!parsed.ok) return parsed;
    if (imported.profile && typeof imported.profile === 'object') profile = imported.profile;
    else {
      const loaded = loadProfile();
      if (loaded) profile = loaded;
    }
    const nextRun = imported.run && typeof imported.run === 'object' ? imported.run : loadStoredRun();
    if (nextRun) {
      run = nextRun;
      if (run.phase === 'playing') run.paused = true;
      prepare(run);
      ui.screen = run.phase === 'victory' || run.phase === 'defeat' ? 'results' : 'battle';
    }
    ui.mergePreview = null;
    return {ok:true};
  }

  function act(action, payload = {}) {
    let outcome;
    try {
      outcome = perform(action, payload || {});
    } catch (error) {
      console.error('[fencefall] action failed', action, error);
      outcome = {ok:false, reason:'error'};
    }
    if (!outcome.ok) ui.message = outcome.reason || 'invalid';
    else if (action === 'mergePreview' || (action === 'selectSlot' && ui.mergePreview)) ui.message = 'mergePreview';
    else ui.message = '';
    return outcome;
  }

  const api = {
    getState:() => run,
    getProfile:() => profile,
    t:translate,
    act,
    getUI:() => ({
      screen:ui.screen,
      selectedSlot:ui.selectedSlot,
      hoverSlot:ui.hoverSlot,
      mergeFrom:ui.mergeFrom,
      mergePreview:ui.mergePreview ? copyValue(ui.mergePreview) : null,
      message:ui.message,
      exportText:ui.exportText,
    }),
    setAudio(instance) {
      audio = instance || null;
      try { audio?.setEnabled(profile.settings.sound === true); } catch (error) { console.error(error); }
    },
    unlockAudio() { try { audio?.unlock?.(); } catch (error) { console.error(error); } },
    publish(events) { if (events?.length) try { audio?.playEvents?.(events); } catch (error) { console.error(error); } },
    settleTerminal,
    integration:() => ({engine:integrationInfo(), modules:Object.fromEntries(OPTIONAL.map(([key]) => [key, !!modules[key]]))}),
  };
  return api;
}

function copyValue(value) {
  try { return clone(value); } catch { return {...value}; }
}

function statusLine(api, state, language, ready, online) {
  if (!state) return `${api.t('missing')}: ${online.engine.missing.length}`;
  return `${api.t('fence')} ${formatNumber(Math.max(0, state.fence.hp), language)}/${formatNumber(state.fence.maxHp, language)} · ${api.t('wave')} ${formatNumber(state.wave, language)} · ${api.t('time')} ${formatNumber(Math.floor(state.time), language)}s · ${api.t('systems')} ${ready}/6`;
}

function formatNumber(value, language, i18n) {
  if (typeof i18n?.formatNumber === 'function') {
    try { return i18n.formatNumber(value, language); } catch { /* use Intl below */ }
  }
  try { return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US').format(value); } catch { return String(value); }
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function button(action, label, extra = {}) {
  const node = el('button', 'btn');
  node.type = 'button';
  node.dataset.action = action;
  node.dataset.testid = extra.testid || action;
  node.textContent = label;
  node.style.minHeight = '44px';
  node.style.minWidth = '44px';
  node.style.padding = '8px 12px';
  node.style.touchAction = 'manipulation';
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'testid' || value == null) continue;
    node.dataset[key] = String(value);
  }
  return node;
}

function clear(node) {
  if (node) node.replaceChildren();
}

function payloadFrom(node, root) {
  const action = node.dataset.action;
  const payload = {};
  if (node.dataset.difficulty) payload.difficulty = node.dataset.difficulty;
  if (node.dataset.name) payload.name = node.dataset.name;
  if (node.dataset.index) payload.index = Number(node.dataset.index);
  if (node.dataset.from) payload.from = Number(node.dataset.from);
  if (node.dataset.to) payload.to = Number(node.dataset.to);
  if (node.dataset.value != null) payload.value = action === 'speed' ? Number(node.dataset.value) : node.dataset.value;
  if (action === 'importSave') payload.text = root.querySelector('#import-text')?.value || '';
  return payload;
}

function fillMenu(container, api) {
  clear(container);
  const hud = el('div');
  hud.style.display = 'flex';
  hud.style.flexWrap = 'wrap';
  hud.style.gap = '8px';
  const panel = el('div');
  container.append(hud, panel);
  const view = api.getUI();
  if (view.screen === 'menu') renderMenu(hud, api);
  else if (view.screen === 'results') renderResults(hud, panel, api);
  else renderPage(hud, panel, api, view.screen);
}

function mountFallback(root, api) {
  clear(root);
  const header = el('header');
  const title = el('h1');
  const status = el('p');
  status.id = 'status';
  const hud = el('div');
  hud.style.display = 'flex';
  hud.style.flexWrap = 'wrap';
  hud.style.gap = '8px';
  hud.style.margin = '8px 0';
  const canvas = el('canvas');
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  canvas.dataset.testid = 'battlefield';
  canvas.dataset.role = 'battlefield';
  canvas.setAttribute('aria-label', 'Fencefall battlefield');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.maxWidth = '360px';
  canvas.style.height = 'auto';
  canvas.style.touchAction = 'none';
  canvas.style.imageRendering = 'pixelated';
  const panel = el('div');
  panel.dataset.ui = 'panel';
  const overlay = el('div');
  overlay.dataset.ui = 'overlay';
  const message = el('p');
  header.append(title, status);
  root.append(header, hud, canvas, overlay, panel, message);
  canvas.addEventListener('pointerdown', event => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {x:(event.clientX - rect.left) / rect.width * ARENA.width, y:(event.clientY - rect.top) / rect.height * ARENA.height};
    const index = hitSlot(point.x, point.y);
    if (index >= 0) api.act('selectSlot', {index});
  });
  return {
    canvas,
    render() {
      const state = api.getState();
      const profile = api.getProfile();
      const view = api.getUI();
      const language = profile.settings.language === 'zh' ? 'zh' : 'en';
      title.textContent = `${api.t('title')} · ${api.t('subtitle')}`;
      const online = api.integration();
      const ready = Object.values(online.engine.present).filter(Boolean).length;
      status.textContent = statusLine(api, state, language, ready, online);
      clear(hud);
      clear(panel);
      clear(overlay);
      message.textContent = view.message ? api.t(view.message) : '';
      if (view.screen === 'menu') renderMenu(hud, api);
      else if (view.screen === 'battle') renderBattle(hud, overlay, api);
      else if (view.screen === 'results') renderResults(hud, panel, api);
      else renderPage(hud, panel, api, view.screen);
      if (view.exportText) {
        const box = el('textarea');
        box.readOnly = true;
        box.value = view.exportText;
        box.setAttribute('aria-label', api.t('exportSave'));
        box.style.width = '100%';
        box.style.minHeight = '88px';
        panel.append(box);
      }
    },
  };
}

function renderMenu(hud, api) {
  const profile = api.getProfile();
  for (const id of Object.keys(DIFFICULTIES)) {
    const node = button('start', `${api.t('play')} · ${labelOf(DIFFICULTIES[id].name, profile, api)} ×${DIFFICULTIES[id].reward}`, {testid:`play-${id}`, difficulty:id});
    if (profile.settings.difficulty === id) node.setAttribute('aria-pressed', 'true');
    hud.append(node);
  }
  hud.append(button('resume', api.t('continue'), {testid:'continue'}));
  for (const name of ['armory', 'codex', 'howto', 'settings']) hud.append(button('screen', api.t(name), {testid:name, name}));
  hud.append(button('language', api.t('language'), {testid:'language', value:profile.settings.language === 'zh' ? 'en' : 'zh'}));
}

function renderBattle(hud, overlay, api) {
  const state = api.getState();
  const profile = api.getProfile();
  if (!state) return;
  hud.append(button(state.paused || state.hiddenPaused ? 'resume' : 'pause', api.t(state.paused || state.hiddenPaused ? 'resume' : 'pause'), {testid:'pause'}));
  for (const speed of [1, 1.5, 3]) {
    const node = button('speed', `${api.t('speed')} ${speed}`, {testid:`speed-${String(speed).replace('.', '-')}`, value:speed});
    if (state.speed === speed) node.setAttribute('aria-pressed', 'true');
    hud.append(node);
  }
  hud.append(button('language', profile.settings.language === 'zh' ? 'EN' : '中', {testid:'language', value:profile.settings.language === 'zh' ? 'en' : 'zh'}));
  hud.append(button('sound', profile.settings.sound ? api.t('soundOn') : api.t('soundOff'), {testid:'sound'}));
  hud.append(button('screen', api.t('menu'), {testid:'menu', name:'menu'}));
  hud.append(button('abandon', api.t('abandon'), {testid:'abandon'}));
  if (state.hiddenPaused) {
    const note = el('p');
    note.textContent = api.t('resume');
    overlay.append(note);
  }
  if (state.phase === 'draft' && state.draft?.options) {
    const heading = el('p');
    heading.textContent = api.t('chooseOneOfThree');
    overlay.append(heading);
    state.draft.options.slice(0, 3).forEach((option, index) => {
      overlay.append(button('chooseDraft', optionLabel(option, api), {testid:`draft-${index}`, index}));
    });
  }
  if (state.phase === 'placing') {
    const heading = el('p');
    heading.textContent = api.t('chooseSlot');
    overlay.append(heading, button('cancelPlacement', api.t('close'), {testid:'cancelPlacement'}));
  }
  if (api.getUI().mergePreview) {
    const preview = api.getUI().mergePreview;
    const heading = el('p');
    const language = api.getProfile().settings.language === 'zh' ? 'zh' : 'en';
    const described = preview.description && (preview.description[language] || preview.description.en);
    heading.textContent = described || `${api.t('mergePreview')}: ${api.t(preview.reason || 'invalidMerge')}`;
    overlay.append(heading, button('mergeConfirm', api.t('mergeConfirm'), {testid:'mergeConfirm', from:api.getUI().mergeFrom, to:api.getUI().selectedSlot}), button('mergeCancel', api.t('mergeCancel'), {testid:'mergeCancel'}));
  }
}

function renderResults(hud, panel, api) {
  const state = api.getState();
  const profile = api.getProfile();
  const language = profile.settings.language === 'zh' ? 'zh' : 'en';
  const heading = el('h2');
  heading.textContent = api.t(state?.phase === 'victory' ? 'victory' : 'defeat');
  const detail = el('p');
  if (state?.settlement && Number.isFinite(state.settlement.currency)) detail.textContent = `${api.t('currency')} ${formatNumber(state.settlement.currency, language)}`;
  else detail.textContent = api.t('settlementPending');
  panel.append(heading, detail);
  hud.append(button('restart', api.t('newRun'), {testid:'restart'}), button('screen', api.t('menu'), {name:'menu', testid:'menu'}));
}

function renderPage(hud, panel, api, screen) {
  hud.append(button('screen', api.t('back'), {name:'menu', testid:'back'}));
  const heading = el('h2');
  heading.textContent = api.t(screen);
  panel.append(heading);
  if (screen === 'howto') {
    for (const key of ['helpFence', 'helpDraft', 'helpMerge', 'helpRange']) {
      const line = el('p');
      line.textContent = api.t(key);
      panel.append(line);
    }
  }
  if (screen === 'settings') {
    const profile = api.getProfile();
    panel.append(button('language', api.t('language'), {value:profile.settings.language === 'zh' ? 'en' : 'zh', testid:'language'}));
    panel.append(button('sound', profile.settings.sound ? api.t('soundOn') : api.t('soundOff'), {testid:'sound'}));
    panel.append(button('reducedMotion', api.t('reducedMotion'), {testid:'reducedMotion'}));
    panel.append(button('exportSave', api.t('exportSave'), {testid:'exportSave'}));
    const field = el('textarea');
    field.id = 'import-text';
    field.setAttribute('aria-label', api.t('importSave'));
    field.style.width = '100%';
    field.style.minHeight = '88px';
    panel.append(field, button('importSave', api.t('importSave'), {testid:'importSave'}));
  }
  if (screen === 'armory' || screen === 'codex') {
    const line = el('p');
    line.textContent = api.t('unavailable');
    panel.append(line);
  }
}

function optionLabel(option, api) {
  if (!option || typeof option !== 'object') return api.t('chooseOneOfThree');
  if (option.kind === 'hero_upgrade') return `${api.t('hero')} ${option.upgradeId || ''}`.trim();
  return `${option.type || option.kind || api.t('towers')}${option.replace ? ' · replace' : ''}`;
}

function labelOf(value, profile, api) {
  const language = profile.settings.language === 'zh' ? 'zh' : 'en';
  if (value && typeof value === 'object') return value[language] || value.en || api.t('difficulty');
  return api.t(String(value));
}

function drawPlaceholder(canvas, state, ui) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== ARENA.width) canvas.width = ARENA.width;
  if (canvas.height !== ARENA.height) canvas.height = ARENA.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#122128';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#183238';
  ctx.fillRect(8, 8, ARENA.width - 16, ARENA.fenceY - 16);
  const ratio = state && state.fence?.maxHp > 0 ? Math.max(0, Math.min(1, state.fence.hp / state.fence.maxHp)) : 1;
  ctx.fillStyle = ratio > 0.34 ? '#9b7951' : '#8a3e32';
  ctx.fillRect(0, ARENA.fenceY, ARENA.width, 14);
  ctx.fillStyle = '#e6d2a8';
  ctx.fillRect(0, ARENA.fenceY, Math.round(ARENA.width * ratio), 4);
  const slots = state?.slots || Array.from({length:10}, (_, index) => slotGeometry(index));
  for (const slot of slots) {
    ctx.fillStyle = slot.index === ui.selectedSlot ? '#316074' : '#223743';
    ctx.fillRect(slot.left, slot.top, slot.width, slot.height);
    ctx.strokeStyle = '#7f9498';
    ctx.strokeRect(slot.left + 1, slot.top + 1, slot.width - 2, slot.height - 2);
    if (!slot.unit) continue;
    const color = slot.unit.kind === 'hero' ? '#f0cb72' : '#d7c09a';
    ctx.fillStyle = color;
    ctx.fillRect(slot.x - 8, slot.y - 20, 16, 22);
    ctx.fillStyle = '#1b2428';
    ctx.fillRect(slot.x - 5, slot.y - 16, 10, 4);
  }
  for (const enemy of state?.enemies || []) {
    if (!enemy || enemy.dead) continue;
    const size = Math.max(8, Math.round((enemy.radius || 8) * 2));
    ctx.fillStyle = '#6e8b74';
    ctx.fillRect(Math.round(enemy.x - size / 2), Math.round(enemy.y - size / 2), size, size);
  }
  for (const shot of state?.projectiles || []) {
    if (!shot) continue;
    ctx.fillStyle = shot.crit ? '#fff4c2' : '#f0cb72';
    ctx.fillRect(Math.round(shot.x) - 2, Math.round(shot.y) - 2, 4, 4);
  }
}

function clientPoint(canvas, renderer, clientX, clientY) {
  if (renderer && typeof renderer.pointFromClient === 'function') return renderer.pointFromClient(clientX, clientY);
  const rect = canvas.getBoundingClientRect();
  return {x:(clientX - rect.left) / (rect.width || 1) * ARENA.width, y:(clientY - rect.top) / (rect.height || 1) * ARENA.height};
}

function mountShell(root, api, modules) {
  if (typeof modules.shell?.mountShell !== 'function') return null;
  try {
    const mounted = modules.shell.mountShell(root, api);
    if (!mounted?.canvas) return null;
    return mounted;
  } catch (error) {
    console.error('[fencefall] shell unavailable', error);
    return null;
  }
}

async function mount() {
  const root = document.getElementById('app');
  if (!root) return;
  const api = await createController();
  let modules = {};
  try {
    const loaded = await loadOptional();
    modules = loaded;
  } catch (error) {
    console.error(error);
  }
  // createController already imported the modules; this second load hits the module cache.
  const shell = mountShell(root, api, modules);
  const canvas = shell?.canvas || root.querySelector('canvas');
  let renderer = null;
  if (canvas && typeof modules.renderer?.createRenderer === 'function') {
    try { renderer = modules.renderer.createRenderer(canvas); renderer.resize?.(); } catch (error) { console.error(error); renderer = null; }
  }
  if (typeof modules.audio?.createAudio === 'function') {
    try { api.setAudio(modules.audio.createAudio()); } catch (error) { console.error(error); }
  }
  const fallback = shell ? null : mountFallback(root, api);
  const activeCanvas = fallback?.canvas || canvas;
  let last = performance.now();
  let seen = '';
  const draw = () => {
    const state = api.getState();
    const view = api.getUI();
    if (renderer && state) {
      renderer.draw(state, {selectedSlot:view.selectedSlot, hoverSlot:view.hoverSlot, settings:{reducedMotion:api.getProfile().settings.reducedMotion === true}, range:true});
    } else if (activeCanvas) drawPlaceholder(activeCanvas, state, view);
  };
  const refresh = () => {
    const view = api.getUI();
    const state = api.getState();
    const mark = [view.screen, view.selectedSlot, view.mergeFrom, view.message, view.exportText.length, state?.phase, state?.paused, state?.hiddenPaused, state?.speed, state?.draftLevel, state?.draft?.options?.map(option => option.id).join(',') || '', state?.pendingUnit ? 1 : 0, api.getProfile().settings.language, api.getProfile().settings.sound, api.getProfile().settings.reducedMotion, api.getProfile().currency].join('|');
    if (mark === seen) return;
    seen = mark;
    try {
      if (shell) {
        const stateNow = api.getState();
        if (view.screen === 'battle' && stateNow && typeof modules.build?.renderBuildPanel === 'function') {
          const host = stateNow.phase === 'draft' || stateNow.phase === 'placing' || view.mergePreview ? shell.overlayRoot : shell.panelRoot;
          clear(host === shell.overlayRoot ? shell.panelRoot : shell.overlayRoot);
          modules.build.renderBuildPanel(host, stateNow, api);
        } else if (view.screen === 'battle') {
          clear(shell.overlayRoot);
          clear(shell.panelRoot);
        }
        if (view.screen !== 'battle' && typeof modules.meta?.renderMetaPanel === 'function') {
          modules.meta.renderMetaPanel(shell.menuRoot || shell.panelRoot, view.screen, stateNow, api.getProfile(), api);
        } else if (view.screen !== 'battle') fillMenu(shell.menuRoot, api);
        else clear(shell.menuRoot);
      } else fallback.render();
    } catch (error) {
      console.error('[fencefall] ui render failed', error);
    }
  };
  document.addEventListener('pointerdown', () => api.unlockAudio(), {passive:true});
  document.addEventListener('visibilitychange', () => {
    const state = api.getState();
    if (state && document.hidden) state.hiddenPaused = true;
    last = performance.now();
    refresh();
  });
  if (shell?.menuRoot) {
    shell.menuRoot.addEventListener('click', event => {
      const node = event.target.closest('[data-action]');
      if (!node || !shell.menuRoot.contains(node)) return;
      api.act(node.dataset.action, payloadFrom(node, root));
      refresh();
    });
  }
  if (!shell) {
    document.addEventListener('keydown', event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        const state = api.getState();
        api.act(state?.paused || state?.hiddenPaused ? 'resume' : 'pause');
      } else if (event.key === '1') api.act('speed', {value:1});
      else if (event.key === '2') api.act('speed', {value:1.5});
      else if (event.key === '3') api.act('speed', {value:3});
      else if (event.key === 'Escape') {
        if (api.getUI().mergePreview) api.act('mergeCancel');
        else api.act('cancelPlacement');
      }
      refresh();
    });
    root.addEventListener('click', event => {
      const node = event.target.closest('[data-action]');
      if (!node || !root.contains(node)) return;
      api.act(node.dataset.action, payloadFrom(node, root));
      refresh();
    });
  }
  const frame = now => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const state = api.getState();
    const view = api.getUI();
    if (state && view.screen === 'battle') {
      if (document.hidden) state.hiddenPaused = true;
      const phase = state.phase;
      try { advance(state, dt); } catch (error) { console.error(error); }
      const events = takeEvents(state);
      if (events.length) {
        const copies = events.map(item => ({...item}));
        try { renderer?.ingestEvents?.(copies.map(item => ({...item}))); } catch (error) { console.error(error); }
        api.publish(copies);
      }
      if (state.phase !== phase && (state.phase === 'victory' || state.phase === 'defeat')) api.settleTerminal();
    }
    try { draw(); } catch (error) { console.error(error); }
    try { shell?.render?.(); } catch (error) { console.error(error); }
    const statusNode = root.querySelector('#status');
    if (statusNode && !shell) {
      const live = api.getState();
      const profile = api.getProfile();
      const language = profile.settings.language === 'zh' ? 'zh' : 'en';
      const online = api.integration();
      const ready = Object.values(online.engine.present).filter(Boolean).length;
      statusNode.textContent = statusLine(api, live, language, ready, online);
    }
    refresh();
    requestAnimationFrame(frame);
  };
  refresh();
  draw();
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { try { renderer?.resize?.(); } catch (error) { console.error(error); } });
}

if (typeof document !== 'undefined' && document.getElementById('app')) mount();
