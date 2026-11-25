// Latte's pixel sprite, built in code. Latte is a calico (tricolour) guinea
// pig in clean, unbrindled patches: a ginger head with a white blaze down the
// front of the face and a white muzzle, a white collar and belly, a black
// saddle over the back and a ginger rump, with dark eyes and pink ears' insides
// and feet. The sprite faces right and is redrawn from a few pose parameters,
// so every frame (idle, munching, hopping, sleeping, sad) shares one shape.

export const PAL = {
  o: '#22171a', // outline (near-black brown, so the black patch still reads)
  k: '#433839', // black fur, a soft charcoal
  K: '#2f2729', // black fur shadow
  n: '#665a5b', // black fur sheen
  r: '#e08a43', // ginger
  R: '#b8642c', // ginger shadow, and the ears
  y: '#f3ae6e', // ginger highlight
  w: '#fffaf2', // white
  W: '#e3d9cd', // white shadow
  L: '#f4efe8', // whiskers
  e: '#120c0e', // eye
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

  // ---- colour: calico patches ----
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !!region[y][x];
  // Patch edges wander a little, like real fur: a ginger rump, a round black
  // saddle over the back, and white everywhere else (collar, sides, belly).
  const rumpEdge = (y: number) => 7.5 + Math.sin(y * 0.8 + 0.5) * 1.2;
  const bellyLine = (x: number) => 19.5 + Math.sin(x * 0.7) * 0.9;
  const inSaddle = (x: number, y: number) => {
    const dx = (x + 0.5 - 12.5) / 6;
    const dy = (y + 0.5 - cyB + ryB * 0.45) / (ryB * 0.75);
    return dx * dx + dy * dy <= 1 + 0.18 * Math.sin(x * 1.3 + y * 0.7);
  };
  const patchAt = (x: number, y: number): 'k' | 'r' | 'w' => {
    if (x >= 5 && y >= bellyLine(x)) return 'w';
    if (inSaddle(x, y)) return 'k';
    if (x < rumpEdge(y)) return 'r';
    return 'w';
  };
  const SHADES = { k: ['n', 'k', 'K'], r: ['y', 'r', 'R'], w: ['w', 'w', 'W'] } as const; // light, base, shadow
  // the front edge of the face on each row, for the blaze
  const faceFront = region.map((row) => row.reduce((m, r, x) => (r === 'head' ? x : m), -1));
  const lowBody = cyB + ryB * 0.35;
  // white fur with a light, sparse shadow low down
  const whiteFur = (x: number, y: number): Px => (y >= 22 && (x + 2 * y) % 3 === 0 ? 'W' : 'w');

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = region[y][x];
      if (!r) continue;
      let c: Px;
      if (r === 'feet') {
        c = 'p';
      } else if (r === 'head') {
        // white blaze from the crown down the front of the face, white muzzle,
        // and white where the back of the head meets the collar
        const blaze = x >= faceFront[y] - 1 || (y === headTop && x >= 26) || (y >= cyH + 1 && x >= 26);
        const collar = x < 21 && y >= cyH - 1;
        if (blaze || collar) c = whiteFur(x, y);
        else if (y >= cyH + 1.5 + Math.max(0, 25 - x) * 0.35) c = whiteFur(x, y); // white throat, sloping back
        else c = !filled(x, y - 1) ? 'y' : 'r';
      } else if (r === 'chest') {
        c = whiteFur(x, y);
      } else {
        // the back and its long fringe take the colour of the patch above
        const patch = patchAt(x, r === 'fringe' ? 23 : y);
        const [light, base, shadow] = SHADES[patch];
        if (patch === 'w' && (r === 'fringe' || y >= 22)) c = whiteFur(x, y);
        else if (r === 'fringe' || y >= 22) c = (x + y) % 2 === 0 ? base : shadow;
        else if (!filled(x, y - 1)) c = light;
        else if (patch !== 'w' && y >= lowBody) c = shadow;
        else c = base;
        // a few glossy strands in the long coat
        const strand = (x + y) % 5 === 0 && (x - y + 40) % 6 < 3;
        if (r === 'body' && strand && y < lowBody && filled(x, y - 1)) c = light;
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
    ? ['.oooo.', 'oRRRpo', 'oRppRo', '.oooo.']
    : ['.ooo..', 'oRRRo.', 'oRppRo', 'oRRpRo', '.ooRo.'];
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
      set(eyeX - 1, eyeY - 1, 'R'); // brow tilted up at the back
      set(eyeX, eyeY, 'R');
      set(eyeX + 1, eyeY, 'R');
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
  set(noseX, noseY - 1, 'w');
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
