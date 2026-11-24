// Background music for the site: a song that loops on the shared
// AudioContext, queued a little ahead of time by a small scheduler, and
// following the site-wide mute. The arcade menu and the portfolio home
// page each have one.
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioContext, isMuted } from './sfx';

/** What a song builds on an AudioContext when it starts playing. */
export interface SongVoices {
  /** The song's output level; the player fades it in and out. */
  master: GainNode;
  /** Queue everything that sounds on sixteenth `step` of the loop, at time `at`. */
  play(step: number, at: number): void;
  /** Stop anything the song keeps running between notes, such as an LFO. */
  dispose?(): void;
}

export interface Song {
  title: string;
  /** Sixteenths in one pass of the loop. */
  steps: number;
  /** Length of one sixteenth, in seconds. */
  stepSeconds: number;
  /** Output gain while playing. */
  volume: number;
  mount(ac: BaseAudioContext, out: AudioNode): SongVoices;
}

/** Render `loops` passes of a song into an offline context (used to check levels). */
export function renderSong(ac: OfflineAudioContext, song: Song, loops = 1) {
  const voices = song.mount(ac, ac.destination);
  voices.master.gain.value = song.volume;
  for (let s = 0; s < song.steps * loops; s++) voices.play(s % song.steps, 0.05 + s * song.stepSeconds);
}

export interface Player {
  start(): void;
  stop(): void;
  readonly playing: boolean;
}

/** Loops a song with a look-ahead scheduler, fading in on start and out on stop. */
export function createPlayer(song: Song): Player {
  let timer: number | null = null;
  let step = 0;
  let nextTime = 0;
  let voices: SongVoices | null = null;
  let mutedNow: boolean | null = null;

  function schedule() {
    const ac = audioContext();
    if (!ac || !voices) return;
    if (isMuted() !== mutedNow) {
      mutedNow = isMuted();
      voices.master.gain.setTargetAtTime(mutedNow ? 0 : song.volume, ac.currentTime, 0.08);
    }
    // After a stall (a busy page, a throttled tab), skip the missed notes
    // instead of playing them all at once.
    if (nextTime < ac.currentTime - 0.1) {
      const missed = Math.ceil((ac.currentTime - nextTime) / song.stepSeconds);
      step += missed;
      nextTime += missed * song.stepSeconds;
    }
    while (nextTime < ac.currentTime + 0.2) {
      voices.play(step % song.steps, nextTime);
      nextTime += song.stepSeconds;
      step++;
    }
  }

  return {
    get playing() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      const ac = audioContext();
      if (!ac) return;
      voices = song.mount(ac, ac.destination);
      voices.master.gain.value = 0;
      mutedNow = null;
      step -= step % 16; // pick up again from the start of the bar
      nextTime = ac.currentTime + 0.08;
      schedule();
      timer = window.setInterval(schedule, 50);
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      const ac = audioContext();
      const v = voices;
      voices = null;
      if (ac && v) {
        v.master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
        window.setTimeout(() => {
          v.master.disconnect();
          v.dispose?.();
        }, 600);
      }
    },
  };
}

// Input that counts as a user gesture for sound. On touch screens the
// browser only allows sound once the finger lifts, hence pointerup/touchend.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
const LISTEN = { capture: true, passive: true } as const;

/**
 * Plays `song` while the component is mounted. Browsers only allow sound
 * after the visitor has clicked, tapped or pressed a key on the site, so it
 * starts straight away if they already have, and otherwise on their first
 * one. Presses on a `[data-sound-toggle]` button are left to that button,
 * which calls `start` itself. The song pauses while the tab is hidden.
 */
export function useSong(song: Song): { playing: boolean; start: () => void } {
  const [playing, setPlaying] = useState(false);
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    const player = createPlayer(song);
    let allowed = false;
    let disposed = false;

    const begin = () => {
      if (disposed || !allowed || document.hidden || player.playing) return;
      player.start();
      setPlaying(true);
    };
    const unlock = () => {
      if (allowed) return begin();
      const ac = audioContext(); // creates it if needed and asks to resume
      if (!ac) return;
      const ready = () => {
        if (disposed || allowed || ac.state !== 'running') return;
        allowed = true;
        GESTURES.forEach((g) => window.removeEventListener(g, onGesture, LISTEN));
        begin();
      };
      if (ac.state === 'running') ready();
      else ac.resume().then(ready, () => {});
    };
    function onGesture(e: Event) {
      if (e.target instanceof Element && e.target.closest('[data-sound-toggle]')) return;
      unlock();
    }
    const onVisibility = () => (document.hidden ? player.stop() : begin());

    GESTURES.forEach((g) => window.addEventListener(g, onGesture, LISTEN));
    document.addEventListener('visibilitychange', onVisibility);
    if (navigator.userActivation?.hasBeenActive) unlock();
    startRef.current = unlock;

    return () => {
      disposed = true;
      startRef.current = () => {};
      player.stop();
      GESTURES.forEach((g) => window.removeEventListener(g, onGesture, LISTEN));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [song]);

  const start = useCallback(() => startRef.current(), []);
  return { playing, start };
}
