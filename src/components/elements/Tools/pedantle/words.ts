// Turning an article into guessable words, and a guess into the words it reveals.
import { semanticMap } from './semanticMap';

/** One piece of a line of text: a guessable word, or the spaces/punctuation between words. */
export type Segment =
  | { kind: 'word'; text: string; key: string; id: number }
  | { kind: 'gap'; text: string };

export interface ParsedArticle {
  title: Segment[];
  paragraphs: Segment[][];
  /** how often each key appears across the title and the body */
  counts: Map<string, number>;
  /** keys of the words in the title (the win condition) */
  titleKeys: string[];
  totalWords: number;
}

// A word is a run of letters (any script, with accents) or digits. Inner
// apostrophes stay inside ("Woodfull's", "don't") and numbers keep their
// separators ("1,000", "3.5"). Everything else is shown as-is between words.
// Unicode-aware on purpose: the old \w / \b split broke "Zürich" into Z + ü + rich.
const WORD_RE = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const NUMBER_RE = /^\p{N}+(?:[.,]\p{N}+)+$/u;

/** Lower-case, accent-free, straight apostrophes: "Zürich" and "zurich" match. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'");
}

/** The matching key for a word: "Woodfull's" → "woodfull", "1,000" → "1000". */
export function keyOf(word: string): string {
  let k = fold(word);
  if (NUMBER_RE.test(k)) k = k.replace(/,/g, '');
  return k.replace(/'s$/, '');
}

function tokenize(text: string, nextId: () => number): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'gap', text: text.slice(last, at) });
    out.push({ kind: 'word', text: m[0], key: keyOf(m[0]), id: nextId() });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'gap', text: text.slice(last) });
  return out;
}

/** Parse the extract HTML once. DOMParser builds an inert document, so nothing in it loads or runs. */
export function parseArticle(title: string, html: string): ParsedArticle {
  let id = 0;
  const nextId = () => id++;
  const titleSegs = tokenize(title, nextId);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs: Segment[][] = [];
  doc.querySelectorAll('p').forEach((p) => {
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
    // keep real paragraphs only (same rule as before: at least 20 words)
    if (text.split(' ').length < 20) return;
    paragraphs.push(tokenize(text, nextId));
  });

  const counts = new Map<string, number>();
  let totalWords = 0;
  for (const seg of [...titleSegs, ...paragraphs.flat()]) {
    if (seg.kind !== 'word') continue;
    counts.set(seg.key, (counts.get(seg.key) ?? 0) + 1);
    totalWords++;
  }
  const titleKeys = [...new Set(titleSegs.flatMap((s) => (s.kind === 'word' ? [s.key] : [])))];
  return { title: titleSegs, paragraphs, counts, titleKeys, totalWords };
}

export type GuessCheck = { ok: true; key: string } | { ok: false; reason: string };

/** Clean up what the player typed. Exactly one word is allowed. */
export function normalizeGuess(raw: string): GuessCheck {
  const t = raw.trim();
  if (!t) return { ok: false, reason: '' };
  const words = t.match(WORD_RE);
  if (!words) return { ok: false, reason: 'Letters and numbers only.' };
  if (words.length > 1 || /\s/.test(t)) return { ok: false, reason: 'One word at a time.' };
  return { ok: true, key: keyOf(words[0]) };
}

/**
 * Every key a guess reveals: the word itself, its rough English plural or
 * singular, and the semanticMap partners (he → she, they).
 * Very short words only match themselves, so "as" no longer reveals every
 * "a", "a" no longer reveals "as", and "i" no longer reveals "is".
 */
export function formsOf(key: string): string[] {
  const forms = new Set([key]);
  for (const w of semanticMap[key] ?? []) forms.add(w);
  if (key.length >= 3) {
    // singular → plural
    if (/(?:s|x|z|ch|sh)$/.test(key)) forms.add(key + 'es');
    else if (/[^aeiou]y$/.test(key)) forms.add(key.slice(0, -1) + 'ies');
    else forms.add(key + 's');
  }
  if (key.length >= 4) {
    // plural → singular
    if (key.endsWith('ies')) forms.add(key.slice(0, -3) + 'y');
    if (key.length >= 5 && /(?:s|x|z|ch|sh)es$/.test(key)) forms.add(key.slice(0, -2));
    if (key.endsWith('s') && !key.endsWith('ss')) forms.add(key.slice(0, -1));
  }
  return [...forms];
}

/** How many words in the article a guess uncovers. */
export function hitsFor(key: string, counts: Map<string, number>): number {
  return formsOf(key).reduce((n, f) => n + (counts.get(f) ?? 0), 0);
}
