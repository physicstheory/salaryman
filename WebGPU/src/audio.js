// Sound. There are no recordings in the game: every sound is synthesised in an AudioWorklet. The music is a small synth band (chord loop,
// bass, pad, lead and a drummer per genre) used by the phone's Music app and the car radio; the engine is a tone from the firing frequency.
// The context starts on the first key or click (browsers and Electron insist on that).
import { Settings } from './settings.js';

const WORKLET = `
const PROGS = [[0,5,7,3],[0,3,5,7],[2,7,0,5],[0,5,10,3],[0,7,5,0],[0,0,5,5],[0,8,3,10],[0,7,9,5],[9,5,0,7],[0,3,5,3],[0,5,7,5]];
const SCALES = [[0,2,4,7,9],[0,3,5,7,10],[0,2,4,7,9],[0,3,5,6,7],[0,1,5,7,8],[0,2,4,7,9],[0,3,5,7,10],[0,2,4,7,9],[0,2,4,7,9],[0,3,5,7,10],[0,2,4,7,9]];
const THIRD = [4,3,4,3,3,4,3,4,4,3,4];
const DRUMS = [0,0,0,0,0,0,1,1,1,1,1];
const SWING = [0,0,0,0,0,0,0,0,0,0.2,0];
class Band extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.style = 0; this.bpm = 100; this.key = 0; this.rot = 0; this.t = 0;
    this.ph = [0,0,0,0,0]; this.lp = 0;
    this.port.onmessage = (e) => { const m = e.data; if (m.type === 'play') { this.on = true; this.style = m.style; this.bpm = Math.max(50, m.bpm); this.t = 0; this.key = [0,2,-3,5,-1,3][Math.abs(m.seed) % 6]; this.rot = Math.abs(Math.floor(m.seed / 6)) % 4; } else if (m.type === 'stop') this.on = false; };
  }
  hz(semi) { return 110 * Math.pow(2, (semi + this.key) / 12); }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.on) { out.fill(0); return true; }
    const beat = 60 / this.bpm, st = this.style, prog = PROGS[st], scale = SCALES[st], third = THIRD[st], drums = DRUMS[st];
    const gfunk = st === 9, country = st === 10, synth80 = st === 6, MIX = sampleRate, TAU = Math.PI * 2;
    for (let i = 0; i < out.length; i++) {
      const bar = (Math.floor(this.t / (beat * 4)) + this.rot) % 4, root = prog[bar];
      const step = this.t / (beat * 0.5), sub = Math.floor(step) % 8, bt = (this.t % beat) / beat;
      let s = 0, broot = root - 12;
      if (country && Math.floor(this.t / beat) % 2 === 1) broot += 7; else if (drums && !gfunk && Math.floor(step) % 2 === 1) broot += 12;
      this.ph[0] = (this.ph[0] + this.hz(broot) / MIX) % 1;
      s += (Math.sin(this.ph[0] * TAU) + 0.3 * Math.sin(this.ph[0] * TAU * 2)) * 0.28 * Math.exp(-(drums ? 5 : 3) * bt);
      let gate = 1; if (synth80) gate = 0.55 + 0.45 * (Math.floor(step) % 2 === 0 ? 1 : 0);
      const offs = [0, third, 7];
      for (let k = 0; k < 3; k++) { this.ph[1 + k] = (this.ph[1 + k] + this.hz(root + offs[k]) / MIX) % 1; s += (this.ph[1 + k] * 2 - 1) * 0.045 * (0.6 + 0.4 * Math.sin(this.t * 0.7)) * gate; }
      if (st !== 5 && (sub % 2 === 1 || st === 3 || drums)) {
        let note = root + 12 + scale[(Math.floor(step * 1.7) + bar) % scale.length];
        if (gfunk) note += 12 + Math.sin(this.t * 5.5) * 0.35;
        this.ph[4] = (this.ph[4] + this.hz(note) / MIX) % 1;
        const env = Math.exp(-(country ? 9 : 5) * (step % 1));
        let wave = Math.sin(this.ph[4] * TAU); if (synth80 || country) wave = wave * 0.5 + (this.ph[4] * 2 - 1) * 0.5;
        s += wave * (gfunk ? 0.1 : 0.16) * env;
      }
      if (drums) {
        const bi = Math.floor(this.t / beat) % 4;
        if (bi === 0 || bi === 2) { const kf = 90 * Math.exp(-bt * 9) + 42; s += Math.sin(this.t * TAU * kf) * 0.34 * Math.exp(-bt * 6); }
        this.lp += (Math.random() * 2 - 1 - this.lp) * 0.45;
        if (bi === 1 || bi === 3) s += (Math.random() * 2 - 1) * 0.17 * Math.exp(-bt * 10);
        const hp = (step + SWING[st] * (Math.floor(step) % 2)) % 1;
        s += (Math.random() * 2 - 1 - this.lp) * 0.07 * Math.exp(-hp * 14);
      }
      out[i] = s;
      this.t += 1 / MIX;
    }
    return true;
  }
}
registerProcessor('band', Band);
class Engine extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.rpm = 900; this.thr = 0.15; this.ph = 0; this.port.onmessage = (e) => { const m = e.data; if (m.type === 'set') { this.on = true; this.rpm = m.rpm; this.thr = m.thr; } else if (m.type === 'stop') this.on = false; }; }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.on) { out.fill(0); return true; }
    const f0 = this.rpm / 60 * 0.5, load = Math.min(1, Math.max(0.15, this.thr)), TAU = Math.PI * 2;
    for (let i = 0; i < out.length; i++) {
      this.ph += f0 / sampleRate; if (this.ph > 1) this.ph -= 1;
      let s = (this.ph * 2 - 1) * 0.5 + Math.sin(this.ph * TAU * 2) * 0.25 + Math.sin(this.ph * TAU * 0.5) * 0.15;
      out[i] = Math.max(-0.8, Math.min(0.8, s * (0.3 + 0.4 * load)));
    }
    return true;
  }
}
registerProcessor('engine', Engine);
`;

