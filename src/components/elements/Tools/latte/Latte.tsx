// Latte, Jordan's guinea pig, as a little virtual pet. A pixel cage drawn on
// a canvas, four needs that drift down in real time (gently, and capped while
// you're away), and actions to look after Latte. Latte never dies: low stats
// only make Latte look sad and say so.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DialogueBox, GameShell, sfx } from '../arcade';
import { prefersReducedMotion } from '../../../../lib/motion';
import { FACTS, FOODS, MOOD_WORD, NEED_LINES, PET_LINES, type Food, type FoodId } from './content';
import {
  LOW,
  ageDays,
  bump,
  describeAway,
  loadLatte,
  need,
  saveLatte,
  tick,
  type LatteState,
  type StatKey,
} from './model';
import { IDLE, MOUTH, SPRITE_FOOT, SPRITE_W, latteSprite, type Pose } from './sprite';
import {
  FLOOR_TOP,
  GROUND,
  HOME_X,
  SH,
  SW,
  TUNNEL,
  drawBite,
  drawBowl,
  drawDroppings,
  drawFloor,
  drawHay,
  drawHouseLayer,
  drawParticle,
  drawTray,
  drawTunnel,
  staticLayer,
  type Particle,
} from './scene';
import * as snd from './sounds';
import { PixelIcon } from './PixelIcon';
import { ICONS, foodArt } from './icons';
import './latte.css';

// ---------- animation ----------

type AnimKind = 'eat' | 'pet' | 'popcorn' | 'play' | 'clean' | 'wake' | 'tummy' | 'turn';

interface Anim {
  kind: AnimKind;
  start: number;
  dur: number;
  food?: FoodId;
  next?: AnimKind;
  fired: Set<string>;
}

const DUR: Record<AnimKind, number> = {
  eat: 2000,
  pet: 1400,
  popcorn: 1300,
  play: 5100,
  clean: 1600,
  wake: 1100,
  tummy: 2600,
  turn: 4200,
};

const HOP = 430;

