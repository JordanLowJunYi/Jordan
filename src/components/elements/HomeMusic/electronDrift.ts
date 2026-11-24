// "Electron Drift": the portfolio home page's theme, an original 16-bar
// lo-fi loop in F major at 74 BPM (about 52 seconds). The page is a dark
// navy field of drifting electrons around a warm orange name, so this is a
// late-night study beat: unhurried, warm, easy to read to, and a different
// world from the arcade's chiptune.
//
//   bars 1-8   Bbmaj9  Am7     Gm9    C9sus | Bbmaj9  Am7-D9  Gm9  C9sus-C7
//   bars 9-16  Dm9     Bbmaj9  Fmaj9  C/E   | Dm9     Bbmaj9  Gm9  C9sus-C7
//
// Everything is synthesised live: a soft FM electric piano on the chords,
// a vibraphone-like bell on the tune, a round bass and a brushed beat with
// lazy swung sixteenths, all with a slow tape wobble and a small room
// reverb. The second half adds a warm pad and stray high "electron" blips.
import type { Song, SongVoices } from '../Tools/arcade/music';

const BPM = 74;
const SIXTEENTH = 60 / BPM / 4;
const BARS = 16;
const STEPS = BARS * 16;
const SWING = SIXTEENTH * 0.3; // off-beat sixteenths land late
const VOLUME = 0.45; // a little quieter than the arcade theme: this one plays while people read

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  keys: number[]; // four-note electric piano voicing around middle C
  root: number; // bass note
}
const Bbmaj9: Chord = { keys: [62, 65, 69, 72], root: 46 };
const Am7: Chord = { keys: [60, 64, 67, 69], root: 45 };
const D9: Chord = { keys: [60, 64, 66, 69], root: 50 };
const Gm9: Chord = { keys: [58, 62, 65, 69], root: 43 };
const C9sus: Chord = { keys: [58, 62, 65, 67], root: 48 };
const C9: Chord = { keys: [58, 62, 64, 67], root: 48 };
const Dm9: Chord = { keys: [60, 64, 65, 69], root: 50 };
const Fmaj9: Chord = { keys: [64, 67, 69, 72], root: 41 };
const CoverE: Chord = { keys: [62, 64, 67, 72], root: 40 };

/** Chord for each half bar. */
const CHORDS: [Chord, Chord][] = [
  [Bbmaj9, Bbmaj9], [Am7, Am7], [Gm9, Gm9], [C9sus, C9sus],
  [Bbmaj9, Bbmaj9], [Am7, D9], [Gm9, Gm9], [C9sus, C9],
  [Dm9, Dm9], [Bbmaj9, Bbmaj9], [Fmaj9, Fmaj9], [CoverE, CoverE],
  [Dm9, Dm9], [Bbmaj9, Bbmaj9], [Gm9, Gm9], [C9sus, C9],
];

/** The tune, bar by bar, as [MIDI note, length in eighths]; 0 is a rest. */
const MELODY: [number, number][][] = [
  [[0, 2], [77, 1], [79, 1], [81, 4]],
  [[79, 2], [76, 2], [72, 4]],
  [[0, 2], [74, 1], [77, 1], [81, 3], [79, 1]],
  [[77, 6], [0, 2]],
  [[0, 2], [77, 1], [79, 1], [81, 2], [84, 2]],
  [[81, 2], [79, 2], [78, 3], [74, 1]],
  [[79, 3], [77, 1], [74, 4]],
  [[77, 4], [76, 4]],
  [[81, 1], [84, 1], [88, 2], [86, 2], [84, 2]],
  [[86, 3], [84, 1], [81, 4]],
  [[79, 1], [81, 1], [84, 2], [81, 2], [79, 2]],
  [[76, 6], [0, 2]],
  [[81, 1], [84, 1], [88, 2], [86, 2], [84, 2]],
  [[86, 3], [84, 1], [89, 4]],
  [[86, 2], [84, 2], [81, 2], [79, 2]],
  [[77, 4], [76, 4]],
];

/** Tune notes keyed by the sixteenth they start on: [MIDI, length in sixteenths]. */
const TUNE = new Map<number, [number, number]>();
MELODY.forEach((bar, b) => {
  let at = b * 16;
  bar.forEach(([midi, eighths]) => {
    if (midi) TUNE.set(at, [midi, eighths * 2]);
    at += eighths * 2;
  });
});

/** A fixed pseudo-random number in [0, 1) for step `n`, so every loop is the same. */
function rand(n: number, salt: number) {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// --- Shared buffers, one per AudioContext ----------------------------------

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ac: BaseAudioContext): AudioBuffer {
  let buf = noises.get(ac);
  if (!buf) {
    const len = Math.floor(ac.sampleRate * 0.5);
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ac, buf);
  }
  return buf;
}

