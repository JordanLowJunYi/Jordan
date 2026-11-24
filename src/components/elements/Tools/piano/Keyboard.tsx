import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { prefersReducedMotion } from '../../../../lib/motion';
import { MIDDLE_C, isBlack, letterFor, noteName, pick, range, spokenName } from './notes';

export type KeyMark = 'correct' | 'wrong' | 'root' | 'answer';

const FLOAT_GLYPHS = ['♪', '♫', '♩'];
const FLOAT_COLOURS = ['var(--px-cyan)', 'var(--px-pink)', 'var(--px-amber)', 'var(--px-green)', 'var(--px-purple)'];

/**
 * Pixel-art piano keyboard. Plays with mouse, touch (multi-touch, and sliding
 * a finger across keys glides from note to note), and the keyboard: Tab into
 * it, ←/→ to move between keys, Space or Enter to play. The parent owns the
 * sound: it gets onPress(source, midi) / onRelease(source).
 */
export function Keyboard({
  low,
  high,
  lit,
  marks,
  showNames,
  letterBase,
  onPress,
  onRelease,
  label,
  lidText = 'PIXEL GRAND',
}: {
  low: number;
  high: number;
  lit: ReadonlySet<number>;
  marks?: ReadonlyMap<number, KeyMark>;
  showNames: boolean;
  /** MIDI note the computer-keyboard map starts on; null hides the letters. */
  letterBase: number | null;
  onPress: (source: string, midi: number) => void;
  onRelease: (source: string) => void;
  label: string;
  lidText?: string;
}) {
  const notes = useMemo(() => range(low, high), [low, high]);
  const whiteCount = notes.filter((m) => !isBlack(m)).length;
  const keysRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const floatRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const pointers = useRef(new Map<number, number | null>()); // pointerId -> note under it
  const [focusNote, setFocusNote] = useState(() => (MIDDLE_C >= low && MIDDLE_C <= high ? MIDDLE_C : low));
  const tabNote = focusNote >= low && focusNote <= high ? focusNote : low;

  // Where each key sits, as a % of the keyboard width (for black keys and floating notes).
  const whiteIndex = useMemo(() => {
    const idx = new Map<number, number>();
    let w = 0;
    notes.forEach((m) => {
      idx.set(m, w);
      if (!isBlack(m)) w += 1;
    });
    return idx;
  }, [notes]);
  const centres = useMemo(() => {
    const at = new Map<number, number>();
    whiteIndex.forEach((w, m) => at.set(m, ((isBlack(m) ? w : w + 0.5) / whiteCount) * 100));
    return at;
  }, [whiteIndex, whiteCount]);

  // ---------- pointer input (mouse, pen, touch) ----------
  const noteAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-midi]');
    if (!el || !keysRef.current?.contains(el)) return null;
    return Number(el.dataset.midi);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-midi]');
    if (!el) return;
    e.preventDefault();
    try {
      keysRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    const m = Number(el.dataset.midi);
    pointers.current.set(e.pointerId, m);
    onPress(`ptr:${e.pointerId}`, m);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const current = pointers.current.get(e.pointerId);
    const m = noteAt(e.clientX, e.clientY);
    if (m === current) return;
    pointers.current.set(e.pointerId, m);
    if (m === null) onRelease(`ptr:${e.pointerId}`);
    else onPress(`ptr:${e.pointerId}`, m);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    onRelease(`ptr:${e.pointerId}`);
  };

  // ---------- keyboard focus input ----------
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, m: number) => {
    const moves: Record<string, number> = {
      ArrowRight: m + 1,
      ArrowLeft: m - 1,
      ArrowUp: m + 12,
      ArrowDown: m - 12,
      Home: low,
      End: high,
    };
    if (e.key in moves) {
      e.preventDefault();
      const next = Math.min(high, Math.max(low, moves[e.key]));
      setFocusNote(next);
      buttons.current.get(next)?.focus();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // don't also advance a dialogue box
      if (!e.repeat) onPress('focus', m);
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onRelease('focus');
    }
  };

  // Screen-reader "click" (no pointer, no key events): a short tap.
  const tapTimer = useRef(0);
  const onAssistiveClick = (detail: number, m: number) => {
    if (detail !== 0) return;
    onPress('assist', m);
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => onRelease('assist'), 400);
  };
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  // Phones: the keys scroll sideways inside the panel; the lid is the handle.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);

  // ---------- floating notes from newly lit keys ----------
  const prevLit = useRef<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const prev = prevLit.current;
    prevLit.current = lit;
    const layer = floatRef.current;
    if (!layer || prefersReducedMotion()) return;
    lit.forEach((m) => {
      const at = centres.get(m);
      if (prev.has(m) || at === undefined || layer.childElementCount > 18) return;
      const el = document.createElement('span');
      el.className = 'pn-float';
      el.textContent = pick(FLOAT_GLYPHS);
      el.style.left = `${at}%`;
      el.style.color = pick(FLOAT_COLOURS);
      el.addEventListener('animationend', () => el.remove(), { once: true });
      layer.appendChild(el);
    });
  }, [lit, centres]);

  return (
    <div className="pn-scroll" ref={scrollRef} data-overflow={overflowing || undefined}>
      <div className="pn-board" style={{ '--pn-whites': whiteCount } as CSSProperties}>
        <div className="pn-lid" aria-hidden="true">
          <span className="pn-lid__brand">♪ {lidText} ♪</span>
          <span className="pn-lid__swipe">◀ swipe the lid to scroll ▶</span>
          <div className="pn-floats" ref={floatRef} />
        </div>
        <div className="pn-felt" aria-hidden="true" />
        <div
          ref={keysRef}
          className="pn-keys"
          role="group"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          {notes.map((m) => {
            const black = isBlack(m);
            const letter = letterBase === null ? undefined : letterFor(m, letterBase);
            return (
              <button
                key={m}
                ref={(el) => {
                  if (el) buttons.current.set(m, el);
                  else buttons.current.delete(m);
                }}
                type="button"
                data-midi={m}
                data-lit={lit.has(m) || undefined}
                data-mark={marks?.get(m)}
                className={black ? 'pn-key pn-key--black' : 'pn-key pn-key--white'}
                style={black ? ({ '--pn-at': whiteIndex.get(m) } as CSSProperties) : undefined}
                tabIndex={m === tabNote ? 0 : -1}
                aria-label={spokenName(m) + (marks?.get(m) === 'root' ? ', first note' : '')}
                onFocus={() => setFocusNote(m)}
                onKeyDown={(e) => onKeyDown(e, m)}
                onKeyUp={onKeyUp}
                onBlur={() => onRelease('focus')}
                onClick={(e) => onAssistiveClick(e.detail, m)}
              >
                <span className="pn-key__labels" aria-hidden="true">
                  {marks?.get(m) === 'root' && <span className="pn-key__badge">1st</span>}
                  {letter && <span className="pn-key__letter">{letter}</span>}
                  {showNames && <span className="pn-key__name">{noteName(m)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
