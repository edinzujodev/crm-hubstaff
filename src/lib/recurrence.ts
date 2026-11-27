/** Repeating events: which days an event happens on. No database here, so the form can describe a repeat too. */
import { addDays, dmy, eachDay, toUtc, weekday, ymd } from "@/lib/days";

export const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Doesn't repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Monday first, as on the calendar. Values are JavaScript weekdays (0 = Sunday). */
export const WEEKDAY_CHIPS = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 0, short: "Sun", long: "Sunday" },
];

export type RepeatRule = {
  startDate: string;
  endDate: string;
  repeat: Repeat;
  repeatDays: number[] | null;
  repeatUntil: string | null;
};

const lastDayOfMonth = (y: number, m: number) => Number(ymd(y, m + 1, 0).slice(8));

/** Whether a repeat of the event starts on `day`. */
function startsOn(rule: RepeatRule, day: string): boolean {
  if (day < rule.startDate || (rule.repeatUntil && day > rule.repeatUntil)) return false;
  const d = toUtc(day);
  const first = toUtc(rule.startDate);
  switch (rule.repeat) {
    case "none":
      return day === rule.startDate;
    case "daily":
      return !rule.repeatDays?.length || rule.repeatDays.includes(weekday(day));
    case "weekly":
      return (rule.repeatDays?.length ? rule.repeatDays : [weekday(rule.startDate)]).includes(weekday(day));
    case "monthly": {
      // The 31st falls on the last day of shorter months.
      const want = Math.min(first.getUTCDate(), lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1));
      return d.getUTCDate() === want;
    }
    case "yearly": {
      if (d.getUTCMonth() !== first.getUTCMonth()) return false;
      // 29 February falls on the 28th in other years.
      const want = Math.min(first.getUTCDate(), lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1));
      return d.getUTCDate() === want;
    }
  }
}

/** Every time the event happens that touches [from, to]: its first and last day each time. */
export function occurrences(rule: RepeatRule, from: string, to: string): { start: string; end: string }[] {
  const length = Math.round((toUtc(rule.endDate).getTime() - toUtc(rule.startDate).getTime()) / 86_400_000);
  // A repeat that started a few days before `from` may still be going on.
  const lo = addDays(from, -length) > rule.startDate ? addDays(from, -length) : rule.startDate;
  if (lo > to) return [];
  return eachDay(lo, to)
    .filter((d) => startsOn(rule, d))
    .map((start) => ({ start, end: addDays(start, length) }));
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

const dayList = (days: number[]) => {
  const names = WEEKDAY_CHIPS.filter((c) => days.includes(c.day)).map((c) => c.long);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
};

/** "Every Monday and Friday", "Monthly on the 15th", "Every year on 24 November", or null for a one-off. */
export function describeRepeat(rule: Omit<RepeatRule, "endDate">): string | null {
  if (rule.repeat === "none" || !rule.startDate) return null;
  const d = toUtc(rule.startDate);
  const days = rule.repeatDays ?? [];
  let text: string;
  if (rule.repeat === "daily") {
    const workdays = days.length === 5 && [1, 2, 3, 4, 5].every((x) => days.includes(x));
    text = !days.length || days.length === 7 ? "Every day" : workdays ? "Every working day" : `Every ${dayList(days)}`;
  } else if (rule.repeat === "weekly") {
    text = `Every ${dayList(days.length ? days : [d.getUTCDay()])}`;
  } else if (rule.repeat === "monthly") {
    text = `Monthly on the ${ordinal(d.getUTCDate())}${d.getUTCDate() > 28 ? " (or the last day)" : ""}`;
  } else {
    text = `Every year on ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long" }).format(d)}`;
  }
  if (rule.repeatUntil) {
    text += `, until ${dmy(rule.repeatUntil)}`;
  }
  return text;
}
