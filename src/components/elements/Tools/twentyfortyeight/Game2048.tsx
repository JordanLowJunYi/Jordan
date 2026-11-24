import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';
import { DialogueBox, GameShell, arp, load, save, sfx, tone, type Choice } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import {
  SIZE,
  WIN_VALUE,
  canMove,
  fromCells,
  isValidCells,
  live,
  maxValue,
  newBoard,
  settle,
  slide,
  spawn,
  toCells,
  type Dir,
  type Tile,
} from './logic';
import './game2048.css';

// Tile ids only need to be unique while the page is open.
let nextId = 1;
const newId = () => nextId++;

interface Snapshot {
  tiles: Tile[];
  score: number;
  won: boolean;
}
interface Game extends Snapshot {
  over: boolean;
  /** one-step undo */
  prev: Snapshot | null;
}
interface SavedSnapshot {
  cells: number[];
  score: number;
  won: boolean;
}
interface SavedGame extends SavedSnapshot {
  v: 1;
  prev: SavedSnapshot | null;
}

const SAVE_KEY = '2048:game';
const BEST_KEY = '2048:best';
const SLIDE_MS = 110;

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

// Colours climb from dusky violet through the arcade's accents to gold.
const PALETTE: Record<number, { bg: string; fg: string; glow?: string; light?: boolean }> = {
  2: { bg: '#3a3352', fg: '#f5efe2', light: true },
  4: { bg: '#5a4e86', fg: '#f5efe2', light: true },
  8: { bg: '#a78bfa', fg: '#120d22' },
  16: { bg: '#c084fc', fg: '#160a24' },
  32: { bg: '#f472b6', fg: '#220714' },
  64: { bg: '#fb7185', fg: '#240810' },
  128: { bg: '#22d3ee', fg: '#03171c' },
  256: { bg: '#2dd4bf', fg: '#031a16' },
  512: { bg: '#4ade80', fg: '#04190b' },
  1024: { bg: '#bef264', fg: '#141a04' },
  2048: { bg: '#fbbf24', fg: '#1f1400', glow: '#fbbf24' },
  4096: { bg: '#fde68a', fg: '#1f1400', glow: '#fde68a' },
};
const TOP_TILE = { bg: '#f5efe2', fg: '#1a1208', glow: '#f5efe2' };
const look = (value: number) => PALETTE[value] ?? TOP_TILE;

