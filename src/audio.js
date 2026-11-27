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
import { collectFeedback } from './render/effects.js';

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

export function createAudio(options) {
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
