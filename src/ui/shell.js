import {FIELD_UNITS} from '../data/field-units.js';
import {fieldCost} from '../systems/field.js';
import { ARENA, DIFFICULTIES, canPlan, hitFieldSlot, hitSlot, slotGeometry } from '../shared.js';
import { previewMerge } from '../systems/merges.js';
import { bossApproaching,getWaveInfo } from '../systems/waves.js';
import { ENEMIES } from '../data/enemies.js';
import { EXPEDITIONS } from '../data/expeditions.js';
import { catalogIcon } from './icons.js';
import { formatNumber, localize } from '../i18n.js';

const SPEEDS = [1, 1.5, 3, 10];
const SCREEN_NAMES = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];

/**
 * App shell and live HUD.
 * Pointer hits map the canvas CSS box linearly onto the 360×640 arena.
 * Dragging a defender onto another slot moves it or merges it during the fight.
 * Pause, a draft, and the menu still allow the same actions. A drag does not pause the clock.
 * An illegal drop snaps back and leaves the board unchanged.
 * Renderer resize must use that same full-box mapping (no inner letterbox).
 * The fight-row button says Pause while the fight is moving and Resume while it is held.
 * Resume is one tap: it clears a pause from hiding the page, then a pause the player turned on.
 * Containers marked data-ui are never cleared here — panel modules own their children.
 * When director.playerHint has en and zh, the battle HUD shows that text in the active language.
 */
