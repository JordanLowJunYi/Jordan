// Piano sound for every mode.
//
// Samples: soundfont-player's acoustic_grand_piano (MusyngKite), fetched from
// the network and decoded on the arcade's shared AudioContext. Decoding all 88
// notes would hold ~100 MB of audio, so notes are decoded one octave at a time,
// only for the octaves the player can reach right now. Loads are queued so the
// first request warms the HTTP cache for the rest.
//
// Until an octave is ready (or if the samples can't be fetched) notes fall back
// to a soft synthesised piano: triangle + decaying harmonics through a low-pass.
//
// Nothing plays while the arcade is muted, and muting stops ringing notes.
//
// Browsers only let audio start after a user gesture, so nothing touches the
// AudioContext (or downloads samples) until unlockAudio() is called from the
// first pointer/key press. Ranges asked for before that are remembered.
import { useSyncExternalStore } from 'react';
import * as SoundfontNS from 'soundfont-player';
import type { Player } from 'soundfont-player';
import { audioContext, isMuted } from '../arcade';
import { frequency } from './notes';

export type PianoStatus = 'idle' | 'loading' | 'ready' | 'fallback';

export interface Voice {
  /** Let go of the key: the note fades out over a short release. */
  stop: () => void;
}

type InstrumentFn = typeof SoundfontNS.instrument;
type SampleNode = { stop: (when?: number) => void };

// soundfont-player is CommonJS: depending on the bundler's interop the
// function is on the namespace or on its default export.
const instrument: InstrumentFn | undefined =
  (SoundfontNS as unknown as { instrument?: InstrumentFn }).instrument ??
  (SoundfontNS as unknown as { default?: { instrument?: InstrumentFn } }).default?.instrument;

// Soundfont keys use flats: "Db4".
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const blockOf = (midi: number) => Math.floor(midi / 12);

const blocks = new Map<number, Player | 'loading' | 'failed'>();
let queue: Promise<void> = Promise.resolve();
let status: PianoStatus = 'idle';
let failures = 0;
let unlocked = false;
const wanted = new Set<number>(); // blocks asked for before the first gesture
const listeners = new Set<() => void>();
const sounding = new Set<Voice>();

let master: { ac: AudioContext; input: GainNode } | null = null;

function setStatus(next: PianoStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

/** Gain + gentle compressor so chords don't clip. One per AudioContext. */
function output(ac: AudioContext): GainNode {
  if (master?.ac !== ac) {
    const input = ac.createGain();
    input.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    input.connect(comp).connect(ac.destination);
    master = { ac, input };
  }
  return master.input;
}

function loadBlock(block: number) {
  // After two failed fetches assume we're offline and stay on the synth.
  if (blocks.has(block) || block < 1 || block > 9 || failures >= 2) return;
  if (!unlocked) {
    wanted.add(block);
    return;
  }
  const ac = audioContext();
  if (!ac || !instrument) {
    setStatus('fallback');
    return;
  }
  blocks.set(block, 'loading');
  if (status === 'idle') setStatus('loading');
  queue = queue.then(async () => {
    try {
      const player = await instrument(ac, 'acoustic_grand_piano', {
        notes: FLAT_NAMES.map((n) => `${n}${block - 1}`),
        destination: output(ac),
        gain: 1.6,
      });
      blocks.set(block, player);
      setStatus('ready');
    } catch {
      blocks.set(block, 'failed');
      failures += 1;
      // Nothing decoded at all: the samples are unreachable, stay on the synth.
      if (![...blocks.values()].some((b) => typeof b === 'object')) setStatus('fallback');
    }
  });
}

/** Decode the octaves that cover low..high (MIDI numbers), once audio is unlocked. */
export function preloadRange(low: number, high: number) {
  for (let b = blockOf(low); b <= blockOf(high); b++) loadBlock(b);
}

/**
 * Call from a user gesture (pointer/key press). The first call creates the
 * shared AudioContext and starts loading any octaves asked for so far; later
 * calls just resume the context if the browser suspended it.
 */
export function unlockAudio() {
  if (!unlocked) {
    unlocked = true;
    const pending = [...wanted];
    wanted.clear();
    pending.forEach(loadBlock);
  }
  audioContext(); // creates or resumes
}

/** React hook: 'idle' | 'loading' | 'ready' | 'fallback'. */
export function usePianoStatus(): PianoStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => 'idle',
  );
}

