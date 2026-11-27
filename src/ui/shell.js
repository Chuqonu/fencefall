import {superweaponCooldown} from '../systems/combat.js';
import {ARENA, DIFFICULTIES, slotGeometry} from '../shared.js';
import {bossApproaching, getWaveInfo} from '../systems/waves.js';
import {ENEMIES} from '../data/enemies.js';
import {EXPEDITIONS, stageNumber} from '../data/expeditions.js';
import {catalogIcon, navIcon} from './icons.js';
import {formatNumber, localize} from '../i18n.js';

const SPEEDS = [1, 1.5, 3, 10];
const SCREEN_NAMES = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
const BOTTOM_TABS = Object.freeze([
  {name: 'menu', icon: 'battle', labelKey: 'tabBattle'},
  {name: 'armory', icon: 'armory', labelKey: 'tabArmory'},
  {name: 'codex', icon: 'codex', labelKey: 'tabCodex'},
  {name: 'settings', icon: 'settings', labelKey: 'tabSettings'},
]);
const ARSENAL_SPECS = Object.freeze([
  {id: 'napalm', labelKey: 'arsenalNapalm', accent: '#ff6c30'},
  {id: 'armored_car', labelKey: 'arsenalCar', accent: '#f0cb72'},
  {id: 'cryo_barrage', labelKey: 'arsenalCryo', accent: '#7ce8ff'},
  {id: 'orbital_beam', labelKey: 'arsenalBeam', accent: '#54f0ff'},
  {id: 'ricochet', labelKey: 'arsenalEm', accent: '#ffe14a'},
]);

/**
 * Mobile-first App Shell & Live Battle HUD (Fencefall v5).
 * - Non-battle screens use a slim Top App Bar + Sticky 4-Tab Bottom Navigation Bar.
 * - Battle screen uses an unobstructed full-height HD vector canvas, slim translucent
 *   Top Status/XP strip, floating Auto-Skill cooldown strip, and thumb-zone Bottom
 *   Control Dock (Pause/Resume · 1× 1.5× 3× 10× · Menu).
 * - Solo Wall Gunner is permanently anchored on the central platform; tapping the Gunner
 *   toggles the Gunner Stats & Targeting Priority bottom sheet.
 */
