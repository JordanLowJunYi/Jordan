import { useSyncExternalStore } from 'react';

/**
 * True while the CSS media query matches, updating live as the window
 * resizes or the phone rotates. It is right on the very first render, which
 * matters for the carousels: react-slick 0.31's own `responsive` option only
 * reacts to later resizes, so phones were getting the desktop layout.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
