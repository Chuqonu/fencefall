import {DIFFICULTIES, canPlan, clone} from './shared.js';
import {highestUnlockedStageId, isExpedition, isStageUnlocked, stageNumber} from './data/expeditions.js';
import {advance, createProfile, createRun, enterEndless, exportRun, integrationInfo, prepare, setSpeed, takeEvents} from './engine.js';
import {setTargeting} from './systems/combat.js';
import * as hero from './systems/hero.js';
import * as drafts from './systems/drafts.js';
import * as progression from './systems/progression.js';
import * as storage from './storage.js';
import * as i18n from './i18n.js';
import * as towers from './data/towers.js';
import * as waves from './systems/waves.js';
import * as shellMod from './ui/shell.js';
import * as build from './ui/build-panel.js';
import * as meta from './ui/meta-panel.js';
import * as audioMod from './audio.js';
import * as rendererMod from './render/renderer.js';

const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
export const ACTIONS = Object.freeze([
  'start', 'resume', 'restart', 'abandon', 'pause', 'speed', 'language', 'sound', 'reducedMotion',
  'screen', 'selectSlot', 'move', 'dragDrop', 'chooseDraft', 'rerollDraft', 'setTargeting',
  'buyEquipment', 'equip', 'upgradePermanent', 'buyGem', 'equipGem', 'unequipGem', 'claimStarterPack',
  'exportSave', 'importSave', 'hover', 'endless'
]);

const MODULES = {
  hero, drafts, progression, storage, i18n, towers, waves,
  shell: shellMod, build, meta, audio: audioMod, renderer: rendererMod,
};

