// Latte's pixel sprite, built in code. Latte is a long-haired guinea pig with
// an apricot-and-cream face, a white crest on the crown, dark eyes, and a fluffy
// lilac-grey body with pale cream tips. The sprite faces right and is redrawn
// from a few pose parameters, so every frame (idle, munching, hopping,
// sleeping, sad) shares one shape.

export const PAL = {
  o: '#3a2633', // outline (soft plum, not pure black)
  g: '#a3959c', // lilac-grey body
  G: '#7d7079', // body shadow
  d: '#625660', // deep shadow
  l: '#d3c8c6', // pale fur tips
  L: '#eee6df', // palest tips
  a: '#eab184', // apricot
  A: '#c88a5e', // dark apricot
  c: '#f7dfc4', // cream
  w: '#fffaf2', // white crest
  e: '#1d1420', // eye
  h: '#ffffff', // eye shine
  p: '#f19aa9', // pink (nose, feet, inner ear)
  b: '#f7b9c6', // blush
  P: '#b75773', // mouth
  t: '#7cc8f6', // tear
} as const;

export type Px = keyof typeof PAL;
export type Eyes = 'open' | 'blink' | 'happy' | 'sad' | 'closed';
export type Mouth = 'rest' | 'chew' | 'open';

export interface Pose {
  breath: 0 | 1; // body puffs up 1px on the in-breath
  eyes: Eyes;
  mouth: Mouth;
  dip: 0 | 1 | 2; // head lowered (eating, sad)
  stretch: -1 | 0 | 1; // -1 squashed (landing), 1 stretched (mid-hop)
  step: 0 | 1 | 2; // walking: feet positions
  blush: boolean;
  tear: boolean;
  flat: boolean; // sleepy loaf
  earDown: boolean;
}

export const IDLE: Pose = {
  breath: 0,
  eyes: 'open',
  mouth: 'rest',
  dip: 0,
  stretch: 0,
  step: 0,
  blush: false,
  tear: false,
  flat: false,
  earDown: false,
};

export const SPRITE_W = 40;
export const SPRITE_H = 28;
/** Row of the sprite that touches the floor (the outline under the feet). */
export const SPRITE_FOOT = 26;
/** Where the mouth is, relative to the sprite's top-left, for food and hearts. */
export const MOUTH = { x: 33, y: 16 };
export const HEAD_TOP = { x: 25, y: 8 };

type Grid = (Px | null)[][];

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

