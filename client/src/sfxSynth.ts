// Sound effects the browser makes itself, for every moment without a recording (bows, spells, fanfares) and for servers
// that did not download the packs. Plain oscillators and filtered noise; no samples, so there is nothing to license.
import type { SfxEvent } from '../../shared/sfx';

type Wave = OscillatorType;

class Kit {
  constructor(private ctx: BaseAudioContext, private out: AudioNode, private t0: number) {}

  private env(vol: number, at: number, attack: number, dur: number) {
    const g = this.ctx.createGain();
    const s = this.t0 + at;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(vol, s + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    g.connect(this.out);
    return g;
  }

  /** A pitched tone that slides from `f0` to `f1`. */
  tone(f0: number, f1: number, dur: number, vol: number, type: Wave = 'sine', at = 0, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    const s = this.t0 + at;
    o.frequency.setValueAtTime(f0, s);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
    o.connect(this.env(vol, at, attack, dur));
    o.start(s);
    o.stop(s + dur + 0.05);
  }

  /** Filtered noise whose filter slides from `f0` to `f1`. */
  noise(dur: number, vol: number, kind: BiquadFilterType, f0: number, f1: number, at = 0, q = 1, attack = 0.005) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = kind;
    f.Q.value = q;
    const s = this.t0 + at;
    f.frequency.setValueAtTime(f0, s);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
    src.connect(f).connect(this.env(vol, at, attack, dur));
    src.start(s);
  }

  thud(vol = 0.5, at = 0, pitch = 120) { this.tone(pitch, pitch * 0.4, 0.22, vol, 'sine', at); this.noise(0.08, vol * 0.4, 'lowpass', 900, 200, at); }
  arpeggio(notes: number[], step: number, dur: number, vol: number, type: Wave = 'triangle') {
    notes.forEach((n, i) => this.tone(n, n, dur, vol, type, i * step, 0.01));
  }
}

const jitter = (v: number, pct = 0.08) => v * (1 + (Math.random() * 2 - 1) * pct);

