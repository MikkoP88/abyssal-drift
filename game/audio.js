// ============================================================================
// audio.js — Fully procedural WebAudio. No sample files required.
// Layers: ocean wash, wind, boat engine, reel clicks, bite sting, splash,
// tension creak, catch fanfare. All synthesized from oscillators + filtered
// noise buffers.
// ============================================================================

import CONFIG from './config.js';
import { clamp, lerp } from './utils.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.layers = {};
    this.engineOsc = null;
    this.engineGain = null;
    this.reelTimer = 0;
  }

  // Must be called from a user gesture (browser autoplay policy).
  async init() {
    if (this.ready) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = CONFIG.audio.masterVolume;
      this.master.connect(this.ctx.destination);

      const noiseBuf = this._makeNoiseBuffer(2.0);

      // --- Ocean wash: brown-ish noise through a slow-LFO lowpass --------
      this.layers.ocean = this._noiseLayer(noiseBuf, {
        type: 'lowpass', freq: 420, q: 0.6, gain: CONFIG.audio.oceanNoiseGain,
      });
      const oceanLfo = this.ctx.createOscillator();
      oceanLfo.frequency.value = 0.13;
      const oceanLfoGain = this.ctx.createGain();
      oceanLfoGain.gain.value = 180;
      oceanLfo.connect(oceanLfoGain).connect(this.layers.ocean.filter.frequency);
      oceanLfo.start();

      // --- Wind: bandpassed noise, higher shelf --------------------------
      this.layers.wind = this._noiseLayer(noiseBuf, {
        type: 'bandpass', freq: 700, q: 0.4, gain: CONFIG.audio.windGain,
      });
      const windLfo = this.ctx.createOscillator();
      windLfo.frequency.value = 0.07;
      const windLfoGain = this.ctx.createGain();
      windLfoGain.gain.value = 300;
      windLfo.connect(windLfoGain).connect(this.layers.wind.filter.frequency);
      windLfo.start();

      // --- Engine: sawtooth through lowpass, pitch follows throttle -----
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engFilter = this.ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 300;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this._engineFilter = engFilter;

      this.ready = true;
    } catch (err) {
      console.warn('[audio] init failed:', err);
    }
  }

  _makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brownish integration
      data[i] = last * 3.5;
    }
    return buf;
  }

  _noiseLayer(buffer, { type, freq, q, gain }) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    return { src, filter, gain: g };
  }

  // Per-frame continuous updates.
  update(dt, { throttle, storm, tension, reeling }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;

    // Engine pitch + volume follow throttle.
    const targetFreq = lerp(55, 130, clamp(throttle, 0, 1));
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.1);
    const engVol = lerp(CONFIG.audio.engineGainBase, CONFIG.audio.engineGainFull, clamp(throttle, 0, 1));
    this.engineGain.gain.setTargetAtTime(engVol, t, 0.15);

    // Storm swells wind and ocean.
    const stormBoost = storm ? 1.8 : 1.0;
    this.layers.wind.gain.gain.setTargetAtTime(CONFIG.audio.windGain * stormBoost, t, 0.8);
    this.layers.ocean.gain.gain.setTargetAtTime(CONFIG.audio.oceanNoiseGain * (storm ? 1.3 : 1.0), t, 0.8);

    // Reel clicks while reeling under tension.
    if (reeling && tension > 0.15) {
      this.reelTimer -= dt;
      if (this.reelTimer <= 0) {
        this.reelTimer = 1 / CONFIG.fishing.reelClickHz;
        this._click(0.05 + tension * 0.05);
      }
    }

    // Tension creak: detuned low square pulse scaled by tension.
    if (tension > 0.6) {
      this._creak(tension);
    }
  }

  _click(vol) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  _creak(tension) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90 + tension * 40, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.001 + tension * 0.06, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  // One-shot SFX.
  splash(big = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    // Short burst of noise through a falling lowpass.
    const len = Math.floor(this.ctx.sampleRate * (big ? 1.2 : 0.5));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 1200 : 2400, t);
    f.frequency.exponentialRampToValueAtTime(200, t + (big ? 1.1 : 0.45));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(big ? 0.7 : 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.2 : 0.5));
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  bite() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [440, 660].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.25);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.3);
    });
  }

  catchFanfare(rarity) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = rarity > 0.5 ? [523, 659, 784, 1047] : [392, 494, 587];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.12 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.55);
    });
  }

  damage() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); // eslint-disable-line
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.ready = false;
  }
}

export default AudioManager;
