// Latte's cage, drawn pixel by pixel on a small canvas (SW x SH) that the
// page scales up crisply. Static parts are painted once to an offscreen
// canvas; moving parts (bedding, droppings, tunnel, particles) every frame.
import type { FoodId } from './content';

export const SW = 128;
export const SH = 80;
/** Floor row where Latte's feet (and everything else on the floor) stand. */
export const GROUND = 72;
export const HOME_X = 40;
export const FLOOR_TOP = 60;

// ---------- tiny helpers ----------

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Paint a pixel map: each character is a key into `pal`, '.' is transparent. */
export function drawMap(ctx: Ctx, rows: string[], pal: Record<string, string>, x: number, y: number) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]];
      if (c) px(ctx, x + i, y + j, c);
    }
  });
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ---------- 3x5 pixel font (just the letters the scene needs) ----------

const GLYPHS: Record<string, string[]> = {
  L: ['x..', 'x..', 'x..', 'x..', 'xxx'],
  A: ['.x.', 'x.x', 'xxx', 'x.x', 'x.x'],
  T: ['xxx', '.x.', '.x.', '.x.', '.x.'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'],
  Z: ['xxx', '..x', '.x.', 'x..', 'xxx'],
};

function glyph(ctx: Ctx, ch: string, x: number, y: number, c: string) {
  const g = GLYPHS[ch];
  if (g) drawMap(ctx, g, { x: c }, x, y);
}

// ---------- food pixel maps (shared with the menu icons) ----------

export const FOOD_PAL: Record<string, string> = {
  G: '#2f9e4a',
  g: '#7ed957',
  l: '#c8f29a',
  s: '#e9f7c6',
  R: '#e8413c',
  r: '#ff8f7f',
  d: '#a8242a',
  k: '#3f8f3a',
  y: '#f3d26b',
  Y: '#c99a2e',
  b: '#8a5a2b',
  O: '#f08a24',
  o: '#ffc069',
  e: '#3a2633',
};

export const FOOD_ICONS: Record<FoodId, string[]> = {
  lettuce: [
    '...GG....',
    '..GggG...',
    '.GgglgG..',
    '.GgglggG.',
    'GggglggG.',
    'GgglsggG.',
    '.GggsgG..',
    '..GgsG...',
    '....s....',
  ],
  pepper: [
    '....k....',
    '...kk....',
    '.RRkkRR..',
    'RrRRRRRR.',
    'RrRRRRRR.',
    'RrRRRRRd.',
    'RRRRRRRd.',
    '.RRRRRd..',
    '..RdRd...',
  ],
  hay: [
    'y.Y.y.Y.y',
    '.yYyYyYy.',
    'yYyYyYyYy',
    '.yYyYyYy.',
    '.bbbbbbb.',
    '.yYyYyYy.',
    'yYyYyYyYy',
    '.yYyYyYy.',
    'Y.y.Y.y.Y',
  ],
  carrot: [
    '......k.k',
    '.....kkk.',
    '....OOk..',
    '...OoOO..',
    '..OoOO...',
    '..OoO....',
    '.OOO.....',
    '.OO......',
    'O........',
  ],
};

// small bites held in Latte's mouth while munching
const BITES: Record<FoodId, string[]> = {
  lettuce: ['.GG..', 'GgGG.', 'GglgG', '.GlG.', '..s..'],
  pepper: ['..k..', '.RRR.', 'RrRRR', 'RRRRd', '.RRd.'],
  hay: ['y....', '.yY..', '..yy.', '...Yy', '....y'],
  carrot: ['....k', '...Ok', '..OO.', '.oO..', 'OO...'],
};

export function drawBite(ctx: Ctx, food: FoodId, x: number, y: number, left: number) {
  // `left` (1 → 0) is how much is still uneaten; eat it from the mouth side
  const rows = BITES[food];
  const keep = Math.max(1, Math.ceil(rows[0].length * left));
  drawMap(
    ctx,
    rows.map((r) => r.slice(0, keep)),
    FOOD_PAL,
    x + rows[0].length - keep,
    y,
  );
}

// ---------- static room + cage ----------

const C = {
  wall: '#2a2042',
  wallDot: '#3a2f5a',
  bar: '#463b68',
  barHi: '#5d5187',
  rail: '#8d80b8',
  railHi: '#b9aee0',
  wood: '#b37b49',
  woodDk: '#8a5731',
  woodHi: '#d29a62',
  roof: '#7c3f2b',
  roofHi: '#a3553a',
  roofDk: '#58291b',
  door: '#1a1020',
  tray: '#c75b8e',
  trayHi: '#ec8db8',
  trayDk: '#8f3d66',
  outline: '#1b1326',
};

let staticCache: { day: HTMLCanvasElement; night: HTMLCanvasElement } | null = null;

function drawWindow(ctx: Ctx, night: boolean) {
  const x = 6;
  const y = 5;
  const w = 24;
  const h = 17;
  px(ctx, x - 1, y - 1, C.outline, w + 2, h + 2);
  px(ctx, x, y, '#7a5c3e', w, h);
  const sx = x + 2;
  const sy = y + 2;
  const sw = w - 4;
  const sh = h - 4;
  for (let j = 0; j < sh; j++) {
    px(ctx, sx, sy + j, night ? mix('#0e1033', '#26245e', j / sh) : mix('#6cc4ff', '#cdeeff', j / sh), sw, 1);
  }
  if (night) {
    drawMap(ctx, ['.yy.', 'y...', 'y...', '.yy.'], { y: '#fff1b8' }, sx + 13, sy + 2);
    for (const [a, b] of [
      [3, 2],
      [7, 8],
      [2, 10],
      [16, 9],
      [10, 4],
    ])
      px(ctx, sx + a, sy + b, '#e9e4ff');
  } else {
    drawMap(ctx, ['..ww....', '.wwww.ww', 'wwwwwwww'], { w: '#ffffff' }, sx + 2, sy + 3);
    drawMap(ctx, ['.ww..', 'wwwww'], { w: '#f3fbff' }, sx + 12, sy + 8);
    px(ctx, sx + 15, sy + 1, '#fff2a8', 3, 3);
  }
  // mullions and sill
  px(ctx, x + w / 2 - 1, sy, '#7a5c3e', 2, sh);
  px(ctx, sx, y + h / 2 - 1, '#7a5c3e', sw, 1);
  px(ctx, x - 3, y + h, C.outline, w + 6, 3);
  px(ctx, x - 2, y + h, '#9b744c', w + 4, 2);
}

function drawBunting(ctx: Ctx) {
  const x0 = 36;
  const x1 = 124;
  const sag = (x: number) => 2 + Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 3);
  for (let x = x0; x <= x1; x++) px(ctx, x, sag(x), '#d8cfe8');
  const colours = ['#f472b6', '#fbbf24', '#22d3ee', '#4ade80', '#a78bfa'];
  'LATTE'.split('').forEach((ch, i) => {
    const cx = 47 + i * 16;
    const top = sag(cx) + 1;
    const fw = 11;
    const fh = 12;
    for (let r = 0; r < fh; r++) {
      const half = (fw / 2) * (1 - r / fh);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half) - 1; x++) px(ctx, x, top + r, colours[i]);
    }
    // outline the flag's slanted edges for crispness
    for (let r = 0; r < fh; r++) {
      const half = (fw / 2) * (1 - r / fh);
      px(ctx, Math.round(cx - half) - 1, top + r, C.outline);
      px(ctx, Math.round(cx + half), top + r, C.outline);
    }
    px(ctx, cx - 1, top + fh, C.outline);
    glyph(ctx, ch, cx - 2, top + 1, '#1b1220');
  });
}

