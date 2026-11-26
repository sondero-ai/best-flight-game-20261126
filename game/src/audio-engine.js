// Procedural cockpit audio. No samples: two engine oscillators, filtered noise wind, a stall
// reed, touchdown thump and short radio chimes, all built lazily after the first gesture.

import { clamp } from './math-utils.js';

export class AudioEngine {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.muted = false;
    this.nodes = {};
    this.lastFuelBeep = 0;
    this.lastStallBeep = 0;
  }

  init() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(context.destination);

      const engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 480;
      engineFilter.Q.value = 1.2;
      const engineA = context.createOscillator();
      engineA.type = 'sawtooth';
      engineA.frequency.value = 42;
      const engineB = context.createOscillator();
      engineB.type = 'square';
      engineB.frequency.value = 63;
      const engineBGain = context.createGain();
      engineBGain.gain.value = 0.28;
      engineA.connect(engineFilter);
      engineB.connect(engineBGain).connect(engineFilter);
      engineFilter.connect(engineGain).connect(this.master);
      engineA.start();
      engineB.start();

      const windGain = context.createGain();
      windGain.gain.value = 0;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.55;
      const windSource = context.createBufferSource();
      windSource.buffer = this.makeNoiseBuffer(2.4, 'wind');
      windSource.loop = true;
      windSource.connect(windFilter).connect(windGain).connect(this.master);
      windSource.start();

      const stallOsc = context.createOscillator();
      stallOsc.type = 'square';
      stallOsc.frequency.value = 620;
      const stallGain = context.createGain();
      stallGain.gain.value = 0;
      stallOsc.connect(stallGain).connect(this.master);
      stallOsc.start();

      this.nodes = { engineGain, engineFilter, engineA, engineB, windGain, windFilter, windSource, stallGain, stallOsc };
      this.enabled = true;
    } catch {
      this.context = null;
    }
  }

  makeNoiseBuffer(seconds, seedTag) {
    const context = this.context;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = seedTag === 'wind' ? 0xa17b : 0x5eed;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.context.currentTime, 0.05);
    }
  }

  update(state, dt) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const rpm = clamp(state.rpm ?? 0, 0, 3000);
    const throttle = clamp(state.throttle ?? 0, 0, 1);
    const airspeed = clamp(state.iasKts ?? 0, 0, 220);
    const engineLive = rpm > 40 ? 1 : 0;
    const { engineGain, engineFilter, engineA, engineB, windGain, windFilter, stallGain } = this.nodes;
    engineGain.gain.setTargetAtTime(engineLive * (0.022 + throttle * 0.055 + state.damage * 0.0002), now, 0.08);
    engineA.frequency.setTargetAtTime(32 + rpm * 0.038, now, 0.08);
    engineB.frequency.setTargetAtTime(49 + rpm * 0.056, now, 0.09);
    engineFilter.frequency.setTargetAtTime(280 + throttle * 700 + rpm * 0.12 + (state.damage ?? 0) * 5, now, 0.12);
    windGain.gain.setTargetAtTime(clamp((airspeed - 25) / 190, 0, 0.15), now, 0.18);
    windFilter.frequency.setTargetAtTime(360 + airspeed * 4.4, now, 0.2);
    const stall = state.stallWarning && !state.onGround ? 1 : 0;
    stallGain.gain.setTargetAtTime(stall * (0.014 + Math.max(0, Math.sin(now * 13)) * 0.009), now, 0.02);
    if (state.stalled && now - this.lastStallBeep > 0.32) {
      this.lastStallBeep = now;
      this.beep(760, 0.075, 0.024, 'square');
    }
    if (state.fuel < 12 && !state.crashed && now - this.lastFuelBeep > 2.4) {
      this.lastFuelBeep = now;
      this.beep(520, 0.08, 0.02, 'sine');
    }
    void dt;
  }

  beep(frequency, duration, volume, type = 'sine') {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  radio() {
    this.beep(880, 0.09, 0.03, 'sine');
    setTimeout(() => this.beep(1180, 0.12, 0.024, 'sine'), 95);
  }

  touchdown() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.makeNoiseBuffer(0.45, 'touch');
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.4);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    this.beep(52, 0.22, 0.08, 'sine');
  }

  success() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, index) => setTimeout(() => this.beep(note, 0.24, 0.045, 'sine'), index * 120));
  }

  failure() {
    const notes = [392, 329.63, 246.94];
    notes.forEach((note, index) => setTimeout(() => this.beep(note, 0.35, 0.045, 'triangle'), index * 160));
  }

  crash() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.makeNoiseBuffer(1.2, 'crash');
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }
}
