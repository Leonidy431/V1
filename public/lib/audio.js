/**
 * Мягкий низкий звук соприкосновения кисти с холстом (синтез, без сэмплов).
 */
(function (global) {
  'use strict';

  class BrushAudio {
    constructor() {
      this.ctx = null;
    }

    _ensureContext() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    }

    playStroke() {
      const ctx = this._ensureContext();
      if (!ctx) return;

      const duration = 0.4;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start();
      noise.stop(ctx.currentTime + duration);
    }
  }

  global.BrushAudio = BrushAudio;
})(typeof window !== 'undefined' ? window : globalThis);
