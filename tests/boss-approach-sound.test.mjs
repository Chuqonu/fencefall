// A boss warning is two short rising tones and no field flash. An execute hit
// keeps its number and adds one short red tick above it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../src/audio.js';
import {createEffects, describeFeedback} from '../src/render/effects.js';

test('describeFeedback marks a boss warning as approach and leaves other boss cues alone', () => {
  const enter = describeFeedback({type: 'boss_enter', warning: true, x: 10, y: 20});
  assert.ok(enter);
  assert.equal(enter.type, 'boss');
  assert.equal(enter.approach, true);

  const enrage = describeFeedback({type: 'boss_enrage', x: 10, y: 20});
  assert.ok(enrage);
  assert.equal(enrage.type, 'boss');
  assert.equal(enrage.approach, false);

  const spawn = describeFeedback({type: 'boss_spawn', x: 10, y: 20});
  assert.ok(spawn);
  assert.equal(spawn.type, 'boss');
  assert.equal(spawn.approach, false);
});

test('describeFeedback copies execute only when the hit says execute === true', () => {
  const marked = describeFeedback({type: 'hit', damage: 10, execute: true, x: 1, y: 2});
  assert.ok(marked);
  assert.equal(marked.execute, true);
  assert.equal(marked.damage, 10);
  assert.equal(marked.approach, false);

  const plain = describeFeedback({type: 'hit', damage: 10, x: 1, y: 2});
  assert.ok(plain);
  assert.equal(plain.execute, false);
  assert.equal(plain.damage, 10);
  assert.equal(plain.approach, false);
});

function mockContext() {
  const marks = [];
  const ctx = {
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    fillRect(x, y, w, h) {
      marks.push({x, y, w, h, color: ctx.fillStyle, alpha: ctx.globalAlpha});
    },
  };
  return {ctx, marks};
}

function paint(events, options, dt) {
  const effects = createEffects();
  effects.ingest(events);
  if (dt) effects.update(dt);
  const {ctx, marks} = mockContext();
  effects.draw(ctx, options);
  return marks;
}

function stamp(marks) {
  return marks.map(mark => `${mark.color}:${mark.x},${mark.y},${mark.w},${mark.h}`);
}

test('an execute hit draws one short red tick above the number and an ordinary hit does not', () => {
  const hit = {type: 'hit', damage: 10, x: 80, y: 160};
  const plain = paint([hit], {});
  const marked = paint([{...hit, execute: true}], {});
  const tickColor = '#ff3a32';
  const ticks = marked.filter(mark => mark.color === tickColor);
  assert.equal(ticks.length, 1);
  assert.ok(ticks[0].w <= 3 && ticks[0].h <= 4, 'the execute mark is a short tick');
  const glyphs = marked.filter(mark => mark.color !== tickColor && mark.w >= 2 && mark.h >= 2 && mark.y > ticks[0].y);
  assert.ok(glyphs.length > 0, 'the damage number is still drawn');
  const glyphTop = Math.min(...glyphs.map(mark => mark.y));
  assert.ok(ticks[0].y + ticks[0].h <= glyphTop, 'the tick sits above the damage number');
  assert.equal(plain.some(mark => mark.color === tickColor), false);
  assert.deepEqual(
    stamp(marked.filter(mark => mark.color !== tickColor)),
    stamp(plain),
    'execute does not change the hit glyphs or particles',
  );
});

test('reduced motion keeps the execute tick in place and adds no separate animation', () => {
  const effects = createEffects();
  effects.ingest([{type: 'hit', damage: 10, execute: true, x: 80, y: 160}]);
  const first = mockContext();
  effects.draw(first.ctx, {reducedMotion: true});
  effects.update(0.25);
  const later = mockContext();
  effects.draw(later.ctx, {reducedMotion: true});
  const tick = (marks) => marks.filter(mark => mark.color === '#ff3a32').map(mark => [mark.x, mark.y, mark.w, mark.h]);
  const before = tick(first.marks);
  assert.equal(before.length, 1);
  assert.deepEqual(tick(later.marks), before);
});

