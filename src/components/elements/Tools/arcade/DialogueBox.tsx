import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../../../lib/motion';
import { sfx } from './sfx';

export interface Choice {
  label: string;
  onSelect: () => void;
}

/**
 * RPG-style dialogue box. Types each line out letter by letter with a soft
 * tick. Space / Enter / Z / click finishes the line, then moves to the next.
 * After the last line it shows `choices` (↑↓ + Enter, or click) if given,
 * otherwise calls `onDone`.
 *
 * It listens on window while mounted, so the game behind it should ignore
 * input while a dialogue is open.
 */
export function DialogueBox({
  lines,
  speaker,
  choices,
  onDone,
  className = '',
}: {
  lines: string[];
  speaker?: string;
  choices?: Choice[];
  onDone?: () => void;
  className?: string;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [cursor, setCursor] = useState(0);
  const line = lines[lineIndex] ?? '';
  const typing = shown < line.length;
  const lastLine = lineIndex >= lines.length - 1;
  const showChoices = !typing && lastLine && !!choices?.length;
  const doneRef = useRef(false);

  // Restart when given a new conversation.
  useEffect(() => {
    setLineIndex(0);
    setShown(prefersReducedMotion() ? (lines[0] ?? '').length : 0);
    setCursor(0);
    doneRef.current = false;
  }, [lines]);

  // Typewriter.
  useEffect(() => {
    if (!typing) return;
    const id = window.setTimeout(() => {
      setShown((s) => s + 1);
      const ch = line[shown];
      if (ch && ch !== ' ' && shown % 2 === 0) sfx.text();
    }, line[shown - 1] && '.,!?'.includes(line[shown - 1]) ? 120 : 28);
    return () => window.clearTimeout(id);
  }, [typing, shown, line]);

  const advance = useCallback(() => {
    if (typing) {
      setShown(line.length);
      return;
    }
    if (!lastLine) {
      setLineIndex((i) => i + 1);
      setShown(prefersReducedMotion() ? (lines[lineIndex + 1] ?? '').length : 0);
      return;
    }
    if (showChoices) {
      sfx.select();
      choices![cursor].onSelect();
      return;
    }
    if (!doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [typing, line.length, lastLine, showChoices, choices, cursor, onDone, lines, lineIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a held key auto-repeats; don't let it skip through the conversation
      if (e.repeat) return;
      // never steal keys from a text field the player is typing in
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // a focused button or link (a choice, the back button, a game control)
      // handles Enter/Space itself; advancing as well would double-fire
      if (t && ['Enter', ' '].includes(e.key) && t.closest('button, a, select, summary')) return;
      if (['Enter', ' ', 'z', 'Z'].includes(e.key)) {
        e.preventDefault();
        advance();
      } else if (showChoices && ['ArrowUp', 'w', 'W', 'ArrowLeft', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        sfx.move();
        setCursor((c) => (c - 1 + choices!.length) % choices!.length);
      } else if (showChoices && ['ArrowDown', 's', 'S', 'ArrowRight', 'd', 'D'].includes(e.key)) {
        e.preventDefault();
        sfx.move();
        setCursor((c) => (c + 1) % choices!.length);
      } else if ((e.key === 'Escape' || e.key === 'x' || e.key === 'X') && !typing && !showChoices) {
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, showChoices, choices, typing]);

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={speaker ? `${speaker} says` : 'Message'}
      className={`px-box px-dialogue relative select-none ${className}`}
      onClick={(e) => {
        // clicks on a choice are handled by the choice itself
        if ((e.target as HTMLElement).closest('.px-choice')) return;
        advance();
      }}
    >
      {speaker && <span className="px-dialogue__speaker">{speaker}</span>}
      <p className="m-0 whitespace-pre-wrap" aria-hidden={typing}>
        <span>{line.slice(0, shown)}</span>
        {/* reserve the rest so the box doesn't grow while typing */}
        <span className="invisible">{line.slice(shown)}</span>
      </p>
      {/* full line for screen readers */}
      <span className="sr-only">{line}</span>

      {showChoices && (
        <div className="mt-3 grid gap-1 sm:grid-cols-2">
          {choices!.map((c, i) => (
            <button
              key={c.label}
              type="button"
              className="px-choice"
              data-active={i === cursor}
              onMouseEnter={() => setCursor(i)}
              // Tab focus moves the ▶ too, so what you see is what Enter / Z picks
              onFocus={() => setCursor(i)}
              onClick={() => {
                sfx.select();
                c.onSelect();
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {!typing && !showChoices && <span className="px-dialogue__more" aria-hidden="true">▼</span>}
    </div>
  );
}