/** Play one built-in sound at the context's current time. */
export function synth(ctx: BaseAudioContext, out: AudioNode, event: SfxEvent) {
  const k = new Kit(ctx, out, ctx.currentTime + 0.01);
  switch (event) {
    case 'hit_slash': k.noise(0.2, 0.5, 'highpass', 4200, 900, 0, 0.8); k.thud(0.35, 0.02, jitter(150)); break;
    case 'hit_pierce': k.noise(0.07, 0.5, 'bandpass', 2200, 1600, 0, 3); k.thud(0.4, 0.01, jitter(130)); break;
    case 'hit_blunt': k.thud(0.7, 0, jitter(95)); k.noise(0.12, 0.3, 'lowpass', 1200, 200); break;
    case 'hit_crit':
      k.noise(0.22, 0.55, 'highpass', 5000, 800); k.thud(0.8, 0, 85);
      k.tone(1250, 1250, 0.5, 0.12, 'sine', 0.03); k.tone(1880, 1880, 0.4, 0.08, 'sine', 0.03);
      break;
    case 'miss': k.noise(0.28, 0.22, 'bandpass', 500, 1800, 0, 1.2, 0.08); break;
    case 'shot': k.tone(jitter(260), 120, 0.22, 0.3, 'triangle'); k.tone(520, 240, 0.12, 0.12, 'sawtooth'); k.noise(0.25, 0.25, 'bandpass', 3000, 900, 0.02, 1.5); break;
    case 'shot_hit': k.tone(jitter(260), 120, 0.22, 0.3, 'triangle'); k.noise(0.2, 0.22, 'bandpass', 3000, 900, 0.02, 1.5); k.thud(0.55, 0.2, 140); break;
    case 'spell_fire': k.noise(0.6, 0.45, 'lowpass', 500, 3200, 0, 0.7, 0.12); k.tone(110, 60, 0.5, 0.25, 'sawtooth'); for (let i = 0; i < 5; i++) k.noise(0.03, 0.3, 'highpass', 3000, 3000, 0.1 + i * 0.08 + Math.random() * 0.04); break;
    case 'spell_frost': [2093, 3136, 4186].forEach((f, i) => k.tone(f * 0.7, f, 0.7, 0.1, 'sine', i * 0.05, 0.04)); k.noise(0.5, 0.12, 'highpass', 6000, 9000, 0, 0.6, 0.1); break;
    case 'spell_shock': for (let i = 0; i < 4; i++) { k.noise(0.06, 0.45, 'highpass', 2500, 5000, i * 0.06); k.tone(jitter(90), 70, 0.05, 0.2, 'square', i * 0.06); } k.thud(0.4, 0.26, 70); break;
    case 'spell_shadow': k.tone(110, 48, 0.9, 0.35, 'sawtooth', 0, 0.2); k.noise(0.8, 0.2, 'lowpass', 400, 120, 0, 0.8, 0.2); k.tone(55, 44, 0.9, 0.3, 'sine'); break;
    case 'spell_holy': [523, 659, 784].forEach((f, i) => k.tone(f, f, 0.9, 0.14, 'sine', i * 0.04, 0.15)); k.tone(1568, 1568, 0.7, 0.05, 'sine', 0.2, 0.1); break;
    case 'spell_arcane': k.tone(250, 1100, 0.35, 0.22, 'sine'); k.tone(375, 1650, 0.35, 0.1, 'triangle'); k.noise(0.3, 0.1, 'highpass', 4000, 8000, 0.05, 0.8, 0.1); break;
    case 'spell_nature': k.noise(0.5, 0.3, 'lowpass', 300, 1400, 0, 4, 0.1); k.tone(180, 380, 0.4, 0.16, 'sine'); k.tone(300, 520, 0.3, 0.08, 'triangle', 0.1); break;
    case 'hurt': k.tone(jitter(210), 90, 0.2, 0.35, 'sawtooth'); k.thud(0.4, 0, 100); break;
    case 'heal': k.arpeggio([523, 659, 784, 1047], 0.09, 0.45, 0.14, 'sine'); k.noise(0.4, 0.05, 'highpass', 7000, 9000, 0.2, 0.5, 0.1); break;
    case 'monster_death': k.tone(220, 40, 0.55, 0.35, 'sawtooth'); k.noise(0.4, 0.25, 'lowpass', 1500, 100); k.thud(0.55, 0.1, 80); break;
    case 'hero_down': k.tone(160, 38, 0.9, 0.4, 'sine'); k.tone(196, 185, 1, 0.12, 'triangle', 0.1, 0.1); k.noise(0.5, 0.15, 'lowpass', 700, 100); break;
    case 'footstep': k.noise(0.07, 0.35, 'lowpass', jitter(1400, 0.2), 300); k.tone(jitter(90), 60, 0.06, 0.2); break;
    case 'combat_start':
      k.tone(130, 130, 0.9, 0.22, 'sawtooth', 0, 0.12); k.tone(196, 196, 0.9, 0.16, 'sawtooth', 0, 0.12); k.thud(0.7, 0.05, 70); k.thud(0.7, 0.35, 70);
      break;
    case 'victory': {
      const n = [523, 659, 784, 1047];
      [0, 0.15, 0.3].forEach((t, i) => k.tone(n[i], n[i], 0.25, 0.2, 'square', t));
      k.tone(1047, 1047, 1.1, 0.2, 'square', 0.45, 0.02); k.tone(784, 784, 1.1, 0.14, 'triangle', 0.45); k.tone(523, 523, 1.1, 0.14, 'triangle', 0.45);
      break;
    }
    case 'defeat': [392, 370, 330, 262].forEach((f, i) => k.tone(f, f * 0.98, 0.7, 0.2, 'triangle', i * 0.4, 0.04)); break;
    case 'level_up': k.arpeggio([523, 659, 784, 1047, 1319], 0.1, 0.6, 0.15, 'triangle'); k.tone(1568, 1568, 0.9, 0.08, 'sine', 0.5); break;
    case 'coins': for (let i = 0; i < 4; i++) { const f = jitter(2600, 0.25); k.tone(f, f * 0.98, 0.25, 0.12, 'sine', i * 0.07 + Math.random() * 0.03, 0.002); k.tone(f * 1.5, f * 1.5, 0.15, 0.05, 'sine', i * 0.07, 0.002); } break;
    case 'click': k.tone(jitter(1300, 0.05), 900, 0.04, 0.12, 'sine'); break;
    case 'turn': k.tone(784, 784, 0.3, 0.12, 'sine'); k.tone(1047, 1047, 0.4, 0.1, 'sine', 0.12); break;
  }
}
