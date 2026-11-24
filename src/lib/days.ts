/** Calendar days as "yyyy-mm-dd" strings. All math is done in UTC so a day is never shifted by the time zone. */

export const toUtc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};

export const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export const ymd = (y: number, m: number, d: number) => fromUtc(new Date(Date.UTC(y, m - 1, d)));

export function addDays(day: string, n: number) {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (day: string) => toUtc(day).getUTCDay();

export const isWeekend = (day: string) => {
  const w = weekday(day);
  return w === 0 || w === 6;
};

/** Every day from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && fromUtc(toUtc(v)) === v;

/** "2026-11" for a day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** First and last day of a "yyyy-mm" month. */
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { first: ymd(y!, m!, 1), last: ymd(y!, m! + 1, 0) };
}

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return ymd(y!, m! + n, 1).slice(0, 7);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });

/** "3 Mar 2026" */
export const fmtLongDay = (day: string) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(toUtc(day));
/** "Tue 3 Mar" */
export const fmtShortDay = (day: string) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(toUtc(day));
/** "November 2026" */
export const fmtMonth = (month: string) => fmt({ month: "long", year: "numeric" }).format(toUtc(`${month}-01`));

/** "3–7 Mar 2026", "28 Feb – 3 Mar 2026" or one day. */
export function fmtRange(from: string, to: string) {
  if (from === to) return fmtLongDay(from);
  const [a, b] = [toUtc(from), toUtc(to)];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${fmtLongDay(from)} – ${fmtLongDay(to)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${fmt({ day: "numeric", month: "short" }).format(a)} – ${fmtLongDay(to)}`;
  return `${a.getUTCDate()}–${fmtLongDay(to)}`;
}

/** "1 day", "2.5 days" */
export const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
