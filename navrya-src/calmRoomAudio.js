// The Calm Room's sound: a soft, synthesized human breath that follows the pacer, and the trader's
// own music through one Web Audio graph (so the music can be drawn around the circle).
//
// The breath is pink noise with the highs shelved away, two gentle low-passes and a warm body
// resonance. Inhale swells slowly and brightens a little; exhale starts full and settles in a long,
// slowing tail - quicker at first, slower at the end - darkening as it goes. Holds are silence.
// Nothing here starts sound on its own: the AudioContext is created on the first user gesture.

function makePinkNoise(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0; let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759; b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856; b4 = 0.55 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
  }
  for (let j = 0; j < length; j += 1) data[j] = data[j] / peak * 0.9;
  return buffer;
}

export class CalmAudio {
  constructor({ breathVolume = 0.6, musicVolume = 0.6, onMusic } = {}) {
    this.breathOn = false;
    this.breathVolume = breathVolume;
    this.musicVolume = musicVolume;
    this.voices = [];
    this.onMusic = onMusic || (() => {});
    this.ctx = null;
    this.audio = null;
    this.url = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.breathBus = ctx.createGain();
    this.breathBus.gain.value = this.breathOn ? this.breathVolume : 0;
    this.breathBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.86;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.musicBus.connect(this.analyser);
    this.analyser.connect(this.master);
    this.noise = makePinkNoise(ctx, 4);
    return ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
  }

  setBreathOn(on) {
    this.breathOn = !!on;
    if (!on) this.hush();
    if (!this.ctx) return;
    this.breathBus.gain.setTargetAtTime(on ? this.breathVolume : 0, this.ctx.currentTime, 0.08);
  }

  setBreathVolume(value) {
    this.breathVolume = value;
    if (this.ctx && this.breathOn) this.breathBus.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(value) {
    this.musicVolume = value;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  // Voice one phase. `seconds` is what is left of the phase (the whole phase at its start);
  // `partial` softens the onset when sound is switched on midway.
  breathe(kind, seconds, partial) {
    if (!this.breathOn || kind === 'full' || kind === 'empty') return;
    const ctx = this.ctx;
    if (!ctx || seconds < 0.5) return;
    const dur = seconds;
    const t0 = ctx.currentTime + 0.03;
    const inhale = kind !== 'out';
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2200; shelf.gain.value = -12;
    const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.Q.value = 0.5;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.Q.value = 0.4;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.Q.value = 0.8; body.gain.value = 4; body.frequency.value = inhale ? 1050 : 620;
    const env = ctx.createGain(); env.gain.value = 0;
    src.connect(shelf); shelf.connect(lp1); lp1.connect(lp2); lp2.connect(body); body.connect(env); env.connect(this.breathBus);
    const gain = env.gain;
    gain.setValueAtTime(0, t0);
    if (inhale) {
      const top = kind === 'top';
      const f0 = top ? 1150 : 820; const f1 = top ? 1450 : 1350;
      lp1.frequency.setValueAtTime(f0, t0); lp1.frequency.linearRampToValueAtTime(f1, t0 + dur);
      lp2.frequency.setValueAtTime(f0 * 1.2, t0); lp2.frequency.linearRampToValueAtTime(f1 * 1.2, t0 + dur);
      const peak = top ? 0.7 : 0.95;
      const a1 = dur * 0.3; const a2 = dur * 0.72; const a3 = Math.max(a2, dur - Math.min(0.4, dur * 0.2));
      gain.linearRampToValueAtTime(peak * 0.35, t0 + a1);
      gain.linearRampToValueAtTime(peak * 0.75, t0 + a2);
      gain.linearRampToValueAtTime(peak * 0.85, t0 + a3);
      gain.linearRampToValueAtTime(0, t0 + dur);
    } else {
      lp1.frequency.setValueAtTime(1250, t0); lp1.frequency.exponentialRampToValueAtTime(520, t0 + dur);
      lp2.frequency.setValueAtTime(1500, t0); lp2.frequency.exponentialRampToValueAtTime(640, t0 + dur);
      const peak = 1.15 * (partial ? 0.65 : 1);
      const attack = Math.min(0.35, dur * 0.12);
      gain.linearRampToValueAtTime(peak, t0 + attack);
      [[0.2, 0.72], [0.4, 0.46], [0.6, 0.27], [0.8, 0.12]].forEach(([at, level]) => {
        gain.linearRampToValueAtTime(peak * level, t0 + Math.max(attack + 0.01, dur * at));
      });
      gain.linearRampToValueAtTime(0, t0 + dur);
    }
    src.start(t0, Math.random() * 3);
    src.stop(t0 + dur + 0.1);
    const voice = { src, env };
    this.voices.push(voice);
    src.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      try { env.disconnect(); } catch (_) { /* already gone */ }
    };
  }

  hush() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.voices.slice().forEach(({ src, env }) => {
      try {
        env.gain.cancelScheduledValues(ctx.currentTime);
        env.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
        src.stop(ctx.currentTime + 0.6);
      } catch (_) { /* already stopped */ }
    });
  }

  // ---- music ---------------------------------------------------------------

  element() {
    if (this.audio) return this.audio;
    const ctx = this.ensure();
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', () => this.onMusic({ type: 'duration', value: audio.duration || 0 }));
    audio.addEventListener('ended', () => this.onMusic({ type: 'ended' }));
    audio.addEventListener('pause', () => this.onMusic({ type: 'paused' }));
    audio.addEventListener('play', () => this.onMusic({ type: 'playing' }));
    if (ctx) {
      try { ctx.createMediaElementSource(audio).connect(this.musicBus); } catch (_) { audio.volume = this.musicVolume; }
    } else audio.volume = this.musicVolume;
    this.audio = audio;
    return audio;
  }

  load(blob, autoplay) {
    const audio = this.element();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = blob ? URL.createObjectURL(blob) : null;
    if (this.url) audio.src = this.url; else { audio.removeAttribute('src'); audio.load(); }
    if (autoplay && this.url) return this.play();
    return Promise.resolve(false);
  }

  hasTrack() { return !!(this.audio && this.url); }

  play() {
    this.resume();
    const audio = this.element();
    const result = audio.play();
    return result && result.then ? result.then(() => true).catch(() => false) : Promise.resolve(true);
  }

  pause() { if (this.audio) this.audio.pause(); }

  seek(seconds) { if (this.audio && Number.isFinite(seconds)) this.audio.currentTime = seconds; }

  position() { return this.audio ? this.audio.currentTime || 0 : 0; }

  // `count` bars around the circle, mirrored so the ring is symmetric, each 0..1.
  spectrum(count) {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freq);
    const out = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const k = i < count / 2 ? i : count - 1 - i;
      const v = this.freq[1 + Math.floor(k * 1.1)] / 255;
      out[i] = Math.min(1, v * v * 1.2);
    }
    return out;
  }

  dispose() {
    this.hush();
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (this.ctx) { try { this.ctx.close(); } catch (_) { /* closing */ } }
    this.ctx = null;
    this.audio = null;
  }
}
