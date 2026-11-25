import { useEffect, useState, type RefObject } from 'react';

/**
 * A number that changes whenever the window is resized (or a phone rotates),
 * or `ref`'s element changes size on its own (a banner or alert appearing
 * above it, a hidden tab shown again). The canvases size their bitmap to the
 * element only when they redraw, so they add this to their draw effect's
 * dependencies to avoid a stretched picture. Pass `key` when the element is
 * only rendered some of the time, so it is observed once it appears.
 */
export function useResizeTick(ref?: RefObject<Element | null>, key?: unknown): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    const el = ref?.current;
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [ref, key]);
  return tick;
}

/**
 * Size a canvas's bitmap to its on-screen size times the device pixel ratio,
 * so lines and labels are sharp on phones and retina screens, and scale the
 * context so drawing code keeps working in CSS pixels. Returns that CSS size.
 */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { W: number; H: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: rect.width, H: rect.height };
}
