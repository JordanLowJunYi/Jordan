// Small pixel-art icons drawn as crisp SVG rects (no image files).
import type { PixelArt } from './icons';

export function PixelIcon({ art, size = 20, className = '' }: { art: PixelArt; size?: number; className?: string }) {
  const h = art.rows.length;
  const w = Math.max(...art.rows.map((r) => r.length));
  const rects: { x: number; y: number; w: number; c: string }[] = [];
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = art.pal[row[x]];
      if (!c) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === row[x]) run++;
      rects.push({ x, y, w: run, c });
      x += run;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
}