// Merges ring a rising pentatonic note, so bigger merges sound brighter.
const NOTES = [392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
function mergeSound(value: number) {
  const i = Math.min(NOTES.length - 1, Math.max(0, Math.round(Math.log2(value)) - 2));
  arp([NOTES[i], NOTES[i] * 1.5], 0.045, { volume: 0.06 });
}
const slideSound = () => tone(260, 0.05, { type: 'triangle', volume: 0.05, slideTo: 180 });
const bumpSound = () => tone(130, 0.08, { type: 'triangle', volume: 0.06 });

function freshGame(): Game {
  return { tiles: newBoard(newId), score: 0, won: false, over: false, prev: null };
}

function serialise(s: Snapshot): SavedSnapshot {
  return { cells: toCells(s.tiles), score: s.score, won: s.won };
}

function restore(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const { cells, score, won } = raw as Partial<SavedSnapshot>;
  if (!isValidCells(cells) || typeof score !== 'number' || !Number.isFinite(score) || score < 0) return null;
  return { tiles: fromCells(cells, newId), score, won: !!won };
}

function loadGame(): Game {
  const saved = load<Partial<SavedGame> | null>(SAVE_KEY, null);
  const snap = saved?.v === 1 ? restore(saved) : null;
  if (!snap || snap.tiles.length === 0) return freshGame();
  return { ...snap, over: !canMove(snap.tiles), prev: restore(saved?.prev) };
}

function loadBest(): number {
  const b = load<unknown>(BEST_KEY, 0);
  return typeof b === 'number' && Number.isFinite(b) && b > 0 ? b : 0;
}

export default function Game2048() {
  const [still] = useState(prefersReducedMotion);
  const slideMs = still ? 0 : SLIDE_MS;

  const [game, setGame] = useState<Game>(loadGame);
  const gameRef = useRef(game);
  const [best, setBest] = useState(loadBest);
  const [dialog, setDialog] = useState<'win' | 'lose' | null>(() => (game.over ? 'lose' : null));
  const [pops, setPops] = useState<{ id: number; n: number }[]>([]);
  const [shaking, setShaking] = useState(false);
  const [announce, setAnnounce] = useState('');

  // `lock` blocks moves while a win/lose message is pending or open;
  // `seq` lets a pending message notice that Undo / New game happened first.
  const lock = useRef(game.over);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const swipe = useRef<{ id: number; x: number; y: number; done: boolean } | null>(null);

  const commit = useCallback((next: Game) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // Resume after a refresh.
  useEffect(() => {
    save<SavedGame>(SAVE_KEY, { v: 1, ...serialise(game), prev: game.prev ? serialise(game.prev) : null });
  }, [game]);

  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      save(BEST_KEY, game.score);
    }
  }, [game.score, best]);

  const doMove = useCallback(
    (dir: Dir) => {
      const cur = gameRef.current;
      if (lock.current || cur.over) return;
      const res = slide(cur.tiles, dir, newId);
      if (!res.moved) {
        bumpSound();
        if (!still) setShaking(true);
        return;
      }
      const tiles = spawn(res.tiles, newId);
      const score = cur.score + res.gained;
      const reached = !cur.won && maxValue(tiles) >= WIN_VALUE;
      const over = !canMove(tiles);
      const mySeq = ++seq.current;
      commit({
        tiles,
        score,
        won: cur.won || reached,
        over,
        prev: { tiles: settle(cur.tiles), score: cur.score, won: cur.won },
      });

      if (res.biggestMerge) mergeSound(res.biggestMerge);
      else slideSound();
      if (res.gained) {
        const id = newId();
        setPops((p) => [...p, { id, n: res.gained }]);
        later(() => setPops((p) => p.filter((x) => x.id !== id)), 850);
      }
      setAnnounce(`Moved ${dir}${res.gained ? `, plus ${res.gained}` : ''}. Score ${score}.`);

      // Ghosts have finished sliding under the merged tile: drop them.
      later(() => {
        const g = gameRef.current;
        if (g.tiles.some((t) => t.kind === 'ghost')) commit({ ...g, tiles: live(g.tiles) });
      }, slideMs + 240);

      if (reached || over) {
        lock.current = true;
        later(
          () => {
            if (seq.current !== mySeq) return;
            setDialog(reached ? 'win' : 'lose');
            if (reached) sfx.win();
            else sfx.lose();
          },
          slideMs + (reached ? 380 : 520),
        );
      }
    },
    [commit, later, still, slideMs],
  );

  const undo = useCallback(
    (sound = true) => {
      const cur = gameRef.current;
      if (!cur.prev) return;
      const p = cur.prev;
      const over = !canMove(p.tiles);
      seq.current++;
      lock.current = over;
      commit({ ...p, over, prev: null });
      setDialog(over ? 'lose' : null);
      setAnnounce(`Undone. Score ${p.score}.`);
      if (sound) sfx.back();
    },
    [commit],
  );

  const startNew = useCallback(
    (sound = true) => {
      const cur = gameRef.current;
      seq.current++;
      lock.current = false;
      // A misclick on New game can be undone, unless the old game was finished.
      const prev = cur.over || cur.score === 0 ? null : { tiles: settle(cur.tiles), score: cur.score, won: cur.won };
      commit({ ...freshGame(), prev });
      setDialog(null);
      setAnnounce('New game. Score 0.');
      if (sound) sfx.select();
    },
    [commit],
  );

  const keepGoing = useCallback(() => {
    if (gameRef.current.over) {
      setDialog('lose');
      sfx.lose();
      return;
    }
    lock.current = false;
    setDialog(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        if (!e.repeat) doMove(dir);
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, doMove, undo]);

  // Swipe (touch, pen or mouse drag): fire as soon as the drag is long enough.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId || s.done) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    s.done = true;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  const endSwipe = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (swipe.current?.id === e.pointerId) swipe.current = null;
  };

  const lines = useMemo(() => {
    if (dialog === 'win') return ['You made 2048!', `Score ${game.score}. Keep sliding for an even bigger block, or start fresh?`];
    if (dialog === 'lose')
      return [
        'No moves left. Game over!',
        game.score > 0 && game.score >= best
          ? `Final score ${game.score}. That's a new best!`
          : `Final score ${game.score}. Best so far ${best}.`,
      ];
    return [];
  }, [dialog, game.score, best]);

  const choices: Choice[] =
    dialog === 'win'
      ? [
          { label: 'Keep going', onSelect: keepGoing },
          { label: 'New game', onSelect: () => startNew(false) },
        ]
      : [
          { label: 'Try again', onSelect: () => startNew(false) },
          ...(game.prev ? [{ label: 'Undo last move', onSelect: () => undo(false) }] : []),
        ];

  const readout = useMemo(() => {
    const cells = toCells(game.tiles);
    return Array.from(
      { length: SIZE },
      (_, r) => `Row ${r + 1}: ${cells.slice(r * SIZE, r * SIZE + SIZE).map((v) => v || 'empty').join(', ')}.`,
    ).join(' ');
  }, [game.tiles]);

  // Stable DOM order (by id) so moving a tile never re-inserts its node,
  // which would cut its slide transition short.
  const tiles = useMemo(() => [...game.tiles].sort((a, b) => a.id - b.id), [game.tiles]);

  return (
    <GameShell title="2048" accent="amber" subtitle="Slide and merge your way to 2048.">
      <div className={`g48 mx-auto w-full max-w-[440px] ${still ? 'g48--still' : ''}`}>
        <div className="mb-5 flex flex-col gap-3 min-[440px]:flex-row min-[440px]:items-stretch">
          <div className="flex flex-1 gap-3">
            <div className="g48-score px-box px-box--soft relative flex-1 px-2 py-2 text-center">
              <div className="px-label">Score</div>
              <div className="g48-score__value" data-len={String(game.score).length}>
                {game.score}
              </div>
              {pops.map((p) => (
                <span key={p.id} className="g48-plus" aria-hidden="true">
                  +{p.n}
                </span>
              ))}
            </div>
            <div className="g48-score px-box px-box--soft flex-1 px-2 py-2 text-center">
              <div className="px-label">Best</div>
              <div className="g48-score__value" data-len={String(best).length}>
                {best}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="px-btn px-btn--small flex-1"
              onClick={() => undo()}
              disabled={!game.prev}
              aria-keyshortcuts="U"
            >
              <Undo2 size={14} aria-hidden="true" /> Undo
            </button>
            <button type="button" className="px-btn px-btn--small flex-1 whitespace-nowrap" onClick={() => startNew()}>
              <RotateCcw size={14} aria-hidden="true" /> New game
            </button>
          </div>
        </div>

        <div className="relative">
          <div
            className={`g48-board px-box ${shaking ? 'px-shake' : ''}`}
            tabIndex={0}
            aria-label="2048 board. Use the arrow keys, WASD or swipe to slide the blocks."
            aria-describedby="g48-readout"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setShaking(false);
            }}
          >
            <div
              className="g48-grid"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endSwipe}
              onPointerCancel={endSwipe}
            >
              <div className="g48-cells" aria-hidden="true">
                {Array.from({ length: SIZE * SIZE }, (_, i) => (
                  <div key={i} className="g48-cell" />
                ))}
              </div>
              <div aria-hidden="true">
                {tiles.map((t) => {
                  const p = look(t.value);
                  return (
                    <div
                      key={t.id}
                      className="g48-tile"
                      data-kind={t.kind}
                      data-glow={!!p.glow}
                      style={
                        {
                          '--r': t.r,
                          '--c': t.c,
                          '--bg': p.bg,
                          '--fg': p.fg,
                          '--glow': p.glow,
                        } as CSSProperties
                      }
                    >
                      <div className="g48-face" data-digits={String(t.value).length} data-light={!!('light' in p && p.light)}>
                        {t.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {dialog && (
            <>
              <div className="g48-dim" aria-hidden="true" />
              <div className="absolute inset-x-2 bottom-2 z-30 sm:inset-x-4 sm:bottom-4">
                <DialogueBox speaker={dialog === 'win' ? 'You win' : 'Game over'} lines={lines} choices={choices} />
              </div>
            </>
          )}
        </div>

        <p id="g48-readout" className="sr-only">
          {readout}
        </p>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <p className="mt-5 text-center text-sm text-[var(--px-dim)]">
          <span className="pointer-coarse:hidden">Arrow keys or WASD to slide · swipe works too · U to undo</span>
          <span className="hidden pointer-coarse:inline">Swipe the board to slide the blocks</span>
        </p>
      </div>
    </GameShell>
  );
}
