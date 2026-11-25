import { Suspense, lazy, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { GameShell, load, save, sfx, useMuted } from '../arcade';
import { EarTraining } from './EarTraining';
import { FreePlay } from './FreePlay';
import { stopAllNotes, unlockAudio, usePianoStatus } from './sound';
import { StatusChip } from './ui';
import './piano.css';

// The webcam mode pulls in TensorFlow, so it lives in its own chunk.
const WebcamPiano = lazy(() => import('./WebcamPiano'));

type Mode = 'free' | 'ear' | 'cam';
const MODES: { id: Mode; label: string }[] = [
  { id: 'free', label: 'Free play' },
  { id: 'ear', label: 'Ear training' },
  { id: 'cam', label: 'Webcam' },
];
const isMode = (v: unknown): v is Mode => MODES.some((m) => m.id === v);

const coarsePointer = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

export default function Piano() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = load<unknown>('piano:mode', 'free');
    return isMode(saved) ? saved : 'free';
  });
  // compare with true/false so an odd saved value can't leave a toggle half-on
  const [names, setNames] = useState(() => load<unknown>('piano:names', true) !== false);
  const [letters, setLetters] = useState(() => {
    const saved = load<unknown>('piano:letters', null);
    return typeof saved === 'boolean' ? saved : !coarsePointer();
  });
  const [muted] = useMuted();
  const status = usePianoStatus();
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());

  useEffect(() => save('piano:mode', mode), [mode]);
  useEffect(() => save('piano:names', names), [names]);
  useEffect(() => save('piano:letters', letters), [letters]);
  useEffect(() => {
    if (muted) stopAllNotes();
  }, [muted]);
  useEffect(() => () => stopAllNotes(), []);

  // Audio may only start after a gesture: the first press anywhere on the page
  // creates the AudioContext and starts loading samples. pointerup/touchend
  // also resume it, since on touch screens pointerdown alone doesn't count.
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'pointerup', 'touchend'] as const;
    const onGesture = () => unlockAudio();
    events.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onGesture, { capture: true }));
  }, []);

  const choose = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      sfx.select();
      setMode(m);
    },
    [mode],
  );

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = MODES.findIndex((m) => m.id === mode);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = MODES[(i + step + MODES.length) % MODES.length].id;
    choose(next);
    tabs.current.get(next)?.focus();
  };

  return (
    <GameShell title="Piano" accent="cyan" subtitle="Play freely, train your ear, or play in the air.">
      <div className="pn-head">
        <div className="pn-tabs" role="tablist" aria-label="Piano modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              ref={(el) => {
                if (el) tabs.current.set(m.id, el);
              }}
              id={`pn-tab-${m.id}`}
              type="button"
              role="tab"
              className="px-btn px-btn--small pn-tab"
              aria-selected={mode === m.id}
              aria-controls={`pn-panel-${m.id}`}
              tabIndex={mode === m.id ? 0 : -1}
              onClick={() => choose(m.id)}
              onKeyDown={onTabKey}
            >
              {m.label}
            </button>
          ))}
        </div>
        <StatusChip status={status} muted={muted} />
      </div>

      <div id={`pn-panel-${mode}`} role="tabpanel" aria-labelledby={`pn-tab-${mode}`}>
        {mode === 'free' && <FreePlay names={names} setNames={setNames} letters={letters} setLetters={setLetters} />}
        {mode === 'ear' && <EarTraining names={names} letters={letters} />}
        {mode === 'cam' && (
          <Suspense fallback={<p className="pn-help text-center">Loading the webcam piano…</p>}>
            <WebcamPiano names={names} onExit={() => choose('free')} />
          </Suspense>
        )}
      </div>
    </GameShell>
  );
}