interface Look {
  x: number;
  lift: number;
  flip: boolean;
  pose: Pose;
  tunnel: { dy: number; wobble: number } | null;
  bite: { food: FoodId; left: number } | null;
  hop: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const walkStep = (t: number, every: number) => ((Math.floor(t / every) % 2) + 1) as 1 | 2;

/** Three popcorn hops; the middle one is the big twisty one. */
function hopAt(t: number, still: boolean): { lift: number; stretch: -1 | 0 | 1; twist: boolean; i: number } {
  const i = Math.floor(t / HOP);
  if (t < 0 || i >= 3) return { lift: 0, stretch: 0, twist: false, i: -1 };
  if (still) return { lift: 0, stretch: 0, twist: false, i };
  const q = (t % HOP) / HOP;
  if (q > 0.85) return { lift: 0, stretch: -1, twist: false, i };
  const k = q / 0.85;
  return {
    lift: Math.round(Math.sin(k * Math.PI) * (i === 1 ? 12 : 8)),
    stretch: k < 0.12 ? -1 : 1,
    twist: i === 1 && k > 0.3 && k < 0.7,
    i,
  };
}

function playLook(t: number, still: boolean, L: Look, base: Pose) {
  const happy: Pose = { ...base, eyes: 'happy', blush: true };
  if (still) {
    // reduced motion: no running or hopping, just a peek out of the tunnel
    if (t < 2600) {
      L.tunnel = { dy: 0, wobble: 0 };
      L.x = 70;
    }
    L.pose = happy;
    return;
  }
  if (t < 700) {
    L.x = lerp(HOME_X, 2, t / 700);
    L.flip = true;
    L.pose = { ...base, step: walkStep(t, 100) };
  } else if (t < 1000) {
    L.x = 2;
    L.tunnel = { dy: -Math.round((1 - ((t - 700) / 300) ** 2) * 50), wobble: 0 };
  } else if (t < 2600) {
    L.x = lerp(2, 88, (t - 1000) / 1600);
    L.tunnel = { dy: 0, wobble: L.x < TUNNEL.x1 - 2 ? t / 50 : 0 };
    L.pose = { ...base, step: walkStep(t, 70), eyes: 'happy' };
  } else if (t < 3900) {
    const h = hopAt(t - 2600, false);
    L.x = 88;
    L.tunnel = { dy: 0, wobble: 0 };
    L.lift = h.lift;
    L.flip = h.twist;
    L.hop = h.i;
    L.pose = { ...happy, stretch: h.stretch };
  } else if (t < 4300) {
    L.x = 88;
    L.tunnel = { dy: -Math.round(((t - 3900) / 400) ** 2 * 60), wobble: 0 };
    L.pose = happy;
  } else {
    L.x = lerp(88, HOME_X, (t - 4300) / 700);
    L.flip = t < 5000;
    L.pose = { ...base, step: t < 5000 ? walkStep(t, 100) : 0 };
  }
}

/** Where Latte is and how Latte looks at time `now`. */
function look(now: number, s: LatteState, a: Anim | null, still: boolean, blinking: boolean): Look {
  const breath = (Math.floor(now / (s.asleep ? 1500 : 900)) % 2) as 0 | 1;
  const base: Pose = { ...IDLE, breath, eyes: blinking ? 'blink' : 'open' };
  const L: Look = { x: HOME_X, lift: 0, flip: false, pose: base, tunnel: null, bite: null, hop: -1 };
  const sad = need(s) !== null || now < s.tummyUntil;
  const sadPose: Pose = {
    ...base,
    eyes: blinking ? 'blink' : 'sad',
    dip: 1,
    earDown: true,
    tear: !still && Math.floor(now / 1800) % 3 === 0,
  };
  if (s.asleep && a?.kind !== 'wake') {
    L.pose = { ...base, eyes: 'closed', flat: true, dip: 1, earDown: true };
    return L;
  }
  if (!a) {
    if (sad) L.pose = sadPose;
    return L;
  }
  const t = now - a.start;
  switch (a.kind) {
    case 'eat': {
      const chew = Math.floor(t / 130) % 2 === 0;
      L.pose = { ...base, dip: 1, mouth: chew ? 'chew' : 'rest', eyes: t > 250 && t < 1700 ? 'happy' : base.eyes };
      if (a.food) L.bite = { food: a.food, left: 1 - t / a.dur };
      break;
    }
    case 'pet':
      L.pose = { ...base, eyes: 'happy', blush: true, mouth: t < 450 ? 'open' : 'rest' };
      break;
    case 'popcorn': {
      const h = hopAt(t, still);
      L.lift = h.lift;
      L.flip = h.twist;
      L.hop = h.i;
      L.pose = { ...base, eyes: 'happy', blush: true, stretch: h.stretch };
      break;
    }
    case 'play':
      playLook(t, still, L, base);
      break;
    case 'clean':
      L.pose = { ...base, eyes: 'happy', blush: true, mouth: t < 400 ? 'open' : 'rest' };
      break;
    case 'wake':
      L.pose = {
        ...base,
        eyes: t < 800 ? 'closed' : 'open',
        mouth: t < 700 ? 'open' : 'rest',
        stretch: t > 150 && t < 700 && !still ? 1 : 0,
      };
      break;
    case 'tummy':
      L.pose = { ...sadPose, tear: true };
      break;
    case 'turn':
      L.flip = true;
      if (sad) L.pose = sadPose;
      break;
  }
  return L;
}

/** Top of Latte's head in scene pixels, for hearts and Zzz. */
function headAt(L: Look) {
  const sx = Math.round(L.x);
  const sy = GROUND - SPRITE_FOOT - L.lift;
  return { x: L.flip ? sx + SPRITE_W - 27 : sx + 27, y: sy + 8 };
}

// ---------- UI data ----------

const STATS: { key: StatKey; label: string; colour: string }[] = [
  { key: 'fullness', label: 'Fullness', colour: 'var(--px-amber)' },
  { key: 'happiness', label: 'Happiness', colour: 'var(--px-pink)' },
  { key: 'energy', label: 'Energy', colour: 'var(--px-cyan)' },
  { key: 'cleanliness', label: 'Cleanliness', colour: 'var(--px-green)' },
];

function welcome(firstVisit: boolean, awayMs: number, s: LatteState): string[] {
  if (firstVisit)
    return [
      "Wheek! Hi, I'm Latte, Jordan's guinea pig.",
      'Feed me, play with me and keep my cage tidy. Tap me for a cuddle!',
    ];
  const k = need(s);
  const first =
    awayMs > 60_000 ? `Wheek wheek! You're back! It's been ${describeAway(awayMs)}.` : 'Wheek! Hello again!';
  return [first, k ? NEED_LINES[k] : 'I feel great. Want to hang out?'];
}

function shuffled<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- component ----------

export default function Latte() {
  const [boot] = useState(() => {
    const b = loadLatte();
    // a nap that finished while the visitor was away
    if (b.state.asleep && b.state.stats.energy >= 100) b.state = { ...b.state, asleep: false };
    return b;
  });
  const [st, setSt] = useState<LatteState>(boot.state);
  const [lines, setLines] = useState<string[]>(() => welcome(boot.firstVisit, boot.awayMs, boot.state));
  const [feedOpen, setFeedOpen] = useState(false);
  const [thought, setThought] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const feedBtnRef = useRef<HTMLButtonElement>(null);
  const firstFoodRef = useRef<HTMLButtonElement>(null);
  const stRef = useRef(st);
  const animRef = useRef<Anim | null>(null);
  const partsRef = useRef<Particle[]>([]);
  const bowlRef = useRef<{ food: FoodId; until: number } | null>(null);
  const rmRef = useRef(prefersReducedMotion());
  const lastSayRef = useRef(Date.now());
  const lastSaveRef = useRef(0);
  const lastWheekRef = useRef(0);
  const petCountRef = useRef(0);
  const feedWasOpen = useRef(false);

  // ---- state plumbing ----
  const commit = useCallback((next: LatteState, persist = false) => {
    stRef.current = next;
    setSt(next);
    const now = Date.now();
    if (persist || now - lastSaveRef.current > 5000) {
      saveLatte(next);
      lastSaveRef.current = now;
    }
  }, []);

  const say = useCallback((ls: string[]) => {
    lastSayRef.current = Date.now();
    setLines(ls);
  }, []);

  const startAnim = useCallback((kind: AnimKind, opts: { food?: FoodId; next?: AnimKind } = {}) => {
    animRef.current = { kind, start: Date.now(), dur: DUR[kind], fired: new Set(), ...opts };
  }, []);

  const currentLook = useCallback(() => {
    const now = Date.now();
    return look(now, stRef.current, animRef.current, rmRef.current, false);
  }, []);

  const spawn = useCallback((p: Omit<Particle, 'born'> & { born?: number }) => {
    partsRef.current.push({ born: Date.now(), ...p });
    if (partsRef.current.length > 120) partsRef.current.splice(0, partsRef.current.length - 120);
  }, []);

  const hearts = useCallback(
    (n: number) => {
      const h = headAt(currentLook());
      for (let i = 0; i < n; i++) {
        spawn({
          kind: 'heart',
          x: h.x + (Math.random() * 18 - 9),
          y: h.y - 2 - Math.random() * 6,
          vx: (Math.random() - 0.5) * 0.012,
          vy: -0.012 - Math.random() * 0.01,
          life: 1200 + Math.random() * 500,
          born: Date.now() + i * 90,
        });
      }
    },
    [currentLook, spawn],
  );

  // ---- keep the reduced-motion preference live ----
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => {
      rmRef.current = mq.matches;
    };
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // ---- DialogueBox listens for Enter/Space on window. Keep those keys for
  // the focused button instead, so keyboard users can use every control. ----
  useEffect(() => {
    const guard = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (!(t instanceof HTMLElement) || t.closest('.px-dialogue')) return;
      if (t.closest('button, a[href], input, select, textarea, summary, [role="button"]')) e.stopPropagation();
    };
    window.addEventListener('keydown', guard, true);
    return () => window.removeEventListener('keydown', guard, true);
  }, []);

