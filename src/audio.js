/**
 * Fencefall combat feedback audio.
 *
 * createAudio() -> {unlock(), setEnabled(boolean), playEvents(events), destroy()}
 * Local Web Audio one-shots only. No music bed and no downloaded samples.
 * Sound is off until setEnabled(true). unlock() must run inside a user gesture
 * (pointer or key) before playEvents can be heard. Both calls are safe to repeat.
 * playEvents does not mutate the event array and never throws.
 * When the profile or an event says reducedMotion, each tone is shorter and
 * quieter. A critical hit stays its own high chime, apart from a normal hit.
 * setEnabled(false) still silences every cue, including a softened one.
 *
 * Event names match the effects module: shot, hit, kill, fence_hit, merge,
 * draft, victory, defeat, ui, plus optional status and boss cues.
 * Shot, hit, merge, draft, fence damage, victory, and defeat each use a
 * different contour. A critical hit is its own short high chime, separate
 * from a normal hit and quieter than a fence hit. Repeated shot tones stay
 * under a fence hit, a merge, a draft opening, a victory, and a defeat.
 * Tower identity uses towerType (bolt, fire, frost, lightning, poison, support, hero).
 */
import { collectFeedback } from './render/effects.js';

const MASTER = 0.28;
const MAX_VOICES = 16;
// Lightning noise (0.07) is the loudest shot layer. SHOT_BED keeps a shot, and
// every repeat, under draft (0.03), merge (0.042), victory and defeat (0.048), and a fence hit (0.072).
// A crit chime peaks at 0.044, under that fence hit. setEnabled(false) mutes it with everything else.
const SHOT_BED = 0.2;
const SHOT_REPEAT_WINDOW = 1.35;
const SHOT_REPEAT_STEPS = Object.freeze([1, 0.58, 0.42]);
// Reduced motion keeps the same contours and the same relative mix.
// Length and peak both drop, so a crit chime stays higher than a hit and still under a fence hit.
const REDUCED_GAIN = 0.5;
const REDUCED_TIME = 0.55;
const REDUCED_FLOOR = 0.016;

const AUDIO_LIMITS = Object.freeze({
  shot: 3,
  hit: 4,
  kill: 3,
  fence_hit: 2,
  merge: 2,
  draft: 1,
  victory: 1,
  defeat: 1,
  ui: 2,
  status: 2,
  boss: 1,
});

const GAPS = Object.freeze({
  shot: 0.045,
  hit: 0.03,
  kill: 0.05,
  fence_hit: 0.07,
  merge: 0.18,
  draft: 0.2,
  victory: 0.35,
  defeat: 0.35,
  ui: 0.03,
  status: 0.08,
  boss: 0.25,
});

const PRIORITY = Object.freeze({
  victory: 0,
  defeat: 1,
  merge: 2,
  draft: 3,
  boss: 4,
  fence_hit: 5,
  kill: 6,
  hit: 7,
  shot: 8,
  ui: 9,
  status: 10,
});

const PITCH = Object.freeze({
  bolt: 700,
  fire: 168,
  frost: 940,
  lightning: 1560,
  poison: 220,
  support: 640,
  hero: 500,
  brittle: 340,
  neutral: 420,
});

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
    return 260 + (hashString(desc.element || 'hybrid') % 640);
  }
  return PITCH[desc.behavior] || PITCH.neutral;
}

function wobble(freq, time) {
  const n = mix((Math.round((time || 0) * 1000) ^ Math.round(freq) ^ 0x9e37) >>> 0) / 4294967296;
  return freq * (1 + (n - 0.5) * 0.07);
}

function clampFreq(value) {
  if (!Number.isFinite(value)) return 440;
  return Math.max(50, Math.min(2800, value));
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

function makeNoiseBuffer(context) {
  const rate = context.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * 0.2));
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 0x12345678;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = ((seed >>> 8) / 16777215) * 2 - 1;
  }
  return buffer;
}

