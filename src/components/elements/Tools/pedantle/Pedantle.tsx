import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import confetti from 'canvas-confetti';
import { ExternalLink } from 'lucide-react';
import { DialogueBox, GameShell, load, save, sfx, tone, type Choice } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import Article, { Title } from './Article';
import { formsOf, hitsFor, normalizeGuess, parseArticle } from './words';
import { dailyTitle, fetchPage, randomTitle, todayKey, type WikiPage } from './wiki';
import './pedantle.css';

type Source = 'daily' | 'random';
type Request =
  | { kind: 'daily' }
  | { kind: 'random'; avoid?: string }
  | { kind: 'title'; title: string; source: Source };
type Tone = 'hit' | 'title' | 'miss' | 'dup' | 'err';
type Dialog = 'win' | 'giveup' | 'reveal';

// Progress per article title, so a refresh picks up where you left off.
const PROGRESS_KEY = 'pedantle:progress';
// The random article opened today, so a refresh returns to it rather than to today's.
const CURRENT_KEY = 'pedantle:current';
const KEEP_ARTICLES = 40;
const MAX_AGE_DAYS = 60;

interface Saved {
  guesses: string[];
  gaveUp: boolean;
  day: string;
}

function readAllProgress(): Record<string, Saved> {
  const all = load<unknown>(PROGRESS_KEY, {});
  return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, Saved>) : {};
}

function readProgress(title: string): { guesses: string[]; gaveUp: boolean } {
  const s = readAllProgress()[title];
  const ageDays = s && typeof s.day === 'string' ? (Date.now() - new Date(s.day).getTime()) / 864e5 : NaN;
  if (!s || !(ageDays < MAX_AGE_DAYS)) return { guesses: [], gaveUp: false };
  return {
    guesses: Array.isArray(s.guesses) ? s.guesses.filter((g): g is string => typeof g === 'string') : [],
    gaveUp: s.gaveUp === true,
  };
}

function writeProgress(title: string, guesses: string[], gaveUp: boolean) {
  const others = Object.entries(readAllProgress())
    .filter(([t]) => t !== title)
    .sort((a, b) => String(b[1]?.day).localeCompare(String(a[1]?.day)));
  const entry: Saved = { guesses, gaveUp, day: todayKey() };
  save(PROGRESS_KEY, Object.fromEntries([[title, entry], ...others].slice(0, KEEP_ARTICLES)));
}

/** a soft low blip for a miss: misses are common, so not the harsh "bad" buzz */
const missSound = () => tone(220, 0.09, { type: 'triangle', volume: 0.06 });

function celebrate() {
  sfx.win();
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 160,
    spread: 80,
    origin: { y: 0.3 },
    colors: ['#22d3ee', '#f472b6', '#fbbf24', '#4ade80', '#a78bfa'],
    disableForReducedMotion: true,
  });
}

function Loading() {
  return (
    <div className="px-box mx-auto mt-4 max-w-md p-6 text-center" role="status">
      <p className="px-label">Loading article</p>
      <div className="px-meter mt-4" aria-hidden="true">
        <span className="pd-loading-bar" />
      </div>
      <p className="mt-4 text-[var(--px-dim)]">Dusting off a featured article…</p>
    </div>
  );
}