function detectLanguage() {
  const value = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language || 'en';
  return String(value).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function resultOf(value, reason = 'error') {
  if (value && typeof value === 'object' && typeof value.ok === 'boolean') return value;
  return {ok: false, reason};
}

function integerSlot(index) {
  return Number.isInteger(index) && index >= 0 && index < 10;
}

export async function createController(options = {}) {
  const modules = MODULES;
  const injected = options.storage || null;
  let profile = options.profile || null;
  let run = null;
  let storedRun = null;
  let audio = null;
  const settledIds = new Set();
  const ui = {screen: 'menu', selectedSlot: -1, hoverSlot: -1, hoverIntent: '', message: '', exportText: ''};

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
  if (!storedRun) ui.message = storageCall('legacyRunNotice', []) || '';
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
      'not-planning': 'notPlanning', 'bad-slot': 'invalidSlot', 'no-run': 'noSave', 'bad-choice': 'invalidChoice',
      not_planning: 'notPlanning', hero_protected: 'heroProtected', invalid_slot: 'invalidSlot',
      empty_slot: 'emptySlot', same_slot: 'sameSlot', max_rank: 'maxRank',
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
    return i18n.t(language, lookupKey, vars);
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
    if (!run) return {ok: false, reason: 'no-run'};
    if (run.phase !== 'victory' && run.phase !== 'defeat') return {ok: false, reason: 'bad-phase'};
    maybeSettle();
    if (ui.screen === 'battle') ui.screen = 'results';
    return {ok: true, settlement: run.settlement || null};
  }

  function perform(action, payload) {
    if (action === 'start') {
      const requested = payload.difficulty || profile.settings?.difficulty || 'normal';
      const difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTIES, requested) ? requested : 'normal';
      profile.settings.difficulty = difficulty;
      const seed = Number.isFinite(Number(payload.seed)) ? Number(payload.seed) >>> 0 : Math.floor(Math.random() * 0x100000000) >>> 0;
      const savedExp = typeof profile.settings?.expedition === 'string' && isExpedition(profile.settings.expedition)
        ? profile.settings.expedition
        : null;
      const expedition = typeof payload.expedition === 'string' && isExpedition(payload.expedition)
        ? payload.expedition
        : (savedExp && isStageUnlocked(profile, savedExp) ? savedExp : highestUnlockedStageId(profile));
      if (stageNumber(expedition) > 0 && !isStageUnlocked(profile, expedition)) {
        return {ok: false, reason: 'stageLocked'};
      }
      run = createRun({seed, difficulty, profile, runId: typeof payload.runId === 'string' ? payload.runId : undefined, expedition});
      if (typeof run.expedition === 'string') profile.settings.expedition = run.expedition;
      prepare(run);
      ui.screen = 'battle';
      ui.selectedSlot = -1;
      ui.hoverSlot = -1;
      ui.hoverIntent = '';
      ui.exportText = '';
      saveProfile();
      saveRun();
      return {ok: true};
    }
    if (action === 'restart') {
      const difficulty = run?.difficulty || profile.settings?.difficulty || 'normal';
      const expedition = typeof run?.expedition === 'string' ? run.expedition : profile.settings?.expedition;
      return perform('start', {difficulty, seed: payload.seed, expedition});
    }
    if (action === 'resume') {
      if (!run) {
        if (!storedRun) storedRun = loadStoredRun();
        if (!storedRun) return {ok: false, reason: 'noSave'};
        run = storedRun;
        storedRun = null;
        if (run.phase === 'playing') run.paused = true;
        prepare(run);
        ui.screen = 'battle';
        return {ok: true, paused: run.paused === true};
      }
      if (run.hiddenPaused) {
        run.hiddenPaused = false;
        ui.screen = 'battle';
        saveRun();
        return {ok: true, paused: run.paused === true};
      }
      run.paused = false;
      ui.screen = 'battle';
      saveRun();
      return {ok: true, paused: false};
    }
    if (action === 'pause') {
      if (!run) return {ok: false, reason: 'no-run'};
      if (run.phase === 'victory' || run.phase === 'defeat') return {ok: false, reason: 'bad-phase'};
      run.paused = run.paused !== true;
      saveRun();
      return {ok: true, paused: run.paused};
    }
    if (action === 'abandon') {
      if (!run) return {ok: false, reason: 'no-run'};
      if (run.phase !== 'victory' && run.phase !== 'defeat') run.phase = 'defeat';
      ui.screen = 'results';
      saveRun();
      return settleTerminal();
    }
    if (action === 'endless') {
      if (!run) return {ok: false, reason: 'no-run'};
      const outcome = enterEndless(run);
      if (!outcome.ok) return outcome;
      ui.screen = 'battle';
      saveRun();
      return {ok: true};
    }
    if (action === 'speed') {
      if (!run) return {ok: false, reason: 'no-run'};
      const value = Number(payload.value);
      if (![1, 1.5, 3, 10].includes(value)) return {ok: false, reason: 'bad-speed'};
      setSpeed(run, value);
      return {ok: true, speed: run.speed};
    }
    if (action === 'language') {
      if (payload.value !== 'en' && payload.value !== 'zh') return {ok: false, reason: 'bad-language'};
      profile.settings.language = payload.value;
      if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = payload.value === 'zh' ? 'zh-CN' : 'en';
      saveProfile();
      return {ok: true};
    }
    if (action === 'sound') {
      const value = typeof payload.value === 'boolean' ? payload.value : profile.settings.sound !== true;
      profile.settings.sound = value;
      try {
        audio?.setEnabled(value);
        if (value) {
          const unlocked = audio?.unlock?.();
          if (unlocked && typeof unlocked.then === 'function') {
            unlocked.then(() => {
              syncMusic();
              try { audio?.playEvents?.([{type: 'ui', time: 0}], {reducedMotion: profile.settings.reducedMotion === true}); } catch { /* ignore */ }
            });
          } else {
            syncMusic();
          }
        } else {
          syncMusic();
        }
      } catch (error) { console.error(error); }
      saveProfile();
      return {ok: true, sound: value};
    }
    if (action === 'reducedMotion') {
      const value = typeof payload.value === 'boolean' ? payload.value : profile.settings.reducedMotion !== true;
      profile.settings.reducedMotion = value;
      try { audio?.playEvents?.([], {reducedMotion: value}); } catch { /* ignore */ }
      saveProfile();
      return {ok: true, reducedMotion: value};
    }
    if (action === 'screen') {
      if (!SCREENS.includes(payload.name)) return {ok: false, reason: 'bad-screen'};
      if (payload.name === 'battle' && !run) return perform('resume');
      if (payload.name === 'results' && !run) return {ok: false, reason: 'no-run'};
      if (payload.name !== 'battle' && ui.screen === 'battle' && run && run.phase === 'playing') run.paused = true;
      ui.screen = payload.name;
      return {ok: true};
    }
    if (action === 'hover') {
      ui.hoverSlot = integerSlot(payload.index) ? payload.index : -1;
      const intent = payload.intent;
      ui.hoverIntent = ui.hoverSlot >= 0 && (intent === 'empty' || intent === 'swap' || intent === 'illegal') ? intent : '';
      return {ok: true};
    }
    if (action === 'setTargeting') {
      if (!run) return {ok: false, reason: 'no-run'};
      const result = setTargeting(run, payload.index, payload.mode);
      if (result.ok) saveRun();
      return result;
    }
    if (action === 'rerollDraft') {
      if (!run) return {ok: false, reason: 'no-run'};
      const result = drafts.rerollDraft(run);
      if (result.ok) saveRun();
      return result;
    }
    if (action === 'selectSlot') {
      if (!run) return {ok: false, reason: 'no-run'};
      const index = payload.index;
      if (index === -1) {
        ui.selectedSlot = -1;
        return {ok: true, index: -1};
      }
      if (!integerSlot(index)) return {ok: false, reason: 'bad-slot'};
      if (!run.slots?.[index]?.unit) {
        ui.selectedSlot = -1;
        return {ok: true, index: -1};
      }
      const previous = ui.selectedSlot;
      ui.selectedSlot = previous === index ? -1 : index;
      return {ok: true, index: ui.selectedSlot};
    }
    if (action === 'move') return moveUnits(payload.from, payload.to);
    if (action === 'dragDrop') return dragDrop(payload.from, payload.to);
    if (action === 'chooseDraft') return chooseDraft(payload.index);
    if (action === 'buyEquipment') return profileAction('buyEquipment', payload.id);
    if (action === 'equip') return profileAction('equipItem', payload.id);
    if (action === 'upgradePermanent') return profileAction('purchasePermanent', payload.id);
    if (action === 'buyGem') return profileAction('buyGem', payload.id);
    if (action === 'equipGem') return profileAction('equipGem', payload.id);
    if (action === 'unequipGem') return profileAction('unequipGem', payload.id);
    if (action === 'claimStarterPack') return profileAction('claimStarterPack');
    if (action === 'exportSave') return exportCurrent();
    if (action === 'importSave') return importCurrent(payload.text);
    return {ok: false, reason: 'unknown-action'};
  }

  function moveUnits(from, to) {
    void from;
    void to;
    if (!run) return {ok: false, reason: 'no-run'};
    return {ok: false, reason: 'heroFixed'};
  }

  function dragDrop(from, to) {
    void from;
    void to;
    if (!run) return {ok: false, reason: 'no-run'};
    return {ok: false, reason: 'heroFixed', snapped: true};
  }

  function chooseDraft(index) {
    if (!run) return {ok: false, reason: 'no-run'};
    if (run.phase !== 'draft' || !run.draft || !Array.isArray(run.draft.options)) return {ok: false, reason: 'bad-phase'};
    if (!Number.isInteger(index) || index < 0 || index >= run.draft.options.length) return {ok: false, reason: 'bad-choice'};
    if (typeof modules.drafts?.chooseDraft !== 'function') return {ok: false, reason: 'unavailable'};
    const choice = resultOf(modules.drafts.chooseDraft(run, index));
    if (choice.ok) saveRun();
    return choice;
  }

  function profileAction(name, id) {
    const fn = modules.progression && modules.progression[name];
    if (typeof fn !== 'function') return {ok: false, reason: 'unavailable'};
    const acted = resultOf(fn(profile, id));
    if (acted.ok) saveProfile();
    return acted;
  }

  function exportCurrent() {
    if (typeof modules.storage?.exportSave !== 'function') return {ok: false, reason: 'unavailable'};
    try {
      const text = injected
        ? modules.storage.exportSave(profile, run ? exportRun(run) : null, injected)
        : modules.storage.exportSave(profile, run ? exportRun(run) : null);
      if (typeof text !== 'string') return {ok: false, reason: 'exportSave'};
      ui.exportText = text;
      return {ok: true, text};
    } catch (error) {
      console.error(error);
      return {ok: false, reason: 'exportSave'};
    }
  }

  function importCurrent(text) {
    if (typeof text !== 'string' || text.length === 0) return {ok: false, reason: 'importError'};
    if (typeof modules.storage?.importSave !== 'function') return {ok: false, reason: 'unavailable'};
    let imported;
    try {
      imported = injected ? modules.storage.importSave(text, injected) : modules.storage.importSave(text);
    } catch (error) {
      console.error(error);
      return {ok: false, reason: 'importError'};
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
    if (imported.notice) { run = null; storedRun = null; ui.screen = 'menu'; }
    return {ok: true, notice: imported.notice};
  }

  const UI_CUE_ACTIONS = new Set([
    'start', 'restart', 'resume', 'pause', 'speed', 'language', 'screen', 'chooseDraft',
    'buyEquipment', 'equip', 'upgradePermanent', 'buyGem', 'equipGem', 'unequipGem',
    'claimStarterPack', 'endless', 'exportSave', 'importSave',
  ]);

  function computeMusicMode() {
    if (globalThis.document?.hidden) return 'silent';
    if (profile.settings?.sound !== true) return 'silent';
    if (ui.screen === 'results') return 'silent';
    if (ui.screen !== 'battle') return 'menu';
    const state = run || storedRun;
    if (!state || state.paused || state.hiddenPaused) return 'silent';
    if (state.phase === 'victory' || state.phase === 'defeat') return 'silent';
    if (state.phase === 'draft') return 'draft';
    const hasBoss = Array.isArray(state.enemies) && state.enemies.some((e) => e && !e.dead && e.kind === 'boss');
    if (hasBoss || waves.bossApproaching?.(state)) return 'boss';
    return 'battle';
  }

  let lastMusicMode = '';

  function syncMusic(force = false) {
    if (!audio || typeof audio.setMusicMode !== 'function') return;
    const next = computeMusicMode();
    if (!force && next === lastMusicMode) return;
    lastMusicMode = next;
    try { audio.setMusicMode(next); } catch (error) { console.error(error); }
  }

  function act(action, payload = {}) {
    let outcome;
    try {
      outcome = perform(action, payload || {});
    } catch (error) {
      console.error('[fencefall] action failed', action, error);
      outcome = {ok: false, reason: 'error'};
    }
    if (!outcome.ok) ui.message = outcome.reason || 'invalid';
    else ui.message = outcome.notice || '';
    if (action !== 'hover' && action !== 'sound') {
      try {
        if (!outcome.ok) {
          audio?.playEvents?.([{type: 'ui', cue: 'error', time: 0}], {reducedMotion: profile.settings.reducedMotion === true});
        } else if (UI_CUE_ACTIONS.has(action)) {
          audio?.playEvents?.([{type: 'ui', time: 0}], {reducedMotion: profile.settings.reducedMotion === true});
        }
      } catch { /* ignore */ }
    }
    syncMusic();
    return outcome;
  }

  const api = {
    getState: () => run || storedRun,
    getProfile: () => profile,
    t: translate,
    act,
    getUI: () => ({
      screen: ui.screen,
      selectedSlot: ui.selectedSlot,
      hoverSlot: ui.hoverSlot,
      hoverIntent: ui.hoverIntent || '',
      message: ui.message,
      exportText: ui.exportText,
    }),
    setAudio(instance) {
      audio = instance || null;
      lastMusicMode = '';
      try {
        audio?.setEnabled(profile.settings.sound === true);
        syncMusic(true);
      } catch (error) { console.error(error); }
    },
    unlockAudio() {
      try {
        const res = audio?.unlock?.();
        if (res && typeof res.then === 'function') res.then(() => syncMusic());
        else syncMusic();
      } catch (error) { console.error(error); }
    },
    syncMusic,
    publish(events) {
      if (events?.length) {
        try { audio?.playEvents?.(events, {reducedMotion: profile.settings.reducedMotion === true}); }
        catch (error) { console.error(error); }
      }
    },
    settleTerminal,
    integration: () => ({engine: integrationInfo(), modules: Object.fromEntries(Object.entries(MODULES).map(([key, value]) => [key, !!value]))}),
  };
  return api;
}

