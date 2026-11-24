// Geometry, drawing and error text for the webcam piano. Only WebcamPiano
// imports this, so it ships in the lazily loaded webcam chunk.
import { isBlack, noteName, range } from './notes';

export interface CamKey {
  midi: number;
  x: number;
  y: number;
  w: number;
  h: number;
  black: boolean;
}

export interface Tip {
  id: string; // `${hand}:${finger}`
  x: number;
  y: number;
  hand: number;
}

/** Fingertip landmarks in MediaPipe Hands: thumb, index, middle, ring, little. */
export const FINGERTIPS = [4, 8, 12, 16, 20];

/** Keys laid across the lower middle of the frame, in canvas pixels. */
export function layoutKeys(width: number, height: number, octaves: 1 | 2): CamKey[] {
  const low = 60;
  const high = low + 12 * octaves; // finish on a C
  const notes = range(low, high);
  const whites = notes.filter((m) => !isBlack(m));
  const left = Math.round(width * 0.05);
  const keyW = Math.floor((width - left * 2) / whites.length);
  const x0 = Math.round((width - keyW * whites.length) / 2);
  const top = Math.round(height * 0.52);
  const whiteH = Math.round(height * 0.36);
  const blackH = Math.round(whiteH * 0.6);
  const blackW = Math.max(4, Math.round(keyW * 0.62));

  const keys: CamKey[] = [];
  let w = 0;
  notes.forEach((m) => {
    if (isBlack(m)) {
      keys.push({ midi: m, x: x0 + w * keyW - Math.round(blackW / 2), y: top, w: blackW, h: blackH, black: true });
    } else {
      keys.push({ midi: m, x: x0 + w * keyW, y: top, w: keyW, h: whiteH, black: false });
      w += 1;
    }
  });
  // Black keys first: they sit on top, so they win hit tests and draw last.
  return [...keys.filter((k) => k.black), ...keys.filter((k) => !k.black)];
}

export function keyAt(keys: CamKey[], x: number, y: number): number | null {
  const hit = keys.find((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h);
  return hit ? hit.midi : null;
}

const TIP_COLOURS = ['#f472b6', '#fbbf24'];

/** Pixel-style translucent keys and square fingertip markers. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  keys: CamKey[],
  lit: ReadonlySet<number>,
  tips: Tip[],
  showNames: boolean,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const border = Math.max(1, Math.round(width / 320));

  const box = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x + border, y + border, w - border * 2, h - border * 2);
  };

  const whites = keys.filter((k) => !k.black);
  const blacks = keys.filter((k) => k.black);
  ctx.globalAlpha = 1;
  whites.forEach((k) => {
    const on = lit.has(k.midi);
    box(k.x, k.y, k.w + border, k.h, on ? 'rgba(34, 211, 238, 0.75)' : 'rgba(245, 239, 226, 0.4)');
    // bottom lip, shorter when pressed
    ctx.fillStyle = on ? 'rgba(14, 116, 144, 0.8)' : 'rgba(207, 197, 176, 0.55)';
    const lip = Math.round(k.h * (on ? 0.03 : 0.07));
    ctx.fillRect(k.x + border, k.y + k.h - border - lip, k.w - border, lip);
  });
  blacks.forEach((k) => {
    const on = lit.has(k.midi);
    box(k.x, k.y, k.w, k.h, on ? 'rgba(34, 211, 238, 0.9)' : 'rgba(18, 15, 32, 0.72)');
  });

  if (showNames && whites.length) {
    // Cream-on-black name tags, like the letter chips on the on-screen keyboard.
    const size = Math.max(8, Math.round(whites[0].w * 0.4));
    ctx.font = `600 ${size}px "Pixelify Sans", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    whites.forEach((k) => {
      const label = noteName(k.midi);
      const tw = Math.ceil(ctx.measureText(label).width) + 4;
      const th = size + 2;
      const cx = Math.round(k.x + k.w / 2);
      const ty = Math.round(k.y + k.h - k.h * 0.1 - th);
      ctx.fillStyle = lit.has(k.midi) ? '#0e7490' : 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(cx - Math.ceil(tw / 2), ty, tw, th);
      ctx.fillStyle = '#f5efe2';
      ctx.fillText(label, cx, ty + th / 2 + 1);
    });
  }

  // Fingertips: chunky pixel squares with a dark outline.
  const s = Math.max(4, Math.round(width / 90));
  tips.forEach((t) => {
    const x = Math.round(t.x - s / 2);
    const y = Math.round(t.y - s / 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - border, y - border, s + border * 2, s + border * 2);
    ctx.fillStyle = TIP_COLOURS[t.hand % TIP_COLOURS.length];
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, Math.max(1, Math.round(s / 3)), Math.max(1, Math.round(s / 3)));
  });
}

export type CamProblem = 'insecure' | 'denied' | 'nocamera' | 'busy' | 'webgl' | 'model' | 'unknown';

export const PROBLEM_TEXT: Record<CamProblem, { lines: string[]; retry: boolean }> = {
  insecure: {
    lines: ["This browser won't share a camera here. It needs a secure (https) page and camera support."],
    retry: false,
  },
  denied: {
    lines: [
      'The camera was blocked, so I can’t see your hands.',
      'Allow camera access for this site in your browser settings, then try again.',
    ],
    retry: true,
  },
  nocamera: { lines: ['I couldn’t find a camera. Plug one in, or try a phone or laptop with one.'], retry: true },
  busy: { lines: ['Your camera seems busy in another app. Close that app, then try again.'], retry: true },
  webgl: {
    lines: [
      'Hand tracking needs WebGL, and this browser can’t start it.',
      'Try Chrome, Edge, Firefox or Safari with hardware acceleration turned on.',
    ],
    retry: false,
  },
  model: { lines: ['The hand-tracking model didn’t download. Check your connection and try again.'], retry: true },
  unknown: { lines: ['Something went wrong starting the camera. Try again?'], retry: true },
};

export class CamError extends Error {
  problem: CamProblem;
  constructor(problem: CamProblem) {
    super(problem);
    this.problem = problem;
  }
}

/** Turn a getUserMedia / TensorFlow failure into a friendly problem code. */
export function classify(err: unknown, stage: string): CamProblem {
  if (err instanceof CamError) return err.problem;
  const name = err instanceof Error || err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (stage === 'webgl') return 'webgl';
  if (stage === 'tf' || stage === 'model') return 'model';
  return 'unknown';
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // just probing: free it
    return !!gl;
  } catch {
    return false;
  }
}