export function createAudio(options) {
  let enabled = false;
  let alive = true;
  let context = null;
  let master = null;
  let noiseBuffer = null;
  const voices = [];
  const lastAt = new Map();
  let shotStamp = -1;
  let shotRun = 0;
  let profileReduced = false;
  let soften = false;
  const initialReduced = reducedFlag(options);
  if (initialReduced != null) profileReduced = initialReduced;

  function desiredGain() {
    return enabled && context && context.state === 'running' ? MASTER : 0;
  }

  function applyGain() {
    if (!master || !context) return;
    const value = desiredGain();
    try {
      const now = context.currentTime;
      if (typeof master.gain.cancelScheduledValues === 'function') master.gain.cancelScheduledValues(now);
      if (typeof master.gain.setValueAtTime === 'function' && typeof master.gain.linearRampToValueAtTime === 'function') {
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(value, now + 0.03);
      } else {
        master.gain.value = value;
      }
    } catch {
      try { master.gain.value = value; } catch { /* ignore a closed context */ }
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
      master = context.createGain();
      master.gain.value = 0;
      try {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 12;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.12;
        master.connect(compressor);
        compressor.connect(context.destination);
      } catch {
        master.connect(context.destination);
      }
      noiseBuffer = makeNoiseBuffer(context);
    } catch {
      try { context.close(); } catch { /* ignore */ }
      context = null;
      master = null;
      noiseBuffer = null;
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
        return Promise.resolve(true);
      }
      let pending;
      try { pending = ctx.resume(); }
      catch { return Promise.resolve(false); }
      return Promise.resolve(pending).then(() => {
        if (!alive || !context) return false;
        primeSilence();
        applyGain();
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
  }

  function reap(now) {
    let write = 0;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i] > now) voices[write++] = voices[i];
    }
    voices.length = write;
  }

  function takeVoice(start, duration) {
    reap(context.currentTime);
    if (voices.length >= MAX_VOICES) return false;
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
    if (!soften) return Math.max(0.03, Math.min(cap, dur));
    return Math.max(REDUCED_FLOOR, Math.min(cap * REDUCED_TIME, dur * REDUCED_TIME));
  }

  function cueGain(gain) {
    return Math.max(0.0001, soften ? gain * REDUCED_GAIN : gain);
  }

  function tone({ freq, dur, type = 'square', gain = 0.05, slide = 0, delay = 0 }) {
    if (!enabled || !context || !master) return false;
    const length = cueLength(dur, 0.6);
    const wait = Math.max(0, Math.min(0.5, delay));
    const start = context.currentTime + wait;
    const frequency = clampFreq(freq);
    if (!Number.isFinite(start) || !takeVoice(start, length)) return false;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    const destination = clampFreq(frequency + slide);
    if (Math.abs(destination - frequency) > 1) {
      osc.frequency.exponentialRampToValueAtTime(destination, start + length);
    }
    const peak = cueGain(gain);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.012, length * 0.35));
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
    osc.onended = release([osc, amp]);
    return true;
  }

  function noise({ dur, gain, delay = 0, band = 800, q = 0.8 }) {
    if (!enabled || !context || !master || !noiseBuffer) return false;
    const length = cueLength(dur, 0.45);
    const wait = Math.max(0, Math.min(0.5, delay));
    const start = context.currentTime + wait;
    if (!Number.isFinite(start) || !takeVoice(start, length)) return false;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(80, Math.min(4000, band));
    filter.Q.value = Math.max(0.2, q);
    const amp = context.createGain();
    const peak = cueGain(gain);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, length * 0.3));
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(start);
    source.stop(start + length + 0.02);
    source.onended = release([source, filter, amp]);
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

  function playShot(desc, delay) {
    const freq = wobble(pitchFor(desc), desc.time);
    const behavior = desc.behavior;
    // First shot in a lull uses SHOT_BED. Repeats step down so a firing line stays quieter than the accents.
    const bed = SHOT_BED * shotRepeatStep();
    const g = (gain) => gain * bed;
    return safe(() => {
      if (behavior === 'fire') {
        return layers(
          noise({ dur: 0.09, gain: g(0.06), band: 420, q: 0.6, delay }),
          tone({ freq, dur: 0.08, type: 'sawtooth', gain: g(0.03), slide: -50, delay }),
        );
      }
      if (behavior === 'frost') {
        return layers(
          tone({ freq, dur: 0.07, type: 'sine', gain: g(0.045), slide: 180, delay }),
          tone({ freq: clampFreq(freq * 1.5), dur: 0.05, type: 'triangle', gain: g(0.02), delay: delay + 0.02 }),
        );
      }
      if (behavior === 'lightning') {
        return layers(
          noise({ dur: 0.045, gain: g(0.07), band: 2200, q: 0.85, delay }),
          tone({ freq, dur: 0.04, type: 'square', gain: g(0.03), slide: -700, delay }),
        );
      }
      if (behavior === 'poison') {
        return layers(
          tone({ freq, dur: 0.1, type: 'triangle', gain: g(0.05), slide: -36, delay }),
          noise({ dur: 0.08, gain: g(0.028), band: 280, q: 1.1, delay }),
        );
      }
      if (behavior === 'support') {
        return layers(
          tone({ freq: 660, dur: 0.055, type: 'sine', gain: g(0.038), slide: 50, delay }),
          tone({ freq: 990, dur: 0.06, type: 'triangle', gain: g(0.02), delay: delay + 0.018 }),
        );
      }
      if (behavior === 'hero') {
        return layers(
          tone({ freq, dur: 0.06, type: 'triangle', gain: g(0.05), slide: 70, delay }),
          noise({ dur: 0.03, gain: g(0.028), band: 1400, q: 1.6, delay }),
        );
      }
      return layers(
        tone({ freq, dur: 0.045, type: 'square', gain: g(0.042), slide: -110, delay }),
        noise({ dur: 0.03, gain: g(0.026), band: behavior === 'brittle' ? 700 : 1600, q: 1.3, delay }),
      );
    });
  }

  function playHit(desc, delay) {
    const tint = Math.min(260, Math.max(90, pitchFor(desc) * 0.28));
    const body = wobble(tint, desc.time + 0.17);
    if (desc.crit) {
      // Rising chime, not the low hit thud. Both layers stay under the fence sine at 0.072.
      // Reduced motion shortens and quiets this chime in tone(); it does not become the thud.
      return safe(() => layers(
        tone({ freq: 1174, dur: 0.04, type: 'triangle', gain: 0.044, slide: 196, delay }),
        tone({ freq: 1760, dur: 0.032, type: 'square', gain: 0.018, delay: delay + 0.016 }),
      ));
    }
    return safe(() => layers(
      noise({ dur: 0.032, gain: 0.042, band: 980, q: 0.9, delay }),
      tone({ freq: body, dur: 0.042, type: 'sine', gain: 0.04, slide: -55, delay }),
    ));
  }

  function playKill(desc, delay) {
    const freq = wobble(pitchFor(desc), desc.time);
    return safe(() => layers(
      noise({ dur: 0.11, gain: 0.055, band: 680, q: 0.55, delay }),
      tone({ freq: Math.max(freq, 360), dur: 0.14, type: 'triangle', gain: 0.048, slide: -220, delay }),
    ));
  }

  function playFence(desc, delay) {
    const extra = desc.damage != null && desc.damage > 0 ? Math.min(0.018, desc.damage / 900) : 0;
    return safe(() => layers(
      tone({ freq: 78, dur: 0.1, type: 'sine', gain: 0.072 + extra, slide: -22, delay }),
      noise({ dur: 0.045, gain: 0.055, band: 210, q: 0.45, delay }),
      tone({ freq: 168, dur: 0.03, type: 'square', gain: 0.018, slide: -60, delay }),
    ));
  }

  function playMerge(desc, delay) {
    const rank = Math.max(1, Math.min(8, Number(desc.rank) || 1));
    return safe(() => layers(
      tone({ freq: 340, dur: 0.13, type: 'triangle', gain: 0.042, slide: 540, delay }),
      tone({ freq: clampFreq(1120 + rank * 36), dur: 0.08, type: 'sine', gain: 0.034, delay: delay + 0.08 }),
    ));
  }

  function playDraft(delay) {
    return safe(() => layers(
      tone({ freq: 440, dur: 0.11, type: 'sine', gain: 0.03, delay }),
      tone({ freq: 554, dur: 0.14, type: 'sine', gain: 0.024, delay: delay + 0.07 }),
    ));
  }

  function playVictory() {
    const notes = [523, 659, 784, 1046];
    let played = false;
    for (let i = 0; i < notes.length; i++) {
      const last = i === notes.length - 1;
      if (safe(() => tone({
        freq: notes[i],
        dur: last ? 0.2 : 0.08,
        type: last ? 'triangle' : 'square',
        gain: last ? 0.048 : 0.03,
        delay: i * 0.07,
      }))) played = true;
    }
    return played;
  }

  function playDefeat() {
    return safe(() => layers(
      tone({ freq: 294, dur: 0.26, type: 'triangle', gain: 0.038, slide: -88 }),
      tone({ freq: 220, dur: 0.34, type: 'sine', gain: 0.048, slide: -64, delay: 0.05 }),
    ));
  }

  function playUi(desc, delay) {
    const error = desc.cue === 'error';
    return safe(() => tone({
      freq: error ? 168 : 1480,
      dur: error ? 0.07 : 0.028,
      type: 'square',
      gain: 0.03,
      slide: error ? -40 : 0,
      delay,
    }));
  }

  function playStatus(desc, delay) {
    const behavior = desc.behavior;
    return safe(() => {
      if (behavior === 'fire') return noise({ dur: 0.05, gain: 0.03, band: 620, q: 0.8, delay });
      if (behavior === 'frost') return tone({ freq: 1280, dur: 0.04, type: 'sine', gain: 0.025, delay });
      if (behavior === 'poison') return tone({ freq: 180, dur: 0.07, type: 'triangle', gain: 0.03, delay });
      if (behavior === 'lightning') return noise({ dur: 0.04, gain: 0.03, band: 1800, q: 0.9, delay });
      return tone({ freq: 720, dur: 0.05, type: 'sine', gain: 0.025, delay });
    });
  }

  function playBoss(delay) {
    return safe(() => layers(
      tone({ freq: 110, dur: 0.2, type: 'triangle', gain: 0.05, slide: -24, delay }),
      tone({ freq: 164, dur: 0.16, type: 'sine', gain: 0.03, delay: delay + 0.08 }),
      noise({ dur: 0.12, gain: 0.04, band: 200, q: 0.6, delay }),
    ));
  }

  function dispatch(desc, delay) {
    switch (desc.type) {
      case 'shot': return playShot(desc, delay);
      case 'hit': return playHit(desc, delay);
      case 'kill': return playKill(desc, delay);
      case 'fence_hit': return playFence(desc, delay);
      case 'merge': return playMerge(desc, delay);
      case 'draft': return playDraft(delay);
      case 'victory': return playVictory();
      case 'defeat': return playDefeat();
      case 'ui': return playUi(desc, delay);
      case 'status': return playStatus(desc, delay);
      case 'boss': return playBoss(delay);
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
    if (fromHint != null) profileReduced = fromHint;
    const list = playbackList(events);
    // An event flag softens this batch only. A profile flag stays until another profile says otherwise.
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
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    enabled = false;
    voices.length = 0;
    lastAt.clear();
    shotStamp = -1;
    shotRun = 0;
    const ctx = context;
    context = null;
    master = null;
    noiseBuffer = null;
    if (ctx && typeof ctx.close === 'function') {
      try {
        const closed = ctx.close();
        if (closed && typeof closed.catch === 'function') closed.catch(() => {});
      } catch { /* ignore */ }
    }
  }

  return { unlock, setEnabled, playEvents, destroy };
}
