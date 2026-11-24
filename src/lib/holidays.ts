import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, ymd } from "@/lib/days";

export type HolidayEntry = {
  date: string;
  name: string;
  /** A day off for everyone: skipped when counting leave. Religious holidays are only shown (people book them). */
  dayOff: boolean;
  source: "built-in" | "custom";
  /** The holidays row, for custom ones. */
  id?: number;
};

/** Western (Gregorian) Easter Sunday. */
function westernEaster(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return ymd(y, Math.floor(n / 31), (n % 31) + 1);
}

/** Orthodox Easter Sunday: the Julian date, moved to the Gregorian calendar (13 days, right for 1900–2099). */
function orthodoxEaster(y: number) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const n = d + e + 114;
  return addDays(ymd(y, Math.floor(n / 31), (n % 31) + 1), 13);
}

/**
 * Ramazanski and Kurban Bajram follow the lunar calendar and are announced by the Islamic Community each year, so
 * they can't be calculated reliably. These are the expected dates; a super admin can correct them on the Holidays
 * tab (hide the built-in one, add the right date) and add later years.
 */
const BAJRAM: Record<number, [string, string]> = {
  2026: ["2026-03-20", "2026-05-27"],
  2027: ["2027-03-10", "2027-05-17"],
};

/**
 * The built-in list: the public holidays of the Federation of BiH (days off for everyone), and the main religious
 * holidays, shown on the calendar so people can book the ones they celebrate.
 */
export function builtInHolidays(year: number): Omit<HolidayEntry, "source">[] {
  const off = (m: number, d: number, name: string) => ({ date: ymd(year, m, d), name, dayOff: true });
  const rel = (date: string, name: string) => ({ date, name, dayOff: false });
  const easter = westernEaster(year);
  const orthodox = orthodoxEaster(year);
  const list = [
    off(1, 1, "New Year's Day"),
    off(1, 2, "New Year's Day (second day)"),
    off(3, 1, "Independence Day"),
    off(5, 1, "Labour Day"),
    off(5, 2, "Labour Day (second day)"),
    off(11, 25, "Statehood Day"),
    rel(ymd(year, 1, 7), "Orthodox Christmas"),
    rel(addDays(orthodox, -2), "Orthodox Good Friday"),
    rel(addDays(orthodox, 1), "Orthodox Easter Monday"),
    rel(addDays(easter, 1), "Catholic Easter Monday"),
    rel(ymd(year, 11, 1), "All Saints' Day"),
    rel(ymd(year, 12, 25), "Catholic Christmas"),
  ];
  const bajram = BAJRAM[year];
  if (bajram) list.push(rel(bajram[0], "Ramazanski Bajram"), rel(bajram[1], "Kurban Bajram"));
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Every holiday from `from` to `to`: the built-in ones minus those a super admin hid, plus the custom ones. */
export async function holidaysBetween(from: string, to: string): Promise<HolidayEntry[]> {
  const rows = await db
    .select()
    .from(schema.holidays)
    .where(and(gte(schema.holidays.date, from), lte(schema.holidays.date, to)));
  const hidden = new Set(rows.filter((r) => r.source === "hidden").map((r) => `${r.date}|${r.name}`));
  const out: HolidayEntry[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of builtInHolidays(y)) {
      if (h.date >= from && h.date <= to && !hidden.has(`${h.date}|${h.name}`)) out.push({ ...h, source: "built-in" });
    }
  }
  for (const r of rows) {
    if (r.source === "custom") out.push({ date: r.date, name: r.name, dayOff: r.dayOff, source: "custom", id: r.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The days off for everyone from `from` to `to`. */
export async function daysOffBetween(from: string, to: string): Promise<Set<string>> {
  return new Set((await holidaysBetween(from, to)).filter((h) => h.dayOff).map((h) => h.date));
}
