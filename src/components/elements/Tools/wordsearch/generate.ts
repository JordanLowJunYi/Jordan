// Word search generator and line helpers (pure, no React).

export interface Cell {
  r: number;
  c: number;
}

export interface Placement {
  word: string;
  start: Cell;
  end: Cell;
}

export interface Puzzle {
  size: number;
  /** row-major letters, size * size */
  letters: string[];
  placements: Placement[];
}

/** The 8 directions as [dRow, dCol]. */
export const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];

// Filler letters weighted roughly by English frequency, so the noise looks like
// real text and hidden words don't jump out between rows of Q, X and Z.
const FILL = 'EEEEEEEEEEEETTTTTTTTTAAAAAAAAOOOOOOOIIIIIIINNNNNNNSSSSSSRRRRRRHHHHHLLLLDDDDCCCUUUMMMFFPPGGWWYYBBVKJXQZ';

type Rand = () => number;

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tryPlace(grid: readonly string[], size: number, word: string, rand: Rand): Placement | null {
  const options: { r: number; c: number; dr: number; dc: number; overlap: number }[] = [];
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const er = r + dr * (word.length - 1);
        const ec = c + dc * (word.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let overlap = 0;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const g = grid[(r + dr * i) * size + (c + dc * i)];
          if (g === word[i]) overlap++;
          else if (g) {
            ok = false;
            break;
          }
        }
        // a word lying entirely on top of another isn't a real placement
        if (ok && overlap < word.length) options.push({ r, c, dr, dc, overlap });
      }
    }
  }
  if (!options.length) return null;
  // Usually take any spot; sometimes prefer a crossing, which makes the grid
  // denser and the hunt a bit trickier.
  const crossings = options.filter((o) => o.overlap > 0);
  const pool = crossings.length && rand() < 0.4 ? crossings : options;
  // Pick a direction first, so diagonals and backwards words turn up as often
  // as plain left-to-right ones (long words have far fewer diagonal spots).
  const dirs = [...new Set(pool.map((o) => o.dr * 3 + o.dc))];
  const dir = dirs[Math.floor(rand() * dirs.length)];
  const inDir = pool.filter((o) => o.dr * 3 + o.dc === dir);
  const o = inDir[Math.floor(rand() * inDir.length)];
  return { word, start: { r: o.r, c: o.c }, end: { r: o.r + o.dr * (word.length - 1), c: o.c + o.dc * (word.length - 1) } };
}

/** How many times `word` can be read (forwards, any of the 8 directions) in the grid. */
export function countOccurrences(letters: string[], size: number, word: string): number {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let i = 0;
        for (; i < word.length; i++) {
          const rr = r + dr * i;
          const cc = c + dc * i;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size || letters[rr * size + cc] !== word[i]) break;
        }
        if (i === word.length) n++;
      }
    }
  }
  // a palindrome is read twice from the same cells
  return word === [...word].reverse().join('') ? n / 2 : n;
}

/**
 * Build a fresh puzzle: `count` words from `pool` (only those that fit),
 * longest first, in any of the 8 directions with legal overlaps, then fill the
 * gaps with random letters so that no word appears twice.
 */
export function generate(size: number, pool: string[], count: number, rand: Rand = Math.random): Puzzle {
  const fits = pool.filter((w) => w.length <= size);
  let best: Puzzle | null = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = Array<string>(size * size).fill('');
    const order = shuffle(fits, rand);
    const picked = order.slice(0, count).sort((a, b) => b.length - a.length);
    const spare = order.slice(count);
    const placements: Placement[] = [];

    for (const first of picked) {
      let word: string | undefined = first;
      while (word) {
        const p = tryPlace(grid, size, word, rand);
        if (p) {
          writeWord(grid, size, p);
          placements.push(p);
          break;
        }
        word = spare.shift(); // swap in another word from the pack
      }
    }

    for (let fillTry = 0; fillTry < 30; fillTry++) {
      const letters = grid.map((g) => g || FILL[Math.floor(rand() * FILL.length)]);
      const unique = placements.every((p) => countOccurrences(letters, size, p.word) === 1);
      const puzzle: Puzzle = { size, letters, placements };
      if (unique) {
        if (placements.length === Math.min(count, fits.length)) return puzzle;
        if (!best || placements.length > best.placements.length) best = puzzle;
        break;
      }
    }
  }
  if (best) return best;
  // practically unreachable; still return something playable
  const grid = Array<string>(size * size).fill('');
  return { size, letters: grid.map(() => FILL[Math.floor(rand() * FILL.length)]), placements: [] };
}

function writeWord(grid: string[], size: number, p: Placement) {
  lineCells(p.start, p.end).forEach((cell, i) => {
    grid[cell.r * size + cell.c] = p.word[i];
  });
}

/** True if a and b lie on one of the 8 straight lines. */
export function aligned(a: Cell, b: Cell): boolean {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
}

/** Cells from a to b inclusive (they must be aligned). */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const n = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
  return Array.from({ length: n + 1 }, (_, i) => ({ r: a.r + dr * i, c: a.c + dc * i }));
}

const OCTANTS: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

/**
 * Snap a drag from cell `a` towards a point (in fractional cell units, y down)
 * onto the nearest of the 8 directions, clamped inside the grid.
 */
export function snapLine(a: Cell, fx: number, fy: number, size: number): Cell {
  const dx = fx - (a.c + 0.5);
  const dy = fy - (a.r + 0.5);
  if (Math.hypot(dx, dy) < 0.5) return a;
  const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const [sr, sc] = OCTANTS[oct];
  let len = sr && sc ? Math.round((Math.abs(dx) + Math.abs(dy)) / 2) : Math.round(Math.abs(sc ? dx : dy));
  while (len > 0) {
    const r = a.r + sr * len;
    const c = a.c + sc * len;
    if (r >= 0 && r < size && c >= 0 && c < size) break;
    len--;
  }
  return { r: a.r + sr * len, c: a.c + sc * len };
}
