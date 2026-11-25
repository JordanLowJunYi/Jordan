// A pixel music visualiser. Three sources (an original chiptune synthesised
// live, the microphone, or an audio file from the visitor's own device) feed a
// Web Audio AnalyserNode, and a small canvas draws it as LED bars, a radial
// burst or an oscilloscope. No libraries, no uploads.
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Activity,
  ChartNoAxesColumn,
  FolderOpen,
  Maximize,
  Mic,
  Minimize,
  Music,
  Pause,
  Play,
  Sun,
} from 'lucide-react';
import { GameShell, audioContext, isMuted, load, save, sfx, useMuted } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import { SONG_TITLE } from './chiptune';
import { Engine, MicError, type SourceKind } from './engine';
import { THEMES, draw, newDrawState, type Mode, type Theme } from './draw';
import './visualiser.css';

const MODES: { id: Mode; label: string; Icon: typeof Activity }[] = [
  { id: 'bars', label: 'Bars', Icon: ChartNoAxesColumn },
  { id: 'burst', label: 'Burst', Icon: Sun },
  { id: 'scope', label: 'Scope', Icon: Activity },
];

const SOURCES: { id: SourceKind; short: string; long: string; Icon: typeof Activity }[] = [
  { id: 'demo', short: 'Demo', long: 'Demo track', Icon: Music },
  { id: 'mic', short: 'Mic', long: 'Microphone', Icon: Mic },
  { id: 'file', short: 'File', long: 'Audio file', Icon: FolderOpen },
];

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i;

interface Prefs {
  mode: Mode;
  theme: string;
}

