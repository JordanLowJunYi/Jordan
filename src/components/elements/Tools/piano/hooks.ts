import { useCallback, useEffect, useRef, useState } from 'react';
import { KEY_CODES } from './notes';
import { playNote, type Voice } from './sound';

/**
 * Every input (a mouse pointer, a finger, a computer key, a webcam fingertip)
 * is a "source" that holds at most one note. Pressing a new note with the same
 * source lets go of its old one, which is what makes glissando work.
 *
 * `lit` is the set of notes currently held, for lighting keys.
 */
export function useVoices(onNoteOn?: (midi: number, source: string) => void) {
  const voices = useRef(new Map<string, { midi: number; voice: Voice }>());
  const ringing = useRef(new Set<Voice>());
  const sustainRef = useRef(false);
  const onNoteOnRef = useRef(onNoteOn);
  const [lit, setLit] = useState<ReadonlySet<number>>(() => new Set());
  const litRef = useRef<ReadonlySet<number>>(lit);

  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
  });

  const sync = useCallback(() => {
    const next = new Set<number>();
    voices.current.forEach((v) => next.add(v.midi));
    litRef.current = next;
    setLit(next);
  }, []);

  const letGo = useCallback((voice: Voice) => {
    if (!sustainRef.current) {
      voice.stop();
      return;
    }
    const rings = ringing.current;
    rings.add(voice);
    // Keep the pedal from piling up forever: damp the oldest past 48 notes.
    if (rings.size > 48) {
      const oldest = rings.values().next().value;
      if (oldest) {
        oldest.stop();
        rings.delete(oldest);
      }
    }
  }, []);

  const press = useCallback(
    (source: string, midi: number) => {
      const prev = voices.current.get(source);
      if (prev?.midi === midi) return;
      if (prev) letGo(prev.voice);
      voices.current.set(source, { midi, voice: playNote(midi) });
      sync();
      onNoteOnRef.current?.(midi, source);
    },
    [letGo, sync],
  );

  const release = useCallback(
    (source: string) => {
      const held = voices.current.get(source);
      if (!held) return;
      voices.current.delete(source);
      letGo(held.voice);
      sync();
    },
    [letGo, sync],
  );

  const releaseAll = useCallback(() => {
    voices.current.forEach((v) => v.voice.stop());
    voices.current.clear();
    ringing.current.forEach((v) => v.stop());
    ringing.current.clear();
    sync();
  }, [sync]);

  /** Sustain pedal: while on, let-go notes keep ringing. Off damps them. */
  const setSustain = useCallback((on: boolean) => {
    sustainRef.current = on;
    if (!on) {
      ringing.current.forEach((v) => v.stop());
      ringing.current.clear();
    }
  }, []);

  useEffect(() => {
    const held = voices.current;
    const rings = ringing.current;
    return () => {
      held.forEach((v) => v.voice.stop());
      held.clear();
      rings.forEach((v) => v.stop());
      rings.clear();
    };
  }, []);

  return { lit, litRef, press, release, releaseAll, setSustain };
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Play the piano from the computer keyboard: A W S E D F T G Y H U J K O L P ; '
 * starting at `base`. Held keys are released if the window loses focus, so no
 * note gets stuck.
 */
export function useComputerKeys(
  base: number,
  enabled: boolean,
  press: (source: string, midi: number) => void,
  release: (source: string) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const held = new Set<string>();
    const codes: readonly string[] = KEY_CODES;

    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const i = codes.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      if (e.repeat || held.has(e.code)) return;
      held.add(e.code);
      press(`key:${e.code}`, base + i);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!held.delete(e.code)) return;
      release(`key:${e.code}`);
    };
    const releaseHeld = () => {
      held.forEach((code) => release(`key:${code}`));
      held.clear();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseHeld);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseHeld);
      releaseHeld();
    };
  }, [base, enabled, press, release]);
}
