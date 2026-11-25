import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Once registered, ScrollTrigger keeps a requestAnimationFrame loop and a 4 Hz
// timer running until it is disabled, on every page of the site. Only the home
// page's scroll animations use it, so it is registered on first use rather than
// on import (a visitor who goes straight to the arcade never starts it), and it
// is switched off again once the last home-page animation has let go of it.

let holders = 0;
let state: 'unregistered' | 'on' | 'off' = 'unregistered';
let offTimer = 0;

/**
 * Switch ScrollTrigger on (if it is off) before creating any triggers, and
 * call the returned function after killing them. Triggers made while it is
 * disabled do nothing, so the order matters.
 */
export function holdScrollTrigger(): () => void {
  window.clearTimeout(offTimer);
  if (state === 'unregistered') gsap.registerPlugin(ScrollTrigger);
  else if (state === 'off') ScrollTrigger.enable();
  state = 'on';
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    // Wait before switching off: a re-render that re-runs an effect, or a quick
    // Back to the home page, takes it straight back without a disable/enable.
    window.clearTimeout(offTimer);
    offTimer = window.setTimeout(() => {
      if (holders === 0 && state === 'on') {
        ScrollTrigger.disable();
        state = 'off';
      }
    }, 1000);
  };
}

export { ScrollTrigger };
