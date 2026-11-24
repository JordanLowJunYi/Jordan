import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { DialogueBox, GameShell, load, save, sfx, tone, type Choice } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import { aligned, generate, lineCells, snapLine, type Cell, type Puzzle } from './generate';
import { PACKS, SIZES, WORD_COUNT, packById, type GridSize } from './packs';
import './wordsearch.css';

// One colour per found word, cycling through the arcade palette and friends.
const COLOURS = ['#4ade80', '#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c', '#60a5fa', '#f87171', '#a3e635', '#2dd4bf', '#e879f9', '#fde047'];

interface Found {
  word: string;
  a: Cell;
  b: Cell;
  colour: string;
}
interface Prefs {
  pack: string;
  size: GridSize;
}
type Line = { a: Cell; b: Cell };

const PREFS_KEY = 'wordsearch:prefs';
const BEST_KEY = 'wordsearch:best';

function loadPrefs(): Prefs {
  const p = load<Partial<Prefs> | null>(PREFS_KEY, null);
  const size = SIZES.find((s) => s === p?.size) ?? 10;
  return { pack: packById(String(p?.pack ?? '')).id, size };
}

function loadBests(): Record<string, number> {
  const b = load<unknown>(BEST_KEY, {});
  if (!b || typeof b !== 'object' || Array.isArray(b)) return {};
  return Object.fromEntries(
    Object.entries(b as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0,
    ),
  );
}

const makePuzzle = (p: Prefs): Puzzle => generate(p.size, Object.keys(packById(p.pack).words), WORD_COUNT[p.size]);

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const tick = (len: number) => tone(420 + Math.min(len, 12) * 45, 0.025, { volume: 0.035 });

function Capsule({ a, b, colour, variant }: Line & { colour?: string; variant: 'found' | 'fresh' | 'live' | 'miss' }) {
  const style = { '--cap': colour } as CSSProperties;
  if (same(a, b)) {
    return (
      <g className={`ws-cap ws-cap--${variant}`} style={style}>
        <circle className="ws-cap__ring" cx={a.c + 0.5} cy={a.r + 0.5} r={0.4} />
        <circle className="ws-cap__fill" cx={a.c + 0.5} cy={a.r + 0.5} r={0.3} />
      </g>
    );
  }
  const pts = { x1: a.c + 0.5, y1: a.r + 0.5, x2: b.c + 0.5, y2: b.r + 0.5 };
  return (
    <g className={`ws-cap ws-cap--${variant}`} style={style}>
      <line className="ws-cap__ring" {...pts} pathLength={1} />
      <line className="ws-cap__fill" {...pts} pathLength={1} />
    </g>
  );
}

