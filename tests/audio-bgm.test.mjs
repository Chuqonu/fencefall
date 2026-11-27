import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/audio.js';
import { createController } from '../src/boot.js';

function installStudioAudioMock() {
  const voices = [];
  const contexts = [];

  class AudioParam {
    constructor(value = 0) {
      this.value = value;
      this.automation = [];
    }
    setValueAtTime(value, time) {
      this.automation.push(['set', value, time]);
      this.value = value;
    }
    linearRampToValueAtTime(value, time) {
      this.automation.push(['linear', value, time]);
      this.value = value;
    }
    exponentialRampToValueAtTime(value, time) {
      this.automation.push(['exp', value, time]);
      this.value = value;
    }
    cancelScheduledValues() {}
  }

  class AudioNode {
    connect() { return this; }
    disconnect() {}
  }

  class GainNode extends AudioNode {
    constructor() {
      super();
      this.gain = new AudioParam(1);
    }
  }

  class DelayNode extends AudioNode {
    constructor() {
      super();
      this.delayTime = new AudioParam(0);
    }
  }

  class OscillatorNode extends AudioNode {
    constructor() {
      super();
      this.frequency = new AudioParam(440);
      this.type = 'sine';
      this.onended = null;
    }
    start(when = 0) {
      const sets = this.frequency.automation.filter((s) => s[0] === 'set').map((s) => s[1]);
      voices.push({
        kind: 'osc',
        type: this.type,
        when,
        freq: sets.length ? sets[0] : this.frequency.value,
      });
    }
    stop() {}
  }

  class BufferSourceNode extends AudioNode {
    constructor() {
      super();
      this.buffer = null;
      this.loop = false;
      this.onended = null;
    }
    start(when = 0) {
      const length = (this.buffer && this.buffer.length) || 0;
      voices.push({
        kind: this.loop || length > 1 ? 'noise' : 'silence',
        when,
        length,
      });
    }
    stop() {}
  }

  class BiquadFilterNode extends AudioNode {
    constructor() {
      super();
      this.type = 'lowpass';
      this.frequency = new AudioParam(350);
      this.Q = new AudioParam(1);
    }
  }

  class DynamicsCompressorNode extends AudioNode {
    constructor() {
      super();
      this.threshold = new AudioParam(-24);
      this.knee = new AudioParam(30);
      this.ratio = new AudioParam(12);
      this.attack = new AudioParam(0.003);
      this.release = new AudioParam(0.25);
    }
  }

  class AudioBuffer {
    constructor(channels, length, sampleRate) {
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.channels = [new Float32Array(Math.max(0, length | 0))];
    }
    getChannelData(index) {
      return this.channels[index];
    }
  }

  class AudioContext {
    constructor() {
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.state = 'suspended';
      this.destination = new AudioNode();
      this.gains = [];
      this.filters = [];
      this.delays = [];
      contexts.push(this);
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createGain() {
      const node = new GainNode();
      this.gains.push(node);
      return node;
    }
    createOscillator() { return new OscillatorNode(); }
    createBufferSource() { return new BufferSourceNode(); }
    createBiquadFilter() {
      const node = new BiquadFilterNode();
      this.filters.push(node);
      return node;
    }
    createDelay() {
      const node = new DelayNode();
      this.delays.push(node);
      return node;
    }
    createDynamicsCompressor() { return new DynamicsCompressorNode(); }
    createBuffer(channels, length, sampleRate) {
      return new AudioBuffer(channels, length, sampleRate);
    }
  }

  const prev = {
    AudioContext: globalThis.AudioContext,
    webkitAudioContext: globalThis.webkitAudioContext,
  };
  globalThis.AudioContext = AudioContext;
  globalThis.webkitAudioContext = AudioContext;
  return {
    voices,
    contexts,
    restore() {
      if (prev.AudioContext === undefined) delete globalThis.AudioContext;
      else globalThis.AudioContext = prev.AudioContext;
      if (prev.webkitAudioContext === undefined) delete globalThis.webkitAudioContext;
      else globalThis.webkitAudioContext = prev.webkitAudioContext;
    },
  };
}

function settled(param) {
  if (!param.automation.length) return param.value;
  return param.automation[param.automation.length - 1][1];
}

test('redesigned SFX palette uses warm non-square combat chimes, cycling kill sparkles, and rich auto-skill layers', async () => {
  const rig = installStudioAudioMock();
  try {
    const audio = createAudio();
    assert.equal(await audio.unlock(), true);
    audio.setEnabled(true);
    const ctx = rig.contexts[0];
    assert.ok(ctx.delays.length >= 2, 'studio slapback room delay graph is constructed when supported');

    // Hero shot: layered punchy carbine (kick + noise crack + triangle body, zero square buzz)
    let mark = rig.voices.length;
    audio.playEvents([{ type: 'shot', towerType: 'hero', time: 1, x: 180, y: 490 }]);
    const heroShot = rig.voices.slice(mark);
    assert.ok(heroShot.some((v) => v.kind === 'noise'), 'hero shot includes breech noise transient');
    assert.ok(heroShot.filter((v) => v.kind === 'osc').length >= 2, 'hero shot layers kick and body oscillators');
    assert.equal(heroShot.some((v) => v.type === 'square'), false, 'hero shot avoids harsh square waves');

    // Crit chime: golden harmonic bell without raw square screech
    ctx.currentTime += 0.2;
    mark = rig.voices.length;
    audio.playEvents([{ type: 'hit', crit: true, time: 1.2, x: 180, y: 260 }]);
    const crit = rig.voices.slice(mark).filter((v) => v.kind === 'osc');
    assert.ok(crit.length >= 2, 'crit plays harmonic double-chime');
    assert.equal(crit.some((v) => v.type === 'square'), false, 'crit avoids harsh square waves');

    // Kills cycle smoothly through pentatonic XP sparkle pitches
    const killSparkles = [];
    for (let i = 0; i < 4; i++) {
      ctx.currentTime += 0.12;
      mark = rig.voices.length;
      audio.playEvents([{ type: 'kill', time: 2 + i * 0.12, x: 180, y: 220 }]);
      const oscs = rig.voices.slice(mark).filter((v) => v.kind === 'osc');
      assert.ok(oscs.length >= 2, 'kill layers pop and sparkle');
      killSparkles.push(oscs[oscs.length - 1].freq);
    }
    assert.ok(new Set(killSparkles).size >= 3, `kill sparkles should progress melodically: ${killSparkles}`);

    // All signature auto-skills + UI + Draft produce rich multi-voice cues without harsh square waves
    const cues = [
      'napalm_blast', 'armored_car', 'cryo_barrage', 'orbital_beam', 'em_strike',
      'wall_immune', 'fence_surge', 'draft', 'draft_reroll', 'wave_horde', 'ui',
    ];
    for (const type of cues) {
      ctx.currentTime += 0.7;
      mark = rig.voices.length;
      audio.playEvents([{ type, time: ctx.currentTime, x: 180, y: 260 }]);
      const played = rig.voices.slice(mark).filter((v) => v.kind === 'osc' || v.kind === 'noise');
      assert.ok(played.length >= 2, `${type} should schedule a multi-layered cue`);
      assert.equal(played.some((v) => v.type === 'square'), false, `${type} avoids harsh square waves`);
    }

    audio.destroy();
  } finally {
    rig.restore();
  }
});

test('adaptive BGM stays silent by default, schedules grooves in menu/battle/boss, ducks cleanly in draft, and stops on mute/destroy', async () => {
  const rig = installStudioAudioMock();
  try {
    const audio = createAudio();
    assert.equal(audio.getMusicMode(), 'silent');
    assert.equal(await audio.unlock(), true);
    audio.setEnabled(true);
    const ctx = rig.contexts[0];
    // Master is gains[0], sfxBus is gains[1], bgmBus is gains[2]
    const bgmBus = ctx.gains[2];
    const bgmFilter = ctx.filters[1];
    assert.ok(bgmBus && bgmFilter, 'BGM bus and adaptive lowpass filter are initialized');

    // Silent mode schedules zero voices
    const beforeMenu = rig.voices.length;
    assert.equal(rig.voices.slice(beforeMenu).filter((v) => v.kind !== 'silence').length, 0);

    // Menu mode starts scheduling warm melodic + bass + percussion notes immediately
    audio.setMusicMode('menu');
    assert.equal(audio.getMusicMode(), 'menu');
    const menuVoices = rig.voices.slice(beforeMenu).filter((v) => v.kind === 'osc' || v.kind === 'noise');
    assert.ok(menuVoices.length >= 3, 'menu BGM schedules initial harmonic notes');
    assert.ok(settled(bgmBus.gain) > 0.25, 'menu BGM bus gain is audible');

    // Battle mode opens filter and plays driving multi-track groove
    const beforeBattle = rig.voices.length;
    ctx.currentTime += 0.3;
    audio.setMusicMode('battle');
    const battleGain = settled(bgmBus.gain);
    const battleCutoff = settled(bgmFilter.frequency);
    assert.ok(battleGain > 0.3, 'battle BGM bus gain is active');
    assert.ok(battleCutoff >= 4000, 'battle BGM filter is bright and open');
    const battleVoices = rig.voices.slice(beforeBattle).filter((v) => v.kind === 'osc' || v.kind === 'noise');
    assert.ok(battleVoices.length >= 4, 'battle BGM schedules multi-track instruments');

    // Draft mode smoothly ducks BGM gain and lowers filter cutoff for warm focus
    audio.setMusicMode('draft');
    assert.ok(settled(bgmBus.gain) < battleGain * 0.65, 'draft mode ducks BGM volume');
    assert.ok(settled(bgmFilter.frequency) < 1200, 'draft mode applies warm lowpass ducking');

    // Boss mode switches to urgent higher-energy score
    const beforeBoss = rig.voices.length;
    ctx.currentTime += 0.3;
    audio.setMusicMode('boss');
    const bossVoices = rig.voices.slice(beforeBoss).filter((v) => v.kind === 'osc' || v.kind === 'noise');
    assert.ok(bossVoices.length >= 4, 'boss BGM schedules energetic boss theme');
    assert.ok(settled(bgmBus.gain) >= battleGain, 'boss BGM raises energy cleanly');

    // Muting silences master and BGM bus and stops further scheduling
    audio.setEnabled(false);
    assert.equal(settled(ctx.gains[0].gain), 0, 'master gain ramps to 0 on mute');
    assert.equal(settled(bgmBus.gain), 0, 'BGM bus ramps to 0 on mute');

    const mutedMark = rig.voices.length;
    ctx.currentTime += 0.5;
    await new Promise((r) => setTimeout(r, 90));
    assert.equal(rig.voices.slice(mutedMark).length, 0, 'muted BGM schedules zero notes over time');

    audio.destroy();
    assert.equal(audio.getMusicMode(), 'silent');
  } finally {
    rig.restore();
  }
});

test('controller defaults sound ON and drives adaptive BGM modes across menu, battle, draft, boss, pause, and mute', async () => {
  const storageMap = new Map();
  const storage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
  };
  const modes = [];
  const fakeAudio = {
    enabled: false,
    setEnabled(v) { this.enabled = v; },
    unlock() { return Promise.resolve(true); },
    setMusicMode(m) { modes.push(m); },
    playEvents() {},
  };

  const api = await createController({ storage });
  assert.equal(api.getProfile().settings.sound, true, 'fresh profile defaults sound to ON');
  api.setAudio(fakeAudio);
  assert.equal(fakeAudio.enabled, true);
  assert.equal(modes.at(-1), 'menu', 'lobby starts in menu BGM mode');

  api.act('start', { expedition: 'stage_01', seed: 42 });
  assert.equal(modes.at(-1), 'battle', 'starting a stage switches to battle BGM');

  // Trigger draft phase
  const state = api.getState();
  state.phase = 'draft';
  api.syncMusic();
  assert.equal(modes.at(-1), 'draft', 'draft popup ducks BGM into draft mode');

  // Return to playing with an active boss
  state.phase = 'playing';
  state.enemies.push({ id: 99, kind: 'boss', dead: false, x: 180, y: 120 });
  api.syncMusic();
  assert.equal(modes.at(-1), 'boss', 'boss presence switches to boss BGM');

  // Pause silences BGM
  api.act('pause');
  assert.equal(modes.at(-1), 'silent', 'pausing silences BGM');

  // Resume returns to boss BGM, then mute silences it
  api.act('resume');
  assert.equal(modes.at(-1), 'boss');
  api.act('sound', { value: false });
  assert.equal(fakeAudio.enabled, false);
  assert.equal(modes.at(-1), 'silent');
});