const rooms = new WeakMap<BaseAudioContext, AudioBuffer>();
/** A small, dark room: two channels of decaying, softened noise. */
function room(ac: BaseAudioContext): AudioBuffer {
  let buf = rooms.get(ac);
  if (!buf) {
    const sr = ac.sampleRate;
    const len = Math.floor(sr * 2.2);
    buf = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let soft = 0;
      for (let i = 0; i < len; i++) {
        soft += 0.4 * (Math.random() * 2 - 1 - soft);
        d[i] = soft * Math.exp((-2.8 * i) / sr) * Math.min(1, i / (sr * 0.008));
      }
    }
    rooms.set(ac, buf);
  }
  return buf;
}

// --- The band --------------------------------------------------------------

function mount(ac: BaseAudioContext, out: AudioNode): SongVoices {
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  const gain = (value: number) => {
    const g = ac.createGain();
    g.gain.value = value;
    return g;
  };

  // mix -> soft top end -> gentle glue compressor -> master
  const master = gain(0);
  master.connect(out);
  const glue = ac.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;
  const mix = gain(1);
  mix.connect(filter('lowpass', 7500, 0.4)).connect(glue).connect(master);

  // reverb send
  const verb = gain(1);
  const conv = ac.createConvolver();
  conv.buffer = room(ac);
  verb.connect(conv).connect(filter('lowpass', 4200)).connect(gain(0.45)).connect(mix);

  // instrument buses
  const keysBus = gain(1);
  keysBus.connect(mix);
  keysBus.connect(gain(0.35)).connect(verb);

  const bellBus = gain(0.85); // its gain wobbles: the vibraphone's tremolo
  const bellPan = ac.createStereoPanner();
  bellPan.pan.value = 0.12;
  bellBus.connect(bellPan);
  bellPan.connect(mix);
  bellPan.connect(gain(0.55)).connect(verb);

  const bassBus = filter('lowpass', 650);
  bassBus.connect(mix);

  const padBus = filter('lowpass', 900);
  padBus.connect(mix);
  padBus.connect(gain(0.6)).connect(verb);

  const drums = gain(1);
  drums.connect(mix);
  const snareRoom = gain(0.3);
  snareRoom.connect(verb);

  // slow LFOs: tape wobble (in cents) and the bell's tremolo
  const wowLfo = ac.createOscillator();
  wowLfo.frequency.value = 0.45;
  const wow = gain(5);
  wowLfo.connect(wow);
  const tremLfo = ac.createOscillator();
  tremLfo.frequency.value = 4.6;
  const trem = gain(0.15);
  tremLfo.connect(trem).connect(bellBus.gain);
  wowLfo.start();
  tremLfo.start();

  /** Let the tape wobble bend this oscillator's pitch until it ends. */
  const wobble = (o: OscillatorNode) => {
    wow.connect(o.detune);
    o.addEventListener('ended', () => {
      try {
        wow.disconnect(o.detune);
      } catch {
        /* already gone */
      }
    });
  };

  /** FM electric piano: bright as the hammer hits, mellow as it rings. */
  function epiano(midi: number, at: number, dur: number, vel: number, pan: number) {
    const f = hz(midi);
    const car = ac.createOscillator();
    car.frequency.value = f;
    const mod = ac.createOscillator();
    mod.frequency.value = f;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(f * 1.4, at);
    depth.gain.setTargetAtTime(f * 0.18, at, 0.3);
    mod.connect(depth).connect(car.frequency);
    const v = 0.03 * vel;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.006);
    g.gain.setTargetAtTime(v * 0.35, at + 0.006, 0.6);
    g.gain.setTargetAtTime(0.0001, at + dur, 0.09);
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    car.connect(g).connect(p).connect(keysBus);
    wobble(car);
    wobble(mod);
    car.start(at);
    mod.start(at);
    car.stop(at + dur + 0.6);
    mod.stop(at + dur + 0.6);
  }

  /** Soft mallet bell for the tune. */
  function bell(midi: number, at: number, dur: number) {
    const f = hz(midi);
    const car = ac.createOscillator();
    car.frequency.value = f;
    const mod = ac.createOscillator();
    mod.frequency.value = f * 4;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(f * 1.8, at);
    depth.gain.setTargetAtTime(0, at, 0.07);
    mod.connect(depth).connect(car.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.055, at + 0.004);
    g.gain.setTargetAtTime(0.0001, at + 0.004, 0.7);
    g.gain.setTargetAtTime(0.0001, at + dur, 0.12);
    car.connect(g).connect(bellBus);
    wobble(car);
    car.start(at);
    mod.start(at);
    car.stop(at + dur + 0.8);
    mod.stop(at + dur + 0.8);
  }

  function bass(midi: number, at: number, dur: number, vel: number) {
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(midi);
    const v = 0.12 * vel;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.012);
    g.gain.setTargetAtTime(v * 0.7, at + 0.012, 0.25);
    g.gain.setTargetAtTime(0.0001, at + dur, 0.05);
    o.connect(g).connect(bassBus);
    o.start(at);
    o.stop(at + dur + 0.3);
  }

  /** Two slightly detuned saws per note, slowly swelling under a low-pass. */
  function pad(chord: Chord, at: number, dur: number) {
    chord.keys.forEach((m) => {
      [-8, 8].forEach((cents) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = cents;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.0045, at + 0.8);
        g.gain.setTargetAtTime(0, at + dur, 0.3);
        o.connect(g).connect(padBus);
        o.start(at);
        o.stop(at + dur + 1.5);
      });
    });
  }

  /** A tiny high blip somewhere in the stereo field: a passing electron. */
  function blip(midi: number, at: number, pan: number) {
    const o = ac.createOscillator();
    o.frequency.value = hz(midi);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.012, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(mix);
    p.connect(verb);
    o.start(at);
    o.stop(at + 0.4);
  }

  function kick(at: number, vel: number) {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.2 * vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(drums);
    o.start(at);
    o.stop(at + 0.4);
  }

  /** A brushed snare: a burst of band-passed noise with a little body. */
  function snare(at: number, vel: number, offset: number) {
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.09 * vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    src.connect(filter('bandpass', 1800, 0.6)).connect(g);
    g.connect(drums);
    g.connect(snareRoom);
    src.start(at, offset, 0.25);

    const body = ac.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, at);
    body.frequency.exponentialRampToValueAtTime(150, at + 0.06);
    const bg = ac.createGain();
    bg.gain.setValueAtTime(0.04 * vel, at);
    bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    body.connect(bg).connect(drums);
    body.start(at);
    body.stop(at + 0.1);
  }

  function hat(at: number, vel: number, offset: number) {
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.022 * vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    const p = ac.createStereoPanner();
    p.pan.value = 0.25;
    src.connect(filter('highpass', 6500)).connect(g).connect(p).connect(drums);
    src.start(at, offset, 0.06);
  }

  function play(step: number, at: number) {
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const t = at + (pos % 2 ? SWING : 0);
    const [first, second] = CHORDS[bar];
    const split = first !== second;
    const chord = pos < 8 ? first : second;
    const secondHalf = bar >= 8;

    // electric piano, strummed upwards: [chord, length in sixteenths, velocity]
    const comp: Record<number, [Chord, number, number]> = split
      ? { 0: [first, 7, 1], 8: [second, 7, 0.85] }
      : { 0: [first, 9, 1], 10: [first, 5, 0.6] };
    const c = comp[pos];
    if (c) c[0].keys.forEach((m, i) => epiano(m, t + i * 0.014, c[1] * SIXTEENTH, c[2], (i - 1.5) * 0.18));

    if (secondHalf && (pos === 0 || (split && pos === 8))) pad(chord, t, (split ? 8 : 16) * SIXTEENTH);

    const note = TUNE.get(step);
    if (note) bell(note[0], t, note[1] * SIXTEENTH * 0.95);

    // bass: [MIDI, length in sixteenths, velocity]
    const r = first.root;
    const line: Record<number, [number, number, number]> = split
      ? { 0: [r, 6, 1], 8: [second.root, 6, 0.9], 14: [second.root + 12, 2, 0.5] }
      : { 0: [r, 6, 1], 7: [r, 1, 0.5], 10: [r, 4, 0.85], 14: [r + 7, 2, 0.6] };
    const b = line[pos];
    if (b) bass(b[0], t, b[1] * SIXTEENTH * 0.9, b[2]);

    // the beat drops out for the last two beats to turn the loop around
    const turnaround = bar === BARS - 1 && pos >= 8;
    if (!turnaround) {
      if (pos === 0) kick(t, 1);
      else if (pos === 10) kick(t, 0.8);
      else if (pos === 7 && bar % 2 === 1) kick(t, 0.55);
      if (pos === 4 || pos === 12) snare(t, 1, rand(step, 4) * 0.2);
    }
    if (pos % 2 === 0) hat(t, pos % 4 === 2 ? 1 : 0.6, rand(step, 5) * 0.4);
    else if (pos === 3 || pos === 11) hat(t, 0.35, rand(step, 5) * 0.4);

    if (secondHalf && rand(step, 1) < 0.2) {
      const m = chord.keys[Math.floor(rand(step, 2) * chord.keys.length)] + 24;
      blip(m, t, (rand(step, 3) * 2 - 1) * 0.7);
    }
  }

  return {
    master,
    play,
    dispose() {
      wowLfo.stop();
      tremLfo.stop();
    },
  };
}

export const ELECTRON_DRIFT: Song = {
  title: 'Electron Drift',
  steps: STEPS,
  stepSeconds: SIXTEENTH,
  volume: VOLUME,
  mount,
};
