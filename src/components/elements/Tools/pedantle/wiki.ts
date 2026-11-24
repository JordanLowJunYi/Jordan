// Wikipedia API calls. Every request is CORS-enabled with origin=*.
const API = 'https://en.wikipedia.org/w/api.php';

export interface WikiPage {
  title: string;
  html: string;
  url: string;
}

async function query(params: Record<string, string>, signal?: AbortSignal) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
  const res = await fetch(`${API}?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}.`);
  return res.json();
}

/** Featured-article titles, in the category's own (alphabetical) order. */
async function featuredTitles(limit: number, signal?: AbortSignal): Promise<string[]> {
  const data = await query(
    { list: 'categorymembers', cmtitle: 'Category:Featured_articles', cmlimit: String(limit) },
    signal,
  );
  const members = data?.query?.categorymembers as { title?: unknown }[] | undefined;
  const titles = (members ?? []).map((m) => m.title).filter((t): t is string => typeof t === 'string');
  if (titles.length === 0) throw new Error('No featured articles came back.');
  return titles;
}

/** Day of the year in local time: 1 on 1 January. */
export function dayOfYear(now = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff =
    now.getTime() - start.getTime() + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** "2026-11-24" in local time, used to tell today's saves from older ones. */
export function todayKey(now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Today's article: the same pick as before, the Nth of the first 366 featured articles. */
export async function dailyTitle(signal?: AbortSignal): Promise<string> {
  const titles = await featuredTitles(366, signal);
  return titles[(dayOfYear() - 1) % titles.length];
}

/** A random featured article from outside the daily pool (entries 367 to 500). */
export async function randomTitle(avoid: string | undefined, signal?: AbortSignal): Promise<string> {
  const titles = (await featuredTitles(500, signal)).slice(366).filter((t) => t !== avoid);
  if (titles.length === 0) throw new Error('No extra articles are available right now.');
  return titles[Math.floor(Math.random() * titles.length)];
}

export async function fetchPage(title: string, signal?: AbortSignal): Promise<WikiPage> {
  const data = await query({ prop: 'extracts|info', inprop: 'url', titles: title, redirects: '1' }, signal);
  const page = data?.query?.pages?.[0];
  // Never put the title in an error: it is the answer.
  if (!page || page.missing || typeof page.extract !== 'string' || !page.extract.trim()) {
    throw new Error('That article came back empty.');
  }
  return { title: String(page.title), html: page.extract, url: String(page.fullurl) };
}
