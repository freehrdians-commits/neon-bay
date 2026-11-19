// All sound in Neon Bay is synthesized with WebAudio: no audio files are
// shipped, so the game loads nothing over the network. Every call is guarded,
// so a browser without audio never breaks the game.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.sirenTimer = 0;
    this.enabled = true;
  }

  // Must be called from a user gesture (key or click) at least once.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // Audio is decoration; never let it stop the game.
    }
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  blip(freq, dur, type, vol) {
    try {
      if (!this.ctx || !this.enabled) return;
      const t = this.now();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol || 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  noiseBurst(dur, vol, lowFreq) {
    try {
      if (!this.ctx || !this.enabled) return;
      const t = this.now();
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq || 1800;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  gunshot() {
    this.noiseBurst(0.14, 0.7, 2400);
  }

  punch() {
    this.blip(110, 0.12, 'sine', 0.8);
    this.noiseBurst(0.06, 0.3, 700);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.5);
    setTimeout(() => this.blip(880, 0.12, 'sine', 0.5), 70);
  }

  cash() {
    this.blip(990, 0.08, 'triangle', 0.5);
    setTimeout(() => this.blip(1320, 0.14, 'triangle', 0.5), 80);
  }

  jingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.55), i * 110));
  }

  busted() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.4), i * 160));
  }

  // Continuous engine hum: pitch follows the driven car's speed.
  setEngine(speedRatio, inCar) {
    try {
      if (!this.ctx || !this.enabled) return;
      if (!inCar || speedRatio <= 0.02) {
        if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.now(), 0.1);
        return;
      }
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, this.now(), 0.08);
      this.engineGain.gain.setTargetAtTime(0.10 + speedRatio * 0.10, this.now(), 0.1);
    } catch { /* ignore */ }
  }

  // Two-tone police siren while any police car is near.
  setSiren(active, dt) {
    try {
      if (!this.ctx || !this.enabled) return;
      if (!active) {
        if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.now(), 0.15);
        return;
      }
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'square';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenPhase = 1 - this.sirenPhase;
        this.sirenOsc.frequency.setValueAtTime(this.sirenPhase ? 920 : 700, this.now());
      }
      this.sirenGain.gain.setTargetAtTime(0.045, this.now(), 0.1);
    } catch { /* ignore */ }
  }
}