function clear(node) {
  if (node) node.replaceChildren();
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
  const modules = MODULES;
  const shell = mountShell(root, api, modules);
  if (!shell) return;
  const canvas = shell.canvas;
  let renderer = null;
  if (canvas && typeof modules.renderer?.createRenderer === 'function') {
    try { renderer = modules.renderer.createRenderer(canvas); renderer.resize?.(); } catch (error) { console.error(error); renderer = null; }
  }
  if (typeof modules.audio?.createAudio === 'function') {
    try { api.setAudio(modules.audio.createAudio({settings: api.getProfile().settings})); } catch (error) { console.error(error); }
  }

  let last = performance.now();
  let seen = '';
  const draw = () => {
    const state = api.getState();
    const view = api.getUI();
    if (renderer && state) {
      renderer.draw(state, {
        selectedSlot: view.selectedSlot,
        hoverSlot: view.hoverSlot,
        hoverIntent: view.hoverIntent,
        settings: {reducedMotion: api.getProfile().settings.reducedMotion === true},
        range: true
      });
    }
  };
  const refresh = () => {
    const view = api.getUI();
    const state = api.getState();
    api.syncMusic?.();
    const selectedUnit = state?.slots?.[view.selectedSlot]?.unit;
    const mark = [
      view.screen,
      view.selectedSlot,
      selectedUnit?.id || '',
      selectedUnit?.rank || '',
      selectedUnit?.targeting || '',
      state?.rerollsLeft ?? '',
      state?.draftRerollsUsed ?? '',
      view.message,
      view.exportText.length,
      state?.phase,
      state?.paused,
      state?.hiddenPaused,
      state?.speed,
      state?.draftLevel,
      state?.draft?.options?.map((option) => option.id).join(',') || '',
      api.getProfile().settings.language,
      api.getProfile().settings.sound,
      api.getProfile().settings.reducedMotion,
      api.getProfile().currency,
      (api.getProfile().gemsEquipped || []).join(','),
      (api.getProfile().gemsOwned || []).length,
      api.getProfile().starterClaimed ? 1 : 0,
      Object.values(api.getProfile().equipped || {}).join(','),
      Object.values(api.getProfile().permanent || {}).join(','),
    ].join('|');
    if (mark === seen) return;
    seen = mark;
    try {
      if (shell) {
        const stateNow = api.getState();
        if (view.screen === 'battle' && stateNow && typeof modules.build?.renderBuildPanel === 'function') {
          const host = stateNow.phase === 'draft' ? shell.overlayRoot : shell.panelRoot;
          clear(host === shell.overlayRoot ? shell.panelRoot : shell.overlayRoot);
          modules.build.renderBuildPanel(host, stateNow, api);
        } else if (view.screen === 'battle') {
          clear(shell.overlayRoot);
          clear(shell.panelRoot);
        }
        if (view.screen !== 'battle' && typeof modules.meta?.renderMetaPanel === 'function') {
          modules.meta.renderMetaPanel(shell.menuRoot || shell.panelRoot, view.screen, stateNow, api.getProfile(), api);
        } else clear(shell.menuRoot);
      }
    } catch (error) {
      console.error('[fencefall] ui render failed', error);
    }
  };
  document.addEventListener('pointerdown', () => api.unlockAudio(), {passive: true});
  document.addEventListener('keydown', () => api.unlockAudio(), {passive: true});
  document.addEventListener('visibilitychange', () => {
    const state = api.getState();
    if (state && document.hidden) state.hiddenPaused = true;
    last = performance.now();
    api.syncMusic?.();
    refresh();
  });
  const frame = (now) => {
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
        const copies = events.map((item) => ({...item}));
        try { renderer?.ingestEvents?.(copies.map((item) => ({...item}))); } catch (error) { console.error(error); }
        api.publish(copies);
      }
      if (state.phase !== phase && (state.phase === 'victory' || state.phase === 'defeat')) api.settleTerminal();
    }
    try { draw(); } catch (error) { console.error(error); }
    try { shell?.render?.(); } catch (error) { console.error(error); }
    refresh();
    requestAnimationFrame(frame);
  };
  refresh();
  draw();
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { try { renderer?.resize?.(); } catch (error) { console.error(error); } });
}

if (typeof document !== 'undefined' && document.getElementById('app')) mount();