export function mountShell(root, api) {
  if (!root || typeof root.appendChild !== 'function') {
    throw new Error('mountShell requires a root element');
  }
  if (!api || typeof api.act !== 'function') {
    throw new Error('mountShell requires an api');
  }

  const doc = root.ownerDocument || globalThis.document;
  const shell = el('div', {class: 'shell', 'data-testid': 'shell-root'});

  // --- Non-battle Top App Bar ---
  const topbar = el('header', {class: 'topbar'});
  const brand = el('div', {class: 'brand'});
  const brandCrest = el('span', {class: 'brand-crest', 'aria-hidden': 'true'}, [navIcon(doc, 'shield', 18)]);
  const title = el('h1', {class: 'brand-title', 'data-testid': 'title'});
  const subtitle = el('p', {class: 'brand-sub muted', 'data-testid': 'subtitle'});
  const brandCopy = el('div', {class: 'brand-copy'}, [title, subtitle]);
  brand.append(brandCrest, brandCopy);

  const coinValueNode = el('strong', {class: 'top-coin-val', 'data-testid': 'topbar-currency-value'});
  const coinChip = el('span', {class: 'top-coin', 'data-testid': 'topbar-currency'}, [
    navIcon(doc, 'coin', 16),
    coinValueNode
  ]);

  const langGroup = el('div', {class: 'lang-seg', role: 'group'});
  const langZh = controlButton('btn-language-zh', 'language');
  langZh.className = 'btn seg-btn';
  langZh.dataset.value = 'zh';
  const langEn = controlButton('btn-language-en', 'language');
  langEn.className = 'btn seg-btn';
  langEn.dataset.value = 'en';
  langGroup.append(langZh, langEn);

  const soundButton = controlButton('btn-sound', 'sound');
  soundButton.className = 'btn icon-btn';
  const tools = el('div', {class: 'top-tools'}, [coinChip, soundButton, langGroup]);
  topbar.append(brand, tools);

  // --- Battle Stage & Canvas ---
  const body = el('div', {class: 'shell-body'});
  const fieldSlot = el('div', {class: 'field-slot'});
  const fieldFrame = el('div', {class: 'field-frame', 'data-testid': 'field-frame'});
  const canvas = el('canvas', {
    class: 'field',
    id: 'ff-canvas',
    'data-testid': 'field-canvas',
    tabindex: '0'
  });
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  const fieldHelp = el('p', {class: 'sr-only', id: 'ff-field-help'});
  canvas.setAttribute('aria-describedby', 'ff-field-help');
  fieldFrame.append(canvas, fieldHelp);
  fieldSlot.append(fieldFrame);

  const panelRoot = el('div', {
    class: 'panel-root',
    id: 'ff-panel',
    'data-ui': 'panel',
    'data-testid': 'panel-root'
  });
  const panelWrap = el('div', {class: 'panel-wrap'});
  panelWrap.append(panelRoot);
  body.append(fieldSlot, panelWrap);

  // --- Battle Top Translucent Status + XP Strip ---
  const hud = el('header', {class: 'hud battle-top', 'data-testid': 'hud'});

  const fenceLabel = el('span', {class: 'sr-only'});
  const fenceValue = el('strong', {class: 'wall-hp-val', 'data-testid': 'hud-fence-value'});
  const fenceFill = el('div', {class: 'meter-fill'});
  const fenceMeter = el('div', {class: 'wall-hp-pill', 'data-testid': 'hud-fence'}, [
    el('span', {class: 'wall-hp-icon', 'aria-hidden': 'true'}, [navIcon(doc, 'shield', 14)]),
    el('div', {class: 'wall-hp-body'}, [
      el('div', {class: 'wall-hp-head'}, [fenceLabel, fenceValue]),
      el('div', {class: 'meter-track'}, [fenceFill])
    ])
  ]);

  const aegisValue = el('strong', {class: 'hud-chip hud-aegis-chip', 'data-testid': 'hud-wall-immunity', hidden: true});
  const surgeValue = el('strong', {class: 'hud-chip hud-surge-chip', 'data-testid': 'hud-surge', hidden: true});

  const stageChip = el('span', {class: 'hud-stage-pill', 'data-testid': 'hud-stage', hidden: true});
  const waveLabel = el('span', {class: 'stat-label'});
  const waveValue = el('strong', {class: 'stat-value', 'data-testid': 'hud-wave-value'});
  const waveProgress = el('small', {'data-testid': 'hud-wave-progress'});
  const waveStat = el('div', {class: 'stat wave-pill', 'data-testid': 'hud-wave'}, [waveLabel, waveValue, waveProgress]);

  const phase = el('span', {class: 'badge hud-phase-pill', 'data-testid': 'hud-phase', hidden: true});
  const sortie = el('span', {class: 'badge hud-sortie hud-quiet', 'data-testid': 'hud-sortie'});
  const killsValue = el('strong', {class: 'stat-value', 'data-testid': 'hud-kills-value'});
  const timeValue = el('strong', {class: 'stat-value', 'data-testid': 'hud-time-value'});
  const currencyValue = el('strong', {class: 'stat-value', 'data-testid': 'hud-currency-value'});
  const difficulty = el('span', {class: 'badge hud-quiet', 'data-testid': 'hud-difficulty'});

  const topLeft = el('div', {class: 'hud-left'}, [fenceMeter, aegisValue, surgeValue]);
  const topRight = el('div', {class: 'hud-right'}, [stageChip, waveStat, phase]);
  const hudTopRow = el('div', {class: 'hud-row-main'}, [topLeft, topRight]);

  const xpLabel = el('span', {class: 'xp-lv-pill', 'data-testid': 'hud-xp-level'});
  const xpValue = el('strong', {class: 'xp-val-text', 'data-testid': 'hud-xp-value'});
  const xpFill = el('div', {class: 'meter-fill is-xp'});
  const xpMeter = el('div', {class: 'xp-strip', 'data-testid': 'hud-xp'}, [
    xpLabel,
    el('div', {class: 'meter-track is-xp-track'}, [xpFill]),
    xpValue
  ]);

  const waveHint = el('p', {class: 'hud-hint', 'data-testid': 'hud-hint', hidden: true});
  const message = el('p', {class: 'hud-message', 'data-testid': 'hud-message'});
  const live = el('p', {class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'hud-live'});
  const quietStats = el('div', {class: 'hud-quiet', 'aria-hidden': 'true'}, [sortie, killsValue, timeValue, currencyValue, difficulty]);

  hud.append(hudTopRow, xpMeter, waveHint, message, quietStats, live);

  // --- Floating Auto-Arsenal Super-Weapon Cooldown Strip ---
  const arsenalBar = el('div', {class: 'hud-arsenal', 'data-testid': 'hud-arsenal', hidden: true, 'aria-hidden': 'true'});
  const arsenalItems = ARSENAL_SPECS.map((spec) => {
    const label = el('span', {class: 'arsenal-label'});
    const fill = el('span', {class: 'arsenal-fill'});
    const pill = el('span', {
      class: 'arsenal-pill',
      'data-testid': `hud-arsenal-${spec.id}`,
      style: `--arsenal-accent:${spec.accent}`,
      hidden: true,
    }, [label, el('span', {class: 'arsenal-track'}, [fill])]);
    arsenalBar.append(pill);
    return {...spec, pill, label, fill};
  });

  // --- Thumb-Zone Battle Bottom Control Dock ---
  const battleDock = el('footer', {class: 'battle-dock', 'data-testid': 'battle-dock'});
  const pauseButton = controlButton('btn-pause', 'pause');
  pauseButton.className = 'btn dock-btn dock-pause';
  const speedButtons = SPEEDS.map((value) => {
    const button = controlButton(speedTestId(value), 'speed');
    button.className = 'btn speed-btn';
    button.dataset.value = String(value);
    button.textContent = speedLabel(value);
    return button;
  });
  const speedRow = el('div', {class: 'speed-row', role: 'group'});
  speedRow.append(...speedButtons);
  const menuButton = controlButton('btn-fight-menu', 'screen');
  menuButton.className = 'btn dock-btn dock-menu';
  menuButton.dataset.name = 'menu';
  battleDock.append(pauseButton, speedRow, menuButton);

  // --- Non-Battle Mobile Sticky Bottom Tab Bar ---
  const bottomNav = el('nav', {class: 'bottom-nav', 'data-testid': 'screen-nav'});
  const screenButtons = new Map();
  for (const tab of BOTTOM_TABS) {
    const button = controlButton(`btn-screen-${tab.name}`, 'screen');
    button.className = 'tab-btn';
    button.dataset.name = tab.name;
    const iconWrap = el('span', {class: 'tab-icon'}, [navIcon(doc, tab.icon, 22)]);
    const dot = el('span', {class: 'tab-dot', hidden: true});
    iconWrap.append(dot);
    const labelNode = el('span', {class: 'tab-label'});
    button.append(iconWrap, labelNode);
    bottomNav.append(button);
    screenButtons.set(tab.name, {button, labelNode, dot, labelKey: tab.labelKey});
  }

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

  shell.append(topbar, body, hud, arsenalBar, battleDock, overlayRoot, menuRoot, bottomNav);
  root.replaceChildren(shell);

  let dead = false;
  let pointer = null;
  let suppressClick = false;
  let clickTimer = 0;
  let lastKey = '';
  let lastPaint = 0;
  let timer = 0;

  function onPointerDown(event) {
    if (dead || event.button !== 0) return;
    pointer = {
      id: event.pointerId,
      type: event.pointerType || 'mouse',
      x: event.clientX,
      y: event.clientY,
    };
  }

  function onPointerUp(event) {
    if (dead) return;
    if (pointer && pointer.id !== event.pointerId) return;
    const startX = pointer ? pointer.x : event.clientX;
    const startY = pointer ? pointer.y : event.clientY;
    const pointerType = pointer?.type || event.pointerType;
    pointer = null;
    suppressClick = true;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = false; }, 400);
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 36) return;
    handleTap(event.clientX, event.clientY, pointerType);
  }

  function onPointerCancel() {
    pointer = null;
  }

  function onClick(event) {
    if (dead || suppressClick) return;
    handleTap(event.clientX, event.clientY, 'mouse');
  }

  function onControl(event) {
    if (dead) return;
    if (event.target.closest?.('[data-ui]')) return;
    const button = event.target.closest?.('button[data-action]');
    if (!button || button.dataset.shellControl !== 'true' || !shell.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'speed') {
      api.act('speed', {value: Number(button.dataset.value)});
      return;
    }
    if (action === 'language') {
      api.act('language', {value: button.dataset.value === 'zh' ? 'zh' : 'en'});
      return;
    }
    if (action === 'screen') {
      api.act('screen', {name: button.dataset.name});
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
      if (screen !== 'battle') {
        if (state && state.phase !== 'victory' && state.phase !== 'defeat') {
          event.preventDefault();
          api.act('screen', {name: 'battle'});
        }
        return;
      }
      if (slotIndex(ui?.selectedSlot) >= 0) {
        event.preventDefault();
        api.act('selectSlot', {index: -1});
      }
      return;
    }

    if (onControlKey && (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter')) return;

    if (event.code === 'KeyM') {
      event.preventDefault();
      api.act('screen', {name: screen === 'menu' && state ? 'battle' : 'menu'});
      return;
    }

    if ((event.code === 'Space' || event.code === 'KeyP') && screen === 'battle' && state) {
      if (phaseName === 'victory' || phaseName === 'defeat') return;
      const held = state.paused === true || state.hiddenPaused === true;
      if (phaseName === 'draft' && !held) return;
      event.preventDefault();
      if (held) releaseHold();
      else api.act('pause');
      return;
    }

    const digit = digitFromCode(event.code);
    if (digit == null || screen !== 'battle' || !state) return;
    if (phaseName === 'draft') {
      if (digit >= 1 && digit <= 3) {
        event.preventDefault();
        api.act('chooseDraft', {index: digit - 1});
      }
      return;
    }
    const value = SPEEDS[digit - 1];
    if (value != null) {
      event.preventDefault();
      api.act('speed', {value});
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
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
    if (key === lastKey && now - lastPaint < 180) return;
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
    const liveRun = Boolean(state && state.phase !== 'victory' && state.phase !== 'defeat');

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
    shell.classList.toggle('is-battle', screen === 'battle');
    shell.classList.toggle('is-paused', paused || hiddenPaused);
    shell.classList.toggle('is-draft', phaseName === 'draft');
    shell.classList.toggle('is-victory', phaseName === 'victory');
    shell.classList.toggle('is-defeat', phaseName === 'defeat');
    shell.classList.toggle('is-reduced-motion', profile?.settings?.reducedMotion === true);

    const menuOpen = screen !== 'battle';
    fieldSlot.inert = menuOpen || phaseName === 'draft';
    panelWrap.inert = menuOpen;
    hud.inert = menuOpen;
    battleDock.inert = menuOpen;

    const topH = menuOpen ? topbar.offsetHeight : hud.offsetHeight;
    if (topH > 0) shell.style.setProperty('--topbar-height', `${topH}px`);
    const dockH = menuOpen ? bottomNav.offsetHeight : battleDock.offsetHeight;
    if (dockH > 0) shell.style.setProperty('--dock-height', `${dockH}px`);

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
    shell.classList.toggle('has-side-card', screen === 'battle' && boardLeft >= 240);

    // Topbar tools & coin chip
    setText(coinValueNode, profile ? num(finite(profile.currency, 0), language) : '0');
    const soundOn = profile?.settings?.sound === true;
    setText(langZh, '中');
    setText(langEn, 'EN');
    langGroup.setAttribute('aria-label', text('language'));
    langZh.setAttribute('aria-pressed', language === 'zh' ? 'true' : 'false');
    langEn.setAttribute('aria-pressed', language === 'en' ? 'true' : 'false');
    langZh.classList.toggle('is-active', language === 'zh');
    langEn.classList.toggle('is-active', language === 'en');

    const soundIconKey = soundOn ? 'soundOn' : 'soundOff';
    if (soundButton.dataset.iconKey !== soundIconKey) {
      soundButton.dataset.iconKey = soundIconKey;
      soundButton.replaceChildren(navIcon(doc, soundIconKey, 18));
    }
    soundButton.setAttribute('aria-label', soundOn ? text('soundOn') : text('soundOff'));
    soundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundButton.classList.toggle('is-active', soundOn);

    // Bottom Navigation Tabs (non-battle)
    bottomNav.setAttribute('aria-label', titleText || 'Fencefall');
    const activeTab = screen === 'results' ? 'menu' : screen === 'howto' ? 'settings' : screen;
    for (const [name, entry] of screenButtons) {
      setText(entry.labelNode, text(entry.labelKey));
      const isCurrent = name === activeTab;
      entry.button.classList.toggle('is-active', isCurrent);
      if (isCurrent) entry.button.setAttribute('aria-current', 'page');
      else entry.button.removeAttribute('aria-current');
      entry.dot.hidden = !(name === 'menu' && liveRun);
    }

    const selected = slotIndex(ui?.selectedSlot);
    const unitOpen = screen === 'battle' && selected >= 0 && Boolean(state?.slots?.[selected]?.unit) && phaseName !== 'draft';
    shell.classList.toggle('is-unit-open', unitOpen);
    const overlayOpen = screen === 'battle' && phaseName === 'draft';
    overlayRoot.classList.toggle('is-open', overlayOpen);
    overlayRoot.classList.toggle('is-modal', overlayOpen);
    menuRoot.classList.toggle('is-open', menuOpen);

    canvas.setAttribute('aria-label', [text('fence'), text('helpPlacement'), text('helpRange')].filter(Boolean).join(' · '));
    setText(fieldHelp, [text('helpPlacement'), text('helpRange'), text('helpFence')].filter(Boolean).join(' '));

    // Battle Controls (Bottom Dock)
    const runReady = Boolean(state);
    const speedLocked = !runReady || phaseName === 'victory' || phaseName === 'defeat';
    const held = paused || hiddenPaused;
    pauseButton.disabled = speedLocked;
    pauseButton.setAttribute('data-action', held ? 'resume' : 'pause');
    pauseButton.setAttribute('aria-pressed', held ? 'true' : 'false');
    pauseButton.setAttribute('aria-label', held ? text('resume') : text('pause'));
    const pauseMode = held ? 'play' : 'pause';
    const pauseLabel = held ? text('resume') : text('pause');
    if (pauseButton.dataset.iconKey !== `${pauseMode}:${pauseLabel}`) {
      pauseButton.dataset.iconKey = `${pauseMode}:${pauseLabel}`;
      pauseButton.replaceChildren(navIcon(doc, pauseMode, 16), el('span', {class: 'dock-lbl'}, [pauseLabel]));
    }

    const menuLabel = text('menu');
    if (menuButton.dataset.iconKey !== menuLabel) {
      menuButton.dataset.iconKey = menuLabel;
      menuButton.replaceChildren(navIcon(doc, 'menu', 16), el('span', {class: 'dock-lbl'}, [menuLabel]));
    }
    menuButton.setAttribute('aria-label', menuLabel);

    speedRow.setAttribute('aria-label', text('speed'));
    for (const button of speedButtons) {
      const value = Number(button.dataset.value);
      const active = runReady && Number(state.speed) === value;
      button.disabled = speedLocked;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', `${text('speed')} ${speedLabel(value)}`);
    }

    // Battle Top Status & XP
    const fence = state?.fence;
    const fenceHp = finite(fence?.hp, 0);
    const fenceMax = finite(fence?.maxHp, 0);
    const fencePct = fenceMax > 0 ? clamp01(fenceHp / fenceMax) : 0;
    setText(fenceLabel, text('fence'));
    setText(fenceValue, runReady ? `${num(Math.ceil(Math.max(0, fenceHp)), language)}/${num(Math.ceil(fenceMax), language)}` : '—');
    fenceFill.className = `meter-fill${fencePct <= 0.3 ? ' is-low' : fencePct <= 0.6 ? ' is-mid' : ''}`;
    setWidth(fenceFill, fencePct);

    const xp = finite(state?.xp, 0);
    const nextXp = finite(state?.nextDraftXp, 0);
    const xpPct = nextXp > 0 ? clamp01(xp / nextXp) : 0;
    setText(xpLabel, runReady ? `Lv.${num(finite(state?.draftLevel, 0) + 1, language)}` : 'Lv.1');
    setText(xpValue, runReady ? `${num(Math.floor(xp), language)}/${num(Math.ceil(nextXp), language)}` : '—');
    setWidth(xpFill, xpPct);

    if (state) {
      const charges = Number.isFinite(state.surge?.charges) ? state.surge.charges : 0;
      const shieldActive = (state.surge?.shieldTimer || 0) > 0;
      surgeValue.hidden = charges <= 0 && !shieldActive;
      setText(surgeValue, `${text('surge')} ${charges}`);
      surgeValue.classList.toggle('is-active', shieldActive);

      const wallImmune = Number.isFinite(state.wallImmunity) ? Math.max(0, Math.floor(state.wallImmunity)) : 0;
      aegisValue.hidden = wallImmune <= 0;
      if (wallImmune > 0) setText(aegisValue, `${text('aegisChip')}×${wallImmune}`);

      const heroUnit = state.slots?.find((s) => s?.unit && (s.unit.kind === 'hero' || s.unit.type === 'hero'))?.unit;
      const upg = heroUnit?.upgrades && typeof heroUnit.upgrades === 'object' ? heroUnit.upgrades : {};
      const timers = state.arsenal?.timers || {};
      const swHaste = Number(state.systems?.integration?.bonuses?.superweaponHaste) || 0;
      let anyArsenal = false;
      for (const item of arsenalItems) {
        const rank = Math.max(0, Math.floor(Number(upg[item.id]) || 0));
        if (rank <= 0) {
          item.pill.hidden = true;
          continue;
        }
        anyArsenal = true;
        item.pill.hidden = false;
        const maxCd = superweaponCooldown(item.id, rank, swHaste);
        const rem = Number.isFinite(timers[item.id]) ? Math.max(0, timers[item.id]) : 0;
        const pct = maxCd > 0 ? clamp01(1 - rem / maxCd) : 1;
        setText(item.label, `${text(item.labelKey)} ${rank}`);
        setWidth(item.fill, pct);
        item.pill.classList.toggle('is-firing', pct >= 0.9 || rem <= 0.35);
      }
      arsenalBar.hidden = !anyArsenal || screen !== 'battle';
    } else {
      arsenalBar.hidden = true;
    }

    const sortieName = runReady ? sortieLabel(state, language) : '';
    setText(sortie, sortieName);
    const sNum = runReady ? stageNumber(state.expedition) : 0;
    stageChip.hidden = sNum <= 0;
    if (sNum > 0) setText(stageChip, language === 'zh' ? `第${sNum}关` : `S${sNum}`);
    setText(waveLabel, language === 'zh' ? '波' : 'W');
    setText(waveValue, runReady ? num(finite(state.wave, 0), language) : '—');
    setText(waveProgress, runReady ? `${Math.round((getWaveInfo(state).progress || 0) * 100)}%` : '');
    setText(killsValue, runReady ? num(finite(state?.kills, 0), language) : '—');
    setText(timeValue, runReady ? formatClock(state?.time) : '—');
    setText(currencyValue, profile ? num(finite(profile.currency, 0), language) : '—');
    const diff = state?.difficulty ? DIFFICULTIES[state.difficulty] : null;
    setText(difficulty, diff ? contentText(diff.name, language) : '');

    const phaseText = phaseBadge(state);
    setText(phase, phaseText);
    phase.hidden = !phaseText;
    phase.classList.toggle('is-boss', Boolean(phaseText && phaseText === text('bossWarning')));
    phase.classList.toggle('is-danger', Boolean(phaseText && phaseText === text('fenceDanger')));

    const note = messageText(ui?.message, language);
    setText(message, note);
    const hintLine = screen === 'battle' && phaseName !== 'draft' ? playerHintLine(state, language) : '';
    setText(waveHint, hintLine);
    waveHint.hidden = !hintLine;
    paintHintIcon(waveHint, hintKind(state, language, hintLine));
    setText(live, [phaseText, note].filter(Boolean).join(' · '));
  }

  function handleTap(clientX, clientY, pointerType) {
    const state = readState();
    const ui = readUI();
    if (!state || screenName(ui, state) !== 'battle') return;
    if (state.phase === 'draft') return;
    const hit = heroSlotFromClient(clientX, clientY, pointerType, state);
    if (hit >= 0) {
      const next = slotIndex(ui?.selectedSlot) === hit ? -1 : hit;
      api.act('selectSlot', {index: next});
      return;
    }
    if (slotIndex(ui?.selectedSlot) >= 0) {
      api.act('selectSlot', {index: -1});
    }
  }

  function heroSlotFromClient(clientX, clientY, pointerType, state) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return -1;
    const x = ((clientX - rect.left) / rect.width) * ARENA.width;
    const y = ((clientY - rect.top) / rect.height) * ARENA.height;
    if (x < -16 || y < -16 || x > ARENA.width + 16 || y > ARENA.height + 16) return -1;
    const slots = Array.isArray(state?.slots) ? state.slots : [];
    const heroIndex = slots.findIndex((s) => s?.unit && (s.unit.kind === 'hero' || s.unit.type === 'hero'));
    if (heroIndex < 0) return -1;
    const center = slotGeometry(heroIndex);
    const touch = pointerType === 'touch' || pointerType === 'pen';
    const rx = touch ? 54 : 44;
    const ry = touch ? 46 : 38;
    const dx = Math.abs(x - center.x);
    const dy = Math.abs(y - (center.y - 2));
    return (dx <= rx && dy <= ry) ? heroIndex : -1;
  }

  function destroy() {
    if (dead) return;
    dead = true;
    clearInterval(timer);
    clearTimeout(clickTimer);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('click', onClick);
    shell.removeEventListener('click', onControl);
    document.removeEventListener('keydown', onKey);
    shell.remove();
  }

  render();
  timer = setInterval(() => { render(); }, 200);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {render, destroy, canvas, overlayRoot, panelRoot, menuRoot};

  function text(key, vars) {
    try {
      if (typeof api.t === 'function') {
        const value = api.t(key, vars);
        if (typeof value === 'string') return value;
      }
    } catch { /* fallback */ }
    return key;
  }

  function readState() { try { return api.getState?.() || null; } catch { return null; } }
  function readProfile() { try { return api.getProfile?.() || null; } catch { return null; } }
  function readUI() { try { return api.getUI?.() || null; } catch { return null; } }

  function releaseHold() {
    api.act('resume');
    const state = readState();
    if (state && (state.hiddenPaused === true || state.paused === true)) api.act('resume');
  }

  function phaseBadge(state) {
    if (!state) return '';
    if (state.phase === 'victory') return text('victory');
    if (state.phase === 'defeat') return text('defeat');
    if (state.phase === 'playing' && (state.paused || state.hiddenPaused)) return text('paused');
    if (bossApproaching(state)) return text('bossWarning');
    if (fenceFailing(state)) return text('fenceDanger');
    return '';
  }

  function messageText(value, language) {
    if (value == null || value === false || value === '') return '';
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
  return Array.isArray(queue) && queue.some((item) => item && item.kind === 'boss');
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
  if (typeof node.querySelector === 'function') return node.querySelector('[data-hint-icon]');
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
      icon.style.width = '20px';
      icon.style.height = '20px';
      icon.style.minWidth = '20px';
      icon.style.minHeight = '20px';
    }
    node.append(icon);
    node.classList?.add('has-icon');
  } catch {
    node.classList?.remove('has-icon');
  }
}