function drawCageBack(ctx: Ctx) {
  for (let x = 2; x < SW; x += 6) px(ctx, x, 28, C.bar, 1, FLOOR_TOP - 28);
  for (let y = 34; y < FLOOR_TOP; y += 6) px(ctx, 0, y, C.bar, SW, 1);
  for (let x = 2; x < SW; x += 6) for (let y = 34; y < FLOOR_TOP; y += 6) px(ctx, x, y, C.barHi);
  px(ctx, 0, 26, C.outline, SW, 3);
  px(ctx, 0, 27, C.rail, SW, 1);
  px(ctx, 0, 26, C.railHi, SW, 1);
}

function drawHouse(ctx: Ctx) {
  const x0 = 6;
  const x1 = 34;
  const wallTop = 48;
  // walls
  px(ctx, x0 - 1, wallTop, C.outline, x1 - x0 + 3, GROUND - wallTop + 1);
  px(ctx, x0, wallTop, C.wood, x1 - x0 + 1, GROUND - wallTop);
  for (let y = wallTop + 3; y < GROUND; y += 4) px(ctx, x0, y, C.woodDk, x1 - x0 + 1, 1);
  for (let y = wallTop + 1; y < GROUND; y += 4) px(ctx, x0, y, C.woodHi, x1 - x0 + 1, 1);
  // arched doorway
  const door = ['..xxxxxx..', '.xxxxxxxx.', 'xxxxxxxxxx'];
  drawMap(ctx, door, { x: C.door }, 15, 55);
  px(ctx, 15, 58, C.door, 10, GROUND - 58);
  drawMap(ctx, ['..oooooo..', '.o......o.', 'o........o'], { o: C.woodDk }, 15, 54);
  // little heart over the door
  drawMap(ctx, ['p.p', 'ppp', '.p.'], { p: '#f472b6' }, 19, 50);
  // roof
  const apexX = 20;
  const apexY = 33;
  for (let y = apexY; y <= wallTop + 1; y++) {
    const half = Math.round((y - apexY) * 1.05) + 1;
    px(ctx, apexX - half - 1, y, C.outline, half * 2 + 3, 1);
    px(ctx, apexX - half, y, (y - apexY) % 3 === 0 ? C.roofHi : C.roof, half * 2 + 1, 1);
  }
  px(ctx, apexX - 18, wallTop + 1, C.roofDk, 37, 1);
}

