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

function createAudio(options) {
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

};
__ff_factories["src/boot.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["createController"] = createController;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/engine.js");
const __ff_m2 = __ff_load("src/systems/hero.js");
const __ff_m3 = __ff_load("src/systems/merges.js");
const __ff_m4 = __ff_load("src/systems/drafts.js");
const __ff_m5 = __ff_load("src/systems/progression.js");
const __ff_m6 = __ff_load("src/storage.js");
const __ff_m7 = __ff_load("src/i18n.js");
const __ff_m8 = __ff_load("src/data/towers.js");
const __ff_m9 = __ff_load("src/data/recipes.js");
const __ff_m10 = __ff_load("src/systems/waves.js");
const __ff_m11 = __ff_load("src/ui/shell.js");
const __ff_m12 = __ff_load("src/ui/build-panel.js");
const __ff_m13 = __ff_load("src/ui/meta-panel.js");
const __ff_m14 = __ff_load("src/audio.js");
const __ff_m15 = __ff_load("src/render/renderer.js");
const ARENA = __ff_m0["ARENA"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const canPlan = __ff_m0["canPlan"];
const clone = __ff_m0["clone"];
const hitSlot = __ff_m0["hitSlot"];
const slotGeometry = __ff_m0["slotGeometry"];
const advance = __ff_m1["advance"];
const createProfile = __ff_m1["createProfile"];
const createRun = __ff_m1["createRun"];
const exportRun = __ff_m1["exportRun"];
const integrationInfo = __ff_m1["integrationInfo"];
const prepare = __ff_m1["prepare"];
const setSpeed = __ff_m1["setSpeed"];
const takeEvents = __ff_m1["takeEvents"];
const hero = __ff_m2;
const merges = __ff_m3;
const drafts = __ff_m4;
const progression = __ff_m5;
const storage = __ff_m6;
const i18n = __ff_m7;
const towers = __ff_m8;
const recipes = __ff_m9;
const waves = __ff_m10;
const shellMod = __ff_m11;
const build = __ff_m12;
const meta = __ff_m13;
const audioMod = __ff_m14;
const rendererMod = __ff_m15;

















const SCREENS = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];
const ACTIONS = Object.freeze(['start', 'resume', 'restart', 'abandon', 'pause', 'speed', 'language', 'sound', 'reducedMotion', 'screen', 'selectSlot', 'move', 'dragDrop', 'chooseDraft', 'place', 'cancelPlacement', 'mergePreview', 'mergeConfirm', 'mergeCancel', 'buyEquipment', 'equip', 'upgradePermanent', 'exportSave', 'importSave', 'hover']);
__ff_exports["ACTIONS"] = ACTIONS;


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

const MODULES = {
  hero, merges, drafts, progression, storage, i18n, towers, recipes, waves,
  shell: shellMod, build, meta, audio: audioMod, renderer: rendererMod,
};

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

async function createController(options = {}) {
  const modules = MODULES;
  const injected = options.storage || null;
  let profile = options.profile || null;
  let run = null;
  let storedRun = null;
  let audio = null;
  const settledIds = new Set();
  const ui = {screen:'menu', selectedSlot:-1, hoverSlot:-1, hoverIntent:'', mergeFrom:-1, mergePreview:null, message:'', exportText:''};

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
      const intent = payload.intent;
      ui.hoverIntent = ui.hoverSlot >= 0 && (intent === 'empty' || intent === 'merge' || intent === 'illegal') ? intent : '';
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
    if (action === 'dragDrop') return dragDrop(payload.from, payload.to);
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

  function dragDrop(from, to) {
    if (!run) return {ok:false, reason:'no-run'};
    if (!integerSlot(from) || !integerSlot(to)) return {ok:false, reason:'bad-slot', snapped:true};
    if (from === to) return {ok:true, snapped:true};
    if (run.phase === 'victory' || run.phase === 'defeat' || !canPlan(run)) return {ok:false, reason:'not-planning', snapped:true};
    const origin = run.slots[from]?.unit;
    const target = run.slots[to]?.unit;
    if (!origin) return {ok:false, reason:'emptySlot', snapped:true};
    if (!target) return moveUnits(from, to);
    if (origin.kind === 'hero' || target.kind === 'hero' || origin.type === 'hero' || target.type === 'hero') {
      return {ok:false, reason:'heroProtected', snapped:true};
    }
    if (typeof modules.merges?.previewMerge !== 'function' || typeof modules.merges?.mergeUnits !== 'function') {
      return {ok:false, reason:'unavailable', snapped:true};
    }
    const preview = resultOf(modules.merges.previewMerge(run, from, to));
    if (!preview.ok) return {...preview, snapped:true};
    const merged = resultOf(modules.merges.mergeUnits(run, from, to));
    if (!merged.ok) return {...merged, snapped:true};
    ui.mergePreview = null;
    ui.mergeFrom = -1;
    ui.selectedSlot = to;
    saveRun();
    return {...merged, description: preview.description};
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
    else if (action === 'dragDrop' && outcome.description) {
      const lang = profile.settings?.language === 'zh' ? 'zh' : 'en';
      const text = outcome.description[lang] || outcome.description.en;
      ui.message = typeof text === 'string' ? text.trim() : '';
    }
    else if (action === 'mergePreview' || (action === 'selectSlot' && ui.mergePreview)) {
      const lang = profile.settings?.language === 'zh' ? 'zh' : 'en';
      const described = ui.mergePreview?.description;
      ui.message = (described && (described[lang] || described.en)) || '';
    }
    else ui.message = '';
    return outcome;
  }

  const api = {
    getState:() => run || storedRun,
    getProfile:() => profile,
    t:translate,
    act,
    getUI:() => ({
      screen:ui.screen,
      selectedSlot:ui.selectedSlot,
      hoverSlot:ui.hoverSlot,
      hoverIntent:ui.hoverIntent || '',
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
    integration:() => ({engine:integrationInfo(), modules:Object.fromEntries(Object.entries(MODULES).map(([key, value]) => [key, !!value]))}),
  };
  return api;
}

function copyValue(value) {
  try { return clone(value); } catch { return {...value}; }
}

function statusLine(api, state, language, ready, online) {
  if (!state) return `${api.t('missing')}: ${online.engine.missing.length}`;
  return `${api.t('fence')} ${formatNumber(Math.max(0, state.fence.hp), language)}/${formatNumber(state.fence.maxHp, language)} · ${api.t('wave')} ${formatNumber(state.wave, language)} · ${api.t('time')} ${formatNumber(Math.floor(state.time), language)}s`;
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
  const outcome = state?.settlement?.result || (state?.phase === 'victory' || state?.phase === 'defeat' ? state.phase : null);
  const heading = el('h2');
  heading.textContent = i18n.resultLabel(language, outcome);
  const detail = el('p');
  detail.dataset.testid = 'result-story';
  const paid = state?.settlement && Number.isFinite(state.settlement.currency) ? state.settlement.currency : null;
  detail.textContent = i18n.resultStory(language, outcome, paid);
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
  const modules = MODULES;
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
      renderer.draw(state, {selectedSlot:view.selectedSlot, hoverSlot:view.hoverSlot, hoverIntent:view.hoverIntent, settings:{reducedMotion:api.getProfile().settings.reducedMotion === true}, range:true});
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

};
__ff_factories["src/data/enemies.js"] = function(__ff_exports, __ff_load) {
"use strict";
// Enemy catalog for Fencefall. Keys are the simulation kinds.
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
// Enemies stop with center y <= fenceY - radius and never damage defenders.
// xp is awarded once on kill. Four ash shamblers are 8 xp, the opening draft threshold.

const ENEMIES = {
  shambler: {
    name: {en: 'Ash Shambler', zh: '灰烬蹒者'},
    description: {
      en: 'The common body: ordinary pace and health, no armor, and a steady bite on the shared fence.',
      zh: '最常见的敌人：步速与生命都普通，没有护甲，以稳定的节奏啃咬共享栅栏。',
    },
    role: {en: 'Grunt', zh: '步兵'},
    threat: 1,
    hp: 80,
    speed: 28,
    radius: 13,
    damage: 8,
    attackInterval: 1.25,
    xp: 2,
    armor: 0,
  },
  runner: {
    name: {en: 'Wire Runner', zh: '线驰者'},
    description: {
      en: 'The fastest body. Thin health, a light bite, and it reaches the shared fence well ahead of the ash shamblers, so shoot it early.',
      zh: '最快的敌人。生命很薄、啃咬很轻，会远早于灰烬蹒者贴上共享栅栏，需要提前打掉。',
    },
    role: {en: 'Raider', zh: '突进'},
    threat: 2,
    hp: 46,
    speed: 58,
    radius: 11,
    damage: 6,
    attackInterval: 0.9,
    xp: 2,
    armor: 0,
  },
  brute: {
    name: {en: 'Gate Brute', zh: '闸门蛮兽'},
    description: {
      en: 'Huge and slow. Each bite tears a deep chunk from the shared fence, and its long health takes a focused fight.',
      zh: '体型巨大、步速很慢。每一口都从共享栅栏撕下很深的一块，厚实的生命需要长时间集火。',
    },
    role: {en: 'Siege', zh: '攻城'},
    threat: 5,
    hp: 680,
    speed: 18,
    radius: 20,
    damage: 28,
    attackInterval: 1.65,
    xp: 7,
    armor: 0.15,
  },
  armored: {
    name: {en: 'Plate Walker', zh: '板甲行者'},
    description: {
      en: 'Thick plate sheds a bit more than half of every hit. It walks up and keeps biting the shared fence until that plate is focused down.',
      zh: '厚甲会挡下略多于一半的每一击。它走向共享栅栏并持续啃咬，直到这层甲被集火拆掉。',
    },
    role: {en: 'Bulwark', zh: '重甲'},
    threat: 4,
    hp: 210,
    speed: 24,
    radius: 15,
    damage: 11,
    attackInterval: 1.4,
    xp: 4,
    armor: 0.55,
  },
  spitter: {
    name: {en: 'Sap Spitter', zh: '腐浆喷者'},
    description: {
      en: 'Fragile, with the shortest pause between bites. Each bite on the shared fence is light, and the danger is how fast those bites stack once it arrives.',
      zh: '身体脆弱，啃咬间隔最短。对共享栅栏的每一口都很轻，威胁在于抵达之后轻咬叠得很快。',
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
      en: 'Tiny and weak alone, with a small bite. They arrive in bunches and smother the shared fence by numbers.',
      zh: '单只又小又弱，啃咬也很轻。它们成群涌来，靠数量淹没共享栅栏。',
    },
    role: {en: 'Swarm', zh: '虫群'},
    threat: 1,
    hp: 18,
    speed: 50,
    radius: 8,
    damage: 3,
    attackInterval: 1.05,
    xp: 1,
    armor: 0,
  },
  boss: {
    name: {en: 'Crown Breach', zh: '冠裂兽'},
    description: {
      en: 'Boss. At or below half (0.5) of its maximum health it enrages, moving faster and striking the shared fence harder and more often. It periodically calls weaker dust gnawers. It attacks only the fence.',
      zh: '首领。生命降至最大生命的一半（0.5）或以下时会狂暴，移动更快，对共享栅栏的打击更重、更密，并周期性召唤较弱的尘啮。它只攻击栅栏。',
    },
    role: {en: 'Boss', zh: '首领'},
    threat: 7,
    hp: 3000,
    speed: 16,
    radius: 26,
    damage: 26,
    attackInterval: 1.2,
    xp: 36,
    armor: 0.2,
    // Read by updateWaves. Not a status type and not defender damage.
    enrage: {threshold: 0.5, speedScale: 1.18, damageScale: 1.55, intervalScale: 0.85},
    summon: {kind: 'swarm', count: 2, interval: 7.5, healthScale: 0.85, maxLiving: 12},
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
__ff_factories["src/data/recipes.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["getRecipe"] = getRecipe;
__ff_exports["isRecipeId"] = isRecipeId;
__ff_exports["findRecipe"] = findRecipe;
__ff_exports["normalizeRank"] = normalizeRank;
__ff_exports["rankDamageMultiplier"] = rankDamageMultiplier;
__ff_exports["scaleHybridStats"] = scaleHybridStats;
__ff_exports["getHybridStats"] = getHybridStats;
const __ff_m0 = __ff_load("src/shared.js");
const BASE_TYPES = __ff_m0["BASE_TYPES"];
const clamp = __ff_m0["clamp"];
// Hybrid recipe catalog. Rank-1 UnitStats live on each recipe.
// Towers: for a hybrid, return getHybridStats(unit) and apply profile bonuses
// once. Do not multiply this table by rank again. See MECHANIC_HOOKS.


const HYBRID_RANK_MIN = 1;
__ff_exports["HYBRID_RANK_MIN"] = HYBRID_RANK_MIN;

const HYBRID_RANK_MAX = 4;
__ff_exports["HYBRID_RANK_MAX"] = HYBRID_RANK_MAX;


const MECHANICS = Object.freeze(['pierce', 'chain', 'splash', 'burn', 'slow', 'poison', 'aura', 'crit']);
const STAT_KEYS = Object.freeze(['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce', 'burn', 'slow', 'poison', 'aura', 'mechanics']);
const EFFECT_KEYS = Object.freeze({
  burn: ['dps', 'duration'],
  slow: ['factor', 'duration'],
  poison: ['dps', 'duration', 'maxStacks'],
  aura: ['range', 'damage', 'haste'],
});

const MECHANIC_HOOKS = Object.freeze({
  getUnitStats: 'If unit.kind is hybrid or isRecipeId(unit.type), start from getHybridStats(unit) and apply profile bonuses once. getHybridStats already includes rank. Do not scale it again and do not read RECIPES.stats as the displayed combat numbers for rank 2+.',
  profile: 'After getHybridStats, damage *= 1 + bonuses.damage; interval = max(0.28, interval / (1 + bonuses.haste)); range += bonuses.range; critChance = min(0.5, critChance + bonuses.critChance). bonuses.fence and bonuses.reward are not tower stats. getHybridStats itself ignores profile, equipment, and other towers.',
  onHit: 'When stats.burn, stats.slow, or stats.poison is present, combat applies that status to every enemy damaged by the direct hit, each pierce hit, each splash target, and each chain jump. One application per enemy per hit.',
  burn: 'applyStatus(enemy, {type:"burn", power:burn.dps, remaining:burn.duration, sourceId}). Burn does not stack. A later burn replaces power and refreshes remaining. Tick damage is power * dt via the status damage callback.',
  poison: 'applyStatus(enemy, {type:"poison", power:poison.dps, remaining:poison.duration, stacks:1, sourceId}). Each hit adds one stack up to poison.maxStacks and refreshes remaining. Tick damage is power * stacks * dt. Rank multiplies dps and does not raise maxStacks.',
  slow: 'applyStatus(enemy, {type:"slow", power:slow.factor, remaining:slow.duration, sourceId}). power is the remaining speed factor (0.58 means 58% speed), not a percentage reduction. Keep the lower factor and refresh remaining. Movement reads getSpeedFactor and must not rewrite enemy.speed.',
  aura: 'stats.aura adds fractional damage and haste to every defender, including the owner, whose slot center is within aura.range. It never damages enemies. Combat caps the sum of auras on one defender at +0.50 damage and +0.40 haste.',
  pierce: 'Copy stats.pierce onto the projectile as extra enemies after the first. Each of those hits uses the same damage roll rules and on-hit statuses.',
  chain: 'Copy stats.chain and stats.chainRange. Each jump chooses a living enemy inside chainRange that is not already in visited, then applies damage and on-hit statuses.',
  splash: 'stats.splash is the impact radius in logical pixels. Each enemy in that circle takes the hit damage and on-hit statuses. Zero means no splash.',
  crit: 'Roll critChance separately for each enemy hit. A crit multiplies that hit by critMultiplier and passes crit:true. mechanics includes crit only when critChance > 0.',
  rank: 'Same-type merges require equal rank and produce rank+1, including two identical hybrids, and stop at rank 4. Two different base types require equal rank and a recipe; the hybrid keeps that rank and does not gain a free rank. Damage, burn dps, and poison dps scale by 2^(rank-1). Interval is divided by 1+0.12*(rank-1), with a 0.28s floor. Range, projectile speed, crit, splash, chain, and pierce gain small capped steps. Slow factor improves slightly and never drops below 0.35. Aura bonuses are additive and capped; they do not use the damage multiplier. Poison maxStacks and burn stacking do not grow with rank.',
  mechanicsField: 'stats.mechanics contains only pierce, chain, splash, burn, slow, poison, aura, and crit, and it matches the fields on that same object. Combat should act on the fields. The array is the codex label. No recipe needs stun or brittle.',
});
__ff_exports["MECHANIC_HOOKS"] = MECHANIC_HOOKS;


function copyEffect(effect) {
  return effect ? { ...effect } : undefined;
}

function unitStats(fields) {
  const stats = {
    damage: fields.damage,
    interval: fields.interval,
    range: fields.range,
    critChance: fields.critChance ?? 0,
    critMultiplier: fields.critMultiplier ?? 1.75,
    projectileSpeed: fields.projectileSpeed ?? 300,
    splash: fields.splash ?? 0,
    chain: fields.chain ?? 0,
    chainRange: fields.chainRange ?? 70,
    pierce: fields.pierce ?? 0,
    mechanics: [...fields.mechanics],
  };
  if (fields.burn) stats.burn = copyEffect(fields.burn);
  if (fields.slow) stats.slow = copyEffect(fields.slow);
  if (fields.poison) stats.poison = copyEffect(fields.poison);
  if (fields.aura) stats.aura = copyEffect(fields.aura);
  return stats;
}

function recipe(id, parents, name, description, fields) {
  return { id, parents: [...parents], name: { en: name.en, zh: name.zh }, description: { en: description.en, zh: description.zh }, stats: unitStats(fields) };
}

const RAW_RECIPES = [
  recipe('cinderbolt', ['bolt', 'fire'],
    { en: 'Cinderbolt', zh: '烬矢' },
    { en: 'Cut a burning line through a file of enemies. Unlike Rivet, it drops the crit and pierces 2 extra enemies instead of 1, and every pierced enemy burns. Unlike Cinder, it has no splash: the burn travels in a line at 5 damage per second for 2.4s instead of bursting in a circle at 4 damage per second for 2.6s.', zh: '用一条燃烧直线切开一列敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，并且每个被贯穿的敌人都会燃烧。和烬火不同，它没有溅射：燃烧沿直线传递，每秒 5 点、持续 2.4 秒，而不是在圆形范围内以每秒 4 点燃烧 2.6 秒。' },
    { damage: 14, interval: 0.72, range: 260, projectileSpeed: 480, pierce: 2, burn: { dps: 5, duration: 2.4 }, mechanics: ['pierce', 'burn'] }),
  recipe('hailspike', ['bolt', 'frost'],
    { en: 'Hailspike', zh: '雹针' },
    { en: 'Drive a slowing line through the enemies in front. Unlike Rivet, it drops the crit, pierces 2 extra enemies instead of 1, and slows each of them to 58% speed. Unlike Rime, the slow hits every enemy in the line instead of one target, and 58% speed is slower than Rime at 64% for the same 2.2s.', zh: '用一条减速直线钉住前方的敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，并让每个命中的敌人移速变为 58%。和霜结不同，减速打在直线上的每个敌人，而不是单个目标，而且同样持续 2.2 秒时，58% 移速比霜结的 64% 更慢。' },
    { damage: 12, interval: 0.8, range: 255, projectileSpeed: 440, pierce: 2, slow: { factor: 0.58, duration: 2.2 }, mechanics: ['pierce', 'slow'] }),
  recipe('arcbolt', ['bolt', 'lightning'],
    { en: 'Arcbolt', zh: '弧矢' },
    { en: 'Snap a chain that can crit between clustered enemies. Unlike Rivet, it drops pierce and chains to 2 extra enemies, and its crit rises from 15% at 1.85× to 24% at 2×. Unlike Arc, each hit, including each jump, rolls that crit, and jumps reach 88 instead of 80; Arc does not crit.', zh: '让会暴击的连锁在聚拢的敌人之间跳开。和穿钉不同，它去掉贯穿，改为连锁额外 2 名敌人，暴击从 15%、1.85 倍提高到 24%、2 倍。和弧雷不同，每一次命中（包括每一次跳跃）都单独判定这次暴击，跳跃距离是 88 而不是 80；弧雷本身不会暴击。' },
    { damage: 13, interval: 0.86, range: 265, projectileSpeed: 520, chain: 2, chainRange: 88, critChance: 0.24, critMultiplier: 2, mechanics: ['chain', 'crit'] }),
  recipe('venomspine', ['bolt', 'poison'],
    { en: 'Venomspine', zh: '毒脊' },
    { en: 'Thread a poisoning line through a packed file. Unlike Rivet, it drops the crit, pierces 2 extra enemies instead of 1, and each hit adds one poison stack. Unlike the poison tower Blight, the poison is not single-target, but each stack deals 2 damage per second instead of 2.4, still for 4s and up to 3 stacks.', zh: '用一条毒线贯穿挤在一起的一列敌人。和穿钉不同，它去掉暴击，额外贯穿 2 名敌人而不是 1 名，每次命中叠加一层毒素。和瘴毒不同，毒素不再只打单体，但每层每秒伤害是 2 而不是 2.4，持续时间仍是 4 秒，最多 3 层。' },
    { damage: 9, interval: 0.68, range: 250, projectileSpeed: 460, pierce: 2, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['pierce', 'poison'] }),
  recipe('watchpost', ['bolt', 'support'],
    { en: 'Watchpost', zh: '哨卫' },
    { en: 'Pick off a distant target with a crit while the aura buffs nearby towers. Unlike Rivet, it drops pierce, extends range from 260 to 275, raises crit from 15% at 1.85× to 28% at 2×, and grants nearby defenders an aura. Unlike Banner, that aura reaches 130 instead of 116 but gives only +10% damage and +6% haste, not +12% damage and +8% haste, and the shot can crit.', zh: '用暴击点掉远处的目标，同时以光环抬高附近的塔。和穿钉不同，它去掉贯穿，射程从 260 增至 275，暴击从 15%、1.85 倍提高到 28%、2 倍，并给附近防守单位加上光环。和旌旗不同，这道光环范围是 130 而不是 116，但只提供 10% 伤害和 6% 急速，而不是 12% 伤害和 8% 急速，而且射击可以暴击。' },
    { damage: 11, interval: 0.78, range: 275, projectileSpeed: 470, critChance: 0.28, critMultiplier: 2, aura: { range: 130, damage: 0.1, haste: 0.06 }, mechanics: ['aura', 'crit'] }),
  recipe('scald', ['fire', 'frost'],
    { en: 'Scald', zh: '蒸灼' },
    { en: 'Drop a burning, slowing splash on a packed cluster. Unlike Cinder, the splash grows from 36 to 46 and every enemy in it is also slowed to 50% speed; the burn stays 4 damage per second for 2.6s. Unlike Rime, the slow is no longer one target at 64% speed: the whole splash shares a stronger 50% slow for the same 2.2s and also burns.', zh: '向挤成一团的敌人泼下一片燃烧并减速的溅射。和烬火不同，溅射从 36 扩大到 46，范围内的每个敌人还会被减速到 50% 移速；燃烧仍是每秒 4 点、持续 2.6 秒。和霜结不同，减速不再是 64% 移速的单体：整片溅射共享更强的 50% 减速，持续时间同为 2.2 秒，并同时燃烧。' },
    { damage: 8, interval: 1.2, range: 240, projectileSpeed: 300, splash: 46, burn: { dps: 4, duration: 2.6 }, slow: { factor: 0.5, duration: 2.2 }, mechanics: ['splash', 'burn', 'slow'] }),
  recipe('wildfire', ['fire', 'lightning'],
    { en: 'Wildfire', zh: '野火' },
    { en: 'Burst a burning splash, then let that flame jump to a neighbor. Unlike Cinder, the splash grows from 36 to 40, the burn rises from 4 damage per second for 2.6s to 6 for 2.8s, and the hit also jumps once. Unlike Arc, it chains to only 1 extra enemy within 78 instead of 2 within 80, but both the splash and that jump burn.', zh: '炸开一片燃烧溅射，再让火焰跳到旁边的敌人。和烬火不同，溅射从 36 扩大到 40，燃烧从每秒 4 点、持续 2.6 秒提高到每秒 6 点、持续 2.8 秒，并且命中后再跳跃一次。和弧雷不同，它只连锁 1 名额外敌人、距离 78，而不是 2 名、距离 80，但溅射和这一跳都会燃烧。' },
    { damage: 10, interval: 1.15, range: 245, projectileSpeed: 340, splash: 40, chain: 1, chainRange: 78, burn: { dps: 6, duration: 2.8 }, mechanics: ['splash', 'chain', 'burn'] }),
  recipe('blight', ['fire', 'poison'],
    { en: 'Blight', zh: '疫焚' },
    { en: 'Wash a crowd in a burning splash that also stacks poison. Unlike Cinder, the splash grows from 36 to 50 and also stacks poison, while the burn falls from 4 damage per second for 2.6s to 3 for 3s and the hit drops from 8 to 6. Unlike the poison tower Blight, poison is no longer single-target: everyone in the splash takes 2 damage per second for 4.5s instead of 2.4 for 4s, still up to 3 stacks, and they burn as well.', zh: '用会叠加毒素的燃烧溅射洗过一群敌人。和烬火不同，溅射从 36 扩大到 50，并会叠加毒素；燃烧从每秒 4 点、持续 2.6 秒降为每秒 3 点、持续 3 秒，直接伤害从 8 降到 6。和瘴毒不同，毒素不再是单体：溅射内的每个敌人受到每秒 2 点毒素、持续 4.5 秒，而不是每秒 2.4 点、持续 4 秒，层数仍最多 3 层，并且同时燃烧。' },
    { damage: 6, interval: 1.28, range: 240, projectileSpeed: 280, splash: 50, burn: { dps: 3, duration: 3 }, poison: { dps: 2, duration: 4.5, maxStacks: 3 }, mechanics: ['splash', 'burn', 'poison'] }),
  recipe('pyre', ['fire', 'support'],
    { en: 'Pyre', zh: '烽坛' },
    { en: 'Plant a burning splash that also buffs the defenders around it. Unlike Cinder, the splash grows from 36 to 38 and the burn rises from 4 damage per second for 2.6s to 5 for 3s, and it adds an aura that buffs defenders and does not hurt enemies. Unlike Banner, that aura reaches 140 instead of 116 and gives +15% damage but only +4% haste, not +12% damage and +8% haste, and the attack is a burning splash instead of a single light bolt.', zh: '立下一片燃烧溅射，并让周围的防守者一起变强。和烬火不同，溅射从 36 扩大到 38，燃烧从每秒 4 点、持续 2.6 秒提高到每秒 5 点、持续 3 秒，并加上只强化防守单位、不伤害敌人的光环。和旌旗不同，光环范围是 140 而不是 116，提供 15% 伤害但只有 4% 急速，而不是 12% 伤害和 8% 急速，攻击也从单体轻射变成燃烧溅射。' },
    { damage: 8, interval: 1.25, range: 240, projectileSpeed: 290, splash: 38, burn: { dps: 5, duration: 3 }, aura: { range: 140, damage: 0.15, haste: 0.04 }, mechanics: ['aura', 'splash', 'burn'] }),
  recipe('shatter', ['frost', 'lightning'],
    { en: 'Shatter', zh: '霜裂' },
    { en: 'Crack a slowing chain that can crit across a spread crowd. Unlike Rime, the slow is no longer single-target: it chains to 3 extra enemies, slows each to 60% speed for 1.8s instead of 64% for 2.2s, and can crit at 20% for 2.1×. Unlike Arc, the chain grows from 2 jumps within 80 to 3 within 96, and each jump slows and can crit; Arc does neither.', zh: '劈开一条会减速也会暴击的连锁，打过散开的人群。和霜结不同，减速不再是单体：它连锁额外 3 名敌人，每人移速变为 60%、持续 1.8 秒，而不是 64%、持续 2.2 秒，并有 20% 几率造成 2.1 倍暴击。和弧雷不同，连锁从 80 距离内的 2 跳增至 96 距离内的 3 跳，每一跳都会减速并可能暴击；弧雷两者都没有。' },
    { damage: 11, interval: 1.05, range: 260, projectileSpeed: 500, chain: 3, chainRange: 96, critChance: 0.2, critMultiplier: 2.1, slow: { factor: 0.6, duration: 1.8 }, mechanics: ['chain', 'slow', 'crit'] }),
  recipe('miasma', ['frost', 'poison'],
    { en: 'Miasma', zh: '瘴雾' },
    { en: 'Lay a slowing, poisoning splash over a chokepoint. Unlike Rime, the slow is a splash of 62 rather than one enemy, holding targets at 58% speed for 2.8s instead of 64% for 2.2s, and it also stacks poison. Unlike the poison tower Blight, that poison spreads through the cloud at 2 damage per second instead of 2.4 on one target, for the same 4s and 3 stacks, and everyone inside is slowed.', zh: '在隘口铺下一片减速并中毒的溅射。和霜结不同，减速变成半径 62 的溅射，而不是只打一名敌人，移速变为 58%、持续 2.8 秒，而不是 64%、持续 2.2 秒，并且会叠加毒素。和瘴毒不同，毒素随这片云雾扩散，每秒 2 点而不是单体的每秒 2.4 点，持续时间仍是 4 秒、最多 3 层，云内每个敌人都会被减速。' },
    { damage: 5, interval: 1.32, range: 240, projectileSpeed: 250, splash: 62, slow: { factor: 0.58, duration: 2.8 }, poison: { dps: 2, duration: 4, maxStacks: 3 }, mechanics: ['splash', 'slow', 'poison'] }),
  recipe('glacierward', ['frost', 'support'],
    { en: 'Glacierward', zh: '霜垣' },
    { en: 'Pin one runner with a hard slow while the aura hastes nearby towers. Unlike Rime, it stays a single-target shot but slows to 48% speed for 2.5s instead of 64% for 2.2s, and it adds an aura for nearby defenders. Unlike Banner, that aura reaches 150 instead of 116 and gives +12% haste but only +8% damage, not +8% haste and +12% damage, and the shot slows instead of firing a plain bolt.', zh: '用强减速钉住一个前冲的敌人，同时以光环加快附近的塔。和霜结不同，它仍是单体射击，但减速变为 48% 移速、持续 2.5 秒，而不是 64%、持续 2.2 秒，并为附近防守单位提供光环。和旌旗不同，光环范围是 150 而不是 116，提供 12% 急速但只有 8% 伤害，而不是 8% 急速和 12% 伤害，射击会减速，而不是普通轻射。' },
    { damage: 7, interval: 1.12, range: 245, projectileSpeed: 320, slow: { factor: 0.48, duration: 2.5 }, aura: { range: 150, damage: 0.08, haste: 0.12 }, mechanics: ['aura', 'slow'] }),
  recipe('catalyst', ['lightning', 'poison'],
    { en: 'Catalyst', zh: '触媒' },
    { en: 'Leap a poisoning chain through enemies that have spread out. Unlike Arc, each of the 2 chain jumps also poisons, and jumps reach 100 instead of 80, while the hit falls from 10 to 8. Unlike the poison tower Blight, poison is not single-target: every jumped enemy gains a stack at 2 damage per second for 3.6s instead of 2.4 for 4s, still up to 3 stacks.', zh: '让中毒的连锁在已经散开的敌人之间跳跃。和弧雷不同，2 次连锁跳跃都会使目标中毒，跳跃距离是 100 而不是 80，直接伤害从 10 降到 8。和瘴毒不同，毒素不再是单体：每个被跳到的敌人获得一层每秒 2 点、持续 3.6 秒的毒素，而不是每秒 2.4 点、持续 4 秒，层数仍最多 3 层。' },
    { damage: 8, interval: 1.02, range: 250, projectileSpeed: 490, chain: 2, chainRange: 100, poison: { dps: 2, duration: 3.6, maxStacks: 3 }, mechanics: ['chain', 'poison'] }),
  recipe('relay', ['lightning', 'support'],
    { en: 'Relay', zh: '继电' },
    { en: 'Arc a chain across the fight while the aura hastes nearby towers. Unlike Arc, it keeps a chain of 2 but each jump reaches 84 instead of 80, and it adds an aura, while its own hit falls from 10 to 9. Unlike Banner, that aura reaches 145 instead of 116 and gives +16% haste but only +5% damage, not +8% haste and +12% damage, and the attack chains instead of a single light bolt.', zh: '让连锁横扫战场，同时以光环加快附近的塔。和弧雷不同，它保留 2 次连锁，但每次跳跃距离是 84 而不是 80，并加上光环；自身直接伤害从 10 降到 9。和旌旗不同，光环范围是 145 而不是 116，提供 16% 急速但只有 5% 伤害，而不是 8% 急速和 12% 伤害，攻击会连锁，而不是单体轻射。' },
    { damage: 9, interval: 0.98, range: 245, projectileSpeed: 470, chain: 2, chainRange: 84, aura: { range: 145, damage: 0.05, haste: 0.16 }, mechanics: ['aura', 'chain'] }),
  recipe('cultivator', ['poison', 'support'],
    { en: 'Cultivator', zh: '培育' },
    { en: 'Stack a deep poison on one tough enemy while the aura lifts neighbors. Unlike the poison tower Blight, each poison stack deals 3 damage per second for 5s and can reach 4 stacks, instead of 2.4 for 4s and 3 stacks, and nearby defenders gain an aura. Unlike Banner, that aura reaches 128 instead of 116, keeps +12% damage, and cuts haste from +8% to +5%, while the shot stacks that deeper poison instead of a plain bolt. It still has no splash and no pierce.', zh: '把深层毒素叠在一个厚血敌人身上，同时以光环抬高邻近的塔。和瘴毒不同，每层毒素每秒造成 3 点伤害、持续 5 秒、最多 4 层，而不是每秒 2.4 点、持续 4 秒、最多 3 层，附近防守单位还会获得光环。和旌旗不同，光环范围是 128 而不是 116，伤害加成仍是 12%，急速则从 8% 降到 5%，射击会叠加这种更深的毒素，而不是普通轻射。它仍然没有溅射，也没有贯穿。' },
    { damage: 5, interval: 1.08, range: 240, projectileSpeed: 310, poison: { dps: 3, duration: 5, maxStacks: 4 }, aura: { range: 128, damage: 0.12, haste: 0.05 }, mechanics: ['aura', 'poison'] }),
];

function isBilingual(value) {
  return !!value && typeof value.en === 'string' && value.en.trim() !== '' && typeof value.zh === 'string' && value.zh.trim() !== '' && value.en !== value.zh;
}

function signature(mechanics) {
  return [...mechanics].sort().join('+');
}

function validateRecipes(list) {
  const errors = [];
  const ids = new Set();
  const pairs = new Set();
  const signatures = new Set();
  if (!Array.isArray(list) || list.length < 8) errors.push('at least 8 recipes are required');
  for (const entry of list) {
    const label = entry?.id || '(missing id)';
    if (!/^[a-z][a-z0-9]*$/.test(entry?.id || '') || BASE_TYPES.includes(entry.id) || entry.id === 'hero') errors.push(`${label}: bad id`);
    if (ids.has(entry.id)) errors.push(`${label}: duplicate id`);
    ids.add(entry.id);
    if (!Array.isArray(entry.parents) || entry.parents.length !== 2) errors.push(`${label}: parents must be a pair`);
    else {
      const [a, b] = entry.parents;
      const ia = BASE_TYPES.indexOf(a);
      const ib = BASE_TYPES.indexOf(b);
      if (ia < 0 || ib < 0 || ia === ib) errors.push(`${label}: parents must be two different base types`);
      else if (ia > ib) errors.push(`${label}: parents must be stored in BASE_TYPES order`);
      else {
        const key = `${a}+${b}`;
        if (pairs.has(key)) errors.push(`${label}: duplicate pair ${key}`);
        pairs.add(key);
      }
    }
    if (!isBilingual(entry.name) || !isBilingual(entry.description)) errors.push(`${label}: bilingual name and description are required`);
    const stats = entry.stats || {};
    for (const key of Object.keys(stats)) {
      if (!STAT_KEYS.includes(key)) errors.push(`${label}: unexpected stat ${key}`);
    }
    for (const [effect, keys] of Object.entries(EFFECT_KEYS)) {
      if (!stats[effect]) continue;
      for (const key of Object.keys(stats[effect])) {
        if (!keys.includes(key)) errors.push(`${label}: unexpected ${effect}.${key}`);
      }
    }
    const finite = [
      ['damage', stats.damage, 4, 18],
      ['interval', stats.interval, 0.45, 1.6],
      ['range', stats.range, 230, 300],
      ['critChance', stats.critChance, 0, 0.35],
      ['critMultiplier', stats.critMultiplier, 1.5, 2.5],
      ['projectileSpeed', stats.projectileSpeed, 200, 600],
      ['splash', stats.splash, 0, 70],
      ['chain', stats.chain, 0, 4],
      ['chainRange', stats.chainRange, 70, 120],
      ['pierce', stats.pierce, 0, 3],
    ];
    for (const [name, value, min, max] of finite) {
      if (!Number.isFinite(value) || value < min || value > max) errors.push(`${label}: ${name} out of range`);
    }
    if (stats.burn && (!Number.isFinite(stats.burn.dps) || stats.burn.dps <= 0 || stats.burn.dps > 12 || !Number.isFinite(stats.burn.duration) || stats.burn.duration <= 0 || stats.burn.duration > 6)) errors.push(`${label}: burn invalid`);
    if (stats.slow && (!Number.isFinite(stats.slow.factor) || stats.slow.factor < 0.4 || stats.slow.factor >= 1 || !Number.isFinite(stats.slow.duration) || stats.slow.duration <= 0)) errors.push(`${label}: slow invalid`);
    if (stats.poison && (!Number.isFinite(stats.poison.dps) || stats.poison.dps <= 0 || stats.poison.dps > 8 || !Number.isFinite(stats.poison.duration) || stats.poison.duration <= 0 || stats.poison.duration > 8 || !Number.isInteger(stats.poison.maxStacks) || stats.poison.maxStacks < 2 || stats.poison.maxStacks > 6)) errors.push(`${label}: poison invalid`);
    if (stats.aura && (!Number.isFinite(stats.aura.range) || stats.aura.range < 100 || stats.aura.range > 170 || !Number.isFinite(stats.aura.damage) || !Number.isFinite(stats.aura.haste) || stats.aura.damage < 0 || stats.aura.haste < 0 || (stats.aura.damage <= 0 && stats.aura.haste <= 0))) errors.push(`${label}: aura invalid`);
    if (!Array.isArray(stats.mechanics) || stats.mechanics.length < 2 || new Set(stats.mechanics).size !== stats.mechanics.length) errors.push(`${label}: mechanics must be at least two unique names`);
    for (const name of stats.mechanics || []) {
      if (!MECHANICS.includes(name)) errors.push(`${label}: unimplemented mechanic ${name}`);
    }
    const present = {
      pierce: stats.pierce >= 1,
      chain: stats.chain >= 1,
      splash: stats.splash > 0,
      burn: !!stats.burn,
      slow: !!stats.slow,
      poison: !!stats.poison,
      aura: !!stats.aura,
      crit: stats.critChance > 0,
    };
    for (const name of MECHANICS) {
      const listed = !!stats.mechanics?.includes(name);
      if (present[name] !== listed) errors.push(`${label}: mechanics/${name} does not match fields`);
    }
    const sig = signature(stats.mechanics || []);
    if (signatures.has(sig)) errors.push(`${label}: mechanic signature ${sig} is not unique`);
    signatures.add(sig);
  }
  if (errors.length) throw new Error(`Recipe catalog invalid:\n- ${errors.join('\n- ')}`);
  return list;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const RECIPES = deepFreeze(validateRecipes(RAW_RECIPES));
__ff_exports["RECIPES"] = RECIPES;


const BY_ID = new Map(RECIPES.map((entry) => [entry.id, entry]));
const BY_PAIR = new Map(RECIPES.map((entry) => [`${entry.parents[0]}+${entry.parents[1]}`, entry]));

function getRecipe(id) {
  return BY_ID.get(id) ?? null;
}

function isRecipeId(type) {
  return typeof type === 'string' && BY_ID.has(type);
}

function canonicalKey(typeA, typeB) {
  const left = BASE_TYPES.indexOf(typeA);
  const right = BASE_TYPES.indexOf(typeB);
  if (left < 0 || right < 0 || left === right) return null;
  return left < right ? `${typeA}+${typeB}` : `${typeB}+${typeA}`;
}

// Order does not matter. Same type and unknown types return null.
function findRecipe(typeA, typeB) {
  const key = canonicalKey(typeA, typeB);
  return key ? BY_PAIR.get(key) ?? null : null;
}

function normalizeRank(rank) {
  const value = Number.isFinite(rank) ? Math.round(rank) : HYBRID_RANK_MIN;
  return clamp(value, HYBRID_RANK_MIN, HYBRID_RANK_MAX);
}

function rankDamageMultiplier(rank) {
  return 2 ** (normalizeRank(rank) - 1);
}

function roundStat(value) {
  return Math.round(value * 10000) / 10000;
}

// Rank-scaled copy. Does not mutate the catalog. Rank 1 reproduces the recipe numbers.
function scaleHybridStats(stats, rank) {
  const source = stats || {};
  const steps = normalizeRank(rank) - 1;
  const damageMul = 2 ** steps;
  const rate = 1 + 0.12 * steps;
  const scaled = {
    damage: roundStat((Number.isFinite(source.damage) ? source.damage : 0) * damageMul),
    interval: roundStat(Math.max(0.28, (Number.isFinite(source.interval) ? source.interval : 1) / rate)),
    range: roundStat(Math.min(320, (Number.isFinite(source.range) ? source.range : 0) + 8 * steps)),
    critChance: roundStat(Math.min(0.5, (Number.isFinite(source.critChance) ? source.critChance : 0) + 0.02 * steps)),
    critMultiplier: roundStat(Math.min(2.75, (Number.isFinite(source.critMultiplier) ? source.critMultiplier : 1.75) + 0.05 * steps)),
    projectileSpeed: roundStat(Math.min(760, (Number.isFinite(source.projectileSpeed) ? source.projectileSpeed : 300) + 24 * steps)),
    splash: roundStat((Number.isFinite(source.splash) ? source.splash : 0) + (source.splash > 0 ? 6 * steps : 0)),
    chain: Math.min(6, (Number.isFinite(source.chain) ? source.chain : 0) + (source.chain > 0 ? Math.floor(steps / 2) : 0)),
    chainRange: roundStat((Number.isFinite(source.chainRange) ? source.chainRange : 70) + (source.chain > 0 ? 8 * steps : 0)),
    pierce: Math.min(5, (Number.isFinite(source.pierce) ? source.pierce : 0) + (source.pierce > 0 && steps >= 3 ? 1 : 0)),
    mechanics: Array.isArray(source.mechanics) ? [...source.mechanics] : [],
  };
  if (source.burn) scaled.burn = { dps: roundStat(source.burn.dps * damageMul), duration: roundStat(source.burn.duration + 0.4 * steps) };
  if (source.slow) scaled.slow = { factor: roundStat(Math.max(0.35, source.slow.factor - 0.04 * steps)), duration: roundStat(source.slow.duration + 0.4 * steps) };
  if (source.poison) scaled.poison = { dps: roundStat(source.poison.dps * damageMul), duration: roundStat(source.poison.duration + 0.4 * steps), maxStacks: source.poison.maxStacks };
  if (source.aura) {
    scaled.aura = {
      range: roundStat(source.aura.range + 10 * steps),
      damage: roundStat(Math.min(0.4, source.aura.damage + 0.03 * steps)),
      haste: roundStat(Math.min(0.3, source.aura.haste + 0.025 * steps)),
    };
  }
  return scaled;
}

// Null when the type is not a recipe. Profile bonuses stay in getUnitStats.
function getHybridStats(unit) {
  const entry = getRecipe(unit?.type);
  if (!entry) return null;
  return scaleHybridStats(entry.stats, unit.rank);
}

};
__ff_factories["src/data/towers.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["getUnitStats"] = getUnitStats;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/recipes.js");
const __ff_m2 = __ff_load("src/systems/hero.js");
const BASE_TYPES = __ff_m0["BASE_TYPES"];
const RECIPES = __ff_m1["RECIPES"];
const getHeroStats = __ff_m2["getHeroStats"];
/**
 * Base tower catalog. Keys match BASE_TYPES in src/shared.js.
 *
 * TOWERS[*].stats and RECIPES[*].stats are rank-1 baselines. getUnitStats copies
 * them and applies RANK_SCALE for ranks 1–4. It does not mutate the catalog,
 * the recipe, the unit, or the run, and it never rolls RNG or spends ids.
 *
 * Hero units delegate to getHeroStats. Equipment and permanent bonuses stay
 * inside that function; applying them here would count them twice.
 *
 * Attack range is logical pixels from the defender slot center to an enemy
 * center. Rear centers are y=592 and the fence is y=450, so the back row is
 * 142px from the fence. Every base range clears that gap and still covers at
 * least a neighboring column along the fence. Towers and hybrids never come
 * back below MIN_USEFUL_RANGE. Aura range does not use that floor.
 *
 * chain and pierce count extra targets after the primary, so the default 0
 * means a single target. Splash damages other enemies within that radius of
 * the primary center and does not damage the primary a second time. A burn on
 * that shot is applied to those other enemies too.
 *
 * Combat should turn hits into applyStatus like this: burn power = dps, poison
 * power = dps per stack, slow power = remaining speed factor (0.64 keeps 64%
 * speed). Aura is not an enemy status. Sum aura.damage and aura.haste from
 * every banner whose aura range reaches the defender's slot center, including
 * the banner itself, then clamp to AURA_RULES. Shot damage is multiplied by
 * (1 + clamped damage). Shot interval is divided by (1 + clamped haste).
 * Every base tower fires on its interval, including support.
 * Unknown extra stat fields are copied through and are not rank-scaled.
 */




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
 * chain/pierce/splash/poison stacks only grow when the baseline already has them.
 */
const RANK_SCALE = Object.freeze({
  maxRank: 4,
  damage: Object.freeze([1, 2.05, 4.3, 9]),
  interval: Object.freeze([1, 0.94, 0.88, 0.82]),
  rangeAdd: Object.freeze([0, 8, 16, 26]),
  critAdd: Object.freeze([0, 0.015, 0.03, 0.05]),
  critMultiplierAdd: Object.freeze([0, 0.05, 0.1, 0.15]),
  projectileSpeedAdd: Object.freeze([0, 20, 40, 60]),
  splashAdd: Object.freeze([0, 6, 12, 18]),
  chainAdd: Object.freeze([0, 0, 1, 2]),
  chainRangeAdd: Object.freeze([0, 8, 14, 20]),
  pierceAdd: Object.freeze([0, 0, 0, 1]),
  effect: Object.freeze([1, 1.8, 3.2, 5.5]),
  duration: Object.freeze([1, 1.1, 1.2, 1.32]),
  slowFactorReduce: Object.freeze([0, 0.04, 0.08, 0.12]),
  poisonStacksAdd: Object.freeze([0, 0, 0, 1]),
  auraPower: Object.freeze([1, 1.18, 1.36, 1.54]),
  auraRangeAdd: Object.freeze([0, 8, 16, 24]),
  intervalFloor: 0.4,
  critChanceCap: 0.4,
  critMultiplierCap: 2.5,
  projectileSpeedCap: 680,
  splashCap: 84,
  chainCap: 4,
  chainRangeCap: 130,
  pierceCap: 3,
  durationCap: 8,
  slowFactorFloor: 0.42,
  poisonStacksCap: 5,
  auraRangeCap: 160
});
__ff_exports["RANK_SCALE"] = RANK_SCALE;


/** How UnitStats effect blocks map onto the shared status object. */
const STATUS_HOOKS = Object.freeze({
  burn: Object.freeze({type: 'burn', power: 'dps', remaining: 'duration'}),
  poison: Object.freeze({type: 'poison', power: 'dps per stack', remaining: 'duration', stacks: 'start at 1 and cap at maxStacks'}),
  slow: Object.freeze({type: 'slow', power: 'remaining speed factor, not a percentage reduction', remaining: 'duration'})
});
__ff_exports["STATUS_HOOKS"] = STATUS_HOOKS;


const CORE_FIELDS = ['damage', 'interval', 'range', 'critChance', 'critMultiplier', 'projectileSpeed', 'splash', 'chain', 'chainRange', 'pierce'];

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
    mechanics: Array.isArray(src.mechanics) ? src.mechanics.filter(item => typeof item === 'string') : []
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

function findRecipe(type) {
  if (typeof type !== 'string' || !Array.isArray(RECIPES)) return null;
  for (const recipe of RECIPES) {
    if (recipe && recipe.id === type && recipe.stats && typeof recipe.stats === 'object') return recipe;
  }
  return null;
}

function finiteTree(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object') return true;
  return Object.values(value).every(item => finiteTree(item));
}

const boltStats = {
  damage: 11,
  interval: 0.7,
  range: 260,
  critChance: 0.15,
  critMultiplier: 1.85,
  projectileSpeed: 440,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 1,
  mechanics: ['projectile', 'crit', 'pierce']
};

const fireStats = {
  damage: 8,
  interval: 1.05,
  range: 240,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 250,
  splash: 36,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  burn: {dps: 4, duration: 2.6},
  mechanics: ['projectile', 'splash', 'burn']
};

const frostStats = {
  damage: 7,
  interval: 0.9,
  range: 255,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 300,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  slow: {factor: 0.64, duration: 2.2},
  mechanics: ['projectile', 'slow']
};

const lightningStats = {
  damage: 10,
  interval: 1.2,
  range: 275,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 560,
  splash: 0,
  chain: 2,
  chainRange: 80,
  pierce: 0,
  mechanics: ['projectile', 'chain']
};

const poisonStats = {
  damage: 4,
  interval: 0.8,
  range: 245,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 290,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  poison: {dps: 2.4, duration: 4, maxStacks: 3},
  mechanics: ['projectile', 'poison']
};

const supportStats = {
  damage: 5,
  interval: 1.1,
  range: 235,
  critChance: 0,
  critMultiplier: 1.75,
  projectileSpeed: 320,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  aura: {range: 116, damage: 0.12, haste: 0.08},
  mechanics: ['projectile', 'aura']
};

function percent(fraction) {
  return Math.round(fraction * 100);
}

const supportAuraMax = supportStats.aura.range + RANK_SCALE.auraRangeAdd[RANK_SCALE.maxRank - 1];
const supportReach = supportAuraMax < 144
  ? {
      en: 'At every rank the aura covers neighboring slots, diagonals included, and does not reach a slot two places away.',
      zh: '每一阶的光环都能覆盖相邻槽位（含对角），但到不了隔一个槽位。'
    }
  : {
      en: 'The aura is measured between slot centers and stays smaller than the attack range.',
      zh: '光环按槽位中心之间的距离计算，并且始终小于攻击射程。'
    };

const BASE_IDENTITY = Object.freeze({
  bolt: Object.freeze({
    role: Object.freeze({en: 'Projectile', zh: '投射'}),
    name: Object.freeze({en: 'Rivet', zh: '穿钉'})
  }),
  fire: Object.freeze({
    role: Object.freeze({en: 'Fire', zh: '火焰'}),
    name: Object.freeze({en: 'Cinder', zh: '烬火'})
  }),
  frost: Object.freeze({
    role: Object.freeze({en: 'Frost', zh: '冰霜'}),
    name: Object.freeze({en: 'Rime', zh: '霜结'})
  }),
  lightning: Object.freeze({
    role: Object.freeze({en: 'Lightning', zh: '闪电'}),
    name: Object.freeze({en: 'Arc', zh: '弧雷'})
  }),
  poison: Object.freeze({
    role: Object.freeze({en: 'Poison', zh: '毒素'}),
    name: Object.freeze({en: 'Blight', zh: '瘴毒'})
  }),
  support: Object.freeze({
    role: Object.freeze({en: 'Support', zh: '辅助'}),
    name: Object.freeze({en: 'Banner', zh: '旌旗'})
  })
});

function joinEnglish(clauses) {
  if (clauses.length <= 1) return clauses.join('');
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

// Follows the role sentence. Hybrid names and the other parent come from RECIPES.
function partnerSentence(type) {
  const rows = [];
  for (const recipe of RECIPES) {
    const parents = recipe?.parents;
    if (!Array.isArray(parents) || parents.length !== 2 || !parents.includes(type)) continue;
    const other = parents[0] === type ? parents[1] : parents[0];
    const partner = BASE_IDENTITY[other];
    if (!partner?.role?.en || !partner?.role?.zh || !partner?.name?.en || !partner?.name?.zh || !recipe.name?.en || !recipe.name?.zh) {
      throw new Error(`missing merge partner text for ${type}+${other}`);
    }
    rows.push({other, partner, hybrid: recipe.name});
  }
  rows.sort((a, b) => BASE_TYPES.indexOf(a.other) - BASE_TYPES.indexOf(b.other));
  if (rows.length !== BASE_TYPES.length - 1) throw new Error(`${type} must name a hybrid with every other base type`);
  const en = `${joinEnglish(rows.map((row, index) => {
    const label = `${row.partner.role.en} (${row.partner.name.en})`;
    const verb = index === 0 ? `Merged with ${label} it becomes` : `with ${label} it becomes`;
    return `${verb} ${row.hybrid.en}`;
  }))}.`;
  const zh = `${rows.map((row, index) => {
    const lead = index === 0 ? '它与' : '与';
    return `${lead}${row.partner.role.zh}（${row.partner.name.zh}）合成为${row.hybrid.zh}`;
  }).join('，')}。`;
  return {en, zh};
}

const boltPartners = partnerSentence('bolt');
const firePartners = partnerSentence('fire');
const frostPartners = partnerSentence('frost');
const lightningPartners = partnerSentence('lightning');
const poisonPartners = partnerSentence('poison');
const supportPartners = partnerSentence('support');

const TOWERS = Object.freeze({
  bolt: Object.freeze({
    id: 'bolt',
    role: BASE_IDENTITY.bolt.role,
    name: BASE_IDENTITY.bolt.name,
    description: Object.freeze({
      en: `Projectile shots pierce one extra enemy and can crit. ${boltPartners.en} Rank 1 deals ${boltStats.damage} damage every ${boltStats.interval}s. Attack range is ${boltStats.range}. It fires a fast rivet from its slot center at any enemy in that range. There are no lanes. It pierces ${boltStats.pierce} extra enemy and has a ${percent(boltStats.critChance)}% chance to crit for ${boltStats.critMultiplier}× damage. Ranks 2–4 raise damage, attack speed, crit, and range. Rank 4 pierces one more enemy. Rank never exceeds 4.`,
      zh: `投射会贯穿额外一名敌人，并且可以暴击。${boltPartners.zh}1 阶伤害 ${boltStats.damage}，攻击间隔 ${boltStats.interval} 秒，攻击射程 ${boltStats.range}。从槽位中心攻击该射程内的任意敌人，不按列锁定。可额外贯穿 ${boltStats.pierce} 名敌人，并有 ${percent(boltStats.critChance)}% 几率造成 ${boltStats.critMultiplier} 倍暴击。2 至 4 阶提高伤害、攻速、暴击和射程。4 阶再多贯穿 1 名敌人。阶数最高为 4。`
    }),
    stats: Object.freeze(boltStats)
  }),
  fire: Object.freeze({
    id: 'fire',
    role: BASE_IDENTITY.fire.role,
    name: BASE_IDENTITY.fire.name,
    description: Object.freeze({
      en: `Fire shots burn the target and splash that same hit onto nearby enemies. ${firePartners.en} Rank 1 deals ${fireStats.damage} damage every ${fireStats.interval}s. Attack range is ${fireStats.range}. The target burns for ${fireStats.burn.dps} damage per second for ${fireStats.burn.duration}s. Every other enemy within splash radius ${fireStats.splash} of the target takes that same hit and burn. The first target is not damaged twice. Higher ranks strengthen the burst, the burn, and the range, through rank 4.`,
      zh: `火焰会让目标燃烧，并把同样的一击溅射到附近敌人。${firePartners.zh}1 阶伤害 ${fireStats.damage}，攻击间隔 ${fireStats.interval} 秒，攻击射程 ${fireStats.range}。目标以每秒 ${fireStats.burn.dps} 点燃烧 ${fireStats.burn.duration} 秒。距离目标溅射半径 ${fireStats.splash} 以内的其他敌人受到相同的撞击和燃烧，第一个目标不会被结算两次。更高阶会加强爆炸、燃烧和射程，最高 4 阶。`
    }),
    stats: Object.freeze(fireStats)
  }),
  frost: Object.freeze({
    id: 'frost',
    role: BASE_IDENTITY.frost.role,
    name: BASE_IDENTITY.frost.name,
    description: Object.freeze({
      en: `Frost shots slow one enemy. ${frostPartners.en} Rank 1 deals ${frostStats.damage} damage every ${frostStats.interval}s. Attack range is ${frostStats.range}. The shot is single-target and slows that enemy to ${percent(frostStats.slow.factor)}% movement speed for ${frostStats.slow.duration}s. Slow is the speed the enemy keeps, not a percent subtracted. It does not splash or freeze. Higher ranks slow a little more, but remaining speed never drops below ${percent(RANK_SCALE.slowFactorFloor)}%.`,
      zh: `冰霜会减速单个敌人。${frostPartners.zh}1 阶伤害 ${frostStats.damage}，攻击间隔 ${frostStats.interval} 秒，攻击射程 ${frostStats.range}。这是单体射击，并在 ${frostStats.slow.duration} 秒内使该敌人的移速变为 ${percent(frostStats.slow.factor)}%。减速数值是敌人保留的移速，不是被减去的百分比。没有溅射，也不能冻结。更高阶会稍加强减速，但剩余移速不会低于 ${percent(RANK_SCALE.slowFactorFloor)}%。`
    }),
    stats: Object.freeze(frostStats)
  }),
  lightning: Object.freeze({
    id: 'lightning',
    role: BASE_IDENTITY.lightning.role,
    name: BASE_IDENTITY.lightning.name,
    description: Object.freeze({
      en: `Lightning chains to extra enemies and ignores columns. ${lightningPartners.en} Rank 1 deals ${lightningStats.damage} damage every ${lightningStats.interval}s. Attack range is ${lightningStats.range}, the longest of the base towers. It then jumps to ${lightningStats.chain} extra enemies. Each jump reaches at most ${lightningStats.chainRange} from the previous enemy. Ranks 3 and 4 each add one jump, up to ${RANK_SCALE.chainCap} extra targets.`,
      zh: `闪电会连锁到额外敌人，不按列限制。${lightningPartners.zh}1 阶伤害 ${lightningStats.damage}，攻击间隔 ${lightningStats.interval} 秒，攻击射程 ${lightningStats.range}，是基础塔里最长的。然后跳向另外 ${lightningStats.chain} 名敌人。每次跳跃最远离上一名敌人 ${lightningStats.chainRange}。3 阶和 4 阶各增加 1 次跳跃，额外目标最多 ${RANK_SCALE.chainCap} 个。`
    }),
    stats: Object.freeze(lightningStats)
  }),
  poison: Object.freeze({
    id: 'poison',
    role: BASE_IDENTITY.poison.role,
    name: BASE_IDENTITY.poison.name,
    description: Object.freeze({
      en: `Poison stacks on one tough enemy. ${poisonPartners.en} Rank 1 deals ${poisonStats.damage} damage every ${poisonStats.interval}s. Attack range is ${poisonStats.range}. Each hit adds one poison stack. Each stack deals ${poisonStats.poison.dps} damage per second for ${poisonStats.poison.duration}s, up to ${poisonStats.poison.maxStacks} stacks. Status rules refresh the timer and cap the stacks. Rank 4 adds one stack, and stacks never exceed ${RANK_SCALE.poisonStacksCap}.`,
      zh: `毒素会叠在单个厚血敌人身上。${poisonPartners.zh}1 阶直接伤害 ${poisonStats.damage}，攻击间隔 ${poisonStats.interval} 秒，攻击射程 ${poisonStats.range}。命中时叠加 1 层瘴毒。每层每秒造成 ${poisonStats.poison.dps} 点伤害，持续 ${poisonStats.poison.duration} 秒，最多 ${poisonStats.poison.maxStacks} 层。持续时间刷新和层数上限由状态系统处理。4 阶额外增加 1 层，层数绝不超过 ${RANK_SCALE.poisonStacksCap}。`
    }),
    stats: Object.freeze(poisonStats)
  }),
  support: Object.freeze({
    id: 'support',
    role: BASE_IDENTITY.support.role,
    name: BASE_IDENTITY.support.name,
    description: Object.freeze({
      en: `Support buffs nearby defenders, including itself, and this banner still fires. ${supportPartners.en} Rank 1 deals ${supportStats.damage} damage every ${supportStats.interval}s. Attack range is ${supportStats.range}. It shoots a light bolt at any enemy within that range of this slot's center, across columns, by the same rule as the other towers. The aura does not target enemies. Its range is separate (${supportStats.aura.range} at rank 1). Every defender whose slot center is inside that aura, including this banner, gains +${percent(supportStats.aura.damage)}% damage and +${percent(supportStats.aura.haste)}% haste. Bonuses from several banners add together. Combat caps the combined damage bonus at ${percent(AURA_RULES.damageCap)}% and the combined haste at ${percent(AURA_RULES.hasteCap)}%. Haste sets the attack interval to interval ÷ (1 + haste). ${supportReach.en} Rank never exceeds 4.`,
      zh: `辅助会强化附近的防御者（包括自身），同时这面旌旗仍然射击。${supportPartners.zh}1 阶伤害 ${supportStats.damage}，攻击间隔 ${supportStats.interval} 秒，攻击射程 ${supportStats.range}。射击规则与其他塔相同：攻击距离槽位中心该射程以内的任意敌人，可以跨列。光环不锁定敌人，范围单独计算（1 阶为 ${supportStats.aura.range}）。槽位中心落在光环内的防御者（包括这面旌旗）获得 ${percent(supportStats.aura.damage)}% 伤害和 ${percent(supportStats.aura.haste)}% 急速。多面旌旗的加成相加。战斗把合计伤害加成限制在 ${percent(AURA_RULES.damageCap)}%，合计急速限制在 ${percent(AURA_RULES.hasteCap)}%。急速把攻击间隔改为间隔 ÷ (1 + 急速)。${supportReach.zh}阶数最高为 4。`
    }),
    stats: Object.freeze(supportStats)
  })
});
__ff_exports["TOWERS"] = TOWERS;


function heroStats(unit, state) {
  const stats = getHeroStats(unit, state);
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('getHeroStats must return a stats object');
  return withDefaults(stats);
}

/**
 * Fresh UnitStats for a hero, base tower, or hybrid.
 * Hybrid lookup uses RECIPES[].id === unit.type. Same-type towers keep their base id.
 * Unknown tower ids return finite zero damage instead of throwing.
 * @param {{kind?:string,type?:string,rank?:number}|null|undefined} unit
 * @param {object} [state] Passed through to getHeroStats. Unused for towers.
 */
function getUnitStats(unit, state) {
  if (!unit || typeof unit !== 'object') return inertStats();
  if (unit.kind === 'hero' || unit.type === 'hero') return heroStats(unit, state);
  if (unit.kind === 'hybrid') {
    const recipe = findRecipe(unit.type);
    if (recipe) return scaleStats(recipe.stats, unit.rank);
    if (TOWERS[unit.type]) return scaleStats(TOWERS[unit.type].stats, unit.rank);
    return inertStats();
  }
  if (TOWERS[unit.type]) return scaleStats(TOWERS[unit.type].stats, unit.rank);
  const recipe = findRecipe(unit.type);
  if (recipe) return scaleStats(recipe.stats, unit.rank);
  return inertStats();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

deepFreeze(TOWERS);

function assertCatalog() {
  const ids = ['bolt', 'fire', 'frost', 'lightning', 'poison', 'support'];
  if (Object.keys(TOWERS).join(',') !== ids.join(',')) throw new Error('TOWERS keys must match BASE_TYPES');
  const before = JSON.stringify(TOWERS);
  const rearGap = 592 - 450;
  const diagonal = Math.hypot(72, 84);
  for (const id of ids) {
    const tower = TOWERS[id];
    if (!tower.name?.en || !tower.name?.zh || !tower.description?.en || !tower.description?.zh) throw new Error(`missing bilingual text: ${id}`);
    if (!tower.description.en.startsWith(tower.role.en) || !tower.description.zh.startsWith(tower.role.zh)) {
      throw new Error(`${id} blurb does not lead with its role`);
    }
    const enAfterRole = tower.description.en.slice(tower.description.en.indexOf('.') + 1);
    const zhAfterRole = tower.description.zh.slice(tower.description.zh.indexOf('。') + 1);
    for (const recipe of RECIPES) {
      const parents = recipe?.parents;
      if (!Array.isArray(parents) || !parents.includes(id)) continue;
      const other = parents[0] === id ? parents[1] : parents[0];
      const partner = BASE_IDENTITY[other];
      if (!enAfterRole.includes(recipe.name.en) || !enAfterRole.includes(partner.role.en) || !enAfterRole.includes(partner.name.en)) {
        throw new Error(`${id} blurb does not name hybrid ${recipe.id} in English`);
      }
      if (!zhAfterRole.includes(recipe.name.zh) || !zhAfterRole.includes(partner.role.zh) || !zhAfterRole.includes(partner.name.zh)) {
        throw new Error(`${id} blurb does not name hybrid ${recipe.id} in Chinese`);
      }
    }
    for (const field of ['damage', 'interval', 'range']) {
      const token = String(tower.stats[field]);
      if (!tower.description.en.includes(token) || !tower.description.zh.includes(token)) {
        throw new Error(`${id} blurb does not state ${field} ${token}`);
      }
    }
    if (!(tower.stats.range > rearGap)) throw new Error(`${id} cannot reach across the fence from the back row`);
    const reach = Math.sqrt(tower.stats.range * tower.stats.range - rearGap * rearGap);
    if (!(reach >= 72)) throw new Error(`${id} back-row range misses the neighboring column at the fence`);
    for (let rank = 1; rank <= 4; rank += 1) {
      const stats = scaleStats(tower.stats, rank);
      if (!finiteTree(stats)) throw new Error(`${id} rank ${rank} is not finite`);
      if (stats.range < MIN_USEFUL_RANGE || stats.interval < RANK_SCALE.intervalFloor) throw new Error(`${id} rank ${rank} broke a bound`);
      if (stats.mechanics === tower.stats.mechanics) throw new Error(`${id} leaked the catalog mechanics array`);
    }
    const low = scaleStats(tower.stats, 1);
    const high = scaleStats(tower.stats, 4);
    if (high.damage < low.damage || high.interval > low.interval || high.range < low.range) throw new Error(`${id} rank scaling reversed`);
    for (const field of CORE_FIELDS) {
      if (!Number.isFinite(low[field])) throw new Error(`${id} ${field}`);
    }
  }
  if (!(TOWERS.support.stats.aura.range > diagonal)) throw new Error('support aura misses a diagonal neighbor');
  if (!(supportAuraMax < 144)) throw new Error('support aura reaches two slots away, but the description says it does not');
  const unit = {kind: 'tower', type: 'bolt', rank: 2, cooldown: 1, kills: 0, upgrades: {}};
  const unitBefore = JSON.stringify(unit);
  const rolled = {rng: 99, nextId: 4};
  const shot = getUnitStats(unit, rolled);
  shot.damage = 0;
  shot.mechanics.push('mutated');
  if (JSON.stringify(unit) !== unitBefore) throw new Error('getUnitStats mutated the unit');
  if (JSON.stringify(TOWERS) !== before) throw new Error('getUnitStats mutated the catalog');
  if (rolled.rng !== 99 || rolled.nextId !== 4) throw new Error('getUnitStats advanced run counters');
}

assertCatalog();

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
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/systems/movement.js");
const __ff_m2 = __ff_load("src/systems/combat.js");
const __ff_m3 = __ff_load("src/systems/status.js");
const __ff_m4 = __ff_load("src/systems/waves.js");
const __ff_m5 = __ff_load("src/systems/drafts.js");
const __ff_m6 = __ff_load("src/systems/progression.js");
const __ff_m7 = __ff_load("src/state.js");
const STEP = __ff_m0["STEP"];
const clone = __ff_m0["clone"];
const emit = __ff_m0["emit"];
const updateMovement = __ff_m1["updateMovement"];
const damageEnemy = __ff_m2["damageEnemy"];
const killEnemy = __ff_m2["killEnemy"];
const updateCombat = __ff_m2["updateCombat"];
const updateStatuses = __ff_m3["updateStatuses"];
const updateWaves = __ff_m4["updateWaves"];
const updateDrafts = __ff_m5["updateDrafts"];
const getProfileBonuses = __ff_m6["getProfileBonuses"];
// Fixed-step integration. Speed changes how many STEP updates run per wall
// second; gameplay systems always receive STEP, never a scaled delta.








Object.defineProperty(__ff_exports, "createRun", {enumerable:true, configurable:true, get(){return __ff_load("src/state.js")["createRun"];}});
Object.defineProperty(__ff_exports, "createProfile", {enumerable:true, configurable:true, get(){return __ff_load("src/state.js")["createProfile"];}});

const ZERO_BONUSES = Object.freeze({damage:0, haste:0, range:0, critChance:0, fence:0, reward:0});

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
  for (const key of Object.keys(out)) {
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
  state.systems.integration = {bonuses:clean};
  if (clean.fence > 0 && state.fence && Number.isFinite(state.fence.maxHp) && Number.isFinite(state.fence.hp)) {
    state.fence.maxHp += clean.fence;
    state.fence.hp = Math.min(state.fence.maxHp, state.fence.hp + clean.fence);
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
    contract:1,
    present:{movement:true, combat:true, status:true, waves:true, drafts:true, progression:true},
    missing:[],
    failed:{},
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
  state.enemies = state.enemies.filter(enemy => enemy && enemy.dead !== true && typeof enemy.hp === 'number' && enemy.hp > 0);
  state.projectiles = state.projectiles.filter(projectile => projectile && !(typeof projectile.life === 'number' && projectile.life <= 0));
}

function resolveOutcome(state) {
  const hp = state.fence && state.fence.hp;
  if (state.phase === 'playing' && typeof hp === 'number' && hp <= 0) {
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time:state.time, wave:state.wave, kills:state.kills});
    return;
  }
  const alive = Array.isArray(state.enemies) && state.enemies.some(enemy => enemy && enemy.dead !== true && enemy.hp > 0);
  const queue = state.director?.queue;
  const queueEmpty = !Array.isArray(queue) || queue.length === 0;
  if (state.phase === 'playing' && state.endless !== true && state.director?.done === true && queueEmpty && !alive) {
    state.phase = 'victory';
    emit(state, 'victory', {time:state.time, wave:state.wave, kills:state.kills});
  }
}

function stepBody(state) {
  if (!Array.isArray(state.events)) state.events = [];
  if (state.phase === 'playing' && typeof state.fence?.hp === 'number' && state.fence.hp <= 0) {
    state.time += STEP;
    state.tick += 1;
    state.fence.hp = 0;
    state.phase = 'defeat';
    emit(state, 'defeat', {time:state.time, wave:state.wave, kills:state.kills});
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

function advance(state, realDt) {
  if (!state || !Number.isFinite(realDt) || realDt < 0) return state;
  prepare(state);
  if (halted(state)) {
    state.accumulator = 0;
    return state;
  }
  const speed = state.speed === 1.5 || state.speed === 3 ? state.speed : 1;
  state.accumulator += Math.min(realDt, 0.25) * speed;
  let count = 0;
  while (state.accumulator + 1e-10 >= STEP && count++ < 90) {
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
  if (state && [1, 1.5, 3].includes(speed)) state.speed = speed;
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
  // Brand and navigation
  ['title', 'Fencefall', '最后一道防线'],
  ['titleLockup', 'Fencefall · 最后一道防线', 'Fencefall · 最后一道防线'],
  ['subtitle', 'One fence. Ten slots. No lanes.', '一道栅栏，十个格子，没有分路。'],
  ['tagline', 'Plan, draft, and merge. The towers do the fighting.', '布阵、整备、合成。战斗交给防御塔。'],
  ['play', 'Play', '开始'],
  ['playHint', 'Start a new fight', '开始一场新的战斗'],
  ['continue', 'Continue', '继续'],
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
  ['newRun', 'New run', '新对局'],
  ['abandon', 'Abandon', '放弃'],
  ['loading', 'Loading', '加载中'],
  ['loadingGame', 'Raising the fence…', '正在架起栅栏…'],
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
  ['resume', 'Resume', '恢复'],
  ['paused', 'Paused', '已暂停'],
  ['pausedHidden', 'Paused while this page is hidden', '页面已隐藏，战斗暂停'],
  ['pausedHiddenBody', 'The fight is stopped. A pause you turned on stays on when you come back.', '战斗已停止。你打开的暂停在回到页面后仍然保留。'],
  ['planning', 'Planning', '布阵'],
  ['planningHint', 'Planning is open. The fight is frozen.', '正在布阵，战斗已冻结。'],
  ['playing', 'Fighting', '战斗中'],
  ['speed', 'Speed', '速度'],
  ['speed1', '1×', '1×'],
  ['speed15', '1.5×', '1.5×'],
  ['speed3', '3×', '3×'],
  ['speedValue', '{value}×', '{value}×'],
  ['speedHint', '1×, 1.5×, and 3× share the same fight clock.', '1×、1.5× 和 3× 共用同一个战斗时钟。'],
  ['speedWhilePaused', 'The new speed is used when the fight is moving.', '新的速度会在战斗继续推进时生效。'],
  ['fence', 'Fence', '栅栏'],
  ['fenceHp', 'Fence {current}/{max}', '栅栏 {current}/{max}'],
  ['fenceDanger', 'Fence is failing', '栅栏岌岌可危'],
  ['fenceSafe', 'Fence is holding', '栅栏仍然稳固'],
  ['wave', 'Wave', '波次'],
  ['waveNumber', 'Wave {wave}', '第 {wave} 波'],
  ['waveIncoming', 'Incoming', '即将到来'],
  ['bossWarning', 'Boss approaching', '首领接近'],
  ['finalWave', 'Final wave', '最后一波'],
  ['nextWave', 'Next wave', '下一波'],
  ['wavesSpawned', 'All waves have spawned', '各波敌人已出场'],
  ['wavesStarted', 'Waves started', '已开始波次'],
  ['clearRemaining', 'Defeat the enemies still on the field', '击败场上剩余的敌人'],
  ['xp', 'XP', '经验'],
  ['experience', 'Experience', '经验'],
  ['xpProgress', 'XP {current}/{next}', '经验 {current}/{next}'],
  ['nextDraft', 'Next draft', '下次整备'],
  ['draftLevel', 'Draft {level}', '第 {level} 次整备'],
  ['kills', 'Kills', '击杀'],
  ['killsValue', 'Kills {count}', '击杀 {count}'],
  ['kill', 'Kill', '击杀'],
  ['time', 'Time', '时间'],
  ['activeTime', 'Fight time', '战斗时间'],
  ['timeHint', 'This clock counts the fight only. Drafts and menus do not add time.', '这个时间只计算战斗。整备和菜单不计入。'],
  ['enemy', 'Enemy', '敌人'],
  ['enemies', 'Enemies', '敌人'],
  ['enemyCount', 'Enemies {count}', '敌人 {count}'],
  ['boss', 'Boss', '首领'],
  ['shot', 'Shot', '射击'],
  ['hit', 'Hit', '命中'],
  ['fence_hit', 'Fence hit', '栅栏受击'],
  ['ui', 'Notice', '提示'],

  // Difficulty
  ['difficulty', 'Difficulty', '难度'],
  ['easy', 'Easy', '轻松'],
  ['normal', 'Normal', '标准'],
  ['hard', 'Hard', '困难'],
  ['nightmare', 'Nightmare', '噩梦'],
  ['rewardMultiplier', 'Reward multiplier', '报酬倍率'],
  ['rewardMultiplierValue', '×{value}', '×{value}'],
  ['rewardLine', 'Reward ×{value}', '报酬 ×{value}'],
  ['timesValue', '×{value}', '×{value}'],
  ['percentValue', '{value}%', '{value}%'],
  ['higherDifficultyPays', 'Higher difficulties pay more.', '难度越高，报酬越多。'],
  ['difficultyHint', 'Harder fights pay a higher multiplier.', '战斗越难，报酬倍率越高。'],
  ['difficultyEasyHint', 'Softer enemies and a baseline reward.', '敌人更温和，报酬为基准。'],
  ['difficultyNormalHint', 'The intended fight, with a higher reward.', '预定难度，报酬更高。'],
  ['difficultyHardHint', 'Stronger enemies and a larger reward.', '敌人更强，报酬更大。'],
  ['difficultyNightmareHint', 'The hardest fight and the largest reward.', '最艰苦的战斗，报酬最高。'],
  ['startDifficulty', 'Play on {difficulty}', '以{difficulty}开始'],

  // Settings and language. 中 / EN are the persistent switch labels.
  ['settings', 'Settings', '设置'],
  ['language', 'Language', '语言'],
  ['languageZh', '中文', '中文'],
  ['languageEn', 'English', 'English'],
  ['langZh', '中', '中'],
  ['langEn', 'EN', 'EN'],
  ['languageCurrent', 'Language: {language}', '语言：{language}'],
  ['languageHint', 'You can change language during a run. Progress stays.', '对局中可以切换语言，进度会保留。'],
  ['sound', 'Sound', '声音'],
  ['soundOn', 'Sound on', '声音开'],
  ['soundOff', 'Sound off', '声音关'],
  ['soundHint', 'Sound starts off. The first tap turns on audio for this browser.', '声音默认关闭。在此浏览器中第一次点按后才会打开音频。'],
  ['reducedMotion', 'Reduced motion', '减少动效'],
  ['reducedMotionOn', 'Reduced motion on', '减少动效：开'],
  ['reducedMotionOff', 'Reduced motion off', '减少动效：关'],
  ['reducedMotionHint', 'Cuts extra flashes, shakes, and motion.', '减少额外的闪光、震动和动态。'],

  // Draft, placement, movement
  ['draft', 'Draft', '整备'],
  ['draftTitle', 'Draft', '整备'],
  ['chooseOneOfThree', 'Choose one of three', '三选一'],
  ['draftOnField', 'Already on the field', '场上已有'],
  ['draftNewType', 'Not on the field yet', '场上还没有'],
  ['chooseUpgrade', 'Choose an upgrade', '选择升级'],
  ['chooseSlot', 'Choose a slot', '选择格子'],
  ['chooseTower', 'Add {name}', '加入{name}'],
  ['chooseHeroUpgrade', 'Hero: {name}', '英雄：{name}'],
  ['chooseReplace', 'Replace a tower with {name}', '用{name}替换一座塔'],
  ['immediateEffect', 'Takes effect now', '立即生效'],
  ['cancelPlacement', 'Cancel placement', '取消放置'],
  ['placementCanceled', 'Placement canceled. The three choices are unchanged.', '已取消放置，三个选项没有变化。'],
  ['placing', 'Placing', '放置中'],
  ['placingTitle', 'Place the tower', '放置防御塔'],
  ['placingHint', 'Empty slots are open. Replacing a tower needs confirmation. The hero cannot be replaced.', '空位可以直接放置。替换防御塔需要确认。英雄不能被替换。'],
  ['tapToPlace', 'Tap a slot to place', '点一个格子来放置'],
  ['tapToMove', 'Tap a destination slot', '点一个目标格子'],
  ['fullBoard', 'The board is full', '格子已满'],
  ['fullBoardHint', 'Upgrade the hero, or replace a tower.', '可以升级英雄，或替换一座塔。'],
  ['emptySlot', 'Empty slot', '空位'],
  ['select', 'Select', '选择'],
  ['details', 'Details', '详情'],
  ['hideDetails', 'Hide details', '收起详情'],
  ['selected', 'Selected', '已选中'],
  ['selectedUnit', 'Selected unit', '当前单位'],
  ['selectToInspect', 'Select a defender to see its stats', '选中防守者以查看能力'],
  ['noSelection', 'Nothing selected', '未选择'],
  ['clearSelection', 'Clear selection', '取消选择'],
  ['place', 'Place', '放置'],
  ['move', 'Move', '移动'],
  ['moveHere', 'Move here', '移到这里'],
  ['swap', 'Swap', '对调'],
  ['moved', 'Moved', '已移动'],
  ['swapped', 'Swapped', '已对调'],
  ['frontRow', 'Front row', '前排'],
  ['rearRow', 'Rear row', '后排'],
  ['slotNumber', 'Slot {index}', '格子 {index}'],
  ['sourceSlot', 'Source slot', '来源格子'],
  ['targetSlot', 'Target slot', '目标格子'],
  ['occupied', 'That slot is occupied', '这个格子已有单位'],
  ['slotOccupied', 'That slot is occupied', '这个格子已有单位'],
  ['tower', 'Tower', '防御塔'],
  ['towers', 'Towers', '防御塔'],
  ['hero', 'Hero', '英雄'],
  ['hybrid', 'Hybrid', '混合'],
  ['hero_upgrade', 'Hero upgrade', '英雄升级'],
  ['heroUpgrades', 'Hero upgrades', '英雄升级'],
  ['runUpgrades', 'This run', '本局强化'],
  ['nonMergeable', 'Cannot merge', '不可合成'],
  ['autoAttack', 'Attacks on its own', '自动攻击'],
  ['noActiveAbility', 'No active skill', '没有主动技能'],
  ['notControlled', 'Not controlled by hand', '不能手动操纵'],
  ['replace', 'Replace', '替换'],
  ['replaceConfirm', 'Replace this tower?', '替换这座塔？'],
  ['replaceConfirmBody', 'The tower in this slot is removed. The hero cannot be replaced.', '此格的防御塔会被移除。英雄不能被替换。'],
  ['replaceKeep', 'Keep current tower', '保留现有的塔'],
  ['unknownUnit', 'Unknown unit', '未知单位'],
  ['unknownEnemy', 'Unknown enemy', '未知敌人'],

  // Merge
  ['merge', 'Merge', '合成'],
  ['mergePreview', 'Preview merge', '合成预览'],
  ['mergeConfirm', 'Confirm merge', '确认合成'],
  ['mergeCancel', 'Cancel merge', '取消合成'],
  ['mergeResult', 'Result', '结果'],
  ['heroProtected', 'The hero cannot be merged or replaced', '英雄不能合成，也不能被替换'],
  ['invalidMerge', 'These units cannot merge', '这些单位无法合成'],
  ['sameTypeResult', 'Same type, rank {rank}', '同种，{rank} 阶'],
  ['hybridResult', 'Hybrid: {name}', '混合：{name}'],
  ['ingredientPair', '{left} + {right}', '{left} + {right}'],
  ['resultRank', 'Result rank {rank}', '结果 {rank} 阶'],
  ['previewSafe', 'Preview only. The board has not changed.', '只是预览，棋盘还没有变化。'],
  ['confirmToMerge', 'Confirm to merge. Cancel keeps both units.', '确认后才会合成。取消则双方都保留。'],
  ['unitsPreserved', 'Both units were kept', '双方单位都已保留'],
  ['consumesSource', 'The first unit is consumed', '第一座单位会被消耗'],
  ['recipes', 'Recipes', '配方'],
  ['ingredients', 'Ingredients', '材料'],
  ['effect', 'Effect', '效果'],
  ['baseTowers', 'Base towers', '基础塔'],
  ['hybrids', 'Hybrids', '混合塔'],
  ['rank', 'Rank', '阶'],
  ['rankValue', 'Rank {rank}', '{rank} 阶'],
  ['rankCap', 'Ranks run from 1 to 4', '阶数从 1 到 4'],
  ['equalRank', 'Requires equal rank', '需要相同阶数'],
  ['maxRank', 'Already at max rank', '已经达到最高阶'],
  ['notPlanning', 'Pause or open a draft before you move or merge', '请先暂停或进入整备，再移动或合成'],
  ['planningRequired', 'Pause or open a draft before you move or merge', '请先暂停或进入整备，再移动或合成'],
  ['cannotMoveDuringFight', 'You can move units during planning', '战斗进行时不能移动，请先布阵'],
  ['sameSlot', 'Choose two different slots', '请选择两个不同的格子'],
  ['invalidSlot', 'That slot is not on the board', '没有这个格子'],
  ['missingUnit', 'Choose two occupied slots', '请选择两个有单位的格子'],
  ['reasonEmpty', 'That slot is empty', '这个格子是空的'],
  ['emptySource', 'The first slot is empty', '第一个格子是空的'],
  ['emptyTarget', 'The second slot is empty', '第二个格子是空的'],
  ['rankMismatch', 'Both units must be the same rank', '两座单位必须同阶'],
  ['noRecipe', 'No recipe matches this pair', '没有符合这对组合的配方'],
  ['hybridMix', 'A hybrid merges only with the same hybrid', '混合单位只能与相同的混合单位合成'],
  ['hybridMismatch', 'A hybrid merges only with the same hybrid', '混合单位只能与相同的混合单位合成'],
  ['kindMismatch', 'These units cannot combine', '这些单位不能组合'],
  ['incompatible', 'This pair is not compatible', '这个组合不兼容'],
  ['heroSlot', 'The hero occupies this slot', '英雄在这个格子里'],
  ['replaceRequired', 'Confirm replacement to use an occupied slot', '要占用已有格子，需要确认替换'],
  ['invalidChoice', 'That choice is not available', '没有这个选项'],
  ['noDraft', 'There is no draft right now', '当前没有整备'],
  ['notPlacing', 'There is nothing to place', '当前没有要放置的单位'],
  ['noPending', 'There is nothing waiting to place', '没有等待放置的单位'],

  // Combat stats. Keys match UnitStats fields and status type ids where noted.
  ['damage', 'Damage', '伤害'],
  ['range', 'Range', '射程'],
  ['attackSpeed', 'Attack speed', '攻速'],
  ['crit', 'Crit', '暴击'],
  ['critChance', 'Crit chance', '暴击率'],
  ['critMultiplier', 'Crit multiplier', '暴击倍率'],
  ['interval', 'Interval', '间隔'],
  ['projectileSpeed', 'Projectile speed', '弹速'],
  ['splash', 'Splash', '溅射'],
  ['chain', 'Chain', '连锁'],
  ['chainRange', 'Chain range', '连锁范围'],
  ['pierce', 'Pierce', '穿透'],
  ['burn', 'Burn', '燃烧'],
  ['poison', 'Poison', '中毒'],
  ['slow', 'Slow', '减速'],
  ['stun', 'Stun', '眩晕'],
  ['brittle', 'Brittle', '易伤'],
  ['aura', 'Aura', '光环'],
  ['support', 'Support', '支援'],
  ['haste', 'Haste', '急速'],
  ['vitality', 'Fence HP', '栅栏生命'],
  ['status', 'Status', '状态'],
  ['statuses', 'Statuses', '状态'],
  ['duration', 'Duration', '持续'],
  ['stacks', 'Stacks', '层数'],
  ['dps', 'Damage per second', '每秒伤害'],
  ['factor', 'Speed factor', '速度系数'],
  ['mechanics', 'Mechanics', '机制'],
  ['statDamage', 'Damage {value}', '伤害 {value}'],
  ['statRange', 'Range {value}', '射程 {value}'],
  ['statInterval', 'Every {value}s', '每 {value} 秒'],
  ['statCrit', 'Crit {chance} ×{multiplier}', '暴击 {chance} ×{multiplier}'],
  ['statProjectile', 'Shot speed {value}', '弹速 {value}'],
  ['statSplash', 'Splash {value}', '溅射 {value}'],
  ['statChain', 'Chain {count}', '连锁 {count}'],
  ['statPierce', 'Pierce {count}', '穿透 {count}'],
  ['slowFactor', 'Moves at {value}', '移速变为 {value}'],
  ['auraDamage', 'Damage bonus', '伤害加成'],
  ['auraHaste', 'Attack speed bonus', '攻速加成'],
  ['auraRange', 'Aura range', '光环范围'],

  // Armory and permanent meta
  ['armory', 'Armory', '军械库'],
  ['codex', 'Codex', '图鉴'],
  ['currency', 'Currency', '货币'],
  ['currencyAmount', 'Currency {amount}', '货币 {amount}'],
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
  ['levelValue', 'Level {level}', '{level} 级'],
  ['levelOf', 'Level {level}/{max}', '{level} / {max} 级'],
  ['maxLevel', 'Max level', '已满级'],
  ['insufficientCurrency', 'Not enough currency', '货币不足'],
  ['locked', 'Locked', '未解锁'],
  ['weapon', 'Weapon', '武器'],
  ['charm', 'Charm', '护符'],
  ['armor', 'Armor', '护甲'],
  ['equipment', 'Equipment', '装备'],
  ['permanent', 'Permanent upgrades', '永久升级'],
  ['permanentUpgrades', 'Permanent upgrades', '永久升级'],
  ['headStart', 'Head start', '开局优势'],
  ['bonus', 'Bonus', '加成'],
  ['currentBonuses', 'Current bonuses', '当前加成'],
  ['bonusDamage', 'Damage +{value}', '伤害 +{value}'],
  ['bonusHaste', 'Attack speed +{value}', '攻速 +{value}'],
  ['bonusRange', 'Range +{value}', '射程 +{value}'],
  ['bonusCritChance', 'Crit chance +{value}', '暴击率 +{value}'],
  ['bonusFence', 'Fence +{value}', '栅栏 +{value}'],
  ['bonusReward', 'Rewards +{value}', '报酬 +{value}'],
  ['noneEquipped', 'Nothing equipped', '未装备'],
  ['unequip', 'Unequip', '卸下'],
  ['noEquipment', 'No equipment yet', '还没有装备'],
  ['noUpgrades', 'No permanent upgrades yet', '还没有永久升级'],
  ['notOwned', 'Not owned yet', '尚未拥有'],
  ['alreadyOwned', 'Already owned', '已经拥有'],
  ['alreadyEquipped', 'Already equipped', '已经装备'],
  ['wrongSlot', 'That item does not fit this slot', '这件物品不能装在这个位置'],
  ['unknownItem', 'Unknown item', '未知物品'],
  ['unknownUpgrade', 'Unknown upgrade', '未知升级'],
  ['profile', 'Profile', '档案'],
  ['best', 'Best runs', '最佳记录'],
  ['noBest', 'No settled runs yet', '还没有结算过的对局'],
  ['bestWave', 'Best wave', '最高波次'],
  ['bestKills', 'Best kills', '最高击杀'],
  ['bestLine', 'Best · wave {wave} · {kills} kills', '最佳 · 第 {wave} 波 · 击杀 {kills}'],
  ['runsSettled', 'Settled runs', '已结算局数'],
  ['newRecord', 'New record', '新纪录'],

  // Results
  ['results', 'Results', '结算'],
  ['victory', 'Victory', '胜利'],
  ['defeat', 'Defeat', '失败'],
  ['abandoned', 'Abandoned', '已放弃'],
  ['runComplete', 'Run complete', '本局结束'],
  ['resultSummary', '{result} · {difficulty}', '{result} · {difficulty}'],
  ['victoryBody', 'The fence held. The reward is saved once.', '栅栏守住了。报酬只保存一次。'],
  ['defeatBody', 'The fence fell. Progress can still pay once.', '栅栏倒下了。已有的进度仍会结算一次。'],
  ['abandonBody', 'You left this fight. That reward is saved once.', '你离开了这一局。这笔报酬只保存一次。'],
  ['earned', 'Earned', '获得'],
  ['earnedAmount', 'Earned {amount}', '获得 {amount}'],
  ['damageDealt', 'Damage dealt', '造成伤害'],
  ['mergesMade', 'Merges made', '合成次数'],
  ['critsLanded', 'Critical hits', '暴击次数'],
  ['fenceDamageTaken', 'Fence damage taken', '栅栏承受伤害'],
  ['noReward', 'No reward', '没有报酬'],
  ['freshAbandon', 'This run is too short to earn a reward', '本局太短，没有报酬'],
  ['alreadySettled', 'This run was already rewarded', '本局报酬已经发过'],
  ['notFinished', 'This run is not ready to settle', '本局还不能结算'],
  ['noDoublePay', 'Each run pays at most once.', '每局最多发放一次。'],
  ['rewardRule', 'Higher difficulties multiply this reward.', '更高难度会提高这笔报酬。'],
  ['playAgain', 'Play again', '再来一局'],
  ['returnMenu', 'Main menu', '主菜单'],
  ['endless', 'Endless', '无尽'],
  ['endlessOffer', 'Enter endless? The victory reward is already saved.', '进入无尽？胜利报酬已经保存。'],
  ['endlessEnter', 'Enter endless', '进入无尽'],
  ['endlessStay', 'Not now', '暂不进入'],
  ['endlessNote', 'Endless does not pay the main reward again.', '无尽不会再次发放主线报酬。'],

  // Save, import, confirmations
  ['exportSave', 'Export save', '导出存档'],
  ['importSave', 'Import save', '导入存档'],
  ['importError', 'That save could not be imported', '无法导入这份存档'],
  ['invalid_json', 'That text is not valid save data. The current save was kept.', '这段文字不是有效的存档。当前存档已保留。'],
  ['invalid_format', 'That file is not a Fencefall save. The current save was kept.', '这不是最后一道防线的存档。当前存档已保留。'],
  ['invalid_version', 'That save is from another version. The current save was kept.', '这份存档的版本不同。当前存档已保留。'],
  ['invalid_profile', 'The profile in that save is not valid. The current save was kept.', '存档里的档案无效。当前存档已保留。'],
  ['invalid_run', 'The battle in that save is not valid. The current save was kept.', '存档里的对局无效。当前存档已保留。'],
  ['invalid_bounds', 'That save has a number outside the allowed range. The current save was kept.', '存档里有超出允许范围的数字。当前存档已保留。'],
  ['invalid_enum', 'That save has an unknown setting. The current save was kept.', '存档里有无法识别的设置。当前存档已保留。'],
  ['invalid_hero', 'That save does not contain exactly one hero. The current save was kept.', '存档里不是恰好一名英雄。当前存档已保留。'],
  ['invalid_slots', 'That save does not have the ten defender slots. The current save was kept.', '存档里没有十个防守格。当前存档已保留。'],
  ['invalid_settlement', 'That save has an invalid result. The current save was kept.', '存档里的结算无效。当前存档已保留。'],
  ['storage_unavailable', 'Storage is not available. The current save was kept.', '无法使用本地存储。当前存档已保留。'],
  ['too_large', 'That save is too large. The current save was kept.', '这份存档太大。当前存档已保留。'],
  ['quota', 'Storage is full. The current save was kept.', '存储空间已满。当前存档已保留。'],
  ['importSuccess', 'Save imported', '存档已导入'],
  ['noSave', 'No saved run', '没有已保存的对局'],
  ['saveFailed', 'Could not save', '保存失败'],
  ['saveData', 'Save data', '存档数据'],
  ['pasteHere', 'Paste save data here', '在此粘贴存档数据'],
  ['exportHint', 'Copy this backup and store it somewhere safe.', '复制这份备份，并另行保管。'],
  ['importHint', 'Paste a backup exported from this game.', '粘贴从本游戏导出的备份。'],
  ['importEmpty', 'Paste save data first', '请先粘贴存档数据'],
  ['confirmImport', 'Importing replaces the profile and saved run on this device.', '导入会替换此设备上的档案和已保存对局。'],
  ['confirmRestart', 'Restart and clear this fight?', '重开并清除这场战斗？'],
  ['confirmNewRun', 'Start a new run and clear the saved fight?', '开始新对局，并清除已保存的战斗？'],
  ['abandonConfirm', 'Abandon this run?', '放弃本局？'],
  ['abandonDetail', 'Leaving before 30 seconds and 3 kills earns nothing. A finished victory or defeat pays once.', '不足 30 秒且击杀少于 3 就离开，没有报酬。胜利或失败结算后只发放一次。'],
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

  // How to play. Bodies are the help* keys; titles can reuse the short labels.
  ['howto', 'How to play', '怎么玩'],
  ['howtoLead', 'You decide what is built. The fight plays itself.', '建造由你决定，战斗自动进行。'],
  ['helpOverview', 'Enemies enter from the top and move toward one shared fence. You plan, draft, and merge. The hero and towers attack on their own.', '敌人从上方进入，朝同一道栅栏前进。你负责布阵、整备和合成。英雄与防御塔会自动攻击。'],
  ['helpPlacement', 'Drag a defender to an empty slot to move it, or onto a compatible tower to merge. This works while paused or while a draft is open. An illegal drop snaps back. Moving the hero only changes its place.', '把防守者拖到空位即可移动，拖到可以合成的防御塔上即可合成。只有在暂停或整备期间才能这样做。非法放置会弹回。移动英雄只改变位置。'],
  ['helpMerge', 'While planning, choose two different occupied slots and preview the result. The same type and rank rise by one rank, up to rank 4. Different base types of equal rank become that recipe\'s hybrid. A hybrid merges only with the same hybrid. The hero never merges. Cancel, or an invalid pair, keeps both units.', '布阵时选择两个不同的已占用格子，并先预览结果。同种同阶会升 1 阶，最高 4 阶。不同的基础塔在同阶时会变成配方对应的混合单位。混合单位只能与相同的混合单位合成。英雄永不合成。取消或组合无效时，双方都会保留。'],
  ['helpDraft', 'Kills grant XP. At the threshold the fight pauses and three cards appear over the field. Tap a card to take it. There is no confirm button. A tower is placed with a second tap. On a full board you can still upgrade the hero or replace a tower. Canceling placement keeps those same three choices. Nothing is granted twice.', '击杀会获得经验。达到阈值时战斗暂停，三张卡叠在战场上。点一张卡即可选定，没有确认按钮。选塔之后，再点一个格子即可放置。格子占满时，仍可升级英雄或替换一座防御塔。取消放置会保留原来的三选一，不会因此多得一次。'],
  ['helpFence', 'Enemies attack only the shared fence. Defenders have no health. If fence HP reaches zero, the run is lost.', '敌人只攻击共用栅栏。防守者没有生命值。栅栏生命归零，本局失败。'],
  ['helpRange', 'A defender fires at any enemy inside its circle, including enemies outside its column. Select a unit to see that circle. Rear-row ranges reach the field in front of the fence.', '防守者会攻击圆圈内的任意敌人，包括其他列的敌人。选中单位即可看到这个圆。后排的射程能够打到栅栏前方。'],
  ['helpSpeed', 'Speeds are 1×, 1.5×, and 3×. They share one simulation clock, so attacks, status timers, and rewards are not sped past that clock or skipped. Pause stops the fight. Hiding the page stops it too. If you paused yourself, that pause remains when you return.', '速度有 1×、1.5× 和 3×。它们共用一个模拟时钟，攻击、状态时间和报酬不会超出这个时钟，也不会被跳过。暂停会停止战斗。隐藏页面也会停止。如果你亲手暂停，回到页面后暂停仍然保留。'],
  ['helpHero', 'The run starts with one hero in the front center, and no other towers. The hero fights automatically, never merges, and cannot be sold or replaced.', '每局开始时，前排中央只有一名英雄，没有其他防御塔。英雄自动战斗，不能合成、出售或替换。'],
  ['helpRewards', 'Victory and defeat pay currency once. Abandoning a fresh run before 30 seconds and 3 kills pays nothing. Higher difficulties multiply the reward. Reloading does not pay again.', '胜利和失败都会发放一次货币。不足 30 秒且击杀少于 3 就放弃，没有报酬。难度越高，报酬倍率越高。重新加载不会再次发放。'],
  ['helpEquipment', 'Currency buys equipment and permanent hero upgrades. Bonuses are bounded and give a head start. Normal is playable without them. Purchases apply to later runs. This fight keeps the bonuses it started with.', '货币可以购买装备和英雄的永久升级。加成有上限，只提供开局优势。不买它们也能游玩标准难度。购买从之后的对局生效。这一局仍使用开局时的加成。'],
  ['helpLanguage', 'Use 中 / EN at any time. Switching language keeps the current run, board, and rewards.', '可以随时使用中 / EN。切换语言会保留当前对局、棋盘和报酬。'],
  ['helpLanes', 'There are no lanes. Enemies appear more often near the middle, then drift sideways a little, and stay inside the field.', '没有分路。敌人更常在中间出现，随后略微横向漂移，并始终留在场地内。'],
  ['helpWin', 'Clear the scheduled waves to win. You can keep going in endless afterward. If the fence falls first, the run is a defeat.', '清完排定的波次即胜利。之后可以进入无尽。若栅栏先倒下，本局失败。'],
  ['helpBoss', 'Bosses arrive on the wave schedule. They still attack only the fence. Their names and traits are in the codex.', '首领会按波次时间表出现，同样只攻击栅栏。名字和特点可以在图鉴中查看。'],
  ['helpSave', 'This browser stores the profile and one paused run. Export a backup or import one. A damaged file does not replace a valid save. Opening a saved run starts paused.', '此浏览器会保存档案和一局暂停中的战斗。可以导出或导入备份。损坏的文件不会覆盖有效存档。打开已保存的对局时，会先处于暂停。'],
  ['helpSameType', 'Two units of the same type and the same rank become one unit of the next rank, up to rank 4. Stats grow. The role stays the same.', '两座种类相同、阶数相同的单位会合成下一阶，最高 4 阶。能力提高，职能不变。'],
  ['helpHybrid', 'Two different base towers of equal rank become the hybrid named in the recipe. Read the result before you confirm. Hybrids do not mix with a different type.', '两座不同的基础塔在同阶时，会变成配方里的混合单位。确认前请先看结果。混合单位不能再与另一种类混合。'],
  ['helpStatuses', 'Burn, poison, slow, stun, and brittle appear on the enemy. Slow changes how fast that enemy moves right now, not its base speed. Damage over time stops if the enemy dies.', '燃烧、中毒、减速、眩晕和易伤会显示在敌人身上。减速改变的是它此刻的移动速度，而不是基础速度。敌人死亡后，持续伤害会停止。'],
  ['helpDifficulty', 'Easy, Normal, Hard, and Nightmare change enemy health, speed, damage, numbers, fence HP, and the reward multiplier.', '轻松、标准、困难和噩梦会改变敌人的生命、速度、伤害和数量，以及栅栏生命和报酬倍率。'],
  ['helpReplace', 'Replacing a tower asks for confirmation and removes that tower. The hero\'s slot always refuses a replacement.', '替换防御塔前会要求确认，并移除那座塔。英雄所在的格子始终不能替换。'],
  ['helpSupport', 'Support towers still fire on their own. Their aura boosts allies inside its range. The bonus is capped.', '支援塔自己也会攻击。它们的光环会强化范围内的友军，加成有上限。'],
  ['helpCrit', 'A critical hit deals multiplied damage and shows a clear impact. Chance and multiplier are listed on the unit.', '暴击造成倍率伤害，并有清楚的命中反馈。暴击率和倍率写在单位面板上。'],
  ['helpTouch', 'Buttons are large enough to tap. Choose a slot on the field, then confirm in the panel. Essential actions are not hidden behind hover.', '按钮足够大，便于点按。先在场上选择格子，再在面板中确认。关键操作不需要靠悬停才能找到。'],
  ['helpEndless', 'Endless is offered only after the main waves are cleared and victory is settled. It does not pay the main reward a second time.', '只有清完主要波次并结算胜利之后，才会提供无尽。它不会把主线报酬再发一次。'],

  // Accessibility labels
  ['ariaBattlefield', 'Battlefield', '战场'],
  ['ariaFence', 'Shared fence', '共用栅栏'],
  ['ariaSlot', 'Defender slot {index}', '防守格子 {index}'],
  ['ariaPause', 'Pause the fight', '暂停战斗'],
  ['ariaResume', 'Resume the fight', '恢复战斗'],
  ['ariaSpeed', 'Game speed', '游戏速度'],
  ['ariaSpeed1', 'Set speed to 1×', '速度设为 1×'],
  ['ariaSpeed15', 'Set speed to 1.5×', '速度设为 1.5×'],
  ['ariaSpeed3', 'Set speed to 3×', '速度设为 3×'],
  ['ariaLanguage', 'Language', '语言'],
  ['ariaDialog', 'Dialog', '对话框'],

  // Keys the panels already look up. These replace local fallbacks.
  ['armoryIntro', 'Settled runs pay currency for equipment and permanent hero upgrades. Bonuses stay bounded, and Normal remains playable without them.', '已结算的对局提供货币，用于购买装备和永久英雄升级。加成有上限，标准难度不依赖它们也能游玩。'],
  ['bonuses', 'Current bonuses', '当前加成'],
  ['rewardBonusNote', 'The reward bonus is applied when a run is settled, along with the difficulty multiplier. Results show the currency actually awarded.', '报酬加成在对局结算时与难度倍率一起结算。结算画面显示实际获得的货币。'],
  ['equipReplaces', 'Choosing another item for the same slot replaces the equipped one.', '为同一位置选择另一件装备时，会替换当前装备。'],
  ['codexRankNote', 'Listed tower and recipe numbers are the catalog stats. Rank raises a unit from 1 to 4 without changing its identity.', '列出的防御塔与配方数值来自图鉴。阶数会把单位从 1 阶提升到最高 4 阶，种类保持不变。'],
  ['codexReady', 'Both parents are on the field', '两种材料都在场上'],
  ['codexWaiting', 'Build both parents first', '先放好两种材料'],
  ['settingsKeepRun', 'Language, sound, motion, and difficulty choices keep the current run.', '语言、声音、动效和难度的更改都会保留当前对局。'],
  ['difficultyNextRun', 'The highlighted difficulty is used the next time you start a run.', '高亮的难度会在下一局开始时使用。'],
  ['difficultyRewards', 'Higher difficulties increase enemy pressure and the reward multiplier.', '更高的难度会提高敌人压力和报酬倍率。'],
  ['helpRole', 'You plan, build, and decide. Towers and the hero attack on their own. There are no active combat abilities and no direct hero control.', '你负责布阵、建造和抉择。防御塔与英雄会自动攻击。没有主动战斗技能，也不能直接操纵英雄作战。'],
  ['helpAura', 'A support aura boosts nearby defenders. Its damage and haste bonuses are fractional and combat caps them.', '支援光环强化附近的防守者。其中的伤害和攻速是比例加成，战斗中会限制上限。'],
  ['helpBoard', 'Enemies move down toward a fence. Behind it are two rows of five slots. The hero begins in the front center.', '敌人向下接近栅栏。栅栏后是两行，每行五个格子。英雄从前排正中开始。'],
  ['helpRows', 'Front row, then rear row. The marked slot is the hero’s starting slot, the middle of the front row.', '上方是前排，下方是后排。标出的格子是英雄的起始位置，位于前排正中。'],
  ['enemyApproach', 'Enemies approach from above.', '敌人从上方接近。'],
  ['enemyFenceOnly', 'This enemy attacks the fence only.', '这种敌人只攻击栅栏。'],
  ['fenceDamage', 'Fence damage', '栅栏承受伤害'],
  ['health', 'Health', '生命'],
  ['saveHelp', 'Export creates a JSON save of the profile and run. Import replaces them only when the file is valid. An invalid file keeps the current save.', '导出会生成包含档案和对局的 JSON 存档。只有文件有效时，导入才会替换它们。无效文件会保留当前存档。'],
  ['copySave', 'Copy save', '复制存档'],
  ['copyUnavailable', 'Select the save text to copy it.', '请选中存档文本进行复制。'],
  ['noOutcome', 'This run has no settled outcome yet.', '这局还没有结算结果。'],
  ['settlementPending', 'The reward appears here after the run is settled.', '本局结算后才会显示报酬。'],
  ['on', 'On', '开启'],
  ['off', 'Off', '关闭'],
  ['unavailable', 'Not available', '暂不可用'],
  ['missing', 'Still waiting', '还在等待'],
  ['invalidProfile', 'That profile is not valid', '这份档案无效'],
  ['error', 'Something went wrong', '出了点问题'],
  ['bad-phase', 'Not available right now', '现在不能这么做'],
  ['bad-speed', 'Speed stays at 1×, 1.5×, or 3×', '速度只能是 1×、1.5× 或 3×'],
  ['bad-language', 'Language is English or Chinese', '语言只能是中文或英文'],
  ['bad-screen', 'Unknown screen', '未知界面'],
  ['unknown-action', 'Unknown action', '未知操作'],
  ['backRow', 'Rear row', '后排'],
  ['critDamage', 'Crit damage', '暴击伤害'],
  ['projectile', 'Projectile speed', '弹速'],
  ['pauseToPlan', 'Pause to move defenders or merge towers.', '暂停后才能移动防守者或合成防御塔。'],
  ['planningLocked', 'The fight is running. Pause to move or merge.', '战斗进行中。暂停后才能移动或合成。'],
  ['noMergePartner', 'A merge needs two towers. The hero stays independent.', '合成需要两座防御塔。英雄保持独立。'],
  ['heroNoMerge', 'The hero stays independent. Move the hero during planning. Merges and replacement leave the hero in place.', '英雄保持独立。布阵时可以移动英雄。合成和替换都不会动英雄。'],
  ['placeHint', 'Choose an empty slot. Occupied towers stay unless this card is a replacement.', '选择一个空位。已有的防御塔会留下，除非这张卡是替换。'],
  ['replaceHeroSafe', 'Choose the tower to replace. The hero stays in place.', '选择要替换的防御塔。英雄会留在原位。'],
  ['confirmReplaceBody', 'The tower in this slot will be removed.', '这个格子上的防御塔会被移除。'],
  ['statsUnavailable', 'Stats will appear when the catalog is ready.', '图鉴就绪后会显示属性。'],
  ['emptySelection', 'Select a slot to see its stats.', '选择一个格子以查看属性。'],
  ['sameTypeMerge', 'Same type and rank combine into the next rank.', '相同种类且阶数相同，会升到下一阶。'],
  ['hybridMerge', 'This pair becomes the hybrid below.', '这一对会变成下面的混合单位。'],
  ['maxRankNote', 'Rank 4 can form a hybrid with a different rank-4 base tower when a recipe exists.', '4 阶可以与另一座 4 阶的不同基础塔按配方合成混合单位。'],
  ['supportNote', 'Support range is a circle from this slot. Aura bonuses reach defenders inside that circle. Attacks use the same geometric range.', '支援范围以这个格子为圆心。光环加成覆盖圆内的防守者。攻击也按这个几何距离判定。'],
  ['youGain', 'Result', '结果'],
  ['currentStats', 'Stats', '属性'],
  ['mergeReview', 'Review the merge, then confirm or cancel. Both units stay if you cancel.', '先查看合成结果，再确认或取消。取消会保留双方。'],
  ['lostOnReplace', 'Removed tower', '被移除的防御塔'],
  ['chooseEmpty', 'Empty slots are ready for placement.', '空位可以直接放置。'],
  ['heroStays', 'The hero stays on the board.', '英雄会留在场上。'],
  ['noValidTarget', 'No legal merge is available from this tower.', '这座防御塔目前没有合法的合成对象。'],
  ['moveHint', 'Choose a destination. An occupied slot swaps places.', '选择目标格子。已占用的格子会对调。'],
  ['mergeHint', 'Choose a tower of equal rank. The preview explains the result before you confirm.', '选择一座同阶防御塔。确认前会显示合成结果。'],
  ['sourceHint', 'Choose the defender to move.', '选择要移动的防守者。'],
  ['mergeSourceHint', 'Choose the first tower. The hero is not a merge ingredient.', '选择第一座防御塔。英雄不能作为合成材料。'],
  ['buildPanelLabel', 'Build, draft, and merge', '构筑、整备与合成'],
  ['kindTower', 'Tower', '防御塔'],
  ['no_draft', 'There is no draft right now', '当前没有整备'],
  ['no_options', 'There is no draft right now', '当前没有整备'],
  ['not_placing', 'There is nothing to place', '当前没有要放置的单位'],
  ['not_playing', 'The fight is not running', '当前不在战斗中'],
  ['not_ready', 'Not enough XP for a draft yet', '经验还不够，还不能整备'],
  ['already_placing', 'Finish placing the current tower first', '请先放好当前的防御塔'],
  ['busy', 'A draft is already open', '整备已经打开'],
  ['bad_index', 'That choice is not available', '没有这个选项'],
  ['bad_option', 'That choice is not available', '没有这个选项'],
  ['upgrade_failed', 'That upgrade could not be applied', '这次升级没有生效'],
  ['unknown_tower', 'Unknown tower', '未知防御塔'],
  ['replace_not_offered', 'This choice cannot replace a tower', '这个选项不能替换防御塔'],
  ['no_slot', 'The board is full', '格子已满'],
  ['draft_missing', 'That draft is no longer available', '这次整备已经不在了'],
  ['unknown_upgrade', 'Unknown upgrade', '未知升级'],
  ['upgrade_capped', 'Already at max level', '已经达到最高级'],
  ['no_hero', 'The hero is missing', '场上没有英雄'],
  ['invalid_state', 'That action is not available', '现在不能这么做']
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
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/recipes.js");
const __ff_m2 = __ff_load("src/data/towers.js");
const BASE_TYPES = __ff_m0["BASE_TYPES"];
const clamp = __ff_m0["clamp"];
const RECIPES = __ff_m1["RECIPES"];
const getUnitStats = __ff_m2["getUnitStats"];
/**
 * Fencefall defender sprites (logical pixels, bottom-center anchor).
 *
 * drawDefender(ctx, unit, x, y) plants the sprite's feet — including the
 * contact-shadow row — on (x, y). The cached image is 40×40, inside the
 * 24–40px art range, and slots are 64×72.
 *
 * Hybrid silhouettes follow a sorted parent pair (`bolt+fire`, …). Each
 * hybrid joins that pair's two parent shapes — bow, flame bowl, crystal,
 * spark coil, flask, banner — so it reads as a combination, not a recolor.
 * Parents come from RECIPES (id + parents), then unit.parents / ingredients /
 * components / sourceTypes, then the type id (`frost+support`, `firefrost`,
 * or a known flavor alias). Unknown ids still draw a ranked reliquary.
 * Rank 1–4 is a row of chevrons on the plinth, one mark per rank.
 * A defender whose stats include an aura wears a teal ring around the sprite.
 * The ring sits outside the body, so chevrons and hybrid shapes stay put.
 * Nothing here reads or writes gameplay RNG or run state.
 */




const W = 40;
const H = 40;
const FRAMES = 4;

const PALETTE = {
  K: '#140e0c',
  k: '#2a221c',
  R: '#4a2c18',
  r: '#8a552c',
  Y: '#e0a05a',
  N: '#3a4450',
  n: '#8494a4',
  M: '#e2eaf0',
  B: '#7a4e18',
  b: '#f0c14a',
  X: '#322e2a',
  x: '#6a635c',
  w: '#c4bbb0',
  d: '#3c1018',
  C: '#6e2430',
  e: '#8e3844',
  c: '#c44a56',
  H: '#e6c15a',
  h: '#fff0c0',
  s: '#c49068',
  S: '#f0c4a0',
  y: '#f6d8b4',
  P: '#5c3818',
  p: '#a06a38',
  F: '#5c140c',
  f: '#e04018',
  A: '#ffb030',
  a: '#fff4c8',
  I: '#102e3c',
  i: '#2a7c9c',
  L: '#8ae4f8',
  l: '#f6feff',
  V: '#1c1438',
  v: '#6840d0',
  Z: '#ffe050',
  z: '#fffce8',
  U: '#7a4018',
  u: '#e08840',
  G: '#142010',
  g: '#3c882c',
  Q: '#b0e848',
  q: '#f0ffd0',
  o: '#7aa090',
  O: '#d8f0e4',
  T: '#145850',
  t: '#38a898',
  D: '#e0fff6',
  E: '#f6f2e6',
  W: '#ffffff',
  J: '#1c1612',
  j: '#4a3c2c',
  m: '#d8c4a4'
};

const ROLE = {bolt: 'n', fire: 'f', frost: 'L', lightning: 'Z', poison: 'Q', support: 't'};
const BASE_SET = new Set(BASE_TYPES);

const ALIASES = {
  hero: 'hero',
  warden: 'hero',
  champion: 'hero',
  keeper: 'hero',
  sentinel: 'hero',
  bolt: 'bolt',
  arrow: 'bolt',
  arrows: 'bolt',
  projectile: 'bolt',
  ballista: 'bolt',
  crossbow: 'bolt',
  quarrel: 'bolt',
  archer: 'bolt',
  fire: 'fire',
  flame: 'fire',
  burn: 'fire',
  ember: 'fire',
  frost: 'frost',
  ice: 'frost',
  cold: 'frost',
  slow: 'frost',
  lightning: 'lightning',
  lightening: 'lightning',
  lighning: 'lightning',
  shock: 'lightning',
  thunder: 'lightning',
  electric: 'lightning',
  spark: 'lightning',
  poison: 'poison',
  posion: 'poison',
  toxin: 'poison',
  venom: 'poison',
  plague: 'poison',
  support: 'support',
  aura: 'support',
  banner: 'support',
  buff: 'support',
  buffer: 'support',
  healer: 'support'
};

/** Flavor ids used when a recipe id does not embed its parent names. RECIPES parents win. */
const FLAVOR_PAIRS = {
  cinderbolt: ['bolt', 'fire'],
  cinderquarrel: ['bolt', 'fire'],
  emberbolt: ['bolt', 'fire'],
  hailspike: ['bolt', 'frost'],
  glacierbolt: ['bolt', 'frost'],
  stormlance: ['bolt', 'lightning'],
  thunderbolt: ['bolt', 'lightning'],
  venomspine: ['bolt', 'poison'],
  poisonbolt: ['bolt', 'poison'],
  signalshot: ['bolt', 'support'],
  signaler: ['bolt', 'support'],
  steamvent: ['fire', 'frost'],
  emberglass: ['fire', 'frost'],
  plasmabrazier: ['fire', 'lightning'],
  stormkiln: ['fire', 'lightning'],
  blightkiln: ['fire', 'poison'],
  plaguefire: ['fire', 'poison'],
  warbeacon: ['fire', 'support'],
  warhorn: ['fire', 'support'],
  prismcoil: ['frost', 'lightning'],
  crystalstorm: ['frost', 'lightning'],
  rimeurn: ['frost', 'poison'],
  blightice: ['frost', 'poison'],
  wardglass: ['frost', 'support'],
  wardbell: ['frost', 'support'],
  acidarc: ['lightning', 'poison'],
  venomcoil: ['lightning', 'poison'],
  relaystandard: ['lightning', 'support'],
  sparkbanner: ['lightning', 'support'],
  plaguealtar: ['poison', 'support'],
  plaguecenser: ['poison', 'support'],
  censeralter: ['poison', 'support']
};

const recipeById = new Map();
indexRecipes(RECIPES);

const cache = new Map();

const TOWER_PAINTERS = {
  bolt: paintBolt,
  fire: paintFire,
  frost: paintFrost,
  lightning: paintLightning,
  poison: paintPoison,
  support: paintSupport
};

const HYBRID_PAINTERS = {
  'bolt+fire': paintCinderQuarrel,
  'bolt+frost': paintHailSpike,
  'bolt+lightning': paintStormLance,
  'bolt+poison': paintVenomSpine,
  'bolt+support': paintSignalShot,
  'fire+frost': paintSteamVent,
  'fire+lightning': paintPlasmaBrazier,
  'fire+poison': paintBlightKiln,
  'fire+support': paintWarBeacon,
  'frost+lightning': paintPrismCoil,
  'frost+poison': paintRimeUrn,
  'frost+support': paintWardBell,
  'lightning+poison': paintAcidArc,
  'lightning+support': paintRelayStandard,
  'poison+support': paintPlagueAltar
};

function defenderSize(unit) {
  void unit;
  return {width: W, height: H};
}

function statsHaveAura(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
  const aura = stats.aura;
  if (aura && typeof aura === 'object' && !Array.isArray(aura)) return true;
  const mechanics = stats.mechanics;
  if (!Array.isArray(mechanics)) return false;
  for (let i = 0; i < mechanics.length; i++) {
    if (String(mechanics[i]).trim().toLowerCase() === 'aura') return true;
  }
  return false;
}

function unitHasAura(unit) {
  if (statsHaveAura(unit.stats)) return true;
  try {
    return statsHaveAura(getUnitStats(unit));
  } catch {
    return false;
  }
}

function drawPixelCircle(ctx, cx, cy, radius, color) {
  const r = Math.round(radius);
  if (r <= 0 || typeof ctx.fillRect !== 'function') return;
  let x = r;
  let y = 0;
  let decision = 1 - r;
  ctx.fillStyle = color;
  while (x >= y) {
    ctx.fillRect(cx + x, cy + y, 1, 1);
    ctx.fillRect(cx + y, cy + x, 1, 1);
    ctx.fillRect(cx - x, cy + y, 1, 1);
    ctx.fillRect(cx - y, cy + x, 1, 1);
    ctx.fillRect(cx + x, cy - y, 1, 1);
    ctx.fillRect(cx + y, cy - x, 1, 1);
    ctx.fillRect(cx - x, cy - y, 1, 1);
    ctx.fillRect(cx - y, cy - x, 1, 1);
    y += 1;
    if (decision <= 0) decision += 2 * y + 1;
    else {
      x -= 1;
      decision += 2 * (y - x) + 1;
    }
  }
}

// Halo in the slot padding, outside the 40px body. Outer radius stays inside
// the 64px slot and off the silhouette, chevrons, and contact shadow.
function drawAuraRing(ctx, dx, dy, dw, dh) {
  const cx = Math.round(dx + dw / 2);
  const cy = Math.round(dy + dh / 2);
  const reach = Math.round(Math.min(dw, dh) / 2);
  const outer = reach + Math.max(8, Math.round(Math.min(dw, dh) * 0.25));
  drawPixelCircle(ctx, cx, cy, outer, '#0c3f36');
  drawPixelCircle(ctx, cx, cy, outer - 1, '#7dcec0');
  drawPixelCircle(ctx, cx, cy, outer - 2, '#e7fff8');
}

function drawDefender(ctx, unit, x, y, options = {}) {
  if (!ctx || !unit || typeof unit !== 'object' || typeof ctx.save !== 'function') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const opts = options || {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const flash = Number.isFinite(opts.flash) && opts.flash > 0 ? Math.min(1, opts.flash) : 0;
  const visual = resolveVisual(unit);
  const rank = clamp(Math.round(Number.isFinite(unit.rank) ? unit.rank : 1), 1, 4);
  const stars = visual.family === 'hero' ? starCount(unit) : 0;
  const frame = frameOf(time);
  const sprite = getSprite(visual, rank, stars, frame);
  const dw = Math.max(1, Math.round(W * scale));
  const dh = Math.max(1, Math.round(H * scale));
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh);
  const aura = unitHasAura(unit);
  ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* older contexts */ }
    blit(ctx, sprite, dx, dy, dw, dh);
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, sprite, dx, dy, dw, dh);
    }
    if (aura) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      drawAuraRing(ctx, dx, dy, dw, dh);
    }
  } finally {
    ctx.restore();
  }
}

function frameOf(time) {
  if (!Number.isFinite(time) || time <= 0) return 0;
  return Math.floor(time * 6) % FRAMES;
}

function starCount(unit) {
  const upgrades = unit.upgrades;
  if (!upgrades || typeof upgrades !== 'object') return 0;
  let count = 0;
  for (const key of Object.keys(upgrades)) {
    const value = upgrades[key];
    if (typeof value === 'number' && Number.isFinite(value)) count += Math.max(0, Math.min(6, Math.round(value)));
    else if (value) count += 1;
    if (count >= 6) return 6;
  }
  return count;
}

function indexRecipes(catalog) {
  const list = Array.isArray(catalog)
    ? catalog
    : (catalog && typeof catalog === 'object'
      ? Object.entries(catalog).map(([id, value]) => ({id, ...(value && typeof value === 'object' ? value : {})}))
      : []);
  for (const recipe of list) {
    if (!recipe || typeof recipe !== 'object') continue;
    const pair = parentsOfRecipe(recipe);
    const id = String(recipe.id ?? '').trim().toLowerCase();
    if (!id || !pair) continue;
    recipeById.set(id, pair);
    recipeById.set(id.replace(/[^a-z0-9]/g, ''), pair);
  }
}

function parentsOfRecipe(recipe) {
  return pairFromList(recipe.parents)
    || pairFromList(recipe.ingredients)
    || pairFromList(recipe.types)
    || pairFromList(recipe.components)
    || pairFromList(recipe.pair)
    || (recipe.a != null && recipe.b != null ? pairFromList([recipe.a, recipe.b]) : null)
    || (recipe.left != null && recipe.right != null ? pairFromList([recipe.left, recipe.right]) : null);
}

function canonToken(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  return ALIASES[raw] || raw;
}

function canonBase(value) {
  const mapped = canonToken(value);
  return BASE_SET.has(mapped) ? mapped : '';
}

function pairKey(a, b) {
  return BASE_TYPES.indexOf(a) < BASE_TYPES.indexOf(b) ? `${a}+${b}` : `${b}+${a}`;
}

function pairFromList(list) {
  if (typeof list === 'string') return pairFromIdString(list);
  if (!Array.isArray(list) || list.length < 2) return null;
  const bases = [];
  for (const entry of list) {
    const base = canonBase(entry && typeof entry === 'object' ? (entry.type || entry.id || entry.kind) : entry);
    if (base && !bases.includes(base)) bases.push(base);
  }
  if (bases.length < 2) return null;
  return pairKey(bases[0], bases[1]);
}

function pairFromIdString(id) {
  const raw = String(id ?? '').trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[^a-z0-9]/g, '');
  if (recipeById.has(raw)) return recipeById.get(raw);
  if (recipeById.has(compact)) return recipeById.get(compact);
  if (FLAVOR_PAIRS[compact]) return pairFromList(FLAVOR_PAIRS[compact]);
  const found = [];
  const push = (base) => { if (base && !found.includes(base)) found.push(base); };
  for (const part of raw.split(/[^a-z0-9]+/)) push(canonBase(part));
  if (found.length >= 2) return pairKey(found[0], found[1]);
  const tokens = [...BASE_TYPES, ...Object.keys(ALIASES).filter((key) => BASE_SET.has(ALIASES[key]))];
  tokens.sort((a, b) => b.length - a.length);
  const hits = [];
  for (const token of tokens) {
    if (!raw.includes(token)) continue;
    const base = BASE_SET.has(token) ? token : ALIASES[token];
    if (base && !hits.includes(base)) hits.push(base);
  }
  if (hits.length >= 2) return pairKey(hits[0], hits[1]);
  return null;
}

function findPair(unit, typeName) {
  return pairFromList(unit.parents)
    || pairFromList(unit.ingredients)
    || pairFromList(unit.components)
    || pairFromList(unit.sourceTypes)
    || pairFromIdString(typeName);
}

function accentFor(name) {
  const accents = ['f', 'L', 'Z', 'Q', 't', 'b', 'c', 'v'];
  let hash = 2166136261;
  const text = String(name || 'unknown');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return accents[(hash >>> 0) % accents.length];
}

function resolveVisual(unit) {
  const typeName = canonToken(unit.type);
  const kind = typeof unit.kind === 'string' ? unit.kind.toLowerCase() : '';
  if (kind === 'hero' || typeName === 'hero') return {family: 'hero', key: 'hero'};
  const base = BASE_SET.has(typeName) ? typeName : '';
  if (base && kind !== 'hybrid') return {family: 'tower', key: base};
  const pair = findPair(unit, typeName);
  if (pair) return {family: 'hybrid', key: pair};
  const accent = accentFor(typeName || kind || 'hybrid');
  return {family: 'unknown', key: `unknown:${accent}`, accent};
}

function createPainter(frame) {
  const cells = Array.from({length: H}, () => Array(W).fill('.'));
  return {
    frame,
    cells,
    px(x, y, color) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H || !color || color === '.' || !PALETTE[color]) return;
      cells[iy][ix] = color;
    },
    fill(x, y, w, h, color) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) this.px(x + i, y + j, color);
      }
    },
    hline(x, y, w, color) { this.fill(x, y, w, 1, color); },
    vline(x, y, h, color) { this.fill(x, y, 1, h, color); }
  };
}

function mx(x) {
  return W - 1 - x;
}

function speckle(p, x, y, w, h, base, dark, light) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const n = (i * 17 + j * 11) & 15;
      p.px(x + i, y + j, n === 0 ? light : n < 3 ? dark : base);
    }
  }
}

function oval(p, cx, cy, rx, ry, color, test) {
  if (!(rx > 0) || !(ry > 0)) return;
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1 && (!test || test(x, y))) p.px(x, y, color);
    }
  }
}

function drawFlame(p, cx, top, height, style) {
  const cols = {
    fire: ['a', 'A', 'f', 'F'],
    green: ['q', 'Q', 'g', 'G'],
    steam: ['l', 'L', 'E', 'i'],
    plasma: ['z', 'Z', 'a', 'f']
  }[style] || ['a', 'A', 'f', 'F'];
  const sway = [0, 1, 0, -1][p.frame] || 0;
  const tall = Math.max(3, height - (p.frame === 2 ? 1 : 0));
  for (let i = 0; i < tall; i++) {
    const t = tall <= 1 ? 0 : i / (tall - 1);
    const wobble = (i + p.frame * 2) % 4 === 0 ? 1 : 0;
    const half = Math.max(0, Math.round((1 - t) * 3.4 + wobble * (1 - t)));
    const y = top + i;
    const x = cx + (t > 0.4 ? sway : 0);
    const col = cols[t < 0.2 ? 0 : t < 0.48 ? 1 : t < 0.75 ? 2 : 3];
    p.hline(x - half, y, half * 2 + 1, col);
    if (half > 0 && (i + p.frame) % 3 === 0) p.px(x, y, cols[0]);
  }
}

function drawCrystal(p, cx, top, height, wide) {
  const mid = top + Math.max(1, Math.floor(height * 0.42));
  const bot = top + height - 1;
  for (let y = top; y <= bot; y++) {
    const span = y <= mid ? (y - top) / Math.max(1, mid - top) : (bot - y) / Math.max(1, bot - mid);
    const half = Math.max(0, Math.round(span * wide));
    for (let x = cx - half; x <= cx + half; x++) {
      let color = 'L';
      if (x === cx - half || x === cx + half) color = 'I';
      else if (x < cx - 1) color = 'i';
      else if ((y + p.frame * 3) % 7 === 0 && x === cx) color = 'W';
      else if (x === cx) color = 'l';
      p.px(x, y, color);
    }
  }
  p.px(cx, top, 'W');
}

function drawCoils(p, cx, top, count, gap) {
  for (let i = 0; i < count; i++) {
    const y = top + i * gap;
    p.hline(cx - 5, y, 11, 'U');
    p.hline(cx - 4, y + 1, 9, 'u');
    p.px(cx - 5, y + 1, 'B');
    p.px(cx + 5, y + 1, 'B');
    p.hline(cx - 2, y + 2, 5, 'V');
    p.px(cx, y + 1, (i + p.frame) % 2 === 0 ? 'Z' : 'z');
  }
  p.vline(cx, top - 1, count * gap + 1, 'n');
  p.vline(cx + 1, top - 1, count * gap, 'N');
}

function drawSparks(p, points) {
  const cols = ['z', 'Z', 'h', 'v'];
  for (let i = 0; i < points.length; i++) {
    const shift = (i + p.frame) % 2;
    p.px(points[i][0] + (i % 2 === 0 ? shift : -shift), points[i][1] - (p.frame === 3 && i === 0 ? 1 : 0), cols[(i + p.frame) % cols.length]);
  }
}

function drawZig(p, points, color, hot) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      p.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), (s + p.frame) % 3 === 0 ? hot : color);
    }
  }
}

function drawFlag(p, x, y, w, h) {
  const ox = [0, 1, 1, 0][p.frame];
  speckle(p, x + ox, y, w, h, 't', 'T', 'D');
  p.hline(x + ox, y, w, 'D');
  p.vline(x + ox, y, h, 'T');
  p.vline(x + ox + w - 1, y, h, 'T');
  const cx = x + ox + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  p.px(cx, cy - 1, 'h');
  p.px(cx, cy, p.frame % 2 === 0 ? 'H' : 'b');
  p.px(cx - 1, cy + 1, 'E');
  p.px(cx + 1, cy + 1, 'E');
  p.px(cx, cy + 2, 'T');
  p.px(x + ox + 2, y + 3, 'E');
  p.px(x + ox + w - 3, y + h - 3, 'T');
}

function drawBow(p, limbHi, limb, limbDk, stringC, stock) {
  const pts = [[5, 23], [6, 22], [7, 21], [8, 20], [9, 19], [10, 18], [11, 17], [12, 16], [13, 16], [14, 15], [15, 15]];
  for (const [x, y] of pts) {
    p.px(x, y, limbHi);
    p.px(x, y + 1, limb);
    p.px(x, y + 2, limbDk);
    p.px(mx(x), y, limbHi);
    p.px(mx(x), y + 1, limb);
    p.px(mx(x), y + 2, limbDk);
  }
  p.fill(4, 24, 3, 2, 'N');
  p.fill(mx(6), 24, 3, 2, 'N');
  p.px(5, 24, 'M');
  p.px(mx(5), 24, 'M');
  p.hline(12, 17, 16, stringC);
  speckle(p, 14, 20, 12, 11, stock, 'R', 'Y');
  p.hline(14, 22, 12, 'N');
  p.hline(14, 27, 12, 'n');
  p.fill(18, 17, 4, 4, 'r');
  p.vline(18, 17, 4, 'N');
  p.vline(21, 17, 4, 'N');
  p.px(15, 22, 'b');
  p.px(24, 22, 'b');
}

function drawQuarrel(p, tip, shaft, lift = 0) {
  const y = 4 + lift;
  p.px(19, y, tip);
  p.px(20, y, tip);
  p.px(18, y + 1, tip);
  p.px(21, y + 1, tip);
  p.px(19, y + 1, 'M');
  p.px(20, y + 1, 'W');
  p.vline(19, y + 2, 10, shaft);
  p.vline(20, y + 2, 10, 'n');
  p.px(17, y + 10, 'Y');
  p.px(18, y + 9, 'Y');
  p.px(22, y + 10, 'Y');
  p.px(21, y + 9, 'r');
}

function drawWinch(p, rank) {
  p.fill(16, 23, 5, 5, 'N');
  p.fill(17, 24, 3, 3, 'n');
  p.px(18, 25, p.frame % 2 === 0 ? 'M' : 'b');
  p.px(17, 24, 'K');
  p.px(19, 26, 'K');
  if (rank >= 3) p.px(21, 23, 'H');
  if (rank >= 4) p.px(18, 22, 'h');
}

function drawFlask(p, cx, top, liquid, glassHi) {
  p.fill(cx - 1, top, 4, 2, 'Y');
  p.px(cx, top, 'y');
  p.fill(cx - 2, top + 2, 6, 2, 'r');
  p.vline(cx - 2, top + 2, 2, 'R');
  p.fill(cx - 1, top + 4, 4, 3, 'O');
  p.vline(cx - 1, top + 4, 3, 'o');
  p.vline(cx + 2, top + 4, 3, 'o');
  oval(p, cx + 0.5, top + 14, 8, 8, 'O');
  oval(p, cx + 0.5, top + 16, 6.2, 5.2, liquid, (_x, y) => y >= top + 14);
  p.hline(cx - 5, top + 14, 12, liquid === 'g' ? 'Q' : 'L');
  p.vline(cx - 4, top + 10, 4, glassHi);
  p.px(cx - 3, top + 11, 'W');
  const bubbleY = top + 12 + ((4 - p.frame + 8) % 5);
  p.px(cx - 2, bubbleY, 'q');
  p.px(cx + 2, bubbleY + 1, 'W');
  p.px(cx, top + 17, p.frame % 2 === 0 ? 'q' : 'Q');
}

function drawPlinth(p, rank) {
  speckle(p, 9, 31, 22, 7, 'x', 'X', 'w');
  p.fill(10, 32, 20, 2, 'w');
  p.fill(10, 35, 20, 2, 'X');
  p.fill(6, 33, 4, 5, 'X');
  p.fill(30, 33, 4, 5, 'X');
  p.px(7, 34, 'w');
  p.px(32, 34, 'w');
  p.px(13, 33, 'X');
  p.px(22, 36, 'k');
  p.px(18, 37, 'X');
  p.px(25, 34, 'k');
  if (rank >= 2) {
    p.px(10, 32, 'b');
    p.px(29, 32, 'b');
  }
  if (rank >= 4) {
    p.hline(10, 32, 20, 'b');
    p.px(6, 33, 'H');
    p.px(33, 33, 'H');
    p.px(6, 37, 'h');
    p.px(33, 37, 'h');
  }
}

function drawRankGems(p, rank) {
  // One upward chevron per rank. White reads on the ink plaque and on dark
  // stone. The crimson edge reads on gold trim, so the count stays a mark
  // rather than another gold highlight. An ink row sits between the marks
  // and the rank-4 band.
  const mark = 3;
  const gap = 2;
  const total = rank * mark + (rank - 1) * gap;
  let x = Math.floor((W - total) / 2);
  p.fill(x - 1, 34, total + 2, 4, 'K');
  for (let i = 0; i < rank; i++) {
    p.px(x, 35, 'W');
    p.px(x + 2, 35, 'W');
    p.px(x + 1, 36, 'W');
    p.px(x, 36, 'c');
    p.px(x + 2, 36, 'c');
    p.px(x + 1, 37, 'c');
    x += mark + gap;
  }
}

function drawLineage(p, pair) {
  const [a, b] = pair.split('+');
  // Sit on the plinth highlight, above the rank gems, so the two marks stay separate.
  p.fill(11, 32, 2, 2, ROLE[a] || 'E');
  p.fill(27, 32, 2, 2, ROLE[b] || 'E');
  p.px(11, 32, 'W');
  p.px(27, 32, 'W');
}

function drawHeroSeal(p) {
  p.fill(16, 17, 8, 7, 'H');
  p.fill(17, 18, 6, 5, 'B');
  p.vline(19, 18, 5, 'K');
  p.vline(20, 18, 5, 'K');
  p.px(17, 17, 'h');
  p.px(22, 17, 'W');
  p.px(16, 19, 'b');
  p.px(23, 20, 'b');
}

function drawStars(p, stars) {
  for (let i = 0; i < stars; i++) {
    const x = 3 + i * 3;
    p.px(x, 2, 'h');
    p.px(x - 1, 3, 'b');
    p.px(x, 3, 'H');
    p.px(x + 1, 3, 'b');
  }
}

function drawShadow(p) {
  p.hline(10, 39, 20, 'k');
  p.px(9, 39, 'k');
  p.px(30, 39, 'k');
}

function applyOutline(cells) {
  const marks = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      if (cells[y][x] !== '.') continue;
      const near = (x > 0 && cells[y][x - 1] !== '.')
        || (x + 1 < W && cells[y][x + 1] !== '.')
        || (y > 0 && cells[y - 1][x] !== '.')
        || (y + 1 < H && cells[y + 1][x] !== '.');
      if (near) marks.push(x, y);
    }
  }
  for (let i = 0; i < marks.length; i += 2) cells[marks[i + 1]][marks[i]] = 'K';
}

function paintHero(p) {
  const glow = ['A', 'a', 'h', 'f'][p.frame];
  p.vline(28, 5, 14, 'N');
  p.vline(29, 8, 10, 'n');
  p.px(28, 2, p.frame % 2 === 0 ? 'W' : 'M');
  p.px(27, 3, 'n');
  p.px(28, 3, 'M');
  p.px(29, 3, 'n');
  p.px(27, 4, 'N');
  p.px(28, 4, 'M');
  p.px(29, 4, 'N');
  // Pointed hood, narrow face, sloping shoulders — not a rectangular block.
  p.px(19, 5, 'd');
  p.hline(18, 6, 3, 'C');
  p.hline(17, 7, 5, 'C');
  p.hline(16, 8, 7, 'd');
  p.hline(18, 8, 3, 'H');
  p.px(19, 8, 'h');
  p.fill(15, 9, 9, 3, 'C');
  p.px(14, 10, 'd');
  p.px(24, 10, 'd');
  p.px(14, 11, 'C');
  p.px(24, 11, 'e');
  p.fill(17, 9, 5, 4, 'S');
  p.px(17, 9, 's');
  p.px(21, 9, 's');
  p.px(18, 10, 'K');
  p.px(20, 10, 'K');
  p.px(18, 9, 'W');
  p.px(19, 11, 's');
  p.hline(16, 12, 8, 'C');
  p.hline(14, 13, 12, 'e');
  p.hline(13, 14, 14, 'C');
  speckle(p, 12, 15, 16, 8, 'C', 'd', 'e');
  p.vline(19, 15, 8, 'd');
  p.hline(11, 23, 7, 'c');
  p.hline(22, 23, 7, 'e');
  p.hline(10, 24, 8, 'C');
  p.hline(22, 24, 8, 'd');
  p.px((p.frame === 1 || p.frame === 2) ? 9 : 31, 23, 'C');
  p.fill(24, 14, 4, 5, 'p');
  p.px(27, 15, 'S');
  p.px(27, 16, 'y');
  p.px(8, 15, 'b');
  p.fill(7, 16, 5, 2, 'B');
  p.fill(6, 18, 7, 6, 'O');
  p.fill(8, 19, 3, 4, glow);
  p.px(7, 19, 'W');
  p.vline(7, 20, 3, 'a');
  p.fill(7, 24, 5, 2, 'B');
  p.px(6, 20, 'n');
  p.px(12, 20, 'n');
  p.fill(14, 26, 4, 7, 'P');
  p.fill(22, 26, 4, 7, 'P');
  p.vline(15, 26, 6, 'p');
  p.vline(23, 26, 6, 'p');
  p.fill(13, 32, 5, 4, 'J');
  p.fill(22, 32, 5, 4, 'J');
  p.hline(13, 32, 5, 'j');
  p.hline(22, 32, 5, 'j');
  p.px(14, 33, 'j');
  p.px(23, 34, 'y');
}

function paintBolt(p, rank) {
  drawBow(p, 'Y', 'r', 'R', rank >= 3 ? 'b' : 'M', 'r');
  drawQuarrel(p, 'M', 'N', p.frame === 1 ? -1 : 0);
  drawWinch(p, rank);
  if (rank >= 4) {
    p.px(19, 3, 'h');
    p.px(20, 3, 'W');
  }
}

function drawCoupling(p, rank) {
  p.fill(3, 27, 34, 3, 'X');
  p.hline(3, 27, 34, 'n');
  p.hline(5, 29, 30, 'k');
  p.fill(16, 17, 6, 7, 'N');
  p.hline(16, 17, 6, 'n');
  p.px(18, 19, p.frame % 2 ? 'b' : 'M');
  p.px(19, 21, 'k');
  if (rank >= 3) p.px(17, 18, 'H');
  if (rank >= 4) p.px(20, 18, 'h');
}

function drawCompactBow(p, ox, oy, rank) {
  const lift = p.frame === 1 ? -1 : 0;
  const cx = ox + 8;
  const y0 = oy + lift;
  p.fill(ox + 4, oy + 16, 9, 13, 'r');
  p.vline(ox + 4, oy + 16, 13, 'R');
  p.vline(ox + 12, oy + 16, 13, 'R');
  p.hline(ox + 4, oy + 16, 9, 'Y');
  p.hline(ox + 4, oy + 22, 9, 'N');
  p.hline(ox + 5, oy + 27, 7, 'n');
  p.fill(ox + 6, oy + 14, 5, 4, 'R');
  p.px(ox + 7, oy + 15, 'Y');
  p.fill(ox + 6, oy + 19, 5, 4, 'N');
  p.fill(ox + 7, oy + 20, 3, 2, 'n');
  p.px(ox + 8, oy + 20, p.frame % 2 ? 'b' : 'M');
  const limb = [[0, 18], [1, 17], [2, 16], [3, 15], [4, 14], [5, 13], [6, 12], [7, 12]];
  for (const [dx, dy] of limb) {
    p.px(ox + dx, oy + dy, 'Y');
    p.px(ox + dx, oy + dy + 1, 'r');
    p.px(ox + dx, oy + dy + 2, 'R');
    const right = ox + 16 - dx;
    p.px(right, oy + dy, 'Y');
    p.px(right, oy + dy + 1, 'r');
    p.px(right, oy + dy + 2, 'R');
  }
  p.fill(ox, oy + 19, 3, 2, 'N');
  p.fill(ox + 14, oy + 19, 3, 2, 'N');
  p.px(ox, oy + 19, 'n');
  p.px(ox + 16, oy + 19, 'n');
  p.hline(ox + 3, oy + 13, 11, 'N');
  p.px(cx, oy + 13, 'n');
  p.px(cx, y0, 'W');
  p.px(cx - 1, y0 + 1, 'n');
  p.px(cx, y0 + 1, 'M');
  p.px(cx + 1, y0 + 1, 'n');
  p.vline(cx, y0 + 2, 8, 'N');
  p.vline(cx + 1, y0 + 2, 8, 'k');
  p.px(cx - 2, y0 + 9, 'Y');
  p.px(cx - 1, y0 + 8, 'r');
  p.px(cx + 2, y0 + 8, 'r');
  p.px(cx + 3, y0 + 9, 'Y');
  if (rank >= 3) p.px(cx, Math.max(0, y0 - 1), 'h');
  if (rank >= 4) p.px(cx + 1, Math.max(0, y0 - 1), 'W');
}

function drawEmberBowl(p, cx, top, flameH, wide) {
  drawFlame(p, cx, top, flameH, 'fire');
  const rim = top + flameH;
  const depth = Math.max(6, 27 - rim);
  for (let i = 0; i < depth; i++) {
    const t = depth <= 1 ? 0 : i / (depth - 1);
    const half = Math.max(3, Math.round(wide * (1 - t * 0.2)));
    const y = rim + i;
    if (y > 29) break;
    let color = 'F';
    if (i === 0) color = 'n';
    else if (i === 2 || i === Math.floor(depth * 0.55)) color = 'X';
    else if (i === depth - 1) color = 'k';
    p.hline(cx - half, y, half * 2 + 1, color);
    if (color === 'F') p.px(cx - half + 1, y, 'u');
    if (i === 1) {
      p.px(cx - 1, y, p.frame % 2 ? 'a' : 'A');
      p.px(cx + 1, y, 'f');
    }
  }
  const baseY = Math.min(30, rim + depth);
  if (baseY <= 30) {
    const bw = Math.max(4, wide * 2 - 3);
    const bx = cx - Math.floor(bw / 2);
    p.fill(bx, baseY, bw, Math.max(1, 31 - baseY), 'N');
    p.hline(bx, baseY, bw, 'n');
  }
}

function drawCrystalMount(p, cx, top, height, wide) {
  const tall = Math.max(14, Math.min(height, 27 - top));
  drawCrystal(p, cx, top, tall, wide);
  const seat = top + tall;
  if (seat <= 30) {
    p.hline(cx - 4, seat, 9, 'N');
    p.px(cx - 4, seat, 'M');
    p.px(cx + 4, seat, 'M');
    if (seat + 1 <= 30) p.fill(cx - 2, seat + 1, 5, 30 - seat, 'I');
  }
}

function drawSparkColumn(p, cx, top, rank) {
  const sag = p.frame % 2;
  const rise = rank >= 4 ? 0 : 1;
  drawZig(p, [
    [cx, top + rise],
    [cx + 4, top + 3],
    [cx - 3, top + 6],
    [cx + 3, top + 9 + sag],
    [cx, top + 12]
  ], 'Z', 'W');
  drawSparks(p, [[cx - 4, top + 4], [cx + 4, top + 7], [cx, top + rise]]);
  drawCoils(p, cx, top + 13, 3, 4);
  p.fill(cx - 4, 26, 9, 4, 'X');
  p.hline(cx - 4, 26, 9, 'U');
  p.px(cx, 27, p.frame % 2 ? 'Z' : 'u');
  if (rank >= 4) p.px(cx + (p.frame % 2 ? 4 : -4), top + 2, 'h');
}

function drawVial(p, cx, top, liquid, rank) {
  p.fill(cx - 1, top, 3, 2, 'Y');
  p.px(cx, top, rank >= 4 ? 'h' : 'y');
  p.fill(cx - 1, top + 2, 3, 3, 'r');
  p.px(cx - 1, top + 2, 'R');
  p.px(cx + 1, top + 3, 'Y');
  p.fill(cx - 1, top + 5, 3, 2, 'O');
  p.vline(cx - 1, top + 5, 2, 'o');
  p.vline(cx + 1, top + 5, 2, 'o');
  oval(p, cx, top + 12, 6, 6, 'O');
  oval(p, cx, top + 13, 4.3, 4, liquid, (_x, y) => y >= top + 11);
  p.hline(cx - 3, top + 11, 7, liquid === 'g' ? 'Q' : 'L');
  p.px(cx - 4, top + 10, 'W');
  p.px(cx - 3, top + 12, 'q');
  const bubble = top + 14 + ((p.frame + 4) % 3);
  p.px(cx + 2, bubble, 'W');
  if (rank >= 3) p.px(cx - 1, bubble + 1, 'q');
  const foot = top + 18;
  if (foot <= 30) {
    p.fill(cx - 3, foot, 7, Math.max(1, 30 - foot), 'x');
    p.hline(cx - 3, foot, 7, 'o');
  }
  p.px(cx, Math.min(29, top + 17), p.frame % 2 ? 'Q' : 'g');
}

function drawBanner(p, ox, top, clothW, clothH) {
  const poleTop = top + 3;
  p.vline(ox, poleTop, Math.max(4, 31 - poleTop), 'n');
  p.vline(ox + 1, poleTop + 1, Math.max(3, 30 - poleTop), 'N');
  p.fill(ox - 1, top, 4, 3, 'H');
  p.px(ox, top, p.frame % 2 ? 'W' : 'h');
  p.px(ox + 1, top + 1, 'b');
  drawFlag(p, ox + 2, top + 4, clothW, clothH);
}

function paintFire(p, rank) {
  const flameH = rank >= 4 ? 14 : 12;
  const wide = rank >= 3 ? 8 : 7;
  drawEmberBowl(p, 20, 1, flameH, wide);
  if (rank >= 2) {
    p.px(20 - 4, 1 + flameH, 'b');
    p.px(20 + 4, 1 + flameH, 'b');
  }
  if (rank >= 4) p.px(20, 0, 'W');
}

function paintFrost(p, rank) {
  const wide = rank >= 3 ? 7 : 6;
  const tall = rank >= 4 ? 24 : 22;
  p.fill(12, 24, 16, 6, 'I');
  p.hline(11, 24, 18, 'i');
  p.hline(13, 29, 14, 'N');
  p.px(14, 25, 'l');
  p.px(25, 26, 'L');
  p.px(20, 27, p.frame % 2 ? 'W' : 'l');
  if (rank >= 2) {
    p.px(11, 24, 'b');
    p.px(28, 24, 'b');
  }
  drawCrystal(p, 20, 1, tall, wide);
}

function paintLightning(p, rank) {
  const sag = p.frame === 2 ? 1 : 0;
  drawZig(p, [[20, 1], [31, 5], [11, 9], [29, 13], [15, 17 + sag]], 'Z', 'W');
  drawSparks(p, [[9, 4], [33, 7], [10, 13], [32, 15], [20, 2]]);
  drawCoils(p, 20, 18, 3, 4);
  p.hline(12, 29, 16, 'U');
  p.vline(13, 26, 5, 'V');
  p.vline(26, 26, 5, 'V');
  p.px(15, 27, 'Z');
  p.px(24, 28, 'v');
  if (rank >= 3) p.px(20, 0, 'h');
  if (rank >= 4) {
    p.px(8, 6, 'W');
    p.px(34, 10, 'z');
  }
}

function paintPoison(p, rank) {
  drawFlask(p, 18, 2, 'g', 'E');
  if (rank >= 2) {
    p.px(14, 8, 'Q');
    p.px(24, 8, 'Q');
  }
  if (rank >= 4) {
    p.px(20, 30, 'Q');
    p.px(21, 29, 'g');
  }
  p.hline(14, 30, 12, 'o');
}

function paintSupport(p, rank) {
  p.vline(12, 3, 28, 'n');
  p.vline(13, 4, 26, 'N');
  p.fill(11, 2, 4, 3, 'H');
  p.px(12, 2, p.frame % 2 ? 'W' : 'h');
  drawFlag(p, 15, 6, 16, 15);
  p.fill(15, 22, 4, 3, 'B');
  p.px(16, 23, 'H');
  const pulse = 28 + (p.frame % 2);
  p.px(16, pulse, 'D');
  p.px(20, pulse, 't');
  p.px(24, 28, p.frame === 0 ? 'E' : 'D');
  if (rank >= 3) p.hline(15, 6, 16, 'H');
  if (rank >= 4) p.px(13, 1, 'W');
}

function paintCinderQuarrel(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
}

function paintHailSpike(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawCrystalMount(p, 29, 2, rank >= 4 ? 25 : 23, 6);
}

function paintStormLance(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawSparkColumn(p, 28, 1, rank);
}

function paintVenomSpine(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawVial(p, 29, 4, 'g', rank);
}

function paintSignalShot(p, rank) {
  drawCoupling(p, rank);
  drawCompactBow(p, 0, 2, rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintSteamVent(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
  p.px(18, 7 + (p.frame % 3), 'l');
  p.px(20, 10, 'E');
  p.px(19, 12, p.frame % 2 ? 'L' : 'a');
  p.px(21, 14, 'A');
}

function paintPlasmaBrazier(p, rank) {
  drawCoupling(p, rank);
  drawEmberBowl(p, 10, 1, rank >= 4 ? 11 : 10, 5);
  drawSparkColumn(p, 29, 1, rank);
}

function paintBlightKiln(p, rank) {
  drawCoupling(p, rank);
  drawEmberBowl(p, 10, 1, rank >= 4 ? 11 : 10, 5);
  drawVial(p, 29, 4, 'g', rank);
  p.px(16, 12, 'Q');
  p.px(18, 15, 'g');
  p.px(22, 18, p.frame % 2 ? 'Q' : 'q');
}

function paintWarBeacon(p, rank) {
  drawCoupling(p, rank);
  drawBanner(p, 1, 2, 12, rank >= 4 ? 15 : 13);
  drawEmberBowl(p, 29, 1, rank >= 4 ? 11 : 10, 5);
}

function paintPrismCoil(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawSparkColumn(p, 29, 1, rank);
  p.px(16, 10, 'Z');
  p.px(18, 13, p.frame % 2 ? 'W' : 'z');
}

function paintRimeUrn(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 22 : 20, 5);
  drawVial(p, 29, 4, 'g', rank);
  p.px(24, 16, 'L');
  p.px(33, 18, 'l');
}

function paintWardBell(p, rank) {
  drawCoupling(p, rank);
  drawCrystalMount(p, 10, 2, rank >= 4 ? 24 : 22, 6);
  drawBanner(p, 21, 2, 13, 14);
}

function paintAcidArc(p, rank) {
  drawCoupling(p, rank);
  drawSparkColumn(p, 10, 1, rank);
  drawVial(p, 29, 4, 'g', rank);
  const sag = p.frame % 2;
  drawZig(p, [[15, 7], [20, 4 - sag], [25, 7]], 'Z', 'Q');
}

function paintRelayStandard(p, rank) {
  drawCoupling(p, rank);
  drawSparkColumn(p, 10, 1, rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintPlagueAltar(p, rank) {
  drawCoupling(p, rank);
  drawVial(p, 10, 4, 'g', rank);
  drawBanner(p, 21, 2, 13, rank >= 4 ? 15 : 13);
}

function paintReliquary(p, rank, accent) {
  const gem = PALETTE[accent] ? accent : 'b';
  speckle(p, 11, 16, 18, 14, 'x', 'X', 'w');
  p.fill(12, 12, 16, 5, 'X');
  p.px(14, 11, 'N');
  p.px(25, 11, 'N');
  p.px(16, 10, 'n');
  p.px(23, 10, 'n');
  p.hline(15, 9, 10, 'N');
  p.fill(17, 18, 6, 7, gem);
  p.px(18, 19, 'W');
  p.px(21, 22, 'h');
  p.fill(18, 20, 4, 4, 'K');
  p.vline(19, 21, 3, gem);
  p.fill(13, 24, 5, 5, 'N');
  p.fill(14, 25, 3, 3, 'n');
  p.px(15, 26, p.frame % 2 ? 'M' : 'b');
  p.px(12, 18, 'b');
  p.px(27, 18, 'b');
  if (rank >= 3) {
    p.px(16, 14, 'H');
    p.px(23, 14, 'H');
  }
  if (rank >= 4) p.px(20, 8, 'h');
}

function paintGrid(visual, rank, stars, frame) {
  const p = createPainter(frame);
  if (visual.family === 'hero') paintHero(p);
  else if (visual.family === 'tower') (TOWER_PAINTERS[visual.key] || paintReliquary)(p, rank, visual.accent);
  else if (visual.family === 'hybrid') (HYBRID_PAINTERS[visual.key] || paintReliquary)(p, rank, visual.accent);
  else paintReliquary(p, rank, visual.accent);
  if (visual.family !== 'hero') {
    drawPlinth(p, rank);
    if (rank >= 4) {
      p.px(14, 30, 'H');
      p.px(25, 30, 'H');
      p.px(15, 29, 'h');
      p.px(24, 29, 'h');
    }
  }
  applyOutline(p.cells);
  if (visual.family === 'hero') {
    drawHeroSeal(p);
    drawStars(p, stars);
  } else {
    drawRankGems(p, rank);
    if (visual.key.includes('+')) drawLineage(p, visual.key);
  }
  drawShadow(p);
  return p.cells;
}

function getSprite(visual, rank, stars, frame) {
  const key = `${visual.family}|${visual.key}|${rank}|${stars}|${frame}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const grid = paintGrid(visual, rank, stars, frame);
  const sprite = {grid, canvas: rasterize(grid), width: W, height: H};
  cache.set(key, sprite);
  if (cache.size > 480) cache.delete(cache.keys().next().value);
  return sprite;
}

function createSurface(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try { return new OffscreenCanvas(width, height); } catch { /* fall through */ }
  }
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === 'function') {
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function rasterize(grid) {
  const canvas = createSurface(W, H);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { context.imageSmoothingEnabled = false; } catch { /* ignore */ }
  blitGrid(context, grid, 0, 0, W, H);
  return canvas;
}

function blit(ctx, sprite, dx, dy, dw, dh) {
  if (sprite.canvas && typeof ctx.drawImage === 'function') {
    ctx.drawImage(sprite.canvas, dx, dy, dw, dh);
    return;
  }
  blitGrid(ctx, sprite.grid, dx, dy, dw, dh);
}

function blitGrid(ctx, grid, dx, dy, dw, dh) {
  if (typeof ctx.fillRect !== 'function') return;
  for (let y = 0; y < H; y++) {
    const row = grid[y];
    const y0 = Math.round(dy + (y * dh) / H);
    const y1 = Math.round(dy + ((y + 1) * dh) / H);
    const ph = Math.max(1, y1 - y0);
    for (let x = 0; x < W; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      const x0 = Math.round(dx + (x * dw) / W);
      const x1 = Math.round(dx + ((x + 1) * dw) / W);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), ph);
    }
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
 * Event names: shot, hit, kill, fence_hit, merge, draft, victory, defeat, ui.
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
 */


const MAX_PARTICLES = 140;
const MAX_FLOATERS = 18;
const MAX_RINGS = 16;
const SCAN_LIMIT = 400;

const LIMITS = Object.freeze({
  shot: 8,
  hit: 12,
  kill: 8,
  fence_hit: 4,
  merge: 3,
  draft: 2,
  victory: 1,
  defeat: 1,
  ui: 4,
  status: 6,
  boss: 1,
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
  frost: 'frost',
  slow: 'frost',
  lightning: 'lightning',
  stun: 'lightning',
  brittle: 'brittle',
  poison: 'poison',
  support: 'support',
  aura: 'support',
  heal: 'support',
  buff: 'support',
  hero: 'hero',
});

const FEEDBACK = new Set([
  'shot', 'hit', 'kill', 'fence_hit', 'merge', 'draft',
  'victory', 'defeat', 'ui', 'status', 'boss',
]);

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
  merged: 'merge',
  merge_units: 'merge',
  draft_open: 'draft',
  win: 'victory',
  lose: 'defeat',
  lost: 'defeat',
  click: 'ui',
  button: 'ui',
  boss_spawn: 'boss',
  boss_enter: 'boss',
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

/**
 * Pure description of one feedback event. Returns null when the event is not visual/audio feedback.
 * @param {object} event
 */
function describeFeedback(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const resolved = resolveKind(event);
  if (!resolved) return null;
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

  function pushRing(x, y, radius, grow, color, life, weight) {
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
    const recent = findFloater(anchorX, anchorY, channel, crit);
    if (recent) {
      recent.amount = (recent.amount || 0) + amount;
      const merged = formatDamage(recent.amount);
      if (merged) recent.text = channel === 'heal' ? `+${merged}` : merged;
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
      channel,
      amount,
      vy: -22,
      life,
      maxLife: life,
    });
  }

  function findFloater(x, y, channel, crit) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const floater = floaters[i];
      if (floater.channel !== channel || floater.crit !== crit) continue;
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
      pushFloater(
        x, y - lift, text,
        desc.crit ? '#ffe56a' : palette.hot,
        desc.crit ? 3 : 2,
        desc.crit,
        'hit',
        desc.crit ? 0.62 : 0.5,
        seed,
      );
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

  function spawnBoss(desc, seed) {
    const point = visualPoint(desc);
    if (!point) return;
    pushRing(point.x, point.y, 12, 18, PALETTES.boss.hot, 0.46);
    pushPlus(point.x, point.y, 4, PALETTES.boss.core, PALETTES.boss.hot, 0.28);
    burst(point.x, point.y, 6, 40, 0, false, PALETTES.boss.mid, 0.3, seed, 2);
  }

  function spawn(desc, index) {
    const seed = nextSeed(desc, index);
    switch (desc.type) {
      case 'shot': spawnShot(desc, seed); break;
      case 'hit': spawnHit(desc, seed); break;
      case 'kill': spawnKill(desc, seed); break;
      case 'fence_hit': spawnFence(desc, seed); break;
      case 'merge': spawnMerge(desc, seed); break;
      case 'draft': spawnDraft(desc); break;
      case 'victory': spawnVictory(desc, seed); break;
      case 'defeat': spawnDefeat(desc, seed); break;
      case 'ui': spawnUi(desc); break;
      case 'status': spawnStatus(desc, seed); break;
      case 'boss': spawnBoss(desc, seed); break;
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

  function drawPixelRing(ctx, x, y, radius, color, alpha, weight) {
    if (!(radius > 0) || alpha < 0.02) return;
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
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const px = -uy;
    const py = ux;
    const len = particle.length | 0;
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
    const ox = Math.round(particle.x);
    const oy = Math.round(particle.y);
    const ux = particle.ux | 0;
    const uy = particle.uy | 0;
    if (ux === 0 && uy === 0) return;
    const px = -uy;
    const py = ux;
    const len = particle.length | 0;
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
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    const radius = Math.max(5, particle.radius | 0);
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
    const cx = Math.round(particle.x);
    const cy = Math.round(particle.y);
    let arm = Math.max(3, particle.arm | 0);
    if (short) arm = particle.crit ? 4 : 3;
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
      if (short) {
        ctx.fillRect(cx - 2, cy - 2, 1, 1);
        ctx.fillRect(cx + 2, cy - 2, 1, 1);
        ctx.fillRect(cx - 2, cy + 2, 1, 1);
        ctx.fillRect(cx + 2, cy + 2, 1, 1);
      }
    }
  }

  function drawNotch(ctx, particle, alpha) {
    if (alpha < 0.02) return;
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
    const size = particle.life < particle.maxLife * 0.35 ? 1 : (particle.size || 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x - size / 2), Math.round(particle.y - size / 2), size, size);
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
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = particle.color;
    const y = Math.round(particle.y);
    for (let x = 8; x < ARENA.width - 8; x += 3) {
      if (particle.broken && x % 9 === 0) continue;
      const jag = particle.broken && x % 12 < 4 ? 1 : 0;
      ctx.fillRect(x, y + jag, 2, 1);
    }
  }

  function drawText(ctx, text, x, y, color, scale, alpha) {
    if (!text || alpha < 0.02) return;
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
    drawText(ctx, floater.text, x, y, floater.color, floater.scale, alpha);
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
      try { ctx.imageSmoothingEnabled = false; } catch { /* partial mock contexts */ }
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        drawPixelRing(ctx, ring.x, ring.y, reduced ? ring.r0 : ring.r, ring.color, fade(ring) * 0.95, ring.weight);
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
 * Original enemy sprites. Bottom-center anchor, one logical pixel per cell.
 * enemySize is the opaque grid drawEnemy paints. Walk and attack frames
 * share that box. Hit flash stays a flat wash. No simulation state is touched.
 *
 * Each kind keeps one opaque box on every frame:
 * shambler 22×26, runner 18×24, brute 32×34, armored 26×30,
 * spitter 22×26, swarm 12×14, boss 48×52.
 * A light rim (palette k) is the outer pixel so the shape reads on #122128.
 * enemy.enraged on a boss repaints the crown and core hotter inside that box.
 */
const PALETTES = {
  shambler: {k: '#efe6d2', '#': '#2a241c', o: '#8c8374', h: '#d9d0c0', e: '#f4e27a', s: '#1a1612'},
  runner: {k: '#ffe0b8', '#': '#4a240e', o: '#e08a3a', h: '#fff0d0', e: '#fff6d8', s: '#2a1408'},
  brute: {k: '#f0c0b4', '#': '#3a1410', o: '#a84838', h: '#f4d0c4', e: '#ffe0a0', s: '#1a0c0a'},
  armored: {k: '#f4f7fb', '#': '#1c2430', o: '#8a96a4', h: '#ffffff', e: '#9fd0ea', s: '#10141a'},
  spitter: {k: '#d8f0b0', '#': '#142818', o: '#3f7a48', h: '#c6ee78', e: '#e8f58a', s: '#0c140c'},
  swarm: {k: '#f4e2b4', '#': '#3a2810', o: '#c4a05a', h: '#fff0c0', e: '#fff6d0', s: '#1a1208'},
  boss: {k: '#f4c8dc', '#': '#1a0c14', o: '#7a3058', h: '#f0d0a0', e: '#ffe08a', r: '#e24a3a', s: '#10080c', f: '#ff2e14', c: '#ffd000', w: '#fff6c4'}
};

function makeGrid(width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(Array(width).fill('.'));
  return {
    width,
    height,
    rows,
    put(x, y, ink) {
      const ix = x | 0;
      const iy = y | 0;
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
      rows[iy][ix] = ink;
    }
  };
}

function fillEllipse(grid, cx, cy, rx, ry, ink) {
  const radiusX = rx | 0;
  const radiusY = ry | 0;
  if (radiusX < 0 || radiusY < 0) return;
  for (let y = cy - radiusY; y <= cy + radiusY; y += 1) {
    for (let x = cx - radiusX; x <= cx + radiusX; x += 1) {
      const dx = radiusX === 0 ? (x === cx ? 0 : 2) : (x - cx) / radiusX;
      const dy = radiusY === 0 ? (y === cy ? 0 : 2) : (y - cy) / radiusY;
      if (dx * dx + dy * dy <= 1) grid.put(x, y, ink);
    }
  }
}

function eraseEllipse(grid, cx, cy, rx, ry) {
  fillEllipse(grid, cx, cy, rx, ry, '.');
}

function glaze(grid, cx, cy, rx, ry, ink) {
  const radiusX = rx | 0;
  const radiusY = ry | 0;
  if (radiusX < 0 || radiusY < 0) return;
  for (let y = cy - radiusY; y <= cy + radiusY; y += 1) {
    for (let x = cx - radiusX; x <= cx + radiusX; x += 1) {
      const ix = x | 0;
      const iy = y | 0;
      if (iy < 0 || ix < 0 || iy >= grid.height || ix >= grid.width) continue;
      const prev = grid.rows[iy][ix];
      if (prev === '.' || prev === 'e' || prev === 'r') continue;
      const dx = radiusX === 0 ? 0 : (ix - cx) / radiusX;
      const dy = radiusY === 0 ? 0 : (iy - cy) / radiusY;
      if (dx * dx + dy * dy <= 1) grid.put(ix, iy, ink);
    }
  }
}

function limb(grid, x0, y0, x1, y1, r0, r1, ink) {
  let x = x0 | 0;
  let y = y0 | 0;
  const xEnd = x1 | 0;
  const yEnd = y1 | 0;
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  const total = Math.max(dx, dy, 1);
  let walked = 0;
  const stamp = () => {
    const t = Math.min(1, walked / total);
    const radius = Math.max(0, Math.round(r0 + (r1 - r0) * t));
    fillEllipse(grid, x, y, radius, radius, ink);
    walked += 1;
  };
  stamp();
  while (x !== xEnd || y !== yEnd) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      stamp();
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
      stamp();
    }
  }
}

function bresenham(x0, y0, x1, y1, plot) {
  let x = x0 | 0;
  let y = y0 | 0;
  const xEnd = x1 | 0;
  const yEnd = y1 | 0;
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  plot(x, y);
  while (x !== xEnd || y !== yEnd) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    plot(x, y);
  }
}

function fillPoly(grid, points, ink) {
  const n = points.length;
  if (n < 3) return;
  let minY = points[0][1];
  let maxY = points[0][1];
  for (let i = 1; i < n; i += 1) {
    if (points[i][1] < minY) minY = points[i][1];
    if (points[i][1] > maxY) maxY = points[i][1];
  }
  for (let y = minY; y <= maxY; y += 1) {
    const nodes = [];
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      const yi = points[i][1];
      const yj = points[j][1];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        const xi = points[i][0];
        const xj = points[j][0];
        nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const x0 = Math.ceil(nodes[i]);
      const x1 = Math.floor(nodes[i + 1]);
      for (let x = x0; x <= x1; x += 1) grid.put(x, y, ink);
    }
  }
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    bresenham(a[0], a[1], b[0], b[1], (x, y) => grid.put(x, y, ink));
  }
}

function applyRim(grid) {
  const {width, height, rows} = grid;
  const src = rows.map((row) => row.slice());
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ink = src[y][x];
      if (ink === '.' || ink === 'e' || ink === 'r') continue;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
        || src[y - 1][x] === '.'
        || src[y + 1][x] === '.'
        || src[y][x - 1] === '.'
        || src[y][x + 1] === '.';
      if (edge) rows[y][x] = 'k';
    }
  }
}

function sprite(width, height, paint) {
  const grid = makeGrid(width, height);
  paint(grid);
  applyRim(grid);
  return grid.rows.map((row) => row.join(''));
}

function eye(grid, x, y) {
  for (let dx = 0; dx < 2; dx += 1) {
    const px = x + dx;
    if (y < 0 || px < 0 || y >= grid.height || px >= grid.width) continue;
    if (grid.rows[y][px] === '.') continue;
    grid.put(px, y, 'e');
  }
}

function over(grid, x, y, ink) {
  if (y < 0 || x < 0 || y >= grid.height || x >= grid.width) return;
  if (grid.rows[y][x] === '.' || grid.rows[y][x] === 'e' || grid.rows[y][x] === 'r') return;
  grid.put(x, y, ink);
}

function seam(grid, x, y, length) {
  if (y < 0 || y >= grid.height) return;
  for (let i = 0; i < length; i += 1) {
    const px = x + i;
    if (px < 0 || px >= grid.width) continue;
    const prev = grid.rows[y][px];
    if (prev === '.' || prev === 'e' || prev === 'r') continue;
    grid.put(px, y, '#');
  }
}

function shambler(step, attack) {
  return sprite(22, 26, (grid) => {
    fillEllipse(grid, 8, 7, 6, 8, 'o');
    fillEllipse(grid, 14, 15, 3, 3, 'o');
    glaze(grid, 7, 4, 3, 2, 'h');
    over(grid, 8, 3, 'h');
    over(grid, 8, 6, '#');
    eye(grid, 12, 15);
    eye(grid, 14, 15);
    seam(grid, 12, 14, 4);
    if (attack) {
      over(grid, 13, 17, '#');
      over(grid, 14, 17, '#');
      over(grid, 15, 17, '#');
    } else {
      seam(grid, 13, 17, 3);
    }
    fillEllipse(grid, 10, 19, 3, 3, 'o');
    const lift = attack ? 12 : 19;
    limb(grid, 4, 12, 2, lift, 1, 1, 'o');
    limb(grid, 13, 14, 19, 19, 1, 1, 'o');
    fillEllipse(grid, 1, lift, 2, 2, 'o');
    fillEllipse(grid, 20, 19, 2, 2, 'o');
    glaze(grid, 1, lift - 1, 1, 0, 'h');
    glaze(grid, 20, 18, 1, 0, 'h');
    const spread = step ? 2 : 0;
    limb(grid, 8, 21, 7 - spread, 24, 1, 1, 'o');
    limb(grid, 13, 21, 14 + spread, 24, 1, 1, 'o');
    fillEllipse(grid, 7 - spread, 24, 2, 1, 'o');
    fillEllipse(grid, 14 + spread, 24, 2, 1, 'o');
    eraseEllipse(grid, 11, 23, 1, 2);
  });
}

function runner(step, attack) {
  return sprite(18, 24, (grid) => {
    limb(grid, 8, 0, 8, 4, 0, 0, 'h');
    fillEllipse(grid, 8, 6, 2, 2, 'o');
    fillEllipse(grid, 9, 10, 1, 2, 'o');
    fillEllipse(grid, 9, 13, 2, 1, 'o');
    glaze(grid, 8, 5, 1, 1, 'h');
    eye(grid, 7, 6);
    if (attack) {
      over(grid, 7, 8, '#');
      over(grid, 8, 8, '#');
      over(grid, 9, 8, '#');
    } else {
      over(grid, 8, 7, '#');
    }
    const leftY = attack ? 6 : (step ? 5 : 11);
    const rightY = attack ? 13 : (step ? 12 : 6);
    limb(grid, 8, 9, 0, leftY, 0, 0, 'o');
    limb(grid, 10, 9, 17, rightY, 0, 0, 'o');
    fillEllipse(grid, 0, leftY, 1, 1, 'h');
    fillEllipse(grid, 17, rightY, 1, 1, 'h');
    seam(grid, 8, 11, 3);
    const knee = step ? 2 : -2;
    limb(grid, 7, 14, 6 + knee, 18, 1, 1, 'o');
    limb(grid, 6 + knee, 18, 6, 22, 1, 0, 'o');
    limb(grid, 11, 14, 12 - knee, 18, 1, 1, 'o');
    limb(grid, 12 - knee, 18, 12, 22, 1, 0, 'o');
    fillEllipse(grid, 6, 22, 1, 1, 'o');
    fillEllipse(grid, 12, 22, 1, 1, 'o');
    eraseEllipse(grid, 9, 20, 1, 3);
  });
}

function brute(step, attack) {
  return sprite(32, 34, (grid) => {
    fillEllipse(grid, 16, 4, 5, 5, 'o');
    fillEllipse(grid, 16, 15, 9, 6, 'o');
    fillEllipse(grid, 16, 23, 7, 4, 'o');
    glaze(grid, 14, 3, 2, 1, 'h');
    seam(grid, 13, 3, 6);
    eye(grid, 13, 5);
    eye(grid, 17, 5);
    over(grid, 15, 7, '#');
    over(grid, 17, 7, '#');
    if (attack) {
      over(grid, 15, 8, '#');
      over(grid, 16, 8, '#');
      over(grid, 17, 8, '#');
    } else {
      seam(grid, 15, 8, 3);
    }
    const fistY = attack ? 11 : 16;
    limb(grid, 11, 14, 6, fistY, 2, 1, 'o');
    limb(grid, 21, 14, 25, 16, 2, 1, 'o');
    fillEllipse(grid, 3, fistY, 3, 4, 'o');
    fillEllipse(grid, 28, 16, 3, 4, 'o');
    glaze(grid, 3, fistY - 2, 2, 1, 'h');
    glaze(grid, 28, 14, 2, 1, 'h');
    seam(grid, 2, fistY - 1, 3);
    seam(grid, 27, 15, 3);
    const spread = step ? 2 : 0;
    limb(grid, 12, 26, 10 - spread, 32, 2, 2, 'o');
    limb(grid, 20, 26, 22 + spread, 32, 2, 2, 'o');
    fillEllipse(grid, 10 - spread, 32, 3, 1, 'o');
    fillEllipse(grid, 22 + spread, 32, 3, 1, 'o');
    eraseEllipse(grid, 16, 31, 2, 2);
  });
}

function armored(step, attack) {
  return sprite(26, 30, (grid) => {
    fillEllipse(grid, 13, 6, 5, 7, 'o');
    fillEllipse(grid, 3, 12, 3, 3, 'o');
    fillEllipse(grid, 22, 12, 3, 3, 'o');
    limb(grid, 8, 11, 5, 12, 1, 1, 'o');
    limb(grid, 18, 11, 20, 12, 1, 1, 'o');
    fillEllipse(grid, 13, 18, 4, 5, 'o');
    fillEllipse(grid, 13, 22, 5, 2, 'o');
    glaze(grid, 12, 3, 2, 1, 'h');
    glaze(grid, 2, 11, 1, 1, 'h');
    glaze(grid, 23, 11, 1, 1, 'h');
    seam(grid, 10, 16, 6);
    seam(grid, 11, 19, 4);
    over(grid, 12, 17, 'h');
    over(grid, 13, 20, 'h');
    seam(grid, 10, 7, 6);
    const slit = attack ? 'h' : 'e';
    for (let x = 10; x <= 15; x += 1) over(grid, x, 8, slit);
    if (attack) {
      for (let x = 11; x <= 14; x += 1) over(grid, x, 9, 'e');
    }
    seam(grid, 10, 9, 6);
    const punch = attack ? 22 : 18;
    limb(grid, 3, 14, 2, punch, 1, 1, 'o');
    limb(grid, 22, 14, 23, 18, 1, 1, 'o');
    fillEllipse(grid, 2, punch, 2, 2, 'o');
    fillEllipse(grid, 23, 18, 2, 2, 'o');
    glaze(grid, 2, punch - 1, 1, 0, 'h');
    glaze(grid, 23, 17, 1, 0, 'h');
    const spread = step ? 1 : 0;
    limb(grid, 11, 23, 9 - spread, 28, 2, 1, 'o');
    limb(grid, 15, 23, 17 + spread, 28, 2, 1, 'o');
    fillEllipse(grid, 9 - spread, 28, 2, 1, 'o');
    fillEllipse(grid, 17 + spread, 28, 2, 1, 'o');
    eraseEllipse(grid, 13, 27, 1, 2);
  });
}

function spitter(step, attack) {
  return sprite(22, 26, (grid) => {
    fillEllipse(grid, 11, 4, 3, 4, 'o');
    fillEllipse(grid, 11, 12, 8, 6, 'h');
    fillEllipse(grid, 2, 12, 2, 3, 'h');
    fillEllipse(grid, 19, 12, 2, 3, 'h');
    if (!attack) {
      glaze(grid, 11, 11, 3, 2, 'e');
      seam(grid, 9, 12, 2);
      seam(grid, 13, 14, 2);
    }
    eye(grid, 9, 4);
    eye(grid, 12, 4);
    if (attack) {
      over(grid, 10, 6, '#');
      over(grid, 11, 6, 'e');
      over(grid, 12, 6, 'e');
      over(grid, 13, 6, '#');
    } else {
      seam(grid, 10, 6, 3);
    }
    fillEllipse(grid, 11, 18, 3, 2, 'o');
    const spread = step ? 2 : 0;
    limb(grid, 9, 19, 7 - spread, 24, 1, 0, 'o');
    limb(grid, 13, 19, 15 + spread, 24, 1, 0, 'o');
    fillEllipse(grid, 7 - spread, 24, 1, 1, 'o');
    fillEllipse(grid, 15 + spread, 24, 1, 1, 'o');
    eraseEllipse(grid, 11, 23, 1, 2);
    if (attack) {
      const mark = (x, y, ink) => {
        if (y < 0 || x < 0 || y >= grid.height || x >= grid.width) return;
        if (grid.rows[y][x] === '.') return;
        grid.put(x, y, ink);
      };
      // Open sac: dark cavity in the belly, sap in the throat, drip toward the fence.
      const cavity = [[10, 1], [11, 2], [12, 3], [13, 4], [14, 3], [15, 2], [16, 1]];
      for (const [y, mid] of cavity) {
        for (let dx = -mid; dx <= mid; dx += 1) mark(11 + dx, y, '#');
      }
      for (let y = 12; y <= 14; y += 1) {
        mark(10, y, 'e');
        mark(11, y, 'e');
        mark(12, y, 'e');
      }
      for (let y = 15; y <= 19; y += 1) mark(11, y, 'e');
    }
  });
}

function swarm(step, attack) {
  return sprite(12, 14, (grid) => {
    const lift = attack ? 4 : (step ? 6 : 1);
    fillPoly(grid, [
      [3, 4], [0, lift], [0, lift + 3], [3, 8]
    ], 'h');
    fillPoly(grid, [
      [8, 4], [11, lift], [11, lift + 3], [8, 8]
    ], 'h');
    fillEllipse(grid, 5, 5, 2, 2, 'o');
    fillEllipse(grid, 5, 8, 2, 2, '#');
    limb(grid, 4, 4, 4, 0, 0, 0, 'o');
    limb(grid, 7, 4, 7, 0, 0, 0, 'o');
    eye(grid, 4, 5);
    if (attack) {
      over(grid, 5, 7, '#');
      over(grid, 6, 7, 'e');
    }
    limb(grid, 4, 9, 4, 13, 0, 0, 'o');
    limb(grid, 6, 9, 6, 13, 0, 0, 'o');
    if (step) {
      limb(grid, 4, 12, 3, 13, 0, 0, 'o');
      limb(grid, 6, 12, 8, 13, 0, 0, 'o');
    }
  });
}

function claw(grid, side, y, ink) {
  const x = side < 0 ? 0 : 47;
  const dir = side < 0 ? 1 : -1;
  fillPoly(grid, [
    [x, y],
    [x + dir * 2, y - 6],
    [x + dir * 4, y - 1],
    [x + dir * 6, y - 7],
    [x + dir * 8, y],
    [x + dir * 8, y + 4],
    [x, y + 4]
  ], ink);
}

function boss(step, attack, enraged = false) {
  const horn = enraged ? 'f' : '#';
  const crown = enraged ? 'c' : 'h';
  const coreShell = enraged ? 'f' : '#';
  const coreInk = enraged ? 'w' : 'r';
  const glint = enraged ? 'c' : 'h';
  return sprite(48, 52, (grid) => {
    fillPoly(grid, [
      [18, 20], [12, 28], [14, 34], [11, 42],
      [18, 44], [24, 42], [30, 44], [37, 42],
      [34, 34], [36, 28], [30, 20]
    ], 'o');
    fillEllipse(grid, 24, 18, 8, 8, 'o');
    fillPoly(grid, [
      [16, 20], [12, 14], [9, 8], [7, 3], [8, 0],
      [12, 2], [13, 8], [16, 14], [19, 18]
    ], horn);
    fillPoly(grid, [
      [31, 20], [35, 14], [38, 8], [40, 3], [39, 0],
      [35, 2], [34, 8], [31, 14], [28, 18]
    ], horn);
    fillPoly(grid, [[24, 0], [21, 14], [27, 14]], crown);
    fillPoly(grid, [[18, 4], [16, 14], [22, 13]], crown);
    fillPoly(grid, [[30, 4], [26, 13], [32, 14]], crown);
    seam(grid, 19, 15, 10);
    eye(grid, 19, 17);
    eye(grid, 26, 17);
    if (attack) {
      over(grid, 22, 21, '#');
      over(grid, 23, 21, '#');
      over(grid, 24, 21, '#');
      over(grid, 25, 21, '#');
    } else {
      seam(grid, 22, 21, 4);
    }
    const core = attack ? 6 : 4;
    fillEllipse(grid, 24, 31, core + 2, core + 3, coreShell);
    fillEllipse(grid, 24, 31, core, core + 1, coreInk);
    grid.put(22, 30, glint);
    grid.put(23, 29, glint);
    const clawY = attack ? 24 : 30;
    limb(grid, 14, 28, 8, clawY, 2, 2, 'o');
    limb(grid, 34, 28, 39, 30, 2, 2, 'o');
    claw(grid, -1, clawY, 'o');
    claw(grid, 1, 30, 'o');
    glaze(grid, 4, clawY, 2, 1, 'h');
    glaze(grid, 43, 29, 2, 1, 'h');
    const spread = step ? 2 : 0;
    limb(grid, 18, 42, 15 - spread, 50, 3, 3, 'o');
    limb(grid, 30, 42, 32 + spread, 50, 3, 3, 'o');
    fillEllipse(grid, 15 - spread, 50, 4, 1, 'o');
    fillEllipse(grid, 32 + spread, 50, 4, 1, 'o');
    eraseEllipse(grid, 24, 49, 2, 3);
  });
}

const SPRITES = {
  shambler: [shambler(0, false), shambler(1, false), shambler(0, true)],
  runner: [runner(0, false), runner(1, false), runner(0, true)],
  brute: [brute(0, false), brute(1, false), brute(0, true)],
  armored: [armored(0, false), armored(1, false), armored(0, true)],
  spitter: [spitter(0, false), spitter(1, false), spitter(0, true)],
  swarm: [swarm(0, false), swarm(1, false), swarm(0, true)],
  boss: [boss(0, false), boss(1, false), boss(0, true)]
};

const BOSS_ENRAGED = [boss(0, false, true), boss(1, false, true), boss(0, true, true)];

function rowsFor(enemy, time) {
  const kind = SPRITES[enemy?.kind] ? enemy.kind : 'shambler';
  const frames = kind === 'boss' && enemy?.enraged === true ? BOSS_ENRAGED : SPRITES[kind];
  const last = frames.length - 1;
  const attacking = enemy?.attacking === true;
  const frame = attacking || last === 0
    ? last
    : Math.floor((time || 0) * 6) % last;
  return {kind, rows: frames[frame] || frames[0]};
}

function enemySize(enemy) {
  const {rows} = rowsFor(enemy, 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < rows.length; y += 1) {
    const line = rows[y];
    for (let x = 0; x < line.length; x += 1) {
      const ink = line[x];
      if (ink === '.' || ink === ' ') continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return {width: 0, height: 0};
  return {width: maxX - minX + 1, height: maxY - minY + 1};
}

function drawEnemy(ctx, enemy, x, y, {time = 0, scale = 1, flash = 0} = {}) {
  if (!ctx) return;
  const {kind, rows} = rowsFor(enemy, time);
  const palette = PALETTES[kind] || PALETTES.shambler;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row];
    for (let col = 0; col < line.length; col += 1) {
      const ink = line[col];
      if (ink === '.' || ink === ' ') continue;
      if (col < minX) minX = col;
      if (row < minY) minY = row;
      if (col > maxX) maxX = col;
      if (row > maxY) maxY = row;
    }
  }
  if (maxX < 0) return;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const pixel = Math.max(1, Math.round(scale) || 1);
  const left = Math.round(x - (width * pixel) / 2);
  const top = Math.round(y - height * pixel);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let row = minY; row <= maxY; row += 1) {
    const line = rows[row];
    for (let col = minX; col <= maxX; col += 1) {
      const ink = line[col];
      if (ink === '.' || ink === ' ') continue;
      ctx.fillStyle = flash > 0.4 ? '#fff6d8' : (palette[ink] || palette['.']);
      ctx.fillRect(left + (col - minX) * pixel, top + (row - minY) * pixel, pixel, pixel);
    }
  }
  ctx.restore();
}

};
__ff_factories["src/render/renderer.js"] = function(__ff_exports, __ff_load) {
"use strict";
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
 * Fencefall battlefield renderer.
 *
 * Draws in ARENA logical pixels (360×640) into an offscreen buffer, then
 * nearest-neighbor blits that buffer into the canvas backing store. Hit
 * testing inverts the same rectangle, so touch and mouse match the picture.
 *
 * Simulation state and gameplay RNG are read-only. Presentation events come
 * from ingestEvents; this module never reads or drains state.events.
 * Changing runId clears leftover VFX, then replays events ingested since the
 * previous draw so a restart frame does not drop its own feedback.
 * A live stun, burn, poison, or slow tints that sprite. Stun wins, then burn, then poison, then slow.
 * A bilingual director or wave hint is drawn in the top margin.
 * The selected defender shows its rank just above the sprite.
 */








const LETTERBOX = '#0e171c';
const FIELD = '#122128';
const MAX_CUES = 48;
const MAX_BATCH = 200;
const MAX_PROJECTILES = 300;
const MAX_ENEMIES = 400;
const MAX_CLOUDS = 32;
const CUE_MS = 240;
const MERGE_CUE_MS = 900;
const FLASH_MS = 150;
const RANGE_LIMIT = 900;
const HP_FILL = 3;
const SPRITE_GAP = 3;
const STATUS_CELL = 7;
const STATUS_GAP = 2;

const PALETTE = {
  bolt: {main: '#f2d56a', core: '#fff6cf', edge: '#6e5424'},
  fire: {main: '#e25a2a', core: '#ffd36a', edge: '#5c220f'},
  frost: {main: '#9ed8ea', core: '#f4fdff', edge: '#24566c'},
  lightning: {main: '#ffe14a', core: '#fffceb', edge: '#7a6220'},
  poison: {main: '#6aaa3a', core: '#d8f0a0', edge: '#243814'},
  support: {main: '#f0d78a', core: '#fff8de', edge: '#6a5830'},
};

const ELEMENT_ALIAS = {
  bolt: 'bolt', physical: 'bolt', arrow: 'bolt', kinetic: 'bolt',
  fire: 'fire', burn: 'fire', flame: 'fire',
  frost: 'frost', ice: 'frost', cold: 'frost', slow: 'frost',
  lightning: 'lightning', shock: 'lightning', spark: 'lightning', chain: 'lightning',
  poison: 'poison', toxin: 'poison',
  support: 'support', heal: 'support', aura: 'support',
};

const STATUS_RANK = {stun: 0, burn: 1, poison: 2, slow: 3, brittle: 4};
const STATUS_TINT = {stun: '#f0d35a', burn: '#e25a2a', poison: '#6aaa3a', slow: '#9ed8ea'};
const TINT_ALPHA = 0.55;
const HINT_BAND = 42;
const HINT_MAX_LINES = 3;
const HINT_CHAR_LIMIT = 220;
// 3×5 rank digits, painted at 2× in the band above the selected sprite.
const RANK_DIGIT = [
  null,
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
];
let tintSurface = null;

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

function sharpen(ctx) {
  ctx.imageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
}

function isolate(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function plot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function context2d(target, opaque) {
  if (opaque) {
    try {
      const ctx = target.getContext('2d', {alpha: false});
      if (ctx) return ctx;
    } catch {
      /* The options bag is optional. */
    }
  }
  return target.getContext('2d');
}

function createScene() {
  const make = (scene) => {
    const ctx = scene ? context2d(scene, true) : null;
    return ctx ? {scene, ctx} : null;
  };
  try {
    if (typeof OffscreenCanvas === 'function') {
      const created = make(new OffscreenCanvas(ARENA.width, ARENA.height));
      if (created) return created;
    }
  } catch {
    /* OffscreenCanvas can exist but refuse a 2d context. */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = ARENA.width;
      canvas.height = ARENA.height;
      const created = make(canvas);
      if (created) return created;
    }
  } catch {
    /* Headless hosts draw directly to the display canvas. */
  }
  return {scene: null, ctx: null};
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

function measureEnemy(enemy) {
  let width = Math.max(16, Math.round((finite(enemy.radius) ?? 12) * 2));
  let height = width;
  const sized = enemySize(enemy);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function measureDefender(unit) {
  let width = 32;
  let height = 36;
  const sized = defenderSize(unit);
  if (sized && Number.isFinite(sized.width) && sized.width > 0) width = sized.width;
  if (sized && Number.isFinite(sized.height) && sized.height > 0) height = sized.height;
  return {width, height};
}

function slotBox(slot, index) {
  if (
    slot &&
    Number.isFinite(slot.left) &&
    Number.isFinite(slot.top) &&
    Number.isFinite(slot.width) &&
    Number.isFinite(slot.height)
  ) {
    return slot;
  }
  return slotGeometry(index);
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

function plotRing(ctx, cx, cy, x, y) {
  ctx.fillRect(cx + x, cy + y, 1, 1);
  ctx.fillRect(cx + y, cy + x, 1, 1);
  ctx.fillRect(cx - x, cy + y, 1, 1);
  ctx.fillRect(cx - y, cy + x, 1, 1);
  ctx.fillRect(cx + x, cy - y, 1, 1);
  ctx.fillRect(cx + y, cy - x, 1, 1);
  ctx.fillRect(cx - x, cy - y, 1, 1);
  ctx.fillRect(cx - y, cy - x, 1, 1);
}

function drawPixelCircle(ctx, cx, cy, radius, color) {
  const r = Math.round(radius);
  if (r <= 0) return;
  let x = r;
  let y = 0;
  let decision = 1 - r;
  ctx.fillStyle = color;
  while (x >= y) {
    plotRing(ctx, cx, cy, x, y);
    if (r > 2) plotRing(ctx, cx, cy, x - 1, y);
    y += 1;
    if (decision <= 0) decision += 2 * y + 1;
    else {
      x -= 1;
      decision += 2 * (y - x) + 1;
    }
  }
}

function drawHpBar(ctx, x, y, width, hp, maxHp, emphasize) {
  if (!Number.isFinite(hp)) return;
  const max = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : Math.max(hp, 1);
  const ratio = clamp(hp / max, 0, 1);
  const fillW = Math.max(0, Math.min(width, Math.round(width * ratio)));
  const plateY = y - 1;
  const plateH = HP_FILL + 2;
  ctx.fillStyle = '#101418';
  ctx.fillRect(x - 1, plateY, width + 2, plateH);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(x - 1, plateY, width + 2, 1);
  ctx.fillRect(x - 1, plateY + plateH - 1, width + 2, 1);
  ctx.fillRect(x - 1, plateY, 1, plateH);
  ctx.fillRect(x + width, plateY, 1, plateH);
  let fill = ratio > 0.55 ? '#8fbf62' : ratio > 0.28 ? '#f0c15a' : '#e15a42';
  if (emphasize) fill = ratio > 0.55 ? '#d7f5a4' : ratio > 0.28 ? '#ffe3a0' : '#ffc2b4';
  if (fillW > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, fillW, HP_FILL);
    ctx.fillStyle = 'rgba(255, 248, 230, 0.5)';
    ctx.fillRect(x, y, fillW, 1);
  }
}

function drawTargetMark(ctx, x, y, width) {
  const top = y - 1;
  const bottom = y + HP_FILL;
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(x - 4, top, 2, 1);
  ctx.fillRect(x - 4, top, 1, 2);
  ctx.fillRect(x + width + 2, top, 2, 1);
  ctx.fillRect(x + width + 3, top, 1, 2);
  ctx.fillRect(x - 4, bottom, 2, 1);
  ctx.fillRect(x - 4, bottom - 1, 1, 2);
  ctx.fillRect(x + width + 2, bottom, 2, 1);
  ctx.fillRect(x + width + 3, bottom - 1, 1, 2);
}

function drawStatusIcon(ctx, status, x, y) {
  const type = String(status.type || '');
  if (type === 'burn') {
    ctx.fillStyle = '#5c220f';
    ctx.fillRect(x + 1, y, 3, 5);
    ctx.fillStyle = '#e25a2a';
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(x + 2, y + 2, 1, 2);
    return;
  }
  if (type === 'poison') {
    ctx.fillStyle = '#243814';
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = '#6aaa3a';
    ctx.fillRect(x + 1, y + 1, 3, 2);
    ctx.fillStyle = '#d8f0a0';
    ctx.fillRect(x + 2, y + 1, 1, 1);
    const stacks = clamp(Math.round(finite(status.stacks) ?? 1), 1, 4);
    if (stacks > 1) {
      ctx.fillStyle = '#d8f0a0';
      for (let i = 0; i < stacks; i++) ctx.fillRect(x + i, y + 5, 1, 1);
    }
    return;
  }
  if (type === 'slow') {
    ctx.fillStyle = '#24566c';
    ctx.fillRect(x, y + 2, 5, 1);
    ctx.fillRect(x + 2, y, 1, 5);
    ctx.fillStyle = '#f4fdff';
    ctx.fillRect(x + 2, y + 2, 1, 1);
    return;
  }
  if (type === 'stun') {
    ctx.fillStyle = '#f0d35a';
    ctx.fillRect(x + 2, y, 1, 5);
    ctx.fillRect(x, y + 2, 5, 1);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(x + 2, y + 2, 1, 1);
    return;
  }
  if (type === 'brittle') {
    ctx.fillStyle = '#d7c4a4';
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x + 3, y + 1, 2, 1);
    ctx.fillRect(x + 1, y + 2, 2, 1);
    ctx.fillRect(x, y + 4, 2, 1);
    ctx.fillRect(x + 3, y + 3, 2, 1);
    return;
  }
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(x + 2, y + 2, 1, 1);
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
  const stride = STATUS_CELL + 1;
  const rowWidth = shown.length * stride - 1;
  let x = Math.round(anchorX - rowWidth / 2);
  const top = Math.round(y);
  for (let i = 0; i < shown.length; i++) {
    ctx.fillStyle = '#101418';
    ctx.fillRect(x, top, STATUS_CELL, STATUS_CELL);
    ctx.fillStyle = '#d5e0d4';
    ctx.fillRect(x, top, STATUS_CELL, 1);
    ctx.fillRect(x, top, 1, STATUS_CELL);
    ctx.fillRect(x + STATUS_CELL - 1, top, 1, STATUS_CELL);
    drawStatusIcon(ctx, shown[i], x + 1, top + 1);
    x += stride;
  }
}

function drawProjectile(ctx, projectile, target, reduced) {
  const x = Math.round(projectile.x);
  const y = Math.round(projectile.y);
  const elements = elementsOf(projectile);
  const kind = elements[0];
  const color = PALETTE[kind] || PALETTE.bolt;
  const accent = PALETTE[elements[1]] || color;
  let dx = finite(projectile.vx) ?? 0;
  let dy = finite(projectile.vy) ?? 0;
  if (dx === 0 && dy === 0 && target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    dx = target.x - projectile.x;
    dy = target.y - projectile.y;
  }
  if (dx === 0 && dy === 0) dy = -1;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag;
  const uy = dy / mag;
  const px = -uy;
  const py = ux;
  const crit = !!projectile.crit || (Array.isArray(projectile.tags) && projectile.tags.includes('crit'));
  const length = reduced ? 3 : kind === 'lightning' ? 8 : kind === 'fire' ? 6 : 5;
  const life = finite(projectile.life);
  const faded = life != null && life < 0.35;
  const at = (along, across) => [x + ux * along + px * across, y + uy * along + py * across];
  if (faded) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.3, life / 0.35);
  }
  for (let i = length; i >= 1; i--) {
    let across = 0;
    if (kind === 'lightning' && i % 2 === 1) {
      const side = (hashInt(x * 13 + y * 29 + i * 7 + (reduced ? 0 : Math.round(projectile.x))) & 1) ? 1 : -1;
      across = side;
    }
    const [tx, ty] = at(-i, across);
    plot(ctx, tx, ty, i < 3 ? color.core : color.edge);
    if (kind === 'fire' && i < 4) {
      const [fx, fy] = at(-i, 1);
      plot(ctx, fx, fy, color.main);
    }
  }
  if (kind === 'frost') {
    plot(ctx, x, y, color.core);
    for (const [dxp, dyp] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      plot(ctx, x + dxp, y + dyp, Math.abs(dxp) + Math.abs(dyp) > 1 ? color.core : color.edge);
    }
  } else if (kind === 'poison') {
    plot(ctx, x, y, color.core);
    plot(ctx, x - 1, y, color.main);
    plot(ctx, x, y - 1, color.main);
    plot(ctx, x + 1, y, color.edge);
    plot(ctx, x, y + 1, color.edge);
    plot(ctx, x + 1, y + 2, accent.core);
  } else if (kind === 'support') {
    plot(ctx, x - 1, y - 1, color.edge);
    plot(ctx, x + 1, y - 1, color.edge);
    plot(ctx, x - 1, y + 1, color.edge);
    plot(ctx, x + 1, y + 1, color.edge);
    plot(ctx, x, y - 1, color.core);
    plot(ctx, x - 1, y, color.core);
    plot(ctx, x + 1, y, color.core);
    plot(ctx, x, y + 1, color.core);
  } else if (kind === 'lightning') {
    const [lx, ly] = at(0, 0);
    plot(ctx, lx, ly, color.core);
    for (const across of [-1, 1]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, color.edge);
    }
    const [tipX, tipY] = at(1, 0);
    plot(ctx, tipX, tipY, color.core);
  } else if (kind === 'fire') {
    plot(ctx, x, y, color.core);
    const [wx, wy] = at(0, 1);
    const [mx, my] = at(0, -1);
    const [tx, ty] = at(1, 0);
    plot(ctx, wx, wy, color.main);
    plot(ctx, mx, my, color.main);
    plot(ctx, tx, ty, color.edge);
  } else {
    plot(ctx, x, y, color.core);
    for (const across of [-2, -1, 1, 2]) {
      const [sx, sy] = at(0, across);
      plot(ctx, sx, sy, Math.abs(across) === 2 ? color.edge : color.main);
    }
  }
  if (crit) {
    plot(ctx, x, y - 3, '#ffffff');
    plot(ctx, x, y + 3, '#ffffff');
    plot(ctx, x - 3, y, '#ffffff');
    plot(ctx, x + 3, y, '#ffffff');
  }
  if (finite(projectile.splash) > 0 && kind !== 'fire') {
    plot(ctx, x - 2, y - 2, accent.core);
    plot(ctx, x + 2, y - 2, accent.core);
    plot(ctx, x - 2, y + 2, accent.core);
    plot(ctx, x + 2, y + 2, accent.core);
  }
  if (faded) ctx.restore();
}

function cloudColor(cloud) {
  const kind = String(cloud.type || cloud.kind || cloud.element || '').toLowerCase();
  if (kind.includes('fire') || kind.includes('burn')) return '#e25a2a';
  if (kind.includes('poison') || kind.includes('toxin')) return '#6aaa3a';
  if (kind.includes('frost') || kind.includes('ice') || kind.includes('slow')) return '#8fd0e0';
  if (kind.includes('light')) return '#ffe14a';
  return '#c5d0c8';
}

function drawCloud(ctx, cloud, index) {
  const x = finite(cloud.x);
  const y = finite(cloud.y);
  const radius = finite(cloud.radius) ?? finite(cloud.range);
  if (x == null || y == null || radius == null || radius <= 0) return;
  const r = clamp(radius, 2, 120);
  const color = cloudColor(cloud);
  const seed = hashInt(index * 97 + Math.round(x) * 13 + Math.round(y) * 29);
  let alpha = 0.55;
  const remaining = finite(cloud.remaining);
  const duration = finite(cloud.duration);
  if (remaining != null && duration != null && duration > 0) alpha *= clamp(remaining / duration, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const step = r > 40 ? 5 : 4;
  for (let py = -r; py <= r; py += step) {
    for (let px = -r; px <= r; px += step) {
      if (px * px + py * py > r * r) continue;
      if ((hashInt(seed + px * 3 + py * 17) & 3) === 0) continue;
      ctx.fillRect(Math.round(x + px), Math.round(y + py), 2, 2);
    }
  }
  ctx.restore();
}

function ringRadius(value) {
  return Number.isFinite(value) && value > 0 ? clamp(value, 1, RANGE_LIMIT) : 0;
}

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
  const cx = Math.round(origin.x);
  const cy = Math.round(origin.y);
  const primary = attack || aura;
  if (!primary) return;
  if (!strokeOnly) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, primary, 0, Math.PI * 2);
    ctx.fillStyle = attack ? 'rgba(240, 203, 114, 0.10)' : 'rgba(125, 206, 192, 0.10)';
    ctx.fill();
    ctx.restore();
    return;
  }
  if (attack) drawPixelCircle(ctx, cx, cy, attack, '#f0cb72');
  if (aura && Math.abs(aura - attack) > 6) drawPixelCircle(ctx, cx, cy, aura, '#7dcec0');
  ctx.fillStyle = attack ? '#f0cb72' : '#7dcec0';
  ctx.fillRect(cx - 2, cy, 5, 1);
  ctx.fillRect(cx, cy - 2, 1, 5);
}

function drawFence(ctx, state, time, flash, reduced) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.maxHp) || fence.maxHp <= 0 || !Number.isFinite(fence.hp)) return;
  const ratio = clamp(fence.hp / fence.maxHp, 0, 1);
  const x = 24;
  const y = ARENA.fenceY - 7;
  const width = ARENA.width - 48;
  const emphasize = !reduced && ratio <= 0.28 && Math.floor(time * 6) % 2 === 0;
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 * flash;
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(0, ARENA.fenceY - 6, ARENA.width, 12);
    ctx.restore();
  }
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(x - 1, y - 1, width + 2, 6);
  ctx.fillStyle = ratio > 0.6 ? '#8eae6a' : ratio > 0.3 ? '#e0b15a' : emphasize ? '#ffb2a6' : '#c4543c';
  const fillW = Math.round(width * ratio);
  if (fillW > 0) ctx.fillRect(x, y, fillW, 4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + Math.round(width * i / 4), y, 1, 4);
}

function fillSlot(ctx, box, color) {
  ctx.fillStyle = color;
  ctx.fillRect(box.left, box.top, box.width, box.height);
}

function strokeSlot(ctx, box, color, thickness) {
  const x = box.left;
  const y = box.top;
  const w = box.width;
  const h = box.height;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
  ctx.fillRect(x, y + h - thickness, w, thickness);
  ctx.fillRect(x, y, thickness, h);
  ctx.fillRect(x + w - thickness, y, thickness, h);
}

function enemyAnchor(enemy) {
  const size = measureEnemy(enemy);
  return {
    size,
    x: Math.round(enemy.x),
    y: Math.round(enemy.y + size.height / 2),
  };
}

// Cues sit in the clear rows above the sprite. The plate never reaches spriteTop.
function enemyCueLayout(anchor) {
  const spriteTop = anchor.y - anchor.size.height;
  const barW = clamp(Math.round(anchor.size.width * 0.85), 12, 48);
  const plateBottom = spriteTop - 1 - SPRITE_GAP;
  const barY = plateBottom - HP_FILL;
  return {
    barX: Math.round(anchor.x - barW / 2),
    barY,
    barW,
    statusY: (barY - 1) - STATUS_GAP - STATUS_CELL,
  };
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

// One hue on the body. Stun wins, then burn, then poison, then slow. Pips still list the rest.
function statusTintColor(enemy) {
  if (statusLive(enemy, 'stun')) return STATUS_TINT.stun;
  if (statusLive(enemy, 'burn')) return STATUS_TINT.burn;
  if (statusLive(enemy, 'poison')) return STATUS_TINT.poison;
  if (statusLive(enemy, 'slow')) return STATUS_TINT.slow;
  return null;
}

function drawStunFrame(ctx, anchor) {
  const width = anchor.size.width;
  const height = anchor.size.height;
  if (!(width > 0) || !(height > 0)) return;
  const left = Math.round(anchor.x - width / 2);
  const top = Math.round(anchor.y - height);
  ctx.fillStyle = '#f0d35a';
  ctx.fillRect(left - 1, top - 1, width + 2, 1);
  ctx.fillRect(left - 1, top + height, width + 2, 1);
  ctx.fillRect(left - 1, top, 1, height);
  ctx.fillRect(left + width, top, 1, height);
  ctx.fillStyle = '#fff6c8';
  const cx = Math.round(anchor.x);
  ctx.fillRect(cx - 4, top - 3, 1, 1);
  ctx.fillRect(cx + 3, top - 3, 1, 1);
}

function alphaCanvas(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (ctx) return {canvas, ctx};
    }
  } catch {
    /* OffscreenCanvas can exist but refuse a 2d context. */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) return {canvas, ctx};
    }
  } catch {
    /* Headless hosts fall back to a flat wash. */
  }
  return null;
}

function scratchFor(width, height) {
  if (tintSurface && tintSurface.canvas.width >= width && tintSurface.canvas.height >= height) return tintSurface;
  const next = alphaCanvas(Math.max(64, width), Math.max(80, height));
  if (!next) return null;
  tintSurface = next;
  return tintSurface;
}

function washStatus(ctx, left, top, width, height, color) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}

// Recolor sprite pixels only, then blend them back so the drawing stays visible.
function drawStatusTint(ctx, enemy, anchor, color, time) {
  const width = anchor.size.width;
  const height = anchor.size.height;
  if (!(width > 0) || !(height > 0)) return;
  const left = Math.round(anchor.x - width / 2);
  const top = Math.round(anchor.y - height);
  const surface = scratchFor(width, height);
  if (!surface || typeof ctx.drawImage !== 'function') {
    washStatus(ctx, left, top, width, height, color);
    return;
  }
  const scratch = surface.ctx;
  try {
    scratch.setTransform(1, 0, 0, 1, 0, 0);
    scratch.globalAlpha = 1;
    scratch.globalCompositeOperation = 'source-over';
    scratch.clearRect(0, 0, width, height);
    drawEnemy(scratch, enemy, width / 2, height, {time, scale: 1, flash: 0});
    scratch.globalCompositeOperation = 'source-atop';
    scratch.fillStyle = color;
    scratch.fillRect(0, 0, width, height);
    scratch.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = TINT_ALPHA;
    ctx.drawImage(surface.canvas, 0, 0, width, height, left, top, width, height);
    ctx.restore();
  } catch {
    washStatus(ctx, left, top, width, height, color);
  }
}

function languageTag(value) {
  if (typeof value !== 'string' || !value) return null;
  const tag = value.toLowerCase();
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('en')) return 'en';
  return null;
}

function activeLanguage(state, ui) {
  const doc = globalThis.document?.documentElement?.lang;
  return languageTag(ui?.language)
    || languageTag(ui?.settings?.language)
    || languageTag(doc)
    || languageTag(state?.profileSnapshot?.settings?.language)
    || 'en';
}

function bilingualHint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const en = typeof value.en === 'string' ? value.en.trim() : '';
  const zh = typeof value.zh === 'string' ? value.zh.trim() : '';
  if (!en || !zh) return null;
  return {en, zh};
}

function fieldHint(state) {
  if (!state || typeof state !== 'object') return null;
  return bilingualHint(state.director?.playerHint) || bilingualHint(state.systems?.waves?.current?.hint);
}

function textWidth(ctx, text) {
  if (ctx && typeof ctx.measureText === 'function') {
    try {
      const width = ctx.measureText(String(text)).width;
      if (Number.isFinite(width) && width > 0) return width;
    } catch {
      /* Estimate when the context cannot measure. */
    }
  }
  let width = 0;
  for (const ch of Array.from(String(text))) width += ch.charCodeAt(0) > 127 ? 11 : 6;
  return width;
}

function shrinkToWidth(ctx, word, maxWidth, lines) {
  let rest = word;
  while (rest && textWidth(ctx, rest) > maxWidth) {
    let fit = '';
    for (const ch of Array.from(rest)) {
      const next = fit + ch;
      if (textWidth(ctx, next) > maxWidth) break;
      fit = next;
    }
    if (!fit) {
      const first = Array.from(rest)[0] || '';
      if (!first) break;
      lines.push(first);
      rest = Array.from(rest).slice(1).join('');
      continue;
    }
    lines.push(fit);
    rest = Array.from(rest).slice(Array.from(fit).length).join('');
  }
  return rest;
}

function wrapHintLines(ctx, text, maxWidth) {
  const lines = [];
  const limited = Array.from(String(text)).slice(0, HINT_CHAR_LIMIT).join('');
  for (const paragraph of limited.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = shrinkToWidth(ctx, words[0], maxWidth, lines);
    for (let i = 1; i < words.length; i++) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (textWidth(ctx, next) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = shrinkToWidth(ctx, words[i], maxWidth, lines);
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function ellipsize(ctx, line, maxWidth) {
  const mark = '…';
  let out = line;
  while (out && textWidth(ctx, `${out}${mark}`) > maxWidth) out = Array.from(out).slice(0, -1).join('');
  return `${out}${mark}`;
}

function drawFieldHint(ctx, state, ui) {
  const hint = fieldHint(state);
  if (!hint || typeof ctx.fillText !== 'function') return;
  const text = hint[activeLanguage(state, ui)];
  if (!text) return;
  const maxWidth = ARENA.width - 16;
  ctx.save();
  try {
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let lines = wrapHintLines(ctx, text, maxWidth);
    if (lines.length > HINT_MAX_LINES) {
      lines = lines.slice(0, HINT_MAX_LINES);
      lines[HINT_MAX_LINES - 1] = ellipsize(ctx, lines[HINT_MAX_LINES - 1], maxWidth);
    }
    if (!lines.length) return;
    const lineHeight = 13;
    const blockWidth = Math.min(maxWidth, Math.max(...lines.map((line) => textWidth(ctx, line))));
    const bandHeight = Math.min(HINT_BAND, lines.length * lineHeight + 6);
    const x = Math.round((ARENA.width - blockWidth) / 2);
    const y = 3;
    if (typeof ctx.beginPath === 'function' && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(0, 0, ARENA.width, HINT_BAND);
      ctx.clip();
    }
    ctx.fillStyle = 'rgba(8, 14, 16, 0.78)';
    ctx.fillRect(x - 4, 1, Math.ceil(blockWidth) + 8, bandHeight - 1);
    for (let i = 0; i < lines.length; i++) {
      const lx = x;
      const ly = y + i * lineHeight;
      ctx.fillStyle = '#0c1216';
      ctx.fillText(lines[i], lx - 1, ly);
      ctx.fillText(lines[i], lx + 1, ly);
      ctx.fillText(lines[i], lx, ly - 1);
      ctx.fillText(lines[i], lx, ly + 1);
      ctx.fillStyle = '#f4efe2';
      ctx.fillText(lines[i], lx, ly);
    }
  } catch {
    /* Hint text is optional. A missing text API must not blank the field. */
  } finally {
    ctx.restore();
  }
}

// Rank 1–4 sits in the open band above the selected sprite, clear of its body.
function drawSelectedRank(ctx, unit, anchorX, anchorY, size) {
  const rank = clamp(Math.round(finite(unit?.rank) ?? 1), 1, 4);
  const glyph = RANK_DIGIT[rank];
  const scale = 2;
  const cols = glyph[0].length;
  const rows = glyph.length;
  const plateW = cols * scale + 2;
  const plateH = rows * scale + 2;
  const spriteTop = Math.round(anchorY - size.height);
  let x = Math.round(anchorX - plateW / 2);
  let y = spriteTop - plateH - 1;
  if (y < 1) y = Math.min(ARENA.height - plateH - 1, spriteTop + 1);
  x = clamp(x, 1, ARENA.width - plateW - 1);
  y = clamp(y, 1, ARENA.height - plateH - 1);
  ctx.fillStyle = '#101418';
  ctx.fillRect(x, y, plateW, plateH);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(x, y, plateW, 1);
  ctx.fillRect(x, y + plateH - 1, plateW, 1);
  ctx.fillRect(x, y, 1, plateH);
  ctx.fillRect(x + plateW - 1, y, 1, plateH);
  ctx.fillStyle = '#fff6c8';
  const ox = x + 1;
  const oy = y + 1;
  for (let row = 0; row < rows; row++) {
    const line = glyph[row];
    for (let col = 0; col < cols; col++) {
      if (line[col] !== '#') continue;
      ctx.fillRect(ox + col * scale, oy + row * scale, scale, scale);
    }
  }
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

function slotPulse(index, slots, now) {
  let best = 0;
  let role = '';
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].index !== index) continue;
    const duration = slots[i].duration || CUE_MS;
    const strength = cueStrength(slots[i].at, now, duration);
    if (strength > best) {
      best = strength;
      role = slots[i].role || '';
    }
  }
  return {strength: best, role};
}

function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer requires a canvas');
  }
  const display = context2d(canvas, false);
  if (!display) throw new TypeError('createRenderer could not get a 2d context');

  const sceneBundle = createScene();
  let scene = sceneBundle.scene;
  let sceneCtx = sceneBundle.ctx;
  const effects = createEffects();
  const warned = {stats: false};
  const rangeCache = {valid: false, state: null, slot: -1, stats: null};
  const hits = [];
  const shots = [];
  const slotCues = [];
  let fenceAt = null;
  let pending = [];
  let runId;
  let seenRun = false;
  let lastSim = null;
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
    slotCues.length = 0;
    fenceAt = null;
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
        pushCapped(shots, {
          at,
          x: finite(event.x),
          y: finite(event.y),
          sourceId: idOf(event.sourceId, event.unitId, typeof event.source === 'string' ? event.source : null),
        });
      } else if (type === 'fence_hit') {
        fenceAt = at;
      } else if (type === 'merge') {
        const from = Number.isInteger(event.from) ? event.from : event.fromIndex;
        const to = Number.isInteger(event.to) ? event.to : event.toIndex;
        if (Number.isInteger(from) && from >= 0 && from < 10) {
          pushCapped(slotCues, {at, index: from, role: 'empty', duration: MERGE_CUE_MS});
        }
        if (Number.isInteger(to) && to >= 0 && to < 10) {
          pushCapped(slotCues, {at, index: to, role: 'kept', duration: MERGE_CUE_MS});
        }
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
    const integer = Math.floor(fit + 1e-4);
    let scale = fit > 0 ? fit : 1;
    if (integer >= 1 && ((fit - integer) <= 0.02 || integer / fit >= 0.92)) scale = integer;
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

  function paint(ctx, state, ui, now, logicalBuffer) {
    const reduced = !!(ui.settings && ui.settings.reducedMotion) || !!ui.reducedMotion;
    const selected = normalizeSlot(ui.selectedSlot);
    const hover = normalizeSlot(ui.hoverSlot);
    const showRange = ui.range !== false;
    const time = finite(state?.time) ?? 0;
    const visualTime = reduced ? Math.round(time * 6) / 6 : time;
    const flashSpan = reduced ? 80 : FLASH_MS;
    rangeCache.valid = false;

    sharpen(ctx);
    if (logicalBuffer) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    if (!state) {
      isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
      return;
    }

    isolate(ctx, () => drawWorld(ctx, state, {time: visualTime, reducedMotion: reduced}));

    const clouds = Array.isArray(state.clouds) ? state.clouds : [];
    const cloudCount = Math.min(clouds.length, MAX_CLOUDS);
    const cloudStart = clouds.length - cloudCount;
    for (let i = cloudStart; i < clouds.length; i++) {
      if (clouds[i]) drawCloud(ctx, clouds[i], i);
    }

    if (showRange) drawRange(ctx, state, selected, false, warned, rangeCache);

    const slots = Array.isArray(state.slots) ? state.slots : [];
    if (hover >= 0 && hover !== selected) fillSlot(ctx, slotBox(slots[hover], hover), 'rgba(241, 238, 226, 0.08)');
    if (selected >= 0) fillSlot(ctx, slotBox(slots[selected], selected), 'rgba(240, 203, 114, 0.14)');

    const enemies = orderedEnemies(state);
    const anchors = new Array(enemies.length);
    const enemiesById = Object.create(null);
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.id != null) enemiesById[enemy.id] = enemy;
      const anchor = enemyAnchor(enemy);
      anchors[i] = anchor;
      const flash = enemyFlash(enemy, hits, now, flashSpan);
      isolate(ctx, () => drawEnemy(ctx, enemy, anchor.x, anchor.y, {time: visualTime, scale: 1, flash}));
      if (!enemy.dead && flash <= 0.4) {
        const tint = statusTintColor(enemy);
        if (tint) isolate(ctx, () => drawStatusTint(ctx, enemy, anchor, tint, visualTime));
        if (statusLive(enemy, 'stun')) isolate(ctx, () => drawStunFrame(ctx, anchor));
      }
    }

    for (let index = 0; index < 10; index++) {
      const slot = slots[index];
      const unit = slot?.unit;
      if (!unit) continue;
      const size = measureDefender(unit);
      const origin = slotCenter(slot, index);
      const anchorX = Math.round(origin.x);
      const anchorY = Math.round(origin.y + size.height / 2);
      const flash = unitFlash(unit.id, shots, now, flashSpan);
      isolate(ctx, () => drawDefender(ctx, unit, anchorX, anchorY, {time: visualTime, scale: 1, flash}));
    }

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

    if (showRange) drawRange(ctx, state, selected, true, warned, rangeCache);

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.dead) continue;
      const anchor = anchors[i];
      const cue = enemyCueLayout(anchor);
      const fresh = enemyFlash(enemy, hits, now, flashSpan) > 0.4;
      const maxHp = Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 ? enemy.maxHp : null;
      const low = maxHp != null && Number.isFinite(enemy.hp) && enemy.hp / maxHp <= 0.28;
      const emphasize = fresh || (!reduced && low && Math.floor(visualTime * 6) % 2 === 0);
      drawHpBar(ctx, cue.barX, cue.barY, cue.barW, enemy.hp, enemy.maxHp, emphasize);
      if (Number.isFinite(enemy.hp) && (fresh || targeted[enemy.id] === true)) {
        drawTargetMark(ctx, cue.barX, cue.barY, cue.barW);
      }
      drawStatuses(ctx, enemy, anchor.x, cue.statusY);
    }

    drawFence(ctx, state, visualTime, cueStrength(fenceAt, now, reduced ? 100 : 200), reduced);

    for (let index = 0; index < 10; index++) {
      const box = slotBox(slots[index], index);
      const pulse = slotPulse(index, slotCues, now);
      if (pulse.strength <= 0) continue;
      if (pulse.role === 'empty') {
        ctx.fillStyle = `rgba(20, 14, 12, ${0.35 + 0.45 * pulse.strength})`;
        ctx.fillRect(box.left + 3, box.top + 3, box.width - 6, box.height - 6);
        strokeSlot(ctx, box, `rgba(231, 160, 138, ${0.55 + 0.45 * pulse.strength})`, 3);
      } else if (pulse.role === 'kept') {
        ctx.fillStyle = `rgba(240, 203, 114, ${0.18 + 0.28 * pulse.strength})`;
        ctx.fillRect(box.left + 3, box.top + 3, box.width - 6, box.height - 6);
        strokeSlot(ctx, box, '#f0cb72', 3);
      } else if (index !== selected) {
        strokeSlot(ctx, box, `rgba(255, 244, 214, ${0.45 + 0.55 * pulse.strength})`, 2);
      }
    }
    if (hover >= 0 && hover !== selected) {
      const intent = ui.hoverIntent;
      const box = slotBox(slots[hover], hover);
      const dropColor = intent === 'empty'
        ? '#7ecea0'
        : intent === 'merge'
          ? '#f0cb72'
          : intent === 'illegal'
            ? '#e7a08a'
            : 'rgba(198, 214, 210, 0.9)';
      if (intent === 'empty' || intent === 'merge' || intent === 'illegal') {
        ctx.fillStyle = intent === 'empty'
          ? 'rgba(126, 206, 160, 0.34)'
          : intent === 'merge'
            ? 'rgba(240, 203, 114, 0.34)'
            : 'rgba(231, 160, 138, 0.34)';
        ctx.fillRect(box.left, box.top, box.width, box.height);
      }
      strokeSlot(ctx, box, dropColor, intent ? 4 : 1);
    }
    if (selected >= 0) {
      strokeSlot(ctx, slotBox(slots[selected], selected), '#f0cb72', 2);
      const selectedUnit = slots[selected]?.unit;
      if (selectedUnit) {
        const selectedSize = measureDefender(selectedUnit);
        const selectedOrigin = slotCenter(slots[selected], selected);
        isolate(ctx, () => drawSelectedRank(
          ctx,
          selectedUnit,
          Math.round(selectedOrigin.x),
          Math.round(selectedOrigin.y + selectedSize.height / 2),
          selectedSize,
        ));
      }
    }

    isolate(ctx, () => effects.draw(ctx, {reducedMotion: reduced}));
    // The HUD shows playerHint. Drawing it here covered enemies entering from the top.
    void drawFieldHint;
  }

  function draw(state, ui) {
    if (destroyed) return;
    const viewUi = ui && typeof ui === 'object' ? ui : {};
    resize();
    const now = nowMs();
    pruneList(hits, now);
    pruneList(shots, now);
    pruneList(slotCues, now);
    if (fenceAt != null && now - fenceAt > CUE_MS) fenceAt = null;

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

    if (sceneCtx) {
      paint(sceneCtx, state, viewUi, now, true);
      sharpen(display);
      display.setTransform(1, 0, 0, 1, 0, 0);
      display.globalAlpha = 1;
      display.fillStyle = LETTERBOX;
      display.fillRect(0, 0, canvas.width, canvas.height);
      display.imageSmoothingEnabled = false;
      display.drawImage(scene, view.offsetX, view.offsetY, view.destW, view.destH);
    } else {
      sharpen(display);
      display.setTransform(1, 0, 0, 1, 0, 0);
      display.globalAlpha = 1;
      display.fillStyle = LETTERBOX;
      display.fillRect(0, 0, canvas.width, canvas.height);
      display.setTransform(view.destW / ARENA.width, 0, 0, view.destH / ARENA.height, view.offsetX, view.offsetY);
      sharpen(display);
      display.save();
      display.beginPath();
      display.rect(0, 0, ARENA.width, ARENA.height);
      display.clip();
      paint(display, state, viewUi, now, false);
      display.restore();
    }
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
    scene = null;
    sceneCtx = null;
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
const slotGeometry = __ff_m0["slotGeometry"];
/**
 * Battlefield backdrop, logical 360×640.
 * Portrait bands: sky, the top edge enemies cross, open ground, one shared fence,
 * then the ground both defender rows stand on, with exactly two rows of five slots.
 * Fence art follows hp/maxHp: intact above about 60%, cracked below that, failing below about 30%.
 * No lanes and no column paths. drawWorld does not draw units, enemies, projectiles,
 * or gameplay clouds, and it does not mutate run state or advance the gameplay RNG.
 * Animation uses the `time` argument.
 * When state.director.hasBoss is true, the sky, the top edge, and the open field
 * take a boss-wave tint. The wash stays translucent so the night sky still reads,
 * and every boss band stays dimmer than the fence rail, which remains the brightest
 * full-width band. The cached night backdrop stays unchanged for other waves.
 * drawIcon(ctx, id, x, y, size) paints a size×size icon from its top-left corner.
 */


const W = ARENA.width;
const H = ARENA.height;
const PICKETS = 30;
// Shared fence stages, as fractions of maxHp. Cracks open through the first line.
// Boards, posts, and the rail give way through the second. Ruin is the last sliver.
const FENCE_CRACKED = 0.6;
const FENCE_FAILING = 0.3;
const FENCE_RUIN = 0.12;
const BREAK_SEQUENCE = Object.freeze([
  0, 29, 2, 27, 5, 24, 8, 21, 1, 28, 4, 25, 11, 18, 7, 22,
  10, 19, 3, 26, 6, 23, 9, 20, 12, 17, 13, 16, 14, 15
]);
const BREAK_RANK = (() => {
  const rank = new Array(PICKETS).fill(-1);
  BREAK_SEQUENCE.forEach((index, order) => { rank[index] = order; });
  if (BREAK_SEQUENCE.length !== PICKETS || rank.includes(-1)) {
    throw new Error('Fencefall world: fence damage order is not a permutation');
  }
  return rank;
})();

const TUFTS = Object.freeze([
  [5, 120], [10, 188], [4, 252], [13, 318], [8, 378],
  [354, 142], [348, 214], [353, 286], [344, 348], [350, 396]
]);
const TREES = Object.freeze([
  [8, 22], [28, 14], [50, 18], [96, 9], [154, 7], [214, 8], [270, 10], [318, 15], [340, 22], [354, 12]
]);
const STARS = Object.freeze([
  [16, 6, 0], [42, 11, 0], [74, 5, 1], [108, 12, 0], [146, 7, 0],
  [188, 4, 0], [228, 10, 1], [262, 6, 0], [330, 9, 0], [348, 5, 0], [22, 13, 0]
]);
const POSTS = Object.freeze([0, 86, 174, 262, 348]);
const ENTRY_Y = 46;
const SLEEPER_Y = 466;
const GROUND_Y = 472;
const SCUFFS = Object.freeze([
  [28, 128, 42], [196, 168, 34], [64, 214, 30], [236, 258, 40],
  [36, 304, 28], [176, 346, 32], [88, 392, 24], [214, 418, 22]
]);

const PAL = {
  k: '#12181c',
  n: '#243038',
  w: '#f1eee2',
  g: '#d3b984',
  G: '#7a6240',
  y: '#f0cb72',
  m: '#c5d0d4',
  M: '#4d5c64',
  r: '#e25822',
  R: '#8a3018',
  f: '#ffb060',
  a: '#7ec8d8',
  c: '#2f6f80',
  C: '#e7f7fb',
  b: '#3fba6a',
  B: '#1c5a38',
  p: '#c4504a',
  d: '#e23b4a',
  e: '#c4a06a',
  E: '#6e5432',
  u: '#6d8794'
};

const ALIASES = {
  projectile: 'bolt', arrow: 'bolt', crossbow: 'bolt',
  ice: 'frost', cold: 'frost',
  shock: 'lightning', electric: 'lightning', thunder: 'lightning',
  toxin: 'poison', acid: 'poison', venom: 'poison', poisonstatus: 'poison', statuspoison: 'poison',
  aura: 'support', lantern: 'support', banner: 'support', heal: 'support',
  heroupgrade: 'hero',
  flame: 'fire',
  heart: 'hp', health: 'hp',
  experience: 'xp', star: 'xp',
  sword: 'damage', attack: 'damage',
  attackspeed: 'haste', speed: 'haste',
  coin: 'currency', gold: 'currency',
  shield: 'armor',
  vital: 'vitality',
  cracked: 'brittle', fragile: 'brittle',
  freeze: 'slow', frozen: 'slow', chill: 'slow',
  skull: 'defeat', dead: 'defeat', lose: 'defeat',
  win: 'victory',
  lock: 'locked',
  empty: 'plus', emptyslot: 'plus', place: 'plus',
  critical: 'crit', critchance: 'crit',
  soundoff: 'mute', soundon: 'sound'
};

let backdropReady = false;
let backdrop = null;

function hash2(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  return Math.imul(n, 1274126177) >>> 0;
}

function hashString(text) {
  let h = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function horizonY(x) {
  const wave = Math.sin(x * 0.02) * 6 + Math.sin(x * 0.053 + 1.1) * 3 + Math.sin(x * 0.11) * 2;
  return 40 + Math.round(wave);
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try { return new OffscreenCanvas(width, height); } catch { /* use a DOM canvas if present */ }
  }
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === 'function') {
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function readAlpha(ctx) {
  return Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
}

function wearOf(index) {
  return BREAK_RANK[index] / (PICKETS - 1);
}

function breakAt(index) {
  const wear = wearOf(index);
  return FENCE_FAILING * (1 - wear * wear);
}

function crackAt(index) {
  const wear = wearOf(index);
  return FENCE_CRACKED - FENCE_FAILING * wear * wear * wear;
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

function woodKit(ratio) {
  if (ratio > FENCE_CRACKED) {
    return { light: '#e6d2a4', mid: '#c4a06a', dark: '#8d6840', edge: '#4e3820', iron: '#d5dde0', ironDark: '#6e7c86', strap: '#9aa8ae' };
  }
  if (ratio > FENCE_FAILING) {
    return { light: '#c4a882', mid: '#8d6a46', dark: '#5c4330', edge: '#2e2218', iron: '#b4bcc0', ironDark: '#556066', strap: '#7a868c' };
  }
  if (ratio > FENCE_RUIN) {
    return { light: '#8a6850', mid: '#5c4034', dark: '#3a2822', edge: '#1a1210', iron: '#80888c', ironDark: '#3e484c', strap: '#5a6468' };
  }
  return { light: '#6a4038', mid: '#3a2420', dark: '#241614', edge: '#100c0a', iron: '#5c6064', ironDark: '#2a3034', strap: '#3a4044' };
}

function paintSky(ctx) {
  const stops = [[0, '#0c1216'], [14, '#142028'], [28, '#243430'], [48, '#4a5c52']];
  ctx.fillStyle = '#0c1216';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < 56; y += 2) {
    let upper = stops[0];
    let lower = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (y >= stops[i][0] && y <= stops[i + 1][0]) {
        upper = stops[i];
        lower = stops[i + 1];
        break;
      }
    }
    const span = Math.max(1, lower[0] - upper[0]);
    const t = Math.round(((y - upper[0]) / span) * 4) / 4;
    ctx.fillStyle = mixHex(upper[1], lower[1], t);
    ctx.fillRect(0, y, W, 2);
  }
}

function mixHex(a, b, t) {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  const q = Math.max(0, Math.min(1, t));
  const channel = index => Math.round((pa[index] + (pb[index] - pa[index]) * q) / 8) * 8;
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

function hexRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function drawMoon(ctx) {
  const x = 292;
  const y = 3;
  ctx.fillStyle = '#f0e2c0';
  const cells = [
    [3, 0], [4, 0], [5, 0], [6, 0],
    [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
    [1, 3], [2, 3], [3, 3], [4, 3],
    [0, 4], [1, 4], [2, 4], [3, 4],
    [0, 5], [1, 5], [2, 5], [3, 5],
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
    [3, 8], [4, 8], [5, 8], [6, 8]
  ];
  for (const [cx, cy] of cells) ctx.fillRect(x + cx, y + cy, 1, 1);
  ctx.fillStyle = '#d9c89a';
  ctx.fillRect(x + 1, y + 4, 1, 2);
  ctx.fillRect(x + 2, y + 3, 1, 1);
  ctx.fillStyle = '#c4b48a';
  ctx.fillRect(x + 5, y + 6, 1, 1);
}

function drawTree(ctx, x, height) {
  const base = horizonY(x);
  const top = base - height;
  const trunk = height > 16 ? 3 : 2;
  ctx.fillStyle = '#0e1612';
  ctx.fillRect(x, top + 2, trunk, Math.max(2, height - 2));
  ctx.fillStyle = '#1a2820';
  ctx.fillRect(x - 4, top + 4, 4, 2);
  ctx.fillRect(x + trunk, top + 7, 4, 2);
  if (height > 14) ctx.fillRect(x - 2, top + 2, 2, 2);
  ctx.fillStyle = '#243028';
  ctx.fillRect(x - 1, base - 2, trunk + 2, 2);
}

function paintEntryEdge(ctx) {
  const y = ENTRY_Y;
  ctx.fillStyle = '#101816';
  ctx.fillRect(0, y + 10, W, 6);
  ctx.fillStyle = '#6a8074';
  ctx.fillRect(0, y + 3, W, 8);
  ctx.fillStyle = '#314038';
  ctx.fillRect(0, y + 8, W, 4);
  ctx.fillStyle = '#d5e2d6';
  ctx.fillRect(0, y + 1, W, 2);
  let x = 0;
  let stone = 0;
  while (x < W) {
    const n = hash2(stone * 3 + 1, 41);
    const span = 7 + (n % 11);
    const rise = (n >>> 3) & 1;
    ctx.fillStyle = (n & 32) ? '#d5e2d6' : '#b7c8ba';
    ctx.fillRect(x, y + rise, span, 1);
    ctx.fillStyle = (n & 32) ? '#5e7268' : '#4a5c52';
    ctx.fillRect(x, y + 2 + rise, Math.max(1, span - 1), 2);
    ctx.fillStyle = '#1a2420';
    ctx.fillRect(x + span - 1, y + 1, 1, 10);
    if ((n % 4) === 0) {
      ctx.fillStyle = '#101816';
      ctx.fillRect(x + 2, y + 5, 1, 4);
    }
    if ((n % 6) === 0) {
      ctx.fillStyle = '#2a342e';
      ctx.fillRect(x + 1, y - 4, 2, 5);
      ctx.fillStyle = '#d5e2d6';
      ctx.fillRect(x + 1, y - 4, 2, 1);
    }
    x += span;
    stone += 1;
  }
  ctx.fillStyle = '#0e1612';
  ctx.fillRect(0, y + 12, W, 2);
  ctx.fillStyle = '#6a7e72';
  ctx.fillRect(0, y + 14, W, 1);
}

function paintApproach(ctx) {
  ctx.fillStyle = '#161e1c';
  ctx.fillRect(0, 418, W, 48);
  ctx.fillStyle = '#4a5c52';
  ctx.fillRect(0, 418, W, 1);
  ctx.fillStyle = '#101816';
  ctx.fillRect(0, 454, W, 12);
  for (let x = 0; x < W; x += 4) {
    const n = hash2(x, 422);
    if ((n & 3) !== 0) continue;
    const y = 422 + ((n >>> 2) & 7) * 2;
    ctx.fillStyle = (n & 16) ? '#2a3830' : '#101816';
    ctx.fillRect(x, y, 3 + (n & 1), 1);
  }
}

function fillStandingGround(ctx, x, y, width, height) {
  ctx.fillStyle = '#3a2c22';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#a08058';
  ctx.fillRect(x, y, width, 1);
  if (height > 6 && width > 8) {
    ctx.fillStyle = '#5c4634';
    ctx.fillRect(x + 4, y + 4, width - 8, 1);
  }
  if (height > 3) {
    ctx.fillStyle = '#241c16';
    ctx.fillRect(x, y + height - 3, width, 3);
  }
}

function paintField(ctx) {
  for (let x = 0; x < W; x += 2) {
    const near = horizonY(x);
    const far = near - 7 - ((x >> 3) & 1);
    ctx.fillStyle = '#121a18';
    ctx.fillRect(x, far, 2, near - far);
    ctx.fillStyle = '#24302c';
    ctx.fillRect(x, far, 2, 1);
  }
  for (let x = 0; x < W; x += 2) {
    const y0 = horizonY(x);
    const edge = Math.min(x, W - 1 - x);
    const margin = edge < 16 ? 0 : edge < 36 ? 1 : 2;
    const far = margin === 0 ? '#1e2824' : margin === 1 ? '#28322c' : '#343e36';
    const mid = margin === 0 ? '#1a2420' : margin === 1 ? '#222c28' : '#2c3630';
    const near = margin === 0 ? '#161e1c' : margin === 1 ? '#1c2420' : '#242c28';
    const farEnd = 168;
    const midEnd = 320;
    const lip = ENTRY_Y + 16;
    ctx.fillStyle = margin === 0 ? '#121a18' : '#1a2420';
    ctx.fillRect(x, y0, 2, Math.max(0, lip - y0));
    ctx.fillStyle = far;
    ctx.fillRect(x, lip, 2, farEnd - lip);
    ctx.fillStyle = mid;
    ctx.fillRect(x, farEnd, 2, midEnd - farEnd);
    ctx.fillStyle = near;
    ctx.fillRect(x, midEnd, 2, SLEEPER_Y - midEnd);
    ctx.fillStyle = '#8ea094';
    ctx.fillRect(x, y0, 2, 1);
  }
  for (const [x, height] of TREES) drawTree(ctx, x, height);
  for (let y = 64; y < 448; y += 4) {
    for (let x = 8; x < 352; x += 4) {
      const dx = Math.abs(x - 180) / 180;
      const n = hash2(x, y);
      if ((n % 100) > 42 + dx * 52) {
        ctx.fillStyle = (n & 3) === 0 ? '#3e4c44' : '#323e38';
        ctx.fillRect(x, y, 1, 1);
      } else if ((n % 23) === 0) {
        ctx.fillStyle = '#1a2220';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  for (let y = 404; y < 456; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if ((hash2(x + 19, y) & 3) === 0) {
        ctx.fillStyle = '#1e2622';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const patches = [
    [36, 156, 22, 3, '#1e2824'], [248, 188, 26, 3, '#323c36'],
    [110, 236, 16, 2, '#1e2824'], [292, 274, 18, 3, '#2c3630'],
    [58, 328, 24, 3, '#222a26'], [186, 366, 20, 2, '#303a34'],
    [24, 412, 28, 3, '#1c2420'], [250, 404, 22, 3, '#1c2420']
  ];
  for (const [x, y, width, height, color] of patches) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }
  ctx.fillStyle = '#1a2420';
  for (const [x, y, width] of SCUFFS) {
    ctx.fillRect(x, y, width, 1);
    ctx.fillRect(x + 5, y + 2, Math.max(8, width - 12), 1);
  }
  drawEdgeRuins(ctx);
  for (let i = 0; i < 16; i++) {
    const n = hash2(80 + i, 17);
    const x = i % 2 === 0 ? 12 + (n % 22) : 328 + (n % 22);
    const y = 150 + ((n >>> 8) % 250);
    ctx.fillStyle = '#3a463e';
    ctx.fillRect(x, y, 3, 2);
    ctx.fillStyle = '#141c18';
    ctx.fillRect(x, y + 2, 3, 1);
  }
  paintApproach(ctx);
  paintEntryEdge(ctx);
}

function drawEdgeRuins(ctx) {
  const marks = [[16, 214, 16], [340, 248, 20], [22, 336, 12], [334, 372, 14]];
  for (const [x, y, height] of marks) {
    ctx.fillStyle = '#3a342c';
    ctx.fillRect(x, y - height, 3, height);
    ctx.fillStyle = '#2a241c';
    ctx.fillRect(x - 2, y - 3, 7, 3);
    ctx.fillStyle = '#4a4034';
    ctx.fillRect(x, y - height, 1, 2);
  }
}

function paintYard(ctx) {
  fillStandingGround(ctx, 0, GROUND_Y, W, H - GROUND_Y);
  for (let y = 476; y < 632; y += 4) {
    ctx.fillStyle = ((y >> 2) & 1) ? '#34281f' : '#463628';
    ctx.fillRect(0, y, W, 1);
  }
  // Footing under each row, then the open board between the rows and at the heel.
  fillStandingGround(ctx, 0, 524, W, 20);
  fillStandingGround(ctx, 0, 608, W, 20);
  fillStandingGround(ctx, 0, 544, W, 12);
  fillStandingGround(ctx, 0, 628, W, 12);
  for (let x = 5; x < W; x += 13) {
    const n = hash2(x, 548);
    ctx.fillStyle = (n & 1) ? '#c4a06a' : '#6e5432';
    ctx.fillRect(x + (n & 3), 548, 1, 1);
    ctx.fillRect(x + ((n >>> 2) & 3), 632, 1, 1);
  }
  ctx.fillStyle = '#1c1612';
  ctx.fillRect(0, 636, W, 4);
}

function paintBackdrop(ctx) {
  paintSky(ctx);
  drawMoon(ctx);
  paintField(ctx);
  paintYard(ctx);
}

function backdropCanvas() {
  if (backdropReady) return backdrop;
  backdropReady = true;
  const canvas = makeCanvas(W, H);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { context.imageSmoothingEnabled = false; } catch { /* direct pixels still work */ }
  paintBackdrop(context);
  backdrop = canvas;
  return backdrop;
}

function drawStars(ctx, time, reduced) {
  const base = readAlpha(ctx);
  for (let i = 0; i < STARS.length; i++) {
    const [x, y, gold] = STARS[i];
    const twinkle = reduced ? 1 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 1.7 + i * 1.3));
    ctx.globalAlpha = base * twinkle;
    ctx.fillStyle = gold ? '#f0cb72' : (i % 3 === 0 ? '#d5e6ea' : '#8fb0b8');
    const span = i % 5 === 0 ? 2 : 1;
    ctx.fillRect(x, y, span, span);
  }
  ctx.globalAlpha = base;
}

function drawMist(ctx, time, reduced) {
  const base = readAlpha(ctx);
  const shift = reduced ? 6 : Math.floor(time * 7) % 48;
  ctx.globalAlpha = base * 0.16;
  ctx.fillStyle = '#d5e6ea';
  for (let i = 0; i < 7; i++) {
    const x = ((i * 58 + shift) % 420) - 24;
    const y = 14 + (i % 3) * 4;
    ctx.fillRect(x, y, 26, 1);
    ctx.fillRect(x + 6, y + 1, 12, 1);
  }
  ctx.globalAlpha = base;
}

function directorHasBoss(state) {
  return !!(state && state.director && state.director.hasBoss === true);
}

// Wash laid over the cached night, only while a boss wave is current.
// Full-width bands, never columns. Fence posts begin at y=418, so the veil stops above them.
// The sky and the open field stay translucent so the moon, stars, and tree line still read.
// The pale entry stones are the one bright band above the fence; a dark crimson cover
// keeps that lip under the fence rail, including after the rail has worn down.
function drawBossWave(ctx, time, reduced) {
  const base = readAlpha(ctx);
  const pulse = reduced ? 0 : (0.5 + 0.5 * Math.sin(time * 1.15));
  const sky = 0.44 + pulse * 0.08;
  ctx.globalAlpha = base * sky;
  ctx.fillStyle = '#9a3040';
  ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = '#b03848';
  ctx.fillRect(0, 24, W, 16);
  ctx.globalAlpha = base * (0.28 + pulse * 0.06);
  ctx.fillStyle = '#8a2838';
  ctx.fillRect(0, 64, W, 154);
  ctx.globalAlpha = base * 0.2;
  ctx.fillStyle = '#6a2030';
  ctx.fillRect(0, 218, W, 190);
  // The entry stones are a pale full-width band. Cover them, then lay a short
  // crimson lip whose row stays under the fence rail, worn or intact.
  ctx.globalAlpha = base * 0.86;
  ctx.fillStyle = '#30141c';
  ctx.fillRect(0, 40, W, 24);
  ctx.globalAlpha = base * (0.46 + pulse * 0.08);
  ctx.fillStyle = '#a04048';
  ctx.fillRect(0, ENTRY_Y, W, 2);
  const shift = reduced ? 12 : Math.floor(time * 6) % 48;
  ctx.globalAlpha = base * 0.28;
  ctx.fillStyle = '#a04840';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 96 + shift) % 420) - 24;
    const y = 10 + (i % 2) * 6;
    ctx.fillRect(x, y, 12, 1);
  }
  ctx.globalAlpha = base;
  drawMoon(ctx);
}

function drawTuft(ctx, x, y, sway) {
  ctx.fillStyle = '#1a2824';
  ctx.fillRect(x, y, 1, 4);
  ctx.fillStyle = '#2a5040';
  ctx.fillRect(x + sway, y - 4, 1, 4);
  ctx.fillRect(x - 2 - sway, y - 2, 1, 3);
  ctx.fillRect(x + 2 + sway, y - 3, 1, 3);
  ctx.fillStyle = '#6a9460';
  ctx.fillRect(x + sway, y - 5, 1, 1);
}

function drawGrass(ctx, time, reduced) {
  for (let i = 0; i < TUFTS.length; i++) {
    const [x, y] = TUFTS[i];
    const sway = reduced ? 0 : Math.round(Math.sin(time * 1.4 + i) );
    drawTuft(ctx, x, y, sway);
  }
}

function drawPicket(ctx, index, ratio, kit) {
  const x = index * 12 + 2;
  const broken = ratio <= breakAt(index);
  const jog = (index % 3) * 2;
  const top = 430 + jog;
  const base = 466;
  if (broken) {
    if (((index * 5 + 3) % 4) === 0 || (ratio <= FENCE_RUIN && (index % 2) === 0)) {
      ctx.fillStyle = kit.edge;
      ctx.fillRect(x + 2, 462, 2, 3);
      ctx.fillRect(x + 5, 460, 1, 4);
      return false;
    }
    const stump = (ratio <= FENCE_RUIN ? 4 + (index % 3) : 8 + (index % 5) * 3);
    const y = base - stump;
    ctx.fillStyle = kit.edge;
    ctx.fillRect(x, y, 8, stump);
    ctx.fillStyle = kit.dark;
    ctx.fillRect(x + 1, y + 2, 5, Math.max(0, stump - 2));
    ctx.fillStyle = kit.light;
    ctx.fillRect(x + 1, y, 4, 1);
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 2, y + 1, 3, 1);
    return false;
  }
  ctx.fillStyle = kit.light;
  ctx.fillRect(x + 3, top, 2, 2);
  ctx.fillRect(x + 2, top + 2, 4, 2);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(x + 1, top + 4, 6, 2);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(x, top + 6, 8, base - (top + 6));
  ctx.fillStyle = kit.edge;
  ctx.fillRect(x, top + 6, 1, base - (top + 6));
  ctx.fillRect(x + 7, top + 6, 1, base - (top + 6));
  ctx.fillStyle = kit.light;
  ctx.fillRect(x + 2, top + 8, 1, Math.max(0, base - (top + 10)));
  ctx.fillStyle = kit.ironDark;
  ctx.fillRect(x - 2, 446, 12, 5);
  ctx.fillStyle = kit.strap;
  ctx.fillRect(x - 2, 447, 12, 2);
  ctx.fillStyle = kit.iron;
  ctx.fillRect(x + 3, 450, 2, 2);
  if (ratio <= crackAt(index)) {
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 3, top + 6, 1, 5);
    ctx.fillRect(x + 2, top + 12, 1, 7);
    ctx.fillRect(x + 3, top + 18, 1, 6);
    if (ratio <= (FENCE_CRACKED + FENCE_FAILING) / 2) {
      ctx.fillRect(x + 5, top + 8, 1, 6);
      ctx.fillRect(x + 4, top + 14, 1, 5);
    }
  }
  if (ratio <= FENCE_FAILING && (index % 3) === 0) {
    ctx.fillStyle = '#2a1612';
    ctx.fillRect(x + 1, 456, 6, 4);
  }
  return true;
}

function drawWire(ctx, intact, kit, ratio) {
  ctx.fillStyle = kit.ironDark;
  for (let i = 0; i < PICKETS; i++) {
    const x = i * 12 + 2;
    const top = 430 + (i % 3) * 2;
    if (intact[i]) {
      ctx.fillRect(x + 2, 426, 5, 1);
      ctx.fillRect(x + 3, 426, 1, top - 426);
      ctx.fillRect(x + 2, top - 1, 1, 1);
      ctx.fillRect(x + 4, top - 1, 1, 1);
      if (intact[i + 1]) ctx.fillRect(x + 7, 426, 7, 1);
    } else if (ratio > FENCE_RUIN) {
      ctx.fillRect(x + 1, 436 + (i % 3) * 2, 6, 1);
    }
  }
}

function postFalls(x, ratio) {
  if (x < 20 || x > 340) return ratio <= FENCE_FAILING;
  if (x === 174) return ratio <= 0;
  return ratio <= FENCE_RUIN;
}

function drawPost(ctx, x, ratio, kit) {
  if (postFalls(x, ratio)) {
    ctx.fillStyle = kit.dark;
    ctx.fillRect(x, 462, 12, 4);
    ctx.fillRect(x + 3, 458, 5, 4);
    ctx.fillStyle = kit.edge;
    ctx.fillRect(x + 1, 465, 10, 2);
    return;
  }
  ctx.fillStyle = kit.edge;
  ctx.fillRect(x, 418, 8, 52);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(x + 1, 420, 6, 48);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(x + 2, 422, 3, 44);
  ctx.fillStyle = kit.iron;
  ctx.fillRect(x, 418, 8, 3);
  ctx.fillRect(x, 446, 8, 4);
  ctx.fillStyle = kit.ironDark;
  ctx.fillRect(x + 1, 447, 6, 1);
  if (ratio <= FENCE_CRACKED) {
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 3, 430, 1, 12);
    if (ratio <= FENCE_FAILING) {
      ctx.fillRect(x + 4, 434, 1, 10);
      ctx.fillRect(x + 2, 438, 1, 6);
    }
  }
}

function drawRubble(ctx, kit, ratio) {
  if (ratio > FENCE_RUIN) return;
  ctx.fillStyle = kit.mid;
  ctx.fillRect(36, 456, 26, 3);
  ctx.fillRect(48, 453, 4, 3);
  ctx.fillRect(188, 458, 34, 3);
  ctx.fillRect(300, 455, 22, 3);
  ctx.fillStyle = kit.edge;
  ctx.fillRect(36, 459, 26, 1);
  ctx.fillRect(188, 461, 34, 1);
  ctx.fillRect(300, 458, 22, 1);
}

function drawSleeper(ctx, ratio, kit) {
  const y = SLEEPER_Y;
  ctx.fillStyle = kit.edge;
  ctx.fillRect(0, y, W, 6);
  ctx.fillStyle = kit.dark;
  ctx.fillRect(0, y + 1, W, 4);
  ctx.fillStyle = kit.mid;
  ctx.fillRect(0, y + 1, W, 2);
  ctx.fillStyle = kit.light;
  ctx.fillRect(0, y, W, 1);
  if (ratio <= FENCE_FAILING) {
    for (let i = 0; i < PICKETS; i++) {
      if (ratio > breakAt(i)) continue;
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(i * 12 + 4, y + 1, 6, 4);
    }
  }
  for (let x = 8; x < W; x += 12) {
    ctx.fillStyle = kit.iron;
    ctx.fillRect(x, y + 2, 1, 2);
  }
}

function drawFence(ctx, ratio) {
  const kit = woodKit(ratio);
  const intact = new Array(PICKETS);
  for (let i = 0; i < PICKETS; i++) intact[i] = drawPicket(ctx, i, ratio, kit);
  drawWire(ctx, intact, kit, ratio);
  drawSleeper(ctx, ratio, kit);
  for (const x of POSTS) drawPost(ctx, x, ratio, kit);
  drawRubble(ctx, kit, ratio);
}

function drawBanner(ctx, ratio, time, reduced, phase) {
  if (ratio < FENCE_RUIN || postFalls(174, ratio)) return;
  const wave = reduced ? 0 : (Math.sin(time * 2.2) > 0 ? 1 : 0);
  const y = 416 + wave;
  ctx.fillStyle = '#6e5432';
  ctx.fillRect(178, 414, 2, 34);
  const torn = ratio <= FENCE_CRACKED;
  const clothW = torn ? 11 : 15;
  ctx.fillStyle = ratio <= FENCE_FAILING ? '#7a3030' : '#9a3a3a';
  ctx.fillRect(180, y, clothW, 9);
  ctx.fillStyle = '#6e2424';
  ctx.fillRect(180, y + 8, clothW, 1);
  ctx.fillStyle = '#d3b984';
  ctx.fillRect(182, y + 3, torn ? 4 : 7, 2);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(184, y + 2, 2, 4);
  if (torn) {
    ctx.fillStyle = '#4e3820';
    ctx.fillRect(180 + clothW, y + 5, 2, 2);
    ctx.fillRect(180 + clothW - 1, y + 7, 3, 2);
  }
  if (phase === 'victory' && ratio > FENCE_FAILING) {
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(182, y + 1, 1, 1);
    ctx.fillRect(188, y + 1, 1, 1);
  }
}

function drawEmbers(ctx, ratio, time, reduced) {
  if (ratio > FENCE_FAILING) return;
  const base = readAlpha(ctx);
  for (let i = 0; i < PICKETS; i++) {
    if (ratio > breakAt(i) || (i % 3) !== 0) continue;
    const loop = reduced ? 0.35 : ((time * (7 + (i % 4)) + i * 1.7) % 16) / 16;
    const x = i * 12 + 5;
    const y = Math.round(462 - loop * 14);
    ctx.globalAlpha = base * (1 - loop) * 0.9;
    ctx.fillStyle = (i % 2) === 0 ? '#ffd08a' : '#e25822';
    ctx.fillRect(x, y, 1, 1 + (i & 1));
  }
  ctx.globalAlpha = base;
}

function drawBrackets(ctx, x, y) {
  ctx.fillStyle = '#d3b984';
  ctx.fillRect(x + 2, y + 2, 7, 2);
  ctx.fillRect(x + 2, y + 2, 2, 7);
  ctx.fillRect(x + 55, y + 2, 7, 2);
  ctx.fillRect(x + 60, y + 2, 2, 7);
  ctx.fillRect(x + 2, y + 68, 7, 2);
  ctx.fillRect(x + 2, y + 63, 2, 7);
  ctx.fillRect(x + 55, y + 68, 7, 2);
  ctx.fillRect(x + 60, y + 63, 2, 7);
  ctx.fillStyle = '#f0cb72';
  ctx.fillRect(x + 2, y + 2, 3, 1);
  ctx.fillRect(x + 59, y + 2, 3, 1);
  ctx.fillStyle = '#7a6240';
  ctx.fillRect(x + 2, y + 69, 7, 1);
  ctx.fillRect(x + 55, y + 69, 7, 1);
}

function drawSlot(ctx, slot, time, reduced, phase) {
  const x = slot.left;
  const y = slot.top;
  const unit = slot.unit;
  const occupied = !!(unit && typeof unit === 'object');
  const hero = occupied && (unit.kind === 'hero' || unit.type === 'hero');
  const front = slot.row === 0;
  ctx.fillStyle = '#070b0e';
  ctx.fillRect(x + 2, y + 2, 64, 72);
  ctx.fillStyle = front ? '#20323c' : '#182830';
  ctx.fillRect(x, y, 64, 72);
  ctx.fillStyle = hero ? '#8a7044' : (occupied ? '#4e6470' : '#9eb4be');
  ctx.fillRect(x, y, 64, 1);
  ctx.fillRect(x, y, 1, 72);
  ctx.fillStyle = '#0c1216';
  ctx.fillRect(x, y + 71, 64, 1);
  ctx.fillRect(x + 63, y, 1, 72);
  ctx.fillStyle = occupied ? (front ? '#1a2c36' : '#14242c') : '#0e161c';
  ctx.fillRect(x + 4, y + 4, 56, 48);
  ctx.fillStyle = '#5c6a72';
  ctx.fillRect(x + 3, y + 3, 2, 2);
  ctx.fillRect(x + 59, y + 3, 2, 2);
  ctx.fillRect(x + 3, y + 48, 2, 2);
  ctx.fillRect(x + 59, y + 48, 2, 2);
  const foot = y + 36;
  ctx.fillStyle = front ? '#314654' : '#283848';
  ctx.fillRect(x + 8, foot - 2, 48, 14);
  ctx.fillStyle = hero ? '#d3b984' : '#6a8490';
  ctx.fillRect(x + 8, foot - 2, 48, 1);
  ctx.fillStyle = '#10181c';
  ctx.fillRect(x + 10, foot + 8, 44, 3);
  ctx.fillStyle = '#243844';
  ctx.fillRect(x + 6, foot, 4, 8);
  ctx.fillRect(x + 54, foot, 4, 8);
  fillStandingGround(ctx, x + 2, y + 52, 60, 18);
  if (!occupied) {
    const pulse = phase === 'placing' && !reduced && Math.sin(time * 3) > 0;
    const cx = x + 31;
    const cy = y + 18;
    ctx.fillStyle = pulse ? '#d7f3f8' : '#6d8794';
    ctx.fillRect(cx, cy - 6, 2, 14);
    ctx.fillRect(cx - 6, cy, 14, 2);
    ctx.fillStyle = '#d5e6ea';
    ctx.fillRect(cx, cy, 2, 2);
  } else {
    ctx.fillStyle = '#8aa0aa';
    ctx.fillRect(x + 12, foot - 1, 2, 2);
    ctx.fillRect(x + 50, foot - 1, 2, 2);
  }
  if (hero) {
    drawBrackets(ctx, x, y);
    ctx.fillStyle = '#7a6240';
    ctx.fillRect(x + 12, foot + 5, 40, 2);
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(x + 12, foot + 5, 40, 1);
  }
}

function drawTies(ctx, top) {
  const y = top + 44;
  ctx.fillStyle = '#8ea0a6';
  ctx.fillRect(0, y, 4, 1);
  ctx.fillRect(356, y, 4, 1);
  for (const gap of [68, 140, 212, 284]) {
    ctx.fillStyle = '#5c6a72';
    ctx.fillRect(gap, y, 8, 2);
    ctx.fillStyle = '#c5d0d4';
    ctx.fillRect(gap, y, 8, 1);
  }
}

function readSlots(state) {
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const geo = slotGeometry(i);
    const unit = state && state.slots && state.slots[i] ? state.slots[i].unit : null;
    slots.push({ ...geo, unit: unit || null });
  }
  return slots;
}

function drawWorld(ctx, state, options) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const opts = options && typeof options === 'object' ? options : {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const reduced = !!opts.reducedMotion;
  const phase = state && typeof state.phase === 'string' ? state.phase : 'playing';
  const ratio = fenceRatio(state);
  const canStack = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canStack) ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* ignored */ }
    if (typeof ctx.beginPath === 'function' && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    }
    const cached = backdropCanvas();
    if (cached && typeof ctx.drawImage === 'function') ctx.drawImage(cached, 0, 0, W, H);
    else paintBackdrop(ctx);
    if (directorHasBoss(state)) drawBossWave(ctx, time, reduced);
    drawStars(ctx, time, reduced);
    drawMist(ctx, time, reduced);
    drawGrass(ctx, time, reduced);
    drawFence(ctx, ratio);
    drawBanner(ctx, ratio, time, reduced, phase);
    drawEmbers(ctx, ratio, time, reduced);
    for (const slot of readSlots(state)) drawSlot(ctx, slot, time, reduced, phase);
    drawTies(ctx, ARENA.frontY - 36);
    drawTies(ctx, ARENA.backY - 36);
  } finally {
    if (canStack) ctx.restore();
  }
}

function iconRows(id, rows) {
  if (!Array.isArray(rows) || rows.length !== 16) throw new Error(`Fencefall icon "${id}" must have 16 rows`);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row !== 'string' || row.length !== 16) throw new Error(`Fencefall icon "${id}" row ${i} must be 16 wide`);
    for (const ch of row) {
      if (ch !== '.' && !PAL[ch]) throw new Error(`Fencefall icon "${id}" swatch "${ch}" is unknown`);
    }
  }
  if (!rows.some(row => [...row].some(ch => ch !== '.'))) throw new Error(`Fencefall icon "${id}" is blank`);
  return rows;
}

const ICONS = {
  bolt: iconRows('bolt', [
    '................',
    '.......yy.......',
    '......ywwy......',
    '......yw.y......',
    '.......yy.......',
    '.......mm.......',
    '.......mm.......',
    '.......mm.......',
    '......mMMm......',
    '......mmmm......',
    '.......mm.......',
    '......m..m......',
    '.......mm.......',
    '................',
    '................',
    '................'
  ]),
  fire: iconRows('fire', [
    '................',
    '.......r........',
    '......rrr.......',
    '.....rrfrr......',
    '.....rfyfr......',
    '....rrfyyrr.....',
    '....rfyyyfr.....',
    '...rrfyyyyrr....',
    '...rfyyyyyfr....',
    '....rfyyyRr.....',
    '.....rRRRr......',
    '......RRR.......',
    '.......R........',
    '................',
    '................',
    '................'
  ]),
  frost: iconRows('frost', [
    '................',
    '.......C........',
    '......aCa.......',
    '.....aCCCa......',
    '....aCCwwCa.....',
    '...aCCwCCwCa....',
    '....aCwwCCa.....',
    '.....aCCCa......',
    '......aCa.......',
    '.......C........',
    '......a.a.......',
    '.....a...a......',
    '......ccc.......',
    '................',
    '................',
    '................'
  ]),
  lightning: iconRows('lightning', [
    '................',
    '......yy........',
    '.....yyy........',
    '.....fyy........',
    '....yy..........',
    '...yyy..........',
    '..yyyyyy........',
    '......fy........',
    '.....yy.........',
    '....yy..........',
    '...fy...........',
    '..yy............',
    '................',
    '................',
    '................',
    '................'
  ]),
  poison: iconRows('poison', [
    '................',
    '.......b........',
    '......bbb.......',
    '.....bBBBb......',
    '.....bbwbb......',
    '....bbbBbbb.....',
    '....bbBBBbb.....',
    '.....bBBBb......',
    '......bBb.......',
    '.......B........',
    '......b.b.......',
    '.......b........',
    '................',
    '................',
    '................',
    '................'
  ]),
  support: iconRows('support', [
    '................',
    '.......g........',
    '......ggg.......',
    '.......m........',
    '......mym.......',
    '.....myyym......',
    '.....mywym......',
    '.....myyym......',
    '......mym.......',
    '.......m........',
    '......mmm.......',
    '.......m........',
    '......m.m.......',
    '................',
    '................',
    '................'
  ]),
  hero: iconRows('hero', [
    '................',
    '......yyy.......',
    '.....ygggy......',
    '....ygwwwgy.....',
    '....gwkkwkg.....',
    '....gwwwwkg.....',
    '.....gwwgg......',
    '......mmm.......',
    '.....mmmmm......',
    '....mmgggmm.....',
    '....mmmmmmm.....',
    '.....mgggm......',
    '......mmm.......',
    '.......m........',
    '................',
    '................'
  ]),
  hybrid: iconRows('hybrid', [
    '................',
    '....aa..........',
    '...aCCa.........',
    '..aCCCCa....r...',
    '..aCwCCa...rr...',
    '...aCCa...rfr...',
    '..........rfr...',
    '....gg...rr.....',
    '...gGGg.........',
    '..gGGGGg........',
    '..gGwGGg........',
    '...gGGg.........',
    '....gg..........',
    '................',
    '................',
    '................'
  ]),
  tower: iconRows('tower', [
    '................',
    '....m......m....',
    '....mm....mm....',
    '....mymmmym.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '......mmm.......',
    '......mym.......',
    '......mmm.......',
    '.....mmmmm......',
    '....mmmmmmm.....',
    '....MMMMMMM.....',
    '................',
    '................',
    '................',
    '................'
  ]),
  burn: iconRows('burn', [
    '................',
    '........r.......',
    '.......rrr......',
    '......rfyr......',
    '......ryyr......',
    '.......rR.......',
    '....RRRRRRR.....',
    '....kkkkkkk.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  slow: iconRows('slow', [
    '................',
    '......CCCC......',
    '.....C....C.....',
    '.....C.ww.C.....',
    '......C..C......',
    '.......CC.......',
    '......C..C......',
    '.....C....C.....',
    '.....C.ww.C.....',
    '......CCCC......',
    '.......mm.......',
    '......m..m......',
    '................',
    '................',
    '................',
    '................'
  ]),
  stun: iconRows('stun', [
    '................',
    '.......y........',
    '......y.y.......',
    '...y...y...y....',
    '....y.yyy.y.....',
    '.....yyyyy......',
    '...yyyyyyyyy....',
    '.....yyyyy......',
    '....y.yyy.y.....',
    '...y...y...y....',
    '......y.y.......',
    '.......y........',
    '................',
    '................',
    '................',
    '................'
  ]),
  brittle: iconRows('brittle', [
    '................',
    '......mmmm......',
    '.....mwwwwm.....',
    '....mw.w..wm....',
    '....mw..w..m....',
    '....m..w...m....',
    '....m...w.wm....',
    '.....m.w.wm.....',
    '......mmmm......',
    '.......dd.......',
    '......d..d......',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  fence: iconRows('fence', [
    '................',
    '...m.m.m.m.m.m..',
    '...mmmmmmmmmmm..',
    '...me.e.e.e.m...',
    '...me.e.e.e.m...',
    '...me.e.e.e.m...',
    '...mmmmmmmmmmm..',
    '...m........m...',
    '..mmm......mmm..',
    '..m.m......m.m..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  hp: iconRows('hp', [
    '................',
    '................',
    '.....rr..rr.....',
    '....rrrrrrrr....',
    '....rrwwrrrr....',
    '....rrrrrrrr....',
    '.....rrrrrr.....',
    '......rrrr......',
    '.......rr.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  xp: iconRows('xp', [
    '................',
    '.......y........',
    '......yyy.......',
    '.....yyyyy......',
    '....yywywyy.....',
    '...yyyyyyyyy....',
    '..yyyyyyyyyyyy..',
    '......yyy.......',
    '......yyy.......',
    '......yyy.......',
    '.....yyyyy......',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  wave: iconRows('wave', [
    '................',
    '..m....m....m...',
    '.mm...mm...mm...',
    'm.m..m.m..m.m...',
    'mmm..mmm..mmm...',
    '................',
    '...m....m....m..',
    '..mm...mm...mm..',
    '.m.m..m.m..m.m..',
    '.mmm..mmm..mmm..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  crit: iconRows('crit', [
    '................',
    '.......y........',
    '..y...yyy...y...',
    '...y.yyyyy.y....',
    '....yyyyyyy.....',
    '.yyyyywywyyyyy..',
    '....yyyyyyy.....',
    '...y.yyyyy.y....',
    '..y...yyy...y...',
    '.......y........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  damage: iconRows('damage', [
    '................',
    '.............g..',
    '............gg..',
    '...........gwg..',
    '..........g.g...',
    '.........g.g....',
    '........g.g.....',
    '.......g.g......',
    '......g.g.......',
    '.....g.g........',
    '....mmm.........',
    '.....m..........',
    '................',
    '................',
    '................',
    '................'
  ]),
  range: iconRows('range', [
    'gg..........gg..',
    'g............g..',
    'g............g..',
    '................',
    '................',
    '.......aa.......',
    '......a..a......',
    '......a..a......',
    '.......aa.......',
    '................',
    '................',
    'g............g..',
    'g............g..',
    'gg..........gg..',
    '................',
    '................'
  ]),
  haste: iconRows('haste', [
    '................',
    '......ggg.......',
    '.....g...g......',
    '....gg...gg.....',
    '...gg..g..gg....',
    '..gg..ggg..gg...',
    '......ggg.......',
    '.....gg.gg......',
    '....gg...gg.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  rank: iconRows('rank', [
    '................',
    '.......m........',
    '......mmm.......',
    '.....m...m......',
    '................',
    '......yyy.......',
    '.....yyyyy......',
    '....yy...yy.....',
    '................',
    '.....ggggg......',
    '....ggggggg.....',
    '...gg.....gg....',
    '................',
    '................',
    '................',
    '................'
  ]),
  merge: iconRows('merge', [
    '................',
    '...a......gg....',
    '....a....g..g...',
    '.aaaaaaa.g..g...',
    '....a....gggg...',
    '...a......gg....',
    '.........g..g...',
    '.......ggggggg..',
    '.........g..g...',
    '..........gg....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  pause: iconRows('pause', [
    '................',
    '................',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '....mmm..mmm....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  play: iconRows('play', [
    '................',
    '................',
    '....m...........',
    '....mm..........',
    '....mmm.........',
    '....mmmm........',
    '....mmmmm.......',
    '....mmmm........',
    '....mmm.........',
    '....mm..........',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  victory: iconRows('victory', [
    '................',
    '.......g........',
    '......gyg.......',
    '.....gyyyg......',
    '....gyyyyyyg....',
    '...gyyyyyyyyg...',
    '....gyyyyyyg....',
    '.....gyyyg......',
    '......gyg.......',
    '.......g........',
    '......mmm.......',
    '.....mmmmm......',
    '......mmm.......',
    '................',
    '................',
    '................'
  ]),
  defeat: iconRows('defeat', [
    '................',
    '......kkkk......',
    '.....kwwwk......',
    '....kwywywk.....',
    '....kwkkkwk.....',
    '....kwwwwwk.....',
    '.....kwwkk......',
    '......kkk.......',
    '......k.k.......',
    '.....k...k......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  weapon: iconRows('weapon', [
    '................',
    '.......m........',
    '......mm........',
    '......mm........',
    '.....mwm........',
    '.....mm.........',
    '....mm..........',
    '....mm..........',
    '...mmm..........',
    '..myym..........',
    '...mm...........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  charm: iconRows('charm', [
    '................',
    '.......g........',
    '......g.g.......',
    '......gyg.......',
    '.......g........',
    '......y.y.......',
    '.......g........',
    '......g.g.......',
    '.......g........',
    '......g.g.......',
    '.......g........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  armor: iconRows('armor', [
    '................',
    '.....mmmmm......',
    '....mmmmmmm.....',
    '....mmmwmmm.....',
    '....mmmmmmm.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '......mmm.......',
    '......m.m.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  vitality: iconRows('vitality', [
    '................',
    '.....rr..rr.....',
    '....rrrrrrrr....',
    '....rrryyrrr....',
    '.....rryyrr.....',
    '......rrr.......',
    '.......r........',
    '......mmm.......',
    '......mym.......',
    '......mmm.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  locked: iconRows('locked', [
    '................',
    '......mmm.......',
    '.....m...m......',
    '.....m...m......',
    '....mmmmmmm.....',
    '....mmmywmm.....',
    '....mmmmmmm.....',
    '....mmmmmmm.....',
    '.....mmmmm......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  plus: iconRows('plus', [
    '................',
    '................',
    '.......gg.......',
    '.......gg.......',
    '.......gg.......',
    '....gggggggg....',
    '....gggggggg....',
    '.......gg.......',
    '.......gg.......',
    '.......gg.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  warning: iconRows('warning', [
    '................',
    '.......y........',
    '......yyy.......',
    '.....yy.yy......',
    '....yy.k.yy.....',
    '...yy.yyy.yy....',
    '..yy.yyyyy.yy...',
    '.yy.yy.k.yy.yy..',
    '.yyyyyyyyyyyyy..',
    '....MMMMMMM.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  currency: iconRows('currency', [
    '................',
    '................',
    '......gggg......',
    '.....g....g.....',
    '.....g.yy.g.....',
    '.....g.yy.g.....',
    '.....g....g.....',
    '......gggg......',
    '.......GG.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  move: iconRows('move', [
    '................',
    '.......a........',
    '......aaa.......',
    '.....aa.aa......',
    '....aa...aa.....',
    '.......a........',
    '.......a........',
    '.......a........',
    '....ggggggg.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  sound: iconRows('sound', [
    '................',
    '....m...........',
    '....mm..y.......',
    '.mmmmm..y.y.....',
    '.m.mmm..y...y...',
    '.m.mmm..y.y.....',
    '.mmmmm..y.......',
    '....mm..........',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  mute: iconRows('mute', [
    '................',
    '....m......r....',
    '....mm....r.....',
    '.mmmmm...r......',
    '.m.mmm..r.......',
    '.m.mmm...r......',
    '.mmmmm....r.....',
    '....mm.....r....',
    '....m...........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  splash: iconRows('splash', [
    '................',
    '.......r........',
    '..r...rrr...r...',
    '...r.rrfrr.r....',
    '....rrrrrrr.....',
    '.rrrrrryyrrrrr..',
    '....rrrrrrr.....',
    '...r.rrfrr.r....',
    '..r...rrr...r...',
    '.......r........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]),
  chain: iconRows('chain', [
    '................',
    '....mm..........',
    '...m..m.........',
    '...m..m...mm....',
    '....mm...m..m...',
    '........m..m....',
    '....mm...mm.....',
    '...m..m.........',
    '...m..m...mm....',
    '....mm...m..m...',
    '........m..m....',
    '.........mm.....',
    '................',
    '................',
    '................',
    '................'
  ]),
  pierce: iconRows('pierce', [
    '................',
    '.............y..',
    '....MMMM....yy..',
    '....MMMM...y.y..',
    '....MMMM....yy..',
    '....MMMM.....y..',
    '....MMMM........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ])
};

const ACCENTS = ['g', 'y', 'r', 'f', 'a', 'C', 'b', 'p', 'm', 'e'];

function fallbackRows(id) {
  const h = hashString(id || '?');
  const a = ACCENTS[h % ACCENTS.length];
  const b = ACCENTS[(h >>> 5) % ACCENTS.length];
  const diamond = [
    '................',
    '................',
    '......mmmm......',
    '.....m....m.....',
    '....m......m....',
    '...m........m...',
    '...m...12...m...',
    '...m..1221..m...',
    '...m...12...m...',
    '...m........m...',
    '....m......m....',
    '.....m....m.....',
    '......mmmm......',
    '.......MM.......',
    '................',
    '................'
  ];
  return diamond.map(row => row.split('1').join(a).split('2').join(b));
}

function normalizeId(id) {
  return String(id ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rowsFor(id) {
  const key = normalizeId(id);
  if (ICONS[key]) return ICONS[key];
  const alias = ALIASES[key];
  if (alias && ICONS[alias]) return ICONS[alias];
  return fallbackRows(key || '?');
}

function drawIcon(ctx, id, x, y, size = 16) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const box = Number.isFinite(size) && size > 0 ? size : 16;
  const scale = box / 16;
  const rows = rowsFor(id);
  const canStack = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canStack) ctx.save();
  try {
    try { ctx.imageSmoothingEnabled = false; } catch { /* ignored */ }
    for (let row = 0; row < 16; row++) {
      const line = rows[row];
      for (let col = 0; col < 16; col++) {
        const color = PAL[line[col]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  } finally {
    if (canStack) ctx.restore();
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
const CONTRACT_VERSION = 1;
__ff_exports["CONTRACT_VERSION"] = CONTRACT_VERSION;

const STEP = 1 / 60;
__ff_exports["STEP"] = STEP;

const ARENA = Object.freeze({width:360,height:640,spawnY:-16,enemyMinX:14,enemyMaxX:346,fenceY:450,rows:2,cols:5,slotWidth:64,slotHeight:72,frontY:508,backY:592});
__ff_exports["ARENA"] = ARENA;

function freezeDifficulty(row){Object.freeze(row.name);return Object.freeze(row);}
const DIFFICULTIES = Object.freeze({
 easy:freezeDifficulty({name:{en:'Easy',zh:'轻松'},health:0.8,speed:0.9,damage:0.75,count:0.9,reward:1,fence:650}),
 normal:freezeDifficulty({name:{en:'Normal',zh:'标准'},health:1,speed:1,damage:1,count:1,reward:1.4,fence:600}),
 hard:freezeDifficulty({name:{en:'Hard',zh:'困难'},health:1.3,speed:1.08,damage:1.25,count:1.1,reward:1.9,fence:570}),
 nightmare:freezeDifficulty({name:{en:'Nightmare',zh:'噩梦'},health:1.65,speed:1.15,damage:1.5,count:1.2,reward:2.5,fence:540})
});
__ff_exports["DIFFICULTIES"] = DIFFICULTIES;

const BASE_TYPES = Object.freeze(['bolt','fire','frost','lightning','poison','support']);
__ff_exports["BASE_TYPES"] = BASE_TYPES;

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
__ff_exports["clamp"] = clamp;

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
__ff_exports["distance"] = distance;

const clone=value=>JSON.parse(JSON.stringify(value));
__ff_exports["clone"] = clone;

function random(state){state.rng=(state.rng+0x6D2B79F5)>>>0;let t=state.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
function uid(state,prefix='e'){return `${prefix}${state.nextId++}`;}
function emit(state,type,data={}){if(!Array.isArray(state.events))state.events=[];const event={...data,type,time:state.time};state.events.push(event);if(state.events.length>400){const kept=state.events.slice(-399);const prior=state.events.find(item=>item&&(item.type==='victory'||item.type==='defeat'||item.type==='draft'));if(prior&&prior!==event&&!kept.includes(prior))kept.unshift(prior);state.events=kept;}}
function slotGeometry(index){const row=Math.floor(index/5),col=index%5,x=36+72*col,y=row?ARENA.backY:ARENA.frontY;return {index,row,col,x,y,left:x-32,top:y-36,width:64,height:72};}
function hitSlot(x,y){for(let i=0;i<10;i++){const s=slotGeometry(i);if(x>=s.left&&x<s.left+s.width&&y>=s.top&&y<s.top+s.height)return i;}return -1;}
function unitPosition(state,id){const slot=state.slots.find(s=>s.unit?.id===id);return slot?{x:slot.x,y:slot.y}:null;}
function canPlan(state){if(!state||state.phase==='placing'||state.phase==='victory'||state.phase==='defeat')return false;return state.paused===true||state.phase==='draft';}
function createUnit(state,type='bolt',rank=1,kind=type==='hero'?'hero':'tower'){return {id:uid(state,'u'),kind,type,rank,upgrades:{},cooldown:0,kills:0};}

};
__ff_factories["src/state.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["createProfile"] = createProfile;
__ff_exports["createRun"] = createRun;
const __ff_m0 = __ff_load("src/shared.js");
const CONTRACT_VERSION = __ff_m0["CONTRACT_VERSION"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clone = __ff_m0["clone"];
const slotGeometry = __ff_m0["slotGeometry"];
const createUnit = __ff_m0["createUnit"];

function createProfile(language='en'){return {version:1,currency:0,equipmentOwned:[],equipped:{weapon:null,charm:null,armor:null},permanent:{damage:0,haste:0,vitality:0},settledRuns:[],best:{},settings:{language:language==='zh'?'zh':'en',sound:false,reducedMotion:false,difficulty:'normal'}};}
function createRun({seed=123456,difficulty='normal',profile=createProfile(),runId}={}){
 if(!DIFFICULTIES[difficulty])difficulty='normal';
 const id=runId||`run-${Date.now()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
 const hp=DIFFICULTIES[difficulty].fence;
 const state={version:CONTRACT_VERSION,runId:id,seed:seed>>>0,rng:seed>>>0,nextId:1,time:0,tick:0,accumulator:0,phase:'playing',paused:false,hiddenPaused:false,speed:1,difficulty,wave:0,waveTime:0,director:{nextWave:0,queue:[],done:false},kills:0,xp:0,nextDraftXp:8,draftLevel:0,fence:{hp,maxHp:hp},slots:Array.from({length:10},(_,i)=>({...slotGeometry(i),unit:null})),enemies:[],projectiles:[],clouds:[],events:[],draft:null,pendingUnit:null,profileSnapshot:clone(profile),settlement:null,stats:{damage:0,fenceDamage:0,merges:0,crits:0},initialized:false,endless:false,systems:{}};
 state.slots[2].unit=createUnit(state,'hero');
 return state;
}

};
__ff_factories["src/storage.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["loadProfile"] = loadProfile;
__ff_exports["saveProfile"] = saveProfile;
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
const MAX_CLOUDS = 400;
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
const ENEMY_KINDS = new Set(['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss']);
const STATUS_TYPES = new Set(['burn', 'poison', 'slow', 'stun', 'brittle']);
const PHASES = new Set(['playing', 'draft', 'placing', 'victory', 'defeat']);
const RESULTS = new Set(['victory', 'defeat', 'abandon']);
const EQUIPPED_SLOTS = ['weapon', 'charm', 'armor'];
const PERMANENT_KEYS = ['damage', 'haste', 'vitality'];
const ID_RE = /^[A-Za-z0-9._:-]+$/;
const UID_RE = /^[A-Za-z]{1,8}(\d+)$/;

const PROFILE_KEYS = new Set(['version', 'currency', 'equipmentOwned', 'equipped', 'permanent', 'settledRuns', 'best', 'settings']);
const SETTINGS_KEYS = new Set(['language', 'sound', 'reducedMotion', 'difficulty']);
const RUN_KEYS = new Set([
  'version', 'runId', 'seed', 'rng', 'nextId', 'time', 'tick', 'accumulator', 'phase', 'paused', 'hiddenPaused',
  'speed', 'difficulty', 'wave', 'waveTime', 'director', 'kills', 'xp', 'nextDraftXp', 'draftLevel', 'fence',
  'slots', 'enemies', 'projectiles', 'clouds', 'events', 'draft', 'pendingUnit', 'profileSnapshot', 'settlement',
  'stats', 'initialized', 'endless', 'systems'
]);
const DIRECTOR_KEYS = new Set(['nextWave', 'queue', 'done']);
const FENCE_KEYS = new Set(['hp', 'maxHp']);
const STAT_KEYS = new Set(['damage', 'fenceDamage', 'merges', 'crits']);
const UNIT_KEYS = new Set(['id', 'kind', 'type', 'rank', 'upgrades', 'cooldown', 'kills']);
const ENEMY_KEYS = new Set([
  'id', 'kind', 'x', 'y', 'hp', 'maxHp', 'speed', 'radius', 'damage', 'attackInterval', 'attackCooldown',
  'xp', 'armor', 'driftPhase', 'driftVelocity', 'statuses', 'attacking', 'dead'
]);
const STATUS_KEYS = new Set(['type', 'power', 'remaining', 'sourceId', 'stacks', 'tickTimer']);
const PROJECTILE_KEYS = new Set([
  'id', 'sourceId', 'targetId', 'x', 'y', 'speed', 'damage', 'crit', 'tags', 'splash', 'chain', 'chainRange',
  'pierce', 'visited', 'life'
]);
const OPTION_KEYS = new Set(['id', 'kind', 'type', 'upgradeId', 'replace']);
const DRAFT_KEYS = new Set(['options']);
const PENDING_KEYS = new Set(['unit', 'replace']);
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
  if (value === 1 || value === 3) return value;
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
  if (Object.keys(profile.equipped).some(key => !EQUIPPED_SLOTS.includes(key))) return fail('invalid_profile');
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
  if (Object.keys(profile.permanent).some(key => !PERMANENT_KEYS.includes(key))) return fail('invalid_profile');
  const permanent = {
    damage: profile.permanent.damage,
    haste: profile.permanent.haste,
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
  } else if (kind === 'hybrid') {
    if (type === 'hero' || !isId(type, 64)) return fail('invalid_enum');
    if (!isInt(rank, 1, 4)) return fail('invalid_bounds');
  } else {
    return fail('invalid_enum');
  }
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
    kills: unit.kills
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
  const cloudValue = next.value;
  if ('x' in cloudValue && !isNum(cloudValue.x, -80, ARENA.width + 80)) return fail('invalid_bounds');
  if ('y' in cloudValue && !isNum(cloudValue.y, -120, ARENA.height + 40)) return fail('invalid_bounds');
  if ('id' in cloudValue) {
    if (!isId(cloudValue.id, 64) || !claimId(cloudValue.id, ids)) return fail('invalid_run');
    noteUid(cloudValue.id, mark);
  }
  return pass(cloudValue);
}

function optionSignature(option) {
  return `${option.kind}|${option.type || ''}|${option.upgradeId || ''}|${option.replace ? '1' : '0'}`;
}

function validateOption(option) {
  if (!isPlain(option) || !isId(option.id, 64)) return fail('invalid_run');
  const value = {id: option.id, kind: option.kind};
  if (option.kind === 'tower') {
    if (!BASE_TYPE_SET.has(option.type)) return fail('invalid_enum');
    if (option.upgradeId != null) return fail('invalid_run');
    value.type = option.type;
  } else if (option.kind === 'hero_upgrade') {
    if (!isId(option.upgradeId, 64) || option.type != null) return fail('invalid_run');
    value.upgradeId = option.upgradeId;
  } else {
    return fail('invalid_enum');
  }
  if (option.replace !== undefined) {
    if (!isBool(option.replace)) return fail('invalid_run');
    value.replace = option.replace;
  }
  const extra = copyExtensions(option, value, OPTION_KEYS);
  if (!extra.ok) return extra;
  return pass(value);
}

function validateDraft(draft) {
  if (draft === null) return pass(null);
  if (!isPlain(draft) || !Array.isArray(draft.options) || draft.options.length !== 3) return fail('invalid_run');
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
  if (!extra.ok) return fail(extra.reason === 'invalid_bounds' ? 'invalid_settlement' : 'invalid_settlement');
  return pass(value);
}

function validatePhaseShape(phase, draft, pendingUnit) {
  if (phase === 'draft') return draft !== null && pendingUnit === null;
  if (phase === 'placing') return draft !== null && pendingUnit !== null;
  return draft === null && pendingUnit === null;
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
  if (!isInt(state.stats.merges, 0, MAX_UNIT_KILLS) || !isInt(state.stats.crits, 0, MAX_UNIT_KILLS)) return fail('invalid_bounds');

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

  let pendingUnit = null;
  if (state.pendingUnit !== null) {
    if (!isPlain(state.pendingUnit) || !isBool(state.pendingUnit.replace)) return fail('invalid_run');
    const next = validateUnit(state.pendingUnit.unit, 'defender', ids, mark);
    if (!next.ok) return next;
    pendingUnit = {unit: next.value, replace: state.pendingUnit.replace};
    const extra = copyExtensions(state.pendingUnit, pendingUnit, PENDING_KEYS);
    if (!extra.ok) return extra;
  }
  if (!validatePhaseShape(state.phase, draft.value, pendingUnit)) return fail('invalid_run');

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
    merges: state.stats.merges,
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
    pendingUnit,
    profileSnapshot: snapshot.value,
    settlement: settlement.value,
    stats,
    initialized: state.initialized,
    endless: state.endless
  };
  if (state.systems !== undefined) {
    if (!isPlain(state.systems)) return fail('invalid_run');
    const systems = {};
    const systemsExtra = copyExtensions(state.systems, systems, new Set());
    if (!systemsExtra.ok) return systemsExtra;
    value.systems = systems;
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
  if (keys.length !== 4 || keys.some(key => !['format', 'version', 'profile', 'run'].includes(key))) {
    return {ok: false, reason: 'invalid_format'};
  }
  if (parsed.format !== SAVE_FORMAT) return {ok: false, reason: 'invalid_format'};
  if (parsed.version !== CONTRACT_VERSION) return {ok: false, reason: 'invalid_version'};
  const profile = validateProfile(parsed.profile);
  if (!profile.ok) return {ok: false, reason: profile.reason};
  let run = null;
  if (parsed.run !== null) {
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
  return {ok: true, profile: profile.value, run};
}

};
__ff_factories["src/systems/combat.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["damageEnemy"] = damageEnemy;
__ff_exports["killEnemy"] = killEnemy;
__ff_exports["updateCombat"] = updateCombat;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/towers.js");
const __ff_m2 = __ff_load("src/systems/status.js");
const ARENA = __ff_m0["ARENA"];
const clamp = __ff_m0["clamp"];
const distance = __ff_m0["distance"];
const emit = __ff_m0["emit"];
const random = __ff_m0["random"];
const uid = __ff_m0["uid"];
const getUnitStats = __ff_m1["getUnitStats"];
const applyStatus = __ff_m2["applyStatus"];
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
//
// killEnemy awards kills, source unit.kills, and enemy.xp exactly once. It does
// not remove the body. updateCombat drops dead enemies at the end of the step.
// Engine cleanup may filter `dead` again but must not award kills or XP again.





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
  return !!(enemy && !enemy.dead && enemy.hp > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
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
    state.stats = {damage: 0, fenceDamage: 0, merges: 0, crits: 0};
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

function preferTarget(candidate, best, candidateDistance, bestDistance) {
  if (!best) return true;
  const diff = candidateDistance - bestDistance;
  if (diff < -1e-4) return true;
  if (diff > 1e-4) return false;
  if ((candidate.y || 0) !== (best.y || 0)) return candidate.y > best.y;
  return String(candidate.id) < String(best.id);
}

function ignored(ignore, id) {
  if (!ignore) return false;
  for (let i = 0; i < ignore.length; i++) {
    if (ignore[i] === id) return true;
  }
  return false;
}

function nearestEnemy(state, origin, range, ignore) {
  if (!(range > 0)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || ignored(ignore, enemy.id)) continue;
    const dist = distance(origin, enemy);
    if (dist <= range && preferTarget(enemy, best, dist, bestDistance)) {
      best = enemy;
      bestDistance = dist;
    }
  }
  return best;
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
 * included when options.crit is set). Armor and brittle are applied here.
 * Returns HP actually removed. Usable as the status damage callback.
 */
function damageEnemy(state, enemy, amount, options = {}) {
  if (!state || !enemy || enemy.dead) return 0;
  const opts = options || {};
  if (!Number.isFinite(enemy.hp)) return 0;
  if (enemy.hp <= 0) {
    killEnemy(state, enemy, opts.sourceId);
    return 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const armor = clamp(finite(enemy.armor, 0), 0, ARMOR_CAP);
  const reduced = amount * (1 - armor) * (1 + brittleBonus(enemy));
  if (!Number.isFinite(reduced) || reduced <= 0) return 0;
  const dealt = Math.min(enemy.hp, reduced);
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
    attack: opts.type || 'hit',
    towerType: opts.towerType || null
  });
  if (enemy.hp <= 1e-6) {
    enemy.hp = 0;
    killEnemy(state, enemy, opts.sourceId);
  }
  return dealt;
}

/** Award kill credit, XP from enemy.xp, and a kill event. Repeat calls are no-ops. */
function killEnemy(state, enemy, sourceId) {
  if (!state || !enemy || enemy.dead) return false;
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

function impactDamage(projectile, enemy) {
  let amount = finite(projectile.damage, 0);
  if (projectile.crit) amount *= Math.max(1, finite(projectile.critMultiplier, 1));
  const mechanics = projectile.mechanics || [];
  if (mechanics.includes('execute') && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= EXECUTE_THRESHOLD) {
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

function applySplash(state, projectile, primary) {
  const radius = projectile.splash;
  if (!(radius > 0)) return;
  for (const enemy of state.enemies) {
    if (!isTargetable(enemy) || enemy.id === primary.id) continue;
    if (distance(primary, enemy) > radius) continue;
    damageEnemy(state, enemy, impactDamage(projectile, enemy), {
      sourceId: projectile.sourceId,
      type: 'splash',
      crit: false,
      towerType: projectile.towerType
    });
    applyPayload(enemy, projectile);
  }
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
  damageEnemy(state, enemy, impactDamage(projectile, enemy), {
    sourceId: projectile.sourceId,
    type: attack,
    crit: !!projectile.crit,
    towerType: projectile.towerType
  });
  applyPayload(enemy, projectile);
  applySplash(state, projectile, enemy);

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
  const target = nearestEnemy(state, origin, range, null);
  if (!target) return false;
  const rolled = rollShot(state, stats, bonus);
  if (!(rolled.damage > 0)) return false;
  const mechanics = mechanicList(stats);
  const projectile = makeProjectile(state, unit, slot, stats, target, rolled, mechanics);
  state.projectiles.push(projectile);
  emitEvent(state, 'shot', {
    sourceId: unit.id,
    targetId: target.id,
    x: projectile.x,
    y: projectile.y,
    damage: rolled.crit ? rolled.damage * rolled.critMultiplier : rolled.damage,
    crit: rolled.crit,
    towerType: unit.type || null
  });
  if (mechanics.includes('multishot')) {
    const second = nearestEnemy(state, origin, range, [target.id]);
    if (second) {
      const echoMechanics = mechanics.filter(name => name !== 'multishot');
      const echo = makeProjectile(state, unit, slot, stats, second, rolled, echoMechanics);
      echo.tags.push('echo');
      state.projectiles.push(echo);
      emitEvent(state, 'shot', {
        sourceId: unit.id,
        targetId: second.id,
        x: echo.x,
        y: echo.y,
        damage: rolled.crit ? rolled.damage * rolled.critMultiplier : rolled.damage,
        crit: rolled.crit,
        towerType: unit.type || null
      });
    }
  }
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

function updateDefenders(state, dt, roster, aura) {
  const shotCap = Math.max(1, Math.min(30, Math.ceil(dt / MIN_ATTACK_INTERVAL) + 1));
  for (const entry of roster) {
    const {unit, slot, stats} = entry;
    unit.cooldown = finite(unit.cooldown, 0) - dt;
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

function biteFence(state, amount, x, sourceId, enemyKind) {
  const fence = state.fence;
  if (!fence || !(fence.hp > 0) || !(amount > 0) || !Number.isFinite(amount)) return 0;
  const applied = Math.min(fence.hp, amount);
  const maxHp = Number.isFinite(fence.maxHp) ? fence.maxHp : fence.hp;
  fence.hp = clamp(fence.hp - amount, 0, Math.max(0, maxHp));
  const stats = ensureStats(state);
  stats.fenceDamage = finite(stats.fenceDamage, 0) + applied;
  emitEvent(state, 'fence_hit', {
    sourceId: sourceId || null,
    x,
    y: ARENA.fenceY,
    damage: applied,
    enemyKind: enemyKind || null
  });
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

function updateFenceAttacks(state, dt) {
  const fence = state.fence;
  if (!fence || !Number.isFinite(fence.hp)) return;
  for (const enemy of state.enemies) {
    if (!enemy || enemy.dead) continue;
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
      biteFence(state, enemy.damage, enemy.x, enemy.id, enemy.kind || null);
      enemy.attackCooldown += interval;
    }
  }
}

function removeDead(state) {
  if (state.enemies.some(enemy => enemy?.dead)) {
    state.enemies = state.enemies.filter(enemy => enemy && !enemy.dead);
  }
}

/**
 * Acquire targets by true distance from each defender's slot center, step
 * projectiles without tunneling, then let living enemies bite the shared fence.
 * Does not modify state.time, state.tick, or state.speed.
 */
function updateCombat(state, dt) {
  if (simulationFrozen(state)) return state;
  if (!Number.isFinite(dt) || dt <= 0) return state;
  if (!Array.isArray(state.slots)) return state;
  if (!Array.isArray(state.enemies)) state.enemies = [];
  if (!Array.isArray(state.projectiles)) state.projectiles = [];
  if (!Array.isArray(state.events)) state.events = [];

  removeDead(state);

  const roster = [];
  for (const slot of state.slots) {
    if (!slot?.unit) continue;
    const stats = getUnitStats(slot.unit, state);
    if (!stats || typeof stats !== 'object') continue;
    roster.push({slot, unit: slot.unit, stats});
  }
  const aura = computeAura(roster);
  updateDefenders(state, dt, roster, aura);
  updateProjectiles(state, dt);
  updateFenceAttacks(state, dt);
  removeDead(state);
  return state;
}

};
__ff_factories["src/systems/drafts.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["draftXpCost"] = draftXpCost;
__ff_exports["generateDraft"] = generateDraft;
__ff_exports["updateDrafts"] = updateDrafts;
__ff_exports["chooseDraft"] = chooseDraft;
__ff_exports["placePending"] = placePending;
__ff_exports["cancelPlacement"] = cancelPlacement;
const __ff_m0 = __ff_load("src/systems/hero.js");
const __ff_m1 = __ff_load("src/data/towers.js");
const __ff_m2 = __ff_load("src/shared.js");
const HERO_UPGRADES = __ff_m0["HERO_UPGRADES"];
const applyHeroUpgrade = __ff_m0["applyHeroUpgrade"];
const TOWERS = __ff_m1["TOWERS"];
const BASE_TYPES = __ff_m2["BASE_TYPES"];
const clone = __ff_m2["clone"];
const createUnit = __ff_m2["createUnit"];
const emit = __ff_m2["emit"];
const random = __ff_m2["random"];
/**
 * Three-choice drafts (contract worker 08).
 *
 * Combat owns kill XP (`state.xp`). This module only watches the bar.
 * `updateDrafts` runs while `phase === 'playing'` (engine already skips
 * paused / hidden steps). When `xp >= nextDraftXp` it opens `phase: 'draft'`,
 * subtracts that threshold from `xp` once, increments `draftLevel`, and sets
 * `nextDraftXp` to `draftXpCost(draftLevel)`. `draftXpCost(0) === 8`, matching
 * `createRun`. The sequence is 8, 12, 16, 21, 26, … and always increases.
 * Leftover XP stays in the bar, so a large kill can open another draft after
 * the current choice returns to play. Cancellation does not refund XP, roll a
 * new offer, or leave a unit on the board.
 *
 * `generateDraft` advances `state.rng` and must be called once per opening
 * (updateDrafts does that). Rendering and UI read `state.draft.options`.
 *
 * Cards are plain data: `{id, kind, type?, upgradeId?, replace, rank?, cap?, nextLevel?, description?}`.
 * A hero card's `description` is the catalog `{en, zh}` sentence for that upgrade.
 * Hero levels live at `hero.upgrades[upgradeId]` (finite number) with `spec.cap`.
 * A card is offered only when a cloned `applyHeroUpgrade` would succeed.
 * Empty board slots produce placeable tower cards. When empty slots remain, a
 * base type is still absent from the board, and two placeable tower cards are
 * offered, one of those cards is a missing base type. When every base type is
 * already on the board, empty slots remain, and a hero upgrade can still be
 * offered, one of the three cards is a hero upgrade. Neither swap rolls RNG
 * again, so the same seed and board stay stable. A full board offers three
 * uncapped hero upgrades, or those upgrades plus `replace: true` tower cards
 * when fewer than three upgrades remain — never a surprise tower. Replacement
 * never targets the hero and `placePending` requires `{replace: true}` for an
 * occupied slot.
 * Phase `draft` / `placing` freezes simulation. Explicit `paused` and
 * `hiddenPaused` are left unchanged.
 *
 * Reason codes: not_playing, not_ready, busy, no_options, no_draft, bad_index,
 * bad_option, already_placing, no_slot, unknown_tower, not_placing, bad_slot,
 * hero_protected, occupied, replace_not_offered, draft_missing, plus any
 * reason returned by applyHeroUpgrade.
 */




/** XP required to open the next draft after `opened` drafts have already been granted. */
function draftXpCost(opened) {
  const n = Number.isFinite(opened) ? Math.max(0, Math.floor(opened)) : 0;
  return 8 + 4 * n + Math.floor((n * n) / 8);
}

function generateDraft(state) {
  if (!state || !Array.isArray(state.slots)) {
    return BASE_TYPES.slice(0, 3).map(type => towerCard(type, false));
  }
  const heroIds = new Set(availableUpgradeIds(state));
  const cards = allValidCards(state, heroIds);
  let picked = uniqueCards(selectThree(state, cards)).filter(card => cardValid(state, card, heroIds));
  if (picked.length < 3) {
    const used = new Set(picked.map(card => card.id));
    for (const card of cards) {
      if (used.has(card.id) || !cardValid(state, card, heroIds)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
  if (picked.length < 3) {
    const empty = countEmpty(state) > 0;
    const canReplace = countReplaceable(state) > 0;
    for (const type of catalogTowerTypes()) {
      const card = towerCard(type, !empty && canReplace);
      if (!cardValid(state, card, heroIds)) continue;
      if (picked.some(item => item.id === card.id)) continue;
      picked.push(card);
      if (picked.length === 3) break;
    }
  }
  picked = picked.slice(0, 3);
  if (picked.length !== 3) return picked;
  return shuffle(state, preferHeroWhenCovered(state, preferMissingType(state, picked), heroIds));
}

function updateDrafts(state) {
  if (!state || state.phase !== 'playing' || !Array.isArray(state.slots) || state.slots.length !== 10) {
    return fail('not_playing');
  }
  if (state.settlement || defeatPending(state) || victoryPending(state)) return fail('not_playing');
  if (state.draft || state.pendingUnit) return fail('busy');
  const cost = state.nextDraftXp;
  if (!Number.isFinite(state.xp) || !Number.isFinite(cost) || cost <= 0 || state.xp < cost) {
    return fail('not_ready');
  }
  const options = generateDraft(state);
  if (!Array.isArray(options) || options.length !== 3 || new Set(options.map(card => card.id)).size !== 3) {
    return fail('no_options');
  }
  state.xp = normalizeXp(state.xp - cost);
  const opened = Number.isFinite(state.draftLevel) ? Math.max(0, Math.floor(state.draftLevel)) : 0;
  state.draftLevel = opened + 1;
  state.nextDraftXp = draftXpCost(state.draftLevel);
  state.pendingUnit = null;
  state.draft = {options};
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'draft', {level: state.draftLevel, xp: state.xp, nextDraftXp: state.nextDraftXp});
  return ok();
}

function chooseDraft(state, index) {
  if (!state || state.phase !== 'draft' || !state.draft || !Array.isArray(state.draft.options)) {
    if (state?.phase === 'placing' || state?.pendingUnit) return fail('already_placing');
    return fail('no_draft');
  }
  if (state.pendingUnit) return fail('already_placing');
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
    state.pendingUnit = null;
    state.draft = null;
    state.phase = 'playing';
    if (!Array.isArray(state.events)) state.events = [];
    emit(state, 'ui', {action: 'choose_draft', kind: 'hero_upgrade', upgradeId: option.upgradeId});
    return ok();
  }

  if (option.kind === 'tower') {
    if (typeof option.type !== 'string' || !BASE_TYPES.includes(option.type)) return fail('unknown_tower');
    const empty = countEmpty(state) > 0;
    const replacing = option.replace === true && countReplaceable(state) > 0;
    if (!empty && !replacing) return fail('no_slot');
    const unit = createUnit(state, option.type, 1, 'tower');
    unit.kind = 'tower';
    unit.type = option.type;
    unit.rank = 1;
    if (!unit.upgrades || typeof unit.upgrades !== 'object' || Array.isArray(unit.upgrades)) unit.upgrades = {};
    state.pendingUnit = {unit, replace: option.replace === true};
    state.phase = 'placing';
    return ok();
  }

  return fail('bad_option');
}

function placePending(state, slotIndex, options = {}) {
  if (!state || state.phase !== 'placing' || !state.pendingUnit?.unit) return fail('not_placing');
  if (!Number.isInteger(slotIndex) || !Array.isArray(state.slots) || slotIndex < 0 || slotIndex >= state.slots.length) {
    return fail('bad_slot');
  }
  const replace = options?.replace === true;
  const slot = state.slots[slotIndex];
  const unit = state.pendingUnit.unit;
  if (!slot || !unit || typeof unit !== 'object') return fail('bad_slot');
  if (isHero(unit)) return fail('hero_protected');
  if (slot.unit && isHero(slot.unit)) return fail('hero_protected');
  if (slot.unit) {
    if (!replace) return fail('occupied');
    if (state.pendingUnit.replace !== true) return fail('replace_not_offered');
  }
  slot.unit = unit;
  const towerType = unit.type;
  const placedId = unit.id;
  const x = slot.x;
  const y = slot.y;
  state.pendingUnit = null;
  state.draft = null;
  state.phase = 'playing';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'ui', {action: 'place', towerType, x, y, slot: slotIndex, replace, id: placedId});
  return ok();
}

function cancelPlacement(state) {
  if (!state || state.phase !== 'placing') return fail('not_placing');
  if (!state.pendingUnit) return fail('not_placing');
  if (!state.draft || !Array.isArray(state.draft.options) || state.draft.options.length !== 3) return fail('draft_missing');
  state.pendingUnit = null;
  state.phase = 'draft';
  if (!Array.isArray(state.events)) state.events = [];
  emit(state, 'ui', {action: 'cancel_placement'});
  return ok();
}

function ok() {
  return {ok: true};
}

function fail(reason) {
  return {ok: false, reason};
}

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

function countEmpty(state) {
  let count = 0;
  for (const slot of state.slots || []) if (slot && !slot.unit) count += 1;
  return count;
}

function countReplaceable(state) {
  let count = 0;
  for (const slot of state.slots || []) if (slot?.unit && !isHero(slot.unit)) count += 1;
  return count;
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

function catalogTowerTypes() {
  const listed = [];
  for (const type of BASE_TYPES) {
    if (TOWERS && typeof TOWERS === 'object' && TOWERS[type]) listed.push(type);
  }
  if (listed.length >= 3) return listed;
  for (const type of BASE_TYPES) {
    if (!listed.includes(type)) listed.push(type);
  }
  return listed;
}

function upgradeIds() {
  if (!HERO_UPGRADES || typeof HERO_UPGRADES !== 'object') return [];
  const raw = Array.isArray(HERO_UPGRADES)
    ? HERO_UPGRADES.map(item => item?.id || item?.upgradeId)
    : Object.keys(HERO_UPGRADES);
  const ids = [];
  const seen = new Set();
  for (const id of raw) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  ids.sort();
  return ids;
}

function upgradeSpec(id) {
  if (!HERO_UPGRADES || typeof HERO_UPGRADES !== 'object') return null;
  if (Array.isArray(HERO_UPGRADES)) {
    return HERO_UPGRADES.find(item => item && (item.id === id || item.upgradeId === id)) || null;
  }
  return HERO_UPGRADES[id] || null;
}

function readCap(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const raw = spec.cap ?? spec.maxLevel ?? spec.max;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return cap;
}

function readLevel(hero, id) {
  if (!hero?.upgrades || typeof hero.upgrades !== 'object') return 0;
  if (!Object.prototype.hasOwnProperty.call(hero.upgrades, id)) return 0;
  const raw = hero.upgrades[id];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw === true) return 1;
  return null;
}

function trialUpgrade(state, id) {
  if (typeof applyHeroUpgrade !== 'function') return false;
  let copy;
  try {
    copy = clone(state);
  } catch {
    return false;
  }
  copy.phase = 'draft';
  copy.paused = false;
  copy.hiddenPaused = false;
  copy.draft = {
    options: [
      {id: `hero_upgrade:${id}`, kind: 'hero_upgrade', upgradeId: id, replace: false},
      {id: 'tower:bolt', kind: 'tower', type: 'bolt', replace: false, rank: 1},
      {id: 'tower:fire', kind: 'tower', type: 'fire', replace: false, rank: 1}
    ]
  };
  try {
    return applyHeroUpgrade(copy, id)?.ok === true;
  } catch {
    return false;
  }
}

function availableUpgradeIds(state) {
  const hero = findHero(state);
  if (!hero) return [];
  const snapshot = {
    rng: state.rng,
    nextId: state.nextId,
    xp: state.xp,
    phase: state.phase,
    draftLevel: state.draftLevel,
    nextDraftXp: state.nextDraftXp,
    upgrades: clone(hero.upgrades || {})
  };
  const ids = [];
  for (const id of upgradeIds()) {
    const cap = readCap(upgradeSpec(id));
    const level = readLevel(hero, id);
    if (level != null && cap != null && level >= cap) continue;
    if (trialUpgrade(state, id)) ids.push(id);
  }
  state.rng = snapshot.rng;
  state.nextId = snapshot.nextId;
  state.xp = snapshot.xp;
  state.phase = snapshot.phase;
  state.draftLevel = snapshot.draftLevel;
  state.nextDraftXp = snapshot.nextDraftXp;
  if (JSON.stringify(hero.upgrades) !== JSON.stringify(snapshot.upgrades)) hero.upgrades = snapshot.upgrades;
  return ids;
}

function towerCard(type, replace) {
  return {
    id: replace ? `tower:${type}:replace` : `tower:${type}`,
    kind: 'tower',
    type,
    replace: !!replace,
    rank: 1
  };
}

function heroCard(state, id) {
  const spec = upgradeSpec(id);
  const card = {
    id: `hero_upgrade:${id}`,
    kind: 'hero_upgrade',
    upgradeId: id,
    replace: false
  };
  const cap = readCap(spec);
  const level = readLevel(findHero(state), id);
  if (cap != null) card.cap = cap;
  if (level != null) card.nextLevel = level + 1;
  const description = catalogDescription(spec);
  if (description) card.description = description;
  return card;
}

function catalogDescription(spec) {
  const text = spec?.description;
  if (!text || typeof text !== 'object' || Array.isArray(text)) return null;
  if (typeof text.en !== 'string' || !text.en || typeof text.zh !== 'string' || !text.zh) return null;
  return text;
}

function allValidCards(state, heroIds) {
  const cards = [];
  const empty = countEmpty(state) > 0;
  const canReplace = countReplaceable(state) > 0;
  if (empty) {
    for (const type of catalogTowerTypes()) cards.push(towerCard(type, false));
  }
  for (const id of heroIds) cards.push(heroCard(state, id));
  if (!empty && canReplace) {
    for (const type of catalogTowerTypes()) cards.push(towerCard(type, true));
  }
  return uniqueCards(cards);
}

function cardValid(state, card, heroIds) {
  if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id) return false;
  if (card.kind === 'hero_upgrade') {
    return card.replace !== true && typeof card.upgradeId === 'string' && heroIds.has(card.upgradeId);
  }
  if (card.kind !== 'tower' || typeof card.type !== 'string' || !BASE_TYPES.includes(card.type)) return false;
  if (card.replace === true) return countReplaceable(state) > 0;
  return countEmpty(state) > 0;
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

function presentBaseTypes(state) {
  const present = new Set();
  for (const slot of state.slots || []) {
    const type = slot?.unit?.type;
    if (typeof type === 'string' && BASE_TYPES.includes(type)) present.add(type);
  }
  return present;
}

// Swap one owned tower for a missing base type. Reading the shuffled cards
// only — no extra random() call — so later combat rolls stay on the same stream.
function preferMissingType(state, picked) {
  if (countEmpty(state) <= 0) return picked;
  const present = presentBaseTypes(state);
  const missing = catalogTowerTypes().filter(type => !present.has(type));
  if (missing.length === 0) return picked;
  const towerIndexes = [];
  for (let i = 0; i < picked.length; i += 1) {
    const card = picked[i];
    if (card && card.kind === 'tower' && card.replace !== true) towerIndexes.push(i);
  }
  if (towerIndexes.length < 2) return picked;
  if (towerIndexes.some(index => !present.has(picked[index].type))) return picked;
  const used = new Set(picked.map(card => card && card.id));
  const type = missing.find(candidate => !used.has(`tower:${candidate}`));
  if (!type) return picked;
  const next = picked.slice();
  next[towerIndexes[towerIndexes.length - 1]] = towerCard(type, false);
  return next;
}

function typesCovered(state) {
  const present = presentBaseTypes(state);
  const types = catalogTowerTypes();
  return types.length > 0 && types.every(type => present.has(type));
}

// Covered board: keep one hero upgrade in the three cards. No random() call.
function preferHeroWhenCovered(state, picked, heroIds) {
  if (!Array.isArray(picked) || picked.length !== 3) return picked;
  if (countEmpty(state) <= 0) return picked;
  if (!typesCovered(state)) return picked;
  if (picked.some(card => card && card.kind === 'hero_upgrade')) return picked;
  if (!heroIds || heroIds.size === 0) return picked;
  const used = new Set(picked.map(card => card && card.id));
  let replacement = null;
  for (const id of upgradeIds()) {
    if (!heroIds.has(id) || used.has(`hero_upgrade:${id}`)) continue;
    const card = heroCard(state, id);
    if (!cardValid(state, card, heroIds)) continue;
    replacement = card;
    break;
  }
  if (!replacement) return picked;
  let index = -1;
  for (let i = 0; i < picked.length; i += 1) {
    const card = picked[i];
    if (card && card.kind === 'tower' && card.replace !== true) index = i;
  }
  if (index < 0) index = picked.length - 1;
  const next = picked.slice();
  next[index] = replacement;
  return next;
}

function selectThree(state, cards) {
  const empty = countEmpty(state) > 0;
  const emptyCount = countEmpty(state);
  const towers = cards.filter(card => card.kind === 'tower' && card.replace !== true);
  const heroes = cards.filter(card => card.kind === 'hero_upgrade');
  const replaces = cards.filter(card => card.kind === 'tower' && card.replace === true);
  let picked = [];
  if (empty && towers.length && heroes.length) {
    const towerOrder = shuffle(state, towers);
    const heroOrder = shuffle(state, heroes);
    if (emptyCount >= 7 && towerOrder.length >= 2) {
      picked = [towerOrder[0], heroOrder[0], towerOrder[1]];
    } else {
      picked = [towerOrder[0], heroOrder[0]];
      const rest = shuffle(state, towerOrder.slice(1).concat(heroOrder.slice(1)));
      if (rest.length) picked.push(rest[0]);
    }
  } else if (!empty && heroes.length >= 3) {
    picked = shuffle(state, heroes).slice(0, 3);
  } else if (!empty) {
    picked = shuffle(state, heroes).concat(shuffle(state, replaces)).slice(0, 3);
  } else {
    picked = shuffle(state, towers.concat(heroes)).slice(0, 3);
  }
  if (picked.length < 3) {
    const used = new Set(picked.map(card => card.id));
    for (const card of shuffle(state, cards)) {
      if (used.has(card.id)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === 3) break;
    }
  }
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
__ff_exports["availableHeroUpgradeIds"] = availableHeroUpgradeIds;
__ff_exports["getHeroStats"] = getHeroStats;
__ff_exports["applyHeroUpgrade"] = applyHeroUpgrade;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/systems/progression.js");
const clamp = __ff_m0["clamp"];
const getProfileBonuses = __ff_m1["getProfileBonuses"];
// Passive run upgrades for the single hero. Does not spend draft XP, change phase,
// roll RNG, or modify any other unit. Drafts call applyHeroUpgrade, then return to playing.
//
// Front-center slot 2 is (180, 508); the fence is y=450. Baseline range 340 reaches
// enemies stopped on that fence from the front row and still covers the rear row,
// so the opener can fight unaided. New runs start on slot 2. A saved run keeps
// whatever slot the hero already occupies.
//
// getProfileBonuses(profileSnapshot): damage and haste are fractions, range is pixels,
// critChance is an absolute fraction. Fence HP and reward are not applied here.
// Haste adds to attack speed: interval = base / (1 + upgrade haste + profile haste).
// Profile damage multiplies hit damage and poison dps after flat upgrade adds.
// Combat should fire ordinary projectiles from these UnitStats. Poison is one stack
// {dps, duration, maxStacks:1}; later hits refresh it. Pierce is the numeric field.
// mechanics stays empty: those two are first-class stats, not extra hooks.




const HERO_BASE = Object.freeze({
  damage: 20,
  interval: 0.6,
  range: 340,
  critChance: 0.08,
  critMultiplier: 1.75,
  projectileSpeed: 540,
  splash: 0,
  chain: 0,
  chainRange: 70,
  pierce: 0,
  mechanics: Object.freeze([]),
});
__ff_exports["HERO_BASE"] = HERO_BASE;


const BONUS_LIMITS = Object.freeze({
  damage: [-0.5, 2.5],
  haste: [-0.4, 1.25],
  range: [-40, 160],
  critChance: [-0.2, 0.5],
});

const STAT_LIMITS = Object.freeze({
  damage: [1, 250],
  interval: [0.25, 3],
  range: [280, 480],
  critChance: [0, 0.75],
  critMultiplier: [1.25, 3.5],
  projectileSpeed: [240, 720],
  pierce: [0, 4],
  poisonDps: [0, 80],
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function describeEffect(effect) {
  const en = [];
  const zh = [];
  if (effect.damageAdd) {
    en.push(`Each rank adds ${effect.damageAdd} damage to the hero's shots.`);
    zh.push(`每级使英雄的射击伤害 +${effect.damageAdd}。`);
  }
  if (effect.haste) {
    const pct = Math.round(effect.haste * 100);
    en.push(`Each rank increases the hero's attack speed by ${pct}%.`);
    zh.push(`每级使英雄的攻击速度提高 ${pct}%。`);
  }
  if (effect.range) {
    en.push(`Each rank extends the hero's range by ${effect.range}.`);
    zh.push(`每级使英雄的射程 +${effect.range}。`);
  }
  if (effect.critChance) {
    const pct = Math.round(effect.critChance * 100);
    en.push(`Each rank adds ${pct}% critical hit chance.`);
    zh.push(`每级使英雄的暴击率 +${pct}%。`);
  }
  if (effect.critMultiplier) {
    en.push(`Each rank adds ${effect.critMultiplier} to the hero's critical multiplier.`);
    zh.push(`每级使英雄的暴击倍率 +${effect.critMultiplier}。`);
  }
  if (effect.pierce) {
    const n = effect.pierce;
    const noun = n === 1 ? 'enemy' : 'enemies';
    en.push(`Each rank lets one shot pierce ${n} extra ${noun}.`);
    zh.push(`每级使一次射击额外穿透 ${n} 个敌人。`);
  }
  if (effect.poison) {
    const p = effect.poison;
    en.push(`Each rank adds ${p.dps} poison damage per second for ${p.duration}s. Hits refresh; they do not stack.`);
    zh.push(`每级附加每秒 ${p.dps} 点毒素，持续 ${p.duration} 秒；命中刷新，不叠加。`);
  }
  if (!en.length) {
    en.push('Passive improvement to the hero.');
    zh.push('被动强化英雄。');
  }
  return {en: en.join(' '), zh: zh.join('')};
}

function defineUpgrade(id, cap, name, effect) {
  return deepFreeze({
    id,
    cap,
    name: {en: name.en, zh: name.zh},
    description: describeEffect(effect),
    effect,
  });
}

// Numeric effect fields are per rank. poison.dps is per rank; duration and maxStacks are not.
const HERO_UPGRADES = deepFreeze({
  strike: defineUpgrade('strike', 4, {en: 'Sharpened Quarrels', zh: '锋矢'}, {damageAdd: 4}),
  cadence: defineUpgrade('cadence', 4, {en: 'Repeater Cadence', zh: '连射'}, {haste: 0.08}),
  reach: defineUpgrade('reach', 3, {en: 'Long Watch', zh: '远望'}, {range: 20}),
  focus: defineUpgrade('focus', 4, {en: 'Keen Eye', zh: '锐目'}, {critChance: 0.05}),
  lethality: defineUpgrade('lethality', 3, {en: 'Heavy Draw', zh: '满弦'}, {critMultiplier: 0.25}),
  pierce: defineUpgrade('pierce', 2, {en: 'Piercing Bolt', zh: '贯矢'}, {pierce: 1}),
  barbed: defineUpgrade('barbed', 3, {en: 'Barbed Quills', zh: '倒刺'}, {
    poison: {dps: 3, duration: 3, maxStacks: 1},
  }),
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
  const raw = getProfileBonuses(profile) || empty;
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
  let damageAdd = 0;
  let haste = 0;
  let rangeAdd = 0;
  let critAdd = 0;
  let critMulAdd = 0;
  let pierceAdd = 0;
  let poisonDps = 0;
  let poisonDuration = 0;
  let poisonStacks = 0;

  for (const id of Object.keys(HERO_UPGRADES)) {
    const level = levels[id];
    if (level <= 0) continue;
    const effect = HERO_UPGRADES[id].effect;
    if (effect.damageAdd) damageAdd += effect.damageAdd * level;
    if (effect.haste) haste += effect.haste * level;
    if (effect.range) rangeAdd += effect.range * level;
    if (effect.critChance) critAdd += effect.critChance * level;
    if (effect.critMultiplier) critMulAdd += effect.critMultiplier * level;
    if (effect.pierce) pierceAdd += effect.pierce * level;
    if (effect.poison && effect.poison.dps) {
      poisonDps += effect.poison.dps * level;
      poisonDuration = Math.max(poisonDuration, finiteOr(effect.poison.duration));
      poisonStacks = Math.max(poisonStacks, finiteOr(effect.poison.maxStacks, 1));
    }
  }

  const bonus = readBonuses(state);
  const damageFactor = 1 + bonus.damage;
  const attackSpeed = Math.max(0.25, 1 + haste + bonus.haste);
  const damage = clamp(round4((HERO_BASE.damage + damageAdd) * damageFactor), STAT_LIMITS.damage[0], STAT_LIMITS.damage[1]);
  const interval = clamp(round4(HERO_BASE.interval / attackSpeed), STAT_LIMITS.interval[0], STAT_LIMITS.interval[1]);
  const range = clamp(round4(HERO_BASE.range + rangeAdd + bonus.range), STAT_LIMITS.range[0], STAT_LIMITS.range[1]);
  const critChance = clamp(round4(HERO_BASE.critChance + critAdd + bonus.critChance), STAT_LIMITS.critChance[0], STAT_LIMITS.critChance[1]);
  const critMultiplier = clamp(round4(HERO_BASE.critMultiplier + critMulAdd), STAT_LIMITS.critMultiplier[0], STAT_LIMITS.critMultiplier[1]);
  const projectileSpeed = clamp(round4(HERO_BASE.projectileSpeed), STAT_LIMITS.projectileSpeed[0], STAT_LIMITS.projectileSpeed[1]);
  const pierce = clamp(Math.round(HERO_BASE.pierce + pierceAdd), STAT_LIMITS.pierce[0], STAT_LIMITS.pierce[1]);

  const stats = {
    damage,
    interval,
    range,
    critChance,
    critMultiplier,
    projectileSpeed,
    splash: 0,
    chain: 0,
    chainRange: HERO_BASE.chainRange,
    pierce,
    mechanics: [],
  };

  if (poisonDps > 0 && poisonDuration > 0) {
    stats.poison = {
      dps: clamp(round4(poisonDps * damageFactor), STAT_LIMITS.poisonDps[0], STAT_LIMITS.poisonDps[1]),
      duration: round4(poisonDuration),
      maxStacks: clamp(Math.round(poisonStacks || 1), 1, 3),
    };
  }
  return stats;
}

/**
 * Raise one hero upgrade by 1. Returns {ok:true} or {ok:false, reason}.
 * Reasons: unknown_upgrade, invalid_state, no_hero, upgrade_capped.
 * Only hero.upgrades is written.
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
  } catch {
    return {ok: false, reason: 'invalid_state'};
  }
  return {ok: true};
}

};
__ff_factories["src/systems/merges.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["previewMerge"] = previewMerge;
__ff_exports["mergeUnits"] = mergeUnits;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/recipes.js");
const __ff_m2 = __ff_load("src/data/towers.js");
const __ff_m3 = __ff_load("src/i18n.js");
const BASE_TYPES = __ff_m0["BASE_TYPES"];
const canPlan = __ff_m0["canPlan"];
const createUnit = __ff_m0["createUnit"];
const emit = __ff_m0["emit"];
const HYBRID_RANK_MAX = __ff_m1["HYBRID_RANK_MAX"];
const findRecipe = __ff_m1["findRecipe"];
const getRecipe = __ff_m1["getRecipe"];
const isRecipeId = __ff_m1["isRecipeId"];
const TOWERS = __ff_m2["TOWERS"];
const t = __ff_m3["t"];
// Merge planning. previewMerge is pure; mergeUnits is the only mutation.
// Merges are legal only while canPlan(state) is true (paused, or phase draft).
// The source slot is consumed and the target slot receives the result.





const PREVIEW_UNIT_ID = 'preview';
__ff_exports["PREVIEW_UNIT_ID"] = PREVIEW_UNIT_ID;


const BASE_LABELS = Object.freeze({
  bolt: Object.freeze({ en: 'Bolt', zh: '弩箭' }),
  fire: Object.freeze({ en: 'Fire', zh: '火焰' }),
  frost: Object.freeze({ en: 'Frost', zh: '冰霜' }),
  lightning: Object.freeze({ en: 'Lightning', zh: '闪电' }),
  poison: Object.freeze({ en: 'Poison', zh: '毒素' }),
  support: Object.freeze({ en: 'Support', zh: '支援' }),
});

// Reason codes stay stable. Each catalog key is the player-facing reason.
// empty_slot uses missingUnit, the line for two occupied slots.
const REASON_KEYS = Object.freeze({
  not_planning: 'notPlanning',
  invalid_slot: 'invalidSlot',
  same_slot: 'sameSlot',
  empty_slot: 'missingUnit',
  hero_protected: 'heroProtected',
  rank_mismatch: 'rankMismatch',
  rank_cap: 'maxRank',
  hybrid_locked: 'hybridMix',
  no_recipe: 'noRecipe',
  invalid_merge: 'invalidMerge',
});

// Sentence after the reason. A failed preview leads with the catalog reason.
const REASON_DETAIL = Object.freeze({
  not_planning: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  invalid_slot: Object.freeze({ en: 'Choose a slot in the two rows of five.', zh: '请选择两排五格中的格子。' }),
  same_slot: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  empty_slot: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  hero_protected: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  rank_mismatch: Object.freeze({ en: 'Unequal ranks stay as they are.', zh: '不同阶会原样保留。' }),
  rank_cap: Object.freeze({ en: 'Same-type merges stop at rank 4.', zh: '同型合成到 4 阶为止。' }),
  hybrid_locked: Object.freeze({ en: 'A different type stays as it is.', zh: '不同的类型会原样保留。' }),
  no_recipe: Object.freeze({ en: 'Both units stay.', zh: '双方都保留。' }),
  invalid_merge: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
});

function reasonLead(key) {
  const en = t('en', key).trim();
  const zh = t('zh', key).trim();
  return {
    en: /[.!?]$/.test(en) ? en : `${en}.`,
    zh: /[。！？]$/.test(zh) ? zh : `${zh}。`,
  };
}

function reasonCopy(code) {
  const lead = reasonLead(REASON_KEYS[code]);
  const detail = REASON_DETAIL[code];
  return Object.freeze({
    en: `${lead.en} ${detail.en}`,
    zh: `${lead.zh}${detail.zh}`,
  });
}

// Stable reason codes. Preview description leads with that player-facing reason.
const MERGE_REASONS = Object.freeze({
  not_planning: reasonCopy('not_planning'),
  invalid_slot: reasonCopy('invalid_slot'),
  same_slot: reasonCopy('same_slot'),
  empty_slot: reasonCopy('empty_slot'),
  hero_protected: reasonCopy('hero_protected'),
  rank_mismatch: reasonCopy('rank_mismatch'),
  rank_cap: reasonCopy('rank_cap'),
  hybrid_locked: reasonCopy('hybrid_locked'),
  no_recipe: reasonCopy('no_recipe'),
  invalid_merge: reasonCopy('invalid_merge'),
});
__ff_exports["MERGE_REASONS"] = MERGE_REASONS;


function textOf(entry) {
  return { en: entry.en, zh: entry.zh };
}

function fail(reason) {
  return { ok: false, reason, description: textOf(MERGE_REASONS[reason] || MERGE_REASONS.invalid_merge) };
}

function isSlotIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 10;
}

function validRank(unit) {
  return Number.isInteger(unit?.rank) && unit.rank >= 1 && unit.rank <= HYBRID_RANK_MAX;
}

function classify(unit) {
  if (!unit || typeof unit.type !== 'string') return 'invalid';
  if (unit.kind === 'hero' || unit.type === 'hero') return 'hero';
  if (unit.kind === 'hybrid' || isRecipeId(unit.type)) return isRecipeId(unit.type) ? 'hybrid' : 'invalid';
  if (BASE_TYPES.includes(unit.type)) return 'base';
  return 'invalid';
}

function displayName(type) {
  const named = TOWERS[type]?.name || getRecipe(type)?.name || BASE_LABELS[type];
  if (named?.en && named?.zh) return named;
  return { en: String(type), zh: String(type) };
}

function placeholder(type, rank, kind) {
  return { id: PREVIEW_UNIT_ID, kind, type, rank, upgrades: {}, cooldown: 0, kills: 0 };
}

// The first sentence names the result and its rank. The battle HUD prints the whole line.
const PREVIEW_LIMIT = 160;

function resultLead(name, rank) {
  return {
    en: `${name.en} at rank ${rank}.`,
    zh: `${name.zh}，${rank} 阶。`,
  };
}

function hudLine(lead, enDetail, zhDetail) {
  const en = `${lead.en} ${enDetail}`;
  const zh = `${lead.zh}${zhDetail}`;
  return {
    en: en.length <= PREVIEW_LIMIT ? en : lead.en,
    zh: zh.length <= PREVIEW_LIMIT ? zh : lead.zh,
  };
}

function sameTypeDescription(type, rank) {
  const name = displayName(type);
  const next = rank + 1;
  const lead = resultLead(name, next);
  return hudLine(lead, `Two rank ${rank} ${name.en} units become one.`, `两个 ${rank} 阶${name.zh}合为一个。`);
}

function hybridDescription(entry, rank, fromType, toType) {
  const left = displayName(fromType);
  const right = displayName(toType);
  const lead = resultLead(entry.name, rank);
  return hudLine(lead, `${left.en} + ${right.en} keep rank ${rank}.`, `${left.zh}＋${right.zh}仍是 ${rank} 阶。`);
}

function planMerge(state, fromIndex, toIndex) {
  if (!state || !Array.isArray(state.slots) || state.slots.length !== 10) return fail('invalid_merge');
  if (!canPlan(state)) return fail('not_planning');
  if (!isSlotIndex(fromIndex) || !isSlotIndex(toIndex)) return fail('invalid_slot');
  if (fromIndex === toIndex) return fail('same_slot');
  const from = state.slots[fromIndex]?.unit;
  const to = state.slots[toIndex]?.unit;
  if (!from || !to) return fail('empty_slot');
  const fromClass = classify(from);
  const toClass = classify(to);
  if (fromClass === 'hero' || toClass === 'hero') return fail('hero_protected');
  if (fromClass === 'invalid' || toClass === 'invalid' || !validRank(from) || !validRank(to)) return fail('invalid_merge');
  if (from.type === to.type) {
    if (from.rank !== to.rank) return fail('rank_mismatch');
    if (from.rank >= HYBRID_RANK_MAX) return fail('rank_cap');
    const kind = fromClass === 'hybrid' ? 'hybrid' : 'tower';
    return { ok: true, unit: placeholder(from.type, from.rank + 1, kind), description: sameTypeDescription(from.type, from.rank), parents: null };
  }
  if (fromClass === 'hybrid' || toClass === 'hybrid') return fail('hybrid_locked');
  if (from.rank !== to.rank) return fail('rank_mismatch');
  const entry = findRecipe(from.type, to.type);
  if (!entry) return fail('no_recipe');
  return { ok: true, unit: placeholder(entry.id, from.rank, 'hybrid'), description: hybridDescription(entry, from.rank, from.type, to.type), parents: entry.parents };
}

function previewMerge(state, fromIndex, toIndex) {
  const plan = planMerge(state, fromIndex, toIndex);
  if (!plan.ok) return { ok: false, reason: plan.reason, description: plan.description };
  return { ok: true, result: plan.unit, description: plan.description };
}

function mergeUnits(state, fromIndex, toIndex) {
  const plan = planMerge(state, fromIndex, toIndex);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (!state.stats || typeof state.stats !== 'object' || !Array.isArray(state.events)) return { ok: false, reason: 'invalid_merge' };
  const unit = createUnit(state, plan.unit.type, plan.unit.rank, plan.unit.kind);
  state.slots[toIndex].unit = unit;
  state.slots[fromIndex].unit = null;
  state.stats.merges = (Number.isFinite(state.stats.merges) ? state.stats.merges : 0) + 1;
  const slot = state.slots[toIndex];
  const event = {
    x: slot.x,
    y: slot.y,
    from: fromIndex,
    to: toIndex,
    sourceId: unit.id,
    towerType: unit.type,
    kind: unit.kind,
    rank: unit.rank,
  };
  if (plan.parents) event.parents = [...plan.parents];
  emit(state, 'merge', event);
  return { ok: true, unit };
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

  const speed = Math.max(0, Number.isFinite(opts.speed) ? opts.speed : baseSpeed * speedMul);
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

  if (!Array.isArray(state.enemies)) state.enemies = [];
  state.enemies.push(enemy);
  return enemy;
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
    const stopY = ARENA.fenceY - radius;
    if (!Number.isFinite(enemy.y)) enemy.y = ARENA.spawnY;
    if (!Number.isFinite(enemy.x)) enemy.x = clamp(finite(enemy.driftAnchor, 180), ARENA.enemyMinX, ARENA.enemyMaxX);
    if (enemy.y > stopY) enemy.y = stopY;

    if (isStunned(enemy)) {
      enemy.attacking = false;
      continue;
    }

    const factor = movementFactor(enemy);
    const speed = finite(enemy.speed, 0) > 0 ? enemy.speed : 0;
    const dy = speed * factor * dt;
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
__ff_exports["buyEquipment"] = buyEquipment;
__ff_exports["equipItem"] = equipItem;
__ff_exports["purchasePermanent"] = purchasePermanent;
__ff_exports["settleRun"] = settleRun;
const __ff_m0 = __ff_load("src/shared.js");
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const clamp = __ff_m0["clamp"];
// Equipment, permanent hero upgrades, and one-time run settlement.
//
// getProfileBonuses(profile) fields:
//   damage, haste, critChance, reward — fractions (0.06 = +6%)
//   range — additive logical pixels
//   fence — additive starting fence HP
// Apply damage / haste / range / critChance in getHeroStats only:
//   damage *= (1 + damage); interval /= (1 + haste); range += range; critChance += critChance.
// Add fence to fence.hp and fence.maxHp once when the run is created.
// settleRun already multiplies payout by (1 + reward) from state.profileSnapshot.
// Doing either step twice double-counts.
//
// Reward, before the difficulty multiplier:
//   floor(min(time, timeCap) / secondsPerPoint)
//   + floor(min(kills, killCap) / killsPerPoint)
//   + floor(min(wave, waveCap)) * pointsPerWave
//   + victoryBonus on victory
//   Abandon keeps half of that progress (no victory bonus).
//   Abandon pays 0 when time <= 0, or when time < 30 and kills < 3.
// currency = round(points * DIFFICULTIES[difficulty].reward * (1 + snapshot.reward))
// Caps stop an endless run from minting unbounded currency. A normal 12–16 min
// clear sits under the time cap.
//
// Call settleRun only after phase is victory or defeat, or when the player
// explicitly abandons. Any other phase settles as abandon and then locks.
// Settlement is immutable. A second call returns the same object and does not pay.
//
// Save order: settleRun(profile, state), then saveProfile, then saveRun.
// Profile-first keeps the currency if the run write fails. state.settlement,
// profile.settledRuns, and profile.settlementLedger each stop a second payout.
// settledRuns keeps paid ids (up to 2000, the profile save ceiling). The ledger
// keeps full results for the newest 64 ids only. Dropping an id would let that
// run pay again. A run with no id is locked on the run object. Buying equipment
// does not equip it.
// One owned item can be equipped in its own slot and replaces the previous one.
// Permanent bonuses are per rank; price is costs[currentLevel] until cap.
// Buy / equip / upgrade failures use reason:
// invalidProfile, unknownItem, alreadyOwned, insufficientCurrency, notOwned,
// unknownUpgrade, maxLevel. Success is {ok:true} and does not include reason.
// Settlement result is victory, defeat, or abandon.



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
const PERMANENT_KEYS = ['damage', 'haste', 'vitality'];
const FRACTION_KEYS = ['damage', 'haste', 'critChance', 'reward'];
const ABSOLUTE_KEYS = ['range', 'fence'];
const OUTPUT_CAP_MILLI = Object.freeze({damage: 400, haste: 400, critChance: 200, reward: 250});
const OUTPUT_CAP_ABS = Object.freeze({range: 64, fence: 220});

function formatPercent(fraction) {
  const tenths = Math.round(fraction * 1000) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

function equipmentDescription(flavorEn, flavorZh, bonuses) {
  const en = [];
  const zh = [];
  if (bonuses.damage) {
    en.push(`+${formatPercent(bonuses.damage)}% hero damage`);
    zh.push(`英雄伤害+${formatPercent(bonuses.damage)}%`);
  }
  if (bonuses.critChance) {
    en.push(`+${formatPercent(bonuses.critChance)}% hero crit chance`);
    zh.push(`英雄暴击率+${formatPercent(bonuses.critChance)}%`);
  }
  if (bonuses.haste) {
    en.push(`+${formatPercent(bonuses.haste)}% hero attack speed`);
    zh.push(`英雄攻击速度+${formatPercent(bonuses.haste)}%`);
  }
  if (bonuses.range) {
    en.push(`+${bonuses.range} hero range`);
    zh.push(`英雄射程+${bonuses.range}`);
  }
  if (bonuses.fence) {
    en.push(`+${bonuses.fence} starting fence HP`);
    zh.push(`开局栅栏生命+${bonuses.fence}`);
  }
  if (bonuses.reward) {
    en.push(`+${formatPercent(bonuses.reward)}% run rewards`);
    zh.push(`结算奖励+${formatPercent(bonuses.reward)}%`);
  }
  return {
    en: `${flavorEn} ${en.join(', ')}.`,
    zh: `${flavorZh}${zh.join('，')}。`
  };
}

function permanentDescription(flavorEn, flavorZh, bonuses, cap) {
  const effect = equipmentDescription('', '', bonuses);
  const enEffect = effect.en.replace(/\.$/, '').trim();
  const zhEffect = effect.zh.replace(/。$/, '').trim();
  return {
    en: `${flavorEn} Each rank: ${enEffect}, up to rank ${cap}. Each rank costs more than the last.`,
    zh: `${flavorZh}每一级：${zhEffect}，最高${cap}级。价格逐级上升。`
  };
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
  splinter_bow: {en: 'Splinter Bow', zh: '裂片弓'},
  hawk_brace: {en: 'Hawk Brace', zh: '鹰眼护腕'},
  stormglass_edge: {en: 'Stormglass Edge', zh: '风暴璃刃'},
  runner_charm: {en: 'Runner Charm', zh: '奔行护符'},
  survey_bead: {en: 'Survey Bead', zh: '测距珠'},
  bounty_seal: {en: 'Bounty Seal', zh: '赏金印'},
  fence_nails: {en: 'Fence Nails', zh: '篱钉'},
  ward_planks: {en: 'Ward Planks', zh: '护栏板'},
  bastion_mail: {en: 'Bastion Mail', zh: '堡垒甲'}
};

const rawEquipment = [
  gear('splinter_bow', 'weapon', 65, {damage: 0.06}, 'A short bow cut from fallen fence wood.', '用倒下的篱木削成的短弓。'),
  gear('hawk_brace', 'weapon', 160, {damage: 0.04, critChance: 0.04, range: 16}, 'A watcher\'s brace that steadies aim.', '稳固瞄准的哨兵护腕。'),
  gear('stormglass_edge', 'weapon', 320, {damage: 0.10, critChance: 0.05, haste: 0.04}, 'A thin glass edge that snaps the arm forward.', '带动挥击的薄璃刃。'),
  gear('runner_charm', 'charm', 55, {haste: 0.06}, 'A light charm worn by runners on the wall.', '墙头奔行者佩的轻护符。'),
  gear('survey_bead', 'charm', 150, {range: 24, damage: 0.03}, 'A bead ground to measure the open field.', '用来丈量空地的测距珠。'),
  gear('bounty_seal', 'charm', 280, {reward: 0.10, critChance: 0.02}, 'Runs that start with this charm equipped pay a larger purse. Difficulty still multiplies the total.', '开局就装备此护符的对局会提高赏金，难度倍率仍会计入。'),
  gear('fence_nails', 'armor', 45, {fence: 30}, 'Extra nails driven into the fence before the fight.', '战前多钉进栅栏的钉子。'),
  gear('ward_planks', 'armor', 130, {fence: 60, damage: 0.02}, 'Spare planks braced behind the weak posts.', '撑在薄弱木桩后的备用板。'),
  gear('bastion_mail', 'armor', 260, {fence: 90, haste: 0.03}, 'Overlapping plates for the fence watch.', '守篱人穿的叠片甲。')
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
  damage: track('damage', 5, [40, 70, 110, 170, 240], {damage: 0.02}, {en: 'Sharpened Instinct', zh: '锐化直觉'}, 'Training that stays between runs.', '跨对局保留的训练。'),
  haste: track('haste', 5, [40, 70, 110, 170, 240], {haste: 0.02}, {en: 'Quick Hands', zh: '迅捷手法'}, 'Repetition that shortens the gap between shots.', '缩短射击间隔的练习。'),
  vitality: track('vitality', 5, [35, 60, 100, 150, 220], {fence: 12}, {en: 'Deep Roots', zh: '深根'}, 'Deeper posts for the starting fence.', '把开局栅栏立得更深。')
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

function zeroBonuses() {
  return {damage: 0, haste: 0, range: 0, critChance: 0, fence: 0, reward: 0};
}

function addSource(milli, absolute, bonuses, times) {
  if (!bonuses || typeof bonuses !== 'object') return;
  for (const key of FRACTION_KEYS) {
    const value = bonuses[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      milli[key] += Math.round(value * 1000) * times;
    }
  }
  for (const key of ABSOLUTE_KEYS) {
    const value = bonuses[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) absolute[key] += value * times;
  }
}

function boundedLevel(value, cap) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 0;
  return Math.min(value, cap);
}

function getProfileBonuses(profile) {
  const bonuses = zeroBonuses();
  if (!isProfile(profile)) return bonuses;
  const milli = {damage: 0, haste: 0, critChance: 0, reward: 0};
  const absolute = {range: 0, fence: 0};
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
      addSource(milli, absolute, item.bonuses, 1);
    }
  }
  const permanent = profile.permanent && typeof profile.permanent === 'object' ? profile.permanent : null;
  if (permanent) {
    for (const id of PERMANENT_KEYS) {
      const spec = PERMANENT_UPGRADES[id];
      // Level is how many times this rank bonus has been bought. Count it once per rank.
      const level = boundedLevel(permanent[id], spec.cap);
      if (level > 0) addSource(milli, absolute, spec.bonuses, level);
    }
  }
  bonuses.damage = Math.min(OUTPUT_CAP_MILLI.damage, milli.damage) / 1000;
  bonuses.haste = Math.min(OUTPUT_CAP_MILLI.haste, milli.haste) / 1000;
  bonuses.critChance = Math.min(OUTPUT_CAP_MILLI.critChance, milli.critChance) / 1000;
  bonuses.reward = Math.min(OUTPUT_CAP_MILLI.reward, milli.reward) / 1000;
  bonuses.range = Math.min(OUTPUT_CAP_ABS.range, absolute.range);
  bonuses.fence = Math.min(OUTPUT_CAP_ABS.fence, absolute.fence);
  return bonuses;
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

function buildSettlement(state, currency, result) {
  return {
    runId: typeof state.runId === 'string' ? state.runId : '',
    currency,
    difficulty: readDifficulty(state),
    result,
    time: cleanNumber(state.time),
    kills: cleanNumber(state.kills),
    wave: cleanNumber(state.wave)
  };
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
  const amount = payableAmount(profile, earnedCurrency(state, result));
  const settlement = Object.freeze(buildSettlement(state, amount, result));
  state.settlement = settlement;
  addCurrency(profile, amount);
  remember(profile, settlement);
  rememberUnkeyed(state, settlement);
  updateBest(profile, settlement);
  return settlement;
}

};
__ff_factories["src/systems/status.js"] = function(__ff_exports, __ff_load) {
"use strict";
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

function resistScale(enemy, type) {
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

  remaining = clamp(remaining * resistScale(enemy, type), 0, durationCap(type));
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
  return {sourceId: status.sourceId ?? null, type: status.type, crit: false, dot: true};
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
const __ff_m2 = __ff_load("src/systems/movement.js");
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const STEP = __ff_m0["STEP"];
const emit = __ff_m0["emit"];
const ENEMIES = __ff_m1["ENEMIES"];
const spawnEnemy = __ff_m2["spawnEnemy"];
// Wave director. Schedules fence-only enemies across about 13 minutes of spawns.
// The boss still has to walk and die after the last spawn, so a cleared run lands
// near 14 minutes of active simulation. Planning pauses are not part of this clock.
//
// This module does not set victory or defeat, does not award XP, and does not call
// random() or uid(). Spawn positions and difficulty health/speed/damage belong to
// spawnEnemy. Difficulty count is applied here, with a fractional remainder so
// 0.9 / 1.1 / 1.2 do not pile up on rounding. The opening pack is exact: four ash
// shamblers are worth 8 XP on every difficulty, matching the starting nextDraftXp.
//
// director.done flips only after the last queued campaign spawn has been handed to
// spawnEnemy. Summons created by a living boss are not campaign spawns; they keep
// happening after done until that boss is dead. Endless play never sets done.
// director.hasBoss is true when the current wave's groups include a boss. It is
// copied from that wave in the existing schedule and does not change counts,
// timings, kinds, or difficulty multipliers. Endless play keeps the same flag
// for the endless wave that is current.
// director.playerHint is the current wave's bilingual hint {en, zh} when that
// hint exists. Each update copies it from the existing schedule. The copy does
// not change counts, timings, kinds, or difficulty multipliers. Endless play
// keeps the hint of the endless wave that is current. A wave with no hint
// leaves playerHint unchanged.
// director.nextHint is the next campaign wave's bilingual hint {en, zh} when
// that wave is still waiting on the schedule. Each update copies it from that
// wave. The copy does not change counts, timings, kinds, or difficulty
// multipliers. Endless waves are not campaign waves. When no later campaign
// wave exists, nextHint is null. director.playerHint stays the current hint.
//
// Private serializable state lives on state.systems.waves:
//   countRemainder, summonRemainder, waveStartedAt,
//   endlessNext, endlessWave, doneEmitted, current {id,name,hint,intro,boss}
// Boss bodies may gain enraged (boolean) and summonAt (absolute simulation time
// of the next call). Save both. dt is accepted and ignored: the lead advances
// state.time before this call, and spawns/summons key off that clock so a large
// step cannot mint extra calls.
//
// Integration: call updateWaves after time/tick advance and before movement.
// Do not multiply dt by speed here; state.time is already simulation time.
// movement.js must not import this file (that cycle would hide spawnEnemy).





const INTRO_HINTS = {
  shambler: {
    en: 'Ash shamblers are crossing the field. Four of them pay the first draft.',
    zh: '灰烬蹒者正在过场。击倒这四只就能拿到第一次整备。',
  },
  runner: {
    en: 'Wire runners are in the line. They reach the fence early, so shoot them first.',
    zh: '线驰者混进了队列。它们会更早贴上栅栏，优先打掉。',
  },
  swarm: {
    en: 'Dust gnawers arrive in bunches. One is nothing; the bunch chews the fence.',
    zh: '尘啮成群出现。一只不足为惧，一群就会啃栅栏。',
  },
  spitter: {
    en: 'Sap spitters are fragile and bite the fence in quick hits once they arrive.',
    zh: '腐浆喷者很脆，一旦抵达就会快速连咬栅栏。',
  },
  armored: {
    en: 'Plate walkers shrug off more than half of each hit. Focus them down.',
    zh: '板甲行者能挡下每次攻击的一半多。集火拆掉它们。',
  },
  brute: {
    en: 'Gate brutes are slow, huge, and hit the fence very hard.',
    zh: '闸门蛮兽缓慢、巨大，对栅栏的打击非常重。',
  },
  boss: {
    en: 'A Crown Breach is coming. Below half health it enrages and calls dust gnawers. It only attacks the fence.',
    zh: '冠裂兽要来了。生命低于一半会狂暴并召唤尘啮。它只攻击栅栏。',
  },
};

// Hand-tunable campaign. `from`/`until`/`every` are simulation seconds.
// A phase without `rotate` repeats `groups`. `rotate` cycles group lists.
// Group: kind, count, interval seconds, optional delay, exact (skip count scaling),
// optional healthScale (passed through to spawnEnemy, still multiplied by difficulty health).
const PHASES = [
  {
    id: 'ash',
    from: 1,
    until: 2,
    every: 30,
    name: {en: 'First ash', zh: '初烬'},
    groups: [{kind: 'shambler', count: 4, interval: 3, exact: true}],
  },
  {
    id: 'line',
    from: 16,
    until: 64,
    every: 9,
    name: {en: 'Ash line', zh: '灰线'},
    groups: [
      {kind: 'shambler', count: 2, interval: 5},
      {kind: 'runner', count: 2, interval: 4, delay: 2},
    ],
  },
  {
    id: 'dust',
    from: 66,
    until: 140,
    every: 10,
    name: {en: 'Dust', zh: '尘群'},
    groups: [
      {kind: 'swarm', count: 4, interval: 1.5},
      {kind: 'shambler', count: 2, interval: 4, delay: 2},
    ],
  },
  {
    id: 'sap',
    from: 146,
    until: 232,
    every: 11,
    name: {en: 'Sap', zh: '腐浆'},
    groups: [
      {kind: 'spitter', count: 2, interval: 6},
      {kind: 'runner', count: 2, interval: 5, delay: 2},
      {kind: 'swarm', count: 2, interval: 3, delay: 1},
    ],
  },
  {
    id: 'plate',
    from: 234,
    until: 330,
    every: 14,
    name: {en: 'Plate', zh: '板甲'},
    groups: [
      {kind: 'armored', count: 2, interval: 8},
      {kind: 'swarm', count: 3, interval: 2.5, delay: 1},
      {kind: 'runner', count: 2, interval: 6, delay: 4},
    ],
  },
  {
    id: 'brute',
    from: 332,
    until: 333,
    every: 10,
    name: {en: 'The gate', zh: '闸门'},
    groups: [
      {kind: 'brute', count: 2, interval: 2, exact: true},
      {kind: 'shambler', count: 3, interval: 1.2, delay: 0.6},
    ],
  },
  {
    id: 'maul',
    from: 340,
    until: 456,
    every: 16,
    name: {en: 'Maul', zh: '重压'},
    rotate: [
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'swarm', count: 3, interval: 5, delay: 2},
      ],
      [
        {kind: 'spitter', count: 2, interval: 7},
        {kind: 'armored', count: 2, interval: 8, delay: 3},
        {kind: 'runner', count: 2, interval: 6, delay: 2},
      ],
      [
        {kind: 'swarm', count: 4, interval: 2.5},
        {kind: 'runner', count: 2, interval: 6, delay: 3},
        {kind: 'spitter', count: 2, interval: 6, delay: 5},
      ],
    ],
  },
  {
    id: 'lesser',
    from: 456,
    until: 457,
    every: 10,
    name: {en: 'Lesser crown', zh: '次冠'},
    hint: {
      en: 'A lesser Crown Breach tests the fence. It enrages and calls dust gnawers, then the push resumes.',
      zh: '一只较弱的冠裂兽来试栅栏。它会狂暴并召唤尘啮，之后攻势还会继续。',
    },
    groups: [
      {kind: 'armored', count: 2, interval: 1.4},
      {kind: 'swarm', count: 4, interval: 0.4, delay: 0.4},
      {kind: 'runner', count: 2, interval: 1.2, delay: 1.6},
      {kind: 'boss', count: 1, interval: 0, delay: 4.8, exact: true, healthScale: 0.36},
    ],
  },
  {
    id: 'press',
    from: 464,
    until: 652,
    every: 16,
    name: {en: 'Press', zh: '进逼'},
    rotate: [
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'spitter', count: 2, interval: 6, delay: 4},
        {kind: 'swarm', count: 3, interval: 4, delay: 2},
      ],
      [
        {kind: 'armored', count: 2, interval: 12},
        {kind: 'runner', count: 2, interval: 7, delay: 3},
        {kind: 'spitter', count: 2, interval: 6, delay: 5},
      ],
      [
        {kind: 'swarm', count: 4, interval: 3.5},
        {kind: 'runner', count: 2, interval: 8, delay: 2},
        {kind: 'spitter', count: 2, interval: 7, delay: 5},
      ],
    ],
  },
  {
    id: 'siege',
    from: 654,
    until: 772,
    every: 16,
    name: {en: 'Siege', zh: '围篱'},
    rotate: [
      [
        {kind: 'armored', count: 2, interval: 12},
        {kind: 'spitter', count: 2, interval: 7, delay: 3},
        {kind: 'swarm', count: 4, interval: 3.5, delay: 1},
      ],
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'runner', count: 2, interval: 7, delay: 3},
        {kind: 'swarm', count: 3, interval: 4, delay: 2},
      ],
      [
        {kind: 'spitter', count: 2, interval: 10, delay: 1},
        {kind: 'runner', count: 2, interval: 8, delay: 4},
        {kind: 'swarm', count: 3, interval: 4, delay: 2},
      ],
    ],
  },
  {
    id: 'crown',
    from: 780,
    until: 781,
    every: 20,
    name: {en: 'Crown Breach', zh: '冠裂'},
    hint: {
      en: 'The Crown Breach is the last scheduled foe. At half health it enrages and calls dust gnawers. Clear the field to win.',
      zh: '冠裂兽是日程上的最后一头。半血会狂暴并召唤尘啮。清场即可获胜。',
    },
    groups: [
      {kind: 'armored', count: 3, interval: 1.2},
      {kind: 'swarm', count: 5, interval: 0.35, delay: 0.35},
      {kind: 'spitter', count: 2, interval: 1.2, delay: 1.8},
      {kind: 'boss', count: 1, interval: 0, delay: 4.5, exact: true},
    ],
  },
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
];

const WAVES = freezeDeep(buildWaves(PHASES));
__ff_exports["WAVES"] = WAVES;

const SCHEDULE_END = lastSpawnTime(WAVES);

function updateWaves(state, dt = 0) {
  // state.time is the clock. dt stays in the signature for the lead's fixed step.
  void dt;
  if (!isSimulating(state)) return state;
  const director = ensureDirector(state);
  const sys = ensureWaves(state);
  if (!Array.isArray(state.events)) state.events = [];
  if (state.endless && director.done) director.done = false;

  while (director.nextWave < WAVES.length && state.time + 1e-6 >= WAVES[director.nextWave].start) {
    const wave = WAVES[director.nextWave];
    enqueueWave(state, sys, wave);
    director.nextWave += 1;
    state.wave = director.nextWave;
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

  if (director.nextWave >= WAVES.length && director.queue.length === 0) {
    if (state.endless) {
      director.done = false;
      pumpEndless(state, sys);
      spawnDue(state);
    } else if (!director.done) {
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

  syncBossFlag(state, director, sys);
  syncPlayerHint(state, director, sys);
  syncNextHint(director);
  updateBosses(state, sys);
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
  const catalogCurrent = started > 0 ? WAVES[Math.min(started, WAVES.length) - 1] : null;
  const current = stored || catalogCurrent;
  const upcomingWave = started >= 0 && started < WAVES.length ? WAVES[started] : null;
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
  let nextIn = 0;
  if (upcomingWave) nextIn = Math.max(0, upcomingWave.start - time);
  else if (state?.endless) {
    const at = state?.systems?.waves?.endlessNext;
    if (Number.isFinite(at)) nextIn = Math.max(0, at - time);
  }
  const quiet = {
    en: 'The fence is quiet. Ash shamblers will crest the field in a moment.',
    zh: '栅栏还安静。灰烬蹒者马上就会出现在场上。',
  };
  const name = current?.name || {en: 'Before the ash', zh: '灰烬未至'};
  const hint = current?.hint || quiet;
  return {
    wave: Number.isFinite(state?.wave) ? state.wave : 0,
    total: WAVES.length,
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
    finalSpawn: SCHEDULE_END,
    bossAlive,
    hasBoss: readHasBoss(state, director),
    progress: campaignProgress(director, time),
  };
}

function campaignProgress(director, time) {
  const index = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (index <= 0 || WAVES.length === 0) return 0;
  const current = WAVES[Math.min(index, WAVES.length) - 1];
  if (!current || !Number.isFinite(current.start)) return 0;
  const next = index < WAVES.length ? WAVES[index] : null;
  const end = next && Number.isFinite(next.start) ? next.start : current.start + 30;
  const span = Math.max(1e-6, end - current.start);
  const raw = (time - current.start) / span;
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
    return copy;
  });
}

function autoHint(groups) {
  const kinds = [];
  for (const group of groups) if (!kinds.includes(group.kind)) kinds.push(group.kind);
  const en = kinds.map(kind => ENEMIES[kind].name.en).join(', ');
  const zh = kinds.map(kind => ENEMIES[kind].name.zh).join('、');
  return {en: `${en} advance on the fence.`, zh: `${zh}正向栅栏推进。`};
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

function enqueueWave(state, sys, wave) {
  const mult = countMultiplier(state);
  const items = [];
  for (const group of wave.groups) {
    if (!ENEMIES[group.kind]) continue;
    const count = takeCount(sys, 'countRemainder', group.count, mult, group.exact);
    const interval = Math.max(0, Number(group.interval) || 0);
    const delay = Math.max(0, Number(group.delay) || 0);
    for (let i = 0; i < count; i++) {
      const item = {time: quantize(wave.start + delay + i * interval), kind: group.kind};
      if (Number.isFinite(group.healthScale) && group.healthScale > 0) item.overrides = {healthScale: group.healthScale};
      items.push(item);
    }
  }
  if (!items.length && wave.groups.length) {
    const kind = wave.groups.find(group => ENEMIES[group.kind])?.kind;
    if (kind) items.push({time: quantize(wave.start), kind});
  }
  const queue = state.director.queue;
  for (const item of items) queue.push(item);
  queue.sort((a, b) => a.time - b.time || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

function spawnDue(state) {
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
  if (sys.endlessNext == null) sys.endlessNext = quantize(state.time + 4);
  let guard = 0;
  while (state.time + 1e-6 >= sys.endlessNext && guard++ < 200) {
    const start = sys.endlessNext;
    const wave = makeEndlessWave(sys.endlessWave, start);
    enqueueWave(state, sys, wave);
    const span = groupSpan(wave.groups);
    let next = quantize(start + Math.max(12, span + 3));
    if (!(next > start)) next = quantize(start + 12);
    sys.endlessNext = next;
    sys.endlessWave += 1;
    state.wave += 1;
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

// Current campaign wave comes from WAVES. Once endless waves have started, the
// flag already stored on the current snapshot is the schedule for that wave.
function syncBossFlag(state, director, sys) {
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= WAVES.length && Number(sys?.endlessWave) > 0;
  if (endlessRunning) {
    director.hasBoss = sys?.current?.boss === true;
    return;
  }
  if (started <= 0 || WAVES.length === 0) {
    director.hasBoss = false;
    return;
  }
  director.hasBoss = waveContainsBoss(WAVES[Math.min(started, WAVES.length) - 1]);
}

// Same current-wave choice as the boss flag. Campaign waves read the schedule.
// Endless waves read the snapshot, which carries that wave's hint.
function syncPlayerHint(state, director, sys) {
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= WAVES.length && Number(sys?.endlessWave) > 0;
  const source = endlessRunning
    ? sys?.current?.hint
    : (started > 0 && WAVES.length > 0 ? WAVES[Math.min(started, WAVES.length) - 1]?.hint : null);
  const hint = copyHint(source);
  if (hint) director.playerHint = hint;
}

function copyHint(hint) {
  if (!hint || typeof hint !== 'object') return null;
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return null;
  return {en: hint.en, zh: hint.zh};
}

// Next campaign wave is WAVES[nextWave] until that index leaves the schedule.
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

function syncNextHint(director) {
  const index = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  if (index >= 0 && index < WAVES.length) {
    const hint = copyHint(WAVES[index]?.hint);
    if (hint) {
      director.nextHint = distinctHint(hint, director.playerHint, WAVES[index]);
      return;
    }
  }
  director.nextHint = null;
}

function readHasBoss(state, director) {
  if (typeof director?.hasBoss === 'boolean') return director.hasBoss;
  const stored = state?.systems?.waves?.current;
  if (typeof stored?.boss === 'boolean') return stored.boss;
  const started = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (started <= 0 || WAVES.length === 0) return false;
  return waveContainsBoss(WAVES[Math.min(started, WAVES.length) - 1]);
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
  const index = Number.isFinite(state.director?.nextWave) ? state.director.nextWave : 0;
  if (index < 0 || index >= WAVES.length) return false;
  const wave = WAVES[index];
  if (!waveContainsBoss(wave)) return false;
  const time = Number.isFinite(state.time) ? state.time : 0;
  const wait = Number(wave.start) - time;
  return wait >= 0 && wait <= BOSS_APPROACH_SECONDS;
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
      endlessNext: null,
      endlessWave: 0,
      doneEmitted: false,
      current: null,
    };
  }
  const sys = state.systems.waves;
  if (!Number.isFinite(sys.countRemainder)) sys.countRemainder = 0;
  if (!Number.isFinite(sys.summonRemainder)) sys.summonRemainder = 0;
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
__ff_exports["draftPower"] = draftPower;
__ff_exports["renderBuildPanel"] = renderBuildPanel;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/data/towers.js");
const __ff_m2 = __ff_load("src/data/recipes.js");
const __ff_m3 = __ff_load("src/systems/merges.js");
const __ff_m4 = __ff_load("src/systems/hero.js");
const __ff_m5 = __ff_load("src/i18n.js");
const canPlan = __ff_m0["canPlan"];
const clone = __ff_m0["clone"];
const getUnitStats = __ff_m1["getUnitStats"];
const TOWERS = __ff_m1["TOWERS"];
const RECIPES = __ff_m2["RECIPES"];
const previewMerge = __ff_m3["previewMerge"];
const HERO_UPGRADES = __ff_m4["HERO_UPGRADES"];
const localize = __ff_m5["localize"];
const formatNumber = __ff_m5["formatNumber"];
const translate = __ff_m5["t"];
/**
 * Placement, draft, and merge UI.
 *
 * renderBuildPanel(container, state, api) rebuilds only the given container.
 * data-ui="overlay" shows the modal step: draft, placement, or merge confirmation.
 * data-ui="panel" shows inspection. Move and the slot grid stay on the panel
 * while playing. A draft overlay keeps three short choice cards and does not
 * include the 10-slot rearrange grid. Each card is the choice: tap the card,
 * there is no confirm or cancel under it. A mark and a meter show the power:
 * damage, attack speed, and range, or the one stat a hero upgrade changes.
 * A tower card says whether that base type is already on the board. Merge confirmation, when
 * a preview is open, shows the result name and rank, then at most two more lines.
 * It does not paste the catalog essay. Confirm and cancel stay 44px buttons.
 * A container without data-ui shows the modal and the inspection together.
 * Buttons call api.act. This module does not write run or profile state.
 * Clicks on its own controls stop at this panel so a parent bubble listener
 * does not run the same action twice. Other buttons in the container are left alone.
 */







const STYLE_ID = 'fencefall-build-panel-styles';

const CSS = `
.ff-build{display:flex;flex-direction:column;gap:10px;max-width:100%;min-width:0;color:#f1eee2;font:15px/1.35 ui-sans-serif,system-ui,sans-serif}
.ff-build *{box-sizing:border-box}
.ff-build h2,.ff-build h3,.ff-build p{margin:0}
.ff-build h2{font-size:1.15rem;line-height:1.25}
.ff-build h3{font-size:1rem;line-height:1.3;word-break:break-word}
.ff-build .card{min-width:0}
.ff-build .muted{color:#a5b8be}
.ff-build .ff-next-wave{font-size:13px;line-height:1.3}
.ff-build .badge{display:inline-block;padding:2px 6px;border:1px solid #6d8388;vertical-align:middle}
.ff-build .hero-lock{border-color:#e0c17a;color:#e0c17a}
.ff-build button{touch-action:manipulation}
.ff-build .btn{appearance:none;width:auto;min-height:44px;min-width:44px;height:auto;padding:8px 10px;border:1px solid #6d8388;border-radius:2px;background:#1c3338;color:#f1eee2;font:inherit;line-height:1.25;text-align:center;white-space:normal;word-break:break-word;cursor:pointer}
.ff-build .btn-primary{background:#2d6a4f;border-color:#e0c17a;color:#f7fff8;font-weight:700}
.ff-build .btn:focus-visible{outline:2px solid #f1eee2;outline-offset:2px}
.ff-build .ff-actions{display:flex;flex-wrap:wrap;gap:8px}
.ff-build .ff-actions .btn{flex:1 1 140px}
.ff-build .ff-merge .ff-actions .btn{flex:1 1 140px;min-width:44px;min-height:44px;height:44px}
.ff-build .card>.btn,.ff-build .ff-choice .btn{width:100%}
.ff-build .ff-draft-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ff-build .ff-draft-list li{min-width:0}
.ff-build .ff-effect{white-space:pre-line}
.ff-build.is-draft{gap:6px;background:rgba(12,22,28,.94);border:1px solid #3e5960;padding:8px}
.ff-build.is-draft .ff-title{font-size:18px}
.ff-build.is-draft .ff-draft-hint{font-size:13px;line-height:1.3}
.ff-build.is-draft .ff-choice{padding:6px 8px;display:flex;flex-direction:row;align-items:center;gap:8px;width:100%;min-height:44px;text-align:left;cursor:pointer}
.ff-build.is-draft .ff-choice-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.ff-build.is-draft .ff-mark{width:44px;height:44px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border:1px solid currentColor;font-size:16px;line-height:1}
.ff-build.is-draft .ff-mark small{font-size:9px;line-height:1;max-width:42px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-build.is-draft .ff-meter{width:64px;height:44px;flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px}
.ff-build.is-draft .ff-meter-row{display:flex;align-items:center;gap:3px;height:10px;min-height:0}
.ff-build.is-draft .ff-meter-row>span{flex:none;min-width:14px;font-size:9px;line-height:1;color:#c5d5da}
.ff-build.is-draft .ff-meter-track{flex:1;height:6px;background:#24383e}
.ff-build.is-draft .ff-meter-fill{display:block;height:6px;width:0}
.ff-build.is-draft [data-meter="damage"] .ff-meter-fill{background:#f0d56a}
.ff-build.is-draft [data-meter="speed"] .ff-meter-fill{background:#f0cb72}
.ff-build.is-draft [data-meter="range"] .ff-meter-fill{background:#9fd7e8}
.ff-build.is-draft [data-meter="crit"] .ff-meter-fill{background:#f0cb72}
.ff-build.is-draft [data-meter="critDamage"] .ff-meter-fill{background:#e7a08a}
.ff-build.is-draft [data-meter="pierce"] .ff-meter-fill{background:#d7e4ea}
.ff-build.is-draft [data-meter="poison"] .ff-meter-fill{background:#7dce6a}
.ff-build.is-draft .ff-meter[data-bars="1"] .ff-meter-track,.ff-build.is-draft .ff-meter[data-bars="1"] .ff-meter-fill{height:14px}
.ff-build.is-draft .ff-choice h3{font-size:16px;line-height:1.2}
.ff-build.is-draft .ff-blurb,.ff-build.is-draft .ff-statline{font-size:13px;line-height:1.25}
.ff-build.is-draft .ff-statline{color:#c5d5da}
.ff-build.is-draft .ff-field{align-self:flex-start;font-size:12px;line-height:1.2;padding:1px 6px}
.ff-build .ff-field.is-new{border-color:#e0c17a;color:#e0c17a}
.ff-build .ff-field.is-owned{color:#a5b8be}
.ff-build.is-draft .ff-draft-merge{display:flex;flex-direction:column;gap:6px}
.ff-build.is-draft .ff-draft-merge .btn{width:100%}
.ff-build .ff-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none}
.ff-build .ff-slots .btn,.ff-build .ff-note{width:100%;min-height:44px;padding:4px;font-size:12px;line-height:1.15}
.ff-build .ff-note{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #3e5960;background:#122128;text-align:center;overflow:hidden}
.ff-build .ff-note small,.ff-build .ff-slots .btn small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-build .is-selected{border-color:#e0c17a;box-shadow:inset 0 0 0 1px #e0c17a}
.ff-build .is-hero{color:#e0c17a}
.ff-build .ff-stats{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.ff-build .ff-stats li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #2a4148;padding:2px 0}
.ff-build .ff-stats b{font-weight:650;text-align:right}
.ff-build .ff-pips{letter-spacing:1px}
.ff-build .ff-message{padding:8px;border:1px solid #e7a08a;background:#3a2a22}
.ff-build .ff-mechs{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none}
@media (max-width:899px){
  .ff-build.is-draft .ff-blurb,.ff-build.is-draft .ff-statline{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
}
@media (max-width:360px){
  .ff-build{font-size:14px}
  .ff-build .ff-slots{gap:4px}
  .ff-build .ff-slots .btn,.ff-build .ff-note{font-size:11px;padding:2px}
}
@media (prefers-reduced-motion:reduce){
  .ff-build *,.ff-build *::before,.ff-build *::after{transition:none !important;animation:none !important}
}
`;

const EXTRA = {
  en: {
    damage: 'Damage',
    range: 'Range',
    attackSpeed: 'Attack speed',
    crit: 'Critical',
    critDamage: 'Crit damage',
    rank: 'Rank',
    hero: 'Hero',
    towers: 'Tower',
    upgrade: 'Upgrade',
    select: 'Select',
    place: 'Place',
    move: 'Move',
    merge: 'Merge',
    mergePreview: 'Merge preview',
    mergeConfirm: 'Confirm merge',
    mergeCancel: 'Cancel merge',
    heroProtected: 'Hero stays independent',
    invalidMerge: 'These units cannot merge',
    fullBoard: 'All slots are full',
    chooseUpgrade: 'Choose upgrade',
    chooseOneOfThree: 'Choose one of three',
    chooseSlot: 'Choose a slot',
    cancelPlacement: 'Cancel placement',
    replace: 'Replace',
    replaceConfirm: 'Confirm replacement',
    effect: 'Effect',
    emptySlot: 'Empty slot',
    recipes: 'Recipe',
    ingredients: 'Ingredients',
    cost: 'Cost',
    level: 'Level',
    maxLevel: 'Max level',
    pause: 'Pause',
    resume: 'Resume',
    planning: 'Planning',
    nextWave: 'Next wave',
    pausedHidden: 'Paused while the page is hidden',
    helpPlacement: 'Select a defender, then move it or merge two towers. Empty slots can take a new tower. Planning pauses the fight.',
    helpMerge: 'Matching type and rank raise rank, up to 4. Different base towers of equal rank follow a recipe. Cancel keeps both units.',
    helpDraft: 'Choose one card. A tower is placed next. A hero upgrade applies immediately and the hero stays on the board.',
    helpRange: 'Range is measured from this slot center to an enemy center, across the field. Rear slots sit farther back, so their range reaches past the fence.',
    kills: 'Kills',
    xp: 'XP',
    victory: 'Victory',
    defeat: 'Defeat',
    cancel: 'Cancel',
    back: 'Back',
    confirm: 'Confirm',
    locked: 'Unavailable',
    loading: 'Loading',
    frontRow: 'Front row',
    backRow: 'Rear row',
    hybrid: 'Hybrid',
    projectile: 'Projectile',
    splash: 'Splash',
    chain: 'Chain',
    pierce: 'Pierce',
    burn: 'Burn',
    slow: 'Slow',
    poison: 'Poison',
    aura: 'Aura',
    haste: 'Haste',
    stacks: 'Stacks',
    speed: 'Speed',
    swap: 'Swap',
    pauseToPlan: 'Pause to move defenders or merge towers.',
    noMergePartner: 'A merge needs two towers. The hero stays independent.',
    heroNoMerge: 'The hero stays independent. Move the hero during planning. Merges and replacement leave the hero in place.',
    placeHint: 'Choose an empty slot. Occupied towers stay unless this card is a replacement.',
    replaceHeroSafe: 'Choose the tower to replace. The hero stays in place.',
    confirmReplaceBody: 'The tower in this slot will be removed.',
    slotOccupied: 'Occupied',
    statsUnavailable: 'Stats will appear when the catalog is ready.',
    noDraft: 'The draft has no cards yet. Wait for the next choice.',
    planningLocked: 'The fight is running. Pause to move or merge.',
    emptySelection: 'Select a slot to see its stats.',
    sameTypeMerge: 'Same type and rank combine into the next rank.',
    hybridMerge: 'This pair becomes the hybrid below.',
    maxRankNote: 'Rank 4 can form a hybrid with a different rank-4 base tower when a recipe exists.',
    supportNote: 'Support range is a circle from this slot. Aura bonuses reach defenders inside that circle. Attacks use the same geometric range.',
    youGain: 'Result',
    currentStats: 'Stats',
    nextStats: 'After this choice',
    draftWaiting: 'The three choices stay available until you pick one.',
    draftOnField: 'Already on the field',
    draftNewType: 'Not on the field yet',
    mergeReview: 'Review the merge, then confirm or cancel. Both units stay if you cancel.',
    lostOnReplace: 'Removed tower',
    chooseEmpty: 'Empty slots are ready for placement.',
    heroStays: 'The hero stays on the board.',
    cancelPick: 'Back',
    noValidTarget: 'No legal merge is available from this tower.',
    moveHint: 'Choose a destination. An occupied slot swaps places.',
    mergeHint: 'Choose a tower of equal rank. The preview explains the result before you confirm.',
    sourceHint: 'Choose the defender to move.',
    mergeSourceHint: 'Choose the first tower. The hero is not a merge ingredient.',
    attacks: 'Attacks',
    duration: 'Duration',
    reduction: 'slow',
    buildPanelLabel: 'Build, draft, and merge',
    kindTower: 'Tower',
    kindHybrid: 'Hybrid',
    kindUpgrade: 'Hero upgrade',
    slotLabel: 'Slot',
  },
  zh: {
    damage: '伤害',
    range: '射程',
    attackSpeed: '攻速',
    crit: '暴击',
    critDamage: '暴击伤害',
    rank: '阶',
    hero: '英雄',
    towers: '塔',
    upgrade: '升级',
    select: '选择',
    place: '放置',
    move: '移动',
    merge: '合成',
    mergePreview: '合成预览',
    mergeConfirm: '确认合成',
    mergeCancel: '取消合成',
    heroProtected: '英雄保持独立',
    invalidMerge: '这些单位不能合成',
    fullBoard: '栏位已满',
    chooseUpgrade: '选择升级',
    chooseOneOfThree: '三选一',
    chooseSlot: '选择格子',
    cancelPlacement: '取消放置',
    replace: '替换',
    replaceConfirm: '确认替换',
    effect: '效果',
    emptySlot: '空位',
    recipes: '配方',
    ingredients: '材料',
    cost: '花费',
    level: '等级',
    maxLevel: '已满级',
    pause: '暂停',
    resume: '继续',
    planning: '规划中',
    nextWave: '下一波',
    pausedHidden: '页面隐藏，战斗已暂停',
    helpPlacement: '先点选防守单位，再移动或合成。空位可以放置新塔。规划时战斗会暂停。',
    helpMerge: '同类型且同阶会升阶，最高 4 阶。不同基础塔在同阶时按配方合成。取消会保留双方。',
    helpDraft: '选择一张卡。塔需要接着放置。英雄升级会立即生效，英雄留在场上。',
    helpRange: '射程从本格中心量到敌人中心，可以跨列。后排更靠后，因此射程要能覆盖到栅栏前方。',
    kills: '击杀',
    xp: '经验',
    victory: '胜利',
    defeat: '失败',
    cancel: '取消',
    back: '返回',
    confirm: '确认',
    locked: '不可用',
    loading: '读取中',
    frontRow: '前排',
    backRow: '后排',
    hybrid: '混合',
    projectile: '弹道',
    splash: '溅射',
    chain: '连锁',
    pierce: '穿透',
    burn: '燃烧',
    slow: '减速',
    poison: '毒素',
    aura: '光环',
    haste: '急速',
    stacks: '层数',
    speed: '速度',
    swap: '交换',
    pauseToPlan: '暂停后才能移动防守单位或合成塔。',
    noMergePartner: '合成需要两座塔。英雄保持独立。',
    heroNoMerge: '英雄保持独立。规划时可以移动英雄。合成和替换都不会动英雄。',
    placeHint: '选择一个空位。已有的塔会留下，除非这张卡是替换。',
    replaceHeroSafe: '选择要替换的塔。英雄会留在原位。',
    confirmReplaceBody: '这个格子上的塔会被移除。',
    slotOccupied: '已占用',
    statsUnavailable: '图鉴就绪后会显示属性。',
    noDraft: '这次选拔还没有卡牌。请等待下一次选择。',
    planningLocked: '战斗进行中。暂停后才能移动或合成。',
    emptySelection: '选择一个格子以查看属性。',
    sameTypeMerge: '相同类型且阶数相同，会升到下一阶。',
    hybridMerge: '这一对会变成下面的混合单位。',
    maxRankNote: '4 阶可以与另一座 4 阶的不同基础塔按配方混合。',
    supportNote: '支援范围是以本格为圆心的圆。光环加成覆盖圆内的防守单位。攻击也按这个几何距离判定。',
    youGain: '结果',
    currentStats: '属性',
    nextStats: '选择之后',
    draftWaiting: '在你做出选择之前，三张卡都会保留。',
    draftOnField: '场上已有',
    draftNewType: '场上还没有',
    mergeReview: '先查看合成结果，再确认或取消。取消会保留双方。',
    lostOnReplace: '被移除的塔',
    chooseEmpty: '空位可以直接放置。',
    heroStays: '英雄会留在场上。',
    cancelPick: '返回',
    noValidTarget: '这座塔目前没有合法的合成对象。',
    moveHint: '选择目的地。占用的格子会交换位置。',
    mergeHint: '选择一座同阶塔。确认前会显示合成结果。',
    sourceHint: '选择要移动的防守单位。',
    mergeSourceHint: '选择第一座塔。英雄不能作为合成材料。',
    attacks: '攻击',
    duration: '持续',
    reduction: '减速',
    buildPanelLabel: '构筑、选拔与合成',
    kindTower: '塔',
    kindHybrid: '混合',
    kindUpgrade: '英雄升级',
    slotLabel: '格子',
  },
};

const REASONS = {
  en: {
    hero: 'The hero stays independent and is not a merge ingredient.',
    hero_protected: 'The hero stays independent and is not a merge ingredient.',
    heroProtected: 'The hero stays independent and is not a merge ingredient.',
    same: 'Choose two different slots.',
    same_slot: 'Choose two different slots.',
    empty: 'That slot is empty.',
    not_planning: 'Pause the battle before moving or merging.',
    planning: 'Pause the battle before moving or merging.',
    phase: 'Move and merge while planning, or while a draft is open.',
    rank: 'Both units need the same rank.',
    rank_mismatch: 'Both units need the same rank.',
    max_rank: 'Rank 4 does not rank up. A different rank-4 base tower can still form a hybrid.',
    capped: 'That upgrade is already at its cap.',
    no_recipe: 'This pair has no hybrid recipe.',
    recipe: 'This pair has no hybrid recipe.',
    hybrid: 'A hybrid merges only with the same hybrid at the same rank.',
    hybrid_mix: 'A hybrid merges only with the same hybrid at the same rank.',
    different: 'These types have no combination.',
    invalid: 'These units cannot merge.',
    invalidMerge: 'These units cannot merge.',
    full: 'Every slot is full. Replace a tower, or merge two towers.',
    fullBoard: 'Every slot is full. Replace a tower, or merge two towers.',
    occupied: 'That slot already holds a defender.',
  },
  zh: {
    hero: '英雄保持独立，不能作为合成材料。',
    hero_protected: '英雄保持独立，不能作为合成材料。',
    heroProtected: '英雄保持独立，不能作为合成材料。',
    same: '请选择两个不同的格子。',
    same_slot: '请选择两个不同的格子。',
    empty: '这个格子是空的。',
    not_planning: '请先暂停，再移动或合成。',
    planning: '请先暂停，再移动或合成。',
    phase: '规划中或选拔打开时可以移动和合成。',
    rank: '双方阶数需要相同。',
    rank_mismatch: '双方阶数需要相同。',
    max_rank: '4 阶不能再升阶。另一座 4 阶的不同基础塔仍可混合。',
    capped: '这项升级已经到达上限。',
    no_recipe: '这一对没有混合配方。',
    recipe: '这一对没有混合配方。',
    hybrid: '混合单位只能与相同的混合单位在同阶合成。',
    hybrid_mix: '混合单位只能与相同的混合单位在同阶合成。',
    different: '这两种类型不能组合。',
    invalid: '这些单位不能合成。',
    invalidMerge: '这些单位不能合成。',
    full: '栏位已满。可以替换一座塔，或先合成两座塔。',
    fullBoard: '栏位已满。可以替换一座塔，或先合成两座塔。',
    occupied: '这个格子已经有防守单位。',
  },
};

const MECHANICS = {
  en: {
    splash: 'Hits enemies around the impact.',
    chain: 'Jumps to another enemy in chain range.',
    pierce: 'Continues through additional enemies.',
    burn: 'Applies burning damage over time.',
    slow: 'Lowers enemy move speed for a short time.',
    poison: 'Stacks poison damage over time.',
    aura: 'Buffs defenders inside the aura circle.',
    support: 'Buffs nearby defenders and still uses geometric range.',
    stun: 'Can stop an enemy briefly.',
    brittle: 'Marked enemies take extra damage.',
    frost: 'Chills and slows enemies in range.',
    lightning: 'Chains a strike between enemies.',
    execute: 'Deals heavier damage to weakened enemies.',
  },
  zh: {
    splash: '命中点周围的敌人也会受伤。',
    chain: '会跳到连锁范围内的另一个敌人。',
    pierce: '可以继续打穿后面的敌人。',
    burn: '附加持续燃烧伤害。',
    slow: '短时间内降低敌人移速。',
    poison: '叠加持续毒素伤害。',
    aura: '强化光环圆内的防守单位。',
    support: '强化附近防守单位，攻击仍按几何距离判定。',
    stun: '可以短暂停住敌人。',
    brittle: '被标记的敌人会受到额外伤害。',
    frost: '减速范围内的敌人。',
    lightning: '在敌人之间连锁电击。',
    execute: '对残血敌人造成更重的伤害。',
  },
};

const ephemeral = {
  runId: '',
  phase: '',
  mode: 'idle',
  from: -1,
  to: -1,
  replaceIndex: -1,
  message: '',
  ignorePreview: null,
};

let currentDoc = typeof document !== 'undefined' ? document : null;

function ensureStyles(doc) {
  if (!doc?.getElementById || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

function el(tag, attrs = {}, ...children) {
  const doc = currentDoc;
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) appendNode(node, child);
  return node;
}

function appendNode(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const item of child) appendNode(node, item);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    node.appendChild(node.ownerDocument.createTextNode(String(child)));
    return;
  }
  node.appendChild(child);
}

function button(attrs = {}, ...children) {
  const classes = ['btn'];
  if (attrs.primary) classes.push('btn-primary');
  if (attrs.class) classes.push(attrs.class);
  const copy = { ...attrs, type: 'button', class: classes.join(' '), 'data-ff-owner': 'build' };
  delete copy.primary;
  return el('button', copy, ...children);
}

function clearContainer(container) {
  for (const node of [...container.childNodes]) {
    if (node.nodeType === 1) {
      const element = node;
      if (element.tagName === 'CANVAS' || element.querySelector?.('canvas')) continue;
    }
    node.remove();
  }
}

function roleOf(container) {
  const raw = String(container?.getAttribute?.('data-ui') || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('menu')) return 'menu';
  if (raw.includes('overlay')) return 'overlay';
  if (raw.includes('panel')) return 'panel';
  return '';
}

function pageHas(container, role) {
  try {
    const doc = container?.ownerDocument;
    if (!doc?.querySelectorAll) return false;
    for (const candidate of doc.querySelectorAll('[data-ui]')) {
      if (candidate !== container && roleOf(candidate) === role) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function bind(container) {
  if (container.__ffBuildBound) return;
  container.addEventListener('click', (event) => {
    const target = event.target;
    const control = target?.closest?.('button');
    if (!control || !container.contains(control) || control.getAttribute('data-ff-owner') !== 'build') return;
    const action = control.getAttribute('data-action') || '';
    const intent = control.getAttribute('data-intent') || '';
    if (!action && !intent) return;
    event.preventDefault();
    event.stopPropagation();
    const api = container.__ffBuildCtx?.api;
    if (!api) return;
    handlePress(container, api, action, intent, control);
  }, true);
  container.__ffBuildBound = true;
}

function pickIndex(value) {
  if (value == null || value === '') return -1;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 9 ? number : -1;
}

function validSlot(index) {
  return Number.isInteger(index) && index >= 0 && index <= 9;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function readUI(api) {
  const empty = { screen: '', selectedSlot: -1, mergeFrom: -1, mergePreview: null, message: '' };
  try {
    const ui = api?.getUI?.();
    if (!ui || typeof ui !== 'object') return empty;
    return {
      screen: typeof ui.screen === 'string' ? ui.screen : '',
      selectedSlot: pickIndex(ui.selectedSlot),
      mergeFrom: pickIndex(ui.mergeFrom),
      mergePreview: ui.mergePreview ?? null,
      message: ui.message ?? '',
    };
  } catch {
    return empty;
  }
}

function languageOf(state, api) {
  try {
    const profile = api?.getProfile?.() || state?.profileSnapshot;
    return profile?.settings?.language === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

function reducedMotion(state, api) {
  try {
    const profile = api?.getProfile?.() || state?.profileSnapshot;
    return !!profile?.settings?.reducedMotion;
  } catch {
    return false;
  }
}

function makeT(api, lang) {
  const table = EXTRA[lang] || EXTRA.en;
  return (key, vars) => {
    let value = '';
    try {
      if (typeof api?.t === 'function') value = api.t(key, vars);
    } catch {
      value = '';
    }
    if (typeof value !== 'string' || value === '' || value === key) {
      let fallback = table[key] ?? EXTRA.en[key] ?? '';
      if (!fallback) return typeof value === 'string' && value !== '' ? value : String(key);
      if (vars && typeof vars === 'object') {
        fallback = fallback.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`));
      }
      return fallback;
    }
    return value;
  };
}

function localizeSafe(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    if (typeof value.en === 'string' || typeof value.zh === 'string') {
      try {
        const text = localize(value, lang);
        if (text) return String(text);
      } catch {
        /* use the catalog fields directly */
      }
      return String(value[lang] || value.en || value.zh || '');
    }
  }
  return '';
}

function fmtNum(value, lang) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const rounded = Math.round(number * 100) / 100;
  try {
    if (typeof formatNumber === 'function') {
      const formatted = formatNumber(rounded, lang === 'zh' ? 'zh' : 'en');
      if (formatted != null && formatted !== '') return String(formatted);
    }
  } catch {
    /* Intl below */
  }
  try {
    return new Intl.NumberFormat(lang === 'zh' ? 'zh-Hans' : 'en').format(rounded);
  } catch {
    return String(rounded);
  }
}

function perSecond(lang) {
  return lang === 'zh' ? '/秒' : '/s';
}

function reasonText(reason, lang, tr) {
  if (reason == null || reason === '') return tr('invalidMerge');
  if (typeof reason === 'object') return localizeSafe(reason, lang) || tr('invalidMerge');
  const code = String(reason);
  const table = REASONS[lang] || REASONS.en;
  const normalized = code.replace(/[\s-]+/g, '_');
  if (table[code]) return table[code];
  if (table[normalized]) return table[normalized];
  if (code.includes(' ')) return code;
  const translated = tr(code);
  if (translated && translated !== code) return translated;
  return tr('invalidMerge');
}

function slotAt(state, index) {
  if (!state?.slots || !validSlot(index)) return null;
  return state.slots.find((slot) => slot && slot.index === index) || state.slots[index] || null;
}

function slotUnit(state, index) {
  const unit = slotAt(state, index)?.unit;
  return unit && typeof unit === 'object' ? unit : null;
}

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function recipeList() {
  return Array.isArray(RECIPES) ? RECIPES : [];
}

function recipeById(id) {
  if (!id) return null;
  return recipeList().find((recipe) => recipe && recipe.id === id) || null;
}

function towerRecord(type) {
  try {
    const row = TOWERS?.[type];
    return row && typeof row === 'object' ? row : null;
  } catch {
    return null;
  }
}

function upgradeRecord(id) {
  try {
    const row = id ? HERO_UPGRADES?.[id] : null;
    return row && typeof row === 'object' ? row : null;
  } catch {
    return null;
  }
}

function towerName(type, lang, tr) {
  const record = towerRecord(type);
  const name = localizeSafe(record?.name, lang);
  return name || type || tr('towers');
}

function unitLabel(unit, lang, tr) {
  if (!unit) return tr('emptySlot');
  if (isHero(unit)) return tr('hero');
  if (unit.kind === 'hybrid') {
    const recipe = recipeById(unit.type);
    return localizeSafe(recipe?.name, lang) || unit.type || tr('hybrid');
  }
  return towerName(unit.type, lang, tr);
}

function unitDescription(unit, lang) {
  if (!unit || isHero(unit)) return '';
  if (unit.kind === 'hybrid') return localizeSafe(recipeById(unit.type)?.description, lang);
  return localizeSafe(towerRecord(unit.type)?.description, lang);
}

function findHero(state) {
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (isHero(unit)) return unit;
  }
  return null;
}

function nonHeroSlots(state) {
  const slots = [];
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (unit && !isHero(unit)) slots.push(index);
  }
  return slots;
}

function emptySlots(state) {
  const slots = [];
  for (let index = 0; index < 10; index += 1) {
    if (!slotUnit(state, index)) slots.push(index);
  }
  return slots;
}

function copyUnit(unit) {
  if (!unit) return null;
  try {
    return clone(unit);
  } catch {
    return { ...unit, upgrades: unit.upgrades && typeof unit.upgrades === 'object' ? { ...unit.upgrades } : {} };
  }
}

function safeStats(unit, state) {
  if (!unit) return null;
  try {
    const stats = getUnitStats(copyUnit(unit), state);
    return stats && typeof stats === 'object' ? stats : null;
  } catch {
    return null;
  }
}

function safePreview(state, from, to) {
  try {
    const preview = previewMerge(state, from, to);
    return preview && typeof preview === 'object' ? preview : { ok: false, reason: 'invalidMerge' };
  } catch {
    return { ok: false, reason: 'invalidMerge' };
  }
}

function planningAvailable(state) {
  if (!state || state.phase === 'placing' || state.phase === 'victory' || state.phase === 'defeat') return false;
  if (state.hiddenPaused && !state.paused && state.phase !== 'draft') return false;
  return canPlan(state);
}

function previewPayload(preview) {
  if (!preview || typeof preview !== 'object') return false;
  return preview.ok != null || preview.result != null || preview.reason != null
    || preview.description != null || preview.from != null || preview.to != null || preview.unit != null;
}

function endpoints(ui) {
  let from = -1;
  let to = -1;
  const preview = ui?.mergePreview;
  if (preview && typeof preview === 'object') {
    from = pickIndex(preview.from ?? preview.fromIndex);
    to = pickIndex(preview.to ?? preview.toIndex);
  }
  if (from < 0) from = pickIndex(ui?.mergeFrom);
  if (ephemeral.mode === 'merge-confirm' || ephemeral.mode === 'merge') {
    if (validSlot(ephemeral.from)) from = ephemeral.from;
    if (validSlot(ephemeral.to)) to = ephemeral.to;
  }
  if (to < 0 && validSlot(from) && validSlot(ui?.selectedSlot) && ui.selectedSlot !== from && previewPayload(preview)) {
    to = ui.selectedSlot;
  }
  return { from, to };
}

function mergeConfirmActive(ui) {
  if (ephemeral.mode === 'merge' || ephemeral.mode === 'move') return false;
  const ends = endpoints(ui);
  const pair = validSlot(ends.from) && validSlot(ends.to) && ends.from !== ends.to;
  if (!pair) return false;
  if (ephemeral.mode === 'merge-confirm') return true;
  if (!previewPayload(ui?.mergePreview)) return false;
  const ignored = ephemeral.ignorePreview;
  if (ignored && ignored.from === ends.from && ignored.to === ends.to) return false;
  return true;
}

function syncEphemeral(state, ui) {
  if (!state) return;
  if (ephemeral.runId !== state.runId) {
    ephemeral.runId = state.runId || '';
    ephemeral.phase = state.phase || '';
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    ephemeral.replaceIndex = -1;
    ephemeral.message = '';
    ephemeral.ignorePreview = null;
  }
  if (ephemeral.phase !== state.phase) {
    if (state.phase !== 'placing') ephemeral.replaceIndex = -1;
    if (state.phase === 'victory' || state.phase === 'defeat') {
      ephemeral.mode = 'idle';
      ephemeral.from = -1;
      ephemeral.to = -1;
      ephemeral.message = '';
    }
    ephemeral.phase = state.phase || '';
  }
  if (ui.screen && ui.screen !== 'battle') {
    ephemeral.mode = 'idle';
    ephemeral.replaceIndex = -1;
  }
  if (ephemeral.mode === 'merge-confirm') {
    if (!slotUnit(state, ephemeral.from) || !slotUnit(state, ephemeral.to)) {
      ephemeral.mode = 'idle';
      ephemeral.from = -1;
      ephemeral.to = -1;
    }
  }
  if ((ephemeral.mode === 'move' || ephemeral.mode === 'merge') && ephemeral.from >= 0 && !slotUnit(state, ephemeral.from)) {
    ephemeral.from = -1;
  }
  if (ephemeral.mode === 'merge' && isHero(slotUnit(state, ephemeral.from))) ephemeral.from = -1;
}

function progressText(state, tr, lang) {
  const xp = finite(state?.xp) ? Number(state.xp) : 0;
  const next = finite(state?.nextDraftXp) ? Number(state.nextDraftXp) : 0;
  const level = finite(state?.draftLevel) ? Number(state.draftLevel) : 0;
  return `${tr('level')} ${fmtNum(level, lang)} · ${tr('xp')} ${fmtNum(xp, lang)} / ${fmtNum(next, lang)}`;
}

function slotCaption(slot, tr) {
  const index = Number.isInteger(slot?.index) ? slot.index : 0;
  const row = slot?.row === 0 || slot?.row === 1 ? slot.row : (index >= 5 ? 1 : 0);
  return `${index + 1} · ${row ? tr('backRow') : tr('frontRow')}`;
}

function rankPips(rank) {
  const filled = Math.max(0, Math.min(4, Number(rank) || 0));
  let text = '';
  for (let i = 0; i < 4; i += 1) text += i < filled ? '●' : '○';
  return text;
}

function percentNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function burnValue(burn, lang) {
  const dps = Number(burn?.dps ?? burn?.damage);
  const duration = Number(burn?.duration);
  return `${fmtNum(dps, lang)} / ${fmtNum(duration, lang)}s`;
}

function slowValue(slow, lang, tr) {
  const factor = Number(slow?.factor ?? slow?.power);
  const duration = Number(slow?.duration);
  if (Number.isFinite(factor) && factor > 0 && factor <= 1) {
    const reduced = (1 - factor) * 100;
    return `${fmtNum(reduced, lang)}% · ×${fmtNum(factor, lang)} · ${fmtNum(duration, lang)}s`;
  }
  return `${fmtNum(factor, lang)} · ${fmtNum(duration, lang)}s`;
}

function poisonValue(poison, lang, tr) {
  const dps = Number(poison?.dps ?? poison?.damage);
  const duration = Number(poison?.duration);
  const stacks = Number(poison?.maxStacks ?? poison?.stacks ?? 1);
  return `${fmtNum(dps, lang)} · ${tr('stacks')} ${fmtNum(stacks, lang)} · ${fmtNum(duration, lang)}s`;
}

function auraValue(aura, lang, tr) {
  const parts = [];
  if (finite(aura?.range)) parts.push(`${tr('range')} ${fmtNum(aura.range, lang)}`);
  const damage = percentNumber(aura?.damage);
  if (damage) parts.push(`${tr('damage')} +${fmtNum(damage, lang)}%`);
  const haste = percentNumber(aura?.haste);
  if (haste) parts.push(`${tr('haste')} +${fmtNum(haste, lang)}%`);
  return parts.join(' · ');
}

function mechanicText(item, lang) {
  if (item && typeof item === 'object') {
    return localizeSafe(item.description || item.name || item, lang);
  }
  const id = String(item ?? '').trim();
  if (!id) return '';
  const table = MECHANICS[lang] || MECHANICS.en;
  return table[id] || table[id.replace(/[\s-]+/g, '_')] || id.replace(/[_-]+/g, ' ');
}

function describeStats(stats, lang, tr) {
  const rows = [];
  const specials = [];
  const push = (id, label, value) => {
    if (value == null || value === '' || value === '—') return;
    rows.push({ id, label, value: String(value) });
  };
  if (!stats || typeof stats !== 'object') return { rows, specials };
  if (finite(stats.damage)) push('stat-damage', tr('damage'), fmtNum(stats.damage, lang));
  if (finite(stats.interval) && Number(stats.interval) > 0) {
    const rate = `${fmtNum(1 / Number(stats.interval), lang)}${perSecond(lang)}`;
    const gap = `${fmtNum(stats.interval, lang)}s`;
    push('stat-attackSpeed', tr('attackSpeed'), `${rate} · ${gap}`);
  }
  if (finite(stats.range)) push('stat-range', tr('range'), fmtNum(stats.range, lang));
  if (finite(stats.critChance) && Number(stats.critChance) > 0) {
    const chance = percentNumber(stats.critChance);
    const multiplier = finite(stats.critMultiplier) ? ` ×${fmtNum(stats.critMultiplier, lang)}` : '';
    push('stat-crit', tr('crit'), `${fmtNum(chance, lang)}%${multiplier}`);
  }
  if (finite(stats.projectileSpeed) && Number(stats.projectileSpeed) > 0) {
    push('stat-projectile', tr('projectile'), fmtNum(stats.projectileSpeed, lang));
  }
  if (finite(stats.splash) && Number(stats.splash) > 0) {
    push('stat-splash', tr('splash'), fmtNum(stats.splash, lang));
    specials.push(`${tr('splash')} ${fmtNum(stats.splash, lang)}`);
  }
  if (finite(stats.chain) && Number(stats.chain) > 0) {
    const range = finite(stats.chainRange) ? ` · ${tr('range')} ${fmtNum(stats.chainRange, lang)}` : '';
    push('stat-chain', tr('chain'), `${fmtNum(stats.chain, lang)}${range}`);
    specials.push(`${tr('chain')} ${fmtNum(stats.chain, lang)}${range}`);
  }
  if (finite(stats.pierce) && Number(stats.pierce) > 0) {
    push('stat-pierce', tr('pierce'), fmtNum(stats.pierce, lang));
    specials.push(`${tr('pierce')} ${fmtNum(stats.pierce, lang)}`);
  }
  if (stats.burn && typeof stats.burn === 'object') {
    const value = burnValue(stats.burn, lang);
    push('stat-burn', tr('burn'), value);
    specials.push(`${tr('burn')} ${value}`);
  }
  if (stats.slow && typeof stats.slow === 'object') {
    const value = slowValue(stats.slow, lang, tr);
    push('stat-slow', tr('slow'), value);
    specials.push(`${tr('slow')} ${value}`);
  }
  if (stats.poison && typeof stats.poison === 'object') {
    const value = poisonValue(stats.poison, lang, tr);
    push('stat-poison', tr('poison'), value);
    specials.push(`${tr('poison')} ${value}`);
  }
  if (stats.aura && typeof stats.aura === 'object') {
    const value = auraValue(stats.aura, lang, tr);
    if (value) {
      push('stat-aura', tr('aura'), value);
      specials.push(`${tr('aura')} ${value}`);
    }
  }
  return { rows, specials };
}

function effectLinesFromStats(stats, lang, tr) {
  if (!stats) return [tr('statsUnavailable')];
  const { rows, specials } = describeStats(stats, lang, tr);
  const lines = [];
  for (const id of ['stat-damage', 'stat-attackSpeed', 'stat-range', 'stat-crit']) {
    const row = rows.find((item) => item.id === id);
    if (row) lines.push(`${row.label} ${row.value}`);
  }
  for (const special of specials) lines.push(special);
  const mechanics = Array.isArray(stats.mechanics) ? stats.mechanics : [];
  const seen = new Set(specials.map((line) => line.toLowerCase()));
  for (const item of mechanics) {
    const text = mechanicText(item, lang);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    lines.push(text);
    if (lines.length >= 8) break;
  }
  return lines.length ? lines : [tr('statsUnavailable')];
}

function statList(stats, lang, tr, testid = 'unit-stats') {
  const { rows } = describeStats(stats, lang, tr);
  const list = el('ul', { class: 'ff-stats', 'data-testid': testid });
  const prefix = testid === 'unit-stats' ? '' : `${testid}-`;
  if (!rows.length) {
    list.append(el('li', { text: tr('statsUnavailable') }));
    return list;
  }
  for (const row of rows) {
    const item = el('li', { 'data-testid': `${prefix}${row.id}` });
    item.append(el('span', { text: row.label }), el('b', { text: row.value }));
    list.append(item);
  }
  return list;
}

function supportNote(unit, stats, tr) {
  const type = unit?.type;
  const mechanics = Array.isArray(stats?.mechanics) ? stats.mechanics.map((item) => String(item)) : [];
  if (type === 'support' || stats?.aura || mechanics.some((item) => /support|aura/i.test(item))) {
    return tr('supportNote');
  }
  return '';
}

function upgradeLevel(hero, id) {
  if (!hero || !id) return 0;
  if (Array.isArray(hero.upgrades)) return hero.upgrades.filter((entry) => entry === id).length;
  const value = hero.upgrades?.[id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const level = Number(value.level ?? value.rank ?? 0);
    return Number.isFinite(level) ? level : 0;
  }
  return 0;
}

function withUpgrade(hero, id) {
  const next = copyUnit(hero) || { id: 'hero', kind: 'hero', type: 'hero', rank: 1, upgrades: {}, cooldown: 0, kills: 0 };
  if (Array.isArray(hero?.upgrades)) {
    next.upgrades = [...hero.upgrades, id];
    return next;
  }
  const upgrades = next.upgrades && typeof next.upgrades === 'object' && !Array.isArray(next.upgrades)
    ? { ...next.upgrades }
    : {};
  const current = upgrades[id];
  if (current && typeof current === 'object') {
    const level = Number(current.level ?? current.rank ?? 0) + 1;
    upgrades[id] = { ...current, level, rank: Number(current.rank ?? level) };
  } else {
    upgrades[id] = (typeof current === 'number' && Number.isFinite(current) ? current : 0) + 1;
  }
  next.upgrades = upgrades;
  return next;
}

function effectObjectLines(record, lang, tr) {
  const effect = record?.effect || record?.stats || record?.bonus || record?.modifiers;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return [];
  const keyMap = {
    damage: 'damage',
    range: 'range',
    interval: 'attackSpeed',
    haste: 'haste',
    critChance: 'crit',
    critMultiplier: 'crit',
    projectileSpeed: 'projectile',
    splash: 'splash',
    chain: 'chain',
    pierce: 'pierce',
  };
  const lines = [];
  for (const [key, raw] of Object.entries(effect)) {
    if (!finite(raw) || Number(raw) === 0) continue;
    if (key === 'critMultiplier') {
      const number = Number(raw);
      lines.push(`${tr('critDamage')} ${number > 0 ? '+' : ''}${fmtNum(number, lang)}×`);
      continue;
    }
    const label = tr(keyMap[key] || key);
    const number = Number(raw);
    const fractional = Math.abs(number) <= 1 && key !== 'range' && key !== 'interval' && key !== 'projectileSpeed' && key !== 'chain' && key !== 'pierce';
    const shown = fractional
      ? `${number > 0 ? '+' : ''}${fmtNum(number * 100, lang)}%`
      : `${number > 0 ? '+' : ''}${fmtNum(number, lang)}`;
    lines.push(`${label} ${shown}`);
  }
  return lines;
}

function deltaLines(before, after, lang, tr) {
  if (!before || !after) return [];
  const lines = [];
  const fields = [
    ['damage', 'damage', false],
    ['range', 'range', false],
    ['critChance', 'crit', true],
  ];
  for (const [field, key, asPercent] of fields) {
    const left = Number(before[field]) || 0;
    const right = Number(after[field]) || 0;
    if (Math.abs(right - left) < 1e-6) continue;
    if (asPercent) {
      lines.push(`${tr(key)} ${fmtNum(percentNumber(left) || 0, lang)}% → ${fmtNum(percentNumber(right) || 0, lang)}%`);
    } else {
      lines.push(`${tr(key)} ${fmtNum(left, lang)} → ${fmtNum(right, lang)}`);
    }
  }
  const leftInterval = Number(before.interval) || 0;
  const rightInterval = Number(after.interval) || 0;
  if (leftInterval > 0 && rightInterval > 0 && Math.abs(leftInterval - rightInterval) > 1e-6) {
    lines.push(`${tr('attackSpeed')} ${fmtNum(1 / leftInterval, lang)}${perSecond(lang)} → ${fmtNum(1 / rightInterval, lang)}${perSecond(lang)}`);
  }
  const leftCrit = Number(before.critMultiplier) || 0;
  const rightCrit = Number(after.critMultiplier) || 0;
  if (leftCrit > 0 && rightCrit > 0 && Math.abs(leftCrit - rightCrit) > 1e-6) {
    lines.push(`${tr('critDamage')} ${fmtNum(leftCrit, lang)}× → ${fmtNum(rightCrit, lang)}×`);
  }
  return lines;
}

function optionCost(option) {
  const cost = Number(option?.cost ?? option?.price);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function draftOptionName(option, lang, tr) {
  const attached = localizeSafe(option?.name, lang);
  if (attached) return attached;
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    return localizeSafe(upgradeRecord(id)?.name, lang) || id || tr('chooseUpgrade');
  }
  if (option?.type) return towerName(option.type, lang, tr);
  return tr('towers');
}

function resolveUpgradeId(option) {
  if (option?.upgradeId) return option.upgradeId;
  if (option?.id && upgradeRecord(option.id)) return option.id;
  return '';
}

function draftEffectLines(state, option, lang, tr) {
  const lines = [];
  const attached = option?.summary || option?.effectText || option?.immediate;
  const attachedText = localizeSafe(attached, lang);
  if (attachedText) lines.push(attachedText);
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    const record = upgradeRecord(id);
    const hero = findHero(state);
    const level = upgradeLevel(hero, id);
    const cap = Number(record?.cap);
    if (Number.isFinite(cap)) lines.push(`${tr('level')} ${fmtNum(level, lang)} / ${fmtNum(cap, lang)}`);
    else if (level) lines.push(`${tr('level')} ${fmtNum(level, lang)}`);
    const cost = optionCost(option);
    if (cost > 0) lines.push(`${tr('cost')} ${fmtNum(cost, lang)}`);
    const before = hero ? safeStats(hero, state) : null;
    const after = hero && id ? safeStats(withUpgrade(hero, id), state) : null;
    const deltas = deltaLines(before, after, lang, tr);
    if (deltas.length) lines.push(...deltas);
    else lines.push(...effectObjectLines(record, lang, tr));
    lines.push(tr('heroStays'));
  } else {
    const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
    const preview = option?.unit && typeof option.unit === 'object'
      ? option.unit
      : { id: `preview-${option?.type || 'tower'}`, kind: 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
    lines.push(...effectLinesFromStats(safeStats(preview, state), lang, tr));
    lines.push(`${tr('rank')} ${fmtNum(preview.rank || rank, lang)}`);
    if (option?.replace) lines.push(`${tr('replace')} · ${tr('heroStays')}`);
    const cost = optionCost(option);
    if (cost > 0) lines.push(`${tr('cost')} ${fmtNum(cost, lang)}`);
  }
  return lines.length ? lines : [tr('statsUnavailable')];
}

function messageLines(ui, lang, tr) {
  const lines = [];
  if (ephemeral.message) lines.push(reasonText(ephemeral.message, lang, tr));
  if (ui?.message != null && ui.message !== '') {
    const text = typeof ui.message === 'object' ? (localizeSafe(ui.message, lang) || '') : reasonText(ui.message, lang, tr);
    if (text && !lines.includes(text)) lines.push(text);
  }
  return lines;
}

function normalizeCopy(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function catalogEssay(type, kind, lang) {
  if (!type) return '';
  const recipe = recipeById(type);
  const tower = towerRecord(type);
  const source = (kind === 'hybrid' || recipe) && recipe ? recipe.description : tower?.description;
  return normalizeCopy(localizeSafe(source, lang));
}

function lineIsCatalogEssay(line, ui, lang) {
  const text = normalizeCopy(line);
  if (!text) return false;
  const described = normalizeCopy(localizeSafe(ui?.mergePreview?.description, lang));
  if (described && text === described) return true;
  if (described && text.length > 140 && (text.includes(described) || described.includes(text))) return true;
  const result = ui?.mergePreview?.result || ui?.mergePreview?.unit;
  const essay = result?.type ? catalogEssay(result.type, result.kind, lang) : '';
  return !!(essay && essay.length > 40 && text.includes(essay));
}

function renderMessages(ui, lang, tr, options = {}) {
  let lines = messageLines(ui, lang, tr);
  if (options.omitEssays) lines = lines.filter((line) => !lineIsCatalogEssay(line, ui, lang));
  if (!lines.length) return null;
  return el('div', { class: 'ff-message', role: 'status', 'aria-live': 'polite', 'data-testid': 'panel-message', text: lines.join(' ') });
}

function renderSlotFace(slot, lang, tr) {
  const unit = slot?.unit;
  const number = el('small', { text: String((slot?.index ?? 0) + 1) });
  const name = el('small', { text: unit ? unitLabel(unit, lang, tr) : tr('emptySlot') });
  const mark = el('small', {
    class: 'ff-pips',
    text: unit && !isHero(unit) ? rankPips(unit.rank) : (isHero(unit) ? '★' : ''),
  });
  return [number, name, mark];
}

function renderSelectGrid(state, ui, lang, tr) {
  const list = el('div', { class: 'grid ff-slots', 'data-testid': 'slot-grid', role: 'group' });
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    const unit = slot.unit;
    const classes = ['slot-btn'];
    if (ui.selectedSlot === index) classes.push('is-selected');
    if (isHero(unit)) classes.push('is-hero');
    const label = `${tr('select')} ${slotCaption(slot, tr)} ${unit ? unitLabel(unit, lang, tr) : tr('emptySlot')}`;
    list.append(button({
      class: classes.join(' '),
      'data-action': 'selectSlot',
      'data-index': String(index),
      'data-testid': `select-slot-${index}`,
      'data-kind': unit ? (isHero(unit) ? 'hero' : (unit.kind || 'tower')) : 'empty',
      'aria-pressed': ui.selectedSlot === index ? 'true' : 'false',
      'aria-label': label,
    }, ...renderSlotFace(slot, lang, tr)));
  }
  return list;
}

function renderMoveGrid(state, lang, tr) {
  const wrap = el('div', { 'data-testid': 'move-grid' });
  const from = ephemeral.from;
  if (!slotUnit(state, from)) {
    wrap.append(el('p', { class: 'muted', text: tr('sourceHint') }));
    const list = el('div', { class: 'grid ff-slots' });
    for (let index = 0; index < 10; index += 1) {
      const unit = slotUnit(state, index);
      const slot = slotAt(state, index) || { index, unit: null };
      if (!unit) {
        list.append(el('div', { class: 'ff-note', 'data-testid': `move-empty-${index}` }, ...renderSlotFace(slot, lang, tr)));
        continue;
      }
      list.append(button({
        class: isHero(unit) ? 'slot-btn is-hero' : 'slot-btn',
        'data-intent': 'set-from',
        'data-index': String(index),
        'data-testid': `move-source-${index}`,
        'aria-label': `${tr('move')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    }
    wrap.append(list);
    return wrap;
  }
  const source = slotUnit(state, from);
  wrap.append(el('p', { text: `${tr('move')} · ${unitLabel(source, lang, tr)} · ${slotCaption(slotAt(state, from), tr)}` }));
  wrap.append(el('p', { class: 'muted', text: tr('moveHint') }));
  const list = el('div', { class: 'grid ff-slots' });
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    if (index === from) {
      list.append(el('div', { class: 'ff-note is-selected', 'data-testid': `move-source-current` }, ...renderSlotFace(slot, lang, tr)));
      continue;
    }
    const occupant = slot.unit;
    const verb = occupant ? tr('swap') : tr('emptySlot');
    list.append(button({
      class: isHero(occupant) ? 'slot-btn is-hero' : 'slot-btn',
      'data-action': 'move',
      'data-from': String(from),
      'data-to': String(index),
      'data-testid': `move-to-${index}`,
      'aria-label': `${tr('move')} ${verb} ${slotCaption(slot, tr)} ${occupant ? unitLabel(occupant, lang, tr) : ''}`.trim(),
    }, el('small', { text: verb }), ...renderSlotFace(slot, lang, tr).slice(1)));
  }
  wrap.append(list);
  return wrap;
}

function renderMergeGrid(state, lang, tr) {
  const wrap = el('div', { 'data-testid': 'merge-grid' });
  const partners = nonHeroSlots(state);
  if (partners.length < 2) {
    wrap.append(el('p', { class: 'muted', 'data-testid': 'no-merge-partner', text: tr('noMergePartner') }));
    return wrap;
  }
  const from = ephemeral.from;
  if (!slotUnit(state, from) || isHero(slotUnit(state, from))) {
    wrap.append(el('p', { class: 'muted', text: tr('mergeSourceHint') }));
    const list = el('div', { class: 'grid ff-slots' });
    for (let index = 0; index < 10; index += 1) {
      const slot = slotAt(state, index) || { index, unit: null };
      const unit = slot.unit;
      if (!unit) {
        list.append(el('div', { class: 'ff-note' }, ...renderSlotFace(slot, lang, tr)));
        continue;
      }
      if (isHero(unit)) {
        list.append(el('div', {
          class: 'ff-note is-hero',
          'data-testid': `merge-blocked-${index}`,
          role: 'note',
        }, el('small', { text: tr('hero') }), el('small', { text: tr('heroProtected') })));
        continue;
      }
      list.append(button({
        class: 'slot-btn',
        'data-intent': 'set-merge-from',
        'data-index': String(index),
        'data-testid': `merge-source-${index}`,
        'aria-label': `${tr('merge')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    }
    wrap.append(list);
    return wrap;
  }
  const source = slotUnit(state, from);
  wrap.append(el('p', { text: `${tr('merge')} · ${unitLabel(source, lang, tr)} · ${tr('rank')} ${fmtNum(source.rank || 1, lang)}` }));
  wrap.append(el('p', { class: 'muted', text: tr('mergeHint') }));
  const list = el('div', { class: 'grid ff-slots' });
  const notes = el('ul', { class: 'muted', 'data-testid': 'merge-blocked-list' });
  let legal = 0;
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    const unit = slot.unit;
    if (index === from) {
      list.append(el('div', { class: 'ff-note is-selected' }, ...renderSlotFace(slot, lang, tr)));
      continue;
    }
    if (!unit) {
      list.append(el('div', { class: 'ff-note', 'data-testid': `merge-blocked-${index}` }, el('small', { text: tr('emptySlot') })));
      continue;
    }
    if (isHero(unit)) {
      list.append(el('div', { class: 'ff-note is-hero', 'data-testid': `merge-blocked-${index}`, role: 'note' }, el('small', { text: tr('heroProtected') })));
      notes.append(el('li', { text: `${unitLabel(unit, lang, tr)} · ${tr('heroProtected')}` }));
      continue;
    }
    const preview = safePreview(state, from, index);
    if (preview.ok) {
      legal += 1;
      list.append(button({
        class: 'slot-btn btn-primary',
        primary: true,
        'data-action': 'mergePreview',
        'data-from': String(from),
        'data-to': String(index),
        'data-testid': `merge-target-${index}`,
        'aria-label': `${tr('mergePreview')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    } else {
      const why = reasonText(preview.reason, lang, tr);
      list.append(el('div', { class: 'ff-note', 'data-testid': `merge-blocked-${index}`, role: 'note' }, el('small', { text: unitLabel(unit, lang, tr) }), el('small', { text: tr('locked') })));
      notes.append(el('li', { text: `${unitLabel(unit, lang, tr)} · ${why}` }));
    }
  }
  wrap.append(list);
  if (!legal) wrap.append(el('p', { 'data-testid': 'no-valid-target', text: tr('noValidTarget') }));
  if (notes.childNodes.length) wrap.append(notes);
  return wrap;
}

function bilingualHint(hint, lang) {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return '';
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return '';
  const en = hint.en.trim();
  const zh = hint.zh.trim();
  if (!en || !zh) return '';
  const text = localizeSafe({ en, zh }, lang);
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function nextWaveLine(state, lang, tr) {
  const hint = bilingualHint(state?.director?.nextHint, lang);
  if (!hint) return '';
  let text = '';
  try {
    text = tr('nextWave', { hint });
  } catch {
    text = '';
  }
  if (typeof text !== 'string') text = '';
  text = text.replace(/\s+/g, ' ').trim();
  const missing = !text || text === 'nextWave' || text.includes('{hint}');
  if (missing) {
    const label = lang === 'zh' ? '下一波' : 'Next wave';
    return `${label} · ${hint}`;
  }
  if (text.includes(hint)) return text;
  return `${text} · ${hint}`;
}

function appendNextWave(parent, state, lang, tr) {
  const line = nextWaveLine(state, lang, tr);
  if (!line) return;
  parent.append(el('p', {
    class: 'muted ff-next-wave',
    'data-testid': 'next-wave',
    text: line,
  }));
}

function renderRearrange(state, ui, lang, tr, showHeroBadge) {
  const wrap = el('section', { class: 'ff-rearrange', 'data-testid': 'rearrange' });
  if (state.hiddenPaused && !state.paused && state.phase !== 'draft') {
    wrap.append(el('p', { class: 'ff-message', role: 'status', text: tr('pausedHidden') }));
    wrap.append(button({
      primary: true,
      'data-action': 'resume',
      'data-testid': 'resume-hidden',
      text: tr('resume'),
    }));
    return wrap;
  }
  if (!planningAvailable(state)) {
    if (state.phase === 'playing') {
      wrap.append(el('h3', { text: tr('planning') }));
      appendNextWave(wrap, state, lang, tr);
      wrap.append(el('p', { class: 'muted', text: tr('planningLocked') }));
      wrap.append(el('p', { class: 'muted', text: tr('pauseToPlan') }));
      wrap.append(button({
        primary: true,
        'data-action': 'pause',
        'data-testid': 'pause-to-plan',
        text: tr('pause'),
      }));
    }
    return wrap;
  }
  wrap.append(el('h3', { text: tr('planning') }));
  appendNextWave(wrap, state, lang, tr);
  if (state.paused && state.phase === 'playing') {
    wrap.append(button({
      'data-action': 'resume',
      'data-testid': 'resume-planning',
      text: tr('resume'),
    }));
  }
  const selected = slotUnit(state, ui.selectedSlot);
  if (showHeroBadge && isHero(selected)) {
    wrap.append(el('p', { class: 'badge hero-lock', 'data-testid': 'hero-protected', text: tr('heroProtected') }));
  }
  if (ephemeral.mode === 'move') {
    wrap.append(renderMoveGrid(state, lang, tr));
    wrap.append(button({ 'data-intent': 'cancel-mode', 'data-testid': 'cancel-move', text: tr('cancel') }));
    return wrap;
  }
  if (ephemeral.mode === 'merge') {
    wrap.append(el('p', { class: 'muted', text: tr('helpMerge') }));
    wrap.append(renderMergeGrid(state, lang, tr));
    wrap.append(button({ 'data-intent': 'cancel-mode', 'data-testid': 'cancel-merge', text: tr('cancel') }));
    return wrap;
  }
  wrap.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  const actions = el('div', { class: 'ff-actions' });
  actions.append(button({
    'data-intent': 'pick-move',
    'data-testid': 'move-toggle',
    'data-focus': 'cancel-move',
    text: tr('move'),
  }));
  const partners = nonHeroSlots(state);
  if (partners.length >= 2) {
    actions.append(button({
      'data-intent': 'pick-merge',
      'data-testid': 'merge-toggle',
      'data-focus': 'cancel-merge',
      text: tr('merge'),
    }));
  }
  wrap.append(actions);
  if (partners.length < 2) wrap.append(el('p', { class: 'muted', 'data-testid': 'no-merge-partner', text: tr('noMergePartner') }));
  if (isHero(selected)) wrap.append(el('p', { class: 'muted', text: tr('heroNoMerge') }));
  wrap.append(renderSelectGrid(state, ui, lang, tr));
  return wrap;
}

function clipMergeLine(text, lang) {
  const max = lang === 'zh' ? 28 : 48;
  const value = normalizeCopy(text);
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trim()}…`;
}

function mergeExtraLines(state, result, from, to, lang, tr) {
  const lines = [];
  const left = slotUnit(state, from);
  const right = slotUnit(state, to);
  const side = (unit, index) => {
    if (!unit) return tr('emptySlot');
    const rank = Number(unit.rank) || 1;
    const rankBit = rank > 1 ? ` ${tr('rank')} ${fmtNum(rank, lang)}` : '';
    return `${index + 1} ${unitLabel(unit, lang, tr)}${rankBit}`;
  };
  if (left || right) lines.push(clipMergeLine(`${side(left, from)} + ${side(right, to)}`, lang));
  if (result) {
    const signature = signatureLine(safeStats(result, state), lang, tr);
    if (signature) lines.push(clipMergeLine(signature, lang));
  }
  return lines.filter(Boolean).slice(0, 2);
}

function mergeActionButton(attrs, label) {
  return button({
    ...attrs,
    class: 'ff-merge-btn',
    style: 'min-height:44px;height:44px;min-width:44px',
  }, label);
}

function renderMergeConfirm(state, ui, lang, tr) {
  const { from, to } = endpoints(ui);
  const card = el('article', {
    class: 'card ff-merge',
    'data-testid': 'build-merge',
    'data-from': String(from),
    'data-to': String(to),
  });
  const finish = (includeConfirm) => {
    const actions = el('div', { class: 'ff-actions ff-merge-actions' });
    if (includeConfirm) {
      actions.append(mergeActionButton({
        primary: true,
        'data-action': 'mergeConfirm',
        'data-from': String(from),
        'data-to': String(to),
        'data-testid': 'merge-confirm',
      }, tr('mergeConfirm')));
    }
    actions.append(mergeActionButton({
      'data-action': 'mergeCancel',
      'data-testid': 'merge-cancel',
    }, tr('mergeCancel')));
    card.append(actions);
    return card;
  };
  if (!validSlot(from) || !validSlot(to) || from === to) {
    card.append(el('p', { 'data-testid': 'merge-reason', text: tr('invalidMerge') }));
    return finish(false);
  }
  const preview = safePreview(state, from, to);
  const stored = ui.mergePreview && typeof ui.mergePreview === 'object' ? ui.mergePreview : null;
  if (!preview.ok) {
    card.append(el('p', { 'data-testid': 'merge-reason', text: reasonText(preview.reason || stored?.reason, lang, tr) }));
    return finish(false);
  }
  const result = preview.result || stored?.result || stored?.unit || null;
  const name = result ? unitLabel(result, lang, tr) : tr('merge');
  const rank = Number(result?.rank) || 1;
  const heading = el('h2', { class: 'ff-title', 'data-testid': 'merge-result-name' });
  heading.append(el('span', { text: name }));
  heading.append(el('span', {
    class: 'ff-pips',
    'data-testid': 'merge-result-rank',
    text: ` · ${tr('rank')} ${fmtNum(rank, lang)} ${rankPips(rank)}`,
  }));
  card.append(heading);
  const extra = el('div', { 'data-testid': 'merge-preview-lines' });
  const lines = mergeExtraLines(state, result, from, to, lang, tr);
  lines.forEach((text, index) => {
    extra.append(el('p', {
      'data-testid': index === 0 ? 'merge-ingredients' : 'merge-result-description',
      text,
    }));
  });
  card.append(extra);
  return finish(true);
}

function draftIntro(lang) {
  return lang === 'zh'
    ? '选一张。塔接着放置，英雄升级立刻生效。'
    : 'Pick one. Towers are placed next. Hero upgrades apply now.';
}

function choiceLimit(lang) {
  return lang === 'zh' ? 20 : 36;
}

function fitChoice(segments, max) {
  const chosen = segments.filter((segment) => segment && segment.text);
  const length = () => chosen.map((segment) => segment.text).join(' · ').length;
  while (length() > max) {
    let index = -1;
    let rank = -1;
    for (let i = 0; i < chosen.length; i += 1) {
      if (!chosen[i].optional) continue;
      const drop = chosen[i].drop ?? 1;
      if (drop >= rank) {
        rank = drop;
        index = i;
      }
    }
    if (index < 0) break;
    chosen.splice(index, 1);
  }
  return chosen.map((segment) => segment.text).join(' · ');
}

function towerRole(type, lang) {
  return localizeSafe(towerRecord(type)?.role, lang);
}

function roleSegment(role, signature) {
  if (!role) return '';
  if (signature && signature.toLowerCase().includes(role.toLowerCase())) return '';
  return role;
}

function signatureLine(stats, lang, tr) {
  if (!stats) return lang === 'zh' ? '单体射击' : 'Single-target shot';
  if (stats.burn && typeof stats.burn === 'object') {
    const dps = fmtNum(Number(stats.burn.dps ?? stats.burn.damage), lang);
    const splash = Number(stats.splash) > 0;
    if (lang === 'zh') return splash ? `溅射燃烧 ${dps}/秒` : `燃烧 ${dps}/秒`;
    return splash ? `Splash and burn ${dps}/s` : `Burn ${dps}/s`;
  }
  if (stats.slow && typeof stats.slow === 'object') {
    const factor = Number(stats.slow.factor ?? stats.slow.power);
    if (Number.isFinite(factor) && factor > 0 && factor <= 1) {
      const kept = fmtNum(Math.round(factor * 100), lang);
      return lang === 'zh' ? `减速至 ${kept}%` : `Slows to ${kept}% speed`;
    }
    return lang === 'zh' ? '减速单个敌人' : 'Slows one enemy';
  }
  if (stats.poison && typeof stats.poison === 'object') {
    const stacks = fmtNum(Number(stats.poison.maxStacks ?? stats.poison.stacks ?? 1), lang);
    const dps = fmtNum(Number(stats.poison.dps ?? stats.poison.damage), lang);
    return lang === 'zh' ? `${tr('poison')} ${dps}/秒，${stacks} 层` : `${tr('poison')} ${dps}/s, ${stacks} stacks`;
  }
  if (stats.aura && typeof stats.aura === 'object') {
    const damage = percentNumber(stats.aura.damage);
    const haste = percentNumber(stats.aura.haste);
    const parts = [];
    if (damage) parts.push(`+${fmtNum(damage, lang)}% ${tr('damage')}`);
    if (haste) parts.push(`+${fmtNum(haste, lang)}% ${tr('haste')}`);
    const body = parts.join(lang === 'zh' ? '，' : ', ');
    return body ? `${tr('aura')} ${body}` : tr('aura');
  }
  if (Number(stats.chain) > 0) return `${tr('chain')} ${fmtNum(stats.chain, lang)}`;
  if (Number(stats.pierce) > 0) return `${tr('pierce')} ${fmtNum(stats.pierce, lang)}`;
  if (Number(stats.splash) > 0) return lang === 'zh' ? '范围溅射' : 'Splash on impact';
  return lang === 'zh' ? '单体射击' : 'Single-target shot';
}

function heroEffectLine(record, lang, tr) {
  const effect = record?.effect;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return '';
  if (finite(effect.damageAdd) && Number(effect.damageAdd) !== 0) {
    return `${tr('damage')} +${fmtNum(effect.damageAdd, lang)}`;
  }
  if (finite(effect.haste) && Number(effect.haste) !== 0) {
    return `${tr('attackSpeed')} +${fmtNum(Math.round(Number(effect.haste) * 100), lang)}%`;
  }
  if (finite(effect.range) && Number(effect.range) !== 0) {
    return `${tr('range')} +${fmtNum(effect.range, lang)}`;
  }
  if (finite(effect.critChance) && Number(effect.critChance) !== 0) {
    return `${tr('crit')} +${fmtNum(Math.round(Number(effect.critChance) * 100), lang)}%`;
  }
  if (finite(effect.critMultiplier) && Number(effect.critMultiplier) !== 0) {
    return `${tr('critDamage')} +${fmtNum(effect.critMultiplier, lang)}×`;
  }
  if (finite(effect.pierce) && Number(effect.pierce) !== 0) {
    return `${tr('pierce')} +${fmtNum(effect.pierce, lang)}`;
  }
  if (effect.poison && typeof effect.poison === 'object') {
    const dps = fmtNum(effect.poison.dps, lang);
    const duration = fmtNum(effect.poison.duration, lang);
    return lang === 'zh'
      ? `${tr('poison')} ${dps}/秒，${duration} 秒`
      : `${tr('poison')} ${dps}/s for ${duration}s`;
  }
  const sentence = localizeSafe(record?.description, lang).replace(/\s+/g, ' ').trim();
  if (!sentence) return '';
  const first = sentence.split(/(?<=[。！？.!?])\s*/)[0] || sentence;
  return first.replace(/[。.!]$/, '');
}

function compactOffer(state, option, lang, tr) {
  const max = choiceLimit(lang);
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    const record = upgradeRecord(id);
    const hero = findHero(state);
    const effect = heroEffectLine(record, lang, tr) || tr('chooseUpgrade');
    const cap = Number(record?.cap ?? option?.cap);
    const current = upgradeLevel(hero, id);
    const next = Number.isFinite(Number(option?.nextLevel)) ? Number(option.nextLevel) : current + 1;
    const levelText = Number.isFinite(cap) ? `${tr('level')} ${fmtNum(next, lang)}/${fmtNum(cap, lang)}` : '';
    const blurb = fitChoice([
      { text: tr('hero'), optional: true, drop: 2 },
      { text: effect, optional: false },
      { text: levelText, optional: true, drop: 1 },
    ], max);
    return { blurb, stats: [] };
  }
  const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
  const preview = option?.unit && typeof option.unit === 'object'
    ? option.unit
    : { id: `preview-${option?.type || 'tower'}`, kind: option?.kind || 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
  const stats = safeStats(preview, state);
  const signature = signatureLine(stats, lang, tr);
  const role = roleSegment(towerRole(option?.type || preview.type, lang), signature);
  const aura = stats?.aura && typeof stats.aura === 'object';
  const damage = !aura && finite(stats?.damage) ? `${tr('damage')} ${fmtNum(stats.damage, lang)}` : '';
  const interval = Number(stats?.interval);
  const speed = !aura && interval > 0 ? `${tr('attackSpeed')} ${fmtNum(1 / interval, lang)}${perSecond(lang)}` : '';
  const blurb = fitChoice([
    { text: option?.replace ? tr('replace') : '', optional: false },
    { text: role, optional: true, drop: 2 },
    { text: signature, optional: false },
    { text: damage, optional: true, drop: 1 },
    { text: speed, optional: true, drop: 3 },
  ], max);
  return { blurb, stats: [] };
}

function legalMergePairs(state) {
  const towers = nonHeroSlots(state);
  const pairs = [];
  for (let left = 0; left < towers.length; left += 1) {
    for (let right = left + 1; right < towers.length; right += 1) {
      const preview = safePreview(state, towers[left], towers[right]);
      if (preview.ok) pairs.push({ from: towers[left], to: towers[right] });
    }
  }
  return pairs;
}

function pairLabel(state, from, to, lang, tr) {
  const side = (index) => {
    const unit = slotUnit(state, index);
    const rank = Number(unit?.rank) || 1;
    const rankBit = rank > 1 ? ` ${tr('rank')}${fmtNum(rank, lang)}` : '';
    return `${index + 1} ${unitLabel(unit, lang, tr)}${rankBit}`;
  };
  return `${side(from)} + ${side(to)}`;
}

function renderDraftMerge(state, lang, tr, ui) {
  if (mergeConfirmActive(ui)) return null;
  if (nonHeroSlots(state).length < 2) return null;
  const wrap = el('div', { class: 'ff-draft-merge', 'data-testid': 'draft-merge' });
  if (ephemeral.mode !== 'merge') {
    wrap.append(button({
      'data-intent': 'pick-merge',
      'data-testid': 'draft-merge-open',
      text: tr('mergePreview'),
    }));
    return wrap;
  }
  const pairs = legalMergePairs(state);
  if (!pairs.length) {
    wrap.append(el('p', { 'data-testid': 'no-valid-target', text: tr('noValidTarget') }));
  } else {
    const list = el('div', { class: 'ff-draft-list', 'data-testid': 'draft-merge-pairs' });
    for (const pair of pairs) {
      list.append(button({
        'data-action': 'mergePreview',
        'data-from': String(pair.from),
        'data-to': String(pair.to),
        'data-testid': `draft-merge-${pair.from}-${pair.to}`,
        text: pairLabel(state, pair.from, pair.to, lang, tr),
      }));
    }
    wrap.append(list);
  }
  wrap.append(el('p', { class: 'muted', text: tr('heroProtected') }));
  wrap.append(button({
    'data-intent': 'cancel-mode',
    'data-testid': 'cancel-merge',
    text: tr('mergeCancel'),
  }));
  return wrap;
}

function draftBaseType(option) {
  if (!option || typeof option !== 'object') return '';
  if (option.kind === 'hero_upgrade') return '';
  if (option.kind && option.kind !== 'tower') return '';
  const type = typeof option.type === 'string' ? option.type.trim() : '';
  if (!type || type === 'hero') return '';
  return type;
}

function boardHasBaseType(state, type) {
  if (!type) return false;
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit) || unit.kind === 'hybrid') continue;
    if (unit.type === type) return true;
  }
  return false;
}

function draftFieldLabel(state, option, lang, tr) {
  const type = draftBaseType(option);
  if (!type) return null;
  const onField = boardHasBaseType(state, type);
  const key = onField ? 'draftOnField' : 'draftNewType';
  let text = tr(key);
  if (typeof text !== 'string' || text === '' || text === key) {
    const fallback = lang === 'zh'
      ? { draftOnField: '场上已有', draftNewType: '场上还没有' }
      : { draftOnField: 'Already on the field', draftNewType: 'Not on the field yet' };
    text = fallback[key];
  }
  return { onField, type, text };
}

const ROLE_CUES = {
  bolt: { glyph: '➤', color: '#f0d56a', en: 'Shot', zh: '投射' },
  fire: { glyph: '▲', color: '#e25b2a', en: 'Burn', zh: '燃烧' },
  frost: { glyph: '❄', color: '#9fd7e8', en: 'Slow', zh: '减速' },
  lightning: { glyph: '↯', color: '#f4e27a', en: 'Chain', zh: '连锁' },
  poison: { glyph: '●', color: '#7dce6a', en: 'Stack', zh: '叠毒' },
  support: { glyph: '✚', color: '#8fd0c6', en: 'Aura', zh: '光环' },
};

const METER_CAPTION = {
  en: { damage: 'Dmg', speed: 'Spd', range: 'Rng', crit: 'Crit', critDamage: 'C×', pierce: 'Pierce', poison: 'Tox' },
  zh: { damage: '伤', speed: '速', range: '距', crit: '暴', critDamage: '爆', pierce: '穿', poison: '毒' },
};

function fillPct(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(part / whole * 100)));
}

function threeBars(damage, speed, range) {
  return [
    { key: 'damage', fill: damage },
    { key: 'speed', fill: speed },
    { key: 'range', fill: range },
  ];
}

function towerPowerBars(state, option) {
  const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
  const preview = option?.unit && typeof option.unit === 'object'
    ? option.unit
    : { id: `preview-${option?.type || 'tower'}`, kind: option?.kind || 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
  const stats = safeStats(preview, state) || {};
  const interval = Number(stats.interval);
  return threeBars(
    fillPct(Number(stats.damage) || 0, 12),
    fillPct(interval > 0 ? 1 / interval : 0, 1.6),
    fillPct(Number(stats.range) || 0, 280),
  );
}

function heroPowerBars(option) {
  const record = upgradeRecord(resolveUpgradeId(option));
  const effect = record?.effect || {};
  const cap = Number(record?.cap ?? option?.cap);
  const next = Number(option?.nextLevel);
  const progress = Number.isFinite(cap) && cap > 0 && Number.isFinite(next) ? next / cap : 0.75;
  const strong = Math.max(36, Math.min(100, Math.round(36 + 64 * progress)));
  const dim = 14;
  if (effect.damageAdd) return threeBars(strong, dim, dim);
  if (effect.haste) return threeBars(dim, strong, dim);
  if (effect.range) return threeBars(dim, dim, strong);
  if (effect.critChance) return [{ key: 'crit', fill: strong }];
  if (effect.critMultiplier) return [{ key: 'critDamage', fill: strong }];
  if (Number(effect.pierce) > 0) return [{ key: 'pierce', fill: strong }];
  if (effect.poison) return [{ key: 'poison', fill: strong }];
  return [{ key: 'damage', fill: strong }];
}

function powerBars(state, option) {
  if (option?.kind === 'hero_upgrade') return heroPowerBars(option);
  return towerPowerBars(state, option);
}

function meterCaption(key, lang) {
  const table = lang === 'zh' ? METER_CAPTION.zh : METER_CAPTION.en;
  return table[key] || '';
}

function renderMeter(state, option, lang, index) {
  const bars = powerBars(state, option);
  const meter = el('span', {
    class: 'ff-meter',
    'data-testid': `draft-choice-${index}-meter`,
    'data-bars': String(bars.length),
    'aria-hidden': 'true',
  });
  for (const bar of bars) {
    const row = el('span', { class: 'ff-meter-row', 'data-meter': bar.key, 'data-fill': String(bar.fill) });
    row.append(el('span', { text: meterCaption(bar.key, lang) }));
    row.append(el('span', { class: 'ff-meter-track' }, el('span', {
      class: 'ff-meter-fill',
      style: `width:${bar.fill}%`,
    })));
    meter.append(row);
  }
  return meter;
}

function heroMarkLabel(effect, lang) {
  let key = '';
  if (effect.damageAdd) key = 'damage';
  else if (effect.haste) key = 'speed';
  else if (effect.range) key = 'range';
  else if (effect.critChance) key = 'crit';
  else if (effect.critMultiplier) key = 'critDamage';
  else if (Number(effect.pierce) > 0) key = 'pierce';
  else if (effect.poison) key = 'poison';
  const labels = lang === 'zh'
    ? { damage: '伤害', speed: '攻速', range: '射程', crit: '暴击', critDamage: '暴伤', pierce: '穿透', poison: '毒素' }
    : { damage: 'Damage', speed: 'Speed', range: 'Range', crit: 'Crit', critDamage: 'Crit×', pierce: 'Pierce', poison: 'Poison' };
  return labels[key] || '';
}

function heroStatCue(option, lang) {
  const id = resolveUpgradeId(option);
  const record = upgradeRecord(id);
  const effect = record?.effect || {};
  const label = heroMarkLabel(effect, lang);
  if (effect.damageAdd) return { glyph: '＋', color: '#f0d56a', label };
  if (effect.haste) return { glyph: '»', color: '#f0cb72', label };
  if (effect.range) return { glyph: '→', color: '#9fd7e8', label };
  if (effect.critChance) return { glyph: '✦', color: '#f0cb72', label };
  if (effect.critMultiplier) return { glyph: '×', color: '#e7a08a', label };
  if (Number(effect.pierce) > 0) return { glyph: '│', color: '#d7e4ea', label };
  if (effect.poison) return { glyph: '●', color: '#7dce6a', label };
  return { glyph: '★', color: '#f0cb72', label };
}

function draftMark(option, lang, tr) {
  if (option?.kind === 'hero_upgrade') return heroStatCue(option, lang, tr);
  const cue = ROLE_CUES[option?.type];
  if (!cue) return { glyph: '◆', color: '#d7e4ea', label: '' };
  return { glyph: cue.glyph, color: cue.color, label: lang === 'zh' ? cue.zh : cue.en };
}

/** Glanceable mark and meter for one of the three draft cards. */
function draftPower(state, option, language) {
  const lang = language === 'zh' ? 'zh' : 'en';
  const tr = (key, vars) => translate(lang, key, vars);
  const mark = draftMark(option, lang, tr);
  return {
    glyph: mark.glyph,
    label: mark.label,
    color: mark.color,
    bars: powerBars(state, option).map((bar) => ({
      key: bar.key,
      fill: bar.fill,
      caption: meterCaption(bar.key, lang),
    })),
  };
}

function renderDraft(state, lang, tr, idSuffix) {
  const section = el('section', { 'data-testid': 'build-draft', 'data-compact': '1' });
  const titleId = `ff-draft-title-${idSuffix}`;
  const title = el('h2', { id: titleId, class: 'ff-title', 'data-testid': 'draft-title', text: tr('chooseOneOfThree') });
  section.append(title);
  section.setAttribute('aria-labelledby', titleId);
  section.append(el('p', { class: 'muted ff-draft-hint', 'data-testid': 'draft-hint', text: draftIntro(lang) }));
  const options = Array.isArray(state.draft?.options) ? state.draft.options : null;
  if (!options || !options.length) {
    section.append(el('p', { 'data-testid': 'draft-empty', text: tr('noDraft') }));
    return section;
  }
  const list = el('ol', { class: 'ff-draft-list', 'data-testid': 'draft-list', 'data-count': String(options.length) });
  options.forEach((option, index) => {
    const name = draftOptionName(option, lang, tr);
    const offer = compactOffer(state, option, lang, tr);
    const field = draftFieldLabel(state, option, lang, tr);
    const effectId = `ff-draft-effect-${idSuffix}-${index}`;
    const statText = offer.stats.join(' · ');
    const mark = draftMark(option, lang, tr);
    const described = statText ? `${offer.blurb}. ${statText}` : offer.blurb;
    const spoken = field ? `${name}. ${field.text}. ${described}` : `${name}. ${described}`;
    const card = button({
      class: 'card ff-choice',
      'data-action': 'chooseDraft',
      'data-index': String(index),
      'data-kind': option?.kind || '',
      'data-type': option?.type || '',
      'data-upgrade-id': option?.upgradeId || '',
      'data-replace': option?.replace ? 'true' : 'false',
      'data-option-id': option?.id || '',
      'data-testid': `draft-choice-${index}`,
      'aria-describedby': effectId,
      'aria-label': spoken,
    });
    const markNode = el('span', {
      class: 'ff-mark',
      'data-testid': `draft-choice-${index}-mark`,
      'data-stat': mark.label || '',
      style: `color:${mark.color}`,
      'aria-hidden': 'true',
    });
    markNode.append(el('b', { text: mark.glyph }));
    if (mark.label) markNode.append(el('small', { text: mark.label }));
    card.append(markNode, renderMeter(state, option, lang, index));
    const copy = el('span', { class: 'ff-choice-copy' });
    copy.append(el('h3', { 'data-testid': `draft-choice-${index}-name`, text: name }));
    if (field) {
      copy.append(el('p', {
        class: `badge ff-field ${field.onField ? 'is-owned' : 'is-new'}`,
        'data-testid': `draft-choice-${index}-field`,
        'data-on-field': field.onField ? 'true' : 'false',
        'data-type': field.type,
        text: field.text,
      }));
    }
    copy.append(el('p', { id: effectId, class: 'ff-blurb', 'data-testid': `draft-choice-${index}-effect`, text: offer.blurb }));
    if (statText) {
      copy.append(el('p', { class: 'ff-statline', 'data-testid': `draft-choice-${index}-stats`, text: statText }));
    }
    card.append(copy);
    list.append(el('li', { 'data-testid': `draft-card-${index}` }, card));
  });
  section.append(list);
  return section;
}

function renderPlacing(state, lang, tr) {
  const section = el('section', { 'data-testid': 'build-placing' });
  section.append(el('h2', { class: 'ff-title', text: tr('chooseSlot') }));
  section.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  const pending = state.pendingUnit;
  const unit = pending?.unit;
  if (!unit) {
    section.append(el('p', { text: tr('loading') }));
    section.append(button({
      'data-action': 'cancelPlacement',
      'data-testid': 'cancel-placement',
      text: tr('cancelPlacement'),
    }));
    return section;
  }
  const allowReplace = pending.replace === true || emptySlots(state).length === 0;
  section.append(el('article', { class: 'card', 'data-testid': 'placing-unit' },
    el('span', { class: 'badge', text: pending.replace ? tr('replace') : tr('kindTower') }),
    el('h3', { 'data-testid': 'pending-name', text: unitLabel(unit, lang, tr) }),
    unitDescription(unit, lang) ? el('p', { class: 'muted', text: unitDescription(unit, lang) }) : null,
    el('p', { class: 'ff-pips', text: `${tr('rank')} ${fmtNum(unit.rank || 1, lang)} ${rankPips(unit.rank || 1)}` }),
    statList(safeStats(unit, state), lang, tr, 'pending-stats'),
  ));
  if (ephemeral.replaceIndex >= 0) {
    const target = slotUnit(state, ephemeral.replaceIndex);
    const box = el('article', { class: 'card', 'data-testid': 'replace-preview' });
    box.append(el('h3', { text: tr('replaceConfirm') }));
    box.append(el('p', { text: tr('confirmReplaceBody') }));
    box.append(el('p', { 'data-testid': 'replace-target-name', text: `${tr('lostOnReplace')}: ${target ? unitLabel(target, lang, tr) : tr('emptySlot')}` }));
    box.append(el('p', { class: 'badge hero-lock', text: tr('heroProtected') }));
    const actions = el('div', { class: 'ff-actions' });
    actions.append(button({
      primary: true,
      'data-action': 'place',
      'data-index': String(ephemeral.replaceIndex),
      'data-replace': 'true',
      'data-testid': 'replace-confirm',
      text: tr('replaceConfirm'),
    }));
    actions.append(button({
      'data-intent': 'cancel-replace',
      'data-testid': 'replace-cancel',
      text: tr('cancel'),
    }));
    box.append(actions);
    section.append(box);
  } else {
    if (allowReplace && emptySlots(state).length === 0) {
      section.append(el('p', { text: tr('fullBoard') }));
      section.append(el('p', { class: 'muted', text: tr('replaceHeroSafe') }));
    } else {
      section.append(el('p', { class: 'muted', text: tr('placeHint') }));
    }
    const list = el('div', { class: 'grid ff-slots', 'data-testid': 'place-grid' });
    for (let index = 0; index < 10; index += 1) {
      const slot = slotAt(state, index) || { index, unit: null };
      const occupant = slot.unit;
      if (!occupant) {
        list.append(button({
          class: 'slot-btn',
          primary: true,
          'data-action': 'place',
          'data-index': String(index),
          'data-replace': 'false',
          'data-testid': `place-slot-${index}`,
          'aria-label': `${tr('place')} ${slotCaption(slot, tr)}`,
        }, el('small', { text: String(index + 1) }), el('small', { text: tr('place') }), el('small', { text: tr('emptySlot') })));
        continue;
      }
      if (isHero(occupant) || !allowReplace) {
        list.append(el('div', {
          class: isHero(occupant) ? 'ff-note is-hero' : 'ff-note',
          'data-testid': `place-blocked-${index}`,
          role: 'note',
        }, el('small', { text: unitLabel(occupant, lang, tr) }), el('small', { text: isHero(occupant) ? tr('heroProtected') : tr('slotOccupied') })));
        continue;
      }
      list.append(button({
        class: 'slot-btn',
        'data-intent': 'arm-replace',
        'data-index': String(index),
        'data-testid': `replace-slot-${index}`,
        'data-focus': 'replace-confirm',
        'aria-label': `${tr('replace')} ${unitLabel(occupant, lang, tr)}`,
      }, el('small', { text: tr('replace') }), el('small', { text: unitLabel(occupant, lang, tr) })));
    }
    section.append(list);
  }
  section.append(button({
    'data-action': 'cancelPlacement',
    'data-testid': 'cancel-placement',
    text: tr('cancelPlacement'),
  }));
  return section;
}

function renderDetails(state, ui, lang, tr, options) {
  const section = el('section', { class: 'card ff-details', 'data-testid': 'build-details' });
  if (state.phase === 'victory' || state.phase === 'defeat') {
    section.append(el('h2', { text: state.phase === 'victory' ? tr('victory') : tr('defeat') }));
  } else if (state.paused && state.phase === 'playing') {
    section.append(el('p', { class: 'badge', 'data-testid': 'planning-banner', text: tr('planning') }));
  }
  if (state.hiddenPaused) section.append(el('p', { class: 'muted', text: tr('pausedHidden') }));
  const index = ui.selectedSlot;
  const slot = validSlot(index) ? slotAt(state, index) : null;
  const unit = slot?.unit || null;
  if (!slot) {
    section.append(el('h2', { text: tr('select') }));
    section.append(el('p', { class: 'muted', 'data-testid': 'empty-selection', text: tr('emptySelection') }));
    section.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  } else if (!unit) {
    section.append(el('h2', { 'data-testid': 'unit-name', text: tr('emptySlot') }));
    section.append(el('p', { class: 'muted', text: slotCaption(slot, tr) }));
    section.append(el('p', { class: 'muted', text: tr('chooseEmpty') }));
    if (state.phase === 'placing' && options.placeSelected) {
      section.append(button({
        primary: true,
        'data-action': 'place',
        'data-index': String(index),
        'data-replace': 'false',
        'data-testid': 'place-selected',
        text: tr('place'),
      }));
    }
  } else {
    const kind = isHero(unit) ? tr('hero') : (unit.kind === 'hybrid' ? tr('hybrid') : tr('towers'));
    section.append(el('p', { class: isHero(unit) ? 'badge hero-lock' : 'badge', 'data-testid': 'unit-type', text: kind }));
    if (isHero(unit) && options.heroBadge) {
      section.append(el('p', { class: 'badge hero-lock', 'data-testid': 'hero-protected', text: tr('heroProtected') }));
      section.append(el('p', { class: 'muted', text: tr('heroNoMerge') }));
    }
    section.append(el('h2', { 'data-testid': 'unit-name', text: unitLabel(unit, lang, tr) }));
    section.append(el('p', { class: 'muted', text: slotCaption(slot, tr) }));
    if (!isHero(unit)) {
      section.append(el('p', { class: 'ff-pips', 'data-testid': 'unit-rank', text: `${tr('rank')} ${fmtNum(unit.rank || 1, lang)} ${rankPips(unit.rank)}` }));
      if (Number(unit.rank) >= 4) section.append(el('p', { class: 'muted', text: tr('maxRankNote') }));
    }
    const description = isHero(unit) ? '' : unitDescription(unit, lang);
    if (description) section.append(el('p', { text: description }));
    if (unit.kind === 'hybrid') {
      const recipe = recipeById(unit.type);
      if (recipe?.parents?.length) {
        const parents = recipe.parents.map((type) => towerName(type, lang, tr)).join(' + ');
        section.append(el('p', { 'data-testid': 'unit-recipe', text: `${tr('recipes')} · ${tr('ingredients')} ${parents}` }));
      }
    }
    const stats = safeStats(unit, state);
    section.append(el('h3', { text: tr('currentStats') }));
    section.append(statList(stats, lang, tr, 'unit-stats'));
    section.append(el('p', { class: 'muted', text: tr('helpRange') }));
    const auraNote = supportNote(unit, stats, tr);
    if (auraNote) section.append(el('p', { class: 'muted', 'data-testid': 'support-note', text: auraNote }));
    const mechanics = Array.isArray(stats?.mechanics) ? stats.mechanics : [];
    if (mechanics.length) {
      const list = el('ul', { class: 'ff-mechs', 'data-testid': 'unit-mechanics' });
      for (const item of mechanics) {
        const text = mechanicText(item, lang);
        if (text) list.append(el('li', { class: 'badge', text }));
      }
      if (list.childNodes.length) section.append(list);
    }
    if (isHero(unit) && unit.upgrades && typeof unit.upgrades === 'object') {
      const entries = Array.isArray(unit.upgrades) ? unit.upgrades.map((id) => [id, 1]) : Object.entries(unit.upgrades);
      if (entries.length) {
        const list = el('ul', { class: 'ff-stats', 'data-testid': 'hero-upgrades' });
        for (const [id, value] of entries) {
          const record = upgradeRecord(id);
          const name = localizeSafe(record?.name, lang) || id;
          const level = typeof value === 'number' ? value : upgradeLevel(unit, id);
          const cap = Number(record?.cap);
          const capText = Number.isFinite(cap) ? ` / ${fmtNum(cap, lang)}` : '';
          list.append(el('li', { text: `${name} · ${tr('level')} ${fmtNum(level, lang)}${capText}` }));
        }
        section.append(list);
      }
    }
    if (finite(unit.kills) && Number(unit.kills) > 0) {
      section.append(el('p', { text: `${tr('kills')} ${fmtNum(unit.kills, lang)}` }));
    }
  }
  if (options.actions && state.phase !== 'victory' && state.phase !== 'defeat') {
    section.append(renderRearrange(state, ui, lang, tr, false));
  }
  return section;
}

function restoreFocus(container) {
  const id = container.__ffFocus;
  if (!id || !/^[\w-]+$/.test(id)) return;
  if (!container.__ffFocusUntil || Date.now() > container.__ffFocusUntil) return;
  const node = container.querySelector(`[data-testid="${id}"]`);
  if (node && typeof node.focus === 'function') {
    try { node.focus(); } catch { /* the control may be hidden */ }
  }
}

function safeAct(api, action, payload) {
  try {
    if (typeof api?.act !== 'function') return { ok: false, reason: 'invalidMerge' };
    return api.act(action, payload);
  } catch (error) {
    return { ok: false, reason: error?.message || 'invalidMerge' };
  }
}

function rerenderFamily(container, api) {
  const state = typeof api?.getState === 'function' ? api.getState() : null;
  renderBuildPanel(container, state, api);
  const doc = container.ownerDocument;
  if (!doc?.querySelectorAll) return;
  for (const candidate of doc.querySelectorAll('[data-ui]')) {
    if (candidate !== container && candidate.__ffBuildCtx) {
      renderBuildPanel(candidate, api.getState?.() || state, api);
    }
  }
}

function handlePress(container, api, action, intent, control) {
  const state = typeof api.getState === 'function' ? api.getState() : null;
  const index = pickIndex(control.getAttribute('data-index'));
  const from = pickIndex(control.getAttribute('data-from'));
  const to = pickIndex(control.getAttribute('data-to'));
  container.__ffFocus = control.getAttribute('data-focus') || control.getAttribute('data-testid') || '';
  container.__ffFocusUntil = Date.now() + 500;
  const ui = readUI(api);

  if (intent === 'pick-move') {
    ephemeral.mode = 'move';
    ephemeral.to = -1;
    ephemeral.from = slotUnit(state, ui.selectedSlot) ? ui.selectedSlot : -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'pick-merge') {
    const selected = slotUnit(state, ui.selectedSlot);
    ephemeral.mode = 'merge';
    ephemeral.to = -1;
    ephemeral.from = selected && !isHero(selected) ? ui.selectedSlot : -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'cancel-mode' || intent === 'cancel-replace') {
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    ephemeral.replaceIndex = -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'set-from') {
    if (!slotUnit(state, index)) return;
    ephemeral.from = index;
    ephemeral.message = '';
    safeAct(api, 'selectSlot', { index });
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'set-merge-from') {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit)) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    ephemeral.mode = 'merge';
    ephemeral.from = index;
    ephemeral.message = '';
    safeAct(api, 'selectSlot', { index });
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'arm-replace') {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit)) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    ephemeral.replaceIndex = index;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (!action) return;

  let payload = {};
  if (action === 'chooseDraft') {
    if (!Number.isInteger(index) || index < 0) return;
    payload = { index };
    ephemeral.mode = 'idle';
  } else if (action === 'place') {
    if (!validSlot(index)) return;
    const replace = control.getAttribute('data-replace') === 'true';
    if (replace && isHero(slotUnit(state, index))) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    payload = { index, replace };
  } else if (action === 'move' || action === 'mergePreview' || action === 'mergeConfirm') {
    if (!validSlot(from) || !validSlot(to) || from === to) {
      ephemeral.message = 'same';
      rerenderFamily(container, api);
      return;
    }
    payload = { from, to };
  } else if (action === 'selectSlot') {
    if (!validSlot(index)) return;
    payload = { index };
  } else if (action === 'mergeCancel') {
    const ends = endpoints(ui);
    ephemeral.ignorePreview = { from: ends.from, to: ends.to };
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    payload = {};
  } else if (action === 'cancelPlacement') {
    ephemeral.replaceIndex = -1;
    ephemeral.mode = 'idle';
    payload = {};
  } else if (action === 'pause' || action === 'resume') {
    payload = {};
  } else {
    return;
  }

  if (action === 'mergePreview') {
    ephemeral.mode = 'merge-confirm';
    ephemeral.from = from;
    ephemeral.to = to;
    ephemeral.ignorePreview = null;
  }

  ephemeral.message = '';
  const result = safeAct(api, action, payload);
  if (result && typeof result === 'object' && result.ok === false) {
    ephemeral.message = result.reason || (action === 'move' ? 'phase' : 'invalidMerge');
    if (action === 'mergePreview' || action === 'mergeConfirm') {
      ephemeral.mode = 'merge-confirm';
      ephemeral.from = from;
      ephemeral.to = to;
    }
  } else if (action === 'mergeConfirm' || action === 'move' || action === 'place') {
    if (action === 'mergeConfirm') ephemeral.ignorePreview = { from, to };
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    if (action === 'place') ephemeral.replaceIndex = -1;
  }
  rerenderFamily(container, api);
}

function renderBuildPanel(container, state, api) {
  if (!container || typeof container.appendChild !== 'function' || container.tagName === 'CANVAS') return;
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc?.createElement) return;
  currentDoc = doc;
  const role = roleOf(container);
  if (role === 'menu') {
    clearContainer(container);
    return;
  }
  if (!role && container.querySelector?.('canvas')) return;
  ensureStyles(doc);
  bind(container);
  const safeApi = api || {};
  container.__ffBuildCtx = { api: safeApi };
  const lang = languageOf(state, safeApi);
  const tr = makeT(safeApi, lang);
  const ui = readUI(safeApi);
  if (state) syncEphemeral(state, ui);
  if ((ui.screen && ui.screen !== 'battle') || !state || !Array.isArray(state.slots)) {
    clearContainer(container);
    return;
  }

  const confirming = mergeConfirmActive(ui);
  const modalKind = state.phase === 'draft' ? 'draft' : (state.phase === 'placing' ? 'placing' : '');
  const overlayMounted = role !== 'overlay' && pageHas(container, 'overlay');
  const modalWanted = confirming || modalKind === 'draft' || modalKind === 'placing';
  const includeModal = role === 'overlay'
    ? modalWanted
    : role === 'panel'
      ? (!overlayMounted && modalWanted)
      : modalWanted;
  if (role === 'overlay' && !includeModal) {
    clearContainer(container);
    return;
  }
  const includeDetails = role !== 'overlay';
  const modalHere = includeModal && modalWanted;
  const actionsHere = modalHere
    ? true
    : includeDetails && !(overlayMounted && modalWanted);
  const showProgress = role === 'overlay' ? modalHere : !(overlayMounted && modalWanted);

  const root = el('section', {
    class: `ff-build panel${state.phase === 'draft' ? ' is-draft' : ''}${reducedMotion(state, safeApi) ? ' is-reduced' : ''}`,
    'data-testid': 'build-panel',
    'data-ff-build': '1',
    'data-phase': state.phase || '',
    'data-lang': lang,
    role: 'region',
    'aria-label': tr('buildPanelLabel'),
  });
  const messages = renderMessages(ui, lang, tr, { omitEssays: role === 'overlay' });
  if (messages) root.append(messages);
  if (showProgress) {
    root.append(el('p', { class: 'muted', 'data-testid': 'xp-progress', text: progressText(state, tr, lang) }));
  }
  if (confirming && modalHere) root.append(renderMergeConfirm(state, ui, lang, tr));
  if (modalKind === 'draft' && includeModal) root.append(renderDraft(state, lang, tr, role || 'main', ui));
  if (modalKind === 'placing' && includeModal) root.append(renderPlacing(state, lang, tr));
  if (includeDetails) {
    const draftOwnsHeroNote = modalKind === 'draft' && includeModal;
    root.append(renderDetails(state, ui, lang, tr, {
      actions: actionsHere && !modalHere,
      heroBadge: !draftOwnsHeroNote && isHero(slotUnit(state, ui.selectedSlot)),
      placeSelected: false,
    }));
  }
  if (!root.childNodes.length) {
    clearContainer(container);
    return;
  }
  clearContainer(container);
  container.append(root);
  restoreFocus(container);
}

};
__ff_factories["src/ui/meta-panel.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["renderMetaPanel"] = renderMetaPanel;
const __ff_m0 = __ff_load("src/i18n.js");
const __ff_m1 = __ff_load("src/systems/progression.js");
const __ff_m2 = __ff_load("src/data/towers.js");
const __ff_m3 = __ff_load("src/data/recipes.js");
const __ff_m4 = __ff_load("src/systems/hero.js");
const __ff_m5 = __ff_load("src/data/enemies.js");
const __ff_m6 = __ff_load("src/shared.js");
const localize = __ff_m0["localize"];
const formatNumber = __ff_m0["formatNumber"];
const resultLabel = __ff_m0["resultLabel"];
const resultStory = __ff_m0["resultStory"];
const EQUIPMENT = __ff_m1["EQUIPMENT"];
const PERMANENT_UPGRADES = __ff_m1["PERMANENT_UPGRADES"];
const getProfileBonuses = __ff_m1["getProfileBonuses"];
const TOWERS = __ff_m2["TOWERS"];
const RECIPES = __ff_m3["RECIPES"];
const HERO_UPGRADES = __ff_m4["HERO_UPGRADES"];
const ENEMIES = __ff_m5["ENEMIES"];
const BASE_TYPES = __ff_m6["BASE_TYPES"];
const CONTRACT_VERSION = __ff_m6["CONTRACT_VERSION"];
const DIFFICULTIES = __ff_m6["DIFFICULTIES"];
const clone = __ff_m6["clone"];
/**
 * Fencefall meta screens: menu, armory, codex, settings, howto, and results.
 * Renders catalogs and profile/run data. Every control calls api.act.
 * Never mutates the run or profile.
 *
 * Permanent prices read cost as a finite number, an array (or costs) indexed by
 * the current level, or a function (level, profile). Bonus fractions are
 * damage, haste, critChance, and reward; range and fence are flat amounts.
 */








const STYLE_ID = 'fencefall-meta-panel-styles';
const SCREENS = new Set(['menu', 'armory', 'codex', 'settings', 'howto', 'results']);
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];
const ENEMY_ORDER = ['shambler', 'runner', 'brute', 'armored', 'spitter', 'swarm', 'boss'];
const PERMANENT_ORDER = ['damage', 'haste', 'vitality'];
const SLOT_ORDER = ['weapon', 'charm', 'armor'];
const FRACTION_KEYS = new Set(['damage', 'haste', 'critChance', 'crit', 'reward']);
const PIXEL_KEYS = new Set(['range']);
const FLAT_KEYS = new Set(['fence', 'vitality']);

const local = {
  difficulty: null,
  seed: '',
  confirmAbandon: false,
  confirmStart: false,
  importText: '',
  exportText: '',
  codexTab: 'towers',
  flash: null,
  focus: null,
  screen: null
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

function renderMetaPanel(container, screen, state, profile, api) {
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

  if (run) body.append(runCard(ctx));

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
    summary.append(line(ctx, bonusLabel(ctx, key), value, testid));
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
  root.append(head);
  root.append(h(doc, 'p', {text: tx(api, lang, 'helpRole',
    'You plan, build, and decide. Towers and the hero attack on their own. There are no active combat abilities and no direct hero control.',
    '你负责规划、建造和抉择。防御塔与英雄会自动攻击。没有主动战斗技能，也不能直接操纵英雄作战。')}));
  root.append(boardDiagram(ctx));
  const topics = [
    ['help-fence', 'fence', 'helpFence',
      'Enemies enter from the top and attack only the shared fence. Defenders have no health. The run ends when fence HP reaches zero.',
      '敌人从上方进入，并且只攻击共享的栅栏。防御单位没有生命值。栅栏生命降到零时，本局结束。'],
    ['help-placement', 'place', 'helpPlacement',
      'Defenders fill two rows of five slots. The run starts with one hero in the front center. That hero stays independent and is never merged, replaced, or sold. While planning, drag a defender to an empty slot to move it, or onto a compatible tower to merge. An illegal drop snaps back. Moving the hero only changes its slot.',
      '防御单位占据两行，每行五个槽位。开局只有一名英雄，位于前排正中。英雄始终独立，不能被合并、替换或出售。布阵时，把防守者拖到空位即可移动，拖到可以合成的防御塔上即可合成。非法放置会弹回。移动英雄只改变它所在的槽位。'],
    ['help-range', 'range', 'helpRange',
      'A defender attacks any enemy inside a circle centered on its slot, across the whole field. There are no lanes. Rear-row ranges reach threats in front of the fence. Select a defender during battle to see its range.',
      '防御者以自己的槽位为圆心，攻击范围内的任何敌人，覆盖整个战场。战场没有分路。后排的射程能够打到栅栏前的威胁。战斗中点选防御者即可看到范围。'],
    ['help-draft', 'chooseOneOfThree', 'helpDraft',
      'Kills fill the draft meter. Each draft pauses the battle and offers exactly three choices: a new tower or a hero upgrade. Placement is a separate tap. Canceling placement keeps those same three choices. A full board still offers hero upgrades or an explicit replacement, and replacement never takes the hero.',
      '击杀会填满选卡进度。每次选卡都暂停战斗，并给出恰好三个选项：新的防御塔或英雄升级。放置需要再点一次槽位。取消放置会保留同一组三个选项。格子满了仍然会提供英雄升级或明确的替换，替换不会动到英雄。'],
    ['help-merge', 'merge', 'helpMerge',
      'While planning, pick two different occupied slots. Matching type and rank become that unit at rank + 1, up to rank 4, including two copies of the same hybrid. Different base types of equal rank become their recipe at that rank. A hybrid does not mix with a different type. The hero is protected. Preview the result, then confirm. Cancel and invalid pairs leave both units in place.',
      '规划时选择两个不同的已占用槽位。种类和等级都相同会升到下一等级，最高 4 级，相同的混合单位也可以这样升级。两种不同的基础塔在等级相同且存在配方时，会变成该等级的混合单位。混合单位不能再与另一种类混合。英雄受保护。先预览结果再确认。取消或无效组合都会保留双方。'],
    ['help-speed', 'speed', 'helpSpeed',
      'Speeds are 1x, 1.5x, and 3x. The same simulation rules advance with game time at every speed, and speed does not change rewards. Hiding the page pauses the battle; return and resume it yourself.',
      '速度只有 1 倍、1.5 倍和 3 倍。每种速度都按游戏时间推进同一套模拟，速度不会改变奖励。页面隐藏时战斗会暂停，返回后需要你自己继续。']
  ];
  for (const [testid, titleKey, bodyKey, en, zh] of topics) {
    const card = h(doc, 'article', {className: 'card', 'data-testid': testid});
    card.append(h(doc, 'h3', {text: t(api, titleKey)}), h(doc, 'p', {text: tx(api, lang, bodyKey, en, zh)}));
    root.append(card);
  }
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
  card.append(h(doc, 'p', {
    className: 'result-story',
    'data-testid': 'result-story',
    text: resultStory(lang, outcome, paid)
  }));

  if (settlement && Number.isFinite(settlement.currency)) {
    card.append(line(ctx, t(api, 'earned'), num(settlement.currency, lang), 'result-currency'));
  } else {
    const row = line(ctx, t(api, 'earned'), tx(api, lang, 'settlementPending',
      'The award appears here after the run is settled.',
      '对局完成结算后，奖励会显示在这里。'), 'result-currency');
    card.append(row);
  }

  const difficultyId = settlement?.difficulty || run?.difficulty;
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
  const play = button(ctx, {
    action: 'start',
    testid: 'btn-play',
    label: local.confirmStart && runIsLive(ctx.run) ? t(api, 'confirm') : t(api, 'play'),
    primary
  });
  play.type = 'submit';
  play.addEventListener('click', event => event.stopPropagation());
  form.append(play);
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    startRun(ctx);
  });
  return form;
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
      h(doc, 'span', {className: 'muted', text: `${t(api, 'fence')} ${num(entry.fence, lang, 0)}`}),
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
  card.append(h(doc, 'h3', {text: entryName(item, lang, item.id)}));
  const badges = h(doc, 'div', {className: 'meta-badges'});
  badges.append(badge(ctx, slotLabel(ctx, slot)));
  if (equipped) badges.append(badge(ctx, t(api, 'equipped')));
  else if (owned) badges.append(badge(ctx, t(api, 'owned')));
  card.append(badges);
  const description = entryDesc(item, lang);
  if (description) card.append(h(doc, 'p', {text: description}));
  card.append(line(ctx, t(api, 'cost'), cost == null ? '—' : num(cost, lang)));
  const effects = bonusEntries(item.bonuses || item.bonus);
  if (effects.length) {
    if (equipped) {
      card.append(line(ctx, tx(api, lang, 'bonus', 'Bonus', '加成'), equippedBonusLine(ctx, item), `equip-bonus-${cssId(item.id)}`));
    } else {
      card.append(h(doc, 'p', {className: 'muted', text: t(api, 'effect')}));
      for (const [key, value] of effects) card.append(line(ctx, bonusLabel(ctx, key), formatBonusValue(key, value, lang)));
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
  card.append(h(doc, 'h3', {text: entryName(upgrade, lang, bonusLabel(ctx, upgrade.id))}));
  const description = entryDesc(upgrade, lang);
  if (description) card.append(h(doc, 'p', {text: description}));
  card.append(line(ctx, t(api, 'level'), cap == null ? num(level, lang) : `${num(level, lang)} / ${num(cap, lang)}`));
  const perLevel = perLevelBonus(upgrade);
  for (const [key, value] of bonusEntries(perLevel)) {
    card.append(line(ctx, `${t(api, 'upgrade')} · ${bonusLabel(ctx, key)}`, formatBonusValue(key, value, lang)));
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
    card.append(h(doc, 'h3', {text: entryName(tower, lang, tower.id)}));
    card.append(badge(ctx, `${t(api, 'rank')} 1`));
    const description = entryDesc(tower, lang);
    if (description) card.append(h(doc, 'p', {text: description}));
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
    card.append(h(doc, 'h3', {text: entryName(recipe, lang, recipe.id)}));
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
    const description = entryDesc(recipe, lang);
    if (description) card.append(h(doc, 'p', {text: description}));
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
    card.append(h(doc, 'h3', {text: entryName(enemy, lang, enemy.id)}));
    if (enemy.id === 'boss' || enemy.boss) card.append(badge(ctx, entryName(enemy, lang, 'boss')));
    const description = entryDesc(enemy, lang);
    if (description) card.append(h(doc, 'p', {text: description}));
    const hp = Number.isFinite(enemy.maxHp) ? enemy.maxHp : Number.isFinite(enemy.hp) ? enemy.hp : enemy.health;
    if (Number.isFinite(hp)) card.append(line(ctx, tx(api, lang, 'health', 'Health', '生命'), num(hp, lang)));
    if (Number.isFinite(enemy.speed)) card.append(line(ctx, t(api, 'speed'), num(enemy.speed, lang, 1)));
    if (Number.isFinite(enemy.damage)) card.append(line(ctx, t(api, 'damage'), num(enemy.damage, lang)));
    if (Number.isFinite(enemy.attackInterval)) card.append(line(ctx, t(api, 'attackSpeed'), `${num(enemy.attackInterval, lang, 2)} s`));
    if (Number.isFinite(enemy.armor)) {
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
    card.append(h(doc, 'h3', {text: entryName(upgrade, lang, upgrade.id)}));
    const cap = upgradeCap(upgrade);
    if (cap != null) card.append(line(ctx, t(api, 'maxLevel'), num(cap, lang)));
    const description = entryDesc(upgrade, lang);
    if (description) card.append(h(doc, 'p', {text: description}));
    appendEffect(ctx, card, upgrade);
    wrap.append(card);
  }
  return wrap;
}

function statBlock(ctx, stats) {
  if (!stats) return null;
  const {doc, api, lang} = ctx;
  const box = h(doc, 'div', {className: 'meta-stack'});
  if (Number.isFinite(stats.damage)) box.append(line(ctx, t(api, 'damage'), num(stats.damage, lang, 2)));
  if (Number.isFinite(stats.interval) && stats.interval > 0) {
    box.append(line(ctx, t(api, 'attackSpeed'), `${num(1 / stats.interval, lang, 2)} /s`));
    box.append(line(ctx, tx(api, lang, 'interval', 'Interval', '间隔'), `${num(stats.interval, lang, 2)} s`));
  }
  if (Number.isFinite(stats.range)) box.append(line(ctx, t(api, 'range'), num(stats.range, lang, 0)));
  if (Number.isFinite(stats.critChance)) box.append(line(ctx, t(api, 'crit'), percent(stats.critChance, lang)));
  if (Number.isFinite(stats.critMultiplier) && stats.critMultiplier !== 1) {
    box.append(line(ctx, tx(api, lang, 'critMultiplier', 'Crit multiplier', '暴击倍率'), `×${num(stats.critMultiplier, lang, 2)}`));
  }
  if (Number.isFinite(stats.projectileSpeed)) {
    box.append(line(ctx, tx(api, lang, 'projectileSpeed', 'Projectile speed', '弹速'), num(stats.projectileSpeed, lang, 0)));
  }
  for (const key of ['splash', 'chain', 'chainRange', 'pierce']) {
    if (Number.isFinite(stats[key]) && stats[key] !== 0) box.append(line(ctx, bonusLabel(ctx, key), num(stats[key], lang, 2)));
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
    lines.push([tx(api, lang, 'poison', 'Poison', '毒素'), `${dotText(ctx, stats.poison)}${extra}`]);
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
  const payload = {difficulty: selectedDifficulty(ctx.profile)};
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
    const label = ctx.lang === 'zh' ? '栅栏' : 'Fence HP';
    return `${label} ${shown}`;
  }
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

function bonusLabel(ctx, key) {
  const labels = {
    damage: ['damage', 'Damage', '伤害'],
    haste: ['haste', 'Haste', '攻速'],
    range: ['range', 'Range', '射程'],
    critChance: ['crit', 'Crit chance', '暴击率'],
    crit: ['crit', 'Crit', '暴击'],
    fence: ['fence', 'Fence HP', '栅栏生命'],
    reward: ['rewardMultiplier', 'Reward', '奖励'],
    vitality: ['vitality', 'Fence HP', '栅栏生命'],
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
  if (PIXEL_KEYS.has(key)) return signed(num(value, lang, 0), value);
  if (FLAT_KEYS.has(key)) return signed(num(value, lang, Number.isInteger(value) ? 0 : 1), value);
  if (FRACTION_KEYS.has(key) && Math.abs(value) <= 1.5) return signed(percent(value, lang), value);
  return signed(num(value, lang, 2), value);
}

function dotText(ctx, effect) {
  const parts = [];
  if (Number.isFinite(effect.dps)) parts.push(`${t(ctx.api, 'damage')} ${num(effect.dps, ctx.lang, 2)}`);
  if (Number.isFinite(effect.duration)) parts.push(`${num(effect.duration, ctx.lang, 1)} s`);
  return parts.join(' · ') || '—';
}

function mechanicText(mechanic, lang) {
  if (typeof mechanic === 'string') return mechanic;
  if (!mechanic || typeof mechanic !== 'object') return '';
  const name = textOf(mechanic.name ?? mechanic.id, lang);
  const description = textOf(mechanic.description, lang);
  return description || name;
}

function pressureText(ctx, entry) {
  return [
    `${tx(ctx.api, ctx.lang, 'health', 'Health', '生命')} ×${num(entry.health, ctx.lang, 2)}`,
    `${t(ctx.api, 'speed')} ×${num(entry.speed, ctx.lang, 2)}`,
    `${t(ctx.api, 'damage')} ×${num(entry.damage, ctx.lang, 2)}`
  ].join(' · ');
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

};
__ff_factories["src/ui/shell.js"] = function(__ff_exports, __ff_load) {
"use strict";
__ff_exports["mountShell"] = mountShell;
const __ff_m0 = __ff_load("src/shared.js");
const __ff_m1 = __ff_load("src/systems/merges.js");
const __ff_m2 = __ff_load("src/systems/waves.js");
const __ff_m3 = __ff_load("src/i18n.js");
const ARENA = __ff_m0["ARENA"];
const DIFFICULTIES = __ff_m0["DIFFICULTIES"];
const canPlan = __ff_m0["canPlan"];
const hitSlot = __ff_m0["hitSlot"];
const slotGeometry = __ff_m0["slotGeometry"];
const previewMerge = __ff_m1["previewMerge"];
const bossApproaching = __ff_m2["bossApproaching"];
const formatNumber = __ff_m3["formatNumber"];
const localize = __ff_m3["localize"];





const SPEEDS = [1, 1.5, 3];
const SCREEN_NAMES = ['menu', 'battle', 'armory', 'codex', 'settings', 'howto', 'results'];

/**
 * App shell and live HUD.
 * Pointer hits map the canvas CSS box linearly onto the 360×640 arena.
 * Dragging a defender onto another slot moves it or merges it while planning.
 * An illegal drop snaps back and leaves the board unchanged.
 * Renderer resize must use that same full-box mapping (no inner letterbox).
 * `pause` is sent with no payload and is a toggle; `resume` stays the continue-run action.
 * Containers marked data-ui are never cleared here — panel modules own their children.
 * When director.playerHint has en and zh, the battle HUD shows that text in the active language.
 */
function mountShell(root, api) {
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
  const killsStat = stat('hud-kills', killsLabel, killsValue);
  const timeLabel = el('span', { class: 'stat-label' });
  const timeValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-time-value' });
  const timeStat = stat('hud-time', timeLabel, timeValue);
  const currencyLabel = el('span', { class: 'stat-label' });
  const currencyValue = el('strong', { class: 'stat-value', 'data-testid': 'hud-currency-value' });
  const currencyStat = stat('hud-currency', currencyLabel, currencyValue);
  const difficulty = el('span', { class: 'badge', 'data-testid': 'hud-difficulty' });
  const phase = el('span', { class: 'badge', 'data-testid': 'hud-phase' });
  const stats = el('div', { class: 'hud-stats' });
  stats.append(waveStat, killsStat, timeStat, currencyStat, difficulty, phase);

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
  const controls = el('div', { class: 'hud-controls' });
  controls.append(pauseButton, speedRow, detailsButton);

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
  hud.append(hudMain, controls, live);

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
    if (action === 'pause' || action === 'sound') api.act(action);
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
      if (phaseName === 'victory' || phaseName === 'defeat' || phaseName === 'draft' || phaseName === 'placing') return;
      event.preventDefault();
      api.act('pause');
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
    const planning = Boolean(state) && canPlan(state) && phaseName !== 'victory' && phaseName !== 'defeat';

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
    const topbarHeight = topbar.offsetHeight;
    if (topbarHeight > 0) shell.style.setProperty('--topbar-height', `${topbarHeight}px`);

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
    const overlayOpen = screen === 'battle' && (phaseName === 'draft' || phaseName === 'placing' || mergeOpen);
    overlayRoot.classList.toggle('is-open', overlayOpen);
    overlayRoot.classList.toggle('is-modal', (phaseName === 'draft' || mergeOpen) && overlayOpen);
    overlayRoot.classList.toggle('is-banner', phaseName === 'placing' && !mergeOpen && overlayOpen);
    menuRoot.classList.toggle('is-open', screen !== 'battle');

    canvas.setAttribute('aria-label', [text('fence'), text('helpPlacement'), text('helpRange')].filter(Boolean).join(' · '));
    setText(fieldHelp, [text('helpPlacement'), text('helpRange'), text('helpFence')].filter(Boolean).join(' '));

    const runReady = Boolean(state);
    const speedLocked = !runReady || phaseName === 'victory' || phaseName === 'defeat';
    const hiddenOnly = hiddenPaused && !paused;
    pauseButton.disabled = speedLocked || hiddenOnly;
    setText(pauseButton, hiddenOnly ? text('pausedHidden') : (paused ? text('resume') : text('pause')));
    pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
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
    fenceFill.className = `meter-fill${fencePct <= 0.25 ? ' is-low' : fencePct <= 0.55 ? ' is-mid' : ''}`;
    setWidth(fenceFill, fencePct);

    const xp = finite(state?.xp, 0);
    const nextXp = finite(state?.nextDraftXp, 0);
    const xpPct = nextXp > 0 ? clamp01(xp / nextXp) : 0;
    setText(xpLabel, text('xp'));
    const levelBit = runReady ? `${text('level')} ${num(finite(state?.draftLevel, 0), language)} · ` : '';
    setText(xpValue, runReady ? `${levelBit}${num(xp, language)} / ${num(nextXp, language)}` : '—');
    setWidth(xpFill, xpPct);

    setText(waveLabel, text('wave'));
    setText(waveValue, runReady ? num(finite(state?.wave, 0), language) : '—');
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
    const detailsOpen = shell.classList.contains('is-details-open');
    detailsButton.hidden = screen !== 'battle';
    detailsButton.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
    setText(detailsButton, text(detailsOpen ? 'hideDetails' : 'details'));
    const note = messageText(ui?.message, language, ui);
    setText(message, note);
    const hintLine = screen === 'battle' ? playerHintLine(state, language) : '';
    const nextLine = hintLine ? nextHintLine(state, language) : '';
    setText(waveHint, hintLine);
    waveHint.hidden = !hintLine;
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
    if (planning && startIndex === endIndex) {
      const selected = slotIndex(ui?.selectedSlot);
      if (validSlot(selected, state) && selected !== endIndex) {
        routePlan(state, selected, endIndex);
        return;
      }
      if (selected === endIndex) {
        api.act('selectSlot', { index: -1 });
        return;
      }
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

  function phaseBadge(state, planning) {
    if (!state) return '';
    if (state.hiddenPaused) return text('pausedHidden');
    if (state.phase === 'victory') return text('victory');
    if (state.phase === 'defeat') return text('defeat');
    if (state.phase === 'draft') return text('chooseOneOfThree');
    if (state.phase === 'placing') return text('chooseSlot');
    if (state.paused && state.phase === 'playing') return text('paused');
    if (bossApproaching(state)) return text('bossWarning');
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

function playerHintLine(state, language) {
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

function stat(testid, label, value) {
  return el('div', { class: 'stat', 'data-testid': testid }, [label, value]);
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

};
__ff_load("src/boot.js");
})();
