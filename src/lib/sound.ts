// Soft interface sounds for the portfolio's menu, generated with the Web
// Audio API (there are no sound files). They share the site's AudioContext
// and its mute switch with the music and the arcade, and are quiet on
// purpose: a gentle tick for links, a two-note chime to open or close.
import { audioContext, isMuted } from '../components/elements/Tools/arcade/sfx';

export type UiSound = 'click' | 'open' | 'close';

/** One soft sine note that glides slightly in pitch and dies away quickly. */
function blip(ac: AudioContext, at: number, from: number, to: number, vol: number, len: number) {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + len + 0.02);
}

export function uiSound(kind: UiSound): void {
  if (isMuted()) return;
  try {
    const ac = audioContext(); // called from a click, so the browser allows it
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    if (kind === 'click') {
      blip(ac, t, 1320, 990, 0.035, 0.06);
    } else if (kind === 'open') {
      blip(ac, t, 659, 680, 0.03, 0.1); // E5, then up to B5
      blip(ac, t + 0.07, 988, 1010, 0.028, 0.16);
    } else {
      blip(ac, t, 988, 960, 0.03, 0.1); // B5, then down to E5
      blip(ac, t + 0.07, 659, 640, 0.028, 0.16);
    }
  } catch {
    /* sound is decorative: never let it break a click */
  }
}