  // ---- real-time clock: decay, auto-wake, and saying what's wrong ----
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      let n = tick(stRef.current, now);
      if (n.asleep && n.stats.energy >= 100) {
        n = { ...n, asleep: false };
        commit(n, true);
        startAnim('wake');
        snd.yawn();
        say(['Mmm, big stretch! What a lovely nap!', 'Energy all topped up. What shall we do?']);
        return;
      }
      commit(n);
      const k = need(n);
      if (k && !n.asleep && !animRef.current && now - lastSayRef.current > 30_000) {
        snd.sadSqueak();
        say([NEED_LINES[k]]);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [commit, say, startAnim]);

  // ---- save when leaving ----
  useEffect(() => {
    const flush = () => saveLatte(tick(stRef.current, Date.now()));
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // ---- thought bubbles with true guinea pig facts ----
  useEffect(() => {
    const order = shuffled(FACTS);
    let i = 0;
    let showT = 0;
    let hideT = 0;
    const schedule = (delay: number) => {
      showT = window.setTimeout(() => {
        if (!document.hidden && !stRef.current.asleep) {
          setThought(order[i++ % order.length]);
          hideT = window.setTimeout(() => setThought(null), 9000);
        }
        schedule(28_000 + Math.random() * 14_000);
      }, delay);
    };
    schedule(9000);
    return () => {
      window.clearTimeout(showT);
      window.clearTimeout(hideT);
    };
  }, []);

  // ---- feed menu focus: into the menu on open, back to Feed on close ----
  useEffect(() => {
    if (feedOpen) firstFoodRef.current?.focus();
    else if (feedWasOpen.current) feedBtnRef.current?.focus();
    feedWasOpen.current = feedOpen;
  }, [feedOpen]);

  // ---- the scene: a small canvas redrawn at a pixel-y frame rate ----
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    let blinkUntil = 0;
    let nextBlink = Date.now() + 2000;
    let nextTurn = Date.now() + 15_000 + Math.random() * 15_000;
    let nextHop = Date.now() + 12_000 + Math.random() * 10_000;
    let nextZ = 0;
    let nextCrumb = 0;
    let nextDrip = Date.now() + 3000;
    let night = stRef.current.asleep ? 0.55 : 0;

    const frame = (now: number, dt: number) => {
      const s = stRef.current;
      const still = rmRef.current;

      // finish or chain the current animation
      let a = animRef.current;
      if (a && now >= a.start + a.dur) {
        a = a.next && !s.asleep ? { kind: a.next, start: now, dur: DUR[a.next], fired: new Set() } : null;
        animRef.current = a;
      }

      // little bits of life
      if (now > nextBlink) {
        blinkUntil = now + 150;
        nextBlink = now + 2400 + Math.random() * 3200;
      }
      if (!a && !s.asleep) {
        if (now > nextTurn) {
          a = animRef.current = { kind: 'turn', start: now, dur: DUR.turn, fired: new Set() };
          nextTurn = now + 20_000 + Math.random() * 20_000;
        } else if (s.stats.happiness >= 80 && !need(s) && now > nextHop) {
          a = animRef.current = { kind: 'popcorn', start: now, dur: DUR.popcorn, fired: new Set() };
          nextHop = now + 30_000 + Math.random() * 30_000;
        }
      }

      const L = look(now, s, a, still, now < blinkUntil);

      // sounds tied to the animation
      if (a && L.hop >= 0 && !a.fired.has(`hop${L.hop}`)) {
        a.fired.add(`hop${L.hop}`);
        snd.boing();
      }
      if (a?.kind === 'play' && now - a.start > 1000 && !a.fired.has('thump')) {
        a.fired.add('thump');
        if (!still) snd.thump();
      }

      // spawn particles
      const head = headAt(L);
      if (s.asleep && now > nextZ) {
        partsRef.current.push({ kind: 'z', x: head.x + 4, y: head.y - 4, vx: 0.004, vy: -0.007, born: now, life: 2400 });
        nextZ = now + 1500;
      }
      if (a?.kind === 'eat' && now > nextCrumb && a.food) {
        const colour = { lettuce: '#7ed957', pepper: '#e8413c', hay: '#e3bd55', carrot: '#f08a24' }[a.food];
        partsRef.current.push({
          kind: 'crumb',
          x: L.x + MOUTH.x + 2,
          y: GROUND - SPRITE_FOOT + MOUTH.y + 4,
          vx: (Math.random() - 0.2) * 0.02,
          vy: -0.01,
          born: now,
          life: 700,
          colour,
        });
        nextCrumb = now + 240;
      }
      if (!still && now > nextDrip) {
        partsRef.current.push({ kind: 'drip', x: 112, y: 61, vx: 0, vy: 0.01, born: now, life: 1500 });
        nextDrip = now + 5000 + Math.random() * 6000;
      }

      // move particles
      const ps = partsRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (now - p.born > p.life) {
          ps.splice(i, 1);
          continue;
        }
        if (now < p.born || still) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'crumb' || p.kind === 'drip') p.vy += 0.0005 * dt;
        if (p.kind === 'crumb' && p.y >= GROUND) {
          p.y = GROUND;
          p.vx = 0;
          p.vy = 0;
        }
        if (p.kind === 'drip' && p.y >= GROUND - 1) p.life = 0;
      }

      // ---- paint ----
      const target = s.asleep ? 0.55 : 0;
      night = still ? target : night + (target - night) * Math.min(1, dt / 500);
      ctx.drawImage(staticLayer(night > 0.25), 0, 0);
      drawFloor(ctx, s.stats.cleanliness);
      drawHouseLayer(ctx);
      drawHay(ctx, 0.25 + s.stats.fullness / 130);
      const bowl = bowlRef.current;
      drawBowl(ctx, bowl && bowl.until > now ? bowl.food : null);
      drawDroppings(ctx, s.stats.cleanliness, now, still);

      const sx = Math.round(L.x);
      const sy = GROUND - SPRITE_FOOT - L.lift;
      if (L.lift > 0) {
        ctx.fillStyle = 'rgba(40, 24, 10, 0.35)';
        ctx.fillRect(sx + 6, GROUND - 1, 26 - Math.min(8, L.lift), 2);
      }
      const sprite = latteSprite(L.pose);
      if (L.flip) {
        ctx.save();
        ctx.translate(sx + SPRITE_W, sy);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, sx, sy);
      }
      if (L.bite) drawBite(ctx, L.bite.food, sx + MOUTH.x, sy + MOUTH.y + L.pose.dip, L.bite.left);
      if (L.tunnel) drawTunnel(ctx, L.tunnel.dy, L.tunnel.wobble);
      drawTray(ctx);

