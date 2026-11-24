// The radio's song: an original eight-bar chiptune loop in F major
// (F – Dm – B♭ – C, twice), played live with oscillators. A small look-ahead
// scheduler queues notes a little ahead of time so playback stays steady.
import { audioContext, isMuted } from '../arcade';

const BPM = 100;
const EIGHTH = 60 / BPM / 2;

// MIDI note numbers; 0 = rest/hold. Eight eighth-notes per bar.
const LEAD = [
  77, 0, 76, 77, 72, 0, 69, 0,
  74, 0, 72, 74, 69, 0, 65, 0,
  70, 72, 74, 77, 76, 0, 74, 0,
  72, 0, 74, 76, 79, 0, 76, 72,
  77, 0, 79, 81, 79, 77, 76, 77,
  74, 0, 72, 74, 77, 0, 74, 0,
  70, 0, 74, 72, 70, 69, 67, 0,
  72, 0, 67, 70, 69, 0, 65, 0,
];
// Bass: one note per quarter (root, fifth, octave, fifth) for each chord.
const CHORDS = [41, 38, 34, 36, 41, 38, 34, 36];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Song {
  start(): void;
  stop(): void;
  readonly playing: boolean;
}

export function createSong(): Song {
  let timer: number | null = null;
  let step = 0; // eighth-note index into the loop
  let nextTime = 0;
  let master: GainNode | null = null;

  function voice(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(master!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  function hat(ac: AudioContext, at: number, vol: number) {
    const len = Math.floor(ac.sampleRate * 0.03);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    const g = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(hp).connect(g).connect(master!);
    src.start(at);
  }

  function schedule() {
    const ac = audioContext();
    if (!ac || !master) return;
    master.gain.setTargetAtTime(isMuted() ? 0 : 1, ac.currentTime, 0.05);
    while (nextTime < ac.currentTime + 0.15) {
      const i = step % LEAD.length;
      const note = LEAD[i];
      if (note) {
        // hold the note through following rests
        let len = 1;
        while (len < 3 && LEAD[(i + len) % LEAD.length] === 0) len++;
        voice(ac, hz(note), nextTime, EIGHTH * len * 0.95, 'square', 0.035);
        voice(ac, hz(note + 12), nextTime, EIGHTH * 0.5, 'triangle', 0.012); // sparkle
      }
      if (i % 2 === 0) {
        const bar = Math.floor(i / 8);
        const beat = (i % 8) / 2; // 0..3
        const root = CHORDS[bar];
        const bass = [root, root + 7, root + 12, root + 7][beat];
        voice(ac, hz(bass), nextTime, EIGHTH * 1.8, 'triangle', 0.09);
      }
      hat(ac, nextTime, i % 2 === 0 ? 0.035 : 0.015);
      nextTime += EIGHTH;
      step++;
    }
  }

  return {
    get playing() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      const ac = audioContext();
      if (!ac) return;
      master = ac.createGain();
      master.gain.value = isMuted() ? 0 : 1;
      master.connect(ac.destination);
      step = 0;
      nextTime = ac.currentTime + 0.05;
      schedule();
      timer = window.setInterval(schedule, 40);
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      const ac = audioContext();
      if (ac && master) {
        const m = master;
        m.gain.setTargetAtTime(0, ac.currentTime, 0.03);
        window.setTimeout(() => m.disconnect(), 300);
      }
      master = null;
    },
  };
}
