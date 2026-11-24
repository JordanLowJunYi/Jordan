// Pixel renderers. Everything is drawn on a small canvas (one canvas pixel is
// a 3 to 5 CSS pixel "block") with whole-pixel fillRects, then scaled up
// crisply by CSS, so every mode looks like an old LED panel or game screen.

export type Mode = 'bars' | 'burst' | 'scope';

export interface Theme {
  id: string;
  name: string;
  stops: string[]; // low → high
  peak: string;
  dim: string; // unlit LED blocks
}

export const THEMES: Theme[] = [
  { id: 'grape', name: 'Grape soda', stops: ['#a78bfa', '#f472b6', '#fbbf24'], peak: '#f5efe2', dim: '#1b1530' },
  { id: 'lagoon', name: 'Lagoon', stops: ['#22d3ee', '#4ade80', '#f5efe2'], peak: '#fbbf24', dim: '#0f1d26' },
  { id: 'sunset', name: 'Sunset', stops: ['#f87171', '#fbbf24', '#f472b6'], peak: '#f5efe2', dim: '#261318' },
  { id: 'mint', name: 'Mint', stops: ['#4ade80', '#22d3ee', '#a78bfa'], peak: '#f5efe2', dim: '#102118' },
];

const BG = '#07060f';

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rampCache = new Map<string, string[]>();
/** `n` colours evenly blended through the theme's stops. */
export function ramp(theme: Theme, n = 32): string[] {
  const key = `${theme.id}:${n}`;
  const hit = rampCache.get(key);
  if (hit) return hit;
  const rgb = theme.stops.map(hexToRgb);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (rgb.length - 1);
    const a = Math.min(rgb.length - 2, Math.floor(t));
    const f = t - a;
    const c = rgb[a].map((v, k) => Math.round(v + (rgb[a + 1][k] - v) * f));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  rampCache.set(key, out);
  return out;
}

export interface DrawState {
  peaks: number[];
  holds: number[];
  rot: number;
  bassAvg: number;
  flash: number;
  lastBeat: number;
  sparks: { a: number; r: number; born: number }[];
  scopeGain: number;
}

export const newDrawState = (): DrawState => ({
  peaks: [],
  holds: [],
  rot: 0,
  bassAvg: 0,
  flash: 0,
  lastBeat: 0,
  sparks: [],
  scopeGain: 1,
});

export interface Frame {
  freq: Uint8Array;
  time: Uint8Array;
  sampleRate: number;
  fftSize: number;
  now: number;
  dt: number;
  calm: boolean; // reduced motion: steadier, no flashes, no spin
}

/** Log-spaced bands from ~35 Hz to ~16 kHz, each 0..1. */
function bands(f: Frame, n: number): number[] {
  const nyq = f.sampleRate / 2;
  const binHz = nyq / f.freq.length;
  const lo = 35;
  const hi = Math.min(16000, nyq * 0.95);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f0 = lo * (hi / lo) ** (i / n);
    const f1 = lo * (hi / lo) ** ((i + 1) / n);
    let m = 0;
    if (f1 - f0 < binHz * 2) {
      // narrow band (the bass end): interpolate between bins so neighbouring
      // bars don't share one value and form flat steps
      const pos = Math.min(f.freq.length - 1.001, Math.sqrt(f0 * f1) / binHz);
      const k = Math.floor(pos);
      m = f.freq[k] + (f.freq[k + 1] - f.freq[k]) * (pos - k);
    } else {
      const b0 = Math.min(Math.floor(f0 / binHz), f.freq.length - 1);
      const b1 = Math.min(Math.floor(f1 / binHz), f.freq.length - 1);
      for (let b = b0; b <= b1; b++) m = Math.max(m, f.freq[b]);
    }
    // gentle tilt so the treble end isn't always empty
    const v = (m / 255) ** 1.25 * (1 + 0.35 * (i / n));
    out.push(Math.min(1, v));
  }
  return out;
}

function bass(f: Frame) {
  let s = 0;
  const binHz = f.sampleRate / 2 / f.freq.length;
  const n = Math.max(2, Math.round(160 / binHz));
  for (let b = 1; b <= n; b++) s += f.freq[b] ?? 0;
  return s / n / 255;
}

