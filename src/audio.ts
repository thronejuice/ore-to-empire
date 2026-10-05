/**
 * Sound effects synthesised with the Web Audio API — no audio files.
 * The context is created on the first sound after a user gesture (browsers block
 * audio before that); sounds requested earlier are silently skipped.
 */

export type Sfx = 'click' | 'place' | 'link' | 'sell' | 'upgrade' | 'research' | 'quest' | 'error' | 'remove' | 'coins' | 'prestige';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;
const lastPlayed: Partial<Record<Sfx, number>> = {};

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// any user gesture unlocks audio
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.5, slideTo?: number) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(master!);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.2, freq = 1200) {
  const a = ctx!;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master!);
  src.start(a.currentTime + start);
}

const MIN_GAP: Partial<Record<Sfx, number>> = { sell: 180, error: 250 };

export function sfx(name: Sfx) {
  if (!enabled) return;
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 40;
  if (now - (lastPlayed[name] ?? -1e9) < gap) return;
  lastPlayed[name] = now;
  if (!audio()) return;
  switch (name) {
    case 'click':
      tone(880, 0, 0.05, 'triangle', 0.25);
      break;
    case 'place':
      noise(0, 0.08, 0.35, 400);
      tone(220, 0, 0.12, 'square', 0.15, 160);
      break;
    case 'link':
      tone(520, 0, 0.07, 'triangle', 0.3);
      tone(780, 0.06, 0.09, 'triangle', 0.3);
      break;
    case 'sell':
      tone(1320, 0, 0.06, 'sine', 0.08);
      break;
    case 'upgrade':
      tone(440, 0, 0.08, 'triangle', 0.3);
      tone(660, 0.07, 0.08, 'triangle', 0.3);
      tone(880, 0.14, 0.14, 'triangle', 0.3);
      break;
    case 'research':
      tone(523, 0, 0.12, 'sine', 0.35);
      tone(659, 0.1, 0.12, 'sine', 0.35);
      tone(784, 0.2, 0.25, 'sine', 0.35);
      break;
    case 'quest':
      tone(784, 0, 0.1, 'triangle', 0.35);
      tone(1047, 0.09, 0.22, 'triangle', 0.35);
      break;
    case 'error':
      tone(180, 0, 0.14, 'sawtooth', 0.18, 120);
      break;
    case 'remove':
      noise(0, 0.15, 0.3, 300);
      break;
    case 'coins':
      for (let i = 0; i < 5; i++) tone(1200 + i * 160, i * 0.05, 0.08, 'sine', 0.2);
      break;
    case 'prestige':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.3));
      break;
  }
}
