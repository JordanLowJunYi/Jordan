import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { load, save, sfx } from '../arcade';
import { useComputerKeys, useVoices } from './hooks';
import { Keyboard } from './Keyboard';
import { noteName } from './notes';
import { preloadRange } from './sound';
import { Toggle } from './ui';

const MIN_OCTAVE = 1;
const MAX_OCTAVE = 6;
const STRIP_LENGTH = 24;

/** Free play: two octaves (plus the top C), octave shift, sustain, notes-played strip. */
export function FreePlay({
  names,
  setNames,
  letters,
  setLetters,
}: {
  names: boolean;
  setNames: (v: boolean) => void;
  letters: boolean;
  setLetters: (v: boolean) => void;
}) {
  const [octave, setOctave] = useState(() => {
    const saved = load<number>('piano:octave', 4);
    return Number.isInteger(saved) && saved >= MIN_OCTAVE && saved <= MAX_OCTAVE ? saved : 4;
  });
  const [sustain, setSustainState] = useState(false);
  const [played, setPlayed] = useState<{ id: number; midi: number }[]>([]);
  const nextId = useRef(0);

  const low = (octave + 1) * 12; // C of that octave
  const high = low + 24;

  const onNoteOn = useCallback((midi: number) => {
    const id = nextId.current++;
    setPlayed((p) => [...p.slice(-(STRIP_LENGTH - 1)), { id, midi }]);
  }, []);
  const { lit, press, release, setSustain } = useVoices(onNoteOn);
  useComputerKeys(low, true, press, release);

  useEffect(() => preloadRange(low, high), [low, high]);
  useEffect(() => save('piano:octave', octave), [octave]);
  useEffect(() => setSustain(sustain), [sustain, setSustain]);

  const shift = useCallback(
    (by: number) => {
      const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave + by));
      if (next === octave) return;
      sfx.move();
      setOctave(next);
    },
    [octave],
  );

  // Z / X shift the octave, like most computer-keyboard synths.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.code === 'KeyZ') shift(-1);
      else if (e.code === 'KeyX') shift(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shift]);

  return (
    <div className="grid gap-4">
      <div className="px-box pn-panel">
        <div className="pn-toolbar">
          <div className="pn-octave" role="group" aria-label="Octave">
            <button
              type="button"
              className="px-btn px-btn--small"
              onClick={() => shift(-1)}
              disabled={octave <= MIN_OCTAVE}
              aria-label="Octave down"
              title="Octave down (Z)"
            >
              ◀ <span className="pn-hide-xs">Oct</span>
            </button>
            <span className="pn-octave__range" aria-live="polite">
              {noteName(low)}–{noteName(high)}
            </span>
            <button
              type="button"
              className="px-btn px-btn--small"
              onClick={() => shift(1)}
              disabled={octave >= MAX_OCTAVE}
              aria-label="Octave up"
              title="Octave up (X)"
            >
              <span className="pn-hide-xs">Oct</span> ▶
            </button>
          </div>
          <div className="pn-toggles">
            <Toggle on={sustain} onChange={setSustainState} title="Let notes ring after you let go">
              Sustain
            </Toggle>
            <Toggle on={names} onChange={setNames} title="Show note names on the keys">
              Names
            </Toggle>
            <Toggle on={letters} onChange={setLetters} title="Show computer-keyboard letters on the keys">
              Keys
            </Toggle>
          </div>
        </div>

        <Keyboard
          low={low}
          high={high}
          lit={lit}
          showNames={names}
          letterBase={letters ? low : null}
          onPress={press}
          onRelease={release}
          label={`Piano keyboard, ${noteName(low)} to ${noteName(high)}`}
        />

        <div className="pn-strip">
          <span className="px-label pn-strip__label">Notes</span>
          <ol className="pn-strip__list" aria-label="Notes played, newest last">
            {played.length === 0 && <li className="pn-strip__empty">Play something!</li>}
            {played.map((p, i) => (
              <li key={p.id} data-new={i === played.length - 1 || undefined}>
                {noteName(p.midi)}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="px-btn px-btn--icon"
            aria-label="Clear notes played"
            title="Clear"
            disabled={played.length === 0}
            onClick={() => {
              sfx.back();
              setPlayed([]);
            }}
          >
            <Eraser size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul className="pn-legend" aria-label="How to play">
        <li>Click, tap or slide across the keys. Several fingers work too.</li>
        <li className="pn-legend__kbd">
          <kbd>A</kbd>–<kbd>&apos;</kbd> play the keys with letters on them
        </li>
        <li className="pn-legend__kbd">
          <kbd>Z</kbd> <kbd>X</kbd> octave down / up
        </li>
        <li className="pn-legend__kbd">
          <kbd>Tab</kbd> into the keys, <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Space</kbd> to play
        </li>
      </ul>
    </div>
  );
}
