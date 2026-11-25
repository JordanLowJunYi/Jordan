import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { GlitchText, PixelArt, sfx, useMuted } from './arcade';
import { useSong } from './arcade/music';
import { IDLE, PAL as LATTE_PAL, latteGrid } from './latte/sprite';
import { STARLIGHT_SELECT } from './menuTheme';
import './arcade/arcade.css';

// ---------------------------------------------------------------------------
// Jordan's Arcade: the games menu. Every game lives on this site now (the
// ones from the 2025 site were ported over and finished).
// ---------------------------------------------------------------------------

const X = '#1b1626';

/**
 * One octave of piano keys: seven white keys, with short black keys in the
 * real 2 + 3 pattern (after C, D, then F, G, A).
 */
function pianoRows(): string[] {
  const KEY = 4; // white key width, including its right-hand gap
  const W = 1 + 7 * KEY;
  const H = 16;
  const blackAfter = [1, 2, 4, 5, 6]; // white-key boundaries that carry a black key
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) return 'x';
      const onBlack = y <= 9 && blackAfter.some((b) => Math.abs(x - b * KEY) <= 1);
      if (onBlack) return y === 9 ? 'B' : 'b';
      if (x % KEY === 0) return 'x';
      return y === H - 2 ? 's' : 'w';
    }).join(''),
  );
}

const ICONS: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  room: {
    rows: [
      '.....xx.....',
      '....xppx....',
      '...xppppx...',
      '..xppppppx..',
      '.xppppppppx.',
      'xxxxxxxxxxxx',
      '.xccccccccx.',
      '.xcbbccddcx.',
      '.xcbbccddcx.',
      '.xccccccdcx.',
      '.xccccccddx.',
      '.xxxxxxxxxx.',
    ],
    palette: { x: X, p: '#f472b6', c: '#f1dfbd', b: '#7ec8e3', d: '#8a5a3b' },
  },
  '2048': {
    rows: [
      'xxxxxxxxxxxx',
      'xYyyyyyyyyyx',
      'xyyyxxxxyyyx',
      'xyyyyyyyxyyx',
      'xyyyyyyyxyyx',
      'xyyyxxxxyyyx',
      'xyyyxyyyyyyx',
      'xyyyxyyyyyyx',
      'xyyyxxxxxyyx',
      'xyyyyyyyyyox',
      'xyooooooooox',
      'xxxxxxxxxxxx',
    ],
    palette: { x: X, y: '#fbbf24', Y: '#fde68a', o: '#d97706' },
  },
  words: {
    rows: [
      '...xxxxx....',
      '..xgwwggx...',
      '.xgwgggggx..',
      '.xgggggggx..',
      '.xgggggggx..',
      '.xgggggggx..',
      '..xgggggx...',
      '...xxxxxhx..',
      '........hhx.',
      '.........hhx',
      '..........xx',
      '............',
    ],
    palette: { x: X, g: '#4ade80', w: '#dcfce7', h: '#8a5a3b' },
  },
  pedantle: {
    rows: [
      '............',
      '.xxxxxxxxxx.',
      'xwwwwwxwwwwx',
      'xwlllwxwcccx',
      'xwwwwwxwwwcx',
      'xwlllwxwwccx',
      'xwwwwwxwwcwx',
      'xwlllwxwwwwx',
      'xwwwwwxwwcwx',
      'xwwwwwxwwwwx',
      '.xxxxxxxxxx.',
      '............',
    ],
    palette: { x: X, w: '#fbf3ea', l: '#9aa5c4', c: '#22d3ee' },
  },
  piano: { rows: pianoRows(), palette: { x: X, w: '#f5efe2', s: '#cfc4b2', b: '#1b1626', B: '#3b3550' } },
  // Latte's idle frame from the Latte game itself, so the two always match.
  latte: { rows: latteGrid(IDLE).map((r) => r.map((c) => c ?? '.').join('')), palette: LATTE_PAL },
  visualiser: {
    rows: (() => {
      const heights = [4, 8, 6, 10, 5, 7];
      const colours = ['g', 'c', 'y', 'p', 'r', 'c'];
      return Array.from({ length: 12 }, (_, y) =>
        Array.from({ length: 12 }, (_, x) => {
          if (x % 2 === 0) return '.';
          const bar = (x - 1) / 2;
          return 11 - y < heights[bar] ? colours[bar] : '.';
        }).join(''),
      );
    })(),
    palette: { g: '#4ade80', c: '#22d3ee', y: '#fbbf24', p: '#a78bfa', r: '#f472b6' },
  },
  mapper: {
    rows: [
      '....xxxx....',
      '...xrrrrx...',
      '..xrrrrrrx..',
      '..xrrwwrrx..',
      '..xrrwwrrx..',
      '..xrrrrrrx..',
      '...xrrrrx...',
      '....xrrx....',
      '.....xx.....',
      '..vvvvvvvv..',
      '.vvvvvvvvvv.',
      '............',
    ],
    palette: { x: X, r: '#f87171', w: '#fff', v: '#a78bfa' },
  },
};

interface GameCard {
  to: string;
  title: string;
  blurb: string;
  tag: string;
  icon: keyof typeof ICONS;
  accent: 'pink' | 'cyan' | 'amber' | 'green' | 'purple';
}

