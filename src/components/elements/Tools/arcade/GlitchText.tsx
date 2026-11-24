import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../../../lib/motion';

const GLYPHS = ['!', '#', '$', '%', '&', '*', '@', '█', '▓', '?'];
const COLOURS = ['#f472b6', '#22d3ee', '#fbbf24', '#4ade80', '#a78bfa', '#f87171'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/**
 * Types `text` out one letter at a time; the newest letter flickers through
 * random glyphs and colours before it settles. Ported from the "RGB Words"
 * toy on the 2025 site. Changing `replayKey` plays it again.
 */
export function GlitchText({
  text,
  interval = 70,
  replayKey = 0,
  className = '',
}: {
  text: string;
  interval?: number;
  replayKey?: number;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);
  const [glyph, setGlyph] = useState({ ch: '', colour: COLOURS[0] });

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const reveal = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(reveal);
    }, interval);
    const flicker = window.setInterval(() => setGlyph({ ch: pick(GLYPHS), colour: pick(COLOURS) }), interval / 2);
    const stop = window.setTimeout(() => window.clearInterval(flicker), interval * (text.length + 2));
    return () => {
      window.clearInterval(reveal);
      window.clearInterval(flicker);
      window.clearTimeout(stop);
    };
  }, [text, interval, replayKey, reduced]);

  const done = shown >= text.length;
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">
        {text.split('').map((c, idx) => {
          if (idx < shown - 1 || (done && idx < text.length)) return <span key={idx}>{c}</span>;
          if (idx === shown - 1 && c !== ' ')
            return (
              <span key={idx} style={{ color: glyph.colour }}>
                {glyph.ch || c}
              </span>
            );
          return (
            <span key={idx} style={{ visibility: idx < shown ? 'visible' : 'hidden' }}>
              {c}
            </span>
          );
        })}
      </span>
    </span>
  );
}
