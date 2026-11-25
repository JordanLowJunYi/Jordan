// Latte's needs. Stats run 0 to 100 and drift down in real time, using
// timestamps saved with the arcade's storage helpers, so time passes while the
// visitor is away. Decay is gentle and the offline part is capped, and nothing
// here can end the game: low stats only make Latte sad.
import { load, save } from '../arcade';

export type StatKey = 'fullness' | 'happiness' | 'energy' | 'cleanliness';
export type Stats = Record<StatKey, number>;

export interface LatteState {
  v: 1;
  stats: Stats;
  /** last time the decay was applied (ms) */
  updated: number;
  /** first visit (ms), for Latte's age */
  born: number;
  asleep: boolean;
  /** recent carrot times, for the tummy-ache rule */
  treats: number[];
  /** feeling a bit queasy until this time (ms) */
  tummyUntil: number;
}

const KEY = 'latte';
const SECOND = 1000;
const HOUR = 3600 * SECOND;
const DAY = 24 * HOUR;

/** Points lost per hour while awake. Slow enough to feel like a real pet. */
const DECAY: Stats = { fullness: 5, happiness: 4, energy: 3, cleanliness: 4 };
/** Time alone never drains a stat below this; it just leaves Latte sad. */
const DECAY_FLOOR = 8;
/** At most this much time counts as "away" when the visitor comes back. */
export const OFFLINE_CAP = 8 * HOUR;
/** Energy gained per second of napping. */
export const NAP_RATE = 1.6;

export const LOW = 25;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** Lower a stat by `by`, but not past the floor (or below where it already is). */
const drain = (n: number, by: number) => clamp(Math.max(Math.min(n, DECAY_FLOOR), n - by));

function fresh(now: number): LatteState {
  return {
    v: 1,
    stats: { fullness: 62, happiness: 68, energy: 80, cleanliness: 70 },
    updated: now,
    born: now,
    asleep: false,
    treats: [],
    tummyUntil: 0,
  };
}

function valid(s: unknown): s is LatteState {
  if (!s || typeof s !== 'object') return false;
  const o = s as Partial<LatteState>;
  return (
    o.v === 1 &&
    !!o.stats &&
    (['fullness', 'happiness', 'energy', 'cleanliness'] as const).every((k) => Number.isFinite(o.stats?.[k])) &&
    Number.isFinite(o.updated) &&
    Number.isFinite(o.born)
  );
}

export function loadLatte(now = Date.now()): { state: LatteState; firstVisit: boolean; awayMs: number } {
  const raw = load<unknown>(KEY, null);
  if (!valid(raw)) return { state: fresh(now), firstVisit: true, awayMs: 0 };
  const state: LatteState = {
    ...raw,
    // keep a hand-edited save's stats on the 0-100 meters from the first frame
    stats: {
      fullness: clamp(raw.stats.fullness),
      happiness: clamp(raw.stats.happiness),
      energy: clamp(raw.stats.energy),
      cleanliness: clamp(raw.stats.cleanliness),
    },
    treats: Array.isArray(raw.treats) ? raw.treats.filter((t) => Number.isFinite(t)) : [],
    tummyUntil: Number.isFinite(raw.tummyUntil) ? raw.tummyUntil : 0,
    asleep: !!raw.asleep,
    // a clock that went backwards shouldn't make Latte younger than today
    born: Math.min(raw.born, now),
  };
  const awayMs = Math.max(0, now - state.updated);
  return { state: tick(state, now), firstVisit: false, awayMs };
}

export function saveLatte(s: LatteState) {
  save(KEY, s);
}

/** Apply the time since `s.updated`, capped, and return the new state. */
export function tick(s: LatteState, now: number): LatteState {
  const dt = Math.max(0, Math.min(now - s.updated, OFFLINE_CAP));
  if (dt === 0) return s.updated === now ? s : { ...s, updated: now };
  const h = dt / HOUR;
  const st = { ...s.stats };
  if (s.asleep) {
    st.energy = clamp(st.energy + NAP_RATE * (dt / SECOND));
    st.fullness = drain(st.fullness, DECAY.fullness * 0.5 * h);
    st.cleanliness = drain(st.cleanliness, DECAY.cleanliness * 0.5 * h);
  } else {
    st.fullness = drain(st.fullness, DECAY.fullness * h);
    st.energy = drain(st.energy, DECAY.energy * h);
    st.cleanliness = drain(st.cleanliness, DECAY.cleanliness * h);
    // being hungry or living in a messy cage wears happiness down faster
    let sad = DECAY.happiness;
    if (st.fullness < LOW) sad += 2;
    if (st.cleanliness < LOW) sad += 2;
    st.happiness = drain(st.happiness, sad * h);
  }
  return {
    ...s,
    stats: st,
    updated: now,
    treats: s.treats.filter((t) => now - t < 15 * 60 * SECOND),
  };
}

export function bump(s: LatteState, d: Partial<Stats>): LatteState {
  const st = { ...s.stats };
  (Object.keys(d) as StatKey[]).forEach((k) => {
    st[k] = clamp(st[k] + (d[k] ?? 0));
  });
  return { ...s, stats: st };
}

export function ageDays(s: LatteState, now: number) {
  return Math.max(0, Math.floor((now - s.born) / DAY));
}

/** The most pressing need, if any stat is low. */
export function need(s: LatteState): StatKey | null {
  const order: StatKey[] = ['fullness', 'energy', 'cleanliness', 'happiness'];
  let worst: StatKey | null = null;
  for (const k of order) {
    const limit = k === 'energy' ? 20 : LOW;
    if (s.stats[k] < limit && (worst === null || s.stats[k] < s.stats[worst])) worst = k;
  }
  return worst;
}

export function describeAway(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(ms / HOUR);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(ms / DAY);
  return `${days} days`;
}
