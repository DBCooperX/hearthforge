// Interface sounds, made in the browser with the Web Audio API so nothing has to be downloaded.
// They are short and quiet on purpose: a page turning, a buckle, a latch.
import { getPrefs } from './prefs';

export type Sfx = 'open' | 'close' | 'tab' | 'page' | 'click' | 'equip' | 'drop' | 'coin' | 'deny' | 'victory' | 'defeat' | 'ambush';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx ??= new Ctor(); } catch { return null; }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

interface Tone { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; gain: number }
interface Hiss { at?: number; dur: number; gain: number; from: number; to?: number; q?: number }

function tone(ac: AudioContext, out: AudioNode, { type = 'sine', from, to = from, at = 0, dur, gain }: Tone) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function hiss(ac: AudioContext, out: AudioNode, { at = 0, dur, gain, from, to = from, q = 0.9 }: Hiss) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = q;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(g).connect(out);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

const RECIPES: Record<Sfx, (ac: AudioContext, out: AudioNode) => void> = {
  // A heavy cover or a satchel flap.
  open: (ac, out) => { hiss(ac, out, { dur: 0.16, gain: 0.5, from: 500, to: 1900 }); tone(ac, out, { from: 150, to: 95, dur: 0.14, gain: 0.5 }); },
  close: (ac, out) => { hiss(ac, out, { dur: 0.11, gain: 0.4, from: 1500, to: 420 }); tone(ac, out, { from: 110, to: 70, dur: 0.12, gain: 0.55 }); },
  tab: (ac, out) => { tone(ac, out, { type: 'triangle', from: 880, to: 660, dur: 0.05, gain: 0.22 }); hiss(ac, out, { dur: 0.04, gain: 0.15, from: 3000 }); },
  // Paper against paper.
  page: (ac, out) => { hiss(ac, out, { dur: 0.2, gain: 0.5, from: 1400, to: 4200, q: 0.6 }); hiss(ac, out, { at: 0.07, dur: 0.12, gain: 0.25, from: 5200, to: 2600, q: 0.7 }); },
  click: (ac, out) => tone(ac, out, { type: 'triangle', from: 620, to: 480, dur: 0.045, gain: 0.2 }),
  // Buckle and steel.
  equip: (ac, out) => {
    tone(ac, out, { from: 2100, to: 2050, dur: 0.22, gain: 0.16 }); tone(ac, out, { from: 3150, to: 3100, dur: 0.16, gain: 0.1 });
    tone(ac, out, { at: 0.05, from: 2600, to: 2560, dur: 0.18, gain: 0.1 }); hiss(ac, out, { dur: 0.07, gain: 0.3, from: 2400 });
  },
  drop: (ac, out) => { tone(ac, out, { from: 190, to: 110, dur: 0.1, gain: 0.5 }); hiss(ac, out, { dur: 0.06, gain: 0.22, from: 900 }); },
  coin: (ac, out) => { tone(ac, out, { from: 2900, dur: 0.12, gain: 0.14 }); tone(ac, out, { at: 0.06, from: 3700, dur: 0.16, gain: 0.12 }); },
  deny: (ac, out) => { tone(ac, out, { type: 'triangle', from: 170, to: 120, dur: 0.16, gain: 0.4 }); },
  // A short rising call on a horn, the last note held.
  victory: (ac, out) => {
    for (const [i, f] of [392, 523, 659].entries()) { tone(ac, out, { type: 'triangle', from: f, at: i * 0.13, dur: 0.16, gain: 0.22 }); tone(ac, out, { type: 'sine', from: f * 2, at: i * 0.13, dur: 0.12, gain: 0.05 }); }
    tone(ac, out, { type: 'triangle', from: 784, to: 780, at: 0.39, dur: 0.9, gain: 0.24 }); tone(ac, out, { type: 'sine', from: 392, at: 0.39, dur: 0.9, gain: 0.12 });
  },
  // A low toll that sinks away.
  defeat: (ac, out) => { tone(ac, out, { from: 196, to: 150, dur: 1.2, gain: 0.3 }); tone(ac, out, { type: 'triangle', from: 98, to: 82, at: 0.05, dur: 1.4, gain: 0.25 }); },
  // A sharp swish and a thud.
  ambush: (ac, out) => { hiss(ac, out, { dur: 0.18, gain: 0.45, from: 4800, to: 900, q: 0.7 }); tone(ac, out, { at: 0.12, from: 120, to: 60, dur: 0.2, gain: 0.5 }); },
};

/** Play an interface sound, if the player has them switched on. Never throws. */
export function sfx(name: Sfx) {
  const prefs = getPrefs();
  if (!prefs.sounds || prefs.soundVolume <= 0) return;
  const ac = audio();
  if (!ac) return;
  try {
    const master = ac.createGain();
    master.gain.value = prefs.soundVolume * 0.5;
    master.connect(ac.destination);
    RECIPES[name](ac, master);
  } catch { /* a missing sound must never break the interface */ }
}
