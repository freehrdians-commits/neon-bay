// Every sound is synthesized with WebAudio: no audio files, no network. The engine is a
// quiet sawtooth whose pitch follows the car's speed, the siren is a two-tone wail, and the
// one-shots are short envelopes of oscillators or filtered noise. Audio starts on the first
// user gesture (browsers block it before then) and can be muted with M.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      // The engine hum: a sawtooth through a low-pass, pitched by speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // The siren: a triangle that wails between two tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  /** Call on any user gesture; resumes the context browsers suspended. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone({ type = 'sine', from = 440, to = null, duration = 0.15, volume = 0.2, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noise({ duration = 0.2, volume = 0.25, filterFreq = 1200, type = 'lowpass', when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  let sirenPhase = 0;
  let sirenTimer = 0;

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Per-frame: engine pitch from speed, siren wail while wanted. Call every frame. */
    update(dt, { speed = 0, driving = false, wanted = 0 }) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (engineGain) {
        engineGain.gain.value = driving ? 0.05 + Math.min(0.09, Math.abs(speed) / 340 * 0.09) : 0;
        if (engineOsc) engineOsc.frequency.value = 46 + Math.abs(speed) * 0.16;
      }
      const wantSiren = wanted > 0;
      if (wantSiren !== sirenOn) {
        sirenOn = wantSiren;
        sirenPhase = 0;
        sirenTimer = 0;
      }
      if (sirenGain) {
        if (!sirenOn) {
          sirenGain.gain.value = 0;
        } else {
          sirenTimer += dt;
          if (sirenTimer > 0.42) {
            sirenTimer = 0;
            sirenPhase = 1 - sirenPhase;
            if (sirenOsc) sirenOsc.frequency.value = sirenPhase === 0 ? 720 : 960;
          }
          sirenGain.gain.value = 0.045;
        }
      }
    },
    shot() {
      noise({ duration: 0.12, volume: 0.3, filterFreq: 2600, type: 'highpass' });
    },
    enemyShot() {
      noise({ duration: 0.1, volume: 0.16, filterFreq: 1800, type: 'highpass' });
    },
    tag() {
      tone({ type: 'sine', from: 880, duration: 0.12, volume: 0.22 });
      tone({ type: 'sine', from: 1318, duration: 0.2, volume: 0.22, when: 0.1 });
    },
    alarm() {
      tone({ type: 'square', from: 620, to: 420, duration: 0.28, volume: 0.16 });
      tone({ type: 'square', from: 620, to: 420, duration: 0.28, volume: 0.16, when: 0.3 });
    },
    skid() {
      noise({ duration: 0.25, volume: 0.12, filterFreq: 900 });
    },
    nitro() {
      noise({ duration: 0.5, volume: 0.2, filterFreq: 3000, type: 'bandpass' });
    },
    pickup() {
      tone({ type: 'sine', from: 660, to: 990, duration: 0.14, volume: 0.2 });
    },
    mission() {
      tone({ type: 'triangle', from: 523, duration: 0.14, volume: 0.22 });
      tone({ type: 'triangle', from: 659, duration: 0.14, volume: 0.22, when: 0.12 });
      tone({ type: 'triangle', from: 784, duration: 0.24, volume: 0.22, when: 0.24 });
    },
    cash() {
      tone({ type: 'sine', from: 988, duration: 0.1, volume: 0.18 });
      tone({ type: 'sine', from: 1319, duration: 0.16, volume: 0.18, when: 0.08 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 220, to: 110, duration: 0.2, volume: 0.2 });
    },
  };
}
