import { useEffect, useState } from 'react';

/**
 * A number that changes whenever the window is resized (or a phone rotates).
 * The canvases size their bitmap to the element only when they redraw, so they
 * add this to their draw effect's dependencies to avoid a stretched picture.
 */
export function useResizeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return tick;
}
