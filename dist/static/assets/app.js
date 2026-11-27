(() => {
"use strict";
const __ff_factories = Object.create(null);
const __ff_cache = Object.create(null);
function __ff_load(id) {
  const hit = __ff_cache[id];
  if (hit) return hit.exports;
  const factory = __ff_factories[id];
  if (!factory) throw new Error("Fencefall bundle missing module: " + id);
  const rec = __ff_cache[id] = {exports: Object.create(null)};
  try { factory.call(undefined, rec.exports, __ff_load); }
  catch (error) { delete __ff_cache[id]; throw error; }
  return rec.exports;
}
function __ff_dyn(id) { return Promise.resolve().then(() => __ff_load(id)); }
__ff_factories["src/audio.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["createAudio"] = createAudio;
const __ff_m0 = __ff_load("src/render/effects.js");
const collectFeedback = __ff_m0["collectFeedback"];
/**
 * Fencefall Studio Web Audio Engine (SFX + Adaptive Procedural BGM).
 *
 * createAudio(options?) -> {
 *   unlock(),
 *   setEnabled(boolean),
 *   setMusicMode('silent' | 'menu' | 'battle' | 'boss' | 'draft'),
 *   getMusicMode(),
 *   playEvents(events, hint?),
 *   destroy()
 * }
 *
 * Pure Web Audio API synthesis — zero external audio files or CDN requests.
 * - Sound starts muted (`enabled = false`, `musicMode = 'silent'`) until explicitly
 *   enabled and unlocked inside a user gesture (pointer or key).
 * - Master GainNode is always the first GainNode created on the AudioContext so
 *   mute ramps silence every SFX and BGM bus simultaneously.
 * - All SFX use warm filtered envelopes, layered transients, subtle room slapback,
 *   and musical D-minor/F-major pentatonic harmony so rapid combat sounds crisp,
 *   punchy, and never piercing.
 * - Adaptive 8-bar procedural BGM shifts smoothly across Menu (106 BPM cozy groove),
 *   Battle (126 BPM heroic defense), Boss (140 BPM urgent showdown), and Draft
 *   (warm low-pass ducked bed).
 */


const MASTER = 1;
const MAX_SFX_VOICES = 20;
const SHOT_BED = 1;
const SHOT_REPEAT_WINDOW = 1.35;
const SHOT_REPEAT_STEPS = Object.freeze([1, 0.66, 0.5]);
const REDUCED_GAIN = 0.52;
const REDUCED_TIME = 0.58;
const REDUCED_FLOOR = 0.016;
const MOTION_CAP = 2;

const BGM_MODES = new Set(['silent', 'menu', 'battle', 'boss', 'draft']);
const BGM_LOOKAHEAD_SEC = 0.22;
const BGM_TICK_MS = 65;

const AUDIO_LIMITS = Object.freeze({
  shot: 3,
  hit: 4,
  kill: 3,
  fence_hit: 2,
  upgrade_tower: 2,
  draft: 1,
  victory: 1,
  defeat: 1,
  ui: 2,
  status: 2,
  boss: 1,
  fence_surge: 1,
  corpse_explode: 2,
  wave_horde: 1,
  draft_reroll: 1,
  targeting_change: 1,
  napalm_blast: 1,
  armored_car: 1,
  cryo_barrage: 1,
  orbital_beam: 1,
  em_strike: 2,
  wall_immune: 2,
  bullet_split: 2,
  cryo_shatter: 2,
});

const GAPS = Object.freeze({
  shot: 0.048,
  hit: 0.032,
  kill: 0.055,
  fence_hit: 0.075,
  upgrade_tower: 0.16,
  draft: 0.2,
  victory: 0.35,
  defeat: 0.35,
  ui: 0.025,
  status: 0.08,
  boss: 0.25,
  fence_surge: 0.35,
  corpse_explode: 0.09,
  wave_horde: 0.6,
  draft_reroll: 0.12,
  targeting_change: 0.05,
  napalm_blast: 0.22,
  armored_car: 0.3,
  cryo_barrage: 0.22,
  orbital_beam: 0.28,
  em_strike: 0.18,
  wall_immune: 0.12,
  bullet_split: 0.06,
  cryo_shatter: 0.08,
});

const PRIORITY = Object.freeze({
  victory: 0,
  defeat: 1,
  fence_surge: 2,
  orbital_beam: 2,
  napalm_blast: 3,
  armored_car: 3,
  upgrade_tower: 3,
  draft: 4,
  cryo_barrage: 4,
  em_strike: 4,
  wall_immune: 5,
  boss: 5,
  wave_horde: 5,
  fence_hit: 6,
  corpse_explode: 7,
  cryo_shatter: 7,
  kill: 7,
  draft_reroll: 7,
  hit: 8,
  bullet_split: 9,
  shot: 9,
  targeting_change: 9,
  ui: 10,
  status: 11,
});

const PITCH = Object.freeze({
  bolt: 620,
  fire: 175,
  frost: 880,
  lightning: 1175,
  poison: 215,
  support: 587,
  hero: 330,
  brittle: 340,
  neutral: 392,
});

// Musical note table (Hz, A4 = 440) for D-minor / F-major soundtrack & chimes
const N = Object.freeze({
  D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, Bb2: 116.54, C3: 130.81, Cs3: 138.59,
  D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, Bb3: 233.08, C4: 261.63, Cs4: 277.18,
  D4: 293.66, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00, A4: 440.00, Bb4: 466.16, C5: 523.25, Cs5: 554.37,
  D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, A5: 880.00, Bb5: 932.33, C6: 1046.50,
  D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00,
});

// Pentatonic XP sparkle cascade (harmonizes cleanly with D-minor BGM)
const KILL_SPARKLE = Object.freeze([N.D5, N.F5, N.G5, N.A5, N.C6, N.D6, N.C6, N.A5]);

// ---------------------------------------------------------------------------
// 8-Bar Adaptive Musical Scores (128 16th-note steps, 16 steps/bar)
// Progression: Dm | Bb | C | A7 | Dm | F | Gm | A7
// ---------------------------------------------------------------------------

const BAR_CHORDS = Object.freeze([
  [N.D4, N.F4, N.A4],       // Bar 0: Dm
  [N.Bb3, N.D4, N.F4],      // Bar 1: Bb
  [N.C4, N.E4, N.G4],       // Bar 2: C
  [N.A3, N.Cs4, N.E4],      // Bar 3: A
  [N.D4, N.F4, N.A4],       // Bar 4: Dm
  [N.F4, N.A4, N.C5],       // Bar 5: F
  [N.G3, N.Bb3, N.D4],      // Bar 6: Gm
  [N.A3, N.Cs4, N.E4],      // Bar 7: A7
]);

// Bouncy PvZ-inspired octave bassline (8 bars × 16 steps = 128)
const BATTLE_BASS = Object.freeze([
  // Bar 0: Dm
  N.D2, 0, 0, N.D3, 0, 0, N.A2, 0, N.D2, 0, N.F2, 0, N.A2, 0, N.C3, 0,
  // Bar 1: Bb
  N.Bb2, 0, 0, N.D3, 0, 0, N.F2, 0, N.Bb2, 0, N.Bb2, 0, N.F2, 0, N.A2, 0,
  // Bar 2: C
  N.C3, 0, 0, N.C3, 0, 0, N.G2, 0, N.C3, 0, N.E2, 0, N.G2, 0, N.Bb2, 0,
  // Bar 3: A7
  N.A2, 0, 0, N.A2, 0, 0, N.E2, 0, N.A2, 0, N.Cs3, 0, N.E3, 0, N.C3, 0,
  // Bar 4: Dm
  N.D2, 0, 0, N.D3, 0, 0, N.A2, 0, N.D2, 0, N.F2, 0, N.A2, 0, N.D3, 0,
  // Bar 5: F
  N.F2, 0, 0, N.C3, 0, 0, N.A2, 0, N.F2, 0, N.A2, 0, N.C3, 0, N.A2, 0,
  // Bar 6: Gm
  N.G2, 0, 0, N.D3, 0, 0, N.Bb2, 0, N.G2, 0, N.Bb2, 0, N.D3, 0, N.Bb2, 0,
  // Bar 7: A7 turnaround
  N.A2, 0, 0, N.E3, 0, 0, N.Cs3, 0, N.A2, 0, N.G2, 0, N.F2, 0, N.E2, 0,
]);

// Catchy heroic marimba/pizzicato A+B melody (128 steps; [freq, durSteps, vel])
const BATTLE_MELODY = Object.freeze([
  // Bar 0 (Dm): playful upbeat hook
  [N.D5, 2, 0.9], 0, [N.F5, 2, 0.85], 0, [N.A5, 3, 1.0], 0, 0, [N.G5, 1, 0.78],
  [N.F5, 2, 0.88], 0, [N.E5, 2, 0.8], [N.D5, 2, 0.85], 0, [N.C5, 2, 0.72], 0, 0,
  // Bar 1 (Bb): bouncy answer
  [N.Bb4, 2, 0.88], 0, [N.D5, 2, 0.86], 0, [N.F5, 3, 0.96], 0, 0, [N.G5, 1, 0.82],
  [N.F5, 2, 0.9], 0, [N.D5, 3, 0.82], 0, 0, [N.F5, 2, 0.76], 0, 0,
  // Bar 2 (C): bright lift
  [N.E5, 2, 0.9], 0, [N.G5, 2, 0.9], 0, [N.C6, 3, 1.0], 0, 0, [N.Bb5, 1, 0.8],
  [N.A5, 2, 0.9], 0, [N.G5, 2, 0.86], [N.E5, 2, 0.82], 0, [N.G5, 2, 0.78], 0, 0,
  // Bar 3 (A7): crisp rhythmic turnaround
  [N.A5, 3, 0.95], 0, 0, [N.G5, 1, 0.78], [N.F5, 2, 0.84], 0, [N.E5, 2, 0.84], 0,
  [N.Cs5, 2, 0.82], 0, [N.E5, 2, 0.86], 0, [N.A5, 3, 0.9], 0, 0, 0,
  // Bar 4 (Dm - B section soaring chorus!)
  [N.D6, 3, 1.0], 0, 0, [N.C6, 1, 0.82], [N.A5, 2, 0.92], 0, [N.F5, 2, 0.85], 0,
  [N.G5, 2, 0.88], 0, [N.A5, 2, 0.94], 0, [N.F5, 3, 0.84], 0, 0, 0,
  // Bar 5 (F - bright major lift!)
  [N.C6, 3, 1.0], 0, 0, [N.A5, 1, 0.8], [N.F5, 2, 0.88], 0, [N.A5, 2, 0.9], 0,
  [N.C6, 2, 0.96], 0, [N.D6, 2, 1.0], 0, [N.C6, 3, 0.88], 0, 0, 0,
  // Bar 6 (Gm - heroic tension)
  [N.Bb5, 3, 0.96], 0, 0, [N.A5, 1, 0.82], [N.G5, 2, 0.9], 0, [N.D5, 2, 0.82], 0,
  [N.F5, 2, 0.86], 0, [N.G5, 2, 0.92], 0, [N.Bb5, 3, 0.94], 0, 0, 0,
  // Bar 7 (A7 - dramatic cadence home)
  [N.A5, 2, 0.96], 0, [N.G5, 2, 0.88], 0, [N.F5, 2, 0.86], 0, [N.E5, 2, 0.88], 0,
  [N.A5, 2, 0.94], 0, [N.G5, 2, 0.84], 0, [N.E5, 3, 0.86], 0, 0, 0,
]);

// Cozy, welcoming lobby melody (128 steps, airy phrasing with breathing room)
const MENU_MELODY = Object.freeze([
  // Bar 0 (Dm)
  [N.D5, 2, 0.78], 0, 0, [N.F5, 2, 0.75], 0, [N.A5, 3, 0.85], 0, 0,
  0, 0, [N.G5, 2, 0.72], 0, [N.F5, 3, 0.76], 0, 0, 0,
  // Bar 1 (Bb)
  [N.D5, 2, 0.76], 0, 0, [N.F5, 2, 0.78], 0, [N.D5, 3, 0.74], 0, 0,
  0, 0, [N.C5, 2, 0.68], 0, [N.D5, 3, 0.75], 0, 0, 0,
  // Bar 2 (C)
  [N.E5, 2, 0.78], 0, 0, [N.G5, 2, 0.82], 0, [N.C6, 3, 0.88], 0, 0,
  0, 0, [N.A5, 2, 0.76], 0, [N.G5, 3, 0.78], 0, 0, 0,
  // Bar 3 (A7)
  [N.E5, 3, 0.78], 0, 0, 0, [N.F5, 2, 0.74], 0, [N.E5, 2, 0.74], 0,
  [N.Cs5, 3, 0.72], 0, 0, 0, [N.E5, 3, 0.74], 0, 0, 0,
  // Bar 4 (Dm)
  [N.A5, 3, 0.84], 0, 0, [N.G5, 1, 0.7], [N.F5, 2, 0.78], 0, [N.D5, 2, 0.72], 0,
  0, 0, [N.F5, 2, 0.76], 0, [N.A5, 3, 0.82], 0, 0, 0,
  // Bar 5 (F)
  [N.C6, 3, 0.88], 0, 0, [N.A5, 1, 0.74], [N.F5, 2, 0.78], 0, [N.A5, 3, 0.8], 0,
  0, 0, [N.G5, 2, 0.72], 0, [N.F5, 3, 0.76], 0, 0, 0,
  // Bar 6 (Gm)
  [N.Bb5, 3, 0.84], 0, 0, [N.A5, 1, 0.74], [N.G5, 2, 0.8], 0, [N.D5, 3, 0.74], 0,
  0, 0, [N.F5, 2, 0.74], 0, [N.G5, 3, 0.78], 0, 0, 0,
  // Bar 7 (A7)
  [N.A5, 3, 0.84], 0, 0, 0, [N.G5, 2, 0.74], 0, [N.E5, 2, 0.74], 0,
  [N.A4, 3, 0.72], 0, 0, 0, [N.Cs5, 3, 0.74], 0, 0, 0,
]);

// High-energy 4-bar (64-step) Boss motif — urgent pulsing bass & dramatic brass lead
const BOSS_BASS = Object.freeze([
  // Bar 0: Dm driving 8ths
  N.D2, 0, N.D3, 0, N.D2, 0, N.F2, 0, N.D2, 0, N.A2, 0, N.D3, 0, N.C3, 0,
  // Bar 1: Bb
  N.Bb2, 0, N.Bb2, 0, N.F2, 0, N.Bb2, 0, N.Bb2, 0, N.D3, 0, N.C3, 0, N.Bb2, 0,
  // Bar 2: Gm
  N.G2, 0, N.G2, 0, N.Bb2, 0, N.D3, 0, N.G2, 0, N.Bb2, 0, N.D3, 0, N.Bb2, 0,
  // Bar 3: A7 urgency
  N.A2, 0, N.A2, 0, N.Cs3, 0, N.E3, 0, N.A2, 0, N.G2, 0, N.F2, 0, N.E2, 0,
]);

const BOSS_MELODY = Object.freeze([
  // Bar 0 (Dm)
  [N.D5, 2, 1.0], 0, [N.D5, 1, 0.82], 0, [N.F5, 2, 0.96], 0, [N.A5, 2, 1.0], 0,
  [N.Bb5, 2, 1.0], 0, [N.A5, 2, 0.92], 0, [N.G5, 2, 0.9], [N.F5, 2, 0.88],
  // Bar 1 (Bb)
  [N.D6, 3, 1.0], 0, 0, [N.C6, 1, 0.85], [N.Bb5, 2, 0.96], 0, [N.A5, 2, 0.92], 0,
  [N.F5, 2, 0.9], 0, [N.Bb5, 2, 0.96], 0, [N.A5, 3, 0.9], 0, 0, 0,
  // Bar 2 (Gm)
  [N.G5, 2, 0.96], 0, [N.Bb5, 2, 0.96], 0, [N.D6, 3, 1.0], 0, 0, [N.C6, 1, 0.85],
  [N.Bb5, 2, 0.95], 0, [N.G5, 2, 0.9], 0, [N.D5, 2, 0.88], 0, [N.G5, 2, 0.92],
  // Bar 3 (A7)
  [N.A5, 2, 1.0], 0, [N.E5, 2, 0.88], 0, [N.G5, 2, 0.92], 0, [N.F5, 2, 0.9], 0,
  [N.E5, 2, 0.92], 0, [N.Cs5, 2, 0.9], 0, [N.E5, 2, 0.94], 0, [N.A5, 2, 0.98],
]);

function mix(n) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pitchFor(desc) {
  if (desc.behavior === 'hybrid') {
    return 260 + (hashString(desc.element || 'hybrid') % 540);
  }
  return PITCH[desc.behavior] || PITCH.neutral;
}

function wobble(freq, time) {
  const n = mix((Math.round((time || 0) * 1000) ^ Math.round(freq) ^ 0x9e37) >>> 0) / 4294967296;
  return freq * (1 + (n - 0.5) * 0.065);
}

function clampFreq(value) {
  if (!Number.isFinite(value)) return 440;
  return Math.max(36, Math.min(4800, value));
}

function reducedFlag(value, depth = 0) {
  if (value === true || value === false) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return null;
  if (typeof value.reducedMotion === 'boolean') return value.reducedMotion;
  const settings = value.settings;
  if (settings && typeof settings === 'object' && typeof settings.reducedMotion === 'boolean') return settings.reducedMotion;
  if (depth < 2 && value.profile && typeof value.profile === 'object') {
    const nested = reducedFlag(value.profile, depth + 1);
    if (nested != null) return nested;
  }
  if (depth < 2 && value.profileSnapshot && typeof value.profileSnapshot === 'object') {
    const nested = reducedFlag(value.profileSnapshot, depth + 1);
    if (nested != null) return nested;
  }
  return null;
}

function listSaysReduced(list) {
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (reducedFlag(list[i]) === true) return true;
    }
    return false;
  }
  return reducedFlag(list) === true;
}

function makeNoiseBuffers(context) {
  const rate = context.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * 0.35));

  const white = context.createBuffer(1, length, rate);
  const wData = white.getChannelData(0);
  let seed = 0x12345678;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    wData[i] = ((seed >>> 8) / 16777215) * 2 - 1;
  }

  // Paul Kellet pink noise (warm 1/f spectrum — much smoother for explosions & wind)
  const pink = context.createBuffer(1, length, rate);
  const pData = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = wData[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    pData[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.14));
    b6 = w * 0.115926;
  }

  // Sparse bright crackle impulses for sparks, embers, and ice shatter
  const crackle = context.createBuffer(1, length, rate);
  const cData = crackle.getChannelData(0);
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const r = (seed >>> 8) / 16777215;
    cData[i] = r > 0.94 ? ((r - 0.94) / 0.06) * (i % 2 === 0 ? 1 : -1) : wData[i] * 0.12;
  }

  return { white, pink, crackle };
}

function createAudio(options) {
  let enabled = false;
  let alive = true;
  let context = null;
  let master = null;
  let sfxBus = null;
  let bgmBus = null;
  let bgmFilter = null;
  let reverbSend = null;
  let noiseBuffers = null;

  const voices = [];
  const lastAt = new Map();
  let shotStamp = -1;
  let shotRun = 0;
  let killStamp = -1;
  let killNoteIdx = 0;
  let profileReduced = false;
  let soften = false;

  // Adaptive BGM state (starts 'silent' until explicitly set by boot.js)
  let musicMode = 'silent';
  let bgmTimer = null;
  let bgmStep = 0;
  let bgmNextTime = 0;

  const initialReduced = reducedFlag(options);
  if (initialReduced != null) profileReduced = initialReduced;

  function desiredGain() {
    return enabled && context && context.state === 'running' ? MASTER : 0;
  }

  function rampParam(param, target, duration = 0.03) {
    if (!param || !context) return;
    try {
      const now = context.currentTime;
      if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
      if (typeof param.setValueAtTime === 'function' && typeof param.linearRampToValueAtTime === 'function') {
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(target, now + duration);
      } else {
        param.value = target;
      }
    } catch {
      try { param.value = target; } catch { /* ignore a closed context */ }
    }
  }

  function applyGain() {
    if (!master || !context) return;
    rampParam(master.gain, desiredGain(), 0.03);
    applyBgmMix();
  }

  function applyBgmMix() {
    if (!bgmBus || !context) return;
    const active = enabled && context.state === 'running' && musicMode !== 'silent';
    const reduceMul = profileReduced ? 0.72 : 1;
    let targetGain = 0;
    let targetCutoff = 5400;
    if (active) {
      if (musicMode === 'menu') {
        targetGain = 0.56 * reduceMul;
        targetCutoff = 4400;
      } else if (musicMode === 'battle') {
        targetGain = 0.62 * reduceMul;
        targetCutoff = 5600;
      } else if (musicMode === 'boss') {
        targetGain = 0.68 * reduceMul;
        targetCutoff = 6200;
      } else if (musicMode === 'draft') {
        targetGain = 0.26 * reduceMul;
        targetCutoff = 840;
      }
    }
    rampParam(bgmBus.gain, targetGain, active ? 0.18 : 0.06);
    if (bgmFilter && bgmFilter.frequency) {
      rampParam(bgmFilter.frequency, targetCutoff, 0.2);
    }
  }

  function ensureGraph() {
    if (!alive) return null;
    if (context) return context;
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioCtx !== 'function') return null;
    try {
      try { context = new AudioCtx({ latencyHint: 'interactive' }); }
      catch { context = new AudioCtx(); }
    } catch {
      context = null;
      return null;
    }
    try {
      // CRITICAL: master MUST be the very first GainNode (context.gains[0])!
      master = context.createGain();
      master.gain.value = 0;
      try {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -13;
        compressor.knee.value = 16;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.14;
        master.connect(compressor);
        compressor.connect(context.destination);
      } catch {
        master.connect(context.destination);
      }

      // SFX bus with gentle high-end warmth rolloff
      sfxBus = context.createGain();
      sfxBus.gain.value = 0.96;
      try {
        const sfxTone = context.createBiquadFilter();
        sfxTone.type = 'lowpass';
        sfxTone.frequency.value = 9800;
        sfxTone.Q.value = 0.5;
        sfxBus.connect(sfxTone);
        sfxTone.connect(master);
      } catch {
        sfxBus.connect(master);
      }

      // BGM bus with adaptive lowpass filter (ducks smoothly in Draft)
      bgmBus = context.createGain();
      bgmBus.gain.value = 0;
      try {
        bgmFilter = context.createBiquadFilter();
        bgmFilter.type = 'lowpass';
        bgmFilter.frequency.value = 5400;
        bgmFilter.Q.value = 0.65;
        bgmBus.connect(bgmFilter);
        bgmFilter.connect(master);
      } catch {
        bgmFilter = null;
        bgmBus.connect(master);
      }

      // Subtle studio slapback room ambience (safely guarded for minimal mock contexts)
      reverbSend = null;
      if (typeof context.createDelay === 'function') {
        try {
          const send = context.createGain();
          send.gain.value = 0.18;
          const d1 = context.createDelay(0.5);
          d1.delayTime.value = 0.072;
          const d2 = context.createDelay(0.5);
          d2.delayTime.value = 0.128;
          const fb = context.createGain();
          fb.gain.value = 0.24;
          const damp = context.createBiquadFilter();
          damp.type = 'lowpass';
          damp.frequency.value = 2300;
          const wetReturn = context.createGain();
          wetReturn.gain.value = 0.55;

          send.connect(d1);
          d1.connect(damp);
          damp.connect(d2);
          d2.connect(fb);
          fb.connect(d1);
          damp.connect(wetReturn);
          d2.connect(wetReturn);
          wetReturn.connect(master);
          reverbSend = send;
        } catch {
          reverbSend = null;
        }
      }

      noiseBuffers = makeNoiseBuffers(context);
    } catch {
      try { context.close(); } catch { /* ignore */ }
      context = null;
      master = null;
      sfxBus = null;
      bgmBus = null;
      bgmFilter = null;
      reverbSend = null;
      noiseBuffers = null;
      return null;
    }
    return context;
  }

  function primeSilence() {
    if (!context || context.state !== 'running' || !master) return;
    try {
      const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start();
      source.onended = () => { try { source.disconnect(); } catch { /* ignore */ } };
    } catch { /* gesture unlock still counts if the buffer blip fails */ }
  }

  function unlock() {
    if (!alive) return Promise.resolve(false);
    try {
      const ctx = ensureGraph();
      if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
      if (ctx.state === 'running') {
        primeSilence();
        applyGain();
        syncBgmScheduler();
        return Promise.resolve(true);
      }
      let pending;
      try { pending = ctx.resume(); }
      catch { return Promise.resolve(false); }
      return Promise.resolve(pending).then(() => {
        if (!alive || !context) return false;
        primeSilence();
        applyGain();
        syncBgmScheduler();
        return context.state === 'running';
      }, () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function setEnabled(value) {
    if (!alive) return;
    enabled = value === true;
    applyGain();
    syncBgmScheduler();
  }

  function setMusicMode(mode) {
    if (!alive) return;
    const next = BGM_MODES.has(mode) ? mode : 'silent';
    if (next === musicMode) return;
    const prev = musicMode;
    musicMode = next;
    // Reset musical phrase on fresh entrance from silence or into/out of Boss
    if (prev === 'silent' || next === 'boss' || prev === 'boss') {
      bgmStep = 0;
      bgmNextTime = 0;
    }
    applyBgmMix();
    syncBgmScheduler();
  }

  function getMusicMode() {
    return musicMode;
  }

  // -------------------------------------------------------------------------
  // SFX Voice Primitives (warm, filtered, never piercing)
  // -------------------------------------------------------------------------

  function reap(now) {
    let write = 0;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i] > now) voices[write++] = voices[i];
    }
    voices.length = write;
  }

  function takeVoice(start, duration) {
    reap(context.currentTime);
    if (voices.length >= MAX_SFX_VOICES) return false;
    voices.push(start + duration + 0.04);
    return true;
  }

  function release(nodes) {
    return () => {
      for (let i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch { /* already stopped */ }
      }
    };
  }

  function cueLength(dur, cap) {
    if (!soften) return Math.max(0.025, Math.min(cap, dur));
    return Math.max(REDUCED_FLOOR, Math.min(cap * REDUCED_TIME, dur * REDUCED_TIME));
  }

  function cueGain(gain) {
    return Math.max(0.0001, soften ? gain * REDUCED_GAIN : gain);
  }

  function connectOut(node, targetBus, wet = 0, cleanup) {
    node.connect(targetBus);
    if (wet > 0 && reverbSend && context) {
      try {
        const sendGain = context.createGain();
        sendGain.gain.value = Math.min(0.8, wet);
        node.connect(sendGain);
        sendGain.connect(reverbSend);
        cleanup.push(sendGain);
      } catch { /* ignore on minimal mock */ }
    }
  }

  function tone({
    freq,
    dur,
    type = 'triangle',
    gain = 0.2,
    slide = 0,
    delay = 0,
    attack = 0.004,
    lpf = 0,
    lpfEnd = 0,
    wet = 0,
  }) {
    if (!enabled || !context || !master) return false;
    const bus = sfxBus || master;
    const length = cueLength(dur, 0.72);
    const wait = Math.max(0, Math.min(0.65, delay));
    const start = context.currentTime + wait;
    const frequency = clampFreq(freq);
    if (!Number.isFinite(start) || !takeVoice(start, length)) return false;

    const osc = context.createOscillator();
    const amp = context.createGain();
    const cleanup = [osc, amp];

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    const destination = clampFreq(frequency + slide);
    if (Math.abs(destination - frequency) > 1) {
      osc.frequency.exponentialRampToValueAtTime(destination, start + length);
    }

    const peak = cueGain(gain);
    const atk = Math.max(0.002, Math.min(attack, length * 0.35));
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + atk);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);

    // IMPORTANT: connect osc -> amp FIRST so mock audio probes always inspect amp.gain directly.
    osc.connect(amp);

    if (lpf > 0) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.8;
      const fStart = Math.max(120, Math.min(12000, lpf));
      filter.frequency.setValueAtTime(fStart, start);
      if (lpfEnd > 0 && Math.abs(lpfEnd - fStart) > 20) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(120, Math.min(12000, lpfEnd)), start + length);
      }
      amp.connect(filter);
      connectOut(filter, bus, wet, cleanup);
      cleanup.push(filter);
    } else {
      connectOut(amp, bus, wet, cleanup);
    }

    osc.start(start);
    osc.stop(start + length + 0.025);
    osc.onended = release(cleanup);
    return true;
  }

  function noise({
    dur,
    gain,
    delay = 0,
    band = 900,
    bandEnd = 0,
    q = 0.8,
    filterType = 'bandpass',
    kind = 'white',
    attack = 0.003,
    wet = 0,
  }) {
    if (!enabled || !context || !master || !noiseBuffers) return false;
    const bus = sfxBus || master;
    const length = cueLength(dur, 0.55);
    const wait = Math.max(0, Math.min(0.6, delay));
    const start = context.currentTime + wait;
    if (!Number.isFinite(start) || !takeVoice(start, length)) return false;

    const source = context.createBufferSource();
    source.buffer = noiseBuffers[kind] || noiseBuffers.white;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = filterType;
    const fStart = Math.max(80, Math.min(8000, band));
    filter.frequency.setValueAtTime(fStart, start);
    if (bandEnd > 0 && Math.abs(bandEnd - fStart) > 20) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, Math.min(8000, bandEnd)), start + length);
    }
    filter.Q.value = Math.max(0.25, q);

    const amp = context.createGain();
    const peak = cueGain(gain);
    const atk = Math.max(0.0015, Math.min(attack, length * 0.3));
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + atk);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);

    const cleanup = [source, filter, amp];
    source.connect(filter);
    filter.connect(amp);
    connectOut(amp, bus, wet, cleanup);

    source.start(start);
    source.stop(start + length + 0.025);
    source.onended = release(cleanup);
    return true;
  }

  function safe(start) {
    try { return start(); }
    catch { return false; }
  }

  function layers(...results) {
    let played = false;
    for (let i = 0; i < results.length; i++) if (results[i]) played = true;
    return played;
  }

  function shotRepeatStep() {
    let now = 0;
    try {
      if (context && Number.isFinite(context.currentTime)) now = context.currentTime;
    } catch { now = 0; }
    const elapsed = shotStamp < 0 ? Infinity : now - shotStamp;
    if (!(elapsed >= 0) || elapsed > SHOT_REPEAT_WINDOW) shotRun = 0;
    else shotRun += 1;
    shotStamp = now;
    return SHOT_REPEAT_STEPS[Math.min(shotRun, SHOT_REPEAT_STEPS.length - 1)];
  }

  // -------------------------------------------------------------------------
  // Redesigned Tactile & Cinematic SFX Palette
  // -------------------------------------------------------------------------

  function playShot(desc, delay) {
    const freq = wobble(pitchFor(desc), desc.time);
    const behavior = desc.behavior;
    const bed = SHOT_BED * shotRepeatStep();
    const g = (gain) => gain * bed;
    return safe(() => {
      if (behavior === 'fire') {
        return layers(
          noise({ dur: 0.1, gain: g(0.2), band: 580, bandEnd: 240, filterType: 'lowpass', kind: 'pink', delay }),
          tone({ freq: 185, dur: 0.085, type: 'sawtooth', gain: g(0.12), slide: -85, lpf: 780, lpfEnd: 320, delay }),
        );
      }
      if (behavior === 'frost') {
        return layers(
          tone({ freq: N.A5, dur: 0.08, type: 'sine', gain: g(0.18), slide: 295, wet: 0.25, delay }),
          tone({ freq: N.D6, dur: 0.055, type: 'triangle', gain: g(0.11), wet: 0.28, delay: delay + 0.018 }),
        );
      }
      if (behavior === 'lightning') {
        return layers(
          noise({ dur: 0.05, gain: g(0.19), band: 2600, bandEnd: 1100, q: 1.1, kind: 'crackle', delay }),
          tone({ freq: N.D6, dur: 0.05, type: 'triangle', gain: g(0.14), slide: -720, lpf: 2600, delay }),
        );
      }
      if (behavior === 'poison') {
        return layers(
          tone({ freq: 210, dur: 0.09, type: 'sine', gain: g(0.18), slide: 95, delay }),
          noise({ dur: 0.075, gain: g(0.12), band: 380, q: 1.1, kind: 'pink', delay }),
        );
      }
      if (behavior === 'support') {
        return layers(
          tone({ freq: N.D5, dur: 0.06, type: 'sine', gain: g(0.17), slide: 110, wet: 0.2, delay }),
          tone({ freq: N.A5, dur: 0.065, type: 'triangle', gain: g(0.11), wet: 0.22, delay: delay + 0.018 }),
        );
      }
      if (behavior === 'hero') {
        // Modern punchy tactical carbine: tight low kick + warm breech snap + crisp mechanical crack
        return layers(
          tone({ freq: wobble(168, desc.time), dur: 0.048, type: 'sine', gain: g(0.22), slide: -108, attack: 0.002, delay }),
          noise({ dur: 0.036, gain: g(0.16), band: 1750, bandEnd: 740, q: 1.05, kind: 'pink', attack: 0.0015, delay }),
          tone({ freq: clampFreq(freq * 1.05), dur: 0.038, type: 'triangle', gain: g(0.11), slide: -170, lpf: 1250, lpfEnd: 460, attack: 0.002, delay }),
        );
      }
      return layers(
        tone({ freq, dur: 0.048, type: 'triangle', gain: g(0.18), slide: -135, lpf: 1400, delay }),
        noise({ dur: 0.032, gain: g(0.12), band: behavior === 'brittle' ? 760 : 1550, q: 1.2, kind: 'pink', delay }),
      );
    });
  }

  function playHit(desc, delay) {
    const tint = Math.min(250, Math.max(115, pitchFor(desc) * 0.45));
    const body = wobble(tint, (desc.time || 0) + 0.17);
    if (desc.reaction === 'steam') {
      safe(() => layers(
        noise({ dur: 0.1, gain: 0.17, band: 2800, bandEnd: 1500, q: 1.2, kind: 'white', wet: 0.2, delay }),
        tone({ freq: N.A5, dur: 0.07, type: 'sine', gain: 0.15, slide: 295, wet: 0.28, delay }),
      ));
    } else if (desc.reaction === 'catalyst') {
      safe(() => layers(
        tone({ freq: N.G5, dur: 0.065, type: 'triangle', gain: 0.16, slide: 390, wet: 0.28, delay }),
        noise({ dur: 0.05, gain: 0.14, band: 2100, q: 1.1, kind: 'crackle', delay: delay + 0.01 }),
      ));
    }
    if (desc.crit) {
      // Sparkling golden crystal bell double-chime (D6 + A6) — crisp & joyful, zero square harshness
      return safe(() => layers(
        tone({ freq: N.D6, dur: 0.095, type: 'triangle', gain: 0.23, attack: 0.002, wet: 0.34, delay }),
        tone({ freq: N.A6, dur: 0.115, type: 'sine', gain: 0.17, attack: 0.002, wet: 0.4, delay: delay + 0.016 }),
      ));
    }
    return safe(() => layers(
      tone({ freq: body, dur: 0.038, type: 'sine', gain: 0.19, slide: -90, attack: 0.002, delay }),
      noise({ dur: 0.028, gain: 0.15, band: 1120, bandEnd: 460, filterType: 'lowpass', kind: 'pink', attack: 0.002, delay }),
    ));
  }

  function playKill(desc, delay) {
    let now = 0;
    try { if (context && Number.isFinite(context.currentTime)) now = context.currentTime; } catch { now = 0; }
    if (killStamp < 0 || now - killStamp > 1.6) killNoteIdx = 0;
    const sparkle = KILL_SPARKLE[killNoteIdx % KILL_SPARKLE.length];
    killNoteIdx += 1;
    killStamp = now;

    // Juicy arcade pop + soft crunch + harmonizing pentatonic XP sparkle!
    return safe(() => layers(
      tone({ freq: wobble(265, desc.time), dur: 0.046, type: 'sine', gain: 0.2, slide: 310, attack: 0.002, delay }),
      noise({ dur: 0.068, gain: 0.17, band: 920, bandEnd: 380, q: 0.7, kind: 'pink', delay }),
      tone({ freq: sparkle, dur: 0.1, type: 'sine', gain: 0.115, attack: 0.003, wet: 0.35, delay: delay + 0.022 }),
    ));
  }

  function playFence(desc, delay) {
    const extra = desc.damage != null && desc.damage > 0 ? Math.min(0.03, desc.damage / 500) : 0;
    const failing = desc.ratio != null && desc.ratio <= 0.3;
    const freq = failing ? 118 : 78;
    return safe(() => layers(
      tone({ freq, dur: 0.12, type: 'sine', gain: 0.32 + extra, slide: failing ? -36 : -26, attack: 0.002, delay }),
      noise({ dur: 0.075, gain: 0.25, band: failing ? 420 : 280, bandEnd: 140, filterType: 'lowpass', kind: 'pink', delay }),
      tone({ freq: failing ? N.F4 : 165, dur: 0.065, type: 'triangle', gain: failing ? 0.17 : 0.12, slide: -45, lpf: 920, delay }),
    ));
  }

  function playMerge(desc, delay) {
    const rank = Math.max(1, Math.min(8, Number(desc.rank) || 1));
    return safe(() => layers(
      tone({ freq: N.D5, dur: 0.11, type: 'triangle', gain: 0.22, slide: 290, wet: 0.28, delay }),
      tone({ freq: clampFreq(N.A5 + rank * 36), dur: 0.14, type: 'sine', gain: 0.2, wet: 0.35, delay: delay + 0.07 }),
    ));
  }

  function playDraft(delay) {
    // Uplifting 4-note golden level-up arpeggio (Dm -> bright D6 shimmer!)
    return safe(() => layers(
      tone({ freq: N.D5, dur: 0.11, type: 'triangle', gain: 0.22, attack: 0.003, wet: 0.34, delay }),
      tone({ freq: N.F5, dur: 0.12, type: 'triangle', gain: 0.21, attack: 0.003, wet: 0.36, delay: delay + 0.055 }),
      tone({ freq: N.A5, dur: 0.14, type: 'triangle', gain: 0.22, attack: 0.003, wet: 0.38, delay: delay + 0.11 }),
      tone({ freq: N.D6, dur: 0.24, type: 'sine', gain: 0.24, attack: 0.003, wet: 0.48, delay: delay + 0.165 }),
    ));
  }

  function playVictory() {
    // Triumphant heroic major fanfare (D5 -> F#5 -> A5 -> D6 with lush sustaining chord)
    return safe(() => layers(
      tone({ freq: N.D5, dur: 0.11, type: 'triangle', gain: 0.22, lpf: 2600, wet: 0.3, delay: 0 }),
      tone({ freq: N.Fs5, dur: 0.11, type: 'triangle', gain: 0.23, lpf: 2800, wet: 0.32, delay: 0.085 }),
      tone({ freq: N.A5, dur: 0.12, type: 'triangle', gain: 0.24, lpf: 3000, wet: 0.35, delay: 0.17 }),
      tone({ freq: N.D6, dur: 0.42, type: 'triangle', gain: 0.28, lpf: 3400, wet: 0.48, delay: 0.26 }),
      tone({ freq: N.D4, dur: 0.44, type: 'sine', gain: 0.2, wet: 0.32, delay: 0.26 }),
      tone({ freq: N.A4, dur: 0.42, type: 'sine', gain: 0.15, wet: 0.35, delay: 0.26 }),
      tone({ freq: N.Fs5, dur: 0.38, type: 'sine', gain: 0.14, wet: 0.42, delay: 0.27 }),
    ));
  }

  function playDefeat() {
    // Warm melancholic descending minor cadence (D4 -> C4 -> Bb3 -> A3)
    return safe(() => layers(
      tone({ freq: N.D4, dur: 0.2, type: 'triangle', gain: 0.23, lpf: 1200, wet: 0.32, delay: 0 }),
      tone({ freq: N.C4, dur: 0.2, type: 'triangle', gain: 0.22, lpf: 1050, wet: 0.32, delay: 0.15 }),
      tone({ freq: N.Bb3, dur: 0.22, type: 'triangle', gain: 0.22, lpf: 920, wet: 0.35, delay: 0.3 }),
      tone({ freq: N.A3, dur: 0.42, type: 'sine', gain: 0.26, slide: -24, wet: 0.4, delay: 0.45 }),
    ));
  }

  function playUi(desc, delay) {
    const error = desc.cue === 'error';
    if (error) {
      return safe(() => layers(
        tone({ freq: 215, dur: 0.08, type: 'triangle', gain: 0.17, slide: -60, lpf: 620, delay }),
        tone({ freq: 155, dur: 0.085, type: 'sine', gain: 0.14, slide: -35, delay: delay + 0.055 }),
      ));
    }
    // Crisp tactile marimba-bubble click (warm, never a piercing square beep!)
    return safe(() => layers(
      tone({ freq: N.D5, dur: 0.038, type: 'sine', gain: 0.15, slide: 195, attack: 0.002, wet: 0.18, delay }),
      tone({ freq: N.D6, dur: 0.024, type: 'triangle', gain: 0.06, attack: 0.002, delay }),
    ));
  }

  function playStatus(desc, delay) {
    const behavior = desc.behavior;
    return safe(() => {
      if (behavior === 'fire') return noise({ dur: 0.065, gain: 0.16, band: 640, bandEnd: 320, filterType: 'lowpass', kind: 'pink', delay });
      if (behavior === 'frost') return tone({ freq: N.D6, dur: 0.055, type: 'sine', gain: 0.15, wet: 0.3, delay });
      if (behavior === 'poison') return tone({ freq: 195, dur: 0.075, type: 'sine', gain: 0.15, slide: 60, delay });
      if (behavior === 'lightning') return noise({ dur: 0.045, gain: 0.16, band: 2200, q: 1.1, kind: 'crackle', delay });
      return tone({ freq: N.G5, dur: 0.05, type: 'sine', gain: 0.14, wet: 0.2, delay });
    });
  }

  function playBoss(desc, delay) {
    if (desc && desc.approach === true) {
      // Exact two-tone rising approach alert (220 Hz -> 330 Hz, pure sine, no noise)
      return safe(() => layers(
        tone({ freq: 220, dur: 0.08, type: 'sine', gain: 0.26, delay }),
        tone({ freq: 330, dur: 0.08, type: 'sine', gain: 0.26, delay: delay + 0.09 }),
      ));
    }
    // Ominous cinematic boss entrance / enrage rumble (preserves 110 Hz osc + noise, no 220 Hz)
    return safe(() => layers(
      tone({ freq: 110, dur: 0.28, type: 'triangle', gain: 0.3, slide: -28, lpf: 540, wet: 0.28, delay }),
      tone({ freq: 164.81, dur: 0.22, type: 'sawtooth', gain: 0.16, slide: -18, lpf: 680, wet: 0.3, delay: delay + 0.06 }),
      noise({ dur: 0.22, gain: 0.24, band: 220, bandEnd: 95, filterType: 'lowpass', kind: 'pink', delay }),
    ));
  }

  function playFenceSurge(delay) {
    // Epic shockwave drop + triumphant energy chord
    return safe(() => layers(
      tone({ freq: 120, dur: 0.26, type: 'sine', gain: 0.3, slide: -72, attack: 0.003, delay }),
      noise({ dur: 0.24, gain: 0.24, band: 1200, bandEnd: 280, filterType: 'lowpass', kind: 'pink', wet: 0.25, delay }),
      tone({ freq: N.D5, dur: 0.2, type: 'triangle', gain: 0.19, slide: 290, wet: 0.35, delay: delay + 0.03 }),
      tone({ freq: N.A5, dur: 0.24, type: 'sine', gain: 0.18, slide: 295, wet: 0.42, delay: delay + 0.07 }),
    ));
  }

  function playCorpseExplode(delay) {
    return safe(() => layers(
      tone({ freq: 145, dur: 0.14, type: 'sine', gain: 0.24, slide: -95, attack: 0.002, delay }),
      noise({ dur: 0.14, gain: 0.22, band: 720, bandEnd: 220, filterType: 'lowpass', kind: 'pink', delay }),
    ));
  }

  function playWaveHorde(delay) {
    // Dramatic war-horn fifth + low war drum
    return safe(() => layers(
      tone({ freq: 96, dur: 0.16, type: 'sine', gain: 0.24, slide: -48, attack: 0.003, delay }),
      tone({ freq: N.D3, dur: 0.22, type: 'sawtooth', gain: 0.18, slide: 18, attack: 0.025, lpf: 760, wet: 0.35, delay }),
      tone({ freq: N.A3, dur: 0.28, type: 'triangle', gain: 0.2, slide: -14, attack: 0.022, lpf: 920, wet: 0.38, delay: delay + 0.12 }),
    ));
  }

  function playDraftReroll(delay) {
    return safe(() => layers(
      noise({ dur: 0.07, gain: 0.13, band: 1100, bandEnd: 2400, q: 1.0, kind: 'pink', delay }),
      tone({ freq: N.G5, dur: 0.055, type: 'triangle', gain: 0.16, slide: 120, wet: 0.24, delay }),
      tone({ freq: N.C6, dur: 0.075, type: 'sine', gain: 0.17, wet: 0.3, delay: delay + 0.045 }),
    ));
  }

  function playTargetingChange(delay) {
    return safe(() => layers(
      tone({ freq: N.A5, dur: 0.032, type: 'sine', gain: 0.12, attack: 0.002, delay }),
      tone({ freq: N.D6, dur: 0.04, type: 'triangle', gain: 0.13, attack: 0.002, wet: 0.2, delay: delay + 0.028 }),
    ));
  }

  function playNapalmBlast(delay) {
    // Deep sub bomb + roaring fireball sweep + crackling embers
    return safe(() => layers(
      tone({ freq: 126, dur: 0.28, type: 'sine', gain: 0.29, slide: -88, attack: 0.002, wet: 0.18, delay }),
      noise({ dur: 0.34, gain: 0.27, band: 1400, bandEnd: 240, filterType: 'lowpass', kind: 'pink', wet: 0.24, delay }),
      noise({ dur: 0.2, gain: 0.15, band: 2500, bandEnd: 1400, q: 1.1, kind: 'crackle', delay: delay + 0.05 }),
    ));
  }

  function playArmoredCar(delay) {
    // Deep V8 diesel engine growl + heroic dual-tone truck brass horn + rumble
    return safe(() => layers(
      tone({ freq: 68, dur: 0.28, type: 'sawtooth', gain: 0.22, slide: 54, lpf: 380, lpfEnd: 880, delay }),
      tone({ freq: N.D4, dur: 0.19, type: 'sawtooth', gain: 0.14, lpf: 1250, attack: 0.014, wet: 0.24, delay: delay + 0.04 }),
      tone({ freq: N.F4, dur: 0.19, type: 'sawtooth', gain: 0.12, lpf: 1250, attack: 0.014, wet: 0.24, delay: delay + 0.04 }),
      noise({ dur: 0.24, gain: 0.17, band: 360, bandEnd: 180, filterType: 'lowpass', kind: 'pink', delay }),
    ));
  }

  function playCryoBarrage(delay) {
    // Shimmering glacial wind + 3-note crystal icicle cascade
    return safe(() => layers(
      noise({ dur: 0.2, gain: 0.16, band: 1500, bandEnd: 3200, q: 1.3, kind: 'white', wet: 0.28, delay }),
      tone({ freq: N.A5, dur: 0.13, type: 'sine', gain: 0.19, attack: 0.003, wet: 0.4, delay }),
      tone({ freq: N.D6, dur: 0.14, type: 'triangle', gain: 0.17, attack: 0.003, wet: 0.42, delay: delay + 0.036 }),
      tone({ freq: N.F6, dur: 0.16, type: 'sine', gain: 0.15, attack: 0.003, wet: 0.45, delay: delay + 0.072 }),
    ));
  }

  function playOrbitalBeam(delay) {
    // Plasma lock-on shimmer + resonant sub laser beam + high-energy hum
    return safe(() => layers(
      tone({ freq: N.A4, dur: 0.1, type: 'sine', gain: 0.15, slide: 880, wet: 0.28, delay }),
      tone({ freq: N.D3, dur: 0.34, type: 'sawtooth', gain: 0.23, slide: -72, lpf: 980, lpfEnd: 320, wet: 0.25, delay: delay + 0.035 }),
      tone({ freq: N.D5, dur: 0.26, type: 'triangle', gain: 0.16, slide: -290, lpf: 2100, wet: 0.32, delay: delay + 0.035 }),
      noise({ dur: 0.22, gain: 0.15, band: 2400, bandEnd: 920, q: 1.1, kind: 'white', delay: delay + 0.03 }),
    ));
  }

  function playEmStrike(delay) {
    // Thunder bass snap + crisp electric whip crackle + filtered arc drop
    return safe(() => layers(
      tone({ freq: 185, dur: 0.13, type: 'sine', gain: 0.23, slide: -130, attack: 0.002, delay }),
      noise({ dur: 0.11, gain: 0.21, band: 2900, bandEnd: 1100, q: 1.0, kind: 'crackle', wet: 0.22, delay }),
      tone({ freq: 1480, dur: 0.095, type: 'triangle', gain: 0.15, slide: -1020, lpf: 2400, delay }),
    ));
  }

  function playWallImmune(delay) {
    // Radiant protective shield deflect chord
    return safe(() => layers(
      tone({ freq: N.D5, dur: 0.14, type: 'sine', gain: 0.2, wet: 0.35, delay }),
      tone({ freq: N.A5, dur: 0.16, type: 'triangle', gain: 0.17, wet: 0.4, delay: delay + 0.03 }),
      tone({ freq: N.D6, dur: 0.18, type: 'sine', gain: 0.14, wet: 0.44, delay: delay + 0.06 }),
    ));
  }

  function playBulletSplit(delay) {
    return safe(() => tone({ freq: N.C6, dur: 0.042, type: 'sine', gain: 0.11, slide: 420, attack: 0.002, wet: 0.24, delay }));
  }

  function playCryoShatter(delay) {
    return safe(() => layers(
      tone({ freq: N.F6, dur: 0.09, type: 'sine', gain: 0.16, attack: 0.002, wet: 0.4, delay }),
      tone({ freq: N.A6, dur: 0.08, type: 'triangle', gain: 0.12, attack: 0.002, wet: 0.42, delay: delay + 0.02 }),
      noise({ dur: 0.08, gain: 0.15, band: 3200, q: 1.1, filterType: 'highpass', kind: 'crackle', delay }),
    ));
  }

  function playLeap(delay) {
    return safe(() => tone({ freq: 440, dur: 0.048, type: 'triangle', gain: 0.15, slide: 240, lpf: 1600, delay }));
  }

  function playSplit(delay) {
    return safe(() => tone({ freq: 680, dur: 0.038, type: 'triangle', gain: 0.14, slide: -210, lpf: 1500, delay }));
  }

  function playMend(delay) {
    return safe(() => tone({ freq: N.G4, dur: 0.06, type: 'sine', gain: 0.14, slide: 160, wet: 0.22, delay }));
  }

  function playPhase(desc, delay) {
    return safe(() => {
      const faded = !!desc && desc.phased === true;
      return tone({
        freq: faded ? N.A5 : N.F5,
        dur: 0.038,
        type: 'sine',
        gain: 0.12,
        slide: faded ? -150 : 90,
        wet: 0.2,
        delay,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Adaptive Procedural BGM Synthesizer & Lookahead Scheduler
  // -------------------------------------------------------------------------

  function bgmMarimba(freq, when, dur, vel = 0.8, bright = 1) {
    if (!context || !bgmBus) return;
    const osc = context.createOscillator();
    const click = context.createOscillator();
    const amp = context.createGain();
    const clickAmp = context.createGain();
    const filt = context.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    click.type = 'sine';
    click.frequency.setValueAtTime(Math.min(4800, freq * 3), when);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(4200, freq * (2.8 * bright)), when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(480, freq * 1.35), when + dur);
    filt.Q.value = 0.7;

    const peak = Math.max(0.001, 0.22 * vel);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    clickAmp.gain.setValueAtTime(0.0001, when);
    clickAmp.gain.exponentialRampToValueAtTime(peak * 0.28, when + 0.002);
    clickAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.022);

    const cleanup = [osc, click, amp, clickAmp, filt];
    osc.connect(amp);
    click.connect(clickAmp);
    amp.connect(filt);
    clickAmp.connect(filt);
    connectOut(filt, bgmBus, 0.26, cleanup);

    osc.start(when);
    click.start(when);
    osc.stop(when + dur + 0.025);
    click.stop(when + 0.03);
    osc.onended = release(cleanup);
  }

  function bgmBrassLead(freq, when, dur, vel = 0.85) {
    if (!context || !bgmBus) return;
    const osc = context.createOscillator();
    const amp = context.createGain();
    const filt = context.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    filt.type = 'lowpass';
    filt.Q.value = 1.3;
    filt.frequency.setValueAtTime(Math.min(2800, freq * 3.2), when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(460, freq * 1.4), when + dur);

    const peak = Math.max(0.001, 0.14 * vel);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const cleanup = [osc, amp, filt];
    osc.connect(amp);
    amp.connect(filt);
    connectOut(filt, bgmBus, 0.22, cleanup);

    osc.start(when);
    osc.stop(when + dur + 0.025);
    osc.onended = release(cleanup);
  }

  function bgmBassNote(freq, when, dur, vel = 0.85, punchy = true) {
    if (!context || !bgmBus) return;
    const sub = context.createOscillator();
    const grit = context.createOscillator();
    const amp = context.createGain();
    const filt = context.createBiquadFilter();

    sub.type = 'triangle';
    sub.frequency.setValueAtTime(freq, when);
    grit.type = 'sawtooth';
    grit.frequency.setValueAtTime(freq, when);

    filt.type = 'lowpass';
    filt.Q.value = punchy ? 1.4 : 0.7;
    filt.frequency.setValueAtTime(punchy ? 560 : 380, when);
    filt.frequency.exponentialRampToValueAtTime(175, when + dur);

    const peak = Math.max(0.001, 0.27 * vel);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.007);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const gritGain = context.createGain();
    gritGain.gain.value = punchy ? 0.34 : 0.18;

    const cleanup = [sub, grit, gritGain, amp, filt];
    sub.connect(amp);
    grit.connect(gritGain);
    gritGain.connect(amp);
    amp.connect(filt);
    filt.connect(bgmBus);

    sub.start(when);
    grit.start(when);
    sub.stop(when + dur + 0.025);
    grit.stop(when + dur + 0.025);
    sub.onended = release(cleanup);
  }

  function bgmChordStab(notes, when, dur, vel = 0.5) {
    if (!context || !bgmBus || !notes) return;
    const filt = context.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1600, when);
    filt.frequency.exponentialRampToValueAtTime(720, when + dur);
    filt.Q.value = 0.6;

    const amp = context.createGain();
    const peak = Math.max(0.001, 0.095 * vel);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const cleanup = [amp, filt];
    let lastOsc = null;
    for (let i = 0; i < notes.length; i++) {
      const osc = context.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(notes[i], when);
      osc.connect(amp);
      osc.start(when);
      osc.stop(when + dur + 0.03);
      cleanup.push(osc);
      lastOsc = osc;
    }
    amp.connect(filt);
    connectOut(filt, bgmBus, 0.34, cleanup);
    if (lastOsc) lastOsc.onended = release(cleanup);
  }

  function bgmWarmPad(notes, when, dur, vel = 0.5) {
    if (!context || !bgmBus || !notes) return;
    const filt = context.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(920, when);
    filt.Q.value = 0.5;

    const amp = context.createGain();
    const peak = Math.max(0.001, 0.052 * vel);
    const atk = Math.min(0.18, dur * 0.25);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + atk);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const cleanup = [amp, filt];
    let lastOsc = null;
    for (let i = 0; i < notes.length; i++) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], when);
      osc.connect(amp);
      osc.start(when);
      osc.stop(when + dur + 0.04);
      cleanup.push(osc);
      lastOsc = osc;
    }
    amp.connect(filt);
    connectOut(filt, bgmBus, 0.38, cleanup);
    if (lastOsc) lastOsc.onended = release(cleanup);
  }

  function bgmKick(when, vel = 0.85) {
    if (!context || !bgmBus) return;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, when);
    osc.frequency.exponentialRampToValueAtTime(46, when + 0.095);
    const peak = Math.max(0.001, 0.34 * vel);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    osc.connect(amp);
    amp.connect(bgmBus);
    osc.start(when);
    osc.stop(when + 0.16);
    osc.onended = release([osc, amp]);
  }

  function bgmSnare(when, vel = 0.7, cozy = false) {
    if (!context || !bgmBus || !noiseBuffers) return;
    if (cozy) {
      // Warm woody rimshot click for Menu groove
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, when);
      osc.frequency.exponentialRampToValueAtTime(340, when + 0.025);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.11 * vel, when + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.036);
      osc.connect(amp);
      amp.connect(bgmBus);
      osc.start(when);
      osc.stop(when + 0.05);
      osc.onended = release([osc, amp]);
      return;
    }
    // Crisp layered snare: tuned body + bandpassed wire snap
    const src = context.createBufferSource();
    src.buffer = noiseBuffers.white;
    src.loop = true;
    const filt = context.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(2150, when);
    filt.Q.value = 0.9;
    const nAmp = context.createGain();
    nAmp.gain.setValueAtTime(0.0001, when);
    nAmp.gain.exponentialRampToValueAtTime(0.17 * vel, when + 0.003);
    nAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.095);
    src.connect(filt);
    filt.connect(nAmp);
    nAmp.connect(bgmBus);
    src.start(when);
    src.stop(when + 0.11);
    src.onended = release([src, filt, nAmp]);

    const body = context.createOscillator();
    const bAmp = context.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(205, when);
    body.frequency.exponentialRampToValueAtTime(112, when + 0.055);
    bAmp.gain.setValueAtTime(0.0001, when);
    bAmp.gain.exponentialRampToValueAtTime(0.15 * vel, when + 0.003);
    bAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    body.connect(bAmp);
    bAmp.connect(bgmBus);
    body.start(when);
    body.stop(when + 0.085);
    body.onended = release([body, bAmp]);
  }

  function bgmHat(when, vel = 0.5, open = false) {
    if (!context || !bgmBus || !noiseBuffers) return;
    const src = context.createBufferSource();
    src.buffer = noiseBuffers.white;
    src.loop = true;
    const filt = context.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(6600, when);
    const amp = context.createGain();
    const dur = open ? 0.095 : 0.028;
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.085 * vel, when + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt);
    filt.connect(amp);
    amp.connect(bgmBus);
    src.start(when);
    src.stop(when + dur + 0.02);
    src.onended = release([src, filt, amp]);
  }

  function bgmTempoFor(mode) {
    if (mode === 'menu') return 106;
    if (mode === 'boss') return 140;
    return 126; // battle & draft
  }

  function scheduleBgmStep(stepIndex, when, stepDur) {
    if (!enabled || !context || !bgmBus || musicMode === 'silent') return;
    const reduced = profileReduced;
    const mode = musicMode;
    const inBar = stepIndex % 16;

    if (mode === 'boss') {
      const idx = stepIndex % 64;
      const bar = Math.floor(idx / 16);
      const bass = BOSS_BASS[idx];
      if (bass) bgmBassNote(bass, when, stepDur * 1.75, 0.92, true);

      const mel = BOSS_MELODY[idx];
      if (mel) {
        const [f, len, v] = mel;
        bgmBrassLead(f, when, stepDur * len * 0.92, v * 0.9);
        bgmMarimba(f, when, stepDur * len * 0.85, v * 0.55, 1.15);
      }

      if (inBar === 0) {
        const chordBar = bar === 0 ? 0 : bar === 1 ? 1 : bar === 2 ? 6 : 7;
        bgmWarmPad(BAR_CHORDS[chordBar], when, stepDur * 14, 0.72);
      }
      if (inBar === 0 || inBar === 6 || inBar === 12) {
        const chordBar = bar === 0 ? 0 : bar === 1 ? 1 : bar === 2 ? 6 : 7;
        bgmChordStab(BAR_CHORDS[chordBar], when, stepDur * 2.2, 0.76);
      }

      if (!reduced) {
        if (inBar === 0 || inBar === 4 || inBar === 8 || inBar === 10 || inBar === 12) bgmKick(when, inBar === 10 ? 0.65 : 0.92);
        if (inBar === 4 || inBar === 12 || (bar === 3 && inBar === 14)) bgmSnare(when, 0.85, false);
        if (inBar % 2 === 0) bgmHat(when, inBar % 4 === 2 ? 0.65 : 0.36, inBar === 14);
      } else if (inBar === 0 || inBar === 8) {
        bgmKick(when, 0.55);
      }
      return;
    }

    // 8-bar (128-step) Form for Menu, Battle & Draft
    const idx = stepIndex % 128;
    const bar = Math.floor(idx / 16);
    const chord = BAR_CHORDS[bar];

    if (mode === 'menu') {
      const bass = BATTLE_BASS[idx];
      if (bass && (inBar === 0 || inBar === 6 || inBar === 8 || inBar === 12)) {
        bgmBassNote(bass, when, stepDur * 2.8, 0.78, false);
      }
      const mel = MENU_MELODY[idx];
      if (mel) {
        const [f, len, v] = mel;
        bgmMarimba(f, when, stepDur * (len + 0.65), v * 0.96, 0.98);
      }
      if (inBar === 0) {
        bgmWarmPad(chord, when, stepDur * 15, 0.85);
        bgmChordStab(chord, when, stepDur * 6.5, 0.72);
      } else if (inBar === 8) {
        bgmChordStab(chord, when, stepDur * 4.5, 0.58);
      }

      if (!reduced) {
        if (inBar === 0 || inBar === 10) bgmKick(when, 0.62);
        if (inBar === 4 || inBar === 12) bgmSnare(when, 0.75, true);
        if (inBar % 2 === 0) bgmHat(when, inBar % 4 === 2 ? 0.36 : 0.2, false);
      }
      return;
    }

    // Battle & Draft (Draft automatically gets smooth warm lowpass + lower bus gain!)
    const bass = BATTLE_BASS[idx];
    if (bass) bgmBassNote(bass, when, stepDur * 1.85, 0.9, true);

    const mel = BATTLE_MELODY[idx];
    if (mel) {
      const [f, len, v] = mel;
      bgmMarimba(f, when, stepDur * (len + 0.35), v * 0.96, 1.08);
      // B-section (bars 4-7) adds warm octave/harmonic sparkle on strong accents!
      if (bar >= 4 && inBar === 0) {
        bgmBrassLead(f * 0.5, when, stepDur * 3.2, 0.56);
      }
    }

    if (inBar === 0) {
      bgmWarmPad(chord, when, stepDur * 14, 0.65);
    }

    // Bouncy offbeat chords
    if (inBar === 2 || inBar === 6 || inBar === 10 || inBar === 14) {
      bgmChordStab(chord, when, stepDur * 1.8, inBar === 2 || inBar === 10 ? 0.74 : 0.58);
    }

    if (!reduced) {
      if (inBar === 0 || inBar === 6 || inBar === 8 || (bar % 2 === 1 && inBar === 14)) {
        bgmKick(when, inBar === 0 || inBar === 8 ? 0.9 : 0.65);
      }
      if (inBar === 4 || inBar === 12) bgmSnare(when, 0.78, false);
      if (inBar % 2 === 0) bgmHat(when, inBar % 4 === 2 ? 0.56 : 0.32, inBar === 14 && bar % 2 === 1);
      else if (inBar === 7 || inBar === 15) bgmHat(when, 0.22, false);
    } else if (inBar === 0 || inBar === 8) {
      bgmKick(when, 0.5);
    }
  }

  function pumpBgm() {
    if (!alive || !enabled || !context || context.state !== 'running' || musicMode === 'silent') {
      stopBgmTimer();
      return;
    }
    let now;
    try { now = context.currentTime; }
    catch { return; }
    if (!Number.isFinite(now)) return;

    const bpm = bgmTempoFor(musicMode);
    const stepDur = 60 / bpm / 4; // 16th-note duration
    if (bgmNextTime < now - 0.12 || bgmNextTime === 0) {
      bgmNextTime = now + 0.03;
    }
    let guard = 0;
    while (bgmNextTime < now + BGM_LOOKAHEAD_SEC && guard < 12) {
      try { scheduleBgmStep(bgmStep, bgmNextTime, stepDur); } catch { /* stay resilient */ }
      bgmNextTime += stepDur;
      bgmStep = (bgmStep + 1) % 128;
      guard += 1;
    }
  }

  function stopBgmTimer() {
    if (bgmTimer != null) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function syncBgmScheduler() {
    const shouldRun = alive && enabled && context && context.state === 'running' && musicMode !== 'silent';
    if (!shouldRun) {
      stopBgmTimer();
      return;
    }
    pumpBgm();
    if (bgmTimer == null) {
      bgmTimer = setInterval(pumpBgm, BGM_TICK_MS);
    }
  }

  // -------------------------------------------------------------------------
  // Event Dispatch & Lifecycle
  // -------------------------------------------------------------------------

  function motionKind(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return '';
    let raw = '';
    try {
      if (typeof event.type === 'string') raw = event.type;
      else if (typeof event.eventType === 'string') raw = event.eventType;
      else if (typeof event.event === 'string') raw = event.event;
    } catch {
      return '';
    }
    if (!raw) return '';
    const name = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (name === 'leap' || name === 'split' || name === 'mend' || name === 'phase') return name;
    return '';
  }

  function playMotion(list) {
    const source = Array.isArray(list) ? list : (motionKind(list) ? [list] : null);
    if (!source) return;
    const heard = { leap: 0, split: 0, mend: 0, phase: 0 };
    for (let i = 0; i < source.length; i++) {
      let kind = '';
      let event = null;
      try {
        event = source[i];
        kind = motionKind(event);
      } catch {
        continue;
      }
      if (!kind || heard[kind] >= MOTION_CAP) continue;
      const delay = heard[kind] * 0.03;
      heard[kind] += 1;
      try {
        if (kind === 'leap') playLeap(delay);
        else if (kind === 'split') playSplit(delay);
        else if (kind === 'mend') playMend(delay);
        else playPhase(event, delay);
      } catch { /* a bad payload stays silent */ }
    }
  }

  function dispatch(desc, delay) {
    switch (desc.type) {
      case 'shot': return playShot(desc, delay);
      case 'hit': return playHit(desc, delay);
      case 'kill': return playKill(desc, delay);
      case 'fence_hit': return playFence(desc, delay);
      case 'upgrade_tower': return playMerge(desc, delay);
      case 'draft': return playDraft(delay);
      case 'victory': return playVictory();
      case 'defeat': return playDefeat();
      case 'ui': return playUi(desc, delay);
      case 'status': return playStatus(desc, delay);
      case 'boss': return playBoss(desc, delay);
      case 'fence_surge': return playFenceSurge(delay);
      case 'corpse_explode': return playCorpseExplode(delay);
      case 'wave_horde': return playWaveHorde(delay);
      case 'draft_reroll': return playDraftReroll(delay);
      case 'targeting_change': return playTargetingChange(delay);
      case 'napalm_blast': return playNapalmBlast(delay);
      case 'armored_car': return playArmoredCar(delay);
      case 'cryo_barrage': return playCryoBarrage(delay);
      case 'orbital_beam': return playOrbitalBeam(delay);
      case 'em_strike': return playEmStrike(delay);
      case 'wall_immune': return playWallImmune(delay);
      case 'bullet_split': return playBulletSplit(delay);
      case 'cryo_shatter': return playCryoShatter(delay);
      default: return false;
    }
  }

  function playbackList(events) {
    if (!events || typeof events !== 'object' || Array.isArray(events)) return events;
    if (typeof events.type === 'string' || typeof events.event === 'string' || typeof events.eventType === 'string') return events;
    if (!Array.isArray(events.events)) return events;
    const direct = typeof events.reducedMotion === 'boolean'
      || (events.settings && typeof events.settings === 'object' && typeof events.settings.reducedMotion === 'boolean')
      || (events.profile && typeof events.profile === 'object');
    if (!direct) return events;
    const wrapped = reducedFlag(events);
    if (wrapped != null) profileReduced = wrapped;
    return events.events;
  }

  function playEvents(events, hint) {
    const fromHint = reducedFlag(hint);
    if (fromHint != null) {
      profileReduced = fromHint;
      applyBgmMix();
    }
    const list = playbackList(events);
    soften = profileReduced || listSaysReduced(list);
    if (!alive || enabled !== true) return;
    if (!context || context.state !== 'running' || !master) return;
    let now;
    try { now = context.currentTime; }
    catch { return; }
    if (!Number.isFinite(now)) return;
    reap(now);
    const batch = collectFeedback(list, AUDIO_LIMITS);
    batch.sort((a, b) => (PRIORITY[a.type] ?? 50) - (PRIORITY[b.type] ?? 50) || Number(b.crit) - Number(a.crit));
    const counts = new Map();
    const armed = new Set();
    for (let i = 0; i < batch.length; i++) {
      const desc = batch[i];
      const count = counts.get(desc.type) || 0;
      const bypass = desc.type === 'hit' && desc.crit;
      if (!bypass && !armed.has(desc.type)) {
        const previous = lastAt.get(desc.type);
        const gap = GAPS[desc.type] ?? 0.04;
        if (previous != null && now - previous < gap) continue;
      }
      const delay = (desc.type === 'shot' || desc.type === 'hit' || desc.type === 'kill') ? count * 0.008 : 0;
      counts.set(desc.type, count + 1);
      let played = false;
      try { played = dispatch(desc, delay); }
      catch { played = false; }
      if (played) armed.add(desc.type);
    }
    for (const type of armed) lastAt.set(type, now);
    playMotion(list);
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    enabled = false;
    musicMode = 'silent';
    stopBgmTimer();
    voices.length = 0;
    lastAt.clear();
    shotStamp = -1;
    shotRun = 0;
    killStamp = -1;
    killNoteIdx = 0;
    const ctx = context;
    context = null;
    master = null;
    sfxBus = null;
    bgmBus = null;
    bgmFilter = null;
    reverbSend = null;
    noiseBuffers = null;
    if (ctx && typeof ctx.close === 'function') {
      try {
        const closed = ctx.close();
        if (closed && typeof closed.catch === 'function') closed.catch(() => {});
      } catch { /* ignore */ }
    }
  }

  return { unlock, setEnabled, setMusicMode, getMusicMode, playEvents, destroy };
}

};
__ff_factories["src/boot.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["createController"] = createController;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/expeditions.js");
const __ff_m2 = __ff_load("src/engine.js");
const __ff_m3 = __ff_load("src/systems/combat.js");
const __ff_m4 = __ff_load("src/systems/hero.js");
const __ff_m5 = __ff_load("src/systems/drafts.js");
const __ff_m6 = __ff_load("src/systems/progression.js");
const __ff_m7 = __ff_load("src/storage.js");
const __ff_m8 = __ff_load("src/i18n.js");
const __ff_m9 = __ff_load("src/data/towers.js");
const __ff_m10 = __ff_load("src/systems/waves.js");
const __ff_m11 = __ff_load("src/ui/shell.js");
const __ff_m12 = __ff_load("src/ui/build-panel.js");
const __ff_m13 = __ff_load("src/ui/meta-panel.js");
const __ff_m14 = __ff_load("src/audio.js");
const __ff_m15 = __ff_load("src/render/renderer.js");
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const canPlan = __ff_m0["canPlan"];
const clone = __ff_m0["clone"];
const highestUnlockedStageId = __ff_m1["highestUnlockedStageId"];
const isExpedition = __ff_m1["isExpedition"];
const isStageUnlocked = __ff_m1["isStageUnlocked"];
const stageNumber = __ff_m1["stageNumber"];
const advance = __ff_m2["advance"];
const createProfile = __ff_m2["createProfile"];
const createRun = __ff_m2["createRun"];
const enterEndless = __ff_m2["enterEndless"];
const exportRun = __ff_m2["exportRun"];
const integrationInfo = __ff_m2["integrationInfo"];
const prepare = __ff_m2["prepare"];
const setSpeed = __ff_m2["setSpeed"];
const takeEvents = __ff_m2["takeEvents"];
const setTargeting = __ff_m3["setTargeting"];
const hero = __ff_m4;
const drafts = __ff_m5;
const progression = __ff_m6;
const storage = __ff_m7;
const i18n = __ff_m8;
const towers = __ff_m9;
const waves = __ff_m10;
const shellMod = __ff_m11;
const build = __ff_m12;
const meta = __ff_m13;
const audioMod = __ff_m14;
const rendererMod = __ff_m15;

















const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
const ACTIONS = Object.freeze([
  'start', 'resume', 'restart', 'abandon', 'pause', 'speed', 'language', 'sound', 'reducedMotion',
  'screen', 'selectSlot', 'move', 'dragDrop', 'chooseDraft', 'rerollDraft', 'setTargeting',
  'buyEquipment', 'equip', 'upgradePermanent', 'buyGem', 'equipGem', 'unequipGem', 'claimStarterPack',
  'exportSave', 'importSave', 'hover', 'endless'
]);
__ff_exports["ACTIONS"] = ACTIONS;


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

async function createController(options = {}) {
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

};
__ff_factories["src/data/enemies.js"] = function(__ff_exports, __ff_load) {
"use strict";
// Enemy catalog for Fencefall. Keys are the simulation kinds, base bodies and specials.
// Names and descriptions are player-facing; combat numbers are the Normal base.
//
// spawnEnemy (src/systems/movement.js) applies difficulty exactly once:
//   healthScale = overrides.healthScale ?? 1
//   if overrides.maxHp is finite, maxHp is that absolute value and hp is overrides.hp ?? maxHp
//   else if overrides.hp is finite, hp and maxHp are that absolute value
//   else hp = maxHp = row.hp * difficulty.health * healthScale
//   speed = row.speed * difficulty.speed
//   damage = row.damage * difficulty.damage
//   copy radius, attackInterval, xp, armor (do not difficulty-scale these)
// Absolute hp/maxHp overrides are final so tests can pin a body. healthScale is
// how this director weakens the mid-run boss and boss-called swarms without a second
// difficulty multiply. x/y overrides skip the Gaussian spawn when provided.
//
// damage is fence damage per completed attack, not damage per second.
// speed is logical px/s. Movement and combat must read enemy.speed, enemy.damage
// and enemy.attackInterval live: the wave director multiplies them once on enrage.
// armor is a fraction in [0, 0.8] removed from incoming hits.
// Specials append one mechanic object after armor: leap, split, mend, phase, banner, ward, charge, or hush.
// Enemies stop with center y <= fenceY - radius and never damage defenders.
// xp is awarded once on kill. Four ash shamblers are 8 xp, the opening draft threshold.

const ENEMIES = {
  shambler: {
    name: {en: 'Ash Shambler', zh: '灰烬蹒者'},
    description: {
      en: 'Standard frontline zombie with steady speed and no armor, chewing steadily at the wall.',
      zh: '最常见的普通僵尸：步速和血量适中，没有护甲，贴墙后持续啃咬城墙。',
    },
    role: {en: 'Grunt', zh: '步兵'},
    threat: 1,
    hp: 52,
    speed: 30,
    radius: 13,
    damage: 7,
    attackInterval: 1.25,
    xp: 1,
    armor: 0,
  },
  runner: {
    name: {en: 'Wire Runner', zh: '线驰者'},
    description: {
      en: 'Fast sprinter with thin health that rushes the wall ahead of the horde.',
      zh: '移动极快的突进僵尸，血量薄但会抢先冲到城墙前，适合用减速或速射拦截。',
    },
    role: {en: 'Raider', zh: '突进'},
    threat: 2,
    hp: 32,
    speed: 62,
    radius: 11,
    damage: 5,
    attackInterval: 0.9,
    xp: 1,
    armor: 0,
  },
  brute: {
    name: {en: 'Gate Brute', zh: '闸门蛮兽'},
    description: {
      en: 'Huge and slow siege zombie with high health and heavy wall slams.',
      zh: '体型巨大的重型攻城僵尸，移速慢但血量厚实，每一击都能重创城墙。',
    },
    role: {en: 'Siege', zh: '攻城'},
    threat: 5,
    hp: 560,
    speed: 19,
    radius: 20,
    damage: 26,
    attackInterval: 1.65,
    xp: 6,
    armor: 0.15,
  },
  armored: {
    name: {en: 'Plate Walker', zh: '板甲行者'},
    description: {
      en: 'Heavy armor blocks over half of incoming damage. Use Armor Pierce or elemental burns.',
      zh: '身披厚重铁甲，能减免一半以上伤害，用穿甲弹芯或燃烧火海可快速熔化。',
    },
    role: {en: 'Bulwark', zh: '重甲'},
    threat: 4,
    hp: 165,
    speed: 25,
    radius: 15,
    damage: 11,
    attackInterval: 1.4,
    xp: 3,
    armor: 0.55,
  },
  spitter: {
    priority:true,
    attackRange:135, projectileSpeed:190,
    name: {en: 'Sap Spitter', zh: '腐浆喷者'},
    description: {
      en: 'Stops 135 px from the wall and spits acid. Switch Priority targeting to drop it early.',
      zh: '在距城墙 135 像素处停步喷酸，切「高危」索敌可优先将其点杀。',
    },
    role: {en: 'Sapper', zh: '工兵'},
    threat: 3,
    hp: 52,
    speed: 30,
    radius: 12,
    damage: 7,
    attackInterval: 0.55,
    xp: 3,
    armor: 0,
  },
  swarm: {
    name: {en: 'Dust Gnawer', zh: '尘啮'},
    description: {
      en: 'Tiny and fragile alone, but arrives in huge packs to overwhelm the wall.',
      zh: '单只脆弱矮小，但会成群结队涌来，靠燃油火海与分裂弹幕割草极爽。',
    },
    role: {en: 'Swarm', zh: '虫群'},
    threat: 1,
    hp: 14,
    speed: 52,
    radius: 8,
    damage: 2.5,
    attackInterval: 1.05,
    xp: 1,
    armor: 0,
  },
  boss: {
    statusResist:{slow:0.5,stun:0.65},
    name: {en: 'Crown Breach', zh: '冠裂兽'},
    description: {
      en: 'Boss. At or below half (0.5) of its maximum health it enrages, moving faster and striking the wall harder while summoning dust gnawers.',
      zh: '首领。生命降至最大生命的一半（0.5）或以下时会狂暴，移速加快、重击城墙更凶猛，并定时召唤尘啮。',
    },
    role: {en: 'Boss', zh: '首领'},
    threat: 7,
    hp: 3600,
    speed: 16,
    radius: 26,
    damage: 28,
    attackInterval: 1.2,
    xp: 30,
    armor: 0.2,
    // Read by updateWaves. Not a status type and not defender damage.
    enrage: {threshold: 0.5, speedScale: 1.18, damageScale: 1.55, intervalScale: 0.85},
    summon: {kind: 'swarm', count: 2, interval: 7.5, healthScale: 0.85, maxLiving: 12},
  },
  leaper: {
    name: {en: 'Ash Leaper', zh: '灰跃者'},
    description: {
      en: 'Crouches briefly then vaults toward the wall. Frost slow and EM lightning break its jump.',
      zh: '短暂蹲伏后向前扑跃直逼城墙，急冻减速与电磁麻痹可有效打断其突袭。',
    },
    role: {en: 'Leaper', zh: '跃袭'},
    threat: 3,
    hp: 96,
    speed: 32,
    radius: 12,
    damage: 9,
    attackInterval: 1.15,
    xp: 3,
    armor: 0,
    leap: {every: 3.6, windup: 0.85, distance: 78},
  },
  splitter: {
    name: {en: 'Crack Brood', zh: '裂巢'},
    description: {
      en: 'Bursts into two dust gnawers when killed. Area fire and ice skills clean them up fast.',
      zh: '死亡后会分裂出两只尘啮，配合火海与范围自动技能一网打尽。',
    },
    role: {en: 'Brood', zh: '裂变'},
    threat: 4,
    hp: 480,
    speed: 24,
    radius: 14,
    damage: 8,
    attackInterval: 1.3,
    xp: 4,
    armor: 0.1,
    split: {kind: 'swarm', count: 2, healthScale: 6},
  },
  mender: {
    priority:true,
    name: {en: 'Ash Mender', zh: '烬补者'},
    description: {
      en: 'Heals the most wounded zombie nearby (never itself). Snipe it early with Priority targeting.',
      zh: '持续治疗附近受伤最重的僵尸（不治自己），建议切「高危」优先击杀。',
    },
    role: {en: 'Mender', zh: '治疗'},
    threat: 4,
    hp: 120,
    speed: 18,
    radius: 13,
    damage: 5,
    attackInterval: 1.5,
    xp: 4,
    armor: 0,
    mend: {every: 1.8, amount: 46, range: 110},
  },
  shade: {
    name: {en: 'Wall Shade', zh: '幽影'},
    description: {
      en: 'Phases every 1.4s to dodge direct bullets. Napalm fire seas and burn still hurt it.',
      zh: '每 1.4 秒虚化躲避直射子弹，但火海与持续灼烧在虚化期间依然有效。',
    },
    role: {en: 'Shade', zh: '虚化'},
    threat: 3,
    hp: 120,
    speed: 34,
    radius: 11,
    damage: 7,
    attackInterval: 1.05,
    xp: 3,
    armor: 0,
    phase: {open: 1.4, shut: 1.4},
  },
  banner: {
    priority:true,
    name: {en: 'Standard Wretch', zh: '旗孽'},
    description: {
      en: 'Drastically speeds up nearby zombies while alive. Take out the flag-bearer first!',
      zh: '存活时让周围尸群疯狂加速冲锋，务必优先点杀旗手阻止尸潮撞墙！',
    },
    role: {en: 'Banner', zh: '旗手'},
    threat: 4,
    hp: 260,
    speed: 20,
    radius: 14,
    damage: 7,
    attackInterval: 1.35,
    xp: 5,
    armor: 0.1,
    banner: {range: 110, haste: 0.75},
  },
  warden: {
    priority:true,
    name: {en: 'Ash Warden', zh: '烬卫'},
    description: {
      en: 'Projects a damage-reducing shield onto a nearby ally (not itself). Drop the warden first.',
      zh: '为附近一名同伴提供强力减伤护盾（自己无盾），先打掉它瓦解防线。',
    },
    role: {en: 'Ward', zh: '护卫'},
    threat: 4,
    hp: 240,
    speed: 24,
    radius: 15,
    damage: 9,
    attackInterval: 1.35,
    xp: 5,
    armor: 0.08,
    ward: {range: 92, reduction: 0.4},
  },
  charge: {
    priority:true,
    name: {en: 'Cinder Charge', zh: '烬爆者'},
    description: {
      en: 'Lights an explosive fuse upon reaching the wall. Kill or knock it back before detonation!',
      zh: '贴近城墙后点燃引线，倒计时结束会炸出巨额伤害，务必在爆炸前击杀或震退！',
    },
    role: {en: 'Charge', zh: '爆弹'},
    threat: 4,
    hp: 640,
    speed: 40,
    radius: 12,
    damage: 6,
    attackInterval: 1.1,
    xp: 4,
    armor: 0,
    charge: {gap: 110, windup: 1.45, damage: 36},
  },
  hush: {
    priority:true,
    name: {en: 'Ash Hush', zh: '烬寂'},
    description: {
      en: 'Slows your reload speed while clamped to the wall. Clear it swiftly to keep full fire rate.',
      zh: '贴墙时会拖慢枪手攻速与技能充能，尽快击杀以恢复全速倾泻火力。',
    },
    role: {en: 'Hush', zh: '静场'},
    threat: 4,
    hp: 480,
    speed: 36,
    radius: 13,
    damage: 5,
    attackInterval: 1.2,
    xp: 4,
    armor: 0,
    hush: {factor: 0.75},
  },
};
__ff_exports["ENEMIES"] = ENEMIES;


const KINDS = Object.keys(ENEMIES);
for (const kind of KINDS) {
  const row = ENEMIES[kind];
  const stats = ['hp', 'speed', 'radius', 'damage', 'attackInterval', 'xp', 'armor', 'threat'];
  for (const key of stats) {
    if (!Number.isFinite(row[key])) throw new Error(`ENEMIES.${kind}.${key} is not finite`);
  }
  if (row.armor < 0 || row.armor > 0.8) throw new Error(`ENEMIES.${kind}.armor out of range`);
  if (!row.name?.en || !row.name?.zh || !row.description?.en || !row.description?.zh) {
    throw new Error(`ENEMIES.${kind} is missing bilingual text`);
  }
  freezeDeep(row);
}
freezeDeep(ENEMIES);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

};
__ff_factories["src/data/expeditions.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["isExpedition"] = isExpedition;
__ff_exports["stageNumber"] = stageNumber;
__ff_exports["stageIdFor"] = stageIdFor;
__ff_exports["nextStageId"] = nextStageId;
__ff_exports["stageClearRecord"] = stageClearRecord;
__ff_exports["highestClearedStage"] = highestClearedStage;
__ff_exports["highestUnlockedStage"] = highestUnlockedStage;
__ff_exports["highestUnlockedStageId"] = highestUnlockedStageId;
__ff_exports["isStageUnlocked"] = isStageUnlocked;
__ff_exports["totalStarsEarned"] = totalStarsEarned;
// 20-Stage Campaign ("向僵尸开炮" linear stage progression: stage_1 .. stage_20).
const TOTAL_STAGES = 20;
__ff_exports["TOTAL_STAGES"] = TOTAL_STAGES;


const CHAPTERS = Object.freeze([
  { id: 1, range: [1, 5], name: { en: 'Ch.1 Wasteland Line', zh: '第一章 · 荒原防线' } },
  { id: 2, range: [6, 10], name: { en: 'Ch.2 Ruined Siege', zh: '第二章 · 废土围城' } },
  { id: 3, range: [11, 15], name: { en: 'Ch.3 Scorched Front', zh: '第三章 · 焦土决战' } },
  { id: 4, range: [16, 20], name: { en: 'Ch.4 Final Bastion', zh: '第四章 · 终末壁垒' } },
]);
__ff_exports["CHAPTERS"] = CHAPTERS;


const pack = (kind, count, interval, healthScale = 1, delay = 0, speedScale = 1) => ({
  kind,
  count,
  interval,
  healthScale,
  delay,
  speedScale,
});
const phase = (id, from, until, every, name, groups, horde = false) => ({ id, from, until, every, name, groups, horde });

// Stage blueprint tuples:
// [stageNum, enShort, zhShort, focusEn, focusZh, summaryEn, summaryZh, hpScale, enemies, buildPhases]
function roundScale(v) {
  return Math.round(v * 100) / 100;
}

function makeStandardPhases(s, hp, opts) {
  const {
    primary = 'shambler',
    secondary = 'runner',
    elite = 'armored',
    support = null,
    bossScale = 0,
    vanguardScale = 0,
    swarmCount = 14,
  } = opts;
  const n = (en, zh) => ({ en, zh });
  const h = (mult) => roundScale(hp * mult);
  const phases = [
    // Act 1 · Quiet Opening (0.5s, Wave 1): ONLY a few slow shamblers — calm deliberate rifle pace
    phase(
      `s${s}-open`, 0.5, 1.5, 1,
      n(`Stage ${s} · Quiet Line`, `第 ${s} 关 · 零星试探`),
      [
        pack('shambler', 4, 1.2, h(0.28), 0, 0.7),
        pack('swarm', 2, 1.1, h(0.24), 2.4, 0.72),
      ]
    ),
    // Act 2 · Slow Skirmish (6s - 62s, every 8s -> 7 waves): sparse, calm trickle while early buffs stack
    phase(
      `s${s}-rush`, 6, 62, 8,
      n('First Wave', '初潮逼近'),
      [
        pack('swarm', Math.max(4, Math.round(swarmCount * 0.34)), 1.45, h(0.35), 0, 0.78),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 0.32) : 2, primary === 'swarm' ? 1.4 : 2.8, h(0.4), 1.6, 0.8),
        pack(secondary, secondary === 'runner' || secondary === 'swarm' ? 2 : 1, 3.0, h(0.44), 4.0, 0.82),
      ],
      false
    ),
    // Act 3 · Rising Tide (62s - 134s, every 8s -> 9 waves): elites join, tempo picks up as first Auto Skills unlock
    phase(
      `s${s}-surge`, 62, 134, 8,
      n('Rising Tide', '尸潮涌动'),
      [
        pack('swarm', Math.round(swarmCount * 0.95), 0.56, h(0.75), 0, 0.94),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 0.9) : 4, primary === 'swarm' ? 0.56 : 1.8, h(0.85), 1.0, 0.96),
        pack(elite, elite === 'brute' ? 1 : 2, 2.8, h(0.95), 2.6, 0.95),
        ...(support ? [pack(support, 1, 0, h(0.88), 4.0, 0.96)] : []),
      ],
      true
    ),
    // Act 4 · Steel Clash (134s - 214s, every 8s -> 10 waves): dense mixed lines, faster march, growing HP
    phase(
      `s${s}-clash`, 134, 214, 8,
      n('Steel Clash', '正面激战'),
      [
        pack('swarm', Math.round(swarmCount * 1.55), 0.34, h(1.45), 0, 1.08),
        pack(secondary, secondary === 'runner' ? 5 : 3, secondary === 'runner' ? 1.4 : 2.1, h(1.62), 0.7, 1.1),
        pack(elite, elite === 'brute' ? 2 : 3, 2.2, h(1.8), 2.0, 1.06),
        ...(support ? [pack(support, support === 'hush' ? 1 : 2, 2.6, h(1.65), 3.4, 1.08)] : []),
      ],
      false
    ),
  ];

  // Optional Mid-Stage Vanguard Mini-Boss on Boss / Late Stages (5, 10, 15, 19, 20)
  if (vanguardScale > 0) {
    phases.push(
      phase(
        `s${s}-vanguard`, 154, 155, 1,
        n('Vanguard Boss', '先锋巨兽'),
        [
          pack('boss', 1, 0, roundScale(vanguardScale * 1.6), 0, 1.05),
          pack('swarm', Math.round(swarmCount * 1.5), 0.32, h(1.5), 0.3, 1.08),
          pack(secondary, 4, 1.25, h(1.6), 1.1, 1.1),
        ],
        true
      )
    );
  }

  // Act 5 · Crimson Storm (214s - 294s, every 8s -> 10 waves): intense high-speed horde vs multi-skill barrage
  phases.push(
    phase(
      `s${s}-storm`, 214, 294, 8,
      n('Crimson Storm', '赤潮狂攻'),
      [
        pack('swarm', Math.round(swarmCount * 2.35), 0.21, h(2.6), 0, 1.2),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 1.8) : 6, primary === 'swarm' ? 0.26 : 1.15, h(2.9), 0.4, 1.22),
        pack(elite, elite === 'brute' ? 3 : 4, 1.7, h(3.25), 1.5, 1.18),
        ...(support ? [pack(support, support === 'hush' ? 1 : 2, 2.3, h(2.85), 2.8, 1.22)] : []),
      ],
      true
    )
  );

  // Act 6 · Apocalyptic Overdrive (294s - 366s, every 8s -> 9 waves): massive screen-filling zombie tidal waves!
  phases.push(
    phase(
      `s${s}-overdrive`, 294, 366, 8,
      n('Apocalypse Surge', '末日狂潮'),
      [
        pack('swarm', Math.round(swarmCount * 3.3), 0.12, h(4.4), 0, 1.3),
        pack(secondary, secondary === 'runner' ? 9 : 6, secondary === 'runner' ? 0.72 : 1.15, h(4.8), 0.3, 1.32),
        pack(elite, elite === 'brute' ? 4 : 6, 1.25, h(5.2), 1.1, 1.28),
        ...(support ? [pack(support, 2, 2.1, h(4.6), 2.4, 1.3)] : []),
      ],
      true
    )
  );

  // Act 7 · Cataclysm Buildup (366s - 382s, 2 massive waves right into Finale)
  phases.push(
    phase(
      `s${s}-siege`, 366, 382, 8,
      n('Last Stand', '死守防线'),
      [
        pack('swarm', Math.round(swarmCount * 4.0), 0.1, h(5.8), 0, 1.36),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 2.8) : 9, primary === 'swarm' ? 0.15 : 0.85, h(6.2), 0.2, 1.36),
        pack(elite, elite === 'brute' ? 5 : 7, 1.05, h(6.6), 0.9, 1.32),
        ...(support ? [pack(support, 2, 1.9, h(5.8), 2.1, 1.35)] : []),
      ],
      true
    )
  );

  // Finale · Boss Siege or Cataclysm Assault at 382s (~49-50 total waves, ~6.3 min full arc!)
  if (bossScale > 0) {
    phases.push(
      phase(
        `s${s}-boss`, 382, 383, 1,
        n('Boss Siege', '首领压境'),
        [
          pack('boss', 1, 0, roundScale(bossScale * 2.85), 0, 1.16),
          pack('swarm', Math.round(swarmCount * 4.4), 0.1, h(6.0), 0.2, 1.38),
          pack(elite, 6, 1.2, h(6.8), 0.8, 1.34),
          ...(support ? [pack(support, 3, 1.7, h(6.0), 1.8, 1.36)] : []),
        ],
        true
      )
    );
  } else {
    phases.push(
      phase(
        `s${s}-finale`, 382, 383, 1,
        n('Final Assault', '终局总攻'),
        [
          pack('swarm', Math.round(swarmCount * 4.6), 0.09, h(6.2), 0, 1.4),
          pack(elite, elite === 'brute' ? 6 : 8, 1.0, h(7.0), 0.5, 1.34),
          pack(secondary, secondary === 'runner' ? 12 : 8, 0.7, h(6.4), 0.2, 1.4),
          ...(support ? [pack(support, 3, 1.6, h(6.2), 1.6, 1.38)] : []),
        ],
        true
      )
    );
  }
  return phases;
}

const STAGE_SPECS = [
  // Chapter 1: 荒原防线 (Stages 1-5) — Welcoming pure Solo-Gunner onboarding -> Boss 1
  {
    stage: 1, chapter: 1, hp: 0.65, xpPace: 1.05, swarmCount: 12,
    en: 'Ash Outpost', zh: '灰烬前哨',
    focusEn: 'Horde intro · Rapid upgrades', focusZh: '割草入门 · 极速成型',
    summaryEn: 'Waves of shamblers and gnawers march toward the wall. Pick Gun Mods and Auto Skills to unleash bullet storms!',
    summaryZh: '开局迎战成群蹒者与尘啮，三选一解锁枪械强化与自动技能，轻松割草！',
    enemies: ['shambler', 'swarm'],
    opts: { primary: 'shambler', secondary: 'swarm', elite: 'shambler', swarmCount: 12 },
  },
  {
    stage: 2, chapter: 1, hp: 0.78, xpPace: 1.15, swarmCount: 14,
    en: 'Broken Bridge', zh: '断桥尸群',
    focusEn: 'Fast Wire Runners', focusZh: '极速线驰突进',
    summaryEn: 'Fast Wire Runners dash straight for the wall. Frost Rounds and Rapid Fire keep them pinned down.',
    summaryZh: '高速线驰者混入尸潮直冲城墙，急冻减速弹与极速连射轻松拦截。',
    enemies: ['shambler', 'swarm', 'runner'],
    opts: { primary: 'runner', secondary: 'shambler', elite: 'runner', swarmCount: 14 },
  },
  {
    stage: 3, chapter: 1, hp: 0.92, xpPace: 1.25, swarmCount: 15,
    en: 'Acid Crossing', zh: '酸雾路口',
    focusEn: 'Ranged Sap Spitters', focusZh: '远程喷酸工兵',
    summaryEn: 'Sap Spitters halt mid-field to spit acid at the wall. Tap the Gunner to switch Priority targeting!',
    summaryZh: '腐浆喷者在中距离停步喷酸，点击枪手切「高危」优先点杀它们。',
    enemies: ['swarm', 'runner', 'spitter'],
    opts: { primary: 'spitter', secondary: 'runner', elite: 'spitter', swarmCount: 15 },
  },
  {
    stage: 4, chapter: 1, hp: 1.08, xpPace: 1.32, swarmCount: 16,
    en: 'Rusted Barricade', zh: '铁锈路障',
    focusEn: 'Armored & Gate Brutes', focusZh: '重甲板甲与蛮兽',
    summaryEn: 'Plate Walkers shrug off light shots while Gate Brutes march behind. Armor Pierce and Napalm melt them.',
    summaryZh: '板甲行者与闸门蛮兽重装压境，穿甲弹芯与燃油火海是最佳克星。',
    enemies: ['swarm', 'armored', 'brute', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', swarmCount: 16 },
  },
  {
    stage: 5, chapter: 1, hp: 1.25, xpPace: 1.35, swarmCount: 17, boss: true,
    en: 'First Crown', zh: '初代冠兽',
    focusEn: 'Chapter 1 Boss Siege', focusZh: '第一章首领决战',
    summaryEn: 'Crown Breach leads its first siege! Stack Deadeye Crit, Armor Pierce, and Orbital Laser to crush it.',
    summaryZh: '冠裂兽首次率领尸潮压境！搭配致命暴击、穿甲与高能激光柱击溃首领。',
    enemies: ['swarm', 'runner', 'armored', 'boss'],
    opts: { primary: 'runner', secondary: 'spitter', elite: 'armored', vanguardScale: 0.55, bossScale: 0.95, swarmCount: 17 },
  },

  // Chapter 2: 废土围城 (Stages 6-10) — Splitters, Leapers, Menders, Shades -> Boss 2
  {
    stage: 6, chapter: 2, hp: 1.48, xpPace: 1.45, swarmCount: 18,
    en: 'Brood Tide', zh: '裂巢涌动',
    focusEn: 'Crack Broods & Swarms', focusZh: '分裂裂巢与虫海',
    summaryEn: 'Crack Broods burst into dust gnawers on death. Napalm Fire Sea and Split Shrapnel clear crowds fast.',
    summaryZh: '裂巢阵亡后会分裂出大量尘啮，燃油火海与子母分裂弹清场极爽。',
    enemies: ['swarm', 'splitter', 'runner'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'splitter', swarmCount: 18 },
  },
  {
    stage: 7, chapter: 2, hp: 1.72, xpPace: 1.50, swarmCount: 19,
    en: 'Leaper Ambush', zh: '灰跃突袭',
    focusEn: 'Leaping Ash Packs', focusZh: '跃袭突进伏击',
    summaryEn: 'Ash Leapers crouch and vault toward the wall. Glacial Barrage and EM Chain Strike break their charge.',
    summaryZh: '灰跃者蓄力扑跃直逼城墙，干冰齐射柱与电磁连锁雷可打断突袭。',
    enemies: ['leaper', 'runner', 'swarm'],
    opts: { primary: 'leaper', secondary: 'runner', elite: 'leaper', support: 'spitter', swarmCount: 19 },
  },
  {
    stage: 8, chapter: 2, hp: 2.00, xpPace: 1.55, swarmCount: 20,
    en: 'Mender Column', zh: '烬医方阵',
    focusEn: 'Healers behind Tanks', focusZh: '治疗方阵与重盾',
    summaryEn: 'Ash Menders heal wounded Plate Walkers. Use Priority targeting or heavy AoE skills to break their line.',
    summaryZh: '烬补者在重甲后方持续回血，切「高危」索敌或自动技能群攻快速破阵。',
    enemies: ['armored', 'mender', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', support: 'mender', swarmCount: 20 },
  },
  {
    stage: 9, chapter: 2, hp: 2.30, xpPace: 1.60, swarmCount: 20,
    en: 'Shade Corridor', zh: '幽影长廊',
    focusEn: 'Phasing Wall Shades', focusZh: '虚化幽影潜行',
    summaryEn: 'Wall Shades phase out to dodge direct bullets—Napalm Fire Sea and Flame Rounds still scorch them.',
    summaryZh: '幽影周期虚化规避直射，燃油火海与烈焰爆裂弹仍可持续灼烧击杀。',
    enemies: ['shade', 'spitter', 'leaper'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'spitter', support: 'mender', swarmCount: 20 },
  },
  {
    stage: 10, chapter: 2, hp: 2.65, xpPace: 1.62, swarmCount: 21, boss: true,
    en: 'Horde Overlord', zh: '狂潮领主',
    focusEn: 'Chapter 2 Boss Siege', focusZh: '第二章首领决战',
    summaryEn: 'An empowered Crown Breach advances with Mender and Splitter escorts. Socket Core Gems in the Armory!',
    summaryZh: '强化冠裂兽携烬补者与裂巢压境，前往军械库镶嵌核心宝石与武装全力迎战！',
    enemies: ['splitter', 'mender', 'armored', 'boss'],
    opts: { primary: 'splitter', secondary: 'leaper', elite: 'armored', support: 'mender', vanguardScale: 1.1, bossScale: 1.85, swarmCount: 21 },
  },

  // Chapter 3: 焦土决战 (Stages 11-15) — Banners, Wardens, Charges, Hush -> Double Boss 3
  {
    stage: 11, chapter: 3, hp: 3.05, xpPace: 1.70, swarmCount: 22,
    en: 'Crimson Standard', zh: '血旗冲锋',
    focusEn: 'Haste Banner Rush', focusZh: '加速旗孽冲锋',
    summaryEn: 'Standard Wretches accelerate nearby zombies. Snipe banners early and sweep lanes with Armored Sweeper!',
    summaryZh: '旗孽令周围尸群狂飙加速，优先点杀旗手并用重装装甲车碾压清路！',
    enemies: ['banner', 'runner', 'leaper', 'swarm'],
    opts: { primary: 'runner', secondary: 'leaper', elite: 'armored', support: 'banner', swarmCount: 22 },
  },
  {
    stage: 12, chapter: 3, hp: 3.50, xpPace: 1.75, swarmCount: 23,
    en: 'Aegis Phalanx', zh: '盾墙推进',
    focusEn: 'Shielded Heavy Packs', focusZh: '护盾烬卫重装阵',
    summaryEn: 'Ash Wardens shield nearby Brutes and Plate Walkers. Drop Wardens first to shatter the phalanx.',
    summaryZh: '烬卫为同伴提供强力减伤护盾，优先斩杀烬卫瓦解重装方阵。',
    enemies: ['warden', 'armored', 'brute', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 23 },
  },
  {
    stage: 13, chapter: 3, hp: 4.00, xpPace: 1.80, swarmCount: 24,
    en: 'Cinder Tunnel', zh: '爆燃矿道',
    focusEn: 'Explosive Cinder Charges', focusZh: '引线自爆烬爆者',
    summaryEn: 'Cinder Charges ignite explosive fuses right at your wall. Knockback & burst stop them before detonation!',
    summaryZh: '烬爆者贴墙点燃引线爆发巨额伤害，靠击退与高爆发在引爆前清除。',
    enemies: ['charge', 'runner', 'splitter', 'spitter'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'charge', support: 'spitter', swarmCount: 24 },
  },
  {
    stage: 14, chapter: 3, hp: 4.55, xpPace: 1.85, swarmCount: 24,
    en: 'Silent Night', zh: '寂静寒夜',
    focusEn: 'Ash Hush Jamming', focusZh: '烬寂降频干扰',
    summaryEn: 'Ash Hush slows fire rate while clamped to the wall. Pair Orbital Laser and EM Chain Strike to clear it fast!',
    summaryZh: '烬寂贴墙会拖慢攻速，搭配高能激光柱与电磁连锁雷迅速清场。',
    enemies: ['hush', 'shade', 'spitter', 'warden'],
    opts: { primary: 'shade', secondary: 'spitter', elite: 'warden', support: 'hush', swarmCount: 24 },
  },
  {
    stage: 15, chapter: 3, hp: 5.15, xpPace: 1.85, swarmCount: 25, boss: true,
    en: 'Scorched Sovereign', zh: '焦土霸主',
    focusEn: 'Vanguard + Boss Siege', focusZh: '双首领焦土决战',
    summaryEn: 'A mid-stage Vanguard Boss tests your wall before the Scorched Sovereign arrives with Wardens & Banners.',
    summaryZh: '中段先锋巨兽先声夺人，终局焦土霸主携旗孽与烬卫全面总攻！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'charge', secondary: 'banner', elite: 'warden', support: 'mender', vanguardScale: 1.7, bossScale: 3.1, swarmCount: 25 },
  },

  // Chapter 4: 终末壁垒 (Stages 16-20) — Endgame Mastery
  {
    stage: 16, chapter: 4, hp: 5.80, xpPace: 1.90, swarmCount: 25,
    en: 'Iron Deluge', zh: '钢铁洪流',
    focusEn: 'Juggernaut Armored Wave', focusZh: '重甲蛮兽钢铁洪流',
    summaryEn: 'Wall-to-wall Brutes, Armored walkers, Wardens, and Menders. Bring HP Shredder & Armor Pierce!',
    summaryZh: '蛮兽、板甲、烬卫与烬补者全重装压境，百分比斩杀宝石与穿甲显威！',
    enemies: ['brute', 'armored', 'warden', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 25 },
  },
  {
    stage: 17, chapter: 4, hp: 6.50, xpPace: 1.95, swarmCount: 26,
    en: 'Shadow Detonation', zh: '暗影爆破',
    focusEn: 'Shades, Charges & Banners', focusZh: '幽影自爆极速突袭',
    summaryEn: 'Banner-boosted Leapers, phasing Shades, and Cinder Charges strike from every angle.',
    summaryZh: '旗孽加速的灰跃、幽影与自爆烬爆多路齐发，靠全屏自动技能压制致胜！',
    enemies: ['shade', 'charge', 'leaper', 'banner'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'charge', support: 'banner', swarmCount: 26 },
  },
  {
    stage: 18, chapter: 4, hp: 7.25, xpPace: 2.00, swarmCount: 27,
    en: 'Hushed Horde', zh: '静默尸海',
    focusEn: 'Massive Swarm & Hush', focusZh: '静默干扰无尽虫海',
    summaryEn: 'Relentless Brood splits and Spitters backed by Ash Hush jamming. Keep Auto Skills cycling non-stop!',
    summaryZh: '裂巢、喷酸与烬寂交织成铺天盖地的尸海，靠高频自动技能循环破局！',
    enemies: ['hush', 'splitter', 'swarm', 'spitter'],
    opts: { primary: 'splitter', secondary: 'spitter', elite: 'charge', support: 'hush', swarmCount: 27 },
  },
  {
    stage: 19, chapter: 4, hp: 8.10, xpPace: 2.00, swarmCount: 28,
    en: 'Eve of Dawn', zh: '破晓前夜',
    focusEn: 'All-Elite Gauntlet', focusZh: '全精英混合试炼',
    summaryEn: 'Every elite zombie role plus a Vanguard Crown Breach tests your complete build before Stage 20.',
    summaryZh: '全部精英尸种与先锋巨兽齐上阵，第 20 关终极决战前的全能检验！',
    enemies: ['banner', 'warden', 'hush', 'brute'],
    opts: { primary: 'warden', secondary: 'banner', elite: 'brute', support: 'hush', vanguardScale: 2.4, swarmCount: 28 },
  },
  {
    stage: 20, chapter: 4, hp: 9.00, xpPace: 2.05, swarmCount: 29, boss: true,
    en: 'Crown Cataclysm', zh: '终局冠裂',
    focusEn: 'Stage 20 Final Boss', focusZh: '第 20 关终极首领',
    summaryEn: 'The ultimate 20th-stage bastion defense! Conquer the Vanguard and full-power Crown Breach to master the campaign.',
    summaryZh: '前 20 关终极决战！击溃先锋巨兽与满血终局冠裂兽，荣登城墙之巅！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'armored', secondary: 'charge', elite: 'warden', support: 'banner', vanguardScale: 2.6, bossScale: 4.5, swarmCount: 29 },
  },
];

const STAGE_ORDER = Object.freeze(STAGE_SPECS.map((s) => `stage_${s.stage}`));
__ff_exports["STAGE_ORDER"] = STAGE_ORDER;

const EXPEDITION_ORDER = STAGE_ORDER;
__ff_exports["EXPEDITION_ORDER"] = EXPEDITION_ORDER;


const STAGES = {};
__ff_exports["STAGES"] = STAGES;

const EXPEDITIONS = {};
__ff_exports["EXPEDITIONS"] = EXPEDITIONS;


for (const spec of STAGE_SPECS) {
  const id = `stage_${spec.stage}`;
  const entry = {
    id,
    stage: spec.stage,
    chapter: spec.chapter,
    boss: Boolean(spec.boss),
    minutes: 5,
    xpPace: spec.xpPace,
    firstClearBonus: 40 + (spec.stage - 1) * 10,
    shortName: { en: spec.en, zh: spec.zh },
    name: { en: `Stage ${spec.stage} · ${spec.en}`, zh: `第 ${spec.stage} 关 · ${spec.zh}` },
    focus: { en: spec.focusEn, zh: spec.focusZh },
    summary: { en: spec.summaryEn, zh: spec.summaryZh },
    enemies: spec.enemies.slice(),
    phases: makeStandardPhases(spec.stage, spec.hp, spec.opts),
  };
  STAGES[id] = entry;
  EXPEDITIONS[id] = entry;
}

function isExpedition(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPEDITIONS, id);
}

function stageNumber(id) {
  if (typeof id !== 'string') return 0;
  const spec = STAGES[id];
  return spec ? spec.stage : 0;
}

function stageIdFor(num) {
  const n = Math.max(1, Math.min(TOTAL_STAGES, Math.floor(Number(num) || 1)));
  return `stage_${n}`;
}

function nextStageId(id) {
  const n = stageNumber(id);
  if (n <= 0 || n >= TOTAL_STAGES) return null;
  return `stage_${n + 1}`;
}

function stageClearRecord(profile, id) {
  const rec = profile?.expeditions?.[id];
  if (!rec || typeof rec !== 'object') return { clears: 0, stars: 0, bestTime: null };
  const clears = Number.isFinite(rec.clears) ? Math.max(0, Math.floor(rec.clears)) : 0;
  const stars = Number.isFinite(rec.stars) ? Math.max(0, Math.min(3, Math.floor(rec.stars))) : (clears > 0 ? 1 : 0);
  const bestTime = Number.isFinite(rec.bestTime) ? rec.bestTime : null;
  return { clears, stars, bestTime };
}

function highestClearedStage(profile) {
  let highest = 0;
  for (let n = 1; n <= TOTAL_STAGES; n += 1) {
    if (stageClearRecord(profile, `stage_${n}`).clears > 0) highest = n;
  }
  return highest;
}

function highestUnlockedStage(profile) {
  return Math.min(TOTAL_STAGES, highestClearedStage(profile) + 1);
}

function highestUnlockedStageId(profile) {
  return `stage_${highestUnlockedStage(profile)}`;
}

function isStageUnlocked(profile, id) {
  const n = stageNumber(id);
  if (n <= 0) return false;
  return n <= highestUnlockedStage(profile);
}

function totalStarsEarned(profile) {
  let sum = 0;
  for (let n = 1; n <= TOTAL_STAGES; n += 1) {
    sum += stageClearRecord(profile, `stage_${n}`).stars;
  }
  return sum;
}

freezeDeep(STAGES);
freezeDeep(EXPEDITIONS);
freezeDeep(STAGE_ORDER);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

};
__ff_factories["src/data/towers.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["getUnitStats"] = getUnitStats;
const __ff_m0 = __ff_load("src/systems/progression.js");
const __ff_m1 = __ff_load("src/systems/hero.js");
const getProfileBonuses = __ff_m0["getProfileBonuses"];
const getHeroStats = __ff_m1["getHeroStats"];



const MIN_USEFUL_RANGE = 210;
__ff_exports["MIN_USEFUL_RANGE"] = MIN_USEFUL_RANGE;


/** Caps and formulas for support auras. Combat owns the application. */
const AURA_RULES = Object.freeze({
  includeSelf: true,
  measuredFrom: 'defender slot center',
  affects: 'defenders',
  excludes: 'enemies',
  stack: 'sum',
  damageCap: 0.6,
  hasteCap: 0.45,
  damageFormula: 'damage * (1 + clampedDamageBonus)',
  hasteFormula: 'interval / (1 + clampedHaste)'
});
__ff_exports["AURA_RULES"] = AURA_RULES;


/**
 * Rank-1 stats are multiplied by these tables. Index 0 is rank 1.
 * Tuned for direct 1-card = +1 level turret progression (Lv.1 -> Lv.4).
 */
const RANK_SCALE = Object.freeze({
  maxRank: 4,
  damage: Object.freeze([1, 1.9, 3.1, 4.8]),
  interval: Object.freeze([1, 0.91, 0.83, 0.76]),
  rangeAdd: Object.freeze([0, 16, 32, 48]),
  critAdd: Object.freeze([0, 0.02, 0.04, 0.07]),
  critMultiplierAdd: Object.freeze([0, 0.06, 0.12, 0.2]),
  projectileSpeedAdd: Object.freeze([0, 20, 40, 60]),
  splashAdd: Object.freeze([0, 6, 12, 18]),
  chainAdd: Object.freeze([0, 1, 1, 2]),
  chainRangeAdd: Object.freeze([0, 8, 16, 24]),
  pierceAdd: Object.freeze([0, 0, 1, 2]),
  effect: Object.freeze([1, 1.7, 2.7, 4.1]),
  duration: Object.freeze([1, 1.1, 1.2, 1.32]),
  slowFactorReduce: Object.freeze([0, 0.05, 0.1, 0.14]),
  poisonStacksAdd: Object.freeze([0, 0, 1, 2]),
  auraPower: Object.freeze([1, 1.2, 1.42, 1.65]),
  auraRangeAdd: Object.freeze([0, 10, 20, 30]),
  intervalFloor: 0.4,
  critChanceCap: 0.45,
  critMultiplierCap: 2.5,
  projectileSpeedCap: 680,
  splashCap: 84,
  chainCap: 5,
  chainRangeCap: 140,
  pierceCap: 4,
  durationCap: 8,
  slowFactorFloor: 0.42,
  poisonStacksCap: 6,
  auraRangeCap: 170
});
__ff_exports["RANK_SCALE"] = RANK_SCALE;


/** How UnitStats effect blocks map onto the shared status object. */
const STATUS_HOOKS = Object.freeze({
  burn: Object.freeze({type: 'burn', power: 'dps', remaining: 'duration'}),
  poison: Object.freeze({type: 'poison', power: 'dps per stack', remaining: 'duration', stacks: 'start at 1 and cap at maxStacks'}),
  slow: Object.freeze({type: 'slow', power: 'remaining speed factor, not a percentage reduction', remaining: 'duration'})
});
__ff_exports["STATUS_HOOKS"] = STATUS_HOOKS;


function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function roundTo(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clampRank(rank) {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return 1;
  return clamp(Math.round(rank), 1, RANK_SCALE.maxRank);
}

function plainClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function copyEffect(source) {
  return source && typeof source === 'object' ? plainClone(source) : null;
}

function withDefaults(stats) {
  const src = stats && typeof stats === 'object' && !Array.isArray(stats) ? plainClone(stats) : {};
  const known = new Set(['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce', 'mechanics', 'burn', 'slow', 'poison', 'aura']);
  const out = {
    damage: Math.max(0, num(src.damage, 0)),
    interval: num(src.interval, 1) > 0 ? num(src.interval, 1) : 1,
    range: Math.max(0, num(src.range, MIN_USEFUL_RANGE)),
    critChance: num(src.critChance, 0),
    critMultiplier: num(src.critMultiplier, 1.75) > 0 ? num(src.critMultiplier, 1.75) : 1.75,
    projectileSpeed: num(src.projectileSpeed, 300) > 0 ? num(src.projectileSpeed, 300) : 300,
    splash: Math.max(0, num(src.splash, 0)),
    chain: Math.max(0, num(src.chain, 0)),
    chainRange: num(src.chainRange, 70) > 0 ? num(src.chainRange, 70) : 70,
    pierce: Math.max(0, num(src.pierce, 0)),
    mechanics: Array.isArray(src.mechanics) ? src.mechanics.filter((item) => typeof item === 'string') : []
  };
  for (const key of Object.keys(src)) if (!known.has(key)) out[key] = src[key];
  if (src.burn && typeof src.burn === 'object') {
    out.burn = copyEffect(src.burn);
    out.burn.dps = Math.max(0, num(src.burn.dps, 0));
    out.burn.duration = Math.max(0, num(src.burn.duration, 0));
  }
  if (src.slow && typeof src.slow === 'object') {
    out.slow = copyEffect(src.slow);
    out.slow.factor = num(src.slow.factor, 1);
    out.slow.duration = Math.max(0, num(src.slow.duration, 0));
  }
  if (src.poison && typeof src.poison === 'object') {
    out.poison = copyEffect(src.poison);
    out.poison.dps = Math.max(0, num(src.poison.dps, 0));
    out.poison.duration = Math.max(0, num(src.poison.duration, 0));
    out.poison.maxStacks = Math.max(1, Math.round(num(src.poison.maxStacks, 1)));
  }
  if (src.aura && typeof src.aura === 'object') {
    out.aura = copyEffect(src.aura);
    out.aura.range = Math.max(0, num(src.aura.range, 0));
    out.aura.damage = Math.max(0, num(src.aura.damage, 0));
    out.aura.haste = Math.max(0, num(src.aura.haste, 0));
  }
  return out;
}

function scaleStats(baseStats, rank) {
  const index = clampRank(rank) - 1;
  const out = withDefaults(baseStats);
  out.damage = roundTo(out.damage * RANK_SCALE.damage[index], 2);
  out.interval = roundTo(Math.max(RANK_SCALE.intervalFloor, out.interval * RANK_SCALE.interval[index]), 3);
  out.range = Math.max(MIN_USEFUL_RANGE, Math.round(out.range + RANK_SCALE.rangeAdd[index]));
  out.critChance = roundTo(clamp(out.critChance + RANK_SCALE.critAdd[index], 0, RANK_SCALE.critChanceCap), 4);
  out.critMultiplier = roundTo(clamp(out.critMultiplier + RANK_SCALE.critMultiplierAdd[index], 1, RANK_SCALE.critMultiplierCap), 4);
  out.projectileSpeed = Math.round(clamp(out.projectileSpeed + RANK_SCALE.projectileSpeedAdd[index], 40, RANK_SCALE.projectileSpeedCap));
  if (out.splash > 0) out.splash = roundTo(Math.min(RANK_SCALE.splashCap, out.splash + RANK_SCALE.splashAdd[index]), 2);
  if (out.chain > 0) {
    out.chain = Math.min(RANK_SCALE.chainCap, Math.round(out.chain + RANK_SCALE.chainAdd[index]));
    out.chainRange = Math.min(RANK_SCALE.chainRangeCap, Math.round(out.chainRange + RANK_SCALE.chainRangeAdd[index]));
  }
  if (out.pierce > 0) out.pierce = Math.min(RANK_SCALE.pierceCap, Math.round(out.pierce + RANK_SCALE.pierceAdd[index]));
  if (out.burn) {
    out.burn.dps = roundTo(out.burn.dps * RANK_SCALE.effect[index], 2);
    out.burn.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.burn.duration * RANK_SCALE.duration[index]), 2);
  }
  if (out.slow) {
    out.slow.factor = roundTo(clamp(out.slow.factor - RANK_SCALE.slowFactorReduce[index], RANK_SCALE.slowFactorFloor, 1), 4);
    out.slow.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.slow.duration * RANK_SCALE.duration[index]), 2);
  }
  if (out.poison) {
    out.poison.dps = roundTo(out.poison.dps * RANK_SCALE.effect[index], 2);
    out.poison.duration = roundTo(Math.min(RANK_SCALE.durationCap, out.poison.duration * RANK_SCALE.duration[index]), 2);
    out.poison.maxStacks = Math.min(RANK_SCALE.poisonStacksCap, Math.max(1, Math.round(out.poison.maxStacks + RANK_SCALE.poisonStacksAdd[index])));
  }
  if (out.aura) {
    out.aura.range = Math.min(RANK_SCALE.auraRangeCap, Math.round(out.aura.range + RANK_SCALE.auraRangeAdd[index]));
    out.aura.damage = roundTo(out.aura.damage * RANK_SCALE.auraPower[index], 4);
    out.aura.haste = roundTo(out.aura.haste * RANK_SCALE.auraPower[index], 4);
  }
  return out;
}

function inertStats() {
  return withDefaults({
    damage: 0,
    interval: 1,
    range: MIN_USEFUL_RANGE,
    critChance: 0,
    critMultiplier: 1.75,
    projectileSpeed: 300,
    splash: 0,
    chain: 0,
    chainRange: 70,
    pierce: 0,
    mechanics: []
  });
}

function tower(id, en, zh, roleEn, roleZh, summary, detail, damage, interval, range, effects) {
  return {
    id,
    name: {en, zh},
    role: {en: roleEn, zh: roleZh},
    description: {en: summary, zh: detail},
    stats: withDefaults({
      damage,
      interval,
      range,
      ...effects,
      mechanics: ['projectile', ...Object.keys(effects)
        .filter((k) => !['chainRange', 'critMultiplier', 'projectileSpeed'].includes(k))
        .map((k) => (k === 'critChance' ? 'crit' : k))]
    })
  };
}

const TOWERS = {
  bolt: tower('bolt', 'Rivet', '穿钉', 'Projectile', '投射',
    'Pierce a second target with a fast critical bolt.',
    '快速弩矢可暴击并贯穿第二个目标。',
    14, 0.65, 300,
    {pierce: 1, critChance: 0.16, critMultiplier: 1.85, projectileSpeed: 460}),
  fire: tower('fire', 'Cinder', '烬火', 'Fire', '火焰',
    'Burn clustered enemies in a 44 px burst.',
    '火弹在 44 像素范围内溅射并灼烧敌群。',
    12, 0.94, 285,
    {splash: 44, burn: {dps: 5.5, duration: 2.8}, projectileSpeed: 320}),
  frost: tower('frost', 'Rime', '霜结', 'Frost', '冰霜',
    'Frost splashes slow a group to 62% speed.',
    '冰弹溅射，使敌群移速降至 62%。',
    10, 0.84, 295,
    {splash: 28, slow: {factor: 0.62, duration: 2.5}}),
  lightning: tower('lightning', 'Arc', '弧雷', 'Lightning', '闪电',
    'Chain across three targets with a chance to stun.',
    '电弧连锁三个目标，有概率麻痹。',
    13, 1.06, 320,
    {chain: 2, chainRange: 96, stun: {duration: 0.28, chance: 0.22}, projectileSpeed: 560}),
  poison: tower('poison', 'Blight', '瘴毒', 'Poison', '毒素',
    'Stack armor-piercing venom on tough targets.',
    '穿透 40% 护甲，持续叠毒瓦解重甲。',
    7, 0.76, 290,
    {poison: {dps: 4, duration: 4.5, maxStacks: 4}, armorPen: 0.4}),
  support: tower('support', 'Banner', '旌旗', 'Support', '辅助',
    'Buff nearby allies and expose priority targets.',
    '光环强化周边火力与攻速，并令高危目标易伤。',
    7, 1.0, 290,
    {aura: {range: 130, damage: 0.16, haste: 0.12}, brittle: {power: 0.14, duration: 2.4}})
};
__ff_exports["TOWERS"] = TOWERS;


function heroStats(unit, state) {
  const stats = getHeroStats(unit, state);
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('getHeroStats must return a stats object');
  return withDefaults(stats);
}

/**
 * Fresh UnitStats for the hero or a bastion turret (Lv.1-Lv.4).
 * Unknown tower ids return finite zero damage instead of throwing.
 * @param {{kind?:string,type?:string,rank?:number}|null|undefined} unit
 * @param {object} [state] Passed through to getHeroStats.
 */
function getUnitStats(unit, state) {
  if (!unit || typeof unit !== 'object') return inertStats();
  if (unit.kind === 'hero' || unit.type === 'hero') return heroStats(unit, state);
  const base = TOWERS[unit.type];
  if (!base) return inertStats();
  const stats = scaleStats(base.stats, unit.rank);
  const bonus = state?.systems?.integration?.bonuses || getProfileBonuses(state?.profileSnapshot);
  stats.damage *= 1 + (bonus.damage || 0);
  stats.interval /= 1 + (bonus.haste || 0);
  stats.critChance += bonus.critChance || 0;
  if (bonus.critKnockback) stats.critKnockback = bonus.critKnockback;
  return stats;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

deepFreeze(TOWERS);

};
__ff_factories["src/engine.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["applyProfileBonuses"] = applyProfileBonuses;
__ff_exports["prepare"] = prepare;
__ff_exports["integrationInfo"] = integrationInfo;
__ff_exports["step"] = step;
__ff_exports["advance"] = advance;
__ff_exports["simulate"] = simulate;
__ff_exports["setSpeed"] = setSpeed;
__ff_exports["takeEvents"] = takeEvents;
__ff_exports["exportRun"] = exportRun;
__ff_exports["enterEndless"] = enterEndless;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/systems/movement.js");
const __ff_m2 = __ff_load("src/systems/combat.js");
const __ff_m3 = __ff_load("src/systems/status.js");
const __ff_m4 = __ff_load("src/systems/waves.js");
const __ff_m5 = __ff_load("src/systems/drafts.js");
const __ff_m6 = __ff_load("src/systems/progression.js");
const __ff_m7 = __ff_load("src/systems/hero.js");
const __ff_m8 = __ff_load("src/state.js");
const STEP = __ff_m0["STEP"];
const clone = __ff_m0["clone"];
const emit = __ff_m0["emit"];
const random = __ff_m0["random"];
const updateMovement = __ff_m1["updateMovement"];
const damageEnemy = __ff_m2["damageEnemy"];
const killEnemy = __ff_m2["killEnemy"];
const updateCombat = __ff_m2["updateCombat"];
const updateStatuses = __ff_m3["updateStatuses"];
const updateWaves = __ff_m4["updateWaves"];
const updateDrafts = __ff_m5["updateDrafts"];
const getProfileBonuses = __ff_m6["getProfileBonuses"];
const applyHeroUpgrade = __ff_m7["applyHeroUpgrade"];
// Fixed-step integration. Speed changes how many STEP updates run per wall
// second; gameplay systems always receive STEP, never a scaled delta.









Object.defineProperty(__ff_exports, "createRun", {enumerable:true, configurable:true, get(){return __ff_load("src/state.js")["createRun"];}});
Object.defineProperty(__ff_exports, "createProfile", {enumerable:true, configurable:true, get(){return __ff_load("src/state.js")["createProfile"];}});

const ZERO_BONUSES = Object.freeze({damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0});
const STARTER_EVOLUTIONS = Object.freeze(['split_shot', 'ricochet', 'napalm', 'armored_car', 'cryo_barrage', 'orbital_beam']);

function requireFn(fn, name) {
  if (typeof fn !== 'function') throw new Error(`Fencefall core system missing: ${name}`);
  return fn;
}

requireFn(updateMovement, 'updateMovement');
requireFn(updateCombat, 'updateCombat');
requireFn(damageEnemy, 'damageEnemy');
requireFn(killEnemy, 'killEnemy');
requireFn(updateStatuses, 'updateStatuses');
requireFn(updateWaves, 'updateWaves');
requireFn(updateDrafts, 'updateDrafts');
requireFn(getProfileBonuses, 'getProfileBonuses');

function sanitizeBonuses(value) {
  const out = {...ZERO_BONUSES};
  if (!value || typeof value !== 'object') return out;
  for (const key of [
    ...Object.keys(out),
    'critKnockback', 'freeRerolls', 'thorns', 'surgePower', 'surgeCharges',
    'openingDraft', 'heroPierce', 'wallImmunity', 'shredPercent', 'statusDamage', 'superweaponHaste', 'starterWeapon'
  ]) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) out[key] = number;
  }
  if (out.fence < 0 || out.fence > 1000) out.fence = 0;
  return out;
}

function applyProfileBonuses(state, bonuses) {
  if (!state || state.initialized) return state;
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  const clean = sanitizeBonuses(bonuses);
  state.systems.integration = {bonuses: clean};
  if (clean.fence > 0 && state.fence && Number.isFinite(state.fence.maxHp) && Number.isFinite(state.fence.hp)) {
    state.fence.maxHp += clean.fence;
    state.fence.hp = Math.min(state.fence.maxHp, state.fence.hp + clean.fence);
  }
  state.rerollsLeft = Math.min(20, 2 + Math.max(0, Math.floor(clean.freeRerolls || 0)));
  state.surge.charges = state.surge.maxCharges = 1 + Math.max(0, Math.floor(clean.surgeCharges || 0));
  state.wallImmunity = Math.max(0, Math.floor(clean.wallImmunity || 0));
  state.openingDraftPending = Math.max(0, Math.floor(clean.openingDraft || 0));
  if ((clean.starterWeapon || 0) > 0) {
    const pick = STARTER_EVOLUTIONS[Math.floor(random(state) * STARTER_EVOLUTIONS.length)];
    applyHeroUpgrade(state, pick);
  }
  state.initialized = true;
  return state;
}

function prepare(state) {
  if (!state || state.initialized) return state;
  return applyProfileBonuses(state, getProfileBonuses(state.profileSnapshot));
}

function integrationInfo() {
  return {
    contract: 3,
    present: {movement: true, combat: true, status: true, waves: true, drafts: true, progression: true},
    missing: [],
    failed: {},
  };
}

function halted(state) {
  return !state || state.phase !== 'playing' || state.paused === true || state.hiddenPaused === true;
}

function cleanup(state) {
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  for (const enemy of [...state.enemies]) {
    if (!enemy || enemy.dead || !(typeof enemy.hp === 'number') || enemy.hp > 0) continue;
    killEnemy(state, enemy, null);
  }
  state.enemies = state.enemies.filter((enemy) => enemy && enemy.dead !== true && typeof enemy.hp === 'number' && enemy.hp > 0);
  state.projectiles = state.projectiles.filter((projectile) => projectile && !(typeof projectile.life === 'number' && projectile.life <= 0));
}

function resolveOutcome(state) {
  const hp = state.fence && state.fence.hp;
  if (state.phase === 'playing' && typeof hp === 'number' && hp <= 0) {
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time: state.time, wave: state.wave, kills: state.kills});
    return;
  }
  const alive = Array.isArray(state.enemies) && state.enemies.some((enemy) => enemy && enemy.dead !== true && enemy.hp > 0);
  const queue = state.director?.queue;
  const queueEmpty = !Array.isArray(queue) || queue.length === 0;
  if (state.phase === 'playing' && state.endless !== true && state.director?.done === true && queueEmpty && !alive) {
    state.phase = 'victory';
    emit(state, 'victory', {time: state.time, wave: state.wave, kills: state.kills});
  }
}

function stepBody(state) {
  if (!Array.isArray(state.events)) state.events = [];
  if (state.phase === 'playing' && typeof state.fence?.hp === 'number' && state.fence.hp <= 0) {
    state.time += STEP;
    state.tick += 1;
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time: state.time, wave: state.wave, kills: state.kills});
    return;
  }
  state.time += STEP;
  state.tick += 1;
  updateWaves(state, STEP);
  if (halted(state)) return;
  updateMovement(state, STEP);
  if (halted(state)) return;
  updateStatuses(state, STEP, damageEnemy);
  if (halted(state)) return;
  updateCombat(state, STEP);
  cleanup(state);
  resolveOutcome(state);
  if (!halted(state)) updateDrafts(state);
}

function step(state) {
  if (!state) return state;
  prepare(state);
  if (halted(state)) return state;
  stepBody(state);
  return state;
}

const SPEEDS = Object.freeze([1, 1.5, 3, 10]);

function advance(state, realDt) {
  if (!state || !Number.isFinite(realDt) || realDt < 0) return state;
  prepare(state);
  if (halted(state)) {
    state.accumulator = 0;
    return state;
  }
  const speed = SPEEDS.includes(state.speed) ? state.speed : 1;
  state.accumulator += Math.min(realDt, 0.25) * speed;
  let count = 0;
  // 0.25s of wall time at 10× is 150 shared steps, so one slice can finish.
  while (state.accumulator + 1e-10 >= STEP && count++ < 150) {
    state.accumulator -= STEP;
    stepBody(state);
    if (halted(state)) {
      state.accumulator = 0;
      break;
    }
  }
  if (state.accumulator < 1e-8) state.accumulator = 0;
  return state;
}

// Headless callers advance simulation time directly. advance() remains wall-capped.
function simulate(state, seconds) {
  if (!state) return state;
  prepare(state);
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  const steps = Math.min(200000, Math.floor(seconds * 60 + 1e-9));
  for (let index = 0; index < steps; index += 1) {
    if (halted(state)) break;
    stepBody(state);
  }
  return state;
}

function setSpeed(state, speed) {
  if (state && SPEEDS.includes(speed)) state.speed = speed;
}

function takeEvents(state) {
  if (!state || !Array.isArray(state.events)) return [];
  return state.events.splice(0);
}

function exportRun(state) {
  const out = clone(state);
  out.events = [];
  out.accumulator = 0;
  return out;
}

function enterEndless(state) {
  if (!state || typeof state !== 'object') return {ok: false, reason: 'bad-phase'};
  if (state.endless === true) return {ok: false, reason: 'already'};
  if (state.phase !== 'victory') return {ok: false, reason: 'bad-phase'};
  state.endless = true;
  state.phase = 'playing';
  state.paused = false;
  return {ok: true};
}

};
__ff_factories["src/i18n.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["normalizeLanguage"] = normalizeLanguage;
__ff_exports["defaultLanguage"] = defaultLanguage;
__ff_exports["formatNumber"] = formatNumber;
__ff_exports["t"] = t;
__ff_exports["localize"] = localize;
__ff_exports["formatDuration"] = formatDuration;
__ff_exports["resultLabel"] = resultLabel;
__ff_exports["defeatAdvice"] = defeatAdvice;
__ff_exports["armoryNextLine"] = armoryNextLine;
__ff_exports["resultStory"] = resultStory;
/**
 * Fencefall / 最后一道防线 — player-facing strings.
 *
 * Language codes are only "en" and "zh" (Simplified Chinese). Catalog names and
 * descriptions (towers, enemies, recipes, equipment, hero upgrades, difficulty
 * names) stay on those objects as {en, zh}. Pass them through localize().
 * This table is interface chrome, tutorials, stat labels, and action reasons.
 *
 * Glossary: the fence is 栅栏. A draft is 整备. The three-choice prompt is 三选一.
 * Rank is 阶; an upgrade level is 级. Board slots are 格子, and a payout is 报酬.
 *
 *   t(language, key, vars)          module lookup. Language is the first argument.
 *   api.t(key, vars)                controller wrapper; do not swap these call styles.
 *   localize(value, language)       pick a bilingual content string.
 *   formatNumber(value, language)   grouped number, or "—" when the value is not finite.
 *   formatDuration(seconds, language)  fight clock, e.g. 12m 05s / 12分05秒.
 *   defaultLanguage(locale?)        zh* → zh, otherwise en. Reads navigator only when called.
 *   normalizeLanguage(language)     collapse any locale tag to "en" or "zh".
 *
 * Unknown keys return the key string, never undefined. Placeholders are {token}.
 * A missing placeholder is left as written. Numeric vars are formatted. Vars that
 * are {en, zh} objects are localized. Percent text should be passed as a string
 * such as "5%"; a raw fraction is only grouped, not converted to a percent.
 *
 * Action toasts can call t(language, reason). Prefer these reason codes:
 * heroProtected, invalidMerge, notPlanning, sameSlot, invalidSlot, emptySlot,
 * reasonEmpty, rankMismatch, noRecipe, maxRank, hybridMix, missingUnit, occupied,
 * replaceRequired, invalidChoice, noDraft, notPlacing, noPending, fullBoard,
 * insufficientCurrency, maxLevel, alreadyOwned, notOwned, alreadyEquipped,
 * wrongSlot, unknownItem, unknownUpgrade, alreadySettled, freshAbandon,
 * notFinished, corruptSave, invalidSave, versionMismatch, tooLarge,
 * quotaExceeded, storageUnavailable, importEmpty.
 */
const ROWS = [
  ['invalid_mode', 'Unknown targeting mode', '无效的索敌模式'],
  ['multishot', 'Multishot', '齐射'], ['fence_focus', 'Wall focus', '城墙集火'], ['reveal', 'Reveal', '显隐'],
  ['badge.execute', 'Execute', '斩杀'], ['badge.crit', 'Crit', '暴击'], ['badge.projectile', 'Projectile', '投射'],
  ['badge.speed', 'Speed', '攻速'], ['badge.critDamage', 'Crit×', '暴伤'],
  ['badge.split', 'Split', '分裂'], ['badge.chain', 'EM', '电磁'], ['badge.napalm', 'Napalm', '火海'],
  ['badge.armored_car', 'Tank', '装甲车'], ['badge.cryo_barrage', 'Glacial', '冰柱'], ['badge.orbital_beam', 'Laser', '激光'],
  ['split_shot', 'Split Shrapnel', '子母分裂弹'],
  ['ricochet', 'EM Chain Strike', '电磁连锁雷'],
  ['napalm', 'Napalm Fire Sea', '燃油弹火海'],
  ['armored_car', 'Armored Sweeper', '重装装甲车'],
  ['cryo_barrage', 'Glacial Barrage', '干冰齐射柱'],
  ['orbital_beam', 'Orbital Laser', '高能激光柱'],
  ['overclock', 'Firepower Overclock', '火力超频'],
  ['starterPackTitle', 'Starter Supply Pack', '新手补给包'],
  ['starterPackDesc', 'Free +180 Coins + Opening Airdrop Gem (instant 3-of-1 upgrade at the start of every stage)!', '免费领 180 金币 +【开局空投宝石】（每关开局即送免费三选一），爽快起步！'],
  ['claimStarterPack', 'Claim +180 & Free Gem', '免费领取（+180金币 +开局宝石）'],
  ['starterClaimed', 'Starter Pack Claimed · Opening Gem Equipped', '新手补给已领取 · 开局空投宝石已装备'],
  ['gems', 'Core Gems', '核心宝石'],
  ['gemsIntro', 'Equip up to 3 Core Gems for wall shields, opening drops, pierce & crit shred.', '最多镶嵌 3 颗核心宝石，解锁城墙免伤、开局三选一、子弹穿透与暴击斩血。'],
  ['gemSlots', 'Equipped Slots', '已镶嵌槽位'],
  ['gemSlotEmpty', 'Empty', '空槽'],
  ['gemTierEpic', 'Epic', '史诗'],
  ['gemTierLegend', 'Legend', '传说'],
  ['openingDraft', 'Opening Airdrop', '开局免费选卡'],
  ['wallImmunity', 'Wall Shield', '城墙免伤'],
  ['heroPierce', 'Bullet Pierce', '子弹穿透'],
  ['statusDamage', 'Elemental Surge', '异常增伤'],
  ['shredPercent', 'Crit Max-HP Shred', '暴击斩血'],
  ['superweaponHaste', 'Skill Cooldown', '技能冷却'],
  ['starterWeapon', 'Starter Auto Skill', '开局赠送技能'],
  ['aegisChip', 'Shield', '免伤'],
  ['openingDropTitle', 'Opening Airdrop · Pick 1 of 3', '开局空投 · 免费三选一'],
  ['arsenalNapalm', 'Napalm', '火海'],
  ['arsenalCar', 'Sweeper', '装甲车'],
  ['arsenalCryo', 'Glacial', '干冰'],
  ['arsenalBeam', 'Laser', '激光'],
  ['arsenalEm', 'EM', '天雷'],
  ['tabBattle', 'Battle', '出击'],
  ['tabArmory', 'Armory', '军械'],
  ['tabCodex', 'Codex', '图鉴'],
  ['tabSettings', 'Settings', '设置'],
  ['armoryTabGems', 'Gems', '核心宝石'],
  ['armoryTabGear', 'Gear', '武装装备'],
  ['armoryTabUpgrades', 'Upgrades', '永久强化'],
  ['tagSuperweapon', 'Auto Skill', '自动技能'],
  ['tagHero', 'Gun Mod', '枪械强化'],
  ['tagNewTurret', 'New Turret', '新炮塔'],
  ['tagUpgradeTurret', 'Upgrade Lv.{from}→{to}', '升级 Lv.{from}→{to}'],
  ['deployNow', 'Start Defense', '开始防线'],
  ['swapHint', 'Tap below to switch target priority', '点击下方按钮切换优先攻击目标'],
  ['heroFixed', 'Gunner holds the center wall position.', '防线枪手固定驻守城墙正中。'],
  ['gunnerTitle', 'Wall Gunner', '防线枪手'],
  ['teamDamage', 'Gun damage', '枪械伤害'],
  ['teamHaste', 'Fire rate', '枪械攻速'],
  ['teamCrit', 'Crit chance', '暴击率'],
  ['freeRerolls', 'Extra rerolls', '额外刷新'],
  ['critKnockback', 'Crit knockback', '暴击击退'],
  ['surgeCharges', 'Shockwave charges', '冲击波充能'],
  ['surgePower', 'Shockwave power', '冲击波威力'],
  ['thorns', 'Wall thorns', '城墙反伤'],
  ['economy', 'War Chest', '战备补给'],
  ['stageLabel', 'Stage {n}', '第 {n} 关'],
  ['stageShort', 'S{n}', '第{n}关'],
  ['playStage', 'Start · Stage {n}', '开始游戏 · 第 {n} 关'],
  ['nextStageBtn', 'Next · Stage {n}', '下一关 · 第 {n} 关'],
  ['retryStage', 'Retry · Stage {n}', '再战第 {n} 关'],
  ['stageLocked', 'Clear Stage {prev} to unlock', '通关第 {prev} 关解锁'],
  ['allStages', 'All 20 Stages', '全部 20 关'],
  ['hideStages', 'Collapse', '收起关卡'],
  ['firstClearBonus', 'First Clear +{amount}', '首通奖励 +{amount}'],
  ['firstClearClaimed', 'First Clear Claimed', '已领首通'],
  ['featuredEnemies', 'Stage Threats', '本关僵尸'],
  ['bossBadge', 'BOSS', '首领关'],
  ['clearedOfTotal', 'Cleared {cleared}/{total}', '已通关 {cleared}/{total}'],
  ['campaignCleared', 'All 20 Stages Cleared!', '前 20 关全部通关！'],
  ['perfectWall', 'Perfect Defense ★★★', '完美守卫 ★★★'],
  ['prevStageAria', 'Previous stage', '上一关'],
  ['nextStageAria', 'Next stage', '下一关'],

  ['systems', 'Systems online', '已接入系统'],
  ['not-planning', 'Gunner stays in the center position', '枪手固定驻守城墙正中'],
  ['no-run', 'Start a stage first', '请先开始一关'],
  ['bad-slot', 'Tap the Gunner at center wall', '请点击城墙正中的枪手'],
  ['bad-choice', 'Pick one of the three upgrades', '请选择三张强化卡中的一张'],
  ['nextStats', 'After this choice', '选择之后'],
  ['draftWaiting', 'Tap any card to power up right away.', '点击任意一张强化卡，立即生效。'],
  ['cancelPick', 'Back', '返回'],
  ['attacks', 'Attacks', '攻击'],
  ['reduction', 'slow', '减速'],
  ['kindUpgrade', 'Gun Mod', '枪械强化'],
  ['slotLabel', 'Position', '位置'],
  ['hero_protected', 'The Gunner stays at the center wall.', '防线枪手始终驻守城墙正中。'],
  ['same', 'Gunner is anchored in the center.', '枪手固定在正中位置。'],
  ['same_slot', 'Gunner is anchored in the center.', '枪手固定在正中位置。'],
  ['empty', 'No unit there.', '此处没有单位。'],
  ['not_planning', 'Gunner holds the center wall position.', '枪手固定驻守城墙正中。'],
  ['phase', 'Tap the Gunner anytime to check stats or switch target priority.', '战斗中随时点击枪手可查看属性并切换优先攻击目标。'],
  ['max_rank', 'Already at max level.', '已达到满级。'],
  ['capped', 'Already at max level.', '该强化已满级。'],
  ['frost', 'Chills and slows zombies in range.', '减速范围内的僵尸。'],
  ['lightning', 'Chains lightning strikes between zombies.', '在僵尸之间弹射连锁雷击。'],
  ['execute', 'Deals heavier damage to low-HP zombies.', '对残血僵尸造成额外斩杀伤害。'],
  ['surge', 'Wave', '冲击波'],
  ['targeting', 'Target', '优先攻击'],
  ['reroll', 'Refresh', '刷新'],
  ['free', 'Free', '免费'],
  ['foremost', 'Closest', '最前'],
  ['priority', 'Specials', '高危'],
  ['strongest', 'Tankiest', '最肉'],
  ['weakest', 'Lowest HP', '残血'],
  ['selectMission', 'Stage Select', '选择关卡'],
  ['corpseExplode', 'Blast on kill', '击杀爆炸'],
  ['thermalShock', 'Thermal blast', '冰火爆破'],
  ['armorPen', 'Armor pierce', '无视护甲'],
  ['knockback', 'Knockback', '击退'],
  ['poisonDetonate', 'Acid burst', '酸液反应'],
  ['cloud', 'Fire sea', '火海'],
  ['legacyRunReset', 'Profile migrated! Start a fresh v5 stage.', '档案已自动继承，请开启全新升级的对局！'],

  // Brand and navigation
  ['title', 'Fencefall', '最后一道防线'],
  ['titleLockup', 'Fencefall · 最后一道防线', 'Fencefall · 最后一道防线'],
  ['subtitle', 'Solo Gunner · Auto-Skill Defense', '单枪死守 · 自动技能割草'],
  ['tagline', 'Hold the center wall. Upgrade your gun and unleash full-screen auto skills.', '枪手自动瞄准开火，升级三选一解锁满屏枪械强化与自动技能。'],
  ['play', 'Play', '出击'],
  ['playHint', 'Start a new stage', '开始挑战关卡'],
  ['continue', 'Continue', '继续战斗'],
  ['continueHint', 'Resume the saved fight', '继续已保存的战斗'],
  ['restart', 'Restart', '重开'],
  ['back', 'Back', '返回'],
  ['backToBattle', 'Back to battle', '返回战斗'],
  ['close', 'Close', '关闭'],
  ['confirm', 'Confirm', '确认'],
  ['cancel', 'Cancel', '取消'],
  ['ok', 'OK', '确定'],
  ['yes', 'Yes', '是'],
  ['no', 'No', '否'],
  ['menu', 'Menu', '菜单'],
  ['battle', 'Battle', '战斗'],
  ['newRun', 'New stage', '新关卡'],
  ['abandon', 'Abandon', '放弃'],
  ['loading', 'Loading', '加载中'],
  ['loadingGame', 'Fortifying the wall…', '正在架设城墙防线…'],
  ['save', 'Save', '保存'],
  ['saved', 'Saved', '已保存'],
  ['version', 'Version', '版本'],
  ['versionValue', 'Version {version}', '版本 {version}'],
  ['seed', 'Seed', '种子'],
  ['seedValue', 'Seed {seed}', '种子 {seed}'],
  ['randomSeed', 'Random seed', '随机种子'],
  ['copy', 'Copy', '复制'],
  ['copied', 'Copied', '已复制'],
  ['and', 'and', '和'],
  ['or', 'or', '或'],
  ['all', 'All', '全部'],
  ['search', 'Search', '搜索'],
  ['clear', 'Clear', '清除'],
  ['none', 'None', '无'],
  ['unknown', 'Unknown', '未知'],
  ['choose', 'Choose', '选定'],

  // HUD
  ['pause', 'Pause', '暂停'],
  ['resume', 'Resume', '继续'],
  ['paused', 'Paused', '已暂停'],
  ['pausedHidden', 'Paused while page hidden', '切出页面已自动暂停'],
  ['pausedHiddenBody', 'Tap Resume to jump right back into the fight.', '点击继续即可无缝回到战斗。'],
  ['planning', 'Level Up', '升级选卡'],
  ['planningHint', 'Tap the Gunner to inspect gun stats or switch target priority.', '点击城墙正中的枪手可查看枪械属性或切换优先攻击目标。'],
  ['playing', 'Fighting', '战斗中'],
  ['speed', 'Speed', '倍速'],
  ['speed1', '1×', '1×'],
  ['speed15', '1.5×', '1.5×'],
  ['speed3', '3×', '3×'],
  ['speed10', '10×', '10×'],
  ['speedValue', '{value}×', '{value}×'],
  ['speedHint', '1×, 1.5×, 3×, and 10× share the exact same simulation clock.', '1×、1.5×、3×、10× 共用同一套模拟时钟，奖励一致。'],
  ['speedWhilePaused', 'Speed applies when the fight resumes.', '恢复战斗后立即生效。'],
  ['fence', 'Wall', '城墙'],
  ['fenceHp', 'Wall {current}/{max}', '城墙 {current}/{max}'],
  ['fenceBonus', 'Wall HP', '城墙血量'],
  ['fenceDanger', 'Wall Critical', '城墙危急'],
  ['fenceSafe', 'Wall Holding', '城墙稳固'],
  ['wave', 'Wave', '波次'],
  ['waveNumber', 'Wave {wave}', '第 {wave} 波'],
  ['waveIncoming', 'Incoming', '来袭'],
  ['bossWarning', 'Boss Incoming', '首领来袭'],
  ['finalWave', 'Final Wave', '最终波'],
  ['nextWave', 'Next Wave', '下一波'],
  ['wavesSpawned', 'Final horde deployed', '全部敌潮已出动'],
  ['wavesStarted', 'Waves started', '已迎战波次'],
  ['clearRemaining', 'Clear remaining zombies to win', '清空剩余尸潮即获胜'],
  ['xp', 'XP', '经验'],
  ['experience', 'Experience', '经验'],
  ['xpProgress', 'XP {current}/{next}', '经验 {current}/{next}'],
  ['nextDraft', 'Next upgrade', '下次三选一'],
  ['draftLevel', 'Lv.{level}', 'Lv.{level}'],
  ['kills', 'Kills', '击杀'],
  ['killsValue', 'Kills {count}', '击杀 {count}'],
  ['kill', 'Kill', '击杀'],
  ['time', 'Time', '耗时'],
  ['activeTime', 'Battle time', '战斗耗时'],
  ['timeHint', 'Only live battle time counts.', '仅统计实战时间。'],
  ['enemy', 'Zombie', '僵尸'],
  ['enemies', 'Zombies', '僵尸图鉴'],
  ['enemyCount', 'Zombies {count}', '僵尸 {count}'],
  ['boss', 'Boss', '首领'],
  ['shot', 'Shot', '射击'],
  ['hit', 'Hit', '命中'],
  ['fence_hit', 'Wall hit', '城墙受击'],
  ['ui', 'Notice', '提示'],

  // Difficulty
  ['difficulty', 'Difficulty', '难度'],
  ['easy', 'Easy', '轻松'],
  ['normal', 'Normal', '标准'],
  ['hard', 'Hard', '困难'],
  ['nightmare', 'Nightmare', '噩梦'],
  ['rewardMultiplier', 'Reward multiplier', '奖励倍率'],
  ['rewardMultiplierValue', '×{value}', '×{value}'],
  ['rewardLine', 'Reward ×{value}', '奖励 ×{value}'],
  ['timesValue', '×{value}', '×{value}'],
  ['percentValue', '{value}%', '{value}%'],
  ['higherDifficultyPays', 'Higher difficulties pay more.', '难度越高，奖励越多。'],
  ['difficultyHint', 'Harder fights pay a higher multiplier.', '战斗越难，奖励倍率越高。'],
  ['difficultyEasyHint', 'Softer zombies and a baseline reward.', '僵尸更温和，奖励为基准。'],
  ['difficultyNormalHint', 'The intended fight, with a higher reward.', '标准强度，奖励更高。'],
  ['difficultyHardHint', 'Stronger zombies and a larger reward.', '僵尸更强，奖励更大。'],
  ['difficultyNightmareHint', 'The hardest fight and the largest reward.', '极限强度，奖励最高。'],
  ['startDifficulty', 'Play on {difficulty}', '以{difficulty}开始'],

  // Settings and language. 中 / EN are the persistent switch labels.
  ['settings', 'Settings', '设置'],
  ['language', 'Language', '语言'],
  ['languageZh', '中文', '中文'],
  ['languageEn', 'English', 'English'],
  ['langZh', '中', '中'],
  ['langEn', 'EN', 'EN'],
  ['languageCurrent', 'Language: {language}', '语言：{language}'],
  ['languageHint', 'You can change language during a run. Progress stays.', '战斗中可随时切换语言，进度会保留。'],
  ['sound', 'Sound', '声音'],
  ['soundOn', 'Sound on', '声音开'],
  ['soundOff', 'Sound off', '声音关'],
  ['soundHint', 'Sound starts off. The first tap turns on audio for this browser.', '声音默认关闭，首次点击开启音效。'],
  ['reducedMotion', 'Reduced motion', '减少动效'],
  ['reducedMotionOn', 'Reduced motion on', '减少动效：开'],
  ['reducedMotionOff', 'Reduced motion off', '减少动效：关'],
  ['reducedMotionHint', 'Cuts extra flashes, shakes, and motion.', '减少额外的闪光、震动和粒子。'],

  // Draft & upgrades
  ['draft', 'Level Up', '升级选卡'],
  ['draftTitle', 'Level Up · Pick 1 of 3', '升级强化 · 三选一'],
  ['chooseOneOfThree', 'Level Up · Pick 1 of 3', '升级强化 · 三选一'],
  ['draftOnField', 'Active', '已激活'],
  ['draftNewType', 'New', '新解锁'],
  ['chooseUpgrade', 'Choose an upgrade', '选择强化'],
  ['chooseSlot', 'Center Wall', '城墙正中'],
  ['chooseTower', 'Add {name}', '加入{name}'],
  ['chooseHeroUpgrade', 'Gunner: {name}', '枪手：{name}'],
  ['chooseReplace', 'Replace with {name}', '替换为{name}'],
  ['immediateEffect', 'Applies right away', '立即生效'],
  ['cancelPlacement', 'Back', '返回'],
  ['placementCanceled', 'Canceled.', '已取消。'],
  ['placing', 'Ready', '准备中'],
  ['placingTitle', 'Center Wall', '城墙正中'],
  ['placingHint', 'The Gunner holds the center wall position.', '防线枪手固定驻守城墙正中。'],
  ['tapToPlace', 'Center Wall', '城墙正中'],
  ['tapToMove', 'Gunner stays centered', '枪手固定正中'],
  ['fullBoard', 'Maxed out', '已满'],
  ['fullBoardHint', 'Pick Gun Mods or Auto Skills to keep powering up.', '继续选择枪械强化与自动技能提升火力。'],
  ['emptySlot', 'Empty', '空位'],
  ['select', 'Select', '选择'],
  ['details', 'Details', '详情'],
  ['hideDetails', 'Hide details', '收起详情'],
  ['selected', 'Selected', '已选中'],
  ['selectedUnit', 'Wall Gunner', '防线枪手'],
  ['selectToInspect', 'Tap the Gunner to view stats', '点击枪手查看属性'],
  ['noSelection', 'Nothing selected', '未选择'],
  ['clearSelection', 'Close', '关闭'],
  ['place', 'Deploy', '部署'],
  ['move', 'Move', '移动'],
  ['moveHere', 'Move here', '移到这里'],
  ['swap', 'Swap', '互换'],
  ['moved', 'Moved', '已移动'],
  ['swapped', 'Swapped', '已互换'],
  ['frontRow', 'Wall Line', '城墙防线'],
  ['rearRow', 'Rear', '后排'],
  ['slotNumber', 'Position {index}', '位置 {index}'],
  ['sourceSlot', 'Source', '来源'],
  ['targetSlot', 'Target', '目标'],
  ['occupied', 'Occupied', '已有单位'],
  ['slotOccupied', 'Occupied', '已有单位'],
  ['tower', 'Turret', '炮塔'],
  ['towers', 'Turrets', '炮塔'],
  ['hero', 'Wall Gunner', '防线枪手'],
  ['hybrid', 'Hybrid', '混合'],
  ['hero_upgrade', 'Gun Mod', '枪械强化'],
  ['heroUpgrades', 'Gun Mods & Auto Skills', '枪械与技能'],
  ['runUpgrades', 'Active Upgrades', '本局强化'],
  ['nonMergeable', 'Solo Gunner', '单枪防线'],
  ['autoAttack', 'Fires automatically', '自动瞄准开火'],
  ['noActiveAbility', 'Auto Skills trigger on cooldown', '自动技能冷却即释放'],
  ['notControlled', 'Auto-aimed', '全自动瞄准'],
  ['replace', 'Replace', '替换'],
  ['replaceConfirm', 'Replace?', '替换？'],
  ['replaceConfirmBody', 'The Gunner always holds the center wall.', '枪手始终驻守城墙正中。'],
  ['replaceKeep', 'Keep', '保留'],
  ['unknownUnit', 'Unknown unit', '未知单位'],
  ['unknownEnemy', 'Unknown zombie', '未知僵尸'],

  // Legacy reason keys (kept for safe error lookup)
  ['merge', 'Merge', '合成'],
  ['mergePreview', 'Preview', '预览'],
  ['mergeConfirm', 'Confirm', '确认'],
  ['mergeCancel', 'Cancel', '取消'],
  ['mergeResult', 'Result', '结果'],
  ['heroProtected', 'The Gunner stays on the center wall.', '枪手始终驻守城墙正中。'],
  ['invalidMerge', 'Unavailable', '不可用'],
  ['sameTypeResult', 'Lv.{rank}', 'Lv.{rank}'],
  ['hybridResult', '{name}', '{name}'],
  ['ingredientPair', '{left} + {right}', '{left} + {right}'],
  ['resultRank', 'Lv.{rank}', 'Lv.{rank}'],
  ['previewSafe', 'Preview only.', '仅预览。'],
  ['confirmToMerge', 'Confirm.', '确认。'],
  ['unitsPreserved', 'Kept.', '已保留。'],
  ['consumesSource', 'Consumed.', '消耗。'],
  ['recipes', 'Recipes', '配方'],
  ['ingredients', 'Ingredients', '材料'],
  ['effect', 'Effect', '效果'],
  ['baseTowers', 'Base', '基础'],
  ['hybrids', 'Hybrid', '混合'],
  ['rank', 'Lv', '级'],
  ['rankValue', 'Lv.{rank}', 'Lv.{rank}'],
  ['rankCap', 'Max Lv.4', '最高 4 级'],
  ['equalRank', 'Same level', '同级'],
  ['maxRank', 'Already max level', '已达满级'],
  ['notPlanning', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['planningRequired', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['cannotMoveDuringFight', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['sameSlot', 'Gunner stays in the center', '枪手固定驻守正中'],
  ['invalidSlot', 'Invalid position', '无效位置'],
  ['missingUnit', 'No unit', '没有单位'],
  ['reasonEmpty', 'Empty', '空位'],
  ['emptySource', 'Empty', '空位'],
  ['emptyTarget', 'Empty', '空位'],
  ['rankMismatch', 'Level mismatch', '等级不符'],
  ['noRecipe', 'Unavailable', '不可用'],
  ['hybridMix', 'Unavailable', '不可用'],
  ['hybridMismatch', 'Unavailable', '不可用'],
  ['kindMismatch', 'Unavailable', '不可用'],
  ['incompatible', 'Unavailable', '不可用'],
  ['heroSlot', 'Gunner position', '枪手位置'],
  ['replaceRequired', 'Unavailable', '不可用'],
  ['invalidChoice', 'That card is not available', '该强化卡不可用'],
  ['noDraft', 'No active upgrade pick', '当前没有升级选卡'],
  ['notPlacing', 'Nothing to place', '无需放置'],
  ['noPending', 'Nothing pending', '无待放置项'],

  // Combat stats
  ['damage', 'Damage', '伤害'],
  ['range', 'Range', '射程'],
  ['attackSpeed', 'Fire rate', '攻速'],
  ['crit', 'Crit', '暴击'],
  ['critChance', 'Crit chance', '暴击率'],
  ['critMultiplier', 'Crit damage', '暴击伤害'],
  ['interval', 'Interval', '间隔'],
  ['projectileSpeed', 'Bullet speed', '弹速'],
  ['splash', 'Blast', '溅射'],
  ['chain', 'Chain', '弹射'],
  ['chainRange', 'Chain range', '弹射范围'],
  ['pierce', 'Pierce', '穿透'],
  ['burn', 'Burn', '燃烧'],
  ['poison', 'Poison', '中毒'],
  ['slow', 'Slow', '减速'],
  ['stun', 'Stun', '麻痹'],
  ['brittle', 'Brittle', '易伤'],
  ['aura', 'Aura', '光环'],
  ['support', 'Support', '支援'],
  ['haste', 'Fire rate', '攻速'],
  ['vitality', 'Wall HP', '城墙血量'],
  ['status', 'Status', '状态'],
  ['statuses', 'Statuses', '状态'],
  ['duration', 'Duration', '持续'],
  ['stacks', 'Stacks', '层数'],
  ['dps', 'Damage per second', '每秒伤害'],
  ['factor', 'Speed factor', '移速系数'],
  ['mechanics', 'Effects', '特效'],
  ['statDamage', 'Damage {value}', '伤害 {value}'],
  ['statRange', 'Range {value}', '射程 {value}'],
  ['statInterval', 'Every {value}s', '每 {value} 秒'],
  ['statCrit', 'Crit {chance} ×{multiplier}', '暴击 {chance} ×{multiplier}'],
  ['statProjectile', 'Bullet speed {value}', '弹速 {value}'],
  ['statSplash', 'Blast {value}', '溅射 {value}'],
  ['statChain', 'Chain {count}', '弹射 {count}'],
  ['statPierce', 'Pierce {count}', '穿透 {count}'],
  ['slowFactor', 'Moves at {value}', '移速降至 {value}'],
  ['auraDamage', 'Damage bonus', '伤害加成'],
  ['auraHaste', 'Fire rate bonus', '攻速加成'],
  ['auraRange', 'Aura range', '光环范围'],

  // Armory and permanent meta
  ['armory', 'Armory', '军械库'],
  ['codex', 'Codex', '图鉴'],
  ['currency', 'Coins', '金币'],
  ['currencyAmount', 'Coins {amount}', '金币 {amount}'],
  ['buy', 'Buy', '购买'],
  ['equip', 'Equip', '装备'],
  ['equipped', 'Equipped', '已装备'],
  ['equippedBonus', 'Equipped bonus', '已装备加成'],
  ['owned', 'Owned', '已拥有'],
  ['upgrade', 'Upgrade', '升级'],
  ['upgraded', 'Upgraded', '已升级'],
  ['purchased', 'Purchased', '已购买'],
  ['cost', 'Cost', '花费'],
  ['costValue', 'Cost {cost}', '花费 {cost}'],
  ['level', 'Level', '等级'],
  ['levelValue', 'Lv.{level}', 'Lv.{level}'],
  ['levelOf', 'Lv.{level}/{max}', 'Lv.{level}/{max}'],
  ['maxLevel', 'Max level', '已满级'],
  ['maxed', 'Maxed', '已满级'],
  ['levelCap', 'Max level', '等级上限'],
  ['insufficientCurrency', 'Not enough coins', '金币不足'],
  ['locked', 'Locked', '未解锁'],
  ['weapon', 'Weapon', '枪械'],
  ['charm', 'Charm', '护符'],
  ['armor', 'Armor', '城墙装甲'],
  ['equipment', 'Gear', '武装装备'],
  ['permanent', 'Permanent upgrades', '永久强化'],
  ['permanentUpgrades', 'Permanent upgrades', '永久强化'],
  ['headStart', 'Head start', '开局优势'],
  ['bonus', 'Bonus', '加成'],
  ['currentBonuses', 'Current bonuses', '当前加成'],
  ['bonusDamage', 'Damage +{value}', '伤害 +{value}'],
  ['bonusHaste', 'Fire rate +{value}', '攻速 +{value}'],
  ['bonusRange', 'Range +{value}', '射程 +{value}'],
  ['bonusCritChance', 'Crit chance +{value}', '暴击率 +{value}'],
  ['bonusFence', 'Wall +{value}', '城墙 +{value}'],
  ['bonusReward', 'Coins +{value}', '金币 +{value}'],
  ['noneEquipped', 'Nothing equipped', '未装备'],
  ['unequip', 'Unequip', '卸下'],
  ['noEquipment', 'No gear yet', '还没有武装装备'],
  ['noUpgrades', 'No permanent upgrades yet', '还没有永久强化'],
  ['notOwned', 'Not owned yet', '尚未拥有'],
  ['alreadyOwned', 'Already owned', '已经拥有'],
  ['alreadyEquipped', 'Already equipped', '已经装备'],
  ['wrongSlot', 'Wrong gear slot', '装备部位不符'],
  ['unknownItem', 'Unknown item', '未知物品'],
  ['unknownUpgrade', 'Unknown upgrade', '未知强化'],
  ['profile', 'Profile', '档案'],
  ['best', 'Best runs', '最佳记录'],
  ['noBest', 'No settled runs yet', '还没有结算记录'],
  ['bestWave', 'Best wave', '最高波次'],
  ['bestKills', 'Best kills', '最高击杀'],
  ['bestLine', 'Best · wave {wave} · {kills} kills', '最佳 · 第 {wave} 波 · 击杀 {kills}'],
  ['runsSettled', 'Completed runs', '已结算局数'],
  ['newRecord', 'New record', '新纪录'],

  // Results
  ['results', 'Results', '战斗结算'],
  ['victory', 'Victory', '防线守住！'],
  ['defeat', 'Defeat', '城墙失守'],
  ['abandoned', 'Abandoned', '已撤离'],
  ['runComplete', 'Stage complete', '本关结束'],
  ['resultSummary', '{result} · {difficulty}', '{result} · {difficulty}'],
  ['victoryBody', 'The wall held! Your coin reward has been saved.', '城墙守住了！通关金币已入账。'],
  ['defeatBody', 'The wall fell, but you still earned coins for your progress.', '城墙倒下了，但本局进度仍会发放金币奖励。'],
  ['defeatNext', 'Visit the Armory to equip Core Gems or upgrade firepower before retrying.', '前往军械库镶嵌核心宝石或升级枪械火力，再来挑战更轻松！'],
  ['defeatNextEasy', 'Armory bonuses apply right away on your next attempt.', '军械库强化会在下一关立即生效。'],
  ['defeatBuy', 'You can buy {name} for {cost}. It applies on your next run.', '可以购买【{name}】（花费 {cost} 金币），下一关生效。'],
  ['defeatEquip', 'Equip {name} before your next run.', '下一关开始前记得装备【{name}】。'],
  ['defeatShort', 'You need {short} more coins for {name} (costs {cost}).', '再赚 {short} 金币即可解锁【{name}】（{cost} 金币）。'],
  ['abandonBody', 'You left this stage. Progress reward saved once.', '你已撤离本关，本局进度金币已结算。'],
  ['earned', 'Earned', '获得'],
  ['earnedAmount', 'Earned {amount}', '获得 {amount}'],
  ['damageDealt', 'Damage dealt', '总伤害'],
  ['mergesMade', 'Upgrades', '强化次数'],
  ['critsLanded', 'Critical hits', '暴击次数'],
  ['fenceDamageTaken', 'Wall damage taken', '城墙承伤'],
  ['noReward', 'No reward', '无金币'],
  ['freshAbandon', 'Play at least 30s or 3 kills to earn coins.', '战斗不足 30 秒且击杀少于 3 只，不发放金币。'],
  ['alreadySettled', 'Already rewarded', '本局金币已发放'],
  ['notFinished', 'Stage not finished yet', '本关尚未结束'],
  ['noDoublePay', 'Each stage attempt pays once.', '每局最多结算一次。'],
  ['rewardRule', 'First-time stage clears pay extra bonus coins.', '首次通关每一关都有额外首通金币奖励。'],
  ['playAgain', 'Play again', '再来一关'],
  ['returnMenu', 'Main menu', '返回主页'],
  ['endless', 'Endless', '无尽'],
  ['endlessOffer', 'Continue into Endless mode? Your victory reward is saved.', '继续挑战无尽模式？本关通关金币已经安全保存。'],
  ['endlessEnter', 'Enter Endless', '继续无尽模式'],
  ['endlessStay', 'Not now', '暂不进入'],
  ['endlessNote', 'Endless does not pay the stage clear reward twice.', '无尽模式不会重复发放通关奖励。'],

  // Save, import, confirmations
  ['exportSave', 'Export save', '导出存档'],
  ['importSave', 'Import save', '导入存档'],
  ['importError', 'That save could not be imported', '无法导入这份存档'],
  ['invalid_json', 'That text is not valid save data. The current save was kept.', '这段文字不是有效的存档，当前存档已保留。'],
  ['invalid_format', 'That file is not a Fencefall save. The current save was kept.', '这不是最后一道防线的存档，当前存档已保留。'],
  ['invalid_version', 'That save is from another version. The current save was kept.', '这份存档的版本不同，当前存档已保留。'],
  ['invalid_profile', 'The profile in that save is not valid. The current save was kept.', '存档里的档案无效，当前存档已保留。'],
  ['invalid_run', 'The battle in that save is not valid. The current save was kept.', '存档里的对局无效，当前存档已保留。'],
  ['invalid_bounds', 'That save has a number outside the allowed range. The current save was kept.', '存档里有超出允许范围的数字，当前存档已保留。'],
  ['invalid_enum', 'That save has an unknown setting. The current save was kept.', '存档里有无法识别的设置，当前存档已保留。'],
  ['invalid_hero', 'That save does not contain one gunner. The current save was kept.', '存档里枪手数据异常，当前存档已保留。'],
  ['invalid_slots', 'That save has invalid board data. The current save was kept.', '存档阵地数据异常，当前存档已保留。'],
  ['invalid_settlement', 'That save has an invalid result. The current save was kept.', '存档里的结算数据无效，当前存档已保留。'],
  ['storage_unavailable', 'Storage is not available. The current save was kept.', '无法使用本地存储，当前存档已保留。'],
  ['too_large', 'That save is too large. The current save was kept.', '这份存档太大，当前存档已保留。'],
  ['quota', 'Storage is full. The current save was kept.', '存储空间已满，当前存档已保留。'],
  ['importSuccess', 'Save imported', '存档已导入'],
  ['noSave', 'No saved battle', '没有已保存的对局'],
  ['saveFailed', 'Could not save', '保存失败'],
  ['saveData', 'Save backup', '存档备份'],
  ['pasteHere', 'Paste save data here', '在此粘贴存档数据'],
  ['exportHint', 'Copy this backup and keep it somewhere safe.', '复制这份存档文本即可在其他设备恢复进度。'],
  ['importHint', 'Paste a backup exported from this game.', '粘贴之前导出的存档文本即可恢复。'],
  ['importEmpty', 'Paste save data first', '请先粘贴存档数据'],
  ['confirmImport', 'Importing replaces your current save on this device.', '导入会覆盖当前设备上的存档。'],
  ['confirmRestart', 'Restart this stage from wave 1?', '重新开始本关？'],
  ['confirmNewRun', 'Start a new stage and clear the paused battle?', '开始新关卡并放弃已暂停的战斗？'],
  ['abandonConfirm', 'Abandon this stage?', '确定撤离本关？'],
  ['abandonDetail', 'Leaving before 30s and 3 kills earns no coins. Victory or defeat pays once.', '不足 30 秒且击杀少于 3 只撤离没有金币；正常结束都会结算一次。'],
  ['corruptSave', 'This save is damaged', '这份存档已损坏'],
  ['invalidSave', 'This save is not valid', '这份存档无效'],
  ['invalid', 'Not valid', '无效'],
  ['versionMismatch', 'This save is from another version', '这份存档的版本不同'],
  ['tooLarge', 'That save is too large', '这份存档太大'],
  ['quotaExceeded', 'Storage is full', '存储空间已满'],
  ['storageUnavailable', 'Storage is not available', '无法使用本地存储'],
  ['errorGeneric', 'Something went wrong', '出了点问题'],
  ['unknownReason', 'That action is not available', '现在不能这么做'],
  ['tryAgain', 'Try again', '再试一次'],

  // How to play — crisp Pure Solo-Gunner guide
  ['howto', 'How to Play', '玩法说明'],
  ['howtoLead', 'Hold the center wall · Pick 1 of 3 · Unleash Auto Skills!', '单枪死守正中 · 升级三选一 · 满屏自动技能割草！'],
  ['helpOverview', 'Your Gunner holds the center of the steel wall and shoots incoming zombies automatically—no grid, no turret placement needed.', '防线枪手固定驻守城墙正中，自动瞄准并射杀来袭尸潮，无需摆塔或操作格子。'],
  ['helpPlacement', 'Clear 20 handcrafted stages across 4 chapters, earning 1–3 stars and first-clear bonus coins on every stage.', '按顺序闯过四大章节共 20 关，每关根据剩余城墙血量评定 1–3 星并领取首通金币。'],
  ['helpDraft', 'Kills fill the XP bar. Each level-up pauses the battle and lets you pick 1 of 3 upgrades: Gun Mods (枪械强化) or Auto Skills (自动技能).', '击杀僵尸攒经验升级，每次升级弹出三选一：直接提升主枪威力的「枪械强化」，以及冷却一到自动轰炸全场的「自动技能」。'],
  ['helpFence', 'Zombies only attack the wall. Wall Shield blocks and emergency shockwaves protect you in close calls—if Wall HP hits 0, the stage ends.', '僵尸只会攻击城墙，枪手不会阵亡。城墙免伤护盾与危急冲击波会在关键时刻护墙，城墙血量归零则失败。'],
  ['helpRange', 'Tap the Gunner anytime during battle to check live weapon stats and switch target priority (Closest / Specials / Tankiest / Lowest HP).', '战斗中随时点击城墙正中的枪手，可查看实时属性并一键切换优先攻击目标（最前 / 高危 / 最肉 / 残血）。'],
  ['helpSpeed', 'Switch freely between 1×, 1.5×, 3×, and 10× speed without affecting drops or coins.', '支持 1×、1.5×、3×、10× 四档倍速，随时加速割草且不影响任何金币奖励。'],
  ['helpHero', 'Combine Gun Mods (Multi-Volley, Armor Pierce, Flame/Frost Rounds) with Auto Skills (Napalm Fire Sea, Armored Sweeper, Glacial Barrage, Orbital Laser, EM Chain Strike, Split Shrapnel).', '自由组合齐射、穿甲、冰火子弹等「枪械强化」，与燃油火海、装甲车、干冰柱、高能激光、电磁天雷、子母分裂等「自动技能」。'],
  ['helpRewards', 'Spend coins in the Armory on Core Gems, Gear, and Permanent Upgrades. Claim the free Starter Pack on the home screen!', '通关与战败均可获得金币，去军械库镶嵌核心宝石、换武装、升永久属性。主页还可免费领新手补给包！'],
  ['helpEquipment', 'Equip up to 3 Core Gems, plus Weapon, Charm, and Wall Armor in the Armory—all bonuses apply automatically.', '在军械库最多镶嵌 3 颗核心宝石，并穿戴枪械、护符与城墙装甲，开局自动生效。'],
  ['helpLanguage', 'Switch 中 / EN anytime from the top bar without losing your run.', '随时点击顶部 中 / EN 切换中英文，保留当前进度。'],
  ['helpLanes', 'Zombies surge across the whole highway toward your fortified wall.', '尸潮铺满整条荒原公路涌向钢铁城墙。'],
  ['helpWin', 'Survive all waves and defeat the finale or Boss to clear the stage and unlock the next one!', '顶住全部波次并击溃终局尸潮或首领即可过关，自动解锁下一关！'],
  ['helpBoss', 'Bosses appear every 5 stages (Stages 5, 10, 15, 20) and enrage at 50% HP. Pair Armor Pierce, Deadeye Crit, and Orbital Laser!', '每 5 关出现首领关（第 5、10、15、20 关），首领半血狂暴，善用穿甲、暴击与高能激光柱融化它！'],
  ['helpSave', 'Progress saves automatically in your browser. Export or import JSON backups anytime in Settings.', '闯关进度自动保存在本地浏览器，随时可在设置页导出/导入备份。'],
  ['helpStatuses', 'Burn, Slow, Stun, and Brittle stack together—pair them with the Elemental Surge Gem for +25% bonus damage.', '燃烧、减速、麻痹、易伤可叠加，搭配【冰火增伤宝石】额外增伤 25%。'],
  ['helpDifficulty', 'Each stage increases zombie strength and introduces new special zombies across 4 chapters.', '20 关逐级递增强度，逐步解锁喷酸、分裂、治疗、护盾、自爆等 15 种僵尸。'],
  ['helpSupport', 'Auto Skills recharge automatically and show their cooldown progress along the bottom of the battlefield.', '所有自动技能冷却结束后自动释放，战场下方会实时显示各技能充能进度。'],
  ['helpCrit', 'Critical hits deal multiplied damage and trigger knockback and HP-shred bonuses.', '暴击造成高额倍率伤害，并可触发击退与百分比斩血特效。'],
  ['helpTouch', 'Built for one-hand mobile play: thumb-zone bottom bar, 1-tap upgrade cards, and instant target switching.', '专为手机单手优化：底部拇指操作栏、一键三选一与快捷索敌切换。'],
  ['helpEndless', 'After clearing a stage, you can optionally keep playing in Endless mode to test your maxed build!', '通关后可选择继续进入无尽模式，测试成型弹幕的极限清场爽感！'],

  // Accessibility labels
  ['ariaBattlefield', 'Battlefield', '战场'],
  ['ariaFence', 'Steel wall', '钢铁城墙'],
  ['ariaSlot', 'Wall position {index}', '城墙位置 {index}'],
  ['ariaPause', 'Pause the fight', '暂停战斗'],
  ['ariaResume', 'Resume the fight', '继续战斗'],
  ['ariaSpeed', 'Game speed', '倍速'],
  ['ariaSpeed1', 'Set speed to 1×', '速度设为 1×'],
  ['ariaSpeed15', 'Set speed to 1.5×', '速度设为 1.5×'],
  ['ariaSpeed3', 'Set speed to 3×', '速度设为 3×'],
  ['ariaSpeed10', 'Set speed to 10×', '速度设为 10×'],
  ['ariaLanguage', 'Language', '语言'],
  ['ariaDialog', 'Dialog', '对话框'],

  // Panel copy
  ['armoryIntro', 'Equip up to 3 Core Gems, gear up, and level permanent upgrades to crush tougher stages.', '镶嵌最多 3 颗核心宝石、穿戴武装并升级永久属性，轻松突破高难关卡。'],
  ['bonuses', 'Active Loadout Bonuses', '当前配置加成'],
  ['rewardBonusNote', 'Coin bonuses increase earnings at stage settlement.', '金币加成会在战斗结算时生效。'],
  ['equipReplaces', 'Equipping an item swaps it into that gear slot.', '点击装备即可直接替换当前部位武装。'],
  ['codexRankNote', 'Pick Gun Mods and Auto Skills during battle to stack levels and unlock explosive synergies.', '战斗中升级三选一可叠加「枪械强化」与「自动技能」等级，组合出满屏弹幕！'],
  ['settingsKeepRun', 'Changes apply immediately without interrupting your saved run.', '设置实时生效，不会丢失当前已保存的对局。'],
  ['difficultyNextRun', 'Applies on your next sortie.', '将在下一关出击时生效。'],
  ['difficultyRewards', 'Higher stages pay bigger first-clear coin rewards.', '越靠后的关卡首通金币奖励越丰厚。'],
  ['helpRole', 'Zero active buttons — focus on choosing Gun Mods & Auto Skills while your Gunner handles the firing.', '无需复杂走位与主动按键——专注三选一搭配枪械强化与自动技能，火力全自动倾泻。'],
  ['helpAura', 'Elemental effects combine for huge damage.', '元素异常叠加可打出巨额伤害。'],
  ['helpBoard', 'Zombies surge down the wasteland road toward your fortified steel wall.', '尸潮沿荒原公路涌向钢铁城墙，防线枪手在城墙正中迎击。'],
  ['helpRows', 'Your Gunner stays anchored at the center of the steel wall.', '防线枪手固定驻守在城墙正中炮位。'],
  ['enemyApproach', 'Approaches from top.', '从上方涌入。'],
  ['enemyFenceOnly', 'Targets the steel wall.', '仅攻击城墙。'],
  ['fenceDamage', 'Wall damage taken', '城墙承伤'],
  ['health', 'Health', '生命'],
  ['enemyHealth', 'Zombie HP', '僵尸血量'],
  ['enemySpeed', 'Zombie speed', '僵尸移速'],
  ['enemyDamage', 'Zombie damage', '僵尸伤害'],
  ['pressureCount', 'Horde size', '尸潮规模'],
  ['saveHelp', 'Export a JSON backup of your profile & progress, or paste a backup to restore.', '导出档案与闯关进度的 JSON 备份，或粘贴已有存档恢复。'],
  ['copySave', 'Copy save', '复制存档'],
  ['copyUnavailable', 'Select the text above to copy.', '请选中上方文本手动复制。'],
  ['noOutcome', 'No settled outcome yet.', '本局尚未结算。'],
  ['settlementPending', 'Coins appear after battle settlement.', '战斗结算后将在此显示金币收益。'],
  ['on', 'On', '开启'],
  ['off', 'Off', '关闭'],
  ['unavailable', 'Not available', '暂不可用'],
  ['missing', 'Waiting', '等待中'],
  ['invalidProfile', 'Invalid profile data', '档案数据无效'],
  ['error', 'Something went wrong', '出了点问题'],
  ['bad-phase', 'Not available right now', '当前阶段不可用'],
  ['bad-speed', 'Speed must be 1×, 1.5×, 3×, or 10×', '倍速仅支持 1×、1.5×、3×、10×'],
  ['bad-language', 'Language must be EN or ZH', '语言仅支持中/英'],
  ['bad-screen', 'Unknown screen', '未知界面'],
  ['unknown-action', 'Unknown action', '未知操作'],
  ['backRow', 'Wall Deck', '城墙阵地'],
  ['critDamage', 'Crit×', '暴伤'],
  ['projectile', 'Bullet', '子弹'],
  ['pauseToPlan', 'Tap the Gunner anytime to switch target priority.', '随时点击枪手即可查看属性或切换优先攻击目标。'],
  ['planningLocked', 'Tap the Gunner anytime to switch target priority.', '随时点击枪手即可查看属性或切换优先攻击目标。'],
  ['statsUnavailable', 'Stats unavailable.', '属性暂不可用。'],
  ['emptySelection', 'Tap the Gunner at center wall to view stats or switch target priority.', '点击城墙正中的枪手可查看属性或切换优先攻击目标。'],
  ['supportNote', 'Auto Skills fire automatically on cooldown.', '自动技能冷却就绪后自动释放。'],
  ['youGain', 'Result', '效果'],
  ['currentStats', 'Stats', '属性'],
  ['chooseEmpty', 'Tap the Gunner at center wall.', '点击城墙正中的枪手。'],
  ['heroStays', 'Gunner holds the center wall.', '枪手固定驻守城墙正中。'],
  ['moveHint', 'Tap below to switch target priority.', '点击下方切换优先攻击目标。'],
  ['buildPanelLabel', 'Upgrades and gunner controls', '强化选卡与枪手控制'],
  ['kindTower', 'Turret', '炮塔'],
  ['no_draft', 'No active upgrade pick', '当前没有三选一'],
  ['no_options', 'All upgrades maxed', '全部强化已满级'],
  ['not_playing', 'Fight is not active', '当前不在战斗中'],
  ['not_ready', 'Need more XP', '经验尚未满'],
  ['busy', 'Upgrade pick already open', '三选一已打开'],
  ['bad_index', 'Invalid choice', '无效选项'],
  ['bad_option', 'Invalid choice', '无效选项'],
  ['upgrade_failed', 'Upgrade failed', '强化未生效'],
  ['unknown_tower', 'Unknown unit', '未知单位'],
  ['no_slot', 'No open space', '无可用位置'],
  ['draft_missing', 'Upgrade closed', '选卡已关闭'],
  ['unknown_upgrade', 'Unknown upgrade', '未知强化'],
  ['upgrade_capped', 'Already max level', '已达满级'],
  ['no_hero', 'Gunner missing', '未找到枪手'],
  ['invalid_state', 'Action unavailable', '当前不可操作']
];

function buildMessages(rows) {
  const en = Object.create(null);
  const zh = Object.create(null);
  for (const row of rows) {
    const key = row[0];
    const enText = row[1];
    const zhText = row[2];
    if (typeof key !== 'string' || key.length === 0) throw new Error('i18n key missing');
    if (Object.hasOwn(en, key)) throw new Error(`duplicate i18n key: ${key}`);
    if (typeof enText !== 'string' || typeof zhText !== 'string' || enText.length === 0 || zhText.length === 0) {
      throw new Error(`i18n text missing: ${key}`);
    }
    en[key] = enText;
    zh[key] = zhText;
  }
  return Object.freeze({
    en: Object.freeze(en),
    zh: Object.freeze(zh)
  });
}

const MESSAGES = buildMessages(ROWS);
__ff_exports["MESSAGES"] = MESSAGES;


const NUMBER_FORMAT = Object.freeze({
  en: new Intl.NumberFormat('en-US', {maximumFractionDigits: 2, useGrouping: true}),
  zh: new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2, useGrouping: true})
});

const PLACEHOLDER = /\{(\w+)\}/g;

/** @returns {'en'|'zh'} */
function normalizeLanguage(language) {
  return String(language ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Browser locale → saved language. Chinese locales use zh; everything else uses en.
 * Pass a locale string in tests. With no argument, navigator.language is read at call time.
 * @returns {'en'|'zh'}
 */
function defaultLanguage(locale) {
  if (locale == null) {
    const nav = globalThis.navigator;
    locale = nav && typeof nav.language === 'string' ? nav.language : 'en';
  }
  return normalizeLanguage(locale);
}

function readableKey(key) {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' || typeof key === 'boolean' || typeof key === 'bigint') return String(key);
  return '';
}

function lookup(language, key) {
  const primary = MESSAGES[language];
  if (primary && Object.hasOwn(primary, key)) return primary[key];
  const other = MESSAGES[language === 'zh' ? 'en' : 'zh'];
  if (other && Object.hasOwn(other, key)) return other[key];
  return null;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

function formatNumber(value, language) {
  const lang = normalizeLanguage(language);
  const n = toFiniteNumber(value);
  if (!Number.isFinite(n)) return '—';
  return NUMBER_FORMAT[lang].format(Object.is(n, -0) ? 0 : n);
}

function formatVar(value, language) {
  if (value == null) return '';
  const kind = typeof value;
  if (kind === 'number') return formatNumber(value, language);
  if (kind === 'string') return value;
  if (kind === 'boolean') return t(language, value ? 'yes' : 'no');
  if (kind === 'bigint') return String(value);
  if (kind === 'object' && (Object.hasOwn(value, 'en') || Object.hasOwn(value, 'zh'))) {
    return localize(value, language);
  }
  return '';
}

function t(language, key, vars = {}) {
  const lang = normalizeLanguage(language);
  const rawKey = readableKey(key);
  if (!rawKey) return '';
  const template = lookup(lang, rawKey);
  const text = template == null ? rawKey : template;
  if (vars == null || typeof vars !== 'object') return text;
  return text.replace(PLACEHOLDER, (match, name) => {
    if (!Object.hasOwn(vars, name) || vars[name] == null) return match;
    return formatVar(vars[name], lang);
  });
}

function localize(value, language) {
  const lang = normalizeLanguage(language);
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value, lang) : '';
  if (typeof value === 'boolean') return t(lang, value ? 'yes' : 'no');
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Object.hasOwn(value, lang)) {
      const preferred = value[lang];
      if (preferred != null && typeof preferred !== 'object') return localize(preferred, lang);
    }
    const fallbackLang = lang === 'zh' ? 'en' : 'zh';
    if (Object.hasOwn(value, fallbackLang)) {
      const fallback = value[fallbackLang];
      if (fallback != null && typeof fallback !== 'object') return localize(fallback, fallbackLang);
    }
  }
  return '';
}

/** Active fight time. Under an hour: "12m 05s" / "12分05秒". */
function formatDuration(seconds, language) {
  const lang = normalizeLanguage(language);
  let total = toFiniteNumber(seconds);
  if (!Number.isFinite(total) || total < 0) total = 0;
  total = Math.floor(total);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (lang === 'zh') {
    return hours > 0 ? `${hours}小时${pad(minutes)}分${pad(secs)}秒` : `${minutes}分${pad(secs)}秒`;
  }
  return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(secs)}s` : `${minutes}m ${pad(secs)}s`;
}

const RESULT_BODIES = Object.freeze({
  victory: 'victoryBody',
  defeat: 'defeatBody',
  abandon: 'abandonBody'
});

/** Victory, defeat, or abandoned. Any other outcome stays a sentence, never a raw code. */
function resultLabel(language, outcome) {
  const lang = normalizeLanguage(language);
  if (outcome === 'victory') return t(lang, 'victory');
  if (outcome === 'defeat') return t(lang, 'defeat');
  if (outcome === 'abandon') return t(lang, 'abandoned');
  return t(lang, 'noOutcome');
}

/** One next step after a loss. Easy already is the lower pressure, so it points at the Armory. */
function defeatAdvice(language, difficulty) {
  const lang = normalizeLanguage(language);
  return t(lang, difficulty === 'easy' ? 'defeatNextEasy' : 'defeatNext');
}

/** Names the next Armory action. An empty string means there is nothing left to buy or equip. */
function armoryNextLine(language, offer) {
  const lang = normalizeLanguage(language);
  const name = offer?.name?.[lang] || offer?.name?.en || '';
  if (!name || !offer) return '';
  if (offer.kind === 'equip') return t(lang, 'defeatEquip', {name});
  if (offer.affordable) return t(lang, 'defeatBuy', {name, cost: offer.cost});
  return t(lang, 'defeatShort', {name, cost: offer.cost, short: offer.short});
}

/**
 * What happened, then what was paid. currency null means the purse is not settled yet.
 * A zero abandon names the short-run rule. Unknown outcomes never echo the code.
 */
function resultStory(language, outcome, currency) {
  const lang = normalizeLanguage(language);
  const body = t(lang, RESULT_BODIES[outcome] || 'noOutcome');
  const join = (parts) => {
    const bits = parts.filter(Boolean);
    if (lang !== 'zh') return bits.join(' ');
    return bits.reduce((text, part, index) => {
      if (index === 0) return part;
      return `${text}${/[。！？]$/.test(text) ? '' : '。'}${part}`;
    }, '');
  };
  if (!Number.isFinite(currency)) return join([body, t(lang, 'settlementPending')]);
  const paid = t(lang, 'earnedAmount', {amount: currency});
  if (outcome === 'abandon' && currency <= 0) return join([body, t(lang, 'freshAbandon'), paid]);
  return join([body, paid]);
}

};
__ff_factories["src/render/defenders.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["defenderSize"] = defenderSize;
__ff_exports["drawDefender"] = drawDefender;
/**
 * Fencefall v5 — PvZ2-Style Sharp Cel-Shaded Wall Gunner (Hero) Vector Renderer.
 *
 * Bottom-center anchor (x, y) places the Gunner's boots & contact shadow right on
 * the central Commander Gunnery Platform. Supports smooth continuous breathing,
 * fluttering crimson scarf, 360° articulated weapon tracking (`options.aimAngle`),
 * spring kickback (`options.recoil`), starburst muzzle flash, and live visual weapon
 * evolutions as Gun Mods & Auto Skills are unlocked.
 */

const HERO_W = 50;
const HERO_H = 54;
const INK = '#11171d';

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.ellipse === 'function'
    && typeof ctx.createLinearGradient === 'function'
  );
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function defenderSize(unit) {
  if (unit && (unit.kind === 'hero' || unit.type === 'hero')) {
    return {width: HERO_W, height: HERO_H};
  }
  return {width: 40, height: 40};
}

function drawMuzzleStar(ctx, x, y, radius, tint) {
  ctx.save();
  ctx.translate(x, y);
  // Outer luminous burst
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, radius * 1.45);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.42, tint);
  glow.addColorStop(1, 'rgba(255, 190, 70, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // Sharp PvZ2 cartoon 6-point starburst
  ctx.beginPath();
  const spikes = 6;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const a = (i * Math.PI) / spikes;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff9d8';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawHeroGunner(ctx, unit, x, y, opts) {
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const flash = Number.isFinite(opts.flash) && opts.flash > 0 ? Math.min(1, opts.flash) : 0;
  const recoil = Number.isFinite(opts.recoil) ? Math.max(0, Math.min(1, opts.recoil)) : 0;
  const aimAngle = Number.isFinite(opts.aimAngle) ? opts.aimAngle : -Math.PI / 2;
  const upg = (opts.upgrades && typeof opts.upgrades === 'object') ? opts.upgrades : (unit.upgrades || {});

  const hasMulti = (upg.volley || 0) > 0 || (upg.split_shot || 0) > 0;
  const hasFire = (upg.shrapnel || 0) > 0 || (upg.napalm || 0) > 0;
  const hasFrost = (upg.frostbite || 0) > 0 || (upg.cryo_barrage || 0) > 0;
  const hasArc = (upg.ricochet || 0) > 0 || (upg.orbital_beam || 0) > 0;
  const totalLevels = Object.values(upg).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const eliteTrim = totalLevels >= 6;

  const bob = Math.sin(time * 3.4) * 1.3;
  const sway = Math.cos(time * 2.1) * 0.6;
  const aimCos = Math.cos(aimAngle);
  const aimSin = Math.sin(aimAngle);
  const kickX = -aimCos * recoil * 3.6;
  const kickY = -aimSin * recoil * 2.4;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // 1. Soft Ground Contact Shadow
  ctx.fillStyle = 'rgba(6, 10, 14, 0.52)';
  ctx.beginPath();
  ctx.ellipse(0, -3, 18, 7.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle Hero Commander Aura when heavily upgraded
  if (totalLevels >= 4) {
    const auraAlpha = 0.14 + 0.08 * Math.sin(time * 4.2);
    const auraColor = hasArc ? `rgba(96, 236, 255, ${auraAlpha})`
      : hasFire ? `rgba(255, 138, 56, ${auraAlpha})`
      : hasFrost ? `rgba(128, 232, 255, ${auraAlpha})`
      : `rgba(248, 206, 94, ${auraAlpha})`;
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, -3, 21.5, 8.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Fluttering Crimson Commander Scarf (behind torso)
  const wave1 = Math.sin(time * 5.6) * 3.2;
  const wave2 = Math.cos(time * 6.8) * 2.6;
  ctx.save();
  ctx.translate(kickX * 0.5, bob * 0.8 + kickY * 0.5);
  const scarfGrad = ctx.createLinearGradient(-16, -24, -22, -6);
  scarfGrad.addColorStop(0, '#e8464c');
  scarfGrad.addColorStop(1, '#981e28');
  ctx.fillStyle = scarfGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -25);
  ctx.quadraticCurveTo(-15 + wave1 * 0.5, -21, -21 + wave1, -12 + wave2 * 0.5);
  ctx.lineTo(-15 + wave2, -9 + wave1 * 0.3);
  ctx.quadraticCurveTo(-10, -16, -3, -21);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // 3. Sturdy Armored Tactical Boots & Legs
  for (const side of [-1, 1]) {
    const lx = side * 6.5;
    // Armored shin + boot
    const bootGrad = ctx.createLinearGradient(lx - 4, -15, lx + 4, -3);
    bootGrad.addColorStop(0, '#465866');
    bootGrad.addColorStop(1, '#1e2830');
    rRect(ctx, lx - 4.4, -14.5, 8.8, 11.5, 3.2);
    ctx.fillStyle = bootGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Brass knee-pad highlight
    ctx.fillStyle = eliteTrim ? '#f4cc62' : '#7b92a2';
    rRect(ctx, lx - 3, -13.2, 6, 3.6, 1.5);
    ctx.fill();
  }

  // 4. Torso Armor & Brass Shoulder Pauldrons
  ctx.save();
  ctx.translate(sway + kickX * 0.7, bob + kickY * 0.7);

  // Chest cuirass (3-tone cel shaded steel blue)
  const torsoGrad = ctx.createLinearGradient(-12, -31, 12, -13);
  torsoGrad.addColorStop(0, '#4e7898');
  torsoGrad.addColorStop(0.55, '#2b4a62');
  torsoGrad.addColorStop(1, '#182b3a');
  rRect(ctx, -11.5, -30, 23, 18.5, 6);
  ctx.fillStyle = torsoGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Tactical Utility Belt & Brass Buckle
  ctx.fillStyle = '#3b2c20';
  ctx.fillRect(-10.5, -16, 21, 4.2);
  ctx.fillStyle = '#f4cb62';
  rRect(ctx, -3.5, -16.4, 7, 5, 1.4);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Glowing chest power core (reflects strongest Auto Skill element!)
  const coreColor = hasArc ? '#62f2ff' : hasFire ? '#ff7c34' : hasFrost ? '#86eeff' : '#f8d264';
  ctx.fillStyle = '#121d24';
  ctx.beginPath();
  ctx.arc(0, -22.5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(0, -22.5, 2.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-0.8, -23.3, 1.0, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right Gold/Brass Shoulder Pauldrons
  for (const side of [-1, 1]) {
    const px = side * 12.2;
    const py = -25.5;
    const pGrad = ctx.createLinearGradient(px - 4, py - 5, px + 4, py + 5);
    pGrad.addColorStop(0, '#fae08a');
    pGrad.addColorStop(0.5, '#d69c36');
    pGrad.addColorStop(1, '#7c5116');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(px, py, 5.2, 6.2, side * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();
    // Specular rim dot
    ctx.fillStyle = 'rgba(255, 252, 232, 0.72)';
    ctx.beginPath();
    ctx.ellipse(px - side * 1.2, py - 2.2, 1.8, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crimson Neck Scarf Collar
  rRect(ctx, -8.5, -31.5, 17, 5, 2.5);
  ctx.fillStyle = '#d93d44';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 5. Oversized Expressive PvZ2-Style Combat Helmet & Glowing Visor
  const headX = aimCos * 1.6;
  const headY = -39.5 + aimSin * 0.8;

  // Helmet Dome (glossy cel-shaded tactical steel-blue with warm gold brow trim)
  const helmGrad = ctx.createRadialGradient(headX - 4, headY - 5, 2, headX, headY, 13.5);
  helmGrad.addColorStop(0, '#78a8c8');
  helmGrad.addColorStop(0.55, '#3b6482');
  helmGrad.addColorStop(1, '#1c3346');
  ctx.fillStyle = helmGrad;
  ctx.beginPath();
  ctx.arc(headX, headY, 11.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.1;
  ctx.stroke();

  // Golden Helmet Crest Stripe
  ctx.fillStyle = '#f6cf66';
  ctx.beginPath();
  ctx.moveTo(headX - 2.6, headY - 11.2);
  ctx.lineTo(headX + 2.6, headY - 11.2);
  ctx.lineTo(headX + 1.8, headY - 3.5);
  ctx.lineTo(headX - 1.8, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Glossy Specular Highlight on Helmet Crown
  ctx.fillStyle = 'rgba(235, 250, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(headX - 4.8, headY - 5.2, 3.2, 1.7, -0.55, 0, Math.PI * 2);
  ctx.fill();

  // Tactical Glowing Visor Goggles (points subtly toward aim direction!)
  const visorX = headX + aimCos * 2.2;
  const visorY = headY - 0.5 + aimSin * 1.4;
  rRect(ctx, visorX - 7.8, visorY - 3.4, 15.6, 6.8, 3.2);
  const vGrad = ctx.createLinearGradient(visorX - 7, visorY - 3, visorX + 7, visorY + 3);
  vGrad.addColorStop(0, '#9cf8ff');
  vGrad.addColorStop(0.5, '#38c8ec');
  vGrad.addColorStop(1, '#166e92');
  ctx.fillStyle = vGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Visor diagonal glossy glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(visorX - 4.8, visorY - 2.2);
  ctx.lineTo(visorX - 1.8, visorY - 2.2);
  ctx.lineTo(visorX - 3.5, visorY + 2.1);
  ctx.lineTo(visorX - 6.0, visorY + 2.1);
  ctx.closePath();
  ctx.fill();

  // 6. ARTICULATED ROTATING HEAVY ASSAULT CANNON / RAILGUN
  ctx.save();
  ctx.translate(6.5, -23.5);
  ctx.rotate(aimAngle);
  const gunBack = -recoil * 5.2;

  // Heavy Assault Rifle / Railgun Receiver Body
  const recGrad = ctx.createLinearGradient(gunBack - 4, -5.5, gunBack - 4, 5.5);
  recGrad.addColorStop(0, '#96aebc');
  recGrad.addColorStop(0.45, '#526876');
  recGrad.addColorStop(1, '#243038');
  rRect(ctx, gunBack - 6, -5.2, 22, 10.4, 3);
  ctx.fillStyle = recGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  // Brass / Gold tactical receiver rail
  ctx.fillStyle = '#f2c862';
  ctx.fillRect(gunBack - 2, -4.4, 13, 2.2);

  // Extended Gun Barrel(s) — evolves visually with Volley/Split!
  const barrelLen = hasMulti ? 26 : 24;
  if (hasMulti) {
    // Twin heavy barrels
    for (const by of [-3.3, 1.1]) {
      rRect(ctx, gunBack + 12, by, barrelLen - 10, 3.0, 1.2);
      ctx.fillStyle = '#6c8492';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    // Sleek single heavy rail barrel
    rRect(ctx, gunBack + 12, -2.5, barrelLen - 10, 5.0, 1.5);
    ctx.fillStyle = '#738b9a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Elemental Evolution Visual Attachments on the Cannon!
  if (hasFire) {
    // Glowing orange thermal cooling vents
    ctx.fillStyle = '#ff7228';
    ctx.fillRect(gunBack + 14, -1.2, 7, 2.4);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(gunBack + 15.5, -0.6, 4, 1.2);
  }
  if (hasFrost) {
    // Gleaming cyan cryo fins flanking barrel
    ctx.fillStyle = '#7ceeff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gunBack + 13, -4.8);
    ctx.lineTo(gunBack + 21, -7.2);
    ctx.lineTo(gunBack + 20, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gunBack + 13, 4.8);
    ctx.lineTo(gunBack + 21, 7.2);
    ctx.lineTo(gunBack + 20, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (hasArc) {
    // Electric cyan/gold rail coils near muzzle
    ctx.strokeStyle = '#62f2ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(gunBack + 18, -4.5);
    ctx.lineTo(gunBack + 24, -4.5);
    ctx.moveTo(gunBack + 18, 4.5);
    ctx.lineTo(gunBack + 24, 4.5);
    ctx.stroke();
  }

  // Heavy Muzzle Brake Tip
  rRect(ctx, gunBack + barrelLen, -3.8, 4.5, 7.6, 1.4);
  ctx.fillStyle = '#2d3a42';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Armored Glove Gripping the Gun
  ctx.fillStyle = '#d49a38';
  ctx.beginPath();
  ctx.arc(gunBack + 2, 3.2, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Crisp Cartoon Muzzle Flash Starburst on Shot!
  if (recoil > 0.25) {
    const flashSize = 9 + recoil * 9;
    const flashTint = hasFire ? '#ff7c32' : hasFrost ? '#7aefff' : hasArc ? '#ffe858' : '#ffb848';
    drawMuzzleStar(ctx, gunBack + barrelLen + 7, 0, flashSize, flashTint);
  }

  ctx.restore(); // end gun rotation
  ctx.restore(); // end torso bob

  // Subtle warm radial muzzle bounce glow
  if (flash > 0.05) {
    ctx.save();
    const glow = ctx.createRadialGradient(0, -28, 2, 0, -28, 22);
    glow.addColorStop(0, `rgba(255, 244, 198, ${(flash * 0.28).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255, 244, 198, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -28, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/** Crisp vector fallback if a legacy tower unit is ever drawn directly by a test. */
function drawLegacyTurret(ctx, unit, x, y, opts) {
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const type = String(unit.type || 'bolt').toLowerCase();
  const colorMap = {
    bolt: '#f2d56a',
    fire: '#ff6c30',
    frost: '#7ce8ff',
    lightning: '#ffe14a',
    poison: '#7dce6a',
    support: '#68d8c4',
  };
  const accent = colorMap[type] || '#f0cb72';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, -3, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  rRect(ctx, -12, -26, 24, 22, 6);
  ctx.fillStyle = '#334652';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDefender(ctx, unit, x, y, options = {}) {
  if (!ctx || !unit || typeof unit !== 'object') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const opts = options || {};

  if (!isRichCtx(ctx)) {
    const sz = defenderSize(unit);
    ctx.save?.();
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect?.(Math.round(x - sz.width / 2), Math.round(y - sz.height), sz.width, sz.height);
    ctx.restore?.();
    return;
  }

  if (unit.kind === 'hero' || unit.type === 'hero') {
    drawHeroGunner(ctx, unit, x, y, opts);
  } else {
    drawLegacyTurret(ctx, unit, x, y, opts);
  }
}

};
__ff_factories["src/render/effects.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["describeFeedback"] = describeFeedback;
__ff_exports["collectFeedback"] = collectFeedback;
__ff_exports["createEffects"] = createEffects;
const __ff_m0 = __ff_load("src/shared.js");
const ARENA = __ff_m0["ARENA"];
const slotGeometry = __ff_m0["slotGeometry"];
/**
 * Fencefall combat feedback visuals.
 *
 * createEffects() -> {ingest(events), update(dt), draw(ctx, {reducedMotion}), clear()}
 * Draw in logical arena pixels. The renderer owns the view transform.
 * Call ingest, then update(seconds), then draw. Do not ingest during draw.
 * This module never reads or advances gameplay RNG.
 *
 * Event names: shot, hit, kill, fence_hit, merge, draft, victory, defeat, ui,
 * leap, split, mend, phase.
 * Optional fields: x, y, targetX, targetY, damage, crit, towerType, rank, splash,
 * chain, pierce, attack, points, stacks, slot/slotIndex/fromIndex/toIndex, time.
 * Missing fields are skipped. emit() copies payload after `type`, so a payload
 * `type` of bolt/fire/frost/lightning/poison/support/hero/burn/slow/stun/brittle
 * is recovered as shot, hit, or status when position or damage is present.
 * Reduced motion skips decorative particle trails and keeps a short impact mark,
 * rings at their start size, crits, and numbers. A critical mark is a longer gold
 * plus; a normal mark is a shorter plus. Traveling debris is dropped.
 * A plain shot is a short arrow. A pierce shot is a thin needle along the aim.
 * A splash burst is a hollow ring. A chain jump is a kinked bolt. Other impacts
 * stay starbursts with a damage number. A critical hit adds one gold diamond
 * flash and a thicker ring; a normal hit does not. A fence hit is a red bite in the rail.
 * Leap, split, mend, and phase draw only when x and y are finite. Leap is a
 * short downward streak, split is a few chips, mend is one upward mote, and
 * phase is a faint ring. Other fields on those events are ignored.
 */


const MAX_PARTICLES = 220;
const MAX_FLOATERS = 28;
const MAX_RINGS = 24;
const SCAN_LIMIT = 400;

const LIMITS = Object.freeze({
  shot: 10,
  hit: 14,
  kill: 10,
  fence_hit: 4,
  merge: 3,
  draft: 2,
  victory: 1,
  defeat: 1,
  ui: 4,
  status: 6,
  boss: 1,
  leap: 6,
  split: 6,
  mend: 6,
  phase: 6,
  fence_surge: 1,
  corpse_explode: 4,
  cloud_spawn: 4,
  knockback: 6,
  field_build: 3,
  field_hit: 4,
  field_destroy: 3,
  field_repair: 4,
  field_remove: 2,
  energy_gain: 4,
  wave_horde: 1,
  draft_reroll: 1,
  targeting_change: 1,
  napalm_blast: 3,
  armored_car: 2,
  cryo_barrage: 2,
  orbital_beam: 2,
  em_strike: 3,
  wall_immune: 3,
  bullet_split: 8,
  cryo_shatter: 6,
});

const PALETTES = Object.freeze({
  bolt: { core: '#fff6d2', hot: '#ffe56a', mid: '#e2a63a', dim: '#7a4e16' },
  fire: { core: '#fff1c9', hot: '#ff9a3c', mid: '#e23b16', dim: '#6a160e' },
  frost: { core: '#f4fdff', hot: '#b9f3ff', mid: '#3ec4e0', dim: '#1c5f8a' },
  lightning: { core: '#ffffff', hot: '#d5e4ff', mid: '#7aa2ff', dim: '#2a3e98' },
  poison: { core: '#f2ffc8', hot: '#b6e84a', mid: '#4f8f1e', dim: '#1e320c' },
  support: { core: '#fff8e6', hot: '#f0cb72', mid: '#5ec8b0', dim: '#1f564c' },
  hero: { core: '#fff8e8', hot: '#f0cb72', mid: '#e09a3a', dim: '#6d3c12' },
  neutral: { core: '#f2f5f4', hot: '#d5ddd8', mid: '#8aa097', dim: '#3d524c' },
  brittle: { core: '#fff8ee', hot: '#f0cb72', mid: '#d7a25a', dim: '#6a4a28' },
  fence: { core: '#fff2dd', hot: '#e7c89a', mid: '#9b7951', dim: '#5c4128' },
  kill: { core: '#fff4ea', hot: '#ffd0a8', mid: '#d07048', dim: '#5a241c' },
  victory: { core: '#fff8dc', hot: '#f0cb72', mid: '#8fd18a', dim: '#2f6a48' },
  defeat: { core: '#ffd0c8', hot: '#e07068', mid: '#a33b3b', dim: '#4a1c22' },
  ui: { core: '#e7eef0', hot: '#c5d4d8', mid: '#7f989e', dim: '#31464c' },
  draft: { core: '#fff6d4', hot: '#f0cb72', mid: '#d7a441', dim: '#6a4a16' },
  boss: { core: '#ffe8ff', hot: '#e2a0ea', mid: '#8d3eae', dim: '#3c1848' },
  heal: { core: '#f3fff8', hot: '#9be7c4', mid: '#3eae86', dim: '#145445' },
  surge: { core: '#ffffff', hot: '#9ef0ff', mid: '#4ac8f0', dim: '#185470' },
  steam: { core: '#ffffff', hot: '#e6fbff', mid: '#ffaa5a', dim: '#3c7a90' },
  catalyst: { core: '#ffffff', hot: '#e4ff7a', mid: '#b0ff3a', dim: '#3e6a14' },
  napalm: { core: '#fff8d6', hot: '#ff9638', mid: '#e83814', dim: '#6a120a' },
  orbital: { core: '#ffffff', hot: '#9ef4ff', mid: '#3ac8f8', dim: '#124a6e' },
  aegis: { core: '#ffffff', hot: '#94f0ff', mid: '#46c6f0', dim: '#164d68' },
});

const HYBRID_PALETTES = Object.freeze([
  { core: '#fff0e0', hot: '#ffb15a', mid: '#e25a3a', dim: '#6a2418' },
  { core: '#f3fbff', hot: '#9fd4ff', mid: '#4a78e0', dim: '#1c2a66' },
  { core: '#f4ffe4', hot: '#c6e86a', mid: '#3e9a8a', dim: '#14322c' },
  { core: '#fff4f8', hot: '#f0a0c8', mid: '#c45a8a', dim: '#5a2040' },
  { core: '#f3f6ff', hot: '#c9d4ff', mid: '#6a7ad0', dim: '#242848' },
  { core: '#fff8e8', hot: '#e6c36a', mid: '#c47a3a', dim: '#4a3014' },
  { core: '#eefcf6', hot: '#8ee0c0', mid: '#2a9a78', dim: '#12382c' },
  { core: '#fff2ea', hot: '#ffc2a0', mid: '#d06040', dim: '#4a2018' },
]);

const ELEMENT_BEHAVIOR = Object.freeze({
  bolt: 'bolt',
  fire: 'fire',
  burn: 'fire',
  napalm: 'fire',
  shrapnel: 'fire',
  frost: 'frost',
  slow: 'frost',
  cryo_barrage: 'frost',
  lightning: 'lightning',
  stun: 'lightning',
  orbital_beam: 'lightning',
  ricochet: 'lightning',
  brittle: 'brittle',
  poison: 'poison',
  support: 'support',
  aura: 'support',
  heal: 'support',
  buff: 'support',
  hero: 'hero',
  split_shot: 'hero',
  armored_car: 'bolt',
});

const FEEDBACK = new Set([
  'shot', 'hit', 'kill', 'fence_hit', 'upgrade_tower', 'draft',
  'victory', 'defeat', 'ui', 'status', 'boss',
  'leap', 'split', 'mend', 'phase',
  'fence_surge', 'corpse_explode', 'cloud_spawn', 'knockback',
  'wave_horde', 'draft_reroll', 'targeting_change',
  'napalm_blast', 'armored_car', 'cryo_barrage', 'orbital_beam',
  'em_strike', 'wall_immune', 'bullet_split', 'cryo_shatter',
]);

// These need a finite x and y on the event. Slot fallback and extra fields are ignored.
const TELLS = new Set(['leap', 'split', 'mend', 'phase']);

const LEAP_INK = Object.freeze({ core: '#fff1d0', hot: '#e2a23a', mid: '#e2a23a', dim: '#6e5424' });
const SPLIT_CHIPS = Object.freeze(['#efe6d2', '#d7c4a4', '#8c8374']);

// Full-motion shapes. Reduced motion does not draw these; a short impact stands in
// when the particle was the hit or shot itself.
const REDUCED_TRAILS = new Set(['spark', 'mote', 'orbit', 'arc', 'streak', 'needle', 'jump', 'burst']);

const ALIAS = Object.freeze({
  fencehit: 'fence_hit',
  fence_damage: 'fence_hit',
  fence_attack: 'fence_hit',
  death: 'kill',
  enemy_killed: 'kill',
  killed: 'kill',
  draft_open: 'draft',
  win: 'victory',
  lose: 'defeat',
  lost: 'defeat',
  click: 'ui',
  button: 'ui',
  boss_spawn: 'boss',
  boss_enter: 'boss',
  boss_approach: 'boss',
  boss_enrage: 'boss',
});

const CRIT_TYPES = new Set(['crit', 'critical', 'critical_hit']);
const SKIP_TAG = new Set(['crit', 'critical', 'splash', 'pierce', 'chain', 'aoe']);

const GLYPHS = Object.freeze({
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  '+': ['000', '010', '111', '010', '000'],
});

const STYLE = Object.freeze({
  bolt: { jitter: 3, sparks: 4, speed: 78, gravity: 0, up: false, arc: true },
  fire: { jitter: 7, sparks: 6, speed: 48, gravity: -30, up: true, arc: true },
  frost: { jitter: 2, sparks: 5, speed: 30, gravity: 0, up: false, arc: true },
  lightning: { jitter: 16, sparks: 3, speed: 96, gravity: 0, up: false, arc: true },
  poison: { jitter: 2, sparks: 5, speed: 26, gravity: 110, up: false, arc: false },
  support: { jitter: 0, sparks: 0, speed: 0, gravity: 0, up: false, arc: false, ring: true },
  hero: { jitter: 4, sparks: 4, speed: 64, gravity: 16, up: false, arc: true },
  brittle: { jitter: 2, sparks: 4, speed: 38, gravity: 20, up: false, arc: false },
  neutral: { jitter: 3, sparks: 4, speed: 44, gravity: 0, up: false, arc: true },
  hybrid: { jitter: 6, sparks: 5, speed: 52, gravity: 0, up: false, arc: true },
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(n) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function rand01(seed) {
  return mix(seed) / 4294967296;
}

function saneX(x) {
  return x >= -80 && x <= ARENA.width + 80;
}

function saneY(y) {
  return y >= -120 && y <= ARENA.height + 120;
}

function readTags(event) {
  if (Array.isArray(event.tags)) return event.tags;
  if (typeof event.tags === 'string') return [event.tags];
  return [];
}

function isCrit(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.crit === true || event.critical === true || event.isCrit === true) return true;
  if (event.crit === 1 || event.critical === 1) return true;
  if (typeof event.crit === 'number' && Number.isFinite(event.crit) && event.crit > 1) return true;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const name = normName(tags[i]);
    if (name === 'crit' || name === 'critical') return true;
  }
  return false;
}

function readDamage(event) {
  const direct = finite(event.damage);
  if (direct != null) return direct;
  return finite(event.amount);
}

function readRatio(event) {
  const value = finite(event.ratio);
  if (value == null) return null;
  return Math.min(1, Math.max(0, value));
}

function readHeal(event, hint) {
  const direct = finite(event.heal);
  if (direct != null && direct > 0) return Math.min(direct, 9999);
  const alt = finite(event.healing);
  if (alt != null && alt > 0) return Math.min(alt, 9999);
  if (hint === 'heal' || hint === 'buff') {
    const amount = finite(event.amount);
    if (amount != null && amount > 0) return Math.min(amount, 9999);
    const damage = finite(event.damage);
    if (damage != null && damage > 0) return Math.min(damage, 9999);
  }
  return null;
}

function readRank(event) {
  const n = finite(event.rank);
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded > 4) return 4;
  if (rounded < 1) return null;
  return rounded;
}

function readSplash(event) {
  if (event.splash === true) return 18;
  const n = finite(event.splash);
  if (n != null && n > 0) return Math.max(8, Math.min(84, n));
  if (n != null) return 0;
  const attack = normName(event.attack || event.impact || '');
  if (attack === 'splash' || attack === 'aoe') return 16;
  return 0;
}

function readCount(value, max) {
  if (value === true) return 1;
  const n = finite(value);
  if (n == null || n <= 0) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function deliveryName(value) {
  const name = normName(value);
  if (name === 'pierce') return 'pierce';
  if (name === 'splash' || name === 'aoe') return 'splash';
  if (name === 'chain') return 'chain';
  return '';
}

// One event draws one shape. Attack wins, then a single mechanic field or tag.
// Bolt, fire, and lightning are the base pierce, splash, and chain towers.
function readDelivery(event, type) {
  const named = deliveryName(event.attack) || deliveryName(event.impact) || deliveryName(event.impactType);
  if (named) return named;
  let pierce = readCount(event.pierce, 8) > 0;
  const splashN = finite(event.splash);
  let splash = event.splash === true || (splashN != null && splashN > 0);
  let chain = readCount(event.chain, 8) > 0;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const flag = deliveryName(tags[i]);
    if (flag === 'pierce') pierce = true;
    else if (flag === 'splash') splash = true;
    else if (flag === 'chain') chain = true;
  }
  if (!pierce && !splash && Array.isArray(event.points) && event.points.length > 0) chain = true;
  const flags = (pierce ? 1 : 0) + (splash ? 1 : 0) + (chain ? 1 : 0);
  if (flags === 1) {
    if (pierce) return 'pierce';
    if (splash) return 'splash';
    return 'chain';
  }
  if (flags > 1) {
    if (type === 'shot' && pierce) return 'pierce';
    if (splash && type !== 'shot') return 'splash';
    if (chain) return 'chain';
    if (splash) return 'splash';
    return 'pierce';
  }
  if (type !== 'shot' && type !== 'hit') return '';
  const element = normName(event.towerType || event.unitType || event.sourceType || event.attackerType || '');
  if (element === 'bolt') return 'pierce';
  if (element === 'fire') return 'splash';
  if (element === 'lightning') return 'chain';
  return '';
}

function readElement(event, hint, feedbackType) {
  const statusName = normName(event.status) || normName(event.statusType);
  if (feedbackType === 'status' && statusName) return statusName;
  const keys = ['towerType', 'unitType', 'sourceType', 'attackerType', 'damageType', 'element'];
  for (let i = 0; i < keys.length; i++) {
    const name = normName(event[keys[i]]);
    if (name) return name;
  }
  if (statusName) return statusName;
  const tags = readTags(event);
  for (let i = 0; i < tags.length; i++) {
    const name = normName(tags[i]);
    if (!name || SKIP_TAG.has(name)) continue;
    return name;
  }
  return hint || '';
}

function behaviorFrom(element) {
  const key = normName(element);
  if (ELEMENT_BEHAVIOR[key]) return ELEMENT_BEHAVIOR[key];
  if (!key) return 'neutral';
  return 'hybrid';
}

function paletteFor(element, behavior) {
  if (behavior === 'hybrid') {
    const index = hashString(normName(element) || 'hybrid') % HYBRID_PALETTES.length;
    return HYBRID_PALETTES[index];
  }
  return PALETTES[behavior] || PALETTES.neutral;
}

function readLooseXY(event) {
  let x = finite(event.x);
  let y = finite(event.y);
  if (x == null) x = finite(event.fx);
  if (y == null) y = finite(event.fy);
  if ((x == null || y == null) && event.position && typeof event.position === 'object') {
    if (x == null) x = finite(event.position.x);
    if (y == null) y = finite(event.position.y);
  }
  return {
    x: x != null && saneX(x) ? x : null,
    y: y != null && saneY(y) ? y : null,
  };
}

function readTarget(event) {
  let x = finite(event.targetX);
  let y = finite(event.targetY);
  if (x == null) x = finite(event.tx);
  if (y == null) y = finite(event.ty);
  if (x == null) x = finite(event.toX);
  if (y == null) y = finite(event.toY);
  if (x == null || y == null || !saneX(x) || !saneY(y)) return null;
  return { x, y };
}

function readSlot(event, type) {
  const keys = type === 'shot'
    ? ['fromIndex', 'sourceSlot', 'slot', 'slotIndex']
    : type === 'merge'
      ? ['toIndex', 'targetSlot', 'slot', 'slotIndex', 'fromIndex', 'sourceSlot']
      : ['slot', 'slotIndex', 'toIndex', 'targetSlot'];
  for (let i = 0; i < keys.length; i++) {
    const value = event[keys[i]];
    if (Number.isInteger(value) && value >= 0 && value < 10) return value;
  }
  return null;
}

function readPoints(event) {
  const sources = [event.points, event.hops, event.chainPoints];
  const out = [];
  for (let s = 0; s < sources.length; s++) {
    const list = sources[s];
    if (!Array.isArray(list)) continue;
    const limit = Math.min(list.length, 12);
    for (let i = 0; i < limit && out.length < 6; i++) {
      const point = list[i];
      if (!point || typeof point !== 'object') continue;
      const x = finite(point.x);
      const y = finite(point.y);
      if (x == null || y == null || !saneX(x) || !saneY(y)) continue;
      out.push({ x, y });
    }
    if (out.length) break;
  }
  return out;
}

function resolveKind(event) {
  const raw = normName(event.type);
  const hinted = normName(event.eventType || event.event);
  const candidates = [];
  if (raw) candidates.push(raw);
  if (hinted && hinted !== raw) candidates.push(hinted);
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    if (CRIT_TYPES.has(name)) return { type: 'hit', forceCrit: true, hint: '' };
    const aliased = ALIAS[name] || name;
    if (FEEDBACK.has(aliased)) return { type: aliased, forceCrit: false, hint: '' };
  }
  for (let i = 0; i < candidates.length; i++) {
    if (ELEMENT_BEHAVIOR[candidates[i]]) return { type: '', forceCrit: false, hint: candidates[i] };
  }
  return null;
}

function slotPoint(event, type) {
  const index = readSlot(event, type);
  if (index == null) return null;
  const slot = slotGeometry(index);
  return { x: slot.x, y: slot.y, fromSlot: true };
}

function tellFeedback(type, event) {
  const x = finite(event.x);
  const y = finite(event.y);
  if (x == null || y == null) return null;
  return {
    type,
    element: '',
    behavior: 'neutral',
    crit: false,
    damage: null,
    heal: null,
    position: { x, y, fromSlot: false },
    x,
    y,
    target: null,
    rank: null,
    splash: 0,
    chain: 0,
    pierce: 0,
    delivery: '',
    stacks: 0,
    points: [],
    time: finite(event.time) ?? 0,
    cue: '',
    approach: false,
    execute: false,
    ratio: null,
  };
}

/**
 * Pure description of one feedback event. Returns null when the event is not visual/audio feedback.
 * @param {object} event
 */
function describeFeedback(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const resolved = resolveKind(event);
  if (!resolved) return null;
  if (TELLS.has(resolved.type)) return tellFeedback(resolved.type, event);
  const element = readElement(event, resolved.hint, resolved.type);
  const behavior = behaviorFrom(element);
  let type = resolved.type;
  const target = readTarget(event);
  const damage = readDamage(event);
  if (!type) {
    const hint = resolved.hint;
    if (hint === 'heal' || hint === 'buff' || hint === 'aura') type = 'status';
    else if ((damage != null && damage > 0) || isCrit(event)) type = 'hit';
    else if (target) type = 'shot';
    else type = 'status';
  }
  if (!FEEDBACK.has(type)) return null;
  const loose = readLooseXY(event);
  let position = loose.x != null && loose.y != null ? { x: loose.x, y: loose.y, fromSlot: false } : null;
  if (!position) position = slotPoint(event, type);
  const cueName = normName(event.name || event.tone || event.id || '');
  const cue = type === 'ui' && (cueName === 'error' || cueName === 'invalid' || cueName === 'cancel' || event.ok === false)
    ? 'error'
    : (type === 'ui' ? 'ui' : '');
  return {
    type,
    element,
    behavior,
    crit: resolved.forceCrit || isCrit(event),
    damage,
    heal: readHeal(event, resolved.hint || element),
    position,
    x: loose.x != null ? loose.x : (position ? position.x : null),
    y: loose.y != null ? loose.y : (position ? position.y : null),
    target,
    rank: readRank(event),
    splash: readSplash(event),
    chain: readCount(event.chain, 8),
    pierce: readCount(event.pierce, 8),
    delivery: readDelivery(event, type),
    stacks: readCount(event.stacks, 8),
    points: readPoints(event),
    time: finite(event.time) ?? 0,
    cue,
    approach: type === 'boss' && event.warning === true,
    execute: event.execute === true,
    ratio: readRatio(event),
    reaction: typeof event.reaction === 'string' ? normName(event.reaction) : '',
    radius: finite(event.radius),
    source: typeof event.source === 'string' ? normName(event.source) : '',
    amount: finite(event.amount),
    fieldKind: typeof event.kind === 'string' ? normName(event.kind) : '',
  };
}

function asList(events) {
  if (Array.isArray(events)) return events;
  if (events && typeof events === 'object' && (typeof events.type === 'string' || typeof events.event === 'string' || typeof events.eventType === 'string')) {
    return [events];
  }
  return [];
}

/**
 * Cap and describe a shared event batch. Does not mutate the input array.
 * When `limits` is provided, only its own keys are kept.
 */
function collectFeedback(events, limits) {
  const list = asList(events);
  if (!list.length) return [];
  const start = Math.max(0, list.length - SCAN_LIMIT);
  const groups = new Map();
  for (let i = start; i < list.length; i++) {
    const desc = describeFeedback(list[i]);
    if (!desc) continue;
    let bucket = groups.get(desc.type);
    if (!bucket) {
      bucket = [];
      groups.set(desc.type, bucket);
    }
    bucket.push(desc);
  }
  const table = limits || LIMITS;
  const out = [];
  for (const [type, bucket] of groups) {
    if (!Object.prototype.hasOwnProperty.call(table, type)) continue;
    const cap = table[type];
    if (!Number.isFinite(cap) || cap <= 0) continue;
    if (type === 'hit' || type === 'kill') {
      bucket.sort((a, b) => Number(b.crit) - Number(a.crit) || (b.damage || 0) - (a.damage || 0));
    }
    const count = Math.min(bucket.length, Math.floor(cap));
    for (let i = 0; i < count; i++) out.push(bucket[i]);
  }
  return out;
}

function formatDamage(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (!(rounded > 0)) return '';
  const capped = Math.min(rounded, 9999);
  return Number.isInteger(capped) ? String(capped) : capped.toFixed(1);
}

function fade(item) {
  const max = item.maxLife > 0 ? item.maxLife : 1;
  const t = item.life / max;
  if (!(t > 0)) return 0;
  return t > 0.8 ? 1 : t / 0.8;
}

function fallbackPoint(type) {
  if (type === 'fence_hit' || type === 'defeat') return { x: ARENA.width / 2, y: ARENA.fenceY };
  if (type === 'merge') return { x: ARENA.width / 2, y: ARENA.frontY - 24 };
  if (type === 'draft') return { x: ARENA.width / 2, y: 76 };
  if (type === 'victory') return { x: ARENA.width / 2, y: 220 };
  if (type === 'boss') return { x: ARENA.width / 2, y: 84 };
  return null;
}

function visualPoint(desc) {
  if (desc.position) {
    if (desc.position.fromSlot && (desc.type === 'shot' || desc.type === 'merge' || desc.type === 'status')) {
      return { x: desc.position.x, y: desc.position.y - 14 };
    }
    return { x: desc.position.x, y: desc.position.y };
  }
  return fallbackPoint(desc.type);
}

// Defenders sit below the fence and fire toward the field, so a shot with no
// target aims up. Eight directions keep the arrow on whole pixels.
function shotOctant(desc, point) {
  let dx = 0;
  let dy = point.y >= ARENA.fenceY - 4 ? -1 : 1;
  if (desc.target) {
    const tdx = desc.target.x - point.x;
    const tdy = desc.target.y - point.y;
    if (Math.abs(tdx) + Math.abs(tdy) >= 4) {
      dx = tdx;
      dy = tdy;
    }
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let ux = 0;
  let uy = 0;
  if (adx >= ady * 0.45) ux = dx < 0 ? -1 : 1;
  if (ady >= adx * 0.45) uy = dy < 0 ? -1 : 1;
  if (ux === 0 && uy === 0) uy = dy < 0 ? -1 : 1;
  return { x: ux, y: uy };
}

function createEffects() {
  const particles = [];
  const floaters = [];
  const rings = [];
  let salt = 1;

  function nextSeed(desc, index) {
    salt = (salt + 0x6d2b79f5) >>> 0;
    const x = Math.round((desc.x ?? desc.position?.x ?? 0) * 4);
    const y = Math.round((desc.y ?? desc.position?.y ?? 0) * 4);
    const t = Math.round((desc.time || 0) * 1000);
    return mix(salt ^ Math.imul(t, 0x9e3779b1) ^ Math.imul(x, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35) ^ (index * 17));
  }

  function pushParticle(particle) {
    if (particle.x != null && !Number.isFinite(particle.x)) return;
    if (particle.y != null && !Number.isFinite(particle.y)) return;
    particles.push(particle);
  }

  function pushRing(x, y, radius, grow, color, life, weight, veil) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(radius > 0)) return;
    rings.push({
      x: Math.round(x),
      y: Math.round(y),
      r: radius,
      r0: radius,
      vr: grow,
      color,
      life,
      maxLife: life,
      weight: weight > 1 ? 2 : 1,
      veil: Number.isFinite(veil) ? veil : 0.95,
    });
  }

  function pushStreak(x, y, ux, uy, length, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if ((ux | 0) === 0 && (uy | 0) === 0) return;
    pushParticle({
      kind: 'streak',
      x: Math.round(x),
      y: Math.round(y),
      ux: ux | 0,
      uy: uy | 0,
      length: Math.max(6, Math.min(16, length | 0)),
      shaft: palette.hot,
      head: crit ? '#ffe56a' : palette.core,
      edge: palette.dim,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  // Pierce is a 1px shaft with a tip. It runs backward through the origin,
  // so it does not read as the fletched arrow used for a plain shot.
  function pushNeedle(x, y, ux, uy, length, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if ((ux | 0) === 0 && (uy | 0) === 0) return;
    pushParticle({
      kind: 'needle',
      x: Math.round(x),
      y: Math.round(y),
      ux: ux | 0,
      uy: uy | 0,
      length: Math.max(10, Math.min(18, length | 0)),
      shaft: palette.hot,
      head: crit ? '#ffe56a' : palette.core,
      edge: palette.dim,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  // Splash is a hollow ring. The radius stays small so one burst is a few pixels.
  function pushBurst(x, y, radius, palette, life, crit) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'burst',
      x: Math.round(x),
      y: Math.round(y),
      radius: Math.max(5, Math.min(9, radius | 0)),
      color: palette.hot,
      core: palette.core,
      edge: palette.mid,
      shaft: palette.hot,
      life,
      maxLife: life,
      crit: !!crit,
      trail: true,
      markWhenReduced: true,
      motionOnly: false,
    });
  }

  function pushJump(points, palette, life, mark) {
    if (!points || points.length < 2) return;
    const clean = [];
    for (let i = 0; i < points.length && clean.length < 4; i++) {
      const point = points[i];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      clean.push({ x: point.x, y: point.y });
    }
    if (clean.length < 2) return;
    const placed = !!(mark && Number.isFinite(mark.x) && Number.isFinite(mark.y));
    pushParticle({
      kind: 'jump',
      x: clean[0].x,
      y: clean[0].y,
      points: clean,
      color: palette.core,
      edge: palette.hot,
      shaft: palette.hot,
      core: palette.core,
      crit: !!(mark && mark.crit),
      trail: true,
      markWhenReduced: placed,
      markX: placed ? mark.x : null,
      markY: placed ? mark.y : null,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  // Two hard kinks, at least 5px off the straight line, so a jump is not a needle.
  function kinkedJump(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (!(dist >= 8)) {
      return [
        { x: x1 - 9, y: y1 + 3 },
        { x: x1 - 3, y: y1 - 4 },
        { x: x1 + 3, y: y1 + 2 },
        { x: x1 + 9, y: y1 - 7 },
      ];
    }
    const px = -dy / dist;
    const py = dx / dist;
    const amp = Math.min(9, Math.max(5, dist * 0.18));
    return [
      { x: x0, y: y0 },
      { x: x0 + dx * 0.33 + px * amp, y: y0 + dy * 0.33 + py * amp },
      { x: x0 + dx * 0.66 - px * amp, y: y0 + dy * 0.66 - py * amp },
      { x: x1, y: y1 },
    ];
  }

  function aimedJump(x, y, ux, uy) {
    const px = -uy;
    const py = ux;
    const len = 12;
    return [
      { x, y },
      { x: x + ux * 4 + px * 4, y: y + uy * 4 + py * 4 },
      { x: x + ux * 8 - px * 4, y: y + uy * 8 - py * 4 },
      { x: x + ux * len, y: y + uy * len },
    ];
  }

  // Crit-only. One particle, so it stays inside the particle cap. The diamond
  // is not the plus, needle, hollow ring, or kinked bolt used by other hits.
  function pushFlash(x, y, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'flash',
      x: Math.round(x),
      y: Math.round(y),
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushImpact(x, y, arm, palette, crit, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'impact',
      x: Math.round(x),
      y: Math.round(y),
      arm: Math.max(3, Math.min(7, arm | 0)),
      color: palette.hot,
      core: palette.core,
      crit: !!crit,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushNotch(x, y, heavy, life) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pushParticle({
      kind: 'notch',
      x: Math.round(x),
      y: Math.round(y),
      heavy: !!heavy,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushSpark(x, y, angle, speed, color, life, size, gravity) {
    pushParticle({
      kind: 'spark',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color,
      life,
      maxLife: life,
      gravity,
      motionOnly: true,
    });
  }

  function burst(x, y, count, speed, gravity, upward, color, life, seed, size) {
    for (let i = 0; i < count; i++) {
      const roll = rand01(seed + i * 19);
      const angle = upward
        ? -Math.PI / 2 + (roll - 0.5) * Math.PI
        : roll * Math.PI * 2;
      const varied = speed * (0.55 + rand01(seed + i * 31) * 0.7);
      pushSpark(x, y, angle, varied, color, life, size, gravity);
    }
  }

  function pushArc(x0, y0, x1, y1, color, life, jitter, seed) {
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
    if (Math.hypot(x1 - x0, y1 - y0) < 6) return;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const segs = Math.max(2, Math.min(8, Math.round(dist / 18)));
    const points = [{ x: x0, y: y0 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const jx = (rand01(seed + i * 13) - 0.5) * jitter;
      const jy = (rand01(seed + i * 29) - 0.5) * jitter;
      points.push({ x: x0 + (x1 - x0) * t + jx, y: y0 + (y1 - y0) * t + jy });
    }
    points.push({ x: x1, y: y1 });
    particles.push({ kind: 'arc', points, color, life, maxLife: life, trail: true, motionOnly: false });
  }

  function pushPlus(x, y, arm, color, core, life) {
    pushParticle({ kind: 'plus', x, y, arm, color, core, life, maxLife: life, motionOnly: false });
  }

  function pushBlock(x, y, w, h, color, life) {
    pushParticle({ kind: 'block', x, y, w, h, color, life, maxLife: life, motionOnly: false });
  }

  function pushPips(x, y, count, color, life) {
    if (!(count > 0)) return;
    pushParticle({
      kind: 'pips',
      x, y,
      count: Math.max(1, Math.min(4, count)),
      color,
      life,
      maxLife: life,
      motionOnly: false,
    });
  }

  function pushFloater(x, y, text, color, scale, crit, channel, life, seed) {
    if (!text) return;
    const anchorX = x;
    const anchorY = y - (channel === 'fence' ? 20 : 12);
    const amount = Number(String(text).replace('+', '')) || 0;
    const recent = findFloater(anchorX, anchorY, channel, crit, color);
    if (recent) {
      recent.amount = (recent.amount || 0) + amount;
      const merged = formatDamage(recent.amount);
      if (merged) recent.text = (channel === 'heal' || channel === 'energy') ? `+${merged}` : merged;
      recent.life = recent.maxLife;
      recent.scale = Math.max(recent.scale, scale);
      return;
    }
    const jitter = (rand01(seed) - 0.5) * 6;
    const originX = Math.round(anchorX + jitter);
    const originY = Math.round(anchorY);
    floaters.push({
      x: originX,
      y: originY,
      originX,
      originY,
      anchorX,
      anchorY,
      text,
      color,
      scale,
      crit,
      execute: false,
      channel,
      amount,
      vy: -22,
      life,
      maxLife: life,
    });
  }

  function findFloater(x, y, channel, crit, color) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const floater = floaters[i];
      if (floater.channel !== channel || floater.crit !== crit) continue;
      if (color && floater.color !== color) continue;
      if (floater.maxLife - floater.life > 0.12) continue;
      const ax = floater.anchorX ?? floater.originX;
      const ay = floater.anchorY ?? floater.originY;
      if (Math.abs(ax - x) <= 14 && Math.abs(ay - y) <= 14) return floater;
    }
    return null;
  }

  function showNumber(desc, x, y, seed, palette) {
    if (desc.damage != null && desc.damage > 0) {
      const text = formatDamage(desc.damage);
      const lift = desc.crit ? 16 : 4;
      const nx = desc.behavior === 'poison' ? x + 12 : desc.behavior === 'fire' ? x - 6 : x;
      pushFloater(
        nx, y - lift, text,
        desc.crit ? '#ffe56a' : palette.hot,
        desc.crit ? 3 : 2,
        desc.crit,
        'hit',
        desc.crit ? 0.62 : 0.5,
        seed,
      );
      const floater = floaters[floaters.length - 1];
      if (floater && desc.execute === true) floater.execute = true;
      return;
    }
    if (desc.heal != null && desc.heal > 0) {
      const text = formatDamage(desc.heal);
      if (text) pushFloater(x, y, `+${text}`, PALETTES.heal.hot, 2, false, 'heal', 0.5, seed);
    }
  }

  function spawnShot(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    const aim = shotOctant(desc, point);
    const life = desc.crit ? 0.2 : 0.16;
    if (desc.delivery === 'pierce') {
      pushNeedle(point.x, point.y, aim.x, aim.y, desc.crit ? 16 : 13, palette, desc.crit, life);
      return;
    }
    if (desc.delivery === 'splash') {
      pushBurst(point.x, point.y, 6, palette, life, desc.crit);
      return;
    }
    if (desc.delivery === 'chain') {
      pushJump(aimedJump(point.x, point.y, aim.x, aim.y), palette, life, { x: point.x, y: point.y, crit: desc.crit });
      return;
    }
    pushStreak(point.x, point.y, aim.x, aim.y, desc.crit ? 14 : 10, palette, desc.crit, life);
  }

  function spawnHit(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    if (desc.delivery === 'pierce') {
      const aim = shotOctant(desc, point);
      pushNeedle(point.x, point.y, aim.x, aim.y, desc.crit ? 16 : 14, palette, desc.crit, 0.22);
    } else if (desc.delivery === 'splash') {
      const radius = desc.splash > 0 ? desc.splash : 12;
      pushRing(point.x, point.y, radius, desc.splash > 0 ? 10 : 16, palette.mid, 0.28, 2);
      pushBurst(point.x, point.y, 7, palette, 0.24, desc.crit);
    } else if (desc.delivery === 'chain') {
      const mark = { x: point.x, y: point.y, crit: desc.crit };
      if (desc.points.length) {
        const hops = Math.min(desc.points.length, desc.chain > 0 ? desc.chain : desc.points.length, 3);
        let prev = point;
        for (let i = 0; i < hops; i++) {
          const hop = desc.points[i];
          pushJump(kinkedJump(prev.x, prev.y, hop.x, hop.y), palette, 0.18, i === 0 ? mark : null);
          prev = hop;
        }
      } else if (desc.target) {
        pushJump(kinkedJump(point.x, point.y, desc.target.x, desc.target.y), palette, 0.18, mark);
      } else {
        pushJump(kinkedJump(point.x, point.y, point.x, point.y), palette, 0.18, mark);
      }
    } else {
      if (desc.splash > 0) pushRing(point.x, point.y, desc.splash, 10, palette.mid, 0.28, 2);
      pushImpact(point.x, point.y, desc.crit ? 6 : 4, palette, desc.crit, desc.crit ? 0.28 : 0.2);
      if (desc.points.length && (desc.behavior === 'lightning' || desc.chain > 0)) {
        const hops = Math.min(desc.points.length, desc.chain > 0 ? desc.chain : 1, 3);
        for (let i = 0; i < hops; i++) {
          const hop = desc.points[i];
          pushArc(point.x, point.y, hop.x, hop.y, palette.core, 0.12, desc.behavior === 'lightning' ? 10 : 4, seed + i * 9);
        }
      }
    }
    if (desc.crit) {
      pushFlash(point.x, point.y, 0.36);
      pushRing(point.x, point.y, 13, 34, '#ffe56a', 0.34, 2);
    }
    if (desc.reaction === 'steam') {
      pushRing(point.x, point.y, 14, 42, PALETTES.steam.hot, 0.36, 2);
      pushRing(point.x, point.y, 8, 28, PALETTES.steam.mid, 0.28, 1);
      burst(point.x, point.y, 7, 46, -42, true, PALETTES.steam.hot, 0.34, seed + 11, 2);
    } else if (desc.reaction === 'catalyst') {
      pushRing(point.x, point.y, 12, 46, PALETTES.catalyst.hot, 0.36, 2);
      pushPlus(point.x, point.y, 5, PALETTES.catalyst.hot, '#ffffff', 0.26);
      burst(point.x, point.y, 7, 64, 0, false, PALETTES.catalyst.mid, 0.3, seed + 13, 2);
    }
    showNumber(desc, point.x, point.y, seed, palette);
    if (desc.stacks >= 2) pushPips(point.x + 8, point.y + 8, Math.min(4, desc.stacks), palette.mid, 0.36);
  }

  function spawnKill(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    pushRing(point.x, point.y, 8, 40, PALETTES.kill.hot, 0.32);
    pushPlus(point.x, point.y, 3, PALETTES.kill.core, palette.hot, 0.2);
    burst(point.x, point.y, 8, 58, 40, false, PALETTES.kill.mid, 0.34, seed, 2);
    burst(point.x, point.y, 3, 70, 0, true, palette.hot, 0.24, seed + 5, 2);
  }

  function spawnFence(desc, seed) {
    const x = desc.x != null ? desc.x : (desc.position ? desc.position.x : ARENA.width / 2);
    const y = ARENA.fenceY;
    const damage = desc.damage != null && desc.damage > 0 ? desc.damage : 0;
    pushNotch(x, y, damage >= 12, 0.46);
    const text = formatDamage(damage);
    if (text) pushFloater(x, y, text, '#ffb4a8', 2, false, 'fence', 0.52, seed);
  }

  function spawnMerge(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = paletteFor(desc.element, desc.behavior);
    pushRing(point.x, point.y, 6, 26, palette.core, 0.42);
    pushRing(point.x, point.y, 12, 18, palette.mid, 0.5);
    pushPlus(point.x, point.y, 4, palette.hot, palette.core, 0.3);
    pushBlock(point.x, point.y, 4, 4, palette.core, 0.12);
    for (let i = 0; i < 8; i++) {
      const angle = rand01(seed + i * 11) * Math.PI * 2;
      pushParticle({
        kind: 'orbit',
        cx: point.x,
        cy: point.y,
        angle,
        radius: 12 + rand01(seed + i * 7) * 10,
        spin: (rand01(seed + i) < 0.5 ? -1 : 1) * (5 + rand01(seed + i * 3) * 3),
        radial: -26,
        x: point.x,
        y: point.y,
        size: 2,
        color: i % 2 ? palette.hot : palette.core,
        life: 0.48,
        maxLife: 0.48,
        motionOnly: true,
      });
    }
    if (desc.rank != null) pushPips(point.x, point.y - 16, desc.rank, palette.hot, 0.62);
  }

  function spawnDraft(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 10, 8, PALETTES.draft.mid, 0.4);
    for (let i = 0; i < 3; i++) {
      pushBlock(point.x + (i - 1) * 8, point.y, 3, 3, i === 1 ? PALETTES.draft.hot : PALETTES.draft.core, 0.46);
    }
  }

  function spawnVictory(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 12, 22, PALETTES.victory.hot, 0.6);
    pushParticle({ kind: 'glowline', y: ARENA.fenceY, color: PALETTES.victory.hot, broken: false, life: 0.7, maxLife: 0.7, motionOnly: false });
    for (let i = 0; i < 8; i++) {
      const x = 28 + rand01(seed + i * 17) * (ARENA.width - 56);
      pushParticle({
        kind: 'mote',
        x,
        y: ARENA.fenceY - rand01(seed + i) * 16,
        vx: (rand01(seed + i * 5) - 0.5) * 14,
        vy: -(18 + rand01(seed + i * 9) * 28),
        size: 2,
        color: i % 2 ? PALETTES.victory.core : PALETTES.victory.hot,
        life: 0.62,
        maxLife: 0.62,
        motionOnly: true,
      });
    }
  }

  function spawnDefeat(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushParticle({ kind: 'glowline', y: ARENA.fenceY, color: PALETTES.defeat.hot, broken: true, life: 0.7, maxLife: 0.7, motionOnly: false });
    pushParticle({ kind: 'crack', x: ARENA.width / 2, y: ARENA.fenceY, length: 48, color: PALETTES.defeat.core, life: 0.6, maxLife: 0.6, motionOnly: false });
    pushRing(point.x, ARENA.fenceY, 10, 16, PALETTES.defeat.mid, 0.45);
    burst(ARENA.width / 2, ARENA.fenceY, 7, 36, 90, true, PALETTES.defeat.hot, 0.4, seed, 2);
  }

  function spawnUi(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = desc.cue === 'error' ? PALETTES.defeat : PALETTES.ui;
    pushPlus(point.x, point.y, 2, palette.hot, palette.core, 0.16);
  }

  function spawnStatus(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const palette = desc.element === 'heal' || desc.heal ? PALETTES.heal : paletteFor(desc.element, desc.behavior);
    const style = STYLE[desc.behavior] || STYLE.neutral;
    pushPlus(point.x, point.y, 2, palette.hot, palette.core, 0.16);
    if (style.ring || desc.behavior === 'support') pushRing(point.x, point.y, 7, 14, palette.mid, 0.24);
    burst(point.x, point.y, 3, 28, style.gravity, desc.behavior === 'fire', palette.mid, 0.2, seed, 2);
    if (!(desc.damage > 0)) showNumber(desc, point.x, point.y, seed, palette);
    if (desc.stacks >= 2) pushPips(point.x + 8, point.y + 6, Math.min(4, desc.stacks), palette.mid, 0.32);
  }

  function tellPoint(desc) {
    const x = finite(desc.x);
    const y = finite(desc.y);
    if (x == null || y == null) return null;
    return { x, y };
  }

  // Short shaft pointing down. Reduced motion keeps the usual short impact.
  function spawnLeap(desc) {
    const point = tellPoint(desc);
    if (!point) return;
    pushStreak(point.x, point.y, 0, 1, 6, LEAP_INK, false, 0.16);
  }

  // One still chip, plus two scraps that reduced motion drops.
  function spawnSplit(desc, seed) {
    const point = tellPoint(desc);
    if (!point) return;
    pushBlock(point.x, point.y, 2, 2, SPLIT_CHIPS[1], 0.2);
    for (let i = 0; i < 2; i++) {
      const angle = -2.4 + rand01(seed + i * 23) * 1.6;
      pushSpark(point.x + (i === 0 ? -2 : 2), point.y, angle, 24, SPLIT_CHIPS[i === 0 ? 0 : 2], 0.16, 2, 36);
    }
  }

  // One mote rising a short way. Reduced motion keeps a still mark at the origin.
  function spawnMend(desc) {
    const point = tellPoint(desc);
    if (!point) return;
    pushParticle({
      kind: 'mote',
      x: point.x,
      y: point.y,
      vx: 0,
      vy: -18,
      size: 2,
      color: PALETTES.heal.hot,
      life: 0.26,
      maxLife: 0.26,
      motionOnly: true,
      markWhenReduced: true,
      markX: point.x,
      markY: point.y,
      shaft: PALETTES.heal.hot,
      core: PALETTES.heal.core,
    });
  }

  // Thin ring, held faint so it does not read as a kill or a hit.
  function spawnPhase(desc) {
    const point = tellPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 6, 4, '#c5d0c8', 0.28, 1, 0.34);
  }

  function spawnBoss(desc, seed) {
    if (desc.approach) return;
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 12, 18, PALETTES.boss.hot, 0.46);
    pushPlus(point.x, point.y, 4, PALETTES.boss.core, PALETTES.boss.hot, 0.28);
    burst(point.x, point.y, 6, 40, 0, false, PALETTES.boss.mid, 0.3, seed, 2);
  }

  function spawnFenceSurge(desc, seed) {
    const y = desc.y != null ? desc.y : ARENA.fenceY;
    pushParticle({ kind: 'glowline', y: y - 4, color: PALETTES.surge.hot, broken: false, life: 0.65, maxLife: 0.65, motionOnly: false });
    pushParticle({ kind: 'glowline', y: y - 8, color: PALETTES.draft.hot, broken: false, life: 0.48, maxLife: 0.48, motionOnly: false });
    for (let i = 0; i < 4; i++) {
      const rx = 54 + i * 84;
      pushRing(rx, y - 6, 12, 85, i % 2 ? PALETTES.surge.hot : PALETTES.draft.hot, 0.48, 2);
    }
    for (let i = 0; i < 14; i++) {
      const sx = 24 + rand01(seed + i * 17) * (ARENA.width - 48);
      pushParticle({
        kind: 'mote',
        x: sx,
        y: y - 4,
        vx: (rand01(seed + i * 7) - 0.5) * 28,
        vy: -(85 + rand01(seed + i * 11) * 95),
        size: 2,
        color: i % 2 ? PALETTES.surge.core : PALETTES.draft.hot,
        life: 0.46,
        maxLife: 0.46,
        motionOnly: true,
      });
    }
  }

  function spawnCorpseExplode(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const r = Math.max(18, Math.min(68, desc.radius || 46));
    pushRing(point.x, point.y, Math.round(r * 0.45), r * 1.4, PALETTES.fire.hot, 0.38, 2);
    pushRing(point.x, point.y, Math.round(r * 0.25), r * 1.1, PALETTES.poison.hot, 0.32, 1);
    pushFlash(point.x, point.y, 0.26);
    burst(point.x, point.y, 10, 82, 30, false, PALETTES.fire.mid, 0.36, seed, 2);
    burst(point.x, point.y, 6, 62, 18, false, PALETTES.poison.hot, 0.34, seed + 23, 2);
  }

  function spawnCloudSpawn(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    const r = Math.max(12, Math.min(54, desc.radius || 32));
    pushRing(point.x, point.y, Math.round(r * 0.55), r * 0.7, PALETTES.poison.hot, 0.34, 1, 0.5);
  }

  function spawnKnockback(desc) {
    const point = visualPoint(desc);
    if (!point) return;
    pushStreak(point.x, point.y + 4, 0, -1, 9, PALETTES.ui, false, 0.18);
  }

  function spawnNapalmBlast(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const r = Math.max(24, Math.min(72, desc.radius || 58));
    pushRing(point.x, point.y, Math.round(r * 0.45), r * 1.6, PALETTES.napalm.hot, 0.42, 2);
    pushRing(point.x, point.y, Math.round(r * 0.25), r * 1.15, PALETTES.napalm.mid, 0.36, 2);
    pushFlash(point.x, point.y, 0.32);
    burst(point.x, point.y, 12, 92, -32, true, PALETTES.napalm.hot, 0.42, seed, 2);
    burst(point.x, point.y, 6, 68, 22, false, PALETTES.napalm.mid, 0.34, seed + 17, 2);
  }

  function spawnArmoredCar(desc, seed) {
    const point = visualPoint(desc) || { x: ARENA.width / 2, y: ARENA.fenceY - 12 };
    pushRing(point.x, point.y, 12, 54, PALETTES.draft.hot, 0.36, 2);
    pushPlus(point.x, point.y, 5, PALETTES.bolt.hot, '#ffffff', 0.24);
    burst(point.x, point.y, 8, 66, 20, true, PALETTES.draft.hot, 0.34, seed, 2);
  }

  function spawnCryoBarrage(desc, seed) {
    const point = visualPoint(desc) || { x: ARENA.width / 2, y: ARENA.fenceY - 12 };
    pushRing(point.x, point.y, 14, 62, PALETTES.frost.hot, 0.34, 2);
    pushPlus(point.x, point.y, 5, PALETTES.frost.core, '#ffffff', 0.22);
    burst(point.x, point.y, 8, 74, -20, true, PALETTES.frost.hot, 0.34, seed, 2);
  }

  function spawnOrbitalBeam(desc, seed) {
    const x = desc.x != null ? desc.x : (desc.position ? desc.position.x : ARENA.width / 2);
    const y = desc.y != null ? desc.y : 220;
    pushRing(x, y, 16, 72, PALETTES.orbital.hot, 0.42, 2);
    pushRing(x, ARENA.fenceY - 10, 14, 58, PALETTES.orbital.core, 0.38, 2);
    pushFlash(x, y, 0.3);
    burst(x, y, 10, 88, 0, false, PALETTES.orbital.hot, 0.38, seed, 2);
  }

  function spawnEmStrike(desc, seed) {
    const points = desc.points && desc.points.length
      ? desc.points
      : (desc.position ? [desc.position] : []);
    if (!points.length) return;
    const first = points[0];
    // Jagged sky-to-ground lightning bolt descending onto the first zombie
    pushArc(first.x + ((seed & 7) - 3) * 4, 4, first.x, first.y, '#ffffff', 0.28, 16, seed);
    pushArc(first.x + ((seed & 7) - 3) * 4 + 2, 4, first.x, first.y, PALETTES.orbital.hot, 0.24, 14, seed + 5);
    pushRing(first.x, first.y, 12, 48, PALETTES.orbital.hot, 0.34, 2);
    pushFlash(first.x, first.y, 0.26);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      pushJump(kinkedJump(a.x, a.y, b.x, b.y), PALETTES.orbital, 0.26, { x: b.x, y: b.y, crit: i === 1 });
      pushRing(b.x, b.y, 8, 34, PALETTES.lightning.hot, 0.28, 1);
    }
    burst(first.x, first.y, 7, 76, 0, false, PALETTES.orbital.hot, 0.3, seed + 13, 2);
  }

  function spawnWallImmune(desc, seed) {
    const x = desc.x != null ? desc.x : (desc.position ? desc.position.x : ARENA.width / 2);
    const y = ARENA.fenceY - 4;
    pushParticle({ kind: 'glowline', y, color: PALETTES.aegis.hot, broken: false, life: 0.42, maxLife: 0.42, motionOnly: false });
    pushRing(x, y, 12, 46, PALETTES.aegis.hot, 0.34, 2);
    pushPlus(x, y - 4, 5, PALETTES.aegis.core, '#ffffff', 0.24);
    burst(x, y - 2, 6, 56, -24, true, PALETTES.aegis.hot, 0.3, seed, 2);
  }

  function spawnBulletSplit(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushPlus(point.x, point.y, 3, PALETTES.bolt.hot, '#ffffff', 0.16);
    burst(point.x, point.y, 4, 54, 0, false, PALETTES.bolt.hot, 0.18, seed, 1);
  }

  function spawnCryoShatter(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    const r = Math.max(16, Math.min(54, desc.radius || 40));
    pushRing(point.x, point.y, Math.round(r * 0.45), r * 1.25, PALETTES.frost.hot, 0.34, 2);
    pushPlus(point.x, point.y, 4, PALETTES.frost.core, '#ffffff', 0.22);
    burst(point.x, point.y, 8, 72, 16, false, PALETTES.frost.hot, 0.32, seed, 2);
  }

  function spawn(desc, index) {
    const seed = nextSeed(desc, index);
    switch (desc.type) {
      case 'shot': spawnShot(desc, seed); break;
      case 'hit': spawnHit(desc, seed); break;
      case 'kill': spawnKill(desc, seed); break;
      case 'fence_hit': spawnFence(desc, seed); break;
      case 'upgrade_tower': spawnMerge(desc, seed); break;
      case 'draft': spawnDraft(desc); break;
      case 'victory': spawnVictory(desc, seed); break;
      case 'defeat': spawnDefeat(desc, seed); break;
      case 'ui': spawnUi(desc); break;
      case 'status': spawnStatus(desc, seed); break;
      case 'boss': spawnBoss(desc, seed); break;
      case 'leap': spawnLeap(desc); break;
      case 'split': spawnSplit(desc, seed); break;
      case 'mend': spawnMend(desc); break;
      case 'phase': spawnPhase(desc); break;
      case 'fence_surge': spawnFenceSurge(desc, seed); break;
      case 'corpse_explode': spawnCorpseExplode(desc, seed); break;
      case 'cloud_spawn': spawnCloudSpawn(desc); break;
      case 'knockback': spawnKnockback(desc); break;
      case 'napalm_blast': spawnNapalmBlast(desc, seed); break;
      case 'armored_car': spawnArmoredCar(desc, seed); break;
      case 'cryo_barrage': spawnCryoBarrage(desc, seed); break;
      case 'orbital_beam': spawnOrbitalBeam(desc, seed); break;
      case 'em_strike': spawnEmStrike(desc, seed); break;
      case 'wall_immune': spawnWallImmune(desc, seed); break;
      case 'bullet_split': spawnBulletSplit(desc, seed); break;
      case 'cryo_shatter': spawnCryoShatter(desc, seed); break;
      default: break;
    }
  }

  function trimAll() {
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    if (floaters.length > MAX_FLOATERS) floaters.splice(0, floaters.length - MAX_FLOATERS);
    if (rings.length > MAX_RINGS) rings.splice(0, rings.length - MAX_RINGS);
  }

  function ingest(events) {
    const batch = collectFeedback(events);
    for (let i = 0; i < batch.length; i++) spawn(batch[i], i);
    trimAll();
  }

  function stepParticle(particle, dt) {
    if (particle.kind === 'spark') {
      particle.vy += (particle.gravity || 0) * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    } else if (particle.kind === 'mote') {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    } else if (particle.kind === 'orbit') {
      particle.angle += particle.spin * dt;
      particle.radius = Math.max(0, particle.radius + particle.radial * dt);
      particle.x = particle.cx + Math.cos(particle.angle) * particle.radius;
      particle.y = particle.cy + Math.sin(particle.angle) * particle.radius * 0.72;
    }
  }

  function driftedOut(particle) {
    if (particle.kind !== 'spark' && particle.kind !== 'mote' && particle.kind !== 'orbit') return false;
    return particle.x < -48 || particle.x > ARENA.width + 48 || particle.y < -96 || particle.y > ARENA.height + 48;
  }

  function step(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      stepParticle(particle, dt);
      if (driftedOut(particle) || (particle.x != null && !Number.isFinite(particle.x)) || (particle.y != null && !Number.isFinite(particle.y))) {
        particles.splice(i, 1);
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const floater = floaters[i];
      floater.life -= dt;
      if (floater.life <= 0 || !Number.isFinite(floater.life)) {
        floaters.splice(i, 1);
        continue;
      }
      floater.y += floater.vy * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ring.r = Math.min(ring.r0 + 52, ring.r + ring.vr * dt);
    }
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (particles.length + floaters.length + rings.length === 0) return;
    // A stalled tab should drop leftover flashes instead of replaying them.
    if (dt >= 1.25) {
      clear();
      return;
    }
    let left = dt;
    const slice = 1 / 30;
    let guard = 0;
    while (left > 1e-8 && guard++ < 45) {
      const h = left > slice ? slice : left;
      step(h);
      left -= h;
    }
  }

  function isRich(ctx) {
    return typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function' && typeof ctx.stroke === 'function';
  }

  function drawPixelRing(ctx, x, y, radius, color, alpha, weight) {
    if (!(radius > 0) || alpha < 0.02) return;
    if (isRich(ctx)) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = (weight > 1 ? 4.2 : 2.6);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = (weight > 1 ? 2.2 : 1.4);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const size = weight > 1 ? 2 : 1;
    const steps = Math.max(8, Math.min(48, Math.round(radius * 1.15)));
    const cx = Math.round(x);
    const cy = Math.round(y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), size, size);
    }
  }

  function drawStreak(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const len = particle.length | 0;
    if (isRich(ctx)) {
      const mag = Math.hypot(ux, uy) || 1;
      const dx = (ux / mag) * len;
      const dy = (uy / mag) * len;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = particle.shaft;
      ctx.lineWidth = particle.crit ? 4.0 : 2.8;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x + dx, particle.y + dy);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.head;
      ctx.lineWidth = particle.crit ? 2.0 : 1.4;
      ctx.beginPath();
      ctx.moveTo(particle.x + dx * 0.35, particle.y + dy * 0.35);
      ctx.lineTo(particle.x + dx, particle.y + dy);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const px = -uy;
    const py = ux;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.edge;
    for (let i = 0; i <= len - 3; i++) {
      const x = ox + ux * i;
      const y = oy + uy * i;
      ctx.fillRect(x + px, y + py, 1, 1);
      ctx.fillRect(x - px, y - py, 1, 1);
    }
    ctx.fillStyle = particle.shaft;
    for (let i = 0; i <= len - 3; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    ctx.fillStyle = particle.head;
    for (let i = Math.max(0, len - 2); i <= len; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    const bx = ox + ux * (len - 2);
    const by = oy + uy * (len - 2);
    ctx.fillRect(bx + px * 2, by + py * 2, 1, 1);
    ctx.fillRect(bx - px * 2, by - py * 2, 1, 1);
  }

  function drawNeedle(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const len = particle.length | 0;
    if (isRich(ctx)) {
      const mag = Math.hypot(ux, uy) || 1;
      const nx = ux / mag;
      const ny = uy / mag;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.65;
      ctx.strokeStyle = particle.shaft;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(particle.x - nx * 5, particle.y - ny * 5);
      ctx.lineTo(particle.x + nx * len, particle.y + ny * len);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      return;
    }
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const px = -uy;
    const py = ux;
    const back = 5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.shaft;
    for (let i = -back; i <= len - 2; i++) ctx.fillRect(ox + ux * i, oy + uy * i, 1, 1);
    ctx.fillStyle = particle.head;
    ctx.fillRect(ox + ux * len, oy + uy * len, 1, 1);
    ctx.fillRect(ox + ux * (len - 1) + px, oy + uy * (len - 1) + py, 1, 1);
    ctx.fillRect(ox + ux * (len - 1) - px, oy + uy * (len - 1) - py, 1, 1);
    ctx.fillStyle = particle.edge;
    ctx.fillRect(ox - ux * back + px, oy - uy * back + py, 1, 1);
    ctx.fillRect(ox - ux * back - px, oy - uy * back - py, 1, 1);
  }

  function drawBurst(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const radius = Math.max(5, particle.radius | 0);
    if (isRich(ctx)) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = particle.edge || particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = particle.core || '#ffffff';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.edge || particle.color;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), 1, 1);
    }
    ctx.fillStyle = particle.color;
    const inner = Math.max(3, radius - 3);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.4;
      ctx.fillRect(Math.round(cx + Math.cos(angle) * inner), Math.round(cy + Math.sin(angle) * inner), 1, 1);
    }
    ctx.fillStyle = particle.core || particle.color;
    ctx.fillRect(cx, cy - radius - 2, 1, 2);
    ctx.fillRect(cx, cy + radius + 1, 1, 2);
    ctx.fillRect(cx - radius - 2, cy, 2, 1);
    ctx.fillRect(cx + radius + 1, cy, 2, 1);
  }

  function drawJump(ctx, particle, alpha) {
    if (alpha < 0.02 || !particle.points || particle.points.length < 2) return;
    if (isRich(ctx)) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(particle.points[0].x, particle.points[0].y);
      for (let i = 1; i < particle.points.length; i++) {
        ctx.lineTo(particle.points[i].x, particle.points[i].y);
      }
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = particle.edge || '#58b8ff';
      ctx.lineWidth = 5.0;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.92;
      ctx.strokeStyle = particle.color || '#a6e4ff';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 1; i < particle.points.length; i++) {
      const a = particle.points[i - 1];
      const b = particle.points[i];
      drawSegment(ctx, a.x, a.y, b.x, b.y);
    }
    if (particle.points.length >= 3) {
      const a = particle.points[1];
      const b = particle.points[2];
      ctx.fillStyle = particle.edge || particle.color;
      drawSegment(ctx, a.x + 1, a.y, b.x + 1, b.y - 1);
    }
  }

  function drawDiamond(ctx, cx, cy, radius) {
    const reach = radius | 0;
    for (let dx = -reach; dx <= reach; dx++) {
      const dy = reach - Math.abs(dx);
      ctx.fillRect(cx + dx, cy - dy, 1, 1);
      if (dy) ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }

  function drawFlash(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    if (isRich(ctx)) {
      const cx = particle.x;
      const cy = particle.y;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = alpha;
      // 4-point blazing cartoon golden crit star
      ctx.beginPath();
      const spikes = 4;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? 12 : 4.2;
        const a = (i * Math.PI) / spikes;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffe56a';
      ctx.fill();
      ctx.strokeStyle = '#5c340e';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3a2410';
    drawDiamond(ctx, cx, cy, 8);
    ctx.fillStyle = '#ffe56a';
    drawDiamond(ctx, cx, cy, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 3, cy, 7, 1);
    ctx.fillRect(cx, cy - 3, 1, 7);
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillRect(cx - 11, cy, 2, 1);
    ctx.fillRect(cx + 10, cy, 2, 1);
    ctx.fillRect(cx, cy - 11, 1, 2);
    ctx.fillRect(cx, cy + 10, 1, 2);
  }

  function drawImpact(ctx, particle, alpha, short) {
    if (alpha < 0.02) return;
    let arm = Math.max(3, particle.arm | 0);
    if (short) arm = particle.crit ? 4 : 3;
    if (isRich(ctx)) {
      const cx = particle.x;
      const cy = particle.y;
      const spikes = short ? 4 : 6;
      const outer = arm + 2.5;
      const inner = Math.max(2.2, outer * 0.42);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / spikes;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = short && particle.crit ? '#ffe56a' : particle.color;
      ctx.fill();
      ctx.strokeStyle = '#140e0c';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = particle.core || '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, inner * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#140e0c';
    ctx.fillRect(cx - arm, cy - 1, arm * 2 + 1, 3);
    ctx.fillRect(cx - 1, cy - arm, 3, arm * 2 + 1);
    ctx.fillStyle = short && particle.crit ? '#ffe56a' : particle.color;
    ctx.fillRect(cx - arm, cy, arm * 2 + 1, 1);
    ctx.fillRect(cx, cy - arm, 1, arm * 2 + 1);
    if (!short) {
      for (let i = 2; i < arm; i++) {
        ctx.fillRect(cx + i, cy + i, 1, 1);
        ctx.fillRect(cx - i, cy + i, 1, 1);
        ctx.fillRect(cx + i, cy - i, 1, 1);
        ctx.fillRect(cx - i, cy - i, 1, 1);
      }
    }
    ctx.fillStyle = particle.core || particle.color;
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    if (particle.crit) {
      ctx.fillStyle = '#ffe56a';
      ctx.fillRect(cx - arm, cy, 1, 1);
      ctx.fillRect(cx + arm, cy, 1, 1);
      ctx.fillRect(cx, cy - arm, 1, 1);
      ctx.fillRect(cx, cy + arm, 1, 1);
    }
  }

  function drawNotch(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    if (isRich(ctx)) {
      const cx = particle.x;
      const y = particle.y;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath();
      ctx.arc(cx, y, particle.heavy ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff2dd';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }
    const cx = Math.round(particle.x);
    const y = Math.round(particle.y);
    const heavy = particle.heavy ? 1 : 0;
    const wing = 4 + heavy;
    const gap = 2 + heavy;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(cx - gap, y - 2, gap * 2, 5);
    ctx.fillStyle = '#fff2dd';
    ctx.fillRect(cx - wing - gap, y - 2, wing, 2);
    ctx.fillRect(cx + gap, y - 2, wing, 2);
    ctx.fillStyle = '#e7c89a';
    ctx.fillRect(cx - wing - gap, y, wing, 1);
    ctx.fillRect(cx + gap, y, wing, 1);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(cx - 1, y - 8, 2, 6);
    ctx.fillStyle = '#fff2dd';
    ctx.fillRect(cx - 1, y - 8, 2, 1);
    ctx.fillStyle = '#c4543c';
    ctx.fillRect(cx - 2 - heavy, y + 3, 1, 2);
    ctx.fillRect(cx + 1 + heavy, y + 3, 1, 2);
    ctx.fillStyle = '#e7c89a';
    ctx.fillRect(cx - 3 - heavy, y + 5, 1, 1);
    ctx.fillRect(cx + 2 + heavy, y + 5, 1, 1);
  }

  function drawPlus(ctx, x, y, arm, color, core, alpha) {
    if (alpha < 0.02) return;
    if (isRich(ctx)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - arm, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x, y + arm);
      ctx.stroke();
      ctx.fillStyle = core || '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const cx = Math.round(x);
    const cy = Math.round(y);
    const reach = Math.max(1, arm | 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cx - reach, cy, reach * 2 + 1, 1);
    ctx.fillRect(cx, cy - reach, 1, reach * 2 + 1);
    ctx.fillStyle = core || color;
    ctx.fillRect(cx, cy, 1, 1);
  }

  function drawDot(ctx, particle, alpha) {
    if (alpha < 0.02 || !Number.isFinite(particle.x) || !Number.isFinite(particle.y)) return;
    const size = particle.life < particle.maxLife * 0.35 ? 1.2 : (particle.size || 2.2);
    if (isRich(ctx)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(1, size * 0.68), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const s = Math.max(1, Math.round(size));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x - s / 2), Math.round(particle.y - s / 2), s, s);
  }

  function drawSegment(ctx, x0, y0, x1, y1) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx - dy;
    const maxSteps = Math.min(720, dx + dy + 1);
    for (let n = 0; n < maxSteps; n++) {
      ctx.fillRect(x, y, 1, 1);
      if (x === xe && y === ye) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function drawArc(ctx, particle, alpha) {
    if (alpha < 0.02 || !particle.points || particle.points.length < 2) return;
    if (isRich(ctx)) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(particle.points[0].x, particle.points[0].y);
      for (let i = 1; i < particle.points.length; i++) {
        ctx.lineTo(particle.points[i].x, particle.points[i].y);
      }
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 4.6;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 1; i < particle.points.length; i++) {
      const a = particle.points[i - 1];
      const b = particle.points[i];
      drawSegment(ctx, a.x, a.y, b.x, b.y);
    }
  }

  function drawPips(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const count = particle.count | 0;
    const total = count * 2 + Math.max(0, count - 1);
    let cursor = Math.round(particle.x - total / 2);
    const y = Math.round(particle.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 0; i < count; i++) {
      ctx.fillRect(cursor, y, 2, 2);
      cursor += 3;
    }
  }

  function drawCrack(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    const y = Math.round(particle.y);
    const start = Math.round(particle.x - particle.length / 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    for (let i = 0; i < particle.length; i += 2) {
      const drop = i % 4 === 0 ? 1 : 0;
      ctx.fillRect(start + i, y + drop, 2, 1);
    }
  }

  function drawGlowline(ctx, particle, alpha) {
    if (alpha < 0.02) return;
    if (isRich(ctx)) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(8, particle.y);
      ctx.lineTo(ARENA.width - 8, particle.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = particle.color;
    const y = Math.round(particle.y);
    for (let x = 8; x < ARENA.width - 8; x += 3) {
      if (particle.broken && x % 9 === 0) continue;
      const jag = particle.broken && x % 12 < 4 ? 1 : 0;
      ctx.fillRect(x, y + jag, 2, 1);
    }
  }

  function drawText(ctx, text, x, y, color, scale, alpha, pop = 1) {
    if (!text || alpha < 0.02) return;
    if (typeof ctx.fillText === 'function' && typeof ctx.strokeText === 'function') {
      const isCritNum = (scale || 1) >= 2;
      const fontSize = Math.round((isCritNum ? 13 : 10) * pop);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = isCritNum ? 3.2 : 2.5;
      ctx.strokeStyle = '#11161b';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
      return;
    }
    const size = Math.max(1, scale | 0);
    const advance = 3 * size + size;
    const origin = Math.round(x - (text.length * advance - size) / 2);
    const top = Math.round(y);
    const blit = (offsetX, offsetY) => {
      let cursor = origin + offsetX;
      const rowTop = top + offsetY;
      for (let c = 0; c < text.length; c++) {
        const glyph = GLYPHS[text[c]];
        if (glyph) {
          for (let row = 0; row < glyph.length; row++) {
            const line = glyph[row];
            for (let col = 0; col < line.length; col++) {
              if (line[col] === '1') ctx.fillRect(cursor + col * size, rowTop + row * size, size, size);
            }
          }
        }
        cursor += advance;
      }
    };
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#140e0c';
    blit(1, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    blit(0, 0);
  }

  function drawFloater(ctx, floater, reduced) {
    const alpha = fade(floater);
    const x = reduced ? floater.originX : floater.x;
    const y = reduced ? floater.originY : floater.y;
    const age = floater.maxLife > 0 ? 1 - floater.life / floater.maxLife : 1;
    const pop = reduced ? 1 : (age < 0.16 ? 1 + (1 - age / 0.16) * 0.32 : 1);
    drawText(ctx, floater.text, x, y, floater.color, floater.scale, alpha, pop);
    if (floater.execute === true && alpha >= 0.02) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff3a32';
      if (isRich(ctx)) {
        ctx.beginPath();
        ctx.arc(x, y - 9, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 2);
      }
      ctx.restore();
    }
  }

  function drawReducedMark(ctx, particle, alpha) {
    const x = Number.isFinite(particle.markX) ? particle.markX : particle.x;
    const y = Number.isFinite(particle.markY) ? particle.markY : particle.y;
    drawImpact(ctx, {
      x,
      y,
      arm: particle.crit ? 4 : 3,
      color: particle.crit ? '#ffe56a' : (particle.shaft || particle.color || particle.head || '#d5ddd8'),
      core: particle.crit ? '#fff6d2' : (particle.core || particle.head || '#f2f5f4'),
      crit: !!particle.crit,
    }, alpha, true);
  }

  function drawParticle(ctx, particle, reduced) {
    if (reduced && (particle.motionOnly || REDUCED_TRAILS.has(particle.kind))) {
      if (particle.markWhenReduced) drawReducedMark(ctx, particle, fade(particle));
      return;
    }
    const alpha = fade(particle);
    switch (particle.kind) {
      case 'spark':
      case 'mote':
      case 'orbit':
        drawDot(ctx, particle, alpha);
        break;
      case 'plus':
        drawPlus(ctx, particle.x, particle.y, particle.arm, particle.color, particle.core, alpha);
        break;
      case 'block':
        if (alpha < 0.02) break;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.fillRect(Math.round(particle.x - particle.w / 2), Math.round(particle.y - particle.h / 2), particle.w, particle.h);
        break;
      case 'arc':
        drawArc(ctx, particle, alpha);
        break;
      case 'pips':
        drawPips(ctx, particle, alpha);
        break;
      case 'crack':
        drawCrack(ctx, particle, alpha);
        break;
      case 'streak':
        drawStreak(ctx, particle, alpha);
        break;
      case 'needle':
        drawNeedle(ctx, particle, alpha);
        break;
      case 'burst':
        drawBurst(ctx, particle, alpha);
        break;
      case 'jump':
        drawJump(ctx, particle, alpha);
        break;
      case 'impact':
        drawImpact(ctx, particle, alpha, reduced);
        break;
      case 'flash':
        drawFlash(ctx, particle, alpha);
        break;
      case 'notch':
        drawNotch(ctx, particle, alpha);
        break;
      case 'glowline':
        drawGlowline(ctx, particle, alpha);
        break;
      default:
        break;
    }
  }

  function draw(ctx, options) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.fillRect !== 'function') return;
    const reduced = Boolean(options && options.reducedMotion);
    ctx.save();
    try {
      try { ctx.imageSmoothingEnabled = true; } catch { /* partial mock contexts */ }
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const veil = Number.isFinite(ring.veil) ? ring.veil : 0.95;
        drawPixelRing(ctx, ring.x, ring.y, reduced ? ring.r0 : ring.r, ring.color, fade(ring) * veil, ring.weight);
      }
      for (let i = 0; i < particles.length; i++) drawParticle(ctx, particles[i], reduced);
      for (let i = 0; i < floaters.length; i++) drawFloater(ctx, floaters[i], reduced);
    } finally {
      ctx.restore();
    }
  }

  function clear() {
    particles.length = 0;
    floaters.length = 0;
    rings.length = 0;
  }

  return { ingest, update, draw, clear };
}

};
__ff_factories["src/render/enemies.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["enemySize"] = enemySize;
__ff_exports["drawEnemy"] = drawEnemy;
/**
 * Fencefall v5 — PvZ2-Style Sharp Cel-Shaded Vector Zombies (All 15 Species).
 *
 * Bottom-center anchor (x, y) grounds each zombie's feet and contact shadow.
 * Drawn directly at native high-DPI resolution with bold cartoon ink outlines,
 * multi-tone cel gradients, expressive PvZ2 faces/eyes/teeth, smooth continuous
 * 60fps skeletal motion (stride, bob, reach, bite lunge, squash-and-stretch on hit),
 * and signature animated props per species.
 */

const INK = '#12181e';

const SIZES = Object.freeze({
  shambler: Object.freeze({width: 24, height: 30}),
  runner: Object.freeze({width: 18, height: 24}),
  brute: Object.freeze({width: 38, height: 44}),
  armored: Object.freeze({width: 28, height: 34}),
  spitter: Object.freeze({width: 26, height: 30}),
  swarm: Object.freeze({width: 16, height: 18}),
  boss: Object.freeze({width: 56, height: 62}),
  leaper: Object.freeze({width: 24, height: 30}),
  splitter: Object.freeze({width: 28, height: 28}),
  mender: Object.freeze({width: 26, height: 32}),
  shade: Object.freeze({width: 22, height: 32}),
  banner: Object.freeze({width: 30, height: 38}),
  warden: Object.freeze({width: 28, height: 34}),
  charge: Object.freeze({width: 24, height: 30}),
  hush: Object.freeze({width: 24, height: 32}),
});

function enemySize(enemy) {
  const kind = enemy && typeof enemy.kind === 'string' ? enemy.kind : 'shambler';
  return SIZES[kind] || SIZES.shambler;
}

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.ellipse === 'function'
    && typeof ctx.createLinearGradient === 'function'
  );
}

function seedFrom(enemy) {
  if (Number.isFinite(enemy?.driftPhase)) return enemy.driftPhase * 3.1;
  const id = String(enemy?.id || '0');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 628) / 100;
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawShadow(ctx, rx, ry, lift = 0) {
  ctx.fillStyle = 'rgba(8, 12, 16, 0.44)';
  ctx.beginPath();
  ctx.ellipse(0, -1.5, Math.max(3, rx - lift * 0.2), Math.max(1.5, ry - lift * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Expressive PvZ2 mismatched cartoon eyes + optional teeth jaw. */
function drawZombieFace(ctx, hx, hy, r, opts = {}) {
  const eyeColor = opts.eyeColor || '#fff7b8';
  const pupilColor = opts.pupilColor || '#151218';
  const bigLeft = opts.asymmetric !== false;
  const angry = opts.angry === true;
  const biting = opts.biting === true;
  const eyeSpread = r * 0.42;
  const ey = hy + r * 0.02;
  const rL = r * (bigLeft ? 0.3 : 0.25);
  const rR = r * 0.24;

  // Left & Right eyes
  for (const [ex, er] of [[hx - eyeSpread, rL], [hx + eyeSpread, rR]]) {
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.1, r * 0.14);
    ctx.stroke();

    // Pupil looking down toward the wall!
    ctx.fillStyle = pupilColor;
    ctx.beginPath();
    ctx.arc(ex, ey + er * 0.22, Math.max(0.9, er * 0.42), 0, Math.PI * 2);
    ctx.fill();
  }

  // Heavy angry brows
  if (angry || biting) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.4, r * 0.2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - eyeSpread - rL, ey - rL * 0.9);
    ctx.lineTo(hx - 1, ey - rL * 0.25);
    ctx.moveTo(hx + eyeSpread + rR, ey - rR * 0.9);
    ctx.lineTo(hx + 1, ey - rR * 0.25);
    ctx.stroke();
  }

  // Mouth / Chomp jaw
  const my = hy + r * 0.5;
  const mw = r * (biting ? 0.72 : 0.56);
  const mh = r * (biting ? 0.42 : 0.22);
  ctx.fillStyle = '#3c141c';
  ctx.beginPath();
  ctx.ellipse(hx, my, mw, mh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Jagged ivory PvZ2 teeth
  ctx.fillStyle = '#fff5d6';
  const teeth = biting ? 3 : 2;
  for (let i = 0; i < teeth; i++) {
    const tx = hx - mw * 0.55 + (mw * 1.1 * i) / Math.max(1, teeth - 1);
    ctx.fillRect(tx - 1.1, my - mh * 0.8, 2.2, Math.max(1.6, mh * 0.85));
  }
}

/** Shared articulated cartoon zombie body helper for humanoid species. */
function drawHumanoidZombie(ctx, cfg) {
  const {
    stride, bob, lean, attacking,
    skinLight, skinDark, coatLight, coatDark, pantsColor,
    tieColor, headR = 7.5, torsoW = 12, torsoH = 11, armLen = 9, legH = 7.5,
    eyeColor, angry, hatFn, propBackFn, propFrontFn, headOffsetY = 0
  } = cfg;

  const biteSwing = attacking ? Math.sin(stride * 2.1) * 3.5 : 0;
  const footL = Math.sin(stride) * 3.2;
  const footR = -Math.sin(stride) * 3.2;

  drawShadow(ctx, torsoW * 0.72, 4.2);

  if (propBackFn) propBackFn();

  // Legs
  for (const [side, fy] of [[-1, footL], [1, footR]]) {
    const lx = side * (torsoW * 0.27);
    ctx.fillStyle = pantsColor;
    rRect(ctx, lx - 2.6, -legH - 1.5 + Math.min(0, fy * 0.5), 5.2, legH + 1, 2.2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Shoe
    ctx.fillStyle = '#242220';
    ctx.beginPath();
    ctx.ellipse(lx + side * 0.6, -2.0 + Math.min(0, fy * 0.45), 3.3, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Torso + Coat with bob & sway
  ctx.save();
  ctx.translate(lean, bob + (attacking ? Math.abs(biteSwing) * 0.45 : 0));

  const ty = -legH - torsoH + 1;
  const coatGrad = ctx.createLinearGradient(-torsoW / 2, ty, torsoW / 2, ty + torsoH);
  coatGrad.addColorStop(0, coatLight);
  coatGrad.addColorStop(1, coatDark);
  rRect(ctx, -torsoW / 2, ty, torsoW, torsoH, 4.2);
  ctx.fillStyle = coatGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Coat lapel highlight + tattered tie
  if (tieColor) {
    ctx.fillStyle = '#d9d4c4';
    ctx.beginPath();
    ctx.moveTo(-2.6, ty + 1);
    ctx.lineTo(2.6, ty + 1);
    ctx.lineTo(0, ty + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tieColor;
    ctx.beginPath();
    ctx.moveTo(-1.3, ty + 2);
    ctx.lineTo(1.3, ty + 2);
    ctx.lineTo(1.7, ty + 8.5);
    ctx.lineTo(0, ty + 10.5);
    ctx.lineTo(-1.7, ty + 8.5);
    ctx.closePath();
    ctx.fill();
  }

  // Outstretched Reaching Arms (pointing forward/down toward wall!)
  for (const side of [-1, 1]) {
    const ax = side * (torsoW * 0.52);
    const ay = ty + 3.2;
    const armBob = attacking ? biteSwing * side : Math.sin(stride + side * 1.1) * 2.2;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(side * 0.28 + armBob * 0.08);
    // Sleeve
    rRect(ctx, -2.2, -1, 4.4, armLen * 0.62, 2);
    ctx.fillStyle = coatLight;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Zombie green hand claw
    ctx.fillStyle = skinLight;
    ctx.beginPath();
    ctx.arc(0, armLen * 0.68, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Oversized PvZ2 Cartoon Zombie Head
  const hy = ty - headR * 0.78 + headOffsetY + (attacking ? Math.abs(biteSwing) * 0.35 : 0);
  const headGrad = ctx.createRadialGradient(-headR * 0.3, hy - headR * 0.35, 1.5, 0, hy, headR * 1.15);
  headGrad.addColorStop(0, skinLight);
  headGrad.addColorStop(1, skinDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, hy, headR * 0.96, headR * 1.04, lean * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  // Upper-left glossy rim highlight
  ctx.fillStyle = 'rgba(240, 255, 224, 0.42)';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.38, hy - headR * 0.45, headR * 0.32, headR * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawZombieFace(ctx, 0, hy, headR, {eyeColor, angry, biting: attacking});

  if (hatFn) hatFn(0, hy, headR);
  if (propFrontFn) propFrontFn(ty, hy, headR);

  ctx.restore();
}

// =========================================================================
// INDIVIDUAL ZOMBIE PAINTERS (ALL 15 SPECIES)
// =========================================================================
function drawShambler(ctx, t, attacking) {
  const stride = t * 5.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.8,
    lean: Math.sin(stride) * 1.2,
    attacking,
    skinLight: '#9fd078',
    skinDark: '#5b8a44',
    coatLight: '#6b5748',
    coatDark: '#3f322a',
    pantsColor: '#364454',
    tieColor: '#d93d3d',
    headR: 7.4,
    torsoW: 12.5,
    torsoH: 10.5,
    armLen: 9.5,
    legH: 7.5,
    hatFn: (hx, hy, r) => {
      // Messy tufts of zombie hair
      ctx.strokeStyle = '#2b2420';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy - r);
      ctx.lineTo(hx - 4, hy - r - 3);
      ctx.moveTo(hx + 1, hy - r);
      ctx.lineTo(hx + 3, hy - r - 3.5);
      ctx.stroke();
    }
  });
}

function drawRunner(ctx, t, attacking) {
  const stride = t * 11.5;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -2.6,
    lean: Math.sin(stride) * 1.8,
    attacking,
    skinLight: '#b4dc78',
    skinDark: '#6c9240',
    coatLight: '#f07c2e',
    coatDark: '#a63e14',
    pantsColor: '#2a2e38',
    tieColor: null,
    headR: 6.2,
    torsoW: 10,
    torsoH: 8.8,
    armLen: 8.2,
    legH: 6.8,
    eyeColor: '#fff699',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Bright crimson runner headband with fluttering tails
      ctx.fillStyle = '#e83838';
      rRect(ctx, hx - r * 0.95, hy - r * 0.55, r * 1.9, 2.8, 1.2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const tailW = Math.sin(t * 14) * 2.5;
      ctx.strokeStyle = '#ff5448';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.8, hy - r * 0.45);
      ctx.lineTo(hx + r + 4.5, hy - r * 0.85 + tailW);
      ctx.stroke();
    }
  });
}

function drawSwarm(ctx, t, attacking) {
  const hop = Math.abs(Math.sin(t * 10.5)) * 3.4;
  drawShadow(ctx, 6.2, 2.8, hop);
  ctx.save();
  ctx.translate(0, -hop);
  // Tiny energetic PvZ2 Imp body
  const g = ctx.createRadialGradient(-2, -9, 1, 0, -8, 8.5);
  g.addColorStop(0, '#c2e874');
  g.addColorStop(1, '#689836');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -8.5, 6.4, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Pointy imp ears
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#92c452';
    ctx.beginPath();
    ctx.moveTo(s * 5.2, -10);
    ctx.lineTo(s * 8.6, -12.8);
    ctx.lineTo(s * 5.8, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Torn tunic diaper/wrap
  ctx.fillStyle = '#8b5e3c';
  rRect(ctx, -4.5, -5.2, 9, 4.2, 1.8);
  ctx.fill();
  ctx.stroke();

  drawZombieFace(ctx, 0, -9.2, 5.4, {eyeColor: '#fff696', angry: true, biting: attacking});
  ctx.restore();
}

function drawSpitter(ctx, t, attacking) {
  const stride = t * 5.0;
  const pulse = 1 + Math.sin(t * 6.5) * 0.08 + (attacking ? 0.14 : 0);
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.6,
    lean: Math.sin(stride) * 1.0,
    attacking,
    skinLight: '#82cc64',
    skinDark: '#3c7a36',
    coatLight: '#36583e',
    coatDark: '#1d3424',
    pantsColor: '#243028',
    headR: 7.4,
    torsoW: 13.5,
    torsoH: 10.5,
    eyeColor: '#d8ff64',
    angry: true,
    propBackFn: () => {
      // Glowing swollen toxic acid sacs bulging behind shoulders
      ctx.save();
      ctx.scale(pulse, pulse);
      for (const s of [-1, 1]) {
        const sg = ctx.createRadialGradient(s * 8, -16, 1, s * 8, -15, 6);
        sg.addColorStop(0, '#e8ff82');
        sg.addColorStop(0.55, '#86e034');
        sg.addColorStop(1, '#367418');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(s * 7.8, -15.5, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    },
    propFrontFn: (_ty, hy, r) => {
      if (attacking) {
        // Glowing acid orb charging in mouth!
        ctx.fillStyle = '#d4ff56';
        ctx.beginPath();
        ctx.arc(0, hy + r * 0.55, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3c8816';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  });
}

function drawArmored(ctx, t, attacking) {
  const stride = t * 4.4;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#8eb872',
    skinDark: '#4f7442',
    coatLight: '#7b8c9a',
    coatDark: '#3f4c58',
    pantsColor: '#36424c',
    headR: 8.0,
    torsoW: 15,
    torsoH: 12,
    armLen: 10,
    legH: 8,
    eyeColor: '#88e8ff',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Iconic PvZ2 Glossy Steel Bucket-Helm with visor slit & metallic sheen!
      const bg = ctx.createLinearGradient(hx - r, hy - r, hx + r, hy + r * 0.3);
      bg.addColorStop(0, '#eef6fc');
      bg.addColorStop(0.45, '#9cb0be');
      bg.addColorStop(1, '#4c5e6c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.92, hy - r * 1.15);
      ctx.lineTo(hx + r * 0.92, hy - r * 1.15);
      ctx.lineTo(hx + r * 1.12, hy + r * 0.25);
      ctx.lineTo(hx - r * 1.12, hy + r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Bucket top rim
      ctx.fillStyle = '#dce8f0';
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 1.15, r * 0.92, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glowing eye slit cut into bucket front
      rRect(ctx, hx - 5.2, hy - 2.2, 10.4, 3.4, 1.4);
      ctx.fillStyle = '#121a20';
      ctx.fill();
      ctx.fillStyle = attacking ? '#ffe878' : '#7ae8ff';
      ctx.fillRect(hx - 3.6, hy - 1.1, 2.6, 1.4);
      ctx.fillRect(hx + 1.0, hy - 1.1, 2.6, 1.4);
    },
    propFrontFn: (ty) => {
      // Twin riveted steel shoulder pauldrons
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#b4c6d4';
        ctx.beginPath();
        ctx.ellipse(s * 8.6, ty + 3, 4.2, 4.8, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.7;
        ctx.stroke();
      }
    }
  });
}

function drawBrute(ctx, t, attacking) {
  const stride = t * 3.6;
  const stomp = Math.abs(Math.sin(stride)) * -2.2;
  const slam = attacking ? Math.sin(t * 7.5) * 6 : 0;

  drawShadow(ctx, 16.5, 6.2);

  // Huge stumpy legs
  for (const s of [-1, 1]) {
    const stepY = s * Math.sin(stride) * 2.5;
    ctx.fillStyle = '#382a34';
    rRect(ctx, s * 6.8 - 4.4, -12 + Math.min(0, stepY), 8.8, 10.5, 3);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(Math.sin(stride) * 1.3, stomp);

  // Hulking Gargantuar-style upper torso
  const tg = ctx.createRadialGradient(-5, -26, 3, 0, -22, 18);
  tg.addColorStop(0, '#c86452');
  tg.addColorStop(0.6, '#8c342e');
  tg.addColorStop(1, '#4d1a1a');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(0, -22, 15.5, 13.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Ragged iron chain strap across chest
  ctx.strokeStyle = '#9aa8b4';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-11, -30);
  ctx.lineTo(10, -13);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Massive boulder fists slamming downward
  for (const s of [-1, 1]) {
    const fy = -18 + (s < 0 ? slam : -slam * 0.4);
    ctx.fillStyle = '#a4483e';
    ctx.beginPath();
    ctx.ellipse(s * 16.5, fy, 5.4, 6.8, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    // Iron knuckle studs
    ctx.fillStyle = '#d6e2ea';
    ctx.beginPath();
    ctx.arc(s * 16.5, fy + 3.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brutish small head sunk between shoulders
  const hy = -34.5;
  const hg = ctx.createRadialGradient(-2, hy - 2, 1, 0, hy, 8);
  hg.addColorStop(0, '#d88672');
  hg.addColorStop(1, '#843a32');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, hy, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  drawZombieFace(ctx, 0, hy, 7.4, {eyeColor: '#ffea7a', angry: true, biting: attacking});
  ctx.restore();
}

function drawLeaper(ctx, t, attacking, enemy) {
  const windup = Number.isFinite(enemy?.leapTimer) && enemy.leapTimer > 0;
  const crouch = windup ? 4.5 : 0;
  const stride = t * 8.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: crouch + Math.abs(Math.sin(stride)) * -2.2,
    lean: Math.sin(stride) * 1.4,
    attacking: attacking || windup,
    skinLight: '#b6d86e',
    skinDark: '#6a8e38',
    coatLight: '#e69832',
    coatDark: '#924c14',
    pantsColor: '#3a2c1e',
    headR: 7.0,
    torsoW: 11.5,
    torsoH: 10,
    eyeColor: '#fff588',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Pointed amber hunter hood
      ctx.fillStyle = '#f2a838';
      ctx.beginPath();
      ctx.moveTo(hx, hy - r - 6);
      ctx.lineTo(hx + r * 0.95, hy - r * 0.25);
      ctx.lineTo(hx - r * 0.95, hy - r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
  });
}

function drawSplitter(ctx, t, attacking) {
  const wobble = Math.sin(t * 5.8) * 1.4;
  const pulse = 1 + Math.sin(t * 7.2) * 0.06;
  drawShadow(ctx, 12.5, 4.8);
  ctx.save();
  ctx.translate(wobble, -Math.abs(Math.sin(t * 5.8)) * 1.5);
  ctx.scale(pulse, 2 - pulse);

  // Wide bulbous purple brood sac
  const g = ctx.createRadialGradient(-4, -15, 2, 0, -13, 14);
  g.addColorStop(0, '#c88ce0');
  g.addColorStop(0.55, '#7e4898');
  g.addColorStop(1, '#3e1e52');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -13, 12.8, 11.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Glowing jagged split-line crack down center!
  ctx.strokeStyle = attacking ? '#ffe872' : '#ff98d4';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0, -23.5);
  ctx.lineTo(-2.5, -16);
  ctx.lineTo(2.4, -10.5);
  ctx.lineTo(-1.0, -3.5);
  ctx.stroke();

  // Twin twin-imp eyes peeking out of each half
  drawZombieFace(ctx, -5.2, -13, 4.0, {eyeColor: '#fff4a6', asymmetric: false, biting: attacking});
  drawZombieFace(ctx, 5.2, -13, 4.0, {eyeColor: '#fff4a6', asymmetric: false, biting: attacking});
  ctx.restore();
}

function drawMender(ctx, t, attacking) {
  const stride = t * 4.5;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#9ed68c',
    skinDark: '#4f8854',
    coatLight: '#4fa876',
    coatDark: '#245842',
    pantsColor: '#253c34',
    headR: 7.0,
    torsoW: 12,
    torsoH: 11.5,
    eyeColor: '#e8ffbe',
    hatFn: (hx, hy, r) => {
      // Field-medic cap with bright mint cross
      rRect(ctx, hx - r * 0.88, hy - r * 1.15, r * 1.76, r * 0.72, 2.8);
      ctx.fillStyle = '#e8f4ea';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#2dc474';
      ctx.fillRect(hx - 1.2, hy - r * 1.02, 2.4, 5.2);
      ctx.fillRect(hx - 2.6, hy - r * 0.82, 5.2, 2.2);
    },
    propFrontFn: (ty) => {
      // Glowing mint healing staff in right hand
      const glow = 0.75 + 0.25 * Math.sin(t * 7);
      ctx.strokeStyle = '#5c4228';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(9.5, ty + 14);
      ctx.lineTo(10.5, ty - 9);
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#7effc4';
      ctx.beginPath();
      ctx.arc(10.5, ty - 10, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#186844';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawShade(ctx, t, attacking) {
  const floatY = Math.sin(t * 4.8) * 3.0;
  const sway = Math.cos(t * 3.6) * 2.0;
  drawShadow(ctx, 7.5, 3.0, 4 + floatY);

  ctx.save();
  ctx.translate(sway, -4 + floatY);
  // Billowing translucent spectral ghost body
  const g = ctx.createLinearGradient(0, -26, 0, 2);
  g.addColorStop(0, '#96f2ff');
  g.addColorStop(0.55, '#4688b4');
  g.addColorStop(1, 'rgba(34, 58, 92, 0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.bezierCurveTo(10, -24, 11, -10, 9, -1);
  ctx.lineTo(4, -4 + Math.sin(t * 8) * 2);
  ctx.lineTo(0, 1);
  ctx.lineTo(-4, -4 - Math.sin(t * 8) * 2);
  ctx.lineTo(-9, -1);
  ctx.bezierCurveTo(-11, -10, -10, -24, 0, -26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#142636';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Twin piercing neon-cyan ghost eyes
  ctx.fillStyle = attacking ? '#ffffff' : '#c8ffff';
  ctx.beginPath();
  ctx.ellipse(-3.2, -16, 2.2, 2.8, -0.15, 0, Math.PI * 2);
  ctx.ellipse(3.2, -16, 2.2, 2.8, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBanner(ctx, t, attacking) {
  const stride = t * 5.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.6,
    lean: Math.sin(stride) * 1.0,
    attacking,
    skinLight: '#9ac874',
    skinDark: '#527c3e',
    coatLight: '#a62e36',
    coatDark: '#5c141c',
    pantsColor: '#2c2428',
    tieColor: '#f4c854',
    headR: 7.2,
    torsoW: 12.5,
    torsoH: 11,
    angry: true,
    propFrontFn: (ty) => {
      // Tall flagpole + Smooth Sine-Wave Fluttering Crimson War Flag!
      const px = -9.5;
      ctx.strokeStyle = '#3c2a1c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(px, ty + 14);
      ctx.lineTo(px, ty - 18);
      ctx.stroke();
      ctx.fillStyle = '#f6cf64';
      ctx.beginPath();
      ctx.arc(px, ty - 19, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const w1 = Math.sin(t * 9.5) * 2.2;
      const w2 = Math.cos(t * 9.5) * 2.6;
      const fg = ctx.createLinearGradient(px, ty - 17, px + 18, ty - 8);
      fg.addColorStop(0, '#ff4c44');
      fg.addColorStop(1, '#a81c24');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(px + 1, ty - 17);
      ctx.quadraticCurveTo(px + 9, ty - 18 + w1, px + 18, ty - 15 + w2);
      ctx.lineTo(px + 14.5, ty - 11.5 + w2 * 0.8);
      ctx.lineTo(px + 18, ty - 8 + w2);
      ctx.quadraticCurveTo(px + 9, ty - 9 + w1, px + 1, ty - 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Gold skull dot on flag
      ctx.fillStyle = '#ffe278';
      ctx.beginPath();
      ctx.arc(px + 7.5, ty - 12.5 + w1 * 0.4, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawWarden(ctx, t, attacking) {
  const stride = t * 4.4;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.7,
    attacking,
    skinLight: '#8cb878',
    skinDark: '#486c44',
    coatLight: '#4c6684',
    coatDark: '#26384c',
    pantsColor: '#24303e',
    headR: 7.4,
    torsoW: 13.5,
    torsoH: 11.5,
    angry: true,
    propFrontFn: (ty) => {
      // Gleaming Kite Tower Shield with golden emblem in front!
      const sx = -9;
      const sy = ty + 2;
      const sg = ctx.createLinearGradient(sx - 6, sy - 6, sx + 6, sy + 10);
      sg.addColorStop(0, '#c8dce8');
      sg.addColorStop(0.5, '#648096');
      sg.addColorStop(1, '#2c3d4c');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 7.5, sy - 2);
      ctx.lineTo(sx + 6, sy + 7.5);
      ctx.lineTo(sx, sy + 12.5);
      ctx.lineTo(sx - 6, sy + 7.5);
      ctx.lineTo(sx - 7.5, sy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.9;
      ctx.stroke();

      // Golden Aegis Cross on shield
      ctx.fillStyle = '#f6cc5c';
      ctx.fillRect(sx - 1.3, sy - 3, 2.6, 11);
      ctx.fillRect(sx - 4.2, sy + 0.5, 8.4, 2.4);
    }
  });
}

function drawCharge(ctx, t, attacking, enemy) {
  const lit = Number.isFinite(enemy?.chargeTimer) && enemy.chargeTimer > 0;
  const stride = t * 8.6;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -2.0,
    lean: Math.sin(stride) * 1.4,
    attacking: attacking || lit,
    skinLight: '#c48c68',
    skinDark: '#74422c',
    coatLight: '#583830',
    coatDark: '#2c1a18',
    pantsColor: '#262022',
    headR: 6.8,
    torsoW: 11.5,
    torsoH: 10,
    eyeColor: '#ffe868',
    angry: true,
    propFrontFn: (ty) => {
      // Bright Red-and-Gold Striped TNT / Cinder Barrel hugged in front!
      const blink = lit && Math.floor(t * 16) % 2 === 0;
      rRect(ctx, -6.5, ty + 2, 13, 10.5, 3);
      ctx.fillStyle = blink ? '#ffea68' : '#e63628';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#f8d24c';
      ctx.fillRect(-5.6, ty + 5.8, 11.2, 2.8);

      // Sputtering Glowing Fuse Spark!
      ctx.strokeStyle = '#d4b888';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, ty + 2);
      ctx.quadraticCurveTo(3, ty - 3, 5.5, ty - 5);
      ctx.stroke();
      const sr = (lit ? 4.4 : 2.8) + Math.sin(t * 28) * 1.1;
      ctx.fillStyle = '#fff598';
      ctx.beginPath();
      ctx.arc(5.5, ty - 5, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.arc(5.5, ty - 5, sr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawHush(ctx, t, attacking) {
  const stride = t * 5.8;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#8cc2c6',
    skinDark: '#446c74',
    coatLight: '#365c6c',
    coatDark: '#1a323e',
    pantsColor: '#1a2832',
    headR: 7.0,
    torsoW: 12,
    torsoH: 11,
    eyeColor: '#b8ffff',
    hatFn: (hx, hy, r) => {
      // Sleek curved teal hood
      ctx.fillStyle = '#2d5866';
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r * 1.06, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineTo(hx + r * 0.8, hy + 2);
      ctx.lineTo(hx - r * 0.8, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    },
    propFrontFn: (ty) => {
      // Pulsing cryo-jammer ring aura around staff
      const pulse = 5.5 + Math.sin(t * 8) * 1.8;
      ctx.save();
      ctx.strokeStyle = 'rgba(130, 240, 255, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, ty + 5, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawBoss(ctx, t, attacking, enemy) {
  const enraged = enemy?.enraged === true;
  const stride = t * (enraged ? 4.8 : 3.2);
  const stomp = Math.abs(Math.sin(stride)) * -3.0;
  const slam = attacking ? Math.sin(t * 8.5) * 7.5 : 0;

  // Dramatic ground shadow + blazing boss aura ring
  drawShadow(ctx, 25, 9.5);
  ctx.save();
  const auraPulse = 0.25 + 0.14 * Math.sin(t * (enraged ? 9 : 4));
  ctx.strokeStyle = enraged ? `rgba(255, 72, 34, ${auraPulse + 0.22})` : `rgba(218, 92, 168, ${auraPulse})`;
  ctx.lineWidth = enraged ? 3.5 : 2.4;
  ctx.beginPath();
  ctx.ellipse(0, -2, 27, 10.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Heavy armored legs
  for (const s of [-1, 1]) {
    const sy = s * Math.sin(stride) * 3.5;
    ctx.fillStyle = enraged ? '#46161c' : '#2e1a2c';
    rRect(ctx, s * 10 - 6, -16 + Math.min(0, sy), 12, 14, 4);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // Gold/molten knee guard
    ctx.fillStyle = enraged ? '#ff7428' : '#e8bd58';
    rRect(ctx, s * 10 - 4, -14 + Math.min(0, sy), 8, 4.5, 1.5);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(Math.sin(stride) * 1.5, stomp);

  // Colossal Armored Boss Torso
  const bodyGrad = ctx.createRadialGradient(-6, -34, 4, 0, -29, 25);
  if (enraged) {
    bodyGrad.addColorStop(0, '#c83438');
    bodyGrad.addColorStop(0.6, '#7a1624');
    bodyGrad.addColorStop(1, '#320810');
  } else {
    bodyGrad.addColorStop(0, '#964478');
    bodyGrad.addColorStop(0.6, '#5c244c');
    bodyGrad.addColorStop(1, '#260c22');
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-20, -39);
  ctx.quadraticCurveTo(0, -45, 20, -39);
  ctx.lineTo(17, -14);
  ctx.quadraticCurveTo(0, -10, -17, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Throbbing Molten Chest Core!
  const corePulse = 1 + Math.sin(t * (enraged ? 12 : 5.5)) * 0.14;
  ctx.save();
  ctx.translate(0, -26);
  ctx.scale(corePulse, corePulse);
  const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 9.5);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.45, enraged ? '#ffea48' : '#ff8642');
  cg.addColorStop(1, enraged ? '#ff2414' : '#c42432');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.6, 9.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();
  ctx.restore();

  // Giant Clawed Gauntlet Arms
  for (const s of [-1, 1]) {
    const cy = -24 + (s < 0 ? slam : -slam * 0.5);
    ctx.fillStyle = enraged ? '#8a1e28' : '#6c2c56';
    ctx.beginPath();
    ctx.ellipse(s * 22, cy, 7.2, 9.2, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.3;
    ctx.stroke();
    // 3 razor claws
    ctx.fillStyle = enraged ? '#ffe062' : '#f0e2c8';
    for (const c of [-3.5, 0, 3.5]) {
      ctx.beginPath();
      ctx.moveTo(s * 22 + c - 1.5, cy + 7);
      ctx.lineTo(s * 22 + c + 1.5, cy + 7);
      ctx.lineTo(s * 22 + c, cy + 13.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Boss Head + Curved Sweeping Horns + Jagged Crown!
  const hy = -44;
  // Sweeping Obsidian/Blazing Horns
  for (const s of [-1, 1]) {
    ctx.fillStyle = enraged ? '#ff4a18' : '#2a1828';
    ctx.beginPath();
    ctx.moveTo(s * 9, hy - 3);
    ctx.quadraticCurveTo(s * 22, hy - 8, s * 20, hy - 20);
    ctx.quadraticCurveTo(s * 14, hy - 12, s * 6, hy - 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Head
  const hg = ctx.createRadialGradient(-3, hy - 3, 2, 0, hy, 12.5);
  hg.addColorStop(0, enraged ? '#d64848' : '#a85686');
  hg.addColorStop(1, enraged ? '#5e121a' : '#421636');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, hy, 11.5, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.3;
  ctx.stroke();

  // Jagged Golden Crown
  ctx.fillStyle = enraged ? '#ffdc32' : '#f4c85a';
  ctx.beginPath();
  ctx.moveTo(-9, hy - 7);
  ctx.lineTo(-10, hy - 16);
  ctx.lineTo(-4, hy - 11);
  ctx.lineTo(0, hy - 19);
  ctx.lineTo(4, hy - 11);
  ctx.lineTo(10, hy - 16);
  ctx.lineTo(9, hy - 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  drawZombieFace(ctx, 0, hy + 1, 10.2, {
    eyeColor: enraged ? '#ffffff' : '#ffe668',
    pupilColor: enraged ? '#ff1e00' : '#180812',
    angry: true,
    biting: attacking || enraged
  });

  ctx.restore();
}

const PAINTERS = {
  shambler: drawShambler,
  runner: drawRunner,
  brute: drawBrute,
  armored: drawArmored,
  spitter: drawSpitter,
  swarm: drawSwarm,
  boss: drawBoss,
  leaper: drawLeaper,
  splitter: drawSplitter,
  mender: drawMender,
  shade: drawShade,
  banner: drawBanner,
  warden: drawWarden,
  charge: drawCharge,
  hush: drawHush,
};

/** Bounded fallback for minimal Node mock contexts that only expose fillRect. */
function drawMinimalFallback(ctx, enemy, x, y, time, scale) {
  const sz = enemySize(enemy);
  const w = Math.max(4, Math.round(sz.width * scale));
  const h = Math.max(4, Math.round(sz.height * scale));
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h);
  const step = Math.floor((Number.isFinite(time) ? time : 0) * 6) % 2;
  const atk = enemy?.attacking === true;
  ctx.save?.();
  ctx.fillStyle = enemy?.enraged ? '#ff4422' : '#86b86a';
  ctx.fillRect(left + 1, top + 1, Math.max(2, w - 2), Math.max(2, h - 5));
  const legOff = atk ? 2 : (step ? 1 : 3);
  ctx.fillRect(left + legOff, top + h - 4, 3, 4);
  ctx.fillRect(left + Math.max(legOff, w - legOff - 3), top + h - 4, 3, 4);
  if (atk) ctx.fillRect(left + Math.floor(w / 2) - 1, top, 2, 2);
  ctx.restore?.();
}

function drawEnemy(ctx, enemy, x, y, {time = 0, scale = 1, flash = 0} = {}) {
  if (!ctx || !enemy || typeof enemy !== 'object') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const sc = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const fl = Number.isFinite(flash) && flash > 0 ? Math.min(1, flash) : 0;

  if (!isRichCtx(ctx)) {
    drawMinimalFallback(ctx, enemy, x, y, time, sc);
    return;
  }

  const kind = typeof enemy.kind === 'string' && PAINTERS[enemy.kind] ? enemy.kind : 'shambler';
  const t = (Number.isFinite(time) ? time : 0) + seedFrom(enemy);
  const attacking = enemy.attacking === true;

  // Impact squash-and-stretch on hit!
  const sx = sc * (1 + fl * 0.14);
  const sy = sc * (1 - fl * 0.12);

  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    PAINTERS[kind](ctx, t, attacking, enemy);

    // Soft radial impact flash gleam (keeps cel-shaded face crisp on hit)
    if (fl > 0.05) {
      const sz = enemySize(enemy);
      const rad = Math.max(sz.width, sz.height) * 0.56;
      const gleam = ctx.createRadialGradient(0, -sz.height * 0.52, 1, 0, -sz.height * 0.52, rad);
      gleam.addColorStop(0, `rgba(255, 255, 255, ${(fl * 0.48).toFixed(3)})`);
      gleam.addColorStop(0.65, `rgba(255, 246, 214, ${(fl * 0.16).toFixed(3)})`);
      gleam.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gleam;
      ctx.beginPath();
      ctx.arc(0, -sz.height * 0.52, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } finally {
    ctx.restore();
  }
}

};
__ff_factories["src/render/renderer.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["projectileColors"] = projectileColors;
__ff_exports["createRenderer"] = createRenderer;
const __ff_m0 = __ff_load("src/render/world.js");
const __ff_m1 = __ff_load("src/render/defenders.js");
const __ff_m2 = __ff_load("src/render/enemies.js");
const __ff_m3 = __ff_load("src/render/effects.js");
const __ff_m4 = __ff_load("src/data/towers.js");
const __ff_m5 = __ff_load("src/shared.js");
const drawWorld = __ff_m0["drawWorld"];
const drawDefender = __ff_m1["drawDefender"];
const defenderSize = __ff_m1["defenderSize"];
const drawEnemy = __ff_m2["drawEnemy"];
const enemySize = __ff_m2["enemySize"];
const createEffects = __ff_m3["createEffects"];
const getUnitStats = __ff_m4["getUnitStats"];
const ARENA = __ff_m5["ARENA"];
const clamp = __ff_m5["clamp"];
const hitSlotAt = __ff_m5["hitSlot"];
const slotGeometry = __ff_m5["slotGeometry"];
/**
 * Fencefall v5 — PvZ2-Style Native Retina HD Vector Battlefield Renderer.
 *
 * Draws directly onto the high-DPI display canvas (2×/3× Retina) in ARENA logical
 * space (360×640) with full anti-aliasing, smooth fractional scaling, gradients,
 * bold cel-shaded silhouettes, 360° Hero aim tracking & recoil, and ZERO 2×5 grid.
 *
 * Simulation state and gameplay RNG are read-only. Presentation events arrive via
 * ingestEvents; this module never reads or drains state.events.
 */








const LETTERBOX = '#0b1218';
const FIELD = '#101d24';
const INK = '#10161c';
const MAX_CUES = 48;
const MAX_BATCH = 200;
const MAX_PROJECTILES = 300;
const MAX_ENEMIES = 400;
const MAX_CLOUDS = 32;
const CUE_MS = 240;
const FLASH_MS = 150;
const RANGE_LIMIT = 900;
const HP_FILL = 4;
const SPRITE_GAP = 4;
const STATUS_CELL = 10;
const STATUS_GAP = 3;

const PALETTE = {
  bolt: {main: '#f2d56a', core: '#fff6cf', edge: '#6e5424'},
  fire: {main: '#e25a2a', core: '#ffd36a', edge: '#5c220f'},
  frost: {main: '#9ed8ea', core: '#f4fdff', edge: '#24566c'},
  lightning: {main: '#ffe14a', core: '#fffceb', edge: '#7a6220'},
  poison: {main: '#6aaa3a', core: '#d8f0a0', edge: '#243814'},
  support: {main: '#f0d78a', core: '#fff8de', edge: '#6a5830'},
  hero: {main: '#c44a56', core: '#fff0c0', edge: '#3c1018'},
};

const ELEMENT_ALIAS = {
  bolt: 'bolt', physical: 'bolt', arrow: 'bolt', kinetic: 'bolt',
  fire: 'fire', burn: 'fire', flame: 'fire',
  frost: 'frost', ice: 'frost', cold: 'frost', slow: 'frost',
  lightning: 'lightning', shock: 'lightning', spark: 'lightning', chain: 'lightning',
  poison: 'poison', toxin: 'poison',
  support: 'support', heal: 'support', aura: 'support',
  hero: 'hero',
};

const STATUS_RANK = {stun: 0, burn: 1, poison: 2, slow: 3, brittle: 4};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nowMs() {
  const perf = globalThis.performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

function currentDpr() {
  const dpr = globalThis.devicePixelRatio || 1;
  return Math.max(1, Math.min(dpr, 4));
}

function hashInt(n) {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.createLinearGradient === 'function'
    && typeof ctx.createRadialGradient === 'function'
  );
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function enableSmooth(ctx) {
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  if ('lineJoin' in ctx) ctx.lineJoin = 'round';
  if ('lineCap' in ctx) ctx.lineCap = 'round';
}

function isolate(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function context2d(target, opaque) {
  if (opaque) {
    try {
      const ctx = target.getContext('2d', {alpha: false});
      if (ctx) return ctx;
    } catch {
      /* options bag is optional */
    }
  }
  return target.getContext('2d');
}

function normalizeSlot(value) {
  return Number.isInteger(value) && value >= 0 && value < 10 ? value : -1;
}

function normalizeBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const slice = events.length > MAX_BATCH ? events.slice(events.length - MAX_BATCH) : events.slice();
  return slice.filter((event) => event && typeof event === 'object');
}

function pushCapped(list, item) {
  list.push(item);
  if (list.length > MAX_CUES) list.splice(0, list.length - MAX_CUES);
}

function cueStrength(at, now, duration) {
  if (!Number.isFinite(at)) return 0;
  const age = now - at;
  if (age < 0 || age > duration) return 0;
  return 1 - age / duration;
}

function pruneList(list, now) {
  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const duration = list[i].duration || CUE_MS;
    if (now - list[i].at <= duration) list[write++] = list[i];
  }
  list.length = write;
}

function idOf(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function rememberElement(out, value) {
  if (value == null) return;
  const kind = ELEMENT_ALIAS[String(value).toLowerCase()];
  if (kind && !out.includes(kind)) out.push(kind);
}

function elementsOf(projectile) {
  const out = [];
  const tags = Array.isArray(projectile.tags) ? projectile.tags : [];
  for (const tag of tags) rememberElement(out, tag);
  rememberElement(out, projectile.towerType);
  rememberElement(out, projectile.element);
  rememberElement(out, projectile.kind);
  if (Array.isArray(projectile.effects)) {
    for (const effect of projectile.effects) rememberElement(out, effect?.type);
  }
  if (!out.length) out.push('bolt');
  return out;
}

function projectileInk(projectile) {
  const elements = elementsOf(projectile);
  const kind = elements[0];
  const color = PALETTE[kind] || PALETTE.bolt;
  const accent = PALETTE[elements[1]] || color;
  return {kind, color, accent};
}

function projectileColors(projectile) {
  const ink = projectileInk(projectile || {});
  return {kind: ink.kind, main: ink.color.main, core: ink.color.core, edge: ink.color.edge};
}

function measureEnemy(enemy) {
  let width = Math.max(18, Math.round((finite(enemy.radius) ?? 12) * 2));
  let height = width;
  const sized = enemySize(enemy);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function measureDefender(unit) {
  let width = 50;
  let height = 54;
  const sized = defenderSize(unit);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function slotCenter(slot, index) {
  if (slot && Number.isFinite(slot.x) && Number.isFinite(slot.y)) return {x: slot.x, y: slot.y};
  const geo = slotGeometry(index);
  return {x: geo.x, y: geo.y};
}

function readStats(unit, state, warned) {
  try {
    const stats = getUnitStats(unit, state);
    return stats && typeof stats === 'object' ? stats : null;
  } catch (error) {
    if (!warned.stats) {
      warned.stats = true;
      console.warn('fencefall renderer: getUnitStats failed', error);
    }
    return null;
  }
}

function orderedEnemies(state) {
  const source = Array.isArray(state.enemies) ? state.enemies : [];
  const list = [];
  for (let i = 0; i < source.length; i++) {
    const enemy = source[i];
    if (!enemy || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
    list.push(enemy);
  }
  list.sort((a, b) => (a.y - b.y) || ((a.dead ? 0 : 1) - (b.dead ? 0 : 1)));
  if (list.length > MAX_ENEMIES) list.splice(0, list.length - MAX_ENEMIES);
  return list;
}

// =========================================================================
// HD VECTOR HP BARS, TARGET LOCK & STATUS BADGES
// =========================================================================
function drawHpBar(ctx, x, y, width, hp, maxHp, emphasize, isBoss = false) {
  if (!Number.isFinite(hp)) return;
  const max = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : Math.max(hp, 1);
  const ratio = clamp(hp / max, 0, 1);
  const barH = isBoss ? 6.5 : HP_FILL;
  const fillW = Math.max(0, Math.min(width, width * ratio));

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#101418';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 1), Math.round(width + 2), Math.round(barH + 2));
    ctx.fillStyle = ratio > 0.55 ? '#6cd458' : ratio > 0.28 ? '#f4c046' : '#ef5244';
    if (fillW > 0) ctx.fillRect(Math.round(x), Math.round(y), Math.round(fillW), Math.round(barH));
    return;
  }

  ctx.save();
  rRect(ctx, x - 1.2, y - 1.2, width + 2.4, barH + 2.4, (barH + 2.4) / 2);
  ctx.fillStyle = 'rgba(10, 15, 20, 0.88)';
  ctx.fill();
  ctx.strokeStyle = isBoss ? '#ff8b78' : 'rgba(235, 242, 246, 0.65)';
  ctx.lineWidth = isBoss ? 1.4 : 0.9;
  ctx.stroke();

  if (fillW > 0.5) {
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    if (isBoss) {
      grad.addColorStop(0, emphasize ? '#ffd0c6' : '#ff6b5a');
      grad.addColorStop(1, emphasize ? '#ff7c68' : '#b41e28');
    } else if (ratio > 0.55) {
      grad.addColorStop(0, emphasize ? '#d6ff9e' : '#8ef068');
      grad.addColorStop(1, emphasize ? '#8ed856' : '#409c32');
    } else if (ratio > 0.28) {
      grad.addColorStop(0, emphasize ? '#ffef9c' : '#ffd258');
      grad.addColorStop(1, emphasize ? '#f2b838' : '#c87e1c');
    } else {
      grad.addColorStop(0, emphasize ? '#ffd0c4' : '#ff6852');
      grad.addColorStop(1, emphasize ? '#f0624c' : '#b82420');
    }
    rRect(ctx, x, y, fillW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Specular highlight strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    rRect(ctx, x + 0.6, y + 0.5, Math.max(0, fillW - 1.2), barH * 0.42, barH / 4);
    ctx.fill();
  }
  ctx.restore();
}

function drawTargetMark(ctx, x, y, width, isBoss = false) {
  const h = isBoss ? 6.5 : HP_FILL;
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(Math.round(x - 4), Math.round(y - 1), 2, 2);
    ctx.fillRect(Math.round(x + width + 2), Math.round(y - 1), 2, 2);
    return;
  }
  ctx.save();
  ctx.strokeStyle = '#fff2a6';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  // Left bracket
  ctx.moveTo(x - 2, y - 2.2);
  ctx.lineTo(x - 4.5, y - 2.2);
  ctx.lineTo(x - 4.5, y + h + 2.2);
  ctx.lineTo(x - 2, y + h + 2.2);
  // Right bracket
  ctx.moveTo(x + width + 2, y - 2.2);
  ctx.lineTo(x + width + 4.5, y - 2.2);
  ctx.lineTo(x + width + 4.5, y + h + 2.2);
  ctx.lineTo(x + width + 2, y + h + 2.2);
  ctx.stroke();
  ctx.restore();
}

function drawStatusIcon(ctx, status, cx, cy, r) {
  const type = String(status.type || '');
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = type === 'burn' ? '#ff6a28' : type === 'poison' ? '#70d448' : type === 'slow' ? '#78e6ff' : '#ffe25a';
    ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), 4, 4);
    return;
  }
  ctx.save();
  // Crisp circular badge plate
  ctx.fillStyle = 'rgba(10, 16, 22, 0.88)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(225, 236, 240, 0.72)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  if (type === 'burn') {
    ctx.fillStyle = '#ff6824';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.65);
    ctx.quadraticCurveTo(cx + r * 0.6, cy, cx, cy + r * 0.62);
    ctx.quadraticCurveTo(cx - r * 0.6, cy, cx, cy - r * 0.65);
    ctx.fill();
    ctx.fillStyle = '#fff08a';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.16, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'poison') {
    ctx.fillStyle = '#74d644';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.62);
    ctx.quadraticCurveTo(cx + r * 0.58, cy + r * 0.12, cx, cy + r * 0.58);
    ctx.quadraticCurveTo(cx - r * 0.58, cy + r * 0.12, cx, cy - r * 0.62);
    ctx.fill();
    ctx.fillStyle = '#e8ffc0';
    ctx.beginPath();
    ctx.arc(cx - r * 0.14, cy + r * 0.08, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'slow') {
    ctx.strokeStyle = '#90f0ff';
    ctx.lineWidth = 1.25;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const dx = Math.cos(a) * r * 0.6;
      const dy = Math.sin(a) * r * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'stun') {
    ctx.fillStyle = '#ffe252';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 === 0 ? r * 0.66 : r * 0.28;
      const a = (k * Math.PI) / 4;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'brittle') {
    ctx.strokeStyle = '#e0a8ff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.15, cy - r * 0.05);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.12);
    ctx.lineTo(cx + r * 0.45, cy + r * 0.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStatuses(ctx, enemy, anchorX, y) {
  const source = Array.isArray(enemy.statuses) ? enemy.statuses : [];
  const shown = [];
  for (let i = 0; i < source.length; i++) {
    const status = source[i];
    if (!status || !status.type) continue;
    if (Number.isFinite(status.remaining) && status.remaining <= 0) continue;
    shown.push(status);
  }
  if (!shown.length) return;
  shown.sort((a, b) => (STATUS_RANK[a.type] ?? 9) - (STATUS_RANK[b.type] ?? 9));
  if (shown.length > 5) shown.length = 5;
  const r = STATUS_CELL * 0.5;
  const stride = STATUS_CELL + 2;
  const totalW = shown.length * stride - 2;
  let cx = anchorX - totalW / 2 + r;
  const cy = y + r;
  for (let i = 0; i < shown.length; i++) {
    drawStatusIcon(ctx, shown[i], cx, cy, r);
    cx += stride;
  }
}

function statusLive(enemy, type) {
  const source = Array.isArray(enemy?.statuses) ? enemy.statuses : [];
  for (let i = 0; i < source.length; i++) {
    const status = source[i];
    if (!status || status.type !== type) continue;
    if (Number.isFinite(status.remaining) && status.remaining <= 0) continue;
    return true;
  }
  return false;
}

// Smooth cel-shaded status auras around affected zombies (zero blocky pixel tint wash)
function drawStatusAura(ctx, enemy, anchor, time, reduced) {
  if (!isRichCtx(ctx)) return;
  const isStun = statusLive(enemy, 'stun');
  const isBurn = statusLive(enemy, 'burn');
  const isSlow = statusLive(enemy, 'slow');
  const isPoison = statusLive(enemy, 'poison');
  if (!isStun && !isBurn && !isSlow && !isPoison) return;

  const cx = anchor.x;
  const cy = anchor.y - anchor.size.height * 0.45;
  const rx = anchor.size.width * 0.56;
  const ry = anchor.size.height * 0.48;

  ctx.save();
  if (isSlow) {
    // Frost crystalline ring at feet
    ctx.fillStyle = 'rgba(116, 232, 255, 0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, anchor.y - 2, rx * 0.95, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(184, 248, 255, 0.78)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  if (isBurn) {
    // Rising flickering fire motes
    const pulse = reduced ? 0.8 : 0.72 + 0.28 * Math.sin(time * 16 + cx);
    ctx.fillStyle = `rgba(255, 114, 38, ${(0.22 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.82, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 2; k++) {
      const fx = cx + (k === 0 ? -rx * 0.45 : rx * 0.42);
      const rise = reduced ? 3 : ((time * 24 + k * 7 + cx) % 10);
      ctx.fillStyle = '#ff7426';
      ctx.beginPath();
      ctx.arc(fx, cy + 4 - rise, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff08a';
      ctx.beginPath();
      ctx.arc(fx, cy + 4 - rise, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isPoison) {
    // Bubbling green toxin droplets
    for (let k = 0; k < 2; k++) {
      const px = cx + (k === 0 ? -rx * 0.35 : rx * 0.38);
      const rise = reduced ? 2 : ((time * 18 + k * 5 + cy) % 9);
      ctx.fillStyle = '#84e84c';
      ctx.beginPath();
      ctx.arc(px, cy + 3 - rise, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isStun) {
    // Classic PvZ2 cartoon orbiting gold stun stars above the zombie's head!
    const headY = anchor.y - anchor.size.height - 2;
    const orbitRx = Math.max(8, anchor.size.width * 0.36);
    const orbitRy = 3.2;
    ctx.strokeStyle = 'rgba(255, 224, 96, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, headY, orbitRx, orbitRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const ang = (reduced ? 0 : time * 5.2) + (k * Math.PI * 2) / 3;
      const sx = cx + Math.cos(ang) * orbitRx;
      const sy = headY + Math.sin(ang) * orbitRy;
      ctx.fillStyle = '#ffe658';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let p = 0; p < 8; p++) {
        const rr = p % 2 === 0 ? 3.2 : 1.3;
        const a = (p * Math.PI) / 4;
        const vx = sx + Math.cos(a) * rr;
        const vy = sy + Math.sin(a) * rr;
        if (p === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR PROJECTILES
// =========================================================================
function drawProjectile(ctx, projectile, target, reduced) {
  const x = projectile.x;
  const y = projectile.y;
  const rich = isRichCtx(ctx);

  if (projectile.team === 'enemy') {
    if (!rich) {
      ctx.fillStyle = '#8ce84c';
      ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
      return;
    }
    ctx.save();
    // Luminous acid glow
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 9);
    glow.addColorStop(0, 'rgba(170, 255, 86, 0.55)');
    glow.addColorStop(1, 'rgba(130, 224, 52, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    // Acid droplet body
    ctx.fillStyle = '#9cf04e';
    ctx.strokeStyle = '#244a12';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 6.5);
    ctx.quadraticCurveTo(x + 5, y, x, y + 5.2);
    ctx.quadraticCurveTo(x - 5, y, x, y - 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2ffd0';
    ctx.beginPath();
    ctx.arc(x - 1.2, y + 0.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const ink = projectileInk(projectile);
  const kind = ink.kind;
  const color = ink.color;
  const tags = Array.isArray(projectile.tags) ? projectile.tags : [];
  const isSplit = tags.includes('split');
  const isCryoBarrage = tags.includes('cryo_barrage');
  const crit = !!projectile.crit || tags.includes('crit');

  let dx = finite(projectile.vx) ?? 0;
  let dy = finite(projectile.vy) ?? 0;
  if (dx === 0 && dy === 0 && finite(projectile.dirx) != null && finite(projectile.diry) != null) {
    dx = projectile.dirx;
    dy = projectile.diry;
  }
  if (dx === 0 && dy === 0 && target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    dx = target.x - x;
    dy = target.y - y;
  }
  if (dx === 0 && dy === 0) dy = -1;
  const angle = Math.atan2(dy, dx);
  const life = finite(projectile.life);
  const alpha = life != null && life < 0.35 ? Math.max(0.3, life / 0.35) : 1;

  if (!rich) {
    ctx.fillStyle = color.main;
    ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (isCryoBarrage) {
    // Sleek faceted translucent Cryo Ice Lance
    const tailLen = reduced ? 10 : 20;
    const tailGrad = ctx.createLinearGradient(-tailLen, 0, 5, 0);
    tailGrad.addColorStop(0, 'rgba(72, 206, 245, 0)');
    tailGrad.addColorStop(0.5, 'rgba(130, 236, 255, 0.72)');
    tailGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-tailLen, 0);
    ctx.lineTo(-2, -3.6);
    ctx.lineTo(9, 0);
    ctx.lineTo(-2, 3.6);
    ctx.closePath();
    ctx.fill();

    // Faceted crystal spearhead
    ctx.fillStyle = '#92eeff';
    ctx.strokeStyle = '#185470';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(9.5, 0);
    ctx.lineTo(0, -4.2);
    ctx.lineTo(-5.5, 0);
    ctx.lineTo(0, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7.5, 0);
    ctx.lineTo(0, -1.8);
    ctx.lineTo(-2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  if (isSplit) {
    // Blazing gold-crimson shrapnel dart
    const tailLen = reduced ? 7 : 13;
    const tailGrad = ctx.createLinearGradient(-tailLen, 0, 4, 0);
    tailGrad.addColorStop(0, 'rgba(255, 118, 38, 0)');
    tailGrad.addColorStop(1, '#ffe478');
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-tailLen, 0);
    ctx.lineTo(0, -2.5);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 2.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb838';
    ctx.strokeStyle = '#681c0e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-1, -2.8);
    ctx.lineTo(-3.5, 0);
    ctx.lineTo(-1, 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Luminous soft halo so projectiles pop cleanly over hordes
  const haloR = crit ? 10 : 7;
  const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, haloR);
  halo.addColorStop(0, crit ? 'rgba(255, 238, 126, 0.6)' : 'rgba(255, 212, 118, 0.36)');
  halo.addColorStop(1, 'rgba(255, 212, 118, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Smooth tapered energy wake
  const tailLen = reduced ? 7 : kind === 'hero' ? 16 : kind === 'lightning' ? 17 : 13;
  const tailGrad = ctx.createLinearGradient(-tailLen, 0, 3, 0);
  tailGrad.addColorStop(0, 'rgba(255, 240, 190, 0)');
  tailGrad.addColorStop(0.55, color.main);
  tailGrad.addColorStop(1, color.core);
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-tailLen, 0);
  ctx.lineTo(-1, crit ? -3.4 : -2.6);
  ctx.lineTo(4, 0);
  ctx.lineTo(-1, crit ? 3.4 : 2.6);
  ctx.closePath();
  ctx.fill();

  // Sharp PvZ2-style projectile head
  if (kind === 'hero') {
    const grad = ctx.createLinearGradient(-4, -3.5, 7, 3.5);
    grad.addColorStop(0, '#fff4b8');
    grad.addColorStop(0.5, crit ? '#ffd648' : '#ff8c38');
    grad.addColorStop(1, color.main);
    ctx.fillStyle = grad;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.quadraticCurveTo(3, -4.0, -3.8, -2.4);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-3.8, 2.4);
    ctx.quadraticCurveTo(3, 4.0, 8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hot white specular core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(2.2, 0, 3.1, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'fire') {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(1, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'frost') {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(0, -3.6);
    ctx.lineTo(-4.5, 0);
    ctx.lineTo(0, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(0.5, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color.main;
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-3, -2.8);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3, 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.core;
    ctx.beginPath();
    ctx.arc(1.2, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp gold 4-point star glint for critical shots
  if (crit) {
    ctx.fillStyle = '#fff5a6';
    ctx.strokeStyle = '#d98a14';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 6.2 : 1.8;
      const a = (i * Math.PI) / 4;
      const px = 1 + Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// =========================================================================
// HD VECTOR GROUND HAZARDS (NAPALM FIRE SEA / FROST / POISON CLOUDS)
// =========================================================================
function cloudColor(cloud) {
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  if (kind.includes('napalm') || kind.includes('shrapnel') || kind.includes('fire') || kind.includes('burn')) return '#ff5a20';
  if (kind.includes('poison') || kind.includes('toxin') || kind.includes('miasma')) return '#6aaa3a';
  if (kind.includes('frost') || kind.includes('ice') || kind.includes('slow')) return '#7ee4ff';
  if (kind.includes('light')) return '#ffe14a';
  return '#74c47a';
}

function drawCloud(ctx, cloud, index, time = 0, reduced = false) {
  const x = finite(cloud.x);
  const y = finite(cloud.y);
  const radius = finite(cloud.radius) ?? finite(cloud.range);
  if (x == null || y == null || radius == null || radius <= 0) return;
  const r = clamp(radius, 4, 120);
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  const isFireSea = kind.includes('napalm') || kind.includes('shrapnel') || kind.includes('fire');
  const color = cloudColor(cloud);
  const seed = hashInt(index * 97 + Math.round(x) * 13 + Math.round(y) * 29);
  let fade = 1;
  const remaining = finite(cloud.remaining);
  const duration = finite(cloud.duration);
  if (remaining != null && duration != null && duration > 0) fade = clamp(remaining / duration, 0, 1);

  if (!isRichCtx(ctx)) {
    ctx.save();
    ctx.globalAlpha = 0.25 * fade;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
    ctx.restore();
    return;
  }

  ctx.save();
  if (isFireSea) {
    const flicker = reduced ? 0.9 : (0.82 + 0.18 * Math.sin(time * 13 + index));
    // Glowing layered magma fire pool
    const pool = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    pool.addColorStop(0, `rgba(255, 224, 96, ${(0.44 * fade * flicker).toFixed(3)})`);
    pool.addColorStop(0.5, `rgba(255, 98, 24, ${(0.34 * fade * flicker).toFixed(3)})`);
    pool.addColorStop(0.86, `rgba(196, 36, 14, ${(0.22 * fade).toFixed(3)})`);
    pool.addColorStop(1, 'rgba(180, 24, 10, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing dashed scorched ring
    ctx.strokeStyle = `rgba(255, 166, 62, ${(0.62 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash?.([6, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.96, r * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);

    // Stylized cel-shaded cartoon flame tongues dancing across the fire sea
    const flames = Math.min(11, Math.max(5, Math.round(r / 6)));
    for (let k = 0; k < flames; k++) {
      const h = hashInt(seed + k * 37);
      const ang = ((h & 255) / 255) * Math.PI * 2;
      const dist = (((h >>> 8) & 255) / 255) * (r * 0.72);
      const fx = x + Math.cos(ang) * dist;
      const fy = y + Math.sin(ang) * dist * 0.78;
      const sway = reduced ? 0 : Math.sin(time * 12 + k * 1.7) * 2.2;
      const fh = (8 + (h % 6)) * (reduced ? 0.9 : 0.8 + 0.28 * Math.sin(time * 15 + k * 2.3));
      const fw = 4.2 + (h % 3);

      ctx.globalAlpha = 0.84 * fade;
      ctx.fillStyle = '#ff5418';
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy);
      ctx.quadraticCurveTo(fx - fw * 0.8, fy - fh * 0.65, fx + sway, fy - fh);
      ctx.quadraticCurveTo(fx + fw * 0.8, fy - fh * 0.65, fx + fw, fy);
      ctx.quadraticCurveTo(fx, fy + 2.5, fx - fw, fy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffe568';
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.45, fy - 0.5);
      ctx.quadraticCurveTo(fx - fw * 0.3, fy - fh * 0.42, fx + sway * 0.6, fy - fh * 0.62);
      ctx.quadraticCurveTo(fx + fw * 0.3, fy - fh * 0.42, fx + fw * 0.45, fy - 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Soft translucent frost / poison hazard pool
  const pool = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  pool.addColorStop(0, color);
  pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = 0.24 * fade;
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.44 * fade;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.setLineDash?.([5, 4]);
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.82, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash?.([]);

  // Drifting bubbles / frost motes
  ctx.globalAlpha = 0.65 * fade;
  ctx.fillStyle = color;
  const count = Math.min(9, Math.max(4, Math.round(r / 7)));
  for (let k = 0; k < count; k++) {
    const h = hashInt(seed + k * 23);
    const ang = ((h & 255) / 255) * Math.PI * 2;
    const dist = (((h >>> 8) & 255) / 255) * (r * 0.72);
    const rise = reduced ? 0 : ((time * 16 + k * 5) % 9);
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.78 - rise;
    ctx.beginPath();
    ctx.arc(px, py, 2.2 + (h % 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR ARMORED SWEEPER WAR-RIG (AUTO SKILL)
// =========================================================================
function drawSweepers(ctx, state, time, reduced) {
  const list = state.arsenal?.sweepers;
  if (!Array.isArray(list) || !list.length) return;
  const rich = isRichCtx(ctx);
  const treadShift = reduced ? 0 : (time * 48) % 6;

  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const sw = list[i];
    if (!sw || !Number.isFinite(sw.x) || !Number.isFinite(sw.y)) continue;
    const cx = sw.x;
    const cy = sw.y;
    const hw = Math.min(26, Math.max(20, (sw.halfWidth || 34) * 0.64));

    if (!rich) {
      ctx.fillStyle = '#4e6472';
      ctx.fillRect(Math.round(cx - hw), Math.round(cy - 20), Math.round(hw * 2), 40);
      continue;
    }

    // 1. Twin sweeping golden headlight cones
    for (const side of [-1, 1]) {
      const lx = cx + side * (hw - 7);
      const cone = ctx.createLinearGradient(lx, cy - 20, lx, cy - 66);
      cone.addColorStop(0, 'rgba(255, 242, 162, 0.36)');
      cone.addColorStop(1, 'rgba(255, 242, 162, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 3, cy - 20);
      ctx.lineTo(lx - 13, cy - 66);
      ctx.lineTo(lx + 13, cy - 66);
      ctx.lineTo(lx + 3, cy - 20);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Soft dark ground contact shadow
    ctx.fillStyle = 'rgba(6, 10, 14, 0.48)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, hw + 4, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Heavy armored treads with animated cleats
    for (const side of [-1, 1]) {
      const tx = side < 0 ? cx - hw : cx + hw - 6.5;
      rRect(ctx, tx, cy - 14, 6.5, 32, 2.6);
      ctx.fillStyle = '#182026';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.7;
      ctx.stroke();

      ctx.fillStyle = '#5a6b75';
      for (let ty = -12 + treadShift; ty < 16; ty += 6) {
        ctx.fillRect(tx + 1.2, cy + ty, 4.1, 2.2);
      }
    }

    // 4. Main beveled cel-shaded steel truck chassis
    const bw = (hw - 4.5) * 2;
    const bx = cx - bw / 2;
    const bodyGrad = ctx.createLinearGradient(bx, cy - 16, bx + bw, cy + 16);
    bodyGrad.addColorStop(0, '#627c8e');
    bodyGrad.addColorStop(0.5, '#3b505e');
    bodyGrad.addColorStop(1, '#22313b');
    rRect(ctx, bx, cy - 16, bw, 35, 6);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();

    // Hood & rear armor deck plates
    ctx.fillStyle = '#7b97a8';
    rRect(ctx, bx + 3, cy - 13.5, bw - 6, 8, 2.5);
    ctx.fill();
    ctx.fillStyle = '#4c6372';
    rRect(ctx, bx + 3, cy + 6, bw - 6, 10, 2.5);
    ctx.fill();

    // 5. Glossy angled cyan armor windshield
    const winGrad = ctx.createLinearGradient(bx + 4, cy - 5, bx + bw - 4, cy + 1);
    winGrad.addColorStop(0, '#a6f8ff');
    winGrad.addColorStop(0.55, '#3cc6ea');
    winGrad.addColorStop(1, '#186684');
    rRect(ctx, bx + 3.5, cy - 5.5, bw - 7, 6.5, 2.4);
    ctx.fillStyle = winGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Windshield specular glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.moveTo(bx + 6, cy - 4.5);
    ctx.lineTo(bx + 12, cy - 4.5);
    ctx.lineTo(bx + 9.5, cy - 0.5);
    ctx.lineTo(bx + 5.5, cy - 0.5);
    ctx.closePath();
    ctx.fill();

    // 6. Roof turret hatch & flashing tactical siren beacon
    ctx.fillStyle = '#2b3944';
    ctx.beginPath();
    ctx.arc(cx, cy + 7.5, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const sirenRed = Math.floor(time * 12) % 2 === 0;
    ctx.fillStyle = sirenRed ? '#ff543c' : '#ffe65e';
    ctx.beginPath();
    ctx.arc(cx, cy + 7.5, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 7. Heavy angled V-shaped steel ram-plow with hazard stripes
    ctx.beginPath();
    ctx.moveTo(cx, cy - 27);
    ctx.lineTo(cx + hw + 4, cy - 19);
    ctx.lineTo(cx + hw + 2, cy - 13);
    ctx.lineTo(cx, cy - 18.5);
    ctx.lineTo(cx - hw - 2, cy - 13);
    ctx.lineTo(cx - hw - 4, cy - 19);
    ctx.closePath();
    const plowGrad = ctx.createLinearGradient(cx, cy - 27, cx, cy - 13);
    plowGrad.addColorStop(0, '#eef5f8');
    plowGrad.addColorStop(0.5, '#a8bcc8');
    plowGrad.addColorStop(1, '#5a6e7a');
    ctx.fillStyle = plowGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Hazard gold accent chevrons on plow
    ctx.fillStyle = '#f8ca46';
    for (const sx of [-12, -4, 4, 12]) {
      ctx.fillRect(cx + sx - 2, cy - 19 + Math.abs(sx) * 0.22, 4, 2.4);
    }

    // Bright bumper headlights
    ctx.fillStyle = '#fff9d6';
    ctx.beginPath();
    ctx.arc(cx - hw + 7, cy - 16, 2.1, 0, Math.PI * 2);
    ctx.arc(cx + hw - 7, cy - 16, 2.1, 0, Math.PI * 2);
    ctx.fill();

    // 8. Curling exhaust puffs trailing behind rear deck
    if (!reduced) {
      for (let p = 0; p < 2; p++) {
        const phase = ((time * 3.4 + i * 0.4 + p * 0.5) % 1);
        const ex = cx + (p === 0 ? -hw + 8 : hw - 8);
        const ey = cy + 20 + phase * 18;
        ctx.fillStyle = `rgba(186, 200, 210, ${(0.48 * (1 - phase)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 3 + phase * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// =========================================================================
// HD VECTOR ORBITAL PLASMA LASER (AUTO SKILL)
// =========================================================================
function drawBeams(ctx, state, time, reduced) {
  const list = state.arsenal?.beams;
  if (!Array.isArray(list) || !list.length) return;
  const rich = isRichCtx(ctx);
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const beam = list[i];
    if (!beam || !Number.isFinite(beam.x) || !(beam.life > 0)) continue;
    const maxLife = beam.maxLife > 0 ? beam.maxLife : 0.65;
    const ratio = clamp(beam.life / maxLife, 0, 1);
    const pulse = reduced ? 1 : (0.86 + 0.14 * Math.sin(time * 42 + i));
    const width = Math.max(14, (beam.width || 36) * (0.45 + 0.55 * ratio));
    const cx = beam.x;
    const bottom = ARENA.fenceY - 6;

    if (!rich) {
      ctx.globalAlpha = 0.7 * ratio;
      ctx.fillStyle = '#6cf0ff';
      ctx.fillRect(Math.round(cx - width / 2), 0, Math.round(width), bottom);
      continue;
    }

    // Smooth horizontal gradient plasma column
    const outerHalf = width * 0.85 * pulse;
    const colGrad = ctx.createLinearGradient(cx - outerHalf, 0, cx + outerHalf, 0);
    colGrad.addColorStop(0, 'rgba(34, 198, 255, 0)');
    colGrad.addColorStop(0.24, `rgba(62, 224, 255, ${(0.42 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.42, `rgba(168, 248, 255, ${(0.82 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.96 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.58, `rgba(168, 248, 255, ${(0.82 * ratio).toFixed(3)})`);
    colGrad.addColorStop(0.76, `rgba(62, 224, 255, ${(0.42 * ratio).toFixed(3)})`);
    colGrad.addColorStop(1, 'rgba(34, 198, 255, 0)');
    ctx.fillStyle = colGrad;
    ctx.fillRect(cx - outerHalf, 0, outerHalf * 2, bottom);

    // Animated descending orbital plasma rings
    if (!reduced) {
      const scan = (time * 480 + i * 73) % 76;
      ctx.strokeStyle = `rgba(232, 252, 255, ${(0.78 * ratio).toFixed(3)})`;
      ctx.lineWidth = 2.2;
      for (let sy = scan; sy < bottom; sy += 76) {
        ctx.beginPath();
        ctx.ellipse(cx, sy, width * 0.52, 4.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ground impact plasma flare at base
    const flare = ctx.createRadialGradient(cx, bottom - 2, 2, cx, bottom - 2, width * 0.95);
    flare.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * ratio).toFixed(3)})`);
    flare.addColorStop(0.45, `rgba(126, 244, 255, ${(0.65 * ratio).toFixed(3)})`);
    flare.addColorStop(1, 'rgba(56, 216, 255, 0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.ellipse(cx, bottom - 2, width * 0.95, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function ringRadius(value) {
  return Number.isFinite(value) && value > 0 ? clamp(value, 1, RANGE_LIMIT) : 0;
}

// Keep drawRange immediately before drawFence (tested by tests/range-ring.test.mjs).
function drawRange(ctx, state, slotIndex, strokeOnly, warned, cache) {
  if (slotIndex < 0) return;
  const slots = Array.isArray(state.slots) ? state.slots : [];
  const slot = slots[slotIndex];
  const unit = slot?.unit;
  if (!unit) return;
  let stats;
  if (cache.valid && cache.state === state && cache.slot === slotIndex) stats = cache.stats;
  else {
    stats = readStats(unit, state, warned);
    cache.valid = true;
    cache.state = state;
    cache.slot = slotIndex;
    cache.stats = stats;
  }
  if (!stats) return;
  const attack = ringRadius(stats.range);
  const aura = ringRadius(stats.aura?.range);
  const origin = slotCenter(slot, slotIndex);
  const cx = origin.x;
  const cy = origin.y;
  const primary = attack || aura;
  if (!primary) return;

  if (!isRichCtx(ctx)) {
    if (!strokeOnly) {
      ctx.fillStyle = 'rgba(240, 203, 114, 0.12)';
      ctx.fillRect(Math.round(cx - 8), Math.round(cy - 8), 16, 16);
    }
    return;
  }

  ctx.save();
  if (!strokeOnly) {
    // Soft translucent golden range wash + glowing selection ring under Hero's platform
    const wash = ctx.createRadialGradient(cx, cy, 18, cx, cy, primary);
    wash.addColorStop(0, attack ? 'rgba(248, 206, 98, 0.14)' : 'rgba(125, 206, 192, 0.14)');
    wash.addColorStop(0.85, attack ? 'rgba(248, 206, 98, 0.05)' : 'rgba(125, 206, 192, 0.05)');
    wash.addColorStop(1, 'rgba(248, 206, 98, 0.16)');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(cx, cy, primary, 0, Math.PI * 2);
    ctx.fill();

    // Subtle pulsing selection ring framing the Gunnery Platform
    ctx.strokeStyle = 'rgba(255, 232, 134, 0.9)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 48, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (attack) {
    ctx.strokeStyle = 'rgba(248, 208, 102, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash?.([8, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, attack, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);
  }
  if (aura && Math.abs(aura - attack) > 6) {
    ctx.strokeStyle = 'rgba(125, 206, 192, 0.82)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash?.([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, aura, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash?.([]);
  }
  ctx.restore();
}

function drawFence(ctx, state, time, flash, reduced) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.maxHp) || fence.maxHp <= 0 || !Number.isFinite(fence.hp)) return;
  const ratio = clamp(fence.hp / fence.maxHp, 0, 1);
  const x = 24;
  const y = ARENA.fenceY - 8;
  const width = ARENA.width - 48;
  const barH = 5.5;
  const emphasize = !reduced && ratio <= 0.28 && Math.floor(time * 6) % 2 === 0;

  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.44 * flash;
    ctx.fillStyle = '#ff4c36';
    ctx.fillRect(0, ARENA.fenceY - 12, ARENA.width, 20);
    ctx.restore();
  }

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#141a20';
    ctx.fillRect(x - 1, y - 1, width + 2, 7);
    ctx.fillStyle = ratio > 0.6 ? '#74d658' : ratio > 0.3 ? '#f4c046' : '#e04c3c';
    ctx.fillRect(x, y, Math.round(width * ratio), 5);
    return;
  }

  ctx.save();
  // Recessed metallic wall HP track
  rRect(ctx, x - 1.5, y - 1.5, width + 3, barH + 3, 4);
  ctx.fillStyle = 'rgba(12, 18, 24, 0.9)';
  ctx.fill();
  ctx.strokeStyle = emphasize ? '#ff9688' : 'rgba(196, 216, 228, 0.5)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const fillW = width * ratio;
  if (fillW > 1) {
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    if (ratio > 0.6) {
      grad.addColorStop(0, '#96f26e');
      grad.addColorStop(1, '#3ea636');
    } else if (ratio > 0.3) {
      grad.addColorStop(0, '#ffdc64');
      grad.addColorStop(1, '#cf8418');
    } else if (emphasize) {
      grad.addColorStop(0, '#ffd4c8');
      grad.addColorStop(1, '#ff6a56');
    } else {
      grad.addColorStop(0, '#ff6d54');
      grad.addColorStop(1, '#b8221e');
    }
    rRect(ctx, x, y, fillW, barH, 3);
    ctx.fillStyle = grad;
    ctx.fill();

    // Gloss sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    rRect(ctx, x + 1, y + 0.6, Math.max(0, fillW - 2), barH * 0.4, 2);
    ctx.fill();
  }

  // Subtle quarter-segment ticks
  ctx.fillStyle = 'rgba(10, 16, 20, 0.45)';
  for (let i = 1; i < 4; i++) {
    ctx.fillRect(x + (width * i) / 4 - 0.5, y, 1, barH);
  }
  ctx.restore();
}

// =========================================================================
// ENEMY TELEGRAPH MARKS & SYNERGY TETHERS
// =========================================================================
function enemyAnchor(enemy) {
  const size = measureEnemy(enemy);
  return {
    size,
    x: enemy.x,
    y: enemy.y + size.height / 2,
  };
}

function enemyCueLayout(enemy, anchor) {
  const isBoss = enemy?.kind === 'boss' || enemy?.type === 'boss';
  const spriteTop = anchor.y - anchor.size.height;
  const barW = isBoss ? Math.min(72, Math.max(54, Math.round(anchor.size.width * 1.15))) : clamp(Math.round(anchor.size.width * 0.85), 16, 48);
  const barH = isBoss ? 6.5 : HP_FILL;
  const plateBottom = spriteTop - 2 - SPRITE_GAP;
  const barY = plateBottom - barH;
  return {
    isBoss,
    barX: anchor.x - barW / 2,
    barY,
    barW,
    statusY: (barY - 2) - STATUS_GAP - STATUS_CELL,
  };
}

function drawLeapMark(ctx, enemy, anchor) {
  const topY = anchor.y - anchor.size.height - 5;
  ctx.save();
  ctx.fillStyle = '#f8b83a';
  if (isRichCtx(ctx)) {
    rRect(ctx, anchor.x - 6, topY, 12, 3.5, 1.8);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(Math.round(anchor.x - 5), Math.round(topY), 10, 3);
  }
  ctx.restore();
}

function drawChargeMark(ctx, enemy, anchor) {
  if (!enemy || enemy.dead) return;
  const fusing = enemy.chargeTimer > 0 && enemy.chargeWindup > 0;
  const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
  const stopY = ARENA.fenceY - radius;
  const approaching = !fusing && enemy.chargeLit !== true && enemy.chargeGap > 0
    && enemy.y >= stopY - enemy.chargeGap && enemy.y < stopY - 0.75;
  if (!fusing && !approaching) return;
  const markY = anchor.y - anchor.size.height - 13;
  ctx.save();
  if (approaching) {
    ctx.fillStyle = '#ffbe32';
    if (isRichCtx(ctx)) {
      rRect(ctx, anchor.x - 6, markY, 12, 3.6, 1.8);
      ctx.fill();
    } else {
      ctx.fillRect(Math.round(anchor.x - 5), Math.round(markY), 10, 3);
    }
    ctx.restore();
    return;
  }
  const ratio = clamp(enemy.chargeTimer / enemy.chargeWindup, 0, 1);
  const w = Math.max(3, 18 * ratio);
  ctx.fillStyle = '#ff3e30';
  if (isRichCtx(ctx)) {
    rRect(ctx, anchor.x - w / 2, markY, w, 3.6, 1.8);
    ctx.fill();
  } else {
    ctx.fillRect(Math.round(anchor.x - w / 2), Math.round(markY), Math.round(w), 3);
  }
  ctx.restore();
}

function boardHushed(enemies) {
  if (!Array.isArray(enemies)) return false;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || enemy.dead || !(enemy.hp > 0) || !(enemy.hushFactor > 0)) continue;
    if (statusLive(enemy, 'stun')) continue;
    const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
    if (enemy.y >= ARENA.fenceY - radius - 0.75) return true;
  }
  return false;
}

function drawWardLinks(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(182, 232, 255, 0.78)';
  ctx.lineWidth = 2.0;
  ctx.setLineDash?.([4, 3]);
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    const from = anchors[i];
    if (!source || source.dead || !(source.wardRange > 0) || !from) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const ally = enemies[j];
      if (!ally || ally.dead || !(ally.wardShield > 0)) continue;
      const dist = Math.hypot(ally.x - source.x, ally.y - source.y);
      if (dist <= source.wardRange && dist < bestDist) {
        best = j;
        bestDist = dist;
      }
    }
    const to = best >= 0 ? anchors[best] : null;
    if (!to) continue;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - from.size.height * 0.5);
    ctx.lineTo(to.x, to.y - to.size.height * 0.5);
    ctx.stroke();
  }
  ctx.setLineDash?.([]);
  ctx.restore();
}

function drawBannerHaste(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 190, 68, 0.72)';
  ctx.lineWidth = 1.6;
  for (let j = 0; j < enemies.length; j++) {
    const ally = enemies[j];
    const to = anchors[j];
    if (!ally || ally.dead || !(ally.hp > 0) || !to || ally.bannerRange > 0) continue;
    const radius = Number.isFinite(ally.radius) && ally.radius > 0 ? ally.radius : 12;
    if (!(ally.y < ARENA.fenceY - radius - 1e-6)) continue;
    let from = null;
    for (let i = 0; i < enemies.length; i++) {
      if (i === j) continue;
      const banner = enemies[i];
      if (!banner || banner.dead || !(banner.hp > 0)) continue;
      if (!(banner.bannerRange > 0) || !(banner.bannerHaste > 0) || !anchors[i]) continue;
      const dx = ally.x - banner.x;
      const dy = ally.y - banner.y;
      if (dx * dx + dy * dy > banner.bannerRange * banner.bannerRange) continue;
      from = anchors[i];
      break;
    }
    if (!from) continue;
    const x1 = to.x;
    const y1 = to.y - to.size.height * 0.5;
    const bx = from.x;
    const by = from.y - from.size.height * 0.5;
    const len = Math.hypot(bx - x1, by - y1) || 1;
    const dash = Math.min(12, len);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ((bx - x1) / len) * dash, y1 + ((by - y1) / len) * dash);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMendLinks(ctx, enemies, anchors) {
  if (!isRichCtx(ctx)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 236, 126, 0.8)';
  ctx.lineWidth = 2.0;
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    const from = anchors[i];
    if (!source || source.dead || !(source.hp > 0) || !(source.mendRange > 0) || !from) continue;
    if (statusLive(source, 'stun')) continue;
    let best = -1;
    let bestRatio = Infinity;
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const ally = enemies[j];
      if (!ally || ally.dead || !(ally.hp > 0) || !anchors[j]) continue;
      if (!Number.isFinite(ally.maxHp) || !(ally.maxHp > 0) || !(ally.hp < ally.maxHp)) continue;
      const dist = Math.hypot(ally.x - source.x, ally.y - source.y);
      if (dist > source.mendRange) continue;
      const ratio = ally.hp / ally.maxHp;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = j;
      }
    }
    if (best < 0) continue;
    const to = anchors[best];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y - from.size.height * 0.5);
    ctx.lineTo(to.x, to.y - to.size.height * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWardBubble(ctx, enemy, anchor) {
  if (enemy.dead || !isRichCtx(ctx)) return;
  const cx = anchor.x;
  const cy = anchor.y - anchor.size.height * 0.48;
  const rx = anchor.size.width * 0.58;
  const ry = anchor.size.height * 0.56;
  ctx.save();
  ctx.strokeStyle = 'rgba(182, 236, 255, 0.85)';
  ctx.fillStyle = 'rgba(150, 224, 255, 0.14)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPriorityCrown(ctx, enemy, anchor) {
  if (!enemy || enemy.dead || !isRichCtx(ctx)) return;
  if (!(enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0)) return;
  const cx = anchor.x;
  const y = anchor.y - anchor.size.height - 13;
  ctx.save();
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx, y - 3.6);
  ctx.lineTo(cx + 3.2, y);
  ctx.lineTo(cx, y + 3.6);
  ctx.lineTo(cx - 3.2, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHushHeroCue(ctx, anchorX, topY) {
  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#8ce4d8';
    ctx.fillRect(Math.round(anchorX - 5), Math.round(topY - 6), 10, 3);
    return;
  }
  ctx.save();
  rRect(ctx, anchorX - 8, topY - 8, 16, 4.5, 2.2);
  ctx.fillStyle = '#7ce8da';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function enemyFlash(enemy, hits, now, duration) {
  let best = 0;
  const radius = (finite(enemy.radius) ?? 14) + 8;
  const limit = radius * radius;
  for (let i = hits.length - 1; i >= 0; i--) {
    const cue = hits[i];
    const span = cue.crit || cue.kill ? duration * 1.3 : duration;
    const power = cueStrength(cue.at, now, span);
    if (power <= best) continue;
    if (cue.targetId && cue.targetId === enemy.id) {
      best = power;
      continue;
    }
    if (cue.targetId || cue.x == null || cue.y == null) continue;
    const dx = cue.x - enemy.x;
    const dy = cue.y - enemy.y;
    if (dx * dx + dy * dy <= limit) best = power;
  }
  return best;
}

function unitFlash(unitId, shots, now, duration) {
  if (!unitId) return 0;
  let best = 0;
  for (let i = shots.length - 1; i >= 0; i--) {
    const cue = shots[i];
    if (cue.sourceId !== unitId) continue;
    best = Math.max(best, cueStrength(cue.at, now, duration));
  }
  return best;
}

function lerpAngle(current, target, factor) {
  let diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(diff) < 0.004) return target;
  return current + diff * factor;
}

// =========================================================================
// MAIN RENDERER INSTANCE
// =========================================================================
function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer requires a canvas');
  }
  const display = context2d(canvas, false);
  if (!display) throw new TypeError('createRenderer could not get a 2d context');

  const effects = createEffects();
  const warned = {stats: false};
  const rangeCache = {valid: false, state: null, slot: -1, stats: null};
  const hits = [];
  const shots = [];
  let fenceAt = null;
  let wallImmuneAt = null;
  let heroShotAt = null;
  let heroAimAngle = -Math.PI / 2;
  let heroAimTarget = -Math.PI / 2;
  let shakeAt = null;
  let shakeAmp = 0;
  let hordeAt = null;
  let pending = [];
  let runId;
  let seenRun = false;
  let lastSim = null;
  let lastFrameMs = null;
  let destroyed = false;
  let view = {
    dpr: 1,
    offsetX: 0,
    offsetY: 0,
    destW: ARENA.width,
    destH: ARENA.height,
  };

  function resetCues() {
    hits.length = 0;
    shots.length = 0;
    fenceAt = null;
    wallImmuneAt = null;
    heroShotAt = null;
    heroAimAngle = -Math.PI / 2;
    heroAimTarget = -Math.PI / 2;
    shakeAt = null;
    shakeAmp = 0;
    hordeAt = null;
  }

  function triggerShake(at, amp) {
    const active = shakeAt != null ? cueStrength(shakeAt, at, 260) * shakeAmp : 0;
    if (amp >= active) {
      shakeAt = at;
      shakeAmp = amp;
    }
  }

  function remember(batch) {
    const at = nowMs();
    for (let i = 0; i < batch.length; i++) {
      const event = batch[i];
      const type = event.type;
      if (type === 'hit' || type === 'kill') {
        pushCapped(hits, {
          at,
          crit: !!event.crit,
          kill: type === 'kill',
          x: finite(event.x),
          y: finite(event.y),
          targetId: idOf(event.targetId, event.enemyId, typeof event.target === 'string' ? event.target : null),
        });
      } else if (type === 'shot') {
        const sx = finite(event.x);
        const sy = finite(event.y);
        pushCapped(shots, {
          at,
          x: sx,
          y: sy,
          sourceId: idOf(event.sourceId, event.unitId, typeof event.source === 'string' ? event.source : null),
        });
        if (event.towerType === 'hero' || (Array.isArray(event.tags) && event.tags.includes('hero'))) {
          heroShotAt = at;
          const tx = finite(event.targetX) ?? finite(event.tx);
          const ty = finite(event.targetY) ?? finite(event.ty);
          if (tx != null && ty != null) {
            const ox = sx ?? ARENA.width / 2;
            const oy = sy ?? ARENA.frontY;
            const raw = Math.atan2(ty - oy, tx - ox);
            heroAimTarget = clamp(raw, -Math.PI * 0.94, -Math.PI * 0.06);
          }
        }
      } else if (type === 'fence_hit') {
        fenceAt = at;
        triggerShake(at, 1.8);
      } else if (type === 'wall_immune') {
        wallImmuneAt = at;
        triggerShake(at, 1.8);
      } else if (type === 'fence_surge') {
        triggerShake(at, 4.2);
      } else if (type === 'napalm_blast') {
        triggerShake(at, 3.4);
      } else if (type === 'orbital_beam') {
        triggerShake(at, 3.2);
      } else if (type === 'armored_car') {
        triggerShake(at, 2.4);
      } else if (type === 'em_strike') {
        triggerShake(at, 1.8);
      } else if (type === 'boss_enrage') {
        triggerShake(at, 2.8);
      } else if (type === 'corpse_explode') {
        triggerShake(at, 1.6);
      } else if (type === 'wave_horde') {
        hordeAt = at;
      }
    }
  }

  function measureElement() {
    const rect = typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : {left: 0, top: 0, width: canvas.clientWidth || canvas.width || ARENA.width, height: canvas.clientHeight || canvas.height || ARENA.height};
    let borderLeft = 0;
    let borderRight = 0;
    let borderTop = 0;
    let borderBottom = 0;
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;
    if (typeof globalThis.getComputedStyle === 'function') {
      const style = globalThis.getComputedStyle(canvas);
      borderLeft = parseFloat(style.borderLeftWidth) || 0;
      borderRight = parseFloat(style.borderRightWidth) || 0;
      borderTop = parseFloat(style.borderTopWidth) || 0;
      borderBottom = parseFloat(style.borderBottomWidth) || 0;
      padLeft = parseFloat(style.paddingLeft) || 0;
      padRight = parseFloat(style.paddingRight) || 0;
      padTop = parseFloat(style.paddingTop) || 0;
      padBottom = parseFloat(style.paddingBottom) || 0;
    }
    return {
      width: Math.max(0, rect.width - borderLeft - borderRight - padLeft - padRight),
      height: Math.max(0, rect.height - borderTop - borderBottom - padTop - padBottom),
      left: rect.left + borderLeft + padLeft,
      top: rect.top + borderTop + padTop,
    };
  }

  function layout(contentW, contentH, dpr) {
    const deviceW = canvas.width;
    const deviceH = canvas.height;
    const fit = Math.min(deviceW / ARENA.width, deviceH / ARENA.height);
    const scale = fit > 0 ? fit : 1;
    const destW = Math.max(1, Math.round(ARENA.width * scale));
    const destH = Math.max(1, Math.round(ARENA.height * scale));
    view = {
      dpr,
      offsetX: Math.round((deviceW - destW) / 2),
      offsetY: Math.round((deviceH - destH) / 2),
      destW,
      destH,
      cssW: contentW,
      cssH: contentH,
    };
  }

  function resize() {
    if (destroyed) return;
    const box = measureElement();
    const dpr = currentDpr();
    if (!(box.width > 2) || !(box.height > 2)) {
      if (!(canvas.width > 0) || !(canvas.height > 0)) {
        canvas.width = ARENA.width;
        canvas.height = ARENA.height;
      }
      layout(canvas.width, canvas.height, dpr);
      return;
    }
    const targetW = Math.max(1, Math.round(box.width * dpr));
    const targetH = Math.max(1, Math.round(box.height * dpr));
    if (Math.abs(canvas.width - targetW) > 2 || Math.abs(canvas.height - targetH) > 2) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    layout(box.width, box.height, dpr);
  }

  function pointFromClient(clientX, clientY) {
    if (destroyed || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return {x: Number.NaN, y: Number.NaN};
    }
    resize();
    const box = measureElement();
    if (!(box.width > 0) || !(box.height > 0) || !(view.destW > 0) || !(view.destH > 0) || !(canvas.width > 0) || !(canvas.height > 0)) {
      return {x: Number.NaN, y: Number.NaN};
    }
    const deviceX = (clientX - box.left) * (canvas.width / box.width);
    const deviceY = (clientY - box.top) * (canvas.height / box.height);
    return {
      x: (deviceX - view.offsetX) / view.destW * ARENA.width,
      y: (deviceY - view.offsetY) / view.destH * ARENA.height,
    };
  }

  function hitSlot(clientX, clientY) {
    const point = pointFromClient(clientX, clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return -1;
    if (point.x < 0 || point.y < 0 || point.x >= ARENA.width || point.y >= ARENA.height) return -1;
    return hitSlotAt(point.x, point.y);
  }

  function presentationDt(state) {
    const time = finite(state?.time);
    if (time == null) return 0;
    if (lastSim == null) {
      lastSim = time;
      return 0;
    }
    const dt = time - lastSim;
    lastSim = time;
    if (!(dt > 0)) return 0;
    return dt > 0.1 ? 0.1 : dt;
  }

  function drawSurgeOverlay(ctx, state, time, reduced) {
    const timer = state.surge?.shieldTimer || 0;
    if (!(timer > 0)) return;
    const ratio = clamp(timer / 3, 0, 1);
    const elapsed = Math.max(0, 3 - timer);
    const shimmer = reduced ? 0.85 : (0.76 + 0.24 * Math.sin(time * 16));

    if (!isRichCtx(ctx)) {
      ctx.fillStyle = '#78e4ff';
      ctx.fillRect(0, ARENA.fenceY - 10, ARENA.width, 6);
      return;
    }

    ctx.save();
    // Luminous curved energy dome protecting the fortified wall
    const domeGrad = ctx.createLinearGradient(0, ARENA.fenceY - 22, 0, ARENA.fenceY);
    domeGrad.addColorStop(0, 'rgba(104, 232, 255, 0)');
    domeGrad.addColorStop(1, `rgba(104, 232, 255, ${(0.34 * shimmer).toFixed(3)})`);
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.moveTo(0, ARENA.fenceY);
    ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 24, ARENA.width, ARENA.fenceY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(176, 248, 255, ${(0.92 * shimmer).toFixed(3)})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(8, ARENA.fenceY - 6);
    ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 19, ARENA.width - 8, ARENA.fenceY - 6);
    ctx.stroke();

    // Golden shield duration meter
    const bw = (ARENA.width - 52) * ratio;
    if (bw > 1) {
      rRect(ctx, 26, ARENA.fenceY - 15, bw, 3, 1.5);
      ctx.fillStyle = '#ffd862';
      ctx.fill();
    }

    // Sweeping curved shockwave arc during initial 0.58s blast
    if (elapsed < 0.58) {
      const progress = elapsed / 0.58;
      const waveY = ARENA.fenceY - progress * 265;
      const fade = 1 - progress;
      ctx.strokeStyle = `rgba(120, 236, 255, ${(0.45 * fade).toFixed(3)})`;
      ctx.lineWidth = 14 * fade + 4;
      ctx.beginPath();
      ctx.moveTo(0, waveY + 18);
      ctx.quadraticCurveTo(ARENA.width / 2, waveY - 22, ARENA.width, waveY + 18);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 242, 182, ${(0.92 * fade).toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(0, waveY + 14);
      ctx.quadraticCurveTo(ARENA.width / 2, waveY - 24, ARENA.width, waveY + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paint(ctx, state, ui, now, frameDt) {
    const reduced = !!(ui.settings && ui.settings.reducedMotion) || !!ui.reducedMotion;
    const selected = normalizeSlot(ui.selectedSlot);
    const showRange = ui.range !== false;
    const time = finite(state?.time) ?? 0;
    const visualTime = reduced ? Math.round(time * 8) / 8 : time;
    const flashSpan = reduced ? 80 : FLASH_MS;
    rangeCache.valid = false;

    enableSmooth(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    if (!state) {
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
      return;
    }

    // Smooth camera shake on heavy combat impacts
    const shakeStr = !reduced && shakeAt != null ? cueStrength(shakeAt, now, 260) : 0;
    const shakeX = shakeStr > 0 ? Math.sin(now * 0.085) * shakeAmp * shakeStr : 0;
    const shakeY = shakeStr > 0 ? Math.cos(now * 0.11) * shakeAmp * 0.7 * shakeStr : 0;
    if (shakeX || shakeY) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    try {
      // 1. HD Vector Wasteland Highway, Fortified Wall & Central Commander Platform (ZERO 2×5 grid!)
      isolate(ctx, () => drawWorld(ctx, state, {time: visualTime, reducedMotion: reduced}));

      // 2. Ground Hazard Zones (Napalm Fire Sea, Frost, Poison)
      const clouds = Array.isArray(state.clouds) ? state.clouds : [];
      const cloudCount = Math.min(clouds.length, MAX_CLOUDS);
      const cloudStart = clouds.length - cloudCount;
      for (let i = cloudStart; i < clouds.length; i++) {
        if (clouds[i]) drawCloud(ctx, clouds[i], i, visualTime, reduced);
      }

      // 3. Soft Range Wash + Platform Selection Ring when Gunner is tapped
      if (showRange) drawRange(ctx, state, selected, false, warned, rangeCache);

      // 4. Enemies (Sorted back-to-front for crisp 2.5D depth)
      const enemies = orderedEnemies(state);
      const anchors = new Array(enemies.length);
      const enemiesById = Object.create(null);
      let leadEnemy = null;
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.id != null) enemiesById[enemy.id] = enemy;
        if (!enemy.dead && enemy.hp > 0 && (!leadEnemy || enemy.y > leadEnemy.y)) {
          leadEnemy = enemy;
        }
        const anchor = enemyAnchor(enemy);
        anchors[i] = anchor;
        const flash = enemyFlash(enemy, hits, now, flashSpan);
        isolate(ctx, () => {
          if (enemy.phased === true) ctx.globalAlpha = 0.42;
          drawEnemy(ctx, enemy, anchor.x, anchor.y, {time: visualTime, scale: 1, flash});
          if (enemy.phased === true) ctx.globalAlpha = 1;
        });
        if (!enemy.dead) {
          drawStatusAura(ctx, enemy, anchor, visualTime, reduced);
          if (enemy.wardShield > 0) drawWardBubble(ctx, enemy, anchor);
          if (enemy.leapTimer > 0) drawLeapMark(ctx, enemy, anchor);
          if (enemy.chargeGap > 0 || enemy.chargeTimer > 0) drawChargeMark(ctx, enemy, anchor);
          if (enemy.bannerRange > 0 || enemy.wardRange > 0 || enemy.mendEvery > 0) drawPriorityCrown(ctx, enemy, anchor);
        }
      }

      // 5. Zombie Synergy Tethers (Warden / Banner / Mender)
      isolate(ctx, () => {
        drawWardLinks(ctx, enemies, anchors);
        drawBannerHaste(ctx, enemies, anchors);
        drawMendLinks(ctx, enemies, anchors);
      });

      // 6. Armored Sweeper War-Rigs
      drawSweepers(ctx, state, visualTime, reduced);

      // 7. Smooth Hero Aim Tracking (track live lead zombie when idle between shots)
      const slots = Array.isArray(state.slots) ? state.slots : [];
      const recentlyShot = heroShotAt != null && (now - heroShotAt) < 420;
      if (!recentlyShot && leadEnemy) {
        const raw = Math.atan2(leadEnemy.y - ARENA.frontY, leadEnemy.x - ARENA.width / 2);
        heroAimTarget = clamp(raw, -Math.PI * 0.94, -Math.PI * 0.06);
      } else if (!recentlyShot && !leadEnemy) {
        heroAimTarget = -Math.PI / 2;
      }
      const aimFactor = reduced ? 1 : clamp(frameDt * 16, 0.18, 0.55);
      heroAimAngle = lerpAngle(heroAimAngle, heroAimTarget, aimFactor);
      const heroRecoil = heroShotAt != null ? cueStrength(heroShotAt, now, reduced ? 65 : 125) : 0;

      // 8. Wall Gunner (Hero anchored solidly on the Central Commander Platform)
      const hushed = boardHushed(enemies);
      for (let index = 0; index < slots.length; index++) {
        const slot = slots[index];
        const unit = slot?.unit;
        if (!unit) continue;
        const isHero = unit.kind === 'hero' || unit.type === 'hero';
        const size = measureDefender(unit);
        const origin = slotCenter(slot, index);
        const anchorX = origin.x;
        const anchorY = isHero ? origin.y + 18 : origin.y + size.height / 2;
        const flash = unitFlash(unit.id, shots, now, flashSpan);
        isolate(ctx, () => drawDefender(ctx, unit, anchorX, anchorY, {
          time: visualTime,
          scale: 1,
          flash,
          aimAngle: isHero ? heroAimAngle : -Math.PI / 2,
          recoil: isHero ? heroRecoil : 0,
          upgrades: unit.upgrades,
        }));
        if (hushed) drawHushHeroCue(ctx, anchorX, anchorY - size.height);
      }

      // 9. HD Vector Projectiles
      const projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
      const visibleShots = [];
      const shotStart = Math.max(0, projectiles.length - MAX_PROJECTILES);
      for (let i = shotStart; i < projectiles.length; i++) {
        const projectile = projectiles[i];
        if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) continue;
        if (finite(projectile.life) != null && projectile.life <= 0) continue;
        if (projectile.x < -48 || projectile.y < -48 || projectile.x > ARENA.width + 48 || projectile.y > ARENA.height + 48) continue;
        visibleShots.push(projectile);
      }
      const targeted = Object.create(null);
      for (let i = 0; i < visibleShots.length; i++) {
        const projectile = visibleShots[i];
        if (projectile.targetId != null) targeted[projectile.targetId] = true;
        drawProjectile(ctx, projectile, projectile.targetId != null ? enemiesById[projectile.targetId] : null, reduced);
      }

      // 10. Orbital Plasma Laser Columns
      drawBeams(ctx, state, visualTime, reduced);

      // 11. Dashed Range Ring Stroke Overlay (when Hero is selected)
      if (showRange) drawRange(ctx, state, selected, true, warned, rangeCache);

      // 12. Crisp Enemy HP Bars, Target Reticles & Status Badges
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.dead) continue;
        const anchor = anchors[i];
        const cue = enemyCueLayout(enemy, anchor);
        const fresh = enemyFlash(enemy, hits, now, flashSpan) > 0.4;
        const maxHp = Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 ? enemy.maxHp : null;
        const low = maxHp != null && Number.isFinite(enemy.hp) && enemy.hp / maxHp <= 0.28;
        const emphasize = fresh || (!reduced && low && Math.floor(visualTime * 6) % 2 === 0);
        drawHpBar(ctx, cue.barX, cue.barY, cue.barW, enemy.hp, enemy.maxHp, emphasize, cue.isBoss);
        if (Number.isFinite(enemy.hp) && (fresh || targeted[enemy.id] === true)) {
          drawTargetMark(ctx, cue.barX, cue.barY, cue.barW, cue.isBoss);
        }
        drawStatuses(ctx, enemy, anchor.x, cue.statusY);
      }

      // 13. Wall Surge Shockwave, Aegis Block Flash & Wall HP Bar
      drawSurgeOverlay(ctx, state, visualTime, reduced);
      const aegisFlash = wallImmuneAt != null ? cueStrength(wallImmuneAt, now, reduced ? 120 : 240) : 0;
      if (aegisFlash > 0 && isRichCtx(ctx)) {
        ctx.save();
        ctx.strokeStyle = `rgba(140, 244, 255, ${(0.9 * aegisFlash).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(8, ARENA.fenceY - 6);
        ctx.quadraticCurveTo(ARENA.width / 2, ARENA.fenceY - 18, ARENA.width - 8, ARENA.fenceY - 6);
        ctx.stroke();
        ctx.restore();
      }
      drawFence(ctx, state, visualTime, cueStrength(fenceAt, now, reduced ? 100 : 200), reduced);

      // 14. Crimson Horizon Pulse on Horde Warning
      const hordeStr = hordeAt != null ? cueStrength(hordeAt, now, reduced ? 500 : 1500) : 0;
      if (hordeStr > 0 && isRichCtx(ctx)) {
        const beat = reduced ? 0.65 : (0.55 + 0.45 * Math.sin(now * 0.018));
        ctx.save();
        const grad = ctx.createLinearGradient(0, 0, 0, 68);
        grad.addColorStop(0, `rgba(236, 56, 48, ${(0.42 * hordeStr * beat).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(236, 56, 48, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, ARENA.width, 68);
        ctx.restore();
      }

      // 15. Combat VFX Particles, Lightning Arcs & Floating Damage Numbers
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
    } finally {
      if (shakeX || shakeY) ctx.restore();
    }
  }

  function draw(state, ui) {
    if (destroyed) return;
    const viewUi = ui && typeof ui === 'object' ? ui : {};
    resize();
    const now = nowMs();
    const frameDt = lastFrameMs == null ? 1 / 60 : clamp((now - lastFrameMs) / 1000, 0.001, 0.1);
    lastFrameMs = now;

    pruneList(hits, now);
    pruneList(shots, now);
    if (fenceAt != null && now - fenceAt > CUE_MS) fenceAt = null;
    if (wallImmuneAt != null && now - wallImmuneAt > 260) wallImmuneAt = null;
    if (heroShotAt != null && now - heroShotAt > 460) heroShotAt = null;
    if (shakeAt != null && now - shakeAt > 260) { shakeAt = null; shakeAmp = 0; }
    if (hordeAt != null && now - hordeAt > 1500) hordeAt = null;

    if (state && seenRun && state.runId !== runId) {
      effects.clear();
      resetCues();
      lastSim = finite(state.time);
      if (pending.length) {
        const batch = pending.slice();
        effects.ingest(batch);
        remember(batch);
      }
    }
    if (state) {
      seenRun = true;
      runId = state.runId;
    }
    pending = [];
    effects.update(presentationDt(state));

    // Direct Native High-DPI Vector Rendering (NO 360×640 offscreen pixel stretch!)
    enableSmooth(display);
    display.setTransform(1, 0, 0, 1, 0, 0);
    display.globalAlpha = 1;
    display.fillStyle = LETTERBOX;
    display.fillRect(0, 0, canvas.width, canvas.height);

    display.setTransform(view.destW / ARENA.width, 0, 0, view.destH / ARENA.height, view.offsetX, view.offsetY);
    enableSmooth(display);
    display.save();
    if (typeof display.beginPath === 'function' && typeof display.rect === 'function' && typeof display.clip === 'function') {
      display.beginPath();
      display.rect(0, 0, ARENA.width, ARENA.height);
      display.clip();
    }
    paint(display, state, viewUi, now, frameDt);
    display.restore();
  }

  function ingestEvents(events) {
    if (destroyed) return;
    const batch = normalizeBatch(events);
    if (!batch.length) return;
    for (let i = 0; i < batch.length; i++) pending.push(batch[i]);
    if (pending.length > MAX_BATCH) pending.splice(0, pending.length - MAX_BATCH);
    effects.ingest(batch);
    remember(batch);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    effects.clear();
    resetCues();
    pending = [];
  }

  return {draw, ingestEvents, resize, destroy, pointFromClient, hitSlot};
}

};
__ff_factories["src/render/world.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["drawWorld"] = drawWorld;
__ff_exports["drawIcon"] = drawIcon;
const __ff_m0 = __ff_load("src/shared.js");
const ARENA = __ff_m0["ARENA"];
/**
 * Fencefall v5 — PvZ2-Style Sharp HD Vector Battlefield Backdrop (360×640 logical space).
 *
 * Rendered directly at native device pixel ratio (2×/3× Retina) with smooth gradients,
 * bold dark ink outlines, warm spotlight cones, progressive steel wall damage, glowing
 * energy wall shield, and a dramatic Central Commander Gunnery Platform framing the
 * permanently anchored solo Wall Gunner. ZERO 2×5 grid drawn.
 */


const W = ARENA.width;
const H = ARENA.height;
const FENCE_Y = ARENA.fenceY; // 512

const STARS = Object.freeze([
  [22, 10, 1.3, false], [58, 16, 1.1, false], [92, 8, 1.5, true],
  [136, 14, 1.0, false], [178, 7, 1.2, false], [218, 15, 1.5, true],
  [254, 9, 1.1, false], [326, 12, 1.2, false], [346, 7, 1.0, false],
  [40, 26, 0.9, false], [156, 24, 0.9, false], [272, 22, 1.0, false],
]);

const SCRUBS = Object.freeze([
  [12, 118, 1.0], [18, 198, 0.85], [10, 278, 1.1], [16, 356, 0.95], [13, 434, 1.05],
  [348, 134, 0.95], [343, 218, 1.1], [350, 304, 0.9], [344, 386, 1.0], [348, 450, 0.85],
]);

const CRACKS = Object.freeze([
  [[62, 118], [76, 130], [70, 144], [84, 152]],
  [[264, 164], [250, 178], [262, 194], [248, 206]],
  [[112, 248], [126, 258], [120, 274], [134, 284]],
  [[282, 312], [268, 326], [276, 342]],
  [[88, 378], [102, 392], [96, 408], [110, 418]],
  [[234, 416], [248, 428], [240, 444]],
]);

const PEBBLES = Object.freeze([
  [44, 102, 3.2, 2.0], [312, 124, 3.8, 2.2], [52, 178, 2.6, 1.7], [306, 202, 3.0, 1.9],
  [40, 260, 3.6, 2.1], [318, 282, 2.8, 1.8], [48, 342, 3.1, 2.0], [308, 366, 3.5, 2.2],
  [54, 424, 2.9, 1.8], [304, 442, 3.4, 2.0], [132, 196, 2.4, 1.5], [228, 276, 2.6, 1.6],
  [144, 352, 2.2, 1.4], [216, 398, 2.5, 1.5],
]);

const SCORCH_MARKS = Object.freeze([
  [104, 174, 18, 10], [246, 238, 22, 12], [148, 322, 20, 11], [266, 386, 19, 10],
]);

const SKID_MARKS = Object.freeze([
  [124, 126, 128, 184], [134, 126, 138, 184],
  [218, 286, 224, 352], [228, 286, 234, 352],
]);

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.createLinearGradient === 'function'
    && typeof ctx.createRadialGradient === 'function'
  );
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function fenceRatio(state) {
  const fence = state && state.fence;
  const max = fence && fence.maxHp;
  const hp = fence && fence.hp;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(hp)) return 1;
  if (hp <= 0) return 0;
  if (hp >= max) return 1;
  return hp / max;
}

function directorHasBoss(state) {
  return Boolean(state && state.director && state.director.hasBoss === true);
}

function heroUpgrades(state) {
  const slots = state?.slots;
  if (!Array.isArray(slots)) return {};
  for (const s of slots) {
    if (s?.unit && (s.unit.kind === 'hero' || s.unit.type === 'hero')) {
      return s.unit.upgrades || {};
    }
  }
  return {};
}

// =========================================================================
// SKY, BLOOD MOON & RUINED OVERPASS HORIZON (y = 0 .. 66)
// =========================================================================
function drawSkyAndHorizon(ctx, time, reduced, hasBoss) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 68);
  if (hasBoss) {
    skyGrad.addColorStop(0, '#180710');
    skyGrad.addColorStop(0.55, '#421220');
    skyGrad.addColorStop(1, '#782428');
  } else {
    skyGrad.addColorStop(0, '#0a1524');
    skyGrad.addColorStop(0.55, '#193148');
    skyGrad.addColorStop(1, '#315460');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, 68);

  // Soft horizon atmospheric glow
  const glowGrad = ctx.createRadialGradient(W * 0.5, 58, 12, W * 0.5, 58, 210);
  if (hasBoss) {
    glowGrad.addColorStop(0, 'rgba(255, 86, 56, 0.36)');
    glowGrad.addColorStop(1, 'rgba(255, 60, 40, 0)');
  } else {
    glowGrad.addColorStop(0, 'rgba(120, 214, 210, 0.22)');
    glowGrad.addColorStop(1, 'rgba(60, 120, 140, 0)');
  }
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, W, 68);

  // Twinkling stars
  for (let i = 0; i < STARS.length; i++) {
    const [sx, sy, sr, gold] = STARS[i];
    const tw = reduced ? 0.85 : 0.45 + 0.55 * Math.sin(time * 1.8 + i * 1.7);
    ctx.save();
    ctx.globalAlpha = tw * (hasBoss ? 0.55 : 0.9);
    ctx.fillStyle = gold ? '#ffe39a' : '#d8f1ff';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Illustrated Crescent / Blood Moon
  const mx = 296;
  const my = 20;
  const moonGlow = ctx.createRadialGradient(mx, my, 4, mx, my, 32);
  if (hasBoss) {
    moonGlow.addColorStop(0, 'rgba(255, 110, 82, 0.46)');
    moonGlow.addColorStop(1, 'rgba(255, 70, 50, 0)');
  } else {
    moonGlow.addColorStop(0, 'rgba(255, 236, 178, 0.38)');
    moonGlow.addColorStop(1, 'rgba(255, 224, 150, 0)');
  }
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(mx, my, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hasBoss ? '#ff7662' : '#fff0c4';
  ctx.beginPath();
  ctx.arc(mx, my, 9.5, 0.35 * Math.PI, 1.65 * Math.PI, false);
  ctx.quadraticCurveTo(mx - 3.2, my, mx + Math.cos(0.35 * Math.PI) * 9.5, my + Math.sin(0.35 * Math.PI) * 9.5);
  ctx.closePath();
  ctx.fill();

  // Distant Wasteland Mesas & City Ruin Silhouette
  ctx.fillStyle = hasBoss ? '#2c0d16' : '#12222d';
  ctx.beginPath();
  ctx.moveTo(0, 66);
  ctx.lineTo(0, 44);
  ctx.lineTo(24, 34);
  ctx.lineTo(48, 42);
  ctx.lineTo(66, 30);
  ctx.lineTo(84, 30);
  ctx.lineTo(94, 46);
  ctx.lineTo(132, 40);
  ctx.lineTo(154, 46);
  ctx.lineTo(192, 36);
  ctx.lineTo(222, 44);
  ctx.lineTo(254, 32);
  ctx.lineTo(278, 32);
  ctx.lineTo(294, 45);
  ctx.lineTo(324, 35);
  ctx.lineTo(360, 42);
  ctx.lineTo(360, 66);
  ctx.closePath();
  ctx.fill();

  // Subtle rim highlight along mesa ridge
  ctx.strokeStyle = hasBoss ? 'rgba(255, 118, 96, 0.35)' : 'rgba(148, 214, 218, 0.25)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Broken Highway Overpass Entrance Lip (where zombies pour onto the road)
  const lipGrad = ctx.createLinearGradient(0, 50, 0, 68);
  lipGrad.addColorStop(0, hasBoss ? '#4d2228' : '#3d5258');
  lipGrad.addColorStop(0.45, hasBoss ? '#311418' : '#26353a');
  lipGrad.addColorStop(1, '#121a1e');
  ctx.fillStyle = lipGrad;
  ctx.fillRect(0, 52, W, 14);

  // Guardrail posts & top bevel along entry cliff
  ctx.fillStyle = hasBoss ? '#99484e' : '#7ea0a6';
  ctx.fillRect(0, 52, W, 2);
  ctx.strokeStyle = '#0d1418';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 65.5);
  ctx.lineTo(W, 65.5);
  ctx.stroke();
  for (let px = 18; px < W; px += 36) {
    ctx.fillStyle = '#1b262c';
    ctx.fillRect(px, 46, 5, 8);
    ctx.fillStyle = '#8fa9b0';
    ctx.fillRect(px + 1, 46, 3, 2);
  }

  // Drifting stylized atmospheric mist wisps
  ctx.save();
  ctx.globalAlpha = hasBoss ? 0.16 : 0.12;
  ctx.fillStyle = hasBoss ? '#ff8b78' : '#d2f0f5';
  const drift = reduced ? 0 : (time * 9) % (W + 80);
  for (let i = 0; i < 4; i++) {
    const mxp = ((i * 105 + drift) % (W + 80)) - 40;
    const myp = 20 + (i % 2) * 14;
    ctx.beginPath();
    ctx.ellipse(mxp, myp, 26, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// WASTELAND HIGHWAY BATTLEFIELD (y = 66 .. 496)
// =========================================================================
function drawHighwayField(ctx, time, reduced, hasBoss) {
  const fieldTop = 65;
  const fieldBot = FENCE_Y - 12; // 500
  const fieldH = fieldBot - fieldTop;

  // Desert sandy-slate rocky shoulders (x = 0..28 and x = 332..360)
  const shoulderGrad = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
  shoulderGrad.addColorStop(0, hasBoss ? '#312122' : '#2a3330');
  shoulderGrad.addColorStop(0.55, hasBoss ? '#3a2624' : '#323c36');
  shoulderGrad.addColorStop(1, hasBoss ? '#2c1c1a' : '#252e2a');
  ctx.fillStyle = shoulderGrad;
  ctx.fillRect(0, fieldTop, W, fieldH);

  // Main Cracked Asphalt Wasteland Highway (x = 26..334)
  const roadLeft = 26;
  const roadW = W - roadLeft * 2;
  const roadGrad = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
  roadGrad.addColorStop(0, hasBoss ? '#2c2228' : '#28363c');
  roadGrad.addColorStop(0.45, hasBoss ? '#34272d' : '#314248');
  roadGrad.addColorStop(0.88, hasBoss ? '#2e2226' : '#2b3a40');
  roadGrad.addColorStop(1, '#1e282d');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(roadLeft, fieldTop, roadW, fieldH);

  // Subtle center lighting crown on asphalt for depth
  const crownGrad = ctx.createLinearGradient(roadLeft, 0, roadLeft + roadW, 0);
  crownGrad.addColorStop(0, 'rgba(8, 14, 18, 0.34)');
  crownGrad.addColorStop(0.22, 'rgba(130, 175, 185, 0.06)');
  crownGrad.addColorStop(0.5, 'rgba(170, 215, 222, 0.11)');
  crownGrad.addColorStop(0.78, 'rgba(130, 175, 185, 0.06)');
  crownGrad.addColorStop(1, 'rgba(8, 14, 18, 0.34)');
  ctx.fillStyle = crownGrad;
  ctx.fillRect(roadLeft, fieldTop, roadW, fieldH);

  // Concrete road curbs with clean cartoon ink borders
  for (const cx of [roadLeft - 5, roadLeft + roadW - 1]) {
    ctx.fillStyle = '#536468';
    ctx.fillRect(cx, fieldTop, 6, fieldH);
    ctx.fillStyle = '#7b8f94';
    ctx.fillRect(cx + 1, fieldTop, 2, fieldH);
    ctx.strokeStyle = '#121a1e';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx, fieldTop, 6, fieldH);
    // Curb expansion joints
    ctx.fillStyle = '#1b262b';
    for (let jy = fieldTop + 26; jy < fieldBot - 10; jy += 44) {
      ctx.fillRect(cx, jy, 6, 2);
    }
  }

  // Faded painted amber highway edge lines & center dashed road stripe
  ctx.save();
  ctx.fillStyle = hasBoss ? 'rgba(235, 142, 92, 0.24)' : 'rgba(232, 194, 108, 0.22)';
  ctx.fillRect(roadLeft + 10, fieldTop + 4, 3, fieldH - 12);
  ctx.fillRect(roadLeft + roadW - 13, fieldTop + 4, 3, fieldH - 12);

  // Center dashed highway stripe
  ctx.fillStyle = hasBoss ? 'rgba(248, 168, 96, 0.26)' : 'rgba(242, 206, 114, 0.24)';
  for (let dy = fieldTop + 18; dy < fieldBot - 36; dy += 44) {
    rRect(ctx, W / 2 - 2.5, dy, 5, 22, 2);
    ctx.fill();
  }
  ctx.restore();

  // Tire skid marks
  ctx.save();
  ctx.strokeStyle = 'rgba(14, 20, 24, 0.26)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of SKID_MARKS) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle scorch patches & asphalt cracks
  for (const [sx, sy, rx, ry] of SCORCH_MARKS) {
    const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, rx);
    sg.addColorStop(0, 'rgba(14, 16, 18, 0.34)');
    sg.addColorStop(1, 'rgba(14, 16, 18, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(15, 22, 26, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const poly of CRACKS) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.stroke();
  }
  ctx.restore();

  // Pebbles along highway edges
  for (const [px, py, rx, ry] of PEBBLES) {
    ctx.fillStyle = '#182226';
    ctx.beginPath();
    ctx.ellipse(px, py + 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a6c70';
    ctx.beginPath();
    ctx.ellipse(px, py, rx * 0.85, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Animated wasteland grass tufts along outer shoulders
  for (let i = 0; i < SCRUBS.length; i++) {
    const [gx, gy, sc] = SCRUBS[i];
    const sway = reduced ? 0 : Math.sin(time * 2.1 + i * 1.4) * 2.0;
    ctx.save();
    ctx.strokeStyle = '#131d19';
    ctx.lineWidth = 3.2 * sc;
    ctx.lineCap = 'round';
    for (const [dx, h] of [[-4, 8], [0, 11], [4, 7]]) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + dx * 0.6 + sway * 0.5, gy - h * 0.55, gx + dx + sway, gy - h * sc);
      ctx.stroke();
    }
    ctx.strokeStyle = '#538a5e';
    ctx.lineWidth = 1.8 * sc;
    for (const [dx, h] of [[-4, 8], [0, 11], [4, 7]]) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + dx * 0.6 + sway * 0.5, gy - h * 0.55, gx + dx + sway, gy - h * sc);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Painted yellow kill-zone hazard line just ahead of the steel wall
  const dangerY = FENCE_Y - 22;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#f8d260';
  for (let hx = 34; hx < W - 38; hx += 22) {
    ctx.beginPath();
    ctx.moveTo(hx, dangerY);
    ctx.lineTo(hx + 11, dangerY);
    ctx.lineTo(hx + 7, dangerY + 5);
    ctx.lineTo(hx - 4, dangerY + 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Warm twin floodlight beams illuminating the wall kill-zone (smoothly feathered to 0)
  const sweep = reduced ? 0 : Math.sin(time * 0.9) * 14;
  const beamTopY = FENCE_Y - 225;
  for (const [lx, dir] of [[86, -1], [274, 1]]) {
    const beamGrad = ctx.createLinearGradient(lx, FENCE_Y - 12, lx, beamTopY);
    beamGrad.addColorStop(0, hasBoss ? 'rgba(255, 204, 134, 0.24)' : 'rgba(255, 236, 168, 0.20)');
    beamGrad.addColorStop(0.45, hasBoss ? 'rgba(255, 166, 106, 0.09)' : 'rgba(250, 228, 152, 0.08)');
    beamGrad.addColorStop(0.85, 'rgba(255, 224, 148, 0.015)');
    beamGrad.addColorStop(1, 'rgba(255, 224, 148, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(lx - 9, FENCE_Y - 12);
    ctx.lineTo(lx + 9, FENCE_Y - 12);
    ctx.lineTo(lx + 76 + sweep * dir, beamTopY);
    ctx.lineTo(lx - 76 + sweep * dir, beamTopY);
    ctx.closePath();
    ctx.fill();
  }

  // Boss wave subtle crimson atmosphere wash across road
  if (hasBoss) {
    const pulse = reduced ? 0.14 : 0.11 + 0.05 * Math.sin(time * 2.2);
    const wash = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
    wash.addColorStop(0, `rgba(210, 44, 58, ${pulse})`);
    wash.addColorStop(1, 'rgba(180, 32, 42, 0.03)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, fieldTop, W, fieldH);
  }
}

// =========================================================================
// ILLUSTRATED ARMORED STEEL FORTRESS WALL (y = 492 .. 536)
// =========================================================================
function drawFortressWall(ctx, ratio, time, reduced) {
  const wallTop = FENCE_Y - 18; // 494
  const wallH = 38;
  const damaged = ratio <= 0.65;
  const critical = ratio <= 0.35;

  // Ground drop shadow under wall front
  const shGrad = ctx.createLinearGradient(0, wallTop - 10, 0, wallTop + 2);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
  ctx.fillStyle = shGrad;
  ctx.fillRect(0, wallTop - 10, W, 12);

  // Main beveled steel wall body
  const bodyGrad = ctx.createLinearGradient(0, wallTop, 0, wallTop + wallH);
  if (critical) {
    bodyGrad.addColorStop(0, '#967c76');
    bodyGrad.addColorStop(0.24, '#6a524d');
    bodyGrad.addColorStop(0.76, '#483532');
    bodyGrad.addColorStop(1, '#261a18');
  } else if (damaged) {
    bodyGrad.addColorStop(0, '#b8c4cc');
    bodyGrad.addColorStop(0.24, '#7d8e98');
    bodyGrad.addColorStop(0.76, '#4f5e68');
    bodyGrad.addColorStop(1, '#28323a');
  } else {
    bodyGrad.addColorStop(0, '#dce8f0');
    bodyGrad.addColorStop(0.22, '#9ab0be');
    bodyGrad.addColorStop(0.75, '#5b707e');
    bodyGrad.addColorStop(1, '#2d3b45');
  }

  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, wallTop, W, wallH);

  // Razor-wire defensive coils along top parapet
  ctx.save();
  ctx.strokeStyle = critical ? '#5a443e' : '#32424c';
  ctx.lineWidth = 1.8;
  for (let wx = 8; wx < W - 4; wx += 14) {
    ctx.beginPath();
    ctx.ellipse(wx, wallTop - 1, 7, 4.2, -0.25, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = critical ? '#a68b80' : '#d2e2ec';
  ctx.lineWidth = 0.9;
  for (let wx = 8; wx < W - 4; wx += 14) {
    ctx.beginPath();
    ctx.ellipse(wx, wallTop - 1.5, 6.2, 3.6, -0.25, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();

  // Bright beveled top armor lip
  ctx.fillStyle = critical ? '#c49d90' : '#eef7fc';
  ctx.fillRect(0, wallTop, W, 3.2);
  ctx.fillStyle = '#12191e';
  ctx.fillRect(0, wallTop + 3.2, W, 1.5);

  // Armor panel vertical seams & steel rivets
  const panelW = 36;
  for (let px = 0; px < W; px += panelW) {
    ctx.fillStyle = '#172128';
    ctx.fillRect(px, wallTop + 4, 2, wallH - 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.fillRect(px + 2, wallTop + 5, 1.2, wallH - 8);
    // Corner rivets
    for (const [rx, ry] of [[px + 6, wallTop + 9], [px + panelW - 6, wallTop + 9], [px + 6, wallTop + 21], [px + panelW - 6, wallTop + 21]]) {
      ctx.fillStyle = '#19232a';
      ctx.beginPath();
      ctx.arc(rx, ry + 0.7, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = critical ? '#a88c82' : '#d8e6ee';
      ctx.beginPath();
      ctx.arc(rx, ry, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Caution Yellow-Black Diagonal Hazard Band along lower steel girder
  const bandY = wallTop + 25;
  const bandH = 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, W, bandH);
  ctx.clip();
  ctx.fillStyle = '#1b2226';
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = critical ? '#d96b38' : damaged ? '#d8a63c' : '#f4c84c';
  for (let sx = -10; sx < W + 16; sx += 18) {
    ctx.beginPath();
    ctx.moveTo(sx, bandY + bandH);
    ctx.lineTo(sx + 8, bandY + bandH);
    ctx.lineTo(sx + 14, bandY);
    ctx.lineTo(sx + 6, bandY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#10161c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, bandY);
  ctx.lineTo(W, bandY);
  ctx.moveTo(0, bandY + bandH);
  ctx.lineTo(W, bandY + bandH);
  ctx.stroke();

  // Heavy Reinforced Steel Buttress Pylons + Floodlight Turret Lamps
  const pylons = [14, 86, 274, 346];
  for (const cx of pylons) {
    const pw = 18;
    const ph = 42;
    const px = cx - pw / 2;
    const py = wallTop - 4;
    const pg = ctx.createLinearGradient(px, py, px + pw, py);
    pg.addColorStop(0, '#3e4f5a');
    pg.addColorStop(0.45, '#9ab0be');
    pg.addColorStop(1, '#2b3740');
    rRect(ctx, px, py, pw, ph, 4);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = '#10161c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Lamp / warning beacon on inner pylons (86 & 274)
    if (cx === 86 || cx === 274) {
      const blink = critical ? (0.45 + 0.55 * Math.sin(time * 9)) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.fillStyle = critical ? '#ff4a32' : '#ffe896';
      ctx.beginPath();
      ctx.arc(cx, py + 9, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#141c22';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Progressive Damage: Jagged Vector Cracks, Scorch & Glowing Embers
  if (damaged) {
    const cracks = [
      [[52, wallTop + 4], [58, wallTop + 14], [53, wallTop + 23]],
      [[148, wallTop + 3], [142, wallTop + 13], [150, wallTop + 24]],
      [[216, wallTop + 5], [224, wallTop + 15], [218, wallTop + 25]],
      [[308, wallTop + 4], [302, wallTop + 16], [310, wallTop + 24]],
    ];
    const shown = critical ? cracks.length : 2;
    ctx.save();
    ctx.strokeStyle = '#100c0b';
    ctx.lineWidth = critical ? 2.4 : 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < shown; i++) {
      const pts = cracks[i];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke();
      if (critical) {
        ctx.strokeStyle = '#ff6a28';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.strokeStyle = '#100c0b';
        ctx.lineWidth = 2.4;
      }
    }
    ctx.restore();
  }

  // Critical smoking wisps
  if (critical && !reduced) {
    for (let i = 0; i < 3; i++) {
      const sx = 64 + i * 116;
      const cycle = (time * 0.9 + i * 0.37) % 1;
      const sy = wallTop + 8 - cycle * 24;
      ctx.save();
      ctx.globalAlpha = (1 - cycle) * 0.36;
      ctx.fillStyle = '#201818';
      ctx.beginPath();
      ctx.arc(sx + Math.sin(time * 3 + i) * 4, sy, 4 + cycle * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Clean dark ink bottom outline of the steel wall
  ctx.strokeStyle = '#0e1419';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, wallTop + wallH);
  ctx.lineTo(W, wallTop + wallH);
  ctx.stroke();
}

// =========================================================================
// GLOWING ENERGY WALL SHIELD (AEGIS IMMUNITY)
// =========================================================================
function drawWallShield(ctx, count, time, reduced) {
  if (!(count > 0)) return;
  const pulse = reduced ? 0.85 : 0.72 + 0.28 * Math.sin(time * 4.2);
  const y = FENCE_Y - 22;

  ctx.save();
  // Translucent curved plasma barrier band
  const shieldGrad = ctx.createLinearGradient(0, y - 10, 0, y + 8);
  shieldGrad.addColorStop(0, 'rgba(72, 224, 255, 0)');
  shieldGrad.addColorStop(0.5, `rgba(92, 232, 255, ${0.26 * pulse})`);
  shieldGrad.addColorStop(1, 'rgba(42, 168, 220, 0.06)');
  ctx.fillStyle = shieldGrad;
  ctx.fillRect(0, y - 10, W, 18);

  // Crisp glowing energy ridge arc
  ctx.strokeStyle = `rgba(154, 246, 255, ${0.85 * pulse})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(6, y + 3);
  ctx.quadraticCurveTo(W / 2, y - 8, W - 6, y + 3);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * pulse})`;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(16, y + 1);
  ctx.quadraticCurveTo(W / 2, y - 7, W - 16, y + 1);
  ctx.stroke();

  // Shield Charge Pips centered above wall
  const shown = Math.min(8, Math.floor(count));
  const spacing = 12;
  const startX = W / 2 - ((shown - 1) * spacing) / 2;
  for (let i = 0; i < shown; i++) {
    const px = startX + i * spacing;
    const py = y - 6;
    ctx.fillStyle = '#0e2c3a';
    ctx.beginPath();
    ctx.moveTo(px, py - 5);
    ctx.lineTo(px + 4.5, py - 2);
    ctx.lineTo(px + 3.5, py + 3);
    ctx.lineTo(px, py + 5.5);
    ctx.lineTo(px - 3.5, py + 3);
    ctx.lineTo(px - 4.5, py - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8ef4ff';
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// CENTRAL COMMANDER BASTION DECK (y = 532 .. 640) — ZERO 2×5 GRID!
// =========================================================================
function drawCommanderDeck(ctx, state, time, reduced) {
  const deckTop = FENCE_Y + 20; // 532
  const deckH = H - deckTop;

  // Heavy fortified steel-concrete bastion deck floor
  const deckGrad = ctx.createLinearGradient(0, deckTop, 0, H);
  deckGrad.addColorStop(0, '#222d34');
  deckGrad.addColorStop(0.42, '#1a242b');
  deckGrad.addColorStop(1, '#10181d');
  ctx.fillStyle = deckGrad;
  ctx.fillRect(0, deckTop, W, deckH);

  // Subtle metallic decking seams
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 174, 190, 0.08)';
  ctx.lineWidth = 1;
  for (let y = deckTop + 18; y < H; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let x = 45; x < W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, deckTop);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  // Power conduits running from Center Platform to Flanking Auto-Skill Pods
  const cx = W / 2; // 180
  const cy = ARENA.frontY + 4; // 564
  const upg = heroUpgrades(state);
  const hasFire = (upg.napalm || 0) > 0 || (upg.shrapnel || 0) > 0;
  const hasFrost = (upg.cryo_barrage || 0) > 0 || (upg.frostbite || 0) > 0;
  const hasTech = (upg.orbital_beam || 0) > 0 || (upg.ricochet || 0) > 0;
  const hasCar = (upg.armored_car || 0) > 0;

  ctx.save();
  ctx.strokeStyle = '#10171d';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(74, 574);
  ctx.lineTo(cx, cy + 4);
  ctx.lineTo(286, 574);
  ctx.stroke();

  ctx.strokeStyle = '#334652';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Animated energy pulses along conduits when Auto Skills are unlocked
  if (hasFire || hasFrost || hasTech || hasCar) {
    const glow = reduced ? 0.7 : 0.45 + 0.45 * Math.sin(time * 4.5);
    ctx.strokeStyle = hasTech ? `rgba(100, 240, 255, ${glow})` : hasFire ? `rgba(255, 140, 56, ${glow})` : `rgba(246, 206, 100, ${glow})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();

  // Decorative Flanking Auto-Skill Support Pods (Left & Right of Hero)
  for (const [px, accent, lit] of [
    [74, hasFire ? '#ff7c32' : '#f0c454', hasFire || hasCar],
    [286, hasFrost ? '#78ecff' : '#64e2ff', hasFrost || hasTech]
  ]) {
    const py = 574;
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + 7, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hexagonal steel launcher pad
    const padGrad = ctx.createLinearGradient(px - 18, py - 10, px + 18, py + 10);
    padGrad.addColorStop(0, '#506470');
    padGrad.addColorStop(1, '#26333c');
    rRect(ctx, px - 18, py - 10, 36, 20, 7);
    ctx.fillStyle = padGrad;
    ctx.fill();
    ctx.strokeStyle = '#0f161c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing core LED
    const pulse = reduced ? 0.85 : 0.55 + 0.45 * Math.sin(time * 3.8 + px);
    ctx.fillStyle = lit ? accent : '#394b56';
    ctx.save();
    ctx.globalAlpha = lit ? pulse : 0.65;
    ctx.beginPath();
    ctx.arc(px, py, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#12191e';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Ammo Crates tucked cleanly on outer deck flanks
  for (const [bx, by] of [[18, 564], [316, 564]]) {
    rRect(ctx, bx, by, 26, 16, 3);
    ctx.fillStyle = '#485a46';
    ctx.fill();
    ctx.strokeStyle = '#111815';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#6c8468';
    ctx.fillRect(bx + 2, by + 2, 22, 4);
    ctx.fillStyle = '#e8c45e';
    ctx.fillRect(bx + 10, by + 7, 6, 3);
  }

  // HEROIC CENTRAL COMMANDER GUNNERY PLATFORM (Anchors fixed center Wall Gunner!)
  const platRx = 46;
  const platRy = 22;

  // Soft golden ambient halo
  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 56);
  halo.addColorStop(0, 'rgba(246, 204, 96, 0.22)');
  halo.addColorStop(1, 'rgba(246, 204, 96, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 58, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer beveled steel base ellipse
  ctx.fillStyle = '#10171d';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, platRx + 2, platRy + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const outerGrad = ctx.createLinearGradient(cx, cy - platRy, cx, cy + platRy);
  outerGrad.addColorStop(0, '#6a808e');
  outerGrad.addColorStop(0.5, '#3b4c57');
  outerGrad.addColorStop(1, '#212c34');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx, platRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0e1419';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Inner dark recessed steel deck with pulsing gold tactical ring
  ctx.fillStyle = '#1b262e';
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx - 8, platRy - 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const ringAlpha = reduced ? 0.78 : 0.58 + 0.34 * Math.sin(time * 2.8);
  ctx.save();
  ctx.strokeStyle = `rgba(248, 206, 94, ${ringAlpha})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx - 7, platRy - 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Four directional brass chevron ticks around the central platform
  ctx.fillStyle = '#f2c864';
  for (const [tx, ty] of [[cx, cy - platRy + 2], [cx, cy + platRy - 2], [cx - platRx + 5, cy], [cx + platRx - 5, cy]]) {
    ctx.beginPath();
    ctx.arc(tx, ty, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// =========================================================================
// MINIMAL-CTX FALLBACK (for unit tests with fillRect-only stubs)
// =========================================================================
function drawMinimalFallback(ctx, ratio) {
  ctx.fillStyle = '#1a2c38';
  ctx.fillRect(0, 0, W, 65);
  ctx.fillStyle = '#2a3940';
  ctx.fillRect(0, 65, W, FENCE_Y - 75);
  ctx.fillStyle = ratio > 0.35 ? '#8ca0ae' : '#6c4d48';
  ctx.fillRect(0, FENCE_Y - 12, W, 28);
  ctx.fillStyle = '#1b262e';
  ctx.fillRect(0, FENCE_Y + 16, W, H - (FENCE_Y + 16));
}

function drawWorld(ctx, state, options) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const opts = options || {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const reduced = Boolean(opts.reducedMotion || opts.settings?.reducedMotion);
  const ratio = fenceRatio(state);
  const hasBoss = directorHasBoss(state);
  const wallImmunity = Number.isFinite(state?.wallImmunity) ? Math.max(0, Math.floor(state.wallImmunity)) : 0;

  if (!isRichCtx(ctx)) {
    drawMinimalFallback(ctx, ratio);
    return;
  }

  ctx.save();
  try {
    drawSkyAndHorizon(ctx, time, reduced, hasBoss);
    drawHighwayField(ctx, time, reduced, hasBoss);
    drawFortressWall(ctx, ratio, time, reduced);
    drawWallShield(ctx, wallImmunity, time, reduced);
    drawCommanderDeck(ctx, state, time, reduced);
  } finally {
    ctx.restore();
  }
}

/** Crisp vector icon drawer (kept exported for compatibility). */
function drawIcon(ctx, id, x, y, size = 16) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const s = Math.max(8, Number.isFinite(size) ? size : 16);
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.38;
  const key = String(id || '').toLowerCase();

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(x + 2, y + 2, Math.max(2, s - 4), Math.max(2, s - 4));
    return;
  }

  ctx.save();
  try {
    rRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.22);
    ctx.fillStyle = '#132028';
    ctx.fill();
    ctx.strokeStyle = '#486772';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const color = key.includes('fire') || key.includes('napalm') || key.includes('burn') ? '#ff6c30'
      : key.includes('frost') || key.includes('cryo') || key.includes('slow') ? '#7ce8ff'
      : key.includes('light') || key.includes('ricochet') || key.includes('stun') ? '#ffe14a'
      : key.includes('poison') ? '#7dce6a'
      : key.includes('orbital') || key.includes('beam') ? '#54f0ff'
      : '#f0cb72';

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } finally {
    ctx.restore();
  }
}

};
__ff_factories["src/shared.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["random"] = random;
__ff_exports["uid"] = uid;
__ff_exports["emit"] = emit;
__ff_exports["slotGeometry"] = slotGeometry;
__ff_exports["hitSlot"] = hitSlot;
__ff_exports["unitPosition"] = unitPosition;
__ff_exports["canPlan"] = canPlan;
__ff_exports["createUnit"] = createUnit;
const CONTRACT_VERSION = 3;
__ff_exports["CONTRACT_VERSION"] = CONTRACT_VERSION;

const STEP = 1 / 60;
__ff_exports["STEP"] = STEP;

const ARENA = Object.freeze({
  width: 360,
  height: 640,
  spawnY: -16,
  enemyMinX: 14,
  enemyMaxX: 346,
  fenceY: 512,
  rows: 2,
  cols: 5,
  slotWidth: 48,
  slotHeight: 48,
  pitch: 48,
  sideMargin: 60,
  frontY: 560,
  backY: 612
});
__ff_exports["ARENA"] = ARENA;

function freezeDifficulty(row) { Object.freeze(row.name); return Object.freeze(row); }
const DIFFICULTIES = Object.freeze({
  easy: freezeDifficulty({name: {en: 'Easy', zh: '轻松'}, health: 0.8, speed: 0.9, damage: 0.75, count: 0.9, reward: 1, fence: 650}),
  normal: freezeDifficulty({name: {en: 'Normal', zh: '标准'}, health: 1, speed: 1, damage: 1, count: 1, reward: 1.4, fence: 600}),
  hard: freezeDifficulty({name: {en: 'Hard', zh: '困难'}, health: 1.3, speed: 1.08, damage: 1.25, count: 1.1, reward: 1.9, fence: 570}),
  nightmare: freezeDifficulty({name: {en: 'Nightmare', zh: '噩梦'}, health: 1.65, speed: 1.15, damage: 1.5, count: 1.2, reward: 2.5, fence: 540})
});
__ff_exports["DIFFICULTIES"] = DIFFICULTIES;

const BASE_TYPES = Object.freeze(['bolt', 'fire', 'frost', 'lightning', 'poison', 'support']);
__ff_exports["BASE_TYPES"] = BASE_TYPES;

const AUTO_DEPLOY_ORDER = Object.freeze([1, 3, 0, 4, 7, 6, 8, 5, 9, 2]);
__ff_exports["AUTO_DEPLOY_ORDER"] = AUTO_DEPLOY_ORDER;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
__ff_exports["clamp"] = clamp;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
__ff_exports["distance"] = distance;

const clone = (value) => JSON.parse(JSON.stringify(value));
__ff_exports["clone"] = clone;

function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function uid(state, prefix = 'e') { return `${prefix}${state.nextId++}`; }
function emit(state, type, data = {}) {
  if (!Array.isArray(state.events)) state.events = [];
  const event = {...data, type, time: state.time};
  state.events.push(event);
  if (state.events.length > 400) {
    const kept = state.events.slice(-399);
    const prior = state.events.find((item) => item && (item.type === 'victory' || item.type === 'defeat' || item.type === 'draft'));
    if (prior && prior !== event && !kept.includes(prior)) kept.unshift(prior);
    state.events = kept;
  }
}
function slotGeometry(index) {
  const col = index % ARENA.cols;
  const row = Math.floor(index / ARENA.cols);
  const x = ARENA.sideMargin + ARENA.slotWidth / 2 + ARENA.pitch * col;
  const y = row ? ARENA.backY : ARENA.frontY;
  return {
    index,
    row,
    col,
    x,
    y,
    left: x - ARENA.slotWidth / 2,
    top: y - ARENA.slotHeight / 2,
    width: ARENA.slotWidth,
    height: ARENA.slotHeight
  };
}
function hitSlot(x, y) {
  const count = ARENA.rows * ARENA.cols;
  for (let i = 0; i < count; i++) {
    const s = slotGeometry(i);
    if (x >= s.left && x < s.left + s.width && y >= s.top && y < s.top + s.height) return i;
  }
  return -1;
}
function unitPosition(state, id) {
  const slot = state.slots.find((s) => s.unit?.id === id);
  return slot ? {x: slot.x, y: slot.y} : null;
}
function canPlan(state) {
  if (!state || state.phase === 'victory' || state.phase === 'defeat') return false;
  if (state.phase === 'draft' || state.paused === true) return true;
  return state.phase === 'playing' && state.hiddenPaused !== true;
}
const TARGET_MODES = Object.freeze(['foremost', 'priority', 'strongest', 'weakest']);
__ff_exports["TARGET_MODES"] = TARGET_MODES;

const defaultModes = {lightning: 'priority', support: 'priority', poison: 'strongest'};
function createUnit(state, type = 'bolt', rank = 1, kind = type === 'hero' ? 'hero' : 'tower') {
  return {
    id: uid(state, 'u'),
    kind,
    type,
    rank,
    upgrades: {},
    cooldown: 0,
    kills: 0,
    targeting: defaultModes[type] || 'foremost'
  };
}

};
__ff_factories["src/state.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["createProfile"] = createProfile;
__ff_exports["createRun"] = createRun;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/expeditions.js");
const CONTRACT_VERSION = __ff_m0["CONTRACT_VERSION"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clone = __ff_m0["clone"];
const slotGeometry = __ff_m0["slotGeometry"];
const createUnit = __ff_m0["createUnit"];
const isExpedition = __ff_m1["isExpedition"];



function createProfile(language = 'en') {
  return {
    version: CONTRACT_VERSION,
    currency: 0,
    equipmentOwned: [],
    equipped: {weapon: null, charm: null, armor: null},
    permanent: {damage: 0, haste: 0, vitality: 0, economy: 0},
    settledRuns: [],
    best: {},
    settings: {language: language === 'zh' ? 'zh' : 'en', sound: true, reducedMotion: false, difficulty: 'normal'}
  };
}

function createRun({seed = 123456, difficulty = 'normal', profile = createProfile(), runId, expedition} = {}) {
  if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
  const id = runId || `run-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const hp = DIFFICULTIES[difficulty].fence;
  const state = {
    version: CONTRACT_VERSION,
    runId: id,
    seed: seed >>> 0,
    rng: seed >>> 0,
    nextId: 1,
    time: 0,
    tick: 0,
    accumulator: 0,
    phase: 'playing',
    paused: false,
    hiddenPaused: false,
    speed: 1,
    difficulty,
    expedition: isExpedition(expedition) ? expedition : 'watch',
    wave: 0,
    waveTime: 0,
    director: {nextWave: 0, queue: [], done: false},
    kills: 0,
    xp: 0,
    nextDraftXp: 6,
    draftLevel: 0,
    fence: {hp, maxHp: hp},
    slots: Array.from({length: 10}, (_, i) => ({...slotGeometry(i), unit: null})),
    enemies: [],
    projectiles: [],
    clouds: [],
    events: [],
    draft: null,
    profileSnapshot: clone(profile),
    settlement: null,
    stats: {damage: 0, fenceDamage: 0, crits: 0},
    initialized: false,
    endless: false,
    systems: {},
    rerollsLeft: 2,
    draftRerollsUsed: 0,
    surge: {charges: 1, maxCharges: 1, shieldTimer: 0, cooldown: 0, thresholdsUsed: []},
    wallImmunity: 0,
    openingDraftPending: 0,
    arsenal: {
      timers: {napalm: 1.6, armored_car: 2.4, cryo_barrage: 2.0, orbital_beam: 2.6, ricochet: 2.2},
      sweepers: [],
      beams: []
    }
  };
  state.slots[2].unit = createUnit(state, 'hero');
  return state;
}

};
__ff_factories["src/storage.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["loadProfile"] = loadProfile;
__ff_exports["saveProfile"] = saveProfile;
__ff_exports["legacyRunNotice"] = legacyRunNotice;
__ff_exports["loadRun"] = loadRun;
__ff_exports["saveRun"] = saveRun;
__ff_exports["clearRun"] = clearRun;
__ff_exports["exportSave"] = exportSave;
__ff_exports["importSave"] = importSave;
const __ff_m0 = __ff_load("src/shared.js");
const CONTRACT_VERSION = __ff_m0["CONTRACT_VERSION"];
const BASE_TYPES = __ff_m0["BASE_TYPES"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const ARENA = __ff_m0["ARENA"];
const TARGET_MODES = __ff_m0["TARGET_MODES"];
const slotGeometry = __ff_m0["slotGeometry"];
/**
 * Fencefall persistence. Profile and run are stored separately from UI/session state.
 *
 * Keys (app-specific): PROFILE_KEY, RUN_KEY.
 * Export wrapper: {format: SAVE_FORMAT, version, profile, run|null}.
 *
 * Boot:
 *   const profile = loadProfile() ?? createProfile(language);
 *   const run = loadRun(); // null when there is nothing safe to resume
 * loadProfile/loadRun return null for a missing, corrupt, oversized, or unreadable
 * save. They never throw and never write. A missing profile is not defaulted to
 * English here — the caller picks the locale.
 *
 * saveRun/loadRun/export/import persist a paused snapshot: paused true, hiddenPaused
 * false, events [], accumulator 0. The live object is not mutated. Slot rectangles
 * are rewritten from slotGeometry(index); the unit in that slot is kept. RNG, seed,
 * nextId, statuses, director, settlement, and plain JSON domain fields (including
 * state.systems) are kept. nextId is raised only when a living entity id would
 * otherwise collide with a future uid().
 *
 * Settlement order so a reload cannot pay twice:
 *   1. Set state.settlement once and do not change it afterward.
 *   2. If profile.settledRuns lacks state.runId, append it and add currency.
 *   3. saveProfile(profile) first, then saveRun(state).
 * A crash after 3 reloads the paid profile with the previous run. settleRun must
 * no-op when settledRuns already contains runId OR state.settlement is already set.
 * This module never grants currency and never drops a settlement or settled run id.
 * importSave validates the whole file, then writes profile and run together and
 * restores both previous values if either write fails. An invalid import does not
 * replace a valid save. A null run in an otherwise valid file clears the run key.
 *
 * Phase invariants: draft has three options and no pending unit; placing has both;
 * playing, victory, and defeat have neither. Exactly one hero (type hero, rank 1).
 * Storage sanity ceilings are higher than gameplay caps: permanent levels <= 1000,
 * currency <= 1e9, import text <= 1_500_000 characters.
 */


const PROFILE_KEY = 'fencefall.v1.profile';
__ff_exports["PROFILE_KEY"] = PROFILE_KEY;

const RUN_KEY = 'fencefall.v1.run';
__ff_exports["RUN_KEY"] = RUN_KEY;

const SAVE_FORMAT = 'fencefall-save';
__ff_exports["SAVE_FORMAT"] = SAVE_FORMAT;


const MAX_IMPORT_CHARS = 1_500_000;
const MAX_DEPTH = 10;
const MAX_OBJECT_KEYS = 200;
const MAX_ARRAY = 4000;
const MAX_STRING = 4000;
const MAX_ABS_NUMBER = 1e12;
const MAX_ENEMIES = 800;
const MAX_PROJECTILES = 1000;
const MAX_CLOUDS = 24;
const MAX_QUEUE = 4000;
const MAX_STATUSES = 16;
const MAX_TAGS = 16;
const MAX_VISITED = 64;
const MAX_UPGRADES = 32;
const MAX_SETTLED = 2000;
const MAX_EQUIPMENT = 128;
const MAX_PERMANENT = 1000;
const MAX_CURRENCY = 1e9;
const MAX_TIME = 1e7;
const MAX_TICK = 1e9;
const MAX_NEXT_ID = 1e9;
const MAX_WAVE = 100000;
const MAX_FENCE = 1e6;
const MAX_STAT = 1e12;
const MAX_HP = 1e9;
const MAX_UNIT_KILLS = 1e7;
const UINT32 = 4294967295;

const BASE_TYPE_SET = new Set(BASE_TYPES);
const ENEMY_KINDS = new Set(['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss', 'leaper', 'splitter', 'mender', 'shade', 'banner', 'warden', 'charge', 'hush']);
const STATUS_TYPES = new Set(['burn', 'poison', 'slow', 'stun', 'brittle']);
const PHASES = new Set(['playing', 'draft', 'victory', 'defeat']);
const RESULTS = new Set(['victory', 'defeat', 'abandon']);
const EQUIPPED_SLOTS = ['weapon', 'charm', 'armor'];
const PERMANENT_KEYS = ['damage', 'haste', 'vitality', 'economy'];
const ID_RE = /^[A-Za-z0-9._:-]+$/;
const UID_RE = /^[A-Za-z]{1,8}(\d+)$/;

const PROFILE_KEYS = new Set(['version', 'currency', 'equipmentOwned', 'equipped', 'permanent', 'settledRuns', 'best', 'settings']);
const SETTINGS_KEYS = new Set(['language', 'sound', 'reducedMotion', 'difficulty']);
const RUN_KEYS = new Set([
  'version', 'runId', 'seed', 'rng', 'nextId', 'time', 'tick', 'accumulator', 'phase', 'paused', 'hiddenPaused',
  'speed', 'difficulty', 'wave', 'waveTime', 'director', 'kills', 'xp', 'nextDraftXp', 'draftLevel', 'fence',
  'slots', 'enemies', 'projectiles', 'clouds', 'events', 'draft', 'profileSnapshot', 'settlement',
  'stats', 'initialized', 'endless', 'systems', 'expedition', 'rerollsLeft', 'draftRerollsUsed', 'surge'
]);
const DIRECTOR_KEYS = new Set(['nextWave', 'queue', 'done']);
const FENCE_KEYS = new Set(['hp', 'maxHp']);
const STAT_KEYS = new Set(['damage', 'fenceDamage', 'crits']);
const UNIT_KEYS = new Set(['id', 'kind', 'type', 'rank', 'upgrades', 'cooldown', 'kills', 'targeting']);
const ENEMY_KEYS = new Set([
  'id', 'kind', 'x', 'y', 'hp', 'maxHp', 'speed', 'radius', 'damage', 'attackInterval', 'attackCooldown',
  'xp', 'armor', 'driftPhase', 'driftVelocity', 'statuses', 'attacking', 'dead'
]);
const STATUS_KEYS = new Set(['type', 'power', 'remaining', 'sourceId', 'stacks', 'tickTimer']);
const PROJECTILE_KEYS = new Set([
  'id', 'sourceId', 'targetId', 'x', 'y', 'speed', 'damage', 'crit', 'tags', 'splash', 'chain', 'chainRange',
  'pierce', 'visited', 'life'
]);
const OPTION_KEYS = new Set(['id', 'kind', 'type', 'upgradeId', 'action', 'rank', 'nextRank', 'cap', 'nextLevel', 'superweapon']);
const DRAFT_KEYS = new Set(['options']);
const SETTLEMENT_KEYS = new Set(['runId', 'currency', 'difficulty', 'result', 'time', 'kills', 'wave']);

function fail(reason) {
  return {ok: false, reason};
}

function pass(value) {
  return {ok: true, value};
}

function isPlain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isInt(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNum(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isBool(value) {
  return value === true || value === false;
}

function isId(value, max = 96) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max && ID_RE.test(value);
}

function isSafeKey(key) {
  return typeof key === 'string'
    && key.length >= 1
    && key.length <= 64
    && key !== '__proto__'
    && key !== 'prototype'
    && key !== 'constructor'
    && !key.includes('\0');
}

function isDifficulty(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DIFFICULTIES, value);
}

function canonicalSpeed(value) {
  if (value === 1 || value === 3 || value === 10) return value;
  if (typeof value === 'number' && Math.abs(value - 1.5) < 1e-9) return 1.5;
  return null;
}

function clampDust(value, max) {
  if (value <= max) return value;
  const slack = Math.max(1e-4, Math.abs(max) * 1e-6);
  return value <= max + slack ? max : null;
}

function noteUid(id, mark) {
  if (typeof id !== 'string') return;
  const match = UID_RE.exec(id);
  if (!match) return;
  const n = Number(match[1]);
  if (n > mark.high) mark.high = n;
}

function claimId(id, ids) {
  if (ids.has(id)) return false;
  ids.add(id);
  return true;
}

function sanitizeJson(value, seen = new WeakSet(), depth = 0) {
  if (value === null) return pass(null);
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_NUMBER) return fail('invalid_bounds');
    return pass(value);
  }
  if (type === 'boolean') return pass(value);
  if (type === 'string') {
    if (value.length > MAX_STRING || value.includes('\0')) return fail('invalid_bounds');
    return pass(value);
  }
  if (type !== 'object') return fail('invalid_run');
  if (seen.has(value)) return fail('invalid_run');
  if (depth > MAX_DEPTH) return fail('invalid_bounds');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY) return fail('invalid_bounds');
      const out = [];
      for (const item of value) {
        const next = sanitizeJson(item, seen, depth + 1);
        if (!next.ok) return next;
        out.push(next.value);
      }
      return pass(out);
    }
    if (!isPlain(value)) return fail('invalid_run');
    const keys = Object.keys(value);
    if (keys.length > MAX_OBJECT_KEYS) return fail('invalid_bounds');
    const out = {};
    for (const key of keys) {
      if (!isSafeKey(key)) return fail('invalid_run');
      const next = sanitizeJson(value[key], seen, depth + 1);
      if (!next.ok) return next;
      out[key] = next.value;
    }
    return pass(out);
  } finally {
    seen.delete(value);
  }
}

function copyExtensions(source, target, known) {
  for (const key of Object.keys(source)) {
    if (known.has(key)) continue;
    if (!isSafeKey(key)) return fail('invalid_run');
    const next = sanitizeJson(source[key]);
    if (!next.ok) return next;
    target[key] = next.value;
  }
  return pass(target);
}

function validateProfile(profile) {
  if (!isPlain(profile)) return fail('invalid_profile');
  if ((profile.version === 1 || profile.version === 2) && isPlain(profile.permanent) && isPlain(profile.equipped) && Array.isArray(profile.equipmentOwned)) {
    const rename = {
      hawk_brace: 'kinetic_core',
      stormglass_edge: 'prism_lens',
      survey_bead: 'sun_spindle',
      ward_planks: 'vanguard_kit',
      bastion_mail: 'surge_capacitor'
    };
    const mapped = (id) => (Object.hasOwn(rename, id) ? rename[id] : id);
    profile = {
      ...profile,
      version: CONTRACT_VERSION,
      permanent: {economy: 0, ...profile.permanent},
      equipmentOwned: [...new Set(profile.equipmentOwned.map(mapped))],
      equipped: Object.fromEntries(Object.entries(profile.equipped).map(([slot, id]) => [slot, mapped(id)]))
    };
  }
  if (profile.version !== CONTRACT_VERSION) return fail('invalid_version');
  if (typeof profile.currency !== 'number' || !Number.isFinite(profile.currency)) return fail('invalid_profile');
  if (!isNum(profile.currency, 0, MAX_CURRENCY)) return fail('invalid_bounds');
  if (!Array.isArray(profile.equipmentOwned) || profile.equipmentOwned.length > MAX_EQUIPMENT) {
    return fail(Array.isArray(profile.equipmentOwned) ? 'invalid_bounds' : 'invalid_profile');
  }
  if (!isPlain(profile.equipped) || !isPlain(profile.permanent) || !isPlain(profile.settings)) return fail('invalid_profile');
  if (!Array.isArray(profile.settledRuns)) return fail('invalid_profile');
  if (profile.settledRuns.length > MAX_SETTLED) return fail('invalid_bounds');
  if (!isPlain(profile.best)) return fail('invalid_profile');

  const owned = [];
  const ownedSet = new Set();
  for (const id of profile.equipmentOwned) {
    if (!isId(id, 64)) return fail('invalid_profile');
    if (ownedSet.has(id)) return fail('invalid_profile');
    ownedSet.add(id);
    owned.push(id);
  }
  for (const slot of EQUIPPED_SLOTS) {
    if (!Object.hasOwn(profile.equipped, slot)) return fail('invalid_profile');
  }
  if (Object.keys(profile.equipped).some((key) => !EQUIPPED_SLOTS.includes(key))) return fail('invalid_profile');
  const equipped = {weapon: null, charm: null, armor: null};
  const used = new Set();
  for (const slot of EQUIPPED_SLOTS) {
    const id = profile.equipped[slot];
    if (id === null) continue;
    if (typeof id !== 'string' || !ownedSet.has(id) || used.has(id)) return fail('invalid_profile');
    used.add(id);
    equipped[slot] = id;
  }

  for (const key of PERMANENT_KEYS) {
    if (!Object.hasOwn(profile.permanent, key)) return fail('invalid_profile');
    if (typeof profile.permanent[key] !== 'number' || !Number.isFinite(profile.permanent[key])) return fail('invalid_profile');
    if (!isInt(profile.permanent[key], 0, MAX_PERMANENT)) return fail('invalid_bounds');
  }
  if (Object.keys(profile.permanent).some((key) => !PERMANENT_KEYS.includes(key))) return fail('invalid_profile');
  const permanent = {
    damage: profile.permanent.damage,
    haste: profile.permanent.haste,
    economy: profile.permanent.economy,
    vitality: profile.permanent.vitality
  };

  const settledRuns = [];
  for (const id of profile.settledRuns) {
    if (!isId(id, 96)) return fail('invalid_profile');
    settledRuns.push(id);
  }

  const best = sanitizeJson(profile.best);
  if (!best.ok) return fail(best.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');

  const {language, sound, reducedMotion, difficulty} = profile.settings;
  if (language !== 'en' && language !== 'zh') return fail('invalid_enum');
  if (!isBool(sound) || !isBool(reducedMotion)) return fail('invalid_profile');
  if (!isDifficulty(difficulty)) return fail('invalid_enum');
  const settings = {language, sound, reducedMotion, difficulty};
  const settingsExtra = copyExtensions(profile.settings, settings, SETTINGS_KEYS);
  if (!settingsExtra.ok) return fail(settingsExtra.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');

  const value = {
    version: CONTRACT_VERSION,
    currency: profile.currency,
    equipmentOwned: owned,
    equipped,
    permanent,
    settledRuns,
    best: best.value,
    settings
  };
  const extra = copyExtensions(profile, value, PROFILE_KEYS);
  if (!extra.ok) return fail(extra.reason === 'invalid_bounds' ? 'invalid_bounds' : 'invalid_profile');
  return pass(value);
}

function validateUpgrades(upgrades) {
  if (!isPlain(upgrades)) return fail('invalid_run');
  const keys = Object.keys(upgrades);
  if (keys.length > MAX_UPGRADES) return fail('invalid_bounds');
  const out = {};
  for (const key of keys) {
    if (!isSafeKey(key)) return fail('invalid_run');
    const next = sanitizeJson(upgrades[key]);
    if (!next.ok) return next;
    out[key] = next.value;
  }
  return pass(out);
}

function validateUnit(unit, role, ids, mark) {
  if (!isPlain(unit)) return fail('invalid_run');
  if (!isId(unit.id, 64)) return fail('invalid_run');
  if (!claimId(unit.id, ids)) return fail('invalid_run');
  noteUid(unit.id, mark);
  const {kind, type, rank} = unit;
  if (kind === 'hero') {
    if (role === 'defender' || type !== 'hero' || rank !== 1) return fail('invalid_hero');
  } else if (role === 'hero') {
    return fail('invalid_hero');
  } else if (kind === 'tower') {
    if (!BASE_TYPE_SET.has(type)) return fail('invalid_enum');
    if (!isInt(rank, 1, 4)) return fail('invalid_bounds');
  } else {
    return fail('invalid_enum');
  }
  if (!TARGET_MODES.includes(unit.targeting)) return fail('invalid_run');
  const upgrades = validateUpgrades(unit.upgrades);
  if (!upgrades.ok) return upgrades;
  if (!isNum(unit.cooldown, 0, 600)) return fail(typeof unit.cooldown === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!isInt(unit.kills, 0, MAX_UNIT_KILLS)) return fail(typeof unit.kills === 'number' ? 'invalid_bounds' : 'invalid_run');
  const value = {
    id: unit.id,
    kind,
    type,
    rank,
    upgrades: upgrades.value,
    cooldown: unit.cooldown,
    kills: unit.kills,
    targeting: unit.targeting
  };
  const extra = copyExtensions(unit, value, UNIT_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateStatus(status) {
  if (!isPlain(status)) return fail('invalid_run');
  if (!STATUS_TYPES.has(status.type)) return fail('invalid_enum');
  if (typeof status.power !== 'number' || !Number.isFinite(status.power)) return fail('invalid_run');
  if (status.type === 'slow') {
    if (!isNum(status.power, 0, 1)) return fail('invalid_bounds');
  } else if (!isNum(status.power, 0, 1e6)) {
    return fail('invalid_bounds');
  }
  if (!isNum(status.remaining, 0, 3600)) return fail(typeof status.remaining === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!isId(status.sourceId, 64)) return fail('invalid_run');
  const value = {
    type: status.type,
    power: status.power,
    remaining: status.remaining,
    sourceId: status.sourceId
  };
  if (status.stacks !== undefined) {
    if (!isInt(status.stacks, 0, 100)) return fail(typeof status.stacks === 'number' ? 'invalid_bounds' : 'invalid_run');
    value.stacks = status.stacks;
  }
  if (status.tickTimer !== undefined) {
    if (!isNum(status.tickTimer, 0, 3600)) return fail(typeof status.tickTimer === 'number' ? 'invalid_bounds' : 'invalid_run');
    value.tickTimer = status.tickTimer;
  }
  const extra = copyExtensions(status, value, STATUS_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateEnemy(enemy, ids, mark) {
  if (!isPlain(enemy)) return fail('invalid_run');
  if (!isId(enemy.id, 64) || !claimId(enemy.id, ids)) return fail('invalid_run');
  noteUid(enemy.id, mark);
  for (const key of ['revealed','priority']) {
    if (key in enemy && !isBool(enemy[key])) return fail('invalid_run');
  }
  if (enemy.blockedByFieldId!=null && !isId(enemy.blockedByFieldId)) return fail('invalid_run');
  if (enemy.statusResist!=null && (!isPlain(enemy.statusResist) || Object.values(enemy.statusResist).some(value=>!isNum(value,0,1)))) return fail('invalid_run');
  if (!ENEMY_KINDS.has(enemy.kind)) return fail('invalid_enum');
  if (!isNum(enemy.x, ARENA.enemyMinX - 32, ARENA.enemyMaxX + 32)) return fail('invalid_bounds');
  if (!isNum(enemy.y, ARENA.spawnY - 80, ARENA.fenceY + 80)) return fail('invalid_bounds');
  if (typeof enemy.maxHp !== 'number' || !Number.isFinite(enemy.maxHp)) return fail('invalid_run');
  if (!isNum(enemy.maxHp, 1e-6, MAX_HP)) return fail('invalid_bounds');
  if (typeof enemy.hp !== 'number' || !Number.isFinite(enemy.hp)) return fail('invalid_run');
  const hp = clampDust(enemy.hp, enemy.maxHp);
  if (hp === null || hp < 0) return fail('invalid_bounds');
  if (!isNum(enemy.speed, 1e-6, 2000)) return fail('invalid_bounds');
  if (!isNum(enemy.radius, 1e-6, 180)) return fail('invalid_bounds');
  if (!isNum(enemy.damage, 0, 1e6)) return fail('invalid_bounds');
  if (!isNum(enemy.attackInterval, 1e-6, 600)) return fail('invalid_bounds');
  if (!isNum(enemy.attackCooldown, 0, 600)) return fail('invalid_bounds');
  if (!isNum(enemy.xp, 0, 1e6)) return fail('invalid_bounds');
  if (typeof enemy.armor !== 'number' || !Number.isFinite(enemy.armor)) return fail('invalid_run');
  const armor = clampDust(enemy.armor, 0.8);
  if (armor === null || armor < 0) return fail('invalid_bounds');
  if (!isNum(enemy.driftPhase, -1e9, 1e9)) return fail('invalid_bounds');
  if (!isNum(enemy.driftVelocity, -400, 400)) return fail('invalid_bounds');
  if (!Array.isArray(enemy.statuses) || enemy.statuses.length > MAX_STATUSES) {
    return fail(Array.isArray(enemy.statuses) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!isBool(enemy.attacking) || !isBool(enemy.dead)) return fail('invalid_run');
  const statuses = [];
  for (const status of enemy.statuses) {
    const next = validateStatus(status);
    if (!next.ok) return next;
    statuses.push(next.value);
  }
  const value = {
    id: enemy.id,
    kind: enemy.kind,
    x: enemy.x,
    y: enemy.y,
    hp,
    maxHp: enemy.maxHp,
    speed: enemy.speed,
    radius: enemy.radius,
    damage: enemy.damage,
    attackInterval: enemy.attackInterval,
    attackCooldown: enemy.attackCooldown,
    xp: enemy.xp,
    armor,
    driftPhase: enemy.driftPhase,
    driftVelocity: enemy.driftVelocity,
    statuses,
    attacking: enemy.attacking,
    dead: enemy.dead
  };
  const extra = copyExtensions(enemy, value, ENEMY_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateProjectile(projectile, ids, mark) {
  if (!isPlain(projectile)) return fail('invalid_run');
  if (!isId(projectile.id, 64) || !claimId(projectile.id, ids)) return fail('invalid_run');
  noteUid(projectile.id, mark);
  if (!isId(projectile.sourceId, 64)) return fail('invalid_run');
  if (!(projectile.targetId === null || isId(projectile.targetId, 64))) return fail('invalid_run');
  // Match the live projectile culling bounds in combat, including piercing
  // shots that briefly travel beyond the visible field.
  if (!isNum(projectile.x, -100, ARENA.width + 100)) return fail('invalid_bounds');
  if (!isNum(projectile.y, -120, ARENA.height + 80)) return fail('invalid_bounds');
  if (!isNum(projectile.speed, 1e-6, 20000)) return fail('invalid_bounds');
  if (!isNum(projectile.damage, 0, 1e9)) return fail('invalid_bounds');
  if (!isBool(projectile.crit)) return fail('invalid_run');
  if (!Array.isArray(projectile.tags) || projectile.tags.length > MAX_TAGS) return fail('invalid_run');
  if (!isNum(projectile.splash, 0, 400)) return fail('invalid_bounds');
  if (!isInt(projectile.chain, 0, 30)) return fail('invalid_bounds');
  if (!isNum(projectile.chainRange, 1e-6, 500)) return fail('invalid_bounds');
  if (!isInt(projectile.pierce, 0, 30)) return fail('invalid_bounds');
  if (!Array.isArray(projectile.visited) || projectile.visited.length > MAX_VISITED) return fail('invalid_run');
  if (!isNum(projectile.life, 0, 120)) return fail('invalid_bounds');
  const tags = [];
  for (const tag of projectile.tags) {
    if (typeof tag !== 'string' || tag.length < 1 || tag.length > 32 || !/^[A-Za-z0-9_-]+$/.test(tag)) return fail('invalid_run');
    tags.push(tag);
  }
  const visited = [];
  for (const id of projectile.visited) {
    if (!isId(id, 64)) return fail('invalid_run');
    visited.push(id);
  }
  const value = {
    id: projectile.id,
    sourceId: projectile.sourceId,
    targetId: projectile.targetId,
    x: projectile.x,
    y: projectile.y,
    speed: projectile.speed,
    damage: projectile.damage,
    crit: projectile.crit,
    tags,
    splash: projectile.splash,
    chain: projectile.chain,
    chainRange: projectile.chainRange,
    pierce: projectile.pierce,
    visited,
    life: projectile.life
  };
  const extra = copyExtensions(projectile, value, PROJECTILE_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateCloud(cloud, ids, mark) {
  const next = sanitizeJson(cloud);
  if (!next.ok) return next;
  if (!isPlain(next.value)) return fail('invalid_run');
  for (const [key,power,lo,hi] of [['slow','factor',0,1],['brittle','power',0,2],['poison','dps',0,100000]]) {
    if (!(key in cloud)) continue;
    const effect=cloud[key];
    if (!isPlain(effect) || !isNum(effect[power],lo,hi) || !isNum(effect.duration,0.01,120)) return fail('invalid_run');
    if (key==='poison' && !isInt(effect.maxStacks,1,32)) return fail('invalid_run');
  }
  const cloudValue = next.value;
  if (!isId(cloud.id) || !isId(cloud.sourceId) || !isId(cloud.kind) || !isNum(cloud.x,-80,440) ||
      !isNum(cloud.y,-120,680) || !isNum(cloud.radius,1,400) || !isNum(cloud.duration,0.01,120) ||
      !isNum(cloud.remaining,0,cloud.duration) || !isNum(cloud.tick,0.05,30) ||
      !isNum(cloud.tickTimer,-1e-8,cloud.tick) || !isNum(cloud.dps,0,100000)) return fail('invalid_run');
  if ('x' in cloudValue && !isNum(cloudValue.x, -80, ARENA.width + 80)) return fail('invalid_bounds');
  if ('y' in cloudValue && !isNum(cloudValue.y, -120, ARENA.height + 40)) return fail('invalid_bounds');
  if ('id' in cloudValue) {
    if (!isId(cloudValue.id, 64) || !claimId(cloudValue.id, ids)) return fail('invalid_run');
    noteUid(cloudValue.id, mark);
  }
  return pass(cloudValue);
}

function optionSignature(option) {
  return `${option.kind}|${option.type || ''}|${option.upgradeId || ''}`;
}

function validateOption(option) {
  if (!isPlain(option) || !isId(option.id, 64)) return fail('invalid_run');
  const value = {id: option.id, kind: option.kind};
  if (option.kind === 'tower') {
    if (!BASE_TYPE_SET.has(option.type)) return fail('invalid_enum');
    if (option.upgradeId != null) return fail('invalid_run');
    value.type = option.type;
    if (option.action !== undefined) {
      if (option.action !== 'deploy' && option.action !== 'upgrade') return fail('invalid_enum');
      value.action = option.action;
    }
    if (option.rank !== undefined) {
      if (!isInt(option.rank, 0, 4)) return fail('invalid_bounds');
      value.rank = option.rank;
    }
    if (option.nextRank !== undefined) {
      if (!isInt(option.nextRank, 1, 4)) return fail('invalid_bounds');
      value.nextRank = option.nextRank;
    }
    if (option.cap !== undefined) {
      if (!isInt(option.cap, 1, 4)) return fail('invalid_bounds');
      value.cap = option.cap;
    }
  } else if (option.kind === 'hero_upgrade') {
    if (!isId(option.upgradeId, 64) || option.type != null) return fail('invalid_run');
    value.upgradeId = option.upgradeId;
    if (option.superweapon !== undefined) {
      if (!isBool(option.superweapon)) return fail('invalid_run');
      value.superweapon = option.superweapon;
    }
    if (option.cap !== undefined) {
      if (!isInt(option.cap, 1, 32)) return fail('invalid_bounds');
      value.cap = option.cap;
    }
    if (option.nextLevel !== undefined) {
      if (!isInt(option.nextLevel, 1, 32)) return fail('invalid_bounds');
      value.nextLevel = option.nextLevel;
    }
  } else {
    return fail('invalid_enum');
  }
  const extra = copyExtensions(option, value, OPTION_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateDraft(draft) {
  if (draft === null) return pass(null);
  if (!isPlain(draft) || !Array.isArray(draft.options) || draft.options.length < 1 || draft.options.length > 3) return fail('invalid_run');
  const options = [];
  const ids = new Set();
  const signatures = new Set();
  for (const option of draft.options) {
    const next = validateOption(option);
    if (!next.ok) return next;
    const signature = optionSignature(next.value);
    if (ids.has(next.value.id) || signatures.has(signature)) return fail('invalid_run');
    ids.add(next.value.id);
    signatures.add(signature);
    options.push(next.value);
  }
  const value = {options};
  const extra = copyExtensions(draft, value, DRAFT_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateDirector(director) {
  if (!isPlain(director)) return fail('invalid_run');
  if (!isInt(director.nextWave, 0, MAX_WAVE)) return fail(typeof director.nextWave === 'number' ? 'invalid_bounds' : 'invalid_run');
  if (!Array.isArray(director.queue)) return fail('invalid_run');
  if (director.queue.length > MAX_QUEUE) return fail('invalid_bounds');
  if (!isBool(director.done)) return fail('invalid_run');
  const queue = [];
  for (const item of director.queue) {
    const next = sanitizeJson(item);
    if (!next.ok) return next;
    queue.push(next.value);
  }
  const value = {nextWave: director.nextWave, queue, done: director.done};
  const extra = copyExtensions(director, value, DIRECTOR_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateSettlement(settlement, runId, difficulty) {
  if (settlement === null) return pass(null);
  if (!isPlain(settlement)) return fail('invalid_settlement');
  if (settlement.runId !== runId || !isId(settlement.runId, 96)) return fail('invalid_settlement');
  if (!isNum(settlement.currency, 0, MAX_CURRENCY)) return fail('invalid_settlement');
  if (settlement.difficulty !== difficulty || !isDifficulty(settlement.difficulty)) return fail('invalid_settlement');
  if (!RESULTS.has(settlement.result)) return fail('invalid_settlement');
  if (!isNum(settlement.time, 0, MAX_TIME)) return fail('invalid_settlement');
  if (!isInt(settlement.kills, 0, MAX_UNIT_KILLS)) return fail('invalid_settlement');
  if (!isInt(settlement.wave, 0, MAX_WAVE)) return fail('invalid_settlement');
  const value = {
    runId: settlement.runId,
    currency: settlement.currency,
    difficulty: settlement.difficulty,
    result: settlement.result,
    time: settlement.time,
    kills: settlement.kills,
    wave: settlement.wave
  };
  const extra = copyExtensions(settlement, value, SETTLEMENT_KEYS);
  if (!extra.ok) return fail('invalid_settlement');
  return pass(value);
}

function validatePhaseShape(phase, draft) {
  if (phase === 'draft') return draft !== null;
  return draft === null;
}

function validateRun(state) {
  if (!isPlain(state)) return fail('invalid_run');
  if (state.version !== CONTRACT_VERSION) return fail('invalid_version');
  if (!isId(state.runId, 96)) return fail('invalid_run');
  if (!isInt(state.seed, 0, UINT32) || !isInt(state.rng, 0, UINT32)) return fail('invalid_bounds');
  if (!isInt(state.nextId, 1, MAX_NEXT_ID)) return fail('invalid_bounds');
  if (!isNum(state.time, 0, MAX_TIME) || !isInt(state.tick, 0, MAX_TICK)) return fail('invalid_bounds');
  if (!isNum(state.accumulator, -MAX_ABS_NUMBER, MAX_ABS_NUMBER)) return fail('invalid_bounds');
  if (!PHASES.has(state.phase)) return fail('invalid_enum');
  if (!isBool(state.paused) || !isBool(state.hiddenPaused)) return fail('invalid_run');
  const speed = canonicalSpeed(state.speed);
  if (speed === null) return fail('invalid_enum');
  if (!isDifficulty(state.difficulty)) return fail('invalid_enum');
  if (!isInt(state.wave, 0, MAX_WAVE)) return fail('invalid_bounds');
  if (!isNum(state.waveTime, 0, MAX_TIME)) return fail('invalid_bounds');
  if (!isInt(state.kills, 0, MAX_UNIT_KILLS)) return fail('invalid_bounds');
  if (!isNum(state.xp, 0, MAX_CURRENCY) || !isNum(state.nextDraftXp, 1e-6, MAX_CURRENCY)) return fail('invalid_bounds');
  if (!isInt(state.draftLevel, 0, MAX_WAVE)) return fail('invalid_bounds');
  if (!isBool(state.initialized) || !isBool(state.endless)) return fail('invalid_run');
  if (!Array.isArray(state.events)) return fail('invalid_run');
  if (!isPlain(state.fence)) return fail('invalid_run');
  if (!isNum(state.fence.maxHp, 1e-6, MAX_FENCE)) return fail('invalid_bounds');
  if (typeof state.fence.hp !== 'number' || !Number.isFinite(state.fence.hp)) return fail('invalid_run');
  const fenceHp = clampDust(state.fence.hp, state.fence.maxHp);
  if (fenceHp === null || fenceHp < 0) return fail('invalid_bounds');
  if (!isPlain(state.stats)) return fail('invalid_run');
  if (!isNum(state.stats.damage, 0, MAX_STAT) || !isNum(state.stats.fenceDamage, 0, MAX_STAT)) return fail('invalid_bounds');
  if (!isInt(state.stats.crits, 0, MAX_UNIT_KILLS)) return fail('invalid_bounds');

  const director = validateDirector(state.director);
  if (!director.ok) return director;
  const draft = validateDraft(state.draft);
  if (!draft.ok) return draft;
  const snapshot = validateProfile(state.profileSnapshot);
  if (!snapshot.ok) return fail(snapshot.reason === 'invalid_version' ? 'invalid_version' : 'invalid_run');
  const settlement = validateSettlement(state.settlement, state.runId, state.difficulty);
  if (!settlement.ok) return settlement;

  if (!Array.isArray(state.slots) || state.slots.length !== 10) return fail('invalid_slots');
  if (!Array.isArray(state.enemies) || state.enemies.length > MAX_ENEMIES) {
    return fail(Array.isArray(state.enemies) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!Array.isArray(state.projectiles) || state.projectiles.length > MAX_PROJECTILES) {
    return fail(Array.isArray(state.projectiles) ? 'invalid_bounds' : 'invalid_run');
  }
  if (!Array.isArray(state.clouds) || state.clouds.length > MAX_CLOUDS) {
    return fail(Array.isArray(state.clouds) ? 'invalid_bounds' : 'invalid_run');
  }

  const ids = new Set();
  const mark = {high: 0};
  if (!isInt(state.rerollsLeft, 0, 20) || !isInt(state.draftRerollsUsed, 0, 3)) return fail('invalid_run');
  const surge = state.surge;
  if (!isPlain(surge) || !isInt(surge.maxCharges, 1, 2) || !isInt(surge.charges, 0, surge.maxCharges) ||
      !isNum(surge.cooldown, 0, 10) || !isNum(surge.shieldTimer, 0, 3) || !Array.isArray(surge.thresholdsUsed) ||
      surge.thresholdsUsed.length > 2 || new Set(surge.thresholdsUsed).size !== surge.thresholdsUsed.length ||
      surge.thresholdsUsed.some((t) => t !== 0.5 && t !== 0.2)) return fail('invalid_run');

  const slots = [];
  let heroes = 0;
  for (let index = 0; index < 10; index++) {
    const slot = state.slots[index];
    if (!isPlain(slot) || slot.index !== index) return fail('invalid_slots');
    let unit = null;
    if (slot.unit !== null) {
      const next = validateUnit(slot.unit, 'any', ids, mark);
      if (!next.ok) return next;
      unit = next.value;
      if (unit.kind === 'hero') heroes++;
    }
    slots.push({...slotGeometry(index), unit});
  }
  if (heroes !== 1) return fail('invalid_hero');
  if (!validatePhaseShape(state.phase, draft.value)) return fail('invalid_run');

  const enemies = [];
  for (const enemy of state.enemies) {
    const next = validateEnemy(enemy, ids, mark);
    if (!next.ok) return next;
    enemies.push(next.value);
  }
  const projectiles = [];
  for (const projectile of state.projectiles) {
    const next = validateProjectile(projectile, ids, mark);
    if (!next.ok) return next;
    projectiles.push(next.value);
  }
  const clouds = [];
  for (const cloud of state.clouds) {
    const next = validateCloud(cloud, ids, mark);
    if (!next.ok) return next;
    clouds.push(next.value);
  }

  let nextId = state.nextId;
  if (nextId <= mark.high) {
    if (mark.high >= MAX_NEXT_ID) return fail('invalid_bounds');
    nextId = mark.high + 1;
  }

  const fence = {hp: fenceHp, maxHp: state.fence.maxHp};
  const fenceExtra = copyExtensions(state.fence, fence, FENCE_KEYS);
  if (!fenceExtra.ok) return fenceExtra;
  const stats = {
    damage: state.stats.damage,
    fenceDamage: state.stats.fenceDamage,
    crits: state.stats.crits
  };
  const statsExtra = copyExtensions(state.stats, stats, STAT_KEYS);
  if (!statsExtra.ok) return statsExtra;

  const value = {
    version: CONTRACT_VERSION,
    runId: state.runId,
    seed: state.seed,
    rng: state.rng,
    nextId,
    time: state.time,
    tick: state.tick,
    accumulator: 0,
    phase: state.phase,
    paused: true,
    hiddenPaused: false,
    speed,
    difficulty: state.difficulty,
    wave: state.wave,
    waveTime: state.waveTime,
    director: director.value,
    kills: state.kills,
    xp: state.xp,
    nextDraftXp: state.nextDraftXp,
    draftLevel: state.draftLevel,
    fence,
    slots,
    enemies,
    projectiles,
    clouds,
    events: [],
    draft: draft.value,
    profileSnapshot: snapshot.value,
    settlement: settlement.value,
    stats,
    initialized: state.initialized,
    endless: state.endless,
    rerollsLeft: state.rerollsLeft,
    draftRerollsUsed: state.draftRerollsUsed,
    surge: {
      charges: surge.charges,
      maxCharges: surge.maxCharges,
      shieldTimer: surge.shieldTimer,
      cooldown: surge.cooldown,
      thresholdsUsed: [...surge.thresholdsUsed]
    }
  };
  if (state.systems !== undefined) {
    if (!isPlain(state.systems)) return fail('invalid_run');
    const systems = {};
    const systemsExtra = copyExtensions(state.systems, systems, new Set());
    if (!systemsExtra.ok) return systemsExtra;
    value.systems = systems;
  }
  if (state.expedition !== undefined) {
    if (typeof state.expedition !== 'string' || state.expedition.length < 1 || state.expedition.length > 32 || !/^[a-z0-9_]+$/.test(state.expedition)) {
      return fail('invalid_run');
    }
    value.expedition = state.expedition;
  }
  const extra = copyExtensions(state, value, RUN_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function resolveStorage(storage, mode) {
  let store = storage;
  if (store === undefined) {
    try {
      store = globalThis.localStorage;
    } catch {
      return null;
    }
  }
  if (!store || typeof store.getItem !== 'function') return null;
  if ((mode === 'write' || mode === 'remove' || mode === 'import') && typeof store.setItem !== 'function') return null;
  if ((mode === 'remove' || mode === 'import') && typeof store.removeItem !== 'function') return null;
  return store;
}

function readRaw(storage, key) {
  let value;
  try {
    value = storage.getItem(key);
  } catch {
    return fail('storage_unavailable');
  }
  if (value == null) return pass(null);
  if (typeof value !== 'string') return fail('invalid_json');
  if (value.length > MAX_IMPORT_CHARS) return fail('too_large');
  return pass(value);
}

function writeRaw(storage, key, text) {
  try {
    storage.setItem(key, text);
    return pass(true);
  } catch (error) {
    return fail(isQuotaError(error) ? 'quota' : 'storage_unavailable');
  }
}

function removeRaw(storage, key) {
  try {
    storage.removeItem(key);
    return pass(true);
  } catch {
    return fail('storage_unavailable');
  }
}

function isQuotaError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return error.code === 22 || error.code === 1014;
}

function parseStored(raw, validate) {
  if (!raw.ok) return null;
  if (raw.value === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.value);
  } catch {
    return null;
  }
  const validated = validate(parsed);
  return validated.ok ? validated.value : null;
}

function encode(value, reason) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return fail(reason);
  }
  if (typeof text !== 'string' || text.length > MAX_IMPORT_CHARS) return fail('too_large');
  return pass(text);
}

function invalidInput(reason) {
  const error = new Error(reason);
  error.reason = reason;
  return error;
}

function restorePair(storage, hadProfile, prevProfile, hadRun, prevRun) {
  if (hadProfile) storage.setItem(PROFILE_KEY, prevProfile);
  else storage.removeItem(PROFILE_KEY);
  if (hadRun) storage.setItem(RUN_KEY, prevRun);
  else storage.removeItem(RUN_KEY);
}

function loadProfile(storage) {
  const store = resolveStorage(storage, 'read');
  if (!store) return null;
  return parseStored(readRaw(store, PROFILE_KEY), validateProfile);
}

function saveProfile(profile, storage) {
  const validated = validateProfile(profile);
  if (!validated.ok) return {ok: false, reason: validated.reason};
  const store = resolveStorage(storage, 'write');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const text = encode(validated.value, 'invalid_profile');
  if (!text.ok) return {ok: false, reason: text.reason};
  const written = writeRaw(store, PROFILE_KEY, text.value);
  return written.ok ? {ok: true} : {ok: false, reason: written.reason};
}

function legacyRunNotice(storage) {
  const store = resolveStorage(storage, 'read');
  if (!store) return '';
  const raw = readRaw(store, RUN_KEY);
  if (!raw.ok || !raw.value) return '';
  try {
    const ver = JSON.parse(raw.value)?.version;
    return (ver === 1 || ver === 2) ? 'legacyRunReset' : '';
  } catch {
    return '';
  }
}

function loadRun(storage) {
  const store = resolveStorage(storage, 'read');
  if (!store) return null;
  return parseStored(readRaw(store, RUN_KEY), validateRun);
}

function saveRun(state, storage) {
  const validated = validateRun(state);
  if (!validated.ok) return {ok: false, reason: validated.reason};
  const store = resolveStorage(storage, 'write');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const text = encode(validated.value, 'invalid_run');
  if (!text.ok) return {ok: false, reason: text.reason};
  const written = writeRaw(store, RUN_KEY, text.value);
  return written.ok ? {ok: true} : {ok: false, reason: written.reason};
}

function clearRun(storage) {
  const store = resolveStorage(storage, 'remove');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const removed = removeRaw(store, RUN_KEY);
  return removed.ok ? {ok: true} : {ok: false, reason: removed.reason};
}

function exportSave(profile, state) {
  const validatedProfile = validateProfile(profile);
  if (!validatedProfile.ok) throw invalidInput(validatedProfile.reason);
  let run = null;
  if (state != null) {
    const validatedRun = validateRun(state);
    if (!validatedRun.ok) throw invalidInput(validatedRun.reason);
    run = validatedRun.value;
  }
  const text = encode({
    format: SAVE_FORMAT,
    version: CONTRACT_VERSION,
    profile: validatedProfile.value,
    run
  }, 'invalid_run');
  if (!text.ok) throw invalidInput(text.reason);
  return text.value;
}

function importSave(text, storage) {
  if (typeof text !== 'string') return {ok: false, reason: 'invalid_json'};
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1).trim() : text.trim();
  if (!source) return {ok: false, reason: 'invalid_json'};
  if (source.length > MAX_IMPORT_CHARS) return {ok: false, reason: 'too_large'};
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {ok: false, reason: 'invalid_json'};
  }
  if (!isPlain(parsed)) return {ok: false, reason: 'invalid_format'};
  const keys = Object.keys(parsed);
  if (keys.length !== 4 || keys.some((key) => !['format', 'version', 'profile', 'run'].includes(key))) {
    return {ok: false, reason: 'invalid_format'};
  }
  if (parsed.format !== SAVE_FORMAT) return {ok: false, reason: 'invalid_format'};
  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== CONTRACT_VERSION) return {ok: false, reason: 'invalid_version'};
  const profile = validateProfile(parsed.profile);
  if (!profile.ok) return {ok: false, reason: profile.reason};
  let run = null;
  const runReset = (parsed.version === 1 || parsed.version === 2) && parsed.run != null;
  if (parsed.run !== null && !runReset) {
    const validatedRun = validateRun(parsed.run);
    if (!validatedRun.ok) return {ok: false, reason: validatedRun.reason};
    run = validatedRun.value;
  }
  const store = resolveStorage(storage, 'import');
  if (!store) return {ok: false, reason: 'storage_unavailable'};
  const profileText = encode(profile.value, 'invalid_profile');
  const runText = run ? encode(run, 'invalid_run') : null;
  if (!profileText.ok) return {ok: false, reason: profileText.reason};
  if (runText && !runText.ok) return {ok: false, reason: runText.reason};

  let prevProfile;
  let prevRun;
  try {
    prevProfile = store.getItem(PROFILE_KEY);
    prevRun = store.getItem(RUN_KEY);
  } catch {
    return {ok: false, reason: 'storage_unavailable'};
  }
  const hadProfile = typeof prevProfile === 'string';
  const hadRun = typeof prevRun === 'string';
  try {
    store.setItem(PROFILE_KEY, profileText.value);
    if (runText) store.setItem(RUN_KEY, runText.value);
    else store.removeItem(RUN_KEY);
  } catch (error) {
    try {
      restorePair(store, hadProfile, prevProfile, hadRun, prevRun);
    } catch {
      /* The failed write is still reported. A second storage failure cannot finish the rollback. */
    }
    return {ok: false, reason: isQuotaError(error) ? 'quota' : 'storage_unavailable'};
  }
  return {ok: true, profile: profile.value, run, ...(runReset ? {notice: 'legacyRunReset'} : {})};
}

};
__ff_factories["src/systems/combat.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["setTargeting"] = setTargeting;
__ff_exports["selectTarget"] = selectTarget;
__ff_exports["damageEnemy"] = damageEnemy;
__ff_exports["killEnemy"] = killEnemy;
__ff_exports["updateClouds"] = updateClouds;
__ff_exports["superweaponCooldown"] = superweaponCooldown;
__ff_exports["updateCombat"] = updateCombat;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/enemies.js");
const __ff_m2 = __ff_load("src/data/towers.js");
const __ff_m3 = __ff_load("src/systems/status.js");
const __ff_m4 = __ff_load("src/systems/movement.js");
const TARGET_MODES = __ff_m0["TARGET_MODES"];
const canPlan = __ff_m0["canPlan"];
const ARENA = __ff_m0["ARENA"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clamp = __ff_m0["clamp"];
const distance = __ff_m0["distance"];
const emit = __ff_m0["emit"];
const random = __ff_m0["random"];
const uid = __ff_m0["uid"];
const ENEMIES = __ff_m1["ENEMIES"];
const getUnitStats = __ff_m2["getUnitStats"];
const statusDurationScale = __ff_m3["statusDurationScale"];
const applyStatus = __ff_m3["applyStatus"];
const spawnEnemy = __ff_m4["spawnEnemy"];
// Combat resolution. Caller advances time and only invokes this during an active
// playing step. This module does not read speed, does not advance time/tick,
// and does not decide victory or defeat.
//
// getUnitStats is the pre-aura stat block (rank, hero upgrades, profile bonuses
// already baked in by the catalog). Support auras are applied here and capped.
//
// On-hit status payload (applyStatus):
//   burn     power = dps, remaining = duration, tickTimer = 0
//   poison   power = dps, stacks = 1, maxStacks copied from stats, tickTimer = 0
//   slow     power = remaining speed factor (0.65 means 65% speed), not a slow percent
//   brittle  power = extra damage taken per stack (0.25 = +25%), capped by BRITTLE_CAP
//   stun     power = 1, remaining = duration; stunned enemies do not bite the fence
//
// Optional stats.mechanics strings honored here:
//   execute      ×1.35 damage when target hp/maxHp <= 0.40
//   fence_focus  ×1.25 damage when the enemy is biting or within 36px of contact
//   brittle      apply brittle 0.20 for 3s when stats.brittle is absent
//   stun         apply stun 0.45s when stats.stun is absent
//   multishot    one extra projectile at the second nearest target; the echo does not split
//
// Pierce is the number of extra bodies the shot may hit along its direction.
// Chain is the number of extra jumps to a new enemy within chainRange (default 70).
// A shot with both pierces first, then chains from the last direct hit.
// Crit is rolled when the shot is fired. Pierce keeps that roll. Each chain
// jump that connects rolls again, and only when the projectile's critChance
// is greater than 0. The opening hit does not roll a second time.
// Splash is full pre-armor damage to other enemy centers within the radius.
// Direct hits, pierce hits, and splash targets apply statuses. Armor and brittle apply inside
// damageEnemy, including damage from status ticks. Armor is a fractional
// reduction clamped to [0, 0.8].
//
// Ranged enemies set attackRange (pixels from their center to the fence line).
// Otherwise they bite only in contact (radius). Defender bolts live in
// state.projectiles. An enemy bolt is allowed only when team:'enemy' (or
// friendly:false); it flies in its dir and damages the fence when it crosses
// y = fenceY. It never hits defenders or other enemies.
// fence_hit.ratio is remaining fence hp / max hp after that damage, clamped
// to [0, 1]. The applied damage, execute numbers, and stun are unchanged.
//
// killEnemy awards kills, source unit.kills, and enemy.xp exactly once. It does
// not remove the body. updateCombat drops dead enemies at the end of the step.
// Engine cleanup may filter `dead` again but must not award kills or XP again.
//
// Phased enemies (phased === true) are not targetable, so shots, pierce, chain,
// and splash miss them. They still bite the fence for enemy.damage on their
// normal attackInterval. Mend may heal a phased ally.
//
// Split: updateCombat copies ENEMIES[kind].split onto a living enemy that does
// not already have a numeric splitCount (splitKind, splitCount max 4,
// splitHealthScale). The once-only kill then spawns up to 4 children of that
// kind, about 14px apart around the body and clamped to the arena, and stops
// at 90 enemies. healthScale is splitHealthScale when finite and > 0, else
// 0.55. splitSpawned is set before the spawn so it cannot recurse. Children
// do not inherit the parent's split fields. The 'split' event is
// {x, y, count, kind} and is not a fence_hit.
//
// Mend: after shots and before fence bites, a living enemy with mendEvery > 0
// heals the other living ally inside mendRange with the lowest hp/maxHp that
// is missing health. Never itself. One heal per clock even when dt is large.
// Stun holds the clock. Catalog mend.amount is scaled once by difficulty
// health into mendAmount. The 'mend' event is not a fence_hit.
//
// Ward: after splits are attached and dead bodies are removed, and before
// defenders fire, every enemy.wardShield is cleared. Each living unstunned
// enemy with wardRange > 0 and wardReduction > 0 then shields the nearest
// other living enemy inside that range (smaller distance, then smaller id).
// The shield is the greater reduction on that ally, capped at WARD_CAP. A
// warden does not shield itself, and a stun grants nothing that tick.
// damageEnemy multiplies after armor and brittle. Fence bites still use
// enemy.damage. The hit event is unchanged.







const AURA_DAMAGE_CAP = 0.6;
__ff_exports["AURA_DAMAGE_CAP"] = AURA_DAMAGE_CAP;

const AURA_HASTE_CAP = 0.45;
__ff_exports["AURA_HASTE_CAP"] = AURA_HASTE_CAP;

const BRITTLE_CAP = 1;
__ff_exports["BRITTLE_CAP"] = BRITTLE_CAP;

const MIN_ATTACK_INTERVAL = 0.05;
__ff_exports["MIN_ATTACK_INTERVAL"] = MIN_ATTACK_INTERVAL;

const ARMOR_CAP = 0.8;
__ff_exports["ARMOR_CAP"] = ARMOR_CAP;

const WARD_CAP = 0.4;
__ff_exports["WARD_CAP"] = WARD_CAP;

const FENCE_REGEN_PER_SECOND = 0;
__ff_exports["FENCE_REGEN_PER_SECOND"] = FENCE_REGEN_PER_SECOND;


const HIT_SLOP = 2;
const CONTACT_SLOP = 0.75;
const EXECUTE_THRESHOLD = 0.4;
const EXECUTE_MULTIPLIER = 1.35;
const FENCE_FOCUS_MULTIPLIER = 1.25;
const FENCE_FOCUS_PADDING = 36;
const DEFAULT_CHAIN_RANGE = 70;
const DEFAULT_CRIT_MULTIPLIER = 1.75;
const DEFAULT_PROJECTILE_SPEED = 300;
const BRITTLE_FALLBACK = {power: 0.2, duration: 3};
const STUN_FALLBACK = 0.45;
const SPLIT_CHILD_CAP = 4;
const SPLIT_ENEMY_CAP = 120;
const SPLIT_SPREAD = 14;
const DEFAULT_SPLIT_HEALTH_SCALE = 0.55;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function simulationFrozen(state) {
  if (!state) return true;
  if (state.phase && state.phase !== 'playing') return true;
  if (state.paused || state.hiddenPaused) return true;
  return false;
}

function isTargetable(enemy) {
  return !!(enemy && !enemy.dead && enemy.hp > 0 && (!enemy.phased || enemy.revealed) && !enemy.airTime && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
}

function isLiving(enemy) {
  return !!(enemy && !enemy.dead && enemy.hp > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
}

function difficultyHealth(state) {
  const row = state && DIFFICULTIES[state.difficulty];
  const health = row && row.health;
  return Number.isFinite(health) ? health : 1;
}

function isStunned(enemy) {
  const list = enemy?.statuses;
  if (!Array.isArray(list)) return false;
  for (const status of list) {
    if (status && status.type === 'stun' && status.remaining > 0) return true;
  }
  return false;
}

function brittleBonus(enemy) {
  const list = enemy?.statuses;
  if (!Array.isArray(list)) return 0;
  let bonus = 0;
  for (const status of list) {
    if (!status || status.type !== 'brittle' || !(status.remaining > 0)) continue;
    const stacks = Number.isFinite(status.stacks) ? status.stacks : 1;
    if (stacks <= 0) continue;
    bonus += Math.max(0, finite(status.power, 0)) * stacks;
  }
  return clamp(bonus, 0, BRITTLE_CAP);
}

function ensureStats(state) {
  if (!state.stats || typeof state.stats !== 'object') {
    state.stats = {damage: 0, fenceDamage: 0, crits: 0};
  }
  return state.stats;
}

function emitEvent(state, type, data) {
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, type, data);
}

function findUnit(state, id) {
  if (!id || !Array.isArray(state.slots)) return null;
  for (const slot of state.slots) {
    if (slot?.unit?.id === id) return slot.unit;
  }
  return null;
}

function setTargeting(state, index, mode) {
  const unit = state?.slots?.[index]?.unit;
  if (!Number.isInteger(index) || !canPlan(state) || !unit) return {ok: false, reason: 'invalid_slot'};
  mode = mode ?? TARGET_MODES[(TARGET_MODES.indexOf(unit.targeting) + 1) % 4];
  if (!TARGET_MODES.includes(mode)) return {ok: false, reason: 'invalid_mode'};
  unit.targeting = mode;
  emit(state, 'targeting_change', {slot: index, mode});
  return {ok: true};
}
function priorityScore(e,mode) {
  if (mode==='priority') return Number(Boolean(e.priority || ENEMIES[e.kind]?.priority));
  if (mode==='strongest') return e.hp;
  if (mode==='weakest') return -e.hp/e.maxHp;
  return 0;
}
function ignored(ignore, id) {
  if (!ignore) return false;
  for (let i = 0; i < ignore.length; i++) {
    if (ignore[i] === id) return true;
  }
  return false;
}

function selectTarget(state,origin,range,targeting='foremost',ignore) {
  let best=null, bestScore=-Infinity;
  for (const e of state.enemies) {
    if (!isTargetable(e) || ignored(ignore,e.id)) continue;
    const dx=e.x-origin.x, dy=e.y-origin.y;
    if (dx*dx+dy*dy>range*range) continue;
    const score=priorityScore(e,targeting);
    if (!best || score>bestScore || (score===bestScore && (e.y>best.y || (e.y===best.y && String(e.id)<String(best.id))))) {
      best=e;
      bestScore=score;
    }
  }
  return best;
}
function nearestEnemy(state,origin,range,ignore) {
  return selectTarget(state,origin,range,'foremost',ignore);
}

function enemyById(state, id) {
  if (!id) return null;
  for (const enemy of state.enemies) {
    if (enemy?.id === id && isTargetable(enemy)) return enemy;
  }
  return null;
}

/**
 * Apply pre-armor damage. `amount` is the final outgoing damage (crit already
 * included when options.crit is set). Armor and brittle are applied here,
 * then ward shield. Returns HP actually removed. Usable as the status
 * damage callback.
 */
function damageEnemy(state, enemy, amount, options = {}) {
  if (!state || !enemy || enemy.dead) return 0;
  const opts = options || {};
  if (!Number.isFinite(enemy.hp)) return 0;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy, opts.sourceId, opts);
    return 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const armor = clamp(finite(enemy.armor, 0), 0, ARMOR_CAP) * (1 - clamp(opts.armorPen || 0, 0, 1));
  const reduced = amount * (1 - armor) * (1 + brittleBonus(enemy));
  const shield = clamp(finite(enemy.wardShield, 0), 0, WARD_CAP);
  const shielded = reduced * (1 - shield);
  if (!Number.isFinite(shielded) || shielded <= 0) return 0;
  const dealt = Math.min(enemy.hp, shielded);
  enemy.hp -= dealt;
  const stats = ensureStats(state);
  stats.damage = finite(stats.damage, 0) + dealt;
  if (opts.crit) stats.crits = finite(stats.crits, 0) + 1;
  emitEvent(state, 'hit', {
    sourceId: opts.sourceId || null,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    damage: dealt,
    crit: !!opts.crit,
    execute: opts.execute === true,
    attack: opts.type || 'hit',
    towerType: opts.towerType || findUnit(state,opts.sourceId)?.type || null,
    armorBlocked:amount*armor, ...(opts.reaction ? {reaction:opts.reaction} : {})
  });
  if (enemy.hp <= 1e-6) {
    enemy.hp = 0;
    killEnemy(state, enemy, opts.sourceId, opts);
  }
  return dealt;
}

function attachSplit(enemy) {
  if (!enemy || typeof enemy.splitCount === 'number') return;
  const split = ENEMIES[enemy.kind] && ENEMIES[enemy.kind].split;
  if (!split || typeof split !== 'object') return;
  if (typeof split.kind === 'string') enemy.splitKind = split.kind;
  if (Number.isFinite(split.count)) {
    enemy.splitCount = Math.max(0, Math.min(SPLIT_CHILD_CAP, Math.floor(split.count)));
  }
  if (Number.isFinite(split.healthScale)) enemy.splitHealthScale = split.healthScale;
}

function attachLivingSplits(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy)) continue;
    attachSplit(enemy);
  }
}

function releaseSplit(state, enemy) {
  if (!(enemy.splitCount > 0)) return;
  if (typeof enemy.splitKind !== 'string' || enemy.splitKind.length === 0) return;
  if (enemy.splitSpawned === true) return;
  enemy.splitSpawned = true;
  const healthScale = Number.isFinite(enemy.splitHealthScale) && enemy.splitHealthScale > 0
    ? enemy.splitHealthScale
    : DEFAULT_SPLIT_HEALTH_SCALE;
  const count = Math.min(SPLIT_CHILD_CAP, Math.floor(enemy.splitCount));
  if (!Array.isArray(state.enemies)) state.enemies = [];
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    if (state.enemies.length >= SPLIT_ENEMY_CAP) break;
    const offset = (i - (count - 1) / 2) * SPLIT_SPREAD;
    const x = clamp((Number.isFinite(enemy.x) ? enemy.x : 0) + offset, ARENA.enemyMinX, ARENA.enemyMaxX);
    spawnEnemy(state, enemy.splitKind, {x, y: enemy.y, healthScale});
    spawned += 1;
  }
  emitEvent(state, 'split', {
    x: enemy.x,
    y: enemy.y,
    count: spawned,
    kind: enemy.splitKind
  });
}

/** Award kill credit, XP from enemy.xp, and a kill event. Repeat calls are no-ops. */
function killEnemy(state, enemy, sourceId, options = {}) {
  if (!state || !enemy || enemy.dead) return false;
  attachSplit(enemy);
  enemy.dead = true;
  enemy.hp = 0;
  enemy.attacking = false;
  state.kills = finite(state.kills, 0) + 1;
  const xpValue = Number(enemy.xp);
  const xp = Number.isFinite(xpValue) ? Math.max(0, xpValue) : 0;
  state.xp = finite(state.xp, 0) + xp;
  const unit = findUnit(state, sourceId);
  if (unit) unit.kills = finite(unit.kills, 0) + 1;
  emitEvent(state, 'kill', {
    sourceId: sourceId || null,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    xp,
    towerType: unit?.type || null
  });
  const mark = enemy.corpseExplode;
  if (mark && !options.fromExplode) {
    const damage = Math.min(260,enemy.maxHp * mark.hpRatio);
    emit(state,'corpse_explode',{x:enemy.x,y:enemy.y,radius:mark.radius,damage});
    for (const other of state.enemies) {
      if (!isLiving(other) || distance(other,enemy)>mark.radius) continue;
      applyPayload(other,{sourceId:mark.sourceId,effects:{poison:mark.poison}});
      damageEnemy(state,other,damage,{sourceId:mark.sourceId,type:'corpse_explode',towerType:'blight',fromExplode:true});
    }
  }
  const heroUnit = state.slots?.find(s => s?.unit?.kind === 'hero')?.unit;
  const frostRank = heroUnit?.upgrades?.frostbite || 0;
  if (frostRank >= 2 && !options.fromShatter && (enemy.statuses || []).some(s => (s.type === 'slow' || s.type === 'brittle') && s.remaining > 0)) {
    const radius = 52 + 8 * (frostRank - 2);
    const dmg = 16 * frostRank;
    emit(state, 'cryo_shatter', {x: enemy.x, y: enemy.y, radius, damage: dmg});
    for (const other of state.enemies) {
      if (!isLiving(other) || other.id === enemy.id || distance(other, enemy) > radius) continue;
      applyStatus(other, {type: 'slow', power: 0.68, remaining: 1.8, sourceId: heroUnit.id});
      damageEnemy(state, other, dmg, {sourceId: heroUnit.id, type: 'cryo_shatter', towerType: 'frost', fromShatter: true});
    }
  }
  releaseSplit(state, enemy);
  return true;
}

function pointDirection(projectile, target) {
  const dx = target.x - projectile.x;
  const dy = target.y - projectile.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  projectile.dirx = dx / len;
  projectile.diry = dy / len;
  return true;
}

function segmentCircleT(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  if (a < 1e-10) return c <= 0 ? 0 : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  if (c <= 0) return 0;
  return null;
}

function firstHit(state, projectile, x1, y1, x2, y2) {
  const pierceLeft = Math.floor(finite(projectile.pierce, 0));
  const selective = pierceLeft <= 0 && !!projectile.targetId;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let best = null;
  let bestT = Infinity;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || ignored(projectile.visited, enemy.id)) continue;
    if (selective && enemy.id !== projectile.targetId) continue;
    const radius = Math.max(4, finite(enemy.radius, 12)) + HIT_SLOP;
    const t = segmentCircleT(x1, y1, x2, y2, enemy.x, enemy.y, radius);
    if (t == null) continue;
    if (!best || t < bestT - 1e-6 || (Math.abs(t - bestT) <= 1e-6 && String(enemy.id) < String(best.enemy.id))) {
      bestT = t;
      best = {enemy, t, x: x1 + dx * t, y: y1 + dy * t};
    }
  }
  return best;
}

function executeApplies(projectile, enemy) {
  const mechanics = projectile?.mechanics || [];
  return mechanics.includes('execute') && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= EXECUTE_THRESHOLD;
}

function impactDamage(projectile, enemy) {
  let amount = finite(projectile.damage, 0);
  if (projectile.crit) amount *= Math.max(1, finite(projectile.critMultiplier, 1));
  const mechanics = projectile.mechanics || [];
  if (executeApplies(projectile, enemy)) {
    amount *= EXECUTE_MULTIPLIER;
  }
  if (mechanics.includes('fence_focus')) {
    const nearFence = enemy.attacking || enemy.y >= ARENA.fenceY - finite(enemy.radius, 12) - FENCE_FOCUS_PADDING;
    if (nearFence) amount *= FENCE_FOCUS_MULTIPLIER;
  }
  return amount;
}

function applyPayload(enemy, projectile) {
  if (!enemy || enemy.dead) return;
  if (!Array.isArray(enemy.statuses)) enemy.statuses = [];
  const effects = projectile.effects || {};
  const sourceId = projectile.sourceId;
  if (effects.burn && effects.burn.duration > 0 && effects.burn.dps > 0) {
    applyStatus(enemy, {
      type: 'burn',
      power: effects.burn.dps,
      remaining: effects.burn.duration,
      sourceId,
      tickTimer: 0
    });
  }
  if (effects.slow && effects.slow.duration > 0) {
    applyStatus(enemy, {
      type: 'slow',
      power: effects.slow.factor,
      remaining: effects.slow.duration,
      sourceId
    });
  }
  if (effects.poison && effects.poison.duration > 0 && effects.poison.dps > 0) {
    const poison = {
      type: 'poison',
      power: effects.poison.dps,
      remaining: effects.poison.duration,
      sourceId,
      stacks: 1,
      tickTimer: 0
    };
    if (Number.isFinite(effects.poison.maxStacks)) poison.maxStacks = effects.poison.maxStacks;
    applyStatus(enemy, poison);
  }
  if (effects.brittle && effects.brittle.duration > 0 && effects.brittle.power > 0) {
    applyStatus(enemy, {
      type: 'brittle',
      power: effects.brittle.power,
      remaining: effects.brittle.duration,
      sourceId,
      stacks: 1
    });
  }
  if (effects.stun && effects.stun.duration > 0) {
    applyStatus(enemy, {
      type: 'stun',
      power: 1,
      remaining: effects.stun.duration,
      sourceId
    });
  }
  const mechanics = projectile.mechanics || [];
  if (mechanics.includes('brittle') && !effects.brittle) {
    applyStatus(enemy, {
      type: 'brittle',
      power: BRITTLE_FALLBACK.power,
      remaining: BRITTLE_FALLBACK.duration,
      sourceId,
      stacks: 1
    });
  }
  if (mechanics.includes('stun') && !effects.stun) {
    applyStatus(enemy, {
      type: 'stun',
      power: 1,
      remaining: STUN_FALLBACK,
      sourceId
    });
  }
}

function pushEnemy(state,enemy,requested) {
  if (!isLiving(enemy) || !requested) return;
  const y = enemy.y;
  enemy.y = clamp(y-requested,8,ARENA.fenceY-enemy.radius);
  enemy.attacking = false;
  enemy.blockedByFieldId = null;
  emit(state,'knockback',{targetId:enemy.id,x:enemy.x,y,distance:y-enemy.y});
}

function impact(state,projectile,enemy,type) {
  const {effects,sourceId,towerType} = projectile;
  let amount = impactDamage(projectile,enemy), reaction;
  const active = (enemy.statuses || []).filter(s=>s.remaining>0);
  if (effects?.thermalShock && active.some(s=>s.type==='burn' || s.type==='slow')) {
    amount *= 1 + effects.thermalShock;
    reaction = 'steam';
  }
  const stacks = active.find(s=>s.type==='poison')?.stacks || 0;
  if (effects?.poisonDetonate && stacks) {
    amount *= 1 + effects.poisonDetonate*stacks;
    reaction = 'catalyst';
  }
  const bonuses = state.systems?.integration?.bonuses;
  if ((bonuses?.statusDamage || 0) > 0 && active.some(s => s.type === 'burn' || s.type === 'slow' || s.type === 'brittle' || s.type === 'poison')) {
    amount *= 1 + bonuses.statusDamage;
  }
  const isCrit = type !== 'splash' && !!projectile.crit;
  if (isCrit && (bonuses?.shredPercent || 0) > 0 && Number.isFinite(enemy.maxHp) && enemy.maxHp > 0) {
    amount += Math.min(enemy.kind === 'boss' ? 180 : 120, enemy.maxHp * bonuses.shredPercent);
  }
  if (effects?.corpseExplode) enemy.corpseExplode = {...effects.corpseExplode,sourceId,poison:effects.poison};
  damageEnemy(state,enemy,amount,{sourceId,towerType,type,armorPen:effects?.armorPen,reaction,
    crit:isCrit,execute:executeApplies(projectile,enemy)});
  applyPayload(enemy,projectile);
  if (reaction==='steam' && isLiving(enemy)) applyStatus(enemy,{type:'brittle',power:0.2,remaining:2.6,sourceId});
  const push = (effects?.knockback || 0) + (projectile.crit && enemy.kind!=='boss' ? effects?.critKnockback || 0 : 0);
  pushEnemy(state,enemy,push*(enemy.kind==='boss'?0.2:1));
}

const MAX_CLOUDS = 24;
function addCloud(state, cloud) {
  if (!Array.isArray(state.clouds)) state.clouds = [];
  if (state.clouds.length >= MAX_CLOUDS) state.clouds.shift();
  state.clouds.push(cloud);
  emit(state, 'cloud_spawn', {id: cloud.id, kind: cloud.kind, x: cloud.x, y: cloud.y, radius: cloud.radius, duration: cloud.duration});
}
function spawnCloud(state,projectile,enemy) {
  const spec = projectile.effects?.cloud;
  if (!spec) return;
  addCloud(state, {...spec, id: uid(state, 'c'), kind: projectile.towerType || 'fire', sourceId: projectile.sourceId || 'u1',
    x: clamp(enemy.x, 12, ARENA.width - 12), y: clamp(enemy.y, 12, ARENA.fenceY - 6), remaining: spec.duration, tickTimer: 0});
}
function updateClouds(state,dt) {
  if (!state.clouds?.length) return;
  for (const cloud of state.clouds) {
    cloud.tickTimer += Math.min(dt,cloud.remaining);
    cloud.remaining -= dt;
    while (cloud.tickTimer + 1e-9 >= cloud.tick) {
      cloud.tickTimer -= cloud.tick;
      for (const enemy of state.enemies) {
        if (!isLiving(enemy) || distance(enemy,cloud)>cloud.radius) continue;
        damageEnemy(state,enemy,cloud.dps*cloud.tick,{sourceId:cloud.sourceId,towerType:cloud.kind,type:'cloud'});
        applyPayload(enemy,{sourceId:cloud.sourceId,effects:cloud});
      }
    }
  }
  state.clouds = state.clouds.filter(cloud=>cloud.remaining>1e-9);
}

function applySplash(state, projectile, primary) {
  const radius = projectile.splash;
  if (!(radius > 0)) return;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || enemy.id === primary.id) continue;
    if (distance(primary, enemy) > radius) continue;
    impact(state,projectile,enemy,'splash');
  }
}

function spawnSplitShrapnel(state, projectile, point, hitEnemyId) {
  const count = Math.min(7, Math.floor(finite(projectile.effects?.split, 0)));
  if (count <= 0 || projectile.isSplitChild) return;
  const subDmg = Math.max(2, finite(projectile.damage, 0) * 0.58);
  const spreadStep = count > 1 ? (Math.PI * 0.62) / (count - 1) : 0;
  const baseAngle = Math.atan2(projectile.diry || -1, projectile.dirx || 0) - (spreadStep * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + spreadStep * i;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    state.projectiles.push({
      id: uid(state, 'p'),
      sourceId: projectile.sourceId,
      targetId: null,
      x: clamp(point.x + dx * 8, -40, ARENA.width + 40),
      y: clamp(point.y + dy * 8, -40, ARENA.fenceY + 20),
      speed: 620,
      damage: subDmg,
      crit: projectile.crit,
      critMultiplier: projectile.critMultiplier,
      critChance: 0,
      tags: ['hero', 'split', 'pierce'],
      splash: 0,
      chain: 0,
      chainRange: 70,
      pierce: 1,
      visited: [hitEnemyId],
      life: 0.72,
      dirx: dx,
      diry: dy,
      aimx: null,
      aimy: null,
      towerType: 'hero',
      rank: projectile.rank || 1,
      effects: {armorPen: projectile.effects?.armorPen || 0},
      mechanics: [],
      impactType: null,
      isSplitChild: true
    });
  }
  emit(state, 'bullet_split', {x: point.x, y: point.y, count});
}

function rollChainCrit(state, projectile) {
  const chance = finite(projectile.critChance, 0);
  if (!(chance > 0)) return;
  projectile.crit = random(state) < chance;
}

function resolveHit(state, projectile, enemy) {
  // Chain impacts only. Pierce and the opening hit keep the fired roll, and
  // this call sits before splash so that splash still uses the crit of the
  // hit that caused it.
  if (projectile.impactType === 'chain') rollChainCrit(state, projectile);
  if (!projectile.visited.includes(enemy.id)) projectile.visited.push(enemy.id);
  const attack = projectile.impactType || 'projectile';
  // Secondary effects originate at the contact point even when it pushes its victim.
  const point = {id:enemy.id,x:enemy.x,y:enemy.y};
  impact(state,projectile,enemy,attack);
  if (projectile.effects?.revealRadius) {
    for (const other of state.enemies) if (distance(other,point)<=projectile.effects.revealRadius) {
      other.revealed = true;
      other.revealTimer = 1.2;
    }
  }
  spawnCloud(state,projectile,point);
  if (!projectile.isSplitChild && projectile.towerType === 'hero' && (projectile.effects?.shrapnelRank || 0) >= 2 && attack === 'projectile') {
    const sr = projectile.effects.shrapnelRank;
    addCloud(state, {
      id: uid(state, 'c'), kind: 'shrapnel', sourceId: projectile.sourceId || 'u1',
      x: clamp(point.x, 12, ARENA.width - 12), y: clamp(point.y, 12, ARENA.fenceY - 8),
      radius: 30 + 6 * sr, duration: 2.0, remaining: 2.0, tick: 0.45, tickTimer: 0,
      dps: 5 * sr, burn: {dps: 4 * sr, duration: 2.0}
    });
  }
  applySplash(state, projectile, point);
  if (!projectile.isSplitChild && attack === 'projectile' && (projectile.effects?.split || 0) > 0) {
    spawnSplitShrapnel(state, projectile, point, enemy.id);
  }

  if (Math.floor(finite(projectile.pierce, 0)) > 0) {
    projectile.pierce = Math.max(0, Math.floor(projectile.pierce) - 1);
    projectile.impactType = 'pierce';
    projectile.targetId = null;
    projectile.aimx = null;
    projectile.aimy = null;
    const nudge = (finite(enemy.radius, 12)) + HIT_SLOP + 4;
    projectile.x += (projectile.dirx || 0) * nudge;
    projectile.y += (projectile.diry || -1) * nudge;
    return true;
  }

  if (Math.floor(finite(projectile.chain, 0)) > 0) {
    const next = nearestEnemy(state, enemy, finite(projectile.chainRange, DEFAULT_CHAIN_RANGE), projectile.visited);
    if (next) {
      projectile.chain = Math.max(0, Math.floor(projectile.chain) - 1);
      projectile.impactType = 'chain';
      projectile.targetId = next.id;
      projectile.aimx = next.x;
      projectile.aimy = next.y;
      projectile.x = enemy.x;
      projectile.y = enemy.y;
      pointDirection(projectile, next);
      return true;
    }
  }
  return false;
}

function aimProjectile(state, projectile) {
  const target = enemyById(state, projectile.targetId);
  if (target) {
    projectile.aimx = target.x;
    projectile.aimy = target.y;
    if (!pointDirection(projectile, target)) {
      if (!Number.isFinite(projectile.dirx) || !Number.isFinite(projectile.diry)) {
        projectile.dirx = 0;
        projectile.diry = -1;
      }
    }
    return true;
  }
  if (projectile.targetId && (projectile.chain > 0 || projectile.pierce > 0)) {
    const seek = projectile.chain > 0 ? finite(projectile.chainRange, DEFAULT_CHAIN_RANGE) : 160;
    const next = nearestEnemy(state, projectile, seek, projectile.visited);
    if (next) {
      projectile.targetId = next.id;
      projectile.aimx = next.x;
      projectile.aimy = next.y;
      pointDirection(projectile, next);
      return true;
    }
    projectile.targetId = null;
  } else if (projectile.targetId) {
    projectile.targetId = null;
  }
  if (Number.isFinite(projectile.aimx) && Number.isFinite(projectile.aimy)) {
    const dx = projectile.aimx - projectile.x;
    const dy = projectile.aimy - projectile.y;
    const len = Math.hypot(dx, dy);
    if (len <= 4) return false;
    projectile.dirx = dx / len;
    projectile.diry = dy / len;
    return true;
  }
  if (!Number.isFinite(projectile.dirx) || !Number.isFinite(projectile.diry)) return false;
  if (projectile.dirx === 0 && projectile.diry === 0) return false;
  return true;
}

function advanceProjectile(state, projectile, dt) {
  if (!Number.isFinite(projectile.life)) projectile.life = 3;
  projectile.life -= dt;
  if (projectile.life <= 0) return false;
  if (!Array.isArray(projectile.visited)) projectile.visited = [];
  let budget = Math.max(0, finite(projectile.speed, DEFAULT_PROJECTILE_SPEED)) * dt;
  const hopLimit = 6 + Math.max(0, Math.floor(finite(projectile.pierce, 0))) + Math.max(0, Math.floor(finite(projectile.chain, 0)));
  let hops = 0;
  while (budget > 0.2 && hops++ < hopLimit) {
    if (!aimProjectile(state, projectile)) return false;
    const x1 = projectile.x;
    const y1 = projectile.y;
    const x2 = x1 + projectile.dirx * budget;
    const y2 = y1 + projectile.diry * budget;
    const hit = firstHit(state, projectile, x1, y1, x2, y2);
    if (!hit) {
      projectile.x = x2;
      projectile.y = y2;
      budget = 0;
      break;
    }
    const traveled = Math.max(0, hit.t) * Math.hypot(x2 - x1, y2 - y1);
    projectile.x = hit.x;
    projectile.y = hit.y;
    budget = Math.max(0, budget - traveled);
    const keep = resolveHit(state, projectile, hit.enemy);
    if (!keep) return false;
    if (traveled < 0.01 && projectile.impactType !== 'chain') {
      projectile.x += (projectile.dirx || 0) * 8;
      projectile.y += (projectile.diry || -1) * 8;
      budget = Math.max(0, budget - 8);
    }
  }
  if (projectile.y < -120 || projectile.y > ARENA.height + 80) return false;
  if (projectile.x < -100 || projectile.x > ARENA.width + 100) return false;
  return projectile.life > 0;
}

function updateProjectiles(state, dt) {
  const next = [];
  for (const projectile of state.projectiles) {
    if (!projectile || !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) continue;
    const keep = projectile.team === 'enemy' || projectile.friendly === false
      ? advanceEnemyShot(state, projectile, dt)
      : advanceProjectile(state, projectile, dt);
    if (keep) next.push(projectile);
  }
  state.projectiles = next;
}

function buildEffects(stats) {
  const effects = {};
  if (stats.burn && Number.isFinite(stats.burn.dps) && Number.isFinite(stats.burn.duration)) {
    effects.burn = {dps: stats.burn.dps, duration: Math.max(0, stats.burn.duration)};
  }
  if (stats.slow && Number.isFinite(stats.slow.factor) && Number.isFinite(stats.slow.duration)) {
    effects.slow = {factor: clamp(stats.slow.factor, 0.05, 1), duration: Math.max(0, stats.slow.duration)};
  }
  if (stats.poison && Number.isFinite(stats.poison.dps) && Number.isFinite(stats.poison.duration)) {
    effects.poison = {
      dps: stats.poison.dps,
      duration: Math.max(0, stats.poison.duration)
    };
    if (Number.isFinite(stats.poison.maxStacks)) {
      effects.poison.maxStacks = Math.max(1, Math.floor(stats.poison.maxStacks));
    }
  }
  if (stats.brittle && Number.isFinite(stats.brittle.power) && Number.isFinite(stats.brittle.duration)) {
    effects.brittle = {
      power: clamp(stats.brittle.power, 0, BRITTLE_CAP),
      duration: Math.max(0, stats.brittle.duration)
    };
  }
  if (stats.stun && Number.isFinite(stats.stun.duration)) {
    effects.stun = {duration: Math.max(0, stats.stun.duration)};
  }
  for (const key of ['armorPen','knockback','critKnockback','cloud','corpseExplode','thermalShock','poisonDetonate','revealRadius','split','shrapnelRank','frostbiteRank']) {
    if (stats[key]) effects[key] = stats[key];
  }
  return effects;
}

function buildTags(unit, stats, mechanics) {
  const tags = [];
  if (unit.type) tags.push(unit.type);
  if (unit.kind) tags.push(unit.kind);
  if (effectsPresent(stats.burn)) tags.push('burn');
  if (effectsPresent(stats.slow)) tags.push('slow');
  if (effectsPresent(stats.poison)) tags.push('poison');
  if (finite(stats.splash, 0) > 0) tags.push('splash');
  if (finite(stats.chain, 0) > 0) tags.push('chain');
  if (finite(stats.pierce, 0) > 0) tags.push('pierce');
  for (const mechanic of mechanics) tags.push(mechanic);
  return tags;
}

function effectsPresent(effect) {
  return !!(effect && typeof effect === 'object');
}

function mechanicList(stats) {
  if (!Array.isArray(stats.mechanics)) return [];
  const list = [];
  for (const entry of stats.mechanics) {
    if (typeof entry === 'string' && entry) list.push(entry);
  }
  return list;
}

function scaledInterval(stats, hasteBonus) {
  const haste = clamp(finite(hasteBonus, 0), 0, AURA_HASTE_CAP);
  return Math.max(MIN_ATTACK_INTERVAL, finite(stats.interval, 1) / (1 + haste));
}

function makeProjectile(state, unit, slot, stats, target, rolled, mechanics) {
  const range = finite(stats.range, 0);
  const speed = clamp(finite(stats.projectileSpeed, DEFAULT_PROJECTILE_SPEED), 40, 2400);
  const chain = Math.max(0, Math.floor(finite(stats.chain, 0)));
  const projectile = {
    id: uid(state, 'p'),
    sourceId: unit.id,
    targetId: target.id,
    x: slot.x,
    y: slot.y,
    speed,
    damage: rolled.damage,
    crit: rolled.crit,
    critMultiplier: chain > 0 && rolled.critChance > 0 ? rolled.baseCritMultiplier : rolled.critMultiplier,
    critChance: rolled.critChance,
    tags: buildTags(unit, stats, mechanics),
    splash: Math.max(0, finite(stats.splash, 0)),
    chain,
    chainRange: chain > 0
      ? (Number.isFinite(stats.chainRange) && stats.chainRange > 0 ? stats.chainRange : DEFAULT_CHAIN_RANGE)
      : finite(stats.chainRange, DEFAULT_CHAIN_RANGE),
    pierce: Math.max(0, Math.floor(finite(stats.pierce, 0))),
    visited: [],
    life: Math.max(3, range / speed + 1.25),
    dirx: 0,
    diry: -1,
    aimx: target.x,
    aimy: target.y,
    towerType: unit.type || null,
    rank: finite(unit.rank, 1),
    effects: buildEffects(stats),
    mechanics: mechanics.slice(),
    impactType: null
  };
  if (rolled.crit) projectile.tags.push('crit');
  pointDirection(projectile, target);
  return projectile;
}

function rollShot(state, stats, bonus) {
  const damage = Math.max(0, finite(stats.damage, 0) * (1 + clamp(finite(bonus?.damage, 0), 0, AURA_DAMAGE_CAP)));
  const critChance = clamp(finite(stats.critChance, 0), 0, 1);
  const critMultiplier = Math.max(1, finite(stats.critMultiplier, DEFAULT_CRIT_MULTIPLIER));
  let crit = false;
  if (damage > 0 && critChance > 0) crit = random(state) < critChance;
  return {
    damage,
    crit,
    critChance,
    critMultiplier: crit ? critMultiplier : 1,
    baseCritMultiplier: critMultiplier
  };
}

function fireUnit(state, unit, slot, stats, bonus) {
  const range = finite(stats.range, 0);
  if (!(range > 0)) return false;
  const origin = {x: slot.x, y: slot.y};
  const selected = [];
  const mechanics = mechanicList(stats);
  const extras = stats.multishot || (mechanics.includes('multishot') ? 1 : 0);
  for (let i=0; i<=extras; i++) {
    const target = selectTarget(state,origin,range,unit.targeting,selected);
    if (!target) break;
    selected.push(target.id);
    const rolled = rollShot(state,stats,bonus);
    if (!rolled.damage) return false;
    const shot = makeProjectile(state,unit,slot,stats,target,rolled,mechanics);
    if (i) shot.tags.push('echo');
    if (stats.stun?.chance && random(state)>=stats.stun.chance) {
      delete shot.effects.stun;
      shot.mechanics = shot.mechanics.filter(m=>m!=='stun');
    }
    state.projectiles.push(shot);
    emit(state,'shot',{sourceId:unit.id,targetId:target.id,x:slot.x,y:slot.y,targetX:target.x,targetY:target.y,
      damage:rolled.damage*rolled.critMultiplier,crit:rolled.crit,towerType:unit.type,multishot:i>0,
      pierce:shot.pierce,chain:shot.chain,splash:shot.splash});
  }
  if (!selected.length) return false;
  unit.cooldown = finite(unit.cooldown, 0) + scaledInterval(stats, bonus?.haste);
  return true;
}

function computeAura(roster) {
  const bonus = {};
  for (const entry of roster) bonus[entry.unit.id] = {damage: 0, haste: 0};
  for (const source of roster) {
    const aura = source.stats.aura;
    if (!aura || !(aura.range > 0)) continue;
    const addDamage = Math.max(0, finite(aura.damage, 0));
    const addHaste = Math.max(0, finite(aura.haste, 0));
    if (addDamage === 0 && addHaste === 0) continue;
    for (const target of roster) {
      if (distance(source.slot, target.slot) <= aura.range) {
        bonus[target.unit.id].damage += addDamage;
        bonus[target.unit.id].haste += addHaste;
      }
    }
  }
  for (const id of Object.keys(bonus)) {
    bonus[id].damage = clamp(bonus[id].damage, 0, AURA_DAMAGE_CAP);
    bonus[id].haste = clamp(bonus[id].haste, 0, AURA_HASTE_CAP);
  }
  return bonus;
}

function defenderRecharge(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return 1;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || !(enemy.hushFactor > 0) || isStunned(enemy)) continue;
    if (!chargeContact(enemy)) continue;
    return Math.max(0.5, Math.min(1, enemy.hushFactor));
  }
  return 1;
}

function updateDefenders(state, dt, roster, aura) {
  const shotCap = Math.max(1, Math.min(30, Math.ceil(dt / MIN_ATTACK_INTERVAL) + 1));
  const recharge = defenderRecharge(state);
  for (const entry of roster) {
    const {unit, slot, stats} = entry;
    unit.cooldown = finite(unit.cooldown, 0) - dt * recharge;
    if (!(finite(stats.damage, 0) > 0) || !(finite(stats.range, 0) > 0)) {
      if (unit.cooldown < 0) unit.cooldown = 0;
      continue;
    }
    let shots = 0;
    while (unit.cooldown <= 1e-9 && shots++ < shotCap) {
      const before = unit.cooldown;
      const fired = fireUnit(state, unit, slot, stats, aura[unit.id]);
      if (!fired) {
        unit.cooldown = 0;
        break;
      }
      if (unit.cooldown <= before) {
        unit.cooldown = MIN_ATTACK_INTERVAL;
        break;
      }
    }
  }
}

function fenceReach(enemy) {
  if (Number.isFinite(enemy.attackRange) && enemy.attackRange > 0) return enemy.attackRange;
  return Math.max(0, finite(enemy.radius, 12));
}

function triggerFenceSurge(state) {
  const surge = state.surge;
  surge.charges--;
  surge.shieldTimer = 3;
  surge.cooldown = 10;
  const level = state.slots.find((s) => s.unit?.kind === 'hero')?.unit.upgrades.bastion || 0;
  const power = 1 + level * 0.4 + (state.systems.integration?.bonuses?.surgePower || 0);
  emit(state, 'fence_surge', {y: ARENA.fenceY, reach: 240, chargesLeft: surge.charges, shieldDuration: 3});
  for (const e of state.enemies) {
    if (!isLiving(e) || e.y < ARENA.fenceY - 240) continue;
    const boss = e.kind === 'boss';
    const lethal = !boss && (e.kind === 'swarm' || e.hp / e.maxHp <= 0.18);
    if (lethal) { killEnemy(state, e, null); continue; }
    damageEnemy(state, e, boss ? Math.min(450, e.maxHp * 0.08) : 110 * power, {type: 'surge', armorPen: 1});
    if (!isLiving(e)) continue;
    pushEnemy(state, e, boss ? 45 : 150 * (1 + 0.35 * level));
    const stunScale = statusDurationScale(e, 'stun');
    if (stunScale > 0) applyStatus(e, {type: 'stun', remaining: boss ? 0.5 / stunScale : 1.6, sourceId: 'fence'});
    e.chargeLit = false;
    e.chargeTimer = 0;
  }
}

function biteFence(state, amount, x, sourceId, enemyKind, attacker = null) {
  const fence = state.fence;
  if (!fence || !(fence.hp > 0) || !(amount > 0) || !Number.isFinite(amount)) return 0;
  if (state.surge.shieldTimer > 0) return 0;
  if ((state.wallImmunity || 0) > 0) {
    state.wallImmunity = Math.max(0, Math.floor(state.wallImmunity) - 1);
    emitEvent(state, 'wall_immune', {x: Number.isFinite(x) ? x : ARENA.width / 2, y: ARENA.fenceY, remaining: state.wallImmunity});
    for (const e of state.enemies) {
      if (!isLiving(e) || e.y < ARENA.fenceY - 120) continue;
      pushEnemy(state, e, e.kind === 'boss' ? 18 : 64);
    }
    return 0;
  }
  const previous = fence.hp;
  const applied = Math.min(fence.hp, amount);
  const maxHp = Number.isFinite(fence.maxHp) ? fence.maxHp : fence.hp;
  fence.hp = clamp(fence.hp - amount, 0, Math.max(0, maxHp));
  const stats = ensureStats(state);
  stats.fenceDamage = finite(stats.fenceDamage, 0) + applied;
  const maxAfter = Number.isFinite(fence.maxHp) && fence.maxHp > 0 ? fence.maxHp : Math.max(0, maxHp);
  const ratio = maxAfter > 0 ? clamp(fence.hp / maxAfter, 0, 1) : 0;
  emitEvent(state, 'fence_hit', {
    sourceId: sourceId || null,
    x,
    y: ARENA.fenceY,
    damage: applied,
    enemyKind: enemyKind || null,
    ratio
  });
  const thorns = finite(state.systems?.integration?.bonuses?.thorns, 0);
  if (thorns > 0 && attacker && isLiving(attacker)) {
    damageEnemy(state, attacker, thorns, {type: 'thorns', sourceId: 'fence'});
  }
  const surge = state.surge;
  if (surge.charges > 0 && surge.cooldown <= 0) {
    const threshold = [0.5, 0.2].find((t) => previous > maxHp * t && fence.hp <= maxHp * t && !surge.thresholdsUsed.includes(t));
    if (threshold || fence.hp <= 0) {
      if (threshold) surge.thresholdsUsed.push(threshold);
      if (fence.hp <= 0) fence.hp = Math.max(1, Math.round(maxHp * 0.12));
      triggerFenceSurge(state);
    }
  }
  return applied;
}

function advanceEnemyShot(state, projectile, dt) {
  if (!Number.isFinite(projectile.life)) projectile.life = 3;
  projectile.life -= dt;
  if (projectile.life <= 0) return false;
  let dirx = finite(projectile.dirx, 0);
  let diry = finite(projectile.diry, 1);
  const len = Math.hypot(dirx, diry) || 1;
  dirx /= len;
  diry /= len;
  const speed = Math.max(0, finite(projectile.speed, 180));
  const y1 = projectile.y;
  projectile.x += dirx * speed * dt;
  projectile.y += diry * speed * dt;
  const reachedFence = y1 >= ARENA.fenceY || (y1 < ARENA.fenceY && projectile.y >= ARENA.fenceY);
  if (reachedFence) {
    biteFence(state, finite(projectile.damage, 0), projectile.x, projectile.sourceId, projectile.enemyKind || null);
    return false;
  }
  if (projectile.y < -120 || projectile.x < -80 || projectile.x > ARENA.width + 80) return false;
  return true;
}

function ensureMendFields(state, enemy) {
  if (Number.isFinite(enemy.mendAmount)) return;
  const mend = ENEMIES[enemy.kind] && ENEMIES[enemy.kind].mend;
  if (!mend || typeof mend !== 'object') return;
  if (Number.isFinite(mend.every)) enemy.mendEvery = mend.every;
  if (Number.isFinite(mend.amount)) enemy.mendAmount = mend.amount * difficultyHealth(state);
  if (Number.isFinite(mend.range)) enemy.mendRange = mend.range;
}

function mendTarget(state, source) {
  const range = source.mendRange;
  if (!Number.isFinite(range) || !(range > 0)) return null;
  let best = null;
  let bestRatio = Infinity;
  const enemies = state.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy === source) continue;
    if (enemy.id != null && source.id != null && enemy.id === source.id) continue;
    if (!Number.isFinite(enemy.maxHp) || !(enemy.maxHp > 0)) continue;
    if (!(enemy.hp < enemy.maxHp)) continue;
    if (distance(source, enemy) > range) continue;
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = enemy;
    }
  }
  return best;
}

function updateMenders(state, dt) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy)) continue;
    ensureMendFields(state, enemy);
    if (!(enemy.mendEvery > 0)) continue;
    if (!Number.isFinite(enemy.mendClock)) enemy.mendClock = enemy.mendEvery;
    if (isStunned(enemy)) continue;
    enemy.mendClock -= dt;
    if (enemy.mendClock > 0) continue;
    enemy.mendClock = enemy.mendEvery;
    const target = mendTarget(state, enemy);
    if (!target) continue;
    const missing = target.maxHp - target.hp;
    const amount = Math.min(missing, enemy.mendAmount);
    if (!Number.isFinite(amount) || !(amount > 0)) continue;
    target.hp += amount;
    if (target.hp > target.maxHp) target.hp = target.maxHp;
    emitEvent(state, 'mend', {
      x: target.x,
      y: target.y,
      targetId: target.id,
      amount
    });
  }
}

function chargeContact(enemy) {
  const radius = Number.isFinite(enemy.radius) && enemy.radius > 0 ? enemy.radius : 12;
  return enemy.y >= ARENA.fenceY - radius - CONTACT_SLOP;
}

function updateCharges(state, dt) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy.chargeSpent === true) continue;
    if (!(enemy.chargeWindup > 0) || !(enemy.chargeDamage > 0)) continue;
    if (!chargeContact(enemy) || isStunned(enemy)) continue;
    if (enemy.chargeLit !== true) {
      enemy.chargeLit = true;
      enemy.chargeTimer = enemy.chargeWindup;
      continue;
    }
    enemy.chargeTimer = finite(enemy.chargeTimer, enemy.chargeWindup) - dt;
    if (enemy.chargeTimer > 0) continue;
    enemy.chargeTimer = 0;
    enemy.chargeSpent = true;
    biteFence(state, enemy.chargeDamage, enemy.x, enemy.id, enemy.kind || null);
    killEnemy(state, enemy, null);
  }
}

function updateFenceAttacks(state, dt) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.hp)) return;
  for (const enemy of state.enemies) {
    if (!enemy || enemy.dead) continue;
    if (enemy.chargeLit === true) {
      enemy.attacking = true;
      continue;
    }
    const inRange = enemy.y >= ARENA.fenceY - fenceReach(enemy) - CONTACT_SLOP;
    if (!inRange || isStunned(enemy)) {
      enemy.attacking = false;
      continue;
    }
    enemy.attacking = true;
    if (!(enemy.damage > 0) || fence.hp <= 0) continue;
    const interval = Math.max(0.05, finite(enemy.attackInterval, 1));
    enemy.attackCooldown = finite(enemy.attackCooldown, 0) - dt;
    const hitCap = Math.max(1, Math.min(40, Math.ceil(dt / interval) + 1));
    let hits = 0;
    while (enemy.attackCooldown <= 1e-9 && fence.hp > 0 && hits++ < hitCap) {
      if (enemy.projectileSpeed && enemy.attackRange) {
        emit(state, 'shot', {
          sourceId: enemy.id, targetId: 'fence', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: ARENA.fenceY,
          damage: enemy.damage, crit: false, towerType: enemy.kind, team: 'enemy'
        });
        state.projectiles.push({
          id: uid(state, 'p'), team: 'enemy', sourceId: enemy.id, targetId: null, enemyKind: enemy.kind,
          x: enemy.x, y: enemy.y, speed: enemy.projectileSpeed, damage: enemy.damage, crit: false, tags: ['acid'],
          dirx: 0, diry: 1, chainRange: 70, life: 3, visited: [], pierce: 0, chain: 0, splash: 0
        });
      } else {
        biteFence(state, enemy.damage, enemy.x, enemy.id, enemy.kind || null, enemy);
      }
      enemy.attackCooldown += interval;
    }
  }
}

function removeDead(state) {
  if (state.enemies.some(enemy => enemy?.dead)) {
    state.enemies = state.enemies.filter(enemy => enemy && !enemy.dead);
  }
}

function wardTarget(state, source) {
  const range = source.wardRange;
  if (!(range > 0)) return null;
  const enemies = state.enemies;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isLiving(enemy) || enemy === source) continue;
    if (enemy.id != null && source.id != null && enemy.id === source.id) continue;
    const dist = distance(source, enemy);
    if (!(dist <= range)) continue;
    if (!best || dist < bestDistance - 1e-4 || (Math.abs(dist - bestDistance) <= 1e-4 && String(enemy.id) < String(best.id))) {
      best = enemy;
      bestDistance = dist;
    }
  }
  return best;
}

function updateWards(state) {
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy) enemy.wardShield = 0;
  }
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    if (!isLiving(source) || isStunned(source)) continue;
    if (!(source.wardRange > 0) || !(source.wardReduction > 0)) continue;
    const target = wardTarget(state, source);
    if (!target) continue;
    target.wardShield = Math.min(WARD_CAP, Math.max(target.wardShield, Math.min(WARD_CAP, source.wardReduction)));
  }
}

/**
 * Acquire targets by true distance from each defender's slot center, step
 * projectiles without tunneling, let menders heal, then let living enemies
 * bite the shared fence. Phased enemies are not shot, but they still bite.
 * A warden's shield is applied before shots. It never covers the warden.
 * Does not modify state.time, state.tick, or state.speed.
 */
// Derived statistics are shared across fixed steps; the serialized state remains authoritative.
const combatStatsCache=new WeakMap();
function combatStats(unit,state) {
  const levels=unit.kind==='hero'?Object.values(unit.upgrades).join(',')+Object.keys(unit.upgrades).join(','):'';
  const bonuses=state.systems?.integration?.bonuses || state.profileSnapshot;
  const cached=combatStatsCache.get(unit);
  if (cached && cached.rank===unit.rank && cached.type===unit.type && cached.levels===levels && cached.bonuses===bonuses) return cached.stats;
  const stats=getUnitStats(unit,state);
  combatStatsCache.set(unit,{rank:unit.rank,type:unit.type,levels,bonuses,stats});
  return stats;
}
const SW_BASE_CD = Object.freeze({
  napalm: [7.8, 5.8, 4.2, 2.9],
  armored_car: [9.5, 7.2, 5.2, 3.6],
  cryo_barrage: [8.0, 6.0, 4.3, 3.0],
  orbital_beam: [8.5, 6.4, 4.6, 3.2],
  ricochet: [7.6, 5.6, 4.1, 2.8],
});

function superweaponCooldown(id, rank, haste = 0) {
  const table = SW_BASE_CD[id];
  if (!table) return 8;
  const idx = clamp(Math.floor(rank || 1) - 1, 0, table.length - 1);
  return table[idx] / (1 + Math.max(0, finite(haste, 0)));
}

function ensureArsenal(state) {
  if (!state.arsenal || typeof state.arsenal !== 'object') {
    state.arsenal = {
      timers: {napalm: 1.6, armored_car: 2.4, cryo_barrage: 2.0, orbital_beam: 2.6, ricochet: 2.2},
      sweepers: [],
      beams: [],
    };
  }
  if (!state.arsenal.timers || typeof state.arsenal.timers !== 'object') {
    state.arsenal.timers = {napalm: 1.6, armored_car: 2.4, cryo_barrage: 2.0, orbital_beam: 2.6, ricochet: 2.2};
  }
  if (!Array.isArray(state.arsenal.sweepers)) state.arsenal.sweepers = [];
  if (!Array.isArray(state.arsenal.beams)) state.arsenal.beams = [];
  return state.arsenal;
}

function densestEnemy(state, minY = 30, ignoreId = null) {
  let best = null;
  let bestScore = -1;
  for (const e of state.enemies) {
    if (!isTargetable(e) || e.y < minY || (ignoreId && e.id === ignoreId)) continue;
    let score = 1;
    for (const o of state.enemies) {
      if (!isTargetable(o) || o.id === e.id) continue;
      if (distance(e, o) <= 74) score += 1;
    }
    score += e.y / 640;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function densestLaneX(state, excludeX = null) {
  const lanes = [54, 117, 180, 243, 306];
  let bestX = 180;
  let bestScore = 0;
  for (const lx of lanes) {
    if (excludeX != null && Math.abs(lx - excludeX) < 40) continue;
    let score = 0;
    for (const e of state.enemies) {
      if (!isLiving(e) || e.y < 16) continue;
      if (Math.abs(e.x - lx) <= 42) score += 1 + (e.y / 520);
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = lx;
    }
  }
  return bestScore > 0 ? bestX : null;
}

function priorityColumnTarget(state, excludeX = null) {
  let best = null;
  let bestScore = -1;
  for (const e of state.enemies) {
    if (!isTargetable(e) || e.y < 24) continue;
    if (excludeX != null && Math.abs(e.x - excludeX) < 38) continue;
    const score = (e.kind === 'boss' ? 5000 : 0) + (ENEMIES[e.kind]?.priority ? 800 : 0) + finite(e.hp, 0) + e.y * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function updateSuperweapons(state, dt, heroEntry) {
  const hero = heroEntry?.unit;
  const upgrades = hero?.upgrades || {};
  const napalmRank = Math.floor(finite(upgrades.napalm, 0));
  const carRank = Math.floor(finite(upgrades.armored_car, 0));
  const cryoRank = Math.floor(finite(upgrades.cryo_barrage, 0));
  const beamRank = Math.floor(finite(upgrades.orbital_beam, 0));
  const emRank = Math.floor(finite(upgrades.ricochet, 0));
  const existingSweepers = state.arsenal?.sweepers?.length || 0;
  const existingBeams = state.arsenal?.beams?.length || 0;
  if (!napalmRank && !carRank && !cryoRank && !beamRank && !emRank && !existingSweepers && !existingBeams) return;

  const arsenal = ensureArsenal(state);
  const haste = finite(state.systems?.integration?.bonuses?.superweaponHaste, 0);
  const recharge = defenderRecharge(state);
  const heroDmg = Math.max(12, finite(heroEntry?.stats?.damage, 14));
  const heroId = hero?.id || 'u1';
  const heroSlot = heroEntry?.slot || {x: ARENA.width / 2, y: ARENA.frontY};

  // Step active Armored Sweeper trucks rolling up the field
  const keptSweepers = [];
  for (const sw of arsenal.sweepers) {
    sw.y -= sw.speed * dt;
    if (!Array.isArray(sw.hitIds)) sw.hitIds = [];
    for (const enemy of state.enemies) {
      if (!isLiving(enemy) || sw.hitIds.includes(enemy.id)) continue;
      const rad = finite(enemy.radius, 12);
      if (Math.abs(enemy.x - sw.x) <= sw.halfWidth + rad && Math.abs(enemy.y - sw.y) <= 24 + rad) {
        sw.hitIds.push(enemy.id);
        damageEnemy(state, enemy, sw.damage, {sourceId: heroId, towerType: 'armored_car', type: 'armored_car', crit: true, armorPen: 0.45});
        if (isLiving(enemy)) {
          pushEnemy(state, enemy, enemy.kind === 'boss' ? 24 : sw.knockback);
          if (enemy.kind !== 'boss') applyStatus(enemy, {type: 'stun', power: 1, remaining: 0.85, sourceId: heroId});
        }
      }
    }
    if (sw.y > -32) keptSweepers.push(sw);
  }
  arsenal.sweepers = keptSweepers;

  // Step active Orbital Laser Beam visuals
  for (const beam of arsenal.beams) beam.life -= dt;
  arsenal.beams = arsenal.beams.filter(b => b.life > 1e-6);

  // 1. Napalm Airstrike (Fire Sea — Lv.4 drops twin fire-sea bombs!)
  if (napalmRank > 0) {
    arsenal.timers.napalm = finite(arsenal.timers.napalm, 1.6) - dt * recharge;
    if (arsenal.timers.napalm <= 1e-9) {
      const target = densestEnemy(state, 40);
      if (target) {
        arsenal.timers.napalm = superweaponCooldown('napalm', napalmRank, haste);
        const dropTargets = [target];
        if (napalmRank >= 4) {
          const second = densestEnemy(state, 40, target.id);
          if (second && distance(second, target) > 48) dropTargets.push(second);
        }
        const blastRadius = 60 + 12 * napalmRank;
        const blastDmg = heroDmg * (2.2 + 0.95 * napalmRank);
        for (const drop of dropTargets) {
          const cx = clamp(drop.x, 26, ARENA.width - 26);
          const cy = clamp(drop.y, 44, ARENA.fenceY - 22);
          emitEvent(state, 'napalm_blast', {x: cx, y: cy, radius: blastRadius, damage: blastDmg, rank: napalmRank});
          for (const e of state.enemies) {
            if (!isLiving(e) || distance(e, {x: cx, y: cy}) > blastRadius) continue;
            damageEnemy(state, e, blastDmg, {sourceId: heroId, towerType: 'napalm', type: 'napalm_blast', crit: napalmRank >= 2, armorPen: 0.3});
            applyStatus(e, {type: 'burn', power: 8 * napalmRank, remaining: 3.6, sourceId: heroId, tickTimer: 0});
          }
          addCloud(state, {
            id: uid(state, 'c'), kind: 'napalm', sourceId: heroId,
            x: cx, y: cy, radius: 64 + 12 * napalmRank,
            duration: 4.8, remaining: 4.8, tick: 0.4, tickTimer: 0,
            dps: heroDmg * (0.65 + 0.3 * napalmRank),
            burn: {dps: 8 * napalmRank, duration: 3.0}
          });
        }
      } else {
        arsenal.timers.napalm = 0.2;
      }
    }
  }

  // 2. Armored Sweeper Truck (Lv.3+ dispatches twin parallel sweepers!)
  if (carRank > 0) {
    arsenal.timers.armored_car = finite(arsenal.timers.armored_car, 2.4) - dt * recharge;
    if (arsenal.timers.armored_car <= 1e-9) {
      const laneX = densestLaneX(state);
      if (laneX != null) {
        arsenal.timers.armored_car = superweaponCooldown('armored_car', carRank, haste);
        const lanes = [laneX];
        if (carRank >= 3) {
          const secondLane = densestLaneX(state, laneX);
          if (secondLane != null) lanes.push(secondLane);
        }
        for (const lx of lanes) {
          const sweeper = {
            id: uid(state, 'sw'),
            x: lx,
            y: ARENA.fenceY - 6,
            speed: 265,
            halfWidth: 34 + 3 * carRank,
            damage: heroDmg * (2.8 + 1.25 * carRank),
            knockback: 72 + 12 * carRank,
            rank: carRank,
            hitIds: [],
          };
          arsenal.sweepers.push(sweeper);
          emitEvent(state, 'armored_car', {x: lx, y: ARENA.fenceY - 12, rank: carRank});
        }
      } else {
        arsenal.timers.armored_car = 0.25;
      }
    }
  }

  // 3. Glacial Barrage Fan (5 / 8 / 11 / 15 piercing glacial spears!)
  if (cryoRank > 0) {
    arsenal.timers.cryo_barrage = finite(arsenal.timers.cryo_barrage, 2.0) - dt * recharge;
    if (arsenal.timers.cryo_barrage <= 1e-9) {
      const anyFoe = state.enemies.some(e => isTargetable(e) && e.y >= 20);
      if (anyFoe) {
        arsenal.timers.cryo_barrage = superweaponCooldown('cryo_barrage', cryoRank, haste);
        const countTable = [0, 5, 8, 11, 15];
        const count = countTable[clamp(cryoRank, 1, 4)] || (3 + 3 * cryoRank);
        const spread = Math.PI * (0.64 + 0.04 * cryoRank);
        const dmg = heroDmg * (1.25 + 0.5 * cryoRank);
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 - spread / 2 + (spread * i) / (count - 1);
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          state.projectiles.push({
            id: uid(state, 'p'),
            sourceId: heroId,
            targetId: null,
            x: heroSlot.x + dx * 12,
            y: ARENA.fenceY - 8,
            speed: 500,
            damage: dmg,
            crit: cryoRank >= 3,
            critMultiplier: 1.4,
            critChance: 0,
            tags: ['frost', 'cryo_barrage', 'pierce'],
            splash: 0,
            chain: 0,
            chainRange: 70,
            pierce: 4 + cryoRank * 2,
            visited: [],
            life: 1.45,
            dirx: dx,
            diry: dy,
            aimx: null,
            aimy: null,
            towerType: 'frost',
            rank: cryoRank,
            effects: {
              slow: {factor: 0.44, duration: 3.0},
              brittle: {power: 0.16 * cryoRank, duration: 3.2},
              knockback: 24,
              armorPen: 0.3,
            },
            mechanics: [],
            impactType: null,
            isSplitChild: true,
          });
        }
        emitEvent(state, 'cryo_barrage', {x: heroSlot.x, y: ARENA.fenceY - 12, count, rank: cryoRank});
      } else {
        arsenal.timers.cryo_barrage = 0.2;
      }
    }
  }

  // 4. Orbital Laser Beam (Lv.3+ fires twin orbital laser columns!)
  if (beamRank > 0) {
    arsenal.timers.orbital_beam = finite(arsenal.timers.orbital_beam, 2.6) - dt * recharge;
    if (arsenal.timers.orbital_beam <= 1e-9) {
      const target = priorityColumnTarget(state);
      if (target) {
        arsenal.timers.orbital_beam = superweaponCooldown('orbital_beam', beamRank, haste);
        const targets = [target];
        if (beamRank >= 3) {
          const second = priorityColumnTarget(state, target.x);
          if (second) targets.push(second);
        }
        const width = 32 + 9 * beamRank;
        const dmg = heroDmg * (2.8 + 1.2 * beamRank) * (1 + 0.28 * beamRank);
        for (const t of targets) {
          const bx = clamp(t.x, 22, ARENA.width - 22);
          arsenal.beams.push({id: uid(state, 'bm'), x: bx, width, life: 0.7, maxLife: 0.7, rank: beamRank});
          emitEvent(state, 'orbital_beam', {x: bx, y: t.y, width, damage: dmg, rank: beamRank});
          for (const e of state.enemies) {
            if (!isTargetable(e) || e.y < -12) continue;
            if (Math.abs(e.x - bx) <= width / 2 + finite(e.radius, 12)) {
              damageEnemy(state, e, dmg, {sourceId: heroId, towerType: 'orbital_beam', type: 'orbital_beam', crit: true, armorPen: 0.7});
              applyStatus(e, {type: 'burn', power: 7 * beamRank, remaining: 2.5, sourceId: heroId, tickTimer: 0});
            }
          }
        }
      } else {
        arsenal.timers.orbital_beam = 0.2;
      }
    }
  }

  // 5. EM Sky-Strike (chains 4 / 6 / 8 / 11 stunning lightning strikes!)
  if (emRank > 0) {
    arsenal.timers.ricochet = finite(arsenal.timers.ricochet, 2.2) - dt * recharge;
    if (arsenal.timers.ricochet <= 1e-9) {
      const first = selectTarget(state, {x: ARENA.width / 2, y: ARENA.fenceY}, 520, 'priority');
      if (first) {
        arsenal.timers.ricochet = superweaponCooldown('ricochet', emRank, haste);
        const targetTable = [0, 4, 6, 8, 11];
        const maxTargets = targetTable[clamp(emRank, 1, 4)] || (3 + 2 * emRank);
        const dmg = heroDmg * (1.6 + 0.65 * emRank);
        const hitIds = [];
        const points = [];
        let curr = first;
        for (let step = 0; step < maxTargets && curr; step++) {
          hitIds.push(curr.id);
          points.push({x: curr.x, y: curr.y});
          damageEnemy(state, curr, dmg, {sourceId: heroId, towerType: 'lightning', type: 'em_strike', crit: step < 2, armorPen: 0.4});
          if (isLiving(curr) && curr.kind !== 'boss') {
            applyStatus(curr, {type: 'stun', power: 1, remaining: 0.65, sourceId: heroId});
          }
          curr = nearestEnemy(state, curr, 142, hitIds);
        }
        emitEvent(state, 'em_strike', {x: points[0].x, y: points[0].y, points, rank: emRank});
      } else {
        arsenal.timers.ricochet = 0.2;
      }
    }
  }
}

function updateCombat(state, dt) {
  if (simulationFrozen(state)) return state;
  if (!Number.isFinite(dt) || dt <= 0) return state;
  if (!Array.isArray(state.slots)) return state;
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  if (!Array.isArray(state.events)) state.events = [];

  state.surge.shieldTimer=Math.max(0,state.surge.shieldTimer-dt);
  state.surge.cooldown=Math.max(0,state.surge.cooldown-dt);
  attachLivingSplits(state);
  removeDead(state);
  updateWards(state);

  const roster = [];
  let heroEntry = null;
  for (const slot of state.slots) {
    if (!slot?.unit) continue;
    const stats = combatStats(slot.unit, state);
    if (!stats || typeof stats !== 'object') continue;
    const entry = {slot, unit: slot.unit, stats};
    roster.push(entry);
    if (slot.unit.kind === 'hero' || slot.unit.type === 'hero') heroEntry = entry;
  }
  const aura = computeAura(roster);
  updateDefenders(state, dt, roster, aura);
  updateProjectiles(state, dt);
  updateClouds(state, dt);
  updateSuperweapons(state, dt, heroEntry);
  updateMenders(state, dt);
  updateFenceAttacks(state, dt);
  updateCharges(state, dt);
  removeDead(state);
  return state;
}

};
__ff_factories["src/systems/drafts.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["draftXpCost"] = draftXpCost;
__ff_exports["generateDraft"] = generateDraft;
__ff_exports["rerollDraft"] = rerollDraft;
__ff_exports["updateDrafts"] = updateDrafts;
__ff_exports["chooseDraft"] = chooseDraft;
const __ff_m0 = __ff_load("src/systems/hero.js");
const __ff_m1 = __ff_load("src/data/expeditions.js");
const __ff_m2 = __ff_load("src/shared.js");
const HERO_UPGRADES = __ff_m0["HERO_UPGRADES"];
const isAutoSkill = __ff_m0["isAutoSkill"];
const availableHeroUpgradeIds = __ff_m0["availableHeroUpgradeIds"];
const applyHeroUpgrade = __ff_m0["applyHeroUpgrade"];
const EXPEDITIONS = __ff_m1["EXPEDITIONS"];
const clone = __ff_m2["clone"];
const emit = __ff_m2["emit"];
const random = __ff_m2["random"];
/**
 * Three-choice roguelike drafts (Fencefall v5 — Pure Solo Gunner).
 *
 * One tap resolves immediately:
 * - Every 3-of-1 draft offers ONLY Hero Gun Mods (枪械强化) and Auto Skills (自动技能).
 * - Side turrets & 2×5 slot grid are removed; the Gunner holds the center wall position.
 * - Draft rerolls spend `rerollsLeft` charges.
 */




/** XP required to open the next draft after `opened` drafts have already been granted. */
function draftXpCost(opened) {
  const n = Number.isFinite(opened) ? Math.max(0, Math.floor(opened)) : 0;
  return 6 + 4 * n;
}

function generateDraft(state) {
  if (!state || !Array.isArray(state.slots)) {
    return ['volley', 'napalm', 'cadence'].map((id) => heroCard(state, id));
  }
  const heroIds = new Set(availableUpgradeIds(state));
  const cards = allValidCards(state, heroIds);
  let picked = uniqueCards(selectThree(state, cards)).filter((card) => cardValid(card, heroIds));
  if (picked.length < 3) {
    const used = new Set(picked.map((card) => card.id));
    for (const card of cards) {
      if (used.has(card.id) || !cardValid(card, heroIds)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
  return shuffle(state, picked.slice(0, 3));
}

function rerollDraft(state) {
  if (state?.phase !== 'draft' || !state.draft || (state.draftRerollsUsed || 0) >= 3) return fail('unavailable');
  const left = Number.isFinite(state.rerollsLeft) ? Math.floor(state.rerollsLeft) : 0;
  if (left <= 0) return fail('unavailable');
  const before = state.draft.options.map((c) => c.id).sort().join('|');
  let cards = state.draft.options;
  for (let i = 0; i < 8; i++) {
    const next = generateDraft(state);
    if (next.length >= 1) cards = next;
    if (next.map((c) => c.id).sort().join('|') !== before) break;
  }
  state.draft.options = cards;
  state.rerollsLeft = left - 1;
  state.draftRerollsUsed = (state.draftRerollsUsed || 0) + 1;
  emit(state, 'draft_reroll', {rerollsLeft: state.rerollsLeft, rerollsUsed: state.draftRerollsUsed});
  return ok();
}

function updateDrafts(state) {
  if (!state || state.phase !== 'playing' || !Array.isArray(state.slots) || state.slots.length !== 10) {
    return fail('not_playing');
  }
  if (state.settlement || defeatPending(state) || victoryPending(state)) return fail('not_playing');
  if (state.draft) return fail('busy');
  const freeOpening = (state.openingDraftPending || 0) > 0 && state.time >= 0.35;
  const cost = state.nextDraftXp;
  if (!freeOpening && (!Number.isFinite(state.xp) || !Number.isFinite(cost) || cost <= 0 || state.xp < cost)) {
    return fail('not_ready');
  }
  const options = generateDraft(state);
  if (!Array.isArray(options) || options.length === 0) {
    return fail('no_options');
  }
  if (freeOpening) {
    state.openingDraftPending = Math.max(0, Math.floor(state.openingDraftPending) - 1);
  } else {
    state.xp = normalizeXp(state.xp - cost);
    const opened = Number.isFinite(state.draftLevel) ? Math.max(0, Math.floor(state.draftLevel)) : 0;
    state.draftLevel = opened + 1;
    const stagePace = EXPEDITIONS[state.expedition]?.xpPace;
    const pace = Number.isFinite(stagePace) ? stagePace * 0.78 : (state.expedition === 'watch' ? 1 : 0.68);
    state.nextDraftXp = Math.max(4, Math.ceil(draftXpCost(state.draftLevel) * pace));
  }
  state.draftRerollsUsed = 0;
  state.draft = freeOpening ? {options, openingDrop: true} : {options};
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'draft', {level: state.draftLevel, xp: state.xp, nextDraftXp: state.nextDraftXp, openingDrop: freeOpening});
  return ok();
}

function chooseDraft(state, index) {
  if (!state || state.phase !== 'draft' || !state.draft || !Array.isArray(state.draft.options)) {
    return fail('no_draft');
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.draft.options.length) return fail('bad_index');
  const option = state.draft.options[index];
  if (!option || typeof option !== 'object') return fail('bad_option');

  if (option.kind === 'hero_upgrade') {
    if (typeof option.upgradeId !== 'string' || !option.upgradeId) return fail('bad_option');
    const hero = findHero(state);
    const slots = clone(state.slots);
    const slotsJson = JSON.stringify(state.slots);
    const upgrades = hero ? clone(hero.upgrades || {}) : null;
    const snap = economySnapshot(state);
    const stats = state.stats ? clone(state.stats) : null;
    const statsJson = stats ? JSON.stringify(stats) : null;
    let result;
    try {
      result = applyHeroUpgrade(state, option.upgradeId);
    } catch {
      result = {ok: false, reason: 'upgrade_failed'};
    }
    if (!result || result.ok !== true) {
      if (hero && upgrades && findHero(state) === hero && JSON.stringify(hero.upgrades) !== JSON.stringify(upgrades)) {
        hero.upgrades = upgrades;
      }
      if (JSON.stringify(state.slots) !== slotsJson) state.slots = slots;
      if (stats && JSON.stringify(state.stats) !== statsJson) state.stats = stats;
      restoreEconomy(state, snap);
      return fail(result?.reason || 'upgrade_failed');
    }
    if (stats && JSON.stringify(state.stats) !== statsJson) state.stats = stats;
    state.xp = snap.xp;
    state.nextDraftXp = snap.nextDraftXp;
    state.draftLevel = snap.draftLevel;
    state.paused = snap.paused;
    state.hiddenPaused = snap.hiddenPaused;
    state.kills = snap.kills;
    state.draft = null;
    state.phase = 'playing';
    if (!Array.isArray(state.events)) state.events = [];
    emit(state, 'ui', {action: 'choose_draft', kind: 'hero_upgrade', upgradeId: option.upgradeId});
    return ok();
  }

  return fail('bad_option');
}

function ok() { return {ok: true}; }
function fail(reason) { return {ok: false, reason}; }

function normalizeXp(value) {
  if (!Number.isFinite(value) || value <= 0.000001) return 0;
  return Math.round(value * 1000) / 1000;
}

function economySnapshot(state) {
  return {
    xp: state.xp,
    nextDraftXp: state.nextDraftXp,
    draftLevel: state.draftLevel,
    rng: state.rng,
    nextId: state.nextId,
    phase: state.phase,
    paused: state.paused,
    hiddenPaused: state.hiddenPaused,
    kills: state.kills
  };
}

function restoreEconomy(state, snap) {
  state.xp = snap.xp;
  state.nextDraftXp = snap.nextDraftXp;
  state.draftLevel = snap.draftLevel;
  state.rng = snap.rng;
  state.nextId = snap.nextId;
  state.phase = snap.phase;
  state.paused = snap.paused;
  state.hiddenPaused = snap.hiddenPaused;
  state.kills = snap.kills;
}

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function findHero(state) {
  for (const slot of state.slots || []) {
    if (isHero(slot?.unit)) return slot.unit;
  }
  return null;
}

function defeatPending(state) {
  return !!(state.fence && Number.isFinite(state.fence.hp) && state.fence.hp <= 0);
}

function victoryPending(state) {
  if (state.endless === true) return false;
  if (!state.director || state.director.done !== true) return false;
  for (const enemy of state.enemies || []) {
    if (enemy && enemy.dead !== true && Number.isFinite(enemy.hp) && enemy.hp > 0) return false;
  }
  return true;
}

function upgradeSpec(id) {
  return HERO_UPGRADES?.[id] || null;
}

function readCap(spec) {
  const cap = Number(spec?.cap);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function readLevel(hero, id) {
  if (!hero?.upgrades || typeof hero.upgrades !== 'object') return 0;
  const raw = hero.upgrades[id];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return 0;
}

function availableUpgradeIds(state) {
  const hero = findHero(state);
  return hero ? availableHeroUpgradeIds(hero) : [];
}

function heroCard(state, id) {
  const spec = upgradeSpec(id);
  const cap = readCap(spec);
  const level = readLevel(findHero(state), id);
  const card = {
    id: `hero_upgrade:${id}`,
    kind: 'hero_upgrade',
    upgradeId: id,
    superweapon: isAutoSkill(id)
  };
  if (cap != null) card.cap = cap;
  card.nextLevel = level + 1;
  if (spec?.description?.en && spec?.description?.zh) card.description = spec.description;
  return card;
}

function allValidCards(state, heroIds) {
  const mainIds = [];
  for (const id of heroIds) {
    if (id !== 'overclock') mainIds.push(id);
  }
  const cards = mainIds.map((id) => heroCard(state, id));
  if (cards.length < 3 && heroIds.has('overclock')) {
    cards.push(heroCard(state, 'overclock'));
  }
  return uniqueCards(cards);
}

function cardValid(card, heroIds) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) return false;
  return card.kind === 'hero_upgrade' && typeof card.upgradeId === 'string' && heroIds.has(card.upgradeId);
}

function uniqueCards(cards) {
  const out = [];
  const seen = new Set();
  for (const card of cards) {
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

function selectThree(state, cards) {
  const skills = shuffle(state, cards.filter((c) => c.superweapon));
  const gunMods = shuffle(state, cards.filter((c) => !c.superweapon && c.upgradeId !== 'overclock'));
  const fallback = cards.filter((c) => c.upgradeId === 'overclock');
  const picked = [];
  const take = (pool) => {
    while (pool.length) {
      const next = pool.shift();
      if (!picked.some((p) => p.id === next.id)) {
        picked.push(next);
        return true;
      }
    }
    return false;
  };
  // Always mix Auto Skills (自动技能) and Gun Mods (枪械强化): 1–2 of each whenever available
  take(skills);
  take(gunMods);
  const rest = shuffle(state, [...skills, ...gunMods]);
  while (picked.length < 3 && rest.length) take(rest);
  while (picked.length < 3 && fallback.length) take(fallback);
  return picked.slice(0, 3);
}

function shuffle(state, items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(state) * (i + 1));
    const swap = arr[i];
    arr[i] = arr[j];
    arr[j] = swap;
  }
  return arr;
}

};
__ff_factories["src/systems/hero.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["isAutoSkill"] = isAutoSkill;
__ff_exports["availableHeroUpgradeIds"] = availableHeroUpgradeIds;
__ff_exports["getHeroStats"] = getHeroStats;
__ff_exports["applyHeroUpgrade"] = applyHeroUpgrade;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/systems/progression.js");
const clamp = __ff_m0["clamp"];
const getProfileBonuses = __ff_m1["getProfileBonuses"];



const HERO_BASE = Object.freeze({
  damage: 18,
  interval: 0.78,
  range: 390,
  critChance: 0.1,
  critMultiplier: 1.75,
  projectileSpeed: 580,
  splash: 0,
  chain: 0,
  chainRange: 75,
  pierce: 0,
  mechanics: Object.freeze([]),
});
__ff_exports["HERO_BASE"] = HERO_BASE;


const AUTO_SKILL_IDS = Object.freeze([
  'split_shot',
  'ricochet',
  'napalm',
  'armored_car',
  'cryo_barrage',
  'orbital_beam',
]);
__ff_exports["AUTO_SKILL_IDS"] = AUTO_SKILL_IDS;


const AUTO_SKILL_SET = new Set(AUTO_SKILL_IDS);

function isAutoSkill(id) {
  return typeof id === 'string' && AUTO_SKILL_SET.has(id);
}

const BONUS_LIMITS = Object.freeze({
  damage: [-0.5, 2.5],
  haste: [-0.4, 1.5],
  range: [-40, 160],
  critChance: [-0.2, 0.5],
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function upgrade(id, cap, category, en, zh, info, detail, effect) {
  return deepFreeze({
    id,
    cap,
    category,
    name: {en, zh},
    description: {en: info, zh: detail},
    effect,
  });
}

const HERO_UPGRADES = deepFreeze({
  // --- 枪械强化 (Gun Mods) ---
  volley: upgrade(
    'volley', 4, 'gun',
    'Multi-Volley', '齐射弹道',
    'Fire at +1 additional zombie every shot (up to 5 simultaneous streams).',
    '每次开火额外多射 1 发弹道（最高 5 连齐射），后期弹幕铺满全屏。',
    {multishot: 1}
  ),
  strike: upgrade(
    'strike', 5, 'gun',
    'Heavy Rounds', '重膛高爆弹',
    'Gun damage +10 per rank. Crits knock back non-boss zombies.',
    '每级子弹伤害 +10，暴击强力击退普通僵尸。',
    {damageAdd: 10}
  ),
  cadence: upgrade(
    'cadence', 5, 'gun',
    'Rapid Fire', '极速连射',
    'Fire rate +32% per rank — turns your slow rifle into a blazing minigun.',
    '每级射速 +32%，从慢速单发蜕变为狂暴机枪连射！',
    {haste: 0.32}
  ),
  pierce: upgrade(
    'pierce', 4, 'gun',
    'Armor Pierce', '穿甲弹芯',
    'Bullets pierce +1 zombie and ignore 25% armor.',
    '子弹穿透 +1 名僵尸，并无视 25% 护甲。',
    {pierce: 1}
  ),
  shrapnel: upgrade(
    'shrapnel', 4, 'gun',
    'Flame Rounds', '烈焰爆裂弹',
    'Explosive hits burn zombies for 2.6s. Lv.2+ leaves burning patches and ramps burn DPS.',
    '子弹命中爆炸溅射并灼烧 2.6 秒，2 级起留下地面火坑且灼烧大幅增强。',
    {splash: 32, burn: {dps: 5, duration: 2.6}}
  ),
  frostbite: upgrade(
    'frostbite', 4, 'gun',
    'Frost Rounds', '急冻减速弹',
    'Slows zombies and boosts damage taken. Lv.2+ shatters on kill.',
    '强力减速僵尸并附加易伤，2 级起击杀触发范围冰爆。',
    {brittle: {power: 0.12, duration: 2.8}}
  ),
  focus: upgrade(
    'focus', 4, 'gun',
    'Deadeye Crit', '致命暴击',
    'Crit chance +12% & crit damage +40%. Lv.2+ executes low-HP foes.',
    '暴击率 +12%、暴击伤害 +40%，2 级起解锁残血斩杀。',
    {critChance: 0.12, critMultiplier: 0.4}
  ),
  bastion: upgrade(
    'bastion', 3, 'gun',
    'Fortified Wall', '钢铁城墙',
    'Wall HP +120, shockwave +40%, and +1 wall shield block.',
    '城墙血量 +120，危急冲击波 +40%，城墙免伤护盾 +1 次。',
    {fence: 120}
  ),

  // --- 自动技能 (Auto Skills) ---
  split_shot: upgrade(
    'split_shot', 4, 'skill',
    'Split Shrapnel', '子母分裂弹',
    'Damage +4. Hits auto-burst into 2/3/5/7 piercing shrapnel shots.',
    '子弹伤害 +4，命中后自动四散分裂出 2/3/5/7 发贯穿弹片。',
    {damageAdd: 4}
  ),
  ricochet: upgrade(
    'ricochet', 4, 'skill',
    'EM Chain Strike', '电磁连锁雷',
    'Bullets arc to 2/4/6/8 zombies and auto-call stunning sky lightning.',
    '子弹电弧弹射 2/4/6/8 名僵尸，并高频降下连锁麻痹天雷。',
    {damageAdd: 3}
  ),
  napalm: upgrade(
    'napalm', 4, 'skill',
    'Napalm Fire Sea', '燃油弹火海',
    'Blast radius +26. Auto-drops Napalm Fire Seas (Lv.4 drops twin bombs!).',
    '溅射范围 +26，定时空投大范围燃油火海（4 级双倍空投！）。',
    {splash: 26}
  ),
  armored_car: upgrade(
    'armored_car', 4, 'skill',
    'Armored Sweeper', '重装装甲车',
    'Wall HP +80. Auto-sends armored trucks crushing lanes (Lv.3+ twin trucks!).',
    '城墙血量 +80，定时派出重装战车碾压尸潮（3 级起双车齐发！）。',
    {fence: 80}
  ),
  cryo_barrage: upgrade(
    'cryo_barrage', 4, 'skill',
    'Glacial Barrage', '干冰齐射柱',
    'Adds brittle. Auto-fires a massive fan of 5/8/11/15 piercing ice spears.',
    '附加易伤，定时扇形齐射 5/8/11/15 道贯穿冰柱冰封全场。',
    {brittle: {power: 0.12, duration: 2.8}}
  ),
  orbital_beam: upgrade(
    'orbital_beam', 4, 'skill',
    'Orbital Laser', '高能激光柱',
    'Crit damage +30%. Auto-fires orbital beams (Lv.3+ twin beams!).',
    '暴击伤害 +30%，定时降下高能激光柱蒸发精英（3 级起双柱齐射！）。',
    {critMultiplier: 0.3}
  ),

  // --- Repeatable Late-Game Fallback ---
  overclock: upgrade(
    'overclock', 20, 'gun',
    'Firepower Overclock', '火力超频',
    'Gun and auto-skill damage +18% per rank.',
    '枪械与所有自动技能伤害额外 +18%，后期火力无限飙升！',
    {damage: 0.18}
  ),
});
__ff_exports["HERO_UPGRADES"] = HERO_UPGRADES;


function finiteOr(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round4(n) {
  if (!Number.isFinite(n)) return n;
  return Number(n.toFixed(4));
}

function storedLevel(raw, cap) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(cap, Math.floor(n));
}

function findHero(state) {
  if (!state || !Array.isArray(state.slots)) return null;
  let byType = null;
  for (const slot of state.slots) {
    const unit = slot && slot.unit;
    if (!unit || typeof unit !== 'object') continue;
    if (unit.kind === 'hero') return unit;
    if (!byType && unit.type === 'hero') byType = unit;
  }
  return byType;
}

function readBonuses(state) {
  const empty = {damage: 0, haste: 0, range: 0, critChance: 0};
  const profile = state && state.profileSnapshot;
  if (!profile || typeof profile !== 'object') return empty;
  const raw = state.systems?.integration?.bonuses || getProfileBonuses(profile) || empty;
  return {
    damage: clamp(finiteOr(raw.damage), BONUS_LIMITS.damage[0], BONUS_LIMITS.damage[1]),
    haste: clamp(finiteOr(raw.haste), BONUS_LIMITS.haste[0], BONUS_LIMITS.haste[1]),
    range: clamp(finiteOr(raw.range), BONUS_LIMITS.range[0], BONUS_LIMITS.range[1]),
    critChance: clamp(finiteOr(raw.critChance), BONUS_LIMITS.critChance[0], BONUS_LIMITS.critChance[1]),
  };
}

function upgradeLevels(unit) {
  const bag = unit && unit.upgrades && typeof unit.upgrades === 'object' ? unit.upgrades : {};
  const levels = {};
  for (const id of Object.keys(HERO_UPGRADES)) {
    levels[id] = storedLevel(bag[id], HERO_UPGRADES[id].cap);
  }
  return levels;
}

/** Ids still below cap, in catalog order. Empty when every run upgrade is maxed. */
function availableHeroUpgradeIds(unit) {
  const levels = upgradeLevels(unit);
  const ids = [];
  for (const id of Object.keys(HERO_UPGRADES)) {
    if (levels[id] < HERO_UPGRADES[id].cap) ids.push(id);
  }
  return ids;
}

/**
 * Fresh UnitStats for the hero. Does not mutate the unit, catalog, or run.
 * Profile bonuses come from state.profileSnapshot when present.
 */
function getHeroStats(unit, state) {
  const levels = upgradeLevels(unit);
  const {
    strike, cadence, pierce, volley, shrapnel, frostbite, focus,
    split_shot, ricochet, napalm, armored_car, cryo_barrage, orbital_beam, overclock
  } = levels;
  const bonus = readBonuses(state);
  const rawBonus = state?.systems?.integration?.bonuses || getProfileBonuses(state?.profileSnapshot) || {};
  const extraPierce = Math.max(0, Math.floor(finiteOr(rawBonus.heroPierce, 0)));
  const splitTable = [0, 2, 3, 5, 7];
  const chainTable = [0, 2, 4, 6, 8];
  const stats = {
    ...HERO_BASE,
    mechanics: [],
    damage: round4((HERO_BASE.damage + 10 * strike + 4 * split_shot + 3 * ricochet) * (1 + bonus.damage + 0.18 * overclock)),
    interval: round4(HERO_BASE.interval / (1 + 0.32 * cadence + bonus.haste)),
    range: HERO_BASE.range + bonus.range,
    critChance: round4(HERO_BASE.critChance + 0.12 * focus + bonus.critChance),
    critMultiplier: round4(HERO_BASE.critMultiplier + 0.4 * focus + 0.3 * orbital_beam),
    fence: levels.bastion * 120 + armored_car * 80,
    pierce: pierce + extraPierce,
    armorPen: Math.min(0.95, pierce * 0.25),
    critKnockback: (strike ? 16 + 4 * strike : 0) + finiteOr(rawBonus.critKnockback, 0),
    multishot: volley,
    chain: chainTable[ricochet] || 0,
    chainRange: ricochet ? 120 : HERO_BASE.chainRange,
    split: splitTable[split_shot] || 0,
    shrapnelRank: shrapnel,
    frostbiteRank: frostbite,
    shredPercent: Math.max(0, finiteOr(rawBonus.shredPercent, 0)),
    statusDamage: Math.max(0, finiteOr(rawBonus.statusDamage, 0)),
  };
  if (volley) stats.mechanics.push('multishot');
  if (focus >= 2) stats.mechanics.push('execute');
  if (split_shot) stats.mechanics.push('split_shot');
  if (ricochet) stats.mechanics.push('chain');
  if (shrapnel || napalm) {
    stats.splash = (shrapnel ? 22 + 10 * shrapnel : 0) + 26 * napalm;
  }
  if (shrapnel) {
    stats.burn = {dps: shrapnel === 1 ? 5 : 5 + 7 * (shrapnel - 1), duration: 2.6};
  }
  if (frostbite) {
    stats.slow = {factor: round4(Math.max(0.46, 0.8 - 0.07 * frostbite)), duration: 2.4};
  }
  if (frostbite || cryo_barrage) {
    stats.brittle = {power: round4(0.12 * frostbite + 0.12 * cryo_barrage), duration: 2.8};
  }
  return stats;
}

/**
 * Raise one hero upgrade by 1. Returns {ok:true} or {ok:false, reason}.
 * Reasons: unknown_upgrade, invalid_state, no_hero, upgrade_capped.
 */
function applyHeroUpgrade(state, id) {
  const def = typeof id === 'string' ? HERO_UPGRADES[id] : undefined;
  if (!def) return {ok: false, reason: 'unknown_upgrade'};
  if (!state || typeof state !== 'object' || !Array.isArray(state.slots)) return {ok: false, reason: 'invalid_state'};
  const hero = findHero(state);
  if (!hero) return {ok: false, reason: 'no_hero'};

  let upgrades = hero.upgrades;
  const usable = upgrades && typeof upgrades === 'object' && !Array.isArray(upgrades) && !Object.isFrozen(upgrades);
  if (!usable) {
    try {
      const next = {};
      if (upgrades && typeof upgrades === 'object' && !Array.isArray(upgrades)) {
        for (const key of Object.keys(upgrades)) next[key] = upgrades[key];
      }
      hero.upgrades = next;
      upgrades = next;
    } catch {
      return {ok: false, reason: 'invalid_state'};
    }
  }

  const current = storedLevel(upgrades[id], def.cap);
  if (current >= def.cap) return {ok: false, reason: 'upgrade_capped'};
  try {
    upgrades[id] = current + 1;
    if (id === 'bastion' && state.fence) {
      state.fence.maxHp += 120;
      state.fence.hp += 120;
      state.wallImmunity = Math.max(0, Math.floor(state.wallImmunity || 0)) + 1;
    }
    if (id === 'armored_car' && state.fence) {
      state.fence.maxHp += 80;
      state.fence.hp += 80;
    }
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}

};
__ff_factories["src/systems/movement.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["sampleSpawnX"] = sampleSpawnX;
__ff_exports["spawnEnemy"] = spawnEnemy;
__ff_exports["updateMovement"] = updateMovement;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/enemies.js");
const __ff_m2 = __ff_load("src/systems/status.js");
const ARENA = __ff_m0["ARENA"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clamp = __ff_m0["clamp"];
const emit = __ff_m0["emit"];
const random = __ff_m0["random"];
const uid = __ff_m0["uid"];
const ENEMIES = __ff_m1["ENEMIES"];
const getSpeedFactor = __ff_m2["getSpeedFactor"];
// Spawn placement and enemy travel.
//
// sampleSpawnX draws a truncated normal with rejection sampling so mass stays
// near the center and is not piled on the arena edges.
// spawnEnemy applies DIFFICULTIES health, speed and damage exactly once.
// healthScale is an extra HP multiplier for the director (wave growth).
// Finite overrides hp, maxHp, speed and damage replace the scaled values
// and are not multiplied again. Pass wave growth as healthScale, not as a
// pre-scaled hp, or difficulty will not be applied.
//
// Domain fields on each enemy (JSON-safe, persist with the run):
//   driftAnchor  oscillation center, logical px
//   driftFreq    rad/s
//   driftAmp     lateral amplitude, logical px (orbit stays inside the arena)
//   driftPhase   current angle, rad
//   driftVelocity  analytic lateral speed, px/s (not a second integrator)
//
// Leap, phase, banner, and ward numbers are copied from the catalog only when
// that mechanic object is present. They are not difficulty-scaled. A finite
// override of the same name replaces the catalog number. Missing mechanics
// add no keys.
//   leapEvery, leapWindup, leapDistance, leapClock, leapTimer
//     Crouch for leapWindup, then jump leapDistance along y only.
//     leapClock waits until the next crouch. leapTimer is the crouch left.
//     No leap when speed <= 0 or the center is within 36px of the stop line.
//   phaseOpen, phaseShut, phaseClock, phased
//     Open and shut alternate even while stunned, and never change x or y.
//   bannerRange, bannerHaste
//     Other living enemies inside the range add haste to forward movement,
//     summed and capped at 0.45. A banner does not buff itself. Haste is not
//     applied while the enemy is planted on the fence. Drift is unchanged.
//   wardRange, wardReduction
//     Reduction is capped at 0.4. A warden does not shield itself; combat
//     assigns the shield.
//   chargeGap, chargeWindup, chargeDamage, chargeTimer, chargeLit
//     chargeDamage is scaled once by difficulty damage. The fuse lights only
//     after fence contact. Combat applies the blast. Gap is the approach tell.
//   hushFactor
//     While this enemy is on the fence and not stunned, defender cooldowns
//     recharge at this rate. 0.75 means 75% of the usual recharge. It does not
//     stack, and it does not change enemy.speed.
//
// updateMovement does not write enemy.speed. Slow is getSpeedFactor.
// Dead enemies and stun (status remaining > 0) do not move.
// Living enemies stop with center y <= fenceY - radius, then set attacking
// and end lateral drift. Drift during the approach stays inside [enemyMinX, enemyMaxX].





const TAU = Math.PI * 2;
const SPAWN_ATTEMPTS = 32;
const DRIFT_FREQ_MIN = 0.55;
const DRIFT_FREQ_SPAN = 0.65;
const DRIFT_AMP_MIN = 8;
const DRIFT_AMP_SPAN = 10;
const DRIFT_AMP_CAP = 24;
const LEAP_STOP_GAP = 36;
const BANNER_HASTE_CAP = 2;

const FALLBACK = Object.freeze({
  hp: 40,
  speed: 30,
  radius: 12,
  damage: 6,
  attackInterval: 1.2,
  xp: 2,
  armor: 0,
});

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStat(entry, names, fallback) {
  const bags = [];
  if (entry && typeof entry === 'object') {
    bags.push(entry);
    if (entry.stats && typeof entry.stats === 'object') bags.push(entry.stats);
    if (entry.base && typeof entry.base === 'object') bags.push(entry.base);
  }
  for (let b = 0; b < bags.length; b++) {
    const bag = bags[b];
    for (let n = 0; n < names.length; n++) {
      const value = bag[names[n]];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function difficultyOf(state) {
  const row = state && DIFFICULTIES[state.difficulty];
  return row || DIFFICULTIES.normal;
}

function normalZ(state) {
  let u = random(state);
  const v = random(state);
  if (!(u > 1e-12)) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function wrapPhase(phase) {
  let p = phase % TAU;
  if (p < 0) p += TAU;
  return p;
}

function catalogEntry(kind) {
  if (!ENEMIES || typeof ENEMIES !== 'object') return null;
  const entry = ENEMIES[kind];
  return entry && typeof entry === 'object' ? entry : null;
}

function isStunned(enemy) {
  const list = enemy.statuses;
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    const status = list[i];
    if (status && status.type === 'stun' && finite(status.remaining, 0) > 0) return true;
  }
  return false;
}

function movementFactor(enemy) {
  const factor = getSpeedFactor(enemy);
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return 1;
  return clamp(factor, 0, 1);
}

function bodyRadius(enemy) {
  const radius = finite(enemy.radius, FALLBACK.radius);
  if (!(radius > 0)) return FALLBACK.radius;
  return radius;
}

// Orbit is anchor + sin(phase) * amp, and it must contain x and stay in range.
function fitDrift(x, phase, amp, freq) {
  const minX = ARENA.enemyMinX;
  const maxX = ARENA.enemyMaxX;
  const safeFreq = clamp(finite(freq, DRIFT_FREQ_MIN), 0, 8);
  let mag = Math.abs(finite(amp, 0));
  if (mag > DRIFT_AMP_CAP) mag = DRIFT_AMP_CAP;
  const sine = Math.sin(phase);
  const room = Math.max(0, Math.min(x - minX, maxX - x));
  const limit = room / (1 + Math.abs(sine));
  if (mag > limit) mag = limit;
  const signed = amp < 0 ? -mag : mag;
  const anchor = x - sine * signed;
  const low = anchor - mag;
  const high = anchor + mag;
  if (low < minX - 1e-6 || high > maxX + 1e-6) {
    return { driftAnchor: x, driftAmp: 0, driftFreq: safeFreq, driftPhase: phase, driftVelocity: 0 };
  }
  return {
    driftAnchor: anchor,
    driftAmp: signed,
    driftFreq: safeFreq,
    driftPhase: phase,
    driftVelocity: signed * safeFreq * Math.cos(phase),
  };
}

function mechanicBag(entry, name) {
  if (!entry || typeof entry !== 'object') return null;
  const bag = entry[name];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  return bag;
}

function pickFinite(override, catalog) {
  if (Number.isFinite(override)) return override;
  if (Number.isFinite(catalog)) return catalog;
  return null;
}

function attachLeap(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'leap');
  if (!bag) return;
  const every = pickFinite(opts.leapEvery, bag.every);
  const windup = pickFinite(opts.leapWindup, bag.windup);
  const distance = pickFinite(opts.leapDistance, bag.distance);
  if (!(every > 0) || !(distance > 0)) return;
  enemy.leapEvery = every;
  enemy.leapWindup = windup === null ? 0 : windup;
  enemy.leapDistance = distance;
  enemy.leapClock = Number.isFinite(opts.leapClock) ? opts.leapClock : every;
  enemy.leapTimer = Number.isFinite(opts.leapTimer) ? opts.leapTimer : 0;
}

function attachPhase(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'phase');
  if (!bag) return;
  const open = pickFinite(opts.phaseOpen, bag.open);
  const shut = pickFinite(opts.phaseShut, bag.shut);
  if (!(open > 0) || !(shut > 0)) return;
  enemy.phaseOpen = open;
  enemy.phaseShut = shut;
  enemy.phaseClock = Number.isFinite(opts.phaseClock) ? opts.phaseClock : open;
  enemy.phased = opts.phased === true;
}

function attachBanner(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'banner');
  if (!bag) return;
  const range = pickFinite(opts.bannerRange, bag.range);
  const haste = pickFinite(opts.bannerHaste, bag.haste);
  if (!(range > 0) || !(haste > 0)) return;
  enemy.bannerRange = range;
  enemy.bannerHaste = haste;
}

function attachWard(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'ward');
  if (!bag) return;
  const range = pickFinite(opts.wardRange, bag.range);
  const reduction = pickFinite(opts.wardReduction, bag.reduction);
  if (!(range > 0) || !(reduction > 0)) return;
  enemy.wardRange = range;
  enemy.wardReduction = Math.min(0.4, reduction);
}

function attachCharge(state, enemy, entry, opts) {
  const bag = mechanicBag(entry, 'charge');
  if (!bag) return;
  const gap = pickFinite(opts.chargeGap, bag.gap);
  const windup = pickFinite(opts.chargeWindup, bag.windup);
  const damage = pickFinite(opts.chargeDamage, bag.damage);
  if (!(gap > 0) || !(windup > 0) || !(damage > 0)) return;
  const row = state && DIFFICULTIES[state.difficulty];
  const scale = row && Number.isFinite(row.damage) ? row.damage : 1;
  enemy.chargeGap = gap;
  enemy.chargeWindup = windup;
  enemy.chargeDamage = damage * scale;
  enemy.chargeTimer = Number.isFinite(opts.chargeTimer) ? opts.chargeTimer : 0;
  enemy.chargeLit = opts.chargeLit === true;
}

function attachHush(enemy, entry, opts) {
  const bag = mechanicBag(entry, 'hush');
  if (!bag) return;
  const factor = pickFinite(opts.hushFactor, bag.factor);
  if (!(factor > 0) || factor >= 1) return;
  enemy.hushFactor = Math.max(0.5, Math.min(0.85, factor));
}

function initDrift(state, x, overrides) {
  const phase = Number.isFinite(overrides.driftPhase) ? overrides.driftPhase : random(state) * TAU;
  const freq = Number.isFinite(overrides.driftFreq)
    ? overrides.driftFreq
    : DRIFT_FREQ_MIN + random(state) * DRIFT_FREQ_SPAN;
  const amp = Number.isFinite(overrides.driftAmp)
    ? overrides.driftAmp
    : DRIFT_AMP_MIN + random(state) * DRIFT_AMP_SPAN;
  return fitDrift(x, phase, amp, freq);
}

function applyDrift(enemy, dt, factor) {
  if (!Number.isFinite(enemy.driftAnchor) || !Number.isFinite(enemy.driftAmp)) {
    const repaired = fitDrift(
      finite(enemy.x, 180),
      finite(enemy.driftPhase, 0),
      finite(enemy.driftAmp, 0),
      finite(enemy.driftFreq, 0),
    );
    enemy.driftAnchor = repaired.driftAnchor;
    enemy.driftAmp = repaired.driftAmp;
    enemy.driftFreq = repaired.driftFreq;
    enemy.driftPhase = repaired.driftPhase;
    enemy.driftVelocity = repaired.driftVelocity;
  }
  const freq = finite(enemy.driftFreq, 0);
  const amp = finite(enemy.driftAmp, 0);
  const phase = wrapPhase(finite(enemy.driftPhase, 0) + freq * factor * dt);
  let x = enemy.driftAnchor + Math.sin(phase) * amp;
  if (x < ARENA.enemyMinX || x > ARENA.enemyMaxX) {
    x = clamp(x, ARENA.enemyMinX, ARENA.enemyMaxX);
    enemy.driftAnchor = x;
    enemy.driftAmp = 0;
    enemy.driftVelocity = 0;
    enemy.driftPhase = phase;
    enemy.x = x;
    return;
  }
  enemy.driftPhase = phase;
  enemy.driftVelocity = amp * freq * factor * Math.cos(phase);
  enemy.x = x;
}

function sampleSpawnX(state, mean = 180, sigma = 60) {
  const mu = finite(mean, 180);
  const sig = Math.abs(finite(sigma, 60));
  const minX = ARENA.enemyMinX;
  const maxX = ARENA.enemyMaxX;
  if (!(sig > 0)) return clamp(mu, minX, maxX);
  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const x = mu + normalZ(state) * sig;
    if (x >= minX && x <= maxX) return x;
  }
  // Exhausted tails still land on the mean, not on a clamped edge.
  return clamp(mu, minX, maxX);
}

function spawnEnemy(state, kind, overrides = {}) {
  const opts = overrides && typeof overrides === 'object' ? overrides : {};
  const key = typeof kind === 'string' && kind ? kind : 'shambler';
  const entry = catalogEntry(key);
  const diff = difficultyOf(state);
  const healthMul = finite(diff.health, 1);
  const speedMul = finite(diff.speed, 1);
  const damageMul = finite(diff.damage, 1);
  let healthScale = finite(opts.healthScale, 1);
  if (!(healthScale >= 0)) healthScale = 1;

  const baseHp = Math.max(0, readStat(entry, ['hp', 'health', 'maxHp'], FALLBACK.hp));
  const baseSpeed = Math.max(0, readStat(entry, ['speed', 'moveSpeed'], FALLBACK.speed));
  const baseDamage = Math.max(0, readStat(entry, ['damage', 'attackDamage'], FALLBACK.damage));
  const baseRadius = readStat(entry, ['radius', 'bodyRadius'], FALLBACK.radius);
  const baseInterval = readStat(entry, ['attackInterval', 'interval'], FALLBACK.attackInterval);
  const baseXp = readStat(entry, ['xp', 'experience'], FALLBACK.xp);
  const baseArmor = readStat(entry, ['armor'], FALLBACK.armor);

  const computedHp = baseHp * healthMul * healthScale;
  const hpGiven = Number.isFinite(opts.hp);
  const maxGiven = Number.isFinite(opts.maxHp);
  let hp;
  let maxHp;
  if (hpGiven && maxGiven) {
    maxHp = Math.max(0, opts.maxHp);
    hp = clamp(opts.hp, 0, maxHp > 0 ? maxHp : 0);
    if (!(maxHp > 0)) maxHp = hp;
  } else if (hpGiven) {
    hp = Math.max(0, opts.hp);
    maxHp = hp;
  } else if (maxGiven) {
    maxHp = Math.max(0, opts.maxHp);
    hp = maxHp;
  } else {
    maxHp = Math.max(0, computedHp);
    hp = maxHp;
  }

  let speedScale = finite(opts.speedScale, 1);
  if (!(speedScale > 0)) speedScale = 1;
  const speed = Math.max(0, Number.isFinite(opts.speed) ? opts.speed : baseSpeed * speedMul * speedScale);
  const damage = Math.max(0, Number.isFinite(opts.damage) ? opts.damage : baseDamage * damageMul);
  let radius = Number.isFinite(opts.radius) ? opts.radius : baseRadius;
  if (!(radius > 0)) radius = FALLBACK.radius;
  radius = clamp(radius, 1, 96);
  let attackInterval = Number.isFinite(opts.attackInterval) ? opts.attackInterval : baseInterval;
  if (!(attackInterval > 0)) attackInterval = FALLBACK.attackInterval;
  const xp = Math.max(0, Number.isFinite(opts.xp) ? opts.xp : baseXp);
  const armor = clamp(Number.isFinite(opts.armor) ? opts.armor : baseArmor, 0, 0.8);
  const attackCooldown = Math.max(0, finite(opts.attackCooldown, 0));

  const stopY = ARENA.fenceY - radius;
  let x = Number.isFinite(opts.x) ? clamp(opts.x, ARENA.enemyMinX, ARENA.enemyMaxX) : sampleSpawnX(state);
  let y = Number.isFinite(opts.y) ? opts.y : ARENA.spawnY;
  if (y > stopY) y = stopY;

  const drift = initDrift(state, x, opts);
  const enemy = {
    id: uid(state, 'e'),
    kind: key,
    ...(entry.attackRange ? {attackRange:entry.attackRange,projectileSpeed:entry.projectileSpeed} : {}),
    ...(entry.statusResist ? {statusResist:{...entry.statusResist}} : {}),
    x,
    y,
    hp,
    maxHp,
    speed,
    radius,
    damage,
    attackInterval,
    attackCooldown,
    xp,
    armor,
    driftPhase: drift.driftPhase,
    driftVelocity: drift.driftVelocity,
    driftFreq: drift.driftFreq,
    driftAmp: drift.driftAmp,
    driftAnchor: drift.driftAnchor,
    statuses: [],
    attacking: y >= stopY - 1e-6,
    dead: false,
  };

  attachLeap(enemy, entry, opts);
  attachPhase(enemy, entry, opts);
  attachBanner(enemy, entry, opts);
  attachWard(enemy, entry, opts);
  attachCharge(state, enemy, entry, opts);
  attachHush(enemy, entry, opts);

  if (!Array.isArray(state.enemies)) state.enemies = [];
  state.enemies.push(enemy);
  return enemy;
}

function tickPhase(state, enemy, dt) {
  if (!(enemy.phaseOpen > 0) || !(enemy.phaseShut > 0)) return;
  if (!Number.isFinite(enemy.phaseClock)) return;
  enemy.phaseClock -= dt;
  if (enemy.phaseClock > 0) return;
  enemy.phased = enemy.phased !== true;
  enemy.phaseClock = enemy.phased ? enemy.phaseShut : enemy.phaseOpen;
  emit(state, 'phase', {x: enemy.x, y: enemy.y, phased: enemy.phased === true});
}

function dashLeap(state, enemy, stopY) {
  enemy.leapTimer = 0;
  const end = Math.min(stopY, enemy.y + enemy.leapDistance);
  enemy.airTime = 0.35;
  enemy.y = end;
  enemy.attacking = enemy.y >= stopY - 1e-6;
  emit(state, 'leap', {x: enemy.x, y: enemy.y});
}

function updateLeap(state, enemy, dt, stopY) {
  if (!(enemy.leapEvery > 0) || !(enemy.leapDistance > 0)) return false;
  if (!(enemy.speed > 0) || !(enemy.y < stopY - LEAP_STOP_GAP)) return false;

  if (enemy.leapTimer > 0) {
    enemy.leapTimer -= dt;
    if (enemy.leapTimer > 0) return true;
    dashLeap(state, enemy, stopY);
    return true;
  }

  const clock = (Number.isFinite(enemy.leapClock) ? enemy.leapClock : enemy.leapEvery) - dt;
  if (clock > 0) {
    enemy.leapClock = clock;
    return false;
  }

  enemy.leapClock = enemy.leapEvery;
  if (enemy.leapWindup > 0) {
    enemy.leapTimer = enemy.leapWindup;
    return true;
  }
  dashLeap(state, enemy, stopY);
  return true;
}

function allyHaste(enemies, self) {
  let sum = 0;
  for (let i = 0; i < enemies.length; i++) {
    const other = enemies[i];
    if (other === self || !other || typeof other !== 'object') continue;
    if (other.dead || !(other.hp > 0)) continue;
    const range = other.bannerRange;
    const haste = other.bannerHaste;
    if (!(range > 0) || !(haste > 0)) continue;
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    if (dx * dx + dy * dy <= range * range) sum += haste;
  }
  return sum > BANNER_HASTE_CAP ? BANNER_HASTE_CAP : sum;
}

function updateMovement(state, dt) {
  if (!state || state.phase !== 'playing' || state.paused || state.hiddenPaused) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  const enemies = state.enemies;
  if (!Array.isArray(enemies)) return;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || typeof enemy !== 'object') continue;
    if (enemy.dead || !(enemy.hp > 0)) {
      enemy.attacking = false;
      continue;
    }
    if (!Array.isArray(enemy.statuses)) enemy.statuses = [];

    const radius = bodyRadius(enemy);
    const stopY = ARENA.fenceY - (enemy.attackRange || radius);
    if (!Number.isFinite(enemy.y)) enemy.y = ARENA.spawnY;
    if (!Number.isFinite(enemy.x)) enemy.x = clamp(finite(enemy.driftAnchor, 180), ARENA.enemyMinX, ARENA.enemyMaxX);
    if (enemy.y > stopY) enemy.y = stopY;

    tickPhase(state, enemy, dt);
    if (enemy.revealTimer > 0) {
      enemy.revealTimer = Math.max(0, enemy.revealTimer - dt);
      enemy.revealed = enemy.revealTimer > 0;
    }
    if (enemy.airTime > 0) { enemy.airTime = Math.max(0, enemy.airTime - dt); continue; }

    if (isStunned(enemy)) {
      enemy.attacking = false;
      continue;
    }

    if (updateLeap(state, enemy, dt, stopY)) continue;

    const factor = movementFactor(enemy);
    const speed = finite(enemy.speed, 0) > 0 ? enemy.speed : 0;
    const haste = enemy.y >= stopY - 1e-6 ? 0 : allyHaste(enemies, enemy);
    const dy = speed * factor * dt * (1 + haste);
    // Plant at the fence: y stops on the contact line and lateral sway stops with it.
    if (enemy.y + dy >= stopY) {
      enemy.y = stopY;
      enemy.attacking = true;
    } else {
      enemy.y += dy;
      enemy.attacking = false;
      applyDrift(enemy, dt, factor);
    }
  }
}

};
__ff_factories["src/systems/progression.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["getProfileBonuses"] = getProfileBonuses;
__ff_exports["buyGem"] = buyGem;
__ff_exports["equipGem"] = equipGem;
__ff_exports["unequipGem"] = unequipGem;
__ff_exports["claimStarterPack"] = claimStarterPack;
__ff_exports["buyEquipment"] = buyEquipment;
__ff_exports["equipItem"] = equipItem;
__ff_exports["purchasePermanent"] = purchasePermanent;
__ff_exports["nextArmoryBuy"] = nextArmoryBuy;
__ff_exports["settleRun"] = settleRun;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/expeditions.js");
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clamp = __ff_m0["clamp"];
const EXPEDITIONS = __ff_m1["EXPEDITIONS"];



const PROGRESSION_RULES = Object.freeze({
  secondsPerPoint: 25,
  killsPerPoint: 8,
  pointsPerWave: 1,
  victoryBonus: 28,
  abandonDivisor: 2,
  timeCap: 1200,
  killCap: 640,
  waveCap: 40,
  freshTime: 30,
  freshKills: 3,
  settledRunLimit: 64,
  maxCurrency: 999999,
  rewardFractionCap: 0.25
});
__ff_exports["PROGRESSION_RULES"] = PROGRESSION_RULES;


const EQUIP_SLOTS = ['weapon', 'charm', 'armor'];
// Profile saves reject settledRuns longer than 2000. Stay under that ceiling.
const PAID_RUN_LIMIT = 2000;
const PERMANENT_KEYS = ['damage', 'haste', 'vitality','economy'];
// After a loss, suggest the fence first when two buys cost the same.
const NEXT_BUY_RANK = Object.freeze({
  vitality: 0,
  fence_nails: 1,
  vanguard_kit: 2,
  surge_capacitor: 3,
  damage: 4,
  splinter_bow: 5,
  kinetic_core: 6,
  prism_lens: 7,
  haste: 8,
  runner_charm: 9,
  sun_spindle: 10,
  bounty_seal: 11,
});
const BONUS_LABELS = {
  damage: ['gun damage', '枪械伤害', '%'],
  haste: ['fire rate', '枪械攻速', '%'],
  critChance: ['crit chance', '暴击率', '%'],
  reward: ['reward', '结算奖励', '%'],
  superweaponHaste: ['auto-skill cooldown', '技能冷却', '%'],
  surgePower: ['shockwave power', '冲击波威力', '%'],
  statusDamage: ['status damage', '异常增伤', '%'],
  shredPercent: ['max HP shred', '斩血比例', '%'],
  critKnockback: ['critical knockback', '暴击击退', 'px'],
  fence: ['starting wall HP', '开局城墙生命', ''],
  thorns: ['wall thorns', '城墙反伤', ''],
  freeRerolls: ['extra rerolls', '额外刷新次数', ''],
  surgeCharges: ['shockwave charges', '冲击波充能', ''],
  wallImmunity: ['wall shield blocks', '城墙免伤次数', ''],
  openingDraft: ['opening airdrop', '开局免费选卡', ''],
  heroPierce: ['bullet pierce', '子弹穿透', ''],
  starterWeapon: ['starter auto skill', '开局赠送技能', '']
};
const FRACTION_KEYS = Object.keys(BONUS_LABELS).filter((k) => BONUS_LABELS[k][2] === '%');
const ABSOLUTE_KEYS = Object.keys(BONUS_LABELS).filter((k) => BONUS_LABELS[k][2] !== '%');
function formatPercent(n) { return String(Math.round(n * 1000) / 10); }
function equipmentDescription(en, zh, bonuses) {
  const parts = Object.entries(bonuses).map(([k, v]) => {
    const [a, b, unit] = BONUS_LABELS[k];
    const magnitude = '+' + (unit === '%' ? formatPercent(v) : v) + unit;
    return [magnitude + ' ' + a, b + magnitude];
  });
  return {en: parts.map((p) => p[0]).join(', '), zh: parts.map((p) => p[1]).join('，')};
}
function permanentDescription(en, zh, bonuses, cap) {
  const effect = equipmentDescription(en, zh, bonuses);
  return {en: effect.en + ' per rank (max ' + cap + ').', zh: '每级' + effect.zh + '，最高 ' + cap + ' 级。'};
}

function gear(id, slot, cost, bonuses, flavorEn, flavorZh) {
  return {
    id,
    slot,
    cost,
    bonuses,
    name: null,
    description: equipmentDescription(flavorEn, flavorZh, bonuses)
  };
}

const equipmentNames = {
  splinter_bow: {en: 'Splinter Rifle', zh: '裂片步枪'},
  kinetic_core: {en: 'Kinetic Core', zh: '动能弹芯'},
  prism_lens: {en: 'Prism Overdrive', zh: '棱镜超频器'},
  runner_charm: {en: 'Runner Charm', zh: '疾射护符'},
  sun_spindle: {en: 'Pulse Spindle', zh: '脉冲核心'},
  bounty_seal: {en: 'Bounty Seal', zh: '赏金印章'},
  fence_nails: {en: 'Bastion Bolts', zh: '城墙钢钉'},
  vanguard_kit: {en: 'Reactive Plating', zh: '反应装甲'},
  surge_capacitor: {en: 'Surge Capacitor', zh: '冲击电容'}
};
const rawEquipment = [
  gear('splinter_bow', 'weapon', 60, {damage: 0.08}),
  gear('kinetic_core', 'weapon', 150, {damage: 0.06, critChance: 0.05, critKnockback: 10}),
  gear('prism_lens', 'weapon', 280, {damage: 0.12, superweaponHaste: 0.14, freeRerolls: 2}),
  gear('runner_charm', 'charm', 55, {haste: 0.08}),
  gear('sun_spindle', 'charm', 145, {haste: 0.06, superweaponHaste: 0.12, freeRerolls: 1}),
  gear('bounty_seal', 'charm', 240, {reward: 0.2, critChance: 0.05, freeRerolls: 1}),
  gear('fence_nails', 'armor', 50, {fence: 60}),
  gear('vanguard_kit', 'armor', 140, {fence: 100, thorns: 8, wallImmunity: 1}),
  gear('surge_capacitor', 'armor', 260, {surgeCharges: 1, surgePower: 0.3})
];
const equipmentRecord = {};
for (const entry of rawEquipment) {
  entry.name = equipmentNames[entry.id];
  equipmentRecord[entry.id] = entry;
}

function track(id, cap, costs, bonuses, name, flavorEn, flavorZh) {
  return {
    id,
    cap,
    cost: costs[0],
    costs,
    bonuses,
    name,
    description: permanentDescription(flavorEn, flavorZh, bonuses, cap)
  };
}

const permanentRecord = {
  damage: track('damage', 5, [40, 70, 110, 170, 240], {damage: 0.04}, {en: 'Firepower', zh: '枪械火力'}, 'Permanent gun firepower across every stage.', '跨关卡永久生效的枪械伤害训练。'),
  haste: track('haste', 5, [40, 70, 110, 170, 240], {haste: 0.04}, {en: 'Quick Reload', zh: '极速装填'}, 'Fire bullets faster in every stage.', '永久缩短枪手射击间隔，火力更密集。'),
  vitality: track('vitality', 5, [35, 60, 100, 150, 220], {fence: 30}, {en: 'Steel Wall', zh: '钢铁城墙'}, 'Reinforce the wall with extra starting HP.', '加固城墙结构，永久提高开局城墙血量。'),
  economy: track('economy', 5, [40, 70, 110, 170, 240], {reward: 0.05, superweaponHaste: 0.04}, {en: 'War Chest', zh: '战备补给'}, 'Boost coin payout and auto-skill recharge speed.', '提升通关金币收益，并加快所有自动技能冷却。')
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function assertCatalog() {
  const seenSlots = new Set();
  for (const [id, item] of Object.entries(equipmentRecord)) {
    if (item.id !== id) throw new Error(`equipment id mismatch: ${id}`);
    if (!EQUIP_SLOTS.includes(item.slot)) throw new Error(`bad equipment slot: ${id}`);
    if (!Number.isInteger(item.cost) || item.cost <= 0) throw new Error(`bad equipment cost: ${id}`);
    if (!item.name?.en || !item.name?.zh || !item.description?.en || !item.description?.zh) throw new Error(`missing equipment text: ${id}`);
    seenSlots.add(item.slot);
    for (const [key, value] of Object.entries(item.bonuses)) {
      if (!FRACTION_KEYS.includes(key) && !ABSOLUTE_KEYS.includes(key)) throw new Error(`bad bonus ${key} on ${id}`);
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`bad bonus value on ${id}`);
      const label = FRACTION_KEYS.includes(key) ? `${formatPercent(value)}%` : String(value);
      if (!item.description.en.includes(label) || !item.description.zh.includes(label)) {
        throw new Error(`description misses ${label} for ${id}`);
      }
    }
  }
  if (seenSlots.size !== EQUIP_SLOTS.length) throw new Error('equipment must cover weapon, charm, and armor');
  for (const key of PERMANENT_KEYS) {
    const spec = permanentRecord[key];
    if (!spec || spec.id !== key || spec.cap !== spec.costs.length || spec.cost !== spec.costs[0]) {
      throw new Error(`bad permanent track: ${key}`);
    }
    for (let i = 0; i < spec.costs.length; i++) {
      if (!Number.isInteger(spec.costs[i]) || spec.costs[i] <= 0) throw new Error(`bad permanent cost: ${key}`);
      if (i > 0 && spec.costs[i] <= spec.costs[i - 1]) throw new Error(`permanent cost must rise: ${key}`);
    }
    if (!spec.description.en.includes(String(spec.cap)) || !spec.description.zh.includes(String(spec.cap))) {
      throw new Error(`permanent description misses cap: ${key}`);
    }
  }
}

assertCatalog();

const GEM_SLOTS = 3;
__ff_exports["GEM_SLOTS"] = GEM_SLOTS;

const GEM_ORDER = Object.freeze([
  'gem_opening_drop',
  'gem_aegis_wall',
  'gem_pierce_core',
  'gem_elemental',
  'gem_shredder',
  'gem_overdrive',
]);
__ff_exports["GEM_ORDER"] = GEM_ORDER;


const GEMS = deepFreeze({
  gem_opening_drop: {
    id: 'gem_opening_drop',
    cost: 25,
    tier: 'epic',
    name: {en: 'Opening Airdrop Gem', zh: '开局空投宝石'},
    description: {
      en: 'Start every stage with 1 free instant 3-of-1 upgrade pick.',
      zh: '每关开场立即送 1 次免费三选一，开局直接起飞。'
    },
    bonuses: {openingDraft: 1},
  },
  gem_aegis_wall: {
    id: 'gem_aegis_wall',
    cost: 40,
    tier: 'epic',
    name: {en: 'Wall Shield Gem', zh: '城墙免伤宝石'},
    description: {
      en: 'Block the first 5 hits on the wall and knock back nearby zombies.',
      zh: '城墙每关前 5 次受击完全免伤，并震退贴墙尸群。'
    },
    bonuses: {wallImmunity: 5},
  },
  gem_pierce_core: {
    id: 'gem_pierce_core',
    cost: 45,
    tier: 'epic',
    name: {en: 'Pierce Core Gem', zh: '子弹穿透宝石'},
    description: {
      en: 'Bullets gain +1 pierce and +8% gun damage.',
      zh: '子弹基础穿透 +1，枪械伤害 +8%，一发贯穿整排尸群。'
    },
    bonuses: {heroPierce: 1, damage: 0.08},
  },
  gem_elemental: {
    id: 'gem_elemental',
    cost: 55,
    tier: 'legend',
    name: {en: 'Elemental Surge Gem', zh: '冰火增伤宝石'},
    description: {
      en: 'Deal +25% bonus damage to burning, slowed, brittle, or poisoned zombies.',
      zh: '攻击燃烧、减速、易伤或中毒僵尸时，伤害额外 +25%。'
    },
    bonuses: {statusDamage: 0.25},
  },
  gem_shredder: {
    id: 'gem_shredder',
    cost: 65,
    tier: 'legend',
    name: {en: 'HP Shredder Gem', zh: '暴击斩血宝石'},
    description: {
      en: 'Crits deal +4% target max HP bonus damage (capped at 180 vs bosses).',
      zh: '暴击附带目标 4% 最大生命额外伤害（对首领上限 180）。'
    },
    bonuses: {shredPercent: 0.04},
  },
  gem_overdrive: {
    id: 'gem_overdrive',
    cost: 75,
    tier: 'legend',
    name: {en: 'Skill Haste Gem', zh: '技能急速宝石'},
    description: {
      en: 'Auto skills recharge 25% faster and start every stage with 1 random Auto Skill.',
      zh: '所有自动技能冷却缩短 25%，开局免费赠送 1 个随机自动技能。'
    },
    bonuses: {superweaponHaste: 0.25, starterWeapon: 1},
  },
});
__ff_exports["GEMS"] = GEMS;


const EQUIPMENT = deepFreeze(equipmentRecord);
__ff_exports["EQUIPMENT"] = EQUIPMENT;

const PERMANENT_UPGRADES = deepFreeze(permanentRecord);
__ff_exports["PERMANENT_UPGRADES"] = PERMANENT_UPGRADES;


function fail(reason) {
  return {ok: false, reason};
}

function isProfile(profile) {
  return !!profile && typeof profile === 'object' && !Array.isArray(profile);
}

function currencyOf(profile) {
  const value = profile.currency;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function owns(profile, id) {
  return Array.isArray(profile.equipmentOwned) && profile.equipmentOwned.includes(id);
}

function ownsGem(profile, id) {
  return Array.isArray(profile.gemsOwned) && profile.gemsOwned.includes(id);
}

function addSource(out,bonuses,times) {
  for (const [key,value] of Object.entries(bonuses)) out[key]=Math.round(((out[key] || 0)+times*value)*10000)/10000;
}
function boundedLevel(value, cap) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 0;
  return Math.min(value, cap);
}

function getProfileBonuses(profile) {
  const bonuses = {damage:0,haste:0,range:0,critChance:0,reward:0,fence:0};
  if (!isProfile(profile)) return bonuses;
  const equipped = profile.equipped && typeof profile.equipped === 'object' ? profile.equipped : null;
  const seenItems = new Set();
  if (equipped) {
    for (const slot of EQUIP_SLOTS) {
      const id = equipped[slot];
      // One owned item, one slot. A repeated id must not stack its bonuses.
      if (typeof id !== 'string' || seenItems.has(id) || !owns(profile, id)) continue;
      const item = EQUIPMENT[id];
      if (!item || item.slot !== slot) continue;
      seenItems.add(id);
      addSource(bonuses, item.bonuses, 1);
    }
  }
  const permanent = profile.permanent && typeof profile.permanent === 'object' ? profile.permanent : null;
  if (permanent) {
    for (const id of PERMANENT_KEYS) {
      const spec = PERMANENT_UPGRADES[id];
      // Level is how many times this rank bonus has been bought. Count it once per rank.
      const level = boundedLevel(permanent[id], spec.cap);
      if (level > 0) addSource(bonuses, spec.bonuses, level);
    }
  }
  const gemsEquipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped : null;
  if (gemsEquipped && gemsEquipped.length) {
    const seenGems = new Set();
    let count = 0;
    for (const id of gemsEquipped) {
      if (count >= GEM_SLOTS) break;
      if (typeof id !== 'string' || seenGems.has(id) || !ownsGem(profile, id)) continue;
      const gem = GEMS[id];
      if (!gem) continue;
      seenGems.add(id);
      count += 1;
      addSource(bonuses, gem.bonuses, 1);
    }
  }
  return bonuses;
}

function buyGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const gem = typeof id === 'string' ? GEMS[id] : null;
  if (!gem) return fail('unknownItem');
  if (ownsGem(profile, id)) return fail('alreadyOwned');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  if (currency < gem.cost) return fail('insufficientCurrency');
  profile.currency = currency - gem.cost;
  profile.gemsOwned = (Array.isArray(profile.gemsOwned) ? profile.gemsOwned : []).concat(id);
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.slice() : [];
  if (equipped.length < GEM_SLOTS && !equipped.includes(id)) {
    equipped.push(id);
    profile.gemsEquipped = equipped;
  }
  return {ok: true};
}

function equipGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const gem = typeof id === 'string' ? GEMS[id] : null;
  if (!gem) return fail('unknownItem');
  if (!ownsGem(profile, id)) return fail('notOwned');
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.filter(g => ownsGem(profile, g) && GEMS[g]) : [];
  if (equipped.includes(id)) return {ok: true};
  if (equipped.length >= GEM_SLOTS) equipped.shift();
  equipped.push(id);
  profile.gemsEquipped = equipped;
  return {ok: true};
}

function unequipGem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  if (!Array.isArray(profile.gemsEquipped)) return {ok: true};
  profile.gemsEquipped = profile.gemsEquipped.filter(g => g !== id);
  return {ok: true};
}

function claimStarterPack(profile) {
  if (!isProfile(profile)) return fail('invalidProfile');
  if (profile.starterClaimed === true) return fail('alreadyOwned');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  profile.starterClaimed = true;
  profile.currency = Math.min(PROGRESSION_RULES.maxCurrency, currency + 180);
  const owned = Array.isArray(profile.gemsOwned) ? profile.gemsOwned.slice() : [];
  if (!owned.includes('gem_opening_drop')) owned.push('gem_opening_drop');
  profile.gemsOwned = owned;
  const equipped = Array.isArray(profile.gemsEquipped) ? profile.gemsEquipped.slice() : [];
  if (!equipped.includes('gem_opening_drop') && equipped.length < GEM_SLOTS) equipped.push('gem_opening_drop');
  profile.gemsEquipped = equipped;
  return {ok: true, bonus: 180, gem: 'gem_opening_drop'};
}

function buyEquipment(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const item = typeof id === 'string' ? EQUIPMENT[id] : null;
  if (!item) return fail('unknownItem');
  if (owns(profile, id)) return fail('alreadyOwned');
  if (profile.equipmentOwned != null && !Array.isArray(profile.equipmentOwned)) return fail('invalidProfile');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  if (currency < item.cost) return fail('insufficientCurrency');
  profile.currency = currency - item.cost;
  profile.equipmentOwned = (profile.equipmentOwned || []).concat(id);
  return {ok: true};
}

function equipItem(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const item = typeof id === 'string' ? EQUIPMENT[id] : null;
  if (!item) return fail('unknownItem');
  if (!owns(profile, id)) return fail('notOwned');
  const equipped = profile.equipped;
  if (equipped != null && (typeof equipped !== 'object' || Array.isArray(equipped))) return fail('invalidProfile');
  if (equipped && equipped[item.slot] === id) return {ok: true};
  const next = equipped ? {...equipped} : {weapon: null, charm: null, armor: null};
  for (const slot of EQUIP_SLOTS) {
    if (next[slot] === undefined) next[slot] = null;
    if (slot !== item.slot && next[slot] === id) next[slot] = null;
  }
  next[item.slot] = id;
  profile.equipped = next;
  return {ok: true};
}

function levelForPurchase(profile, id) {
  const permanent = profile.permanent;
  if (permanent == null) return 0;
  if (typeof permanent !== 'object' || Array.isArray(permanent)) return null;
  if (!Object.hasOwn(permanent, id) || permanent[id] == null) return 0;
  const value = permanent[id];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function purchasePermanent(profile, id) {
  if (!isProfile(profile)) return fail('invalidProfile');
  const spec = typeof id === 'string' ? PERMANENT_UPGRADES[id] : null;
  if (!spec) return fail('unknownUpgrade');
  const level = levelForPurchase(profile, id);
  if (level == null) return fail('invalidProfile');
  if (level >= spec.cap) return fail('maxLevel');
  const currency = currencyOf(profile);
  if (currency == null) return fail('invalidProfile');
  const cost = spec.costs[level];
  if (currency < cost) return fail('insufficientCurrency');
  const permanent = profile.permanent && typeof profile.permanent === 'object' && !Array.isArray(profile.permanent)
    ? {...profile.permanent}
    : {damage: 0, haste: 0, vitality: 0};
  for (const key of PERMANENT_KEYS) {
    if (permanent[key] == null) permanent[key] = 0;
  }
  permanent[id] = level + 1;
  profile.currency = currency - cost;
  profile.permanent = permanent;
  return {ok: true};
}

function buyRank(id) {
  return NEXT_BUY_RANK[id] ?? 50;
}

/**
 * The next Armory action after a loss. An owned item in an empty slot comes first.
 * Otherwise the cheapest remaining purchase, with the fence ahead of a tie.
 * Null when nothing is left to buy or equip.
 */
function nextArmoryBuy(profile) {
  if (!isProfile(profile)) return null;
  const currency = currencyOf(profile);
  if (currency == null) return null;
  const equipped = profile.equipped && typeof profile.equipped === 'object' && !Array.isArray(profile.equipped)
    ? profile.equipped
    : {};
  const owned = Array.isArray(profile.equipmentOwned) ? profile.equipmentOwned : [];
  const waiting = [];
  for (const id of owned) {
    const item = EQUIPMENT[id];
    if (!item || equipped[item.slot]) continue;
    waiting.push(item);
  }
  if (waiting.length) {
    waiting.sort((a, b) => buyRank(a.id) - buyRank(b.id) || a.id.localeCompare(b.id));
    const item = waiting[0];
    return {kind: 'equip', id: item.id, cost: 0, short: 0, affordable: true, name: item.name};
  }
  const options = [];
  for (const id of PERMANENT_KEYS) {
    const spec = PERMANENT_UPGRADES[id];
    const level = levelForPurchase(profile, id);
    if (level == null || level >= spec.cap) continue;
    options.push({kind: 'permanent', id, cost: spec.costs[level], name: spec.name});
  }
  for (const [id, item] of Object.entries(EQUIPMENT)) {
    if (owns(profile, id)) continue;
    options.push({kind: 'equipment', id, cost: item.cost, name: item.name});
  }
  if (!options.length) return null;
  options.sort((a, b) => a.cost - b.cost || buyRank(a.id) - buyRank(b.id) || a.id.localeCompare(b.id));
  const pick = options[0];
  const short = Math.max(0, pick.cost - currency);
  return {kind: pick.kind, id: pick.id, cost: pick.cost, short, affordable: short === 0, name: pick.name};
}

function cleanNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function isSettlement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.runId === 'string'
    && typeof value.currency === 'number' && Number.isFinite(value.currency)
    && typeof value.result === 'string'
    && typeof value.difficulty === 'string'
    && typeof value.time === 'number' && Number.isFinite(value.time)
    && typeof value.kills === 'number' && Number.isFinite(value.kills)
    && typeof value.wave === 'number' && Number.isFinite(value.wave);
}

function readDifficulty(state) {
  return typeof state.difficulty === 'string' && state.difficulty ? state.difficulty : 'normal';
}

function rewardMultiplier(difficulty) {
  const spec = DIFFICULTIES[difficulty];
  return spec && typeof spec.reward === 'number' && Number.isFinite(spec.reward) ? spec.reward : 1;
}

function resolveResult(state) {
  if (state.phase === 'victory') return 'victory';
  if (state.phase === 'defeat') return 'defeat';
  return 'abandon';
}

function unpaidAbandon(time, kills) {
  if (time <= 0) return true;
  return time < PROGRESSION_RULES.freshTime && kills < PROGRESSION_RULES.freshKills;
}

function progressPoints(time, kills, wave) {
  const rules = PROGRESSION_RULES;
  const countedTime = clamp(time, 0, rules.timeCap);
  const countedKills = clamp(kills, 0, rules.killCap);
  const countedWave = clamp(wave, 0, rules.waveCap);
  return Math.floor(countedTime / rules.secondsPerPoint)
    + Math.floor(countedKills / rules.killsPerPoint)
    + Math.floor(countedWave) * rules.pointsPerWave;
}

function basePoints(time, kills, wave, result) {
  if (result === 'abandon' && unpaidAbandon(time, kills)) return 0;
  let points = progressPoints(time, kills, wave);
  if (result === 'victory') points += PROGRESSION_RULES.victoryBonus;
  if (result === 'abandon') {
    // A run past the fresh-abandon gate pays at least one point, then half progress.
    points = Math.floor(points / PROGRESSION_RULES.abandonDivisor);
    if (points < 1) points = 1;
  }
  return points;
}

function currencyFor(points, difficulty, rewardFraction) {
  if (points <= 0) return 0;
  const bonus = clamp(rewardFraction, 0, PROGRESSION_RULES.rewardFractionCap);
  return Math.max(0, Math.round(points * rewardMultiplier(difficulty) * (1 + bonus)));
}

function payableAmount(profile, amount) {
  if (amount <= 0) return 0;
  let current = profile.currency;
  if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) current = 0;
  const next = Math.min(PROGRESSION_RULES.maxCurrency, current + amount);
  return next - current;
}

function addCurrency(profile, amount) {
  let current = profile.currency;
  if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) current = 0;
  profile.currency = current + amount;
}

function ensureLedger(profile) {
  if (!Array.isArray(profile.settledRuns)) profile.settledRuns = [];
  const ledger = profile.settlementLedger;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) profile.settlementLedger = {};
}

function hasSettled(profile, runId) {
  return typeof runId === 'string' && runId !== '' && Array.isArray(profile.settledRuns) && profile.settledRuns.includes(runId);
}

function ledgerSettlement(profile, runId) {
  if (typeof runId !== 'string' || runId === '') return null;
  const ledger = profile.settlementLedger;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return null;
  const saved = ledger[runId];
  return isSettlement(saved) ? saved : null;
}

function remember(profile, settlement) {
  const id = settlement.runId;
  if (typeof id !== 'string' || id === '') return;
  ensureLedger(profile);
  if (!profile.settledRuns.includes(id)) {
    profile.settledRuns.push(id);
    while (profile.settledRuns.length > PAID_RUN_LIMIT) {
      const old = profile.settledRuns.shift();
      if (old) delete profile.settlementLedger[old];
    }
  }
  if (!profile.settlementLedger[id]) profile.settlementLedger[id] = settlement;
  const recent = new Set(profile.settledRuns.slice(-PROGRESSION_RULES.settledRunLimit));
  for (const key of Object.keys(profile.settlementLedger)) {
    if (!recent.has(key)) delete profile.settlementLedger[key];
  }
}

function progressionBag(state) {
  const systems = state.systems;
  if (!systems || typeof systems !== 'object' || Array.isArray(systems)) return null;
  const bag = systems.progression;
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  return bag;
}

// A missing run id cannot be stored on the profile. Keep the first payout on the run.
function rememberUnkeyed(state, settlement) {
  if (!settlement || settlement.runId !== '') return;
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  const bag = progressionBag(state);
  const next = bag ? {...bag} : {};
  if (!isSettlement(next.settlement)) next.settlement = settlement;
  state.systems.progression = next;
}

function unkeyedSettlement(state) {
  const bag = progressionBag(state);
  if (!bag) return null;
  return isSettlement(bag.settlement) ? bag.settlement : null;
}

function updateBest(profile, settlement) {
  if (settlement.result === 'abandon' && settlement.currency <= 0) return;
  if (!profile.best || typeof profile.best !== 'object' || Array.isArray(profile.best)) profile.best = {};
  const prev = profile.best[settlement.difficulty];
  const prevObj = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  let bestVictoryTime = typeof prevObj.bestVictoryTime === 'number' && Number.isFinite(prevObj.bestVictoryTime)
    ? prevObj.bestVictoryTime
    : null;
  if (settlement.result === 'victory') {
    bestVictoryTime = bestVictoryTime == null ? settlement.time : Math.min(bestVictoryTime, settlement.time);
  }
  const victories = (typeof prevObj.victories === 'number' && Number.isFinite(prevObj.victories) ? prevObj.victories : 0)
    + (settlement.result === 'victory' ? 1 : 0);
  profile.best[settlement.difficulty] = {
    wave: Math.max(cleanNumber(prevObj.wave), settlement.wave),
    kills: Math.max(cleanNumber(prevObj.kills), settlement.kills),
    time: Math.max(cleanNumber(prevObj.time), settlement.time),
    currency: Math.max(cleanNumber(prevObj.currency), settlement.currency),
    victories,
    bestVictoryTime
  };
}

function victoryStars(state) {
  const hp = Number.isFinite(state?.fence?.hp) ? state.fence.hp : 0;
  const maxHp = Number.isFinite(state?.fence?.maxHp) && state.fence.maxHp > 0 ? state.fence.maxHp : 1;
  if (hp <= 0) return 0;
  const ratio = hp / maxHp;
  if (ratio >= 0.999) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

// One victorious stage clear, written only on the first settlement of a run.
function recordExpedition(profile, state, settlement) {
  if (!settlement || settlement.result !== 'victory') return;
  const id = typeof state.expedition === 'string' && state.expedition ? state.expedition : 'watch';
  if (!profile.expeditions || typeof profile.expeditions !== 'object' || Array.isArray(profile.expeditions)) profile.expeditions = {};
  const prev = profile.expeditions[id];
  const prevClears = prev && typeof prev === 'object' && Number.isFinite(prev.clears) ? prev.clears : 0;
  const prevBest = prev && typeof prev === 'object' && Number.isFinite(prev.bestTime) ? prev.bestTime : null;
  const prevStars = prev && typeof prev === 'object' && Number.isFinite(prev.stars) ? prev.stars : 0;
  const time = Number.isFinite(settlement.time) ? settlement.time : 0;
  const earnedStars = Number.isFinite(settlement.stars) ? settlement.stars : victoryStars(state);
  profile.expeditions[id] = {
    clears: prevClears + 1,
    bestTime: prevBest == null ? time : Math.min(prevBest, time),
    stars: Math.max(prevStars, earnedStars),
  };
}

function buildSettlement(state, currency, result, extra = null) {
  const out = {
    runId: typeof state.runId === 'string' ? state.runId : '',
    currency,
    difficulty: readDifficulty(state),
    result,
    time: cleanNumber(state.time),
    kills: cleanNumber(state.kills),
    wave: cleanNumber(state.wave)
  };
  if (extra && Number.isFinite(extra.stars) && extra.stars > 0) out.stars = extra.stars;
  if (extra && Number.isFinite(extra.firstClearBonus) && extra.firstClearBonus > 0) out.firstClearBonus = extra.firstClearBonus;
  return out;
}

function earnedCurrency(state, result) {
  const time = cleanNumber(state.time);
  const kills = cleanNumber(state.kills);
  const wave = cleanNumber(state.wave);
  const points = basePoints(time, kills, wave, result);
  const snapshot = state.profileSnapshot;
  const rewardFraction = isProfile(snapshot) ? getProfileBonuses(snapshot).reward : 0;
  return currencyFor(points, readDifficulty(state), rewardFraction);
}

function stageFirstClearBonus(profile, state, result) {
  if (result !== 'victory') return 0;
  const id = typeof state.expedition === 'string' ? state.expedition : '';
  const spec = EXPEDITIONS[id];
  if (!spec || !Number.isFinite(spec.firstClearBonus) || spec.firstClearBonus <= 0) return 0;
  const prevClears = Number(profile?.expeditions?.[id]?.clears) || 0;
  return prevClears === 0 ? spec.firstClearBonus : 0;
}

function settleRun(profile, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {runId: '', currency: 0, difficulty: 'normal', result: 'abandon', time: 0, kills: 0, wave: 0};
  }
  if (isSettlement(state.settlement)) {
    if (isProfile(profile) && !hasSettled(profile, state.settlement.runId)) remember(profile, state.settlement);
    rememberUnkeyed(state, state.settlement);
    return state.settlement;
  }
  if (!isProfile(profile)) return Object.freeze(buildSettlement(state, earnedCurrency(state, resolveResult(state)), resolveResult(state)));
  const runId = typeof state.runId === 'string' ? state.runId : '';
  if (runId === '') {
    const locked = unkeyedSettlement(state);
    if (locked) {
      state.settlement = locked;
      return locked;
    }
  }
  const saved = ledgerSettlement(profile, runId);
  if (hasSettled(profile, runId) || saved) {
    if (saved) {
      state.settlement = saved;
      if (!hasSettled(profile, runId)) remember(profile, saved);
      return saved;
    }
    // The id was paid, but the full result aged out of the ledger. Do not pay again.
    const restored = Object.freeze(buildSettlement(state, 0, resolveResult(state)));
    state.settlement = restored;
    remember(profile, restored);
    rememberUnkeyed(state, restored);
    return restored;
  }
  const result = resolveResult(state);
  const firstClearBonus = stageFirstClearBonus(profile, state, result);
  const stars = result === 'victory' ? victoryStars(state) : 0;
  const amount = payableAmount(profile, earnedCurrency(state, result) + firstClearBonus);
  const settlement = Object.freeze(buildSettlement(state, amount, result, {stars, firstClearBonus}));
  state.settlement = settlement;
  addCurrency(profile, amount);
  remember(profile, settlement);
  rememberUnkeyed(state, settlement);
  updateBest(profile, settlement);
  recordExpedition(profile, state, settlement);
  return settlement;
}

};
__ff_factories["src/systems/status.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["statusDurationScale"] = statusDurationScale;
__ff_exports["applyStatus"] = applyStatus;
__ff_exports["getSpeedFactor"] = getSpeedFactor;
__ff_exports["isStunned"] = isStunned;
__ff_exports["getDamageTakenFactor"] = getDamageTakenFactor;
__ff_exports["updateStatuses"] = updateStatuses;
const __ff_m0 = __ff_load("src/shared.js");
const clamp = __ff_m0["clamp"];
const emit = __ff_m0["emit"];
/**
 * Enemy status effects. One object of each type is stored on enemy.statuses.
 * This module does not import combat. DOT damage is delivered through the
 * damageEnemy-shaped callback so kill credit, armor, and XP stay in combat.
 *
 * Status: {type, power, remaining, sourceId, stacks?, tickTimer?, maxStacks?}
 *   burn     power = damage per second, no stacks. Weaker burns are ignored.
 *   poison   power = damage per second per stack. Stacks grow by 1 up to
 *            maxStacks (default 5, hard cap 8). Highest power and highest
 *            maxStacks are kept. Duration is refreshed, never added.
 *   slow     power = remaining speed factor, e.g. 0.65 keeps 65% speed.
 *            Clamped to [0.2, 1). Stronger means a lower factor. 0 is rejected;
 *            a full stop is stun. getSpeedFactor does not write enemy.speed.
 *   stun     movement factor 0. Remaining is capped at 4s so hits cannot
 *            bank a long lock. isStunned is separate from death.
 *   brittle  power = bonus fraction of damage taken (0.25 = +25%), cap +100%.
 *            Combat should multiply incoming damage by getDamageTakenFactor
 *            once, before armor. DOT amounts passed to the callback are raw.
 *
 * Reapplying never shortens a live effect and never sums durations. The longer
 * remaining time is kept, then clamped (16s, or 4s for stun). Equal or
 * stronger burns/slows/brittles refresh; a weaker one is left untouched.
 * Poison still adds a stack when it does not increase power.
 *
 * DOT uses a 0.25s cadence. tickTimer accumulates unpaid seconds, including
 * across large dt, and a leftover partial is paid when the effect expires.
 * Payment stops once enemy.dead or hp <= 0, so a long step cannot keep
 * damaging a corpse. tickTimer is presentation/cadence state and is part of
 * the serializable status so a saved run keeps its phase.
 *
 * Callback options: {sourceId, type:'burn'|'poison', crit:false, dot:true}.
 * dot:true means combat must not re-apply on-hit statuses.
 *
 * applyStatus has no run state. Apply/refresh markers are flushed on the next
 * updateStatuses call (combat runs after statuses, so the event is one step
 * later). Events use type 'status' and action 'apply' | 'refresh' | 'expire'.
 * Intensity changes emit refresh; a pure duration refresh does not.
 *
 * Optional hooks for bosses: enemy.statusImmune = ['stun'], and
 * enemy.statusResist = {slow: 0.5} shortens that type's incoming duration
 * (1 = immune). Unknown status entries are preserved.
 *
 * updateStatuses does not advance time, tick, or RNG, and does not remove
 * enemies. It no-ops when paused, hiddenPaused, or phase is a non-playing
 * string. A partial state with no phase still updates.
 */


const STATUS_TYPES = Object.freeze(['burn', 'poison', 'slow', 'stun', 'brittle']);
__ff_exports["STATUS_TYPES"] = STATUS_TYPES;


const STATUS_LIMITS = Object.freeze({
  maxDuration: 16,
  maxStun: 4,
  minSlow: 0.2,
  maxBrittle: 1,
  maxBurnDps: 400,
  maxPoisonDps: 200,
  defaultPoisonStacks: 5,
  maxPoisonStacks: 8,
  dotTick: 0.25
});
__ff_exports["STATUS_LIMITS"] = STATUS_LIMITS;


const TYPES = new Set(STATUS_TYPES);
const DOT_TYPES = new Set(['burn', 'poison']);
const EPS = 1e-4;
const pendingNotify = new WeakMap();

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDead(enemy) {
  if (!enemy || enemy.dead === true) return true;
  return finite(enemy.hp) && enemy.hp <= 0;
}

function cleanSource(id) {
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

function durationCap(type) {
  return type === 'stun' ? STATUS_LIMITS.maxStun : STATUS_LIMITS.maxDuration;
}

function immune(enemy, type) {
  const list = enemy && (enemy.statusImmune || enemy.immune);
  return Array.isArray(list) && list.includes(type);
}

function statusDurationScale(enemy, type) {
  const table = enemy && enemy.statusResist;
  if (!table || typeof table !== 'object') return 1;
  const resist = table[type];
  if (!finite(resist)) return 1;
  return 1 - clamp(resist, 0, 1);
}

function readPower(type, input) {
  if (finite(input.power)) return input.power;
  if (type === 'slow' && finite(input.factor)) return input.factor;
  if ((type === 'burn' || type === 'poison') && finite(input.dps)) return input.dps;
  if (type === 'brittle' && finite(input.bonus)) return input.bonus;
  if (type === 'stun') return 1;
  return NaN;
}

function readDuration(input) {
  if (finite(input.remaining)) return input.remaining;
  if (finite(input.duration)) return input.duration;
  return NaN;
}

function readMaxStacks(input, previous) {
  const requested = finite(input.maxStacks) ? Math.floor(input.maxStacks) : STATUS_LIMITS.defaultPoisonStacks;
  const prior = finite(previous) ? previous : 0;
  return clamp(Math.max(prior, requested), 1, STATUS_LIMITS.maxPoisonStacks);
}

function normalize(enemy, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, reason: 'invalid'};
  const type = typeof input.type === 'string' ? input.type.toLowerCase() : '';
  if (!TYPES.has(type)) return {ok: false, reason: 'invalid'};
  if (isDead(enemy)) return {ok: false, reason: 'dead'};
  if (immune(enemy, type)) return {ok: false, reason: 'immune'};

  let power = readPower(type, input);
  let remaining = readDuration(input);
  if (!finite(remaining) || remaining <= EPS) return {ok: false, reason: 'invalid'};
  if (type !== 'stun' && !finite(power)) return {ok: false, reason: 'invalid'};

  remaining = clamp(remaining * statusDurationScale(enemy, type), 0, durationCap(type));
  if (remaining <= EPS) return {ok: false, reason: 'immune'};

  if (type === 'burn') power = clamp(power, 0, STATUS_LIMITS.maxBurnDps);
  else if (type === 'poison') power = clamp(power, 0, STATUS_LIMITS.maxPoisonDps);
  else if (type === 'slow') {
    // 0 would freeze without counting as a stun, so it is invalid rather than clamped.
    if (power <= 0) return {ok: false, reason: 'invalid'};
    if (power >= 1) return {ok: false, reason: 'ineffective'};
    power = clamp(power, STATUS_LIMITS.minSlow, 1);
  } else if (type === 'brittle') power = clamp(power, 0, STATUS_LIMITS.maxBrittle);
  else power = 1;

  if ((type === 'burn' || type === 'poison' || type === 'brittle') && power <= 0) return {ok: false, reason: 'ineffective'};

  return {
    ok: true,
    spec: {
      type,
      power,
      remaining,
      sourceId: cleanSource(input.sourceId),
      maxStacks: type === 'poison' ? readMaxStacks(input, 0) : 1
    }
  };
}

function ensureList(enemy) {
  if (!Array.isArray(enemy.statuses)) enemy.statuses = [];
  return enemy.statuses;
}

function sameType(list, type) {
  const found = [];
  for (const status of list) {
    if (status && status.type === type) found.push(status);
  }
  return found;
}

function mergeDuplicate(keep, extra) {
  const type = keep.type;
  if (type === 'slow') keep.power = Math.min(finite(keep.power) ? keep.power : 1, finite(extra.power) ? extra.power : 1);
  else if (type === 'stun') keep.power = 1;
  else keep.power = Math.max(finite(keep.power) ? keep.power : 0, finite(extra.power) ? extra.power : 0);
  keep.remaining = Math.max(finite(keep.remaining) ? keep.remaining : 0, finite(extra.remaining) ? extra.remaining : 0);
  if (type === 'poison') {
    const stacks = (finite(keep.stacks) ? keep.stacks : 1) + (finite(extra.stacks) ? extra.stacks : 1);
    keep.maxStacks = readMaxStacks(keep, finite(extra.maxStacks) ? extra.maxStacks : 0);
    keep.stacks = clamp(Math.round(stacks), 1, keep.maxStacks);
  }
  if (DOT_TYPES.has(type)) {
    const accrued = Math.max(finite(keep.tickTimer) ? keep.tickTimer : 0, finite(extra.tickTimer) ? extra.tickTimer : 0);
    keep.tickTimer = Math.min(accrued, STATUS_LIMITS.maxDuration);
  }
}

function collapse(list) {
  const out = [];
  const index = new Map();
  for (const status of list) {
    if (!status || typeof status !== 'object') continue;
    if (!TYPES.has(status.type)) {
      out.push(status);
      continue;
    }
    const prior = index.get(status.type);
    if (!prior) {
      index.set(status.type, status);
      out.push(status);
      continue;
    }
    mergeDuplicate(prior, status);
  }
  return out;
}

function markNotify(status, action) {
  // Keep the original apply if this object has not been announced yet.
  if (pendingNotify.get(status) === 'apply') return;
  pendingNotify.set(status, action);
}

function takeNotify(status) {
  const action = pendingNotify.get(status);
  if (!action) return null;
  pendingNotify.delete(status);
  return action;
}

function blankStatus(spec) {
  const status = {
    type: spec.type,
    power: spec.power,
    remaining: spec.remaining,
    sourceId: spec.sourceId
  };
  if (spec.type === 'poison') {
    status.stacks = 1;
    status.maxStacks = spec.maxStacks;
    status.tickTimer = 0;
  } else if (spec.type === 'burn') {
    status.tickTimer = 0;
  }
  return status;
}

function stronger(type, next, prev) {
  if (!finite(prev)) return type !== 'stun';
  if (type === 'slow') return next < prev - 1e-6;
  if (type === 'stun') return false;
  return next > prev + 1e-6;
}

function powerEqual(type, next, prev) {
  if (type === 'stun') return true;
  if (!finite(prev)) return false;
  return Math.abs(next - prev) <= 1e-6;
}

/**
 * Apply or refresh one status on an enemy. Does not allocate ids or touch RNG.
 * Returns {ok, reason, status?, action?}. action is apply, refresh, unchanged, or reject.
 */
function applyStatus(enemy, status) {
  if (!enemy || typeof enemy !== 'object') return {ok: false, reason: 'invalid', action: 'reject'};
  const normalized = normalize(enemy, status);
  if (!normalized.ok) return {ok: false, reason: normalized.reason, action: 'reject'};
  const spec = normalized.spec;
  const list = collapse(ensureList(enemy));
  enemy.statuses = list;
  const existing = sameType(list, spec.type)[0] || null;

  if (!existing) {
    const created = blankStatus(spec);
    list.push(created);
    markNotify(created, 'apply');
    return {ok: true, reason: 'applied', action: 'apply', status: created};
  }

  const cap = durationCap(spec.type);
  let changed = false;
  if (spec.type === 'poison') {
    const maxStacks = readMaxStacks(spec, existing.maxStacks);
    const currentStacks = clamp(Math.round(finite(existing.stacks) ? existing.stacks : 1), 1, maxStacks);
    const stacks = clamp(currentStacks + 1, 1, maxStacks);
    const currentPower = finite(existing.power) ? existing.power : 0;
    const power = clamp(Math.max(currentPower, spec.power), 0, STATUS_LIMITS.maxPoisonDps);
    const currentRemaining = finite(existing.remaining) ? existing.remaining : 0;
    const remaining = clamp(Math.max(currentRemaining, spec.remaining), 0, cap);
    if (maxStacks !== existing.maxStacks || stacks !== currentStacks || power !== currentPower || remaining - currentRemaining > 1e-6) {
      changed = stacks !== currentStacks || power - currentPower > 1e-6;
      existing.maxStacks = maxStacks;
      existing.stacks = stacks;
      existing.power = power;
      existing.remaining = remaining;
      existing.sourceId = spec.sourceId;
      if (!finite(existing.tickTimer) || existing.tickTimer < 0) existing.tickTimer = 0;
      if (changed) markNotify(existing, 'refresh');
      return {ok: true, reason: 'refreshed', action: 'refresh', status: existing};
    }
    return {ok: true, reason: 'unchanged', action: 'unchanged', status: existing};
  }

  const prevPower = finite(existing.power) ? existing.power : (spec.type === 'slow' ? 1 : 0);
  const prevRemaining = finite(existing.remaining) ? existing.remaining : 0;
  const upgraded = stronger(spec.type, spec.power, prevPower);
  const equal = powerEqual(spec.type, spec.power, prevPower);
  if (!upgraded && !equal) return {ok: false, reason: 'weaker', action: 'reject', status: existing};

  const remaining = clamp(Math.max(prevRemaining, spec.remaining), 0, cap);
  const nextPower = spec.type === 'slow'
    ? Math.min(prevPower, spec.power)
    : spec.type === 'stun' ? 1 : Math.max(prevPower, spec.power);
  if (nextPower !== existing.power || remaining - existing.remaining > 1e-6) {
    const intensified = spec.type !== 'stun' && Math.abs(nextPower - existing.power) > 1e-6;
    existing.power = nextPower;
    existing.remaining = remaining;
    existing.sourceId = spec.sourceId;
    if (intensified) markNotify(existing, 'refresh');
    return {ok: true, reason: 'refreshed', action: 'refresh', status: existing};
  }
  return {ok: true, reason: 'unchanged', action: 'unchanged', status: existing};
}

/** 0 when dead or stunned, otherwise the strongest slow factor, or 1. */
function getSpeedFactor(enemy) {
  if (!enemy || typeof enemy !== 'object') return 1;
  if (isDead(enemy)) return 0;
  const list = Array.isArray(enemy.statuses) ? enemy.statuses : null;
  if (!list) return 1;
  let factor = 1;
  for (const status of list) {
    if (!status || !(status.remaining > 0)) continue;
    if (status.type === 'stun') return 0;
    if (status.type === 'slow' && finite(status.power)) {
      factor = Math.min(factor, clamp(status.power, STATUS_LIMITS.minSlow, 1));
    }
  }
  return factor;
}

/** True only for a living enemy with a stun that still has time left. */
function isStunned(enemy) {
  if (!enemy || typeof enemy !== 'object' || isDead(enemy)) return false;
  const list = enemy.statuses;
  if (!Array.isArray(list)) return false;
  return list.some(status => status && status.type === 'stun' && status.remaining > 0);
}

/**
 * Damage taken multiplier from brittle. 1 means no bonus.
 * Apply once in damageEnemy before the armor reduction.
 */
function getDamageTakenFactor(enemy) {
  if (!enemy || typeof enemy !== 'object' || isDead(enemy)) return 1;
  const list = enemy.statuses;
  if (!Array.isArray(list)) return 1;
  let bonus = 0;
  for (const status of list) {
    if (!status || status.type !== 'brittle' || !(status.remaining > 0) || !finite(status.power)) continue;
    bonus += Math.max(0, status.power);
  }
  return 1 + Math.min(STATUS_LIMITS.maxBrittle, bonus);
}

function dotDps(status) {
  if (!status || !finite(status.power) || status.power <= 0) return 0;
  if (status.type === 'burn') return clamp(status.power, 0, STATUS_LIMITS.maxBurnDps);
  if (status.type === 'poison') {
    const stacks = clamp(finite(status.stacks) ? status.stacks : 1, 1, STATUS_LIMITS.maxPoisonStacks);
    return clamp(status.power, 0, STATUS_LIMITS.maxPoisonDps) * stacks;
  }
  return 0;
}

function emitStatus(state, enemy, status, action, damage) {
  if (!state || !Array.isArray(state.events)) return;
  const data = {
    action,
    statusType: status.type,
    enemyId: enemy.id ?? null,
    sourceId: status.sourceId ?? null,
    power: status.power,
    stacks: finite(status.stacks) ? status.stacks : 1,
    remaining: Math.max(0, finite(status.remaining) ? status.remaining : 0)
  };
  if (finite(enemy.x)) data.x = enemy.x;
  if (finite(enemy.y)) data.y = enemy.y;
  if (finite(damage) && damage > 0) data.damage = damage;
  emit(state, 'status', data);
}

function flushNotify(state, enemy, status) {
  const action = takeNotify(status);
  if (action) emitStatus(state, enemy, status, action);
}

function drainUnpaid(status) {
  const tick = STATUS_LIMITS.dotTick;
  if (!finite(status.tickTimer) || status.tickTimer < 0) status.tickTimer = 0;
  // Discard whole unpaid ticks. Keeping only the phase stops a later callback
  // from bursting damage for time that was never paid.
  status.tickTimer %= tick;
  if (status.remaining <= EPS) status.tickTimer = 0;
}

function damageOptions(status) {
  const type = status.type;
  const options = {sourceId: status.sourceId ?? null, type, crit: false, dot: true};
  if (type === 'burn' || type === 'poison') options.towerType = type;
  return options;
}

function payDot(state, enemy, status, dps, damageCallback) {
  const tick = STATUS_LIMITS.dotTick;
  let guard = 0;
  while (status.tickTimer >= tick - 1e-8 && !isDead(enemy) && guard++ < 160) {
    // The cadence tolerance may pay a tick a fraction before the boundary.
    // Keep the remainder non-negative so every live frame is saveable.
    status.tickTimer = Math.max(0, status.tickTimer - tick);
    damageCallback(state, enemy, dps * tick, damageOptions(status));
  }
  // Leftover below one tick is paid only when the effect ends, so totals match
  // dps * duration without a large-step burst after death.
  if (!isDead(enemy) && status.remaining <= EPS && status.tickTimer > EPS && status.tickTimer < tick + EPS) {
    const partial = status.tickTimer;
    status.tickTimer = 0;
    damageCallback(state, enemy, dps * partial, damageOptions(status));
  }
  if (isDead(enemy) || status.remaining <= EPS) status.tickTimer = 0;
}

function advanceClock(status, dt) {
  const starting = finite(status.remaining) ? Math.max(0, status.remaining) : 0;
  const budget = Math.min(dt, starting);
  let remaining = starting - dt;
  if (!(remaining > EPS)) remaining = 0;
  status.remaining = remaining;
  return budget;
}

function applyDot(state, enemy, status, dt, damageCallback) {
  const budget = advanceClock(status, dt);
  if (!finite(status.tickTimer) || status.tickTimer < 0) status.tickTimer = 0;
  if (status.tickTimer > STATUS_LIMITS.maxDuration) status.tickTimer = STATUS_LIMITS.maxDuration;
  status.tickTimer += budget;
  const dps = dotDps(status);
  const canDamage = dps > 0 && typeof damageCallback === 'function' && !isDead(enemy);
  if (!canDamage) {
    drainUnpaid(status);
    return;
  }
  payDot(state, enemy, status, dps, damageCallback);
}

function expireStatuses(state, enemy, processing) {
  const keep = [];
  const seen = new Set();
  for (const status of enemy.statuses) {
    if (!status || typeof status !== 'object') continue;
    if (!TYPES.has(status.type)) {
      keep.push(status);
      continue;
    }
    if (seen.has(status.type)) continue;
    seen.add(status.type);
    if (finite(status.remaining) && status.remaining > EPS) {
      keep.push(status);
      continue;
    }
    status.remaining = 0;
    if (processing.includes(status)) emitStatus(state, enemy, status, 'expire');
  }
  enemy.statuses = keep;
}

function simulating(state) {
  if (state.paused === true || state.hiddenPaused === true) return false;
  if (typeof state.phase === 'string' && state.phase !== 'playing') return false;
  return true;
}

/**
 * Advance every enemy's statuses by dt simulation seconds.
 * damageCallback(state, enemy, amount, options) matches damageEnemy.
 * Safe to omit the callback when only timers should move.
 */
let statusDepth = 0;

function updateStatuses(state, dt, damageCallback) {
  if (!state || !Array.isArray(state.enemies)) return;
  if (!simulating(state)) return;
  if (!finite(dt) || dt < 0) return;
  if (statusDepth > 0) return;
  statusDepth += 1;
  try {
    const enemies = state.enemies.slice();
    for (const enemy of enemies) {
      if (!enemy || typeof enemy !== 'object' || !Array.isArray(enemy.statuses)) continue;
      if (enemy.statuses.length === 0) continue;
      enemy.statuses = collapse(enemy.statuses);
      const processing = enemy.statuses.slice();
      for (const status of processing) flushNotify(state, enemy, status);
      if (dt > 0) {
        for (const type of ['burn', 'poison']) {
          const status = processing.find(item => item.type === type);
          if (status) applyDot(state, enemy, status, dt, damageCallback);
        }
        for (const status of processing) {
          if (!TYPES.has(status.type) || DOT_TYPES.has(status.type)) continue;
          if (!finite(status.remaining)) {
            status.remaining = 0;
            continue;
          }
          advanceClock(status, dt);
        }
      }
      expireStatuses(state, enemy, processing);
    }
  } finally {
    statusDepth -= 1;
  }
}

};
__ff_factories["src/systems/waves.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["updateWaves"] = updateWaves;
__ff_exports["getWaveInfo"] = getWaveInfo;
__ff_exports["bossApproaching"] = bossApproaching;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/enemies.js");
const __ff_m2 = __ff_load("src/data/expeditions.js");
const __ff_m3 = __ff_load("src/systems/movement.js");
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const STEP = __ff_m0["STEP"];
const emit = __ff_m0["emit"];
const ENEMIES = __ff_m1["ENEMIES"];
const EXPEDITIONS = __ff_m2["EXPEDITIONS"];
const spawnEnemy = __ff_m3["spawnEnemy"];
// Campaign, sortie and endless schedules advance exclusively on simulation time.





const INTRO_HINTS = {
  shambler: {
    en: 'Ash shamblers are crossing the field. Defeat these six to open the first upgrade.',
    zh: '灰烬蹒者正在逼近城墙。击倒 6 只即可触发首次升级选卡！',
  },
  runner: {
    en: 'Wire runners are in the line. They reach the wall early, so drop them fast.',
    zh: '线驰者混进了尸潮。它们移动很快会先贴近城墙，优先清理。',
  },
  swarm: {
    en: 'Dust gnawers arrive in bunches. Area skills sweep them away cleanly.',
    zh: '尘啮成群涌来，靠火海和范围自动技能一波清场！',
  },
  spitter: {
    en: 'Stops 135 px from the wall and spits acid. Set Priority targeting to drop it fast.',
    zh: '腐浆喷者会在中距离停步喷酸，切「高危」索敌优先集火清理。',
  },
  armored: {
    en: 'Plate walkers block over half of each hit. Armor Pierce and burns melt them.',
    zh: '板甲行者护甲极厚，用穿甲弹芯或燃烧伤害快速击穿。',
  },
  brute: {
    en: 'Gate brutes are slow, huge, and slam the wall very hard.',
    zh: '闸门蛮兽体型巨大，贴墙后每次重击都会大幅损耗城墙血量。',
  },
  boss: {
    en: 'Crown Breach summons dust gnawers and enrages at half HP. Focus all firepower!',
    zh: '冠裂兽会不断召唤尘啮，半血后狂暴！集中所有火力与激光柱击溃它。',
  },
  leaper: {
    en: 'Crouches briefly then vaults forward. Frost slow and EM lightning stop its leap.',
    zh: '灰跃者蹲伏后会向前扑跃，急冻减速与电磁麻痹可有效打断其突袭。',
  },
  splitter: {
    en: 'Crack broods burst into two dust gnawers when killed.',
    zh: '裂巢阵亡后会分裂出两只尘啮，注意用范围火力清扫。',
  },
  mender: {
    en: 'Ash menders heal wounded allies nearby. Take them out early.',
    zh: '烬补者会持续治疗周围重伤僵尸，建议优先点杀。',
  },
  shade: {
    en: 'Phases every 1.4s to dodge direct bullets. Fire sea and burn still hurt it.',
    zh: '幽影每 1.4 秒虚化躲避直射，火海与持续灼烧在虚化期间依然有效。',
  },
  banner: {
    en: 'Standard wretches accelerate nearby zombies. Snipe the flag-bearer first!',
    zh: '旗孽会让周围尸群疯狂加速冲锋，务必优先点杀旗手！',
  },
  warden: {
    en: 'Ash wardens shield a nearby ally. Kill the warden first to break the shield.',
    zh: '烬卫会为附近同伴施加减伤护盾，先打掉它瓦解防御。',
  },
  charge: {
    en: 'Cinder charges light an explosive fuse at the wall. Kill them before the blast!',
    zh: '烬爆者贴墙后会点燃自爆引线，务必在爆炸前击杀或震退！',
  },
  hush: {
    en: 'While Ash Hush clamps to the wall, your fire rate drops. Clear it quickly!',
    zh: '烬寂贴墙时会拖慢攻速与技能充能，尽快将其击杀恢复火力！',
  },
};

// Hand-tunable campaign. `from`/`until`/`every` are simulation seconds.
// A phase without `rotate` repeats `groups`. `rotate` cycles group lists.
// Group: kind, count, interval seconds, optional delay, exact (skip count scaling),
// optional healthScale (passed through to spawnEnemy, still multiplied by difficulty health).
// Each formation streams for most of its window. Flag waves overlap the marching column.
function group(kind,count,interval,healthScale=1) {
  return {kind,count,interval,healthScale,exact:kind==='boss'};
}
function formation(id,en,zh,from,until,every,groups,horde=false) {
  const hints={
    first:{en:'Ash shamblers are crossing the field. Defeat these six to open the first draft.',zh:'灰烬蹒者正在过场。击倒这六只就能拿到第一次整备。'},
    vanguard:{en:'A lesser Crown Breach calls dust gnawers while alive. Half health only enrages it.',zh:'次冠兽存活期间都会召唤尘啮，半血只会让它狂暴。'},
    crown:{en:'Last foe: Crown Breach calls dust gnawers while alive. Half health only enrages it. Clear the field to win.',zh:'冠裂兽存活期间都会召唤尘啮，半血只会让它狂暴。清场即可获胜。'}
  };
  return {id,name:{en,zh},from,until,every,groups,horde,hint:hints[id]};
}
const PHASES = [
  formation('first','First ash','初烬',0.5,1.5,1,[group('shambler',6,0.65,0.42)]),
  formation('trail','Broken trail','断径',4.5,52.5,8,[group('shambler',6,1.45),group('runner',3,2.5)]),
  formation('dust','Dust cloud','尘潮',52.5,112.5,8,[group('swarm',11,0.72),group('shambler',5,1.5),group('runner',3,2.4)]),
  formation('flag-one','First flag','第一面战旗',110,111,1,[group('banner',1,0),group('swarm',28,0.22),group('runner',10,0.7)],true),
  formation('march','Ash march','灰烬行军',112,214,9,[group('shambler',9,0.95),group('swarm',12,0.75),group('armored',3,2.7,1.6),group('spitter',2,3,1.3)]),
  formation('vanguard','Crown vanguard','次冠先锋',215,216,1,[group('boss',1,0,0.45),group('shade',3,2),group('leaper',3,2.5)]),
  formation('breach','Breach patrol','裂隙巡队',218,295,9,[group('swarm',16,0.55),group('runner',7,1.3),group('splitter',2,3,1.4),group('mender',1,0)]),
  formation('flag-two','Black flag','第二面战旗',270,271,1,[group('banner',2,1),group('swarm',32,0.2),group('warden',2,2),group('charge',2,3)],true),
  formation('siege','Siege train','围城纵队',298,380,9,[group('swarm',16,0.52),group('shambler',8,1),group('brute',2,3,1.8),group('hush',1,0),group('leaper',2,2)]),
  formation('flag-three','Last flag','终局战旗',365,366,1,[group('banner',2,2),group('swarm',38,0.16),group('shade',6,0.85),group('charge',2,2)],true),
  formation('crown','Crown Breach','冠裂兽',380,381,1,[group('boss',1,0),group('warden',3,2),group('mender',2,1)]),
  formation('last','Last guard','末路护卫',382,421,8,[group('swarm',15,0.52),group('runner',6,1.3),group('armored',2,3),group('spitter',1,0)])
];

const ENDLESS_PATTERNS = [
  {
    name: {en: 'Unending ash', zh: '无尽灰烬'},
    groups: [
      {kind: 'shambler', count: 4, interval: 1.6},
      {kind: 'runner', count: 2, interval: 2, delay: 1},
    ],
  },
  {
    name: {en: 'Unending dust', zh: '无尽尘群'},
    groups: [
      {kind: 'swarm', count: 6, interval: 0.4},
      {kind: 'spitter', count: 2, interval: 2, delay: 1},
    ],
  },
  {
    name: {en: 'Unending plate', zh: '无尽板甲'},
    groups: [
      {kind: 'armored', count: 3, interval: 2},
      {kind: 'brute', count: 2, interval: 0, delay: 2},
      {kind: 'swarm', count: 3, interval: 0.8, delay: 0.4},
    ],
  },
  {
    name: {en: 'Unending sap', zh: '无尽腐浆'},
    groups: [
      {kind: 'spitter', count: 3, interval: 1.4},
      {kind: 'runner', count: 3, interval: 1.2, delay: 0.6},
    ],
  },
  {
    name: {en: 'Unending crown', zh: '无尽冠裂'},
    groups: [
      {kind: 'armored', count: 2, interval: 1.5},
      {kind: 'swarm', count: 4, interval: 0.45, delay: 0.4},
      {kind: 'boss', count: 1, interval: 0, delay: 2, exact: true},
    ],
  },
  {
    name: {en: 'Unending brood', zh: '无尽裂巢'},
    groups: [
      {kind: 'splitter', count: 2, interval: 2},
      {kind: 'swarm', count: 4, interval: 0.45, delay: 0.4},
      {kind: 'shade', count: 1, interval: 0, delay: 1.6},
    ],
  },
  {
    name: {en: 'Unending standard', zh: '无尽旗帜'},
    groups: [
      {kind: 'banner', count: 1, interval: 0},
      {kind: 'leaper', count: 2, interval: 1.6, delay: 0.8},
      {kind: 'mender', count: 1, interval: 0, delay: 1.4},
      {kind: 'armored', count: 1, interval: 0, delay: 2.4},
    ],
  },
  {
    name: {en: 'Unending ward', zh: '无尽烬卫'},
    groups: [
      {kind: 'warden', count: 1, interval: 0, exact: true},
      {kind: 'armored', count: 2, interval: 1.6, delay: 0.4},
      {kind: 'shambler', count: 3, interval: 0.7, delay: 0.8},
    ],
  },
  {
    name: {en: 'Unending fuse', zh: '无尽引线'},
    groups: [
      {kind: 'charge', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 3, interval: 0.8, delay: 0.5},
      {kind: 'runner', count: 1, interval: 0, delay: 1.2},
    ],
  },
  {
    name: {en: 'Unending hush', zh: '无尽静场'},
    groups: [
      {kind: 'hush', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 4, interval: 0.7},
    ],
  },
];

const WAVES = freezeDeep(buildWaves(PHASES));
__ff_exports["WAVES"] = WAVES;


const EXPEDITION_WAVES = {};
for (const id of Object.keys(EXPEDITIONS)) {
  const phases = EXPEDITIONS[id] && EXPEDITIONS[id].phases;
  if (Array.isArray(phases) && phases.length) EXPEDITION_WAVES[id] = freezeDeep(buildWaves(phases));
}

function activeSchedule(state) {
  const id = state && typeof state.expedition === 'string' ? state.expedition : '';
  return EXPEDITION_WAVES[id] || WAVES;
}

const SCHEDULE_END = lastSpawnTime(WAVES);

const EARLY_PULL_MIN_AGE = 2.2;
const EARLY_PULL_LIVING = 4;
const EARLY_PULL_QUEUED = 2;
const EARLY_BOSS_LEAD = 1.5;

function countAllLiving(state) {
  let total = 0;
  for (const enemy of state.enemies || []) if (isLive(enemy)) total += 1;
  return total;
}

function effectiveStart(wave, shift) {
  return quantize(Math.max(0, Number(wave.start) - (Number(shift) || 0)));
}

function updateWaves(state, dt = 0) {
  // state.time is the clock. dt stays in the signature for the lead's fixed step.
  void dt;
  if (!isSimulating(state)) return state;
  const director = ensureDirector(state);
  const sys = ensureWaves(state);
  if (!Array.isArray(state.events)) state.events = [];
  if (state.endless && director.done) director.done = false;
  const waves = activeSchedule(state);

  // Continuous-flow early pull-in:
  // - Wave 1 stays calm & unhurried until down to the last zombie (creating strong early-vs-late contrast).
  // - From Wave 2 onward, pull the next wave forward as soon as <= 4 living & <= 2 queued remain!
  if (director.nextWave > 0 && director.nextWave < waves.length && sys.waveStartedAt != null) {
    const waveAge = state.time - sys.waveStartedAt;
    const nextWave = waves[director.nextWave];
    const nextAt = effectiveStart(nextWave, sys.timeShift);
    const livingNow = countAllLiving(state);
    const livingCap = director.nextWave === 1 ? 1 : EARLY_PULL_LIVING;
    const queueCap = director.nextWave === 1 ? 0 : EARLY_PULL_QUEUED;
    const roadCleared = director.nextWave > 1 && waveAge >= 1.5 && livingNow === 0;
    const waveThinning = waveAge >= EARLY_PULL_MIN_AGE && director.queue.length <= queueCap && livingNow <= livingCap;
    if (state.time + 1e-6 < nextAt && (roadCleared || waveThinning)) {
      if (nextWave.boss) {
        if (nextAt - state.time > EARLY_BOSS_LEAD + 0.3) {
          sys.timeShift = quantize(Math.max(sys.timeShift, nextWave.start - (state.time + EARLY_BOSS_LEAD)));
        }
      } else {
        sys.timeShift = quantize(Math.max(sys.timeShift, nextWave.start - state.time));
      }
    }
  }

  while (director.nextWave < waves.length && state.time + 1e-6 >= effectiveStart(waves[director.nextWave], sys.timeShift)) {
    const wave = waves[director.nextWave];
    const startAt = effectiveStart(wave, sys.timeShift);
    const count = enqueueWave(state, sys, wave, startAt);
    director.nextWave += 1;
    state.wave = director.nextWave;
    if (wave.horde) {
      emit(state, 'wave_horde', {wave: state.wave, name: wave.name, count});
    }
    sys.waveStartedAt = state.time;
    sys.current = snapshotWave(wave);
    emit(state, 'wave_start', {
      wave: state.wave,
      id: wave.id,
      name: {en: wave.name.en, zh: wave.name.zh},
      hint: {en: wave.hint.en, zh: wave.hint.zh},
      intro: wave.intro,
    });
  }

  spawnDue(state);

  if (director.nextWave >= waves.length) {
    if (state.endless) {
      director.done = false;
      if (
        sys.endlessNext != null &&
        sys.waveStartedAt != null &&
        state.time - sys.waveStartedAt >= EARLY_PULL_MIN_AGE &&
        state.time + 1e-6 < sys.endlessNext &&
        director.queue.length <= EARLY_PULL_QUEUED &&
        countAllLiving(state) <= EARLY_PULL_LIVING
      ) {
        sys.endlessNext = quantize(state.time);
      }
      pumpEndless(state, sys);
      spawnDue(state);
    } else if (director.queue.length === 0) {
      if (!director.done) {
        director.done = true;
        if (!sys.doneEmitted) {
          sys.doneEmitted = true;
          emit(state, 'waves_complete', {wave: state.wave, time: state.time});
        }
      } else if (!sys.doneEmitted) {
        sys.doneEmitted = true;
        emit(state, 'waves_complete', {wave: state.wave, time: state.time});
      }
    }
  }

  syncBossFlag(state, director, sys);
  syncPlayerHint(state, director, sys);
  syncNextHint(state, director);
  updateBosses(state, sys);
  noteBossApproach(state, director);
  state.waveTime = sys.waveStartedAt == null ? 0 : Math.max(0, state.time - sys.waveStartedAt);
  return state;
}

function getWaveInfo(state) {
  const director = state?.director && typeof state.director === 'object'
    ? state.director
    : {nextWave: 0, queue: [], done: false};
  const queue = Array.isArray(director.queue) ? director.queue : [];
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const time = Number.isFinite(state?.time) ? state.time : 0;
  const stored = state?.systems?.waves?.current || null;
  const waves = activeSchedule(state);
  const catalogCurrent = started > 0 ? waves[Math.min(started, waves.length) - 1] : null;
  const current = stored || catalogCurrent;
  const upcomingWave = started >= 0 && started < waves.length ? waves[started] : null;
  const mult = countMultiplier(state);
  const incoming = {};
  let nextSpawnIn = null;
  for (const item of queue) {
    if (!item || typeof item.kind !== 'string') continue;
    incoming[item.kind] = (incoming[item.kind] || 0) + 1;
    if (Number.isFinite(item.time)) {
      const wait = Math.max(0, item.time - time);
      if (nextSpawnIn == null || wait < nextSpawnIn) nextSpawnIn = wait;
    }
  }
  const live = {};
  let bossAlive = false;
  let living = 0;
  for (const enemy of state?.enemies || []) {
    if (!isLive(enemy)) continue;
    living += 1;
    const kind = enemy.kind || 'unknown';
    live[kind] = (live[kind] || 0) + 1;
    if (kind === 'boss' || ENEMIES[kind]?.enrage) bossAlive = true;
  }
  const shift = Number(state?.systems?.waves?.timeShift) || 0;
  let nextIn = 0;
  if (upcomingWave) nextIn = Math.max(0, effectiveStart(upcomingWave, shift) - time);
  else if (state?.endless) {
    const at = state?.systems?.waves?.endlessNext;
    if (Number.isFinite(at)) nextIn = Math.max(0, at - time);
  }
  const quiet = {
    en: 'The wall is quiet. Zombies will crest the field in a moment.',
    zh: '城墙前一片寂静，第一波尸潮即将涌入！',
  };
  const name = current?.name || {en: 'Before the ash', zh: '灰烬未至'};
  const hint = current?.hint || quiet;
  return {
    wave: Number.isFinite(state?.wave) ? state.wave : 0,
    total: waves.length,
    done: !!director.done,
    endless: !!state?.endless,
    id: current?.id || null,
    name: {en: name.en, zh: name.zh},
    hint: {en: hint.en, zh: hint.zh},
    intro: current?.intro || null,
    nextId: upcomingWave?.id || null,
    nextName: upcomingWave ? {en: upcomingWave.name.en, zh: upcomingWave.name.zh} : null,
    nextHint: upcomingWave ? {en: upcomingWave.hint.en, zh: upcomingWave.hint.zh} : null,
    nextIn,
    nextSpawnIn,
    waveTime: Number.isFinite(state?.waveTime) ? state.waveTime : 0,
    time,
    queued: queue.length,
    incoming,
    live,
    living,
    upcoming: upcomingWave ? peekGroups(upcomingWave, mult, state?.systems?.waves?.countRemainder || 0) : [],
    countMultiplier: mult,
    finalSpawn: Math.max(0, (waves === WAVES ? SCHEDULE_END : lastSpawnTime(waves)) - shift),
    bossAlive,
    hasBoss: readHasBoss(state, director),
    progress: campaignProgress(state, director, time),
  };
}

function campaignProgress(state, director, time) {
  const waves = activeSchedule(state);
  const index = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (index <= 0 || waves.length === 0) return 0;
  const shift = Number(state?.systems?.waves?.timeShift) || 0;
  const current = waves[Math.min(index, waves.length) - 1];
  if (!current || !Number.isFinite(current.start)) return 0;
  const next = index < waves.length ? waves[index] : null;
  const startedAt = Number.isFinite(state?.systems?.waves?.waveStartedAt)
    ? state.systems.waves.waveStartedAt
    : effectiveStart(current, shift);
  const end = next && Number.isFinite(next.start)
    ? Math.max(startedAt + 1e-6, effectiveStart(next, shift))
    : startedAt + 30;
  const span = Math.max(1e-6, end - startedAt);
  const raw = (time - startedAt) / span;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

function buildWaves(phases) {
  const waves = [];
  const seen = new Set();
  for (const phase of phases) {
    const patterns = phase.rotate || [phase.groups];
    for (const groups of patterns) {
      for (const group of groups) {
        if (!ENEMIES[group.kind]) throw new Error(`Unknown wave kind ${group.kind}`);
      }
    }
    const every = phase.every > 0 ? phase.every : 1;
    const limit = Math.floor((phase.until - phase.from - 1e-9) / every) + 1;
    for (let i = 0; i < limit; i++) {
      const start = quantize(phase.from + i * every);
      if (start >= phase.until - 1e-9) break;
      const groups = cloneGroups(patterns[i % patterns.length]);
      let intro = null;
      for (const group of groups) {
        if (!seen.has(group.kind)) {
          seen.add(group.kind);
          if (!intro) intro = group.kind;
        }
      }
      const hint = (i === 0 && phase.hint) || (intro && INTRO_HINTS[intro]) || autoHint(groups);
      waves.push({
        id: `${phase.id}-${i + 1}`,
        start,
        name: {en: phase.name.en, zh: phase.name.zh},
        hint: {en: hint.en, zh: hint.zh},
        groups,
        horde:!!phase.horde,
        intro,
        boss: groups.some(group => group.kind === 'boss'),
      });
    }
  }
  waves.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return waves;
}

function cloneGroups(groups) {
  return groups.map(group => {
    const copy = {
      kind: group.kind,
      count: group.count,
      interval: group.interval || 0,
      delay: group.delay || 0,
      exact: !!group.exact,
    };
    if (Number.isFinite(group.healthScale)) copy.healthScale = group.healthScale;
    if (Number.isFinite(group.speedScale)) copy.speedScale = group.speedScale;
    return copy;
  });
}

function autoHint(groups) {
  const kinds = [];
  for (const group of groups) if (!kinds.includes(group.kind)) kinds.push(group.kind);
  const en = kinds.map(kind => ENEMIES[kind].name.en).join(', ');
  const zh = kinds.map(kind => ENEMIES[kind].name.zh).join('、');
  return {en: `${en} advance on the wall.`, zh: `${zh}正向城墙推进。`};
}

function lastSpawnTime(waves) {
  let end = 0;
  for (const wave of waves) {
    for (const group of wave.groups) {
      const count = Math.floor(Number(group.count) || 0);
      if (count <= 0) continue;
      const time = quantize(wave.start + (group.delay || 0) + (count - 1) * (group.interval || 0));
      if (time > end) end = time;
    }
  }
  return end;
}

// Spawn health in the main campaign after the opening. Difficulty base health still applies.
const MAIN_PACK_HP = Object.freeze({easy:1,normal:4.43,hard:4,nightmare:6});
function enqueueWave(state, sys, wave, startAt = wave.start) {
  const origin = Number.isFinite(startAt) ? quantize(startAt) : quantize(wave.start);
  const pressure = state.expedition==='watch' && wave.start>=65 ? MAIN_PACK_HP[state.difficulty] : 1;
  const mult = countMultiplier(state);
  const items = [];
  for (const group of wave.groups) {
    if (!ENEMIES[group.kind]) continue;
    const count = takeCount(sys, 'countRemainder', group.count, mult, group.exact);
    const interval = Math.max(0, Number(group.interval) || 0);
    const delay = Math.max(0, Number(group.delay) || 0);
    for (let i = 0; i < count; i++) {
      const item = {time: quantize(origin + delay + i * interval), kind: group.kind};
      item.overrides = {healthScale: (group.healthScale || 1) * pressure};
      if (Number.isFinite(group.speedScale) && group.speedScale > 0) item.overrides.speedScale = group.speedScale;
      items.push(item);
    }
  }
  if (!items.length && wave.groups.length) {
    const kind = wave.groups.find(group => ENEMIES[group.kind])?.kind;
    if (kind) items.push({time: origin, kind});
  }
  const queue = state.director.queue;
  for (const item of items) queue.push(item);
  queue.sort((a, b) => a.time - b.time || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return items.length;
}

function spawnDue(state) {
  if (!state.director.queue.length || state.director.queue[0].time > state.time+1e-6) return;
  const due = [];
  const keep = [];
  for (const item of state.director.queue) {
    if (!item || typeof item.kind !== 'string' || !Number.isFinite(item.time) || !ENEMIES[item.kind]) continue;
    if (state.time + 1e-6 >= item.time) due.push(item);
    else keep.push(item);
  }
  state.director.queue = keep;
  for (const item of due) {
    const spawned = spawnEnemy(state, item.kind, item.overrides || {});
    anchorSummon(spawned, item.time);
  }
}

function pumpEndless(state, sys) {
  if (sys.endlessNext == null) sys.endlessNext = quantize(state.time + 1);
  let guard = 0;
  while (state.time + 1e-6 >= sys.endlessNext && guard++ < 200) {
    const start = sys.endlessNext;
    const wave = makeEndlessWave(sys.endlessWave, start);
    const count = enqueueWave(state, sys, wave, start);
    const span = groupSpan(wave.groups);
    let next = quantize(start + Math.max(5.5, span - 1.5));
    if (!(next > start)) next = quantize(start + 5.5);
    sys.endlessNext = next;
    sys.endlessWave += 1;
    state.wave += 1;
    if (wave.horde) {
      emit(state, 'wave_horde', {wave: state.wave, name: wave.name, count});
    }
    sys.waveStartedAt = state.time;
    sys.current = snapshotWave(wave);
    emit(state, 'wave_start', {
      wave: state.wave,
      id: wave.id,
      name: {en: wave.name.en, zh: wave.name.zh},
      hint: {en: wave.hint.en, zh: wave.hint.zh},
      intro: null,
    });
  }
}

function makeEndlessWave(index, start) {
  const pattern = ENDLESS_PATTERNS[index % ENDLESS_PATTERNS.length];
  const loop = Math.floor(index / ENDLESS_PATTERNS.length);
  const bonus = Math.min(6, loop);
  const groups = pattern.groups.map(group => ({
    kind: group.kind,
    count: group.exact ? group.count : group.count + (group.kind === 'swarm' ? bonus : Math.min(2, bonus)),
    interval: group.interval || 0,
    delay: group.delay || 0,
    exact: !!group.exact,
    ...(Number.isFinite(group.healthScale) ? {healthScale: group.healthScale} : {}),
  }));
  if (!groups.some(group => group.kind === 'boss')) {
    if (index % 5 === 4) {
      groups.push({kind: 'boss', count: 1, interval: 0, delay: 2, exact: true, healthScale: Math.min(1.15, 0.55 + loop * 0.1)});
    }
  } else {
    for (const group of groups) {
      if (group.kind === 'boss') group.healthScale = Math.min(1.15, 0.55 + loop * 0.1);
    }
  }
  return {
    id: `endless-${index + 1}`,
    start,
    name: {en: pattern.name.en, zh: pattern.name.zh},
    hint: autoHint(groups),
    groups,
    intro: null,
    boss: groups.some(group => group.kind === 'boss'),
  };
}

function anchorSummon(enemy, spawnedAt) {
  const summon = ENEMIES[enemy?.kind]?.summon;
  if (!summon || !enemy || Number.isFinite(enemy.summonAt)) return;
  const interval = Number(summon.interval);
  if (!Number.isFinite(interval) || interval <= 0) return;
  const origin = Number.isFinite(spawnedAt) ? spawnedAt : null;
  if (origin == null) return;
  enemy.summonAt = origin + interval;
}

function updateBosses(state, sys) {
  for (const enemy of state.enemies || []) {
    if (!isLive(enemy)) continue;
    const data = ENEMIES[enemy.kind];
    if (!data) continue;
    if (data.enrage && !enemy.enraged && Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= data.enrage.threshold) {
      applyEnrage(state, enemy, data.enrage);
    }
    if (data.summon) tickSummon(state, sys, enemy, data.summon);
  }
}

function applyEnrage(state, enemy, enrage) {
  enemy.enraged = true;
  const speedScale = finiteScale(enrage.speedScale);
  const damageScale = finiteScale(enrage.damageScale);
  const intervalScale = finiteScale(enrage.intervalScale);
  if (Number.isFinite(enemy.speed)) enemy.speed *= speedScale;
  if (Number.isFinite(enemy.damage)) enemy.damage *= damageScale;
  if (Number.isFinite(enemy.attackInterval)) enemy.attackInterval = Math.max(0.35, enemy.attackInterval * intervalScale);
  if (Number.isFinite(enemy.attackCooldown) && enemy.attackCooldown > enemy.attackInterval) enemy.attackCooldown = enemy.attackInterval;
  emit(state, 'boss_enrage', {id: enemy.id, x: enemy.x, y: enemy.y, kind: enemy.kind});
}

function tickSummon(state, sys, enemy, summon) {
  const interval = Number(summon.interval);
  if (!Number.isFinite(interval) || interval <= 0 || !ENEMIES[summon.kind]) return;
  if (!Number.isFinite(enemy.summonAt)) enemy.summonAt = state.time + interval;
  let pulses = 0;
  const cap = Number.isFinite(summon.maxLiving) ? summon.maxLiving : Infinity;
  while (state.time + 1e-6 >= enemy.summonAt && pulses < 24) {
    pulses += 1;
    enemy.summonAt += interval;
    const living = countLiving(state, summon.kind);
    if (living >= cap) continue;
    const rolled = takeCount(sys, 'summonRemainder', summon.count, countMultiplier(state), false);
    const spawnCount = Math.min(rolled, Math.max(0, cap - living));
    for (let i = 0; i < spawnCount; i++) {
      const overrides = {};
      if (Number.isFinite(summon.healthScale) && summon.healthScale > 0) overrides.healthScale = summon.healthScale;
      spawnEnemy(state, summon.kind, overrides);
    }
  }
}

function countLiving(state, kind) {
  let total = 0;
  for (const enemy of state.enemies || []) if (isLive(enemy) && enemy.kind === kind) total += 1;
  return total;
}

function peekGroups(wave, mult, remainder) {
  let rem = Number(remainder) || 0;
  const upcoming = [];
  for (const group of wave.groups) {
    const base = Math.max(0, Math.floor(Number(group.count) || 0));
    let count = base;
    if (!group.exact && base > 0) {
      const raw = base * mult + rem;
      count = Math.floor(raw + 1e-9);
      rem = raw - count;
      if (rem < 1e-9) rem = 0;
    }
    if (count > 0) upcoming.push({kind: group.kind, count, exact: !!group.exact});
  }
  if (!upcoming.length && wave.groups.length) upcoming.push({kind: wave.groups[0].kind, count: 1, exact: false});
  return upcoming;
}

function takeCount(sys, field, base, mult, exact) {
  const count = Math.max(0, Math.floor(Number(base) || 0));
  if (!count) return 0;
  if (exact) return count;
  const raw = count * mult + (Number(sys[field]) || 0);
  const taken = Math.floor(raw + 1e-9);
  let rem = raw - taken;
  if (!Number.isFinite(rem) || rem < 1e-9) rem = 0;
  sys[field] = rem;
  return taken;
}

function countMultiplier(state) {
  const row = DIFFICULTIES[state?.difficulty] || DIFFICULTIES.normal;
  const count = Number(row?.count);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function groupSpan(groups) {
  let end = 0;
  for (const group of groups) {
    const count = Math.floor(Number(group.count) || 0);
    if (count <= 0) continue;
    const time = (Number(group.delay) || 0) + (count - 1) * (Number(group.interval) || 0);
    if (time > end) end = time;
  }
  return end;
}

function waveContainsBoss(wave) {
  return Array.isArray(wave?.groups) && wave.groups.some(group => group?.kind === 'boss');
}

// Current wave comes from the active sortie schedule. Once endless waves have
// started, the flag already stored on the current snapshot is that wave.
function syncBossFlag(state, director, sys) {
  const waves = activeSchedule(state);
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= waves.length && Number(sys?.endlessWave) > 0;
  if (endlessRunning) {
    director.hasBoss = sys?.current?.boss === true;
    return;
  }
  if (started <= 0 || waves.length === 0) {
    director.hasBoss = false;
    return;
  }
  director.hasBoss = waveContainsBoss(waves[Math.min(started, waves.length) - 1]);
}

// Same current-wave choice as the boss flag. Sortie waves read the active
// schedule. Endless waves read the snapshot, which carries that wave's hint.
function syncPlayerHint(state, director, sys) {
  const waves = activeSchedule(state);
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= waves.length && Number(sys?.endlessWave) > 0;
  const source = endlessRunning
    ? sys?.current?.hint
    : (started > 0 && waves.length > 0 ? waves[Math.min(started, waves.length) - 1]?.hint : null);
  const hint = copyHint(source);
  if (hint) director.playerHint = hint;
}

function copyHint(hint) {
  if (!hint || typeof hint !== 'object') return null;
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return null;
  return {en: hint.en, zh: hint.zh};
}

// Next wave is the active schedule at nextWave until that index leaves it.
// Same copy as playerHint. No spawn, timing, kind, or difficulty change.
function distinctHint(next, current, wave) {
  if (!current) return next;
  const sameEn = next.en.trim() === current.en.trim();
  const sameZh = next.zh.trim() === current.zh.trim();
  if (!sameEn && !sameZh) return next;
  const nameEn = wave?.name?.en || wave?.id || 'Next';
  const nameZh = wave?.name?.zh || wave?.id || '下一波';
  return {
    en: sameEn ? `${next.en} (${nameEn})` : next.en,
    zh: sameZh ? `${next.zh}（${nameZh}）` : next.zh,
  };
}

function syncNextHint(state, director) {
  const waves = activeSchedule(state);
  const index = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  if (index >= 0 && index < waves.length) {
    const hint = copyHint(waves[index]?.hint);
    if (hint) {
      director.nextHint = distinctHint(hint, director.playerHint, waves[index]);
      return;
    }
  }
  director.nextHint = null;
}

function readHasBoss(state, director) {
  if (typeof director?.hasBoss === 'boolean') return director.hasBoss;
  const stored = state?.systems?.waves?.current;
  if (typeof stored?.boss === 'boolean') return stored.boss;
  const waves = activeSchedule(state);
  const started = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (started <= 0 || waves.length === 0) return false;
  return waveContainsBoss(waves[Math.min(started, waves.length) - 1]);
}

const BOSS_APPROACH_SECONDS = 12;

function bossAlive(state) {
  const enemies = state?.enemies;
  if (!Array.isArray(enemies)) return false;
  return enemies.some(enemy => enemy && enemy.kind === 'boss' && enemy.dead !== true && Number(enemy.hp) > 0);
}

/** True while a boss is due within 12s, or already queued, and has not entered. */
function bossApproaching(state) {
  if (!state || state.phase !== 'playing' || state.paused || state.hiddenPaused) return false;
  if (bossAlive(state)) return false;
  const queue = state.director?.queue;
  if (Array.isArray(queue) && queue.some(item => item && item.kind === 'boss')) return true;
  if (state.endless) return false;
  const waves = activeSchedule(state);
  const index = Number.isFinite(state.director?.nextWave) ? state.director.nextWave : 0;
  if (index < 0 || index >= waves.length) return false;
  const wave = waves[index];
  if (!waveContainsBoss(wave)) return false;
  const time = Number.isFinite(state.time) ? state.time : 0;
  const shift = Number(state?.systems?.waves?.timeShift) || 0;
  const wait = effectiveStart(wave, shift) - time;
  return wait >= 0 && wait <= BOSS_APPROACH_SECONDS;
}

function noteBossApproach(state, director) {
  if (state.paused || state.hiddenPaused || state.phase !== 'playing') return;
  if (!bossApproaching(state)) {
    director.approachWave = null;
    return;
  }
  if (director.approachWave) return;
  const waves = activeSchedule(state);
  const index = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const wave = index >= 0 && index < waves.length ? waves[index] : null;
  const id = wave?.id || 'queued';
  director.approachWave = id;
  emit(state, 'boss_approach', {warning: true, id, x: 180, y: 24});
}

function snapshotWave(wave) {
  return {
    id: wave.id,
    name: {en: wave.name.en, zh: wave.name.zh},
    hint: {en: wave.hint.en, zh: wave.hint.zh},
    intro: wave.intro || null,
    boss: wave?.boss === true || waveContainsBoss(wave),
  };
}

function ensureDirector(state) {
  if (!state.director || typeof state.director !== 'object' || Array.isArray(state.director)) {
    state.director = {nextWave: 0, queue: [], done: false};
  }
  if (!Array.isArray(state.director.queue)) state.director.queue = [];
  if (!Number.isFinite(state.director.nextWave) || state.director.nextWave < 0) state.director.nextWave = 0;
  if (typeof state.director.done !== 'boolean') state.director.done = false;
  return state.director;
}

function ensureWaves(state) {
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  if (!state.systems.waves || typeof state.systems.waves !== 'object' || Array.isArray(state.systems.waves)) {
    state.systems.waves = {
      countRemainder: 0,
      summonRemainder: 0,
      waveStartedAt: null,
      timeShift: 0,
      endlessNext: null,
      endlessWave: 0,
      doneEmitted: false,
      current: null,
    };
  }
  const sys = state.systems.waves;
  if (!Number.isFinite(sys.countRemainder)) sys.countRemainder = 0;
  if (!Number.isFinite(sys.summonRemainder)) sys.summonRemainder = 0;
  if (!Number.isFinite(sys.timeShift) || sys.timeShift < 0) sys.timeShift = 0;
  if (!Number.isFinite(sys.endlessWave)) sys.endlessWave = 0;
  if (typeof sys.doneEmitted !== 'boolean') sys.doneEmitted = false;
  return sys;
}

function isSimulating(state) {
  return !!state && state.phase === 'playing' && !state.paused && !state.hiddenPaused;
}

function isLive(enemy) {
  return !!enemy && enemy.dead !== true && Number(enemy.hp) > 0;
}

function finiteScale(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function quantize(time) {
  if (!Number.isFinite(time)) return 0;
  return Math.round(time / STEP) * STEP;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

};
__ff_factories["src/ui/build-panel.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["renderBuildPanel"] = renderBuildPanel;
const __ff_m0 = __ff_load("src/data/towers.js");
const __ff_m1 = __ff_load("src/systems/hero.js");
const __ff_m2 = __ff_load("src/shared.js");
const __ff_m3 = __ff_load("src/i18n.js");
const __ff_m4 = __ff_load("src/ui/icons.js");
const getUnitStats = __ff_m0["getUnitStats"];
const HERO_UPGRADES = __ff_m1["HERO_UPGRADES"];
const isAutoSkill = __ff_m1["isAutoSkill"];
const TARGET_MODES = __ff_m2["TARGET_MODES"];
const formatNumber = __ff_m3["formatNumber"];
const localize = __ff_m3["localize"];
const translate = __ff_m3["t"];
const catalogIcon = __ff_m4["catalogIcon"];
const navIcon = __ff_m4["navIcon"];
/**
 * Fencefall v5 — Pure Solo-Gunner 3-of-1 Draft Modal & Gunner Inspector Bottom Sheet.
 * - Full-screen zero-scroll 3-of-1 Draft modal offering ONLY Gun Mods (枪械强化)
 *   and Auto Skills (自动技能), applied immediately in 1 tap.
 * - Compact mobile-friendly Gunner Bottom Sheet with direct 4-mode targeting pills,
 *   live stats, and active Auto Skills + Gun Mods list.
 */






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

function renderBuildPanel(container, state, api) {
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

};
__ff_factories["src/ui/icons.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["catalogIcon"] = catalogIcon;
__ff_exports["hasCatalogIcon"] = hasCatalogIcon;
__ff_exports["navIcon"] = navIcon;
/**
 * Fencefall v5 — PvZ2-Style Illustrated Cel-Shaded SVG Icon Library.
 *
 * Every skill, gun mod, core gem, gear item, permanent upgrade, hero portrait,
 * and zombie codex bust is rendered as a bold-outlined, multi-tone cel-shaded
 * mobile-game badge (`viewBox="0 0 48 48"`, zero external assets).
 *
 * Deterministic `data-paths` signature per id guarantees uniqueness across the
 * entire catalog while unique per-call `<defs>` gradient IDs prevent SVG URL
 * collisions when multiple badges share the DOM.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#10161d';
const WHITE = '#ffffff';

let gradSeq = 0;

const THEMES = Object.freeze({
  fire:     {top: '#8c2810', mid: '#48140a', bot: '#1e0806', border: '#ff8a3a', glint: '#ffd28a'},
  frost:    {top: '#186484', mid: '#0e364c', bot: '#071a26', border: '#72e8ff', glint: '#d4faff'},
  electric: {top: '#244888', mid: '#12244a', bot: '#081024', border: '#ffe458', glint: '#fff8b8'},
  gold:     {top: '#784e14', mid: '#3e270a', bot: '#1a1004', border: '#f8d062', glint: '#fff2b0'},
  crimson:  {top: '#781a2c', mid: '#3e0e18', bot: '#1c060b', border: '#ff6c74', glint: '#ffc2c8'},
  steel:    {top: '#3a566a', mid: '#1e303d', bot: '#0e1820', border: '#92c4dc', glint: '#d8f0fc'},
  emerald:  {top: '#186240', mid: '#0e3624', bot: '#071a12', border: '#6ee89e', glint: '#c6ffe0'},
  toxic:    {top: '#386416', mid: '#1e380c', bot: '#0d1a06', border: '#9ef052', glint: '#e0ffa8'},
  purple:   {top: '#542478', mid: '#2c1242', bot: '#140820', border: '#cc8aff', glint: '#ecd0ff'},
  hero:     {top: '#285882', mid: '#14304a', bot: '#0a1826', border: '#f8d264', glint: '#fff2b8'},
  zombie:   {top: '#2a4636', mid: '#172820', bot: '#0c1612', border: '#74ad86', glint: '#bfe6c8'},
  boss:     {top: '#6e142c', mid: '#3a0a18', bot: '#18040b', border: '#ff6268', glint: '#ffc0c4'},
});

const P = (d, fill = 'none', stroke = INK, width = 1.8) => ['path', {
  d, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}];
const C = (cx, cy, r, fill, stroke = INK, width = 1.8) => ['circle', {
  cx, cy, r, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
}];
const E = (cx, cy, rx, ry, fill, stroke = INK, width = 1.8, tf) => ['ellipse', {
  cx, cy, rx, ry, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  ...(tf ? {transform: tf} : {}),
}];
const R = (x, y, w, h, fill, stroke = INK, rx = 2, width = 1.8, tf) => ['rect', {
  x, y, width: w, height: h, rx, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  ...(tf ? {transform: tf} : {}),
}];
const G = (points, fill, stroke = INK, width = 1.8) => ['polygon', {
  points, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  'stroke-linejoin': 'round',
}];
const L = (x1, y1, x2, y2, stroke, width = 2) => ['line', {
  x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round',
}];

// Reusable cel-shaded bullet/shell helper angled along (cx, cy, angleDeg, len, rad, body, tip)
function bullet(cx, cy, deg, len, rad, body, tip, shine = '#fff6cc') {
  const tf = `rotate(${deg} ${cx} ${cy})`;
  const x0 = cx - len * 0.55;
  const w = len * 0.62;
  return [
    ['g', {transform: tf}, [
      // Metallic brass/steel casing
      R(x0, cy - rad, w, rad * 2, body, INK, 1.4, 1.7),
      // Pointed warhead cone
      P(`M${x0 + w - 0.5} ${cy - rad} Q${cx + len * 0.55} ${cy} ${x0 + w - 0.5} ${cy + rad} Z`, tip, INK, 1.7),
      // Specular highlight bar
      R(x0 + 2, cy - rad * 0.55, w * 0.72, rad * 0.48, shine, 'none', 0.8),
    ]],
  ];
}

// Reusable 4-point cartoon sparkle star
function star4(cx, cy, outer, inner, fill = '#fff8c4', stroke = INK, width = 1.2) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 4;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return G(pts.join(' '), fill, stroke, width);
}

// Reusable 3D faceted gem base
function gemBase(ptsOuter, ptsTop, ptsLeft, ptsRight, cMain, cTop, cDark, cRim) {
  return [
    G(ptsOuter, cMain, INK, 2.2),
    G(ptsTop, cTop, 'none'),
    G(ptsLeft, cRim, 'none'),
    G(ptsRight, cDark, 'none'),
    G(ptsOuter, 'none', INK, 2.1),
    // Glossy facet corner sparkle
    star4(15, 14, 4.2, 1.4, WHITE, 'none'),
  ];
}

// Reusable PvZ2 cartoon zombie bust base (head + eyes + goofy buck teeth)
function zombieHead(cx, cy, r, skin, skinShade, eyeBg = '#fff6b0', pupil = '#141c18', mouth = '#2b1218') {
  return [
    C(cx, cy, r, skin, INK, 2.1),
    // Cheek shadow crescent
    P(`M${cx - r * 0.72} ${cy + r * 0.4} A${r * 0.92} ${r * 0.92} 0 0 0 ${cx + r * 0.82} ${cy + r * 0.1} A${r * 0.95} ${r * 0.95} 0 0 1 ${cx - r * 0.72} ${cy + r * 0.4} Z`, skinShade, 'none'),
    // Glossy forehead shine
    E(cx - r * 0.34, cy - r * 0.42, r * 0.28, r * 0.14, 'rgba(255,255,255,0.34)', 'none', 0, `rotate(-25 ${cx - r * 0.34} ${cy - r * 0.42})`),
    // Expressive mismatched PvZ2 eyes
    C(cx - r * 0.36, cy - r * 0.08, r * 0.27, eyeBg, INK, 1.5),
    C(cx + r * 0.36, cy - r * 0.06, r * 0.22, eyeBg, INK, 1.5),
    C(cx - r * 0.32, cy - r * 0.06, r * 0.11, pupil, 'none'),
    C(cx + r * 0.33, cy - r * 0.04, r * 0.09, pupil, 'none'),
    // Toothy grin
    R(cx - r * 0.44, cy + r * 0.34, r * 0.88, r * 0.32, mouth, INK, 2, 1.3),
    R(cx - r * 0.28, cy + r * 0.36, r * 0.22, r * 0.2, '#f8f4e4', 'none', 0.6),
    R(cx + r * 0.08, cy + r * 0.36, r * 0.2, r * 0.18, '#f8f4e4', 'none', 0.6),
  ];
}

// =========================================================================
// ICON DEFINITIONS: { theme, draw: () => svgParts }
// =========================================================================
const MARKS = {
  // -----------------------------------------------------------------------
  // HERO PORTRAIT (Wall Gunner)
  // -----------------------------------------------------------------------
  hero: {
    theme: 'hero',
    draw: () => [
      // Fluttering crimson commander scarf behind shoulders
      P('M12 32 Q6 36 8 42 L18 38 Z', '#d93842', INK, 1.8),
      // Armored blue torso & brass shoulder pauldrons
      R(13, 30, 22, 14, '#2f5878', INK, 5, 2),
      E(12, 34, 5.2, 6, '#e8b042', INK, 1.9),
      E(36, 34, 5.2, 6, '#e8b042', INK, 1.9),
      // Chest reactor core
      C(24, 37, 3.4, '#6cf4ff', INK, 1.4),
      // Red scarf collar
      R(15, 28, 18, 5, '#e8444c', INK, 2.5, 1.6),
      // Glossy steel-blue combat helmet
      C(24, 19, 12.2, '#467698', INK, 2.1),
      P('M21 7 H27 L26 16 H22 Z', '#f8d262', INK, 1.4),
      E(18, 13, 3.6, 1.8, 'rgba(235,250,255,0.58)', 'none', 0, 'rotate(-30 18 13)'),
      // Glowing cyan tactical visor goggles
      R(14.5, 16, 19, 7.6, '#46d8f8', INK, 3.6, 1.9),
      P('M17 17.6 H23 L20.5 21.8 H16.5 Z', 'rgba(255,255,255,0.82)', 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 6 AUTO SKILLS (自动技能)
  // -----------------------------------------------------------------------
  split_shot: {
    theme: 'fire',
    draw: () => [
      // Fiery split starburst behind impact point
      G('18,12 21,19 29,17 24,24 30,30 22,29 19,37 15,29 8,30 13,24 9,17 16,19', '#ff9832', INK, 1.5),
      G('18,17 20,21 25,21 21,24 23,29 18,26 14,29 15,24 12,21 16,21', '#fff4a8', 'none'),
      // Incoming primary glowing round (left)
      ...bullet(11, 24, 0, 12, 3.2, '#d88c2c', '#ff4c28'),
      // 3 piercing golden shrapnel sub-bullets fanning out right!
      ...bullet(33, 12, -32, 13, 2.6, '#f6c848', '#fff4b4'),
      ...bullet(36, 24, 0, 14, 2.8, '#f6c848', '#ff642c'),
      ...bullet(33, 36, 32, 13, 2.6, '#f6c848', '#fff4b4'),
    ],
  },

  ricochet: {
    theme: 'electric',
    draw: () => [
      // Glowing electric plasma aura arcs
      C(13, 33, 6.2, 'rgba(84,224,255,0.28)', '#62dcff', 1.4),
      C(35, 13, 6.2, 'rgba(84,224,255,0.28)', '#62dcff', 1.4),
      // Thick jagged cel-shaded chain lightning bolt
      G('34,6 17,22 25,23 11,42 32,25 24,24 38,11', '#ffe84a', INK, 2.1),
      G('32,10 21,21 26,22 17,36 29,26 24,25', WHITE, 'none'),
      // Spark nodes
      star4(13, 33, 4.5, 1.6, '#8cf4ff', INK, 1.1),
      star4(36, 13, 4.5, 1.6, '#fff8b8', INK, 1.1),
    ],
  },

  napalm: {
    theme: 'fire',
    draw: () => [
      // Scorching magma pool at bottom
      E(24, 38, 17, 5.2, '#e83e14', INK, 1.8),
      E(24, 38, 11, 2.8, '#ffbe3c', 'none'),
      // Roaring cartoon fire sea tongues
      P('M10 38 C7 29 12 22 16 26 C17 16 23 10 25 18 C29 12 35 18 33 26 C38 23 41 31 38 38 Z', '#ff5c1a', INK, 2.0),
      P('M15 37 C14 30 18 26 21 29 C23 22 27 21 28 28 C31 26 34 31 33 37 Z', '#ffdc52', 'none'),
      // Iconic red-and-yellow napalm fuel canister dropping in from top-left!
      ['g', {transform: 'rotate(-28 22 16)'}, [
        R(15, 9, 14, 15, '#d93226', INK, 3.2, 1.9),
        R(15, 14, 14, 4.5, '#ffd84c', INK, 0.5, 1.3),
        R(19, 6, 6, 3.5, '#7e909c', INK, 1, 1.4),
        R(17.5, 10.5, 2.5, 11, 'rgba(255,255,255,0.42)', 'none', 1),
      ]],
    ],
  },

  armored_car: {
    theme: 'steel',
    draw: () => [
      // Headlight beams
      G('14,14 9,4 19,4', 'rgba(255,242,150,0.34)', 'none'),
      G('34,14 29,4 39,4', 'rgba(255,242,150,0.34)', 'none'),
      // Heavy rubber treads
      R(8, 16, 6, 24, '#1b242a', INK, 2, 1.8),
      R(34, 16, 6, 24, '#1b242a', INK, 2, 1.8),
      // Main cel-shaded armored steel truck body
      R(13, 15, 22, 26, '#526e80', INK, 4.5, 2.0),
      R(16, 17, 16, 6, '#7b99ac', 'none', 2),
      // Glossy cyan slit windshield
      R(16, 23, 16, 6.2, '#5ce2ff', INK, 2, 1.6),
      P('M18 24.5 H24 L22 28 H17.5 Z', 'rgba(255,255,255,0.8)', 'none'),
      // Roof hatch & red tactical beacon
      C(24, 34, 4.5, '#334652', INK, 1.6),
      C(24, 34, 2.1, '#ff4d3c', 'none'),
      // Heavy V-shaped steel ram-plow with hazard stripes
      G('24,6 41,13 39,18 24,13 9,18 7,13', '#dce8f0', INK, 2.0),
      R(14, 11.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
      R(21.8, 9.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
      R(29.5, 11.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
    ],
  },

  cryo_barrage: {
    theme: 'frost',
    draw: () => [
      // Frosty burst mist at base
      E(24, 38, 15, 4.8, 'rgba(150,242,255,0.45)', '#88ecff', 1.4),
      // Left & right angled faceted ice spears
      G('10,12 18,22 18,37 10,28', '#52c8f0', INK, 1.8),
      G('10,12 15,23 15,33 11,26', '#d8fbff', 'none'),
      G('38,12 38,28 30,37 30,22', '#52c8f0', INK, 1.8),
      G('38,12 37,26 33,33 33,23', '#d8fbff', 'none'),
      // Center giant glacial ice lance
      G('24,5 30,19 24,39 18,19', '#88ecff', INK, 2.1),
      G('24,6 24,37 19.5,19', WHITE, 'none'),
      star4(24, 15, 4.2, 1.4, WHITE, 'none'),
    ],
  },

  orbital_beam: {
    theme: 'frost',
    draw: () => [
      // Outer glowing plasma column
      R(15, 10, 18, 29, 'rgba(72,226,255,0.42)', 'none', 2),
      R(18.5, 10, 11, 29, '#62e8ff', INK, 2, 1.6),
      R(21.5, 10, 5, 29, WHITE, 'none', 1),
      // Sci-fi orbital emitter ring at top
      R(12, 6, 24, 6, '#587488', INK, 3, 1.9),
      R(18, 7.5, 12, 3, '#aef8ff', 'none', 1.5),
      // Blazing concentric ground shockwave crater
      E(24, 38, 16, 5.2, '#4ad6ff', INK, 1.8),
      E(24, 38, 10, 3, WHITE, 'none'),
      // Ascending energy rings along beam
      E(24, 21, 9.5, 2.6, 'none', '#d4fbff', 1.7),
      E(24, 30, 11, 3, 'none', '#fff2a4', 1.6),
    ],
  },

  // -----------------------------------------------------------------------
  // 9 GUN MODS (枪械强化)
  // -----------------------------------------------------------------------
  volley: {
    theme: 'gold',
    draw: () => [
      // Crisp golden fan motion arcs
      P('M12 36 Q24 27 36 36', 'none', '#ffe278', 2.2),
      // 3 brass-and-crimson cartridges launching in a spread fan!
      ...bullet(13, 22, -108, 17, 3.6, '#d8962e', '#ff6438'),
      ...bullet(24, 18, -90, 19, 4.0, '#f2bd42', '#ff4c2c'),
      ...bullet(35, 22, -72, 17, 3.6, '#d8962e', '#ff6438'),
      // Small bright muzzle flash at base
      star4(24, 37, 5.8, 2.2, '#fff5a6', INK, 1.3),
    ],
  },

  strike: {
    theme: 'crimson',
    draw: () => [
      // Dramatic impact explosion burst behind shell
      G('34,10 36,16 42,15 38,20 42,26 35,25 33,31 29,25 23,25 27,20 24,14 30,15', '#ff9234', INK, 1.5),
      // Massive heavy-caliber high-explosive brass cannon shell angled diagonally!
      ['g', {transform: 'rotate(-42 23 25)'}, [
        R(7, 17.5, 20, 15, '#e8a832', INK, 2.6, 2.1),
        R(21, 17.5, 5, 15, '#d83226', INK, 0.6, 1.6),
        P('M26.5 17.5 Q42 25 26.5 32.5 Z', '#ff5432', INK, 2.1),
        R(10, 20, 13, 3.4, '#fff4b4', 'none', 1.2),
        R(5.5, 16.5, 3.6, 17, '#c67d1e', INK, 1.2, 1.6),
      ]],
    ],
  },

  cadence: {
    theme: 'gold',
    draw: () => [
      // Rapid speed streaks
      L(6, 14, 15, 14, '#ffe578', 2.2),
      L(5, 24, 13, 24, '#ffffff', 2.2),
      L(6, 34, 15, 34, '#ffe578', 2.2),
      // Sleek twin rotary gun barrels firing right
      R(9, 17, 18, 6.2, '#627c8e', INK, 2, 1.9),
      R(9, 25, 18, 6.2, '#4a6274', INK, 2, 1.9),
      R(12, 18.6, 11, 2, '#b4d0e0', 'none', 0.8),
      R(21, 15.5, 4, 17, '#d8a034', INK, 1.2, 1.6),
      // Blazing cartoon starburst muzzle flash + flying bullets
      G('28,24 33,14 34,20 43,17 37,24 43,31 34,28 33,34', '#ff9832', INK, 1.6),
      G('30,24 34,19 39,24 34,29', '#fff8c0', 'none'),
    ],
  },

  pierce: {
    theme: 'steel',
    draw: () => [
      // Cracked steel shield plate tilted on the right side
      P('M24 9 L37 13 V25 Q37 35 25 40 L21 35 L26 27 L19 24 L25 18 Z', '#6b8496', INK, 2.0),
      P('M26 12 L34 15 V24 Q34 31 26 36 L24 33 L28 26 L23 23 L27 18 Z', '#9bb5c7', 'none'),
      // Jagged breach crack & glowing energy streak
      L(6, 35, 22, 23, '#72eaff', 3.4),
      // Gleaming brass-and-steel sabot round punching straight through diagonally!
      ...bullet(24, 23, -34, 28, 4.2, '#e8b23c', '#d8f8ff', '#ffffff'),
      // Flying metallic armor shards & golden impact sparks
      G('31,8 36,6 34,12', '#ffe45e', INK, 1.2),
      G('36,33 41,31 39,37', '#ffe45e', INK, 1.2),
      star4(26, 22, 5.2, 1.8, '#fff8c0', INK, 1.1),
    ],
  },

  shrapnel: {
    theme: 'fire',
    draw: () => [
      // Roaring fiery dragon's-breath explosion cloud
      P('M9 34 C6 25 10 15 18 16 C20 8 28 6 31 14 C38 12 42 20 39 28 C42 34 36 40 28 39 C22 42 12 40 9 34 Z', '#ff5a1c', INK, 2.0),
      P('M14 33 C12 27 16 20 21 21 C23 15 28 15 30 20 C35 20 36 27 33 33 Z', '#ffd84a', 'none'),
      // Flaming incandescent bullet rocketing diagonally up-right!
      ...bullet(25, 23, -38, 22, 4.6, '#d93224', '#fff296', '#ffffff'),
      star4(37, 11, 4.5, 1.5, '#fff8c0', INK, 1.1),
    ],
  },

  frostbite: {
    theme: 'frost',
    draw: () => [
      // Crisp glowing ice snowflake backdrop
      L(24, 7, 24, 41, '#9cf4ff', 2.4),
      L(7, 24, 41, 24, '#9cf4ff', 2.4),
      L(12, 12, 36, 36, '#72e2ff', 2.0),
      L(36, 12, 12, 36, '#72e2ff', 2.0),
      // Frosted diamond cryo-core bullet angled diagonally up-right!
      ...bullet(24, 24, -40, 22, 4.6, '#349ec8', '#d4fbff', '#ffffff'),
      // Sharp crystalline icicle crown glint
      star4(14, 14, 4.2, 1.4, WHITE, INK, 1.0),
      star4(35, 34, 3.6, 1.2, '#b6f6ff', 'none'),
    ],
  },

  focus: {
    theme: 'crimson',
    draw: () => [
      // Tactical sniper scope outer ring
      C(24, 24, 14.5, 'rgba(255,70,70,0.16)', '#ff5e58', 2.4),
      C(24, 24, 9.5, 'none', '#ffd862', 1.6),
      // Crosshair ticks
      L(24, 5, 24, 13, '#ffe88a', 2.4),
      L(24, 35, 24, 43, '#ffe88a', 2.4),
      L(5, 24, 13, 24, '#ffe88a', 2.4),
      L(35, 24, 43, 24, '#ffe88a', 2.4),
      // Explosive golden-crimson critical star dead center!
      star4(24, 24, 8.2, 3.0, '#ffe652', INK, 1.6),
      C(24, 24, 2.2, '#ff3832', 'none'),
    ],
  },

  bastion: {
    theme: 'steel',
    draw: () => [
      // Glowing cyan energy wall shield arc behind battlement
      P('M7 18 Q24 6 41 18', 'none', '#6ef0ff', 3.2),
      // Heavy steel fortress wall battlement with merlons
      P('M8 40 V19 H14 V23 H20 V19 H28 V23 H34 V19 H40 V40 Z', '#6c8494', INK, 2.1),
      R(9, 25, 30, 5, '#9ab2c2', 'none', 1),
      // Yellow-and-black hazard stripe base
      R(9, 34, 30, 5, '#f6c844', INK, 1, 1.4),
      G('13,34 17,34 14,39 10,39', '#1b2228', 'none'),
      G('22,34 26,34 23,39 19,39', '#1b2228', 'none'),
      G('31,34 35,34 32,39 28,39', '#1b2228', 'none'),
      // Radiant cyan shield crest centered on the wall
      P('M24 22 L31 25 V31 Q24 37 17 31 V25 Z', '#4ed8ff', INK, 1.7),
      P('M24 24.5 L28 26.5 V30 Q24 34 20 30 V26.5 Z', '#d2faff', 'none'),
    ],
  },

  overclock: {
    theme: 'fire',
    draw: () => [
      // Blazing overdrive turbine ring
      C(24, 24, 15, '#42160c', '#ff9832', 2.4),
      C(24, 24, 11, '#8c2810', 'none'),
      // Double blazing power-up chevrons
      G('24,9 35,23 29,23 24,16 19,23 13,23', '#ffe652', INK, 1.8),
      G('24,20 35,34 29,34 24,27 19,34 13,34', '#ff6a24', INK, 1.8),
      star4(24, 12, 4.2, 1.4, WHITE, 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 6 CORE GEMS (核心宝石 — 璀璨切面 3D 宝石)
  // -----------------------------------------------------------------------
  gem_opening_drop: {
    theme: 'frost',
    draw: () => [
      ...gemBase(
        '24,6 39,15 39,33 24,42 9,33 9,15',
        '24,6 39,15 24,20 9,15',
        '9,15 24,20 24,42 9,33',
        '39,15 39,33 24,42 24,20',
        '#2c9ce0', '#8ef0ff', '#165a8a', '#42b8f4'
      ),
      // Crisp parachute + golden supply crate emblem inside gem
      P('M16 21 A8 8 0 0 1 32 21 Z', WHITE, INK, 1.5),
      L(17, 21, 22, 28, '#e8f6ff', 1.3),
      L(31, 21, 26, 28, '#e8f6ff', 1.3),
      R(19.5, 27.5, 9, 7, '#f8cc4e', INK, 1.4, 1.5),
      L(24, 28, 24, 34, '#a66214', 1.3),
    ],
  },

  gem_aegis_wall: {
    theme: 'frost',
    draw: () => [
      ...gemBase(
        '24,6 39,14 36,33 24,42 12,33 9,14',
        '24,6 39,14 24,18 9,14',
        '9,14 24,18 24,42 12,33',
        '39,14 36,33 24,42 24,18',
        '#26b6dc', '#aaf6ff', '#12607c', '#4ad4f4'
      ),
      // Armored battlement crown inside shield gem
      P('M16 30 V20 H20 V23 H22.5 V20 H25.5 V23 H28 V20 H32 V30 Z', '#fff8de', INK, 1.5),
      R(16, 31, 16, 3, '#f8cc4e', INK, 1, 1.2),
    ],
  },

  gem_pierce_core: {
    theme: 'crimson',
    draw: () => [
      ...gemBase(
        '16,7 32,7 41,16 41,32 32,41 16,41 7,32 7,16',
        '16,7 32,7 34,16 14,16',
        '7,16 14,16 14,32 7,32',
        '34,16 41,16 41,32 32,41 16,41 14,32',
        '#d93246', '#ff8c96', '#7a1222', '#ef4e60'
      ),
      // Silver piercing lance slicing diagonally across ruby gem
      ...bullet(24, 24, -45, 26, 3.6, '#d8e8f2', '#ffffff', '#ffffff'),
    ],
  },

  gem_elemental: {
    theme: 'gold',
    draw: () => [
      // Split Fire-Ruby (left) + Ice-Sapphire (right) diamond gem!
      G('24,5 40,24 24,43 8,24', '#303840', INK, 2.2),
      G('24,6 9,24 24,42', '#ff5e22', 'none'),
      G('24,6 15,24 24,20', '#ffb84a', 'none'),
      G('24,6 39,24 24,42', '#30b8f0', 'none'),
      G('24,6 33,24 24,20', '#aef6ff', 'none'),
      G('24,5 40,24 24,43 8,24', 'none', INK, 2.2),
      L(24, 6, 24, 42, INK, 1.8),
      star4(24, 24, 7.5, 2.6, '#fff8b8', INK, 1.4),
    ],
  },

  gem_shredder: {
    theme: 'crimson',
    draw: () => [
      ...gemBase(
        '24,5 39,19 34,40 24,43 14,40 9,19',
        '24,5 39,19 24,18 9,19',
        '9,19 24,18 24,43 14,40',
        '39,19 34,40 24,43 24,18',
        '#c92232', '#ff7878', '#680c18', '#e83e4c'
      ),
      // Fierce golden cross-slash blades
      G('14,17 18,14 34,31 30,34', '#ffe45a', INK, 1.5),
      G('30,14 34,17 18,34 14,31', '#ffe45a', INK, 1.5),
      C(24, 24, 3.2, WHITE, INK, 1.2),
    ],
  },

  gem_overdrive: {
    theme: 'emerald',
    draw: () => [
      ...gemBase(
        '24,6 39,15 39,33 24,42 9,33 9,15',
        '24,6 39,15 24,19 9,15',
        '9,15 24,19 24,42 9,33',
        '39,15 39,33 24,42 24,19',
        '#2ab868', '#8cf6b6', '#126438', '#44d682'
      ),
      // Blazing golden overdrive lightning bolt
      G('27,12 16,25 23,25 20,36 33,22 26,22', '#ffe84e', INK, 1.7),
      G('26,15 20,24 24,24 23,31 29,23 25,23', WHITE, 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 9 EQUIPMENT GEAR ITEMS (军械武装装备)
  // -----------------------------------------------------------------------
  splinter_bow: {
    theme: 'gold',
    draw: () => [
      // Heavy recurve war-bow & gleaming golden arrow
      P('M16 8 C6 16 6 32 16 40', 'none', '#f2be48', 4.2),
      P('M16 8 C6 16 6 32 16 40', 'none', '#fff0a4', 1.4),
      P('M16 8 L23 24 L16 40', 'none', '#d8e4ec', 1.8),
      ...bullet(28, 24, 0, 24, 3.2, '#c88c28', '#ffe468'),
      G('34,18 42,24 34,30 36,24', '#fff29c', INK, 1.5),
    ],
  },

  kinetic_core: {
    theme: 'gold',
    draw: () => [
      // Sci-fi weapon kinetic power core
      P('M11 16 C16 8 32 8 37 16 L35 33 C30 40 18 40 13 33 Z', '#425c6e', INK, 2.1),
      R(7, 20, 6, 8, '#f0be48', INK, 1.5, 1.6),
      R(35, 20, 6, 8, '#f0be48', INK, 1.5, 1.6),
      C(24, 24, 8.2, '#162834', '#f8d262', 2.0),
      C(24, 24, 5.0, '#62ecff', 'none'),
      C(22.5, 22.5, 2.0, WHITE, 'none'),
    ],
  },

  prism_lens: {
    theme: 'frost',
    draw: () => [
      // Precision crystal scope lens
      G('24,6 38,24 24,42 10,24', '#38b4e4', INK, 2.1),
      G('24,6 38,24 24,24', '#a8f4ff', 'none'),
      G('24,6 10,24 24,24', '#62d4f8', 'none'),
      C(24, 24, 6.2, 'none', '#fff4a6', 2.0),
      L(24, 13, 24, 35, WHITE, 1.5),
      L(14, 24, 34, 24, WHITE, 1.5),
    ],
  },

  runner_charm: {
    theme: 'emerald',
    draw: () => [
      // Winged speed talisman
      P('M6 16 Q14 14 19 22 Q12 24 7 29 Q13 27 18 28 L12 34', '#8ef4c0', INK, 1.6),
      P('M42 16 Q34 14 29 22 Q36 24 41 29 Q35 27 30 28 L36 34', '#8ef4c0', INK, 1.6),
      G('24,10 33,24 24,39 15,24', '#f8cc4e', INK, 2.0),
      G('24,14 29,24 24,34 19,24', '#fff4b4', 'none'),
      C(24, 9, 3, '#ffe678', INK, 1.5),
    ],
  },

  sun_spindle: {
    theme: 'gold',
    draw: () => [
      // Radiant sun gear medallion
      G('24,5 27,12 35,8 33,16 42,18 36,24 42,30 33,32 35,40 27,36 24,43 21,36 13,40 15,32 6,30 12,24 6,18 15,16 13,8 21,12', '#f6b834', INK, 1.7),
      C(24, 24, 9.5, '#ffe468', INK, 1.8),
      C(24, 24, 4.5, '#ff7828', INK, 1.4),
      C(22.5, 22.5, 1.6, WHITE, 'none'),
    ],
  },

  bounty_seal: {
    theme: 'gold',
    draw: () => [
      // Royal bounty gold medal with crimson ribbon
      G('16,32 12,43 19,39 22,43 22,32', '#d9363e', INK, 1.6),
      G('32,32 36,43 29,39 26,43 26,32', '#d9363e', INK, 1.6),
      C(24, 21, 13.5, '#f4bc38', INK, 2.1),
      C(24, 21, 9.6, '#d6901c', '#fff0a4', 1.4),
      G('24,12 26.8,18 33,18.4 28,22.5 29.6,28.5 24,25.2 18.4,28.5 20,22.5 15,18.4 21.2,18', '#fff5b0', INK, 1.3),
    ],
  },

  fence_nails: {
    theme: 'steel',
    draw: () => [
      // Heavy spiked steel barricade plate
      R(8, 22, 32, 16, '#587080', INK, 3, 2.0),
      R(10, 24, 28, 4.5, '#9ab2c2', 'none', 1.5),
      // 3 sharp steel spikes bolted across the top
      G('14,7 19,22 9,22', '#dce8f0', INK, 1.9),
      G('24,5 29,22 19,22', '#f6fafe', INK, 1.9),
      G('34,7 39,22 29,22', '#dce8f0', INK, 1.9),
      C(14, 31, 2.4, '#f6cc52', INK, 1.2),
      C(24, 31, 2.4, '#f6cc52', INK, 1.2),
      C(34, 31, 2.4, '#f6cc52', INK, 1.2),
    ],
  },

  vanguard_kit: {
    theme: 'steel',
    draw: () => [
      // Spiked heavy riot-shield armor
      P('M24 6 L39 12 V26 Q39 36 24 42 Q9 36 9 26 V12 Z', '#4c6678', INK, 2.1),
      P('M24 10 L35 14.5 V25 Q35 33 24 37.5 Q13 33 13 25 V14.5 Z', '#7896aa', INK, 1.4),
      // Golden diagonal armored ribs & thorn spikes
      R(14, 21, 20, 5.5, '#f2c248', INK, 1.5, 1.6),
      G('6,18 10,15 10,21', '#ffe888', INK, 1.3),
      G('42,18 38,15 38,21', '#ffe888', INK, 1.3),
      C(24, 23.8, 2.2, '#4ae4ff', INK, 1.1),
    ],
  },

  surge_capacitor: {
    theme: 'frost',
    draw: () => [
      // Glowing cyan shockwave capacitor coil
      P('M8 18 Q24 6 40 18', 'none', '#8ef4ff', 3.2),
      P('M12 24 Q24 14 36 24', 'none', '#56d8ff', 2.8),
      R(13, 25, 22, 14, '#365468', INK, 3.5, 2.0),
      R(17, 28.5, 14, 7, '#64ecff', INK, 2, 1.4),
      R(19, 30, 8, 2.2, WHITE, 'none', 1),
      star4(24, 15, 4.8, 1.6, '#fff6a8', INK, 1.1),
    ],
  },

  // -----------------------------------------------------------------------
  // 4 PERMANENT ARMORY UPGRADES (永久强化)
  // -----------------------------------------------------------------------
  damage: {
    theme: 'crimson',
    draw: () => [
      // Bold crossed artillery/firepower emblem
      G('24,6 37,24 24,42 11,24', '#8c1d28', '#ff7868', 1.8),
      ...bullet(24, 24, -45, 24, 4.4, '#f2b838', '#ff4c2c'),
      star4(34, 14, 5.2, 1.8, '#fff6a6', INK, 1.2),
    ],
  },

  haste: {
    theme: 'gold',
    draw: () => [
      // Twin blazing golden speed chevrons
      G('8,11 19,11 31,24 19,37 8,37 20,24', '#ff9832', INK, 2.0),
      G('20,11 31,11 43,24 31,37 20,37 32,24', '#ffe652', INK, 2.0),
      G('24,14 29,14 38,24 29,34 24,34 33,24', '#fff8c8', 'none'),
    ],
  },

  vitality: {
    theme: 'emerald',
    draw: () => [
      // Emerald-steel fortified heart shield
      P('M24 7 L38 13 V25 Q38 35 24 41 Q10 35 10 25 V13 Z', '#32a866', INK, 2.1),
      P('M24 11 L34 15.5 V24.5 Q34 32 24 36.5 Q14 32 14 24.5 V15.5 Z', '#6ce89c', 'none'),
      // Crisp white medic/fortress cross
      R(21, 16, 6, 16, WHITE, INK, 1.5, 1.5),
      R(16, 21, 16, 6, WHITE, INK, 1.5, 1.5),
      R(21.8, 17, 4.4, 14, WHITE, 'none', 1),
    ],
  },

  economy: {
    theme: 'gold',
    draw: () => [
      // Gleaming stack of golden coins + sparkle
      E(24, 34, 13, 5.5, '#d68a18', INK, 1.9),
      E(24, 28, 13, 5.5, '#eab02c', INK, 1.9),
      E(24, 22, 13, 5.5, '#ffd84e', INK, 1.9),
      E(24, 22, 8.5, 3.0, '#fff29c', '#c87e14', 1.2),
      star4(35, 12, 5.2, 1.8, '#fff8c4', INK, 1.2),
    ],
  },

  // -----------------------------------------------------------------------
  // 15 PVZ2-STYLE CEL-SHADED ZOMBIE CODEX PORTRAITS (僵尸图鉴)
  // -----------------------------------------------------------------------
  shambler: {
    theme: 'zombie',
    draw: () => [
      // Tattered brown jacket shoulders & reaching hands
      R(12, 31, 24, 12, '#6c4d3c', INK, 5, 2.0),
      R(21, 32, 6, 10, '#c8423a', INK, 1, 1.3),
      ...zombieHead(24, 21, 12.2, '#78be62', '#4c883c'),
    ],
  },

  runner: {
    theme: 'zombie',
    draw: () => [
      // Speed streaks
      L(5, 16, 12, 16, '#ffe468', 2.2),
      L(4, 24, 11, 24, '#ffe468', 2.2),
      R(14, 32, 22, 11, '#d87028', INK, 4.5, 1.9),
      ...zombieHead(26, 21, 11.2, '#62c496', '#388e68'),
      // Iconic blazing red runner headband + fluttering tails!
      R(14.5, 13, 23, 4.2, '#e83a36', INK, 1.6, 1.6),
      P('M15 15 L6 11 L9 18 Z', '#e83a36', INK, 1.5),
    ],
  },

  brute: {
    theme: 'crimson',
    draw: () => [
      // Massive hulking juggernaut shoulders & spiked iron pauldrons
      R(6, 26, 36, 17, '#5c6648', INK, 7, 2.1),
      E(10, 31, 6.2, 6.2, '#4a5864', INK, 1.8),
      E(38, 31, 6.2, 6.2, '#4a5864', INK, 1.8),
      G('8,22 12,26 6,27', '#dce6ee', INK, 1.3),
      G('40,22 36,26 42,27', '#dce6ee', INK, 1.3),
      ...zombieHead(24, 19, 11.5, '#688c4e', '#3e5c2c', '#ffd652'),
      // Angry furrowed unibrow
      P('M16 14 L24 18 L32 14', 'none', INK, 2.8),
    ],
  },

  armored: {
    theme: 'steel',
    draw: () => [
      // Heavy steel chest plate & pauldrons
      R(10, 30, 28, 13, '#587080', INK, 5, 2.0),
      R(18, 33, 12, 6, '#8ea8b8', INK, 1.5, 1.3),
      // Iconic PvZ2 iron bucket / knight helmet!
      P('M12 28 V14 Q24 5 36 14 V28 Z', '#7890a0', INK, 2.1),
      P('M15 14 Q24 9 28 13 L25 26 H15 Z', '#a4bccb', 'none'),
      // Visor slit with glowing zombie eyes peering out
      R(15, 19, 18, 6.2, '#141c22', INK, 2, 1.5),
      C(20, 22, 2.1, '#ffe45a', 'none'),
      C(28, 22, 2.1, '#ffe45a', 'none'),
      // Gold helmet brow rivets
      C(16, 15, 1.3, '#f6cc52', 'none'),
      C(32, 15, 1.3, '#f6cc52', 'none'),
    ],
  },

  spitter: {
    theme: 'toxic',
    draw: () => [
      // Acid-stained torso
      R(13, 32, 22, 11, '#36582c', INK, 5, 1.9),
      // Bloated glowing acid-green spitter cheeks
      ...zombieHead(22, 22, 11.5, '#8ee848', '#52a424', '#ffff9e'),
      C(14, 25, 4.5, '#b6ff5a', INK, 1.6),
      C(30, 25, 4.5, '#b6ff5a', INK, 1.6),
      // Flying toxic acid globs!
      C(38, 16, 3.6, '#b8ff4e', INK, 1.5),
      C(40, 25, 2.6, '#96f03c', INK, 1.3),
      C(36, 10, 2.0, '#e6ffb4', 'none'),
    ],
  },

  swarm: {
    theme: 'zombie',
    draw: () => [
      // Cute trio of mischievous mini goblin-zombies with pointy ears!
      G('8,24 14,22 14,28', '#7cd458', INK, 1.4),
      G('40,24 34,22 34,28', '#7cd458', INK, 1.4),
      ...zombieHead(14, 30, 7.6, '#7cd458', '#4c9632'),
      ...zombieHead(34, 30, 7.6, '#7cd458', '#4c9632'),
      G('15,15 20,13 20,19', '#94e468', INK, 1.4),
      G('33,15 28,13 28,19', '#94e468', INK, 1.4),
      ...zombieHead(24, 18, 8.6, '#94e468', '#5aa43c'),
    ],
  },

  boss: {
    theme: 'boss',
    draw: () => [
      // Massive dark demon shoulders
      R(7, 30, 34, 13, '#4c1836', INK, 6, 2.1),
      // Curved obsidian boss horns
      P('M14 19 C7 15 6 8 12 6 C11 11 14 13 18 14 Z', '#2a1220', INK, 1.8),
      P('M34 19 C41 15 42 8 36 6 C37 11 34 13 30 14 Z', '#2a1220', INK, 1.8),
      // Fiery Tyrant Boss Head
      ...zombieHead(24, 24, 12.2, '#8a3468', '#52183c', '#ff4838', '#fff6a6', '#220810'),
      // Blazing golden royal boss crown
      G('13,15 16,6 21,12 24,5 27,12 32,6 35,15', '#ffd84c', INK, 1.8),
      C(24, 11, 2.0, '#ff4838', INK, 1.0),
    ],
  },

  leaper: {
    theme: 'gold',
    draw: () => [
      // Coiled golden leap arc behind jumper
      P('M8 38 Q24 6 40 24', 'none', '#ffe262', 2.8),
      G('42,26 36,24 40,19', '#ffe262', INK, 1.3),
      // Amber jumper tunic
      R(12, 32, 22, 11, '#d98a24', INK, 5, 1.9),
      ...zombieHead(23, 22, 10.8, '#8ec85a', '#568e32'),
      // Pointy orange-gold jumper cone hat!
      G('13,16 23,5 33,16', '#ff9828', INK, 1.9),
      G('17,15 23,8 25,15', '#ffd268', 'none'),
    ],
  },

  splitter: {
    theme: 'purple',
    draw: () => [
      // Glowing purple twin-core slime sphere splitting down a glowing crack!
      C(24, 24, 14.5, '#8c48d8', INK, 2.2),
      P('M24 10 A14 14 0 0 1 24 38 Z', '#682ca8', 'none'),
      // Bright electric split fissure right down the middle
      P('M24 9 L20 18 L27 24 L21 31 L25 39', 'none', '#f0c8ff', 2.8),
      // Twin mischievous eyes on each half
      R(13, 21, 5.5, 4.5, WHITE, INK, 1.5, 1.3),
      R(29.5, 21, 5.5, 4.5, WHITE, INK, 1.5, 1.3),
      C(16, 23.2, 1.5, INK, 'none'),
      C(32, 23.2, 1.5, INK, 'none'),
      // Mini split buds
      C(10, 12, 3.2, '#b87cff', INK, 1.4),
      C(38, 36, 3.2, '#b87cff', INK, 1.4),
    ],
  },

  mender: {
    theme: 'emerald',
    draw: () => [
      // Medic coat & glowing emerald heal staff orb
      R(11, 32, 22, 11, '#3e8c58', INK, 5, 1.9),
      L(37, 17, 37, 41, '#a06c38', 3.0),
      C(37, 15, 5.2, '#5effa8', INK, 1.8),
      C(35.5, 13.5, 1.8, WHITE, 'none'),
      ...zombieHead(21, 23, 10.6, '#76c268', '#468c3c'),
      // Crisp white medic nurse cap with green cross
      R(13, 8, 16, 7.2, '#f4faf6', INK, 2, 1.8),
      R(19.6, 9.5, 2.8, 4.6, '#2cc464', 'none', 0.5),
      R(18.6, 10.5, 4.8, 2.6, '#2cc464', 'none', 0.5),
    ],
  },

  shade: {
    theme: 'frost',
    draw: () => [
      // Translucent spooky cel-shaded icy-blue ghost silhouette!
      P('M12 37 V21 A12 12 0 0 1 36 21 V37 L31 33 L27 39 L24 34 L20 39 L16 33 Z', '#62b8f6', INK, 2.1),
      P('M16 19 A8 8 0 0 1 28 14 Q21 16 17 26 Z', '#c8f0ff', 'none'),
      // Glowing spectral eyes
      E(19.5, 21, 2.6, 3.4, WHITE, INK, 1.3),
      E(28.5, 21, 2.6, 3.4, WHITE, INK, 1.3),
      C(20, 21.5, 1.1, '#122640', 'none'),
      C(28, 21.5, 1.1, '#122640', 'none'),
      E(24, 27.5, 2.4, 3.0, '#183452', 'none'),
    ],
  },

  banner: {
    theme: 'crimson',
    draw: () => [
      // Waving crimson-gold war banner on staff
      L(11, 7, 11, 42, '#c89448', 3.0),
      P('M11 8 H38 L33 15 L38 22 H11 Z', '#e2343c', INK, 1.9),
      C(21, 15, 3.4, '#ffe252', INK, 1.2),
      // Officer zombie peeking beneath banner
      R(18, 34, 20, 9, '#9a282e', INK, 4, 1.8),
      ...zombieHead(28, 28, 8.6, '#76be64', '#4a883c'),
    ],
  },

  warden: {
    theme: 'steel',
    draw: () => [
      // Guard zombie peeking behind huge glowing steel heater shield
      ...zombieHead(28, 18, 9.6, '#6ea872', '#447848'),
      R(19, 28, 18, 14, '#3a4e60', INK, 4, 1.8),
      // Big fortified front heater shield with golden cross!
      P('M20 15 L33 20 V31 Q20 42 7 31 V20 Z', '#5280a8', INK, 2.1),
      P('M20 18.5 L29.5 22 V30 Q20 38 10.5 30 V22 Z', '#80bce8', 'none'),
      R(18.2, 21, 3.6, 13, '#ffe25e', INK, 1, 1.2),
      R(13.5, 25, 13, 3.6, '#ffe25e', INK, 1, 1.2),
    ],
  },

  charge: {
    theme: 'fire',
    draw: () => [
      // Sapper zombie behind big sizzling cartoon bomb!
      ...zombieHead(18, 18, 9.0, '#82ba58', '#528632'),
      // Sizzling bomb body
      C(28, 31, 9.6, '#2a323a', INK, 2.1),
      E(24.5, 27.5, 3.2, 1.8, 'rgba(255,255,255,0.42)', 'none', 0, 'rotate(-30 24.5 27.5)'),
      R(25.5, 19.5, 5, 3.8, '#6e7c86', INK, 1, 1.5),
      // Burning curved fuse + bright orange-gold spark star neatly framed inside badge
      P('M28 19.5 Q31.5 13 36 14', 'none', '#f0c478', 2.2),
      star4(36, 14, 5.6, 2.0, '#ffe44c', '#ff4c1c', 1.4),
    ],
  },

  hush: {
    theme: 'purple',
    draw: () => [
      // Hooded silence wraith projecting glowing cyan mute ring
      P('M12 40 L15 22 Q24 9 33 22 L36 40 Z', '#2a3e54', INK, 2.1),
      C(24, 22, 7.6, '#141c24', INK, 1.8),
      C(21, 21, 1.8, '#7cf4ff', 'none'),
      C(27, 21, 1.8, '#7cf4ff', 'none'),
      // Glowing cyan silence wave halo at front
      C(24, 33, 7.6, 'rgba(84,232,255,0.22)', '#74f0ff', 2.6),
      L(18.5, 33, 29.5, 33, WHITE, 2.2),
    ],
  },

  // -----------------------------------------------------------------------
  // LEGACY BASE ELEMENT ICONS (kept unique & upgraded for compatibility)
  // -----------------------------------------------------------------------
  bolt: {
    theme: 'gold',
    draw: () => [
      ...bullet(24, 24, -90, 26, 4.6, '#e8b638', '#fff4a6'),
      L(16, 40, 32, 40, '#f8d262', 2.6),
    ],
  },
  fire: {
    theme: 'fire',
    draw: () => [
      P('M24 41 C14 41 10 31 14 23 C16 26 18 19 21 15 C22 19 25 10 27 7 C29 15 33 16 35 22 C39 20 39 30 36 36 C33 40 29 41 24 41 Z', '#ff581a', INK, 2.0),
      P('M24 38 C18 38 17 31 20 26 C22 28 24 21 26 19 C28 24 31 25 31 31 C31 36 28 38 24 38 Z', '#ffe258', 'none'),
    ],
  },
  frost: {
    theme: 'frost',
    draw: () => [
      L(24, 7, 24, 41, '#9cf4ff', 3.0),
      L(7, 24, 41, 24, '#9cf4ff', 3.0),
      L(11, 11, 37, 37, '#6ce2ff', 2.4),
      L(37, 11, 11, 37, '#6ce2ff', 2.4),
      G('24,16 32,24 24,32 16,24', WHITE, INK, 1.6),
    ],
  },
  lightning: {
    theme: 'electric',
    draw: () => [
      G('29,5 13,25 22,25 17,43 36,21 26,21', '#ffe84a', INK, 2.1),
      G('27,10 18,23 24,23 21,36 31,23 25,23', WHITE, 'none'),
    ],
  },
  poison: {
    theme: 'toxic',
    draw: () => [
      P('M24 7 C24 7 38 20 38 29 A14 14 0 1 1 10 29 C10 20 24 7 24 7 Z', '#7ce644', INK, 2.1),
      C(18, 28, 3.2, '#e6ffc0', 'none'),
      C(29, 32, 2.0, '#44941c', 'none'),
    ],
  },
  support: {
    theme: 'emerald',
    draw: () => [
      L(13, 8, 13, 41, '#e8c45e', 3.2),
      P('M13 10 H38 L31 18 L38 26 H13 Z', '#6ee8c8', INK, 2.0),
      star4(23, 18, 4.4, 1.6, '#fff8c4', 'none'),
    ],
  },
};

function fallback(id) {
  let n = 0;
  const text = String(id || '');
  for (let i = 0; i < text.length; i++) n = (n + text.charCodeAt(i) * (i + 1)) % 97;
  const inset = 10 + (n % 4);
  return {
    theme: 'gold',
    draw: () => [
      G(`24,${inset} ${48 - inset},24 24,${48 - inset} ${inset},24`, '#f6cc52', INK, 2.0),
      C(24, 24, 3 + (n % 3), WHITE, INK, 1.3),
    ],
  };
}

function serializeParts(parts) {
  return parts.map(([tag, attrs, children]) => {
    const keys = Object.keys(attrs || {}).sort();
    const attrStr = keys.map((k) => `${k}=${attrs[k]}`).join(',');
    const childStr = Array.isArray(children) ? `[${serializeParts(children)}]` : '';
    return `${tag}(${attrStr})${childStr}`;
  }).join(';');
}

// Compile-time uniqueness verification across every icon in MARKS
const seen = new Map();
for (const id of Object.keys(MARKS)) {
  const entry = MARKS[id];
  const parts = entry.draw();
  if (!parts.length) throw new Error(`Fencefall icon "${id}" is blank`);
  const sig = `${entry.theme}|${serializeParts(parts)}`;
  if (seen.has(sig)) throw new Error(`Fencefall icon "${id}" matches "${seen.get(sig)}"`);
  seen.set(sig, id);
}

function svgElement(doc, tag, attrs) {
  let node = null;
  if (doc && typeof doc.createElementNS === 'function') {
    try {
      node = doc.createElementNS(SVG_NS, tag);
    } catch {
      node = null;
    }
  }
  if (!node) node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

function appendParts(doc, parent, parts, sigOut) {
  for (const [tag, attrs, children] of parts) {
    const node = svgElement(doc, tag, attrs);
    if (Array.isArray(children)) {
      appendParts(doc, node, children, sigOut);
    }
    parent.appendChild(node);
    sigOut.push(tag + ':' + (attrs.d || attrs.points || [attrs.cx, attrs.cy, attrs.r, attrs.x, attrs.y, attrs.x1, attrs.y1].filter((v) => v != null).join(',')));
  }
}

/** Crisp cel-shaded illustrated SVG badge for any catalog id. */
function catalogIcon(doc, id) {
  const key = typeof id === 'string' && id ? id : 'mark';
  const entry = Object.prototype.hasOwnProperty.call(MARKS, key) ? MARKS[key] : fallback(key);
  const theme = THEMES[entry.theme] || THEMES.gold;
  const parts = entry.draw();
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '-');
  const gid = `ffbg-${++gradSeq}`;

  const svg = svgElement(doc, 'svg', {
    class: 'catalog-icon',
    viewBox: '0 0 48 48',
    width: '44',
    height: '44',
    style: 'width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;display:block',
    'data-icon': key,
    'data-testid': `catalog-icon-${safe}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });

  // Rich radial-gradient badge backdrop (unique gradient id per render prevents DOM clashes)
  const defs = svgElement(doc, 'defs');
  const grad = svgElement(doc, 'radialGradient', {id: gid, cx: '36%', cy: '26%', r: '78%'});
  grad.appendChild(svgElement(doc, 'stop', {offset: '0%', 'stop-color': theme.top}));
  grad.appendChild(svgElement(doc, 'stop', {offset: '58%', 'stop-color': theme.mid}));
  grad.appendChild(svgElement(doc, 'stop', {offset: '100%', 'stop-color': theme.bot}));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Outer dark rim + glossy gradient rounded badge plate
  svg.appendChild(svgElement(doc, 'rect', {
    x: '1', y: '1', width: '46', height: '46', rx: '11',
    fill: '#0a1016',
  }));
  svg.appendChild(svgElement(doc, 'rect', {
    x: '2.2', y: '2.2', width: '43.6', height: '43.6', rx: '9.8',
    fill: `url(#${gid})`,
    stroke: theme.border,
    'stroke-width': '1.8',
  }));
  // Glossy mobile-game top sheen arc
  svg.appendChild(svgElement(doc, 'path', {
    d: 'M4.5 13 C4.5 7 7.5 4.5 13 4.5 H35 C40.5 4.5 43.5 7 43.5 13 V17 Q24 23 4.5 17 Z',
    fill: 'rgba(255, 255, 255, 0.13)',
  }));

  const sig = [entry.theme];
  appendParts(doc, svg, parts, sig);
  svg.setAttribute('data-paths', sig.join('|'));
  return svg;
}

function hasCatalogIcon(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MARKS, id);
}

const UI_PATHS = {
  battle: 'M12 2L4 6v6c0 5.5 3.4 9.6 8 11 4.6-1.4 8-5.5 8-11V6l-8-4zm0 4.2l4.5 2.3v3.5c0 3.2-1.8 5.9-4.5 7-2.7-1.1-4.5-3.8-4.5-7V8.5L12 6.2z',
  armory: 'M12 2l3 5.5L21 9l-4.5 4.2 1.2 6.3L12 16.5 6.3 19.5l1.2-6.3L3 9l6-1.5L12 2z',
  codex: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4zm3 3v10h8V7H8z',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.2 4.6l-1.7 1a6.9 6.9 0 0 1-.6 1.4l.5 1.9-1.8 1.8-1.9-.5a6.9 6.9 0 0 1-1.4.6l-1 1.7H9.7l-1-1.7a6.9 6.9 0 0 1-1.4-.6l-1.9.5-1.8-1.8.5-1.9a6.9 6.9 0 0 1-.6-1.4l-1.7-1v-2.2l1.7-1a6.9 6.9 0 0 1 .6-1.4l-.5-1.9 1.8-1.8 1.9.5a6.9 6.9 0 0 1 1.4-.6l1-1.7h2.6l1 1.7a6.9 6.9 0 0 1 1.4.6l1.9-.5 1.8 1.8-.5 1.9a6.9 6.9 0 0 1 .6 1.4l1.7 1v2.2z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2.5v7h2v-7h-2z',
  soundOn: 'M4 9v6h4l5 4V5L8 9H4zm12.5 3a3.5 3.5 0 0 0-2-3.2v6.4a3.5 3.5 0 0 0 2-3.2zm-2-7.3v2.1a5.8 5.8 0 0 1 0 10.4v2.1a7.8 7.8 0 0 0 0-14.6z',
  soundOff: 'M4 9v6h4l5 4V5L8 9H4zm12.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z',
  pause: 'M6 5h4v14H6V5zm8 0h4v14h-4V5z',
  play: 'M7 5v14l12-7L7 5z',
  menu: 'M4 6h16v2.2H4V6zm0 4.9h16v2.2H4v-2.2zm0 4.9h16V18H4v-2.2z',
  reroll: 'M17.6 6.4A7.5 7.5 0 1 0 19.3 14h-2.2a5.4 5.4 0 1 1-1.1-5.8L13.5 11H20V4.5l-2.4 1.9z',
  shield: 'M12 2L4 5.5v6c0 5.1 3.4 9.4 8 10.8 4.6-1.4 8-5.7 8-10.8v-6L12 2z',
};

function navIcon(doc, name, size = 20) {
  const svg = svgElement(doc, 'svg', {
    class: 'ui-icon',
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.appendChild(svgElement(doc, 'path', {
    d: UI_PATHS[name] || UI_PATHS.battle,
    fill: 'currentColor',
  }));
  return svg;
}

};
__ff_factories["src/ui/meta-panel.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["renderMetaPanel"] = renderMetaPanel;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/enemies.js");
const __ff_m2 = __ff_load("src/data/expeditions.js");
const __ff_m3 = __ff_load("src/systems/hero.js");
const __ff_m4 = __ff_load("src/systems/progression.js");
const __ff_m5 = __ff_load("src/i18n.js");
const __ff_m6 = __ff_load("src/ui/icons.js");
const CONTRACT_VERSION = __ff_m0["CONTRACT_VERSION"];
const ENEMIES = __ff_m1["ENEMIES"];
const CHAPTERS = __ff_m2["CHAPTERS"];
const EXPEDITIONS = __ff_m2["EXPEDITIONS"];
const STAGE_ORDER = __ff_m2["STAGE_ORDER"];
const STAGES = __ff_m2["STAGES"];
const TOTAL_STAGES = __ff_m2["TOTAL_STAGES"];
const highestClearedStage = __ff_m2["highestClearedStage"];
const highestUnlockedStage = __ff_m2["highestUnlockedStage"];
const isStageUnlocked = __ff_m2["isStageUnlocked"];
const nextStageId = __ff_m2["nextStageId"];
const stageClearRecord = __ff_m2["stageClearRecord"];
const stageIdFor = __ff_m2["stageIdFor"];
const stageNumber = __ff_m2["stageNumber"];
const totalStarsEarned = __ff_m2["totalStarsEarned"];
const HERO_UPGRADES = __ff_m3["HERO_UPGRADES"];
const isAutoSkill = __ff_m3["isAutoSkill"];
const EQUIPMENT = __ff_m4["EQUIPMENT"];
const GEMS = __ff_m4["GEMS"];
const GEM_ORDER = __ff_m4["GEM_ORDER"];
const GEM_SLOTS = __ff_m4["GEM_SLOTS"];
const PERMANENT_UPGRADES = __ff_m4["PERMANENT_UPGRADES"];
const getProfileBonuses = __ff_m4["getProfileBonuses"];
const nextArmoryBuy = __ff_m4["nextArmoryBuy"];
const formatDuration = __ff_m5["formatDuration"];
const formatNumber = __ff_m5["formatNumber"];
const localize = __ff_m5["localize"];
const translate = __ff_m5["t"];
const catalogIcon = __ff_m6["catalogIcon"];
const navIcon = __ff_m6["navIcon"];
/**
 * Fencefall v5 Mobile-First Meta Screens:
 * - Home 20-Stage Campaign Lobby (Resume banner, Starter Pack, Stage Switcher & 5×4 Grid, Deploy CTA)
 * - Tabbed Armory (Core Gems 3-Socket / Gear / Permanent Upgrades)
 * - Clean 2-Tab Codex (Guns & Auto Skills / Zombies)
 * - Settings + Quick Guide + Save Backup
 * - Punchy Victory/Defeat Results Screen
 */








const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
const SLOT_ORDER = ['weapon', 'charm', 'armor'];
const PERMANENT_ORDER = ['damage', 'haste', 'vitality', 'economy'];

const local = {
  screen: null,
  armoryTab: 'gems',
  codexTab: 'hero',
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
    ['bonus-sw', tr(api, lang, 'superweaponHaste'), bonuses.superweaponHaste > 0 ? `-${Math.round(bonuses.superweaponHaste * 100)}%` : '0%'],
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
// 3. CLEAN 2-TAB CODEX (GUNS & AUTO SKILLS / ZOMBIES)
// =========================================================================
function renderCodex(ctx, root) {
  const {doc, api, lang} = ctx;
  const stack = h(doc, 'div', {className: 'm-stack', 'data-testid': 'meta-codex'});
  if (local.codexTab !== 'enemies') local.codexTab = 'hero';

  const tabs = h(doc, 'div', {className: 'm-seg-tabs', role: 'tablist', 'data-testid': 'codex-tabs'});
  for (const [id, label] of [
    ['hero', lang === 'zh' ? '枪械与技能' : 'Guns & Skills'],
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
  if (local.codexTab === 'enemies') {
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
    const entries = Object.entries(HERO_UPGRADES).sort(([a], [b]) => {
      if (a === 'overclock') return 1;
      if (b === 'overclock') return -1;
      return Number(isAutoSkill(b)) - Number(isAutoSkill(a));
    });
    for (const [id, spec] of entries) {
      const isSuper = isAutoSkill(id);
      const card = h(doc, 'article', {className: `m-item-card${isSuper ? ' is-super-card' : ''}`, 'data-testid': `codex-hero-${id}`});
      const badgeText = id === 'overclock'
        ? (lang === 'zh' ? '枪械强化 · 可重复' : 'Gun Mod · Repeatable')
        : `${isSuper ? tr(api, lang, 'tagSuperweapon') : tr(api, lang, 'tagHero')} · Max ${spec.cap}`;
      card.append(h(doc, 'div', {className: 'm-item-head'}, [
        catalogIcon(doc, id),
        h(doc, 'div', {className: 'm-item-info'}, [
          h(doc, 'div', {className: 'm-item-title-row'}, [
            h(doc, 'h3', {text: loc(spec.name, lang)}),
            h(doc, 'span', {
              className: `badge ${isSuper ? 'badge-legend' : ''}`,
              text: badgeText
            })
          ]),
          h(doc, 'p', {className: 'm-item-desc', text: loc(spec.description, lang).replace(/^(Hero · |英雄 · )/, '')})
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
  for (const key of ['helpOverview', 'helpDraft', 'helpRange', 'helpFence', 'helpPlacement']) {
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
  stack.append(h(doc, 'p', {className: 'muted m-footnote', text: `Fencefall v5 · Contract ${CONTRACT_VERSION}`}));
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
function renderMetaPanel(container, screen, state, profile, api) {
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

};
__ff_factories["src/ui/shell.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["mountShell"] = mountShell;
const __ff_m0 = __ff_load("src/systems/combat.js");
const __ff_m1 = __ff_load("src/shared.js");
const __ff_m2 = __ff_load("src/systems/waves.js");
const __ff_m3 = __ff_load("src/data/enemies.js");
const __ff_m4 = __ff_load("src/data/expeditions.js");
const __ff_m5 = __ff_load("src/ui/icons.js");
const __ff_m6 = __ff_load("src/i18n.js");
const superweaponCooldown = __ff_m0["superweaponCooldown"];
const ARENA = __ff_m1["ARENA"];
const DIFFICULTIES = __ff_m1["DIFFICULTIES"];
const slotGeometry = __ff_m1["slotGeometry"];
const bossApproaching = __ff_m2["bossApproaching"];
const getWaveInfo = __ff_m2["getWaveInfo"];
const ENEMIES = __ff_m3["ENEMIES"];
const EXPEDITIONS = __ff_m4["EXPEDITIONS"];
const stageNumber = __ff_m4["stageNumber"];
const catalogIcon = __ff_m5["catalogIcon"];
const navIcon = __ff_m5["navIcon"];
const formatNumber = __ff_m6["formatNumber"];
const localize = __ff_m6["localize"];








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
function mountShell(root, api) {
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
  const battleSoundButton = controlButton('btn-battle-sound', 'sound');
  battleSoundButton.className = 'btn dock-btn dock-sound';
  const menuButton = controlButton('btn-fight-menu', 'screen');
  menuButton.className = 'btn dock-btn dock-menu';
  menuButton.dataset.name = 'menu';
  battleDock.append(pauseButton, speedRow, battleSoundButton, menuButton);

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

    if (battleSoundButton.dataset.iconKey !== soundIconKey) {
      battleSoundButton.dataset.iconKey = soundIconKey;
      battleSoundButton.replaceChildren(navIcon(doc, soundIconKey, 17));
    }
    battleSoundButton.setAttribute('aria-label', soundOn ? text('soundOn') : text('soundOff'));
    battleSoundButton.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    battleSoundButton.classList.toggle('is-active', soundOn);

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

};
__ff_load("src/boot.js");
})();
