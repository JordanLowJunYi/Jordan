// "Pixel Picnic": a short original chiptune loop, synthesised live with
// oscillators and a noise buffer (no audio files). Four channels like an old
// console: a 25% pulse lead (with a quiet echo), a 12.5% pulse arpeggio, a
// triangle bass, and noise/sine drums. Notes are scheduled slightly ahead of
// time on the Web Audio clock so the groove stays tight.

export const SONG_TITLE = 'Pixel Picnic';

const BPM = 128;
const STEP = 60 / BPM / 4; // one sixteenth note, in seconds
const STEPS_PER_BAR = 16;

// Lead melody, tracker style: a note starts it, "-" holds it, "." is a rest.
const LEAD = [
  'E5 - - A5 - - G5 - E5 - D5 - C5 - D5 -', // Am
  'C5 - - A4 - - C5 - F5 - - - E5 - - -', // F
  'E5 - G5 - C6 - - - B5 - G5 - E5 - - -', // C
  'D5 - - B4 - - D5 - G5 - - - - - . .', // G
  'E5 - - A5 - - B5 - C6 - - - B5 - A5 -', // Am
  'A5 - G5 - F5 - E5 - F5 - A5 - C6 - - -', // F
  'D6 - - - C6 - A5 - F5 - - - A5 - C6 -', // Dm
  'B5 - - G#5 - - E5 - G#5 - B5 - D6 - B5 -', // E
];

// One chord per bar: bass root (MIDI) and whether the chord is minor.
const CHORDS: { root: number; minor: boolean }[] = [
  { root: 45, minor: true }, // Am
  { root: 41, minor: false }, // F
  { root: 48, minor: false }, // C
  { root: 43, minor: false }, // G
  { root: 45, minor: true }, // Am
  { root: 41, minor: false }, // F
  { root: 50, minor: true }, // Dm
  { root: 40, minor: false }, // E
];

const KICK = 'x.....x.x.......';
const SNARE = '....x.......x...';
const SNARE_FILL = '....x.......xxxx';
const HAT = '..x...x...x...xx';
const BASS = [0, 12, 0, 12, 0, 12, 7, 12]; // octave bounce on every 8th note

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] ? 1 : 0);
}

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Note {
  step: number; // absolute step in the loop
  midi: number;
  len: number; // in steps
}

/** Turn the tracker strings into notes with lengths. */
function parseLead(): Note[] {
  const notes: Note[] = [];
  let current: Note | null = null;
  LEAD.forEach((bar, b) => {
    bar.split(/\s+/).forEach((tok, i) => {
      const step = b * STEPS_PER_BAR + i;
      if (tok === '-') {
        if (current) current.len++;
        return;
      }
      current = null;
      if (tok === '.') return;
      current = { step, midi: midi(tok), len: 1 };
      notes.push(current);
    });
  });
  return notes;
}

const LEAD_NOTES = parseLead();
const LOOP_STEPS = LEAD.length * STEPS_PER_BAR;

function pulseWave(ac: AudioContext, duty: number) {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ac.createPeriodicWave(real, imag);
}

export class Chiptune {
  private ac: AudioContext;
  private dest: AudioNode;
  private bus: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private wide: PeriodicWave;
  private thin: PeriodicWave;
  private noise: AudioBuffer;

  constructor(ac: AudioContext, dest: AudioNode) {
    this.ac = ac;
    this.dest = dest;
    this.wide = pulseWave(ac, 0.25);
    this.thin = pulseWave(ac, 0.125);
    this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  get playing() {
    return this.bus !== null;
  }

  start() {
    if (this.bus) return;
    const bus = this.ac.createGain();
    bus.gain.value = 0.85;
    const comp = this.ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    bus.connect(comp).connect(this.dest);
    this.bus = bus;
    this.nextTime = this.ac.currentTime + 0.06;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  /** Fade out quickly; anything already scheduled plays into a muted, detached bus. */
  stop() {
    window.clearInterval(this.timer);
    const bus = this.bus;
    this.bus = null;
    if (!bus) return;
    bus.gain.setTargetAtTime(0, this.ac.currentTime, 0.015);
    window.setTimeout(() => bus.disconnect(), 400);
  }

  private schedule() {
    if (!this.bus) return;
    const now = this.ac.currentTime;
    // after a long stall (a throttled background tab), skip ahead instead of
    // firing a burst of late notes all at once
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.03;
    while (this.nextTime < now + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const i = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];

    // lead + echo
    for (const n of LEAD_NOTES) {
      if (n.step === step) {
        this.tone(hz(n.midi), t, n.len * STEP * 0.92, 0.085, this.wide, n.len >= 3);
        this.tone(hz(n.midi), t + 3 * STEP, n.len * STEP * 0.8, 0.025, this.thin, false);
      }
    }

    // arpeggio: chord tones, one per sixteenth
    const third = chord.minor ? 3 : 4;
    const arp = [0, third, 7, 12][i % 4];
    this.tone(hz(chord.root + 24 + arp), t, STEP * 0.8, bar < 4 ? 0.018 : 0.028, this.thin, false);

    // bass: an octave bounce on every eighth note
    if (i % 2 === 0) {
      this.tone(hz(chord.root + BASS[i / 2]), t, STEP * 1.6, 0.2, 'triangle', false);
    }

    // drums
    if (KICK[i] === 'x') this.kick(t);
    const snare = bar === LEAD.length - 1 ? SNARE_FILL : SNARE;
    if (snare[i] === 'x') this.snare(t, i > 12 ? 0.14 : 0.2);
    if (HAT[i] === 'x') this.hat(t);
  }

  private tone(freq: number, t: number, dur: number, vol: number, wave: PeriodicWave | OscillatorType, vibrato: boolean) {
    const bus = this.bus;
    if (!bus) return;
    const ac = this.ac;
    const osc = ac.createOscillator();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vibrato) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 6;
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.008, t + 0.25);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
    const bus = this.bus;
    if (!bus) return;
    const src = this.ac.createBufferSource();
    src.buffer = this.noise;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  private kick(t: number) {
    const bus = this.bus;
    if (!bus) return;
    const osc = this.ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private snare(t: number, vol: number) {
    this.noiseHit(t, 0.13, vol, 'highpass', 1300);
    const bus = this.bus;
    if (!bus) return;
    const osc = this.ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  private hat(t: number) {
    this.noiseHit(t, 0.035, 0.06, 'highpass', 7000);
  }
}
