// Room artwork, drawn with plain rectangles on a low-resolution canvas
// (320×192 for the study, 576×192 for the hall) that the game scales up.
// Static scenery is painted once per room into an offscreen canvas; the
// animated bits (fire, radio notes, Latte) are drawn every frame.

type Ctx = CanvasRenderingContext2D;

function r(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

// Tiny deterministic random so the scenery looks the same every visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BOOK_COLOURS = ['#f472b6', '#22d3ee', '#fbbf24', '#4ade80', '#a78bfa', '#f87171', '#f5efe2', '#60a5fa'];

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function woodFloor(g: Ctx, x0: number, y0: number, w: number, h: number, seed: number) {
  const rand = rng(seed);
  for (let y = y0; y < y0 + h; y += 8) {
    const row = (y - y0) / 8;
    r(g, x0, y, w, 8, row % 2 ? '#c48a57' : '#cd955f');
    r(g, x0, y + 7, w, 1, '#9a6236');
    // plank seams, staggered per row
    let x = x0 - Math.floor(rand() * 40);
    while (x < x0 + w) {
      x += 32 + Math.floor(rand() * 24);
      if (x > x0 && x < x0 + w) r(g, x, y, 1, 7, '#9a6236');
    }
    // a few grain flecks
    for (let i = 0; i < w / 24; i++) r(g, x0 + Math.floor(rand() * w), y + 2 + Math.floor(rand() * 4), 3, 1, '#b97d4b');
  }
}

function sideWall(g: Ctx, x: number, top: number, bottom: number, doorY?: number) {
  r(g, x, top, 16, bottom - top, '#4b3148');
  r(g, x + (x === 0 ? 14 : 0), top, 2, bottom - top, '#6b4a66');
  if (doorY !== undefined) {
    // doorway: floor shows through, wooden frame either side
    r(g, x, doorY, 16, 32, '#b97d4b');
    r(g, x, doorY - 3, 16, 3, '#7a4e33');
    r(g, x, doorY + 32, 16, 3, '#7a4e33');
    r(g, x + (x === 0 ? 0 : 12), doorY, 4, 32, '#a77246');
  }
}

function frontWall(g: Ctx, y: number, w: number, h: number) {
  r(g, 0, y, w, h, '#2a1f2e');
  r(g, 0, y, w, 2, '#4b3148');
}

// ---------------------------------------------------------------------------
// The study (320×192)
// ---------------------------------------------------------------------------
export const STUDY_W = 320;
export const STUDY_H = 192;

export function paintStudy(g: Ctx, opts: { plantFull: boolean }) {
  const rand = rng(7);
  // back wall: cream wallpaper with stripes, dark ceiling edge, skirting
  r(g, 0, 0, STUDY_W, 48, '#f1dfbd');
  for (let x = 4; x < STUDY_W; x += 10) r(g, x, 4, 2, 40, '#e6cfa6');
  for (let x = 9; x < STUDY_W; x += 20) for (let y = 10; y < 40; y += 10) r(g, x, y, 1, 1, '#d9bd8c');
  r(g, 0, 0, STUDY_W, 4, '#3b2a3f');
  r(g, 0, 42, STUDY_W, 6, '#8a5a3b');
  r(g, 0, 42, STUDY_W, 1, '#a8744f');

  woodFloor(g, 0, 48, STUDY_W, 128, 11);
  frontWall(g, 176, STUDY_W, 16);
  sideWall(g, 0, 0, 176);
  sideWall(g, 304, 0, 176, 96);

  // exit doorway in the front wall + doormat
  r(g, 144, 176, 32, 16, '#140f1a');
  r(g, 142, 176, 2, 16, '#7a4e33');
  r(g, 176, 176, 2, 16, '#7a4e33');
  r(g, 146, 166, 28, 9, '#6b4f3a');
  for (let x = 148; x < 172; x += 3) r(g, x, 167, 1, 7, '#584032');

  // rug
  r(g, 96, 92, 112, 56, '#f5c542');
  r(g, 98, 94, 108, 52, '#b8336a');
  r(g, 102, 98, 100, 44, '#d9558f');
  for (let x = 108; x < 200; x += 12) {
    r(g, x, 104, 6, 2, '#f5c542');
    r(g, x + 3, 134, 6, 2, '#f5c542');
  }
  r(g, 146, 116, 12, 8, '#f5c542');

  // bookshelf (32..80 × 8..64)
  r(g, 31, 7, 50, 58, '#3b2416');
  r(g, 32, 8, 48, 56, '#6b4226');
  for (let s = 0; s < 3; s++) {
    const sy = 12 + s * 17;
    r(g, 35, sy, 42, 14, '#3d2517');
    let bx = 36;
    while (bx < 75) {
      const bw = 3 + Math.floor(rand() * 3);
      const bh = 9 + Math.floor(rand() * 5);
      const col = BOOK_COLOURS[Math.floor(rand() * BOOK_COLOURS.length)];
      if (bx + bw > 76) break;
      r(g, bx, sy + 14 - bh, bw, bh, col);
      r(g, bx, sy + 14 - bh + 2, bw, 1, 'rgba(0,0,0,0.25)');
      bx += bw + (rand() < 0.15 ? 2 : 0);
    }
    r(g, 34, sy + 14, 44, 3, '#8a5a3b');
  }

  // fireplace (128..176 × 16..60): stone surround, mantel, firebox
  r(g, 128, 22, 48, 38, '#9c8f99');
  for (let y = 22; y < 60; y += 5) {
    r(g, 128, y + 4, 48, 1, '#7d7180');
    for (let x = 128 + ((y / 5) % 2) * 6; x < 176; x += 12) r(g, x, y, 1, 4, '#7d7180');
  }
  r(g, 124, 16, 56, 6, '#6b4226');
  r(g, 124, 16, 56, 1, '#8a5a3b');
  r(g, 140, 32, 24, 28, '#1b1220');
  r(g, 138, 30, 28, 2, '#5f5468');
  // things on the mantel: a framed photo and a tiny pot
  r(g, 132, 8, 10, 8, '#c9a227');
  r(g, 134, 10, 6, 4, '#7ec8e3');
  r(g, 162, 10, 6, 6, '#b45309');
  r(g, 163, 6, 4, 4, '#4ade80');
  // logs
  r(g, 144, 54, 16, 4, '#6b3f22');
  r(g, 146, 51, 12, 3, '#7c4a28');

  // window (200..240 × 10..36) with curtains
  r(g, 198, 8, 44, 30, '#7a4e33');
  r(g, 201, 11, 38, 24, '#7ec8e3');
  r(g, 201, 11, 38, 8, '#a7dcf0');
  r(g, 219, 11, 2, 24, '#7a4e33');
  r(g, 201, 22, 38, 2, '#7a4e33');
  for (let i = 0; i < 9; i++) r(g, 203 + Math.floor(rand() * 34), 12 + Math.floor(rand() * 18), 1, 3, '#d7eef7');
  r(g, 194, 6, 6, 34, '#b8336a');
  r(g, 240, 6, 6, 34, '#b8336a');
  r(g, 194, 6, 52, 3, '#8a5a3b');

  // desk + computer (248..296 × 30..72)
  r(g, 246, 50, 52, 6, '#8a5a3b');
  r(g, 246, 50, 52, 1, '#a8744f');
  r(g, 249, 56, 4, 16, '#6b4226');
  r(g, 291, 56, 4, 16, '#6b4226');
  r(g, 256, 28, 30, 20, '#1b1626'); // monitor
  r(g, 258, 30, 26, 15, '#0b2b33');
  for (let i = 0; i < 5; i++) {
    r(g, 260 + (i % 2) * 3, 32 + i * 3, 8 + Math.floor(rand() * 12), 1, i % 2 ? '#22d3ee' : '#4ade80');
  }
  r(g, 269, 48, 4, 2, '#1b1626');
  r(g, 262, 50, 18, 3, '#2d2a3a'); // keyboard
  r(g, 286, 44, 6, 6, '#f5efe2'); // mug
  r(g, 292, 46, 2, 2, '#f5efe2');
  // chair
  r(g, 264, 60, 16, 4, '#7c3aed');
  r(g, 266, 64, 12, 8, '#6d28d9');
  r(g, 270, 72, 4, 3, '#2d2a3a');

  // table + notebook (112..192 × 100..136)
  r(g, 114, 104, 76, 26, '#6b4226');
  r(g, 112, 102, 80, 24, '#9a6a40');
  r(g, 112, 102, 80, 2, '#b98a5c');
  r(g, 118, 126, 4, 10, '#6b4226');
  r(g, 182, 126, 4, 10, '#6b4226');
  r(g, 136, 106, 30, 16, '#fbf3ea'); // open notebook
  r(g, 150, 106, 1, 16, '#d6c7b5');
  for (let y = 109; y < 120; y += 3) {
    r(g, 139, y, 9, 1, '#9aa5c4');
    r(g, 153, y, 10, 1, '#9aa5c4');
  }
  r(g, 154, 110, 6, 5, '#f472b6'); // a sketch
  r(g, 172, 108, 2, 10, '#fbbf24'); // pencil
  // chairs either side
  r(g, 100, 108, 10, 18, '#7a4e33');
  r(g, 194, 108, 10, 18, '#7a4e33');

  // lettuce planter (bottom-left)
  r(g, 24, 160, 22, 14, '#b45309');
  r(g, 24, 160, 22, 2, '#d97706');
  r(g, 26, 172, 18, 2, '#92400e');
  const leaves = opts.plantFull ? 5 : 2;
  for (let i = 0; i < leaves; i++) {
    const lx = 26 + i * 4;
    r(g, lx, 150 + (i % 2) * 2, 6, 10, '#22c55e');
    r(g, lx + 1, 151 + (i % 2) * 2, 4, 3, '#86efac');
    r(g, lx + 2, 154, 1, 6, '#15803d');
  }

  // floor lamp in the corner (decor)
  r(g, 290, 140, 10, 3, '#2d2a3a');
  r(g, 294, 100, 2, 40, '#2d2a3a');
  r(g, 287, 92, 16, 9, '#fbbf24');
  r(g, 287, 92, 16, 2, '#fde68a');
}

/** Flickering fire inside the fireplace (lit only). */
export function drawFire(g: Ctx, t: number) {
  const flick = (n: number) => Math.round(Math.sin(t * 9 + n) * 1.5 + Math.sin(t * 13 + n * 2));
  r(g, 144, 46 + flick(1), 16, 8 - flick(1), '#f97316');
  r(g, 146, 40 + flick(2), 5, 12, '#fbbf24');
  r(g, 152, 38 + flick(3), 6, 14, '#fb923c');
  r(g, 148, 44 + flick(4), 8, 8, '#fde68a');
  r(g, 151, 34 + flick(5), 2, 4, '#fbbf24');
}

// ---------------------------------------------------------------------------
// The hall (576×192)
// ---------------------------------------------------------------------------
export const HALL_W = 576;
export const HALL_H = 192;

export function paintHall(g: Ctx) {
  const rand = rng(23);
  // lavender wallpaper with a little diamond pattern
  r(g, 0, 0, HALL_W, 56, '#e9dff5');
  for (let x = 0; x < HALL_W; x += 12) {
    for (let y = 8; y < 50; y += 12) {
      r(g, x + 5, y, 2, 1, '#cdb9e6');
      r(g, x + 4, y + 1, 4, 1, '#cdb9e6');
      r(g, x + 5, y + 2, 2, 1, '#cdb9e6');
    }
  }
  r(g, 0, 0, HALL_W, 4, '#3b2a3f');
  r(g, 0, 30, HALL_W, 2, '#d6c4ec'); // picture rail
  r(g, 0, 50, HALL_W, 6, '#8a5a3b');
  r(g, 0, 50, HALL_W, 1, '#a8744f');

  // checked floor
  for (let y = 56; y < 152; y += 16) {
    for (let x = 0; x < HALL_W; x += 16) {
      const dark = ((x + y) / 16) % 2 === 0;
      r(g, x, y, 16, 16, dark ? '#c9a77c' : '#d8bb92');
      r(g, x, y + 15, 16, 1, '#b08d62');
      r(g, x + 15, y, 1, 16, '#b08d62');
    }
  }
  // runner carpet down the middle
  r(g, 16, 100, HALL_W - 32, 24, '#3f6c8f');
  r(g, 16, 100, HALL_W - 32, 2, '#f5c542');
  r(g, 16, 122, HALL_W - 32, 2, '#f5c542');
  for (let x = 24; x < HALL_W - 24; x += 16) r(g, x, 110, 6, 4, '#5b8db5');

  frontWall(g, 152, HALL_W, 40);
  sideWall(g, 0, 0, 152, 96);
  sideWall(g, HALL_W - 16, 0, 152);

  // framed letters (48..88 × 12..40)
  r(g, 46, 10, 44, 32, '#c9a227');
  r(g, 48, 12, 40, 28, '#3b2a3f');
  for (let i = 0; i < 3; i++) {
    const lx = 51 + i * 12;
    r(g, lx, 15, 10, 22, '#fbf3ea');
    for (let y = 18; y < 34; y += 3) r(g, lx + 1, y, 6 + Math.floor(rand() * 3), 1, '#9aa5c4');
    r(g, lx + 6, 33, 3, 2, i === 0 ? '#ef4444' : i === 1 ? '#22c55e' : '#3b82f6');
  }

  // trophy cabinet (112..160 × 16..72)
  r(g, 110, 14, 52, 60, '#4a2c1a');
  r(g, 112, 16, 48, 56, '#6b4226');
  r(g, 115, 19, 42, 48, '#bfe6f0');
  r(g, 115, 19, 42, 48, 'rgba(255,255,255,0.15)');
  r(g, 115, 42, 42, 2, '#6b4226');
  // big cup
  r(g, 120, 24, 12, 8, '#fbbf24');
  r(g, 118, 25, 2, 5, '#f59e0b');
  r(g, 132, 25, 2, 5, '#f59e0b');
  r(g, 124, 32, 4, 4, '#f59e0b');
  r(g, 121, 36, 10, 3, '#b45309');
  // medals and a plaque
  r(g, 140, 26, 6, 6, '#cbd5e1');
  r(g, 142, 22, 2, 4, '#3b82f6');
  r(g, 148, 28, 6, 6, '#d97706');
  r(g, 150, 24, 2, 4, '#ef4444');
  r(g, 120, 50, 14, 12, '#8a5a3b');
  r(g, 122, 52, 10, 3, '#fbbf24');
  r(g, 140, 48, 6, 14, '#fbbf24');
  r(g, 138, 60, 10, 3, '#b45309');
  r(g, 150, 52, 4, 10, '#e5e7eb');
  r(g, 112, 70, 48, 2, '#3b2416');

  // heart frame of photos (192..224 × 12..40)
  const heart = [
    '..xxx...xxx..',
    '.xxxxx.xxxxx.',
    'xxxxxxxxxxxxx',
    'xxxxxxxxxxxxx',
    '.xxxxxxxxxxx.',
    '..xxxxxxxxx..',
    '...xxxxxxx...',
    '....xxxxx....',
    '.....xxx.....',
    '......x......',
  ];
  heart.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'x') r(g, 194 + x * 2, 12 + y * 2.6, 2, 3, '#e11d74');
  });
  const photos = ['#7ec8e3', '#86efac', '#fde68a', '#c4b5fd', '#fca5a5'];
  photos.forEach((c, i) => r(g, 199 + (i % 3) * 6 + (i > 2 ? 3 : 0), 17 + Math.floor(i / 3) * 7, 5, 5, c));

  // research poster (256..304 × 8..44)
  r(g, 254, 6, 52, 40, '#1b1626');
  r(g, 256, 8, 48, 36, '#fbf3ea');
  r(g, 256, 8, 48, 7, '#14b8a6');
  r(g, 260, 10, 26, 2, '#fbf3ea');
  r(g, 260, 19, 18, 12, '#fde7d4'); // arm sketch block
  r(g, 263, 23, 12, 4, '#e8b48a');
  r(g, 266, 21, 4, 2, '#94a3b8');
  r(g, 282, 19, 18, 12, '#e0f2f1'); // chart
  for (let i = 0; i < 4; i++) r(g, 284 + i * 4, 29 - (i + 1) * 2, 3, (i + 1) * 2, '#14b8a6');
  for (let y = 34; y < 42; y += 3) r(g, 260, y, 40, 1, '#9aa5c4');
  r(g, 296, 36, 6, 6, '#fbbf24'); // award sticker
  r(g, 298, 38, 2, 2, '#b45309');

  // Latte's pen (336..432 × 88..144): hay bedding, fence, hidey house, bottle
  r(g, 338, 90, 92, 52, '#e9d38a');
  for (let i = 0; i < 70; i++) {
    r(g, 340 + Math.floor(rand() * 86), 92 + Math.floor(rand() * 46), 4, 1, rand() < 0.5 ? '#d4b85c' : '#f3e2a5');
  }
  // fence posts and rails
  r(g, 336, 86, 96, 3, '#a0703f');
  r(g, 336, 142, 96, 3, '#a0703f');
  r(g, 334, 86, 3, 59, '#a0703f');
  r(g, 431, 86, 3, 59, '#a0703f');
  for (let x = 336; x <= 432; x += 12) {
    r(g, x, 82, 3, 8, '#7a4e33');
    r(g, x, 138, 3, 10, '#7a4e33');
  }
  // hidey house
  r(g, 404, 98, 22, 16, '#8a5a3b');
  r(g, 402, 94, 26, 6, '#b8336a');
  r(g, 410, 104, 10, 10, '#3b2416');
  // water bottle on the back fence
  r(g, 352, 70, 6, 16, '#bae6fd');
  r(g, 352, 70, 6, 3, '#38bdf8');
  r(g, 354, 86, 2, 6, '#94a3b8');
  // food bowl
  r(g, 346, 128, 12, 5, '#f472b6');
  r(g, 348, 127, 8, 2, '#4ade80');

  // side table with radio (480..512 × 40..72)
  r(g, 478, 56, 36, 5, '#6b4226');
  r(g, 482, 61, 3, 12, '#6b4226');
  r(g, 507, 61, 3, 12, '#6b4226');
  r(g, 482, 40, 28, 16, '#c2417e');
  r(g, 482, 40, 28, 2, '#e86aa6');
  r(g, 485, 44, 9, 9, '#2a1f2e');
  r(g, 498, 44, 9, 9, '#2a1f2e');
  r(g, 487, 46, 5, 5, '#5f5468');
  r(g, 500, 46, 5, 5, '#5f5468');
  r(g, 494, 42, 4, 2, '#fbbf24');
  r(g, 506, 30, 1, 10, '#94a3b8'); // antenna

  // potted plant (decor)
  r(g, 452, 136, 14, 12, '#b45309');
  r(g, 450, 120, 6, 16, '#22c55e');
  r(g, 456, 116, 6, 20, '#16a34a');
  r(g, 462, 122, 5, 14, '#22c55e');

  // mailbox (536..556 × 100..140)
  r(g, 544, 116, 4, 26, '#6b4226');
  r(g, 536, 100, 20, 16, '#3b82f6');
  r(g, 536, 100, 20, 3, '#60a5fa');
  r(g, 539, 106, 10, 2, '#1e3a8a');
  r(g, 556, 102, 2, 10, '#ef4444');
  r(g, 552, 102, 4, 3, '#ef4444');
}

