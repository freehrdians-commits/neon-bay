// Tiny synthesised sound effects: no audio files, everything is an
// oscillator through WebAudio, created lazily on the first user gesture so
// headless runs and browsers that block autoplay never break the game.

export function createAudio() {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!enabled) return;
    const ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      g.gain.setValueAtTime(gain || 0.05, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch {
      enabled = false;
    }
  }

  return {
    /** Call from a user gesture so the context is allowed to start. */
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    },
    blip() { tone(660, 0.09, 'square', 0.04, 990); },
    coin() { tone(880, 0.12, 'sine', 0.05, 1320); },
    crash() { tone(90, 0.25, 'sawtooth', 0.07, 45); },
    siren() { tone(720, 0.5, 'sine', 0.03, 1080); },
    fanfare() {
      tone(523, 0.14, 'square', 0.05);
      setTimeout(() => tone(659, 0.14, 'square', 0.05), 130);
      setTimeout(() => tone(784, 0.3, 'square', 0.05), 260);
    },
    setEnabled(v) { enabled = !!v; },
  };
}
