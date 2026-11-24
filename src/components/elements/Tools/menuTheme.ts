// "Starlight Select": the arcade menu's theme, an original 16-bar chiptune
// loop in D major (about 44 seconds). It is meant to feel like a title
// screen under the hub's starfield: nostalgic and a little dreamy, calmer
// than the bouncy radio song in Jordan's Room.
//
//   bars 1-8   Dmaj7  Bm7   Gmaj7  A    | Dmaj7  F#m7  Gmaj7  Asus4-A
//   bars 9-16  Em7    F#m7  Gmaj7  A    | Bm7    Gmaj7  Em7-A7 D
//
// Everything is synthesised live: a soft 25% pulse lead with a triangle
// sparkle, music-box triangle arpeggios in sixteenths, a triangle bass, a
// light hi-hat, a soft kick in the second half, and a dotted-eighth echo
// that gives it the spacious, starry feel.
import type { Song } from './arcade/music';

const BPM = 88;
const SIXTEENTH = 60 / BPM / 4;
const BARS = 16;
const STEPS = BARS * 16;
const VOLUME = 1.2;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  arp: number[]; // four notes around middle C, for the arpeggio
  root: number; // bass note
}
const Dmaj7: Chord = { arp: [62, 66, 69, 73], root: 38 };
const Bm7: Chord = { arp: [62, 66, 69, 71], root: 35 };
const Gmaj7: Chord = { arp: [62, 66, 67, 71], root: 43 };
const A: Chord = { arp: [61, 64, 69, 73], root: 45 };
const Fsm7: Chord = { arp: [61, 64, 66, 69], root: 42 };
const Asus4: Chord = { arp: [62, 64, 69, 74], root: 45 };
const Em7: Chord = { arp: [62, 64, 67, 71], root: 40 };
const A7: Chord = { arp: [61, 64, 67, 69], root: 45 };
const D: Chord = { arp: [62, 66, 69, 74], root: 38 };

/** Chord for each half bar. */
const CHORDS: [Chord, Chord][] = [
  [Dmaj7, Dmaj7], [Bm7, Bm7], [Gmaj7, Gmaj7], [A, A],
  [Dmaj7, Dmaj7], [Fsm7, Fsm7], [Gmaj7, Gmaj7], [Asus4, A],
  [Em7, Em7], [Fsm7, Fsm7], [Gmaj7, Gmaj7], [A, A],
  [Bm7, Bm7], [Gmaj7, Gmaj7], [Em7, A7], [D, D],
];

/** The tune, bar by bar, as [MIDI note, length in eighths]; 0 is a rest. */
const MELODY: [number, number][][] = [
  [[78, 3], [81, 3], [85, 2]],
  [[83, 3], [81, 3], [78, 2]],
  [[79, 3], [78, 3], [74, 2]],
  [[76, 6], [0, 2]],
  [[78, 3], [81, 3], [86, 2]],
  [[85, 3], [81, 3], [78, 2]],
  [[83, 3], [81, 2], [79, 1], [78, 2]],
  [[74, 4], [73, 4]],
  [[71, 1], [74, 1], [79, 2], [78, 1], [76, 1], [74, 2]],
  [[73, 1], [76, 1], [81, 2], [78, 1], [76, 1], [73, 2]],
  [[74, 1], [78, 1], [83, 2], [81, 1], [79, 1], [78, 2]],
  [[76, 3], [81, 3], [85, 2]],
  [[86, 3], [85, 3], [83, 2]],
  [[83, 3], [81, 3], [78, 2]],
  [[79, 2], [78, 2], [76, 2], [73, 2]],
  [[74, 6], [0, 2]],
];

/** Lead notes keyed by the sixteenth they start on: [MIDI, length in sixteenths]. */
const LEAD = new Map<number, [number, number]>();
MELODY.forEach((bar, b) => {
  let at = b * 16;
  bar.forEach(([midi, eighths]) => {
    if (midi) LEAD.set(at, [midi, eighths * 2]);
    at += eighths * 2;
  });
});

/** Arpeggio shape over each half bar: up the chord, over the top, back down. */
const ARP = [0, 1, 2, 3, 4, 3, 2, 1];

// --- Sound sources ---------------------------------------------------------

const pulses = new WeakMap<BaseAudioContext, PeriodicWave>();
/** A 25% pulse wave, the classic thin, reedy chiptune lead. */
function pulse(ac: BaseAudioContext): PeriodicWave {
  let wave = pulses.get(ac);
  if (!wave) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    wave = ac.createPeriodicWave(real, imag);
    pulses.set(ac, wave);
  }
  return wave;
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ac: BaseAudioContext): AudioBuffer {
  let buf = noises.get(ac);
  if (!buf) {
    const len = Math.floor(ac.sampleRate * 0.04);
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noises.set(ac, buf);
  }
  return buf;
}

