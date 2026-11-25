// Chiptune sound effects synthesised with the Web Audio API: no audio files.
// One shared AudioContext, created lazily on the first sound (browsers only
// allow audio after a user gesture). Mute is global across the arcade and
// remembered between visits.
import { useSyncExternalStore } from 'react';
import { load, save } from './storage';

let ctx: AudioContext | null = null;
// only a saved `true` mutes, so a garbled value can't leave mute half-on
let muted = load<unknown>('muted', false) === true;
const listeners = new Set<() => void>();

export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  save('muted', value);
  listeners.forEach((l) => l());
}

/** React hook: [muted, setMuted] that stays in sync across components. */
export function useMuted(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
    () => false,
  );
  return [value, setMuted];
}

export type Wave = OscillatorType;

/** Play one tone. `slideTo` glides the pitch for laser/coin style blips. */
export function tone(
  freq: number,
  duration = 0.1,
  { type = 'square' as Wave, volume = 0.08, delay = 0, slideTo }: {
    type?: Wave;
    volume?: number;
    delay?: number;
    slideTo?: number;
  } = {},
) {
  if (muted) return;
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short arpeggio, e.g. [523, 659, 784]. */
export function arp(freqs: number[], step = 0.07, opts?: Parameters<typeof tone>[2]) {
  freqs.forEach((f, i) => tone(f, step * 1.4, { ...opts, delay: (opts?.delay ?? 0) + i * step }));
}

// A small vocabulary every game can share, so the arcade sounds consistent.
export const sfx = {
  /** typewriter tick for dialogue text */
  text: () => tone(660 + Math.random() * 40, 0.03, { volume: 0.035 }),
  /** moving a menu cursor */
  move: () => tone(440, 0.04, { volume: 0.05 }),
  /** confirming a choice */
  select: () => arp([523, 784], 0.05, { volume: 0.06 }),
  /** going back / closing */
  back: () => arp([523, 392], 0.05, { volume: 0.05 }),
  /** something good (merge, word found, pick up) */
  good: () => arp([659, 784, 1047], 0.06, { volume: 0.06 }),
  /** coin / point */
  coin: () => tone(988, 0.08, { volume: 0.06, slideTo: 1319 }),
  /** a mistake */
  bad: () => tone(196, 0.18, { type: 'sawtooth', volume: 0.05, slideTo: 110 }),
  /** a win */
  win: () => arp([523, 659, 784, 1047, 1319], 0.09, { volume: 0.07 }),
  /** a loss */
  lose: () => arp([392, 330, 262, 196], 0.12, { type: 'triangle', volume: 0.08 }),
  /** footstep */
  step: () => tone(120 + Math.random() * 30, 0.03, { type: 'triangle', volume: 0.04 }),
};