test('a boss warning skips the field flash and a spawn or enrage still draws it', () => {
  const approach = paint([{type: 'boss_enter', warning: true, x: 10, y: 20}], {});
  assert.equal(approach.length, 0);
  const enrage = paint([{type: 'boss_enrage', x: 10, y: 20}], {});
  const spawn = paint([{type: 'boss_spawn', x: 10, y: 20}], {});
  assert.ok(enrage.length > 0);
  assert.ok(spawn.length > 0);
  assert.ok(enrage.some(mark => mark.color === '#e2a0ea'));
  assert.ok(spawn.some(mark => mark.color === '#e2a0ea'));
});

function installWebAudio() {
  const voices = [];

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

  class OscillatorNode extends AudioNode {
    constructor() {
      super();
      this.frequency = new AudioParam(440);
      this.type = 'sine';
      this.onended = null;
      this.dest = null;
    }
    connect(node) {
      this.dest = node;
      return this;
    }
    start(when = 0) {
      const gain = this.dest && this.dest.gain ? this.dest.gain.automation : [];
      const peaks = gain.filter(step => step[0] === 'exp').map(step => step[1]);
      const end = gain.length ? gain[gain.length - 1][2] : when;
      const sets = this.frequency.automation.filter(step => step[0] === 'set').map(step => step[1]);
      voices.push({
        kind: 'osc',
        type: this.type,
        when,
        freq: sets.length ? sets[0] : this.frequency.value,
        peak: peaks.length ? Math.max(...peaks) : 0,
        length: end - when,
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
    start() {
      const length = this.buffer && this.buffer.length || 0;
      voices.push({kind: this.loop || length > 1 ? 'noise' : 'silence', length});
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
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createGain() { return new GainNode(); }
    createOscillator() { return new OscillatorNode(); }
    createBufferSource() { return new BufferSourceNode(); }
    createBiquadFilter() { return new BiquadFilterNode(); }
    createDynamicsCompressor() { return new DynamicsCompressorNode(); }
    createBuffer(channels, length, sampleRate) {
      return new AudioBuffer(channels, length, sampleRate);
    }
  }

  const previous = {
    AudioContext: globalThis.AudioContext,
    webkitAudioContext: globalThis.webkitAudioContext,
  };
  globalThis.AudioContext = AudioContext;
  globalThis.webkitAudioContext = AudioContext;
  return {
    voices,
    restore() {
      if (previous.AudioContext === undefined) delete globalThis.AudioContext;
      else globalThis.AudioContext = previous.AudioContext;
      if (previous.webkitAudioContext === undefined) delete globalThis.webkitAudioContext;
      else globalThis.webkitAudioContext = previous.webkitAudioContext;
    },
  };
}

async function hear(events) {
  const rig = installWebAudio();
  try {
    const audio = createAudio();
    assert.equal(await audio.unlock(), true);
    audio.setEnabled(true);
    const text = JSON.stringify(events);
    audio.playEvents(events);
    assert.equal(JSON.stringify(events), text);
    audio.destroy();
    return rig.voices.slice();
  } finally {
    rig.restore();
  }
}

test('an approaching boss plays two short rising tones and a spawn or enrage keeps the rumble', async () => {
  const approach = await hear([{type: 'boss_enter', warning: true, x: 10, y: 20}]);
  const tones = approach.filter(voice => voice.kind === 'osc');
  assert.equal(approach.some(voice => voice.kind === 'noise'), false);
  assert.equal(tones.length, 2);
  assert.ok(Math.abs(tones[0].freq - 220) < 1);
  assert.ok(Math.abs(tones[1].freq - 330) < 1);
  assert.ok(tones[1].when > tones[0].when);
  for (const tone of tones) {
    assert.ok(tone.length < 0.12, `tone length ${tone.length}`);
    assert.ok(tone.peak <= 0.05, `tone gain ${tone.peak}`);
    assert.ok(tone.peak > 0);
  }

  for (const type of ['boss_enrage', 'boss_spawn']) {
    const rumble = await hear([{type, x: 10, y: 20}]);
    const osc = rumble.filter(voice => voice.kind === 'osc');
    assert.equal(rumble.some(voice => voice.kind === 'noise'), true, type);
    assert.ok(osc.some(voice => Math.abs(voice.freq - 110) < 1), type);
    assert.equal(osc.some(voice => Math.abs(voice.freq - 220) < 1), false, type);
  }
});
