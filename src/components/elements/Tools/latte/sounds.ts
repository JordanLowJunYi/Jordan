// Latte's noises, synthesised live on the arcade's shared AudioContext.
// Everything checks the global mute first.
import { arp, audioContext, isMuted, tone } from '../arcade';

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

function noise(ac: AudioContext) {
  let buf = noiseCache.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ac, buf);
  }
  return buf;
}

/** The happy "wheek": three rising whistles, each a little higher. */
export function wheek() {
  [0, 0.15, 0.32].forEach((d, i) => {
    tone(1150 + i * 160, 0.12 + i * 0.03, { type: 'sine', volume: 0.07, delay: d, slideTo: 1900 + i * 260 });
    tone(2300 + i * 320, 0.1 + i * 0.03, { type: 'square', volume: 0.012, delay: d, slideTo: 3800 + i * 500 });
  });
}

/** Low contented purr: a buzzy rumble that flutters. */
export function purr(duration = 0.9) {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(62, t0);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.09, t0 + 0.08);
  amp.gain.setValueAtTime(0.09, t0 + duration - 0.2);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  // flutter: an LFO wobbling the gain
  const lfo = ac.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 24;
  const depth = ac.createGain();
  depth.gain.value = 0.45;
  const flutter = ac.createGain();
  flutter.gain.value = 0.55;
  lfo.connect(depth).connect(flutter.gain);
  osc.connect(lp).connect(flutter).connect(amp).connect(ac.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + duration + 0.05);
  lfo.stop(t0 + duration + 0.05);
}

/** One crunchy bite: a short band-passed noise burst. */
function crunch(ac: AudioContext, at: number, vol = 0.22) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800 + Math.random() * 1600;
  bp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at, Math.random() * 0.5, 0.09);
}

export function munch(bites = 5, gap = 0.2) {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  for (let i = 0; i < bites; i++) crunch(ac, ac.currentTime + i * gap + Math.random() * 0.03);
}

export const boing = () => tone(240, 0.14, { type: 'square', volume: 0.045, slideTo: 640 });
export const thump = () => tone(110, 0.14, { type: 'triangle', volume: 0.14, slideTo: 50 });
export const sparkle = () => arp([1319, 1568, 2093, 2637, 3136], 0.05, { type: 'triangle', volume: 0.05 });
export const lullaby = () => arp([784, 659, 523, 392, 330], 0.2, { type: 'triangle', volume: 0.06 });
export const yawn = () => tone(620, 0.55, { type: 'triangle', volume: 0.05, slideTo: 280 });
export const sniff = () => {
  tone(1500, 0.03, { type: 'triangle', volume: 0.03 });
  tone(1700, 0.03, { type: 'triangle', volume: 0.03, delay: 0.08 });
};
export const tummy = () => {
  tone(150, 0.25, { type: 'triangle', volume: 0.1, slideTo: 95 });
  tone(130, 0.3, { type: 'triangle', volume: 0.1, slideTo: 70, delay: 0.28 });
};
export const sadSqueak = () => tone(900, 0.3, { type: 'sine', volume: 0.04, slideTo: 640 });