function playerHintLine(state, language) {
  if (!queuedBoss(state) && bossApproaching(state)) {
    const upcoming = hintLineFrom(state?.director?.nextHint, language);
    if (upcoming) return upcoming;
  }
  return hintLineFrom(state?.director?.playerHint, language);
}

function controlButton(testid, action) {
  return el('button', {
    class: 'btn',
    type: 'button',
    'data-testid': testid,
    'data-action': action,
    'data-shell-control': 'true'
  });
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
  if (children) {
    if (children.length === 1 && typeof children[0] === 'string') {
      node.textContent = children[0];
    } else {
      for (const child of children) {
        if (child == null || child === false) continue;
        if (typeof child === 'string' || typeof child === 'number') {
          if (typeof document.createTextNode === 'function') node.append(document.createTextNode(String(child)));
          else node.textContent = (node.textContent || '') + String(child);
        } else {
          node.append(child);
        }
      }
    }
  }
  return node;
}

function setText(node, value) {
  const next = value == null ? '' : String(value);
  if (node && node.textContent !== next) node.textContent = next;
}

function setWidth(node, pct) {
  const next = `${Math.round(clamp01(pct) * 1000) / 10}%`;
  if (node && node.style.width !== next) node.style.width = next;
}

function languageOf(profile) { return profile?.settings?.language === 'zh' ? 'zh' : 'en'; }

