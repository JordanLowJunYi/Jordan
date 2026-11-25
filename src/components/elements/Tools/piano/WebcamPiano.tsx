// Webcam ("air") piano. Loaded with React.lazy, and TensorFlow itself is only
// imported when the player presses Start, so none of it is in the main bundle.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import type { HandDetector } from '@tensorflow-models/hand-pose-detection';
import { DialogueBox, sfx } from '../arcade';
import { useVoices } from './hooks';
import { preloadRange } from './sound';
import { Toggle } from './ui';
import {
  CamError,
  FINGERTIPS,
  PROBLEM_TEXT,
  classify,
  drawOverlay,
  hasWebGL,
  keyAt,
  layoutKeys,
  type CamKey,
  type CamProblem,
  type HandPose,
  type Tip,
} from './webcam';

type Phase = 'off' | 'starting' | 'running' | 'error';
type Stage = 'camera' | 'tf' | 'webgl' | 'model';

const STAGES: Record<Stage, { label: string; pct: number }> = {
  camera: { label: 'Asking for the camera…', pct: 12 },
  tf: { label: 'Loading TensorFlow…', pct: 38 },
  webgl: { label: 'Warming up WebGL…', pct: 60 },
  model: { label: 'Downloading the hand model…', pct: 82 },
};

export default function WebcamPiano({ names, onExit }: { names: boolean; onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<HandDetector | null>(null);
  const sessionRef = useRef<{ stop: () => void } | null>(null);
  const [phase, setPhase] = useState<Phase>('off');
  const [stage, setStage] = useState<Stage>('camera');
  const [problem, setProblem] = useState<CamProblem | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [noHands, setNoHands] = useState(false);
  const [octaves, setOctaves] = useState<1 | 2>(() => (window.innerWidth < 640 ? 1 : 2));
  const octavesRef = useRef(octaves);
  const namesRef = useRef(names);
  const { litRef, press, release, releaseAll, setSustain } = useVoices();

  useEffect(() => {
    octavesRef.current = octaves;
    namesRef.current = names;
  }, [octaves, names]);

  // Air notes ring out after a fingertip leaves, like a held pedal.
  useEffect(() => setSustain(true), [setSustain]);
  useEffect(() => preloadRange(60, 84), []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    releaseAll();
  }, [releaseAll]);

  // Leaving the tab or the page: camera off, loop off, model freed.
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
      detectorRef.current?.dispose();
      detectorRef.current = null;
    },
    [],
  );

  const fail = (p: CamProblem) => {
    setProblem(p);
    setPhase('error');
    sfx.bad();
  };

  // `quiet`: an automatic restart (coming back to the tab) makes no blips
  const start = async ({ quiet = false }: { quiet?: boolean } = {}) => {
    stop();
    setProblem(null);
    setDetail(null);
    if (!quiet) sfx.select();
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('insecure');
      return;
    }
    if (!hasWebGL()) {
      fail('webgl');
      return;
    }

    let live = true;
    let raf = 0;
    let stream: MediaStream | null = null;
    let currentStage: Stage = 'camera';
    // Keys currently held down by a fingertip (MIDI numbers).
    const held = new Set<number>();
    const releaseHeld = () => {
      held.forEach((k) => release(`cam:${k}`));
      held.clear();
    };
    const session = {
      stop: () => {
        live = false;
        cancelAnimationFrame(raf);
        stream?.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (video) video.srcObject = null;
        const canvas = canvasRef.current;
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        releaseHeld();
      },
    };
    sessionRef.current = session;
    const goStage = (s: Stage) => {
      currentStage = s;
      setStage(s);
    };

    setPhase('starting');
    goStage('camera');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!live) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new CamError('unknown');
      video.srcObject = stream;
      await video.play().catch(() => {
        /* autoplay of a muted inline video is allowed; ignore odd rejections */
      });
      if (!video.videoWidth) {
        await new Promise<void>((done) => video.addEventListener('loadedmetadata', () => done(), { once: true }));
      }
      // stopped (or left the page) while the video was starting: don't carry on
      // and report "running" with the camera already off
      if (!live) return;
      // The hand model sizes its input from the <video> element's width and
      // height attributes (not videoWidth), which default to 0, so it never
      // found a hand. The 2025 version set them too (video.width = 800).
      video.width = video.videoWidth;
      video.height = video.videoHeight;

      // Draw keys straight away, the hand skeletons once the model is ready.
      let keys: CamKey[] = [];
      let laidOut = '';
      let lastHandAt = performance.now();
      let handsShown = true;
      // For the live readout: tracked frames and hands since the last update.
      let tracked = 0;
      let lastHands = 0;
      let readoutAt = performance.now();
      // A frame or two can fail while WebGL warms up; a long run of failures
      // means tracking is broken in this browser, so say so instead of
      // quietly showing no hands.
      let failures = 0;

      const frame = async () => {
        if (!live) return;
        const canvas = canvasRef.current;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (canvas && vw && vh && video.readyState >= 2) {
          // Same size as the camera image, so the skeleton lines are sharp.
          const cw = vw;
          const ch = vh;
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
            setAspect(vw / vh);
          }
          // keep the model's input size in step if the camera changes resolution
          if (video.width !== vw || video.height !== vh) {
            video.width = vw;
            video.height = vh;
          }
          const layoutKey = `${cw}x${ch}x${octavesRef.current}`;
          if (layoutKey !== laidOut) {
            keys = layoutKeys(cw, ch, octavesRef.current);
            laidOut = layoutKey;
            releaseHeld();
          }

          const found: Tip[] = [];
          const poses: HandPose[] = [];
          const detector = detectorRef.current;
          if (detector) {
            try {
              // As in the 2025 version: mirror the image so it matches the
              // mirrored video, and check every fingertip of every hand.
              const hands = await detector.estimateHands(video, { flipHorizontal: true, staticImageMode: false });
              if (!live) return;
              failures = 0;
              tracked += 1;
              lastHands = hands.length;
              // the canvas is camera-sized, so landmarks need no scaling
              hands.forEach((h, i) => {
                const points = h.keypoints.map((p) => (p ? { x: p.x, y: p.y } : undefined));
                poses.push({ hand: i, points });
                FINGERTIPS.forEach((tip) => {
                  const p = points[tip];
                  if (p) found.push({ id: `${i}:${tip}`, x: p.x, y: p.y, hand: i });
                });
              });
            } catch (err) {
              // a frame still in flight when the camera stopped can fail as the
              // model is freed; that isn't a tracking problem
              if (!live) return;
              console.warn('[piano] hand tracking frame failed', err);
              failures += 1;
              if (failures >= 30) {
                session.stop();
                sessionRef.current = null;
                setDetail(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
                fail('tracking');
                return;
              }
            }
          }

          const now = performance.now();
          if (found.length) lastHandAt = now;
          const showHint = !!detector && now - lastHandAt > 1500;
          if (showHint === handsShown) {
            handsShown = !showHint;
            setNoHands(showHint);
          }
          // Live readout, twice a second, written straight to the DOM so it
          // doesn't re-render the page on every frame.
          if (detector && now - readoutAt >= 500) {
            const fps = Math.round((tracked * 1000) / (now - readoutAt));
            const label = lastHands === 0 ? 'No hand' : lastHands === 1 ? '1 hand' : `${lastHands} hands`;
            if (statusRef.current) statusRef.current.textContent = `${label} · ${fps} fps`;
            tracked = 0;
            readoutAt = now;
          }
          trackTips(found, keys);
          const ctx = canvas.getContext('2d');
          if (ctx) drawOverlay(ctx, keys, litRef.current, poses, namesRef.current);
        }
        raf = requestAnimationFrame(() => void frame());
      };

      // The 2025 rule: a key plays the moment any fingertip enters it, and is
      // let go once no fingertip is on it any more.
      const trackTips = (found: Tip[], keys: CamKey[]) => {
        const touched = new Set<number>();
        found.forEach((t) => {
          const k = keyAt(keys, t.x, t.y);
          if (k !== null) touched.add(k);
        });
        touched.forEach((k) => {
          if (held.has(k)) return;
          press(`cam:${k}`, k);
          held.add(k);
        });
        held.forEach((k) => {
          if (touched.has(k)) return;
          release(`cam:${k}`);
          held.delete(k);
        });
      };

      raf = requestAnimationFrame(() => void frame());

      if (!detectorRef.current) {
        goStage('tf');
        const tf = await import('@tensorflow/tfjs-core');
        await import('@tensorflow/tfjs-backend-webgl');
        const handPose = await import('@tensorflow-models/hand-pose-detection');
        if (!live) return;

        goStage('webgl');
        const ok = await tf.setBackend('webgl').catch(() => false);
        if (!ok) throw new CamError('webgl');
        await tf.ready();
        if (!live) return;

        goStage('model');
        // The 2025 version used the "lite" model. Laptops get the "full" one,
        // which finds hands more reliably; phones keep "lite" for speed.
        const phone = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        const detector = await handPose.createDetector(handPose.SupportedModels.MediaPipeHands, {
          runtime: 'tfjs',
          modelType: phone ? 'lite' : 'full',
          maxHands: 2,
        });
        if (!live) {
          detector.dispose();
          return;
        }
        detectorRef.current = detector;
      }
      setPhase('running');
      if (!quiet) sfx.good();
    } catch (err) {
      if (!live) return;
      session.stop();
      sessionRef.current = null;
      fail(classify(err, currentStage));
    }
  };

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  // A background tab gets the camera fully off (the light too, not just a
  // paused picture), and it comes back on by itself when the tab is shown
  // again, if it was on when the tab was hidden.
  const resumeRef = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (!sessionRef.current) return;
        resumeRef.current = true;
        stop();
        setPhase('off');
      } else if (resumeRef.current) {
        resumeRef.current = false;
        void startRef.current({ quiet: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);
  const problemText = problem ? PROBLEM_TEXT[problem] : null;
  const problemLines = useMemo(
    () => (problemText ? [...problemText.lines, ...(detail ? [`Error: ${detail}`] : [])] : []),
    [problemText, detail],
  );
  const choices = useMemo(
    () =>
      problemText
        ? [
            ...(problemText.retry ? [{ label: 'Try again', onSelect: () => void startRef.current() }] : []),
            { label: 'Free play instead', onSelect: onExit },
          ]
        : undefined,
    [problemText, onExit],
  );

  const on = phase === 'starting' || phase === 'running';

  return (
    <div className="grid gap-4">
      {phase === 'error' && problemText && (
        <DialogueBox speaker="Camera" lines={problemLines} choices={choices} />
      )}

      <div className="px-box pn-panel">
        <div className="pn-toolbar">
          {on ? (
            <button
              type="button"
              className="px-btn px-btn--small"
              onClick={() => {
                sfx.back();
                stop();
                setPhase('off');
              }}
            >
              <CameraOff size={14} aria-hidden="true" /> Stop camera
            </button>
          ) : (
            <span className="px-label">Air piano</span>
          )}
          <div className="pn-toggles">
            <Toggle on={octaves === 2} onChange={(two) => setOctaves(two ? 2 : 1)} title="Two octaves or one bigger one">
              2 octaves
            </Toggle>
          </div>
        </div>

        <div className="pn-cam" style={on ? { aspectRatio: String(aspect) } : undefined} data-on={on || undefined}>
          <video ref={videoRef} className="pn-cam__video" autoPlay muted playsInline aria-hidden="true" />
          <canvas
            ref={canvasRef}
            className="pn-cam__overlay px-canvas"
            role="img"
            aria-label="Camera view with piano keys drawn over it. Move a fingertip into a key to play it."
          />

          {!on && (
            <div className="pn-cam__start">
              <span className="pn-cam__icon" aria-hidden="true">
                <Camera size={30} />
              </span>
              <p className="m-0 text-lg">Play piano in the air with your fingertips.</p>
              <button type="button" className="px-btn" onClick={() => void start()}>
                Start camera
              </button>
              <p className="pn-cam__privacy m-0">
                Your video stays on this device: hand tracking runs in your browser and nothing is uploaded.
              </p>
            </div>
          )}

          {phase === 'starting' && (
            <div className="pn-cam__loading" role="status">
              <span>{STAGES[stage].label}</span>
              <div
                className="px-meter"
                role="progressbar"
                aria-label="Loading hand tracking"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={STAGES[stage].pct}
              >
                <span style={{ width: `${STAGES[stage].pct}%` }} />
              </div>
            </div>
          )}

          {phase === 'running' && (
            <p ref={statusRef} className="pn-cam__status" aria-hidden="true">
              Tracking…
            </p>
          )}

          {phase === 'running' && noHands && (
            <p className="pn-cam__hint" role="status">
              Raise a hand into view ✋
            </p>
          )}
        </div>
      </div>

      <p className="pn-help">
        Hold your hand above the keys, then dip a fingertip into one to play it. The lines drawn on your hand are what
        the tracker sees. If none appear, show your whole hand, palm or back towards the camera, about an arm's length
        away and in good light.
      </p>
    </div>
  );
}