interface Bus {
  master: GainNode;
  lead: AudioNode; // softened with a low-pass, for the pulse lead
  echo: AudioNode; // send into the dotted-eighth echo
}

function makeBus(ac: BaseAudioContext, out: AudioNode): Bus {
  const master = ac.createGain();
  master.connect(out);

  const lead = ac.createBiquadFilter();
  lead.type = 'lowpass';
  lead.frequency.value = 3400;
  lead.Q.value = 0.5;
  lead.connect(master);

  // echo: send -> delay -> darker each repeat -> back into the delay
  const echo = ac.createGain();
  const delay = ac.createDelay(2);
  delay.delayTime.value = SIXTEENTH * 3;
  const dark = ac.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 2200;
  const feedback = ac.createGain();
  feedback.gain.value = 0.33;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  echo.connect(delay);
  delay.connect(dark);
  dark.connect(feedback);
  feedback.connect(delay);
  dark.connect(wet);
  wet.connect(master);

  return { master, lead, echo };
}

/** A held note with a soft attack, a gentle fall to its sustain level, and a short release. */
function held(
  ac: BaseAudioContext,
  outs: AudioNode[],
  wave: OscillatorType | PeriodicWave,
  freq: number,
  at: number,
  dur: number,
  vol: number,
  vibrato = 0,
) {
  const osc = ac.createOscillator();
  if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
  else osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.setTargetAtTime(vol * 0.7, at + 0.012, 0.12);
  g.gain.setTargetAtTime(0.0001, at + dur, 0.025);
  osc.connect(g);
  outs.forEach((o) => g.connect(o));
  osc.start(at);
  osc.stop(at + dur + 0.2);
  if (vibrato) {
    // vibrato that fades in on long notes
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * vibrato, at + Math.min(0.35, dur * 0.6));
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + dur + 0.2);
  }
}

/** A plucked, music-box note that dies away on its own. */
function pluck(ac: BaseAudioContext, outs: AudioNode[], freq: number, at: number, vol: number, decay = 0.35) {
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, at);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g);
  outs.forEach((o) => g.connect(o));
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

function hat(ac: BaseAudioContext, out: AudioNode, at: number, vol: number) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(hp).connect(g).connect(out);
  src.start(at);
}

function kick(ac: BaseAudioContext, out: AudioNode, at: number, vol: number) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + 0.2);
}

/** Queue everything that sounds on sixteenth `s` of the loop, at time `t`. */
function playStep(ac: BaseAudioContext, bus: Bus, s: number, t: number) {
  const step = s % STEPS;
  const bar = Math.floor(step / 16);
  const pos = step % 16;
  const [first, second] = CHORDS[bar];
  const chord = pos < 8 ? first : second;

  // music-box arpeggio
  const a = ARP[pos % 8];
  const arpNote = a === 4 ? chord.arp[0] + 12 : chord.arp[a];
  pluck(ac, [bus.master, bus.echo], hz(arpNote), t, pos % 8 === 0 ? 0.03 : 0.02);

  // lead, with an octave sparkle on top
  const lead = LEAD.get(step);
  if (lead) {
    const [midi, len] = lead;
    const dur = len * SIXTEENTH * 0.92;
    held(ac, [bus.lead, bus.echo], pulse(ac), hz(midi), t, dur, 0.032, len >= 6 ? 0.004 : 0);
    pluck(ac, [bus.master], hz(midi + 12), t, 0.008, 0.25);
  }

  // bass: root, a pickup an octave up, then the fifth (or the next chord) and the octave
  const same = first === second;
  const bass: Record<number, [number, number]> = {
    0: [first.root, 6],
    6: [first.root + 12, 2],
    8: [same ? first.root + 7 : second.root, 4],
    12: [second.root + 12, 4],
  };
  const b = bass[pos];
  if (b) held(ac, [bus.master], 'triangle', hz(b[0]), t, b[1] * SIXTEENTH * 0.9, 0.075);

  // light hi-hat on the eighths, a soft kick in the second half
  if (pos % 2 === 0) hat(ac, bus.master, t, pos % 4 === 2 ? 0.012 : 0.006);
  if (bar >= 8 && pos % 8 === 0) kick(ac, bus.master, t, 0.09);
}

export const STARLIGHT_SELECT: Song = {
  title: 'Starlight Select',
  steps: STEPS,
  stepSeconds: SIXTEENTH,
  volume: VOLUME,
  mount(ac, out) {
    const bus = makeBus(ac, out);
    return { master: bus.master, play: (step, at) => playStep(ac, bus, step, at) };
  },
};