function screenName(ui, state) {
  const name = ui?.screen;
  if (typeof name === 'string' && SCREEN_NAMES.includes(name)) return name;
  return state ? 'battle' : 'menu';
}

function slotIndex(value) { return Number.isInteger(value) ? value : -1; }
function validSlot(index, state) { return Number.isInteger(index) && index >= 0 && index < (state?.slots?.length || 0); }

function structuralKey(state, profile, ui) {
  const slots = state?.slots?.map((slot) => {
    const unit = slot?.unit;
    return unit ? `${unit.id}:${unit.kind}:${unit.type}:${unit.rank}:${unit.targeting}` : '';
  }).join(',') ?? '';
  const draft = state?.draft?.options?.map((option) => option?.id || '').join(',') ?? '';
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
    typeof ui?.message === 'string' ? ui.message : '',
    state?.wave ?? '',
    state?.surge?.charges ?? '',
    state?.surge?.shieldTimer > 0 ? 1 : 0,
    state?.wallImmunity ?? '',
    ...ARSENAL_SPECS.map((spec) => Math.floor(finite(state?.arsenal?.timers?.[spec.id], 0) * 2)),
    playerHintKey(state?.director?.playerHint),
    playerHintKey(state?.director?.nextHint),
    state?.draftLevel ?? '',
    state?.nextDraftXp ?? '',
    state?.difficulty ?? '',
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

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }

function num(value, language) {
  const n = Number.isFinite(value) ? value : 0;
  try {
    const formatted = formatNumber(n, language);
    if (typeof formatted === 'string' || typeof formatted === 'number') return String(formatted);
  } catch { /* fallback */ }
  return String(n);
}

function fenceFailing(state) {
  const hp = state?.fence?.hp;
  const max = state?.fence?.maxHp;
  if (typeof hp !== 'number' || typeof max !== 'number' || !(max > 0) || !(hp > 0)) return false;
  return hp / max <= 0.3;
}

function playerHintKey(hint) {
  if (!hint || typeof hint !== 'object') return '';
  return `${hint.en || ''}\n${hint.zh || ''}`;
}

function contentText(value, language) {
  try {
    const localized = localize(value, language);
    if (typeof localized === 'string') return localized;
  } catch { /* fallback */ }
  if (value && typeof value === 'object') return value[language] || value.en || value.zh || '';
  return value == null ? '' : String(value);
}

function formatClock(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function speedLabel(value) { return value === 1.5 ? '1.5×' : `${value}×`; }
function speedTestId(value) { return value === 1.5 ? 'btn-speed-1-5' : `btn-speed-${value}`; }