const FEATURED: GameCard = {
  to: '/Tools/Room',
  title: "Jordan's Room",
  blurb:
    'Wander my pixel study and hallway. Light the fire, pick lettuce for Latte, switch on the radio, and find your way around the portfolio.',
  tag: 'RPG · Explore',
  icon: 'room',
  accent: 'amber',
};

const GAMES: GameCard[] = [
  { to: '/Tools/2048', title: '2048', blurb: 'Slide and merge tiles until you reach 2048.', tag: 'Puzzle', icon: '2048', accent: 'amber' },
  { to: '/Tools/WordSearch', title: 'Word Search', blurb: 'Hunt for biomed, code and liver-lab words.', tag: 'Words', icon: 'words', accent: 'green' },
  { to: '/Tools/Pedantle', title: 'Pedantle', blurb: "Uncover today's hidden Wikipedia article one word at a time.", tag: 'Daily', icon: 'pedantle', accent: 'cyan' },
  { to: '/Tools/Latte', title: 'Latte', blurb: 'Look after Latte, my long-haired guinea pig.', tag: 'Pet', icon: 'latte', accent: 'pink' },
  { to: '/Tools/Piano', title: 'Piano', blurb: 'Play, train your ear, or play with your hands on webcam.', tag: 'Music', icon: 'piano', accent: 'cyan' },
  { to: '/Tools/Visualiser', title: 'Visualiser', blurb: 'Watch music turn into pixels.', tag: 'Music', icon: 'visualiser', accent: 'purple' },
  { to: '/Tools/Map', title: 'Mapper', blurb: 'Draw multi-floor indoor maps, then find the shortest route.', tag: 'Tool', icon: 'mapper', accent: 'purple' },
];

function Card({ game, featured = false }: { game: GameCard; featured?: boolean }) {
  const icon = ICONS[game.icon];
  return (
    <Link
      to={game.to}
      onClick={() => sfx.select()}
      onMouseEnter={() => sfx.move()}
      // flex-wrap + basis-28: with very large text the icon moves above the
      // words instead of squeezing them into a sliver that spills out
      className={`arcade-card px-box px-box--accent px-accent-${game.accent} group relative flex h-full flex-wrap items-center gap-4 p-4 no-underline transition-transform duration-100 hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none ${
        featured ? 'sm:gap-6 sm:p-6' : ''
      }`}
    >
      <span className="flex shrink-0 items-center justify-center bg-[#120f22] p-2" style={{ boxShadow: 'inset 0 0 0 3px #2c2645' }}>
        <PixelArt rows={icon.rows} palette={icon.palette} size={featured ? 88 : 56} />
      </span>
      <span className="min-w-0 grow basis-28 wrap-break-word">
        <span className="px-label block text-[var(--px-accent)]">{game.tag}</span>
        <span className={`block font-bold text-[var(--px-ink)] ${featured ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>
          {game.title}
        </span>
        <span className={`mt-1 block text-[var(--px-dim)] ${featured ? 'text-base' : 'text-sm'}`}>{game.blurb}</span>
      </span>
      <span
        aria-hidden="true"
        className="absolute bottom-2 right-3 text-sm text-[var(--px-accent)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ▶ PLAY
      </span>
    </Link>
  );
}

const Tools: React.FC = () => {
  const navigate = useNavigate();
  const [muted, setMuted] = useMuted();
  const [replay, setReplay] = useState(0);
  // Menu music: starts on the visitor's first click or key (see useSong).
  const music = useSong(STARLIGHT_SELECT);

  useEffect(() => {
    const prev = document.title;
    document.title = "Jordan's Arcade";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="arcade">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-5 sm:px-6">
        <button
          type="button"
          className="px-btn px-btn--small"
          onClick={() => {
            sfx.back();
            navigate('/');
          }}
        >
          ◀ Home
        </button>
        <div className="flex items-center gap-3">
          <span className="px-label hidden text-[var(--px-dim)] sm:inline" aria-live="polite">
            {muted ? '♪ Music off' : music.playing ? `♪ Now playing: ${STARLIGHT_SELECT.title}` : '♪ Click anywhere for music'}
          </span>
          <button
            type="button"
            data-sound-toggle
            className="px-btn px-btn--icon"
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound' : music.playing ? 'Mute sound' : 'Play music'}
            title={muted ? 'Sound off' : music.playing ? 'Sound on' : 'Play music'}
            onClick={() => {
              // Before the music has started, the first press starts it.
              if (!music.playing && !muted) return music.start();
              setMuted(!muted);
              if (muted) {
                music.start();
                setTimeout(() => sfx.select(), 0);
              }
            }}
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <div className="mb-10 text-center">
          <h1
            className="px-title cursor-default text-5xl wrap-break-word sm:text-6xl"
            onMouseEnter={() => setReplay((n) => n + 1)}
          >
            <GlitchText text="JORDAN'S ARCADE" replayKey={replay} />
          </h1>
          <p className="mt-3 text-lg text-[var(--px-dim)]">Little games I've built. Pick one and press start.</p>
        </div>

        <section aria-label="Featured game" className="mb-8">
          <Card game={FEATURED} featured />
        </section>

        <section aria-label="All games">
          <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((g) => (
              <li key={g.to}>
                <Card game={g} />
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-center text-sm text-[var(--px-faint)]">
          Music and sound effects are made live in your browser. Mute any time with the speaker button.
        </p>
      </main>
    </div>
  );
};

export default Tools;
