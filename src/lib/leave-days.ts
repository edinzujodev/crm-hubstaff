/** Time-off rules that don't need the database, so forms in the browser can use them too. */
import { eachDay, isWeekend } from "@/lib/days";

export const TIME_OFF_KINDS = ["vacation", "sick", "personal", "unpaid", "religious"] as const;
export type TimeOffKind = (typeof TIME_OFF_KINDS)[number];
export type TimeOffStatus = "pending" | "approved" | "rejected" | "cancelled";

export const KIND_LABEL: Record<TimeOffKind, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
  personal: "Personal day",
  unpaid: "Unpaid leave",
  religious: "Religious holiday",
};

/** Colours per kind, for badges and the calendar (Tailwind classes that work in light and dark). */
export const KIND_TONE: Record<TimeOffKind, string> = {
  vacation: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  sick: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  personal: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  unpaid: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  religious: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

export const STATUS_LABEL: Record<TimeOffStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * What a status is called for a kind of time off. Sick leave is never approved: it is recorded and counts straight
 * away (stored as "approved" so it is counted like approved time off), so it reads "Recorded".
 */
export function statusLabel(kind: TimeOffKind | "out", status: TimeOffStatus): string {
  return kind === "sick" && status === "approved" ? "Recorded" : STATUS_LABEL[status];
}

/** Sick leave counts as soon as it is entered; everything else is asked for and approved. */
export const needsApproval = (kind: TimeOffKind) => kind !== "sick";

/** Days nobody can take off, set by a super admin. */
export type BlockedSpan = { startDate: string; endDate: string; reason: string };

/**
 * A worker's team as the request form shows it: who else is off when (approved or still waiting), and how many may
 * be off at once (null: no limit).
 */
export type TeamOff = {
  name: string;
  max: number | null;
  /** Everyone in the team, the worker included. */
  size: number;
  off: { name: string; startDate: string; endDate: string; pending: boolean }[];
};

/** Who of the team is off on each day, by date. Weekends and days off are left out. */
export function teamOffByDay(team: TeamOff, daysOff: Set<string>): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  for (const o of team.off) {
    for (const d of eachDay(o.startDate, o.endDate)) {
      if (isWeekend(d) || daysOff.has(d)) continue;
      const names = byDay.get(d) ?? [];
      if (!names.includes(o.name)) names.push(o.name);
      byDay.set(d, names);
    }
  }
  return byDay;
}

/** Blocked days stop time off that is planned; sick leave is recorded whatever the date. */
export const blockable = (kind: TimeOffKind) => kind !== "sick";

/** The first blocked period that touches the dates, if any. */
export function blockedClash(t: { startDate: string; endDate: string }, blocked: BlockedSpan[]): BlockedSpan | undefined {
  return blocked.find((b) => b.startDate <= t.endDate && b.endDate >= t.startDate);
}

type Span = { startDate: string; endDate: string; halfDay: boolean };

/** The working days of a span (weekends and days off skipped), optionally only those inside [from, to]. */
export function workingDays(t: Span, daysOff: Set<string>, from = t.startDate, to = t.endDate): string[] {
  const a = t.startDate > from ? t.startDate : from;
  const b = t.endDate < to ? t.endDate : to;
  if (a > b) return [];
  return eachDay(a, b).filter((d) => !isWeekend(d) && !daysOff.has(d));
}

/** How many leave days a span takes: working days only, a half day counts 0.5. */
export function countDays(t: Span, daysOff: Set<string>, from?: string, to?: string): number {
  const n = workingDays(t, daysOff, from, to).length;
  return t.halfDay ? n * 0.5 : n;
}