export function latteGrid(p: Pose): Grid {
  const W = SPRITE_W;
  const H = SPRITE_H;
  const grid: Grid = Array.from({ length: H }, () => Array<Px | null>(W).fill(null));
  const region: (string | null)[][] = Array.from({ length: H }, () => Array<string | null>(W).fill(null));

  // ---- shape ----
  const ryB = 9.5 + p.breath * 0.5 + p.stretch * 0.8 - (p.flat ? 1.5 : 0);
  const rxB = 12.5 - p.stretch * 0.7 + (p.flat ? 0.8 : 0);
  const cxB = 14;
  const cyB = 23.5 - ryB;
  const ryH = 7.5 + p.stretch * 0.3;
  const rxH = 8;
  const cxH = 25.5;
  const cyH = 15.5 + p.dip + (p.flat ? 1 : 0) - p.stretch * 0.5;
  const headTop = Math.ceil(cyH - ryH - 0.5);
  // apricot face and chest meet the grey coat on a slant: grey sweeps over
  // the crown behind the ear, apricot reaches back along the chest
  const seam = (y: number) => 21.5 - (y - 12) * 0.55;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inEllipse(x, y, cxH, cyH, rxH, ryH) && x >= 17) region[y][x] = 'head';
      else if (inEllipse(x, y, cxB, cyB, rxB, ryB)) region[y][x] = 'body';
    }
  }
  // chest and front legs, so the head doesn't float above the floor
  for (let y = 20; y <= 24; y++) {
    for (let x = 17; x <= 30; x++) {
      if (y === 24 && (x === 17 || x === 30)) continue;
      if (!region[y][x]) region[y][x] = 'chest';
    }
  }
  // long-haired skirt: shaggy strands hanging below the body
  for (let x = 3; x <= 25; x++) {
    if (region[23][x] !== 'body' && region[23][x] !== 'chest') continue;
    const len = 1 + ((x * 7) % 5 === 0 ? 1 : 0);
    for (let k = 1; k <= len; k++) if (23 + k < H - 1 && !region[23 + k][x]) region[23 + k][x] = 'fringe';
  }
  // fluffy tufts on the back
  const bodyTop = Math.ceil(cyB - ryB - 0.5);
  for (const x of [8, 13, 17]) {
    if (bodyTop - 1 >= 0 && region[bodyTop][x]) region[bodyTop - 1][x] = 'body';
  }
  // feet peeking out under the fur
  const front = p.step === 1 ? [27, 28] : p.step === 2 ? [24, 25] : [26, 27];
  const back = p.step === 1 ? [8, 9] : p.step === 2 ? [11, 12] : [9, 10];
  if (!p.flat) {
    for (const x of [...front, ...back]) region[25][x] = 'feet';
  }

  // ---- colour ----
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !!region[y][x];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = region[y][x];
      if (!r) continue;
      let c: Px = 'g';
      const apricot = x >= seam(y);
      const edge = Math.abs(x - seam(y)) < 1;
      if (r === 'fringe') {
        c = (x + y) % 2 === 0 ? 'L' : 'l';
      } else if (r === 'feet') {
        c = 'p';
      } else if (apricot && r !== 'body') {
        c = 'a';
        if (y >= cyH + 1 && x >= 26) c = 'c'; // cream muzzle and cheek
        if (r === 'chest' && x >= 21) c = y >= 23 ? ((x + y) % 2 === 0 ? 'l' : 'c') : 'c';
        if (y <= headTop + 1 && x >= 22 && x <= 29) c = 'w'; // white crest
        if (y === headTop + 2 && x >= 23 && x <= 28 && (x + y) % 2 === 0) c = 'w';
        if (y === headTop + 2 && x >= 29 && x <= 30) c = 'w';
        if (edge && (x + y) % 2 === 0) c = 'A';
      } else {
        // lilac-grey coat with long streaky strands and a shaded belly
        c = 'g';
        const low = y >= cyB + ryB * 0.3;
        if (low) c = 'G';
        if (y >= 22) c = (x + y) % 2 === 0 ? 'G' : 'd';
        const strand = (x + y) % 5;
        const dash = (x - y + 40) % 6 < 3;
        if (strand === 0 && dash && y < 22) c = low ? 'g' : 'l';
        if (strand === 2 && dash && y < 22 && !low) c = 'G';
        if (!filled(x, y - 1)) c = 'l';
        else if (!filled(x, y - 2) && x % 2 === 0) c = 'L';
        if (apricot) c = edge ? ((x + y) % 2 === 0 ? 'A' : c) : y > 17 ? 'a' : (x + y) % 2 === 0 ? 'a' : 'A';
      }
      grid[y][x] = c;
    }
  }

  // ---- outline (4-neighbour, so corners stay round) ----
  const outline: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (region[y][x]) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) outline.push([x, y]);
    }
  }
  for (const [x, y] of outline) grid[y][x] = 'o';

  // ---- ear: a soft petal at the back of the crown ----
  const ex = 18;
  const ey = headTop - 2 + (p.earDown ? 2 : 0);
  const ear = p.earDown
    ? ['.oooo.', 'oGGGpo', 'oGppGo', '.oooo.']
    : ['.ooo..', 'oGGGo.', 'oGppGo', 'oGGpGo', '.ooGo.'];
  ear.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const x = ex + i;
      const y = ey + j;
      if (ch === '.' || y < 0 || y >= H) return;
      grid[y][x] = ch as Px;
    });
  });

  // ---- face ----
  const eyeX = 27;
  const eyeY = Math.round(cyH) - 3;
  const set = (x: number, y: number, c: Px) => {
    if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c;
  };
  switch (p.eyes) {
    case 'open':
      set(eyeX, eyeY, 'h');
      set(eyeX + 1, eyeY, 'e');
      set(eyeX, eyeY + 1, 'e');
      set(eyeX + 1, eyeY + 1, 'e');
      set(eyeX, eyeY + 2, 'e');
      set(eyeX + 1, eyeY + 2, 'e');
      break;
    case 'sad':
      set(eyeX - 1, eyeY - 1, 'A'); // brow tilted up at the back
      set(eyeX, eyeY, 'A');
      set(eyeX + 1, eyeY, 'A');
      set(eyeX, eyeY + 1, 'h');
      set(eyeX + 1, eyeY + 1, 'e');
      set(eyeX, eyeY + 2, 'e');
      set(eyeX + 1, eyeY + 2, 'e');
      break;
    case 'happy':
      set(eyeX - 1, eyeY + 1, 'e');
      set(eyeX, eyeY, 'e');
      set(eyeX + 1, eyeY, 'e');
      set(eyeX + 2, eyeY + 1, 'e');
      break;
    case 'blink':
    case 'closed':
      set(eyeX - 1, eyeY + 1, 'e');
      set(eyeX, eyeY + 1, 'e');
      set(eyeX + 1, eyeY + 1, 'e');
      break;
  }
  if (p.tear) {
    set(eyeX - 1, eyeY + 3, 't');
    set(eyeX - 1, eyeY + 4, 't');
  }
  // nose at the front of the snout
  const noseY = Math.round(cyH) - 0;
  let noseX = 0;
  for (let x = W - 1; x >= 0; x--) {
    if (region[noseY][x] === 'head') {
      noseX = x;
      break;
    }
  }
  set(noseX, noseY, 'p');
  set(noseX, noseY - 1, 'c');
  if (p.blush) {
    set(eyeX + 1, eyeY + 4, 'b');
    set(eyeX + 2, eyeY + 4, 'b');
  }
  const mouthY = noseY + 2;
  if (p.mouth === 'rest') set(noseX - 1, mouthY, 'P');
  if (p.mouth === 'chew') {
    set(noseX - 1, mouthY, 'P');
    set(noseX, mouthY, 'P');
  }
  if (p.mouth === 'open') {
    set(noseX - 1, mouthY, 'P');
    set(noseX, mouthY, 'P');
    set(noseX - 1, mouthY + 1, 'P');
    set(noseX + 1, mouthY, 'o');
  }
  // whiskers
  set(noseX + 2, noseY, 'L');
  set(noseX + 3, noseY - 1, 'L');
  set(noseX + 2, noseY + 2, 'L');
  set(noseX + 3, noseY + 3, 'L');

  return grid;
}

// Cache each pose as a tiny canvas so the scene can blit it every frame.
const cache = new Map<string, HTMLCanvasElement>();

export function latteSprite(p: Pose): HTMLCanvasElement {
  const key = JSON.stringify(p);
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = SPRITE_W;
  cv.height = SPRITE_H;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const grid = latteGrid(p);
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (!c) return;
        ctx.fillStyle = PAL[c];
        ctx.fillRect(x, y, 1, 1);
      }),
    );
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, cv);
  return cv;
}
