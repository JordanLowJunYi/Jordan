import { useEffect, useRef } from 'react';

/**
 * Draws a small pixel-art picture from a text map, e.g.
 *   rows={['.kk.', 'kyyk', '.kk.']} palette={{ k: '#000', y: '#fbbf24' }}
 * Each character is one pixel; '.' (or any unmapped character) is transparent.
 * The canvas is scaled up crisply by CSS to `size` px wide.
 */
export function PixelArt({
  rows,
  palette,
  size = 64,
  className = '',
  label,
}: {
  rows: string[];
  palette: Record<string, string>;
  size?: number;
  className?: string;
  label?: string; // accessible name; omit for decorative art
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = palette[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
  }, [rows, palette, w, h]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={`px-canvas ${className}`}
      style={{ width: size, height: (size * h) / w }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
