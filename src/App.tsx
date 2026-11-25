import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigationType } from 'react-router-dom';
import Doux from './components/Doux';

// Each game is its own chunk, loaded only when someone opens it, so the
// portfolio page itself stays light.
const Tools = lazy(() => import('./components/elements/Tools/Tools'));
const Pedantle = lazy(() => import('./components/elements/Tools/pedantle/Pedantle'));
const Mapper = lazy(() => import('./components/elements/Tools/mapper/Map'));
const Room = lazy(() => import('./components/elements/Tools/room/Room'));
const Game2048 = lazy(() => import('./components/elements/Tools/twentyfortyeight/Game2048'));
const WordSearch = lazy(() => import('./components/elements/Tools/wordsearch/WordSearch'));
const Piano = lazy(() => import('./components/elements/Tools/piano/Piano'));
const Latte = lazy(() => import('./components/elements/Tools/latte/Latte'));
const Visualiser = lazy(() => import('./components/elements/Tools/visualiser/Visualiser'));

// Shown for the split second a game chunk is loading.
function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#07060f] text-[#f5efe2]"
      style={{ fontFamily: '"DotGothic16", monospace' }}
    >
      LOADING…
    </div>
  );
}

// Any other address (a mistyped or old link). Without this route the page
// rendered nothing at all, just the dark background.
function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0f1c] px-6 text-center text-gray-200">
      <h1 className="text-3xl font-semibold text-white">Page not found</h1>
      <p className="text-gray-400">There is no page at this address.</p>
      <Link to="/" className="text-orange-300 underline underline-offset-4 hover:text-orange-200 transition-colors">
        Go to the home page
      </Link>
    </main>
  );
}

const RELOAD_KEY = 'scroll:';

/** Whether this page load was a reload, or Back/Forward from another site. */
function cameBack(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload' || nav?.type === 'back_forward';
  } catch {
    return false;
  }
}

/**
 * Scroll to `y`, retrying for up to a second while the page is still too
 * short (a game's code may still be loading). Stops if the visitor scrolls.
 */
function scrollWhenReady(y: number) {
  let tries = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const events = ['wheel', 'touchstart', 'keydown'] as const;
  events.forEach((e) => window.addEventListener(e, stop, { once: true, passive: true }));
  const done = () => events.forEach((e) => window.removeEventListener(e, stop));
  const step = () => {
    if (stopped) return done();
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 1 && ++tries < 60) requestAnimationFrame(step);
    else done();
  };
  step();
}

/**
 * New pages open at the top (otherwise a game opened from halfway down the
 * arcade started halfway down too). Back and Forward return to where you
 * were, and so does reloading the page. Links to a #section leave the
 * scrolling to the page.
 */
function ScrollManager() {
  const { key, hash } = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const current = useRef(key);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const onScroll = () => positions.current.set(current.current, window.scrollY);
    // Remember the spot when leaving, so a reload can come back to it.
    const onLeave = () => {
      try {
        sessionStorage.setItem(RELOAD_KEY + window.location.pathname, String(Math.round(window.scrollY)));
      } catch {
        /* storage blocked: a reload just starts at the top */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onLeave);
    };
  }, []);

  useLayoutEffect(() => {
    current.current = key;
    // Same history entry again (React runs effects twice in development):
    // nothing has changed, so leave the scroll alone.
    if (handled.current === key) return;
    const first = handled.current === null;
    handled.current = key;
    if (hash) return;
    if (first) {
      if (!cameBack()) return; // a fresh visit starts at the top anyway
      let saved = 0;
      try {
        saved = Number(sessionStorage.getItem(RELOAD_KEY + window.location.pathname)) || 0;
      } catch {
        /* storage blocked */
      }
      if (saved > 0) scrollWhenReady(saved);
      return;
    }
    if (navType === 'POP') scrollWhenReady(positions.current.get(key) ?? 0);
    else window.scrollTo(0, 0);
  }, [key, hash, navType]);

  return null;
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollManager />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Doux />} />

          <Route path="/Tools" element={<Tools />} />
          <Route path="/Tools/Room" element={<Room />} />
          <Route path="/Tools/2048" element={<Game2048 />} />
          <Route path="/Tools/WordSearch" element={<WordSearch />} />
          <Route path="/Tools/Piano" element={<Piano />} />
          <Route path="/Tools/Latte" element={<Latte />} />
          <Route path="/Tools/Visualiser" element={<Visualiser />} />
          <Route path="/Tools/Pedantle" element={<Pedantle />} />
          <Route path="/Tools/Map" element={<Mapper />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;