export default function Pedantle() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState<WikiPage | null>(null);
  const [source, setSource] = useState<Source>('daily');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [gaveUp, setGaveUp] = useState(false);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null); // guess whose words are highlighted
  const [flash, setFlash] = useState(0); // bumps to replay the highlight flash
  const [scrollTick, setScrollTick] = useState(0); // bumps to scroll to the highlighted words
  const [sort, setSort] = useState<'newest' | 'hits'>('newest');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const lastRequest = useRef<Request>({ kind: 'daily' });
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    [],
  );

  // Load an article. A newer request cancels an older one, so a slow reply
  // can never replace the article you asked for last.
  const open = useCallback(async (req: Request) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    lastRequest.current = req;
    setStatus('loading');
    setDialog(null);
    try {
      const title =
        req.kind === 'daily'
          ? await dailyTitle(ctrl.signal)
          : req.kind === 'random'
            ? await randomTitle(req.avoid, ctrl.signal)
            : req.title;
      const next = await fetchPage(title, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const src: Source = req.kind === 'title' ? req.source : req.kind;
      const saved = readProgress(next.title);
      setPage(next);
      setSource(src);
      setGuesses(saved.guesses);
      setGaveUp(saved.gaveUp);
      setFocusKey(null);
      setFeedback(null);
      setInput('');
      setStatus('ready');
      save(CURRENT_KEY, src === 'random' ? { day: todayKey(), title: next.title } : null);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(
        err instanceof TypeError
          ? "Couldn't reach Wikipedia. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : 'Something went wrong.',
      );
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const current = load<{ day?: unknown; title?: unknown } | null>(CURRENT_KEY, null);
    if (current && current.day === todayKey() && typeof current.title === 'string') {
      void open({ kind: 'title', title: current.title, source: 'random' });
    } else {
      void open({ kind: 'daily' });
    }
    const pending = abortRef;
    return () => pending.current?.abort();
  }, [open]);

  // Save progress whenever it changes (articles you only looked at are not stored).
  useEffect(() => {
    if (status !== 'ready' || !page) return;
    if (guesses.length === 0 && !gaveUp) return;
    writeProgress(page.title, guesses, gaveUp);
  }, [status, page, guesses, gaveUp]);

  // Parse once per article, not on every render (the old code re-parsed the
  // whole extract on every keystroke).
  const parsed = useMemo(() => (page ? parseArticle(page.title, page.html) : null), [page]);
  const revealed = useMemo(() => new Set(guesses.flatMap(formsOf)), [guesses]);
  const highlight = useMemo(() => new Set(focusKey ? formsOf(focusKey) : []), [focusKey]);
  const titleKeySet = useMemo(() => new Set(parsed?.titleKeys ?? []), [parsed]);
  const titleTotal = parsed?.titleKeys.length ?? 0;
  const titleFound = parsed ? parsed.titleKeys.filter((k) => revealed.has(k)).length : 0;
  // A title with no letters or digits at all can only be revealed by giving up.
  const solved = titleTotal > 0 && titleFound === titleTotal;
  const over = solved || gaveUp;

  const revealPct = useMemo(() => {
    if (!parsed || parsed.totalWords === 0) return 0;
    if (over) return 100;
    let shown = 0;
    parsed.counts.forEach((n, key) => {
      if (revealed.has(key)) shown += n;
    });
    return Math.floor((100 * shown) / parsed.totalWords);
  }, [parsed, revealed, over]);

  const rows = useMemo(
    () => guesses.map((key, i) => ({ key, n: i + 1, hits: parsed ? hitsFor(key, parsed.counts) : 0 })),
    [guesses, parsed],
  );
  const sortedRows = useMemo(
    () => (sort === 'newest' ? [...rows].reverse() : [...rows].sort((a, b) => b.hits - a.hits || b.n - a.n)),
    [rows, sort],
  );

  // Scroll to the first highlighted word in the article when asked to.
  useEffect(() => {
    if (!scrollTick) return;
    document
      .querySelector('.pd-article .pd-hit-0, .pd-article .pd-hit-1')
      ?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [scrollTick]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    // back to the guess box, or to the article link once the game is over
    requestAnimationFrame(() => {
      const box = inputRef.current;
      (box && !box.disabled ? box : linkRef.current)?.focus();
    });
  }, []);

  // Escape closes any dialogue (the kit's box only handles Escape without choices).
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      sfx.back();
      closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed || over || dialog) return;
    const check = normalizeGuess(input);
    if (!check.ok) {
      if (check.reason) {
        setFeedback({ tone: 'err', text: check.reason });
        sfx.bad();
      }
      return;
    }
    const { key } = check;
    const hits = hitsFor(key, parsed.counts);
    const times = `${hits} ${hits === 1 ? 'time' : 'times'}`;
    setInput('');
    setFocusKey(key);
    setFlash((f) => f + 1);

    if (guesses.includes(key)) {
      // already guessed: just show its words again
      setFeedback({ tone: 'dup', text: `Already guessed “${key}”: it appears ${times}.` });
      sfx.move();
      if (hits) setScrollTick((t) => t + 1);
      return;
    }

    const next = [...guesses, key];
    setGuesses(next);
    const nextRevealed = new Set(next.flatMap(formsOf));
    const won = parsed.titleKeys.length > 0 && parsed.titleKeys.every((k) => nextRevealed.has(k));
    const newTitleWord = parsed.titleKeys.some((k) => !revealed.has(k) && nextRevealed.has(k));

    if (won) {
      setFeedback({ tone: 'title', text: `“${key}” completes the title!` });
      inputRef.current?.blur();
      setDialog('win');
      celebrate();
    } else if (newTitleWord) {
      setFeedback({ tone: 'title', text: `“${key}” is in the title! It appears ${times}.` });
      sfx.good();
    } else if (hits) {
      setFeedback({ tone: 'hit', text: `“${key}” appears ${times}.` });
      sfx.coin();
    } else {
      setFeedback({ tone: 'miss', text: `“${key}” isn't in the article.` });
      missSound();
    }
  };

  const showGuess = (key: string) => {
    sfx.move();
    setFocusKey(key);
    setFlash((f) => f + 1);
    setScrollTick((t) => t + 1);
  };

  const askGiveUp = () => {
    sfx.select();
    (document.activeElement as HTMLElement | null)?.blur();
    setDialog('giveup');
  };

  const confirmGiveUp = () => {
    setGaveUp(true);
    setFeedback(null);
    sfx.lose();
    setDialog('reveal');
  };

  const readArticle = () => {
    if (page) window.open(page.url, '_blank', 'noopener,noreferrer');
    closeDialog();
  };

  // The dialogue box restarts whenever `lines` changes identity, so memoise it.
  const lines = useMemo(() => {
    if (!page || !dialog) return [];
    const n = guesses.length;
    if (dialog === 'win') {
      return [
        `You found it! The article was “${page.title}”.`,
        `Solved in ${n} ${n === 1 ? 'guess' : 'guesses'}. The whole article is yours to read.`,
      ];
    }
    if (dialog === 'giveup') return ['Give up and reveal the whole article?'];
    return [
      `The article was “${page.title}”.`,
      source === 'daily' ? 'A new one arrives tomorrow.' : 'Fancy another one?',
    ];
  }, [dialog, page, guesses.length, source]);

  const choices: Choice[] =
    dialog === 'giveup'
      ? [
          { label: 'No, keep guessing', onSelect: closeDialog },
          { label: 'Yes, reveal it', onSelect: confirmGiveUp },
        ]
      : [
          { label: 'Read the article', onSelect: readArticle },
          { label: 'Keep reading here', onSelect: closeDialog },
        ];

  const openRandom = () => {
    sfx.select();
    void open({ kind: 'random', avoid: page?.title });
  };
  const openDaily = () => {
    sfx.select();
    void open({ kind: 'daily' });
  };

  const idleHint = over
    ? solved
      ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
      : 'You gave up on this one. The whole article is revealed.'
    : 'Type a word and press Enter. Click a bar to count its letters.';

  return (
    <GameShell
      title="Pedantle"
      accent="cyan"
      wide
      subtitle="Guess words to uncover a hidden Wikipedia article. Reveal every word of its title to win."
    >
      <div className="pd-root">
        {status === 'loading' && <Loading />}

        {status === 'error' && (
          <div className="px-box mx-auto mt-4 max-w-md p-6 text-center" role="alert" style={{ borderColor: 'var(--px-red)' }}>
            <p className="px-label" style={{ color: 'var(--px-red)' }}>
              Couldn't load the article
            </p>
            <p className="mt-3">{error}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" className="px-btn" onClick={() => void open(lastRequest.current)}>
                Retry
              </button>
              {lastRequest.current.kind !== 'daily' && (
                <button type="button" className="px-btn" onClick={openDaily}>
                  Today's article
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'ready' && page && parsed && (
          <>
            {/* Title: the goal */}
            <section className="px-box px-box--accent p-4 sm:p-6" aria-labelledby="pd-title">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="px-label">{source === 'daily' ? `Today's article · ${dateLabel}` : 'Random featured article'}</p>
                <p className="px-label">
                  {solved ? 'Solved!' : gaveUp ? 'Revealed' : `Title words ${titleFound}/${titleTotal}`}
                </p>
              </div>
              <div className="mt-2">
                <Title
                  id="pd-title"
                  segments={parsed.title}
                  revealed={revealed}
                  revealAll={over}
                  highlight={highlight}
                  flash={flash % 2}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div
                  className="px-meter w-40 max-w-full"
                  role="progressbar"
                  aria-label="Title words found"
                  aria-valuemin={0}
                  aria-valuemax={titleTotal}
                  aria-valuenow={over ? titleTotal : titleFound}
                >
                  <span style={{ width: `${titleTotal ? ((over ? titleTotal : titleFound) / titleTotal) * 100 : 0}%` }} />
                </div>
                <span className="text-sm text-[var(--px-dim)]">{revealPct}% of the article revealed</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {/* The link only appears once the game is over: the URL is the answer. */}
                {over ? (
                  <a ref={linkRef} className="px-btn px-btn--small" href={page.url} target="_blank" rel="noopener noreferrer">
                    Read the article <ExternalLink size={14} aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <button type="button" className="px-btn px-btn--small" onClick={askGiveUp} disabled={!!dialog}>
                    Give up
                  </button>
                )}
                <button type="button" className="px-btn px-btn--small" onClick={openRandom}>
                  Random article
                </button>
                {source === 'random' && (
                  <button type="button" className="px-btn px-btn--small" onClick={openDaily}>
                    Today's article
                  </button>
                )}
              </div>
            </section>

            {/* Guess bar: sticks to the top of the screen while you scroll the article */}
            <div className="pd-bar">
              <form className="flex gap-2" onSubmit={submit} aria-label="Guess a word">
                <label htmlFor="pd-guess" className="sr-only">
                  Guess a word
                </label>
                <input
                  ref={inputRef}
                  id="pd-guess"
                  className="px-input min-w-0 flex-1"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={over ? 'Game over' : 'Guess a word…'}
                  maxLength={40}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  disabled={over || !!dialog}
                />
                <button type="submit" className="px-btn" disabled={over || !!dialog || !input.trim()}>
                  Guess
                </button>
              </form>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-sm">
                <p className="pd-feedback" data-tone={feedback?.tone} role="status">
                  {feedback?.text ?? idleHint}
                </p>
                <p className="px-label shrink-0">
                  Guesses <span className="text-[var(--px-ink)]">{guesses.length}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <section className="px-box px-box--soft min-w-0 p-4 sm:p-6" aria-label="Article">
                {parsed.paragraphs.length > 0 ? (
                  <Article
                    paragraphs={parsed.paragraphs}
                    revealed={revealed}
                    revealAll={over}
                    highlight={highlight}
                    flash={flash % 2}
                    titleKeys={titleKeySet}
                  />
                ) : (
                  <p className="text-[var(--px-dim)]">This article has no long paragraphs to play with. Try a random one.</p>
                )}
              </section>

              {/* Guesses: beside the article on wide screens, under it on phones */}
              <aside className="pd-guesses px-box px-box--soft p-3" aria-labelledby="pd-guesses-h">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="pd-guesses-h" className="px-label">
                    Guesses ({guesses.length})
                  </h2>
                  {/* wrapper carries lg:hidden: .px-btn's own display would beat the utility */}
                  <div className="lg:hidden">
                    <button
                      type="button"
                      className="px-btn px-btn--small"
                      aria-expanded={listOpen}
                      aria-controls="pd-guess-list"
                      onClick={() => setListOpen((o) => !o)}
                    >
                      {listOpen ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div id="pd-guess-list" className={listOpen ? '' : 'hidden lg:block'}>
                  {rows.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Sort guesses">
                      <button
                        type="button"
                        className="px-btn px-btn--small"
                        aria-pressed={sort === 'newest'}
                        onClick={() => setSort('newest')}
                      >
                        Newest
                      </button>
                      <button
                        type="button"
                        className="px-btn px-btn--small"
                        aria-pressed={sort === 'hits'}
                        onClick={() => setSort('hits')}
                      >
                        Most hits
                      </button>
                    </div>
                  )}
                  {rows.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--px-dim)]">No guesses yet. Common words like “the” are a good start.</p>
                  ) : (
                    <ol className="mt-3 space-y-0.5">
                      {sortedRows.map((r) => (
                        <li key={r.key}>
                          <button
                            type="button"
                            className={r.hits ? 'pd-guess' : 'pd-guess pd-guess--miss'}
                            aria-pressed={focusKey === r.key}
                            title={r.hits ? 'Highlight and jump to it' : 'Not in the article'}
                            onClick={() => showGuess(r.key)}
                          >
                            <span className="pd-guess__n">#{r.n}</span>
                            <span className="pd-guess__word">{r.key}</span>
                            <span className="pd-guess__hits">
                              {r.hits}
                              <span className="sr-only"> {r.hits === 1 ? 'match' : 'matches'}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      {dialog && page && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6 sm:pb-10"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            sfx.back();
            closeDialog();
          }}
        >
          <DialogueBox className="w-full max-w-2xl" speaker="Librarian" lines={lines} choices={choices} />
        </div>
      )}
    </GameShell>
  );
}
