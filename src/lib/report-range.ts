import { localDay } from "@/lib/format";
import type { TimeReportFilter } from "@/lib/time-report";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const shift = (day: string, days: number) => new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

/** Quick date ranges shown above the report. */
export function rangePresets(timeZone: string) {
  const today = localDay(new Date(), timeZone);
  const ym = today.slice(0, 7);
  const prev = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const weekday = (new Date(Date.parse(today)).getUTCDay() + 6) % 7; // Monday = 0
  return [
    { label: "This week", from: shift(today, -weekday), to: shift(today, 6 - weekday) },
    { label: "Last 7 days", from: shift(today, -6), to: today },
    { label: "This month", ...monthBounds(ym) },
    { label: "Last month", ...monthBounds(prev) },
    { label: "Last 30 days", from: shift(today, -29), to: today },
  ];
}

type Params = { [key: string]: string | string[] | undefined };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const id = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Reads from/to/client/user from the URL; defaults to this month. */
export function parseReportParams(sp: Params, timeZone: string): TimeReportFilter {
  const month = monthBounds(localDay(new Date(), timeZone).slice(0, 7));
  let from = one(sp.from) && DATE.test(one(sp.from)!) ? one(sp.from)! : month.from;
  let to = one(sp.to) && DATE.test(one(sp.to)!) ? one(sp.to)! : month.to;
  if (from > to) [from, to] = [to, from];
  return { from, to, timeZone, clientId: id(sp.client), userId: id(sp.user), teamId: id(sp.team) };
}

export function reportQuery(f: Pick<TimeReportFilter, "from" | "to" | "clientId" | "userId" | "teamId">) {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.clientId) q.set("client", String(f.clientId));
  if (f.userId) q.set("user", String(f.userId));
  if (f.teamId) q.set("team", String(f.teamId));
  return q.toString();
}
