export type Urgency = "on_track" | "approaching" | "critical";

/** Hours until a task is due below which it is "approaching" / "critical". Set per team by its leader. */
export type Levels = { approachingHours: number; criticalHours: number };

export const DEFAULT_LEVELS: Levels = { approachingHours: 72, criticalHours: 24 };

export const URGENCY_LABEL: Record<Urgency, string> = {
  on_track: "On track",
  approaching: "Approaching",
  critical: "Critical",
};

/** Higher is more urgent. */
export const URGENCY_RANK: Record<Urgency, number> = { on_track: 0, approaching: 1, critical: 2 };

/** Badge colours (border and text), matching the app's amber/red warnings. */
export const URGENCY_CLASS: Record<Urgency, string> = {
  on_track: "border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
  approaching: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  critical: "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400",
};

/** The current wall-clock time in `timeZone`, expressed as a UTC timestamp, so it can be compared with a date. */
function localNowAsUtc(now: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Hours left until the end of the due day (negative once overdue). A due date has no time, so the day counts in full. */
export function hoursUntilDue(dueDate: string, timeZone: string, now = new Date()): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const endOfDay = Date.UTC(y, m - 1, d + 1);
  return (endOfDay - localNowAsUtc(now, timeZone)) / 3_600_000;
}

/**
 * On track, approaching or critical. Overdue counts as critical. A task that is done has no urgency (null);
 * a task without a due date is on track.
 */
export function urgencyOf(
  task: { status: "todo" | "in_progress" | "done"; dueDate: string | null },
  levels: Levels,
  timeZone: string,
  now = new Date(),
): Urgency | null {
  if (task.status === "done") return null;
  if (!task.dueDate) return "on_track";
  const hours = hoursUntilDue(task.dueDate, timeZone, now);
  if (hours < levels.criticalHours) return "critical";
  if (hours < levels.approachingHours) return "approaching";
  return "on_track";
}

/** "Overdue 2d", "5h left", "2d 4h left". */
export function timeLeftLabel(dueDate: string, timeZone: string, now = new Date()): string {
  const hours = hoursUntilDue(dueDate, timeZone, now);
  const abs = Math.abs(hours);
  const days = Math.floor(abs / 24);
  const h = Math.floor(abs % 24);
  const text = days > 0 ? (h > 0 && days < 3 ? `${days}d ${h}h` : `${days}d`) : `${Math.max(1, h)}h`;
  return hours < 0 ? `Overdue ${text}` : `${text} left`;
}