function drawBottle(ctx: Ctx) {
  const x = 112;
  // hanger strap on the bars
  px(ctx, x - 1, 36, '#2b2140', 11, 3);
  px(ctx, x - 1, 37, '#9b8fc4', 11, 1);
  // bottle
  px(ctx, x, 29, C.outline, 9, 25);
  px(ctx, x + 1, 30, '#d9f0fb', 7, 23);
  px(ctx, x + 1, 39, '#4fb3e8', 7, 14);
  px(ctx, x + 1, 39, '#8fd3f5', 7, 1);
  px(ctx, x + 2, 31, '#ffffff', 1, 20);
  // cap
  px(ctx, x + 1, 27, C.outline, 7, 3);
  px(ctx, x + 2, 27, '#f472b6', 5, 2);
  // spout
  px(ctx, x + 3, 54, '#b9bccb', 3, 2);
  px(ctx, x + 2, 56, '#b9bccb', 2, 2);
  px(ctx, x + 1, 58, '#d9dbe6', 2, 2);
  px(ctx, x, 60, '#eeeef6', 2, 1);
}

function drawTrayFront(ctx: Ctx) {
  px(ctx, 0, GROUND + 1, C.outline, SW, 1);
  px(ctx, 0, GROUND + 2, C.trayHi, SW, 1);
  px(ctx, 0, GROUND + 3, C.tray, SW, SH - GROUND - 4);
  px(ctx, 0, SH - 1, C.trayDk, SW, 1);
  for (let x = 8; x < SW; x += 20) px(ctx, x, GROUND + 4, C.trayDk, 2, 1);
}

function makeStatic(night: boolean) {
  const cv = document.createElement('canvas');
  cv.width = SW;
  cv.height = SH;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  px(ctx, 0, 0, C.wall, SW, SH);
  for (let y = 4; y < 26; y += 8) for (let x = (y / 4) % 8; x < SW; x += 8) px(ctx, x, y, C.wallDot);
  drawWindow(ctx, night);
  drawBunting(ctx);
  drawCageBack(ctx);
  drawBottle(ctx);
  return cv;
}

export function staticLayer(night: boolean) {
  if (!staticCache) staticCache = { day: makeStatic(false), night: makeStatic(true) };
  return night ? staticCache.night : staticCache.day;
}

// ---------- floor ----------

const strands = (() => {
  const r = rng(7);
  return Array.from({ length: 150 }, () => ({
    x: Math.floor(r() * SW),
    y: FLOOR_TOP + 1 + Math.floor(r() * (GROUND - FLOOR_TOP)),
    len: 1 + Math.floor(r() * 3),
    light: r() < 0.5,
  }));
})();

export function drawFloor(ctx: Ctx, clean: number) {
  const dirt = 1 - clean / 100;
  px(ctx, 0, FLOOR_TOP, mix('#a88a4e', '#6f5d3c', dirt), SW, 1);
  px(ctx, 0, FLOOR_TOP + 1, mix('#dcb874', '#9a865c', dirt), SW, GROUND - FLOOR_TOP);
  const hi = mix('#f3d891', '#b5a175', dirt);
  const lo = mix('#b8914f', '#7c6a48', dirt);
  for (const s of strands) px(ctx, s.x, s.y, s.light ? hi : lo, s.len, 1);
}

export function drawHouseLayer(ctx: Ctx) {
  drawHouse(ctx);
}

export function drawTray(ctx: Ctx) {
  drawTrayFront(ctx);
}

export function drawHay(ctx: Ctx, amount: number) {
  const x0 = 96;
  const w = 28;
  const peak = 3 + Math.round(9 * Math.max(0.15, Math.min(1, amount)));
  const r = rng(11);
  for (let i = 0; i < w; i++) {
    const h = Math.round(Math.sin((i / (w - 1)) * Math.PI) * peak) + 1;
    px(ctx, x0 + i, GROUND - h, C.outline, 1, 1);
    for (let k = 0; k < h; k++) {
      const v = r();
      px(ctx, x0 + i, GROUND - h + 1 + k, v < 0.25 ? '#f6db85' : v < 0.45 ? '#b8902f' : '#e3bd55');
    }
  }
  // a few strands poking out
  for (const [dx, dy] of [
    [6, -3],
    [12, -1],
    [18, -2],
    [22, 0],
  ]) {
    const hx = x0 + dx;
    const hy = GROUND - Math.round(Math.sin((dx / (w - 1)) * Math.PI) * peak) + dy;
    px(ctx, hx, hy, '#f6db85', 1, 2);
  }
}