      for (const p of ps) if (p.kind !== 'z' && p.born <= now) drawParticle(ctx, p, now);
      if (night > 0.01) {
        ctx.fillStyle = `rgba(10, 8, 40, ${night.toFixed(3)})`;
        ctx.fillRect(0, 0, SW, SH);
      }
      for (const p of ps) if (p.kind === 'z' && p.born <= now) drawParticle(ctx, p, now);
    };

    let raf = 0;
    let lastPaint = 0;
    let lastTs = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const fps = rmRef.current ? 4 : 12;
      if (ts - lastPaint < 1000 / fps - 2) return;
      const dt = lastTs ? Math.min(ts - lastTs, 250) : 0;
      lastTs = ts;
      lastPaint = ts;
      frame(Date.now(), dt);
    };
    const start = () => {
      if (raf || document.hidden) return;
      lastTs = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    frame(Date.now(), 0);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---------- actions ----------

  const now0 = () => tick(stRef.current, Date.now());

  const asleepLines = ['Zzz...', 'Latte is fast asleep. Press Wake if you want to play.'];

  const feed = (food: Food) => {
    setFeedOpen(false);
    const now = Date.now();
    let s = now0();
    if (s.asleep) {
      commit(s);
      say(asleepLines);
      return;
    }
    if (food.treat) {
      if (now < s.tummyUntil) {
        commit(s);
        snd.tummy();
        startAnim('tummy');
        say(["No more carrots for now, please. My tummy's still grumbly.", 'Some hay would help it settle.']);
        return;
      }
      const recent = s.treats.filter((t) => now - t < 10 * 60_000);
      if (recent.length >= 2) {
        s = { ...bump(s, { fullness: 4, happiness: -6 }), treats: [...s.treats, now], tummyUntil: now + 90_000 };
        commit(s, true);
        snd.tummy();
        startAnim('tummy');
        say([
          'Ooh... my tummy feels a bit funny.',
          'Too many treats too fast! Carrots are sugary. Hay and greens help a tummy settle.',
        ]);
        return;
      }
    }
    if (s.stats.fullness >= 96) {
      commit(s);
      snd.sniff();
      say(["Sniff sniff... I'm stuffed! Maybe a little later."]);
      return;
    }
    s = bump(s, food.gain);
    if (food.treat) s = { ...s, treats: [...s.treats, now] };
    // hay helps an upset tummy settle sooner
    if (food.id === 'hay' && now < s.tummyUntil) s = { ...s, tummyUntil: now + 5000 };
    commit(s, true);
    if (food.id !== 'hay') bowlRef.current = { food: food.id, until: now + 120_000 };
    snd.munch();
    startAnim('eat', { food: food.id });
    say(food.says);
  };

  const pet = () => {
    const now = Date.now();
    let s = now0();
    const busy = animRef.current && ['play', 'eat', 'popcorn'].includes(animRef.current.kind);
    if (s.asleep) {
      s = bump(s, { happiness: 2 });
      commit(s, true);
      hearts(2);
      if (now - lastSayRef.current > 3000)
        say(['Zzz... (a sleepy little squeak)', 'Guinea pigs nap in short bursts, sometimes with their eyes open!']);
      return;
    }
    s = bump(s, { happiness: 8 });
    commit(s, true);
    hearts(5);
    const n = petCountRef.current++;
    if (n % 2 === 0 && now - lastWheekRef.current > 1500) {
      lastWheekRef.current = now;
      snd.wheek();
    } else {
      snd.purr();
    }
    if (!busy) startAnim('pet', { next: s.stats.happiness > 70 && Math.random() < 0.45 ? 'popcorn' : undefined });
    if (now - lastSayRef.current > 2500) say([PET_LINES[n % PET_LINES.length]]);
  };

  const play = () => {
    let s = now0();
    if (s.asleep) {
      commit(s);
      say(asleepLines);
      return;
    }
    if (animRef.current?.kind === 'play') return;
    if (s.stats.energy < 15) {
      commit(s);
      snd.sadSqueak();
      say(["I'm too sleepy to play... maybe a nap first?"]);
      return;
    }
    s = bump(s, { happiness: 16, energy: -10, fullness: -3 });
    commit(s, true);
    sfx.select();
    startAnim('play');
    say(['Tunnel time! Zoom zoom!', "Tunnels feel safe to guinea pigs, because they're covered, like a burrow."]);
  };

  const clean = () => {
    const now = Date.now();
    let s = now0();
    if (s.stats.cleanliness >= 92) {
      commit(s);
      say(['My cage is already sparkly clean. Thank you!']);
      return;
    }
    s = bump(s, { cleanliness: 100, happiness: s.asleep ? 0 : 5 });
    commit(s, true);
    bowlRef.current = null;
    const colours = ['#fff6c2', '#fbbf24', '#a5f3fc', '#ffffff'];
    for (let i = 0; i < 16; i++) {
      spawn({
        kind: 'spark',
        x: 4 + Math.random() * (SW - 8),
        y: FLOOR_TOP + 2 + Math.random() * (GROUND - FLOOR_TOP - 3),
        vx: 0,
        vy: -0.004,
        life: 900,
        born: now + i * 55,
        colour: colours[i % colours.length],
      });
    }
    snd.sparkle();
    if (s.asleep) {
      say(['You tidy up quietly...', 'Zzz... (Latte keeps snoozing.)']);
      return;
    }
    startAnim('clean', { next: s.stats.happiness > 70 ? 'popcorn' : undefined });
    say(['Fresh bedding! Thank you!', 'A clean cage keeps a guinea pig healthy and happy.']);
  };

  const nap = () => {
    let s = now0();
    if (s.asleep) {
      s = { ...s, asleep: false };
      commit(s, true);
      startAnim('wake');
      snd.yawn();
      say(['Yaaawn! Morning already?', s.stats.energy >= 80 ? 'I feel great!' : 'Still a little sleepy, but okay!']);
      return;
    }
    if (s.stats.energy >= 95) {
      commit(s);
      say(["I'm not sleepy yet! Let's play instead?"]);
      return;
    }
    s = { ...s, asleep: true };
    commit(s, true);
    animRef.current = null;
    setFeedOpen(false);
    snd.lullaby();
    say(['Yaaawn... nap time.', 'Zzz... (Guinea pigs take lots of short naps, day and night.)']);
  };

  // ---------- render ----------

  const k = need(st);
  const tummy = st.updated < st.tummyUntil;
  const mood = st.asleep
    ? 'Asleep'
    : tummy
      ? 'Tummy ache'
      : k
        ? MOOD_WORD[k]
        : st.stats.happiness >= 80
          ? 'Very happy'
          : st.stats.happiness >= 50
            ? 'Happy'
            : 'Okay';
  const days = ageDays(st, st.updated);
  const age = days < 1 ? 'under a day' : `${days} day${days === 1 ? '' : 's'}`;

  return (
    <GameShell title="Latte" accent="pink" wide subtitle="Jordan's guinea pig, in pixels. Look after Latte!">
      <div className="latte mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="latte-tag">Latte</span>
            <span className="px-label">
              Age: <span className="text-[var(--px-ink)]">{age}</span>
            </span>
            <span className="px-label">
              Mood: <span className="text-[var(--px-ink)]">{mood}</span>
            </span>
          </div>

          <div className="px-box latte-stage">
            <button
              type="button"
              className="latte-scene"
              aria-label={`Pet Latte. Latte is ${mood.toLowerCase()}.`}
              onClick={pet}
            >
              <canvas ref={canvasRef} width={SW} height={SH} className="px-canvas" />
            </button>
            <div className="latte-thought-wrap" role="status" aria-live="polite">
              {thought && !st.asleep && (
                <p className="latte-thought">
                  <span className="latte-thought__label">Latte is thinking...</span>
                  {thought}
                </p>
              )}
            </div>
          </div>

          <DialogueBox lines={lines} speaker="Latte" className="mt-6" />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="px-box p-4" aria-label="Latte's needs">
            <h2 className="px-label mb-3 text-[var(--px-ink)]">Needs</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1">
              {STATS.map((s) => {
                const v = Math.round(st.stats[s.key]);
                const low = st.stats[s.key] < (s.key === 'energy' ? 20 : LOW);
                return (
                  <div key={s.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="px-label">{s.label}</span>
                      <span className={`text-sm ${low ? 'text-[var(--px-red)]' : ''}`}>
                        {low && <span aria-hidden="true">! </span>}
                        {v}
                      </span>
                    </div>
                    <div
                      className="px-meter"
                      role="meter"
                      aria-label={s.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={v}
                      aria-valuetext={`${v} out of 100${low ? ', low' : ''}`}
                      style={{ ['--px-accent' as string]: low ? 'var(--px-red)' : s.colour }}
                    >
                      <span style={{ width: `${Math.max(2, v)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="px-box px-box--accent p-4" aria-label="Look after Latte">
            {feedOpen ? (
              <div
                id="latte-feed-menu"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    sfx.back();
                    setFeedOpen(false);
                  }
                }}
              >
                <h2 className="px-label mb-3 text-[var(--px-ink)]">What should Latte eat?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {FOODS.map((f, i) => (
                    <button
                      key={f.id}
                      ref={i === 0 ? firstFoodRef : undefined}
                      type="button"
                      className="px-btn px-btn--small latte-food"
                      onClick={() => feed(f)}
                    >
                      <PixelIcon art={foodArt(f.id)} size={22} />
                      <span className="flex flex-col items-start leading-tight">
                        <span>{f.name}</span>
                        <span className={`latte-food__note ${f.treat ? 'is-treat' : ''}`}>{f.note}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="px-btn px-btn--small mt-4 w-full"
                  onClick={() => {
                    sfx.back();
                    setFeedOpen(false);
                  }}
                >
                  ◀ Back
                </button>
              </div>
            ) : (
              <>
                <h2 className="px-label mb-3 text-[var(--px-ink)]">Look after Latte</h2>
                <div className="latte-actions grid grid-cols-2 gap-3">
                  <button
                    ref={feedBtnRef}
                    type="button"
                    className="px-btn px-btn--small"
                    aria-haspopup="true"
                    onClick={() => {
                      if (stRef.current.asleep) {
                        say(asleepLines);
                        return;
                      }
                      sfx.select();
                      setFeedOpen(true);
                    }}
                  >
                    <PixelIcon art={foodArt('carrot')} size={18} />
                    Feed
                  </button>
                  <button type="button" className="px-btn px-btn--small" onClick={pet}>
                    <PixelIcon art={ICONS.pet} size={18} />
                    Pet
                  </button>
                  <button type="button" className="px-btn px-btn--small" onClick={play}>
                    <PixelIcon art={ICONS.play} size={18} />
                    Play
                  </button>
                  <button type="button" className="px-btn px-btn--small" onClick={clean}>
                    <PixelIcon art={ICONS.clean} size={18} />
                    Clean
                  </button>
                  <button
                    type="button"
                    className="px-btn px-btn--small col-span-2"
                    onClick={nap}
                  >
                    <PixelIcon art={st.asleep ? ICONS.wake : ICONS.nap} size={18} />
                    {st.asleep ? 'Wake up' : 'Nap'}
                  </button>
                </div>
              </>
            )}
          </section>

          <p className="text-sm leading-relaxed text-[var(--px-dim)]">
            Tap Latte for a cuddle. Latte&apos;s needs drift down slowly in real time, even while you&apos;re
            away, but Latte will always be here waiting for you.
          </p>
        </div>
      </div>
    </GameShell>
  );
}