export default function WordSearch() {
  const uid = useId();
  const [still] = useState(prefersReducedMotion);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [puzzle, setPuzzle] = useState(() => makePuzzle(prefs));
  const [found, setFound] = useState<Found[]>([]);
  const [drag, setDrag] = useState<Line | null>(null);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell>({ r: 0, c: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bests, setBests] = useState(loadBests);
  const [result, setResult] = useState<{ ms: number; prevBest: number | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [miss, setMiss] = useState<(Line & { key: number }) | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const dragRef = useRef<(Line & { id: number }) | null>(null);
  const puzzleRef = useRef(puzzle);
  const timers = useRef<number[]>([]);

  const pack = packById(prefs.pack);
  const n = puzzle.size;
  const total = puzzle.placements.length;
  const bestKey = `${pack.id}:${n}`;
  const best = bests[bestKey] ?? null;
  const locked = dialogOpen || finishedMs !== null;

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // Timer: starts on the first touch of the grid, stops when the last word is found.
  useEffect(() => {
    if (startedAt === null || finishedMs !== null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt, finishedMs]);
  const elapsed = finishedMs ?? (startedAt === null ? 0 : Math.max(0, now - startedAt));

  useEffect(() => {
    if (!miss) return;
    const id = window.setTimeout(() => setMiss(null), 460);
    return () => window.clearTimeout(id);
  }, [miss]);

  const startTimer = () => {
    if (startedAt !== null || finishedMs !== null) return;
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
  };

  const reset = useCallback((p: Prefs, sound = true) => {
    const next = makePuzzle(p);
    puzzleRef.current = next;
    setPuzzle(next);
    setFound([]);
    dragRef.current = null;
    setDrag(null);
    setAnchor(null);
    setCursor({ r: 0, c: 0 });
    setStartedAt(null);
    setFinishedMs(null);
    setResult(null);
    setDialogOpen(false);
    setMiss(null);
    setFresh(null);
    setAnnounce(`New ${p.size} by ${p.size} puzzle. ${WORD_COUNT[p.size]} words to find.`);
    if (sound) sfx.select();
  }, []);

  const choose = (patch: Partial<Prefs>) => {
    const p = { ...prefs, ...patch };
    setPrefs(p);
    save(PREFS_KEY, p);
    reset(p);
  };

  const complete = (list: Found[]) => {
    const ms = Math.max(0, Date.now() - (startedAt ?? Date.now()));
    setFinishedMs(ms);
    setResult({ ms, prevBest: best });
    if (best === null || ms < best) {
      const next = { ...bests, [bestKey]: ms };
      setBests(next);
      save(BEST_KEY, next);
    }
    setAnnounce(`All ${list.length} words found in ${fmt(ms)}.`);
    sfx.win();
    const mine = puzzle;
    later(() => {
      if (puzzleRef.current === mine) setDialogOpen(true);
    }, still ? 0 : 750);
  };

  /** Check the letters from a to b (either way round) against the hidden words. */
  const submit = (a: Cell, b: Cell) => {
    if (!aligned(a, b)) return;
    const cells = lineCells(a, b);
    if (cells.length < 2) return;
    const s = cells.map((c) => puzzle.letters[c.r * n + c.c]).join('');
    const rev = [...s].reverse().join('');
    const hit = puzzle.placements.find((p) => p.word === s || p.word === rev);
    if (hit && !found.some((f) => f.word === hit.word)) {
      const next = [...found, { word: hit.word, a, b, colour: COLOURS[found.length % COLOURS.length] }];
      setFound(next);
      setFresh(hit.word);
      if (next.length === total) complete(next);
      else {
        sfx.good();
        setAnnounce(`Found ${hit.word}. ${next.length} of ${total}.`);
      }
    } else if (hit) {
      tone(330, 0.06, { type: 'triangle', volume: 0.05 });
      setAnnounce(`${hit.word} is already found.`);
    } else if (cells.length >= 3) {
      sfx.bad();
      setMiss({ a, b, key: Date.now() });
      setAnnounce(`${s} is not on the list.`);
    }
  };

  // ---- pointer: press, drag in a straight line, release --------------------
  const pointAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { fx: ((e.clientX - rect.left) / rect.width) * n, fy: ((e.clientY - rect.top) / rect.height) * n };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { fx, fy } = pointAt(e);
    const cell = { r: Math.floor(fy), c: Math.floor(fx) };
    if (cell.r < 0 || cell.r >= n || cell.c < 0 || cell.c >= n) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startTimer();
    setShowCursor(false);
    setCursor(cell);
    dragRef.current = { a: cell, b: cell, id: e.pointerId };
    setDrag({ a: cell, b: cell });
    tick(1);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const { fx, fy } = pointAt(e);
    const b = snapLine(d.a, fx, fy, n);
    if (same(b, d.b)) return;
    d.b = b;
    setDrag({ a: d.a, b });
    tick(lineCells(d.a, b).length);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!same(d.a, d.b)) {
      setAnchor(null);
      submit(d.a, d.b);
      return;
    }
    // A tap instead of a drag: tap the first letter, then the last one.
    if (!anchor) setAnchor(d.a);
    else if (same(anchor, d.a)) setAnchor(null);
    else if (aligned(anchor, d.a)) {
      setAnchor(null);
      submit(anchor, d.a);
    } else setAnchor(d.a);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  // ---- keyboard: arrows move a cursor, Enter/Space marks start then end ----
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const m = step[e.key];
    if (m) {
      e.preventDefault();
      setShowCursor(true);
      const next = { r: Math.min(n - 1, Math.max(0, cursor.r + m[0])), c: Math.min(n - 1, Math.max(0, cursor.c + m[1])) };
      if (!same(next, cursor)) {
        setCursor(next);
        tick(anchor && aligned(anchor, next) ? lineCells(anchor, next).length : 1);
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      setShowCursor(true);
      startTimer();
      if (!anchor) {
        setAnchor(cursor);
        sfx.select();
        setAnnounce(`Start marked at ${puzzle.letters[cursor.r * n + cursor.c]}. Move to the last letter and press Enter.`);
      } else if (same(anchor, cursor)) {
        setAnchor(null);
        sfx.back();
      } else if (aligned(anchor, cursor)) {
        setAnchor(null);
        submit(anchor, cursor);
      } else {
        sfx.bad();
        setAnnounce('That letter is not in a straight line from the start.');
      }
      return;
    }
    if (e.key === 'Escape' && anchor) {
      e.preventDefault();
      setAnchor(null);
      sfx.back();
    }
  };

  // What to highlight live: the drag, or the keyboard / tap start (stretched to the cursor when in line).
  const live: Line | null =
    drag ?? (anchor ? { a: anchor, b: showCursor && aligned(anchor, cursor) ? cursor : anchor } : null);
  const liveCells = new Set((live ? lineCells(live.a, live.b) : []).map((c) => c.r * n + c.c));

  const foundCells = useMemo(() => {
    const map = new Map<number, number>(); // cell -> hop order for the freshest word
    const all = new Set<number>();
    for (const f of found) {
      lineCells(f.a, f.b).forEach((c, i) => {
        all.add(c.r * n + c.c);
        if (f.word === fresh) map.set(c.r * n + c.c, i);
      });
    }
    return { all, hop: map };
  }, [found, fresh, n]);

  const foundByWord = useMemo(() => new Map(found.map((f) => [f.word, f])), [found]);
  const wordList = useMemo(() => puzzle.placements.map((p) => p.word).sort(), [puzzle]);
  const lastFound = found[found.length - 1];

  const sizeLabel = `${n}×${n}`;
  const lines = useMemo(() => {
    if (!result) return [];
    const where = `${pack.name} ${sizeLabel}`;
    return [
      `You found all ${total} words in ${fmt(result.ms)}!`,
      result.prevBest === null
        ? `That's your first ${where} clear, so it's the time to beat.`
        : result.ms < result.prevBest
          ? `A new best for ${where}! The old record was ${fmt(result.prevBest)}.`
          : `Your best for ${where} is still ${fmt(result.prevBest)}.`,
    ];
  }, [result, pack.name, sizeLabel, total]);

  const choices: Choice[] = [
    { label: 'New puzzle', onSelect: () => reset(prefs, false) },
    { label: 'Admire the grid', onSelect: () => setDialogOpen(false) },
  ];

  const cellId = (c: Cell) => `${uid}-cell-${c.r}-${c.c}`;

  return (
    <GameShell title="Word Search" accent="green" subtitle="Hunt down every hidden word.">
      <div className={`mx-auto w-full ${still ? 'ws--still' : ''}`}>
        {/* settings: always open on wider screens, folded behind one button on phones */}
        <div className="mb-6">
          <div className="flex gap-3 sm:hidden">
            <button
              type="button"
              className="px-btn px-btn--small flex-1"
              aria-expanded={menuOpen}
              aria-controls={`${uid}-options`}
              onClick={() => {
                sfx.move();
                setMenuOpen((o) => !o);
              }}
            >
              {pack.name} · {n}×{n}
              <ChevronDown size={14} aria-hidden="true" className={menuOpen ? 'rotate-180' : ''} />
            </button>
            <button type="button" className="px-btn px-btn--small" onClick={() => reset(prefs)}>
              <RefreshCw size={14} aria-hidden="true" /> New
            </button>
          </div>
          <div id={`${uid}-options`} className={`${menuOpen ? 'mt-4 flex' : 'hidden'} flex-col gap-4 sm:mt-0 sm:flex`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3" role="group" aria-label="Word pack">
              <span className="px-label w-12">Pack</span>
              {PACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="px-btn px-btn--small ws-toggle"
                  aria-pressed={p.id === pack.id}
                  onClick={() => choose({ pack: p.id })}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              <span className="px-label w-12">Size</span>
              <div className="flex flex-wrap gap-3" role="group" aria-label="Grid size">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="px-btn px-btn--small ws-toggle"
                    aria-pressed={s === n}
                    aria-label={`${s} by ${s}, ${WORD_COUNT[s]} words`}
                    onClick={() => choose({ size: s })}
                  >
                    {s}×{s}
                  </button>
                ))}
              </div>
              {/* wrapper carries the visibility: .px-btn sets display itself */}
              <div className="ml-auto hidden sm:block">
                <button type="button" className="px-btn px-btn--small" onClick={() => reset(prefs)}>
                  <RefreshCw size={14} aria-hidden="true" /> New puzzle
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0">
            {/* status */}
            <div className="mb-3 grid grid-cols-3 gap-3 text-center">
              <div className="px-box px-box--soft px-2 py-1.5">
                <div className="px-label">Time</div>
                <div className="text-xl font-bold tabular-nums" aria-label={`Time ${fmt(elapsed)}`}>
                  {fmt(elapsed)}
                </div>
              </div>
              <div className="px-box px-box--soft px-2 py-1.5">
                <div className="px-label">Found</div>
                <div className="text-xl font-bold tabular-nums">
                  {found.length}/{total}
                </div>
              </div>
              <div className="px-box px-box--soft px-2 py-1.5">
                <div className="px-label">Best</div>
                <div className="text-xl font-bold tabular-nums">{best === null ? '-:--' : fmt(best)}</div>
              </div>
            </div>

            {/* board */}
            <div className="relative">
              <div className="ws-frame px-box">
                <div
                  className="ws-board"
                  style={{ '--n': n } as CSSProperties}
                  role="grid"
                  tabIndex={0}
                  aria-label={`Letter grid, ${n} by ${n}. Arrow keys move, Enter marks the first and then the last letter of a word, Escape cancels.`}
                  aria-activedescendant={cellId(cursor)}
                  aria-readonly="true"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onKeyDown={onKeyDown}
                  onFocus={(e) => {
                    if (e.currentTarget.matches(':focus-visible')) setShowCursor(true);
                  }}
                  onBlur={() => setShowCursor(false)}
                >
                  <svg className="ws-capsules" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
                    {found.map((f) => (
                      <Capsule key={f.word} a={f.a} b={f.b} colour={f.colour} variant={f.word === fresh ? 'fresh' : 'found'} />
                    ))}
                    {miss && <Capsule key={`miss-${miss.key}`} a={miss.a} b={miss.b} colour="#f87171" variant="miss" />}
                    {live && <Capsule a={live.a} b={live.b} variant="live" />}
                  </svg>
                  {Array.from({ length: n }, (_, r) => (
                    <div key={r} role="row" className="ws-row">
                      {Array.from({ length: n }, (_, c) => {
                        const i = r * n + c;
                        const hop = foundCells.hop.get(i);
                        return (
                          <div
                            key={c}
                            id={cellId({ r, c })}
                            role="gridcell"
                            aria-selected={liveCells.has(i)}
                            aria-label={`${puzzle.letters[i]}, row ${r + 1}, column ${c + 1}${foundCells.all.has(i) ? ', part of a found word' : ''}`}
                            className={`ws-cell ${hop !== undefined ? 'ws-cell--hop' : ''}`}
                            data-found={foundCells.all.has(i)}
                            style={hop !== undefined ? ({ '--i': hop } as CSSProperties) : undefined}
                          >
                            {puzzle.letters[i]}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {showCursor && !locked && (
                    <div className="ws-cursor" aria-hidden="true" style={{ '--r': cursor.r, '--c': cursor.c } as CSSProperties} />
                  )}
                </div>
              </div>

              {dialogOpen && (
                <>
                  <div className="ws-dim" aria-hidden="true" />
                  <div className="absolute inset-x-2 bottom-2 z-30 sm:inset-x-4 sm:bottom-4">
                    <DialogueBox speaker="Puzzle solved" lines={lines} choices={choices} />
                  </div>
                </>
              )}
            </div>
            <p className="mt-3 text-center text-sm text-[var(--px-dim)]">
              <span className="pointer-coarse:hidden">Drag with the mouse, or use arrow keys and Enter.</span>
              <span className="hidden pointer-coarse:inline">Drag across a word, or tap its first and last letters.</span>
            </p>
          </div>

          {/* word list + field note */}
          <aside className="flex min-w-0 flex-col gap-4">
            <div className="px-box px-3 py-3">
              <h2 className="px-label mb-2">Words · {pack.name}</h2>
              <ul className="ws-words">
                {wordList.map((w) => {
                  const f = foundByWord.get(w);
                  return (
                    <li
                      key={w}
                      className={`ws-word ${f ? 'ws-word--found' : ''}`}
                      style={f ? ({ '--cap': f.colour } as CSSProperties) : undefined}
                    >
                      <span className="ws-word__dot" aria-hidden="true" />
                      <span className="ws-word__text">{w}</span>
                      {f && <span className="sr-only"> (found)</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="px-box px-box--soft px-3 py-3 text-sm leading-relaxed">
              <h2 className="px-label mb-1">Field note</h2>
              {lastFound ? (
                <p className="m-0">
                  <span className="font-bold" style={{ color: lastFound.colour }}>
                    {lastFound.word}
                  </span>
                  <span className="text-[var(--px-ink)]">: {pack.words[lastFound.word]}</span>
                </p>
              ) : (
                <p className="m-0 text-[var(--px-dim)]">Find a word to read its note.</p>
              )}
            </div>
            {finishedMs !== null && !dialogOpen && (
              <button type="button" className="px-btn" onClick={() => reset(prefs)}>
                <RefreshCw size={16} aria-hidden="true" /> Play again
              </button>
            )}
          </aside>
        </div>

        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </GameShell>
  );
}