/** Track a running bass level and flag kicks for the (non-calm) flourishes. */
function beat(f: Frame, st: DrawState) {
  const b = bass(f);
  st.bassAvg = st.bassAvg * 0.94 + b * 0.06;
  const hit = b > 0.42 && b > st.bassAvg * 1.25 && f.now - st.lastBeat > 180;
  if (hit) st.lastBeat = f.now;
  st.flash = Math.max(0, st.flash - f.dt / 260);
  if (hit && !f.calm) st.flash = 1;
  return { level: b, hit };
}

function clear(ctx: CanvasRenderingContext2D, W: number, H: number, theme: Theme, st: DrawState) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  if (st.flash > 0) {
    // a soft glow on kicks, kept low so it never strobes
    ctx.globalAlpha = 0.08 * st.flash;
    ctx.fillStyle = theme.stops[0];
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// ---------- bars: stacked LED blocks with falling peak caps ----------

function drawBars(ctx: CanvasRenderingContext2D, W: number, H: number, f: Frame, st: DrawState, theme: Theme) {
  beat(f, st);
  clear(ctx, W, H, theme, st);
  const gap = 1;
  const barW = W >= 150 ? 4 : 3;
  const n = Math.max(12, Math.min(64, Math.floor((W - 4 + gap) / (barW + gap))));
  const v = bands(f, n);
  const x0 = Math.floor((W - (n * barW + (n - 1) * gap)) / 2);
  const bh = H > 90 ? 3 : 2;
  const unit = bh + 1;
  const rows = Math.max(4, Math.floor((H - 4) / unit));
  const base = H - 2;
  const colours = ramp(theme, rows);
  if (st.peaks.length !== n) {
    st.peaks = Array(n).fill(0);
    st.holds = Array(n).fill(0);
  }
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (barW + gap);
    const lit = Math.round(v[i] * rows);
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = r < lit ? colours[r] : theme.dim;
      ctx.fillRect(x, base - (r + 1) * unit + 1, barW, bh);
    }
    // peak caps hang for a moment, then fall
    if (lit >= st.peaks[i]) {
      st.peaks[i] = lit;
      st.holds[i] = f.now + (f.calm ? 120 : 380);
    } else if (f.now > st.holds[i]) {
      st.peaks[i] = Math.max(lit, st.peaks[i] - f.dt * (f.calm ? 0.012 : 0.03));
    }
    const pr = Math.round(st.peaks[i]);
    if (pr > 0) {
      ctx.fillStyle = theme.peak;
      ctx.fillRect(x, base - (pr + 1) * unit + 1, barW, Math.max(1, bh - 1));
    }
  }
}

// ---------- burst: a radial spray of pixel rays ----------

function pixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string, ring = false) {
  ctx.fillStyle = colour;
  const r2 = r * r;
  const inner = (r - 1.2) * (r - 1.2);
  for (let y = Math.floor(-r); y <= Math.ceil(r); y++) {
    for (let x = Math.floor(-r); x <= Math.ceil(r); x++) {
      const d = x * x + y * y;
      if (d <= r2 && (!ring || d >= inner)) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  }
}

function drawBurst(ctx: CanvasRenderingContext2D, W: number, H: number, f: Frame, st: DrawState, theme: Theme) {
  const { level, hit } = beat(f, st);
  clear(ctx, W, H, theme, st);
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const m = Math.min(W, H);
  const R0 = Math.max(5, Math.round(m * 0.16 * (f.calm ? 1 : 1 + level * 0.22)));
  const maxLen = m / 2 - R0 - 3;
  const half = Math.max(12, Math.min(32, Math.round(m / 5)));
  const v = bands(f, half);
  const N = half * 2;
  if (!f.calm) st.rot += f.dt * 0.00012 * (1 + level * 3);
  const colours = ramp(theme, 24);

  // starlight sparks thrown out on kicks
  if (hit && !f.calm) {
    for (let k = 0; k < 6; k++) st.sparks.push({ a: Math.random() * Math.PI * 2, r: R0 + maxLen * 0.6, born: f.now });
  }
  st.sparks = st.sparks.filter((s) => f.now - s.born < 700);
  for (const s of st.sparks) {
    const age = (f.now - s.born) / 700;
    const r = s.r + age * m * 0.25;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = theme.peak;
    ctx.fillRect(Math.round(cx + Math.cos(s.a) * r), Math.round(cy + Math.sin(s.a) * r), 1, 1);
  }
  ctx.globalAlpha = 1;

  for (let k = 0; k < N; k++) {
    const idx = k < half ? k : N - 1 - k; // mirror, so bass sits at the top and bottom
    const len = Math.min(1, v[idx] * 1.25) ** 0.9 * maxLen;
    const a = st.rot + (k / N) * Math.PI * 2 - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let d = 0; d <= len; d++) {
      const r = R0 + 2 + d;
      ctx.fillStyle = colours[Math.min(colours.length - 1, Math.floor((d / maxLen) * colours.length))];
      ctx.fillRect(Math.round(cx + ca * r), Math.round(cy + sa * r), 1, 1);
    }
    // a brighter tip
    if (len > 2) {
      const r = R0 + 2 + len;
      ctx.fillStyle = theme.peak;
      ctx.fillRect(Math.round(cx + ca * r), Math.round(cy + sa * r), 1, 1);
    }
  }
  pixelCircle(ctx, cx, cy, R0 - 2, theme.dim);
  pixelCircle(ctx, cx, cy, R0, theme.stops[1], true);
  pixelCircle(ctx, cx, cy, Math.max(2, Math.round((R0 - 4) * (0.35 + level * 0.65))), theme.stops[0]);
}

// ---------- scope: a phosphor oscilloscope ----------

function drawScope(ctx: CanvasRenderingContext2D, W: number, H: number, f: Frame, st: DrawState, theme: Theme) {
  beat(f, st);
  if (f.calm) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  } else {
    // leave a short phosphor trail
    ctx.fillStyle = 'rgba(7, 6, 15, 0.6)';
    ctx.fillRect(0, 0, W, H);
  }
  // graticule
  ctx.fillStyle = theme.dim;
  for (let x = 0; x < W; x += 8) for (let y = 0; y < H; y += 8) ctx.fillRect(x, y, 1, 1);
  const mid = Math.floor(H / 2);
  for (let x = 0; x < W; x += 2) ctx.fillRect(x, mid, 1, 1);

  const t = f.time;
  // trigger on a rising zero crossing so the wave stands still
  let start = 0;
  for (let i = 1; i < t.length / 2; i++) {
    if (t[i - 1] < 128 && t[i] >= 128) {
      start = i;
      break;
    }
  }
  const span = Math.min(t.length - start, Math.max(W * 3, 512));
  // auto-gain like a real scope, so quiet sources still fill the screen
  let peak = 0;
  for (let i = start; i < start + span; i++) peak = Math.max(peak, Math.abs(t[i] - 128) / 128);
  const target = Math.max(1, Math.min(6, 0.8 / Math.max(peak, 0.02)));
  st.scopeGain += (target - st.scopeGain) * Math.min(1, f.dt / (f.calm ? 600 : 250));
  const colours = ramp(theme, 16);
  let prev = mid;
  for (let x = 0; x < W; x++) {
    const s = t[start + Math.floor((x / W) * span)] ?? 128;
    const amp = Math.max(-1, Math.min(1, ((s - 128) / 128) * st.scopeGain));
    const y = Math.max(1, Math.min(H - 2, Math.round(mid + amp * H * 0.44)));
    const top = Math.min(prev, y);
    const h = Math.abs(prev - y) + 1;
    ctx.fillStyle = colours[Math.min(15, Math.floor(Math.abs(amp) * 1.4 * 15))];
    ctx.fillRect(x, top, 1, h);
    prev = y;
  }
}

export function draw(
  mode: Mode,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  f: Frame,
  st: DrawState,
  theme: Theme,
) {
  if (mode === 'bars') drawBars(ctx, W, H, f, st, theme);
  else if (mode === 'burst') drawBurst(ctx, W, H, f, st, theme);
  else drawScope(ctx, W, H, f, st, theme);
}
