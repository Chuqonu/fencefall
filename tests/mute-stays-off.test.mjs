import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../src/audio.js';

// createAudio reads globalThis.AudioContext. A stand-in graph records scheduled
// voices so mute and cue identity can be checked without a browser or samples.
function installWebAudio() {
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

  class OscillatorNode extends AudioNode {
    constructor() {
      super();
      this.frequency = new AudioParam(440);
      this.type = 'sine';
      this.onended = null;
    }
    start(when = 0) {
      voices.push({
        kind: 'osc',
        type: this.type,
        when,
        freqs: this.frequency.automation.map(step => [step[0], step[1]]),
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
      const length = this.buffer && this.buffer.length || 0;
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
    contexts,
    restore() {
      if (previous.AudioContext === undefined) delete globalThis.AudioContext;
      else globalThis.AudioContext = previous.AudioContext;
      if (previous.webkitAudioContext === undefined) delete globalThis.webkitAudioContext;
      else globalThis.webkitAudioContext = previous.webkitAudioContext;
    },
  };
}

function resultCues() {
  return [
    {type: 'victory', time: 12.5, wave: 10, kills: 40},
    {type: 'defeat', time: 9.25, wave: 6, kills: 18},
    {type: 'fence_hit', time: 4, damage: 24, x: 180, y: 450},
  ];
}

function cueVoices(voices) {
  return voices.filter(voice => voice.kind === 'osc' || voice.kind === 'noise');
}

function contour(voices) {
  return cueVoices(voices).map(voice => {
    if (voice.kind === 'noise') return `noise:${voice.length}`;
    const sets = voice.freqs.filter(step => step[0] === 'set').map(step => step[1]);
    return `${voice.type}:${sets.join(',')}`;
  });
}

function hasTone(shape) {
  return shape.some(item => /^(sine|square|triangle|sawtooth):/.test(item));
}

function settledMaster(context) {
  const master = context && context.gains[0];
  assert.ok(master, 'missing master gain');
  const automation = master.gain.automation;
  if (!automation.length) return master.gain.value;
  return automation[automation.length - 1][1];
}

test('mute keeps victory, defeat, and fence-hit silent, and those results stay distinct', async () => {
  const rig = installWebAudio();
  try {
    const locked = createAudio();
    const beforeGesture = resultCues();
    const beforeText = JSON.stringify(beforeGesture);
    locked.playEvents(beforeGesture);
    locked.setEnabled(false);
    locked.playEvents(beforeGesture);
    assert.equal(JSON.stringify(beforeGesture), beforeText);
    assert.equal(rig.contexts.length, 0);
    assert.deepEqual(cueVoices(rig.voices), []);
    locked.destroy();

    const muted = createAudio();
    assert.equal(await muted.unlock(), true);
    const softened = {reducedMotion: true, events: resultCues()};
    const mark = rig.voices.length;
    muted.playEvents(resultCues());
    muted.playEvents(softened);
    muted.setEnabled(false);
    muted.playEvents(resultCues());
    assert.deepEqual(cueVoices(rig.voices.slice(mark)), []);
    assert.equal(settledMaster(rig.contexts.at(-1)), 0);
    muted.destroy();

    const armed = createAudio({settings: {reducedMotion: true}});
    assert.equal(await armed.unlock(), true);
    armed.setEnabled(true);
    assert.ok(settledMaster(rig.contexts.at(-1)) > 0);
    armed.setEnabled(false);
    const afterMute = rig.voices.length;
    armed.playEvents(resultCues());
    armed.playEvents(softened);
    assert.deepEqual(cueVoices(rig.voices.slice(afterMute)), [], 'scheduling while sound is off produced a tone');
    assert.equal(settledMaster(rig.contexts.at(-1)), 0);
    armed.destroy();

    async function hear(type) {
      const audio = createAudio();
      assert.equal(await audio.unlock(), true);
      audio.setEnabled(true);
      const start = rig.voices.length;
      const events = [{type, time: 2, damage: 24, x: 180, y: 450}];
      const text = JSON.stringify(events);
      audio.playEvents(events);
      assert.equal(JSON.stringify(events), text);
      const heard = {
        contour: contour(rig.voices.slice(start)),
        master: settledMaster(rig.contexts.at(-1)),
      };
      audio.destroy();
      return heard;
    }

    const victory = await hear('victory');
    const defeat = await hear('defeat');
    const fence = await hear('fence_hit');
    assert.ok(victory.master > 0 && defeat.master > 0 && fence.master > 0);
    assert.ok(hasTone(victory.contour), `victory scheduled no tone while sound was on: ${victory.contour}`);
    assert.ok(hasTone(defeat.contour), `defeat scheduled no tone while sound was on: ${defeat.contour}`);
    assert.ok(hasTone(fence.contour), `fence-hit scheduled no tone while sound was on: ${fence.contour}`);
    assert.notDeepEqual(victory.contour, defeat.contour, `victory [${victory.contour}] and defeat [${defeat.contour}] are the same cue`);
  } finally {
    rig.restore();
  }
});
