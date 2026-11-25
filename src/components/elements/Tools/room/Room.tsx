import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameShell, DialogueBox, sfx, load, save, type Choice } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import { drawFire, drawRadioNotes, drawStudyLight, paintHall, paintStudy } from './art';
import { createSong } from './music';
import { BANG, HEART, LETTUCE, NOTE, PLAYER_W, latteSprite, playerSprite, type Facing } from './sprites';
import { PEN, ROOMS, TOTAL_THINGS, contains, overlaps, type RoomId, type ThingId } from './world';
import './room.css';

// ---------------------------------------------------------------------------
// Jordan's Room: a little top-down RPG room to explore. Walk around the study
// and the hall, look at things, light the fire, pick lettuce for Latte, turn
// on the radio. Many objects lead to the matching part of the portfolio.
// ---------------------------------------------------------------------------

const VIEW_W = 320;
const VIEW_H = 192;
const SPEED = 74; // px per second
const SPRITE_W = PLAYER_W;
const CONTACT_EMAIL = 'jordanljy@u.nus.edu';

type Dir = 'up' | 'down' | 'left' | 'right';
const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface Dialog {
  lines: string[];
  speaker?: string;
  choices?: Choice[];
}

interface Particle {
  x: number;
  y: number;
  vy: number;
  life: number;
}

// The player's footprint: the bottom 4 rows of the 14×21 sprite, a little narrower.
const feet = (x: number, y: number) => ({ x: x + 3, y: y + 17, w: 8, h: 4 });

// Everything that counts towards "FOUND N / 13".
const COUNTED: ThingId[] = Object.values(ROOMS).flatMap((r) => r.things.filter((t) => t.counts).map((t) => t.id));

/** Things found on earlier visits. A garbled save keeps only real, counted things, once each. */
function loadFound(): ThingId[] {
  const saved = load<unknown>('room:found', []);
  return Array.isArray(saved) ? COUNTED.filter((id) => saved.includes(id)) : [];
}

