// Month arithmetic for the Experience timeline.
//
// Roles store a start month and an optional end month as 'YYYY-MM'. A role with no
// end is ongoing: it is measured up to the current month in the visitor's browser,
// so "Present" durations stay correct without a rebuild or redeploy.

/** A calendar month written 'YYYY-MM', e.g. '2024-06'. */
export type YearMonth = `${number}-${number}`;

export interface DateSpan {
  start: YearMonth;
  end?: YearMonth; // omit while the role is ongoing
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Months counted from year 0, so two months subtract into a month count.
function toIndex(value: YearMonth): number {
  const [year, month] = value.split('-').map(Number);
  return year * 12 + (month - 1);
}

function currentIndex(): number {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

function monthLabel(index: number): string {
  return `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;
}

/** "1 mo", "8 mos", "1 yr", "2 yrs 6 mos". */
export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

// Counts both the first and the last month, as LinkedIn does: May to Aug is 4 months.
// Never less than 1, so a role starting this month still reads "1 mo".
function inclusiveMonths(startIndex: number, endIndex: number): number {
  return Math.max(1, endIndex - startIndex + 1);
}

/** "Jun 2024 – Present · 2 yrs 6 mos", or "May 2022 · 1 mo" for a single month. */
export function formatSpan({ start, end }: DateSpan): string {
  const s = toIndex(start);
  const e = end ? toIndex(end) : currentIndex();
  const range =
    end === start ? monthLabel(s) : `${monthLabel(s)} – ${end ? monthLabel(e) : 'Present'}`;
  return `${range} · ${formatDuration(inclusiveMonths(s, e))}`;
}

/** Earliest start to latest end across several roles, e.g. "5 yrs 5 mos". */
export function formatTotal(spans: DateSpan[]): string {
  const starts = spans.map((span) => toIndex(span.start));
  const ends = spans.map((span) => (span.end ? toIndex(span.end) : currentIndex()));
  return formatDuration(inclusiveMonths(Math.min(...starts), Math.max(...ends)));
}
