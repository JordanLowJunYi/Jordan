// Pure 2048 rules. Tiles carry stable ids so the board can animate each one
// sliding to its new cell. A merge turns the two source tiles into "ghosts"
// (they finish sliding, then get pruned) and adds a fresh "merged" tile on top.

export const SIZE = 4;
export const WIN_VALUE = 2048;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type TileKind = 'new' | 'merged' | 'ghost';

export interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
  kind?: TileKind;
}

export interface SlideResult {
  tiles: Tile[];
  /** points scored by this move (sum of merged values) */
  gained: number;
  /** did anything change? A move that changes nothing doesn't count. */
  moved: boolean;
  /** largest value produced by a merge this move, 0 if none */
  biggestMerge: number;
}

export type IdSource = () => number;

/** Cell (row, col) of the k-th position along `line`, counted from the edge tiles slide towards. */
function cellOf(dir: Dir, line: number, k: number): [number, number] {
  switch (dir) {
    case 'left':
      return [line, k];
    case 'right':
      return [line, SIZE - 1 - k];
    case 'up':
      return [k, line];
    case 'down':
      return [SIZE - 1 - k, line];
  }
}

export function live(tiles: Tile[]): Tile[] {
  return tiles.filter((t) => t.kind !== 'ghost');
}

function gridOf(tiles: Tile[]): (Tile | undefined)[][] {
  const grid: (Tile | undefined)[][] = Array.from({ length: SIZE }, () => Array<Tile | undefined>(SIZE));
  for (const t of live(tiles)) grid[t.r][t.c] = t;
  return grid;
}

/** Slide every tile towards `dir`, merging equal neighbours once per move. */
export function slide(tiles: Tile[], dir: Dir, newId: IdSource): SlideResult {
  const grid = gridOf(tiles);
  const out: Tile[] = [];
  let gained = 0;
  let moved = false;
  let biggestMerge = 0;

  for (let line = 0; line < SIZE; line++) {
    let pos = 0;
    let open: Tile | null = null; // last placed tile that may still absorb a twin

    for (let k = 0; k < SIZE; k++) {
      const [r, c] = cellOf(dir, line, k);
      const t = grid[r][c];
      if (!t) continue;

      if (open && open.value === t.value) {
        const [mr, mc] = [open.r, open.c];
        open.kind = 'ghost';
        out.push({ ...t, r: mr, c: mc, kind: 'ghost' });
        const value = t.value * 2;
        out.push({ id: newId(), value, r: mr, c: mc, kind: 'merged' });
        gained += value;
        biggestMerge = Math.max(biggestMerge, value);
        moved = true;
        open = null;
      } else {
        const [nr, nc] = cellOf(dir, line, pos);
        if (nr !== t.r || nc !== t.c) moved = true;
        const placed: Tile = { id: t.id, value: t.value, r: nr, c: nc };
        out.push(placed);
        open = placed;
        pos++;
      }
    }
  }

  return { tiles: moved ? out : tiles, gained, moved, biggestMerge };
}

export function emptyCells(tiles: Tile[]): [number, number][] {
  const grid = gridOf(tiles);
  const cells: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) cells.push([r, c]);
  return cells;
}

/** Drop a new 2 (90%) or 4 (10%) into a random empty cell. */
export function spawn(tiles: Tile[], newId: IdSource, rand: () => number = Math.random): Tile[] {
  const empty = emptyCells(tiles);
  if (!empty.length) return tiles;
  const [r, c] = empty[Math.floor(rand() * empty.length)];
  return [...tiles, { id: newId(), value: rand() < 0.9 ? 2 : 4, r, c, kind: 'new' }];
}

export function canMove(tiles: Tile[]): boolean {
  const grid = gridOf(tiles);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t) return true;
      if (c + 1 < SIZE && grid[r][c + 1]?.value === t.value) return true;
      if (r + 1 < SIZE && grid[r + 1][c]?.value === t.value) return true;
    }
  }
  return false;
}

export function maxValue(tiles: Tile[]): number {
  return live(tiles).reduce((m, t) => Math.max(m, t.value), 0);
}

export function newBoard(newId: IdSource, rand: () => number = Math.random): Tile[] {
  return spawn(spawn([], newId, rand), newId, rand);
}

/** Flatten to 16 numbers (0 = empty), for saving. */
export function toCells(tiles: Tile[]): number[] {
  const cells = Array<number>(SIZE * SIZE).fill(0);
  for (const t of live(tiles)) cells[t.r * SIZE + t.c] = t.value;
  return cells;
}

export function isValidCells(cells: unknown): cells is number[] {
  return (
    Array.isArray(cells) &&
    cells.length === SIZE * SIZE &&
    cells.every((v) => typeof v === 'number' && (v === 0 || (v >= 2 && Number.isInteger(Math.log2(v)))))
  );
}

export function fromCells(cells: number[], newId: IdSource): Tile[] {
  const tiles: Tile[] = [];
  cells.forEach((value, i) => {
    if (value) tiles.push({ id: newId(), value, r: Math.floor(i / SIZE), c: i % SIZE });
  });
  return tiles;
}

/** Strip animation flags so a snapshot restores quietly. */
export function settle(tiles: Tile[]): Tile[] {
  return live(tiles).map(({ id, value, r, c }) => ({ id, value, r, c }));
}