const SILENT: Voice = { stop: () => {} };

/** Strike a key. Call `stop()` on the result when the key is let go. */
export function playNote(midi: number, velocity = 0.85): Voice {
  unlockAudio(); // a note is always a gesture (or follows one)
  if (isMuted()) return SILENT;
  const ac = audioContext();
  if (!ac) return SILENT;

  const block = blocks.get(blockOf(midi));
  if (block === undefined) loadBlock(blockOf(midi));

  let voice: Voice | null = null;
  if (block && typeof block === 'object') {
    const node = block.play(String(midi), ac.currentTime, {
      gain: 1.6 * velocity,
      release: 0.45,
    }) as unknown as SampleNode | undefined;
    if (node) {
      let stopped = false;
      voice = {
        stop: () => {
          if (stopped) return;
          stopped = true;
          sounding.delete(voice!);
          try {
            node.stop(ac.currentTime);
          } catch {
            /* already ended */
          }
        },
      };
      const v = voice;
      window.setTimeout(() => sounding.delete(v), 6000);
    }
  }
  voice ??= synth(ac, midi, velocity);
  sounding.add(voice);
  return voice;
}

/** Stop everything that is sounding (mute, leaving the page). */
export function stopAllNotes() {
  [...sounding].forEach((v) => v.stop());
  sounding.clear();
}

/** Play a note for a fixed time, e.g. the mystery note. Returns a cancel. */
export function playFor(midi: number, seconds: number, delay = 0): () => void {
  let voice: Voice | null = null;
  const start = window.setTimeout(() => {
    voice = playNote(midi);
  }, delay * 1000);
  const end = window.setTimeout(() => voice?.stop(), (delay + seconds) * 1000);
  return () => {
    window.clearTimeout(start);
    window.clearTimeout(end);
    voice?.stop();
  };
}

// ---------- synth fallback ----------

const PARTIALS: [ratio: number, type: OscillatorType, level: number][] = [
  [1, 'triangle', 1],
  [2, 'sine', 0.32],
  [3, 'sine', 0.12],
  [4, 'sine', 0.05],
];

function synth(ac: AudioContext, midi: number, velocity: number): Voice {
  const t0 = ac.currentTime;
  const f = frequency(midi);
  // Low notes ring longer, like real strings.
  const decay = Math.min(4, Math.max(1.2, 3.4 - (midi - 48) * 0.05));
  const peak = 0.22 * velocity;

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.28);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(f * 7, 9000), t0);
  filter.frequency.exponentialRampToValueAtTime(Math.min(f * 2.5, 5000), t0 + decay * 0.6);
  filter.connect(env).connect(output(ac));

  const oscs = PARTIALS.map(([ratio, type, level], i) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = f * ratio;
    osc.detune.value = i === 0 ? 0 : (Math.random() - 0.5) * 6; // tiny shimmer
    const g = ac.createGain();
    g.gain.setValueAtTime(level, t0);
    // Upper harmonics fade first, so the tone mellows as it rings.
    g.gain.exponentialRampToValueAtTime(Math.max(level * 0.08, 0.0001), t0 + (decay * 0.5) / ratio);
    osc.connect(g).connect(filter);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
    return osc;
  });

  let stopped = false;
  const voice: Voice = {
    stop: () => {
      if (stopped) return;
      stopped = true;
      sounding.delete(voice);
      const now = ac.currentTime;
      const g = env.gain;
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
      else {
        const current = g.value;
        g.cancelScheduledValues(now);
        g.setValueAtTime(Math.max(current, 0.0001), now);
      }
      g.setTargetAtTime(0.0001, now, 0.09);
      oscs.forEach((o) => {
        try {
          o.stop(now + 0.5);
        } catch {
          /* already stopped */
        }
      });
    },
  };
  window.setTimeout(() => sounding.delete(voice), (decay + 0.1) * 1000);
  return voice;
}