class AudioSystem {
  constructor() { this.ctx = null; this.ready = false; this.master = null; this.band = null; this.engine = null; this.bandGain = null; this.engineGain = null; this.pending = []; }

  /** Call from any user gesture. */
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      this.master = this.ctx.createGain();
      this.master.gain.value = Settings.v.volume;
      this.master.connect(this.ctx.destination);
      this.band = new AudioWorkletNode(this.ctx, 'band');
      this.bandGain = this.ctx.createGain(); this.bandGain.gain.value = 0.32;
      this.band.connect(this.bandGain).connect(this.master);
      this.engine = new AudioWorkletNode(this.ctx, 'engine');
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.4;
      this.engine.connect(this.engineGain).connect(this.master);
      this.ready = true;
      for (const f of this.pending) f();
      this.pending = [];
    } catch (e) { console.warn('audio unavailable:', e); }
  }

  whenReady(f) { if (this.ready) f(); else this.pending.push(f); }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  playBand(style, bpm, seed = 0) { this.whenReady(() => this.band.port.postMessage({ type: 'play', style, bpm, seed })); this.bandOn = true; this.bandStyle = style; }
  stopBand() { if (this.ready) this.band.port.postMessage({ type: 'stop' }); this.bandOn = false; this.bandStyle = -1; }
  engineSet(rpm, thr) { if (this.ready) this.engine.port.postMessage({ type: 'set', rpm, thr }); }
  engineStop() { if (this.ready) this.engine.port.postMessage({ type: 'stop' }); }
}

export const Audio_ = new AudioSystem();
for (const ev of ['keydown', 'mousedown', 'pointerdown']) window.addEventListener(ev, () => Audio_.unlock(), { once: false, passive: true });