/** Little floating music notes over the radio while it plays. */
export function drawRadioNotes(g: Ctx, t: number, note: HTMLCanvasElement) {
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.6 + i / 3) % 1;
    const x = 492 + Math.sin(p * 6 + i) * 8 + i * 6;
    const y = 38 - p * 26;
    g.globalAlpha = 1 - p;
    g.drawImage(note, Math.round(x), Math.round(y));
  }
  g.globalAlpha = 1;
}

/**
 * Lighting for the study. Unlit: a dusky blue wash with soft light from the
 * window. Lit: warm, with a glow pulsing around the fireplace.
 */
export function drawStudyLight(g: Ctx, lit: boolean, t: number) {
  if (lit) {
    const pulse = 0.18 + Math.sin(t * 7) * 0.03;
    const grad = g.createRadialGradient(152, 52, 4, 152, 52, 150);
    grad.addColorStop(0, `rgba(255,170,80,${pulse + 0.1})`);
    grad.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, STUDY_W, STUDY_H);
    return;
  }
  g.fillStyle = 'rgba(14,10,38,0.55)';
  g.fillRect(0, 0, STUDY_W, STUDY_H);
  const win = g.createRadialGradient(220, 40, 2, 220, 60, 90);
  win.addColorStop(0, 'rgba(160,210,255,0.22)');
  win.addColorStop(1, 'rgba(160,210,255,0)');
  g.fillStyle = win;
  g.fillRect(120, 0, 200, 160);
}
