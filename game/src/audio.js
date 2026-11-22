// Synthesised sound: every effect is an oscillator or a noise buffer made in code, so
// the game loads no audio file at all. Audio starts only after a user gesture (the
// browser's rule) and stays silent until then; M mutes it.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineGain);
      engineOsc.start();
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      engineOsc2.connect(g2);
      g2.connect(engineGain);
      engineOsc2.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(ctx.destination);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  /** A short tone: frequency in Hz, seconds long, 'sine'|'square'|'triangle', gain 0..1. */
  function tone(freq, seconds, type, gainValue, when = 0) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  /** A burst of filtered noise, for punches, crashes and skids. */
  function noise(seconds, gainValue, lowFreq) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(t0);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows the car's speed; silent on foot or at rest. */
    engine(speedRatio, driving) {
      if (!ctx || muted || !engineGain) return;
      const target = driving ? 0.045 + 0.05 * speedRatio : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 52 + 130 * speedRatio;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
    },
    /** The two-tone siren while police are close; quiet otherwise. */
    siren(on, dt) {
      if (!ctx || !sirenGain) return;
      if (!on || muted) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      sirenPhase += dt;
      const high = Math.floor(sirenPhase * 2) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
    },
    pickup() {
      tone(880, 0.12, 'sine', 0.18);
      tone(1320, 0.14, 'sine', 0.14, 0.07);
    },
    tag() {
      tone(1174, 0.1, 'triangle', 0.16);
      tone(1568, 0.16, 'triangle', 0.14, 0.08);
    },
    mission() {
      tone(523, 0.14, 'triangle', 0.18);
      tone(659, 0.14, 'triangle', 0.18, 0.12);
      tone(784, 0.22, 'triangle', 0.2, 0.24);
    },
    punch() {
      noise(0.09, 0.25, 900);
    },
    crash() {
      noise(0.22, 0.3, 420);
      tone(90, 0.18, 'sine', 0.22);
    },
    bust() {
      tone(392, 0.16, 'square', 0.12);
      tone(311, 0.16, 'square', 0.12, 0.15);
      tone(233, 0.3, 'square', 0.12, 0.3);
    },
    steal() {
      tone(220, 0.1, 'square', 0.12);
      tone(440, 0.12, 'square', 0.12, 0.09);
      tone(660, 0.14, 'square', 0.1, 0.18);
    },
    denied() {
      tone(160, 0.14, 'square', 0.12);
    },
  };
}
