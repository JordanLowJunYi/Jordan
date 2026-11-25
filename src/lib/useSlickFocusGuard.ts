import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Keeps keyboard focus on the slides a react-slick carousel is showing.
 *
 * react-slick 0.31 wraps every slide in two plain divs of its own, so the
 * aria-hidden it sets on off-screen and cloned slides never reaches the card
 * inside, and their buttons stay in the Tab order. Tabbing onto one scrolls
 * the clipped .slick-list sideways, which leaves the carousel showing empty
 * slots until the page is reloaded.
 *
 * This makes every slide slick hides inert (out of the Tab order and out of
 * reach of clicks), follows slick as it moves, and snaps .slick-list back if
 * anything still scrolls it.
 */
export function useSlickFocusGuard(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      root.querySelectorAll<HTMLElement>('.slick-slide').forEach((slide) => {
        const hidden = slide.getAttribute('aria-hidden') === 'true';
        if (slide.inert !== hidden) slide.inert = hidden;
      });
    };
    sync();

    // Slick flips aria-hidden as it moves, and re-renders its slides on resize.
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden'] });

    // Scroll events do not bubble, so listen in the capture phase.
    const unscroll = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLElement && el.classList.contains('slick-list') && el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
    };
    root.addEventListener('scroll', unscroll, true);

    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', unscroll, true);
    };
  }, [rootRef]);
}