export default function Room() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- React state (drives the HUD and dialogue) ---
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [roomId, setRoomId] = useState<RoomId>('study');
  const [found, setFound] = useState<ThingId[]>(loadFound);
  const [hasLettuce, setHasLettuce] = useState(false);
  const [radioOn, setRadioOn] = useState(false);
  const [touchUI] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640),
  );

  // --- Mutable game state (read every frame) ---
  const game = useRef({
    room: 'study' as RoomId,
    x: 149,
    y: 135,
    facing: 'down' as Facing,
    walkT: 0,
    moving: false,
    lit: load<unknown>('room:lit', false) === true,
    plantFull: true,
    hasLettuce: false,
    radioOn: false,
    fade: 0, // 0 = clear, 1 = black
    fadeDir: 0 as -1 | 0 | 1,
    pendingDoor: null as null | { to: RoomId; x: number; y: number; facing: Facing },
    latte: { x: 356, y: 108, tx: 366, ty: 110, wait: 1, faceRight: false, happyUntil: 0 },
    hearts: [] as Particle[],
    stepTimer: 0,
  });
  const keys = useRef<Dir[]>([]);
  const touchDir = useRef<Dir | null>(null);
  const dialogOpen = useRef(false);
  const closedAt = useRef(0);
  const song = useRef(createSong());
  const bgCache = useRef(new Map<string, HTMLCanvasElement>());

  const openDialog = useCallback((d: Dialog) => {
    dialogOpen.current = true;
    setDialog(d);
  }, []);
  const closeDialog = useCallback(() => {
    dialogOpen.current = false;
    closedAt.current = performance.now();
    setDialog(null);
  }, []);

  const markFound = useCallback((id: ThingId) => {
    setFound((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      save('room:found', next);
      return next;
    });
  }, []);

  /** Go to a section of the portfolio's home page. */
  const goHome = useCallback(
    (section: string) => {
      closeDialog();
      sfx.select();
      navigate(`/#${section}`);
    },
    [navigate, closeDialog],
  );

  // -------------------------------------------------------------------------
  // What each object says and does
  // -------------------------------------------------------------------------
  const lookAt = useCallback(
    (id: ThingId) => {
      const g = game.current;
      const notNow: Choice = { label: 'Not now', onSelect: closeDialog };
      const thing = ROOMS[g.room].things.find((t) => t.id === id);
      if (thing?.counts) markFound(id);

      switch (id) {
        case 'bookshelf':
          return openDialog({
            lines: [
              "A bookshelf packed with Jordan's papers: lymphedema therapy, liver fibrosis on MRI, organoids, heart attacks…",
              'Seven publications so far, three of them as first author.',
            ],
            choices: [{ label: 'Read the publications', onSelect: () => goHome('about-section') }, notNow],
          });
        case 'fireplace': {
          g.lit = !g.lit;
          save('room:lit', g.lit);
          if (g.lit) sfx.good();
          else sfx.back();
          return openDialog({
            lines: g.lit
              ? ['You light the fireplace. The whole study glows warm.']
              : ['You let the fire die down. The room goes dusky blue.'],
          });
        }
        case 'window':
          return openDialog({
            lines: ['Rain over Kent Ridge again.', 'Perfect weather for debugging.'],
          });
        case 'desk':
          return openDialog({
            lines: [
              "Jordan's computer. A model is training on liver ultrasound scans.",
              'The loss curve is going down. A good sign.',
            ],
            choices: [{ label: 'See computing projects', onSelect: () => goHome('cs-section') }, notNow],
          });
        case 'notebook':
          return openDialog({
            lines: [
              'A lab notebook lies open: sketches of a shape-memory heart ring, a smart knee sleeve and a lymphedema sleeve.',
            ],
            choices: [{ label: 'See biomedical projects', onSelect: () => goHome('bme-section') }, notNow],
          });
        case 'planter':
          if (g.hasLettuce) return openDialog({ lines: ['You already have a lettuce leaf in your pocket.'] });
          if (!g.plantFull) return openDialog({ lines: ['The lettuce is still growing back.'] });
          g.plantFull = false;
          g.hasLettuce = true;
          setHasLettuce(true);
          sfx.good();
          return openDialog({
            lines: ['A planter of fresh lettuce.', 'You pick a crisp leaf. Someone in the hall would love this.'],
          });
        case 'exit':
          return openDialog({
            lines: ['Head back to the arcade?'],
            choices: [
              {
                label: 'Leave',
                onSelect: () => {
                  closeDialog();
                  navigate('/Tools');
                },
              },
              { label: 'Stay', onSelect: closeDialog },
            ],
          });
        case 'letters':
          return openDialog({
            lines: ['Framed letters from people Jordan has worked with at A*STAR, KosmodeHealth and MDS-Plus.'],
            choices: [{ label: 'Read the testimonials', onSelect: () => goHome('testimonials-section') }, notNow],
          });
        case 'trophies':
          return openDialog({
            lines: [
              "A trophy cabinet. IDEATE 2025 Champion and EDIC INSPIRE 2026's Most Impactful Project sit up front.",
              'Older medals line the back: SSEF, IEF, GYSTB, and a couple of chemistry olympiads.',
            ],
            choices: [{ label: 'See all awards', onSelect: () => goHome('about-section') }, notNow],
          });
        case 'heart':
          return openDialog({
            lines: [
              'A heart-shaped frame of photos: Lions Befrienders, NUS Toddycats, Fei Yue, and late nights running RC4 events.',
            ],
            choices: [{ label: 'See leadership & community', onSelect: () => goHome('about-section') }, notNow],
          });
        case 'poster':
          return openDialog({
            lines: [
              'A research poster for FreeStryde, a wearable that recreates manual lymphatic drainage.',
              'A gold sticker in the corner: Most Impactful Project, EDIC INSPIRE 2026.',
            ],
            choices: [{ label: 'See the project', onSelect: () => goHome('bme-section') }, notNow],
          });
        case 'latte': {
          const cheer = () => {
            g.latte.happyUntil = performance.now() + 1800;
            for (let i = 0; i < 6; i++) {
              g.hearts.push({
                x: g.latte.x + 6 + Math.random() * 12,
                y: g.latte.y - 2,
                vy: 14 + Math.random() * 10,
                life: 1.2 + Math.random() * 0.5,
              });
            }
            // a "wheek": quick rising squeaks
            sfx.coin();
            window.setTimeout(() => sfx.coin(), 140);
          };
          if (g.hasLettuce) {
            g.hasLettuce = false;
            g.plantFull = true; // it regrows while you're away
            setHasLettuce(false);
            cheer();
            return openDialog({
              speaker: 'Latte',
              lines: ['Wheek wheek!', 'Latte grabs the lettuce and munches happily, then popcorns around the pen.'],
            });
          }
          return openDialog({
            lines: ["This is Latte, Jordan's guinea pig.", 'Latte sniffs the air, hoping you brought some greens.'],
            choices: [
              {
                label: 'Pet Latte',
                onSelect: () => {
                  closeDialog();
                  cheer();
                },
              },
              {
                label: "Visit Latte's page",
                onSelect: () => {
                  closeDialog();
                  navigate('/Tools/Latte');
                },
              },
            ],
          });
        }
        case 'radio': {
          g.radioOn = !g.radioOn;
          setRadioOn(g.radioOn);
          if (g.radioOn) song.current.start();
          else song.current.stop();
          return openDialog({
            lines: g.radioOn
              ? ['You switch on the radio. A cheerful chiptune starts playing.']
              : ['You switch the radio off. Quiet again.'],
          });
        }
        case 'mailbox':
          return openDialog({
            lines: ["A little mailbox with a note taped on: 'Say hi!'"],
            choices: [
              {
                label: 'Email Jordan',
                onSelect: () => {
                  closeDialog();
                  window.location.href = `mailto:${CONTACT_EMAIL}?subject=Hi%20from%20your%20room`;
                },
              },
              notNow,
            ],
          });
      }
    },
    [openDialog, closeDialog, goHome, markFound, navigate],
  );

  /** What's in front of the player right now (if anything). */
  const thingAhead = useCallback((): ThingId | null => {
    const g = game.current;
    const f = feet(g.x, g.y);
    const [vx, vy] = DIR_VEC[g.facing];
    const px = f.x + f.w / 2 + vx * 12;
    const py = f.y + f.h / 2 + vy * 12;
    const hit = ROOMS[g.room].things.find((t) => contains(t.rect, px, py));
    return hit?.id ?? null;
  }, []);

  const interact = useCallback(() => {
    const g = game.current;
    if (dialogOpen.current || g.fadeDir !== 0) return;
    if (performance.now() - closedAt.current < 250) return;
    const id = thingAhead();
    if (id) {
      sfx.select();
      lookAt(id);
    }
  }, [lookAt, thingAhead]);

  // -------------------------------------------------------------------------
  // First visit, and finishing the tour
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (load<boolean>('room:visited', false)) return;
    save('room:visited', true);
    openDialog({
      lines: [
        "Welcome to Jordan's room!",
        touchUI
          ? 'Walk with the arrow pad. Tap A when you face something to look at it.'
          : 'Walk with the arrow keys or WASD. Press Z, Enter or Space to look at things.',
        `There are ${TOTAL_THINGS} things to discover. Have a look around.`,
      ],
    });
  }, [openDialog, touchUI]);

  useEffect(() => {
    if (found.length < TOTAL_THINGS || load<boolean>('room:completed', false) || dialog) return;
    save('room:completed', true);
    sfx.win();
    openDialog({
      lines: [`You found all ${TOTAL_THINGS} things in Jordan's room!`, 'Thanks for visiting. Come say hi any time.'],
    });
  }, [found, dialog, openDialog]);

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        if (!keys.current.includes(dir)) keys.current.push(dir);
        return;
      }
      if (['Enter', ' ', 'z', 'Z'].includes(e.key)) {
        // A focused button or link (a dialogue choice, the back button) keeps
        // its own Enter/Space; blocking it here left Tab + Enter dead.
        if ((e.key === 'Enter' || e.key === ' ') && target?.closest('button, a')) return;
        e.preventDefault();
        if (!e.repeat) interact();
      }
    };
    const up = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (dir) keys.current = keys.current.filter((d) => d !== dir);
    };
    const blur = () => {
      keys.current = [];
      touchDir.current = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [interact]);

  // Pause the radio while the tab is hidden (a background tab's timers are
  // throttled, which would garble it), and stop it when leaving the page.
  useEffect(() => {
    const s = song.current;
    const onVisibility = () => {
      if (document.hidden) s.stop();
      else if (game.current.radioOn) s.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      s.stop();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const calm = prefersReducedMotion();

    const background = (room: RoomId, plantFull: boolean) => {
      const key = room === 'study' ? `study-${plantFull}` : 'hall';
      let bg = bgCache.current.get(key);
      if (!bg) {
        bg = document.createElement('canvas');
        bg.width = ROOMS[room].w;
        bg.height = ROOMS[room].h;
        const g2 = bg.getContext('2d')!;
        if (room === 'study') paintStudy(g2, { plantFull });
        else paintHall(g2);
        bgCache.current.set(key, bg);
      }
      return bg;
    };

    const blocked = (room: RoomId, x: number, y: number) => {
      const def = ROOMS[room];
      const f = feet(x, y);
      const w = def.walk;
      const inDoor = def.doors.some((d) => overlaps(f, d.rect));
      if (!inDoor && (f.x < w.x || f.y < w.y || f.x + f.w > w.x + w.w || f.y + f.h > w.y + w.h)) return true;
      return def.solids.some((s) => overlaps(f, s));
    };

    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const g = game.current;
      const def = ROOMS[g.room];

      // --- fades between rooms ---
      if (g.fadeDir !== 0) {
        g.fade = Math.min(1, Math.max(0, g.fade + g.fadeDir * dt * 4));
        if (g.fadeDir === 1 && g.fade >= 1 && g.pendingDoor) {
          const d = g.pendingDoor;
          g.room = d.to;
          g.x = d.x;
          g.y = d.y;
          g.facing = d.facing;
          g.pendingDoor = null;
          g.fadeDir = -1;
          setRoomId(d.to);
        } else if (g.fadeDir === -1 && g.fade <= 0) {
          g.fadeDir = 0;
        }
      }

      // --- movement ---
      const dir = touchDir.current ?? keys.current[keys.current.length - 1];
      g.moving = false;
      if (dir && !dialogOpen.current && g.fadeDir === 0) {
        g.facing = dir;
        const [vx, vy] = DIR_VEC[dir];
        const nx = g.x + vx * SPEED * dt;
        const ny = g.y + vy * SPEED * dt;
        if (!blocked(g.room, nx, g.y)) g.x = nx;
        if (!blocked(g.room, g.x, ny)) g.y = ny;
        g.moving = true;
        g.walkT += dt;
        g.stepTimer -= dt;
        if (g.stepTimer <= 0) {
          sfx.step();
          g.stepTimer = 0.32;
        }
        const door = def.doors.find((d) => overlaps(feet(g.x, g.y), d.rect));
        if (door) {
          g.pendingDoor = { to: door.to, x: door.arrive.x, y: door.arrive.y, facing: door.arrive.facing };
          g.fadeDir = 1;
        }
      } else {
        g.walkT = 0;
        g.stepTimer = 0;
      }

      // --- Latte wanders around the pen ---
      const L = g.latte;
      if (g.room === 'hall') {
        if (L.wait > 0) {
          L.wait -= dt;
        } else {
          const dx = L.tx - L.x;
          const dy = L.ty - L.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1) {
            L.wait = 1 + Math.random() * 2.5;
            L.tx = PEN.x + Math.random() * (PEN.w - 24);
            L.ty = PEN.y + Math.random() * (PEN.h - 14);
          } else {
            L.x += (dx / dist) * 14 * dt;
            L.y += (dy / dist) * 14 * dt;
            L.faceRight = dx > 0;
          }
        }
      }
      g.hearts = g.hearts.filter((h) => (h.life -= dt) > 0);
      g.hearts.forEach((h) => (h.y -= h.vy * dt));

      // --- draw ---
      const camX = Math.round(Math.min(Math.max(g.x + SPRITE_W / 2 - VIEW_W / 2, 0), def.w - VIEW_W));
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.drawImage(background(g.room, g.plantFull), -camX, 0);
      ctx.save();
      ctx.translate(-camX, 0);

      if (g.room === 'study' && g.lit) drawFire(ctx, calm ? 0 : t);
      if (g.room === 'hall') {
        if (g.radioOn) drawRadioNotes(ctx, calm ? 0.3 : t, NOTE());
        const happy = now < L.happyUntil;
        const hop = happy && !calm ? -Math.abs(Math.sin(t * 14)) * 5 : 0;
        const walking = L.wait <= 0 && !calm;
        const step = walking ? ((Math.floor(t * 6) % 2) as 0 | 1) : 0;
        ctx.drawImage(latteSprite(step, L.faceRight), Math.round(L.x), Math.round(L.y + hop));
        g.hearts.forEach((h) => {
          ctx.globalAlpha = Math.min(1, h.life);
          ctx.drawImage(HEART(), Math.round(h.x), Math.round(h.y));
        });
        ctx.globalAlpha = 1;
      }

      // player
      const step = g.moving ? ((Math.floor(g.walkT * 8) % 2) + 1) as 1 | 2 : 0;
      ctx.drawImage(playerSprite(g.facing, step), Math.round(g.x), Math.round(g.y));

      // "!" when something can be looked at
      if (!dialogOpen.current && g.fadeDir === 0 && thingAhead()) {
        const bob = calm ? 0 : Math.round(Math.sin(t * 6));
        ctx.drawImage(BANG(), Math.round(g.x + 3), Math.round(g.y - 12 + bob));
      }
      ctx.restore();

      if (g.room === 'study') drawStudyLight(ctx, g.lit, calm ? 0 : t);

      if (g.fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${g.fade})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [thingAhead]);

  // keep the mutable copies in sync with React state set elsewhere
  useEffect(() => {
    game.current.hasLettuce = hasLettuce;
  }, [hasLettuce]);

  // -------------------------------------------------------------------------
  // Touch controls
  // -------------------------------------------------------------------------
  const padButton = (dir: Dir, label: string, cls: string) => (
    <button
      type="button"
      aria-label={`Walk ${dir}`}
      className={`px-btn px-btn--icon h-12 w-12 touch-none select-none text-lg ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        touchDir.current = dir;
      }}
      onPointerUp={() => (touchDir.current = null)}
      onPointerCancel={() => (touchDir.current = null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  const room = ROOMS[roomId];

  return (
    <GameShell
      title="Jordan's Room"
      accent="amber"
      wide
      subtitle="A cosy pixel room to explore. Look at things to find your way around the portfolio."
    >
      {/* Sized so the whole screen fits in the window (see room.css). */}
      <div className={`room-wrap ${touchUI ? 'room-wrap--touch' : ''}`}>
        {/* HUD */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base">
          <span className="px-label">{room.name}</span>
          <span aria-live="polite">
            FOUND <span className="text-[var(--px-amber)]">{found.length}</span> / {TOTAL_THINGS}
          </span>
          <span className="flex items-center gap-3">
            {radioOn && <span className="text-[var(--px-amber)]" aria-label="Radio on">♪ RADIO</span>}
            <span className="flex items-center gap-1" aria-label={hasLettuce ? 'Holding a lettuce leaf' : 'Pockets empty'}>
              BAG
              <span className="inline-flex h-7 w-7 items-center justify-center border-2 border-[var(--px-faint)] bg-black">
                {hasLettuce && <LettuceIcon />}
              </span>
            </span>
          </span>
        </div>

        <div className="room-play">
          {/* Screen. The dialogue's size follows the screen's width (a
              container query), not the window's, so it fits a small screen. */}
          <div className="room-screen @container px-box relative overflow-hidden">
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className="px-canvas block w-full"
              style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
              role="img"
              aria-label={`${room.name} of Jordan's room. Use the arrow keys to walk and Enter to look at things.`}
              onClick={() => interact()}
            />
            {dialog && (
              <div className="absolute inset-x-2 bottom-2 @lg:inset-x-6 @lg:bottom-4">
                <DialogueBox
                  lines={dialog.lines}
                  speaker={dialog.speaker}
                  choices={dialog.choices}
                  onDone={closeDialog}
                  className="text-sm @lg:text-lg"
                />
              </div>
            )}
          </div>

          {/* Controls: below the screen, or either side of it on a phone held sideways */}
          {touchUI && (
            <div className="room-controls">
              <div className="room-pad grid grid-cols-3 grid-rows-3 gap-1">
                <span />
                {padButton('up', '▲', '')}
                <span />
                {padButton('left', '◀', '')}
                <span />
                {padButton('right', '▶', '')}
                <span />
                {padButton('down', '▼', '')}
                <span />
              </div>
              <button
                type="button"
                aria-label="Look"
                className="room-look px-btn px-btn--icon h-16 w-16 rounded-full text-2xl"
                onClick={() => interact()}
              >
                A
              </button>
            </div>
          )}
        </div>

        {!touchUI && (
          <p className="mt-4 text-center text-sm text-[var(--px-dim)]">
            Arrow keys / WASD to walk · Z, Enter or Space to look · doors are at the edges of each room
          </p>
        )}
      </div>
    </GameShell>
  );
}

/** The lettuce icon from the sprite sheet, shown in the bag slot. */
function LettuceIcon() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(LETTUCE(), 0, 0);
  }, []);
  return <canvas ref={ref} width={9} height={9} className="px-canvas h-5 w-5" aria-hidden="true" />;
}