export function mountShell(root, api) {
  if (!root || typeof root.appendChild !== 'function') {
    throw new Error('mountShell requires a root element');
  }
  if (!api || typeof api.act !== 'function') {
    throw new Error('mountShell requires an api');
  }

  const shell = el('div', { class: 'shell', 'data-testid': 'shell-root' });
  const topbar = el('header', { class: 'topbar' });
  const brand = el('div', { class: 'brand' });
  const title = el('h1', { class: 'brand-title', 'data-testid': 'title' });
  const subtitle = el('p', { class: 'brand-sub muted', 'data-testid': 'subtitle' });
  brand.append(title, subtitle);

  const nav = el('nav', { class: 'nav-scroll', 'data-testid': 'screen-nav' });
  const screenButtons = new Map();
  for (const name of SCREEN_NAMES) {
    const button = controlButton(`btn-screen-${name}`, 'screen');
    button.dataset.name = name;
    nav.append(button);
    screenButtons.set(name, button);
  }

  const langZh = controlButton('btn-language-zh', 'language');
  langZh.dataset.value = 'zh';
  const langEn = controlButton('btn-language-en', 'language');
  langEn.dataset.value = 'en';
  const soundButton = controlButton('btn-sound', 'sound');
  const tools = el('div', { class: 'top-tools' });
  tools.append(langZh, langEn, soundButton);
  topbar.append(brand, tools, nav);

  const body = el('div', { class: 'shell-body' });
  const fieldSlot = el('div', { class: 'field-slot' });
  const fieldFrame = el('div', { class: 'field-frame', 'data-testid': 'field-frame' });
  const canvas = el('canvas', {
    class: 'field',
    id: 'ff-canvas',
    'data-testid': 'field-canvas',
    tabindex: '0'
  });
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  const fieldHelp = el('p', { class: 'sr-only', id: 'ff-field-help' });
  canvas.setAttribute('aria-describedby', 'ff-field-help');
  fieldFrame.append(canvas, fieldHelp);
  fieldSlot.append(fieldFrame);

  const panelRoot = el('div', {
    class: 'panel-root',
    id: 'ff-panel',
    'data-ui': 'panel',
    'data-testid': 'panel-root'
  });
  const panelWrap = el('div', { class: 'panel-wrap' });
  panelWrap.append(panelRoot);

  body.append(fieldSlot, panelWrap);

  const hud = el('footer', { class: 'hud', 'data-testid': 'hud' });
  const fenceLabel = el('span', { class: 'meter-label' });
  const fenceValue = el('strong', { class: 'meter-value', 'data-testid': 'hud-fence-value' });
  const fenceFill = el('div', { class: 'meter-fill' });
  const fenceMeter = el('div', { class: 'meter', 'data-testid': 'hud-fence' });
  fenceMeter.append(
    el('div', { class: 'meter-head' }, [fenceLabel, fenceValue]),
    el('div', { class: 'meter-track' }, [fenceFill])
  );

  const xpLabel = el('span', { class: 'meter-label' });
  const xpValue = el('strong', { class: 'meter-value', 'data-testid': 'hud-xp-value' });
  const xpFill = el('div', { class: 'meter-fill is-xp' });
  const xpMeter = el('div', { class: 'meter', 'data-testid': 'hud-xp' });
  xpMeter.append(
    el('div', { class: 'meter-head' }, [xpLabel, xpValue]),
    el('div', { class: 'meter-track' }, [xpFill])
  );

  const waveLabel = el('span', { class: 'stat-label' });
  const waveValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-wave-value' });
  const waveStat = stat('hud-wave', waveLabel, waveValue);
  const killsLabel = el('span', { class: 'stat-label' });
  const killsValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-kills-value' });
  const killsStat = stat('hud-kills', killsLabel, killsValue, 'hud-quiet');
  const timeLabel = el('span', { class: 'stat-label' });
  const timeValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-time-value' });
  const timeStat = stat('hud-time', timeLabel, timeValue, 'hud-quiet');
  const currencyLabel = el('span', { class: 'stat-label' });
  const currencyValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-currency-value' });
  const currencyStat = stat('hud-currency', currencyLabel, currencyValue, 'hud-quiet');
  const difficulty = el('span', { class: 'badge hud-quiet', 'data-testid': 'hud-difficulty' });
  const phase = el('span', { class: 'badge', 'data-testid': 'hud-phase' });
  const sortie = el('span', { class: 'badge hud-sortie', 'data-testid': 'hud-sortie' });
  const stats = el('div', { class: 'hud-stats' });
  const energyValue=el('strong',{'data-testid':'hud-energy'});
  const surgeValue=el('strong',{'data-testid':'hud-surge'});
  stats.append(energyValue,surgeValue);
  stats.append(sortie, waveStat, killsStat, timeStat, currencyStat, difficulty, phase);

  const pauseButton = controlButton('btn-pause', 'pause');
  const speedButtons = SPEEDS.map((value) => {
    const button = controlButton(speedTestId(value), 'speed');
    button.dataset.value = String(value);
    button.textContent = speedLabel(value);
    return button;
  });
  const speedRow = el('div', { class: 'speed-row', role: 'group' });
  speedRow.append(...speedButtons);
  const detailsButton = controlButton('btn-details', 'details');
  detailsButton.setAttribute('aria-expanded', 'false');
  const menuButton = controlButton('btn-fight-menu', 'screen');
  menuButton.dataset.name = 'menu';
  const controls = el('div', { class: 'hud-controls' });
  controls.append(pauseButton, speedRow, menuButton, detailsButton);

  const message = el('p', { class: 'hud-message', 'data-testid': 'hud-message' });
  const waveHint = el('p', { class: 'hud-hint', 'data-testid': 'hud-hint' });
  const live = el('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'hud-live' });
  const hudMain = el('div', { class: 'hud-main' });
  hudMain.append(
    el('div', { class: 'hud-meters' }, [fenceMeter, xpMeter]),
    stats,
    waveHint,
    message
  );
  const fieldBar=el('div',{class:'field-bar'});
  const fieldButtons=Object.keys(FIELD_UNITS).map(kind=>{
    const b=controlButton('field-'+kind,'fieldKind');
    b.dataset.kind=kind;
    fieldBar.append(b);
    return b;
  });
  hud.append(hudMain, controls, fieldBar,live);

  const overlayRoot = el('div', {
    class: 'overlay-root',
    id: 'ff-overlay',
    'data-ui': 'overlay',
    'data-testid': 'overlay-root'
  });
  const menuRoot = el('div', {
    class: 'menu-root',
    id: 'ff-menu',
    'data-ui': 'menu',
    'data-testid': 'menu-root'
  });

  const ghost = el('div', {
    class: 'drag-ghost',
    'data-testid': 'drag-ghost',
    hidden: true
  });
  shell.append(topbar, body, hud, overlayRoot, menuRoot, ghost);
  root.replaceChildren(shell);

  let dead = false;
  let pointer = null;
  let suppressClick = false;
  let snapToken = 0;
  let clickTimer = 0;
  let lastKey = '';
  let lastPaint = 0;
  let timer = 0;

  function onPointerDown(event) {
    if (dead || event.button !== 0) return;
    pointer = {
      id: event.pointerId,
      type: event.pointerType || 'mouse',
      index: indexFromClient(event.clientX, event.clientY, event.pointerType),
      x: event.clientX,
      y: event.clientY,
      active: false
    };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
  }

  function onPointerMove(event) {
    if (dead || !pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.active && Math.hypot(dx, dy) < 10) return;
    const state = readState();
    const start = pointer.index;
    const unit = state && validSlot(start, state) ? state.slots[start]?.unit : null;
    if (!unit) return;
    pointer.active = true;
    const hover = indexFromClient(event.clientX, event.clientY, pointer.type);
    const kind = dropKind(state, start, hover);
    showGhost(event.clientX, event.clientY, unit, kind);
    api.act('hover', { index: hover, intent: kind === 'empty' || kind === 'merge' || kind === 'illegal' ? kind : '' });
  }

  function onPointerUp(event) {
    if (dead) return;
    if (pointer && pointer.id !== event.pointerId) return;
    const pointerType = pointer?.type || event.pointerType;
    const start = pointer ? pointer.index : indexFromClient(event.clientX, event.clientY, pointerType);
    const dragging = Boolean(pointer?.active);
    pointer = null;
    suppressClick = true;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = false; }, 400);
    const end = indexFromClient(event.clientX, event.clientY, pointerType);
    if (dragging) finishDrag(start, end);
    else {
      hideGhost();
      handleGesture(start, end);
    }
  }

  function onPointerCancel() {
    const start = pointer?.index;
    const dragging = Boolean(pointer?.active);
    pointer = null;
    api.act('hover', { index: -1 });
    if (dragging && validSlot(start, readState())) snapGhost(start);
    else hideGhost();
  }

  function onClick(event) {
    if (dead || suppressClick) return;
    handleGesture(indexFromClient(event.clientX, event.clientY), indexFromClient(event.clientX, event.clientY));
  }

  function onControl(event) {
    if (dead) return;
    if (event.target.closest?.('[data-ui]')) return;
    const button = event.target.closest?.('button[data-action]');
    if (!button || button.dataset.shellControl !== 'true' || !shell.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action==='fieldKind') { api.act(action,{kind:button.dataset.kind}); return; }
    if (action === 'speed') {
      const value = Number(button.dataset.value);
      api.act('speed', { value });
      return;
    }
    if (action === 'language') {
      api.act('language', { value: button.dataset.value === 'zh' ? 'zh' : 'en' });
      return;
    }
    if (action === 'screen') {
      api.act('screen', { name: button.dataset.name });
      return;
    }
    if (action === 'details') {
      const open = shell.classList.toggle('is-details-open');
      detailsButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      setText(detailsButton, text(open ? 'hideDetails' : 'details'));
      return;
    }
    if (action === 'resume') releaseHold();
    else if (action === 'pause' || action === 'sound') api.act(action);
  }

  function onKey(event) {
    if (dead || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const state = readState();
    const ui = readUI();
    const screen = screenName(ui, state);
    const phaseName = state?.phase || '';
    const onControlKey = isControlTarget(event.target);

    if (event.code === 'Escape') {
      if (screen === 'battle' && phaseName === 'placing') {
        event.preventDefault();
        api.act('cancelPlacement');
        return;
      }
      if (ui?.mergePreview) {
        event.preventDefault();
        api.act('mergeCancel');
        return;
      }
      if (screen !== 'battle') {
        if (state) {
          event.preventDefault();
          api.act('screen', { name: 'battle' });
        }
        return;
      }
      if (slotIndex(ui?.selectedSlot) >= 0) {
        event.preventDefault();
        api.act('selectSlot', { index: -1 });
      }
      return;
    }

    // Space/Enter on a focused button must activate that button once.
    if (onControlKey && (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter')) return;

    if (event.code === 'KeyM') {
      event.preventDefault();
      api.act('screen', { name: screen === 'menu' && state ? 'battle' : 'menu' });
      return;
    }

    if ((event.code === 'Enter' || event.code === 'NumpadEnter') && screen === 'battle' && state) {
      handleEnter(event, state, ui);
      return;
    }

    if ((event.code === 'Space' || event.code === 'KeyP') && screen === 'battle' && state) {
      if (phaseName === 'victory' || phaseName === 'defeat') return;
      const held = state.paused === true || state.hiddenPaused === true;
      if ((phaseName === 'draft' || phaseName === 'placing') && !held) return;
      event.preventDefault();
      if (held) releaseHold();
      else api.act('pause');
      return;
    }

    if (screen === 'battle' && state && event.code.startsWith('Arrow')) {
      event.preventDefault();
      nudgeSelection(event.code, state, ui);
      return;
    }

    const digit = digitFromCode(event.code);
    if (digit == null || screen !== 'battle' || !state || phaseName === 'placing') return;
    if (phaseName === 'draft') {
      if (digit >= 1 && digit <= 3) {
        event.preventDefault();
        api.act('chooseDraft', { index: digit - 1 });
      }
      return;
    }
    const value = SPEEDS[digit - 1];
    if (value != null) {
      event.preventDefault();
      api.act('speed', { value });
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('click', onClick);
  shell.addEventListener('click', onControl);
  document.addEventListener('keydown', onKey);

  function render() {
    if (dead) return;
    const state = readState();
    const profile = readProfile();
    const ui = readUI();
    const key = structuralKey(state, profile, ui);
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (key === lastKey && now - lastPaint < 200) return;
    lastKey = key;
    lastPaint = now;
    paint(state, profile, ui);
  }

  function paint(state, profile, ui) {
    const language = languageOf(profile);
    const screen = screenName(ui, state);
    const phaseName = state?.phase || '';
    const paused = Boolean(state?.paused);
    const hiddenPaused = Boolean(state?.hiddenPaused);
    const planning = Boolean(state) && canPlan(state) && (state.paused === true || state.phase === 'draft') && phaseName !== 'victory' && phaseName !== 'defeat';

    setText(title, text('title'));
    setText(subtitle, text('subtitle'));
    if (document.documentElement.lang !== language) document.documentElement.lang = language;
    const titleText = text('title');
    const subtitleText = text('subtitle');
    if (titleText && subtitleText) document.title = `${titleText} · ${subtitleText}`;

    shell.dataset.screen = screen;
    shell.dataset.phase = phaseName;
    shell.dataset.paused = paused ? 'true' : 'false';
    shell.classList.toggle('is-menu', screen !== 'battle');
    shell.classList.toggle('is-paused', paused || hiddenPaused);
    shell.classList.toggle('is-draft', phaseName === 'draft');
    shell.classList.toggle('is-placing', phaseName === 'placing');
    shell.classList.toggle('is-victory', phaseName === 'victory');
    shell.classList.toggle('is-defeat', phaseName === 'defeat');
    shell.classList.toggle('is-reduced-motion', profile?.settings?.reducedMotion === true);
    const menuOpen = screen !== 'battle';
    fieldSlot.inert = menuOpen || phaseName === 'draft';
    panelWrap.inert = menuOpen;
    hud.inert = menuOpen;
    const chrome = screen === 'battle' ? hud.offsetHeight : topbar.offsetHeight;
    if (chrome > 0) shell.style.setProperty('--topbar-height', `${chrome}px`);
    const frameBox = typeof fieldFrame.getBoundingClientRect === 'function' ? fieldFrame.getBoundingClientRect() : null;
    const shellBox = typeof shell.getBoundingClientRect === 'function' ? shell.getBoundingClientRect() : null;
    let boardLeft = 0;
    if (frameBox && shellBox && frameBox.width > 0 && shellBox.width > 0) {
      boardLeft = Math.max(0, Math.round(frameBox.left - shellBox.left));
      shell.style.setProperty('--board-left', `${boardLeft}px`);
      shell.style.setProperty('--board-width', `${Math.round(frameBox.width)}px`);
      shell.style.setProperty('--board-top', `${Math.max(0, Math.round(frameBox.top - shellBox.top))}px`);
      shell.style.setProperty('--board-height', `${Math.round(frameBox.height)}px`);
    }
    // A side margin this wide can hold the stats card without covering the board.
    shell.classList.toggle('has-side-card', screen === 'battle' && boardLeft >= 240);

    nav.setAttribute('aria-label', titleText || 'Fencefall');
    for (const [name, button] of screenButtons) {
      setText(button, screenButtonLabel(name, state));
      if (name === screen) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      button.classList.toggle('is-active', name === screen);
      button.hidden = name === 'battle' && !state;
    }

    const soundOn = profile?.settings?.sound === true;
    setText(langZh, '中');
    setText(langEn, 'EN');
    langZh.setAttribute('aria-label', `${text('language')} 中`);
    langEn.setAttribute('aria-label', `${text('language')} EN`);
    langZh.setAttribute('aria-pressed', language === 'zh' ? 'true' : 'false');
    langEn.setAttribute('aria-pressed', language === 'en' ? 'true' : 'false');
    langZh.classList.toggle('is-active', language === 'zh');
    langEn.classList.toggle('is-active', language === 'en');
    setText(soundButton, soundOn ? text('soundOn') : text('soundOff'));
    soundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundButton.classList.toggle('is-active', soundOn);

    const mergeOpen = Boolean(ui?.mergePreview);
    const selected = slotIndex(ui?.selectedSlot);
    const unitOpen = screen === 'battle' && selected >= 0 && phaseName !== 'draft' && phaseName !== 'placing' && !mergeOpen;
    shell.classList.toggle('is-unit-open', unitOpen);
    const overlayOpen = screen === 'battle' && (phaseName === 'draft' || phaseName === 'placing' || mergeOpen);
    overlayRoot.classList.toggle('is-open', overlayOpen);
    overlayRoot.classList.toggle('is-modal', (phaseName === 'draft' || mergeOpen) && overlayOpen);
    overlayRoot.classList.toggle('is-banner', phaseName === 'placing' && !mergeOpen && overlayOpen);
    menuRoot.classList.toggle('is-open', screen !== 'battle');

    canvas.setAttribute('aria-label', [text('fence'), text('helpPlacement'), text('helpRange')].filter(Boolean).join(' · '));
    setText(fieldHelp, [text('helpPlacement'), text('helpRange'), text('helpFence')].filter(Boolean).join(' '));

    const runReady = Boolean(state);
    const speedLocked = !runReady || phaseName === 'victory' || phaseName === 'defeat';
    const held = paused || hiddenPaused;
    pauseButton.disabled = speedLocked;
    pauseButton.setAttribute('data-action', held ? 'resume' : 'pause');
    setText(pauseButton, held ? text('resume') : text('pause'));
    pauseButton.setAttribute('aria-pressed', held ? 'true' : 'false');
    speedRow.setAttribute('aria-label', text('speed'));
    for (const button of speedButtons) {
      const value = Number(button.dataset.value);
      const active = runReady && Number(state.speed) === value;
      button.disabled = speedLocked;
      button.classList.toggle('is-active', active);
      button.classList.toggle('btn-primary', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', `${text('speed')} ${speedLabel(value)}`);
    }

    const fence = state?.fence;
    const fenceHp = finite(fence?.hp, 0);
    const fenceMax = finite(fence?.maxHp, 0);
    const fencePct = fenceMax > 0 ? clamp01(fenceHp / fenceMax) : 0;
    setText(fenceLabel, text('fence'));
    setText(fenceValue, runReady ? `${num(Math.max(0, fenceHp), language)} / ${num(fenceMax, language)}` : '—');
    fenceFill.className = `meter-fill${fencePct <= 0.3 ? ' is-low' : fencePct <= 0.6 ? ' is-mid' : ''}`;
    setWidth(fenceFill, fencePct);

    const xp = finite(state?.xp, 0);
    const nextXp = finite(state?.nextDraftXp, 0);
    const xpPct = nextXp > 0 ? clamp01(xp / nextXp) : 0;
    if (state) {
      setText(energyValue,text('energy')+' '+Math.floor(state.energy));
      setText(surgeValue,text('surge')+' '+state.surge.charges+'/'+state.surge.maxCharges);
      for (const b of fieldButtons) {
        const kind=b.dataset.kind, cd=Math.ceil(state.fieldCooldowns[kind]), cost=fieldCost(state,kind);
        b.disabled=!canPlan(state) || cd>0 || state.energy<cost;
        b.setAttribute('aria-pressed',String(ui.fieldKind===kind));
        setText(b,text(kind)+' '+cost+(cd?' · '+cd+'s':''));
      }
    }
    setText(xpLabel, text('xp'));
    const levelBit = runReady ? `${text('level')} ${num(finite(state?.draftLevel, 0), language)} · ` : '';
    setText(xpValue, runReady ? `${levelBit}${num(xp, language)} / ${num(nextXp, language)}` : '—');
    setWidth(xpFill, xpPct);

    const sortieName = runReady ? sortieLabel(state, language) : '';
    setText(sortie, sortieName);
    sortie.hidden = !sortieName;
    setText(waveLabel, text('wave'));
    setText(waveValue, runReady ? num(finite(state.wave,0),language)+' · '+Math.round((getWaveInfo(state).progress || 0)*100)+'%' : '—');
    setText(killsLabel, text('kills'));
    setText(killsValue, runReady ? num(finite(state?.kills, 0), language) : '—');
    setText(timeLabel, text('time'));
    setText(timeValue, runReady ? formatClock(state?.time) : '—');
    setText(currencyLabel, text('currency'));
    setText(currencyValue, profile ? num(finite(profile.currency, 0), language) : '—');

    const diff = state?.difficulty ? DIFFICULTIES[state.difficulty] : null;
    setText(difficulty, diff ? contentText(diff.name, language) : (state?.difficulty || ''));
    difficulty.hidden = !runReady;
    const phaseText = phaseBadge(state, planning);
    setText(phase, phaseText);
    phase.hidden = !phaseText;
    phase.classList.toggle('is-boss', !!phaseText && phaseText === text('bossWarning'));

    if (screen !== 'battle') shell.classList.remove('is-details-open');
    detailsButton.hidden = true;
    menuButton.hidden = screen !== 'battle';
    setText(menuButton, text('menu'));
    const detailsOpen = shell.classList.contains('is-details-open');
    detailsButton.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
    setText(detailsButton, text(detailsOpen ? 'hideDetails' : 'details'));
    const note = messageText(ui?.message, language, ui);
    setText(message, note);
    const hintLine = screen === 'battle' ? playerHintLine(state, language) : '';
    const nextLine = hintLine ? nextHintLine(state, language) : '';
    setText(waveHint, hintLine);
    waveHint.hidden = !hintLine;
    paintHintIcon(waveHint, hintKind(state, language, hintLine));
    const hintTitle = [hintLine, nextLine].filter(Boolean).join(' · ');
    if (hintTitle) waveHint.title = hintTitle;
    else waveHint.removeAttribute('title');
    const liveText = [phaseText, note].filter(Boolean).join(' · ');
    setText(live, liveText);
  }

  function handleGesture(startIndex, endIndex) {
    const state = readState();
    const ui = readUI();
    if (!state || screenName(ui, state) !== 'battle') return;
    const phaseName = state.phase;

    if (endIndex>=10 && phaseName!=='placing') {
      const index=endIndex-10;
      if (ui.fieldKind) api.act('deployField',{index,kind:ui.fieldKind});
      else api.act('inspectField',{index});
      return;
    }
    if (phaseName === 'placing') {
      if (!validSlot(endIndex, state)) return;
      const unit = state.slots[endIndex]?.unit || null;
      if (!unit) api.act('place', { index: endIndex, replace: false });
      else api.act('selectSlot', { index: endIndex });
      return;
    }

    if (!validSlot(endIndex, state)) {
      if (!validSlot(startIndex, state) && slotIndex(ui?.selectedSlot) >= 0) {
        api.act('selectSlot', { index: -1 });
      }
      return;
    }

    const planning = canPlan(state) && phaseName !== 'victory' && phaseName !== 'defeat';
    if (planning && validSlot(startIndex, state) && startIndex !== endIndex) {
      routePlan(state, startIndex, endIndex);
      return;
    }
    api.act('selectSlot', { index: endIndex });
  }

  function routePlan(state, from, to) {
    const source = state.slots[from]?.unit || null;
    const target = state.slots[to]?.unit || null;
    if (!source) {
      api.act('selectSlot', { index: to });
      return;
    }
    if (!target) {
      api.act('move', { from, to });
      return;
    }
    if (source.kind === 'hero' || target.kind === 'hero') {
      api.act('selectSlot', { index: to });
      return;
    }
    api.act('mergePreview', { from, to });
  }

  function nudgeSelection(code, state, ui) {
    if ((state.slots?.length || 0) < 10) return;
    const current = slotIndex(ui?.selectedSlot);
    if (!validSlot(current, state)) {
      api.act('selectSlot', { index: 0 });
      return;
    }
    const col = current % 5;
    const row = Math.floor(current / 5);
    let next = current;
    if (code === 'ArrowLeft') next = row * 5 + (col + 4) % 5;
    else if (code === 'ArrowRight') next = row * 5 + (col + 1) % 5;
    else if (code === 'ArrowUp' && row === 1) next = col;
    else if (code === 'ArrowDown' && row === 0) next = 5 + col;
    if (next !== current) api.act('selectSlot', { index: next });
  }

  function handleEnter(event, state, ui) {
    if (state.phase === 'placing') {
      const index = slotIndex(ui?.selectedSlot);
      if (!validSlot(index, state) || state.slots[index]?.unit) return;
      event.preventDefault();
      api.act('place', { index, replace: false });
      return;
    }
    if (!ui?.mergePreview) return;
    const from = slotIndex(ui.mergeFrom);
    const to = mergeTarget(ui);
    if (!validSlot(from, state) || !validSlot(to, state)) return;
    event.preventDefault();
    api.act('mergeConfirm', { from, to });
  }

  function showGhost(x, y, unit, kind) {
    const place = ghostClearOfDetails(x, y);
    ghost.hidden = false;
    ghost.classList.toggle('is-illegal', kind === 'illegal');
    ghost.classList.toggle('is-empty', kind === 'empty');
    ghost.classList.toggle('is-merge', kind === 'merge');
    const label = unit?.kind === 'hero' || unit?.type === 'hero'
      ? 'H'
      : String(unit?.type || unit?.kind || '').slice(0, 4);
    setText(ghost, label);
    ghost.style.left = `${place.x}px`;
    ghost.style.top = `${place.y}px`;
  }

  function ghostClearOfDetails(x, y) {
    const box = detailsButton.getBoundingClientRect();
    if (!(box.width >= 44) || !(box.height >= 44)) return { x, y };
    const half = 22;
    const overlaps = x + half > box.left && x - half < box.right && y + half > box.top && y - half < box.bottom;
    if (!overlaps) return { x, y };
    return { x, y: Math.min(y, box.top - 8 - half) };
  }

  function hideGhost() {
    snapToken += 1;
    ghost.hidden = true;
    ghost.classList.remove('is-illegal', 'is-empty', 'is-merge', 'is-snapping');
    setText(ghost, '');
  }

  function snapGhost(index) {
    const center = slotClientCenter(index);
    if (!center) {
      hideGhost();
      return;
    }
    ghost.classList.add('is-snapping');
    ghost.style.left = `${center.x}px`;
    ghost.style.top = `${center.y}px`;
    const token = ++snapToken;
    setTimeout(() => {
      if (token === snapToken) hideGhost();
    }, 160);
  }

  function slotClientCenter(index) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const slot = slotGeometry(index);
    return {
      x: rect.left + (slot.x / ARENA.width) * rect.width,
      y: rect.top + (slot.y / ARENA.height) * rect.height
    };
  }

  function dropKind(state, from, to) {
    if (!state || !validSlot(from, state) || !validSlot(to, state) || from === to) return 'same';
    if (!canPlan(state) || state.phase === 'victory' || state.phase === 'defeat') return 'illegal';
    const origin = state.slots[from]?.unit;
    const target = state.slots[to]?.unit;
    if (!origin) return 'illegal';
    if (!target) return 'empty';
    try { return previewMerge(state, from, to).ok === true ? 'merge' : 'illegal'; }
    catch { return 'illegal'; }
  }

  function finishDrag(from, to) {
    api.act('hover', { index: -1 });
    const state = readState();
    if (!state || !validSlot(from, state) || !state.slots[from]?.unit) {
      hideGhost();
      return;
    }
    const outcome = api.act('dragDrop', { from, to });
    if (outcome?.ok && !outcome.snapped) {
      hideGhost();
      return;
    }
    snapGhost(from);
  }

  function indexFromClient(clientX, clientY, pointerType) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return -1;
    const touch = pointerType === 'touch' || pointerType === 'pen';
    const slopCss = touch ? 28 : 8;
    const slopX = (slopCss / rect.width) * ARENA.width;
    const slopY = (slopCss / rect.height) * ARENA.height;
    let x = ((clientX - rect.left) / rect.width) * ARENA.width;
    let y = ((clientY - rect.top) / rect.height) * ARENA.height;
    if (x < -slopX || y < -slopY || x >= ARENA.width + slopX || y >= ARENA.height + slopY) return -1;
    x = Math.max(0, Math.min(ARENA.width - 0.01, x));
    y = Math.max(0, Math.min(ARENA.height - 0.01, y));
    const field=hitFieldSlot(x,y);
    if (field>=0) return 10+field;
    const direct = hitSlot(x, y);
    if (direct >= 0) return direct;
    let best = -1;
    let bestDist = touch ? 32 : 12;
    for (let index = 0; index < 10; index += 1) {
      const slot = slotGeometry(index);
      const dx = Math.max(slot.left - x, 0, x - (slot.left + slot.width));
      const dy = Math.max(slot.top - y, 0, y - (slot.top + slot.height));
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    return best;
  }

  function destroy() {
    if (dead) return;
    dead = true;
    clearInterval(timer);
    clearTimeout(clickTimer);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('click', onClick);
    shell.removeEventListener('click', onControl);
    document.removeEventListener('keydown', onKey);
    shell.remove();
  }

  timer = setInterval(() => { render(); }, 250);
  render();

  return { render, destroy, canvas, overlayRoot, panelRoot, menuRoot };

  function text(key, vars) {
    try {
      if (typeof api.t === 'function') {
        const value = api.t(key, vars);
        if (typeof value === 'string') return value;
      }
    } catch { /* missing catalog returns the key below */ }
    return key;
  }

  function readState() {
    try { return api.getState?.() || null; } catch { return null; }
  }

  function readProfile() {
    try { return api.getProfile?.() || null; } catch { return null; }
  }

  function readUI() {
    try { return api.getUI?.() || null; } catch { return null; }
  }

  function screenButtonLabel(name, state) {
    if (name === 'menu') return text('title');
    if (name === 'battle') return text('continue');
    return text(name);
  }

  function releaseHold() {
    api.act('resume');
    const state = readState();
    if (state && (state.hiddenPaused === true || state.paused === true)) api.act('resume');
  }

  function phaseBadge(state, planning) {
    if (!state) return '';
    if (state.phase === 'victory') return text('victory');
    if (state.phase === 'defeat') return text('defeat');
    if (state.phase === 'draft') return text('chooseOneOfThree');
    if (state.phase === 'placing') return text('chooseSlot');
    if (state.phase === 'playing' && (state.paused || state.hiddenPaused)) return text('paused');
    if (bossApproaching(state)) return text('bossWarning');
    if (fenceFailing(state)) return text('fenceDanger');
    if (planning) return text('planning');
    return '';
  }

  function messageText(value, language, ui) {
    const preview = ui?.mergePreview;
    if (preview && typeof preview === 'object') {
      const described = preview.description;
      const line = described && (described[language] || described.en);
      if (typeof line === 'string' && line) return line;
      if (preview.ok === false) return text(String(preview.reason || 'invalidMerge').replaceAll('_', ''));
    }
    if (value == null || value === false || value === 'mergePreview') return '';
    if (typeof value === 'string' || typeof value === 'number') {
      const raw = String(value);
      const translated = text(raw);
      return translated && translated !== raw ? translated : raw;
    }
    if (typeof value === 'object') {
      if (typeof value.key === 'string') return text(value.key, value.vars || {});
      if (typeof value.text === 'string') return value.text;
      return contentText(value, language);
    }
    return '';
  }
}

function hintLineFrom(hint, language) {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return '';
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return '';
  if (!hint.en.trim() || !hint.zh.trim()) return '';
  const line = contentText(hint, language);
  return typeof line === 'string' ? line.trim() : '';
}

function queuedBoss(state) {
  const queue = state?.director?.queue;
  return Array.isArray(queue) && queue.some(item => item && item.kind === 'boss');
}

function sortieLabel(state, language) {
  const id = state?.expedition;
  const row = typeof id === 'string' ? EXPEDITIONS[id] : null;
  const name = row?.name;
  if (!name || typeof name !== 'object') return '';
  const line = name[language] || name.en;
  return typeof line === 'string' ? line : '';
}

function hintKind(state, language, shown) {
  if (!shown) return '';
  const current = hintLineFrom(state?.director?.playerHint, language);
  if (shown !== current) return '';
  const intro = state?.systems?.waves?.current?.intro;
  return typeof intro === 'string' && ENEMIES[intro] ? intro : '';
}

function existingHintIcon(node) {
  if (typeof node.querySelector === 'function') {
    const found = node.querySelector('[data-hint-icon]');
    if (found) return found;
  }
  const children = node.children || [];
  for (const child of children) {
    if (child?.getAttribute?.('data-hint-icon') === 'true') return child;
  }
  return null;
}

function paintHintIcon(node, kind) {
  const previous = existingHintIcon(node);
  if (!kind) {
    if (previous?.remove) previous.remove();
    node.classList?.remove('has-icon');
    return;
  }
  if (previous?.getAttribute?.('data-icon') === kind) {
    node.classList?.add('has-icon');
    return;
  }
  if (previous?.remove) previous.remove();
  const doc = node.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') return;
  try {
    const icon = catalogIcon(doc, kind);
    icon.setAttribute('data-hint-icon', 'true');
    icon.setAttribute('aria-hidden', 'true');
    if (icon.style) {
      icon.style.width = '22px';
      icon.style.height = '22px';
      icon.style.minWidth = '22px';
      icon.style.minHeight = '22px';
    }
    if (typeof node.append === 'function') node.append(icon);
    else node.appendChild?.(icon);
    node.classList?.add('has-icon');
  } catch {
    node.classList?.remove('has-icon');
  }
}

function playerHintLine(state, language) {
  if (!queuedBoss(state) && bossApproaching(state)) {
    const upcoming = nextHintLine(state, language);
    if (upcoming) return upcoming;
  }
  return hintLineFrom(state?.director?.playerHint, language);
}

function nextHintLine(state, language) {
  return hintLineFrom(state?.director?.nextHint, language);
}

function controlButton(testid, action) {
  const button = el('button', {
    class: 'btn',
    type: 'button',
    'data-testid': testid,
    'data-action': action,
    'data-shell-control': 'true'
  });
  return button;
}

function stat(testid, label, value, extraClass) {
  return el('div', { class: extraClass ? `stat ${extraClass}` : 'stat', 'data-testid': testid }, [label, value]);
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, String(value));
    }
  }
  if (children) node.append(...children);
  return node;
}

function setText(node, value) {
  const next = value == null ? '' : String(value);
  if (node.textContent !== next) node.textContent = next;
}

function setWidth(node, pct) {
  const next = `${Math.round(clamp01(pct) * 1000) / 10}%`;
  if (node.style.width !== next) node.style.width = next;
}

function languageOf(profile) {
  return profile?.settings?.language === 'zh' ? 'zh' : 'en';
}

function screenName(ui, state) {
  const name = ui?.screen;
  if (typeof name === 'string' && SCREEN_NAMES.includes(name)) return name;
  return state ? 'battle' : 'menu';
}

function slotIndex(value) {
  return Number.isInteger(value) ? value : -1;
}

function validSlot(index, state) {
  return Number.isInteger(index) && index >= 0 && index < (state?.slots?.length || 0);
}

function mergeTarget(ui) {
  if (!ui) return -1;
  if (Number.isInteger(ui.mergeTo)) return ui.mergeTo;
  const preview = ui.mergePreview;
  if (preview && Number.isInteger(preview.to)) return preview.to;
  if (preview && Number.isInteger(preview.toIndex)) return preview.toIndex;
  return -1;
}

function structuralKey(state, profile, ui) {
  const slots = state?.slots?.map((slot) => {
    const unit = slot?.unit;
    return unit ? `${unit.id}:${unit.kind}:${unit.type}:${unit.rank}` : '';
  }).join(',') ?? '';
  const draft = state?.draft?.options?.map((option) => option?.id || '').join(',') ?? '';
  const pending = state?.pendingUnit?.unit?.id || '';
  let message = ui?.message ?? '';
  if (message && typeof message === 'object') {
    try { message = JSON.stringify(message); } catch { message = message.key || message.en || message.zh || '1'; }
  }
  return [
    screenName(ui, state),
    state?.phase ?? '',
    state?.paused ? 1 : 0,
    state?.hiddenPaused ? 1 : 0,
    state?.speed ?? '',
    profile?.settings?.language ?? '',
    profile?.settings?.sound ? 1 : 0,
    profile?.settings?.reducedMotion ? 1 : 0,
    ui?.selectedSlot ?? '',
    ui?.mergeFrom ?? '',
    ui?.mergePreview ? 1 : 0,
    message,
    state?.wave ?? '',
    playerHintKey(state?.director?.playerHint),
    playerHintKey(state?.director?.nextHint),
    state?.draftLevel ?? '',
    state?.nextDraftXp ?? '',
    state?.difficulty ?? '',
    pending,
    draft,
    slots,
    state?.settlement?.result ?? '',
    profile?.currency ?? '',
    state?.fence?.maxHp ?? '',
    Math.round(finite(state?.fence?.hp, 0)),
    Math.floor(finite(state?.xp, 0)),
    state?.kills ?? '',
    Math.floor(finite(state?.time, 0))
  ].join('|');
}

function digitFromCode(code) {
  if (code?.startsWith('Digit')) return Number(code.slice(5));
  if (code?.startsWith('Numpad')) return Number(code.slice(6));
  return null;
}

function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.isContentEditable);
}

function isControlTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  return tag === 'BUTTON' || tag === 'A' || Boolean(target.closest?.('button, a'));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function num(value, language) {
  const n = Number.isFinite(value) ? value : 0;
  try {
    const formatted = formatNumber(n, language);
    if (typeof formatted === 'string' || typeof formatted === 'number') return String(formatted);
  } catch { /* Intl fallback */ }
  try {
    return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US').format(n);
  } catch {
    return String(n);
  }
}

function fenceFailing(state) {
  const hp = state?.fence?.hp;
  const max = state?.fence?.maxHp;
  if (typeof hp !== 'number' || typeof max !== 'number' || !(max > 0) || !(hp > 0)) return false;
  return hp / max <= 0.3;
}

function playerHintKey(hint) {
  if (!hint || typeof hint !== 'object') return '';
  const en = typeof hint.en === 'string' ? hint.en : '';
  const zh = typeof hint.zh === 'string' ? hint.zh : '';
  return `${en}\n${zh}`;
}

function contentText(value, language) {
  try {
    const localized = localize(value, language);
    if (typeof localized === 'string') return localized;
  } catch { /* local fallback */ }
  if (value && typeof value === 'object') return value[language] || value.en || value.zh || '';
  return value == null ? '' : String(value);
}

function formatClock(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

function speedLabel(value) {
  return value === 1.5 ? '1.5×' : `${value}×`;
}

function speedTestId(value) {
  return value === 1.5 ? 'btn-speed-1-5' : `btn-speed-${value}`;
}
