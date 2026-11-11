// When a copy made by a repeating task shows up in the open lists. Pure functions, usable on the client.

export type RepeatShow = "days_before" | "week_start" | "month_start" | "due_day";
type Repeat = "weekly" | "monthly";

export const REPEAT_SHOW_OPTIONS: Record<Repeat, RepeatShow[]> = {
  weekly: ["days_before", "week_start", "due_day"],
  monthly: ["days_before", "month_start", "week_start", "due_day"],
};

export const REPEAT_SHOW_LABEL: Record<RepeatShow, string> = {
  days_before: "Some days before it is due",
  week_start: "At the start of the week it is due (Monday)",
  month_start: "On the 1st of the month it is due",
  due_day: "On the day it is due",
};

/** Days before the due date a copy appears when the user didn't choose. */
export const defaultLead = (repeat: Repeat) => (repeat === "weekly" ? 2 : 7);

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The first day a copy due on `due` (`YYYY-MM-DD`) appears in the open lists. */
export function showFrom(due: string, show: RepeatShow, leadDays: number | null, repeat: Repeat): string {
  const t = Date.parse(due);
  switch (show) {
    case "week_start":
      return iso(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS); // Monday
    case "month_start":
      return `${due.slice(0, 7)}-01`;
    case "due_day":
      return due;
    default:
      return iso(t - (leadDays ?? defaultLead(repeat)) * DAY_MS);
  }
}