export default function Visualiser() {
  // a saved `null` (or anything that isn't an object) used to crash the page
  const [prefs] = useState<Partial<Prefs>>(() => {
    const saved = load<unknown>('visualiser', null);
    return saved && typeof saved === 'object' ? (saved as Partial<Prefs>) : {};
  });
  const [mode, setMode] = useState<Mode>(MODES.find((m) => m.id === prefs.mode)?.id ?? 'bars');
  const [theme, setTheme] = useState<Theme>(THEMES.find((t) => t.id === prefs.theme) ?? THEMES[0]);
  const [source, setSource] = useState<SourceKind>('demo');
  const [playing, setPlaying] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [muted] = useMuted();

  const engineRef = useRef<Engine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef(mode);
  const themeRef = useRef(theme);
  const playingRef = useRef(false);
  const pausedAtRef = useRef(0);
  const calmRef = useRef(prefersReducedMotion());
  const reqRef = useRef(0); // the latest request wins; older async results are ignored

  const fsSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    modeRef.current = mode;
    themeRef.current = theme;
    save<Prefs>('visualiser', { mode, theme: theme.id });
  }, [mode, theme]);

  useEffect(() => {
    playingRef.current = playing;
    if (playing) setHasPlayed(true);
    else pausedAtRef.current = performance.now();
  }, [playing]);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  // reduced motion: steadier analyser and calmer drawing, kept live
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => {
      calmRef.current = mq.matches;
      engineRef.current?.setCalm(mq.matches);
    };
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // stop every sound and the mic, and free the file, when leaving the page
  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const on = () => setIsFs(!!stageRef.current && document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  /** Created on the first press, so the browser allows audio. */
  const ensureEngine = useCallback(() => {
    if (engineRef.current) {
      audioContext(); // resumes the shared context if it was suspended
      return engineRef.current;
    }
    const ac = audioContext();
    if (!ac) {
      setError("This browser doesn't support Web Audio, so the visualiser can't run here.");
      return null;
    }
    const eng = new Engine(ac);
    eng.setMuted(isMuted());
    eng.setCalm(calmRef.current);
    eng.onEnded = () => {
      setPlaying(false);
      setEnded(true);
    };
    eng.onFileError = () => {
      setPlaying(false);
      setError("Your browser couldn't play that file. Try an MP3, WAV, OGG or M4A.");
    };
    engineRef.current = eng;
    return eng;
  }, []);

  const start = useCallback(
    async (kind: SourceKind) => {
      setError(null);
      const eng = ensureEngine();
      if (!eng) return;
      const req = ++reqRef.current;
      eng.stopAllBut(kind);
      setSource(kind);
      setEnded(false);
      setMicBusy(false);
      setLoadingFile(false);
      if (kind === 'demo') {
        eng.playDemo();
        setPlaying(true);
      } else if (kind === 'file') {
        if (!eng.hasFile) {
          setPlaying(false);
          fileRef.current?.click();
          return;
        }
        setLoadingFile(true);
        try {
          await eng.playFile();
          if (req === reqRef.current) setPlaying(true);
        } catch {
          if (req !== reqRef.current) return;
          setPlaying(false);
          setError("Your browser couldn't play that file. Try an MP3, WAV, OGG or M4A.");
        } finally {
          if (req === reqRef.current) setLoadingFile(false);
        }
      } else {
        setPlaying(false);
        setMicBusy(true);
        try {
          const ok = await eng.startMic();
          if (ok && req === reqRef.current) setPlaying(true);
        } catch (e) {
          if (req === reqRef.current)
            setError(e instanceof MicError ? e.friendly : "Couldn't start the microphone. Please try again.");
        } finally {
          if (req === reqRef.current) setMicBusy(false);
        }
      }
    },
    [ensureEngine],
  );

  const pause = useCallback(() => {
    reqRef.current++;
    engineRef.current?.stopAllBut(null);
    setPlaying(false);
    setMicBusy(false);
    setLoadingFile(false);
  }, []);

  const togglePlay = () => {
    if (playing) {
      sfx.back();
      pause();
    } else {
      void start(source);
    }
  };

  const chooseSource = (kind: SourceKind) => {
    if (kind === 'file') {
      // make the audio context under this click, then open the picker
      ensureEngine();
      fileRef.current?.click();
      return;
    }
    if (kind === source && playing) return;
    void start(kind);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires
    if (!file) return;
    if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) {
      setError("That doesn't look like an audio file. Try an MP3, WAV, OGG or M4A.");
      return;
    }
    const eng = ensureEngine();
    if (!eng) return;
    const req = ++reqRef.current;
    eng.stopAllBut('file');
    eng.loadFile(file);
    setFileName(file.name);
    setSource('file');
    setEnded(false);
    setError(null);
    setPlaying(false);
    setMicBusy(false);
    setLoadingFile(true);
    try {
      await eng.playFile();
      if (req === reqRef.current) setPlaying(true);
    } catch {
      if (req !== reqRef.current) return;
      setPlaying(false);
      setError("Your browser couldn't play that file. Try an MP3, WAV, OGG or M4A.");
    } finally {
      if (req === reqRef.current) setLoadingFile(false);
    }
  };

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      /* the browser said no; nothing to do */
    }
  };

  // ---------- the draw loop ----------
  useEffect(() => {
    const cv = canvasRef.current;
    const box = screenRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !box || !ctx) return;
    let W = 0;
    let H = 0;
    let st = newDrawState();

    const resize = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const P = r.width < 480 ? 3 : r.width < 1100 ? 4 : 5; // CSS pixels per canvas pixel
      W = Math.max(40, Math.floor(r.width / P));
      H = Math.max(30, Math.floor(r.height / P));
      cv.width = W;
      cv.height = H;
      cv.style.width = `${W * P}px`;
      cv.style.height = `${H * P}px`;
      ctx.imageSmoothingEnabled = false;
      st = newDrawState();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    let freq = new Uint8Array(2048);
    const time = new Uint8Array(2048);
    let raf = 0;
    let lastTs = 0;
    let lastPaint = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const calm = calmRef.current;
      const lively = playingRef.current || ts - pausedAtRef.current < 2000;
      const fps = calm ? 20 : lively ? 60 : 12;
      if (ts - lastPaint < 1000 / fps - 1) return;
      const dt = lastTs ? Math.min(ts - lastTs, 200) : 16;
      lastTs = ts;
      lastPaint = ts;
      const eng = engineRef.current;
      if (eng) {
        if (freq.length !== eng.analyser.frequencyBinCount) freq = new Uint8Array(eng.analyser.frequencyBinCount);
        eng.analyser.getByteFrequencyData(freq);
        eng.analyser.getByteTimeDomainData(time);
      } else {
        freq.fill(0);
        time.fill(128);
      }
      if (!W || !H) return;
      draw(
        modeRef.current,
        ctx,
        W,
        H,
        { freq, time, sampleRate: eng?.sampleRate ?? 48000, fftSize: eng?.analyser.fftSize ?? 4096, now: ts, dt, calm },
        st,
        themeRef.current,
      );
    };
    const startLoop = () => {
      if (raf || document.hidden) return;
      lastTs = 0;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? stopLoop() : startLoop());
    document.addEventListener('visibilitychange', onVis);
    startLoop();
    return () => {
      stopLoop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---------- render ----------
  const sourceInfo = SOURCES.find((s) => s.id === source)!;
  let status = '';
  if (playing && source === 'demo') status = `Now playing: ${SONG_TITLE}, an original chiptune synthesised live in your browser.`;
  else if (playing && source === 'mic') status = 'Listening to your microphone. It only drives the pictures and is never played out loud.';
  else if (playing && source === 'file') status = `Now playing: ${fileName ?? 'your file'}`;
  else if (micBusy) status = 'Asking for microphone access...';
  else if (loadingFile) status = `Loading ${fileName ?? 'your file'}...`;
  else if (ended && source === 'file') status = `Finished ${fileName ?? 'your file'}. Press play to hear it again.`;
  else status = hasPlayed ? 'Paused.' : 'Ready when you are. Press play!';
  const silent = playing && muted && source !== 'mic';

  const overlayLabel = micBusy
    ? 'Waiting for the mic...'
    : loadingFile
      ? 'Loading...'
      : source === 'mic'
      ? 'Start listening'
      : source === 'file'
        ? fileName
          ? 'Play file'
          : 'Choose a file'
        : 'Play demo';

  return (
    <GameShell title="Visualiser" accent="purple" subtitle="Turn sound into pixels.">
      <div className="vis mx-auto flex max-w-4xl flex-col gap-5">
        <div role="group" aria-label="Sound source" className="vis-sources grid gap-3">
          {SOURCES.map(({ id, short, long, Icon }) => (
            <button
              key={id}
              type="button"
              className="px-btn px-btn--small vis-source"
              aria-pressed={source === id}
              disabled={id === 'mic' && micBusy}
              onClick={() => chooseSource(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{long}</span>
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e)}
        />

        <div ref={stageRef} className={`px-box vis-stage ${isFs ? 'is-fs' : ''}`}>
          <div ref={screenRef} className="vis-screen">
            <canvas ref={canvasRef} className="px-canvas" aria-hidden="true" />
            {!playing && (
              <div className="vis-overlay">
                <button type="button" className="px-btn" onClick={togglePlay} disabled={micBusy || loadingFile}>
                  <Play size={18} aria-hidden="true" />
                  {overlayLabel}
                </button>
              </div>
            )}
          </div>

          <div className="vis-toolbar">
            <button
              type="button"
              className="px-btn px-btn--small vis-play"
              onClick={togglePlay}
              disabled={micBusy}
            >
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pause' : 'Play'}
            </button>

            <div role="group" aria-label="Visual style" className="flex flex-wrap gap-2">
              {MODES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="px-btn px-btn--small vis-mode"
                  aria-pressed={mode === id}
                  onClick={() => {
                    sfx.move();
                    setMode(id);
                  }}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div role="group" aria-label="Colours" className="flex flex-wrap gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="vis-swatch"
                  aria-pressed={theme.id === t.id}
                  aria-label={`${t.name} colours`}
                  title={t.name}
                  style={{ background: `linear-gradient(180deg, ${[...t.stops].reverse().join(', ')})` }}
                  onClick={() => {
                    sfx.move();
                    setTheme(t);
                  }}
                />
              ))}
            </div>

            {fsSupported && (
              <button
                type="button"
                className="px-btn px-btn--icon vis-fs"
                aria-label={isFs ? 'Exit fullscreen' : 'Fullscreen'}
                title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => void toggleFs()}
              >
                {isFs ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="m-0" role="status" aria-live="polite">
            <span className="px-label mr-2">{sourceInfo.long}</span>
            {status}
            {silent && <span className="text-[var(--px-dim)]"> Sound is muted, so it's a silent disco.</span>}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-[var(--px-red)]">
              {error}
            </p>
          )}
        </div>

        <p className="m-0 text-center text-sm leading-relaxed text-[var(--px-dim)]">
          Your audio file plays right here on your device and is never uploaded. The microphone is only used to draw
          the pictures and is never played through your speakers.
        </p>
      </div>
    </GameShell>
  );
}