export function drawBowl(ctx: Ctx, food: FoodId | null) {
  const x = 80;
  const y = GROUND - 5;
  if (food) {
    const map = BITES[food];
    drawMap(ctx, map.slice(0, 3), FOOD_PAL, x + 2, y - 2);
    drawMap(ctx, map.slice(0, 3), FOOD_PAL, x + 7, y - 1);
  }
  drawMap(
    ctx,
    ['oooooooooooooo', 'owwwwwwwwwwwwo', '.ocCCCCCCCCco.', '..occcccccco..', '...oooooooo...'],
    { o: C.outline, w: '#ffffff', C: '#f6c1d6', c: '#e48ab0' },
    x,
    y,
  );
}

const DROPS = [
  [9, 70],
  [33, 65],
  [88, 63],
  [101, 72],
  [122, 66],
  [48, 62],
  [29, 71],
  [72, 63],
  [114, 70],
];

export function drawDroppings(ctx: Ctx, cleanliness: number, t: number, still: boolean) {
  const n = Math.min(DROPS.length, Math.round((100 - cleanliness) / 11));
  for (let i = 0; i < n; i++) {
    const [x, y] = DROPS[i];
    px(ctx, x, y, '#4a2e1c', 2, 1);
    px(ctx, x, y, '#6b4429');
    if (cleanliness < 30 && i % 2 === 0) {
      // wavy stink lines
      const phase = still ? 0 : Math.floor(t / 250) % 2;
      for (let k = 0; k < 4; k++) px(ctx, x + ((k + phase) % 2), y - 2 - k, 'rgba(155, 211, 106, 0.75)');
    }
  }
}

// ---------- play tunnel ----------

export const TUNNEL = { x0: 34, x1: 86, top: 46 };

export function drawTunnel(ctx: Ctx, dy: number, wobble: number) {
  const { x0, x1, top } = TUNNEL;
  const y0 = top + dy;
  const h = GROUND - top;
  px(ctx, x0, y0 - 1, C.outline, x1 - x0 + 1, h + 2);
  for (let x = x0 + 1; x < x1; x++) {
    const band = Math.floor((x - x0) / 3) % 2 === 0;
    const bump = wobble && (x + Math.floor(wobble)) % 7 === 0 ? 1 : 0;
    px(ctx, x, y0 + bump, band ? '#8b6fe0' : '#b9a3ff', 1, h - bump);
    px(ctx, x, y0 + bump, band ? '#b9a3ff' : '#e0d6ff', 1, 1);
    px(ctx, x, y0 + h - 2, band ? '#5d45a8' : '#7a62c8', 1, 2);
  }
  // openings at both ends
  for (const ex of [x0, x1 - 3]) {
    px(ctx, ex, y0 + 1, '#e0d6ff', 3, h - 1);
    px(ctx, ex + 1, y0 + 3, '#24163f', 1, h - 5);
  }
}

// ---------- particles ----------

export type ParticleKind = 'heart' | 'z' | 'spark' | 'crumb' | 'drip';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  colour?: string;
}

const HEART = ['.pp.pp.', 'pwppppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'];

export function drawParticle(ctx: Ctx, p: Particle, now: number) {
  const age = (now - p.born) / p.life;
  ctx.globalAlpha = age > 0.7 ? Math.max(0, 1 - (age - 0.7) / 0.3) : 1;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  switch (p.kind) {
    case 'heart':
      drawMap(ctx, HEART, { p: '#f472b6', w: '#ffd6ea' }, x - 3, y - 3);
      break;
    case 'z': {
      const big = age > 0.35;
      if (big) glyph(ctx, 'Z', x, y, '#cfe8ff');
      else drawMap(ctx, ['xx', '.x', 'xx'], { x: '#cfe8ff' }, x, y);
      break;
    }
    case 'spark': {
      const c = p.colour ?? '#fff6c2';
      const big = Math.floor((now - p.born) / 120) % 2 === 0;
      px(ctx, x, y, '#ffffff');
      px(ctx, x - 1, y, c);
      px(ctx, x + 1, y, c);
      px(ctx, x, y - 1, c);
      px(ctx, x, y + 1, c);
      if (big) {
        px(ctx, x - 2, y, c);
        px(ctx, x + 2, y, c);
        px(ctx, x, y - 2, c);
        px(ctx, x, y + 2, c);
      }
      break;
    }
    case 'crumb':
      px(ctx, x, y, p.colour ?? '#7ed957');
      break;
    case 'drip':
      px(ctx, x, y, '#8fd3f5', 1, 2);
      break;
  }
  ctx.globalAlpha = 1;
}
